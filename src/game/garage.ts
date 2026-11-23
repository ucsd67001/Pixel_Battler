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
import { firestore, idToken, useUser } from '../lib/firebase';

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
      const token = await idToken();
      if (!token) throw new Error('login required');
      const r = await fetch('/api/garage', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
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
  const token = await idToken();
  if (!token) throw new Error('login required');
  const r = await fetch('/api/robots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ hash: c.seed, thumb: c.thumb, spec: c.spec, source: c.source, createdAt: c.createdAt }),
  });
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
        const token = await idToken();
        if (!token) return;
        const r = await fetch('/api/robots/fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ hash: c.seed }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      } else {
        const r = await fetch('/api/fix-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spec: c.spec }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        updateCharacter(withFixedText(c, sanitizeSpec((await r.json()).spec)));
        changed();
      }
    } catch (e) {
      console.warn('[garage] fix', e); // つながらなければ、次にひらいたときに、また試す
    }
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
  };
}
