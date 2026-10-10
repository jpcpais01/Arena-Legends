import { mix } from '../../pixel/color';
import type { MaterialSpec, Raster, Tex } from '../../pixel/raster';
import { intersect, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { Xf } from '../xform';
import type { SkinArt } from './index';
import { glow, plain, Q, shiny, wrap } from './kit';

/**
 * Fourth-wave skins (v0.40.0) for the v0.39 legs and boots. Rare skins
 * recolour the stock pieces by their own material names (armour2.ts); the
 * mythic and legendary ones reshape them through the per-leg hooks (thigh
 * frame: x up from the knee, y toward the front; shin frame: x up from the
 * ankle, y toward the front; foot frame: x toward the toe, y up). Their own
 * materials are prefixed `l4.` (legs) and `b4.` (boots).
 */

const ramp = (r: number[], o: Partial<MaterialSpec> = {}): MaterialSpec => ({ base: r[2], ramp: r, ...o });

/** Legendary sparkles and swing trail in one colour family. */
const legend = (spark: number, spark2: number): Pick<SkinArt, 'fx' | 'trail'> => ({
  fx: { spark, spark2 },
  trail: [spark, mix(spark, spark2, 0.55)],
});

/** A tapering chain of capsules through [x, y, radius] points. */
function chain(F: Xf, pts: number[][]): Shape {
  const s: Shape[] = [];
  for (let i = 1; i < pts.length; i++) s.push(F.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i - 1][2], pts[i][2]));
  return union(...s);
}

const ln = (r: Raster, F: Xf, ax: number, ay: number, bx: number, by: number, mat: number, tone: number, g: number) =>
  r.line(F.x(ax, ay), F.y(ax, ay), F.x(bx, by), F.y(bx, by), mat, tone, g);
const dt = (r: Raster, F: Xf, x: number, y: number, mat: number, tone: number, g: number) => r.dot(F.x(x, y), F.y(x, y), mat, tone, g);

/** The same frame mirrored along its x axis (behind the heel instead of toward the toe). */
const backOf = (F: Xf) => new Xf(F.ox, F.oy, F.ang, -F.sx, F.sy);

/** A small four-point star centred at (x, y). */
function star(F: Xf, x: number, y: number, s: number): Shape {
  const k = s * 0.32;
  return F.poly([x + s, y, x + k, y + k, x, y + s, x - k, y + k, x - s, y, x - k, y - k, x, y - s, x + k, y - k]);
}

/** A pointed crystal growing from (x, y) toward angle `a`. */
function shard(F: Xf, x: number, y: number, a: number, len: number, w: number): Shape {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  const p = (u: number, v: number) => [x + c * u + nx * v, y + s * u + ny * v];
  return F.poly([...p(-0.3, -w * 0.8), ...p(len * 0.6, -w), ...p(len, 0), ...p(len * 0.6, w), ...p(-0.3, w * 0.8)]);
}

// Outline groups for overlays that must stand off what is under them.
const GL = 40;

// =============================================================================
// Ghoststep Leggings
// =============================================================================

/** Mist: drifting soft swirls in the cloth (thigh space). */
const mistTex: Tex = (x, y, ph) => {
  const v = Math.sin(x * 0.7 + Math.sin(y * 0.9 + ph * Q) * 1.6 - ph * Q * 0.5);
  return v > 0.75 ? 1 : v < -0.85 ? -1 : 0;
};

const mistLeggings: SkinArt = {
  mats: {
    'gs.cloth': ramp([0x3a3448, 0x5a5270, 0x8a82a0, 0xb8b2c8, 0xe2dcec], { tex: mistTex }),
    'gs.band': ramp([0x141220, 0x241f34, 0x383250, 0x524a6e, 0x7a7298]),
    'gs.wisp': ramp([0x8a82a8, 0xaaa4c4, 0xcac4dc, 0xe4e0f0, 0xfaf8ff]),
    'gs.glow': glow(0xe0c8ff),
    'gs.mist': glow(0xece4ff),
  },
};

/** Spectral cloth: pale ghost-light with slow currents; a few motes catch the light at night. */
const SPECTRE = [0x0e1822, 0x1a2c3a, 0x2a4656, 0x426a78];
const spectreTex: Tex = (x, y, ph) => {
  const v = Math.sin(y * 1.5 + Math.sin(x * 0.55 - ph * Q) * 1.4);
  if (v > 0.97 && wrap(Math.floor(x) - ph * 2, 9) === 0) return 3;
  return v < -0.6 ? -1 : 0;
};

