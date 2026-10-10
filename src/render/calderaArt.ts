import { Rng } from '../core/rng';
import { ARENA_HALF_WIDTH } from '../sim/constants';
import { mix, unpackHex } from './pixel/color';
import { bayer, Pix } from './pixel/paint';
import { PPM } from './sprite/animator';
import type { ArenaArt, Fall, Heat, Layer, Theme } from './arenaArt';
import { haze, hash, noise, occlude, tone, wnoise } from './scenery';

/**
 * Emberforge Caldera: the duel happens on a platform of basalt columns
 * standing in a lava lake, inside a volcano's crater, in front of an old
 * giants' forge. Same parallax + perspective-floor scheme as Skygrove, but
 * everything is lit from below by the lava and the distant volcano grows
 * angrier as the round goes on (see `Heat` and `ArenaView.light`).
 *
 * Back to front: ember sky and blood moon · smoke banks · the great volcano
 * and its ash plume · the caldera's cliffs with lavafalls · the lava lake ·
 * the forge on the platform's back edge (column organs, furnace, anvil,
 * chains) · hex basalt floor · the platform's columns and the lava in front.
 */

const BASALT = [0x120e16, 0x1e1820, 0x2c222c, 0x3e303a, 0x564450, 0x76606a];
const OBSIDIAN = [0x0a0812, 0x18142a, 0x2c2650, 0x5a52a0, 0xa49ce8];
const LAVA = [0x5a0c08, 0xa8200a, 0xe0480e, 0xff8420, 0xffc048, 0xfff2b0];
const CRUST = [0x140a0c, 0x22100e, 0x381812, 0x5a2414];
const IRON = [0x1a181e, 0x34303a, 0x524c56, 0x7a7480];
const BRASS = [0x5a3414, 0x9a6224, 0xd49a3e, 0xf4d07a];
const SMOKE = [0x140c14, 0x22121a, 0x341a20, 0x52241e, 0x7e3420, 0xb8521e];
const VOLCANO = [0x1a0e18, 0x2a1622, 0x3c1e2a, 0x56283a];
const ASH = [0x4a3e42, 0x6a5c5e, 0x8e7e7c];
const SULFUR = [0xb89a2a, 0xe8d050];
const WOOD = [0x3a2418, 0x5e3c24];
const INK = 0x0a0610;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildCaldera(theme: Theme, W: number, H: number, gy: number, travel: number, seed: number): ArenaArt {
  const rng = new Rng(seed + 101);
  const wallFactor = 0.78;
  const floorTop = gy - 22;
  const hy = gy - 22 / (1 - wallFactor);
  const D = gy - hy;
  const lipY = gy + 10;
  const sLip = (lipY + 0.5 - hy) / D;
  const vLip = D / sLip;
  const vTop = D / ((floorTop + 0.5 - hy) / D);
  // Platform outline seen from above: a wide rounded slab, cut along the hex
  // columns at its sides (see paintHexFloor).
  const E = (ARENA_HALF_WIDTH + 2.4) * PPM;
  const vc = (vLip + vTop) / 2 - 4, rv = (vTop - vLip) / 2 + 14;
  const edgeAt = (v: number, side: number) => {
    const k = Math.abs(v - vc) / rv;
    if (k >= 1) return 0;
    return E * Math.pow(1 - k ** 3, 1 / 3) + (noise(v * 2.6, 0, 22, 0, side > 0 ? 171 : 173) - 0.5) * 40;
  };
  const lipEnd = [edgeAt(vLip, -1), edgeAt(vLip, 1)];
  const lipAt = (u: number) => {
    const corner = Math.max(0, 1 - (lipEnd[u < 0 ? 0 : 1] - Math.abs(u)) / 24);
    return vLip + 0.5 + noise(u, 0, 14, 0, 181) * 3 + corner * corner * 10;
  };
  const hz = gy - 46;
  const lw = (f: number) => Math.ceil(W + 2 * travel * f + 8);
  const horizon = theme.sky[theme.sky.length - 1];
  const glows: Heat['glows'] = [];
  const glow = (layer: Pix, factor: number, y0: number, x: number, y: number, r: number) =>
    glows.push({ x: x - (layer.w - W) / 2, y: y0 + y, factor, r });

  const sky = paintSky(W, hz + 4, theme.sky);

  const banks = new Pix(lw(0.04), hz);
  paintSmokeBanks(banks, rng, hz);

  const far = new Pix(lw(0.08), hz + 2);
  const crater = paintVolcano(far, rng, far.w / 2 + W * 0.1, Math.max(34, hz - 150), hz + 2, Math.min(260, W * 0.42), horizon);

  const cliffs = new Pix(lw(0.2), hz + 2);
  const falls = paintCliffs(cliffs, rng, hz, horizon);
  for (const f of falls) {
    glow(cliffs, 0.2, 0, f.x + f.w / 2, f.y + f.h - 2, 20);
    glow(cliffs, 0.2, 0, f.x + f.w / 2, f.y + 1, 8);
  }

  const lake = new Pix(lw(0.35), H - hz + 4);
  paintMolten(lake, Math.round(lake.w / 70) * 2, 1.4, 20, 0.07, 0.16, 211, horizon);

  const temple = new Pix(lw(wallFactor), floorTop + 1);
  const shimA = new Pix(temple.w, temple.h), shimB = new Pix(temple.w, temple.h);
  const forge = paintForge(temple, shimA, shimB, rng, floorTop, edgeAt(vTop, -1) * wallFactor, edgeAt(vTop, 1) * wallFactor, horizon);
  for (const [x, y, r] of forge.glows) glow(temple, wallFactor, 0, x, y, r);

  const floor = paintHexFloor(Math.ceil(W / 0.65 + 2 * travel * 1.6 + 64), Math.ceil(D) * 2, D, vTop, edgeAt, lipAt);

  // The platform's front: columns from the lip down into the lava.
  const lift = 3, sink = 26;
  const face = new Pix(lw(sLip), lift + sink + 4);
  paintColumnFace(face, rng, edgeAt(vLip, -1) * sLip, edgeAt(vLip, 1) * sLip, lift, sink);
  const poolY = lipY + sink;
  const pool = new Pix(lw(sLip), Math.max(4, H - poolY + 8));
  paintMolten(pool, Math.round(pool.w / 110) * 2, 9, 34, 0.09, 0.14, 223, -1);

  for (const sd of [-1, 1]) glows.push({ x: W / 2 + sd * (ARENA_HALF_WIDTH + 0.75) * PPM, y: gy - 118, factor: 1, r: 26 });
  glows.push({ x: crater[0] - (far.w - W) / 2, y: crater[1], factor: 0.08, r: 30 });

  const fallTex = paintFallTexture(24, Math.max(24, ...falls.map((f) => f.h)) + 26);
  const L = (pix: Pix, factor: number, y = 0, drift = 0): Layer => ({ pix, factor, y, drift });
  return {
    theme, gy, hy, floorTop, wallFactor,
    layers: [
      L(sky, 0), L(banks, 0.04, 0, 1.5), L(far, 0.08), { ...L(cliffs, 0.2), after: 'falls' },
      L(lake, 0.35, hz - 2, 2.5), L(temple, wallFactor),
    ],
    front: [L(face, sLip, lipY - lift), L(pool, sLip, poolY, 5)],
    floorEnd: lipY,
    crowd: [shimA, shimB], crowdLayer: L(shimA, wallFactor), floor, torches: forge.coals,
    pillar: paintObelisk(),
    crystal: null, cycle: null, floaters: [], ambience: null,
    heat: {
      fallTex, tile: 24, falls, glows,
      crater: { x: crater[0] - (far.w - W) / 2, y: crater[1], factor: 0.08 },
      bolts: [0, 1, 2].map(() => paintBolt(rng)),
      glow: LAVA[3],
    },
    cosmos: null,
  };
}

