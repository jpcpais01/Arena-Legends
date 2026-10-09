import { css } from '../../pixel/color';
import { material, type Raster, type Tex } from '../../pixel/raster';
import { intersect, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { ring, type Layer } from '../../auraKit';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, glow, mats, Q, wrap } from './kit';

/**
 * Epic set: Stormcaller. The sky in a rage: storm-grey steel, gold worked
 * into thunderbird wings, thunderheads rolling, and blue-white lightning
 * that never strikes the same way twice.
 */

/** Storm steel, dark enough that lightning reads across it (four dark tones; the fifth is the bolt). */
const STORM = [0x2a3244, 0x3c465c, 0x58647c, 0x7a88a2];
/** Polished storm steel for raised parts. */
const STEEL = [0x1e2230, 0x2e3446, 0x4c566e, 0x727e98, 0xaab6cc];
const GOLD = [0x6a4214, 0xa8701e, 0xd8a030, 0xf0c040, 0xfff0a8];
const CLOUD = [0x2e3444, 0x434b5e, 0x5a6478, 0x7a8498, 0xa8b0c0];
const BOLT = 0xf0f8ff, ARC = 0x8ad0ff, ELEC = 0x3a5ad8, VEIN = 0xa8dcff;

/**
 * Lightning crawling through a material: thin forked veins that take a new
 * path every frame (and nearly die out on the last), so the surface flickers.
 */
const crackle = (period = 7, density = 0.45, along = false): Tex => (x0, y0, ph) => {
  // Bolts run along y (or along x for long parts): one per column of `period`, jagging every 2.6 units.
  const x = along ? y0 : x0, y = along ? x0 : y0;
  const p = ph % 4, col = Math.floor(x / period);
  if (hash(col * 13 + 5, p * 7 + 1) > density * [1, 0.8, 1, 0.35][p]) return 0;
  const sy = y / 2.6, seg = Math.floor(sy), f = sy - seg;
  if (hash(col * 5 + 2, seg + p * 17) > 0.72) return 0;
  const jag = (s: number) => (hash(col * 3 + 7, s * 5 + p * 11) - 0.5) * period * 0.55;
  const cx = (col + 0.5) * period + jag(seg) + (jag(seg + 1) - jag(seg)) * f;
  return Math.abs(x - cx) < 0.55 ? 4 : 0;
};
/** Overlapping scales, rows of arcs. */
const scales: Tex = (x, y) => {
  const row = Math.floor(y / 1.6);
  const u = wrap(x + (row % 2) * 1.2, 2.4) - 1.2, v = wrap(y, 1.6);
  return u * u * 0.6 + (v - 1.6) * (v - 1.6) < 0.5 ? 0 : -1;
};
/** Feather rows on gold wings (darker between the quills). */
const quills: Tex = (x, y) => (wrap(Math.floor(Math.abs(y) * 1.3 + x * 0.3), 2) === 0 ? -1 : 0);
/** Thunderheads: billows rolling slowly through, one step per frame. */
const billow: Tex = (x, y, ph) => (Math.sin(x * 0.7 + Math.sin(y * 0.9 + ph * Q) * 1.6 - ph * Q * 0.5) > 0.45 ? 1 : 0) - (Math.sin(y * 1.3 + x * 0.3) > 0.8 ? 1 : 0);

const FX = epicFx(BOLT, ELEC, 'twinkle', 0xbfe4ff);

/** Particles the full set sheds in battle. */
export const STORMCALLER_FX: SkinFx = { spark: BOLT, spark2: ELEC, kind: 'twinkle' };

// -----------------------------------------------------------------------------
// Lightning helpers
// -----------------------------------------------------------------------------

/** A jagged bolt between two raster points: `n` legs zigzagging up to `amp` px off the line, seeded. */
function boltPts(ax: number, ay: number, bx: number, by: number, n: number, amp: number, seed: number): number[] {
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  const pts = [ax, ay];
  for (let i = 1; i < n; i++) {
    const u = i / n, j = (i % 2 ? 1 : -1) * amp * (0.35 + 0.65 * hash(seed, i * 7 + 3));
    pts.push(ax + dx * u + nx * j, ay + dy * u + ny * j);
  }
  pts.push(bx, by);
  return pts;
}
/** Draws a bolt's legs as one-pixel lines. */
function strike(r: Raster, pts: number[], m: number, g: number, tone = 3): void {
  for (let i = 0; i + 3 < pts.length; i += 2) r.line(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], m, tone, g);
}
/** A bolt between two points of frame F. */
function zap(r: Raster, F: Xf, ax: number, ay: number, bx: number, by: number, n: number, amp: number, seed: number, m: number, g: number): number[] {
  const pts = boltPts(F.x(ax, ay), F.y(ax, ay), F.x(bx, by), F.y(bx, by), n, amp, seed);
  strike(r, pts, m, g);
  return pts;
}
/** The lightning-bolt glyph standing on (x, y) in frame F, `h` tall, its tip leaning by `lean`. */
function boltGlyph(F: Xf, x: number, y: number, h: number, w = 1, lean = 0): Shape {
  // A slanted lower stroke, and offset back over it, a blade tapering to the tip.
  const k = h / 7;
  return union(
    F.poly([x - 1.1 * w, y, x + 0.7 * w, y, x + 1.5 * w + lean * 0.4, y + 3.9 * k, x - 0.3 * w + lean * 0.4, y + 3.9 * k]),
    F.poly([x - 1.4 * w + lean * 0.4, y + 3.1 * k, x + 0.6 * w + lean * 0.4, y + 3.1 * k, x + 0.2 * w + lean, y + 7 * k]),
  );
}

