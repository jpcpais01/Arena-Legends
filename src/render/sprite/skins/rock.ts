import { css } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash, lattice } from '../../pixel/tex';
import { ring, type Layer } from '../../auraKit';
import { hairCap } from '../draw';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { HeadSkin } from './heads';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, glow, mats, plain, shiny, wrap } from './kit';

/**
 * Mythic set: The People's Champion. The Great One himself: a polished bald
 * dome and the People's Eyebrow raised, the Brahma Bull inked on a slab of
 * shoulder, a body that is all muscle, black trunks, knee pads and boots,
 * black tape round the fists, the mic in the off hand, and floating at his
 * shoulder a pot on a red-hot stone. When the energy bar fills he throws the
 * whole pot of soup at the enemy: can you smell what he's cooking?
 * Night accents: the shine on the dome, the bull's ruby eyes on the gold
 * emblems, the mic's live light, the stone's glowing cracks and the broth.
 */

/** Black leather, tape and trunks, the top tone the gloss. */
const ONYX = [0x08070a, 0x151216, 0x262024, 0x3e3438, 0x76686c];
/** Championship gold. */
const GOLD = [0x5c3206, 0x9e660e, 0xdcaa22, 0xffdc50, 0xfff8c8];
/** The bull's ruby eyes (self-lit at night). */
const RUBY = [0x420810, 0x82121e, 0xd0242e, 0xff5a50, 0xffc4b8];
/** Mic chrome. */
const CHROME = [0x2a2e38, 0x5a606e, 0x9aa2b0, 0xd4dae4, 0xffffff];
/** Hot stone: dark basalt, its cracks glowing. */
const STONE = [0x1a1410, 0x30261e, 0x4a3c30, 0x6a5644, 0xff8a2a];
/** Cast iron. */
const IRON = [0x0a0a0e, 0x18181e, 0x2a2a32, 0x464652, 0x9a9aa8];
/** The broth: rich and golden-brown, the top tone the light on it. */
const BROTH = [0x5a2408, 0x9a4a12, 0xd07a28, 0xf0b050, 0xfff0b0];
/** The ladle's wood. */
const WOOD = [0x3a2010, 0x5a3418, 0x8a5428, 0xb07a40, 0xd8a868];
const WHITE = 0xffffff;

/** Tape wound in turns: a glossy seam every turn. */
const turns: Tex = (x, y) => (wrap(x * 0.9 + y * 0.35, 1.7) < 0.4 ? 1 : 0);
/** A glint sliding along gold. */
const sweep = (period = 9, speed = 2.25, w = 1): Tex => (x, y, ph) => (wrap(x * 0.8 + y * 0.45 - ph * speed, period) < w ? 1 : 0);
/** Cracks in the hot stone, breathing over the loop. */
const cracks: Tex = (x, y, ph) => {
  const v = Math.sin(x * 0.75 + Math.sin(y * 1.4) * 2) + Math.sin(y * 1.1 - x * 0.3) * 0.6;
  return Math.abs(v) < (ph % 2 ? 0.3 : 0.22) ? 2 : 0;
};
/** Light rolling on the broth. */
const simmer: Tex = (x, y, ph) => (Math.sin(x * 0.9 + ph * 1.6) + Math.sin(y * 1.3 - x * 0.4 + ph) > 1.3 ? 1 : 0);

const S = {
  onyx: (tex?: Tex): MaterialSpec => ({ base: ONYX[2], ramp: ONYX, shiny: true, step: 0.14, tex }),
  matte: (): MaterialSpec => ({ base: ONYX[2], ramp: ONYX }),
  gold: (tex?: Tex): MaterialSpec => ({ base: GOLD[2], ramp: GOLD, shiny: true, step: 0.15, tex }),
  ruby: (): MaterialSpec => ({ base: RUBY[3], ramp: RUBY, glow: true }),
  white: (tex?: Tex): MaterialSpec => ({ base: 0xe8e4dc, ramp: [0x8a8478, 0xb8b2a6, 0xe0dcd2, 0xf6f2ea, 0xffffff], tex }),
};

/** Gold glitter and white camera flashes; a swing trails gold. */
const FX = epicFx(0xfff0a0, 0xffffff, 'twinkle', 0xffe080);

/** Particles the full set sheds in battle: gold glitter and electric blue sparks. */
export const ROCK_FX: SkinFx = { spark: 0xfff0a0, spark2: 0x8ad8ff, kind: 'twinkle' };

// -----------------------------------------------------------------------------
// The Brahma Bull
// -----------------------------------------------------------------------------

/** A Brahma bull's head at (x, y) of F, `s` its scale (about 6.4 wide and 4.6 tall at 1): wide horns sweeping up, a long face. */
function bull(F: Xf, x: number, y: number, s: number): Shape {
  const q = (u: number, v: number) => [x + u * s, y + v * s];
  const horn = (k: number) => F.poly([...q(-1 * k, 0.9), ...q(-2.2 * k, 1.1), ...q(-3.2 * k, 2.3), ...q(-3.1 * k, 1.0), ...q(-2.2 * k, 0.1), ...q(-1 * k, 0.1)]);
  const face = F.poly([...q(-1.3, 1.2), ...q(1.3, 1.2), ...q(1.1, -0.4), ...q(0.6, -2.2), ...q(0, -2.5), ...q(-0.6, -2.2), ...q(-1.1, -0.4)]);
  return union(horn(1), horn(-1), face);
}

