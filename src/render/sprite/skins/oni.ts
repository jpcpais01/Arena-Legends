import { ring, type Layer } from '../../auraKit';
import { css, mix } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { hash } from '../../pixel/tex';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import type { BodySpec } from '../body';
import { fillAll, hangAt, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { mats, wrap } from './kit';

/**
 * Epic set: Oni Shogun. The war gear of a demon warlord: black lacquer and
 * crimson silk lacing (odoshi) over lamellar rows, gold crests and rims,
 * red-faced oni with ember eyes and gold fangs, and red maple leaves
 * drifting off everything. Night accents: the oni's ember eyes and a few
 * ember gems, glints on the gold and on the blades' tempered edges.
 */

/** Black lacquer: deep, a little warm, with a glossy highlight. */
const BLACK = [0x0a0608, 0x181016, 0x2a1e26, 0x4a3640, 0xa08898];
/** Vermilion lacquer (the oni's face). */
const RED = [0x3a0608, 0x6e0c10, 0xb01a18, 0xe23a26, 0xff9a70];
/** Crimson silk lacing. */
const SILK = [0x34040c, 0x600a16, 0x981424, 0xcc2a32, 0xf47a6a];
/** Gold for crests, rims and fittings. */
const GOLD = [0x6a3a10, 0xa8701c, 0xe0a830, 0xf8d860, 0xfff4c0];
/** Blade steel, a little cool. */
const STEEL = [0x2a2e3a, 0x5a6274, 0x9ea8ba, 0xd8e0ee, 0xffffff];
/** The tempered edge (hamon): misty white. */
const HAMON = [0x6a7488, 0xb4bccc, 0xe4eaf4, 0xffffff, 0xffffff];
/** Red maple leaves. */
const MAPLE = [0x4a0806, 0x8a160a, 0xd0361a, 0xff6a2a, 0xffc070];
/** Ivory for fangs. */
const IVORY = [0x6a5a40, 0xa89870, 0xe0d4b0, 0xf8f0dc, 0xffffff];
/** Ember (the oni's eyes, gems): glow draws at tone 3. */
const EMBER: MaterialSpec = { base: 0xff6a20, glow: true, ramp: [0x6a0a04, 0xb01a08, 0xe0400c, 0xff7020, 0xffe0a0] };
const EMBER_HOT: MaterialSpec = { base: 0xffd070, glow: true, ramp: [0xd04a10, 0xff8a20, 0xffc040, 0xffe090, 0xfffbe8] };
/** Black silk under the armour (hakama, sleeves). */
const CLOTH = [0x0c080c, 0x1a1218, 0x2a1e26, 0x3e2e38, 0x5a4652];

/** A gleam sliding along gold, one step per frame. */
const gleam = (period = 8): Tex => (x, y, ph) => (wrap(x + y * 0.5 - ph * 2, period) < 1.1 ? 1 : 0);
/**
 * Odoshi: rows of small lacquered scales laced with silk. Each row's top edge
 * is a dark seam; vertical cord runs between.
 */
const odoshi = (row = 2.4): Tex => (_x, y) => {
  const v = wrap(y, row);
  return v < 0.55 ? -2 : v > row - 0.6 ? 1 : 0;
};
/** Black lacquer lames: a dark seam at the top of each row, a lit lip at its bottom. */
const lames = (row = 2.2): Tex => (_x, y) => {
  const v = wrap(y, row);
  return v < 0.45 ? -1 : v > row - 0.5 ? 1 : 0;
};
/** Ribbed lacquer (the helmet bowl's plates, the shin splints). */
const ribs = (p = 1.7): Tex => (x) => (wrap(x, p) < 0.4 ? -1 : wrap(x, p) > p - 0.45 ? 1 : 0);
/** Silk wrap: a diamond lattice of crossing cords. */
const ito: Tex = (x, y) => (Math.abs(wrap(x + y, 2) - 1) + Math.abs(wrap(x - y, 2) - 1) < 0.5 ? -2 : 0);
/** Black silk scattered with small gold-touched maple leaves (only a lighter tone). */
const leafPrint: Tex = (x, y) => (hash(Math.floor(x * 0.5) + 7, Math.floor(y * 0.5)) < 0.1 && wrap(x, 2) < 1 && wrap(y, 2) < 1 ? 2 : 0);

const lacquer = (tex?: Tex): MaterialSpec => ({ base: BLACK[2], ramp: BLACK, shiny: true, step: 0.14, tex });
const red = (tex?: Tex): MaterialSpec => ({ base: RED[2], ramp: RED, shiny: true, step: 0.14, tex });
const silk = (tex?: Tex): MaterialSpec => ({ base: SILK[2], ramp: SILK, tex });
const gold = (tex: Tex | undefined = gleam()): MaterialSpec => ({ base: GOLD[2], ramp: GOLD, shiny: true, tex });
const maple = (tex?: Tex): MaterialSpec => ({ base: MAPLE[2], ramp: MAPLE, shiny: true, tex });
const steel = (tex?: Tex): MaterialSpec => ({ base: STEEL[2], ramp: STEEL, shiny: true, step: 0.15, tex });
const hamon = (): MaterialSpec => ({ base: HAMON[2], ramp: HAMON, shiny: true, step: 0.15, tex: (x, y, ph) => (wrap(x * 0.7 - y * 0.4 - ph * 2.4, 10) < 0.9 ? 1 : 0) });
const ivory = (): MaterialSpec => ({ base: IVORY[2], ramp: IVORY, shiny: true });
const cloth = (tex?: Tex): MaterialSpec => ({ base: CLOTH[2], ramp: CLOTH, tex });

/** Wielded and worn pieces shed red maple leaves; swings leave a crimson-gold trail. */
const FX: Pick<SkinArt, 'fx' | 'trail'> = { fx: { spark: 0xff7a2a, spark2: 0xb01418, kind: 'petal' }, trail: [0xff8a3a, mix(0xff8a3a, 0xb01418, 0.55)] };

/** Particles the full set sheds in battle: red maple leaves. */
export const ONI_FX: SkinFx = { spark: 0xff7a2a, spark2: 0xb01418, kind: 'petal' };

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const ln = (r: Raster, F: Xf, ax: number, ay: number, bx: number, by: number, mat: number, tone: number, g: number) =>
  r.line(F.x(ax, ay), F.y(ax, ay), F.x(bx, by), F.y(bx, by), mat, tone, g);
const dt = (r: Raster, F: Xf, x: number, y: number, mat: number, tone: number, g: number) => r.dot(F.x(x, y), F.y(x, y), mat, tone, g);

/** A tapering chain of capsules through [x, y, radius] points. */
function chain(F: Xf, pts: number[][]): Shape {
  const s: Shape[] = [];
  for (let i = 1; i < pts.length; i++) s.push(F.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i - 1][2], pts[i][2]));
  return union(...s);
}

