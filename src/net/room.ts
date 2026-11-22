// ふたりで対戦の部屋（いまは一つだけ）。
//
// しくみ：
//   ・部屋に入った人は、8秒ごとに「いるよ」の時刻（seen）を書く。60秒書かれていない人は、いないことにする
//   ・バトルの計算は、二台がそれぞれ自分で行う。二台で同じ「さいころの種」（seed）を使い、選んだ技だけを送り合うので、同じ結果になる
//   ・どちらのスマホでも、自分のロボが左（side 0）に出る。計算の決まり（battle.ts）は左右を入れかえても同じ結果になる
//   ・本番は Firestore の rooms/main（バトル）と rooms/main/players/{uid}（いる人。一人一枚）。
//     Google でログインした人ならだれでも使える。ほかの人の分は書きかえられない（firestore.rules）
//   ・知らない人とも会うので、出すのはロボの名前だけ（Google の名前は出さない）。写真（thumb）は部屋に送らない
//   ・手元で試すときは、URL に ?localroom を付けると、同じブラウザの二つのタブで話す（開発中だけ）

import type { ActionType } from '../game/battle';
import type { Character } from '../game/types';
import { currentUser, firestore } from '../lib/firebase';
import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, runTransaction, setDoc, updateDoc, where, type Firestore,
} from 'firebase/firestore';

export const STALE_MS = 60_000; // これより長く「いるよ」が無い人は、いないことにする
const BEAT_MS = 8_000;
const START_FRESH_MS = 120_000; // これより古いバトルの始まりには、飛びこまない

export interface RoomPlayer {
  uid: string;
  name: string;
  char: Character;
  seen: number;
  joined: number;
}
export interface RoomBattle {
  id: string;
  seed: number;
  first: string; // 先に動く人
  p: [string, string];
  names: Record<string, string>;
  chars: Record<string, Character>;
  at: number;
}
export interface RoomState {
  players: RoomPlayer[]; // いまいる人（入った順）
  battle: RoomBattle | null;
}
export type MoveAction = ActionType | 'quit';
export interface Move {
  bid: string;
  n: number; // そのバトルの何番目の行動か
  by: string;
  action: MoveAction;
  hp: Record<string, number>; // 動いた人の画面で、行動のあとの HP（ずれたときに合わせる）
}

interface RawRoom {
  players?: Record<string, Partial<Omit<RoomPlayer, 'uid'>>>;
  battle?: RoomBattle | null;
}

// ── 部屋の決まり（Firestore でも、手元の試しでも同じ） ──
function normalize(raw: RawRoom, now = Date.now()): RoomState {
  const players = Object.entries(raw.players ?? {})
    .filter(([, p]) => p && p.char && p.name && now - (p.seen ?? 0) < STALE_MS)
    .map(([uid, p]) => ({ uid, ...(p as Omit<RoomPlayer, 'uid'>) }))
    .sort((a, b) => a.joined - b.joined);
  return { players, battle: raw.battle ?? null };
}

// 部屋に送るロボ：写真（thumb）を外す（知らない人に、家族の写真を見せないため）
export function publicChar(c: Character): Character {
  const { thumb: _thumb, ...rest } = c;
  return rest;
}

function joinRoom(raw: RawRoom, me: string, full: Character): RawRoom | 'full' {
  const char = publicChar(full);
  const name = char.spec.name; // 出す名前は、ロボの名前だけ
  const now = Date.now();
  const st = normalize(raw, now);
  if (st.players.filter((p) => p.uid !== me).length >= 2) return 'full';
  const players: NonNullable<RawRoom['players']> = {};
  for (const p of st.players) players[p.uid] = { name: p.name, char: p.char, seen: p.seen, joined: p.joined }; // いない人は消す
  const prev = st.players.find((p) => p.uid === me);
  players[me] = { name, char, seen: now, joined: prev?.joined ?? now };
  // 新しく入ってきたときは、前のバトル（もう終わったもの・ぬけたもの）を片づける。
  // ロボをかえるだけ（もう中にいる）のときは、そのまま
  return { players, battle: prev ? raw.battle ?? null : null };
}

