import { Rng } from '../core/rng';
import { ARENA_HALF_WIDTH } from '../sim/constants';
import { unpackHex } from './pixel/color';
import { bayer, Pix } from './pixel/paint';
import { PPM } from './sprite/animator';
import type { ArenaArt, DayCycle, Layer, SkyKey, Theme } from './arenaArt';
import { haze, hash, noise, occlude, tone } from './scenery';

/**
 * Cherry Blossom Shrine: the duel happens in a stone-paved shrine courtyard
 * on a quiet hilltop. The usual parallax + perspective-floor scheme (see
 * arenaArt.ts) under the same live sky as Skygrove, in spring's own colours.
 * Two cherry trees in full bloom frame the sides; behind the middle of the
 * fight there is only a clipped hedge, a misty valley, a far snow peak and,
 * on a distant rise, one small torii. As night falls the paper lanterns in
 * the trees and the stone lanterns at the arena's ends light up one by one.
 *
 * Back to front: sky · soft clouds · snow peak and far ranges · hills and the
 * torii · valley mist · wooded shoulders · the courtyard's back edge (hedge,
 * cherry trees, lanterns) · flagstone floor · retaining wall and the hillside.
 */

const BLOSSOM = [0x8a4870, 0xbc6890, 0xe494b2, 0xf6bacd, 0xffdce7, 0xfff4f7];
const BARK = [0x23161e, 0x3c2830, 0x5a4048, 0x7e6266];
/** Grey-blue flagstone, deep joint to sunlit edge. */
const STONE = [0x2c343e, 0x45505c, 0x5f6b78, 0x7a8794, 0x97a3ae, 0xbac4ca];
/** Weathered granite for the stone lanterns. */
const TORO = [0x3a3f42, 0x565d5e, 0x747c78, 0x949c94, 0xb7bdb0];
const MOSS = [0x2c4630, 0x426439, 0x5e844a, 0x86a85e];
const HEDGE = [0x183026, 0x234430, 0x305c3a, 0x447648, 0x64945a];
const GRASS = [0x355e36, 0x477a40, 0x5f964c, 0x82b25e, 0xa4c870];
const FOREST = [0x1e3a36, 0x2a4e40, 0x3a644a, 0x528056];
const VERMILION = [0x6a1a1c, 0xa82c28, 0xd84a34, 0xf07450];
const AZALEA = [0xe8508a, 0xff8cb4, 0xfff0f4];
const INK = 0x24141e;
/** Warm glow of the paper lanterns and the stone lanterns' fire. */
const LAMP = 0xffb066;

