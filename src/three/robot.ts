// 設計図から、部品を組み合わせて SD ロボを作る（プラモ方式）。
// 体の形は三つ：人型（humanoid）・四つ足の獣型（beast）・浮遊型（floater）。
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
  const std = (color: string, metalness: number, roughness: number) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const M = {
    primary: std(spec.colors.primary, 0.35, 0.38),
    secondary: std(spec.colors.secondary, 0.4, 0.35),
    accent: std(spec.colors.accent, 0.85, 0.22),
    joint: std('#23262e', 0.6, 0.5),
    eye: new THREE.MeshStandardMaterial({
      color: spec.colors.eye,
      emissive: spec.colors.eye,
      emissiveIntensity: 3.2,
      toneMapped: false,
    }),
    glow: new THREE.MeshStandardMaterial({ color: el, emissive: el, emissiveIntensity: 2.6, toneMapped: false }),
  };
  const geos: THREE.BufferGeometry[] = [];
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, r = 0.035) =>
    mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), mat, x, y, z);
  const cyl = (rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 16) =>
    mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
  const cone = (r: number, h: number, mat: THREE.Material, seg = 12) => mesh(new THREE.ConeGeometry(r, h, seg), mat);
  const sphere = (r: number, mat: THREE.Material, x = 0, y = 0, z = 0) =>
    mesh(new THREE.SphereGeometry(r, 20, 14), mat, x, y, z);
  const group = (x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    return g;
  };
  const W = spec.parts.body === 'slim' ? 0.86 : spec.parts.body === 'heavy' ? 1.16 : 1;
  const extraMats: THREE.Material[] = [];
  return { spec, M, geos, extraMats, mesh, box, cyl, cone, sphere, group, W };
}
type Kit = ReturnType<typeof makeKit>;

// ── 頭（どの体の形でも使う）。原点は首の付け根 ──
function buildHeadUnit(k: Kit, type: HeadType) {
  const { M, box, cyl, cone, sphere, group } = k;
  const head = group();
  head.add(cyl(0.07, 0.08, 0.1, M.joint, 0, 0.04, 0));
  head.add(box(0.64, 0.54, 0.58, M.primary, 0, 0.32, 0, 0.11));
  head.add(box(0.42, 0.24, 0.1, M.secondary, 0, 0.2, 0.26, 0.04));
  head.add(box(0.05, 0.12, 0.02, M.joint, 0.06, 0.15, 0.315));
  head.add(box(0.05, 0.12, 0.02, M.joint, -0.06, 0.15, 0.315));
  head.add(box(0.06, 0.18, 0.2, M.accent, 0.33, 0.3, 0.04));
  head.add(box(0.06, 0.18, 0.2, M.accent, -0.33, 0.3, 0.04));

  const twinEyes = () => {
    for (const s of [1, -1]) {
      const e = box(0.14, 0.045, 0.02, M.eye, 0.1 * s, 0.355, 0.3, 0.01);
      e.rotation.z = 0.18 * s;
      head.add(e);
    }
  };
  const gem = () => head.add(sphere(0.04, M.glow, 0, 0.5, 0.29));
  const pivot = (x: number, y: number, z: number, rz: number, child: THREE.Object3D) => {
    const g = group(x, y, z);
    g.rotation.z = rz;
    g.add(child);
    head.add(g);
  };
  switch (type) {
    case 'vfin':
      twinEyes();
      gem();
      for (const s of [1, -1]) pivot(0, 0.5, 0.3, -0.75 * s, box(0.045, 0.42, 0.03, M.accent, 0, 0.21, 0, 0.012));
      break;
    case 'horns':
      twinEyes();
      for (const s of [1, -1]) {
        const c = cone(0.065, 0.38, M.accent);
        c.position.y = 0.19;
        pivot(0.24 * s, 0.52, 0.06, -0.55 * s, c);
      }
      break;
    case 'mono': {
      head.add(box(0.52, 0.11, 0.06, M.joint, 0, 0.34, 0.29, 0.02));
      head.add(sphere(0.055, M.eye, 0.04, 0.34, 0.31));
      const rod = cyl(0.012, 0.012, 0.32, M.accent);
      rod.position.y = 0.16;
      pivot(0.26, 0.58, -0.05, -0.25, rod);
      break;
    }
    case 'crest':
      twinEyes();
      gem();
      head.add(box(0.06, 0.24, 0.52, M.accent, 0, 0.66, -0.02, 0.02));
      break;
    case 'ears':
      twinEyes();
      for (const s of [1, -1]) {
        const c = cone(0.13, 0.28, M.secondary, 4);
        c.position.y = 0.14;
        c.rotation.y = Math.PI / 4;
        pivot(0.2 * s, 0.56, 0.0, -0.28 * s, c);
      }
      break;
    case 'crown':
      twinEyes();
      for (let i = -2; i <= 2; i++) {
        const c = cone(0.045, i === 0 ? 0.26 : 0.18, M.accent, 6);
        c.position.set(i * 0.11, 0.66, 0.2 - Math.abs(i) * 0.04);
        head.add(c);
      }
      head.add(box(0.56, 0.05, 0.05, M.accent, 0, 0.6, 0.27, 0.02));
      break;
  }
  return head;
}

