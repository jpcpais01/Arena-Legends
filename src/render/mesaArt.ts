import { Rng } from '../core/rng';
import { ARENA_HALF_WIDTH } from '../sim/constants';
import { mix, unpackHex } from './pixel/color';
import { bayer, Pix } from './pixel/paint';
import { PPM } from './sprite/animator';
import type { ArenaArt, DayCycle, Layer, SkyKey, Theme } from './arenaArt';
import { hash, noise, tone } from './scenery';

/**
 * Desert Mesa: the duel happens on the flat top of a red sandstone mesa high
 * above an endless sea of dunes. Same parallax + perspective-floor scheme as
 * Skygrove (see arenaArt.ts) and its live sky, on its own hours: a late
 * golden afternoon, a huge low sun sinking into the dunes through orange and
 * magenta dusk, then a deep blue night full of stars with the Milky Way and
 * the moon. Nothing stands behind the fight: the far edge of the mesa is only
 * low rocks and scrub, the buttes on the horizon are hazy and small.
 *
 * Back to front: sky (live) · far buttes and the dune horizon · mid dunes ·
 * near dunes · the mesa's back rim · slickrock floor · the cliff face.
 * Blowing sand, dust devils, hawks, twinkling stars and embers are drawn
 * live (see `Wind`, `DayCycle` and `ArenaView`).
 */

/** Dunes, slip-face shadow to sunlit crest. */
const DUNE = [0x5e2e4e, 0x86404e, 0xb45a4c, 0xd88050, 0xf0a462, 0xfcc67c, 0xffe2a4];
/** The mesa's top: wind-polished sandstone. */
const SLICK = [0x6e2a26, 0x8e3a2c, 0xac4e32, 0xc4663a, 0xd88046, 0xe89c58, 0xf4b874];
/** Loose sand on the floor. */
const SAND = [0xc27c48, 0xd69256, 0xe4a866, 0xeebc7a, 0xf8d296];
/** The cliff face in the shade: red beds, pale beds and dark purple shale. */
const RED = [0x3a1622, 0x561f28, 0x742a2c, 0x943a32, 0xb24e38, 0xcc6a42];
const PALE = [0x6a3c40, 0x8e5850, 0xb07a62, 0xcc9876, 0xe4b88c];
const SHALE = [0x2c1426, 0x3e1c30, 0x54283a, 0x6c3846];
const BRONZE = [0x3a2014, 0x6a4020, 0x9a6630, 0xcc9444, 0xf2c870];
const SCRUB = [0x5a4a2a, 0x8a7440, 0xb49a58, 0xd8c07a];
const CACTUS = [0x2a4a34, 0x3e6a40, 0x5a8a4c, 0x84ac62];
const INK = 0x24101c;
/** Dust in the air far below: what the dunes and the cliff's foot fade into. */
const HAZE = 0xe6a888;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildMesa(theme: Theme, W: number, H: number, gy: number, travel: number, seed: number): ArenaArt {
  const rng = new Rng(seed + 911);
  const wallFactor = 0.78;
  const floorTop = gy - 22;
  const hy = gy - 22 / (1 - wallFactor);
  const D = gy - hy;
  // The floor stops at the mesa's front lip; the cliff layer takes over below.
  const lipY = gy + 10;
  const sLip = (lipY + 0.5 - hy) / D;
  const vLip = D / sLip;
  const vTop = D / ((floorTop + 0.5 - hy) / D);
  // The mesa's top seen from above: a broad slab a little wider than the arena,
  // its ends broken into blocky bays and spurs, its corners chipped.
  const E = (ARENA_HALF_WIDTH + 2) * PPM;
  const vc = (vLip + vTop) / 2, rv = (vTop - vLip) / 2 + 10;
  const edgeAt = (v: number, side: number) => {
    const k = Math.abs(v - vc) / rv;
    if (k >= 1) return 0;
    const s = side > 0 ? 171 : 173;
    const block = (noise(v * 2.6, 0, 26, 0, s) - 0.5) * 26 + (hash(Math.floor(v / 3), 0, s + 1) - 0.5) * 5;
    return E * (1 - Math.max(0, (k - 0.6) / 0.4) ** 2 * 0.22) + block;
  };
  const lipEnd = [edgeAt(vLip, -1), edgeAt(vLip, 1)];
  // A crisp caprock edge, a little ragged, curling back at the corners.
  const lipAt = (u: number) => {
    const corner = Math.max(0, 1 - (lipEnd[u < 0 ? 0 : 1] - Math.abs(u)) / 20);
    return vLip + 0.5 + (noise(u, 0, 14, 0, 181) - 0.5) * 2.4 + (hash(Math.floor(u / 5), 0, 182) < 0.12 ? 1.5 : 0) + corner * corner * 10;
  };
  const hz = gy - 46;
  const lw = (f: number) => Math.ceil(W + 2 * travel * f + 8);

  // Far buttes on the horizon and the dune sea rolling up to it.
  const far = new Pix(lw(0.05), H);
  paintButtes(far, rng, hz, W);
  paintDunes(far, rng, hz - 2, hz + 34, 2, 1.3, 0.7, 0.45, 191);

  const mid = new Pix(lw(0.14), H);
  paintDunes(mid, rng, hz + 12, hz + 70, 4, 1.26, 0.42, 0.25, 193);

  const near = new Pix(lw(0.3), H);
  paintDunes(near, rng, hz + 46, H + 60, 9, 1.3, 0.22, 0, 197);

  const rim = new Pix(lw(wallFactor), floorTop + 1);
  const swayA = new Pix(rim.w, rim.h), swayB = new Pix(rim.w, rim.h);
  paintRim(rim, swayA, swayB, rng, floorTop, edgeAt(vTop, -1) * wallFactor, edgeAt(vTop, 1) * wallFactor);

  const floor = paintSlickrock(rng, Math.ceil(W / 0.65 + 2 * travel * 1.6 + 64), Math.ceil(D) * 2, D, edgeAt, lipAt);

  const lift = 1;
  const cliff = new Pix(lw(sLip), Math.max(12, H - lipY + lift));
  paintCliff(cliff, rng, lipEnd[0] * sLip, lipEnd[1] * sLip, lift);

  // Fire bowls glowing over the markers once the sun is gone, and on the ground at their feet.
  const obelisk = paintObelisk();
  const lamps: DayCycle['lamps'] = [-1, 1].flatMap((sd) => {
    const x = W / 2 + sd * (ARENA_HALF_WIDTH + 0.75) * PPM;
    return [{ x, y: gy - obelisk.h - 4, factor: 1, r: 26 }, { x, y: gy - 4, factor: 1, r: 34 }];
  });

  const L = (pix: Pix, factor: number, y = 0): Layer => ({ pix, factor, y });
  const night = paintNight(rng, W, hz);
  return {
    theme, gy, hy, floorTop, wallFactor,
    layers: [{ ...L(far, 0.05), after: 'shimmer' }, { ...L(mid, 0.14), after: 'devils' }, L(near, 0.3), L(rim, wallFactor)],
    front: [L(cliff, sLip, lipY - lift)],
    floorEnd: lipY,
    crowd: [swayA, swayB], crowdLayer: L(swayA, wallFactor), floor, torches: [],
    pillar: obelisk,
    crystal: null,
    cycle: {
      hz, keys: SKY_KEYS, sunR: theme.body.r,
      stars: night.pix, moon: paintMoon(),
      lamps, lampColor: 0xffa04a,
      sunPath: { x: [0.6, 0.73], y: [0.4, 1.25], set: 0.72 },
      cast: 1.7, shade: 1.5, warm: 0.45, rays: 0.55,
      twinkle: night.twinkle,
      motes: 'embers',
    },
    floaters: [],
    ambience: null,
    cosmos: null,
    wind: {
      sand: [SAND[1], SAND[3], SAND[4], 0xfff0d6],
      shimmer: [hz - 10, hz + 5],
      devils: hz + 14,
      hawk: 0x3a2220,
    },
  };
}

