import { Rng } from '../core/rng';
import { ARENA_HALF_WIDTH } from '../sim/constants';
import { mix, unpackHex } from './pixel/color';
import { bayer, Pix } from './pixel/paint';
import { PPM } from './sprite/animator';
import type { ArenaArt, DayCycle, Floater, Layer, SkyKey, Theme } from './arenaArt';
import { haze, hash, noise, occlude, tone } from './scenery';

/**
 * Skygrove Isle: the duel happens on a grassy island floating above a sea of
 * clouds. The usual parallax + perspective-floor scheme (see arenaArt.ts), but the
 * floor is cut to the island's outline (the sky shows past its ends) and the
 * island's rocky underside hangs below the front lip, roots and all.
 *
 * Back to front: sky and sun · high clouds · far peaks and isles · far cloud
 * sea · near isles with waterfalls · low clouds · the grove on the island's
 * back edge (trees, ruined arch, bushes, spectators) · meadow floor ·
 * underside.
 */

const SG = {
  leaves: [0x22492e, 0x32733c, 0x4b9444, 0x77bf54, 0xb0e078],
  bush: [0x1f4a30, 0x2f6f3e, 0x469048, 0x6cb650, 0xa4da72],
  blossom: [0x6e2f5a, 0xa84c74, 0xd87898, 0xf8acc2, 0xffe0ea],
  bark: [0x40302a, 0x664834, 0x8c6848],
  grass: [0x2f6c3a, 0x3f8a42, 0x58a84a, 0x80c858, 0xa6da6a],
  dirt: [0x977050, 0xbf9666, 0xd8b682],
  soil: [0x4f3426, 0x744e36],
  rock: [0x3a3246, 0x564a60, 0x76697a, 0x9a8e9c],
  stone: [0x5a6462, 0x828c86, 0xa8b0a4, 0xd0d6c6],
  water: [0x78bce6, 0xb2e2f6, 0xf2fcff],
  flowers: [0xff8cae, 0xffe07a, 0xfff8f0, 0xc09cff, 0xff9a5a],
  rune: [0x23707a, 0x45c0b8, 0x8ef0d6, 0xeafff8],
  /** Cloud tones, shadow to sunlit. */
  cloud: [0x8aa6cc, 0xb4cae4, 0xdae8f6, 0xffffff],
  ink: 0x1b2a2a,
};

export function buildIsle(theme: Theme, W: number, H: number, gy: number, travel: number, seed: number): ArenaArt {
  const rng = new Rng(seed);
  const wallFactor = 0.78;
  const floorTop = gy - 22;
  const hy = gy - 22 / (1 - wallFactor);
  const D = gy - hy;
  // The floor stops at the island's front lip; the underside layer takes over below.
  const lipY = gy + 10;
  const sLip = (lipY + 0.5 - hy) / D;
  const vLip = D / sLip;
  const vTop = D / ((floorTop + 0.5 - hy) / D);
  // Island outline seen from above: a rounded blob a little wider than the arena,
  // each side wobbling on its own so it never reads as a slab.
  const E = (ARENA_HALF_WIDTH + 2.6) * PPM;
  const vc = (vLip + vTop) / 2 - 4, rv = (vTop - vLip) / 2 + 12;
  const edgeAt: Outline = (v, side) => {
    const k = Math.abs(v - vc) / rv;
    if (k >= 1) return 0;
    const s = side > 0 ? 71 : 73;
    return E * Math.pow(1 - k ** 2.4, 1 / 2.4) + (noise(v * 2.6, 0, 20, 0, s) - 0.5) * 30 + (noise(v * 2.6, 0, 5, 0, s + 1) - 0.5) * 6;
  };
  // The front lip wanders a few rows up and down, and curls back at the corners.
  const lipEnd = [edgeAt(vLip, -1), edgeAt(vLip, 1)];
  const lipAt = (u: number) => {
    const corner = Math.max(0, 1 - (lipEnd[u < 0 ? 0 : 1] - Math.abs(u)) / 24);
    return vLip + 0.5 + noise(u, 0, 16, 0, 81) * 4 + noise(u, 0, 5, 0, 82) * 1.5 + corner * corner * 12;
  };
  const hz = gy - 46;
  const lw = (f: number) => Math.ceil(W + 2 * travel * f + 8);
  const horizon = theme.sky[theme.sky.length - 1];

  const high = new Pix(lw(0.05), hz);
  paintHighClouds(high, rng, hz);

  const far = new Pix(lw(0.1), hz + 8);
  paintRidge(far, rng, hz + 6, 34, mix(theme.mountFar, horizon, 0.35), mix(theme.mountFar, 0xffffff, 0.3), theme.snow);
  for (let x = rng.range(0, 60); x < far.w; x += rng.range(90, 150)) {
    const w = rng.range(18, 40);
    paintIsland(far, rng, x, rng.range(Math.max(14, hz - 150), hz - 44), w, 0.6, horizon, hz + 4, rng.chance(0.45));
  }

  const farSea = new Pix(lw(0.16), H);
  paintCloudSea(farSea, rng, hz - 3, Math.min(H, floorTop + 14), 3, 0.5);

  const mid = new Pix(lw(0.27), hz + 12);
  for (let x = rng.range(10, 80); x < mid.w; x += rng.range(170, 250)) {
    const w = rng.range(54, 96);
    paintIsland(mid, rng, x, rng.range(Math.max(18, hz - 196), hz - 96), w, 0.3, horizon, hz + 6, rng.chance(0.75));
  }
  occlude(mid, 5, 10, 0.3, mix(0x1a2440, horizon, 0.45));

  const nearSea = new Pix(lw(0.42), H);
  paintCloudSea(nearSea, rng, floorTop - 4, H + 24, 9, 0.22);

  const grove = new Pix(lw(wallFactor), floorTop + 1);
  const swayA = new Pix(grove.w, grove.h), swayB = new Pix(grove.w, grove.h);
  const lanterns = paintGrove(grove, swayA, swayB, rng, floorTop, edgeAt(vTop, -1) * wallFactor, edgeAt(vTop, 1) * wallFactor, theme.sky[3]);
  occlude(grove, 7, 16, 0.42, 0x142236);

  const floor = paintMeadow(rng, Math.ceil(W / 0.65 + 2 * travel * 1.6 + 64), Math.ceil(D) * 2, D, vTop, edgeAt, lipAt);

  // The underside layer starts a few rows above the lip for grass blades along the edge.
  const lift = 7;
  const under = new Pix(lw(sLip), Math.max(1, H - lipY + lift));
  const veins = paintUnderside(under, rng, edgeAt(vLip, -1) * sLip, edgeAt(vLip, 1) * sLip, lift);

  // Things that glow once night falls: lanterns, crystal veins, the crystals over the standing stones.
  const lamps: DayCycle['lamps'] = [
    ...lanterns.map(([x, y]) => ({ x: x - (grove.w - W) / 2, y, factor: wallFactor, r: 14 })),
    ...veins.map(([x, y]) => ({ x: x - (under.w - W) / 2, y: y + lipY - lift, factor: sLip, r: 12 })),
    ...[-1, 1].map((sd) => ({ x: W / 2 + sd * (ARENA_HALF_WIDTH + 0.75) * PPM, y: gy - 112 - 10, factor: 1, r: 22 })),
  ];

  // Rocks drifting around the island: a few behind its back corners, a few below the lip.
  const floaters: Floater[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      floaters.push({
        pix: paintChunk(rng, rng.range(10, 22), horizon, 0.2), factor: 0.6, front: false, phase: rng.range(0, 6),
        x: W / 2 + side * (edgeAt(vTop, side) * 0.6 + rng.range(30, 90) + i * 80), y: rng.range(hz - 40, floorTop + 6),
      });
      floaters.push({
        pix: paintChunk(rng, rng.range(8, 16), horizon, 0), factor: sLip, front: true, phase: rng.range(0, 6),
        x: W / 2 + side * (lipEnd[side > 0 ? 1 : 0] * sLip + rng.range(24, 70) + i * 90), y: lipY + rng.range(-4, 50) + i * 20,
      });
    }
  }

  const L = (pix: Pix, factor: number, y = 0, drift = 0): Layer => ({ pix, factor, y, drift });
  return {
    theme, gy, hy, floorTop, wallFactor,
    layers: [
      L(high, 0.05, 0, 1.2), L(far, 0.1), L(farSea, 0.16, 0, 2),
      { ...L(mid, 0.27), after: 'birds' }, { ...L(nearSea, 0.42, 0, 4.5), after: 'floaters' }, L(grove, wallFactor),
    ],
    front: [L(under, sLip, lipY - lift)],
    floorEnd: lipY,
    crowd: [swayA, swayB], crowdLayer: L(swayA, wallFactor), floor, torches: [],
    pillar: paintMenhir(),
    crystal: paintCrystal(),
    cycle: {
      hz, keys: SKY_KEYS, sunR: theme.body.r,
      stars: paintStars(rng, W, hz), rainbow: paintRainbow(W, hz), moon: paintMoon(),
      lamps, lampColor: SG.rune[2],
    },
    floaters,
    ambience: {
      petals: [SG.leaves[3], SG.blossom[3], SG.flowers[1], SG.leaves[4], SG.blossom[4]],
      butterflies: [0xffe07a, 0x8ad0ff, 0xff9ac0, 0xfff8f0],
      sparkle: 0xfff6c8,
      bird: mix(0x2a3a5a, horizon, 0.25),
    },
    heat: null,
  };
}