/** `mix` without allocating (the painters call it per pixel). */
function blend(a: number, b: number, t: number): number {
  const r = (a >> 16) & 255, g = (a >> 8) & 255, l = a & 255;
  return (Math.round(r + (((b >> 16) & 255) - r) * t) << 16) | (Math.round(g + (((b >> 8) & 255) - g) * t) << 8) | Math.round(l + ((b & 255) - l) * t);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildShrine(theme: Theme, W: number, H: number, gy: number, travel: number, seed: number): ArenaArt {
  const rng = new Rng(seed + 911);
  const wallFactor = 0.78;
  const floorTop = gy - 22;
  const hy = gy - 22 / (1 - wallFactor);
  const D = gy - hy;
  const lipY = gy + 10;
  const sLip = (lipY + 0.5 - hy) / D;
  const vLip = D / sLip;
  const vTop = D / ((floorTop + 0.5 - hy) / D);
  const hz = gy - 46;
  const lw = (f: number) => Math.ceil(W + 2 * travel * f + 8);
  const horizon = SKY_KEYS[0].sky[3];
  // Screen x at camera 0 → x in a layer of width `w`.
  const at = (w: number, fx: number) => (w - W) / 2 + fx * W;

  const clouds = new Pix(lw(0.03), hz);
  paintClouds(clouds, rng, hz);

  const far = new Pix(lw(0.05), hz + 10);
  paintFar(far, rng, hz, at(far.w, 0.62), horizon);

  const hills = new Pix(lw(0.12), hz + 16);
  paintHills(hills, rng, hz, at(hills.w, 0.31), horizon);

  const mist = new Pix(lw(0.16), H);
  paintMist(mist, hz);

  // Far below the hill (only tall screens see it): ridges stepping down into the valley.
  const valleyY = gy + 60;
  const valley = new Pix(lw(0.2), Math.max(1, H - valleyY));
  paintValley(valley, rng, horizon);

  const shoulders = new Pix(lw(0.3), floorTop + 1);
  paintShoulders(shoulders, rng, hz, W, horizon);

  // The courtyard's back edge: hedge, and a cherry tree on each side, the left one smaller so the moon rises clear of it.
  const wall = new Pix(lw(wallFactor), floorTop + 1);
  const swayA = new Pix(wall.w, wall.h), swayB = new Pix(wall.w, wall.h);
  paintHedge(wall, swayA, swayB, rng, floorTop);
  const xs = Math.max(230, Math.min(380, W / 2 - 30));
  const Ht = Math.min(floorTop - 4, 232);
  const hangs: [number, number, number][] = [];
  for (const side of [-1, 1]) {
    const t = paintCherry(rng, -side, Ht, side < 0 ? 150 : 175, rng.int(0, 9999));
    const ox = Math.round(wall.w / 2 + side * xs - t.bx), oy = floorTop + 2 - t.pix.h;
    wall.blit(t.pix, ox, oy);
    for (const [x, y] of t.hangs) hangs.push([x + ox, y + oy, side]);
    paintRoots(wall, swayA, swayB, rng, ox + t.bx, floorTop);
  }
  occlude(wall, 7, 16, 0.4, 0x2a1834);

  // Paper lanterns hanging from the trees' lower boughs.
  const lit: Pix[] = [];
  const looks = [
    { big: true, white: false }, { big: true, white: true }, { big: false, white: false }, { big: false, white: true },
  ].map(({ big, white }) => {
    const [w, h] = big ? [9, 13] : [7, 10];
    lit.push(paintChochin(w, h, white, true));
    return { unlit: paintChochin(w, h, white, false), r: big ? 24 : 18 };
  });
  const lamps: DayCycle['lamps'] = [];
  const placed: number[] = [];
  for (let i = hangs.length - 1; i > 0; i--) { const j = rng.int(0, i); [hangs[i], hangs[j]] = [hangs[j], hangs[i]]; }
  const perSide = [0, 0];
  for (const [x, y0, side] of hangs) {
    // Hang from the crown's underside.
    let y = Math.round(y0);
    while (y < floorTop && wall.has(x, y)) y++;
    const s = side < 0 ? 0 : 1;
    if (perSide[s] >= 4 || y < floorTop - 150 || y > floorTop - 92 || placed.some((px) => Math.abs(px - x) < 22)) continue;
    const look = looks[(perSide[s] + s) % looks.length];
    const lp = look.unlit;
    const len = rng.int(4, 18);
    const cyL = Math.min(floorTop - 74 - (lp.h >> 1), y + len + (lp.h >> 1));
    for (let k = y; k < cyL - (lp.h >> 1); k++) wall.set(x, k, 0x2a2024);
    wall.blit(lp, x - (lp.w >> 1), cyL - (lp.h >> 1));
    // A short red tassel under it.
    wall.set(x, cyL + (lp.h >> 1) + 1, VERMILION[1]);
    wall.set(x, cyL + (lp.h >> 1) + 2, VERMILION[2]);
    lamps.push({ x: x - (wall.w - W) / 2, y: cyL, factor: wallFactor, r: look.r, sprite: looks.indexOf(look) });
    placed.push(x);
    perSide[s]++;
  }

  // Stone lanterns at the arena's ends; their windows light up too.
  const toro = paintToro();
  lit.push(toro.lit);
  for (const sd of [-1, 1]) {
    lamps.push({
      x: W / 2 + sd * (ARENA_HALF_WIDTH + 0.75) * PPM - toro.pix.w / 2 + toro.ox + (toro.lit.w >> 1),
      y: gy - toro.pix.h + 2 + toro.oy + (toro.lit.h >> 1), factor: 1, r: 26, sprite: lit.length - 1,
    });
  }
  // One by one at dusk, in no particular order, a stone lantern first.
  const order = lamps.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = rng.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
  const first = lamps.length - (rng.chance(0.5) ? 1 : 2);
  order.splice(order.indexOf(first), 1);
  order.unshift(first);
  order.forEach((li, k) => { lamps[li].on = 0.7 + k * (0.15 / Math.max(1, order.length - 1)); });

  const E = (ARENA_HALF_WIDTH + 2.6) * PPM;
  const floor = paintCourtyard(rng, Math.ceil(W / 0.65 + 2 * travel * 1.6 + 64), Math.ceil(D) * 2, D, vLip, vTop, E, xs / wallFactor);

  const lift = 5;
  const front = new Pix(lw(sLip), Math.max(1, H - lipY + lift));
  paintFront(front, rng, lift, horizon);

  const L = (pix: Pix, factor: number, y = 0, drift = 0): Layer => ({ pix, factor, y, drift });
  return {
    theme, gy, hy, floorTop, wallFactor,
    layers: [
      L(clouds, 0.03, 0, 1), L(far, 0.05), { ...L(hills, 0.12), after: 'birds' }, L(mist, 0.16, 0, 1.6), L(valley, 0.2, valleyY),
      L(shoulders, 0.3), L(wall, wallFactor),
    ],
    front: [L(front, sLip, lipY - lift)],
    floorEnd: lipY,
    crowd: [swayA, swayB], crowdLayer: L(swayA, wallFactor), floor, torches: [],
    pillar: toro.pix,
    crystal: null,
    bareTop: true,
    cycle: {
      hz, keys: SKY_KEYS, sunR: theme.body.r,
      stars: paintStars(rng, W, hz), rainbow: new Pix(1, 1), moon: paintMoon(),
      lamps, lampColor: LAMP, lit, fireflies: 5,
      // The moon rises from behind the torii's hill, clear of the trees.
      moonAt: [0.42, 0.3],
    },
    floaters: [],
    ambience: {
      petals: [],
      butterflies: [0xfff8f0, 0xfff0b0],
      sparkle: 0xfff2f6,
      bird: blend(0x3a3a5a, horizon, 0.3),
      fall: { colors: [BLOSSOM[4], BLOSSOM[3], BLOSSOM[5], BLOSSOM[3]], n: 84, front: 12 },
    },
    cosmos: null,
  };
}

/** Spring noon → golden hour → peach and pink sunset → dusk → deep indigo night. */
const SKY_KEYS: SkyKey[] = [
  { at: 0, sky: [0x4a86d6, 0x6ea4e4, 0xa4caee, 0xe4eef2], glow: 0xfff6dc, glowA: 0.5, band: 0xffe8e0, bandA: 0, tint: 0xffffff, tintA: 0 },
  { at: 0.36, sky: [0x4a84d2, 0x70a2e0, 0xaccaea, 0xf0ece8], glow: 0xfff0c8, glowA: 0.55, band: 0xffd8c8, bandA: 0.06, tint: 0xffe8d0, tintA: 0.04 },
  { at: 0.55, sky: [0x5272c0, 0x8c98d0, 0xe8bcc0, 0xffdcc4], glow: 0xffd8a0, glowA: 0.6, band: 0xffb898, bandA: 0.28, tint: 0xffc0a0, tintA: 0.12 },
  { at: 0.69, sky: [0x3c4290, 0x8a62a4, 0xf092a4, 0xffc4a0], glow: 0xffa070, glowA: 0.7, band: 0xff8a80, bandA: 0.5, tint: 0xff8a90, tintA: 0.22 },
  { at: 0.8, sky: [0x161a4c, 0x2e2c6c, 0x6a4a88, 0xc07896], glow: 0xe07080, glowA: 0.2, band: 0xc06088, bandA: 0.3, tint: 0x3a2c72, tintA: 0.4 },
  { at: 0.92, sky: [0x070a22, 0x0e1438, 0x1a2456, 0x2c3a72], glow: 0x8090c0, glowA: 0, band: 0x34407a, bandA: 0.12, tint: 0x0c1034, tintA: 0.5 },
];

// --- Shading helpers ---------------------------------------------------------------

interface Blob { x: number; y: number; rx: number; ry: number }

/** Clumps of leaves or blossom lit from the upper right, lower clumps first; `fluff` frays the edges. */
function clumps(p: Pix, blobs: Blob[], pal: number[], seed: number, fluff = 0.4): void {
  blobs.sort((a, b) => b.y - a.y);
  const n = pal.length;
  for (const b of blobs) {
    for (let y = Math.floor(b.y - b.ry); y <= b.y + b.ry; y++) for (let x = Math.floor(b.x - b.rx); x <= b.x + b.rx; x++) {
      const u = (x + 0.5 - b.x) / b.rx, v = (y + 0.5 - b.y) / b.ry;
      const d = u * u + v * v;
      if (d > 1 || (d > 0.72 && hash(x, y, seed) < fluff)) continue;
      const l = 0.58 - v * 0.38 + u * 0.2 - d * 0.12 + (bayer(x, y) - 0.5) * 0.2;
      let i = Math.max(0, Math.min(n - 1, Math.floor(l * n)));
      // Little 2×2 clusters of flowers or leaves catching the light, or sitting in shade.
      const r = hash(x >> 1, y >> 1, seed + 1);
      if (r < 0.13) i = Math.min(n - 1, i + 1);
      else if (r > 0.93) i = Math.max(0, i - 1);
      p.set(x, y, pal[i]);
    }
  }
}

/**
 * Cherry blossom: clumps lit from the upper right, lower clumps first, their
 * edges bitten into small lobes; inside, little five-pixel florets catch the
 * light and pockets of shade sit between them.
 */
function bloom(p: Pix, blobs: Blob[], seed: number, shade = 0): void {
  blobs.sort((a, b) => b.y - a.y);
  const n = BLOSSOM.length;
  for (const b of blobs) {
    for (let y = Math.floor(b.y - b.ry); y <= b.y + b.ry; y++) for (let x = Math.floor(b.x - b.rx); x <= b.x + b.rx; x++) {
      const u = (x + 0.5 - b.x) / b.rx, v = (y + 0.5 - b.y) / b.ry;
      const d = u * u + v * v;
      if (d > 1 || (d > 0.68 && hash(x >> 1, y >> 1, seed) < (d - 0.68) * 2.4)) continue;
      let l = 0.6 - shade - v * 0.46 + u * 0.24 - d * 0.16 + (bayer(x, y) - 0.5) * 0.14;
      // A floret in some 4×4 cells: centre and its four neighbours.
      const cx = x >> 2, cy = y >> 2;
      if (hash(cx, cy, seed + 1) < 0.55) {
        const fx = (cx << 2) + 1 + Math.floor(hash(cx, cy, seed + 2) * 2), fy = (cy << 2) + 1 + Math.floor(hash(cx, cy, seed + 3) * 2);
        const k = Math.abs(x - fx) + Math.abs(y - fy);
        if (k === 0) l += 0.26;
        else if (k === 1) l += 0.12;
      }
      // Shade pockets between the florets, deeper on the underside.
      const px = Math.floor(x / 5), py = Math.floor(y / 5);
      if (hash(px, py, seed + 4) < 0.2 + Math.max(0, v) * 0.2) {
        const qx = px * 5 + 2, qy = py * 5 + 2;
        if (Math.abs(x - qx) + Math.abs(y - qy) <= 1) l -= 0.24;
      }
      p.set(x, y, BLOSSOM[Math.max(0, Math.min(n - 1, Math.floor(l * n)))]);
    }
  }
}

/** Tileable value noise (wraps every `w` px along x). */
function tnoise(x: number, y: number, w: number, cx: number, cy: number, s: number): number {
  const f = x / w;
  return noise(x, y, cx, cy, s) * (1 - f) + noise(x - w, y, cx, cy, s) * f;
}

// --- Sky and distance ---------------------------------------------------------------

/** Stars for the night sky, thinning toward the horizon (transparent elsewhere). */
function paintStars(rng: Rng, W: number, hz: number): Pix {
  const p = new Pix(W, hz);
  for (let i = 0; i < W * hz * 0.003; i++) {
    const x = rng.int(0, W - 1), y = rng.int(0, hz - 1);
    const f = 1 - y / hz;
    if (rng.next() > f * 1.25) continue;
    const a = Math.round(70 + 185 * f * rng.next());
    p.set(x, y, rng.chance(0.22) ? 0xffeedc : 0xdde6ff, a);
    if (rng.chance(0.04)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + dx, y + dy, 0xaec2f4, a >> 1);
  }
  return p;
}

/** A big, pale full moon with soft grey seas and a darker limb. */
function paintMoon(): Pix {
  const r = 13, p = new Pix(r * 2 + 1, r * 2 + 1);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const u = (x - r) / r, v = (y - r) / r, d = u * u + v * v;
    if (d > 1) continue;
    let c = blend(0xfcfbf2, 0xd2d8ea, Math.max(0, (v - u) * 0.18 + d * 0.32));
    const m = noise(x, y, 7, 6, 61) * 0.7 + noise(x, y, 3, 3, 62) * 0.3;
    if (m > 0.56) c = blend(c, 0xb6bed6, Math.min(1, (m - 0.56) * 2.6) * 0.75);
    p.set(x, y, c, d > 0.86 ? 210 : 255);
  }
  return p;
}

