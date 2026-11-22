// 分かりにくい言葉に付ける説明の吹き出し。
// スマホ：タップで出て、ほかの場所をタップすると消える。パソコン：マウスを重ねると出る（クリックでも出る）。
// 吹き出しは画面のいちばん上に出す（カードの枠や、バトルの画面の重なりに隠れないように）。

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Tip } from '../game/glossary';

// 一度に出す吹き出しは一つだけ
let closeCurrent: (() => void) | null = null;
const canHover = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;

export function Term({ tip, children, mark = true, className = '' }: { tip: Tip; children: ReactNode; mark?: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const close = useRef(() => setPos(null)).current;

  const open = () => {
    const el = ref.current;
    if (!el) return;
    if (closeCurrent && closeCurrent !== close) closeCurrent();
    closeCurrent = close;
    const r = el.getBoundingClientRect();
    const below = r.top < 150;
    setPos({ x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
  };

  useEffect(() => {
    if (!pos) return;
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      if (closeCurrent === close) closeCurrent = null;
    };
  }, [pos, close]);

  const width = Math.min(270, window.innerWidth - 24);
  const left = pos ? Math.max(12, Math.min(window.innerWidth - width - 12, pos.x - width / 2)) : 0;

  return (
    <span
      ref={ref}
      className={`term ${className}`}
      role="button"
      tabIndex={0}
      aria-label={`${tip.title}の説明`}
      onClick={(e) => {
        e.stopPropagation();
        if (pos && !canHover()) close();
        else open();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (pos) close();
          else open();
        }
      }}
      onMouseEnter={() => canHover() && open()}
      onMouseLeave={() => canHover() && close()}
    >
      {children}
      {mark && <span className="term-q">?</span>}
      {pos &&
        createPortal(
          <div
            className={`tip-bubble${pos.below ? ' below' : ''}`}
            style={{ left, top: pos.y, width }}
            role="tooltip"
          >
            <b>{tip.title}</b>
            <span>{tip.body}</span>
          </div>,
          document.body,
        )}
    </span>
  );
}
