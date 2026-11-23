// レベルと経験値（2026-11-23。docs/STORY.md の段階3）。画面とサーバーの両方が使う、純粋な計算。
//   ・Lv1〜99。ストーリーで勝つと、勝ったロボに経験値が入る（どの敵でも同じ量）。負けても減らない
//   ・レベルが上がるほど、次のレベルまでに要る勝利数が増える（Lv99 まで合わせて364勝）
//   ・ストーリーのバトルでは、HP・SP・こうげき・ぼうぎょが 1レベルごとに +3%（Lv99 で約3.9倍）。
//     スキルに使う SP・毎ターンたまる SP・ダメージの式のぼうぎょの効き方も同じ割合で大きくするので、
//     同じレベルどうしなら、Lv1 でも Lv99 でもバトルの長さは同じ
//   ・ふたりで対戦・コンピュータと対戦は、レベルを使わない（みんな Lv1 の数字で戦う）

import type { Character } from './types';

export const MAX_LEVEL = 99;
/** 1勝で入る経験値。いまは一定（あとで、敵や自分のレベルで変えるかもしれないので、1勝＝10 にしてある） */
export const EXP_PER_WIN = 10;
/** 1レベルで、数字が何割ふえるか */
export const LEVEL_STEP = 0.03;

/** そのレベルから次のレベルに上がるのに要る勝利数 */
export function winsToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  if (level < 10) return 1;
  if (level < 20) return 2;
  if (level < 40) return 3;
  if (level < 60) return 4;
  return 5;
}

const clampLevel = (n: number) => Math.min(MAX_LEVEL, Math.max(1, Math.floor(Number.isFinite(n) ? n : 1)));

/** そのレベルになるのに要る経験値の合計（Lv1 は 0） */
export function expAt(level: number): number {
  let e = 0;
  for (let l = 1; l < clampLevel(level); l++) e += winsToNext(l) * EXP_PER_WIN;
  return e;
}

export const MAX_EXP = expAt(MAX_LEVEL);

export interface Growth {
  level: number;
  exp: number; // 経験値の合計
  into: number; // いまのレベルになってから、ためた経験値
  need: number; // 次のレベルまでに要る経験値（Lv99 は 0）
  winsLeft: number; // 次のレベルまで、あと何勝
}

/** 経験値の合計から、レベルと次のレベルまでを出す */
export function growthOf(exp: number | undefined): Growth {
  const e = Math.min(MAX_EXP, Math.max(0, Math.floor(Number(exp) || 0)));
  let level = 1;
  let base = 0;
  while (level < MAX_LEVEL && e >= base + winsToNext(level) * EXP_PER_WIN) {
    base += winsToNext(level) * EXP_PER_WIN;
    level++;
  }
  const need = winsToNext(level) * EXP_PER_WIN;
  const into = e - base;
  return { level, exp: e, into, need, winsLeft: need ? Math.ceil((need - into) / EXP_PER_WIN) : 0 };
}

/** ガレージのロボのレベル（経験値から出す。経験値の無いロボは Lv1） */
export const levelOf = (c: Character) => growthOf(c.exp).level;

/** そのレベルの数字の倍率（Lv1 で 1、Lv99 で 3.94） */
export const levelMult = (level: number) => 1 + LEVEL_STEP * (clampLevel(level) - 1);

/** バトルで使う倍率（atLevel で強くしたロボだけ。ほかは 1） */
export const fightMult = (c: Character) => levelMult(c.fightLevel ?? 1);

/**
 * ストーリーのバトルで戦うときの姿にする（数字をそのレベルの分だけ大きくする）。
 * 写真から決まったもとの数字・ランクは変えない。ガレージには、もとの数字のまま入っている
 */
export function atLevel(c: Character, level: number): Character {
  const lv = clampLevel(level);
  const k = levelMult(lv);
  return {
    ...c,
    stats: {
      hp: Math.round(c.stats.hp * k),
      sp: Math.round(c.stats.sp * k),
      atk: Math.round(c.stats.atk * k),
      def: Math.round(c.stats.def * k),
    },
    skill: { ...c.skill, spCost: Math.round(c.skill.spCost * k) },
    fightLevel: lv,
  };
}

/** バトルの外へ出すとき（ふたりで対戦など）に、レベルの分を外す。数字はガレージのもとのまま */
export function withoutGrowth(c: Character): Character {
  const { exp: _exp, level: _level, fightLevel: _fight, ...rest } = c;
  return rest;
}
