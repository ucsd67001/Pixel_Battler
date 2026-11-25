// 釣り合いの確かめ：ランダムなロボ（傾向もランダム）を、コンピュータの敵と何千回も戦わせる。
// 敵は、ほんとうと同じ選び方（pickCpu。属性を先に同じ割合で選ぶ）で出す。
// 敵ごとの勝率（どの敵も 45〜55% くらい）と、自分の属性ごとの勝率（どの属性も 50% に近い）を出す。
// 使い方：npm run sim

import { CPU_CHARACTERS, pickCpu } from '../src/game/cpu';
import { addExp, atLevel, expFor, growthOf } from '../src/game/level';
import { fight, pct, pick, randomRobot } from './battle-lib';
import { BOSS_SLOT, CHAPTERS, CHAPTER_SIZE, chapterLevel, enemyAt } from '../src/game/story';

const N = 1500 * CPU_CHARACTERS.length;
let wins = 0;
let turns = 0;
let ults = 0;
const byCpu: Record<string, [number, number]> = {};
const byRank: Record<string, [number, number]> = {};
const byTrait: Record<string, [number, number]> = {};
const byKind: Record<string, [number, number]> = {};
const byElement: Record<string, [number, number]> = {};

for (let i = 0; i < N; i++) {
  const c = randomRobot('sim' + i);
  const enemy = pickCpu();
  // プレイヤー役も CPU と同じ考え方で動かす
  const st = fight(c, enemy, (a) => {
    if (a === 'ultimate') ults++;
  });
  const win = st.winner === 0 ? 1 : 0;
  wins += win;
  turns += st.turn;
  for (const [tbl, key] of [
    [byCpu, enemy.spec.name],
    [byRank, c.rank],
    [byTrait, c.spec.trait],
    [byKind, c.skill.kind],
    [byElement, c.spec.element],
  ] as const) {
    tbl[key] ??= [0, 0];
    tbl[key][0] += win;
    tbl[key][1]++;
  }
}

console.log(`勝率 ${pct(wins, N)}  平均の行動数 ${(turns / N).toFixed(1)}  必殺技 ${(ults / N).toFixed(2)}回/戦`);
for (const [name, tbl] of [
  ['敵', byCpu],
  ['ランク', byRank],
  ['特性', byTrait],
  ['スキル', byKind],
  ['属性', byElement],
] as const) {
  console.log(
    name + '：' +
      Object.entries(tbl)
        .sort()
        .map(([k, [w, n]]) => `${k} ${pct(w, n)}`)
        .join(' / '),
  );
}

// ── レベル（2026-11-23。src/game/level.ts）──
// ランダムなロボを、ランダムな敵九体と、レベルを変えて戦わせる。
//   ・同じレベルどうしなら、Lv1 でも Lv99 でも、行動数と引き分けがほぼ同じになるのがよい
//   ・レベルが上のほうが、はっきり勝ちやすくなるのがよい
const M = 4000;
console.log('レベル（自分 対 敵）：');
for (const [me, them] of [[1, 1], [50, 50], [99, 99], [2, 1], [5, 1], [11, 1], [9, 5], [60, 50], [99, 89]]) {
  let w = 0;
  let n = 0;
  let draw = 0;
  for (let i = 0; i < M; i++) {
    const seed = 'lv' + i;
    const c = atLevel(randomRobot(seed), me);
    const st = fight(c, atLevel(pick(CPU_CHARACTERS), them));
    if (st.winner === 0) w++;
    if (st.draw) draw++;
    n += st.turn;
  }
  console.log(`  Lv${me} 対 Lv${them}：勝率 ${pct(w, M)}  平均の行動数 ${(n / M).toFixed(1)}  引き分け ${pct(draw, M)}`);
}

