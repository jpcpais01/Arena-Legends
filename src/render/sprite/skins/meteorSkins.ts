import type { Raster } from '../../pixel/raster';
import { halfPlane, intersect, subtract, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { Xf } from '../xform';
import type { ProjArt, SkinArt } from './index';
import { glow, mats, plain, shiny, wrap } from './kit';

/**
 * Legendary Meteor Sigil skins (v0.85.0). Each reshapes the icon, the rune
 * circle that turns over the shoulder while the meteor is called, and the
 * meteor itself, and strikes in its own way (meteorFx.ts picks the impact by
 * skin name):
 * - Tidefall: a churning globe of the sea that crashes into a splash crown,
 *   a water column and waves rolling out;
 * - Bloomfall: a glowing seed wrapped in vines that bursts into roots, a
 *   giant flower and a storm of petals;
 * - Singularity: a black hole with a burning accretion disk that drags the
 *   arena in, then collapses into a nova.
 * Night accents: the foam and light in the water, the seed's veins and the
 * pollen, the disk and the lensing ring are self-lit; the rest stays matte.
 */

/** A ring between radii r0 and r1 round (cx, cy) in frame t (scales with the frame, unlike `arc`). */
const band = (t: Xf, cx: number, cy: number, r0: number, r1: number): Shape => subtract(t.circ(cx, cy, r1), t.circ(cx, cy, r0));

/** A point on a circle round the frame origin, in raster space. */
const on = (t: Xf, a: number, d: number): [number, number] => [t.x(Math.cos(a) * d, Math.sin(a) * d), t.y(Math.cos(a) * d, Math.sin(a) * d)];

// =============================================================================
// Tidefall: the sea
// =============================================================================

const SEA = [0x0a2a5a, 0x124a8a, 0x1e74c0, 0x3aa4e8, 0xc8f4ff];

/** Light running through water: a slow caustic net, one step per frame. */
const caustic = (x: number, y: number, ph: number) => (Math.sin(x * 0.9 + ph * 1.6) + Math.sin(y * 1.1 - x * 0.4 + ph) > 1.35 ? 1 : 0);

const WM = mats({
  deep: { base: 0x124a8a, glow: true },
  sea: { base: SEA[2], ramp: SEA, shiny: true, step: 0.14, tex: caustic },
  light: { base: 0x6ad0ff, glow: true },
  foam: { base: 0xe8fbff, glow: true },
  spray: { base: 0x9ae4ff, glow: true },
});

const tideMeteor: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A globe of seawater hurtling down, a foam crest on its leading face, a long tail of spray streamers.
    const fl = [0, 1, 0, -1][f];
    r.fill(t.poly([4, -7.8, -8, -7 + fl, -22, -4.6, -36 - fl * 2, -1, -40, 0, -36, 1.4, -22, 4.6, -8, 7 - fl, 4, 7.8]), h(WM.deep), { group: 1 });
    r.fill(t.poly([3, -5.6, -10, -4 - fl * 0.6, -26, -1.6, -32, 0, -26, 1.8, -10, 4 + fl * 0.6, 3, 5.6]), h(WM.light), { group: 1 });
    // Streamers of spray peeling off the globe, shifting each frame.
    for (let k = 0; k < 3; k++) {
      const y = (k - 1) * 3.6 + (k === f % 3 ? 0.6 : 0);
      r.line(t.x(-4, y), t.y(-4, y), t.x(-18 - k * 4 - fl * 2, y * 1.3), t.y(-18 - k * 4 - fl * 2, y * 1.3), h(WM.foam), 3, 1);
    }
    // Droplets flung back along the tail.
    for (let k = 0; k < 9; k++) {
      const x = -12 - k * 3.4 + (hash(k, f) - 0.5) * 3, y = (hash(k + 4, f * 5) - 0.5) * 2 * (8 - k * 0.5);
      r.dot(t.x(x, y), t.y(x, y), h(k % 3 ? WM.spray : WM.foam), 3, 1);
    }
    // The globe, light running through it.
    r.fill(t.circ(3, 0, 7.4), h(WM.sea), { group: 2, bevel: 3, local: t });
    // A swirl turning inside: a lighter band sweeping round.
    const a0 = f * (Math.PI / 2);
    for (let k = 0; k < 7; k++) {
      const a = a0 + k * 0.32, d = 5.2 - k * 0.35;
      r.dot(t.x(3 + Math.cos(a) * d, Math.sin(a) * d), t.y(3 + Math.cos(a) * d, Math.sin(a) * d), h(WM.light), 3, 2);
    }
    // Bubbles rising inside.
    for (const [x, y] of [[1, -3 + f], [4.5, 1 - (f % 2)], [-0.5, 2.4 - f * 0.6]]) r.dot(t.x(x, y), t.y(x, y), h(WM.foam), 3, 2);
    // The foam crest breaking over the leading face.
    r.fill(subtract(t.circ(4.2, 0, 7.8), t.circ(2.2, 0.4, 7.4)), h(WM.foam), { group: 3 });
    r.dot(t.x(7.6, 3 - (f & 1)), t.y(7.6, 3 - (f & 1)), h(WM.foam), 3, 3);
    r.dot(t.x(5.4, 3.6), t.y(5.4, 3.6), h(WM.foam), 3, 3);
  },
};

