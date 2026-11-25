// スマホのメニュー（ハンバーガーメニュー。2026-11-25、持ち主の希望）。
//   ・右上の「☰」で開き、どの画面からでも、ほかの画面へとべる（タイトルにもどらなくてよい）
//   ・出すのはスマホやタブレットのせまい画面だけ（styles.css の .nav-btn）。パソコンの広い画面は、いままでどおり
//   ・バトルの最中は出さない（まちがえて押して、バトルがとちゅうで終わらないように。バトルは「にげる」でぬける）
//   ・ログインする前は、タイトルとあそびかただけ（ほかの画面は、ログインしてから遊ぶため）

import { useEffect, useState } from 'react';
import { useUser } from '../lib/firebase';

export type NavTarget = 'title' | 'pick' | 'story' | 'room' | 'create' | 'hangar' | 'items' | 'mypage' | 'ranking' | 'about';

const GROUPS: { label: string; items: { to: NavTarget; label: string; login?: boolean }[] }[] = [
  {
    label: 'あそぶ',
    items: [
      { to: 'pick', label: 'コンピュータと対戦', login: true },
      { to: 'story', label: 'ストーリーモード', login: true },
      { to: 'room', label: 'ふたりで対戦', login: true },
    ],
  },
  {
    label: 'ロボとアイテム',
    items: [
      { to: 'create', label: '写真から作る', login: true },
      { to: 'hangar', label: 'ガレージ', login: true },
      { to: 'items', label: 'アイテムの置き場', login: true },
    ],
  },
  {
    label: 'みる',
    items: [
      { to: 'mypage', label: 'マイページ', login: true },
      { to: 'ranking', label: 'ランキング', login: true },
      { to: 'about', label: 'あそびかた' },
    ],
  },
];

export function NavMenu({ current, onGo }: { current: NavTarget | null; onGo: (to: NavTarget) => void }) {
  const [open, setOpen] = useState(false);
  const user = useUser();
  // 本番では、ログインしてから遊ぶ（手元はログインのしくみが無いので、そのまま遊べる）
  const needLogin = !import.meta.env.DEV && !user;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const go = (to: NavTarget) => {
    setOpen(false);
    if (to !== current) onGo(to);
  };
  return (
    <>
      <button className="nav-btn" aria-label="メニュー" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span />
        <span />
        <span />
      </button>
      {open && (
        <div className="nav-layer" onClick={() => setOpen(false)}>
          <nav className="nav-panel" aria-label="メニュー" onClick={(e) => e.stopPropagation()}>
            <div className="nav-head">
              <span className="bar-title">MENU</span>
              <button className="nav-close" aria-label="とじる" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <button className={`nav-item${current === 'title' ? ' on' : ''}`} onClick={() => go('title')}>
              タイトル
            </button>
            {GROUPS.map((g) => {
              const items = g.items.filter((it) => !needLogin || !it.login);
              if (!items.length) return null;
              return (
                <div className="nav-group" key={g.label}>
                  <div className="nav-label">{g.label}</div>
                  {items.map((it) => (
                    <button
                      key={it.to}
                      className={`nav-item${current === it.to ? ' on' : ''}`}
                      onClick={() => go(it.to)}
                    >
                      {it.label}
                    </button>
                  ))}
                </div>
              );
            })}
            {needLogin && <div className="nav-note">Google でログインすると、ほかの画面も使えます（タイトルから）。</div>}
          </nav>
        </div>
      )}
    </>
  );
}