type Outline = (v: number, side: number) => number;

/** Day → golden hour → sunset → dusk → night, keyed on the share of the round gone by. */
const SKY_KEYS: SkyKey[] = [
  { at: 0, sky: [0x2f6cd0, 0x4c8fe0, 0x86c2ef, 0xd6eef4], glow: 0xfff4c8, glowA: 0.55, band: 0xfff0d0, bandA: 0, tint: 0xffffff, tintA: 0 },
  { at: 0.38, sky: [0x2a66cc, 0x4a8ede, 0x8ac6ee, 0xdcf0f0], glow: 0xfff0b8, glowA: 0.55, band: 0xffe0b0, bandA: 0.05, tint: 0xffe0b0, tintA: 0.04 },
  { at: 0.56, sky: [0x3a64b8, 0x6a8ed0, 0xd8b896, 0xffd49a], glow: 0xffcf80, glowA: 0.6, band: 0xffb070, bandA: 0.3, tint: 0xffb070, tintA: 0.14 },
  { at: 0.7, sky: [0x2a3c80, 0x74589a, 0xe8806a, 0xffb070], glow: 0xff9050, glowA: 0.7, band: 0xff7a40, bandA: 0.55, tint: 0xff7a50, tintA: 0.26 },
  { at: 0.8, sky: [0x141c48, 0x2e2e68, 0x6a4a7a, 0xc0707a], glow: 0xff7060, glowA: 0.2, band: 0xd06070, bandA: 0.35, tint: 0x3a3070, tintA: 0.4 },
  { at: 0.92, sky: [0x060a1e, 0x0c1636, 0x1a2a52, 0x2c4068], glow: 0x8090c0, glowA: 0, band: 0x304070, bandA: 0.1, tint: 0x0a1030, tintA: 0.5 },
];

// --- Shading helpers ---------------------------------------------------------------

interface Blob { x: number; y: number; rx: number; ry: number }

/** Clumpy foliage: each blob lit from the upper right, lower blobs painted first. */
function foliage(p: Pix, blobs: Blob[], pal: number[], seed: number): void {
  blobs.sort((a, b) => b.y - a.y);
  for (const b of blobs) {
    for (let y = Math.floor(b.y - b.ry); y <= b.y + b.ry; y++) for (let x = Math.floor(b.x - b.rx); x <= b.x + b.rx; x++) {
      const u = (x + 0.5 - b.x) / b.rx, v = (y + 0.5 - b.y) / b.ry;
      const d = u * u + v * v;
      if (d > 1 || (d > 0.8 && hash(x, y, seed) < 0.4)) continue;
      const l = 0.5 - v * 0.45 + u * 0.22 - d * 0.16;
      let c = tone(pal, l, x, y);
      const r = hash(x, y, seed + 1);
      if (r < 0.06) c = l > 0.55 ? pal[pal.length - 1] : pal[0];
      p.set(x, y, c);
    }
  }
}

/** A soft cloud puff (dark underside, sunlit top right), clipped below `cut`. */
function puff(p: Pix, cx: number, cy: number, rx: number, ry: number, cut = Infinity, light = 0.78): void {
  for (const ox of [-p.w, 0, p.w]) {
    const x0 = Math.max(0, Math.floor(cx + ox - rx)), x1 = Math.min(p.w - 1, Math.ceil(cx + ox + rx));
    if (x0 > x1) continue;
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(p.h - 1, cy + ry, cut); y++) {
      for (let x = x0; x <= x1; x++) {
        const u = (x + 0.5 - cx - ox) / rx, v = (y + 0.5 - cy) / ry;
        if (u * u + v * v > 1) continue;
        p.set(x, y, tone(SG.cloud, light - v * 0.5 + u * 0.12, x, y, 0.06));
      }
    }
  }
}

// --- Sky and distance ---------------------------------------------------------------

/** Stars for the night sky, thinning toward the horizon (transparent elsewhere). */
function paintStars(rng: Rng, W: number, hz: number): Pix {
  const p = new Pix(W, hz);
  for (let i = 0; i < W * hz * 0.0022; i++) {
    const x = rng.int(0, W - 1), y = rng.int(0, hz - 1);
    const f = 1 - y / hz;
    if (rng.next() > f * 1.2) continue;
    const a = Math.round(90 + 165 * f * rng.next());
    p.set(x, y, rng.chance(0.2) ? 0xfff2d0 : 0xdce8ff, a);
    if (rng.chance(0.05)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + dx, y + dy, 0xa8c0f0, a >> 1);
  }
  return p;
}

