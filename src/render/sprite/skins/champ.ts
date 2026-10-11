import { css } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { ring, type Layer } from '../../auraKit';
import { hairCap } from '../draw';
import { chainLine, fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, mats, wrap } from './kit';

/**
 * Mythic set: The Champ Is Here. John Cena's ring gear: a lime green
 * Never Give Up tee and a matching cap with a black brim, dog tags on a ball
 * chain, long denim jorts, lime high-tops with white socks, sweatbands and
 * taped fists, the spinner title floating at his shoulder and a trumpet to
 * blow his own entrance. His Spirit Palm is the "You can't see me" hand, and
 * every few seconds the full set does the joke for real: the hand waves in
 * front of his face and he fades out of sight.
 * Night accents: the spinner's diamonds, the logos on the cap, wristbands
 * and heels, the glint on the dog tags and the trumpet's brass.
 */

/** Cenation lime: the tee, the cap, the bands. */
const LIME = [0x1c4208, 0x3a7a10, 0x66c21c, 0x9eec46, 0xdcffa8];
/** Black print and brims. */
const INK = [0x060806, 0x101410, 0x1e241e, 0x323a32, 0x5e685e];
/** Athletic tape, socks and soles. */
const WHITE = [0x8c8c88, 0xbcbcb6, 0xe2e2dc, 0xf6f6f2, 0xffffff];
/** Faded denim. */
const DENIM = [0x14223e, 0x22385e, 0x35558a, 0x5a7cb2, 0x9cb8e0];
/** Dog tags, studs and the spinner's rim. */
const SILVER = [0x34383e, 0x666c76, 0xa6aeb8, 0xdce2ea, 0xffffff];
/** The title's gold. */
const GOLD = [0x5c3206, 0x9e660e, 0xdcaa22, 0xffdc50, 0xfff8c8];
/** Trumpet brass, paler and yellower than the title. */
const BRASS = [0x5a3c0c, 0x9c7018, 0xdcb040, 0xfade80, 0xfff8d8];
/** Bling. */
const DIAMOND = [0x4a6a8a, 0x8ab8e0, 0xd0f0ff, 0xf2fbff, 0xffffff];
/** Copper rivets and jeans stitching. */
const COPPER = [0x4a2008, 0x8a4414, 0xc87a2e, 0xeaa860, 0xffe0b0];
const WHITE1 = 0xffffff;

/** A glint sliding along polished metal, one step a frame. */
const sweep = (period = 9, speed = 2.25, w = 1): Tex => (x, y, ph) => (wrap(x * 0.8 + y * 0.45 - ph * speed, period) < w ? 1 : 0);
/** Terry cloth: little loops of a darker tone. */
const terry: Tex = (x, y) => (hash(Math.floor(x * 1.7), Math.floor(y * 1.7)) < 0.2 ? -1 : 0);
/** Cotton jersey: a few soft flecks. */
const jersey: Tex = (x, y) => (hash(Math.floor(x * 1.3), Math.floor(y * 1.3)) < 0.06 ? -1 : 0);
/** Denim twill with stonewashed flecks. */
const twill: Tex = (x, y) => {
  if (hash(Math.floor(x * 1.2), Math.floor(y * 1.2)) < 0.09) return 1;
  return wrap(x * 0.75 - y * 0.75, 1.5) < 0.4 ? -1 : 0;
};
/** Rubber sole: a few ridges. */
const ridges: Tex = (x) => (wrap(x, 1.6) < 0.45 ? -1 : 0);

const S = {
  lime: (tex: Tex | undefined = jersey): MaterialSpec => ({ base: LIME[2], ramp: LIME, tex }),
  ink: (tex?: Tex): MaterialSpec => ({ base: INK[2], ramp: INK, tex }),
  white: (tex?: Tex): MaterialSpec => ({ base: WHITE[2], ramp: WHITE, tex }),
  denim: (tex: Tex | undefined = twill): MaterialSpec => ({ base: DENIM[2], ramp: DENIM, tex }),
  silver: (tex: Tex | undefined = sweep()): MaterialSpec => ({ base: SILVER[2], ramp: SILVER, shiny: true, step: 0.16, tex }),
  gold: (tex: Tex | undefined = sweep(10, 2.5, 1.1)): MaterialSpec => ({ base: GOLD[2], ramp: GOLD, shiny: true, step: 0.15, tex }),
  brass: (tex: Tex | undefined = sweep(8, 2, 0.9)): MaterialSpec => ({ base: BRASS[2], ramp: BRASS, shiny: true, step: 0.15, tex }),
  copper: (): MaterialSpec => ({ base: COPPER[2], ramp: COPPER, shiny: true }),
  thread: (): MaterialSpec => ({ base: COPPER[3], ramp: COPPER }),
  diamond: (): MaterialSpec => ({ base: DIAMOND[2], ramp: DIAMOND, glow: true }),
  /** A small logo stitched in reflective lime: the one thing on the cloth that catches the light at night. */
  mark: (): MaterialSpec => ({ base: LIME[3], ramp: LIME, glow: true }),
};

/** Lime and white sparkles; a punch trails lime. */
const FX = epicFx(0xe0ffb0, 0x66c21c, 'twinkle');

