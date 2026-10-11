import { css } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { ring, type Layer } from '../../auraKit';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, mats, wrap } from './kit';

/**
 * Mythic set: Reign of the Kente King. A champion king of the ring: black leather
 * and championship gold, a beaded crown in the style of a West African
 * king's adé with a gold bird on top, a royal robe lined in kente (gold,
 * green and red woven in blocks), the title belt floating at his shoulder,
 * and the ground shaking under every step. Emeralds are the night accents:
 * in the crown, the collar, the title, the cuffs and the boots.
 */

/** Championship gold: deep, warm and brassy, white-hot where the light catches it. */
const GOLD = [0x5c3206, 0x9e660e, 0xdcaa22, 0xffdc50, 0xfff8c8];
/** Black leather and velvet, its top tone the gloss. */
const ONYX = [0x08070a, 0x151216, 0x262024, 0x3e3438, 0x76686c];
/** Emerald (self-lit at night). */
const EMERALD = [0x064022, 0x0e7a40, 0x22c46c, 0x7affb6, 0xe6fff0];
/** Kente green. */
const KGREEN = [0x0a3420, 0x135a34, 0x1f8048, 0x34a262, 0x5cc486];
/** Ruby and kente red. */
const RUBY = [0x420810, 0x82121e, 0xc4242e, 0xf25a58, 0xffc4b8];
/** Pearl beads. */
const PEARL = [0x8a8274, 0xc8c0b0, 0xece6da, 0xfaf6ee, 0xffffff];
/** Dust kicked up by a stomp. */
const DUST = 0xc8a878;
const WHITE = 0xffffff;

/** A glint sliding along polished gold, one step a frame. */
const sweep = (period = 10, speed = 2.5, w = 1.1): Tex => (x, y, ph) => (wrap(x * 0.8 + y * 0.45 - ph * speed, period) < w ? 1 : 0);
/** Leather grain: a few glossy flecks. */
const grain: Tex = (x, y) => (hash(Math.floor(x * 1.4), Math.floor(y * 1.4)) < 0.07 ? 1 : 0);
/** Velvet nap with soft folds. */
const velvet: Tex = (x, y) => (wrap(x * 0.5 + Math.sin(y * 0.6) * 0.7, 2.8) < 0.55 ? -1 : 0);
/** Glass beads in rows: every other bead a shade darker. */
const beads: Tex = (x) => (wrap(x, 1.4) < 0.6 ? -1 : 0);
/** A gem breathing over the loop. */
const breathe: Tex = (_x, _y, ph) => [0, 1, 0, -1][ph % 4];

const S = {
  gold: (tex: Tex | undefined = sweep()): MaterialSpec => ({ base: GOLD[2], ramp: GOLD, shiny: true, step: 0.15, tex }),
  onyx: (tex: Tex | undefined = grain): MaterialSpec => ({ base: ONYX[2], ramp: ONYX, shiny: true, step: 0.14, tex }),
  velvet: (): MaterialSpec => ({ base: ONYX[2], ramp: ONYX, tex: velvet }),
  emerald: (tex: Tex | undefined = breathe): MaterialSpec => ({ base: EMERALD[2], ramp: EMERALD, glow: true, tex }),
  green: (tex?: Tex): MaterialSpec => ({ base: KGREEN[2], ramp: KGREEN, tex }),
  ruby: (tex?: Tex): MaterialSpec => ({ base: RUBY[2], ramp: RUBY, shiny: true, step: 0.16, tex }),
  pearl: (): MaterialSpec => ({ base: PEARL[2], ramp: PEARL, shiny: true }),
};

/** Gold and emerald sparkles; a swing trails championship gold. */
const FX = { ...epicFx(0xfff0a0, 0x22c46c, 'twinkle'), trail: [0xfff6d0, 0xe0a828] as [number, number] };

/** Particles the full set sheds in battle: gold glitter and emerald glints. */
export const RULER_FX: SkinFx = { spark: 0xfff0a0, spark2: 0x22c46c, kind: 'twinkle' };

// -----------------------------------------------------------------------------
// Shared shapes
// -----------------------------------------------------------------------------

/** A diamond (a cut gem seen face-on) at (x, y) of F. */
const diamond = (F: Xf, x: number, y: number, rx: number, ry = rx * 1.3): Shape => F.poly([x - rx, y, x, y + ry, x + rx, y, x, y - ry]);

/**
 * A kente strip along a band: blocks `step` long between a and b (along the band's x), each filled
 * where it meets `clip`, cycling gold, green, gold, red with a thin black weft through the gold.
 * `slice(x0, x1)` gives the block's shape.
 */
function kente(r: Raster, a: number, b: number, step: number, clip: Shape, slice: (x0: number, x1: number) => Shape, m: (k: string) => number, keys: { gold: string; green: string; red: string; black: string }, g: number, bias = 0, off = 0): void {
  const order = [keys.gold, keys.green, keys.gold, keys.red];
  let i = off;
  for (let x = a; x < b; x += step, i++) {
    const k = order[wrap(i, 4)];
    r.fill(intersect(clip, slice(x, Math.min(b, x + step))), m(k), { group: g, bevel: 0.5, toneBias: bias, noLine: true });
    if (k === keys.gold) r.fill(intersect(clip, slice(x + step * 0.42, x + step * 0.58)), m(keys.black), { group: g, flat: 1, noLine: true });
  }
}

