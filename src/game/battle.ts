// ターン制バトルの決まり（画面とは切り離した、純粋な計算）。
// 一つの行動ごとに ActionResult を返し、演出はそれを見て動く。

import type { Character } from './types';
import { elementMultiplier, ULT_POWER, ULT_TABLE } from './data';
import { fightMult, spFor } from './level';
import { gearOf } from './items';

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
  miss?: boolean; // 見切りで、かわした（ダメージなし）
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
  // 先に動く：「先手」の特性か、じゅう（アイテム）を持っているほう
  const pf = player.spec.trait === 'first' || gearOf(player).first;
  const cf = cpu.spec.trait === 'first' || gearOf(cpu).first;
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
  const m = (f.c.spec.trait === 'fighter' ? 1.6 : 1) * gearOf(f.c).gauge; // じゅうは、必殺ゲージが早くたまる
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
  // SP のたまる量も、レベルの倍率で大きくする（スキルに使う SP も同じ割合で大きいので、使える回数は Lv1 と同じ）
  // つえ（アイテム）は、さらに少したまる
  me.sp = Math.min(me.c.stats.sp, me.sp + spFor(me.c, (me.c.spec.trait === 'focus' ? 20 : 10) + gearOf(me.c).sp));
  let regen = 0;
  if (me.c.spec.trait === 'regen' && me.hp > 0 && me.hp < me.c.stats.hp) {
    regen = Math.min(me.c.stats.hp - me.hp, Math.round(me.c.stats.hp * 0.018));
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
  // 何回かに分けて当てる技の、1回分の割合（3回なら 1/3）。必殺ゲージのたまり方を、1回で当てる技とそろえるため
  share?: number;
  skill?: boolean;
  ult?: boolean;
  isCounter?: boolean;
}

