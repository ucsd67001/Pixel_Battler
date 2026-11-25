import { useEffect, useRef } from 'react';
import type { CharacterSpec } from '../game/types';
import type { ItemSpec } from '../game/items';
import { Stage, type StageMode } from '../three/stage';

export function StageView({
  mode,
  onReady,
  className,
}: {
  mode: StageMode;
  onReady: (s: Stage) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onReady);
  cb.current = onReady;
  useEffect(() => {
    const s = new Stage(ref.current!, mode);
    if (import.meta.env.DEV) (window as any).__stage = s; // 試すときに中を触るため（開発中だけ）
    cb.current(s);
    return () => s.dispose();
  }, [mode]);
  return <div ref={ref} className={className ?? 'stage'} />;
}

// 一体だけを台座の上で回して見せる
// item＝持たせているアイテム（2026-11-26）
export function Showcase({
  spec,
  item,
  reveal,
  className,
}: {
  spec: CharacterSpec;
  item?: ItemSpec;
  reveal?: boolean;
  className?: string;
}) {
  const stage = useRef<Stage | null>(null);
  const shown = useRef<{ spec: CharacterSpec; item?: ItemSpec } | null>(null);
  const show = (s: Stage) => {
    if (shown.current?.spec === spec && shown.current.item === item) return;
    shown.current = { spec, item };
    s.setShowcase(spec, item);
    if (reveal) s.reveal();
  };
  useEffect(() => {
    if (stage.current) show(stage.current);
  });
  return (
    <StageView
      mode="showcase"
      className={className}
      onReady={(s) => {
        stage.current = s;
        shown.current = null;
        show(s);
      }}
    />
  );
}
