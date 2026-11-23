// コンピュータの敵（九体）と、その考え方

import type { Character, CharacterSpec } from './types';
import { SKILL_TABLE, skillOf } from './data';
import { type ActionType, type BattleState, type Rng, type Side, canUse, foe, MAX_GAUGE } from './battle';

// 敵は九体（2026-11-23 に三体から九体に）。バトルのたびに、ランダムで一体が出てくる（同じ敵は続けて出ない）。
// 体の形は三体ずつ。属性・スキル・必殺技の型・特性が、なるべくかぶらないようにしてある。強さはどれもランクA。
// 2026-11-23：これから作るストーリーの最初の9章のボスとして、名前・二つ名・属性を付け直した（地・水・火・風・光・夜・森・海・月。docs/STORY.md）。
// 並びは章の順。体（見た目）は前の九体のまま
// 数字を変えたら npm run sim で、敵ごとの勝率（45〜55% くらい）を確かめる。

function cpu(id: string, spec: CharacterSpec, stats: Character['stats']): Character {
  return {
    id,
    seed: id,
    spec,
    stats,
    rank: 'A',
    skill: skillOf(spec.skill),
    createdAt: 0,
    source: 'cpu',
  };
}

// ① 地の章：人型・地・流星（かたくて重い）。もとはヴォルテクス
const DOLGAIA = cpu(
  'cpu-dolgaia',
  {
    motif: '古い鉄の門',
    name: 'ドルガイア',
    title: '大地の門番',
    description: '古い鉄の門と、大地の岩から生まれた門番。戦いに来た者の力をたしかめ、重いこぶしで守りごとたたきつぶす。',
    form: 'humanoid',
    element: 'verdant', // 地
    bias: { hp: 4, sp: 2, atk: 3, def: 4 },
    parts: { head: 'mono', body: 'heavy', arms: 'heavy', legs: 'heavy', back: 'cannons', weapon: 'hammer' },
    colors: { primary: '#4a3b2e', secondary: '#a8916c', accent: '#e8a23a', eye: '#ffb02e' },
    skill: { name: '鉄門ナックル', kind: 'breaker', description: 'ガードの上から、こぶしでまとめてたたきつぶす' },
    ultimate: {
      name: 'ギガ・クラッシャー',
      style: 'meteor',
      description: '空から大きな岩を落とし、まわりごとおしつぶす',
      shout: 'この試練、のりこえてみせろ！',
    },
    trait: 'ironwall',
  },
  { hp: 2120, sp: 110, atk: 242, def: 222 },
);

// ③ 火の章：けもの型・火・ラッシュ（速くて強い、守りは弱め）。もとはガルフレア
const BURNHOUND = cpu(
  'cpu-burnhound',
  {
    motif: '火山の岩',
    name: 'バーンハウンド',
    title: 'ほのおを走る番犬',
    description: '火山の岩から生まれた、四本足のロボ。火をまとった体で、目にもとまらぬ速さでかけまわる。',
    form: 'beast',
    element: 'blaze',
    bias: { hp: 3, sp: 2, atk: 5, def: 2 },
    parts: { head: 'horns', body: 'slim', arms: 'blade', legs: 'thruster', back: 'boosters', weapon: 'claw' },
    colors: { primary: '#2b2220', secondary: '#ff6a2a', accent: '#ffd23a', eye: '#ffb02e' },
    skill: { name: 'フレイムタックル', kind: 'barrage', description: '火をまとった体で、三回続けて体当たりする' },
    ultimate: {
      name: 'ボルケーノ・ラッシュ',
      style: 'rush',
      description: '火山がふき出すように、休まずキックをたたきこむ',
      shout: '火の速さに、ついてこれるか！',
    },
    trait: 'first',
  },
  { hp: 1910, sp: 100, atk: 268, def: 170 },
);

// ⑨ 月の章：空中型・光・ビーム（回復しながら、遠くから打つ）
const LUMINAS = cpu(
  'cpu-luminas',
  {
    motif: '夜空の月',
    name: 'ルミナス',
    title: '三日月の見はり番',
    description: '夜空の月の光から生まれた、空にうかぶロボ。光を集めて、遠くから打ちぬく。',
    form: 'floater',
    element: 'light',
    bias: { hp: 3, sp: 5, atk: 3, def: 3 },
    parts: { head: 'crown', body: 'standard', arms: 'standard', legs: 'standard', back: 'wings', weapon: 'rifle' },
    colors: { primary: '#e9ecf5', secondary: '#7a8cff', accent: '#ffd84a', eye: '#9fe8ff' },
    skill: { name: 'ムーンドレイン', kind: 'drain', description: '月の光で打ち、相手の力を自分の力にかえる' },
    ultimate: {
      name: 'ルナ・ビーム',
      style: 'beam',
      description: '月の光を一つに集めた、太いビームを放つ',
      shout: '光よ、まっすぐつらぬけ！',
    },
    trait: 'focus',
  },
  { hp: 2050, sp: 150, atk: 238, def: 200 },
);

