import { useState } from 'react';
import type { Character } from '../game/types';
import type { Garage } from '../game/garage';
import type { ItemBox } from '../game/itemBox';
import { ITEM_TABLE, itemEffectText } from '../game/items';
import { GLOSSARY } from '../game/glossary';
import { Term } from './Term';

// ガレージ・ロボを選ぶ画面で、そのロボに持たせているアイテムを見せて、持たせる・かえる・外す（2026-11-26。docs/ITEMS.md の段階4）。
// 一つのアイテムを、何体のロボにでも持たせられる（持ち物は自分のもので、どのロボにも貸せる）
export function ItemSlot({ c, garage, box }: { c: Character; garage: Garage; box: ItemBox }) {
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const held = c.itemSeed ? box.find(c.itemSeed) : undefined;

  const equip = async (seed: string | null) => {
    setBusy(true);
    setErr('');
    try {
      await garage.equip(c, seed);
      setChoosing(false);
    } catch {
      setErr('持たせられませんでした。電波のよいところで、もう一度ためしてください。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="item-slot">
      <div className="ab-tag">
        <Term tip={GLOSSARY.itemPerk}>ITEM</Term>
      </div>
      {held ? (
        <div className="item-slot-row">
          {held.thumb ? <img src={held.thumb} alt="" /> : <span className="noimg" />}
          <div className="item-slot-text">
            <b>{held.spec.name}</b>
            <small>
              {ITEM_TABLE[held.spec.kind].label}・ランク{held.rank}
            </small>
            <small className="item-slot-effect">{itemEffectText(held)}</small>
          </div>
        </div>
      ) : (
        <div className="item-slot-none">アイテムを持っていません。</div>
      )}
      {!choosing && (
        <div className="item-slot-actions">
          <button className="btn small" disabled={busy || !box.list.length} onClick={() => setChoosing(true)}>
            {held ? 'かえる' : 'アイテムを持たせる'}
          </button>
          {held && (
            <button className="btn ghost small" disabled={busy} onClick={() => equip(null)}>
              外す
            </button>
          )}
        </div>
      )}
      {!box.list.length && !held && (
        <div className="item-slot-hint">アイテムの置き場に、まだアイテムがありません。「写真から作る」で「アイテム」を選ぶと作れます。</div>
      )}
      {choosing && (
        <div className="item-choose">
          <div className="item-choose-head">持たせるアイテムを えらんでください（一つだけ）</div>
          <div className="item-choose-list">
            {box.list.map((x) => (
              <button
                key={x.seed}
                className={`item-choose-btn${x.seed === held?.seed ? ' on' : ''}`}
                disabled={busy}
                onClick={() => equip(x.seed)}
              >
                {x.thumb ? <img src={x.thumb} alt="" /> : <span className="noimg" />}
                <span>
                  {x.spec.name}
                  <small>
                    {ITEM_TABLE[x.spec.kind].label}・{x.rank}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <button className="btn ghost small" disabled={busy} onClick={() => setChoosing(false)}>
            やめる
          </button>
        </div>
      )}
      {err && <div className="error">{err}</div>}
    </div>
  );
}
