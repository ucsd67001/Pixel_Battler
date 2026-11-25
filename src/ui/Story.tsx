// ストーリーの画面（2026-11-23。docs/STORY.md の段階4）
//   StoryMap    … 章の一覧（クリアした章と、その次の章が開いている）
//   ChapterView … 章の5体と、次に戦う敵
//   StoryBattle … 5連戦の1戦。勝ったロボに経験値が入り、次の敵へ進む

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Character, Element } from '../game/types';
import { useGarage, useStory, type WinResult } from '../game/garage';
import {
  BOSS_SLOT, CHAPTER_SIZE, CHAPTERS, chapterElements, chapterLevel, chapterOf, enemyAt, isOpen, nextSlot,
  type StoryProgress,
} from '../game/story';
import { atLevel, BOSS_EXP_RATE, EXP_PER_WIN, levelOf } from '../game/level';
import { ELEMENT_INFO, strongAgainst } from '../game/data';
import { Showcase } from './StageView';
import { Battle } from './Battle';

/** 属性の小さな札（色つき） */
function ElementChips({ list }: { list: Element[] }) {
  return (
    <>
      {list.map((e) => (
        <span key={e} className="chip el" style={{ '--el': ELEMENT_INFO[e].color } as CSSProperties}>
          {ELEMENT_INFO[e].label}
        </span>
      ))}
    </>
  );
}

function chapterState(p: StoryProgress, no: number) {
  if (!isOpen(p, no)) return { label: 'まだ', cls: 'locked' };
  if (p.run?.chapter === no) return { label: `${p.run.next}/${CHAPTER_SIZE}`, cls: 'run' };
  if (p.cleared >= no) return { label: 'クリア', cls: 'clear' };
  return { label: 'ちょうせん', cls: 'open' };
}

// ── 章の一覧 ──
export function StoryMap({ onChapter, onBack }: { onChapter: (no: number) => void; onBack: () => void }) {
  const story = useStory();
  const latest = story ? Math.min(story.cleared + 1, CHAPTERS.length) : 1;
  const bg = chapterOf(story?.run?.chapter ?? latest) ?? CHAPTERS[0];
  return (
    <div className="screen story-screen">
      <Showcase spec={bg.boss.spec} className="stage stage-bg" />
      <header className="bar">
        <button className="btn ghost small" onClick={onBack}>
          ◀ タイトル
        </button>
        <span className="bar-title">STORY</span>
        <span className="bar-right">{story ? `${story.cleared}章 クリア` : ''}</span>
      </header>
      {!story ? (
        <div className="empty">読みこんでいます…</div>
      ) : (
        <div className="chapter-list">
          {CHAPTERS.map((ch) => {
            const s = chapterState(story, ch.no);
            return (
              <button
                key={ch.no}
                className={`chapter-item ${s.cls}`}
                style={{ '--el': ELEMENT_INFO[ch.boss.spec.element].color } as CSSProperties}
                disabled={s.cls === 'locked'}
                onClick={() => onChapter(ch.no)}
              >
                <span className="chapter-no">{ch.no}章</span>
                <span className="chapter-name">
                  <b>{ch.title}</b>
                  <small>{s.cls === 'locked' ? '？？？' : `ボス ${ch.boss.spec.name} ・ 敵は Lv${chapterLevel(ch.no)}`}</small>
                </span>
                <span className="chapter-state">{s.cls === 'locked' ? '🔒' : s.label}</span>
              </button>
            );
          })}
          <div className="chapter-more">{CHAPTERS.length + 1}章から先は、じゅんび中です。</div>
        </div>
      )}
    </div>
  );
}