// --- Sky and distance ---------------------------------------------------------------

/** Smooth (undithered) ember sky with a blood moon behind the smoke. */
function paintSky(W: number, h: number, stops: number[]): Pix {
  const p = new Pix(W, h);
  const n = stops.length - 1;
  for (let y = 0; y < h; y++) {
    // Most of the colour change happens low, near the glowing horizon.
    const t = Math.pow(y / (h - 1), 1.6) * n, i = Math.min(n - 1, Math.floor(t));
    p.rect(0, y, W, 1, mix(stops[i], stops[i + 1], t - i));
  }
  const mx = W * 0.2, my = h * 0.2, r = 13;
  for (let y = Math.floor(my - r * 4); y < my + r * 4; y++) for (let x = Math.floor(mx - r * 4); x < mx + r * 4; x++) {
    if (!p.has(x, y)) continue;
    const d = Math.hypot(x + 0.5 - mx, y + 0.5 - my) / r;
    if (d <= 1) {
      const u = (x + 0.5 - mx) / r, v = (y + 0.5 - my) / r;
      p.set(x, y, mix(0xf08a5a, 0xa83a30, Math.max(0, (u + v) * 0.4 + d * d * 0.3)));
    } else if (d < 4) p.set(x, y, mix(unpackHex(p.get(x, y)), 0xc8503a, 0.32 * ((4 - d) / 3) ** 2));
  }
  for (const [cx, cy, cr] of [[-3, -3, 3], [4, 2, 2.4], [-1, 5, 1.6], [5, -5, 1.4]]) p.ellipse(mx + cx, my + cy, cr, cr, 0xb0463a);
  return p;
}

/** A smoke puff lit from below (`lit` 0..1), ragged at the edge; wraps around if `wrap`. */
function smoke(p: Pix, cx: number, cy: number, rx: number, ry: number, lit: number, seed: number, wrap = false): void {
  for (const ox of wrap ? [-p.w, 0, p.w] : [0]) {
    const x0 = Math.max(0, Math.floor(cx + ox - rx)), x1 = Math.min(p.w - 1, Math.ceil(cx + ox + rx));
    if (x0 > x1) continue;
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(p.h - 1, cy + ry); y++) {
      for (let x = x0; x <= x1; x++) {
        const u = (x + 0.5 - cx - ox) / rx, v = (y + 0.5 - cy) / ry;
        const d = u * u + v * v;
        if (d > 1 || (d > 0.78 && hash(x, y, seed) < 0.4)) continue;
        p.set(x, y, tone(SMOKE, 0.14 + Math.max(0, v + 0.2) * 0.62 * lit - u * 0.05, x, y, 0.07));
      }
    }
  }
}

function paintSmokeBanks(p: Pix, rng: Rng, hz: number): void {
  const n = Math.max(2, Math.round(p.w / 170));
  for (let i = 0; i < n; i++) {
    const cx = (i + rng.range(0, 0.6)) * (p.w / n), base = rng.range(hz * 0.16, hz * 0.52);
    const w = rng.range(60, 120);
    for (let j = 0; j < 9; j++) {
      const u = rng.range(-1, 1);
      const r = (1 - Math.abs(u) * 0.5) * w * rng.range(0.16, 0.26);
      smoke(p, cx + u * w * 0.7, base - r * rng.range(0.2, 0.7), r * 1.6, r * 0.8, 0.85, 300 + i * 9 + j, true);
    }
    // A flat, glowing underside.
    for (let x = Math.floor(cx - w * 0.6); x < cx + w * 0.6; x++) {
      const xx = ((x % p.w) + p.w) % p.w;
      if (p.has(xx, Math.round(base))) p.set(xx, Math.round(base) + 1, SMOKE[4]);
    }
  }
}

