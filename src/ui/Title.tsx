import { useEffect, useState } from 'react';
import type { Character } from '../game/types';
import { loadHangar } from '../game/storage';
import { CPU_CHARACTER } from '../game/cpu';
import { checkHealth } from '../lib/api';
import { Showcase } from './StageView';

export function Title({
  onCreate,
  onHangar,
  onFight,
}: {
  onCreate: () => void;
  onHangar: () => void;
  onFight: (c: Character) => void;
}) {
  const [hangar] = useState(loadHangar);
  const [ai, setAi] = useState<{ ai: boolean; model: string } | null>(null);
  useEffect(() => {
    checkHealth().then(setAi);
  }, []);
  const latest = hangar[0];
  return (
    <div className="screen title-screen">
      <Showcase spec={(latest ?? CPU_CHARACTER).spec} className="stage stage-bg" />
      <div className="title-overlay">
        <div className="logo">
          <span className="logo-main">SNAPGEAR</span>
          <span className="logo-sub">写真から、相棒を組み上げろ。</span>
        </div>
        <div className="menu">
          <button className="btn primary big" onClick={onCreate}>
            写真から作る
          </button>
          {latest && (
            <button className="btn big" onClick={() => onFight(latest)}>
              {latest.spec.name} で戦う
            </button>
          )}
          {hangar.length > 0 && (
            <button className="btn ghost" onClick={onHangar}>
              格納庫（{hangar.length}体）
            </button>
          )}
        </div>
        <div className="status-line">
          {ai === null ? '…' : ai.ai ? `AI解析：オン（${ai.model}）` : 'AI解析：オフ（写真の色から作ります）'}
        </div>
      </div>
    </div>
  );
}
