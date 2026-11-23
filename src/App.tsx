import { useCallback, useEffect, useRef, useState } from 'react';
import { isMuted, setMuted, sfx, unlockAudio } from './lib/sfx';
import type { Character } from './game/types';
import { Title } from './ui/Title';
import { Create } from './ui/Create';
import { Hangar } from './ui/Hangar';
import { Battle } from './ui/Battle';
import { Room } from './ui/Room';
import { Showroom } from './ui/Showroom';
import { ChapterView, StoryBattle, StoryMap } from './ui/Story';
import { chapterLevel, chapterOf } from './game/story';
import type { NetBattle, RoomSession } from './net/room';

type Screen =
  | { name: 'title' }
  | { name: 'create' }
  | { name: 'hangar' }
  | { name: 'pick' } // コンピュータと対戦：戦うロボを選ぶ
  | { name: 'battle'; char: Character; key: number }
  | { name: 'room' }
  | { name: 'netbattle'; char: Character; net: NetBattle; key: number }
  | { name: 'story' } // ストーリー：章の一覧
  | { name: 'chapter'; no: number } // 章の5体
  | { name: 'storypick'; no: number; slot: number } // 戦うロボを選ぶ
  | { name: 'storybattle'; no: number; slot: number; seed: string; key: number };

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
  if (import.meta.env.DEV && location.search.includes('showroom')) return <Showroom />;

  switch (screen.name) {
    case 'title':
      return (
        <Title
          onCreate={() => setScreen({ name: 'create' })}
          onHangar={() => setScreen({ name: 'hangar' })}
          onPick={() => setScreen({ name: 'pick' })}
          onRoom={() => setScreen({ name: 'room' })}
          onStory={() => setScreen({ name: 'story' })}
        />
      );
    case 'create':
      return <Create onFight={fight} onBack={title} />;
    case 'hangar':
      return <Hangar onFight={fight} onBack={title} />;
    case 'pick':
      return <Hangar pick onFight={fight} onBack={title} />;
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
    case 'story':
      return <StoryMap onChapter={(no) => setScreen({ name: 'chapter', no })} onBack={title} />;
    case 'chapter':
      return (
        <ChapterView
          no={screen.no}
          onFight={(slot) => setScreen({ name: 'storypick', no: screen.no, slot })}
          onBack={() => setScreen({ name: 'story' })}
        />
      );
    case 'storypick': {
      const { no, slot } = screen;
      return (
        <Hangar
          pick
          barTitle={`${no}章 ・ ${slot === 4 ? 'BOSS' : `${slot + 1}体目`}`}
          note={`${chapterOf(no)?.theme ?? ''}の章の敵は Lv${chapterLevel(no)}。戦うロボを えらんでください。ロボは、自分のレベルの強さで戦います。`}
          backLabel="◀ 章の画面"
          onBack={() => setScreen({ name: 'chapter', no })}
          onFight={(c) => setScreen({ name: 'storybattle', no, slot, seed: c.seed, key: Date.now() })}
        />
      );
    }
    case 'storybattle':
      return (
        <StoryBattle
          key={screen.key}
          no={screen.no}
          slot={screen.slot}
          seed={screen.seed}
          onNext={(slot, seed) => setScreen({ name: 'storybattle', no: screen.no, slot, seed, key: Date.now() })}
          onPick={(slot) => setScreen({ name: 'storypick', no: screen.no, slot })}
          onChapter={(no) => setScreen({ name: 'chapter', no })}
          onMap={() => setScreen({ name: 'story' })}
        />
      );
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
