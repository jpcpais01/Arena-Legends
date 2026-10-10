import { Rng } from '../core/rng';
import { ARENA_HALF_WIDTH } from '../sim/constants';
import { mix, unpackHex } from './pixel/color';
import { bayer, Pix } from './pixel/paint';
import { PPM } from './sprite/animator';
import type { ArenaArt, Cosmos, Floater, Layer, Theme } from './arenaArt';
import { haze, hash, noise, occlude, tone } from './scenery';

/**
 * Astral Sanctum: the duel happens on a polished star-stone disc floating in
 * deep space, under a nebula and a ringed giant. Same parallax +
 * perspective-floor scheme as the other arenas, but kept deliberately quiet:
 * a dark sky with one bright band of stars, a few far islands, and a single
 * focal piece on the back edge (a golden armillary sphere around a captive
 * star). Everything that moves (twinkles, shooting stars, stardust, the
 * star's glow) is drawn live, see `Cosmos` and `ArenaView`.
 *
 * Back to front: space, nebula band, stars, the light-star and the ringed
 * planet · far drifting islands · near crystal islands and floating rocks ·
 * the sanctum's back edge (parapet, spires, the orrery) · star-stone floor ·
 * the disc's rim and its crystal underside hanging into the void.
 */

/** Night stone, deep indigo to moonlit lavender. */
const STONE = [0x07061a, 0x100e2a, 0x1a1840, 0x262456, 0x36346e, 0x4c4a8a];
const MARBLE = [0x0c0b22, 0x13123a, 0x1b1a4a, 0x24235a, 0x302f6c];
const GOLD = [0x4a2e18, 0x8a5e2a, 0xc8963e, 0xf0d082, 0xfff4cc];
const SILVER = [0x3a4466, 0x6a7aa6, 0xa8b8e0, 0xe8f0ff];
const VIOLET = [0x2a1450, 0x5a2a8a, 0x9a54c8, 0xd8a0f0, 0xfbe4ff];
const TEAL = [0x0e3a52, 0x1e6e8a, 0x3ab0c8, 0x8ef0f0, 0xe8ffff];
const PLANET = [0x2a2e6a, 0x3c4a8e, 0x5a6eb4, 0x8a98d4, 0xb8b4e4, 0xa8789e];
const RING = [0x4a4a7e, 0x7a76aa, 0xb0a8d6, 0xdcd4f0];
const INK = 0x04030c;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildCosmos(theme: Theme, W: number, H: number, gy: number, travel: number, seed: number): ArenaArt {
  const rng = new Rng(seed + 307);
  const wallFactor = 0.78;
  const floorTop = gy - 22;
  const hy = gy - 22 / (1 - wallFactor);
  const D = gy - hy;
  const lipY = gy + 10;
  const sLip = (lipY + 0.5 - hy) / D;
  const vLip = D / sLip;
  const vTop = D / ((floorTop + 0.5 - hy) / D);
  // The disc seen from above: a clean rounded slab, no wobble.
  const E = (ARENA_HALF_WIDTH + 2.4) * PPM;
  const vc = (vLip + vTop) / 2 - 4, rv = (vTop - vLip) / 2 + 16;
  const edgeAt = (v: number) => {
    const k = Math.abs(v - vc) / rv;
    return k >= 1 ? 0 : E * Math.pow(1 - k ** 4, 1 / 4);
  };
  const lipEnd = edgeAt(vLip);
  const lipAt = (u: number) => {
    const corner = Math.max(0, 1 - (lipEnd - Math.abs(u)) / 24);
    return vLip + 0.5 + corner * corner * 10;
  };
  const hz = gy - 46;
  const lw = (f: number) => Math.ceil(W + 2 * travel * f + 8);
  const glows: Cosmos['glows'] = [];
  const glow = (layer: Pix, factor: number, y0: number, x: number, y: number, r: number, color: number) =>
    glows.push({ x: x - (layer.w - W) / 2, y: y0 + y, factor, r, color });

  const sun: [number, number] = [W * theme.body.x, hz * theme.body.y];
  const space = paintSpace(W, H, hz, theme.sky, sun, rng);
  glows.push({ x: sun[0], y: sun[1], factor: 0, r: 34, color: 0xb8c8ff });

  const far = new Pix(lw(0.08), hz + 30);
  const fog = mix(theme.sky[4], VIOLET[0], 0.35);
  for (let x = rng.range(20, 90); x < far.w; x += rng.range(130, 210)) {
    paintIsle(far, rng, x, rng.range(hz * 0.4, hz * 0.95), rng.range(12, 26), 0.62, fog, false);
  }

  const mid = new Pix(lw(0.28), floorTop + 30);
  for (const side of [-1, 1]) {
    // Kept off the middle, so the fight reads against open sky.
    const x = mid.w / 2 + side * (W * 0.36 + rng.range(10, 70));
    const tips = paintIsle(mid, rng, x, rng.range(hz - 110, hz - 50), rng.range(44, 70), 0.22, fog, true);
    for (const [tx, ty, c] of tips) glow(mid, 0.28, 0, tx, ty, 10, c);
    if (travel > 40) {
      const x2 = x + side * rng.range(200, 280);
      const tips2 = paintIsle(mid, rng, x2, rng.range(hz - 70, hz - 10), rng.range(30, 48), 0.3, fog, rng.chance(0.6));
      for (const [tx, ty, c] of tips2) glow(mid, 0.28, 0, tx, ty, 9, c);
    }
  }
  occlude(mid, 5, 10, 0.3, 0x05040e);

  const wall = new Pix(lw(wallFactor), floorTop + 1);
  const twA = new Pix(wall.w, wall.h), twB = new Pix(wall.w, wall.h);
  const half = Math.min(edgeAt(vTop) * wallFactor, wall.w / 2 - 8);
  for (const [x, y, r, c] of paintSanctum(wall, twA, twB, rng, floorTop, half)) glow(wall, wallFactor, 0, x, y, r, c);

  const floor = paintStarFloor(Math.ceil(W / 0.65 + 2 * travel * 1.6 + 64), Math.ceil(D) * 2, D, vTop, edgeAt, lipAt);

  // The disc's rim and the crystal-veined rock it stands on, hanging into the void.
  const lift = 1;
  const under = new Pix(lw(sLip), Math.max(12, H - lipY + lift + 10));
  for (const [x, y, c] of paintUnderside(under, rng, lipEnd * sLip, lift)) glow(under, sLip, lipY - lift, x, y, 12, c);

  for (const sd of [-1, 1]) glows.push({ x: W / 2 + sd * (ARENA_HALF_WIDTH + 0.75) * PPM, y: gy - 104 - 12, factor: 1, r: 22, color: 0xc8d8ff });

  // Rocks drifting around the disc: a couple behind its back corners, a couple below the rim.
  const floaters: Floater[] = [];
  for (const side of [-1, 1]) {
    floaters.push({
      pix: paintChunk(rng, rng.range(10, 18), fog, 0.2), factor: 0.6, front: false, phase: rng.range(0, 6),
      x: W / 2 + side * (edgeAt(vTop) * 0.6 + rng.range(40, 110)), y: rng.range(hz - 50, floorTop - 10),
    });
    floaters.push({
      pix: paintChunk(rng, rng.range(7, 13), fog, 0), factor: sLip, front: true, phase: rng.range(0, 6),
      x: W / 2 + side * (lipEnd * sLip + rng.range(30, 80)), y: lipY + rng.range(6, 40),
    });
  }

  const L = (pix: Pix, factor: number, y = 0): Layer => ({ pix, factor, y });
  return {
    theme, gy, hy, floorTop, wallFactor,
    layers: [
      { ...L(space.pix, 0), after: 'stars' }, L(far, 0.08), { ...L(mid, 0.28), after: 'floaters' }, L(wall, wallFactor),
    ],
    front: [L(under, sLip, lipY - lift)],
    floorEnd: lipY,
    crowd: [twA, twB], crowdLayer: L(twA, wallFactor), floor, torches: [],
    pillar: paintColumn(),
    crystal: paintStar(),
    cycle: null, floaters, ambience: null, heat: null,
    cosmos: {
      twinkle: space.twinkle, glows,
      meteorBand: [Math.round(hz * 0.04), Math.round(hz * 0.7)],
      tint: 0x2a2470,
    },
  };
}