const specterTrain: SkinArt = {
  mats: {
    'l4.sp.cloth': ramp([...SPECTRE, 0xe8fff8], { tex: spectreTex }),
    'l4.sp.train': ramp([0x4a7a90, 0x76aabc, 0xa6d6e0, 0xd2f2f4, 0xf8ffff], { tex: (x, y) => (wrap(y * 1.1 + x * 0.25, 2.6) < 0.6 ? -1 : 0) }),
    'l4.sp.band': ramp([0x10141c, 0x1e2632, 0x323e4e, 0x56647a, 0xc0d0e0], { shiny: true }),
    'l4.sp.wisp': ramp([0x5aa0a8, 0x84c8c8, 0xaee4de, 0xd8f8f0, 0xf6fffc]),
    'l4.sp.soul': glow(0x9affe0),
    'l4.sp.mote': glow(0xd8fff4),
  },
  legs: {
    mat: 'l4.sp.cloth', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.25,
    over(r, t, m, c) {
      const w = c.w, L = c.len, ph = r.phase % 4;
      const f = [0, 0.5, 1, 0.5][ph], f2 = [0.6, 0, 0.4, 1][ph];
      // The train: a long tattered panel hanging from the hip behind the thigh, its rags trailing past the knee.
      const train = t.poly([
        L + 1, -w + 0.8, L + 1, -w - 1.4, L * 0.6, -w - 2.8 - f * 0.4, L * 0.2, -w - 4 - f * 0.6,
        -2.6 - f, -w - 6 - f2, -2, -w - 3.8 - f * 0.4, -5.4 - f2, -w - 3.4 - f, -2.6, -w - 1.8,
        -4.6 - f * 0.6, -w - 0.2 - f2 * 0.5, -1, -w + 0.4, L * 0.4, -w + 0.6,
      ]);
      r.fill(train, m('l4.sp.train'), { group: GL, bevel: 1.6, toneBias: c.bias, softLight: true });
      // A dark sash below the hip, a soul-stone set in it (near leg), a faded tatter at the knee.
      r.fill(t.cap(L * 0.84, -w - 0.3, L * 0.88, w + 0.3, 0.65), m('l4.sp.band'), { group: GL + 1, bevel: 0.7, toneBias: c.bias });
      r.fill(t.poly([1.6, -w - 0.2, 1.4, w + 0.3, -0.6, w + 0.1, 0.4, w * 0.3, -1.2, -w * 0.1, 0, -w - 0.4]), m('l4.sp.cloth'), { group: c.g, bevel: 1, toneBias: c.bias });
      if (!c.far) {
        r.fill(t.circ(L * 0.86, w * 0.35, 0.75), m('l4.sp.soul'), { group: GL + 1 });
        dt(r, t, L * 0.86 + 0.3, w * 0.35 + 0.3, m('l4.sp.mote'), 3, GL + 1);
      }
    },
    shin(r, shin, _foot, m, c) {
      const ph = r.phase % 4, k = [0, 0.5, 1, 0.5][ph], w = c.body.shinR + 0.5;
      const x0 = Math.max(c.top + 1, c.len * 0.4);
      // The leggings dissolve into ghost-light: two long wisps streaming back off the calf, curling up.
      const wisp = m('l4.sp.wisp');
      r.fill(chain(shin, [[x0 + 3, -w + 0.8, 1.1], [x0 + 1, -w - 1 - k * 0.4, 0.8], [x0 + 0.6, -w - 2.8 - k * 0.3, 0.55], [x0 + 1.8, -w - 4.2, 0.3]]), wisp, { group: GL + 2, bevel: 0.9, toneBias: c.bias, noLine: true });
      r.fill(chain(shin, [[x0 - 0.4, -w + 0.6, 0.8], [x0 - 1.8, -w - 1.2 + k * 0.3, 0.55], [x0 - 1.6, -w - 2.6, 0.3]]), wisp, { group: GL + 2, bevel: 0.8, toneBias: c.bias - 1, noLine: true });
      // The legging's sheer hem frays into points over the boot cuff.
      r.fill(shin.poly([c.len, -w, c.len, w, c.top + 1.2, w, c.top - 0.6, w * 0.4, c.top + 0.6, 0, c.top - 1, -w * 0.5, c.top + 0.2, -w - 0.6]), m('l4.sp.train'), { group: GL + 3, bevel: 1.2, toneBias: c.bias, softLight: true });
      if (c.far) return;
      // Motes of ghost-light drifting off the wisps.
      const mote = m('l4.sp.mote');
      for (let i = 0; i < 3; i++) {
        const u = wrap(i * 0.34 + ph * 0.25, 1);
        dt(r, shin, x0 + 2 + u * 3 + Math.sin(u * 5) * 0.4, -w - 3.6 - u * 2.6, mote, 3, GL + 2);
      }
    },
  },
  ...legend(0xe8fff8, 0x3ab8a8),
};

// =============================================================================
// Charger Cuisses
// =============================================================================

const bronzeCuisses: SkinArt = {
  mats: {
    'cc.under': ramp([0x0e1a16, 0x18282a, 0x243a3a, 0x345050, 0x4a6a68]),
    'cc.plate': ramp([0x3e220a, 0x7a4818, 0xb87a2e, 0xe6b058, 0xfff0b8], { shiny: true, tex: (x, y) => (hash(Math.floor(x * 1.2), Math.floor(y * 1.2) + 3) < 0.1 ? -2 : 0) }),
    'cc.dark': ramp([0x123028, 0x1e4a3c, 0x2e6a56, 0x4a9278, 0x8ad0b0], { shiny: true }),
    'cc.rivet': shiny(0xfff0b0),
  },
};

const BARD_STEEL = [0x262a34, 0x4a5262, 0x7a8496, 0xb0bacb, 0xf0f6ff];
const GOLD = [0x5a3a0a, 0x9a6a18, 0xd0a030, 0xf0d070, 0xfff8d0];
/** Caparison cloth: royal blue, a gold knot here and there where the quilting would cross. */
const capTex: Tex = (x, y) => (wrap(Math.floor(x + y), 6) === 0 && wrap(Math.floor(x - y), 6) === 0 ? 2 : 0);

