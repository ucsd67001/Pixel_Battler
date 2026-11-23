import {
  ELEMENTS, type CharacterSpec, type Element, type Form, type SkillDef, type SkillKind, type Trait, type UltStyle, type WeaponType,
} from './types';

export const FORM_INFO: Record<Form, { label: string; en: string }> = {
  humanoid: { label: '人型', en: 'HUMANOID' },
  beast: { label: 'けもの型', en: 'BEAST' },
  floater: { label: '空中型', en: 'FLOATER' },
};

export const ELEMENT_INFO: Record<Element, { label: string; en: string; color: string }> = {
  blaze: { label: '火', en: 'BLAZE', color: '#ff5a2a' },
  tide: { label: '水', en: 'TIDE', color: '#2aa8ff' },
  verdant: { label: '地', en: 'TERRA', color: '#c27a36' }, // もとは「森」（2026-11-23 に地へ）
  gale: { label: '風', en: 'GALE', color: '#4fe3b0' },
  light: { label: '光', en: 'LUMEN', color: '#ffd84a' },
  dark: { label: '夜', en: 'UMBRA', color: '#a35cff' },
};

// 水→火→風→地→水 の4すくみ（矢印の先に強い）。光と夜はお互いに強い。
//   水は火を消す・風は火をあおって大きくしてしまう・風は岩や土をけずる・土は水をせき止めて、すいこむ
const STRONG: Record<Element, Element[]> = {
  tide: ['blaze'],
  blaze: ['gale'],
  gale: ['verdant'],
  verdant: ['tide'],
  light: ['dark'],
  dark: ['light'],
};
const WEAK: Record<Element, Element[]> = {
  blaze: ['tide'],
  gale: ['blaze'],
  verdant: ['gale'],
  tide: ['verdant'],
  light: [],
  dark: [],
};

/** その属性が強い相手・弱い相手 */
export function matchup(e: Element): { strong: Element[]; weak: Element[] } {
  return { strong: STRONG[e], weak: WEAK[e] };
}

export function elementMultiplier(a: Element, d: Element): number {
  if (STRONG[a].includes(d)) return 1.3;
  if (WEAK[a].includes(d)) return 0.77;
  return 1;
}

/** その属性の相手に、大きなダメージをあたえられる属性 */
export const strongAgainst = (d: Element): Element[] => ELEMENTS.filter((a) => STRONG[a].includes(d));

/**
 * その属性の相手について、ストーリーの画面に出す「有利な属性」の説明。
 * 光と夜は、おたがいに大きなダメージ（どちらも1.3倍）なので「有利」とは言わない
 */
export function advantageText(d: Element): string {
  const list = strongAgainst(d);
  if (!list.length) return '';
  const names = list.map((e) => ELEMENT_INFO[e].label).join('・');
  return list.every((a) => STRONG[d].includes(a))
    ? `${names}のロボは、おたがいに大ダメージ（どちらも強く打てる）。`
    : `${names}のロボが有利です。`;
}

export const SKILL_TABLE: Record<
  SkillKind,
  { label: string; spCost: number; cooldown: number; effect: string; damaging: boolean }
> = {
  strike: { label: '強打', spCost: 50, cooldown: 2, effect: '1.9倍のパワーで、思いきり打つ', damaging: true },
  barrage: { label: '連打', spCost: 55, cooldown: 2, effect: '0.65倍のパワーで、3回続けて打つ', damaging: true },
  drain: { label: 'ドレイン', spCost: 50, cooldown: 2, effect: '1.4倍のパワーで打ち、あたえたダメージの半分だけHPが回復', damaging: true },
  breaker: {
    label: 'ブレイク',
    spCost: 45,
    cooldown: 2,
    effect: '1.5倍のパワーで、守りをつきやぶる。相手のぼうぎょを3ターン30%下げる',
    damaging: true,
  },
  heal: { label: '回復', spCost: 60, cooldown: 3, effect: 'HPを、最大の31%だけ回復', damaging: false },
  powerup: { label: 'パワーアップ', spCost: 40, cooldown: 3, effect: '3ターンのあいだ、こうげきが70%上がる。必殺ゲージ+25', damaging: false },
  fortify: {
    label: 'ガードアップ',
    spCost: 40,
    cooldown: 3,
    effect: '3ターンのあいだ、ぼうぎょが60%上がる。HPも17%回復。必殺ゲージ+15',
    damaging: false,
  },
  hex: { label: 'のろい', spCost: 45, cooldown: 2, effect: '0.9倍のパワーで打ち、相手のこうげきを3ターン30%下げる', damaging: true },
  counter: {
    label: 'カウンター',
    spCost: 35,
    cooldown: 2,
    effect: '次に受けるダメージを半分にして、1.7倍のパワーでやり返す',
    damaging: false,
  },
};

/** 設計図のスキル（名前・種類・説明）に、使う SP と休むターンを付ける */
export function skillOf(s: CharacterSpec['skill']): SkillDef {
  const t = SKILL_TABLE[s.kind];
  return { kind: s.kind, name: s.name, description: s.description, spCost: t.spCost, cooldown: t.cooldown };
}

export const TRAIT_TABLE: Record<Trait, { label: string; en: string; effect: string }> = {
  first: { label: '先手', en: 'FIRST STRIKE', effect: '先に動ける。最初に当てるこうげきは1.5倍のパワー' },
  guts: { label: 'ど根性', en: 'GUTS', effect: '一度だけ、たおれるダメージでもHP1でふみとどまる' },
  pierce: { label: 'つらぬき', en: 'PIERCE', effect: '相手のぼうぎょを25%無視する' },
  regen: { label: '自動回復', en: 'REGEN', effect: '自分の番が来るたびに、最大HPの1.8%を回復' },
  focus: { label: '集中', en: 'FOCUS', effect: 'SPが2倍たまる。スキルのパワー1.35倍' },
  ironwall: { label: '鉄の守り', en: 'IRONWALL', effect: 'HPが半分より少なくなると、ぼうぎょが60%上がる' },
  fighter: { label: '熱血', en: 'FIGHTER', effect: '必殺ゲージが1.6倍の速さでたまる' },
  lucky: { label: '強運', en: 'LUCKY', effect: '会心の一打（大ダメージ）が出る確率が30%になる' },
  grit: { label: '底力', en: 'GRIT', effect: 'HPが3割より少なくなると、こうげきが40%上がる' },
  evade: { label: '見切り', en: 'EVADE', effect: '12%の確率で、相手のこうげきをかわす（ダメージなし）' },
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
