import { ring, type Layer } from '../../auraKit';
import { css } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, glow, mats, Q, wrap } from './kit';

/**
 * Epic set: Feathered Serpent. The sky-serpent god's regalia: turquoise mosaic
 * glinting tile by tile, iridescent quetzal plumes with scarlet and gold,
 * polished black obsidian edges catching the light, stepped-fret bands and
 * the gold disc of the sun.
 */

/** Turquoise: deep sea-green in the shadow, its top tone the glint of a polished tile. */
const TURQ = [0x0c4448, 0x16757a, 0x26aaa4, 0x5ad8c8, 0xd8fff4];
/** Quetzal green: iridescent, shading toward blue-green and lighting up yellow-green. */
const QGREEN = [0x0a2e2c, 0x0f5838, 0x1a8c44, 0x4cc058, 0xb8ec6a];
const QUETZAL_DK = [0x061c1e, 0x0a3a2c, 0x126a3a, 0x2a9a4a, 0x78d058];
const SCARLET = [0x4a0a14, 0x8a1420, 0xc8282c, 0xf0583a, 0xffb48a];
const GOLD = [0x6a3a10, 0xa86a1a, 0xe0a830, 0xffd860, 0xfff6c8];
/** Obsidian: black glass with a cool violet sheen, its top tone the light on an edge. */
const OBSIDIAN = [0x0c0a12, 0x1a1824, 0x2c2a3c, 0x4a4a66, 0xe0e8ff];
const WOOD = [0x3a2010, 0x64401e, 0x8a5c2c, 0xae7c40, 0xcc9a58];
const JAGUAR = [0x5a300e, 0x9a5a1a, 0xd08e2a, 0xf0bc4a, 0xfff0a0];
const SUN = [0xa85a10, 0xe09a20, 0xffc840, 0xfff09a, 0xffffff];
const SPIRIT = [0x0a4a50, 0x1a8a8a, 0x3acac0, 0x8af8e8, 0xf0fffc];

// -----------------------------------------------------------------------------
// Textures
// -----------------------------------------------------------------------------

/** Turquoise mosaic: tiles of slightly different stones, a few catching the light each frame. */
const mosaic = (size = 1.4, glints = 0.05): Tex => (x, y, ph) => {
  const tx = Math.floor(x / size), ty = Math.floor(y / size + (tx & 1) * 0.5);
  if (hash(tx + ph * 13, ty - ph * 7) < glints) return 2;
  const h = hash(tx, ty);
  return h < 0.3 ? -1 : h > 0.82 ? 1 : 0;
};
/** Feather barbs combed along a plume, a sheen of iridescence sliding down it. */
const barbs = (sheen = true): Tex => (x, y, ph) => {
  const b = wrap(x * 0.9 + y * 0.5, 3) < 0.5 ? -1 : 0;
  return sheen && wrap(x * 0.5 - y * 0.7 + ph * 2.2, 9) < 0.9 ? b + 1 : b;
};
/** Just the iridescent sheen sliding down a plume (small feathers, where barbs turn to noise). */
const sheenOnly: Tex = (x, y, ph) => (wrap(x * 0.5 - y * 0.7 + ph * 2.2, 9) < 0.9 ? 1 : 0);
/** Serpent scales: rows of small arcs, a tile here and there catching the light. */
const scales: Tex = (x, y, ph) => {
  if (hash(Math.floor(x / 1.6) + ph * 13, Math.floor(y / 1.6) - ph * 7) < 0.04) return 2;
  return wrap(y + Math.abs(wrap(x, 2) - 1) * 0.8, 1.8) < 0.45 ? -1 : 0;
};
/** Stepped fret (greca): a stair of dark steps running along a band. */
const greca: Tex = (x, y) => {
  const i = wrap(Math.floor(x), 4), j = wrap(Math.floor(y), 3);
  return (j === 0 && i < 2) || (j === 1 && (i === 1 || i === 2)) || (j === 2 && i >= 2) ? -2 : 0;
};
/** A glint sweeping along polished obsidian, one step per frame. */
const sweep = (period = 9, speed = 2.6): Tex => (x, y, ph) => (wrap(x * 0.9 + y * 0.4 - ph * speed, period) < 1 ? 2 : 0);
/** Jaguar pelt: broken rosettes with darker hearts. */
const rosettes: Tex = (x, y) => {
  const P = 3;
  const cx = Math.floor(x / P), cy = Math.floor(y / P + (cx & 1) * 0.5);
  const ox = (cx + 0.5) * P, oy = (cy + 0.5 - (cx & 1) * 0.5) * P;
  const d = Math.hypot(x - ox, y - oy);
  if (d > 0.7 && d < 1.45) return wrap(Math.atan2(y - oy, x - ox) * 1.4 + hash(cx, cy) * 6, 2.2) < 0.45 ? 0 : -2;
  return d <= 0.7 ? -1 : 0;
};
/** Light pulsing in a sun gem over the loop. */
const pulse: Tex = (_x, _y, ph) => [0, 1, 0, -1][ph % 4];
/** Rough wood grain along a club. */
const woodGrain: Tex = (x, y) => (wrap(y * 2.1 + Math.sin(x * 0.7) * 0.6, 1.9) < 0.4 ? -1 : 0);
/** Quilted cotton: a diamond quilting under the feathers. */
const quilt: Tex = (x, y) => (wrap(Math.floor(x + y), 4) === 0 && wrap(Math.floor(x - y), 2) === 0 ? -1 : 0);

// -----------------------------------------------------------------------------
// Materials
// -----------------------------------------------------------------------------

