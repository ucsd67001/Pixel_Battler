// 効果音。音のファイルは使わず、ブラウザの Web Audio でその場で鳴らす（著作権の心配がない・軽い）。
// ブラウザは、人が一度画面を触るまで音を出させないので、最初のクリックで目を覚ます（unlockAudio）。
// 音の部品：tone（ふつうの音）・noise（ザーッという音）・metal（シャキーン）・shatter（ガシャーンの破片）・
// trill（トゥルルルーン）・vib（ゆれながら伸びる音）。響き（rev）と、ざらつき（dist）と、左右（pan）を足せる。

export type SfxName =
  | 'click' | 'select' | 'scan' | 'reveal' | 'ready' | 'fight' | 'land'
  | 'swing' | 'hit' | 'crit' | 'guard' | 'shot' | 'orb'
  | 'skill' | 'heal' | 'buff' | 'debuff' | 'counter' | 'cutin' | 'gauge'
  | 'charge' | 'beam' | 'slash' | 'boom' | 'ko' | 'win' | 'lose'
  | 'ultboom' | 'whoosh';

const MUTE_KEY = 'pixelbattler.muted';
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();
let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuf: AudioBuffer;
let reverb: GainNode; // 響き（広い場所で鳴っているように聞かせる）
let crunch: GainNode; // ざらつき（爆発を、バリバリした音にする）
const VOLUME = 0.55;

function ac(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // 響き：だんだん小さくなる雑音を「部屋の響き」として使う
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const x = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    reverb = ctx.createGain();
    reverb.gain.value = 0.55;
    reverb.connect(conv);
    conv.connect(master);
    // ざらつき：音の山をつぶして、ひずませる
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 6);
    }
    shaper.curve = curve;
    crunch = ctx.createGain();
    const after = ctx.createGain();
    after.gain.value = 0.35;
    crunch.connect(shaper);
    shaper.connect(after);
    after.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function unlockAudio() {
  try {
    ac();
  } catch {
    /* 音が出せなくても遊べる */
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem(MUTE_KEY, v ? '1' : '0');
  } catch {
    /* 覚えられなくてもよい */
  }
  if (ctx) master.gain.setTargetAtTime(v ? 0 : VOLUME, ctx.currentTime, 0.02);
}

// 出口：左右（pan）・ざらつき（dist）・響き（rev）
interface Out {
  rev?: number;
  pan?: number;
  dist?: boolean;
}
function out(c: AudioContext, g: GainNode, o: Out) {
  let node: AudioNode = g;
  if (o.pan && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    g.connect(p);
    node = p;
  }
  node.connect(o.dist ? crunch : master);
  if (o.rev && reverb) {
    const s = c.createGain();
    s.gain.value = o.rev;
    node.connect(s);
    s.connect(reverb);
  }
}

interface ToneOpt extends Out {
  f: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  at?: number;
  attack?: number;
}
function tone(c: AudioContext, o: ToneOpt) {
  const t = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol ?? 0.3, t + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g);
  out(c, g, o);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

interface NoiseOpt extends Out {
  dur: number;
  vol?: number;
  type?: BiquadFilterType;
  f?: number;
  to?: number;
  q?: number;
  at?: number;
  attack?: number;
}
function noise(c: AudioContext, o: NoiseOpt) {
  const t = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const fl = c.createBiquadFilter();
  fl.type = o.type ?? 'lowpass';
  fl.frequency.setValueAtTime(o.f ?? 1200, t);
  if (o.to) fl.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  fl.Q.value = o.q ?? 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol ?? 0.3, t + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(fl);
  fl.connect(g);
  out(c, g, o);
  src.start(t, Math.random() * 0.5);
  src.stop(t + o.dur + 0.05);
}

const arp = (c: AudioContext, notes: number[], step: number, dur: number, type: OscillatorType, vol: number, at = 0, rev = 0) =>
  notes.forEach((f, i) => tone(c, { f, dur, type, vol, at: at + i * step, rev }));

// ゆれながら伸びる音（「ーン」の部分）
function vib(c: AudioContext, o: { f: number; dur: number; vol: number; at?: number; rev?: number; type?: OscillatorType }) {
  const t = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? 'triangle';
  osc.frequency.setValueAtTime(o.f, t);
  const lfo = c.createOscillator();
  lfo.frequency.value = 6.5;
  const depth = c.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(o.f * 0.015, t + o.dur * 0.4);
  lfo.connect(depth);
  depth.connect(osc.frequency);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + 0.01);
  g.gain.setValueAtTime(o.vol, t + o.dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g);
  out(c, g, { rev: o.rev });
  osc.start(t);
  lfo.start(t);
  osc.stop(t + o.dur + 0.05);
  lfo.stop(t + o.dur + 0.05);
}

