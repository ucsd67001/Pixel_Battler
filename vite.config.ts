import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeImage, type SpecCache } from './server/analyze';

// 鍵を探す：① .env の OPENAI_API_KEY ② .env の KEY_ENV_FILE が指す別のファイルの OPENAI_API_KEY
// ⚠️ 鍵は表示しない
function readKey(env: Record<string, string>): string | undefined {
  if (env.OPENAI_API_KEY) return env.OPENAI_API_KEY.trim();
  const file = env.KEY_ENV_FILE;
  if (!file || !fs.existsSync(file)) return undefined;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(.*?)\s*$/);
    if (m) return m[1].replace(/^['"]|['"]$/g, '');
  }
  return undefined;
}

function readBody(req: Connect.IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function apiPlugin(env: Record<string, string>): Plugin {
  const apiKey = readKey(env);
  const model = env.GAME_MODEL || 'gpt-6-luna';
  const cacheDir = path.resolve(process.cwd(), '.cache/specs');
  // 手元では、設計図をファイルに取っておく
  const cache: SpecCache = {
    async get(hash) {
      const f = path.join(cacheDir, `${hash}.json`);
      return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
    },
    async set(hash, spec) {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, `${hash}.json`), JSON.stringify(spec, null, 2), 'utf8');
    },
  };

  const send = (res: any, status: number, data: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  };

  const health: Connect.NextHandleFunction = (_req, res) => send(res, 200, { ai: !!apiKey, model, auth: false });

  const analyze: Connect.NextHandleFunction = async (req, res) => {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    if (!apiKey) return send(res, 503, { error: 'no api key' });
    try {
      const body = JSON.parse(await readBody(req, 6 * 1024 * 1024));
      const result = await analyzeImage(String(body.image ?? ''), String(body.hash ?? ''), {
        apiKey,
        model,
        cache,
      });
      console.log(`[analyze] ${result.spec.motif} → ${result.spec.name}（${result.model}）`);
      send(res, 200, result);
    } catch (e) {
      send(res, 500, { error: String((e as Error).message).slice(0, 200) });
    }
  };

  const mount = (m: Connect.Server) => {
    m.use('/api/health', health);
    m.use('/api/analyze', analyze);
  };

  return {
    name: 'pixel-battler-api',
    configureServer(server) {
      console.log(apiKey ? `[api] 鍵あり・モデル ${model}` : '[api] 鍵が見つからない（写真の色だけで作る）');
      mount(server.middlewares);
    },
    configurePreviewServer(server) {
      mount(server.middlewares);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), apiPlugin(env)],
    server: { port: 5180 },
  };
});