const turq = (tex: Tex = mosaic()): MaterialSpec => ({ base: TURQ[2], ramp: TURQ, tex });
const plume = (tex: Tex = barbs()): MaterialSpec => ({ base: QGREEN[2], ramp: QGREEN, tex });
const plumeDk = (tex: Tex = barbs(false)): MaterialSpec => ({ base: QUETZAL_DK[2], ramp: QUETZAL_DK, tex });
const scarlet = (tex?: Tex): MaterialSpec => ({ base: SCARLET[2], ramp: SCARLET, tex });
const gold = (tex?: Tex): MaterialSpec => ({ base: GOLD[2], ramp: GOLD, shiny: true, tex });
/** Not shiny: the lighting stops at the violet sheen, only the sweeping glint lights the white edge tone. */
const obsidian = (tex: Tex = sweep()): MaterialSpec => ({ base: OBSIDIAN[2], ramp: OBSIDIAN, tex });
const sun = (): MaterialSpec => ({ base: SUN[3], ramp: SUN, glow: true, tex: pulse });
const spirit = (tex?: Tex): MaterialSpec => ({ base: SPIRIT[3], ramp: SPIRIT, glow: true, tex });

const FX = epicFx(0xc8fff0, 0xe0a830, 'twinkle', 0x8af0dc);

/** Particles the full set sheds in battle. */
export const QUETZAL_FX: SkinFx = { spark: 0xc8fff0, spark2: 0xe0a830, kind: 'twinkle' };

// -----------------------------------------------------------------------------
// Shapes
// -----------------------------------------------------------------------------

/** A plume from (x, y) toward angle `a`: a narrow quill widening to `w`, then a soft point; `curl` bends it. */
function feather(F: Xf, x: number, y: number, a: number, len: number, w: number, curl = 0): Shape {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  const p = (u: number, v: number) => {
    const b = curl * u * u * len;
    return [x + c * u * len + nx * (v + b), y + s * u * len + ny * (v + b)];
  };
  return F.poly([
    ...p(0, -w * 0.3), ...p(0.3, -w * 0.8), ...p(0.66, -w), ...p(0.9, -w * 0.62), ...p(1, 0),
    ...p(0.9, w * 0.62), ...p(0.66, w), ...p(0.3, w * 0.8), ...p(0, w * 0.3),
  ]);
}

/** The point at fraction `u` along a feather (for its quill line and tip). */
function along(x: number, y: number, a: number, len: number, u: number, curl = 0): [number, number] {
  const c = Math.cos(a), s = Math.sin(a), b = curl * u * u * len;
  return [x + c * u * len - s * b, y + s * u * len + c * b];
}

/** A feathered wing from its root (x, y) toward angle `a`: a leading edge and three primaries' tips along the trailing edge. */
function wing(F: Xf, x: number, y: number, a: number, len: number): Shape {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  // u along the wing, v toward its leading edge (the side `a` turns toward).
  const p = (u: number, v: number) => [x + c * u * len + nx * v * len, y + s * u * len + ny * v * len];
  return F.poly([
    ...p(0, 0.14), ...p(0.5, 0.17), ...p(1, 0.04), ...p(0.8, -0.06), ...p(0.86, -0.18),
    ...p(0.62, -0.17), ...p(0.64, -0.32), ...p(0.42, -0.27), ...p(0.1, -0.16),
  ]);
}

/** A round disc as a polygon (stays round in squashed frames). */
function disc(F: Xf, cx: number, cy: number, rx: number, ry = rx, n = 16): Shape {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) pts.push(cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry);
  return F.poly(pts);
}

/** A sun disc: a gold disc with `n` stepped rays round it (as one shape). */
function sunDisc(F: Xf, cx: number, cy: number, rad: number, n = 8, spin = 0): Shape {
  const parts: Shape[] = [disc(F, cx, cy, rad, rad, 14)];
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), w = rad * 0.32;
    parts.push(F.poly([cx + c * rad * 0.8 - s * w, cy + s * rad * 0.8 + c * w, cx + c * rad * 1.45, cy + s * rad * 1.45, cx + c * rad * 0.8 + s * w, cy + s * rad * 0.8 - c * w]));
  }
  return union(...parts);
}

// -----------------------------------------------------------------------------
// Weapons
// -----------------------------------------------------------------------------