// -----------------------------------------------------------------------------
// Thunderstring
// -----------------------------------------------------------------------------

function thunderstring(): WeaponArt {
  // A storm-steel recurve, lightning crawling in its limbs, gold thunderbird wings spreading from both tips,
  // a thunderbird's head at the grip, and for a string a bolt of lightning that crackles anew every frame.
  const recurve = 1.0;
  return {
    tip: 22,
    mats: {
      limb: material({ base: STORM[2], ramp: [...STORM, VEIN], tex: crackle(3, 0.7, true) }),
      wing: material({ base: GOLD[2], ramp: GOLD, shiny: true, tex: quills }),
      gold: material({ base: GOLD[2], ramp: GOLD, shiny: true }),
      grip: material({ base: 0x2a3858, tex: (x) => (wrap(x, 1.4) < 0.45 ? -1 : 0) }),
      tip: material({ base: BOLT, glow: true }),
      eye: material({ base: ARC, glow: true, tex: (_x, _y, ph) => (ph % 2 ? 1 : 0) }),
      string: material({ base: BOLT, glow: true }),
      arc: material({ base: ARC, glow: true }),
      arrow: material({ base: ARC, glow: true }),
      fletch: material({ base: GOLD[3], glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      const pull = o.pull ?? 0;
      const bend = 2.5 + pull * 2.5;
      const path = (u: number, s: number): [number, number] => {
        const flick = Math.max(0, u - 0.72);
        return [-bend * u * u + recurve * flick * flick * 14, s * 22 * u];
      };
      const thick = (u: number) => 1.5 - u * 0.75 + (u > 0.12 && u < 0.3 ? 0.25 : 0);
      // Gold thunderbird wings spread from each tip: three primaries fanning forward and out, flexing as they breathe.
      const flex = [0, 0.35, 0.6, 0.35][ph];
      for (const s of [-1, 1]) {
        const [ax, ay] = path(0.56, s), [bx, by] = path(0.76, s), [cx, cy] = path(0.94, s);
        const wing = t.poly([
          ax - 0.3, ay, ax + 2.4, ay + s * 0.4, bx + 5 + flex, by - s * 0.8, bx + 3.4, by + s * 1.2,
          cx + 5.6 + flex, cy + s * 0.4, cx + 3.2, cy + s * 2, cx + 4 + flex * 0.7, cy + s * 4.6, cx + 0.6, cy + s * 3,
          cx - 0.8, cy + s * 1,
        ]);
        fillAll(r, [wing], m('wing'), o, 1, s < 0 ? -1 : 0);
      }
      const limbs: Shape[] = [];
      for (const s of [-1, 1]) {
        let [px, py] = path(0, s);
        for (let i = 1; i <= 8; i++) {
          const [nx, ny] = path(i / 8, s);
          limbs.push(t.cap(px, py, nx, ny, thick(i / 8)));
          px = nx; py = ny;
        }
      }
      fillAll(r, [union(...limbs)], m('limb'), o, 1);
      // Gold collars where the riser meets each limb.
      for (const s of [-1, 1]) {
        const [x, y] = path(0.3, s);
        fillAll(r, [t.rect(x, y, 1.6, 0.45)], m('gold'), o, 0.6);
      }
      // The grip, bound in blue leather; a thunderbird's head looks out over the arrow rest.
      fillAll(r, [t.cap(0, -2.6, 0, 2.6, 1.45)], m('grip'), o, 1);
      fillAll(r, [t.poly([0.6, 1.6, 2.6, 1.4, 4.6, 0.4, 3, 0, 2.2, -0.8, 0.6, -0.6])], m('gold'), o, 0.8);
      r.dot(t.x(2.2, 0.8), t.y(2.2, 0.8), m('eye'), 3, g);
      const top = path(1, 1), bot = path(1, -1);
      r.dot(t.x(top[0], top[1]), t.y(top[0], top[1]), m('tip'), 3, g);
      r.dot(t.x(bot[0], bot[1]), t.y(bot[0], bot[1]), m('tip'), 3, g);
      // The string is a bolt: a new path each frame, a stray fork crackling off it.
      const st = o.stringTo ?? t.p(-bend - 0.5, 0);
      const ta = [t.x(top[0], top[1] - 0.5), t.y(top[0], top[1] - 0.5)], ba = [t.x(bot[0], bot[1] + 0.5), t.y(bot[0], bot[1] + 0.5)];
      const upper = boltPts(ta[0], ta[1], st[0], st[1], 6, 1.2, ph * 17 + 1);
      const lower = boltPts(st[0], st[1], ba[0], ba[1], 6, 1.2, ph * 17 + 9);
      strike(r, upper, m('string'), 9);
      strike(r, lower, m('string'), 9);
      const leg = ph % 2 ? upper : lower, i = 2 + (ph % 3) * 2;
      const fx = leg[i], fy = leg[i + 1];
      if (ph !== 3) strike(r, boltPts(fx, fy, fx - 2 + ph, fy + (ph % 2 ? -2 : 2), 2, 0.7, ph), m('arc'), 9);
      if (o.stringTo && pull > 0.15) {
        // A nocked arrow of lightning.
        const hx = t.x(7, 0), hy = t.y(7, 0);
        strike(r, boltPts(st[0], st[1], hx, hy, 4, 0.8, ph * 5 + 2), m('arrow'), 9);
        r.dot(hx, hy, m('string'), 4, 9);
        r.dot(st[0], st[1] - 1, m('fletch'), 3, 9);
      }
    },
  };
}

// Battle sprites (their own materials).
const SM = mats({
  gold: { base: GOLD[2], ramp: GOLD, shiny: true }, wing: { base: GOLD[2], ramp: GOLD, shiny: true, tex: quills },
  steel: { base: STEEL[2], ramp: STEEL, shiny: true },
  bolt: { base: BOLT, glow: true }, arc: { base: ARC, glow: true }, deep: { base: ELEC, glow: true },
  ball: { base: ARC, glow: true, ramp: [0x1a2a8a, ELEC, 0x6aa8ff, ARC, BOLT] },
});

const arrowProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A bolt of lightning for a shaft, crackling anew each frame, a gold head and gold wing-feathers.
    r.fill(t.poly([-13.6, -3.2, -9.4, -0.6, -8, 0, -9.4, 0.6, -13.6, 3.2, -12, 0]), h(SM.wing), { group: 2, bevel: 0.8 });
    const pts = boltPts(t.x(-10, 0), t.y(-10, 0), t.x(3, 0), t.y(3, 0), 5, 1.5, f * 13 + 4);
    // A blue glow beside the white-hot core.
    strike(r, pts.map((v, i) => (i % 2 ? v + 1 : v)), h(SM.deep), 3);
    strike(r, pts, h(SM.bolt), 3);
    if (f !== 3) {
      const i = 2 + (f % 3) * 2;
      strike(r, boltPts(pts[i], pts[i + 1], pts[i] + t.x(-2, 0) - t.x(0, 0) + (t.x(0, f % 2 ? 2.4 : -2.4) - t.x(0, 0)), pts[i + 1] + t.y(-2, 0) - t.y(0, 0) + (t.y(0, f % 2 ? 2.4 : -2.4) - t.y(0, 0)), 2, 0.6, f), h(SM.arc), 3);
    }
    r.fill(t.poly([2.2, -2.2, 8.6, 0, 2.2, 2.2, 3.4, 0]), h(SM.gold), { group: 4, bevel: 1 });
  },
};