/**
 * Late afternoon → golden hour → sunset → magenta dusk → night, keyed on the
 * share of the round gone by. The sun touches the dunes around 0.55 and is
 * gone by 0.66 (see `sunPath`).
 */
const SKY_KEYS: SkyKey[] = [
  { at: 0, sky: [0x3a6aae, 0x6c98c4, 0xd8c8a4, 0xffd89c], glow: 0xffe0a0, glowA: 0.42, band: 0xffd090, bandA: 0.18, tint: 0xffc070, tintA: 0.06 },
  { at: 0.3, sky: [0x34609e, 0x7290b4, 0xecb886, 0xffc884], glow: 0xffc880, glowA: 0.55, band: 0xffaa60, bandA: 0.34, tint: 0xffa860, tintA: 0.13 },
  { at: 0.5, sky: [0x2a3e7e, 0x765e94, 0xf08a6a, 0xffae5c], glow: 0xffa452, glowA: 0.78, band: 0xff7a40, bandA: 0.58, tint: 0xff8050, tintA: 0.22 },
  { at: 0.62, sky: [0x1e2662, 0x56387c, 0xd45a7c, 0xff8a58], glow: 0xff6e50, glowA: 0.62, band: 0xf05a5a, bandA: 0.6, tint: 0xd85a6a, tintA: 0.28 },
  { at: 0.74, sky: [0x0e1440, 0x262462, 0x6a307a, 0xb24e72], glow: 0xc04070, glowA: 0.22, band: 0x9a3a70, bandA: 0.36, tint: 0x2e2064, tintA: 0.44 },
  { at: 0.88, sky: [0x03061a, 0x080f30, 0x14204c, 0x24305c], glow: 0x6070a0, glowA: 0, band: 0x2a3066, bandA: 0.12, tint: 0x081030, tintA: 0.58 },
];

// --- Sky and distance ---------------------------------------------------------------

/**
 * The night sky over the desert, transparent (the live gradient shows
 * through): a dense field of faint stars, the Milky Way as a smooth glowing
 * band with dark dust lanes, rising from the horizon on the right. Returns
 * the bright stars that twinkle at runtime (left out of the image).
 */
