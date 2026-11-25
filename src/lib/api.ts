import type { CharacterSpec } from '../game/types';
import { sanitizeSpec } from '../game/spec';
import { idToken } from './firebase';
import { garageFullMsg } from '../game/storage';
import type { Item } from '../game/items';

// auth＝写真から作るのにログインが要るか（Firebase の上では true、手元では false）
export interface Health {
  ai: boolean;
  model: string;
  auth: boolean;
}

const NO_HEALTH: Health = { ai: false, model: '', auth: false };
let health: Promise<Health> | null = null;

/** サーバーの様子を聞く。答えがもらえたら、それをおぼえておく（写真から作る画面を開くたびに待たせないように） */
export function checkHealth(): Promise<Health> {
  health ??= (async () => {
    try {
      const r = await fetch('/api/health');
      if (r.ok) return (await r.json()) as Health;
    } catch {
      // つながらないとき
    }
    health = null; // 聞けなかったら、次にまた聞く
    return NO_HEALTH;
  })();
  return health;
}

/**
 * サーバーの窓口に POST する。ログインしていれば、その印（ID トークン）を付ける。
 * needLogin のときは、ログインしていなければ送らずに失敗にする
 */
export async function postApi(
  path: string,
  body?: unknown,
  opt: { needLogin?: boolean; signal?: AbortSignal } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = await idToken().catch(() => null);
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (opt.needLogin) throw new Error('login required');
  return fetch(path, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: opt.signal,
  });
}

// ログインや許可の問題で作れなかったとき（色だけで作る予備の道に回さない）
export class AccessError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** ログインや回数の上限で、写真から作れなかったときの文（ロボとアイテムで同じ） */
function accessError(status: number, data: any, fullMsg: string): AccessError | null {
  if (status === 401) return new AccessError(401, 'Google でログインしてください。');
  if (status === 403) return new AccessError(403, 'このアカウントでは、写真から作れません（メールアドレスの確認が済んだ Google アカウントが要ります）。');
  if (status === 409) return new AccessError(409, fullMsg);
  if (status === 429)
    return new AccessError(
      429,
      data?.error === 'everyone limit'
        ? '今日は、みんなの分の回数がいっぱいになりました。また明日どうぞ。'
        : `今日の分（一日${data?.limit ?? ''}回。ロボとアイテムを合わせて）を使い切りました。また明日どうぞ。`,
    );
  return null;
}

export const itemsFullMsg = (limit: number) => `アイテムの置き場が いっぱいです（${limit}個まで）。`;

/**
 * 写真からアイテムを作ってもらう（2026-11-25。/api/items）。本番では、サーバーがアイテムの置き場にも入れる。
 * again＝同じ写真のアイテムが、もう置き場にあった
 */
export async function makeItem(img: { dataUrl: string; hash: string; thumb: string; colors: string[] }, needLogin: boolean): Promise<{ item: Item; again: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const r = await postApi(
      '/api/items',
      { image: img.dataUrl, hash: img.hash, thumb: img.thumb, colors: img.colors },
      { signal: ctrl.signal, needLogin },
    );
    const data = await r.json().catch(() => ({}));
    const err = accessError(r.status, data, itemsFullMsg(Number(data?.limit) || 30));
    if (err) throw err;
    if (!r.ok || !data?.item) throw new Error(data?.error || `HTTP ${r.status}`);
    return { item: data.item as Item, again: !!data.again };
  } finally {
    clearTimeout(timer);
  }
}

export async function analyze(image: string, hash: string): Promise<{ spec: CharacterSpec; model: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const r = await postApi('/api/analyze', { image, hash }, { signal: ctrl.signal });
    const data = await r.json().catch(() => ({}));
    const err = accessError(r.status, data, garageFullMsg(Number(data?.limit) || undefined));
    if (err) throw err;
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    return { spec: sanitizeSpec(data.spec), model: data.model };
  } finally {
    clearTimeout(timer);
  }
}
