// 設計図から、部品を組み合わせてロボを作る（プラモ方式）。
// 体の形は三つ：人型（humanoid）・四つ足の獣型（beast）・浮遊型（floater）。
// 見た目は「等身を上げた、角の立ったメカ」：小さめの頭・長い手足・面取りした装甲・発光ライン。
// どれも関節（グループ）を持たせ、体の形ごとのポーズで動かす。前は +z、足元が y=0。

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { CharacterSpec, Form, HeadType } from '../game/types';
import { ELEMENT_INFO } from '../game/data';
import { rngFrom } from '../game/random';
import { Ease, lerp, type EaseFn, type Tweener } from './anim';

export type Pose = Record<string, [number, number, number]>;
export type PoseName =
  | 'idle' | 'windup' | 'slash' | 'pullback' | 'thrust' | 'aim' | 'guard'
  | 'hit' | 'cast' | 'charge' | 'uppercut' | 'victory';

export interface Robot {
  spec: CharacterSpec;
  form: Form;
  root: THREE.Group; // 場所と向き
  body: THREE.Group; // 揺れ・倒れ
  bones: Record<string, THREE.Group>;
  tip: THREE.Object3D; // 武器の先
  muzzle: THREE.Object3D; // 撃つところ
  core: THREE.Object3D; // 胸のコア
  chestY: number; // 当たる高さ
  spins: { obj: THREE.Object3D; speed: number }[]; // いつも回っている飾り
  setFlash(v: number): void;
  setEyes(v: number): void;
  dispose(): void;
}

// ── 部品を作る道具 ──
function makeKit(spec: CharacterSpec) {
  const el = ELEMENT_INFO[spec.element].color;
  // 白に近い装甲は、光が当たると白飛びするので、明るさを少し抑える
  const tame = (hex: string) => {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    if (hsl.l > 0.64) c.setHSL(hsl.h, hsl.s, 0.64);
    return c;
  };
  const std = (color: string, metalness: number, roughness: number) =>
    new THREE.MeshStandardMaterial({ color: tame(color), metalness, roughness });
  // 装甲は、塗ったプラモのようなつやを出す（上にうすい透明の層）
  const paint = (color: string, metalness: number, roughness: number) =>
    new THREE.MeshPhysicalMaterial({ color: tame(color), metalness, roughness, clearcoat: 0.3, clearcoatRoughness: 0.45 });
  const M = {
    primary: paint(spec.colors.primary, 0.3, 0.34),
    secondary: paint(spec.colors.secondary, 0.35, 0.3),
    accent: std(spec.colors.accent, 0.9, 0.18),
    joint: std('#1b1e26', 0.7, 0.42),
    steel: std('#cfd6e2', 0.95, 0.14), // 刃

    eye: new THREE.MeshStandardMaterial({
      color: spec.colors.eye,
      emissive: spec.colors.eye,
      emissiveIntensity: 3.4,
      toneMapped: false,
    }),
    glow: new THREE.MeshStandardMaterial({ color: el, emissive: el, emissiveIntensity: 2.4, toneMapped: false }),
  };
  const geos: THREE.BufferGeometry[] = [];
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  // 角を少しだけ丸めた箱（丸めを小さくして、角を立てる）
  const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, r = 0.014) =>
    mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), mat, x, y, z);
  // 上と下で幅の違う四角柱（面取りした装甲・刃・とげ）。wTop=0 で尖る。高さは y 方向
  const prism = (wTop: number, wBot: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const g0 = new THREE.CylinderGeometry(wTop / Math.SQRT2, wBot / Math.SQRT2, h, 4, 1);
    g0.rotateY(Math.PI / 4);
    const g = g0.toNonIndexed();
    g0.dispose();
    g.scale(1, 1, d / Math.max(wTop, wBot, 0.001));
    g.computeVertexNormals();
    return mesh(g, mat, x, y, z);
  };
  const cyl = (rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 16) =>
    mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
  const cone = (r: number, h: number, mat: THREE.Material, seg = 12) => mesh(new THREE.ConeGeometry(r, h, seg), mat);
  const sphere = (r: number, mat: THREE.Material, x = 0, y = 0, z = 0) =>
    mesh(new THREE.SphereGeometry(r, 24, 16), mat, x, y, z);
  const group = (x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    return g;
  };
  const pivot = (parent: THREE.Object3D, x: number, y: number, z: number, rx: number, ry: number, rz: number) => {
    const g = group(x, y, z);
    g.rotation.set(rx, ry, rz);
    parent.add(g);
    return g;
  };
  // 折れ線で囲んだ形（x, y の組）。左右を反転するときは sx = -1
  const poly = (pts: [number, number][], sx = 1) => {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0] * sx, pts[0][1]);
    for (const [x, y] of pts.slice(1)) s.lineTo(x * sx, y);
    s.closePath();
    return s;
  };
  // 平らな形に厚みを付けた板（肩の装甲・腰のよろい・盾・とさか・足の先）。
  // 形は xy、厚みは z（真ん中が 0）。bend を付けると、ふちが −z へ反る（板が +z へふくらむ）
  const slab = (shape: THREE.Shape, depth: number, mat: THREE.Material, bend = 0, bevel = 0.006) => {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: bevel > 0,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 1,
      curveSegments: 12,
    });
    g.translate(0, 0, -depth / 2);
    if (bend) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - bend * p.getX(i) * p.getX(i));
    }
    g.computeVertexNormals();
    return mesh(g, mat);
  };
  const W = spec.parts.body === 'slim' ? 0.88 : spec.parts.body === 'heavy' ? 1.14 : 1;
  const B = proportionsOf(spec);
  const extraMats: THREE.Material[] = [];
  return { spec, M, geos, extraMats, mesh, box, prism, cyl, cone, sphere, group, pivot, poly, slab, W, B };
}

// ── 体の比率（ロボごとに少しずつちがう） ──
// 設計図から決まった乱数で決める。同じ写真なら設計図も同じなので、いつも同じ体つきになる
// （ふたりで対戦でも、相手のスマホで同じ体つきに見える）。強さには関係しない
export function proportionsOf(spec: CharacterSpec) {
  const r = rngFrom(`body|${spec.name}|${spec.motif}|${spec.colors.primary}|${spec.colors.secondary}|${Object.values(spec.parts).join(',')}`);
  const span = (lo: number, hi: number) => lo + (hi - lo) * r();
  return {
    leg: span(0.85, 1.17), // 脚の長さ
    shoulder: span(0.85, 1.2), // 肩はば
    head: span(0.85, 1.12), // 頭の大きさ
    arm: span(0.92, 1.1), // 腕の長さ
    skirt: span(0.72, 1.3), // 腰のよろいの長さ
    waist: span(0.78, 1.2), // 腰の細さ
  };
}
type Kit = ReturnType<typeof makeKit>;

