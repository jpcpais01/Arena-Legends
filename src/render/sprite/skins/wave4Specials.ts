import type { MaterialSpec, Raster } from '../../pixel/raster';
import { union } from '../../pixel/sdf';
import { bands, grain, lattice, speckle, sum } from '../../pixel/tex';
import { Xf } from '../xform';
import type { ProjArt, SkinArt } from './index';
import { glow, mats, plain, shiny } from './kit';

/**
 * Fourth-wave special item skins (v0.40.0): the thunder totem, the
 * hourglass, the ward stone, the hunting hawk and the dragon whelp.
 *
 * Rare skins recolour the stock icon (by its material names) and with it
 * the hand-pixelled battle sprites (specialArt.ts maps each sprite letter to
 * an icon material) and the item's shots. Legendary skins reshape all of it:
 * an `icon`, and battle sprites through `proj` by the ids specialArt.ts and
 * projArt.ts look up (`perch` + `hawk`, `whelp` + `breath`, `totem` +
 * `charm`, `hourglass`, `ward`). The small sprites are placed pixel by pixel
 * from character maps, through materials so night accents work like
 * everywhere else.
 */

/** A pixel map letter: a material name and the tone of its ramp to paint. */
type Ink = [string, number];

/**
 * Paints a character map with (ax, ay) on the frame origin. Maps are drawn
 * facing +x; `.` and space are empty.
 */
function pix(r: Raster, t: Xf, m: (k: string) => number, rows: readonly string[], pal: Record<string, Ink>, ax: number, ay: number, group = 1): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const e = pal[ch];
      if (!e) throw new Error(`wave4Specials: no ink for '${ch}'`);
      r.dot(t.ox + x - ax, t.oy + y - ay, m(e[0]), e[1], group);
    }
  }
}

// =============================================================================
// Rare skins: recoloured and retextured
// =============================================================================

/** Old Oak Totem: weathered silver oak, mossy wings, ochre bands and an amber heartwood crystal. */
const oakTotem: SkinArt = {
  mats: {
    totemWood: plain(0x8a7458, sum(grain(-1), speckle(0.06, 1))),
    totemPaint: plain(0x6a8a3a, speckle(0.18, -1)),
    totemRed: plain(0xc8902a),
    hawkLight: plain(0xe8dcc0),
    beak: shiny(0xd8a838),
    eye: plain(0x2a1a10),
    storm: glow(0xffb83a),
    stormHot: glow(0xfff2c0),
  },
  glow: [0xfff0b0, 0xe09020],
};

/** Obsidian Glass: black volcanic glass for the frame, smoky violet bulbs, molten sand. */
const obsidianGlass: SkinArt = {
  mats: {
    gold: shiny(0x3a3046, speckle(0.08, 1), 0.16),
    glass: shiny(0x5a4a72, undefined, 0.14),
    sand: glow(0xff8a32),
  },
  glow: [0xffd090, 0xd0401a],
};

/** Moonstone Ward: a milky moonstone with a blue sheen, a lilac rune, silver bands. */
const moonstoneWard: SkinArt = {
  mats: {
    wardStone: plain(0xd0d4e2, speckle(0.14, 1)),
    wardRune: glow(0xc4a0ff),
    silver: shiny(0xe8ecf4),
  },
  glow: [0xf6eeff, 0x8a6ae0],
};

/** Snow Gyrfalcon: white plumage barred in slate, a slate beak, golden eyes that catch the night. */
const snowyHawk: SkinArt = {
  mats: {
    hawk: { base: 0xe0e4ec, ramp: [0x3a4252, 0x8a94a6, 0xe0e4ec, 0xf4f6fa, 0xffffff], tex: speckle(0.2, -2) },
    hawkLight: plain(0xf8fbff),
    beak: shiny(0x6a7488),
    eye: glow(0xf0c040),
    // Its dive.
    feather: { base: 0xe0e4ec, ramp: [0x3a4252, 0x8a94a6, 0xe0e4ec, 0xf4f6fa, 0xffffff], tex: bands(2, 1, -2) },
    featherDark: plain(0x5a6478),
    belly: plain(0xf8fbff),
    hawkEye: glow(0xf0c040),
  },
  glow: [0xffffff, 0x9aa8c0],
};

/** Emerald Whelp: green scales in a fine lattice, a gold belly, teal wings and green fire. */
const emeraldWhelp: SkinArt = {
  mats: {
    whelp: plain(0x2aa860, lattice(3, -1)),
    whelpBelly: plain(0xf0d070),
    whelpWing: plain(0x1a6a6a),
    horn: shiny(0xf0e0a0),
    ember: glow(0x8aff5a),
    emberHot: glow(0xf0ffd0),
    // Its breath.
    fire: glow(0x6ae85a),
    fireHot: glow(0xf0ffd0),
    fireDeep: glow(0x1a9a5a),
  },
  glow: [0xe0ffb0, 0x2a9a4a],
};

// =============================================================================
// Legendary skins: shared helpers
// =============================================================================

/** Draws with materials looked up by name: `m(k)` gives the raster handle. */
type Draw = (r: Raster, t: Xf, m: (k: string) => number, f: number) => void;

/**
 * One drawing, three uses: the icon (scaled up around the icon centre, from
 * the skin's own mats), and battle sprites (materials built once here).
 */
function kit(specs: Record<string, MaterialSpec>) {
  const M = mats(specs);
  return {
    mats: specs,
    sprite: (frames: number, draw: Draw, outline = true): ProjArt => ({
      frames, outline,
      draw: (r, t, f, h) => draw(r, t, (k) => h(M[k]), f),
    }),
  };
}

/** A pixel at local (x, y). */
const px = (r: Raster, t: Xf, x: number, y: number, m: number, tone: number, g?: number) => r.dot(t.x(x, y), t.y(x, y), m, tone, g);

