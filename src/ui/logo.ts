// The game logo, drawn as pixel art: the words are set in the UI font at a
// small size, thresholded to hard pixels, then given a metal ramp, a top
// highlight, a chunky extruded side and an ink outline.

const INK = [10, 6, 18];

interface Ramp { tones: number[][]; hi: number[]; side: number[]; sideLo: number[] }
const GOLD: Ramp = {
  tones: [[255, 226, 128], [246, 190, 74], [222, 148, 44], [184, 112, 30]],
  hi: [255, 255, 230], side: [122, 64, 20], sideLo: [74, 36, 14],
};
const SILVER: Ramp = {
  tones: [[246, 242, 255], [214, 206, 240], [176, 164, 216], [140, 126, 190]],
  hi: [255, 255, 255], side: [74, 60, 112], sideLo: [44, 34, 72],
};

/** Hard-edged mask of `text` set at `size` px. */
function mask(text: string, size: number): { w: number; h: number; m: Uint8Array } {
  const c = document.createElement('canvas');
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const font = `700 ${size}px 'Pixelify Sans', monospace`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 4;
  const h = Math.ceil(size * 1.3);
  c.width = w; c.height = h;
  g.font = font;
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  g.fillText(text, 2, Math.round(size * 1.0));
  const d = g.getImageData(0, 0, w, h).data;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] >= 110 ? 1 : 0;
  // Trim empty rows top and bottom.
  let top = 0, bot = h - 1;
  const rowEmpty = (y: number) => { for (let x = 0; x < w; x++) if (m[y * w + x]) return false; return true; };
  while (top < bot && rowEmpty(top)) top++;
  while (bot > top && rowEmpty(bot)) bot--;
  const th = bot - top + 1;
  return { w, h: th, m: m.slice(top * w, (bot + 1) * w) };
}

/** Paints a word into `img` at (ox, oy) with its ramp, side and highlight. Outline comes later. */
function paintWord(img: Uint8ClampedArray, W: number, solid: Uint8Array, word: ReturnType<typeof mask>, ox: number, oy: number, ramp: Ramp, depth: number): void {
  const put = (x: number, y: number, c: number[]) => {
    const i = (y * W + x) * 4;
    img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = 255;
    solid[y * W + x] = 1;
  };
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < word.w && y < word.h && word.m[y * word.w + x] === 1;
  // Extruded side first, deepest layer first.
  for (let d = depth; d >= 1; d--) {
    for (let y = 0; y < word.h; y++) for (let x = 0; x < word.w; x++) {
      if (on(x, y)) put(ox + x, oy + y + d, d === depth ? ramp.sideLo : ramp.side);
    }
  }
  for (let y = 0; y < word.h; y++) {
    const tone = ramp.tones[Math.min(ramp.tones.length - 1, Math.floor((y / word.h) * ramp.tones.length))];
    for (let x = 0; x < word.w; x++) {
      if (!on(x, y)) continue;
      put(ox + x, oy + y, !on(x, y - 1) ? ramp.hi : tone);
    }
  }
}

/**
 * Renders the logo canvas (art pixels; scale it with CSS and `image-rendering: pixelated`).
 * Waits for the UI font so the letters come out right.
 */
export async function drawLogo(): Promise<HTMLCanvasElement> {
  try { await document.fonts.load("700 16px 'Pixelify Sans'"); } catch { /* fallback font */ }
  const a = mask('ARENA', 16);
  const b = mask('LEGENDS', 24);
  const depth = 3, pad = 3;
  const W = Math.max(a.w, b.w) + pad * 2 + 2;
  const gap = 2;
  const H = pad + a.h + depth + gap + b.h + depth + pad + 2;
  const img = new Uint8ClampedArray(W * H * 4);
  const solid = new Uint8Array(W * H);
  const bx = Math.round((W - b.w) / 2), by = pad + a.h + depth + gap;
  paintWord(img, W, solid, a, Math.round((W - a.w) / 2), pad, SILVER, depth);
  paintWord(img, W, solid, b, bx, by, GOLD, depth);
  // Ink outline around everything solid (8-way).
  const out = img.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (solid[y * W + x]) continue;
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < W && Y < H && solid[Y * W + X]) { edge = true; break; }
    }
    if (!edge) continue;
    const i = (y * W + x) * 4;
    out[i] = INK[0]; out[i + 1] = INK[1]; out[i + 2] = INK[2]; out[i + 3] = 255;
  }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.className = 'logo-art';
  c.getContext('2d')!.putImageData(new ImageData(out, W, H), 0, 0);
  return c;
}

let cached: Promise<HTMLCanvasElement> | null = null;
/** A copy of the logo (drawn once). */
export function logo(): Promise<HTMLCanvasElement> {
  cached ??= drawLogo();
  return cached.then((src) => {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.className = 'logo-art';
    c.getContext('2d')!.drawImage(src, 0, 0);
    return c;
  });
}