function paintNight(rng: Rng, W: number, hz: number): { pix: Pix; twinkle: number[] } {
  const p = new Pix(W, hz);
  const ax = W * 0.98, ay = hz * 1.1, bx = W * 0.22, by = -hz * 0.2;
  const bl = Math.hypot(bx - ax, by - ay), dx = (bx - ax) / bl, dy = (by - ay) / bl;
  const bw = Math.max(26, hz * 0.2);
  const band = new Float32Array(W * hz);
  for (let y = 0; y < hz; y++) {
    // Thinner near the horizon, where the air is thick with dust.
    const air = smooth(hz, hz * 0.6, y);
    for (let x = 0; x < W; x++) {
      const rx = x - ax, ry = y - ay;
      const along = rx * dx + ry * dy, perp = (rx * dy - ry * dx) / bw + (noise(along, 0, 90, 0, 1201) - 0.5) * 0.5;
      const bf = Math.exp(-perp * perp * 1.6) * air;
      band[y * W + x] = bf;
      if (bf < 0.02) continue;
      const f = noise(x, y, 50, 34, 1202) * 0.55 + noise(x, y, 18, 14, 1203) * 0.3 + noise(x, y, 6, 6, 1204) * 0.15;
      const d = bf * smooth(0.25, 0.85, f);
      // Dust lanes along the band's spine.
      const lane = smooth(0.5, 0.85, noise(along + (noise(x, y, 30, 30, 1205) - 0.5) * 30, perp * bw, 70, 14, 1206)) * smooth(0.7, 0.1, Math.abs(perp));
      const a = d * (1 - lane * 0.6);
      if (a < 0.02) continue;
      const col = mix(mix(0x8a7ac8, 0xd0b8e8, smooth(0.3, 0.9, a)), 0xffe4c8, smooth(0.6, 1, a) * 0.5);
      p.set(x, y, col, Math.round(a * 120));
    }
  }
  const twinkle: number[] = [];
  const cols = [0xdce6ff, 0xffffff, 0xfff0d4, 0xc8d8ff, 0xffd8b4];
  const n = Math.round((W * hz) / 26);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rng.range(0, W)), y = Math.floor(rng.range(0, hz));
    const bf = band[y * W + x];
    const thin = 1 - y / hz;
    if (rng.next() > (0.3 + 0.7 * bf) * (0.25 + 0.75 * thin)) continue;
    const b = rng.next() ** 3;
    const col = cols[Math.floor(rng.next() * cols.length)];
    if (b > 0.6 && twinkle.length < 210) { twinkle.push(x, y, b > 0.85 ? 2 : 1); continue; }
    const under = p.get(x, y) >>> 24;
    p.set(x, y, mix(col, unpackHex(p.get(x, y)), under ? 0.25 : 0), Math.min(255, Math.round(60 + 190 * b + under * 0.4)));
  }
  return { pix: p, twinkle };
}

/** A big pale moon, a little warm from the dust, its seas soft. */
function paintMoon(): Pix {
  const r = 11, p = new Pix(r * 2 + 1, r * 2 + 1);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const u = (x - r) / r, v = (y - r) / r, d = u * u + v * v;
    if (d > 1.04) continue;
    let c = mix(0xfff8ec, 0xd8d4e4, Math.max(0, (u - v) * 0.3 + d * 0.3));
    const sea = noise(x, y, 6, 6, 1211) * 0.6 + noise(x, y, 3, 3, 1212) * 0.4;
    if (sea > 0.56) c = mix(c, 0xa0a0c0, 0.6);
    if (d > 0.86) c = mix(c, 0xc8c4dc, 0.4);
    p.set(x, y, c);
  }
  return p;
}

/**
 * Buttes and mesas far off on the horizon, flat-topped with talus skirts,
 * hazy rose silhouettes with a sunlit edge toward the sun. They stay low and
 * keep to the sides, out from behind the fight.
 */
function paintButtes(p: Pix, rng: Rng, hz: number, W: number): void {
  const cx = p.w / 2;
  const at = (f: number) => cx + (f - 0.5) * W;
  const specs: [number, number, number, number][] = [
    // centre (screen fraction), top width, height, haze
    [0.1, 46, 24, 0.5], [0.2, 16, 30, 0.56], [0.3, 30, 14, 0.66],
    [0.84, 70, 19, 0.56], [0.95, 22, 26, 0.5], [0.66, 10, 11, 0.7],
  ];
  // Beyond the screen's ends at camera 0, for when the camera travels.
  for (let x = at(1.06); x < p.w; x += rng.range(80, 160)) specs.push([(x - cx) / W + 0.5, rng.range(16, 50), rng.range(10, 24), 0.6]);
  for (let x = at(-0.06); x > 0; x -= rng.range(80, 160)) specs.push([(x - cx) / W + 0.5, rng.range(16, 50), rng.range(10, 24), 0.6]);
  for (const [f, tw, h, fog] of specs) paintButte(p, at(f), hz + 2, tw, h, fog, rng.int(0, 9999));
}

function paintButte(p: Pix, cx: number, base: number, tw: number, h: number, fog: number, sd: number): void {
  const top = base - h;
  const skirt = h * 0.55;
  const body = 0x8a4a5a, lit = 0xe08a6a, cap = 0xb06060;
  for (let y = Math.floor(top); y < base + 2; y++) {
    const rel = (y - top) / h;
    // Sheer walls under the caprock, then the talus flaring out.
    const flare = Math.max(0, rel - 0.5) / 0.5;
    const half = tw / 2 + rel * 2 + flare ** 1.6 * skirt;
    const xl = Math.round(cx - half + (hash(y >> 1, 0, sd) - 0.5) * 1.2), xr = Math.round(cx + half + (hash(y >> 1, 1, sd) - 0.5) * 1.2);
    for (let x = xl; x <= xr; x++) {
      let c = body;
      if (rel < 0.12) c = cap;
      else if (((y + Math.round(noise(x, 0, 20, 0, sd + 2) * 2)) >> 1) % 3 === 0 && rel < 0.55) c = mix(body, cap, 0.5);
      if (xr - x < 1.5 + (1 - flare) * 1.5 && rel < 0.9) c = lit;
      else if (x - xl < 1 && rel < 0.6) c = mix(body, 0x4a2448, 0.4);
      p.set(x, y, mix(c, HAZE, fog));
    }
  }
}

/**
 * Rows of dunes, far to near, seen toward the low sun: each row a sinuous
 * crest with a bright rim where the sunlit far slope peeks over, its face
 * toward us falling into rosy shade down to the trough, brighter where the
 * crest turns toward the sun (right) and darker where it turns away. Rows
 * grow (`grow`) toward the viewer; the farthest melt into the haze (`fog`
 * for the first row down to `fog1` for the last).
 */
