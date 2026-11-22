import { useState, type CSSProperties } from 'react';
import type { Character } from '../game/types';
import { deleteCharacter, loadHangar } from '../game/storage';
import { ELEMENT_INFO } from '../game/data';
import { CharacterCard } from './CharacterCard';
import { Showcase } from './StageView';

export function Hangar({ onFight, onBack }: { onFight: (c: Character) => void; onBack: () => void }) {
  const [list, setList] = useState(loadHangar);
  const [sel, setSel] = useState<Character | null>(list[0] ?? null);

  const remove = (c: Character) => {
    if (!window.confirm(`${c.spec.name} をガレージから消しますか？（もとにもどせません）`)) return;
    deleteCharacter(c.id);
    const next = loadHangar();
    setList(next);
    setSel(next[0] ?? null);
  };

  return (
    <div className="screen hangar-screen">
      <header className="bar">
        <button className="btn ghost small" onClick={onBack}>
          ◀ タイトル
        </button>
        <span className="bar-title">GARAGE</span>
      </header>
      {list.length === 0 ? (
        <div className="empty">まだロボがいません。</div>
      ) : (
        <div className="split">
          <div className="split-stage">
            {sel && <Showcase spec={sel.spec} className="stage" />}
            <div className="roster">
              {list.map((c) => (
                <button
                  key={c.id}
                  className={`roster-item${sel?.id === c.id ? ' on' : ''}`}
                  style={{ '--el': ELEMENT_INFO[c.spec.element].color } as CSSProperties}
                  onClick={() => setSel(c)}
                >
                  {c.thumb ? <img src={c.thumb} alt="" /> : <span className="noimg" />}
                  <span className="roster-name">{c.spec.name}</span>
                  <span className={`rank mini rank-${c.rank}`}>{c.rank}</span>
                </button>
              ))}
            </div>
          </div>
          {sel && (
            <div className="split-info">
              <CharacterCard c={sel} />
              <div className="actions">
                <button className="btn primary big" onClick={() => onFight(sel)}>
                  バトルへ！
                </button>
                <button className="btn ghost danger" onClick={() => remove(sel)}>
                  ガレージから消す
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
