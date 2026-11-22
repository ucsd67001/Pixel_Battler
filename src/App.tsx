import { useState } from 'react';
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
