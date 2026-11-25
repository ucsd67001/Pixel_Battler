// ガレージ（作ったロボの置き場）。どの画面もここから読む。
//   ・ログインしているとき：クラウド（Firestore の users/{uid}/robots/{写真の印}）。ほかのスマホでも同じガレージ。
//     入れるのはサーバー（/api/robots。30体まで、家族は100体まで・数字はサーバーが計算する）。見る・消すのは画面から（本人だけ）
//   ・ログインしていないとき：このスマホの中（storage.ts）
//   ・ログインしたとき、このスマホの中にあるロボを、一度だけクラウドへ移す（移せたものは、このスマホから消す）
//   ・手元（npm run dev）では、いつもこのスマホの中に入れる（/api/robots が無いため）

import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import type { Character } from './types';
import { deleteCharacter, findBySeed, garageFullMsg, GARAGE_LIMIT, loadHangar, saveCharacter, updateCharacter } from './storage';
import { needsTextFix, withFixedText } from './kanji';
import { sanitizeSpec } from './spec';
import { storyWin, type WinResult } from './level';
import { EMPTY_STORY, readStory, type StoryProgress } from './progress';
import { checkNickname, readNickname } from './profile';
import { addResult, EMPTY_RECORD, MIN_BATTLE_MS, readRecord, type BattleRecord, type BattleResult, type RecordMode } from './record';
import { currentUser, firestore, useUser } from '../lib/firebase';
import { postApi } from '../lib/api';

const CLOUD = !import.meta.env.DEV;

export class GarageFullError extends Error {
  constructor(limit: number = GARAGE_LIMIT) {
    super(garageFullMsg(limit));
  }
}

// クラウドのガレージに何体まで入るか（家族は100体、ほかは30体）。サーバーに一度だけ聞く
const limits = new Map<string, Promise<number>>();
function cloudLimit(uid: string): Promise<number> {
  let p = limits.get(uid);
  if (!p) {
    p = (async () => {
      const r = await postApi('/api/garage', undefined, { needLogin: true });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Number((await r.json()).limit) || GARAGE_LIMIT;
    })();
    p.catch(() => limits.delete(uid)); // 聞けなかったら、次にまた聞く
    limits.set(uid, p);
  }
  return p;
}

// サーバーに、ロボをクラウドのガレージへ入れてもらう。返ってくるのは、サーバーが組み立て直したロボ
async function postRobot(c: Character): Promise<Character | 'full'> {
  const r = await postApi(
    '/api/robots',
    { hash: c.seed, thumb: c.thumb, spec: c.spec, source: c.source, createdAt: c.createdAt },
    { needLogin: true },
  );
  if (r.status === 409) return 'full';
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).robot as Character;
}

// このスマホの中のロボを、クラウドへ移す（新しいものから。いっぱいになったら、残りはこのスマホに残す）
const moving = new Set<string>();
async function moveLocal(uid: string, have: Set<string>) {
  if (moving.has(uid)) return;
  moving.add(uid);
  try {
    let full = false;
    for (const c of loadHangar()) {
      if (!have.has(c.seed)) {
        if (full) continue;
        const r = await postRobot(c);
        if (r === 'full') {
          full = true;
          continue;
        }
        have.add(c.seed);
      }
      deleteCharacter(c.id);
    }
  } catch (e) {
    console.warn('[garage] move', e); // つながらなければ、次にひらいたときに、また移す
  } finally {
    moving.delete(uid);
  }
}

// 前に作ったロボ（漢字の決まりを入れる前のもの）の文から、小学校で習わない漢字を取りのぞく。一体ずつ、一度だけ。
//   ・クラウド：サーバー（/api/robots/fix）が書き直して、ガレージに入れ直す。一覧は onSnapshot で新しくなる
//   ・手元（npm run dev）：/api/fix-text で書き直して、このスマホの中に入れ直す
//   ・本番でログインしていないときは、しない（ログインしてクラウドへ移ったあとで直す）
const fixing = new Set<string>();
async function fixTexts(list: Character[], cloud: boolean, changed: () => void) {
  for (const c of list) {
    if (!needsTextFix(c) || fixing.has(c.seed)) continue;
    fixing.add(c.seed);
    try {
      if (cloud) {
        const r = await postApi('/api/robots/fix', { hash: c.seed }, { needLogin: true });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      } else {
        const r = await postApi('/api/fix-text', { spec: c.spec });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        updateCharacter(withFixedText(c, sanitizeSpec((await r.json()).spec)));
        changed();
      }
    } catch (e) {
      console.warn('[garage] fix', e); // つながらなければ、次にひらいたときに、また試す
    }
  }
}