/** A faint rainbow arc on the left, smooth alpha only. */
function paintRainbow(W: number, hz: number): Pix {
  const p = new Pix(W, hz);
  const rcx = W * 0.16, rcy = hz + 34, rr = hz * 0.92;
  const bands = [0xff7070, 0xffb060, 0xffe880, 0x90e080, 0x70b8ff, 0xb090ff];
  for (let y = 0; y < hz; y++) for (let x = 0; x < W; x++) {
    const rd = Math.hypot(x + 0.5 - rcx, y + 0.5 - rcy) - rr;
    if (rd < 0 || rd >= 14) continue;
    const fade = Math.min(1, (rcy - y) / 90) * Math.max(0, Math.min(1, (W * 0.6 - x) / 100));
    const q = (rd / 14) * (bands.length - 1), qi = Math.min(bands.length - 2, Math.floor(q));
    const a = Math.round(60 * Math.sin((rd / 14) * Math.PI) * fade);
    if (a > 1) p.set(x, y, mix(bands[qi], bands[qi + 1], q - qi), a);
  }
  return p;
}

/** A pale full moon with a few soft craters. */
function paintMoon(): Pix {
  const r = 9, p = new Pix(r * 2 + 1, r * 2 + 1);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const u = (x - r) / r, v = (y - r) / r, d = u * u + v * v;
    if (d > 1) continue;
    p.set(x, y, mix(0xf4f6ff, 0xc8d0ea, Math.max(0, (u - v) * 0.35 + d * 0.25)));
  }
  for (const [cx, cy, cr] of [[6, 7, 2.2], [12, 11, 1.6], [8, 13, 1.2], [13, 5, 1]]) p.ellipse(cx, cy, cr, cr, 0xc0c8e2);
  return p;
}

function paintHighClouds(p: Pix, rng: Rng, hz: number): void {
  const n = Math.max(2, Math.round(p.w / 150));
  for (let i = 0; i < n; i++) {
    const cx = (i + rng.range(0, 0.7)) * (p.w / n), cy = rng.range(hz * 0.14, hz * 0.5);
    const w = rng.range(26, 56);
    const base = cy + w * 0.12;
    for (let j = 0; j < 7; j++) {
      const u = rng.range(-1, 1);
      const r = (1 - Math.abs(u) * 0.55) * w * rng.range(0.26, 0.38);
      puff(p, cx + u * w * 0.8, base - r * rng.range(0.4, 0.9), r * 1.35, r, base);
    }
  }
  // Thin streaks.
  for (let i = 0; i < n + 1; i++) {
    const y = Math.round(rng.range(hz * 0.06, hz * 0.62)), x0 = rng.range(0, p.w), len = rng.range(40, 110);
    for (let x = 0; x < len; x++) {
      if (x > 2 && x < len - 2) p.set((Math.round(x0 + x) + p.w) % p.w, y, SG.cloud[3]);
      if (x > len * 0.25 && x < len * 0.7) p.set((Math.round(x0 + x + 6) + p.w) % p.w, y + 1, SG.cloud[2]);
    }
  }
}

function paintRidge(p: Pix, rng: Rng, base: number, amp: number, color: number, lit: number, snow: number | null): void {
  const n = 64;
  const pts = new Float32Array(n + 1);
  pts[0] = rng.range(0.2, 0.8); pts[n] = rng.range(0.2, 0.8);
  for (let step = n; step > 1; step >>= 1) {
    for (let i = step >> 1; i < n; i += step) {
      pts[i] = (pts[i - (step >> 1)] + pts[i + (step >> 1)]) / 2 + rng.range(-0.5, 0.5) * (step / n) * 1.8;
    }
  }
  for (let x = 0; x < p.w; x++) {
    const t = (x / p.w) * n, i = Math.min(n - 1, Math.floor(t)), f = t - i;
    const v = Math.max(0, pts[i] * (1 - f) + pts[i + 1] * f);
    const top = Math.round(base - v * amp);
    const tn = Math.round(base - Math.max(0, pts[Math.min(n, i + 1)] * (1 - f) + pts[Math.min(n, i + 2)] * f) * amp);
    for (let y = top; y < p.h; y++) {
      let c = color;
      if (y - top < 2 && tn > top) c = lit;
      if (snow && y - top < 3 && top < base - amp * 0.55) c = snow;
      p.set(x, y, c);
    }
  }
}

/** A sea of clouds seen from above: rows of puffs growing toward the viewer. */
function paintCloudSea(p: Pix, rng: Rng, top: number, bottom: number, r0: number, light: number): void {
  let y = top, r = r0;
  // Body colour under the puffs so nothing shows through.
  p.rect(0, Math.round(top + r0), p.w, p.h, SG.cloud[1]);
  while (y < bottom) {
    for (let x = rng.range(0, r * 2); x < p.w; x += r * rng.range(1.2, 2)) {
      puff(p, x, y + rng.range(-r * 0.25, r * 0.25), r * rng.range(1.5, 2.4), r * rng.range(0.7, 1), Infinity, 0.5 + light);
    }
    y += r * 0.75;
    r *= 1.22;
  }
}