const centaurBarding: SkinArt = {
  mats: {
    'l4.cb.under': ramp([0x1a1210, 0x2e221c, 0x4a3426, 0x6a4c36, 0x8a6a4e]),
    'l4.cb.cloth': ramp([0x0e1440, 0x1a2468, 0x2a3a98, 0x4a5cc0, 0xe8c860], { tex: capTex }),
    'l4.cb.border': ramp([0x4a0a12, 0x7a141e, 0xb02030, 0xd84a4a, 0xff9a8a]),
    'l4.cb.steel': ramp(BARD_STEEL, { shiny: true }),
    'l4.cb.gold': ramp(GOLD, { shiny: true }),
    'l4.cb.fringe': ramp([0x6a4410, 0xa87420, 0xd8a838, 0xf4d878, 0xfff4c0], { tex: (_x, y) => (wrap(Math.floor(y), 2) < 1 ? -1 : 0) }),
    'l4.cb.gem': glow(0xff5a5a),
  },
  legs: {
    mat: 'l4.cb.under', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.3,
    over(r, t, m, c) {
      const w = c.w, L = c.len, ph = r.phase % 4, sw = [0, 0.3, 0.5, 0.3][ph];
      // The caparison: a long blue horse-cloth draped from the hip, lower at the back like a
      // barding skirt, edged with a red border and a heavy gold fringe that swings.
      const bx = -3.2 - sw, by = -w - 3 - sw * 0.8, fx = L * 0.3, fy = w + 1.8;
      const cloth = t.poly([L + 1.4, -w - 0.8, L + 1.4, w + 1.4, fx, fy, bx, by]);
      r.fill(cloth, m('l4.cb.cloth'), { group: GL, bevel: 1.8, toneBias: c.bias, softLight: true });
      r.fill(intersect(cloth, t.poly([fx + 1.3, fy + 1, bx + 1.3, by - 1, bx - 1, by - 1, fx - 1, fy + 1])), m('l4.cb.border'), { group: GL, flat: 2, noLine: true });
      const fr = m('l4.cb.fringe');
      for (let i = 0; i <= 6; i++) {
        const u = i / 6, x = bx + (fx - bx) * u, y = by + (fy - by) * u, d = 1.8 + (i & 1) * 0.5 + (1 - u) * sw * 0.6;
        ln(r, t, x + 0.3, y, x - d, y - (1 - u) * sw * 0.5, fr, i & 1 ? 2 : 3, GL + 1);
      }
      // A gold band at the top of the cloth.
      r.fill(intersect(cloth, t.rect(L * 0.82, 0, 0.5, w + 3)), m('l4.cb.gold'), { group: GL, flat: 2, noLine: true });
      if (!c.far) {
        // A gold horseshoe on the cloth.
        const hx = L * 0.5, hy = w * 0.3;
        const shoe = intersect(t.circ(hx, hy, 1.7), t.poly([hx - 3, hy - 3, hx + 0.8, hy - 3, hx + 0.8, hy + 3, hx - 3, hy + 3]));
        r.fill(shoe, m('l4.cb.gold'), { group: GL + 2, bevel: 0.6 });
        r.fill(intersect(t.circ(hx, hy, 0.75), shoe), m('l4.cb.cloth'), { group: GL + 2, flat: 1, noLine: true });
      }
      // The knee: a small domed steel cop at the front, a short spike thrust forward, a ruby boss.
      const kr = c.body.kneeR * 0.8, ky = c.w * 0.45;
      r.fill(t.poly([0.2, ky + kr - 0.4, 0.2, ky + kr + 2.2, -1, ky + kr - 0.2]), m('l4.cb.steel'), { group: GL + 3, bevel: 0.6, toneBias: c.bias });
      const cop = t.ell(-0.2, ky, kr + 0.2, kr + 0.4);
      r.fill(cop, m('l4.cb.steel'), { group: GL + 4, bevel: 1.4, toneBias: c.bias });
      r.fill(intersect(cop, t.rect(kr - 0.2, ky, 0.4, kr + 2)), m('l4.cb.gold'), { group: GL + 4, flat: 2, noLine: true });
      if (!c.far) r.dot(t.x(0, ky + 0.3), t.y(0, ky + 0.3), m('l4.cb.gem'), 3, GL + 4);
    },
  },
};

// =============================================================================
// Acrobat Trousers
// =============================================================================

/** Harlequin diamonds: alternate lozenges drop to near-black. */
const harlequinTex: Tex = (x, y) => ((Math.floor((x * 0.6 + y) / 3.2) + Math.floor((x * 0.6 - y) / 3.2)) & 1 ? -2 : 0);

const harlequinTrousers: SkinArt = {
  mats: {
    'ac.cloth': ramp([0x140c14, 0x2a1220, 0xc02838, 0xe85a5a, 0xffb8a8], { tex: harlequinTex }),
    'ac.sash': ramp([0x6a4a10, 0xa8781e, 0xe0b040, 0xf8dc80, 0xfffae0], { shiny: true }),
    'ac.sash2': ramp([0x14141a, 0x24242e, 0x3a3a48, 0xd8d8e0, 0xffffff], { tex: (x) => (wrap(x, 2) < 1 ? 1 : 0) }),
  },
};

const RED = [0x4a0812, 0x7e1020, 0xb81e30, 0xe04450, 0xff8a80];
const CREAM = [0x7a5a1a, 0xb08a30, 0xe8c860, 0xfae6a0, 0xfffbe6];

