import { css } from '../../pixel/color';
import { material, type Raster, type Tex } from '../../pixel/raster';
import { arc, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { ring, type Layer } from '../../auraKit';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, glow, mats, plain, Q, shiny, veined, wrap } from './kit';

/**
 * Epic set: Starweaver. The night sky worn as armour: deep indigo cloth
 * strewn with stars that glitter, silver moons, gold stars and constellations
 * traced in faint light, with comets streaking past.
 */

/** Night indigo, its fifth tone the light of a star. */
const NIGHT = [0x10123a, 0x1c1f58, 0x2a2e76, 0x3c3e98];
const STAR = 0xfff0a0, MOON = 0xe0e8ff, VIOLET = 0x6a4ad8;
const SILVER = [0x4a5480, 0x7a86b4, 0xaab6dc, MOON, 0xffffff];
const GOLD = [0x8a5a1a, 0xc8902a, 0xf0c850, STAR, 0xffffff];
/** A star's own light: rich gold, flaring pale. */
const STARLIGHT = [0x8a5a1a, 0xd8962a, 0xffc040, 0xffdc60, 0xfff8d0];

/**
 * A starfield: a star in some cells of a grid. Each frame a quarter of them
 * flare to full starlight while the rest glow dim, so the sky glitters
 * without turning to noise. `seed` gives another sky.
 */
const starfield = (cell = 3, density = 0.32, seed = 0): Tex => (x, y, ph) => {
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
  const h = hash(cx * 7 + 3 + seed, cy * 13 + 1);
  if (h >= density) return 0;
  const sx = (cx + 0.3 + hash(cx + seed, cy + 5) * 0.4) * cell, sy = (cy + 0.3 + hash(cx + 9, cy + seed) * 0.4) * cell;
  if (Math.abs(x - sx) >= 0.5 || Math.abs(y - sy) >= 0.5) return 0;
  return wrap(Math.floor(h * 97) - ph, 4) === 0 ? 4 : 1;
};
/** A gleam sliding along polished silver, one step per frame. */
const gleam = (period = 9): Tex => (x, y, ph) => (wrap(x + y * 0.4 - ph * 2.25, period) < 1.1 ? 1 : 0);
/** Twinkle: bright on the downbeat. */
const twinkle: Tex = (_x, _y, ph) => [1, 0, 1, -1][ph % 4];

const silver = (tex: Tex | undefined = gleam(), step = 0.15) => material({ base: SILVER[2], ramp: SILVER, shiny: true, step, tex });
const FX = epicFx(0xfff4c8, VIOLET, 'twinkle', MOON);

/** A star of `n` points round (cx, cy): outer radius `R`, inner `ri`, turned by `rot`. */
function star(F: Xf, cx: number, cy: number, R: number, ri: number, n = 5, rot = 0): Shape {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + Math.PI / 2 + (i * Math.PI) / n, d = i % 2 ? ri : R;
    pts.push(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  return F.poly(pts);
}
/** A round disc as a polygon (stays round in squashed frames, unlike `circ`). */
function disc(F: Xf, cx: number, cy: number, r: number, n = 14): Shape {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) pts.push(cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r);
  return F.poly(pts);
}
/** A crescent moon: a disc at (cx, cy) with a bite taken out toward `dir`. */
function crescent(F: Xf, cx: number, cy: number, r: number, dir: number, bite = 0.42, inner = 0.82): Shape {
  return subtract(disc(F, cx, cy, r, 18), disc(F, cx + Math.cos(dir) * r * bite, cy + Math.sin(dir) * r * bite, r * inner, 18));
}
/** A twinkling sparkle: a four-point star whose rays stretch and shrink over the loop. */
function sparkle(F: Xf, cx: number, cy: number, s: number, ph: number, k = 0): Shape {
  const L = [1, 0.7, 0.9, 0.6][(ph + k) % 4] * s;
  return star(F, cx, cy, L, s * 0.24, 4);
}

// -----------------------------------------------------------------------------
// Starfall Wand
// -----------------------------------------------------------------------------

