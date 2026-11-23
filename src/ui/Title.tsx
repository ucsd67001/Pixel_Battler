import { useEffect, useState } from 'react';
import { useGarage } from '../game/garage';
import { CPU_CHARACTER } from '../game/cpu';
import { checkHealth, type Health } from '../lib/api';
import { Showcase } from './StageView';
import { login, logout, useUser } from '../lib/firebase';
import { isLocalRoom, openRoomLink, RoomSession, type RoomState } from '../net/room';

// タイトルで、ふたりで対戦の部屋にだれがいるかを見る（ログインしている人だけ）
function useRoomPeek(): RoomState | null {
  const user = useUser();
  const [state, setState] = useState<RoomState | null>(null);
  useEffect(() => {
    if (!user && !isLocalRoom()) return;
    let session: RoomSession | null = null;
    let off = false;
    openRoomLink().then((r) => {
      if (off || typeof r === 'string') return;
      session = new RoomSession(r);
      session.on(setState);
    });
    return () => {
      off = true;
      session?.close();
    };
  }, [user]);
  return state;
}

function roomLabel(s: RoomState | null) {
  if (!s) return '';
  if (s.players.length === 0) return 'いま だれも いません';
  if (s.players.length === 1) return `${s.players[0].name} が 待っています！`;
  return 'いま 対戦中';
}

export function Title({
  onCreate,
  onHangar,
  onPick,
  onRoom,
  onStory,
}: {
  onCreate: () => void;
  onHangar: () => void;
  onPick: () => void; // コンピュータと対戦（戦うロボを選ぶ画面へ）
  onRoom: () => void;
  onStory: () => void; // ストーリー（章の一覧へ）
}) {
  const user = useUser();
  const peek = useRoomPeek();
  const waiting = peek?.players.length === 1;
  const hangar = useGarage().list;
  const [ai, setAi] = useState<Health | null>(null);
  useEffect(() => {
    checkHealth().then(setAi);
  }, []);
  const latest = hangar[0];
  // 遊ぶのは、ログインしてから（2026-11-23 から。タイトルだけはログインなしで見られる）。
  // 手元（npm run dev）はログインのしくみが無いので、そのまま遊べる
  const needLogin = !!ai?.auth && user === null;
  const checking = ai === null || (!!ai.auth && user === undefined);
  const [loginError, setLoginError] = useState('');
  return (
    <div className="screen title-screen">
      <Showcase spec={(latest ?? CPU_CHARACTER).spec} className="stage stage-bg" />
      <div className="title-overlay">
        <div className="logo">
          <span className="logo-main">PIXEL BATTLER</span>
          <span className="logo-ja">ピクセル・バトラー</span>
          <span className="logo-sub">写真から、相棒を組み上げろ。</span>
        </div>
        {checking ? (
          <div className="menu">
            <div className="status-line">…</div>
          </div>
        ) : needLogin ? (
          <div className="menu">
            <button
              className="btn primary big"
              onClick={() => {
                setLoginError('');
                login().catch((e) => {
                  const code = String((e as { code?: string }).code ?? '');
                  // 自分でログインの窓を閉じたときは、失敗として出さない
                  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
                  setLoginError(`ログインできませんでした（${(e as Error).message}）`);
                });
              }}
            >
              Google でログイン
            </button>
            <div className="login-note">Google でログインすると、遊べます。</div>
            {loginError && <div className="error">{loginError}</div>}
          </div>
        ) : (
        <div className="menu">
          {latest && (
            <button className="btn primary big" onClick={onStory}>
              ストーリー
            </button>
          )}
          <button className={`btn big${latest ? '' : ' primary'}`} onClick={onCreate}>
            写真から作る
          </button>
          {latest && (
            <button className="btn big" onClick={onPick}>
              コンピュータと対戦
            </button>
          )}
          <button className={`btn room-btn${waiting ? ' waiting' : ''}`} onClick={onRoom}>
            ふたりで対戦
            {peek && <small>{roomLabel(peek)}</small>}
          </button>
          {hangar.length > 0 && (
            <button className="btn ghost" onClick={onHangar}>
              ガレージ（{hangar.length}体）
            </button>
          )}
          {user && (
            <button className="btn ghost small" onClick={() => logout()}>
              {user.displayName ?? user.email} ・ ログアウト
            </button>
          )}
        </div>
        )}
        <div className="status-line">
          {ai === null ? '…' : ai.ai ? `AIの読み取り：オン（${ai.model}）` : 'AIの読み取り：オフ（写真の色から作ります）'}
        </div>
      </div>
    </div>
  );
}