/** A small floating island, optionally with a waterfall pouring into the cloud sea. */
function paintIsland(p: Pix, rng: Rng, cx: number, top: number, w: number, fog: number, sky: number, seaY: number, fall: boolean, trees = true): void {
  const hw = w / 2;
  const depth = w * rng.range(0.55, 0.85);
  const treeH = Math.ceil(w * 0.55);
  const tmp = new Pix(Math.ceil(w + 6), Math.ceil(treeH + depth * 1.3 + 30));
  const bots: number[] = [];
  const tcx = tmp.w / 2, ttop = treeH;
  const sd = rng.int(0, 9999);
  for (let x = 0; x < tmp.w; x++) {
    const dx = x + 0.5 - tcx, t = Math.abs(dx) / hw;
    if (t >= 1) continue;
    const y0 = ttop + Math.round(t ** 3 * 2);
    const tooth = hash(Math.floor(x / 4), 0, sd) * 6 * (1 - Math.abs((x % 4) - 1.5) / 2);
    const bot = ttop + 3 + depth * Math.pow(1 - t * t, 0.8) * (0.75 + 0.5 * noise(x, 0, 9, 0, sd)) + tooth;
    if (t < 0.6) bots.push(x, bot);
    for (let y = y0; y <= bot; y++) {
      const rel = y - y0;
      let c: number;
      if (rel === 0) c = SG.grass[3];
      else if (rel < 3) c = SG.grass[2];
      else if (rel < 5) c = SG.soil[1];
      else {
        const band = ((y + Math.round(Math.sin(x * 0.3) * 1.5)) >> 2) & 1;
        let i = band ? 2 : 1;
        if (bayer(x, y) < ((y - y0) / (bot - y0)) * 0.8) i--;
        if (dx > 0 && t > 0.8 && rel < depth * 0.4) i = 3;
        c = SG.rock[i];
      }
      if (y >= bot - 1 && rel > 4) c = mix(SG.rock[1], SG.cloud[1], 0.45);
      tmp.set(x, y, c);
    }
  }
  // Roots dangling from the underside.
  for (let i = 0; i < bots.length / 2 && i < w / 10; i++) {
    const k = rng.int(0, bots.length / 2 - 1) * 2, x = bots[k], len = rng.range(2, 4 + w * 0.12);
    for (let y = 0; y < len; y++) tmp.set(x + (y > len * 0.6 && (k & 2) ? 1 : 0), Math.floor(bots[k + 1]) + y, rng.chance(0.3) ? SG.leaves[1] : SG.bark[1]);
  }
  // Trees on top.
  const nt = trees ? Math.max(1, Math.round(w / 22)) : 0;
  for (let i = 0; i < nt; i++) {
    const tx = tcx + rng.range(-hw * 0.7, hw * 0.7), th = rng.range(w * 0.12, w * 0.3);
    const r = Math.max(2.5, th * rng.range(0.4, 0.6));
    tmp.rect(Math.round(tx), Math.round(ttop - th * 0.6), w > 60 ? 2 : 1, Math.ceil(th * 0.6), SG.bark[1]);
    foliage(tmp, [{ x: tx, y: ttop - th, rx: r * 1.1, ry: r }, { x: tx + r * 0.5, y: ttop - th - r * 0.4, rx: r * 0.7, ry: r * 0.6 }], rng.chance(0.25) ? SG.blossom : SG.leaves, sd + i);
  }
  tmp.outline(SG.ink);
  haze(tmp, sky, fog);
  p.blit(tmp, Math.round(cx - tcx), Math.round(top - ttop));
  if (fall) {
    // Waterfall from a spring near the edge, thinning into mist as it falls.
    const side = rng.chance(0.5) ? 1 : -1;
    const fx = Math.round(cx + side * hw * rng.range(0.35, 0.65)), fw = Math.max(1, Math.round(w / 28));
    for (let y = Math.round(top); y < seaY; y++) {
      const f = (y - top) / (seaY - top);
      for (let i = -1; i <= fw; i++) {
        if (bayer(fx + i, y) < f * f * 0.75) continue;
        const c = i < 0 || i === fw ? SG.water[0] : SG.water[1 + ((i + (y >> 1)) & 1)];
        p.set(fx + i, y, mix(c, sky, fog * 0.6));
      }
    }
    for (let k = 0; k < 3; k++) {
      const mx = fx + rng.range(-5, 5), my = seaY - rng.range(0, 3), mr = rng.range(3, 6);
      for (let y = Math.floor(my - mr); y <= my + mr; y++) for (let x = Math.floor(mx - mr * 1.6); x <= mx + mr * 1.6; x++) {
        const d = Math.hypot((x - mx) / 1.6, y - my) / mr;
        if (d < 1 && bayer(x, y) < 1 - d) p.set(x, y, mix(SG.water[2], sky, fog * 0.4));
      }
    }
  }
}

// --- The grove on the island's back edge ------------------------------------------

function paintTree(rng: Rng, h: number, leaves: number[], seed: number): Pix {
  const cr = Math.round(h * rng.range(0.25, 0.32));
  const lean = rng.range(-0.12, 0.12);
  const w = Math.ceil(cr * 3 + 12 + Math.abs(lean) * h * 2), ph = h + 2;
  const p = new Pix(w, ph);
  const cx = w / 2, base = ph - 1;
  const ccy = cr + 3;
  const tw = Math.max(4, Math.round(h * 0.055));
  const at = (y: number) => cx + lean * (base - y) + Math.sin((base - y) * 0.09) * 1.2;
  for (let y = Math.round(ccy); y <= base; y++) {
    const flare = y > base - 6 ? (y - (base - 6)) * 0.8 : 0;
    const xl = Math.round(at(y) - tw / 2 - flare), xr = Math.round(at(y) + tw / 2 + flare);
    for (let x = xl; x <= xr; x++) {
      let c = x === xl ? SG.bark[0] : x >= xr - 1 ? SG.bark[2] : SG.bark[1];
      if (x > xl && x < xr - 1 && hash(x, y >> 2, seed) < 0.22) c = SG.bark[0];
      p.set(x, y, c);
    }
  }
  // Branches reaching into the crown.
  for (const s of [-1, 1]) {
    const by = Math.round(ccy + cr * rng.range(0.5, 0.9));
    const bx = at(by);
    for (let i = 0; i < cr * 0.8; i++) {
      p.set(Math.round(bx + s * i), Math.round(by - i * 0.7), SG.bark[1]);
      p.set(Math.round(bx + s * i), Math.round(by - i * 0.7 + 1), SG.bark[0]);
    }
  }
  const blobs: Blob[] = [{ x: at(ccy), y: ccy + cr * 0.15, rx: cr * 1.15, ry: cr * 0.72 }];
  const n = rng.int(6, 9);
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI + rng.range(-0.2, 0.2);
    const r = cr * rng.range(0.38, 0.55);
    blobs.push({ x: at(ccy) + Math.cos(a) * cr * 0.85, y: ccy + Math.sin(a) * cr * 0.55 + cr * 0.15, rx: r * 1.15, ry: r * 0.85 });
  }
  foliage(p, blobs, leaves, seed);
  // A few hanging vines.
  for (let i = 0; i < 3; i++) {
    if (!rng.chance(0.6)) continue;
    const vx = Math.round(at(ccy) + rng.range(-cr, cr)), vy = Math.round(ccy + cr * 0.75), len = rng.int(5, 16);
    for (let k = 0; k < len; k++) {
      p.set(vx + (k % 6 === 3 ? 1 : 0), vy + k, leaves[1]);
      if (k % 3 === 1) p.set(vx + ((k >> 1) & 1 ? 1 : -1), vy + k, leaves[3]);
    }
  }
  p.outline(SG.ink);
  return p;
}

