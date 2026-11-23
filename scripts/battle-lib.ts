// 釣り合いを確かめる道具（npm run sim・npm run tune:minions）が使う、共通の部品（2026-11-23）

import { localSpec } from '../src/game/fallback';
import { buildCharacter } from '../src/game/stats';
import { chooseAction } from '../src/game/cpu';
import { act, createBattle, endTurn, startTurn, type ActionType, type BattleState } from '../src/game/battle';
import { ELEMENTS, TRAITS, type Character } from '../src/game/types';

/** list から一つ、乱数で選ぶ */
export const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** 勝率などの割合を「12.3%」の形にする */
export const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`;

/**
 * ランダムなロボ（写真の色から作るロボと同じ作り方）。
 * 色から作るロボは、底力・見切りにならないので、属性と特性は全部から乱数で選ぶ
 */
export function randomRobot(seed: string): Character {
  const colors = ['#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')];
  const spec = { ...localSpec(seed, colors), element: pick(ELEMENTS), trait: pick(TRAITS) };
  return buildCharacter(spec, seed, 'local');
}

/** 二体を最後まで戦わせる。どちらもコンピュータと同じ考え方で動く。onAction で、選んだ行動を数えられる */
export function fight(a: Character, b: Character, onAction?: (type: ActionType, side: 0 | 1) => void): BattleState {
  const st = createBattle(a, b);
  while (!st.over && st.turn < 200) {
    startTurn(st);
    const type = chooseAction(st, st.active, Math.random);
    onAction?.(type, st.active);
    act(st, type, Math.random);
    if (st.over) break;
    endTurn(st);
  }
  return st;
}
