// キャラの設計図（AIが写真から決める部分）と、ゲームで使う形

export const FORMS = ['humanoid', 'beast', 'floater'] as const;
export const ELEMENTS = ['blaze', 'tide', 'verdant', 'light', 'dark'] as const;
export const HEADS = ['vfin', 'horns', 'mono', 'crest', 'ears', 'crown'] as const;
export const BODIES = ['standard', 'slim', 'heavy'] as const;
export const ARMS = ['standard', 'heavy', 'blade'] as const;
export const LEGS = ['standard', 'heavy', 'thruster'] as const;
export const BACKS = ['none', 'wings', 'boosters', 'cannons', 'cape'] as const;
export const WEAPONS = ['none', 'sword', 'lance', 'rifle', 'hammer', 'shield', 'claw'] as const;
export const SKILL_KINDS = [
  'strike', 'barrage', 'drain', 'breaker', 'heal', 'powerup', 'fortify', 'hex', 'counter',
] as const;
export const ULT_STYLES = ['beam', 'slash', 'meteor', 'burst', 'rush'] as const;
export const TRAITS = ['first', 'guts', 'pierce', 'regen', 'focus', 'ironwall', 'fighter', 'lucky'] as const;

export type Form = (typeof FORMS)[number];
export type Element = (typeof ELEMENTS)[number];
export type HeadType = (typeof HEADS)[number];
export type BodyType = (typeof BODIES)[number];
export type ArmType = (typeof ARMS)[number];
export type LegType = (typeof LEGS)[number];
export type BackType = (typeof BACKS)[number];
export type WeaponType = (typeof WEAPONS)[number];
export type SkillKind = (typeof SKILL_KINDS)[number];
export type UltStyle = (typeof ULT_STYLES)[number];
export type Trait = (typeof TRAITS)[number];

export interface Bias {
  hp: number;
  sp: number;
  atk: number;
  def: number;
}

export interface CharacterSpec {
  motif: string;
  name: string;
  title: string;
  description: string;
  form: Form;
  element: Element;
  bias: Bias;
  parts: {
    head: HeadType;
    body: BodyType;
    arms: ArmType;
    legs: LegType;
    back: BackType;
    weapon: WeaponType;
  };
  colors: { primary: string; secondary: string; accent: string; eye: string };
  skill: { name: string; kind: SkillKind; description: string };
  ultimate: { name: string; style: UltStyle; description: string; shout: string };
  trait: Trait;
  // 特別な写真から生まれたロボ（1）。総合力と技が少し強くなる。
  // どんな写真が特別かは、サーバーの鍵の置き場（HIDDEN_RULE）にだけ書く。リポジトリには書かない
  bonus?: 0 | 1;
}

export interface Stats {
  hp: number;
  sp: number;
  atk: number;
  def: number;
}

export type Rank = 'S' | 'A' | 'B' | 'C';

export interface SkillDef {
  kind: SkillKind;
  name: string;
  description: string;
  spCost: number;
  cooldown: number;
}

export interface Character {
  id: string;
  seed: string;
  spec: CharacterSpec;
  stats: Stats;
  rank: Rank;
  skill: SkillDef;
  createdAt: number;
  thumb?: string;
  source: 'ai' | 'local' | 'cpu';
  // 文の習わない漢字を、ガレージで書き直した日（一体につき一度だけ。漢字の決まりを入れる前に作ったロボのため）
  textFixedAt?: number;
}
