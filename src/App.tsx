import { useEffect, useState } from 'react';
import { isMuted, setMuted, sfx, unlockAudio } from './lib/sfx';
import type { Character } from './game/types';
import { Title } from './ui/Title';
import { Create } from './ui/Create';
import { Hangar } from './ui/Hangar';
import { Battle } from './ui/Battle';

type Screen =
  | { name: 'title' }
  | { name: 'create' }
  | { name: 'hangar' }
  | { name: 'battle'; char: Character; key: number };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'title' });
  const fight = (char: Character) => setScreen({ name: 'battle', char, key: Date.now() });
  const title = () => setScreen({ name: 'title' });
  const [muted, setMutedState] = useState(isMuted());

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
  }
  }
}