const tideSigil: ProjArt = {
  frames: 8,
  draw(r, t, f, h) {
    // A ring of turning water: three breaking wave crests chase round it, droplets at the nodes, a drop at the heart.
    r.fill(band(t, 0, 0, 9, 10.6), h(WM.sea), { group: 1, local: t });
    r.fill(band(t, 0, 0, 5.6, 6.4), h(WM.light), { group: 1 });
    const turn = f * (Math.PI / 12);
    for (let i = 0; i < 3; i++) {
      const a = turn + (i * Math.PI * 2) / 3;
      // A crest: a curl of water rising off the ring, foam on its lip.
      for (let k = 0; k < 6; k++) {
        const q = a + k * 0.12, d = 10.6 + Math.sin((k / 5) * Math.PI) * 2.6;
        const [x, y] = on(t, q, d);
        r.dot(x, y, h(k > 3 ? WM.foam : WM.light), 3, 1);
      }
      const [x, y] = on(t, a + Math.PI / 3, 8);
      r.dot(x, y, h(WM.foam), 3, 1);
    }
    // The drop at the heart, catching the light.
    r.fill(t.poly([0, 3.6, 2.2, 0.2, 1.6, -1.8, 0, -2.6, -1.6, -1.8, -2.2, 0.2]), h(WM.light), { group: 2 });
    r.dot(t.x(-0.6, 0.4), t.y(-0.6, 0.4), h(WM.foam), 3, 2);
  },
};

const tidefall: SkinArt = {
  mats: {
    // Stock names, for anything drawn the stock way.
    sigil: glow(0x3aa4e8), rock: shiny(0x1e74c0, undefined, 0.14), ember: glow(0xc8f4ff),
    lava: glow(0x6ad0ff), lavaHot: glow(0xffffff), fire: glow(0x3aa4e8), fireHot: glow(0xe8fbff), fireDeep: glow(0x124a8a),
    'k.ring': { base: SEA[2], ramp: SEA, shiny: true, step: 0.14 },
    'k.sea': { base: SEA[2], ramp: SEA, shiny: true, step: 0.14, tex: caustic },
    'k.deep': plain(0x124a8a),
    'k.light': glow(0x6ad0ff),
    'k.foam': glow(0xe8fbff),
  },
  glow: [0xd8f8ff, 0x1a6ad0],
  fx: { spark: 0xd8f8ff, spark2: 0x2a8ae0 },
  icon(r, t, m) {
    // A great wave curling inside a ring of water, a globe of the sea riding its crest.
    r.fill(band(t, 0, 0, 11.2, 12.8), m('k.ring'), { group: 1, local: t });
    // The wave: a rising swell curling over to the left, its hollow open below.
    const wave = subtract(t.poly([-10, -7, 9, -7, 9, -2, 6, 3, 1, 7, -4, 8, -8, 6, -9, 2, -6, 3, -3, 1, -4, -2, -8, -4]), t.circ(-1, -1.6, 2.6));
    r.fill(wave, m('k.sea'), { group: 2, bevel: 2, local: t });
    r.fill(t.poly([-10, -7, 9, -7, 9, -5, -10, -5]), m('k.deep'), { group: 2 });
    // Foam fingers breaking off the lip.
    for (const [x, y] of [[-8, 6], [-9.6, 4], [-6, 7.6], [-10.2, 1.4]]) r.fill(t.circ(x, y, 1.1), m('k.foam'), { group: 3 });
    r.line(t.x(-4, 8), t.y(-4, 8), t.x(5, 3.6), t.y(5, 3.6), m('k.foam'), 3, 3);
    // The globe.
    r.fill(t.circ(5, 6.4, 3.4), m('k.light'), { group: 4, bevel: 1.4 });
    r.dot(t.x(4, 7.6), t.y(4, 7.6), m('k.foam'), 3, 4);
  },
  proj: { meteor: tideMeteor, sigil: tideSigil },
};