/** The frame scaled by `s` around local point (dx, dy). */
const scaled = (t: Xf, s: number, dx = 0, dy = 0) => new Xf(t.x(dx, dy), t.y(dx, dy), 0, s, s);

/** A four-point star: a hot centre and four arms. */
function sparkle(r: Raster, t: Xf, x: number, y: number, hot: number, arm: number, g: number): void {
  px(r, t, x, y, hot, 3, g);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) px(r, t, x + dx, y + dy, arm, 3, g);
}

/** Projectiles with a top and a bottom fly upright both ways. */
const upright = (t: Xf) => (Math.cos(t.ang) < 0 ? new Xf(t.ox, t.oy, t.ang, 1, -1) : t);

// =============================================================================
// Thunderbird Pole
// =============================================================================

const TB = kit({
  'k.cedar': plain(0xb8784a, grain(-1)),
  'k.ink': plain(0x2a2028),
  'k.red': plain(0xc83a2a),
  'k.teal': plain(0x2aa0a0),
  'k.bone': plain(0xf2e8d0),
  'k.storm': glow(0x7ad8ff),
  'k.stormHot': glow(0xf4ffff),
});

/**
 * A tall carved cedar pole (origin at its base): a bear at the foot, a frog
 * above it, and on top the thunderbird, wings spread wide and painted in
 * black, red and teal formline, lightning running through its feathers and
 * its eyes lit with the storm. `f` 0..3 rests (the lightning crawls), 4..7 strikes.
 */
const thunderbirdPole: Draw = (r, t, m, f) => {
  const hot = f >= 4, ph = f & 3;
  const cedar = m('k.cedar'), ink = m('k.ink'), red = m('k.red'), teal = m('k.teal'), bone = m('k.bone');
  const storm = m('k.storm'), stormHot = m('k.stormHot');
  // Wings behind the pole, raised in a wide V, feathers stepping down from the tips to the shoulders.
  for (const sd of [-1, 1]) {
    const w = (pts: number[]) => t.poly(pts.map((v, i) => (i % 2 ? v : v * sd)));
    r.fill(w([2.4, 27.4, 6.4, 30.6, 10.8, 33.4, 11.6, 30.6, 10.2, 30.4, 10.8, 27.8, 9, 27.6, 9.2, 25, 7.4, 25.2, 7.2, 22.8, 5.2, 23.4, 4.6, 21.2, 2.4, 22]), teal, { group: 2, bevel: 1.4 });
    // Formline: a black ovoid at the shoulder, red U-feathers out along the span.
    r.fill(w([2.6, 22.4, 4.4, 21.6, 5, 23.4, 3.4, 24]), ink, { group: 3, flat: 1 });
    r.fill(w([8.4, 30.4, 10.6, 32.4, 10.4, 30.6]), red, { group: 3, flat: 2 });
    r.fill(w([6.2, 25.4, 7.8, 27.6, 8, 25.8]), red, { group: 3, flat: 2 });
    // Lightning zigzag through the feathers; a pulse runs out toward the tip.
    const zz = [[2.8, 25.6], [5, 28.2], [5.8, 26.6], [8, 30], [8.6, 28.6], [10.8, 32]];
    for (let i = 0; i < zz.length - 1; i++) {
      const lit = hot || i === ph || i === ph + 1;
      r.line(t.x(zz[i][0] * sd, zz[i][1]), t.y(zz[i][0] * sd, zz[i][1]), t.x(zz[i + 1][0] * sd, zz[i + 1][1]), t.y(zz[i + 1][0] * sd, zz[i + 1][1]), lit ? stormHot : storm, 3, 4);
    }
  }
  // The pole, flaring at the foot.
  r.fill(t.poly([-5.2, 0, -4.2, 2, -3.6, 2.6, -3.6, 24, 3.6, 24, 3.6, 2.6, 4.2, 2, 5.2, 0]), cedar, { group: 5, bevel: 2.6 });
  // Bear (bottom): round ears, big eyes, a red grinning mouth.
  for (const sd of [-1, 1]) {
    r.fill(t.circ(sd * 3.2, 11.4, 1.2), cedar, { group: 4, bevel: 1 });
    px(r, t, sd * 3.3, 11.4, ink, 1, 4);
    r.fill(t.ell(sd * 1.8, 8.4, 1.5, 1.1), bone, { group: 5, bevel: 0.8 });
    px(r, t, sd * 1.6 - (sd > 0 ? 0 : 0.2), 8.2, ink, 0, 5);
    r.line(t.x(sd * 0.6, 10.2), t.y(sd * 0.6, 10.2), t.x(sd * 3.2, 9.6), t.y(sd * 3.2, 9.6), ink, 1, 5);
  }
  r.fill(t.rect(0, 5, 2.6, 1.1, 0.6), red, { group: 5, bevel: 0.8 });
  r.line(t.x(-1.8, 5), t.y(-1.8, 5), t.x(1.8, 5), t.y(1.8, 5), bone, 3, 5);
  r.line(t.x(-3.6, 2.6), t.y(-3.6, 2.6), t.x(3.6, 2.6), t.y(3.6, 2.6), ink, 1, 5);
  // Frog (middle): teal lidded eyes, a wide red mouth.
  r.line(t.x(-3.6, 12.8), t.y(-3.6, 12.8), t.x(3.6, 12.8), t.y(3.6, 12.8), ink, 1, 5);
  for (const sd of [-1, 1]) {
    r.fill(t.ell(sd * 1.9, 17.4, 1.6, 1.2), teal, { group: 5, bevel: 0.8 });
    px(r, t, sd * 1.9, 17.2, ink, 0, 5);
  }
  r.fill(t.rect(0, 14.6, 3, 0.7, 0.3), red, { group: 5, flat: 2 });
  r.line(t.x(-3.6, 19.6), t.y(-3.6, 19.6), t.x(3.6, 19.6), t.y(3.6, 19.6), ink, 1, 5);
  // Thunderbird: chest, head, curled horns, the storm orb between them, a big hooked beak.
  r.fill(t.ell(0, 23.4, 4, 3.4), cedar, { group: 7, bevel: 2 });
  r.fill(t.poly([-2.8, 25, 0, 21, 2.8, 25, 0, 23.4]), red, { group: 7, flat: 2 });
  for (const sd of [-1, 1]) {
    r.fill(t.cap(sd * 1.4, 31.4, sd * 2.8, 34.6, 0.9, 0.6), teal, { group: 8, bevel: 0.8 });
    r.fill(t.cap(sd * 2.8, 34.6, sd * 4.2, 34, 0.6, 0.5), teal, { group: 8, bevel: 0.6 });
  }
  r.fill(t.circ(0, 34.4, hot ? 1.3 : 1), hot ? stormHot : storm, { group: 8 });
  r.fill(t.circ(0, 29.4, 3.5), cedar, { group: 9, bevel: 1.8 });
  r.line(t.x(-3, 31.4), t.y(-3, 31.4), t.x(3, 31.4), t.y(3, 31.4), ink, 1, 9);
  for (const sd of [-1, 1]) {
    r.fill(t.ell(sd * 1.9, 29.8, 1.1, 0.9), bone, { group: 9, flat: 3 });
    px(r, t, sd * 1.7, 29.8, hot || ph === 2 ? stormHot : storm, 3, 9);
    px(r, t, sd * 0.2, 29.8, ink, 1, 9);
  }
  r.fill(t.poly([-1.6, 28.6, 1.6, 28.6, 1.8, 26.2, 0.6, 24, -0.4, 24.2, 0.4, 25.6, -0.6, 26.6, -1.4, 27.2]), red, { group: 10, bevel: 1 });
  r.line(t.x(-1.4, 28.4), t.y(-1.4, 28.4), t.x(1.4, 28.4), t.y(1.4, 28.4), ink, 1, 10);
  px(r, t, 0.6, 24.4, ink, 1, 10);
  // Striking: arcs crackle between the horn tips.
  if (hot) {
    const k = ph & 1 ? 1 : -1;
    r.line(t.x(-4.2, 34.4), t.y(-4.2, 34.4), t.x(-2.2, 36 + k * 0.6), t.y(-2.2, 36 + k * 0.6), stormHot, 3, 11);
    r.line(t.x(-2.2, 36 + k * 0.6), t.y(-2.2, 36 + k * 0.6), t.x(-0.8, 35.2 - k * 0.6), t.y(-0.8, 35.2 - k * 0.6), storm, 3, 11);
    r.line(t.x(0.8, 35.2 + k * 0.6), t.y(0.8, 35.2 + k * 0.6), t.x(2.2, 36 - k * 0.6), t.y(2.2, 36 - k * 0.6), storm, 3, 11);
    r.line(t.x(2.2, 36 - k * 0.6), t.y(2.2, 36 - k * 0.6), t.x(4.2, 34.4), t.y(4.2, 34.4), stormHot, 3, 11);
  }
};

