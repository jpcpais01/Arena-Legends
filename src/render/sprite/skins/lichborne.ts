import { ring, type Layer } from '../../auraKit';
import { css } from '../../pixel/color';
import { material, type Raster, type Tex } from '../../pixel/raster';
import { intersect, union } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, flameTongue, mats, Q, wrap } from './kit';

/**
 * Epic set: Lichborne. An undead sorcerer-king: aged bone ivory, grave-black
 * rags and tarnished silver, lit from within by ghostly green soulfire that
 * burns in every eye socket, while the restless dead stir at his feet.
 */

/** Aged bone ivory. */
const BONE = [0x6a604a, 0xa09678, 0xcfc6a6, 0xebe5cf, 0xfbf8ec];
/** Black bone and horn (the staff, horns, claws): a mid tone so it doesn't turn to mush. */
const BLACKBONE = [0x121010, 0x221e1c, 0x37322c, 0x544c42, 0x948a78];
/** Grave-black cloth with a faint green cast. */
const GRAVE = [0x0c0f0e, 0x161b1a, 0x242b29, 0x36403c];
/** Tarnished dark silver. */
const SILVER = [0x262c2a, 0x46504c, 0x76827c, 0xa6b2aa, 0xe2eee6];
/** Soulfire: deep green up to a pale green-white (glow materials show the fourth tone). */
const SOUL = [0x06301e, 0x0e6a40, 0x1fae6a, 0x5cf2a4, 0xdcfff0];
const PALE = 0xc8ffdc, DEEP = 0x1a9a5a, HOT = 0xe8fff2;
/** The black of an empty socket. */
const PIT = 0x060807;

/** Soulfire with a bright band running through it, one step per frame. */
const burn = (speed = 1.5, period = 5): Tex => (x, y, ph) => (wrap(x + y * 0.5 - ph * speed, period) < 1.2 ? 1 : 0);
/** Flicker: bright, dim, bright, brighter. */
const flick: Tex = (_x, _y, ph) => [0, -1, 0, 1][ph % 4];
/** Bone: a few pits and hairline cracks. */
const aged: Tex = (x, y) => (hash(Math.floor(x * 1.3), Math.floor(y * 1.3)) < 0.06 ? -1 : 0);
/** Knuckled black bone: a joint every few units. */
const knuckles = (p = 3.4): Tex => (x) => (wrap(x, p) < 0.5 ? -1 : 0);
/** Tarnish with a dull gleam sliding along. */
const tarnish = (period = 8): Tex => (x, y, ph) => (wrap(x + y * 0.5 - ph * 2, period) < 1 ? 1 : hash(Math.floor(x), Math.floor(y)) < 0.1 ? -1 : 0);
/** Grave cloth: long hanging folds. */
const folds: Tex = (x, y) => (Math.sin(x * 0.8 + Math.sin(y * 0.3) * 0.8) > 0.8 ? -1 : 0);
/** Rune stitching: short green glyph dashes in columns, a glint running down them one step per frame. */
const stitch: Tex = (x, y, ph) => {
  const cx = wrap(x, 7), row = Math.floor(y / 1.6);
  if (cx < 0.75 && wrap(y, 1.6) < 1 && hash(Math.floor(x / 7), row) < 0.45) return wrap(row + ph, 4) === 0 ? 4 : 0;
  return folds(x, y, ph);
};
/** Grave wrappings: diagonal binding seams. */
const binding: Tex = (x, y) => (wrap(x * 0.9 + y * 0.7, 2.2) < 0.45 ? -1 : 0);

const bone = (tex: Tex | undefined = aged) => ({ base: BONE[2], ramp: BONE, shiny: true, step: 0.13, tex });
const blackBone = (tex?: Tex) => ({ base: BLACKBONE[2], ramp: BLACKBONE, shiny: true, tex });
const silver = (tex: Tex | undefined = tarnish()) => ({ base: SILVER[2], ramp: SILVER, shiny: true, tex });
const soul = (tex?: Tex) => ({ base: SOUL[3], glow: true, ramp: SOUL, tex });
const pit = () => ({ base: PIT, ramp: [PIT, PIT, 0x0e1412, 0x16201c, 0x22302a] });

const FX = epicFx(PALE, DEEP, 'flame', 0x8affc0);

/** Particles the full set sheds in battle. */
export const LICHBORNE_FX: SkinFx = { spark: PALE, spark2: DEEP, kind: 'flame' };

/** A frame at (x, y) of F whose +y runs along F's +x (flames rising off a weapon toward its tip). */
const along = (F: Xf, x: number, y: number) => new Xf(F.x(x, y), F.y(x, y), F.ang - Math.PI / 2, F.sx, F.sy);

// -----------------------------------------------------------------------------
// Staff of the Lich King
// -----------------------------------------------------------------------------