const ringmasterStripes: SkinArt = {
  mats: {
    'l4.rm.cloth': ramp(RED, { tex: (x, y) => (wrap(y * 0.7 + x * 0.12, 3.6) < 0.5 ? -1 : 0) }),
    'l4.rm.stripe': ramp(CREAM),
    'l4.rm.belt': ramp([0x08080c, 0x141418, 0x24242c, 0x3a3a46, 0x8a8a9a], { shiny: true }),
    'l4.rm.gold': ramp(GOLD, { shiny: true }),
    'l4.rm.tassel': ramp([0x6a4410, 0xa87420, 0xd8a838, 0xf4d878, 0xfff4c0], { tex: (_x, y) => (wrap(y * 2, 2) < 1 ? -1 : 0) }),
    'l4.rm.star': glow(0xfff0a0),
  },
  legs: {
    mat: 'l4.rm.cloth', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.8,
    over(r, t, m, c) {
      const w = c.w, L = c.len, ph = r.phase % 4, s = [0, 0.4, 0.7, 0.3][ph];
      const kr = c.body.kneeR + 0.55;
      // Gold stripes running down the trousers, following the thigh.
      const leg = t.cap(L, 0, 0, 0, w, kr);
      const stripes: Shape[] = [];
      for (const y of [-w * 0.55, w * 0.05, w * 0.65]) stripes.push(t.poly([L + 2, y - 0.5, L + 2, y + 0.5, -2, y * 0.8 + 0.5, -2, y * 0.8 - 0.5]));
      r.fill(intersect(leg, union(...stripes)), m('l4.rm.stripe'), { group: c.g, bevel: 0.3, toneBias: c.bias, lightBias: 0.2, noLine: true });
      // A black belt with a gold star buckle.
      r.fill(t.cap(L * 0.93, -w - 0.4, L * 0.95, w + 0.6, 0.9), m('l4.rm.belt'), { group: GL, bevel: 0.8, toneBias: c.bias });
      if (c.far) return;
      // Gold tassels hanging from the belt at the side, swinging.
      for (const [y, l] of [[w * 0.1, 3.2], [-w * 0.5, 2.6]] as const) {
        r.fill(t.cap(L * 0.9, y, L * 0.9 - l, y - 0.6 - s * 0.6, 0.35, 0.6), m('l4.rm.tassel'), { group: GL + 1, bevel: 0.6 });
        r.fill(t.circ(L * 0.9, y, 0.55), m('l4.rm.gold'), { group: GL + 1, bevel: 0.5 });
      }
      r.fill(star(t, L * 0.94, w * 0.62, 1.5), m('l4.rm.gold'), { group: GL + 2, bevel: 0.6 });
      dt(r, t, L * 0.94, w * 0.62, m('l4.rm.star'), 3, GL + 2);
      // Star buttons down the front seam.
      for (const x of [L * 0.62, L * 0.4]) dt(r, t, x, w * 0.85, m('l4.rm.star'), 3, c.g);
    },
    shin(r, shin, _foot, m, c) {
      // Billowing over the calf, gathered in a gold cuff with a tassel.
      const w = c.body.shinR + 0.4, top = Math.max(c.top, 1.6), s = [0, 0.4, 0.7, 0.3][r.phase % 4];
      const puff = shin.ell(top + 3.6, -0.2, 3.8, w + 1.6);
      r.fill(puff, m('l4.rm.cloth'), { group: c.g, bevel: 2, toneBias: c.bias });
      const stripes = union(...[-w * 0.6, w * 0.15, w * 0.85].map((y) => shin.rect(top + 3.6, y, 5, 0.5)));
      r.fill(intersect(puff, stripes), m('l4.rm.stripe'), { group: c.g, bevel: 0.3, toneBias: c.bias, lightBias: 0.2, noLine: true });
      r.fill(shin.cap(top + 0.6, -w - 0.7, top + 0.6, w + 0.7, 0.8), m('l4.rm.gold'), { group: GL + 3, bevel: 0.8, toneBias: c.bias });
      if (c.far) return;
      r.fill(shin.cap(top + 0.6, -w - 0.6, top - 1.8 - s * 0.5, -w - 1.4 - s, 0.3, 0.55), m('l4.rm.tassel'), { group: GL + 4, bevel: 0.6 });
    },
  },
  ...legend(0xfff4c0, 0xe0303a),
};

// =============================================================================
// Warlord Faulds
// =============================================================================

const blackironFaulds: SkinArt = {
  mats: {
    'wf.cloth': ramp([0x1a0608, 0x320c10, 0x52161c, 0x74242a, 0x94383c]),
    'wf.plate': ramp([0x0e0e12, 0x1c1c22, 0x2e2e36, 0x4a4a56, 0xa8acb8], { shiny: true, tex: (x, y) => (hash(Math.floor(x * 1.4), Math.floor(y * 1.4) + 9) < 0.05 ? 1 : 0) }),
    'wf.dark': ramp([0x3a2408, 0x6a4412, 0xa8742a, 0xd8a850, 0xfff0b0], { shiny: true }),
    'wf.stud': shiny(0xfff0b0),
  },
};

/** Lacquered lames: black with a deep sheen, a dark seam between each row. */
const LACQUER = [0x0a0a10, 0x16161e, 0x262632, 0x40404e, 0x9aa0b8];
const kozane: Tex = (x) => (wrap(x, 1.7) < 0.45 ? -1 : 0);
const hakamaPleats: Tex = (_x, y) => (wrap(y, 1.9) < 0.55 ? -1 : 0);

const kusazuri: SkinArt = {
  mats: {
    'l4.kz.hakama': ramp([0x0c1024, 0x18203e, 0x26325c, 0x3a4878, 0x5a6a9a], { tex: hakamaPleats }),
    'l4.kz.lac': ramp(LACQUER, { shiny: true, tex: kozane }),
    'l4.kz.lac2': ramp([0x1a0608, 0x3a0c10, 0x5e141a, 0x8a2228, 0xd06a6a], { shiny: true, tex: kozane }),
    'l4.kz.lace': ramp([0x5a0a10, 0x8a141c, 0xc0202a, 0xe84a4a, 0xff9a8a]),
    'l4.kz.gold': ramp(GOLD, { shiny: true }),
  },
  legs: {
    mat: 'l4.kz.hakama', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.55,
    over(r, t, m, c) {
      const w = c.w, L = c.len, ph = r.phase % 4, fl = [0, 0.3, 0.5, 0.2][ph];
      const hem = L * 0.2;
      // A red-lacquered panel at the back, peeking out behind the front one.
      const back = t.poly([L + 1.2, -w - 0.4, L + 1.2, -w + 2.2, hem + 1.4, -w + 1.4, hem + 0.6 - fl * 0.3, -w - 2.6 - fl * 0.5], 0.2);
      r.fill(back, m('l4.kz.lac2'), { group: GL, bevel: 1.2, toneBias: c.bias - 1 });
      // The front panel: rows of black lacquered lames, flaring wider toward the hem.
      const front = t.poly([L + 1.4, -w + 0.4, L + 1.4, w + 1.2, hem - fl * 0.3, w + 2.4 + fl * 0.4, hem + 0.3, -w - 1.2], 0.2);
      r.fill(front, m('l4.kz.lac'), { group: GL + 1, bevel: 1.4, toneBias: c.bias, local: t });
      // Gold edge along the bottom lame.
      r.fill(intersect(front, t.poly([hem + 1, -w - 3, hem + 1 - fl * 0.3, w + 4, hem - 2, w + 4, hem - 2, -w - 3])), m('l4.kz.gold'), { group: GL + 1, flat: 2, noLine: true });
      // Crimson silk lacing running down through the rows.
      const lace = m('l4.kz.lace');
      for (const u of [0.2, 0.55, 0.88]) {
        const ya = -w + 0.4 + (w * 2 + 0.8) * u, yb = -w - 1.2 + (w * 2 + 3.6 + fl * 0.4) * u;
        ln(r, t, L + 0.6, ya, hem + 1.2, yb, lace, 2, GL + 1);
      }
      // The braided cord at the top, with a small gold mon on the near leg.
      r.fill(t.cap(L + 0.8, -w - 0.2, L + 0.8, w + 1, 0.55), lace, { group: GL + 2, bevel: 0.5, toneBias: c.bias });
      if (!c.far) {
        const mx = L * 0.62, my = w * 0.45;
        r.fill(t.circ(mx, my, 0.9), m('l4.kz.gold'), { group: GL + 3, bevel: 0.6 });
        dt(r, t, mx, my, lace, 2, GL + 3);
      }
    },
    shin(r, shin, _foot, m, c) {
      // Wide hakama legs billowing over the shins.
      const w = c.body.shinR + 0.5, top = Math.max(c.top, 1.4);
      const fl = [0, 0.3, 0.5, 0.2][r.phase % 4];
      r.fill(shin.poly([c.len + 0.5, -w - 0.4, c.len + 0.5, w + 0.6, top + 0.6, w + 1.8 + fl * 0.4, top - 0.2, w * 0.2, top + 0.4, -w - 1.6 - fl * 0.5]), m('l4.kz.hakama'), { group: c.g, bevel: 1.8, toneBias: c.bias });
    },
  },
};

