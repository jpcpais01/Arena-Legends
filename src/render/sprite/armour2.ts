import type { MaterialSpec, Raster, Tex } from '../pixel/raster';
import { intersect, subtract, union, type Shape } from '../pixel/sdf';
import { hash } from '../pixel/tex';
import type { GearId } from '../../sim/types';
import type { BodySpec } from './body';
import { hairCap } from './draw';
import type { BootsLook, ChestLook, LegsLook } from './look';
import type { HeadDraw } from './skins/heads';
import { glow, plain, shiny, wrap } from './skins/kit';
import type { Xf } from './xform';

/**
 * Stock looks for the second wave of armour (4 per slot). Each piece brings
 * its own materials (prefixed by a short piece name) and draws through the
 * same hooks the armour skins use. Night accents follow the item's rarity:
 * common and rare pieces only catch a glint, epic ones get a couple of small
 * self-lit spots, legendary ones up to three, never the whole silhouette.
 */

export interface StockHead {
  draw: HeadDraw;
  /** Covers the hair (and what grows on a hairless head). */
  hair: boolean;
  /** Covers the face (the eyes are drawn by the headgear, if at all). */
  face: boolean;
  /** Ears: all hidden (hood, great helm), side ones hidden (helmet), or all shown. */
  ears: 'all' | 'side' | null;
}

export interface StockArmour {
  mats: Record<string, MaterialSpec>;
  head?: StockHead;
  chest?: Partial<ChestLook>;
  legs?: Partial<LegsLook>;
  boots?: Partial<BootsLook>;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const ramp = (base: number, r: number[], o: Partial<MaterialSpec> = {}): MaterialSpec => ({ base, ramp: r, ...o });

/** A tapering chain of capsules through [x, y, radius] points. */
function chain(F: Xf, pts: number[][]): Shape {
  const s: Shape[] = [];
  for (let i = 1; i < pts.length; i++) s.push(F.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i - 1][2], pts[i][2]));
  return union(...s);
}

/** Line in a local frame. */
const ln = (r: Raster, F: Xf, ax: number, ay: number, bx: number, by: number, mat: number, tone: number, g: number) =>
  r.line(F.x(ax, ay), F.y(ax, ay), F.x(bx, by), F.y(bx, by), mat, tone, g);
const dt = (r: Raster, F: Xf, x: number, y: number, mat: number, tone: number, g: number) => r.dot(F.x(x, y), F.y(x, y), mat, tone, g);

/** The torso's main volumes (as drawn by the figure), for clipping bands and seams to it. */
function torsoBody(T: Xf, b: BodySpec, top: number): Shape {
  return union(
    T.ell(0.3, 0.6, b.hipW, 3.6),
    T.ell(0.5, top * 0.46, b.waistW, top * 0.28),
    T.ell(b.chestPush * 0.7, top - 3.4, b.chestW, 5.4),
  );
}

/** A lumpy roll (fur, moss) from (ax, ay) to (bx, by). */
function roll(F: Xf, ax: number, ay: number, bx: number, by: number, rad: number, n: number): Shape {
  const parts: Shape[] = [F.cap(ax, ay, bx, by, rad * 0.85)];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    parts.push(F.circ(ax + (bx - ax) * u, ay + (by - ay) * u, rad * (i % 2 ? 1.08 : 0.9)));
  }
  return union(...parts);
}

/** A small leaf at (x, y) pointing along angle `a`. */
function leaf(F: Xf, x: number, y: number, a: number, len: number, w: number): Shape {
  const c = Math.cos(a), s = Math.sin(a);
  const p = (u: number, v: number) => [x + c * u - s * v, y + s * u + c * v];
  return F.poly([...p(0, 0), ...p(len * 0.4, w), ...p(len, 0), ...p(len * 0.4, -w)]);
}

// Overlay groups (contours between overlapping plates).
const GA = 60;

// -----------------------------------------------------------------------------
// Head
// -----------------------------------------------------------------------------

/** Seer's Blindfold: a pale cloth band over the eyes, a painted third eye, ribbon ends streaming back. */
const seerBlindfold: StockArmour = {
  mats: {
    'seer.cloth': ramp(0xe4dcf2, [0x6e6290, 0x9c90bc, 0xc8bee0, 0xe8e2f6, 0xfaf8ff], { tex: (x, y) => (wrap(y * 1.4 - x * 0.15, 2.2) < 0.45 ? -1 : 0) }),
    'seer.tail': ramp(0xc8bee0, [0x5a4e7a, 0x8a7eac, 0xb4a8d4, 0xd8d0ee, 0xf4f0ff]),
    'seer.paint': shiny(0xe8b848, undefined, 0.16),
    'seer.eye': glow(0xc89aff),
    'seer.gem': glow(0x9ad8ff),
  },
  head: {
    hair: false, face: false, ears: null,
    draw(r, H, m, g, sway) {
      const s = sway * 2.2, ph = r.phase % 4, fl = [0, 0.5, 0.8, 0.4][ph];
      // Ribbon ends behind the head: the far one higher and darker, both forked at the tip.
      r.fill(chain(H, [[-5.8, 1.2, 0.95], [-9.2 - s * 0.6, 2 - fl * 0.5, 0.9], [-12.6 - s, 0.8, 0.85], [-14.8 - s * 1.3, -1 + fl, 0.75]]), m('seer.tail'), { group: GA, bevel: 1, toneBias: -1 });
      r.fill(H.poly([-14 - s * 1.3, -0.2 + fl, -16.4 - s * 1.4, -0.4 + fl, -15.2 - s * 1.35, -1.4 + fl, -16.2 - s * 1.4, -2.6 + fl, -14 - s * 1.3, -1.8 + fl]), m('seer.tail'), { group: GA, bevel: 0.6, toneBias: -1 });
      r.fill(chain(H, [[-5.8, -0.4, 1.05], [-8.6 - s * 0.6, -2.8, 1], [-10.4 - s, -6 + fl * 0.6, 0.95], [-11 - s * 1.3, -9.4, 0.85]]), m('seer.tail'), { group: GA + 1, bevel: 1.2 });
      r.fill(H.poly([-10.2 - s * 1.3, -9, -10.6 - s * 1.3, -11.4, -11.2 - s * 1.3, -10, -12.2 - s * 1.3, -11, -11.8 - s * 1.3, -8.6]), m('seer.tail'), { group: GA + 1, bevel: 0.6 });
      // The band, hugging the head over the eyes, a fold along its middle.
      const band = intersect(H.ell(0.1, 0.5, 6.9, 6.8), H.poly([-9, 2.2, 9, 1.7, 9, -2.2, -9, -1.5]));
      r.fill(band, m('seer.cloth'), { group: g, bevel: 1.6, softLight: true });
      // The knot at the back of the head with its small blue gem.
      r.fill(union(H.ell(-6.1, 0.3, 1.5, 1.8), H.ell(-6.6, -0.6, 1.1, 1.2, 0.5)), m('seer.cloth'), { group: g, bevel: 1.1 });
      dt(r, H, -6, 0.4, m('seer.gem'), 3, g);
      // The third eye painted on the band: a gold almond, a violet pupil and a ray above and below.
      const ex = 3.2, ey = -0.1;
      r.fill(H.poly([ex - 2.3, ey, ex, ey + 1.5, ex + 2.3, ey, ex, ey - 1.5]), m('seer.paint'), { group: g, flat: 2, noLine: true });
      r.fill(H.poly([ex - 1.1, ey, ex, ey + 0.6, ex + 1.1, ey, ex, ey - 0.6]), m('seer.tail'), { group: g, flat: 1, noLine: true });
      dt(r, H, ex, ey, m('seer.eye'), 3, g);
      dt(r, H, ex + 0.1, ey + 1.6, m('seer.paint'), 4, g);
    },
  },
};

