// アイテム（武器と防具）の 3D（2026-11-26。docs/ITEMS.md の段階4）。
//   ・アイテムの形は、ロボの形に関係なく一つ（色・大きさ・かざりは、アイテムの設計図から）
//   ・持ち方だけ、ロボの形ごとに変える（4章の表）：
//       ヒト型＝武器は右手・たては左のうで・かぶとは頭・よろいは胸
//       トリ型（浮遊型）＝武器は右の浮かぶ手・たては左の浮かぶ手・かぶとは頭の上・よろいは体のまわり
//       イヌ型（獣型）＝武器は口にくわえる（横にして）・じゅうは背中の砲台・たては左の肩・かぶとは頭・よろいは背中と胸
//   ・武器は、手のところを原点に +z へのびる形で作る（前の「もとの武器」と同じ向き）

import * as THREE from 'three';
import type { Form } from '../game/types';
import type { ItemSpec } from '../game/items';
import type { Kit } from './robot';

const SIZE = { small: 0.82, medium: 1, large: 1.2 } as const;

/** ロボの体の中で、アイテムを付けるところ（体の形ごと。robot.ts の各 build から渡す） */
export type ItemMounts =
  | { form: 'humanoid'; hand: THREE.Group; offFore: THREE.Group; head: THREE.Group; torso: THREE.Group; SW: number; W: number }
  | { form: 'floater'; hand: THREE.Group; offHand: THREE.Group; core: THREE.Group; R0: number }
  | { form: 'beast'; jaw: THREE.Group; back: THREE.Group; legFL: THREE.Group; skull: THREE.Group; torso: THREE.Group; W: number };

interface Built {
  tip?: THREE.Object3D; // 武器の先（こうげきの光が出るところ）
  muzzle?: THREE.Object3D; // うつところ（じゅう・つえ）
}

