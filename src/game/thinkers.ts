// ストーリーの10章から先：人物の章（2026-11-25、持ち主と決めた。docs/STORY.md）
//   ・哲学・歴史・科学に関係した人物が敵。生まれた順に、1章に5人（5人目がボス）
//   ・名前は人物の名前そのまま。紹介文で「◯◯の考えから生まれたロボ」と書く
//   ・属性は人物の考えから決める。同じ章の中で、ばらばらでよい（1〜9章の「手下2体は別の属性」は当てはめない）
//   ・5人とも、戦う前にせりふを言う（line）
//   ・強さ：レベルは章のレベル（chapterLevel）。手下は 1〜9章と同じねらい（MINION_TARGET）、ボスは約50%。
//     power は npm run tune:minions で合わせた数字
//   ・言葉は小学校で習う漢字だけ（npm run check:kanji）

import type { Character, Rank } from './types';
import { MINION_RANK, minion, type MinionDef } from './minions';
import { BOSS_SLOT } from './progress';

export interface PersonDef extends MinionDef {
  line: string; // 戦う前のせりふ
  power: number; // 総合力（ボスにも要るので、かならず書く）
}

export interface PersonChapter {
  title: string; // 章の名前
  people: PersonDef[]; // 生まれた順の5人（5人目がボス）
}

/** 同じレベルのランダムなロボが、人物の章のボスに勝つ割合のねらい */
export const PERSON_BOSS_TARGET = 0.5;
const BOSS_RANK: Rank = 'A';

const b = (hp: number, sp: number, atk: number, def: number) => ({ hp, sp, atk, def });

// 10章から順に
export const PERSON_CHAPTERS: PersonChapter[] = [
  // ── 10章 ミレトスの港：港町ミレトスの3人と、ピタゴラス・クセノパネス（この2人は、のちに港から西へ船出した） ──
  {
    title: 'ミレトスの港',
    people: [
      {
        motif: 'タレスの考え', name: 'タレス', title: '日食を言い当てた人',
        description:
          'タレスの考えから生まれたロボ。「すべてのもとは水だ」と考えた、さいしょの考える人。日食の日を言い当て、ピラミッドの高さを かげの長さで はかったという。',
        form: 'humanoid', element: 'tide', bias: b(3, 3, 3, 3), parts: ['crest', 'standard', 'standard', 'standard', 'cape'],
        colors: ['#2a6fb0', '#e8eef6', '#c9a24a', '#7ad8ff'],
        skill: ['ピラミッドはかり', 'strike', 'かげの長さで 相手の弱いところを はかって、思いきり打つ'],
        ult: ['エクリプス・ウェーブ', 'beam', '太陽をかくし、まっくらな中から 水のビームを放つ', '言ったとおり、太陽がかくれるぞ！'],
        trait: 'first',
        line: 'すべてのもとは水だ！ 水がなければ、何も生まれない。',
        power: 79,
      },
      {
        motif: 'アナクシマンドロスの考え', name: 'アナクシマンドロス', title: 'はじめて世界地図をかいた人',
        description:
          'アナクシマンドロスの考えから生まれたロボ。タレスの弟子。すべてのもとは、水でも火でもない「かぎりのない、ふしぎなもの」だと考えた。',
        form: 'floater', element: 'dark', bias: b(3, 4, 2, 3), parts: ['crown', 'slim', 'standard', 'standard', 'cape'],
        colors: ['#2a2350', '#8a6cff', '#c9a24a', '#e0c8ff'],
        skill: ['ト・アペイロン', 'hex', 'かぎりのない ふしぎな力で打ち、相手の力をうばう'],
        ult: ['アペイロン・ノヴァ', 'burst', 'かぎりのない力を ひとつに集めて、大ばくはつさせる', 'すべては、かぎりないものから生まれ、そこへ帰る！'],
        trait: 'regen',
        line: 'もとは水ではない。かぎりのない、ふしぎなものだ！',
        power: 103,
      },
      {
        motif: 'アナクシメネスの考え', name: 'アナクシメネス', title: '空気をすべてのもとにした人',
        description:
          'アナクシメネスの考えから生まれたロボ。すべてのもとは空気で、こくなると風・雲・水・土・石に、うすくなると火になると考えた。',
        form: 'floater', element: 'gale', bias: b(2, 3, 4, 3), parts: ['vfin', 'slim', 'standard', 'thruster', 'wings'],
        colors: ['#d8f4ec', '#4fc8a0', '#a0a8b8', '#3affc0'],
        skill: ['こい空気・うすい空気', 'barrage', '空気を こくしたり うすくしたりして、3回打つ'],
        ult: ['エア・トランス', 'rush', '空気を風に、雲に、水に、石に変えて、つぎつぎぶつける', 'すべては空気だ！'],
        trait: 'evade',
        line: '口をすぼめて ふく息は冷たく、ハーッと はく息は温かい。すべては空気だ！',
        power: 90,
      },
      {
        motif: 'ピタゴラスの考え', name: 'ピタゴラス', title: '数の力を信じた人',
        description:
          'ピタゴラスの考えから生まれたロボ。ミレトスの向かいの島（サモス）の生まれ。「すべては数でできている」と考え、音の美しさも 数のわりあいで説明した。そら豆がきらいだったという。',
        form: 'humanoid', element: 'light', bias: b(3, 4, 3, 2), parts: ['crown', 'standard', 'standard', 'standard', 'cape'],
        colors: ['#f4f0e0', '#ffd84a', '#c9a24a', '#fff6a0'],
        skill: ['数のハーモニー', 'powerup', '数のわりあいで 心をととのえ、こうげきを上げる'],
        ult: ['テトラクティス', 'meteor', '1・2・3・4、あわせて10この光の点で三角形を作り、まとめてうつ', '1・2・3・4、あわせて10！ これが完全な数だ！'],
        trait: 'focus',
        line: 'すべては数でできている。この戦いも、数で読みといてみせよう。',
        power: 104,
      },
      {
        motif: 'クセノパネスの考え', name: 'クセノパネス', title: '旅する詩人',
        description:
          'クセノパネスの考えから生まれたロボ。ミレトスの近くの町の生まれで、90才をこえても 詩を歌いながら旅を続けた。「すべては土と水から生まれた」と考え、ほかの人の考えにも、どんどん言い返した。',
        form: 'humanoid', element: 'verdant', bias: b(4, 3, 3, 3), parts: ['horns', 'heavy', 'heavy', 'heavy', 'cape'],
        colors: ['#6a4a30', '#d8c8a0', '#8a7a5a', '#ffb040'],
        skill: ['牛と馬の神さま', 'counter', '相手の考え（こうげき）を、そのまま言い返す'],
        ult: ['アース・アンド・ウォーター', 'meteor', '土と水をまぜた 大きな岩を、空から落とす', 'すべては土と水から生まれたのだ！'],
        trait: 'guts',
        line: '牛や馬に手があったら、神さまを牛や馬の形にかくだろうよ！',
        power: 99,
      },
    ],
  },
];

/** 人物を、戦える形にする。chapter は章の番号（10 から） */
export function person(chapter: number, slot: number, d: PersonDef, power = d.power): Character {
  const c = minion(chapter, slot, d, power);
  const id = `person-${chapter}-${slot}`;
  return { ...c, id, seed: id, rank: slot === BOSS_SLOT ? BOSS_RANK : MINION_RANK[slot] };
}

/** 10章から先の、章ごとの5人（戦える形） */
export const PERSON_ENEMIES: Character[][] = PERSON_CHAPTERS.map((ch, i) => ch.people.map((d, slot) => person(10 + i, slot, d)));