function paintDunes(p: Pix, rng: Rng, y0: number, y1: number, a0: number, grow: number, fog: number, fog1: number, sd: number): void {
  const rows: { base: number; amp: number; s: number }[] = [];
  for (let y = y0, a = a0; y < y1; y += a * rng.range(0.9, 1.3), a = Math.min(a * grow, a0 * 3.2)) rows.push({ base: y, amp: a, s: rng.int(0, 9999) });
  const n = rows.length;
  const crestAt = (r: (typeof rows)[number], x: number) => {
    const lam = r.amp * 16;
    // Sharp-topped: a smooth wave folded at its peaks, wandering in length.
    const w = noise(x, 0, lam, 0, r.s) * 0.65 + noise(x, 0, lam * 0.37, 0, r.s + 1) * 0.35;
    const ridge = 1 - Math.abs(w - 0.5) * 2;
    return r.base - r.amp * (0.25 + 1.1 * ridge ** 1.6);
  };
  const pad = 200;
  const yc = new Float32Array(p.w + pad * 2), turn = new Float32Array(p.w + pad * 2);
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    const fogR = fog + (fog1 - fog) * (n > 1 ? i / (n - 1) : 1);
    const deep = r.amp * 1.5;
    for (let k = 0; k < yc.length; k++) yc[k] = crestAt(r, k - pad);
    // Turning toward the sun (descending to the right on screen) lights the face.
    for (let k = 2; k < yc.length - 2; k++) turn[k] = Math.max(-1, Math.min(1, ((yc[k + 2] - yc[k - 2]) / 4) * 2.2));
    const bottom = i + 1 < n ? Math.min(p.h, Math.ceil(rows[i + 1].base + 1)) : p.h;
    for (let x = 0; x < p.w; x++) {
      const top = yc[x + pad], crest = Math.round(top);
      for (let y = Math.max(0, crest); y < bottom; y++) {
        const d = (y - top) / deep;
        // Each peak's spine runs down and to the left toward us, so the light
        // and shadow sides part along a slanting line.
        const tn = turn[Math.max(2, Math.min(yc.length - 3, x + pad + Math.round((y - top) * 1.1)))];
        let l = 0.6 - Math.min(1, d) * 0.46 + tn * 0.2 - Math.max(0, d - 1) * 0.04;
        if (y === crest) l = turn[x + pad] > -0.2 ? 0.99 : 0.8;
        else if (y === crest + 1 && turn[x + pad] > 0) l += 0.16;
        // Wind ripples on the bigger faces.
        if (r.amp > 5 && d > 0.25 && d < 1.2 && Math.sin(y * 1.9 + noise(x, y, 18, 5, sd) * 9) > 0.9) l -= 0.08;
        const c = tone(DUNE, Math.max(0.02, l), x, y, 0.07);
        p.set(x, y, mix(c, HAZE, fogR));
      }
    }
  }
}

// --- The mesa's back rim ---------------------------------------------------------------

/**
 * The far edge of the mesa: low weathered rocks, a few boulders, dry scrub and
 * a barrel cactus or two, nothing tall but a balanced rock and a short hoodoo
 * at the corners. The scrub sways between the two frames.
 */
function paintRim(p: Pix, sa: Pix, sb: Pix, rng: Rng, floorTop: number, hwL: number, hwR: number): void {
  const cx = p.w / 2;
  const left = cx - hwL, right = cx + hwR;
  const band = new Pix(p.w, 56);
  const by = band.h - 1;
  // Boulders, lit from the right, shrinking toward the ends.
  for (let x = left + rng.range(16, 40); x < right - 16; x += rng.range(40, 90)) {
    const e = Math.min(x - left, right - x), k = Math.min(1, 0.4 + e / 80);
    const rx = rng.range(4, 9) * k, ry = rx * rng.range(0.55, 0.8);
    rock(band, x, by, rx, ry);
    if (rng.chance(0.6)) rock(band, x + rx * 0.9 + 1, by, rx * 0.45, ry * 0.5);
  }
  // A balanced rock near one end, a short hoodoo near the other.
  const ends = rng.chance(0.5) ? [-1, 1] : [1, -1];
  balanced(band, cx + ends[0] * (ends[0] < 0 ? hwL : hwR) * 0.9, by, rng);
  hoodoo(band, cx + ends[1] * (ends[1] < 0 ? hwL : hwR) * 0.88, by, rng);
  // Barrel cacti, one either side, well away from the middle.
  for (const s of [-1, 1]) {
    const x = Math.round(cx + s * (s < 0 ? hwL : hwR) * rng.range(0.5, 0.7));
    barrel(band, x, by, rng.int(5, 7));
  }
  band.outline(INK);
  // The rim itself after the ink, so it has none: a broken lip of caprock a few pixels high.
  for (let x = Math.max(0, Math.floor(left + 3)); x < Math.min(p.w, right - 3); x++) {
    const e = Math.min(x - left, right - x);
    const hgt = Math.max(0, Math.round((noise(x, 0, 9, 0, 211) * 3 + (hash(Math.floor(x / 4), 0, 212) < 0.2 ? 2 : 0)) * Math.min(1, e / 20)));
    for (let k = 0; k <= hgt; k++) if (!band.has(x, by - k)) band.set(x, by - k, k === hgt ? SLICK[5] : tone(SLICK, 0.5 - k * 0.05, x, by - k, 0.1));
  }
  p.blit(band, 0, floorTop - band.h + 1);
  // Dry scrub and grass along the edge, swaying between the two frames.
  for (let x = left + rng.range(6, 14); x < right - 8; x += rng.range(10, 26)) {
    if (Math.abs(x - cx) < 30 && rng.chance(0.6)) continue;
    const base = floorTop - rng.int(0, 2), n = rng.int(3, 6);
    for (let j = 0; j < n; j++) {
      const ox = Math.round(x + (j - n / 2) * 1.3), hgt = rng.int(3, 8);
      const col = rng.pick([SCRUB[1], SCRUB[2], SCRUB[2], SCRUB[3]]);
      for (const [buf, lean] of [[sa, rng.range(-0.8, 0.2) + (j - n / 2) * 0.4], [sb, rng.range(-2.2, -1.2) + (j - n / 2) * 0.3]] as const) {
        for (let k = 0; k < hgt; k++) buf.set(Math.round(ox + lean * (k / hgt) ** 1.6), base - k, k < 2 ? SCRUB[0] : col);
      }
    }
  }
}

