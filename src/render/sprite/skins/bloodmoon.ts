import { ring, type Layer } from '../../auraKit';
import { css } from '../../pixel/color';
import { material, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, mats, Q, wrap } from './kit';

/**
 * Epic set: Bloodmoon Court. A vampire lord's finery: black-plum velvet,
 * crimson silk and moonlit silver filigree, rubies that beat like a heart,
 * bats on the wing and a blood moon rising behind it all.
 */

/** Black-plum velvet. */
const PLUM = [0x1a0a14, 0x2e1424, 0x4a2238, 0x6e3654, 0x9a5a7a];
/** Crimson velvet and silk (cape lining, waistcoat). */
const VELVET = [0x2a0410, 0x4a0818, 0x7a0e22, 0xa8182e, 0xe04a58];
/** Crimson steel: a blade forged red, its edge catching the moon. */
const RED_STEEL = [0x3a0610, 0x6a0a18, 0xa8162a, 0xd8404c, 0xffc8c0];
/** Moon silver: cool, a hint of lilac in the shadows. */
const SILVER = [0x3e3a50, 0x6e6e88, 0xa4a8be, 0xd8dce8, 0xffffff];
/** Polished black leather and blackened steel. */
const BLACK = [0x120a14, 0x221626, 0x3a2a3e, 0x5e4a66, 0xb4a4c8];
/** Rubies and fresh blood, lit from within. */
const RUBY = [0x5a0814, 0xa01020, 0xe0283a, 0xff8a7a, 0xffd8c8];
const CRIMSON = 0xc0182a, MOON = 0xff8a7a, MOON_HI = 0xffd8c8;

/** Moonlight sliding along polished silver, one step per frame. */
const gleam = (period = 8): Tex => (x, y, ph) => (wrap(x + y * 0.5 - ph * 2, period) < 1.1 ? 1 : 0);
/** A heartbeat: bright, softer, bright, dim. */
const beat: Tex = (_x, _y, ph) => [1, 0, 1, -1][ph % 4];
/** Damask: a faint diamond brocade woven into crimson silk. */
const damask: Tex = (x, y) => {
  const u = wrap(x + y, 4), v = wrap(x - y, 4);
  return (u < 0.6 && v > 1.6 && v < 2.4) || (v < 0.6 && u > 1.6 && u < 2.4) ? 1 : 0;
};
/** Velvet: a soft sheen in long diagonal folds. */
const velvet: Tex = (x, y) => (Math.sin(x * 0.5 - y * 0.25) > 0.82 ? 1 : 0);

const silver = (tex: Tex | undefined = gleam()) => material({ base: SILVER[2], ramp: SILVER, shiny: true, tex });
const ruby = () => material({ base: RUBY[2], glow: true, ramp: RUBY, tex: beat });

const FX = epicFx(MOON_HI, CRIMSON, 'twinkle', MOON);

/** Particles the full set sheds in battle. */
export const BLOODMOON_FX: SkinFx = { spark: MOON_HI, spark2: CRIMSON, kind: 'twinkle' };

// -----------------------------------------------------------------------------
// Bat wings
// -----------------------------------------------------------------------------

/**
 * A bat wing: the root at (0, 0), spread along +x, the straight leading edge on
 * +y and the scalloped trailing edge between three finger tips on -y.
 */
const WING = [0, 0.9, 2.4, 1.9, 5.4, 2.6, 4.5, 1.1, 4.8, -0.5, 3.5, -0.1, 2.9, -1.7, 1.7, -0.6, 0, -0.9];
/** Wing fingers: wrist to each tip, and the arm from the root to the wrist. */
const BONES = [[0, 0.9, 2.4, 1.9], [2.4, 1.9, 5.4, 2.6], [2.4, 1.9, 4.8, -0.5], [2.4, 1.9, 2.9, -1.7]];

/** Points placed into a parent frame's local space: scaled, rotated by `ang`, moved to (ox, oy). */
function place(pts: number[], ox: number, oy: number, ang: number, sx = 1, sy = sx): number[] {
  const c = Math.cos(ang), s = Math.sin(ang), out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] * sx, y = pts[i + 1] * sy;
    out.push(ox + x * c - y * s, oy + x * s + y * c);
  }
  return out;
}

/** A wing's membrane in frame F (see `place` for the placement). */
const wing = (F: Xf, ox: number, oy: number, ang: number, sx: number, sy = sx): Shape => F.poly(place(WING, ox, oy, ang, sx, sy));

