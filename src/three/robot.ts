// 設計図から、部品を組み合わせて SD ロボを作る（プラモ方式）。
// 骨組み（関節のグループ）を持たせ、ポーズで動かす。前は +z、足元が y=0。

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { CharacterSpec } from '../game/types';
import { ELEMENT_INFO } from '../game/data';
import { Ease, lerp, type EaseFn, type Tweener } from './anim';

export const BONES = [
  'hips', 'torso', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR',
] as const;
export type BoneName = (typeof BONES)[number];
export type Pose = Partial<Record<BoneName, [number, number, number]>>;

export interface Robot {
  spec: CharacterSpec;
  root: THREE.Group; // 場所と向き
  body: THREE.Group; // 揺れ・倒れ
  bones: Record<BoneName, THREE.Group>;
  tip: THREE.Object3D; // 武器の先
  muzzle: THREE.Object3D; // 撃つところ
  core: THREE.Object3D; // 胸のコア
  eyeMat: THREE.MeshStandardMaterial;
  glowMat: THREE.MeshStandardMaterial;
  setFlash(v: number): void;
  setEyes(v: number): void;
  dispose(): void;
}

function makeMats(spec: CharacterSpec) {
  const el = ELEMENT_INFO[spec.element].color;
  const std = (color: string, metalness: number, roughness: number) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const primary = std(spec.colors.primary, 0.35, 0.38);
  const secondary = std(spec.colors.secondary, 0.4, 0.35);
  const accent = std(spec.colors.accent, 0.85, 0.22);
  const joint = std('#23262e', 0.6, 0.5);
  const eye = new THREE.MeshStandardMaterial({
    color: spec.colors.eye,
    emissive: spec.colors.eye,
    emissiveIntensity: 3.2,
    toneMapped: false,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: el,
    emissive: el,
    emissiveIntensity: 2.6,
    toneMapped: false,
  });
  return { primary, secondary, accent, joint, eye, glow };
}