function paintArch(rng: Rng): Pix {
  const w = 54, h = 76, colW = 9;
  const p = new Pix(w + 6, h + 2);
  const ox = 3, acy = 27, R = w / 2, r = R - 8;
  const ax = ox + w / 2;
  const S = SG.stone;
  const brokeTop = acy + rng.int(8, 20);
  for (const [c0, yTop] of [[ox, acy], [ox + w - colW, brokeTop]] as const) {
    for (let y = yTop; y < h; y++) for (let x = c0; x < c0 + colW; x++) {
      if (y < yTop + 3 && hash(x, y, 3) < 0.5 && c0 !== ox) continue;
      const u = (x - c0) / (colW - 1);
      let c = u < 0.2 ? S[0] : u > 0.75 ? S[2] : S[1];
      if ((y - acy) % 10 === 0 || hash(x, y, 5) < 0.05) c = S[0];
      p.set(x, y, c);
    }
  }
  // Broken just past the keystone.
  const cut = rng.range(1.2, 1.42);
  for (let y = acy - R; y <= acy; y++) for (let x = ax - R; x <= ax + R; x++) {
    const d = Math.hypot(x + 0.5 - ax, y + 0.5 - acy);
    if (d < r || d > R) continue;
    const a = Math.atan2(y + 0.5 - acy, x + 0.5 - ax);
    if (a > -cut) continue;
    let c = d > R - 1.5 ? S[2] : d < r + 1 ? S[0] : S[1];
    if (Math.abs(((a + Math.PI) / 0.32) % 1) < 0.1) c = S[0];
    p.set(x, y, c);
  }
  // Fallen blocks at the foot of the broken side.
  for (let i = 0; i < 3; i++) {
    const bx = ox + w - colW - 10 + i * 7 + rng.int(-1, 1), bw = rng.int(5, 8), bh = rng.int(3, 5);
    p.rect(bx, h - bh, bw, bh, S[1]);
    p.rect(bx, h - bh, bw, 1, S[2]);
    p.rect(bx, h - 1, bw, 1, S[0]);
  }
  // Moss on every top surface, dripping a little.
  for (let x = 0; x < p.w; x++) {
    let y = 0;
    while (y < p.h && !p.has(x, y)) y++;
    if (y >= p.h - 4) continue;
    const drip = hash(x, 0, 9) < 0.25 ? 3 : 1;
    for (let k = 0; k <= drip; k++) p.set(x, y + k, k === 0 ? SG.grass[3] : SG.grass[2]);
  }
  // Ivy down the left column.
  for (let y = acy + 4; y < h - 6; y++) {
    const x = ox + 2 + Math.round(Math.sin(y * 0.35) * 2);
    p.set(x, y, SG.leaves[1]);
    if (y % 3 === 0) p.set(x + 1, y, SG.leaves[3]);
  }
  p.outline(SG.ink);
  return p;
}

/** A stone lantern with a glowing crystal behind its window. */
function paintLantern(): Pix {
  const p = new Pix(11, 24);
  const S = SG.stone;
  p.rect(3, 9, 5, 15, S[1]); p.rect(3, 9, 1, 15, S[0]); p.rect(7, 9, 1, 15, S[2]);
  p.rect(1, 21, 9, 3, S[1]); p.rect(1, 21, 9, 1, S[2]);
  p.rect(2, 3, 7, 6, S[1]); p.rect(2, 3, 1, 6, S[0]); p.rect(8, 3, 1, 6, S[2]);
  p.rect(4, 4, 3, 4, SG.rune[2]); p.set(5, 5, SG.rune[3]); p.set(4, 7, SG.rune[1]);
  p.poly([0, 3, 5.5, -0.5, 11, 3], S[2]);
  p.rect(0, 2, 11, 1, S[1]);
  p.set(5, 0, SG.grass[3]); p.set(4, 1, SG.grass[2]); p.set(6, 1, SG.grass[3]);
  for (let y = 12; y < 21; y += 2) p.set(3 + ((y >> 1) & 1), y, SG.leaves[1]);
  p.outline(SG.ink);
  return p;
}

/** A mossy boulder, lit from the upper right. */
function boulder(p: Pix, x: number, base: number, rx: number, ry: number): void {
  const cy = base - ry;
  for (let y = Math.floor(cy - ry); y <= base; y++) for (let xx = Math.floor(x - rx); xx <= x + rx; xx++) {
    const u = (xx + 0.5 - x) / rx, v = (y + 0.5 - cy) / ry;
    const d = u * u + v * v;
    if (d > 1) continue;
    let c = tone(SG.stone, 0.55 - v * 0.4 + u * 0.25, xx, y);
    if (v < -0.35 + Math.sin(xx * 0.9) * 0.15) c = v < -0.7 ? SG.grass[3] : SG.grass[2];
    p.set(xx, y, c);
  }
}

/** Paints the grove; returns the lanterns' crystal windows (layer coordinates). */
function paintGrove(p: Pix, sa: Pix, sb: Pix, rng: Rng, floorTop: number, hwL: number, hwR: number, sky: number): [number, number][] {
  const cx = p.w / 2;
  const left = cx - hwL, right = cx + hwR;
  // Back row: tall, hazed trees, leaving the middle open for the view.
  for (let x = left + rng.range(10, 30); x < right - 10; x += rng.range(64, 110)) {
    if (Math.abs(x - cx) < 46) continue;
    const t = paintTree(rng, rng.int(100, 146), rng.chance(0.22) ? SG.blossom : SG.leaves, rng.int(0, 9999));
    haze(t, sky, 0.24);
    p.blit(t, Math.round(x - t.w / 2), floorTop - 8 - t.h);
  }
  // A ruined arch framing the middle, stone lanterns either side.
  const arch = paintArch(rng);
  const ax = Math.round(cx + rng.range(-24, 24));
  p.blit(arch, ax - (arch.w >> 1), floorTop - 6 - arch.h);
  const lantern = paintLantern();
  const lamps: [number, number][] = [];
  for (const s of [-1, 1]) {
    p.blit(lantern, ax + s * 46 - (lantern.w >> 1), floorTop - 5 - lantern.h);
    lamps.push([ax + s * 46, floorTop - 5 - lantern.h + 6]);
  }
  // Front row: fewer, bigger crowns.
  for (let x = left + rng.range(40, 90); x < right - 30; x += rng.range(150, 240)) {
    if (Math.abs(x - cx) < 90) continue;
    const t = paintTree(rng, rng.int(80, 116), rng.chance(0.3) ? SG.blossom : SG.leaves, rng.int(0, 9999));
    p.blit(t, Math.round(x - t.w / 2), floorTop - 4 - t.h);
  }
  // Bushes, boulders, mushrooms and long grass along the edge, shrinking toward the ends.
  const band = new Pix(p.w, 34);
  const by = band.h - 1;
  for (let x = Math.max(0, Math.floor(left)); x < Math.min(p.w, right); x++) {
    for (let y = by - 3; y <= by; y++) band.set(x, y, bayer(x, y) < 0.3 ? SG.grass[2] : SG.grass[1]);
  }
  for (let x = left + rng.range(0, 6); x < right; x += rng.range(8, 15)) {
    const edge = Math.min(x - left, right - x);
    if (edge < 2) continue;
    const k = Math.min(1, 0.3 + edge / 50);
    const rx = rng.range(8, 15) * k, ry = rng.range(6, 11) * k;
    const pal = rng.chance(0.12) ? SG.blossom : SG.bush;
    foliage(band, [{ x, y: by - ry * 0.6, rx, ry }, { x: x + rx * 0.6, y: by - ry * 0.3, rx: rx * 0.7, ry: ry * 0.7 }], pal, rng.int(0, 9999));
    if (pal === SG.bush) for (let i = 0; i < 3; i++) {
      if (rng.chance(0.5)) band.set(Math.round(x + rng.range(-rx, rx) * 0.6), Math.round(by - ry * rng.range(0.3, 1.1)), rng.pick(SG.flowers));
    }
  }
  for (let x = left + rng.range(20, 60); x < right - 20; x += rng.range(60, 120)) {
    if (Math.abs(x - ax) < 40) continue;
    const r = rng.range(5, 9);
    boulder(band, x, by, r, r * rng.range(0.6, 0.8));
    // Mushrooms at the foot.
    for (let i = 0; i < rng.int(1, 3); i++) {
      const mx = Math.round(x + r + 2 + i * 3), mh = rng.int(2, 4);
      band.rect(mx, by - mh + 1, 1, mh, 0xf0e0c8);
      band.rect(mx - 1, by - mh, 3, 1, 0xd8483a);
      band.set(mx, by - mh - 1, 0xd8483a);
      band.set(mx - 1, by - mh, 0xfff0e0);
    }
  }
  for (let x = Math.max(0, Math.floor(left + 3)); x < Math.min(p.w, right - 3); x++) {
    if (hash(x, 1, 31) < 0.35) {
      const hgt = 2 + Math.floor(hash(x, 2, 31) * 4);
      for (let k = 0; k < hgt; k++) band.set(x, by - k, k === hgt - 1 ? SG.grass[4] : SG.grass[3]);
    }
  }
  band.outline(SG.ink);
  p.blit(band, 0, floorTop - band.h + 1);
  // Tall stalks and flower stems swaying in the wind (two frames).
  for (let x = left + rng.range(2, 6); x < right - 4; x += rng.range(4, 9)) {
    const base = floorTop - rng.int(1, 6), hgt = rng.int(6, 14);
    const head = rng.chance(0.35) ? rng.pick(SG.flowers) : rng.chance(0.4) ? SG.dirt[2] : -1;
    const stem = rng.chance(0.5) ? SG.grass[3] : SG.grass[2];
    for (const [buf, lean] of [[sa, rng.range(0, 0.6)], [sb, rng.range(1.2, 2.2)]] as const) {
      let tx = 0;
      for (let k = 0; k < hgt; k++) {
        tx = Math.round(x + lean * (k / hgt) ** 2);
        buf.set(tx, base - k, stem);
        if (k > 2 && k % 4 === 2) buf.set(tx + (k & 4 ? 1 : -1), base - k, SG.grass[4]);
      }
      if (head >= 0) { buf.set(tx, base - hgt, head); buf.set(tx + 1, base - hgt, head); buf.set(tx, base - hgt - 1, mix(head, 0xffffff, 0.35)); }
    }
  }
  return lamps;
}