// --- Space --------------------------------------------------------------------------

/**
 * Smooth (undithered) deep-space sky: black at the top and in the void below,
 * a faint glow around the arena's horizon, one diagonal band of nebula and
 * dense stars with dark dust lanes, a bright light-star with diffraction
 * spikes, and a ringed gas giant lit from that star. Returns the bright stars
 * that twinkle at runtime.
 */
function paintSpace(W: number, H: number, hz: number, stops: number[], sun: [number, number], rng: Rng): { pix: Pix; twinkle: number[] } {
  const p = new Pix(W, H);
  const n = stops.length - 1;
  // The galactic band, from low on the left to high on the right.
  const ax = -0.05 * W, ay = hz * 1.12, bx = 1.05 * W, by = hz * 0.02;
  const bl = Math.hypot(bx - ax, by - ay), dx = (bx - ax) / bl, dy = (by - ay) / bl;
  const bw = Math.max(40, hz * 0.3);
  const band = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let base: number;
    if (y <= hz) {
      const t = Math.pow(y / hz, 1.4) * n, i = Math.min(n - 1, Math.floor(t));
      base = mix(stops[i], stops[i + 1], t - i);
    } else base = mix(stops[n], stops[0], smooth(0, 1, (y - hz) / Math.max(1, H - hz)) * 0.8);
    for (let x = 0; x < W; x++) {
      const rx = x - ax, ry = y - ay;
      const along = rx * dx + ry * dy, perp = (rx * dy - ry * dx) / bw;
      const bf = Math.exp(-perp * perp * 1.5);
      band[y * W + x] = bf;
      let c = base;
      if (bf > 0.02) {
        const f = noise(x, y, 70, 46, 1301) * 0.5 + noise(x, y, 26, 20, 1302) * 0.32 + noise(x, y, 9, 8, 1303) * 0.18;
        const d = bf * smooth(0.3, 0.85, f);
        const hue = noise(x, y, 150, 110, 1304);
        const col = mix(mix(VIOLET[1], TEAL[1], hue), mix(VIOLET[2], TEAL[2], hue), smooth(0.2, 0.9, d));
        c = mix(c, col, d * 0.78);
        c = mix(c, 0xf2dcff, smooth(0.7, 1, d) * 0.22);
        // Dust lanes stretched along the band.
        const wa = along + (noise(x, y, 40, 40, 1306) - 0.5) * 50, wp = perp * bw + (noise(x, y, 30, 30, 1307) - 0.5) * 16;
        const lane = smooth(0.6, 0.8, noise(wa, wp, 70, 14, 1305)) * smooth(0.35, 0.6, noise(x, y, 90, 70, 1308)) * bf;
        c = mix(c, 0x020108, lane * 0.55);
      }
      // The light-star's halo.
      const sd = Math.hypot(x - sun[0], y - sun[1]);
      if (sd < 70) c = mix(c, 0x8ea4ff, ((70 - sd) / 70) ** 2.6 * 0.42);
      p.set(x, y, c);
    }
  }
  // Star dust grain in the band.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const bf = band[y * W + x];
    if (hash(x, y, 1311) < bf * 0.07) p.set(x, y, mix(unpackHex(p.get(x, y)), 0xdce4ff, 0.18 + hash(x, y, 1312) * 0.22));
  }
  // Stars: mostly faint, a few bright, crowding toward the band.
  const twinkle: number[] = [];
  const hot = [0xa8bcff, 0xd8e4ff, 0xffffff, 0xfff0d8, 0xffd8b0];
  const count = Math.round((W * H) / 48);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng.range(0, W)), y = Math.floor(rng.range(0, H));
    const bf = band[y * W + x];
    if (rng.next() > 0.45 + 0.55 * bf) continue;
    const b = rng.next() ** 3;
    const col = hot[Math.floor(rng.next() * hot.length)];
    const under = unpackHex(p.get(x, y));
    p.set(x, y, mix(under, col, 0.22 + 0.78 * b));
    if (b > 0.55) {
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        p.set(x + ox, y + oy, mix(unpackHex(p.get(x + ox, y + oy)), col, 0.28 * b));
      }
      if (twinkle.length < 120) twinkle.push(x, y, b > 0.8 ? 2 : 1);
    }
  }
  // A handful of hero stars with long cross glints.
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rng.range(10, W - 10)), y = Math.floor(rng.range(6, hz * 0.85));
    p.set(x, y, 0xffffff);
    for (let k = 1; k <= 3; k++) {
      const a = 0.62 - k * 0.17;
      for (const [ox, oy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) p.set(x + ox, y + oy, mix(unpackHex(p.get(x + ox, y + oy)), 0xd8e4ff, a));
    }
    twinkle.push(x, y, 2);
  }
  // Two far galaxies: tilted smudges with a bright core.
  for (let i = 0; i < 2; i++) {
    const gx = rng.range(W * 0.1, W * 0.9), gyy = rng.range(hz * 0.1, hz * 0.7), ang = rng.range(-0.8, 0.8);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let y = Math.floor(gyy - 6); y <= gyy + 6; y++) for (let x = Math.floor(gx - 10); x <= gx + 10; x++) {
      const u = ((x - gx) * ca + (y - gyy) * sa) / 8, v = (-(x - gx) * sa + (y - gyy) * ca) / 2.4;
      const d = u * u + v * v;
      if (d < 1) p.set(x, y, mix(unpackHex(p.get(x, y)), 0xd8c8ff, (1 - d) ** 2 * 0.55));
    }
  }
  // The light-star: core and diffraction spikes.
  const [sx, sy] = [Math.round(sun[0]), Math.round(sun[1])];
  for (let k = 1; k <= 22; k++) {
    const a = (1 - k / 22) ** 1.6 * 0.85;
    for (const [ox, oy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) p.set(sx + ox, sy + oy, mix(unpackHex(p.get(sx + ox, sy + oy)), 0xdce6ff, a));
    if (k <= 7) {
      const b = (1 - k / 7) * 0.45;
      for (const [ox, oy] of [[-k, -k], [k, k], [k, -k], [-k, k]]) p.set(sx + ox, sy + oy, mix(unpackHex(p.get(sx + ox, sy + oy)), 0xb8c8ff, b));
    }
  }
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
    const d = Math.abs(x) + Math.abs(y);
    if (d <= 3) p.set(sx + x, sy + y, d <= 1 ? 0xffffff : mix(unpackHex(p.get(sx + x, sy + y)), 0xe8f0ff, d === 2 ? 0.85 : 0.5));
  }
  // The ringed giant, high on the other side.
  const r = Math.round(Math.max(18, Math.min(42, W * 0.07, H * 0.12)));
  const pcx = Math.round(W * (sun[0] < W / 2 ? 0.8 : 0.2)), pcy = Math.round(hz * 0.36);
  paintPlanet(p, pcx, pcy, r, sun);
  const out: number[] = [];
  for (let i = 0; i < twinkle.length; i += 3) {
    const x = twinkle[i], y = twinkle[i + 1];
    if (Math.abs(x - pcx) < r * 2.4 && Math.abs(y - pcy) < r * 1.3) continue;
    if (Math.hypot(x - sun[0], y - sun[1]) < 26) continue;
    out.push(x, y, twinkle[i + 2]);
  }
  return { pix: p, twinkle: out };
}