function macuahuitl(): WeaponArt {
  // A flat paddle of dark wood, its edges set with jagged obsidian blades (a glint sweeping along them),
  // a turquoise mosaic panel with a gold sun disc down the flat, a red-and-gold bound grip and a tuft of
  // quetzal feathers at the pommel fluttering in the wind.
  const TEETH: [number, number][] = [[6.6, 1.7], [8.8, 2.1], [11, 1.8], [13.2, 2.2], [15.4, 1.8], [17.6, 2.1], [19.6, 1.7]];
  return {
    tip: 22.6,
    mats: {
      wood: material({ base: WOOD[2], ramp: WOOD, tex: woodGrain }), haft: material({ base: WOOD[1], ramp: WOOD }),
      wrap: material(scarlet((x) => (wrap(x, 1.4) < 0.45 ? -1 : 0))), gold: material(gold()),
      blade: material(obsidian()), panel: material(turq(mosaic(1.3, 0.07))), sun: material(sun()),
      plume: material(plume()), plumeDk: material(plumeDk()), red: material(scarlet(barbs(false))),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // The feather tuft at the pommel, streaming back and fluttering out of step.
      const fl = [0, 0.14, 0.24, 0.1][ph];
      const tuft: [number, number, string, number][] = [[Math.PI + 0.55 + fl, 4.6, 'plumeDk', -1], [Math.PI - 0.5 - fl * 0.8, 4.2, 'plumeDk', -1], [Math.PI + 0.2 - fl * 0.6, 5.6, 'plume', 0], [Math.PI - 0.15 + fl, 3.6, 'red', 0]];
      for (const [a, len, k, bias] of tuft) fillAll(r, [feather(t, -5.6, 0, a, len, 0.95, 0.06)], m(k), o, 0.8, bias);
      // Haft and grip bound in scarlet, gold-capped pommel.
      fillAll(r, [t.cap(-4.6, 0, 6, 0, 1.1, 1.2)], m('haft'), o, 1);
      fillAll(r, [t.cap(-3.4, 0, 2.4, 0, 1.3)], m('wrap'), o, 1);
      fillAll(r, [t.rect(2.9, 0, 0.45, 1.45), t.rect(-3.8, 0, 0.45, 1.45)], m('gold'), o, 0.8);
      fillAll(r, [t.poly([-4.4, -1.3, -5.4, -1.5, -6.4, -0.6, -6.4, 0.6, -5.4, 1.5, -4.4, 1.3])], m('gold'), o, 1);
      // Obsidian teeth along both edges and at the tip, behind the paddle so only the jags show.
      const teeth: Shape[] = [t.poly([20, -1.6, 22.8, -0.3, 22.6, 0.6, 20, 1.6])];
      for (const [x, hgt] of TEETH) for (const s of [-1, 1]) {
        const j = s > 0 ? 0.3 : -0.2;
        teeth.push(t.poly([x - 1.15, s * 2.3, x + 0.2 + j, s * (2.5 + hgt), x + 1.15, s * 2.3]));
      }
      r.fill(union(...teeth), m('blade'), { group: 44, bevel: 0.7, toneBias: o.toneBias, local: o.local });
      // The paddle, flaring from the haft and rounded at the end.
      const paddle = t.poly([4.6, -1.3, 6.6, -2.7, 19.2, -2.8, 20.6, -2.2, 21.4, -1, 21.4, 1, 20.6, 2.2, 19.2, 2.8, 6.6, 2.7, 4.6, 1.3]);
      fillAll(r, [paddle], m('wood'), o, 1.6);
      // The mosaic panel in a gold frame, the sun disc at its heart.
      r.fill(t.rect(13.2, 0, 6.6, 1.75), m('gold'), { group: g, bevel: 0.7, toneBias: o.toneBias, local: o.local });
      r.fill(t.rect(13.2, 0, 6, 1.2), m('panel'), { group: g, noLine: true, toneBias: o.toneBias, local: o.local });
      r.fill(sunDisc(t, 13.2, 0, 1.45, 8, ph * (Math.PI / 16)), m('gold'), { group: 45, bevel: 0.9, toneBias: o.toneBias, local: o.local });
      r.fill(t.circ(13.2, 0, 0.75), m('sun'), { group: 45 });
      // A glint on the gold of the sun disc, wandering round it.
      const ga = ph * Q + 0.8;
      r.dot(t.x(13.2 + Math.cos(ga) * 1.2, Math.sin(ga) * 1.2), t.y(13.2 + Math.cos(ga) * 1.2, Math.sin(ga) * 1.2), m('gold'), 4, 45);
    },
  };
}

function plumeDart(): WeaponArt {
  // A leaf-blade of obsidian, a turquoise-bound hilt with a gold collar and green feather fletching.
  return {
    tip: 8.6,
    mats: {
      blade: material(obsidian(sweep(7, 2))), grip: material(turq(mosaic(1, 0.08))), gold: material(gold()),
      plume: material(plume(barbs(false))), red: material(scarlet()),
    },
    draw(r, t, m, o) {
      const ph = r.phase % 4, fl = [0, 0.15, 0.25, 0.1][ph];
      fillAll(r, [feather(t, -2, 0.2, Math.PI - 0.35 - fl, 3.6, 0.8), feather(t, -2, -0.2, Math.PI + 0.35 + fl * 0.6, 3.4, 0.8)], m('plume'), o, 0.7);
      fillAll(r, [t.cap(-2.6, 0, 0.4, 0, 0.85)], m('grip'), o, 0.9);
      fillAll(r, [t.circ(-2.8, 0, 0.75)], m('red'), o, 0.6);
      fillAll(r, [t.rect(0.6, 0, 0.4, 1.15)], m('gold'), o, 0.7);
      fillAll(r, [t.poly([1, -0.8, 3.2, -1.55, 5.8, -1.25, 8.6, 0, 5.8, 1.25, 3.2, 1.55, 1, 0.8])], m('blade'), o, 1);
      r.line(t.x(1.6, 0.2), t.y(1.6, 0.2), t.x(6.4, 0.2), t.y(6.4, 0.2), m('blade'), 3, o.group ?? 6);
    },
  };
}

// -----------------------------------------------------------------------------
// Battle sprites (their own materials)
// -----------------------------------------------------------------------------

const QM = mats({
  blade: obsidian(sweep(6, 2)), grip: turq(mosaic(1, 0.08)), gold: gold(), red: scarlet(),
  plume: plume(sheenOnly), plumeDk: plumeDk(sheenOnly), scale: turq(scales), belly: gold(),
  eye: glow(0xffe060), tongue: { base: SCARLET[3], ramp: SCARLET },
  spirit: spirit(), deep: { base: SPIRIT[2], ramp: SPIRIT, glow: true }, hot: glow(0xf0fffc), sun: sun(),
});
type QK = keyof typeof QM;

const knifeProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t0, f, h) {
    // The dart flies point first, wobbling a little, a turquoise streak behind and its fletching fluttering.
    const t = new Xf(t0.ox, t0.oy, t0.ang + [0, 0.06, 0, -0.06][f], 1.1, 1.1);
    const w = [0, 0.4, 0, -0.4][f];
    r.fill(t0.poly([-3, -0.9, -8, -0.4 + w, -12, w * 1.4, -8, 0.5 + w, -3, 0.9]), h(QM.deep), { group: 1 });
    r.fill(t0.poly([-3, -0.4, -7.5, w * 0.6, -3, 0.4]), h(QM.spirit), { group: 1 });
    const fl = [0, 0.2, 0.35, 0.15][f];
    r.fill(feather(t, -2, 0.2, Math.PI - 0.4 - fl, 3.8, 0.85), h(QM.plume), { group: 2, bevel: 0.7 });
    r.fill(feather(t, -2, -0.2, Math.PI + 0.4 + fl * 0.7, 3.6, 0.85), h(QM.plumeDk), { group: 3, bevel: 0.7 });
    r.fill(t.cap(-2.6, 0, 0.4, 0, 0.85), h(QM.grip), { group: 4, bevel: 0.9 });
    r.fill(t.rect(0.6, 0, 0.4, 1.15), h(QM.gold), { group: 4, bevel: 0.7 });
    r.fill(t.poly([1, -0.8, 3.2, -1.55, 5.8, -1.25, 8.6, 0, 5.8, 1.25, 3.2, 1.55, 1, 0.8]), h(QM.blade), { group: 5, bevel: 1 });
    r.line(t.x(1.8, 0.2), t.y(1.8, 0.2), t.x(6.6, 0.2), t.y(6.6, 0.2), h(QM.blade), f === 1 ? 4 : 3, 5);
  },
};

/**
 * The feathered serpent at (0, 0) in frame t, flying toward +x: a body of turquoise mosaic banded in gold
 * rippling in a wave, feathered wings beating over its back, a crest of quetzal plumes on the raised head
 * and a plume tuft at the tail; `f` steps the four-frame loop.
 */
function serpent(r: Raster, t: Xf, f: number, h: (k: QK) => number, s = 1): void {
  const S = (v: number) => v * s;
  const ph = f % 4, wv = f * Q;
  // The spine, tail to head: a wave travelling down the body, the head end lifting.
  const n = 10;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const y = Math.sin(u * Math.PI * 2.2 + wv) * 1.7 * (1 - u * 0.75) + u * u * u * 3.2 - 0.6;
    pts.push([S(-9 + u * 11.4), S(y)]);
  }
  const rad = (i: number) => { const u = i / (n - 1); return S(0.45 + Math.min(u / 0.75, 1) * 1.15 - (u > 0.85 ? 0.15 : 0)); };
  // Tail tuft: three plumes fanning back off the tail, flicking.
  const [tx, ty] = pts[0], ta = Math.atan2(pts[0][1] - pts[1][1], pts[0][0] - pts[1][0]);
  const flick = [0, 0.18, 0.28, 0.1][ph];
  r.fill(feather(t, tx, ty, ta - 0.6 - flick, S(3.2), S(0.85)), h('plumeDk'), { group: 1, bevel: S(0.7), local: t });
  r.fill(feather(t, tx, ty, ta + 0.55 + flick, S(2.8), S(0.8)), h('red'), { group: 1, bevel: S(0.7), local: t });
  r.fill(feather(t, tx, ty, ta, S(4), S(0.95)), h('plume'), { group: 2, bevel: S(0.7), local: t });
  // The wings rise off the back: down, level, up, level.
  const flap = [-0.4, 0.1, 0.55, 0.1][ph];
  const [wx, wy0] = pts[5];
  const wy = wy0 + rad(5) * 0.6;
  r.fill(wing(t, wx + S(1.6), wy, 1.6 + flap * 0.8, S(6.4)), h('plumeDk'), { group: 3, bevel: S(0.8), toneBias: -1, local: t });
  // The body, its gold bands.
  const caps: Shape[] = [];
  for (let i = 0; i < n - 1; i++) caps.push(t.cap(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rad(i), rad(i + 1)));
  r.fill(union(...caps), h('scale'), { group: 4, bevel: S(1.4), local: t });
  for (const i of [2, 4, 6]) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, rr = (rad(i) + rad(i + 1)) / 2;
    const cx = (ax + bx) / 2, cy = (ay + by) / 2;
    r.fill(t.cap(cx - (dy / l) * rr, cy + (dx / l) * rr, cx + (dy / l) * rr, cy - (dx / l) * rr, S(0.45)), h('belly'), { group: 4, bevel: S(0.5), noLine: true });
  }
  // The near wing, beating over the body: three green primaries over a scarlet covert, rooted in a gold boss.
  const W = wing(t, wx, wy, 2.1 + flap, S(8.6));
  r.fill(W, h('plume'), { group: 5, bevel: S(1), local: t });
  // Scarlet coverts along the leading edge, a gold boss at the root.
  r.fill(intersect(W, t.circ(wx, wy, S(3))), h('red'), { group: 5, bevel: S(0.6), noLine: true, local: t });
  r.fill(t.circ(wx, wy, S(0.75)), h('gold'), { group: 6, bevel: S(0.5) });
  // The head, raised and nodding, crest plumes sweeping back off it.
  const [hx, hy] = pts[n - 1];
  const H = new Xf(t.x(hx + S(0.6), hy + S(0.3)), t.y(hx + S(0.6), hy + S(0.3)), t.ang + [0, 0.07, 0, -0.07][ph], t.sx * s, t.sy * s);
  const sw = [0, 0.12, 0.2, 0.08][ph];
  r.fill(feather(H, -0.6, 0.8, 2.95 + sw, 3.6, 0.8, -0.05), h('plumeDk'), { group: 9, bevel: 0.7, local: H });
  r.fill(feather(H, -0.2, 1.1, 2.55 + sw * 0.7, 4.4, 0.9, -0.06), h('plume'), { group: 10, bevel: 0.7, local: H });
  r.fill(feather(H, 0.4, 1.2, 2.0 + sw * 0.5, 3, 0.9), h('red'), { group: 11, bevel: 0.6, local: H });
  // Tongue flicking out on alternate frames.
  if (ph % 2) r.fill(union(H.cap(3.4, -0.7, 5.2, -1, 0.22), H.cap(5.2, -1, 5.9, -0.5, 0.18), H.cap(5.2, -1, 5.9, -1.5, 0.18)), h('tongue'), { group: 12 });
  r.fill(union(H.ell(0.4, 0, 2.1, 1.55), H.poly([0.8, -1.3, 4, -0.8, 4.3, 0.2, 1.4, 1.4])), h('scale'), { group: 13, bevel: 1, local: H });
  // Gold brow plate and jaw line, a glowing eye.
  r.fill(H.poly([0, 1.3, 2.6, 1, 4.3, 0.2, 2.2, 0.3, 0.4, 0.5]), h('belly'), { group: 13, bevel: 0.5 });
  r.line(H.x(1.2, -0.7), H.y(1.2, -0.7), H.x(3.9, -0.5), H.y(3.9, -0.5), h('tongue'), 0, 13);
  r.dot(H.x(1.4, 0.1), H.y(1.4, 0.1), h('eye'), 3, 13);
}

const lanternProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    serpent(r, t, f, (k) => h(QM[k]), 1.3);
  },
};

const wispProj: ProjArt = {
  frames: 4,
  draw(r, t0, f, h) {
    const t = new Xf(t0.ox, t0.oy, t0.ang, 1.25, 1.25);
    // A spirit bolt: a serpent's head of turquoise light trailing a rippling tail, plumes flaring off it.
    const w = [0, 0.8, 0, -0.8][f];
    r.fill(t.poly([1, -2.4, -4, -1.6 + w * 0.5, -8, -0.6 + w, -12, w * 1.5, -8, 0.8 + w, -4, 1.8 + w * 0.5, 1, 2.4]), h(QM.deep), { group: 1 });
    for (const [x, s, k] of [[-4.4, 1, 0], [-7.6, -1, 1], [-2.2, -1, 2]] as const) {
      const a = Math.PI + s * (0.7 + ((f + k) % 2) * 0.25);
      r.fill(feather(t, x, s * 0.8 + w * 0.5, a, 3.4, 0.75), h(k === 1 ? QM.red : QM.plume), { group: 2 + k, bevel: 0.6 });
    }
    r.fill(t.poly([-2.6, 0, -0.4, -2.2, 2.6, -1.4, 5, -0.2, 5.2, 0.6, 2.6, 1.8, -0.4, 2]), h(QM.spirit), { group: 6 });
    r.fill(t.poly([0.6, 0.2, 2.8, 0.8, 4.6, 0.3, 2.6, -0.4]), h(QM.hot), { group: 6 });
    r.dot(t.x(1.4, 0.9), t.y(1.4, 0.9), h(QM.eye), 3, 6);
    r.dot(t.x(-6 - f * 1.4, w * 0.6), t.y(-6 - f * 1.4, w * 0.6), h(QM.hot), 3, 1);
  },
};

const serpentSpirit: SkinArt = {
  mats: {
    // Stock names: the familiar's metal and light, and the wisp shots, in turquoise and gold.
    lantern: { base: GOLD[2], ramp: GOLD, shiny: true }, wisp: glow(SPIRIT[3]), wispHot: glow(0xf0fffc),
    'k.scale': turq(scales), 'k.belly': gold(), 'k.gold': gold(), 'k.red': scarlet(barbs(false)),
    'k.plume': plume(sheenOnly), 'k.plumeDk': plumeDk(sheenOnly), 'k.eye': glow(0xffe060), 'k.tongue': { base: SCARLET[3], ramp: SCARLET },
    'k.spirit': spirit(), 'k.deep': { base: SPIRIT[2], ramp: SPIRIT, glow: true }, 'k.hot': glow(0xf0fffc), 'k.sun': sun(),
    'k.blade': obsidian(), 'k.grip': turq(),
  },
  glow: [0xc8fff0, 0x1a9a8a],
  icon(r, t, m) {
    // The serpent coiled before a stepped gold sun ring.
    const ring0 = subtract(disc(t, 0.4, 0.4, 12, 12, 28), disc(t, 0.4, 0.4, 10.4, 10.4, 28));
    const steps: Shape[] = [ring0];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.13, c = Math.cos(a), s = Math.sin(a);
      steps.push(t.rect(0.4 + c * 12.4, 0.4 + s * 12.4, 0.8, 0.8));
    }
    r.fill(union(...steps), m('k.gold'), { group: 1, bevel: 1 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.39;
      r.dot(t.x(0.4 + Math.cos(a) * 11.2, 0.4 + Math.sin(a) * 11.2), t.y(0.4 + Math.cos(a) * 11.2, 0.4 + Math.sin(a) * 11.2), m('k.spirit'), 3, 1);
    }
    const k: Record<QK, string> = {
      blade: 'k.blade', grip: 'k.grip', gold: 'k.gold', red: 'k.red', plume: 'k.plume', plumeDk: 'k.plumeDk', scale: 'k.scale',
      belly: 'k.belly', eye: 'k.eye', tongue: 'k.tongue', spirit: 'k.spirit', deep: 'k.deep', hot: 'k.hot', sun: 'k.sun',
    };
    serpent(r, new Xf(t.ox + 1.5, t.oy + 0.5, 0), 0, (n) => m(k[n]), 1.45);
  },
  proj: { lantern: lanternProj, wisp: wispProj },
};

// -----------------------------------------------------------------------------
// Armour
// -----------------------------------------------------------------------------

