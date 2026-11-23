// コンピュータと対戦の敵を選ぶ：コンピュータの9体と、ほかの人のガレージのロボ（みんなのロボ）を半分ずつ（2026-11-23）。
// みんなのロボは、サーバー（/api/rival）から先に一体もらっておく。バトルが始まる時に待たせないため。
// 強さは、持ち主のガレージの数字のまま（server/rival.ts）。
// もらえなかったとき（ログインしていない・まだだれもロボを作っていない・つながらない）は、コンピュータの敵にする。

import type { Character, Rank, Stats } from './types';
import { pickCpu } from './cpu';
import { skillOf } from './data';
import { sanitizeSpec } from './spec';
import { postApi } from '../lib/api';

/** みんなのロボが出る割合 */
export const RIVAL_RATE = 0.5;

const RANKS: readonly Rank[] = ['S', 'A', 'B', 'C'];

let next: Character | null = null;
let loading: Promise<void> | null = null;

/** みんなのロボを一体、先にもらっておく（もうあれば何もしない） */
export function prefetchRival(): Promise<void> {
  if (next) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    try {
      const r = await postApi('/api/rival');
      if (!r.ok) return;
      const data = await r.json();
      const robot = data?.robot;
      const stats = robot?.stats as Stats | undefined;
      const ok = (k: keyof Stats) => Number.isInteger(stats?.[k]) && stats![k] > 0;
      if (!stats || !(['hp', 'sp', 'atk', 'def'] as const).every(ok) || !RANKS.includes(robot.rank)) return;
      // 強さとランクは、持ち主のガレージに入っている数字をそのまま使う（2026-11-24。計算し直さない）
      // 特別な写真のしるし（bonus）は、ここでも受け取らない
      const spec = { ...sanitizeSpec(robot.spec), bonus: 0 as const };
      const id = `rival-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
      next = {
        id,
        seed: id, // 写真の印は送られてこない
        spec,
        stats: { hp: stats.hp, sp: stats.sp, atk: stats.atk, def: stats.def },
        rank: robot.rank,
        skill: skillOf(spec.skill),
        createdAt: Date.now(),
        source: 'rival',
      };
    } catch {
      // つながらないときは、コンピュータの敵だけで遊ぶ
    } finally {
      loading = null;
    }
  })();
  return loading;
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
