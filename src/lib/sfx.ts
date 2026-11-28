// 効果音。音のファイルは使わず、ブラウザの Web Audio でその場で鳴らす（著作権の心配がない・軽い）。
// ブラウザは、人が一度画面を触るまで音を出させないので、最初のクリックで目を覚ます（unlockAudio）。
//
// 音の作り（いまのゲームの音に寄せる。2026-11-22）：
//   ・金属の「カーン」や、ガラスの「ガシャーン」、四角い波の「ピロピロ」は使わない（昔のコントやファミコンっぽく聞こえる）
//   ・当たる音＝低く短い「ドスッ」（kick）＋こすれる音（ノイズを低いほうだけ通す）
//   ・必殺技＝下から上がる「ためる音」（riser）→「ドーン」→映画の予告編のような低い「ブォーン」（braam）
//   ・回復やゲージ＝やわらかい「ポロロン」（pluck）と、ふわっと広がる和音（pad）
//   ・ボタン＝小さく軽い「コッ」
// 音の高さは、ハ長調の五つの音（ドレミソラ）と、その和音にそろえる（どれが鳴っても、ぶつからない）。

export type SfxName =
  | 'click' | 'select' | 'scan' | 'reveal' | 'ready' | 'fight' | 'land'
  | 'swing' | 'hit' | 'crit' | 'guard' | 'shot' | 'orb' | 'magic'
  | 'skill' | 'heal' | 'buff' | 'debuff' | 'counter' | 'cutin' | 'gauge'
  | 'charge' | 'beam' | 'slash' | 'boom' | 'ko' | 'win' | 'lose'
  | 'ultboom' | 'whoosh' | 'draw';

export const SFX_NAMES: SfxName[] = [
  'click', 'select', 'scan', 'reveal', 'ready', 'fight', 'land', 'swing', 'hit', 'crit', 'guard', 'shot', 'orb', 'magic',
  'skill', 'heal', 'buff', 'debuff', 'counter', 'cutin', 'gauge', 'charge', 'beam', 'slash', 'boom', 'ko', 'win',
  'lose', 'ultboom', 'whoosh', 'draw',
];

const MUTE_KEY = 'pixelbattler.muted';
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();
const VOLUME = 0.6;

// 音の通り道（ふつうに鳴らすときと、ファイルに書き出すときで、別々に作る）
interface Bus {
  c: BaseAudioContext;
  master: GainNode;
  reverb: GainNode; // 響き（広い場所で鳴っているように聞かせる。高い音は早く消える＝やわらかい響き）
  warm: GainNode; // 少しだけ音をつぶして、太く聞かせる
  noise: AudioBuffer;
}

function makeBus(c: BaseAudioContext, volume: number): Bus {
  const master = c.createGain();
  master.gain.value = volume;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  master.connect(comp);
  comp.connect(c.destination);

  const noise = c.createBuffer(2, c.sampleRate * 2, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = noise.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // 響き：だんだん小さく、だんだんこもっていく雑音を「部屋の響き」として使う
  const len = Math.floor(c.sampleRate * 2.8);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const x = ir.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < len; i++) {
      const p = i / len;
      const a = 0.85 * Math.pow(1 - p, 3) + 0.04; // 時間がたつほど高い音を通さない
      y += a * (Math.random() * 2 - 1 - y);
      x[i] = y * Math.pow(1 - p, 2.2) * (i < c.sampleRate * 0.012 ? i / (c.sampleRate * 0.012) : 1);
    }
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  const reverb = c.createGain();
  reverb.gain.value = 0.5;
  const revHp = c.createBiquadFilter(); // 響きに低い音を入れない（もこもこしない）
  revHp.type = 'highpass';
  revHp.frequency.value = 180;
  reverb.connect(revHp);
  revHp.connect(conv);
  conv.connect(master);

  const shaper = c.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
  }
  shaper.curve = curve;
  shaper.oversample = '2x';
  const warm = c.createGain();
  const after = c.createGain();
  after.gain.value = 0.8;
  warm.connect(shaper);
  shaper.connect(after);
  after.connect(master);

  return { c, master, reverb, warm, noise };
}

let live: Bus | null = null;
function bus(): Bus | null {
  if (!live) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    live = makeBus(new AC(), muted ? 0 : VOLUME);
  }
  const c = live.c as AudioContext;
  if (c.state === 'suspended') c.resume().catch(() => {});
  return live;
}

