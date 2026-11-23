// 設計図から、数値（HP・SP・攻撃・防御）とスキルの数字を機械で決める。
// AIには傾向（1〜5）だけを選ばせ、数字はここで決める＝強さの釣り合いを保つため。

import type { Bias, Character, CharacterSpec, Rank, Stats } from './types';
import { skillOf } from './data';
import { rngFrom } from './random';

export const STAT_RANGE = {
  hp: { min: 1300, max: 2950 },
  sp: { min: 70, max: 185 },
  atk: { min: 150, max: 400 },
  def: { min: 120, max: 330 },
};

// 特別な写真のロボ（spec.bonus）は、総合力がこれだけ上がる（ランクがおよそ一つ上がる）
export const BONUS_POWER = 6;

export function computeStats(spec: CharacterSpec, seed: string): { stats: Stats; rank: Rank; power: number } {
  const rng = rngFrom('stats:' + seed);
  // 総合力は 92〜108。同じ写真なら毎回同じ。
  const power = 92 + rng() * 16 + (spec.bonus ? BONUS_POWER : 0);
  const w = {
    hp: spec.bias.hp + rng() * 1.2,
    sp: spec.bias.sp + rng() * 1.2,
    atk: spec.bias.atk + rng() * 1.2,
    def: spec.bias.def + rng() * 1.2,
  };
  return { ...statsFor(w, power), power };
}

/** 総合力のランク */
export const rankOf = (power: number): Rank => (power >= 105 ? 'S' : power >= 100 ? 'A' : power >= 96 ? 'B' : 'C');

/** 傾向（重み）と総合力から、数値を決める。ストーリーの手下（src/game/minions.ts）も、これで数字を決める */
export function statsFor(w: Bias, power: number): { stats: Stats; rank: Rank } {
  const sum = w.hp + w.sp + w.atk + w.def;
  const share = (k: keyof Bias) => Math.min(45, Math.max(10, (w[k] / sum) * power));
  const stats: Stats = {
    hp: Math.round((900 + share('hp') * 45) / 10) * 10,
    sp: Math.round(40 + share('sp') * 3.2),
    atk: Math.round(80 + share('atk') * 7),
    def: Math.round(60 + share('def') * 6),
  };
  return { stats, rank: rankOf(power) };
}

export function buildCharacter(
  spec: CharacterSpec,
  seed: string,
  source: Character['source'],
  thumb?: string,
): Character {
  const { stats, rank } = computeStats(spec, seed);
  return {
    id: `${seed.slice(0, 12)}-${Date.now().toString(36)}`,
    seed,
    spec,
    stats,
    rank,
    skill: skillOf(spec.skill),
    createdAt: Date.now(),
    thumb,
    source,
  };
}
