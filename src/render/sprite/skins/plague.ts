import { ring, type Layer } from '../../auraKit';
import { css } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import type { BodySpec } from '../body';
import { chainLine, fillAll, hangAt, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { mats, wrap } from './kit';

/**
 * Epic set: Plague Doctor. A physician of the pestilence years: a waxed black
 * coat and wide-brimmed hat, a long beaked mask of oiled brown leather with
 * green glass eyes, brass fittings everywhere, and glass vials of something
 * sickly green that glows. A censer trails miasma, a syringe crossbow fires
 * the cure (or the disease), and the rats come out where the fog creeps.
 */

/** Waxed black leather and cloth, a faint green-grey cast in the light. */
const WAX = [0x0c0e0e, 0x1a1f1e, 0x2c3331, 0x46514d, 0x76847c];
/** Oiled brown leather: the beak, the gloves, the breeches. */
const BROWN = [0x180c08, 0x2c1810, 0x46281a, 0x663c26, 0x8e5838];
/** Pale waxed linen-leather: the beaked mask. */
const BEAK = [0x4a3826, 0x7a6244, 0xac946c, 0xd0bc90, 0xeee0bc];
/** Polished brass. */
const BRASS = [0x3a2208, 0x6a4214, 0xa47228, 0xd8a848, 0xfff0b0];
/** Brass gone green at the seams. */
const VERDI = [0x1a2416, 0x30402a, 0x56663c, 0x88905a, 0xc8c890];
/** The sickly green draught, lit from within (glow materials show the fourth tone). */
const SICK = [0x162a06, 0x2e5a0e, 0x5e9a1c, 0xa8e03a, 0xeeffb0];
const PALE = 0xd8ff8a, DEEP = 0x4a7a2a, HOT = 0xf4ffd0;
/** Thick old glass, greenish. */
const GLASS = [0x26342e, 0x44584e, 0x6e887a, 0xa8c4b4, 0xeefff6];
/** Miasma: murky green-grey vapour (never self-lit). */
const MIASMA = [0x1e2818, 0x34442a, 0x526640, 0x728a56, 0x8eaa6c];
/** Ebony haft. */
const EBONY = [0x0e0a08, 0x1c1612, 0x2c241e, 0x42382e, 0x6a5a48];
/** Needle steel. */
const STEEL = [0x343a42, 0x646e7a, 0xa2acb8, 0xd8e0e8, 0xffffff];
/** Parchment label and a red wax seal. */
const PARCH = [0x5a4a30, 0x8a7650, 0xbca878, 0xdccc9e, 0xf4ecc8];
const SEAL = [0x3a0606, 0x6a0e0e, 0x9a1a16, 0xc8302a, 0xf07060];
/** The leech: slick black-green. */
const LEECH = [0x0a0c08, 0x1a2014, 0x2c3822, 0x485a34, 0x7a8e58];

/** Creases in waxed leather (never brighter: the sheen is the ramp's light tone). */
const crease: Tex = (x, y) => (Math.sin(x * 0.7 + Math.sin(y * 0.45) * 1.2) > 0.86 || hash(Math.floor(x), Math.floor(y) + 5) < 0.04 ? -1 : 0);
/** A brass gleam sliding along, one step per frame. */
const gleam = (period = 7): Tex => (x, y, ph) => (wrap(x + y * 0.5 - ph * 2, period) < 1 ? 1 : 0);
/** Bubbles rising through the draught. */
const bubbles: Tex = (x, y, ph) => (hash(Math.floor(x * 0.9), Math.floor(y * 0.9 - ph)) < 0.07 ? 1 : 0);
/** A slow pulse: the draught breathes. */
const pulse: Tex = (_x, _y, ph) => [0, 1, 0, -1][ph % 4];
/** Wrapped leather grip. */
const wrapTex: Tex = (x) => (wrap(x, 1.3) < 0.4 ? -1 : 0);
/** Ebony grain. */
const grainTex: Tex = (x, y) => (Math.sin(y * 3.1 + Math.sin(x * 0.4) * 1.3) > 0.8 ? -1 : 0);
/** Stitched seams: a dashed dark line every few units. */
const seams: Tex = (x, y) => (wrap(y, 5.5) < 0.45 && wrap(x, 1.2) < 0.6 ? -1 : crease(x, y, 0));

const wax = (tex: Tex | undefined = crease): MaterialSpec => ({ base: WAX[2], ramp: WAX, tex });
const beakM = (tex: Tex | undefined = crease): MaterialSpec => ({ base: BEAK[2], ramp: BEAK, tex });
const brown = (tex: Tex | undefined = crease): MaterialSpec => ({ base: BROWN[2], ramp: BROWN, tex });
const brass = (tex: Tex | undefined = gleam()): MaterialSpec => ({ base: BRASS[2], ramp: BRASS, shiny: true, tex });
const verdi = (): MaterialSpec => ({ base: VERDI[2], ramp: VERDI, shiny: true });
const sick = (tex: Tex | undefined = bubbles): MaterialSpec => ({ base: SICK[3], ramp: SICK, glow: true, tex });
const glass = (): MaterialSpec => ({ base: GLASS[2], ramp: GLASS, shiny: true, step: 0.16 });
const miasma = (): MaterialSpec => ({ base: MIASMA[2], ramp: MIASMA });
const hot = (): MaterialSpec => ({ base: HOT, glow: true });

/** Wielded and worn pieces: drifting green spores, and the swing trail. */
const FX: Pick<SkinArt, 'fx' | 'trail'> = {
  fx: { spark: PALE, spark2: DEEP, kind: 'flake' },
  trail: [0xc8f080, 0x5a7a3a],
};

/** Particles the full set sheds in battle. */
export const PLAGUE_FX: SkinFx = { spark: PALE, spark2: DEEP, kind: 'flake' };

/** A frame at (x, y) of F whose +x points straight up the screen (smoke rises whatever the angle). */
const rising = (F: Xf, x: number, y: number) => new Xf(F.x(x, y), F.y(x, y), Math.PI / 2, Math.abs(F.sy), Math.abs(F.sy));

/**
 * A wisp of miasma curling up from (0, 0) of an upright frame U: three puffs
 * that climb and drift one step per frame, the top one thinning away.
 */
function wisp(r: Raster, U: Xf, ph: number, mat: number, g: number, size = 1, start = 0.6): void {
  for (let k = 0; k < 3; k++) {
    const u = k + ph / 4;
    const x = start + u * 1.9 * size, y = Math.sin(u * 1.7 + 0.6) * 1.1 * size;
    const rad = (1.25 - u * 0.28) * size;
    if (rad < 0.45) continue;
    r.fill(U.circ(x, y, rad), mat, { group: g, bevel: rad, softLight: true, toneBias: k === 2 ? -1 : 0 });
  }
}

/** A small corked glass vial standing upright in frame F at (x, y), `h` tall: glass, the green draught and the cork. */
function vial(r: Raster, F: Xf, x: number, y: number, h: number, w: number, glassM: number, liquid: number, cork: number, g: number, fill = 0.65): void {
  r.fill(F.cap(x, y - h * 0.5 + w, x, y + h * 0.5 - w * 0.6, w), glassM, { group: g, bevel: w });
  r.fill(intersect(F.cap(x, y - h * 0.5 + w, x, y + h * 0.5 - w * 0.6, w * 0.7), F.rect(x, y - h * 0.5, w * 2, h * fill)), liquid, { group: g, noLine: true });
  r.fill(F.rect(x, y + h * 0.5 - w * 0.2, w * 0.6, w * 0.5), cork, { group: g, bevel: 0.4, noLine: true });
}

// -----------------------------------------------------------------------------
// Miasma Censer
// -----------------------------------------------------------------------------

function miasmaCenser(): WeaponArt {
  // An ebony haft ending in a pierced brass censer, flanged like the mace it is, its vents glowing green
  // with whatever smoulders inside; miasma curls up out of it, and a corked vial swings from the collar.
  const C = 17.4, R = 3.3;
  return {
    tip: 22,
    mats: {
      haft: material({ base: EBONY[2], ramp: EBONY, tex: grainTex }), wrap: material(brown(wrapTex)),
      brass: material(brass()), verdi: material(verdi()), dark: material({ base: WAX[1], ramp: WAX }),
      vent: material(sick(pulse)), hot: material(hot()), smoke: material(miasma()),
      glass: material(glass()), liquid: material(sick()), cork: material(brown(undefined)),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // The haft, a brown leather grip and a brass pommel knob.
      fillAll(r, [t.cap(-4.6, 0, 13.8, 0, 1.15, 1)], m('haft'), o, 1);
      fillAll(r, [t.cap(-3.8, 0, 0.3, 0, 1.25)], m('wrap'), o, 1);
      fillAll(r, [union(t.circ(-5.3, 0, 1.4), t.poly([-6.4, -0.55, -7.6, 0, -6.4, 0.55]))], m('brass'), o, 1);
      fillAll(r, [t.rect(0.9, 0, 0.45, 1.4), t.rect(7, 0, 0.4, 1.25)], m('brass'), o, 0.6);
      // The vial on its little chain, hanging from the collar whatever way the censer points.
      const sw = [0, 0.5, 0.8, 0.3][ph];
      const ax = t.x(13.2, -1), ay = t.y(13.2, -1);
      const V = hangAt(t, 13.2, -1);
      const vx = 3.4, vy = sw;
      chainLine(r, ax, ay, V.x(vx * 0.5, vy * 0.4 + 0.3), V.y(vx * 0.5, vy * 0.4 + 0.3), V.x(vx - 0.9, vy), V.y(vx - 0.9, vy), m('brass'), g);
      const VV = new Xf(V.x(vx + 1.4, vy), V.y(vx + 1.4, vy), Math.PI / 2, Math.abs(t.sy), Math.abs(t.sy));
      vial(r, VV, 0, 0, 3.4, 0.85, m('glass'), m('liquid'), m('cork'), g + 2, 0.7);
      // The collar: a flared brass socket.
      fillAll(r, [t.poly([12.6, -1.15, 14.6, -2.2, 14.8, 2.2, 12.6, 1.15])], m('brass'), o, 0.8);
      // Flanges, the far one darker, sweeping round the globe.
      for (const s of [-1, 1]) {
        fillAll(r, [t.poly([14.2, s * 1.5, 15.6, s * (R + 1.4), 18.4, s * (R + 1.6), 20.4, s * (R + 0.4), 20.6, s * 1.4])], m('verdi'), o, 0.8, s < 0 ? -1 : 0);
      }
      // The pierced globe: bowl and lid, a seam between them.
      fillAll(r, [t.circ(C, 0, R)], m('brass'), o, 2.2);
      r.fill(intersect(t.circ(C, 0, R), t.rect(C + 0.7, 0, 0.32, R)), m('verdi'), { group: g, flat: 1, noLine: true });
      // Lancet vents glowing green, the light breathing.
      const vents: [number, number, number, number][] = [[C - 1.4, 0, 0.6, 1.25], [C - 1.1, 1.9, 0.42, 0.75], [C - 1.1, -1.9, 0.42, 0.75], [C + 1.9, 0.9, 0.42, 0.6], [C + 1.9, -0.9, 0.42, 0.6]];
      for (const [x, y, rx, ry] of vents) r.fill(t.ell(x, y, rx, ry), m('vent'), { group: g, noLine: true });
      r.dot(t.x(C - 1.4, 0.3), t.y(C - 1.4, 0.3), m('hot'), ph % 2 ? 3 : 4, g);
      // Miasma rising off the censer, wherever up is.
      wisp(r, rising(t, C, 0), ph, m('smoke'), g + 1, 0.75, R + 0.2);
      // The domed cap and a finial spike, a ring at its tip for the chain it was once hung from.
      fillAll(r, [union(t.ell(C + R + 0.1, 0, 1, 1.9), t.poly([C + R + 0.6, -0.7, 22.3, 0, C + R + 0.6, 0.7]))], m('brass'), o, 0.8);
      fillAll(r, [subtract(t.circ(21.2, 0, 0.95), t.circ(21.2, 0, 0.4))], m('brass'), o, 0.5);
    },
  };
}

// -----------------------------------------------------------------------------
// Syringe Crossbow
// -----------------------------------------------------------------------------

function syringeCrossbow(): WeaponArt {
  // A waxed black crossbow with brass furniture, a great glass syringe of green draught riding on top
  // that feeds the bolt channel, a gut string, and a hollow needle for a bolt.
  return {
    tip: 9.2,
    mats: {
      stock: material(wax()), brass: material(brass()), prod: material(brass(gleam(6))), verdi: material(verdi()),
      glass: material(glass()), liquid: material(sick()), plunger: material({ base: WAX[1], ramp: WAX }),
      string: material({ base: 0xd8ccb0 }), needle: material({ base: STEEL[2], ramp: STEEL, shiny: true }),
      hot: material(hot()), mark: material({ base: WAX[0], ramp: WAX }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // The stock.
      fillAll(r, [t.poly([-2.4, -1.5, 9, -1.1, 9.4, 0, 9, 1.1, 1, 1.4, -1, 3.8, -3, 3.6, -1.8, 0.6])], m('stock'), o, 1.4);
      fillAll(r, [t.rect(7.6, 0, 0.45, 1.3), t.rect(-1.6, 2.1, 0.35, 1.2)], m('brass'), o, 0.5);
      // The syringe riding on top: plunger and thumb ring behind, the glass barrel, a brass nozzle bent down to the channel.
      const y = 3.1;
      fillAll(r, [t.cap(-4, y, -0.6, y, 0.38)], m('brass'), o, 0.4);
      fillAll(r, [subtract(t.circ(-4.6, y, 0.9), t.circ(-4.6, y, 0.4))], m('brass'), o, 0.5);
      const barrel = t.cap(-0.4, y, 5.4, y, 1.25);
      fillAll(r, [barrel], m('glass'), o, 1);
      const level = [0, 0.15, 0.3, 0.15][ph];
      r.fill(intersect(t.cap(-0.4, y, 5.4, y, 0.85), t.rect(3.6 + level, y, 2.6, 2)), m('liquid'), { group: g, noLine: true });
      r.fill(t.rect(0.9 + level, y, 0.3, 0.9), m('plunger'), { group: g, noLine: true });
      for (const x of [2, 3, 4]) r.dot(t.x(x, y + 0.75), t.y(x, y + 0.75), m('mark'), 1, g);
      r.dot(t.x(4.6, y - 0.4), t.y(4.6, y - 0.4), m('hot'), ph % 2 ? 3 : 4, g);
      fillAll(r, [t.rect(-0.6, y, 0.3, 1.8), t.rect(5.4, y, 0.4, 1.35)], m('brass'), o, 0.5);
      fillAll(r, [union(t.cap(5.8, y, 6.8, y, 0.4), t.cap(6.8, y, 7.2, 1.1, 0.35))], m('verdi'), o, 0.4);
      // The prod, brass, its tips curling back like a doctor's hooks.
      fillAll(r, [t.poly([6.6, -0.5, 4.5, 5.2, 5.8, 5.6, 8, 0, 5.8, -5.6, 4.5, -5.2])], m('prod'), o, 1);
      for (const s of [-1, 1]) r.fill(t.circ(4.6, s * 5.6, 0.6), m('verdi'), { group: g, bevel: 0.5 });
      const pull = o.pull ?? 1;
      const sx = 5 - pull * 3.5;
      r.line(t.x(4.8, 5), t.y(4.8, 5), t.x(sx, 0), t.y(sx, 0), m('string'), 3, 9);
      r.line(t.x(sx, 0), t.y(sx, 0), t.x(4.8, -5), t.y(4.8, -5), m('string'), 3, 9);
      if (pull > 0.5) {
        // A loaded needle, a bead of green at its point.
        r.line(t.x(sx, 0.3), t.y(sx, 0.3), t.x(10.4, 0.3), t.y(10.4, 0.3), m('needle'), 3, 9);
        r.dot(t.x(sx + 0.6, 0.3), t.y(sx + 0.6, 0.3), m('liquid'), 3, 9);
        r.dot(t.x(10.8, 0.3), t.y(10.8, 0.3), m('liquid'), ph % 2 ? 3 : 4, 9);
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Battle sprites
// -----------------------------------------------------------------------------

const PM = mats({
  glass: glass(),
  liquid: sick(),
  hot: hot(),
  brass: brass(undefined),
  plunger: { base: WAX[2], ramp: WAX },
  needle: { base: STEEL[2], ramp: STEEL, shiny: true },
  mark: { base: WAX[0], ramp: WAX },
  leech: { base: LEECH[2], ramp: LEECH, shiny: true },
  parch: { base: PARCH[2], ramp: PARCH },
  seal: { base: SEAL[2], ramp: SEAL, shiny: true },
  smoke: miasma(),
});

const syringeBolt: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A flying glass syringe: thumb disc and plunger behind, green draught in the barrel sloshing forward,
    // a brass collar and a long needle, drops of green spun off behind it.
    const w = [0, 0.4, 0, -0.4][f];
    for (let k = 0; k < 3; k++) {
      const x = -12.4 - k * 2.2 - (f % 2) * 0.8, y = (k % 2 ? 0.7 : -0.6) + w * 0.5;
      r.dot(t.x(x, y), t.y(x, y), h(PM.liquid), k === 0 ? 3 : 2, 1);
    }
    r.fill(t.cap(-10.6, 0, -6, 0, 0.5), h(PM.brass), { group: 1, bevel: 0.4, lightBias: 0.3 });
    r.fill(subtract(t.circ(-11.4, 0, 1.4), t.circ(-11.4, 0, 0.6)), h(PM.brass), { group: 1, bevel: 0.5, lightBias: 0.3 });
    r.fill(t.rect(-6.1, 0, 0.35, 2.3), h(PM.brass), { group: 2, bevel: 0.4 });
    const barrel = t.cap(-5.8, 0, 1, 0, 1.45);
    r.fill(barrel, h(PM.glass), { group: 2, bevel: 1.2 });
    const slosh = [0, 0.3, 0.5, 0.2][f];
    r.fill(intersect(t.cap(-5.8, 0, 1, 0, 1), t.rect(-1.6 + slosh, 0, 2.8, 1.5)), h(PM.liquid), { group: 2, noLine: true });
    r.fill(t.rect(-4.6 + slosh, 0, 0.35, 1), h(PM.plunger), { group: 2, noLine: true });
    for (const x of [-3, -1.5]) r.dot(t.x(x, 0.6), t.y(x, 0.6), h(PM.mark), 2, 2);
    r.dot(t.x(-0.6, -0.5), t.y(-0.6, -0.5), h(PM.hot), 4, 2);
    r.fill(t.rect(1.2, 0, 0.5, 1.1), h(PM.brass), { group: 3, bevel: 0.5 });
    r.fill(t.poly([1.6, -0.55, 2.8, -0.3, 2.8, 0.3, 1.6, 0.55]), h(PM.brass), { group: 3, bevel: 0.4 });
    r.line(t.x(2.8, 0), t.y(2.8, 0), t.x(8.6, 0), t.y(8.6, 0), h(PM.needle), 3, 4);
    r.dot(t.x(9, 0), t.y(9, 0), h(PM.liquid), f % 2 ? 3 : 4, 4);
  },
};

// -----------------------------------------------------------------------------
// Leech Jar
// -----------------------------------------------------------------------------

interface JarMats { glass: number; liquid: number; hot: number; brass: number; leech: number; parch: number; seal: number; mark: number }

/**
 * A glass jar upright at frame F's origin (about 7 wide, 13 tall, the base at y -6.4): the green draught,
 * a leech writhing in it (`f` of 4), bubbles rising, a parchment label sealed in red wax, a brass lid
 * and a wire bail. `label` is left off at small sizes.
 */
function leechJar(r: Raster, F: Xf, f: number, M: JarMats, label = true): void {
  const body = F.rect(0, -1.2, 3.6, 5.2, 1.6);
  const neck = F.rect(0, 4.4, 2.7, 0.9, 0.4);
  // Glass behind, the draught filling it, then the leech and bubbles inside.
  r.fill(union(body, neck), M.glass, { group: 1, bevel: 1.6, toneBias: -1 });
  const inner = F.rect(0, -1.2, 3, 4.6, 1.2);
  const lvl = [2.2, 2.4, 2.2, 2][f];
  r.fill(intersect(inner, F.rect(0, -6, 4, lvl + 6)), M.liquid, { group: 1, noLine: true });
  // The surface: a lighter line.
  r.line(F.x(-2.8, lvl), F.y(-2.8, lvl), F.x(2.8, lvl), F.y(2.8, lvl), M.hot, 3, 1);
  // The leech: a fat S of segments that curls and uncurls, its sucker mouth pressed to the glass.
  const k = [0, 1, 0.4, -0.6][f];
  const pts: [number, number, number][] = [
    [-1.6 + k * 0.3, -4.6, 0.6], [0.6, -4 + k * 0.2, 0.85], [1.4 - k * 0.3, -2.2, 1], [-0.2, -0.9 + k * 0.3, 1], [-1.4 + k * 0.4, 0.6, 0.85], [-0.6 + k * 0.6, 1.8 - k * 0.2, 0.6],
  ];
  const segs: Shape[] = [];
  for (let i = 1; i < pts.length; i++) segs.push(F.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i - 1][2], pts[i][2]));
  r.fill(union(...segs), M.leech, { group: 2, bevel: 0.9 });
  for (let i = 1; i < pts.length - 1; i++) r.dot(F.x(pts[i][0] + 0.3, pts[i][1] + 0.4), F.y(pts[i][0] + 0.3, pts[i][1] + 0.4), M.leech, 4, 2);
  r.dot(F.x(pts[5][0], pts[5][1] + 0.4), F.y(pts[5][0], pts[5][1] + 0.4), M.seal, 2, 2);
  // Bubbles climbing to the surface.
  for (const [bx, by] of [[1.9, -5 + f * 1.6], [-2, -3 + ((f + 2) % 4) * 1.4]]) {
    if (by < lvl - 0.4) r.dot(F.x(bx, by), F.y(bx, by), M.hot, 4, 1);
  }
  // A highlight streaking down the glass.
  r.line(F.x(-2.7, 3.2), F.y(-2.7, 3.2), F.x(-2.7, -3.6), F.y(-2.7, -3.6), M.glass, 4, 3);
  // The label, tied on, an inked scrawl and a red wax seal.
  if (label) {
    r.fill(F.rect(0.6, -3.6, 1.9, 1.3, 0.2), M.parch, { group: 3, bevel: 0.6 });
    r.line(F.x(-0.8, -3.3), F.y(-0.8, -3.3), F.x(1.6, -3.3), F.y(1.6, -3.3), M.mark, 1, 3);
    r.line(F.x(-0.8, -4.1), F.y(-0.8, -4.1), F.x(0.8, -4.1), F.y(0.8, -4.1), M.mark, 1, 3);
    r.fill(F.circ(2.4, -4.6, 0.85), M.seal, { group: 3, bevel: 0.6 });
  }
  // The brass screw lid, ridged, and the wire bail arching over it.
  r.fill(F.rect(0, 5.8, 3.2, 0.95, 0.3), M.brass, { group: 4, bevel: 0.8, lightBias: 0.25 });
  if (label) for (const x of [-2, -0.7, 0.6, 1.9]) r.line(F.x(x, 5.2), F.y(x, 5.2), F.x(x, 6.4), F.y(x, 6.4), M.brass, 1, 4);
  r.fill(intersect(subtract(F.ell(0, 6.6, 3.4, 3), F.ell(0, 6.6, 2.8, 2.4)), F.rect(0, 8.6, 4, 2)), M.brass, { group: 4, bevel: 0.4 });
  r.fill(F.circ(0, 9.4, 0.6), M.brass, { group: 4, bevel: 0.4 });
}

const jarCore: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    leechJar(r, new Xf(t.ox, t.oy, 0, 0.82, 0.82), f, {
      glass: h(PM.glass), liquid: h(PM.liquid), hot: h(PM.hot), brass: h(PM.brass), leech: h(PM.leech),
      parch: h(PM.parch), seal: h(PM.seal), mark: h(PM.mark),
    }, false);
  },
};