function plumedHeaddress(): SkinArt {
  // A gold band set with turquoise mosaic, a gold sun disc at the brow round a turquoise heart, and rising
  // from the crown a fan of long quetzal plumes over a row of scarlet ones, swaying out of step.
  return {
    head: () => ({
      mats: {
        'h.gold': material(gold()), 'h.turq': material(turq(mosaic(1.1, 0.08))),
        'h.plume': material(plume(sheenOnly)), 'h.plumeDk': material(plumeDk(sheenOnly)), 'h.red': material(scarlet(barbs(false))),
        'h.tip': material({ base: TURQ[2], ramp: [0x0a2a4a, 0x14527a, 0x1e86a8, 0x4ac8d8, 0xc8fff8], shiny: true }),
        'h.sun': material(sun()), 'h.quill': material({ base: GOLD[3], ramp: GOLD }),
      },
      draw(r, H, m, g, sway) {
        const ph = r.phase % 4, s = sway * 0.06;
        const ox = -1.4, oy = 2.4;
        // The plume fan: long quetzal feathers radiating from the crown, the middle ones tallest,
        // each swaying on its own beat. Drawn outer pairs first so the tall middle ones sit in front.
        const FAN = [1.22, 1.55, 1.88, 2.21, 2.54, 2.87];
        const order = [5, 0, 4, 1, 3, 2];
        for (const i of order) {
          const a = FAN[i] + s + Math.sin(ph * Q + i * 1.1) * 0.06;
          const len = [7, 8.8, 9.6, 9.4, 8.6, 7.2][i], r0 = 5;
          const bx = ox + Math.cos(a) * r0, by = oy + Math.sin(a) * r0;
          const curl = i > 2 ? -0.06 : 0.03;
          const sh = feather(H, bx, by, a, len, 1.45, curl);
          r.fill(sh, m(i % 2 ? 'h.plumeDk' : 'h.plume'), { group: 40 + i, bevel: 1.1, local: H });
          // The iridescent eye near the tip and the gold quill.
          const [ex, ey] = along(bx, by, a, len, 0.84, curl);
          r.fill(intersect(sh, H.circ(ex, ey, 0.95)), m('h.tip'), { group: 40 + i, bevel: 0.6, noLine: true });
          const [qx, qy] = along(bx, by, a, len, 0.6, curl);
          r.line(H.x(bx, by), H.y(bx, by), H.x(qx, qy), H.y(qx, qy), m('h.quill'), 2, 40 + i);
        }
        // Short scarlet plumes and gold discs at the fan's base.
        for (const [i, a] of [1.5, 2.05, 2.6].entries()) {
          const aa = a + s * 0.6 + Math.sin(ph * Q + i * 1.7) * 0.04;
          r.fill(feather(H, ox + Math.cos(aa) * 4.6, oy + Math.sin(aa) * 4.6, aa, 3, 1), m('h.red'), { group: 47 + (i % 2), bevel: 0.8, local: H });
        }
        // The band: gold edged, turquoise mosaic between.
        r.fill(H.cap(-6.6, 1.6, 6.5, 2.9, 1.25), m('h.gold'), { group: g, bevel: 1 });
        r.fill(H.cap(-6.2, 1.66, 5.9, 2.86, 0.6), m('h.turq'), { group: g, noLine: true, local: H });
        // Gold studs along the band.
        for (const x of [-4.6, -2.2, 0.2]) r.dot(H.x(x, 1.9 + (x + 6.6) * 0.1), H.y(x, 1.9 + (x + 6.6) * 0.1), m('h.gold'), ph === Math.floor((x + 6) / 2.4) % 4 ? 4 : 3, g);
        // The sun disc at the brow, its rays turning, a turquoise heart glowing.
        r.fill(sunDisc(H, 5.4, 4, 1.9, 8, ph * (Math.PI / 16)), m('h.gold'), { group: 49, bevel: 1 });
        r.fill(H.circ(5.4, 4, 0.95), m('h.sun'), { group: 49 });
      },
    }),
    ...FX,
  };
}

function plumeMantle(): SkinArt {
  // Scarlet quilted cotton under a cape of layered quetzal feathers rippling row by row down to a scarlet
  // hem, feathered epaulets on gold discs, a turquoise mosaic pectoral round a gold sun, turquoise bracers
  // and a stepped-fret gold belt.
  return {
    mats: {
      jerkin: scarlet(quilt), jerkinDark: { base: SCARLET[1], ramp: SCARLET },
      'k.plume': plume(), 'k.plumeDk': plumeDk(), 'k.red': scarlet(barbs(false)),
      'k.gold': gold(), 'k.turq': turq(), 'k.bracer': turq(mosaic(1.2, 0.04)),
      'k.fret': gold(greca), 'k.sun': sun(),
    },
    chest: {
      forearm: 'k.bracer', belt: 'k.fret', sleeve: 'jerkin', sleeveLen: 0.4,
      back(r, T, m, c) {
        // Feather rows down the back, each row rippling a beat behind the one above, the hem scarlet.
        const top = c.top;
        for (let row = 0; row < 4; row++) {
          const y = top + 0.4 - row * 4.2;
          const sw = (c.sway * 2 + Math.sin(r.phase * Q - row * 1.1) * 0.45) * (row + 1) * 0.45;
          for (let k = 0; k < 4; k++) {
            const x = -1.8 - k * 2.2 - row * 0.9 - sw;
            const mat = row === 3 ? (k % 2 ? 'k.gold' : 'k.red') : (row + k) % 2 ? 'k.plumeDk' : 'k.plume';
            const len = row === 3 ? 4.4 : 6;
            r.fill(feather(T, x, y, -Math.PI / 2 - 0.2 - k * 0.12, len, 1.45, 0.03), m(mat), { group: 40 + row, bevel: 1.1, toneBias: row === 3 && k % 2 ? 0 : -1, local: T });
          }
        }
      },
      shoulder(r, S, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        // Feather lappets hanging off a gold disc, a scarlet one in the middle.
        for (const [a, len, k] of [[-Math.PI / 2 - 0.45, 4.6, 'k.plumeDk'], [-Math.PI / 2 + 0.35, 4.4, 'k.plume'], [-Math.PI / 2 - 0.05, 3.8, 'k.red']] as const) {
          r.fill(feather(S, 0, 1.2, a, len, 1.2), m(k), { ...o, bevel: 0.9, local: S });
        }
        r.fill(S.ell(0, 1.4, 2.6, 1.8), m('k.gold'), { ...o, bevel: 1.2 });
        r.fill(S.ell(0.1, 1.5, 1.4, 1), m('k.turq'), { ...o, bevel: 0.8, local: S });
      },
      over(r, T, m, c) {
        // The pectoral: a crescent of turquoise mosaic edged in gold under the neck, a gold sun at its heart.
        const b = c.body, top = c.top, ph = r.phase % 4;
        const cx = b.chestPush * 0.5 + 0.8, cy = top - 0.4;
        const outer = T.ell(cx, cy, 4.6, 3.6), inner = T.ell(cx - 0.4, cy + 1.2, 3, 2.2);
        r.fill(subtract(outer, inner), m('k.gold'), { group: c.g, bevel: 1 });
        r.fill(subtract(T.ell(cx, cy, 4, 3), T.ell(cx - 0.4, cy + 1.2, 3.5, 2.7)), m('k.turq'), { group: c.g, noLine: true, local: T });
        const sx = b.chestPush * 0.7 + 1.2, sy = top - 3.6;
        r.fill(sunDisc(T, sx, sy, 1.5, 8, ph * (Math.PI / 16)), m('k.gold'), { group: c.g + 1, bevel: 0.9 });
        r.fill(T.circ(sx, sy, 0.75), m('k.sun'), { group: c.g + 1 });
      },
    },
    ...FX,
  };
}

