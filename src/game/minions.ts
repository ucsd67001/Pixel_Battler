// ストーリーの手下（各章の1〜4体目）。最初の9章で36体（2026-11-23。docs/STORY.md の段階4）。
// ⚠️ 下書き：名前・見た目・技は、持ち主に見てもらってから決める。
//   ・章の雰囲気（地の章なら、石ころ・モグラ…）をそろえる。属性は、だいたい章の属性
//   ・強さ：レベルはボスと同じ（章N → Lv N）。もとの数字はボスより低い（ランク C〜B）。1体目から4体目へ、少しずつ強くする
//   ・数字は手で決めず、傾向（bias）と総合力（power）から statsFor で決める。
//     power は、同じレベルのランダムなロボが勝つ割合が MINION_TARGET になるように、npm run tune:minions で合わせた
//   ・どれも素手（設計図の weapon は 'none'）

import type {
  ArmType, BackType, BodyType, Bias, Character, Element, Form, HeadType, LegType, Rank, SkillKind, Trait, UltStyle,
} from './types';
import { SKILL_TABLE } from './data';
import { statsFor } from './stats';

/** 何体目かごとの総合力のめやす（power を決めていない手下に使う） */
export const MINION_POWER = [89, 92, 95, 98];
/** 同じレベルのランダムなロボが、何体目の手下に勝つ割合のねらい（ボスは約50%） */
export const MINION_TARGET = [0.75, 0.68, 0.62, 0.57];
/** 何体目かごとのランクの表示 */
export const MINION_RANK: Rank[] = ['C', 'C', 'B', 'B'];

export interface MinionDef {
  motif: string;
  name: string;
  title: string;
  description: string;
  form: Form;
  element: Element;
  bias: Bias;
  parts: [HeadType, BodyType, ArmType, LegType, BackType];
  colors: [string, string, string, string]; // 本体・差し色・金属・目
  skill: [string, SkillKind, string];
  ult: [string, UltStyle, string, string]; // 名前・型・説明・叫び
  trait: Trait;
  power?: number; // 総合力（npm run tune:minions で合わせた数字）
}

export function minion(chapter: number, slot: number, d: MinionDef, power = d.power ?? MINION_POWER[slot]): Character {
  const { stats } = statsFor(d.bias, power);
  const rank = MINION_RANK[slot]; // ランクの表示は、何体目かで決める（総合力は手下ごとにちがうため）
  const t = SKILL_TABLE[d.skill[1]];
  const id = `minion-${chapter}-${slot}`;
  return {
    id,
    seed: id,
    spec: {
      motif: d.motif,
      name: d.name,
      title: d.title,
      description: d.description,
      form: d.form,
      element: d.element,
      bias: d.bias,
      parts: { head: d.parts[0], body: d.parts[1], arms: d.parts[2], legs: d.parts[3], back: d.parts[4], weapon: 'none' },
      colors: { primary: d.colors[0], secondary: d.colors[1], accent: d.colors[2], eye: d.colors[3] },
      skill: { name: d.skill[0], kind: d.skill[1], description: d.skill[2] },
      ultimate: { name: d.ult[0], style: d.ult[1], description: d.ult[2], shout: d.ult[3] },
      trait: d.trait,
      bare: 1,
    },
    stats,
    rank,
    skill: { kind: d.skill[1], name: d.skill[0], description: d.skill[2], spCost: t.spCost, cooldown: t.cooldown },
    createdAt: 0,
    source: 'cpu',
  };
}

const b = (hp: number, sp: number, atk: number, def: number): Bias => ({ hp, sp, atk, def });

