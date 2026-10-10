import { mix } from '../../pixel/color';
import { material, type Raster, type Tex } from '../../pixel/raster';
import { subtract, union, type Shape } from '../../pixel/sdf';
import { bands, damascus, flow, grain, hash, lattice, speckle } from '../../pixel/tex';
import { fillAll, hangAt, M, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt } from './index';
import { glow, mats, plain, Q, shiny, veined, wrap } from './kit';

/**
 * Fourth-wave skins for the v0.39 main weapons: a rare recolour and a
 * legendary reshape for each. Reshapes keep the stock grip, `grip2` and
 * reach (weapons2.ts); the frame is the usual weapon-local one (origin at
 * the grip, +x toward the business end, +y the spine side). Parts that
 * move step with `r.phase`, looping every four frames.
 */

/** Legendary sparkles, impacts and swing trail in one colour family. */
const legend = (spark: number, spark2: number, trail = spark): Pick<SkinArt, 'fx' | 'trail'> => ({
  fx: { spark, spark2 },
  trail: [trail, mix(trail, spark2, 0.55)],
});

/** Caps through a list of points (x, y, radius), for curved hafts, vines and horns. */
function bend(t: Xf, pts: number[]): Shape {
  const out: Shape[] = [];
  for (let i = 0; i + 5 < pts.length; i += 3) out.push(t.cap(pts[i], pts[i + 1], pts[i + 3], pts[i + 4], pts[i + 2], pts[i + 5]));
  return union(...out);
}

/** A polyline of one-pixel strokes through local points (bevels, veins, etched lines). */
function trace(r: Raster, t: Xf, pts: number[], mat: number, tone: number, g: number): void {
  for (let i = 0; i + 3 < pts.length; i += 2) r.line(t.x(pts[i], pts[i + 1]), t.y(pts[i], pts[i + 1]), t.x(pts[i + 2], pts[i + 3]), t.y(pts[i + 2], pts[i + 3]), mat, tone, g);
}

/** Overlapping scales (rows of arcs), shading the lower rim of each. */
const scales = (w = 2.2, h = 1.5): Tex => (x, y) => {
  const row = Math.floor(y / h);
  const u = wrap(x + (row % 2) * (w / 2), w) - w / 2, v = wrap(y, h);
  return u * u * (1.4 / w) + (v - h) * (v - h) * (1 / h) < 0.62 ? 0 : -1;
};

/**
 * A chain of alternating links along a quadratic curve (raster space): each
 * link two pixels in one material, the next in the other, so scaled links
 * and gold rings read apart at any length.
 */
function linkLine(r: Raster, ax: number, ay: number, cx: number, cy: number, bx: number, by: number, a: number, b: number, g: number): void {
  const len = Math.hypot(cx - ax, cy - ay) + Math.hypot(bx - cx, by - cy);
  const n = Math.max(2, Math.ceil(len));
  let lx = -1, ly = -1, k = 0;
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    const x = Math.floor(v * v * ax + 2 * u * v * cx + u * u * bx);
    const y = Math.floor(v * v * ay + 2 * u * v * cy + u * u * by);
    if (x === lx && y === ly) continue;
    const ring = Math.floor(k / 2) % 2;
    r.dot(x, y, ring ? b : a, ring ? (k % 2 ? 3 : 2) : (k % 2 ? 1 : 3), g);
    lx = x; ly = y; k++;
  }
}

// =============================================================================
// Chain sickle
// =============================================================================

/** Rust: blotchy patches eaten darker, a few raised flakes catching the light. */
const rust: Tex = (x, y) => {
  if (hash(Math.floor(x / 1.7) + 3, Math.floor(y / 1.7)) < 0.32) return -1;
  return hash(Math.floor(x), Math.floor(y) + 7) < 0.07 ? 1 : 0;
};

/** Rustbound: an old field sickle gone orange with rust, the edge still honed bright, hemp-bound. */
const rustbound: SkinArt = {
  mats: {
    blade: { base: 0xa8643a, ramp: [0x4a2414, 0x7a3e22, 0xa8643a, 0xd09a6a, 0xf0e2c8], shiny: true, tex: rust },
    haft: plain(0x6a5a48, grain()),
    collar: shiny(0x6a4a3a, speckle(0.25, -1)),
    chain: shiny(0x9a6040, rust),
    weight: { base: 0x7a5a48, ramp: [0x2e2420, 0x4a3a30, 0x7a5a48, 0x4a8a78, 0x8ad0b8], tex: speckle(0.22, 1) },
    wrap: plain(0xc8b080, bands(1.4, 0.6, -1)),
  },
  chain: ['#d0946a', '#9a6040', '#3a1c10', '#6a3420'],
  trail: [0xf8e0c0, 0xa8643a],
};

/**
 * Serpent Coil: the haft is a viper's scaled body, its head biting down at
 * the top and the hooked blade a single venom-slick fang out of its jaws.
 * The chain hangs in green-scale and gold links down to a rattle that shakes.
 */
