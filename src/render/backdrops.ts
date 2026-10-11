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
  rect(x: number, y: number, w: number, h: number, c: number, a = 1): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number, a = 1): void {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c, a);
  }
  /** A soft light in stepped rings (no smooth gradient, so it still reads as pixels). */
  glow(cx: number, cy: number, r: number, c: number, a = 0.3): void {
    for (const k of [1, 0.7, 0.42]) this.disc(cx, cy, r * k, c, a * 0.5);
  }
  /** Round puffs (clouds, canopies): a shade rim at the bottom right, the body, then a highlight. */
  cluster(puffs: [number, number, number][], c: number, shade: number, hi?: number): void {
    for (const [x, y, r] of puffs) this.disc(x + 0.6, y + 1, r, shade);
    for (const [x, y, r] of puffs) this.disc(x, y, r - 0.3, c);
    if (hi !== undefined) for (const [x, y, r] of puffs) this.disc(x - r * 0.35, y - r * 0.4, r * 0.4, hi);
  }
  /** Like ridge, but slopes facing right fall in shade (dunes, snowbanks). */
  dune(top: (x: number) => number, lit: number, shade: number, rim?: number): void {
    for (let x = 0; x < BW; x++) {
      const t = Math.round(top(x)), dark = top(x + 1) > top(x) + 0.15;
      for (let y = Math.max(0, t); y < BH; y++) this.set(x, y, y === t && rim !== undefined && !dark ? rim : dark ? shade : lit);
    }
  }
  /** Single pixels scattered over a box (petals, leaves, sparks, rain). */
  scatter(seed: number, n: number, x: number, y: number, w: number, h: number, colors: number[], a = 1): void {
    for (let i = 0; i < n; i++)
      this.set(x + hash(i, 1, seed) * w, y + hash(i, 2, seed) * h, colors[Math.floor(hash(i, 3, seed) * colors.length)], a);
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
  // Coral Reef: sunlight wavering down through clear water onto corals and kelp.
  (p) => {
    p.sky([0x7ae4ee, 0x2aa8cc, 0x1a6e9e, 0x0e3e6e]);
    for (let x = 0; x < BW; x++) if (wave(x, [[1, 0.5, 0], [1, 0.23, 2]]) > 0.6) p.set(x, 0, 0xd8fcff);
    for (let i = 0; i < 5; i++)
      for (let y = 0; y < 40; y++) for (let w = 0; w < 2; w++) p.set(5 + i * 12 + w + (i * 12 - 24) * y * 0.012, y, 0xe8ffff, 0.18 - y * 0.004);
    p.ridge((x) => 30 + wave(x, [[3, 0.13, 1], [1.2, 0.4, 0]]), 0x1a5a82, 0x2a7a9a);
    for (const [x0, ph] of [[4, 0], [9, 2], [53, 1], [57, 3]] as const)
      for (let y = 18; y < 44; y++) p.set(x0 + Math.sin(y * 0.35 + ph) * 1.4, y, y % 4 === 0 ? 0x5ac87a : 0x2a8a5a);
    p.ridge((x) => 42 + wave(x, [[1.2, 0.3, 2], [0.6, 0.9, 0]]), 0xe0c890, 0xf4e0b0);
    p.scatter(11, 26, 0, 43, BW, 5, [0xc8a870, 0xf8ecc8]);
    // Branch coral on the left, brain coral and a fan on the right.
    for (const [dx, h] of [[-3, 7], [-1, 10], [1, 8], [3, 6]] as const) {
      p.line(13, 43, 13 + dx, 43 - h, 0xf06a7a); p.line(13 + dx, 43 - h, 13 + dx * 1.6, 43 - h - 2, 0xf06a7a);
      p.set(13 + dx * 1.6, 43 - h - 2, 0xffb0b8);
    }
    p.disc(47, 44, 4.5, 0xc84a8a); p.disc(46.5, 43, 3.5, 0xe86aa8);
    for (let x = 43; x <= 51; x += 2) p.line(x, 41, x + 1, 45, 0xa83a72);
    for (let a = -1.2; a <= 1.2; a += 0.3) p.line(39, 43, 39 + Math.sin(a) * 6, 43 - Math.cos(a) * 7, 0xf0a030);
    // Bubbles and a little shoal.
    for (const [x, y] of [[20, 30], [21, 25], [19, 19], [40, 22], [41, 15]] as const) {
      p.set(x - 1, y, 0xe8ffff); p.set(x + 1, y, 0xe8ffff); p.set(x, y - 1, 0xe8ffff); p.set(x, y + 1, 0xe8ffff);
    }
    for (const [x, y] of [[30, 12], [34, 14], [31, 16], [26, 14]] as const) {
      p.set(x, y, 0xffb030); p.set(x + 1, y, 0xffd060); p.set(x - 1, y - 1, 0xf07a20); p.set(x - 1, y + 1, 0xf07a20);
    }
  },
  // Golden Dunes: a white noon sun over rippled dunes and a half-buried pyramid.
  (p) => {
    p.sky([0x4aa0e0, 0x8ac8ee, 0xe8e0c0, 0xf8d498]);
    p.glow(47, 9, 9, 0xfff8e0, 0.5);
    p.disc(47, 9, 3.5, 0xfffcf0);
    for (const [x, y, w] of [[6, 7, 9], [11, 9, 6], [26, 5, 8]] as const) p.rect(x, y, w, 1, 0xffffff, 0.35);
    // A distant pyramid, lit on the left.
    for (let y = 0; y < 10; y++) { p.rect(14 - y, 22 + y, y + 1, 1, 0xe8b880); p.rect(15, 22 + y, y, 1, 0xb08058); }
    p.dune((x) => 30 + wave(x, [[2.5, 0.12, 1], [1, 0.33, 2]]), 0xe8b878, 0xc49060, 0xf4d098);
    p.dune((x) => 36 + wave(x, [[3, 0.09, 3], [1.2, 0.27, 0]]), 0xf0c070, 0xc8884a, 0xfcdc98);
    // A leaning obelisk on the middle dune.
    p.rect(50, 26, 2, 11, 0x9a6a48); p.rect(52, 26, 1, 11, 0x6a4430); p.set(50, 25, 0x9a6a48); p.set(51, 24, 0xc8946a);
    p.dune((x) => 42 + wave(x, [[2, 0.14, 5], [0.8, 0.5, 1]]), 0xf8d088, 0xd09050, 0xfff0b8);
    for (let x = 0; x < BW; x += 3) p.set(x + (hash(x, 4, 2) < 0.5 ? 1 : 0), 45 + Math.round(wave(x, [[0.8, 0.4, 0]])), 0xd8a060);
  },
  // Blossom Shrine: a pink dawn, a snowy peak, a pagoda and cherry petals on the wind.
  (p) => {
    p.sky([0xffe0e4, 0xffbccc, 0xf0a4c4, 0xc890b8]);
    p.disc(26, 20, 6, 0xfff4ec, 0.7);
    const peak = (x: number) => 15 + Math.abs(x - 30) * 0.85 + wave(x, [[0.6, 0.8, 0]]);
    p.ridge(peak, 0xb894c0, 0xd8b8d8);
    for (let x = 0; x < BW; x++) for (let y = Math.round(peak(x)); y < 21 + wave(x, [[1, 0.9, 1]]); y++) p.set(x, y, 0xfff4fa);
    p.ridge((x) => 36 + wave(x, [[1.5, 0.15, 2], [0.7, 0.5, 0]]), 0x9a7aa8, 0xb898c0);
    // Pagoda: three roofs with upturned eaves.
    for (let k = 0; k < 3; k++) {
      const y = 36 - k * 6, w = 11 - k * 2, x = 47 - (w >> 1);
      p.rect(x + 2, y, w - 4, 5, 0x7a4060); p.rect(x + 3, y + 1, 1, 2, 0xffc890); p.rect(x + w - 4, y + 1, 1, 2, 0xffc890);
      p.rect(x, y - 1, w, 1, 0x4a2440); p.set(x - 1, y - 2, 0x4a2440); p.set(x + w, y - 2, 0x4a2440); p.rect(x + 1, y - 2, w - 2, 1, 0x5a2e4e);
    }
    p.line(47, 21, 47, 17, 0x4a2440);
    p.ridge((x) => 42 + wave(x, [[1, 0.25, 1]]), 0x6a7a5a, 0x8a9a6a);
    // Cherry tree leaning in from the left.
    p.line(0, 44, 5, 30, 0x4a2a3a); p.line(1, 44, 6, 30, 0x4a2a3a); p.line(5, 32, 13, 24, 0x4a2a3a); p.line(4, 34, 2, 22, 0x4a2a3a);
    p.cluster([[3, 18, 6], [10, 20, 5.5], [15, 23, 4], [1, 26, 4], [7, 14, 4]], 0xffa8c8, 0xe07aa8, 0xffd4e4);
    p.scatter(4, 34, 0, 0, BW, BH, [0xffc0d8, 0xffe0ec, 0xf090b8]);
  },
  // Starlit Void: deep space, a violet nebula, a ringed planet and a shooting star.
  (p) => {
    p.sky([0x04030c, 0x0a0820, 0x140a2c, 0x0a0618]);
    for (let y = 0; y < BH; y++)
      for (let x = 0; x < BW; x++) {
        const d = Math.abs(y - (34 - x * 0.5 + wave(x, [[3, 0.15, 1]]))), n = 0.6 + 0.4 * Math.sin(x * 0.4 + y * 0.3) * Math.sin(y * 0.5 - x * 0.2);
        const v = Math.floor(Math.max(0, 1 - d / 10) * n * 4) / 4;
        if (v > 0) p.set(x, y, d < 4 ? 0xc04aa0 : 0x3a5ab0, v * 0.45);
      }
    p.stars(9, BH, 0.035, 0xffffff);
    for (const [x, y, c] of [[8, 30, 0xfff0c0], [33, 6, 0xa8d0ff], [22, 40, 0xffd0f0]] as const) {
      p.set(x, y, c); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + dx, y + dy, c, 0.5);
    }
    p.line(13, 3, 22, 8, 0xffffff, 0.3); p.line(17, 5, 22, 8, 0xffffff, 0.6); p.set(22, 8, 0xffffff);
    p.disc(10, 12, 2.2, 0xb8b0d8); p.disc(10.8, 11.4, 1.7, 0xd8d0f0);
    // Ringed planet: the back of the ring, the planet, then the front of the ring.
    const ring = (front: boolean) => {
      for (let a = 0; a < Math.PI * 2; a += 0.05) {
        if ((Math.sin(a) > 0) !== front) continue;
        const x = 46 + Math.cos(a) * 12, y = 15 + Math.sin(a) * 3 - Math.cos(a) * 3;
        p.set(x, y, 0xe8c890); p.set(x, y + 1, 0xa08060, 0.6);
      }
    };
    ring(false);
    p.disc(46, 15, 7, 0x4a2a7a); p.disc(45, 14, 6.2, 0x7a4ab0);
    for (const y of [12, 15, 17]) for (let x = 40; x < 52; x++) if ((x - 45) ** 2 + (y - 14) ** 2 < 37) p.set(x, y, 0x9a6ac8, 0.6);
    ring(true);
    p.ridge((x) => 44 + wave(x, [[1.2, 0.3, 0], [0.6, 0.8, 2]]), 0x1c1430, 0x5a4a8a);
  },
  // Stormcoast: lightning over a black sea, a lighthouse holding on at the cliff edge.
  (p) => {
    p.sky([0x14182a, 0x262c40, 0x384258, 0x4a5468]);
    p.cluster([[4, 2, 6], [14, 4, 6], [25, 1, 7], [36, 4, 6], [48, 2, 7], [58, 5, 5]], 0x1a1e2c, 0x0e1018, 0x2e3446);
    // The bolt with a forked branch, and the flash around it.
    p.glow(40, 18, 14, 0x9ab0ff, 0.2);
    const bolt: [number, number][] = [[41, 6], [38, 13], [42, 16], [37, 24], [40, 26], [36, 33]];
    for (let i = 1; i < bolt.length; i++) {
      p.line(bolt[i - 1][0] + 1, bolt[i - 1][1], bolt[i][0] + 1, bolt[i][1], 0x8aa0ff, 0.5);
      p.line(bolt[i - 1][0], bolt[i - 1][1], bolt[i][0], bolt[i][1], 0xf4f8ff);
    }
    p.line(42, 16, 47, 21, 0xc8d4ff); p.line(47, 21, 46, 25, 0xc8d4ff);
    p.ridge((x) => 33 + wave(x, [[0.8, 0.5, 0], [0.5, 1.1, 1]]), 0x24405a, 0x6a8aa8);
    p.ridge((x) => 38 + wave(x, [[1.2, 0.35, 2], [0.6, 0.9, 0]]), 0x1a3046, 0x9ab4c8);
    p.ridge((x) => 43 + wave(x, [[1.5, 0.28, 4], [0.7, 0.8, 1]]), 0x122436, 0xe0ecf4);
    // Cliff and lighthouse with its beam.
    for (let x = 12; x < 52; x++) {
      const h = (x - 12) * 0.16;
      for (let y = Math.round(11 - h - (x - 12) * 0.04); y <= 11 + h; y++) p.set(x, y, 0xfff0a0, 0.22 - (x - 12) * 0.004);
    }
    p.ridge((x) => (x < 20 ? 23 + wave(x, [[1, 0.6, 0]]) + Math.max(0, x - 15) * 1.2 : 99), 0x262630, 0x4a4a56);
    for (let y = 13; y < 23; y++) p.rect(6, y, 5, 1, ((y - 13) >> 1) % 2 ? 0xc83a3a : 0xe8e4dc);
    p.rect(10, 13, 1, 10, 0x5a2a30, 0.5);
    p.rect(6, 10, 5, 3, 0xffe070); p.rect(7, 11, 3, 1, 0xfff8d0); p.rect(5, 9, 7, 1, 0x2a2a34); p.rect(6, 8, 5, 1, 0x2a2a34); p.set(8, 7, 0x2a2a34);
    p.scatter(6, 70, 0, 0, BW, BH, [0x8a9ab0], 0.45);
  },
  // Glowcap Grotto: a dark cavern lit only by giant glowing mushrooms and drifting spores.
  (p) => {
    p.sky([0x05080e, 0x0a1220, 0x0e1a28, 0x101e2c]);
    p.scatter(8, 90, 0, 0, BW, 40, [0x16222e, 0x1a2836]);
    for (const [x, h, w] of [[4, 10, 3], [13, 6, 2], [21, 13, 3], [31, 5, 2], [38, 9, 2.5], [47, 14, 3], [56, 7, 2]] as const)
      for (let y = 0; y < h; y++) {
        const r = w * (1 - y / h);
        for (let d = -Math.floor(r); d <= Math.floor(r); d++) p.set(x + d, y, d === -Math.floor(r) ? 0x2a3e50 : 0x182634);
      }
    p.ridge((x) => 41 + wave(x, [[1.5, 0.22, 1], [0.6, 0.7, 0]]), 0x0c141e, 0x2a5058);
    const shroom = (x: number, base: number, r: number, cap: number, dark: number, spot: number) => {
      p.glow(x, base - r * 1.4, r * 3, cap, 0.35);
      p.rect(x - 1, base - r * 1.6, 2, r * 1.6, 0xb8c0b0); p.rect(x, base - r * 1.6, 1, r * 1.6, 0x8a9488);
      for (let y = 0; y <= r; y++) for (let d = -r; d <= r; d++)
        if (d * d + (y * 1.6) ** 2 <= r * r) p.set(x + d, base - r * 1.6 - y, y === 0 ? dark : cap);
      p.set(x - r * 0.4, base - r * 1.6 - r * 0.4, spot); p.set(x + r * 0.3, base - r * 1.6 - r * 0.25, spot);
    };
    shroom(9, 44, 7, 0x2ae0c0, 0x18907a, 0xc8fff0);
    shroom(50, 43, 6, 0xd84ad0, 0x8a2a88, 0xffc8f8);
    shroom(19, 42, 3, 0x7ac8ff, 0x3a7ab0, 0xe0f4ff);
    shroom(41, 43, 3.5, 0x2ae0c0, 0x18907a, 0xc8fff0);
    p.scatter(13, 22, 0, 6, BW, 34, [0x8affe0, 0xff9af4, 0xb0e0ff]);
  },
  // Cloud Isles: bright open sky, floating islands spilling waterfalls into a sea of clouds.
  (p) => {
    p.sky([0x2a7ae0, 0x4a9cf0, 0x80c4f8, 0xc8e8ff]);
    p.glow(56, 4, 12, 0xffffe8, 0.45);
    p.cluster([[8, 12, 3], [12, 11, 4], [16, 13, 2.5]], 0xffffff, 0xc8dcf4);
    const isle = (x: number, y: number, w: number) => {
      for (let j = 0; j < w * 0.9; j++) p.rect(x - w + j * 1.1, y + j, Math.max(1, (w - j * 1.1) * 2), 1, j % 3 === 2 ? 0x6a4a3a : 0x8a6a52);
      p.rect(x - w, y - 1, w * 2, 2, 0x4ab84a); p.rect(x - w, y - 2, w * 2, 1, 0x7ae06a);
    };
    isle(20, 22, 7);
    p.cluster([[17, 17, 2.5], [21, 16, 3]], 0x3a9a4a, 0x22703a, 0x6ac86a);
    p.line(17, 20, 17, 18, 0x5a3a2a);
    for (let y = 23; y < 40; y++) p.set(14, y, y % 3 ? 0xe8f8ff : 0xa8d8f8);
    isle(46, 13, 4);
    p.cluster([[46, 9, 2]], 0xf0a8c8, 0xc87aa0);
    for (let y = 14; y < 38; y++) p.set(49, y, 0xd8f0ff, 0.7);
    for (const [x, y] of [[32, 8], [36, 6]] as const) { p.set(x - 1, y - 1, 0x2a4a7a); p.set(x, y, 0x2a4a7a); p.set(x + 1, y - 1, 0x2a4a7a); }
    const sea: [number, number, number][] = [];
    for (let x = -2; x < BW + 4; x += 5) sea.push([x, 41 + hash(x, 1, 3) * 3, 4 + hash(x, 2, 3) * 2]);
    p.cluster(sea, 0xffffff, 0xb8d0ec, 0xffffff);
    p.rect(0, 45, BW, 3, 0xf0f6ff);
  },
  // Haunted Moor: a huge green moon, a dead tree, crooked graves and creeping mist.
  (p) => {
    p.sky([0x081210, 0x0e2420, 0x1a3e34, 0x305a48]);
    p.stars(3, 26, 0.02, 0xd8f0e0);
    p.glow(40, 14, 14, 0xc8f0c0, 0.3);
    p.disc(40, 14, 8, 0xe4f4cc);
    for (const [x, y, r] of [[37, 12, 1.6], [43, 16, 2], [41, 10, 1], [38, 17, 1]] as const) p.disc(x, y, r, 0xc4d8a8);
    for (const [x, y] of [[30, 9], [47, 6], [52, 11]] as const) {
      p.set(x, y, 0x060a0a); p.set(x - 1, y - 1, 0x060a0a); p.set(x + 1, y - 1, 0x060a0a); p.set(x - 2, y, 0x060a0a); p.set(x + 2, y, 0x060a0a);
    }
    p.ridge((x) => 36 + wave(x, [[2, 0.14, 1], [0.8, 0.5, 0]]), 0x12241c, 0x2a4636);
    // The dead tree.
    p.line(6, 44, 9, 20, 0x060c0a); p.line(7, 44, 10, 20, 0x060c0a); p.line(5, 44, 8, 26, 0x060c0a);
    p.line(9, 26, 16, 19, 0x060c0a); p.line(16, 19, 19, 20, 0x060c0a); p.line(9, 23, 4, 16, 0x060c0a); p.line(4, 16, 2, 17, 0x060c0a);
    p.line(10, 20, 12, 14, 0x060c0a); p.line(13, 22, 15, 25, 0x060c0a);
    // Graves.
    for (const [x, y, k] of [[24, 36, 0], [33, 38, 1], [49, 37, 0], [56, 39, 1]] as const) {
      if (k) { p.rect(x, y - 6, 1, 7, 0x4a5a54); p.rect(x - 2, y - 4, 5, 1, 0x4a5a54); p.set(x - 2, y - 4, 0x6a7a72); }
      else { p.rect(x - 2, y - 4, 5, 5, 0x3a4a44); p.rect(x - 1, y - 5, 3, 1, 0x3a4a44); p.rect(x - 2, y - 4, 1, 5, 0x5a6a62); p.set(x - 1, y - 5, 0x5a6a62); }
    }
    p.ridge((x) => 41 + wave(x, [[1, 0.3, 2]]), 0x0a1812, 0x1e3a2a);
    for (const y0 of [38, 42, 45])
      for (let x = 0; x < BW; x++) if (wave(x, [[1, 0.21, y0], [1, 0.47, y0 * 2]]) > -0.4) p.set(x, y0 + Math.round(wave(x, [[0.8, 0.15, y0]])), 0xb8e0d0, 0.28);
    for (const [x, y] of [[20, 28], [53, 27], [29, 31]] as const) { p.glow(x, y, 4, 0x8aff9a, 0.4); p.set(x, y, 0xe0ffe0); }
  },
  // Throne Hall: torchlit stone, red banners and moonlight through a tall arched window.
  (p) => {
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < BW; x++) {
        const off = (y >> 2) % 2 ? 3 : 0;
        p.set(x, y, y % 4 === 3 || (x + off) % 6 === 5 ? 0x22181c : hash((x + off) / 6 | 0, y >> 2, 4) < 0.5 ? 0x3e2e2e : 0x463434);
      }
    // Arched window and its fall of light.
    for (let y = 4; y < 26; y++)
      for (let x = 24; x < 36; x++) {
        if (y < 10 && (x - 29.5) ** 2 + ((y - 10) * 1.0) ** 2 > 36) continue;
        p.set(x, y, x === 29 || x === 30 || y === 15 ? 0x2a2030 : y < 12 ? 0x3a5aa8 : 0x5a7ac8);
      }
    for (const [x, y] of [[26, 8], [33, 7], [27, 13], [34, 18], [25, 21], [32, 23]] as const) p.set(x, y, 0xe8f0ff);
    for (let y = 26; y < 48; y++) p.rect(24 - (y - 26) * 0.3, y, 12 + (y - 26) * 0.6, 1, 0xb8c8ff, 0.1);
    for (const [x, c] of [[13, 0xa82a2a], [42, 0xa82a2a]] as const) {
      p.rect(x, 3, 6, 18, c); p.rect(x, 3, 1, 18, 0xe8b030); p.rect(x + 5, 3, 1, 18, 0xe8b030); p.rect(x - 1, 2, 8, 1, 0x6a4a2a);
      p.set(x + 1, 21, c); p.set(x + 4, 21, c); p.set(x + 2, 21, c, 0); p.set(x + 1, 22, c); p.set(x + 4, 22, c);
      p.disc(x + 2.5, 10, 1.6, 0xe8b030); p.set(x + 2, 10, 0xa82a2a);
    }
    // Pillars with torches.
    for (const x of [3, 51]) {
      p.rect(x, 0, 6, 40, 0x8a7a70); p.rect(x, 0, 1, 40, 0xb4a494); p.rect(x + 5, 0, 1, 40, 0x5a4a44);
      p.rect(x - 1, 4, 8, 2, 0x9a8a80); p.rect(x - 1, 36, 8, 4, 0x6a5a54);
      const tx = x === 3 ? x + 8 : x - 3;
      p.glow(tx, 16, 9, 0xff9a3a, 0.35);
      p.rect(tx, 18, 1, 3, 0x3a2a20); p.set(tx, 17, 0xff8a2a); p.set(tx, 16, 0xffd060); p.set(tx, 15, 0xffe8a0, 0.7);
    }
    for (let y = 40; y < BH; y++)
      for (let x = 0; x < BW; x++) p.set(x, y, ((x >> 2) + (y >> 1)) % 2 ? 0x5a4a48 : 0x4a3c3a);
    for (let y = 40; y < BH; y++) {
      const w = 7 + (y - 40) * 1.2;
      p.rect(30 - w, y, w * 2, 1, 0x8a1a2a); p.set(30 - w, y, 0xe8b030); p.set(29 + w, y, 0xe8b030);
    }
  },
  // Colosseum: noon over the great arena, banners on the rim, the crowd on its feet.
  (p) => {
    p.sky([0x3a92e0, 0x6ab8f0, 0xaad4f2]);
    const bend = (x: number) => 4 * (1 - ((x - 30) / 30) ** 2);
    p.ridge((x) => 11 + bend(x), 0xd8b888, 0xf4dcae);
    for (let x = 0; x < BW; x++) {
      const b = bend(x);
      for (const [r0, h] of [[14, 5], [21, 5]] as const)
        if (x % 5 > 1) for (let y = 0; y < h; y++) if (y > 0 || x % 5 === 3) p.set(x, r0 + b + y, y === 0 ? 0x8a6a4a : 0x5a3e30);
      p.set(x, 13 + b, 0xb8946a); p.set(x, 20 + b, 0xb8946a);
      for (let y = 27; y < 33; y++) {
        const yy = y + b * 0.5;
        if ((x + y) % 2 === 0) p.set(x, yy, [0xc83a3a, 0x3a6ad8, 0xf0d070, 0xf4f0e8, 0x2aa878, 0x8a5a3a][Math.floor(hash(x, y, 9) * 6)]);
        else p.set(x, yy, 0x6a4a3a);
      }
    }
    for (let x = 4; x < BW; x += 9) {
      const y = 11 + bend(x);
      p.line(x, y, x, y - 6, 0x4a3a30);
      const c = [0xc83a3a, 0x3a6ad8, 0xe8b030][(x / 9) % 3 | 0];
      p.rect(x + 1, y - 6, 3, 2, c); p.set(x + 4, y - 6, c);
    }
    p.rect(0, 33, BW, 5, 0xa88a68); p.rect(0, 33, BW, 1, 0xd8bc90); p.rect(0, 37, BW, 1, 0x6a5440);
    for (let x = 2; x < BW; x += 10) p.rect(x, 34, 3, 2, 0x8a2a2a);
    for (let y = 38; y < BH; y++) for (let x = 0; x < BW; x++) p.set(x, y, (y - 38) % 3 === 2 && hash(x >> 3, y, 1) < 0.5 ? 0xd4b47e : 0xe8cc98);
    p.scatter(12, 20, 0, 38, BW, 10, [0xf4e0b4, 0xc8a46e]);
  },
  // Autumn Hollow: a warm late afternoon, maples in flame colours and leaves on the breeze.
  (p) => {
    p.sky([0xfad890, 0xf4b06a, 0xe08858, 0xb06a50]);
    p.glow(12, 20, 12, 0xfff0c0, 0.45);
    p.disc(12, 20, 4, 0xfff4d0);
    p.ridge((x) => 28 + wave(x, [[2.5, 0.11, 2], [1, 0.4, 0]]), 0xb8704a, 0xd8905c);
    p.ridge((x) => 34 + wave(x, [[2, 0.16, 4]]), 0x9a5236, 0xc0703e);
    const tree = (x: number, base: number, r: number, c: number, sh: number, hi: number) => {
      p.rect(x, base - r * 1.2, 1, r * 1.2 + 1, 0x4a2a1a);
      p.cluster([[x - r * 0.6, base - r * 1.6, r * 0.75], [x + r * 0.6, base - r * 1.5, r * 0.7], [x, base - r * 2.2, r * 0.85]], c, sh, hi);
    };
    tree(22, 35, 4, 0xe8a030, 0xb86a1e, 0xffd060);
    tree(34, 36, 3.5, 0xd84a2a, 0x9a2a1a, 0xf07a4a);
    tree(29, 37, 3, 0xf0782a, 0xb84a1a, 0xffaa50);
    p.ridge((x) => 41 + wave(x, [[1.2, 0.2, 1], [0.6, 0.6, 2]]), 0x7a4220, 0xb8682a);
    p.scatter(21, 40, 0, 42, BW, 6, [0xe8782a, 0xc83a2a, 0xf0b030, 0x5a2a14]);
    // A big maple framing the right side.
    p.line(55, 47, 53, 22, 0x3a2014); p.line(56, 47, 54, 22, 0x3a2014); p.line(57, 47, 55, 24, 0x3a2014); p.line(54, 30, 47, 24, 0x3a2014);
    p.cluster([[57, 8, 7], [49, 12, 5.5], [59, 17, 5], [51, 4, 5], [44, 19, 4]], 0xd8482a, 0x9a2a1c, 0xf27a46);
    p.scatter(5, 22, 0, 0, BW, 40, [0xe8782a, 0xd84a2a, 0xf0b030]);
  },
  // Rainbow Falls: a jungle gorge, a tall waterfall into a turquoise pool and a rainbow in the spray.
  (p) => {
    p.sky([0x6ad0f8, 0xa8e4f8, 0xdaf4f0]);
    p.cluster([[44, 6, 3], [48, 5, 4], [52, 7, 2.5]], 0xffffff, 0xd0e8f4);
    // Gorge walls with jungle on top.
    const wall = (x: number) => (x < 22 ? 12 + x * 0.1 + wave(x, [[1.2, 0.7, 0]]) : x > 38 ? 13 + (59 - x) * 0.1 + wave(x, [[1.2, 0.6, 2]]) : 99);
    p.ridge(wall, 0x6a6a5a, 0x8a8a70);
    for (let x = 0; x < BW; x++) for (let y = 16; y < 40; y += 4) if (hash(x, y, 3) < 0.25 && wall(x) < y) p.set(x, y, 0x4a4a40);
    p.cluster([[2, 11, 4], [9, 10, 4], [16, 12, 4], [21, 13, 3], [39, 13, 3], [45, 12, 4], [52, 11, 4], [59, 12, 4]], 0x2a9a4a, 0x1a6a32, 0x5ac85a);
    // The falls: a ledge between the walls, the curtain, and the spray.
    p.rect(22, 15, 17, 2, 0x5a5a4a);
    for (let y = 17; y < 40; y++) for (let x = 23; x < 38; x++) p.set(x, y, hash(x, (y + x * 3) >> 2, 5) < 0.3 ? 0xa8d8f0 : hash(x, y, 6) < 0.1 ? 0x7ab8e0 : 0xe8f8ff);
    p.cluster([[23, 39, 3], [28, 38, 3.5], [33, 38, 3.5], [38, 39, 3]], 0xffffff, 0xd0ecf8);
    for (const [k, c] of [0xe84a4a, 0xf09a3a, 0xf0e050, 0x5ac85a, 0x4a8ae8, 0x9a5ad8].entries())
      for (let a = Math.PI * 1.08; a <= Math.PI * 1.92; a += 0.02) p.set(30 + Math.cos(a) * (15 - k), 40 + Math.sin(a) * (15 - k), c, 0.55);
    p.ridge((x) => 41 + wave(x, [[0.6, 0.5, 0]]), 0x2ab8c0, 0x8ae8f0);
    for (let y = 43; y < BH; y += 2) for (let x = 0; x < BW; x++) if (hash(x >> 2, y, 7) < 0.35) p.set(x, y, 0x6ad8e0);
    // Fronds in the corners.
    for (const [x0, dir] of [[0, 1], [59, -1]] as const)
      for (let i = 0; i < 4; i++) {
        const a = -0.2 - i * 0.35;
        for (let t = 0; t < 12; t++) p.set(x0 + dir * Math.cos(a) * t, 48 + Math.sin(a) * t + t * t * 0.03, i % 2 ? 0x1a6a3a : 0x2a8a4a);
      }
  },
];

const urls = new Map<number, string>();

/** The backdrop's RGBA pixels (BW x BH). */
export function paintBackdrop(i: number): Uint8ClampedArray<ArrayBuffer> {
  const p = new Paint();
  PAINTERS[i >= 0 && i < PAINTERS.length ? i : 0](p);
  return p.px;
}

/** The backdrop as a data URL, painted on first use. */
export function backdropURL(i: number): string {
  const k = i >= 0 && i < BACKDROPS.length ? i : 0;
  let u = urls.get(k);
  if (!u) {
    const c = document.createElement('canvas');
    c.width = BW; c.height = BH;
    c.getContext('2d')!.putImageData(new ImageData(paintBackdrop(k), BW, BH), 0, 0);
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