// ストーリーで勝ったときの知らせの答え（level.ts の storyWin。サーバーも同じ形で答える）
export type { WinResult } from './level';

// ── ストーリーの進み具合 ──
//   ・クラウド：Firestore の users/{uid} の story（見るのは本人だけ。書くのはサーバーだけ。/api/robots/win が進める）
//   ・手元・ログインしていないとき：このスマホの中（localStorage）
const STORY_KEY = 'pb.story.v1';
const storyWatchers = new Set<() => void>();
function loadLocalStory(): StoryProgress {
  try {
    return readStory(JSON.parse(localStorage.getItem(STORY_KEY) ?? 'null'));
  } catch {
    return EMPTY_STORY;
  }
}
function saveLocalStory(p: StoryProgress) {
  try {
    localStorage.setItem(STORY_KEY, JSON.stringify(p));
  } catch {
    // 入れられなくても、遊ぶのは続けられる
  }
  storyWatchers.forEach((f) => f());
}

/**
 * users/{uid} の欄を一つ読むフック（ストーリーの進み具合・戦績・ニックネームが使う）。
 *   ・クラウド：onSnapshot（同じ文書を見るフックが何本あっても、Firestore の SDK が一本にまとめて読む）
 *   ・手元・ログインしていないとき：loadLocal で読む（watchers に知らせが来たら読み直す）
 * 読みこみ中は null。読めなかったときは failed
 */
function useUserField<T>(
  tag: string,
  read: (data: Record<string, unknown> | undefined) => T,
  loadLocal: () => T,
  watchers: Set<() => void>,
  failed: T,
): { value: T | null; uid: string | null } {
  const user = useUser();
  const db = firestore();
  const uid = CLOUD && db && user ? user.uid : null;
  const [local, setLocal] = useState(loadLocal);
  const [cloud, setCloud] = useState<T | null>(null);
  useEffect(() => {
    const f = () => setLocal(loadLocal());
    watchers.add(f);
    return () => void watchers.delete(f);
  }, []); // loadLocal と watchers は、どれもこのファイルの中の決まったもの（変わらない）
  useEffect(() => {
    setCloud(null);
    if (!uid || !db) return;
    return onSnapshot(
      doc(db, 'users', uid),
      (s) => setCloud(read(s.data())),
      (e) => {
        console.warn(`[${tag}]`, e);
        setCloud(failed);
      },
    );
  }, [uid, db]);
  const value = uid ? cloud : user === undefined && CLOUD ? null : local;
  return { value, uid };
}

/** ストーリーの進み具合（読みこみ中は null） */
export function useStory(): StoryProgress | null {
  return useUserField('story', (d) => readStory(d?.story), loadLocalStory, storyWatchers, EMPTY_STORY).value;
}

// ── 戦績（2026-11-25。src/game/record.ts） ──
//   ・クラウド：Firestore の users/{uid} の stats と、ガレージのロボの record（書くのはサーバーだけ）
//   ・手元・ログインしていないとき：このスマホの中（localStorage と、このスマホのガレージのロボ）
const STATS_KEY = 'pb.stats.v1';
const statsWatchers = new Set<() => void>();
function loadLocalStats(): BattleRecord {
  try {
    return readRecord(JSON.parse(localStorage.getItem(STATS_KEY) ?? 'null'));
  } catch {
    return EMPTY_RECORD;
  }
}
function addLocalResult(seed: string, mode: RecordMode | 'story', result: BattleResult) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(addResult(loadLocalStats(), mode, result)));
  } catch {
    // 入れられなくても、遊ぶのは続けられる
  }
  const cur = findBySeed(seed);
  if (cur) updateCharacter({ ...cur, record: addResult(readRecord(cur.record), mode, result) });
  statsWatchers.forEach((f) => f());
}

/** プレイヤーの戦績（読みこみ中は null） */
export function useStats(): BattleRecord | null {
  return useUserField('stats', (d) => readRecord(d?.stats), loadLocalStats, statsWatchers, EMPTY_RECORD).value;
}