// ── 章の5体 ──
export function ChapterView({
  no,
  onFight,
  onBack,
}: {
  no: number;
  onFight: (slot: number) => void;
  onBack: () => void;
}) {
  const story = useStory();
  const ch = chapterOf(no);
  const next = story ? nextSlot(story, no) : 0;
  const [view, setView] = useState<number | null>(null);
  const shown = view ?? next;
  const enemy = enemyAt(no, shown);
  if (!ch) return null;
  // 光と夜は、おたがいに大ダメージ（「有利」ではない）
  const bossMutual = strongAgainst(ch.boss.spec.element).every((e) => strongAgainst(e).includes(ch.boss.spec.element));
  return (
    <div className="screen story-screen">
      {enemy && <Showcase spec={enemy.spec} className="stage stage-bg" />}
      <header className="bar">
        <button className="btn ghost small" onClick={onBack}>
          ◀ 章の一覧
        </button>
        <span className="bar-title">
          {no}章 {ch.title}
        </span>
        <span className="bar-right">敵は Lv{chapterLevel(no)}</span>
      </header>
      <div className="chapter-view">
        <div className="chapter-hint">
          <span>この章の敵</span>
          <ElementChips list={chapterElements(no)} />
          <span>{bossMutual ? 'ボスとおたがいに大ダメージ' : 'ボスに有利'}</span>
          <ElementChips list={strongAgainst(ch.boss.spec.element)} />
        </div>
        <div className="slot-list">
          {[0, 1, 2, 3, 4].map((slot) => {
            const e = enemyAt(no, slot)!;
            const done = slot < next;
            const cls = done ? 'done' : slot === next ? 'next' : 'later';
            return (
              <button
                key={slot}
                className={`slot-item ${cls}${slot === shown ? ' on' : ''}${slot === BOSS_SLOT ? ' boss' : ''}`}
                style={{ '--el': ELEMENT_INFO[e.spec.element].color } as CSSProperties}
                onClick={() => setView(slot)}
              >
                <span className="slot-no">{slot === BOSS_SLOT ? 'BOSS' : `${slot + 1}体目`}</span>
                <span className="slot-name">
                  <b>{e.spec.name}</b>
                  <small>
                    {ELEMENT_INFO[e.spec.element].label} ・ {e.spec.title}
                  </small>
                </span>
                <span className="slot-state">{done ? '✓' : slot === next ? '▶' : ''}</span>
              </button>
            );
          })}
        </div>
        <div className="actions">
          <button className="btn primary big" disabled={!story} onClick={() => onFight(next)}>
            {next === 0 ? '1体目から ちょうせん！' : next === BOSS_SLOT ? 'ボスに ちょうせん！' : `${next + 1}体目に ちょうせん！`}
          </button>
          {next > 0 && (
            <button className="btn ghost" onClick={() => onFight(0)}>
              1体目から やり直す
            </button>
          )}
          <div className="garage-note">
            5体と続けて戦います。HP は毎回まんたんから。負けても、勝った分は残ります。ロボは1体ごとに 選べます。
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 5連戦の1戦 ──
export function StoryBattle({
  no,
  slot,
  seed,
  onNext,
  onPick,
  onChapter,
  onMap,
}: {
  no: number;
  slot: number;
  seed: string; // 戦うロボ（ガレージの写真の印）
  onNext: (slot: number, seed: string) => void; // 同じロボで、次の敵（または同じ敵にもう一度）
  onPick: (slot: number) => void; // ロボを選び直して、その敵と戦う
  onChapter: (no: number) => void;
  onMap: () => void;
}) {
  const garage = useGarage();
  const base = garage.find(seed);
  // 戦う姿は、始まったときに一度だけ決める（勝って経験値が入っても、このバトルの数字は変えない）
  const [fight, setFight] = useState<{ player: Character; enemy: Character; intro?: string } | null>(null);
  useEffect(() => {
    if (fight || !base) return;
    const enemy = atLevel(enemyAt(no, slot)!, chapterLevel(no));
    const line = chapterOf(no)!.lines[slot];
    const intro = line ? `${enemy.spec.name}「${line}」` : undefined;
    setFight({ player: atLevel(base, levelOf(base)), enemy, intro });
  }, [base, fight, no, slot]);

  // ガレージを読み終えるまでと、戦う姿を決めるまでは「読みこんでいます」（「見つかりません」が一瞬出ないように）
  if (!garage.ready || (base && !fight)) return <div className="screen"><div className="empty">読みこんでいます…</div></div>;
  if (!base || !fight)
    return (
      <div className="screen">
        <div className="empty">
          ロボが見つかりません。
          <button className="btn ghost" onClick={() => onChapter(no)}>
            章の画面へ
          </button>
        </div>
      </div>
    );
  return (
    <Battle
      player={fight.player}
      enemy={fight.enemy}
      intro={fight.intro}
      onExit={() => onChapter(no)}
      onRematch={() => onNext(slot, seed)}
      resultPanel={(r) => (
        <StoryResult result={r} no={no} slot={slot} robot={base} onNext={onNext} onPick={onPick} onChapter={onChapter} onMap={onMap} />
      )}
    />
  );
}

function StoryResult({
  result,
  no,
  slot,
  robot,
  onNext,
  onPick,
  onChapter,
  onMap,
}: {
  result: 'win' | 'lose' | 'draw';
  no: number;
  slot: number;
  robot: Character;
  onNext: (slot: number, seed: string) => void;
  onPick: (slot: number) => void;
  onChapter: (no: number) => void;
  onMap: () => void;
}) {
  const garage = useGarage();
  const [win, setWin] = useState<WinResult | null>(null);
  const [err, setErr] = useState('');
  const sent = useRef(false);
  const send = () => {
    setErr('');
    garage
      .win(robot, no, slot)
      .then(setWin)
      .catch((e) => {
        console.warn('[story] win', e);
        setErr(String((e as Error)?.message ?? e) || 'error'); // 理由も小さく出す（スクショで原因が分かるように）
      });
  };
  useEffect(() => {
    // ガレージ（ログインの状態）を読み終えてから送る
    if (result !== 'win' || sent.current || !garage.ready) return;
    sent.current = true;
    send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, garage.ready]);

  const name = robot.spec.name;
  if (result !== 'win')
    return (
      <div className="story-result">
        <div className="story-gain">{result === 'draw' ? '引き分け。' : '負けても、勝った分は残っています。'}もう一度 ちょうせんしよう！</div>
        <div className="actions row">
          <button className="btn primary" onClick={() => onNext(slot, robot.seed)}>
            もう一度
          </button>
          <button className="btn" onClick={() => onPick(slot)}>
            ロボをかえる
          </button>
          <button className="btn ghost" onClick={() => onChapter(no)}>
            章の画面へ
          </button>
        </div>
      </div>
    );
  if (err)
    return (
      <div className="story-result">
        <div className="error">勝ちを 記録できませんでした。電波のよいところで、もう一度 送ってください。<small className="err-detail">（{err}）</small></div>
        <div className="actions row">
          <button className="btn primary" onClick={send}>
            もう一度 送る
          </button>
          <button className="btn ghost" onClick={() => onChapter(no)}>
            章の画面へ
          </button>
        </div>
      </div>
    );
  if (!win) return <div className="story-result"><div className="story-gain">記録しています…</div></div>;
  if (!win.counted)
    return (
      <div className="story-result">
        <div className="story-gain">この勝ちは 記録されませんでした（前の勝ちから時間が短すぎるか、順番がちがいます）。</div>
        <div className="actions row">
          <button className="btn primary" onClick={() => onChapter(no)}>
            章の画面へ
          </button>
        </div>
      </div>
    );
  const boss = slot === BOSS_SLOT;
  const hasNext = !!chapterOf(no + 1);
  const gain = win.gain ?? EXP_PER_WIN;
  const full = boss ? EXP_PER_WIN * BOSS_EXP_RATE : EXP_PER_WIN; // 相手のレベルが低くないときの量
  return (
    <div className="story-result">
      <div className="story-gain">
        {name} に 経験値 +{gain}
        {boss && gain >= full && <small className="exp-note">（ボスなので 2倍！）</small>}
        {gain < full && <small className="exp-note">（相手のレベルが ずっと低いので、少しだけ）</small>}
        {win.up && <b className="lvup">レベルアップ！ Lv{win.level}</b>}
      </div>
      {boss && <div className="story-clear">{no}章 クリア！</div>}
      <div className="actions row">
        {boss ? (
          <>
            {hasNext && (
              <button className="btn primary" onClick={() => onChapter(no + 1)}>
                {no + 1}章へ
              </button>
            )}
            <button className={`btn${hasNext ? ' ghost' : ' primary'}`} onClick={onMap}>
              章の一覧へ
            </button>
          </>
        ) : (
          <>
            <button className="btn primary" onClick={() => onNext(slot + 1, robot.seed)}>
              {slot + 1 === BOSS_SLOT ? 'このロボで ボスへ' : `このロボで ${slot + 2}体目へ`}
            </button>
            <button className="btn" onClick={() => onPick(slot + 1)}>
              ロボをかえる
            </button>
            <button className="btn ghost" onClick={() => onChapter(no)}>
              章の画面へ
            </button>
          </>
        )}
      </div>
    </div>
  );
}
