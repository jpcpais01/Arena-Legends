import { material, type Raster, type Tex } from '../../pixel/raster';
import { subtract, union, type Shape } from '../../pixel/sdf';
import { bands, grain, hash, lattice, speckle } from '../../pixel/tex';
import { fillAll, hangAt, type WeaponArt, type WeaponDrawOpts } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt } from './index';
import { glow, mats, plain, Q, shiny, veined, wrap } from './kit';

/**
 * Fourth-wave skins (v0.40.0): the v0.39 off-hand items. Rare skins recolour
 * by the item's own material names (and the names its thrown sprite uses in
 * projArt.ts, so a thrown bolas or javelin flies in the same colours).
 * Legendary skins reshape the item, the thrown ones their battle sprite too.
 * Animated parts step with `r.phase` and loop over four idle frames.
 */

/** Legendary sparkles and swing trail in one colour family. */
const legend = (spark: number, spark2: number, trail = spark): Pick<SkinArt, 'fx' | 'trail'> => ({
  fx: { spark, spark2 },
  trail: [trail, mixRgb(trail, spark2, 0.55)],
});

function mixRgb(a: number, b: number, t: number): number {
  const c = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return c(16) | c(8) | c(0);
}

/** A star of `n` points round (cx, cy). */
function star(F: Xf, cx: number, cy: number, R: number, ri: number, n = 4, rot = 0): Shape {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + Math.PI / 2 + (i * Math.PI) / n, d = i % 2 ? ri : R;
    pts.push(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  return F.poly(pts);
}

/** A round disc as a polygon (stays round when the frame is squashed). */
function disc(F: Xf, cx: number, cy: number, r: number, n = 14): Shape {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) pts.push(cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r);
  return F.poly(pts);
}

/** Caps through a list of points (x, y, radius). */
function bend(t: Xf, pts: number[]): Shape {
  const out: Shape[] = [];
  for (let i = 0; i + 5 < pts.length; i += 3) out.push(t.cap(pts[i], pts[i + 1], pts[i + 3], pts[i + 4], pts[i + 2], pts[i + 5]));
  return union(...out);
}

/** Flat fill with no contour against what it covers (inlays, faces). */
const inlay = (r: Raster, s: Shape, mat: number, o: WeaponDrawOpts, bevel = 1, local?: Xf) =>
  r.fill(s, mat, { group: o.group ?? 6, bevel, toneBias: o.toneBias, noLine: true, local: local ?? o.local });

// =============================================================================
// Rare
// =============================================================================

/** Tiger's eye: honey-gold bands that shimmer across dark brown. */
const chatoyant: Tex = (x, y) => {
  const v = Math.sin(x * 1.5 + Math.sin(y * 0.9 + x * 0.3) * 1.4);
  return v > 0.62 ? 1 : v < -0.55 ? -1 : 0;
};

/** Planks running the shield's length, a dark seam between them, oak grain in each. */
const planks: Tex = (x, y) => {
  if (wrap(y + 0.5, 3.4) < 0.75) return -1;
  return Math.sin(x * 0.7 + Math.sin(y * 2.1) * 1.6 + Math.floor((y + 0.5) / 3.4) * 2.3) > 0.8 ? -1 : 0;
};

/** Harlequin diamonds. */
const harlequin = lattice(2.4, -1);

