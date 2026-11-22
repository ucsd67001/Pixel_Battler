// 効果音。音のファイルは使わず、ブラウザの Web Audio でその場で鳴らす（著作権の心配がない・軽い）。
// ブラウザは、人が一度画面を触るまで音を出させないので、最初のクリックで目を覚ます（unlockAudio）。

export type SfxName =
  | 'click' | 'select' | 'scan' | 'reveal' | 'ready' | 'fight' | 'land'
  | 'swing' | 'hit' | 'crit' | 'guard' | 'shot' | 'orb'
  | 'skill' | 'heal' | 'buff' | 'debuff' | 'counter' | 'cutin' | 'gauge'
  | 'charge' | 'beam' | 'slash' | 'boom' | 'ko' | 'win' | 'lose';

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

interface ToneOpt {
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
  g.connect(master);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

interface NoiseOpt {
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
  g.connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + o.dur + 0.05);
}

const arp = (c: AudioContext, notes: number[], step: number, dur: number, type: OscillatorType, vol: number, at = 0) =>
  notes.forEach((f, i) => tone(c, { f, dur, type, vol, at: at + i * step }));

const SOUNDS: Record<SfxName, (c: AudioContext) => void> = {
  click: (c) => tone(c, { f: 880, to: 1320, dur: 0.06, type: 'square', vol: 0.05 }),
  select: (c) => {
    tone(c, { f: 660, dur: 0.07, type: 'triangle', vol: 0.12 });
    tone(c, { f: 990, dur: 0.09, type: 'triangle', vol: 0.1, at: 0.045 });
  },
  scan: (c) => {
    tone(c, { f: 1200, dur: 0.05, vol: 0.06 });
    tone(c, { f: 1800, dur: 0.06, vol: 0.05, at: 0.05 });
  },
  reveal: (c) => {
    noise(c, { dur: 0.7, vol: 0.18, type: 'highpass', f: 300, to: 6000, attack: 0.4 });
    tone(c, { f: 80, to: 40, dur: 0.6, vol: 0.35, at: 0.4 });
    arp(c, [523, 659, 784, 1047], 0.07, 0.55, 'triangle', 0.11, 0.4);
  },
  ready: (c) => {
    tone(c, { f: 110, to: 220, dur: 0.7, type: 'sawtooth', vol: 0.06, attack: 0.3 });
    noise(c, { dur: 0.7, vol: 0.08, type: 'bandpass', f: 300, to: 2000, attack: 0.4 });
  },
  fight: (c) => {
    noise(c, { dur: 0.55, vol: 0.35, f: 3000, to: 250 });
    tone(c, { f: 160, to: 50, dur: 0.35, type: 'square', vol: 0.16 });
    tone(c, { f: 880, dur: 0.18, type: 'triangle', vol: 0.1 });
    tone(c, { f: 1320, dur: 0.25, type: 'triangle', vol: 0.08, at: 0.06 });
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
    tone(c, { f: 220, to: 50, dur: 0.25, vol: 0.5 });
    noise(c, { dur: 0.22, vol: 0.32, f: 5000, to: 300 });
    tone(c, { f: 1500, to: 600, dur: 0.14, type: 'square', vol: 0.08 });
  },
  guard: (c) => {
    tone(c, { f: 900, dur: 0.28, type: 'triangle', vol: 0.12 });
    tone(c, { f: 1370, dur: 0.22, type: 'triangle', vol: 0.08 });
    noise(c, { dur: 0.08, vol: 0.15, type: 'bandpass', f: 3200, q: 2 });
  },
  shot: (c) => {
    tone(c, { f: 1700, to: 280, dur: 0.14, type: 'square', vol: 0.08 });
    noise(c, { dur: 0.06, vol: 0.08, type: 'highpass', f: 4000 });
  },
  orb: (c) => {
    tone(c, { f: 400, to: 950, dur: 0.35, vol: 0.14 });
    tone(c, { f: 600, to: 1300, dur: 0.3, type: 'triangle', vol: 0.07, at: 0.05 });
  },
  skill: (c) => {
    arp(c, [784, 988, 1175, 1568], 0.06, 0.25, 'triangle', 0.09);
    noise(c, { dur: 0.45, vol: 0.1, type: 'highpass', f: 2000, to: 8000, attack: 0.2 });
  },
  heal: (c) => arp(c, [523, 659, 784, 1047, 1319], 0.09, 0.5, 'sine', 0.1),
  buff: (c) => {
    tone(c, { f: 300, to: 900, dur: 0.4, type: 'triangle', vol: 0.12 });
    tone(c, { f: 450, to: 1350, dur: 0.4, type: 'triangle', vol: 0.07, at: 0.05 });
  },
  debuff: (c) => {
    tone(c, { f: 700, to: 200, dur: 0.45, type: 'sawtooth', vol: 0.06 });
    tone(c, { f: 520, to: 150, dur: 0.45, type: 'triangle', vol: 0.08, at: 0.04 });
  },
  counter: (c) => {
    tone(c, { f: 1100, dur: 0.3, type: 'triangle', vol: 0.12 });
    tone(c, { f: 220, dur: 0.12, type: 'square', vol: 0.08 });
    noise(c, { dur: 0.1, vol: 0.15, type: 'bandpass', f: 3500, q: 2 });
  },
  cutin: (c) => {
    noise(c, { dur: 0.3, vol: 0.2, type: 'highpass', f: 1500, to: 9000, attack: 0.02 });
    tone(c, { f: 1200, dur: 0.12, type: 'square', vol: 0.06 });
  },
  gauge: (c) => {
    tone(c, { f: 1568, dur: 0.12, vol: 0.08 });
    tone(c, { f: 2093, dur: 0.2, vol: 0.08, at: 0.08 });
  },
  charge: (c) => {
    tone(c, { f: 80, to: 420, dur: 1.2, type: 'sawtooth', vol: 0.08, attack: 0.6 });
    noise(c, { dur: 1.2, vol: 0.16, type: 'bandpass', f: 200, to: 3000, attack: 0.8 });
  },
  beam: (c) => {
    noise(c, { dur: 1.1, vol: 0.4, f: 900, attack: 0.02 });
    tone(c, { f: 70, dur: 1.1, type: 'sawtooth', vol: 0.16 });
    tone(c, { f: 150, to: 100, dur: 1.1, type: 'square', vol: 0.05 });
  },
  slash: (c) => {
    noise(c, { dur: 0.28, vol: 0.35, type: 'bandpass', f: 900, to: 7000, q: 1.2, attack: 0.02 });
    tone(c, { f: 2200, to: 400, dur: 0.22, type: 'sawtooth', vol: 0.06 });
  },
  boom: (c) => {
    noise(c, { dur: 1.0, vol: 0.55, f: 1800, to: 90 });
    tone(c, { f: 95, to: 30, dur: 0.8, vol: 0.5 });
  },
  ko: (c) => {
    noise(c, { dur: 1.3, vol: 0.55, f: 2200, to: 80 });
    tone(c, { f: 90, to: 28, dur: 1.0, vol: 0.55 });
    tone(c, { f: 420, to: 60, dur: 1.2, type: 'sawtooth', vol: 0.07, at: 0.1 });
  },
  win: (c) => {
    arp(c, [523, 659, 784], 0.12, 0.2, 'square', 0.06);
    tone(c, { f: 1047, dur: 0.7, type: 'square', vol: 0.07, at: 0.36 });
    arp(c, [262, 330, 392], 0.12, 0.2, 'triangle', 0.1);
    tone(c, { f: 523, dur: 0.7, type: 'triangle', vol: 0.12, at: 0.36 });
  },
  lose: (c) => {
    arp(c, [392, 330], 0.22, 0.3, 'triangle', 0.1);
    tone(c, { f: 262, to: 220, dur: 0.9, type: 'triangle', vol: 0.11, at: 0.44 });
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