export function unlockAudio() {
  try {
    const b = bus();
    if (b) bgmSetup(b);
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
  if (live) live.master.gain.setTargetAtTime(v ? 0 : VOLUME, live.c.currentTime, 0.02);
  bgmLevel(bgmWant ? 1 : 0, 0.05);
}

// ── BGM（バトルのあいだ、くり返し流す曲） ──
// iPhone の Safari では、ふつうのやり方だと音の大きさを変えられないので、効果音と同じ通り道（Web Audio）に流す。
// スマホは、人が画面を触っているあいだに一度鳴らしておかないと、あとから鳴らせない。
// だから、最初のタッチで音を0にしたまま一度鳴らして止めておく（bgmSetup）。
// 曲はどれも持ち主の自作。battle＝いつものバトル。ストーリーの10章から先は、手下が explore・ボスが trial（2026-11-28、持ち主の希望）
export type BgmName = 'battle' | 'explore' | 'trial';
const BGM_SRC: Record<BgmName, string> = {
  battle: '/bgm/battle.mp3',
  explore: '/bgm/explore.mp3',
  trial: '/bgm/trial.mp3',
};
const BGM_VOL = 0.3;
let bgmEl: HTMLAudioElement | null = null;
let bgmName: BgmName = 'battle'; // いま bgmEl に入っている曲
let bgmGain: GainNode | null = null;
let bgmWant = false;
let bgmDuck = 1;
let bgmStopTimer = 0;
let bgmDuckTimer = 0;

function bgmSetup(b: Bus) {
  if (bgmEl) return;
  const el = new Audio(BGM_SRC[bgmName]);
  el.loop = true;
  el.preload = 'auto';
  bgmEl = el;
  try {
    const c = b.c as AudioContext;
    const src = c.createMediaElementSource(el);
    bgmGain = c.createGain();
    bgmGain.gain.value = 0;
    src.connect(bgmGain);
    bgmGain.connect(c.destination);
  } catch {
    bgmGain = null;
    el.volume = 0;
  }
  if (!bgmWant)
    el.play()
      .then(() => {
        if (!bgmWant) el.pause();
      })
      .catch(() => {});
}

// 大きさを変える（level：1＝ふつう、0＝無音。必殺技のあいだは bgmDuck で下げる）
function bgmLevel(level: number, tc: number) {
  const v = muted ? 0 : BGM_VOL * level * bgmDuck;
  if (bgmGain && live) bgmGain.gain.setTargetAtTime(v, live.c.currentTime, tc);
  else if (bgmEl) bgmEl.volume = Math.min(1, v);
}

/** バトルの曲を、頭からくり返し流す（name：どの曲か） */
export function playBgm(name: BgmName = 'battle') {
  try {
    bgmWant = true;
    clearTimeout(bgmStopTimer);
    const b = bus();
    if (!b) return;
    if (!bgmEl) bgmName = name; // まだ入れ物が無ければ、はじめからこの曲で作る
    bgmSetup(b);
    if (!bgmEl) return;
    // 曲を入れかえるときも、同じ bgmEl を使う（スマホで一度鳴らしてある入れ物なので、あとから鳴らせる）
    if (name !== bgmName) {
      bgmName = name;
      bgmEl.src = BGM_SRC[name];
    }
    bgmEl.currentTime = 0;
    bgmEl.play().catch(() => {});
    bgmLevel(1, 0.15);
  } catch {
    /* 曲が流せなくても遊べる */
  }
}

/** 曲を、だんだん小さくして止める */
export function stopBgm(fade = 1.0) {
  bgmWant = false;
  bgmLevel(0, Math.max(0.01, fade / 4));
  clearTimeout(bgmStopTimer);
  bgmStopTimer = window.setTimeout(() => {
    if (!bgmWant) bgmEl?.pause();
  }, fade * 1000 + 100);
}

// 必殺技の「ドーン」のあいだだけ、曲を小さくする
function duckBgm(sec: number) {
  if (!bgmWant) return;
  bgmDuck = 0.3;
  bgmLevel(1, 0.05);
  clearTimeout(bgmDuckTimer);
  bgmDuckTimer = window.setTimeout(() => {
    bgmDuck = 1;
    if (bgmWant) bgmLevel(1, 0.4);
  }, sec * 1000);
}
const DUCK: Partial<Record<SfxName, number>> = { cutin: 2.6, ultboom: 2.2, charge: 1.6 };

// ── 出口：左右（pan）・太さ（warm）・響き（rev） ──
interface Out {
  rev?: number;
  pan?: number;
  warm?: boolean;
  at?: number;
}
function out(b: Bus, g: AudioNode, o: Out) {
  let node: AudioNode = g;
  if (o.pan) {
    const p = b.c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    g.connect(p);
    node = p;
  }
  node.connect(o.warm ? b.warm : b.master);
  if (o.rev) {
    const s = b.c.createGain();
    s.gain.value = o.rev;
    node.connect(s);
    s.connect(b.reverb);
  }
}
const T = (b: Bus, at?: number) => b.c.currentTime + (at ?? 0);

/** 音の大きさの形：すぐ（または attack かけて）大きくなり、hold まで保って、dur で消える */
function env(g: GainNode, t: number, vol: number, dur: number, attack = 0.004, hold = 0) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + attack);
  if (hold > attack) g.gain.setValueAtTime(Math.max(vol, 0.0002), t + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

// ── 部品 ──

// ふつうの音（なめらかな波だけ。四角い波は使わない）
function tone(b: Bus, o: Out & { f: number; to?: number; dur: number; vol: number; type?: OscillatorType; attack?: number; glide?: number }) {
  const t = T(b, o.at);
  const osc = b.c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? o.dur));
  const g = b.c.createGain();
  env(g, t, o.vol, o.dur, o.attack);
  osc.connect(g);
  out(b, g, o);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