/** Particles the full set sheds in battle: lime and white glints. */
export const CHAMP_FX: SkinFx = { spark: 0xe0ffb0, spark2: 0x9eec46, kind: 'twinkle' };

// -----------------------------------------------------------------------------
// You can't see me
// -----------------------------------------------------------------------------

/** How often the full set does the wave, and for how long (seconds). */
const SEE_PER = 7.5, SEE_LEN = 1.1;

/** 0..1 through the wave, or -1 when it isn't happening. */
const seeMe = (t: number) => {
  const u = wrap(t - 2.5, SEE_PER);
  return u < SEE_LEN ? u / SEE_LEN : -1;
};

/**
 * How much of the fighter shows (1 = all of it): during the wave he fades to a
 * shimmer and comes back. Battle only; the body is drawn at this alpha.
 */
export function champUnseen(t: number): number {
  const k = seeMe(t);
  if (k < 0) return 1;
  const fade = k < 0.25 ? k / 0.25 : k > 0.8 ? (1 - k) / 0.2 : 1;
  const flick = Math.floor(t * 24) % 3 === 0 ? 0.08 : 0;
  return 1 - fade * (0.8 - flick);
}

// -----------------------------------------------------------------------------
// Never Give Up Wristbands (spirit wraps)
// -----------------------------------------------------------------------------

function wristbands(): WeaponArt {
  // Fists taped in white athletic tape, across the knuckles and round the wrist, and a thick lime terry
  // sweatband up the forearm, striped in black, with a little Cenation logo stitched on it.
  return {
    tip: 4,
    mats: {
      band: material(S.lime(terry)), stripe: material(S.ink()), tape: material(S.white()),
      tapeShade: material({ base: WHITE[1], ramp: WHITE }), mark: material(S.mark()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      // The sweatband: thicker than the arm, black stripes at both edges.
      const band = t.cap(-6.6, 0, -3.7, 0, 2.3, 2.3);
      fillAll(r, [band], m('band'), o, 1.4);
      for (const x of [-6.1, -4.2]) r.fill(intersect(band, t.rect(x, 0, 0.32, 3)), m('stripe'), { group: g, flat: 1, noLine: true });
      // The logo on the back of the band: a black patch, a lime mark on it.
      r.fill(t.rect(-5.15, 1.1, 0.55, 0.75, 0.2), m('stripe'), { group: g, flat: 1, noLine: true });
      r.dot(t.x(-5.15, 1.15), t.y(-5.15, 1.15), m('mark'), 3, g);
      // Tape round the wrist, the turns overlapping.
      fillAll(r, [t.cap(-3.7, 0, -1.5, 0, 1.75, 1.95)], m('tape'), o, 1);
      for (const x of [-3.1, -2.1]) r.line(t.x(x - 0.45, -1.8), t.y(x - 0.45, -1.8), t.x(x + 0.45, 1.9), t.y(x + 0.45, 1.9), m('tapeShade'), 2, g);
      // A strip of tape across the knuckles.
      const knuckles = intersect(t.ell(0.6, 0, 2.6, 2.35), t.rect(1.55, 0, 0.75, 3));
      fillAll(r, [knuckles], m('tape'), o, 0.8);
      r.line(t.x(1.5, -1.6), t.y(1.5, -1.6), t.x(1.5, 1.7), t.y(1.5, 1.7), m('tapeShade'), 1, g);
    },
  };
}

/** The "You can't see me" hand: Spirit Palm thrown as an open palm, fingers up, waving as it flies. */
const HAND = mats({
  palm: { base: 0xeaffd2, ramp: [0x6aa84a, 0xa8e080, 0xdcffc0, 0xf2ffe8, 0xffffff], glow: true },
  crease: { base: 0xa8e080, ramp: LIME },
  band: S.lime(terry), stripe: S.ink(), streak: { base: LIME[3], ramp: LIME, glow: true },
});
const cantSeeMe: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // Speed streaks behind it.
    for (const [y, l] of [[-4, 7 + f], [-0.5, 10 - f], [3, 8 + (f % 2) * 2]]) r.line(t.x(-5, y), t.y(-5, y), t.x(-5 - l, y), t.y(-5 - l, y), h(HAND.streak), 2, 1);
    // The hand rocks side to side about the wrist: the wave.
    const tilt = [-0.28, 0, 0.28, 0][f];
    const w = new Xf(t.x(0.4, -6.6), t.y(0.4, -6.6), t.ang + tilt, t.sx, t.sy);
    const hand: Shape[] = [w.ell(0.2, 5, 3.9, 3.7)];
    for (const [x, top] of [[-2.4, 12.4], [-0.6, 13.6], [1.2, 13.4], [2.9, 11.6]]) hand.push(w.cap(x, 6.8, x, top, 0.85));
    hand.push(w.cap(-3.2, 4.4, -6, 7.6, 0.95));
    r.fill(union(...hand), h(HAND.palm), { group: 1, bevel: 1.6 });
    for (const x of [-1.5, 0.3, 2.05]) r.line(w.x(x, 7.4), w.y(x, 7.4), w.x(x, 11), w.y(x, 11), h(HAND.crease), 3, 1);
    // Palm lines and the gaps between the fingers.
    r.line(w.x(-2.4, 5.6), w.y(-2.4, 5.6), w.x(2.6, 6.4), w.y(2.6, 6.4), h(HAND.crease), 2, 1);
    r.line(w.x(-2, 3.6), w.y(-2, 3.6), w.x(1.8, 2.6), w.y(1.8, 2.6), h(HAND.crease), 2, 1);
    // The wristband.
    r.fill(w.rect(0.2, 0.6, 3.5, 1.5, 0.4), h(HAND.band), { group: 2, bevel: 0.8 });
    r.fill(w.rect(0.2, -0.6, 3.5, 0.3), h(HAND.stripe), { group: 2, flat: 1, noLine: true });
    r.fill(w.rect(0.2, 1.8, 3.5, 0.3), h(HAND.stripe), { group: 2, flat: 1, noLine: true });
    // Little wave marks off the fingertips, on the side it swings toward.
    const s = tilt === 0 ? (f === 1 ? 1 : -1) : -Math.sign(tilt);
    for (const [y, l] of [[11, 1.6], [8.6, 2]]) {
      const x = s * 5.4;
      r.line(w.x(x, y), w.y(x, y), w.x(x + s * l, y + 0.8), w.y(x + s * l, y + 0.8), h(HAND.streak), 3, 3);
    }
  },
};