const RARE: Record<string, SkinArt> = {
  'bolas.tigereye': {
    mats: {
      stone: shiny(0xb07a2a, chatoyant, 0.15), stone2: shiny(0x8a5420, chatoyant, 0.15),
      cord: plain(0x2a1a14, bands(1.6, 0.6, 1)), knot: shiny(0xe8c060), band: plain(0x1e1410),
      // The thrown sprite's materials.
      bolaStone: shiny(0xb07a2a, chatoyant, 0.15), bolaStone2: shiny(0x8a5420, chatoyant, 0.15), binding: shiny(0xe8c060),
    },
  },
  'trickster_talisman.silver': {
    mats: {
      gold: shiny(0xd8dee8, undefined, 0.15), silver: shiny(0x6a7088, undefined, 0.14),
      sun: shiny(0xe8ecf4, speckle(0.08, -1), 0.13), moon: plain(0x3a1e4a),
      sunEye: glow(0x9affd8), star: glow(0xf0d0ff),
      cord: plain(0x5a2a8a, bands(2, 1, 1)), tassel: plain(0x2a9a6a, bands(1.2, 0.6, 1)),
    },
  },
  'tower_shield.oakwall': {
    mats: {
      face: plain(0x9a6a3a, planks), rim: plain(0x3a2a1e, grain()), band: plain(0x2a2a30, speckle(0.12, 1)),
      rivet: shiny(0xd8b060), boss: shiny(0xc89040, undefined, 0.16),
    },
  },
  'javelin.hunter': {
    mats: {
      shaft: plain(0x5a3a22, grain()), head: shiny(0x4a525e, speckle(0.1, 1), 0.16), binding: plain(0x4a6a3a, bands(1, 0.5, 1)),
      butt: shiny(0xb08040), tuft: plain(0xe8e0d0, bands(1.1, 0.55, -2)),
      ash: plain(0x5a3a22, grain()), iron: shiny(0xb08040), steel: shiny(0x4a525e, speckle(0.1, 1), 0.16),
    },
  },
  'iron_cestus.brass': {
    mats: {
      strap: plain(0x2a2024, lattice(2.2, 1)), plate: shiny(0xc8963a, speckle(0.06, -1), 0.15), knuckle: shiny(0xe0b050),
      stud: shiny(0xf4dc90), lace: plain(0xb02a2a),
    },
  },
};

// =============================================================================
// Comet Bolas
// =============================================================================

/** Night-blue cord strewn with stars that wink in turn. */
const starCord: Tex = (x, y, ph) => {
  const k = Math.floor(x * 1.3 + y * 0.7);
  if (wrap(k, 3) !== 0) return 0;
  return wrap(k - ph, 4) === 0 ? 4 : 1;
};
/** Glowing cracks crawling over a dark meteor stone. */
const cracks: Tex = (x, y, ph) => {
  const v = Math.sin(x * 2.1 + Math.sin(y * 1.7) * 1.8) + Math.sin(y * 2.3 - x * 0.8 + ph * Q) * 0.6;
  return Math.abs(v) < 0.22 ? 4 : hash(Math.floor(x * 2), Math.floor(y * 2)) < 0.1 ? -1 : 0;
};

const COMET_ROCK = [0x1a1c38, 0x2c3260, 0x434e8a, 0x6272b2];
const cometMats = () => ({
  rock: material(veined(COMET_ROCK, 0xbff4ff, cracks)),
  coma: material({ base: 0xc8f4ff, glow: true }),
  tail: material({ base: 0x4aa8f0, glow: true }),
  hot: material({ base: 0xf0ffff, glow: true }),
  cord: material(veined([0x1e2a50, 0x2e4070, 0x44609a, 0x6a8ac4], 0xf0fbff, starCord)),
  star: material({ base: 0xffd84a, glow: true }),
  cap: material({ base: 0xc8d4f0, shiny: true, step: 0.16 }),
});
const CM = cometMats();

function cometBolas(): WeaponArt {
  // Three meteor stones in icy comas, their cords streaming back as comet tails, a gold star at the knot.
  return {
    tip: 7,
    mats: { ...cometMats() },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      const H = hangAt(t, 0, 0);
      const ends: [number, number, number][] = [[6.8, -3, 2], [5.8, 3.2, 1.9], [8.8, 0.3, 2.2]];
      // Short comet tails streaming up from each stone along its cord.
      ends.forEach(([x, y, rad], i) => {
        const len = Math.hypot(x, y), ux = x / len, uy = y / len, nx = -uy, ny = ux;
        const L = 3.4 + [0, 0.5, 0.2, 0.7][(ph + i) % 4], w = rad * 0.6;
        const bx = x - ux * L, by = y - uy * L;
        r.fill(H.poly([x + nx * w, y + ny * w, bx, by, x - nx * w, y - ny * w]), m('tail'), { group: g, noLine: true });
        const w2 = w * 0.45, cx = x - ux * L * 0.6, cy = y - uy * L * 0.6;
        r.fill(H.poly([x + nx * w2, y + ny * w2, cx, cy, x - nx * w2, y - ny * w2]), m('coma'), { group: g, noLine: true });
      });
      for (const [x, y] of ends) r.line(H.x(0.6, 0), H.y(0.6, 0), H.x(x, y), H.y(x, y), m('cord'), 2, g);
      // The meteors: rough-cut rocks, a bright face toward the fall.
      ends.forEach(([x, y, rad], i) => {
        const pts: number[] = [];
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2 + i, d = rad * (0.82 + hash(k, i + 3) * 0.32);
          pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
        }
        fillAll(r, [H.poly(pts)], m('rock'), o, 1.4);
        // An icy coma burning on the leading (lower) face.
        const len = Math.hypot(x, y), ux = x / len, uy = y / len;
        r.fill(subtract(disc(H, x + ux * 0.5, y + uy * 0.5, rad * 0.95, 10), disc(H, x - ux * 0.5, y - uy * 0.5, rad * 0.95, 10)), m('coma'), { group: g, noLine: true });
        r.dot(H.x(x + ux * rad * 0.6, y + uy * rad * 0.6), H.y(x + ux * rad * 0.6, y + uy * rad * 0.6), m('hot'), 3, g);
      });
      // Gold star caught at the knot, winking.
      const s = [2.3, 1.8, 2.1, 1.7][ph];
      fillAll(r, [H.circ(0.6, 0, 0.9)], m('cap'), o, 1);
      r.fill(star(H, 0.2, 0, s, 0.55), m('star'), { group: g, noLine: true });
      r.dot(H.x(0.6, 0), H.y(0.6, 0), m('hot'), 3, g);
    },
  };
}

const cometBolasProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // Three meteors spinning round a gold star, each dragging a curved comet tail along the orbit.
    const k = new Xf(t.ox, t.oy, -f * (Math.PI / 6));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      // The whirl turns clockwise, so the tails sweep back counter-clockwise.
      const outer: number[] = [], inner: number[] = [];
      for (let s = 0; s <= 6; s++) {
        const u = s / 6, b = a + u * 1.3, w = 1.7 * (1 - u) + 0.1;
        outer.push(Math.cos(b) * (6.2 + w), Math.sin(b) * (6.2 + w));
        inner.unshift(Math.cos(b) * (6.2 - w * 0.7), Math.sin(b) * (6.2 - w * 0.7));
      }
      r.fill(k.poly([...outer, ...inner]), h(CM.tail), { group: 1, noLine: true });
      const core: number[] = [];
      for (let s = 0; s <= 4; s++) { const b = a + (s / 4) * 0.7; core.push(Math.cos(b) * 6.6, Math.sin(b) * 6.6); }
      for (let s = 4; s >= 0; s--) { const b = a + (s / 4) * 0.7; core.push(Math.cos(b) * 5.9, Math.sin(b) * 5.9); }
      r.fill(k.poly(core), h(CM.coma), { group: 1, noLine: true });
      r.line(t.ox, t.oy, k.x(Math.cos(a) * 6, Math.sin(a) * 6), k.y(Math.cos(a) * 6, Math.sin(a) * 6), h(CM.cord), 2, 2);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2, x = Math.cos(a) * 6, y = Math.sin(a) * 6;
      r.fill(k.circ(x, y, i ? 1.9 : 2.1), h(CM.rock), { group: 3, bevel: 1.4 });
      // Leading face (clockwise) burning icy white.
      const la = a - Math.PI / 2, lx = Math.cos(la) * 0.7, ly = Math.sin(la) * 0.7;
      r.fill(subtract(disc(k, x + lx, y + ly, 1.9, 10), disc(k, x - lx, y - ly, 1.9, 10)), h(CM.coma), { group: 3, noLine: true });
      r.dot(k.x(x + lx * 1.6, y + ly * 1.6), k.y(x + lx * 1.6, y + ly * 1.6), h(CM.hot), 3, 3);
    }
    r.fill(star(k, 0, 0, 2.6, 0.75, 4, f * (Math.PI / 8)), h(CM.star), { group: 4, noLine: true });
    r.dot(t.ox, t.oy, h(CM.hot), 3, 4);
  },
};

// =============================================================================
// Janus Mask
// =============================================================================

/** Half a mask's outline on the −x side, top to chin (mirrored for the other half). */
const MASK_HALF = [0, 4.3, -1.8, 4.8, -3.6, 4.2, -4.7, 2.5, -4.8, 0.2, -4.2, -2.2, -3, -4.1, -1.4, -5.3, 0, -5.7];
const mirror = (pts: number[]) => pts.map((v, i) => (i % 2 ? v : -v));

/** A tear's path down the weeping cheek, one step a frame. */
const TEAR = [0.2, -0.5, -1.3, -2.1];