// ── 頭の飾り（どの体の形でも使う）。top＝頭のてっぺん、front＝顔の前の面、sc＝大きさ ──
function addOrnament(k: Kit, parent: THREE.Object3D, type: HeadType, top: number, front: number, sc = 1) {
  const { M, box, prism, cyl, cone, sphere, pivot } = k;
  switch (type) {
    case 'vfin': {
      parent.add(sphere(0.03 * sc, M.glow, 0, top - 0.09 * sc, front));
      for (const s of [1, -1]) {
        const p = pivot(parent, 0.02 * s, top - 0.09 * sc, front - 0.01, 0, 0, -0.9 * s);
        p.add(prism(0, 0.055 * sc, 0.42 * sc, 0.02 * sc, M.accent, 0, 0.21 * sc, 0));
      }
      break;
    }
    case 'horns':
      for (const s of [1, -1]) {
        const p = pivot(parent, 0.11 * s * sc, top - 0.02, front * 0.2, -0.55, 0, -0.38 * s);
        const c = cone(0.045 * sc, 0.38 * sc, M.accent, 8);
        c.position.y = 0.19 * sc;
        p.add(c);
      }
      break;
    case 'mono': {
      const p = pivot(parent, 0.12 * sc, top, -0.05 * sc, -0.35, 0, -0.18);
      const rod = cyl(0.01 * sc, 0.01 * sc, 0.34 * sc, M.accent, 0, 0.17 * sc, 0, 6);
      p.add(rod);
      p.add(sphere(0.02 * sc, M.glow, 0, 0.34 * sc, 0));
      break;
    }
    case 'crest': {
      const f = prism(0.05 * sc, 0.05 * sc, 0.12 * sc, 0.46 * sc, M.accent, 0, top + 0.05 * sc, -0.04 * sc);
      parent.add(f);
      const p = pivot(parent, 0, top + 0.02, front - 0.02, 0.9, 0, 0);
      p.add(prism(0, 0.05 * sc, 0.2 * sc, 0.03 * sc, M.accent, 0, 0.1 * sc, 0));
      parent.add(box(0.02 * sc, 0.02 * sc, 0.4 * sc, M.glow, 0, top + 0.11 * sc, -0.04 * sc, 0.006));
      break;
    }
    case 'ears':
      for (const s of [1, -1]) {
        const p = pivot(parent, 0.12 * s * sc, top - 0.03, 0, -0.12, 0, -0.22 * s);
        p.add(prism(0, 0.15 * sc, 0.3 * sc, 0.07 * sc, M.secondary, 0, 0.15 * sc, 0));
        p.add(prism(0, 0.07 * sc, 0.2 * sc, 0.075 * sc, M.glow, 0, 0.12 * sc, 0.004));
      }
      break;
    case 'crown':
      for (let i = -2; i <= 2; i++) {
        const h = (i === 0 ? 0.24 : Math.abs(i) === 1 ? 0.17 : 0.12) * sc;
        parent.add(prism(0, 0.06 * sc, h, 0.04 * sc, M.accent, i * 0.075 * sc, top + h / 2 - 0.02, front - 0.02 - Math.abs(i) * 0.03 * sc));
      }
      parent.add(box(0.38 * sc, 0.035 * sc, 0.04 * sc, M.accent, 0, top - 0.02, front - 0.02, 0.008));
      break;
  }
}

// 目（mono は一つ目、ほかは吊り上がった二つのスリット）
function addEyes(k: Kit, parent: THREE.Object3D, type: HeadType, y: number, z: number, sc = 1) {
  const { M, box } = k;
  parent.add(box(0.3 * sc, 0.075 * sc, 0.03, M.joint, 0, y, z - 0.012, 0.01));
  if (type === 'mono') {
    parent.add(box(0.055 * sc, 0.04 * sc, 0.02, M.eye, 0.04 * sc, y, z + 0.004, 0.008));
    return;
  }
  for (const s of [1, -1]) {
    const e = box(0.105 * sc, 0.028 * sc, 0.02, M.eye, 0.072 * s * sc, y, z + 0.004, 0.006);
    e.rotation.z = 0.24 * s;
    parent.add(e);
  }
}

// ── 人型の頭（細い顔と、後ろへ流れる長いとさかの兜）。原点は首の付け根 ──
function buildHelmet(k: Kit, type: HeadType) {
  const { M, box, prism, cyl, group, pivot, poly, slab } = k;
  const head = group();
  head.add(cyl(0.045, 0.055, 0.1, M.joint, 0, 0.04, 0));
  // 頭の殻（前が細く、後ろが広い）
  head.add(box(0.24, 0.2, 0.28, M.primary, 0, 0.19, -0.03, 0.03));
  head.add(prism(0.12, 0.24, 0.09, 0.28, M.primary, 0, 0.33, -0.03));
  // 細いあごと、とがった口もと
  head.add(prism(0.11, 0.025, 0.11, 0.08, M.primary, 0, 0.075, 0.08));
  // 目の上へ、前にとがって張り出す ひさし
  const visor = slab(poly([[-0.13, -0.02], [0.13, -0.02], [0.05, 0.08], [0, 0.17], [-0.05, 0.08]]), 0.03, M.secondary);
  visor.rotation.x = Math.PI / 2 - 0.25;
  visor.position.set(0, 0.255, 0.04);
  head.add(visor);
  // 顔の横をおおう、前へとがったほおあて
  for (const s of [1, -1]) {
    const cheek = slab(poly([[0, 0.1], [0.08, 0.06], [0.16, -0.08], [-0.02, -0.06]], s), 0.025, M.secondary);
    cheek.rotation.y = (-Math.PI / 2) * s;
    cheek.position.set(0.125 * s, 0.17, 0.02);
    head.add(cheek);
    head.add(box(0.008, 0.008, 0.16, M.glow, 0.14 * s, 0.2, -0.02, 0.003));
  }
  // 後ろへ長く流れるとさか（真ん中と左右）
  const tail = pivot(head, 0, 0.33, -0.1, -1.3, 0, 0);
  const fin = slab(poly([[-0.07, 0], [0.05, 0], [0.02, 0.2], [-0.01, 0.46]]), 0.024, M.primary);
  fin.rotation.y = Math.PI / 2;
  tail.add(fin);
  for (const s of [1, -1]) {
    const t = pivot(head, 0.1 * s, 0.25, -0.15, -1.75, 0, -0.35 * s);
    t.add(slab(poly([[-0.03, 0], [0.03, 0], [0, 0.32]]), 0.02, M.accent));
  }
  addEyes(k, head, type, 0.2, 0.115, 0.72);
  addOrnament(k, head, type, 0.36, 0.11, 0.85);
  return head;
}

