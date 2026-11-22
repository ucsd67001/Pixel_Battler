// 作ったキャラを、このブラウザの中に保存する（格納庫）

import type { Character } from './types';

const KEY = 'snapgear.hangar.v1';

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
  save(list.slice(0, 40));
}

export function deleteCharacter(id: string) {
  save(loadHangar().filter((x) => x.id !== id));
}

export function findBySeed(seed: string): Character | undefined {
  return loadHangar().find((c) => c.seed === seed);
}