function serpentCoil(): WeaponArt {
  return {
    tip: 16,
    mats: {
      body: material(veined([0x0e2a1a, 0x18422a, 0x23603a, 0x34804a], 0xb8ff6a, (x, y, ph) => {
        // Scales, with a glint travelling up the body.
        // A viper's chevrons down the back, a glint travelling up the body.
        if (wrap(x + Math.abs(y) * 1.6, 3) < 1) return -1;
        return wrap(x - ph * 3, 12) < 1.2 && hash(Math.floor(x * 2), Math.floor(y * 2)) < 0.5 ? 4 : 0;
      })),
      belly: material(shiny(0xe8d488, bands(1, 0.4, -1), 0.13)),
      gold: material(shiny(0xe0a830)),
      fang: material({ base: 0xd8ecd8, ramp: [0x3a5a48, 0x6a9a80, 0xa8d0b8, 0xd8ecd8, 0xfaffff], shiny: true, tex: flow(9, 1.4, 2.25, 1) }),
      venom: M.glow(0x9aff4a),
      venomHot: M.glow(0xeaffc0),
      eye: M.glow(0xffd23a),
      tongue: material({ base: 0xc8283a }),
      scaleLink: material(shiny(0x2a8a48)),
      goldLink: material(shiny(0xe0b040)),
      rattle: material({ base: 0xd8c090, step: 0.13 }),
      mouth: material({ base: 0x2a0a14 }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // Scaled chain from the tail ring, swinging back to a rattle.
      const butt = t.p(-5.8, 0);
      const back = -Math.cos(t.ang) * Math.sign(t.sx || 1);
      const H = hangAt(t, -5.8, 0);
      const end = H.p(6.8, back * 1.6);
      linkLine(r, butt[0], butt[1], butt[0] + back * 3.5, butt[1] + 2.5, end[0], end[1], m('scaleLink'), m('goldLink'), g);
      const shake = [0, 0.35, 0, -0.35][ph];
      for (let i = 0; i < 4; i++) fillAll(r, [H.ell(7.6 + i * 1.3, back * 1.7 + shake * (i / 3), 0.85, 1.45 - i * 0.22)], m('rattle'), { ...o, group: 40 + i }, 1);
      // The body: a gently sinuous haft, tail ring at the butt.
      const body: number[] = [];
      for (let x = -5.4; x <= 9.6; x += 1.5) body.push(x, Math.sin(x * 0.55) * 0.35, 1.25 - (x + 5.4) * 0.01);
      fillAll(r, [bend(t, body)], m('body'), o, 1);
      // The pale belly along the edge side.
      const belly: number[] = [];
      for (let x = -4.8; x <= 9; x += 1.38) belly.push(x, Math.sin(x * 0.55) * 0.35 - 0.8, 0.45);
      fillAll(r, [bend(t, belly)], m('belly'), o, 0.6);
      fillAll(r, [t.rect(-1.6, 0, 0.45, 1.45), t.rect(2.9, 0, 0.45, 1.45)], m('gold'), o, 0.8);
      fillAll(r, [t.circ(-5.9, 0, 1.3)], m('gold'), o, 1);
      r.dot(t.x(-5.9, 0), t.y(-5.9, 0), m('mouth'), 1, g);
      // The fang, sweeping forward out of the jaws and hooking back down.
      fillAll(r, [t.poly([
        10.4, 0.6, 12.6, 0.2, 14.2, -2, 14.6, -5.2, 13.8, -8.6, 11.6, -11.6, 8.4, -13.6, 4.4, -14.8,
        7, -12, 9.6, -9.2, 10.9, -6.2, 11.2, -3.4, 10.6, -1.4, 9.6, -0.6,
      ])], m('fang'), o, 1.5);
      // A venom groove down the fang, venom beading at the point and falling.
      trace(r, t, [12.4, -2.2, 12.6, -5, 11.8, -8, 9.8, -10.8, 7.2, -12.6], m('venom'), 3, g);
      const drip = [[5.2, -14.6], [5, -15.6], [4.9, -16.6], [5.1, -14.4]][ph];
      r.dot(t.x(drip[0], drip[1]), t.y(drip[0], drip[1]), m(ph === 2 ? 'venom' : 'venomHot'), 3, g);
      // The head: a broad viper's wedge, jaws agape round the fang's root.
      fillAll(r, [t.poly([9.6, -0.4, 14.6, -0.4, 15.8, -1.4, 12.4, -2.2, 9.8, -1.8])], m('belly'), o, 0.8);
      fillAll(r, [t.poly([11, 0.4, 16.4, 0.8, 15.4, -0.6, 11.6, -0.8])], m('mouth'), o, 0.6);
      fillAll(r, [t.poly([7.8, 0.2, 8.4, 2.6, 10.4, 4, 13.4, 3.8, 15.8, 2.4, 17, 1, 15.8, 0.3, 12, 0.3])], m('body'), o, 1.5);
      // Gold brow scales and swept-back horns.
      fillAll(r, [t.poly([9, 3.2, 6.8, 4.8, 9.8, 4]), t.poly([10.8, 3.8, 9.6, 5.4, 11.8, 3.9])], m('gold'), o, 0.8);
      r.line(t.x(10.6, 3.2), t.y(10.6, 3.2), t.x(15.2, 2), t.y(15.2, 2), m('gold'), 3, g);
      r.dot(t.x(12.6, 2), t.y(12.6, 2), m('eye'), 3, g);
      r.dot(t.x(13.4, 2), t.y(13.4, 2), m('eye'), 3, g);
      r.dot(t.x(16.2, 1.1), t.y(16.2, 1.1), m('mouth'), 0, g);
      // A forked tongue flicking out under the snout.
      if (ph < 2) {
        const k = ph ? 0.6 : 0;
        r.line(t.x(15.6, 0), t.y(15.6, 0), t.x(17.4 + k, -0.1), t.y(17.4 + k, -0.1), m('tongue'), 2, g);
        r.dot(t.x(18.2 + k, 0.5), t.y(18.2 + k, 0.5), m('tongue'), 2, g);
        r.dot(t.x(18.2 + k, -0.7), t.y(18.2 + k, -0.7), m('tongue'), 2, g);
      }
    },
  };
}

const SM = mats({
  body: { base: 0x23603a, ramp: [0x0e2a1a, 0x18422a, 0x23603a, 0x34804a, 0x6ac07a], tex: scales(1.8, 1.2) },
  belly: { base: 0xe8d488, shiny: true, step: 0.13 },
  gold: { base: 0xe0a830, shiny: true },
  fang: { base: 0xd8ecd8, ramp: [0x3a5a48, 0x6a9a80, 0xa8d0b8, 0xd8ecd8, 0xfaffff], shiny: true },
  venom: { base: 0x9aff4a, glow: true },
  eye: { base: 0xffd23a, glow: true },
  link: { base: 0x2a8a48, shiny: true },
  goldLink: { base: 0xe0b040, shiny: true },
  tongue: { base: 0xc8283a },
});

/** The chain hook in flight: the viper's head lunging, fang hooked, scaled links behind. */
const serpentHook: ProjArt = {
  frames: 2, outline: true,
  draw(r, t, f, h) {
    const k = Math.cos(t.ang) < 0 ? new Xf(t.ox, t.oy, t.ang, 1, -1) : t;
    for (let i = 0; i < 5; i++) r.dot(k.x(-10 + i * 1.1, Math.sin(i + f) * 0.4), k.y(-10 + i * 1.1, Math.sin(i + f) * 0.4), h(i % 2 ? SM.goldLink : SM.link), (i + f) % 2 ? 2 : 3, 1);
    // Neck, then the fang hooked down under the head.
    r.fill(k.cap(-4.6, 0, 0.6, 0.4, 1.1, 1.5), h(SM.body), { group: 1, bevel: 1 });
    r.fill(k.poly([1.4, -0.4, 4.4, -0.8, 6.6, -2.6, 7, -5.4, 5.6, -8, 3, -9.4, 0.2, -9.6, 2.4, -8.2, 4.4, -6.2, 4.8, -3.8, 3.8, -2, 1.2, -1.6]), h(SM.fang), { group: 2, bevel: 1.1 });
    r.line(k.x(5.6, -3), k.y(5.6, -3), k.x(4.6, -6.6), k.y(4.6, -6.6), h(SM.venom), 3, 2);
    r.dot(k.x(0.4, -10.4 - f * 0.8), k.y(0.4, -10.4 - f * 0.8), h(SM.venom), 3, 2);
    // Head: a wedge with jaws agape, gold brow, burning eye.
    r.fill(k.poly([-1.6, -0.6, -1, 1.8, 1.2, 3, 4.6, 2.6, 7, 0.8, 7.4, -0.2, 4, -0.6]), h(SM.body), { group: 3, bevel: 1.3 });
    r.fill(k.poly([3.6, -0.6, 7.2, -0.4, 6.4, -1.4, 3.8, -1.4]), h(SM.belly), { group: 3, bevel: 0.8 });
    r.fill(k.poly([0, 2.4, -1.6, 4.2, 1.4, 2.8]), h(SM.gold), { group: 3, bevel: 0.8 });
    r.line(k.x(0.8, 2.2), k.y(0.8, 2.2), k.x(5, 1.6), k.y(5, 1.6), h(SM.gold), 3, 3);
    r.dot(k.x(3.8, 1.2), k.y(3.8, 1.2), h(SM.eye), 3, 3);
    if (!f) {
      r.line(k.x(7.4, -0.4), k.y(7.4, -0.4), k.x(9, -0.6), k.y(9, -0.6), h(SM.tongue), 2, 3);
      r.dot(k.x(9.8, 0), k.y(9.8, 0), h(SM.tongue), 2, 3);
      r.dot(k.x(9.8, -1.2), k.y(9.8, -1.2), h(SM.tongue), 2, 3);
    }
  },
};

// =============================================================================
// Soul scythe
// =============================================================================

/** Harvest Moon: a farmer's scythe under a harvest moon, a jack-o'-lantern riding the collar. */
const harvest: SkinArt = {
  mats: {
    haft: plain(0x8a6438, grain()),
    wrap: plain(0xe0c070, bands(1.2, 0.5, -1)),
    collar: shiny(0x5a4a3a),
    blade: { base: 0xf0c868, ramp: [0x8a4a1a, 0xc8803a, 0xf0c868, 0xfce4a0, 0xfffbe8], shiny: true, tex: speckle(0.05, -1) },
    edge: glow(0xffb84a),
    flame: glow(0xff8a2a),
    flameHot: glow(0xfff0b0),
    bone: plain(0xe8782a, bands(1.3, 0.4, -1)),
  },
  trail: [0xfff0c0, 0xe08a2a],
};

/**
 * Thanatos: the death god's scythe. A great pale crescent moon for a blade,
 * moonlight sliding along it, on a black snath; a raven-black wing sweeps
 * back from the collar, and a violet eye watches from the socket.
 */
function thanatos(): WeaponArt {
  return {
    tip: 35,
    grip2: 13,
    mats: {
      snath: material({ base: 0x2a2436, ramp: [0x0c0a12, 0x18141f, 0x2a2436, 0x45405a, 0x8a84b0], shiny: true, tex: bands(5, 0.6, 1) }),
      silver: material(shiny(0xc8cce0, undefined, 0.16)),
      wrap: material(plain(0x3a3448, lattice(2, -1))),
      moon: material({ base: 0xe4e6f6, ramp: [0x5a5a8a, 0x9a9cc8, 0xcfd2ec, 0xeef0fc, 0xffffff], shiny: true, tex: flow(10, 2, 2.5, 1) }),
      moonDark: material({ base: 0x9a9cc8, ramp: [0x3a3a62, 0x5a5a8a, 0x7a7cb0, 0x9a9cc8, 0xd0d4f0], tex: speckle(0.14, -1) }),
      edge: M.glow(0xd8d0ff),
      feather: material({ base: 0x2e2644, ramp: [0x0a0812, 0x1a1528, 0x2e2644, 0x4e4274, 0x9a88d8], shiny: true }),
      featherTip: material({ base: 0x9a8ad0, ramp: [0x2a2240, 0x4a3e72, 0x7a6ab0, 0xb4a8e4, 0xeee8ff], shiny: true }),
      featherAlt: material({ base: 0x221c34, ramp: [0x060410, 0x120e20, 0x221c34, 0x3a3060, 0x7a6ab8], shiny: true }),
      eye: M.glow(0xb07aff),
      eyeHot: M.glow(0xf2e4ff),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      const lift = [0, 0.4, 0.6, 0.3][ph];
      // The snath, gently bowed.
      fillAll(r, [bend(t, [-11, 0.2, 1.1, 4, 0.6, 1.1, 18, 0.5, 1.05, 31, -0.2, 1.0])], m('snath'), o, 1);
      // Butt: a silver spike with a small crescent.
      fillAll(r, [t.poly([-10.6, -1, -14.6, 0.1, -10.6, 1.2])], m('silver'), o, 1);
      fillAll(r, [subtract(t.circ(-10.2, 0, 1.9), t.circ(-9.4, 0.4, 1.5))], m('silver'), o, 0.8);
      fillAll(r, [t.cap(-2, 0.45, 2, 0.55, 1.35), t.cap(11, 0.6, 15, 0.55, 1.35)], m('wrap'), o, 1);
      fillAll(r, [t.rect(-2.4, 0.45, 0.4, 1.5), t.rect(2.4, 0.55, 0.4, 1.5), t.rect(10.6, 0.6, 0.4, 1.5), t.rect(15.4, 0.55, 0.4, 1.5)], m('silver'), o, 0.8);
      // The moon blade: a deep crescent, broad at the heel, needle at the point.
      fillAll(r, [t.poly([
        30.4, 2.2, 34, 1.4, 36.8, -2.2, 37.8, -7, 37, -12.4, 34.4, -17.6, 30.2, -22, 24.8, -25.2, 18.4, -27, 13.6, -27,
        18.8, -24.6, 24.4, -21.2, 28.6, -17, 31.2, -12.4, 32, -7.6, 31.6, -3.4, 30, -0.8,
      ])], m('moon'), o, 1.9);
      // Earthshine on the spine half: the crescent's dark side.
      fillAll(r, [t.poly([34.2, 0.6, 36.2, -2.4, 37, -7, 36.2, -12, 34.2, -16, 35.4, -11.4, 35.6, -6.8, 34.8, -2.6])], m('moonDark'), o, 0.8);
      trace(r, t, [15.2, -26.4, 19.6, -24.4, 24.6, -21, 28.8, -16.8, 31.4, -12.2, 32.2, -7.6, 31.8, -3.4], m('edge'), 3, g);
      // Collar: silver socket with the eye.
      fillAll(r, [t.rect(30.8, 0.2, 2, 2.1, 0.6)], m('silver'), o, 1.2);
      fillAll(r, [t.ell(31.2, 0.3, 1.1, 1.4)], m('snath'), o, 0.8);
      r.dot(t.x(31.2, 0.3), t.y(31.2, 0.3), m(ph === 2 ? 'eyeHot' : 'eye'), 3, g);
      r.dot(t.x(31.2, -0.5), t.y(31.2, -0.5), m('eye'), 3, g);
      // The wing: an arm curling back from the collar, opposite the blade,
      // raven pinions raised off it past the head of the scythe, ruffling.
      const L = (u: number): [number, number] => {
        const v = 1 - u;
        return [v * v * 31.4 + 2 * u * v * 28.4 + u * u * (34.6 + lift * 0.6), v * v * 1.8 + 2 * u * v * 9.4 + u * u * (14.6 + lift * 0.4)];
      };
      const quills = [1, 0.86, 0.72, 0.58, 0.44, 0.3, 0.17];
      quills.forEach((u, i) => {
        const [bx, by] = L(u);
        const a = 0.02 + u * 1.15 - lift * 0.05, len = 4.6 + u * 4.6;
        const c = Math.cos(a), sn = Math.sin(a), nx = -sn, ny = c;
        const ex = bx + c * len, ey = by + sn * len;
        const k = i % 2 ? 'feather' : 'featherAlt';
        fillAll(r, [t.poly([bx + nx * 1, by + ny * 1, bx + c * len * 0.6 + nx * 1.05, by + sn * len * 0.6 + ny * 1.05, ex, ey, bx + c * len * 0.6 - nx * 0.9, by + sn * len * 0.6 - ny * 0.9, bx - nx * 0.9, by - ny * 0.9])], m(k), o, 0.8);
        fillAll(r, [t.poly([bx + c * len * 0.66 + nx * 1, by + sn * len * 0.66 + ny * 1, ex, ey, bx + c * len * 0.66 - nx * 0.8, by + sn * len * 0.66 - ny * 0.8])], m('featherTip'), o, 0.6);
      });
      // The arm and its coverts, a silver glint along the leading edge.
      const arm: number[] = [];
      for (let u = 0; u <= 1.001; u += 0.125) { const [x, y] = L(u); arm.push(x, y, 0.95 - u * 0.5); }
      fillAll(r, [bend(t, arm)], m('feather'), { ...o, group: 45 }, 1);
      const edge: number[] = [];
      for (let u = 0.1; u <= 0.95; u += 0.17) { const [x, y] = L(u); edge.push(x, y + 0.9 - u * 0.4); }
      trace(r, t, edge, m('featherTip'), 4, 45);
      fillAll(r, [t.circ(31.2, 2.6, 0.6)], m('silver'), o, 0.6);
    },
  };
}

// =============================================================================
// Rapier
// =============================================================================

/** Rose Gold: a court rapier in rose gold over a blush-silver blade, burgundy grip, one garnet. */
const rosegold: SkinArt = {
  mats: {
    blade: { base: 0xe8c8c4, ramp: [0x6a4648, 0xa8807e, 0xe0bcb6, 0xf8e2dc, 0xffffff], shiny: true, tex: damascus(3.4, 0.6) },
    guard: { base: 0xe08870, ramp: [0x6a2a28, 0xa85440, 0xe08870, 0xf8bca0, 0xfff0e6], shiny: true },
    shell: { base: 0xf0b8a8, ramp: [0x8a4a44, 0xc87a6a, 0xf0b8a8, 0xffdcd0, 0xffffff], shiny: true },
    grip: plain(0x5a1a2a, lattice(2, -1)),
    wire: shiny(0xf4c4ae),
    pommel: { base: 0xc02a4a, ramp: [0x4a0a1a, 0x7a1428, 0xc02a4a, 0xf06a7a, 0xffd0d8], shiny: true },
  },
  trail: [0xfff0ea, 0xe0947a],
};

/**
 * Thornrose: a rapier whose hilt has bloomed. The cup is a crimson rose,
 * a dewdrop in its heart; a thorned vine makes the knuckle bow and curls
 * into the quillons, leaves at the guard, a rosebud for a pommel, and a
 * briar etched up the blade.
 */
function thornrose(): WeaponArt {
  return {
    tip: 34,
    mats: {
      blade: material({ base: 0xd8dce8, ramp: [0x4a4e62, 0x8a90a6, 0xc4cad8, 0xeef0f8, 0xffffff], shiny: true, tex: flow(11, 1.6, 2.75, 1) }),
      etch: material({ base: 0x3a7a4a }),
      petal: material({ base: 0xc8243a, ramp: [0x4a0614, 0x82101e, 0xc8243a, 0xf05a6a, 0xffb8c0], shiny: true, step: 0.15 }),
      petalDeep: material({ base: 0x82101e, ramp: [0x2a020a, 0x4a0614, 0x82101e, 0xb01c30, 0xe04a5a] }),
      vine: material({ base: 0x3a7a3a, ramp: [0x0e2a14, 0x1e4a24, 0x3a7a3a, 0x6aa850, 0xb0e080] }),
      leaf: material({ base: 0x4a9a42, ramp: [0x143a1a, 0x24622a, 0x4a9a42, 0x82c860, 0xd0f0a0], tex: (x, y) => (Math.abs(y - x * 0.1) < 0.25 ? 1 : 0) }),
      thorn: material(shiny(0xe8d8a8, undefined, 0.14)),
      grip: material(plain(0x1e3a24, bands(1.2, 0.5, 1))),
      dew: M.glow(0xffd8ea),
      dewHot: M.glow(0xffffff),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // Grip wound with vine, a rosebud pommel in its sepals.
      fillAll(r, [t.cap(-5, 0, -0.4, 0, 1.05, 0.95)], m('grip'), o, 1);
      for (let x = -4.4; x < -0.6; x += 1.4) r.line(t.x(x, -1), t.y(x, -1), t.x(x + 0.7, 1), t.y(x + 0.7, 1), m('vine'), 3, g);
      fillAll(r, [t.ell(-6.6, 0, 1.8, 1.4), t.poly([-8, -0.5, -9.4, 0, -8, 0.5])], m('petal'), o, 1.1);
      fillAll(r, [t.poly([-5.2, -1.2, -6.4, -1.6, -7.4, -0.4, -6, -0.4]), t.poly([-5.2, 1.2, -6.4, 1.6, -7.4, 0.4, -6, 0.4])], m('vine'), o, 0.7);
      // Blade, with a briar etched up its first third.
      fillAll(r, [t.poly([1.4, -1.15, 5, -1, 19, -0.72, 33, -0.32, 35, 0, 33, 0.32, 19, 0.72, 5, 1, 1.4, 1.15])], m('blade'), o, 1);
      const etch: number[] = [];
      for (let x = 3.6; x <= 12.6; x += 0.9) etch.push(x, Math.sin(x * 1.2) * 0.45);
      trace(r, t, etch, m('etch'), 1, g);
      for (const x of [5.2, 7.8, 10.4]) r.dot(t.x(x, Math.sin(x * 1.2) * 0.45 + 0.6), t.y(x, Math.sin(x * 1.2) * 0.45 + 0.6), m('etch'), 2, g);
      // The thorned vine: knuckle bow sweeping down to the bud, curling quillons.
      const vine = [
        bend(t, [0.8, 4.6, 0.62, -1.6, 4.9, 0.6, -4.4, 4, 0.58, -6.2, 1.6, 0.55]),
        bend(t, [1.4, -2.4, 0.55, 2.8, -4.2, 0.5, 4.6, -4.2, 0.45, 5.2, -2.8, 0.4]),
        bend(t, [0.6, -3.4, 0.55, -1.4, -5, 0.5, -3, -4.4, 0.42, -2.6, -3.2, 0.36]),
      ];
      fillAll(r, vine, m('vine'), o, 0.8);
      const thorns: Shape[] = [];
      for (const [x, y, dx, dy] of [[-0.4, 4.9, -0.6, 1.4], [-3, 4.6, -1.1, 1.1], [-5.4, 3, -1.4, 0.4], [3.4, -4.4, 0.4, -1.3], [-1.8, -5, -0.6, -1.3]]) {
        thorns.push(t.poly([x - 0.45, y, x + dx, y + dy, x + 0.45, y]));
      }
      fillAll(r, [union(...thorns)], m('thorn'), o, 0.6);
      // Leaves unfurling off the guard.
      fillAll(r, [t.poly([2, 2.4, 3.6, 3.4, 6.2, 3.6, 4.6, 2.4, 2.8, 2])], m('leaf'), o, 0.9);
      fillAll(r, [t.poly([2.4, -2, 4.4, -2.6, 6.4, -2, 4.4, -1.4])], m('leaf'), o, 0.9);
      // The rose in full bloom over the blade's root: five scalloped outer
      // petals, a tighter whorl inside, a dewdrop at its heart.
      const bloom: Shape[] = [t.circ(1.9, 0, 2.3)];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.3;
        bloom.push(t.circ(1.9 + Math.cos(a) * 1.9, Math.sin(a) * 1.9, 1.45));
      }
      fillAll(r, [union(...bloom)], m('petal'), o, 1.8);
      r.fill(subtract(t.circ(2.1, 0.1, 1.9), t.circ(2.5, 0.4, 1.35)), m('petalDeep'), { group: g, flat: 1, noLine: true });
      r.fill(t.circ(2.4, 0.3, 1.2), m('petal'), { group: g, bevel: 1, local: o.local });
      r.fill(subtract(t.circ(2.4, 0.3, 0.9), t.circ(2.1, 0.5, 0.6)), m('petalDeep'), { group: g, flat: 1, noLine: true });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.3 + Math.PI / 5;
        r.dot(t.x(1.9 + Math.cos(a) * 2.6, Math.sin(a) * 2.6), t.y(1.9 + Math.cos(a) * 2.6, Math.sin(a) * 2.6), m('petalDeep'), 1, g);
      }
      r.dot(t.x(2.6, 0.2), t.y(2.6, 0.2), m(ph === 1 ? 'dewHot' : 'dew'), 3, g);
    },
  };
}