// ── ニックネーム（2026-11-25。src/game/profile.ts） ──
//   ・クラウド：Firestore の users/{uid} の nickname（書くのはサーバーだけ。/api/profile）
//   ・手元・ログインしていないとき：このスマホの中
const NICK_KEY = 'pb.nick.v1';
const nickWatchers = new Set<() => void>();
const loadLocalNick = () => {
  try {
    return readNickname(localStorage.getItem(NICK_KEY));
  } catch {
    return '';
  }
};

/** ニックネームの答え（もらえなかったときは、理由つきで失敗にする） */
export class NicknameError extends Error {}

/** 自分のニックネーム（読みこみ中は null。決めていなければ ''）と、決める・変える（空で消す） */
export function useNickname(): { nickname: string | null; save(n: string): Promise<string> } {
  const { value: nickname, uid } = useUserField('nickname', (d) => readNickname(d?.nickname), loadLocalNick, nickWatchers, '');
  const save = async (n: string): Promise<string> => {
    const r = checkNickname(n);
    if (!r.ok) throw new NicknameError(r.reason);
    if (uid) {
      const res = await postApi('/api/profile', { nickname: r.nickname }, { needLogin: true });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new NicknameError(body?.reason ?? `保存できませんでした（HTTP ${res.status}）`);
      return String(body.nickname ?? ''); // 一覧は onSnapshot で新しくなる
    }
    try {
      if (r.nickname) localStorage.setItem(NICK_KEY, r.nickname);
      else localStorage.removeItem(NICK_KEY);
    } catch {
      // 入れられなくても、遊ぶのは続けられる
    }
    nickWatchers.forEach((f) => f());
    return r.nickname;
  };
  return { nickname, save };
}

/** バトルの整理券（クラウドではサーバーが出す番号。手元では、始めた時刻だけ） */
export interface BattleTicket {
  id: string | null; // クラウドの整理券（手元では null）
  mode: RecordMode;
  seed: string;
  at: number;
}

const cloudNow = () => CLOUD && !!firestore() && !!currentUser();

/**
 * バトルを始めるときに呼ぶ。自分のガレージのロボで戦うときだけ、整理券をもらう。
 * battle＝ふたりで対戦のバトルの番号。もらえなかったとき（つながらないなど）は null（そのバトルは数えない）
 */
export async function startRecord(mode: RecordMode, c: Character, battle?: string): Promise<BattleTicket | null> {
  if (c.source !== 'ai' && c.source !== 'local') return null;
  const at = Date.now();
  if (!cloudNow()) return { id: null, mode, seed: c.seed, at };
  try {
    const r = await postApi('/api/battle/start', { mode, hash: c.seed, battle }, { needLogin: true });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const id = (await r.json()).ticket;
    return typeof id === 'string' ? { id, mode, seed: c.seed, at } : null;
  } catch (e) {
    console.warn('[record] start', e);
    return null;
  }
}

/** バトルが終わったら呼ぶ。数えてもらえたら true */
export async function endRecord(t: BattleTicket, result: BattleResult): Promise<boolean> {
  try {
    if (t.id) {
      const r = await postApi('/api/battle/end', { ticket: t.id, result }, { needLogin: true });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return !!(await r.json()).counted;
    }
    // 手元：サーバーと同じく、短すぎるバトルは数えない
    if (Date.now() - t.at < MIN_BATTLE_MS) return false;
    addLocalResult(t.seed, t.mode, result);
    return true;
  } catch (e) {
    console.warn('[record] end', e);
    return false;
  }
}

export interface Garage {
  list: Character[];
  ready: boolean; // 一覧を読み終えたか
  cloud: boolean; // クラウドのガレージを使っているか
  left: number; // クラウドがいっぱいで、このスマホに残っているロボの数
  limit: number; // 何体まで入るか（クラウドは、家族だけ100体。ほかは30体）
  full: boolean;
  find(seed: string): Character | undefined;
  add(c: Character): Promise<Character>;
  remove(c: Character): Promise<void>;
  // ストーリーで勝ったロボに、経験値を足す（2026-11-23。クラウドではサーバーが書く。chapter＝何章・slot＝何体目（0〜4））
  win(c: Character, chapter: number, slot: number): Promise<WinResult>;
}