/** A banded gas giant lit from the light-star, a tilted ring system and a small moon. */
function paintPlanet(p: Pix, cx: number, cy: number, r: number, sun: [number, number]): void {
  // Light direction: toward the star, a little toward the viewer.
  let lx = sun[0] - cx, ly = -(sun[1] - cy), lz = r * 3;
  const ll = Math.hypot(lx, ly, lz);
  lx /= ll; ly /= ll; lz /= ll;
  const tilt = 0.32 * Math.sign(cx - sun[0]);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const inside = (x: number, y: number) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
  for (let y = cy - r - 3; y <= cy + r + 3; y++) for (let x = cx - r - 3; x <= cx + r + 3; x++) {
    const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r;
    const d2 = nx * nx + ny * ny;
    if (d2 > 1) {
      // Thin atmosphere halo on the lit limb.
      const d = Math.sqrt(d2);
      const lit = (nx * lx - ny * ly) / d;
      if (d < 1 + 2.6 / r && lit > 0.1) p.set(x, y, mix(unpackHex(p.get(x, y)), TEAL[3], 0.45 * lit * (1 - (d - 1) * r / 2.6)));
      continue;
    }
    const nz = Math.sqrt(1 - d2);
    const lam = nx * lx - ny * ly + nz * lz;
    // Bands follow the tilted latitude, warped a little like storms.
    const lat = ny * ct - nx * st;
    const bv = noise(0, lat * r * 0.9 + (noise(nx * r, lat * r, 12, 4, 1351) - 0.5) * 4, 1, 3.4, 1352);
    let c = bv < 0.1 ? PLANET[5] : PLANET[1 + Math.min(3, Math.floor(bv * 4))];
    const step = Math.floor(Math.max(0, lam) * 4 + bayer(x, y) * 0.9);
    c = mix(0x070718, c, Math.min(1, step / 3) * 0.95 + 0.05);
    // Atmosphere: the lit limb goes pale cyan.
    if (d2 > 0.82 && lam > 0) c = mix(c, TEAL[3], smooth(0.82, 1, d2) * 0.55 * Math.min(1, lam * 2));
    p.set(x, y, c);
  }
  // Rings: drawn over the disc in front, hidden behind it at the back.
  const ang = -0.3 * Math.sign(cx - sun[0]) - 0.05, ca = Math.cos(ang), sa = Math.sin(ang);
  const r0 = r * 1.42, r1 = r * 2.25, k = 0.24;
  for (let y = Math.floor(cy - r1); y <= cy + r1; y++) for (let x = Math.floor(cx - r1); x <= cx + r1; x++) {
    const ox = x + 0.5 - cx, oy = y + 0.5 - cy;
    const u = ox * ca + oy * sa, w = -ox * sa + oy * ca;
    const rr = Math.hypot(u, w / k);
    if (rr < r0 || rr > r1) continue;
    if (w < 0 && inside(x, y)) continue;
    const q = (rr - r0) / (r1 - r0);
    if (q > 0.56 && q < 0.62) continue; // the gap
    let c = RING[q < 0.15 ? 1 : q < 0.56 ? 2 + (hash(Math.floor(rr), 0, 1361) < 0.35 ? 1 : 0) : q < 0.85 ? 1 : 0];
    // Lit toward the star, and the planet's shadow falls across the back of the rings.
    const toward = -(ox * Math.sign(cx - sun[0])) / r1;
    c = mix(c, 0x0a0a20, 0.35 - toward * 0.3);
    if (w < 0 && Math.sign(ox) === Math.sign(cx - sun[0]) && Math.abs(oy) < r * 0.9) c = mix(c, 0x05050f, 0.6);
    p.set(x, y, mix(unpackHex(p.get(x, y)), c, 0.82));
  }
  // A small moon.
  const mx = cx - Math.sign(cx - sun[0]) * r * 2.6, my = cy + r * 1.25, mr = Math.max(3, r * 0.12);
  for (let y = Math.floor(my - mr); y <= my + mr; y++) for (let x = Math.floor(mx - mr); x <= mx + mr; x++) {
    const u = (x + 0.5 - mx) / mr, v = (y + 0.5 - my) / mr;
    if (u * u + v * v > 1) continue;
    const lit = -u * Math.sign(cx - sun[0]) - v * 0.4;
    p.set(x, y, lit > 0.2 ? SILVER[2] : lit > -0.3 ? SILVER[1] : 0x141634);
  }
}