function startIn(raw: RawRoom, me: string): RawRoom | null | 'already' {
  const st = normalize(raw);
  if (st.players.length < 2 || !st.players.some((p) => p.uid === me)) return null;
  // ついさっき、もう一人が始めたバトルがあれば、それに乗る
  if (raw.battle && raw.battle.p.includes(me) && Date.now() - raw.battle.at < 10_000) return 'already';
  const [a, b] = st.players;
  const seed = Math.floor(Math.random() * 2 ** 32);
  // 先に動く人：「先手」の特性を持つほう。どちらも同じなら、さいころで決める
  const fa = a.char.spec.trait === 'first';
  const fb = b.char.spec.trait === 'first';
  const first = fa && !fb ? a.uid : fb && !fa ? b.uid : seed % 2 ? a.uid : b.uid;
  const battle: RoomBattle = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    seed,
    first,
    p: [a.uid, b.uid],
    names: { [a.uid]: a.name, [b.uid]: b.name },
    chars: { [a.uid]: a.char, [b.uid]: b.char },
    at: Date.now(),
  };
  return { ...raw, battle };
}

// ── つなぎ方（本番＝Firestore／手元の試し＝二つのタブ） ──
export interface RoomLink {
  me: string;
  watch(cb: (raw: RawRoom) => void): () => void;
  join(char: Character): Promise<'ok' | 'full'>;
  beat(): Promise<void>;
  leave(): Promise<void>;
  start(): Promise<boolean>;
  send(m: Move): Promise<void>;
  watchMoves(bid: string, cb: (m: Move) => void): () => void;
}

class FirestoreLink implements RoomLink {
  private main;
  private players;
  constructor(private db: Firestore, public me: string) {
    this.main = doc(db, 'rooms', 'main');
    this.players = collection(db, 'rooms', 'main', 'players');
  }
  // 部屋の紙（バトル）と、一人ずつの紙（いる人）を、一つの形にまとめて知らせる
  watch(cb: (raw: RawRoom) => void) {
    let battle: RoomBattle | null = null;
    let players: NonNullable<RawRoom['players']> = {};
    const emit = () => cb({ players, battle });
    const warn = (e: unknown) => console.warn('[room]', e);
    const off1 = onSnapshot(
      this.main,
      (s) => {
        battle = (s.data()?.battle as RoomBattle | undefined) ?? null;
        emit();
      },
      warn,
    );
    const off2 = onSnapshot(
      this.players,
      (s) => {
        players = {};
        s.forEach((d) => {
          players[d.id] = d.data() as Omit<RoomPlayer, 'uid'>;
        });
        emit();
      },
      warn,
    );
    return () => {
      off1();
      off2();
    };
  }
  private async readRaw(): Promise<RawRoom> {
    const [m, ps] = await Promise.all([getDoc(this.main), getDocs(this.players)]);
    const players: NonNullable<RawRoom['players']> = {};
    ps.forEach((d) => {
      players[d.id] = d.data() as Omit<RoomPlayer, 'uid'>;
    });
    return { players, battle: (m.data()?.battle as RoomBattle | undefined) ?? null };
  }
  async join(char: Character) {
    const raw = await this.readRaw();
    const next = joinRoom(raw, this.me, char);
    if (next === 'full') return 'full' as const;
    // 長くいなかった人の紙を片づける（決まりで、3分より新しいものは消せないので、少し長めに見る）
    const now = Date.now();
    await Promise.all(
      Object.entries(raw.players ?? {})
        .filter(([uid, p]) => uid !== this.me && now - (p.seen ?? 0) > 200_000)
        .map(([uid]) => deleteDoc(doc(this.players, uid)).catch(() => {})),
    );
    await setDoc(doc(this.players, this.me), next.players![this.me]);
    // 新しく入ってきたときは、前のバトルを片づける
    if (raw.battle && !next.battle) await setDoc(this.main, { battle: null }).catch(() => {});
    return 'ok' as const;
  }
  async beat() {
    await updateDoc(doc(this.players, this.me), { seen: Date.now() });
  }
  async leave() {
    await deleteDoc(doc(this.players, this.me));
  }
  async start() {
    const raw = await this.readRaw();
    // 二人が同時に「バトル開始！」をおしても、バトルが二つにならないように、部屋の紙は取り合いで書く
    return runTransaction(this.db, async (tx) => {
      const cur = ((await tx.get(this.main)).data()?.battle as RoomBattle | undefined) ?? null;
      const next = startIn({ ...raw, battle: cur }, this.me);
      if (next === 'already') return true;
      if (!next) return false;
      tx.set(this.main, { battle: next.battle });
      return true;
    });
  }
  async send(m: Move) {
    await setDoc(doc(this.db, 'rooms', 'main', 'moves', `${m.bid}_${m.n}_${m.by}`), m);
  }
  watchMoves(bid: string, cb: (m: Move) => void) {
    const q = query(collection(this.db, 'rooms', 'main', 'moves'), where('bid', '==', bid));
    return onSnapshot(
      q,
      (s) => s.docChanges().forEach((ch) => ch.type === 'added' && cb(ch.doc.data() as Move)),
      (e) => console.warn('[room moves]', e),
    );
  }
}