/** A few soft, flat-bottomed clouds and thin streaks (tile horizontally, they drift). */
function paintClouds(p: Pix, rng: Rng, hz: number): void {
  const pal = [0xd6dcee, 0xe8ecf6, 0xf6f7fc, 0xffffff];
  const n = Math.max(2, Math.round(p.w / 230));
  for (let i = 0; i < n; i++) {
    const cx = (i + rng.range(0.1, 0.8)) * (p.w / n), base = rng.range(hz * 0.16, hz * 0.55);
    const w = rng.range(46, 100), k = rng.int(4, 7);
    for (let j = 0; j < k; j++) {
      const u = rng.range(-1, 1), r = (1 - Math.abs(u) * 0.6) * w * rng.range(0.13, 0.2);
      const cy = base - r * rng.range(0.15, 0.6), rx = r * 1.7, ry = r * 0.85;
      for (const ox of [-p.w, 0, p.w]) {
        const x0 = Math.max(0, Math.floor(cx + u * w * 0.55 + ox - rx)), x1 = Math.min(p.w - 1, Math.ceil(cx + u * w * 0.55 + ox + rx));
        for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(base, cy + ry); y++) for (let x = x0; x <= x1; x++) {
          const uu = (x + 0.5 - cx - u * w * 0.55 - ox) / rx, vv = (y + 0.5 - cy) / ry;
          if (uu * uu + vv * vv > 1) continue;
          p.set(x, y, tone(pal, 0.82 - vv * 0.42 + uu * 0.1 - (y > base - 2 ? 0.25 : 0), x, y, 0.1));
        }
      }
    }
  }
  for (let i = 0; i < n + 1; i++) {
    const y = Math.round(rng.range(hz * 0.1, hz * 0.6)), x0 = rng.range(0, p.w), len = rng.range(40, 120);
    for (let x = 2; x < len - 2; x++) p.set((Math.round(x0 + x) + p.w) % p.w, y, pal[3], 200);
    for (let x = len * 0.3; x < len * 0.75; x++) p.set((Math.round(x0 + x + 8) + p.w) % p.w, y + 1, pal[1], 170);
  }
}

/** The far ranges, pale with distance, and one gentle snow-capped peak (lit from the right). */
function paintFar(p: Pix, rng: Rng, hz: number, px: number, sky: number): void {
  const base = hz + 6;
  const amp = Math.min(30, hz * 0.12);
  const s = rng.int(0, 9999);
  const rangeA = blend(0x8b9ecb, sky, 0.5), rangeB = blend(0xa6b6dc, sky, 0.45);
  const top = (x: number) => base - 6 - noise(x, 0, 80, 0, s) * amp - noise(x, 0, 24, 0, s + 1) * amp * 0.3;
  for (let x = 0; x < p.w; x++) {
    const t = Math.round(top(x)), lit = top(x + 2) > top(x);
    for (let y = t; y < p.h; y++) p.set(x, y, blend(lit ? rangeB : rangeA, sky, smooth(t, base + 4, y) * 0.55));
  }
  // The peak: concave flanks and a small flat crater top, ridges and gullies
  // running down from the summit, snow reaching furthest down the gullies.
  const Hk = Math.min(100, hz * 0.46), hw = Hk * 2.5, apex = base - Hk;
  const rock = [0x60729f, 0x7286b4, 0x8a9ec8, 0x9eb2d6], snow = [0xbcc6e2, 0xd4dcf0, 0xeef2fc, 0xffffff];
  for (let x = Math.floor(px - hw); x <= px + hw; x++) {
    const u = (x + 0.5 - px) / hw, a = 1 - Math.abs(u);
    if (a <= 0) continue;
    const prof = Math.min(a ** 1.8, 0.9) / 0.9;
    const yt = Math.round(base - Hk * prof + (noise(x, 0, 6, 0, s + 2) - 0.5) * 1.2);
    for (let y = Math.max(0, yt); y < p.h; y++) {
      // Which ray down from the summit this pixel sits on.
      const ray = (x + 0.5 - px) / (y - apex + Hk * 0.12);
      const g = noise(ray * 26, 0, 1, 0, s + 3) * 0.8 + noise(ray * 60, 0, 1, 0, s + 4) * 0.2;
      const depth = (y - apex) / Hk;
      const snowTo = 0.3 + 0.08 * noise(ray * 12, 0, 1, 0, s + 5) + Math.max(0, g - 0.5) * 0.7;
      const lit = (u > 0.01 ? 0.62 : 0.2) + (0.5 - g) * 0.45;
      let c: number;
      if (depth < snowTo) c = snow[Math.max(0, Math.min(3, Math.floor(lit * 4 + 0.4)))];
      else c = rock[Math.max(0, Math.min(3, Math.floor(lit * 4)))];
      c = blend(c, sky, 0.16 + smooth(apex + Hk * 0.4, base + 2, y) * 0.66);
      p.set(x, y, c);
    }
  }
}

/** Rolling hills, a rise on the left with one small vermilion torii at its crest, and little trees along the ridges. */
function paintHills(p: Pix, rng: Rng, hz: number, tx: number, sky: number): void {
  const s = rng.int(0, 9999);
  const backC = blend(0x7c98b8, sky, 0.48), frontC = blend(0x62869e, sky, 0.36), frontLit = blend(0x7aa0aa, sky, 0.36);
  const kh = Math.min(42, hz * 0.2), kw = 64;
  const back = (x: number) => hz + 1 - 6 - noise(x, 0, 60, 0, s) * 12;
  // The rise: steeper on the left, a long tail to the right, its crest a little flat.
  const knoll = (x: number) => {
    const k = (x - tx) / (x < tx ? kw * 0.75 : kw * 1.3);
    return Math.abs(k) < 1 ? kh * Math.min(1, 1.12 * (1 - k * k) ** 2) * (0.92 + 0.08 * noise(x, 0, 9, 0, s + 2)) : 0;
  };
  const frontTop = (x: number) => hz + 9 - 3 - noise(x, 0, 44, 0, s + 1) * 9 - knoll(x);
  for (let x = 0; x < p.w; x++) {
    for (let y = Math.round(back(x)); y < p.h; y++) p.set(x, y, backC);
    const t = Math.round(frontTop(x)), lit = frontTop(x + 2) > frontTop(x) + 0.3;
    for (let y = t; y < p.h; y++) p.set(x, y, y - t < 2 && lit ? frontLit : frontC);
  }
  // Little trees along the near ridge, cherries clustering round the torii.
  const treeC = [blend(0x3e6070, sky, 0.38), blend(0x4c7276, sky, 0.36), blend(0x5e8478, sky, 0.36)];
  const pinkC = [blend(0xb87898, sky, 0.36), blend(0xe0a0bc, sky, 0.34), blend(0xf4c4d4, sky, 0.3)];
  for (let x = rng.range(0, 6); x < p.w; x += rng.range(4, 11)) {
    if (Math.abs(x - tx) < 15) continue;
    const near = Math.abs(x - tx) < kw * 0.85;
    if (!near && rng.chance(0.45)) continue;
    const r = rng.range(1.8, near ? 4 : 3.4);
    const pink = rng.chance(near ? 0.6 : 0.18);
    const y = frontTop(x) - r * 0.4;
    clumps(p, [{ x, y, rx: r * 1.1, ry: r }], pink ? pinkC : treeC, s + Math.round(x), 0.2);
  }
  // The torii, a touch hazed by distance.
  const tp = paintTorii();
  haze(tp, sky, 0.14);
  p.blit(tp, Math.round(tx - tp.w / 2), Math.round(frontTop(tx)) - tp.h + 1);
}