/** The charm that rides along: a small carved thunderbird on a stub of pole (origin at its middle). */
const thunderbirdCharm: Draw = (r, t, m) => {
  const cedar = m('k.cedar'), teal = m('k.teal'), ink = m('k.ink'), red = m('k.red');
  for (const sd of [-1, 1]) r.fill(t.poly([sd * 1, 1.6, sd * 4.2, 3.4, sd * 4, 0.8, sd * 1, -0.2]), teal, { group: 1, bevel: 0.8 });
  r.fill(t.rect(0, -1.8, 1.3, 3.6, 0.4), cedar, { group: 2, bevel: 1 });
  r.fill(t.circ(0, 2.6, 1.6), cedar, { group: 3, bevel: 1 });
  px(r, t, -0.6, 2.8, m('k.storm'), 3, 3);
  px(r, t, 0.6, 2.8, m('k.storm'), 3, 3);
  px(r, t, 0, 1.6, ink, 1, 3);
  r.line(t.x(-1.2, -3.2), t.y(-1.2, -3.2), t.x(1.2, -3.2), t.y(1.2, -3.2), red, 2, 3);
};

const thunderbird: SkinArt = {
  mats: TB.mats,
  glow: [0xf0ffff, 0x3a8aff],
  fx: { spark: 0xe8fbff, spark2: 0x4a8aff },
  icon(r, t, m) {
    thunderbirdPole(r, scaled(t, 1, 0, -18), m, 4);
  },
  proj: {
    totem: TB.sprite(8, thunderbirdPole),
    charm: TB.sprite(1, thunderbirdCharm),
  },
};

// =============================================================================
// Astral Orrery
// =============================================================================

const OR = kit({
  'k.brass': shiny(0xd8a840, undefined, 0.15),
  'k.glass': shiny(0x2a3a8a, undefined, 0.14),
  'k.star': glow(0xffe8a0),
  'k.starHot': glow(0xffffff),
  'k.mars': plain(0xe0603a),
  'k.sea': plain(0x4a90f0),
  'k.moon': plain(0xd8dce8),
  'k.sun': glow(0xffc840),
  'k.ink': plain(0x1a1430),
});

/**
 * An hourglass of deep-blue glass running with starlight instead of sand,
 * in brass caps under a little sun, inside an armillary: a tilted ring
 * round its waist carrying a red planet, and an upright ring turning about
 * the glass with a blue one (origin at its centre; 8 frames).
 */