// =============================================================================
// Storm rod
// =============================================================================

/** Copper Coil: polished copper and verdigris, a caged amber spark, like a workshop's first dynamo. */
const copper: SkinArt = {
  mats: {
    rod: { base: 0xb86a3a, ramp: [0x4a2414, 0x7a3e22, 0xb86a3a, 0xe09a62, 0xffd8b0], shiny: true },
    grip: plain(0x4a2a1a, lattice(2, -1)),
    coil: shiny(0xf0b060, undefined, 0.16),
    cage: plain(0x4aa088, speckle(0.2, 1)),
    crystal: glow(0xffa83a),
    core: glow(0xfff4d0),
  },
  trail: [0xfff0c8, 0xd08040],
};

/** Storm cloud: dark turning arms round a calm centre (local space, centred on (cx, 0)). */
const vortex = (cx: number): Tex => (x, y, ph) => {
  const dx = x - cx, d = Math.hypot(dx, y), a = Math.atan2(y, dx);
  if (d < 0.9) return 0;
  const arm = wrap(a * 2 + d * 1.5 - ph * (Math.PI / 2) * 2, Math.PI * 2);
  if (arm < 0.5 && d > 1.6 && d < 3.1 && hash(Math.floor(x * 3), Math.floor(y * 3) + ph) < 0.55) return 4;
  return arm < 2.2 ? 1 : arm > 4.4 ? -1 : 0;
};

