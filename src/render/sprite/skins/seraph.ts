import { css } from '../../pixel/color';
import { material, type Raster, type Tex } from '../../pixel/raster';
import { intersect, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { ring, type Layer } from '../../auraKit';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { SkinArt, SkinFx } from './index';
import { epicFx, Q, wrap } from './kit';

/**
 * Epic set: Seraphic Choir. The heavenly host: white marble and pearl enamel,
 * pale gold filigree, sky-blue sapphires and white feathers. Pure rather than
 * blazing: the light lives in halos, gems and edges, and the wings breathe.
 */

/** Pearl enamel and white marble: cool lilac shadows so the white still has form. */
const PEARL = [0x7c84a2, 0xaab2cc, 0xd6dcea, 0xf2f4fa, 0xffffff];
/** Silver-white mail and steel. */
const SILVER = [0x4e566e, 0x7c87a0, 0xaeb8cc, 0xd8e0ec, 0xffffff];
/** Pale gold: softer and lighter than a god-king's gold. */
const GOLD = [0x7a5a26, 0xb08c44, 0xdcbc70, 0xf2dc9c, 0xfffae0];
/** Sky sapphire (self-lit). */
const SAPPHIRE = [0x1c4486, 0x3474c4, 0x64aaea, 0xa8d8ff, 0xf2fbff];
/** White feathers. */
const FEATHER = [0x828aac, 0xb0b8d2, 0xdce2f0, 0xf4f6fc, 0xffffff];
/** Held light: pale gold to white-hot. */
const LIGHT = [0xb08c44, 0xe0c070, 0xfff0b8, 0xfffce8, 0xffffff];
const WHITE = 0xffffff, PALEGOLD = 0xf2dc9c;

/** Barbs across a feather (x along the feather): a rachis down the middle and faint vanes. */
const barbs: Tex = (x, y) => (Math.abs(y) < 0.28 ? -1 : wrap(Math.floor(x * 0.8 - Math.abs(y) * 0.9), 3) === 0 ? -1 : 0);
/** Feather rows on a small wing (any frame). */
const quills: Tex = (x, y) => (wrap(Math.floor(Math.abs(y) * 1.2 + x * 0.3), 2) === 0 ? -1 : 0);
/** Gold filigree: fine scrolls engraved into the enamel, a slow glint drifting over it. */
const filigree: Tex = (x, y, ph) => {
  if (hash(Math.floor(x * 1.5) + ph * 13, Math.floor(y * 1.5) - ph * 7) < 0.012) return 1;
  const v = Math.sin(x * 1.3 + Math.sin(y * 1.1) * 1.8) + Math.sin(y * 1.5 - x * 0.4) * 0.6;
  return Math.abs(v) < 0.16 ? -1 : 0;
};
/** A glint sliding along a part, one step per frame. */
const sheen = (period = 9, speed = 2.25, w = 1.2): Tex => (x, _y, ph) => (wrap(x - ph * speed, period) < w ? 1 : 0);
/** A gem's heart brightening and dimming over the loop. */
const breathe: Tex = (_x, _y, ph) => [0, 1, 0, -1][ph % 4];

const FX = epicFx(WHITE, 0xe8c870, 'twinkle', 0xfff8e0);

/** Particles the full set sheds in battle. */
export const SERAPH_FX: SkinFx = { spark: WHITE, spark2: 0xe8c870, kind: 'twinkle' };

// -----------------------------------------------------------------------------
// Feather helpers
// -----------------------------------------------------------------------------

/** One feather in its own frame (x from the quill to the tip): a long vane with a rounded, slightly hooked tip. */
function featherShape(F: Xf, len: number, w: number): Shape {
  return F.poly([
    0, -w * 0.55, len * 0.35, -w, len * 0.78, -w * 0.9, len, -w * 0.15, len * 0.96, w * 0.45, len * 0.7, w * 0.95, len * 0.3, w * 0.9, 0, w * 0.5,
  ]);
}

/** A frame at (x, y) of frame P pointing along local angle `a` (P's own handedness kept). */
function sub(P: Xf, x: number, y: number, a: number): Xf {
  const flip = Math.sign(P.sx * P.sy) || 1;
  return new Xf(P.x(x, y), P.y(x, y), P.ang + a * flip, Math.abs(P.sx), Math.abs(P.sy) * flip);
}

/** A ring as a polygon (stays round in squashed frames). */
function hoop(F: Xf, cx: number, cy: number, rx: number, ry: number, w: number, n = 24): Shape {
  const out: number[] = [], inn: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    inn.push(cx + Math.cos(a) * (rx - w), cy + Math.sin(a) * (ry - w * 0.7));
  }
  const pts = [...out];
  for (let i = inn.length - 2; i >= 0; i -= 2) pts.push(inn[i], inn[i + 1]);
  return F.poly(pts);
}