/** Dread Helm: a black iron great helm with bull horns curling forward, a slit visor burning red. */
const dreadHelm: StockArmour = {
  mats: {
    'dread.iron': ramp(0x4a4452, [0x16131c, 0x2a2532, 0x423c4a, 0x655e6e, 0xa49cb0], { shiny: true, tex: (x, y) => (hash(Math.floor(x * 1.2) + 3, Math.floor(y * 1.2)) < 0.05 ? -1 : 0) }),
    'dread.dark': ramp(0x2a2430, [0x0c0a10, 0x18141e, 0x2a2430, 0x3e3646, 0x6a6074], { shiny: true }),
    'dread.horn': ramp(0x6a5a52, [0x1e1618, 0x3a2c2c, 0x6a5a52, 0xa8988a, 0xe8dcc8], { shiny: true, tex: (x, y) => (wrap(x * 0.8 + y * 0.9, 1.7) < 0.45 ? -1 : 0) }),
    'dread.slit': plain(0x0a0608),
    'dread.eye': glow(0xff4a2a),
    'dread.rivet': shiny(0x9a92a8),
  },
  head: {
    hair: true, face: true, ears: 'all',
    draw(r, H, m, g) {
      // The far horn first, sweeping up and forward over the brow.
      r.fill(chain(H, [[2.4, 5.2, 1.3], [4.8, 6.6, 1.1], [6.6, 8.6, 0.85], [7.2, 11, 0.6], [6.6, 12.8, 0.3]]), m('dread.horn'), { group: GA, bevel: 1.2, toneBias: -1, local: H });
      // The bucket: a tall dome over the head, a flat faceplate jutting down to the chin.
      const helm = union(H.ell(-0.4, 1.2, 7.2, 7), H.poly([0.4, 6, 6.6, 4.4, 7.9, 1.4, 7.8, -4.4, 5.6, -7, -1, -7.2, -6.6, -5.6, -7.4, 0]));
      r.fill(helm, m('dread.iron'), { group: g, bevel: 3 });
      // A ridge over the crown down to the brow, and a dark brow band over the visor.
      r.fill(H.poly([-6.4, 5.4, -1.6, 8.4, 4.6, 6.2, 7.4, 2.8, 6.8, 2.2, 3.8, 5.2, -1.6, 7.2, -6.4, 4.4]), m('dread.dark'), { group: g, bevel: 1, noLine: true });
      r.fill(intersect(helm, H.poly([1, 2.6, 9, 2.4, 9, 1.4, 1, 1.6])), m('dread.dark'), { group: g, flat: 2, noLine: true });
      // The visor slit, with eyes burning in the dark behind it.
      ln(r, H, 1.2, 0.6, 7.6, 0.4, m('dread.slit'), 0, g);
      dt(r, H, 2.2, 0.6, m('dread.eye'), 3, g);
      dt(r, H, 5.4, 0.45, m('dread.eye'), 3, g);
      // Breathing holes down the faceplate and a rim of rivets round the bottom.
      for (const [x, y] of [[5.4, -2.8], [6.6, -2.8], [5.4, -4.2], [6.6, -4.2]] as const) dt(r, H, x, y, m('dread.slit'), 0, g);
      r.fill(intersect(helm, H.poly([-9, -5.6, 9, -3.6, 9, -4.6, -9, -6.6])), m('dread.dark'), { group: g, flat: 1, noLine: true });
      for (const [x, y] of [[-4.6, -4.6], [-1.4, -4.4], [2, -3.9]] as const) dt(r, H, x, y, m('dread.rivet'), 4, g);
      // The near horn: out from the side of the helm, back, then hooking up and forward.
      r.fill(chain(H, [[-0.8, 4, 1.8], [-3.8, 5.6, 1.55], [-5.8, 8.2, 1.25], [-5.4, 11.2, 0.95], [-3.6, 13.2, 0.6], [-1.4, 13.8, 0.25]]), m('dread.horn'), { group: GA + 1, bevel: 1.4, local: H });
      r.fill(H.circ(-0.8, 4, 1.7), m('dread.dark'), { group: GA + 1, bevel: 1 });
      dt(r, H, -0.7, 4.3, m('dread.rivet'), 4, GA + 1);
    },
  },
};

/** Hawkeye Hood: a green ranger hood with a hawk feather and a small brass eyepiece. */
const hawkeyeHood: StockArmour = {
  mats: {
    'hawk.hood': ramp(0x5a7a3e, [0x1e2e18, 0x34502a, 0x5a7a3e, 0x82a058, 0xb0c87a], { tex: (x, y) => (hash(Math.floor(x), Math.floor(y) + 11) < 0.06 ? -1 : 0) }),
    'hawk.rim': ramp(0x4a3a24, [0x1e140c, 0x34261a, 0x4e3c26, 0x6e563a, 0x947a56]),
    'hawk.feather': ramp(0x9a6a3a, [0x2e1a0e, 0x5a3820, 0x8e6034, 0xc89a62, 0xf0dcb4], { tex: (x, y) => (wrap(x * 0.9 - y * 0.8, 2) < 0.7 ? 1 : 0) }),
    'hawk.tip': ramp(0xf0e8d8, [0x8a8070, 0xb8ae9a, 0xe0d8c6, 0xf6f0e4, 0xffffff]),
    'hawk.brass': shiny(0xd8a840, undefined, 0.16),
    'hawk.lens': shiny(0xb8e8f0, undefined, 0.14),
  },
  head: {
    hair: true, face: false, ears: 'all',
    draw(r, H, m, g, sway) {
      const s = sway * 1.6;
      // The hood: round over the head, its point hanging back, the cloth falling over the neck.
      const outer = union(
        H.ell(-0.7, 1.4, 7.6, 7.4),
        H.poly([-7.4, 1.4, -7.2, -6.4, -1.2, -7.8, 2.4, -5.6]),
        H.poly([-3.8, 6.8, -8.2 - s, 4.4, -10.2 - s * 1.3, -0.6, -9.6 - s * 1.4, -3.4, -6.8, -1]),
      );
      const open = H.ell(4.7, -1.2, 4.1, 4.9);
      r.fill(subtract(outer, open), m('hawk.hood'), { group: g, bevel: 3, softLight: true });
      // The brim's shadow over the brow, and the rolled edge of the opening.
      r.fill(intersect(open, H.ell(4.4, 3.8, 4.6, 1.4)), m('hawk.hood'), { group: g, flat: 0, noLine: true });
      // The rolled edge of the opening, the hood's dark inside showing behind the cheek.
      const rim = intersect(subtract(H.ell(4.6, -1.0, 5.1, 5.9), open), outer);
      r.fill(rim, m('hawk.hood'), { group: g, bevel: 1.2, lightBias: 0.35 });
      r.fill(intersect(open, subtract(H.ell(4.7, -1.2, 4.1, 4.9), H.ell(5.3, -1.4, 3.6, 4.6))), m('hawk.rim'), { group: g, flat: 0, noLine: true });
      // A leather lace at the throat.
      ln(r, H, 0.6, -4.4, 1.8, -6, m('hawk.rim'), 1, g);
      // The hawk feather tucked into the side of the hood, barred brown and cream.
      const fa = 2.62 + s * 0.05;
      r.fill(leaf(H, -1.6, 4.6, fa, 9.6, 1.7), m('hawk.feather'), { group: GA, bevel: 1 });
      r.fill(leaf(H, -1.6 + Math.cos(fa) * 6.4, 4.6 + Math.sin(fa) * 6.4, fa, 3.2, 1.1), m('hawk.tip'), { group: GA, bevel: 0.6, noLine: true });
      ln(r, H, -1.4, 4.4, -1.6 + Math.cos(fa) * 8, 4.6 + Math.sin(fa) * 8, m('hawk.rim'), 2, GA);
      // The brass eyepiece round the near eye, its chain looping back to the hood.
      const ex = 1.9, ey = -0.6;
      r.fill(subtract(H.circ(ex, ey, 1.85), H.circ(ex, ey, 1.15)), m('hawk.brass'), { group: GA + 1, bevel: 0.8 });
      dt(r, H, ex + 0.6, ey + 0.8, m('hawk.lens'), 4, GA + 1);
      ln(r, H, ex - 1.4, ey - 1.4, -1.4, -3.4, m('hawk.brass'), 2, GA + 1);
    },
  },
};

