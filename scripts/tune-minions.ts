// ストーリーの手下の総合力（power）を合わせる道具（2026-11-23）。
// 手下ごとに、同じレベル（章のレベル。chapterLevel）のランダムなロボが勝つ割合が MINION_TARGET になる power を、二分探索でさがして出す。
// 出た数字を src/game/minions.ts の各手下の power に書く。手下を足したり、技や傾向を変えたりしたら、もう一度走らせる。
// 使い方：npm run tune:minions

import type { Character } from '../src/game/types';
import { atLevel } from '../src/game/level';
import { MINION_DEFS, MINION_TARGET, minion } from '../src/game/minions';
import { chapterLevel } from '../src/game/story';
import { fight, randomRobot } from './battle-lib';

const N = 1200;

function winRate(enemy: Character, level: number): number {
  let w = 0;
  for (let i = 0; i < N; i++) {
    if (fight(atLevel(randomRobot(`tune${i}`), level), atLevel(enemy, level)).winner === 0) w++;
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
      if (winRate(minion(ci + 1, slot, d, mid), chapterLevel(ci + 1)) > target) lo = mid;
      else hi = mid;
    }
    const power = Math.round((lo + hi) / 2);
    const check = winRate(minion(ci + 1, slot, d, power), chapterLevel(ci + 1));
    out.push(`${d.name} ${power}（${(check * 100).toFixed(1)}%）`);
  });
  console.log(`${ci + 1}章：` + out.join(' ・ '));
});