// ザーッという音を、通す高さを動かしながら鳴らす
function noise(
  b: Bus,
  o: Out & { dur: number; vol: number; type?: BiquadFilterType; f?: number; to?: number; q?: number; attack?: number; panTo?: number },
) {
  const t = T(b, o.at);
  const src = b.c.createBufferSource();
  src.buffer = b.noise;
  src.loop = true;
  const fl = b.c.createBiquadFilter();
  fl.type = o.type ?? 'lowpass';
  fl.frequency.setValueAtTime(o.f ?? 1200, t);
  if (o.to) fl.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  fl.Q.value = o.q ?? 0.7;
  const g = b.c.createGain();
  env(g, t, o.vol, o.dur, o.attack);
  src.connect(fl);
  fl.connect(g);
  if (o.panTo !== undefined) {
    // 左から右へ流れる（「シュッ」が通りすぎる）
    const p = b.c.createStereoPanner();
    p.pan.setValueAtTime(o.pan ?? 0, t);
    p.pan.linearRampToValueAtTime(o.panTo, t + o.dur);
    g.connect(p);
    out(b, p as unknown as GainNode, { rev: o.rev, warm: o.warm });
  } else out(b, g, o);
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.dur + 0.05);
}

// 「ドスッ」：低い音が一瞬で下がる（いまのゲームの打撃の芯）＋出だしの小さな「パチッ」
function kick(b: Bus, o: Out & { f?: number; to?: number; dur: number; vol: number; drop?: number }) {
  const t = T(b, o.at);
  const osc = b.c.createOscillator();
  osc.frequency.setValueAtTime(o.f ?? 150, t);
  osc.frequency.exponentialRampToValueAtTime(o.to ?? 45, t + (o.drop ?? Math.min(0.12, o.dur * 0.4)));
  const g = b.c.createGain();
  env(g, t, o.vol, o.dur, 0.002);
  osc.connect(g);
  out(b, g, o);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
  noise(b, { dur: 0.018, vol: o.vol * 0.22, type: 'highpass', f: 2500, at: o.at, pan: o.pan });
}

// 「ポロン」：やわらかくはじく音（はじめ明るく、すぐこもる）
function pluck(b: Bus, o: Out & { f: number; dur: number; vol: number }) {
  const t = T(b, o.at);
  const fl = b.c.createBiquadFilter();
  fl.type = 'lowpass';
  fl.Q.value = 1.2;
  fl.frequency.setValueAtTime(Math.min(o.f * 7, 16000), t);
  fl.frequency.exponentialRampToValueAtTime(o.f * 1.3, t + o.dur * 0.6);
  const g = b.c.createGain();
  env(g, t, o.vol, o.dur, 0.003);
  fl.connect(g);
  out(b, g, o);
  for (const [type, m, d] of [['sawtooth', 1, -6], ['sawtooth', 1, 6], ['sine', 2, 0]] as const) {
    const osc = b.c.createOscillator();
    osc.type = type;
    osc.frequency.value = o.f * m;
    osc.detune.value = d;
    osc.connect(fl);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }
}

