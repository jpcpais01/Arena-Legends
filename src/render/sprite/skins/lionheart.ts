import { css } from '../../pixel/color';
import { material, type Raster, type Tex } from '../../pixel/raster';
import { intersect, union, type Shape } from '../../pixel/sdf';
import { ring, type Layer } from '../../auraKit';
import { hairCap } from '../draw';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, glow, mats, plain, wrap } from './kit';
import type { MaterialSpec } from '../../pixel/raster';

/**
 * Epic set: Lionheart. A paladin king's white steel and gold, lion crests and
 * royal blue, sunlight blazing at every edge. White plate whose rims catch
 * the sun in a running glint, gold lions on the blade's guard, the shield,
 * the helm's crest and the sigil, royal blue enamel, velvet and a sash of the
 * order, gold suns on the cops, and sunstones (the night accents) set in the
 * lions' eyes, the hilt, the brow and the knees.
 */

/** White steel: bright plate with cool blue-grey shadows so the white keeps its form. */
const STEEL = [0x56607a, 0x8a96ae, 0xc4ccdc, 0xe8edf6, 0xffffff];
/** Royal gold: deep and warm, white-hot where the sun strikes. */
const GOLD = [0x6e3e12, 0xb07020, 0xe4aa38, 0xffd66a, 0xfff4c4];
/** A lion's mane: tawny gold, a shade darker and redder than the plate's gold so the face reads inside it. */
const MANE = [0x5a2a0c, 0x96521a, 0xcc8428, 0xf0b448, 0xffe08a];
/** A lion's face: pale sunlit gold, lighter than the mane around it. */
const FACE = [0x9a6418, 0xdca240, 0xf8d27a, 0xfff0b8, 0xffffff];
/** Royal blue: enamel and velvet. */
const BLUE = [0x0e1446, 0x1a2a7c, 0x2a46b2, 0x4870da, 0x8aa8f4];
/** Sunstone (self-lit): amber to white-hot. */
const SUN = [0xa85010, 0xf4a83a, 0xffd25e, 0xfff0b0, 0xffffff];
const WHITE = 0xffffff, INK = 0x1c1420, RED = 0xc8242a;

/** Sunlight running along an edge: a bright band sliding one step per frame. */
const blaze = (period = 10, speed = 2.5, w = 1.1): Tex => (x, y, ph) => (wrap(x * 0.8 + y * 0.45 - ph * speed, period) < w ? 1 : 0);
/** A sunstone swelling and dimming over the loop. */
const breathe: Tex = (_x, _y, ph) => [0, 1, 0, -1][ph % 4];
/** A mane's locks: strands radiating from the frame origin. */
const locks: Tex = (x, y) => (wrap(Math.atan2(y, x) * 2.6 + Math.hypot(x, y) * 0.35, 1) < 0.3 ? -1 : 0);
/** Velvet: a soft nap with a few folds. */
const velvet: Tex = (x, y) => (wrap(x * 0.55 + Math.sin(y * 0.7) * 0.6, 2.6) < 0.5 ? -1 : 0);
const S = {
  steel: (tex: Tex = blaze()): MaterialSpec => ({ base: STEEL[2], ramp: STEEL, shiny: true, step: 0.15, tex }),
  gold: (tex: Tex = blaze(8, 2, 1)): MaterialSpec => ({ base: GOLD[2], ramp: GOLD, shiny: true, step: 0.15, tex }),
  mane: (): MaterialSpec => ({ base: MANE[2], ramp: MANE, shiny: true, tex: locks }),
  face: (): MaterialSpec => ({ base: FACE[2], ramp: FACE, shiny: true, step: 0.15 }),
  blue: (tex?: Tex): MaterialSpec => ({ base: BLUE[2], ramp: BLUE, shiny: true, step: 0.14, tex }),
  velvet: (): MaterialSpec => ({ base: BLUE[2], ramp: BLUE, tex: velvet }),
  sun: (tex: Tex = breathe): MaterialSpec => ({ base: SUN[2], ramp: SUN, glow: true, tex }),
  ink: (): MaterialSpec => plain(INK),
};

const FX = epicFx(0xfff4c0, 0xf0b030, 'twinkle', 0xfffae0);

/** Particles the full set sheds in battle. */
export const LIONHEART_FX: SkinFx = { spark: 0xfff4c0, spark2: 0xf0b030, kind: 'twinkle' };

// -----------------------------------------------------------------------------
// Shared shapes
// -----------------------------------------------------------------------------

/** A star polygon: `n` points between radii `ro` and `ri`, turned by `a0` (stays round in squashed frames). */
function star(F: Xf, cx: number, cy: number, ro: number, ri: number, n: number, a0 = 0): Shape {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = a0 + (i / (n * 2)) * Math.PI * 2, rr = i % 2 ? ri : ro;
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  return F.poly(pts);
}

/** A frame at local (x, y) of P, same orientation and handedness (for textures centred on a part). */
const at = (P: Xf, x: number, y: number) => new Xf(P.x(x, y), P.y(x, y), P.ang, P.sx, P.sy);

/**
 * A lion's face seen from the front, centred at (x, y) of F, `s` its scale (1 = a 4.6 unit mane):
 * a spiked mane, the face, two eyes of sunstone and a dark muzzle. Mats: mane, face, eye, ink.
 */