// --- Floor and underside -------------------------------------------------------------

/** The meadow: u = world px (centre at w/2), v = depth row; transparent past the island's edge. */
function paintMeadow(rng: Rng, w: number, h: number, D: number, vTop: number, edgeAt: Outline, lipAt: (u: number) => number): Pix {
  const p = new Pix(w, h);
  const cx = w / 2;
  const G = SG.grass, Dt = SG.dirt;
  const vBack = D * 1.22;
  for (let v = 0; v < h; v++) {
    const hl = edgeAt(v, -1), hr = edgeAt(v, 1);
    if (hl <= 0 || hr <= 0) continue;
    const z = v * 2.6;
    for (let x = Math.max(0, Math.floor(cx - hl)); x < Math.min(w, Math.ceil(cx + hr)); x++) {
      const du = x + 0.5 - cx;
      const edge = du < 0 ? hl + du : hr - du;
      if (edge < 0) continue;
      const lip = lipAt(du);
      if (v < lip) {
        // Front face showing through the ragged lip: soil with root ends.
        p.set(x, v, hash(x, v, 9) < 0.06 ? SG.bark[1] : bayer(x, v) < (lip - v) / 5 ? SG.soil[0] : SG.soil[1]);
        continue;
      }
      // The trodden path the fighters duel on, ragged at the edges.
      const pc = D + (noise(du, 0, 90, 0, 11) - 0.5) * 5;
      const ph = (5 + noise(du, 0, 34, 0, 12) * 3.5) * Math.min(1, edge / 70);
      const pd = Math.abs(v - pc) - ph;
      let c: number;
      if (pd < -0.5 || (pd < 1.5 && bayer(x, v) < 0.5 - pd * 0.4)) {
        const n = noise(du, z, 14, 6, 13) + (bayer(x, v) - 0.5) * 0.3;
        c = n < 0.35 ? Dt[0] : n > 0.72 ? Dt[2] : Dt[1];
        const r = hash(x, v, 14);
        if (r < 0.025) c = SG.stone[2];
        else if (pd > -2.5 && r < 0.3) c = G[2];
      } else {
        const n = noise(du, z, 26, 26, 21) * 0.7 + noise(du, z, 7, 7, 22) * 0.3 + (bayer(x, v) - 0.5) * 0.22;
        let i = n < 0.36 ? 1 : n > 0.64 ? 3 : 2;
        const r = hash(x, v, 23);
        if (r < 0.07) i = Math.min(4, i + 1);
        else if (r < 0.13) i = 1;
        // Shade under the grove at the back.
        if (v > vBack - 10 && bayer(x, v) < (v - (vBack - 10)) / 14) i = Math.max(0, i - 1);
        c = G[i];
      }
      if (edge < 1.5 || v < lip + 1.2) c = G[4];
      p.set(x, v, c);
    }
  }
  const inside = (x: number, v: number) => (p.get(x, v) >>> 24) > 0;
  const grassy = (x: number, v: number) => inside(x, v) && v > lipAt(x - cx) + 2;
  // Clover clumps.
  for (let i = 0; i < w / 40; i++) {
    const x = rng.range(0, w), v = rng.range(D * 0.92, D * 1.24), r = rng.range(5, 10);
    if (Math.abs(v - D) < 11) continue;
    for (let yy = Math.floor(v - r / 2.6); yy <= v + r / 2.6; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
      if (Math.hypot(xx - x, (yy - v) * 2.6) > r * (0.8 + hash(xx, yy, 33) * 0.3) || !grassy(xx, yy)) continue;
      p.set(xx, yy, hash(xx, yy, 34) < 0.3 ? G[3] : G[1]);
    }
    if (rng.chance(0.5)) { p.set(Math.round(x), Math.round(v), SG.flowers[2]); p.set(Math.round(x) + 1, Math.round(v), SG.flowers[2]); }
  }
  // Flowers, in loose patches.
  for (let i = 0; i < w * h * 0.006; i++) {
    const x = rng.int(0, w - 2), v = rng.int(0, h - 1);
    if (!grassy(x, v) || !grassy(x + 1, v) || Math.abs(v - D) < 11) continue;
    if (noise(x, v * 2.6, 60, 60, 24) < 0.42) continue;
    const c = rng.pick(SG.flowers);
    p.set(x, v, c); p.set(x + 1, v, c);
    if (rng.chance(0.4)) p.set(x, v + 1, mix(c, 0xffffff, 0.4));
  }
  // Flat mossy stones, some with mushrooms.
  for (let i = 0; i < Math.round(w / 80); i++) {
    const x = rng.range(0, w), v = rng.range(D * 0.93, D * 1.25), rx = rng.range(4, 8), ry = rng.range(1.5, 2.8);
    if (Math.abs(v - D) < 12 || !grassy(Math.round(x - rx), Math.round(v)) || !grassy(Math.round(x + rx), Math.round(v))) continue;
    p.ellipse(x, v, rx + 1, ry + 1, G[0]);
    p.ellipse(x, v, rx, ry, SG.stone[1]);
    p.rect(Math.round(x - rx + 2), Math.round(v + ry - 1), Math.round(rx * 2 - 4), 1, SG.stone[2]);
    if (rng.chance(0.6)) p.set(Math.round(x + rx * 0.3), Math.round(v), G[3]);
    if (rng.chance(0.4)) for (let k = 0; k < 3; k++) p.rect(Math.round(x + rx + 2 + k * 3), Math.round(v + k - 1), 2, 1, k === 1 ? 0xc89060 : 0xd8483a);
  }
  // A fairy ring of mushrooms and daisies around the middle.
  const R = 66, n = 22;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng.range(-0.05, 0.05);
    const x = Math.round(cx + Math.cos(a) * R), v = Math.round(D + (Math.sin(a) * R) / 2.6);
    if (!grassy(x, v)) continue;
    if (k & 1) { p.set(x, v, SG.flowers[2]); p.set(x + 1, v, SG.flowers[2]); p.set(x, v + 1, SG.flowers[1]); }
    else { p.rect(x - 1, v, 3, 1, 0xd8483a); p.set(x, v, 0xfff0e0); p.rect(x - 1, v - 1, 3, 1, 0xf0e0c8); }
  }
  // Ambient occlusion where the meadow runs in under the grove: dark right at
  // the back row, gone a few screen rows forward.
  const back = (D * D) / vTop;
  for (let v = Math.floor(D * 1.08); v < h; v++) {
    const k = 0.55 * Math.exp(-((D * D) / v - back) / 3.2);
    if (k < 0.04) continue;
    for (let x = 0; x < w; x++) {
      const c = p.get(x, v);
      if (!(c >>> 24)) continue;
      const kq = Math.floor(k * 4 + bayer(x, v)) / 4;
      if (kq > 0) p.set(x, v, mix(unpackHex(c), 0x173026, kq));
    }
  }
  return p;
}

