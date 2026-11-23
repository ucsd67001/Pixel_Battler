// ストーリー（2026-11-23。docs/STORY.md の段階4）。画面とサーバーの両方が使う、純粋な決まり。
//   ・99章。各章に5体の敵（1〜4体目が手下、5体目がボス）。5連戦で、HP は毎回まんたんから
//   ・負けたら、負けた敵からやり直し（勝った分は残る）。ボスに勝つと章クリアで、次の章が開く
//   ・クリアした章は、何度でもやり直せる（レベル上げのため）
//   ・章N の敵は Lv N。1〜4体目は、たまに「だれかのロボ」と入れかわる（その章のレベルで）
//   ・いま中身があるのは最初の9章。10章から先は、持ち主が別に考えて作る

import type { Character } from './types';
import { CPU_CHARACTERS } from './cpu';
import { MINIONS } from './minions';

export const MAX_CHAPTER = 99;
/** 1章の敵の数（5体目がボス） */
export const CHAPTER_SIZE = 5;
export const BOSS_SLOT = CHAPTER_SIZE - 1;
/** 1〜4体目が、だれかのロボと入れかわる割合 */
export const STORY_RIVAL_RATE = 0.2;

export interface Chapter {
  no: number; // 1 から
  theme: string; // 地・水・火…
  title: string; // 章の名前
  boss: Character;
  line: string; // ボスと戦う前の一言（⚠️ 下書き。持ち主に見てもらう）
  minions: Character[];
}

const META: { theme: string; title: string; line: string }[] = [
  { theme: '地', title: '大地の門', line: 'ここは大地の門。通りたければ、力を見せてみろ！' },
  { theme: '水', title: 'こおれる湖', line: 'こおった湖の上では、だれも わたしに勝てない。' },
  { theme: '火', title: 'ほのおの山', line: 'ほのおより速く走れるか？ ためしてやる！' },
  { theme: '風', title: 'つむじ風の空', line: 'つむじ風の王者が、相手をしてやろう！' },
  { theme: '光', title: '光の花火大会', line: 'さあ、光の花火大会の はじまりだ！' },
  { theme: '夜', title: '夜のやしき', line: 'ようこそ、夜のやしきへ。いっしょに あそぼうよ！' },
  { theme: '森', title: '竹林の森', line: '竹は折れない。何度でも 立ち上がる！' },
  { theme: '海', title: '深い海', line: '深い海の力、その身で 受けてみよ。' },
  { theme: '月', title: '三日月の夜', line: '月の光の下で、さいごの しあいだ。' },
];

/** 中身のある章（いまは最初の9章） */
export const CHAPTERS: Chapter[] = META.map((m, i) => ({
  no: i + 1,
  ...m,
  boss: CPU_CHARACTERS[i],
  minions: MINIONS[i],
}));

export const chapterOf = (no: number): Chapter | undefined => CHAPTERS[no - 1];

/** その章の、slot 体目の敵（もとの数字のまま。戦うときに atLevel で章のレベルにする） */
export function enemyAt(no: number, slot: number): Character | undefined {
  const ch = chapterOf(no);
  if (!ch) return undefined;
  return slot === BOSS_SLOT ? ch.boss : ch.minions[slot];
}

/** 章の敵のレベル */
export const chapterLevel = (no: number) => no;

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

/** その章が開いているか（クリアした章と、その次の章） */
export const isOpen = (p: StoryProgress, no: number) => no >= 1 && no <= Math.min(MAX_CHAPTER, p.cleared + 1) && !!chapterOf(no);

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
