import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { isMuted, setMuted, sfx, unlockAudio } from './lib/sfx';
import type { Character } from './game/types';
import { Title } from './ui/Title';
import { About } from './ui/About';
import { MyPage } from './ui/MyPage';
import { Ranking } from './ui/Ranking';
import { NavMenu, type NavTarget } from './ui/NavMenu';
import { Create } from './ui/Create';
import { Hangar } from './ui/Hangar';
import { Items } from './ui/Items';
import { prefetchRival } from './game/rival';
import { Battle } from './ui/Battle';
import { Room } from './ui/Room';
import { ChapterView, StoryBattle, StoryMap } from './ui/Story';
import { BOSS_SLOT, chapterLevel, enemyAt } from './game/story';
import { advantageText, ELEMENT_INFO } from './game/data';
import type { NetBattle, RoomSession } from './net/room';

const NAV_SCREENS: NavTarget[] = ['title', 'pick', 'story', 'room', 'create', 'hangar', 'items', 'mypage', 'ranking', 'about'];

// ロボの見本の画面は開発中だけ。本番のファイルには入れない
const Showroom = lazy(() => import('./ui/Showroom').then((m) => ({ default: m.Showroom })));

type Screen =
  | { name: 'title' }
  | { name: 'about' } // ピクセル・バトラーって？（#about でも開く）
  | { name: 'mypage' } // マイページ（戦績・ロボ）
  | { name: 'ranking' } // ランキング（プレイヤーとロボ）
  | { name: 'create'; make?: 'item' } // make：はじめから「アイテム」を選んでおく（アイテムの置き場から来たとき）
  | { name: 'hangar' }
  | { name: 'items' } // アイテムの置き場（2026-11-25）
  | { name: 'pick' } // コンピュータと対戦：戦うロボを選ぶ
  | { name: 'battle'; char: Character; key: number }
  | { name: 'room' }
  | { name: 'netbattle'; char: Character; net: NetBattle; key: number }
  | { name: 'story' } // ストーリー：章の一覧
  | { name: 'chapter'; no: number } // 章の5体
  | { name: 'storypick'; no: number; slot: number } // 戦うロボを選ぶ
  | { name: 'storybattle'; no: number; slot: number; seed: string; key: number };

export function App() {
  // あそびかたのページは、URL の #about でも開ける（友達やおうちの人に、そのページを教えられるように）
  const [screen, setScreen] = useState<Screen>(() => (location.hash === '#about' ? { name: 'about' } : { name: 'title' }));
  const fight = (char: Character) => setScreen({ name: 'battle', char, key: Date.now() });
  const title = () => {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    setScreen({ name: 'title' });
  };
  const about = () => {
    history.replaceState(null, '', `${location.pathname}${location.search}#about`);
    setScreen({ name: 'about' });
  };
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

  // スマホのメニュー（src/ui/NavMenu.tsx）から、ほかの画面へ
  const startPick = () => {
    void prefetchRival(); // あいてになる、ほかの人のロボを先にもらっておく（コンピュータと対戦だけ）
    setScreen({ name: 'pick' });
  };
  const navGo = (to: NavTarget) => {
    // ふたりで対戦の部屋からほかの画面へ行くときは、部屋から出る（「◀ タイトル」と同じ）
    if (screen.name === 'room' && session) {
      session.leave();
      session.close();
      setSession(null);
    }
    if (to === 'title') title();
    else if (to === 'about') about();
    else if (to === 'pick') startPick();
    else {
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      setScreen({ name: to } as Screen);
    }
  };
  // いまの画面が、メニューのどれにあたるか（ストーリーの中の画面は「ストーリーモード」）
  const navCurrent: NavTarget | null =
    screen.name === 'chapter' || screen.name === 'storypick' ? 'story' : NAV_SCREENS.includes(screen.name as NavTarget) ? (screen.name as NavTarget) : null;
  // バトルの最中は、メニューを出さない（まちがえて押して、とちゅうで終わらないように）
  const inBattle = screen.name === 'battle' || screen.name === 'netbattle' || screen.name === 'storybattle';
  const showroom = import.meta.env.DEV && location.search.includes('showroom');
  return (
    <>
      {renderScreen()}
      {!inBattle && !showroom && <NavMenu current={navCurrent} onGo={navGo} />}
      {muteBtn}
    </>
  );

  function renderScreen() {
  if (import.meta.env.DEV && location.search.includes('showroom'))
    return (
      <Suspense fallback={null}>
        <Showroom />
      </Suspense>
    );

  switch (screen.name) {
    case 'title':
      return (
        <Title
          onAbout={about}
          onMyPage={() => setScreen({ name: 'mypage' })}
          onRanking={() => setScreen({ name: 'ranking' })}
          onCreate={() => setScreen({ name: 'create' })}
          onHangar={() => setScreen({ name: 'hangar' })}
          onItems={() => setScreen({ name: 'items' })}
          onPick={startPick}
          onRoom={() => setScreen({ name: 'room' })}
          onStory={() => setScreen({ name: 'story' })}
        />
      );
    case 'about':
      return <About onBack={title} />;
    case 'mypage':
      return <MyPage onBack={title} />;
    case 'ranking':
      return <Ranking onBack={title} onMyPage={() => setScreen({ name: 'mypage' })} />;
    case 'create':
      return <Create onFight={fight} onBack={title} initialMake={screen.make} />;
    case 'hangar':
      return <Hangar onFight={fight} onBack={title} />;
    case 'items':
      return <Items onBack={title} onCreate={() => setScreen({ name: 'create', make: 'item' })} />;
    case 'pick':
      return <Hangar pick onFight={fight} onBack={title} />;
    case 'battle':
      return (
        <Battle
          key={screen.key}
          player={screen.char}
          record="cpu"
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
      const enemy = enemyAt(no, slot);
      const el = enemy?.spec.element;
      return (
        <Hangar
          pick
          barTitle={`${no}章 ・ ${slot === BOSS_SLOT ? 'BOSS' : `${slot + 1}体目`}`}
          note={
            `相手は「${enemy?.spec.name ?? ''}」（${el ? ELEMENT_INFO[el].label : ''}・Lv${chapterLevel(no)}）。` +
            (el ? advantageText(el) : '') +
            'ロボは、自分のレベルの強さで戦います。'
          }
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
      return <Battle key={screen.key} player={screen.char} net={screen.net} record="room" onExit={back} onRematch={back} />;
    }
  }
  }
}
