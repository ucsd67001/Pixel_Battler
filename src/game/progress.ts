// ストーリーの進み具合の決まり（2026-11-23）。画面とサーバーの両方が使う、純粋な計算。
// 敵の中身（cpu.ts・minions.ts）を読まないので、サーバー（Cloud Functions）に敵の設計図が入らない。
// 章の中身は story.ts（STORY_CHAPTERS と CHAPTERS の数が合っているかは、story.ts で確かめる）

export const MAX_CHAPTER = 99;
/** いま中身がある章の数（最初の9章と、10章から先の人物の章） */
export const STORY_CHAPTERS = 10;
/** 1章の敵の数（5体目がボス） */
export const CHAPTER_SIZE = 5;
export const BOSS_SLOT = CHAPTER_SIZE - 1;

/**
 * 章の敵のレベル：1・4・7…（3N−2。2026-11-23、持ち主が決めた）。
 * 1章は5勝で Lv6 になるので、章N＝Lv N だと3章から先がほとんど負けなかった。
 * 3N−2 なら、1体のロボで続けて進むと7〜8章で敵と同じくらいのレベルになり、その先はレベル上げが要る
 * （サーバーも、勝ったときの経験値の計算に使うので、ここに置く）
 */
export const chapterLevel = (no: number) => 3 * no - 2;

// ── 進み具合（ログインしているときは Firestore の users/{uid} の story。書くのはサーバーだけ） ──
export interface StoryProgress {
  cleared: number; // クリアした章のいちばん大きい番号（0＝まだ）
  run: { chapter: number; next: number } | null; // いま進めている章と、次に戦う敵（0〜4）
}

export const EMPTY_STORY: StoryProgress = { cleared: 0, run: null };

/** サーバー・保存場所から読んだものを、正しい形にする */
export function readStory(raw: any): StoryProgress {
  const cleared = Math.min(MAX_CHAPTER, Math.max(0, Math.floor(Number(raw?.cleared) || 0)));
  const c = Math.floor(Number(raw?.run?.chapter));
  const n = Math.floor(Number(raw?.run?.next));
  const run = c >= 1 && c <= MAX_CHAPTER && n >= 1 && n <= BOSS_SLOT ? { chapter: c, next: n } : null;
  return { cleared, run };
}

/** その章が開いているか（中身のある章のうち、クリアした章と、その次の章） */
export const isOpen = (p: StoryProgress, no: number) =>
  no >= 1 && no <= Math.min(STORY_CHAPTERS, p.cleared + 1);

/** その章で、次に戦う敵（0〜4） */
export const nextSlot = (p: StoryProgress, no: number) => (p.run?.chapter === no ? p.run.next : 0);

/** その勝ちを数えてよいか：開いている章で、1体目か、続きの敵 */
export function canWin(p: StoryProgress, no: number, slot: number): boolean {
  if (!isOpen(p, no) || slot < 0 || slot > BOSS_SLOT) return false;
  return slot === 0 || nextSlot(p, no) === slot;
}

/** 勝ったあとの進み具合 */
export function afterWin(p: StoryProgress, no: number, slot: number): StoryProgress {
  if (slot >= BOSS_SLOT) return { cleared: Math.max(p.cleared, no), run: null };
  return { cleared: p.cleared, run: { chapter: no, next: slot + 1 } };
}