// =============================================================================
// Bloomfall: a seed of the first forest
// =============================================================================

const BM = mats({
  seed: { base: 0xb07a3a, ramp: [0x3a2414, 0x6a4422, 0x9a6a34, 0xc8944a, 0x9aff6a], shiny: true, tex: (x, y) => (Math.abs(Math.sin(x * 0.7 + y * 0.25)) < 0.12 ? 2 : 0) },
  vine: { base: 0x3a8a2a, step: 0.14 },
  leaf: { base: 0x6ac83a, step: 0.14 },
  vein: { base: 0x9aff6a, glow: true },
  petal: { base: 0xff8ad0, step: 0.12 },
  petalHot: { base: 0xffd8f0, glow: true },
  pollen: { base: 0xffe060, glow: true },
  trail: { base: 0x6ae05a, glow: true },
  trailPink: { base: 0xff9ad8, glow: true },
});

/** A leaf at (x, y) in frame t pointing along angle a, `s` long. */
function leaf(r: Raster, t: Xf, x: number, y: number, a: number, s: number, m: number, g: number): void {
  const c = Math.cos(a), n = Math.sin(a);
  r.fill(t.poly([x, y, x + c * s * 0.5 - n * s * 0.32, y + n * s * 0.5 + c * s * 0.32, x + c * s, y + n * s, x + c * s * 0.5 + n * s * 0.32, y + n * s * 0.5 - c * s * 0.32]), m, { group: g });
}

const bloomMeteor: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A great seed wrapped in vines, glowing green from its seams, trailing leaves and petals.
    const fl = [0, 1, 0, -1][f];
    r.fill(t.poly([2, -7, -8, -6 + fl, -22, -3, -34 - fl * 2, 0, -22, 3, -8, 6 - fl, 2, 7]), h(BM.trail), { group: 1 });
    r.fill(t.poly([1, -4.4, -10, -2.6, -24, 0, -10, 2.6, 1, 4.4]), h(BM.trailPink), { group: 1 });
    // Leaves and petals tumbling in the tail.
    for (let k = 0; k < 6; k++) {
      const x = -12 - k * 4.2 + (hash(k, f) - 0.5) * 2, y = (hash(k + 3, f * 7) - 0.5) * 2 * (7 - k * 0.6);
      leaf(r, t, x, y, k * 1.3 + f * 0.8, 3.2, h(k % 2 ? BM.leaf : BM.petal), 1);
    }
    // The seed, lit along its seams.
    r.fill(t.ell(3, 0, 8.4, 6.6), h(BM.seed), { group: 2, bevel: 3, local: t });
    // Glowing seams splitting the shell where it is about to sprout.
    for (const [x0, y0, x1, y1] of [[-2, 3, 4, 1.5], [4, 1.5, 8, 3.4], [0, -2.6, 6, -1.2]]) r.line(t.x(x0, y0), t.y(x0, y0), t.x(x1, y1), t.y(x1, y1), h(BM.vein), 3, 2);
    // A vine wound round it, leaves on it stirring.
    let px = -5, py = 5;
    for (let k = 1; k <= 9; k++) {
      const x = -5 + k * 1.7, y = Math.cos(k * 0.75 + f * 0.4) * 6.4;
      r.line(t.x(px, py), t.y(px, py), t.x(x, y), t.y(x, y), h(BM.vine), 2, 3);
      px = x; py = y;
    }
    for (const s of [-1, 1]) leaf(r, t, 0, s * 6, s * (1.3 + fl * 0.2), 5.4, h(BM.leaf), 3);
    // A bud breaking open at the tip.
    r.fill(t.circ(11, 0, 2.2), h(BM.petal), { group: 4, bevel: 1 });
    r.dot(t.x(12, 0), t.y(12, 0), h(BM.pollen), 3, 4);
  },
};

const bloomSigil: ProjArt = {
  frames: 8,
  draw(r, t, f, h) {
    // A wreath of vine with six petals turning round a heart of pollen, leaves sprouting off the ring.
    r.fill(band(t, 0, 0, 9.2, 10.4), h(BM.vine), { group: 1 });
    const turn = f * (Math.PI / 24);
    for (let i = 0; i < 6; i++) {
      const a = -turn + (i * Math.PI) / 3;
      const [x, y] = on(t, a + Math.PI / 6, 10.6);
      r.dot(x, y, h(BM.leaf), 3, 1);
      const p = new Xf(t.ox, t.oy, a);
      r.fill(p.ell(4.2, 0, 3.2, 1.6), h(BM.petal), { group: 2 });
      r.dot(p.x(5, 0), p.y(5, 0), h(BM.petalHot), 3, 2);
    }
    r.fill(t.circ(0, 0, 1.8), h(BM.pollen), { group: 3 });
    for (let i = 0; i < 4; i++) {
      const [x, y] = on(t, turn * 3 + (i * Math.PI) / 2, 8.2);
      r.dot(x, y, h(wrap(i + f, 4) === 0 ? BM.pollen : BM.leaf), 3, 1);
    }
  },
};