// ふわっと広がる和音（少しずらした波を重ねて、厚く聞かせる）。cutPeak で「ブワッ」と開いて閉じる
function pad(
  b: Bus,
  o: Out & {
    freqs: number[];
    dur: number;
    vol: number;
    attack?: number;
    hold?: number;
    cut?: number;
    cutPeak?: number;
    peakAt?: number;
    cutTo?: number;
    bend?: number;
    detune?: number;
    type?: OscillatorType;
    wobble?: number;
  },
) {
  const t = T(b, o.at);
  const fl = b.c.createBiquadFilter();
  fl.type = 'lowpass';
  fl.Q.value = 0.9;
  const cut = o.cut ?? 1200;
  fl.frequency.setValueAtTime(cut, t);
  if (o.cutPeak) {
    fl.frequency.exponentialRampToValueAtTime(o.cutPeak, t + (o.peakAt ?? 0.08));
    fl.frequency.exponentialRampToValueAtTime(o.cutTo ?? cut, t + o.dur);
  } else if (o.cutTo) fl.frequency.exponentialRampToValueAtTime(o.cutTo, t + o.dur);
  if (o.wobble) {
    // 「ウォンウォン」とうなる（ビームのエネルギー）
    const lfo = b.c.createOscillator();
    lfo.frequency.value = o.wobble;
    const depth = b.c.createGain();
    depth.gain.value = cut * 0.6;
    lfo.connect(depth);
    depth.connect(fl.frequency);
    lfo.start(t);
    lfo.stop(t + o.dur + 0.05);
  }
  const g = b.c.createGain();
  const n = o.freqs.length;
  env(g, t, o.vol / Math.sqrt(n * 2), o.dur, o.attack ?? 0.03, o.hold ?? o.dur * 0.45);
  fl.connect(g);
  out(b, g, o);
  const det = o.detune ?? 10;
  for (const f of o.freqs)
    for (const d of [-det, det]) {
      const osc = b.c.createOscillator();
      osc.type = o.type ?? 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      if (o.bend) osc.frequency.exponentialRampToValueAtTime(f * o.bend, t + o.dur);
      osc.detune.value = d;
      osc.connect(fl);
      osc.start(t);
      osc.stop(t + o.dur + 0.05);
    }
}

// 下から上がっていく「ためる音」：ザーッが高くなり、和音もいっしょにせり上がる（最後に向かって大きくなる）
function riser(b: Bus, o: { dur: number; vol: number; at?: number; f?: number }) {
  noise(b, { dur: o.dur, vol: o.vol, type: 'bandpass', f: 250, to: 7000, q: 1.1, attack: o.dur * 0.92, at: o.at, rev: 0.35, pan: -0.5, panTo: 0.5 });
  const f = o.f ?? 110;
  pad(b, { freqs: [f, f * 1.5], dur: o.dur, vol: o.vol * 0.55, attack: o.dur * 0.92, hold: o.dur * 0.92, cut: 250, cutTo: 3500, bend: 2, at: o.at, rev: 0.3 });
}

// 映画の予告編のような低い「ブォーン」：太い低音が一度ぱっと開いて、ゆっくり閉じる
function braam(b: Bus, o: { f: number; dur: number; vol: number; at?: number; rev?: number }) {
  pad(b, { freqs: [o.f, o.f * 2, o.f * 3], dur: o.dur, vol: o.vol, attack: 0.02, hold: 0.15, cut: 180, cutPeak: 1600, peakAt: 0.09, cutTo: 120, detune: 18, at: o.at, rev: o.rev ?? 0.6, warm: true });
  tone(b, { f: o.f, dur: o.dur, vol: o.vol * 0.8, at: o.at, attack: 0.02 });
}