function dealDamage(st: BattleState, attacker: Side, mult: number, rng: Rng, opts: DmgOpts = {}): Hit {
  const A = st.f[attacker];
  const t = foe(attacker);
  const D = st.f[t];
  let atk = A.c.stats.atk * buffMult(A, 'atk');
  if (A.c.spec.trait === 'grit' && A.hp < A.c.stats.hp * 0.3) atk *= 1.4; // 底力
  let def = D.c.stats.def * buffMult(D, 'def');
  if (D.c.spec.trait === 'ironwall' && D.hp < D.c.stats.hp / 2) def *= 1.6;
  if (A.c.spec.trait === 'pierce') def *= 0.75;
  // アイテムの持ち味（HP・こうげき・ぼうぎょの分は、withItem で数字に入っている）
  const ga = gearOf(A.c);
  const gd = gearOf(D.c);
  def *= 1 - ga.pierce; // やり
  let m = mult;
  if (A.c.spec.trait === 'focus' && opts.skill) m *= 1.35;
  if (opts.skill) m *= ga.skill; // つえ
  if (A.c.spec.bonus && (opts.skill || opts.ult)) m *= BONUS_SKILL; // 特別な写真のロボは、技が少し強い
  if (A.c.spec.trait === 'first' && !A.firstUsed) m *= 1.5;
  const eff = elementMultiplier(A.c.spec.element, D.c.spec.element);
  // 見切り：ときどき、ひらりとかわす（ダメージも、必殺ゲージも無し）
  if (D.c.spec.trait === 'evade' && rng() < 0.12) {
    return { target: t, amount: 0, crit: false, eff, guarded: false, hpAfter: D.hp, guts: false, miss: true };
  }
  // おの（アイテム）：ときどき空ぶりする（必殺技とカウンターは空ぶりしない）。
  // さいころは、おのを持っているときだけふる（持っていないバトルは、いままでと同じ結果になる）
  if (ga.miss && !opts.ult && !opts.isCounter && rng() < ga.miss) {
    return { target: t, amount: 0, crit: false, eff, guarded: false, hpAfter: D.hp, guts: false, miss: true };
  }
  // かぶと（アイテム）：会心の一打を受けにくく、受けても小さい
  const crit = rng() < (A.c.spec.trait === 'lucky' ? 0.3 : 0.08) * gd.critGuard;
  const critMult = 1 + 0.5 * gd.critGuard;
  // ぼうぎょの効き方の「300」は、受ける側のレベルの倍率で大きくする。
  // こうすると、同じレベルどうしなら Lv1 でも Lv99 でもバトルの長さが同じになる（数字が大きくなっても、ぼうぎょが効きすぎない）
  const K = 300 * fightMult(D.c);
  let dmg = atk * m * 1.35 * (K / (K + def)) * eff * (crit ? critMult : 1) * (0.92 + rng() * 0.16);
  const guarded = D.guarding && !opts.ignoreGuard;
  dmg *= gd.taken; // たて（アイテム）は、いつも少しへらす
  if (guarded) dmg *= (opts.ult ? 0.5 : 0.4) * gd.guard; // ガードすると、もっとへらす
  if (D.counter && !opts.isCounter) dmg *= 0.5;
  let amount = Math.max(1, Math.round(dmg));
  let guts = false;
  if (D.hp - amount <= 0 && D.c.spec.trait === 'guts' && !D.gutsUsed && D.hp > 1) {
    amount = D.hp - 1;
    D.gutsUsed = true;
    guts = true;
  }
  D.hp = Math.max(0, D.hp - amount);
  // 必殺ゲージ：打つと +11、打たれると +14。何回かに分けて当てる技は、合わせて1回分（2026-11-23。
  // それまでは1回ごとにたまり、5回打ちの必殺技で相手のゲージが70もたまっていた）
  const share = opts.share ?? 1;
  if (!opts.ult && !opts.isCounter) addGauge(A, 11 * share);
  addGauge(D, 14 * share);
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
      A.sp = Math.min(A.c.stats.sp, A.sp + spFor(A.c, 15));
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
          hit(1.9);
          break;
        case 'barrage':
          for (let i = 0; i < 3; i++) hit(0.65, { share: 1 / 3 });
          break;
        case 'drain': {
          const h = hit(1.4);
          if (h) heal(h.amount * 0.5);
          break;
        }
        case 'breaker': {
          // 見切りでかわされたら、弱める効果も入らない
          const h = hit(1.5, { ignoreGuard: true });
          if (h && !h.miss) {
            addBuff(D, { stat: 'def', mult: 0.7, turns: 3, fresh: false, label: 'ぼうぎょダウン' });
            res.buffs.push({ target: d, label: 'ぼうぎょダウン', good: false });
          }
          break;
        }
        case 'heal':
          heal(A.c.stats.hp * 0.31);
          break;
        case 'powerup':
          addBuff(A, { stat: 'atk', mult: 1.7, turns: 3, fresh: true, label: 'こうげきアップ' });
          addGauge(A, 25);
          res.buffs.push({ target: a, label: 'こうげきアップ', good: true });
          break;
        case 'fortify':
          addBuff(A, { stat: 'def', mult: 1.6, turns: 3, fresh: true, label: 'ぼうぎょアップ' });
          res.buffs.push({ target: a, label: 'ぼうぎょアップ', good: true });
          heal(A.c.stats.hp * 0.17);
          addGauge(A, 15);
          break;
        case 'hex': {
          const h = hit(0.9);
          if (h && !h.miss) {
            addBuff(D, { stat: 'atk', mult: 0.7, turns: 3, fresh: false, label: 'こうげきダウン' });
            res.buffs.push({ target: d, label: 'こうげきダウン', good: false });
          }
          break;
        }
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
      for (let i = 0; i < n; i++) hit(ULT_POWER / n, { ult: true, share: 1 / n });
      break;
    }
  }

  // 反撃の構え：攻撃を受けたら、受け流して打ち返す
  if (D.counter && res.hits.length > 0 && D.hp > 0) {
    D.counter = false;
    res.counterHit = dealDamage(st, d, 1.7, rng, { ignoreGuard: true, isCounter: true });
    D.firstUsed = true; // 先手の 1.5倍は、カウンターで使っても1回きり
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
