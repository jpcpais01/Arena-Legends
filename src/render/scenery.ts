import { mix, pack, rgbOf, unpackHex } from './pixel/color';
import { bayer, type Pix } from './pixel/paint';

/** Noise and shading helpers shared by the arena painters. */

export function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1, with separate cell sizes per axis. */
export function noise(x: number, y: number, cx: number, cy: number, s: number): number {
  const gx = x / cx, gy = cy > 0 ? y / cy : 0;
  const ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = gx - ix, fy = gy - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Picks a tone from a dark→light palette for lightness `l`, dithered at band edges. */
export function tone(pal: number[], l: number, x: number, y: number, spread = 0.18): number {
  const t = l + (bayer(x, y) - 0.5) * spread;
  return pal[Math.max(0, Math.min(pal.length - 1, Math.floor(t * pal.length)))];
}

/** Blends every opaque pixel toward `c` (atmospheric haze). */
export function haze(p: Pix, c: number, t: number): void {
  for (let i = 0; i < p.data.length; i++) {
    const v = p.data[i];
    if (v >>> 24) p.data[i] = pack(mix(unpackHex(v), c, t));
  }
}

/**
 * Ambient occlusion: each pixel sinks toward `shade` by how much of the layer
 * fills a box above it, so crown undersides, the feet of trunks and bushes and
 * every crevice go dark while tops stay lit. A summed-area table makes the box
 * free; the result is dithered into a few steps to stay pixel art.
 */
export function occlude(p: Pix, rx: number, up: number, strength: number, shade: number): void {
  const { w, h, data } = p;
  const sw = w + 1;
  const sat = new Uint32Array(sw * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] >>> 24) row++;
      sat[(y + 1) * sw + x + 1] = sat[y * sw + x + 1] + row;
    }
  }
  const [sr, sg, sb] = rgbOf(shade);
  const area = (2 * rx + 1) * up;
  for (let y = 1; y < h; y++) {
    const y0 = Math.max(0, y - up);
    for (let x = 0; x < w; x++) {
      const i = y * w + x, c = data[i];
      if (!(c >>> 24)) continue;
      const x0 = Math.max(0, x - rx), x1 = Math.min(w, x + rx + 1);
      const n = sat[y * sw + x1] - sat[y0 * sw + x1] - sat[y * sw + x0] + sat[y0 * sw + x0];
      const cov = Math.min(1, Math.max(0, (n / area - 0.12) / 0.72));
      const k = (Math.floor(cov * 4 + bayer(x, y)) / 4) * strength;
      if (k <= 0) continue;
      const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
      data[i] = ((c & 0xff000000) | (Math.round(b + (sb - b) * k) << 16) | (Math.round(g + (sg - g) * k) << 8) | Math.round(r + (sr - r) * k)) >>> 0;
    }
  }
}