// -----------------------------------------------------------------------------
// The Time Is Now Trumpet (war horn)
// -----------------------------------------------------------------------------

function trumpet(): WeaponArt {
  // A brass trumpet held by the valves: the mouthpiece behind the hand, the lead pipe looping round under
  // the valves, three valve buttons capped in lime with pearl tops, the bell flaring forward with a lime
  // and black band round its pipe. Notes puff out of the bell.
  return {
    tip: 10.6,
    mats: {
      brass: material(S.brass()), bell: material(S.brass(undefined)), mouth: material({ base: BRASS[0], ramp: BRASS }),
      silver: material(S.silver(undefined)), lime: material(S.lime(undefined)), ink: material(S.ink()),
      pearl: material({ base: WHITE[3], ramp: WHITE, shiny: true }), note: material({ base: WHITE1, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // The lower loop: from the back bend under the valves to the tuning slide at the front.
      fillAll(r, [t.cap(-2.4, -1.9, 5.6, -1.9, 0.5), t.cap(5.6, -1.9, 6.5, -0.8, 0.5), t.cap(6.5, -0.8, 5.8, 0.25, 0.5), t.cap(-2.4, -1.9, -1.4, -0.6, 0.5)], m('brass'), o, 0.6);
      // The mouthpiece and the lead pipe into the valves.
      fillAll(r, [t.cap(-4.2, 0.3, -0.8, 0.3, 0.45, 0.5)], m('brass'), o, 0.6);
      fillAll(r, [t.poly([-5.2, -0.5, -4.3, -0.2, -4.3, 0.8, -5.2, 1.1])], m('silver'), o, 0.5);
      // The valve block: three casings, a lime finger button on each, pearl tops.
      const casings = [-0.4, 0.5, 1.4].map((x) => t.rect(x, -0.7, 0.42, 1.6, 0.2));
      fillAll(r, [union(...casings)], m('brass'), o, 0.7);
      for (const x of [-0.4, 0.5, 1.4]) {
        fillAll(r, [t.rect(x, 1.35, 0.22, 0.5)], m('silver'), o, 0.3);
        r.dot(t.x(x, 2.05), t.y(x, 2.05), m('lime'), 3, g);
        r.dot(t.x(x, 2.45), t.y(x, 2.45), m('pearl'), 3, g);
      }
      // The bell pipe running forward, the lime and black band round it.
      fillAll(r, [t.cap(1.6, 0.3, 7.6, 0.3, 0.55, 0.65)], m('brass'), o, 0.8);
      r.fill(t.rect(5.1, 0.3, 0.55, 0.85, 0.2), m('lime'), { group: g, bevel: 0.4, toneBias: o.toneBias });
      r.fill(t.rect(5.1, 0.3, 0.16, 0.85), m('ink'), { group: g, flat: 1, noLine: true });
      // The flared bell.
      fillAll(r, [t.poly([7.2, -0.4, 8.8, -0.9, 9.9, -1.9, 10.6, -2.9, 10.9, -3.1, 10.9, 3.7, 10.6, 3.5, 9.9, 2.5, 8.8, 1.5, 7.2, 1.0])], m('bell'), o, 1.2);
      r.fill(t.ell(10.7, 0.3, 0.45, 2.7), m('mouth'), { group: g, flat: 1, noLine: true });
      // Notes out of the bell: one rising and drifting each frame, another on the alternate beat.
      for (let k = 0; k < 2; k++) {
        const s = wrap(ph + k * 2, 4);
        const x = 11.6 + s * 0.9, y = 1 + s * 1.3 + k * 0.6;
        r.dot(t.x(x, y), t.y(x, y), m('note'), 3, g);
        r.line(t.x(x + 0.6, y), t.y(x + 0.6, y), t.x(x + 0.6, y + 1.8), t.y(x + 0.6, y + 1.8), m('note'), 2, g);
      }
    },
  };
}

// -----------------------------------------------------------------------------
// The Spinner Title (phoenix feather)
// -----------------------------------------------------------------------------

const SPIN: Record<string, MaterialSpec> = {
  'k.sStrap': S.ink((x, y) => (hash(Math.floor(x * 1.4), Math.floor(y * 1.4)) < 0.07 ? 1 : 0)),
  'k.sStud': S.silver(undefined), 'k.sGold': S.gold(), 'k.sRim': S.silver(), 'k.sInk': S.ink(undefined),
  'k.sDia': S.diamond(), 'k.sLogo': { base: GOLD[3], ramp: GOLD, shiny: true }, 'k.sSpark': { base: WHITE1, glow: true },
  'k.sLime': S.lime(undefined),
};
const SM = mats(SPIN);

/** A cut stone seen face-on at (x, y) of F. */
const diamond = (F: Xf, x: number, y: number, rx: number, ry = rx * 1.3): Shape => F.poly([x - rx, y, x, y + ry, x + rx, y, x, y - ry]);

/**
 * The spinner in frame F (`s` its scale; about 26 x 18 units at 1): a black strap studded in silver, gold
 * side plates with a diamond each, and the big square gold centre plate ringed in diamonds, "CHAMP" spelled
 * out in diamonds along its foot, and in the middle the spinning disc: a silver rim, black inside, a gold
 * logo turned by `spin` (radians). `glint` -1..1 sweeps a shine across (off when outside).
 */
function spinner(r: Raster, F: Xf, s: number, spin: number, glint: number, m: (k: string) => number, g0: number): void {
  const S2 = (v: number) => v * s;
  const strap = F.poly([S2(-13), S2(-1.8), S2(-7), S2(-2.7), S2(7), S2(-2.7), S2(13), S2(-1.8), S2(13), S2(2), S2(7), S2(2.4), S2(-7), S2(2.4), S2(-13), S2(2)], S2(0.6));
  r.fill(strap, m('k.sStrap'), { group: g0, bevel: S2(1.2) });
  for (let x = -12.2; x <= 12.2; x += 1.7 / Math.min(1, s * 1.4)) {
    if (Math.abs(x) < 7.6 || (Math.abs(x) > 8.2 && Math.abs(x) < 10.8)) continue;
    for (const y of [-1.7, 1.6]) r.dot(Math.round(F.x(S2(x), S2(y))), Math.round(F.y(S2(x), S2(y))), m('k.sStud'), 3, g0);
  }
  // Side plates, a diamond in each.
  for (const k of [-1, 1]) {
    const cx = S2(9.5 * k);
    r.fill(F.rect(cx, S2(0), S2(1.4), S2(2.9), S2(0.6)), m('k.sGold'), { group: g0 + 1, bevel: S2(1) });
    r.fill(diamond(F, cx, 0, S2(0.8), S2(1.1)), m('k.sDia'), { group: g0 + 1 });
  }
  // The centre plate: square gold, a border of diamonds.
  const plate = F.rect(0, S2(0.3), S2(7.2), S2(7.4), S2(1.6));
  r.fill(plate, m('k.sGold'), { group: g0 + 2, bevel: S2(1.6), lightBias: 0.2 });
  if (s >= 0.8) {
    for (let x = -6; x <= 6.01; x += 2.4) for (const y of [6.6, -6]) r.dot(Math.round(F.x(S2(x), S2(y))), Math.round(F.y(S2(x), S2(y))), m('k.sDia'), 3, g0 + 2);
    for (let y = -3.6; y <= 4.21; y += 2.6) for (const x of [-6.4, 6.4]) r.dot(Math.round(F.x(S2(x), S2(y))), Math.round(F.y(S2(x), S2(y))), m('k.sDia'), 3, g0 + 2);
  } else for (const [x, y] of [[-5.8, 6], [5.8, 6], [-5.8, -5.4], [5.8, -5.4]]) r.dot(Math.round(F.x(S2(x), S2(y))), Math.round(F.y(S2(x), S2(y))), m('k.sDia'), 3, g0 + 2);
  // CHAMP: a black bar along the foot, five diamond letters in it.
  r.fill(F.rect(0, S2(-4.3), S2(4.8), S2(1.05), S2(0.4)), m('k.sInk'), { group: g0 + 2, bevel: S2(0.6), noLine: true });
  if (s >= 0.8) for (let i = 0; i < 5; i++) r.dot(Math.round(F.x(S2(-3.6 + i * 1.8), S2(-4.3))), Math.round(F.y(S2(-3.6 + i * 1.8), S2(-4.3))), m('k.sDia'), 3, g0 + 2);
  else for (const x of [-2.8, 0, 2.8]) r.dot(Math.round(F.x(S2(x), S2(-4.3))), Math.round(F.y(S2(x), S2(-4.3))), m('k.sDia'), 3, g0 + 2);
  // The spinning disc.
  const cy = S2(1.5), R = S2(4.1);
  r.fill(F.circ(0, cy, R), m('k.sRim'), { group: g0 + 3, bevel: S2(1.2), lightBias: 0.2 });
  r.fill(F.circ(0, cy, R * 0.74), m('k.sInk'), { group: g0 + 3, bevel: S2(0.8), noLine: true });
  // The logo on it: a scratched W, turned by the spin.
  const c = Math.cos(spin), sn = Math.sin(spin);
  const P = (x: number, y: number): [number, number] => [F.x(S2(x * c - y * sn), cy + S2(x * sn + y * c)), F.y(S2(x * c - y * sn), cy + S2(x * sn + y * c))];
  // Too small for the W (at the shoulder): a bar across the disc, turning.
  const W: [number, number][] = s >= 0.8 ? [[-2.1, 1.1], [-1.1, -1.2], [0, 0.7], [1.1, -1.2], [2.1, 1.1]] : [[-2.6, 0], [2.6, 0]];
  for (let i = 0; i < W.length - 1; i++) {
    const [ax, ay] = P(...W[i]), [bx, by] = P(...W[i + 1]);
    r.line(ax, ay, bx, by, m('k.sLogo'), 3, g0 + 3);
  }
  // A spark riding round the rim as it turns, and the blur of the rim behind it.
  for (let k = 0; k < (s >= 0.8 ? 3 : 1); k++) {
    const a = spin * 2 - k * 0.45, d = R * 0.88;
    r.dot(Math.round(F.x(Math.cos(a) * d, cy + Math.sin(a) * d)), Math.round(F.y(Math.cos(a) * d, cy + Math.sin(a) * d)), m(k === 0 ? 'k.sSpark' : 'k.sRim'), k === 0 ? 3 : 4, g0 + 3);
  }
  // Two lime gems either side of the disc.
  if (s >= 0.8) for (const k of [-1, 1]) r.fill(F.circ(S2(5.1 * k), S2(3.8), Math.max(0.6, S2(0.75))), m('k.sLime'), { group: g0 + 3, bevel: S2(0.5) });
  if (glint > -1 && glint < 1) {
    const x = S2(glint * 8);
    const band = F.poly([x - S2(0.8), S2(-7.5), x + S2(0.6), S2(-7.5), x + S2(2.4), S2(8), x + S2(1), S2(8)]);
    r.fill(intersect(plate, subtract(band, F.circ(0, cy, R))), m('k.sSpark'), { group: g0 + 4, flat: 3, noLine: true });
  }
}

/** The title floating at the shoulder, its disc spinning, a shine crossing it now and then. */
const spinnerCore: ProjArt = {
  frames: 8,
  outline: true,
  draw(r, t, f, h) {
    const glint = [-1, -1, -1, -1, -0.6, -0.1, 0.4, 0.9][f];
    spinner(r, new Xf(t.ox, t.oy, 0, 1, 1), 0.6, -f * (Math.PI / 4), glint, (k) => h(SM[k]), 1);
  },
};

const spinnerTitle: SkinArt = {
  mats: { ...SPIN, plume: S.lime(undefined), plumeTip: S.mark() },
  glow: [0xe0ffb0, 0x66c21c],
  icon(r, t, m) {
    spinner(r, new Xf(t.x(0, -0.6), t.y(0, -0.6), 0, 1, 1), 1, 0, -0.35, m, 1);
  },
  // The title rides at his shoulder instead of a feather in his hair.
  plume() {},
  proj: { core: spinnerCore },
  revive: 'NEVER GIVE UP!',
};

// -----------------------------------------------------------------------------
// Cenation Cap (duelist's band)
// -----------------------------------------------------------------------------

function cap(): SkinArt {
  // A lime fitted cap worn forward: six panels seamed to a button on top, a flat black brim stitched in lime,
  // the logo patch on the front panel, the snapback strap showing at the back.
  return {
    head: () => ({
      mats: {
        'h.cap': material(S.lime()), 'h.seam': material({ base: LIME[1], ramp: LIME }), 'h.brim': material(S.ink()),
        'h.ink': material(S.ink(undefined)), 'h.print': material(S.white()), 'h.mark': material(S.mark()),
      },
      hair: true,
      draw(r, H, m, g) {
        const crown = hairCap(H, 2.9, 0.1, 1.05);
        r.fill(crown, m('h.cap'), { group: g, bevel: 2.4, local: H });
        // Panel seams down from the button.
        for (const [x, y] of [[3.6, 3.2], [-3.4, 1.8]]) {
          r.line(H.x(-0.2, 7.6), H.y(-0.2, 7.6), H.x(x * 0.6, 6.4), H.y(x * 0.6, 6.4), m('h.seam'), 1, g);
          r.line(H.x(x * 0.6, 6.4), H.y(x * 0.6, 6.4), H.x(x, y), H.y(x, y), m('h.seam'), 1, g);
        }
        r.fill(H.circ(-0.2, 7.9, 0.75), m('h.cap'), { group: g, bevel: 0.6 });
        // The logo patch on the front panel: black, a white mark and a lime one.
        r.fill(H.rect(4.4, 4.9, 1.45, 1.2, 0.4), m('h.ink'), { group: g, bevel: 0.5, noLine: true });
        r.line(H.x(3.5, 5.4), H.y(3.5, 5.4), H.x(5.2, 5.4), H.y(5.2, 5.4), m('h.print'), 3, g);
        r.dot(H.x(4.4, 4.3), H.y(4.4, 4.3), m('h.mark'), 3, g);
        // The snapback strap at the back.
        r.fill(H.ell(-6.3, 1.6, 0.7, 0.9), m('h.ink'), { group: g, flat: 1, noLine: true });
        // The brim, flat and stiff, curving down a touch at the front, stitched in lime.
        const brim = H.poly([4.6, 3.8, 8.6, 3.5, 11.4, 2.6, 12, 1.9, 11.4, 1.6, 8.6, 2.3, 4.6, 2.6]);
        r.fill(brim, m('h.brim'), { group: g + 1, bevel: 0.8 });
        for (const x of [6.6, 8.4, 10.2]) r.dot(H.x(x, 3.1 - (x - 6) * 0.12), H.y(x, 3.1 - (x - 6) * 0.12), m('h.seam'), 3, g + 1);
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Never Give Up Tee (leather jerkin)
// -----------------------------------------------------------------------------

function tee(): SkinArt {
  // A lime cotton tee, short sleeves, a ribbed crew neck, NEVER GIVE UP printed big in black across the
  // chest, the hem left out over the jorts, and dog tags on a ball chain swinging on the chest.
  return {
    mats: {
      'k.ceTee': S.lime(), 'k.ceRib': S.lime((x) => (wrap(x, 1) < 0.4 ? -1 : 0)), 'k.cePrint': S.ink(undefined),
      'k.ceStar': S.white(), 'k.ceTag': S.silver(sweep(6, 1.5, 1)), 'k.ceChain': S.silver(undefined),
    },
    chest: {
      torso: 'k.ceTee', sleeve: 'k.ceTee', sleeveLen: 0.6, forearm: null, hands: 'skin', pauldron: null,
      trim: null, belt: 'k.ceTee', cape: null, hood: null, spikes: null, skirt: 0, noScarf: true,
      over(r, T, m, c) {
        const b = c.body, top = c.top, fx = b.chestPush * 0.7, front = fx + b.chestW, s = c.sway * 1.2;
        // The hem hangs out over the hips: a stitched line round its foot.
        r.line(T.x(-b.hipW - 0.4, -1.3), T.y(-b.hipW - 0.4, -1.3), T.x(b.hipW + 1.3, -1.7), T.y(b.hipW + 1.3, -1.7), m('k.ceRib'), 1, c.g);
        // The ribbed crew neck.
        const cx = fx * 0.5 + 0.5;
        const neck = subtract(T.ell(cx, top + 0.2, 3.1, 1.9), T.ell(cx + 0.1, top + 0.9, 2.3, 1.5));
        r.fill(intersect(neck, T.rect(cx, top - 0.4, 4, 1.6)), m('k.ceRib'), { group: c.g, bevel: 0.6, noLine: true });
        // NEVER GIVE UP across the chest: three rows of black block letters, the middle one biggest.
        const px = fx + b.chestW * 0.15;
        const rows: [number, number, number, number][] = [[top - 3.6, 4, 0.55, 0.9], [top - 5.1, 5, 0.8, 1.05], [top - 6.6, 2, 0.55, 0.9]];
        for (const [y, n, hh, w] of rows) {
          for (let i = 0; i < n; i++) {
            const x = px - (n - 1) * w * 0.55 + i * w * 1.1;
            if (x > front - 0.6) continue;
            r.fill(T.rect(x, y, w * 0.42, hh), m('k.cePrint'), { group: c.g, flat: 1, noLine: true });
          }
        }
        // A little white star by the last word.
        r.dot(T.x(px + 1.6, top - 6.6), T.y(px + 1.6, top - 6.6), m('k.ceStar'), 3, c.g);
        // Dog tags on a ball chain from the neck, swinging a little behind the motion.
        const ax = cx - 1.6, ay = top + 0.4, bx = cx + 2.2, by = top + 0.3;
        const tx = cx + 1.2 - s, ty = top - 4.4;
        chainLine(r, T.x(ax, ay), T.y(ax, ay), T.x(ax + 0.6 - s * 0.5, ty + 0.6), T.y(ax + 0.6 - s * 0.5, ty + 0.6), T.x(tx, ty + 1.2), T.y(tx, ty + 1.2), m('k.ceChain'), c.g + 1);
        chainLine(r, T.x(bx, by), T.y(bx, by), T.x(bx - 0.2 - s * 0.5, ty + 1.4), T.y(bx - 0.2 - s * 0.5, ty + 1.4), T.x(tx, ty + 1.2), T.y(tx, ty + 1.2), m('k.ceChain'), c.g + 1);
        r.fill(T.rect(tx + 0.5, ty - 0.5, 0.75, 1.1, 0.35), m('k.ceTag'), { group: c.g + 2, bevel: 0.6, local: T });
        r.fill(T.rect(tx, ty - 0.1, 0.75, 1.1, 0.35), m('k.ceTag'), { group: c.g + 3, bevel: 0.6, local: T });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Cena's Jorts (leather leggings)
// -----------------------------------------------------------------------------

function jorts(): SkinArt {
  // Long, baggy denim shorts to the middle of the calf: stonewashed twill, the outseam stitched in copper
  // thread, a back pocket with a copper rivet, fade whiskers at the hip, and a wide double-stitched hem.
  return {
    mats: {
      'l.ceDenim': S.denim(), 'l.ceFade': { base: DENIM[3], ramp: DENIM }, 'l.ceThread': S.thread(),
      'l.ceRivet': S.copper(), 'l.ceDark': { base: DENIM[1], ramp: DENIM },
    },
    legs: {
      mat: 'l.ceDenim', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.45,
      over(r, t, m, c) {
        const L = c.len, w = c.w;
        // The outseam, stitched in copper.
        r.line(t.x(L * 0.12, -0.2), t.y(L * 0.12, -0.2), t.x(L * 0.95, 0.1), t.y(L * 0.95, 0.1), m('l.ceFade'), c.far ? 1 : 2, c.g);
        if (c.far) return;
        // Fade whiskers at the front of the hip.
        for (const [x, y] of [[0.84, 0.55], [0.74, 0.6]]) r.line(t.x(L * x, w * y), t.y(L * x, w * y), t.x(L * x - 1.6, w * y + 0.5), t.y(L * x - 1.6, w * y + 0.5), m('l.ceFade'), 3, c.g);
        // The back pocket, stitched, a rivet at its corner.
        const pocket = t.poly([L * 0.98, -w * 0.25, L * 0.98, -w * 0.95, L * 0.7, -w * 0.9, L * 0.66, -w * 0.4]);
        r.fill(pocket, m('l.ceDenim'), { group: c.g, bevel: 0.8, toneBias: c.bias, noLine: true });
        r.line(t.x(L * 0.66, -w * 0.4), t.y(L * 0.66, -w * 0.4), t.x(L * 0.7, -w * 0.9), t.y(L * 0.7, -w * 0.9), m('l.ceThread'), 2, c.g);
        r.line(t.x(L * 0.66, -w * 0.4), t.y(L * 0.66, -w * 0.4), t.x(L * 0.98, -w * 0.25), t.y(L * 0.98, -w * 0.25), m('l.ceThread'), 2, c.g);
        r.dot(t.x(L * 0.95, -w * 0.3), t.y(L * 0.95, -w * 0.3), m('l.ceRivet'), 3, c.g);
      },
      shin(r, shin, _foot, m, c) {
        const L = c.len, b = c.body, top = c.top;
        const hem = L * 0.64;
        // Bare calf from the hem down to the socks.
        if (hem > top) r.fill(shin.cap(top - 0.3, 0, hem, 0, b.shinR + 0.05, b.shinR + 0.25), m('skin'), { group: c.g, bevel: 2, toneBias: c.bias });
        // The baggy leg of the jorts, then its wide hem.
        const above = shin.rect((hem + L + 6) / 2, 0, (L + 6 - hem) / 2, 8);
        r.fill(intersect(shin.cap(hem, 0, L, 0, b.shinR + 1.05, b.kneeR + 0.55), above), m('l.ceDenim'), { group: c.g, bevel: 2.2, toneBias: c.bias });
        r.fill(intersect(shin.cap(hem, 0, hem + 1.4, 0, b.shinR + 1.25, b.shinR + 1.15), above), m('l.ceDenim'), { group: c.g, bevel: 1.2, toneBias: c.bias + 1 });
        // The outseam carries on down to the hem.
        r.line(shin.x(L - 0.6, -0.2), shin.y(L - 0.6, -0.2), shin.x(hem + 1.5, -0.1), shin.y(hem + 1.5, -0.1), m('l.ceFade'), c.far ? 1 : 2, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Cenation High-Tops (leather boots)
// -----------------------------------------------------------------------------

function highTops(): SkinArt {
  // Lime high-top sneakers on chunky white soles, a black stripe swept down the side, white laces up the
  // front, a black padded collar, white crew socks above, and a reflective lime tab at the heel.
  return {
    mats: {
      'k.cebShoe': S.lime(undefined), 'k.cebSole': S.white(ridges), 'k.cebInk': S.ink(), 'k.cebLace': S.white(),
      'k.cebSock': S.white((x) => (wrap(x, 0.9) < 0.35 ? -1 : 0)), 'k.cebGlow': S.mark(),
    },
    boots: {
      mat: 'k.cebShoe', height: 0.34, bulk: 0.5, trim: 'k.cebInk', wing: null, knee: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias }, w = c.w, b = c.body;
        // White crew socks above the collar.
        r.fill(shin.rect(c.top + 0.5, 0, 0.75, b.shinR + 0.3, 0.3), m('k.cebSock'), { ...o, bevel: 1.2 });
        // The chunky white sole and a white toe bumper.
        r.fill(foot.cap(-1.9, -1.5, c.toe + 0.5, -1.35, 0.9), m('k.cebSole'), { ...o, bevel: 0.6, local: foot });
        r.fill(foot.ell(c.toe - 0.4, -0.7, 1.1, 0.8), m('k.cebSole'), { ...o, bevel: 0.6 });
        if (c.far) return;
        // The black stripe sweeping from the heel up toward the laces.
        r.fill(foot.poly([-1.2, -0.5, c.toe - 1.6, -0.2, c.toe - 2.4, 0.8, -0.8, 1.6]), m('k.cebInk'), { ...o, flat: 1, noLine: true });
        // Laces up the front of the ankle.
        for (let x = 0.9, i = 0; x < c.top - 0.8; x += 1.2, i++) {
          r.line(shin.x(x, w - 0.5), shin.y(x, w - 0.5), shin.x(x + 0.9, w + 0.05), shin.y(x + 0.9, w + 0.05), m('k.cebLace'), 3, c.g);
        }
        // The reflective tab at the back of the collar.
        r.dot(shin.x(c.top - 0.9, -w + 0.2), shin.y(c.top - 0.9, -w + 0.2), m('k.cebGlow'), 3, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = {
  lime: css(LIME[3]), limeDk: css(LIME[1]), ink: css(INK[1]), white: css(WHITE1), hand: css(0xeaffd2), crease: css(0xa8e080),
};

/** An eighth note at (x, y), its head at the bottom left. */
function note(g: CanvasRenderingContext2D, x: number, y: number, col: string): void {
  g.fillStyle = col;
  g.fillRect(x, y, 2, 1); g.fillRect(x + 1, y - 3, 1, 3); g.fillRect(x + 2, y - 2, 1, 1);
}

/** The "You can't see me" hand waving in front of the face at (x, y) (bottom of the wristband), `k` 0..1. */
function waveHand(g: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  const a = k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 1;
  const dx = Math.round(Math.sin(k * Math.PI * 6) * 3);
  const hx = x + dx;
  g.globalAlpha = 0.9 * a;
  // Wristband.
  g.fillStyle = AC.lime; g.fillRect(hx - 2, y - 2, 6, 2);
  g.fillStyle = AC.ink; g.fillRect(hx - 2, y - 2, 6, 1);
  // Palm, fingers and thumb.
  g.fillStyle = AC.hand;
  g.fillRect(hx - 2, y - 6, 6, 4);
  for (const [i, h] of [[0, 3], [1, 4], [2, 4], [3, 3]]) g.fillRect(hx - 2 + i + (i > 1 ? 1 : 0), y - 6 - h, 1, h);
  g.fillRect(hx - 3, y - 5, 1, 2); g.fillRect(hx - 4, y - 6, 1, 1);
  g.fillStyle = AC.crease; g.fillRect(hx, y - 5, 2, 1);
  // Wave marks off the fingertips, on the side it's swinging away from.
  const s = Math.cos(k * Math.PI * 6) > 0 ? -1 : 1;
  g.globalAlpha = 0.7 * a;
  g.fillStyle = AC.white;
  const ex = s < 0 ? hx - 5 : hx + 6;
  g.fillRect(ex, y - 10, 1, 2); g.fillRect(ex + s, y - 7, 1, 2);
}

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function champAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer, facing = 1): void {
  const back = layer === 'back';
  // A ring at the feet in lime and black, its dashes running round like the lights on a ring apron.
  const run = Math.floor(t * 9);
  g.globalAlpha = back ? 0.6 : 0.85;
  ring(g, x, y, 15, 3.8, 44, layer, (g, px, py, i) => {
    const k = (i + run) % 4;
    if (k === 3) return;
    g.fillStyle = k === 0 ? AC.white : k === 1 ? AC.lime : AC.limeDk;
    g.fillRect(px, py, 1, 1);
  });
  // The fanfare: notes rising off the shoulders and drifting away.
  for (let k = 0; k < 4; k++) {
    if ((k % 2 === 0) !== back) continue;
    const life = 2.6, w = ((t + k * 0.65) % life) / life;
    const side = k < 2 ? -1 : 1;
    const px = Math.round(x + side * (7 + w * 9) + Math.sin(t * 3 + k) * 1.5), py = Math.round(y - 40 - w * 20);
    g.globalAlpha = Math.min(1, (1 - w) * 3, w * 8) * (back ? 0.7 : 0.95);
    note(g, px, py, k % 2 ? AC.lime : AC.white);
  }
  // You can't see me: the hand waves in front of his face, a shimmer of haze running up beside him.
  const k = seeMe(t);
  if (k >= 0) {
    const a = k < 0.2 ? k / 0.2 : k > 0.8 ? (1 - k) / 0.2 : 1;
    g.fillStyle = AC.white;
    for (let c = 0; c < 6; c++) {
      const side = c % 2 ? 1 : -1;
      if ((side < 0) !== back) continue;
      const px = Math.round(x + side * (6 + (c >> 1) * 3) + Math.sin(t * 9 + c) * 1);
      for (let j = 0; j < 7; j++) {
        if ((j + Math.floor(t * 18) + c) % 3 === 0) continue;
        g.globalAlpha = 0.28 * a;
        g.fillRect(px, Math.round(y - 6 - j * 7 - ((t * 30 + c * 5) % 7)), 1, 3);
      }
    }
    if (!back) waveHand(g, x + facing * 4, y - 41, k);
  }
  g.globalAlpha = 1;
}

export const CHAMP: Record<string, SkinArt> = {
  'spirit_wraps.champ': { weapon: wristbands, proj: { palm: cantSeeMe }, ...FX },
  'war_horn.champ': { weapon: trumpet, ...FX },
  'phoenix_feather.champ': spinnerTitle,
  'duelist_band.champ': cap(),
  'leather_jerkin.champ': tee(),
  'leather_leggings.champ': jorts(),
  'leather_boots.champ': highTops(),
};