function phylacteryStaff(): WeaponArt {
  // A gnarled black-bone staff knuckled like a spine, a caged phylactery glowing beneath a horned skull
  // whose sockets burn green, soulfire flickering off its crown.
  const C = 26.4;
  return {
    tip: 31,
    grip2: 12,
    mats: {
      shaft: material(blackBone(knuckles())), horn: material(blackBone()), bone: material(bone()),
      silver: material(silver()), pit: material(pit()),
      gem: material(soul(burn(1, 4))), eye: material(soul(flick)), fire: material(soul(burn(1, 4))), hot: material({ base: HOT, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // The gnarled shaft, swelling at its knuckles.
      fillAll(r, [union(
        t.cap(-20, 0.1, -9, -0.35, 1.15, 1.1), t.cap(-9, -0.35, 3, 0.3, 1.1, 1.05), t.cap(3, 0.3, 15, -0.2, 1.05, 1), t.cap(15, -0.2, 22.6, 0, 1, 1.1),
        t.circ(-14, -0.1, 1.5), t.circ(-4.6, 0, 1.45), t.circ(7.4, 0.1, 1.4),
      )], m('shaft'), o, 1);
      // A bone spike for a foot, bound in silver.
      fillAll(r, [t.poly([-19.6, -1.1, -24, 0.2, -19.6, 1.1])], m('bone'), o, 0.8);
      fillAll(r, [t.rect(-19, 0, 0.6, 1.45), t.rect(-0.6, 0, 0.55, 1.4), t.rect(15.8, 0, 0.6, 1.5)], m('silver'), o, 0.8);
      // The phylactery: a green gem in a silver cage, its light rolling.
      fillAll(r, [t.ell(19.2, 0, 2.3, 1.75)], m('gem'), o, 1);
      r.dot(t.x(18.6, 0.6), t.y(18.6, 0.6), m('hot'), ph % 2 ? 3 : 4, g);
      for (const s of [-1, 1]) {
        fillAll(r, [union(t.cap(16.4, s * 0.9, 17.8, s * 2.2, 0.4), t.cap(17.8, s * 2.2, 20.6, s * 2.2, 0.4), t.cap(20.6, s * 2.2, 22, s * 0.9, 0.4))], m('silver'), o, 0.5, s < 0 ? -1 : 0);
      }
      r.line(t.x(16.8, 0), t.y(16.8, 0), t.x(21.6, 0), t.y(21.6, 0), m('silver'), 3, g);
      fillAll(r, [t.rect(22, 0, 0.6, 1.6)], m('silver'), o, 0.8);
      // Horns curling out of the temples and up.
      for (const s of [-1, 1]) {
        fillAll(r, [union(t.cap(C + 0.6, s * 2.7, C + 1.6, s * 5, 1.1, 0.9), t.cap(C + 1.6, s * 5, C + 4, s * 6, 0.9, 0.55), t.cap(C + 4, s * 6, C + 5.8, s * 5, 0.55, 0.2))], m('horn'), o, 0.9, s < 0 ? -1 : 0);
      }
      // Soulfire licking up off the crown, behind the skull.
      const hs = [[2.6, 3.6, 2.2], [3.4, 2.4, 3.2], [2.2, 3.8, 2.8], [3, 2.8, 3.8]][ph];
      for (const [i, y] of [-1.8, 0, 1.8].entries()) flameTongue(r, along(t, C + 2.8, y), 0, 0, i === 1 ? 1.3 : 1, hs[i], ((i + ph) % 2) * 1 - 0.5, m('fire'), m('hot'), g, o.local);
      // The skull: cranium and a narrow jaw, facing out.
      const skull = union(t.circ(C, 0, 3.5), t.poly([C - 1.2, -3.1, C - 3.2, -2.6, C - 4.8, -1.7, C - 4.8, 1.7, C - 3.2, 2.6, C - 1.2, 3.1]));
      fillAll(r, [skull], m('bone'), o, 1.8);
      // Sockets burning green, a nose hole and a row of teeth.
      for (const s of [-1, 1]) {
        r.fill(t.ell(C - 0.9, s * 1.45, 1.15, 1.05), m('pit'), { group: g, flat: 0, noLine: true });
        r.dot(t.x(C - 0.9, s * 1.4), t.y(C - 0.9, s * 1.4), m('eye'), (ph + (s > 0 ? 0 : 2)) % 4 === 0 ? 4 : 3, g);
        r.dot(t.x(C - 0.4, s * 1.4), t.y(C - 0.4, s * 1.4), m('eye'), 3, g);
      }
      r.fill(t.poly([C - 2.4, 0, C - 3.4, -0.6, C - 3.4, 0.6]), m('pit'), { group: g, flat: 0, noLine: true });
      r.fill(t.rect(C - 4.1, 0, 0.35, 1.5), m('pit'), { group: g, flat: 0, noLine: true });
      for (const y of [-0.8, 0, 0.8]) r.dot(t.x(C - 4.1, y), t.y(C - 4.1, y), m('bone'), 3, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Gravecaller Wand
// -----------------------------------------------------------------------------

function gravecaller(): WeaponArt {
  // A spine of vertebrae ending in a clawed bone hand that clutches a green soul gem, soulfire flickering off it.
  return {
    tip: 14,
    mats: {
      grip: material({ base: GRAVE[2], ramp: [...GRAVE, 0x56605a], tex: (x) => (wrap(x, 1.3) < 0.4 ? -1 : 0) }),
      bone: material(bone()), cord: material(blackBone()), claw: material(blackBone()), silver: material(silver(undefined)),
      gem: material(soul(burn(1, 3))), hot: material({ base: HOT, glow: true }), fire: material(soul(burn(1, 4))),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      fillAll(r, [t.cap(-3.6, 0, 9.4, 0, 0.55)], m('cord'), o, 0.6);
      fillAll(r, [t.cap(-3.4, 0, 0.4, 0, 1, 0.95)], m('grip'), o, 1);
      fillAll(r, [t.circ(-4.3, 0, 1.15)], m('bone'), o, 0.8);
      fillAll(r, [t.rect(0.7, 0, 0.4, 1.2)], m('silver'), o, 0.6);
      // Vertebrae: a body, a spine raking back toward the hand, little side wings.
      for (const [i, x] of [2.2, 4.4, 6.6].entries()) {
        const k = 1 - i * 0.06;
        fillAll(r, [union(t.ell(x, 0, 0.95, 1.2 * k), t.poly([x - 0.6, 0.8, x + 1, 2.6 * k, x + 0.6, 0.7]), t.poly([x - 0.5, -0.7, x + 0.6, -2 * k, x + 0.5, -0.6]))], m('bone'), { ...o, group: g + (i % 2) }, 0.8, 0);
      }
      // The hand: the far fingers, the gem in the palm, then the near fingers curled over it.
      fillAll(r, [t.ell(9.4, 0, 1.6, 1.7)], m('bone'), o, 1);
      const finger = (s: number) => union(t.cap(9.8, s * 1.1, 12, s * 2.8, 0.55, 0.45), t.cap(12, s * 2.8, 14.2, s * 2, 0.45, 0.32));
      fillAll(r, [finger(1)], m('bone'), o, 0.6, -1);
      r.fill(t.poly([14, 2.5, 15.4, 1.5, 14.1, 1.4]), m('claw'), { group: g });
      fillAll(r, [t.circ(12.3, 0, 1.9)], m('gem'), o, 1.2);
      r.dot(t.x(11.8, 0.7), t.y(11.8, 0.7), m('hot'), ph % 2 ? 3 : 4, g);
      fillAll(r, [finger(-1)], m('bone'), o, 0.6);
      r.fill(t.poly([14, -2.5, 15.4, -1.5, 14.1, -1.4]), m('claw'), { group: g });
      // A thumb across the front of the gem.
      fillAll(r, [t.cap(10, -0.8, 12, -0.5, 0.45, 0.32)], m('bone'), o, 0.5);
      // Soulfire flickering off the gem.
      flameTongue(r, along(t, 13.6, 0), 0, 0, 1.1, [2, 3, 2.3, 3.4][ph], ph % 2 ? 0.6 : -0.6, m('fire'), m('hot'), g, o.local);
    },
  };
}

// -----------------------------------------------------------------------------
// Battle sprites
// -----------------------------------------------------------------------------

const GHOST_TEX: Tex = (x, y) => (wrap(x * 0.6 + y, 3) < 0.5 ? -1 : 0);
const SKULL_RAMP = [0x2a5a44, 0x5a9a7a, 0xa8dcbc, 0xd8f8e4, 0xffffff];
const PIT_RAMP = [0x020a06, 0x041a10, 0x082a1a, 0x0e3a24, 0x16503a];

const LM = mats({
  ghost: { base: SOUL[3], glow: true, ramp: SOUL, tex: GHOST_TEX },
  deep: { base: SOUL[2], glow: true, ramp: SOUL, tex: (x) => (wrap(x, 3) < 1 ? -1 : 0) },
  hot: { base: HOT, glow: true },
  skull: { base: SKULL_RAMP[2], ramp: SKULL_RAMP },
  pit: { base: PIT_RAMP[1], ramp: PIT_RAMP },
});

/**
 * A skull seen face on, its crown toward +x of F and its jaw toward -x (eyes either side of the x axis,
 * so it reads the same mirrored): cranium, cheeks, burning sockets, nose and a mouth `mouth` agape.
 */
function skullFront(r: Raster, F: Xf, x: number, s: number, skull: number, holes: number, eye: number, g: number, mouth = 0.5, eyeTone = 4): void {
  const jaw = 1 + mouth * 0.9;
  r.fill(union(F.circ(x + 0.6 * s, 0, 2.2 * s), F.poly([x, -2 * s, x - 1.6 * s, -1.5 * s, x - (1.6 + jaw) * s, -1 * s, x - (1.6 + jaw) * s, 1 * s, x - 1.6 * s, 1.5 * s, x, 2 * s])), skull, { group: g, bevel: 1.2 * s });
  for (const k of [-1, 1]) {
    r.fill(F.ell(x + 0.2 * s, k * 0.95 * s, 0.75 * s, 0.7 * s), holes, { group: g, flat: 0, noLine: true });
    r.dot(F.x(x + 0.2 * s, k * 0.95 * s), F.y(x + 0.2 * s, k * 0.95 * s), eye, eyeTone, g);
  }
  r.dot(F.x(x - 1 * s, 0), F.y(x - 1 * s, 0), holes, 0, g);
  r.fill(F.ell(x - (1.4 + jaw * 0.55) * s, 0, (0.3 + mouth * 0.55) * s, 0.75 * s), holes, { group: g, flat: 0, noLine: true });
}

/** A frame at t's origin whose +x points straight up (sprites that fly left or right but keep a skull upright). */
const upright = (t: Xf) => new Xf(t.ox, t.oy, Math.PI / 2);

const soulBolt: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A small green skull streaking along on a tail of soulfire, its jaw working.
    const w = [0, 0.7, 0, -0.7][f];
    r.fill(t.poly([0, -3, -5, -2 + w * 0.4, -9, -0.8 + w, -13, w * 1.5, -9, 1 + w, -5, 2.2 + w * 0.4, 0, 3]), h(LM.deep), { group: 1 });
    r.fill(t.poly([0, -1.6, -6, -0.4 + w * 0.5, -8.5, w * 0.8, -6, 0.6 + w * 0.5, 0, 1.6]), h(LM.ghost), { group: 1 });
    skullFront(r, upright(t), 0.2, 1.05, h(LM.skull), h(LM.pit), h(LM.hot), 2, [0.2, 0.7, 0.4, 0.9][f]);
    r.dot(t.x(-4.5 - f * 1.6, -w), t.y(-4.5 - f * 1.6, -w), h(LM.hot), 3, 1);
  },
};

const graveOrb: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A cursed orb: a wailing skull wreathed in a turning ring of soulfire.
    const R = 6 + (f % 2) * 0.4;
    for (let k = 0; k < 6; k++) {
      const a = k * (Math.PI / 3) + f * (Math.PI / 12);
      const F = new Xf(t.x(Math.cos(a) * (R - 1.4), Math.sin(a) * (R - 1.4)), t.y(Math.cos(a) * (R - 1.4), Math.sin(a) * (R - 1.4)), a - Math.PI / 2);
      flameTongue(r, F, 0, 0, 1.3, 2.4 + ((k + f) % 3) * 0.6, 0.8, h(LM.deep), h(LM.ghost), 1);
    }
    r.fill(t.circ(0, 0, R), h(LM.deep), { group: 1 });
    r.fill(t.circ(0, 0, R - 1.5), h(LM.ghost), { group: 1 });
    skullFront(r, upright(t), 0.6, 1.5, h(LM.skull), h(LM.pit), h(LM.hot), 2, [0.5, 1, 0.7, 0.2][f]);
  },
};

// -----------------------------------------------------------------------------
// Wailing Soulblades
// -----------------------------------------------------------------------------

interface GhostMats { ghost: number; deep: number; hot: number; skull: number; pit: number }

/** A ghost sword along +x of F (guard at 0): tattered trail, blade, bone-horn guard and the wailing skull on it. */
function ghostSword(r: Raster, F: Xf, f: number, h: GhostMats, trail = true): void {
  const w = [0, 0.8, 0.2, -0.7][f % 4];
  if (trail) {
    // A tattered ghostly trail streaming back off the hilt in ragged tongues.
    for (const [k, y, len] of [[0, -1.4, 11], [1, 0.2, 15], [2, 1.6, 9.5]] as const) {
      const ww = w * (k === 1 ? 1 : -0.8);
      r.fill(F.poly([-3, y - 1.2, -3 - len * 0.45, y - 0.9 + ww * 0.6, -3 - len, y + ww * 1.4, -3 - len * 0.55, y + 0.4 + ww * 0.5, -3, y + 1.2]), h.deep, { group: 1 });
    }
  }
  // The blade: a broad spectral sword, notched near the point, a bright ridge down it.
  const blade = F.poly([2, -2.5, 15, -2.4, 16.6, -1.6, 18, -2.4, 24, -2, 30, 0, 24, 2, 10, 2.4, 8.4, 1.6, 7, 2.5, 2, 2.5]);
  r.fill(blade, h.ghost, { group: 2, local: F });
  r.line(F.x(4, 0), F.y(4, 0), F.x(27, 0), F.y(27, 0), h.hot, 3, 2);
  r.fill(intersect(blade, F.rect(15, -2.1, 15, 0.45)), h.deep, { group: 2, noLine: true });
  // Hilt, and a guard of bone horns curling toward the point.
  r.fill(F.cap(-7, 0, -1, 0, 1.1), h.deep, { group: 3 });
  r.fill(F.circ(-7.6, 0, 1.4), h.ghost, { group: 3 });
  for (const k of [-1, 1]) r.fill(union(F.cap(0.4, k * 2, 1.4, k * 4.6, 0.85, 0.6), F.cap(1.4, k * 4.6, 3.6, k * 5.4, 0.6, 0.25)), h.skull, { group: 4, bevel: 0.8 });
  // The wailing skull on the guard, crown to the blade, its jaw dropping open and shut.
  skullFront(r, F, 0.4, 1.25, h.skull, h.pit, h.hot, 5, [0.3, 0.9, 1.1, 0.6][f % 4]);
}

const wailingBlade: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    ghostSword(r, t, f, { ghost: h(LM.ghost), deep: h(LM.deep), hot: h(LM.hot), skull: h(LM.skull), pit: h(LM.pit) });
  },
};