/** A small torii: black-capped top beam with upturned ends, vermilion posts and tie beam. */
function paintTorii(): Pix {
  const w = 21, h = 18, p = new Pix(w, h);
  const V = VERMILION, K = 0x2a1e24;
  // Kasagi: dark cap, its ends turned up.
  p.rect(1, 1, 19, 2, K);
  p.set(0, 0, K); p.set(1, 0, K); p.set(19, 0, K); p.set(20, 0, K);
  p.rect(3, 1, 15, 1, 0x40303a);
  // Shimaki under it, then the gakuzuka strut and the nuki tie beam.
  p.rect(2, 3, 17, 1, V[2]);
  p.rect(2, 4, 17, 1, V[1]);
  p.rect(10, 5, 1, 2, V[2]);
  p.rect(1, 7, 19, 1, V[2]);
  p.rect(1, 8, 19, 1, V[1]);
  // Posts, lit on the right, with black feet.
  for (const x0 of [4, 15]) {
    p.rect(x0, 5, 2, h - 6, V[2]);
    p.rect(x0 + 1, 5, 1, h - 6, V[3]);
    p.rect(x0, 9, 1, h - 10, V[1]);
    p.rect(x0, h - 1, 2, 1, K);
  }
  return p;
}

/** Valley mist from just above the horizon down to the bottom: soft, translucent, wisps along its top (tiles, it drifts). */
function paintMist(p: Pix, hz: number): void {
  const y0 = hz - 34;
  for (let y = Math.max(0, y0); y < p.h; y++) {
    const base = smooth(y0, hz + 16, y);
    if (y >= hz + 16) {
      // Below the wisps the mist is even.
      p.rect(0, y, p.w, 1, 0xedf1f8);
      p.data.fill(((p.data[y * p.w] & 0xffffff) | (Math.round(Math.min(0.9, base * 0.9) * 255) << 24)) >>> 0, y * p.w, (y + 1) * p.w);
      continue;
    }
    for (let x = 0; x < p.w; x++) {
      const n = tnoise(x, y, p.w, 70, 9, 2101) * 0.65 + tnoise(x, y, p.w, 23, 5, 2102) * 0.35;
      const a = Math.min(0.9, base * (0.35 + n * 0.95) * 0.9);
      if (a < 0.02) continue;
      p.set(x, y, blend(0xe2e9f4, 0xf8f9fc, n), Math.round(a * 255));
    }
  }
}

/** Wooded ridges one behind another, each fading into the mist at its foot, clearer as they come nearer. */
function paintValley(p: Pix, rng: Rng, sky: number): void {
  const s = rng.int(0, 9999);
  const mistC = 0xedf1f8;
  const pink = [0xc88aa8, 0xe8acc2, 0xf6cad8];
  // Nearer ridges sit lower and further apart.
  for (let k = 0; 36 + k * 46 + k * k * 14 < p.h; k++) {
    const t0 = 36 + k * 46 + k * k * 14, fog = Math.max(0.25, 0.74 - k * 0.13), amp = 20 + k * 8;
    const pal = FOREST.map((c) => blend(blend(c, sky, 0.25), mistC, fog));
    const pk = pink.map((c) => blend(c, mistC, fog * 0.8));
    const top = (x: number) => t0 - noise(x, 0, 50 + k * 20, 0, s + k) * amp - noise(x, 0, 14, 0, s + k + 9) * 7;
    for (let x = 0; x < p.w; x++) {
      for (let y = Math.max(0, Math.round(top(x))); y < p.h; y++) {
        const f = smooth(top(x) + 14 + k * 4, top(x) + 50 + k * 14, y);
        p.set(x, y, blend(pal[noise(x, y, 8, 5, s + 20) < 0.5 ? 1 : 2], mistC, f));
      }
    }
    // Treetops along the crest, now and then a cherry in bloom.
    for (let x = rng.range(0, 5); x < p.w; x += rng.range(4, 8)) {
      const r = rng.range(3, 6) * (1 + k * 0.15);
      clumps(p, [{ x, y: top(x) - r * 0.2, rx: r * 1.15, ry: r }], rng.chance(0.07) ? pk : pal, s + Math.round(x), 0.3);
    }
  }
}

/** Wooded shoulders of the hill rising toward both sides, low in the middle so the view stays open. */
function paintShoulders(p: Pix, rng: Rng, hz: number, W: number, sky: number): void {
  const s = rng.int(0, 9999);
  const cx = p.w / 2;
  const top = (x: number) => hz + 22 - 56 * smooth(0.3, 1.2, Math.abs(x + 0.5 - cx) / (W / 2)) - noise(x, 0, 40, 0, s) * 8;
  for (let x = 0; x < p.w; x++) {
    for (let y = Math.round(top(x)) + 3; y < p.h; y++) p.set(x, y, FOREST[noise(x, y, 9, 6, s + 1) < 0.45 ? 0 : 1]);
  }
  const pink = [0x9a5a7c, 0xc87c9c, 0xe8a4bc, 0xf8c8d6];
  const fir = [FOREST[0], FOREST[1], FOREST[2]];
  const trees: { x: number; y: number; kind: number }[] = [];
  for (let x = rng.range(0, 6); x < p.w; x += rng.range(5, 10)) trees.push({ x, y: top(x), kind: rng.chance(0.22) ? 2 : rng.chance(0.3) ? 1 : 0 });
  trees.sort((a, b) => a.y - b.y);
  for (const t of trees) {
    if (t.kind === 2) {
      // A dark cedar spire, in jagged tiers.
      const h = rng.range(13, 22), hw = rng.range(3.5, 5);
      for (let y = Math.floor(t.y - h); y <= t.y + 2; y++) {
        const k = (y - (t.y - h)) / h;
        const half = hw * k * (0.75 + 0.25 * ((y & 3) / 3));
        for (let x = Math.round(t.x - half); x <= t.x + half; x++) p.set(x, y, fir[x > t.x + half * 0.3 ? 2 : k > 0.7 ? 0 : 1]);
      }
      continue;
    }
    const r = rng.range(5, 9);
    clumps(p, [{ x: t.x, y: t.y - r * 0.3, rx: r * 1.15, ry: r }, { x: t.x + r * 0.5, y: t.y - r * 0.8, rx: r * 0.7, ry: r * 0.6 }],
      t.kind === 1 ? pink : FOREST, s + Math.round(t.x), 0.3);
  }
  occlude(p, 5, 8, 0.35, 0x0e1e22);
  haze(p, sky, 0.3);
}

// --- The courtyard's back edge -------------------------------------------------------