/** Gladiator Helm: a bronze helm with a red horsehair crest, a brim and hinged cheek guards. */
const gladiatorHelm: StockArmour = {
  mats: {
    'glad.bronze': ramp(0xc8903a, [0x5a3414, 0x8a5a24, 0xc8903a, 0xe8bc64, 0xfff0b0], { shiny: true }),
    'glad.dark': ramp(0x8a5a24, [0x3a200c, 0x5a3414, 0x8a5a24, 0xb07a34, 0xd8a858], { shiny: true }),
    'glad.crest': ramp(0xc02a2a, [0x4a0c10, 0x7a1418, 0xb82428, 0xe04a40, 0xff8a6a], { tex: (x, y) => (wrap(x * 1.3 + y * 0.2, 1.5) < 0.5 ? -1 : 0) }),
  },
  head: {
    hair: true, face: false, ears: 'side',
    draw(r, H, m, g, sway) {
      const s = sway * 1.2;
      // The dome, a neck guard flaring at the back and a brim over the brow.
      const dome = hairCap(H, 1.8, -3, 1.35);
      r.fill(H.poly([-5.6, 2.6, -9.2 - s * 0.2, -2.6, -7.6, -3.6, -4.6, -0.6]), m('glad.bronze'), { group: g, bevel: 1.4, toneBias: -1 });
      r.fill(dome, m('glad.bronze'), { group: g, bevel: 3 });
      r.fill(intersect(dome, H.rect(0, 2.2, 9, 0.6)), m('glad.dark'), { group: g, flat: 2, noLine: true });
      r.fill(H.cap(4.4, 2.2, 7.6, 1.8, 0.55), m('glad.bronze'), { group: g, bevel: 0.6 });
      // Embossed ridge along the side of the dome.
      r.fill(intersect(dome, H.poly([-6, 3.6, 4, 4.4, 4, 3.8, -6, 3])), m('glad.dark'), { group: g, flat: 1, noLine: true });
      // The near cheek guard, hinged at the temple, curving down past the jaw.
      r.fill(H.poly([-1.6, 2.4, 0.8, 2.4, 0.9, -1.8, 2.6, -2.8, 2.4, -5.6, 0.2, -6, -1.8, -2.6]), m('glad.bronze'), { group: GA, bevel: 1.4 });
      dt(r, H, -0.4, 1.4, m('glad.dark'), 3, GA);
      dt(r, H, 1, -4, m('glad.bronze'), 4, GA);
      // The crest: a brush of red horsehair from brow to nape, on a bronze holder.
      // The crest: a brush of red horsehair standing on the dome from brow to nape, its tail lifting in the wind.
      const crest = intersect(
        subtract(union(H.ell(-1.4 - s * 0.4, 0.8, 9.4 + s * 0.3, 11.6), H.ell(-6 - s, 2.6, 4.6, 6.8, 0.5)), H.ell(-0.4, 0.9, 6.6, 6.6)),
        H.poly([5.4, 5.6, 5.4, 16, -14, 16, -14, 1.8, -8.2, 2.4]),
      );
      r.fill(crest, m('glad.crest'), { group: GA + 1, bevel: 1.6, local: H });
      r.fill(intersect(subtract(H.ell(-0.4, 0.9, 7.6, 7.6), H.ell(-0.4, 0.9, 6.9, 6.9)), H.poly([5.4, 5.6, 5.4, 16, -14, 16, -14, 1.8, -8.2, 2.4])), m('glad.dark'), { group: GA + 1, flat: 2, noLine: true });
    },
  },
};

// -----------------------------------------------------------------------------
// Chest
// -----------------------------------------------------------------------------

