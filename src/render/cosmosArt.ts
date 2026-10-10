import { Rng } from '../core/rng';
import { ARENA_HALF_WIDTH } from '../sim/constants';
import { mix, unpackHex } from './pixel/color';
import { bayer, Pix } from './pixel/paint';
import { PPM } from './sprite/animator';
import type { ArenaArt, Cosmos, Layer, Theme } from './arenaArt';
import { hash, noise, tone } from './scenery';

/**
 * Astral Sanctum: the duel happens on a polished star-stone disc floating in
 * open space. Nothing stands behind the fight (João wants it free and
 * uncluttered): the sky carries the arena, with a nebula band, a far galaxy's
 * glow rising behind the disc, a light-star and a ringed giant. Same parallax
 * + perspective-floor scheme as Skygrove. Everything that moves (twinkles,
 * shooting stars, stardust, glows) is drawn live, see `Cosmos` and `ArenaView`.
 *
 * Back to front: space (nebula, galaxy glow, stars, light-star, ringed
 * planet) · a parallax sheet of faint stars · the disc's gilded back rim ·
 * star-stone floor · the rim and the crystal-dripping rock under the disc.
 * A star floats over a low plinth at each end of the arena.
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

  // A second, nearer sheet of faint stars: when the camera moves it slides
  // over the sky, so space has depth without anything standing in it.
  const depth = paintDepthStars(lw(0.07), Math.round(hz * 1.15), rng);

  // The back edge is only the disc's own gilded rim: nothing stands behind the fight.
  const wall = new Pix(lw(wallFactor), floorTop + 1);
  const twA = new Pix(wall.w, wall.h), twB = new Pix(wall.w, wall.h);
  paintBackRim(wall, twA, twB, floorTop, Math.min(edgeAt(vTop) * wallFactor, wall.w / 2 - 8));

  const floor = paintStarFloor(Math.ceil(W / 0.65 + 2 * travel * 1.6 + 64), Math.ceil(D) * 2, D, vTop, edgeAt, lipAt);

  // The disc's rim and the crystal-veined rock it stands on, hanging into the void.
  const lift = 1;
  const under = new Pix(lw(sLip), Math.max(12, H - lipY + lift + 10));
  for (const [x, y, c] of paintUnderside(under, rng, lipEnd * sLip, lift)) glow(under, sLip, lipY - lift, x, y, 12, c);

  // The arena's bounds: a star floating over a low plinth at each end.
  const plinth = paintPlinth(), star = paintStar();
  for (const sd of [-1, 1]) glows.push({ x: W / 2 + sd * (ARENA_HALF_WIDTH + 0.75) * PPM, y: gy - plinth.h - star.h / 2, factor: 1, r: 20, color: 0xc8d8ff });

  const L = (pix: Pix, factor: number, y = 0): Layer => ({ pix, factor, y });
  return {
    theme, gy, hy, floorTop, wallFactor,
    layers: [
      { ...L(space.pix, 0), after: 'stars' }, L(depth, 0.07), L(wall, wallFactor),
    ],
    front: [L(under, sLip, lipY - lift)],
    floorEnd: lipY,
    crowd: [twA, twB], crowdLayer: L(twA, wallFactor), floor, torches: [],
    pillar: plinth,
    crystal: star,
    cycle: null, floaters: [], ambience: null,
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
      // A deep, soft glow rising from below the disc's horizon, like a far galaxy's heart.
      const gu = (x + 0.5 - W * 0.5) / (W * 0.62), gv = (y + 0.5 - hz * 1.08) / (hz * 0.42);
      const gd = gu * gu + gv * gv;
      if (gd < 1) {
        const k = (1 - gd) ** 2.2;
        c = mix(c, mix(0x5a2e8e, 0xb04a8a, smooth(0.3, 1, k) * 0.5), k * 0.42);
        c = mix(c, 0xe8b8f0, smooth(0.75, 1, k) * 0.18);
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

// --- Depth and the back rim ---------------------------------------------------------

/** Sparse, faint stars on a transparent sheet, a parallax layer just over the sky. */
function paintDepthStars(w: number, h: number, rng: Rng): Pix {
  const p = new Pix(w, h);
  const n = Math.round((w * h) / 900);
  const cols = [0xc8d4ff, 0xe8eeff, 0xd8c8ff, 0xb8f0f0];
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rng.range(0, w)), y = Math.floor(rng.range(0, h));
    const b = rng.next();
    const col = cols[Math.floor(rng.next() * cols.length)];
    p.set(x, y, col, Math.round(70 + 150 * b * b));
    if (b > 0.93) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) p.set(x + ox, y + oy, col, 60);
  }
  return p;
}

/**
 * The disc's far edge: a fine gold rim over a sliver of polished stone, its
 * ends curving away. Glints run along it on alternate frames.
 */
function paintBackRim(p: Pix, ta: Pix, tb: Pix, floorTop: number, half: number): void {
  const cx = p.w / 2;
  const y = floorTop;
  for (let x = Math.round(cx - half + 4); x < cx + half - 4; x++) {
    const u = (x + 0.5 - cx) / half;
    const sink = Math.round(Math.max(0, Math.abs(u) - 0.94) * 40);
    p.set(x, y - 2 + sink, GOLD[3]);
    p.set(x, y - 1 + sink, GOLD[1]);
    p.set(x, y + sink, STONE[2]);
    if (hash(x, 0, 1451) < 0.03) (hash(x, 1, 1452) < 0.5 ? ta : tb).set(x, y - 2 + sink, 0xffffff);
  }
}

// --- Floor ---------------------------------------------------------------------------

/**
 * The floor: polished star-stone flagstones laid in rings around the centre,
 * a gold-ringed medallion with a silver compass star under the fighters, a
 * zodiac band, a few constellations inlaid in silver and a gilded rim along
 * the edge. Transparent past the edge (space shows).
 */
function paintStarFloor(w: number, h: number, D: number, vTop: number, edgeAt: (v: number) => number, lipAt: (u: number) => number): Pix {
  const p = new Pix(w, h);
  const cx = w / 2;
  const zMid = D * 2.6;
  const RINGS = [0, 22, 54, 72, 104, 150, 210, 280, 360, 460, 580];
  const sectors = (ri: number) => (ri < 4 ? 1 : ri < 6 ? 16 : ri < 8 ? 24 : 32);
  const ringOf = (r: number) => { let i = 0; while (i < RINGS.length - 1 && r >= RINGS[i + 1]) i++; return i; };
  for (let v = 0; v < h; v++) {
    const z = v * 2.6, lz = z - zMid;
    const edge = edgeAt(v);
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

/** A low star-stone plinth banded in gold, marking each end of the arena. */
function paintPlinth(): Pix {
  const w = 22, h = 16;
  const p = new Pix(w, h);
  p.rect(5, 2, 12, 9, STONE[3]);
  p.rect(5, 2, 3, 9, STONE[4]);
  p.rect(14, 2, 3, 9, STONE[1]);
  p.set(10, 6, TEAL[3]); p.set(11, 6, TEAL[2]);
  p.rect(3, 0, 16, 2, GOLD[2]); p.rect(3, 0, 16, 1, GOLD[3]);
  p.rect(2, 11, 18, 5, STONE[2]); p.rect(2, 11, 18, 1, GOLD[2]); p.rect(2, 15, 18, 1, STONE[0]);
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