/** A dressed-stone kerb along the courtyard's back edge with a clipped hedge behind it, azaleas here and there. */
function paintHedge(p: Pix, sa: Pix, sb: Pix, rng: Rng, floorTop: number): void {
  const by = floorTop - 4;
  const band = new Pix(p.w, 26);
  const oy = by - band.h + 1;
  const blobs: Blob[] = [];
  for (let x = rng.range(-12, 0); x < p.w + 12; x += rng.range(13, 21)) blobs.push({ x, y: band.h - 1 - rng.range(7, 10), rx: rng.range(10, 15), ry: rng.range(7, 10) });
  band.rect(0, band.h - 8, band.w, 8, HEDGE[1]);
  const bloom = blobs.filter(() => rng.chance(0.2));
  clumps(band, blobs, HEDGE, 1201, 0.25);
  for (const b of bloom) {
    const c = rng.pick(AZALEA.slice(0, 2));
    for (let i = 0; i < b.rx * 1.6; i++) {
      const x = Math.round(b.x + rng.range(-0.8, 0.8) * b.rx), y = Math.round(b.y + rng.range(-0.9, 0.2) * b.ry);
      if (!band.has(x, y)) continue;
      band.set(x, y, rng.chance(0.25) ? AZALEA[2] : c);
      if (rng.chance(0.5)) band.set(x + 1, y, c);
    }
  }
  band.outline(INK);
  // Fallen petals resting on top of the hedge.
  for (let x = 0; x < band.w; x++) {
    if (hash(x, 0, 1203) > 0.09) continue;
    let y = 0;
    while (y < band.h && !band.has(x, y)) y++;
    if (y < band.h - 6) band.set(x, y + 1, BLOSSOM[hash(x, 1, 1203) < 0.5 ? 4 : 3]);
  }
  p.blit(band, 0, oy);
  // The kerb: long dressed stones, lit along the top.
  for (let x0 = -rng.range(0, 20); x0 < p.w; ) {
    const bw = Math.round(rng.range(16, 30));
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(p.w, x0 + bw); x++) {
      const joint = x === Math.round(x0);
      for (let y = by; y <= floorTop; y++) {
        const k = y - by;
        let c = k === 0 ? STONE[4] : k === 4 ? STONE[1] : bayer(x, y) < 0.3 ? STONE[2] : STONE[3];
        if (joint) c = STONE[0];
        p.set(x, y, c);
      }
    }
    x0 += bw;
  }
  // Grass tufts at the kerb's foot, swaying (two frames).
  for (let x = rng.range(0, 8); x < p.w; x += rng.range(6, 16)) {
    if (!rng.chance(0.5)) continue;
    const n = rng.int(2, 4);
    for (let j = 0; j < n; j++) {
      const bx = Math.round(x + j * 1.5), hgt = rng.int(3, 6);
      for (const [buf, lean] of [[sa, rng.range(-0.3, 0.3)], [sb, rng.range(0.8, 1.5)]] as const) {
        for (let k = 0; k < hgt; k++) buf.set(Math.round(bx + lean * (k / hgt) ** 2), floorTop - k, k === hgt - 1 ? GRASS[4] : GRASS[2 + (k & 1)]);
      }
    }
  }
}

/**
 * A cherry tree in full bloom: a dark, gnarled trunk leaning toward the
 * middle, boughs spreading wide, and a cloud of blossom reaching `reach` px
 * inward. `dir` is the inward direction. Returns the trunk's base x and the
 * underside of the inner crown, where lanterns can hang.
 */
function paintCherry(rng: Rng, dir: number, Ht: number, reach: number, seed: number): { pix: Pix; bx: number; hangs: [number, number][] } {
  const w = reach + 170, h = Ht + 2;
  const p = new Pix(w, h);
  const bx = dir > 0 ? 120 : w - 120, by = h - 2;
  // Branch discs: x, y, radius.
  const discs: number[] = [];
  const blobs: Blob[] = [];
  // The crown's body round each fork, under the clumps.
  const mass: Blob[] = [];
  const clump = (x: number, y: number, k: number) => {
    for (let i = rng.int(3, 5); i > 0; i--) {
      const rx = rng.range(12, 18) * k;
      blobs.push({ x: x + rng.range(-11, 11) * k, y: y + rng.range(-9, 3) * k, rx, ry: rx * rng.range(0.66, 0.82) });
    }
  };
  const limb = (x: number, y: number, ang: number, len: number, r: number, depth: number): void => {
    const n = Math.max(2, Math.round(len / 2));
    const bend = rng.range(-0.025, 0.025);
    for (let i = 0; i < n; i++) {
      ang += bend + rng.range(-0.07, 0.07);
      // Outer boughs spread out level, as cherries do.
      if (depth >= 1) ang += (Math.sign(ang) * 1.45 - ang) * 0.01 * depth;
      x += Math.sin(ang) * 2;
      y -= Math.cos(ang) * 2;
      discs.push(x, y, Math.max(0.6, r * (1 - (i / n) * 0.35)));
      if (depth >= 1 && i % 4 === 2 && rng.chance(depth >= 2 ? 0.7 : 0.3)) clump(x, y, 0.8);
    }
    if (depth >= 3 || r < 1) { clump(x, y, 1); return; }
    if (depth >= 1) { const rx = rng.range(20, 27); mass.push({ x, y: y - 4, rx, ry: rx * 0.72 }); }
    const kids = depth === 0 ? 0 : 2;
    for (let k = 0; k < kids; k++) {
      const spread = rng.range(0.3, 0.62) * (k === 0 ? -1 : 1);
      limb(x, y, ang + spread, len * rng.range(0.5, 0.66), r * 0.62, depth + 1);
    }
  };
  const trunkLen = Ht * 0.3;
  // The trunk, with a slight S-curve.
  let x = bx, y = by, ang = dir * 0.12;
  const n = Math.round(trunkLen / 2);
  for (let i = 0; i < n; i++) {
    ang += Math.sin(i * 0.25) * 0.03 * dir + rng.range(-0.04, 0.04);
    x += Math.sin(ang) * 2;
    y -= Math.cos(ang) * 2;
    discs.push(x, y, 6.2 - (i / n) * 1.2);
  }
  // Root flare.
  for (let i = 0; i < 9; i++) discs.push(bx + rng.range(-1, 1), by - i, 6.5 + (9 - i) * 0.55);
  for (const s of [-1, 1]) for (let i = 0; i < 12; i++) discs.push(bx + s * (5 + i), by - 1 + i * 0.12, Math.max(0.8, 2.6 - i * 0.18));
  // Main boughs: a long one reaching inward, one rising, one leaning out.
  limb(x, y, dir * 0.95, reach * 0.5, 4.4, 1);
  limb(x, y, dir * 0.3, Ht * 0.3, 4, 1);
  limb(x, y, -dir * 0.5, Ht * 0.24, 3.4, 1);
  for (let i = 0; i < discs.length; i += 3) {
    const dx = discs[i], dy = discs[i + 1], r = discs[i + 2];
    for (let yy = Math.floor(dy - r); yy <= dy + r; yy++) for (let xx = Math.floor(dx - r); xx <= dx + r; xx++) {
      const u = (xx + 0.5 - dx) / r, v = (yy + 0.5 - dy) / r;
      if (u * u + v * v > 1) continue;
      const l = u * 0.6 - v * 0.8;
      let c = l > 0.45 ? BARK[3] : l > -0.1 ? BARK[2] : l > -0.6 ? BARK[1] : BARK[0];
      // Cherry bark's horizontal lenticels.
      if (r > 2.4 && yy % 4 === 0 && l > -0.4 && hash(xx >> 1, yy, seed) < 0.4) c = BARK[3];
      p.set(xx, yy, c);
    }
  }
  // Keep the crown off the very top so it never looks cut, and the inner
  // crown up out of the fighters' way.
  for (const b of [...blobs, ...mass]) {
    if ((b.x - bx) * dir > 40) b.y = Math.min(b.y, h - 92 - b.ry * 0.3);
    b.y = Math.max(b.y, b.ry + 3);
  }
  const hangs: [number, number][] = [];
  for (const b of blobs) {
    const k = (b.x - bx) * dir;
    if (k > 26 && k < reach - 10) hangs.push([Math.round(b.x + rng.range(-0.4, 0.4) * b.rx), Math.round(b.y)]);
  }
  bloom(p, mass, seed, 0.14);
  bloom(p, blobs, seed);
  p.outline(INK);
  // Loose flowers just off the crown's edge.
  for (const b of blobs) for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(1.05, 1.3);
    const fx = Math.round(b.x + Math.cos(a) * b.rx * d), fy = Math.round(b.y + Math.sin(a) * b.ry * d);
    if (!p.has(fx, fy)) p.set(fx, fy, BLOSSOM[rng.chance(0.5) ? 4 : 3]);
  }
  return { pix: p, bx, hangs };
}

/** Grass and fallen petals round a trunk's foot, the grass swaying (two frames). */
function paintRoots(p: Pix, sa: Pix, sb: Pix, rng: Rng, x: number, floorTop: number): void {
  for (let i = 0; i < 26; i++) {
    const bx = Math.round(x + rng.range(-22, 22)), hgt = rng.int(2, 6);
    for (const [buf, lean] of [[sa, rng.range(-0.4, 0.3)], [sb, rng.range(0.7, 1.6)]] as const) {
      for (let k = 0; k < hgt; k++) buf.set(Math.round(bx + lean * (k / hgt) ** 2), floorTop - k, k === hgt - 1 ? GRASS[4] : GRASS[1 + (k & 1)]);
    }
  }
  for (let i = 0; i < 18; i++) p.set(Math.round(x + rng.range(-16, 16)), floorTop - rng.int(0, 2), BLOSSOM[rng.chance(0.5) ? 4 : 3]);
}