/** Juggernaut Plate: massive layered plate, huge three-lame pauldrons, rivets and chains. */
const STEEL = [0x262832, 0x484c5a, 0x767a8a, 0xa8aebe, 0xe8ecf6];
const juggernautPlate: StockArmour = {
  mats: {
    'jug.plate': ramp(STEEL[2], STEEL, { shiny: true, step: 0.15 }),
    'jug.dark': ramp(0x3a3a46, [0x121218, 0x22222c, 0x3a3a46, 0x545462, 0x8a8a98], { shiny: true }),
    'jug.chain': ramp(0x8a8a96, [0x2a2a32, 0x4e4e58, 0x8a8a96, 0xb4b4c0, 0xe8e8f4], { shiny: true }),
    'jug.rivet': ramp(0x9a9aa8, [0x2a2a32, 0x4e4e58, 0x7a7a88, 0xb8b8c6, 0xe8e8f4], { shiny: true }),
    'jug.ember': glow(0xffa040),
  },
  chest: {
    torso: 'jug.plate', sleeve: 'jug.plate', sleeveLen: 1, forearm: 'jug.plate', hands: 'jug.dark', pauldron: null,
    trim: null, belt: 'jug.dark',
    over(r, T, m, c) {
      const b = c.body, top = c.top, fx = b.chestPush * 0.7;
      const body = torsoBody(T, b, top);
      // Heavy tassets over the hips: two overlapping lames each side of the belt.
      r.fill(T.poly([-b.hipW - 0.6, 2, b.hipW + 1.4, 2, b.hipW + 2.2, -3, -b.hipW - 1, -2.6], 0.3), m('jug.plate'), { group: GA, bevel: 1.8 });
      r.fill(T.poly([-b.hipW - 0.4, -1.8, b.hipW + 2, -2, b.hipW + 2.6, -5.8, -b.hipW - 0.6, -5.2], 0.3), m('jug.plate'), { group: GA + 1, bevel: 1.6 });
      for (const y of [0, -3.8]) dt(r, T, b.hipW + 0.8, y, m('jug.rivet'), 3, y ? GA + 1 : GA);
      // Lames across the belly and a raised breastplate with a centre ridge.
      for (const y of [top * 0.28, top * 0.42]) r.fill(intersect(body, T.rect(1, y, 12, 0.5)), m('jug.dark'), { group: c.g, flat: 1, noLine: true });
      const chestPlate = T.poly([fx - 3, top - 0.6, fx + b.chestW + 0.6, top - 1.2, fx + b.chestW + 0.8, top * 0.56, fx + 1, top * 0.5, fx - 3.6, top * 0.6]);
      r.fill(intersect(body, chestPlate), m('jug.plate'), { group: GA + 2, bevel: 2.4, lightBias: 0.15 });
      r.fill(intersect(body, T.rect(fx + 2.6, top * 0.76, 0.35, top * 0.2)), m('jug.plate'), { group: GA + 2, flat: 4, noLine: true });
      // The gorget: a thick collar of plate up to the chin.
      r.fill(T.ell(0.4, top + 0.4, 4.4, 2.4, -0.1), m('jug.plate'), { group: GA + 3, bevel: 1.8 });
      r.fill(intersect(T.ell(0.4, top + 0.4, 4.4, 2.4, -0.1), T.rect(0, top - 0.6, 6, 0.4)), m('jug.dark'), { group: GA + 3, flat: 1, noLine: true });
      // A chain slung from the back shoulder across to the front hip, and an ember stud on the breast.
      const ax = -2.6, ay = top - 1.4, bx = b.waistW + 0.6, by = top * 0.3;
      const n = 8;
      for (let i = 0; i <= n; i++) {
        const u = i / n, x = ax + (bx - ax) * u, y = ay + (by - ay) * u - Math.sin(u * Math.PI) * 1.6;
        r.fill(T.ell(x, y, i % 2 ? 0.9 : 0.6, i % 2 ? 0.5 : 0.75, -0.6), m('jug.chain'), { group: GA + 4, bevel: 0.6 });
      }
      const sx = fx + 2.8, sy = top - 4.2;
      r.fill(T.circ(sx, sy, 1.3), m('jug.dark'), { group: GA + 5, bevel: 1 });
      dt(r, T, sx, sy, m('jug.ember'), 3, GA + 5);
    },
    shoulder(r, S, m, c) {
      const a = c.body.armR, o = { group: c.g, toneBias: c.bias };
      // Three lames stacked down the arm, then the great dome over them, a ridge and rivets.
      // A tall flange standing up off the top, guarding the neck.
      if (c.far) r.fill(S.poly([-a - 2.2, a + 0.6, -a - 1.4, a + 4.6, a + 0.4, a + 3.6, a + 1.4, a + 1.2], 0.3), m('jug.plate'), { ...o, bevel: 1, toneBias: c.bias - 1 });
      r.fill(S.ell(0.6, -4.6, a + 2.2, 1.5, -0.1), m('jug.plate'), { ...o, bevel: 1.2, toneBias: c.bias - 1 });
      r.fill(S.ell(0.3, -2.8, a + 2.9, 1.8, -0.08), m('jug.plate'), { ...o, bevel: 1.4 });
      r.fill(S.ell(-0.2, 0.4, a + 3.6, a + 2.4, -0.05), m('jug.plate'), { ...o, bevel: 2.4 });
      r.fill(intersect(S.ell(-0.2, 0.4, a + 3.6, a + 2.4, -0.05), S.poly([-9, -1.2, 9, -0.6, 9, -2.4, -9, -2.6])), m('jug.dark'), { ...o, flat: 1, noLine: true });
      r.fill(S.cap(-a - 2.6, 1.4, a + 2.8, 2.2, 0.5), m('jug.dark'), { ...o, bevel: 0.6 });
      if (!c.far) {
        for (const [x, y] of [[-a - 1.2, 0.4], [a + 2, 0.8]] as const) dt(r, S, x, y, m('jug.rivet'), 3, c.g);
        // A short length of chain hanging off the front of the pauldron.
        for (let i = 0; i < 3; i++) r.fill(S.ell(a + 2.4, -2.6 - i * 1.3, i % 2 ? 0.45 : 0.7, i % 2 ? 0.75 : 0.5), m('jug.chain'), { group: c.g, bevel: 0.5 });
      }
    },
  },
};

/** Heartwood Armor: bark plates grown together, moss and leaves, a green heart glowing in a knot of wood. */
const BARK = [0x2a1a10, 0x4a3020, 0x6e4a2e, 0x946a44, 0xc09a6a];
const barkTex: Tex = (x, y) => (wrap(x * 0.75 + Math.sin(y * 0.45) * 1.1, 2.6) < 0.7 ? -1 : 0);
const heartwoodArmor: StockArmour = {
  mats: {
    'hw.bark': ramp(BARK[2], BARK, { tex: barkTex }),
    'hw.plate': ramp(0x7a5434, [0x2e1c10, 0x52361e, 0x7a5434, 0xa47a4e, 0xd0aa78], { tex: barkTex }),
    'hw.moss': ramp(0x5a8a2e, [0x1e3a14, 0x34581e, 0x5a8a2e, 0x82b444, 0xb0d86a], { tex: (x, y) => (hash(Math.floor(x), Math.floor(y)) < 0.25 ? -1 : 0) }),
    'hw.leaf': ramp(0x6ac040, [0x1e4a1a, 0x2e7a28, 0x52a83a, 0x8ad058, 0xc8f08a], { shiny: true }),
    'hw.knot': ramp(0x4a2e1a, [0x1a0e08, 0x2e1c10, 0x4a2e1a, 0x6a4628, 0x8e6640]),
    'hw.heart': ramp(0x8aff6a, [0x2a8a3a, 0x4ac04a, 0x8aff6a, 0xc8ffa0, 0xf4fff0], { glow: true, tex: (_x, _y, ph) => [0, 1, 1, 0][ph % 4] }),
    'hw.bud': glow(0xd8ff9a),
  },
  chest: {
    torso: 'hw.bark', sleeve: 'hw.bark', sleeveLen: 0.5, forearm: 'hw.plate', hands: 'skin', pauldron: null,
    trim: null, belt: 'hw.knot',
    over(r, T, m, c) {
      const b = c.body, top = c.top, fx = b.chestPush * 0.7;
      const body = torsoBody(T, b, top);
      // Bark plates grown over the belly and the chest, each its own slab.
      r.fill(intersect(body, T.poly([-b.waistW - 1, top * 0.52, b.waistW + 2, top * 0.6, b.waistW + 2, 3.6, -b.waistW - 1, 3.4], 0.6)), m('hw.plate'), { group: GA, bevel: 1.8 });
      r.fill(intersect(body, T.poly([fx - 4, top + 0.4, fx + b.chestW + 1, top - 0.6, fx + b.chestW + 1, top * 0.54, fx - 1, top * 0.46, fx - 4.4, top * 0.62], 0.6)), m('hw.plate'), { group: GA + 1, bevel: 2.2 });
      // Moss along the top of the chest plate, and a hip tasset of bark.
      r.fill(intersect(body, roll(T, fx - 3.6, top + 0.2, fx + 3.6, top - 0.4, 1, 4)), m('hw.moss'), { group: GA + 2, bevel: 1, noLine: true });
      r.fill(T.poly([b.hipW - 1.6, 2.4, b.hipW + 1.8, 2.2, b.hipW + 2.2, -3.6, b.hipW - 0.6, -2.8], 0.4), m('hw.plate'), { group: GA + 3, bevel: 1.4 });
      // The heart-knot: a whorl of dark wood round a small green heart that pulses.
      const kx = fx + 2.4, ky = top - 4.8;
      r.fill(T.ell(kx, ky, 1.9, 1.7), m('hw.knot'), { group: GA + 4, bevel: 1.2 });
      r.fill(T.poly([kx - 0.9, ky + 0.5, kx, ky + 0.1, kx + 0.9, ky + 0.5, kx, ky - 0.9]), m('hw.heart'), { group: GA + 4 });
      // Leaves sprouting at the collar.
      r.fill(leaf(T, fx - 2.6, top + 0.6, 2.4, 2.6, 0.8), m('hw.leaf'), { group: GA + 5, bevel: 0.8 });
      r.fill(leaf(T, fx + 1.8, top, 0.9, 2.2, 0.7), m('hw.leaf'), { group: GA + 5, bevel: 0.8 });
    },
    shoulder(r, S, m, c) {
      const a = c.body.armR, o = { group: c.g, toneBias: c.bias };
      // A curved slab of bark over the shoulder, moss on top, a sprig of leaves with a glowing bud.
      r.fill(S.poly([-a - 2, 1.4, -a - 1.2, -2.8, 0.4, -3.6, a + 2, -2, a + 2.2, 1.8, 0, 3], 0.8), m('hw.plate'), { ...o, bevel: 1.8 });
      r.fill(roll(S, -a - 1.6, 1.8, a + 1.8, 2.2, 1.1, 4), m('hw.moss'), { ...o, bevel: 1 });
      if (!c.far) {
        r.fill(leaf(S, -0.4, 2.6, 1.9, 2.6, 0.8), m('hw.leaf'), { group: c.g, bevel: 0.7 });
        r.fill(leaf(S, 0.2, 2.6, 0.7, 2.2, 0.7), m('hw.leaf'), { group: c.g, bevel: 0.7 });
        dt(r, S, 0, 3.4, m('hw.bud'), 3, c.g);
      }
    },
  },
};