// ── 手に持つ武器（人型・浮遊型）。H＝右手、L＝左手、shieldOn＝盾を付ける所 ──
function attachHandWeapon(k: Kit, H: THREE.Group, L: THREE.Group, shieldOn: THREE.Group) {
  const { M, box, cyl, cone, sphere, group } = k;
  let tip: THREE.Object3D = H;
  let muzzle: THREE.Object3D = H;
  switch (k.spec.parts.weapon) {
    case 'sword':
      H.add(cyl(0.025, 0.025, 0.16, M.joint).rotateX(Math.PI / 2));
      H.add(box(0.2, 0.05, 0.05, M.accent, 0, 0, 0.1));
      H.add(box(0.05, 0.11, 0.8, M.primary, 0, 0, 0.52, 0.02));
      H.add(box(0.06, 0.03, 0.82, M.glow, 0, 0.065, 0.53, 0.01));
      tip = group(0, 0, 0.95);
      H.add(tip);
      break;
    case 'lance': {
      H.add(cyl(0.03, 0.03, 0.5, M.joint, 0, 0, 0.05).rotateX(Math.PI / 2));
      const c = cone(0.1, 1.0, M.primary, 16);
      c.rotation.x = Math.PI / 2;
      c.position.z = 0.75;
      H.add(c);
      H.add(cyl(0.14, 0.14, 0.05, M.accent, 0, 0, 0.27).rotateX(Math.PI / 2));
      const line = box(0.02, 0.02, 0.7, M.glow, 0, 0.07, 0.7, 0.005);
      line.rotation.x = -0.09;
      H.add(line);
      tip = group(0, 0, 1.25);
      H.add(tip);
      break;
    }
    case 'rifle':
      H.add(box(0.12, 0.17, 0.56, M.secondary, 0, 0.05, 0.16));
      H.add(cyl(0.035, 0.035, 0.42, M.joint, 0, 0.08, 0.62).rotateX(Math.PI / 2));
      H.add(box(0.06, 0.06, 0.18, M.accent, 0, 0.17, 0.12));
      H.add(box(0.04, 0.03, 0.3, M.glow, 0.065, 0.05, 0.2, 0.01));
      muzzle = group(0, 0.08, 0.86);
      H.add(muzzle);
      tip = muzzle;
      break;
    case 'hammer':
      H.add(cyl(0.03, 0.03, 0.8, M.joint, 0, 0, 0.3).rotateX(Math.PI / 2));
      H.add(box(0.4, 0.28, 0.28, M.primary, 0, 0, 0.75, 0.05));
      H.add(box(0.42, 0.06, 0.3, M.glow, 0, 0, 0.75, 0.02));
      tip = group(0, 0, 0.75);
      H.add(tip);
      break;
    case 'shield': {
      const sh = cyl(0.3, 0.3, 0.05, M.secondary, 0.12, -0.12, 0, 6);
      sh.rotation.z = Math.PI / 2;
      shieldOn.add(sh);
      const rim = cyl(0.18, 0.18, 0.06, M.accent, 0.13, -0.12, 0, 6);
      rim.rotation.z = Math.PI / 2;
      shieldOn.add(rim);
      shieldOn.add(sphere(0.05, M.glow, 0.17, -0.12, 0));
      break;
    }
    case 'claw':
      for (const h of [L, H]) {
        for (let i = -1; i <= 1; i++) {
          const c = cone(0.025, 0.24, M.glow, 6);
          c.position.set(i * 0.045, -0.13, 0.04);
          c.rotation.x = Math.PI;
          h.add(c);
        }
      }
      break;
    case 'none':
      H.add(box(0.19, 0.06, 0.19, M.accent, 0, 0.07, 0, 0.02));
      L.add(box(0.19, 0.06, 0.19, M.accent, 0, 0.07, 0, 0.02));
      break;
  }
  return { tip, muzzle };
}