export function buildRobot(spec: CharacterSpec): Robot {
  const M = makeMats(spec);
  const geos: THREE.BufferGeometry[] = [];
  const P = spec.parts;
  const W = P.body === 'slim' ? 0.86 : P.body === 'heavy' ? 1.16 : 1;

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

  const root = new THREE.Group();
  const body = group();
  root.add(body);

  // ── 腰 ──
  const hips = group(0, 0.68, 0);
  body.add(hips);
  hips.add(box(0.46 * W, 0.2, 0.32, M.secondary));
  hips.add(box(0.14, 0.14, 0.08, M.accent, 0, -0.04, 0.17));

  // ── 胴 ──
  const torso = group(0, 0.1, 0);
  hips.add(torso);
  torso.add(box(0.34 * W, 0.16, 0.26, M.joint, 0, 0.08, 0));
  torso.add(box(0.64 * W, 0.36, 0.42, M.primary, 0, 0.32, 0, 0.06));
  torso.add(box(0.5 * W, 0.08, 0.2, M.secondary, 0, 0.52, 0.06));
  torso.add(box(0.2 * W, 0.14, 0.05, M.secondary, 0.17 * W, 0.37, 0.21));
  torso.add(box(0.2 * W, 0.14, 0.05, M.secondary, -0.17 * W, 0.37, 0.21));
  const core = sphere(0.07, M.glow, 0, 0.3, 0.215);
  torso.add(core);
  if (P.body === 'heavy') {
    torso.add(box(0.7 * W, 0.12, 0.46, M.secondary, 0, 0.16, 0));
  }

  // ── 頭 ──
  const head = group(0, 0.56, 0);
  head.scale.setScalar(1.24); // SD らしく頭を大きく
  torso.add(head);
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

  switch (P.head) {
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

  // ── 腕 ──
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

  // ── 武器（右手） ──
  let tip: THREE.Object3D = R.hand;
  let muzzle: THREE.Object3D = R.hand;
  const H = R.hand;
  switch (P.weapon) {
    case 'sword': {
      H.add(cyl(0.025, 0.025, 0.16, M.joint, 0, 0, 0).rotateX(Math.PI / 2));
      H.add(box(0.2, 0.05, 0.05, M.accent, 0, 0, 0.1));
      H.add(box(0.05, 0.11, 0.8, M.primary, 0, 0, 0.52, 0.02));
      H.add(box(0.06, 0.03, 0.82, M.glow, 0, 0.065, 0.53, 0.01));
      tip = group(0, 0, 0.95);
      H.add(tip);
      break;
    }
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
    case 'rifle': {
      H.add(box(0.12, 0.17, 0.56, M.secondary, 0, 0.05, 0.16));
      H.add(cyl(0.035, 0.035, 0.42, M.joint, 0, 0.08, 0.62).rotateX(Math.PI / 2));
      H.add(box(0.06, 0.06, 0.18, M.accent, 0, 0.17, 0.12));
      H.add(box(0.04, 0.03, 0.3, M.glow, 0.065, 0.05, 0.2, 0.01));
      muzzle = group(0, 0.08, 0.86);
      H.add(muzzle);
      tip = muzzle;
      break;
    }
    case 'hammer': {
      H.add(cyl(0.03, 0.03, 0.8, M.joint, 0, 0, 0.3).rotateX(Math.PI / 2));
      H.add(box(0.4, 0.28, 0.28, M.primary, 0, 0, 0.75, 0.05));
      H.add(box(0.42, 0.06, 0.3, M.glow, 0, 0, 0.75, 0.02));
      tip = group(0, 0, 0.75);
      H.add(tip);
      break;
    }
    case 'shield': {
      const sh = cyl(0.3, 0.3, 0.05, M.secondary, 0.12, -0.12, 0, 6);
      sh.rotation.z = Math.PI / 2;
      L.fore.add(sh);
      const rim = cyl(0.18, 0.18, 0.06, M.accent, 0.13, -0.12, 0, 6);
      rim.rotation.z = Math.PI / 2;
      L.fore.add(rim);
      L.fore.add(sphere(0.05, M.glow, 0.17, -0.12, 0));
      break;
    }
    case 'claw':
      for (const h of [L.hand, R.hand]) {
        for (let i = -1; i <= 1; i++) {
          const c = cone(0.025, 0.24, M.glow, 6);
          c.position.set(i * 0.045, -0.13, 0.04);
          c.rotation.x = Math.PI;
          h.add(c);
        }
      }
      break;
    case 'none':
      R.hand.add(box(0.19, 0.06, 0.19, M.accent, 0, 0.07, 0, 0.02));
      L.hand.add(box(0.19, 0.06, 0.19, M.accent, 0, 0.07, 0, 0.02));
      break;
  }

  // ── 脚 ──
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

  // ── 背中 ──
  const back = group(0, 0.34, -0.22);
  torso.add(back);
  switch (P.back) {
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
      back.add(box(0.36, 0.3, 0.16, M.secondary, 0, 0, 0));
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
      back.add(box(0.36, 0.3, 0.16, M.secondary, 0, 0, 0));
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
    case 'cape': {
      const cape = box(0.66, 0.95, 0.03, M.secondary, 0, -0.38, -0.02, 0.012);
      cape.rotation.x = 0.12;
      back.add(cape);
      back.add(box(0.7, 0.06, 0.05, M.accent, 0, 0.08, 0.02, 0.02));
      break;
    }
    case 'none':
      back.add(box(0.36, 0.3, 0.16, M.secondary, 0, 0, 0));
      back.add(box(0.2, 0.04, 0.02, M.glow, 0, -0.06, -0.085, 0.008));
      break;
  }

  const bones: Record<BoneName, THREE.Group> = {
    hips,
    torso,
    head,
    armL: L.arm,
    armR: R.arm,
    foreL: L.fore,
    foreR: R.fore,
    legL: LL.leg,
    legR: LR.leg,
    shinL: LL.shin,
    shinR: LR.shin,
  };

  const flashMats = [M.primary, M.secondary, M.accent, M.joint];
  const setFlash = (v: number) => {
    for (const m of flashMats) {
      m.emissive.setRGB(1, 1, 1);
      m.emissiveIntensity = v * 0.45;
    }
  };
  const setEyes = (v: number) => {
    M.eye.emissiveIntensity = 3.2 * v;
    M.glow.emissiveIntensity = 2.6 * v;
  };
  const dispose = () => {
    geos.forEach((g) => g.dispose());
    Object.values(M).forEach((m) => m.dispose());
  };

  return { spec, root, body, bones, tip, muzzle, core, eyeMat: M.eye, glowMat: M.glow, setFlash, setEyes, dispose };
}

// ── ポーズ ──
export const POSES: Record<string, Pose> = {
  idle: {
    armL: [-0.35, 0, 0.28],
    foreL: [-0.95, 0, 0],
    armR: [-0.45, 0, -0.22],
    foreR: [-0.75, 0, 0],
    legL: [-0.18, 0, 0.06],
    shinL: [0.32, 0, 0],
    legR: [0.14, 0, -0.06],
    shinR: [0.16, 0, 0],
  },
  windup: {
    torso: [0, -0.5, 0],
    armR: [-2.8, 0, -0.35],
    foreR: [-0.35, 0, 0],
    armL: [-0.7, 0, 0.45],
    foreL: [-1.0, 0, 0],
    legL: [-0.35, 0, 0.08],
    shinL: [0.5, 0, 0],
    legR: [0.3, 0, -0.08],
    shinR: [0.25, 0, 0],
  },
  slash: {
    torso: [0.25, 0.55, 0],
    head: [0.1, -0.2, 0],
    armR: [-0.35, 0, 0.25],
    foreR: [-0.1, 0, 0],
    armL: [-0.2, 0, 0.6],
    foreL: [-0.6, 0, 0],
    legL: [-0.65, 0, 0.05],
    shinL: [0.6, 0, 0],
    legR: [0.45, 0, -0.05],
    shinR: [0.2, 0, 0],
  },
  pullback: {
    torso: [0, -0.45, 0],
    armR: [-0.9, 0, -0.3],
    foreR: [-1.9, 0, 0],
    armL: [-1.1, 0, 0.2],
    foreL: [-0.6, 0, 0],
    legL: [-0.3, 0, 0.06],
    shinL: [0.45, 0, 0],
    legR: [0.25, 0, -0.06],
    shinR: [0.2, 0, 0],
  },
  thrust: {
    torso: [0.15, 0.45, 0],
    armR: [-1.6, 0, 0.05],
    foreR: [-0.05, 0, 0],
    armL: [-0.3, 0, 0.5],
    foreL: [-1.2, 0, 0],
    legL: [-0.7, 0, 0.05],
    shinL: [0.55, 0, 0],
    legR: [0.5, 0, -0.05],
    shinR: [0.2, 0, 0],
  },
  aim: {
    torso: [0, 0.1, 0],
    head: [0.08, 0.05, 0],
    armR: [-1.57, 0, 0.05],
    foreR: [0, 0, 0],
    armL: [-1.35, 0, -0.45],
    foreL: [-0.55, 0, 0],
    legL: [-0.25, 0, 0.1],
    shinL: [0.35, 0, 0],
    legR: [0.2, 0, -0.1],
    shinR: [0.2, 0, 0],
  },
  guard: {
    torso: [0.25, 0, 0],
    head: [0.25, 0, 0],
    armL: [-1.25, 0, -0.55],
    foreL: [-1.6, 0, 0],
    armR: [-1.25, 0, 0.55],
    foreR: [-1.6, 0, 0],
    legL: [-0.45, 0, 0.12],
    shinL: [0.75, 0, 0],
    legR: [0.15, 0, -0.12],
    shinR: [0.5, 0, 0],
  },
  hit: {
    torso: [-0.45, 0.1, 0],
    head: [-0.35, 0, 0],
    armL: [-0.1, 0, 0.75],
    foreL: [-0.4, 0, 0],
    armR: [-0.1, 0, -0.75],
    foreR: [-0.4, 0, 0],
    legL: [0.2, 0, 0.1],
    legR: [-0.15, 0, -0.1],
    shinR: [0.3, 0, 0],
  },
  cast: {
    head: [-0.35, 0, 0],
    torso: [-0.12, 0, 0],
    armL: [-2.7, 0, 0.45],
    foreL: [-0.3, 0, 0],
    armR: [-2.7, 0, -0.45],
    foreR: [-0.3, 0, 0],
    legL: [0, 0, 0.18],
    legR: [0, 0, -0.18],
  },
  charge: {
    torso: [-0.18, 0, 0],
    head: [-0.12, 0, 0],
    armL: [-0.5, 0, 1.25],
    foreL: [-0.8, 0, 0],
    armR: [-0.5, 0, -1.25],
    foreR: [-0.8, 0, 0],
    legL: [-0.1, 0, 0.28],
    shinL: [0.3, 0, 0],
    legR: [0.1, 0, -0.28],
    shinR: [0.3, 0, 0],
  },
  uppercut: {
    torso: [-0.3, 0.5, 0],
    head: [-0.3, 0, 0],
    armR: [-3.0, 0, 0.1],
    foreR: [-0.1, 0, 0],
    armL: [-0.2, 0, 0.6],
    foreL: [-1.0, 0, 0],
    legL: [-0.5, 0, 0],
    shinL: [0.2, 0, 0],
    legR: [0.4, 0, 0],
    shinR: [0.6, 0, 0],
  },
  victory: {
    head: [-0.2, 0, 0],
    torso: [-0.05, 0, 0],
    armR: [-3.0, 0, -0.15],
    foreR: [0, 0, 0],
    armL: [-0.2, 0, 0.35],
    foreL: [-1.4, 0, 0],
    legL: [0, 0, 0.12],
    legR: [0, 0, -0.12],
  },
};

export function toPose(tw: Tweener, r: Robot, pose: Pose, dur: number, ease: EaseFn = Ease.outCubic) {
  const from = BONES.map((n) => r.bones[n].rotation.clone());
  const to = BONES.map((n) => pose[n] ?? [0, 0, 0]);
  return tw.add(
    dur,
    (k) => {
      BONES.forEach((n, i) => {
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
  BONES.forEach((n) => {
    const p = pose[n] ?? [0, 0, 0];
    r.bones[n].rotation.set(p[0], p[1], p[2]);
  });
}