// 空気がゆれる「シュワーン」：高いところのやわらかいザーッ（キラッと光る感じ）
function air(b: Bus, o: { dur: number; vol: number; at?: number; rev?: number }) {
  noise(b, { dur: o.dur, vol: o.vol, type: 'highpass', f: 6000, to: 9000, attack: o.dur * 0.15, at: o.at, rev: o.rev ?? 0.6 });
}

// ドレミソラ（ハ長調の五つの音）
const PENTA = [0, 2, 4, 7, 9];
const note = (base: number, i: number) => base * Math.pow(2, (PENTA[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5)) / 12);

// キラキラ：ドレミソラの高い「ポロン」を、ばらばらの時間と左右に散らす
function sparkle(b: Bus, o: { base: number; count: number; spread: number; vol: number; at?: number; rev?: number }) {
  for (let i = 0; i < o.count; i++) {
    const r = Math.random();
    pluck(b, {
      f: note(o.base, Math.floor(Math.random() * 8)),
      dur: 0.25 + Math.random() * 0.25,
      vol: o.vol * (0.4 + Math.random() * 0.6),
      at: (o.at ?? 0) + r * o.spread,
      pan: Math.random() * 1.6 - 0.8,
      rev: o.rev ?? 0.7,
    });
  }
}

// 「トゥルルルーン」：やわらかいポロンで速く駆け上がり、最後をふわっと広げる
function rise(b: Bus, o: { base: number; steps: number; step: number; at?: number; vol: number; rev?: number; end?: number }) {
  const at = o.at ?? 0;
  for (let i = 0; i < o.steps; i++)
    pluck(b, { f: note(o.base, i), dur: 0.3, vol: o.vol, at: at + i * o.step, rev: o.rev, pan: (i / o.steps - 0.5) * 0.9 });
  const top = note(o.base, o.steps);
  const t = at + o.steps * o.step;
  const end = o.end ?? 1.0;
  pad(b, { freqs: [top / 2, (top / 2) * 1.25, (top / 2) * 1.5, top], dur: end, vol: o.vol * 1.6, attack: 0.02, cut: 5000, cutTo: 900, at: t, rev: o.rev });
  air(b, { dur: end * 0.8, vol: o.vol * 0.5, at: t, rev: o.rev });
}