/** A wing's finger bones as one-pixel lines. */
function bones(r: Raster, F: Xf, ox: number, oy: number, ang: number, sx: number, sy: number, mat: number, tone: number, g: number, lead = false): void {
  for (const [i, b] of BONES.entries()) {
    if (lead && i > 1) continue;
    const [ax, ay, bx, by] = place(b, ox, oy, ang, sx, sy);
    r.line(F.x(ax, ay), F.y(ax, ay), F.x(bx, by), F.y(bx, by), mat, tone, g);
  }
}

/** A tiny bat, wings spread, centred at (x, y) in frame F (brooches and clasps): returns its silhouette. */
function batBadge(F: Xf, x: number, y: number, s: number): Shape {
  return union(
    wing(F, x + 0.5 * s, y + 0.2 * s, 0.25, s * 0.55),
    wing(F, x - 0.5 * s, y + 0.2 * s, Math.PI - 0.25, s * 0.55, -s * 0.55),
    F.ell(x, y, 0.75 * s, 1.1 * s),
    F.poly([x - 0.7 * s, y + 0.6 * s, x - 0.6 * s, y + 1.9 * s, x - 0.1 * s, y + 0.9 * s, x + 0.1 * s, y + 0.9 * s, x + 0.6 * s, y + 1.9 * s, x + 0.7 * s, y + 0.6 * s]),
  );
}

// -----------------------------------------------------------------------------
// Weapons
// -----------------------------------------------------------------------------

/** Piecewise-linear lookup through (x, y) points. */
const lerpPts = (pts: number[][], x: number) => {
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
};

function sanguineKiss(): WeaponArt {
  // A slender crimson-steel blade curving up to its point, a blood groove where a drop of light
  // runs to the tip, a silver bat-wing crossguard and a beating ruby in the pommel.
  const TOP = [[1.8, 1.1], [6, 1.2], [10, 1.45], [13, 1.95], [15.2, 2.7]];
  const BOT = [[1.8, -1.25], [6, -1.15], [10, -0.6], [13, 0.4], [15.2, 2.7]];
  const blade: number[] = [];
  for (const [x, y] of TOP) blade.push(x, y);
  for (const [x, y] of [...BOT].reverse()) blade.push(x, y);
  return {
    tip: 15.4,
    mats: {
      blade: material({ base: RED_STEEL[2], ramp: RED_STEEL, shiny: true, tex: gleam(9) }), edge: silver(undefined),
      groove: material({ base: RUBY[2], glow: true, ramp: [0x3a0610, 0x7a0a1a, 0xc0182a, 0xff6a6a, MOON_HI] }),
      guard: silver(), grip: material({ base: PLUM[2], ramp: PLUM, tex: (x) => (wrap(x, 1.4) < 0.45 ? -1 : 0) }),
      pommel: silver(undefined), ruby: ruby(),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      fillAll(r, [t.cap(-4.2, 0, 0, 0, 1.05)], m('grip'), o, 1);
      fillAll(r, [t.rect(-0.2, 0, 0.45, 1.25)], m('pommel'), o, 0.6);
      // Pommel: a silver claw holding the ruby, a spike behind it.
      fillAll(r, [union(t.circ(-5.4, 0, 1.45), t.poly([-6.4, -0.6, -8, 0, -6.4, 0.6]))], m('pommel'), o, 1);
      r.fill(t.circ(-5.4, 0, 0.85), m('ruby'), { group: g });
      const B = t.poly(blade);
      fillAll(r, [B], m('blade'), o, 1.1);
      // A moonlit silver edge along the inside of the curve.
      const edge: number[] = [];
      for (const [x, y] of BOT) edge.push(x, y - 0.4);
      for (const [x, y] of [...BOT].reverse()) edge.push(x, y + (x > 15 ? 0 : 0.55));
      r.fill(intersect(B, t.poly(edge)), m('edge'), { group: g, bevel: 0.6, noLine: true, toneBias: o.toneBias, local: o.local });
      // The blood groove: a drop of light running down it to the point.
      for (let x = 3; x <= 12.5; x += 0.5) {
        const y = (lerpPts(TOP, x) + lerpPts(BOT, x)) / 2 - 0.1;
        const d = wrap(x - 3 - ph * 2.4, 9.6);
        r.dot(t.x(x, y), t.y(x, y), m('groove'), d < 1.2 ? 4 : d < 2.4 ? 3 : 1, g);
      }
      // A bat-wing crossguard, the wings swept toward the blade, a ruby boss between them.
      fillAll(r, [union(wing(t, 0.8, 0.6, Math.PI / 2 - 0.3, 0.82, -0.82), wing(t, 0.8, -0.6, -Math.PI / 2 + 0.3, 0.82, 0.82), t.circ(0.9, 0, 1.15))], m('guard'), o, 1);
      r.dot(t.x(0.9, 0), t.y(0.9, 0), m('ruby'), 3, g);
    },
  };
}