const bloomfall: SkinArt = {
  mats: {
    sigil: glow(0x6ae05a), rock: shiny(0x9a6a34, undefined, 0.14), ember: glow(0xffe060),
    lava: glow(0x9aff6a), lavaHot: glow(0xffffff), fire: glow(0xff9ad8), fireHot: glow(0xffd8f0), fireDeep: glow(0x3a8a2a),
    'k.vine': plain(0x3a8a2a), 'k.leaf': plain(0x6ac83a),
    'k.petal': { base: 0xff8ad0, step: 0.12 }, 'k.petalHot': glow(0xffd8f0), 'k.pollen': glow(0xffe060),
  },
  glow: [0xffd8f0, 0x3aa84a],
  fx: { spark: 0xffd8f0, spark2: 0x6ac83a, kind: 'petal' },
  icon(r, t, m) {
    // A blossom opening in a wreath of vine, two leaves under it.
    r.fill(band(t, 0, 0, 11.2, 12.6), m('k.vine'), { group: 1 });
    for (const s of [-1, 1]) leaf(r, t, s * 1.5, -3, -Math.PI / 2 + s * 0.9, 9, m('k.leaf'), 2);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / 5;
      const p = new Xf(t.ox, t.oy, a);
      r.fill(p.ell(4.6, 0, 4.4, 2.6), m('k.petal'), { group: 3, bevel: 1.2 });
      r.dot(p.x(6.4, 0), p.y(6.4, 0), m('k.petalHot'), 3, 3);
    }
    r.fill(t.circ(0, 0, 2.4), m('k.pollen'), { group: 4, bevel: 1 });
  },
  proj: { meteor: bloomMeteor, sigil: bloomSigil },
};

// =============================================================================
// Singularity: a black hole
// =============================================================================

const VM = mats({
  core: { base: 0x06030c, ramp: [0x020104, 0x06030c, 0x0a0614, 0x120a22, 0x2a1a4a] },
  halo: { base: 0x9af0ff, glow: true },
  disk: { base: 0xff4ad0, glow: true },
  diskDeep: { base: 0x8a1ad8, glow: true },
  hot: { base: 0xffffff, glow: true },
  trail: { base: 0x3a0a7a, glow: true },
  trailHot: { base: 0xc84aff, glow: true },
});

/** The half of frame t on the leading side of local x = cx (front) or the trailing side. */
function side(t: Xf, cx: number, front: boolean): Shape {
  const c = Math.cos(t.ang), n = Math.sin(t.ang);
  return front ? halfPlane(t.x(cx, 0), t.y(cx, 0), -c, n) : halfPlane(t.x(cx, 0), t.y(cx, 0), c, -n);
}

/** The accretion disk: a tilted ring of burning matter round the hole, the half behind it or the half in front. */
function disk(r: Raster, t: Xf, cx: number, f: number, front: boolean, h: (k: keyof typeof VM) => number, g: number): void {
  const half = side(t, cx, front);
  r.fill(intersect(subtract(t.ell(cx, 0, 5.6, 13.4, 0.3), t.ell(cx, 0, 4.2, 10.6, 0.3)), half), h('diskDeep'), { group: g });
  r.fill(intersect(subtract(t.ell(cx, 0, 5, 12.4, 0.3), t.ell(cx, 0, 4.4, 11.2, 0.3)), half), h('disk'), { group: g });
  // Hot knots riding round the disk, a step each frame.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + f * (Math.PI / 8);
    const x = Math.cos(a) * 4.7, y = Math.sin(a) * 11.8;
    const c = Math.cos(0.3), sn = Math.sin(0.3);
    const lx = cx + x * c - y * sn, ly = x * sn + y * c;
    if ((lx > cx) !== front) continue;
    r.dot(t.x(lx, ly), t.y(lx, ly), h('hot'), 3, g);
  }
}