const leechJarSkin: SkinArt = {
  mats: {
    // Stock names: the fang worn on the chest becomes a tiny vial of the draught on a brass cap.
    fangTooth: { base: SICK[3], ramp: SICK, glow: true },
    fangBlood: { base: BRASS[2], ramp: BRASS, shiny: true },
    'k.glass': glass(), 'k.liquid': sick(), 'k.hot': hot(), 'k.brass': brass(undefined),
    'k.leech': { base: LEECH[2], ramp: LEECH, shiny: true }, 'k.parch': { base: PARCH[2], ramp: PARCH },
    'k.seal': { base: SEAL[2], ramp: SEAL, shiny: true }, 'k.mark': { base: WAX[0], ramp: WAX },
    'k.smoke': miasma(),
  },
  glow: [PALE, DEEP],
  icon(r, t, m) {
    // The leech jar, big, a wisp of miasma curling off its lid.
    wisp(r, new Xf(t.x(1.2, 9.6), t.y(1.2, 9.6), Math.PI / 2 - 0.3), 1, m('k.smoke'), 5, 1.2);
    leechJar(r, new Xf(t.x(0, -0.6), t.y(0, -0.6), 0, 1.45, 1.45), 1, {
      glass: m('k.glass'), liquid: m('k.liquid'), hot: m('k.hot'), brass: m('k.brass'), leech: m('k.leech'),
      parch: m('k.parch'), seal: m('k.seal'), mark: m('k.mark'),
    });
  },
  proj: { core: jarCore },
};