/**
 * Eye of the Tempest: a storm-veined rod held by silver wind blades, capped
 * with a cage of three rings around a turning thunderhead whose calm eye
 * burns white; lightning crawls the cage and forks off its spike.
 */
function tempest(): WeaponArt {
  const cx = 14.2;
  return {
    tip: 19,
    mats: {
      rod: material(veined([0x161a2e, 0x222844, 0x323a5e, 0x4a5480], 0x9ae8ff, (x, y, ph) => {
        const v = Math.sin(x * 1.1 + Math.sin(y * 3 + ph * Q) * 1.6 - ph * Q);
        return Math.abs(v) < 0.14 ? 4 : 0;
      })),
      grip: material(plain(0x1a2240, bands(1.4, 0.5, 1))),
      silver: material(shiny(0xd0dcf0, undefined, 0.16)),
      cloud: material(veined([0x1a2040, 0x2a3460, 0x3e4c86, 0x5e6eaa], 0xe0f6ff, vortex(cx))),
      eye: M.glow(0xf6ffff),
      iris: M.glow(0x7ad8ff),
      bolt: M.glow(0xc8f0ff),
      boltDeep: M.glow(0x7a8aff),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      fillAll(r, [t.cap(-4.6, 0, 10.4, 0, 0.95, 0.85)], m('rod'), o, 1);
      fillAll(r, [t.cap(-3.6, 0, 1.2, 0, 1.15)], m('grip'), o, 1);
      fillAll(r, [t.circ(-5.3, 0, 1.35)], m('silver'), o, 1.2);
      r.dot(t.x(-5.3, 0), t.y(-5.3, 0), m('iris'), 3, g);
      // Wind blades sweeping up either side of the throat, like a gust curling.
      fillAll(r, [t.poly([6.4, 0.6, 7.4, 2.4, 9.4, 3.2, 8.6, 2, 8.6, 0.6])], m('silver'), o, 0.8);
      fillAll(r, [t.poly([6.4, -0.6, 7.4, -2.4, 9.4, -3.2, 8.6, -2, 8.6, -0.6])], m('silver'), o, 0.8);
      fillAll(r, [t.rect(10, 0, 0.7, 1.6, 0.3)], m('silver'), o, 1);
      // The thunderhead, turning.
      fillAll(r, [t.circ(cx, 0, 3.7)], m('cloud'), o, 2);
      // The eye: an iris ring and a white-hot centre.
      r.fill(t.circ(cx + 0.2, 0.2, 1.25), m('iris'), { group: g });
      r.fill(t.circ(cx + 0.2, 0.2, 0.6), m('eye'), { group: g });
      // The cage: three rings round the sphere (one seen edge-on), meeting in a spike.
      fillAll(r, [subtract(t.ell(cx, 0, 1.9, 4.1), t.ell(cx, 0, 1.3, 3.5))], m('silver'), { ...o, group: 41 }, 0.6);
      fillAll(r, [t.rect(cx - 3.6, 0, 0.5, 1.3, 0.2)], m('silver'), o, 0.6);
      fillAll(r, [t.poly([cx + 3.8, -0.7, cx + 5.4, 0, cx + 3.8, 0.7]), t.poly([cx + 4.2, -0.3, 19.6, 0, cx + 4.2, 0.3])], m('silver'), o, 0.7);
      // Lightning forks off the cage, a new path each frame.
      const forks = [
        [cx + 2.8, 3, cx + 3.8, 4.6, cx + 3.2, 5.6, cx + 4.2, 6.6],
        [cx - 1.4, -4, cx - 2.2, -5.2, cx - 1.4, -6, cx - 2.4, -7.2],
        [cx + 3, -3, cx + 4.2, -4.2, cx + 3.6, -5.2, cx + 4.8, -5.8],
        [cx - 2.4, 3.4, cx - 3.6, 4.4, cx - 3, 5.4],
      ][ph];
      trace(r, t, forks, m(ph % 2 ? 'boltDeep' : 'bolt'), 3, g);
      r.dot(t.x(19.8, 0), t.y(19.8, 0), m('bolt'), 3, g);
    },
  };
}