// ── 手に持つ武器（人型・浮遊型）。H＝右手、L＝左手、shieldOn＝盾を付ける所 ──
// 武器は手から +z へのびる。剣は細く長く、盾は下がとがった大きな涙形
function attachHandWeapon(k: Kit, H: THREE.Group, L: THREE.Group, shieldOn: THREE.Group, shieldY: number) {
  const { M, box, prism, cyl, sphere, group, poly, slab } = k;
  let tip: THREE.Object3D = H;
  let muzzle: THREE.Object3D = H;
  // 細身の剣（len＝刃の長さ）。刃のはばは上下（y）、厚みは左右（x）
  const sword = (len: number) => {
    H.add(cyl(0.018, 0.018, 0.16, M.joint).rotateX(Math.PI / 2));
    H.add(sphere(0.026, M.accent, 0, 0, -0.09));
    const guard = slab(poly([[-0.03, 0.03], [-0.15, 0.06], [-0.05, -0.01], [0.05, -0.01], [0.15, 0.06], [0.03, 0.03]]), 0.03, M.accent);
    guard.rotation.z = Math.PI / 2;
    guard.position.z = 0.1;
    H.add(guard);
    H.add(box(0.022, 0.064, len, M.steel, 0, 0, 0.12 + len / 2, 0.005));
    H.add(box(0.026, 0.01, len - 0.04, M.glow, 0, 0.026, 0.12 + len / 2, 0.003));
    const p = prism(0, 0.022, 0.16, 0.064, M.steel, 0, 0, 0.12 + len + 0.08);
    p.rotation.x = Math.PI / 2;
    H.add(p);
    const t = group(0, 0, 0.12 + len + 0.1);
    H.add(t);
    return t;
  };
  switch (k.spec.parts.weapon) {
    case 'sword':
      tip = sword(1.1);
      break;
    case 'lance': {
      // 細く長い槍（柄は手の後ろまでのびる）
      H.add(cyl(0.02, 0.02, 1.75, M.secondary, 0, 0, 0.45, 8).rotateX(Math.PI / 2));
      H.add(cyl(0.03, 0.02, 0.08, M.accent, 0, 0, -0.44, 8).rotateX(Math.PI / 2));
      H.add(cyl(0.045, 0.03, 0.08, M.accent, 0, 0, 1.33, 6).rotateX(Math.PI / 2));
      const head = prism(0, 0.03, 0.46, 0.1, M.steel, 0, 0, 1.6);
      head.rotation.x = Math.PI / 2;
      H.add(head);
      for (const s of [1, -1]) {
        const prong = slab(poly([[0, 0], [0.07 * s, 0.02], [0.03 * s, 0.14]]), 0.02, M.accent);
        prong.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        prong.position.z = 1.36;
        H.add(prong);
      }
      H.add(box(0.034, 0.012, 0.36, M.glow, 0, 0, 1.58, 0.003));
      tip = group(0, 0, 1.8);
      H.add(tip);
      break;
    }
    case 'rifle':
      H.add(box(0.08, 0.13, 0.56, M.secondary, 0, 0.05, 0.16));
      H.add(box(0.045, 0.045, 0.72, M.primary, 0, 0.08, 0.76));
      H.add(cyl(0.03, 0.026, 0.14, M.accent, 0, 0.08, 1.16).rotateX(Math.PI / 2));
      H.add(box(0.045, 0.06, 0.22, M.joint, 0, 0.17, 0.12));
      H.add(box(0.03, 0.16, 0.06, M.joint, 0, -0.06, 0.02));
      H.add(box(0.01, 0.025, 0.5, M.glow, 0.045, 0.05, 0.2, 0.003));
      muzzle = group(0, 0.08, 1.24);
      H.add(muzzle);
      tip = muzzle;
      break;
    case 'hammer':
      H.add(cyl(0.022, 0.022, 0.95, M.joint, 0, 0, 0.34).rotateX(Math.PI / 2));
      H.add(box(0.32, 0.22, 0.24, M.primary, 0, 0, 0.84, 0.02));
      H.add(prism(0.1, 0.24, 0.14, 0.22, M.accent, 0.22, 0, 0.84).rotateZ(-Math.PI / 2));
      {
        const sp = prism(0, 0.1, 0.24, 0.04, M.steel, -0.26, 0, 0.84);
        sp.rotation.z = Math.PI / 2;
        H.add(sp);
      }
      H.add(box(0.34, 0.035, 0.26, M.glow, 0, 0, 0.84, 0.008));
      tip = group(0, 0, 0.84);
      H.add(tip);
      break;
    case 'shield': {
      // 下がとがった、大きな涙形の盾（金のふち・ななめの色の線・まん中の紋）。右手には短い剣
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.48);
      shape.quadraticCurveTo(0.29, 0.48, 0.26, 0.05);
      shape.quadraticCurveTo(0.21, -0.3, 0, -0.56);
      shape.quadraticCurveTo(-0.21, -0.3, -0.26, 0.05);
      shape.quadraticCurveTo(-0.29, 0.48, 0, 0.48);
      // 腕を曲げて立つときに、盾がまっすぐ立つように、少し起こして付ける
      const mount = k.pivot(shieldOn, 0, shieldY, 0.03, 0.75, 0, 0);
      const put = (m: THREE.Mesh, off: number) => {
        m.rotation.y = Math.PI / 2;
        m.position.set(0.11 + off, 0, 0);
        mount.add(m);
      };
      const rim = slab(shape, 0.03, M.accent, 1.0);
      rim.scale.set(1.07, 1.05, 1);
      put(rim, -0.006);
      put(slab(shape, 0.04, M.primary, 1.0), 0);
      put(slab(poly([[-0.05, 0.44], [0.03, 0.44], [0.1, 0.0], [0.03, -0.46], [-0.02, -0.1]]), 0.012, M.secondary, 1.0), 0.026);
      const mark = cyl(0.065, 0.065, 0.02, M.accent, 0.15, 0.12, 0, 6);
      mark.rotation.z = Math.PI / 2;
      mount.add(mark);
      mount.add(sphere(0.03, M.glow, 0.16, 0.12, 0));
      tip = sword(0.62);
      break;
    }
    case 'claw':
      for (const h of [L, H]) {
        for (let i = -1; i <= 1; i++) {
          const c = prism(0, 0.035, 0.26, 0.02, M.glow, i * 0.04, -0.15, 0.04);
          c.rotation.x = Math.PI;
          h.add(c);
        }
      }
      break;
    case 'none':
      H.add(box(0.13, 0.05, 0.13, M.accent, 0, 0.06, 0, 0.01));
      L.add(box(0.13, 0.05, 0.13, M.accent, 0, 0.06, 0, 0.01));
      break;
  }
  return { tip, muzzle };
}

// ── 背中の装備（原点は背中の真ん中。後ろが −z） ──
function buildBack(k: Kit, back: THREE.Group, form: Form) {
  const { M, box, prism, cyl, pivot, poly, slab } = k;
  switch (k.spec.parts.back) {
    case 'wings':
      // 外へ大きく開く、刃のような翼（上・横・下へ三枚ずつ）
      for (const s of [1, -1]) {
        const root = pivot(back, 0.1 * s, 0.05, -0.04, -0.35, 0, 0);
        root.add(box(0.1, 0.14, 0.08, M.joint));
        [[0.55, 0.85], [1.25, 0.68], [2.0, 0.5]].forEach(([a, len], i) => {
          const f = pivot(root, 0, 0, -0.02 * i, 0, 0, -a * s);
          f.add(slab(poly([[-0.045, 0], [0.05, 0], [0.06, len * 0.62], [0, len], [-0.03, len * 0.7]], s), 0.024, i === 1 ? M.secondary : M.primary));
          f.add(slab(poly([[-0.012, 0.05], [0.012, 0.05], [0.006, len * 0.8], [-0.006, len * 0.8]]), 0.03, M.glow, 0, 0.002));
          f.add(prism(0, 0.03, 0.07, 0.03, M.accent, 0, len + 0.01, 0));
        });
      }
      break;
    case 'boosters':
      back.add(box(0.3, 0.26, 0.12, M.secondary));
      for (const s of [1, -1]) {
        const b = prism(0.08, 0.13, 0.46, 0.13, M.primary, 0.13 * s, -0.12, -0.12);
        b.rotation.x = -0.35;
        back.add(b);
        const n = cyl(0.055, 0.055, 0.02, M.glow, 0.13 * s, -0.35, -0.21);
        n.rotation.x = -0.35;
        back.add(n);
        const fin = pivot(back, 0.2 * s, 0.05, -0.1, -0.6, 0, -0.5 * s);
        fin.add(slab(poly([[-0.04, 0], [0.04, 0], [0, 0.34]]), 0.02, M.accent));
      }
      break;
    case 'cannons':
      back.add(box(0.3, 0.26, 0.12, M.secondary));
      for (const s of [1, -1]) {
        const c = box(0.08, 0.08, 0.95, M.primary, 0.22 * s, 0.32, 0.14, 0.01);
        c.rotation.x = -0.15;
        back.add(c);
        back.add(box(0.14, 0.14, 0.26, M.joint, 0.22 * s, 0.26, -0.08, 0.01));
        const m = box(0.045, 0.045, 0.02, M.glow, 0.22 * s, 0.39, 0.62, 0.006);
        m.rotation.x = -0.15;
        back.add(m);
      }
      break;
    case 'cape':
      if (form === 'beast') {
        // 獣型はマントの代わりに、背骨に沿った刃のたてがみ
        for (let i = 0; i < 5; i++) {
          const f = prism(0, 0.16, 0.26 - i * 0.03, 0.03, i % 2 ? M.accent : M.secondary, 0, 0.1, 0.3 - i * 0.17);
          f.rotation.x = -0.6;
          back.add(f);
        }
      } else {
        // すそが三つにとがった、長いマント（後ろへふくらむ）
        const cape = slab(
          poly([[-0.26, 0.04], [0.26, 0.04], [0.36, -0.9], [0.14, -1.06], [0, -0.94], [-0.14, -1.06], [-0.36, -0.9]]),
          0.024, M.secondary, -0.7,
        );
        cape.position.set(0, 0.02, -0.03);
        cape.rotation.x = 0.12;
        back.add(cape);
        back.add(box(0.6, 0.05, 0.06, M.accent, 0, 0.06, 0.01, 0.01));
      }
      break;
    case 'none':
      back.add(box(0.3, 0.26, 0.12, M.secondary));
      back.add(box(0.18, 0.03, 0.02, M.glow, 0, -0.06, -0.065, 0.006));
      break;
  }
}

