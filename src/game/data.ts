import type { Element, Form, SkillKind, Trait, UltStyle, WeaponType } from './types';

export const FORM_INFO: Record<Form, { label: string; en: string }> = {
  humanoid: { label: '人型', en: 'HUMANOID' },
  beast: { label: 'けもの型', en: 'BEAST' },
  floater: { label: '空中型', en: 'FLOATER' },
};

export const ELEMENT_INFO: Record<Element, { label: string; en: string; color: string }> = {
  blaze: { label: '火', en: 'BLAZE', color: '#ff5a2a' },
  tide: { label: '水', en: 'TIDE', color: '#2aa8ff' },
  verdant: { label: '森', en: 'VERDANT', color: '#3ddc84' },
  light: { label: '光', en: 'LUMEN', color: '#ffd84a' },
  dark: { label: '夜', en: 'UMBRA', color: '#a35cff' },
};

// 火→森→水→火 の三すくみ。光と夜はお互いに強い。
const STRONG: Record<Element, Element[]> = {
  blaze: ['verdant'],
  verdant: ['tide'],
  tide: ['blaze'],
  light: ['dark'],
  dark: ['light'],
};
const WEAK: Record<Element, Element[]> = {
  blaze: ['tide'],
  verdant: ['blaze'],
  tide: ['verdant'],
  light: [],
  dark: [],
};

export function elementMultiplier(a: Element, d: Element): number {
  if (STRONG[a].includes(d)) return 1.3;
  if (WEAK[a].includes(d)) return 0.77;
  return 1;
}

export const SKILL_TABLE: Record<
  SkillKind,
  { label: string; spCost: number; cooldown: number; effect: string; damaging: boolean }
> = {
  strike: { label: '強打', spCost: 50, cooldown: 2, effect: '2倍のパワーで、思いきり打つ', damaging: true },
  barrage: { label: '連打', spCost: 55, cooldown: 2, effect: '0.65倍のパワーで、3回続けて打つ', damaging: true },
  drain: { label: 'ドレイン', spCost: 50, cooldown: 2, effect: '1.4倍のパワーで打ち、あたえたダメージの半分だけHPが回復', damaging: true },
  breaker: {
    label: 'ブレイク',
    spCost: 45,
    cooldown: 2,
    effect: '1.5倍のパワーで、守りをつきやぶる。相手のぼうぎょを3ターン30%下げる',
    damaging: true,
  },
  heal: { label: '回復', spCost: 60, cooldown: 3, effect: 'HPを、最大の32%だけ回復', damaging: false },
  powerup: { label: 'パワーアップ', spCost: 40, cooldown: 3, effect: '3ターンのあいだ、こうげきが60%上がる。必殺ゲージ+25', damaging: false },
  fortify: {
    label: 'ガードアップ',
    spCost: 40,
    cooldown: 3,
    effect: '3ターンのあいだ、ぼうぎょが60%上がる。HPも15%回復',
    damaging: false,
  },
  hex: { label: 'のろい', spCost: 45, cooldown: 2, effect: '0.8倍のパワーで打ち、相手のこうげきを3ターン30%下げる', damaging: true },
  counter: {
    label: 'カウンター',
    spCost: 35,
    cooldown: 2,
    effect: '次に受けるダメージを半分にして、1.5倍のパワーでやり返す',
    damaging: false,
  },
};

export const TRAIT_TABLE: Record<Trait, { label: string; en: string; effect: string }> = {
  first: { label: '先手', en: 'FIRST STRIKE', effect: '先に動ける。最初のアタックは1.5倍のパワー' },
  guts: { label: 'ど根性', en: 'GUTS', effect: '1度だけ、たおれるダメージでもHP1でふみとどまる' },
  pierce: { label: 'つらぬき', en: 'PIERCE', effect: '相手のぼうぎょを25%無視する' },
  regen: { label: '自動回復', en: 'REGEN', effect: '自分の番が来るたびに、最大HPの2.5%を回復' },
  focus: { label: '集中', en: 'FOCUS', effect: 'SPが2倍たまる。スキルのパワー1.2倍' },
  ironwall: { label: '鉄の守り', en: 'IRONWALL', effect: 'HPが半分より少なくなると、ぼうぎょが50%上がる' },
  fighter: { label: '熱血', en: 'FIGHTER', effect: '必殺ゲージが1.5倍の速さでたまる' },
  lucky: { label: '強運', en: 'LUCKY', effect: '会心の一打（大ダメージ）が出る確率が25%になる' },
};

export const ULT_TABLE: Record<UltStyle, { label: string; hits: number }> = {
  beam: { label: 'ビーム', hits: 1 },
  slash: { label: 'スラッシュ', hits: 1 },
  meteor: { label: '流星', hits: 3 },
  burst: { label: '大ばくはつ', hits: 1 },
  rush: { label: 'ラッシュ', hits: 5 },
};

export const WEAPON_LABEL: Record<WeaponType, string> = {
  none: 'パンチ',
  sword: 'ソード',
  lance: 'ランス',
  rifle: 'ライフル',
  hammer: 'ハンマー',
  shield: 'シールド',
  claw: 'クロー',
};

export const ULT_POWER = 3.0;
