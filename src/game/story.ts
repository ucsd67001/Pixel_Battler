// ストーリー（2026-11-23。docs/STORY.md の段階4）。章の中身（敵・ボスの一言）と、章の敵のレベル。
//   ・99章。各章に5体の敵（1〜4体目が手下、5体目がボス）。5連戦で、HP は毎回まんたんから
//   ・負けたら、負けた敵からやり直し（勝った分は残る）。ボスに勝つと章クリアで、次の章が開く
//   ・クリアした章は、何度でもやり直せる（レベル上げのため）
//   ・章N の敵は Lv 3N−2（1・4・7…）。手下4体のうち2体は、章とちがう属性（minions.ts）
//   ・だれかのロボの乱入は、ストーリーには無い（2026-11-23、持ち主が決めた。コンピュータと対戦だけ）
//   ・最初の9章は 地・水・火…月 の章（ボスは cpu.ts の九体、手下は minions.ts）
//   ・10章から先は、哲学・歴史・科学の人物の章（thinkers.ts。2026-11-25）。5人とも戦う前にせりふを言う

import type { Character, Element } from './types';
import { CPU_CHARACTERS } from './cpu';
import { MINIONS } from './minions';
import { PERSON_CHAPTERS, PERSON_ENEMIES } from './thinkers';
import { BOSS_SLOT, CHAPTER_SIZE, STORY_CHAPTERS } from './progress';

// 進み具合の決まりは progress.ts（サーバーも使うので、敵の中身と分けてある）。画面からは、ここからも読めるようにする
export * from './progress';

export interface Chapter {
  no: number; // 1 から
  title: string; // 章の名前
  boss: Character;
  minions: Character[];
  lines: (string | undefined)[]; // 何体目かごとの、戦う前のせりふ（無い敵は言わない。1〜9章はボスだけ）
}

const META: { theme: string; title: string; line: string }[] = [ // theme は章の雰囲気のメモ
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

/** 中身のある章（最初の9章と、10章から先の人物の章） */
export const CHAPTERS: Chapter[] = [
  ...META.map((m, i) => ({
    no: i + 1,
    title: m.title,
    boss: CPU_CHARACTERS[i],
    minions: MINIONS[i],
    lines: [undefined, undefined, undefined, undefined, m.line],
  })),
  ...PERSON_CHAPTERS.map((ch, i) => ({
    no: META.length + 1 + i,
    title: ch.title,
    boss: PERSON_ENEMIES[i][BOSS_SLOT],
    minions: PERSON_ENEMIES[i].slice(0, BOSS_SLOT),
    lines: ch.people.map((p) => p.line),
  })),
];
if (CHAPTERS.length !== STORY_CHAPTERS) throw new Error('STORY_CHAPTERS（progress.ts）と章の数が合いません');

export const chapterOf = (no: number): Chapter | undefined => CHAPTERS[no - 1];

/** その章の、slot 体目の敵（もとの数字のまま。戦うときに atLevel で章のレベルにする） */
export function enemyAt(no: number, slot: number): Character | undefined {
  const ch = chapterOf(no);
  if (!ch) return undefined;
  return slot === BOSS_SLOT ? ch.boss : ch.minions[slot];
}

/**
 * 章の敵のレベル：1・4・7…（3N−2。2026-11-23、持ち主が決めた）。
 * 1章は5勝で Lv6 になるので、章N＝Lv N だと3章から先がほとんど負けなかった。
 * 3N−2 なら、1体のロボで続けて進むと7〜8章で敵と同じくらいのレベルになり、その先はレベル上げが要る
 */
export const chapterLevel = (no: number) => 3 * no - 2;

/** その章の敵の属性（出てくる順に、重ならないように） */
export function chapterElements(no: number): Element[] {
  const out: Element[] = [];
  for (let slot = 0; slot < CHAPTER_SIZE; slot++) {
    const e = enemyAt(no, slot)?.spec.element;
    if (e && !out.includes(e)) out.push(e);
  }
  return out;
}