// ── 人型：騎士のような、すらりとした体。高くはね上がる肩の装甲・細い腰・長い腰のよろい・つま先のとがった足 ──
function buildHumanoid(k: Kit, body: THREE.Group) {
  const { M, box, prism, cyl, sphere, group, pivot, poly, slab, W, B } = k;
  const P = k.spec.parts;
  // 腰の高さは、脚の長さで決まる（足の先が床に付くように）
  const hips = group(0, 0.18 + 0.96 * B.leg, 0);
  body.add(hips);
  hips.add(prism(0.3 * W, 0.14 * W, 0.16, 0.22, M.secondary, 0, -0.02, 0));
  // 前のたれ（とがった小さな板）
  const fr = slab(poly([[-0.07, 0], [0.07, 0], [0.045, -0.13], [0, -0.2], [-0.045, -0.13]]), 0.025, M.primary, 1.5);
  fr.position.set(0, 0.04, 0.12);
  fr.rotation.x = -0.12;
  hips.add(fr);
  // 横の長いよろい（すそが外へ開く）。外がわへふくらませ、まん中に色の線
  for (const s of [1, -1]) {
    const side = pivot(hips, 0.15 * W * s, 0.04, 0, 0, 0, 0.3 * s);
    const plate = slab(poly([[-0.11, 0.02], [0.08, 0.02], [0.1, -0.26], [0.02, -0.5], [-0.09, -0.36]], -s), 0.026, M.primary, 1.0);
    plate.rotation.y = (Math.PI / 2) * s;
    side.add(plate);
    const line = slab(poly([[-0.03, 0], [0.02, 0], [0.04, -0.28], [0.015, -0.42], [-0.02, -0.3]], -s), 0.01, M.secondary);
    line.rotation.y = (Math.PI / 2) * s;
    line.position.x = 0.02 * s;
    side.add(line);
    side.scale.y = B.skirt;
  }
  // 後ろのよろい（後ろへふくらむ）
  const rear = slab(poly([[-0.14, 0.02], [0.14, 0.02], [0.11, -0.28], [0, -0.38], [-0.11, -0.28]]), 0.026, M.primary, -1.0);
  rear.position.set(0, 0.03, -0.13);
  rear.rotation.x = 0.22;
  rear.scale.y = B.skirt;
  hips.add(rear);

  const torso = group(0, 0.06, 0);
  hips.add(torso);
  // 細い腰（黒い骨組みが見える）
  const waist = W * B.waist;
  torso.add(cyl(0.07 * waist, 0.09 * waist, 0.24, M.joint, 0, 0.12, 0, 10));
  for (const y of [0.06, 0.13]) torso.add(cyl(0.095 * waist, 0.095 * waist, 0.022, M.secondary, 0, y, 0, 10));
  torso.add(prism(0.2 * W, 0.12 * W, 0.1, 0.17, M.primary, 0, 0.22, 0.02));
  // 胸：上が広い逆三角
  const SW = W * B.shoulder; // 肩はば
  torso.add(prism(0.58 * SW, 0.26 * W, 0.32, 0.32, M.primary, 0, 0.42, 0));
  // 胸の前の V 字の板と、光るコア
  const chest = slab(poly([[-0.23, 0.1], [0.23, 0.1], [0.15, -0.03], [0, -0.13], [-0.15, -0.03]]), 0.04, M.secondary, 1.2);
  chest.scale.x = SW;
  chest.position.set(0, 0.47, 0.14);
  chest.rotation.x = -0.1;
  torso.add(chest);
  const core = sphere(0.045, M.glow, 0, 0.43, 0.175);
  torso.add(core);
  // 首のまわりの、高いえり
  for (const s of [1, -1]) {
    const c = prism(0.02, 0.12, 0.15, 0.18, M.secondary, 0.11 * W * s, 0.62, -0.03);
    c.rotation.z = -0.35 * s;
    torso.add(c);
  }
  if (P.body === 'heavy') torso.add(box(0.62 * W, 0.08, 0.36, M.secondary, 0, 0.3, 0, 0.012));

  const head = buildHelmet(k, P.head);
  head.position.set(0, 0.6, 0.01);
  head.scale.setScalar(B.head);
  torso.add(head);

  const makeArm = (s: 1 | -1) => {
    const arm = group(0.34 * SW * s, 0.5, 0);
    const A = B.arm;
    torso.add(arm);
    const heavyArm = P.arms === 'heavy';
    const big = heavyArm ? 1.2 : 1;
    arm.add(sphere(0.075, M.joint));
    // 肩の装甲：上の小さな殻・横をおおう大きな反った板（下がとがる）・上へはね上がる刃の形
    const cap = prism(0.12 * big, 0.22 * big, 0.12, 0.22 * big, M.primary, 0.04 * s, 0.08, 0);
    cap.rotation.z = -0.35 * s;
    arm.add(cap);
    const side = pivot(arm, 0.14 * big * s, 0.1, 0, 0, 0, 0.18 * s);
    const sideShape = poly([[-0.15, 0.04], [0.15, 0.04], [0.14, -0.16], [0.03, -0.36], [-0.12, -0.2]], -s);
    const plate = slab(sideShape, 0.03, M.primary, 1.6);
    plate.rotation.y = (Math.PI / 2) * s;
    plate.scale.setScalar(big);
    side.add(plate);
    const stripe = slab(poly([[-0.03, 0.02], [0.03, 0.02], [0.045, -0.2], [0.01, -0.3], [-0.02, -0.18]], -s), 0.012, M.secondary, 1.6);
    stripe.rotation.y = (Math.PI / 2) * s;
    stripe.position.x = 0.02 * s;
    stripe.scale.setScalar(big);
    side.add(stripe);
    const flare = pivot(arm, 0.12 * s, 0.12, -0.02, 0, 0, -0.32 * s);
    const blade = slab(poly([[-0.13, 0], [0.1, 0], [0.04, 0.1], [-0.11, 0.38]], -s), 0.026, M.secondary);
    blade.rotation.y = (Math.PI / 2) * s;
    blade.scale.setScalar(big);
    flare.add(blade);
    const edge = slab(poly([[-0.1, 0.02], [-0.05, 0.02], [-0.105, 0.33]], -s), 0.03, M.accent);
    edge.rotation.y = (Math.PI / 2) * s;
    edge.scale.setScalar(big);
    flare.add(edge);
    // 二の腕と、手首が広い籠手
    arm.add(box(0.08, 0.24 * A, 0.09, M.joint, 0.01 * s, -0.17 * A, 0));
    const fore = group(0.01 * s, -0.32 * A, 0);
    arm.add(fore);
    fore.add(sphere(0.055, M.joint));
    fore.add(prism(heavyArm ? 0.14 : 0.1, heavyArm ? 0.2 : 0.15, 0.3 * A, heavyArm ? 0.2 : 0.14, M.primary, 0, -0.17 * A, 0));
    const spike = pivot(fore, 0, 0, -0.04, -1.9, 0, 0);
    spike.add(prism(0, 0.05, 0.14, 0.02, M.accent, 0, 0.07, 0));
    fore.add(box(0.008, 0.18 * A, 0.008, M.glow, 0.065 * s, -0.17 * A, 0.06, 0.003));
    if (P.arms === 'blade') {
      const b = prism(0, 0.07, 0.5, 0.02, M.glow, 0.1 * s, -0.1, -0.05);
      b.rotation.x = 2.7;
      fore.add(b);
    }
    const hand = group(0, -0.35 * A, 0);
    fore.add(hand);
    const fist = P.weapon === 'none' ? 0.12 : 0.09;
    hand.add(box(fist, fist * 0.95, fist, M.joint, 0, 0, 0, 0.012));
    return { arm, fore, hand };
  };
  const L = makeArm(1);
  const R = makeArm(-1);
  const { tip, muzzle } = attachHandWeapon(k, R.hand, L.hand, L.fore, -0.17);

  const makeLeg = (s: 1 | -1) => {
    const leg = group(0.11 * W * s, -0.07, 0);
    hips.add(leg);
    const heavy = P.legs === 'heavy';
    const hv = heavy ? 1.2 : 1;
    const LG = B.leg;
    leg.add(sphere(0.07, M.joint));
    leg.add(prism(0.17 * hv, 0.12 * hv, 0.42 * LG, 0.17 * hv, M.secondary, 0, -0.22 * LG, 0));
    // 前のたれ（太ももといっしょに動く）
    const tas = pivot(leg, 0.015 * s, 0.05, 0.1, -0.12, 0, 0);
    tas.add(slab(poly([[-0.08, 0], [0.08, 0], [0.07, -0.22], [0, -0.32], [-0.07, -0.22]]), 0.024, M.primary, 1.2));
    tas.add(slab(poly([[-0.018, -0.02], [0.018, -0.02], [0.01, -0.24], [-0.01, -0.24]]), 0.012, M.secondary, 0, 0.003).translateZ(0.02));
    tas.scale.y = B.skirt;
    const shin = group(0, -0.44 * LG, 0);
    leg.add(shin);
    shin.add(sphere(0.06, M.joint));
    // ひざ：上へとがった当て
    const knee = slab(poly([[-0.065, -0.07], [0.065, -0.07], [0.03, 0.04], [0, 0.14], [-0.03, 0.04]]), 0.03, M.accent);
    knee.position.set(0, 0, 0.1);
    knee.rotation.x = -0.2;
    shin.add(knee);
    // すね：ふくらはぎが張った長い装甲と、前の線
    shin.add(prism(0.19 * hv, 0.1 * hv, 0.5 * LG, 0.2 * hv, M.primary, 0, -0.27 * LG, -0.01));
    const sl = pivot(shin, 0, -0.07, 0.093 * hv, 0.1, 0, 0);
    sl.scale.y = LG;
    sl.add(slab(poly([[-0.03, 0], [0.03, 0], [0.012, -0.36], [-0.012, -0.36]]), 0.012, M.secondary, 0, 0.003));
    // 足：かかとの高い、つま先のとがった足
    const foot = group(0, -0.52 * LG, 0);
    shin.add(foot);
    foot.add(prism(0.08 * hv, 0.12 * hv, 0.08, 0.14, M.secondary, 0, 0, 0.02));
    const toe = pivot(foot, 0, -0.02, 0.06, 1.95, 0, 0);
    toe.add(prism(0, 0.11 * hv, 0.26, 0.06, M.accent, 0, 0.13, 0));
    const heel = pivot(foot, 0, -0.02, -0.04, -2.8, 0, 0);
    heel.add(prism(0, 0.05, 0.11, 0.05, M.joint, 0, 0.055, 0));
    if (P.legs === 'thruster') {
      shin.add(box(0.12, 0.16, 0.07, M.joint, 0, -0.26 * LG, -0.12, 0.01));
      shin.add(box(0.09, 0.025, 0.02, M.glow, 0, -0.33 * LG, -0.16, 0.006));
      const f = pivot(shin, 0.09 * s, -0.08, -0.06, -0.5, 0, -0.2 * s);
      f.add(slab(poly([[-0.04, 0], [0.04, 0], [0, 0.26]]), 0.02, M.accent));
    }
    return { leg, shin };
  };
  const LL = makeLeg(1);
  const LR = makeLeg(-1);

  const back = group(0, 0.44, -0.17);
  torso.add(back);
  buildBack(k, back, 'humanoid');

  return {
    bones: {
      hips, torso, head,
      armL: L.arm, armR: R.arm, foreL: L.fore, foreR: R.fore,
      legL: LL.leg, legR: LR.leg, shinL: LL.shin, shinR: LR.shin,
    },
    tip, muzzle, core, chestY: hips.position.y + 0.41, spins: [],
  };
}

