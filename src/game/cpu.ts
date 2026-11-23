// コンピュータの敵（三体）と、その考え方

import type { Character, CharacterSpec } from './types';
import { SKILL_TABLE } from './data';
import { type ActionType, type BattleState, type Rng, type Side, canUse, foe, MAX_GAUGE } from './battle';

// 敵は九体（2026-11-23 に三体から九体に）。バトルのたびに、ランダムで一体が出てくる（同じ敵は続けて出ない）。
// 体の形は三体ずつ。属性・スキル・必殺技の型・特性が、なるべくかぶらないようにしてある。強さはどれもランクA。
// 数字を変えたら npm run sim で、敵ごとの勝率（45〜55% くらい）を確かめる。

function cpu(id: string, spec: CharacterSpec, stats: Character['stats']): Character {
  return {
    id,
    seed: id,
    spec,
    stats,
    rank: 'A',
    skill: {
      kind: spec.skill.kind,
      name: spec.skill.name,
      description: spec.skill.description,
      spCost: SKILL_TABLE[spec.skill.kind].spCost,
      cooldown: SKILL_TABLE[spec.skill.kind].cooldown,
    },
    createdAt: 0,
    source: 'cpu',
  };
}

// ① 人型・夜・ハンマー・流星（かたくて重い）
const VORTEX = cpu(
  'cpu-vortex',
  {
    motif: '古い鉄の門',
    name: 'ヴォルテクス',
    title: '試練の番人',
    description: '古い鉄の門から生まれた番人。戦いに来た者の力をたしかめ、重いハンマーで守りごとたたきつぶす。',
    form: 'humanoid',
    element: 'dark',
    bias: { hp: 4, sp: 2, atk: 3, def: 4 },
    parts: { head: 'mono', body: 'heavy', arms: 'heavy', legs: 'heavy', back: 'cannons', weapon: 'hammer' },
    colors: { primary: '#3a3f4d', secondary: '#9aa3b5', accent: '#ff3b5c', eye: '#ff2a4a' },
    skill: { name: '鉄門ハンマー', kind: 'breaker', description: 'ガードの上から、まとめてたたきつぶす' },
    ultimate: {
      name: 'ギガ・クラッシャー',
      style: 'meteor',
      description: '夜空から鉄のかたまりを落とし、まわりごとおしつぶす',
      shout: 'この試練、のりこえてみせろ！',
    },
    trait: 'ironwall',
  },
  { hp: 2120, sp: 110, atk: 242, def: 222 },
);

// ② けもの型・火・クロー・ラッシュ（速くて強い、守りは弱め）
const GARUFLARE = cpu(
  'cpu-garuflare',
  {
    motif: '火山の岩',
    name: 'ガルフレア',
    title: '火山の番犬',
    description: '火山の岩から生まれた、四本足のロボ。あついつめで、目にもとまらぬ速さでかけまわる。',
    form: 'beast',
    element: 'blaze',
    bias: { hp: 3, sp: 2, atk: 5, def: 2 },
    parts: { head: 'horns', body: 'slim', arms: 'blade', legs: 'thruster', back: 'boosters', weapon: 'claw' },
    colors: { primary: '#2b2220', secondary: '#ff6a2a', accent: '#ffd23a', eye: '#ffb02e' },
    skill: { name: 'フレイムクロー', kind: 'barrage', description: '火をまとったつめで、三回続けて切りさく' },
    ultimate: {
      name: 'ボルケーノ・ラッシュ',
      style: 'rush',
      description: '火山がふき出すように、休まずつめをたたきこむ',
      shout: '火の速さに、ついてこれるか！',
    },
    trait: 'first',
  },
  { hp: 1850, sp: 100, atk: 268, def: 170 },
);

// ③ 空中型・光・ライフル・ビーム（回復しながら、遠くから打つ）
const LUMINAS = cpu(
  'cpu-luminas',
  {
    motif: '夜空の月',
    name: 'ルミナス',
    title: '月の見はり番',
    description: '夜空の月の光から生まれた、空にうかぶロボ。光を集めて、遠くから打ちぬく。',
    form: 'floater',
    element: 'light',
    bias: { hp: 3, sp: 5, atk: 3, def: 3 },
    parts: { head: 'crown', body: 'standard', arms: 'standard', legs: 'standard', back: 'wings', weapon: 'rifle' },
    colors: { primary: '#e9ecf5', secondary: '#7a8cff', accent: '#ffd84a', eye: '#9fe8ff' },
    skill: { name: 'ムーンドレイン', kind: 'drain', description: '月の光で打ち、相手の力を自分の力にかえる' },
    ultimate: {
      name: 'ルナ・キャノン',
      style: 'beam',
      description: '月の光を一つに集めた、太いビームを放つ',
      shout: '光よ、まっすぐつらぬけ！',
    },
    trait: 'focus',
  },
  { hp: 1980, sp: 150, atk: 238, def: 200 },
);