function nightwing(): WeaponArt {
  // A blackened parrying dagger, silver-edged, whose guard is a bat with its wings spread wide
  // and swept forward to catch blades; the wings beat slowly, the bat's eyes burn red.
  return {
    tip: 14,
    mats: {
      blade: material({ base: BLACK[2], ramp: BLACK, shiny: true, tex: gleam(8) }),
      edge: silver(undefined), fuller: material({ base: CRIMSON, ramp: RUBY }),
      wing: material({ base: VELVET[3], ramp: VELVET }), bone: silver(undefined), body: silver(),
      grip: material({ base: VELVET[2], ramp: VELVET, tex: (x) => (wrap(x, 1.4) < 0.45 ? -1 : 0) }),
      eye: ruby(),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      fillAll(r, [t.cap(-4, 0, 0, 0, 1.05)], m('grip'), o, 1);
      fillAll(r, [union(t.circ(-4.8, 0, 1.2), t.poly([-5.6, -0.5, -7, 0, -5.6, 0.5]))], m('bone'), o, 1);
      r.dot(t.x(-4.8, 0), t.y(-4.8, 0), m('eye'), 3, g);
      const blade = t.poly([2, -1.45, 10.6, -1.25, 14.2, 0, 10.6, 1.25, 2, 1.45]);
      fillAll(r, [blade], m('blade'), o, 1.2);
      r.fill(intersect(blade, t.poly([2, -1.6, 10.6, -1.4, 14.4, 0, 10.6, -0.7, 2, -0.85])), m('edge'), { group: g, bevel: 0.6, noLine: true, toneBias: o.toneBias, local: o.local });
      r.line(t.x(3, 0.15), t.y(3, 0.15), t.x(9.5, 0.15), t.y(9.5, 0.15), m('fuller'), 2, g);
      // The wings, beating: swept forward like a parrying guard's quillons.
      const flap = [0, 0.14, 0.26, 0.12][ph];
      for (const k of [1, -1]) {
        const ang = k * (Math.PI / 2 - 0.55 - flap), oy = k * 0.9;
        fillAll(r, [wing(t, 1.1, oy, ang, 1.2, -k * 1.2)], m('wing'), o, 1.2, k > 0 ? 0 : -1);
        bones(r, t, 1.1, oy, ang, 1.2, -k * 1.2, m('bone'), 3, g, true);
      }
      // The bat's body at the heart of the guard, head toward the blade, ears pricked.
      fillAll(r, [union(t.ell(0.6, 0, 1.4, 1.05), t.circ(2.2, 0, 0.95), t.poly([2.4, 0.5, 3.6, 1.2, 2.9, 0.1, 2.9, -0.1, 3.6, -1.2, 2.4, -0.5]))], m('body'), o, 0.9);
      r.dot(t.x(2.5, 0.35), t.y(2.5, 0.35), m('eye'), 3, g);
      r.dot(t.x(2.5, -0.35), t.y(2.5, -0.35), m('eye'), 3, g);
    },
  };
}

// -----------------------------------------------------------------------------
// The fang
// -----------------------------------------------------------------------------

const IVORY = [0x8a8098, 0xb8b0c4, 0xdcd6e4, 0xf4f0f8, 0xffffff];
/** The blood moon: a lit sphere, deep crimson in shadow, pale coral where the light falls. */
const MOON_RAMP = [0x5a0a18, 0x8e1a26, 0xc8382e, 0xf07a5a, MOON_HI];

const BM = mats({
  wing: { base: 0xa01828, ramp: [0x3a0614, 0x6a0a1e, 0xa01828, 0xd03a44, 0xff8a7a] },
  bone: { base: PLUM[0], ramp: PLUM },
  body: { base: PLUM[2], ramp: PLUM },
  eye: { base: MOON_HI, glow: true, ramp: RUBY },
  fang: { base: IVORY[3], ramp: IVORY },
});

const batProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t0, f, h) {
    // A small bat hovering at the shoulder: wings up, sweeping down, down, folding back up; eyes burning.
    const t = new Xf(t0.ox, t0.oy, t0.ang, 1.8, 1.8);
    const a = [0.8, 0.12, -0.55, 0.3][f], fold = [1, 1, 0.92, 0.7][f], bob = [-0.3, 0, 0.4, 0.15][f];
    for (const k of [1, -1]) {
      const ox = k * 0.7, oy = 0.5 + bob, ang = k > 0 ? a : Math.PI - a, sx = fold, sy = k;
      r.fill(wing(t, ox, oy, ang, sx, sy), h(BM.wing), { group: k > 0 ? 1 : 2, bevel: 0.9, lightBias: 0.15, toneBias: k > 0 ? 0 : -1 });
      bones(r, t, ox, oy, ang, sx, sy, h(BM.wing), 4, k > 0 ? 1 : 2, true);
    }
    const y = bob;
    r.fill(union(t.ell(0, y, 1.1, 1.6), t.circ(0, y + 1.9, 1.1), t.poly([-0.9, y + 2.2, -1.2, y + 3.7, -0.2, y + 2.8, 0.2, y + 2.8, 1.2, y + 3.7, 0.9, y + 2.2])), h(BM.body), { group: 3, bevel: 1.2, lightBias: 0.2 });
    r.dot(t.x(-0.6, y + 2), t.y(-0.6, y + 2), h(BM.eye), 4, 3);
    r.dot(t.x(0.75, y + 2), t.y(0.75, y + 2), h(BM.eye), 4, 3);
    if (f === 2) r.dot(t.x(0.1, y + 1), t.y(0.1, y + 1), h(BM.fang), 3, 3);
  },
};

const fang: SkinArt = {
  mats: {
    // Stock names: the fang worn on the chest.
    fangTooth: { base: IVORY[3], ramp: IVORY },
    fangBlood: { base: CRIMSON, ramp: RUBY, shiny: true },
    'k.moon': { base: MOON_RAMP[2], ramp: MOON_RAMP, shiny: true, tex: (x, y) => (hash(Math.floor(x / 2), Math.floor(y / 2)) < 0.07 ? -1 : 0) },
    'k.bat': { base: PLUM[1], ramp: PLUM },
    'k.fang': { base: IVORY[2], ramp: IVORY, shiny: true },
    'k.silver': { base: SILVER[2], ramp: SILVER, shiny: true },
    'k.ruby': { base: RUBY[2], glow: true, ramp: RUBY },
    'k.hi': { base: MOON_HI, glow: true },
    'k.blood': { base: CRIMSON, ramp: RUBY, shiny: true },
  },
  glow: [MOON_HI, CRIMSON],
  icon(r, t, m) {
    // A blood moon with a bat crossing it, and before it a fang in a silver filigree cap set with a ruby, dripping.
    r.fill(t.circ(0.6, 2, 11.4), m('k.moon'), { group: 1, bevel: 7, local: t });
    const bx = 0.6, by = 8.6;
    r.fill(union(
      wing(t, bx + 0.7, by, 0.3, 1.25), wing(t, bx - 0.7, by, Math.PI - 0.3, 1.25, -1.25),
      t.ell(bx, by - 0.3, 1, 1.5), t.poly([bx - 0.9, by + 0.6, bx - 0.9, by + 2.2, bx, by + 1.2, bx + 0.9, by + 2.2, bx + 0.9, by + 0.6]),
    ), m('k.bat'), { group: 2, bevel: 0.6 });
    r.dot(t.x(bx - 0.4, by + 0.3), t.y(bx - 0.4, by + 0.3), m('k.ruby'), 4, 2);
    r.dot(t.x(bx + 0.5, by + 0.3), t.y(bx + 0.5, by + 0.3), m('k.ruby'), 4, 2);
    // The fang: a stout curved canine.
    const tooth = t.poly([-4.2, 1.6, 3.6, 1.6, 3.2, -2.4, 1.8, -6.4, 0, -10, -1, -10.8, -1.8, -7.2, -3.2, -3]);
    r.fill(tooth, m('k.fang'), { group: 4, bevel: 3 });
    // A thread of blood down its inner curve.
    r.fill(intersect(tooth, t.poly([2, 2, 4, 2, 3.4, -2.4, 2, -6.4, 0, -10, -1, -10.8, 0.2, -8, 1.2, -5, 2, -1.6])), m('k.blood'), { group: 4, bevel: 0.6, noLine: true });
    // Silver filigree cap with a ruby, hung from a loop.
    r.fill(subtract(t.circ(-0.3, 6.2, 1.5), t.circ(-0.3, 6.2, 0.7)), m('k.silver'), { group: 5, bevel: 0.8 });
    r.fill(t.poly([-4.8, 0.6, 4.2, 0.6, 4, 3.6, 2, 5, -2.6, 5, -4.6, 3.6]), m('k.silver'), { group: 5, bevel: 1.6 });
    for (const x of [-3.6, 2.8]) r.dot(t.x(x, 1), t.y(x, 1), m('k.silver'), 4, 5);
    r.fill(t.circ(-0.3, 2.8, 1.4), m('k.ruby'), { group: 5 });
    r.dot(t.x(-0.7, 3.2), t.y(-0.7, 3.2), m('k.hi'), 3, 5);
    // A drop falling from the point.
    r.fill(union(t.circ(-1.2, -13, 1.1), t.poly([-2.1, -12.6, -1.2, -11.2, -0.3, -12.6])), m('k.blood'), { group: 6, bevel: 0.8 });
  },
  proj: { core: batProj },
};