// ── 四つ足の獣型：しなやかな狼・豹のようなメカ ──
function buildBeast(k: Kit, body: THREE.Group) {
  const { M, box, prism, cyl, sphere, group, pivot, W } = k;
  const P = k.spec.parts;
  const torso = group(0, 0.82, 0);
  body.add(torso);
  torso.add(box(0.38 * W, 0.28, 0.9, M.primary, 0, 0, -0.02, 0.02));
  torso.add(box(0.46 * W, 0.34, 0.26, M.primary, 0, 0.03, 0.34, 0.02));
  torso.add(prism(0.3 * W, 0.44 * W, 0.12, 0.26, M.secondary, 0, 0.24, 0.32));
  torso.add(box(0.2 * W, 0.05, 0.74, M.secondary, 0, 0.16, -0.08, 0.01));
  torso.add(box(0.42 * W, 0.28, 0.28, M.secondary, 0, 0.0, -0.34, 0.02));
  for (const s of [1, -1]) torso.add(box(0.012, 0.012, 0.7, M.glow, (0.19 * W + 0.004) * s, 0.04, -0.04, 0.004));
  if (P.body === 'heavy') torso.add(box(0.5 * W, 0.12, 0.5, M.secondary, 0, -0.14, 0.12, 0.012));
  const core = sphere(0.055, M.glow, 0, 0.0, 0.48);
  torso.add(core);

  // 頭：細長い頭と鼻先、開くあご
  const head = group(0, 0.14, 0.5);
  torso.add(head);
  head.add(box(0.14, 0.14, 0.18, M.joint, 0, 0, -0.02));
  const skull = group(0, 0.08, 0.12);
  head.add(skull);
  skull.add(box(0.28, 0.2, 0.3, M.primary, 0, 0.02, 0, 0.02));
  skull.add(prism(0.12, 0.2, 0.12, 0.34, M.primary, 0, 0.17, 0.0));
  skull.add(box(0.18, 0.1, 0.3, M.secondary, 0, -0.02, 0.26, 0.012));
  skull.add(box(0.07, 0.04, 0.04, M.joint, 0, 0.02, 0.41, 0.008));
  for (const s of [1, -1]) {
    const e = box(0.09, 0.024, 0.02, M.eye, 0.1 * s, 0.07, 0.15, 0.006);
    e.rotation.set(0, 0.45 * s, 0.32 * s);
    skull.add(e);
  }
  if (P.head === 'mono') skull.add(box(0.2, 0.03, 0.02, M.eye, 0, 0.05, 0.16, 0.006));
  addOrnament(k, skull, P.head === 'mono' ? 'crest' : P.head, 0.22, 0.1, 0.8);
  const jaw = group(0, -0.08, 0.1);
  skull.add(jaw);
  jaw.add(box(0.16, 0.05, 0.3, M.joint, 0, 0, 0.13, 0.01));
  if (P.weapon === 'none') {
    for (const s of [1, -1]) {
      jaw.add(prism(0, 0.03, 0.1, 0.03, M.glow, 0.06 * s, 0.05, 0.25));
    }
  }

  // 脚
  const legs: Record<string, { leg: THREE.Group; shin: THREE.Group; paw: THREE.Group }> = {};
  for (const [name, fx, fz] of [['FL', 1, 1], ['FR', -1, 1], ['BL', 1, -1], ['BR', -1, -1]] as const) {
    const front = fz > 0;
    const leg = group(0.21 * W * fx, -0.1, 0.36 * fz);
    torso.add(leg);
    const bigArm = front && P.arms === 'heavy';
    leg.add(box(bigArm ? 0.17 : 0.13, 0.34, bigArm ? 0.21 : 0.17, front ? M.primary : M.secondary, 0.01 * fx, -0.15, 0, 0.012));
    if (front) {
      const sp = prism(0.1, 0.2, 0.16, 0.22, M.primary, 0.05 * fx, 0.02, 0);
      sp.rotation.z = -0.3 * fx;
      leg.add(sp);
    }
    const shin = group(0, -0.33, 0);
    leg.add(shin);
    const heavy = P.legs === 'heavy' || bigArm;
    shin.add(prism(heavy ? 0.15 : 0.12, heavy ? 0.11 : 0.085, 0.34, heavy ? 0.15 : 0.12, M.joint, 0, -0.16, 0));
    shin.add(box(0.012, 0.2, 0.012, M.glow, 0, -0.16, 0.06, 0.004));
    const paw = group(0, -0.36, 0.04);
    shin.add(paw);
    paw.add(box(heavy ? 0.18 : 0.15, 0.06, 0.22, M.secondary, 0, 0, 0, 0.012));
    const toe = prism(0, heavy ? 0.16 : 0.13, 0.1, 0.05, M.accent, 0, 0.0, 0.14);
    toe.rotation.x = Math.PI / 2;
    paw.add(toe);
    if (P.legs === 'thruster') shin.add(box(0.06, 0.12, 0.025, M.glow, 0, -0.12, -0.07, 0.006));
    if (front && P.arms === 'blade') {
      const b = prism(0, 0.06, 0.44, 0.02, M.glow, 0.1 * fx, -0.06, -0.06);
      b.rotation.x = 2.6;
      leg.add(b);
    }
    legs[name] = { leg, shin, paw };
  }

  // しっぽ
  const tail = group(0, 0.06, -0.48);
  torso.add(tail);
  tail.add(box(0.08, 0.08, 0.3, M.primary, 0, 0, -0.14, 0.01));
  const tail2 = group(0, 0, -0.28);
  tail.add(tail2);
  tail2.rotation.x = 0.35;
  tail2.add(box(0.06, 0.06, 0.3, M.secondary, 0, 0, -0.14, 0.008));
  const tt = prism(0, 0.07, 0.18, 0.04, M.glow, 0, 0, -0.36);
  tt.rotation.x = -Math.PI / 2;
  tail2.add(tt);

  const back = group(0, 0.2, 0.0);
  torso.add(back);
  buildBack(k, back, 'beast');

  // 武器は、体の部品に置き換える
  let tip: THREE.Object3D = skull;
  let muzzle: THREE.Object3D = skull;
  switch (P.weapon) {
    case 'sword': {
      const blade = pivot(skull, 0, 0.18, 0.12, -1.05, 0, 0);
      blade.add(prism(0, 0.07, 0.5, 0.025, M.primary, 0, 0.25, 0));
      blade.add(prism(0, 0.03, 0.46, 0.03, M.glow, 0, 0.24, 0.006));
      tip = k.group(0, 0.5, 0);
      blade.add(tip);
      break;
    }
    case 'lance': {
      const horn = prism(0, 0.09, 0.6, 0.09, M.accent, 0, 0.1, 0.62);
      horn.rotation.x = Math.PI / 2 - 0.2;
      skull.add(horn);
      tip = k.group(0, 0.16, 0.92);
      skull.add(tip);
      break;
    }
    case 'rifle': {
      back.add(box(0.18, 0.12, 0.42, M.secondary, 0, 0.12, 0.05, 0.01));
      back.add(box(0.06, 0.06, 0.5, M.joint, 0, 0.15, 0.45, 0.008));
      back.add(box(0.012, 0.025, 0.36, M.glow, 0.095, 0.12, 0.05, 0.004));
      muzzle = k.group(0, 0.15, 0.72);
      back.add(muzzle);
      tip = muzzle;
      break;
    }
    case 'hammer':
      tail2.add(box(0.28, 0.22, 0.22, M.primary, 0, 0, -0.42, 0.02));
      tail2.add(box(0.3, 0.04, 0.24, M.glow, 0, 0, -0.42, 0.008));
      tip = k.group(0, 0, -0.42);
      tail2.add(tip);
      break;
    case 'shield':
      for (const s of [1, -1]) {
        const n = s > 0 ? 'FL' : 'FR';
        const sh = cyl(0.2, 0.2, 0.035, M.secondary, 0.12 * s, -0.08, 0, 6);
        sh.rotation.z = Math.PI / 2;
        legs[n].leg.add(sh);
        legs[n].leg.add(sphere(0.035, M.glow, 0.145 * s, -0.08, 0));
      }
      break;
    case 'claw':
      for (const n of ['FL', 'FR']) {
        for (let i = -1; i <= 1; i++) {
          const c = prism(0, 0.03, 0.18, 0.02, M.glow, i * 0.05, 0, 0.2);
          c.rotation.x = Math.PI / 2;
          legs[n].paw.add(c);
        }
      }
      tip = legs.FR.paw;
      break;
    case 'none':
      tip = jaw;
      break;
  }

  return {
    bones: {
      torso, head, jaw, tail,
      legFL: legs.FL.leg, legFR: legs.FR.leg, legBL: legs.BL.leg, legBR: legs.BR.leg,
      shinFL: legs.FL.shin, shinFR: legs.FR.shin, shinBL: legs.BL.shin, shinBR: legs.BR.shin,
    },
    tip, muzzle, core, chestY: 0.85, spins: [],
  };
}

