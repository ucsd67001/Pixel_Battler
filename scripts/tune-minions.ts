// ストーリーの手下の総合力（power）を合わせる道具（2026-11-23）。
// 手下ごとに、同じレベル（章のレベル。chapterLevel）のランダムなロボが勝つ割合が MINION_TARGET になる power を、二分探索でさがして出す。
// 出た数字を src/game/minions.ts の各手下の power に書く。手下を足したり、技や傾向を変えたりしたら、もう一度走らせる。
// 使い方：npm run tune:minions（章をしぼるときは npm run tune:minions -- 10）

import type { Character } from '../src/game/types';
import { atLevel } from '../src/game/level';
import { MINION_DEFS, MINION_TARGET, minion } from '../src/game/minions';
import { chapterLevel } from '../src/game/story';
import { PERSON_BOSS_TARGET, PERSON_CHAPTERS, person } from '../src/game/thinkers';
import { BOSS_SLOT } from '../src/game/progress';
import { fight, randomRobot } from './battle-lib';

const N = 1200;

function winRate(enemy: Character, level: number): number {
  let w = 0;
  for (let i = 0; i < N; i++) {
    if (fight(atLevel(randomRobot(`tune${i}`), level), atLevel(enemy, level)).winner === 0) w++;
  }
  return w / N;
}

/** make(power) の敵に、ランダムなロボが勝つ割合が target になる power をさがす */
function tune(make: (power: number) => Character, level: number, target: number): string {
  let lo = 60;
  let hi = 120;
  for (let k = 0; k < 7; k++) {
    const mid = (lo + hi) / 2;
    // 総合力が大きいほど、こちらが勝ちにくい
    if (winRate(make(mid), level) > target) lo = mid;
    else hi = mid;
  }
  const power = Math.round((lo + hi) / 2);
  const check = winRate(make(power), level);
  return `${make(power).spec.name} ${power}（${(check * 100).toFixed(1)}%）`;
}

// 章の番号を付けると、その章だけ合わせる（npm run tune:minions -- 10）
const only = Number(process.argv[2]) || 0;

MINION_DEFS.forEach((list, ci) => {
  if (only && only !== ci + 1) return;
  const out = list.map((d, slot) => tune((p) => minion(ci + 1, slot, d, p), chapterLevel(ci + 1), MINION_TARGET[slot]));
  console.log(`${ci + 1}章：` + out.join(' ・ '));
});

// 10章から先の人物の章（5人目のボスもふくむ。ボスは PERSON_BOSS_TARGET）
PERSON_CHAPTERS.forEach((ch, i) => {
  const no = MINION_DEFS.length + 1 + i;
  if (only && only !== no) return;
  const out = ch.people.map((d, slot) =>
    tune((p) => person(no, slot, d, p), chapterLevel(no), slot === BOSS_SLOT ? PERSON_BOSS_TARGET : MINION_TARGET[slot]),
  );
  console.log(`${no}章：` + out.join(' ・ '));
});