const orrery: Draw = (r, t, m, f) => {
  const brass = m('k.brass'), star = m('k.star'), starHot = m('k.starHot'), ink = m('k.ink');
  const phi = (f / 8) * Math.PI;
  // Point on ring i at angle th: [x, y, depth] (depth > 0 is behind the glass).
  const at = (i: number, th: number): [number, number, number] => {
    if (i === 0) {
      const x = Math.cos(th) * 8.6, y = Math.sin(th) * 2.2, c = Math.cos(0.18), sn = Math.sin(0.18);
      return [x * c - y * sn, x * sn + y * c - 0.4, Math.sin(th)];
    }
    return [Math.cos(th) * Math.cos(phi) * 7.2, Math.sin(th) * 7.2, Math.cos(th) * Math.sin(phi)];
  };
  const planets: [number, number, string, number][] = [[0, 0.6 + (f / 8) * Math.PI * 2, 'k.mars', 1], [1, 0.9, 'k.sea', 1.2]];
  const ring = (back: boolean) => {
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < 80; k++) {
        const [x, y, d] = at(i, (k / 80) * Math.PI * 2);
        if ((d > 0) !== back) continue;
        px(r, t, x, y, brass, back ? 1 : x - y * 0.3 > 4 ? 4 : 3, back ? 1 : 8);
      }
    }
    // Planets ride their rings, passing behind the glass and back out.
    for (const [i, th, mat, size] of planets) {
      const [x, y, d] = at(i, th);
      if ((d > 0) !== back) continue;
      r.fill(t.circ(x, y, size + 0.9), ink, { group: 10 + i, flat: 0 });
      r.fill(t.circ(x, y, size), m(mat), { group: 10 + i, bevel: 1 });
      if (i === 1) px(r, t, x + 2, y + 1.2, m('k.moon'), 3, 12);
    }
  };
  ring(true);
  // The glass on a dark backing (this sprite has no outline: the rings stay one pixel fine).
  r.fill(t.poly([-4.8, 6.6, 4.8, 6.6, 4.4, 4.6, 1.4, 0, 4.4, -4.6, 4.8, -6.6, -4.8, -6.6, -4.4, -4.6, -1.4, 0, -4.4, 4.6]), ink, { group: 3, flat: 0 });
  r.fill(union(t.poly([-3.2, 4.8, 3.2, 4.8, 0.6, 0.4, -0.6, 0.4]), t.poly([-3.2, -4.8, 3.2, -4.8, 0.6, -0.4, -0.6, -0.4])), m('k.glass'), { group: 4, bevel: 1.4 });
  // A little starlight left in the top, a heap of it below, a mote trickling down.
  r.fill(t.poly([-1.4, 2.2, 1.4, 2.2, 0.4, 0.9, -0.4, 0.9]), star, { group: 5 });
  r.fill(t.poly([-3, -4.6, 3, -4.6, 1, -2.8, -1, -2.8]), star, { group: 5 });
  px(r, t, 0, -1 - (f % 3), starHot, 3, 5);
  for (const [x, y] of [[-1.6, 3.6], [1.4, 3.2], [-1.6, -4], [1.2, -3.6]]) px(r, t, x, y, (f >> 1) % 2 ? star : starHot, 3, 5);
  px(r, t, -2, 4, m('k.glass'), 4, 5);
  // Brass caps, the little sun on top.
  r.fill(t.rect(0, 5.6, 4.2, 0.9, 0.4), brass, { group: 6, bevel: 1 });
  r.fill(t.rect(0, -5.6, 4.2, 0.9, 0.4), brass, { group: 6, bevel: 1 });
  r.fill(t.circ(0, 7.8, 1.3), m('k.sun'), { group: 7 });
  const rays = f & 1 ? [[0, 10], [2, 7.8], [-2, 7.8]] : [[1.5, 9.3], [-1.5, 9.3], [0, 10.2]];
  for (const [x, y] of rays) px(r, t, x, y, m('k.sun'), 3, 7);
  ring(false);
};

const astralOrrery: SkinArt = {
  mats: OR.mats,
  glow: [0xfff4d0, 0x5a6aff],
  fx: { spark: 0xfff4d0, spark2: 0x6a7aff },
  icon(r, t, m) {
    orrery(r, scaled(t, 1.45), m, 1);
  },
  proj: { hourglass: OR.sprite(8, orrery, false) },
};

// =============================================================================
// Aegis Rune
// =============================================================================

const AE = kit({
  'k.gold': shiny(0xe8b440, undefined, 0.15),
  'k.face': plain(0x2a3e9a),
  'k.rune': glow(0xffd860),
  'k.runeHot': glow(0xfffbe8),
  'k.glyph': glow(0xffe8a0),
});

/** Small glyphs that circle the shield, 3 px each: Algiz, Tiwaz, Sowilo-ish marks. */
const GLYPHS = [[[0, 1], [-1, 0], [1, 0], [0, 0], [0, -1]], [[0, 1], [-1, 1], [1, 1], [0, 0], [0, -1]], [[1, 1], [0, 0], [1, -1], [0, 1]]];

/**
 * A golden heater shield with a warding rune burning on its blue face,
 * three glyphs circling it (origin at its centre; frames 0..3 rest, 4..7
 * lit, when it has just raised a shield).
 */