/**
 * A maple leaf centred at (x, y) in frame F, `s` its radius, its top lobe
 * pointing along angle `a` from +y: five pointed lobes and a short stem.
 */
function mapleLeaf(F: Xf, x: number, y: number, s: number, a = 0): Shape {
  const up = Math.PI / 2 + a;
  if (s < 2.2) {
    // Too small for lobes: a spiky cross (three points and a stem) reads as a leaf at pixel size.
    const tip = (da: number, l: number, w: number) => F.cap(x, y, x + Math.cos(up + da) * l * s, y + Math.sin(up + da) * l * s, w, 0.2);
    return union(F.circ(x, y, 0.5 + s * 0.15), tip(0, 1.15, 0.5), tip(-1.25, 1, 0.45), tip(1.25, 1, 0.45), tip(Math.PI, 0.9, 0.3));
  }
  const pts: number[] = [];
  const at = (da: number, l: number) => pts.push(x + Math.cos(up + da) * l * s, y + Math.sin(up + da) * l * s);
  const lobes: [number, number][] = [[-1.85, 0.7], [-0.95, 0.92], [0, 1.05], [0.95, 0.92], [1.85, 0.7]];
  at(-2.7, 0.3);
  lobes.forEach(([da, l], i) => {
    at(da - 0.3, l * 0.62);
    at(da, l);
    at(da + 0.3, l * 0.62);
    if (i < 4) at((da + lobes[i + 1][0]) / 2, 0.44);
  });
  at(2.7, 0.3);
  const sx = x - Math.cos(up) * s * 0.62, sy = y - Math.sin(up) * s * 0.62;
  return union(F.poly(pts), F.circ(x, y, s * 0.45), F.cap(x, y, sx, sy, s * 0.06 + 0.2, s * 0.04 + 0.15));
}

/** The torso's main volumes (as drawn by the figure), for clipping bands to it. */
function torsoBody(T: Xf, b: BodySpec, top: number): Shape {
  return union(
    T.ell(0.3, 0.6, b.hipW, 3.6),
    T.ell(0.5, top * 0.46, b.waistW, top * 0.28),
    T.ell(b.chestPush * 0.7, top - 3.4, b.chestW, 5.4),
  );
}

/** A band across shape P between y0 and y1 at x = -12..12 of frame F, sloping by `k` per unit x. */
const band = (F: Xf, P: Shape, y0: number, y1: number, k = 0): Shape =>
  intersect(P, F.poly([-14, y0 - k * 14, 14, y0 + k * 14, 14, y1 + k * 14, -14, y1 - k * 14]));

// -----------------------------------------------------------------------------
// Oni Naginata
// -----------------------------------------------------------------------------