// ── 浮遊型：装甲に包まれた光る核が浮かび、両手の籠手がまわりに浮かぶ ──
function buildFloater(k: Kit, body: THREE.Group) {
  const { M, box, prism, sphere, group, mesh, pivot } = k;
  const P = k.spec.parts;
  const coreG = group(0, 1.3, 0);
  coreG.scale.setScalar(1.3); // 人型と並んでも見劣りしない大きさに
  body.add(coreG);
  const R0 = P.body === 'heavy' ? 0.34 : P.body === 'slim' ? 0.27 : 0.3;
  // 上の殻と下の殻。すき間から核の光が見える
  const top = mesh(new THREE.SphereGeometry(R0, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), M.primary, 0, 0.03, 0);
  coreG.add(top);
  const bottom = mesh(new THREE.SphereGeometry(R0 * 0.94, 28, 14, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.42), M.secondary, 0, -0.03, 0);
  coreG.add(bottom);
  coreG.add(sphere(R0 * 0.8, M.joint));
  const band = mesh(new THREE.TorusGeometry(R0 * 0.86, 0.018, 8, 48), M.glow);
  band.rotation.x = Math.PI / 2;
  coreG.add(band);
  addEyes(k, coreG, P.head, 0.1, R0 * 0.93, 0.85);
  addOrnament(k, coreG, P.head, R0 + 0.02, R0 * 0.55, 0.85);
  // 横のひれ
  for (const s of [1, -1]) {
    const f = pivot(coreG, R0 * 0.95 * s, 0, -0.04, 0, 0, -1.2 * s);
    f.add(prism(0, 0.16, 0.34, 0.03, M.accent, 0, 0.17, 0));
  }
  const core = sphere(0.05, M.glow, 0, -0.08, R0 * 0.92);
  coreG.add(core);
  const jet = prism(0.05, 0.12, 0.14, 0.12, M.joint, 0, -R0 - 0.02, 0);
  coreG.add(jet);
  coreG.add(prism(0.02, 0.08, 0.1, 0.08, M.glow, 0, -R0 - 0.11, 0));
  if (P.legs === 'thruster') {
    for (const s of [1, -1]) {
      const t = prism(0, 0.1, 0.3, 0.03, M.accent, 0.14 * s, -R0 - 0.08, -0.04);
      t.rotation.z = Math.PI + 0.35 * s;
      coreG.add(t);
    }
  }

  // まわりを回る輪
  const ringPivot = group(0, -0.05, 0);
  ringPivot.rotation.x = Math.PI / 2 - 0.35;
  coreG.add(ringPivot);
  const ringMat = new THREE.MeshStandardMaterial({ color: M.glow.color, emissive: M.glow.color, emissiveIntensity: 1.0, toneMapped: false });
  k.extraMats.push(ringMat);
  const ring = mesh(new THREE.TorusGeometry(R0 + 0.3, 0.012, 6, 72), ringMat);
  ringPivot.add(ring);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const b = prism(0, 0.06, 0.1, 0.03, M.accent, Math.cos(a) * (R0 + 0.3), Math.sin(a) * (R0 + 0.3), 0);
    b.rotation.z = a - Math.PI / 2;
    ring.add(b);
  }

  // 浮かぶ籠手（支点を体の中心に置き、回して動かす）
  const makeHand = (s: 1 | -1) => {
    const pv = group(0, -0.05, 0);
    coreG.add(pv);
    const hand = group((R0 + 0.32) * s, -0.3, 0.08);
    hand.rotation.x = -0.55; // 武器が斜め上を向くように
    pv.add(hand);
    const heavy = P.arms === 'heavy';
    hand.add(prism(heavy ? 0.22 : 0.17, heavy ? 0.28 : 0.22, 0.26, heavy ? 0.26 : 0.2, M.primary, 0, 0.1, 0));
    hand.add(box(0.12, 0.1, 0.12, M.joint, 0, -0.04, 0, 0.012));
    hand.add(box(0.012, 0.18, 0.012, M.glow, 0.06 * s, 0.1, 0.1, 0.004));
    const fin = prism(0, 0.1, 0.24, 0.025, M.accent, 0.13 * s, 0.18, -0.04);
    fin.rotation.z = -0.4 * s;
    hand.add(fin);
    if (P.arms === 'blade') {
      const b = prism(0, 0.06, 0.44, 0.02, M.glow, 0.12 * s, 0.05, -0.08);
      b.rotation.x = 2.7;
      hand.add(b);
    }
    return { pivot: pv, hand };
  };
  const L = makeHand(1);
  const R = makeHand(-1);
  const { tip, muzzle } = attachHandWeapon(k, R.hand, L.hand, L.hand, 0);

  const back = group(0, 0.05, -R0 - 0.08);
  coreG.add(back);
  buildBack(k, back, 'floater');

  return {
    bones: { core: coreG, handL: L.pivot, handR: R.pivot },
    tip, muzzle, core, chestY: 1.3, spins: [{ obj: ring, speed: 1.1 }],
  };
}

