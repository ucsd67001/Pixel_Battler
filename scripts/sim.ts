// 釣り合いの確かめ：ランダムなキャラ（傾向もランダム）を、固定のCPUと何千回も戦わせる。
// 使い方：npm run sim

import { localSpec } from '../src/game/fallback';
import { buildCharacter } from '../src/game/stats';
import { CPU_CHARACTER, chooseAction } from '../src/game/cpu';
import { act, createBattle, endTurn, startTurn } from '../src/game/battle';

const N = 4000;
let wins = 0;
let turns = 0;
let ults = 0;
const byRank: Record<string, [number, number]> = {};
const byTrait: Record<string, [number, number]> = {};
const byKind: Record<string, [number, number]> = {};

for (let i = 0; i < N; i++) {
  const seed = 'sim' + i;
  const colors = ['#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')];
  const c = buildCharacter(localSpec(seed, colors), seed, 'local');
  const st = createBattle(c, CPU_CHARACTER);
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
    [byRank, c.rank],
    [byTrait, c.spec.trait],
    [byKind, c.skill.kind],
  ] as const) {
    tbl[key] ??= [0, 0];
    tbl[key][0] += win;
    tbl[key][1]++;
  }
}

const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`;
console.log(`勝率 ${pct(wins, N)}  平均の行動数 ${(turns / N).toFixed(1)}  必殺技 ${(ults / N).toFixed(2)}回/戦`);
for (const [name, tbl] of [
  ['ランク', byRank],
  ['特性', byTrait],
  ['スキル', byKind],
] as const) {
  console.log(
    name + '：' +
      Object.entries(tbl)
        .sort()
        .map(([k, [w, n]]) => `${k} ${pct(w, n)}`)
        .join(' / '),
  );
}
