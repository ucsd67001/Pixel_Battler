// アイテムの置き場（写真から作った武器と防具。2026-11-25。docs/ITEMS.md）。どの画面もここから読む。
//   ・本番でログインしているとき：クラウド（Firestore の users/{uid}/items/{写真の印}）。
//     作って入れるのはサーバー（/api/items。30個まで、家族は100個まで・強さはサーバーが決める）。見る・消すのは画面から（本人だけ）
//   ・手元（npm run dev）：このスマホの中（localStorage）。/api/items は作ったアイテムを返すだけ
//   ・本番では、写真から作るのにログインが要るので、ログインしていないときのアイテムは無い

import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { buildItem, localItemSpec, withItem, type Item } from './items';
import type { Character } from './types';
import { GARAGE_LIMIT } from './storage';
import { cloudLimit } from './garage';
import { firestore, useUser } from '../lib/firebase';
import { AccessError, itemsFullMsg, makeItem } from '../lib/api';
import type { PreparedImage } from '../lib/image';

const CLOUD = !import.meta.env.DEV;
const KEY = 'pb.items.v1';
const watchers = new Set<() => void>();

function loadLocal(): Item[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? (list as Item[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(list: Item[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 容量があふれたら、写真の縮小画像を外して入れ直す
    try {
      localStorage.setItem(KEY, JSON.stringify(list.map((x) => ({ ...x, thumb: undefined }))));
    } catch {
      /* 保存できなくても遊べる */
    }
  }
  watchers.forEach((f) => f());
}

export interface ItemBox {
  list: Item[];
  ready: boolean; // 一覧を読み終えたか
  cloud: boolean;
  limit: number;
  full: boolean;
  find(seed: string): Item | undefined;
  /** 写真からアイテムを作って、置き場に入れる。again＝同じ写真のアイテムが、もうあった。note＝AI につながらなかったときの一言 */
  make(img: PreparedImage, needLogin: boolean): Promise<{ item: Item; again: boolean; note: string }>;
  remove(item: Item): Promise<void>;
  /** バトルに出す姿：持たせているアイテムを、そのロボに持たせる（置き場に無ければ、素手のまま。2026-11-26 段階5） */
  arm(c: Character): Character;
}

export function useItemBox(): ItemBox {
  const user = useUser();
  const db = firestore();
  const uid = CLOUD && db && user ? user.uid : null;
  const [local, setLocal] = useState(loadLocal);
  const [cloud, setCloud] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [cloudMax, setCloudMax] = useState(GARAGE_LIMIT);

  useEffect(() => {
    const f = () => setLocal(loadLocal());
    watchers.add(f);
    return () => void watchers.delete(f);
  }, []);

  useEffect(() => {
    setCloud(null);
    setFailed(false);
    if (!uid || !db) return;
    return onSnapshot(
      query(collection(db, 'users', uid, 'items'), orderBy('createdAt', 'desc')),
      (s) => setCloud(s.docs.map((d) => d.data() as Item)),
      (e) => {
        console.warn('[items]', e);
        setFailed(true);
      },
    );
  }, [uid, db]);

  // 置き場の上限は、ガレージと同じ数（家族は100個、ほかは30個）
  useEffect(() => {
    setCloudMax(GARAGE_LIMIT);
    if (!uid) return;
    let off = false;
    cloudLimit(uid)
      .then((n) => !off && setCloudMax(n))
      .catch((e) => console.warn('[items] limit', e));
    return () => {
      off = true;
    };
  }, [uid]);

  const isCloud = !!uid && !failed;
  const list = isCloud ? (cloud ?? []) : local;
  const limit = isCloud ? cloudMax : GARAGE_LIMIT;
  const ready = user !== undefined && (!isCloud || cloud !== null);

  const make = async (img: PreparedImage, needLogin: boolean) => {
    const have = list.find((x) => x.seed === img.hash);
    if (have) return { item: have, again: true, note: '' };
    if (list.length >= limit) throw new AccessError(409, itemsFullMsg(limit));
    if (isCloud) {
      // サーバーが作って、置き場に入れる（一覧は onSnapshot で新しくなる）
      const r = await makeItem(img, true);
      return { ...r, note: r.item.source === 'local' ? 'AIにつながらなかったため、写真の色から作りました。' : '' };
    }
    // 手元：作ってもらって、このスマホの中に入れる。つながらなければ、写真の色から作る
    let item: Item;
    try {
      item = (await makeItem(img, needLogin)).item;
    } catch (e) {
      if (e instanceof AccessError) throw e;
      console.warn('[items] make', e);
      item = buildItem(localItemSpec(img.hash, img.colors), img.hash, 'local', img.thumb);
    }
    saveLocal([item, ...loadLocal().filter((x) => x.seed !== item.seed)].slice(0, GARAGE_LIMIT));
    return { item, again: false, note: item.source === 'local' ? 'AIにつながらなかったため、写真の色から作りました。' : '' };
  };

  const remove = async (item: Item) => {
    if (isCloud && db && uid) {
      await deleteDoc(doc(db, 'users', uid, 'items', item.seed));
      return;
    }
    saveLocal(loadLocal().filter((x) => x.seed !== item.seed));
  };

  return {
    list,
    ready,
    cloud: isCloud,
    limit,
    full: list.length >= limit,
    find: (seed) => list.find((x) => x.seed === seed),
    make,
    remove,
    arm: (c) => withItem(c, c.itemSeed ? list.find((x) => x.seed === c.itemSeed) : undefined),
  };
}