/** The bull's two eyes, pixel points. */
function bullEyes(F: Xf, x: number, y: number, s: number): [number, number][] {
  return [-1, 1].map((k) => [Math.round(F.x(x + k * 0.55 * s, y + 0.2 * s)), Math.round(F.y(x + k * 0.55 * s, y + 0.2 * s))]);
}

/** A gold bull emblem with ruby eyes (small ones get one eye pixel each, or none when tiny). */
function bullEmblem(r: Raster, F: Xf, x: number, y: number, s: number, gold: number, ruby: number, g: number, bias = 0): void {
  r.fill(bull(F, x, y, s), gold, { group: g, bevel: 0.5, toneBias: bias });
  if (s >= 0.5) for (const [ex, ey] of bullEyes(F, x, y, s)) r.dot(ex, ey, ruby, 3, g);
  else r.dot(Math.round(F.x(x, y + 0.1 * s)), Math.round(F.y(x, y + 0.1 * s)), ruby, 3, g);
}

// -----------------------------------------------------------------------------
// The Rock's Taped Fists (spiked knuckles)
// -----------------------------------------------------------------------------

function fists(): WeaponArt {
  // No brass: just black athletic tape wound round the wrists with white edges, a strip across the palm and
  // a band over the knuckles, and on the back of each wrist a little gold Brahma bull with ruby eyes.
  return {
    tip: 6,
    mats: {
      tape: material(S.onyx(turns)), edge: material(S.white()), gold: material(S.gold(sweep(7, 1.75, 0.9))), ruby: material(S.ruby()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      // Wound round the wrist, a white edge at either end.
      fillAll(r, [t.cap(-4.9, 0, -1.5, 0, 1.95, 2.15)], m('tape'), o, 1.2);
      for (const x of [-4.5, -1.8]) r.line(t.x(x - 0.3, -2), t.y(x - 0.3, -2), t.x(x + 0.3, 2.1), t.y(x + 0.3, 2.1), m('edge'), 2, g);
      // A band over the knuckles, a strip across the palm.
      r.fill(intersect(t.circ(0, 0, 2.6), t.rect(1.45, 0, 0.6, 3)), m('tape'), { group: g, bevel: 0.6, toneBias: o.toneBias, local: o.local });
      r.line(t.x(-1.2, -1.8), t.y(-1.2, -1.8), t.x(1.1, -1.4), t.y(1.1, -1.4), m('tape'), 1, g);
      // The bull on the back of the wrist.
      bullEmblem(r, new Xf(t.x(-3.2, 2.1), t.y(-3.2, 2.1), t.ang - Math.PI / 2, t.sx, t.sy), 0, 0, 0.42, m('gold'), m('ruby'), g, o.toneBias);
    },
  };
}

// -----------------------------------------------------------------------------
// The People's Mic (war horn)
// -----------------------------------------------------------------------------

function mic(): WeaponArt {
  // A black handheld microphone: a chrome grille on top, a gold ring under it, the mic flag (a black cube
  // with a gold bull on it) and a red live light that blinks, the cable trailing from the bottom.
  return {
    tip: 9.6,
    mats: {
      body: material(S.onyx()), grille: material({ base: CHROME[3], ramp: CHROME, shiny: true, step: 0.16, tex: lattice(2, -1) }),
      chrome: material({ base: CHROME[2], ramp: CHROME, shiny: true }), gold: material(S.gold()), flag: material(S.matte()),
      cable: material({ base: ONYX[1], ramp: ONYX }), live: material(S.ruby()), ruby: material(S.ruby()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // The cable out of the bottom, looping down.
      const cab: [number, number][] = [[-2.6, 0], [-3.8, -0.8], [-4.6, -2.4], [-4, -3.8], [-5, -5], [-6.4, -5.4]];
      for (let i = 0; i < cab.length - 1; i++) r.line(t.x(cab[i][0], cab[i][1]), t.y(cab[i][0], cab[i][1]), t.x(cab[i + 1][0], cab[i + 1][1]), t.y(cab[i + 1][0], cab[i + 1][1]), m('cable'), 1, g);
      // The handle, tapering to the bottom; a chrome cap at its end.
      fillAll(r, [t.cap(-2.4, 0, 5.2, 0, 0.85, 1.15)], m('body'), o, 1);
      fillAll(r, [t.rect(-2.4, 0, 0.35, 0.75, 0.2)], m('chrome'), o, 0.5);
      // The live light.
      r.dot(t.x(1.4, 0.9), t.y(1.4, 0.9), m('live'), ph < 2 ? 4 : 2, g);
      // The mic flag: a black cube, a gold bull on its face.
      fillAll(r, [t.rect(3.6, 0, 1.3, 1.9, 0.3)], m('flag'), o, 0.9);
      bullEmblem(r, new Xf(t.x(3.6, 0), t.y(3.6, 0), t.ang - Math.PI / 2, t.sx, t.sy), 0, 0.4, 0.4, m('gold'), m('ruby'), g, o.toneBias);
      // The gold ring, then the grille.
      fillAll(r, [t.rect(5.5, 0, 0.45, 1.25, 0.2)], m('gold'), o, 0.6);
      fillAll(r, [t.circ(7.6, 0, 2.4)], m('grille'), o, 1.8);
      r.dot(t.x(8.2, 1), t.y(8.2, 1), m('chrome'), 4, g);
    },
  };
}

// -----------------------------------------------------------------------------
// What The Rock Is Cooking (meteor sigil)
// -----------------------------------------------------------------------------

const KITCHEN: Record<string, MaterialSpec> = {
  'k.stone': { base: STONE[2], ramp: STONE, tex: cracks },
  'k.ember': glow(0xff7a20),
  'k.heat': glow(0xffc060),
  'k.iron': { base: IRON[2], ramp: IRON, shiny: true, step: 0.14 },
  'k.rim': { base: IRON[3], ramp: IRON, shiny: true, step: 0.14 },
  'k.broth': { base: BROTH[2], ramp: BROTH, shiny: true, step: 0.14, tex: simmer },
  'k.brothLit': { base: 0xf0a040, glow: true },
  'k.foam': glow(0xfff0b0),
  'k.carrot': shiny(0xff8a20, undefined, 0.14),
  'k.potato': plain(0xeedc9e),
  'k.herb': plain(0x4aa83a),
  'k.meat': plain(0x7a3a1e),
  'k.wood': { base: WOOD[2], ramp: WOOD },
  'k.steam': plain(0xe4eaee),
  'k.gold': S.gold(),
  'k.ruby': S.ruby(),
};
const KM = mats(KITCHEN);

type M = (k: string) => number;

/** A wisp of steam rising from (x, y) of F, `u` 0..1 how far up it has drifted, `h` how high it goes. */
function steam(r: Raster, F: Xf, x: number, y: number, u: number, h: number, m: M, g: number): void {
  if (u > 0.85) return;
  // A curl of three puffs, thinning as it rises.
  for (let j = 0; j < 3; j++) {
    const v = u + j * 0.09, py = y + v * h, px = x + Math.sin(v * 6 + x) * 1.4;
    r.dot(Math.round(F.x(px, py)), Math.round(F.y(px, py)), m('k.steam'), j === 0 ? 3 : 2, g);
  }
}

/** Soup flying out of the pot from (x, y) of F along angle `a`: blobs of broth and chunks, `n` of them. */
function spill(r: Raster, F: Xf, x: number, y: number, a: number, n: number, m: M, g: number): void {
  const c = Math.cos(a), s = Math.sin(a);
  for (let i = 0; i < n; i++) {
    const d = 1.2 + i * 2.1, w = Math.sin(i * 1.7) * 0.9;
    const bx = x + c * d - s * w, by = y + s * d + c * w - i * i * 0.06;
    const rad = Math.max(0.7, 2.2 - i * 0.2);
    r.fill(F.circ(bx, by, rad), m('k.broth'), { group: g, bevel: 1 });
    if (i % 3 === 1) r.dot(Math.round(F.x(bx, by)), Math.round(F.y(bx, by)), m(i % 2 ? 'k.carrot' : 'k.potato'), 3, g);
    if (i % 4 === 2) r.dot(Math.round(F.x(bx + 0.6, by + 0.6)), Math.round(F.y(bx + 0.6, by + 0.6)), m('k.foam'), 3, g);
  }
}

/**
 * The kitchen at scale `s` in frame F (origin under the middle of the stone; about 20 x 18 units at 1):
 * a slab of red-hot stone, a cast-iron pot on it with a gold bull on its belly and a ladle in it,
 * the broth bubbling and steam curling up. `tilt` (radians, + forward) tips the pot over its front foot;
 * `boil` 0..1 how hard it boils; `f` the animation frame.
 */
function kitchen(r: Raster, F: Xf, s: number, f: number, tilt: number, boil: number, m: M, g0: number): void {
  const K = new Xf(F.ox, F.oy, F.ang, s, s);
  // The stone: a flat slab, cracks glowing, heat shimmering off its edges.
  r.fill(K.poly([-9.6, -1.4, -10, 1.2, -7.6, 2.8, 7.8, 3, 10, 1.4, 9.4, -1.2, 6, -2.2, -6.4, -2.2], 0.6), m('k.stone'), { group: g0, bevel: 1.8 * s });
  for (const x of [-8.4, -3.2, 4.6, 8.6]) {
    if (hash(x * 3, f) < 0.4) continue;
    r.dot(Math.round(K.x(x, -2.6)), Math.round(K.y(x, -2.6)), m('k.ember'), 3, g0);
  }
  if (s > 0.8) for (const x of [-7.6, 7.2]) r.dot(Math.round(K.x(x, 4 + (f % 2))), Math.round(K.y(x, 4 + (f % 2))), m('k.heat'), 3, g0);
  // The pot, pivoting on its front foot as it tips.
  const front = 6.2;
  const P = new Xf(K.x(front, 2.8), K.y(front, 2.8), F.ang - tilt, s, s);
  const cx = -front;
  const belly = intersect(P.ell(cx, 4.6, 6.9, 5.0), P.rect(cx, 3.9, 8, 4.6));
  // The handles, behind the rim at either side.
  for (const k of [-1, 1]) r.fill(subtract(P.circ(cx + k * 7.2, 7.2, 1.4), P.circ(cx + k * 7.2, 7.2, 0.6)), m('k.iron'), { group: g0 + 1, bevel: 0.6 });
  r.fill(belly, m('k.iron'), { group: g0 + 1, bevel: 2.6 * s, local: P });
  r.fill(P.rect(cx, 8.6, 7.5, 0.85, 0.4), m('k.rim'), { group: g0 + 1, bevel: 0.8 });
  // The bull on the belly.
  bullEmblem(r, P, cx, 4.4, 0.62, m('k.gold'), m('k.ruby'), g0 + 1);
  // The broth, heaving as it boils, a ladle standing in it.
  const heave = boil * [0, 0.5, 0.2, 0.6][f % 4];
  if (tilt < 0.45) {
    r.fill(P.ell(cx, 9.1 + heave * 0.5, 6.5, 1.0 + heave * 0.4), m('k.broth'), { group: g0 + 2, bevel: 0.6, local: P });
    for (let i = 0; i < 3 + Math.round(boil * 3); i++) {
      const bx = cx - 5 + hash(i, f + 1) * 10, by = 9.3 + hash(i + 7, f) * 0.6 + heave * 0.5;
      r.dot(Math.round(P.x(bx, by)), Math.round(P.y(bx, by)), m(i === 0 ? 'k.carrot' : i === 1 ? 'k.herb' : 'k.foam'), 3, g0 + 2);
    }
    // Boiling over the lip.
    if (boil > 0.6) for (const x of [cx - 6.6, cx + 6.4]) r.fill(P.circ(x, 8.6 - (f % 2) * 0.6, 0.8), m('k.broth'), { group: g0 + 2, bevel: 0.4 });
  }
  r.fill(P.cap(cx - 3.6, 8.8, cx - 7.4, 14.6 - tilt * 2, 0.55), m('k.wood'), { group: g0 + 3, bevel: 0.6 });
  r.fill(P.circ(cx - 7.6, 15 - tilt * 2, 0.8), m('k.wood'), { group: g0 + 3, bevel: 0.5 });
  // Steam curling up off it.
  if (tilt < 0.45) for (let k = 0; k < 3; k++) {
    const u = ((f / 8 + k / 3) % 1);
    steam(r, P, cx - 3.4 + k * 3.2, 10, u, 8 + boil * 4, m, g0 + 4);
  }
  // Tipped: the soup flies out of the front of the pot, up and away.
  if (tilt > 0.25) {
    const lip = P.p(cx + 7, 8.8);
    const n = Math.round(2 + (tilt - 0.25) * 10);
    spill(r, new Xf(lip[0], lip[1], F.ang, s, s), 0, 0, 0.95 - tilt * 0.3, n, m, g0 + 5);
  }
}

/** Floating at the shoulder: the pot simmering on its stone. */
const pantryCore: ProjArt = {
  frames: 8,
  outline: true,
  draw(r, t, f, h) {
    kitchen(r, new Xf(t.ox, t.oy - 3, 0), 0.6, f, 0, 0.25, (k) => h(KM[k]), 1);
  },
};

/**
 * Over his head while the energy is spent: the pot comes to a rolling boil, rocks back and is thrown
 * forward, the soup flying out (frames follow the windup, so the throw lands as the soup is launched).
 */
const potSigil: ProjArt = {
  frames: 8,
  timed: true,
  outline: true,
  draw(r, t, f, h) {
    const tilt = [0, 0, 0, -0.14, -0.22, 0.4, 0.75, 1.0][f];
    const boil = [0.4, 0.7, 1, 1, 1, 1, 1, 1][f];
    kitchen(r, new Xf(t.ox, t.oy - 6, 0), 0.85, f, tilt, boil, (k) => h(KM[k]), 1);
  },
};

/** The soup itself, hurtling down: a steaming glob of broth with carrots, potatoes, herbs and meat in it. */
const soupGlob: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    const fl = [0, 1, 0, -1][f];
    // The tail of broth streaming behind, breaking into drops.
    r.fill(t.poly([4, -7, -6, -6 + fl, -18, -3.6, -28 - fl * 2, -0.6, -30, 0.4, -18, 3.4, -6, 6.4 - fl, 4, 7]), h(KM['k.broth']), { group: 1, bevel: 2 });
    r.fill(t.poly([2, -3.8, -8, -2.6 - fl * 0.5, -20, 0, -8, 2.6 + fl * 0.5, 2, 3.8]), h(KM['k.brothLit']), { group: 1, noLine: true });
    for (let k = 0; k < 8; k++) {
      const x = -14 - k * 3 + (hash(k, f) - 0.5) * 3, y = (hash(k + 4, f * 5) - 0.5) * 2 * (7 - k * 0.5);
      r.fill(t.circ(x, y, k < 3 ? 1.1 : 0.7), h(KM[k % 4 === 1 ? 'k.carrot' : 'k.broth']), { group: 1, bevel: 0.5 });
    }
    // Steam trailing off it.
    for (let k = 0; k < 3; k++) {
      const x = -6 - k * 7 - fl, y = 7 + k * 0.6 + (k === f % 3 ? 1 : 0);
      r.fill(t.circ(x, y, 1.6 + k * 0.5), h(KM['k.steam']), { group: 4, bevel: 1 });
    }
    // The glob, light rolling over it.
    r.fill(t.ell(3, 0, 7.6, 6.8), h(KM['k.broth']), { group: 2, bevel: 3, local: t });
    // What's in it: a carrot coin, a potato, a chunk of meat, herbs.
    r.fill(t.circ(4.6 + fl * 0.3, 2.4, 1.5), h(KM['k.carrot']), { group: 3, bevel: 0.8 });
    r.dot(Math.round(t.x(4.6, 2.4)), Math.round(t.y(4.6, 2.4)), h(KM['k.foam']), 3, 3);
    r.fill(t.rect(0.4, -2.6 + fl * 0.3, 1.3, 1.2, 0.3), h(KM['k.potato']), { group: 3, bevel: 0.6 });
    r.fill(t.ell(6.4, -2.8, 1.6, 1.1, 0.4), h(KM['k.meat']), { group: 3, bevel: 0.7 });
    for (const [x, y] of [[-1.6, 2.6], [2.4, -0.4], [7.4, 0.8]]) r.dot(Math.round(t.x(x, y)), Math.round(t.y(x, y)), h(KM['k.herb']), 2, 3);
    // Foam and light on the leading face.
    r.fill(subtract(t.ell(3.8, 0, 7.8, 6.9), t.ell(2.6, -0.6, 7.6, 6.9)), h(KM['k.foam']), { group: 4, noLine: true });
    r.dot(Math.round(t.x(7.2, 3.6)), Math.round(t.y(7.2, 3.6)), h(KM['k.foam']), 3, 4);
  },
};