/** Shadow Garb: dark wrapped cloth, a long scarf, crossed straps holding small knives. */
const shadowGarb: StockArmour = {
  mats: {
    'sg.cloth': ramp(0x34324a, [0x0e0e18, 0x1c1a2a, 0x302e44, 0x48465e, 0x6a6884], { tex: (x, y) => (wrap(y - x * 0.55, 2.8) < 0.55 ? -1 : 0) }),
    'sg.wrap': ramp(0x3e3a50, [0x121220, 0x22202e, 0x3a3650, 0x585470, 0x7e7a96], { tex: (x, y) => (wrap(y * 1.1 + x * 0.6, 1.8) < 0.5 ? -1 : 0) }),
    'sg.scarf': ramp(0x6a2a4a, [0x220a18, 0x3e1428, 0x62223e, 0x8a3a5a, 0xb85a80]),
    'sg.strap': ramp(0x6a4a34, [0x221410, 0x3e2a1e, 0x62442e, 0x86624a, 0xa8866a]),
    'sg.blade': shiny(0xc8d0dc, undefined, 0.15),
    'sg.buckle': shiny(0x8a8a9a),
  },
  chest: {
    torso: 'sg.cloth', sleeve: 'sg.cloth', sleeveLen: 1, forearm: 'sg.wrap', hands: 'sg.wrap', pauldron: null,
    trim: null, belt: 'sg.strap', noScarf: true,
    back(r, T, m, c) {
      // The scarf's two long tails streaming back from the neck.
      const top = c.top + 0.8, s = c.sway * 3, ph = r.phase % 4, fl = [0, 0.4, 0.7, 0.3][ph];
      r.fill(chain(T, [[-1.5, top - 0.8, 1.2], [-5 - s * 0.5, top - 3 + fl * 0.4, 1.1], [-8 - s, top - 6.4, 1], [-9.4 - s * 1.3, top - 9.6 + fl, 0.8]]), m('sg.scarf'), { group: c.g, bevel: 1.2, toneBias: -1 });
      r.fill(chain(T, [[-1.5, top, 1.5], [-6 - s * 0.6, top - 0.8 + fl * 0.5, 1.35], [-10.6 - s, top - 2.4, 1.2], [-14.6 - s * 1.5, top - 4.2 + fl, 0.9]]), m('sg.scarf'), { group: c.g, bevel: 1.4 });
      r.fill(T.poly([-14 - s * 1.5, top - 3.2 + fl, -17 - s * 1.7, top - 3.8 + fl, -15 - s * 1.6, top - 4.8 + fl, -16 - s * 1.7, top - 6 + fl, -13.6 - s * 1.4, top - 5.4 + fl]), m('sg.scarf'), { group: c.g, bevel: 0.8 });
    },
    over(r, T, m, c) {
      const b = c.body, top = c.top, fx = b.chestPush * 0.7;
      const body = torsoBody(T, b, top);
      // A wide sash at the waist over the belt, its end tucked at the hip.
      r.fill(intersect(body, T.rect(0.5, 4.2, 12, 1.5)), m('sg.wrap'), { group: GA, bevel: 1.2, noLine: true });
      // Crossed straps over the chest, a buckle where they cross, small knives sheathed along the front one.
      r.fill(intersect(body, T.cap(-b.waistW, top - 0.6, b.waistW + 1, 4.6, 0.6)), m('sg.strap'), { group: GA + 1, bevel: 0.6 });
      r.fill(intersect(body, T.cap(fx + b.chestW - 0.6, top - 1.2, -b.waistW + 0.6, 4.8, 0.55)), m('sg.strap'), { group: GA + 1, bevel: 0.6, toneBias: -1 });
      const cx = fx + 0.4, cy = top * 0.55;
      r.fill(T.rect(cx, cy, 0.8, 0.8), m('sg.buckle'), { group: GA + 2, bevel: 0.6 });
      // Knives tucked in the strap: grips up and back, blades down along it.
      for (const [x, y] of [[fx + b.chestW - 1.6, top - 2.6], [fx + 2.2, top - 5.6]] as const) {
        r.fill(T.cap(x - 0.6, y + 1.2, x + 0.2, y - 0.2, 0.45), m('sg.strap'), { group: GA + 3, bevel: 0.4 });
        r.fill(T.poly([x + 0.1, y - 0.1, x + 1.2, y - 2.6, x + 0.6, y - 0.1]), m('sg.blade'), { group: GA + 3, bevel: 0.4 });
      }
      // A larger knife at the front hip.
      // Two knives at the hip, grips up, blades down past the belt.
      for (const [kx, k] of [[b.waistW - 1.2, 0], [b.waistW + 1, 1]] as const) {
        const ky = 4.4 - k * 0.6;
        r.fill(T.cap(kx - 0.5, ky + 1.6, kx, ky, 0.6), m('sg.strap'), { group: GA + 4 + k, bevel: 0.5 });
        r.fill(T.rect(kx, ky - 0.1, 0.9, 0.35), m('sg.buckle'), { group: GA + 4 + k, bevel: 0.3 });
        r.fill(T.poly([kx - 0.6, ky - 0.3, kx + 0.6, ky - 0.3, kx + 0.7, ky - 3.4, kx + 0.1, ky - 4.4]), m('sg.blade'), { group: GA + 4 + k, bevel: 0.6 });
      }
      // The scarf wound high round the neck.
      r.fill(T.ell(0.4, top + 1, 3.8, 2.2, -0.12), m('sg.scarf'), { group: GA + 5, bevel: 1.8 });
      r.fill(intersect(T.ell(0.4, top + 1, 3.8, 2.2, -0.12), T.rect(0, top + 0.5, 6, 0.35)), m('sg.scarf'), { group: GA + 5, flat: 1, noLine: true });
    },
  },
};