function jaguarLeggings(): SkinArt {
  // Jaguar-pelt leggings in broken rosettes banded in gold, a turquoise mosaic disc set in gold on each
  // knee, and a scarlet loincloth flap with a stepped-fret gold hem and tassels swinging at the front.
  return {
    mats: {
      windLeg: { base: JAGUAR[2], ramp: JAGUAR, tex: rosettes }, windTrim: obsidian(),
      'l.gold': gold(), 'l.turq': turq(mosaic(1, 0.08)), 'l.red': scarlet((x) => (wrap(x, 2.4) < 0.5 ? -1 : 0)),
      'l.fret': gold(greca), 'l.obs': obsidian(),
    },
    legs: {
      mat: 'windLeg', trim: 'windTrim', knee: null, tasset: null, rune: null, wraps: null, bulk: 0.15,
      over(r, t, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const L = c.len, w = c.w, ph = r.phase % 4;
        // The knee disc: gold ring, turquoise heart, an obsidian bead at its centre.
        const kr = c.body.kneeR;
        r.fill(t.circ(0.4, w * 0.25, kr * 0.95), m('l.gold'), { ...o, bevel: 0.9 });
        r.fill(t.circ(0.4, w * 0.25, kr * 0.62), m('l.turq'), { ...o, noLine: true, local: t });
        r.dot(t.x(0.4, w * 0.25), t.y(0.4, w * 0.25), m('l.obs'), 4, c.g);
        if (c.far) return;
        // The loincloth hangs from the hip in a frame that follows the thigh only a little (x up, y to the front).
        const d = Math.atan2(Math.sin(t.ang - Math.PI / 2), Math.cos(t.ang - Math.PI / 2));
        const K = new Xf(t.x(L, 0), t.y(L, 0), Math.abs(d) < 1.3 ? Math.PI / 2 + d * 0.5 : t.ang, 1, -1);
        const sw = [0, 0.35, 0.6, 0.25][ph];
        const hem = -L * 0.72;
        const flap = K.poly([0.6, w * 0.1, 0.6, w + 1.1, hem + 0.4, w + 1.5 + sw, hem, w * 0.3 + sw]);
        r.fill(flap, m('l.red'), { ...o, bevel: 1.2, local: K });
        r.fill(intersect(flap, K.rect(hem + 1, w, 1.3, w + 3, 0)), m('l.fret'), { ...o, bevel: 0.6, noLine: true, local: K });
        // Gold tassels off the hem, swinging a step behind.
        for (const [k, y] of [[0, w * 0.5], [1, w + 1.1]] as const) {
          const yy = y + sw * (1.1 + k * 0.2);
          r.fill(K.cap(hem + 0.2, yy, hem - 1.2, yy + sw * 0.5 + 0.2, 0.45, 0.3), m('l.gold'), { ...o, bevel: 0.5 });
        }
      },
    },
    ...FX,
  };
}

