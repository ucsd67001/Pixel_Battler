// ほかの人のガレージのロボを、コンピュータの敵として出すときの形にする（2026-11-23）。
// 持ち主の決めたこと：ログインした人みんなのロボから選ぶ・持ち主の名前は出さない・自分のロボは出さない。
// 送るのは、ロボの姿と強さに要るものだけ。写真（thumb）・写真に写っていたもの（motif）・写真の印（seed）は送らない。
// 強さは、ガレージに入っている数字（stats・rank）をそのまま送る（2026-11-24、持ち主の希望）。
// 画面では計算し直さないので、持ち主のガレージで見えるのと同じ強さで出る。
// 持たせているアイテムも送る（2026-11-26）。設計図と総合力・ランクだけ。写真・写っていたもの・写真の印は送らない。

import { isHash, lookSeed, sanitizeSpec } from '../src/game/spec';
import { specHardKanji } from '../src/game/kanji';
import { computeStats } from '../src/game/stats';
import type { CharacterSpec, Rank, Stats } from '../src/game/types';
import { sanitizeItemSpec, type ItemSpec } from '../src/game/items';
import { itemHardKanji } from './items';

/** 画面のカードの「SCAN ▸ ◯◯」に出す言葉（写真に写っていたものの代わり） */
export const RIVAL_MOTIF = 'だれかのロボ';

const RANKS: readonly Rank[] = ['S', 'A', 'B', 'C'];

export interface RivalPayload {
  spec: CharacterSpec;
  stats: Stats; // ガレージの数字のまま（Lv1 の数字。ストーリーのレベルはかけない）
  rank: Rank;
  item?: RivalItem; // 持たせているアイテム（無ければ素手）
}

/** だれかのロボが持っているアイテム（設計図と強さだけ） */
export interface RivalItem {
  spec: ItemSpec;
  power: number; // 総合力（92〜108）
  rank: Rank;
}

/**
 * 置き場のアイテムを、送る形にする。小学校で習わない漢字が残っているアイテムは、持たせない（null）。
 * 写っていたもの（motif）と特別な写真のしるし（bonus）は送らない
 */
export function toRivalItem(item: { spec?: unknown; power?: unknown; rank?: unknown } | undefined): RivalItem | null {
  if (!item?.spec) return null;
  const spec = sanitizeItemSpec(item.spec);
  if (itemHardKanji({ ...spec, motif: '' }).length) return null; // 写っていたものは送らないので、見ない
  const power = Number(item.power);
  if (!Number.isFinite(power) || !isRank(item.rank)) return null;
  return { spec: { ...spec, motif: '', bonus: 0 }, power: Math.max(92, Math.min(108, power)), rank: item.rank };
}

/** 数字が正しい形か（正の整数で、ありえないほど大きくない） */
export function isStats(s: any): s is Stats {
  return (
    !!s &&
    (['hp', 'sp', 'atk', 'def'] as const).every((k) => Number.isInteger(s[k]) && s[k] > 0 && s[k] < 100000)
  );
}
export const isRank = (r: unknown): r is Rank => RANKS.includes(r as Rank);

/**
 * ガレージのロボを、敵として送る形にする。小学校で習わない漢字が残っているロボは出さない（null）。
 * ガレージに数字が無いとき（手元の取り置きの設計図など）は、写真の印と設計図から、ここで計算する
 */
export function toRival(robot: { seed?: unknown; spec?: unknown; stats?: unknown; rank?: unknown }): RivalPayload | null {
  const seed = String(robot.seed ?? '');
  if (!isHash(seed)) return null;
  const spec = sanitizeSpec(robot.spec);
  if (specHardKanji(spec).length) return null;
  const saved = isStats(robot.stats) && isRank(robot.rank);
  const { stats, rank } = saved ? { stats: robot.stats as Stats, rank: robot.rank as Rank } : computeStats(spec, seed);
  // motif を消す前に、見た目の種を決めておく（持ち主の画面と同じ体つきにするため）。
  // 特別な写真のしるし（bonus）は送らない（どんな写真が特別かを、ほかの人に推し量られないように）。
  // そのため、技の 1.1倍（バトル中に bonus を見る）は入らない。総合力の +6 は数字に入っているので、そのまま
  return {
    spec: { ...spec, motif: RIVAL_MOTIF, look: lookSeed(spec), bonus: 0 },
    stats: { hp: stats.hp, sp: stats.sp, atk: stats.atk, def: stats.def },
    rank,
  };
}
