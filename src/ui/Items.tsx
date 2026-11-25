import { useEffect, useState, type CSSProperties } from 'react';
import { useItemBox } from '../game/itemBox';
import { ITEM_TABLE, type Item, type ItemGroup } from '../game/items';
import { ItemCard, ItemShowcase } from './ItemCard';

type Filter = 'all' | ItemGroup;
const FILTERS: [Filter, string][] = [
  ['all', 'すべて'],
  ['weapon', '武器'],
  ['armor', '防具'],
];

// アイテムの置き場（2026-11-25。docs/ITEMS.md の段階3）。一覧・大きく見る・消す。
// ロボに持たせるのは段階4（ガレージやロボを選ぶ画面から）
export function Items({ onBack, onCreate }: { onBack: () => void; onCreate: () => void }) {
  const box = useItemBox();
  const [filter, setFilter] = useState<Filter>('all');
  const list = box.list.filter((x) => filter === 'all' || ITEM_TABLE[x.spec.kind].group === filter);
  const [selSeed, setSelSeed] = useState<string | null>(null);
  const sel = list.find((x) => x.seed === selSeed) ?? list[0] ?? null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (selSeed && !box.list.some((x) => x.seed === selSeed)) setSelSeed(null);
  }, [box.list, selSeed]);

  const remove = async (it: Item) => {
    if (!window.confirm(`${it.spec.name} をアイテムの置き場から消しますか？（もとにもどせません）`)) return;
    setBusy(true);
    setErr('');
    try {
      await box.remove(it);
      setSelSeed(null);
    } catch {
      setErr('消せませんでした。電波のよいところで、もう一度ためしてください。');
    } finally {
      setBusy(false);
    }
  };

  const count = (g: Filter) => (g === 'all' ? box.list.length : box.list.filter((x) => ITEM_TABLE[x.spec.kind].group === g).length);

  return (
    <div className="screen hangar-screen items-screen">
      <header className="bar">
        <button className="btn ghost small" onClick={onBack}>
          ◀ タイトル
        </button>
        <span className="bar-title">ITEMS</span>
        <span className="bar-right garage-count">
          {box.list.length} / {box.limit}個
        </span>
      </header>
      <div className="garage-note">
        写真から作った 武器と防具が、ここに しまってあります。
        {box.cloud ? 'ログインしているので、ほかのスマホでも同じです。' : ''}
        ロボに持たせるのは、ガレージで（一つのアイテムを、何体にでも持たせられます）。持たせると、どのバトルでも持ち味が効きます。
      </div>
      {err && <div className="error">{err}</div>}
      {!box.ready ? (
        <div className="empty">アイテムの置き場を 読みこんでいます…</div>
      ) : box.list.length === 0 ? (
        <div className="empty items-empty">
          <p>まだアイテムがありません。</p>
          <p>「写真から作る」で「アイテム」を選ぶと、写真から武器か防具が生まれます。</p>
          <button className="btn primary" onClick={onCreate}>
            アイテムを作る
          </button>
        </div>
      ) : (
        <div className="split">
          <div className="split-stage">
            {sel && <ItemShowcase item={sel} />}
            <div className="roster">
              <div className="item-filter" role="tablist" aria-label="しぼりこみ">
                {FILTERS.map(([k, label]) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={filter === k}
                    className={`item-filter-btn${filter === k ? ' on' : ''}`}
                    onClick={() => {
                      setFilter(k);
                      setSelSeed(null);
                    }}
                  >
                    {label}
                    <small>{count(k)}</small>
                  </button>
                ))}
              </div>
              {list.map((x) => (
                <button
                  key={x.seed}
                  className={`roster-item${sel?.seed === x.seed ? ' on' : ''}`}
                  style={{ '--el': x.spec.colors.accent } as CSSProperties}
                  onClick={() => setSelSeed(x.seed)}
                >
                  {x.thumb ? <img src={x.thumb} alt="" /> : <span className="noimg" />}
                  <span className="roster-name">
                    {x.spec.name}
                    <small>{ITEM_TABLE[x.spec.kind].label}</small>
                  </span>
                  <span className={`rank mini rank-${x.rank}`}>{x.rank}</span>
                </button>
              ))}
              {!list.length && <span className="item-none">この中には、まだありません</span>}
            </div>
          </div>
          {sel && (
            <div className="split-info">
              <ItemCard item={sel} />
              <div className="actions">
                <button className="btn primary" onClick={onCreate} disabled={box.full}>
                  {box.full ? `いっぱいです（${box.limit}個まで）` : '写真からアイテムを作る'}
                </button>
                <button className="btn ghost danger" disabled={busy} onClick={() => remove(sel)}>
                  置き場から消す
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