function serpentSandals(): SkinArt {
  // Turquoise straps wound up the shin over a gold sole, a gold cuff with a turquoise disc, a little wing
  // of quetzal plumes at each ankle fluttering, and a serpent's head of turquoise and gold over the toe.
  const straps: Tex = (x, y) => (wrap(x * 1.1 + y * 0.9, 2.3) < 0.75 ? -2 : wrap(x * 1.1 - y * 0.9, 4.6) < 0.5 ? 1 : 0);
  return {
    mats: {
      leap: { base: TURQ[2], ramp: TURQ, tex: straps }, leapTrim: gold(),
      'k.gold': gold(), 'k.turq': turq(mosaic(1, 0.08)), 'k.plume': plume(barbs(false)), 'k.plumeDk': plumeDk(),
      'k.red': scarlet(), 'k.eye': glow(0xff5a2a),
    },
    boots: {
      height: 0.72, wing: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w;
        // Gold sole.
        r.fill(foot.cap(-1.2, -1.6, c.toe, -1.35, 0.55), m('k.gold'), { ...o, bevel: 0.6 });
        // The wing of plumes at the back of the ankle, its tips lifting.
        if (!c.far) {
          const lift = [0, 0.12, 0.2, 0.08][ph];
          const bx = 2.2, by = -w + 0.4;
          r.fill(feather(shin, bx, by, -1 + lift * 0.6, 4.4, 0.95), m('k.plumeDk'), { ...o, bevel: 0.6, local: shin });
          r.fill(feather(shin, bx + 0.6, by, -0.5 + lift, 5.6, 1.05), m('k.plume'), { ...o, bevel: 0.6, local: shin });
          r.fill(feather(shin, bx + 1.2, by, 0 + lift * 1.2, 4.6, 1), m('k.plume'), { ...o, bevel: 0.6, local: shin });
          r.fill(feather(shin, bx + 0.4, by + 0.2, -0.5 + lift, 2.6, 1), m('k.red'), { ...o, bevel: 0.5, local: shin });
        }
        // The ankle cuff with its disc.
        r.fill(shin.cap(2, -w - 0.3, 2, w + 0.3, 0.7), m('k.gold'), { ...o, bevel: 0.7 });
        r.fill(shin.circ(2, w * 0.45, 0.85), m('k.turq'), { ...o, bevel: 0.6 });
        // The serpent's head over the toe, its jaw at the tip.
        const x = c.toe - 1.6;
        r.fill(union(foot.ell(x + 0.6, 0.4, 1.7, 1.2), foot.poly([x + 0.6, -0.6, x + 3, -0.5, x + 3.2, 0.3, x + 1, 1.2])), m('k.turq'), { ...o, bevel: 0.7, local: foot });
        r.fill(foot.poly([x - 0.4, 1.4, x + 2.4, 0.8, x + 3.2, 0.3, x + 1.4, 0.3, x - 0.6, 0.6]), m('k.gold'), { ...o, bevel: 0.4 });
        if (!c.far) r.dot(foot.x(x + 0.8, 0.5), foot.y(x + 0.8, 0.5), m('k.eye'), 3, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const C = {
  gold: css(GOLD[2]), goldHi: css(GOLD[3]), goldDk: css(GOLD[1]), turq: css(TURQ[2]), turqHi: css(TURQ[3]), turqDk: css(TURQ[1]),
  scale: css(TURQ[3]), green: css(QGREEN[3]), greenDk: css(QGREEN[2]), red: css(SCARLET[2]), eye: css(0xffe060), white: css(0xf0fffc),
};

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function quetzalAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  // A sun-stone ring on the ground: stepped dashes of gold and turquoise turning slowly, a notch every few.
  const RX = 16, RY = 3.8, N = 40;
  const step = Math.floor(t * 4);
  ring(g, x, y, RX, RY, N, layer, (g, px, py, i) => {
    const k = (i + step) % 8;
    if (k === 7) return;
    g.fillStyle = k < 3 ? (k === 1 ? C.goldHi : C.gold) : k === 3 ? C.goldDk : (k === 5 ? C.turqHi : C.turq);
    g.fillRect(px, py, 1, 1);
    // A stepped tooth standing up off the gold dashes.
    if (k === 1) { g.fillStyle = C.goldDk; g.fillRect(px, py - 1, 1, 1); }
  });
  // The feathered serpent spirit, spiralling up around the fighter: head, body segments and plume tips.
  const cyc = 3.6, u0 = (t / cyc) % 1;
  for (let k = 5; k >= 0; k--) {
    const u = u0 - k * 0.028;
    if (u < 0) continue;
    const a = u * Math.PI * 4.4 + 0.6;
    const s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const rad = 13 - u * 4;
    const px = Math.round(x + Math.cos(a) * rad), py = Math.round(y + s * rad * 0.28 - u * 54);
    g.globalAlpha = u < 0.08 ? u / 0.08 : u > 0.82 ? Math.max(0, (1 - u) / 0.18) : 1;
    if (k === 0) {
      // The head: turquoise with a gold brow, a glowing eye and a crest plume.
      g.fillStyle = C.turq; g.fillRect(px - 1, py - 1, 3, 2);
      g.fillStyle = C.gold; g.fillRect(px - 1, py - 2, 2, 1);
      g.fillStyle = C.eye; g.fillRect(px, py - 1, 1, 1);
      g.fillStyle = C.green; g.fillRect(px - 2, py - 3, 1, 2);
    } else {
      g.fillStyle = k % 2 ? C.turqDk : C.turq; g.fillRect(px, py, 2, 2);
      if (k % 2 === 0) { g.fillStyle = C.gold; g.fillRect(px, py, 2, 1); }
      // Plume tips flaring off alternate segments.
      if (k % 2 === 1) { g.fillStyle = k === 5 ? C.red : C.green; g.fillRect(px + (s < 0 ? -1 : 2), py - 1, 1, 2); }
    }
  }
  // A few quetzal feathers drifting down, rocking as they fall.
  for (let k = 0; k < 4; k++) {
    const a = k * 1.9 + 0.8 + t * 0.15;
    const s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const u = (t * (0.11 + (k % 2) * 0.04) + k * 0.27) % 1;
    const rock = Math.sin(t * 2.4 + k * 1.7);
    const px = Math.round(x + Math.cos(a) * (11 + (k % 3) * 3) + rock * 2), py = Math.round(y + s * 3 - 52 + u * 52);
    g.globalAlpha = u > 0.85 ? (1 - u) / 0.15 : u < 0.1 ? u / 0.1 : 1;
    const lean = rock > 0.3 ? 1 : rock < -0.3 ? -1 : 0;
    g.fillStyle = C.greenDk; g.fillRect(px, py, 1, 3);
    g.fillStyle = C.green; g.fillRect(px + lean, py - 1, 1, 2);
    g.fillStyle = k % 2 ? C.red : C.turqHi; g.fillRect(px, py + 3, 1, 1);
  }
  g.globalAlpha = 1;
}

export const QUETZAL: Record<string, SkinArt> = {
  'mace.macuahuitl': { weapon: macuahuitl, ...FX },
  'throwing_knives.obsidian': { weapon: plumeDart, proj: { knife: knifeProj }, ...FX },
  'wisp_lantern.serpent': serpentSpirit,
  'duelist_band.headdress': plumedHeaddress(),
  'leather_jerkin.quetzal': plumeMantle(),
  'windrunner_leggings.jaguar': jaguarLeggings(),
  'leaping_boots.serpent': serpentSandals(),
};
