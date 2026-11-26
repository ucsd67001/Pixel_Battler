import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Character, Element, Rank } from '../game/types';
import { ELEMENTS } from '../game/types';
import { ELEMENT_INFO } from '../game/data';
import { levelOf } from '../game/level';
import { readRecord, totalWins } from '../game/record';

// ロボを選ぶ列（ガレージ・コンピュータと対戦・ストーリー・ふたりで対戦）の、並べかえと属性のしぼりこみ（2026-11-26）。
// 選んだ並べかえとしぼりこみは、このスマホに覚えておく（どの画面でも同じ）

export type RosterSort = 'new' | 'level' | 'rank' | 'wins';
export type RosterFilter = Element | 'all';

const SORTS: { key: RosterSort; label: string }[] = [
  { key: 'new', label: '新しい順' },
  { key: 'level', label: 'レベル順' },
  { key: 'rank', label: 'ランク順' },
  { key: 'wins', label: '勝った数順' },
];

const RANK_ORDER: Record<Rank, number> = { S: 0, A: 1, B: 2, C: 3 };
const winsOf = (c: Character) => totalWins(readRecord(c.record));
const byNew = (a: Character, b: Character) => b.createdAt - a.createdAt;

// 同じ値のときは、新しいロボを先に
const COMPARE: Record<RosterSort, (a: Character, b: Character) => number> = {
  new: byNew,
  level: (a, b) => levelOf(b) - levelOf(a) || byNew(a, b),
  rank: (a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank] || levelOf(b) - levelOf(a) || byNew(a, b),
  wins: (a, b) => winsOf(b) - winsOf(a) || levelOf(b) - levelOf(a) || byNew(a, b),
};

const KEY = 'pb.roster.v1';

function load(): { sort: RosterSort; filter: RosterFilter } {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return {
      sort: SORTS.some((s) => s.key === x?.sort) ? x.sort : 'new',
      filter: (ELEMENTS as readonly string[]).includes(x?.filter) ? x.filter : 'all',
    };
  } catch {
    return { sort: 'new', filter: 'all' };
  }
}

/** 並べかえとしぼりこみをしたロボの列。filter は、その属性のロボがいなければ「全部」と同じにする */
export function useRosterView(list: Character[]) {
  const [view, setView] = useState(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(view));
    } catch {
      // 覚えられなくても、並べかえはできる
    }
  }, [view]);
  const counts = useMemo(() => {
    const n = Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>;
    for (const c of list) n[c.spec.element]++;
    return n;
  }, [list]);
  const filter: RosterFilter = view.filter !== 'all' && counts[view.filter] > 0 ? view.filter : 'all';
  const shown = useMemo(
    () => list.filter((c) => filter === 'all' || c.spec.element === filter).sort(COMPARE[view.sort]),
    [list, filter, view.sort],
  );
  return {
    shown,
    sort: view.sort,
    filter,
    counts,
    setSort: (sort: RosterSort) => setView((v) => ({ ...v, sort })),
    setFilter: (f: RosterFilter) => setView((v) => ({ ...v, filter: f })),
  };
}

export type RosterView = ReturnType<typeof useRosterView>;

/** ロボの列の上の帯：ならび（えらぶ）と、属性のボタン */
export function RosterTools({ view, total }: { view: RosterView; total: number }) {
  return (
    <div className="roster-tools">
      <label className="roster-sort">
        <span>ならび</span>
        <select value={view.sort} onChange={(e) => view.setSort(e.target.value as RosterSort)}>
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <div className="roster-els">
        <button className={`roster-el all${view.filter === 'all' ? ' on' : ''}`} onClick={() => view.setFilter('all')}>
          全部
        </button>
        {ELEMENTS.map((e) => (
          <button
            key={e}
            className={`roster-el${view.filter === e ? ' on' : ''}`}
            style={{ '--el': ELEMENT_INFO[e].color } as CSSProperties}
            disabled={view.counts[e] === 0}
            title={`${ELEMENT_INFO[e].label}のロボ ${view.counts[e]}体`}
            onClick={() => view.setFilter(view.filter === e ? 'all' : e)}
          >
            {ELEMENT_INFO[e].label}
          </button>
        ))}
      </div>
      {view.filter !== 'all' && (
        <span className="roster-shown">
          {view.shown.length} / {total}体
        </span>
      )}
    </div>
  );
}
