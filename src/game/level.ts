// レベルと経験値（2026-11-23。docs/STORY.md の段階3）。画面とサーバーの両方が使う、純粋な計算。
//   ・Lv1〜99。ストーリーで勝つと、勝ったロボに経験値が入る。負けても減らない
//   ・経験値（2026-11-25 から。持ち主が選んだ「案F」）：手下は 10、ボスは 2倍の 20。
//     自分より5レベル以上下の敵は半分、10レベル以上下の敵は2割（1章でのレベル上げはできるが、ゆっくり）
//   ・レベルが上がるほど、次のレベルまでに要る経験値が増える（同じレベルの手下に、Lv1〜19 は2勝・Lv20〜39 は3勝…）
//   ・ストーリーのバトルでは、HP・SP・こうげき・ぼうぎょが 1レベルごとに +3%（Lv99 で約3.9倍）。
//     スキルに使う SP・毎ターンたまる SP・ダメージの式のぼうぎょの効き方も同じ割合で大きくするので、
//     同じレベルどうしなら、Lv1 でも Lv99 でもバトルの長さは同じ
//   ・ふたりで対戦・コンピュータと対戦は、レベルを使わない（みんな Lv1 の数字で戦う）

import type { Character } from './types';
import { afterWin, BOSS_SLOT, canWin, chapterLevel, type StoryProgress } from './progress';

export const MAX_LEVEL = 99;
/** 同じくらいのレベルの手下に1勝したときの経験値 */
export const EXP_PER_WIN = 10;
/** ボスに勝ったときは、何倍か */
export const BOSS_EXP_RATE = 2;

/**
 * 1勝でもらえる経験値（サーバーが、章・何体目か・ロボのレベルから計算する）。
 * 自分より5レベル以上下の敵は半分、10レベル以上下の敵は2割。0 にはしない（1章でのレベル上げは許す、と持ち主が決めた）
 */
export function expFor(myLevel: number, foeLevel: number, boss: boolean): number {
  const d = foeLevel - myLevel;
  const k = d >= -4 ? 1 : d >= -9 ? 0.5 : 0.2;
  return Math.max(1, Math.round(EXP_PER_WIN * k * (boss ? BOSS_EXP_RATE : 1)));
}
/** 1レベルで、数字が何割ふえるか */
export const LEVEL_STEP = 0.03;

/** そのレベルから次のレベルに上がるのに、同じレベルの手下に何勝いるか（要る経験値は、これの10倍） */
export function winsToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  if (level < 20) return 2; // 2026-11-25 までは Lv1〜9 が1勝だった（1勝ごとにレベルが上がっていた）
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
  left: number; // 次のレベルまで、あといくつ
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
  return { level, exp: e, into, need, left: need - into };
}

/** そのロボの経験値（無いロボは 0）。
 * 2026-11-25 の前の表（Lv1〜9 は1勝）でためた経験値は、本番のデータを一度だけ書き直した（functions/src/migrate.ts）ので、読みかえない */
export function expOf(c: { exp?: number }): number {
  return Math.min(MAX_EXP, Math.max(0, Math.floor(Number(c.exp) || 0)));
}

/** 経験値を gain だけ足した、新しい経験値とレベル（サーバーと、手元の記録の両方が使う）。exp は expOf で読んだもの */
export function addExp(exp: number, gain: number) {
  const before = growthOf(exp);
  const after = growthOf(Math.min(MAX_EXP, before.exp + gain));
  return { exp: after.exp, level: after.level, before: before.level, up: after.level > before.level, gain };
}

/** ストーリーの章 chapter の slot 体目に勝ったときの、新しい経験値とレベル（サーバーと、手元の記録の両方が使う） */
export function addWin(c: { exp?: number }, chapter: number, slot: number) {
  const exp = expOf(c);
  return addExp(exp, expFor(growthOf(exp).level, chapterLevel(chapter), slot === BOSS_SLOT));
}

/** ストーリーで勝ったときの答え。counted＝数えたか・up＝レベルが上がったか・gain＝もらえた経験値 */
export interface WinResult {
  counted: boolean;
  exp: number;
  level: number;
  up: boolean;
  gain: number;
  story: StoryProgress;
}

/**
 * ストーリーの章 chapter の slot 体目に勝ったときの、新しい経験値・レベル・進み具合（サーバーと、手元の記録の両方が使う）。
 * まだ戦えない敵（たどり着いていない）・refuse（サーバーが決める。前の勝ちからすぐ、など）のときは数えない
 */
export function storyWin(robot: { exp?: number }, story: StoryProgress, chapter: number, slot: number, refuse = false): WinResult {
  if (refuse || !canWin(story, chapter, slot)) {
    const g = growthOf(expOf(robot));
    return { counted: false, exp: g.exp, level: g.level, up: false, gain: 0, story };
  }
  const w = addWin(robot, chapter, slot);
  return { counted: true, exp: w.exp, level: w.level, up: w.up, gain: w.gain, story: afterWin(story, chapter, slot) };
}

/** ガレージのロボのレベル（経験値から出す。経験値の無いロボは Lv1） */
export const levelOf = (c: Character) => growthOf(expOf(c)).level;

/** そのレベルの数字の倍率（Lv1 で 1、Lv99 で 3.94） */
export const levelMult = (level: number) => 1 + LEVEL_STEP * (clampLevel(level) - 1);

/** バトルで使う倍率（atLevel で強くしたロボだけ。ほかは 1） */
export const fightMult = (c: Character) => levelMult(c.fightLevel ?? 1);

/**
 * SP の量（スキルに使う SP・毎ターンたまる SP・ガードでたまる SP）を、そのレベルの大きさにする。
 * どれも 5 の倍数なので、「5 にあたる量」を一度だけ四捨五入してからかける。
 * こうすると、使う量とたまる量の比が Lv1 といつも同じになる（別々に四捨五入すると、Lv2 で 31 と 10 のように、ずれていた）
 */
export const spAt = (n: number, level: number) => (n / 5) * Math.max(1, Math.round(5 * levelMult(level)));
/** バトルの中で、そのロボの SP の量にする */
export const spFor = (c: Character, n: number) => spAt(n, c.fightLevel ?? 1);

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
    skill: { ...c.skill, spCost: spAt(c.skill.spCost, lv) },
    fightLevel: lv,
  };
}

/** バトルの外へ出すとき（ふたりで対戦など）に、レベルの分と戦績を外す。数字はガレージのもとのまま */
export function withoutGrowth(c: Character): Character {
  const { exp: _exp, level: _level, fightLevel: _fight, record: _record, ...rest } = c;
  return rest;
}