// ── 背中の装備（原点は背中の真ん中。後ろが −z） ──
function buildBack(k: Kit, back: THREE.Group, form: Form) {
  const { M, box, cyl, group } = k;
  switch (k.spec.parts.back) {
    case 'wings':
      for (const s of [1, -1]) {
        const w = group(0.12 * s, 0.05, -0.04);
        w.rotation.set(0.25, 0.35 * s, 0.55 * s);
        for (let i = 0; i < 3; i++) {
          const f = box(0.08, 0.7 - i * 0.15, 0.025, i === 0 ? M.secondary : M.primary, 0.1 * i * s, 0.32 - i * 0.05, 0, 0.012);
          f.rotation.z = -0.3 * i * s;
          w.add(f);
          const g = box(0.02, 0.6 - i * 0.15, 0.03, M.glow, (0.1 * i + 0.045) * s, 0.3 - i * 0.05, 0, 0.006);
          g.rotation.z = -0.3 * i * s;
          w.add(g);
        }
        back.add(w);
      }
      break;
    case 'boosters':
      back.add(box(0.36, 0.3, 0.16, M.secondary));
      for (const s of [1, -1]) {
        const b = cyl(0.08, 0.1, 0.38, M.primary, 0.14 * s, -0.12, -0.12);
        b.rotation.x = -0.35;
        back.add(b);
        const n = cyl(0.07, 0.07, 0.02, M.glow, 0.14 * s, -0.31, -0.19);
        n.rotation.x = -0.35;
        back.add(n);
      }
      break;
    case 'cannons':
      back.add(box(0.36, 0.3, 0.16, M.secondary));
      for (const s of [1, -1]) {
        const c = cyl(0.055, 0.065, 0.85, M.primary, 0.24 * s, 0.32, 0.12);
        c.rotation.x = Math.PI / 2 - 0.15;
        back.add(c);
        back.add(box(0.15, 0.15, 0.24, M.joint, 0.24 * s, 0.26, -0.08));
        const m = cyl(0.04, 0.04, 0.02, M.glow, 0.24 * s, 0.38, 0.54);
        m.rotation.x = Math.PI / 2 - 0.15;
        back.add(m);
      }
      break;
    case 'cape':
      if (form === 'beast') {
        // 獣型はマントの代わりに、背骨に沿ったたてがみ
        for (let i = 0; i < 4; i++) {
          const f = box(0.04, 0.24 - i * 0.03, 0.18, i % 2 ? M.accent : M.secondary, 0, 0.1, 0.25 - i * 0.2, 0.012);
          f.rotation.x = -0.4;
          back.add(f);
        }
      } else {
        const cape = box(0.66, 0.95, 0.03, M.secondary, 0, -0.38, -0.02, 0.012);
        cape.rotation.x = 0.12;
        back.add(cape);
        back.add(box(0.7, 0.06, 0.05, M.accent, 0, 0.08, 0.02, 0.02));
      }
      break;
    case 'none':
      back.add(box(0.36, 0.3, 0.16, M.secondary));
      back.add(box(0.2, 0.04, 0.02, M.glow, 0, -0.06, -0.085, 0.008));
      break;
  }
}