const TM = mats({
  cloud: { base: 0x4a5890, ramp: [0x1e2444, 0x2e3866, 0x4a5890, 0x6a7ab4, 0x9aa8d8] },
  eye: { base: 0xf6ffff, glow: true },
  iris: { base: 0x7ad8ff, glow: true },
  bolt: { base: 0xc8f0ff, glow: true },
  boltDeep: { base: 0x7a8aff, glow: true },
});

/** A storm-eye spark: a little thunderhead with a burning eye, lightning trailing behind. */
const tempestSpark: ProjArt = {
  frames: 3,
  draw(r, t, f, h) {
    const zz = [[-3, 1.6, -5.6, -1.2, -8, 1.4, -11, -0.6], [-3, -1.4, -5.8, 1.4, -8.6, -1, -10.6, 1], [-2.8, 1.2, -5.2, -1.6, -7.6, 0.8, -11, -1.2]][f];
    let px = -1, py = 0;
    for (let i = 0; i < zz.length; i += 2) {
      r.line(t.x(px, py), t.y(px, py), t.x(zz[i], zz[i + 1]), t.y(zz[i], zz[i + 1]), h(i < 4 ? TM.bolt : TM.boltDeep), 3, 1);
      px = zz[i]; py = zz[i + 1];
    }
    const br = [[-5.6, -1.2, -6.8, -3.4], [-5.8, 1.4, -6.4, 3.4], [-5.2, -1.6, -7, -3.2]][f];
    r.line(t.x(br[0], br[1]), t.y(br[0], br[1]), t.x(br[2], br[3]), t.y(br[2], br[3]), h(TM.boltDeep), 3, 1);
    // The cloud ball turning: lobes swap each frame.
    const lobes = [[1.6, 1.4, -1, 1.2, 0.2, -1.6], [-1, 1.6, 1.8, -1, -0.8, -1.4], [0.4, 1.8, 1.6, 0.6, -1.4, -0.8]][f];
    r.fill(union(t.circ(0.6, 0, 2.8), t.circ(lobes[0], lobes[1], 1.6), t.circ(lobes[2], lobes[3], 1.5), t.circ(lobes[4], lobes[5], 1.5)), h(TM.cloud), { group: 2, bevel: 1.4 });
    r.fill(t.circ(0.9, 0, 1.3), h(TM.iris), { group: 2 });
    r.fill(t.circ(0.9, 0, 0.6), h(TM.eye), { group: 2 });
    const tip = [[4.4, 1.8], [4.6, -1.6], [5.2, 0.4]][f];
    r.line(t.x(3, 0), t.y(3, 0), t.x(tip[0], tip[1]), t.y(tip[0], tip[1]), h(TM.bolt), 3, 1);
  },
};

