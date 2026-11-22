// Firebase の Cloud Functions：写真をAIに読ませる窓口（/api/health と /api/analyze）。
// Hosting の書き換え（firebase.json）で、同じドメインの /api/** がここに来る。
// ⚠️ 鍵（OPENAI_API_KEY）と、許可する家族のアドレス（ALLOWED_EMAILS）は Secret Manager に置く。リポジトリには書かない。

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { analyzeImage, cacheKey, type SpecCache } from '../../server/analyze';

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const ALLOWED_EMAILS = defineSecret('ALLOWED_EMAILS'); // カンマ区切り
const MODEL = process.env.GAME_MODEL || 'gpt-6-luna';
const DAILY_LIMIT = 30; // 一人が一日に写真から作れる回数（料金の歯止め）

initializeApp();
const db = getFirestore();

const cache: SpecCache = {
  async get(hash) {
    const d = await db.collection('specs').doc(hash).get();
    return d.exists ? d.data()?.spec ?? null : null;
  },
  async set(hash, spec) {
    await db.collection('specs').doc(hash).set({ spec, createdAt: FieldValue.serverTimestamp() });
  },
};

function allowed(email: string | undefined) {
  if (!email) return false;
  const list = ALLOWED_EMAILS.value()
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

// 一日の回数を数える（日本時間の日付ごと）。上限を超えたら false
async function countUp(uid: string) {
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const ref = db.collection('usage').doc(`${uid}_${day}`);
  return db.runTransaction(async (tx) => {
    const n = ((await tx.get(ref)).data()?.count as number | undefined) ?? 0;
    if (n >= DAILY_LIMIT) return false;
    tx.set(ref, { count: n + 1, day }, { merge: true });
    return true;
  });
}

export const api = onRequest(
  {
    region: 'asia-northeast1',
    secrets: [OPENAI_API_KEY, ALLOWED_EMAILS],
    timeoutSeconds: 120,
    memory: '512MiB',
    maxInstances: 3,
  },
  async (req, res) => {
    if (req.path.endsWith('/health')) {
      res.json({ ai: true, model: MODEL, auth: true });
      return;
    }
    if (!req.path.endsWith('/analyze')) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only' });
      return;
    }

    // ログインと、家族の許可を確かめる
    const token = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) {
      res.status(401).json({ error: 'login required' });
      return;
    }
    let user;
    try {
      user = await getAuth().verifyIdToken(token);
    } catch {
      res.status(401).json({ error: 'login required' });
      return;
    }
    if (!user.email_verified || !allowed(user.email)) {
      res.status(403).json({ error: 'not allowed' });
      return;
    }

    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const image = String(body?.image ?? '');
      const hash = String(body?.hash ?? '');
      // 取っておいたものがあれば、回数に数えずに返す
      const hit = /^[a-f0-9]{64}$/.test(hash) ? await cache.get(cacheKey(hash)).catch(() => null) : null;
      if (!hit && !(await countUp(user.uid))) {
        res.status(429).json({ error: 'daily limit' });
        return;
      }
      const result = await analyzeImage(image, hash, { apiKey: OPENAI_API_KEY.value(), model: MODEL, cache });
      console.log(`[analyze] ${result.spec.motif} → ${result.spec.name}（${result.model}）`);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message).slice(0, 200) });
    }
  },
);