// 手元の試し：同じブラウザのタブどうしで、localStorage と BroadcastChannel を使って話す（開発中だけ）
class LocalLink implements RoomLink {
  private ch = new BroadcastChannel('pb-localroom');
  private subs = new Set<() => void>();
  me: string;
  constructor() {
    let id = sessionStorage.getItem('pb.localme');
    if (!id) sessionStorage.setItem('pb.localme', (id = Math.random().toString(36).slice(2, 10)));
    this.me = id;
    this.ch.onmessage = () => this.subs.forEach((f) => f());
  }
  private read<T>(k: string, d: T): T {
    try {
      return JSON.parse(localStorage.getItem(k) ?? '') as T;
    } catch {
      return d;
    }
  }
  private write(k: string, v: unknown) {
    localStorage.setItem(k, JSON.stringify(v));
    this.ch.postMessage(k);
    this.subs.forEach((f) => f());
  }
  private listen(f: () => void) {
    this.subs.add(f);
    f();
    return () => void this.subs.delete(f);
  }
  watch(cb: (raw: RawRoom) => void) {
    return this.listen(() => cb(this.read<RawRoom>('pb.localroom', {})));
  }
  async join(char: Character) {
    const next = joinRoom(this.read<RawRoom>('pb.localroom', {}), this.me, char);
    if (next === 'full') return 'full' as const;
    this.write('pb.localroom', next);
    return 'ok' as const;
  }
  async beat() {
    const raw = this.read<RawRoom>('pb.localroom', {});
    const p = raw.players?.[this.me];
    if (p) {
      p.seen = Date.now();
      this.write('pb.localroom', raw);
    }
  }
  async leave() {
    const raw = this.read<RawRoom>('pb.localroom', {});
    delete raw.players?.[this.me];
    this.write('pb.localroom', raw);
  }
  async start() {
    const next = startIn(this.read<RawRoom>('pb.localroom', {}), this.me);
    if (next && next !== 'already') this.write('pb.localroom', next);
    return !!next;
  }
  async send(m: Move) {
    this.write('pb.localmoves', [...this.read<Move[]>('pb.localmoves', []).filter((x) => x.bid === m.bid), m]);
  }
  watchMoves(bid: string, cb: (m: Move) => void) {
    const seen = new Set<string>();
    return this.listen(() => {
      for (const m of this.read<Move[]>('pb.localmoves', [])) {
        const k = `${m.bid}_${m.n}_${m.by}`;
        if (m.bid === bid && !seen.has(k)) {
          seen.add(k);
          cb(m);
        }
      }
    });
  }
}

export const isLocalRoom = () => import.meta.env.DEV && new URLSearchParams(location.search).has('localroom');

/** 部屋へのつなぎを用意する。Google でのログインが要る */
export async function openRoomLink(): Promise<RoomLink | 'login' | 'error'> {
  if (isLocalRoom()) return new LocalLink();
  const db = firestore();
  const u = currentUser();
  if (!u) return 'login';
  if (!db) return 'error';
  return new FirestoreLink(db, u.uid);
}

/** 部屋に入っているあいだの世話係：だれがいるかを見張り、「いるよ」を書きつづける */
export class RoomSession {
  state: RoomState = { players: [], battle: null };
  joined = false;
  played = new Set<string>(); // もう遊んだバトル（同じバトルに二度飛びこまない）
  myChar: Character | null = null; // 自分のロボ（写真つき。写真は自分の画面にだけ出す）
  private raw: RawRoom = {};
  private subs = new Set<(s: RoomState) => void>();
  private unwatch: () => void;
  private beatTimer = 0;
  private tick: number;