function starfall(): WeaponArt {
  // A silver wand wrapped in night-blue silk; at its head a crescent moon cradles a gold star that twinkles.
  return {
    tip: 16,
    mats: {
      shaft: silver(), grip: material(veined(NIGHT, STAR, starfield(2, 0.4))),
      band: material({ base: GOLD[2], ramp: GOLD, shiny: true }),
      moon: silver(gleam(7), 0.16),
      star: material({ base: STARLIGHT[3], glow: true, ramp: STARLIGHT, tex: twinkle }),
      hot: material({ base: 0xffffff, glow: true }),
      dust: material({ base: 0xb8a8ff, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      fillAll(r, [t.cap(-4.6, 0, 10.6, 0, 0.95, 0.7)], m('shaft'), o, 1);
      fillAll(r, [t.cap(-3.8, 0, 1.2, 0, 1.15, 1.05)], m('grip'), o, 1);
      fillAll(r, [star(t, -5.2, 0, 1.7, 0.75, 4)], m('band'), o, 0.8);
      fillAll(r, [t.rect(1.6, 0, 0.45, 1.35), t.rect(9.8, 0, 0.55, 1.45)], m('band'), o, 1);
      // The moon: a crescent opening toward the tip, its horns cradling the star.
      fillAll(r, [crescent(t, 12.4, 0, 4.4, 0, 0.5, 0.84)], m('moon'), o, 1.3);
      // The star in its cradle, twinkling, and a fleck of stardust drifting off it.
      const L = [3, 2.2, 2.7, 2][ph];
      r.fill(union(star(t, 14.2, 0, L, 0.85, 4), star(t, 14.2, 0, L * 0.55, 0.5, 4, Math.PI / 4)), m('star'), { group: g });
      r.dot(t.x(14.2, 0), t.y(14.2, 0), m('hot'), 3, g);
      const [dx, dy] = [[16.6, 2.4], [17.4, -1.6], [15.6, -3.2], [17.8, 1]][ph];
      r.dot(t.x(dx, dy), t.y(dx, dy), m(ph % 2 ? 'dust' : 'hot'), 3, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Crescent Moon
// -----------------------------------------------------------------------------

function crescentChakram(): WeaponArt {
  // A crescent-moon blade of silver with three gold stars set along it and a little star caught between its horns.
  return {
    tip: 5,
    mats: {
      blade: silver(gleam(8), 0.16), grip: material(veined(NIGHT, STAR, starfield(1.6, 0.4))),
      star: material({ base: STARLIGHT[3], glow: true, ramp: STARLIGHT, tex: twinkle }), hot: material({ base: 0xffffff, glow: true }),
      set: material({ base: GOLD[2], ramp: GOLD, shiny: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      fillAll(r, [crescent(t, 2.6, 0, 6.2, 0, 0.5, 0.82)], m('blade'), o, 1.6);
      // Gold settings along the blade, one flaring each frame.
      for (const [i, a] of [Math.PI * 0.66, Math.PI * 1.34, Math.PI].entries()) {
        const x = 2.6 + Math.cos(a) * 4.7, y = Math.sin(a) * 4.7;
        if (i === 2) continue; // under the grip
        r.fill(disc(t, x, y, 0.9, 8), m('set'), { group: g, bevel: 0.6 });
        r.dot(t.x(x, y), t.y(x, y), m(ph % 2 === i ? 'hot' : 'star'), 3, g);
      }
      fillAll(r, [t.cap(-1.2, -1.6, -1.2, 1.6, 0.95)], m('grip'), o, 1);
      // The star caught between the horns, bobbing as it twinkles.
      const bob = [0, 0.4, 0.6, 0.2][ph];
      r.fill(sparkle(t, 6.4, bob, 2.3, ph), m('star'), { group: g });
      r.dot(t.x(6.4, bob), t.y(6.4, bob), m('hot'), 3, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Battle sprites (their own materials)
// -----------------------------------------------------------------------------

const SM = mats({
  deep: { base: 0x4a2ab8, glow: true }, violet: { base: VIOLET, glow: true }, lilac: { base: 0xb0a0ff, glow: true },
  silverGlow: { base: 0xc8d4ff, glow: true }, hot: { base: 0xffffff, glow: true }, gold: { base: 0xffd858, glow: true }, goldDeep: { base: 0xf0c050, glow: true },
  moon: { base: SILVER[2], ramp: SILVER, shiny: true, step: 0.16 }, star: { base: GOLD[2], ramp: GOLD, shiny: true },
  night: { base: 0x2a2c80, glow: true, ramp: [0x0e1030, 0x181a4a, 0x22265e, 0x2c2e86, 0x4a4ab0] },
  nucleus: { base: 0xc8d4f8, ramp: [0x3a3a8a, 0x6a74c0, 0xa8b8ec, 0xe8eeff, 0xffffff], shiny: true },
});

/** Glitter scattered along a tail running back from x0 to x1 (wide `w`), reshuffled each frame. */
function glitter(r: Raster, t: Xf, f: number, x0: number, x1: number, w: number, n: number, hot: number, dim: number, g: number): void {
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const x = x0 + (x1 - x0) * u + (hash(k, f) - 0.5) * 2;
    const y = (hash(k + 7, f * 3 + 1) - 0.5) * 2 * w * (1 - u * 0.6);
    r.dot(t.x(x, y), t.y(x, y), (k + f) % 3 ? dim : hot, 3, g);
  }
}

const fallingStar: ProjArt = {
  frames: 4,
  draw(r, t, f, h) {
    // A falling star: a gold five-point star turning, trailing a glittering tail of violet and silver.
    const fl = [0, 0.5, 0, -0.5][f];
    r.fill(t.poly([1, -3.4, -7, -2.2 + fl, -17, -0.7, -22, 0, -17, 0.8, -7, 2.3 - fl, 1, 3.4]), h(SM.deep), { group: 1 });
    r.fill(t.poly([1, -2, -9, -0.7, -15, 0, -9, 0.8, 1, 2]), h(SM.lilac), { group: 1 });
    r.fill(t.poly([1, -1, -6, 0, 1, 1]), h(SM.hot), { group: 1 });
    glitter(r, t, f, -4, -21, 3, 6, h(SM.hot), h(SM.gold), 1);
    r.fill(star(t, 1.6, 0, 4.4, 1.9, 5, f * (Math.PI * 2 / 5 / 4)), h(SM.gold), { group: 2 });
    r.fill(t.circ(1.6, 0, 1.3), h(SM.hot), { group: 2 });
  },
};

const stardustWave: ProjArt = {
  frames: 4,
  draw(r, t, f, h) {
    // A breaker of the night sky rolling along the ground: indigo full of stars, its crest curling over
    // in silver foam, stardust thrown off the lip.
    const b = [0, 0.6, 1, 0.4][f], l = [0, 0.4, 0.8, 0.4][f];
    const wave = (d: number) => t.poly([
      -12 - d, 0, -10 - d, 3, -6 - d * 0.5, 6.4 + b, -1, 10.4 + b + d, 3, 13.2 + b + d, 7 + l, 12.6 + b + d, 9.8 + l + d, 10 + b,
      8.2 + l, 8.4 + b - d * 0.5, 6.4 + l * 0.5, 9.4 + b - d, 5, 8, 6, 4, 9 + d, 1.4, 11 + d, 0,
    ]);
    r.fill(wave(1), h(SM.violet), { group: 1 });
    r.fill(wave(0), h(SM.night), { group: 1 });
    r.fill(union(t.cap(-4, 8.4 + b, -1, 10.6 + b, 0.7), t.cap(-1, 10.6 + b, 3, 13.2 + b, 0.9), t.cap(3, 13.2 + b, 7 + l, 12.6 + b, 1), t.cap(7 + l, 12.6 + b, 9.4 + l, 10 + b, 0.8)), h(SM.silverGlow), { group: 1 });
    r.dot(t.x(3, 13.6 + b), t.y(3, 13.6 + b), h(SM.hot), 3, 1);
    // Stars inside the wave, a few flaring each frame.
    for (const [k, [x, y]] of ([[-8, 2], [-5, 4.6], [-2, 2.4], [0, 7], [2.4, 4.4], [3.4, 10], [-3, 7.6], [7, 2], [4.6, 1.4]] as const).entries()) {
      if ((k + f) % 4 === 0) r.fill(sparkle(t, x, y, 1.6, f, k), h(SM.hot), { group: 1 });
      else r.dot(t.x(x, y), t.y(x, y), h(k % 3 ? SM.gold : SM.lilac), 3, 1);
    }
    // Stardust off the lip.
    for (let k = 0; k < 3; k++) {
      const u = wrap(f + k * 1.3, 4) / 4;
      const x = 9.6 + l + u * 4, y = 11 + b + u * 2 - u * u * 6;
      r.dot(t.x(x, y), t.y(x, y), h(k === 1 ? SM.hot : SM.gold), 3, 1);
    }
  },
};

const crescentProj: ProjArt = {
  frames: 8,
  outline: true,
  draw(r, t, f, h) {
    // The crescent spinning, three gold stars in it, shedding a trail of stardust.
    const fl = f % 2 ? 0.5 : -0.3;
    r.fill(t.poly([-1, -3.4, -8, -2 + fl, -14, -0.4, -9, 1.6 - fl, -1, 3.4]), h(SM.deep), { group: 1 });
    r.fill(t.poly([-1, -1.6, -9, 0, -1, 1.6]), h(SM.lilac), { group: 1 });
    glitter(r, t, f, -3, -14, 2.6, 4, h(SM.hot), h(SM.gold), 1);
    const k = new Xf(t.ox, t.oy, -f * (Math.PI / 4));
    r.fill(crescent(k, 0, 0, 6.6, 0, 0.5, 0.82), h(SM.moon), { group: 2, bevel: 1.4 });
    for (const a of [Math.PI * 0.68, Math.PI, Math.PI * 1.32]) r.fill(disc(k, Math.cos(a) * 5, Math.sin(a) * 5, 0.9, 8), h(SM.star), { group: 3, bevel: 0.6 });
    r.dot(k.x(-5, 0), k.y(-5, 0), h(SM.hot), 3, 3);
  },
};

const cometProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A comet: an icy silver head in a glowing coma, a gold flare on it, and a long sparkling tail.
    const fl = [0, 1, 0, -1][f];
    r.fill(t.poly([4, -7.6, -6, -6.6 + fl, -20, -4, -36 - fl * 2, -0.6, -40, 0, -36, 1, -20, 4, -6, 6.6 - fl, 4, 7.6]), h(SM.deep), { group: 1 });
    r.fill(t.poly([3, -5.4, -8, -4 - fl * 0.5, -22, -1.4, -30, 0, -22, 1.6, -8, 4 + fl * 0.5, 3, 5.4]), h(SM.violet), { group: 1 });
    r.fill(t.poly([2, -3.4, -10, -1.6, -20 - fl, 0, -10, 1.6, 2, 3.4]), h(SM.silverGlow), { group: 1 });
    r.fill(t.poly([1, -1.4, -12, 0, 1, 1.4]), h(SM.hot), { group: 1 });
    glitter(r, t, f, -6, -38, 5.6, 9, h(SM.hot), h(SM.gold), 1);
    r.fill(t.circ(3, 0, 6.6), h(SM.violet), { group: 1 });
    r.fill(t.circ(3.4, 0, 5), h(SM.lilac), { group: 1 });
    r.fill(disc(t, 4, 0, 3.6, 12), h(SM.nucleus), { group: 2, bevel: 2 });
    // The flare: a four-point star across the head, turning between its two orientations.
    r.fill(star(t, 5, 0.6, [8.4, 6.4, 7.6, 5.8][f], 0.9, 4, f % 2 ? Math.PI / 4 : 0), h(SM.gold), { group: 3 });
    r.fill(disc(t, 5, 0.6, 1.5, 8), h(SM.hot), { group: 3 });
  },
};

/** Points of the constellation inside the sigil (a long-handled dipper), radius about 5. */
const DIPPER = [[-6.6, 2.4], [-3.8, 3.6], [-1, 2.6], [1.6, 0.8], [2.2, -2.8], [6, -2.6], [6.4, 1.2]] as const;

const constellationSigil: ProjArt = {
  frames: 16,
  draw(r, t, f, h) {
    // A circle of night: the outer ring of stars turns one way, a constellation inside turns the other,
    // a crescent moon at the heart.
    const outer = f * (Math.PI * 2 / 8 / 16);
    r.fill(arc(t.ox, t.oy, 10, 10.9, -Math.PI, Math.PI), h(SM.violet), { group: 1 });
    for (let i = 0; i < 8; i++) {
      const a = outer + (i * Math.PI) / 4;
      const x = Math.cos(a) * 10.4, y = Math.sin(a) * 10.4;
      if (i % 2) r.dot(t.x(x, y), t.y(x, y), h(SM.hot), 3, 1);
      else r.fill(sparkle(t, x, y, 2.2, Math.floor(f / 4), i), h(SM.gold), { group: 1 });
      const b = a + Math.PI / 8;
      r.dot(t.x(Math.cos(b) * 8.8, Math.sin(b) * 8.8), t.y(Math.cos(b) * 8.8, Math.sin(b) * 8.8), h(SM.lilac), 3, 1);
    }
    const inner = new Xf(t.ox, t.oy, -f * (Math.PI * 2 / 16));
    for (let i = 1; i < DIPPER.length; i++) {
      const [ax, ay] = DIPPER[i - 1], [bx, by] = DIPPER[i];
      r.line(inner.x(ax, ay), inner.y(ax, ay), inner.x(bx, by), inner.y(bx, by), h(SM.silverGlow), 3, 1);
    }
    r.line(inner.x(1.6, 0.8), inner.y(1.6, 0.8), inner.x(6.4, 1.2), inner.y(6.4, 1.2), h(SM.silverGlow), 3, 1);
    for (const [i, [x, y]] of DIPPER.entries()) if ((i + f) % 4 === 0) r.fill(sparkle(inner, x, y, 1.8, 0), h(SM.hot), { group: 1 });
    else r.fill(disc(inner, x, y, 0.9, 6), h(SM.gold), { group: 1 });
    r.fill(crescent(t, -0.6, -0.8, 1.8, 0.6, 0.5, 0.8), h(SM.lilac), { group: 1 });
  },
};

const comet: SkinArt = {
  mats: {
    // Stock names: the meteor, its rune circle and its icon pieces, for anything drawn the stock way.
    sigil: glow(VIOLET), rock: shiny(0xa8b8ec, undefined, 0.16), ember: glow(STAR),
    lava: glow(0xb0a0ff), lavaHot: glow(0xffffff), fire: glow(VIOLET), fireHot: glow(MOON), fireDeep: glow(0x4a2ab8),
    'k.deep': glow(0x4a2ab8), 'k.violet': glow(VIOLET), 'k.lilac': glow(0xb0a0ff), 'k.silver': glow(0xc8d4ff), 'k.hot': glow(0xffffff),
    'k.gold': glow(0xffd858), 'k.head': { base: 0xc8d4f8, ramp: [0x3a3a8a, 0x6a74c0, 0xa8b8ec, 0xe8eeff, 0xffffff], shiny: true },
  },
  glow: [0xeef0ff, 0x5a3ad0],
  icon(r, t, m) {
    // A comet streaking down across a ring of night, a constellation traced behind it.
    r.fill(arc(t.ox, t.oy, 11.2, 12.6, -Math.PI, Math.PI), m('k.violet'), { group: 1 });
    const cons = [[-8.4, 3.4], [-5, 7.4], [-1, 6.4], [1.6, 9.4]] as const;
    for (let i = 1; i < cons.length; i++) r.line(t.x(cons[i - 1][0], cons[i - 1][1]), t.y(cons[i - 1][0], cons[i - 1][1]), t.x(cons[i][0], cons[i][1]), t.y(cons[i][0], cons[i][1]), m('k.lilac'), 3, 1);
    for (const [x, y] of cons) r.fill(disc(t, x, y, 0.9, 6), m('k.gold'), { group: 1 });
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * 0.25 + (i * Math.PI) / 2;
      r.fill(star(t, Math.cos(a) * 11.9, Math.sin(a) * 11.9, 2.6, 0.6, 4), m('k.gold'), { group: 1 });
    }
    // The comet runs from top right to bottom left; its tail streams back up and to the right.
    const C = new Xf(t.x(-3.4, -3.4), t.y(-3.4, -3.4), Math.PI * 1.25);
    r.fill(C.poly([2, -5.4, -6, -4.6, -14, -2.6, -20, 0, -14, 2.6, -6, 4.6, 2, 5.4]), m('k.deep'), { group: 2 });
    r.fill(C.poly([1, -3.6, -8, -2.2, -16, 0, -8, 2.2, 1, 3.6]), m('k.violet'), { group: 2 });
    r.fill(C.poly([1, -2, -10, 0, 1, 2]), m('k.silver'), { group: 2 });
    for (const [x, y] of [[-9, 3], [-12, -2], [-16, 1], [-6, -3.4], [-18.6, -0.8]] as const) r.dot(C.x(x, y), C.y(x, y), m('k.hot'), 3, 2);
    r.fill(C.circ(1.4, 0, 4.4), m('k.lilac'), { group: 2 });
    r.fill(C.circ(1.8, 0, 3), m('k.head'), { group: 3, bevel: 2 });
    r.fill(star(t, -2.8, -2.8, 6.4, 0.9, 4), m('k.gold'), { group: 4 });
    r.fill(t.circ(-2.8, -2.8, 1.3), m('k.hot'), { group: 4, noLine: true });
  },
  proj: { meteor: cometProj, sigil: constellationSigil },
};

// -----------------------------------------------------------------------------
// Circlet of the Moon
// -----------------------------------------------------------------------------

function moonCirclet(): SkinArt {
  // A fine silver circlet set with gold stars; a crescent moon rises from the brow holding a star,
  // and a tiny star orbits it, passing behind and in front.
  return {
    head: () => ({
      mats: {
        'h.silver': material({ base: 0x8a96c0, ramp: [0x3a4270, 0x5a6696, 0x8a96c0, 0xb8c4e6, MOON], step: 0.15, tex: gleam(8) }), 'h.moon': silver(undefined, 0.16),
        'h.gold': material({ base: GOLD[2], ramp: GOLD, shiny: true }),
        'h.star': material({ base: STARLIGHT[3], glow: true, ramp: STARLIGHT, tex: twinkle }), 'h.hot': material({ base: 0xffffff, glow: true }),
        'h.trail': material({ base: 0xb0a0ff, glow: true }),
      },
      draw(r, H, m, g) {
        const ph = r.phase % 4;
        const cx = 5.6, cy = 7.6;
        // The orbiting star: a quarter turn per frame round the moon, a dim trail behind it.
        const a = ph * Q + 0.5;
        const ox = cx + Math.cos(a) * 4.4, oy = cy + Math.sin(a) * 1.8 + 0.4;
        const front = Math.sin(a) < 0;
        const orbit = () => {
          const b = a - 0.6;
          r.dot(H.x(cx + Math.cos(b) * 4.4, cy + Math.sin(b) * 1.8 + 0.4), H.y(cx + Math.cos(b) * 4.4, cy + Math.sin(b) * 1.8 + 0.4), m('h.trail'), 3, g);
          r.fill(star(H, ox, oy, 1.3, 0.45, 4), m('h.star'), { group: g });
          r.dot(H.x(ox, oy), H.y(ox, oy), m('h.hot'), 3, g);
        };
        if (!front) orbit();
        r.fill(H.cap(-6.4, 2.2, 6.6, 3.4, 0.55), m('h.silver'), { group: g, bevel: 1, local: H });
        for (const x of [-3.6, -0.4, 2.8]) r.dot(H.x(x, 2.6 + x * 0.09 + 0.5), H.y(x, 2.6 + x * 0.09 + 0.5), m('h.gold'), 4, g);
        // The crescent standing on the brow, horns up, a star sitting in its bowl.
        r.fill(H.poly([4.8, 3, 7, 3.2, 6.4, 4.8, 5.4, 4.8]), m('h.silver'), { group: g, bevel: 0.8 });
        r.fill(crescent(H, cx, cy, 3.8, Math.PI / 2 - 0.15, 0.5, 0.78), m('h.moon'), { group: g, bevel: 1.2, local: H });
        const L = [2.7, 2, 2.4, 1.8][ph], sx = cx + 0.3, sy = cy + 1.7;
        r.fill(union(star(H, sx, sy, L, 0.7, 4), star(H, sx, sy, L * 0.5, 0.45, 4, Math.PI / 4)), m('h.star'), { group: g });
        r.dot(H.x(sx, sy), H.y(sx, sy), m('h.hot'), 3, g);
        if (front) orbit();
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Robe of the Night Sky
// -----------------------------------------------------------------------------

function nightRobe(): SkinArt {
  // Indigo cloth that is the night itself: a glittering starfield, constellations
  // traced across the chest and skirt, a silver crescent clasp, a hem of crescent moons and a starry violet mantle.
  const sky = veined(NIGHT, 0xf4f0ff, starfield(3, 0.28));
  return {
    mats: {
      robe: sky, robeTrim: shiny(SILVER[2], gleam(10)),
      'k.mantle': veined([0x150f3e, 0x241a62, 0x362a86, 0x4c3cae], 0xf4f0ff, starfield(2.8, 0.3, 5)), 'k.trim': shiny(SILVER[2], gleam(10)),
      'k.line': plain(0x8a84d8), 'k.star': glow(STAR), 'k.hot': glow(0xffffff),
      'k.moon': { base: SILVER[2], ramp: SILVER, shiny: true, step: 0.16 },
    },
    chest: {
      cape: null, hood: null,
      back(r, T, m, c) {
        // The mantle: hung from the shoulders, swaying behind, its hem rippling, edged in silver.
        const top = c.top, s = c.sway * 3, rip = [0, 0.6, 1, 0.4][r.phase % 4];
        // `d` grows the outline outward for the silver edge.
        const pts = (d: number) => T.poly([
          0, top + 0.8 + d * 0.4, -4.4 - d * 0.6, top - 0.2 + d * 0.4, -8 - s * 0.6 - d, top - 6, -10 - s - d, -4 + rip * 0.4,
          -11.6 - s * 1.3 - d, -12.6 - d + rip, -8.4 - s * 1.1, -11.4 - d - rip * 0.5, -5 - s * 0.8, -12.2 - d + rip * 0.3, -1.6, -6, -0.6, 0,
        ]);
        r.fill(pts(0.8), m('k.trim'), { group: c.g, bevel: 1.2, toneBias: -1, local: T });
        r.fill(pts(0), m('k.mantle'), { group: c.g, bevel: 2.4, noLine: true, local: T });
        // A constellation on the mantle too.
        const cons = [[-6.6 - s * 0.5, top - 4.4], [-8.4 - s * 0.7, -1.4], [-6.4 - s * 0.7, -4.6], [-8.8 - s * 1.1, -9]] as const;
        for (let i = 1; i < cons.length; i++) r.line(T.x(cons[i - 1][0], cons[i - 1][1]), T.y(cons[i - 1][0], cons[i - 1][1]), T.x(cons[i][0], cons[i][1]), T.y(cons[i][0], cons[i][1]), m('k.line'), 1, c.g);
        for (const [i, [x, y]] of cons.entries()) r.dot(T.x(x, y), T.y(x, y), m((i + r.phase) % 4 === 1 ? 'k.hot' : 'k.star'), 3, c.g);
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top;
        // A constellation across the chest: faint lines, gold stars at the joints, one flaring each frame.
        const fx = b.chestPush * 0.5;
        const chest = [[fx - 2.4, top - 3.4], [fx - 0.4, top - 5.2], [fx + 1.6, top - 4.2], [fx + 1.2, top - 7.6], [fx - 1.2, top - 9]] as const;
        const lines = (pts: readonly (readonly [number, number])[], k: number) => {
          for (let i = 1; i < pts.length; i++) r.line(T.x(pts[i - 1][0], pts[i - 1][1]), T.y(pts[i - 1][0], pts[i - 1][1]), T.x(pts[i][0], pts[i][1]), T.y(pts[i][0], pts[i][1]), m('k.line'), 2, c.g);
          for (const [i, [x, y]] of pts.entries()) r.dot(T.x(x, y), T.y(x, y), m((i + r.phase + k) % 4 === 0 ? 'k.hot' : 'k.star'), 3, c.g);
        };
        lines(chest, 0);
        // And one on the skirt, wheeling with the hem's sway.
        const leg = b.thigh + b.shin, len = leg * 0.62, sw = c.sway * 1.1;
        lines([[-0.6 - sw * 0.3, -2.6], [1.4 - sw * 0.5, -4.6], [0.4 - sw * 0.6, -7], [2.8 - sw * 0.8, -8.4]], 2);
        // A border of crescent moons, horns up, along the hem, a full moon at its middle.
        const n = 5, x0 = -b.hipW - 0.6, x1 = b.hipW + 1.8;
        for (let k = 0; k < n; k++) {
          const x = x0 + ((x1 - x0) * k) / (n - 1) - c.sway * 2.2 * (0.45 + k * 0.06), y = -len + 1.5 + (k / (n - 1)) * -0.5;
          if (k === 2) r.fill(disc(T, x, y + 0.2, 1.3, 12), m('k.moon'), { group: c.g, bevel: 0.8 });
          else r.fill(crescent(T, x, y, 1.4, Math.PI / 2, 0.55, 0.8), m('k.moon'), { group: c.g, bevel: 0.6 });
        }
        // A silver crescent clasp at the collar, a gold star in its arms.
        const cx = b.chestPush * 0.7 + 1, cy = top - 1.6;
        r.fill(crescent(T, cx, cy, 1.7, 0.4, 0.5, 0.78), m('k.moon'), { group: c.g, bevel: 0.8 });
        r.dot(T.x(cx + 0.7, cy + 0.3), T.y(cx + 0.7, cy + 0.3), m('k.star'), 3, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Comet Striders
// -----------------------------------------------------------------------------

function cometStriders(): SkinArt {
  // Night-sky boots with silver cuffs and toecaps; a gold star at each heel streams a comet's tail where the feather was.
  return {
    mats: {
      leap: veined(NIGHT, 0xf4f0ff, starfield(2.4, 0.32, 3)), leapTrim: shiny(SILVER[2], gleam(6)),
      'k.silver': { base: SILVER[2], ramp: SILVER, shiny: true, step: 0.16 },
      'k.star': { base: GOLD[2], ramp: GOLD, shiny: true },
      'k.tail': glow(VIOLET), 'k.tailHi': glow(0xc8d4ff), 'k.hot': glow(0xffffff), 'k.gold': glow(STAR),
    },
    boots: {
      wing: null,
      over(r, _shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4;
        r.fill(foot.cap(c.toe - 1.8, -0.4, c.toe - 0.4, -0.7, 0.75, 0.6), m('k.silver'), { ...o, bevel: 0.6 });
        // The heel star, and off it a comet's tail streaming back and up in three streaks, flickering.
        const hx = -1.6, hy = 0.2;
        if (!c.far) {
          const fl = [0, 0.8, 1.3, 0.5][ph];
          r.fill(union(
            foot.cap(hx, hy, hx - 7.4 - fl, hy + 3 + fl * 0.3, 1.5, 0.3),
            foot.cap(hx, hy, hx - 5.4 - fl * 0.6, hy + 5.4 + fl * 0.4, 1.1, 0.25),
            foot.cap(hx, hy, hx - 6 - fl * 0.8, hy + 0.6, 1.1, 0.25),
          ), m('k.tail'), { group: c.g });
          r.fill(foot.cap(hx, hy, hx - 5.4 - fl, hy + 2.4, 0.9, 0.2), m('k.tailHi'), { group: c.g });
          for (const [k, [x, y]] of ([[-5.6, 3.6], [-8.4, 3.2], [-6.4, 5.8], [-7.6, 1]] as const).entries()) {
            if ((k + ph) % 4 === 3) continue;
            const j = (k + ph) % 3;
            r.dot(foot.x(hx + x - fl * 0.7, hy + y), foot.y(hx + x - fl * 0.7, hy + y), m(j ? 'k.gold' : 'k.hot'), 3, c.g);
          }
        }
        r.fill(star(foot, hx, hy, 2, 0.85, 5, ph * (Math.PI * 2 / 5 / 4)), m('k.star'), { ...o, bevel: 0.6 });
        r.dot(foot.x(hx, hy), foot.y(hx, hy), m(ph % 2 ? 'k.gold' : 'k.hot'), 3, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Set FX and aura
// -----------------------------------------------------------------------------

/** Particles the full set sheds in battle. */
export const STARWEAVER_FX: SkinFx = { spark: 0xfff4c8, spark2: VIOLET, kind: 'twinkle' };

const A = {
  dust: css(0x4a3ab0), line: css(0x8a84d8), star: css(STAR), hot: css(0xffffff), moon: css(MOON), moonDk: css(0x7a86b4),
};
/** The constellation ringing the feet: angle offsets and ellipse scale of each star. */
const RING_STARS = [[0, 1], [0.8, 0.86], [1.7, 1.08], [2.5, 0.92], [3.3, 1.04], [4.1, 0.88], [5, 1.1], [5.7, 0.94]] as const;

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function starweaverAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  // A faint dusting of violet on the ground.
  g.globalAlpha = 0.45;
  g.fillStyle = A.dust;
  ring(g, x, y, 15, 3.6, 30, layer, (g, px, py, i) => { if (i % 3 === 0) g.fillRect(px, py, 1, 1); });
  // A constellation turning slowly round the feet: stars joined by faint lines.
  const spin = t * 0.35, RX = 17, RY = 4.4;
  const pos = (k: number, u = 0): [number, number, number] => {
    const [a0, s0] = RING_STARS[k], [a1, s1] = RING_STARS[(k + 1) % RING_STARS.length];
    const a = spin + a0 + ((a1 < a0 ? a1 + Math.PI * 2 : a1) - a0) * u, s = s0 + (s1 - s0) * u;
    return [x + Math.cos(a) * RX * s, y + Math.sin(a) * RY * s, Math.sin(a)];
  };
  g.globalAlpha = 0.5;
  g.fillStyle = A.line;
  for (let k = 0; k < RING_STARS.length; k++) {
    for (const u of [0.3, 0.5, 0.7]) {
      const [px, py, s] = pos(k, u);
      if ((s < 0) === (layer === 'back')) g.fillRect(Math.round(px), Math.round(py), 1, 1);
    }
  }
  g.globalAlpha = 1;
  for (let k = 0; k < RING_STARS.length; k++) {
    const [px, py, s] = pos(k);
    if ((s < 0) !== (layer === 'back')) continue;
    const X = Math.round(px), Y = Math.round(py);
    const tw = Math.sin(t * 3.2 + k * 2.1);
    g.fillStyle = tw > 0.55 ? A.hot : A.star;
    g.fillRect(X, Y, 1, 1);
    if (tw > 0.55) { g.fillStyle = A.star; g.fillRect(X - 1, Y, 3, 1); g.fillRect(X, Y - 1, 1, 3); }
  }
  // A small moon orbiting at the waist, lit on its outer side.
  const a = t * 0.9, s = Math.sin(a);
  if ((s < 0) !== (layer === 'back')) return;
  const mx = Math.round(x + Math.cos(a) * 15), my = Math.round(y - 20 + s * 3);
  // A crescent, its horns turned away from the fighter.
  const d = Math.cos(a) < 0 ? -1 : 1;
  g.fillStyle = A.moonDk; g.fillRect(mx - d, my - 3, 1, 1); g.fillRect(mx - d, my + 3, 1, 1);
  g.fillStyle = A.moon; g.fillRect(mx - 1, my - 2, 2, 1); g.fillRect(mx - 1, my + 2, 2, 1); g.fillRect(mx + (d > 0 ? -2 : 1), my - 1, 1, 3);
  g.fillStyle = A.hot; g.fillRect(mx + (d > 0 ? -2 : 1), my, 1, 1);
}

export const STARWEAVER: Record<string, SkinArt> = {
  'ember_wand.starfall': { weapon: starfall, proj: { fire: fallingStar, flamewave: stardustWave }, ...FX },
  'wind_chakram.crescent': { weapon: crescentChakram, proj: { chakram: crescentProj }, ...FX },
  'meteor_sigil.comet': comet,
  'chrono_circlet.moon': moonCirclet(),
  'mage_robe.nightsky': nightRobe(),
  'leaping_boots.comet': cometStriders(),
};
