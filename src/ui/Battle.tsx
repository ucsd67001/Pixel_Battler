import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Character } from '../game/types';
import { chooseAction, pickCpu } from '../game/cpu';
import {
  act, canUse, createBattle, endTurn, foe, MAX_GAUGE, startTurn,
  type ActionResult, type ActionType, type BattleState, type Hit, type Side,
} from '../game/battle';
import { ELEMENT_INFO, SKILL_TABLE } from '../game/data';
import type { Stage } from '../three/stage';
import { StageView } from './StageView';
import { Term } from './Term';
import { elementTip, GLOSSARY } from '../game/glossary';
import { sfx } from '../lib/sfx';

interface SideHud {
  hp: number;
  sp: number;
  gauge: number;
  guarding: boolean;
  buffs: string[];
  cooldown: number;
  counter: boolean;
}
type PopKind = 'dmg' | 'crit' | 'heal' | 'info' | 'good' | 'bad';
interface Popup {
  id: number;
  x: number;
  y: number;
  text: string;
  kind: PopKind;
}
interface Banner {
  side: Side;
  title: string;
  sub: string;
  ult: boolean;
  color: string;
  thumb?: string;
}

function snap(st: BattleState, side: Side): SideHud {
  const f = st.f[side];
  return {
    hp: f.hp,
    sp: f.sp,
    gauge: f.gauge,
    guarding: f.guarding,
    buffs: f.buffs.map((b) => b.label),
    cooldown: f.cooldown,
    counter: f.counter,
  };
}

