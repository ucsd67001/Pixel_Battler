// 「ピクセル・バトラーって？」：このゲームの考え方と遊び方を、初めての人に説明するページ（2026-11-25）。
// ログインなしで見られる（友達や、おうちの人が「どんなゲーム？」と見に来たときのため）。
// 属性・コマンド・レベルの説明は、glossary.ts と data.ts から読む（決まりを変えたとき、説明がずれないように）。
// 特別な写真のことは書かない。画面の言葉は小学校で習う漢字だけ（npm run check:kanji）。

import type { CSSProperties, ReactNode } from 'react';
import { ELEMENT_INFO, matchup } from '../game/data';
import { GLOSSARY } from '../game/glossary';
import { CHAPTERS } from '../game/story';
import { CHAPTER_SIZE } from '../game/progress';
import { CPU_CHARACTER } from '../game/cpu';
import type { Element } from '../game/types';
import { Showcase } from './StageView';

function El({ e }: { e: Element }) {
  return (
    <span className="chip el" style={{ '--el': ELEMENT_INFO[e].color } as CSSProperties}>
      {ELEMENT_INFO[e].label}
    </span>
  );
}

/** 4すくみの輪：水から順に「強い相手」をたどって、もとにもどるまで */
function cycle(start: Element): Element[] {
  const list: Element[] = [start];
  for (let e = matchup(start).strong[0]; e && e !== start && list.length < 6; e = matchup(e).strong[0]) list.push(e);
  return list;
}

function Section({ title, en, children }: { title: string; en: string; children: ReactNode }) {
  return (
    <section className="about-sec">
      <h2>
        <small>{en}</small>
        {title}
      </h2>
      {children}
    </section>
  );
}

const MODES = [
  { name: 'コンピュータと対戦', body: '自分のロボを選んで、コンピュータのロボと1対1で戦う。あいてには、ほかの人が作ったロボが出てくることもある。' },
  {
    name: 'ストーリーモード',
    body: `章ごとに${CHAPTER_SIZE}体の敵と連続で戦う。${CHAPTER_SIZE}体目はボス。勝つと経験値がたまって、ロボのレベルが上がる。10章からは、むかしの「考える人たち」の考えから生まれたロボが相手。`,
  },
  { name: 'ふたりで対戦', body: '2台のスマホやパソコンで、友達や家族と対戦する。あいてに見えるのは、ロボの名前と姿だけ。' },
  { name: 'ガレージ', body: '作ったロボが、ここにならぶ。ロボの強さや技を見たり、いらないロボを消したりできる。' },
];

export function About({ onBack }: { onBack: () => void }) {
  const ring = cycle('tide');
  const cmds = [
    { name: 'アタック', body: 'ふつうのこうげき。SP を使わないので、いつでも出せる。' },
    { name: 'スキル', body: GLOSSARY.skill.body },
    { name: 'ガード＆リペア', body: GLOSSARY.guard.body },
    { name: '必殺技', body: `${GLOSSARY.ult.body}${GLOSSARY.gauge.body}` },
  ];
  return (
    <div className="screen story-screen about-screen">
      <Showcase spec={CPU_CHARACTER.spec} className="stage stage-bg" />
      <header className="bar">
        <button className="btn ghost small" onClick={onBack}>
          ◀ タイトル
        </button>
        <span className="bar-title">ABOUT</span>
      </header>
      <div className="about">
        <div className="about-hero">
          <h1>ピクセル・バトラーって？</h1>
          <p>
            身のまわりの写真が、<b>自分だけのロボ</b>になる！
            <br />
            できたロボで、コマンドを選んで戦うゲームです。
          </p>
        </div>

        <Section title="ロボが生まれるまで" en="HOW IT WORKS">
          <ol className="about-steps">
            <li>
              <b>写真をとる</b>
              <span>ペン・ねこ・おかし・自転車・空…。何をとってもいい。</span>
            </li>
            <li>
              <b>AI がロボを組み立てる</b>
              <span>写真の中でいちばん目立つものを見つけて、その色や形から、ロボの姿・属性・技を考える。</span>
            </li>
            <li>
              <b>コマンドで戦う</b>
              <span>できたロボはガレージに入る。すぐにバトルへ！</span>
            </li>
          </ol>
          <p className="about-note">
            強さ（HP やこうげきなどの数字と、ランク S・A・B・C）は、写真で決まります。同じ写真からは、いつも同じ強さのロボが生まれます。ランクが低くても、属性の相性や技の使い方しだいで、強いロボに勝てます。
          </p>
        </Section>

        <Section title="遊び方" en="MODES">
          <div className="about-cards">
            {MODES.map((m) => (
              <div key={m.name} className="about-card">
                <b>{m.name}</b>
                <span>{m.body}</span>
              </div>
            ))}
          </div>
          <p className="about-note">ストーリーは、いま {CHAPTERS.length}章まであります。</p>
        </Section>

        <Section title="バトルのきほん" en="BATTLE">
          <p>自分の番が来たら、4つのコマンドから一つ選びます。相手の HP を 0 にしたら勝ち。</p>
          <div className="about-cards">
            {cmds.map((c) => (
              <div key={c.name} className="about-card">
                <b>{c.name}</b>
                <span>{c.body}</span>
              </div>
            ))}
          </div>
          <p className="about-note">{GLOSSARY.round.body}</p>
        </Section>

        <Section title="属性の相性" en="ELEMENTS">
          <p>ロボには、6つの属性のどれかがあります。相性のよい相手には、ダメージが 1.3倍になります。</p>
          <div className="about-ring">
            {ring.map((e) => (
              <span key={e} className="about-ring-item">
                <El e={e} />
                <span className="about-arrow">▶</span>
              </span>
            ))}
            <El e={ring[0]} />
          </div>
          <p className="about-note">矢印の先の属性に強い。水は火を消す。風は火をあおって、かえって大きくしてしまう。風は土や岩をけずる。土は水をせき止めて、すいこむ。</p>
          <div className="about-ring">
            <El e="light" />
            <span className="about-arrow">◀▶</span>
            <El e="dark" />
          </div>
          <p className="about-note">光と夜は、おたがいに強い（どちらも 1.3倍）。</p>
        </Section>

        <Section title="ランクとレベル" en="RANK & LEVEL">
          <div className="about-cards">
            <div className="about-card">
              <b>{GLOSSARY.rank.title}</b>
              <span>{GLOSSARY.rank.body}</span>
            </div>
            <div className="about-card">
              <b>{GLOSSARY.level.title}</b>
              <span>{GLOSSARY.level.body}</span>
            </div>
          </div>
        </Section>

        <Section title="おうちの方へ" en="FOR FAMILIES">
          <ul className="about-list">
            <li>遊ぶには、Google のアカウントでログインします。</li>
            <li>
              ロボを作るとき、写真は ロボの設計のために AI（OpenAI）に送られます。人が写っているときは、顔や体つきではなく、服や持ち物などからロボを作ります。
            </li>
            <li>作ったロボと、その小さな写真（ガレージ）を見られるのは、本人だけです。</li>
            <li>「ふたりで対戦」で あいてに見えるのは、ロボの名前と姿だけです。写真は送りません。</li>
            <li>
              作ったロボは、ほかの人の「コンピュータと対戦」の相手として出ることがあります。そのときも、写真・写っていたもの・作った人の名前は出しません。
            </li>
            <li>写真からロボを作れるのは、1日に決まった回数までです。</li>
          </ul>
        </Section>

        <button className="btn primary about-back" onClick={onBack}>
          タイトルへ もどる
        </button>
      </div>
    </div>
  );
}
