// ターン制バトルの決まり（画面とは切り離した、純粋な計算）。
// 一つの行動ごとに ActionResult を返し、演出はそれを見て動く。

import type { Character } from './types';
import { elementMultiplier, SKILL_TABLE, ULT_POWER, ULT_TABLE } from './data';

const BONUS_SKILL = 1.1;

export type Side = 0 | 1;
export type ActionType = 'attack' | 'guard' | 'skill' | 'ultimate';
export type Rng = () => number;

export interface Buff {
  stat: 'atk' | 'def';
  mult: number;
  turns: number;
  fresh: boolean;
  label: string;
}

export interface Fighter {
  c: Character;
  hp: number;
  sp: number;
  gauge: number;
  guarding: boolean;
  buffs: Buff[];
  cooldown: number;
  gutsUsed: boolean;
  counter: boolean;
  firstUsed: boolean;
  lastGuard: boolean; // 前の自分の番もガードだったか（続けてガードしたときは回復しない）
}

export interface BattleState {
  f: [Fighter, Fighter];
  turn: number;
  active: Side;
  over: boolean;
  winner: Side | null;
  draw?: boolean; // MAX_ROUND までに決着がつかなかった
}

export interface Hit {
  target: Side;
  amount: number;
  crit: boolean;
  eff: number;
  guarded: boolean;
  hpAfter: number;
  guts: boolean;
}

export interface ActionResult {
  actor: Side;
  type: ActionType;
  name: string;
  hits: Hit[];
  counterHit?: Hit;
  heal?: { target: Side; amount: number; hpAfter: number };
  buffs: { target: Side; label: string; good: boolean }[];
  ko: Side | null;
}

export interface PreTurn {
  side: Side;
  regen: number;
  hpAfter: number;
}

export const MAX_GAUGE = 100;
/** ガードで回復する量（最大HPの割合）。バーコードバトラーの「防御で回復」にならった（2026-11-22） */
export const GUARD_HEAL = 0.08;
/** このラウンドまでに決着がつかなければ、引き分け（2026-11-22。いちばん長い戦い方でも22ラウンドで終わる） */
export const MAX_ROUND = 25;
/** いまのラウンド（自分と相手が一回ずつ動くと、一つ進む） */
export const roundOf = (st: BattleState) => Math.ceil(st.turn / 2);
export const foe = (s: Side): Side => (s === 0 ? 1 : 0);

function makeFighter(c: Character): Fighter {
  return {
    c,
    hp: c.stats.hp,
    sp: c.stats.sp,
    gauge: 0,
    guarding: false,
    buffs: [],
    cooldown: 0,
    gutsUsed: false,
    counter: false,
    firstUsed: false,
    lastGuard: false,
  };
}

export function createBattle(player: Character, cpu: Character): BattleState {
  const pf = player.spec.trait === 'first';
  const cf = cpu.spec.trait === 'first';
  return {
    f: [makeFighter(player), makeFighter(cpu)],
    turn: 1,
    active: cf && !pf ? 1 : 0,
    over: false,
    winner: null,
  };
}

export function canUse(st: BattleState, side: Side, type: ActionType): boolean {
  const me = st.f[side];
  if (type === 'skill') return me.sp >= me.c.skill.spCost && me.cooldown === 0;
  if (type === 'ultimate') return me.gauge >= MAX_GAUGE;
  return true;
}

function addGauge(f: Fighter, n: number) {
  const m = f.c.spec.trait === 'fighter' ? 1.5 : 1;
  f.gauge = Math.min(MAX_GAUGE, f.gauge + Math.round(n * m));
}

function buffMult(f: Fighter, stat: 'atk' | 'def') {
  return f.buffs.filter((b) => b.stat === stat).reduce((m, b) => m * b.mult, 1);
}

function addBuff(f: Fighter, b: Buff) {
  f.buffs = f.buffs.filter((x) => x.label !== b.label);
  f.buffs.push(b);
}