export function useGarage(): Garage {
  const user = useUser();
  const db = firestore();
  const uid = CLOUD && db && user ? user.uid : null;
  const [local, setLocal] = useState(loadHangar);
  const [cloud, setCloud] = useState<Character[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    setCloud(null);
    setFailed(false);
    if (!uid || !db) return;
    let first = true;
    return onSnapshot(
      query(collection(db, 'users', uid, 'robots'), orderBy('createdAt', 'desc')),
      (s) => {
        const list = s.docs.map((d) => d.data() as Character);
        setCloud(list);
        fixTexts(list, true, () => undefined);
        if (first) {
          first = false;
          if (loadHangar().length)
            moveLocal(uid, new Set(list.map((c) => c.seed))).then(() => {
              setLocal(loadHangar());
              setLeft(loadHangar().length);
            });
        }
      },
      (e) => {
        // クラウドが読めないときは、このスマホのガレージで遊べるようにする
        console.warn('[garage]', e);
        setFailed(true);
      },
    );
  }, [uid, db]);

  const isCloud = !!uid && !failed;
  const list = isCloud ? (cloud ?? []) : local;

  // クラウドのガレージの上限（聞き終わるまでは、ふつうの30体として数える）
  const [cloudMax, setCloudMax] = useState(GARAGE_LIMIT);
  useEffect(() => {
    setCloudMax(GARAGE_LIMIT);
    if (!uid) return;
    let off = false;
    cloudLimit(uid)
      .then((n) => !off && setCloudMax(n))
      .catch((e) => console.warn('[garage] limit', e));
    return () => {
      off = true;
    };
  }, [uid]);
  const limit = isCloud ? cloudMax : GARAGE_LIMIT;

  // 手元では、このスマホの中のロボの文を直す
  useEffect(() => {
    if (import.meta.env.DEV && !isCloud) fixTexts(loadHangar(), false, () => setLocal(loadHangar()));
  }, [isCloud]);
  const ready = user !== undefined && (!isCloud || cloud !== null);

  const add = async (c: Character): Promise<Character> => {
    if (isCloud) {
      try {
        const r = await postRobot(c);
        if (r === 'full') throw new GarageFullError(limit);
        return r;
      } catch (e) {
        if (e instanceof GarageFullError) throw e;
        // つながらないときは、このスマホに取っておき、次にひらいたときにクラウドへ移す
        console.warn('[garage] add', e);
      }
    }
    if (!findBySeed(c.seed) && loadHangar().length >= GARAGE_LIMIT) throw new GarageFullError();
    saveCharacter(c);
    setLocal(loadHangar());
    if (isCloud) setLeft(loadHangar().length);
    return c;
  };

  const remove = async (c: Character) => {
    if (isCloud && db && uid) {
      await deleteDoc(doc(db, 'users', uid, 'robots', c.seed));
      // 空きができたので、このスマホに残っていたロボを移す
      if (loadHangar().length)
        moveLocal(uid, new Set(list.filter((x) => x.seed !== c.seed).map((x) => x.seed))).then(() => {
          setLocal(loadHangar());
          setLeft(loadHangar().length);
        });
      return;
    }
    deleteCharacter(c.id);
    setLocal(loadHangar());
  };

  const win = async (c: Character, chapter: number, slot: number): Promise<WinResult> => {
    // 本番では、いつもサーバーに送る（この画面のログインの状態を読み終える前でも。2026-11-23、
    // 勝った直後にまだ読み終えていなくて、このスマホの中に記録しようとして失敗していた）
    if (CLOUD && firestore() && (isCloud || currentUser())) {
      const r = await postApi('/api/robots/win', { hash: c.seed, chapter, slot }, { needLogin: true });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as WinResult; // ガレージの一覧は onSnapshot で新しくなる
    }
    // 手元・ログインしていないとき：このスマホの中のロボと進み具合に足す
    const cur = findBySeed(c.seed);
    if (!cur) throw new Error('not found');
    const w = storyWin(cur, loadLocalStory(), chapter, slot);
    if (!w.counted) return w;
    updateCharacter({ ...cur, exp: w.exp, level: w.level });
    addLocalResult(cur.seed, 'story', 'win');
    setLocal(loadHangar());
    saveLocalStory(w.story);
    return w;
  };

  return {
    list,
    ready,
    cloud: isCloud,
    left: isCloud ? left : 0,
    limit,
    full: list.length >= limit,
    find: (seed) => list.find((c) => c.seed === seed),
    add,
    remove,
    win,
  };
}