const aegisRune: Draw = (r, t, m, f) => {
  const lit = f >= 4, gold = m('k.gold');
  const glyphs = (back: boolean) => {
    for (let k = 0; k < 3; k++) {
      const a = ((f & 3) / 4) * (Math.PI * 2 / 3) + (k * Math.PI * 2) / 3;
      if ((Math.sin(a) > 0) !== back) continue;
      const x = Math.cos(a) * 7.6, y = Math.sin(a) * 2.6 - 0.6;
      for (const [dx, dy] of GLYPHS[k]) px(r, t, x + dx, y + dy, back ? gold : m('k.glyph'), back ? 2 : 3, back ? 1 : 9);
    }
  };
  glyphs(true);
  const shield = [-4.6, 4.8, 4.6, 4.8, 4.6, 0.6, 3.4, -2.8, 0, -6, -3.4, -2.8, -4.6, 0.6];
  r.fill(t.poly(shield), gold, { group: 3, bevel: 1.6, lightBias: lit ? 0.25 : 0 });
  r.fill(t.poly([-3.4, 3.6, 3.4, 3.6, 3.4, 0.6, 2.4, -2, 0, -4.4, -2.4, -2, -3.4, 0.6]), m('k.face'), { group: 4, bevel: 1.2, lightBias: lit ? 0.3 : 0 });
  // Algiz, the warding rune.
  const rune = lit ? m('k.runeHot') : m('k.rune');
  r.line(t.x(0, 2.8), t.y(0, 2.8), t.x(0, -3.4), t.y(0, -3.4), rune, 3, 5);
  r.line(t.x(0, -0.2), t.y(0, -0.2), t.x(-2.2, 2.4), t.y(-2.2, 2.4), rune, 3, 5);
  r.line(t.x(0, -0.2), t.y(0, -0.2), t.x(2.2, 2.4), t.y(2.2, 2.4), rune, 3, 5);
  // Rivets at the corners, a boss of light at the point when lit.
  px(r, t, -3.8, 4, gold, 4, 6);
  px(r, t, 3.8, 4, gold, 4, 6);
  if (lit) px(r, t, 0, -4.8, m('k.runeHot'), 3, 6);
  glyphs(false);
};

const aegisWard: SkinArt = {
  mats: AE.mats,
  glow: [0xfff6c8, 0xe0a030],
  fx: { spark: 0xfff6c0, spark2: 0xe0a030 },
  icon(r, t, m) {
    aegisRune(r, scaled(t, 1.6), m, 5);
  },
  proj: { ward: AE.sprite(8, aegisRune) },
};

// =============================================================================
// Sunfire Falcon
// =============================================================================

const SF = kit({
  'k.plume': plain(0xd8501e),
  'k.plumeDk': plain(0x8a1c14),
  'k.breast': plain(0xf2b23a),
  'k.beak': shiny(0x5a3a2a),
  'k.ink': plain(0x2a1418),
  'k.eye': glow(0xfff2b0),
  'k.flame': glow(0xff9a2a),
  'k.flameHot': glow(0xfff0a0),
});

/** A tongue of flame from (x, y) out along (dx, dy), `w` wide at its root, with a hot core. */
function tongue(r: Raster, t: Xf, m: (k: string) => number, x: number, y: number, dx: number, dy: number, w: number, g: number): void {
  const l = Math.hypot(dx, dy) || 1, nx = -dy / l * w, ny = dx / l * w;
  r.fill(t.poly([x + nx, y + ny, x + dx * 0.55 + nx * 0.7 + dx * 0.1, y + dy * 0.55 + ny * 0.7, x + dx, y + dy, x + dx * 0.5 - nx * 0.6, y + dy * 0.5 - ny * 0.6, x - nx, y - ny]), m('k.flame'), { group: g });
  if (l > 2.4) r.fill(t.poly([x + nx * 0.4, y + ny * 0.4, x + dx * 0.55, y + dy * 0.55, x - nx * 0.4, y - ny * 0.4]), m('k.flameHot'), { group: g });
}

/**
 * The falcon of the sun, perched and flying: the stock hawk's poses (faces
 * +x; origin at the talons, frames in specialArt's HAWK_POSES order) in
 * flame-orange and gold, its crest, wingtips and tail streaming fire.
 */
const FALCON: { rows: string[]; ax: number; ay: number }[] = [
  {
    ax: 7, ay: 13,
    rows: [
      '..H.H.......',
      '..FHF.......',
      '.GFFFG......',
      '..GFFGkkk...',
      '...GGkBBBy..',
      '.....BBewyy.',
      '.....Bcckc.Y',
      '....kBcdcc..',
      '...kBlBcdc..',
      '...kBlBdcc..',
      '...kBBlBcd..',
      '...GkBBlBc..',
      '..GFkkBBff..',
      '.GFHFG......',
      '.FHHF.......',
      'GFHF........',
      '.H.H........',
    ],
  },
  {
    ax: 7, ay: 13,
    rows: [
      '..H.H.......',
      '..FHF.......',
      '.GFFFG......',
      '..GFFGkkky..',
      '...GGkBBwyy.',
      '.....BBecc.Y',
      '.....Bcckc..',
      '....kBcdcc..',
      '...kBlBcdc..',
      '...kBlBdcc..',
      '...kBBlBcd..',
      '...GkBBlBc..',
      '..GFkkBBff..',
      '.GFHFG......',
      '.FHHF.......',
      'GFHF........',
      '.H.H........',
    ],
  },
  {
    ax: 8, ay: 13,
    rows: [
      'H.H...........',
      'FHF.....H.H...',
      'GFG.....FHF...',
      '.GBk...GFFG...',
      '..lBk..GkkkG..',
      '..klBk.kBBBy..',
      '...klBkBBewyy.',
      '....klBBBckcY.',
      '.....kBBcdcc..',
      '....kBlBBcdc..',
      '....kBBlBcc...',
      '....GkBBBcd...',
      '...GFkkBBff...',
      '..GFHFG.......',
      '..FHHF........',
      '.GFHF.........',
      '..H.H.........',
    ],
  },
  {
    ax: 8, ay: 12,
    rows: [
      '.......H.H....',
      '.......FHF....',
      '......GFFFG...',
      '.......GFkkk..',
      '.......kBBBBy.',
      '.......BBBewyy',
      '.......BBcckcY',
      '......kBBcdcc.',
      'HGkBBBBBlBcdc.',
      'FHGkllBBBBlcc.',
      'HFG.kkllBBBcd.',
      '.H...GkkkBBc..',
      '....GFkkBBff..',
      '...GFHFG......',
      '...FHHF.......',
      '..GFHF........',
      '...H.H........',
    ],
  },
  {
    ax: 11, ay: 6,
    rows: [
      '.......H.H........',
      '.......FHF.....H.H',
      '.......GFG....GFHF',
      '........GkBk..GFG.',
      '.........klBk.kkk.',
      'H.GFG.....kBBBkBewy',
      'FHFHFGkkBBBBBccccyyY',
      'H.GFG.kkkBBdcdcc...',
      '..........kBBk.....',
    ],
  },
];