// ── 人型 ──
function buildHumanoid(k: Kit, body: THREE.Group) {
  const { M, box, cyl, sphere, group, W } = k;
  const P = k.spec.parts;
  const hips = group(0, 0.68, 0);
  body.add(hips);
  hips.add(box(0.46 * W, 0.2, 0.32, M.secondary));
  hips.add(box(0.14, 0.14, 0.08, M.accent, 0, -0.04, 0.17));

  const torso = group(0, 0.1, 0);
  hips.add(torso);
  torso.add(box(0.34 * W, 0.16, 0.26, M.joint, 0, 0.08, 0));
  torso.add(box(0.64 * W, 0.36, 0.42, M.primary, 0, 0.32, 0, 0.06));
  torso.add(box(0.5 * W, 0.08, 0.2, M.secondary, 0, 0.52, 0.06));
  torso.add(box(0.2 * W, 0.14, 0.05, M.secondary, 0.17 * W, 0.37, 0.21));
  torso.add(box(0.2 * W, 0.14, 0.05, M.secondary, -0.17 * W, 0.37, 0.21));
  const core = sphere(0.07, M.glow, 0, 0.3, 0.215);
  torso.add(core);
  if (P.body === 'heavy') torso.add(box(0.7 * W, 0.12, 0.46, M.secondary, 0, 0.16, 0));

  const head = buildHeadUnit(k, P.head);
  head.position.set(0, 0.56, 0);
  head.scale.setScalar(1.24); // SD らしく頭を大きく
  torso.add(head);

  const makeArm = (s: 1 | -1) => {
    const arm = group(0.42 * W * s, 0.44, 0);
    torso.add(arm);
    arm.add(box(0.3, 0.26, 0.32, M.primary, 0.06 * s, 0.03, 0, 0.06));
    arm.add(box(0.06, 0.1, 0.24, M.accent, 0.2 * s, 0.06, 0, 0.02));
    arm.add(cyl(0.07, 0.07, 0.22, M.joint, 0.02 * s, -0.15, 0));
    const fore = group(0.02 * s, -0.27, 0);
    arm.add(fore);
    const heavy = P.arms === 'heavy';
    fore.add(box(heavy ? 0.23 : 0.17, heavy ? 0.3 : 0.26, heavy ? 0.25 : 0.19, heavy ? M.primary : M.secondary, 0, -0.12, 0));
    if (P.arms === 'blade') {
      const b = box(0.025, 0.08, 0.42, M.glow, 0.1 * s, -0.08, -0.05, 0.01);
      b.rotation.x = 0.3;
      fore.add(b);
    }
    const hand = group(0, -0.31, 0);
    fore.add(hand);
    const fist = P.weapon === 'none' ? 0.17 : 0.13;
    hand.add(box(fist, fist * 0.9, fist, M.joint, 0, 0, 0, 0.03));
    return { arm, fore, hand };
  };
  const L = makeArm(1);
  const R = makeArm(-1);
  const { tip, muzzle } = attachHandWeapon(k, R.hand, L.hand, L.fore);

  const makeLeg = (s: 1 | -1) => {
    const leg = group(0.15 * W * s, -0.08, 0);
    hips.add(leg);
    leg.add(cyl(0.095, 0.095, 0.2, M.joint, 0, -0.1, 0));
    const shin = group(0, -0.22, 0);
    leg.add(shin);
    const heavy = P.legs === 'heavy';
    shin.add(box(heavy ? 0.31 : 0.25, 0.32, heavy ? 0.33 : 0.28, M.primary, 0, -0.12, 0, 0.05));
    shin.add(box(0.12, 0.1, 0.06, M.accent, 0, -0.01, 0.14));
    shin.add(box(heavy ? 0.33 : 0.28, 0.12, 0.42, M.secondary, 0, -0.32, 0.05));
    shin.add(box(heavy ? 0.2 : 0.16, 0.05, 0.08, M.accent, 0, -0.28, 0.26, 0.015));
    if (P.legs === 'thruster') {
      shin.add(box(0.14, 0.12, 0.08, M.joint, 0, -0.18, -0.16));
      shin.add(box(0.1, 0.03, 0.02, M.glow, 0, -0.24, -0.205, 0.008));
      shin.add(box(0.03, 0.14, 0.12, M.accent, 0.13 * s, -0.08, -0.05, 0.01));
    }
    return { leg, shin };
  };
  const LL = makeLeg(1);
  const LR = makeLeg(-1);

  const back = group(0, 0.34, -0.22);
  torso.add(back);
  buildBack(k, back, 'humanoid');

  return {
    bones: {
      hips, torso, head,
      armL: L.arm, armR: R.arm, foreL: L.fore, foreR: R.fore,
      legL: LL.leg, legR: LR.leg, shinL: LL.shin, shinR: LR.shin,
    },
    tip, muzzle, core, chestY: 1.05, spins: [],
  };
}

