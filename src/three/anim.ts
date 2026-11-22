// 時間で値を動かす小さな仕組み。Stage の時間（スロー・倍速）に従う。

export type EaseFn = (t: number) => number;

export const Ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  outExpo: (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
};

interface Item {
  t: number;
  dur: number;
  fn: (k: number) => void;
  ease: EaseFn;
  resolve: () => void;
}

export class Tweener {
  private items: Item[] = [];

  add(dur: number, fn: (k: number) => void, ease: EaseFn = Ease.outCubic): Promise<void> {
    if (dur <= 0) {
      fn(1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.items.push({ t: 0, dur, fn, ease, resolve });
    });
  }

  wait(sec: number): Promise<void> {
    return this.add(sec, () => {}, Ease.linear);
  }

  update(dt: number) {
    if (!this.items.length) return;
    const done: Item[] = [];
    for (const it of this.items) {
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      it.fn(it.ease(k));
      if (k >= 1) done.push(it);
    }
    if (done.length) {
      this.items = this.items.filter((i) => !done.includes(i));
      done.forEach((i) => i.resolve());
    }
  }

  clear() {
    const list = this.items;
    this.items = [];
    list.forEach((i) => i.resolve());
  }
}

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