function janusMask(): WeaponArt {
  // A masquerade mask on an ebony rod: one face golden and laughing, the other violet and weeping,
  // crowned with a jester's two horns and bells. It stays upright whatever angle the hand is at.
  return {
    tip: 13,
    mats: mats({
      rod: plain(0x241828, bands(1.8, 0.7, 2)), band: shiny(0xf0c040),
      gold: shiny(0xf2c448, undefined, 0.15), enamel: shiny(0x4a2a92, undefined, 0.15), trim: shiny(0xe8ecf8, undefined, 0.16),
      hole: plain(0x140a1c), laugh: glow(0xffe46a), weep: glow(0x8aeeff), tear: glow(0xc8fbff),
      hornV: plain(0x6a34c0, harlequin), hornG: plain(0xe8b030, harlequin), bell: shiny(0xf4f0e0, undefined, 0.16),
      ribbon: plain(0xc8304a, bands(1.4, 0.5, 1)),
    }),
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      const cx = 9.8;
      // Rod with gold collars, ribbons tied under the mask.
      fillAll(r, [t.cap(-1.6, 0, cx - 2, 0, 0.62, 0.55)], m('rod'), o, 0.8);
      fillAll(r, [t.circ(-1.9, 0, 1), t.rect(cx - 3.4, 0, 0.5, 0.95)], m('band'), o, 1);
      fillAll(r, [t.poly([cx - 3.2, 0.4, cx - 5.6, 2.6 + (ph % 2) * 0.4, cx - 5, 3.4, cx - 2.8, 0.8])], m('ribbon'), o, 0.8);
      fillAll(r, [t.poly([cx - 3.2, -0.4, cx - 5.2, -2.4 - (ph % 2) * 0.4, cx - 4.4, -3.2, cx - 2.8, -0.8])], m('ribbon'), o, 0.8);
      // The mask's own upright frame.
      const s = Math.abs(t.sy), [ux, uy] = t.p(cx, 0);
      const U = new Xf(ux, uy, 0, s * 1.15, s * 1.15);
      const bell = (k: number) => [-0.3, 0.3, 0, -0.2][(ph + (k > 0 ? 2 : 0)) % 4];
      // Jester horns curling out of the brow, a bell on each tip.
      fillAll(r, [bend(U, [-2.2, 3.8, 1.35, -4.4, 5.8, 1.05, -6.6, 6.6, 0.75, -7.9, 5.8, 0.5])], m('hornV'), o, 1, 0);
      fillAll(r, [bend(U, [2.2, 3.8, 1.35, 4.4, 5.8, 1.05, 6.6, 6.6, 0.75, 7.9, 5.8, 0.5])], m('hornG'), o, 1, 0);
      fillAll(r, [U.circ(-8.1 + bell(-1), 4.8, 0.85), U.circ(8.1 + bell(1), 4.8, 0.85)], m('bell'), o, 0.8);
      // Two half faces: laughing gold on the left, weeping violet on the right.
      fillAll(r, [U.poly([...MASK_HALF])], m('gold'), o, 1.6);
      fillAll(r, [U.poly(mirror(MASK_HALF))], m('enamel'), o, 1.6);
      // Laughing eye (an upturned crescent) and grin.
      inlay(r, U.poly([-3.7, 0.7, -2.4, 2.3, -0.8, 1.1, -1.3, 0.4, -2.4, 1.1, -3.1, 0.1]), m('hole'), o, 0);
      inlay(r, U.poly([-0.2, -2.5, -1.7, -2.6, -3.4, -1.3, -3.1, -2.4, -1.8, -3.9, -0.2, -4.2]), m('hole'), o, 0);
      r.dot(U.x(-2.3, 1.45), U.y(-2.3, 1.45), m('laugh'), 3, g);
      // Weeping eye (sloping down and out) and frown.
      inlay(r, U.poly([0.8, 2.1, 2.4, 1.8, 3.7, 0.5, 3.1, -0.1, 2.3, 0.7, 1, 1.1]), m('hole'), o, 0);
      inlay(r, U.poly([0.2, -2.9, 1.8, -2.7, 3.3, -3.9, 2.9, -4.4, 1.7, -3.7, 0.2, -3.9]), m('hole'), o, 0);
      r.dot(U.x(2.3, 1), U.y(2.3, 1), m('weep'), 3, g);
      // A tear rolling down the violet cheek.
      const ty = TEAR[ph];
      r.fill(U.poly([2.6, ty + 1, 3.1, ty - 0.2, 2.6, ty - 0.7, 2.1, ty - 0.2]), m('tear'), { group: g, noLine: true });
      // A gold gem on the brow of the laughing face, a silver star on the weeping one.
      r.dot(U.x(-1.6, 3.4), U.y(-1.6, 3.4), m('laugh'), 3, g);
      r.fill(star(U, 1.7, 3.3, 0.9, 0.3), m('trim'), { group: g, noLine: true });
    },
  };
}