/** Runic Mail: chainmail with steel plates on the chest and shoulders, blue runes cut into them. */
const runicMail: StockArmour = {
  mats: {
    'rm.mail': ramp(0x8a94a8, [0x2e3442, 0x525a6c, 0x7c869a, 0xa8b2c4, 0xdce4f0], { shiny: true, tex: (x, y) => (wrap(Math.floor(x + y), 2) === 0 || wrap(Math.floor(x - y), 2) === 0 ? -1 : 0) }),
    'rm.plate': ramp(0x5a6a8a, [0x1a2234, 0x2e3a52, 0x4c5c7c, 0x7488a8, 0xb8c8e4], { shiny: true, step: 0.15 }),
    'rm.belt': ramp(0x4a3424, [0x1a100a, 0x2e2016, 0x4a3424, 0x6a4c34, 0x8e6a4c]),
    'rm.engrave': ramp(0x4a8ad8, [0x14284a, 0x1e4078, 0x3a6ab0, 0x5a8ad8, 0x9ac0f0]),
    'rm.rune': glow(0x7ac0ff),
  },
  chest: {
    torso: 'rm.mail', sleeve: 'rm.mail', sleeveLen: 0.75, forearm: 'rm.plate', hands: 'skin', pauldron: null,
    trim: null, belt: 'rm.belt',
    over(r, T, m, c) {
      const b = c.body, top = c.top, fx = b.chestPush * 0.7;
      const body = torsoBody(T, b, top);
      // A breastplate over the mail, a rune of warding cut into it and glowing.
      const plate = intersect(body, T.poly([fx - 2.6, top - 0.4, fx + b.chestW + 0.6, top - 0.8, fx + b.chestW + 0.4, top * 0.62, fx + 2, top * 0.54, fx - 2.6, top * 0.62], 0.5));
      r.fill(plate, m('rm.plate'), { group: GA, bevel: 2 });
      const rx = fx + 2.4, ry = top - 4.4, rr = m('rm.rune');
      // Algiz: a stem with two arms raised.
      ln(r, T, rx, ry - 1.8, rx, ry + 1.4, rr, 3, GA);
      ln(r, T, rx, ry, rx - 1.2, ry + 1.4, rr, 3, GA);
      ln(r, T, rx, ry, rx + 1.2, ry + 1.4, rr, 3, GA);
      // A rim of plate at the collar.
      r.fill(intersect(plate, T.rect(0, top - 1, 12, 0.4)), m('rm.plate'), { group: GA, flat: 4, noLine: true });
      // The belt buckle plate with a carved rune.
      const bx = b.waistW - 0.4;
      r.fill(T.rect(bx, 2.6, 1.2, 1.3, 0.2), m('rm.plate'), { group: GA + 1, bevel: 0.8 });
      ln(r, T, bx - 0.4, 1.8, bx + 0.4, 3.4, m('rm.engrave'), 2, GA + 1);
    },
    shoulder(r, S, m, c) {
      const a = c.body.armR, o = { group: c.g, toneBias: c.bias };
      r.fill(S.ell(-0.2, -0.6, a + 1.9, a + 1.3), m('rm.plate'), { ...o, bevel: 2 });
      r.fill(S.ell(0.2, -3, a + 1.4, 1.1), m('rm.mail'), { ...o, bevel: 1 });
      r.fill(S.ell(-0.2, -0.6, a + 1.9, a + 1.3), m('rm.plate'), { ...o, bevel: 2 });
      if (!c.far) {
        // Engraved runes round the pauldron.
        const e = m('rm.engrave');
        ln(r, S, -1.6, -1, -1.6, 1, e, 2, c.g);
        ln(r, S, -1.6, 0, -0.6, 1, e, 2, c.g);
        ln(r, S, 0.8, -1.2, 1.6, 0.8, e, 2, c.g);
        ln(r, S, 1.6, 0.8, 2.2, -1, e, 2, c.g);
      }
    },
  },
};

// -----------------------------------------------------------------------------
// Legs
// -----------------------------------------------------------------------------

const GHOST = [0x4a6a88, 0x6a92b0, 0x9ac4d8, 0xc8e8f2, 0xeefaff];
/** Ghoststep Leggings: pale ghostly cloth, fraying into drifting wisps at the shins. */
const ghoststepLeggings: StockArmour = {
  mats: {
    // Thigh space: the cloth pales and frays from the knee down.
    'gs.cloth': ramp(GHOST[2], GHOST, { tex: (x, y) => (x > 1.5 ? -1 : x > -1.5 ? ((Math.floor(x) + Math.floor(y)) & 1 ? -1 : 0) : 0) }),
    'gs.band': ramp(0x5a7a98, [0x1e2e44, 0x34486a, 0x506a8e, 0x7896b4, 0xa8c4dc]),
    'gs.wisp': ramp(0xd8f0fa, [0x8ab4cc, 0xb0d4e4, 0xd0ecf6, 0xe8f8ff, 0xfaffff]),
    'gs.glow': glow(0xbff4ff),
    'gs.mist': glow(0xd8f6ff),
  },
  legs: {
    mat: 'gs.cloth', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.2,
    over(r, t, m, c) {
      const w = c.w, L = c.len;
      // A dark band below the hip and a knotted cord at the knee.
      r.fill(t.cap(L * 0.84, -w - 0.2, L * 0.86, w + 0.2, 0.6), m('gs.band'), { group: c.g, bevel: 0.8, toneBias: c.bias });
      r.fill(t.cap(1.4, -w - 0.3, 1.2, w + 0.3, 0.5), m('gs.band'), { group: c.g, bevel: 0.6, toneBias: c.bias });
      if (!c.far) dt(r, t, 1.4, w * 0.4, m('gs.glow'), 3, c.g);
    },
    shin(r, shin, _foot, m, c) {
      // Wisps trailing off the back of the shin, curling as they drift; one bright mote on the near leg.
      const ph = r.phase % 4, k = [0, 0.5, 1, 0.5][ph], w = c.body.shinR + 0.4;
      const x0 = Math.max(c.top + 1, c.len * 0.35);
      const wisp = m('gs.wisp');
      // A solid curl leaving the back of the calf, thinning into a dotted trail that drifts up and back.
      r.fill(chain(shin, [[x0 + 2.8, -w + 0.6, 0.85], [x0 + 1.2, -w - 0.6 - k * 0.3, 0.55], [x0 + 0.2, -w - 1.2, 0.3]]), wisp, { group: c.g, bevel: 0.8, toneBias: c.bias, noLine: true });
      // Its trail: loose motes of ghost-light (no outline), fewer on the far leg.
      const mist = m('gs.mist');
      for (let i = c.far ? 2 : 1; i < 4; i++) {
        const u = i / 3;
        dt(r, shin, x0 + 0.2 + u * 2.6 + Math.sin(u * 3 + k) * 0.5, -w - 1.6 - u * 3.4, mist, 3, c.g);
      }
    },
  },
};

/** Charger Cuisses: riveted cavalry plates over the thighs, big fan-winged knee cops. */
const COPPER = [0x3a180a, 0x6e3416, 0xa8602e, 0xe0a060, 0xfff0c8];
const chargerCuisses: StockArmour = {
  mats: {
    'cc.under': ramp(0x4a3a30, [0x1a1210, 0x2e221c, 0x4a3a30, 0x6a5444, 0x8a7060]),
    'cc.plate': ramp(COPPER[2], COPPER, { shiny: true }),
    'cc.dark': ramp(0x6a3a1e, [0x2a1208, 0x48240e, 0x6a3a1e, 0x8e5430, 0xb07a4a], { shiny: true }),
    'cc.rivet': shiny(0xe8c890),
  },
  legs: {
    mat: 'cc.under', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.25,
    over(r, t, m, c) {
      const w = c.w, L = c.len, o = { group: c.g, toneBias: c.bias };
      // Two overlapping lames down the front and outside of the thigh.
      r.fill(t.poly([L + 0.6, -w - 0.2, L + 0.8, w + 1, L * 0.5, w + 1.3, L * 0.52, -w], 0.4), m('cc.plate'), { group: GA, bevel: 1.6, toneBias: c.bias });
      r.fill(t.poly([L * 0.58, -w + 0.2, L * 0.58, w + 1.3, L * 0.16, w + 1.1, L * 0.18, -w + 0.6], 0.4), m('cc.plate'), { group: GA + 1, bevel: 1.6, toneBias: c.bias });
      r.fill(intersect(t.poly([L + 0.6, -w - 0.2, L + 0.8, w + 1, L * 0.5, w + 1.3, L * 0.52, -w]), t.rect(L * 0.53, 0, 0.45, w + 2)), m('cc.dark'), { group: GA, flat: 1, noLine: true });
      if (!c.far) for (const [x, y] of [[L * 0.82, w * 0.6], [L * 0.38, w * 0.7]] as const) dt(r, t, x, y, m('cc.rivet'), 4, GA + 1);
      // The knee cop: a domed plate with a fan-shaped wing at the side and a point at the front.
      const kr = c.body.kneeR + 0.9;
      r.fill(t.poly([1.6, -0.4, -1.2, -w - 2.2, -2.6, -w - 0.6, -2.2, 0.4]), m('cc.dark'), { ...o, bevel: 1 });
      r.fill(union(t.ell(0.2, 0.7, kr, kr + 0.2), t.poly([-0.6, kr, 0.2, kr + 1.8, 1, kr])), m('cc.plate'), { group: GA + 2, bevel: 1.6, toneBias: c.bias });
      if (!c.far) dt(r, t, 0.6, 1.2, m('cc.rivet'), 4, GA + 2);
    },
  },
};