/** The great volcano, its smaller neighbours and its ash plume; returns the crater (layer coordinates). */
function paintVolcano(p: Pix, rng: Rng, cx: number, topY: number, baseY: number, halfBase: number, horizon: number): [number, number] {
  // The plume first, so the cone's rim cuts it.
  const n = 16;
  for (let i = n - 1; i >= 0; i--) {
    const s = i / (n - 1);
    const y = topY - 2 - s * (topY - 6);
    const r = 6 + s * 34;
    smoke(p, cx + s * s * 70 + Math.sin(i * 1.7) * 4, y, r * 1.25, r * 0.8, 1 - s * 0.85, 400 + i);
  }
  const cone = (ccx: number, top: number, half: number, rim: number, fog: number, seed: number) => {
    for (let x = Math.max(0, Math.floor(ccx - half)); x < Math.min(p.w, ccx + half); x++) {
      const dx = x + 0.5 - ccx;
      let ty: number;
      if (Math.abs(dx) < rim) ty = top + 4 * (1 - (dx / rim) ** 2);
      else {
        const t = (Math.abs(dx) - rim) / (half - rim);
        ty = baseY - (baseY - top) * (1 - t) ** 1.8 + (noise(x, 0, 14, 0, seed) - 0.5) * 6 * t;
      }
      for (let y = Math.max(0, Math.round(ty)); y < baseY; y++) {
        let k = dx < 0 ? 1 : 2;
        if (y - ty < 2) k = 3;
        else if (noise(x, 0, 5, 0, seed + 1) > 0.64 && y - ty > 6) k--;
        const f = ((y - top) / (baseY - top)) ** 1.3 * 0.6 + fog;
        p.set(x, y, mix(VOLCANO[k], horizon, Math.min(0.9, f)));
      }
    }
  };
  cone(cx - p.w * 0.36, baseY - 54, 120, 8, 0.32, 431);
  cone(cx + p.w * 0.4, baseY - 40, 100, 6, 0.38, 433);
  cone(cx, topY, halfBase, 22, 0.06, 435);
  // Lava rivers down the flanks.
  for (let r = 0; r < 5; r++) {
    let x = cx + rng.range(-16, 16), y = topY + 4;
    const dir = x < cx ? -1 : 1, end = topY + (baseY - topY) * rng.range(0.45, 0.95);
    while (y < end) {
      const f = (y - topY) / (baseY - topY);
      if (!p.has(Math.round(x), y)) break;
      p.set(Math.round(x), y, mix(LAVA[3 + (hash(r, y >> 2, 437) < 0.3 ? 1 : 0)], horizon, f * 0.35));
      p.set(Math.round(x) + 1, y, mix(LAVA[2], horizon, f * 0.4));
      y++;
      x += dir * (0.25 + f * 0.5) + (noise(y, r * 40, 9, 0, 441) - 0.5) * 2.2;
    }
  }
  // Molten crater rim.
  for (let x = Math.floor(cx - 18); x < cx + 18; x++) {
    let y = 0;
    while (y < p.h && !p.has(x, y)) y++;
    p.set(x, y, LAVA[4]);
    p.set(x, y + 1, LAVA[3]);
    if (hash(x, 1, 439) < 0.4) p.set(x, y + 2, LAVA[2]);
  }
  return [cx, topY + 2];
}

/** The caldera's walls of columnar basalt, tallest at the sides; returns the lavafalls. */
function paintCliffs(p: Pix, rng: Rng, hz: number, horizon: number): Fall[] {
  const cx = p.w / 2;
  const tops = new Float32Array(p.w).fill(hz);
  let x = 0;
  while (x < p.w) {
    const cw = rng.int(4, 8);
    const d = Math.abs(x + cw / 2 - cx);
    const h = (16 + 130 * smooth(60, 330, d)) * (0.6 + 0.7 * noise(x, 0, 60, 0, 501)) + rng.range(-5, 5);
    const top = Math.round(hz - Math.max(6, h));
    for (let i = 0; i < cw && x + i < p.w; i++) {
      tops[x + i] = top;
      for (let y = top; y < p.h; y++) {
        const low = (y - top) / Math.max(1, hz - top);
        let k = i === 0 ? 3 : i === cw - 1 ? 1 : 2;
        if (y < top + 2) k = 4;
        else if (hash(x, y >> 3, 503) < 0.08 && y < hz - 3) k = 1;
        let c = BASALT[k];
        // Warm light from the lake below, cooler haze above.
        if (bayer(x + i, y) < low * low * 0.6) c = mix(c, LAVA[1], 0.3);
        p.set(x + i, y, mix(c, horizon, 0.05 + (1 - low) * 0.07));
      }
    }
    x += cw;
  }
  // Glowing fissures.
  for (let i = 0; i < p.w / 60; i++) {
    let fx = rng.range(0, p.w);
    const xi = Math.floor(fx);
    if (hz - tops[xi] < 40) continue;
    for (let y = tops[xi] + rng.int(8, 20); y < hz; y++) {
      if (y % 3 === 0) fx += rng.int(-1, 1);
      p.set(Math.round(fx), y, LAVA[2]);
    }
  }
  // Lavafalls pour from notches in the tallest walls.
  const falls: Fall[] = [];
  for (let tries = 0; tries < 40 && falls.length < 4; tries++) {
    const fx = Math.round(rng.range(20, p.w - 20));
    const top = tops[fx];
    if (hz - top < 60 || falls.some((f) => Math.abs(f.x - fx) < 70)) continue;
    const y0 = Math.round(top + rng.range(8, 26)), w = rng.int(3, 6);
    falls.push({ x: fx, y: y0, w, h: hz - y0 + 1 });
    // The wall around it glows; a pool steams at its foot.
    for (let y = y0 - 4; y < hz; y++) for (let xx = fx - 7; xx < fx + w + 7; xx++) {
      if (!p.has(xx, y)) continue;
      const d = Math.max(fx - xx, xx - fx - w + 1, 0) / 7;
      if (bayer(xx, y) < (1 - d) * 0.6) p.set(xx, y, mix(unpackHex(p.get(xx, y)), LAVA[2], 0.4));
    }
    p.rect(fx - 1, y0 - 2, w + 2, 2, LAVA[4]);
  }
  return falls;
}