// ── ストーリー（2026-11-23。src/game/story.ts・minions.ts）──
// 章の敵（chapterLevel）と、ランダムなロボを戦わせる。自分も同じレベルのときと、3レベル上のとき。
// 手下は1体目から4体目へ少しずつ勝ちにくく、ボス（5体目）は約50%（同じレベルのとき）になるのがよい
const S = 1500;
console.log('ストーリー（何体目ごとの勝率。左が同じレベル、右が自分が3レベル上）：');
const slotSum = [0, 0, 0, 0, 0].map(() => [0, 0]);
for (const ch of CHAPTERS) {
  const row: string[] = [];
  for (let slot = 0; slot < 5; slot++) {
    const r = [0, 3].map((plus, k) => {
      let w = 0;
      for (let i = 0; i < S; i++) {
        const seed = `st${ch.no}-${slot}-${i}`;
        const c = atLevel(randomRobot(seed), chapterLevel(ch.no) + plus);
        if (fight(c, atLevel(enemyAt(ch.no, slot)!, chapterLevel(ch.no))).winner === 0) w++;
      }
      slotSum[slot][k] += w;
      return pct(w, S);
    });
    row.push(`${enemyAt(ch.no, slot)!.spec.name} ${r[0]}/${r[1]}`);
  }
  console.log(`  ${ch.no}章 ` + row.join(' ・ '));
}
console.log('  平均：' + slotSum.map(([a, b], i) => `${i + 1}体目 ${pct(a, S * CHAPTERS.length)}/${pct(b, S * CHAPTERS.length)}`).join(' ・ '));

// ── 通しで遊ぶ（2026-11-23）──
// ランダムなロボ1体で、1章から順に進む（ロボをかえない）。経験値はほんとうと同じ（expFor：ボスは2倍・ずっと下の敵は少し）。
// 負けたら、その章の1体目と一度戦い（勝てば経験値。レベル上げ）、
// それから負けた敵にもう一度ちょうせんする。
// 章ごとに、何回戦ったか（レベル上げの分もふくむ）・始めたときの自分のレベルを出す。
// 「戦った回数」が 5 に近いほど楽、大きいほど負けが多い。ボスで10回以上負けた人の割合も出す。
// 同じ敵に 40回続けて負けたら、そこで止まる（ほんとうは、ロボをかえるか、前の章でレベル上げをする）。止まった人の割合も出す
const P = 600;
const GIVE_UP = 40;
const tries = CHAPTERS.map(() => 0);
const lvAt = CHAPTERS.map(() => 0);
const stuck = CHAPTERS.map(() => 0);
const reached = CHAPTERS.map(() => 0);
const gaveUp = CHAPTERS.map(() => 0);
for (let i = 0; i < P; i++) {
  const seed = 'run' + i;
  const base = randomRobot(seed);
  let exp = 0;
  let out = false;
  for (const ch of CHAPTERS) {
    const k = ch.no - 1;
    reached[k]++;
    lvAt[k] += growthOf(exp).level;
    for (let slot = 0; slot < CHAPTER_SIZE && !out; slot++) {
      let lost = 0;
      for (;;) {
        tries[k]++;
        const me = atLevel(base, growthOf(exp).level);
        if (fight(me, atLevel(enemyAt(ch.no, slot)!, chapterLevel(ch.no))).winner === 0) break;
        if (++lost >= GIVE_UP) {
          out = true;
          break;
        }
        if (slot > 0) {
          // レベル上げ：1体目と一度戦う
          tries[k]++;
          if (fight(atLevel(base, growthOf(exp).level), atLevel(enemyAt(ch.no, 0)!, chapterLevel(ch.no))).winner === 0)
            exp = addExp(exp, expFor(growthOf(exp).level, chapterLevel(ch.no), false)).exp;
        }
      }
      if (slot === CHAPTER_SIZE - 1 && lost >= 10) stuck[k]++;
      if (!out) exp = addExp(exp, expFor(growthOf(exp).level, chapterLevel(ch.no), slot === BOSS_SLOT)).exp;
    }
    if (out) {
      gaveUp[k]++;
      break;
    }
  }
}
console.log('通しで遊ぶ（1体で進む。負けたら1体目でレベル上げ。戦った回数は5が最少）：');
for (const ch of CHAPTERS) {
  const k = ch.no - 1;
  const n = Math.max(1, reached[k]);
  console.log(
    `  ${ch.no}章（敵 Lv${chapterLevel(ch.no)}）：始めの自分 Lv${(lvAt[k] / n).toFixed(1)}  戦った回数 ${(tries[k] / n).toFixed(1)}  ` +
      `ボスで10回以上負け ${pct(stuck[k], n)}  ここで止まった ${pct(gaveUp[k], P)}`,
  );
}
