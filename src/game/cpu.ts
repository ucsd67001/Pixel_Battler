// 固定のコンピュータキャラと、その考え方

import type { Character, CharacterSpec } from './types';
import { SKILL_TABLE } from './data';
import { type ActionType, type BattleState, type Rng, type Side, canUse, foe, MAX_GAUGE } from './battle';

const CPU_SPEC: CharacterSpec = {
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
};

export const CPU_CHARACTER: Character = {
  id: 'cpu-vortex',
  seed: 'cpu-vortex',
  spec: CPU_SPEC,
  stats: { hp: 2150, sp: 110, atk: 245, def: 225 },
  rank: 'A',
  skill: {
    kind: CPU_SPEC.skill.kind,
    name: CPU_SPEC.skill.name,
    description: CPU_SPEC.skill.description,
    spCost: SKILL_TABLE[CPU_SPEC.skill.kind].spCost,
    cooldown: SKILL_TABLE[CPU_SPEC.skill.kind].cooldown,
  },
  createdAt: 0,
  source: 'cpu',
};

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
  if (hpRatio < 0.3 && rng() < 0.2) return 'guard';
  return 'attack';
}