/**
 * The island's front face from the lip down: soil, rock strata tapering to a
 * jagged point, roots and vines. Rows above `top` hold grass blades along the edge.
 */
function paintUnderside(p: Pix, rng: Rng, hwL: number, hwR: number, top: number): [number, number][] {
  const veins: [number, number][] = [];
  const cx = p.w / 2;
  const Dm = 92;
  const bottom = new Float32Array(p.w).fill(-1);
  for (let x = 0; x < p.w; x++) {
    const dx = x + 0.5 - cx;
    const t = dx < 0 ? -dx / hwL : dx / hwR;
    if (t >= 1) continue;
    const cell = Math.floor(x / 7);
    const tooth = hash(cell, 0, 41) * 14 * (1 - Math.abs((x % 7) - 3) / 3.5);
    bottom[x] = top + 9 + Dm * Math.pow(1 - t ** 1.6, 1.1) * (0.72 + 0.5 * noise(x, 0, 23, 0, 42)) + tooth;
  }
  const R = SG.rock;
  for (let x = 0; x < p.w; x++) {
    const b = bottom[x];
    if (b < 0) continue;
    const wave = Math.sin(x * 0.045) * 3 + noise(x, 0, 16, 0, 43) * 4;
    const nb = bottom[Math.min(p.w - 1, x + 2)];
    for (let y = top; y <= Math.min(p.h - 1, b); y++) {
      const yy = y - top;
      let c: number;
      if (yy < 10) {
        c = bayer(x, y) < yy / 11 ? SG.soil[0] : SG.soil[1];
        if (hash(x, y, 44) < 0.04) c = R[3];
      } else {
        // Strata that wander, darkening toward the point; a sunlit rim on the right slope.
        const sv = (yy + wave + noise(x, yy, 26, 7, 46) * 7) / 7;
        let i = Math.floor(sv) % 3 === 0 ? 1 : 2;
        if (sv % 1 < 0.15 && i === 2) i = 3;
        const depth = yy / (b - top);
        if (bayer(x, y) < depth * 1.1 - 0.15) i--;
        if (bayer(x + 2, y) < depth * 1.1 - 0.75) i--;
        if (y > nb && y < b - 1) i = 3;
        c = R[Math.max(0, i)];
        if (y >= b - 1) c = mix(R[1], SG.cloud[1], 0.5);
      }
      p.set(x, y, c);
    }
    // Grass hanging over the lip.
    if (hash(x, 3, 45) < 0.4) {
      const len = 1 + hash(x, 4, 45) * 4;
      for (let k = 0; k < len; k++) p.set(x, top + k, k === 0 ? SG.grass[3] : SG.grass[2]);
    }
  }
  // Boulders bedded in the rock.
  for (let i = 0; i < p.w / 16; i++) {
    const x = Math.floor(rng.range(0, p.w));
    if (bottom[x] < top + 30) continue;
    const y = rng.range(top + 13, bottom[x] - 10), rx = rng.range(3, 7), ry = rx * rng.range(0.6, 0.85);
    for (let yy = Math.floor(y - ry); yy <= y + ry; yy++) for (let xx = Math.floor(x - rx); xx <= x + rx; xx++) {
      const u = (xx + 0.5 - x) / rx, v = (yy + 0.5 - y) / ry;
      const d = u * u + v * v;
      if (d > 1 || !p.has(xx, yy)) continue;
      p.set(xx, yy, d > 0.7 && v > 0 ? R[0] : tone(R, 0.55 - v * 0.35 + u * 0.15 - ((yy - top) / (bottom[x] - top)) * 0.3, xx, yy));
    }
  }
  // Glowing crystals in the rock.
  for (let i = 0; i < p.w / 110; i++) {
    const x = Math.floor(rng.range(0, p.w));
    if (bottom[x] < top + 40) continue;
    const y = Math.round(rng.range(top + 16, bottom[x] - 14));
    veins.push([x, y - 2]);
    for (const [ox, oh] of [[0, 6], [3, 4], [-3, 3]]) {
      for (let k = 0; k < oh; k++) {
        p.set(x + ox, y - k, k === oh - 1 ? SG.rune[3] : SG.rune[2]);
        p.set(x + ox + 1, y - k + 1, SG.rune[1]);
      }
    }
  }
  // The lip overhangs the rock face: shadow tucked in right under it.
  for (let y = top; y < top + 14; y++) {
    const k = 0.5 * (1 - (y - top) / 14) ** 1.5;
    for (let x = 0; x < p.w; x++) {
      const c = p.get(x, y);
      if (!(c >>> 24)) continue;
      const kq = Math.floor(k * 4 + bayer(x, y)) / 4;
      if (kq > 0) p.set(x, y, mix(unpackHex(c), 0x1c1428, kq * 0.8));
    }
  }
  p.outline(SG.ink);
  // No ink along the lip itself: the floor's edge meets the soil there.
  p.data.fill(0, (top - 1) * p.w, top * p.w);
  // Grass blades and the odd flower standing along the edge.
  for (let x = 0; x < p.w; x++) {
    if (bottom[x] < 0 || hash(x, 5, 47) > 0.5) continue;
    const hgt = 1 + Math.floor(hash(x, 6, 47) * (top - 1));
    for (let k = 1; k <= hgt; k++) p.set(x, top - k, k === hgt ? SG.grass[4] : SG.grass[3]);
    if (hgt > 3 && hash(x, 7, 47) < 0.12) p.set(x, top - hgt - 1, SG.flowers[Math.floor(hash(x, 8, 47) * SG.flowers.length)]);
  }
  // Roots and vines dangling below.
  for (let i = 0; i < p.w / 12; i++) {
    let x = Math.floor(rng.range(0, p.w));
    if (bottom[x] < top + 12) continue;
    const vine = rng.chance(0.35);
    let y = top + rng.int(4, 9);
    const len = vine ? rng.int(10, 40) : rng.int(8, 30) + Math.round((bottom[x] - top) * rng.range(0, 0.5));
    for (let k = 0; k < len && y < p.h; k++, y++) {
      if (!vine && rng.chance(0.25)) x += rng.chance(0.5) ? 1 : -1;
      if (vine) {
        p.set(x, y, SG.leaves[1]);
        if (k % 3 === 1) p.set(x + ((k >> 1) & 1 ? 1 : -1), y, SG.leaves[3]);
        if (k === len - 1 && rng.chance(0.4)) p.set(x, y + 1, SG.flowers[0]);
      } else {
        p.set(x, y, k < len - 4 ? SG.bark[1] : SG.bark[0]);
        if (k < len * 0.4) p.set(x + 1, y, SG.bark[0]);
      }
    }
  }
  return veins;
}