/** A small three-pointed crown standing on (x, y) of F, `s` its scale (about 3 units wide at 1). */
function crownMark(F: Xf, x: number, y: number, s: number): Shape {
  return F.poly([
    x - 1.5 * s, y, x + 1.5 * s, y, x + 1.6 * s, y + 1.9 * s, x + 0.8 * s, y + 1.1 * s, x, y + 2.3 * s,
    x - 0.8 * s, y + 1.1 * s, x - 1.6 * s, y + 1.9 * s,
  ]);
}

// -----------------------------------------------------------------------------
// Sceptre of the Kente King (mace, a legendary skin outside the set)
// -----------------------------------------------------------------------------

function sceptre(): WeaponArt {
  // A black onyx sceptre banded in gold, the grip bound in green leather with gold wire, an emerald set in
  // the gold orb of its pommel, and for a head a heavy gold crown: five flanged points tipped with pearls
  // around a green velvet cap, a great emerald on the band between two rubies. A glint walks the points.
  return {
    tip: 21.8,
    mats: {
      shaft: material(S.onyx()), gold: material(S.gold()), band: material(S.gold(undefined)),
      grip: material(S.green((x) => (wrap(x, 1.2) < 0.4 ? -1 : 0))), cap: material(S.green(beads)),
      emerald: material(S.emerald()), ruby: material(S.ruby()), pearl: material(S.pearl()), spark: material({ base: WHITE, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4, L = o.local, b = o.toneBias ?? 0;
      // The shaft, the green grip with gold wire wound round it.
      fillAll(r, [t.cap(-4.6, 0, 13.4, 0, 1.15, 1.05)], m('shaft'), o, 1);
      fillAll(r, [t.cap(-3.9, 0, 0.4, 0, 1.3, 1.25)], m('grip'), o, 1);
      for (const x of [-3, -1.5]) r.line(t.x(x - 0.35, -1.1), t.y(x - 0.35, -1.1), t.x(x + 0.35, 1.1), t.y(x + 0.35, 1.1), m('band'), 3, g);
      // Gold bands down the shaft.
      fillAll(r, [t.rect(1.2, 0, 0.55, 1.55, 0.2), t.rect(6.8, 0, 0.4, 1.4, 0.2)], m('band'), o, 0.8);
      // The pommel: a gold orb, an emerald set in it.
      fillAll(r, [t.circ(-6.1, 0, 1.9)], m('gold'), o, 1.2);
      r.fill(diamond(t, -6.1, 0, 0.7, 0.8), m('emerald'), { group: g, local: L });
      // A flared gold collar under the head.
      fillAll(r, [t.poly([11.6, -1.3, 14.6, -2.7, 14.6, 2.7, 11.6, 1.3])], m('band'), o, 0.9);
      // The velvet cap inside the crown, then the points round it.
      r.fill(t.ell(18.2, 0, 2.4, 2.6), m('cap'), { group: g, bevel: 1.2, toneBias: b - 1, local: L });
      const pts: [number, number][] = [[-3.2, 20.2], [-1.6, 19.4], [0, 21.4], [1.6, 19.4], [3.2, 20.2]];
      const points = pts.map(([y, len]) => t.poly([16.8, y - 0.9, len - 0.6, y - 0.35, len, y, len - 0.6, y + 0.35, 16.8, y + 0.9]));
      fillAll(r, [union(...points)], m('gold'), o, 0.9);
      // The band: heavy gold, a great emerald in the middle and a ruby either side.
      fillAll(r, [t.rect(15.8, 0, 1.25, 3.6, 0.35)], m('gold'), o, 1.2);
      r.fill(diamond(t, 15.8, 0, 0.95, 1.2), m('emerald'), { group: g, local: L });
      for (const y of [-2.4, 2.4]) r.dot(t.x(15.8, y), t.y(15.8, y), m('ruby'), 3, g);
      // Pearls on the points; the light runs along them, one a frame.
      pts.forEach(([y, len], i) => r.dot(t.x(len + 0.5, y), t.y(len + 0.5, y), m(i === ph + 1 ? 'spark' : 'pearl'), i === ph + 1 ? 3 : 3, g));
    },
  };
}

// -----------------------------------------------------------------------------
// Gloves of the Undisputed (boxing gloves)
// -----------------------------------------------------------------------------

function gloves(): WeaponArt {
  // Padded black leather gloves with a band of gold across the knuckles, a cuff of kente laced in gold,
  // and on the back of the hand a gold crown holding an emerald. A glint runs over the knuckle band.
  return {
    tip: 5,
    mats: {
      leather: material(S.onyx()), band: material(S.gold(sweep(7, 1.75, 0.9))), gold: material(S.gold(undefined)),
      green: material(S.green()), red: material(S.ruby()), ink: material({ base: ONYX[1], ramp: ONYX }), emerald: material(S.emerald()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, b = o.toneBias ?? 0;
      // The kente cuff up the wrist, laced in gold.
      const cuff = t.cap(-5.2, 0, -2.4, 0, 2.3, 2.5);
      fillAll(r, [cuff], m('ink'), o, 1.2);
      kente(r, -5.4, -2, 0.85, cuff, (x0, x1) => t.poly([x0, -3, x1, -3, x1, 3, x0, 3]), m, { gold: 'gold', green: 'green', red: 'red', black: 'ink' }, g, b);
      for (const x of [-4.6, -3.4]) r.dot(t.x(x, 0.6), t.y(x, 0.6), m('gold'), 3, g);
      // The padded mitt, the thumb tucked along the top.
      const mitt = union(t.ell(1.1, 0, 3.6, 3.1), t.ell(-0.8, 0.2, 2.6, 2.7));
      fillAll(r, [mitt], m('leather'), o, 2.2);
      fillAll(r, [t.ell(0.2, 2.5, 2.2, 1.05, -0.15)], m('leather'), o, 1, -1);
      // A gold band over the knuckles.
      r.fill(intersect(mitt, t.poly([2.4, -4, 3.5, -4, 3.5, 4, 2.4, 4])), m('band'), { group: g, bevel: 0.6, toneBias: b, noLine: true, local: o.local });
      // The crown on the back of the hand, an emerald in it.
      r.fill(crownMark(new Xf(t.x(-0.6, 0.9), t.y(-0.6, 0.9), t.ang - Math.PI / 2, t.sx, t.sy), 0, -1, 0.62), m('gold'), { group: g, bevel: 0.3, toneBias: b + 1 });
      r.dot(t.x(-0.6, 0.9), t.y(-0.6, 0.9), m('emerald'), 3, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Kingmaker Knuckles (iron cestus)
// -----------------------------------------------------------------------------

function knuckles(): WeaponArt {
  // Black leather wrapped up the forearm and laced in gold over a band of kente, a gold plate over the back
  // of the fist with an emerald set in a crown, and a gold knuckle bar standing up in three crown points.
  return {
    tip: 5.1,
    mats: {
      wrap: material(S.onyx((x, y) => (wrap(x * 0.9 + y * 0.5, 1.5) < 0.4 ? -1 : grain(x, y, 0)))), lace: material(S.gold(undefined)),
      gold: material(S.gold()), bar: material(S.gold(sweep(8, 2, 1))), green: material(S.green()), red: material(S.ruby()),
      ink: material({ base: ONYX[1], ramp: ONYX }), emerald: material(S.emerald()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, L = o.local, b = o.toneBias ?? 0;
      fillAll(r, [t.cap(-6.2, 0, -1, 0, 1.8, 2.15)], m('wrap'), o, 1.2);
      // A kente band round the wrist.
      const cuff = t.cap(-2.2, 0, -1.2, 0, 2.2, 2.25);
      kente(r, -2.3, 2.3, 0.9, cuff, (y0, y1) => t.poly([-2.7, y0, -0.8, y0, -0.8, y1, -2.7, y1]), m, { gold: 'gold', green: 'green', red: 'red', black: 'ink' }, g, b);
      // Gold lacing criss-crossed up the wrap.
      for (const x of [-5.4, -3.8]) {
        r.line(t.x(x - 0.6, -1.6), t.y(x - 0.6, -1.6), t.x(x + 0.6, 1.7), t.y(x + 0.6, 1.7), m('lace'), 3, g);
        r.line(t.x(x + 0.6, -1.6), t.y(x + 0.6, -1.6), t.x(x - 0.6, 1.7), t.y(x - 0.6, 1.7), m('lace'), 2, g);
      }
      // The plate over the fist, a crown and its emerald.
      fillAll(r, [t.rect(0.5, 0, 2.2, 2.75, 0.9)], m('gold'), o, 1.4);
      r.fill(crownMark(t, 0.1, -0.9, 0.62), m('bar'), { group: g, bevel: 0.4, toneBias: b + 1, local: L });
      r.dot(t.x(0.9, 0), t.y(0.9, 0), m('emerald'), 3, g);
      // The knuckle bar rising in three crown points.
      fillAll(r, [t.rect(3, 0, 1, 3, 0.45)], m('bar'), o, 1.1);
      const spikes: Shape[] = [];
      for (const [y, l] of [[-2, 4.6], [0, 5.1], [2, 4.6]] as const) spikes.push(t.poly([3.7, y - 0.85, l, y, 3.7, y + 0.85]));
      fillAll(r, [union(...spikes)], m('gold'), o, 0.7);
      for (const y of [-1, 1]) r.dot(t.x(3.1, y), t.y(3.1, y), m('red'), 3, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Undisputed Title (echo stone)
// -----------------------------------------------------------------------------

const TITLE: Record<string, MaterialSpec> = {
  'k.tStrap': S.onyx(), 'k.tGold': S.gold(undefined), 'k.tRim': S.gold(undefined), 'k.tInk': S.onyx(undefined),
  'k.tEm': S.emerald(undefined), 'k.tRuby': S.ruby(), 'k.tPearl': S.pearl(), 'k.tSpark': { base: WHITE, glow: true },
  'k.tGlobe': { base: GOLD[3], ramp: GOLD, shiny: true, step: 0.15 },
};
const TM = mats(TITLE);

/**
 * The championship title in frame F (`s` its scale; about 26 x 20 units at 1): a black leather strap with
 * gold stitching, a side plate either end with an emerald, and the great centre plate: a gold rim around
 * black enamel holding a gold globe under a crown, rubies at its sides, pearls on the crown's points.
 * `glint` -1..1 sweeps a shine across the gold (off when outside); `gem` brightens the emeralds.
 */
function titleBelt(r: Raster, F: Xf, s: number, glint: number, gem: number, m: (k: string) => number, g0: number): void {
  const S2 = (v: number) => v * s;
  // The strap, curving a little at the ends, stitched in gold.
  const strap = F.poly([S2(-13), S2(-1.6), S2(-7), S2(-2.6), S2(7), S2(-2.6), S2(13), S2(-1.6), S2(13), S2(2.2), S2(7), S2(2.4), S2(-7), S2(2.4), S2(-13), S2(2.2)], S2(0.6));
  r.fill(strap, m('k.tStrap'), { group: g0, bevel: S2(1.2) });
  for (let x = -12; x <= 12; x += 1.6) {
    if (Math.abs(x) < 6.4) continue;
    for (const y of [-1.8, 1.7]) r.dot(Math.round(F.x(S2(x), S2(y))), Math.round(F.y(S2(x), S2(y))), m('k.tGold'), 2, g0);
  }
  // Side plates, each with an emerald.
  for (const k of [-1, 1]) {
    const cx = S2(9 * k);
    r.fill(F.rect(cx, S2(0.2), S2(2.6), S2(3.4), S2(1)), m('k.tGold'), { group: g0 + 1, bevel: S2(1.2) });
    r.fill(F.rect(cx, S2(0.2), S2(1.5), S2(2.3), S2(0.6)), m('k.tInk'), { group: g0 + 1, bevel: S2(0.8), noLine: true });
    r.fill(diamond(F, cx, S2(0.2), S2(0.9), S2(1.2)), m('k.tEm'), { group: g0 + 1, toneBias: gem });
  }
  // The crown on the centre plate: three points with pearls.
  const crown = F.poly([S2(-4.4), S2(5.6), S2(-4.8), S2(9.6), S2(-2.4), S2(7.6), S2(0), S2(10.8), S2(2.4), S2(7.6), S2(4.8), S2(9.6), S2(4.4), S2(5.6)]);
  r.fill(crown, m('k.tGold'), { group: g0 + 2, bevel: S2(1) });
  for (const [x, y] of [[-4.8, 9.9], [0, 11.2], [4.8, 9.9]]) r.fill(F.circ(S2(x), S2(y), Math.max(0.6, S2(0.75))), m('k.tPearl'), { group: g0 + 2, bevel: S2(0.6) });
  r.fill(F.circ(S2(0), S2(7.8), Math.max(0.6, S2(0.8))), m('k.tRuby'), { group: g0 + 2 });
  // The plate: a gold rim, black enamel inside.
  const plate = F.ell(0, S2(0.2), S2(6.6), S2(6.8));
  r.fill(plate, m('k.tRim'), { group: g0 + 3, bevel: S2(1.6), lightBias: 0.2 });
  r.fill(F.ell(0, S2(0.2), S2(4.8), S2(5)), m('k.tInk'), { group: g0 + 3, bevel: S2(1), noLine: true });
  // The globe under a little crown, an emerald at its foot.
  r.fill(F.circ(0, S2(-0.4), S2(3)), m('k.tGlobe'), { group: g0 + 4, bevel: S2(1.4), lightBias: 0.3 });
  r.fill(intersect(F.circ(0, S2(-0.4), S2(3)), F.rect(0, S2(-0.4), S2(4), S2(0.32))), m('k.tGold'), { group: g0 + 4, flat: 1, noLine: true });
  r.fill(intersect(F.circ(0, S2(-0.4), S2(3)), subtract(F.ell(0, S2(-0.4), S2(1.4), S2(3.2)), F.ell(0, S2(-0.4), S2(0.9), S2(3.2)))), m('k.tGold'), { group: g0 + 4, flat: 1, noLine: true });
  r.fill(crownMark(F, 0, S2(2.4), s * 0.9), m('k.tGold'), { group: g0 + 4, bevel: S2(0.5) });
  r.fill(diamond(F, 0, S2(-4.4), S2(0.9), S2(1)), m('k.tEm'), { group: g0 + 4, toneBias: gem });
  for (const k of [-1, 1]) r.fill(F.circ(S2(5.7 * k), S2(0.2), Math.max(0.6, S2(0.85))), m('k.tRuby'), { group: g0 + 4 });
  // A shine sweeping across the gold.
  if (glint > -1 && glint < 1) {
    const x = S2(glint * 7.5);
    const band = F.poly([x - S2(0.8), S2(-7), x + S2(0.6), S2(-7), x + S2(2.4), S2(11), x + S2(1), S2(11)]);
    r.fill(intersect(union(plate, crown), band), m('k.tSpark'), { group: g0 + 5, flat: 3, noLine: true });
  }
}

/** The title floating at the shoulder: the shine crossing it, the emeralds swelling as it passes. */
const titleCore: ProjArt = {
  frames: 8,
  outline: true,
  draw(r, t, f, h) {
    const glint = [-1, -0.7, -0.25, 0.2, 0.65, 1, 1, 1][f];
    titleBelt(r, new Xf(t.ox, t.oy, 0, 1, 1), 0.5, glint, f >= 2 && f <= 4 ? 1 : 0, (k) => h(TM[k]), 1);
  },
};

const undisputedTitle: SkinArt = {
  mats: { ...TITLE, stone: S.gold(), rune: S.emerald() },
  glow: [0xfff0a0, 0x22c46c],
  icon(r, t, m) {
    titleBelt(r, new Xf(t.x(0, -1.2), t.y(0, -1.2), 0, 1, 1), 1, -0.35, 0, m, 1);
  },
  proj: { core: titleCore },
};

// -----------------------------------------------------------------------------
// Crown of the Kente King (storm crown)
// -----------------------------------------------------------------------------

function rulerCrown(): SkinArt {
  // A tall beaded crown after a West African king's adé: a gold cone banded with rows of green and red
  // beads and pearls, a heavy gold brim with a great emerald at the brow between two rubies, a short fringe
  // of beads swinging over the brow, and a little gold bird perched at the very top.
  return {
    head: () => ({
      mats: {
        'h.gold': material(S.gold(sweep(9, 2.2, 1))), 'h.brim': material(S.gold(undefined)),
        'h.green': material(S.green(beads)), 'h.red': material(S.ruby(beads)), 'h.pearl': material(S.pearl()),
        'h.em': material(S.emerald()), 'h.ruby': material(S.ruby()), 'h.ink': material({ base: ONYX[1], ramp: ONYX }),
        'h.spark': material({ base: WHITE, glow: true }),
      },
      draw(r, H, m, g, sway) {
        const ph = r.phase % 4, s = sway * 1.4;
        // The cone.
        const cone = H.poly([-6, 4.1, 6.3, 4.7, 5.5, 7.2, 3.8, 9.8, 1.7, 11.7, -0.5, 12.2, -2.8, 11.1, -4.8, 8.8, -6.3, 6.4], 0.4);
        r.fill(cone, m('h.gold'), { group: g, bevel: 2.2, local: H });
        // Rows of beads round it, following the brim's slant: green, red, pearls, green, red.
        const row = (y: number, h: number) => H.poly([-8, y - h - 0.4, 8, y - h + 0.4, 8, y + h + 0.4, -8, y + h - 0.4]);
        for (const [y, h, k] of [[6.5, 0.5, 'h.green'], [9.2, 0.45, 'h.red']] as const) {
          r.fill(intersect(cone, row(y, h)), m(k), { group: g, bevel: 0.6, noLine: true, local: H });
        }
        for (let x = -4.8; x <= 4.8; x += 1.6) {
          const y = 7.85 + x * 0.05;
          if (cone.sdf(H.x(x, y), H.y(x, y)) < -0.4) r.dot(H.x(x, y), H.y(x, y), m('h.pearl'), 3, g);
        }
        // The brim: heavy gold, the emerald at the brow, rubies either side.
        r.fill(H.cap(-6.2, 4.4, 6.6, 5.0, 1.05), m('h.brim'), { group: g, bevel: 1, local: H });
        r.fill(diamond(H, 5, 5.1, 1.1, 1.4), m('h.em'), { group: g });
        for (const x of [1.6, -2]) r.fill(H.circ(x, 4.85, 0.65), m('h.ruby'), { group: g, bevel: 0.5 });
        // A short fringe of beads over the brow, swinging.
        const sw = [0, 0.25, 0.4, 0.2][ph] + s * 0.3;
        const fr = ['h.green', 'h.pearl', 'h.red', 'h.pearl', 'h.green'];
        for (let i = 0; i < 5; i++) {
          const x = 2.2 + i * 1.05, top = 4.0 + x * 0.05;
          for (let j = 0; j < 2; j++) r.dot(H.x(x - sw * (j + 1) * 0.4, top - 0.8 - j), H.y(x - sw * (j + 1) * 0.4, top - 0.8 - j), m(fr[(i + j) % 5]), 3, g);
        }
        // The bird at the top, facing forward: body, folded wing, head, beak and tail.
        const bx = -0.3, by = 12.7;
        r.fill(H.poly([bx - 3, by + 1.6, bx - 1.4, by + 0.6, bx - 1.6, by + 1.8]), m('h.gold'), { group: g + 1, bevel: 0.5 });
        r.fill(H.ell(bx, by + 1, 1.8, 1.1, 0.2), m('h.gold'), { group: g + 1, bevel: 0.9 });
        r.fill(H.circ(bx + 1.5, by + 2.1, 0.95), m('h.gold'), { group: g + 1, bevel: 0.7 });
        r.fill(H.poly([bx + 2.3, by + 2.4, bx + 3.4, by + 2, bx + 2.3, by + 1.7]), m('h.brim'), { group: g + 1, bevel: 0.3 });
        r.line(H.x(bx - 1, by + 1.3), H.y(bx - 1, by + 1.3), H.x(bx + 0.8, by + 0.9), H.y(bx + 0.8, by + 0.9), m('h.brim'), 1, g + 1);
        r.dot(H.x(bx + 1.7, by + 2.3), H.y(bx + 1.7, by + 2.3), m('h.em'), 3, g + 1);
        // A glint hopping round the brim.
        const gx = [5.8, 3, -0.6, -4.2][ph];
        r.dot(H.x(gx, 5.2 + gx * 0.05), H.y(gx, 5.2 + gx * 0.05), m('h.spark'), 3, g);
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Royal Ring Mantle (juggernaut plate)
// -----------------------------------------------------------------------------

/** Kente keys for the body-worn pieces (armour materials share one namespace). */
const KK = { gold: 'k.rGold', green: 'k.rGreen', red: 'k.rRed', black: 'k.rInk' };

function ringMantle(): SkinArt {
  // Bare-chested under a king's robe: black velvet lined in kente, a gold hem and fringe, a high gold-rimmed
  // collar standing behind the neck, the robe draped over the shoulders with gold crown clasps; a broad gold
  // collar on the chest set with emeralds and rubies, an emerald drop at its front; black ring trunks with a
  // gold waistband; black elbow wraps banded in gold.
  return {
    mats: {
      'k.rRobe': S.velvet(), 'k.rGold': S.gold(), 'k.rTrim': S.gold(undefined), 'k.rGreen': S.green(), 'k.rRed': S.ruby(),
      'k.rInk': { base: ONYX[1], ramp: ONYX }, 'k.rTrunk': S.onyx(), 'k.rWrap': S.onyx((x, y) => (wrap(x * 0.6 + y, 1.6) < 0.4 ? -1 : 0)),
      'k.rEm': S.emerald(), 'k.rRuby': S.ruby(), 'k.rBelt': S.onyx((x) => (wrap(x, 1.8) < 0.45 ? 2 : 0)),
    },
    chest: {
      torso: 'skin', sleeve: null, sleeveLen: 0, forearm: 'k.rWrap', hands: 'skin', pauldron: null,
      trim: null, belt: 'k.rBelt', cape: null, hood: null, spikes: null, skirt: 0, noScarf: true,
      back(r, T, m, c) {
        const s = c.sway * 3, top = c.top, ph = r.phase % 4, fl = [0, 0.4, 0.7, 0.4][ph];
        // The standing collar behind the neck: black velvet, rimmed in gold.
        const col = T.poly([-0.2, top + 0.2, -3.8, top - 0.4, -5.2, top + 3.6, -3, top + 5, -0.8, top + 2.6]);
        r.fill(col, m('k.rTrim'), { group: c.g, bevel: 1, toneBias: -1 });
        r.fill(T.poly([-0.6, top + 0.6, -3.6, top + 0.1, -4.6, top + 3.3, -2.9, top + 4.3, -1.1, top + 2.4]), m('k.rRobe'), { group: c.g, bevel: 0.8, toneBias: -1, noLine: true });
        // The robe: long and heavy, trailing the motion.
        const robe = T.poly([
          -0.4, top + 1, -6.4, top - 0.2, -10.6 - s, -4.6, -13 - s * 1.3 - fl, -14.6,
          -9.6 - s * 1.2, -15.4 + fl * 0.4, -5.6 - s, -15, -2 - s * 0.6, -14.2 + fl * 0.3, -0.8, -2,
        ]);
        r.fill(robe, m('k.rRobe'), { group: c.g + 1, bevel: 3, toneBias: -1, softLight: true, local: T });
        // Kente along the hem: blocks in a band above it, a gold edge under them.
        const hem = T.poly([-16 - s * 1.4, -12.2, -0.4, -11.4, -0.4, -13, -16 - s * 1.4, -13.8]);
        kente(r, -16 - s * 1.4, -0.4, 1.5, intersect(robe, hem), (x0, x1) => T.poly([x0, -10, x1, -10, x1, -17, x0, -17]), m, KK, c.g + 1, -1, ph >> 1);
        r.fill(intersect(robe, T.poly([-16 - s * 1.4, -13.6, -0.4, -12.8, -0.4, -17, -16 - s * 1.4, -17])), m('k.rTrim'), { group: c.g + 1, bevel: 0.5, toneBias: -1, noLine: true });
        // A gold fringe hanging off the hem.
        for (let i = 0; i < 7; i++) {
          const u = (i + 0.5) / 7;
          const x = -12.6 - s * 1.25 - fl + u * (11.8 + s * 0.7 + fl), y = -14.8 + u * 0.8 + (i % 2 ? 0.2 : 0);
          r.dot(T.x(x, y - 0.9), T.y(x, y - 0.9), m('k.rTrim'), i === ph * 2 ? 4 : 2, c.g + 1);
        }
        // A strip of kente lining showing down the robe's leading edge.
        const edge = T.poly([-0.6, top - 0.4, -1.8, top - 1, -2.6 - s * 0.6, -11.6, -1.4 - s * 0.5, -11.6]);
        kente(r, -12, top, 1.6, intersect(robe, edge), (y0, y1) => T.poly([-4 - s, y0, 0, y0, 0, y1, -4 - s, y1]), m, KK, c.g + 1, -1);
      },
      shoulder(r, S2, m, c) {
        const a = c.body.armR, o = { group: c.g, toneBias: c.bias };
        // The robe draped over the shoulder, a gold band along its edge, a gold crown clasp.
        const drape = S2.ell(-0.3, 1.1, a + 1.7, a + 0.6, -0.08);
        r.fill(drape, m('k.rRobe'), { ...o, bevel: 1.4, softLight: true, local: S2 });
        r.fill(intersect(drape, S2.poly([-9, -0.4, 9, 0.2, 9, 1, -9, 0.4])), m('k.rTrim'), { ...o, flat: 3, noLine: true });
        if (c.far) return;
        r.fill(crownMark(S2, 0.6, 1.2, 0.6), m('k.rGold'), { ...o, bevel: 0.4 });
        r.dot(S2.x(0.6, 1.6), S2.y(0.6, 1.6), m('k.rEm'), 3, c.g);
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, fx = b.chestPush * 0.7, front = fx + b.chestW;
        // The muscle under it: the line under the pecs, two rows of the abs.
        const sd = m('skinDark');
        const pec = [[fx - 1.6, top - 4.6], [fx + 0.8, top - 5.6], [front - 1.4, top - 5.4], [front - 0.2, top - 4.4]];
        for (let i = 0; i < pec.length - 1; i++) r.line(T.x(pec[i][0], pec[i][1]), T.y(pec[i][0], pec[i][1]), T.x(pec[i + 1][0], pec[i + 1][1]), T.y(pec[i + 1][0], pec[i + 1][1]), sd, 1, c.g);
        for (const y of [top * 0.52, top * 0.38]) r.line(T.x(front - 3, y), T.y(front - 3, y), T.x(front - 1.4, y + 0.2), T.y(front - 1.4, y + 0.2), sd, 1, c.g);
        r.line(T.x(front - 1.9, top * 0.6), T.y(front - 1.9, top * 0.6), T.x(front - 2, top * 0.3), T.y(front - 2, top * 0.3), sd, 1, c.g);
        // Ring trunks over the hips, a gold waistband, a gold crown at the front hip.
        const trunks = T.poly([-b.hipW - 0.5, 2.2, b.hipW + 1.2, 2.2, b.hipW + 1.9, -2.9, b.hipW * 0.3, -2.2, -b.hipW - 0.9, -2.6]);
        r.fill(trunks, m('k.rTrunk'), { group: c.g + 1, bevel: 2 });
        r.fill(intersect(trunks, T.rect(0, 1.7, 12, 0.5)), m('k.rTrim'), { group: c.g + 1, flat: 3, noLine: true });
        r.fill(crownMark(T, b.hipW * 0.5 + 0.6, -1.2, 0.55), m('k.rGold'), { group: c.g + 1, bevel: 0.3 });
        // The collar: a broad gold crescent round the base of the neck, gems along it, an emerald drop in front.
        const cx = fx * 0.5 + 0.4, cy = top + 0.6;
        const collar = intersect(subtract(T.ell(cx, cy, 5.4, 4.2, -0.12), T.ell(cx + 0.2, cy + 1, 3.6, 2.8, -0.12)), T.rect(cx, cy - 2, 7, 3.4));
        r.fill(collar, m('k.rGold'), { group: c.g + 2, bevel: 1.2, local: T });
        for (const [k, u] of [['k.rEm', 0.2], ['k.rRuby', 0.42], ['k.rEm', 0.64], ['k.rRuby', 0.86]] as const) {
          const a = Math.PI + 0.3 + u * (Math.PI - 0.6);
          r.dot(T.x(cx + Math.cos(a) * 4.5, cy + Math.sin(a) * 3.5), T.y(cx + Math.cos(a) * 4.5, cy + Math.sin(a) * 3.5), m(k), 3, c.g + 2);
        }
        const dx = cx + 2.6, dy = cy - 3.9;
        r.fill(diamond(T, dx, dy, 0.85, 1.2), m('k.rEm'), { group: c.g + 2 });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Champion's Ring Tights (warlord faulds)
// -----------------------------------------------------------------------------

function ringTights(): SkinArt {
  // Glossy black ring tights to the knee, banded in gold, a stripe of kente down the outside of each leg,
  // and black knee pads with a gold crown on the near one.
  return {
    mats: {
      'wf.cloth': S.onyx(), 'l.rGold': S.gold(), 'l.rTrim': S.gold(undefined), 'l.rPad': S.onyx(undefined),
      'l.rGreen': S.green(), 'l.rRed': S.ruby(), 'l.rInk': { base: ONYX[1], ramp: ONYX }, 'l.rEm': S.emerald(),
    },
    legs: {
      mat: 'wf.cloth', trim: 'l.rTrim', knee: null, tasset: null, rune: null, wraps: null, bulk: 0.3,
      over(r, t, m, c) {
        const L = c.len, kr = c.body.kneeR;
        // The kente stripe down the outside of the thigh.
        const stripe = t.poly([L * 0.8, -0.9, L * 0.8, 0.5, L * 0.26, 0.5, L * 0.26, -0.9]);
        kente(r, L * 0.26, L * 0.8, 1.4, stripe, (x0, x1) => t.poly([x0, -2, x1, -2, x1, 2, x0, 2]), m, { gold: 'l.rGold', green: 'l.rGreen', red: 'l.rRed', black: 'l.rInk' }, c.g, c.bias);
        // The knee pad: thick black padding, a gold rim, a gold crown and an emerald on the near leg.
        const pad = t.ell(0.2, 0.7, kr + 1.2, kr + 1.3);
        r.fill(pad, m('l.rPad'), { group: c.far ? 25 : 27, bevel: 1.6, toneBias: c.bias });
        r.fill(subtract(pad, t.ell(0.2, 0.7, kr + 0.5, kr + 0.6)), m('l.rTrim'), { group: c.far ? 25 : 27, flat: 2, noLine: true, toneBias: c.bias });
        if (c.far) return;
        r.fill(crownMark(new Xf(t.x(0.2, 0.7), t.y(0.2, 0.7), 0), 0, -0.9, 0.6), m('l.rGold'), { group: 27, bevel: 0.3 });
        r.dot(t.x(0.2, 0.7), t.y(0.2, 0.7) + 1, m('l.rEm'), 3, 27);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Kente King's Stompers (earthshaker boots)
// -----------------------------------------------------------------------------

function stompers(): SkinArt {
  // Tall black wrestling boots: gold laces criss-crossed up the front, a band of kente at the cuff, gold
  // toe caps and heavy gold soles, an emerald at each ankle.
  return {
    mats: {
      'es.boot': S.onyx(), 'es.band': S.gold(undefined),
      'k.rbGold': S.gold(), 'k.rbSole': S.gold(sweep(7, 1.75, 0.9)), 'k.rbLace': S.gold(undefined),
      'k.rbGreen': S.green(), 'k.rbRed': S.ruby(), 'k.rbInk': { base: ONYX[1], ramp: ONYX }, 'k.rbEm': S.emerald(),
    },
    boots: {
      mat: 'es.boot', height: 0.88, bulk: 0.6, trim: 'es.band', wing: null, knee: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias }, w = c.w, ph = r.phase % 4;
        // Heavy gold soles and toe caps.
        r.fill(foot.cap(-1.8, -1.55, c.toe + 0.4, -1.35, 0.75), m('k.rbSole'), { ...o, bevel: 0.6 });
        r.fill(foot.ell(c.toe - 1.1, -0.3, 1.5, 1.25), m('k.rbGold'), { ...o, bevel: 0.9, local: foot });
        // Kente at the cuff.
        const cuff = shin.rect(c.top - 0.5, 0, 0.9, w + 0.45, 0.2);
        kente(r, -w - 0.5, w + 0.5, 1, cuff, (y0, y1) => shin.poly([c.top - 2, y0, c.top + 1, y0, c.top + 1, y1, c.top - 2, y1]), m, { gold: 'k.rbGold', green: 'k.rbGreen', red: 'k.rbRed', black: 'k.rbInk' }, c.g, c.bias);
        // Laces criss-crossed up the front, a glint climbing them.
        if (!c.far) {
          for (let x = 1.2, i = 0; x < c.top - 1.6; x += 1.4, i++) {
            const tone = i % 4 === ph ? 4 : 3;
            r.line(shin.x(x, w - 0.4), shin.y(x, w - 0.4), shin.x(x + 1.2, w + 0.1), shin.y(x + 1.2, w + 0.1), m('k.rbLace'), tone, c.g);
          }
          r.dot(shin.x(1.4, -w * 0.2), shin.y(1.4, -w * 0.2), m('k.rbEm'), 3, c.g);
        }
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = {
  gold: css(GOLD[3]), goldDk: css(GOLD[1]), glint: css(GOLD[4]), white: css(WHITE),
  green: css(KGREEN[3]), red: css(RUBY[2]), ink: css(ONYX[1]), em: css(EMERALD[3]), dust: css(DUST), rock: css(0x6a5a48),
};
/** The kente ring's pattern, one colour per dot. */
const KENTE_RING = [AC.gold, AC.gold, AC.green, AC.gold, AC.ink, AC.gold, AC.gold, AC.red];
let ringRun = 0, ringShift = 0;
const kenteDot = (g: CanvasRenderingContext2D, px: number, py: number, i: number) => {
  g.fillStyle = i === ringRun || i === (ringRun + 24) % 48 ? AC.white : KENTE_RING[(i + ringShift) % KENTE_RING.length];
  g.fillRect(px, py, 1, 1);
};

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function rulerAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  const back = layer === 'back';
  const RX = 15, RY = 3.8;
  // A ring of kente woven on the ground, its pattern creeping round, two glints running the other way.
  ringRun = (48 - (Math.floor(t * 10) % 48)) % 48;
  ringShift = Math.floor(t * 3) % KENTE_RING.length;
  g.globalAlpha = back ? 0.6 : 0.8;
  ring(g, x, y, RX, RY, 48, layer, kenteDot);
  // The stomp: every couple of seconds the ground shakes, a shockwave of dust rolling out from the feet,
  // pebbles hopping, and a burst of gold glitter thrown up.
  const per = 2.4, u = (t % per) / per, n = Math.floor(t / per);
  if (u < 0.4) {
    const v = u / 0.4, R = 4 + v * 16;
    g.globalAlpha = (1 - v) * 0.9;
    g.fillStyle = AC.dust;
    ring(g, x, y, R, R * 0.26, 30, layer, (g, px, py, i) => { if ((i + n) % 3 !== 0) g.fillRect(px, py - (i % 2), 1, 1); });
    // Dust puffs at either side, rising and spreading.
    for (const s of [-1, 1]) {
      if ((s > 0) === back) continue;
      const px = Math.round(x + s * R), py = Math.round(y - v * 4);
      g.globalAlpha = (1 - v) * 0.7;
      g.fillRect(px, py, 2, 1); g.fillRect(px - s, py - 1, 2, 1);
      if (v > 0.3) g.fillRect(px + s, py - 2, 1, 1);
    }
    // Pebbles hopping off the ground.
    g.globalAlpha = 1;
    g.fillStyle = AC.rock;
    for (let k = 0; k < 4; k++) {
      const a = hash(n, k + 3) * Math.PI * 2, s = Math.sin(a);
      if ((s < 0) !== back) continue;
      const d = 5 + v * (6 + k * 2), hgt = Math.sin(Math.min(1, v * 1.4) * Math.PI) * (3 + k);
      g.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + s * d * 0.26 - hgt), 1, 1);
    }
  }
  // Gold glitter drifting down round the fighter like a champion's confetti, tumbling (wide, then edge-on).
  for (let k = 0; k < 10; k++) {
    if ((k % 2 === 0) !== back) continue;
    const fall = 3.2 + (k % 3) * 0.7, w = ((t + k * 0.53) / fall) % 1;
    const px = Math.round(x + (hash(k, 11) - 0.5) * 34 + Math.sin(t * 1.8 + k * 1.3) * 2), py = Math.round(y - 50 + w * 50);
    g.globalAlpha = Math.min(1, (1 - w) * 4, w * 8) * (back ? 0.7 : 1);
    const turn = Math.floor(t * 5 + k) % 3;
    g.fillStyle = turn === 0 ? AC.glint : k % 4 === 1 ? AC.em : AC.gold;
    g.fillRect(px, py, turn === 1 ? 1 : 2, 1);
  }
  // Emerald motes rising from the ring, flaring as they go.
  for (let k = 0; k < 3; k++) {
    const a = t * 0.5 + (k * Math.PI * 2) / 3, s = Math.sin(a);
    if ((s < 0) !== back) continue;
    const w = (t * 0.4 + k * 0.33) % 1;
    const px = Math.round(x + Math.cos(a) * RX * 0.9), py = Math.round(y + s * RY - w * 22);
    g.globalAlpha = Math.min(1, (1 - w) * 3, w * 10);
    g.fillStyle = AC.em;
    g.fillRect(px, py, 1, 1);
    if (Math.sin(t * 5 + k * 2) > 0.7) {
      g.globalAlpha *= 0.6;
      g.fillRect(px - 1, py, 1, 1); g.fillRect(px + 1, py, 1, 1); g.fillRect(px, py - 1, 1, 1); g.fillRect(px, py + 1, 1, 1);
    }
  }
  g.globalAlpha = 1;
}

export const RULER: Record<string, SkinArt> = {
  'boxing_gloves.ruler': { weapon: gloves, ...FX },
  'mace.ruler': { weapon: sceptre, ...FX },
  'iron_cestus.ruler': { weapon: knuckles, ...FX },
  'echo_stone.ruler': undisputedTitle,
  'storm_crown.ruler': rulerCrown(),
  'juggernaut_plate.ruler': ringMantle(),
  'warlord_faulds.ruler': ringTights(),
  'earthshaker_boots.ruler': stompers(),
};

