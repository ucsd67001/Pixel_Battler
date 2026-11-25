// 光・火花・ビーム・斬撃の弧など、演出の部品

import * as THREE from 'three';
import { Ease } from './anim';

let glowTexture: THREE.Texture | null = null;
function glowTex() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

interface Particle {
  s: THREE.Sprite;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  grow: number;
  gravity: number;
  drag: number;
}

interface Fx {
  t: number;
  dur: number;
  update: (k: number, dt: number) => void;
  done?: () => void;
}

export const hot = (color: THREE.ColorRepresentation, k = 2.5) => new THREE.Color(color).multiplyScalar(k);

export function addMat(color: THREE.ColorRepresentation, k = 2.5, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color: hot(color, k),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

export interface BurstOpts {
  count?: number;
  speed?: number;
  size?: number;
  life?: number;
  gravity?: number;
  up?: number;
  drag?: number;
  grow?: number;
  spread?: THREE.Vector3;
  bright?: number;
}

export class Effects {
  private particles: Particle[] = [];
  private fx: Fx[] = [];
  constructor(private scene: THREE.Scene) {}

  update(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.v.y -= p.gravity * dt;
      p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.s.position.addScaledVector(p.v, dt);
      const k = Math.max(0, p.life / p.max);
      const sz = p.size * (1 + (1 - k) * p.grow);
      p.s.scale.set(sz, sz, sz);
      (p.s.material as THREE.SpriteMaterial).opacity = k;
    }
    const dead = this.particles.filter((p) => p.life <= 0);
    if (dead.length) {
      for (const p of dead) {
        this.scene.remove(p.s);
        p.s.material.dispose();
      }
      this.particles = this.particles.filter((p) => p.life > 0);
    }
    const finished: Fx[] = [];
    for (const f of this.fx) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.update(k, dt);
      if (k >= 1) finished.push(f);
    }
    if (finished.length) {
      this.fx = this.fx.filter((f) => !finished.includes(f));
      finished.forEach((f) => f.done?.());
    }
  }

  private run(dur: number, update: (k: number, dt: number) => void, done?: () => void): Promise<void> {
    return new Promise((resolve) => {
      this.fx.push({
        t: 0,
        dur,
        update,
        done: () => {
          done?.();
          resolve();
        },
      });
    });
  }

  private temp(obj: THREE.Object3D, dur: number, update: (k: number) => void) {
    this.scene.add(obj);
    return this.run(dur, update, () => {
      this.scene.remove(obj);
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (m.material as THREE.Material).dispose();
      });
    });
  }

  burst(pos: THREE.Vector3, color: THREE.ColorRepresentation, o: BurstOpts = {}) {
    const count = o.count ?? 24;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: glowTex(),
        color: hot(color, o.bright ?? 2.2),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const s = new THREE.Sprite(mat);
      s.position.copy(pos);
      if (o.spread) {
        s.position.x += (Math.random() - 0.5) * o.spread.x;
        s.position.y += (Math.random() - 0.5) * o.spread.y;
        s.position.z += (Math.random() - 0.5) * o.spread.z;
      }
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const sp = (o.speed ?? 4) * (0.4 + Math.random() * 0.8);
      const v = dir.multiplyScalar(sp);
      v.y += o.up ?? 0;
      const life = (o.life ?? 0.5) * (0.6 + Math.random() * 0.6);
      const size = (o.size ?? 0.25) * (0.6 + Math.random() * 0.8);
      s.scale.setScalar(size);
      this.scene.add(s);
      this.particles.push({ s, v, life, max: life, size, grow: o.grow ?? 0, gravity: o.gravity ?? 0, drag: o.drag ?? 1.5 });
    }
  }

  ring(pos: THREE.Vector3, color: THREE.ColorRepresentation, radius = 2, dur = 0.5, flat = true, width = 0.12) {
    const geo = new THREE.RingGeometry(1 - width, 1, 64);
    const mesh = new THREE.Mesh(geo, addMat(color, 2.5));
    mesh.position.copy(pos);
    if (flat) mesh.rotation.x = -Math.PI / 2;
    return this.temp(mesh, dur, (k) => {
      const s = 0.1 + Ease.outCubic(k) * radius;
      mesh.scale.set(s, s, s);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    });
  }

  sphere(pos: THREE.Vector3, color: THREE.ColorRepresentation, radius = 1.5, dur = 0.6) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), addMat(color, 2.2, 0.9));
    mesh.position.copy(pos);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 16), addMat('#ffffff', 2.5, 1));
    mesh.add(core);
    return this.temp(mesh, dur, (k) => {
      const s = 0.05 + Ease.outExpo(k) * radius;
      mesh.scale.setScalar(s);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      (core.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k * 2);
    });
  }

  beam(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, width = 0.45, dur = 0.9, glow = 1) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const g = new THREE.Group();
    g.position.copy(from).addScaledVector(dir, 0.5);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), addMat(color, 2.2 * glow, 0.85 * glow));
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 16, 1, true), addMat('#ffffff', 3 * glow, glow));
    g.add(outer, inner);
    return this.temp(g, dur, (k) => {
      const grow = k < 0.15 ? Ease.outCubic(k / 0.15) : k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      const wob = 1 + Math.sin(k * 60) * 0.06;
      const w = width * grow * wob;
      outer.scale.set(w, len, w);
      inner.scale.set(w, len, w);
    });
  }

  arc(pos: THREE.Vector3, color: THREE.ColorRepresentation, radius = 1.1, rot = new THREE.Euler(), dur = 0.35, arcLen = Math.PI * 1.1) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 48, arcLen), addMat(color, 3, 1));
    mesh.position.copy(pos);
    mesh.rotation.copy(rot);
    return this.temp(mesh, dur, (k) => {
      const s = radius * (0.7 + Ease.outCubic(k) * 0.5);
      mesh.scale.set(s, s, s * (1 + k * 4));
      mesh.rotation.z = rot.z + k * 0.8;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    });
  }

  projectile(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, dur = 0.2, size = 0.14) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 10), addMat(color, 3, 1));
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex(), color: hot(color, 2), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    halo.scale.setScalar(size * 6);
    mesh.add(halo);
    mesh.position.copy(from);
    let last = 0;
    return this.temp(mesh, dur, (k) => {
      mesh.position.lerpVectors(from, to, k);
      if (k - last > 0.08) {
        last = k;
        this.burst(mesh.position, color, { count: 2, speed: 0.4, size: size * 2.5, life: 0.25 });
      }
    });
  }

  // しばらくのあいだ、足元から光の粒が立ちのぼる
  aura(pos: () => THREE.Vector3, color: THREE.ColorRepresentation, dur = 1, rate = 60, radius = 0.6) {
    let acc = 0;
    return this.run(dur, (_k, dt) => {
      acc += dt * rate;
      const p = pos();
      while (acc >= 1) {
        acc--;
        const a = Math.random() * Math.PI * 2;
        const at = new THREE.Vector3(p.x + Math.cos(a) * radius, p.y + Math.random() * 0.3, p.z + Math.sin(a) * radius);
        this.burst(at, color, { count: 1, speed: 0.3, up: 2.2 + Math.random() * 1.5, size: 0.16, life: 0.7, drag: 0.2 });
      }
    });
  }

  /**
   * 魔法陣（つえの魔法。2026-11-26）。二重の円・三角を二つ重ねた星・小さな玉。
   * face の向きに面を向けて、くるっと回りながら開き、hold 秒とどまってから消える
   */
  magicCircle(pos: THREE.Vector3, color: THREE.ColorRepresentation, face: THREE.Vector3, radius = 0.6, hold = 0.5) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.clone().normalize());
    const outer = new THREE.Group(); // 外の円と玉（右回り）
    const inner = new THREE.Group(); // 星と内の円（左回り）
    g.add(outer, inner);
    const mats: THREE.MeshBasicMaterial[] = [];
    const m = (k: number, op = 1) => {
      const x = addMat(color, k, op);
      mats.push(x);
      return x;
    };
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1, 48), m(1.2, 0.22)); // うっすら光る面
    g.add(glow);
    outer.add(new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 72), m(2.8)));
    outer.add(new THREE.Mesh(new THREE.RingGeometry(0.76, 0.79, 72), m(2.4)));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), m(3));
      dot.position.set(Math.cos(a) * 0.865, Math.sin(a) * 0.865, 0);
      outer.add(dot);
    }
    for (const a of [Math.PI / 2, -Math.PI / 2]) {
      inner.add(new THREE.Mesh(new THREE.RingGeometry(0.68, 0.74, 3, 1, a, Math.PI * 2), m(2.6)));
    }
    inner.add(new THREE.Mesh(new THREE.RingGeometry(0.3, 0.33, 48), m(2.4)));
    const open = 0.22;
    const total = open + hold + 0.25;
    return this.temp(g, total, (k) => {
      const t = k * total;
      const s = t < open ? Ease.outBack(t / open) : 1;
      g.scale.setScalar(Math.max(0.01, s * radius));
      outer.rotation.z = t * 2.2;
      inner.rotation.z = -t * 3;
      const fade = t > open + hold ? 1 - (t - open - hold) / 0.25 : 1;
      mats.forEach((x, i) => (x.opacity = (i === 0 ? 0.22 : 1) * Math.max(0, fade)));
    });
  }

  // 中心へ吸い込まれる光（ためる）
  gather(pos: () => THREE.Vector3, color: THREE.ColorRepresentation, dur = 1, rate = 50) {
    let acc = 0;
    return this.run(dur, (_k, dt) => {
      acc += dt * rate;
      const p = pos();
      while (acc >= 1) {
        acc--;
        const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        const start = p.clone().addScaledVector(dir, 1.6);
        const mat = new THREE.SpriteMaterial({ map: glowTex(), color: hot(color, 2.4), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
        const s = new THREE.Sprite(mat);
        s.position.copy(start);
        s.scale.setScalar(0.14);
        const life = 0.35;
        this.scene.add(s);
        this.particles.push({ s, v: dir.multiplyScalar(-1.6 / life), life, max: life, size: 0.14, grow: -0.5, gravity: 0, drag: 0 });
      }
    });
  }

  clear() {
    for (const p of this.particles) {
      this.scene.remove(p.s);
      p.s.material.dispose();
    }
    this.particles = [];
    const list = this.fx;
    this.fx = [];
    list.forEach((f) => f.done?.());
  }
}
