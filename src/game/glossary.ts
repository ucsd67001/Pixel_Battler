// 慣れるまで分かりにくい言葉の説明（タップ・マウスを重ねると、吹き出しで出る）。
// メインの遊び手は小学6年生。小学校で習う漢字だけで書く（npm run check:kanji が見張る）。
// 数字は battle.ts・stats.ts の決まりと合わせる。決まりを変えたら、ここも直す。

import type { Element, Trait } from './types';
import { ELEMENT_INFO, TRAIT_TABLE, matchup } from './data';

export interface Tip {
  title: string;
  body: string;
}

export const GLOSSARY = {
  rank: {
    title: 'ランク（S・A・B・C）',
    body: 'ロボの強さ（総合力）。S がいちばん強く、A・B・C の順。写真で決まり、同じ写真ならいつも同じ。C でも、属性の相性や技の使い方しだいで S に勝てる。',
  },
  hp: { title: 'HP（たいりょく）', body: '0 になると、たおれて負け。' },
  sp: {
    title: 'SP（スキルポイント）',
    body: 'スキルを使うためのポイント。自分の番が来るたびに 10 ずつたまる。ガードすると、さらに +15。',
  },
  atk: { title: 'こうげき', body: '大きいほど、相手にあたえるダメージが大きくなる。' },
  def: { title: 'ぼうぎょ', body: '大きいほど、相手から受けるダメージが小さくなる。' },
  gauge: {
    title: '必殺ゲージ',
    body: 'アタックしたとき・ダメージを受けたとき・ガードしたときにたまる。100%（MAX）になると、必殺技が使える。',
  },
  form: { title: '体の形', body: '人型・けもの型・空中型の三つ。見た目と動きが変わるだけで、強さには関係しない。' },
  weapon: { title: '武器', body: '見た目と、アタックの動きが変わる。強さには関係しない。' },
  trait: { title: '特性', body: 'バトルのあいだ、ずっと自動で効いている、とくべつな力。' },
  skill: {
    title: 'スキル',
    body: 'SP を使って出す、とくべつな技。一度使うと、何ターンか休まないと次が使えない。',
  },
  ult: {
    title: '必殺技',
    body: '必殺ゲージが MAX のときだけ使える、いちばん強い技。ガードされても、半分は当たる。',
  },
  scan: {
    title: 'SCAN（スキャン）',
    body: 'AI が写真の中から見つけた、いちばん目立つもの。ロボは、これをもとに生まれた。',
  },
  guard: {
    title: 'ガード',
    body: '次の自分の番まで、受けるダメージが6割へる。SP も +15 たまる。',
  },
  counter: {
    title: 'カウンターの構え',
    body: '次にこうげきされたら、ダメージを半分にして、1.5倍のパワーでやり返す。',
  },
  buff: {
    title: 'アップ・ダウン',
    body: 'スキルで、こうげきやぼうぎょが上がったり下がったりしている。3ターンたつと、もとにもどる。',
  },
} satisfies Record<string, Tip>;

/** 属性の説明：どれに強くて、どれに弱いか */
export function elementTip(e: Element): Tip {
  const { strong, weak } = matchup(e);
  const name = (x: Element) => `「${ELEMENT_INFO[x].label}」`;
  const parts = [`${name(e)}の属性。`];
  if (strong.length) parts.push(`${strong.map(name).join('')}に強い（ダメージ1.3倍）。`);
  if (weak.length) parts.push(`${weak.map(name).join('')}に弱い（ダメージ0.77倍）。`);
  if (e === 'light' || e === 'dark') parts.push('光と夜は、おたがいに強い。');
  else parts.push('火は森に、森は水に、水は火に強い。');
  return { title: '属性', body: parts.join('') };
}

/** 特性の説明：その特性の効き目 */
export function traitTip(t: Trait): Tip {
  return { title: `特性：${TRAIT_TABLE[t].label}`, body: `${GLOSSARY.trait.body}${TRAIT_TABLE[t].effect}。` };
}