// ④ 人型・水・ソード・スラッシュ（受けて返す、会心の一太刀）
const FROSTIA = cpu(
  'cpu-frostia',
  {
    motif: '冬のつらら',
    name: 'フロスティア',
    title: '氷の刀使い',
    description: '冬のつららから生まれた、すらりとしたロボ。こおった刀で、相手のこうげきを受け止めて切り返す。',
    form: 'humanoid',
    element: 'tide',
    bias: { hp: 3, sp: 3, atk: 4, def: 3 },
    parts: { head: 'vfin', body: 'slim', arms: 'blade', legs: 'standard', back: 'cape', weapon: 'sword' },
    colors: { primary: '#dff3ff', secondary: '#3a8fd9', accent: '#b8e8ff', eye: '#7ff6ff' },
    skill: { name: 'アイスミラー', kind: 'counter', description: '氷のかがみで受け止めて、そのまま切り返す' },
    ultimate: {
      name: 'ブリザード・スラッシュ',
      style: 'slash',
      description: 'ふぶきといっしょに、ひと息で切りぬける',
      shout: 'こおりつけ、ひと太刀で！',
    },
    trait: 'lucky',
  },
  { hp: 2050, sp: 120, atk: 270, def: 200 },
);

// ⑤ 人型・森・ランス・大ばくはつ（力をためて、一気にはじける）
const TAKELANCER = cpu(
  'cpu-takelancer',
  {
    motif: '竹林',
    name: 'タケランサー',
    title: '竹林のやり使い',
    description: '竹林から生まれた、まっすぐなロボ。竹のようにしなって、何度たおされても起き上がる。',
    form: 'humanoid',
    element: 'verdant',
    bias: { hp: 3, sp: 3, atk: 4, def: 2 },
    parts: { head: 'crest', body: 'standard', arms: 'standard', legs: 'thruster', back: 'boosters', weapon: 'lance' },
    colors: { primary: '#4a8a3c', secondary: '#e0d29a', accent: '#2f5e2a', eye: '#8ee05a' },
    skill: { name: 'グリーンチャージ', kind: 'powerup', description: '竹のように、ぐんぐん力をのばす' },
    ultimate: {
      name: 'バンブー・バースト',
      style: 'burst',
      description: 'ためた力を、竹林ごと一気にはじけさせる',
      shout: 'まっすぐ、つきぬけろ！',
    },
    trait: 'guts',
  },
  { hp: 1900, sp: 115, atk: 256, def: 185 },
);

// ⑥ けもの型・水・シールド・流星（かたくて、自分で回復する）
const TURTRON = cpu(
  'cpu-turtron',
  {
    motif: '海がめ',
    name: 'タートロン',
    title: '海の守り神',
    description: '海がめから生まれた、大きなこうらのロボ。ゆっくり歩くが、こうらはどんなこうげきも通さない。',
    form: 'beast',
    element: 'tide',
    bias: { hp: 5, sp: 2, atk: 2, def: 5 },
    parts: { head: 'mono', body: 'heavy', arms: 'heavy', legs: 'heavy', back: 'cannons', weapon: 'shield' },
    colors: { primary: '#2f6f6a', secondary: '#9fd8c8', accent: '#e0c060', eye: '#7fffe0' },
    skill: { name: 'シェルウォール', kind: 'fortify', description: 'こうらをかためて、体を休める' },
    ultimate: {
      name: 'アクア・メテオ',
      style: 'meteor',
      description: '海の水を空に上げて、流星のように落とす',
      shout: '海の力を、思い知れ！',
    },
    trait: 'regen',
  },
  { hp: 2090, sp: 110, atk: 207, def: 222 },
);

// ⑦ けもの型・森・ソード（角）・スラッシュ（相手を弱らせて、守りをつらぬく）
const HORNBEAT = cpu(
  'cpu-hornbeat',
  {
    motif: 'カブトムシ',
    name: 'ホーンビート',
    title: '森の王者',
    description: 'カブトムシから生まれた、大きな角のロボ。夜の森を飛び回り、角でどんな守りもつらぬく。',
    form: 'beast',
    element: 'verdant',
    bias: { hp: 3, sp: 2, atk: 5, def: 3 },
    parts: { head: 'horns', body: 'standard', arms: 'blade', legs: 'standard', back: 'wings', weapon: 'sword' },
    colors: { primary: '#2a1f18', secondary: '#7a4f2a', accent: '#d9a53a', eye: '#ff5a3a' },
    skill: { name: 'ジャングルミスト', kind: 'hex', description: '森のきりで相手をつつみ、力をうばう' },
    ultimate: {
      name: 'ホーン・スラッシュ',
      style: 'slash',
      description: '大きな角をふり上げて、まっすぐ切り上げる',
      shout: '森の王者の力を見よ！',
    },
    trait: 'pierce',
  },
  { hp: 1900, sp: 105, atk: 280, def: 185 },
);

