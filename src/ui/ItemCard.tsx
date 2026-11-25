import type { CSSProperties } from 'react';
import { ITEM_TABLE, itemEffectText, type Item } from '../game/items';
import { GLOSSARY } from '../game/glossary';
import { Term } from './Term';

/** アイテム（武器か防具）のカード。名前・種類・ランク・説明・持ち味 */
export function ItemCard({ item }: { item: Item }) {
  const s = item.spec;
  const t = ITEM_TABLE[s.kind];
  const style = { '--el': s.colors.accent } as CSSProperties;
  return (
    <div className="card item-card" style={style}>
      <div className="card-head">
        {item.thumb && <img className="card-thumb" src={item.thumb} alt="" />}
        <div className="card-names">
          <div className="card-motif">
            <Term tip={GLOSSARY.scan} mark={false}>SCAN</Term> ▸ {s.motif}
          </div>
          <h2 className="card-name">{s.name}</h2>
          <div className="card-title">
            {t.group === 'weapon' ? '武器' : '防具'}・{t.label}
          </div>
        </div>
        <Term tip={GLOSSARY.itemRank} mark={false} className="rank-term">
          <div className={`rank rank-${item.rank}`}>{item.rank}</div>
        </Term>
      </div>
      {s.description && <p className="card-desc">{s.description}</p>}
      <div className="chips">
        <span className="chip el">
          {t.label} <b>{t.en}</b>
        </span>
        <span className="chip">{t.group === 'weapon' ? 'WEAPON' : 'ARMOR'}</span>
      </div>
      <div className="abilities">
        <div className="ability">
          <div className="ab-tag">
            <Term tip={GLOSSARY.itemPerk}>PERK</Term>
          </div>
          <div className="ab-name">持ち味</div>
          <div className="ab-effect">{t.effect}</div>
          <div className="ab-meta">{itemEffectText(item)}</div>
        </div>
      </div>
    </div>
  );
}

/** 作ったアイテムを、大きく見せる（3D で持たせるのは段階4。いまは写真と色で） */
export function ItemShowcase({ item, photo }: { item: Item; photo?: string }) {
  const s = item.spec;
  const t = ITEM_TABLE[s.kind];
  const style = {
    '--ia': s.colors.primary,
    '--ib': s.colors.secondary,
    '--ic': s.colors.accent,
  } as CSSProperties;
  return (
    <div className="item-stage" style={style}>
      <div className="item-orb">
        {(photo || item.thumb) && <img src={photo || item.thumb} alt="" />}
      </div>
      <div className="item-kind">
        <b>{t.en}</b>
        <span>{t.label}</span>
      </div>
    </div>
  );
}