/** アイテムの色の材料（ロボの材料とは別。ロボを消すときにいっしょに消す） */
function itemMats(k: Kit, spec: ItemSpec) {
  const tame = (hex: string) => {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    if (hsl.l > 0.66) c.setHSL(hsl.h, hsl.s, 0.66);
    return c;
  };
  const m = {
    body: new THREE.MeshPhysicalMaterial({ color: tame(spec.colors.primary), metalness: 0.55, roughness: 0.28, clearcoat: 0.4, clearcoatRoughness: 0.35 }),
    grip: new THREE.MeshPhysicalMaterial({ color: tame(spec.colors.secondary), metalness: 0.35, roughness: 0.4, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
    trim: new THREE.MeshStandardMaterial({ color: tame(spec.colors.accent), metalness: 0.9, roughness: 0.2 }),
    glow: new THREE.MeshStandardMaterial({ color: spec.colors.accent, emissive: spec.colors.accent, emissiveIntensity: 2.2, toneMapped: false }),
  };
  k.extraMats.push(...Object.values(m));
  return m;
}
type IM = ReturnType<typeof itemMats>;

// ── かざり（宝石・とげ・羽・しま模様）。p＝付けるグループ、(x, y, z)＝付ける場所、s＝大きさ ──
function addDeco(k: Kit, m: IM, spec: ItemSpec, p: THREE.Object3D, x: number, y: number, z: number, s = 1) {
  const { prism, sphere, slab, poly, box } = k;
  switch (spec.deco) {
    case 'gem':
      p.add(sphere(0.04 * s, m.glow, x, y, z));
      break;
    case 'spikes':
      for (const sx of [1, -1]) {
        const sp = prism(0, 0.05 * s, 0.12 * s, 0.05 * s, m.trim, x + 0.05 * s * sx, y, z);
        sp.rotation.z = -1.2 * sx;
        p.add(sp);
      }
      break;
    case 'wings':
      for (const sx of [1, -1]) {
        const w = slab(poly([[0, 0], [0.16, 0.06], [0.22, 0.16], [0.08, 0.05]], sx), 0.014, m.trim);
        w.scale.setScalar(s);
        w.position.set(x + 0.03 * s * sx, y, z);
        p.add(w);
      }
      break;
    case 'stripes':
      for (const dz of [-0.05, 0.05]) p.add(box(0.012 * s, 0.07 * s, 0.018 * s, m.glow, x + 0.03 * s, y, z + dz * s, 0.004));
      break;
    case 'plain':
      break;
  }
}

// ── 武器（手のところが原点。+z へのびる）。返すのは武器全体のグループと、先と、うつところ ──
function buildWeapon(k: Kit, m: IM, spec: ItemSpec): { g: THREE.Group; tip: THREE.Object3D; muzzle: THREE.Object3D; len: number } {
  const { box, prism, cyl, sphere, group, poly, slab, mesh } = k;
  const S = SIZE[spec.size];
  const g = group();
  let tip: THREE.Object3D = g;
  let muzzle: THREE.Object3D = g;
  let len = 1;
  switch (spec.kind) {
    case 'sword': {
      const L = 1.0 * S;
      g.add(cyl(0.02, 0.02, 0.17, m.grip).rotateX(Math.PI / 2));
      g.add(sphere(0.03, m.trim, 0, 0, -0.1));
      const guard = slab(poly([[-0.03, 0.03], [-0.16, 0.07], [-0.05, -0.01], [0.05, -0.01], [0.16, 0.07], [0.03, 0.03]]), 0.03, m.trim);
      guard.rotation.z = Math.PI / 2;
      guard.position.z = 0.1;
      g.add(guard);
      g.add(box(0.024, 0.075, L, m.body, 0, 0, 0.12 + L / 2, 0.005));
      g.add(box(0.028, 0.012, L - 0.05, m.glow, 0, 0.03, 0.12 + L / 2, 0.003));
      const p = prism(0, 0.024, 0.17, 0.075, m.body, 0, 0, 0.12 + L + 0.085);
      p.rotation.x = Math.PI / 2;
      g.add(p);
      addDeco(k, m, spec, g, 0, 0, 0.13, 1);
      tip = group(0, 0, 0.12 + L + 0.12);
      len = 0.3 + L;
      break;
    }
    case 'axe': {
      const L = 0.95 * S;
      g.add(cyl(0.024, 0.024, L, m.grip, 0, 0, L / 2 - 0.15).rotateX(Math.PI / 2));
      g.add(cyl(0.032, 0.03, 0.06, m.trim, 0, 0, -0.17).rotateX(Math.PI / 2));
      const hz = L - 0.25;
      // 大きな刃（柄から外がわへ、扇のように広がる）。刃は ah の y の向きに作り、ah を柄のまわりに回して、横（−x＝右手の外がわ）へ向ける
      const ah = group();
      ah.rotation.z = Math.PI / 2;
      g.add(ah);
      const blade = slab(poly([[-0.07, 0.02], [0.07, 0.02], [0.22, 0.26], [0.17, 0.33], [0, 0.29], [-0.17, 0.33], [-0.22, 0.26]]), 0.035, m.body, 0, 0.008);
      blade.rotation.y = Math.PI / 2;
      blade.scale.setScalar(S);
      blade.position.set(0, 0.02, hz);
      ah.add(blade);
      const edge = slab(poly([[0.23, 0.27], [0.18, 0.35], [0, 0.31], [-0.18, 0.35], [-0.23, 0.27], [-0.17, 0.3], [0, 0.26], [0.17, 0.3]]), 0.04, m.glow);
      edge.rotation.y = Math.PI / 2;
      edge.scale.setScalar(S);
      edge.position.set(0, 0.02, hz);
      ah.add(edge);
      // 後ろのとげ
      const back = prism(0, 0.09, 0.16, 0.04, m.trim, 0, -0.08 * S, hz);
      back.rotation.x = Math.PI;
      ah.add(back);
      ah.add(box(0.06, 0.08, 0.1, m.trim, 0, 0, hz, 0.01));
      addDeco(k, m, spec, ah, 0, 0.06, hz, S);
      tip = group(0, 0.3 * S, hz);
      ah.add(tip);
      len = L;
      break;
    }
    case 'spear': {
      const L = 1.7 * S;
      g.add(cyl(0.02, 0.02, L, m.grip, 0, 0, L / 2 - 0.4, 8).rotateX(Math.PI / 2));
      g.add(cyl(0.03, 0.02, 0.08, m.trim, 0, 0, -0.42, 8).rotateX(Math.PI / 2));
      const end = L - 0.4;
      g.add(cyl(0.045, 0.03, 0.08, m.trim, 0, 0, end, 6).rotateX(Math.PI / 2));
      const head = prism(0, 0.034, 0.46, 0.11, m.body, 0, 0, end + 0.27);
      head.rotation.x = Math.PI / 2;
      g.add(head);
      g.add(box(0.036, 0.012, 0.34, m.glow, 0, 0, end + 0.25, 0.003));
      addDeco(k, m, spec, g, 0, 0, end + 0.03, 1);
      tip = group(0, 0, end + 0.5);
      len = L + 0.1;
      break;
    }
    case 'gun': {
      // 光の玉をうつ、未来の道具（前の「もとの武器」のライフルの形）
      const L = 0.72 * S;
      g.add(box(0.085, 0.14, 0.5, m.grip, 0, 0.05, 0.14));
      g.add(box(0.05, 0.05, L, m.body, 0, 0.08, 0.38 + L / 2));
      g.add(cyl(0.034, 0.028, 0.14, m.trim, 0, 0.08, 0.42 + L).rotateX(Math.PI / 2));
      g.add(box(0.05, 0.065, 0.22, m.body, 0, 0.18, 0.1));
      g.add(box(0.032, 0.16, 0.06, m.grip, 0, -0.06, 0.0));
      g.add(box(0.01, 0.026, 0.44, m.glow, 0.047, 0.05, 0.16, 0.003));
      addDeco(k, m, spec, g, 0, 0.22, 0.12, 0.8);
      muzzle = group(0, 0.08, 0.5 + L);
      tip = muzzle;
      len = 0.5 + L;
      break;
    }
    case 'staff': {
      // 魔法の杖：長い柄の先に、光る玉と、まわりを回る輪（docs/ITEMS.md の5章）
      const L = 1.25 * S;
      g.add(cyl(0.022, 0.018, L, m.grip, 0, 0, L / 2 - 0.3, 8).rotateX(Math.PI / 2));
      g.add(sphere(0.035, m.trim, 0, 0, -0.32));
      const end = L - 0.3;
      // 玉をかかえる三日月の形
      for (const s of [1, -1]) {
        const c = prism(0, 0.04, 0.24, 0.03, m.trim, 0.05 * s, 0, end + 0.1);
        c.rotation.set(Math.PI / 2, 0, 0);
        c.rotation.y = -0.35 * s;
        g.add(c);
      }
      g.add(cyl(0.04, 0.026, 0.06, m.trim, 0, 0, end, 8).rotateX(Math.PI / 2));
      const orb = sphere(0.075 * S, m.glow, 0, 0, end + 0.13 * S);
      g.add(orb);
      const ring = mesh(new THREE.TorusGeometry(0.12 * S, 0.008, 6, 40), m.trim);
      ring.position.set(0, 0, end + 0.13 * S);
      ring.rotation.y = 0.6;
      g.add(ring);
      addDeco(k, m, spec, g, 0, 0, end - 0.05, 0.9);
      muzzle = group(0, 0, end + 0.13 * S);
      tip = muzzle;
      len = L;
      break;
    }
    default:
      break;
  }
  if (tip !== g && !tip.parent) g.add(tip);
  if (muzzle !== g && !muzzle.parent) g.add(muzzle);
  return { g, tip, muzzle, len };
}

// ── たて（下がとがった大きな涙形）。原点は持つところ。面は +x を向く ──
function buildShield(k: Kit, m: IM, spec: ItemSpec) {
  const { cyl, sphere, group, poly, slab } = k;
  const S = SIZE[spec.size];
  const g = group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.48);
  shape.quadraticCurveTo(0.29, 0.48, 0.26, 0.05);
  shape.quadraticCurveTo(0.21, -0.3, 0, -0.56);
  shape.quadraticCurveTo(-0.21, -0.3, -0.26, 0.05);
  shape.quadraticCurveTo(-0.29, 0.48, 0, 0.48);
  const face = group();
  face.scale.setScalar(S);
  g.add(face);
  const put = (mm: THREE.Mesh, off: number) => {
    mm.rotation.y = Math.PI / 2;
    mm.position.set(0.11 + off, 0, 0);
    face.add(mm);
  };
  const rim = slab(shape, 0.03, m.trim, 1.0);
  rim.scale.set(1.07, 1.05, 1);
  put(rim, -0.006);
  put(slab(shape, 0.04, m.body, 1.0), 0);
  put(slab(poly([[-0.05, 0.44], [0.03, 0.44], [0.1, 0.0], [0.03, -0.46], [-0.02, -0.1]]), 0.012, m.grip, 1.0), 0.026);
  const mark = cyl(0.065, 0.065, 0.02, m.trim, 0.15, 0.12, 0, 6);
  mark.rotation.z = Math.PI / 2;
  face.add(mark);
  face.add(sphere(0.03, m.glow, 0.165, 0.12, 0));
  const deco = group(0.16, -0.12, 0);
  deco.rotation.z = -Math.PI / 2;
  face.add(deco);
  addDeco(k, m, spec, deco, 0, 0, 0, 1.2);
  return g;
}

// ── かぶと（丸い兜。原点は頭の中心、r＝頭の大きさ）。前は +z。
//    cap＝かぶせる深さ（0.5 で半球。トリ型は目をかくさないように浅くする） ──
function buildHelmetItem(k: Kit, m: IM, spec: ItemSpec, r: number, cap = 0.5) {
  const { mesh, box, prism, group, sphere } = k;
  const g = group();
  const R = r * (0.92 + (SIZE[spec.size] - 1) * 0.5);
  const by = R * Math.cos(cap * Math.PI); // ふちの高さ
  const br = R * Math.sin(cap * Math.PI); // ふちの半径
  const dome = mesh(new THREE.SphereGeometry(R, 24, 12, 0, Math.PI * 2, 0, Math.PI * cap), m.body);
  g.add(dome);
  const brim = mesh(new THREE.TorusGeometry(br, r * 0.09, 6, 32), m.trim);
  brim.rotation.x = Math.PI / 2;
  brim.position.y = by;
  g.add(brim);
  // 前のひさしと、光る線
  const visor = box(br * 1.2, r * 0.12, r * 0.4, m.grip, 0, by - r * 0.02, br * 0.85, 0.01);
  visor.rotation.x = 0.25;
  g.add(visor);
  g.add(box(br * 1.0, r * 0.05, r * 0.06, m.glow, 0, by + r * 0.3, br * 0.92, 0.004).rotateX(-0.35));
  // てっぺんのとさか（かざりが無いときも、少しだけ）
  g.add(prism(0, r * 0.3, r * 0.5, r * 0.08, m.trim, 0, R + r * 0.18, 0));
  if (spec.deco === 'gem') g.add(sphere(r * 0.16, m.glow, 0, by + r * 0.5, br * 0.88));
  else addDeco(k, m, spec, g, 0, R * 0.75, 0, r * 4);
  return g;
}

/**
 * ロボにアイテムを付ける。武器なら、先とうつところも返す（無ければ、ロボのもとのまま）。
 * どの形でも、アイテムの形は同じ（持つところだけ変える）
 */
export function attachItem(k: Kit, mounts: ItemMounts, spec: ItemSpec): Built {
  const m = itemMats(k, spec);
  const form: Form = mounts.form;
  const kind = spec.kind;
  const weapon = kind === 'sword' || kind === 'axe' || kind === 'spear' || kind === 'gun' || kind === 'staff';

  if (weapon) {
    const w = buildWeapon(k, m, spec);
    if (mounts.form === 'humanoid' || mounts.form === 'floater') {
      mounts.hand.add(w.g);
      return { tip: w.tip, muzzle: w.muzzle };
    }
    // イヌ型：じゅうは背中の砲台、ほかは口に横にしてくわえる
    if (kind === 'gun') {
      const seat = k.group(0, 0.1, 0.06);
      mounts.back.add(seat);
      seat.add(k.cyl(0.1, 0.12, 0.08, m.trim, 0, 0, 0, 12));
      seat.add(k.box(0.18, 0.1, 0.22, m.grip, 0, 0.08, -0.02, 0.012));
      w.g.position.set(0, 0.1, -0.22);
      seat.add(w.g);
      return { tip: w.tip, muzzle: w.muzzle };
    }
    const hold = k.group(0, 0.03, 0.2);
    hold.rotation.y = Math.PI / 2; // +z（武器の先）が、横（+x）を向く
    mounts.jaw.add(hold);
    w.g.scale.setScalar(0.8);
    w.g.position.z = -w.len * 0.8 * 0.42; // 柄の真ん中あたりを、くわえる
    hold.add(w.g);
    return { tip: w.tip, muzzle: w.muzzle };
  }

  if (kind === 'shield') {
    const sh = buildShield(k, m, spec);
    if (mounts.form === 'humanoid') {
      // 腕を曲げて立つときに、たてがまっすぐ立つように、少し起こして付ける（前の「もとの武器」の盾と同じ）
      const mount = k.pivot(mounts.offFore, 0, -0.17, 0.03, 0.75, 0, 0);
      mount.add(sh);
    } else if (mounts.form === 'floater') {
      mounts.offHand.add(sh);
    } else {
      // イヌ型：左の前足の肩に、小さめに
      sh.scale.setScalar(0.55);
      sh.position.set(0.03, -0.12, 0.02);
      mounts.legFL.add(sh);
    }
    return {};
  }

  if (kind === 'helmet') {
    if (mounts.form === 'humanoid') {
      const h = buildHelmetItem(k, m, spec, 0.2);
      h.position.set(0, 0.24, -0.03);
      mounts.head.add(h);
    } else if (mounts.form === 'floater') {
      const h = buildHelmetItem(k, m, spec, mounts.R0 * 1.15, 0.3);
      h.position.set(0, 0.0, -0.01);
      mounts.core.add(h);
    } else {
      const h = buildHelmetItem(k, m, spec, 0.17);
      h.scale.set(1.0, 0.85, 1.15);
      h.position.set(0, 0.1, -0.02);
      mounts.skull.add(h);
    }
    return {};
  }

  // よろい
  const { box, slab, poly, sphere, mesh, prism } = k;
  if (mounts.form === 'humanoid') {
    const { torso, SW, W } = mounts;
    const S = 0.95 + (SIZE[spec.size] - 1) * 0.4;
    // 胸の前の板（コアの前に宝石）と、後ろの板、肩の当て
    const front = slab(poly([[-0.27, 0.12], [0.27, 0.12], [0.2, -0.06], [0, -0.17], [-0.2, -0.06]]), 0.05, m.body, 1.2, 0.008);
    front.scale.set(SW * S, S, 1);
    front.position.set(0, 0.47, 0.17);
    front.rotation.x = -0.1;
    torso.add(front);
    const rear = slab(poly([[-0.25, 0.12], [0.25, 0.12], [0.18, -0.12], [-0.18, -0.12]]), 0.04, m.body, -1.0, 0.006);
    rear.scale.set(SW * S, S, 1);
    rear.position.set(0, 0.45, -0.17);
    torso.add(rear);
    torso.add(box(0.5 * SW * S, 0.03, 0.06, m.trim, 0, 0.6, 0.12, 0.008));
    torso.add(sphere(0.05, m.glow, 0, 0.44, 0.215));
    // 肩の上の丸い当て（胴に付ける。腕を上げても、肩の上に残る）
    for (const s of [1, -1]) {
      const pad = mesh(new THREE.SphereGeometry(0.13 * S, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), m.body);
      pad.scale.set(1.1, 0.75, 1.15);
      pad.position.set(0.3 * SW * s, 0.6, 0);
      pad.rotation.z = -0.35 * s;
      torso.add(pad);
      const rim = mesh(new THREE.TorusGeometry(0.13 * S * 1.1, 0.014, 6, 24), m.trim);
      rim.rotation.x = Math.PI / 2;
      rim.scale.set(1, 1.05, 1);
      pad.add(rim);
    }
    // 腰のベルト
    const belt = mesh(new THREE.TorusGeometry(0.11 * W, 0.022, 6, 24), m.grip);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.1;
    torso.add(belt);
    addDeco(k, m, spec, torso, 0, 0.53, 0.2, 1.1);
  } else if (mounts.form === 'floater') {
    const { core, R0 } = mounts;
    // 体のまわりの帯と、四つの板
    const band = mesh(new THREE.TorusGeometry(R0 * 1.04, 0.045, 8, 40), m.body);
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.04;
    core.add(band);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const p = prism(0.1, 0.16, 0.18, 0.05, m.trim, Math.sin(a) * R0 * 1.06, -0.04, Math.cos(a) * R0 * 1.06);
      p.rotation.y = a;
      core.add(p);
    }
    core.add(sphere(0.045, m.glow, 0, -0.04, R0 * 1.1));
    addDeco(k, m, spec, core, 0, 0.06, R0 * 1.05, 1);
  } else {
    const { torso, W } = mounts;
    // 背中の鞍のような板・横の板・胸の板（馬のよろいのように）
    torso.add(box(0.44 * W, 0.06, 0.62, m.body, 0, 0.17, -0.02, 0.02));
    torso.add(box(0.2 * W, 0.03, 0.6, m.trim, 0, 0.21, -0.02, 0.008));
    for (const s of [1, -1]) {
      const side = slab(poly([[-0.3, 0.06], [0.3, 0.06], [0.26, -0.12], [-0.26, -0.12]]), 0.02, m.body, 0, 0.005);
      side.rotation.y = Math.PI / 2;
      side.position.set((0.21 * W + 0.02) * s, 0.06, -0.02);
      torso.add(side);
    }
    torso.add(box(0.4 * W, 0.22, 0.04, m.body, 0, 0.0, 0.5, 0.015));
    torso.add(sphere(0.045, m.glow, 0, 0.02, 0.53));
    addDeco(k, m, spec, torso, 0, 0.24, 0.1, 1.1);
  }
  return {};
}