const FALCON_INK: Record<string, Ink> = {
  k: ['k.plumeDk', 1], B: ['k.plume', 2], l: ['k.plume', 4], c: ['k.breast', 2], d: ['k.breast', 1], f: ['k.breast', 3],
  e: ['k.ink', 1], w: ['k.eye', 3], y: ['k.beak', 2], Y: ['k.beak', 1],
  G: ['k.flame', 1], F: ['k.flame', 3], H: ['k.flameHot', 3],
};

const sunFalcon: Draw = (r, t, m, pose) => {
  const p = FALCON[pose] ?? FALCON[0];
  pix(r, t, m, p.rows, FALCON_INK, p.ax, p.ay);
};

/** The falcon's stoop: wings swept back into a blazing dart, a trail of fire behind. */
const sunDive: Draw = (r, t0, m, f) => {
  const t = upright(t0);
  const d = f ? -0.8 : 0, plume = m('k.plume'), dk = m('k.plumeDk');
  tongue(r, t, m, -8, 0, -6 + f, 0.6, 1.8, 1);
  tongue(r, t, m, -9, 1.4, -4 - f, 2, 1, 1);
  tongue(r, t, m, -9, -1.2, -4, -1.4 - f * 0.6, 1, 1);
  r.fill(t.poly([0.5, 1.6, -3.6, 7.6 + d, -10.6, 9 + d, -5.2, 3]), dk, { group: 2, bevel: 1 });
  r.fill(t.poly([-4, 0.9, -9.6, 0.6, -9.6, -1.6, -4, -0.9]), dk, { group: 3, bevel: 1 });
  r.fill(t.ell(0, 0, 5, 2.2, -0.05), plume, { group: 3, bevel: 1.6 });
  r.fill(t.ell(0.6, -1, 3.8, 1.1), m('k.breast'), { group: 3, bevel: 1 });
  r.fill(t.circ(4.6, 0.7, 2.1), plume, { group: 3, bevel: 1.4 });
  r.fill(t.poly([6.2, 1.4, 8.6, 0.6, 8, -0.8, 6.4, -0.2]), m('k.beak'), { group: 4, bevel: 0.8 });
  px(r, t, 5.2, 1.2, m('k.eye'), 3, 4);
  r.fill(t.poly([3, 1.2, 0.4, 4.4, -4, 6.6 + d, -12.4, 7.4 + d, -7, 3.4, -2, 1.2]), plume, { group: 5, bevel: 1.2 });
  tongue(r, t, m, -9.6, 6.8 + d, -3.6, 1.2, 0.9, 5);
  r.line(t.x(-1, 3.4), t.y(-1, 3.4), t.x(-6, 5.2 + d * 0.6), t.y(-6, 5.2 + d * 0.6), m('k.breast'), 2, 5);
};

const sunfireFalcon: SkinArt = {
  mats: SF.mats,
  glow: [0xffe070, 0xe0401a],
  fx: { spark: 0xffd060, spark2: 0xe0401a, kind: 'flame' },
  icon(r, t, m) {
    // Displayed like a heraldic phoenix: wings spread wide and burning at the tips, head turned, tail of fire.
    const plume = m('k.plume'), dk = m('k.plumeDk'), breast = m('k.breast');
    for (const sd of [-1, 1]) {
      const w = (pts: number[]) => t.poly(pts.map((v, i) => (i % 2 ? v : v * sd)));
      r.fill(w([1.6, 3.4, 4.6, 8.4, 8.4, 12, 12.6, 12.4, 11, 9.6, 12.8, 8.6, 10.4, 6.2, 11.6, 4.6, 8.4, 3.2, 8.6, 1.2, 5.4, 0.6, 2.4, -1.4]), sd < 0 ? dk : plume, { group: sd < 0 ? 1 : 2, bevel: 1.6 });
      r.line(t.x(sd * 3, 2.6), t.y(sd * 3, 2.6), t.x(sd * 9, 9.6), t.y(sd * 9, 9.6), sd < 0 ? plume : breast, 2, sd < 0 ? 1 : 2);
      r.line(t.x(sd * 3.4, 0.6), t.y(sd * 3.4, 0.6), t.x(sd * 9.4, 4.4), t.y(sd * 9.4, 4.4), sd < 0 ? plume : breast, 2, sd < 0 ? 1 : 2);
      tongue(r, t, m, sd * 12, 12, sd * 1.2, 2, 0.8, 3);
      tongue(r, t, m, sd * 12.2, 8.6, sd * 1.8, 0.8, 0.7, 3);
      tongue(r, t, m, sd * 11.2, 4.4, sd * 1.8, -0.4, 0.6, 3);
    }
    tongue(r, t, m, -1.6, -6, -2.4, -6, 1.3, 3);
    tongue(r, t, m, 0.2, -6.4, 0.4, -6.8, 1.5, 3);
    tongue(r, t, m, 1.8, -6, 2.8, -5, 1.1, 3);
    r.fill(t.poly([-2.4, -3.6, 2.4, -3.6, 1.2, -7, -1.2, -7]), dk, { group: 4, bevel: 1 });
    r.fill(t.ell(0, -0.4, 3.8, 5.6), plume, { group: 4, bevel: 2.4 });
    r.fill(t.ell(0.8, -0.8, 2.3, 4.2), breast, { group: 4, bevel: 1.4 });
    for (const [x, y] of [[0.4, 1.4], [1.6, -0.2], [0.2, -1.8], [1.4, -3.2]]) px(r, t, x, y, dk, 2, 4);
    tongue(r, t, m, -0.6, 8.4, -2.6, 3.6, 1, 5);
    tongue(r, t, m, -1.6, 7.6, -3.6, 1.6, 0.8, 5);
    r.fill(t.circ(0.6, 6.2, 2.9), plume, { group: 6, bevel: 1.6 });
    r.fill(t.ell(1.8, 5.4, 1.6, 1.4), breast, { group: 6, bevel: 1 });
    r.fill(t.poly([2.6, 7.2, 5.4, 6.6, 5.2, 4.6, 4.2, 5.4, 2.8, 5.4]), m('k.beak'), { group: 7, bevel: 0.8 });
    px(r, t, 1.8, 6.8, m('k.eye'), 3, 7);
    r.line(t.x(1.4, 5.6), t.y(1.4, 5.6), t.x(1.2, 4.2), t.y(1.2, 4.2), dk, 1, 7);
    px(r, t, -0.8, -6.2, m('k.beak'), 1, 7);
    px(r, t, 1, -6.2, m('k.beak'), 1, 7);
  },
  proj: { perch: SF.sprite(5, sunFalcon), hawk: SF.sprite(2, sunDive) },
};