const voidMeteor: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A black hole falling: dark matter smeared behind it, a burning disk turning round, light bent into a ring.
    const fl = [0, 1, 0, -1][f];
    const H = (k: keyof typeof VM) => h(VM[k]);
    r.fill(t.poly([2, -7.6, -8, -6.6 + fl, -24, -3, -36 - fl * 2, 0, -24, 3, -8, 6.6 - fl, 2, 7.6]), H('trail'), { group: 1 });
    // Streaks of light being dragged in toward it.
    for (let k = 0; k < 4; k++) {
      const y = (k - 1.5) * 3.4, x0 = -10 - ((k * 5 + f * 3) % 14);
      r.line(t.x(x0, y), t.y(x0, y), t.x(x0 + 6, y * 0.7), t.y(x0 + 6, y * 0.7), H('trailHot'), 3, 1);
    }
    disk(r, t, 3, f, false, H, 2);
    r.fill(t.circ(3, 0, 7.6), H('halo'), { group: 3 });
    r.fill(t.circ(3, 0, 6.6), H('core'), { group: 3, flat: 0 });
    disk(r, t, 3, f, true, H, 4);
    // A glint where the bent light crowds the rim.
    r.dot(t.x(3 + Math.cos(f * 1.6) * 7, Math.sin(f * 1.6) * 7), t.y(3 + Math.cos(f * 1.6) * 7, Math.sin(f * 1.6) * 7), H('hot'), 3, 4);
  },
};

const voidSigil: ProjArt = {
  frames: 8,
  draw(r, t, f, h) {
    // Three arms of light spiralling in to a dark heart, inside a ring that bends the light round it.
    r.fill(band(t, 0, 0, 9.4, 10.4), h(VM.diskDeep), { group: 1 });
    const turn = f * (Math.PI / 12);
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 9; k++) {
        const d = 9 - k * 0.8, a = turn + (i * Math.PI * 2) / 3 + k * 0.32;
        const [x, y] = on(t, a, d);
        r.dot(x, y, h(k < 2 ? VM.hot : k < 5 ? VM.disk : VM.diskDeep), 3, 1);
      }
    }
    r.fill(t.circ(0, 0, 3), h(VM.halo), { group: 2 });
    r.fill(t.circ(0, 0, 2.2), h(VM.core), { group: 2, flat: 0 });
  },
};

const singularity: SkinArt = {
  mats: {
    sigil: glow(0xc84aff), rock: plain(0x0a0614), ember: glow(0xff4ad0),
    lava: glow(0xff4ad0), lavaHot: glow(0xffffff), fire: glow(0xc84aff), fireHot: glow(0xffc8f0), fireDeep: glow(0x3a0a7a),
    'k.core': { base: 0x06030c, ramp: [0x020104, 0x06030c, 0x0a0614, 0x120a22, 0x2a1a4a] },
    'k.halo': glow(0x9af0ff), 'k.disk': glow(0xff4ad0), 'k.deep': glow(0x8a1ad8), 'k.hot': glow(0xffffff), 'k.ring': glow(0x5a1aa8),
  },
  glow: [0xff8ae8, 0x4a12a8],
  fx: { spark: 0xffc8f4, spark2: 0x8a1ad8 },
  icon(r, t, m) {
    // A black hole in a dark ring, its disk of light tilted across it.
    r.fill(band(t, 0, 0, 11.4, 12.6), m('k.ring'), { group: 1 });
    const ring = (front: boolean) => {
      for (let k = 0; k < 72; k++) {
        const a = (k / 72) * Math.PI * 2;
        if ((Math.sin(a) < 0) !== front) continue;
        for (const d of [9.2, 10.4]) {
          const c = Math.cos(-0.35), s = Math.sin(-0.35);
          const x0 = Math.cos(a) * d, y0 = Math.sin(a) * d * 0.3;
          r.dot(t.x(x0 * c - y0 * s, x0 * s + y0 * c), t.y(x0 * c - y0 * s, x0 * s + y0 * c), m(k % 9 < 2 ? 'k.hot' : d > 10 ? 'k.deep' : 'k.disk'), 3, front ? 4 : 2);
        }
      }
    };
    ring(false);
    r.fill(t.circ(0, 0, 6.4), m('k.halo'), { group: 3 });
    r.fill(t.circ(0, 0, 5.4), m('k.core'), { group: 3, flat: 0 });
    ring(true);
  },
  proj: { meteor: voidMeteor, sigil: voidSigil },
};

export const METEOR_SKINS: Record<string, SkinArt> = {
  'meteor_sigil.tidefall': tidefall,
  'meteor_sigil.bloomfall': bloomfall,
  'meteor_sigil.singularity': singularity,
};