// --- Islands ----------------------------------------------------------------------

/**
 * A floating island of night stone: flat moonlit top, tapering jagged
 * underside, hazed by `fog`; with `crystals`, a cluster of glowing crystals
 * on top. Returns the crystal tips (layer coordinates and colour).
 */
function paintIsle(p: Pix, rng: Rng, cx: number, top: number, w: number, fogT: number, fog: number, crystals: boolean): [number, number, number][] {
  const isle = new Pix(Math.ceil(w * 2 + 8), Math.ceil(w * 1.6 + 30));
  const ox = isle.w / 2, oy = 22;
  const seed = Math.floor(rng.range(0, 9999));
  const depth = w * rng.range(0.9, 1.3);
  for (let x = 0; x < isle.w; x++) {
    const u = (x + 0.5 - ox) / w;
    if (Math.abs(u) >= 1) continue;
    const t0 = oy + (noise(x, 0, 9, 0, seed) - 0.5) * 3 + u * u * 3;
    const bot = oy + depth * (1 - Math.abs(u) ** 1.6) ** 0.9 + (noise(x, 0, 4, 0, seed + 1) - 0.5) * 8 * (1 - Math.abs(u));
    for (let y = Math.floor(t0); y < bot; y++) {
      const v = (y - t0) / Math.max(1, bot - t0);
      let c: number;
      if (y - t0 < 2) c = y - t0 < 1 ? STONE[5] : STONE[4];
      else {
        const strata = noise(x * 0.4, y, 6, 3, seed + 2);
        c = tone(STONE, 0.62 - v * 0.5 - u * 0.25 + (strata - 0.5) * 0.25, x, y, 0.16);
        if (hash(x, y >> 2, seed + 3) < 0.03 && v > 0.15) c = VIOLET[1];
      }
      isle.set(x, y, c);
    }
  }
  const tips: [number, number, number][] = [];
  if (crystals) {
    const n = rng.int(3, 5);
    const at = rng.range(-0.45, 0.45) * w;
    for (let i = 0; i < n; i++) {
      const h = rng.range(8, 20) * (i === 0 ? 1.4 : 1) * Math.min(1, w / 50);
      const bx = ox + at + (i - n / 2) * 4 + rng.range(-2, 2), lean = rng.range(-3, 3);
      const pal = rng.chance(0.5) ? VIOLET : TEAL;
      const b0 = oy + 1, cw = 2.5 + h * 0.08;
      isle.poly([bx - cw, b0, bx + lean - 0.5, b0 - h, bx + lean + 0.5, b0 - h, bx + cw, b0], pal[2]);
      isle.poly([bx, b0, bx + lean, b0 - h, bx + cw, b0], pal[1]);
      isle.line(Math.round(bx - 1), b0 - 1, Math.round(bx + lean - 1), Math.round(b0 - h + 2), pal[3]);
      isle.set(Math.round(bx + lean), Math.round(b0 - h), pal[4]);
      tips.push([cx - ox + bx + lean, top - oy + b0 - h * 0.6, pal[3]]);
    }
  }
  isle.outline(INK);
  if (fogT > 0) haze(isle, fog, fogT);
  p.blit(isle, Math.round(cx - ox), Math.round(top - oy));
  return tips;
}

/** A small floating rock with a glint of crystal. */
function paintChunk(rng: Rng, w: number, fog: number, fogT: number): Pix {
  const p = new Pix(Math.ceil(w * 2 + 4), Math.ceil(w * 1.5 + 6));
  const ox = p.w / 2, top = 3, seed = Math.floor(rng.range(0, 9999));
  for (let x = 0; x < p.w; x++) {
    const u = (x + 0.5 - ox) / w;
    if (Math.abs(u) >= 1) continue;
    const t0 = top + u * u * 2 + (noise(x, 0, 5, 0, seed) - 0.5) * 2;
    const bot = top + w * 1.2 * (1 - Math.abs(u) ** 1.4) ** 0.9;
    for (let y = Math.floor(t0); y < bot; y++) {
      const v = (y - t0) / Math.max(1, bot - t0);
      p.set(x, y, y - t0 < 1 ? STONE[5] : tone(STONE, 0.6 - v * 0.5 - u * 0.25, x, y, 0.16));
    }
  }
  const cx = Math.round(ox + rng.range(-w * 0.3, w * 0.3));
  p.set(cx, top, TEAL[3]); p.set(cx, top + 1, TEAL[2]); p.set(cx + 1, top + 1, TEAL[1]);
  p.outline(INK);
  if (fogT > 0) haze(p, fog, fogT);
  return p;
}

// --- The sanctum's back edge ------------------------------------------------------------

/**
 * The back edge: a low gilded parapet with orb lamps, two slender spires with
 * crescent finials at the corners, and the orrery in the middle (a stepped
 * dais, a pedestal and an armillary sphere around a captive star). Twinkles go
 * in `ta`/`tb` (alternate frames). Returns glows: x, y, radius, colour.
 */
