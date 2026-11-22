import type { CSSProperties } from 'react';
import type { Character } from '../game/types';
import { ELEMENT_INFO, SKILL_TABLE, TRAIT_TABLE, ULT_TABLE, WEAPON_LABEL } from '../game/data';
import { STAT_RANGE } from '../game/stats';

function StatBar({ label, value, range }: { label: string; value: number; range: { min: number; max: number } }) {
  const pct = Math.max(6, Math.min(100, ((value - range.min * 0.6) / (range.max - range.min * 0.6)) * 100));
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-bar">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

export function CharacterCard({ c, compact }: { c: Character; compact?: boolean }) {
  const s = c.spec;
  const el = ELEMENT_INFO[s.element];
  const sk = SKILL_TABLE[c.skill.kind];
  const tr = TRAIT_TABLE[s.trait];
  const style = { '--el': el.color, '--eye': s.colors.eye } as CSSProperties;
  return (
    <div className={`card${compact ? ' compact' : ''}`} style={style}>
      <div className="card-head">
        {c.thumb && <img className="card-thumb" src={c.thumb} alt="" />}
        <div className="card-names">
          <div className="card-motif">SCAN ▸ {s.motif}</div>
          <h2 className="card-name">{s.name}</h2>
          <div className="card-title">{s.title}</div>
        </div>
        <div className={`rank rank-${c.rank}`}>{c.rank}</div>
      </div>
      {s.description && !compact && <p className="card-desc">{s.description}</p>}
      <div className="chips">
        <span className="chip el">
          {el.label} <b>{el.en}</b>
        </span>
        <span className="chip">特性：{tr.label}</span>
        <span className="chip">武器：{WEAPON_LABEL[s.parts.weapon]}</span>
      </div>
      <div className="stats">
        <StatBar label="HP" value={c.stats.hp} range={STAT_RANGE.hp} />
        <StatBar label="SP" value={c.stats.sp} range={STAT_RANGE.sp} />
        <StatBar label="ATK" value={c.stats.atk} range={STAT_RANGE.atk} />
        <StatBar label="DEF" value={c.stats.def} range={STAT_RANGE.def} />
      </div>
      {!compact && (
        <div className="abilities">
          <div className="ability">
            <div className="ab-tag">SKILL</div>
            <div className="ab-name">{c.skill.name}</div>
            <div className="ab-meta">
              {sk.label} ・ SP {c.skill.spCost} ・ 使ったあと{c.skill.cooldown - 1}ターン休み
            </div>
            <div className="ab-effect">{sk.effect}</div>
            {c.skill.description && <div className="ab-flavor">{c.skill.description}</div>}
          </div>
          <div className="ability ult">
            <div className="ab-tag">ULTIMATE</div>
            <div className="ab-name">{s.ultimate.name}</div>
            <div className="ab-meta">{ULT_TABLE[s.ultimate.style].label} ・ 必殺ゲージ MAX で発動</div>
            <div className="ab-effect">威力3.0倍{ULT_TABLE[s.ultimate.style].hits > 1 ? `（${ULT_TABLE[s.ultimate.style].hits}回に分けて）` : ''}。防御されても半分は通る</div>
            {s.ultimate.description && <div className="ab-flavor">{s.ultimate.description}</div>}
          </div>
          <div className="ability trait">
            <div className="ab-tag">TRAIT</div>
            <div className="ab-name">
              {tr.label} <small>{tr.en}</small>
            </div>
            <div className="ab-effect">{tr.effect}</div>
          </div>
        </div>
      )}
    </div>
  );
}