// =============================================================================
// Starwyrm
// =============================================================================

const SW = kit({
  'k.scale': plain(0x2a3aa0),
  'k.belly': plain(0x8a9ae8),
  'k.neb': plain(0x9a3ad0),
  'k.nebLight': plain(0xe070e0),
  'k.horn': shiny(0xd8e0f0),
  'k.eye': glow(0x8af0ff),
  'k.star': glow(0xd8e8ff),
  'k.starHot': glow(0xffffff),
  'k.mouth': plain(0x1a0a2a),
  'k.fire': glow(0x7a8aff),
  'k.fireDeep': glow(0x6a3ad8),
});

/**
 * A small cosmic dragon (faces +x; origin at its belly; frames in
 * specialArt's WHELP_POSES order): deep-blue scales freckled with stars,
 * wings of violet nebula sown with stars, pale crescent horns, glowing eyes,
 * and a long tail ending in a star. Its breath is starfire.
 */
const WYRM: { rows: string[]; ax: number; ay: number }[] = [
  {
    ax: 10, ay: 7,
    rows: [
      'b..b..b...hh......',
      'bN.bN.bN...hRRr...',
      'nbNnbSnbR.RrrrrRr.',
      'nnbnnbnnbRrrewrrro',
      '.nSnnnbnnRrrrrrrrR',
      '..nnSnnnRrsrrrRR..',
      '...NnnRRrrrrrs....',
      '......rrryyyr.....',
      '.....rrsyyyYr.....',
      '....rr.ryyYr......',
      '...rR...r..r......',
      '..rR..............',
      '.S................',
      'STS...............',
      '.S................',
    ],
  },
  {
    ax: 10, ay: 7,
    rows: [
      '..................',
      '..........hh......',
      '...........hRRr...',
      '..........RrrrrRr.',
      '.........RrrewrrroS',
      '......bbRrrrrrrrrR',
      '...bbNnnbRrsrrRR..',
      '.bNnnSnnnbrryyyr..',
      'bnnSnnbnnnbsyyYr..',
      '.bnnnbnnSnbryyYr..',
      '..b.nnb.nnbr.r....',
      '.........rR.......',
      '........rR........',
      '.......S..........',
      '......STS.........',
      '.......S..........',
    ],
  },
  {
    ax: 10, ay: 7,
    rows: [
      'b...b....hh.......',
      'bNb.bNb...hRRr....',
      'nnbNnSnb.RrrrrRr..',
      'nSnbnnnbRRrewrrro.',
      '.nnnbnSnbRrrrrrrR.',
      '..NnnnnnRrsrrRR...',
      '...NnnRRrryyyr....',
      '.......rryyyyr....',
      '......rrsyyyYr....',
      '.....rr..yyYr.....',
      '....rR...r..r.....',
      '...rR.............',
      '..S...............',
      '.STS..............',
      '..S...............',
    ],
  },
  {
    ax: 10, ay: 7,
    rows: [
      'b..b..b.....hh.......',
      'bN.bN.bN.....hRRr....',
      'nbNnbSnbR...RrrrrRr..',
      'nnbnnbnnbR.RrrewrrrF.',
      '.nSnnnbnnRRrrrrrmmFFH',
      '..nnSnnnRrsrrrtttFFS.',
      '...NnnRRrrrrrs.......',
      '......rrryyyr........',
      '.....rrsyyyYr........',
      '....rr.ryyYr.........',
      '...rR...r..r.........',
      '..rR.................',
      '.S...................',
      'STS..................',
      '.S...................',
    ],
  },
];

const WYRM_INK: Record<string, Ink> = {
  R: ['k.scale', 0], r: ['k.scale', 2], o: ['k.scale', 3], s: ['k.star', 3], y: ['k.belly', 2], Y: ['k.belly', 1],
  b: ['k.neb', 0], n: ['k.neb', 2], N: ['k.nebLight', 3], S: ['k.star', 3], T: ['k.starHot', 3],
  h: ['k.horn', 3], e: ['k.eye', 3], w: ['k.starHot', 3], m: ['k.mouth', 1], t: ['k.belly', 3],
  F: ['k.fire', 3], H: ['k.starHot', 3],
};

const starwyrmSprite: Draw = (r, t, m, pose) => {
  const p = WYRM[pose] ?? WYRM[0];
  pix(r, t, m, p.rows, WYRM_INK, p.ax, p.ay);
};