// 自分の番の初め：防御を解く・SPの回復・再生・クールダウン
export function startTurn(st: BattleState): PreTurn {
  const side = st.active;
  const me = st.f[side];
  me.guarding = false;
  if (me.cooldown > 0) me.cooldown--;
  me.sp = Math.min(me.c.stats.sp, me.sp + (me.c.spec.trait === 'focus' ? 20 : 10));
  let regen = 0;
  if (me.c.spec.trait === 'regen' && me.hp > 0 && me.hp < me.c.stats.hp) {
    regen = Math.min(me.c.stats.hp - me.hp, Math.round(me.c.stats.hp * 0.025));
    me.hp += regen;
  }
  return { side, regen, hpAfter: me.hp };
}

// 自分の番の終わり：強化・弱化の残りターンを減らし、相手の番へ
export function endTurn(st: BattleState): string[] {
  const me = st.f[st.active];
  const expired: string[] = [];
  for (const b of me.buffs) {
    if (b.fresh) b.fresh = false;
    else b.turns--;
    if (b.turns <= 0) expired.push(b.label);
  }
  me.buffs = me.buffs.filter((b) => b.turns > 0);
  st.active = foe(st.active);
  st.turn++;
  if (roundOf(st) > MAX_ROUND) {
    st.over = true;
    st.winner = null;
    st.draw = true;
  }
  return expired;
}

interface DmgOpts {
  ignoreGuard?: boolean;
  skill?: boolean;
  ult?: boolean;
  isCounter?: boolean;
}

function dealDamage(st: BattleState, attacker: Side, mult: number, rng: Rng, opts: DmgOpts = {}): Hit {
  const A = st.f[attacker];
  const t = foe(attacker);
  const D = st.f[t];
  const atk = A.c.stats.atk * buffMult(A, 'atk');
  let def = D.c.stats.def * buffMult(D, 'def');
  if (D.c.spec.trait === 'ironwall' && D.hp < D.c.stats.hp / 2) def *= 1.5;
  if (A.c.spec.trait === 'pierce') def *= 0.75;
  let m = mult;
  if (A.c.spec.trait === 'focus' && opts.skill) m *= 1.2;
  if (A.c.spec.bonus && (opts.skill || opts.ult)) m *= BONUS_SKILL; // 特別な写真のロボは、技が少し強い
  if (A.c.spec.trait === 'first' && !A.firstUsed) m *= 1.5;
  const eff = elementMultiplier(A.c.spec.element, D.c.spec.element);
  const crit = rng() < (A.c.spec.trait === 'lucky' ? 0.25 : 0.08);
  let dmg = atk * m * 1.35 * (300 / (300 + def)) * eff * (crit ? 1.5 : 1) * (0.92 + rng() * 0.16);
  const guarded = D.guarding && !opts.ignoreGuard;
  if (guarded) dmg *= opts.ult ? 0.5 : 0.4;
  if (D.counter && !opts.isCounter) dmg *= 0.5;
  let amount = Math.max(1, Math.round(dmg));
  let guts = false;
  if (D.hp - amount <= 0 && D.c.spec.trait === 'guts' && !D.gutsUsed && D.hp > 1) {
    amount = D.hp - 1;
    D.gutsUsed = true;
    guts = true;
  }
  D.hp = Math.max(0, D.hp - amount);
  if (!opts.ult && !opts.isCounter) addGauge(A, 11);
  addGauge(D, 14);
  return { target: t, amount, crit, eff, guarded, hpAfter: D.hp, guts };
}