/** A paper lantern (chōchin), red or white paper between dark caps, unlit or glowing. */
function paintChochin(bw: number, bh: number, white: boolean, lit: boolean): Pix {
  const p = new Pix(bw + 2, bh + 2);
  const pal = lit
    ? white ? [0xd88a40, 0xf0b060, 0xffd890, 0xfff0c8, 0xfffcf0] : [0xb83a22, 0xe8602e, 0xff9048, 0xffc274, 0xffecb8]
    : white ? [0x8a8078, 0xbcb2a4, 0xddd4c4, 0xf2ece0, 0xfffaf2] : [0x5a1418, 0x9a2a2a, 0xc83c34, 0xe8644a, 0xf89a74];
  const cap = lit ? 0x3e2018 : 0x2a2024, capLit = lit ? 0x8a4824 : 0x4a3a3e;
  const cx = (bw - 1) / 2 + 1, b0 = 3, b1 = bh - 2, yc = (b0 + b1) / 2, ry = (b1 - b0) / 2 + 0.9;
  for (let y = b0; y <= b1; y++) {
    const v = (y - yc) / ry;
    const half = (bw / 2) * Math.sqrt(Math.max(0, 1 - v * v * 0.55));
    for (let x = Math.round(cx - half + 0.3); x <= Math.round(cx + half - 0.3); x++) {
      const u = (x - cx) / (bw / 2);
      let l = lit ? 0.98 - Math.hypot(u * 0.9, v * 0.75) * 0.75 + u * 0.08 : 0.42 + u * 0.32 - v * 0.12;
      if ((y - b0) % 2 === 1) l -= 0.13;
      if (Math.abs(u) > 0.82) l -= 0.15;
      p.set(x, y, pal[Math.max(0, Math.min(4, Math.floor(l * 5)))]);
    }
  }
  // A brushed mark down the middle of the big ones.
  if (bh >= 12) for (let y = Math.round(yc) - 1; y <= Math.round(yc) + 2; y++) p.set(Math.round(cx), y, lit ? pal[1] : white ? 0x3a3034 : pal[0]);
  for (const [y, inset] of [[1, 1.5], [2, 0.5], [bh - 1, 0.5], [bh, 1.5]] as const) {
    for (let x = Math.round(1 + inset); x <= Math.round(bw - inset); x++) p.set(x, y, x >= bw - inset - 1 ? capLit : cap);
  }
  p.outline(lit ? 0x4a2014 : INK);
  return p;
}

// --- Stone lanterns --------------------------------------------------------------------

/**
 * A kasuga-style stone lantern (ishidōrō) marking each end of the arena:
 * jewel, curled roof, fire box with an open window, platform, post and
 * base, mossy and dusted with petals. `lit` is the fire box glowing, a crop
 * placed at (`ox`, `oy`).
 */
function paintToro(): { pix: Pix; lit: Pix; ox: number; oy: number } {
  const w = 30, h = 88, p = new Pix(w, h);
  const span = (y: number, hw: number, bias = 0) => {
    const x0 = 15 - hw, x1 = 14 + hw;
    for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - x0) / (x1 + 1 - x0);
      p.set(x, y, tone(TORO, 0.2 + u * 0.62 + bias, x, y, 0.16));
    }
  };
  // Hōju (the jewel) and its neck.
  [1, 2, 3, 3, 3, 2, 1, 2].forEach((hw, i) => span(i, hw, i < 3 ? 0.12 : 0));
  // Kasa (the roof): sloping top, curled-up corners, a deep eave and its shadowed underside.
  [4, 6, 8, 10, 12, 13].forEach((hw, i) => span(8 + i, hw, 0.15 - i * 0.02));
  span(14, 15, -0.05); span(15, 15, -0.12);
  for (const x of [0, 1, 28, 29]) p.set(x, 13, TORO[x > 14 ? 3 : 2]);
  p.set(0, 12, TORO[2]); p.set(29, 12, TORO[3]);
  span(16, 12, -0.45);
  // Hibukuro (the fire box) with its window.
  for (let y = 17; y <= 31; y++) span(y, 8, y < 19 ? -0.2 : 0);
  p.rect(12, 20, 6, 9, 0x1c181a);
  p.rect(12, 20, 6, 1, 0x100c0e);
  p.rect(11, 29, 8, 1, TORO[4]);
  for (let y = 18; y <= 31; y++) { p.set(8, y, TORO[1]); p.set(21, y, TORO[4]); }
  // Chūdai (the platform), carved with a ring of petals.
  span(32, 11, 0.2); span(33, 11, 0.05); span(34, 10); span(35, 10); span(36, 8, -0.1); span(37, 6, -0.15); span(38, 5, -0.2);
  for (let x = 6; x < 24; x += 3) { p.set(x, 34, TORO[1]); p.set(x, 35, TORO[1]); }
  // Sao (the post) with its ring.
  for (let y = 39; y <= 68; y++) span(y, 4);
  span(52, 5, 0.2); span(53, 5); span(54, 5, -0.15);
  // Kiso (the base): a flare, a hexagonal stone and a plinth sunk in the ground.
  span(69, 6, 0.1); span(70, 7, 0.05); span(71, 9, 0.1); span(72, 10, 0.3);
  for (let y = 73; y <= 79; y++) {
    span(y, 10, -0.05);
    for (let x = 20; x <= 24; x++) p.set(x, y, tone(TORO, 0.85, x, y, 0.1));
  }
  span(80, 12, 0.3);
  for (let y = 81; y < h; y++) span(y, 12, -0.08);
  // Moss on the roof and the base, petals resting on them.
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h && !p.has(x, y)) y++;
    if (y >= 8 && y <= 13 && hash(x, 0, 1301) < 0.75) p.set(x, y, x < 15 ? MOSS[2] : MOSS[3]);
    if (y >= 8 && y <= 13 && hash(x, 1, 1301) < 0.4) p.set(x, y + 1, MOSS[1]);
  }
  for (let x = 5; x <= 24; x++) if (hash(x, 2, 1301) < 0.35) p.set(x, 72, MOSS[2 + (x & 1)]);
  for (let x = 3; x <= 26; x++) if (hash(x, 3, 1301) < 0.3) p.set(x, 80, MOSS[2]);
  for (let y = 60; y < 69; y++) if (hash(0, y, 1302) < 0.5) p.set(11 + (y & 1), y, MOSS[1]);
  for (const [x, y] of [[4, 13], [9, 11], [22, 12], [26, 14], [13, 72], [19, 72], [7, 80], [23, 80], [16, 80]]) p.set(x, y, BLOSSOM[4]);
  p.set(20, 13, BLOSSOM[3]); p.set(10, 80, BLOSSOM[3]);
  p.outline(INK);
  // The lit look: firelight in the window, warming the stone around it and the eave above.
  const ox = 5, oy = 15, lit = new Pix(20, 18);
  for (let y = 0; y < lit.h; y++) for (let x = 0; x < lit.w; x++) {
    const c = p.get(x + ox, y + oy);
    if (!(c >>> 24)) continue;
    const X = x + ox, Y = y + oy;
    let col = unpackHex(c);
    if (X >= 12 && X <= 17 && Y >= 21 && Y <= 28) {
      const d = Math.hypot((X - 14.5) / 1.3, Y - 25.5);
      col = d < 1.6 ? 0xfff6d4 : d < 3 ? 0xffd88c : 0xffa850;
    } else if (X >= 12 && X <= 17 && Y === 20) col = 0x8a4a22;
    else {
      const d = Math.hypot(X - 14.5, (Y - 24.5) * 1.2);
      if (col !== INK && d < 9) col = blend(col, 0xffa860, 0.45 * (1 - d / 9));
    }
    lit.set(x, y, col);
  }
  return { pix: p, lit, ox, oy };
}

// --- Floor and the hill's edge ---------------------------------------------------------

/**
 * The courtyard: grey-blue flagstones in running courses, mossy joints,
 * cracks and lichen, fallen petals drifting into the joints and against the
 * back edge; grass past the paving at the sides. u = world px (centre at
 * w/2), v = depth row (ground depth ≈ v × 2.6 px).
 */