/**
 * Molten rock seen from above: crust plates split by glowing cracks, the
 * plates squashed toward the far rows. Tiles horizontally (it drifts).
 * `fog` < 0 means no distance haze.
 */
function paintMolten(p: Pix, n: number, c0: number, c1: number, k0: number, k1: number, seed: number, fog: number): void {
  let z = 0;
  for (let y = 0; y < p.h; y++) {
    const t = y / Math.max(1, p.h - 1);
    const cell = c0 + (c1 - c0) * t ** 1.4;
    z += 1 / cell;
    const cw = k0 + (k1 - k0) * t;
    for (let x = 0; x < p.w; x++) {
      const gx = (x / p.w) * n;
      const v = wnoise(gx, z, n, 1, seed) * 0.65 + wnoise(gx * 2, z * 2, n * 2, 1, seed + 1) * 0.35;
      const r = 1 - Math.abs(2 * v - 1);
      const pool = wnoise(gx / 2, z / 2, n / 2, 1, seed + 2);
      let c: number;
      if (pool > 0.76) c = tone(LAVA, 0.5 + (pool - 0.76) * 1.6 + (r - 0.5) * 0.3, x, y, 0.2);
      else if (r > 1 - cw * 0.35) c = hash(x, y, seed) < 0.15 ? LAVA[5] : LAVA[4];
      else if (r > 1 - cw) c = LAVA[2 + Math.floor(((r - 1 + cw) / (cw * 0.65)) * 2)];
      else if (r > 1 - cw * 1.8) c = bayer(x, y) < 0.5 ? CRUST[3] : mix(CRUST[3], LAVA[1], 0.5);
      else c = tone(CRUST, 0.35 + wnoise(gx * 3, z * 3, n * 3, 1, seed + 3) * 0.5 - (1 - r) * 0.25, x, y, 0.25);
      if (fog >= 0 && t < 0.3) c = mix(c, fog, ((0.3 - t) / 0.3) ** 1.5 * 0.7);
      p.set(x, y, c);
    }
  }
  if (fog >= 0) p.rect(0, 0, p.w, 1, mix(fog, LAVA[4], 0.4));
  else {
    // Where the columns stand in it: a bright seam.
    for (let x = 0; x < p.w; x++) { p.set(x, 0, LAVA[4]); if (hash(x, 0, seed) < 0.5) p.set(x, 1, LAVA[3]); }
  }
}

/** Lava pouring straight down, as a strip that tiles every `tile` rows (scrolled at runtime). */
function paintFallTexture(tile: number, h: number): Pix {
  const w = 6;
  const p = new Pix(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const yy = y % tile;
    const edge = x === 0 || x === w - 1;
    let i = edge ? 1 : x === 1 || x === w - 2 ? 2 : 3;
    const s = hash(x, (yy / 3) | 0, 611);
    if (!edge && s < 0.3) i++;
    if (!edge && s > 0.85) i = 5;
    p.set(x, y, LAVA[i]);
  }
  return p;
}

// --- The forge on the platform's back edge --------------------------------------------

/** One hex basalt column seen from the front: lit facet, face, shaded facet, a cap on top. */
function column(p: Pix, x: number, base: number, w: number, h: number, rng: Rng, cracks: number[]): void {
  const top = Math.round(base - h);
  for (let y = top; y <= base; y++) {
    const low = (y - top) / Math.max(1, h);
    for (let i = 0; i < w; i++) {
      const u = i / (w - 1);
      let k = u < 0.3 ? 3 : u < 0.72 ? 2 : 1;
      if (hash(x + i, y >> 2, 701) < 0.05) k--;
      let c = BASALT[k];
      if (bayer(x + i, y) < (low - 0.55) * 0.9) c = mix(c, LAVA[1], 0.28);
      p.set(x + i, y, c);
    }
  }
  // Joints across the column.
  for (let jy = top + rng.int(10, 30); jy < base - 6; jy += rng.int(14, 34)) {
    p.rect(x + 1, jy, w - 2, 1, BASALT[0]);
    p.rect(x + 1, jy + 1, w - 2, 1, BASALT[4]);
  }
  // The hexagonal cap, seen slightly from above.
  p.rect(x, top - 2, w, 2, BASALT[4]);
  p.rect(x + 1, top - 3, w - 2, 1, BASALT[5]);
  p.rect(x + Math.round(w * 0.3), top - 2, Math.round(w * 0.42), 1, BASALT[5]);
  if (h > 24 && rng.chance(0.35)) {
    // A magma crack running down it.
    let cx = x + rng.int(2, w - 3);
    for (let y = top + rng.int(4, 12); y < base - 2; y++) {
      if (y % 3 === 0) cx = Math.min(x + w - 2, Math.max(x + 1, cx + rng.int(-1, 1)));
      p.set(cx, y, LAVA[2]);
      p.set(cx + 1, y, LAVA[0]);
      cracks.push(cx, y);
    }
  }
}