function lionMask(r: Raster, F: Xf, x: number, y: number, s: number, mane: number, face: number, eye: number, ink: number, g: number, bias = 0, lit = 0): void {
  r.fill(star(F, x, y + 0.2 * s, 4.6 * s, 3.5 * s, 11, Math.PI / 2), mane, { group: g, bevel: 1.2 * s, toneBias: bias, lightBias: lit, local: at(F, x, y) });
  // Face: a broad brow narrowing to the muzzle, with two small ears.
  const face0 = F.poly([
    x - 2.6 * s, y + 1.6 * s, x - 1.6 * s, y + 2.7 * s, x + 1.6 * s, y + 2.7 * s, x + 2.6 * s, y + 1.6 * s,
    x + 2.2 * s, y - 0.6 * s, x + 1.2 * s, y - 2.6 * s, x - 1.2 * s, y - 2.6 * s, x - 2.2 * s, y - 0.6 * s,
  ]);
  r.fill(union(face0, F.circ(x - 2.2 * s, y + 2.6 * s, 0.8 * s), F.circ(x + 2.2 * s, y + 2.6 * s, 0.8 * s)), face, { group: g + 1, bevel: 1 * s, toneBias: bias, lightBias: lit });
  // Muzzle pad and nose.
  r.fill(F.ell(x, y - 1.5 * s, 1.3 * s, 0.95 * s), face, { group: g + 1, bevel: 0.8 * s, toneBias: bias + 1 });
  r.fill(F.poly([x - 0.75 * s, y - 0.5 * s, x + 0.75 * s, y - 0.5 * s, x, y - 1.3 * s]), ink, { group: g + 1, noLine: true });
  // Eyes: sunstone, under a heavy brow.
  for (const k of [-1, 1]) {
    if (s >= 0.8) {
      r.fill(F.ell(x + k * 1.15 * s, y + 0.7 * s, 0.75 * s, 0.5 * s), ink, { group: g + 1, noLine: true });
      r.fill(F.ell(x + k * 1.15 * s, y + 0.75 * s, 0.4 * s, 0.3 * s), eye, { group: g + 1, noLine: true });
    } else r.dot(F.x(x + k * 1.15 * s, y + 0.7 * s), F.y(x + k * 1.15 * s, y + 0.7 * s), ink, 0, g + 1);
  }
  if (s > 0.9) r.line(F.x(x - 2 * s, y + 1.45 * s), F.y(x - 2 * s, y + 1.45 * s), F.x(x + 2 * s, y + 1.45 * s), F.y(x + 2 * s, y + 1.45 * s), face, 1, g + 1);
}

// -----------------------------------------------------------------------------
// Pride of the Lion
// -----------------------------------------------------------------------------

