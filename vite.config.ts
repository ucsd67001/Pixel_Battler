import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeImage, refreshText, type SpecCache } from './server/analyze';
import { sanitizeSpec } from './src/game/spec';
import { toRival } from './server/rival';
import { buildRanking, type RawPlayer, type RawRobot } from './src/game/ranking';
import { createHash } from 'node:crypto';

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
        hiddenRule: env.HIDDEN_RULE, // 手元で試すときだけ（.env か、起動するときの環境変数）
      });
      console.log(`[analyze] ${result.spec.motif} → ${result.spec.name}（${result.model}）`);
      send(res, 200, result);
    } catch (e) {
      send(res, 500, { error: String((e as Error).message).slice(0, 200) });
    }
  };

  // 手元のガレージ（このスマホの中）のロボの文から、習わない漢字を取りのぞく。設計図を受け取り、直した設計図を返す
  const fixText: Connect.NextHandleFunction = async (req, res) => {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    if (!apiKey) return send(res, 503, { error: 'no api key' });
    try {
      const body = JSON.parse(await readBody(req, 64 * 1024));
      const spec = await refreshText(sanitizeSpec(body.spec), { apiKey, model });
      send(res, 200, { spec });
    } catch (e) {
      send(res, 500, { error: String((e as Error).message).slice(0, 200) });
    }
  };

  // ほかの人のロボを敵に出すしくみを、手元で試すため：取り置きの設計図から一体を選んで返す
  const rival: Connect.NextHandleFunction = (req, res) => {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    const files = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir).filter((f) => f.endsWith('.json')) : [];
    if (!files.length) return send(res, 200, { robot: null });
    const f = files[Math.floor(Math.random() * files.length)];
    const spec = JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf8'));
    const seed = createHash('sha256').update(f).digest('hex');
    send(res, 200, { robot: toRival({ seed, spec }) });
  };

  // ランキングの画面を手元で試すため：取り置きの設計図から、見本のランキングを作って返す（数はでたらめ。本番は /api/ranking）
  const ranking: Connect.NextHandleFunction = (req, res) => {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    const files = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir).filter((f) => f.endsWith('.json')).slice(0, 25) : [];
    const names = ['ロボマスター', 'たろう☆', 'ねこパンチ', 'ほしぞら', 'Robo12', 'かぜのこ', 'はやて', 'ミライ'];
    const players: RawPlayer[] = names.map((nickname, i) => ({
      uid: i === 0 ? 'me' : `p${i}`,
      nickname,
      cpuWins: (i * 7) % 23,
      roomWins: (i * 3) % 5,
      cleared: (i * 5) % 9,
      next: i % 4,
      storyAt: i,
    }));
    players.push({ uid: 'nonick', nickname: '', cpuWins: 99, roomWins: 9, cleared: 9, next: 0, storyAt: 0 }); // ニックネームが無い人は出ない
    const robots: RawRobot[] = [];
    files.forEach((f, i) => {
      const seed = createHash('sha256').update(f).digest('hex');
      const shown = toRival({ seed, spec: JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf8')) });
      if (!shown) return;
      robots.push({
        uid: i % 4 === 0 ? 'me' : i % 3 === 0 ? 'nonick' : `p${(i % 7) + 1}`,
        key: f,
        name: shown.spec.name,
        element: shown.spec.element,
        rank: shown.rank,
        level: 1 + ((i * 11) % 30),
        exp: i,
        cpuWins: (i * 5) % 17,
        roomWins: (i * 2) % 6,
        spec: shown.spec,
      });
    });
    send(res, 200, buildRanking(players, robots, 'me'));
  };

  const mount = (m: Connect.Server) => {
    m.use('/api/health', health);
    m.use('/api/analyze', analyze);
    m.use('/api/fix-text', fixText);
    m.use('/api/rival', rival);
    m.use('/api/ranking', ranking);
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
    build: {
      // 変わりにくい部品（3D・Firebase・React）を、ゲームのコードと別のファイルにする。
      // ゲームを出し直しても、こちらはブラウザに残っているものが使えるので、2回目からの読みこみが軽い
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/three/')) return 'three';
            if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase';
            return 'vendor';
          },
        },
      },
      chunkSizeWarningLimit: 800,
    },
  };
});