function rock(p: Pix, x: number, base: number, rx: number, ry: number): void {
  const cy = base - ry;
  for (let y = Math.floor(cy - ry); y <= base; y++) for (let xx = Math.floor(x - rx); xx <= x + rx; xx++) {
    const u = (xx + 0.5 - x) / rx, v = (y + 0.5 - cy) / ry;
    const d = u * u + v * v;
    if (d > 1) continue;
    let c = tone(SLICK, 0.42 - v * 0.3 + u * 0.32, xx, y, 0.14);
    // A pale bed running through it.
    if (Math.abs(v - 0.15 + Math.sin(xx * 0.6) * 0.08) < 0.12) c = mix(c, PALE[4], 0.35);
    p.set(xx, y, c);
  }
}

/** Layered rock column `w` wide from `y0` up `h`, lit from the right, its beds weathered back. */
function column(p: Pix, cx: number, base: number, h: number, width: (k: number) => number, sd: number): void {
  for (let y = Math.round(base - h); y <= base; y++) {
    const k = (base - y) / h;
    const bed = Math.floor((base - y + noise(y, 0, 7, 0, sd) * 2) / 4);
    const hw = width(k) - (bed % 3 === 1 ? 1 : 0);
    const xl = Math.round(cx - hw), xr = Math.round(cx + hw);
    for (let x = xl; x <= xr; x++) {
      const u = (x - xl) / Math.max(1, xr - xl);
      const pal = bed % 4 === 2 ? PALE : SLICK;
      const i = Math.floor(u * 2.4 + 0.3 + (bayer(x, y) - 0.5) * 0.3) + (bed % 2 ? 1 : 2);
      p.set(x, y, x === xr && k < 0.95 ? pal[pal.length - 1] : pal[Math.max(0, Math.min(pal.length - 1, i))]);
    }
  }
}

function balanced(p: Pix, cx: number, base: number, rng: Rng): void {
  const h = rng.int(26, 34);
  const sd = rng.int(0, 9999);
  // A tapering pedestal with a slim neck, a fat boulder perched on top.
  column(p, cx, base, h * 0.72, (k) => 6.5 - k * 3.5 + (k > 0.8 ? -1 : 0), sd);
  const r = rng.range(7, 9);
  rock(p, cx + 2, Math.round(base - h * 0.72 + 2), r, r * 0.62);
}

function hoodoo(p: Pix, cx: number, base: number, rng: Rng): void {
  const h = rng.int(19, 24);
  const sd = rng.int(0, 9999);
  // Squat, pinched at a soft bed under a hard cap.
  column(p, cx, base, h, (k) => 6 + (1 - k) * 4 - Math.sin(k * Math.PI) * 2.2, sd);
  const top = Math.round(base - h);
  for (let x = Math.round(cx - 8); x <= cx + 8; x++) for (let y = top - 3; y <= top; y++) {
    if ((y === top - 3 && (x < cx - 6 || x > cx + 6))) continue;
    p.set(x, y, x > cx + 3 ? PALE[4] : y === top - 3 ? PALE[3] : PALE[2]);
  }
}

function barrel(p: Pix, x: number, base: number, h: number): void {
  const rx = h * 0.55;
  for (let y = base - h; y <= base; y++) for (let xx = Math.floor(x - rx); xx <= x + rx; xx++) {
    const u = (xx + 0.5 - x) / rx, v = (y + 0.5 - (base - h * 0.45)) / (h * 0.6);
    if (u * u + v * v > 1) continue;
    const rib = Math.round((xx - x + rx) * 1.2) % 2 === 0;
    p.set(xx, y, CACTUS[Math.max(0, Math.min(3, Math.round(1.6 + u * 1.2 - v * 0.5) - (rib ? 1 : 0)))]);
  }
  // A crown of flowers.
  p.set(x - 1, base - h, 0xff7aa0); p.set(x, base - h - 1, 0xffd06a); p.set(x + 1, base - h, 0xff7aa0);
}

// --- Floor ----------------------------------------------------------------------------

/**
 * The mesa's top: wind-polished sandstone, its beds showing as low steps that
 * run across the plateau (a dark foot, a sunlit lip), long joints cracking
 * it, and sand blown into drifts streaming along the wind, rippled, thickest
 * where the fighters stand. Pebbles, a few weathering pits, a sunlit caprock
 * edge. Transparent past the mesa's edges.
 */
