import type { CharacterSpec } from '../game/types';
import { sanitizeSpec } from '../game/spec';
import { idToken } from './firebase';

// auth＝写真から作るのにログインが要るか（Firebase の上では true、手元では false）
export interface Health {
  ai: boolean;
  model: string;
  auth: boolean;
}

export async function checkHealth(): Promise<Health> {
  try {
    const r = await fetch('/api/health');
    if (!r.ok) return { ai: false, model: '', auth: false };
    return await r.json();
  } catch {
    return { ai: false, model: '', auth: false };
  }
}

// ログインや許可の問題で作れなかったとき（色だけで作る予備の道に回さない）
export class AccessError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function analyze(image: string, hash: string): Promise<{ spec: CharacterSpec; model: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = await idToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers,
      body: JSON.stringify({ image, hash }),
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) throw new AccessError(401, 'Google でログインしてください。');
    if (r.status === 403) throw new AccessError(403, 'このアカウントでは、写真から作れません（メールアドレスの確認が済んだ Google アカウントが要ります）。');
    if (r.status === 429)
      throw new AccessError(
        429,
        data?.error === 'everyone limit'
          ? '今日は、みんなの分の回数がいっぱいになりました。また明日どうぞ。'
          : `今日の分（一日${data?.limit ?? ''}回）を使い切りました。また明日どうぞ。`,
      );
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    return { spec: sanitizeSpec(data.spec), model: data.model };
  } finally {
    clearTimeout(timer);
  }
}
