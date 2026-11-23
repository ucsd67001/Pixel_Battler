// 釣り合いの確かめ：ランダムなキャラ（傾向もランダム）を、コンピュータの敵と何千回も戦わせる。
// 敵は順番に全員と戦わせ、敵ごとの勝率も出す（どの敵も 45〜55% くらいになるのがよい）。
// 使い方：npm run sim

import { localSpec } from '../src/game/fallback';
import { buildCharacter } from '../src/game/stats';
import { CPU_CHARACTERS, chooseAction } from '../src/game/cpu';
import { act, createBattle, endTurn, startTurn } from '../src/game/battle';
import { ELEMENTS, TRAITS } from '../src/game/types';

const N = 1500 * CPU_CHARACTERS.length;
let wins = 0;
let turns = 0;
let ults = 0;
const byCpu: Record<string, [number, number]> = {};
const byRank: Record<string, [number, number]> = {};
const byTrait: Record<string, [number, number]> = {};
const byKind: Record<string, [number, number]> = {};
const byElement: Record<string, [number, number]> = {};

// 敵の順番（i を割ったあまり）とかたよらないように、乱数で選ぶ
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

for (let i = 0; i < N; i++) {
  const seed = 'sim' + i;
  const colors = ['#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')];
  // 色から作るロボは、風・底力・見切りにならないので、属性と特性は全部から順に選ぶ
  const spec = { ...localSpec(seed, colors), element: pick(ELEMENTS), trait: pick(TRAITS) };
  const c = buildCharacter(spec, seed, 'local');
  const enemy = CPU_CHARACTERS[i % CPU_CHARACTERS.length];
  const st = createBattle(c, enemy);
  while (!st.over && st.turn < 200) {
    startTurn(st);
    // プレイヤー役も CPU と同じ考え方で動かす
    const a = chooseAction(st, st.active, Math.random);
    if (a === 'ultimate') ults++;
    act(st, a, Math.random);
    if (st.over) break;
    endTurn(st);
  }
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

const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`;
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