const wailing: SkinArt = {
  mats: {
    // Stock names, for the trail colours and anything drawn the stock way.
    phantom: soul(), phantomHot: { base: HOT, glow: true },
    'k.ghost': { base: SOUL[3], glow: true, ramp: SOUL, tex: GHOST_TEX },
    'k.deep': { base: SOUL[2], glow: true, ramp: SOUL },
    'k.hot': { base: HOT, glow: true },
    'k.skull': { base: SKULL_RAMP[2], ramp: SKULL_RAMP },
    'k.pit': { base: PIT_RAMP[1], ramp: PIT_RAMP },
  },
  glow: [PALE, DEEP],
  icon(r, t, m) {
    // Two soulblades crossed, the near one's wailing skull to the fore, trailing its rags.
    const h = { ghost: m('k.ghost'), deep: m('k.deep'), hot: m('k.hot'), skull: m('k.skull'), pit: m('k.pit') };
    const S = 0.74, k = 11.5 * S * Math.SQRT1_2;
    ghostSword(r, new Xf(t.x(k, -k), t.y(k, -k), (Math.PI * 3) / 4, S, S), 2, h, false);
    ghostSword(r, new Xf(t.x(-k, -k), t.y(-k, -k), Math.PI / 4, S, S), 1, h, false);
  },
  proj: { phantom: wailingBlade },
};

