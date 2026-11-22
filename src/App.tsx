import { useCallback, useEffect, useRef, useState } from 'react';
import { isMuted, setMuted, sfx, unlockAudio } from './lib/sfx';
import type { Character } from './game/types';
import { Title } from './ui/Title';
import { Create } from './ui/Create';
import { Hangar } from './ui/Hangar';
import { Battle } from './ui/Battle';
import { Room } from './ui/Room';
import type { NetBattle, RoomSession } from './net/room';

type Screen =
  | { name: 'title' }
  | { name: 'create' }
  | { name: 'hangar' }
  | { name: 'battle'; char: Character; key: number }
  | { name: 'room' }
  | { name: 'netbattle'; char: Character; net: NetBattle; key: number };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'title' });
  const fight = (char: Character) => setScreen({ name: 'battle', char, key: Date.now() });
  const title = () => setScreen({ name: 'title' });
  const [muted, setMutedState] = useState(isMuted());

  // ふたりで対戦の部屋（部屋の画面とバトルの画面をまたいで、入ったままにする）
  const [session, setSession] = useState<RoomSession | null>(null);
  const sessionRef = useRef<RoomSession | null>(null);
  sessionRef.current = session;
  const onNetBattle = useCallback((net: NetBattle) => setScreen({ name: 'netbattle', char: net.me, net, key: Date.now() }), []);
  const leaveRoom = () => {
    session?.leave();
    session?.close();
    setSession(null);
    title();
  };
  useEffect(() => {
    // ページを閉じたら、部屋から出る（届かなくても、60秒でいないことになる）
    const bye = () => void sessionRef.current?.leave();
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, []);

  // ボタンを押したら音を鳴らす（ブラウザは、最初に触ったときから音を出せる）
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      unlockAudio();
      const btn = (e.target as HTMLElement | null)?.closest('button');
      if (btn && !btn.disabled && !btn.classList.contains('mute-btn')) sfx((btn.dataset.sfx as never) ?? 'click');
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
    if (muted) sfx('click');
  };
  const muteBtn = (
    <button className="mute-btn" onClick={toggleMute} aria-label={muted ? '音を出す' : '音を消す'}>
      {muted ? '🔇' : '🔊'}
    </button>
  );
  return (
    <>
      {renderScreen()}
      {muteBtn}
    </>
  );

  function renderScreen() {

  switch (screen.name) {
    case 'title':
      return (
        <Title
          onCreate={() => setScreen({ name: 'create' })}
          onHangar={() => setScreen({ name: 'hangar' })}
          onFight={fight}
          onRoom={() => setScreen({ name: 'room' })}
        />
      );
    case 'create':
      return <Create onFight={fight} onBack={title} />;
    case 'hangar':
      return <Hangar onFight={fight} onBack={title} />;
    case 'battle':
      return (
        <Battle
          key={screen.key}
          player={screen.char}
          onExit={title}
          onRematch={() => fight(screen.char)}
        />
      );
    case 'room':
      return <Room session={session} setSession={setSession} onBattle={onNetBattle} onBack={leaveRoom} />;
    case 'netbattle': {
      const back = () => {
        screen.net.close();
        setScreen({ name: 'room' });
      };
      return <Battle key={screen.key} player={screen.char} net={screen.net} onExit={back} onRematch={back} />;
    }
  }
  }
}
