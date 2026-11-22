import { useEffect, useRef, useState } from 'react';
import type { Character } from '../game/types';
import { prepareImage } from '../lib/image';
import { AccessError, analyze, checkHealth, type Health } from '../lib/api';
import { login, logout, useUser } from '../lib/firebase';
import { localSpec } from '../game/fallback';
import { buildCharacter } from '../game/stats';
import { findBySeed, saveCharacter } from '../game/storage';
import { CharacterCard } from './CharacterCard';
import { Showcase } from './StageView';
import { sfx } from '../lib/sfx';

const SCAN_LINES = [
  '写真を読みこんでいます',
  'いちばん目立つものを探しています',
  'モチーフを決めています',
  'フレームを組み立てています',
  '武器を選んでいます',
  'パワーを調整しています',
  '最終チェック中',
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Create({ onFight, onBack }: { onFight: (c: Character) => void; onBack: () => void }) {
  const [step, setStep] = useState<'pick' | 'scan' | 'reveal'>('pick');
  const [preview, setPreview] = useState('');
  const [char, setChar] = useState<Character | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [line, setLine] = useState(0);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const user = useUser();
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    checkHealth().then(setHealth);
  }, []);
  const needLogin = !!health?.auth && user === null;

  useEffect(() => {
    if (step !== 'scan') return;
    setLine(0);
    sfx('scan');
    const t = setInterval(() => {
      setLine((n) => Math.min(SCAN_LINES.length - 1, n + 1));
      sfx('scan');
    }, 1100);
    return () => clearInterval(t);
  }, [step]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    let img;
    try {
      img = await prepareImage(file);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setPreview(img.dataUrl);
    setStep('scan');
    const started = performance.now();
    let ch = findBySeed(img.hash);
    let n = '';
    if (ch) {
      n = 'この写真からは、前にも同じロボが生まれています。';
    } else {
      try {
        const r = await analyze(img.dataUrl, img.hash);
        ch = buildCharacter(r.spec, img.hash, 'ai', img.thumb);
      } catch (e) {
        if (e instanceof AccessError) {
          setError(e.message);
          setStep('pick');
          return;
        }
        console.warn('analyze failed', e);
        ch = buildCharacter(localSpec(img.hash, img.colors), img.hash, 'local', img.thumb);
        n = 'AIにつながらなかったため、写真の色から組み立てました。';
      }
      saveCharacter(ch);
    }
    const rest = 2800 - (performance.now() - started);
    if (rest > 0) await sleep(rest);
    setChar(ch);
    setNote(n);
    setStep('reveal');
  };

  if (step === 'pick') {
    return (
      <div className="screen create-screen">
        <header className="bar">
          <button className="btn ghost small" onClick={onBack}>
            ◀ もどる
          </button>
          <span className="bar-title">NEW GEAR</span>
          {user && (
            <button className="btn ghost small bar-right" onClick={() => logout()}>
              {user.displayName ?? user.email} ・ ログアウト
            </button>
          )}
        </header>
        {needLogin ? (
          <div className="dropzone login-panel">
            <div className="dz-main">Google でログイン</div>
            <div className="dz-sub">写真から作れるのは、家族のアカウントだけです。</div>
            <button
              className="btn primary big"
              onClick={() => login().catch((e) => setError(`ログインできませんでした（${(e as Error).message}）`))}
            >
              Google でログインする
            </button>
          </div>
        ) : (
        <div
          className={`dropzone${drag ? ' drag' : ''}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            onFile(e.dataTransfer.files?.[0]);
          }}
        >
          <div className="dz-icon">
            <span />
          </div>
          <div className="dz-main">写真を選ぶ</div>
          <div className="dz-sub">ここに画像を落とすか、タップして選んでください</div>
          <div className="dz-hint">写真の中でいちばん目立つものから、ロボが生まれます。同じ写真からは、いつも同じロボ。</div>
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        )}
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  if (step === 'scan') {
    return (
      <div className="screen create-screen">
        <header className="bar">
          <span className="bar-title">SCANNING</span>
        </header>
        <div className="scan">
          <div className="scan-frame">
            <img src={preview} alt="" />
            <div className="scan-grid" />
            <div className="scan-line" />
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
          </div>
          <div className="scan-log">
            {SCAN_LINES.slice(0, line + 1).map((t, i) => (
              <div key={t} className={i === line ? 'now' : 'done'}>
                {i === line ? '▸ ' : '✓ '}
                {t}
                {i === line && <span className="dots" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen reveal-screen">
      <header className="bar">
        <button className="btn ghost small" onClick={onBack}>
          ◀ タイトル
        </button>
        <span className="bar-title">GEAR COMPLETE</span>
      </header>
      <div className="split">
        <div className="split-stage">
          <Showcase spec={char!.spec} reveal className="stage" />
        </div>
        <div className="split-info">
          {note && <div className="note">{note}</div>}
          <CharacterCard c={char!} />
          <div className="actions">
            <button className="btn primary big" onClick={() => onFight(char!)}>
              バトルへ！
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setStep('pick');
                setChar(null);
              }}
            >
              別の写真で作る
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