export function buildRobot(spec: CharacterSpec): Robot {
  const k = makeKit(spec);
  const form: Form = spec.form ?? 'humanoid';
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const built = form === 'beast' ? buildBeast(k, body) : form === 'floater' ? buildFloater(k, body) : buildHumanoid(k, body);
  const M = k.M;
  const flashMats = [M.primary, M.secondary, M.accent, M.joint];
  return {
    spec,
    form,
    root,
    body,
    bones: built.bones as Record<string, THREE.Group>,
    tip: built.tip,
    muzzle: built.muzzle,
    core: built.core,
    chestY: built.chestY,
    spins: built.spins,
    setFlash(v: number) {
      for (const m of flashMats) {
        m.emissive.setRGB(1, 1, 1);
        m.emissiveIntensity = v * 0.45;
      }
    },
    setEyes(v: number) {
      M.eye.emissiveIntensity = 3.4 * v;
      M.glow.emissiveIntensity = 2.4 * v;
    },
    dispose() {
      k.geos.forEach((g) => g.dispose());
      Object.values(M).forEach((m) => m.dispose());
      k.extraMats.forEach((m) => m.dispose());
    },
  };
}

// ── ポーズ（体の形ごと） ──
const HUMANOID: Record<PoseName, Pose> = {
  idle: {
    armL: [-0.35, 0, 0.28], foreL: [-0.95, 0, 0], armR: [-0.45, 0, -0.22], foreR: [-0.75, 0, 0],
    legL: [-0.18, 0, 0.06], shinL: [0.32, 0, 0], legR: [0.14, 0, -0.06], shinR: [0.16, 0, 0],
  },
  windup: {
    torso: [0, -0.5, 0], armR: [-2.8, 0, -0.35], foreR: [-0.35, 0, 0], armL: [-0.7, 0, 0.45], foreL: [-1.0, 0, 0],
    legL: [-0.35, 0, 0.08], shinL: [0.5, 0, 0], legR: [0.3, 0, -0.08], shinR: [0.25, 0, 0],
  },
  slash: {
    torso: [0.25, 0.55, 0], head: [0.1, -0.2, 0], armR: [-0.35, 0, 0.25], foreR: [-0.1, 0, 0],
    armL: [-0.2, 0, 0.6], foreL: [-0.6, 0, 0],
    legL: [-0.65, 0, 0.05], shinL: [0.6, 0, 0], legR: [0.45, 0, -0.05], shinR: [0.2, 0, 0],
  },
  pullback: {
    torso: [0, -0.45, 0], armR: [-0.9, 0, -0.3], foreR: [-1.9, 0, 0], armL: [-1.1, 0, 0.2], foreL: [-0.6, 0, 0],
    legL: [-0.3, 0, 0.06], shinL: [0.45, 0, 0], legR: [0.25, 0, -0.06], shinR: [0.2, 0, 0],
  },
  thrust: {
    torso: [0.15, 0.45, 0], armR: [-1.6, 0, 0.05], foreR: [-0.05, 0, 0], armL: [-0.3, 0, 0.5], foreL: [-1.2, 0, 0],
    legL: [-0.7, 0, 0.05], shinL: [0.55, 0, 0], legR: [0.5, 0, -0.05], shinR: [0.2, 0, 0],
  },
  aim: {
    torso: [0, 0.1, 0], head: [0.08, 0.05, 0], armR: [-1.57, 0, 0.05], foreR: [0, 0, 0],
    armL: [-1.35, 0, -0.45], foreL: [-0.55, 0, 0],
    legL: [-0.25, 0, 0.1], shinL: [0.35, 0, 0], legR: [0.2, 0, -0.1], shinR: [0.2, 0, 0],
  },
  guard: {
    torso: [0.25, 0, 0], head: [0.25, 0, 0], armL: [-1.25, 0, -0.55], foreL: [-1.6, 0, 0],
    armR: [-1.25, 0, 0.55], foreR: [-1.6, 0, 0],
    legL: [-0.45, 0, 0.12], shinL: [0.75, 0, 0], legR: [0.15, 0, -0.12], shinR: [0.5, 0, 0],
  },
  hit: {
    torso: [-0.45, 0.1, 0], head: [-0.35, 0, 0], armL: [-0.1, 0, 0.75], foreL: [-0.4, 0, 0],
    armR: [-0.1, 0, -0.75], foreR: [-0.4, 0, 0], legL: [0.2, 0, 0.1], legR: [-0.15, 0, -0.1], shinR: [0.3, 0, 0],
  },
  cast: {
    head: [-0.35, 0, 0], torso: [-0.12, 0, 0], armL: [-2.7, 0, 0.45], foreL: [-0.3, 0, 0],
    armR: [-2.7, 0, -0.45], foreR: [-0.3, 0, 0], legL: [0, 0, 0.18], legR: [0, 0, -0.18],
  },
  charge: {
    torso: [-0.18, 0, 0], head: [-0.12, 0, 0], armL: [-0.5, 0, 1.25], foreL: [-0.8, 0, 0],
    armR: [-0.5, 0, -1.25], foreR: [-0.8, 0, 0],
    legL: [-0.1, 0, 0.28], shinL: [0.3, 0, 0], legR: [0.1, 0, -0.28], shinR: [0.3, 0, 0],
  },
  uppercut: {
    torso: [-0.3, 0.5, 0], head: [-0.3, 0, 0], armR: [-3.0, 0, 0.1], foreR: [-0.1, 0, 0],
    armL: [-0.2, 0, 0.6], foreL: [-1.0, 0, 0], legL: [-0.5, 0, 0], shinL: [0.2, 0, 0], legR: [0.4, 0, 0], shinR: [0.6, 0, 0],
  },
  victory: {
    head: [-0.2, 0, 0], torso: [-0.05, 0, 0], armR: [-3.0, 0, -0.15], foreR: [0, 0, 0],
    armL: [-0.2, 0, 0.35], foreL: [-1.4, 0, 0], legL: [0, 0, 0.12], legR: [0, 0, -0.12],
  },
};