function Gauge({ value, max, kind }: { value: number; max: number; kind: 'hp' | 'sp' | 'od' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const low = kind === 'hp' && pct < 30;
  return (
    <div className={`gauge ${kind}${low ? ' low' : ''}${kind === 'od' && pct >= 100 ? ' full' : ''}`}>
      <div className="gauge-trail" style={{ width: `${pct}%` }} />
      <div className="gauge-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function SidePanel({ c, h, side }: { c: Character; h: SideHud; side: Side }) {
  const el = ELEMENT_INFO[c.spec.element];
  return (
    <div className={`hud-side s${side}`} style={{ '--el': el.color } as CSSProperties}>
      <div className="hud-name">
        <Term tip={elementTip(c.spec.element)} mark={false} className="hud-el">
          {el.label}
        </Term>
        <b>{c.spec.name}</b>
        <Term tip={GLOSSARY.rank} mark={false}>
          <span className={`rank mini rank-${c.rank}`}>{c.rank}</span>
        </Term>
      </div>
      <div className="hud-row">
        <Term tip={GLOSSARY.hp} mark={false} className="hud-tag">
          HP
        </Term>
        <Gauge value={h.hp} max={c.stats.hp} kind="hp" />
        <span className="hud-num">
          {h.hp}
          <small>/{c.stats.hp}</small>
        </span>
      </div>
      <div className="hud-row thin">
        <Term tip={GLOSSARY.sp} mark={false} className="hud-tag">
          SP
        </Term>
        <Gauge value={h.sp} max={c.stats.sp} kind="sp" />
        <span className="hud-num small">{h.sp}</span>
      </div>
      <div className="hud-row thin">
        <Term tip={GLOSSARY.gauge} mark={false} className="hud-tag">
          必殺
        </Term>
        <Gauge value={h.gauge} max={MAX_GAUGE} kind="od" />
        <span className="hud-num small">{h.gauge >= MAX_GAUGE ? 'MAX' : `${h.gauge}%`}</span>
      </div>
      <div className="hud-status">
        {h.guarding && (
          <Term tip={GLOSSARY.guard} mark={false} className="st good">
            ガード中
          </Term>
        )}
        {h.counter && (
          <Term tip={GLOSSARY.counter} mark={false} className="st good">
            カウンターの構え
          </Term>
        )}
        {h.buffs.map((b) => (
          <Term key={b} tip={GLOSSARY.buff} mark={false} className={`st ${b.includes('ダウン') ? 'bad' : 'good'}`}>
            {b}
          </Term>
        ))}
      </div>
    </div>
  );
}

export function Battle({
  player,
  onExit,
  onRematch,
}: {
  player: Character;
  onExit: () => void;
  onRematch: () => void;
}) {
  const [enemy] = useState(() => pickCpu());
  const [st] = useState(() => createBattle(player, enemy));
  if (import.meta.env.DEV) (window as any).__battle = st; // 試すときに中を触るため（開発中だけ）
  const chars: [Character, Character] = [player, enemy];
  const stage = useRef<Stage | null>(null);
  const [hud, setHud] = useState<[SideHud, SideHud]>(() => [snap(st, 0), snap(st, 1)]);
  const [phase, setPhase] = useState<'intro' | 'command' | 'busy' | 'over'>('intro');
  const [msg, setMsg] = useState('');
  const [banner, setBanner] = useState<Banner | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [splash, setSplash] = useState<string | null>(null);
  const [result, setResult] = useState<'win' | 'lose' | null>(null);
  const [speed, setSpeed] = useState(1);
  const [round, setRound] = useState(1);
  const [cinema, setCinema] = useState(false);
  const pick = useRef<((a: ActionType) => void) | null>(null);
  const alive = useRef(true);
  const pid = useRef(0);
  const speedRef = useRef(1);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    speedRef.current = speed;
    if (stage.current) stage.current.speed = speed;
  }, [speed]);

  const patch = (side: Side, p: Partial<SideHud>) =>
    setHud((h) => {
      const n = [...h] as [SideHud, SideHud];
      n[side] = { ...n[side], ...p };
      return n;
    });
  const syncAll = () => setHud([snap(st, 0), snap(st, 1)]);

  const popup = (side: Side, text: string, kind: PopKind, dy = 0) => {
    const s = stage.current;
    if (!s) return;
    const p = s.project(side, 2.4);
    const id = ++pid.current;
    setPopups((l) => [...l, { id, x: p.x + (Math.random() - 0.5) * 50, y: p.y - dy, text, kind }]);
    setTimeout(() => setPopups((l) => l.filter((x) => x.id !== id)), 1300);
  };

  const showBanner = (b: Banner) => {
    setBanner(b);
    setTimeout(() => setBanner((cur) => (cur === b ? null : cur)), (b.ult ? 2000 : 1150) / speedRef.current);
  };

  const applyHit = (h: Hit, big = false) => {
    patch(h.target, { hp: h.hpAfter });
    popup(h.target, String(h.amount), h.crit ? 'crit' : 'dmg');
    if (h.guts) popup(h.target, 'ど根性！ HP1でふみとどまった', 'good', 40);
    else if (h.crit) popup(h.target, 'CRITICAL!', 'info', 40);
    else if (h.guarded) popup(h.target, 'GUARD', 'info', 40);
    else if (h.eff > 1) popup(h.target, '効果ばつぐん！', 'good', 40);
    else if (h.eff < 1) popup(h.target, 'いまひとつ…', 'bad', 40);
    stage.current?.hit(h.target, { crit: h.crit, guarded: h.guarded, big });
  };

  const direct = async (res: ActionResult) => {
    const s = stage.current!;
    const a = res.actor;
    const d = foe(a);
    const A = chars[a];
    const color = ELEMENT_INFO[A.spec.element].color;
    patch(a, { sp: st.f[a].sp, ...(res.type === 'ultimate' ? { gauge: 0 } : {}) });
    const onHit = (i: number) => res.hits[i] && applyHit(res.hits[i], res.type === 'ultimate');

    switch (res.type) {
      case 'attack':
        setMsg(`${A.spec.name} の アタック！`);
        await s.attack(a, res.hits.length, onHit);
        break;
      case 'guard':
        setMsg(`${A.spec.name} は ガードしている`);
        popup(a, 'GUARD', 'info');
        await s.guard(a);
        break;
      case 'skill': {
        const kind = A.skill.kind;
        setMsg(`${A.spec.name} の ${A.skill.name}！`);
        showBanner({ side: a, title: A.skill.name, sub: `SKILL ・ ${SKILL_TABLE[kind].label}`, ult: false, color });
        await s.skillCast(a);
        if (res.hits.length) await s.attack(a, res.hits.length, onHit, kind === 'hex' ? 'hex' : 'skill');
        else if (kind === 'counter') await s.counterStance(a);
        break;
      }
      case 'ultimate': {
        const u = A.spec.ultimate;
        setMsg(`${A.spec.name} の 必殺技！`);
        setCinema(true);
        await s.ultimate(a, u.style, res.hits.length, onHit, () =>
          showBanner({ side: a, title: u.name, sub: u.shout, ult: true, color, thumb: A.thumb }),
        );
        setCinema(false);
        break;
      }
    }
    if (!alive.current) return;
    if (res.heal && res.heal.amount > 0) {
      patch(res.heal.target, { hp: res.heal.hpAfter });
      popup(res.heal.target, `+${res.heal.amount}`, 'heal');
      await s.healFx(res.heal.target);
    }
    for (const b of res.buffs) {
      popup(b.target, b.label, b.good ? 'good' : 'bad', 20);
      patch(b.target, snap(st, b.target));
      await s.buffFx(b.target, b.good);
    }
    if (res.counterHit && alive.current) {
      setMsg(`${chars[d].spec.name} の カウンター！`);
      popup(d, 'COUNTER!', 'info', 20);
      await s.counterStrike(d, () => applyHit(res.counterHit!));
    }
    syncAll();
    await s.wait(0.3);
  };

  const run = async () => {
    const s = stage.current!;
    await s.intro();
    if (!alive.current) return;
    setSplash('READY');
    sfx('ready');
    await s.wait(0.9);
    setSplash('FIGHT!');
    sfx('fight');
    await s.wait(0.75);
    setSplash(null);

    while (!st.over && alive.current) {
      setRound(Math.ceil(st.turn / 2));
      const pre = startTurn(st);
      s.setGuard(pre.side, false);
      patch(pre.side, snap(st, pre.side));
      if (pre.regen > 0) {
        popup(pre.side, `+${pre.regen}`, 'heal');
        await s.healFx(pre.side);
      }
      let action: ActionType;
      if (st.active === 0) {
        setPhase('command');
        setMsg('コマンドを選んでください');
        action = await new Promise<ActionType>((resolve) => (pick.current = resolve));
        pick.current = null;
      } else {
        setPhase('busy');
        setMsg(`${chars[1].spec.name} が 動く…`);
        await s.wait(0.55);
        action = chooseAction(st, 1, Math.random);
      }
      if (!alive.current) return;
      setPhase('busy');
      const res = act(st, action, Math.random);
      await direct(res);
      if (!alive.current || st.over) break;
      endTurn(st);
      syncAll();
    }
    if (!alive.current || st.winner === null) return;
    const loser = foe(st.winner);
    setMsg(`${chars[loser].spec.name} は たおれた`);
    await s.ko(loser);
    setSplash('K.O.');
    await s.wait(1.0);
    setSplash(null);
    await s.victory(st.winner);
    setMsg(st.winner === 0 ? `${player.spec.name} の勝利！` : `${chars[1].spec.name} の勝利…`);
    sfx(st.winner === 0 ? 'win' : 'lose');
    setResult(st.winner === 0 ? 'win' : 'lose');
    setPhase('over');
  };

  const choose = (type: ActionType) => {
    if (phase !== 'command' || !pick.current || !canUse(st, 0, type)) return;
    setPhase('busy');
    pick.current(type);
  };

  const me = hud[0];
  const skillReady = me.sp >= player.skill.spCost && me.cooldown === 0;
  const ultReady = me.gauge >= MAX_GAUGE;
  const cmdOn = phase === 'command';
  const wasReady = useRef(false);
  useEffect(() => {
    if (ultReady && !wasReady.current) sfx('gauge');
    wasReady.current = ultReady;
  }, [ultReady]);

  return (
    <div className="screen battle-screen">
      <StageView
        mode="battle"
        className="stage"
        onReady={(s) => {
          stage.current = s;
          s.speed = speedRef.current;
          s.setFighters(player.spec, enemy.spec);
          run().catch((e) => {
            if (alive.current) console.error(e);
          });
        }}
      />

      <div className="hud-top">
        <SidePanel c={chars[0]} h={hud[0]} side={0} />
        <div className="hud-center">
          <div className="round">ROUND {round}</div>
          <button className="btn tiny" onClick={() => setSpeed(speed === 1 ? 2 : 1)}>
            ×{speed}
          </button>
          <button className="btn tiny ghost" onClick={onExit}>
            にげる
          </button>
        </div>
        <SidePanel c={chars[1]} h={hud[1]} side={1} />
      </div>

      <div className="popups">
        {popups.map((p) => (
          <div key={p.id} className={`pop ${p.kind}`} style={{ left: p.x, top: p.y }}>
            {p.text}
          </div>
        ))}
      </div>

      {cinema && (
        <>
          <div className="cinema-bar top" />
          <div className="cinema-bar bottom" />
        </>
      )}

      {banner && (
        <div
          className={`banner ${banner.ult ? 'ult' : 'skill'} s${banner.side}`}
          style={{ '--el': banner.color } as CSSProperties}
        >
          <div className="banner-stripe" />
          {banner.ult && <div className="banner-lines" />}
          {banner.ult && banner.thumb && <img className="banner-photo" src={banner.thumb} alt="" />}
          <div className="banner-text">
            <div className="banner-sub">{banner.ult ? 'ULTIMATE' : banner.sub}</div>
            <div className="banner-title">{banner.title}</div>
            {banner.ult && <div className="banner-shout">「{banner.sub}」</div>}
          </div>
        </div>
      )}

      {splash && (
        <div className="splash" key={splash}>
          {splash}
        </div>
      )}

      <div className="hud-bottom">
        <div className="message">{msg}</div>
        {result ? (
          <div className={`result ${result}`}>
            <div className="result-title">{result === 'win' ? 'YOU WIN' : 'YOU LOSE'}</div>
            <div className="actions row">
              <button className="btn primary" onClick={onRematch}>
                もう一度
              </button>
              <button className="btn ghost" onClick={onExit}>
                もどる
              </button>
            </div>
          </div>
        ) : (
          <div className={`commands${cmdOn ? '' : ' wait'}`}>
            <button className="cmd attack" data-sfx="select" disabled={!cmdOn} onClick={() => choose('attack')}>
              <span className="cmd-main">アタック</span>
              <span className="cmd-sub">ATTACK</span>
            </button>
            <button className="cmd guard" data-sfx="select" disabled={!cmdOn} onClick={() => choose('guard')}>
              <span className="cmd-main">ガード</span>
              <span className="cmd-sub">ダメージ6割カット・SP+15</span>
            </button>
            <button className="cmd skill" data-sfx="select" disabled={!cmdOn || !skillReady} onClick={() => choose('skill')}>
              <span className="cmd-main">{player.skill.name}</span>
              <span className="cmd-sub">
                {me.cooldown > 0
                  ? `あと${me.cooldown}ターン`
                  : `SP ${player.skill.spCost} ・ ${SKILL_TABLE[player.skill.kind].label}`}
              </span>
            </button>
            <button className={`cmd ult${ultReady ? ' ready' : ''}`} data-sfx="select" disabled={!cmdOn || !ultReady} onClick={() => choose('ultimate')}>
              <span className="cmd-main">{ultReady ? player.spec.ultimate.name : '必殺技'}</span>
              <span className="cmd-sub">{ultReady ? 'READY!' : `ゲージ ${me.gauge}%`}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
