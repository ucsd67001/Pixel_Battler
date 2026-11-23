// コンピュータと対戦の敵を選ぶ：コンピュータの9体と、ほかの人のガレージのロボ（みんなのロボ）を半分ずつ（2026-11-23）。
// みんなのロボは、サーバー（/api/rival）から先に一体もらっておく。バトルが始まる時に待たせないため。
// もらえなかったとき（ログインしていない・まだだれもロボを作っていない・つながらない）は、コンピュータの敵にする。

import type { Character } from './types';
import { pickCpu } from './cpu';
import { buildCharacter } from './stats';
import { sanitizeSpec } from './spec';
import { idToken } from '../lib/firebase';

/** みんなのロボが出る割合 */
export const RIVAL_RATE = 0.5;

let next: Character | null = null;
let loading: Promise<void> | null = null;

/** みんなのロボを一体、先にもらっておく（もうあれば何もしない） */
export function prefetchRival(): Promise<void> {
  if (next) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    try {
      const headers: Record<string, string> = {};
      const token = await idToken().catch(() => null);
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetch('/api/rival', { method: 'POST', headers });
      if (!r.ok) return;
      const data = await r.json();
      const seed = String(data?.robot?.seed ?? '');
      if (!/^[a-f0-9]{64}$/.test(seed)) return;
      // 強さとランクは、写真の印と設計図から、ここで計算し直す（サーバーと同じ計算）
      const c = buildCharacter(sanitizeSpec(data.robot.spec), seed, 'rival');
      next = { ...c, id: `rival-${c.id}` };
    } catch {
      // つながらないときは、コンピュータの敵だけで遊ぶ
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** もらっておいた、みんなのロボを使う（無ければ null）。ストーリーの乱入のため */
export function takeRival(): Character | null {
  const c = next;
  next = null;
  void prefetchRival();
  return c;
}

/** 次のバトルの敵。みんなのロボを使ったら、次の一体をまたもらっておく */
export function pickEnemy(rng: () => number = Math.random): Character {
  if (rng() < RIVAL_RATE && next) {
    const c = next;
    next = null;
    void prefetchRival();
    return c;
  }
  void prefetchRival();
  return pickCpu(rng);
}