function prideOfTheLion(): WeaponArt {
  // A broad white-steel blade issuing from a roaring gold lion's jaws, its mane the guard, quillons
  // sweeping toward the point; a royal blue fuller etched with a sun, edges that blaze in the light,
  // a blue grip bound in gold wire and a sun-disc pommel holding a sunstone.
  return {
    tip: 31,
    mats: {
      blade: material({ base: STEEL[3], ramp: STEEL, shiny: true, step: 0.15, tex: (x, y, ph) => (Math.abs(y) > 1.05 ? 1 : wrap(x - ph * 6.5, 26) < 2.2 ? 1 : 0) }),
      fuller: material(S.blue((x) => (wrap(x, 3) < 0.5 ? 1 : 0))),
      gold: material(S.gold()),
      mane: material(S.mane()),
      face: material(S.face()),
      grip: material({ base: BLUE[2], ramp: BLUE, tex: (x) => (wrap(x, 1.3) < 0.4 ? -1 : 0) }),
      wire: material(S.gold(undefined)),
      sun: material(S.sun()),
      ink: material(S.ink()),
      spark: material({ base: WHITE, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4, L = o.local;
      // Grip with gold wire, the sun-disc pommel.
      fillAll(r, [t.cap(-5.2, 0, -1, 0, 1.15, 1.05)], m('grip'), o, 1);
      for (const x of [-4.4, -3.1, -1.8]) r.line(t.x(x - 0.3, -0.9), t.y(x - 0.3, -0.9), t.x(x + 0.3, 0.9), t.y(x + 0.3, 0.9), m('wire'), 3, g);
      fillAll(r, [star(t, -6.9, 0, 2.6, 1.75, 8, Math.PI / 8)], m('gold'), o, 1);
      r.fill(t.circ(-6.9, 0, 1.05), m('sun'), { group: g, local: L });
      // The blade: broad, a gentle taper to a strong point.
      fillAll(r, [t.poly([2.2, -2, 25.4, -1.7, 28.6, -1.05, 31, 0, 28.6, 1.05, 25.4, 1.7, 2.2, 2])], m('blade'), o, 1.4);
      // Blue enamel fuller, gold-edged, a sun at its root.
      r.fill(t.poly([4.6, -0.55, 20.5, -0.42, 22.6, 0, 20.5, 0.42, 4.6, 0.55]), m('fuller'), { group: g, bevel: 0.5, toneBias: o.toneBias, local: L });
      r.fill(t.circ(4.9, 0, 1.2), m('gold'), { group: g, bevel: 0.6, toneBias: o.toneBias, local: L });
      r.dot(t.x(4.9, 0), t.y(4.9, 0), m('sun'), 3, g);
      // Quillons sweeping toward the point, curling at the ends.
      for (const s of [-1, 1]) {
        fillAll(r, [t.cap(0.4, s * 2.4, 1.5, s * 5.2, 0.8, 0.55), t.cap(1.5, s * 5.2, 2.9, s * 5.8, 0.55, 0.4)], m('gold'), o, 0.7);
        r.dot(t.x(3.1, s * 5.8), t.y(3.1, s * 5.8), m('sun'), 3, g);
      }
      // A lion's mask on the guard, facing out, its mane the guard's heart, the blade rising from its crown.
      const flip = Math.sign(t.sx * t.sy) || 1;
      const F = new Xf(t.x(0.6, 0), t.y(0.6, 0), t.ang - (Math.PI / 2) * flip, Math.abs(t.sx), Math.abs(t.sy) * flip);
      lionMask(r, F, 0, 0, 0.82, m('mane'), m('face'), m('sun'), m('ink'), 46, o.toneBias ?? 0);
      // Sunlight running off the point.
      if (ph === 2) r.dot(t.x(31.6, 0), t.y(31.6, 0), m('spark'), 3, g);
      if (ph === 3) {
        r.dot(t.x(32.2, 0), t.y(32.2, 0), m('spark'), 3, g);
        r.dot(t.x(30.4, 1.4), t.y(30.4, 1.4), m('spark'), 3, g);
        r.dot(t.x(30.4, -1.4), t.y(30.4, -1.4), m('spark'), 3, g);
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Lion Rampant Pavise
// -----------------------------------------------------------------------------

/** The lion rampant, in (u, v) with v up the shield and u toward the way it faces. */
function lionRampant(P: (u: number, v: number) => [number, number], t: Xf) {
  const cap = (a: number, b: number, c: number, d: number, ra: number, rb = ra) => {
    const [x0, y0] = P(a, b), [x1, y1] = P(c, d);
    return t.cap(x0, y0, x1, y1, ra, rb);
  };
  const circ = (u: number, v: number, rr: number) => { const [x, y] = P(u, v); return t.circ(x, y, rr); };
  const body = union(
    cap(-0.4, -3.6, 0.9, 2.2, 1.9, 2.2),
    // Forelegs clawing the air.
    cap(1.6, 2.4, 3.8, 3.4, 0.8, 0.6), cap(3.8, 3.4, 4.5, 4.8, 0.6, 0.5),
    cap(1.6, 0.9, 3.7, 0.5, 0.75, 0.55), cap(3.7, 0.5, 4.7, 1.6, 0.55, 0.45),
    // Hind legs: one planted, one raised.
    cap(-0.6, -3.4, 0.5, -6.6, 1.5, 0.85), cap(0.5, -6.6, -0.4, -9.2, 0.8, 0.6), cap(-0.4, -9.4, 1.4, -9.8, 0.6, 0.5),
    cap(0.2, -3, 2.4, -5.2, 1.1, 0.7), cap(2.4, -5.2, 2.8, -7.4, 0.65, 0.5), cap(2.8, -7.6, 3.9, -7.2, 0.5, 0.45),
    // Tail curling up behind the back.
    cap(-1.6, -3.4, -3.2, -1.6, 0.5, 0.45), cap(-3.2, -1.6, -3.6, 1.4, 0.45, 0.4), cap(-3.6, 1.4, -2.8, 3.4, 0.4, 0.35),
    // Head.
    circ(1.9, 5.2, 1.6), cap(2.4, 4.9, 3.8, 4.7, 0.95, 0.8),
  );
  const mane = union(circ(1.1, 4.5, 2.6), cap(0.2, 3.6, -0.6, 1.6, 1.6, 1), circ(-2.7, 3.9, 1));
  return { body, mane };
}

function lionRampantPavise(): WeaponArt {
  // A tower shield of royal blue enamel in a white-steel rim edged with gold, a gold lion rampant on the field
  // (langued red), a sun blazing over its head, sunstones at the corners and rays of gold fanning off the top.
  return {
    tip: 14,
    mats: {
      rim: material(S.steel()),
      field: material({ base: BLUE[2], ramp: BLUE, step: 0.12 }),
      border: material(S.gold()),
      lion: material(S.gold(blaze(12, 3, 1.4))),
      mane: material(S.mane()),
      ray: material(S.gold(undefined)),
      sun: material(S.sun()),
      tongue: material(plain(RED)),
      ink: material(S.ink()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4, L = o.local;
      // Rays fanning off the arched top, lengthening in turn (−x is up the shield).
      for (let k = -2; k <= 2; k++) {
        const len = 1.6 + ((k + 2 + ph) % 4 === 0 ? 1.2 : 0) + (k === 0 ? 1 : Math.abs(k) === 1 ? 0.4 : 0);
        const y = k * 2.6, x0 = -14.6 + Math.abs(k) * 0.35;
        fillAll(r, [t.poly([x0 + 0.6, y - 0.7, x0 - len, y + k * 0.25, x0 + 0.6, y + 0.7])], m('ray'), o, 0.5);
      }
      // Rim, gold border, the blue field.
      const outer = t.poly([-13.4, -6.8, -14.6, -3.4, -15, 0, -14.6, 3.4, -13.4, 6.8, 13.6, 7.2, 14.6, 6.4, 14.6, -6.4, 13.6, -7.2]);
      fillAll(r, [outer], m('rim'), o, 2.2);
      const inset = (d: number) => t.poly([-12.4 + d, -5.8 + d, -13.4 + d, -2.9, -13.7 + d, 0, -13.4 + d, 2.9, -12.4 + d, 5.8 - d, 13.2 - d, 6 - d, 13.2 - d, -6 + d]);
      r.fill(inset(0), m('border'), { group: g, bevel: 0.8, toneBias: o.toneBias, noLine: true, local: L });
      r.fill(inset(0.8), m('field'), { group: g, bevel: 3, toneBias: o.toneBias, noLine: true, local: L });
      // The lion rampant facing +y, head toward the top (−x).
      const P = (u: number, v: number): [number, number] => [-v + 0.6, u - 0.6];
      const { body, mane } = lionRampant(P, t);
      r.fill(body, m('lion'), { group: 40, bevel: 0.8, toneBias: o.toneBias, local: L });
      r.fill(mane, m('mane'), { group: 41, bevel: 0.8, toneBias: o.toneBias, local: at(t, ...P(1.1, 4.5)) });
      const pt = (u: number, v: number, k: string, tone: number, gg = 41) => { const [x, y] = P(u, v); r.dot(t.x(x, y), t.y(x, y), m(k), tone, gg); };
      pt(2.2, 5.6, 'ink', 0);
      pt(4.2, 4.3, 'tongue', 2, 40);
      pt(4.9, 4.7, 'tongue', 2, 40);
      // A sun over the lion's head, rays turning.
      const [sx, sy] = P(-2.6, 9.4);
      r.fill(t.circ(sx, sy, 1.3), m('sun'), { group: 42, local: L });
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + (ph % 2) * (Math.PI / 8), rr = k % 2 ? 2.2 : 2.6;
        r.dot(t.x(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr), t.y(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr), m('ray'), 3, 42);
      }
      // Sunstones at the corners of the rim, gold studs between.
      for (const [x, y] of [[-11.8, -5.6], [-11.8, 5.6], [12.6, -6.1], [12.6, 6.1]]) r.dot(t.x(x, y), t.y(x, y), m('sun'), 3, g);
      for (const x of [-5, 0.5, 6]) for (const y of [-6.6, 6.6]) r.dot(t.x(x, y), t.y(x, y), m('border'), 4, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Lionheart Sigil
// -----------------------------------------------------------------------------

const SG = mats({
  'k.gold': S.gold(undefined),
  'k.mane': S.mane(),
  'k.face': S.face(),
  'k.blue': S.blue(),
  'k.ray': S.gold(undefined),
  'k.rayHot': glow(0xfff2b8),
  'k.eye': S.sun(),
  'k.eyeHot': glow(WHITE),
  'k.ink': S.ink(),
});

/** The sigil in battle, placed pixel by pixel (13 px): gold rim, blue enamel ring, the mane, the face. */
const SIGIL_MAP = [
  '....ggggg....',
  '..ggbbbbbgg..',
  '.gbbMNMNMbbg.',
  '.gbMMNMNMMbg.',
  'gbMNfHHHfNMbg',
  'gbMMHEHEHMMbg',
  'gbMNHkkkHNMbg',
  'gbMMfWkWfMMbg',
  'gbmMMfWfMMmbg',
  '.gbmMMfMMmbg.',
  '.gbbmmMmmbbg.',
  '..ggbbbbbgg..',
  '....ggggg....',
];
/** Each letter: a material and the tone of its ramp (the rim and ring lit from the top left). */
const SIGIL_INK: Record<string, [keyof typeof SG, number]> = {
  g: ['k.gold', 2], b: ['k.blue', 2], M: ['k.mane', 2], N: ['k.mane', 3], m: ['k.mane', 1],
  H: ['k.face', 3], f: ['k.face', 1], W: ['k.face', 4], E: ['k.eye', 0], k: ['k.ink', 0],
};

/** The sigil's tone for a map letter at (x, y): the rim and ring lit from the top left, the face flaring when lit. */
function sigilTone(ch: string, x: number, y: number, lit: boolean): [keyof typeof SG, number] {
  let [k, tone] = SIGIL_INK[ch];
  if (ch === 'g' || ch === 'b') tone += x + y < 10 ? 1 : x + y > 15 ? -1 : 0;
  if (lit && (ch === 'H' || ch === 'M' || ch === 'N')) tone = Math.min(4, tone + 1);
  if (lit && ch === 'E') { k = 'k.eyeHot'; tone = 3; }
  return [k, tone];
}

/** The icon: a gold lion's face filling a blue enamel ring in a gold rim, sunrays all round. */
function sigilIcon(r: Raster, t: Xf, m: (k: string) => number): void {
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6 + Math.PI / 12, long = k % 2 === 0;
    const r0 = 9, r1 = long ? 13.6 : 12, w = long ? 1.5 : 1.1;
    const c = Math.cos(a), sn = Math.sin(a);
    r.fill(t.poly([c * r0 - sn * w, sn * r0 + c * w, c * r1, sn * r1, c * r0 + sn * w, sn * r0 - c * w]), m('k.ray'), { group: 1, bevel: 0.6, lightBias: 0.4 });
  }
  r.fill(t.circ(0, 0, 10.6), m('k.gold'), { group: 2, bevel: 1.2, lightBias: 0.5 });
  r.fill(t.circ(0, 0, 9), m('k.blue'), { group: 2, bevel: 1, lightBias: 0.3, noLine: true });
  r.fill(t.circ(0, -0.3, 7.6), m('k.mane'), { group: 2, bevel: 1.6, local: t });
  lionMask(r, t, 0, -0.4, 1.75, m('k.mane'), m('k.face'), m('k.eye'), m('k.ink'), 4, 0, 0.2);
}

const sigilProj: ProjArt = {
  frames: 8,
  outline: true,
  draw(r, t, f, h) {
    const lit = f >= 4, m = (k: keyof typeof SG) => h(SG[k]);
    // Sunrays turning round the rim: long and short in turn, a sixteenth of a turn per frame.
    const turn = (f & 3) * (Math.PI / 16);
    for (let k = 0; k < 8; k++) {
      const a = turn + (k * Math.PI) / 4, long = k % 2 === 0;
      const r1 = (long ? 9.4 : 8.2) + (lit ? 1.2 : 0);
      for (let d = 7.2; d <= r1; d += 0.9) {
        const hot = lit && d > r1 - 1.6;
        r.dot(Math.round(t.ox + Math.cos(a) * d), Math.round(t.oy - Math.sin(a) * d), m(hot ? 'k.rayHot' : 'k.ray'), d > r1 - 1 ? 4 : 3, 1);
      }
    }
    for (let y = 0; y < SIGIL_MAP.length; y++) {
      const row = SIGIL_MAP[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        const [k, tone] = sigilTone(ch, x, y, lit);
        r.dot(t.ox + x - 6, t.oy + y - 6, m(k), tone, 2);
      }
    }
  },
};

const sigilSkin: SkinArt = {
  mats: {
    'k.gold': S.gold(undefined), 'k.mane': S.mane(), 'k.face': S.face(), 'k.blue': S.blue(),
    'k.ray': S.gold(undefined), 'k.rayHot': glow(0xfff2b8), 'k.eye': S.sun(), 'k.eyeHot': glow(WHITE), 'k.ink': S.ink(),
  },
  glow: [0xfff4c0, 0xf0a830],
  icon(r, t, m) {
    sigilIcon(r, t, m);
  },
  proj: { ward: sigilProj },
};

// -----------------------------------------------------------------------------
// Lion-Crested Helm
// -----------------------------------------------------------------------------

function lionCrestedHelm(): SkinArt {
  // A white-steel great helm with a gold brow band and nasal, a sunstone at the brow, royal blue mantling
  // lined with gold streaming behind, and for a crest a roaring gold lion's head on a twisted blue and gold torse.
  return {
    head: () => ({
      mats: {
        'h.steel': material(S.steel(blaze(9, 2.2, 1))), 'h.gold': material(S.gold()), 'h.mane': material(S.mane()),
        'h.face': material(S.face()), 'h.tongue': material(plain(RED)), 'h.blue': material(S.velvet()), 'h.lining': material(S.gold(undefined)),
        'h.sun': material(S.sun()), 'h.ink': material(S.ink()),
      },
      draw(r, H, m, g, sway) {
        const ph = r.phase % 4, s = sway * 1.5, rip = [0, 0.45, 0.75, 0.4][ph];
        // Mantling: blue velvet cut into dags, gold lining showing at the edges, streaming back.
        const mant = (d: number) => H.poly([
          0.6, 8.2, -3.6, 8.6 + d, -7.6 - s * 0.3, 7 + d, -10.6 - s - rip, 3.6, -11.4 - s - rip, -1.2 - d, -9.8 - s - rip * 0.6, 0.2,
          -10 - s - rip * 0.7, -3.6 - d, -8.2 - s * 0.6 - rip * 0.4, -1.6, -7.4 - s * 0.5, -4.2 - d, -5.8 - s * 0.3, -0.8, -3.6, 1.2,
        ]);
        r.fill(mant(0.5), m('h.lining'), { group: 48, bevel: 0.8, local: H });
        r.fill(mant(0), m('h.blue'), { group: 49, bevel: 1.6, softLight: true, local: H });
        // The dome (cut above the eyes), a gold ridge over it, the brow band, a cheek guard behind the eye.
        const dome = hairCap(H, 2.3, -3.4, 1.45);
        r.fill(dome, m('h.steel'), { group: g, bevel: 3, local: H });
        r.fill(intersect(dome, H.rect(0, 3.1, 9, 0.7)), m('h.gold'), { group: g, flat: 2, noLine: true, local: H });
        r.line(H.x(5.2, 5.4), H.y(5.2, 5.4), H.x(-1.4, 8.4), H.y(-1.4, 8.4), m('h.gold'), 3, g);
        r.fill(H.poly([-1.4, 2.6, 0.9, 2.6, 1, -0.4, 0.4, -3.2, -1.2, -3.4, -1.8, -0.6]), m('h.steel'), { group: g, bevel: 1.2, local: H });
        r.line(H.x(0.9, 2.4), H.y(0.9, 2.4), H.x(0.4, -3.1), H.y(0.4, -3.1), m('h.gold'), 3, g);
        r.dot(H.x(-0.3, 0.2), H.y(-0.3, 0.2), m('h.gold'), 4, g);
        // Gold nasal down the front, a sunstone at the brow.
        r.fill(H.rect(6.3, 1.5, 0.5, 1.6), m('h.gold'), { group: g, bevel: 0.6 });
        r.fill(H.poly([5.5, 3.1, 6.3, 4.2, 7.1, 3.1, 6.3, 2]), m('h.sun'), { group: g });
        // The torse: a twisted wreath of blue and gold at the crest's foot.
        for (let i = 0; i < 6; i++) {
          const x = -2.6 + i * 1.1, y = 8 + Math.sin((x + 0.4) * 0.5) * 0.3;
          r.fill(H.circ(x, y, 0.8), m(i % 2 ? 'h.blue' : 'h.gold'), { group: 50, bevel: 0.6, local: H });
        }
        // The crest: a lion's head in profile roaring forward, a great mane flaring back like sun flames.
        const cx = 0, cy = 11.6;
        const mane: number[] = [];
        const tufts: [number, number][] = [[1.6, 3.4], [-0.6, 4.6], [-2.8, 4.2], [-4.6, 3.4], [-6.4 - s * 0.4, 2.2], [-5.2, 0.8], [-7 - s * 0.5, -0.4], [-5, -1.4], [-6 - s * 0.4, -3], [-3.2, -2.6], [-2.6, -4.2], [-0.6, -3.2], [0.8, -3.8]];
        const dents: [number, number][] = [[0.4, 2.6], [-1.8, 3], [-3.6, 2.4], [-4.6, 1.4], [-4.4, 0.2], [-4.6, -1], [-4, -1.8], [-2.8, -1.8], [-1.6, -2.6], [-0.2, -2.4]];
        tufts.forEach(([x, y], i) => { mane.push(cx + x, cy + y + (i % 3 === 1 ? rip * 0.2 : 0)); if (dents[i]) mane.push(cx + dents[i][0], cy + dents[i][1]); });
        r.fill(H.poly(mane), m('h.mane'), { group: 51, bevel: 1.2, local: at(H, cx - 1.6, cy) });
        // Face, brow and muzzle, the jaws open.
        r.fill(union(
          H.poly([cx - 0.8, cy + 2.4, cx + 1.8, cy + 2.6, cx + 3.6, cy + 1.8, cx + 5.4, cy + 1, cx + 5.8, cy + 0.2, cx + 5.4, cy - 0.4, cx + 3, cy - 0.4, cx + 1, cy - 1.6, cx - 0.8, cy - 1]),
          H.poly([cx + 1.4, cy - 1.2, cx + 4.6, cy - 1.4, cx + 4.2, cy - 2.4, cx + 1.6, cy - 2.8]),
        ), m('h.face'), { group: 52, bevel: 1, local: H });
        r.fill(H.poly([cx + 2.6, cy - 0.5, cx + 5.4, cy - 0.5, cx + 4.8, cy - 1.3, cx + 3, cy - 1.2]), m('h.ink'), { group: 52, noLine: true });
        r.dot(H.x(cx + 4.7, cy - 0.9), H.y(cx + 4.7, cy - 0.9), m('h.tongue'), 2, 52);
        r.dot(H.x(cx + 5.6, cy + 0.6), H.y(cx + 5.6, cy + 0.6), m('h.ink'), 0, 52);
        r.line(H.x(cx + 1.6, cy + 2.2), H.y(cx + 1.6, cy + 2.2), H.x(cx + 3.6, cy + 1.6), H.y(cx + 3.6, cy + 1.6), m('h.mane'), 1, 52);
        r.dot(H.x(cx + 2.8, cy + 1.2), H.y(cx + 2.8, cy + 1.2), m('h.sun'), [3, 4, 3, 2][ph], 52);
        r.dot(H.x(cx - 0.2, cy + 2.4), H.y(cx - 0.2, cy + 2.4), m('h.mane'), 2, 52);
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Lionheart Plate
// -----------------------------------------------------------------------------

/** Plate materials, shared by name with the sabatons (armour materials share one namespace). */
const K = {
  gold: S.gold(), steel: S.steel(), sun: S.sun(), ink: S.ink(),
};

function lionheartPlate(): SkinArt {
  // White steel plate edged in gold that catches the sun, gold gauntlets, pauldrons of white steel lames
  // with gold sun bosses, a royal blue sash of the order across the breast pinned with a sun brooch,
  // and a long royal blue cape with a gold hem.
  return {
    mats: {
      plate: { base: STEEL[2], ramp: STEEL, shiny: true, step: 0.15, tex: blaze(11, 2.75, 1) }, plateDark: S.gold(undefined),
      'k.gold': K.gold, 'k.steel': K.steel, 'k.sun': K.sun,
      'k.cape': S.velvet(), 'k.sash': S.blue((x) => (wrap(x, 2.4) < 0.4 ? -1 : 0)),
    },
    chest: {
      pauldron: null, noScarf: true, trim: 'plateDark',
      back(r, T, m, c) {
        // The cape, a gold band along the hem, trailing the motion.
        const s = c.sway * 3, top = c.top, ph = r.phase % 4, fl = [0, 0.4, 0.7, 0.4][ph];
        const cape = T.poly([
          -0.4, top + 1, -6, top - 0.4, -9.8 - s, -5, -11.8 - s * 1.3 - fl, -13.2,
          -8.6 - s * 1.2, -13.8 + fl * 0.4, -5.2 - s, -13.4, -2.2 - s * 0.6, -12.6 + fl * 0.3, -1, -2,
        ]);
        r.fill(cape, m('k.cape'), { group: c.g, bevel: 3, toneBias: -1, softLight: true, local: T });
        r.fill(intersect(cape, T.poly([-14 - s * 1.4, -11.8, -0.6, -11.2, -0.6, -16, -14 - s * 1.4, -16])), m('k.gold'), { group: c.g, bevel: 0.6, toneBias: -1, noLine: true, local: T });
      },
      shoulder(r, S2, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        // Two lames of white steel, gold-rimmed, then a lion's mask on the cop.
        r.fill(S2.ell(0, -1.8, 3.2, 1.5), m('k.steel'), { ...o, bevel: 1, local: S2 });
        r.line(S2.x(-3, -2.6), S2.y(-3, -2.6), S2.x(3, -2.6), S2.y(3, -2.6), m('k.gold'), 3, c.g);
        r.fill(S2.ell(0, 0.6, 3.5, 2.6), m('k.steel'), { ...o, bevel: 1.6, local: S2 });
        r.fill(intersect(S2.ell(0, 0.6, 3.5, 2.6), S2.rect(0, -1.6, 4, 0.5)), m('k.gold'), { ...o, flat: 3, noLine: true });
        // A gold sun boss on the cop, its sunstone heart.
        r.fill(star(S2, 0.5, 0.8, 1.9, 1.1, 8, Math.PI / 8), m('k.gold'), { ...o, bevel: 0.6 });
        r.dot(S2.x(0.5, 0.8), S2.y(0.5, 0.8), m('k.sun'), 3, c.g);
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top;
        // The sash from the near shoulder down across the breast to the far hip, gold at its edges.
        const x0 = b.chestPush * 0.6 - 1.6;
        const sash = T.poly([x0 - 0.8, top - 0.2, x0 + 0.9, top + 0.2, x0 + 4.2, 2.6, x0 + 3.8, 1, x0 + 2.4, 1.2]);
        r.fill(sash, m('k.sash'), { group: c.g, bevel: 0.7, local: T });
        r.line(T.x(x0 + 0.9, top + 0.1), T.y(x0 + 0.9, top + 0.1), T.x(x0 + 4.2, 2.6), T.y(x0 + 4.2, 2.6), m('k.gold'), 3, c.g);
        // The sun-lion brooch on the breast.
        const bx = b.chestPush * 0.7 + 1.2, by = top - 4.2;
        r.fill(star(T, bx, by, 2.2, 1.4, 8, Math.PI / 8), m('k.gold'), { group: c.g, bevel: 0.7 });
        r.fill(T.circ(bx, by, 0.95), m('k.sun'), { group: c.g });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Lionheart Cuisses
// -----------------------------------------------------------------------------

function lionheartCuisses(): SkinArt {
  // White-steel mail under a cuisse of white plate rimmed in gold, two royal blue enamel tassets hanging from
  // the belt, and a gold sun on each knee with a sunstone at its heart.
  return {
    mats: {
      chain: { base: STEEL[3], ramp: STEEL, shiny: true, step: 0.14, tex: (x, y) => (wrap(Math.floor(x + y), 2) === 0 ? -1 : 0) },
      chainDark: S.gold(undefined), chainPlate: S.steel(),
      'l.plate': S.steel(), 'l.gold': S.gold(), 'l.blue': S.blue(blaze(9, 2, 1)), 'l.sun': S.sun(),
    },
    legs: {
      mat: 'chain', trim: null, knee: 'chainPlate', tasset: null, rune: null, wraps: null, bulk: 0.3,
      over(r, t, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w, L = c.len;
        // The cuisse: white plate over the front of the thigh, gold along its lower edge.
        const plate = t.poly([L * 0.66, -w * 0.4, L * 0.66, w + 0.5, L * 0.14, w + 0.7, L * 0.1, -w * 0.2], 0.4);
        r.fill(plate, m('l.plate'), { ...o, bevel: 1.2, local: t });
        r.line(t.x(L * 0.14, w + 0.5), t.y(L * 0.14, w + 0.5), t.x(L * 0.1, -w * 0.2), t.y(L * 0.1, -w * 0.2), m('l.gold'), 3, c.g);
        // Two tassets of blue enamel, gold-rimmed, swinging a little.
        const sw = [0, 0.2, 0.35, 0.2][ph];
        for (const [i, [y0, y1]] of [[L + 0.8, L * 0.66], [L * 0.7, L * 0.42]].entries()) {
          const tas = t.poly([y0, -w * 0.2, y0, w + 1.1 + i * 0.1, y1 - sw, w + 1.4, y1 - sw * 0.6, -w * 0.1]);
          r.fill(tas, m('l.blue'), { group: c.g + i, bevel: 0.9, toneBias: c.bias, local: t });
          r.fill(intersect(tas, t.rect(y1 - sw, 0, 0.75, w + 3)), m('l.gold'), { group: c.g + i, flat: 3, noLine: true });
        }
        // A gold sun on the knee cop, a sunstone at its heart.
        const kr = c.body.kneeR;
        r.fill(star(t, 0, kr * 0.35, 1.7, 0.95, 8, ph * (Math.PI / 32)), m('l.gold'), { group: c.far ? 25 : 27, bevel: 0.5, toneBias: c.bias });
        r.dot(t.x(0, kr * 0.35), t.y(0, kr * 0.35), m('l.sun'), 3, c.far ? 25 : 27);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Lionheart Sabatons
// -----------------------------------------------------------------------------

function lionheartSabatons(): SkinArt {
  // White-steel greaves with a gold ridge and gold cuffs, sabatons ending in a lion's paw with gold claws,
  // a sunstone at the instep and a knight's gold rowel spur at the heel that turns as he moves.
  return {
    mats: {
      greave: S.steel(), greaveDark: S.gold(undefined),
      'k.gold': K.gold, 'k.sun': K.sun, 'k.steel': K.steel, 'k.ink': K.ink,
    },
    boots: {
      wing: null, height: 0.95,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w;
        // Gold ridge down the front of the greave and a gold cuff at the top.
        r.fill(shin.cap(1.6, w * 0.8, c.top - 0.8, w * 0.8, 0.42), m('k.gold'), { ...o, bevel: 0.5 });
        r.fill(shin.rect(c.top - 0.4, 0, 0.6, w + 0.6, 0.2), m('k.gold'), { ...o, bevel: 0.6 });
        // The lion's paw: overlapping toe lames, gold claws curling over the tip.
        r.fill(foot.cap(c.toe - 2.4, -0.1, c.toe - 0.4, -0.5, 1.2, 1), m('k.steel'), { ...o, bevel: 0.8, local: foot });
        for (const [dx, dy] of [[0.3, -0.2], [-0.5, 0.5]] as const) {
          r.fill(foot.poly([c.toe - 1 + dx, dy + 0.5, c.toe + 0.9 + dx, dy - 0.3, c.toe + 0.1 + dx, dy - 1.2]), m('k.gold'), { ...o, bevel: 0.4 });
        }
        r.dot(shin.x(1.2, w * 0.3), shin.y(1.2, w * 0.3), m('k.sun'), 3, c.g);
        if (c.far) return;
        // The rowel spur at the heel: a gold star on a short neck, turning.
        const hx = 0.9, hy = -w - 0.6;
        r.line(shin.x(hx, -w + 0.2), shin.y(hx, -w + 0.2), shin.x(hx - 0.3, hy - 0.6), shin.y(hx - 0.3, hy - 0.6), m('k.gold'), 3, c.g);
        r.fill(star(shin, hx - 0.4, hy - 1.3, 1.5, 0.55, 5, ph * (Math.PI / 10)), m('k.gold'), { group: 32, bevel: 0.4, toneBias: c.bias });
        r.dot(shin.x(hx - 0.4, hy - 1.3), shin.y(hx - 0.4, hy - 1.3), m('k.sun'), 3, 32);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = {
  gold: css(GOLD[3]), sun: css(0xfff0b0), white: css(WHITE), blue: css(BLUE[3]),
};

let auraRun = 0, auraBeat = 0;
const blueDot = (g: CanvasRenderingContext2D, px: number, py: number) => { g.fillStyle = AC.blue; g.fillRect(px, py, 1, 1); };
const goldDot = (g: CanvasRenderingContext2D, px: number, py: number, i: number) => {
  g.fillStyle = i === auraRun || i === (auraRun + 18) % 36 ? AC.white : (i + auraBeat) % 9 === 0 ? AC.sun : AC.gold;
  g.fillRect(px, py, 1, 1);
};

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function lionheartAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  const RX = 13, RY = 3.4;
  // A royal blue ring inside a gold one: a sun disc laid on the ground, two white glints running round the gold.
  auraRun = Math.floor(t * 9) % 36;
  auraBeat = Math.floor(t * 3);
  g.globalAlpha = 0.6;
  ring(g, x, y, RX - 2.6, RY - 1, 26, layer, blueDot);
  g.globalAlpha = 0.75 + 0.2 * Math.sin(t * 2.2);
  ring(g, x, y, RX, RY, 36, layer, goldDot);
  // Sunrays on the ground, turning slowly: dashes running outward from the ring, long and short in turn,
  // each swelling and fading on its own beat.
  const turn = t * 0.3;
  for (let k = 0; k < 8; k++) {
    const a = turn + (k / 8) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const long = k % 2 === 0, v = 0.5 + 0.5 * Math.sin(t * 2.6 + k * 1.9);
    const n = long ? 4 : 3;
    for (let j = 0; j < n; j++) {
      const u = 1.14 + j * 0.11;
      g.globalAlpha = (0.45 + 0.5 * v) * (1 - j / (n + 0.5));
      g.fillStyle = j === 0 ? AC.white : long ? AC.sun : AC.gold;
      g.fillRect(Math.round(x + c * RX * u), Math.round(y + s * RY * u), 1, 1);
    }
  }
  // Motes of sunlight rising and flaring, some behind the fighter, some in front.
  for (let k = 0; k < 6; k++) {
    if ((k % 2 === 0) !== (layer === 'back')) continue;
    const u = (t * 0.32 + k * 0.17) % 1;
    const side = [-1, 1, 1, -1, -1, 1][k];
    const px = Math.round(x + side * (5 + ((k * 5) % 9)) + Math.sin(t * 1.6 + k) * 1.5), py = Math.round(y - 2 - u * 30);
    const a = Math.min(1, (1 - u) * 3, u * 10);
    g.globalAlpha = a;
    g.fillStyle = AC.sun;
    g.fillRect(px, py, 1, 1);
    // Every so often a mote flares into a small cross of light.
    if (Math.sin(t * 4 + k * 2.3) > 0.6) {
      g.globalAlpha = a * 0.65;
      g.fillStyle = AC.gold;
      g.fillRect(px - 1, py, 1, 1); g.fillRect(px + 1, py, 1, 1); g.fillRect(px, py - 1, 1, 1); g.fillRect(px, py + 1, 1, 1);
    }
  }
  g.globalAlpha = 1;
}

export const LIONHEART: Record<string, SkinArt> = {
  'longsword.lionheart': { weapon: prideOfTheLion, ...FX },
  'tower_shield.lionheart': { weapon: lionRampantPavise, ...FX },
  'ward_stone.lionheart': sigilSkin,
  'iron_helm.lionheart': lionCrestedHelm(),
  'plate_armor.lionheart': lionheartPlate(),
  'chain_leggings.lionheart': lionheartCuisses(),
  'iron_greaves.lionheart': lionheartSabatons(),
};