  constructor(public link: RoomLink) {
    this.unwatch = link.watch((raw) => {
      this.raw = raw;
      this.emit();
    });
    // だれかが「いるよ」を書かなくなっても知らせは来ないので、ときどき数え直す
    this.tick = window.setInterval(() => this.emit(), 5_000);
  }
  private emit() {
    this.state = normalize(this.raw);
    // 自分が消されていたら（長く止まっていたとき）、入っていないことにする
    if (this.joined && !this.state.players.some((p) => p.uid === this.me)) {
      this.joined = false;
      window.clearInterval(this.beatTimer);
    }
    this.subs.forEach((f) => f(this.state));
  }
  get me() {
    return this.link.me;
  }
  on(f: (s: RoomState) => void) {
    this.subs.add(f);
    f(this.state);
    return () => void this.subs.delete(f);
  }
  async join(char: Character) {
    // 入ったときにもうあったバトルには、飛びこまない（終わったバトルに入って、待ちつづけないように）
    if (this.state.battle) this.played.add(this.state.battle.id);
    const r = await this.link.join(char);
    if (r === 'ok') {
      this.myChar = char;
      this.joined = true;
      window.clearInterval(this.beatTimer);
      this.beatTimer = window.setInterval(() => this.link.beat().catch(() => {}), BEAT_MS);
    }
    return r;
  }
  start() {
    return this.link.start();
  }
  async leave() {
    this.joined = false;
    window.clearInterval(this.beatTimer);
    await this.link.leave().catch(() => {});
  }
  close() {
    this.unwatch();
    window.clearInterval(this.tick);
    window.clearInterval(this.beatTimer);
  }
  /** いま飛びこむべき、新しいバトル（無ければ null） */
  freshBattle(): RoomBattle | null {
    const b = this.state.battle;
    if (!b || !this.joined || !b.p.includes(this.me) || this.played.has(b.id)) return null;
    if (Date.now() - b.at > START_FRESH_MS) return null;
    return b;
  }
}

/** バトルの画面に渡す、対戦相手とのやりとり */
export interface NetBattle {
  opponent: Character;
  me: Character;
  opponentName: string;
  seed: number;
  iFirst: boolean;
  /** 自分の行動を送る（hp は [自分, あいて]） */
  send(n: number, action: ActionType, hp: [number, number]): void;
  /** あいての n 番目の行動を待つ。あいてがいなくなったら 'gone' */
  next(n: number): Promise<{ action: ActionType; hp: [number, number] } | 'gone'>;
  /** バトルをぬける */
  quit(n: number): void;
  onGone(cb: () => void): () => void;
  close(): void;
}

export function makeNetBattle(session: RoomSession, b: RoomBattle): NetBattle {
  session.played.add(b.id);
  const me = session.me;
  const opp = b.p[0] === me ? b.p[1] : b.p[0];
  const moves = new Map<number, Move>();
  const waiters = new Map<number, (v: Move | 'gone') => void>();
  const goneSubs = new Set<() => void>();
  let gone = false;
  let closed = false;
  const markGone = () => {
    if (gone || closed) return;
    gone = true;
    waiters.forEach((w) => w('gone'));
    waiters.clear();
    goneSubs.forEach((f) => f());
  };
  const unMoves = session.link.watchMoves(b.id, (m) => {
    if (m.by !== opp) return;
    if (m.action === 'quit') return markGone();
    moves.set(m.n, m);
    const w = waiters.get(m.n);
    if (w) {
      waiters.delete(m.n);
      w(m);
    }
  });
  // あいてが部屋からいなくなったら（スマホを閉じて60秒など）
  const unRoom = session.on((s) => {
    if (!s.players.some((p) => p.uid === opp) && s.players.length > 0) markGone();
  });
  return {
    opponent: b.chars[opp],
    me: { ...b.chars[me], thumb: session.myChar?.thumb }, // 自分の写真は、自分の画面でだけ使う
    opponentName: b.names[opp] ?? 'あいて',
    seed: b.seed,
    iFirst: b.first === me,
    send(n, action, hp) {
      session.link.send({ bid: b.id, n, by: me, action, hp: { [me]: hp[0], [opp]: hp[1] } }).catch((e) => console.warn(e));
    },
    async next(n) {
      if (gone) return 'gone';
      const m = moves.get(n) ?? (await new Promise<Move | 'gone'>((r) => waiters.set(n, r)));
      if (m === 'gone') return 'gone';
      return { action: m.action as ActionType, hp: [m.hp[me], m.hp[opp]] };
    },
    quit(n) {
      session.link.send({ bid: b.id, n, by: me, action: 'quit', hp: {} }).catch(() => {});
    },
    onGone(cb) {
      goneSubs.add(cb);
      if (gone) cb();
      return () => void goneSubs.delete(cb);
    },
    close() {
      closed = true;
      unMoves();
      unRoom();
    },
  };
}