// =============================================================================
// Halberd
// =============================================================================

/** Royal Guard: polished parade steel, a royal-blue lacquered haft banded in gold, crimson tassel. */
const royalguard: SkinArt = {
  mats: {
    haft: plain(0x2a3a8a, bands(4.5, 0.7, 2)),
    head: shiny(0xe6ecf8, undefined, 0.17),
    spike: shiny(0xd8a838),
    band: shiny(0xe8b840),
    wrap: plain(0xa01a2a, lattice(2, -1)),
    tassel: plain(0xc8243a, bands(0.9, 0.4, -1)),
  },
  trail: [0xf4f6ff, 0x6a7ad8],
};

/**
 * Dragoon's Wing: a dragon knight's halberd. A dragon's head bites the
 * socket, its horns swept back; the axe is a bat-winged dragon's wing
 * with gold finger bones and a scalloped membrane edge, ember veins
 * pulsing through it; a talon for the back spike and a long flame-wave
 * fang for the point. A crimson pennant streams from the throat.
 */
function dragoon(): WeaponArt {
  return {
    tip: 42,
    grip2: 12,
    mats: {
      haft: material({ base: 0x3a1e24, ramp: [0x120609, 0x240e12, 0x3a1e24, 0x5a3238, 0x8a5a5a], tex: (x, y) => (wrap(x + y * 2.2, 3) < 0.8 ? 1 : 0) }),
      gold: material({ base: 0xe0a830, ramp: [0x5a3410, 0x9a6418, 0xe0a830, 0xf8d460, 0xfff6c0], shiny: true }),
      wrap: material(plain(0x8a1a22, lattice(2, -1))),
      membrane: material({ base: 0x8a1e22, ramp: [0x3a0a10, 0x5e1218, 0x8a1e22, 0xb0302e, 0xd85a48], tex: (x, y) => (wrap(x * 0.8 - y * 0.5, 2.6) < 0.5 ? -1 : 0) }),
      vein: M.glow(0xffa040),
      steel: material({ base: 0xd4dcea, ramp: [0x3e4458, 0x7a8298, 0xb8c2d4, 0xe6ecf6, 0xffffff], shiny: true, tex: flow(10, 1.4, 2.5, 1) }),
      scale: material({ base: 0x7a1a20, ramp: [0x240608, 0x480e12, 0x7a1a20, 0xa83a34, 0xe07a5a], shiny: true, tex: scales(1.6, 1.1) }),
      talon: material(shiny(0x2a2430, undefined, 0.17)),
      eye: M.glow(0xffc23a),
      pennant: material({ base: 0xb01c28, ramp: [0x3a0610, 0x6a0e18, 0xb01c28, 0xe04a4a, 0xff9a8a], tex: bands(2.2, 0.5, -1) }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // Pennant streaming back from the throat, rippling.
      const w = [0, 0.5, 0.8, 0.4][ph];
      fillAll(r, [t.poly([23.8, 1, 21.4, 2.8 + w * 0.4, 18.4, 3 + w, 15.6, 4.2 + w * 0.6, 17.2, 2.6 + w * 0.6, 15.2, 1.4 + w * 0.3, 18.8, 1.2, 22.6, 0.2])], m('pennant'), o, 0.8, -1);
      fillAll(r, [t.cap(-11.5, 0, 33, 0, 1.15, 1.05)], m('haft'), o, 1);
      fillAll(r, [t.poly([-11.4, -1.2, -14, 0, -11.4, 1.2]), t.rect(-0.2, 0, 0.6, 1.5), t.rect(5.2, 0, 0.6, 1.5), t.rect(14, 0, 0.5, 1.4)], m('gold'), o, 1);
      fillAll(r, [t.cap(1, 0, 4, 0, 1.38)], m('wrap'), o, 1);
      // The talon back spike, hooked like a claw.
      fillAll(r, [t.poly([27, 1, 28.2, 4.2, 27.4, 7.4, 25.6, 9.4, 28.6, 8, 30.4, 4.6, 31, 1])], m('talon'), o, 1.2);
      // The wing: an arm bone out from the socket, three fingers fanning, membrane between.
      const memb = t.poly([
        26.4, -1.2, 24.6, -5.4, 20.8, -10.8, 23, -9.6, 25.4, -9.8, 27.2, -12.2, 29.4, -10, 32.2, -10.2, 35.6, -13.8,
        34.8, -9.6, 33.6, -5, 32.4, -1,
      ]);
      fillAll(r, [memb], m('membrane'), o, 1.6);
      fillAll(r, [
        bend(t, [27.4, -1.2, 0.7, 27.6, -4.6, 0.6]),
        bend(t, [27.6, -4.6, 0.5, 24.6, -7.6, 0.42, 20.8, -10.8, 0.32]),
        bend(t, [27.6, -4.6, 0.48, 27.6, -9, 0.4, 27.2, -12.2, 0.3]),
        bend(t, [27.6, -4.6, 0.48, 31.2, -9, 0.4, 35.6, -13.8, 0.3]),
      ], m('gold'), o, 0.6);
      fillAll(r, [t.circ(27.6, -4.6, 0.85)], m('gold'), o, 0.8);
      // Ember veins pulsing through the membrane, one after another.
      const veins = [[24, -6.4, 24.6, -8.4, 23.8, -9.4], [29, -6.4, 29.6, -8.4, 30.8, -9.6], [32.4, -4, 33, -7, 33.8, -9.4]];
      veins.forEach((v, i) => { if ((i + ph) % 4 !== 3) trace(r, t, v, m('vein'), 3, g); });
      // The fang point: a long wavy blade with a gold ridge.
      fillAll(r, [t.poly([32.4, -1.3, 34.6, -2.2, 36.6, -1.4, 38.6, -1.7, 40.6, -0.8, 43.4, 0, 40.6, 0.9, 38.6, 1.6, 36.6, 1.3, 34.6, 2.1, 32.4, 1.3])], m('steel'), o, 1.3);
      r.line(t.x(33.4, 0), t.y(33.4, 0), t.x(40.4, 0), t.y(40.4, 0), m('gold'), 3, g);
      // The dragon's head on the socket, jaws round the fang's root: a heavy
      // brow, gold horns swept back, a burning eye, teeth along the lip.
      fillAll(r, [t.poly([24.6, -1.2, 27, -2, 30.6, -1.8, 32.6, -1, 30.4, -0.6, 26.4, -0.4])], m('scale'), { ...o, group: 41 }, 1);
      fillAll(r, [t.poly([23.4, -0.8, 23.6, 1.8, 25.6, 2.8, 28.4, 2.6, 31.4, 1.8, 34, 0.8, 33.6, 0.2, 30, 0.2, 26.4, 0.1])], m('scale'), o, 1.3);
      fillAll(r, [t.poly([25, 2.2, 21.4, 4.4, 18.6, 4.6, 21.8, 3.2, 24.2, 1.2])], m('gold'), o, 0.9);
      fillAll(r, [t.poly([26.4, 2.6, 24.6, 4.6, 22.8, 5.4, 25.2, 3.4])], m('gold'), o, 0.8);
      r.line(t.x(29, 1.9), t.y(29, 1.9), t.x(33.2, 0.8), t.y(33.2, 0.8), m('gold'), 3, g);
      r.dot(t.x(28, 1.3), t.y(28, 1.3), m('eye'), 3, g);
      r.dot(t.x(28.8, 1.2), t.y(28.8, 1.2), m('eye'), 3, g);
      for (const x of [29.6, 31, 32.4]) r.dot(t.x(x, 0), t.y(x, 0), m('gold'), 4, g);
    },
  };
}

// =============================================================================
// Grave staff
// =============================================================================

/** Ashen Bone: charred ash wood and soot-grey bone, the soul light burned down to an ember. */
const ashbone: SkinArt = {
  mats: {
    shaft: { base: 0x4a4240, ramp: [0x161214, 0x2a2426, 0x4a4240, 0x6e6460, 0x9a8a80], tex: grain(1) },
    bone: plain(0xb4aca0, speckle(0.14, -1)),
    horn: shiny(0x1e1a1e),
    wrap: plain(0x8a7a6a, bands(1.3, 0.5, -1)),
    socket: plain(0x100c0e),
    soul: glow(0xff7a2a),
    soulHot: glow(0xffe0a0),
  },
  trail: [0xffd8b0, 0x8a6a5a],
};

/**
 * Crown of the Necropolis: a vertebral staff bound in black iron, topped
 * by the skull of a dead king, crowned, its sockets alight with violet
 * soulfire, and ringed by a halo of grave candles whose ghostly flames
 * gutter one after another.
 */
function necropolis(): WeaponArt {
  const C = 31.4; // skull centre
  return {
    tip: 40,
    grip2: 12,
    mats: {
      shaft: material({ base: 0x2c2832, ramp: [0x0c0a10, 0x18151c, 0x2c2832, 0x463f4e, 0x6a6074], tex: grain(1) }),
      iron: material(shiny(0x4a4858, speckle(0.1, -1))),
      bone: material({ base: 0xe6dcc0, ramp: [0x5a5040, 0x9a8e74, 0xcec2a2, 0xeee6cc, 0xfffbec], step: 0.12 }),
      crown: material({ base: 0xd8a838, ramp: [0x4a2a10, 0x8a5a1a, 0xc8922a, 0xf0c450, 0xfff0a8], shiny: true }),
      gem: M.glow(0x9a6aff),
      socket: material({ base: 0x140c1a }),
      soul: M.glow(0xa88aff),
      soulHot: M.glow(0xf2eaff),
      ring: material({ base: 0x5a5a6e, ramp: [0x1e1e28, 0x34343e, 0x5a5a6e, 0x8a8aa0, 0xc8c8e0], shiny: true }),
      wax: material({ base: 0xd8d4c4, ramp: [0x6a6658, 0x9e9a88, 0xd8d4c4, 0xf0ece0, 0xffffff] }),
      flame: M.glow(0x7affd8),
      flameHot: M.glow(0xeafff8),
      wrap: material(plain(0x3a2a4a, lattice(2, -1))),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      fillAll(r, [t.cap(-20, 0, 27, 0, 1.12, 1.0)], m('shaft'), o, 1);
      fillAll(r, [t.poly([-19.8, -1.1, -23.6, 0, -19.8, 1.1])], m('iron'), o, 1);
      fillAll(r, [t.rect(-19.4, 0, 0.5, 1.4), t.rect(7, 0, 0.5, 1.35), t.rect(16, 0, 0.5, 1.35)], m('iron'), o, 0.8);
      fillAll(r, [t.cap(-1.8, 0, 1.8, 0, 1.38), t.cap(10.6, 0, 13.4, 0, 1.35)], m('wrap'), o, 1);
      // Vertebrae stacked up the neck of the staff.
      const vert: Shape[] = [];
      for (let i = 0; i < 4; i++) vert.push(t.ell(19.2 + i * 2, 0, 0.72, 1.55 + i * 0.1));
      fillAll(r, [union(...vert)], m('bone'), o, 1);
      // The skull: cranium, cheekbone, jaw, a deep socket lit violet.
      fillAll(r, [t.circ(C, 0.6, 3.6), t.rect(C - 1.8, -2.4, 1.9, 1.9, 0.7)], m('bone'), o, 1.5);
      r.fill(t.ell(C + 0.6, -1.5, 1.15, 0.95), m('socket'), { group: g, flat: 0, noLine: true });
      r.dot(t.x(C + 0.6, -1.5), t.y(C + 0.6, -1.5), m(ph % 2 ? 'soulHot' : 'soul'), 3, g);
      r.dot(t.x(C - 1.2, -3.1), t.y(C - 1.2, -3.1), m('socket'), 0, g);
      r.line(t.x(C - 2.9, -2.4), t.y(C - 2.9, -2.4), t.x(C - 2.9, -4.2), t.y(C - 2.9, -4.2), m('socket'), 0, g);
      for (const y of [-3.6, -2.8]) r.dot(t.x(C - 2.3, y), t.y(C - 2.3, y), m('bone'), 4, g);
      // The crown: a band with five points, gems set in it.
      fillAll(r, [t.poly([
        C + 2.2, -3.4, C + 3.4, -3.8, C + 6, -4.2, C + 4.4, -2.4, C + 6.6, -1.6, C + 4.6, -0.6, C + 7.2, 0.6,
        C + 4.6, 1.6, C + 6.6, 2.8, C + 4.4, 3.4, C + 5.6, 4.6, C + 3.2, 4.4, C + 2, 3.8,
      ])], m('crown'), o, 1.1);
      for (const y of [-2.4, 0.6, 3]) r.dot(t.x(C + 3.6, y), t.y(C + 3.6, y), m('gem'), 3, g);
      r.dot(t.x(C + 3.6, -0.9), t.y(C + 3.6, -0.9), m('crown'), 4, g);
      // A wisp of soulfire rising from the crown.
      const lean = [0, 0.5, 0.2, -0.4][ph];
      r.fill(t.poly([C + 6.4, -0.8, C + 7.8 + lean * 0.5, -0.6 + lean, C + 9 + lean, 0.2 + lean, C + 7.8 + lean * 0.4, 0.8 + lean, C + 6.4, 1.2]), m('soul'), { group: g });
      r.dot(t.x(C + 7.2, 0.2), t.y(C + 7.2, 0.2), m('soulHot'), 3, g);
      // A ring of grave candles round the neck, standing clear either side
      // of the skull, their ghostly flames guttering one after another.
      const R = C - 3.6;
      fillAll(r, [subtract(t.ell(R, 0, 0.95, 7.4), t.ell(R + 0.15, 0, 0.45, 6.8))], m('ring'), o, 0.6);
      const candles = [[-6.8, 2.6], [-4.8, 1.8], [4.8, 2], [6.8, 2.8]] as const;
      candles.forEach(([y, h], i) => {
        fillAll(r, [t.rect(R + h / 2, y, h / 2, 0.6)], m('wax'), o, 0.6);
        const tall = (i + ph) % 4 === 0 ? 1.8 : 3, sway = ((i + ph) % 2 ? 0.3 : -0.3);
        r.fill(t.poly([R + h, y - 0.7, R + h + tall * 0.5, y - 0.6 + sway * 0.5, R + h + tall, y + sway, R + h + tall * 0.5, y + 0.6 + sway * 0.5, R + h, y + 0.7]), m('flame'), { group: g });
        r.dot(t.x(R + h + 0.5, y), t.y(R + h + 0.5, y), m('flameHot'), 3, g);
      });
    },
  };
}

const NM = mats({
  soul: { base: 0xa88aff, glow: true },
  soulDim: { base: 0x5a3ab8, glow: true },
  soulHot: { base: 0xf2eaff, glow: true },
  crown: { base: 0xd8a838, ramp: [0x4a2a10, 0x8a5a1a, 0xc8922a, 0xf0c450, 0xfff0a8] },
  socket: { base: 0x1a0c2a },
  flame: { base: 0x7affd8, glow: true },
});

/** The soul bolt as a dead king's ghost: a violet skull, crowned, its tail of soulfire flickering. */
const kingsGhost: ProjArt = {
  frames: 3,
  draw(r, t, f, h) {
    const k = Math.cos(t.ang) < 0 ? new Xf(t.ox, t.oy, t.ang, 1, -1) : t;
    const w = [0, 0.8, -0.6][f];
    r.fill(k.poly([1.4, -3.2, -4, -2.6 - w * 0.5, -8, -1 + w, -12.4, 0.6 + w * 1.5, -7.4, 1.4 + w * 0.5, -4.4, 3.4, 1.4, 3.4]), h(NM.soulDim), { group: 1 });
    r.fill(k.poly([0, -2.2, -5, -1, -8.6, 0.4 + w, -4.6, 1.6, 0, 2.4]), h(NM.soul), { group: 1 });
    r.fill(k.circ(1.2, 0.3, 3.3), h(NM.soul), { group: 1 });
    r.fill(k.ell(1.6, 0.4, 2.4, 2.3), h(NM.soulHot), { group: 1 });
    r.dot(k.x(1.6, 1.2), k.y(1.6, 1.2), h(NM.socket), 1, 1);
    r.dot(k.x(3.4, 1.2), k.y(3.4, 1.2), h(NM.socket), 1, 1);
    r.line(k.x(2, -1), k.y(2, -1), k.x(3.4, -1), k.y(3.4, -1), h(NM.soulDim), 3, 1);
    // A three-pointed crown on the brow.
    r.fill(k.poly([-1.2, 2.6, -1.6, 5, -0.2, 3.8, 0.8, 5.6, 1.8, 3.8, 3.2, 5, 3, 2.8, 0.8, 3.4]), h(NM.crown), { group: 2, bevel: 0.8 });
    r.dot(k.x(0.8, 3.4), k.y(0.8, 3.4), h(NM.flame), 3, 2);
  },
};

export const WAVE4_MAINS: Record<string, SkinArt> = {
  'chain_sickle.rustbound': rustbound,
  'chain_sickle.serpentcoil': {
    weapon: serpentCoil, proj: { hook: serpentHook }, chain: ['#f0c850', '#3aa058', '#123a20', '#1e5a30'], ...legend(0xe8ff9a, 0x2a9a4a, 0xd8ffb0) },
  'soul_scythe.harvest': harvest,
  'soul_scythe.thanatos': { weapon: thanatos, ...legend(0xf2eeff, 0x7a5ad8, 0xe8ecff) },
  'rapier.rosegold': rosegold,
  'rapier.thornrose': { weapon: thornrose, ...legend(0xffd8e4, 0xd8285a, 0xffe8ee) },
  'storm_rod.copper': copper,
  'storm_rod.tempest': { weapon: tempest, proj: { spark: tempestSpark }, ...legend(0xf0fbff, 0x5a6aff, 0xc8f0ff) },
  'halberd.royalguard': royalguard,
  'halberd.dragoon': { weapon: dragoon, ...legend(0xffe0a0, 0xd8402a, 0xffd8a0) },
  'grave_staff.ashbone': ashbone,
  'grave_staff.necropolis': { weapon: necropolis, proj: { soul: kingsGhost }, ...legend(0xf0e8ff, 0x7a4ad8, 0xe0d0ff) },
};

