import { BACKDROPS } from '../character/appearance';

/**
 * Portrait backdrops: small pixel-art scenes painted in code behind a
 * fighter's portrait (home nameplates, the creator's backdrop step). Each is
 * BW x BH art pixels, the same box as the nameplate portrait, so one backdrop
 * pixel sits under one fighter pixel. Painted once and kept as a data URL.
 */

export const BW = 60;
export const BH = 48;

type RGB = [number, number, number];
const rgb = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** A tiny deterministic hash for stars and sparks. */
const hash = (x: number, y: number, s: number) => {
  let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

class Paint {
  readonly px = new Uint8ClampedArray(BW * BH * 4);
  set(x: number, y: number, c: number | RGB, a = 1): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= BW || y >= BH) return;
    const [r, g, b] = typeof c === 'number' ? rgb(c) : c;
    const i = (y * BW + x) * 4, p = this.px;
    p[i] = p[i] + (r - p[i]) * a; p[i + 1] = p[i + 1] + (g - p[i + 1]) * a; p[i + 2] = p[i + 2] + (b - p[i + 2]) * a; p[i + 3] = 255;
  }
  /** Sky in flat bands from top to bottom colours (stepped, like hand-placed pixels). */
  sky(stops: number[]): void {
    const n = stops.length - 1;
    for (let y = 0; y < BH; y++) {
      const t = (y / (BH - 1)) * n, k = Math.min(n - 1, Math.floor(t));
      const f = Math.round((t - k) * 4) / 4;
      const a = rgb(stops[k]), b = rgb(stops[k + 1]);
      const c: RGB = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      for (let x = 0; x < BW; x++) this.set(x, y, c);
    }
  }
  disc(cx: number, cy: number, r: number, c: number, a = 1): void {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c, a);
  }
  /** Fills everything below the ridge line `top(x)`. */
  ridge(top: (x: number) => number, c: number, rim?: number): void {
    for (let x = 0; x < BW; x++) {
      const t = Math.round(top(x));
      for (let y = Math.max(0, t); y < BH; y++) this.set(x, y, y === t && rim !== undefined ? rim : c);
    }
  }
  stars(seed: number, below: number, density: number, c: number): void {
    for (let y = 0; y < below; y++)
      for (let x = 0; x < BW; x++) {
        const h = hash(x, y, seed);
        if (h < density) this.set(x, y, c, h < density * 0.35 ? 1 : 0.55);
      }
  }
  /** A pine: a stack of widening triangles on a trunk. */
  pine(x: number, base: number, ht: number, c: number): void {
    for (let y = 0; y < ht; y++) {
      const w = Math.floor(((y % Math.max(3, ht / 3)) / Math.max(3, ht / 3)) * (1 + y / 3)) + 1;
      for (let d = -w; d <= w; d++) this.set(x + d, base - ht + y, c);
    }
    this.set(x, base, c); this.set(x, base + 1, c);
  }
}

const wave = (x: number, parts: [number, number, number][]) =>
  parts.reduce((s, [amp, freq, ph]) => s + amp * Math.sin(x * freq + ph), 0);