function paintSlickrock(rng: Rng, w: number, h: number, D: number, edgeAt: (v: number, side: number) => number, lipAt: (u: number) => number): Pix {
  const p = new Pix(w, h);
  const cx = w / 2;
  const sand = new Float32Array(w * h);
  for (let v = 0; v < h; v++) {
    const hl = edgeAt(v, -1), hr = edgeAt(v, 1);
    if (hl <= 0 || hr <= 0) continue;
    const z = v * 2.6;
    const path = Math.exp(-(((v - D) / 5) ** 2));
    for (let x = Math.max(0, Math.floor(cx - hl)); x < Math.min(w, Math.ceil(cx + hr)); x++) {
      const du = x + 0.5 - cx;
      const edge = du < 0 ? hl + du : hr - du;
      if (edge < 0) continue;
      const lip = lipAt(du);
      if (v < lip) {
        // The caprock's face showing through the ragged lip.
        p.set(x, v, v > lip - 1.2 ? SLICK[6] : bayer(x, v) < (lip - v) / 4 ? PALE[2] : PALE[3]);
        continue;
      }
      if (edge < 1.5 || v < lip + 1.2) { p.set(x, v, SLICK[6]); continue; }
      // Beds stepping across the plateau, gently warped.
      const bz = (z + (noise(du, 0, 110, 0, 221) - 0.5) * 40 + (noise(du, z, 36, 18, 222) - 0.5) * 12) / 15;
      const bi = Math.floor(bz), bf = bz - bi;
      let l = 0.5 + (hash(bi, 0, 223) - 0.5) * 0.14 + (noise(du, z, 220, 70, 224) - 0.5) * 0.14 + (noise(du, z, 9, 5, 225) - 0.5) * 0.08;
      if (bf < 0.07) l -= 0.13;
      else if (bf > 0.94) l += 0.1;
      if (edge < 4) l += 0.06;
      p.set(x, v, tone(SLICK, l, x, v, 0.1));
      const sn = noise(du, z, 120, 16, 231) * 0.6 + noise(du, z, 34, 7, 232) * 0.4;
      sand[v * w + x] = sn - (0.6 - path * 0.16 - Math.min(0.12, 5 / Math.max(1, edge)));
    }
  }
  const inside = (x: number, v: number) => p.has(x, v) && v > lipAt(x - cx) + 2;
  // Joints: long, faintly wandering cracks across the rock, a sunlit edge beside each.
  for (let i = 0; i < w / 120; i++) {
    let u = rng.range(-w / 2, w / 2), z = rng.range(D * 0.92, D * 1.3) * 2.6;
    const ang = rng.chance(0.6) ? rng.range(-0.35, 0.35) : rng.range(1.2, 1.9);
    const len = rng.range(30, 120);
    for (let s = 0; s < len; s++) {
      const a = ang + (noise(s, i, 20, 1, 241) - 0.5) * 0.6;
      u += Math.cos(a); z += Math.sin(a) * 1.4;
      const x = Math.round(cx + u), v = Math.round(z / 2.6);
      if (!inside(x, v) || !inside(x + 1, v)) continue;
      p.set(x, v, mix(unpackHex(p.get(x, v)), SLICK[0], 0.7));
      if (hash(x, v, 242) < 0.6) p.set(x + 1, v, mix(unpackHex(p.get(x + 1, v)), SLICK[6], 0.5));
    }
  }
  // Weathering pits: shallow bowls, dark inside, a pale rim on the far side.
  for (let i = 0; i < w / 260; i++) {
    const x = rng.range(0, w), v = rng.range(D * 1.08, D * 1.24), rx = rng.range(3, 6), ry = rx / 3.2;
    if (!inside(Math.round(x - rx - 2), Math.round(v)) || !inside(Math.round(x + rx + 2), Math.round(v))) continue;
    p.ellipse(x, v, rx + 1, ry + 0.8, SLICK[5]);
    p.ellipse(x, v - 0.5, rx, ry, SLICK[2]);
    p.ellipse(x + rx * 0.2, v - 0.8, rx * 0.6, ry * 0.5, SLICK[1]);
  }
  // Sand over it: drifts streaming along the wind, rippled, thinning at their edges.
  for (let v = 0; v < h; v++) {
    const z = v * 2.6;
    for (let x = 0; x < w; x++) {
      const s = sand[v * w + x];
      if (s <= -0.04 || !inside(x, v)) continue;
      if (s < 0.04 && bayer(x, v) > (s + 0.04) / 0.08) continue;
      const du = x + 0.5 - cx;
      let l = 0.38 + Math.min(1, s / 0.2) * 0.22 + (noise(du, z, 60, 20, 251) - 0.5) * 0.16;
      // Ripples: crests running across the wind every few pixels.
      const r = Math.sin(du * 0.8 + noise(du, z, 30, 20, 252) * 7);
      if (r > 0.84) l += 0.11;
      else if (r < -0.9) l -= 0.07;
      p.set(x, v, tone(SAND, l, x, v, 0.08));
    }
  }
  // Pebbles and grit, with a pixel of shadow on the far side from the sun.
  for (let i = 0; i < w * h * 0.0018; i++) {
    const x = rng.int(1, w - 2), v = rng.int(0, h - 1);
    if (!inside(x, v) || !inside(x - 1, v)) continue;
    const c = rng.pick([SLICK[1], SLICK[2], PALE[3], SHALE[3], SLICK[5]]);
    p.set(x, v, c);
    if (rng.chance(0.25)) p.set(x + 1, v, mix(c, 0xffe0b0, 0.3));
    p.set(x - 1, v, mix(unpackHex(p.get(x - 1, v)), SLICK[0], 0.4));
  }
  return p;
}

// --- Cliff ---------------------------------------------------------------------------

/**
 * The mesa's front from the lip down: a pale caprock over a sheer wall of red
 * sandstone split by joints into columns (each catching the light on its
 * sunward edge), streaked with desert varnish, then a recessed slope of dark
 * shale and rubble, another wall, and so on down until the rock fades into
 * the dust haze far below.
 */