/** Paints the forge; returns the coal flames and the glows (layer coordinates). */
function paintForge(p: Pix, sa: Pix, sb: Pix, rng: Rng, floorTop: number, hwL: number, hwR: number, horizon: number): { coals: [number, number][]; glows: [number, number, number][] } {
  const cx = p.w / 2;
  const left = cx - hwL, right = cx + hwR;
  const base = floorTop - 3;
  const cracks: number[] = [];
  const glows: [number, number, number][] = [];
  const coals: [number, number][] = [];
  // Two rows of column organs, tall toward the sides, leaving the forge clear.
  for (const row of [0, 1]) {
    let x = Math.round(left + rng.range(-4, 4));
    while (x < right - 6) {
      const w = rng.int(9, 14);
      const d = Math.abs(x + w / 2 - cx);
      const edge = Math.min(x - left, right - x - w);
      if (d > 104 - row * 6 && edge > -4) {
        const rise = smooth(100, 300, d);
        let h = row === 0 ? 46 + 110 * rise : 16 + 58 * rise;
        h = (h * (0.7 + 0.6 * noise(x, row * 50, 34, 0, 711)) + rng.range(-6, 6)) * Math.min(1, 0.3 + Math.max(0, edge) / 70);
        if (h > 8) column(p, x, base - (row === 0 ? 6 : 0), w, h, rng, cracks);
      }
      x += w;
    }
    if (row === 0) haze(p, horizon, 0.14);
  }
  // The dais: three steps trimmed in brass.
  const fx = Math.round(cx + rng.range(-8, 8));
  let daisTop = base;
  for (const w of [176, 140, 108]) {
    const y0 = daisTop - 6;
    p.rect(fx - w / 2, y0, w, 6, BASALT[2]);
    p.rect(fx - w / 2, y0, w, 1, BRASS[2]);
    p.rect(fx - w / 2, y0 + 1, w, 1, BRASS[0]);
    p.rect(fx - w / 2, y0 + 5, w, 1, BASALT[0]);
    for (let x = fx - w / 2 + 6; x < fx + w / 2 - 4; x += 12) p.set(x, y0 + 3, BRASS[1]);
    daisTop = y0;
  }
  // The furnace: a stepped block with a glowing mouth and a chimney.
  const bw = 96, bh = 86, by = daisTop - bh;
  for (let y = by; y < daisTop; y++) {
    const inset = Math.round(Math.max(0, by + 34 - y) * 0.42);
    for (let x = fx - bw / 2 + inset; x < fx + bw / 2 - inset; x++) {
      const u = (x - (fx - bw / 2 + inset)) / (bw - 2 * inset);
      let c = u < 0.12 ? BASALT[3] : u > 0.88 ? BASALT[1] : BASALT[2];
      const course = (y - by) % 9 === 0;
      const joint = ((x + (((y - by) / 9) | 0) * 7) % 15) === 0;
      if (course || joint) c = BASALT[1];
      p.set(x, y, c);
    }
  }
  // Brass bands at each setback.
  for (const yb of [by + 12, by + 34]) {
    const inset = Math.round(Math.max(0, by + 34 - yb) * 0.42);
    p.rect(fx - bw / 2 + inset, yb, bw - 2 * inset, 2, BRASS[1]);
    p.rect(fx - bw / 2 + inset, yb, bw - 2 * inset, 1, BRASS[3]);
  }
  // A rune band that glows with the fire inside.
  for (let x = fx - 30; x < fx + 30; x++) {
    const k = (x - fx + 30) % 10;
    const ry = by + 22;
    if (k < 6) {
      const dy = k < 3 ? k : 5 - k;
      p.set(x, ry + dy, LAVA[2]);
      cracks.push(x, ry + dy);
    } else if (k === 8) { p.set(x, ry + 1, LAVA[3]); cracks.push(x, ry + 1); }
  }
  // Chimney.
  const chTop = Math.max(8, by - 52);
  for (let y = chTop; y < by + 4; y++) for (let x = fx - 9; x < fx + 9; x++) {
    const u = (x - fx + 9) / 17;
    p.set(x, y, u < 0.2 ? IRON[2] : u > 0.8 ? IRON[0] : IRON[1]);
  }
  for (let y = chTop + 6; y < by; y += 12) { p.rect(fx - 10, y, 20, 2, BRASS[1]); p.rect(fx - 10, y, 20, 1, BRASS[2]); }
  p.rect(fx - 12, chTop - 3, 24, 4, IRON[2]);
  p.rect(fx - 12, chTop - 3, 24, 1, IRON[3]);
  p.rect(fx - 8, chTop - 1, 16, 1, LAVA[3]);
  glows.push([fx, chTop - 2, 14]);
  for (let i = 0; i < 5; i++) smoke(p, fx + i * 5 + Math.sin(i) * 3, chTop - 8 - i * 9, 6 + i * 2.5, 4 + i * 1.6, 0.8 - i * 0.15, 760 + i);
  // The mouth: a pointed arch roaring with fire.
  const mw = 21, mTop = by + 36, mBot = daisTop - 20;
  for (let y = mTop - 3; y <= mBot + 2; y++) for (let x = fx - mw - 3; x <= fx + mw + 3; x++) {
    const dx = Math.abs(x + 0.5 - fx) / mw;
    const archTop = mTop + 14 * dx ** 1.2;
    const inside = dx < 1 && y >= archTop && y <= mBot;
    const rim = !inside && Math.abs(x + 0.5 - fx) < mw + 3 && y >= archTop - 3 && y <= mBot + 2;
    if (inside) {
      const t = (y - archTop) / Math.max(1, mBot - archTop);
      let c = tone(LAVA, 0.2 + t * 0.75 - dx * 0.35, x, y, 0.22);
      if (y > mBot - 4) c = hash(x, y, 771) < 0.3 ? LAVA[5] : hash(x, y, 772) < 0.4 ? CRUST[2] : LAVA[3];
      p.set(x, y, c);
    } else if (rim) p.set(x, y, y < archTop - 1 ? BRASS[2] : BRASS[1]);
  }
  // Grille bars.
  for (const ox of [-10, 0, 10]) for (let y = mTop + 2; y < mBot - 4; y++) p.set(fx + ox, y, IRON[0]);
  for (const ox of [-12, -1, 10]) coals.push([fx + ox + 1, mBot - 1]);
  glows.push([fx, mBot - 10, 46]);
  // The anvil on the top step, an ingot glowing on it.
  const at = daisTop - 16;
  p.poly([fx - 18, at, fx - 32, at + 1, fx - 18, at + 5], IRON[2]);
  p.rect(fx - 18, at, 38, 5, IRON[2]);
  p.rect(fx - 30, at, 50, 1, IRON[3]);
  p.rect(fx - 9, at + 5, 20, 6, IRON[1]);
  p.poly([fx - 17, daisTop, fx - 9, at + 10, fx + 11, at + 10, fx + 19, daisTop], IRON[1]);
  p.rect(fx - 16, daisTop - 2, 34, 2, IRON[2]);
  p.rect(fx - 5, at - 2, 12, 2, LAVA[3]);
  p.rect(fx - 4, at - 2, 10, 1, LAVA[4]);
  cracks.push(fx - 5, at - 1, fx - 1, at - 1, fx + 3, at - 1);
  // A giant's hammer leaning on the dais.
  const hx = fx + 66;
  for (let k = 0; k < 44; k++) {
    const x = Math.round(hx - k * 0.32), y = base - 1 - k;
    p.set(x, y, WOOD[1]); p.set(x + 1, y, WOOD[0]);
  }
  p.rect(hx - 22, base - 52, 22, 10, IRON[2]);
  p.rect(hx - 22, base - 52, 22, 1, IRON[3]);
  p.rect(hx - 22, base - 43, 22, 1, IRON[0]);
  p.rect(hx - 13, base - 52, 3, 10, BRASS[1]);
  // Chains from the furnace to the columns either side.
  for (const s of [-1, 1]) {
    const x0 = fx + s * (bw / 2 - 18), y0 = by + 8;
    const x1 = fx + s * 142, y1 = base - 58;
    const sag = 22;
    const steps = Math.ceil(Math.abs(x1 - x0) * 1.3);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t + sag * Math.sin(Math.PI * t));
      p.set(x, y, (i >> 1) & 1 ? IRON[3] : IRON[1]);
      if ((i >> 1) & 1) p.set(x, y + 1, IRON[2]);
    }
    // Braziers at the dais's front corners.
    const bx = fx + s * 80;
    p.poly([bx - 7, base - 10, bx + 7, base - 10, bx + 4, base - 5, bx - 4, base - 5], IRON[1]);
    p.rect(bx - 7, base - 10, 14, 1, BRASS[2]);
    p.rect(bx - 1, base - 5, 2, 5, IRON[1]);
    p.rect(bx - 4, base - 1, 8, 1, IRON[2]);
    p.rect(bx - 5, base - 11, 10, 1, LAVA[3]);
    coals.push([bx, base - 10]);
    glows.push([bx, base - 14, 16]);
  }
  // Rubble, ash, obsidian shards and sulfur along the edge.
  const band = new Pix(p.w, 26);
  const yb = band.h - 1;
  for (let x = left + rng.range(0, 6); x < right; x += rng.range(5, 12)) {
    const edge = Math.min(x - left, right - x);
    if (edge < 3) continue;
    const r = rng.range(2, 5) * Math.min(1, 0.4 + edge / 60);
    const kind = rng.next();
    if (kind < 0.18 && Math.abs(x - fx) > 60) {
      // Obsidian shards.
      for (let k = 0; k < 3; k++) {
        const sx = x + k * 3 - 3, sh = rng.range(5, 13) * Math.min(1, 0.4 + edge / 60);
        band.poly([sx - 2, yb + 1, sx + rng.range(-2, 2), yb - sh, sx + 2, yb + 1], OBSIDIAN[1 + (k & 1)]);
        band.set(Math.round(sx), Math.round(yb - sh * 0.6), OBSIDIAN[4]);
        band.set(Math.round(sx), Math.round(yb - sh * 0.4), OBSIDIAN[3]);
      }
    } else if (kind < 0.3) {
      // Ash heap.
      for (let y = Math.floor(yb - r); y <= yb; y++) for (let xx = Math.floor(x - r * 2.2); xx <= x + r * 2.2; xx++) {
        const u = (xx - x) / (r * 2.2), v = (yb - y) / r;
        if (u * u + v < 1) band.set(xx, y, tone(ASH, 0.6 - v * 0.2 - u * 0.2, xx, y));
      }
    } else if (kind < 0.36) {
      // A vent crusted with sulfur.
      band.rect(x - 4, yb - 1, 9, 2, SULFUR[0]);
      band.rect(x - 3, yb - 2, 7, 1, SULFUR[1]);
      band.rect(x - 1, yb - 1, 3, 1, LAVA[3]);
      glows.push([x, floorTop - 2, 10]);
    } else {
      for (let y = Math.floor(yb - r * 1.6); y <= yb; y++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
        const u = (xx + 0.5 - x) / r, v = (y + 0.5 - (yb - r * 0.6)) / r;
        if (u * u + v * v <= 1) band.set(xx, y, tone(BASALT, 0.55 - v * 0.3 + u * 0.15, xx, y));
      }
    }
  }
  band.outline(INK);
  p.blit(band, 0, floorTop - band.h + 1);
  p.outline(INK);
  occlude(p, 6, 14, 0.4, 0x080410);
  // Magma shimmer: half the cracks brighten on one frame, the other half on the next.
  for (let i = 0; i < cracks.length; i += 2) {
    const x = cracks[i], y = cracks[i + 1];
    (hash(x, y, 791) < 0.5 ? sa : sb).set(x, y, hash(x, y, 792) < 0.3 ? LAVA[4] : LAVA[3]);
  }
  return { coals, glows };
}