// =============================================================================
// Warp Boots
// =============================================================================

const tealWarpers: SkinArt = {
  mats: {
    'wb.boot': ramp([0x08302e, 0x0e4a46, 0x187064, 0x2e9c88, 0x7ae0c8], { shiny: true, tex: (x) => (wrap(x, 2.4) < 0.4 ? -1 : 0) }),
    'wb.trim': ramp([0x4a2410, 0x7a3e1a, 0xb0642e, 0xe09a58, 0xffe0b0], { shiny: true }),
    'wb.rune': glow(0x8affe8),
    'wb.mote': glow(0xd8fff4),
  },
};

/** Void leather: near-black with a faint violet sheen and a few hairline cracks of rift-light. */
const VOID = [0x07050e, 0x140c26, 0x241646, 0x3a2670];
const riftTex: Tex = (x, y, ph) => {
  const v = Math.sin(x * 0.9 + Math.sin(y * 1.7) * 1.6) + Math.sin(y * 0.7 - x * 0.4) * 0.5;
  if (Math.abs(v) < 0.08 && hash(Math.floor(x), Math.floor(y)) < 0.6) return wrap(Math.floor(x * 0.7) + ph, 4) < 2 ? 4 : 2;
  return 0;
};

const riftwalkers: SkinArt = {
  mats: {
    'b4.rw.boot': ramp([...VOID, 0xf0a0ff], { tex: riftTex }),
    'b4.rw.trim': ramp([0x1e1a2a, 0x3a3450, 0x625a80, 0x9a92b8, 0xf4f0ff], { shiny: true }),
    'b4.rw.rift': { base: 0xd060ff, glow: true, ramp: [0x3a0a6a, 0x7a1ab8, 0xb040f0, 0xe8a0ff, 0xfff0ff] },
    'b4.rw.void': plain(0x05030a),
    'b4.rw.shard': ramp([0x2a1450, 0x4a2a88, 0x8a5ad8, 0xc8a8ff, 0xffffff], { shiny: true }),
    'b4.rw.core': glow(0xffe0ff),
  },
  boots: {
    mat: 'b4.rw.boot', height: 0.74, bulk: 0.25, trim: 'b4.rw.trim', wing: null, knee: null,
    over(r, shin, foot, m, c) {
      const o = { group: c.g, toneBias: c.bias }, w = c.w, ph = r.phase % 4;
      // A long pointed toe tipped in silver, and a jagged silver cuff sweeping back into a fin.
      r.fill(foot.poly([c.toe - 2.2, 1.1, c.toe + 2.8, 0.4, c.toe + 0.2, -1.1]), m('b4.rw.boot'), { ...o, bevel: 0.8 });
      r.fill(foot.poly([c.toe + 0.8, 0.9, c.toe + 2.8, 0.4, c.toe + 1.2, 0]), m('b4.rw.trim'), { ...o, bevel: 0.4 });
      r.fill(shin.poly([c.top - 1.6, -w + 0.6, c.top + 1.2, -w - 1.2, c.top + 3.6, -w - 3, c.top + 1.4, -w - 0.2, c.top + 0.6, w * 0.3, c.top - 1, w * 0.4]), m('b4.rw.trim'), { ...o, bevel: 0.8 });
      // The rift: a bright jagged tear down the front of the shin, black void inside.
      const x1 = c.top - 1.2, x0 = 1;
      const zig = [[x1, w * 0.5], [x1 - (x1 - x0) * 0.3, w * 0.05], [x1 - (x1 - x0) * 0.55, w * 0.6], [x1 - (x1 - x0) * 0.8, w * 0.15], [x0, w * 0.45]];
      const tear: Shape[] = [];
      for (let i = 1; i < zig.length; i++) tear.push(shin.cap(zig[i - 1][0], zig[i - 1][1], zig[i][0], zig[i][1], i === 2 || i === 3 ? 0.9 : 0.6));
      r.fill(union(...tear), m('b4.rw.rift'), { group: c.g });
      ln(r, shin, zig[1][0], zig[1][1], zig[2][0], zig[2][1], m('b4.rw.void'), 0, c.g);
      ln(r, shin, zig[2][0], zig[2][1], zig[3][0], zig[3][1], m('b4.rw.void'), 0, c.g);
      if (c.far) return;
      // Crystal shards torn from the rift, floating around the ankle, bobbing out of step.
      const bob = (i: number) => [0, 0.5, 0.8, 0.4][(ph + i) % 4];
      const shards: [number, number, number, number][] = [[c.top * 0.75, -w - 2.4, 2.2, 2.6], [c.top * 0.35, -w - 3.4, 1.6, 2]];
      shards.forEach(([x, y, a, len], i) => {
        const yy = y - bob(i * 2) * 0.6, xx = x + bob(i * 2);
        r.fill(shard(shin, xx, yy, a, len, 0.75), m('b4.rw.shard'), { group: GL + i, bevel: 0.5 });
        r.fill(shard(shin, xx, yy, a + Math.PI, len * 0.5, 0.75), m('b4.rw.shard'), { group: GL + i, bevel: 0.5 });
        if (i === 0) dt(r, shin, xx, yy, m('b4.rw.core'), 3, GL + i);
      });
      // A third, small one ahead of the toe.
      r.fill(shard(foot, c.toe + 2.6, 2.2 + bob(1) * 0.5, 1.2, 1.4, 0.55), m('b4.rw.shard'), { group: GL + 3, bevel: 0.4 });
    },
  },
  ...legend(0xffe0ff, 0x8a2ae0),
};