// ── 四つ足の獣型 ──
function buildBeast(k: Kit, body: THREE.Group) {
  const { M, box, cyl, cone, sphere, group, W } = k;
  const P = k.spec.parts;
  const torso = group(0, 0.66, 0);
  body.add(torso);
  torso.add(box(0.56 * W, 0.4, 0.92, M.primary, 0, 0, 0, 0.08));
  torso.add(box(0.46 * W, 0.08, 0.66, M.secondary, 0, 0.22, -0.06, 0.03));
  torso.add(box(0.5 * W, 0.3, 0.1, M.secondary, 0, -0.02, 0.46, 0.04));
  for (const s of [1, -1]) torso.add(box(0.05, 0.06, 0.6, M.accent, 0.29 * W * s, 0.1, -0.02, 0.02));
  if (P.body === 'heavy') torso.add(box(0.64 * W, 0.16, 0.5, M.secondary, 0, -0.12, 0.12, 0.05));
  const core = sphere(0.07, M.glow, 0, 0.02, 0.52);
  torso.add(core);

  // 頭：大きな頭に、鼻先と開くあご
  const head = group(0, 0.16, 0.48);
  torso.add(head);
  const hu = buildHeadUnit(k, P.head);
  hu.scale.setScalar(1.08);
  hu.position.set(0, -0.12, 0.12);
  head.add(hu);
  hu.add(box(0.36, 0.14, 0.24, M.secondary, 0, 0.17, 0.36, 0.04));
  hu.add(box(0.12, 0.05, 0.04, M.joint, 0, 0.2, 0.49, 0.015));
  const jaw = group(0, 0.1, 0.26);
  hu.add(jaw);
  jaw.add(box(0.3, 0.07, 0.26, M.joint, 0, -0.03, 0.12, 0.02));
  if (P.weapon === 'none') {
    for (const s of [1, -1]) {
      const f = cone(0.03, 0.12, M.glow, 6);
      f.position.set(0.09 * s, 0.03, 0.22);
      jaw.add(f);
    }
  }

  // 脚
  const legs: Record<string, { leg: THREE.Group; shin: THREE.Group; paw: THREE.Group }> = {};
  for (const [name, fx, fz] of [['FL', 1, 1], ['FR', -1, 1], ['BL', 1, -1], ['BR', -1, -1]] as const) {
    const front = fz > 0;
    const leg = group(0.25 * W * fx, -0.12, 0.3 * fz);
    torso.add(leg);
    const bigArm = front && P.arms === 'heavy';
    leg.add(box(bigArm ? 0.26 : 0.21, 0.26, bigArm ? 0.3 : 0.25, front ? M.primary : M.secondary, 0.03 * fx, -0.06, 0, 0.05));
    const shin = group(0, -0.24, 0);
    leg.add(shin);
    const heavy = P.legs === 'heavy' || bigArm;
    shin.add(box(heavy ? 0.2 : 0.15, 0.22, heavy ? 0.2 : 0.15, M.joint, 0, -0.09, 0));
    const paw = group(0, -0.25, 0.04);
    shin.add(paw);
    paw.add(box(heavy ? 0.27 : 0.22, 0.1, 0.3, M.secondary, 0, 0, 0, 0.03));
    paw.add(box(heavy ? 0.18 : 0.14, 0.04, 0.06, M.accent, 0, 0.02, 0.15, 0.015));
    if (P.legs === 'thruster') shin.add(box(0.08, 0.12, 0.03, M.glow, 0, -0.1, -0.09, 0.01));
    if (front && P.arms === 'blade') {
      const b = box(0.025, 0.08, 0.42, M.glow, 0.12 * fx, -0.02, -0.05, 0.01);
      b.rotation.x = 0.4;
      leg.add(b);
    }
    legs[name] = { leg, shin, paw };
  }

  // しっぽ
  const tail = group(0, 0.08, -0.46);
  torso.add(tail);
  tail.add(box(0.13, 0.13, 0.3, M.primary, 0, 0, -0.14, 0.04));
  const tail2 = group(0, 0, -0.28);
  tail.add(tail2);
  tail2.rotation.x = 0.35;
  tail2.add(box(0.1, 0.1, 0.28, M.secondary, 0, 0, -0.13, 0.03));
  tail2.add(box(0.06, 0.06, 0.06, M.glow, 0, 0, -0.29, 0.015));

  const back = group(0, 0.24, 0.02);
  torso.add(back);
  buildBack(k, back, 'beast');

  // 武器は、体の部品に置き換える
  let tip: THREE.Object3D = hu;
  let muzzle: THREE.Object3D = hu;
  switch (P.weapon) {
    case 'sword': {
      const blade = group(0, 0.6, 0.18);
      blade.rotation.x = -0.9;
      blade.add(box(0.05, 0.5, 0.08, M.primary, 0, 0.25, 0, 0.015));
      blade.add(box(0.06, 0.48, 0.03, M.glow, 0, 0.25, 0.05, 0.008));
      hu.add(blade);
      tip = group(0, 0.5, 0);
      blade.add(tip);
      break;
    }
    case 'lance': {
      const horn = cone(0.07, 0.7, M.accent, 12);
      horn.rotation.x = Math.PI / 2 - 0.25;
      horn.position.set(0, 0.32, 0.6);
      hu.add(horn);
      tip = group(0, 0.4, 0.95);
      hu.add(tip);
      break;
    }
    case 'rifle': {
      back.add(box(0.2, 0.14, 0.4, M.secondary, 0, 0.12, 0.05));
      back.add(cyl(0.04, 0.04, 0.5, M.joint, 0, 0.15, 0.45).rotateX(Math.PI / 2));
      back.add(box(0.03, 0.03, 0.3, M.glow, 0.1, 0.12, 0.05, 0.008));
      muzzle = group(0, 0.15, 0.72);
      back.add(muzzle);
      tip = muzzle;
      break;
    }
    case 'hammer':
      tail2.add(box(0.3, 0.24, 0.24, M.primary, 0, 0, -0.38, 0.05));
      tail2.add(box(0.32, 0.05, 0.26, M.glow, 0, 0, -0.38, 0.02));
      tip = group(0, 0, -0.38);
      tail2.add(tip);
      break;
    case 'shield':
      for (const s of [1, -1]) {
        const sh = cyl(0.22, 0.22, 0.04, M.secondary, 0.14 * s, -0.04, 0, 6);
        sh.rotation.z = Math.PI / 2;
        legs[s > 0 ? 'FL' : 'FR'].leg.add(sh);
        legs[s > 0 ? 'FL' : 'FR'].leg.add(sphere(0.04, M.glow, 0.17 * s, -0.04, 0));
      }
      break;
    case 'claw':
      for (const n of ['FL', 'FR']) {
        for (let i = -1; i <= 1; i++) {
          const c = cone(0.025, 0.16, M.glow, 6);
          c.rotation.x = Math.PI / 2;
          c.position.set(i * 0.06, 0, 0.2);
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

// ── 浮遊型：大きな頭の体が浮かび、両手がまわりに浮かぶ ──
function buildFloater(k: Kit, body: THREE.Group) {
  const { M, box, cyl, sphere, group, mesh } = k;
  const P = k.spec.parts;
  const coreG = group(0, 1.08, 0);
  body.add(coreG);
  const shell = buildHeadUnit(k, P.head);
  shell.scale.setScalar(1.45);
  shell.position.set(0, -0.42, 0);
  coreG.add(shell);
  const under = sphere(P.legs === 'heavy' ? 0.4 : 0.34, M.secondary, 0, -0.38, 0);
  under.scale.y = 0.6;
  coreG.add(under);
  coreG.add(box(0.5, 0.06, 0.5, M.accent, 0, -0.38, 0, 0.03));
  coreG.add(cyl(0.14, 0.06, 0.12, M.glow, 0, -0.62, 0));
  if (P.legs === 'thruster') {
    for (const s of [1, -1]) {
      const f = box(0.04, 0.22, 0.2, M.accent, 0.22 * s, -0.55, -0.05, 0.015);
      f.rotation.z = 0.35 * s;
      coreG.add(f);
    }
  }
  const core = sphere(0.075, M.glow, 0, -0.22, 0.36);
  coreG.add(core);
  if (P.body === 'heavy') coreG.add(box(1.02, 0.12, 0.7, M.secondary, 0, -0.26, 0, 0.04));

  // まわりを回る輪
  const ringPivot = group(0, -0.2, 0);
  ringPivot.rotation.x = Math.PI / 2 - 0.35;
  coreG.add(ringPivot);
  const ringGeo = new THREE.TorusGeometry(P.body === 'slim' ? 0.62 : 0.7, 0.025, 8, 64);
  const ringMat = new THREE.MeshStandardMaterial({ color: M.glow.color, emissive: M.glow.color, emissiveIntensity: 1.1, toneMapped: false });
  const ring = mesh(ringGeo, ringMat);
  k.extraMats.push(ringMat);
  ringPivot.add(ring);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    ring.add(box(0.08, 0.08, 0.08, M.accent, Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0, 0.02));
  }

  // 浮かぶ両手（支点を体の中心に置き、回して動かす）
  const makeHand = (s: 1 | -1) => {
    const pivot = group(0, -0.05, 0);
    coreG.add(pivot);
    const hand = group(0.66 * s, -0.42, 0.08);
    hand.rotation.x = -0.55; // 武器が斜め上を向くように
    pivot.add(hand);
    const heavy = P.arms === 'heavy';
    hand.add(box(heavy ? 0.28 : 0.22, heavy ? 0.26 : 0.2, heavy ? 0.28 : 0.22, M.primary, 0, 0, 0, 0.05));
    hand.add(box(heavy ? 0.3 : 0.24, 0.06, heavy ? 0.3 : 0.24, M.secondary, 0, 0.12, 0, 0.02));
    hand.add(box(0.1, 0.03, 0.03, M.glow, 0, 0.16, 0.1, 0.01));
    if (P.arms === 'blade') {
      const b = box(0.025, 0.08, 0.4, M.glow, 0.12 * s, 0, -0.08, 0.01);
      b.rotation.x = 0.3;
      hand.add(b);
    }
    return { pivot, hand };
  };
  const L = makeHand(1);
  const R = makeHand(-1);
  const { tip, muzzle } = attachHandWeapon(k, R.hand, L.hand, L.hand);

  const back = group(0, 0.05, -0.5);
  coreG.add(back);
  buildBack(k, back, 'floater');

  return {
    bones: { core: coreG, handL: L.pivot, handR: R.pivot },
    tip, muzzle, core, chestY: 1.08, spins: [{ obj: ring, speed: 1.1 }],
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
      M.eye.emissiveIntensity = 3.2 * v;
      M.glow.emissiveIntensity = 2.6 * v;
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