// =============================================================================
// Citadel Gate
// =============================================================================

/** Ashlar blocks in running bond (x along the shield is "up"). */
const ashlar: Tex = (x, y) => {
  const row = Math.floor((x + 20) / 2.6);
  if (wrap(x + 20, 2.6) < 0.7) return -1;
  return wrap(y + (row % 2) * 1.7, 3.4) < 0.7 ? -1 : hash(row, Math.floor((y + (row % 2) * 1.7) / 3.4)) < 0.3 ? 1 : 0;
};
/** Round tower stones: rows of blocks curving round the drum. */
const drum: Tex = (x, y) => {
  const row = Math.floor((x + 20) / 2.2);
  if (wrap(x + 20, 2.2) < 0.6) return -1;
  return wrap(y * 1.4 + (row % 2) * 1.2, 2.4) < 0.5 ? -1 : 0;
};
/** Torchlight in the arrow slits and gate, breathing over the loop. */
const torch: Tex = (_x, _y, ph) => [0, 1, 0, -1][ph % 4];

function citadelGate(): WeaponArt {
  // A tower shield built as a fortress gate: a crenellated curtain wall between two round towers
  // flying blue pennants, an arched gate with a gilded portcullis half raised, torchlight behind.
  return {
    tip: 14,
    mats: {
      wall: material({ base: 0xd4cab2, step: 0.11, tex: ashlar }),
      tower: material({ base: 0x8e8070, step: 0.13, tex: drum }),
      cap: material({ base: 0x7a6e60, step: 0.12 }),
      dark: material({ base: 0x1e1622 }),
      bars: material({ base: 0xe0b040, shiny: true, step: 0.15 }),
      gold: material({ base: 0xf0c050, shiny: true, step: 0.15 }),
      light: material({ base: 0xffb84a, glow: true, tex: torch }),
      gem: material({ base: 0x6ab8ff, glow: true }),
      banner: material({ base: 0x2a4ac0, tex: bands(1.6, 0.5, 1) }),
      pole: material({ base: 0x5a4a3a }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // Pennants on poles above each tower, rippling (x runs down the shield, so "up" is −x).
      for (const k of [-1, 1]) {
        const y0 = k * 7.1;
        r.line(t.x(-15.4, y0), t.y(-15.4, y0), t.x(-19.6, y0), t.y(-19.6, y0), m('pole'), 1, g);
        const w = [0, 0.4, 0.1, -0.3][(ph + (k > 0 ? 1 : 0)) % 4];
        fillAll(r, [t.poly([-19.6, y0, -19.2 + w, y0 - k * 2.2, -18.8 - w, y0 - k * 4.2, -18.2, y0 - k * 2, -17.8, y0])], m('banner'), o, 0.6);
      }
      // Towers: round drums standing proud of the wall, crowned with merlons.
      for (const k of [-1, 1]) {
        const yc = k * 7.1;
        fillAll(r, [t.rect(0.3, yc, 14.3, 2.3, 0.6)], m('tower'), o, 2.2);
        const mer: Shape[] = [t.rect(-14.5, yc, 0.9, 2.8, 0.2)];
        for (const dy of [-1.8, 0, 1.8]) mer.push(t.rect(-16.1, yc + dy, 0.9, 0.62));
        fillAll(r, [union(...mer)], m('cap'), o, 0.8);
        r.line(t.x(-13.4, yc - 2.2), t.y(-13.4, yc - 2.2), t.x(-13.4, yc + 2.2), t.y(-13.4, yc + 2.2), m('gold'), 4, g);
        // Arrow slits, torchlit.
        for (const x of [-9.4, -0.8]) r.fill(t.rect(x, yc, 1.2, 0.38), m('light'), { group: g, noLine: true });
      }
      // Curtain wall between them, merlons along its top.
      const wall = t.poly([-12.8, -5, 14.6, -5, 14.6, 5, -12.8, 5]);
      fillAll(r, [wall], m('wall'), o, 1.2, 0);
      const mer: Shape[] = [];
      for (const y of [-3.4, 0, 3.4]) mer.push(t.rect(-13.6, y, 1, 1.05));
      fillAll(r, [union(...mer)], m('wall'), o, 0.8);
      // The gate: an arched opening, the light behind, a gilded portcullis half raised.
      const arch = union(t.poly([-1.6, -3.3, 14.6, -3.3, 14.6, 3.3, -1.6, 3.3]), disc(t, -1.6, 0, 3.3, 16));
      inlay(r, arch, m('dark'), o, 0);
      r.fill(t.poly([11.8, -3.1, 14.6, -3.1, 14.6, 3.1, 11.8, 3.1]), m('light'), { group: g, noLine: true });
      const bars: Shape[] = [];
      for (const y of [-2.2, -0.75, 0.75, 2.2]) {
        bars.push(t.rect(4, y, Math.max(0.1, 5.6 - (Math.abs(y) > 2 ? 1.4 : 0.2)) , 0.3));
        bars.push(t.poly([9.4, y - 0.42, 10.9, y, 9.4, y + 0.42]));
      }
      for (const x of [0.4, 3.2, 6.2, 9]) bars.push(t.rect(x, 0, 0.3, 3));
      r.fill(union(...bars), m('bars'), { group: g, bevel: 0.6, toneBias: o.toneBias, local: o.local });
      // Voussoirs round the arch and a keystone holding a blue gem.
      const ring = subtract(disc(t, -1.6, 0, 4.4, 18), disc(t, -1.6, 0, 3.3, 18));
      r.fill(subtract(ring, t.poly([-1.6, -5, 6, -5, 6, 5, -1.6, 5])), m('cap'), { group: g, bevel: 0.8, toneBias: o.toneBias, local: o.local });
      fillAll(r, [t.poly([-6.4, -1.1, -6.4, 1.1, -4.7, 0.7, -4.7, -0.7])], m('gold'), o, 0.8);
      r.dot(t.x(-5.6, 0), t.y(-5.6, 0), m('gem'), 3, g);
      // Gold string course along the foot.
      fillAll(r, [t.rect(13.9, 0, 0.6, 9.4, 0.3)], m('gold'), o, 0.6);
    },
  };
}

// =============================================================================
// Sunspear
// =============================================================================

const SUNGOLD = [0x8a4a12, 0xc8801e, 0xf0b434, 0xffd870, 0xfff6d0];
/** A spiral of gold binding winding up the pale shaft. */
const spiral: Tex = (x, y) => (wrap(x * 0.7 + y * 0.9, 2.2) < 0.55 ? 1 : 0);

const sunMats = () => ({
  shaft: material({ base: 0xf2e6c8, step: 0.12, tex: spiral }),
  gold: material({ base: 0xd87818, shiny: true, step: 0.15 }),
  shaftGold: material({ base: SUNGOLD[2], ramp: SUNGOLD, shiny: true }),
  head: material({ base: 0xfff0b8, shiny: true, step: 0.13 }),
  disc: material({ base: 0xffc838, glow: true }),
  core: material({ base: 0xfff8d8, glow: true }),
  ray: material({ base: 0xfff0a0, shiny: true, step: 0.12 }),
  ribbon: material({ base: 0xd8301e, tex: bands(1.2, 0.5, 1) }),
  grip: material({ base: 0x8a1e1e, tex: bands(1, 0.5, -1) }),
  flare: material({ base: 0xffc848, glow: true }),
  flareDeep: material({ base: 0xe07018, glow: true }),
});
const SM = sunMats();

/** The sun disc with its rays at (x, 0); rays turn by `spin`. */
function sunHead(r: Raster, t: Xf, x: number, spin: number, m: (k: keyof typeof SM) => number, g: number, o: WeaponDrawOpts): void {
  const rays: Shape[] = [];
  for (let k = 0; k < 8; k++) {
    const a = spin + (k / 8) * Math.PI * 2, len = k % 2 ? 4.2 : 5.4, w = 0.42;
    rays.push(t.poly([x + Math.cos(a - w) * 2.4, Math.sin(a - w) * 2.4, x + Math.cos(a) * len, Math.sin(a) * len, x + Math.cos(a + w) * 2.4, Math.sin(a + w) * 2.4]));
  }
  r.fill(union(...rays), m('ray'), { group: g, bevel: 0.6, toneBias: o.toneBias, local: o.local });
  r.fill(disc(t, x, 0, 2.9), m('gold'), { group: g, bevel: 1.2, toneBias: o.toneBias, local: o.local });
  r.fill(disc(t, x, 0, 2), m('disc'), { group: g, noLine: true });
  r.fill(disc(t, x, 0, 1, 8), m('core'), { group: g, noLine: true });
}

function sunspear(): WeaponArt {
  // A pale ash javelin bound in a gold spiral, a blazing sun disc behind a long gilded point, crimson streamers.
  return {
    tip: 23,
    mats: { ...sunMats() },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      fillAll(r, [t.cap(-14, 0, 15, 0, 0.8, 0.72)], m('shaft'), o, 0.9);
      // Butt: a little gold sun-spike.
      fillAll(r, [t.poly([-13.8, -1.1, -16.2, 0, -13.8, 1.1])], m('shaftGold'), o, 0.8);
      fillAll(r, [t.circ(-13.6, 0, 1.05)], m('shaftGold'), o, 0.9);
      fillAll(r, [t.cap(-2.2, 0, 2.2, 0, 0.98)], m('grip'), o, 1);
      fillAll(r, [t.rect(-2.6, 0, 0.4, 1.05), t.rect(2.6, 0, 0.4, 1.05)], m('shaftGold'), o, 0.8);
      // Streamers trailing back from under the head.
      const w = [0, 0.5, 0.2, -0.4][ph];
      fillAll(r, [t.poly([13.6, 0.6, 11, 2.4 + w, 8.6, 2.2 - w, 9.6, 3.4 + w, 12.4, 3, 14.4, 1])], m('ribbon'), o, 0.8);
      fillAll(r, [t.poly([13.6, -0.6, 11.4, -1.8 - w, 9.4, -1.4 + w, 10.6, -2.6 - w, 13, -2.4, 14.4, -1])], m('ribbon'), o, 0.8);
      // The sun, its rays turning a little each frame.
      sunHead(r, t, 16, ph * (Math.PI / 20), m as (k: string) => number, g, o);
      // A long leaf point thrust out through the sun.
      fillAll(r, [t.poly([18.2, -1.0, 20, -1.7, 24.4, 0, 20, 1.7, 18.2, 1.0])], m('head'), o, 1.2);
      r.line(t.x(19.2, 0), t.y(19.2, 0), t.x(23.2, 0), t.y(23.2, 0), m('head'), 4, g);
    },
  };
}

const sunspearProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A streak of sunfire behind the shaft, then the spear with its sun disc turning.
    const fl = [0, 0.5, 0, -0.5][f];
    r.fill(t.poly([10, -2.6, -2, -1.8 + fl, -18, -0.7, -26 - fl * 2, 0, -18, 0.7, -2, 1.8 - fl, 10, 2.6]), h(SM.flareDeep), { group: 1 });
    r.fill(t.poly([10, -1.4, -4, -0.8, -16, 0, -4, 0.8, 10, 1.4]), h(SM.flare), { group: 1 });
    r.fill(t.cap(-17, 0, 9, 0, 0.75, 0.68), h(SM.shaft), { group: 2, bevel: 0.8 });
    r.fill(t.poly([-17, -1, -19, 0, -17, 1]), h(SM.shaftGold), { group: 2, bevel: 0.8 });
    r.fill(t.cap(-1.4, 0, 1.4, 0, 0.92), h(SM.grip), { group: 2, bevel: 0.8 });
    const hm = (k: keyof typeof SM) => h(SM[k]);
    sunHead(r, t, 9.4, f * (Math.PI / 16), hm, 3, { group: 3 });
    r.fill(t.poly([11.6, -1, 13.4, -1.7, 17.8, 0, 13.4, 1.7, 11.6, 1]), h(SM.head), { group: 4, bevel: 1.2 });
    r.line(t.x(12.6, 0), t.y(12.6, 0), t.x(16.6, 0), t.y(16.6, 0), h(SM.head), 4, 4);
  },
};