// ── 音の一覧 ──
const C = 130.81; // ド（下のほう）
const SOUNDS: Record<SfxName, (b: Bus) => void> = {
  // ボタン：小さく軽い「コッ」
  click: (b) => tone(b, { f: 1100, to: 700, dur: 0.045, vol: 0.09, glide: 0.03 }),
  select: (b) => {
    tone(b, { f: 1320, to: 990, dur: 0.06, vol: 0.09, glide: 0.04 });
    pluck(b, { f: 1568, dur: 0.18, vol: 0.05, at: 0.035, rev: 0.25 });
  },
  scan: (b) => {
    tone(b, { f: 1568, dur: 0.05, vol: 0.05, rev: 0.2 });
    tone(b, { f: 2093, dur: 0.06, vol: 0.04, at: 0.06, rev: 0.2 });
  },
  // ロボが生まれる：ためて → ドン → ふわっと和音が広がる
  reveal: (b) => {
    riser(b, { dur: 0.6, vol: 0.2, f: C });
    kick(b, { f: 140, to: 40, dur: 0.7, vol: 0.7, at: 0.58 });
    noise(b, { dur: 0.8, vol: 0.25, f: 1500, to: 120, at: 0.58, rev: 0.4 });
    pad(b, { freqs: [C * 2, C * 2.5, C * 3, C * 3.75, C * 4.5], dur: 2.0, vol: 0.22, attack: 0.03, cut: 4000, cutTo: 700, at: 0.6, rev: 0.7 });
    sparkle(b, { base: C * 8, count: 10, spread: 0.9, vol: 0.05, at: 0.62 });
  },
  ready: (b) => riser(b, { dur: 0.75, vol: 0.14, f: 98 }),
  // FIGHT!：ドーン＋ブォーン＋シュッ
  fight: (b) => {
    kick(b, { f: 160, to: 38, dur: 0.9, vol: 0.85 });
    braam(b, { f: 55, dur: 1.2, vol: 0.32 });
    noise(b, { dur: 0.5, vol: 0.3, f: 2500, to: 100, rev: 0.4 });
    air(b, { dur: 0.9, vol: 0.06 });
  },
  land: (b) => {
    kick(b, { f: 110, to: 38, dur: 0.35, vol: 0.55 });
    noise(b, { dur: 0.25, vol: 0.2, f: 700, to: 120 });
  },
  // 武器をふる：「ヒュッ」が左から右へ
  swing: (b) =>
    noise(b, { dur: 0.22, vol: 0.28, type: 'bandpass', f: 600, to: 3200, q: 1.6, attack: 0.08, pan: -0.4, panTo: 0.4, rev: 0.15 }),
  // 当たる：「ドスッ」
  hit: (b) => {
    kick(b, { f: 170, to: 52, dur: 0.22, vol: 0.7 });
    noise(b, { dur: 0.13, vol: 0.32, f: 2200, to: 300, warm: true });
    noise(b, { dur: 0.05, vol: 0.12, type: 'bandpass', f: 3500, q: 1.5 });
  },
  // 会心の一撃：重い「ドゴッ」＋短い「ジャン」
  crit: (b) => {
    kick(b, { f: 190, to: 40, dur: 0.45, vol: 0.9 });
    noise(b, { dur: 0.3, vol: 0.45, f: 4500, to: 200, warm: true, rev: 0.3 });
    pad(b, { freqs: [C * 2, C * 3, C * 4.5], dur: 0.45, vol: 0.2, attack: 0.005, cut: 6000, cutTo: 400, rev: 0.5 });
    air(b, { dur: 0.4, vol: 0.06, rev: 0.4 });
  },
  // ガード：エネルギーの盾に当たる「ブゥン」
  guard: (b) => {
    kick(b, { f: 220, to: 90, dur: 0.18, vol: 0.4 });
    pad(b, { freqs: [196, 294], dur: 0.45, vol: 0.18, attack: 0.005, cut: 400, cutPeak: 2600, peakAt: 0.03, cutTo: 250, detune: 25, rev: 0.4 });
    noise(b, { dur: 0.12, vol: 0.1, type: 'bandpass', f: 1800, q: 3 });
  },
  // 撃つ：「ピュン」（なめらかな波）＋小さなドン
  shot: (b) => {
    tone(b, { f: 2200, to: 260, dur: 0.16, vol: 0.12, glide: 0.12, rev: 0.2 });
    kick(b, { f: 130, to: 60, dur: 0.12, vol: 0.3 });
  },
  // まほう（つえ）：魔法陣が開く、キラキラした音
  magic: (b) => {
    sparkle(b, { base: C * 8, count: 6, spread: 0.3, vol: 0.05, rev: 0.5 });
    tone(b, { f: 523, to: 1046, dur: 0.4, type: 'triangle', vol: 0.07, rev: 0.5 });
  },
  orb: (b) => {
    tone(b, { f: 392, to: 1046, dur: 0.35, vol: 0.12, rev: 0.4 });
    tone(b, { f: 587, to: 1568, dur: 0.3, type: 'triangle', vol: 0.06, at: 0.05, rev: 0.4 });
  },
  // スキル：シュッと集めて、ブワッと光る
  skill: (b) => {
    noise(b, { dur: 0.28, vol: 0.22, type: 'bandpass', f: 400, to: 6000, q: 1.1, attack: 0.24, pan: -0.5, panTo: 0.5, rev: 0.3 });
    pad(b, { freqs: [C * 2, C * 3, C * 4, C * 5], dur: 1.0, vol: 0.22, attack: 0.01, cut: 300, cutPeak: 5000, peakAt: 0.06, cutTo: 600, at: 0.26, rev: 0.6 });
    kick(b, { f: 130, to: 45, dur: 0.4, vol: 0.45, at: 0.26 });
    sparkle(b, { base: C * 8, count: 5, spread: 0.4, vol: 0.04, at: 0.28 });
  },
  heal: (b) => rise(b, { base: C * 4, steps: 7, step: 0.055, vol: 0.06, rev: 0.6, end: 0.9 }),
  buff: (b) => {
    riser(b, { dur: 0.3, vol: 0.12, f: C });
    rise(b, { base: C * 4, steps: 5, step: 0.04, at: 0.25, vol: 0.06, rev: 0.5, end: 0.6 });
  },
  // 弱める：下がっていく、こもった音
  debuff: (b) => {
    pad(b, { freqs: [C * 2, C * 2.38], dur: 0.7, vol: 0.18, attack: 0.02, cut: 2500, cutTo: 200, bend: 0.5, rev: 0.4 });
    tone(b, { f: 330, to: 110, dur: 0.6, vol: 0.12, at: 0.03 });
  },
  // カウンター：「シュッ」→「ドスッ」
  counter: (b) => {
    noise(b, { dur: 0.14, vol: 0.3, type: 'bandpass', f: 800, to: 5000, q: 1.3, attack: 0.1, pan: 0.4, panTo: -0.4 });
    kick(b, { f: 180, to: 50, dur: 0.28, vol: 0.75, at: 0.12 });
    pad(b, { freqs: [C * 3, C * 4.5], dur: 0.35, vol: 0.14, attack: 0.005, cut: 5000, cutTo: 500, at: 0.12, rev: 0.4 });
  },
  // 必殺技のカットイン：ためて → ドーン → ブォーン＋ブワッと広がる和音
  cutin: (b) => {
    riser(b, { dur: 0.16, vol: 0.18, f: 110 });
    kick(b, { f: 170, to: 34, dur: 1.2, vol: 0.95, at: 0.14, drop: 0.16 });
    braam(b, { f: 55, dur: 2.0, vol: 0.42, at: 0.14, rev: 0.8 });
    pad(b, { freqs: [220, 330, 440, 494, 587, 659], dur: 1.8, vol: 0.2, attack: 0.01, cut: 600, cutPeak: 7000, peakAt: 0.1, cutTo: 900, at: 0.14, rev: 0.9 });
    noise(b, { dur: 0.5, vol: 0.32, f: 3500, to: 120, at: 0.14, warm: true, rev: 0.5 });
    noise(b, { dur: 0.35, vol: 0.18, type: 'bandpass', f: 1500, to: 8000, q: 0.9, attack: 0.05, at: 0.14, pan: -0.7, panTo: 0.7, rev: 0.6 });
    air(b, { dur: 1.6, vol: 0.08, at: 0.16, rev: 0.9 });
  },
  // 必殺ゲージがたまった：トゥルルルーン
  gauge: (b) => rise(b, { base: C * 4, steps: 10, step: 0.035, vol: 0.06, rev: 0.6, end: 1.1 }),
  // ためる：地ひびき＋せり上がる音＋最後にトゥルルルーン
  charge: (b) => {
    tone(b, { f: 41, dur: 1.6, vol: 0.4, attack: 0.5 });
    riser(b, { dur: 1.4, vol: 0.2, f: 82 });
    rise(b, { base: C * 2, steps: 12, step: 0.04, at: 0.9, vol: 0.045, rev: 0.6, end: 0.6 });
  },
  // ビーム：太くうなるエネルギー＋低い地鳴り
  beam: (b) => {
    pad(b, { freqs: [55, 82.5, 110], dur: 1.6, vol: 0.38, attack: 0.03, cut: 700, cutTo: 300, wobble: 11, detune: 20, rev: 0.4, warm: true });
    noise(b, { dur: 1.6, vol: 0.3, f: 1600, to: 500, attack: 0.03, rev: 0.4, pan: -0.3, panTo: 0.3 });
    tone(b, { f: 55, dur: 1.6, vol: 0.35, attack: 0.03 });
    air(b, { dur: 1.4, vol: 0.06, rev: 0.5 });
  },
  // 斬る：鋭い「シュバッ」＋「ドスッ」＋光る和音
  slash: (b) => {
    noise(b, { dur: 0.22, vol: 0.45, type: 'bandpass', f: 1200, to: 9000, q: 1.4, attack: 0.03, pan: -0.6, panTo: 0.6, rev: 0.4 });
    kick(b, { f: 160, to: 45, dur: 0.35, vol: 0.65, at: 0.04 });
    pad(b, { freqs: [C * 4, C * 6, C * 9], dur: 0.9, vol: 0.12, attack: 0.005, cut: 8000, cutTo: 1200, at: 0.04, rev: 0.8 });
  },
  whoosh: (b) =>
    noise(b, { dur: 0.4, vol: 0.32, type: 'bandpass', f: 300, to: 4000, q: 1.0, attack: 0.18, pan: -0.6, panTo: 0.6, rev: 0.3 }),
  // 爆発：低く重い「ドォン」
  boom: (b) => {
    kick(b, { f: 120, to: 30, dur: 1.0, vol: 0.9, drop: 0.2 });
    noise(b, { dur: 1.2, vol: 0.5, f: 1400, to: 70, rev: 0.4, warm: true });
  },
  // とどめの大爆発：ドーン → 低いブォーン → 長く響く
  ultboom: (b) => {
    kick(b, { f: 130, to: 26, dur: 1.8, vol: 1.0, drop: 0.3 });
    braam(b, { f: 41.2, dur: 2.6, vol: 0.45, rev: 0.9 });
    noise(b, { dur: 0.5, vol: 0.6, f: 5000, to: 300, warm: true });
    noise(b, { dur: 2.6, vol: 0.45, f: 1800, to: 60, rev: 0.8 });
    air(b, { dur: 2.0, vol: 0.07, at: 0.05, rev: 1.0 });
  },
  // たおれる：ドーン＋下がっていく音
  ko: (b) => {
    kick(b, { f: 110, to: 28, dur: 1.4, vol: 0.95, drop: 0.25 });
    noise(b, { dur: 1.6, vol: 0.45, f: 2000, to: 60, rev: 0.6, warm: true });
    pad(b, { freqs: [110, 165], dur: 1.6, vol: 0.22, attack: 0.02, cut: 1500, cutTo: 120, bend: 0.5, at: 0.05, rev: 0.6 });
  },
  // 勝ち：ドン＋明るい和音がふわっと広がる＋キラキラ
  win: (b) => {
    kick(b, { f: 140, to: 40, dur: 0.6, vol: 0.6 });
    [0, 2, 4, 5].forEach((s, i) => pluck(b, { f: note(C * 4, s), dur: 0.35, vol: 0.08, at: i * 0.09, rev: 0.5, pan: i * 0.2 - 0.3 }));
    pad(b, { freqs: [C * 2, C * 2.5, C * 3, C * 4.5, C * 4], dur: 2.2, vol: 0.28, attack: 0.04, cut: 5000, cutTo: 800, at: 0.36, rev: 0.7 });
    tone(b, { f: C, dur: 2.0, vol: 0.25, at: 0.36, attack: 0.03 });
    sparkle(b, { base: C * 8, count: 12, spread: 1.2, vol: 0.05, at: 0.4 });
  },
  // 引き分け（時間切れ）：ドン＋どちらでもない和音（ド・ファ・ソ）が、ふわっと鳴って消える
  draw: (b) => {
    kick(b, { f: 130, to: 40, dur: 0.6, vol: 0.55 });
    pad(b, { freqs: [C * 2, C * 2 * 1.335, C * 3, C * 4], dur: 2.0, vol: 0.24, attack: 0.04, cut: 3000, cutTo: 500, rev: 0.7 });
    tone(b, { f: C, dur: 1.8, vol: 0.2, attack: 0.03 });
    air(b, { dur: 1.2, vol: 0.05, rev: 0.6 });
  },
  // 負け：しずかに下がる、こもった和音
  lose: (b) => {
    pad(b, { freqs: [C * 2, C * 2.38, C * 3], dur: 1.8, vol: 0.2, attack: 0.08, cut: 1800, cutTo: 250, bend: 0.94, rev: 0.6 });
    tone(b, { f: C, to: C * 0.84, dur: 1.6, vol: 0.18, attack: 0.05 });
  },
};

// 同じ音が一度にたくさん重なると割れるので、同じ音は 30ms あけて鳴らす
const last: Partial<Record<SfxName, number>> = {};
export function sfx(name: SfxName) {
  if (muted) return;
  try {
    const b = bus();
    if (!b) return;
    const now = performance.now();
    if (now - (last[name] ?? 0) < 30) return;
    last[name] = now;
    SOUNDS[name](b);
    const d = DUCK[name];
    if (d) duckBgm(d);
  } catch {
    /* 音が出せなくても遊べる */
  }
}

/** 試し聞き用：音を、画面に出さずに作って返す（ファイルに書き出して聞き比べるときに使う） */
export async function renderSfx(name: SfxName, seconds = 3, sampleRate = 44100): Promise<AudioBuffer> {
  const c = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  SOUNDS[name](makeBus(c, VOLUME));
  return c.startRendering();
}
