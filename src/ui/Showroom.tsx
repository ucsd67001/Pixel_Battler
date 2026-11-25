// 開発中だけ：ロボを並べて見比べる画面（URL に ?showroom を付ける）
//   ?showroom&spin    … 回す
//   ?showroom&pose=guard … ポーズを変える（idle・slash・guard・aim・victory など）
//   ?showroom&yaw=0.5 … 向き（ラジアン）
//   ?showroom&cpu     … コンピュータの敵を全員ならべる（&cpu=4,8 で、えらんだ敵だけ）
//   ?showroom&minions=1 … ストーリーの1章の手下4体とボスをならべる（一度にたくさん出すと 3D の数の上限を超えるので、章ごとに見る）
//   ?showroom&items=humanoid … その形のロボに、8種類のアイテムを一つずつ持たせてならべる（humanoid・floater・beast。&kinds=sword,axe でえらんで。2026-11-26）
//   ?showroom&item=sword … ならべたロボ全員に、そのアイテムを持たせる（&size=large・&deco=gem も使える）
//   ?showroom&battle=1&item=staff … アイテムを持たせて、バトルする（&foeitem=gun で、敵にも持たせる。&foe=9 で敵のロボをえらぶ）

import type { CharacterSpec } from '../game/types';
import { buildItem, ITEM_DECOS, ITEM_KINDS, ITEM_SIZES, isItemKind, withItem, type ItemKind, type ItemSpec } from '../game/items';
import { CPU_CHARACTERS } from '../game/cpu';
import { enemyAt } from '../game/story';
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

const ITEM_COLORS: Record<ItemKind, ItemSpec['colors']> = {
  sword: { primary: '#d8e2f0', secondary: '#3a3f55', accent: '#4ad8ff' },
  axe: { primary: '#c8502e', secondary: '#5a3a22', accent: '#ffc84a' },
  spear: { primary: '#e8e8f0', secondary: '#2a6a4a', accent: '#8aff6a' },
  gun: { primary: '#3a4a6a', secondary: '#1a1e2a', accent: '#ff5a8a' },
  staff: { primary: '#6a4ac9', secondary: '#e8d8a0', accent: '#c88aff' },
  shield: { primary: '#2a6ad6', secondary: '#e8ecf4', accent: '#ffd24a' },
  helmet: { primary: '#d6a42a', secondary: '#5a2a1a', accent: '#ff7a3a' },
  armor: { primary: '#8a96aa', secondary: '#2a2f3d', accent: '#4affc8' },
};
const itemOf = (kind: ItemKind, q: URLSearchParams): ItemSpec => {
  const size = q.get('size');
  const deco = q.get('deco');
  return {
    kind,
    name: kind,
    description: '',
    motif: '',
    colors: ITEM_COLORS[kind],
    size: (ITEM_SIZES as readonly string[]).includes(size ?? '') ? (size as ItemSpec['size']) : 'medium',
    deco: (ITEM_DECOS as readonly string[]).includes(deco ?? '') ? (deco as ItemSpec['deco']) : 'plain',
  };
};

export function Showroom() {
  const q = new URLSearchParams(location.search);
  const itemsForm = q.get('items');
  // アイテムが見やすいように、暗めの色のロボにする
  const dark = { primary: '#3a3550', secondary: '#7a6bb6', accent: '#c9a24a', eye: '#ff4ad6' };
  const formBase =
    { humanoid: SPECS[5], floater: { ...SPECS[8], colors: dark }, beast: { ...SPECS[9], colors: dark } }[itemsForm ?? ''] ?? SPECS[5];
  // &kinds=helmet,armor … えらんだ種類だけ
  const kinds = q.get('kinds') ? ITEM_KINDS.filter((k) => q.get('kinds')!.split(',').includes(k)) : [...ITEM_KINDS];
  const oneItem = q.get('item');
  const pose = (q.get('pose') ?? 'idle') as PoseName;
  const yaw = Number(q.get('yaw') ?? '0.5');
  const only = q.get('only');
  // ?showroom&vary=1 … 1番のロボを、名前だけ変えて8体（体の比率のちがいを見る）
  const vary = q.get('vary');
  // ?showroom&cpu … コンピュータの敵を全員ならべる（&cpu=4,8 でえらんで）
  const cpuSel = q.get('cpu');
  const minionCh = Number(q.get('minions')) || 1;
  const list = itemsForm
    ? kinds.map(() => formBase)
    : q.has('minions')
    ? [0, 1, 2, 3, 4].map((slot) => enemyAt(minionCh, slot)).filter((c) => !!c).map((c) => c.spec)
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
    const foeItem = q.get('foeitem');
    const player = withItem(
      { ...CPU_CHARACTERS[0], id: 'showroom', source: 'local', spec },
      isItemKind(oneItem) ? buildItem(itemOf(oneItem, q), 'showroom-item', 'local') : undefined,
    );
    const foeSpec = q.has('foe') ? SPECS[Number(q.get('foe'))] : undefined;
    const enemy =
      foeSpec || isItemKind(foeItem)
        ? withItem(
            { ...CPU_CHARACTERS[1], id: 'showroom-foe', ...(foeSpec ? { spec: foeSpec } : {}) },
            isItemKind(foeItem) ? buildItem(itemOf(foeItem, q), 'showroom-foe-item', 'local') : undefined,
          )
        : undefined;
    return <Battle player={player} enemy={enemy} onExit={back} onRematch={back} />;
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
              s.setShowcase(spec, itemsForm ? itemOf(kinds[i], q) : isItemKind(oneItem) ? itemOf(oneItem, q) : undefined);
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