// -----------------------------------------------------------------------------
// Beaked Mask
// -----------------------------------------------------------------------------

function beakedMask(): SkinArt {
  // The plague doctor: a hood of waxed black leather under a wide-brimmed hat with a brass buckle, the face
  // hidden behind a mask of oiled brown leather whose long beak is banded and riveted in brass, two round
  // green glass eyes in brass rims, and a breath of herb smoke drifting from the nostrils.
  return {
    head: () => ({
      mats: {
        'h.hood': material(wax()), 'h.hat': material(wax(undefined)), 'h.band': material({ base: WAX[1], ramp: WAX }),
        'h.beak': material(beakM(seams)), 'h.mask': material(beakM()),
        'h.brass': material(brass()), 'h.lens': material(sick(pulse)), 'h.hot': material(hot()),
        'h.pit': material({ base: BROWN[0], ramp: [0x080402, 0x0e0806, BROWN[0], BROWN[1], BROWN[2]] }),
        'h.smoke': material(miasma()),
      },
      draw(r, H, m, g, sway) {
        const s = sway * 1.6, ph = r.phase % 4;
        // The hood, over the head and falling to the shoulders, swaying behind.
        const hood = union(
          H.ell(-0.8, 1.2, 7.4, 7.2),
          H.poly([-6.8, 2, -8.4 - s, -4.6, -9 - s * 1.2, -8.2, -4.4, -8.6, 1.4, -7.6, 3.6, -5]),
        );
        r.fill(hood, m('h.hood'), { group: g, bevel: 3, softLight: true, local: H });
        // The mask over the face: brown leather from brow to chin.
        const mask = H.poly([0.8, 4.6, 5.4, 4.6, 7.4, 2.8, 7.8, -1.4, 6.6, -5, 3, -6.2, 0.6, -4.4]);
        r.fill(mask, m('h.mask'), { group: 70, bevel: 1.6, local: H });
        // Stitching where mask meets hood.
        r.line(H.x(1.4, 4), H.y(1.4, 4), H.x(1, -4), H.y(1, -4), m('h.pit'), 1, 70);
        // The beak: long, curving down to a blunt hook, a seam along its ridge.
        const beak = H.poly([5.6, 2.2, 9, 1.2, 12.6, -0.8, 15.2, -3.2, 16.6, -5.8, 15.6, -5.6, 13, -4.2, 9.4, -3.6, 6.4, -4]);
        r.fill(beak, m('h.beak'), { group: 71, bevel: 1.4, local: H });
        r.line(H.x(6.4, 1.4), H.y(6.4, 1.4), H.x(15.2, -4), H.y(15.2, -4), m('h.pit'), 1, 71);
        // Brass bands round the beak, riveted.
        for (const [x, y0, y1] of [[8.6, 1.3, -3.7], [12, -0.6, -3.9]] as const) {
          r.fill(intersect(beak, H.poly([x - 0.45, y0 + 1, x + 0.45, y0 + 1, x + 0.85, y1 - 1, x - 0.05, y1 - 1])), m('h.brass'), { group: 71, bevel: 0.5, noLine: true });
          r.dot(H.x(x + 0.2, (y0 + y1) / 2), H.y(x + 0.2, (y0 + y1) / 2), m('h.brass'), 4, 71);
        }
        // Breathing holes near the tip.
        r.dot(H.x(14.4, -3.6), H.y(14.4, -3.6), m('h.pit'), 0, 71);
        r.dot(H.x(13.6, -3), H.y(13.6, -3), m('h.pit'), 0, 71);
        // The eyes: round green lenses in brass rims, the far one narrow at the profile.
        r.fill(subtract(H.circ(3.4, 1.2, 1.95), H.circ(3.4, 1.2, 1.15)), m('h.brass'), { group: 72, bevel: 0.7 });
        r.fill(H.circ(3.4, 1.2, 1.2), m('h.lens'), { group: 72, noLine: true });
        r.dot(H.x(3, 1.6), H.y(3, 1.6), m('h.hot'), ph === 1 ? 4 : 3, 72);
        r.fill(H.ell(6.6, 1.2, 0.85, 1.5), m('h.brass'), { group: 73, bevel: 0.5 });
        r.fill(H.ell(6.7, 1.2, 0.45, 1), m('h.lens'), { group: 73, noLine: true });
        // A strap from the mask back round the hood, with a buckle.
        r.line(H.x(0.6, 1.6), H.y(0.6, 1.6), H.x(-6.4, 2.4), H.y(-6.4, 2.4), m('h.band'), 1, 74);
        r.fill(H.rect(-3, 2, 0.5, 0.45), m('h.brass'), { group: 74, bevel: 0.4 });
        // Herb smoke breathing from the nostrils, curling up past the beak.
        wisp(r, new Xf(H.x(14.8, -2.8), H.y(14.8, -2.8), H.ang + Math.PI / 2 - 0.4, Math.abs(H.sx) * 0.6, Math.abs(H.sy) * 0.6), ph, m('h.smoke'), 75, 1);
        // The hat: a wide brim, a tall flat-topped crown, a band with a brass buckle at the front.
        const brimY = 5.6;
        r.fill(H.poly([-3.8, brimY + 0.8, -4.2, 12.6, 0.4, 13.2, 4.6, 12.6, 4.8, brimY + 0.8]), m('h.hat'), { group: 76, bevel: 1.6, local: H });
        r.fill(intersect(H.poly([-3.8, brimY + 0.8, -4.2, 12.6, 0.4, 13.2, 4.6, 12.6, 4.8, brimY + 0.8]), H.rect(0, brimY + 1.8, 6, 0.85)), m('h.band'), { group: 76, flat: 1, noLine: true });
        r.fill(subtract(H.rect(3.6, brimY + 1.8, 0.85, 0.85), H.rect(3.6, brimY + 1.8, 0.35, 0.35)), m('h.brass'), { group: 76, bevel: 0.4, noLine: true });
        r.fill(H.ell(0.4, brimY + 0.2, 11, 1.25, 0.04), m('h.hat'), { group: 77, bevel: 1, local: H });
        r.fill(intersect(H.ell(0.4, brimY + 0.2, 11, 1.25, 0.04), H.rect(0.4, brimY - 0.9, 12, 0.5)), m('h.band'), { group: 77, flat: 0, noLine: true });
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Waxed Physician's Coat
// -----------------------------------------------------------------------------

/** The torso's main volumes (as drawn by the figure), for clipping straps to it. */
function torsoBody(T: Xf, b: BodySpec, top: number): Shape {
  return union(
    T.ell(0.3, 0.6, b.hipW, 3.6),
    T.ell(0.5, top * 0.46, b.waistW, top * 0.28),
    T.ell(b.chestPush * 0.7, top - 3.4, b.chestW, 5.4),
  );
}

function physicianCoat(): SkinArt {
  // A long waxed black coat: a shoulder cape, a high collar to the chin, long tails behind the legs and front
  // flaps over the thighs, brass buttons down the front, a bandolier of green vials, brown gloves.
  return {
    mats: {
      'k.coat': wax(), 'k.tail': wax(), 'k.cape': wax(undefined),
      'k.glove': brown(undefined), 'k.belt': brown(undefined),
      'k.brass': brass(), 'k.strap': { base: BROWN[2], ramp: BROWN }, 'k.trim': brown(undefined),
      'k.glass': glass(), 'k.vial': sick(pulse), 'k.cork': brown(undefined), 'k.hot': hot(),
    },
    chest: {
      torso: 'k.coat', sleeve: 'k.coat', sleeveLen: 1, forearm: 'k.coat', hands: 'k.glove', pauldron: null,
      trim: null, belt: 'k.belt', cape: null, hood: null, spikes: null, noScarf: true,
      back(r, T, m, c) {
        const b = c.body, top = c.top, s = c.sway * 3, ph = r.phase % 4;
        const len = (b.thigh + b.shin) * 0.8, fl = [0, 0.4, 0.7, 0.3][ph];
        // The long tails behind the legs, split at the back vent, trailing the motion.
        r.fill(T.poly([0.6, 3, -b.hipW - 0.6, 3.4, -b.hipW - 3 - s * 1.2, -len * 0.6, -b.hipW - 3.6 - s * 1.6, -len + fl * 0.4, -b.hipW + 0.4 - s * 1.3, -len - 0.4 + fl * 0.3, -1 - s, -len * 0.55]), m('k.tail'), { group: c.g, bevel: 2.4, toneBias: -1, softLight: true, local: T });
        r.fill(T.poly([1, 2, -1.2, 2, -0.8 - s * 1.1, -len * 0.7 + fl * 0.2, 1.6 - s * 0.8, -len * 0.8 + fl * 0.3, 2.4 - s * 0.6, -len * 0.4]), m('k.tail'), { group: c.g + 30, bevel: 1.8, toneBias: -1, softLight: true, local: T });
        // The shoulder cape falling down the back.
        r.fill(T.poly([-0.4, top + 1.4, -4.6, top + 1, -8 - s * 0.6, top - 2.6, -8.8 - s * 0.9, top - 7.2, -5, top - 6.4, -1.4, top - 5]), m('k.cape'), { group: c.g + 31, bevel: 2, softLight: true });
      },
      shoulder(r, S, m, c) {
        // The shoulder cape over the arm, its edge lying in a soft fold, a brass stud.
        const o = { group: c.g, toneBias: c.bias };
        r.fill(S.poly([-3.2, 2.2, 0, 3.2, 3.2, 2.2, 3.4, -1.8, 1.2, -2.6, -1.2, -2.6, -3.4, -1.8]), m('k.cape'), { ...o, bevel: 1.8, local: S });
        r.fill(intersect(S.poly([-3.2, 2.2, 0, 3.2, 3.2, 2.2, 3.4, -1.8, 1.2, -2.6, -1.2, -2.6, -3.4, -1.8]), S.rect(0, -2.2, 4, 0.6)), m('k.trim'), { ...o, flat: 2, noLine: true });
        r.dot(S.x(0.2, 1.4), S.y(0.2, 1.4), m('k.brass'), c.far ? 2 : 4, c.g);
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, fx = b.chestPush * 0.7, ph = r.phase % 4;
        const body = torsoBody(T, b, top);
        const sw = c.sway * 2.2, len = (b.thigh + b.shin) * 0.42;
        // Front flaps of the coat over the thighs.
        r.fill(T.poly([-b.hipW - 0.4, 2, b.hipW + 1.2, 2, b.hipW + 2 - sw, -len, b.hipW - 2.4 - sw, -len - 0.6, -b.hipW - 0.8 - sw * 0.6, -len + 0.4]), m('k.coat'), { group: 80, bevel: 2.2, softLight: true, local: T });
        const flap = T.poly([-b.hipW - 0.4, 2, b.hipW + 1.2, 2, b.hipW + 2 - sw, -len, b.hipW - 2.4 - sw, -len - 0.6, -b.hipW - 0.8 - sw * 0.6, -len + 0.4]);
        r.fill(intersect(flap, T.poly([-b.hipW - 3, -len + 0.9, b.hipW + 4, -len + 0.5 - sw * 0.1, b.hipW + 4, -len - 2, -b.hipW - 3, -len - 2])), m('k.trim'), { group: 80, flat: 2, noLine: true });
        r.line(T.x(b.hipW + 0.6, 1.6), T.y(b.hipW + 0.6, 1.6), T.x(b.hipW + 1.3 - sw, -len + 0.4), T.y(b.hipW + 1.3 - sw, -len + 0.4), m('k.strap'), 1, 80);
        // Brass buttons down the front edge.
        for (const [i, y] of [top - 2.6, top - 4.8, top - 7, top - 9.2].entries()) {
          const x = fx + b.chestW * 0.55 - i * 0.25;
          r.dot(T.x(x, y), T.y(x, y), m('k.brass'), 4, c.g);
        }
        // The belt's brass buckle.
        r.fill(subtract(T.rect(b.waistW - 0.2, 3, 0.8, 0.85), T.rect(b.waistW - 0.2, 3, 0.3, 0.35)), m('k.brass'), { group: 81, bevel: 0.4 });
        // A bandolier from the back shoulder to the front hip, three vials of the draught riding in it.
        const ax = -2.6, ay = top - 0.6, bx = b.waistW + 0.8, by = 5.4;
        r.fill(intersect(body, T.cap(ax, ay, bx, by, 0.7)), m('k.strap'), { group: 82, bevel: 0.6 });
        for (let i = 0; i < 3; i++) {
          const u = 0.32 + i * 0.22, x = ax + (bx - ax) * u, y = ay + (by - ay) * u;
          vial(r, T, x, y + 0.6, 3.4, 0.75, m('k.glass'), m('k.vial'), m('k.cork'), 83 + i, 0.6);
          if ((i + ph) % 4 === 0) r.dot(T.x(x - 0.2, y), T.y(x - 0.2, y), m('k.hot'), 3, 83 + i);
        }
        // The high collar, up to the chin, a brass clasp at the throat.
        r.fill(T.poly([-2.6, top - 0.2, -2.8, top + 2.6, 0.6, top + 3.2, 3.2, top + 2.2, 3, top - 0.4]), m('k.coat'), { group: 86, bevel: 1.4 });
        r.dot(T.x(2.4, top + 0.6), T.y(2.4, top + 0.6), m('k.brass'), 4, 86);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Physician's Breeches
// -----------------------------------------------------------------------------

function physicianBreeches(): SkinArt {
  // Oiled brown leather breeches with a stitched outer seam, black garters buckled in brass below the knee,
  // and on the near thigh a holster strap carrying a vial of the draught.
  return {
    mats: {
      legLeather: brown(seams), legLeatherDark: { base: WAX[2], ramp: WAX },
      'l.strap': { base: WAX[1], ramp: WAX }, 'l.brass': brass(),
      'l.glass': glass(), 'l.vial': sick(pulse), 'l.cork': brown(undefined), 'l.hot': hot(),
    },
    legs: {
      mat: 'legLeather', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.3,
      over(r, t, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, L = c.len, w = c.w;
        // The stitched outer seam.
        for (let x = 1.4; x < L; x += 1.3) r.dot(t.x(x, -w * 0.55), t.y(x, -w * 0.55), m('legLeatherDark'), 1, c.g);
        // The garter at the knee, buckled in brass.
        r.fill(t.cap(1.2, -w - 0.3, 1.2, w + 0.3, 0.75), m('l.strap'), { ...o, group: c.g + 20, bevel: 0.6 });
        r.fill(subtract(t.rect(1.2, w * 0.45, 0.7, 0.7), t.rect(1.2, w * 0.45, 0.25, 0.25)), m('l.brass'), { ...o, group: c.g + 20, bevel: 0.4 });
        if (c.far) return;
        // A holster strap round the thigh, a vial of the draught riding on its front.
        r.fill(t.cap(L * 0.58, -w - 0.2, L * 0.58, w + 0.2, 0.55), m('l.strap'), { ...o, group: c.g + 21, bevel: 0.5 });
        const V = new Xf(t.x(L * 0.58, w * 0.35), t.y(L * 0.58, w * 0.35), t.ang, Math.abs(t.sy), Math.abs(t.sy));
        vial(r, V, 0, 0, 3.4, 0.75, m('l.glass'), m('l.vial'), m('l.cork'), c.g + 22, 0.65);
        if (ph === 2) r.dot(V.x(-0.6, 0), V.y(-0.6, 0), m('l.hot'), 3, c.g + 22);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Physician's Boots
// -----------------------------------------------------------------------------

function physicianBoots(): SkinArt {
  // Tall waxed black boots with a wide folded cuff of brown leather, two straps buckled in brass, a brass
  // toe cap, and miasma curling round the heel.
  return {
    mats: {
      boot: wax(), bootDark: brown(undefined),
      'kb.strap': { base: BROWN[1], ramp: BROWN }, 'kb.brass': brass(), 'kb.smoke': miasma(), 'kb.vent': sick(pulse),
    },
    boots: {
      height: 0.86, bulk: 0.36, trim: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w, T = c.top;
        // The folded cuff, flaring.
        r.fill(shin.poly([T - 2.2, -w - 0.3, T + 0.6, -w - 1.1, T + 0.9, w + 1.1, T - 2.2, w + 0.4]), m('bootDark'), { ...o, bevel: 0.9, local: shin });
        // Two straps, buckled in brass on the outside.
        for (const x of [T * 0.3, T * 0.58]) {
          r.fill(shin.rect(x, 0, 0.42, w + 0.2), m('kb.strap'), { ...o, bevel: 0.5 });
          r.fill(subtract(shin.rect(x, w * 0.4, 0.65, 0.6), shin.rect(x, w * 0.4, 0.22, 0.2)), m('kb.brass'), { ...o, bevel: 0.4 });
        }
        // Brass toe cap and heel plate.
        r.fill(foot.poly([c.toe - 1.4, 1.2, c.toe + 0.8, 0.3, c.toe + 0.6, -0.9, c.toe - 1.4, -1.2]), m('kb.brass'), { ...o, bevel: 0.6 });
        r.fill(foot.rect(-1.2, -1.1, 0.9, 0.35), m('kb.brass'), { ...o, bevel: 0.3 });
        if (c.far) return;
        // Miasma curling round the heel.
        const back = new Xf(foot.ox, foot.oy, foot.ang, -foot.sx, foot.sy);
        const U = new Xf(back.x(1.6, -0.6), back.y(1.6, -0.6), Math.PI / 2 + (foot.sx > 0 ? 0.5 : -0.5), 0.8, 0.8);
        wisp(r, U, ph, m('kb.smoke'), c.g + 26, 1);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = {
  haze: css(0x8aaa3a), fog: css(0x5e7a3a), fogDk: css(0x34442a), fogHi: css(0xa8c86a),
  bub: css(0x9ad040), bubHi: css(0xf0ffc0),
  rat: css(0x2a2220), ratHi: css(0x52463c), tail: css(0xc8968a), eye: css(0xff5a3a),
  fly: css(0x0e100e), wing: css(0xd8e4d0),
};

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function plagueAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  if (layer === 'back') {
    // A sickly glow pooling on the ground, breathing.
    g.globalAlpha = 0.1 + Math.sin(t * 1.3) * 0.03;
    g.fillStyle = AC.haze;
    g.fillRect(x - 10, y - 2, 21, 1); g.fillRect(x - 15, y - 1, 31, 3); g.fillRect(x - 10, y + 2, 21, 1);
  }
  // Miasma creeping along the ground in low banks that drift and swell.
  ring(g, x, y, 16, 3.8, 18, layer, (g, px, py, i) => {
    const v = Math.sin(t * 1.1 + i * 1.3), dx = Math.round(Math.sin(t * 0.6 + i * 0.9) * 2);
    g.globalAlpha = 0.36 + v * 0.12;
    g.fillStyle = i % 3 ? AC.fog : AC.fogDk;
    const w = 4 + (i % 3) * 2;
    g.fillRect(px - (w >> 1) + dx, py - 1, w, 2);
    if (v > 0.35) {
      g.globalAlpha = 0.2;
      g.fillStyle = AC.fogHi;
      g.fillRect(px - (w >> 2) + dx, py - 2, w >> 1, 1);
    }
    // Now and then a tendril of it curls up and thins away.
    const c = (t * 0.4 + i * 0.29) % 1;
    if (i % 4 === 1 && c < 0.5) {
      const hh = Math.round(c * 10);
      g.globalAlpha = 0.32 * (1 - c * 2);
      g.fillStyle = AC.fogHi;
      g.fillRect(px + dx + Math.round(Math.sin(c * 9) * 1.2), py - 2 - hh, 1, 2);
    }
  });
  // Bubbles welling up out of the fog and popping.
  for (let k = 0; k < 4; k++) {
    const a = k * 1.7 + 0.4, s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const px = Math.round(x + Math.cos(a) * 12), py = Math.round(y + s * 2.8);
    const u = (t * 0.55 + k * 0.37) % 1;
    if (u < 0.8) {
      const h = Math.round((u / 0.8) * 6);
      g.globalAlpha = 0.85;
      g.fillStyle = AC.bub; g.fillRect(px, py - h - 1, 1, 2);
      g.fillStyle = AC.bubHi; g.fillRect(px, py - h - 1, 1, 1);
    } else {
      g.globalAlpha = (1 - u) * 4;
      g.fillStyle = AC.bub;
      g.fillRect(px - 1, py - 7, 1, 1); g.fillRect(px + 1, py - 7, 1, 1); g.fillRect(px, py - 8, 1, 1); g.fillRect(px, py - 6, 1, 1);
    }
  }
  g.globalAlpha = 1;
  // Two rats scurrying round through the fog, tails trailing, eyes catching the light.
  for (let k = 0; k < 2; k++) {
    const dir = k ? -1 : 1;
    const a = t * (0.9 + k * 0.25) * dir + k * 2.6, s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const px = Math.round(x + Math.cos(a) * (18 + k * 2)), py = Math.round(y + s * 4.2);
    const f = -Math.sin(a) * dir > 0 ? 1 : -1;
    const step = Math.floor(t * 12 + k) % 2;
    // Hunched body, a pointed head low in front, an ear, paws scrabbling.
    g.fillStyle = AC.rat; g.fillRect(px - 2, py - 2, 4, 2); g.fillRect(px - 1, py - 3, 2, 1);
    g.fillRect(px + 2 * f + (f < 0 ? 0 : 0), py - 1, 1, 1); g.fillRect(px + 3 * f, py - 1, 1, 1);
    g.fillStyle = AC.ratHi; g.fillRect(px - 1, py - 3, 2, 1); g.fillRect(px + f, py - 3, 1, 1);
    g.fillStyle = AC.eye; g.fillRect(px + 2 * f, py - 2, 1, 1);
    g.fillStyle = AC.rat; g.fillRect(px - 2 + step * 3, py, 1, 1); g.fillRect(px + 1 - step * 3, py, 1, 1);
    // The naked tail, whipping.
    g.fillStyle = AC.tail;
    const bx = f > 0 ? px - 3 : px + 2;
    g.fillRect(bx, py - 1, 1, 1); g.fillRect(bx - f, py - step, 1, 1); g.fillRect(bx - 2 * f, py - 1 + step, 1, 1);
  }
  // Flies buzzing over the miasma.
  for (let k = 0; k < 2; k++) {
    const c = Math.cos(t * 3.1 + k * 2);
    if ((c < 0) !== (layer === 'back')) continue;
    const px = Math.round(x + Math.sin(t * 6.3 + k * 3) * 8 + Math.sin(t * 2.2 + k) * 5);
    const py = Math.round(y - 7 - k * 6 + Math.sin(t * 10.7 + k) * 2);
    g.fillStyle = AC.fly; g.fillRect(px, py, 1, 1);
    if (Math.floor(t * 20 + k) % 2) { g.globalAlpha = 0.5; g.fillStyle = AC.wing; g.fillRect(px, py - 1, 1, 1); g.globalAlpha = 1; }
  }
}

export const PLAGUE: Record<string, SkinArt> = {
  'mace.plague': { weapon: miasmaCenser, ...FX },
  'hand_crossbow.plague': { weapon: syringeCrossbow, proj: { bolt: syringeBolt }, ...FX },
  'vampiric_fang.plague': leechJarSkin,
  'hawkeye_hood.plague': beakedMask(),
  'shadow_garb.plague': physicianCoat(),
  'leather_leggings.plague': physicianBreeches(),
  'leather_boots.plague': physicianBoots(),
};