function paintCourtyard(rng: Rng, w: number, h: number, D: number, vLip: number, vTop: number, E: number, treeU: number): Pix {
  const p = new Pix(w, h);
  const cx = w / 2;
  const ZS = 2.6;
  const v0 = Math.max(0, Math.floor(vLip) - 2), v1 = Math.min(h - 1, Math.ceil(vTop) + 3);
  const rows: { z0: number; z1: number; cuts: number[] }[] = [];
  for (let z = v0 * ZS - rng.range(4, 20); z < (v1 + 1) * ZS; ) {
    const d = rng.range(25, 34);
    const cuts: number[] = [];
    for (let u = -rng.range(2, 50); u < w + 60; u += rng.range(30, 56)) cuts.push(Math.round(u));
    rows.push({ z0: z, z1: z + d, cuts });
    z += d;
  }
  const kind = new Uint8Array(w * h); // 0 none, 1 slab, 2 joint, 3 edging, 4 grass
  for (let v = v0; v <= v1; v++) {
    const z = (v + 0.5) * ZS;
    let r = 0;
    while (r < rows.length - 1 && rows[r].z1 <= z) r++;
    const row = rows[r];
    const dz0 = z - row.z0, dz1 = row.z1 - z;
    const jointV = dz0 < ZS, farEdge = dz1 < ZS, nearFace = dz0 >= ZS && dz0 < ZS * 2;
    // Less traffic toward the back and the sides: more moss.
    const back = smooth(D * 1.05, vTop, v);
    let k = 0;
    for (let x = 0; x < w; x++) {
      while (k < row.cuts.length - 2 && row.cuts[k + 1] <= x) k++;
      const du = x + 0.5 - cx, ad = Math.abs(du);
      const side = smooth(E * 0.6, E, ad);
      const i = v * w + x;
      if (ad > E) {
        const n = noise(x, z, 14, 14, 2301) * 0.7 + noise(x, z, 4, 4, 2302) * 0.3 + (bayer(x, v) - 0.5) * 0.25;
        p.set(x, v, GRASS[n < 0.35 ? 0 : n < 0.55 ? 1 : n < 0.75 ? 2 : 3]);
        kind[i] = 4;
        continue;
      }
      if (ad > E - 5) {
        // Long edging stones where the paving meets the grass.
        const jz = ((z / 40) % 1) * 40 < ZS;
        p.set(x, v, jz ? STONE[1] : ad > E - 1.5 ? STONE[2] : bayer(x, v) < 0.25 ? STONE[3] : STONE[4]);
        kind[i] = 3;
        continue;
      }
      const c0 = row.cuts[k], c1 = row.cuts[k + 1];
      const jointU = x - c0 < 2;
      const mossy = noise(x, z, 18, 18, 2303) + side * 0.35 + back * 0.25;
      if (jointV || jointU) {
        p.set(x, v, mossy > 0.62 ? MOSS[bayer(x, v) < 0.4 ? 2 : 1] : mossy > 0.48 ? MOSS[0] : bayer(x, v) < 0.5 ? 0x283036 : 0x323c42);
        kind[i] = 2;
        continue;
      }
      kind[i] = 1;
      const s = hash(r, k, 2304);
      let base = blend(STONE[2], STONE[3], s * 0.85);
      const vt = hash(r, k, 2305);
      if (vt < 0.2) base = blend(base, 0x9a9488, 0.3);
      else if (vt < 0.34) base = blend(base, STONE[1], 0.28);
      // Worn a little smoother and paler along the fighters' line.
      const worn = (1 - smooth(5, 14, Math.abs(v - D))) * (1 - side);
      base = blend(base, STONE[3], worn * 0.18);
      const n = noise(x, z, 9, 7, 2306 + r) * 0.6 + noise(x, z, 3, 3, 2307) * 0.4 + (bayer(x, v) - 0.5) * 0.25 * (1 - worn * 0.6);
      let c = n < 0.33 ? blend(base, STONE[1], 0.32) : n > 0.7 ? blend(base, STONE[4], 0.28) : base;
      if (farEdge) c = blend(c, STONE[5], 0.42);
      else if (nearFace) c = blend(c, STONE[0], 0.3);
      if (c1 - x <= 1) c = blend(c, STONE[4], 0.3);
      else if (x - c0 === 2) c = blend(c, STONE[1], 0.3);
      // Moss creeping out of the joints, lichen spots.
      const nearJ = x - c0 < 4 || c1 - x < 3 || dz0 < ZS * 2 || dz1 < ZS * 1.5;
      if (nearJ && mossy > 0.7 && hash(x, v, 2308) < 0.75) c = MOSS[hash(x, v, 2309) < 0.5 ? 2 : 3];
      else if (hash(x >> 1, v, 2310 + r) < 0.006 + side * 0.01) c = 0xb4c09c;
      p.set(x, v, c);
    }
  }
  // Hairline cracks across a few slabs.
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let k = 0; k < row.cuts.length - 1; k++) {
      if (hash(r, k, 2311) > 0.14) continue;
      let x = row.cuts[k] + 4 + hash(r, k, 2312) * (row.cuts[k + 1] - row.cuts[k] - 8);
      let v = (row.z0 + 2 * ZS) / ZS + hash(r, k, 2313) * ((row.z1 - row.z0) / ZS - 4);
      const dir = hash(r, k, 2314) < 0.5 ? -1 : 1;
      for (let i = 0; i < 16; i++) {
        const xi = Math.round(x), vi = Math.round(v);
        if (vi < 0 || vi >= h || kind[vi * w + xi] !== 1) break;
        p.set(xi, vi, blend(unpackHex(p.get(xi, vi)), 0x262e36, 0.65));
        x += dir * (1 + hash(i, r, 2315));
        v += (hash(i, k, 2316) - 0.5) * 0.9;
      }
    }
  }
  // Fallen petals: sparse in the middle, drifting into joints, thick against the back edge and under the trees.
  const petals = [BLOSSOM[3], BLOSSOM[4], BLOSSOM[5], BLOSSOM[4]];
  for (let i = 0; i < w * (v1 - v0) * 0.05; i++) {
    const x = rng.int(0, w - 3), v = rng.int(v0, v1);
    const kd = kind[v * w + x];
    if (!kd) continue;
    const du = Math.abs(x + 0.5 - cx);
    const under = Math.exp(-(((du - treeU) / 70) ** 2)) * smooth(D, vTop, v);
    const dens = 0.05 + 0.25 * smooth(E * 0.5, E, du) + 0.4 * smooth(D * 1.12, vTop, v) + (kd === 2 ? 0.3 : 0) + (kd === 4 ? 0.2 : 0) + under * 0.6;
    if (rng.next() > dens * (0.55 + noise(x, v * ZS, 40, 40, 2317) * 0.9)) continue;
    const c = rng.pick(petals);
    p.set(x, v, c);
    if (rng.chance(0.6)) p.set(x + 1, v, c);
    if (rng.chance(0.15)) p.set(x + 2, v, BLOSSOM[2]);
  }
  // Ambient occlusion where the paving runs in under the hedge.
  const back = (D * D) / vTop;
  for (let v = Math.floor(D * 1.08); v <= v1; v++) {
    const k = 0.5 * Math.exp(-((D * D) / v - back) / 3);
    if (k < 0.04) continue;
    for (let x = 0; x < w; x++) {
      const c = p.get(x, v);
      if (!(c >>> 24)) continue;
      const kq = Math.floor(k * 4 + bayer(x, v)) / 4;
      if (kq > 0) p.set(x, v, blend(unpackHex(c), 0x1a2030, kq));
    }
  }
  return p;
}

/**
 * The hill's edge below the floor's front lip: the courtyard's kerb, a
 * dry-stone retaining wall of fitted stones (moss, ferns), azaleas at its
 * foot, then grass falling away and fading into the valley mist. Rows above
 * `top` hold grass blades along the edge.
 */
