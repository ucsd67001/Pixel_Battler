// ほかの人のガレージのロボを、コンピュータの敵として出すときの形にする（2026-11-23）。
// 持ち主の決めたこと：ログインした人みんなのロボから選ぶ・持ち主の名前は出さない・自分のロボは出さない。
// 送るのは、ロボの姿と強さを作るのに要るものだけ。写真（thumb）と、写真に写っていたもの（motif）は送らない。

import { lookSeed, sanitizeSpec } from '../src/game/spec';
import { specHardKanji } from '../src/game/kanji';
import type { CharacterSpec } from '../src/game/types';

/** 画面のカードの「SCAN ▸ ◯◯」に出す言葉（写真に写っていたものの代わり） */
export const RIVAL_MOTIF = 'だれかのロボ';

export interface RivalPayload {
  seed: string; // 写真の印（強さとランクは、画面でもこれと設計図から計算し直す）
  spec: CharacterSpec;
}

/** ガレージのロボを、敵として送る形にする。小学校で習わない漢字が残っているロボは出さない（null） */
export function toRival(robot: { seed?: unknown; spec?: unknown }): RivalPayload | null {
  const seed = String(robot.seed ?? '');
  if (!/^[a-f0-9]{64}$/.test(seed)) return null;
  const spec = sanitizeSpec(robot.spec);
  if (specHardKanji(spec).length) return null;
  // motif を消す前に、見た目の種を決めておく（持ち主の画面と同じ体つきにするため）
  return { seed, spec: { ...spec, motif: RIVAL_MOTIF, look: lookSeed(spec) } };
}