// -----------------------------------------------------------------------------
// Judgement of the Choir
// -----------------------------------------------------------------------------

function judgement(): WeaponArt {
  // A white-silver blade with a fuller of pale gold light that pulses up it, a crossguard of two small swept wings,
  // a white grip bound in gold, and a sky sapphire set in a gold pommel.
  return {
    tip: 31,
    mats: {
      blade: material({ base: SILVER[3], ramp: SILVER, shiny: true, tex: (_x, y) => (y > 0.9 ? 1 : y < -1 ? -1 : 0) }),
      fuller: material({ base: LIGHT[2], ramp: LIGHT, glow: true, tex: (x, _y, ph) => (wrap(x - ph * 6, 24) < 5 ? 1 : wrap(x - ph * 6, 24) > 15 ? -1 : 0) }),
      wing: material({ base: FEATHER[2], ramp: FEATHER, shiny: true, tex: quills }),
      gold: material({ base: GOLD[2], ramp: GOLD, shiny: true, tex: sheen(7, 1.75, 1) }),
      grip: material({ base: PEARL[2], ramp: PEARL, tex: (x) => (wrap(x, 1.4) < 0.45 ? -1 : 0) }),
      gem: material({ base: SAPPHIRE[2], ramp: SAPPHIRE, glow: true, tex: breathe }),
      spark: material({ base: WHITE, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      fillAll(r, [t.cap(-5.2, 0, -1, 0, 1.2, 1.05)], m('grip'), o, 1);
      fillAll(r, [t.rect(-3.1, 0, 0.35, 1.3)], m('gold'), o, 0.6);
      // Gold pommel ring around the sapphire.
      fillAll(r, [t.poly([-4.8, -1.4, -6, -2.2, -7.6, -1.6, -8.2, 0, -7.6, 1.6, -6, 2.2, -4.8, 1.4])], m('gold'), o, 1.2);
      r.fill(t.circ(-6.4, 0, 1.15), m('gem'), { group: g, local: o.local });
      // The blade: long and straight, a spade point, the fuller of light down its spine.
      fillAll(r, [t.poly([1.6, -1.8, 25.6, -1.6, 28.4, -1.1, 31, 0, 28.4, 1.1, 25.6, 1.6, 1.6, 1.8])], m('blade'), o, 1.4);
      r.fill(t.poly([3, -0.45, 24, -0.38, 26.4, 0, 24, 0.38, 3, 0.45]), m('fuller'), { group: g, noLine: true, local: o.local });
      // Crossguard: two small wings swept toward the point, each feather its own outline so they read apart.
      for (const s of [-1, 1]) {
        const wing = t.poly([
          0.2, s * 1.1, -0.2, s * 3.4, 0.8, s * 5.4, 2.4, s * 6.6, 5, s * 7.2, 3.6, s * 5.9, 5, s * 5.6, 3.2, s * 4.6, 4.4, s * 4,
          2.6, s * 3.2, 3.2, s * 2.4, 1.8, s * 1.1,
        ]);
        r.fill(wing, m('wing'), { group: s < 0 ? 44 : 45, bevel: 0.9, toneBias: o.toneBias, local: o.local });
        r.fill(t.cap(0, s * 1.2, 0.6, s * 5.2, 0.55, 0.4), m('gold'), { group: s < 0 ? 44 : 45, bevel: 0.6, toneBias: o.toneBias, local: o.local });
      }
      fillAll(r, [t.circ(0.6, 0, 1.5)], m('gold'), o, 1);
      r.dot(t.x(0.6, 0), t.y(0.6, 0), m('gem'), 3, g);
      // A glint of light running off the point on the pulse's crest.
      if (ph === 3) {
        r.dot(t.x(31.6, 0), t.y(31.6, 0), m('spark'), 3, g);
        r.dot(t.x(29.4, 1.6), t.y(29.4, 1.6), m('spark'), 3, g);
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Trumpet of the Last Dawn
// -----------------------------------------------------------------------------

function trumpet(): WeaponArt {
  // A long slender herald's trumpet of pale gold, its bell flaring wide, a white pennant with a gold sun
  // hanging from the tube and waving.
  return {
    tip: 10.5,
    mats: {
      gold: material({ base: GOLD[2], ramp: GOLD, shiny: true, tex: sheen(8, 2, 1) }),
      bell: material({ base: GOLD[2], ramp: GOLD, shiny: true, step: 0.15 }),
      mouth: material({ base: GOLD[0], ramp: GOLD }),
      cloth: material({ base: PEARL[3], ramp: PEARL, tex: (x) => (wrap(x, 2.2) < 0.5 ? -1 : 0) }),
      fringe: material({ base: GOLD[2], ramp: GOLD, shiny: true }),
      sun: material({ base: LIGHT[2], ramp: LIGHT, glow: true, tex: breathe }),
      gem: material({ base: SAPPHIRE[2], ramp: SAPPHIRE, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // The pennant hangs below the tube from two gold rings, its swallow-tailed hem rippling.
      const wv = (k: number) => Math.sin(ph * Q + k * 1.3) * 0.5;
      const pen = t.poly([
        0.8, -0.6, 6.8, -0.6, 6.9 + wv(0) * 0.4, -3.8, 7.1 + wv(1), -7.4, 3.9 + wv(2), -5.6, 0.8 + wv(3), -7.4, 0.7 + wv(3) * 0.4, -3.8,
      ]);
      r.fill(pen, m('cloth'), { group: 46, bevel: 1.2, softLight: true, toneBias: o.toneBias, local: o.local });
      // Gold fringe along the hem.
      const hem = [[7.1 + wv(1), -7.4], [3.9 + wv(2), -5.6], [0.8 + wv(3), -7.4]];
      for (let i = 0; i < 2; i++) r.line(t.x(hem[i][0], hem[i][1]), t.y(hem[i][0], hem[i][1]), t.x(hem[i + 1][0], hem[i + 1][1]), t.y(hem[i + 1][0], hem[i + 1][1]), m('fringe'), 3, 46);
      // A gold sun on the pennant, rays turning between frames.
      const sx = 3.8 + wv(2) * 0.4, sy = -3.2;
      r.fill(t.circ(sx, sy, 1.35), m('fringe'), { group: 46, bevel: 0.8, toneBias: o.toneBias });
      r.dot(t.x(sx, sy), t.y(sx, sy), m('sun'), 3, 46);
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + (ph % 2) * (Math.PI / 4);
        r.dot(t.x(sx + Math.cos(a) * 2.5, sy + Math.sin(a) * 2.5), t.y(sx + Math.cos(a) * 2.5, sy + Math.sin(a) * 2.5), m('fringe'), 3, 46);
      }
      // The tube: mouthpiece behind the hand, slender run to the bell.
      fillAll(r, [t.cap(-3.6, 0, 7.6, 0, 0.6, 0.7)], m('gold'), o, 0.8);
      fillAll(r, [t.poly([-4.6, -1, -3.8, -0.5, -3.8, 0.5, -4.6, 1])], m('bell'), o, 0.6);
      fillAll(r, [t.rect(0.9, 0, 0.4, 1.2), t.rect(6.6, 0, 0.4, 1.2)], m('bell'), o, 0.6);
      r.dot(t.x(0.9, 0.9), t.y(0.9, 0.9), m('gem'), 3, g);
      // The flared bell.
      fillAll(r, [t.poly([7, -0.75, 9, -1.3, 10.2, -2.3, 10.9, -3.3, 11.3, -3.4, 11.3, 3.4, 10.9, 3.3, 10.2, 2.3, 9, 1.3, 7, 0.75])], m('bell'), o, 1.2);
      r.fill(t.ell(11.1, 0, 0.5, 2.8), m('mouth'), { group: g, flat: 1, noLine: true });
    },
  };
}

// -----------------------------------------------------------------------------
// Halo of the Seraph
// -----------------------------------------------------------------------------

/** The halo: a tilted ring of light with motes turning on it (frame F, ring in its x/y plane, tilted flat by `tilt`). */
function halo(r: Raster, F: Xf, rx: number, ry: number, w: number, m: (k: string) => number, g: number): void {
  r.fill(hoop(F, 0, 0, rx, ry, w), m('p.halo'), { group: g });
  // Three motes, a third of a turn apart, turning a twelfth of a turn per frame (seamless over the loop).
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3 + r.phase * (Math.PI / 6);
    const px = Math.cos(a) * (rx - w * 0.5), py = Math.sin(a) * (ry - w * 0.5 * (ry / rx));
    r.dot(F.x(px, py), F.y(px, py), m('p.mote'), 3, g);
  }
}

const haloSkin: SkinArt = {
  mats: {
    // Stock names: anything drawn the stock way comes out white and gold.
    plume: { base: FEATHER[3], ramp: FEATHER, shiny: true }, plumeTip: { base: PALEGOLD, glow: true },
    'p.halo': { base: 0xf6d47a, ramp: [0x9a7434, 0xc89a44, 0xe8c060, 0xf6d47a, 0xfff6d8], glow: true },
    'p.mote': { base: WHITE, glow: true },
    'p.vane': { base: FEATHER[2], ramp: FEATHER, shiny: true, tex: barbs },
    'p.gold': { base: GOLD[2], ramp: GOLD, shiny: true },
    'p.gem': { base: SAPPHIRE[2], ramp: SAPPHIRE, glow: true, tex: breathe },
    'p.wing': { base: FEATHER[2], ramp: FEATHER, shiny: true, tex: barbs },
  },
  glow: [0xfff6d0, 0xd8b050],
  icon(r, t, m) {
    // A halo of light with two white wings spread behind it and a sapphire hung beneath.
    for (const s of [-1, 1]) {
      const fs: [number, number, number, number][] = [[2.4, 2.6, 0.95, 10], [3.4, 1.6, 0.5, 9.6], [4.2, 0.4, 0.05, 8.4], [4.4, -1, -0.4, 6.4]];
      for (const [i, [x, y, a, len]] of fs.entries()) {
        const F = new Xf(t.x(s * x, y), t.y(s * x, y), s > 0 ? a : Math.PI - a, 1, s);
        r.fill(featherShape(F, len, 1.5), m('p.wing'), { group: 10 + i + (s > 0 ? 5 : 0), bevel: 1, local: F });
      }
    }
    const H = new Xf(t.x(0, 3.2), t.y(0, 3.2), 0);
    r.fill(hoop(H, 0, 0, 7.6, 3, 1.6), m('p.gold'), { group: 2, bevel: 0.8 });
    r.fill(hoop(H, 0, 0, 7, 2.5, 0.8), m('p.halo'), { group: 2 });
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3 + 0.5;
      r.dot(H.x(Math.cos(a) * 6.8, Math.sin(a) * 2.3), H.y(Math.cos(a) * 6.8, Math.sin(a) * 2.3), m('p.mote'), 3, 2);
    }
    r.line(t.x(0, 0.2), t.y(0, 0.2), t.x(0, -6), t.y(0, -6), m('p.gold'), 3, 3);
    r.fill(t.poly([0, -6, 1.6, -8, 0, -10.6, -1.6, -8]), m('p.gem'), { group: 3 });
  },
  plume(r, H, m, g, sway) {
    // The halo floats above and a little behind the head, bobbing; a small white feather tucked behind the ear.
    const ph = r.phase % 4, bob = [0, 0.35, 0.55, 0.35][ph];
    const F = sub(H, -4.4, 4.2, 2.05 + sway * 0.25);
    r.fill(featherShape(F, 6.4, 1.15), m('p.vane'), { group: g, bevel: 0.9, local: F });
    r.fill(F.cap(-0.8, 0, 0.6, 0, 0.55), m('p.gold'), { group: g, bevel: 0.5 });
    halo(r, new Xf(H.x(-1.2, 12.2 + bob), H.y(-1.2, 11.8 + bob), H.ang + 0.12, H.sx, H.sy), 5.6, 1.9, 1.5, m, g);
  },
};

// -----------------------------------------------------------------------------
// Diadem of Light
// -----------------------------------------------------------------------------

function diadem(): SkinArt {
  // A pale gold diadem: slender sunburst rays rising from the band, the longest tipped with light,
  // a sky sapphire at the brow and small white wings at the temples.
  return {
    head: () => ({
      mats: {
        'h.gold': material({ base: GOLD[2], ramp: GOLD, shiny: true, step: 0.15, tex: sheen(6, 1.5, 1) }),
        'h.ray': material({ base: GOLD[3], ramp: GOLD, shiny: true, tex: (_x, y, ph) => (wrap(y - ph * 1.5, 6) < 1 ? 1 : 0) }),
        'h.wing': material({ base: FEATHER[2], ramp: FEATHER, shiny: true, tex: quills }),
        'h.gem': material({ base: SAPPHIRE[2], ramp: SAPPHIRE, glow: true, tex: breathe }),
        'h.light': material({ base: WHITE, glow: true }),
      },
      draw(r, H, m, g) {
        const ph = r.phase % 4, beat = [0, 0.5, 0.8, 0.5][ph];
        const wing = (dx: number, dy: number, bias: number, gr: number) => {
          r.fill(H.poly([
            -2.6 + dx, 4.4 + dy, -5 + dx, 6.6 + dy + beat * 0.5, -8.6 + dx, 8.8 + dy + beat, -7.8 + dx, 7.4 + dy + beat * 0.7,
            -9.6 + dx, 7.2 + dy + beat * 0.8, -8 + dx, 6 + dy + beat * 0.5, -9 + dx, 5 + dy + beat * 0.3, -6 + dx, 4.4 + dy, -3.4 + dx, 3.2 + dy,
          ]), m('h.wing'), { group: gr, bevel: 1, toneBias: bias, local: H });
        };
        // The far temple's wing peeks over the crown, behind everything.
        wing(2.6, 0.8, -1, g);
        // Sunburst rays fanning from a point below the brow: long and short in turn.
        const rays: [number, number][] = [[-4.4, 2.4], [-3.2, 3.6], [-2, 2.2], [-0.8, 5], [0.4, 2.6], [1.6, 6.2], [2.8, 2.6], [4, 4.6], [5.1, 2]];
        const cx = 0.8, cy = -4;
        const base = (x: number) => 4.3 + ((x + 5.4) / 11.4) * 0.8;
        for (const [x, len] of rays) {
          const y0 = base(x) + 0.4, dx = x - cx, dy = y0 - cy, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
          const w = len > 3 ? 0.62 : 0.5;
          r.fill(H.poly([x - uy * w, y0 + ux * w, x + ux * len, y0 + uy * len, x + uy * w, y0 - ux * w]), m('h.ray'), { group: g, bevel: 0.6, local: H });
        }
        // The band, a filigree line along it, and the sapphire at the brow in a gold setting.
        r.fill(H.cap(-5.6, 4.1, 6.1, 4.9, 0.85), m('h.gold'), { group: g, bevel: 1, local: H });
        r.fill(H.poly([4.4, 4.5, 5.5, 6.4, 6.6, 4.5, 5.5, 2.9]), m('h.gold'), { group: g, bevel: 0.8 });
        r.fill(H.poly([4.9, 4.5, 5.5, 5.6, 6.1, 4.5, 5.5, 3.5]), m('h.gem'), { group: g });
        // Light gathers at the tip of one long ray, then the next.
        const lit = rays.filter(([, len]) => len > 4)[[0, 1, 2, 1][ph]];
        const [lx, len] = lit, y0 = base(lx) + 0.4, l = Math.hypot(lx - cx, y0 - cy);
        const tx = lx + ((lx - cx) / l) * (len + 0.6), ty = y0 + ((y0 - cy) / l) * (len + 0.6);
        r.dot(H.x(tx, ty), H.y(tx, ty), m('h.light'), 3, g);
        wing(0, 0, 0, g);
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Seraph's Wingplate
// -----------------------------------------------------------------------------

/**
 * One great wing rising from the back (torso frame T): long feathers fanning from the arm, each its own outline,
 * coverts over their roots and a gold edge along the leading arm. `flex` lifts and spreads it.
 */
function greatWing(r: Raster, T: Xf, m: (k: string) => number, rx: number, ry: number, flex: number, sway: number, bias: number, g0: number): void {
  const W = [rx - 7.2 - flex * 0.3 - sway, ry + 10.4 + flex * 0.9];
  const R = [rx, ry];
  const n = 7;
  // Long feathers first, from the root (lowest, shortest) to the wrist (longest), so the upper ones lie on top.
  for (let k = n - 1; k >= 0; k--) {
    const u = k / (n - 1);
    const bx = W[0] + (R[0] - W[0]) * u * 0.92, by = W[1] + (R[1] - W[1]) * u * 0.92;
    const a = 2.72 + u * 1.25 - flex * 0.12 * (1 - u);
    const len = 13.4 - u * 5.2 + flex * 0.5 * (1 - u);
    const F = sub(T, bx, by, a);
    r.fill(featherShape(F, len, 1.5), m(k % 2 ? 'k.featherD' : 'k.feather'), { group: g0 + k, bevel: 1, toneBias: bias, lightBias: 0.25, local: F });
  }
  // Coverts: a soft mass along the arm, scalloped at its lower edge.
  const cov: Shape[] = [];
  for (let k = 0; k < 5; k++) {
    const u = k / 4;
    cov.push(T.circ(W[0] + (R[0] - W[0]) * u - 1 + u * 0.2, W[1] + (R[1] - W[1]) * u - 1.1, 2.1 - u * 0.3));
  }
  r.fill(union(...cov, T.cap(W[0], W[1], R[0], R[1], 1.4, 1.6)), m('k.covert'), { group: g0 + n, bevel: 1.2, toneBias: bias, local: T });
  // A gold edge along the leading arm, a pearl at the wrist.
  r.fill(T.cap(R[0] + 0.4, R[1] + 0.8, W[0] + 0.2, W[1] + 0.9, 0.45), m('k.gold'), { group: g0 + n, bevel: 0.5, toneBias: bias });
  r.dot(T.x(W[0] + 0.2, W[1] + 0.9), T.y(W[0] + 0.2, W[1] + 0.9), m('k.light'), 3, g0 + n);
}

function wingplate(): SkinArt {
  // White enamel plate worked with pale gold filigree, a sky sapphire at the sternum in a gold sunburst, pearl
  // pauldrons rimmed in gold, and above all a pair of great white wings rising from the back that breathe slowly.
  return {
    mats: {
      mirror: { base: PEARL[2], ramp: PEARL, shiny: true, step: 0.15, tex: filigree },
      mirrorGlow: { base: GOLD[2], ramp: GOLD, shiny: true },
      'k.gold': { base: GOLD[2], ramp: GOLD, shiny: true, tex: sheen(7, 1.75, 1) },
      'k.feather': { base: FEATHER[2], ramp: FEATHER, shiny: true, tex: barbs },
      'k.featherD': { base: FEATHER[2], ramp: [0x767ea2, 0xa4acc8, 0xd2d8ea, 0xeef0f8, 0xffffff], tex: barbs },
      'k.covert': { base: FEATHER[3], ramp: FEATHER, shiny: true, tex: (x, y) => (wrap(Math.floor(x * 0.9 + y * 0.6), 3) === 0 ? -1 : 0) },
      'k.pearl': { base: PEARL[3], ramp: PEARL, shiny: true, step: 0.15 },
      'k.gem': { base: SAPPHIRE[2], ramp: SAPPHIRE, glow: true, tex: breathe },
      'k.light': { base: WHITE, glow: true },
    },
    chest: {
      pauldron: null, sleeveLen: 1,
      back(r, T, m, c) {
        const ph = r.phase % 4, flex = [0, 0.6, 1, 0.6][ph], s = c.sway * 1.6, top = c.top;
        // The far wing sits a little forward and higher, a shade darker; the near wing over it.
        greatWing(r, T, m, -0.4, top - 1.2, flex, s, -1, 40);
        greatWing(r, T, m, -2.4, top - 2.6, flex, s, 0, 50);
      },
      shoulder(r, S, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        r.fill(S.ell(0, 0.9, 3, 2.3), m('k.pearl'), { ...o, bevel: 1.6, local: S });
        r.fill(intersect(S.ell(0, 0.9, 3, 2.3), S.rect(0, -0.9, 4, 0.55)), m('k.gold'), { ...o, flat: 2, noLine: true });
        r.dot(S.x(0.6, 1.6), S.y(0.6, 1.6), m('k.gem'), 3, c.g);
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top;
        // A gold collar band, a sunburst of gold around the sternum sapphire, and filigree scrolls sweeping out from it.
        r.fill(T.ell(b.chestPush * 0.35, top + 0.3, 4.2, 1.2), m('k.gold'), { group: c.g, bevel: 1 });
        const x = b.chestPush * 0.7 + 1.2, y = top - 4.2;
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4, l = k % 2 ? 1.9 : 2.7;
          r.line(T.x(x, y), T.y(x, y), T.x(x + Math.cos(a) * l, y + Math.sin(a) * l), T.y(x + Math.cos(a) * l, y + Math.sin(a) * l), m('k.gold'), 3, c.g);
        }
        r.fill(T.poly([x, y + 1.7, x + 1.2, y, x, y - 1.7, x - 1.2, y]), m('k.gem'), { group: c.g, local: T });
        // Gold piping down the front edge of the plate, and a belt of gold.
        r.line(T.x(x - 0.4, y - 2.6), T.y(x - 0.4, y - 2.6), T.x(x - 1.2, 1.6), T.y(x - 1.2, 1.6), m('k.gold'), 2, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Choir Chausses
// -----------------------------------------------------------------------------

function chausses(): SkinArt {
  // Silver-white mail under a white tabard flap edged in pale gold, pearl knee cops with a small gold feather on each.
  return {
    mats: {
      chain: { base: SILVER[3], ramp: SILVER, shiny: true, step: 0.14, tex: (x, y) => (wrap(Math.floor(x + y), 2) === 0 ? -1 : 0) },
      chainDark: { base: SILVER[1], ramp: SILVER, shiny: true },
      chainPlate: { base: PEARL[3], ramp: PEARL, shiny: true, step: 0.15 },
      'l.cloth': { base: PEARL[3], ramp: PEARL, tex: (_x, y) => (wrap(Math.floor(y * 1.2), 3) === 0 ? -1 : 0) },
      'l.gold': { base: GOLD[2], ramp: GOLD, shiny: true, tex: sheen(8, 2, 1.2) },
      'l.feather': { base: GOLD[3], ramp: GOLD, shiny: true },
      'l.gem': { base: SAPPHIRE[2], ramp: SAPPHIRE, glow: true },
    },
    legs: {
      mat: 'chain', trim: null, knee: 'chainPlate', tasset: null, rune: null, wraps: null, bulk: 0.25,
      over(r, t, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w, L = c.len;
        // A small gold feather lying on the knee cop, pointing up the thigh.
        const kr = c.body.kneeR;
        const KF = new Xf(t.x(-0.4, kr * 0.4), t.y(-0.4, kr * 0.4), t.ang + (t.sy < 0 ? -1 : 1) * 0.15, 1, t.sy);
        r.fill(featherShape(KF, 3.6, 0.85), m('l.feather'), { group: c.far ? 25 : 26, bevel: 0.6, toneBias: c.bias });
        // The tabard flap hanging from the belt over the thigh, its hem stirring, gold along the edge.
        const hem = L * 0.42, fl = [0, 0.35, 0.55, 0.35][ph];
        const flap = t.poly([L + 1, -w - 0.3, L + 1, w + 1.3, hem + 1.4 - fl, w + 1.6, hem - fl * 0.6, w * 0.3, hem + 1.2, -w - 0.2]);
        r.fill(flap, m('l.cloth'), { ...o, bevel: 1.4, softLight: true, local: t });
        r.fill(intersect(flap, t.poly([hem + 2.4 - fl, w + 3, hem + 0.8 - fl * 0.6, w * 0.3, hem + 2.6, -w - 2, hem - 2, -w - 2, hem - 2, w + 3])), m('l.gold'), { ...o, bevel: 0.6, noLine: true, local: t });
        if (c.far) return;
        r.dot(t.x(hem + 1.2 - fl * 0.4, w * 0.6), t.y(hem + 1.2 - fl * 0.4, w * 0.6), m('l.gem'), 3, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Heavenstriders
// -----------------------------------------------------------------------------

function heavenstriders(): SkinArt {
  // White enamel greaves rimmed in pale gold, gold toe caps, and a small feathered wing at each ankle that flutters.
  return {
    mats: {
      zephyr: { base: PEARL[2], ramp: PEARL, shiny: true, step: 0.15, tex: (x) => (wrap(x, 3.2) < 0.45 ? -1 : 0) },
      zephyrTrim: { base: GOLD[2], ramp: GOLD, shiny: true },
      'k.gold': { base: GOLD[2], ramp: GOLD, shiny: true, tex: sheen(6, 1.5, 1) },
      'k.wing': { base: FEATHER[2], ramp: FEATHER, shiny: true, tex: barbs },
      'k.gem': { base: SAPPHIRE[2], ramp: SAPPHIRE, glow: true, tex: breathe },
    },
    boots: {
      wing: null, height: 0.7,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w;
        // Gold toe cap and a gold ridge down the front of the greave.
        r.fill(foot.cap(c.toe - 1.6, -0.2, c.toe - 0.2, -0.5, 1.15, 0.95), m('k.gold'), { ...o, bevel: 0.8 });
        r.fill(shin.cap(1.8, w * 0.75, c.top - 0.6, w * 0.75, 0.42), m('k.gold'), { ...o, bevel: 0.5 });
        r.dot(shin.x(1.4, w * 0.4), shin.y(1.4, w * 0.4), m('k.gem'), 3, c.g);
        if (c.far) return;
        // Three feathers fanning back from the ankle, lifting in turn.
        const lift = [0, 0.18, 0.3, 0.18][ph];
        const fs: [number, number, number][] = [[2.6, 4.6, -1.2], [1.8, 3.8, -1.75], [1, 3, -2.3]];
        for (const [i, [x, len, a]] of fs.entries()) {
          const F = sub(shin, x, -w + 0.2, a + lift * (1 + i * 0.4));
          r.fill(featherShape(F, len, 0.95), m('k.wing'), { group: 30 + i, bevel: 0.8, toneBias: c.bias, local: F });
        }
        r.fill(shin.circ(2, -w + 0.2, 0.9), m('k.gold'), { ...o, bevel: 0.6 });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = { gold: css(GOLD[3]), light: css(0xfff4c8), white: css(WHITE), shade: css(FEATHER[1]), feather: css(FEATHER[3]) };

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function seraphAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  const RX = 13, RY = 3.2;
  if (layer === 'back') {
    // A pale gold ring of light on the ground, breathing, a white glint running round it.
    const run = Math.floor(t * 8) % 28;
    g.globalAlpha = 0.6 + 0.2 * Math.sin(t * 2);
    ring(g, x, y, RX, RY, 28, 'back', (g, px, py, i) => { g.fillStyle = i === run ? AC.white : AC.gold; g.fillRect(px, py, 1, 1); });
    ring(g, x, y, RX, RY, 28, 'front', (g, px, py, i) => { g.fillStyle = i === run ? AC.white : AC.gold; g.fillRect(px, py, 1, 1); });
    // Short rays of light rising off the ring all the way round (behind the fighter), each swelling and fading on its own beat.
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.13, s = Math.sin(a);
      const v = Math.sin(t * 2.2 + k * 2.4);
      if (v < 0) continue;
      const h = 2 + Math.round(v * 5);
      const px = Math.round(x + Math.cos(a) * RX), py = Math.round(y + s * RY);
      g.globalAlpha = 0.45 + 0.45 * v;
      g.fillStyle = AC.light;
      g.fillRect(px, py - h, 1, h);
      g.globalAlpha = 0.5 + 0.5 * v;
      g.fillStyle = AC.white;
      g.fillRect(px, py - h - 1, 1, 1);
    }
  }
  // White feathers drifting slowly down and rocking, some behind the fighter, some in front.
  for (let k = 0; k < 4; k++) {
    if ((k % 2 === 0) !== (layer === 'back')) continue;
    const u = (t * 0.12 + k * 0.27) % 1;
    const rock = Math.sin(t * 2.1 + k * 1.9);
    const side = [-1, 1, -1, 1][k];
    const px = Math.round(x + side * (9 + k * 1.6) + rock * 3), py = Math.round(y - 42 + u * 40);
    g.globalAlpha = Math.min(1, (1 - u) * 5, u * 8);
    // A three-pixel vane with a shaded quill end, tilting as it rocks.
    const tilt = rock > 0.35 ? 1 : rock < -0.35 ? -1 : 0;
    g.fillStyle = AC.feather;
    g.fillRect(px - 1, py, 3, 1);
    g.fillRect(px + (tilt >= 0 ? 1 : -1), py - 1, 1, 1);
    g.fillStyle = AC.white;
    g.fillRect(px, py - 1, 1, 1);
    g.fillStyle = AC.shade;
    g.fillRect(px + (tilt >= 0 ? -2 : 2), py + (tilt ? 1 : 0), 1, 1);
  }
  g.globalAlpha = 1;
}

export const SERAPH: Record<string, SkinArt> = {
  'longsword.judgement': { weapon: judgement, ...FX },
  'war_horn.trumpet': { weapon: trumpet, ...FX },
  'phoenix_feather.halo': haloSkin,
  'storm_crown.diadem': diadem(),
  'mirror_mail.seraph': wingplate(),
  'chain_leggings.seraph': chausses(),
  'zephyr_boots.heavenstriders': heavenstriders(),
};