function paintSanctum(p: Pix, ta: Pix, tb: Pix, rng: Rng, floorTop: number, half: number): [number, number, number, number][] {
  const cx = p.w / 2;
  const base = floorTop - 2;
  const glows: [number, number, number, number][] = [];
  const twinkle = (x: number, y: number, c: number) => (hash(x, y, 1401) < 0.5 ? ta : tb).set(x, y, c);
  const fx = Math.round(cx);
  // Parapet.
  const left = Math.round(cx - half + 8), right = Math.round(cx + half - 8);
  for (let x = left; x < right; x++) {
    const end = Math.min(x - left, right - 1 - x);
    const h = end < 3 ? 3 + end : 6;
    for (let y = base - h; y <= base; y++) {
      const k = y === base - h ? 4 : y === base - h + 1 ? 2 : (x - left) % 16 === 8 && y === base - 3 ? -1 : 0;
      if (k === 4) p.set(x, y, GOLD[3]);
      else if (k === 2) p.set(x, y, GOLD[1]);
      else if (k === -1) p.set(x, y, SILVER[2]);
      else p.set(x, y, y > base - 2 ? STONE[1] : STONE[2]);
    }
  }
  // Orb lamps on short posts, clear of the orrery.
  for (let x = left + 20; x < right - 16; x += 58) {
    if (Math.abs(x - fx) < 78) continue;
    p.rect(x - 1, base - 13, 3, 8, STONE[3]);
    p.set(x - 1, base - 13, STONE[4]);
    p.rect(x - 2, base - 14, 5, 1, GOLD[2]);
    p.rect(x - 1, base - 17, 3, 3, TEAL[2]);
    p.set(x - 1, base - 17, TEAL[4]); p.set(x, base - 18, TEAL[3]); p.set(x + 1, base - 15, TEAL[1]);
    twinkle(x - 1, base - 17, 0xffffff);
    glows.push([x, base - 16, 9, TEAL[2]]);
  }
  // Spires at the corners, crescent moons on top.
  for (const s of [-1, 1]) {
    const sx = Math.round(cx + s * (half - 34));
    const h = Math.round(rng.range(92, 112));
    for (let y = base - h; y <= base - 4; y++) {
      const t = (y - (base - h)) / h;
      const hw = 1.5 + t * 4.5;
      for (let x = Math.round(sx - hw); x <= Math.round(sx + hw); x++) {
        const u = (x - (sx - hw)) / (2 * hw);
        p.set(x, y, u < 0.3 ? STONE[4] : u < 0.7 ? STONE[3] : STONE[1]);
      }
    }
    for (const t of [0.35, 0.62, 0.86]) {
      const y = Math.round(base - h + t * h), hw = Math.round(2 + t * 4.5);
      p.rect(sx - hw, y, hw * 2 + 1, 1, GOLD[2]);
      p.rect(sx - hw, y + 1, hw * 2 + 1, 1, GOLD[0]);
    }
    p.rect(sx - 8, base - 4, 17, 4, STONE[2]);
    p.rect(sx - 8, base - 4, 17, 1, GOLD[2]);
    // Crescent: a disc minus a shifted disc.
    const my = base - h - 7;
    for (let y = my - 6; y <= my + 6; y++) for (let x = sx - 6; x <= sx + 6; x++) {
      const a = Math.hypot(x + 0.5 - sx, y + 0.5 - my), b = Math.hypot(x + 0.5 - sx - s * 3, y + 0.5 - my + 2);
      if (a <= 5.6 && b > 4.6) p.set(x, y, a > 4.6 ? GOLD[1] : x * -s < -sx * s ? GOLD[3] : GOLD[2]);
    }
    p.set(sx + s * 2, my - 1, 0xffffff);
    twinkle(sx + s * 2, my - 1, 0xffffff);
    glows.push([sx + s * 2, my - 1, 10, VIOLET[3]]);
  }
  // Dais.
  let top = base;
  for (const w of [118, 90]) {
    const y0 = top - 5;
    p.rect(fx - w / 2, y0, w, 5, STONE[2]);
    p.rect(fx - w / 2, y0, w, 1, GOLD[3]);
    p.rect(fx - w / 2, y0 + 1, w, 1, GOLD[1]);
    p.rect(fx - w / 2, y0 + 4, w, 1, STONE[0]);
    for (let x = fx - w / 2 + 7; x < fx + w / 2 - 4; x += 12) p.set(x, y0 + 2, SILVER[1]);
    top = y0;
  }
  // Pedestal: a tapering shaft with a glowing rune channel.
  const R = 38, cy = top - 30 - R;
  for (let y = cy + R - 2; y < top; y++) {
    const t = (y - (cy + R - 2)) / (top - cy - R + 2);
    const hw = 3 + t * 5;
    for (let x = Math.round(fx - hw); x <= Math.round(fx + hw); x++) {
      const u = (x - (fx - hw)) / (2 * hw);
      p.set(x, y, u < 0.3 ? STONE[4] : u < 0.72 ? STONE[3] : STONE[1]);
    }
    if (y % 4 !== 0) { p.set(fx, y, TEAL[2]); twinkle(fx, y, TEAL[3]); }
  }
  for (const y of [cy + R + 4, top - 4]) {
    const hw = Math.round(3 + ((y - cy - R + 2) / (top - cy - R + 2)) * 5) + 1;
    p.rect(fx - hw, y, hw * 2 + 1, 2, GOLD[2]);
    p.rect(fx - hw, y, hw * 2 + 1, 1, GOLD[3]);
  }
  p.outline(INK);
  occlude(p, 6, 12, 0.35, 0x02010a);
  paintOrrery(p, ta, tb, fx, cy, R);
  glows.push([fx, cy, 46, 0x9ad8ff], [fx, cy, 16, 0xffffff]);
  return glows;
}

type V3 = [number, number, number];
const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * An armillary sphere: great circles of gold seen in 3D (back halves dim, front
 * halves bright), a bigger silver meridian frame, small planets threaded on the
 * ecliptic and a captive star at the heart.
 */