export function act(st: BattleState, type: ActionType, rng: Rng): ActionResult {
  const a = st.active;
  const d = foe(a);
  const A = st.f[a];
  const D = st.f[d];
  const res: ActionResult = { actor: a, type, name: '', hits: [], buffs: [], ko: null };
  const hit = (mult: number, opts?: DmgOpts) => {
    if (D.hp <= 0) return null;
    const h = dealDamage(st, a, mult, rng, { ...opts, skill: type === 'skill' });
    res.hits.push(h);
    return h;
  };
  const heal = (amount: number) => {
    const n = Math.max(0, Math.min(A.c.stats.hp - A.hp, Math.round(amount)));
    A.hp += n;
    res.heal = { target: a, amount: n, hpAfter: A.hp };
  };

  switch (type) {
    case 'attack':
      res.name = 'アタック';
      hit(1.0);
      break;
    case 'guard':
      res.name = 'ガード＆リペア';
      A.guarding = true;
      A.sp = Math.min(A.c.stats.sp, A.sp + 15);
      addGauge(A, 10);
      // 守りながら、体勢を立て直して回復する。続けてガードしたときは回復しない（ガードだけをくり返して、終わらなくならないように）
      if (!A.lastGuard) heal(A.c.stats.hp * GUARD_HEAL);
      break;
    case 'skill': {
      const sk = A.c.skill;
      res.name = sk.name;
      A.sp -= sk.spCost;
      A.cooldown = sk.cooldown;
      switch (sk.kind) {
        case 'strike':
          hit(2.0);
          break;
        case 'barrage':
          for (let i = 0; i < 3; i++) hit(0.65);
          break;
        case 'drain': {
          const h = hit(1.4);
          if (h) heal(h.amount * 0.5);
          break;
        }
        case 'breaker':
          hit(1.5, { ignoreGuard: true });
          addBuff(D, { stat: 'def', mult: 0.7, turns: 3, fresh: false, label: 'ぼうぎょダウン' });
          res.buffs.push({ target: d, label: 'ぼうぎょダウン', good: false });
          break;
        case 'heal':
          heal(A.c.stats.hp * 0.32);
          break;
        case 'powerup':
          addBuff(A, { stat: 'atk', mult: 1.6, turns: 3, fresh: true, label: 'こうげきアップ' });
          addGauge(A, 25);
          res.buffs.push({ target: a, label: 'こうげきアップ', good: true });
          break;
        case 'fortify':
          addBuff(A, { stat: 'def', mult: 1.6, turns: 3, fresh: true, label: 'ぼうぎょアップ' });
          res.buffs.push({ target: a, label: 'ぼうぎょアップ', good: true });
          heal(A.c.stats.hp * 0.15);
          addGauge(A, 15);
          break;
        case 'hex':
          hit(0.8);
          addBuff(D, { stat: 'atk', mult: 0.7, turns: 3, fresh: false, label: 'こうげきダウン' });
          res.buffs.push({ target: d, label: 'こうげきダウン', good: false });
          break;
        case 'counter':
          A.counter = true;
          res.buffs.push({ target: a, label: 'カウンターの構え', good: true });
          break;
      }
      break;
    }
    case 'ultimate': {
      const u = A.c.spec.ultimate;
      res.name = u.name;
      A.gauge = 0;
      const n = ULT_TABLE[u.style].hits;
      for (let i = 0; i < n; i++) hit(ULT_POWER / n, { ult: true });
      break;
    }
  }

  // 反撃の構え：攻撃を受けたら、受け流して打ち返す
  if (D.counter && res.hits.length > 0 && D.hp > 0) {
    D.counter = false;
    res.counterHit = dealDamage(st, d, 1.5, rng, { ignoreGuard: true, isCounter: true });
  }
  if (res.hits.length > 0) A.firstUsed = true;
  A.lastGuard = type === 'guard';

  if (D.hp <= 0) {
    res.ko = d;
    st.over = true;
    st.winner = a;
  } else if (A.hp <= 0) {
    res.ko = a;
    st.over = true;
    st.winner = d;
  }
  return res;
}

export function skillIsDamaging(c: Character) {
  return SKILL_TABLE[c.skill.kind].damaging;
}