function paintFront(p: Pix, rng: Rng, top: number, mistC: number): void {
  const w = p.w, WH = 30;
  const y0 = top + 4, y1 = y0 + WH;
  // The kerb's face.
  for (let x0 = -rng.range(0, 30); x0 < w; ) {
    const bw = Math.round(rng.range(40, 76));
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(w, x0 + bw); x++) {
      for (let k = 0; k < 4; k++) {
        let c = k === 0 ? STONE[4] : k === 3 ? STONE[1] : bayer(x, k) < 0.3 ? STONE[2] : STONE[3];
        if (x === Math.round(x0)) c = STONE[0];
        p.set(x, top + k, c);
      }
    }
    x0 += bw;
  }
  // Fitted stones: a jittered grid of seeds, each pixel taking the nearest; near-ties are the gaps.
  const cw = 15, ch = 9;
  const nx = Math.ceil(w / cw) + 3, ny = Math.ceil(WH / ch) + 3;
  const sx = new Float32Array(nx * ny), sy = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    sx[j * nx + i] = (i - 1 + (j & 1) * 0.5 + rng.range(0.15, 0.85)) * cw;
    sy[j * nx + i] = (j - 1 + rng.range(0.2, 0.8)) * ch;
  }
  const id = new Int32Array(w * WH).fill(-1);
  const edge = new Float32Array(w * WH);
  for (let yy = 0; yy < WH; yy++) for (let x = 0; x < w; x++) {
    const ci = Math.floor(x / cw) + 1, cj = Math.floor(yy / ch) + 1;
    let d1 = 1e9, d2 = 1e9, best = -1;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 2; i <= ci + 1; i++) {
      if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const k = j * nx + i;
      const ex = (x + 0.5 - sx[k]) * 0.78, ey = yy + 0.5 - sy[k];
      const d = Math.sqrt(ex * ex + ey * ey);
      if (d < d1) { d2 = d1; d1 = d; best = k; } else if (d < d2) d2 = d;
    }
    edge[yy * w + x] = (d2 - d1) / 2;
    if (d2 - d1 >= 1.3) id[yy * w + x] = best;
  }
  const at = (x: number, yy: number) => (x < 0 || x >= w || yy < 0 || yy >= WH ? -2 : id[yy * w + x]);
  for (let yy = 0; yy < WH; yy++) for (let x = 0; x < w; x++) {
    const k = id[yy * w + x], y = y0 + yy;
    // Shade under the kerb's overhang, and toward the foot.
    const ao = Math.max(1 - yy / 6, 0) * 0.5 + smooth(WH * 0.6, WH, yy) * 0.3;
    let c: number;
    if (k < 0) {
      c = noise(x, yy, 16, 6, 2401) > 0.58 ? MOSS[bayer(x, y) < 0.5 ? 1 : 0] : 0x262c34;
    } else {
      let base = blend(STONE[2], STONE[3], hash(k, 0, 2402));
      if (hash(k, 1, 2402) < 0.25) base = blend(base, 0x928c80, 0.3);
      const bulge = Math.min(1, edge[yy * w + x] / 4);
      let l = 0.35 + bulge * 0.3 + (noise(x, yy, 5, 4, 2403) - 0.5) * 0.25 + (bayer(x, y) - 0.5) * 0.15;
      if (at(x, yy - 1) !== k) l += 0.32;
      else if (at(x, yy - 2) !== k) l += 0.1;
      if (at(x, yy + 1) !== k) l -= 0.25;
      if (at(x + 1, yy) !== k) l += 0.14;
      if (at(x - 1, yy) !== k) l -= 0.14;
      c = l < 0.3 ? blend(base, STONE[0], 0.45) : l < 0.5 ? blend(base, STONE[1], 0.3) : l < 0.75 ? base : blend(base, STONE[5], Math.min(0.6, (l - 0.75) * 1.2 + 0.2));
      // Moss on the stones' tops.
      if (at(x, yy - 1) !== k && noise(x, yy, 22, 8, 2404) > 0.55) c = MOSS[hash(x, y, 2405) < 0.5 ? 2 : 3];
    }
    if (ao > 0.05) c = blend(c, 0x141a24, Math.floor(ao * 4 + bayer(x, y)) / 4 * 0.6);
    // The wall faces the viewer, out of the sun: a step darker and softer than the paving.
    p.set(x, y, blend(c, 0x3a4250, 0.3));
  }
  // Ferns and grass sprouting from the gaps.
  for (let i = 0; i < w / 30; i++) {
    const x = rng.int(4, w - 5), yy = rng.int(6, WH - 8);
    if (id[yy * w + x] >= 0) continue;
    const len = rng.int(4, 7), s = rng.chance(0.5) ? 1 : -1;
    for (let k = 0; k < len; k++) {
      const fx = x + s * k, fy = y0 + yy - Math.round(Math.sin((k / len) * 2.4) * 2.5);
      p.set(fx, fy, MOSS[2]);
      if (k % 2 === 1 && k < len - 1) { p.set(fx, fy + 1, MOSS[1]); p.set(fx, fy - 1, MOSS[3]); }
    }
  }
  // Grass hanging over the kerb.
  for (let x = 0; x < w; x++) {
    if (hash(x, 3, 2406) > 0.22) continue;
    const len = 1 + Math.floor(hash(x, 4, 2406) * 4);
    for (let k = 0; k < len; k++) p.set(x, top + 1 + k, k === 0 ? GRASS[3] : GRASS[2]);
  }
  // Below the wall: the hillside falling away, in the wall's shadow, fading into the valley mist.
  const fade0 = y1 + 30, fade1 = fade0 + 120;
  const slope = [0x1c3428, 0x264430, 0x335638, 0x456c42];
  for (let y = y1; y < p.h; y++) {
    const f = smooth(fade0, fade1, y);
    if (f >= 1) break;
    for (let x = 0; x < w; x++) {
      const n = noise(x, y, 18, 6, 2407) * 0.6 + noise(x, y, 5, 3, 2410) * 0.25 + (bayer(x, y) - 0.5) * 0.25;
      let i = n < 0.36 ? 0 : n < 0.6 ? 1 : 2;
      // Blades catching the light in little upright strokes.
      if (hash(x, (y + (x & 3)) >> 2, 2411) < 0.12) i = Math.min(3, i + 1);
      let c = slope[i];
      if (y < y1 + 4) c = blend(c, 0x141c1c, 0.4);
      if (hash(x, y, 2412) < 0.006) c = BLOSSOM[3];
      c = blend(c, mistC, f * 0.85);
      p.set(x, y, c, Math.round(255 * (1 - f * f)));
    }
  }
  // Azaleas along the wall's foot, some in flower.
  const band = new Pix(w, 22);
  const blobs: Blob[] = [];
  for (let x = rng.range(-10, 4); x < w + 10; x += rng.range(9, 22)) {
    // Mounds of every size running together, a low one tucked in front now and then.
    const big = rng.chance(0.3);
    blobs.push({ x, y: 12 + rng.range(-2, 2) - (big ? 2 : 0), rx: rng.range(10, 16) * (big ? 1.3 : 1), ry: rng.range(6, 9) * (big ? 1.25 : 1) });
    if (rng.chance(0.3)) blobs.push({ x: x + rng.range(4, 9), y: 16, rx: rng.range(6, 9), ry: rng.range(4, 6) });
  }
  clumps(band, blobs, HEDGE, 2408, 0.3);
  for (const b of blobs) {
    if (!rng.chance(0.4)) continue;
    const c = rng.pick(AZALEA.slice(0, 2));
    for (let i = 0; i < b.rx * 2; i++) {
      const x = Math.round(b.x + rng.range(-0.8, 0.8) * b.rx), y = Math.round(b.y + rng.range(-0.9, 0.3) * b.ry);
      if (!band.has(x, y)) continue;
      band.set(x, y, rng.chance(0.2) ? AZALEA[2] : c);
      if (rng.chance(0.4)) band.set(x + 1, y, c);
    }
  }
  band.outline(INK);
  p.blit(band, 0, y1 - 8);
  // Grass blades standing along the lip.
  for (let x = 0; x < w; x++) {
    if (hash(x, 5, 2409) > 0.4) continue;
    const hgt = 1 + Math.floor(hash(x, 6, 2409) * (top - 1));
    for (let k = 1; k <= hgt; k++) p.set(x, top - k, k === hgt ? GRASS[4] : GRASS[3]);
    if (hgt > 2 && hash(x, 7, 2409) < 0.1) p.set(x, top - hgt - 1, BLOSSOM[4]);
  }
}