function paintOrrery(p: Pix, ta: Pix, tb: Pix, fx: number, cy: number, R: number): void {
  const back: number[] = [], front: number[] = [];
  const at = (n: V3, r: number, th: number): V3 => {
    const e1 = norm(cross(n, Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]));
    const e2 = cross(n, e1);
    const c = Math.cos(th), s = Math.sin(th);
    return [r * (c * e1[0] + s * e2[0]), r * (c * e1[1] + s * e2[1]), r * (c * e1[2] + s * e2[2])];
  };
  const ring = (nn: V3, r: number, pal: number[], thick: boolean) => {
    const n = norm(nn);
    const steps = Math.ceil(Math.PI * 2 * r * 2.2);
    for (let i = 0; i < steps; i++) {
      const [x, y, z] = at(n, r, (i / steps) * Math.PI * 2);
      const sx = Math.round(fx + x), sy = Math.round(cy - y), zz = z / r;
      const c = zz >= 0 ? pal[zz > 0.45 ? 3 : 2] : pal[zz < -0.45 ? 0 : 1];
      (zz >= 0 ? front : back).push(sx, sy, c, thick ? 1 : 0, zz >= 0 ? pal[1] : pal[0]);
    }
  };
  const ecl: V3 = [0.42, 1, 0.34];
  ring([0.18, 0.4, 1], R * 1.1, SILVER, true);
  ring([0, 1, 0.3], R, GOLD, true);
  ring(ecl, R * 0.94, GOLD, false);
  ring([1, 0.12, 0.42], R * 0.9, GOLD, false);
  ring([-0.7, 0.3, 0.6], R * 0.78, GOLD, false);
  const put = (list: number[]) => {
    for (let i = 0; i < list.length; i += 5) {
      p.set(list[i], list[i + 1], list[i + 2]);
      if (list[i + 3]) p.set(list[i], list[i + 1] + 1, list[i + 4]);
    }
  };
  // Planets on the ecliptic.
  const beads = [[0.4, 3, 0xe08a6a], [1.7, 2, TEAL[3]], [2.9, 2.5, 0xf0d082], [4.1, 3.5, VIOLET[3]], [5.3, 2, SILVER[3]]] as const;
  const bead = (zFront: boolean) => {
    for (const [th, br, col] of beads) {
      const [x, y, z] = at(norm(ecl), R * 0.94, th);
      if ((z >= 0) !== zFront) continue;
      const bx = fx + x, by = cy - y;
      for (let yy = Math.floor(by - br); yy <= by + br; yy++) for (let xx = Math.floor(bx - br); xx <= bx + br; xx++) {
        const u = (xx + 0.5 - bx) / br, v = (yy + 0.5 - by) / br;
        const d = u * u + v * v;
        if (d > 1) continue;
        p.set(xx, yy, d > 0.6 && u + v > 0 ? mix(col, 0x0a0820, 0.55) : u + v < -0.6 ? mix(col, 0xffffff, 0.5) : zFront ? col : mix(col, 0x0a0820, 0.3));
      }
      if (zFront) { const hx = Math.round(bx - br * 0.4), hy = Math.round(by - br * 0.4); (hash(hx, hy, 1411) < 0.5 ? ta : tb).set(hx, hy, 0xffffff); }
    }
  };
  put(back);
  bead(false);
  // The captive star.
  const cr = 8;
  for (let y = cy - cr - 1; y <= cy + cr + 1; y++) for (let x = fx - cr - 1; x <= fx + cr + 1; x++) {
    const d = Math.hypot(x + 0.5 - fx, y + 0.5 - cy) / cr;
    if (d > 1.12) continue;
    if (d > 1) { p.set(x, y, VIOLET[1]); continue; }
    let c = mix(0xffffff, TEAL[3], smooth(0.15, 0.6, d));
    c = mix(c, VIOLET[2], smooth(0.7, 1, d));
    p.set(x, y, c);
  }
  put(front);
  bead(true);
  // Glints on the front of the rings.
  for (let i = 0; i < front.length; i += 5 * 23) {
    if (front[i + 2] === GOLD[3] || front[i + 2] === SILVER[3]) (hash(i, 0, 1413) < 0.5 ? ta : tb).set(front[i], front[i + 1], 0xffffff);
  }
  // The cradle holding the sphere: a gilded arc under it.
  for (let i = 0; i <= 60; i++) {
    const a = Math.PI * (0.18 + 0.64 * (i / 60));
    const x = Math.round(fx + Math.cos(a) * R * 1.2), y = Math.round(cy + Math.sin(a) * R * 1.2);
    p.set(x, y, GOLD[3]);
    p.set(x, y + 1, GOLD[1]);
  }
}

// --- Floor ---------------------------------------------------------------------------

/**
 * The floor: polished star-stone flagstones laid in rings around the centre,
 * a gold-ringed medallion with a silver compass star under the fighters, a
 * zodiac band, a few constellations inlaid in silver, a gilded rim along the
 * edge, and a faint reflection of the captive star at the back. Transparent
 * past the edge (space shows).
 */
