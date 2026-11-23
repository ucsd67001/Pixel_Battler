// 持ち物（アイテム）のしくみの入り口（2026-11-23）。
// いまは、どのロボも素手で戦い、素手で守る。手に持つ武器・腕の刃・せなかの大砲は外してある。
// 設計図の parts（AI が写真から選んだ武器など）は、書きかえずにそのまま残す。
//   ・同じ写真から同じロボ（体つき＝lookSeed は、もとの parts から決まる）を守るため
//   ・あとでアイテムを入れるとき、「そのロボがもともと持っていた武器」として使えるように
// 見た目と動きは、ここで返す「いま身につけている部品」で決める（src/three/robot.ts・stage.ts）。

import type { CharacterSpec } from './types';

export type Parts = CharacterSpec['parts'];

/** いま身につけている部品。武器は外して素手、腕の刃はふつうの腕、せなかの大砲はブースターにする */
export function wornParts(spec: CharacterSpec): Parts {
  const p = spec.parts;
  return {
    ...p,
    weapon: 'none',
    arms: p.arms === 'blade' ? 'standard' : p.arms,
    back: p.back === 'cannons' ? 'boosters' : p.back,
  };
}