// 「シャキーン」：きれいに重ならない高い音をいくつも重ねて、長く響かせる（金属の鳴り）
function metal(c: AudioContext, o: { f: number; dur: number; vol: number; at?: number; rev?: number; pan?: number }) {
  [1, 1.483, 2.09, 2.563, 3.217, 4.1].forEach((m, i) =>
    tone(c, {
      f: o.f * m * (1 + (Math.random() - 0.5) * 0.004),
      dur: o.dur * (1 - i * 0.1),
      vol: o.vol / (1 + i * 0.55),
      at: o.at,
      attack: 0.002,
      rev: o.rev,
      pan: o.pan,
    }),
  );
  // 出だしの「シャッ」
  noise(c, { dur: 0.09, vol: o.vol * 1.4, type: 'highpass', f: 5000, at: o.at, rev: o.rev, pan: o.pan });
}

// 「ガシャーン」の破片：高い音の粒を、左右に散らばらせる
function shatter(c: AudioContext, o: { count: number; spread: number; vol: number; at?: number; rev?: number }) {
  for (let i = 0; i < o.count; i++) {
    const r = Math.random();
    tone(c, {
      f: 2200 + Math.random() * 6500,
      dur: 0.06 + Math.random() * 0.3,
      vol: o.vol * (0.35 + Math.random() * 0.65),
      at: (o.at ?? 0) + r * r * o.spread,
      attack: 0.001,
      rev: o.rev,
      pan: Math.random() * 1.6 - 0.8,
      type: Math.random() < 0.3 ? 'triangle' : 'sine',
    });
  }
}

// 「トゥルルルーン」：五つの音の並び（ドレミソラ）で速く駆け上がって、最後を伸ばしてゆらす
function trill(c: AudioContext, o: { base: number; steps: number; step: number; at?: number; vol?: number; rev?: number; end?: number }) {
  const scale = [0, 2, 4, 7, 9];
  const at = o.at ?? 0;
  const vol = o.vol ?? 0.05;
  const note = (i: number) => o.base * Math.pow(2, (scale[i % 5] + 12 * Math.floor(i / 5)) / 12);
  for (let i = 0; i < o.steps; i++) {
    const f = note(i);
    tone(c, { f, dur: 0.14, type: 'square', vol, at: at + i * o.step, rev: o.rev, pan: (i / o.steps - 0.5) * 0.8 });
    tone(c, { f: f * 2, dur: 0.12, type: 'triangle', vol: vol * 0.6, at: at + i * o.step, rev: o.rev });
  }
  const last = note(o.steps);
  const t = at + o.steps * o.step;
  vib(c, { f: last, dur: o.end ?? 1.1, vol: vol * 1.6, at: t, rev: o.rev });
  vib(c, { f: last * 2, dur: (o.end ?? 1.1) * 0.8, vol: vol * 0.7, at: t, rev: o.rev, type: 'sine' });
  // キラキラ
  shatter(c, { count: 8, spread: 0.5, vol: vol * 0.6, at: t, rev: o.rev });
}