// -----------------------------------------------------------------------------
// Tempest Aegis
// -----------------------------------------------------------------------------

/** The thunderbird spread on the shield (local x down the shield, y across), head at the top. */
function thunderbird(F: Xf, x: number, s: number): Shape {
  const P = (pts: number[], flip = 1) => F.poly(pts.map((v, i) => (i % 2 ? v * s * flip : x + v * s)));
  const wing = [-2.8, 0.6, -4.6, 2, -6.8, 4.4, -5.2, 4.9, -4.8, 4, -3.4, 5, -3, 3.9, -1.5, 4.6, -1.2, 3.2, 0.2, 1];
  return union(
    // Wings raised to the shield's top corners, their trailing feathers jagged like bolts.
    P(wing), P(wing, -1),
    // Body and fanned tail, the head turned with its hooked beak, a crest swept back.
    P([-3.8, 0, -3, -1.1, 0.8, -1.1, 1.8, 0, 0.8, 1.1, -3, 1.1]),
    P([0.6, -0.8, 3.8, -2.2, 3, 0, 3.8, 2.2, 0.6, 0.8]),
    F.circ(x - 4.6 * s, 0, 1.25 * s),
    P([-4.9, 0.6, -4.5, 2.1, -3.8, 1]),
    P([-5.2, -0.7, -6.8, -1.8, -5.6, 0.2]),
  );
}