const rockKitchen: SkinArt = {
  mats: {
    ...KITCHEN,
    // Stock names, for anything drawn the stock way.
    sigil: glow(0xff8a2a), rock: shiny(0x2a2a32, undefined, 0.14), ember: glow(0xffb050),
    lava: glow(0xf0a040), lavaHot: glow(0xfff0b0), fire: glow(0xd07a28), fireHot: glow(0xfff0b0), fireDeep: glow(0x9a4a12),
  },
  glow: [0xffe0a0, 0xd0601a],
  icon(r, t, m) {
    // The pot boiling hard on its hot stone, soup leaping out of it.
    kitchen(r, new Xf(t.x(-1, -8.4), t.y(-1, -8.4), 0), 1.05, 2, 0, 1, m, 1);
    spill(r, new Xf(t.x(5, 5), t.y(5, 5), 0), 0, 0, 0.9, 4, m, 7);
  },
  proj: { core: pantryCore, sigil: potSigil, meteor: soupGlob },
};

// -----------------------------------------------------------------------------
// The People's Eyebrow (gladiator helm)
// -----------------------------------------------------------------------------

function eyebrow(): HeadSkin {
  // No helm at all: a clean-shaven, polished bald dome with the light gleaming on it, an ear, a neat
  // goatee, the far brow low and level and the near one raised high in the People's Eyebrow.
  return {
    bald: true,
    mats: {
      'h.brow': material({ base: 0x1e1410, ramp: [0x0a0606, 0x140c0a, 0x1e1410, 0x2e201a, 0x4a362a] }),
      'h.shine': material({ base: 0xfff4e0, glow: true }),
      // The wearer's own skin (look.ts swaps it in).
      'flesh.dome': material(plain(0xc98c62)),
    },
    draw(r, H, m, g) {
      const ph = r.phase % 4;
      // The bare dome over the crown, a little rounder than the head (no seam where it meets the face).
      r.fill(hairCap(H, 3.4, -2, 0.3), m('flesh.dome'), { group: g, bevel: 3, softLight: true, noLine: true });
      // An ear on the side of the head.
      r.fill(H.ell(-2.3, -0.5, 1.0, 1.6, 0.15), m('flesh.dome'), { group: g + 1, bevel: 0.8 });
      // The goatee round the chin.
      r.fill(H.poly([2.8, -4.3, 4.5, -4.1, 4.6, -5.0, 3.8, -6.0, 2.9, -5.4]), m('h.brow'), { group: g, bevel: 0.5 });
      // Brows: the far one low and flat, the near one arched way up (higher still every other beat).
      const lift = ph === 2 || ph === 3 ? 0.5 : 0;
      const brow = m('h.brow');
      r.line(H.x(3.9, 1.6), H.y(3.9, 1.6), H.x(5.7, 1.5), H.y(5.7, 1.5), brow, 1, g);
      r.line(H.x(0, 2.4), H.y(0, 2.4), H.x(1.1, 3.6 + lift), H.y(1.1, 3.6 + lift), brow, 1, g);
      r.line(H.x(1.1, 3.6 + lift), H.y(1.1, 3.6 + lift), H.x(2.6, 3.2 + lift), H.y(2.6, 3.2 + lift), brow, 1, g);
      // The polished dome catching the light: a gleam, flaring into a star now and then.
      const sx = Math.round(H.x(1.4, 5.6)), sy = Math.round(H.y(1.4, 5.6));
      r.dot(sx, sy, m('h.shine'), 3, g);
      r.dot(sx - 1, sy + 1, m('h.shine'), 2, g);
      if (ph === 1) for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, -2]]) r.dot(sx + dx, sy + dy, m('h.shine'), 4, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Brahma Bull Physique (leather jerkin)
// -----------------------------------------------------------------------------

function physique(): SkinArt {
  // No shirt, all muscle: slabs of chest, a six-pack, obliques, deltoids like boulders and the Brahma Bull
  // inked on the near shoulder; black trunks with a gold waistband and a gold bull on the hip.
  return {
    mats: {
      'k.kTrunk': S.onyx(), 'k.kGold': S.gold(sweep()), 'k.kRuby': S.ruby(), 'k.kInk': { base: 0x1c1418, ramp: [0x0a0608, 0x140e10, 0x1c1418, 0x2a2024, 0x3a2e32] },
      'k.kBelt': S.onyx((x) => (wrap(x, 1.8) < 0.45 ? 1 : 0)),
      // The wearer's own skin (look.ts swaps it in): the muscle drawn over the bare torso.
      'flesh.muscle': plain(0xc98c62), 'flesh.dark': plain(0x8a5a3a),
    },
    chest: {
      torso: 'skin', sleeve: null, sleeveLen: 0, forearm: null, hands: 'skin', pauldron: null,
      trim: null, belt: 'k.kBelt', cape: null, hood: null, spikes: null, skirt: 0, noScarf: true,
      shoulder(r, S2, m, c) {
        const a = c.body.armR, o = { group: c.g, toneBias: c.bias };
        // A deltoid like a boulder.
        r.fill(S2.ell(0.2, -0.9, a + 1.1, a + 1.5, 0.1), m('flesh.muscle'), { ...o, bevel: 2, lightBias: 0.2, noLine: true });
        r.line(S2.x(-a - 0.4, -1.8), S2.y(-a - 0.4, -1.8), S2.x(-a + 0.6, -a - 2.2), S2.y(-a + 0.6, -a - 2.2), m('flesh.dark'), 1, c.g);
        if (c.far) return;
        // The Brahma Bull tattoo, tribal strokes sweeping off it.
        const ink = m('k.kInk'), bx = 0.2, by = -2.2;
        const L = (pts: number[][]) => { for (let i = 0; i < pts.length - 1; i++) r.line(S2.x(pts[i][0], pts[i][1]), S2.y(pts[i][0], pts[i][1]), S2.x(pts[i + 1][0], pts[i + 1][1]), S2.y(pts[i + 1][0], pts[i + 1][1]), ink, 1, c.g); };
        // Horns sweeping out and up, the long face between them.
        L([[bx - 0.6, by + 0.4], [bx - 1.6, by + 0.5], [bx - 2.2, by + 1.5]]);
        L([[bx + 0.6, by + 0.4], [bx + 1.6, by + 0.5], [bx + 2.2, by + 1.5]]);
        L([[bx - 0.5, by + 0.4], [bx, by - 1.6], [bx + 0.5, by + 0.4]]);
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, fx = b.chestPush * 0.7, front = fx + b.chestW;
        const sd = m('flesh.dark');
        const ln = (pts: number[][]) => { for (let i = 0; i < pts.length - 1; i++) r.line(T.x(pts[i][0], pts[i][1]), T.y(pts[i][0], pts[i][1]), T.x(pts[i + 1][0], pts[i + 1][1]), T.y(pts[i + 1][0], pts[i + 1][1]), sd, 1, c.g); };
        // Slabs of chest and a block of abs, bulging out of the torso; the pec's heavy line under it.
        r.fill(T.ell(front - 2.5, top * 0.42, 2.7, top * 0.24, 0.05), m('flesh.muscle'), { group: c.g, bevel: 2, lightBias: 0.15, noLine: true });
        r.fill(T.ell(front - 2.6, top - 4.3, 3.1, 2.4, -0.15), m('flesh.muscle'), { group: c.g, bevel: 2.2, lightBias: 0.25, noLine: true });
        ln([[fx - 1.4, top - 4.8], [fx + 0.6, top - 6.3], [front - 2.2, top - 6.9], [front - 0.5, top - 6.1], [front + 0.2, top - 4.8]]);
        // The six-pack: a line down the middle, three rows across, the obliques running down to the hips.
        ln([[front - 2.3, top * 0.6], [front - 2.4, top * 0.27]]);
        for (const y of [top * 0.55, top * 0.44, top * 0.33]) ln([[front - 3.6, y], [front - 1, y + 0.3]]);
        ln([[front - 0.4, top * 0.3], [front - 2.2, 2.8]]);
        // Black trunks, a gold waistband, a gold bull at the front hip.
        const trunks = T.poly([-b.hipW - 0.5, 2.4, b.hipW + 1.2, 2.4, b.hipW + 1.9, -2.9, b.hipW * 0.3, -2.2, -b.hipW - 0.9, -2.6]);
        r.fill(trunks, m('k.kTrunk'), { group: c.g + 1, bevel: 2 });
        r.fill(intersect(trunks, T.rect(0, 1.9, 12, 0.55)), m('k.kGold'), { group: c.g + 1, flat: 3, noLine: true });
        bullEmblem(r, T, b.hipW * 0.5 + 0.6, -0.4, 0.5, m('k.kGold'), m('k.kRuby'), c.g + 1);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// People's Champ Trunks (charger cuisses)
// -----------------------------------------------------------------------------

function trunks(): SkinArt {
  // Bare, heavy thighs out of short black trunks hemmed in gold, and thick black knee pads, a gold bull
  // with ruby eyes on the near one.
  return {
    mats: {
      'l.kTrunk': S.onyx(), 'l.kGold': S.gold(), 'l.kPad': S.onyx((_x, y) => (wrap(y * 0.9, 1.6) < 0.35 ? -1 : 0)), 'l.kRuby': S.ruby(),
    },
    legs: {
      mat: 'skin', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.35,
      over(r, t, m, c) {
        const L = c.len, kr = c.body.kneeR, w = c.w;
        // The quad's line.
        r.line(t.x(L * 0.18, w * 0.15), t.y(L * 0.18, w * 0.15), t.x(L * 0.55, w * 0.55), t.y(L * 0.55, w * 0.55), m('skinDark'), 1, c.g);
        // The trunk leg, a gold hem.
        const leg = t.poly([L * 0.64, -w - 0.9, L + 2, -w - 1.2, L + 2, w + 1.2, L * 0.6, w + 0.9]);
        r.fill(leg, m('l.kTrunk'), { group: c.g, bevel: 1.6, toneBias: c.bias });
        r.fill(intersect(leg, t.poly([L * 0.6, -w - 2, L * 0.71, -w - 2, L * 0.67, w + 2, L * 0.56, w + 2])), m('l.kGold'), { group: c.g, flat: 2, noLine: true, toneBias: c.bias });
        // The knee pad.
        const pad = t.ell(0.2, 0.7, kr + 1.2, kr + 1.4);
        r.fill(pad, m('l.kPad'), { group: c.far ? 25 : 27, bevel: 1.8, toneBias: c.bias });
        if (c.far) return;
        bullEmblem(r, new Xf(t.x(0.2, 1.4), t.y(0.2, 1.4), 0), 0, 0, 0.5, m('l.kGold'), m('l.kRuby'), 27);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Rock Bottom Boots (savate boots)
// -----------------------------------------------------------------------------

function boots(): SkinArt {
  // Tall black wrestling boots: white laces criss-crossed up the front, a padded gold-banded cuff, a heavy
  // black sole, and a gold Brahma bull with ruby eyes on the outside of the shin.
  return {
    mats: {
      'k.kbBoot': S.onyx(), 'k.kbCuff': S.gold(), 'k.kbLace': S.white(), 'k.kbSole': S.matte(), 'k.kbGold': S.gold(sweep(7, 1.75, 0.9)), 'k.kbRuby': S.ruby(),
    },
    boots: {
      mat: 'k.kbBoot', height: 0.9, bulk: 0.55, trim: 'k.kbCuff', wing: null, knee: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias }, w = c.w;
        // A heavy sole.
        r.fill(foot.cap(-1.8, -1.55, c.toe + 0.3, -1.35, 0.7), m('k.kbSole'), { ...o, bevel: 0.5 });
        // Laces up the front.
        for (let x = 1.4; x < c.top - 1.4; x += 1.3) {
          r.line(shin.x(x, w - 0.5), shin.y(x, w - 0.5), shin.x(x + 1.1, w + 0.1), shin.y(x + 1.1, w + 0.1), m('k.kbLace'), 3, c.g);
          r.line(shin.x(x + 1.1, w - 0.5), shin.y(x + 1.1, w - 0.5), shin.x(x, w + 0.1), shin.y(x, w + 0.1), m('k.kbLace'), 2, c.g);
        }
        if (c.far) return;
        bullEmblem(r, new Xf(shin.x(c.top * 0.58, -w * 0.15), shin.y(c.top * 0.58, -w * 0.15), 0), 0, 0, 0.5, m('k.kbGold'), m('k.kbRuby'), c.g, c.bias);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = {
  gold: css(GOLD[3]), goldDk: css(GOLD[1]), glint: css(GOLD[4]), white: css(WHITE), ruby: css(RUBY[3]), ink: css(ONYX[1]),
  bolt: css(0xbfe8ff), boltDk: css(0x5ab0ff),
};
let runA = 0, runB = 0;
const ringDot = (g: CanvasRenderingContext2D, px: number, py: number, i: number) => {
  g.fillStyle = i === runA || i === runB ? AC.bolt : i % 6 === 0 ? AC.ruby : i % 2 ? AC.gold : AC.goldDk;
  g.fillRect(px, py, 1, 1);
};

/**
 * The full-set aura around the feet at (x, y) art pixels; `t` is seconds. The most electrifying man in
 * the arena: a gold ring with sparks racing round it and crackling up off it, camera flashes popping all
 * round him, and his entrance pyro going off at both sides every few seconds.
 */
export function rockAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  const back = layer === 'back';
  const RX = 15, RY = 3.8;
  runA = Math.floor(t * 22) % 48;
  runB = (48 - (Math.floor(t * 17) % 48)) % 48;
  g.globalAlpha = back ? 0.6 : 0.85;
  ring(g, x, y, RX, RY, 48, layer, ringDot);
  // Electricity crackling up off the ring: a short zigzag bolt here and there.
  if (!back) {
    const n = Math.floor(t * 9);
    for (let k = 0; k < 2; k++) {
      if (hash(n, k + 1) < 0.45) continue;
      const a = hash(n, k + 5) * Math.PI * 2;
      let px = Math.round(x + Math.cos(a) * RX), py = Math.round(y + Math.sin(a) * RY);
      g.globalAlpha = 1;
      const h = 4 + Math.floor(hash(n, k + 9) * 5);
      for (let j = 0; j < h; j++) {
        g.fillStyle = j < 2 ? AC.white : j % 2 ? AC.bolt : AC.boltDk;
        g.fillRect(px, py, 1, 1);
        py -= 1;
        if (j % 2 === 1) px += hash(n + j, k) < 0.5 ? -1 : 1;
      }
    }
  }
  // Camera flashes popping from the crowd all round him.
  for (let k = 0; k < 6; k++) {
    if ((k % 2 === 0) !== back) continue;
    const per = 0.9 + (k % 3) * 0.35, n = Math.floor((t + k * 0.37) / per), u = ((t + k * 0.37) % per) / per;
    if (u > 0.14) continue;
    const px = Math.round(x + (hash(n, k + 21) - 0.5) * 44), py = Math.round(y - 6 - hash(n + 3, k) * 44);
    g.globalAlpha = 1 - u / 0.14;
    g.fillStyle = AC.white;
    g.fillRect(px - 1, py, 3, 1); g.fillRect(px, py - 1, 1, 3);
    if (u < 0.06) { g.fillRect(px - 3, py, 2, 1); g.fillRect(px + 2, py, 2, 1); g.fillRect(px, py - 3, 1, 2); g.fillRect(px, py + 2, 1, 2); }
  }
  // The pyro: every few seconds a fountain of gold sparks goes up at either side and rains back down.
  const per = 3.2, u = (t % per) / per;
  if (u < 0.45 && back) {
    const v = u / 0.45;
    for (const side of [-1, 1]) {
      const bx = x + side * (RX + 2);
      for (let k = 0; k < 9; k++) {
        const life = (v * 1.6 + k / 9) % 1;
        if (life > v * 1.6) continue;
        const vx = (hash(k, side + 4) - 0.5) * 10, vy = 28 + hash(k + 2, side + 7) * 12;
        const px = Math.round(bx + vx * life), py = Math.round(y - (vy * life - 32 * life * life));
        g.globalAlpha = Math.min(1, (1 - life) * 2);
        g.fillStyle = life < 0.3 ? AC.white : k % 3 ? AC.gold : AC.glint;
        g.fillRect(px, py, 1, life < 0.25 ? 2 : 1);
      }
      // The flare at its foot.
      g.globalAlpha = (1 - v) * 0.9;
      g.fillStyle = AC.glint;
      g.fillRect(Math.round(bx) - 1, y - 1, 3, 2);
    }
  }
  g.globalAlpha = 1;
}

export const ROCK: Record<string, SkinArt> = {
  'spiked_knuckles.rock': { weapon: fists, ...FX },
  'war_horn.rock': { weapon: mic, ...FX },
  'meteor_sigil.rock': rockKitchen,
  'gladiator_helm.rock': { head: eyebrow, ...FX },
  'leather_jerkin.rock': physique(),
  'charger_cuisses.rock': trunks(),
  'savate_boots.rock': boots(),
};
