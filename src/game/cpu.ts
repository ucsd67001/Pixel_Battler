// コンピュータの敵（三体）と、その考え方

import type { Character, CharacterSpec } from './types';
import { SKILL_TABLE } from './data';
import { type ActionType, type BattleState, type Rng, type Side, canUse, foe, MAX_GAUGE } from './battle';

// 敵は三体。バトルのたびに、ランダムで一体が出てくる（前と同じ敵は、続けて出にくくする）。
// 体の形・属性・必殺技の型を、三体でばらばらにしてある。強さはどれもランクA。

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
  { hp: 2150, sp: 110, atk: 245, def: 225 },
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
  { hp: 1850, sp: 100, atk: 290, def: 175 },
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
  { hp: 1950, sp: 150, atk: 235, def: 200 },
);

export const CPU_CHARACTERS: Character[] = [VORTEX, GARUFLARE, LUMINAS];
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