// =============================================================================
// Titan Fist
// =============================================================================

const TITAN = [0x1c2028, 0x2c323e, 0x404858, 0x5a6476];
/** Runes cut into the plate: their strokes pulse up the arm over the loop. */
const runeCut: Tex = (x, y, ph) => {
  const u = wrap(x + 20, 2.6), v = Math.abs(y);
  const stroke = (u < 0.5 && v < 1.2) || (Math.abs(u - 1.3 - (y > 0 ? 0.6 : -0.6) * 0.5) < 0.35 && v > 0.3 && v < 1.1);
  if (!stroke) return hash(Math.floor(x * 2), Math.floor(y * 2)) < 0.08 ? -1 : 0;
  return wrap(Math.floor((x + 20) / 2.6) + ph, 4) < 2 ? 4 : 1;
};
/** A gleam sliding over polished bronze. */
const bronzeGleam: Tex = (x, y, ph) => (wrap(x - y * 0.6 - ph * 1.5, 6) < 0.9 ? 1 : 0);

function titanFist(): WeaponArt {
  // A colossal gauntlet: a runed vambrace of dark titan-iron, a flared bronze cuff, a plated fist
  // whose four bronze knuckle caps each hold a glowing rune, and a great rune on the back of the hand.
  return {
    tip: 5.4,
    mats: {
      iron: material({ base: TITAN[2], ramp: [...TITAN, 0x9afff0], shiny: true, tex: runeCut }),
      plate: material({ base: 0x4a5264, shiny: true, step: 0.15, tex: speckle(0.06, -1) }),
      bronze: material({ base: 0xc8903e, shiny: true, step: 0.15, tex: bronzeGleam }),
      rune: material({ base: 0x5af0d8, glow: true }),
      hot: material({ base: 0xe8fffa, glow: true }),
      leather: material({ base: 0x3a2420, tex: bands(1.4, 0.5, 1) }),
    },
    draw(r, t0, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // Built a size up from the stock cestus: a titan's hand on a mortal arm.
      const t = new Xf(t0.ox, t0.oy, t0.ang, t0.sx * 1.2, t0.sy * 1.2);
      // Vambrace, tapering up the forearm, runes pulsing along it.
      fillAll(r, [t.cap(-8, 0, -1.8, 0, 2.2, 2.75)], m('iron'), o, 1.6);
      fillAll(r, [t.cap(-8.6, 0, -7.6, 0, 2.0)], m('leather'), o, 1);
      // Flared bronze cuff at the wrist.
      fillAll(r, [t.poly([-2.6, -3.1, -0.8, -3.7, -0.4, 0, -0.8, 3.7, -2.6, 3.1])], m('bronze'), o, 1.2);
      // The fist: a heavy back-plate.
      fillAll(r, [t.rect(1.5, 0, 2.5, 3.5, 1.2)], m('plate'), o, 1.8);
      // Thumb plate on the near side.
      fillAll(r, [t.ell(1.6, 3.8, 1.9, 1.1, 0.4)], m('plate'), o, 1);
      // Great rune on the back of the hand: a pulsing tiwaz arrow.
      const pulse = ph === 1 || ph === 2 ? 'hot' : 'rune';
      r.line(t.x(-0.2, 0), t.y(-0.2, 0), t.x(3, 0), t.y(3, 0), m(pulse), 3, g);
      r.line(t.x(3, 0), t.y(3, 0), t.x(1.8, -1.3), t.y(1.8, -1.3), m(pulse), 3, g);
      r.line(t.x(3, 0), t.y(3, 0), t.x(1.8, 1.3), t.y(1.8, 1.3), m(pulse), 3, g);
      // Four bronze knuckle caps, a rune glinting in each, one flaring in turn.
      const caps: Shape[] = [];
      const ys = [-2.7, -0.9, 0.9, 2.7];
      for (const y of ys) caps.push(t.ell(4.6, y, 1.25, 0.98));
      fillAll(r, [union(...caps)], m('bronze'), o, 1);
      ys.forEach((y, i) => r.dot(t.x(4.9, y), t.y(4.9, y), m(i === ph ? 'hot' : 'rune'), 3, g));
      // Spike-studs riding the knuckles.
      const studs: Shape[] = [];
      for (const y of ys) studs.push(t.poly([5.6, y - 0.5, 6.6, y, 5.6, y + 0.5]));
      fillAll(r, [union(...studs)], m('plate'), o, 0.6);
    },
  };
}

// =============================================================================

export const WAVE4_OFFHAND: Record<string, SkinArt> = {
  ...RARE,
  'bolas.comet': { weapon: cometBolas, proj: { bolas: cometBolasProj }, ...legend(0xe8fbff, 0x3a7aff, 0xbfefff) },
  'trickster_talisman.janus': { weapon: janusMask, ...legend(0xfff0a0, 0x8a4ae0, 0xffe080) },
  'tower_shield.citadel': { weapon: citadelGate, ...legend(0xfff2c0, 0xe0a030) },
  'javelin.sunspear': { weapon: sunspear, proj: { javelin: sunspearProj }, ...legend(0xfff6c8, 0xff8a20, 0xffd860) },
  'iron_cestus.titanfist': { weapon: titanFist, ...legend(0xd8fff8, 0x2ab8a8) },
};