// 獣型：脚の x を負にすると前へ、胴の x を負にすると前が持ち上がる
const BEAST: Record<PoseName, Pose> = {
  idle: {
    head: [0.08, 0, 0], tail: [0.35, 0, 0],
    legFL: [-0.12, 0, 0], shinFL: [0.15, 0, 0], legFR: [0.05, 0, 0],
    legBL: [0.1, 0, 0], shinBL: [-0.1, 0, 0], legBR: [-0.08, 0, 0],
  },
  windup: {
    torso: [0.18, 0, 0], head: [-0.35, 0, 0], jaw: [0.25, 0, 0], tail: [0.8, 0, 0],
    legFL: [-0.5, 0, 0], shinFL: [0.9, 0, 0], legFR: [-0.4, 0, 0], shinFR: [0.8, 0, 0],
    legBL: [0.5, 0, 0], shinBL: [-0.7, 0, 0], legBR: [0.5, 0, 0], shinBR: [-0.7, 0, 0],
  },
  slash: {
    torso: [-0.35, 0.25, 0], head: [0.35, 0.2, 0], jaw: [0.7, 0, 0], tail: [-0.2, 0, 0],
    legFL: [-1.5, 0, 0.1], shinFL: [-0.3, 0, 0], legFR: [-0.9, 0, -0.1], shinFR: [0.4, 0, 0],
    legBL: [0.6, 0, 0], legBR: [0.4, 0, 0],
  },
  pullback: {
    torso: [0.15, -0.2, 0], head: [-0.2, 0, 0], tail: [0.7, 0, 0],
    legFL: [-0.3, 0, 0], shinFL: [0.8, 0, 0], legFR: [-0.3, 0, 0], shinFR: [0.8, 0, 0],
    legBL: [0.4, 0, 0], shinBL: [-0.6, 0, 0], legBR: [0.4, 0, 0], shinBR: [-0.6, 0, 0],
  },
  thrust: {
    torso: [0.08, 0.15, 0], head: [0.4, 0, 0], jaw: [0.5, 0, 0], tail: [-0.3, 0, 0],
    legFL: [-1.0, 0, 0], shinFL: [0.2, 0, 0], legFR: [-0.8, 0, 0], legBL: [0.9, 0, 0], legBR: [0.8, 0, 0],
  },
  aim: {
    torso: [0.08, 0, 0], head: [-0.05, 0, 0], jaw: [0.55, 0, 0], tail: [0.5, 0, 0],
    legFL: [-0.3, 0, 0.08], shinFL: [0.5, 0, 0], legFR: [-0.3, 0, -0.08], shinFR: [0.5, 0, 0],
    legBL: [0.3, 0, 0], shinBL: [-0.3, 0, 0], legBR: [0.3, 0, 0], shinBR: [-0.3, 0, 0],
  },
  guard: {
    torso: [0.22, 0, 0], head: [0.45, 0, 0], tail: [0.9, 0, 0],
    legFL: [-0.6, 0, 0.15], shinFL: [1.1, 0, 0], legFR: [-0.6, 0, -0.15], shinFR: [1.1, 0, 0],
    legBL: [0.6, 0, 0.1], shinBL: [-0.9, 0, 0], legBR: [0.6, 0, -0.1], shinBR: [-0.9, 0, 0],
  },
  hit: {
    torso: [-0.3, 0, 0.15], head: [-0.5, 0.2, 0], jaw: [0.3, 0, 0], tail: [-0.3, 0, 0],
    legFL: [-0.6, 0, 0.3], legFR: [-0.2, 0, -0.3], legBL: [0.3, 0, 0.2], legBR: [0.1, 0, -0.2],
  },
  cast: {
    torso: [-0.5, 0, 0], head: [-0.55, 0, 0], jaw: [0.6, 0, 0], tail: [-0.4, 0, 0],
    legFL: [-1.3, 0, 0.15], shinFL: [0.6, 0, 0], legFR: [-1.0, 0, -0.15], shinFR: [0.9, 0, 0],
    legBL: [0.55, 0, 0], shinBL: [-0.2, 0, 0], legBR: [0.55, 0, 0], shinBR: [-0.2, 0, 0],
  },
  charge: {
    torso: [-0.15, 0, 0], head: [-0.35, 0, 0], jaw: [0.7, 0, 0], tail: [0.2, 0, 0],
    legFL: [-0.4, 0, 0.35], shinFL: [0.5, 0, 0], legFR: [-0.4, 0, -0.35], shinFR: [0.5, 0, 0],
    legBL: [0.4, 0, 0.3], shinBL: [-0.4, 0, 0], legBR: [0.4, 0, -0.3], shinBR: [-0.4, 0, 0],
  },
  uppercut: {
    torso: [-0.7, 0.2, 0], head: [-0.4, 0, 0], jaw: [0.8, 0, 0], tail: [-0.5, 0, 0],
    legFL: [-2.0, 0, 0.1], shinFL: [-0.2, 0, 0], legFR: [-1.6, 0, -0.1], legBL: [0.8, 0, 0], legBR: [0.8, 0, 0],
  },
  victory: {
    torso: [-0.4, 0, 0], head: [-0.7, 0, 0], jaw: [0.6, 0, 0], tail: [-0.6, 0, 0],
    legFL: [-1.0, 0, 0.1], shinFL: [0.8, 0, 0], legFR: [-0.3, 0, -0.1],
    legBL: [0.45, 0, 0], shinBL: [-0.2, 0, 0], legBR: [0.45, 0, 0], shinBR: [-0.2, 0, 0],
  },
};

// 浮遊型：手の支点の x を負にすると前へ・上へ、y で横から前へ回す
const FLOATER: Record<PoseName, Pose> = {
  idle: { handR: [-0.25, 0.25, 0], handL: [-0.25, -0.25, 0] },
  windup: { core: [-0.1, -0.45, 0], handR: [-2.5, 0.4, 0], handL: [-0.3, -0.6, 0] },
  slash: { core: [0.25, 0.45, 0], handR: [-0.4, -0.7, 0], handL: [0.2, -0.3, 0] },
  pullback: { core: [0, -0.35, 0], handR: [0.5, 0.5, 0], handL: [-0.6, -0.5, 0] },
  thrust: { core: [0.15, 0.35, 0], handR: [-1.55, 0.2, 0], handL: [0.3, -0.4, 0] },
  aim: { core: [0.05, 0, 0], handR: [-1.5, 0.35, 0], handL: [-1.3, -0.4, 0] },
  guard: { core: [0.3, 0, 0], handR: [-1.25, -0.55, 0], handL: [-1.25, 0.55, 0] },
  hit: { core: [-0.45, 0.1, 0.2], handR: [0.5, 0.4, 0], handL: [0.5, -0.4, 0] },
  cast: { core: [-0.3, 0, 0], handR: [-2.8, 0.3, 0], handL: [-2.8, -0.3, 0] },
  charge: { core: [-0.2, 0, 0], handR: [-0.2, 0, -1.0], handL: [-0.2, 0, 1.0] },
  uppercut: { core: [-0.5, 0.3, 0], handR: [-3.0, 0.2, 0], handL: [0.3, -0.3, 0] },
  victory: { core: [-0.25, 0.3, 0], handR: [-2.9, 0.2, -0.3], handL: [-0.2, -0.3, 0.6] },
};

export const POSE_SETS: Record<Form, Record<PoseName, Pose>> = {
  humanoid: HUMANOID,
  beast: BEAST,
  floater: FLOATER,
};

export function posesOf(r: Robot) {
  return POSE_SETS[r.form];
}

export function toPose(tw: Tweener, r: Robot, pose: Pose, dur: number, ease: EaseFn = Ease.outCubic) {
  const names = Object.keys(r.bones);
  const from = names.map((n) => r.bones[n].rotation.clone());
  const to = names.map((n) => pose[n] ?? [0, 0, 0]);
  return tw.add(
    dur,
    (k) => {
      names.forEach((n, i) => {
        const rot = r.bones[n].rotation;
        rot.x = lerp(from[i].x, to[i][0], k);
        rot.y = lerp(from[i].y, to[i][1], k);
        rot.z = lerp(from[i].z, to[i][2], k);
      });
    },
    ease,
  );
}

export function setPose(r: Robot, pose: Pose) {
  for (const n of Object.keys(r.bones)) {
    const p = pose[n] ?? [0, 0, 0];
    r.bones[n].rotation.set(p[0], p[1], p[2]);
  }
}