/** Acrobat Trousers: loose, bright harem trousers, a two-colour sash, gathered at the ankle. */
const acrobatTrousers: StockArmour = {
  mats: {
    'ac.cloth': ramp(0xe0648a, [0x6a1838, 0x9e2a54, 0xd0507a, 0xf08aa8, 0xffc8d8], { tex: (x, y) => (wrap(y * 0.85 + x * 0.12, 3.4) < 0.75 ? -1 : 0) }),
    'ac.sash': ramp(0xf0c040, [0x7a4a10, 0xb07a1e, 0xe0aa34, 0xf8d468, 0xfff2b0]),
    'ac.sash2': ramp(0x2ab0a0, [0x0a3a3a, 0x146a64, 0x24a094, 0x4ccab8, 0x9af0e0]),
  },
  legs: {
    mat: 'ac.cloth', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.9,
    over(r, t, m, c) {
      const w = c.w, L = c.len;
      // The sash wound round the hips: gold over teal, the teal end hanging down the near side.
      r.fill(t.cap(L * 0.88, -w - 0.4, L * 0.9, w + 0.6, 1.1), m('ac.sash2'), { group: c.g, bevel: 1, toneBias: c.bias });
      r.fill(t.cap(L * 0.96, -w - 0.3, L * 0.98, w + 0.5, 0.75), m('ac.sash'), { group: c.g, bevel: 0.8, toneBias: c.bias });
      if (!c.far) {
        const s = [0, 0.3, 0.5, 0.2][r.phase % 4];
        r.fill(t.poly([L * 0.92, w - 0.6, L * 0.94, w + 1.4, L * 0.36, w + 2 + s, L * 0.28, w + 1 + s, L * 0.34, w + 0.2 + s, L * 0.5, w - 0.2]), m('ac.sash2'), { group: GA, bevel: 0.9 });
        r.fill(t.poly([L * 0.34, w + 1.9 + s, L * 0.28, w + 1 + s, L * 0.22, w + 1.6 + s]), m('ac.sash'), { group: GA, bevel: 0.5 });
      }
    },
    shin(r, shin, _foot, m, c) {
      // Billowing over the calf, gathered into a teal cuff at the bottom.
      const w = c.body.shinR + 0.4, top = Math.max(c.top, 1.6);
      r.fill(shin.ell(top + 3.6, -0.2, 3.8, w + 1.6), m('ac.cloth'), { group: c.g, bevel: 2, toneBias: c.bias });
      r.fill(shin.cap(top + 0.6, -w - 0.6, top + 0.6, w + 0.6, 0.8), m('ac.sash2'), { group: c.g, bevel: 0.8, toneBias: c.bias });
    },
  },
};

/** Warlord Faulds: a heavy war skirt of studded plates hanging over the trousers. */
const warlordFaulds: StockArmour = {
  mats: {
    'wf.cloth': ramp(0x5a3a30, [0x1e100c, 0x36201a, 0x5a3a30, 0x7a5444, 0x9a7460]),
    'wf.plate': ramp(0x746c60, [0x24201c, 0x423c34, 0x6a6256, 0x9c9282, 0xd4ccbc], { shiny: true }),
    'wf.dark': ramp(0x8a5a2a, [0x2a1608, 0x4a2a12, 0x7a4c22, 0xa8743a, 0xd0a060], { shiny: true }),
    'wf.stud': shiny(0xd0d4dc),
  },
  legs: {
    mat: 'wf.cloth', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.2,
    over(r, t, m, c) {
      const w = c.w, L = c.len;
      // Three lames, each lower one wider, overlapping like a skirt; a stud row on each.
      const lames = [[L + 1.2, L * 0.7, 0], [L * 0.76, L * 0.44, 0.5], [L * 0.5, L * 0.18, 1]];
      lames.forEach(([a, b, f], i) => {
        const shape = t.poly([a, -w - 1 - f * 0.4, a, w + 1.4 + f * 0.3, b, w + 2 + f * 0.6, b - 0.2, -w - 1.4 - f * 0.6], 0.3);
        r.fill(shape, m('wf.plate'), { group: GA + i, bevel: 1.4, toneBias: c.bias });
        r.fill(intersect(shape, t.rect(b + 0.4, 0, 0.45, w + 3)), m('wf.dark'), { group: GA + i, flat: 1, noLine: true });
        if (!c.far) for (const y of [-w * 0.3, w * 0.5, w + 1.2]) dt(r, t, b + 1.4, y + f * 0.2, m('wf.stud'), 4, GA + i);
      });
    },
  },
};

// -----------------------------------------------------------------------------
// Boots
// -----------------------------------------------------------------------------

/** Warp Boots: sleek violet boots, pointed toes, silver fins, a warp rune at the ankle. */
const warpBoots: StockArmour = {
  mats: {
    'wb.boot': ramp(0x6a4ab8, [0x1e1240, 0x382470, 0x5a3ca8, 0x8466d0, 0xc0a8f4], { shiny: true }),
    'wb.trim': ramp(0xc8c0e0, [0x4a4462, 0x7a7298, 0xb0a8cc, 0xdcd6f0, 0xffffff], { shiny: true }),
    'wb.rune': glow(0xe0b8ff),
    'wb.mote': glow(0xf4e8ff),
  },
  boots: {
    mat: 'wb.boot', height: 0.72, bulk: 0.2, trim: 'wb.trim', wing: null, knee: null,
    over(r, shin, foot, m, c) {
      const o = { group: c.g, toneBias: c.bias }, w = c.w, ph = r.phase % 4;
      // A pointed toe, a silver toe-cap line and a swept fin behind the cuff.
      r.fill(foot.poly([c.toe - 2, 1, c.toe + 2.2, 0.9, c.toe - 0.4, -1.1]), m('wb.boot'), { ...o, bevel: 0.8 });
      r.fill(shin.poly([c.top - 2.2, -w + 0.4, c.top + 3.4, -w - 2.2, c.top + 1.2, -w - 0.2, c.top - 0.4, w * 0.2]), m('wb.trim'), { ...o, bevel: 0.8 });
      // The warp rune: a small diamond at the ankle, with a mote circling the near foot.
      const rx = 2.4, ry = w * 0.1;
      const rune = m('wb.rune');
      dt(r, shin, rx, ry, rune, 4, c.g);
      if (!c.far) for (const [dx, dy] of [[1.2, 0], [-1.2, 0], [0, 1.1], [0, -1.1]]) dt(r, shin, rx + dx, ry + dy, rune, 3, c.g);
      if (!c.far) {
        const a = ph * (Math.PI / 2) + 0.4;
        dt(r, shin, 2.2 + Math.sin(a) * 1.4, Math.cos(a) * (w + 1.8), m('wb.mote'), 3, c.g);
      }
    },
  },
};

