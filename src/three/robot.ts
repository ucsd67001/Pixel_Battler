// 設計図から、部品を組み合わせてロボを作る（プラモ方式）。
// 体の形は三つ：人型（humanoid）・四つ足の獣型（beast）・浮遊型（floater）。
// 見た目は「等身を上げた、角の立ったメカ」：小さめの頭・長い手足・面取りした装甲・発光ライン。
// どれも関節（グループ）を持たせ、体の形ごとのポーズで動かす。前は +z、足元が y=0。

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { CharacterSpec, Form, HeadType } from '../game/types';
import { ELEMENT_INFO } from '../game/data';
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
    if (hsl.l > 0.68) c.setHSL(hsl.h, hsl.s, 0.68);
    return c;
  };
  const std = (color: string, metalness: number, roughness: number) =>
    new THREE.MeshStandardMaterial({ color: tame(color), metalness, roughness });
  const M = {
    primary: std(spec.colors.primary, 0.45, 0.32),
    secondary: std(spec.colors.secondary, 0.5, 0.3),
    accent: std(spec.colors.accent, 0.9, 0.18),
    joint: std('#1b1e26', 0.7, 0.42),
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
  const W = spec.parts.body === 'slim' ? 0.88 : spec.parts.body === 'heavy' ? 1.14 : 1;
  const extraMats: THREE.Material[] = [];
  return { spec, M, geos, extraMats, mesh, box, prism, cyl, cone, sphere, group, pivot, W };
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

// ── 人型の頭（小さめの兜とV字のマスク）。原点は首の付け根 ──
function buildHelmet(k: Kit, type: HeadType) {
  const { M, box, prism, cyl, group } = k;
  const head = group();
  head.add(cyl(0.055, 0.065, 0.1, M.joint, 0, 0.04, 0));
  head.add(box(0.34, 0.26, 0.36, M.primary, 0, 0.24, -0.01, 0.03));
  head.add(prism(0.24, 0.34, 0.08, 0.36, M.primary, 0, 0.41, -0.01));
  head.add(prism(0.22, 0.08, 0.15, 0.1, M.secondary, 0, 0.12, 0.14));
  for (const s of [1, -1]) {
    head.add(box(0.045, 0.2, 0.26, M.accent, 0.185 * s, 0.22, 0.02, 0.01));
    head.add(box(0.012, 0.012, 0.2, M.glow, 0.21 * s, 0.24, 0.02, 0.004));
  }
  addEyes(k, head, type, 0.27, 0.18);
  addOrnament(k, head, type, 0.44, 0.17);
  return head;
}

// ── 手に持つ武器（人型・浮遊型）。H＝右手、L＝左手、shieldOn＝盾を付ける所 ──
function attachHandWeapon(k: Kit, H: THREE.Group, L: THREE.Group, shieldOn: THREE.Group, shieldY: number) {
  const { M, box, prism, cyl, sphere, group } = k;
  let tip: THREE.Object3D = H;
  let muzzle: THREE.Object3D = H;
  switch (k.spec.parts.weapon) {
    case 'sword': {
      H.add(cyl(0.022, 0.022, 0.18, M.joint).rotateX(Math.PI / 2));
      H.add(box(0.24, 0.04, 0.05, M.accent, 0, 0, 0.1, 0.008));
      H.add(box(0.04, 0.09, 0.92, M.primary, 0, 0, 0.58, 0.006));
      H.add(box(0.045, 0.02, 0.9, M.glow, 0, 0.05, 0.58, 0.004));
      const p = prism(0, 0.09, 0.2, 0.04, M.primary, 0, 0, 1.13);
      p.rotation.x = Math.PI / 2;
      H.add(p);
      tip = group(0, 0, 1.1);
      H.add(tip);
      break;
    }
    case 'lance': {
      H.add(cyl(0.025, 0.025, 0.7, M.joint, 0, 0, 0.12).rotateX(Math.PI / 2));
      const head = prism(0, 0.16, 0.85, 0.16, M.primary, 0, 0, 0.88);
      head.rotation.x = Math.PI / 2;
      H.add(head);
      H.add(cyl(0.13, 0.13, 0.04, M.accent, 0, 0, 0.44, 6).rotateX(Math.PI / 2));
      const line = box(0.016, 0.016, 0.7, M.glow, 0, 0.06, 0.82, 0.004);
      line.rotation.x = -0.09;
      H.add(line);
      tip = group(0, 0, 1.3);
      H.add(tip);
      break;
    }
    case 'rifle':
      H.add(box(0.1, 0.15, 0.62, M.secondary, 0, 0.05, 0.18));
      H.add(box(0.06, 0.06, 0.5, M.primary, 0, 0.08, 0.7));
      H.add(cyl(0.025, 0.025, 0.2, M.joint, 0, 0.08, 1.02).rotateX(Math.PI / 2));
      H.add(box(0.05, 0.05, 0.2, M.accent, 0, 0.16, 0.14));
      H.add(box(0.012, 0.03, 0.5, M.glow, 0.055, 0.05, 0.22, 0.004));
      muzzle = group(0, 0.08, 1.12);
      H.add(muzzle);
      tip = muzzle;
      break;
    case 'hammer':
      H.add(cyl(0.025, 0.025, 0.9, M.joint, 0, 0, 0.34).rotateX(Math.PI / 2));
      H.add(box(0.36, 0.24, 0.26, M.primary, 0, 0, 0.82, 0.02));
      H.add(prism(0.12, 0.26, 0.14, 0.24, M.accent, 0.24, 0, 0.82).rotateZ(-Math.PI / 2));
      H.add(box(0.38, 0.04, 0.28, M.glow, 0, 0, 0.82, 0.008));
      tip = group(0, 0, 0.82);
      H.add(tip);
      break;
    case 'shield': {
      const sh = cyl(0.3, 0.3, 0.04, M.secondary, 0.12, shieldY, 0, 6);
      sh.rotation.z = Math.PI / 2;
      shieldOn.add(sh);
      const rim = cyl(0.19, 0.19, 0.05, M.accent, 0.13, shieldY, 0, 6);
      rim.rotation.z = Math.PI / 2;
      shieldOn.add(rim);
      shieldOn.add(sphere(0.045, M.glow, 0.16, shieldY, 0));
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
      H.add(box(0.15, 0.05, 0.15, M.accent, 0, 0.06, 0, 0.01));
      L.add(box(0.15, 0.05, 0.15, M.accent, 0, 0.06, 0, 0.01));
      break;
  }
  return { tip, muzzle };
}

// ── 背中の装備（原点は背中の真ん中。後ろが −z） ──
function buildBack(k: Kit, back: THREE.Group, form: Form) {
  const { M, box, prism, cyl, pivot } = k;
  switch (k.spec.parts.back) {
    case 'wings':
      for (const s of [1, -1]) {
        const w = pivot(back, 0.1 * s, 0.05, -0.04, 0.3, 0.35 * s, 0.6 * s);
        for (let i = 0; i < 3; i++) {
          const f = pivot(w, 0.09 * i * s, 0.02 - i * 0.05, 0, 0, 0, -0.32 * i * s);
          f.add(prism(0, 0.09, 0.8 - i * 0.16, 0.025, i === 0 ? M.secondary : M.primary, 0, (0.8 - i * 0.16) / 2, 0));
          f.add(prism(0, 0.025, 0.7 - i * 0.16, 0.03, M.glow, 0.035 * s, (0.7 - i * 0.16) / 2, 0));
        }
      }
      break;
    case 'boosters':
      back.add(box(0.32, 0.28, 0.14, M.secondary));
      for (const s of [1, -1]) {
        const b = prism(0.1, 0.14, 0.42, 0.14, M.primary, 0.14 * s, -0.12, -0.12);
        b.rotation.x = -0.35;
        back.add(b);
        const n = cyl(0.06, 0.06, 0.02, M.glow, 0.14 * s, -0.33, -0.2);
        n.rotation.x = -0.35;
        back.add(n);
      }
      break;
    case 'cannons':
      back.add(box(0.32, 0.28, 0.14, M.secondary));
      for (const s of [1, -1]) {
        const c = box(0.09, 0.09, 0.9, M.primary, 0.22 * s, 0.32, 0.14, 0.01);
        c.rotation.x = -0.15;
        back.add(c);
        back.add(box(0.15, 0.15, 0.26, M.joint, 0.22 * s, 0.26, -0.08, 0.01));
        const m = box(0.05, 0.05, 0.02, M.glow, 0.22 * s, 0.39, 0.59, 0.006);
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
        const cape = prism(0.62, 0.8, 1.0, 0.03, M.secondary, 0, -0.42, -0.02);
        cape.rotation.x = 0.1;
        back.add(cape);
        back.add(box(0.66, 0.05, 0.05, M.accent, 0, 0.08, 0.02, 0.01));
      }
      break;
    case 'none':
      back.add(box(0.32, 0.28, 0.14, M.secondary));
      back.add(box(0.18, 0.03, 0.02, M.glow, 0, -0.06, -0.075, 0.006));
      break;
  }
}

// ── 人型：だいたい5頭身。肩の大きな装甲と、絞った腰 ──
function buildHumanoid(k: Kit, body: THREE.Group) {
  const { M, box, prism, cyl, sphere, group, W } = k;
  const P = k.spec.parts;
  const hips = group(0, 1.0, 0);
  body.add(hips);
  hips.add(prism(0.42 * W, 0.24 * W, 0.18, 0.28, M.secondary, 0, -0.02, 0));
  hips.add(prism(0.1, 0.03, 0.16, 0.05, M.accent, 0, -0.08, 0.15));

  const torso = group(0, 0.08, 0);
  hips.add(torso);
  torso.add(box(0.24 * W, 0.22, 0.2, M.joint, 0, 0.12, 0));
  torso.add(prism(0.74 * W, 0.42 * W, 0.4, 0.4, M.primary, 0, 0.44, 0));
  torso.add(prism(0.5 * W, 0.3 * W, 0.18, 0.06, M.secondary, 0, 0.42, 0.19));
  torso.add(box(0.46 * W, 0.06, 0.3, M.secondary, 0, 0.66, 0.02, 0.01));
  for (const s of [1, -1]) {
    const line = box(0.012, 0.012, 0.3, M.glow, 0.16 * W * s, 0.52, 0.2, 0.004);
    line.rotation.y = 0.5 * s;
    torso.add(line);
  }
  const core = sphere(0.055, M.glow, 0, 0.47, 0.215);
  torso.add(core);
  if (P.body === 'heavy') torso.add(box(0.8 * W, 0.1, 0.44, M.secondary, 0, 0.28, 0, 0.012));

  const head = buildHelmet(k, P.head);
  head.position.set(0, 0.68, 0.01);
  torso.add(head);

  const makeArm = (s: 1 | -1) => {
    const arm = group(0.46 * W * s, 0.55, 0);
    torso.add(arm);
    const heavyArm = P.arms === 'heavy';
    const pd = prism(0.2, heavyArm ? 0.4 : 0.34, 0.24, heavyArm ? 0.34 : 0.3, M.primary, 0.06 * s, 0.04, 0);
    pd.rotation.z = -0.25 * s;
    arm.add(pd);
    arm.add(box(0.02, 0.18, 0.2, M.accent, 0.21 * s, 0.0, 0, 0.006));
    arm.add(box(0.12, 0.3, 0.14, M.joint, 0.02 * s, -0.2, 0));
    const fore = group(0.02 * s, -0.38, 0);
    arm.add(fore);
    fore.add(prism(heavyArm ? 0.26 : 0.2, heavyArm ? 0.2 : 0.15, 0.36, heavyArm ? 0.26 : 0.19, heavyArm ? M.primary : M.secondary, 0, -0.17, 0));
    fore.add(box(0.012, 0.22, 0.012, M.glow, 0.09 * s, -0.17, 0.08, 0.004));
    if (P.arms === 'blade') {
      const b = prism(0, 0.07, 0.5, 0.02, M.glow, 0.11 * s, -0.1, -0.05);
      b.rotation.x = 2.7;
      fore.add(b);
    }
    const hand = group(0, -0.39, 0);
    fore.add(hand);
    const fist = P.weapon === 'none' ? 0.14 : 0.11;
    hand.add(box(fist, fist * 0.9, fist, M.joint, 0, 0, 0, 0.012));
    return { arm, fore, hand };
  };
  const L = makeArm(1);
  const R = makeArm(-1);
  const { tip, muzzle } = attachHandWeapon(k, R.hand, L.hand, L.fore, -0.18);

  const makeLeg = (s: 1 | -1) => {
    const leg = group(0.15 * W * s, -0.06, 0);
    hips.add(leg);
    const heavy = P.legs === 'heavy';
    leg.add(box(heavy ? 0.2 : 0.16, 0.38, heavy ? 0.22 : 0.19, M.secondary, 0, -0.2, 0, 0.012));
    const shin = group(0, -0.42, 0);
    leg.add(shin);
    shin.add(prism(heavy ? 0.26 : 0.21, heavy ? 0.2 : 0.15, 0.44, heavy ? 0.28 : 0.24, M.primary, 0, -0.22, 0));
    const knee = prism(0.06, 0.14, 0.14, 0.08, M.accent, 0, 0.02, 0.11);
    knee.rotation.x = -0.2;
    shin.add(knee);
    shin.add(box(0.012, 0.28, 0.012, M.glow, 0.07 * s, -0.2, 0.12, 0.004));
    shin.add(box(heavy ? 0.24 : 0.19, 0.09, 0.34, M.secondary, 0, -0.475, 0.05, 0.012));
    const toe = prism(0, heavy ? 0.22 : 0.18, 0.14, 0.08, M.accent, 0, -0.48, 0.25);
    toe.rotation.x = Math.PI / 2;
    shin.add(toe);
    if (P.legs === 'thruster') {
      shin.add(box(0.12, 0.14, 0.07, M.joint, 0, -0.28, -0.14, 0.01));
      shin.add(box(0.09, 0.025, 0.02, M.glow, 0, -0.34, -0.18, 0.006));
      shin.add(prism(0, 0.12, 0.26, 0.03, M.accent, 0.12 * s, -0.12, -0.04));
    }
    return { leg, shin };
  };
  const LL = makeLeg(1);
  const LR = makeLeg(-1);

  const back = group(0, 0.46, -0.22);
  torso.add(back);
  buildBack(k, back, 'humanoid');

  return {
    bones: {
      hips, torso, head,
      armL: L.arm, armR: R.arm, foreL: L.fore, foreR: R.fore,
      legL: LL.leg, legR: LR.leg, shinL: LL.shin, shinR: LR.shin,
    },
    tip, muzzle, core, chestY: 1.5, spins: [],
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