// =============================================================================
// Earthshaker Boots
// =============================================================================

/** Columnar basalt: tight hexagonal joints. */
const basaltTex: Tex = (x, y) => {
  const r = Math.floor(y / 1.8), xx = x + (r & 1) * 1.1;
  return wrap(xx, 2.2) < 0.45 || wrap(y, 1.8) < 0.4 ? -1 : 0;
};

const basaltTreads: SkinArt = {
  mats: {
    'es.boot': ramp([0x0e1014, 0x1a1e24, 0x2a3038, 0x3e4650, 0x5a6470]),
    'es.band': ramp([0x3a2a08, 0x5e4410, 0x8a6a20, 0xb89038, 0xf0d070], { shiny: true }),
    'es.stone': ramp([0x121214, 0x222326, 0x34363a, 0x4e5056, 0x7a7c84], { tex: basaltTex }),
    'es.crack': plain(0x060608),
    'es.glow': glow(0xfff060),
  },
};

const BASALT = [0x14100e, 0x241c18, 0x362a22, 0x4c3c30];
/** Magma pulsing down through the seams of the rock. */
const magmaTex: Tex = (x, y, ph) => {
  const v = Math.sin(x * 1.25 + Math.sin(y * 1.6) * 2) + Math.sin(y * 1.05 - x * 0.45) * 0.6;
  if (Math.abs(v) >= 0.14) return hash(Math.floor(x * 1.3), Math.floor(y * 1.3)) < 0.12 ? -1 : 0;
  return wrap(Math.floor(x * 0.6) + ph, 4) < 2 ? 4 : 1;
};

const tectonicTreads: SkinArt = {
  mats: {
    'b4.tt.rock': ramp([...BASALT, 0xffa040], { tex: magmaTex }),
    'b4.tt.slab': ramp([0x1e1814, 0x3a302a, 0x5a4c40, 0x7c6a5a, 0xa8947e], { step: 0.13, tex: (x, y) => (hash(Math.floor(x * 1.2), Math.floor(y * 1.2) + 2) < 0.14 ? -1 : 0) }),
    'b4.tt.band': ramp([0x0e0c0c, 0x1c1818, 0x2e2828, 0x4a4040, 0x8a7a70], { shiny: true }),
    'b4.tt.magma': { base: 0xff8020, glow: true, ramp: [0x5a0e04, 0xa82808, 0xe85a10, 0xff9a30, 0xffe090], tex: (_x, _y, ph) => [0, 1, 0, -1][ph % 4] },
    'b4.tt.hot': glow(0xffe070),
  },
  boots: {
    mat: 'b4.tt.rock', height: 0.66, bulk: 0.95, trim: 'b4.tt.band', wing: null, knee: null,
    over(r, shin, foot, m, c) {
      const o = { group: c.g, toneBias: c.bias }, w = c.w, ph = r.phase % 4;
      // A thick, jagged slab sole, magma glowing in the seam between it and the boot.
      const sole = foot.poly([-3.6, -0.6, c.toe + 2.2, -0.8, c.toe + 3.2, -2.2, c.toe + 2, -4, c.toe * 0.4, -3.6, -1.6, -4.2, -3.6, -3, -4.4, -1.6], 0.3);
      r.fill(sole, m('b4.tt.slab'), { ...o, bevel: 1.6 });
      ln(r, foot, -3, -1.1, c.toe + 2.2, -1.2, m('b4.tt.magma'), 3, c.g);
      // Two tectonic plates over the shin, one pushed up over the other, magma welling in the fault.
      const lo = shin.poly([1, w - 0.8, c.top * 0.5, w - 0.4, c.top * 0.55, w + 1.4, 1.4, w + 1.8], 0.3);
      const hi = shin.poly([c.top * 0.48, w - 0.6, c.top + 0.2, w - 0.6, c.top + 1.6, w + 1.6, c.top * 0.62, w + 2.4], 0.3);
      r.fill(lo, m('b4.tt.slab'), { group: GL, bevel: 1.2, toneBias: c.bias });
      r.fill(shin.cap(c.top * 0.52, w - 0.4, c.top * 0.58, w + 1.8, 0.6), m('b4.tt.magma'), { group: GL });
      r.fill(hi, m('b4.tt.slab'), { group: GL + 1, bevel: 1.2, toneBias: c.bias });
      // Rock spurs: one jutting back off the cuff, one off the heel, one up off the toe.
      r.fill(shin.poly([c.top - 2.6, -w + 0.4, c.top + 1.6, -w - 2.4, c.top + 0.6, -w - 0.2, c.top - 0.6, -w + 1.2]), m('b4.tt.slab'), { group: GL + 2, bevel: 0.9, toneBias: c.bias });
      r.fill(foot.poly([-2.6, -0.4, -5.2, 0.8, -3.2, -1.8]), m('b4.tt.slab'), { group: GL + 2, bevel: 0.8, toneBias: c.bias });
      r.fill(foot.poly([c.toe - 1.8, 1.2, c.toe - 0.4, 3.2, c.toe + 0.6, 0.8]), m('b4.tt.slab'), { group: GL + 3, bevel: 0.8, toneBias: c.bias });
      if (c.far) return;
      // A bead of magma swelling at the toe seam and dripping off, over the loop.
      const drip = [[0.5, 0], [0.7, -0.4], [0.6, -1.3], [0.4, -2.4]][ph];
      r.fill(foot.circ(c.toe + 2.6, -1.4 + drip[1], drip[0]), m('b4.tt.magma'), { group: c.g });
      if (ph === 2) r.fill(foot.cap(c.toe + 2.6, -1.4, c.toe + 2.6, -2.5, 0.25), m('b4.tt.magma'), { group: c.g });
      dt(r, shin, c.top * 0.55, w + 0.6, m('b4.tt.hot'), 3, GL);
    },
  },
  ...legend(0xffd070, 0xd8380a),
};