// -----------------------------------------------------------------------------
// Lich King's Visage
// -----------------------------------------------------------------------------

function lichVisage(): SkinArt {
  // A bone skull helm over the whole head, green fire burning in its eye pits, a tall jagged crown of
  // black iron and bone spikes, and a tattered black veil hanging down the back that sways.
  /** The crown's band rises a little toward the brow. */
  const by = (x: number) => 3.6 + ((x + 6.6) / 13.2) * 2;
  /** The crown's jagged top: peaks and valleys from the back to the brow. */
  const TOP: [number, number][] = [[-7.8, 10.6], [-5.2, 7.8], [-3.2, 12], [-1.4, 8.6], [0.4, 13.2], [2.1, 9], [3.7, 11.8], [5.1, 8.6], [6.7, 10.2]];
  return {
    head: () => ({
      mats: {
        'h.bone': material(bone()), 'h.pit': material(pit()), 'h.iron': material(blackBone(tarnish(7))),
        'h.spike': material(bone(undefined)),
        'h.veil': material({ base: GRAVE[2], ramp: [...GRAVE, 0x56605a], tex: folds }),
        'h.eye': material(soul(flick)), 'h.fire': material(soul(burn(1, 3))), 'h.hot': material({ base: HOT, glow: true }),
      },
      draw(r, H, m, g, sway) {
        const ph = r.phase % 4, s = sway * 2;
        const rip = [0, 0.6, 1, 0.4][ph];
        // The veil hanging down the back, its hem torn into rags that sway out of step.
        r.fill(H.poly([
          -3, 7.4, -8.4, 6.4, -10.6 - s * 0.3, 1.6, -10.4 - s, -6.4, -11 - s * 1.2, -11.4 + rip, -9.2 - s, -9,
          -7.8 - s * 0.9, -12.8 + (1 - rip), -6.4 - s * 0.7, -9.2, -4.8 - s * 0.6, -11.4 + rip * 0.7, -3.6, -6.4, -1.6, 0,
        ]), m('h.veil'), { group: g, bevel: 2, toneBias: -1, softLight: true, local: H });
        // The skull: a cranium over the whole head, cheekbones and a jaw jutting out over the chin.
        const skull = union(H.ell(-0.3, 1.2, 7, 6.8), H.poly([1.6, -1, 7.7, -0.6, 7.8, -2.6, 6.9, -5.4, 4.2, -6.5, 1.2, -5.9, -0.6, -3]));
        r.fill(skull, m('h.bone'), { group: g, bevel: 3, local: H });
        // A cheekbone ridge and the hollow beneath it.
        r.line(H.x(1.2, -1.6), H.y(1.2, -1.6), H.x(3.6, -2.2), H.y(3.6, -2.2), m('h.pit'), 1, g);
        // Eye pits, burning: the near one big, the far one narrow at the profile.
        r.fill(H.ell(3, 0.5, 1.7, 1.5), m('h.pit'), { group: g, flat: 0, noLine: true });
        r.fill(H.ell(6.1, 0.4, 0.85, 1.25), m('h.pit'), { group: g, flat: 0, noLine: true });
        r.dot(H.x(3.2, 0.3), H.y(3.2, 0.3), m('h.eye'), ph === 2 ? 4 : 3, g);
        r.dot(H.x(4, 0.3), H.y(4, 0.3), m('h.eye'), 3, g);
        r.dot(H.x(3.6, -0.5), H.y(3.6, -0.5), m('h.eye'), 2, g);
        r.dot(H.x(6.2, 0.3), H.y(6.2, 0.3), m('h.eye'), ph === 0 ? 4 : 3, g);
        // Soulfire curling up out of the near socket.
        flameTongue(r, H, 3.5, 1.4, 0.7, [1.6, 2.4, 1.3, 2.1][ph], -0.8, m('h.fire'), m('h.hot'), g);
        // The nose hole and a grin of teeth.
        r.fill(H.poly([6.3, -0.9, 7.5, -2.4, 6.1, -2.3]), m('h.pit'), { group: g, flat: 0, noLine: true });
        r.fill(H.rect(5.2, -3.9, 2.4, 0.6), m('h.pit'), { group: g, flat: 0, noLine: true });
        for (const x of [3.4, 4.6, 5.8, 7]) r.line(H.x(x, -3.4), H.y(x, -3.4), H.x(x, -4.4), H.y(x, -4.4), m('h.bone'), 3, g);
        // The crown: black iron rising in jagged points, bone spikes set in the tallest.
        const crown = [6.9, by(6.9) - 0.8, -7.4, by(-7.4) - 0.8];
        for (const [x, y] of TOP) crown.push(x, y);
        r.fill(H.poly(crown), m('h.iron'), { group: g, bevel: 1.4, local: H });
        for (const i of [2, 4, 6]) {
          const [x, y] = TOP[i];
          r.fill(H.poly([x - 0.75, by(x) + 1, x + 0.75, by(x) + 1, x + 0.1, y + 0.3, x - 0.2, y + 0.3]), m('h.spike'), { group: g, bevel: 0.6, noLine: true });
        }
        // The band along its foot, a soul gem set over the brow.
        r.fill(H.cap(-7.2, by(-7.2) - 0.1, 6.8, by(6.8) - 0.1, 0.8), m('h.iron'), { group: g, bevel: 0.8, local: H });
        r.fill(H.ell(3.6, by(3.6) + 0.1, 0.9, 0.85), m('h.eye'), { group: g });
        r.dot(H.x(3.4, by(3.6) + 0.3), H.y(3.4, by(3.6) + 0.3), m('h.hot'), 3, g);
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Gravecloth Robes
// -----------------------------------------------------------------------------

/** A small skull facing the front (+x), upright in frame F at (x, y): returns nothing, draws cranium, sockets and teeth. */
function skullBadge(r: Raster, F: Xf, x: number, y: number, s: number, boneM: number, pitM: number, eyeM: number, o: { group: number; toneBias?: number }, far = false): void {
  r.fill(union(F.ell(x, y, 2 * s, 1.9 * s), F.rect(x + 0.6 * s, y - 1.7 * s, 1.1 * s, 0.9 * s, 0.3 * s)), boneM, { ...o, bevel: 1.2 * s, local: F });
  r.fill(F.ell(x + 0.9 * s, y - 0.1 * s, 0.75 * s, 0.7 * s), pitM, { group: o.group, flat: 0, noLine: true });
  r.dot(F.x(x + 0.9 * s, y - 0.1 * s), F.y(x + 0.9 * s, y - 0.1 * s), eyeM, far ? 2 : 3, o.group);
  r.line(F.x(x, y - 1.5 * s), F.y(x, y - 1.5 * s), F.x(x + 1.4 * s, y - 1.5 * s), F.y(x + 1.4 * s, y - 1.5 * s), pitM, 0, o.group);
}

function gravecloth(): SkinArt {
  // Tattered grave-black robes stitched with faint green runes, a bone ribcage plate over the chest with a
  // soul gem at its heart, skull pauldrons, a ragged hem and a tattered cape that sways.
  return {
    mats: {
      robe: { base: GRAVE[2], ramp: [...GRAVE, 0x7affb8], tex: stitch }, robeTrim: silver(tarnish(6)),
      'k.cape': { base: GRAVE[1], ramp: [...GRAVE, 0x56605a], tex: folds },
      'k.bone': bone(), 'k.pit': pit(), 'k.soul': soul(flick), 'k.hot': { base: HOT, glow: true },
      'k.silver': silver(undefined),
    },
    chest: {
      cape: null, hood: null, pauldron: null,
      back(r, T, m, c) {
        const top = c.top, s = c.sway * 3, ph = r.phase % 4;
        // A long cape, its hem torn into rags of different lengths, each rag swinging on its own beat.
        const hem: number[] = [];
        const N = 6;
        for (let i = 0; i <= N; i++) {
          const u = i / N, rip = Math.sin(ph * Q + i * 2.1) * 0.9;
          const x = -12.8 - s * 1.4 + u * 10.4 + (u * s * 0.6);
          const y = -15 + u * 3.4;
          hem.push(x, y + (i % 2 ? 2.2 + rip * 0.4 : rip) - (i === 2 ? 1.6 : 0));
          if (i < N) hem.push(x + 0.9, y + 2.6 + rip * 0.3);
        }
        const pts = [-0.8, top + 0.8, -5.6, top - 0.6, -10 - s, top - 7, -12.6 - s * 1.3, -8, ...hem, -1.4, -6, -0.8, -1];
        r.fill(T.poly(pts), m('k.cape'), { group: 40, bevel: 3, toneBias: -1, softLight: true, local: T });
        // A frayed tear through the middle of it.
        r.fill(T.poly([-8.2 - s, -6.6, -7.2 - s, -9.4, -8.6 - s * 1.1, -11]), m('k.pit'), { group: 40, flat: 0, noLine: true });
      },
      shoulder(r, S, m, c) {
        // A skull for a pauldron, staring out, a green spark in its socket.
        skullBadge(r, S, 0.2, 1.2, 1.25, m('k.bone'), m('k.pit'), m('k.soul'), { group: c.g, toneBias: c.bias }, c.far);
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, ph = r.phase % 4;
        // The ribcage plate: a sternum and ribs curving back from it, dark gaps between.
        const f = b.chestPush * 0.7;
        // Ribs curving back from a sternum, each its own bone, the black robe showing between them.
        const sx = f + 1.9;
        for (let i = 0; i < 4; i++) {
          const y = top - 2.6 - i * 1.65, k = 1 - i * 0.12;
          r.fill(union(T.cap(sx, y, sx - 2.6 * k, y - 0.8, 0.7, 0.62), T.cap(sx - 2.6 * k, y - 0.8, sx - 5 * k, y - 0.1, 0.62, 0.4)), m('k.bone'), { group: 41 + (i % 2), bevel: 0.6, local: T });
        }
        r.fill(T.cap(sx, top - 1.6, sx - 0.2, top - 8.2, 0.75, 0.6), m('k.bone'), { group: 43, bevel: 0.7, local: T });
        // The soul gem at its heart, beating.
        r.fill(T.ell(sx - 0.1, top - 3.3, 0.85, 1.05), m('k.soul'), { group: 43 });
        r.dot(T.x(sx - 0.3, top - 3), T.y(sx - 0.3, top - 3), m('k.hot'), ph % 2 ? 3 : 4, 43);
        // Rags torn from the robe's hem, swinging.
        const leg = b.thigh + b.shin, len = leg * 0.62, sw = c.sway * 2.2;
        const x0 = -b.hipW - 1.6 - sw, x1 = b.hipW + 2 - sw, n = 5;
        for (let k = 0; k < n; k++) {
          const u = (k + 0.5) / n, x = x0 + (x1 - x0) * u, y = -len + 0.9 - u * 0.5;
          const d = 1.6 + ((k * 7) % 3) * 0.7 + Math.sin(ph * Q + k * 1.9) * 0.4, lean = Math.sin(ph * Q + k) * 0.5 - sw * 0.2;
          r.fill(T.poly([x - 0.9, y, x + 0.9, y, x + 0.2 + lean, y - d]), m('robe'), { group: c.g, bevel: 0.6, toneBias: k % 2 ? -1 : 0, local: T });
        }
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Ossuary Wraps
// -----------------------------------------------------------------------------

function ossuaryWraps(): SkinArt {
  // Black grave wrappings bound round the leg, bone splints strapped down the thigh, a small skull at the knee
  // and green runes glinting on the cloth one after another.
  return {
    mats: {
      bloodLeg: { base: GRAVE[2], ramp: [...GRAVE, 0x56605a], tex: binding },
      bloodDark: { base: 0x4a4c44, ramp: [0x1e201c, 0x30322c, 0x4a4c44, 0x66685e, 0x8a8c80], tex: binding },
      bloodGlow: soul(),
      'l.bone': bone(), 'l.pit': pit(), 'l.soul': soul(), 'l.hot': { base: HOT, glow: true }, 'l.strap': blackBone(),
    },
    legs: {
      mat: 'bloodLeg', wraps: 'bloodDark', rune: null, knee: null, trim: null, tasset: null, bulk: 0.2,
      over(r, t, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, L = c.len, w = c.w;
        // A bone plate down the front of the thigh, strapped on.
        r.fill(t.poly([L * 0.34, w * 0.15, L * 0.34, w + 0.3, L * 0.92, w + 0.1, L * 0.92, w * 0.05]), m('l.bone'), { ...o, bevel: 0.8 });
        r.fill(t.rect(L * 0.62, w * 0.3, 0.35, w * 0.9), m('l.strap'), { ...o, group: c.g + 22, bevel: 0.4 });
        // Runes on the wrappings, glinting in turn.
        const RUNES: [number, number][] = [[L * 0.55, -w * 0.45], [L * 0.82, -w * 0.3]];
        RUNES.forEach(([x, y], i) => {
          const on = (i * 2 + ph) % 4 === 0;
          r.line(t.x(x - 0.6, y), t.y(x - 0.6, y), t.x(x + 0.6, y), t.y(x + 0.6, y), m(on ? 'l.hot' : 'l.soul'), on ? 4 : 2, c.g + 22);
        });
        // The skull at the knee, upright, staring out.
        const up = new Xf(t.ox, t.oy, t.ang - Math.PI / 2);
        skullBadge(r, up, w * 0.25 - 0.2, 0.3, 0.95, m('l.bone'), m('l.pit'), m(ph % 2 ? 'l.hot' : 'l.soul'), { group: c.g + 23, toneBias: c.bias }, c.far);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Gravewalkers
// -----------------------------------------------------------------------------

function gravewalkers(): SkinArt {
  // Black grave-leather boots with bony claws at the toe, a ridge of vertebrae up the front of the shin
  // and a wisp of green soulfire curling off the heel.
  return {
    mats: {
      shadow: { base: GRAVE[2], ramp: [...GRAVE, 0x56605a], tex: (x) => (wrap(x, 2.6) < 0.4 ? -1 : 0) },
      shadowGlow: silver(tarnish(6)),
      'k.bone': bone(), 'k.claw': blackBone(), 'k.soul': soul(burn(1, 3)), 'k.hot': { base: HOT, glow: true },
    },
    boots: {
      height: 0.72, bulk: 0.34,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w;
        // The vertebra ridge up the front of the shin, each knuckle with a little spine.
        for (let k = 0; k < 4; k++) {
          const x = c.top * (0.22 + k * 0.22);
          r.fill(union(shin.ell(x, w + 0.1, 0.75, 0.55), shin.poly([x - 0.3, w + 0.4, x + 0.6, w + 1.3, x + 0.5, w + 0.3])), m('k.bone'), { ...o, group: k % 2 ? c.g : c.g + 24, bevel: 0.6 });
        }
        // Bone claws at the toe, curling down, a darker one behind.
        r.fill(foot.poly([c.toe - 1.6, 0.2, c.toe + 0.9, 0, c.toe + 2.1, -1.2, c.toe + 0.6, -0.7, c.toe - 1.2, -0.6]), m('k.claw'), { ...o, group: c.g + 25, bevel: 0.5, toneBias: c.bias - 1 });
        r.fill(foot.poly([c.toe - 1.8, 1.3, c.toe + 0.4, 1.1, c.toe + 1.8, 0, c.toe + 0.2, 0.2, c.toe - 1.6, 0.2]), m('k.bone'), { ...o, bevel: 0.6 });
        r.dot(foot.x(c.toe + 1.6, 0), foot.y(c.toe + 1.6, 0), m('k.claw'), 1, c.g);
        if (c.far) return;
        // Soulfire curling up off the heel and drifting back.
        const back = new Xf(foot.ox, foot.oy, foot.ang, -foot.sx, foot.sy);
        const lean = [0.6, 1.2, 1.6, 1][ph];
        flameTongue(r, back, 1.2, 0.2, 0.8, [2.6, 3.4, 2.8, 3.8][ph], lean, m('k.soul'), m('k.hot'), c.g);
        const mx = 2.2 + ph * 0.5, my = 3.8 + ph * 0.7;
        if (ph !== 3) r.dot(back.x(mx, my), back.y(mx, my), m(ph ? 'k.soul' : 'k.hot'), 3, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const A = {
  rune: css(0x3ad888), runeHi: css(0xb8ffd8), deep: css(0x0e6a40),
  bone: css(0xcfc6a6), boneDk: css(0x857a60), wisp: css(0x6af2a8), hot: css(HOT),
};

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function lichborneAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  // A rune circle on the ground: a ring of soul-light, glyphs turning round it, each flaring in turn.
  g.globalAlpha = 0.55;
  g.fillStyle = A.rune;
  ring(g, x, y, 15, 3.8, 36, layer, (g, px, py, i) => { if (i % 4) g.fillRect(px, py, 1, 1); });
  const turn = t * 0.5;
  for (let i = 0; i < 10; i++) {
    const a = turn + (i / 10) * Math.PI * 2, s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const px = Math.round(x + Math.cos(a) * 12), py = Math.round(y + s * 2.9);
    const lit = Math.sin(t * 3 + i * 1.7) > 0.55;
    g.globalAlpha = lit ? 1 : 0.7;
    g.fillStyle = lit ? A.runeHi : A.rune;
    // Glyphs: a dash with a tick, a hook or a cross.
    g.fillRect(px - 1, py, 3, 1);
    if (i % 3 === 0) g.fillRect(px, py - 1, 1, 1);
    else if (i % 3 === 1) g.fillRect(px + 1, py - 1, 1, 1);
    else g.fillRect(px - 1, py - 1, 1, 1);
  }
  g.globalAlpha = 1;
  // Skeletal hands clawing up out of the ground and sinking back.
  for (let k = 0; k < 3; k++) {
    const a = k * 2.2 + 0.7, s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const h = Math.round(Math.sin(t * 1.3 + k * 2.4) * 8);
    if (h <= 0) continue;
    const px = Math.round(x + Math.cos(a) * 17), py = Math.round(y + s * 4);
    const open = Math.sin(t * 4 + k) > 0 ? 1 : 0;
    // Grave dirt heaped where it breaks the ground.
    g.globalAlpha = 0.7; g.fillStyle = A.deep; g.fillRect(px - 2, py, 5, 1); g.globalAlpha = 1;
    // Forearm: two bones.
    g.fillStyle = A.boneDk; g.fillRect(px, py - h + 3, 1, h - 3);
    g.fillStyle = A.bone; g.fillRect(px + 1, py - h + 3, 1, h - 3);
    if (h >= 4) {
      // Palm, then fingers spread wide or curled into a claw.
      g.fillRect(px - 1, py - h + 2, 4, 1);
      g.fillRect(px - 1 - open, py - h, 1, 2);
      g.fillRect(px, py - h - open, 1, 2);
      g.fillRect(px + 1, py - h - 1 - open, 1, 2);
      g.fillRect(px + 2 + open, py - h, 1, 2);
      g.fillStyle = A.boneDk; g.fillRect(px - 1, py - h + 1, 4, 1);
    }
  }
  // Soul wisps spiralling up round the fighter and fading.
  for (let k = 0; k < 4; k++) {
    const u = (t * 0.3 + k / 4) % 1;
    const a = u * Math.PI * 3 + k * 1.6, s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const px = Math.round(x + Math.cos(a) * (13 - u * 5)), py = Math.round(y - 3 - u * 36 + s * 3);
    const tail = Math.cos(a) > 0 ? -1 : 1;
    g.globalAlpha = Math.min(1, (1 - u) * 1.8);
    g.fillStyle = A.deep; g.fillRect(px + tail, py + 2, 1, 2); g.fillRect(px + tail * 2, py + 4, 1, 1);
    g.fillStyle = A.wisp; g.fillRect(px - 1, py, 3, 2); g.fillRect(px, py - 1, 1, 4);
    g.fillStyle = A.hot; g.fillRect(px, py, 1, 1);
  }
  g.globalAlpha = 1;
}

export const LICHBORNE: Record<string, SkinArt> = {
  'arcane_staff.phylactery': { weapon: phylacteryStaff, proj: { arcane: soulBolt, hex: graveOrb }, ...FX },
  'frost_wand.gravecaller': { weapon: gravecaller, ...FX },
  'phantom_blade.wailing': wailing,
  'berserker_mask.lich': lichVisage(),
  'mage_robe.gravecloth': gravecloth(),
  'bloodrite_wraps.ossuary': ossuaryWraps(),
  'shadow_treads.gravewalkers': gravewalkers(),
};
