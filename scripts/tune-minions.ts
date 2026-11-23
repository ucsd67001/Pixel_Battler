// ストーリーの手下の総合力（power）を合わせる道具（2026-11-23）。
// 手下ごとに、同じレベル（章N → Lv N）のランダムなロボが勝つ割合が MINION_TARGET になる power を、二分探索でさがして出す。
// 出た数字を src/game/minions.ts の各手下の power に書く。手下を足したり、技や傾向を変えたりしたら、もう一度走らせる。
// 使い方：npm run tune:minions

import { localSpec } from '../src/game/fallback';
import { buildCharacter } from '../src/game/stats';
import { chooseAction } from '../src/game/cpu';
import { act, createBattle, endTurn, startTurn } from '../src/game/battle';
import { ELEMENTS, TRAITS, type Character } from '../src/game/types';
import { atLevel } from '../src/game/level';
import { MINION_DEFS, MINION_TARGET, minion } from '../src/game/minions';

const N = 1200;
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

function winRate(enemy: Character, level: number): number {
  let w = 0;
  for (let i = 0; i < N; i++) {
    const seed = `tune${i}`;
    const colors = ['#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')];
    const spec = { ...localSpec(seed, colors), element: pick(ELEMENTS), trait: pick(TRAITS) };
    const st = createBattle(atLevel(buildCharacter(spec, seed, 'local'), level), atLevel(enemy, level));
    while (!st.over && st.turn < 200) {
      startTurn(st);
      act(st, chooseAction(st, st.active, Math.random), Math.random);
      if (st.over) break;
      endTurn(st);
    }
    if (st.winner === 0) w++;
  }
  return w / N;
}

MINION_DEFS.forEach((list, ci) => {
  const out: string[] = [];
  list.forEach((d, slot) => {
    const target = MINION_TARGET[slot];
    let lo = 60;
    let hi = 110;
    for (let k = 0; k < 7; k++) {
      const mid = (lo + hi) / 2;
      // 総合力が大きいほど、こちらが勝ちにくい
      if (winRate(minion(ci + 1, slot, d, mid), ci + 1) > target) lo = mid;
      else hi = mid;
    }
    const power = Math.round((lo + hi) / 2);
    const check = winRate(minion(ci + 1, slot, d, power), ci + 1);
    out.push(`${d.name} ${power}（${(check * 100).toFixed(1)}%）`);
  });
  console.log(`${ci + 1}章：` + out.join(' ・ '));
});