// ⑧ 空中型・夜・クロー・ビーム（回復しながら、ねばり強く戦う）
const PUMPKID = cpu(
  'cpu-pumpkid',
  {
    motif: 'ハロウィンのかぼちゃ',
    name: 'パンプキッド',
    title: '夜のいたずら王',
    description: 'ハロウィンのかぼちゃから生まれた、空にうかぶロボ。ろうそくの火で、きずをなおしながら戦う。',
    form: 'floater',
    element: 'dark',
    bias: { hp: 4, sp: 4, atk: 2, def: 3 },
    parts: { head: 'ears', body: 'standard', arms: 'standard', legs: 'standard', back: 'cape', weapon: 'claw' },
    colors: { primary: '#ff8a1f', secondary: '#3a2550', accent: '#7a3cff', eye: '#ffd23a' },
    skill: { name: 'キャンドルライト', kind: 'heal', description: 'ろうそくの火で、きずをなおす' },
    ultimate: {
      name: 'ランタン・ビーム',
      style: 'beam',
      description: 'かぼちゃの口から、むらさきの光をはき出す',
      shout: 'いたずらの時間だよ！',
    },
    trait: 'fighter',
  },
  { hp: 2060, sp: 130, atk: 228, def: 205 },
);

// ⑨ 空中型・光・ライフル・ラッシュ（先に動いて、大きな一発）
const HANABEAT = cpu(
  'cpu-hanabeat',
  {
    motif: '夏の花火',
    name: 'ハナビート',
    title: '夏祭りの花火師',
    description: '夏の花火から生まれた、空にうかぶロボ。夜空に大きな花をさかせるように、光の玉を打ち上げる。',
    form: 'floater',
    element: 'light',
    bias: { hp: 3, sp: 3, atk: 4, def: 2 },
    parts: { head: 'vfin', body: 'slim', arms: 'standard', legs: 'standard', back: 'boosters', weapon: 'rifle' },
    colors: { primary: '#1c2350', secondary: '#ff4f8b', accent: '#ffd84a', eye: '#ffef7a' },
    skill: { name: 'ドカンスター', kind: 'strike', description: '大きな光の玉を、一発ドカンと打ちこむ' },
    ultimate: {
      name: 'スターマイン・ラッシュ',
      style: 'rush',
      description: '色とりどりの花火を、休まず打ち上げる',
      shout: '夜空に、さけ！',
    },
    trait: 'first',
  },
  { hp: 1900, sp: 115, atk: 258, def: 175 },
);

export const CPU_CHARACTERS: Character[] = [VORTEX, GARUFLARE, LUMINAS, FROSTIA, TAKELANCER, TURTRON, HORNBEAT, PUMPKID, HANABEAT];
/** タイトル画面などで使う、いつもの一体 */
export const CPU_CHARACTER = VORTEX;

// 前と同じ敵が続けて出にくいように、前の敵を覚えておく
let lastCpu = '';
export function pickCpu(rng: () => number = Math.random): Character {
  const pool = CPU_CHARACTERS.filter((c) => c.id !== lastCpu);
  const c = pool[Math.floor(rng() * pool.length)] ?? VORTEX;
  lastCpu = c.id;
  return c;
}

export function chooseAction(st: BattleState, side: Side, rng: Rng): ActionType {
  const me = st.f[side];
  const op = st.f[foe(side)];
  const hpRatio = me.hp / me.c.stats.hp;
  const kind = me.c.skill.kind;
  const skillOk = canUse(st, side, 'skill');

  if (me.gauge >= MAX_GAUGE) return 'ultimate';
  if (skillOk && kind === 'heal' && hpRatio < 0.45) return 'skill';
  if (skillOk && (kind === 'fortify' || kind === 'counter') && op.gauge >= MAX_GAUGE) return 'skill';
  if (op.gauge >= MAX_GAUGE && rng() < 0.5) return 'guard';
  if (skillOk && SKILL_TABLE[kind].damaging && rng() < 0.7) return 'skill';
  if (skillOk && kind === 'powerup' && !me.buffs.some((b) => b.label === 'こうげきアップ')) return 'skill';
  if (skillOk && kind === 'fortify' && hpRatio < 0.7 && !me.buffs.some((b) => b.label === 'ぼうぎょアップ'))
    return 'skill';
  if (skillOk && kind === 'counter' && rng() < 0.35) return 'skill';
  if (hpRatio < 0.4 && !me.lastGuard && rng() < 0.3) return 'guard'; // ガードで回復できるので、弱ってきたら使う
  return 'attack';
}