function paintStarFloor(w: number, h: number, D: number, vTop: number, edgeAt: (v: number) => number, lipAt: (u: number) => number): Pix {
  const p = new Pix(w, h);
  const cx = w / 2;
  const zMid = D * 2.6;
  const RINGS = [0, 22, 54, 72, 104, 150, 210, 280, 360, 460, 580];
  const sectors = (ri: number) => (ri < 4 ? 1 : ri < 6 ? 16 : ri < 8 ? 24 : 32);
  const ringOf = (r: number) => { let i = 0; while (i < RINGS.length - 1 && r >= RINGS[i + 1]) i++; return i; };
  const reflectZ = (D * D) / vTop * 2.6 - zMid - 14;
  for (let v = 0; v < h; v++) {
    const z = v * 2.6, lz = z - zMid;
    const edge = edgeAt(v);
    const lip = lipAt(0);
    for (let x = 0; x < w; x++) {
      const du = x + 0.5 - cx;
      const e = edge - Math.abs(du);
      if (e <= 0) continue;
      const lipU = lipAt(du);
      if (v < lipU) {
        // The rim's face showing through the curled front corners.
        p.set(x, v, v > lipU - 1.5 ? GOLD[2] : bayer(x, v) < (lipU - v) / 6 ? STONE[1] : STONE[2]);
        continue;
      }
      if (e < 1.2) { p.set(x, v, GOLD[3]); continue; }
      if (e < 2.2) { p.set(x, v, GOLD[1]); continue; }
      if (e < 6) { p.set(x, v, (Math.round(du) % 9 === 0 && e > 3 && e < 5) ? SILVER[1] : STONE[2]); continue; }
      const r = Math.hypot(du, lz);
      const ri = ringOf(r);
      // Pixel-space distance to the ring seams and the sector seams.
      const g = Math.max(1e-3, Math.hypot(du / Math.max(r, 1e-3), (lz / Math.max(r, 1e-3)) * 2.6));
      const dIn = (r - RINGS[ri]) / g, dOut = ri + 1 < RINGS.length ? (RINGS[ri + 1] - r) / g : 99;
      const a = Math.atan2(lz, du);
      const ns = sectors(ri);
      const sf = (a / (Math.PI * 2)) * ns;
      const si = Math.floor(sf);
      const ga = Math.hypot(lz, du * 2.6) / Math.max(1, r * r);
      const dSec = ns > 1 ? (Math.min(sf - si, 1 - (sf - si)) * (Math.PI * 2 / ns)) / Math.max(1e-6, ga) : 99;
      const seam = Math.min(dIn, dOut, dSec);
      let c: number;
      const goldRing = ri === 2 || ri === 3 ? Math.min(dIn, dOut) < 0.7 : false;
      if (goldRing) c = hash(x, v, 1421) < 0.2 ? GOLD[3] : GOLD[2];
      else if (seam < 0.6) c = MARBLE[0];
      else {
        const cell = hash(ri, si, 1423);
        let l = 0.42 + (cell - 0.5) * 0.18 + (lz > 0 ? Math.min(0.12, lz / 500) : 0);
        // Marble veins.
        const vein = Math.abs(noise(du, z, 46, 40, 1425 + ri) - 0.5);
        if (vein < 0.018) l += 0.22;
        // Polished bevel: the near edge of every stone catches a little light.
        if (seam < 1.6 && (dOut === seam || (dSec === seam && lz < 0))) l += 0.12;
        c = tone(MARBLE, l, x, v, 0.1);
        if (vein < 0.01) c = mix(c, SILVER[0], 0.5);
        if (hash(x, v, 1427) < 0.0025) c = SILVER[2];
      }
      if (ri <= 1) {
        // The medallion: an eight-point compass star in silver around a gem.
        const rs = 9 + 13 * Math.pow(Math.abs(Math.cos(a * 4)), 5);
        if (r < rs) {
          const facet = Math.sin(a * 8) > 0;
          c = r < 4 ? (r < 2.2 ? TEAL[4] : TEAL[2]) : facet ? SILVER[2] : SILVER[1];
          if (Math.abs(r - rs) * Math.min(1, 1 / g) < 0.7) c = SILVER[3];
        } else if (ri === 1 && dOut < 1.2) c = SILVER[1];
      } else if (ri === 2 && !goldRing) {
        // The zodiac band: twelve gilded marks.
        const za = (a / (Math.PI * 2)) * 12;
        const zd = Math.abs(za - Math.round(za)) * (Math.PI * 2 / 12) / Math.max(1e-6, ga);
        const mid = (RINGS[2] + RINGS[3]) / 2;
        if (zd < 0.8 && Math.abs(r - mid) / g < 4) c = GOLD[2];
        else if (Math.abs(za - Math.round(za) - 0.5) < 0.02 && Math.abs(r - mid) / g < 1) c = GOLD[1];
      }
      // A soft reflection of the captive star in the polish, at the back.
      const rd = Math.hypot(du / 52, (lz - reflectZ) / 46);
      if (rd < 1 && v >= lip) {
        const k = (1 - rd) ** 2 * 0.5;
        if (bayer(x, v) < k * 1.4) c = mix(c, TEAL[2], 0.35 + k * 0.4);
      }
      p.set(x, v, c);
    }
  }
  // Constellations inlaid in a few of the outer stones: silver lines, stars at the nodes.
  for (let ri = 4; ri < RINGS.length - 1; ri++) {
    const ns = sectors(ri);
    for (let si = 0; si < ns; si++) {
      if (hash(ri, si, 1431) > 0.16) continue;
      const rm = (RINGS[ri] + RINGS[ri + 1]) / 2, am = ((si + 0.5) / ns) * Math.PI * 2;
      const span = Math.min((RINGS[ri + 1] - RINGS[ri]) * 0.3, (rm * Math.PI * 2 / ns) * 0.3);
      const pts: [number, number][] = [];
      const n = 3 + Math.floor(hash(ri, si, 1433) * 3);
      for (let k = 0; k < n; k++) {
        const ox = (hash(ri * 7 + k, si, 1435) - 0.5) * 2 * span, oz = (hash(ri * 7 + k, si, 1437) - 0.5) * 2 * span;
        const du = Math.cos(am) * rm + ox, lz = Math.sin(am) * rm + oz;
        pts.push([Math.round(cx + du), Math.round((lz + zMid) / 2.6)]);
      }
      const ok = (x: number, v: number) => p.has(x, v) && edgeAt(v) - Math.abs(x + 0.5 - cx) > 7 && v >= lipAt(x - cx) + 1;
      for (let k = 1; k < pts.length; k++) {
        const [x0, v0] = pts[k - 1], [x1, v1] = pts[k];
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(v1 - v0));
        for (let s = 0; s <= steps; s++) {
          const x = Math.round(x0 + ((x1 - x0) * s) / Math.max(1, steps)), v = Math.round(v0 + ((v1 - v0) * s) / Math.max(1, steps));
          if (ok(x, v)) p.set(x, v, mix(unpackHex(p.get(x, v)), SILVER[1], 0.6));
        }
      }
      for (const [x, v] of pts) {
        if (!ok(x, v)) continue;
        p.set(x, v, SILVER[3]);
        if (ok(x - 1, v)) p.set(x - 1, v, SILVER[2]);
        if (ok(x + 1, v)) p.set(x + 1, v, SILVER[2]);
      }
    }
  }
  // A gentle shade under the parapet at the back.
  const back = (D * D) / vTop;
  for (let v = Math.floor(D * 1.08); v < h; v++) {
    const k = 0.45 * Math.exp(-((D * D) / v - back) / 2.6);
    if (k < 0.04) continue;
    for (let x = 0; x < w; x++) {
      const c = p.get(x, v);
      if (!(c >>> 24)) continue;
      const kq = Math.floor(k * 4 + bayer(x, v)) / 4;
      if (kq > 0) p.set(x, v, mix(unpackHex(c), 0x04030c, kq));
    }
  }
  return p;
}

// --- The disc's front -------------------------------------------------------------------

/**
 * The rim (polished stone banded in gold) and, under it, the night rock the
 * disc stands on, hanging into the void, crystals glinting in it and dripping
 * from its spurs. Returns where the crystals glow (layer coordinates, colour).
 */