// 章ごとの4体（1体目から4体目の順）
export const MINION_DEFS: MinionDef[][] = [
  // ── 1章 地（ボス：ドルガイア）：石ころ・モグラ・いのしし・土の人形 ──
  [
    {
      motif: '石ころ', name: 'イシコロン', title: 'ころがる石ころ',
      description: '道ばたの石ころから生まれた、小さなロボ。ころころ転がって、体当たりしてくる。',
      form: 'humanoid', element: 'verdant', bias: b(3, 2, 2, 4), parts: ['mono', 'heavy', 'standard', 'standard', 'none'],
      colors: ['#8a8070', '#c8bca8', '#6a5a48', '#ffb040'],
      skill: ['ゴロゴロタックル', 'strike', '体を丸めて、転がりながらぶつかる'],
      ult: ['ストーン・メテオ', 'meteor', '小石をたくさん、空から落とす', 'ころがれ、ころがれ！'],
      trait: 'ironwall',
      power: 88,
    },
    {
      motif: 'モグラ', name: 'モグラッド', title: '土の中のあなほり名人',
      description: 'モグラから生まれたロボ。土の中から急に顔を出して、すばやく打ってくる。',
      form: 'beast', element: 'verdant', bias: b(2, 3, 4, 2), parts: ['ears', 'slim', 'standard', 'standard', 'none'],
      colors: ['#5a4334', '#d9a88a', '#e8c070', '#ff8a5a'],
      skill: ['ほりほりラッシュ', 'barrage', 'つめのような手で、すばやく三回たたく'],
      ult: ['アンダー・ラッシュ', 'rush', '土の中をほり進み、下から何度も打ち上げる', '土の下から、こんにちは！'],
      trait: 'first',
      power: 76,
    },
    {
      motif: 'いのしし', name: 'ロックボア', title: '岩はだのいのしし',
      description: 'いのししから生まれた、岩のようにかたいロボ。まっすぐ走って、守りごとはじきとばす。',
      form: 'beast', element: 'verdant', bias: b(3, 2, 4, 3), parts: ['horns', 'heavy', 'heavy', 'heavy', 'none'],
      colors: ['#6b4a32', '#a88a62', '#e0b050', '#ff6030'],
      skill: ['いわくだき', 'breaker', '頭からぶつかって、相手の守りをくずす'],
      ult: ['ボア・ストライク', 'burst', '力をためて、大地ごとはじけとぶ', 'まっすぐ、止まらない！'],
      trait: 'pierce',
      power: 82,
    },
    {
      motif: '土の人形', name: 'ドグウガード', title: '大地の門の見はり番',
      description: '古い土の人形から生まれたロボ。大地の門の前に立ち、門番の手下として見はりをしている。',
      form: 'humanoid', element: 'verdant', bias: b(4, 2, 3, 4), parts: ['crown', 'heavy', 'heavy', 'heavy', 'cape'],
      colors: ['#9a6a42', '#e0c090', '#c08040', '#ffd060'],
      skill: ['どろのよろい', 'fortify', '体をどろでかためて、きずをなおす'],
      ult: ['アース・クエイク', 'burst', '地面を強くふみ、大地をゆらす', '門は、通さない！'],
      trait: 'guts',
      power: 84,
    },
  ],
  // ── 2章 水（ボス：シズクレア）：しずく・カエル・雪だるま・こおった湖 ──
  [
    {
      motif: '雨のしずく', name: 'シズクン', title: '雨上がりのしずく',
      description: '雨のしずくから生まれた、小さなロボ。ふわふわうかんで、水のたまを打ってくる。',
      form: 'floater', element: 'tide', bias: b(2, 4, 3, 2), parts: ['crest', 'slim', 'standard', 'standard', 'wings'],
      colors: ['#bfe8ff', '#3aa0e8', '#ffffff', '#40e0ff'],
      skill: ['ぽつぽつショット', 'barrage', '水のたまを、三回続けて打つ'],
      ult: ['レイン・ビーム', 'beam', '雨雲から、水の光線を打ち下ろす', 'ぽつぽつ、ざーざー！'],
      trait: 'focus',
      power: 91,
    },
    {
      motif: 'カエル', name: 'ケロッパ', title: '池のジャンプ名人',
      description: 'カエルから生まれたロボ。大きくジャンプして、上からふみつけてくる。',
      form: 'beast', element: 'tide', bias: b(3, 3, 3, 2), parts: ['ears', 'standard', 'standard', 'thruster', 'none'],
      colors: ['#3aa060', '#a8e080', '#f0d040', '#ffef60'],
      skill: ['ケロケロキック', 'strike', '高くとび上がって、力いっぱいけりこむ'],
      ult: ['ジャンピング・ラッシュ', 'rush', '何度もはねて、上から打ちつける', 'ケロケロ、ぴょーん！'],
      trait: 'evade',
      power: 84,
    },
    {
      motif: '雪だるま', name: 'ユキダルン', title: '雪原の見はり',
      description: '雪だるまから生まれた、まるいロボ。冷たい体で、相手の力をうばう。',
      form: 'humanoid', element: 'tide', bias: b(4, 3, 2, 3), parts: ['mono', 'heavy', 'standard', 'heavy', 'cape'],
      colors: ['#f4f8ff', '#9ac8f0', '#ff7040', '#202838'],
      skill: ['ひえひえタッチ', 'hex', '冷たい手でさわって、相手の力をうばう'],
      ult: ['スノー・メテオ', 'meteor', '大きな雪玉を、空から落とす', '雪にうもれてしまえ！'],
      trait: 'regen',
      power: 89,
    },
    {
      motif: 'こおった湖', name: 'フロストガード', title: 'こおれる湖の兵士',
      description: 'こおった湖から生まれたロボ。武道家の手下として、氷の上で戦う。',
      form: 'humanoid', element: 'tide', bias: b(3, 3, 4, 3), parts: ['vfin', 'standard', 'blade', 'standard', 'boosters'],
      colors: ['#cfe8f8', '#2a78c8', '#a8e0ff', '#7ff6ff'],
      skill: ['アイスカウンター', 'counter', '氷のたてのように受け止めて、打ち返す'],
      ult: ['フリーズ・スラッシュ', 'slash', 'こおった手で、まっすぐ切りつける', 'この氷は、とけない！'],
      trait: 'lucky',
      power: 92,
    },
  ],
  // ── 3章 火（ボス：バーンハウンド）：マッチ・トカゲ・やかん・火柱 ──
  [
    {
      motif: 'マッチぼう', name: 'マッチボー', title: '小さな火の兵',
      description: 'マッチぼうから生まれた、ほそいロボ。頭の火で、相手をあぶってくる。',
      form: 'humanoid', element: 'blaze', bias: b(2, 2, 4, 2), parts: ['crest', 'slim', 'standard', 'standard', 'none'],
      colors: ['#e8c890', '#ff4a2a', '#ffd040', '#ffe060'],
      skill: ['シュッとファイア', 'strike', '頭をこすって、大きな火を出す'],
      ult: ['マッチ・バースト', 'burst', '体じゅうの火を、一気にはじけさせる', 'もえろ、もえろ！'],
      trait: 'first',
      power: 66,
    },
    {
      motif: 'トカゲ', name: 'ヒトカゲン', title: '火山のトカゲ',
      description: 'トカゲから生まれたロボ。あつい岩の上を走り回り、火をはいてくる。',
      form: 'beast', element: 'blaze', bias: b(3, 3, 3, 2), parts: ['horns', 'slim', 'standard', 'standard', 'none'],
      colors: ['#c04020', '#ff9a40', '#ffd040', '#ffff80'],
      skill: ['ほのおのいき', 'drain', '火のいきをはいて、相手の力をすいとる'],
      ult: ['サラマンダー・ビーム', 'beam', '口から、ほのおの光線をはく', 'あつい、あつい！'],
      trait: 'grit',
      power: 82,
    },
    {
      motif: 'やかん', name: 'ヤカンダー', title: 'わきたつやかん',
      description: 'やかんから生まれた、ずんぐりしたロボ。湯気をふき上げて、力をためる。',
      form: 'humanoid', element: 'blaze', bias: b(4, 3, 3, 3), parts: ['mono', 'heavy', 'heavy', 'heavy', 'boosters'],
      colors: ['#b8c0c8', '#e04020', '#303840', '#ff6040'],
      skill: ['ふっとうチャージ', 'powerup', 'お湯をわかして、力をためる'],
      ult: ['スチーム・バースト', 'burst', 'ためた湯気を、一気にふき出す', 'ピーッ！ わいたぞ！'],
      trait: 'fighter',
      power: 86,
    },
    {
      motif: '火柱', name: 'ヒバシラー', title: 'ふき上がる火柱',
      description: '火山の火柱から生まれたロボ。番犬の手下として、火の山を守っている。',
      form: 'floater', element: 'blaze', bias: b(3, 3, 4, 3), parts: ['crown', 'standard', 'blade', 'standard', 'wings'],
      colors: ['#401818', '#ff5020', '#ffb030', '#ffd040'],
      skill: ['ファイアウォール', 'fortify', '火のかべを作って、体を休める'],
      ult: ['ボルケーノ・メテオ', 'meteor', '火山の岩を、まっ赤にして落とす', 'ふき上がれ！'],
      trait: 'pierce',
      power: 91,
    },
  ],
  // ── 4章 風（ボス：ゲイルビート）：わた毛・風車・トンボ・はやぶさ ──
  [
    {
      motif: 'たんぽぽのわた毛', name: 'ワタゲン', title: '風にのるわた毛',
      description: 'たんぽぽのわた毛から生まれた、軽いロボ。ふわりとよけて、また飛んでくる。',
      form: 'floater', element: 'gale', bias: b(2, 4, 2, 3), parts: ['crown', 'slim', 'standard', 'standard', 'wings'],
      colors: ['#f4f4e8', '#a8e0c0', '#f0d040', '#80ffd0'],
      skill: ['ふわふわヒール', 'heal', '風にのって、体を休める'],
      ult: ['ワタゲ・ストーム', 'rush', 'わた毛をたくさん飛ばして、つつみこむ', 'ふわっと、とんでいけ！'],
      trait: 'evade',
      power: 89,
    },
    {
      motif: '風車', name: 'カザグルン', title: 'くるくる風車',
      description: '風車から生まれたロボ。羽を回して、つむじ風をおこす。',
      form: 'floater', element: 'gale', bias: b(3, 3, 3, 2), parts: ['vfin', 'standard', 'standard', 'standard', 'boosters'],
      colors: ['#e04a6a', '#40c0a0', '#f8e060', '#a0fff0'],
      skill: ['くるくるカッター', 'barrage', '回る羽で、三回続けて切りつける'],
      ult: ['トルネード・ビーム', 'beam', '大きなたつまきを、まっすぐ打ち出す', '回れ、回れ！'],
      trait: 'fighter',
      power: 86,
    },
    {
      motif: 'トンボ', name: 'トンボルト', title: 'すいすいトンボ',
      description: 'トンボから生まれた、すばやいロボ。空中で止まり、急に向きを変えてせまる。',
      form: 'beast', element: 'gale', bias: b(2, 3, 4, 2), parts: ['mono', 'slim', 'blade', 'thruster', 'wings'],
      colors: ['#2a6a8a', '#60e0c0', '#d0f080', '#80ffff'],
      skill: ['すいすいスラッシュ', 'strike', '空を一直線に飛んで、すれちがいざまに打つ'],
      ult: ['ドラゴンフライ・ラッシュ', 'rush', '目にも止まらない速さで、何度も打つ', 'ついてこられるか！'],
      trait: 'first',
      power: 81,
    },
    {
      motif: 'はやぶさ', name: 'ハヤブサー', title: '空をかけるはやぶさ',
      description: 'はやぶさから生まれたロボ。つむじ風の王者の手下で、空からまっすぐおりてくる。',
      form: 'floater', element: 'gale', bias: b(3, 2, 5, 3), parts: ['vfin', 'slim', 'standard', 'standard', 'wings'],
      colors: ['#3a4a5a', '#c8d8e0', '#f0c040', '#ffe060'],
      skill: ['ダイブアタック', 'breaker', '空から急にまいおりて、守りをくずす'],
      ult: ['ファルコン・スラッシュ', 'slash', '風を切って、大きく切り上げる', '風より速く！'],
      trait: 'pierce',
      power: 84,
    },
  ],
  // ── 5章 光（ボス：ピカリオン）：ホタル・電球・かがみ・ひまわり ──
  [
    {
      motif: 'ホタル', name: 'ホタルン', title: '夏の夜のホタル',
      description: 'ホタルから生まれた、小さなロボ。おしりの光で、相手の目をくらませる。',
      form: 'floater', element: 'light', bias: b(2, 4, 3, 2), parts: ['ears', 'slim', 'standard', 'standard', 'wings'],
      colors: ['#2a2a20', '#f0f060', '#a0e040', '#ffff80'],
      skill: ['ちかちかライト', 'hex', '光をちかちかさせて、相手の力を弱める'],
      ult: ['ホタル・ビーム', 'beam', 'ためた光を、まっすぐ打ち出す', 'ぴかっ！'],
      trait: 'focus',
      power: 100,
    },
    {
      motif: '電球', name: 'ピカデン', title: 'ぴかぴか電球',
      description: '電球から生まれたロボ。頭の電球をつけて、力をためる。',
      form: 'humanoid', element: 'light', bias: b(3, 3, 3, 3), parts: ['mono', 'standard', 'standard', 'standard', 'boosters'],
      colors: ['#f8f0c0', '#ffd040', '#c0c8d0', '#ffffa0'],
      skill: ['スイッチオン', 'powerup', 'スイッチを入れて、力をいっぱいにする'],
      ult: ['フラッシュ・バースト', 'burst', 'まぶしい光を、一気にはじけさせる', 'まぶしいだろう！'],
      trait: 'lucky',
      power: 88,
    },
    {
      motif: 'かがみ', name: 'ミラーン', title: '光を返すかがみ',
      description: 'かがみから生まれた、すらりとしたロボ。相手のこうげきを、光にかえて返す。',
      form: 'humanoid', element: 'light', bias: b(3, 3, 3, 4), parts: ['vfin', 'slim', 'standard', 'standard', 'cape'],
      colors: ['#e8f0f8', '#a0b8e0', '#ffe080', '#c0f0ff'],
      skill: ['ミラーカウンター', 'counter', 'かがみのように受け止めて、はね返す'],
      ult: ['リフレクト・ビーム', 'beam', '光を何度もはね返して、まとめて打つ', 'はね返してあげる！'],
      trait: 'ironwall',
      power: 97,
    },
    {
      motif: 'ひまわり', name: 'ヒマワリオン', title: '太陽を向く花',
      description: 'ひまわりから生まれたロボ。花火師の手下で、太陽の光をあびて元気になる。',
      form: 'humanoid', element: 'light', bias: b(4, 3, 4, 2), parts: ['crown', 'standard', 'heavy', 'standard', 'none'],
      colors: ['#3a8030', '#ffcc20', '#ff9020', '#ffe060'],
      skill: ['サンシャイン', 'heal', '太陽の光をあびて、きずをなおす'],
      ult: ['ソーラー・ラッシュ', 'rush', '太陽の光をこぶしにこめて、何度も打つ', 'お日さま、力をかして！'],
      trait: 'regen',
      power: 87,
    },
  ],
  // ── 6章 夜（ボス：ジャックランプ）：コウモリ・黒ねこ・フクロウ・おばけ ──
  [
    {
      motif: 'コウモリ', name: 'コウモリン', title: '夜空のコウモリ',
      description: 'コウモリから生まれたロボ。暗やみを飛び回り、相手の力をすいとる。',
      form: 'floater', element: 'dark', bias: b(3, 3, 3, 2), parts: ['ears', 'slim', 'standard', 'standard', 'wings'],
      colors: ['#2a2030', '#7a4aa0', '#c0a0e0', '#ff4060'],
      skill: ['チュウチュウドレイン', 'drain', 'かみついて、相手の力をすいとる'],
      ult: ['バット・ラッシュ', 'rush', '仲間をよんで、いっせいにおそう', '夜は、ぼくらの時間！'],
      trait: 'evade',
      power: 82,
    },
    {
      motif: '黒ねこ', name: 'クロニャン', title: '夜道の黒ねこ',
      description: '黒ねこから生まれた、しなやかなロボ。音を立てずに近づいて、つめでひっかく。',
      form: 'beast', element: 'dark', bias: b(2, 3, 4, 2), parts: ['ears', 'slim', 'blade', 'standard', 'none'],
      colors: ['#1a1a22', '#4a3a6a', '#e0c040', '#ffe040'],
      skill: ['ニャンニャンひっかき', 'barrage', 'すばやく、三回ひっかく'],
      ult: ['シャドウ・スラッシュ', 'slash', 'かげにまぎれて、うしろから切りつける', 'ニャーオ！'],
      trait: 'first',
      power: 80,
    },
    {
      motif: 'フクロウ', name: 'ホーホウル', title: '森の夜番',
      description: 'フクロウから生まれたロボ。大きな目で、相手の動きを見ぬく。',
      form: 'floater', element: 'dark', bias: b(3, 4, 3, 3), parts: ['crest', 'standard', 'standard', 'standard', 'wings'],
      colors: ['#5a4434', '#a88a6a', '#e0c080', '#ffb020'],
      skill: ['ミッドナイトアイ', 'hex', '大きな目でにらんで、相手の力をうばう'],
      ult: ['ムーンレス・ビーム', 'beam', '月の出ない夜の、黒い光をはなつ', 'ホーホー、見えているよ。'],
      trait: 'focus',
      power: 104,
    },
    {
      motif: 'おばけ', name: 'オバケット', title: 'やしきのおばけ',
      description: '白い布のおばけから生まれたロボ。いたずら王の手下で、ふわふわとさまよっている。',
      form: 'floater', element: 'dark', bias: b(4, 3, 3, 3), parts: ['mono', 'standard', 'standard', 'standard', 'cape'],
      colors: ['#e8e8f0', '#8a6ac0', '#6040a0', '#40ff90'],
      skill: ['うらめしタッチ', 'breaker', 'すうっと通りぬけて、守りをくずす'],
      ult: ['ゴースト・バースト', 'burst', '体をふくらませて、一気にはじける', 'ばあっ！'],
      trait: 'guts',
      power: 93,
    },
  ],
  // ── 7章 森（地。ボス：バンブーン）：どんぐり・キノコ・きつつき・クワガタ ──
  [
    {
      motif: 'どんぐり', name: 'ドングリン', title: '落ち葉の中のどんぐり',
      description: 'どんぐりから生まれた、小さなロボ。かたいぼうしをかぶって、ころがってくる。',
      form: 'humanoid', element: 'verdant', bias: b(3, 2, 3, 4), parts: ['crown', 'heavy', 'standard', 'standard', 'none'],
      colors: ['#a06a30', '#6a4020', '#e0c070', '#ffd060'],
      skill: ['どんぐりアタック', 'strike', 'かたい頭で、思いきりぶつかる'],
      ult: ['ナッツ・メテオ', 'meteor', 'どんぐりの雨を、空からふらせる', 'ころころ、どーん！'],
      trait: 'ironwall',
      power: 80,
    },
    {
      motif: 'キノコ', name: 'キノコロン', title: '森のキノコ',
      description: 'キノコから生まれた、ずんぐりしたロボ。ふしぎなこなをまいて、相手を弱らせる。',
      form: 'humanoid', element: 'verdant', bias: b(4, 3, 2, 3), parts: ['mono', 'heavy', 'standard', 'heavy', 'none'],
      colors: ['#e8e0d0', '#d03030', '#f8f0e0', '#ffe080'],
      skill: ['ほうしパウダー', 'hex', 'ふしぎなこなをまいて、相手の力を弱める'],
      ult: ['マッシュルーム・バースト', 'burst', 'かさをふくらませて、一気にはじける', 'ぽふっ！'],
      trait: 'regen',
      power: 86,
    },
    {
      motif: 'きつつき', name: 'キツツキー', title: '木をたたく音',
      description: 'きつつきから生まれたロボ。かたいくちばしで、何度もつついてくる。',
      form: 'floater', element: 'gale', bias: b(2, 3, 4, 2), parts: ['crest', 'slim', 'standard', 'standard', 'wings'],
      colors: ['#2a2a2a', '#e04030', '#f0f0f0', '#ffd040'],
      skill: ['コンコンラッシュ', 'barrage', 'くちばしで、すばやく三回つつく'],
      ult: ['ウッドペッカー・ラッシュ', 'rush', '目にも止まらない速さで、つつき続ける', 'コンコンコン！'],
      trait: 'fighter',
      power: 89,
    },
    {
      motif: 'クワガタ', name: 'クワガッツ', title: '大あごのクワガタ',
      description: 'クワガタから生まれたロボ。竹林の守り手の手下で、大きなあごではさみこむ。',
      form: 'beast', element: 'verdant', bias: b(3, 2, 5, 3), parts: ['horns', 'heavy', 'heavy', 'standard', 'wings'],
      colors: ['#2a1a10', '#7a4a20', '#d0a040', '#ff4020'],
      skill: ['はさみうち', 'breaker', '大きなあごではさんで、守りをくずす'],
      ult: ['シザース・スラッシュ', 'slash', 'あごを大きく開いて、切り上げる', 'はさんで、はなさない！'],
      trait: 'grit',
      power: 83,
    },
  ],
  // ── 8章 海（水。ボス：タイダロン）：クラゲ・カニ・タコ・サメ ──
  [
    {
      motif: 'クラゲ', name: 'クラゲン', title: 'ゆらゆらクラゲ',
      description: 'クラゲから生まれた、すきとおったロボ。ゆらゆらとうかび、しびれる手でさわる。',
      form: 'floater', element: 'tide', bias: b(3, 4, 3, 2), parts: ['crown', 'slim', 'standard', 'standard', 'cape'],
      colors: ['#c0e0ff', '#c080ff', '#ffffff', '#ff80ff'],
      skill: ['びりびりタッチ', 'drain', 'しびれる手でさわって、力をすいとる'],
      ult: ['ジェリー・ビーム', 'beam', '体じゅうを光らせて、光線をはなつ', 'ゆらゆら、びりびり！'],
      trait: 'evade',
      power: 85,
    },
    {
      motif: 'カニ', name: 'シオガニー', title: '岩場のカニ',
      description: 'カニから生まれた、かたいこうらのロボ。横歩きでせまり、大きなはさみで打つ。',
      form: 'beast', element: 'tide', bias: b(3, 2, 3, 4), parts: ['mono', 'heavy', 'heavy', 'heavy', 'none'],
      colors: ['#d04030', '#f0a080', '#f0e0c0', '#202020'],
      skill: ['チョキチョキカウンター', 'counter', 'はさみで受け止めて、はさみ返す'],
      ult: ['クラブ・ラッシュ', 'rush', '両手のはさみで、何度もはさむ', 'チョキチョキ！'],
      trait: 'ironwall',
      power: 84,
    },
    {
      motif: 'タコ', name: 'タコスミン', title: 'すみをはくタコ',
      description: 'タコから生まれたロボ。黒いすみをはいて、相手の目をくらませる。',
      form: 'beast', element: 'tide', bias: b(3, 3, 3, 3), parts: ['mono', 'standard', 'standard', 'standard', 'none'],
      colors: ['#c05050', '#f0a0a0', '#302030', '#ffe060'],
      skill: ['すみはき', 'hex', '黒いすみをはいて、相手の力を弱める'],
      ult: ['オクトパス・ラッシュ', 'rush', '八本の手で、続けて打つ', 'にゅるにゅる、ぺしぺし！'],
      trait: 'lucky',
      power: 93,
    },
    {
      motif: 'サメ', name: 'シャークス', title: '海の大きなサメ',
      description: 'サメから生まれたロボ。深い海の守り神の手下で、するどい歯でかみつく。',
      form: 'beast', element: 'tide', bias: b(4, 2, 5, 2), parts: ['vfin', 'standard', 'blade', 'thruster', 'none'],
      colors: ['#3a5a7a', '#c0d0e0', '#e0e8f0', '#ff3040'],
      skill: ['ガブリンチョ', 'strike', '大きな口で、思いきりかみつく'],
      ult: ['シャーク・ストライク', 'slash', '海の中から、一気にとび出して切りさく', 'ねらった えものは、にがさない！'],
      trait: 'first',
      power: 73,
    },
  ],
  // ── 9章 月（光。ボス：ルミナス）：月見だんご・月のうさぎ・星くず・流れ星 ──
  [
    {
      motif: '月見だんご', name: 'ダンゴロン', title: '月見のおだんご',
      description: '月見だんごから生まれた、まるいロボ。もちもちの体で、こうげきを受け止める。',
      form: 'humanoid', element: 'light', bias: b(4, 3, 2, 3), parts: ['mono', 'heavy', 'standard', 'heavy', 'none'],
      colors: ['#f8f4e8', '#e0d0b0', '#c0a080', '#ffd040'],
      skill: ['もちもちガード', 'fortify', '体をもちもちにして、きずをなおす'],
      ult: ['ダンゴ・メテオ', 'meteor', '大きなおだんごを、空から落とす', 'おだんご、どうぞ！'],
      trait: 'guts',
      power: 85,
    },
    {
      motif: '月のうさぎ', name: 'ムーンラビ', title: '月のうさぎ',
      description: '月のうさぎから生まれたロボ。長い耳で音を聞き、すばやくはねる。',
      form: 'beast', element: 'light', bias: b(2, 3, 4, 2), parts: ['ears', 'slim', 'standard', 'thruster', 'none'],
      colors: ['#f0f0f8', '#c0c8f0', '#ffd860', '#ff6080'],
      skill: ['ぴょんぴょんキック', 'barrage', 'はねながら、三回続けてける'],
      ult: ['ラビット・ラッシュ', 'rush', '月までとどくほどはねて、何度もける', 'ぴょーん！'],
      trait: 'evade',
      power: 86,
    },
    {
      motif: '星くず', name: 'ホシクズン', title: '夜空の星くず',
      description: '夜空の星くずから生まれたロボ。きらきら光りながら、相手の力をすいとる。',
      form: 'floater', element: 'dark', bias: b(3, 4, 3, 2), parts: ['crown', 'slim', 'standard', 'standard', 'wings'],
      colors: ['#1a1c40', '#6070e0', '#ffe080', '#ffffa0'],
      skill: ['きらきらドレイン', 'drain', '星の光で打ち、力をすいとる'],
      ult: ['スターダスト・ビーム', 'beam', '星くずを集めて、光線にする', 'きらきら、ひかれ！'],
      trait: 'focus',
      power: 95,
    },
    {
      motif: '流れ星', name: 'メテオラン', title: 'かけぬける流れ星',
      description: '流れ星から生まれたロボ。三日月の見はり番の手下で、夜空をまっすぐかけぬける。',
      form: 'floater', element: 'light', bias: b(3, 3, 5, 2), parts: ['vfin', 'slim', 'standard', 'thruster', 'boosters'],
      colors: ['#283060', '#ffd860', '#ffffff', '#a0f0ff'],
      skill: ['シューティングスター', 'strike', '流れ星のように、まっすぐぶつかる'],
      ult: ['ミーティア・メテオ', 'meteor', '流れ星を、たくさんふらせる', 'ねがいごとを、どうぞ！'],
      trait: 'fighter',
      power: 85,
    },
  ],
];

/** 章ごとの手下（章の番号は 1 から。最初の9章だけ） */
export const MINIONS: Character[][] = MINION_DEFS.map((list, ci) => list.map((d, si) => minion(ci + 1, si, d)));
