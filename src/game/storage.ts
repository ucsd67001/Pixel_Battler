// 作ったロボを、このブラウザの中に保存する（ガレージ）。ログインしていないときに使う。
// ログインしているときは、クラウドのガレージ（garage.ts）を使い、ここにあるロボは一度だけクラウドへ移す。

import type { Character } from './types';

const KEY = 'snapgear.hangar.v1';
export const GARAGE_LIMIT = 30; // ガレージに入れられるロボの数（クラウドも、このスマホも。サーバーも、これを使う）
// クラウドのガレージは、家族だけ100体まで（上限はサーバーが教える。server/garage.ts）
export const garageFullMsg = (limit: number = GARAGE_LIMIT) =>
  `ガレージが いっぱいです（${limit}体まで）。ガレージで どれかを消してから、作ってください。`;

export function loadHangar(): Character[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Character[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(list: Character[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 容量があふれたら、写真の縮小画像を外して入れ直す
    try {
      localStorage.setItem(KEY, JSON.stringify(list.map((c) => ({ ...c, thumb: undefined }))));
    } catch {
      /* 保存できなくても遊べる */
    }
  }
}

export function saveCharacter(c: Character) {
  const list = loadHangar().filter((x) => x.seed !== c.seed);
  list.unshift(c);
  save(list.slice(0, GARAGE_LIMIT));
}

/** 同じロボを、並び順を変えずに入れかえる */
export function updateCharacter(c: Character) {
  save(loadHangar().map((x) => (x.seed === c.seed ? c : x)));
}

export function deleteCharacter(id: string) {
  save(loadHangar().filter((x) => x.id !== id));
}

export function findBySeed(seed: string): Character | undefined {
  return loadHangar().find((c) => c.seed === seed);
}