const SOUNDS: Record<SfxName, (c: AudioContext) => void> = {
  click: (c) => tone(c, { f: 880, to: 1320, dur: 0.06, type: 'square', vol: 0.05 }),
  select: (c) => {
    tone(c, { f: 660, dur: 0.07, type: 'triangle', vol: 0.12 });
    tone(c, { f: 990, dur: 0.09, type: 'triangle', vol: 0.1, at: 0.045 });
    metal(c, { f: 2400, dur: 0.25, vol: 0.025, at: 0.04, rev: 0.2 });
  },
  scan: (c) => {
    tone(c, { f: 1200, dur: 0.05, vol: 0.06 });
    tone(c, { f: 1800, dur: 0.06, vol: 0.05, at: 0.05 });
  },
  // ロボが生まれる：ためて、ドン、トゥルルルーン
  reveal: (c) => {
    noise(c, { dur: 0.7, vol: 0.18, type: 'highpass', f: 300, to: 6000, attack: 0.4, rev: 0.3 });
    tone(c, { f: 90, to: 35, dur: 0.8, vol: 0.45, at: 0.4 });
    trill(c, { base: 523, steps: 12, step: 0.035, at: 0.4, vol: 0.05, rev: 0.6, end: 1.3 });
  },
  ready: (c) => {
    tone(c, { f: 110, to: 220, dur: 0.7, type: 'sawtooth', vol: 0.06, attack: 0.3 });
    noise(c, { dur: 0.7, vol: 0.08, type: 'bandpass', f: 300, to: 2000, attack: 0.4 });
  },
  fight: (c) => {
    noise(c, { dur: 0.55, vol: 0.35, f: 3000, to: 250, dist: true });
    tone(c, { f: 160, to: 45, dur: 0.45, type: 'square', vol: 0.16 });
    metal(c, { f: 1500, dur: 1.0, vol: 0.09, rev: 0.6 });
  },
  land: (c) => {
    tone(c, { f: 120, to: 40, dur: 0.28, vol: 0.4 });
    noise(c, { dur: 0.22, vol: 0.2, f: 900, to: 150 });
  },
  swing: (c) => noise(c, { dur: 0.2, vol: 0.22, type: 'bandpass', f: 500, to: 3500, q: 1.4, attack: 0.04 }),
  hit: (c) => {
    tone(c, { f: 190, to: 60, dur: 0.18, vol: 0.45 });
    noise(c, { dur: 0.14, vol: 0.28, f: 2600, to: 400 });
  },
  crit: (c) => {
    tone(c, { f: 220, to: 45, dur: 0.3, vol: 0.55 });
    noise(c, { dur: 0.25, vol: 0.4, f: 5000, to: 300, dist: true });
    shatter(c, { count: 10, spread: 0.2, vol: 0.05, rev: 0.3 });
    metal(c, { f: 1900, dur: 0.4, vol: 0.05, rev: 0.3 });
  },
  guard: (c) => {
    metal(c, { f: 900, dur: 0.5, vol: 0.08, rev: 0.3 });
    noise(c, { dur: 0.08, vol: 0.15, type: 'bandpass', f: 3200, q: 2 });
  },
  shot: (c) => {
    tone(c, { f: 1700, to: 280, dur: 0.14, type: 'square', vol: 0.08 });
    noise(c, { dur: 0.06, vol: 0.08, type: 'highpass', f: 4000 });
  },
  orb: (c) => {
    tone(c, { f: 400, to: 950, dur: 0.35, vol: 0.14, rev: 0.3 });
    tone(c, { f: 600, to: 1300, dur: 0.3, type: 'triangle', vol: 0.07, at: 0.05, rev: 0.3 });
  },
  // スキル：シャキーン
  skill: (c) => {
    noise(c, { dur: 0.25, vol: 0.18, type: 'bandpass', f: 800, to: 7000, q: 1, attack: 0.12 });
    metal(c, { f: 1700, dur: 1.1, vol: 0.11, at: 0.12, rev: 0.7 });
  },
  heal: (c) => trill(c, { base: 784, steps: 7, step: 0.06, vol: 0.04, rev: 0.6, end: 0.8 }),
  buff: (c) => {
    tone(c, { f: 300, to: 900, dur: 0.35, type: 'triangle', vol: 0.1 });
    trill(c, { base: 659, steps: 6, step: 0.04, at: 0.1, vol: 0.04, rev: 0.5, end: 0.6 });
  },
  debuff: (c) => {
    tone(c, { f: 700, to: 160, dur: 0.6, type: 'sawtooth', vol: 0.06, rev: 0.4 });
    tone(c, { f: 520, to: 120, dur: 0.6, type: 'triangle', vol: 0.08, at: 0.04 });
  },
  counter: (c) => {
    metal(c, { f: 1300, dur: 0.8, vol: 0.1, rev: 0.5 });
    tone(c, { f: 220, dur: 0.12, type: 'square', vol: 0.08 });
  },
  // 必殺技のカットイン：シャキーンンン！（低いドンと和音も重ねる）
  cutin: (c) => {
    noise(c, { dur: 0.18, vol: 0.3, type: 'bandpass', f: 600, to: 9000, q: 0.9, attack: 0.1 });
    metal(c, { f: 1250, dur: 2.2, vol: 0.2, at: 0.14, rev: 1.0, pan: -0.25 });
    metal(c, { f: 1876, dur: 1.8, vol: 0.12, at: 0.16, rev: 1.0, pan: 0.25 });
    tone(c, { f: 65, to: 38, dur: 1.2, vol: 0.5, at: 0.14 });
    noise(c, { dur: 0.4, vol: 0.3, f: 3000, to: 200, at: 0.14, dist: true });
    [220, 330, 440, 554, 659].forEach((f, i) =>
      tone(c, { f, dur: 1.6, type: i < 2 ? 'sawtooth' : 'square', vol: i < 2 ? 0.04 : 0.02, at: 0.14, rev: 0.8 }),
    );
  },
  // 必殺ゲージがたまった：トゥルルルーン
  gauge: (c) => trill(c, { base: 659, steps: 10, step: 0.032, vol: 0.05, rev: 0.6, end: 1.0 }),
  // ためる：地ひびきと上がっていくうなり、最後にトゥルルルーン
  charge: (c) => {
    tone(c, { f: 45, dur: 1.6, vol: 0.35, attack: 0.5 });
    tone(c, { f: 80, to: 520, dur: 1.4, type: 'sawtooth', vol: 0.07, attack: 0.8, rev: 0.3 });
    noise(c, { dur: 1.4, vol: 0.18, type: 'bandpass', f: 150, to: 4000, attack: 1.0, rev: 0.4 });
    trill(c, { base: 392, steps: 14, step: 0.03, at: 0.5, vol: 0.04, rev: 0.6, end: 0.6 });
  },
  beam: (c) => {
    noise(c, { dur: 1.6, vol: 0.45, f: 1200, attack: 0.02, rev: 0.4 });
    noise(c, { dur: 1.5, vol: 0.2, type: 'bandpass', f: 600, q: 0.7, attack: 0.02, dist: true });
    tone(c, { f: 60, dur: 1.6, type: 'sawtooth', vol: 0.2, rev: 0.3 });
    tone(c, { f: 2400, to: 900, dur: 1.4, type: 'sawtooth', vol: 0.04, rev: 0.4 });
    metal(c, { f: 1100, dur: 1.2, vol: 0.08, rev: 0.6 });
  },
  // 斬る：ザシュッ＋シャキーン
  slash: (c) => {
    noise(c, { dur: 0.3, vol: 0.45, type: 'bandpass', f: 900, to: 8000, q: 1.2, attack: 0.02, rev: 0.4 });
    metal(c, { f: 2000, dur: 1.2, vol: 0.13, at: 0.03, rev: 0.8 });
  },
  whoosh: (c) => noise(c, { dur: 0.35, vol: 0.32, type: 'bandpass', f: 300, to: 4500, q: 0.9, attack: 0.15, rev: 0.3 }),
  boom: (c) => {
    noise(c, { dur: 1.0, vol: 0.5, f: 1800, to: 90, rev: 0.25 });
    noise(c, { dur: 0.4, vol: 0.4, f: 2500, to: 200, dist: true });
    tone(c, { f: 95, to: 30, dur: 0.8, vol: 0.5 });
  },
  // とどめの大爆発：グアッシャーーーン！（ドン＋バリバリ＋ガラスの破片＋鐘のような鳴り＋長い響き）
  ultboom: (c) => {
    tone(c, { f: 120, to: 28, dur: 1.5, vol: 0.75, rev: 0.3 });
    tone(c, { f: 55, to: 25, dur: 2.2, type: 'triangle', vol: 0.45 });
    noise(c, { dur: 0.7, vol: 0.9, f: 6000, to: 300, dist: true });
    noise(c, { dur: 2.2, vol: 0.5, f: 3500, to: 70, rev: 0.8 });
    shatter(c, { count: 45, spread: 1.1, vol: 0.07, at: 0.03, rev: 0.6 });
    metal(c, { f: 700, dur: 2.4, vol: 0.12, at: 0.02, rev: 1.0 });
  },
  ko: (c) => {
    noise(c, { dur: 0.6, vol: 0.7, f: 4000, to: 200, dist: true });
    noise(c, { dur: 1.6, vol: 0.5, f: 2200, to: 70, rev: 0.6 });
    tone(c, { f: 90, to: 26, dur: 1.2, vol: 0.6 });
    shatter(c, { count: 25, spread: 0.8, vol: 0.06, rev: 0.5 });
    tone(c, { f: 420, to: 55, dur: 1.4, type: 'sawtooth', vol: 0.07, at: 0.1, rev: 0.5 });
  },
  win: (c) => {
    arp(c, [523, 659, 784], 0.12, 0.2, 'square', 0.06, 0, 0.4);
    arp(c, [262, 330, 392], 0.12, 0.2, 'triangle', 0.1, 0, 0.3);
    vib(c, { f: 1047, dur: 1.4, vol: 0.08, at: 0.36, rev: 0.6, type: 'square' });
    vib(c, { f: 523, dur: 1.4, vol: 0.12, at: 0.36, rev: 0.5 });
    trill(c, { base: 1047, steps: 10, step: 0.03, at: 0.5, vol: 0.03, rev: 0.7, end: 0.8 });
  },
  lose: (c) => {
    arp(c, [392, 330], 0.22, 0.3, 'triangle', 0.1, 0, 0.4);
    tone(c, { f: 262, to: 220, dur: 0.9, type: 'triangle', vol: 0.11, at: 0.44, rev: 0.5 });
  },
};

// 同じ音が一度にたくさん重なると割れるので、同じ音は 30ms あけて鳴らす
const last: Partial<Record<SfxName, number>> = {};
export function sfx(name: SfxName) {
  if (muted) return;
  try {
    const c = ac();
    if (!c) return;
    const now = performance.now();
    if (now - (last[name] ?? 0) < 30) return;
    last[name] = now;
    SOUNDS[name](c);
  } catch {
    /* 音が出せなくても遊べる */
  }
}
