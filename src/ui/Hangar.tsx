import { useEffect, useState, type CSSProperties } from 'react';
import type { Character } from '../game/types';
import { GARAGE_LIMIT } from '../game/storage';
import { useGarage } from '../game/garage';
import { ELEMENT_INFO } from '../game/data';
import { CharacterCard } from './CharacterCard';
import { Showcase } from './StageView';

export function Hangar({ onFight, onBack }: { onFight: (c: Character) => void; onBack: () => void }) {
  const garage = useGarage();
  const list = garage.list;
  const [selSeed, setSelSeed] = useState<string | null>(null);
  const sel = list.find((c) => c.seed === selSeed) ?? list[0] ?? null;
  const setSel = (c: Character) => setSelSeed(c.seed);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (selSeed && !list.some((c) => c.seed === selSeed)) setSelSeed(null);
  }, [list, selSeed]);

  const remove = async (c: Character) => {
    if (!window.confirm(`${c.spec.name} をガレージから消しますか？（もとにもどせません）`)) return;
    setBusy(true);
    setErr('');
    try {
      await garage.remove(c);
      setSelSeed(null);
    } catch {
      setErr('消せませんでした。電波のよいところで、もう一度ためしてください。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen hangar-screen">
      <header className="bar">
        <button className="btn ghost small" onClick={onBack}>
          ◀ タイトル
        </button>
        <span className="bar-title">GARAGE</span>
        <span className="bar-right garage-count">
          {list.length} / {GARAGE_LIMIT}体
        </span>
      </header>
      <div className="garage-note">
        {garage.cloud
          ? 'ログインしているので、ロボはクラウドに しまってあります。ほかのスマホでも、同じガレージです。'
          : 'ロボは、このスマホの中に しまってあります。Google でログインすると、クラウドに うつせます。'}
        {garage.left > 0 &&
          ` ガレージが いっぱいで、このスマホの ロボ ${garage.left}体を まだ うつせていません。どれかを消すと、うつります。`}
      </div>
      {err && <div className="error">{err}</div>}
      {!garage.ready ? (
        <div className="empty">ガレージを 読みこんでいます…</div>
      ) : list.length === 0 ? (
        <div className="empty">まだロボがいません。</div>
      ) : (
        <div className="split">
          <div className="split-stage">
            {sel && <Showcase spec={sel.spec} className="stage" />}
            <div className="roster">
              {list.map((c) => (
                <button
                  key={c.seed}
                  className={`roster-item${sel?.seed === c.seed ? ' on' : ''}`}
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
                <button className="btn ghost danger" disabled={busy} onClick={() => remove(sel)}>
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
