// キャラの設計図（AIが写真から決める部分）と、ゲームで使う形

export const FORMS = ['humanoid', 'beast', 'floater'] as const;
// 属性（2026-11-23 から6種類）：火・水・地・風の4すくみと、光・夜。
// ⚠️ verdant は、もとは「森」。いまは「地」として使う（前に作ったロボの設計図を、書きかえずにそのまま読めるように）
export const ELEMENTS = ['blaze', 'tide', 'verdant', 'gale', 'light', 'dark'] as const;
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
// 特性（2026-11-23 から10種類。grit＝底力・evade＝見切り を足した）
export const TRAITS = ['first', 'guts', 'pierce', 'regen', 'focus', 'ironwall', 'fighter', 'lucky', 'grit', 'evade'] as const;

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
  // 見た目（体の比率）の乱数の種。ほかの人のロボを敵に出すときだけ使う。
  // motif（写真に写っていたもの）を送らずに、持ち主の画面と同じ体つきにするため
  look?: number;
  // 文が「素手で戦うロボ」として書いてあるか（1）。2026-11-23 に全員を素手にしたので、
  // それより前の AI のロボは、ガレージを開いたときなどに一度だけ AI に書き直してもらう（server/analyze.ts の refreshText）
  bare?: 1;
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
  source: 'ai' | 'local' | 'cpu' | 'rival'; // rival＝ほかの人のガレージから来た敵
  // 文の習わない漢字を、ガレージで書き直した日（一体につき一度だけ。漢字の決まりを入れる前に作ったロボのため）
  textFixedAt?: number;
  // ストーリーで育てた分（2026-11-23。src/game/level.ts）。経験値の合計と、そこから出したレベル。
  // ガレージのロボだけが持つ。書きこむのはサーバーだけ（/api/robots/win）。stats は、もとの（Lv1 の）数字のまま
  exp?: number;
  level?: number;
  // ストーリーのバトルで、そのレベルの数字にしてあるロボ（atLevel で付く）。バトルの計算が、SP のたまり方とぼうぎょの効き方を合わせるのに使う
  fightLevel?: number;
}