function paintCliff(p: Pix, rng: Rng, hwL: number, hwR: number, top: number): void {
  const cx = p.w / 2;
  // Units from the top down: caprock, then walls and slopes in turn.
  type Unit = { y: number; t: number; kind: 'cap' | 'wall' | 'slope'; pal: number[]; cols: number[]; seed: number };
  const units: Unit[] = [];
  let y = top;
  const cols = () => {
    const xs: number[] = [];
    for (let x = -rng.range(0, 40); x < p.w + 80; x += rng.range(16, 64)) xs.push(x);
    return xs;
  };
  units.push({ y, t: 7, kind: 'cap', pal: PALE, cols: cols(), seed: rng.int(0, 9999) });
  y += 7;
  let wall = true;
  while (y < p.h + 20) {
    const t = wall ? rng.int(26, 40) : rng.int(7, 11);
    units.push({ y, t, kind: wall ? 'wall' : 'slope', pal: wall ? (units.length > 3 && rng.chance(0.4) ? PALE : RED) : SHALE, cols: cols(), seed: rng.int(0, 9999) });
    y += t;
    wall = !wall;
  }
  // Unit boundaries wander a little along the face.
  const startOf = (i: number, x: number) => units[i].y + (i ? Math.round((noise(x, 0, 70, 0, units[i].seed) - 0.5) * 6) : 0);
  const unitAt = (yy: number, x = 0) => {
    let i = 0;
    while (i < units.length - 1 && yy >= startOf(i + 1, x)) i++;
    return i;
  };
  const Dm = 104;
  // The ends step in unit by unit as the mesa's spurs fall away, so the dunes show below them.
  const halfAt = (yy: number, side: number) => {
    const ui = unitAt(yy), u = units[ui];
    const step = u.kind === 'slope' ? 2 + ((yy - u.y) / u.t) * 3 : u.kind === 'cap' ? 1 : 0;
    const back = ui * 9 + (hash(ui, side, 268) - 0.5) * 8;
    return (side < 0 ? hwL : hwR) + step - back + (noise(yy, 0, 5, 0, side > 0 ? 261 : 262) - 0.5) * 3;
  };
  // Varnish streaks: where they run down the walls, and how far.
  const streak = (x: number, u: Unit) => {
    const k = Math.floor(x / 3);
    return hash(k, u.seed, 263) < 0.22 ? (0.3 + hash(k, u.seed, 264) * 0.7) * u.t : 0;
  };
  for (let yy = top; yy < p.h; yy++) {
    const rel = yy - top;
    const hl = halfAt(yy, -1), hr = halfAt(yy, 1);
    const fade = smooth(Dm * 0.15, Dm + 40, rel) ** 1.3;
    // Far down, the rock dissolves into the haze and the dunes show through.
    const gone = smooth(Dm - 10, Dm + 60, rel);
    if (gone >= 1) break;
    for (let x = Math.floor(cx - hl); x <= cx + hr; x++) {
      const ui = unitAt(yy, x), u = units[ui];
      const iu = yy - startOf(ui, x), f = Math.min(1, iu / u.t);
      let ci = 0;
      while (ci < u.cols.length - 2 && x >= u.cols[ci + 1]) ci++;
      const c0 = u.cols[ci], c1 = u.cols[ci + 1];
      let l: number, pal = u.pal;
      if (u.kind === 'cap') {
        l = 0.75 - f * 0.35 + (hash(ci, 0, u.seed) - 0.5) * 0.1;
        if (iu === u.t - 1) l = 0.1;
      } else if (u.kind === 'wall') {
        // Each column a slab of its own: a slightly different tone, rain-fluted,
        // split from the next by a joint (not always the full height) with a lit edge beside it.
        l = 0.56 + (hash(ci, 1, u.seed) - 0.5) * 0.1 - f * 0.1 + (noise(x, yy, 7, 60, u.seed) - 0.5) * 0.16 + (noise(x, yy, 40, 16, u.seed + 1) - 0.5) * 0.14;
        const jx = x - c0, jy0 = hash(ci, 3, u.seed) * u.t * 0.5, jy1 = u.t - hash(ci, 4, u.seed) * u.t * 0.4;
        if (iu >= jy0 && iu <= jy1) {
          if (jx === 0) l -= 0.34;
          else if (jx === 1) l -= 0.12;
          else if (c1 - x <= 1.5) l += 0.12;
        }
        // Thin bedding lines across the wall.
        if ((iu + Math.round(noise(x, 0, 30, 0, u.seed) * 3)) % 9 === 0) l -= 0.1;
        // The slope above casts the wall's top into shade; varnish runs down.
        if (iu < 3) l -= (3 - iu) * 0.1;
        const st = streak(x, u);
        if (st > iu) l -= 0.2 * (1 - iu / st);
      } else {
        // Shale and rubble, tucked in under the wall above: dark at the top, scree below.
        l = 0.35 + f * 0.4 + (hash(x >> 1, yy >> 1, u.seed) - 0.5) * 0.4;
        if (iu < 3) l -= 0.3;
        if (hash(x, yy, u.seed + 1) < 0.05) pal = RED;
      }
      let c = tone(pal, l, x, yy, 0.12);
      // The sunlit right-hand end, the shaded left.
      const er = cx + hr - x, el = x - (cx - hl);
      if (er < 2 && rel < Dm) c = mix(c, 0xffb070, 0.45);
      else if (el < 2 && rel < Dm) c = mix(c, SHALE[0], 0.35);
      if (fade > 0) c = mix(c, HAZE, fade * 0.88);
      p.set(x, yy, c, Math.round(255 * (1 - gone)));
    }
  }
  // The caprock's front edge right under the lip catches the light.
  for (let x = 0; x < p.w; x++) {
    if (!p.has(x, top)) continue;
    p.set(x, top, SLICK[6]);
    if (p.has(x, top + 1)) p.set(x, top + 1, PALE[4]);
  }
  // Ink along the sides of the walls only: none along the lip, none in the haze.
  const src = p.data.slice();
  const op = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < p.w && yy < p.h && (src[yy * p.w + xx] >>> 24) > 0;
  for (let yy = top + 1; yy < Math.min(p.h, top + Dm); yy++) for (let x = 0; x < p.w; x++) {
    if (op(x, yy)) continue;
    if (op(x - 1, yy) || op(x + 1, yy)) p.set(x, yy, mix(INK, HAZE, smooth(Dm * 0.4, Dm, yy - top) * 0.7));
  }
}