// =============================================================================
// Frostwalkers
// =============================================================================

/** Shaggy yeti hair hanging in long strands. */
const shag: Tex = (x, y) => (wrap(y * 1.4 + Math.sin(x * 0.8) * 0.6, 1.6) < 0.45 ? -1 : 0);

const yetiBoots: SkinArt = {
  mats: {
    'fw.boot': ramp([0x4a5a6a, 0x7a8c9c, 0xb4c4d0, 0xdce6ee, 0xf6faff], { tex: shag }),
    'fw.fur': ramp([0x6a5a4a, 0x9a8670, 0xc8b496, 0xe8dcc4, 0xfff8ea], { tex: (x, y) => (wrap(x * 1.2 + Math.sin(y * 1.9) * 0.7, 1.4) < 0.45 ? -1 : 0) }),
    'fw.strap': ramp([0x3a2a1a, 0x5a4430, 0x846a4e, 0xac9070, 0xd0b896]),
    'fw.ice': ramp([0x6a6250, 0x9a9278, 0xd0c8a8, 0xf0ead2, 0xffffff], { shiny: true }),
  },
};

const GICE = [0x1e4a7a, 0x3a7ab0, 0x6ab4e0, 0xaee4fa, 0xffffff];
/** Clear ice: a few frozen-in cracks, a glint sweeping across it. */
const facetTex: Tex = (x, y, ph) => {
  if (wrap(x * 0.8 + y * 0.6 - ph * 2.2, 10) < 0.8) return 1;
  return hash(Math.floor(x * 0.8), Math.floor(y * 0.8) + 4) < 0.08 ? -1 : 0;
};

const glacierSkates: SkinArt = {
  mats: {
    'b4.gk.ice': ramp(GICE, { shiny: true, tex: facetTex }),
    'b4.gk.frost': ramp([0x5a8ab0, 0x8ab8d8, 0xc0e4f4, 0xe8f8ff, 0xffffff], { shiny: true }),
    'b4.gk.blade': ramp([0x1a1e28, 0x3a4250, 0x8a94a6, 0xd4dce8, 0xffffff], { shiny: true }),
    'b4.gk.strap': ramp([0x0e1a2a, 0x1a2c44, 0x2a4464, 0x406088, 0x6a8ab0]),
    'b4.gk.core': glow(0x8af0ff),
  },
  boots: {
    mat: 'b4.gk.ice', height: 0.7, bulk: 0.4, trim: 'b4.gk.strap', wing: null, knee: null,
    over(r, shin, foot, m, c) {
      const o = { group: c.g, toneBias: c.bias }, w = c.w;
      // A dark sole plate, then the skate: a long steel runner on two posts, its nose curling up past the toe.
      const blade = m('b4.gk.blade');
      r.fill(foot.poly([-2.4, -1.4, c.toe + 0.8, -1.2, c.toe + 0.6, -2.2, -2.2, -2.4], 0.3), m('b4.gk.strap'), { ...o, bevel: 0.6 });
      for (const x of [-1, c.toe * 0.7]) r.fill(foot.rect(x, -2.8, 0.45, 0.8), blade, { group: GL, bevel: 0.3, toneBias: c.bias });
      const runner = union(
        foot.poly([-3, -3.4, c.toe + 1.6, -3.4, c.toe + 2.2, -3.9, -2.6, -4.2]),
        foot.cap(c.toe + 1.6, -3.6, c.toe + 2.8, -2.6, 0.4, 0.3),
        foot.circ(c.toe + 2.6, -2.1, 0.45),
      );
      r.fill(runner, blade, { group: GL + 1, bevel: 0.5, toneBias: c.bias, lightBias: 0.25 });
      // A strap across the instep.
      r.fill(foot.cap(c.toe * 0.35, 1.4, c.toe * 0.5, -1.4, 0.5), m('b4.gk.strap'), { ...o, bevel: 0.5 });
      // Frost spikes bursting up and back from the cuff, and one off the heel.
      const fr = m('b4.gk.frost');
      const spikes: [number, number, number, number][] = [[w * 0.4, 0.15, 3, 0.75], [-w * 0.3, -0.35, 3.6, 0.85], [-w - 0.2, -0.8, 2.6, 0.7]];
      spikes.forEach(([y, a, len, wd], i) => r.fill(shard(shin, c.top - 0.6, y, a, len, wd), fr, { group: GL + 2 + (i & 1), bevel: 0.6, toneBias: c.bias }));
      r.fill(shard(backOf(foot), 1.2, 0.2, 0.45, 2.4, 0.6), fr, { group: GL + 2, bevel: 0.5, toneBias: c.bias });
      // A glowing ice core at the ankle, set in a frost diamond.
      if (!c.far) {
        r.fill(shin.poly([2.6, w * 0.3 + 1.1, 3.8, w * 0.3, 2.6, w * 0.3 - 1.1, 1.4, w * 0.3]), fr, { group: GL + 4, bevel: 0.5 });
        r.fill(shin.circ(2.6, w * 0.3, 0.5), m('b4.gk.core'), { group: GL + 4 });
      }
    },
  },
};