/** Earthshaker Boots: huge boots shod in stone: rock slabs on the shins, cracked stone soles. */
const STONE = [0x34363a, 0x55585c, 0x7e8084, 0xa8aaa8, 0xd6d6cc];
const earthshakerBoots: StockArmour = {
  mats: {
    'es.boot': ramp(0x6a4a30, [0x221408, 0x3e2a18, 0x62442a, 0x84603e, 0xa88058]),
    'es.band': ramp(0x4a4448, [0x141214, 0x262226, 0x403a3e, 0x5e585c, 0x8a8488], { shiny: true }),
    'es.stone': ramp(STONE[2], STONE.map((v) => v), { step: 0.13, tex: (x, y) => (hash(Math.floor(x * 1.1), Math.floor(y * 1.1) + 5) < 0.14 ? -1 : 0) }),
    'es.crack': plain(0x1e1610),
    'es.glow': glow(0xffa848),
  },
  boots: {
    mat: 'es.boot', height: 0.6, bulk: 0.85, trim: 'es.band', wing: null, knee: null,
    over(r, shin, foot, m, c) {
      const o = { group: c.g, toneBias: c.bias }, w = c.w;
      // The stone sole: a thick block under the whole foot, wider than it.
      const sole = foot.poly([-3.2, -0.4, c.toe + 2, -0.6, c.toe + 2.8, -2.4, c.toe + 1.6, -4, -3, -3.8, -3.8, -2.2], 0.4);
      r.fill(sole, m('es.stone'), { ...o, bevel: 1.6 });
      // A slab strapped over the front of the shin.
      const slab = shin.poly([1.4, w - 0.6, c.top - 0.6, w - 0.4, c.top + 0.4, w + 1.2, c.top - 1, w + 1.8, 1.2, w + 1.4], 0.4);
      r.fill(slab, m('es.stone'), { group: GA, bevel: 1.4, toneBias: c.bias });
      // Cracks across the stone, one of them glowing deep inside (near leg).
      const k = m('es.crack');
      ln(r, foot, c.toe * 0.4, -0.9, c.toe * 0.55, -2.4, k, 0, c.g);
      ln(r, foot, c.toe * 0.55, -2.4, c.toe * 0.4, -3.4, k, 0, c.g);
      ln(r, shin, c.top * 0.6, w + 1.4, c.top * 0.45, w + 0.2, k, 0, GA);
      if (!c.far) {
        dt(r, foot, c.toe * 0.55, -2.4, m('es.glow'), 3, c.g);
        dt(r, shin, c.top * 0.52, w + 0.8, m('es.glow'), 3, GA);
      }
    },
  },
};

/** Frostwalkers: pale boots lined with white fur, iron-and-ice crampons under the soles. */
const frostwalkers: StockArmour = {
  mats: {
    'fw.boot': ramp(0x6a8aa8, [0x1e2a3e, 0x34485e, 0x587690, 0x84a2bc, 0xb8d0e4]),
    'fw.fur': ramp(0xe8e8e2, [0x84847e, 0xb2b0a8, 0xd8d6ce, 0xf2f0ea, 0xffffff], { tex: (x, y) => (wrap(x * 1.2 + Math.sin(y * 1.9) * 0.7, 1.7) < 0.4 ? -1 : 0) }),
    'fw.strap': ramp(0x3a3040, [0x100c14, 0x201a26, 0x3a3040, 0x564a5a, 0x786a7c]),
    'fw.ice': ramp(0xbfeeff, [0x3a7aa8, 0x5aa8d8, 0x8ad4f4, 0xc8f2ff, 0xffffff], { shiny: true }),
  },
  boots: {
    mat: 'fw.boot', height: 0.66, bulk: 0.45, trim: null, wing: null, knee: null,
    over(r, shin, foot, m, c) {
      const o = { group: c.g, toneBias: c.bias }, w = c.w;
      // Crampons: a strap over the foot and ice-bright spikes under the sole and at the toe.
      r.fill(foot.cap(c.toe * 0.45, 1.2, c.toe * 0.6, -1.6, 0.55), m('fw.strap'), { ...o, bevel: 0.5 });
      const ice = m('fw.ice');
      for (const x of [-0.6, c.toe * 0.45, c.toe * 0.85]) r.fill(foot.poly([x - 0.8, -1.4, x + 0.8, -1.4, x + 0.1, -3.4]), ice, { ...o, bevel: 0.5 });
      r.fill(foot.poly([c.toe - 0.4, 0.2, c.toe + 1.8, -0.6, c.toe - 0.2, -1.2]), ice, { ...o, bevel: 0.5 });
      if (!c.far) dt(r, foot, c.toe * 0.85 + 0.1, -3, ice, 4, c.g);
      // The fur cuff spilling over the top.
      r.fill(roll(shin, c.top + 0.4, -w - 1, c.top + 0.6, w + 1, 1.7, 4), m('fw.fur'), { ...o, bevel: 1.2 });
    },
  },
};

/** Savate Boots: laced fighter's boots with reinforced toe caps. */
const savateBoots: StockArmour = {
  mats: {
    'sv.boot': ramp(0x5a4a3a, [0x1a120c, 0x2e2218, 0x4e3e2e, 0x6e5a46, 0x907a62]),
    'sv.cuff': ramp(0x8a6a4a, [0x2e2014, 0x4e3a26, 0x7a5c3e, 0x9c7c58, 0xc0a07a]),
    'sv.lace': plain(0xe8dcc0),
    'sv.cap': ramp(0x9a9eaa, [0x30323a, 0x585c66, 0x8a8e9a, 0xb8bcc6, 0xeef0f6], { shiny: true }),
  },
  boots: {
    mat: 'sv.boot', height: 0.78, bulk: 0.35, trim: 'sv.cuff', wing: null, knee: null,
    over(r, shin, foot, m, c) {
      const o = { group: c.g, toneBias: c.bias }, w = c.w;
      // Criss-cross laces up the front of the shin.
      if (!c.far) {
        const lace = m('sv.lace');
        for (let x = 2; x < c.top - 1; x += 1.8) {
          dt(r, shin, x, w - 0.3, lace, 3, c.g);
          dt(r, shin, x + 0.9, w - 1.1, lace, 2, c.g);
        }
      }
      // The reinforced toe cap and a dark heel.
      r.fill(foot.ell(c.toe - 0.6, -0.2, 1.9, 1.5), m('sv.cap'), { ...o, bevel: 1 });
      r.fill(foot.ell(-1.2, -1.2, 1.4, 1.2), m('sv.cuff'), { ...o, bevel: 0.8 });
    },
  },
};

// -----------------------------------------------------------------------------

export const ARMOUR2: Partial<Record<GearId, StockArmour>> = {
  seer_blindfold: seerBlindfold,
  dread_helm: dreadHelm,
  hawkeye_hood: hawkeyeHood,
  gladiator_helm: gladiatorHelm,
  juggernaut_plate: juggernautPlate,
  heartwood_armor: heartwoodArmor,
  shadow_garb: shadowGarb,
  runic_mail: runicMail,
  ghoststep_leggings: ghoststepLeggings,
  charger_cuisses: chargerCuisses,
  acrobat_trousers: acrobatTrousers,
  warlord_faulds: warlordFaulds,
  warp_boots: warpBoots,
  earthshaker_boots: earthshakerBoots,
  frostwalkers,
  savate_boots: savateBoots,
};

/** The stock headgear look for a new head piece, if it is one. */
export const stockHead = (id: GearId | null | undefined): StockHead | null => (id ? ARMOUR2[id]?.head ?? null : null);
