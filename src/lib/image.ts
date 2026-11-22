// 写真を縮めて、AIに送る形・保存用の小さい絵・同じ写真を見分ける印・目立つ色を作る

export interface PreparedImage {
  dataUrl: string;
  thumb: string;
  hash: string;
  colors: string[];
}

function loadImg(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読みこめませんでした'));
    };
    img.src = url;
  });
}

function draw(img: HTMLImageElement, max: number) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s));
  const h = Math.max(1, Math.round(img.naturalHeight * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  return { c, ctx, w, h };
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function dominantColors(ctx: CanvasRenderingContext2D, w: number, h: number): string[] {
  const data = ctx.getImageData(0, 0, w, h).data;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number; sat: number }>();
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0, sat: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    e.sat += max === 0 ? 0 : (max - min) / max;
    buckets.set(key, e);
  }
  const list = [...buckets.values()]
    .map((e) => ({ ...e, score: e.n * (0.4 + e.sat / e.n) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return list.map((e) => {
    const hex = (v: number) => Math.round(v / e.n).toString(16).padStart(2, '0');
    return `#${hex(e.r)}${hex(e.g)}${hex(e.b)}`;
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選んでください');
  const img = await loadImg(file);
  const big = draw(img, 640);
  const dataUrl = big.c.toDataURL('image/jpeg', 0.85);
  const small = draw(img, 160);
  const thumb = small.c.toDataURL('image/jpeg', 0.75);
  const hash = await sha256(dataUrl);
  const colors = dominantColors(small.ctx, small.w, small.h);
  return { dataUrl, thumb, hash, colors };
}