const PAINTERS: ((p: Paint) => void)[] = [
  // Twilight: violet dusk over the arena hills, a crescent moon and the first stars.
  (p) => {
    p.sky([0x0e0a24, 0x2a1a52, 0x5a2e74, 0x8a4a7a]);
    p.stars(1, 30, 0.035, 0xfff2d8);
    p.disc(44, 11, 5, 0xfff0c8);
    p.disc(46, 9.5, 4.6, 0x2a1a52);
    p.ridge((x) => 33 + wave(x, [[3, 0.11, 1], [1.5, 0.31, 2]]), 0x3a2050, 0x6a3a7a);
    p.ridge((x) => 39 + wave(x, [[2.2, 0.17, 4], [1, 0.45, 0]]), 0x1c1030, 0x3a2050);
    // Lit windows of a far keep on the hill.
    for (const [x, y] of [[12, 31], [14, 31], [13, 29]] as const) p.set(x, y, 0xffc860);
  },
  // Sunset Peaks: a fat sun sinking behind purple mountains, birds heading home.
  (p) => {
    p.sky([0xff8a3a, 0xff6a5a, 0xc8487a, 0x6a2a6a]);
    p.disc(30, 30, 11, 0xffe08a);
    p.disc(30, 30, 8, 0xfff4c0);
    p.ridge((x) => 26 + Math.abs(((x + 6) % 24) - 12) * 0.9 + wave(x, [[1, 0.7, 0]]), 0x8a3a7a, 0xc8608a);
    p.ridge((x) => 34 + Math.abs(((x + 18) % 30) - 15) * 0.6 + wave(x, [[0.8, 0.9, 1]]), 0x4a1a4a, 0x7a2a6a);
    p.ridge((x) => 43 + wave(x, [[1.2, 0.2, 2]]), 0x2a0c2c);
    for (const [x, y] of [[10, 9], [15, 6], [48, 12]] as const) { p.set(x - 1, y - 1, 0x4a1a3a); p.set(x, y, 0x4a1a3a); p.set(x + 1, y - 1, 0x4a1a3a); }
  },
  // Wildwood: a morning glade, sun shafts through layered pines.
  (p) => {
    p.sky([0xbfeee0, 0x8ad6b8, 0x5aa88a, 0x3a7a62]);
    for (let i = 0; i < 3; i++)
      for (let y = 0; y < BH; y++) for (let w = 0; w < 3; w++) p.set(8 + i * 18 + w + y * 0.45, y, 0xfffbe0, 0.22);
    for (let i = 0; i < 9; i++) p.pine(i * 7 + 3, 34 + (i % 2) * 2, 18 + (i % 3) * 3, 0x4a8a6a);
    for (let i = 0; i < 7; i++) p.pine(i * 9 + 7, 42, 22 + (i % 2) * 4, 0x24563e);
    p.ridge((x) => 42 + wave(x, [[1, 0.4, 0]]), 0x1a3a26, 0x3a7a3a);
  },
  // Ember Forge: black rock spires over a lava glow, sparks drifting up.
  (p) => {
    p.sky([0x140810, 0x2a0e14, 0x5a1a18, 0xb8401a]);
    p.ridge((x) => 20 + Math.abs(((x + 3) % 14) - 7) * 2.2 + wave(x, [[1.5, 0.9, 1]]), 0x2a1214, 0x5a2418);
    p.ridge((x) => 36 + wave(x, [[2, 0.23, 2], [1, 0.8, 0]]), 0x10080a, 0xff6a1a);
    for (let x = 0; x < BW; x++) for (let y = 44; y < BH; y++) p.set(x, y, hash(x, y, 7) < 0.5 ? 0xff8a2a : 0xd04a14);
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(hash(i, 1, 3) * BW), y = Math.floor(hash(i, 2, 3) * 34);
      p.set(x, y, hash(i, 3, 3) < 0.5 ? 0xffd070 : 0xff7a2a);
    }
  },
  // Frostlight: an aurora rippling over snowy peaks under a deep blue night.
  (p) => {
    p.sky([0x060a20, 0x0e1a44, 0x1a3264, 0x2a4a7a]);
    p.stars(5, 36, 0.03, 0xe8f4ff);
    for (let x = 0; x < BW; x++) {
      const y0 = 12 + wave(x, [[3.5, 0.12, 0], [1.5, 0.37, 2]]);
      for (let d = 0; d < 9; d++) p.set(x, y0 + d, d < 3 ? 0x8affd0 : 0x3ad0a0, 0.55 - d * 0.055);
      const y1 = 8 + wave(x, [[2.5, 0.16, 3]]);
      for (let d = 0; d < 5; d++) p.set(x, y1 + d, 0xc070ff, 0.3 - d * 0.05);
    }
    p.ridge((x) => 26 + Math.abs(((x + 10) % 26) - 13) * 0.95, 0x8aa8d0, 0xf0f8ff);
    p.ridge((x) => 32 + Math.abs(((x + 2) % 20) - 10) * 0.8, 0xd8e8f8, 0xffffff);
    p.ridge((x) => 42 + wave(x, [[1, 0.3, 1]]), 0xb8d0ec, 0xe8f4ff);
  },
];

const urls = new Map<number, string>();

/** The backdrop as a data URL, painted on first use. */
export function backdropURL(i: number): string {
  const k = i >= 0 && i < BACKDROPS.length ? i : 0;
  let u = urls.get(k);
  if (!u) {
    const p = new Paint();
    PAINTERS[k](p);
    const c = document.createElement('canvas');
    c.width = BW; c.height = BH;
    c.getContext('2d')!.putImageData(new ImageData(p.px, BW, BH), 0, 0);
    u = c.toDataURL();
    urls.set(k, u);
  }
  return u;
}

/** Puts a backdrop behind `el` (pixelated, covering it, anchored at the bottom). */
export function applyBackdrop(el: HTMLElement, i: number | undefined): void {
  el.style.backgroundImage = `url(${backdropURL(i ?? 0)})`;
  el.classList.add('backdrop');
}