/** Starfire: a rolling puff of blue flame with white stars caught in it. */
const starBreath: Draw = (r, t, m, f) => {
  const p = [[0, 0.6, -0.4], [0.7, -0.4, 0.6], [-0.5, 0.2, 0.9]][f];
  r.fill(union(t.circ(2.4, p[0], 4.2), t.circ(-2.8, 1.8 + p[1], 3.2), t.circ(-2.4, -2 + p[2], 2.9), t.circ(-7, p[0], 2.2), t.circ(-10.4, 1 - p[1], 1.2)), m('k.fireDeep'), { group: 1 });
  r.fill(union(t.circ(2.6, p[0] * 0.5, 3.1), t.circ(-2.2, 1.2 + p[1], 2.1), t.circ(-2, -1.4 + p[2], 1.9), t.circ(-6.4, p[0], 1.2)), m('k.fire'), { group: 1 });
  r.fill(union(t.circ(3, 0, 1.8), t.circ(0.2, 0.8 + p[1] * 0.5, 1.1)), m('k.starHot'), { group: 1 });
  const stars = [[[-4, 3], [-8, -1.6]], [[-5, -2.6], [-9, 1.8]], [[-3.4, 2.8], [-7.6, -2.4]]][f];
  for (const [x, y] of stars) sparkle(r, t, x, y, m('k.starHot'), m('k.star'), 2);
};

const starwyrm: SkinArt = {
  mats: SW.mats,
  glow: [0xe8f0ff, 0x6a5aff],
  fx: { spark: 0xffffff, spark2: 0x7a6aff },
  icon(r, t, m) {
    // Sitting up like the stock whelp: nebula wing raised, star-tipped tail curled round, starfire at its snout.
    const scale = m('k.scale'), neb = m('k.neb'), star = m('k.star'), hot = m('k.starHot');
    r.fill(t.cap(-3.6, -8.4, -9.6, -9.6, 2, 0.8), scale, { group: 1, bevel: 1.4 });
    r.fill(t.cap(-9.6, -9.6, -12, -6.4, 0.8, 0.6), scale, { group: 1, bevel: 1 });
    sparkle(r, t, -12.2, -5, hot, star, 1);
    r.fill(t.poly([-2, 3, -6, 13.6, -9, 9.4, -12.6, 11, -12.4, 5, -13.4, 1.6, -9.6, 0, -6, -1]), neb, { group: 2, bevel: 1.5 });
    r.fill(t.poly([-3, 3.4, -6, 12.6, -8.6, 8.6, -6, 2]), m('k.nebLight'), { group: 2, bevel: 1 });
    for (const [a, b, c, d] of [[-2.6, 2.4, -6, 13.2], [-5.4, 1.2, -12.4, 10.6], [-7, 0.2, -13, 2]]) r.line(t.x(a, b), t.y(a, b), t.x(c, d), t.y(c, d), m('k.neb'), 0, 2);
    for (const [x, y] of [[-9.6, 6], [-11.4, 3], [-7.6, 9.6], [-5, 5.6]]) px(r, t, x, y, star, 3, 2);
    r.fill(t.ell(-1, -3.6, 6, 6.8), scale, { group: 3, bevel: 3 });
    r.fill(t.ell(1.2, -4, 3.2, 5.2, -0.2), m('k.belly'), { group: 3, bevel: 2 });
    for (const [x, y] of [[-4, -1], [-2.6, -6.4], [-5, -5], [-3, 1.6]]) px(r, t, x, y, star, 3, 3);
    r.fill(t.cap(0.4, -9, 3, -10, 1.4), scale, { group: 4, bevel: 1.2 });
    r.fill(t.cap(-4, -9, -1.6, -10.4, 1.4), scale, { group: 4, bevel: 1.2, toneBias: -1 });
    r.fill(t.cap(3, -1, 5, -3.6, 1.2), scale, { group: 4, bevel: 1.2 });
    r.fill(t.poly([-2.4, 8.4, -8.6, 10.6, -4.8, 6.6]), m('k.horn'), { group: 5, bevel: 1 });
    r.fill(t.circ(0.6, 5.6, 4.8), scale, { group: 6, bevel: 2.6 });
    r.fill(t.ell(4.8, 4.2, 3.4, 2.4, -0.15), scale, { group: 6, bevel: 1.6 });
    r.fill(t.poly([-0.6, 9.6, -6, 13.4, -1.6, 8.4]), m('k.horn'), { group: 7, bevel: 1 });
    r.fill(t.circ(1.8, 6.6, 1.5), m('k.eye'), { group: 7 });
    px(r, t, 2.2, 7.2, hot, 3, 7);
    px(r, t, -1.6, 4.4, star, 3, 7);
    px(r, t, 7, 5, m('k.mouth'), 1, 7);
    r.fill(t.poly([7.6, 3.6, 13.8, 6.4, 11.4, 3.2, 14, 0.6, 7.8, 2.2]), m('k.fire'), { group: 8 });
    r.fill(t.poly([8, 3.2, 11.6, 3.6, 8.2, 2.4]), hot, { group: 8 });
    sparkle(r, t, 12.6, 8.6, hot, star, 8);
  },
  proj: { whelp: SW.sprite(4, starwyrmSprite), breath: SW.sprite(3, starBreath, false) },
};

export const WAVE4_SPECIALS: Record<string, SkinArt> = {
  'thunder_totem.oak': oakTotem,
  'thunder_totem.thunderbird': thunderbird,
  'hourglass.obsidian': obsidianGlass,
  'hourglass.orrery': astralOrrery,
  'ward_stone.moonstone': moonstoneWard,
  'ward_stone.aegis': aegisWard,
  'hunter_hawk.snowy': snowyHawk,
  'hunter_hawk.sunfalcon': sunfireFalcon,
  'dragon_whelp.emerald': emeraldWhelp,
  'dragon_whelp.starwyrm': starwyrm,
};

