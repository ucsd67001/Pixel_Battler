import type { CSSProperties } from 'react';
import type { Character } from '../game/types';
import { ELEMENT_INFO, FORM_INFO, SKILL_TABLE, TRAIT_TABLE, ULT_TABLE } from '../game/data';
import { STAT_RANGE } from '../game/stats';
import { elementTip, GLOSSARY, traitTip, type Tip } from '../game/glossary';
import { atLevel, expOf, growthOf, levelMult } from '../game/level';
import { Term } from './Term';

// plus：レベルで増えた分（ストーリーのバトルだけで効く）。バーの先に うすい色でつなげ、右に「+49」と出す
function StatBar({
  label,
  tip,
  value,
  range,
  plus,
}: {
  label: string;
  tip: Tip;
  value: number;
  range: { min: number; max: number };
  plus?: number;
}) {
  const pctOf = (v: number) => Math.max(6, Math.min(100, ((v - range.min * 0.6) / (range.max - range.min * 0.6)) * 100));
  const pct = pctOf(value);
  const more = plus ? pctOf(value + plus) - pct : 0;
  return (
    <div className="stat">
      <span className="stat-label">
        <Term tip={tip} mark={false}>{label}</Term>
      </span>
      <span className="stat-bar">
        <span style={{ width: `${pct}%` }} />
        {more > 0 && <span className="stat-more" style={{ width: `${more}%` }} />}
      </span>
      <span className="stat-value">{value}</span>
      {plus !== undefined && <span className="stat-plus">{plus > 0 ? `+${plus}` : ''}</span>}
    </div>
  );
}

export function CharacterCard({ c, compact }: { c: Character; compact?: boolean }) {
  const s = c.spec;
  const el = ELEMENT_INFO[s.element];
  const sk = SKILL_TABLE[c.skill.kind];
  const tr = TRAIT_TABLE[s.trait];
  const style = { '--el': el.color, '--eye': s.colors.eye } as CSSProperties;
  // レベルは、ガレージのロボ（写真から作ったロボ）だけに出す。コンピュータの敵・だれかのロボには出さない
  const mine = c.source === 'ai' || c.source === 'local';
  const g = growthOf(expOf(c));
  // ストーリーのバトルで、レベルの分だけ増える数字（2026-11-26。「レベルが上がったのに数字が同じ」と言われたため）。
  // カードの数字は、対戦で使う Lv1 の数字のまま。バトルの中の姿（fightLevel のあるロボ）は、もう増えているので出さない
  const grown = mine && g.level > 1 && !c.fightLevel ? atLevel(c, g.level).stats : null;
  const plus = (k: keyof Character['stats']) => (grown ? grown[k] - c.stats[k] : undefined);
  return (
    <div className={`card${compact ? ' compact' : ''}`} style={style}>
      <div className="card-head">
        {c.thumb && <img className="card-thumb" src={c.thumb} alt="" />}
        <div className="card-names">
          <div className="card-motif">
            <Term tip={GLOSSARY.scan} mark={false}>SCAN</Term> ▸ {s.motif}
          </div>
          <h2 className="card-name">{s.name}</h2>
          <div className="card-title">{s.title}</div>
        </div>
        <Term tip={GLOSSARY.rank} mark={false} className="rank-term">
          <div className={`rank rank-${c.rank}`}>{c.rank}</div>
        </Term>
      </div>
      {s.description && !compact && <p className="card-desc">{s.description}</p>}
      <div className="chips">
        <Term tip={elementTip(s.element)} className="chip el">
          {el.label} <b>{el.en}</b>
        </Term>
        <Term tip={GLOSSARY.form} className="chip">
          体：{FORM_INFO[s.form ?? 'humanoid'].label}
        </Term>
        {/* 特性は、下の TRAIT の欄にくわしく出すので、小さいカードのときだけ札に出す */}
        {compact && (
          <Term tip={traitTip(s.trait)} className="chip">
            特性：{tr.label}
          </Term>
        )}
        {/* 武器の札は出さない（いまは、どのロボも素手。2026-11-23） */}
      </div>
      {mine && (
        <div className="growth">
          <Term tip={GLOSSARY.level} mark={false} className="growth-lv">
            Lv<b>{g.level}</b>
          </Term>
          <span className="growth-bar">
            <span style={{ width: `${g.need ? (g.into / g.need) * 100 : 100}%` }} />
          </span>
          <span className="growth-next">{g.need ? `経験値 あと${g.left}で Lv${g.level + 1}` : 'いちばん上のレベル'}</span>
        </div>
      )}
      <div className={`stats${grown ? ' grown' : ''}`}>
        <StatBar label="HP" tip={GLOSSARY.hp} value={c.stats.hp} range={STAT_RANGE.hp} plus={plus('hp')} />
        <StatBar label="SP" tip={GLOSSARY.sp} value={c.stats.sp} range={STAT_RANGE.sp} plus={plus('sp')} />
        <StatBar label="こうげき" tip={GLOSSARY.atk} value={c.stats.atk} range={STAT_RANGE.atk} plus={plus('atk')} />
        <StatBar label="ぼうぎょ" tip={GLOSSARY.def} value={c.stats.def} range={STAT_RANGE.def} plus={plus('def')} />
      </div>
      {grown && (
        <div className="stats-note">
          <b>+</b> は、ストーリーのバトルで Lv{g.level} の分 強くなる数字（Lv1 より {Math.round((levelMult(g.level) - 1) * 100)}%
          アップ）。コンピュータと対戦・ふたりで対戦は、左の数字で戦う
        </div>
      )}
      {!compact && (
        <div className="abilities">
          <div className="ability">
            <div className="ab-tag">
              <Term tip={GLOSSARY.skill}>SKILL</Term>
            </div>
            <div className="ab-name">{c.skill.name}</div>
            <div className="ab-meta">
              {sk.label} ・ SP {c.skill.spCost} ・ 使ったあと{c.skill.cooldown - 1}ターン休み
            </div>
            <div className="ab-effect">{sk.effect}</div>
            {c.skill.description && <div className="ab-flavor">{c.skill.description}</div>}
          </div>
          <div className="ability ult">
            <div className="ab-tag">
              <Term tip={GLOSSARY.ult}>ULTIMATE</Term>
            </div>
            <div className="ab-name">{s.ultimate.name}</div>
            <div className="ab-meta">{ULT_TABLE[s.ultimate.style].label} ・ 必殺ゲージ MAX で発動</div>
            <div className="ab-effect">3倍のパワー{ULT_TABLE[s.ultimate.style].hits > 1 ? `（${ULT_TABLE[s.ultimate.style].hits}回に分けて）` : ''}。ガードされても半分は当たる</div>
            {s.ultimate.description && <div className="ab-flavor">{s.ultimate.description}</div>}
          </div>
          <div className="ability trait">
            <div className="ab-tag">
              <Term tip={GLOSSARY.trait}>TRAIT</Term>
            </div>
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