function tempestAegis(): WeaponArt {
  // A gold-rimmed kite of storm steel, its top corners flared like wingtips. A gold thunderbird spreads across
  // the face, a bolt in its claws reaching for the point, and lightning crawls across the steel, never twice the same.
  return {
    tip: 10.5,
    mats: {
      rim: material({ base: GOLD[2], ramp: GOLD, shiny: true, step: 0.15 }),
      face: material({ base: STORM[2], ramp: [...STORM, VEIN], tex: (x, y, ph) => (Math.sin(y * 0.9 + Math.sin(x * 0.7 + ph * Q) * 1.4) > 0.6 ? -1 : 0) }),
      bird: material({ base: GOLD[2], ramp: GOLD, shiny: true, step: 0.15 }),
      bolt: material({ base: BOLT, glow: true }),
      arc: material({ base: ARC, glow: true }),
      eye: material({ base: ARC, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      const outer = t.poly([
        -8.2, -5.8, -10.8, -7.6, -9.6, -4.2, -10, 0, -9.6, 4.2, -10.8, 7.6, -8.2, 5.8, -2, 6.6, 6, 3.4, 11.8, 0, 6, -3.4, -2, -6.6,
      ]);
      fillAll(r, [outer], m('rim'), o, 2);
      const inner = t.poly([-7.4, -4.8, -8.4, 0, -7.4, 4.8, -2, 5.4, 5.4, 2.6, 9.8, 0, 5.4, -2.6, -2, -5.4]);
      r.fill(inner, m('face'), { group: g, bevel: 3.5, toneBias: o.toneBias, noLine: true, local: o.local });
      // Lightning crawling across the face behind the bird: a new strike each frame.
      const strikes: [number, number, number, number][][] = [
        [[0.6, 4.6, 5.4, 1.8]],
        [[-7.2, -2.6, -7, 2.6]],
        [[0.6, -4.6, 5.4, -1.8], [-1.2, 4.8, 2.2, 3.4]],
        [],
      ];
      for (const [k, [ax, ay, bx, by]] of strikes[ph].entries()) zap(r, t, ax, ay, bx, by, 4, 0.8, ph * 7 + k, m(k ? 'arc' : 'bolt'), g);
      // The thunderbird, its bolt held in the talons and reaching down to the point.
      zap(r, t, 2, 0, 9, 0, 4, 1, 40 + (ph % 2), m(ph === 3 ? 'arc' : 'bolt'), g);
      r.fill(thunderbird(t, 0, 1), m('bird'), { group: g, bevel: 0.9, lightBias: 0.15, toneBias: o.toneBias, local: o.local });
      r.dot(t.x(-4.8, 0.3), t.y(-4.8, 0.3), m('eye'), 3, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Stormheart
// -----------------------------------------------------------------------------

/** A ring as a polygon (stays round in squashed frames). */
function hoop(F: Xf, cx: number, cy: number, rx: number, ry: number, w: number, a0 = 0, a1 = Math.PI * 2, n = 20): Shape {
  const out: number[] = [], inn: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    inn.push(cx + Math.cos(a) * (rx - w), cy + Math.sin(a) * (ry - w));
  }
  const pts = [...out];
  for (let i = inn.length - 2; i >= 0; i -= 2) pts.push(inn[i], inn[i + 1]);
  return F.poly(pts);
}

/** The Stormheart's gold cage: a ring, four claws reaching in on the diagonals, a bolt finial on top and a spike below. */
function stormCage(r: Raster, F: Xf, R: number, gold: number, g: number): void {
  const w = R * 0.2, k = R / 9.6;
  const claws: Shape[] = [hoop(F, 0, 0, R, R, w, 0, Math.PI * 2, 28)];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, c = (b: number, d: number) => [Math.cos(a + b) * d, Math.sin(a + b) * d];
    claws.push(F.poly([...c(-0.26, R - w * 0.5), ...c(0.06, R - w - 2.2 * k), ...c(-0.02, R - w - 2.6 * k), ...c(0.26, R - w * 0.5)]));
  }
  claws.push(boltGlyph(F, 0, R - w * 0.5, 5.6 * k + 1, 0.5 + 0.5 * k));
  claws.push(F.poly([-1.2 * k - 0.3, -R + w * 0.5, 1.2 * k + 0.3, -R + w * 0.5, 0, -R - 2.4 * k - 0.6]));
  r.fill(union(...claws), gold, { group: g, bevel: 0.8 + 0.4 * k });
}

const coreProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t0, f, h) {
    // Ball lightning caught in a small gold gyre: the tilted hoop turns past it, arcs leap from the ball to the cage.
    // Ball lightning held in a small gold ring by four claws, arcs leaping from it to the claws, a new pair each frame.
    const t = new Xf(t0.ox, t0.oy, 0, 1, 1);
    const R = 7;
    stormCage(r, t, R, h(SM.gold), 1);
    for (let k = 0; k < 2; k++) {
      const a = Math.PI / 4 + (Math.PI / 2) * [0, 2, 1, 3, 3, 1, 2, 0][f * 2 + k];
      const pts = boltPts(t.x(Math.cos(a) * 2, Math.sin(a) * 2), t.y(Math.cos(a) * 2, Math.sin(a) * 2), t.x(Math.cos(a) * (R - 2.6), Math.sin(a) * (R - 2.6)), t.y(Math.cos(a) * (R - 2.6), Math.sin(a) * (R - 2.6)), 2, 0.8, f * 3 + k);
      strike(r, pts, h(k ? SM.arc : SM.bolt), 3);
    }
    // The ball: deep blue skin, a white-hot heart that jumps about.
    const big = f % 2 === 0;
    r.fill(t.circ(0, 0, big ? 2.7 : 2.3), h(SM.deep), { group: 3 });
    r.fill(t.circ(0, 0, big ? 1.8 : 1.5), h(SM.arc), { group: 3 });
    const hx = [-0.5, 0.5, 0.3, -0.6][f], hy = [0.5, 0.3, -0.5, -0.2][f];
    r.dot(t.x(hx, hy), t.y(hx, hy), h(SM.bolt), 3, 3);
    r.dot(t.x(hx + 1, hy), t.y(hx + 1, hy), h(SM.bolt), 3, 3);
  },
};

const stormheart: SkinArt = {
  mats: {
    // Stock names: the ember core's icon and anything drawn the stock way burn electric.
    ember: glow(ARC), emberHot: glow(BOLT), emberDeep: glow(ELEC),
    'k.gold': { base: GOLD[2], ramp: GOLD, shiny: true }, 'k.deep': glow(ELEC), 'k.arc': glow(ARC), 'k.bolt': glow(BOLT),
  },
  glow: [0xe8f8ff, ELEC],
  icon(r, t, m) {
    // Ball lightning caught in a gold gyre, arcs leaping from it to the cage, a bolt-shaped finial on top.
    const R = 9.4, c = new Xf(t.x(0, -0.6), t.y(0, -0.6), t.ang, t.sx, t.sy);
    stormCage(r, c, R, m('k.gold'), 1);
    for (const [a, k] of [[Math.PI / 4, 1], [Math.PI * 0.75, 2], [Math.PI * 1.25, 3], [Math.PI * 1.75, 4], [0.05, 5]] as const) {
      const d = k === 5 ? R - 1.8 : R - 4;
      const pts = boltPts(c.x(Math.cos(a) * 3.4, Math.sin(a) * 3.4), c.y(Math.cos(a) * 3.4, Math.sin(a) * 3.4), c.x(Math.cos(a) * d, Math.sin(a) * d), c.y(Math.cos(a) * d, Math.sin(a) * d), 3, 1, k);
      strike(r, pts, m(k % 2 ? 'k.bolt' : 'k.arc'), 3);
    }
    r.fill(c.circ(0, 0, 4.2), m('k.deep'), { group: 3 });
    r.fill(c.circ(0, 0, 3.1), m('k.arc'), { group: 3 });
    r.fill(c.circ(-0.7, 0.6, 1.6), m('k.bolt'), { group: 3 });
    strike(r, boltPts(c.x(-3.4, 1.2), c.y(-3.4, 1.2), c.x(3.4, -1.4), c.y(3.4, -1.4), 4, 1, 9), m('k.bolt'), 3);
  },
  proj: { core: coreProj },
};

// -----------------------------------------------------------------------------
// Crown of the Thunder King
// -----------------------------------------------------------------------------

function thunderKing(): SkinArt {
  // A gold crown whose points are lightning bolts, a storm sapphire at the brow, small gold thunderbird wings
  // swept back from the temples, and sparks arcing from point to point.
  return {
    head: () => ({
      mats: {
        'h.gold': material({ base: GOLD[2], ramp: GOLD, shiny: true, step: 0.15 }),
        'h.wing': material({ base: GOLD[2], ramp: GOLD, shiny: true, tex: quills }),
        'h.steel': material({ base: STEEL[2], ramp: STEEL, shiny: true }),
        'h.gem': material({ base: ELEC, glow: true, ramp: [0x1a2a8a, ELEC, 0x6aa8ff, ARC, BOLT], tex: (_x, _y, ph) => [1, 0, 1, -1][ph % 4] }),
        'h.bolt': material({ base: BOLT, glow: true }), 'h.arc': material({ base: ARC, glow: true }),
      },
      draw(r, H, m, g) {
        const ph = r.phase % 4, lift = [0, 0.4, 0.7, 0.4][ph];
        // Bolt-shaped points, the tallest in the middle, standing on the band (the rear one a shade back).
        const pts: [number, number, number, number][] = [[-4, 4.6, 6.4, -0.8], [0.6, 5, 8.6, 0], [5, 5, 6.6, 0.8]];
        // A thunderbird wing swept back and up from the temple, beating gently.
        r.fill(H.poly([
          -3.4, 5.4, -6, 7.8 + lift, -10.4, 10.2 + lift * 1.5, -9.2, 8.2 + lift, -11.4, 7.8 + lift * 0.9, -9, 6.4 + lift * 0.5, -10.6, 5,
          -7, 4.4, -4.4, 3.4,
        ]), m('h.wing'), { group: g, bevel: 1, toneBias: -1, local: H });
        for (const [i, [x, y, h, l]] of pts.entries()) r.fill(boltGlyph(H, x, y, h, 1, l), m('h.gold'), { group: g, bevel: 1, toneBias: i === 0 ? -1 : 0, local: H });
        r.fill(H.cap(-5.6, 4.2, 6, 5, 1.05), m('h.gold'), { group: g, bevel: 1.1 });
        r.fill(intersect(H.cap(-5.6, 4.2, 6, 5, 1.05), H.rect(0, 4.1, 9, 0.2, 0)), m('h.steel'), { group: g, flat: 1, noLine: true });
        r.fill(H.poly([4.4, 4.6, 5.3, 5.8, 6.2, 4.6, 5.3, 3.6]), m('h.gem'), { group: g });
        // Sparks leaping between the points' tips: one pair, then the other, then all three.
        const tip = (i: number): [number, number] => [pts[i][0] - 0.5 * 0.85 + pts[i][3], pts[i][1] + pts[i][2]];
        const pairs = [[[0, 1]], [[1, 2]], [[0, 1], [1, 2]], []][ph];
        for (const [k, [a, b]] of pairs.entries()) {
          const [ax, ay] = tip(a), [bx, by] = tip(b);
          zap(r, H, ax, ay + 0.6, bx, by + 0.6, 3, 1, ph * 5 + k, m(k ? 'h.arc' : 'h.bolt'), g);
        }
        if (ph === 3) for (const i of [0, 2]) { const [x, y] = tip(i); r.dot(H.x(x, y + 1.2), H.y(x, y + 1.2), m('h.bolt'), 3, g); }
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Stormcaller Mail
// -----------------------------------------------------------------------------

function stormMail(): SkinArt {
  // Storm-steel scale with lightning veins flickering through it, gold trim, thunderbird-wing pauldrons of layered
  // gold feathers, a gold thunderbird at the breast and a short cape of thunderhead rolling at the back, lit from within.
  return {
    mats: {
      mirror: { base: STORM[2], ramp: [...STORM, VEIN], tex: (x, y, ph) => scales(x, y, ph) + crackle(5.5, 0.55)(x, y, ph) },
      mirrorGlow: { base: GOLD[3], ramp: [0x8a5a14, 0xe0a830, GOLD[3], 0xffe080, GOLD[4]] },
      'k.gold': { base: GOLD[2], ramp: GOLD, shiny: true }, 'k.wing': { base: GOLD[2], ramp: GOLD, shiny: true },
      'k.steel': { base: STEEL[2], ramp: STEEL, shiny: true },
      'k.cloud': { base: CLOUD[2], ramp: CLOUD, tex: billow }, 'k.cloudD': { base: CLOUD[1], ramp: CLOUD, tex: billow },
      'k.bolt': glow(BOLT), 'k.arc': glow(ARC), 'k.eye': glow(ARC),
    },
    chest: {
      pauldron: null, forearm: 'k.gold',
      back(r, T, m, c) {
        // A short cape of thunderhead, billowing at the hem, a bolt flashing through it now and then.
        const top = c.top, s = c.sway * 2.4, ph = r.phase % 4;
        const lob = [0, 0.4, 0.7, 0.3][ph];
        const hem = (x: number, y: number, rr: number) => T.circ(x - s, y, rr);
        const cape = union(
          T.poly([-0.6, top + 0.8, -5.4, top - 0.4, -8.8 - s, top - 6, -9.6 - s, top - 10, -2, top - 10.6, -0.6, top - 4]),
          hem(-8.4, top - 9.8 + lob * 0.5, 2.2), hem(-5.2, top - 10.6 - lob * 0.4, 2.4), hem(-2.2, top - 10.2 + lob * 0.3, 2),
          hem(-9.6, top - 6.6 - lob * 0.3, 1.8),
        );
        r.fill(cape, m('k.cloudD'), { group: c.g, bevel: 2.6, toneBias: -1, softLight: true, local: T });
        r.fill(union(T.circ(-4.6 - s * 0.6, top - 3.6, 2.4), T.circ(-7.2 - s * 0.8, top - 5.4, 2)), m('k.cloud'), { group: c.g, bevel: 2, toneBias: -1, noLine: true, local: T });
        if (ph === 0) zap(r, T, -3.4 - s * 0.4, top - 2.6, -6.4 - s, top - 10.4, 4, 1, 3, m('k.bolt'), c.g);
        if (ph === 2) zap(r, T, -7.6 - s, top - 3.4, -4.6 - s, top - 9.6, 4, 1, 8, m('k.arc'), c.g);
      },
      shoulder(r, S, m, c) {
        // A thunderbird wing folded over the shoulder: gold primaries fanning down and back under a steel cap.
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, fl = [0, 0.3, 0.5, 0.3][ph];
        // Each primary: a blade from under the cap, pointing down and back at angle `a`, `len` long.
        const feather = (x: number, len: number, a: number, w: number) => {
          const dx = -Math.sin(a), dy = -Math.cos(a), nx = -dy, ny = dx;
          const bx = x + dx * len, by = 1.2 + dy * len;
          return S.poly([
            x + nx * w, 1.2 + ny * w, x - nx * w, 1.2 - ny * w, bx - nx * w * 0.5 - dx * 1.2, by - ny * w * 0.5 - dy * 1.2, bx - fl * 0.6, by - fl * 0.4,
            bx + nx * w * 0.6 - dx * 0.6, by + ny * w * 0.6 - dy * 0.6,
          ]);
        };
        const fs: [number, number, number, number][] = [[-1.4, 7, 1.25, 0], [-0.4, 6.6, 0.9, -1], [0.6, 5.4, 0.55, 0]];
        for (const [x, len, a, b] of fs) r.fill(feather(x, len, a, 1.1), m('k.wing'), { ...o, toneBias: c.bias + b, bevel: 0.9, local: S });
        r.fill(S.ell(0, 1.4, 3.1, 2.2), m('k.gold'), { ...o, bevel: 1.6, local: S });
        r.fill(intersect(S.ell(0, 1.4, 3.1, 2.2), S.rect(0, -0.2, 4, 0.5)), m('k.steel'), { ...o, flat: 1, noLine: true });
        r.dot(S.x(0.4, 1.8), S.y(0.4, 1.8), m('k.eye'), 3, c.g);
      },
      over(r, T, m, c) {
        // A gold thunderbird at the breast, wings raised, its eye lit.
        const x = c.body.chestPush * 0.7 + 1.4, y = c.top - 4;
        const bird = union(
          T.poly([x - 0.6, y - 0.2, x - 3.4, y + 2.2, x - 2.6, y + 0.4, x - 3.2, y - 0.2, x - 0.6, y - 1.2]),
          T.poly([x + 0.6, y - 0.2, x + 3.2, y + 2.4, x + 2.6, y + 0.6, x + 3.2, y + 0, x + 0.6, y - 1.2]),
          T.poly([x - 0.7, y + 1.4, x + 0.7, y + 1.4, x + 0.8, y - 1.8, x, y - 3, x - 0.8, y - 1.8]),
        );
        r.fill(bird, m('k.gold'), { group: c.g, bevel: 0.8 });
        r.dot(T.x(x, y + 0.8), T.y(x, y + 0.8), m('k.eye'), 3, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Galewalkers
// -----------------------------------------------------------------------------

function galewalkers(): SkinArt {
  // Storm-steel boots cuffed in gold, a gold thunderbird wing beating at each heel, wind winding up the shin
  // and sparks snapping off the toe.
  return {
    mats: {
      zephyr: { base: STORM[2], ramp: [...STORM, VEIN], tex: (x, y, ph) => crackle(4, 0.5, true)(x, y, ph) + (wrap(x, 2.6) < 0.5 ? -1 : 0) },
      zephyrTrim: { base: GOLD[2], ramp: GOLD, shiny: true },
      'k.wing': { base: GOLD[2], ramp: GOLD, shiny: true, tex: quills },
      'k.wind': glow(0xd8ecff), 'k.windD': glow(0x7aa8e0), 'k.bolt': glow(BOLT), 'k.arc': glow(ARC),
    },
    boots: {
      wing: null, height: 0.68,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w;
        // The heel wing beats: up, spread, down, spread.
        const beat = [0, 1, 1.6, 1][ph];
        // The far heel's wing would only cross the near boot: like the stock wings, only the near one shows.
        if (c.far) return;
        const wing = shin.poly([
          2.6, -w + 0.2, 4 + beat * 0.6, -w - 2.2, 6.4 + beat, -w - 4.6, 4.6 + beat * 0.8, -w - 4, 5.2 + beat * 0.6, -w - 5.6,
          3.4 + beat * 0.4, -w - 4.4, 3.2 + beat * 0.2, -w - 5.6, 1.8, -w - 3, 0.6, -w - 0.4,
        ]);
        r.fill(wing, m('k.wing'), { ...o, bevel: 1, local: shin });
        // A ribbon of wind winding up round the boot, climbing a step each frame, its leading end bright.
        const hgt = 0.8 + ph * (c.top / 4.2);
        const pts: number[] = [];
        for (let i = 0; i <= 4; i++) {
          const u = i / 4, lx = hgt + u * 1.6 + Math.sin(u * Math.PI) * 0.6, ly = (u - 0.5) * 2 * (w + 1.4);
          pts.push(shin.x(lx, ly), shin.y(lx, ly));
        }
        strike(r, pts, m('k.windD'), c.g);
        r.dot(pts[8], pts[9], m('k.wind'), 3, c.g);
        // Sparks snapping off the toe.
        if (ph !== 1) {
          const sx = c.toe + 0.6 + (ph % 2) * 0.8, sy = -1 + [0.4, 0, 1.6, 0.8][ph];
          r.dot(foot.x(sx, sy), foot.y(sx, sy), m(ph === 2 ? 'k.bolt' : 'k.arc'), 3, c.g);
          r.dot(foot.x(sx + 0.9, sy + 1), foot.y(sx + 0.9, sy + 1), m('k.arc'), 3, c.g);
        }
      },
    },
    ...FX,
  };
}

function thunderstride(): SkinArt {
  // Storm-steel leggings banded in gold with lightning veins crawling down them (a new path every frame),
  // a tasset of gold thunderbird feathers fanning over the thigh, a gold knee cop and sparks snapping off it.
  return {
    mats: {
      windLeg: { base: STORM[2], ramp: [...STORM, VEIN], tex: (x, y, ph) => crackle(3.2, 0.6, true)(x, y, ph) + (wrap(x, 3) < 0.5 ? -1 : 0) },
      windTrim: { base: GOLD[2], ramp: GOLD, shiny: true },
      'l.wing': { base: GOLD[2], ramp: GOLD, shiny: true }, 'l.gold': { base: GOLD[2], ramp: GOLD, shiny: true }, 'l.steel': { base: STEEL[2], ramp: STEEL, shiny: true },
      'l.bolt': glow(BOLT), 'l.arc': glow(ARC), 'l.dark': { base: GOLD[0], ramp: GOLD },
    },
    legs: {
      mat: 'windLeg', trim: 'windTrim', knee: 'l.steel', tasset: null, rune: null, wraps: null, bulk: 0.15,
      over(r, t, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w, L = c.len;
        // The feather tasset: three gold primaries from the belt, fanning down over the outside of the thigh,
        // their tips lifting in the storm wind.
        const lift = [0, 0.3, 0.5, 0.2][ph];
        // One fan, its hem cut into three feather tips with dark quill lines between them.
        const tip = (k: number) => lift * (k + 1) * 0.35;
        const fan = t.poly([
          L + 1, -w - 0.4, L + 1, w * 0.6 + 0.4, L * 0.4 + tip(2), w * 0.6 + 0.9, L * 0.52, w * 0.15,
          L * 0.24 + tip(1), -w * 0.3, L * 0.46, -w * 0.55, L * 0.34 + tip(0), -w - 0.6,
        ]);
        r.fill(fan, m('l.wing'), { ...o, bevel: 1.1 });
        for (const y of [w * 0.15, -w * 0.55]) r.line(t.x(L * 0.78, y + 0.1), t.y(L * 0.78, y + 0.1), t.x(L * 0.5, y), t.y(L * 0.5, y), m('l.dark'), 1, c.g);
        if (c.far) return;
        // A gold bolt on the knee cop (drawn upright along the thigh), flashing white when the sparks fly.
        r.fill(boltGlyph(new Xf(t.ox, t.oy, t.ang - Math.PI / 2), 0.7, -1.6, 3.6, 0.55, 0.3), m(ph === 1 ? 'l.bolt' : 'l.gold'), { ...o, bevel: 0.6 });
        // Sparks snapping off the knee cop, somewhere new each frame.
        if (ph !== 3) {
          const sx = [0.8, -0.6, 1.6][ph], sy = c.body.kneeR + 1.6 + [0.2, 0.8, 0][ph];
          r.dot(t.x(sx, sy), t.y(sx, sy), m(ph === 1 ? 'l.bolt' : 'l.arc'), 3, c.g);
          r.dot(t.x(sx + [0.9, -0.9, 1][ph], sy + 1), t.y(sx + [0.9, -0.9, 1][ph], sy + 1), m('l.arc'), 3, c.g);
        }
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = { ring: css(ELEC), arc: css(ARC), hot: css(BOLT), gold: css(GOLD[3]) };
/** 0..1 noise for the aura's flashes. */
const rnd = (n: number) => hash(n, 977);

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function stormcallerAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  const RX = 16, RY = 3.8;
  // A faint ring of charged ground, its dashes drifting.
  const step = Math.floor(t * 5);
  g.globalAlpha = 0.5;
  g.fillStyle = AC.ring;
  ring(g, x, y, RX, RY, 30, layer, (g, px, py, i) => { if ((i + step) % 3) g.fillRect(px, py, 1, 1); });
  g.globalAlpha = 1;
  // Lightning arcs crackling along the ring: each flashes for a beat at random, somewhere new each time.
  // Drawn a pixel per step round the ring, jagging up and down a pixel at a time, white-hot at the kinks.
  const tick = Math.floor(t * 14);
  for (let k = 0; k < 3; k++) {
    const seed = tick * 3 + k;
    if (rnd(seed) < 0.45) continue;
    const a0 = rnd(seed + 101) * Math.PI * 2, n = 8 + Math.floor(rnd(seed + 211) * 6);
    let up = 0;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / RX, s = Math.sin(a);
      const turn = rnd(seed * 31 + i);
      const nu = i === n - 1 ? 0 : Math.max(0, Math.min(3, up + (turn < 0.35 ? -1 : turn > 0.6 ? 1 : 0)));
      const kink = nu !== up;
      up = nu;
      if ((s < 0) !== (layer === 'back')) continue;
      g.fillStyle = kink ? AC.hot : AC.arc;
      g.fillRect(Math.round(x + Math.cos(a) * RX), Math.round(y + s * RY) - up, 1, kink ? 2 : 1);
    }
  }
  // Now and then a bolt leaps up off the ring.
  const leap = Math.floor(t * 7);
  if (rnd(leap + 5000) > 0.55) {
    const a = rnd(leap + 6000) * Math.PI * 2, s = Math.sin(a);
    if ((s < 0) === (layer === 'back')) {
      let px = Math.round(x + Math.cos(a) * RX), py = Math.round(y + s * RY);
      g.fillStyle = AC.hot;
      for (let i = 0; i < 4; i++) {
        const dx = rnd(leap * 4 + i) < 0.5 ? -1 : 1, h = 2 + Math.floor(rnd(leap * 4 + i + 50) * 2);
        g.fillRect(px, py - h, 1, h);
        py -= h; px += dx;
      }
      g.fillStyle = AC.arc; g.fillRect(px - 1, py, 3, 1);
    }
  }
  // A few sparks jumping up from the ring and falling back.
  for (let k = 0; k < 4; k++) {
    const u = (t * 1.6 + k * 0.25) % 1, a = k * 1.7 + Math.floor(t * 1.6 + k * 0.25) * 2.3, s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const px = Math.round(x + Math.cos(a) * RX + u * 3 * Math.cos(a)), py = Math.round(y + s * RY - Math.sin(u * Math.PI) * 7);
    g.fillStyle = k % 2 ? AC.gold : AC.hot;
    g.fillRect(px, py, 1, 1);
  }
}

export const STORMCALLER: Record<string, SkinArt> = {
  'longbow.thunderstring': { weapon: thunderstring, proj: { arrow: arrowProj }, ...FX },
  'kite_shield.tempest': { weapon: tempestAegis, ...FX },
  'ember_core.stormheart': stormheart,
  'storm_crown.thunderking': thunderKing(),
  'mirror_mail.stormcaller': stormMail(),
  'zephyr_boots.galewalkers': galewalkers(),
  'windrunner_leggings.thunderstride': thunderstride(),
};

