// クラウドのガレージ（Firestore の users/{uid}/robots/{写真の印}）に入れるロボを、サーバーで組み立てる。
// 画面から送られた数字（HP・こうげきなど）は使わない。設計図と写真の印から、サーバーが計算し直す。
//   ・AI で作ったロボ：サーバーに取っておいた設計図（specs）があれば、それを使う
//   ・写真の色で作ったロボ：写真の印から、同じロボを組み立て直す（名前も技も、写真の印で決まる）
//   ・総合力とランクは写真の印だけで決まるので、設計図を書きかえても強くはならない

import { buildCharacter } from '../src/game/stats';
import { localSpec } from '../src/game/fallback';
import { sanitizeSpec } from '../src/game/spec';
import type { Character, CharacterSpec } from '../src/game/types';

export const GARAGE_LIMIT = 30;
export const FAMILY_GARAGE_LIMIT = 100; // 家族（ALLOWED_EMAILS）は100体まで（2026-11-23 から）
export const garageLimit = (family: boolean) => (family ? FAMILY_GARAGE_LIMIT : GARAGE_LIMIT);
const HASH = /^[a-f0-9]{64}$/;
const THUMB = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const THUMB_MAX = 120_000; // 縮小画像（160ピクセル）はふつう 10KB ほど
const OLDEST = Date.UTC(2026, 0, 1);

export interface RobotInput {
  hash: string;
  thumb?: string;
  spec: unknown;
  source: 'ai' | 'local';
  createdAt?: number;
}

/** 画面から届いた中身を確かめる。おかしければ null */
export function readRobotInput(body: any): RobotInput | null {
  const b = body ?? {};
  const hash = String(b.hash ?? '');
  if (!HASH.test(hash)) return null;
  const thumb = typeof b.thumb === 'string' && b.thumb.length <= THUMB_MAX && THUMB.test(b.thumb) ? b.thumb : undefined;
  const source = b.source === 'local' ? 'local' : 'ai';
  const at = Number(b.createdAt);
  const createdAt = Number.isFinite(at) && at >= OLDEST && at <= Date.now() ? at : undefined;
  return { hash, thumb, spec: b.spec, source, createdAt };
}

/** 保存するロボを組み立てる。cached＝サーバーに取っておいた AI の設計図 */
export function makeRobot(inp: RobotInput, cached: CharacterSpec | null): Character {
  let c: Character;
  if (cached) c = buildCharacter(sanitizeSpec(cached), inp.hash, 'ai', inp.thumb);
  else if (inp.source === 'local') {
    // 写真の色で作ったロボは、写真の印と、いちばん目立つ二つの色から、そのまま組み立て直せる
    const s = sanitizeSpec(inp.spec);
    c = buildCharacter(localSpec(inp.hash, [s.colors.secondary, s.colors.primary]), inp.hash, 'local', inp.thumb);
  } else {
    // サーバーに控えの無い設計図は、画面から届いたもの。特別な写真のしるし（bonus）は受け取らない
    c = buildCharacter({ ...sanitizeSpec(inp.spec), bonus: 0 }, inp.hash, 'ai', inp.thumb);
  }
  // 前にこのスマホで作ったロボを移すときは、作った日を残す（ガレージの並び順のため）
  if (inp.createdAt) c.createdAt = inp.createdAt;
  return c;
}