// -----------------------------------------------------------------------------
// The tricorn
// -----------------------------------------------------------------------------

function countsTricorn(): SkinArt {
  // A black velvet tricorn edged in silver lace, its two points cocked up fore and aft, a crimson ostrich plume
  // curling back and swaying, and a silver bat brooch with a ruby on a crimson cockade.
  const barbs: Tex = (x, y) => (wrap(Math.floor(x * 1.4 - y * 0.7), 2) === 0 ? -1 : 0);
  return {
    head: () => ({
      face: true,
      mats: {
        'h.felt': material({ base: 0x5a2a46, ramp: [0x22101c, 0x3a1a2e, 0x5a2a46, 0x7e3e62, 0xa86088], tex: velvet }),
        'h.lace': silver(),
        'h.plume': material({ base: 0xc0182a, ramp: [0x4a0612, 0x7a0a1c, 0xb0162a, 0xe0404a, 0xff9a90], tex: barbs }),
        'h.plume2': material({ base: 0x7a0a1c, ramp: VELVET, tex: barbs }),
        'h.cockade': material({ base: VELVET[3], ramp: VELVET, tex: (x, y) => (wrap(Math.atan2(y, x) * 2.5, 1) < 0.3 ? -1 : 0) }),
        'h.brooch': silver(undefined),
        'h.ruby': ruby(),
      },
      draw(r, H, m, g, sway) {
        const s = sway * 2.4, ph = r.phase % 4;
        const fl = [0, 0.5, 0.9, 0.4][ph];
        const plume = (pts: [number, number, number][], mat: number, bias = 0) => {
          const segs: Shape[] = [];
          for (let i = 1; i < pts.length; i++) segs.push(H.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i - 1][2], pts[i][2]));
          r.fill(union(...segs), mat, { group: g, bevel: 1.2, toneBias: bias, local: H });
        };
        // The far plume, darker, then the crown rising between the points.
        plume([[-6.6, 9.6, 0.9], [-10 - s * 0.5, 10.6 + fl * 0.3, 1.1], [-12.8 - s, 9 + fl * 0.5, 0.9], [-13.8 - s * 1.3, 6.6 + fl * 0.6, 0.5]], m('h.plume2'), -1);
        r.fill(H.ell(-0.2, 8.4, 4.6, 3), m('h.felt'), { group: g, bevel: 2.4, toneBias: -1 });
        // The brim cocked up into points fore and aft, the side flap facing us.
        const top = [-9.8, 10.8, -8, 9.2, -5.2, 8.1, -1, 7.6, 3, 7.7, 6.6, 8.5, 9.6, 10.4];
        const brim = H.poly([...top, 8.2, 6, 3.4, 4.3, -2, 4.3, -7.4, 6]);
        r.fill(brim, m('h.felt'), { group: g, bevel: 1.8 });
        // Silver lace along the brim's upturned edge.
        for (let i = 2; i < top.length; i += 2) r.line(H.x(top[i - 2], top[i - 1] - 0.35), H.y(top[i - 2], top[i - 1] - 0.35), H.x(top[i], top[i + 1] - 0.35), H.y(top[i], top[i + 1] - 0.35), m('h.lace'), 3, g);
        r.dot(H.x(9.3, 10), H.y(9.3, 10), m('h.lace'), 4, g);
        r.dot(H.x(-9.5, 10.4), H.y(-9.5, 10.4), m('h.lace'), 4, g);
        // The near plume, rising from behind the back point and curling over, swaying.
        plume([[-5.4, 9.4, 1.2], [-8.4 - s * 0.5, 12 + fl * 0.4, 1.5], [-12 - s, 11.6 + fl * 0.6, 1.3], [-14.2 - s * 1.4, 9 + fl * 0.8, 0.9], [-14.6 - s * 1.6, 6.6 + fl, 0.5]], m('h.plume'));
        // Cockade and bat brooch.
        r.fill(H.circ(0.4, 6.2, 1.7), m('h.cockade'), { group: g, bevel: 1, local: H });
        r.fill(batBadge(H, 0.4, 6.2, 1.15), m('h.brooch'), { group: g, bevel: 0.8 });
        r.dot(H.x(0.4, 6.2), H.y(0.4, 6.2), m('h.ruby'), 3, g);
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// The mantle
// -----------------------------------------------------------------------------

function vampireMantle(): SkinArt {
  // A black velvet cape lined in crimson, its hem cut into bat-wing scallops that ripple, a tall stand-up
  // collar behind the head, a crimson damask waistcoat, and silver bat clasps joined by a chain.
  return {
    mats: {
      cloak: { base: PLUM[2], ramp: PLUM, tex: velvet }, cloakTrim: { base: SILVER[2], ramp: SILVER, shiny: true },
      'k.vest': { base: VELVET[2], ramp: VELVET, tex: damask },
      'k.cape': { base: PLUM[2], ramp: PLUM, tex: velvet },
      'k.lining': { base: VELVET[3], ramp: VELVET },
      'k.belt': { base: BLACK[2], ramp: BLACK, shiny: true },
      'k.silver': { base: SILVER[2], ramp: SILVER, shiny: true, tex: gleam(6) },
      'k.ruby': { base: RUBY[2], glow: true, ramp: RUBY, tex: beat },
    },
    chest: {
      torso: 'k.vest', cape: null, hood: 'k.cape', belt: 'k.belt',
      back(r, T, m, c) {
        const top = c.top, s = c.sway * 3, ph = r.phase % 4;
        // The outline: collar, shoulder, the back edge billowing, then the scalloped hem from back to front.
        const edge = [-0.8, top + 1.2, -6, top + 2.2, -11.4 - s, top - 0.4, -14 - s * 1.3, top - 4.8, -13.6 - s * 1.3, -5];
        const hb = [-13.6 - s * 1.5, -14.6], hf = [-2.4 - s * 0.8, -12.6];
        const hem: number[] = [];
        const N = 4;
        for (let i = 0; i <= N; i++) {
          const u = i / N, rip = Math.sin(ph * Q + i * 1.6) * 0.8;
          const x = hb[0] + (hf[0] - hb[0]) * u, y = hb[1] + (hf[1] - hb[1]) * u;
          hem.push(x, y - 1.2 + rip);
          if (i < N) {
            const u2 = (i + 0.5) / N;
            hem.push(hb[0] + (hf[0] - hb[0]) * u2 + 0.2, hb[1] + (hf[1] - hb[1]) * u2 + 1.1 + rip * 0.4);
          }
        }
        const outline = [...edge, ...hem, -0.8, -2];
        // The crimson lining shows along the billowing back edge and under the hem.
        const lining = outline.map((v, i) => (i % 2 ? v - 0.6 : v - 1.5));
        r.fill(T.poly(lining), m('k.lining'), { group: 40, bevel: 2, toneBias: -1, softLight: true });
        r.fill(T.poly(outline), m('k.cape'), { group: 41, bevel: 3, softLight: true });
        // Ribs down the cape to each point of the hem, like the fingers of a bat's wing.
        for (let i = 1; i < N; i++) {
          const x = hem[i * 4], y = hem[i * 4 + 1];
          r.line(T.x(-3.6, top - 2), T.y(-3.6, top - 2), T.x(x + 0.4, y + 2), T.y(x + 0.4, y + 2), m('k.cape'), 0, 41);
        }
        // The stand-up collar flaring behind the head: black outside, crimson within, edged in silver.
        const col = [-0.4, top + 0.2, -5.4, top - 0.6, -12.4, top + 5.2, -9.8, top + 5.8, -10.6, top + 8.8, -6.6, top + 6.6, -1.6, top + 4];
        r.fill(T.poly(col), m('k.cape'), { group: 42, bevel: 1.6 });
        r.fill(T.poly([-1, top + 0.8, -5, top + 0.4, -10.6, top + 5, -8.8, top + 5.6, -9.4, top + 7.6, -6.4, top + 5.8, -2, top + 3.8]), m('k.lining'), { group: 42, bevel: 1.2, noLine: true });
        // Silver tips on the collar's two points.
        for (const i of [4, 8]) r.dot(T.x(col[i], col[i + 1]), T.y(col[i], col[i + 1]), m('cloakTrim'), 4, 42);
      },
      shoulder(r, S, m, c) {
        // A short velvet capelet over the shoulder, its edge cut in bat-wing scallops, a silver stud.
        const o = { group: c.g, toneBias: c.bias };
        r.fill(S.poly([-2.8, 1.8, 0, 2.9, 2.8, 1.8, 3, -1.4, 2, -0.5, 1, -2, 0, -0.7, -1, -2, -2, -0.5, -3, -1.4]), m('k.cape'), { ...o, bevel: 1.6, local: S });
        r.dot(S.x(0, 1.4), S.y(0, 1.4), m('k.silver'), c.far ? 2 : 4, c.g);
      },
      over(r, T, m, c) {
        const top = c.top, f = c.body.chestPush * 0.7;
        // Silver buttons down the waistcoat.
        for (const y of [top - 5.6, top - 8, top - 10.4]) r.dot(T.x(f + 2.4, y), T.y(f + 2.4, y), m('k.silver'), 4, c.g);
        // A chain swagged across the chest from the cape's edge to a bat clasp at the collar.
        const ax = -2.6, ay = top - 0.6, bx = f + 1.6, by = top - 1.6;
        for (let i = 0; i <= 8; i++) {
          const u = i / 8, x = ax + (bx - ax) * u, y = ay + (by - ay) * u - Math.sin(u * Math.PI) * 2.2;
          r.dot(T.x(x, y), T.y(x, y), m('k.silver'), i % 2 ? 2 : 4, c.g);
        }
        r.fill(batBadge(T, bx, by, 1.05), m('k.silver'), { group: c.g, bevel: 0.8 });
        r.dot(T.x(bx, by), T.y(bx, by), m('k.ruby'), 3, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// The boots
// -----------------------------------------------------------------------------

function bloodmoonRiders(): SkinArt {
  // Tall polished black riding boots with crimson trim, two silver-buckled straps, a bat-wing cuff that
  // flutters at the top and a silver spur whose rowel turns.
  return {
    mats: {
      boot: { base: BLACK[2], ramp: BLACK, shiny: true, tex: gleam(10) }, bootDark: { base: VELVET[3], ramp: VELVET },
      'k.strap': { base: PLUM[1], ramp: PLUM },
      'k.silver': { base: SILVER[2], ramp: SILVER, shiny: true },
      'k.wing': { base: VELVET[3], ramp: VELVET },
      'k.ruby': { base: RUBY[2], glow: true, ramp: RUBY, tex: beat },
    },
    boots: {
      height: 0.92, bulk: 0.36, trim: 'bootDark',
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w;
        // Two straps with silver buckles.
        for (const x of [c.top * 0.28, c.top * 0.58]) {
          r.fill(shin.rect(x, 0, 0.45, w + 0.2), m('k.strap'), { ...o, bevel: 0.5 });
          r.fill(shin.rect(x, w * 0.45, 0.65, 0.55), m('k.silver'), { ...o, bevel: 0.5 });
        }
        // A bat-wing cuff on the outside of the top, fluttering.
        const flap = [0, 0.14, 0.24, 0.1][ph];
        const wx = c.top - 0.8, wy = -w + 0.6, ang = -1.0 - flap;
        r.fill(wing(shin, wx, wy, ang, 0.85, 0.85), m('k.wing'), { ...o, bevel: 0.9, local: shin });
        bones(r, shin, wx, wy, ang, 0.85, 0.85, m('k.silver'), c.far ? 2 : 3, c.g, true);
        r.fill(shin.circ(wx, wy, 0.6), m('k.silver'), { ...o, bevel: 0.5 });
        r.dot(shin.x(wx, wy), shin.y(wx, wy), m('k.ruby'), 3, c.g);
        // A silver toe cap and the spur at the heel, its rowel turning.
        r.fill(foot.poly([c.toe - 1.2, 1.2, c.toe + 0.9, 0.2, c.toe + 0.6, -0.9, c.toe - 1.2, -1.2]), m('k.silver'), { ...o, bevel: 0.6 });
        r.fill(foot.cap(-1.4, -0.2, -2.8, 0, 0.3), m('k.silver'), { ...o, bevel: 0.4 });
        const pts: number[] = [], spin = ph * ((Math.PI * 2) / 5 / 4);
        for (let i = 0; i < 10; i++) {
          const a = spin + (i / 10) * Math.PI * 2, rr = i % 2 ? 0.45 : 1.25;
          pts.push(-3.2 + Math.cos(a) * rr, Math.sin(a) * rr);
        }
        r.fill(foot.poly(pts), m('k.silver'), { ...o, bevel: 0.5 });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// The aura
// -----------------------------------------------------------------------------

const AC = {
  mist: css(0xa0142a), mistDk: css(0x5a0a1a),
  moon: css(MOON),
  bat: css(0x3a1a2e), batWing: css(0x8a1424), eye: css(0xff6a5a),
};

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function bloodmoonAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  if (layer === 'back') {
    // A pool of blood-moon light on the ground, breathing.
    g.globalAlpha = 0.1 + Math.sin(t * 1.6) * 0.03;
    g.fillStyle = AC.moon;
    g.fillRect(x - 9, y - 2, 19, 1); g.fillRect(x - 13, y - 1, 27, 3); g.fillRect(x - 9, y + 2, 19, 1);
    g.globalAlpha = 1;
  }
  // Crimson mist pooling round the feet, drifting.
  ring(g, x, y, 15, 3.6, 20, layer, (g, px, py, i) => {
    const v = Math.sin(t * 1.8 + i * 1.1);
    g.globalAlpha = 0.28 + v * 0.14;
    g.fillStyle = i % 3 ? AC.mist : AC.mistDk;
    const w = 4 + (i % 2) * 2, dx = Math.round(v * 1.5);
    g.fillRect(px - (w >> 1) + dx, py - 1, w, 2);
    if (v > 0.3) { g.globalAlpha = 0.25; g.fillRect(px - (w >> 2) + dx, py - 2 - (i % 2), w >> 1, 1); }
  });
  g.globalAlpha = 1;
  // Three bats circling at different heights, wings beating.
  for (let k = 0; k < 3; k++) {
    const a = t * (1.3 + k * 0.2) + (k * Math.PI * 2) / 3;
    const s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const px = Math.round(x + Math.cos(a) * (14 + k * 2)), py = Math.round(y - 20 - k * 11 + Math.sin(t * 2.6 + k) * 2 + s * 3);
    const up = Math.floor(t * 9 + k * 1.7) % 2 === 0;
    g.fillStyle = AC.batWing;
    if (up) { g.fillRect(px - 3, py - 2, 1, 2); g.fillRect(px + 3, py - 2, 1, 2); g.fillRect(px - 2, py - 1, 5, 1); }
    else { g.fillRect(px - 3, py + 1, 2, 1); g.fillRect(px + 2, py + 1, 2, 1); g.fillRect(px - 2, py, 5, 1); }
    g.fillStyle = AC.bat; g.fillRect(px, py - 1, 1, 3);
    g.fillStyle = AC.eye; g.fillRect(px, py - 1, 1, 1);
  }
}

export const BLOODMOON: Record<string, SkinArt> = {
  'dagger.sanguine': { weapon: sanguineKiss, ...FX },
  'parrying_dagger.nightwing': { weapon: nightwing, ...FX },
  'vampiric_fang.bloodmoon': fang,
  'duelist_band.count': countsTricorn(),
  'phase_cloak.vampire': vampireMantle(),
  'leather_boots.bloodmoon': bloodmoonRiders(),
};