function paintUnderside(p: Pix, rng: Rng, hw: number, lift: number): [number, number, number][] {
  const cx = p.w / 2;
  const band = 7;
  const y0 = lift + band;
  const cone = 150;
  const glows: [number, number, number][] = [];
  // The rim.
  for (let x = Math.floor(cx - hw); x < cx + hw; x++) {
    const end = Math.min(x - (cx - hw), cx + hw - 1 - x);
    for (let y = lift; y < y0; y++) {
      let c = STONE[3];
      if (y === lift + 1) c = GOLD[2];
      else if (y === lift + 2) c = GOLD[0];
      else if (y === y0 - 1) c = STONE[1];
      else if (y === lift + 4 && Math.round(x - cx) % 12 === 0) c = TEAL[2];
      if (end < 3) c = mix(c, STONE[0], 0.4);
      p.set(x, y, c);
    }
  }
  // The rock below, painted column by column: deepest under the middle, its
  // bottom broken into hanging spurs, lit from the light-star's side with a
  // faint violet bounce from the nebula along its lower edge.
  const tip = cx + rng.range(-24, 24);
  const bottom = new Float32Array(p.w);
  for (let x = Math.floor(cx - hw); x < cx + hw; x++) {
    const u = x + 0.5 < tip ? (x + 0.5 - tip) / (tip - cx + hw) : (x + 0.5 - tip) / (cx + hw - tip);
    const a = Math.abs(u);
    const spurs = noise(x, 0, 22, 0, 1441) * 0.7 + noise(x, 0, 8, 0, 1442) * 0.3;
    const depth = cone * (1 - a ** 1.1) ** 1.5 * (0.7 + 0.42 * spurs) + 4;
    const yb = y0 + depth;
    bottom[x] = yb;
    for (let y = y0; y < Math.min(p.h, yb); y++) {
      const v = (y - y0) / cone;
      const strata = noise(x * 0.25, y, 10, 3, 1443);
      let l = 0.5 - v * 0.45 - u * 0.22 + (strata - 0.5) * 0.28;
      if (y < y0 + 3) l -= 0.25;
      let c = tone(STONE, l, x, y, 0.14);
      if (yb - y < 2.5) c = mix(c, VIOLET[1], yb - y < 1.5 ? 0.6 : 0.3);
      p.set(x, y, c);
    }
  }
  // A few crystal seams glinting in the rock.
  for (let i = 0; i < 7; i++) {
    const x = Math.round(cx + rng.range(-hw * 0.75, hw * 0.75));
    const y = Math.round(y0 + 6 + rng.range(0, Math.max(4, bottom[x] - y0 - 14)));
    if (!p.has(x, y) || !p.has(x + 2, y + 3)) continue;
    const pal = i % 2 ? TEAL : VIOLET;
    p.set(x, y, pal[3]); p.set(x + 1, y + 1, pal[2]); p.set(x + 1, y + 2, pal[2]); p.set(x + 2, y + 3, pal[1]);
    glows.push([x + 1, y + 1, pal[2]]);
  }
  // Crystals hanging from the underside, the biggest from the lowest point.
  const drip = (x: number, len: number, pal: number[]) => {
    const xi = Math.round(x);
    const y = Math.round(bottom[xi] ?? y0) - 2;
    const w = 1.5 + len * 0.13;
    p.poly([x - w, y, x + w, y, x + 0.5, y + len], pal[2]);
    p.poly([x + 0.3, y, x + w, y, x + 0.5, y + len], pal[1]);
    p.line(Math.round(x - w + 1), y + 1, Math.round(x), Math.round(y + len - 2), pal[3]);
    glows.push([x, y + len * 0.4, pal[2]]);
  };
  let low = Math.round(tip);
  for (let x = Math.round(cx - hw * 0.3); x < cx + hw * 0.3; x++) if (bottom[x] > bottom[low]) low = x;
  drip(low + 0.5, 24, VIOLET);
  drip(low - 6.5, 11, TEAL);
  for (let i = 0; i < 5; i++) {
    const x = cx + rng.range(-hw * 0.8, hw * 0.8);
    if (Math.abs(x - low) < 14) continue;
    drip(x, rng.range(6, 13) * (1 - Math.abs(x - cx) / hw * 0.5), i % 2 ? TEAL : VIOLET);
  }
  p.outline(INK);
  // No ink along the top: the floor's lip meets the rim there.
  p.data.fill(0, (lift - 1) * p.w, lift * p.w);
  return glows;
}

// --- Props -----------------------------------------------------------------------------

/** A slender star-stone column marking each end of the arena, a star floating over it. */
function paintColumn(): Pix {
  const w = 22, h = 104;
  const p = new Pix(w, h);
  const cxp = w / 2;
  for (let y = 8; y < h - 7; y++) {
    const hw = 5 + ((y - 8) / (h - 15)) * 1.5;
    const xl = Math.round(cxp - hw), xr = Math.round(cxp + hw);
    for (let x = xl; x < xr; x++) {
      const u = (x - xl) / Math.max(1, xr - xl - 1);
      p.set(x, y, u < 0.25 ? STONE[4] : u < 0.7 ? STONE[3] : STONE[1]);
      if (Math.abs(u - 0.5) < 0.09) p.set(x, y, STONE[2]);
    }
  }
  // Constellation channel down the face.
  for (const [y, big] of [[22, 1], [31, 0], [44, 1], [52, 0], [66, 1], [78, 0]] as const) {
    const x = Math.round(cxp + Math.sin(y * 0.7) * 2) - 1;
    p.set(x, y, big ? TEAL[3] : TEAL[2]);
    if (big) p.set(x, y + 1, TEAL[1]);
  }
  // Gold capital and base bands, a stone plinth.
  p.rect(3, 2, 16, 3, GOLD[2]); p.rect(3, 2, 16, 1, GOLD[3]); p.rect(3, 4, 16, 1, GOLD[0]);
  p.rect(4, 5, 14, 3, STONE[4]); p.rect(4, 7, 14, 1, STONE[1]);
  p.rect(4, h - 18, 14, 2, GOLD[2]); p.rect(4, h - 18, 14, 1, GOLD[3]);
  p.rect(2, h - 7, 18, 7, STONE[2]); p.rect(2, h - 7, 18, 1, GOLD[2]); p.rect(2, h - 1, 18, 1, STONE[0]);
  p.outline(INK);
  return p;
}

/** A four-point star crystal, faceted silver and blue, with a dithered halo. */
function paintStar(): Pix {
  const w = 19, h = 25;
  const p = new Pix(w, h);
  const cx = 9, cy = 12;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot((x - cx) / 9, (y - cy) / 12);
    if (d < 1 && bayer(x, y) < (1 - d) * 0.5) p.set(x, y, 0xa8c0ff, 100);
  }
  const rx = 6.5, ry = 10.5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = Math.abs(x + 0.5 - cx - 0.5) / rx, v = Math.abs(y + 0.5 - cy - 0.5) / ry;
    if (Math.sqrt(u) + Math.sqrt(v) > 1) continue;
    const left = x < cx + 0.5, up = y < cy + 0.5;
    p.set(x, y, up ? (left ? SILVER[3] : SILVER[2]) : left ? TEAL[3] : VIOLET[3]);
  }
  p.set(cx, cy, 0xffffff); p.set(cx + 1, cy, 0xffffff); p.set(cx, cy + 1, 0xffffff); p.set(cx + 1, cy + 1, 0xffffff);
  const src = p.data.slice();
  const solid = (xx: number, yy: number) => xx >= 0 && xx < w && yy >= 0 && yy < h && src[yy * w + xx] >>> 24 === 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) p.set(x, y, VIOLET[1]);
  }
  return p;
}