// =============================================================================
// Savate Boots
// =============================================================================

const redlaceSavates: SkinArt = {
  mats: {
    'sv.boot': ramp([0x0a0a0e, 0x16161c, 0x26262e, 0x3a3a46, 0x6a6a7a], { shiny: true }),
    'sv.cuff': ramp([0x3a0a0e, 0x6a141a, 0x9a2028, 0xc8383a, 0xf07a70]),
    'sv.lace': plain(0xe8303a),
    'sv.cap': ramp([0x4a2e0a, 0x7e5418, 0xb88a34, 0xe8c060, 0xfff4c0], { shiny: true }),
  },
};

/** Cloth wraps crossing diagonally up the shin. */
const wrapTex: Tex = (x, y) => (wrap(x + y * 0.55, 1.8) < 0.45 || wrap(x - y * 0.55, 1.8) < 0.3 ? -1 : 0);

const ironLotus: SkinArt = {
  mats: {
    'b4.il.wrap': ramp([0x6a6458, 0x9a948a, 0xcac4b8, 0xeae6dc, 0xfffcf4], { tex: wrapTex }),
    'b4.il.slip': ramp([0x08080c, 0x121218, 0x1e1e28, 0x30303e, 0x585868]),
    'b4.il.iron': ramp([0x1e2026, 0x3a3e48, 0x60666e, 0x9aa0aa, 0xeef2f8], { shiny: true }),
    'b4.il.petal': ramp([0x8a2a52, 0xc44a78, 0xec84a6, 0xfcc4d6, 0xfff4f8], { tex: (x) => (x > 4.6 ? 1 : 0) }),
    'b4.il.cord': ramp([0x4a0a10, 0x7e141c, 0xb8202a, 0xe04a4a, 0xff9a8a]),
    'b4.il.gem': glow(0x8affc0),
  },
  boots: {
    mat: 'b4.il.wrap', height: 0.8, bulk: 0.05, trim: 'b4.il.cord', wing: null, knee: null,
    over(r, shin, foot, m, c) {
      const o = { group: c.g, toneBias: c.bias }, w = c.w, ph = r.phase % 4;
      // A low black slipper over the foot, an iron cap over the toe.
      r.fill(foot.poly([-2.2, 1.4, c.toe * 0.45, 1.4, c.toe + 0.9, 0.5, c.toe + 1.1, -0.9, -1.8, -1.6, -2.6, -0.2]), m('b4.il.slip'), { ...o, bevel: 1.1 });
      r.fill(foot.poly([c.toe - 1.4, 1.1, c.toe + 0.9, 0.6, c.toe + 1.4, -0.4, c.toe + 0.9, -1.1, c.toe - 1.4, -1.2], 0.3), m('b4.il.iron'), { group: GL, bevel: 1, toneBias: c.bias });
      // A lotus in bloom cupping the ankle: petals fanning up and out, the outer ones darker, white at the tips.
      const pb = 1.4;
      const petal = (th: number, len: number, wd: number, g: number, bias: number) =>
        r.fill(shin.ell(pb + Math.cos(th) * len * 0.5, Math.sin(th) * len * 0.5, len * 0.55, wd, th), m('b4.il.petal'), { group: g, bevel: 0.9, toneBias: c.bias + bias, softLight: true, local: shin });
      petal(-1.15, 4, 1, GL + 1, -1);
      petal(1.15, 4, 1, GL + 1, -1);
      petal(-0.6, 4.4, 1.1, GL + 2, 0);
      petal(0.6, 4.4, 1.1, GL + 2, 0);
      petal(0, 4.8, 1.2, GL + 3, 0);
      // An iron rim on the front petal's edge.
      ln(r, shin, pb + 0.6, Math.sin(0.6) * 1.6 + 0.8, pb + 2.6, Math.sin(0.6) * 3.6 + 0.6, m('b4.il.iron'), 3, GL + 2);
      if (c.far) return;
      // A jade bead at the heart of the lotus; the cord's ends trailing from the cuff.
      r.fill(shin.circ(pb + 0.9, 0, 0.6), m('b4.il.gem'), { group: GL + 3 });
      const s = [0, 0.4, 0.7, 0.3][ph];
      r.fill(shin.cap(c.top - 0.4, -w - 0.4, c.top - 2.6 - s * 0.4, -w - 1.6 - s, 0.35, 0.3), m('b4.il.cord'), { group: GL + 4, bevel: 0.5 });
      r.fill(shin.cap(c.top - 0.4, -w - 0.4, c.top - 1.6 - s * 0.3, -w - 2.6 - s * 0.8, 0.35, 0.3), m('b4.il.cord'), { group: GL + 4, bevel: 0.5 });
    },
  },
};

export const WAVE4_LEGS: Record<string, SkinArt> = {
  'ghoststep_leggings.mist': mistLeggings,
  'ghoststep_leggings.specter': specterTrain,
  'charger_cuisses.bronze': bronzeCuisses,
  'charger_cuisses.centaur': centaurBarding,
  'acrobat_trousers.harlequin': harlequinTrousers,
  'acrobat_trousers.ringmaster': ringmasterStripes,
  'warlord_faulds.blackiron': blackironFaulds,
  'warlord_faulds.kusazuri': kusazuri,
  'warp_boots.teal': tealWarpers,
  'warp_boots.riftwalker': riftwalkers,
  'earthshaker_boots.basalt': basaltTreads,
  'earthshaker_boots.tectonic': tectonicTreads,
  'frostwalkers.yeti': yetiBoots,
  'frostwalkers.glacier': glacierSkates,
  'savate_boots.redlace': redlaceSavates,
  'savate_boots.lotus': ironLotus,
};