// --- Floor and the platform's front ------------------------------------------------------

const SQ3 = Math.sqrt(3);
/** Hex edge normals for pointy-top hexes, and their length in floor pixels (v rows are 2.6 units deep). */
const NORMALS = [0, 60, 120].map((deg) => {
  const a = (deg * Math.PI) / 180, nx = Math.cos(a), nz = Math.sin(a);
  return { nx, nz, px: Math.hypot(nx, nz * 2.6) };
});

/**
 * The floor: tops of hex basalt columns with dark joints, some joints glowing
 * with magma underneath, a brass forge ring in the middle. Cut along the
 * columns at the sides, transparent past them (the lava shows).
 */
function paintHexFloor(w: number, h: number, D: number, vTop: number, edgeAt: (v: number, side: number) => number, lipAt: (u: number) => number): Pix {
  const p = new Pix(w, h);
  const cx = w / 2, R = 13, ap = (R * SQ3) / 2;
  const zMid = D * 2.6;
  const hexOf = (u: number, z: number): [number, number] => {
    const q = ((SQ3 / 3) * u - z / 3) / R, r = ((2 / 3) * z) / R;
    let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
    const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry + q + r);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy <= dz) rz = -rx - ry;
    return [rx, rz];
  };
  const centre = (q: number, r: number): [number, number] => [R * SQ3 * (q + r / 2), R * 1.5 * r];
  const kept = (cu: number, cz: number) => {
    const v = cz / 2.6, e = edgeAt(v, cu < 0 ? -1 : 1);
    return e > 0 && Math.abs(cu) + R * 0.4 < e;
  };
  for (let v = 0; v < h; v++) {
    const z = v * 2.6;
    for (let x = 0; x < w; x++) {
      const du = x + 0.5 - cx;
      const [q, r] = hexOf(du, z);
      const [cu, cz] = centre(q, r);
      if (!kept(cu, cz)) continue;
      const lu = du - cu, lz = z - cz;
      // Distance to the nearest joint, in floor pixels, and the column across it.
      let edge = Infinity, nb: [number, number] = [cu, cz];
      for (const n of NORMALS) {
        const d = lu * n.nx + lz * n.nz;
        const e = (ap - Math.abs(d)) / n.px;
        if (e < edge) { edge = e; nb = [cu + Math.sign(d) * 2 * ap * n.nx, cz + Math.sign(d) * 2 * ap * n.nz]; }
      }
      const lip = lipAt(du);
      if (v < lip) {
        // The column sides showing through the ragged front lip.
        const col = Math.floor((du + 4000) / 11);
        p.set(x, v, (du + 4000) % 11 < 1 ? BASALT[0] : bayer(x, v) < (lip - v) / 5 ? BASALT[1] : BASALT[2]);
        if (hash(col, v, 801) < 0.04) p.set(x, v, LAVA[1]);
        continue;
      }
      const outer = !kept(nb[0], nb[1]);
      const cell = hash(q, r, 803);
      const vein = noise(du, z, 80, 80, 805) > 0.6;
      let c: number;
      if (edge < 1) {
        c = outer ? BASALT[5] : vein ? (edge < 0.45 ? LAVA[4] : LAVA[2]) : INK;
      } else {
        let k = cell < 0.3 ? 2 : cell < 0.8 ? 3 : 4;
        const grain = noise(du, z, 5, 5, 807) + (bayer(x, v) - 0.5) * 0.3;
        if (grain < 0.3) k--;
        else if (grain > 0.82) k++;
        // Bevel: the near rim catches the lava light, the far one is in shade.
        if (edge < 2.3) k += lz < 0 ? 1 : -1;
        c = BASALT[Math.max(1, Math.min(5, k))];
        if (edge < 2.3 && lz < 0 && !outer) c = mix(c, LAVA[2], 0.22);
        if (vein && edge < 2.6) c = mix(c, LAVA[1], 0.45);
        // A few columns cracked open, magma in the cracks (kept off the line the fighters walk).
        if (cell > 0.95 && Math.abs(cz - zMid) > R * 1.2) {
          const cr = Math.abs(noise(lu, lz, 6, 6, 809) - 0.5);
          if (cr < 0.07) c = cr < 0.03 ? LAVA[4] : LAVA[2];
        }
        const ash = noise(du, z, 46, 46, 811);
        if (ash > 0.66 && bayer(x, v) < (ash - 0.66) * 4) c = ASH[1 + (hash(x, v, 813) < 0.3 ? 1 : 0)];
        if (hash(x, v, 815) < 0.003) c = SULFUR[1];
      }
      p.set(x, v, c);
    }
  }
  // The forge ring around the middle: brass inlay with glowing runes between the rings.
  for (let v = 0; v < h; v++) {
    const z = v * 2.6;
    for (let x = Math.floor(cx - 80); x < cx + 80; x++) {
      if (!p.has(x, v) || v < lipAt(x - cx) + 1) continue;
      const du = x + 0.5 - cx, lz = z - zMid;
      const d = Math.hypot(du, lz);
      if (d < 1) continue;
      const g = Math.hypot(du / d, (lz / d) * 2.6);
      const r1 = Math.abs(d - 68) / g, r2 = Math.abs(d - 58) / g;
      if (r1 < 0.6 || r2 < 0.6) p.set(x, v, hash(x, v, 821) < 0.2 ? BRASS[3] : BRASS[2]);
      else if (d > 60 && d < 66) {
        const a = Math.atan2(lz, du) / (Math.PI * 2) * 24;
        if (Math.abs(a - Math.round(a)) < 0.12 / Math.max(0.3, Math.abs(du / d))) p.set(x, v, LAVA[3]);
      }
    }
  }
  // Shade under the forge at the back.
  const back = (D * D) / vTop;
  for (let v = Math.floor(D * 1.08); v < h; v++) {
    const k = 0.6 * Math.exp(-((D * D) / v - back) / 3.2);
    if (k < 0.04) continue;
    for (let x = 0; x < w; x++) {
      const c = p.get(x, v);
      if (!(c >>> 24)) continue;
      const kq = Math.floor(k * 4 + bayer(x, v)) / 4;
      if (kq > 0) p.set(x, v, mix(unpackHex(c), 0x0a0610, kq));
    }
  }
  return p;
}

