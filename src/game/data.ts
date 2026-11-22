import type { Element, Form, SkillKind, Trait, UltStyle, WeaponType } from './types';

export const FORM_INFO: Record<Form, { label: string; en: string }> = {
  humanoid: { label: '人型', en: 'HUMANOID' },
  beast: { label: '獣型', en: 'BEAST' },
  floater: { label: '浮遊型', en: 'FLOATER' },
};

export const ELEMENT_INFO: Record<Element, { label: string; en: string; color: string }> = {
  blaze: { label: '炎', en: 'BLAZE', color: '#ff5a2a' },
  tide: { label: '水', en: 'TIDE', color: '#2aa8ff' },
  verdant: { label: '森', en: 'VERDANT', color: '#3ddc84' },
  light: { label: '光', en: 'LUMEN', color: '#ffd84a' },
  dark: { label: '闇', en: 'UMBRA', color: '#a35cff' },
};

// 炎→森→水→炎 の三すくみ。光と闇はお互いに強い。
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
  strike: { label: '一撃', spCost: 50, cooldown: 2, effect: '威力2.0倍の強烈な一撃', damaging: true },
  barrage: { label: '連撃', spCost: 55, cooldown: 2, effect: '威力0.65倍の3連続攻撃', damaging: true },
  drain: { label: '吸収', spCost: 50, cooldown: 2, effect: '威力1.4倍。与えたダメージの半分を回復', damaging: true },
  breaker: {
    label: '破砕',
    spCost: 45,
    cooldown: 2,
    effect: '防御を貫く1.5倍攻撃。相手の防御力を3ターン30%下げる',
    damaging: true,
  },
  heal: { label: '回復', spCost: 60, cooldown: 3, effect: '最大HPの32%を回復', damaging: false },
  powerup: { label: '強化', spCost: 40, cooldown: 3, effect: '3ターン、攻撃力が60%上がり、必殺ゲージ+25', damaging: false },
  fortify: {
    label: '鉄壁',
    spCost: 40,
    cooldown: 3,
    effect: '3ターン、防御力が60%上がり、HPを15%回復',
    damaging: false,
  },
  hex: { label: '呪縛', spCost: 45, cooldown: 2, effect: '威力0.8倍。相手の攻撃力を3ターン30%下げる', damaging: true },
  counter: {
    label: '反撃',
    spCost: 35,
    cooldown: 2,
    effect: '次に受ける攻撃を半分にし、攻撃力1.5倍で反撃',
    damaging: false,
  },
};

export const TRAIT_TABLE: Record<Trait, { label: string; en: string; effect: string }> = {
  first: { label: '先制', en: 'FIRST STRIKE', effect: '先に動き、最初の攻撃の威力が1.5倍' },
  guts: { label: '不屈', en: 'GUTS', effect: '1度だけ、倒れるダメージをHP1で耐える' },
  pierce: { label: '貫通', en: 'PIERCE', effect: '相手の防御力を25%無視する' },
  regen: { label: '再生', en: 'REGEN', effect: '自分の番の初めに、最大HPの2.5%を回復' },
  focus: { label: '集中', en: 'FOCUS', effect: 'SPの回復量が2倍。スキルの威力1.2倍' },
  ironwall: { label: '堅牢', en: 'IRONWALL', effect: 'HPが半分を切ると、防御力が50%上がる' },
  fighter: { label: '闘志', en: 'FIGHTER', effect: '必殺ゲージが1.5倍たまる' },
  lucky: { label: '強運', en: 'LUCKY', effect: '会心率が25%になる' },
};

export const ULT_TABLE: Record<UltStyle, { label: string; hits: number }> = {
  beam: { label: 'ビーム', hits: 1 },
  slash: { label: '一閃', hits: 1 },
  meteor: { label: '流星', hits: 3 },
  burst: { label: '爆発', hits: 1 },
  rush: { label: '乱舞', hits: 5 },
};

export const WEAPON_LABEL: Record<WeaponType, string> = {
  none: '拳',
  sword: '剣',
  lance: '槍',
  rifle: 'ライフル',
  hammer: '槌',
  shield: '盾',
  claw: '爪',
};

export const ULT_POWER = 3.0;