// --- Props -----------------------------------------------------------------------------

/**
 * A weathered sandstone standing stone on a cairn of rubble, a panel of dark
 * desert varnish on its face pecked with pale petroglyphs (a sun, a spiral, a
 * horned figure, a zigzag), a slab on top holding a bronze fire bowl. One
 * marks each end of the arena; the flames are drawn live.
 */
function paintObelisk(): Pix {
  const w = 28, h = 98;
  const p = new Pix(w, h);
  const cx = 14;
  // The shaft: tapering, its sides weathered unevenly, lit from the right.
  const sTop = 17, sBot = h - 10;
  for (let y = sTop; y < sBot; y++) {
    const k = (y - sTop) / (sBot - sTop);
    const bed = Math.floor((y - sTop + 2) / 9);
    const pinch = hash(bed, 0, 281) < 0.4 && (y - sTop + 2) % 9 < 2 ? 1 : 0;
    const xl = Math.round(cx - 5 - k * 2.2 + pinch + (hash(y >> 2, 1, 282) - 0.5) * 1.2);
    const xr = Math.round(cx + 4 + k * 2.4 - pinch + (hash(y >> 2, 2, 282) - 0.5) * 1.2);
    for (let x = xl; x <= xr; x++) {
      const u = (x - xl) / Math.max(1, xr - xl);
      let l = 0.42 + u * 0.38 + (noise(x, y, 3, 14, 283) - 0.5) * 0.18;
      if ((y - sTop + 2) % 9 === 0) l -= 0.12;
      if (x === xr) l = 0.95;
      else if (x === xl) l = 0.12;
      let c = tone(SLICK, l, x, y, 0.1);
      // The varnish panel on the face.
      const pv = (x - cx + 0.5) / 4.6, pw = (y - 50) / 24;
      if (pv * pv + pw ** 4 < 1 + (noise(x, y, 4, 4, 284) - 0.5) * 0.5) c = mix(c, mix(0x3e2028, 0x6a3632, Math.max(0, u - 0.2) * 1.2), 0.72);
      p.set(x, y, c);
    }
  }
  // A crack down the stone.
  for (let y = 22, x = cx + 3; y < 44; y++) { p.set(x, y, SLICK[0]); if (hash(y, 0, 285) < 0.3) x += hash(y, 1, 285) < 0.5 ? -1 : 1; }
  // Petroglyphs, pecked pale through the varnish.
  const g = (x: number, y: number) => p.set(cx + x, y, 0xe8b88c);
  for (let a = 0; a < 8; a++) g(Math.round(Math.cos(a * Math.PI / 4) * 2.5), Math.round(33 + Math.sin(a * Math.PI / 4) * 2.5));
  g(0, 33);
  for (let t = 0; t < 13; t += 0.4) g(Math.round(Math.cos(t) * t * 0.23), Math.round(45 + Math.sin(t) * t * 0.23));
  for (const [x, y] of [[0, 56], [0, 57], [0, 58], [0, 59], [-1, 57], [1, 57], [-2, 58], [2, 58], [-1, 60], [1, 60], [-1, 61], [1, 61], [-1, 55], [1, 55], [-2, 54], [2, 54]]) g(x, y);
  for (let x = -3; x <= 3; x++) g(x, 67 + (Math.abs(x) % 2));
  // The cairn: rubble stones heaped round the foot, lit from the right.
  const stone = (sx: number, sy: number, rx: number, ry: number) => {
    for (let y = Math.floor(sy - ry); y <= sy + ry; y++) for (let x = Math.floor(sx - rx); x <= sx + rx; x++) {
      const u = (x + 0.5 - sx) / rx, v = (y + 0.5 - sy) / ry;
      if (u * u + v * v > 1) continue;
      p.set(x, y, tone(u + v * 0.2 > 0.5 ? SLICK : PALE, 0.45 - v * 0.3 + u * 0.35, x, y, 0.12));
    }
  };
  stone(cx - 7, h - 4, 5.5, 3.6); stone(cx + 7, h - 4, 6, 3.6); stone(cx, h - 3, 6.5, 3);
  stone(cx - 4, h - 8, 4, 2.6); stone(cx + 5, h - 9, 3.5, 2.4); stone(cx - 9, h - 8, 2.5, 2);
  // A slab on top, and the bronze bowl on it.
  for (let y = 13; y < 17; y++) for (let x = cx - 8; x <= cx + 7; x++) {
    if (y === 13 && (x === cx - 8 || x === cx + 7)) continue;
    p.set(x, y, y === 13 ? SLICK[6] : y === 16 ? RED[2] : x > cx + 4 ? SLICK[5] : SLICK[3]);
  }
  for (let y = 4; y < 12; y++) {
    const hw = y < 6 ? 7.5 : 7 - (y - 6) * 0.9;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw - 1); x++) {
      const u = (x - (cx - hw)) / (hw * 2);
      p.set(x, y, y === 4 ? BRONZE[4] : y === 5 ? BRONZE[2] : u > 0.72 ? BRONZE[3] : u < 0.18 ? BRONZE[0] : BRONZE[1 + ((x + y) & 1)]);
    }
  }
  p.rect(cx - 2, 12, 4, 1, BRONZE[0]);
  // Coals glowing in the bowl.
  for (let x = cx - 6; x <= cx + 5; x++) p.set(x, 3, (x & 1) ? 0xffb040 : 0xe0502a);
  p.outline(INK);
  return p;
}
