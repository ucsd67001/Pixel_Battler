import { useEffect, useRef, useState } from 'react';
import type { Character } from '../game/types';
import { prepareImage } from '../lib/image';
import { AccessError, analyze, checkHealth, type Health } from '../lib/api';
import { login, logout, useUser } from '../lib/firebase';
import { localSpec } from '../game/fallback';
import { buildCharacter } from '../game/stats';
import { garageFullMsg } from '../game/storage';
import { GarageFullError, useGarage } from '../game/garage';
import { CharacterCard } from './CharacterCard';
import { Showcase } from './StageView';
import { sfx } from '../lib/sfx';
import { useItemBox } from '../game/itemBox';
import type { Item } from '../game/items';
import { ItemCard, ItemShowcase } from './ItemCard';

const SCAN_LINES = [
  '写真を読みこんでいます',
  'いちばん目立つものを探しています',
  'モチーフを決めています',
  'フレームを組み立てています',
  '技を考えています',
  'パワーを調整しています',
  '最終チェック中',
];

// アイテムを作るとき（2026-11-25。docs/ITEMS.md）
const ITEM_SCAN_LINES = [
  '写真を読みこんでいます',
  'いちばん目立つものを探しています',
  '武器か防具かを決めています',
  '形をけずり出しています',
  'かざりをつけています',
  'パワーを調整しています',
  '最終チェック中',
];

/** 何を作るか（写真から作る画面で、はじめに選ぶ） */
type Make = 'robot' | 'item';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Create({
  onFight,
  onBack,
  initialMake = 'robot',
}: {
  onFight: (c: Character) => void;
  onBack: () => void;
  initialMake?: Make;
}) {
  const [step, setStep] = useState<'pick' | 'scan' | 'reveal'>('pick');
  const [preview, setPreview] = useState('');
  const [char, setChar] = useState<Character | null>(null);
  const [make, setMake] = useState<Make>(initialMake);
  const [item, setItem] = useState<Item | null>(null);
  const box = useItemBox();
  const lines = make === 'item' ? ITEM_SCAN_LINES : SCAN_LINES;
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [line, setLine] = useState(0);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const user = useUser();
  const garage = useGarage();
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    checkHealth().then(setHealth);
  }, []);
  const needLogin = !!health?.auth && user === null;
  // ログインできたら、前に失敗したときの赤い文を消す
  useEffect(() => {
    if (user) setError((e) => (e.startsWith('ログインできませんでした') ? '' : e));
  }, [user]);

  useEffect(() => {
    if (step !== 'scan') return;
    setLine(0);
    sfx('scan');
    const t = setInterval(() => {
      setLine((n) => Math.min(lines.length - 1, n + 1));
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
    const wait = async () => {
      const rest = 2800 - (performance.now() - started);
      if (rest > 0) await sleep(rest);
    };
    // ── アイテムを作る ──
    if (make === 'item') {
      try {
        const r = await box.make(img, needLogin || !!health?.auth);
        await wait();
        setItem(r.item);
        setNote(r.again ? 'この写真からは、前にも同じアイテムが生まれています。' : r.note);
        setStep('reveal');
      } catch (e) {
        if (!(e instanceof AccessError)) console.warn('make item failed', e);
        setError(e instanceof AccessError ? e.message : `アイテムを作れませんでした（${(e as Error).message}）`);
        setStep('pick');
      }
      return;
    }
    let ch = garage.find(img.hash);
    let n = '';
    if (ch) {
      n = 'この写真からは、前にも同じロボが生まれています。';
    } else if (garage.full) {
      setError(garageFullMsg(garage.limit));
      setStep('pick');
      return;
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
      try {
        ch = await garage.add(ch);
      } catch (e) {
        if (e instanceof GarageFullError) {
          setError(e.message);
          setStep('pick');
          return;
        }
        throw e;
      }
    }
    await wait();
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
          <span className="bar-title">{make === 'item' ? 'NEW ITEM' : 'NEW ROBOT'}</span>
          {user && (
            <button className="btn ghost small bar-right" onClick={() => logout()}>
              {user.displayName ?? user.email} ・ ログアウト
            </button>
          )}
        </header>
        <div className="make-pick" role="tablist" aria-label="何を作るか">
          {(
            [
              ['robot', 'ロボ', 'ROBOT'],
              ['item', 'アイテム', 'ITEM'],
            ] as const
          ).map(([k, label, en]) => (
            <button
              key={k}
              role="tab"
              aria-selected={make === k}
              className={`make-tab${make === k ? ' on' : ''}`}
              onClick={() => {
                setMake(k);
                setError('');
              }}
            >
              <b>{label}</b>
              <small>{en}</small>
            </button>
          ))}
        </div>
        {needLogin ? (
          <div className="dropzone login-panel">
            <div className="dz-main">Google でログイン</div>
            <div className="dz-sub">写真から作るには、Google でログインしてください（一日に作れる回数には、上限があります）。</div>
            <button
              className="btn primary big"
              onClick={() => {
                setError('');
                login().catch((e) => {
                  const code = String((e as { code?: string }).code ?? '');
                  // 自分でログインの窓を閉じたときは、失敗として出さない
                  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
                  setError(`ログインできませんでした（${(e as Error).message}）`);
                });
              }}
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
          <div className="dz-hint">
            {make === 'item'
              ? '写真の中でいちばん目立つものから、武器か防具が一つ生まれます（けん・おの・やり・じゅう・つえ・たて・かぶと・よろい）。同じ写真からは、いつも同じアイテム。'
              : '写真の中でいちばん目立つものから、ロボが生まれます。同じ写真からは、いつも同じロボ。'}
          </div>
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
        {make === 'robot' && garage.full && !error && <div className="note">{garageFullMsg(garage.limit)}</div>}
        {make === 'item' && box.full && !error && <div className="note">アイテムの置き場が いっぱいです（{box.limit}個まで）。</div>}
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
            {lines.slice(0, line + 1).map((t, i) => (
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

  if (make === 'item' && item) {
    return (
      <div className="screen reveal-screen">
        <header className="bar">
          <button className="btn ghost small" onClick={onBack}>
            ◀ タイトル
          </button>
          <span className="bar-title">ITEM COMPLETE</span>
        </header>
        <div className="split">
          <div className="split-stage">
            <ItemShowcase item={item} reveal />
          </div>
          <div className="split-info">
            {note && <div className="note">{note}</div>}
            <ItemCard item={item} />
            <div className="note">アイテムは、アイテムの置き場に入りました。ロボに持たせるのは、ガレージでできます（持たせると、どのバトルでも持ち味が効きます）。</div>
            <div className="actions">
              <button
                className="btn primary"
                onClick={() => {
                  setStep('pick');
                  setItem(null);
                  setNote('');
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

  return (
    <div className="screen reveal-screen">
      <header className="bar">
        <button className="btn ghost small" onClick={onBack}>
          ◀ タイトル
        </button>
        <span className="bar-title">ROBOT COMPLETE</span>
      </header>
      <div className="split">
        <div className="split-stage">
          <Showcase spec={char!.spec} reveal className="stage" />
        </div>
        <div className="split-info">
          {note && <div className="note">{note}</div>}
          <CharacterCard c={char!} />
          <div className="actions">
            <button className="btn primary big" onClick={() => onFight(box.arm(char!))}>
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
