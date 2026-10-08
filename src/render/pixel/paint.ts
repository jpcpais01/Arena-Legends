import { pack } from './color';

/** 4×4 Bayer matrix, 0..15. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Ordered-dither threshold at a pixel (0..1). */
export const bayer = (x: number, y: number): number => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/**
 * A plain pixel buffer for painting backgrounds and props by hand: solid
 * fills, ordered dithering, lines and simple shapes. Colours are 0xRRGGBB.
 */
export class Pix {
  readonly data: Uint32Array;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint32Array(w * h);
  }

  set(x: number, y: number, c: number, a = 255): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = pack(c, a);
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x];
  }

  /** Filled (non-transparent) at x, y. */
  has(x: number, y: number): boolean {
    return (this.get(x, y) >>> 24) > 0;
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
    const x1 = Math.min(this.w, (x + w) | 0), y1 = Math.min(this.h, (y + h) | 0);
    const p = pack(c);
    for (let yy = y0; yy < y1; yy++) this.data.fill(p, yy * this.w + x0, yy * this.w + x1);
  }

  /** Rect where each pixel picks `b` over `a` when its dither threshold is below `t`. */
  dither(x: number, y: number, w: number, h: number, a: number, b: number, t: number): void {
    const pa = pack(a), pb = pack(b);
    for (let yy = Math.max(0, y | 0); yy < Math.min(this.h, (y + h) | 0); yy++) {
      for (let xx = Math.max(0, x | 0); xx < Math.min(this.w, (x + w) | 0); xx++) {
        this.data[yy * this.w + xx] = bayer(xx, yy) < t ? pb : pa;
      }
    }
  }

  /** Vertical gradient through `stops` (top to bottom) with ordered dithering between bands. */
  gradient(x: number, y: number, w: number, h: number, stops: number[]): void {
    const n = stops.length - 1;
    for (let yy = 0; yy < h; yy++) {
      const t = (yy / Math.max(1, h - 1)) * n;
      const i = Math.min(n - 1, Math.floor(t));
      const f = t - i;
      const pa = pack(stops[i]), pb = pack(stops[i + 1]);
      const ry = y + yy;
      if (ry < 0 || ry >= this.h) continue;
      for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) {
        this.data[ry * this.w + xx] = bayer(xx, ry) < f ? pb : pa;
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: number): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
        if (u * u + v * v <= 1) this.set(x, y, c);
      }
    }
  }

  /** Polygon fill (even-odd), points as flat [x, y, ...]. */
  poly(pts: number[], c: number): void {
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 1; i < pts.length; i += 2) { y0 = Math.min(y0, pts[i]); y1 = Math.max(y1, pts[i]); }
    const n = pts.length / 2;
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
        if ((yi > yc) !== (yj > yc)) xs.push(xi + ((yc - yi) / (yj - yi)) * (xj - xi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(this.w, Math.round(xs[k + 1])); x++) this.set(x, y, c);
      }
    }
  }

  /** Copies another buffer on top (transparent pixels skipped). */
  blit(src: Pix, dx: number, dy: number): void {
    for (let y = 0; y < src.h; y++) {
      const ty = y + dy;
      if (ty < 0 || ty >= this.h) continue;
      for (let x = 0; x < src.w; x++) {
        const c = src.data[y * src.w + x];
        if (!(c >>> 24)) continue;
        const tx = x + dx;
        if (tx < 0 || tx >= this.w) continue;
        this.data[ty * this.w + tx] = c;
      }
    }
  }

  /** 1px outline around everything opaque, in `c`. */
  outline(c: number): void {
    const p = pack(c);
    const src = this.data.slice();
    const op = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && (src[y * this.w + x] >>> 24) > 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (op(x, y)) continue;
      if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) this.data[y * this.w + x] = p;
    }
  }
}