/** The platform's front: hex columns from the lip down into the lava, lit from below. */
function paintColumnFace(p: Pix, rng: Rng, hwL: number, hwR: number, top: number, sink: number): void {
  const cx = p.w / 2;
  const water = top + sink;
  let x = Math.floor(cx - hwL);
  while (x < cx + hwR) {
    const w = rng.int(9, 15);
    const x1 = Math.min(Math.ceil(cx + hwR), x + w);
    for (let xx = x; xx < x1; xx++) {
      const u = (xx - x) / (w - 1);
      for (let y = top; y < Math.min(p.h, water + 4); y++) {
        const low = (y - top) / sink;
        let k = u < 0.28 ? 3 : u < 0.72 ? 2 : 1;
        if (xx === x) k = 0;
        if (hash(xx, y >> 2, 831) < 0.05) k = Math.max(0, k - 1);
        let c = BASALT[k];
        // Shade tucked in under the floor's edge, lava light growing toward the bottom.
        if (y < top + 4 && bayer(xx, y) < 0.6 - (y - top) * 0.15) c = BASALT[0];
        if (bayer(xx, y) < low * low * 1.1) c = mix(c, LAVA[2], 0.2 + low * 0.25);
        p.set(xx, y, c);
      }
    }
    // A joint across the column, at its own height.
    const jy = top + rng.int(7, sink - 6);
    p.rect(x + 1, jy, w - 2, 1, BASALT[0]);
    p.rect(x + 1, jy + 1, w - 2, 1, mix(BASALT[3], LAVA[1], 0.3));
    x = x1;
  }
  p.outline(INK);
  // No ink along the lip: the floor's edge meets the columns there.
  p.data.fill(0, (top - 1) * p.w, top * p.w);
}

