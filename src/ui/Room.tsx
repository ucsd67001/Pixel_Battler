// ふたりで対戦の部屋。自分のロボを選んで入り、あいてが入ってきたら「バトル開始！」。
// 部屋はいまは一つだけ。入れるのは二人まで。Google でログインした人ならだれでも入れる。
// 知らない人とも会うので、出すのはロボの名前だけ。写真は自分のものだけ、自分の画面に出す。

import { useEffect, useState, type CSSProperties } from 'react';
import type { Character } from '../game/types';
import { loadHangar } from '../game/storage';
import { ELEMENT_INFO } from '../game/data';
import { login, useUser } from '../lib/firebase';
import { isLocalRoom, makeNetBattle, openRoomLink, RoomSession, type NetBattle, type RoomPlayer, type RoomState } from '../net/room';

type Status = 'loading' | 'login' | 'error' | 'ready';

function Slot({ p, label, me, thumb }: { p?: RoomPlayer; label: string; me?: boolean; thumb?: string }) {
  if (!p)
    return (
      <div className="room-slot empty">
        <div className="room-slot-label">{label}</div>
        <div className="room-wait">
          <span className="room-dots">●●●</span>
          <span>あいてが 入ってくるのを 待っています</span>
        </div>
      </div>
    );
  const el = ELEMENT_INFO[p.char.spec.element];
  return (
    <div className={`room-slot${me ? ' me' : ''}`} style={{ '--el': el.color } as CSSProperties}>
      <div className="room-slot-label">{label}</div>
      <div className="room-slot-body">
        {thumb ? <img src={thumb} alt="" /> : <span className="noimg" style={{ background: el.color }} />}
        <div>
          <div className="room-robot">
            <b>{p.char.spec.name}</b> <span className={`rank mini rank-${p.char.rank}`}>{p.char.rank}</span>
          </div>
          <div className="room-el">{el.label}</div>
        </div>
      </div>
    </div>
  );
}

export function Room({
  session,
  setSession,
  onBattle,
  onBack,
}: {
  session: RoomSession | null;
  setSession: (s: RoomSession | null) => void;
  onBattle: (net: NetBattle) => void;
  onBack: () => void;
}) {
  const user = useUser();
  const [status, setStatus] = useState<Status>(session ? 'ready' : 'loading');
  const [state, setState] = useState<RoomState>(session?.state ?? { players: [], battle: null });
  const [hangar] = useState(loadHangar);
  const [pick, setPick] = useState<Character | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // 部屋につなぐ（Google でログインしてから）
  useEffect(() => {
    if (session) return;
    if (user === undefined && !isLocalRoom()) return;
    let off = false;
    setStatus('loading');
    openRoomLink().then((r) => {
      if (off) return;
      if (typeof r === 'string') setStatus(r);
      else {
        setSession(new RoomSession(r));
        setStatus('ready');
      }
    });
    return () => {
      off = true;
    };
  }, [user, session, setSession]);

  // だれがいるかを見張り、新しいバトルが始まったら飛びこむ
  useEffect(() => {
    if (!session) return;
    return session.on((s) => {
      setState(s);
      const b = session.freshBattle();
      if (b) onBattle(makeNetBattle(session, b));
    });
  }, [session, onBattle]);

  const me = session ? state.players.find((p) => p.uid === session.me) : undefined;
  const others = session ? state.players.filter((p) => p.uid !== session.me) : [];
  const full = !me && others.length >= 2;
  const joined = !!me;
  const chosen = pick ?? me?.char ?? hangar[0] ?? null;

  const enter = async () => {
    if (!session || !chosen) return;
    setBusy(true);
    setErr('');
    try {
      const r = await session.join(chosen);
      if (r === 'full') setErr('いま、ほかの二人が 部屋を使っています。');
      setChoosing(false);
    } catch {
      setErr('部屋に入れませんでした。電波のよいところで、もう一度ためしてください。');
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    if (!session) return;
    setBusy(true);
    setErr('');
    try {
      if (!(await session.start())) setErr('あいてが まだ 部屋にいません。');
    } catch {
      setErr('バトルを始められませんでした。もう一度ためしてください。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen room-screen">
      <header className="bar">
        <button className="btn ghost small" onClick={onBack}>
          ◀ タイトル
        </button>
        <span className="bar-title">ふたりで対戦</span>
      </header>
      <div className="room-body">
        {status === 'loading' && <div className="empty">部屋に つないでいます…</div>}
        {status === 'login' && (
          <div className="empty room-msg">
            <p>ふたりで対戦するには、Google でログインしてください。</p>
            <button className="btn primary" onClick={() => login().catch(() => setErr('ログインできませんでした。'))}>
              Google でログイン
            </button>
          </div>
        )}
        {status === 'error' && <div className="empty">部屋に つなげませんでした。少しあとで、もう一度ひらいてください。</div>}

        {status === 'ready' && (
          <>
            <div className="room-slots">
              {joined ? (
                <>
                  <Slot p={me} label="あなた" me thumb={session?.myChar?.thumb} />
                  <div className="room-vs">VS</div>
                  <Slot p={others[0]} label="あいて" />
                </>
              ) : (
                <>
                  <Slot p={others[0]} label="部屋にいる人" />
                  {others[1] && <Slot p={others[1]} label="部屋にいる人" />}
                </>
              )}
            </div>
            <div className="room-note">
              {full
                ? 'いま、ほかの二人が 対戦しています。終わるのを待ってね。'
                : joined
                  ? others.length
                    ? 'ふたりそろいました！ どちらかが「バトル開始！」をおすと始まります。'
                    : 'あいてが 入ってくると、ここに出てきます。'
                  : others.length
                    ? `${others[0].name} が 待っています。ロボを選んで 入ろう！`
                    : 'まだ だれも いません。ロボを選んで 入って待とう。'}
            </div>

            {(!joined || choosing) && !full && (
              <div className="room-pick">
                {hangar.length === 0 ? (
                  <div className="empty">先に「写真から作る」で、ロボを作ってください。</div>
                ) : (
                  <>
                    <div className="roster">
                      {hangar.map((c) => (
                        <button
                          key={c.id}
                          className={`roster-item${chosen?.id === c.id ? ' on' : ''}`}
                          style={{ '--el': ELEMENT_INFO[c.spec.element].color } as CSSProperties}
                          onClick={() => setPick(c)}
                        >
                          {c.thumb ? <img src={c.thumb} alt="" /> : <span className="noimg" />}
                          <span className="roster-name">{c.spec.name}</span>
                          <span className={`rank mini rank-${c.rank}`}>{c.rank}</span>
                        </button>
                      ))}
                    </div>
                    <button className="btn primary big" disabled={busy || !chosen} onClick={enter}>
                      {joined ? `${chosen?.spec.name} に かえる` : `${chosen?.spec.name} で 部屋に入る`}
                    </button>
                  </>
                )}
              </div>
            )}

            {joined && !choosing && (
              <div className="actions">
                <button className="btn primary big" disabled={busy || others.length === 0} onClick={start}>
                  バトル開始！
                </button>
                <button className="btn ghost" disabled={busy} onClick={() => setChoosing(true)}>
                  ロボを かえる
                </button>
              </div>
            )}
            {err && <div className="room-err">{err}</div>}
          </>
        )}
      </div>
    </div>
  );
}
