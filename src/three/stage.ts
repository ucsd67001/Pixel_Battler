// バトルフィールド（と、キャラ紹介の台座）。three.js の描画と、動きの演出をまとめる。

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CharacterSpec, UltStyle } from '../game/types';
import { ELEMENT_INFO } from '../game/data';
import { Ease, lerp, Tweener, type EaseFn } from './anim';
import { Effects, addMat } from './effects';
import { sfx } from '../lib/sfx';
import { buildRobot, posesOf, setPose, toPose, type Pose, type PoseName, type Robot } from './robot';

export type Side = 0 | 1;
export type StageMode = 'battle' | 'showcase';
type ImpactFn = (i: number) => void;

const ANGLED = [Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45];
const EXACT = [Math.PI / 2, -Math.PI / 2];

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  readonly tw = new Tweener();
  readonly fx: Effects;
  robots: (Robot | null)[] = [null, null];
  private guardFx: (THREE.Group | null)[] = [null, null];
  private down = [false, false];
  private clock = new THREE.Clock();
  private raf = 0;
  private ro: ResizeObserver;
  private timeScale = 1;
  speed = 1;
  private shakeAmt = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private basePos = new THREE.Vector3();
  private baseLook = new THREE.Vector3();
  private hemi: THREE.HemisphereLight;
  private key: THREE.DirectionalLight;
  private rims: THREE.PointLight[] = [];
  private dust: THREE.Points;
  private bg = new THREE.Color('#060a16');
  private t = 0;
  private stopTimer = 0;
  turntable = true;
  readonly homeX = [-1.75, 1.75];

  constructor(private container: HTMLElement, readonly mode: StageMode) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.style.display = 'block';
    r.domElement.style.width = '100%';
    r.domElement.style.height = '100%';
    container.appendChild(r.domElement);
    this.renderer = r;

    const s = this.scene;
    s.background = this.bg.clone();
    s.fog = new THREE.FogExp2('#060a16', mode === 'battle' ? 0.045 : 0.06);
    const pmrem = new THREE.PMREMGenerator(r);
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.55;
    pmrem.dispose();

    this.hemi = new THREE.HemisphereLight('#9ab8ff', '#22132e', 0.75);
    s.add(this.hemi);
    this.key = new THREE.DirectionalLight('#ffffff', 2.4);
    this.key.position.set(3, 7, 5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    const sc = this.key.shadow.camera;
    sc.left = sc.bottom = -5;
    sc.right = sc.top = 5;
    this.key.shadow.bias = -0.0005;
    s.add(this.key);
    const fill = new THREE.DirectionalLight('#7aa0ff', 0.6);
    fill.position.set(-4, 3, -3);
    s.add(fill);
    for (let i = 0; i < 2; i++) {
      const p = new THREE.PointLight('#ffffff', 10, 7, 1.6);
      p.position.set(this.homeX[i] * 1.2, 2.4, -1.6);
      s.add(p);
      this.rims.push(p);
    }

    this.buildArena();
    this.dust = this.buildDust();
    this.fx = new Effects(s);

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(s, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.5, 0.93);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    if (mode === 'battle') {
      this.basePos.set(0, 2.45, 7.6);
      this.baseLook.set(0, 1.2, 0);
    } else {
      this.basePos.set(0, 1.55, 5.3);
      this.baseLook.set(0, 1.18, 0);
    }
    this.camPos.copy(this.basePos);
    this.camLook.copy(this.baseLook);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.loop();
  }

  // ── 舞台 ──
  private buildArena() {
    const g = new THREE.Group();
    const floor = new THREE.MeshStandardMaterial({ color: '#121826', metalness: 0.75, roughness: 0.3 });
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.7, 0.3, 72), floor);
    plat.position.y = -0.15;
    plat.receiveShadow = true;
    g.add(plat);
    const ring = (r: number, tube: number, color: string, k: number) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 160), addMat(color, k));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.012;
      g.add(m);
      return m;
    };
    ring(4.3, 0.028, '#3ef0ff', 1.8);
    ring(2.7, 0.012, '#3ef0ff', 0.8);
    ring(0.9, 0.015, '#ff3df0', 1.2);
    const hex = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 6), addMat('#ff3df0', 1.2));
    hex.rotation.x = -Math.PI / 2;
    hex.position.y = 0.013;
    g.add(hex);
    const lane = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.004, 0.02), addMat('#3ef0ff', 0.6));
    lane.position.y = 0.012;
    g.add(lane);
    const grid = new THREE.GridHelper(90, 90, '#1d3a66', '#0e1a33');
    grid.position.y = -0.32;
    g.add(grid);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      if (Math.sin(a) > 0.1) continue; // カメラの前に柱を立てない
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 7, 0.12), addMat(i % 2 ? '#ff3df0' : '#3ef0ff', 1.4));
      p.position.set(Math.cos(a) * 11, 3.2, Math.sin(a) * 11);
      g.add(p);
    }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(9, 0.05, 8, 200), addMat('#ff3df0', 0.9));
    halo.position.set(0, 4.2, -11);
    g.add(halo);
    const halo2 = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.025, 8, 200), addMat('#3ef0ff', 0.7));
    halo2.position.set(0, 4.2, -11.2);
    g.add(halo2);
    this.scene.add(g);
  }

  private buildDust() {
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 1] = Math.random() * 9;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 26;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.05,
      color: new THREE.Color('#8fd8ff').multiplyScalar(1.6),
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    return pts;
  }

  // ── キャラを置く ──
  private clearRobots() {
    this.robots.forEach((r) => {
      if (r) {
        this.scene.remove(r.root);
        r.dispose();
      }
    });
    this.robots = [null, null];
    this.down = [false, false];
  }

  setFighters(a: CharacterSpec, b: CharacterSpec) {
    this.clearRobots();
    [a, b].forEach((spec, i) => {
      const r = buildRobot(spec);
      r.root.position.set(this.homeX[i], 0, 0);
      r.root.rotation.y = ANGLED[i];
      setPose(r, posesOf(r).idle);
      r.root.visible = false;
      this.scene.add(r.root);
      this.robots[i] = r;
      this.rims[i].color.set(ELEMENT_INFO[spec.element].color);
    });
  }

  setShowcase(spec: CharacterSpec) {
    this.clearRobots();
    const r = buildRobot(spec);
    r.root.rotation.y = 0.5;
    setPose(r, posesOf(r).idle);
    this.scene.add(r.root);
    this.robots[0] = r;
    this.rims[0].position.set(-1.6, 2.4, -1.6);
    this.rims[1].position.set(1.6, 2.4, -1.6);
    this.rims[0].color.set(ELEMENT_INFO[spec.element].color);
    this.rims[1].color.set(spec.colors.eye);
  }

  // ── 描画の繰り返し ──
  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    const wasHome = this.camPos.distanceTo(this.basePos) < 0.01 && this.camLook.distanceTo(this.baseLook) < 0.01;
    if (this.mode === 'battle') {
      // 二体と少しの余白（左右に 3.1）が横に収まるところまで、カメラを引く
      this.camera.fov = 40;
      const tanH = Math.tan(THREE.MathUtils.degToRad(20)) * aspect;
      const dist = Math.max(7.6, 3.1 / tanH);
      this.basePos.set(0, 2.45 + (dist - 7.6) * 0.1, dist);
      this.baseLook.set(0, 1.2 + Math.min(0.5, (dist - 7.6) * 0.06), 0);
    } else {
      this.camera.fov = 38;
      const tanH = Math.tan(THREE.MathUtils.degToRad(19)) * aspect;
      const dist = Math.max(5.3, 1.5 / tanH);
      this.basePos.set(0, 1.55, dist);
    }
    if (wasHome) {
      this.camPos.copy(this.basePos);
      this.camLook.copy(this.baseLook);
    }
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const raw = Math.min(0.05, this.clock.getDelta());
    const dt = raw * this.timeScale * this.speed;
    this.t += dt;
    this.tw.update(dt);
    this.fx.update(dt);
    this.robots.forEach((r, i) => {
      if (!r || this.down[i]) return;
      const amp = r.form === 'floater' ? 0.07 : 0.025;
      r.body.position.y = Math.sin(this.t * (r.form === 'floater' ? 1.8 : 2.4) + i * 1.7) * amp;
      r.body.rotation.z = Math.sin(this.t * 1.2 + i) * 0.012;
    });
    this.robots.forEach((r) => r?.spins.forEach((sp) => (sp.obj.rotation.z += dt * sp.speed)));
    if (this.mode === 'showcase' && this.turntable && this.robots[0]) this.robots[0].root.rotation.y += raw * 0.45;
    this.dust.rotation.y += raw * 0.015;
    this.guardFx.forEach((g) => {
      if (g) g.rotation.y += raw * 0.8;
    });
    this.shakeAmt = Math.max(0, this.shakeAmt - raw * 1.6);
    const s = this.shakeAmt * 0.35;
    this.camera.position.set(
      this.camPos.x + (Math.random() - 0.5) * s,
      this.camPos.y + (Math.random() - 0.5) * s,
      this.camPos.z + (Math.random() - 0.5) * s * 0.5,
    );
    this.camera.lookAt(this.camLook);
    this.composer.render(raw);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.stopTimer);
    this.ro.disconnect();
    this.tw.clear();
    this.fx.clear();
    this.clearRobots();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── 小さな道具 ──
  wait(sec: number) {
    return this.tw.wait(sec);
  }
  private color(side: Side) {
    return ELEMENT_INFO[this.robots[side]!.spec.element].color;
  }
  private dir(side: Side) {
    return side === 0 ? 1 : -1;
  }
  private chest(side: Side, y?: number) {
    const r = this.robots[side]!;
    const p = r.root.position;
    return new THREE.Vector3(p.x, p.y + (y ?? r.chestY), p.z);
  }
  private feet(side: Side) {
    const p = this.robots[side]!.root.position;
    return new THREE.Vector3(p.x, 0.02, p.z);
  }
  private world(o: THREE.Object3D) {
    return o.getWorldPosition(new THREE.Vector3());
  }
  shake(a: number) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }
  private hitStop(ms: number, scale = 0.08) {
    this.timeScale = scale;
    clearTimeout(this.stopTimer);
    this.stopTimer = window.setTimeout(() => (this.timeScale = 1), ms / this.speed);
  }
  private camTo(pos: THREE.Vector3, look: THREE.Vector3, dur: number, ease: EaseFn = Ease.inOutCubic) {
    const p0 = this.camPos.clone();
    const l0 = this.camLook.clone();
    return this.tw.add(
      dur,
      (k) => {
        this.camPos.lerpVectors(p0, pos, k);
        this.camLook.lerpVectors(l0, look, k);
      },
      ease,
    );
  }
  camHome(dur = 0.5) {
    return this.camTo(this.basePos, this.baseLook, dur);
  }
  private moveX(side: Side, x: number, dur: number, ease: EaseFn = Ease.inOutCubic) {
    const r = this.robots[side]!;
    const x0 = r.root.position.x;
    return this.tw.add(dur, (k) => (r.root.position.x = lerp(x0, x, k)), ease);
  }
  private face(side: Side, exact: boolean, dur = 0.2) {
    const r = this.robots[side]!;
    const y0 = r.root.rotation.y;
    const y1 = exact ? EXACT[side] : ANGLED[side];
    return this.tw.add(dur, (k) => (r.root.rotation.y = lerp(y0, y1, k)));
  }
  private pose(side: Side, p: Pose | PoseName, dur: number, ease?: EaseFn) {
    const r = this.robots[side]!;
    return toPose(this.tw, r, typeof p === 'string' ? posesOf(r)[p] : p, dur, ease);
  }
  private restPose(side: Side): PoseName {
    return this.guardFx[side] ? 'guard' : 'idle';
  }
  private dim(on: boolean, dur = 0.4) {
    const h0 = this.hemi.intensity;
    const k0 = this.key.intensity;
    const b0 = this.bloom.strength;
    const h1 = on ? 0.18 : 0.75;
    const k1 = on ? 0.6 : 2.4;
    const b1 = on ? 0.9 : 0.75;
    const bgFrom = (this.scene.background as THREE.Color).clone();
    const bgTo = on ? new THREE.Color('#020308') : this.bg;
    return this.tw.add(dur, (k) => {
      this.hemi.intensity = lerp(h0, h1, k);
      this.key.intensity = lerp(k0, k1, k);
      this.bloom.strength = lerp(b0, b1, k);
      (this.scene.background as THREE.Color).copy(bgFrom).lerp(bgTo, k);
    });
  }

  // 画面の上での位置（ダメージの数字を出す場所）
  project(side: Side, y = 2.3): { x: number; y: number } {
    const r = this.robots[side];
    if (!r) return { x: 0, y: 0 };
    const v = new THREE.Vector3(r.root.position.x, y, r.root.position.z).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * this.container.clientWidth,
      y: ((1 - v.y) / 2) * this.container.clientHeight,
    };
  }

  // ── 紹介の台座 ──
  async reveal() {
    const r = this.robots[0];
    if (!r) return;
    const c = ELEMENT_INFO[r.spec.element].color;
    r.root.scale.setScalar(0.01);
    sfx('reveal');
    this.fx.sphere(new THREE.Vector3(0, 1, 0), c, 1.6, 0.5);
    this.fx.ring(new THREE.Vector3(0, 0.03, 0), c, 2.4, 0.8);
    this.fx.burst(new THREE.Vector3(0, 1, 0), c, { count: 50, speed: 5, size: 0.2, life: 0.7 });
    this.shake(0.2);
    await this.tw.add(0.6, (k) => r.root.scale.setScalar(Math.max(0.01, k)), Ease.outBack);
    this.fx.aura(() => new THREE.Vector3(0, 0.05, 0), c, 1.2, 50, 0.7);
    await this.pose(0, 'victory', 0.45, Ease.outBack);
    await this.wait(0.7);
    await this.pose(0, 'idle', 0.5);
  }

  // ── バトルの演出 ──
  async intro() {
    this.camPos.set(0, 5.5, 13);
    this.camLook.set(0, 1.4, 0);
    const drop = async (i: Side) => {
      const r = this.robots[i]!;
      r.root.position.y = 6;
      r.root.visible = true;
      setPose(r, posesOf(r).cast);
      await this.tw.add(0.4, (k) => (r.root.position.y = lerp(6, 0, k)), Ease.inQuad);
      const c = this.color(i);
      sfx('land');
      this.fx.ring(this.feet(i), c, 2.4, 0.6);
      this.fx.burst(this.feet(i), c, { count: 30, speed: 4, up: 1.2, size: 0.22, life: 0.6 });
      this.shake(0.3);
      await this.pose(i, 'guard', 0.12);
      await this.pose(i, 'idle', 0.35, Ease.outBack);
    };
    await Promise.all([
      this.camTo(this.basePos, this.baseLook, 1.8, Ease.inOutCubic),
      (async () => {
        await this.wait(0.3);
        await drop(0);
        await this.wait(0.1);
        await drop(1);
      })(),
    ]);
  }

  async attack(side: Side, hits: number, onImpact: ImpactFn, variant: 'normal' | 'skill' | 'hex' = 'normal') {
    const w = this.robots[side]!.spec.parts.weapon;
    if (variant === 'hex') return this.orb(side, onImpact);
    if (w === 'rifle') return this.shoot(side, hits, onImpact, variant === 'skill');
    return this.melee(side, hits, onImpact);
  }

  private async melee(side: Side, hits: number, onImpact: ImpactFn, fast = false) {
    const r = this.robots[side]!;
    const foe = (1 - side) as Side;
    const dir = this.dir(side);
    const c = this.color(side);
    const swing = ['sword', 'hammer'].includes(r.spec.parts.weapon);
    const wind = swing ? 'windup' : 'pullback';
    const strike = swing ? 'slash' : 'thrust';
    const home = this.homeX[side];
    const tx = this.homeX[foe] - dir * 1.2;
    this.fx.burst(this.feet(side), '#9fb4d8', { count: 10, speed: 1.6, up: 0.6, size: 0.2, life: 0.4 });
    await Promise.all([
      this.pose(side, wind, fast ? 0.14 : 0.2),
      this.face(side, true, 0.2),
      this.moveX(side, tx, fast ? 0.18 : 0.24, Ease.inCubic),
    ]);
    for (let i = 0; i < hits; i++) {
      sfx('swing');
      await this.pose(side, strike, 0.09, Ease.outQuad);
      const at = this.chest(foe);
      if (swing) {
        this.fx.arc(at, c, 1.0, new THREE.Euler((Math.random() - 0.5) * 0.8, 0, -0.4 - Math.random() * 0.8), 0.3);
      } else {
        this.fx.ring(at, c, 0.9, 0.25, false, 0.2);
      }
      onImpact(i);
      if (i < hits - 1) await this.pose(side, wind, 0.12);
    }
    await this.wait(0.22);
    await Promise.all([
      this.pose(side, 'idle', 0.32),
      this.moveX(side, home, 0.34),
      this.face(side, false, 0.34),
    ]);
  }

  private async shoot(side: Side, hits: number, onImpact: ImpactFn, heavy: boolean) {
    const r = this.robots[side]!;
    const foe = (1 - side) as Side;
    const c = this.color(side);
    await Promise.all([this.pose(side, 'aim', 0.2), this.face(side, true, 0.2)]);
    for (let i = 0; i < hits; i++) {
      const from = this.world(r.muzzle);
      sfx('shot');
      this.fx.burst(from, c, { count: 10, speed: 2.4, size: 0.25, life: 0.15 });
      await this.fx.projectile(from, this.chest(foe), c, 0.16, heavy ? 0.2 : 0.12);
      this.fx.burst(this.chest(foe), c, { count: 16, speed: 4, size: 0.2, life: 0.3 });
      onImpact(i);
      await this.wait(0.1);
    }
    await this.wait(0.15);
    await Promise.all([this.pose(side, 'idle', 0.3), this.face(side, false, 0.3)]);
  }

  private async orb(side: Side, onImpact: ImpactFn) {
    const r = this.robots[side]!;
    const foe = (1 - side) as Side;
    const c = '#b05cff';
    await Promise.all([this.pose(side, 'aim', 0.2), this.face(side, true, 0.2)]);
    const from = this.world(r.tip);
    sfx('orb');
    this.fx.gather(() => from, c, 0.35, 60);
    await this.wait(0.35);
    await this.fx.projectile(from, this.chest(foe), c, 0.45, 0.22);
    this.fx.sphere(this.chest(foe), c, 0.9, 0.4);
    this.fx.burst(this.chest(foe), c, { count: 20, speed: 2, size: 0.22, life: 0.6, gravity: 2 });
    onImpact(0);
    await this.wait(0.3);
    await Promise.all([this.pose(side, 'idle', 0.3), this.face(side, false, 0.3)]);
  }

  async skillCast(side: Side) {
    const r = this.robots[side]!;
    const c = this.color(side);
    sfx('skill');
    this.fx.ring(this.feet(side), c, 1.6, 0.6);
    this.fx.aura(() => this.feet(side), c, 0.7, 70, 0.55);
    this.fx.gather(() => this.world(r.core), c, 0.6, 60);
    await this.pose(side, 'cast', 0.25, Ease.outBack);
    await this.wait(0.5);
  }

  async healFx(side: Side) {
    const c = '#5dffa0';
    sfx('heal');
    this.fx.ring(this.feet(side), c, 1.4, 0.6);
    this.fx.burst(this.chest(side, 0.6), c, { count: 26, speed: 0.6, up: 2.2, size: 0.2, life: 0.9, drag: 0.4, spread: new THREE.Vector3(1, 1.2, 1) });
    await this.wait(0.5);
  }

  async buffFx(side: Side, good: boolean) {
    const c = good ? '#ffd84a' : '#b05cff';
    sfx(good ? 'buff' : 'debuff');
    if (good) {
      this.fx.aura(() => this.feet(side), c, 0.5, 60, 0.5);
      this.fx.ring(this.feet(side), c, 1.3, 0.5);
    } else {
      this.fx.burst(this.chest(side, 2.4), c, { count: 24, speed: 0.4, up: -2.5, size: 0.2, life: 0.7, drag: 0.2, spread: new THREE.Vector3(1, 0.3, 1) });
      this.fx.ring(this.feet(side), c, 1.2, 0.5);
    }
    await this.wait(0.45);
  }

  async counterStance(side: Side) {
    const r = this.robots[side]!;
    await this.pose(side, 'guard', 0.18);
    sfx('counter');
    this.fx.ring(this.chest(side), '#ffd84a', 1.3, 0.5, false, 0.1);
    this.fx.burst(this.world(r.core), '#ffd84a', { count: 20, speed: 2.5, size: 0.18, life: 0.4 });
    await this.wait(0.45);
    await this.pose(side, 'idle', 0.25);
  }

  async counterStrike(side: Side, onImpact: ImpactFn) {
    sfx('counter');
    this.fx.burst(this.chest(side), '#ffd84a', { count: 16, speed: 3, size: 0.2, life: 0.3 });
    await this.melee(side, 1, onImpact, true);
  }

  async guard(side: Side) {
    const c = this.color(side);
    await this.pose(side, 'guard', 0.2, Ease.outBack);
    sfx('guard');
    this.setGuard(side, true, c);
    await this.wait(0.3);
  }

  setGuard(side: Side, on: boolean, color?: string) {
    const old = this.guardFx[side];
    if (on && !old) {
      const c = color ?? this.color(side);
      const g = new THREE.Group();
      const shellMat = addMat(c, 1.5, 0.45);
      shellMat.wireframe = true;
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), shellMat));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.96, 24, 16), addMat(c, 0.6, 0.12)));
      g.position.copy(this.chest(side, 0.95));
      g.position.x += this.dir(side) * 0.15;
      g.scale.setScalar(0.01);
      this.scene.add(g);
      this.guardFx[side] = g;
      this.tw.add(0.25, (k) => g.scale.setScalar(Math.max(0.01, k * 1.05)), Ease.outBack);
    } else if (!on && old) {
      this.guardFx[side] = null;
      this.tw
        .add(0.2, (k) => old.scale.setScalar(Math.max(0.01, 1.05 * (1 - k))))
        .then(() => {
          this.scene.remove(old);
          old.traverse((o) => {
            const m = o as THREE.Mesh;
            m.geometry?.dispose();
            (m.material as THREE.Material | undefined)?.dispose();
          });
        });
      if (!this.down[side] && this.robots[side]) this.pose(side, 'idle', 0.25);
    }
  }

  hit(side: Side, o: { crit?: boolean; guarded?: boolean; big?: boolean } = {}) {
    const r = this.robots[side];
    if (!r || this.down[side]) return;
    sfx(o.guarded ? 'guard' : o.crit || o.big ? 'crit' : 'hit');
    r.setFlash(1);
    this.tw.add(0.22, (k) => r.setFlash(1 - k), Ease.linear);
    const at = this.chest(side);
    this.fx.burst(at, o.guarded ? '#9fd8ff' : '#ffb347', {
      count: o.big ? 40 : o.crit ? 28 : 16,
      speed: o.big ? 7 : 5,
      size: 0.22,
      life: 0.35,
    });
    if (o.crit || o.big) this.fx.ring(at, '#ffffff', o.big ? 2.4 : 1.4, 0.35, false, 0.08);
    const g = this.guardFx[side];
    if (g) this.tw.add(0.2, (k) => g.scale.setScalar(1.05 + Math.sin(k * Math.PI) * 0.15), Ease.linear);
    this.shake(o.big ? 0.5 : o.crit ? 0.32 : o.guarded ? 0.06 : 0.14);
    if (o.crit || o.big) this.hitStop(o.big ? 140 : 90);
    const back = side === 0 ? -1 : 1;
    const push = o.big ? 0.5 : o.guarded ? 0.08 : 0.22;
    const home = this.homeX[side];
    (async () => {
      const x = r.root.position.x;
      await Promise.all([
        this.pose(side, o.guarded ? 'guard' : 'hit', 0.06),
        this.tw.add(0.08, (k) => (r.root.position.x = x + back * push * k)),
      ]);
      if (this.down[side]) return;
      await Promise.all([
        this.pose(side, this.restPose(side), 0.32),
        this.tw.add(0.32, (k) => (r.root.position.x = lerp(x + back * push, home, k))),
      ]);
    })();
  }

  async ko(side: Side) {
    const r = this.robots[side];
    if (!r) return;
    this.down[side] = true;
    this.setGuard(side, false);
    sfx('ko');
    const at = this.chest(side);
    this.fx.sphere(at, '#ffaa55', 1.7, 0.6);
    this.fx.burst(at, '#ffcc66', { count: 60, speed: 7, size: 0.26, life: 0.7 });
    this.shake(0.6);
    this.hitStop(200, 0.15);
    const back = side === 0 ? -1 : 1;
    const x0 = r.root.position.x;
    const boom = async () => {
      for (let i = 0; i < 3; i++) {
        await this.wait(0.22);
        const p = this.chest(side, 0.4 + Math.random() * 0.6);
        p.x += (Math.random() - 0.5) * 0.8;
        sfx('boom');
        this.fx.sphere(p, '#ff7a3a', 0.7, 0.4);
        this.fx.burst(p, '#ffaa55', { count: 18, speed: 4, size: 0.2, life: 0.4 });
        this.shake(0.25);
      }
    };
    await Promise.all([
      boom(),
      this.pose(side, 'hit', 0.15),
      this.tw.add(
        0.75,
        (k) => {
          if (r.form === 'beast') {
            r.body.rotation.z = 1.4 * k * -back;
            r.body.position.y = 0.28 * k;
          } else if (r.form === 'floater') {
            r.body.rotation.x = -0.5 * k;
            r.body.position.y = -0.4 * k;
          } else {
            r.body.rotation.x = -1.42 * k;
            r.body.position.y = 0.3 * k;
          }
          r.root.position.x = x0 + back * 0.6 * k;
          r.setEyes(1 - k * 0.95);
        },
        Ease.outCubic,
      ),
    ]);
    this.fx.burst(this.feet(side), '#9fb4d8', { count: 24, speed: 2.5, up: 0.8, size: 0.25, life: 0.6 });
    this.shake(0.3);
    await this.wait(0.4);
  }

  async victory(side: Side) {
    const r = this.robots[side]!;
    const c = this.color(side);
    await this.face(side, false, 0.2);
    const front = new THREE.Vector3(r.root.position.x + this.dir(side) * 1.8, 1.7, 4.9);
    const look = new THREE.Vector3(r.root.position.x, 1.15, 0);
    this.camTo(front, look, 0.9);
    await Promise.all([
      this.pose(side, 'victory', 0.4, Ease.outBack),
      this.tw.add(0.45, (k) => (r.root.position.y = Math.sin(k * Math.PI) * 0.45), Ease.linear),
    ]);
    this.fx.burst(this.chest(side, 2.2), c, { count: 40, speed: 3, size: 0.2, life: 1.0, gravity: 3, up: 3 });
    this.fx.aura(() => this.feet(side), c, 1.6, 40, 0.7);
  }

  // ── 必殺技 ──
  async ultimate(side: Side, style: UltStyle, hits: number, onImpact: ImpactFn, onBanner: () => void) {
    const r = this.robots[side]!;
    const foe = (1 - side) as Side;
    const c = this.color(side);
    const dir = this.dir(side);
    const home = this.homeX[side];
    const p = r.root.position;

    // ① 暗くして、寄る
    this.dim(true);
    const front = new THREE.Vector3(p.x + dir * 2.7, 1.55, p.z + 3.1);
    const look = new THREE.Vector3(p.x, r.chestY, p.z);
    sfx('charge');
    await Promise.all([this.camTo(front, look, 0.45), this.pose(side, 'charge', 0.35, Ease.outBack)]);
    this.fx.ring(this.feet(side), c, 2.3, 0.7);
    this.fx.aura(() => this.feet(side), c, 1.3, 40, 0.75);
    this.fx.gather(() => this.world(r.core), c, 1.1, 30);
    r.setEyes(1.8);
    sfx('cutin');
    onBanner();
    await this.wait(1.2);
    this.fx.sphere(this.world(r.core), c, 0.9, 0.35);
    this.shake(0.25);

    // ② 引いて、放つ
    const wide = this.basePos.clone().add(new THREE.Vector3(0, 0.4, 0.4));
    this.camTo(wide, this.baseLook, 0.35);
    switch (style) {
      case 'beam':
        await this.ultBeam(side, foe, c, onImpact);
        break;
      case 'slash':
        await this.ultSlash(side, foe, c, onImpact);
        break;
      case 'meteor':
        await this.ultMeteor(side, foe, c, hits, onImpact);
        break;
      case 'burst':
        await this.ultBurst(side, foe, c, onImpact);
        break;
      case 'rush':
        await this.ultRush(side, foe, c, hits, onImpact);
        break;
    }

    // ③ 戻る
    r.setEyes(1);
    this.dim(false, 0.6);
    this.camHome(0.6);
    await Promise.all([
      this.pose(side, 'idle', 0.35),
      this.moveX(side, home, 0.45),
      this.face(side, false, 0.4),
      this.tw.add(0.3, (k) => (r.root.position.y = lerp(r.root.position.y, 0, k))),
    ]);
  }

  private async ultBeam(side: Side, foe: Side, c: string, onImpact: ImpactFn) {
    const r = this.robots[side]!;
    await Promise.all([this.pose(side, 'aim', 0.2), this.face(side, true, 0.2)]);
    const from = this.world(r.tip);
    const to = this.chest(foe);
    to.x += this.dir(side) * 3;
    this.fx.sphere(from, c, 0.6, 0.3);
    sfx('beam');
    this.fx.beam(from, to, c, 0.55, 1.1);
    await this.wait(0.22);
    this.fx.sphere(this.chest(foe), c, 1.4, 0.6);
    this.fx.ring(this.feet(foe), c, 3, 0.7);
    onImpact(0);
    this.shake(0.55);
    await this.wait(0.9);
  }

  private async ultSlash(side: Side, foe: Side, c: string, onImpact: ImpactFn) {
    const dir = this.dir(side);
    await Promise.all([this.pose(side, 'windup', 0.18), this.face(side, true, 0.18)]);
    const pass = this.moveX(side, this.homeX[foe] + dir * 1.4, 0.2, Ease.inCubic);
    await this.wait(0.1);
    await this.pose(side, 'slash', 0.06);
    sfx('slash');
    const at = this.chest(foe);
    this.fx.arc(at, c, 1.9, new THREE.Euler(0.3, 0, -0.6), 0.6, Math.PI * 1.4);
    this.fx.arc(at, '#ffffff', 1.6, new THREE.Euler(0.3, 0, -0.5), 0.45, Math.PI * 1.2);
    this.fx.burst(at, c, { count: 50, speed: 7, size: 0.22, life: 0.5 });
    onImpact(0);
    this.hitStop(280, 0.1);
    this.shake(0.5);
    await pass;
    await this.wait(0.6);
  }

  private async ultMeteor(side: Side, foe: Side, c: string, hits: number, onImpact: ImpactFn) {
    const r = this.robots[side]!;
    await this.pose(side, 'cast', 0.25, Ease.outBack);
    this.camTo(this.basePos.clone().add(new THREE.Vector3(0, 1.2, 2)), new THREE.Vector3(0, 1.8, 0), 0.4);
    await this.tw.add(0.35, (k) => (r.root.position.y = 2.6 * k), Ease.outCubic);
    for (let i = 0; i < hits; i++) {
      const target = this.chest(foe);
      target.x += (Math.random() - 0.5) * 0.5;
      const from = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 8, -3));
      sfx('orb');
      await this.fx.projectile(from, target, c, 0.28, 0.34);
      sfx('boom');
      this.fx.sphere(target, c, 1.3, 0.45);
      this.fx.burst(target, c, { count: 30, speed: 6, size: 0.24, life: 0.5 });
      this.fx.ring(this.feet(foe), c, 2.2, 0.5);
      onImpact(i);
      this.shake(0.4);
      await this.wait(0.1);
    }
    await this.tw.add(0.3, (k) => (r.root.position.y = 2.6 * (1 - k)), Ease.inQuad);
    this.fx.ring(this.feet(side), c, 1.6, 0.4);
    this.shake(0.2);
    await this.wait(0.3);
  }

  private async ultBurst(side: Side, foe: Side, c: string, onImpact: ImpactFn) {
    const dir = this.dir(side);
    await Promise.all([
      this.pose(side, 'pullback', 0.2),
      this.face(side, true, 0.2),
      this.moveX(side, this.homeX[foe] - dir * 1.25, 0.24, Ease.inCubic),
    ]);
    await this.pose(side, 'thrust', 0.08);
    sfx('boom');
    const at = this.chest(foe);
    this.fx.sphere(at, c, 2.6, 0.8);
    this.fx.ring(this.feet(foe), c, 4, 0.8);
    this.fx.burst(at, c, { count: 70, speed: 9, size: 0.26, life: 0.7 });
    onImpact(0);
    this.hitStop(220, 0.1);
    this.shake(0.65);
    await this.wait(0.7);
  }

  private async ultRush(side: Side, foe: Side, c: string, hits: number, onImpact: ImpactFn) {
    const dir = this.dir(side);
    await Promise.all([
      this.pose(side, 'pullback', 0.18),
      this.face(side, true, 0.18),
      this.moveX(side, this.homeX[foe] - dir * 1.1, 0.2, Ease.inCubic),
    ]);
    const seq: PoseName[] = ['thrust', 'slash', 'thrust', 'slash'];
    for (let i = 0; i < hits; i++) {
      const last = i === hits - 1;
      if (last) await this.pose(side, 'pullback', 0.12);
      sfx(last ? 'slash' : 'swing');
      await this.pose(side, last ? 'uppercut' : seq[i % seq.length], last ? 0.1 : 0.07, Ease.outQuad);
      const at = this.chest(foe);
      at.y += (Math.random() - 0.5) * 0.5;
      this.fx.arc(at, i % 2 ? '#ffffff' : c, last ? 1.6 : 0.9, new THREE.Euler(Math.random(), 0, Math.random() * 3), 0.3);
      this.fx.burst(at, c, { count: last ? 50 : 14, speed: last ? 8 : 5, size: 0.22, life: 0.35 });
      if (last) this.fx.sphere(at, c, 1.5, 0.5);
      onImpact(i);
      if (!last) await this.pose(side, 'pullback', 0.06);
    }
    await this.wait(0.6);
  }
}
