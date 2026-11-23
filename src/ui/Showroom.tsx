// 開発中だけ：ロボを並べて見比べる画面（URL に ?showroom を付ける）
//   ?showroom&spin    … 回す
//   ?showroom&pose=guard … ポーズを変える（idle・slash・guard・aim・victory など）
//   ?showroom&yaw=0.5 … 向き（ラジアン）
//   ?showroom&cpu     … コンピュータの敵を全員ならべる（&cpu=4,8 で、えらんだ敵だけ）
//   ?showroom&minions=1 … ストーリーの1章の手下4体とボスをならべる（一度にたくさん出すと 3D の数の上限を超えるので、章ごとに見る）

import type { CharacterSpec } from '../game/types';
import { CPU_CHARACTERS } from '../game/cpu';
import { MINIONS } from '../game/minions';
import { StageView } from './StageView';
import { Battle } from './Battle';
import { posesOf, proportionsOf, setPose, type PoseName } from '../three/robot';

const base = CPU_CHARACTERS[0].spec;
const v = (over: Partial<CharacterSpec> & { parts?: Partial<CharacterSpec['parts']> }): CharacterSpec => ({
  ...base,
  ...over,
  parts: { ...base.parts, ...(over.parts ?? {}) },
  colors: { ...base.colors, ...(over.colors ?? {}) },
});

const SPECS: CharacterSpec[] = [
  v({
    form: 'humanoid', element: 'light',
    parts: { head: 'vfin', body: 'slim', arms: 'standard', legs: 'standard', back: 'wings', weapon: 'sword' },
    colors: { primary: '#eef0f6', secondary: '#6a4cc9', accent: '#d9b44a', eye: '#9fe8ff' },
  }),
  v({
    form: 'humanoid', element: 'blaze',
    parts: { head: 'crest', body: 'standard', arms: 'standard', legs: 'standard', back: 'cape', weapon: 'shield' },
    colors: { primary: '#e9e9ec', secondary: '#c8321e', accent: '#c9a24a', eye: '#ffcf5a' },
  }),
  v({
    form: 'humanoid', element: 'tide',
    parts: { head: 'horns', body: 'slim', arms: 'blade', legs: 'thruster', back: 'boosters', weapon: 'lance' },
    colors: { primary: '#8fbfe6', secondary: '#2a2f3d', accent: '#e8e8e8', eye: '#ffe14a' },
  }),
  CPU_CHARACTERS[0].spec,
  v({
    form: 'humanoid', element: 'verdant',
    parts: { head: 'ears', body: 'standard', arms: 'standard', legs: 'standard', back: 'none', weapon: 'rifle' },
    colors: { primary: '#3c6b4a', secondary: '#c9d1b0', accent: '#e07a2a', eye: '#b6ff6a' },
  }),
  v({
    form: 'humanoid', element: 'dark',
    parts: { head: 'crown', body: 'heavy', arms: 'standard', legs: 'standard', back: 'cannons', weapon: 'claw' },
    colors: { primary: '#2a2440', secondary: '#8d7bd6', accent: '#ffcc44', eye: '#ff4ad6' },
  }),
  CPU_CHARACTERS[1].spec,
  CPU_CHARACTERS[2].spec,
  v({
    form: 'floater', element: 'tide',
    parts: { head: 'vfin', body: 'standard', arms: 'standard', legs: 'standard', back: 'cape', weapon: 'shield' },
    colors: { primary: '#e8ecf2', secondary: '#3a6bd6', accent: '#d9b44a', eye: '#9fe8ff' },
  }),
  v({
    form: 'beast', element: 'light',
    parts: { head: 'crest', body: 'standard', arms: 'standard', legs: 'standard', back: 'wings', weapon: 'lance' },
    colors: { primary: '#eeeeee', secondary: '#c9a24a', accent: '#7a5cff', eye: '#ffe14a' },
  }),
];

export function Showroom() {
  const q = new URLSearchParams(location.search);
  const pose = (q.get('pose') ?? 'idle') as PoseName;
  const yaw = Number(q.get('yaw') ?? '0.5');
  const only = q.get('only');
  // ?showroom&vary=1 … 1番のロボを、名前だけ変えて8体（体の比率のちがいを見る）
  const vary = q.get('vary');
  // ?showroom&cpu … コンピュータの敵を全員ならべる（&cpu=4,8 でえらんで）
  const cpuSel = q.get('cpu');
  const minionCh = Number(q.get('minions')) || 1;
  const list = q.has('minions')
    ? [...(MINIONS[minionCh - 1] ?? []), CPU_CHARACTERS[minionCh - 1]].filter(Boolean).map((c) => c.spec)
    : q.has('cpu')
    ? (cpuSel ? cpuSel.split(',').map((i) => CPU_CHARACTERS[Number(i)]).filter(Boolean) : CPU_CHARACTERS).map((c) => c.spec)
    : vary
    ? Array.from({ length: 8 }, (_, i) => ({ ...SPECS[Number(vary)], name: `ためし${i}` }))
    : only
      ? only.split(',').map((i) => SPECS[Number(i)]).filter(Boolean)
      : SPECS;
  // ?showroom&battle=1 … 1番のロボで、コンピュータとバトルする
  if (q.has('battle')) {
    const spec = SPECS[Number(q.get('battle'))] ?? SPECS[0];
    const back = () => location.reload();
    return <Battle player={{ ...CPU_CHARACTERS[0], id: 'showroom', source: 'local', spec }} onExit={back} onRematch={back} />;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, list.length)}, 1fr)`, gap: 4, padding: 4, background: '#0b0d14', minHeight: '100vh' }}>
      {list.map((spec, i) => (
        <div key={i} style={{ height: list.length > 4 ? '48vh' : '96vh', position: 'relative' }}>
          {vary && (
            <div style={{ position: 'absolute', zIndex: 1, left: 4, top: 4, font: '10px monospace', color: '#cfe' }}>
              {Object.entries(proportionsOf(spec)).map(([key, n]) => `${key} ${n.toFixed(2)}`).join(' / ')}
            </div>
          )}
          <StageView
            mode="showcase"
            className="stage"
            onReady={(s) => {
              s.setShowcase(spec);
              s.turntable = q.has('spin');
              const r = (s as unknown as { robots: ({ root: { rotation: { y: number } } } | null)[] }).robots[0];
              if (r) {
                r.root.rotation.y = yaw;
                setPose(r as never, posesOf(r as never)[pose] ?? posesOf(r as never).idle);
              }
              // 寄って見る（?zoom=2 で2倍）
              const zoom = Number(q.get('zoom') ?? '1');
              if (zoom !== 1)
                setTimeout(() => {
                  const y = Number(q.get('y') ?? '1.25');
                  const c = s as unknown as { camLook: { y: number }; camPos: { set(x: number, y: number, z: number): void } };
                  c.camPos.set(0, y + 0.15, 5.6 / zoom);
                  c.camLook.y = y;
                }, 400);
            }}
          />
        </div>
      ))}
    </div>
  );
}
