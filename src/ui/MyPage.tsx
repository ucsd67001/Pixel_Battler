// マイページ：自分の戦績・ストーリーの進み・ロボごとの戦績（2026-11-25）。
// 戦績は src/game/record.ts（数えはじめたのは 2026-11-25 から。それより前の勝ち負けは残っていない）。
// 見られるのは本人だけ（Google の名前もここだけに出す。ランキングには出さない）。

import type { CSSProperties } from 'react';
import { useGarage, useStats, useStory } from '../game/garage';
import { CHAPTERS } from '../game/story';
import { BOSS_SLOT } from '../game/progress';
import { levelOf } from '../game/level';
import { ELEMENT_INFO } from '../game/data';
import { readRecord, totalWins, winRate, type WinLose } from '../game/record';
import { useUser } from '../lib/firebase';
import type { Character } from '../game/types';

function WinLoseBox({ title, w }: { title: string; w: WinLose }) {
  const rate = winRate(w);
  return (
    <div className="my-box">
      <b>{title}</b>
      <div className="my-big">
        {w.win}
        <small>勝</small>
      </div>
      <span>
        {w.lose}敗 ・ 引き分け {w.draw}
        <br />
        勝率 {rate === null ? '－' : `${rate}%`}
      </span>
    </div>
  );
}

const robotWins = (c: Character) => totalWins(readRecord(c.record));

export function MyPage({ onBack }: { onBack: () => void }) {
  const user = useUser();
  const garage = useGarage();
  const stats = useStats();
  const story = useStory();
  // 勝った数の多い順（同じならレベルの高い順）
  const robots = [...garage.list].sort((a, b) => robotWins(b) - robotWins(a) || levelOf(b) - levelOf(a));
  const top = [...garage.list].sort((a, b) => levelOf(b) - levelOf(a))[0];
  const run = story?.run;
  return (
    <div className="screen story-screen page-screen">
      <header className="bar">
        <button className="btn ghost small" onClick={onBack}>
          ◀ タイトル
        </button>
        <span className="bar-title">MY PAGE</span>
      </header>
      <div className="page">
        <div className="my-name">
          <b>{user?.displayName ?? 'プレイヤー'}</b>
          <small>この名前は、自分にしか見えません。</small>
        </div>

        <section className="page-sec">
          <h2>
            <small>RECORD</small>
            戦績
          </h2>
          {!stats ? (
            <p className="page-note">読みこんでいます…</p>
          ) : (
            <div className="my-boxes">
              <WinLoseBox title="コンピュータと対戦" w={stats.cpu} />
              <WinLoseBox title="ふたりで対戦" w={stats.room} />
              <div className="my-box">
                <b>ストーリーモード</b>
                <div className="my-big">
                  {stats.story.win}
                  <small>勝</small>
                </div>
                <span>
                  {!story
                    ? '…'
                    : `${story.cleared}章 クリア（全${CHAPTERS.length}章）`}
                  <br />
                  {run ? `いま ${run.chapter}章の ${run.next === BOSS_SLOT ? 'ボス' : `${run.next + 1}体目`}` : ''}
                </span>
              </div>
            </div>
          )}
          <p className="page-note">戦績は、11月25日から数えています（それより前の勝ち負けは入っていません）。とちゅうでぬけたバトルは数えません。</p>
        </section>

        <section className="page-sec">
          <h2>
            <small>GARAGE</small>
            ロボ
          </h2>
          <p>
            ガレージ：<b>{garage.list.length}</b> / {garage.limit}体
            {top && (
              <>
                <br />
                いちばんレベルが高いロボ：<b>{top.spec.name}</b>（Lv{levelOf(top)}）
              </>
            )}
          </p>
          {!garage.ready ? (
            <p className="page-note">読みこんでいます…</p>
          ) : robots.length === 0 ? (
            <p className="page-note">まだロボがいません。</p>
          ) : (
            <div className="my-robots">
              {robots.map((c) => {
                const r = readRecord(c.record);
                return (
                  <div key={c.seed} className="my-robot" style={{ '--el': ELEMENT_INFO[c.spec.element].color } as CSSProperties}>
                    {c.thumb ? <img src={c.thumb} alt="" /> : <span className="noimg" />}
                    <span className="my-robot-name">
                      <b>{c.spec.name}</b>
                      <small>
                        Lv{levelOf(c)} ・ コンピュータ {r.cpu.win}勝 ・ 対戦 {r.room.win}勝 ・ ストーリー {r.story.win}勝
                      </small>
                    </span>
                    <span className={`rank mini rank-${c.rank}`}>{c.rank}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <button className="btn primary about-back" onClick={onBack}>
          タイトルへ もどる
        </button>
      </div>
    </div>
  );
}