function naginata(): WeaponArt {
  // A black lacquer pole wrapped in crimson silk where the hands go, gold bands and a pointed gold
  // butt cap; at the top a gold oni face with ember eyes and horns sweeping back down the pole bites
  // the base of a long curved blade, its tempered edge misty white with a crimson groove and a small
  // gold maple leaf carved in it; a red maple-leaf charm swings from the collar on a crimson cord.
  return {
    tip: 43.6,
    grip2: 12,
    mats: {
      pole: material(lacquer(gleam(11))), ito: material(silk(ito)), gold: material(gold()), face: material(gold(gleam(6))),
      blade: material(steel()), edge: material(hamon()), groove: material(red()), eye: material(EMBER),
      cord: material(silk()), leaf: material(maple()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      const sw = [0, 0.6, 1, 0.5][ph];
      // The charm on its cord, hanging straight down from under the collar whatever the angle.
      const hang = hangAt(t, 25.2, -1.3);
      r.line(hang.x(0, 0), hang.y(0, 0), hang.x(2.6, sw * 0.5), hang.y(2.6, sw * 0.5), m('cord'), 2, g);
      r.line(hang.x(2.6, sw * 0.5), hang.y(2.6, sw * 0.5), hang.x(3.6, sw * 0.8), hang.y(3.6, sw * 0.8), m('cord'), 3, g);
      dt(r, hang, 2.7, sw * 0.5, m('gold'), 3, g);
      r.fill(mapleLeaf(hang, 5, sw, 1.35, Math.PI + sw * 0.3), m('leaf'), { group: g, bevel: 0.7, toneBias: o.toneBias });
      // The pole, its silk wraps, gold bands and the butt cap.
      fillAll(r, [t.cap(-12, 0, 27.6, 0, 1.12, 1.02)], m('pole'), o, 1);
      fillAll(r, [t.cap(-2.6, 0, 3.6, 0, 1.3), t.cap(9.4, 0, 15, 0, 1.28)], m('ito'), o, 1);
      fillAll(r, [
        t.poly([-11.8, -1.25, -14.8, 0, -11.8, 1.25]), t.rect(-11.6, 0, 0.45, 1.32), t.rect(-3, 0, 0.35, 1.4), t.rect(4, 0, 0.35, 1.4),
        t.rect(9, 0, 0.35, 1.38), t.rect(15.4, 0, 0.35, 1.36), t.rect(23.4, 0, 0.4, 1.3),
      ], m('gold'), o, 1);
      // The blade: long and curving up toward the spine, the edge bellying out below.
      const blade = t.poly([
        28.2, 1.15, 33, 1.3, 37.4, 1.9, 40.8, 3, 43.6, 4.7,
        43.9, 2.2, 42.6, -0.3, 40.2, -1.9, 36.6, -2.4, 32.2, -1.9, 28.2, -1.2,
      ]);
      fillAll(r, [blade], m('blade'), o, 1.6);
      // The tempered edge: a misty band along the edge, its inner line rolling in waves.
      const E = [[28.6, -1.2], [32.2, -1.9], [36.6, -2.4], [40.2, -1.9], [42.6, -0.3], [43.9, 2.2]];
      const inner: number[] = [];
      for (let i = E.length - 1; i >= 0; i--) {
        const w = 0.85 + Math.sin(i * 2.1) * 0.3;
        inner.push(E[i][0] - (i > 3 ? w * 0.7 : 0), E[i][1] + w);
      }
      r.fill(intersect(blade, t.poly([...E.flat(), ...inner])), m('edge'), { group: g, bevel: 0.8, noLine: true, toneBias: o.toneBias, local: o.local });
      // The crimson groove under the spine, and the gold maple leaf carved at its root.
      ln(r, t, 29.6, 0.55, 37.2, 1.05, m('groove'), 2, g);
      ln(r, t, 37.2, 1.05, 39.6, 1.8, m('groove'), 1, g);
      r.fill(mapleLeaf(t, 31, -0.4, 0.95, -Math.PI / 2), m('gold'), { group: g, flat: 3, noLine: true });
      // The gold collar, then the oni face biting the blade: horns sweeping back down the pole.
      fillAll(r, [t.rect(27.9, 0, 0.55, 1.45)], m('gold'), o, 0.6);
      fillAll(r, [chain(t, [[26.4, 1.2, 0.6], [24.6, 2.2, 0.45], [22.8, 2.4, 0.18]]), chain(t, [[26.4, -1.2, 0.6], [24.6, -2.2, 0.45], [22.8, -2.4, 0.18]])], m('face'), o, 0.6, -1);
      fillAll(r, [union(t.ell(26.3, 0, 1.55, 1.95), t.poly([26.8, -1.4, 28.6, -1, 28.6, 1, 26.8, 1.4]))], m('face'), o, 1.1);
      ln(r, t, 25.4, 0.9, 26.4, 0.4, m('pole'), 1, g);
      ln(r, t, 25.4, -0.9, 26.4, -0.4, m('pole'), 1, g);
      dt(r, t, 26.6, 0.65, m('eye'), 3, g);
      dt(r, t, 26.6, -0.65, m('eye'), ph === 2 ? 4 : 3, g);
      dt(r, t, 27.6, 0, m('pole'), 0, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Kaiken of the Oni
// -----------------------------------------------------------------------------

function kaiken(): WeaponArt {
  // A short straight blade with a misty edge and a crimson groove, a guard that is a gold maple leaf
  // seen at an angle, a crimson silk wrapped grip and a gold oni-head pommel with horns and an ember eye;
  // a crimson cord with a small tassel swings from the pommel.
  return {
    tip: 14.2,
    mats: {
      blade: material(steel()), edge: material(hamon()), groove: material(red()), grip: material(silk(ito)),
      gold: material(gold(gleam(6))), eye: material(EMBER), cord: material(silk()), leaf: material(maple()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4, sw = [0, 0.5, 0.8, 0.4][ph];
      // The cord and its tassel hanging from the pommel.
      const hang = hangAt(t, -5.4, 0);
      r.line(hang.x(0, 0), hang.y(0, 0), hang.x(2.4, sw * 0.6), hang.y(2.4, sw * 0.6), m('cord'), 2, g);
      fillAll(r, [hang.poly([2.2, sw * 0.6 - 0.5, 4.6, sw - 0.8, 4.8, sw + 0.7, 2.2, sw * 0.6 + 0.5])], m('cord'), o, 0.6);
      dt(r, hang, 2.3, sw * 0.6, m('gold'), 3, g);
      // The grip and the oni pommel.
      fillAll(r, [t.cap(-4.3, 0, 0.2, 0, 1.12)], m('grip'), o, 1);
      fillAll(r, [chain(t, [[-5, 0.8, 0.45], [-6.1, 1.8, 0.3], [-6.4, 2.6, 0.12]]), chain(t, [[-5, -0.8, 0.45], [-6.1, -1.8, 0.3], [-6.4, -2.6, 0.12]])], m('gold'), o, 0.5, -1);
      fillAll(r, [t.ell(-4.9, 0, 1.15, 1.35)], m('gold'), o, 0.9);
      dt(r, t, -4.5, 0.4, m('eye'), 3, g);
      // The maple-leaf guard, squashed along the blade as if seen at an angle.
      const G = new Xf(t.x(0.7, 0), t.y(0.7, 0), t.ang, t.sx * 0.42, t.sy);
      r.fill(mapleLeaf(G, 0, 0, 4.5, 0), m('leaf'), { group: g, bevel: 1, toneBias: o.toneBias });
      r.fill(subtract(mapleLeaf(G, 0, 0, 4.5, 0), mapleLeaf(G, 0, 0.2, 3.5, 0)), m('gold'), { group: g, flat: 3, noLine: true });
      // The blade, its edge, the groove and the gold collar.
      const blade = t.poly([1.6, 1.15, 11.4, 1.05, 13.4, 0.55, 14.2, -0.3, 13.1, -1.2, 1.6, -1.35]);
      fillAll(r, [blade], m('blade'), o, 1.2);
      r.fill(intersect(blade, t.poly([1.6, -1.6, 14.6, -1.6, 14.6, -0.2, 12.4, -0.25, 9.4, -0.55, 7, -0.2, 4.4, -0.6, 1.6, -0.3])), m('edge'), { group: g, bevel: 0.6, noLine: true, toneBias: o.toneBias, local: o.local });
      ln(r, t, 3.2, 0.5, 10.4, 0.5, m('groove'), 2, g);
      fillAll(r, [t.rect(1.9, 0, 0.45, 1.4)], m('gold'), o, 0.5);
    },
  };
}

// -----------------------------------------------------------------------------
// Shogun's Omamori
// -----------------------------------------------------------------------------

const OM_SPECS: Record<string, MaterialSpec> = {
  'k.silk': red((x, y) => (Math.abs(wrap(x + y, 2.2) - 1.1) + Math.abs(wrap(x - y, 2.2) - 1.1) < 0.45 ? 1 : 0)),
  'k.black': lacquer(),
  'k.gold': gold(gleam(6)),
  'k.cord': silk(),
  'k.paper': { base: 0xf4f0e6, ramp: [0x8a8478, 0xc8c2b4, 0xf0ece2, 0xffffff, 0xffffff] },
  'k.leaf': maple(),
  'k.ember': EMBER,
  'k.hot': EMBER_HOT,
};
const OM = mats(OM_SPECS);

/** A paper zigzag (shide) from (x, y) down and out to side `s`, `n` folds. */
function shide(r: Raster, t: Xf, m: (k: string) => number, x: number, y: number, s: number, n: number, g: number): void {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) pts.push(x + s * (i % 2 ? 1.6 : 0.4) + s * i * 0.35, y - i * 1.15);
  const back: number[] = [];
  for (let i = n; i >= 0; i--) back.push(pts[i * 2] + s * 0.9, pts[i * 2 + 1] + 0.2);
  r.fill(t.poly([...pts, ...back]), m('k.paper'), { group: g, bevel: 0.5 });
}

/**
 * The shogun's omamori, origin at its centre: a vermilion brocade charm
 * pouch with a gold maple-leaf crest and an ember at its heart, a black
 * lacquer cap tied with a crimson cord knot, a small maple leaf circling it.
 * Frames 0..3 rest, 4..7 lit (it has just raised a shield): the crest flares
 * and paper streamers fan out with a burst of leaves.
 */
function omamori(r: Raster, t: Xf, m: (k: string) => number, f: number): void {
  const lit = f >= 4, k = f & 3;
  // The circling leaf, behind on its far half.
  const leafAt = (a: number, R: number, ry: number, front: boolean) => {
    const s = Math.sin(a);
    if ((s > 0) === front) return;
    r.fill(mapleLeaf(t, Math.cos(a) * R, s * ry - 0.4, 1.1, a * 2), m('k.leaf'), { group: front ? 9 : 1, bevel: 0.5, toneBias: front ? 0 : -1 });
  };
  const orbit = (front: boolean) => {
    if (lit) for (let i = 0; i < 4; i++) leafAt(i * Math.PI / 2 + k * 0.5 + 0.4, 6 + k * 0.7, 3 + k * 0.4, front);
    else leafAt(k * (Math.PI / 2) + 0.6, 6, 2.6, front);
  };
  orbit(false);
  if (lit) {
    shide(r, t, m, -2.4, 3, -1, 3 + (k & 1), 2);
    shide(r, t, m, 2.4, 3, 1, 3 + ((k + 1) & 1), 2);
  }
  // The pouch: a tall flat bag, its top corners folded in.
  const pouch = t.poly([-2.4, 3.4, 2.4, 3.4, 3.2, 2.6, 3.2, -4.4, 2.6, -4.9, -2.6, -4.9, -3.2, -4.4, -3.2, 2.6]);
  r.fill(pouch, m('k.silk'), { group: 3, bevel: 1.6, lightBias: lit ? 0.25 : 0 });
  r.fill(band(t, pouch, -4.9, -4.1), m('k.gold'), { group: 3, flat: 2, noLine: true });
  // The black cap and the cord knot over it, its loop rising above.
  r.fill(band(t, pouch, 1.4, 3.6), m('k.black'), { group: 4, bevel: 0.8 });
  r.fill(t.rect(0, 1.4, 3.2, 0.3), m('k.gold'), { group: 4, flat: 3, noLine: true });
  r.fill(subtract(t.ell(0, 4.6, 1.3, 1.4), t.ell(0, 4.6, 0.55, 0.65)), m('k.cord'), { group: 5, bevel: 0.6 });
  r.fill(t.circ(0, 3.2, 0.9), m('k.cord'), { group: 5, bevel: 0.6 });
  // The crest: a gold maple leaf with an ember at its heart; a glint walks over it.
  r.fill(mapleLeaf(t, 0, -1.5, 2.3, 0), m('k.gold'), { group: 6, bevel: 0.8, lightBias: lit ? 0.4 : 0 });
  if (lit) {
    r.fill(mapleLeaf(t, 0, -1.5, 1.3, 0), m('k.hot'), { group: 6 });
  } else {
    const gl = [[-1.2, -0.6], [0, 0.6], [1.2, -0.6], [0, -2.6]][k];
    r.dot(t.x(gl[0], gl[1]), t.y(gl[0], gl[1]), m('k.gold'), 4, 6);
  }
  r.dot(t.x(0, -1.5), t.y(0, -1.5), m(lit ? 'k.hot' : 'k.ember'), lit ? 4 : 3, 6);
  orbit(true);
}

const omamoriSkin: SkinArt = {
  mats: OM_SPECS,
  glow: [0xffd890, 0xd8301a],
  icon(r, t, m) {
    // The charm large, a few maple leaves falling past it.
    const T = new Xf(t.x(0, 0.4), t.y(0, 0.4), 0, 2, 2);
    r.fill(mapleLeaf(t, -8.4, 6.6, 2.6, 0.6), m('k.leaf'), { group: 1, bevel: 1, toneBias: -1 });
    r.fill(mapleLeaf(t, 8.6, -6.4, 2.4, -0.5), m('k.leaf'), { group: 1, bevel: 1, toneBias: -1 });
    omamori(r, T, m, 1);
    r.fill(mapleLeaf(t, 7.4, 8.2, 2.2, -1.1), m('k.leaf'), { group: 12, bevel: 1 });
  },
  proj: {
    ward: {
      frames: 8,
      outline: true,
      draw: (r, t, f, h) => omamori(r, t, (k) => h(OM[k]), f),
    } satisfies ProjArt,
  },
};

// -----------------------------------------------------------------------------
// Oni Kabuto
// -----------------------------------------------------------------------------

function oniKabuto(): SkinArt {
  // A ribbed black lacquer helmet bowl with a gold brow band and a jutting visor, a flaring neck
  // guard of crimson laced lames edged in gold, black side flaps with a gold crest; tall gold horns
  // sweeping up from the brow with a red maple leaf between them; under the visor a vermilion oni
  // mask: scowling black brows, ember eyes, a hooked nose and a snarl of gold fangs.
  return {
    head: () => ({
      mats: {
        'h.lac': material(lacquer(ribs(1.6))), 'h.flap': material(lacquer()), 'h.lame': material(lacquer(lames(1.8))), 'h.lace': material(silk()), 'h.odo': material(silk(odoshi(1.9))),
        'h.gold': material(gold(gleam(7))), 'h.horn': material(gold(gleam(9))), 'h.red': material(red()),
        'h.brow': material({ base: BLACK[1], ramp: BLACK }), 'h.eye': material(EMBER_HOT), 'h.fang': material(ivory()),
        'h.leaf': material(maple()),
      },
      draw(r, H, m, g) {
        const ph = r.phase % 4;
        // The far horn, curving up and back behind the bowl.
        r.fill(chain(H, [[3.4, 3.8, 1.1], [3, 7.4, 1.05], [1.6, 10.8, 0.8], [-0.6, 13.2, 0.45], [-2.8, 14.4, 0.12]]), m('h.horn'), { group: 50, bevel: 1, toneBias: -1, local: H });
        // The neck guard: lames flaring out behind and down to the shoulders.
        const shik = H.poly([1, 2.8, -7.4, 2.6, -10, -1.2, -11.6, -6.4, -6.6, -8.4, -1.4, -7.4, -0.6, -3]);
        r.fill(shik, m('h.lame'), { group: g, bevel: 1.6, local: H });
        // Crimson lacing running down through the lames.
        for (const [ax, bx] of [[-1.4, -2], [-4.2, -5.6], [-7, -9.2]]) ln(r, H, ax, 2.4, bx, -7.4, m('h.lace'), 3, g);
        r.fill(band(H, shik, -9.6, -7.5, -0.14), m('h.gold'), { group: g, flat: 2, noLine: true });
        // The bowl: ribbed black lacquer, a gold band round its rim and a gold boss on the crown.
        const bowl = intersect(H.ell(-0.6, 1.8, 7.6, 7.4), H.poly([-12, 1.6, 9, 2.6, 9, 14, -12, 14]));
        r.fill(bowl, m('h.lac'), { group: 51, bevel: 3, local: H });
        r.fill(band(H, bowl, 1.4, 3.1, 0.05), m('h.gold'), { group: 51, flat: 2, noLine: true });
        r.fill(H.ell(-1.2, 9.2, 1.3, 0.7), m('h.gold'), { group: 51, bevel: 0.6 });
        // The oni mask over the face.
        const mask = H.poly([0.6, 2, 7.4, 1.8, 8.4, 0.6, 8.1, -1.4, 9.6, -2.8, 8.2, -3.6, 8.7, -4.8, 7.8, -6.4, 5, -7.8, 1.4, -7.4, 0.2, -3.6]);
        r.fill(mask, m('h.red'), { group: 52, bevel: 1.8, local: H });
        // Scowling brows and the eye sockets, ember eyes burning in them.
        r.fill(H.poly([2.2, 1.4, 4.4, 1.6, 7.6, 0.8, 7.8, 0.1, 5.8, 0.3, 4.6, -0.5, 2.4, 0.4]), m('h.brow'), { group: 52, bevel: 0.6 });
        dt(r, H, 3.6, -0.6, m('h.eye'), 3, 52);
        dt(r, H, 6.6, -0.5, m('h.eye'), ph === 1 ? 4 : 3, 52);
        // Wrinkles on the cheek, the nostril, the snarl with its fangs, and a black moustache over it.
        ln(r, H, 2, -2.2, 4, -3.4, m('h.brow'), 2, 52);
        ln(r, H, 2.4, -4.4, 4, -5, m('h.brow'), 2, 52);
        dt(r, H, 8.6, -3.2, m('h.brow'), 0, 52);
        r.fill(H.poly([4.4, -4.6, 8.4, -4.4, 7.6, -5.8, 4.8, -5.8]), m('h.brow'), { group: 52, flat: 0, noLine: true });
        r.fill(union(H.poly([5, -4.6, 5.5, -6.2, 6, -4.6]), H.poly([7.2, -4.5, 7.5, -5.7, 7.8, -4.5])), m('h.fang'), { group: 52, flat: 3, noLine: true });
        r.fill(union(H.poly([4.5, -6.2, 4.1, -3.8, 5.1, -5.6]), H.poly([8.1, -5.6, 8.6, -3.6, 8.7, -5.2])), m('h.gold'), { group: 53, bevel: 0.5 });
        r.fill(H.poly([5, -3.8, 7.2, -3.7, 8.6, -4.2, 6.6, -4.3, 4.4, -4.4]), m('h.brow'), { group: 52, flat: 1, noLine: true });
        // The throat guard: two laced lames hanging from the chin.
        const throat = H.poly([1.4, -7, 6.6, -7.6, 6, -9.8, 1.2, -9.4]);
        r.fill(throat, m('h.odo'), { group: 54, bevel: 1, local: H });
        r.fill(band(H, throat, -10, -9.2, -0.1), m('h.gold'), { group: 54, flat: 2, noLine: true });
        // The visor jutting over the brow, gold edged.
        r.fill(H.poly([1, 3.2, 6, 2.9, 9.8, 2, 10, 1.3, 6, 1.9, 1, 2.1]), m('h.flap'), { group: 55, bevel: 0.8 });
        ln(r, H, 6, 1.9, 9.8, 1.4, m('h.gold'), 3, 55);
        // The near side flap, turned back, with a gold crest.
        r.fill(H.poly([-0.4, 3.2, 2, 3, 1.6, -0.4, -0.6, -1.4, -1.6, 0.6]), m('h.flap'), { group: 56, bevel: 1 });
        r.fill(subtract(H.poly([-0.4, 3.2, 2, 3, 1.6, -0.4, -0.6, -1.4, -1.6, 0.6]), H.poly([-0.1, 2.6, 1.4, 2.4, 1.1, -0.2, -0.4, -0.8, -1, 0.6])), m('h.gold'), { group: 56, flat: 2, noLine: true });
        r.fill(H.circ(0.3, 0.8, 0.6), m('h.gold'), { group: 56, bevel: 0.4 });
        // The crest: the near horn sweeping up and forward then back, the maple leaf between the horns.
        r.fill(H.rect(4.6, 3.6, 1.4, 0.7, 0.3), m('h.gold'), { group: 57, bevel: 0.6 });
        r.fill(chain(H, [[5.6, 3.8, 1.2], [7.4, 6.6, 1.15], [8, 10, 0.9], [7, 13.4, 0.55], [4.8, 15.8, 0.14]]), m('h.horn'), { group: 58, bevel: 1.1, local: H });
        r.fill(mapleLeaf(H, 4.2, 6.4, 2.7, -0.1), m('h.gold'), { group: 59, bevel: 0.8 });
        r.fill(mapleLeaf(H, 4.2, 6.5, 2, -0.1), m('h.leaf'), { group: 59, bevel: 0.8 });
        dt(r, H, 4.2, 6.1, m('h.eye'), 3, 59);
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// O-Yoroi of the Oni
// -----------------------------------------------------------------------------

function oYoroi(): SkinArt {
  // The great armour: rows of crimson-laced lames banded in black lacquer, a black breastplate edged in
  // gold with a gold maple crest round an ember, big box shoulder guards laced the same under gold
  // caps, black silk sleeves under splinted black bracers, and a crimson war banner with a gold maple
  // leaf riding on a black pole at the back.
  return {
    mats: {
      'oc.odo': silk(odoshi()), 'oc.lac': lacquer(), 'oc.gold': gold(gleam(7)), 'oc.sleeve': cloth(leafPrint),
      'oc.kote': lacquer(ribs(1.5)), 'oc.lame': lacquer(lames(2)), 'oc.hand': { base: BLACK[1], ramp: BLACK }, 'oc.cord': silk(),
      'oc.flag': { base: SILK[3], ramp: [0x4a060e, 0x7a0e18, 0xb41a24, 0xd8302e, 0xff7a5a], tex: (x) => (wrap(x, 3.2) < 0.5 ? -1 : 0) },
      'oc.ember': EMBER,
    },
    chest: {
      torso: 'oc.odo', sleeve: 'oc.sleeve', sleeveLen: 1, forearm: 'oc.kote', hands: 'oc.hand', pauldron: null, spikes: null,
      cape: null, trim: null, belt: 'oc.cord',
      back(r, T, m, c) {
        // The banner pole up the back, a crossbar at the top, the banner hanging from it and rippling.
        const s = c.sway * 2.2, top = c.top, ph = r.phase % 4;
        const px = -4.2, yTop = top + 22;
        r.fill(T.cap(px + 0.4, top * 0.2, px - 0.2, yTop + 0.6, 0.55), m('oc.lac'), { group: 40, bevel: 0.6, toneBias: -1 });
        r.fill(T.cap(px - 0.2, yTop, px - 6.6 - s * 0.4, yTop + 0.4, 0.45), m('oc.lac'), { group: 40, bevel: 0.5, toneBias: -1 });
        const hem: number[] = [];
        for (let i = 0; i <= 3; i++) {
          const u = i / 3, rip = Math.sin(ph * (Math.PI / 2) + i * 1.9) * 0.5;
          hem.push(px - 6.4 - s * 0.8 + u * 6, yTop - 10.4 - u * 0.4 + rip);
        }
        const flag = T.poly([px - 0.4, yTop - 0.2, px - 6.4 - s * 0.4, yTop - 0.2, px - 7 - s * 0.7 - [0, 0.3, 0.5, 0.2][ph], yTop - 5, ...hem, px - 0.4, yTop - 10.4]);
        r.fill(flag, m('oc.flag'), { group: 40, bevel: 1.4, toneBias: -1, softLight: true });
        r.fill(band(T, flag, yTop - 1.4, yTop + 1), m('oc.lac'), { group: 40, flat: 1, noLine: true });
        r.fill(mapleLeaf(T, px - 3.6 - s * 0.5, yTop - 5.4, 2.2, 0.1), m('oc.gold'), { group: 41, bevel: 0.7, toneBias: -1 });
        r.fill(T.circ(px - 0.2, yTop + 0.6, 0.6), m('oc.gold'), { group: 41, bevel: 0.4, toneBias: -1 });
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, fx = b.chestPush * 0.7;
        const body = torsoBody(T, b, top);
        // The topmost row of the skirt below the belt, black banded and gold rimmed.
        const hem = T.poly([-b.hipW - 0.6, 1.6, b.hipW + 1.4, 1.6, b.hipW + 2, -2.4, -b.hipW - 1, -2], 0.3);
        r.fill(hem, m('oc.odo'), { group: 60, bevel: 1.4, local: T });
        r.fill(band(T, hem, 0.2, 0.9), m('oc.lac'), { group: 60, flat: 1, noLine: true });
        r.fill(band(T, hem, -2.6, -1.8), m('oc.gold'), { group: 60, flat: 2, noLine: true });
        // Black lacquer bands between the rows of the body.
        for (const y of [top * 0.3]) r.fill(band(T, body, y - 0.5, y + 0.3), m('oc.lac'), { group: c.g, flat: 1, noLine: true });
        // The breastplate: black lacquer edged in gold over the upper chest.
        const plate = intersect(body, T.poly([fx - 3, top - 0.4, fx + b.chestW + 0.8, top - 1, fx + b.chestW + 0.8, top * 0.6, fx + 0.6, top * 0.56, fx - 3.2, top * 0.66]));
        r.fill(plate, m('oc.lac'), { group: 61, bevel: 2, lightBias: 0.1 });
        r.fill(subtract(plate, T.poly([fx - 2.4, top - 1, fx + b.chestW + 0.2, top - 1.6, fx + b.chestW + 0.2, top * 0.64, fx + 0.6, top * 0.6, fx - 2.6, top * 0.7])), m('oc.gold'), { group: 61, flat: 2, noLine: true });
        // The maple crest with its ember heart.
        const kx = fx + 2.4, ky = top * 0.8;
        r.fill(mapleLeaf(T, kx, ky, 2, 0), m('oc.gold'), { group: 62, bevel: 0.7 });
        dt(r, T, kx, ky, m('oc.ember'), 3, 62);
        // The collar, black with a gold rim, and the crimson cord bow at the waist.
        r.fill(T.ell(0.4, top + 0.3, 4.2, 2.2, -0.1), m('oc.lac'), { group: 63, bevel: 1.4 });
        r.fill(band(T, T.ell(0.4, top + 0.3, 4.2, 2.2, -0.1), top - 0.6, top - 0.1), m('oc.gold'), { group: 63, flat: 2, noLine: true });
        const bx = b.waistW - 0.2;
        r.fill(union(T.ell(bx - 0.6, 2.4, 0.9, 0.6, 0.5), T.ell(bx + 0.8, 2.4, 0.9, 0.6, -0.5)), m('oc.cord'), { group: 64, bevel: 0.5 });
        ln(r, T, bx, 2.2, bx - 0.4, 0, m('oc.cord'), 2, 64);
        ln(r, T, bx + 0.2, 2.2, bx + 0.8, 0.2, m('oc.cord'), 3, 64);
      },
      shoulder(r, S, m, c) {
        const a = c.body.armR, o = { group: c.g, toneBias: c.bias };
        // A big box guard hanging off the shoulder: black lacquer lames laced down in crimson, a gold cap and rim.
        const sode = S.poly([-a - 1, 1.6, a + 1.4, 1.9, a + 2, -4.8, -a - 1.5, -5.1]);
        r.fill(sode, m('oc.lame'), { ...o, bevel: 1.4, local: S });
        for (const x of [-a * 0.4, a * 0.9]) ln(r, S, x, 1.4, x + 0.25, -4.6, m('oc.cord'), c.far ? 2 : 3, c.g);
        r.fill(band(S, sode, -5.5, -4.5, 0.05), m('oc.gold'), { ...o, flat: 2, noLine: true });
        r.fill(S.poly([-a - 1.4, 2.6, a + 1.8, 2.9, a + 1.8, 1.4, -a - 1.4, 1.1]), m('oc.lac'), { ...o, bevel: 0.8 });
        ln(r, S, -a - 1.2, 2.6, a + 1.6, 2.9, m('oc.gold'), 3, c.g);
        if (!c.far) dt(r, S, 0.2, 1.8, m('oc.gold'), 4, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Shogun's Kusazuri
// -----------------------------------------------------------------------------

function kusazuri(): SkinArt {
  // Black silk hakama printed with small maple leaves under a flaring skirt of crimson-laced lames,
  // black lacquer bands between the rows and a gold rim at the hem; a crimson tasselled knot and a
  // gold maple crest with an ember on the near panel.
  return {
    mats: {
      'ol.hakama': cloth(leafPrint), 'ol.odo': silk(odoshi(2.2)), 'ol.lac': lacquer(), 'ol.gold': gold(gleam(6)),
      'ol.cord': silk(), 'ol.ember': EMBER,
    },
    legs: {
      mat: 'ol.hakama', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.45,
      over(r, t, m, c) {
        const w = c.w, L = c.len, ph = r.phase % 4, fl = [0, 0.3, 0.5, 0.2][ph];
        const hem = L * 0.22;
        // The back panel peeking out behind, then the front one flaring toward the hem.
        const back = t.poly([L + 1.2, -w - 0.4, L + 1.2, -w + 2, hem + 1.6, -w + 1, hem + 0.8 - fl * 0.3, -w - 2.6 - fl * 0.4], 0.2);
        r.fill(back, m('ol.odo'), { group: c.g + 20, bevel: 1.2, toneBias: c.bias - 1, local: t });
        const front = t.poly([L + 1.4, -w + 0.2, L + 1.4, w + 1.3, hem - fl * 0.3, w + 2.6 + fl * 0.4, hem + 0.3, -w - 1.4], 0.2);
        r.fill(front, m('ol.odo'), { group: c.g + 21, bevel: 1.4, toneBias: c.bias, local: t });
        // Black bands between the rows (across the thigh), the gold rim at the hem.
        for (const u of [0.78, 0.55]) {
          const x = L * u;
          r.fill(intersect(front, t.poly([x + 0.6, -w - 4, x + 0.6, w + 4, x, w + 4, x, -w - 4])), m('ol.lac'), { group: c.g + 21, flat: 1, noLine: true });
        }
        r.fill(intersect(front, t.poly([hem + 1, -w - 4, hem + 1 - fl * 0.3, w + 5, hem - 2, w + 5, hem - 2, -w - 4])), m('ol.gold'), { group: c.g + 21, flat: 2, noLine: true });
        // The cord at the top.
        r.fill(t.cap(L + 0.8, -w - 0.2, L + 0.8, w + 1.1, 0.5), m('ol.cord'), { group: c.g + 22, bevel: 0.5, toneBias: c.bias });
        if (c.far) return;
        // The crest on the near panel, and the knot with its tassel swinging off the hip.
        const mx = L * 0.42, my = w * 0.5;
        r.fill(mapleLeaf(t, mx, my, 1.4, Math.PI / 2), m('ol.gold'), { group: c.g + 23, bevel: 0.6 });
        dt(r, t, mx, my, m('ol.ember'), 3, c.g + 23);
        const kx = L + 0.6, ky = w + 1.4;
        r.fill(t.cap(kx - 0.4, ky + 0.2, kx - 3.6 - fl, ky + 0.9 + fl * 0.4, 0.35, 0.65), m('ol.cord'), { group: c.g + 24, bevel: 0.6 });
        r.fill(t.circ(kx, ky, 0.75), m('ol.cord'), { group: c.g + 24, bevel: 0.5 });
        dt(r, t, kx - 3.4 - fl, ky + 0.9 + fl * 0.4, m('ol.gold'), 3, c.g + 24);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Suneate of the Oni
// -----------------------------------------------------------------------------

function suneate(): SkinArt {
  // Splinted black lacquer shin guards edged in gold, tied on with crimson silk cords, tall knee plates
  // with a small gold oni face and an ember eye, and black foot plates with gold rivets.
  return {
    mats: {
      greave: lacquer(ribs(1.4)), greaveDark: gold(), 'ob.lac': lacquer(), 'ob.gold': gold(gleam(6)), 'ob.cord': silk(),
      'ob.ember': EMBER,
    },
    boots: {
      mat: 'greave', height: 0.92, bulk: 0.5, trim: 'greaveDark', knee: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w;
        // The foot plate over the instep, two gold rivets.
        r.fill(foot.poly([-0.6, 0.6, c.toe - 1.6, 0.4, c.toe - 0.6, -0.2, c.toe - 1.8, -0.6, -0.6, -0.4]), m('ob.lac'), { ...o, bevel: 0.6 });
        dt(r, foot, c.toe * 0.35, 0.2, m('ob.gold'), 4, c.g);
        if (!c.far) dt(r, foot, c.toe * 0.65, 0.1, m('ob.gold'), 3, c.g);
        // Gold edges down the front of the splints.
        ln(r, shin, 0.8, w - 0.1, c.top - 0.4, w - 0.2, m('ob.gold'), 3, c.g);
        // Crimson silk ties round the shin, their bows at the back.
        for (const x of [c.top * 0.28, c.top * 0.72]) {
          ln(r, shin, x, -w - 0.3, x + 0.3, w + 0.2, m('ob.cord'), 3, c.g);
          if (!c.far) r.fill(union(shin.ell(x + 0.4, -w - 0.7, 0.7, 0.45, 0.6), shin.ell(x - 0.4, -w - 0.7, 0.7, 0.45, -0.6)), m('ob.cord'), { ...o, bevel: 0.4 });
        }
        // The knee plate: a shield rising over the knee, gold rimmed, a small oni face on it.
        const kx = c.len - 0.6;
        const plate = shin.poly([kx - 2.4, -w * 0.4, kx + 1.6, -w * 0.6, kx + 3, w * 0.2, kx + 2.2, w + 0.9, kx - 2.4, w + 0.6]);
        r.fill(plate, m('ob.lac'), { ...o, bevel: 1, lightBias: 0.1 });
        r.fill(subtract(plate, shin.poly([kx - 1.8, -w * 0.2, kx + 1.3, -w * 0.3, kx + 2.4, w * 0.2, kx + 1.8, w + 0.3, kx - 1.8, w + 0.1])), m('ob.gold'), { ...o, flat: 2, noLine: true });
        if (c.far) return;
        r.fill(shin.ell(kx + 0.2, w * 0.3, 0.9, 0.75), m('ob.gold'), { ...o, bevel: 0.5 });
        dt(r, shin, kx + 0.3, w * 0.5, m('ob.ember'), ph === 3 ? 4 : 3, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = {
  red: css(SILK[3]), redDk: css(SILK[1]), gold: css(GOLD[3]), goldDk: css(GOLD[1]), black: css(BLACK[1]),
  leaf: [css(MAPLE[3]), css(MAPLE[2]), css(0xff9a3a), css(GOLD[3])], leafDk: css(MAPLE[1]),
  fire: css(0xd8301a), fireMid: css(0xff7a2a), fireHot: css(0xffe8a0),
};

/** Maple leaves swirling round the fighter: height they start at, radius, angular speed, phase, fall speed. */
const LEAVES: [number, number, number, number, number][] = [
  [30, 16, 0.9, 0, 5], [24, 19, 0.7, 2.2, 4], [34, 14, 1.1, 4.1, 6], [20, 21, 0.8, 1.1, 3.5], [28, 17, 1, 3.3, 4.5], [16, 13, 1.2, 5.2, 5.5],
];

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function oniAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  const back = layer === 'back';
  // A ground ring of crimson lacquer studded in gold, a gleam running round it.
  const RX = 15, RY = 3.8, run = Math.floor(t * 6) % 24;
  ring(g, x, y, RX, RY, 24, layer, (g, px, py, i) => {
    if (i % 4 === 0) { g.globalAlpha = 0.9; g.fillStyle = i === (run & ~3) ? AC.gold : AC.goldDk; g.fillRect(px, py, 1, 1); return; }
    g.globalAlpha = i === run ? 0.95 : 0.55;
    g.fillStyle = i === run ? AC.gold : AC.red;
    g.fillRect(px, py, 2, 1);
  });
  g.globalAlpha = 1;
  // Fallen leaves resting on the ground, slowly turning with the ring.
  for (let k = 0; k < 4; k++) {
    const a = k * 1.57 + 0.6 + t * 0.12, s = Math.sin(a);
    if ((s < 0) !== back) continue;
    const px = Math.round(x + Math.cos(a) * (RX - 4)), py = Math.round(y + s * (RY - 1));
    g.fillStyle = AC.leafDk; g.fillRect(px - 1, py, 3, 1);
    g.fillStyle = AC.leaf[k % 4]; g.fillRect(px, py - 1, 1, 1);
  }
  // Leaves swirling down round the fighter, tumbling as they go: a cross when flat, a dash edge-on.
  for (const [k, [h0, R, sp, p0, fall]] of LEAVES.entries()) {
    const a = p0 + t * sp, s = Math.sin(a);
    if ((s < 0) !== back) continue;
    const h = wrap(h0 - t * fall, 36);
    if (h < 2) continue;
    const px = Math.round(x + Math.cos(a) * R * (0.7 + h / 120)), py = Math.round(y - h + s * 3);
    const flat = Math.floor(t * 5 + k * 1.7) % 3 !== 0;
    g.globalAlpha = h > 30 ? (36 - h) / 6 : 1;
    g.fillStyle = AC.leaf[k % 4];
    if (flat) {
      g.fillRect(px - 1, py, 3, 1); g.fillRect(px, py - 1, 1, 2);
      g.fillStyle = AC.leafDk; g.fillRect(px, py + 1, 1, 1);
    } else {
      g.fillRect(px, py, 2, 1);
    }
  }
  g.globalAlpha = 1;
  // Two oni-fires circling at the waist: crimson tongues with a hot heart, flickering.
  for (let k = 0; k < 2; k++) {
    const a = t * 1.3 + k * Math.PI, s = Math.sin(a);
    if ((s < 0) !== back) continue;
    const px = Math.round(x + Math.cos(a) * 18), py = Math.round(y - 15 + s * 3 + Math.sin(t * 3 + k * 2) * 1.5);
    const fl = Math.floor(t * 10 + k * 3) % 3;
    g.globalAlpha = back ? 0.75 : 0.95;
    g.fillStyle = AC.fire; g.fillRect(px - 1, py - 1, 3, 3); g.fillRect(px - (fl === 1 ? 1 : 0), py - 3 - (fl === 2 ? 1 : 0), 1, 2);
    g.fillStyle = AC.fireMid; g.fillRect(px, py - 1, 1, 2); g.fillRect(px + (fl === 0 ? 1 : 0), py - 2, 1, 1);
    g.fillStyle = AC.fireHot; g.fillRect(px, py, 1, 1);
  }
  g.globalAlpha = 1;
}

export const ONI: Record<string, SkinArt> = {
  'halberd.oni': { weapon: naginata, ...FX },
  'parrying_dagger.oni': { weapon: kaiken, ...FX },
  'ward_stone.oni': omamoriSkin,
  'dread_helm.oni': oniKabuto(),
  'juggernaut_plate.oni': oYoroi(),
  'warlord_faulds.oni': kusazuri(),
  'iron_greaves.oni': suneate(),
};