/** A chunk of rock with a grass cap, floating near the island. */
function paintChunk(rng: Rng, w: number, sky: number, fog: number): Pix {
  const p = new Pix(Math.ceil(w + 8), Math.ceil(w * 1.75 + 34));
  paintIsland(p, rng, p.w / 2, Math.ceil(w * 0.55), w, fog, sky, 0, false, w > 13);
  return p;
}

// --- Props -----------------------------------------------------------------------------

/** A mossy standing stone with a glowing rune, marking each end of the arena. */
function paintMenhir(): Pix {
  const w = 28, h = 112;
  const p = new Pix(w, h);
  const S = SG.stone;
  const top = 10;
  for (let y = top; y < h; y++) {
    const f = (y - top) / (h - top);
    const half = 6 + f * 4;
    const slant = y < top + 8 ? (top + 8 - y) * 0.9 : 0;
    const xl = Math.round(w / 2 - half), xr = Math.round(w / 2 + half - slant);
    for (let x = xl; x <= xr; x++) {
      const u = (x - xl) / Math.max(1, xr - xl);
      let c = u < 0.18 ? S[0] : u > 0.78 ? S[2] : S[1];
      if (hash(x, y >> 1, 51) < 0.07) c = S[0];
      else if (u > 0.78 && hash(x, y, 52) < 0.15) c = S[3];
      p.set(x, y, c);
    }
  }
  // Rune groove down the face.
  const rx = w / 2 - 1;
  for (let y = top + 14; y < h - 22; y++) {
    const k = (y - top - 14) % 12;
    if (k > 8) continue;
    const glyph = Math.floor((y - top - 14) / 12) % 3;
    const dx = glyph === 0 ? (k < 4 ? k : 8 - k) - 2 : glyph === 1 ? 0 : (k === 4 ? -2 : 0);
    p.set(rx + dx, y, SG.rune[2]);
    if (glyph === 2 && k === 4) { p.set(rx - 1, y, SG.rune[2]); p.set(rx + 1, y, SG.rune[2]); }
    p.set(rx + dx + 1, y, SG.rune[0]);
  }
  // Moss cap and streaks.
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h && !p.has(x, y)) y++;
    if (y >= h) continue;
    const d = 2 + Math.floor(hash(x, 0, 53) * (x < w / 2 ? 9 : 4));
    for (let k = 0; k < d; k++) p.set(x, y + k, k === 0 ? SG.grass[4] : bayer(x, y + k) < 0.5 ? SG.grass[2] : SG.grass[3]);
  }
  // Ivy climbing from the base.
  for (let y = h - 4; y > h * 0.4; y--) {
    const x = Math.round(w / 2 - 4 + Math.sin(y * 0.22) * 4);
    p.set(x, y, SG.leaves[1]);
    if (y % 3 === 0) { p.set(x - 1, y, SG.leaves[3]); p.set(x + 1, y - 1, SG.leaves[2]); }
  }
  // Grass and flowers at the foot.
  for (let x = 1; x < w - 1; x++) {
    const hgt = 2 + Math.floor(hash(x, 7, 54) * 5);
    for (let k = 0; k < hgt; k++) p.set(x, h - 1 - k, k === hgt - 1 ? SG.grass[4] : SG.grass[2 + (k & 1)]);
  }
  p.set(4, h - 6, SG.flowers[0]); p.set(22, h - 5, SG.flowers[1]); p.set(17, h - 7, SG.flowers[2]);
  p.outline(SG.ink);
  return p;
}

/** The glowing crystal that floats over each standing stone. */
function paintCrystal(): Pix {
  const w = 15, h = 21;
  const p = new Pix(w, h);
  const cx = 7, cy = 10;
  // Soft dithered glow.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot((x - cx) / 7, (y - cy) / 10);
    if (d < 1 && bayer(x, y) < (1 - d) * 0.55) p.set(x, y, SG.rune[2], 110);
  }
  const C = SG.rune;
  for (let y = 3; y <= 17; y++) {
    const half = y < 8 ? (y - 3) * 0.7 : (17 - y) * 0.36;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const c = x < cx ? (y < 8 ? C[2] : C[1]) : x === cx ? C[3] : (y < 8 ? C[3] : C[2]);
      p.set(x, y, c);
    }
  }
  p.set(cx - 1, 6, C[3]); p.set(cx - 1, 7, C[3]);
  const src = p.data.slice();
  const solid = (xx: number, yy: number) => xx >= 0 && xx < w && yy >= 0 && yy < h && src[yy * w + xx] >>> 24 === 255;
  for (let y = 2; y <= 18; y++) for (let x = 0; x < w; x++) {
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) p.set(x, y, C[0]);
  }
  return p;
}