// ② 水の章：人型・水・スラッシュ（受けて返す、会心の一げき）。もとはフロスティア
const SHIZUKLEA = cpu(
  'cpu-shizuklea',
  {
    motif: '冬のつらら',
    name: 'シズクレア',
    title: 'こおれる湖の武道家',
    description: '冬のつららと、こおった湖から生まれた、すらりとしたロボ。こおった手で、相手のこうげきを受け止めて打ち返す。',
    form: 'humanoid',
    element: 'tide',
    bias: { hp: 3, sp: 3, atk: 4, def: 3 },
    parts: { head: 'vfin', body: 'slim', arms: 'blade', legs: 'standard', back: 'cape', weapon: 'sword' },
    colors: { primary: '#dff3ff', secondary: '#3a8fd9', accent: '#b8e8ff', eye: '#7ff6ff' },
    skill: { name: 'アイスミラー', kind: 'counter', description: '氷のかがみで受け止めて、そのまま打ち返す' },
    ultimate: {
      name: 'ブリザード・スラッシュ',
      style: 'slash',
      description: 'ふぶきといっしょに、するどいチョップをふりぬく',
      shout: 'こおりつけ、この一げきで！',
    },
    trait: 'lucky',
  },
  { hp: 2050, sp: 120, atk: 262, def: 196 },
);

// ⑦ 森の章：人型・地・大ばくはつ（力をためて、一気にはじける）。もとはタケランサー
const BAMBOON = cpu(
  'cpu-bamboon',
  {
    motif: '竹林',
    name: 'バンブーン',
    title: '竹林の守り手',
    description: '竹林から生まれた、まっすぐなロボ。大地に根をはる竹のように、何度たおされても起き上がる。',
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

// ⑧ 海の章：けもの型・水・流星（かたくて、自分で回復する）。もとはタートロン
const TIDALON = cpu(
  'cpu-tidalon',
  {
    motif: '海がめ',
    name: 'タイダロン',
    title: '深い海の守り神',
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
  { hp: 1980, sp: 110, atk: 207, def: 222 },
);

// ④ 風の章：けもの型・風・スラッシュ（相手を弱らせて、守りをつらぬく）。もとはホーンビート
const GALEBEAT = cpu(
  'cpu-galebeat',
  {
    motif: 'カブトムシ',
    name: 'ゲイルビート',
    title: 'つむじ風の王者',
    description: 'カブトムシから生まれた、大きな角のロボ。つむじ風に乗って飛び回り、角でどんな守りもつらぬく。',
    form: 'beast',
    element: 'gale',
    bias: { hp: 3, sp: 2, atk: 5, def: 3 },
    parts: { head: 'horns', body: 'standard', arms: 'blade', legs: 'standard', back: 'wings', weapon: 'sword' },
    colors: { primary: '#1e2f2a', secondary: '#3f9c80', accent: '#d9c23a', eye: '#b8ffe0' },
    skill: { name: 'ゲイルミスト', kind: 'hex', description: '風に乗せたきりで相手をつつみ、力をうばう' },
    ultimate: {
      name: 'ホーン・スラッシュ',
      style: 'slash',
      description: '大きな角をふり上げて、風ごと切り上げる',
      shout: 'つむじ風の力を見よ！',
    },
    trait: 'pierce',
  },
  { hp: 1970, sp: 105, atk: 280, def: 185 },
);

// ⑥ 夜の章：空中型・夜・ビーム（回復しながら、ねばり強く戦う）。もとはパンプキッド
const JACKLAMP = cpu(
  'cpu-jacklamp',
  {
    motif: 'ハロウィンのかぼちゃ',
    name: 'ジャックランプ',
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
  { hp: 2020, sp: 130, atk: 234, def: 205 },
);

// ⑤ 光の章：空中型・光・ラッシュ（先に動いて、大きな一発）。もとはハナビート
const PIKARION = cpu(
  'cpu-pikarion',
  {
    motif: '夏の花火',
    name: 'ピカリオン',
    title: '光の花火師',
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
  { hp: 2000, sp: 115, atk: 258, def: 175 },
);

// 章の順：地・水・火・風・光・夜・森・海・月
export const CPU_CHARACTERS: Character[] = [DOLGAIA, SHIZUKLEA, BURNHOUND, GALEBEAT, PIKARION, JACKLAMP, BAMBOON, TIDALON, LUMINAS];
/** タイトル画面などで使う、いつもの一体 */
export const CPU_CHARACTER = DOLGAIA;

// 前と同じ敵が続けて出にくいように、前の敵を覚えておく
let lastCpu = '';
export function pickCpu(rng: () => number = Math.random): Character {
  const pool = CPU_CHARACTERS.filter((c) => c.id !== lastCpu);
  const c = pool[Math.floor(rng() * pool.length)] ?? DOLGAIA;
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
