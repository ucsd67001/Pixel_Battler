// ストーリーの進み具合の決まり（2026-11-23）。画面とサーバーの両方が使う、純粋な計算。
// 敵の中身（cpu.ts・minions.ts）を読まないので、サーバー（Cloud Functions）に敵の設計図が入らない。
// 章の中身は story.ts（STORY_CHAPTERS と CHAPTERS の数が合っているかは、story.ts で確かめる）

export const MAX_CHAPTER = 99;
/** いま中身がある章の数（最初の9章と、10章から先の人物の章） */
export const STORY_CHAPTERS = 12;
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
//   ・クリアした章は、5体ともえらんで何度でも戦える
//   ・まだクリアしていない章（いちばん先の章）は、いちばん先にたどり着いた敵まで、えらんで戦える。
//     前に倒した敵ともう一度戦っても、たどり着いたところは下がらない（2026-11-25、持ち主の希望。
//     それまでは「1体目から やり直す」で、たどり着いたところが1体目にもどっていた）
export interface StoryProgress {
  cleared: number; // クリアした章のいちばん大きい番号（0＝まだ）
  run: { chapter: number; next: number } | null; // いちばん先の章（cleared+1）と、そこでたどり着いた敵（1〜4。まだ戦っていない敵）
}

export const EMPTY_STORY: StoryProgress = { cleared: 0, run: null };

/** サーバー・保存場所から読んだものを、正しい形にする */
export function readStory(raw: any): StoryProgress {
  const cleared = Math.min(MAX_CHAPTER, Math.max(0, Math.floor(Number(raw?.cleared) || 0)));
  const c = Math.floor(Number(raw?.run?.chapter));
  const n = Math.floor(Number(raw?.run?.next));
  // クリアした章の run（前の決まりで、クリアした章をやり直していたもの）は、もう使わない
  const run = c === cleared + 1 && c <= MAX_CHAPTER && n >= 1 && n <= BOSS_SLOT ? { chapter: c, next: n } : null;
  return { cleared, run };
}

/** その章が開いているか（中身のある章のうち、クリアした章と、その次の章） */
export const isOpen = (p: StoryProgress, no: number) =>
  no >= 1 && no <= Math.min(STORY_CHAPTERS, p.cleared + 1);

/** その章で、えらんで戦える敵のいちばん先（0〜4）。開いていない章は -1 */
export function reachOf(p: StoryProgress, no: number): number {
  if (!isOpen(p, no)) return -1;
  if (no <= p.cleared) return BOSS_SLOT;
  return p.run?.chapter === no ? p.run.next : 0;
}

/** その章を開いたときに、はじめにえらんでおく敵（いちばん先の章は、たどり着いた敵。クリアした章は1体目） */
export const nextSlot = (p: StoryProgress, no: number) => (no <= p.cleared ? 0 : Math.max(0, reachOf(p, no)));

/** その敵と戦えるか（＝勝ちを数えてよいか）：開いている章で、たどり着いた敵まで */
export function canWin(p: StoryProgress, no: number, slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot <= reachOf(p, no);
}

/** 勝ったあとの進み具合（たどり着いたところは下がらない） */
export function afterWin(p: StoryProgress, no: number, slot: number): StoryProgress {
  if (no <= p.cleared) return p; // クリアした章：進み具合は変わらない
  if (slot >= BOSS_SLOT) return { cleared: Math.max(p.cleared, no), run: null };
  const next = Math.max(slot + 1, p.run?.chapter === no ? p.run.next : 0);
  return { cleared: p.cleared, run: { chapter: no, next } };
}