// --- Props -----------------------------------------------------------------------------

/** An obsidian obelisk banded in brass, a fire bowl on top, marking each end of the arena. */
function paintObelisk(): Pix {
  const w = 30, h = 120;
  const p = new Pix(w, h);
  const top = 14;
  for (let y = top; y < h - 8; y++) {
    const f = (y - top) / (h - top);
    const half = 5 + f * 4;
    const xl = Math.round(w / 2 - half), xr = Math.round(w / 2 + half);
    for (let x = xl; x <= xr; x++) {
      const u = (x - xl) / Math.max(1, xr - xl);
      let c = u < 0.45 ? OBSIDIAN[1] : u < 0.55 ? OBSIDIAN[2] : OBSIDIAN[0];
      if (u > 0.45 && u < 0.52 && hash(x, y >> 3, 851) < 0.5) c = OBSIDIAN[3];
      if (u < 0.12) c = OBSIDIAN[2];
      p.set(x, y, c);
    }
  }
  // Glowing rune channel down the face.
  for (let y = top + 16; y < h - 24; y++) {
    const k = (y - top - 16) % 14;
    if (k > 10) continue;
    const glyph = Math.floor((y - top - 16) / 14) % 3;
    const dx = glyph === 0 ? (k < 5 ? k : 10 - k) - 2 : glyph === 1 ? (k === 5 ? 2 : 0) : (k < 3 ? -1 : 1);
    p.set(w / 2 - 2 + dx, y, LAVA[3]);
    p.set(w / 2 - 1 + dx, y, LAVA[1]);
  }
  // Brass bands, a basalt plinth and the fire bowl.
  for (const by of [top + 4, h - 26]) { p.rect(6, by, 18, 3, BRASS[1]); p.rect(6, by, 18, 1, BRASS[3]); p.rect(6, by + 2, 18, 1, BRASS[0]); }
  p.rect(3, h - 8, 24, 8, BASALT[2]); p.rect(3, h - 8, 24, 1, BASALT[4]); p.rect(3, h - 1, 24, 1, BASALT[0]);
  p.rect(5, top - 4, 20, 4, IRON[1]); p.rect(5, top - 4, 20, 1, IRON[3]);
  p.poly([3, 0, 27, 0, 22, 9, 8, 9], IRON[1]);
  p.rect(3, 0, 24, 1, BRASS[2]);
  p.rect(9, 3, 12, 1, BRASS[1]);
  p.rect(5, 1, 20, 1, LAVA[3]);
  p.outline(INK);
  return p;
}

/** A forked bolt of volcanic lightning, with a soft violet halo. */
function paintBolt(rng: Rng): Pix {
  const w = 34, h = 64;
  const p = new Pix(w, h);
  const walk = (x: number, y: number, len: number) => {
    for (let k = 0; k < len && y < h; k++) {
      for (const dx of [-1, 1]) if (!p.has(x + dx, y)) p.set(x + dx, y, 0x9a7aff, 110);
      p.set(x, y, 0xfff4ff);
      y++;
      if (k % 3 === 2) x = Math.max(2, Math.min(w - 3, x + rng.int(-2, 2)));
    }
    return [x, y];
  };
  const [fx, fy] = walk(w >> 1, 0, rng.int(20, 30));
  walk(fx, fy, rng.int(20, 34));
  walk(fx, fy, rng.int(10, 18));
  return p;
}
