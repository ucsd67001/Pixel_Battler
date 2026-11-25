import { useState, type CSSProperties } from 'react';
import type { CharacterSpec, Form } from '../game/types';
import { CPU_CHARACTERS } from '../game/cpu';
import { FORM_INFO } from '../game/data';
import { Showcase } from './StageView';
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

// 試着ロボ（アイテムを大きく見せるときに、着せたり持たせたりするロボ。2026-11-26）。
// アイテムの色が見やすいように、暗い灰色で、かざりの少ない体にする
const MANNEQUIN_BASE: CharacterSpec = {
  ...CPU_CHARACTERS[0].spec,
  name: 'ためしロボ',
  element: 'tide',
  parts: { head: 'vfin', body: 'standard', arms: 'standard', legs: 'standard', back: 'none', weapon: 'none' },
  colors: { primary: '#363b4a', secondary: '#1c202b', accent: '#5c6478', eye: '#9fe8ff' },
};
const MANNEQUIN: Record<Form, CharacterSpec> = {
  humanoid: { ...MANNEQUIN_BASE, form: 'humanoid' },
  beast: { ...MANNEQUIN_BASE, form: 'beast' },
  floater: { ...MANNEQUIN_BASE, form: 'floater' },
};
const FORMS: Form[] = ['humanoid', 'beast', 'floater'];

/**
 * 作ったアイテムを、大きく見せる。試着ロボに持たせて（防具は着せて）、3D で回す。
 * 前は写真を丸いわくで見せていたが、写真そのままでロボの持ち物に見えない、と持ち主に言われた（2026-11-26）。
 * 写真は、カード（ItemCard）の小さなわくにだけ出す。体の形（人型・けもの型・空中型）を切りかえて、持ち方を見られる
 */
export function ItemShowcase({ item, reveal }: { item: Item; reveal?: boolean }) {
  const s = item.spec;
  const t = ITEM_TABLE[s.kind];
  const [form, setForm] = useState<Form>('humanoid');
  const style = { '--ic': s.colors.accent } as CSSProperties;
  return (
    <div className="item-stage" style={style}>
      <Showcase spec={MANNEQUIN[form]} item={s} reveal={reveal} className="stage" />
      <div className="item-forms" role="group" aria-label="試着ロボの体の形">
        {FORMS.map((f) => (
          <button key={f} className={`item-form-btn${form === f ? ' on' : ''}`} onClick={() => setForm(f)}>
            {FORM_INFO[f].label}
          </button>
        ))}
      </div>
      <div className="item-kind">
        <b>{t.en}</b>
        <span>{t.label}</span>
      </div>
    </div>
  );
}
