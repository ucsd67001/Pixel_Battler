// ランキング：プレイヤーとロボ、3つずつ（2026-11-25。決まりは src/game/ranking.ts、集めるのはサーバーの /api/ranking）。
//   ・プレイヤーは、ニックネームを決めた人だけ出る（決めていない人には、マイページへの入り口を出す）
//   ・ロボは、みんなのロボが出る。持ち主はニックネームの人だけ名前を出し、ほかは「ないしょ」。えらぶと、うしろに姿が出る

import { useEffect, useState, type CSSProperties } from 'react';
import { postApi } from '../lib/api';
import { ELEMENT_INFO } from '../game/data';
import { RANKING_SIZE, type PlayerBoard, type PlayerRow, type RankingData, type RobotBoard, type RobotRow } from '../game/ranking';
import { Showcase } from './StageView';

const PLAYER_TABS: [PlayerBoard, string][] = [
  ['cpu', 'コンピュータ'],
  ['story', 'ストーリー'],
  ['room', 'ふたりで対戦'],
];
const ROBOT_TABS: [RobotBoard, string][] = [
  ['cpu', 'コンピュータ'],
  ['level', 'レベル'],
  ['room', 'ふたりで対戦'],
];
const PLAYER_NOTE: Record<PlayerBoard, string> = {
  cpu: 'コンピュータと対戦で 勝った数',
  story: 'ストーリーモードで 進んだところ（同じなら、先に着いた人が上）',
  room: 'ふたりで対戦で 勝った数',
};
const ROBOT_NOTE: Record<RobotBoard, string> = {
  cpu: 'コンピュータと対戦で 勝った数',
  level: 'ストーリーモードで 育てたレベル（同じなら、経験値の多いロボが上）',
  room: 'ふたりで対戦で 勝った数',
};

function Place({ n }: { n: number }) {
  return <span className={`rk-place p${Math.min(n, 4)}`}>{n <= 3 ? ['🥇', '🥈', '🥉'][n - 1] : `${n}位`}</span>;
}

function storyText(r: PlayerRow) {
  const cleared = r.cleared ?? 0;
  const won = r.next ?? 0;
  return `${cleared}章クリア${won > 0 ? `・${cleared + 1}章で ${won}体に勝った` : ''}`;
}

export function Ranking({ onBack, onMyPage }: { onBack: () => void; onMyPage: () => void }) {
  const [data, setData] = useState<RankingData | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'players' | 'robots'>('players');
  const [pb, setPb] = useState<PlayerBoard>('cpu');
  const [rb, setRb] = useState<RobotBoard>('level');
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const r = await postApi('/api/ranking', {});
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = (await r.json()) as RankingData;
        if (!off) setData(d);
      } catch (e) {
        console.warn('[ranking]', e);
        if (!off) setErr('ランキングを 読みこめませんでした。電波のよいところで、もう一度 開いてね。');
      }
    })();
    return () => {
      off = true;
    };
  }, []);

  const robotRows: RobotRow[] = data?.robots[rb] ?? [];
  const shown = tab === 'robots' ? (robotRows.find((r) => r.id === sel) ?? robotRows[0]) : undefined;
  const players: PlayerRow[] = data?.players[pb] ?? [];
  const myPlace = data?.me.places[pb] ?? null;

  return (
    <div className="screen story-screen page-screen">
      {shown && <Showcase key={`${rb}-${shown.id}`} spec={shown.spec} className="stage stage-bg" />}
      <header className="bar">
        <button className="btn ghost small" onClick={onBack}>
          ◀ タイトル
        </button>
        <span className="bar-title">RANKING</span>
      </header>
      <div className="page">
        <div className="rk-tabs main">
          <button className={tab === 'players' ? 'on' : ''} onClick={() => setTab('players')}>
            プレイヤー
          </button>
          <button className={tab === 'robots' ? 'on' : ''} onClick={() => setTab('robots')}>
            ロボ
          </button>
        </div>
        <div className="rk-tabs">
          {(tab === 'players' ? PLAYER_TABS : ROBOT_TABS).map(([k, label]) => (
            <button
              key={k}
              className={(tab === 'players' ? pb : rb) === k ? 'on' : ''}
              onClick={() => {
                if (tab === 'players') setPb(k as PlayerBoard);
                else {
                  setRb(k as RobotBoard);
                  setSel(null);
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="page-note rk-what">{tab === 'players' ? PLAYER_NOTE[pb] : ROBOT_NOTE[rb]}</p>

        {err ? (
          <div className="error">{err}</div>
        ) : !data ? (
          <p className="page-note">読みこんでいます…</p>
        ) : tab === 'players' ? (
          <>
            {!data.me.nickname ? (
              <div className="rk-me">
                ニックネームを決めると、ランキングに出られます。
                <button className="btn primary small" onClick={onMyPage}>
                  マイページで決める
                </button>
              </div>
            ) : (
              <div className="rk-me">
                <b>{data.me.nickname}</b> は{' '}
                {myPlace ? <b className="rk-my-place">{myPlace}位</b> : 'まだ ランキングに出ていません（1勝すると出ます）'}
              </div>
            )}
            {players.length === 0 ? (
              <p className="page-note">まだ だれもいません。</p>
            ) : (
              <div className="rk-list">
                {players.map((r, i) => (
                  <div key={i} className={`rk-row${r.me ? ' me' : ''}`}>
                    <Place n={r.place} />
                    <span className="rk-name">
                      <b>{r.name}</b>
                    </span>
                    <span className="rk-value">{pb === 'story' ? storyText(r) : `${r.value}勝`}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : robotRows.length === 0 ? (
          <p className="page-note">まだ どのロボもいません。</p>
        ) : (
          <div className="rk-list">
            {robotRows.map((r) => (
              <button
                key={r.id}
                className={`rk-row robot${r.me ? ' me' : ''}${shown?.id === r.id ? ' on' : ''}`}
                style={{ '--el': ELEMENT_INFO[r.element].color } as CSSProperties}
                onClick={() => setSel(r.id)}
              >
                <Place n={r.place} />
                <span className="rk-name">
                  <b>{r.name}</b>
                  <small>
                    {ELEMENT_INFO[r.element].label} ・ {r.owner || 'ないしょ'} のロボ{r.me ? '（自分）' : ''}
                  </small>
                </span>
                <span className={`rank mini rank-${r.rank}`}>{r.rank}</span>
                <span className="rk-value">{rb === 'level' ? `Lv${r.value}` : `${r.value}勝`}</span>
              </button>
            ))}
          </div>
        )}
        <p className="page-note">
          上から{RANKING_SIZE}番目までを出します。1分ごとに 新しくなります。戦績は 11月25日から数えています。
          {tab === 'robots' && ' ロボの持ち主は、ニックネームを決めた人だけ名前が出ます。'}
        </p>
      </div>
    </div>
  );
}
