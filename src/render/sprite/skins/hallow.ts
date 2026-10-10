import type { Layer } from '../../auraKit';
import { css } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { fillAll, hangAt, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, flameTongue, mats, Q, wrap } from './kit';

/**
 * Epic set: Hallow King. The pumpkin king of harvest night: carved
 * jack-o'-lanterns lit from within by candle fire, scarecrow straw and
 * patched plum plaid, black rags and bat wings, autumn leaves on the wind.
 * Night accents: the carved faces and candle flames, a few amber gems and
 * gold glints, one ember-stitched patch.
 */

/** Pumpkin rind: deep rust in the shadow up to a waxy highlight. */
const RIND = [0x501806, 0x8e320a, 0xcc5a16, 0xee8426, 0xffb860];
/** The shaded lobes behind (and the far side of a carved head). */
const RIND_DK = [0x3e1206, 0x6e2a0a, 0xa84c14, 0xd06e22, 0xf0a050];
const STEM = [0x1c1a08, 0x34300e, 0x524c18, 0x76702a, 0xa49c48];
const VINE = [0x10200c, 0x1e3a12, 0x305a1a, 0x4a7e28, 0x7aaa44];
const LEAF_RED = [0x4a0c08, 0x7e1a0c, 0xb8361a, 0xe0602a, 0xf8a050];
const LEAF_GOLD = [0x5a3208, 0x946010, 0xd09a22, 0xf0c848, 0xfff0a0];
const STRAW = [0x5a3e12, 0x8e6a26, 0xc8a04a, 0xe6c878, 0xfff0b8];
const TWINE = [0x3a2a14, 0x5e4622, 0x8a6c3a, 0xb09460, 0xd8c090];
const BURLAP = [0x3a2a18, 0x5e4628, 0x86683e, 0xa88a5a, 0xc8ae80];
/** Plum plaid flannel, the scarecrow's shirt. */
const PLUM = [0x1a0a22, 0x2e1238, 0x4a1e56, 0x6a347a, 0x9a5aa8];
/** Black rags with a violet cast. */
const RAG = [0x0e0a12, 0x1a141e, 0x2a2230, 0x3e3446, 0x5e5268];
const MOSS = [0x142010, 0x24361a, 0x3a5228, 0x587240, 0x86a064];
/** Blackened iron, its top tone the glint on an edge. */
const IRON = [0x0e0c0e, 0x1e1a1c, 0x34302e, 0x56504a, 0xd8c8b0];
/** Gnarled black wood. */
const WOOD = [0x1a100a, 0x2e1e12, 0x4a3220, 0x6a4a30, 0x8e6a48];
const GOLD = [0x5a3a0e, 0x946a1e, 0xc89a36, 0xecc864, 0xfff0b0];
const WAX = [0x8a7a5a, 0xc8b890, 0xece0c0, 0xfaf4e0, 0xffffff];
const LEATHER = [0x120c0a, 0x221814, 0x36261e, 0x4e3a2c, 0x7a5e48];
/** Bat wing membrane: black with a violet sheen. */
const BAT = [0x0a0810, 0x16101e, 0x261c30, 0x3a2c48, 0x5e4a72];
/** Candle fire: glow materials show the fourth tone, the texture lights the fifth. */
const FIRE = [0x8a2600, 0xd8500a, 0xff8a1a, 0xffc850, 0xfff6c8];
const HOT = 0xfff6c8, SPARK = 0xffd060, EMBER = 0xe0500a;

// -----------------------------------------------------------------------------
// Textures
// -----------------------------------------------------------------------------

/** Candle flicker: steady, dim, steady, flaring. */
const flick: Tex = (_x, _y, ph) => [0, -1, 0, 1][ph % 4];
/** Gnarled wood: wavy grain and a knot now and then. */
const gnarl: Tex = (x, y) => (wrap(y * 1.6 + Math.sin(x * 0.55) * 0.9, 1.7) < 0.42 ? -1 : hash(Math.floor(x * 0.5), 3) < 0.1 && wrap(x, 2) < 0.6 ? -1 : 0);
/** Twisted twine: diagonal strands. */
const twist: Tex = (x, y) => (wrap(x * 1.3 + y * 0.9, 1.5) < 0.5 ? -1 : 0);
/** Straw: long strands with a bright one here and there. */
const strands: Tex = (x, y) => (wrap(y * 2.1 + Math.sin(x * 0.6) * 0.4, 1.7) < 0.45 ? -1 : 0);
/** Burlap: a coarse weave. */
const weave: Tex = (x, y) => (wrap(Math.floor(x) + Math.floor(y), 2) === 0 && hash(Math.floor(x), Math.floor(y)) < 0.6 ? -1 : 0);
/** Plaid flannel: dark crossing bands, darker where they cross, a thin light stripe. */
const plaid: Tex = (x, y) => {
  const a = wrap(x, 4.4) < 1.3, b = wrap(y, 4.4) < 1.3;
  if (a && b) return -2;
  return a || b ? -1 : 0;
};
/** Rags: long folds and a few holes worn through. */
const folds: Tex = (x, y) => (Math.sin(x * 0.9 + Math.sin(y * 0.35) * 0.9) > 0.78 ? -1 : hash(Math.floor(x), Math.floor(y)) < 0.04 ? -1 : 0);
/** Ember-thread stitches: dashes that glint in turn, one step per frame. */
const embers: Tex = (x, y, ph) => (wrap(Math.floor(x * 0.8 + y * 0.8) + ph, 4) === 0 ? 2 : 0);
/** Dark iron with a glint sweeping along it. */
const sweep = (period = 10, speed = 2.5): Tex => (x, y, ph) => (wrap(x * 0.8 + y * 0.5 - ph * speed, period) < 0.9 ? 2 : hash(Math.floor(x * 1.4), Math.floor(y * 1.4)) < 0.05 ? -1 : 0);
/** Leaf veins. */
const veins: Tex = (x, y) => (Math.abs(wrap(y + Math.abs(x) * 0.6, 2.2) - 1.1) < 0.25 ? -1 : 0);

// -----------------------------------------------------------------------------
// Materials
// -----------------------------------------------------------------------------

const R = (ramp: number[], o: Partial<MaterialSpec> = {}): MaterialSpec => ({ base: ramp[2], ramp, ...o });
const rind = (tex?: Tex) => R(RIND, { tex });
const rindDk = () => R(RIND_DK);
const stem = () => R(STEM, { tex: (x) => (wrap(x, 1.2) < 0.4 ? -1 : 0) });
const vine = () => R(VINE);
const leafRed = () => R(LEAF_RED, { tex: veins });
const leafGold = () => R(LEAF_GOLD, { tex: veins });
const straw = (tex: Tex = strands) => R(STRAW, { tex });
const twine = (tex: Tex = twist) => R(TWINE, { tex });
const gold = (tex?: Tex) => R(GOLD, { shiny: true, tex });
const iron = (tex?: Tex) => R(IRON, { shiny: true, tex });
const wax = () => R(WAX, { tex: (x) => (wrap(x, 2.6) < 0.5 ? -1 : 0) });
const bat = (tex?: Tex) => R(BAT, { tex });
/** Candle fire seen through a carving or burning on a wick. */
const fire = (tex: Tex = flick): MaterialSpec => ({ base: FIRE[3], ramp: FIRE, glow: true, tex });
const deep = (): MaterialSpec => ({ base: FIRE[2], ramp: FIRE, glow: true, tex: (x) => (wrap(x, 3) < 1 ? -1 : 0) });
const hot = (): MaterialSpec => ({ base: HOT, glow: true });
const amber = (): MaterialSpec => ({ base: 0xffb030, ramp: [0x6a2800, 0xb85a08, 0xffa020, 0xffd060, 0xfff4c0], glow: true, tex: flick });

const FX = epicFx(SPARK, EMBER, 'flame', 0xffb040);

/** Particles the full set sheds in battle: autumn leaves whirling up off the ground. */
export const HALLOW_FX: SkinFx = { spark: 0xf8a040, spark2: 0x9a2a10, kind: 'petal' };

// -----------------------------------------------------------------------------
// Shapes
// -----------------------------------------------------------------------------

/** A frame at (x, y) of F whose +y runs along F's +x (things standing up off a weapon toward its tip). */
const along = (F: Xf, x: number, y: number) => new Xf(F.x(x, y), F.y(x, y), F.ang - Math.PI / 2, F.sx, F.sy);

/** A tapering chain of capsules through [x, y, radius] points. */
function chain(F: Xf, pts: number[][]): Shape {
  const s: Shape[] = [];
  for (let i = 1; i < pts.length; i++) s.push(F.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i - 1][2], pts[i][2]));
  return union(...s);
}

/** A maple leaf from its stalk at (x, y) toward angle `a`, `s` long: five pointed lobes. */
function leaf(F: Xf, x: number, y: number, a: number, s: number): Shape {
  const c = Math.cos(a), sn = Math.sin(a);
  const p = (u: number, v: number) => [x + (c * u - sn * v) * s, y + (sn * u + c * v) * s];
  return F.poly([
    ...p(0, 0), ...p(0.22, -0.5), ...p(0.42, -0.34), ...p(0.62, -0.56), ...p(0.66, -0.2),
    ...p(1, 0), ...p(0.66, 0.2), ...p(0.62, 0.56), ...p(0.42, 0.34), ...p(0.22, 0.5),
  ]);
}

/** A tuft of straw strands fanning from (x, y) toward angle `a`: `n` thin spikes `len` long over `spread` radians. */
function tuft(F: Xf, x: number, y: number, a: number, len: number, spread: number, n: number, w = 0.42, seed = 0): Shape {
  const parts: Shape[] = [];
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) - 0.5 : 0;
    const b = a + u * spread + (hash(i + seed, 5) - 0.5) * 0.25, l = len * (0.7 + hash(i + seed, 9) * 0.45);
    const c = Math.cos(b), s = Math.sin(b), nx = -s * w, ny = c * w;
    parts.push(F.poly([x + nx, y + ny, x + c * l, y + s * l, x - nx, y - ny]));
  }
  return union(...parts);
}

/** A carved hole: a dark cut of flesh round the edge, candle light glowing in the middle (`k` of its size). */
function carve(r: Raster, F: Xf, pts: number[], pit: number, glowM: number, g: number, k = 0.55): void {
  let cx = 0, cy = 0;
  const n = pts.length / 2;
  for (let i = 0; i < pts.length; i += 2) { cx += pts[i] / n; cy += pts[i + 1] / n; }
  r.fill(F.poly(pts), pit, { group: g, flat: 1, noLine: true });
  r.fill(F.poly(pts.map((v, i) => (i % 2 ? cy + (v - cy) * k : cx + (v - cx) * k))), glowM, { group: g, noLine: true });
}

interface JackMats { rind: number; rindDk: number; stem: number; fire: number; hot: number }

/**
 * A carved jack-o'-lantern facing out, upright in F at (cx, cy), `s` its half width: two shaded side lobes
 * and a round middle one (the contour between them makes the ribs), a crooked stem, and its eyes, nose and
 * jagged grin glowing with the candle inside. `lit` is the eyes' tone (flicker).
 */
function jack(r: Raster, F: Xf, cx: number, cy: number, s: number, k: JackMats, g: number, bias = 0, lit = 3, lean = 0): void {
  const ry = s * 0.84;
  r.fill(union(F.ell(cx - s * 0.46, cy, s * 0.54, ry * 0.93), F.ell(cx + s * 0.46, cy, s * 0.54, ry * 0.93)), k.rindDk, { group: g, bevel: s * 0.45, toneBias: bias });
  r.fill(F.ell(cx, cy + s * 0.02, s * 0.58, ry), k.rind, { group: g + 1, bevel: s * 0.5, toneBias: bias });
  r.fill(F.poly([cx - s * 0.13, cy + ry * 0.78, cx + lean * s * 0.2, cy + ry + s * 0.34, cx + s * 0.22 + lean * s * 0.2, cy + ry + s * 0.3, cx + s * 0.15, cy + ry * 0.78]), k.stem, { group: g + 1, bevel: 0.5, toneBias: bias });
  const o = { group: g + 1, noLine: true };
  if (s >= 3) {
    // Triangle eyes, a little nose and a grin with a tooth up and two down.
    for (const d of [-1, 1]) r.fill(F.poly([cx + d * s * 0.16, cy + ry * 0.02, cx + d * s * 0.66, cy + ry * 0.04, cx + d * s * 0.44, cy + ry * 0.46]), k.fire, o);
    if (s >= 4.5) r.fill(F.poly([cx - s * 0.1, cy - ry * 0.16, cx + s * 0.1, cy - ry * 0.16, cx, cy + ry * 0.02]), k.fire, o);
    r.fill(F.poly([
      cx - s * 0.74, cy - ry * 0.2, cx - s * 0.5, cy - ry * 0.34, cx - s * 0.36, cy - ry * 0.26, cx - s * 0.12, cy - ry * 0.36,
      cx, cy - ry * 0.26, cx + s * 0.12, cy - ry * 0.36, cx + s * 0.36, cy - ry * 0.26, cx + s * 0.5, cy - ry * 0.34, cx + s * 0.74, cy - ry * 0.2,
      cx + s * 0.5, cy - ry * 0.6, cx + s * 0.3, cy - ry * 0.5, cx + s * 0.18, cy - ry * 0.66, cx - s * 0.04, cy - ry * 0.58,
      cx - s * 0.2, cy - ry * 0.68, cx - s * 0.34, cy - ry * 0.52, cx - s * 0.52, cy - ry * 0.6,
    ]), k.fire, o);
    r.dot(F.x(cx - s * 0.42, cy + ry * 0.16), F.y(cx - s * 0.42, cy + ry * 0.16), k.hot, lit, g + 1);
    r.dot(F.x(cx + s * 0.42, cy + ry * 0.16), F.y(cx + s * 0.42, cy + ry * 0.16), k.hot, lit, g + 1);
  } else {
    // Too small to carve: two burning eyes and a slit of a grin.
    for (const d of [-1, 1]) r.dot(F.x(cx + d * s * 0.36, cy + ry * 0.18), F.y(cx + d * s * 0.36, cy + ry * 0.18), k.fire, lit, g + 1);
    r.line(F.x(cx - s * 0.4, cy - ry * 0.34), F.y(cx - s * 0.4, cy - ry * 0.34), F.x(cx + s * 0.4, cy - ry * 0.34), F.y(cx + s * 0.4, cy - ry * 0.34), k.fire, 3, g + 1);
  }
}

/** A bat wing from its root at (x, y) of F, spreading toward `side` (+1 right, −1 left); `lift` raises the tip. */
function batWing(F: Xf, x: number, y: number, side: number, s: number, lift: number): { shape: Shape; bones: number[][] } {
  const p = (u: number, v: number): [number, number] => [x + side * u * s, y + v * s];
  const wrist = p(0.42, 0.42 + lift * 0.45), tip = p(1, 0.22 + lift);
  const t1 = p(0.84, -0.12 + lift * 0.75), t2 = p(0.6, -0.36 + lift * 0.4), t3 = p(0.3, -0.34 + lift * 0.15);
  const pts = [
    ...p(0, 0.18), ...wrist, ...tip,
    ...t1, ...p(0.74, 0.0 + lift * 0.7), ...t2, ...p(0.46, -0.12 + lift * 0.35), ...t3, ...p(0.12, -0.16),
  ];
  return { shape: F.poly(pts), bones: [[...p(0, 0.12), ...wrist], [...wrist, ...tip], [...wrist, ...t1], [...wrist, ...t2], [...wrist, ...t3]] };
}

// -----------------------------------------------------------------------------
// Harvest King's Scythe
// -----------------------------------------------------------------------------

function harvestScythe(): WeaponArt {
  // A gnarled black-wood snath wound with a vine and two autumn leaves, a sheaf of straw bound under the head,
  // a carved jack-o'-lantern for a collar with candle fire licking out of its lid, and a long crescent of
  // blackened iron, its spine toothed, its edge glowing ember-orange.
  return {
    tip: 34,
    grip2: 13,
    mats: {
      wood: material(R(WOOD, { tex: gnarl })), twine: material(twine()), iron: material(iron()),
      blade: material(iron(sweep())), edge: material({ base: 0xd8500a, ramp: [0x3a0c04, 0x7a2008, 0xc8460c, 0xff8a1a, 0xffd870] }),
      rind: material(rind()), rindDk: material(rindDk()), stem: material(stem()), fire: material(fire()), hot: material(hot()),
      vine: material(vine()), leafR: material(leafRed()), leafG: material(leafGold()), straw: material(straw()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      const vineY = (x: number) => Math.sin(x * 0.85) * 1.2;
      // The vine's back turns, behind the snath.
      for (let x = 12; x < 29; x += 0.5) if (Math.cos(x * 0.85) < 0) r.dot(t.x(x, vineY(x)), t.y(x, vineY(x)), m('vine'), 1, g);
      // The snath: a crooked branch swelling at its knots.
      fillAll(r, [union(
        t.cap(-11.6, 0.3, -2, -0.2, 1.15, 1.1), t.cap(-2, -0.2, 8, 0.5, 1.1, 1.1), t.cap(8, 0.5, 19, 0.1, 1.1, 1.05), t.cap(19, 0.1, 31.6, -0.1, 1.05, 1.05),
        t.circ(-7.4, 0.2, 1.45), t.circ(6.2, 0.5, 1.4), t.circ(20.6, 0, 1.35),
      )], m('wood'), o, 1);
      // An iron butt spike with a curl of vine round it.
      fillAll(r, [t.poly([-11.2, -1.1, -15, 0.2, -11.2, 1.3])], m('iron'), o, 0.8);
      fillAll(r, [t.rect(-11, 0.2, 0.55, 1.5)], m('twine'), o, 0.6);
      // Twine-wrapped grips.
      fillAll(r, [t.cap(-2.2, -0.2, 2.2, 0.1, 1.35), t.cap(11, 0.4, 15, 0.3, 1.35)], m('twine'), o, 1);
      // The vine's front turns, then its leaves fluttering on their stalks.
      for (let x = 12; x < 29; x += 0.5) if (Math.cos(x * 0.85) >= 0) r.dot(t.x(x, vineY(x)), t.y(x, vineY(x)), m('vine'), 3, g);
      const fl = [0, 0.18, 0.3, 0.12][ph];
      fillAll(r, [leaf(t, 16.2, vineY(16.2) + 0.6, 1.9 - fl, 2.7)], m('leafR'), o, 0.7);
      fillAll(r, [leaf(t, 24.6, vineY(24.6) - 0.5, -1.5 + fl * 0.8, 2.4)], m('leafG'), o, 0.7);
      // The sheaf of straw bound under the head, its ends splaying both ways.
      const sheaf = union(tuft(t, 29, 0, Math.PI, 5.4, 0.75, 6, 0.5, 2), tuft(t, 29, 0, 0.12, 2.2, 1.6, 4, 0.45, 7));
      fillAll(r, [sheaf], m('straw'), o, 0.7);
      fillAll(r, [t.rect(28.6, 0, 0.5, 1.6), t.rect(26.8, 0, 0.45, 1.5)], m('twine'), o, 0.6);
      // Teeth along the blade's spine, behind it.
      const teeth = [[37.6, -5.4, 1.2], [37.3, -10.2, 1.1], [35.6, -14.8, 1]];
      const tooth: Shape[] = [];
      for (const [x, y, s] of teeth) tooth.push(t.poly([x - 0.6, y + 1.2, x + s * 1.1, y + 0.2, x - 0.4, y - 1.2]));
      fillAll(r, [union(...tooth)], m('iron'), o, 0.6);
      // The blade: a long crescent, broad at the heel, a fine hooked point.
      fillAll(r, [t.poly([
        31.2, 2, 34.6, 1, 36.8, -2.6, 37.6, -7.6, 36.6, -12.8, 34, -17.4, 30, -21.4, 25, -24.4, 19.4, -26.4, 15.6, -26.2,
        18.6, -24.6, 22.8, -23, 27.6, -19.6, 31, -15.6, 32.8, -11, 33.2, -6.6, 32.6, -2.8, 30.8, -0.8,
      ])], m('blade'), o, 1.8);
      // The ember edge on the inner curve, a flicker of flame running along it.
      const e = [17.2, -25.6, 20.4, -24, 23.6, -22.2, 27.4, -19, 30.5, -15.2, 32.1, -11, 32.5, -6.6, 32, -3];
      for (let i = 0; i + 3 < e.length; i += 2) {
        const hotSeg = (i / 2 + ph) % 4 === 0;
        r.line(t.x(e[i], e[i + 1]), t.y(e[i], e[i + 1]), t.x(e[i + 2], e[i + 3]), t.y(e[i + 2], e[i + 3]), m('edge'), hotSeg ? 4 : 3, g);
      }
      // A bright bevel down the spine.
      const f = [35, -3, 35.6, -7.6, 34.7, -12.3, 32.4, -16.4];
      for (let i = 0; i + 3 < f.length; i += 2) r.line(t.x(f[i], f[i + 1]), t.y(f[i], f[i + 1]), t.x(f[i + 2], f[i + 3]), t.y(f[i + 2], f[i + 3]), m('blade'), 3, g);
      // Candle fire licking up out of the lantern's lid, behind it.
      const P = along(t, 32.6, 0.6);
      const hs = [[2.2, 3.2], [3, 2.4], [2.5, 3.4], [3.3, 2.6]][ph];
      flameTongue(r, P, -0.9, 1.4, 0.8, hs[0], -0.4, m('fire'), m('hot'), g, o.local);
      flameTongue(r, P, 0.8, 1.6, 0.7, hs[1], 0.5, m('fire'), m('hot'), g, o.local);
      // The jack-o'-lantern collar, grinning out.
      jack(r, P, 0, -0.4, 2.7, { rind: m('rind'), rindDk: m('rindDk'), stem: m('stem'), fire: m('fire'), hot: m('hot') }, 46, o.toneBias ?? 0, ph === 3 ? 4 : 3, 0.6);
    },
  };
}

// -----------------------------------------------------------------------------
// Pumpkin Bolas
// -----------------------------------------------------------------------------

function pumpkinBolas(): WeaponArt {
  // Three little jack-o'-lanterns on twine cords, their faces lit, knotted to a twist of straw and a red leaf.
  return {
    tip: 7,
    mats: {
      rind: material(rind()), rindDk: material(rindDk()), stem: material(stem()), fire: material(fire()), hot: material(hot()),
      cord: material(twine()), straw: material(straw()), leaf: material(leafRed()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4, b = o.toneBias ?? 0;
      const H = hangAt(t, 0, 0), s = Math.abs(t.sy);
      const ends: [number, number, number][] = [[6.6, -3.2, 2.3], [5.6, 3.3, 2.2], [9, 0.3, 2.5]];
      for (const [x, y] of ends) r.line(H.x(0.5, 0), H.y(0.5, 0), H.x(x - 1.2, y), H.y(x - 1.2, y), m('cord'), 2, g);
      const k = { rind: m('rind'), rindDk: m('rindDk'), stem: m('stem'), fire: m('fire'), hot: m('hot') };
      ends.forEach(([x, y, rad], i) => {
        const P = new Xf(H.x(x, y), H.y(x, y), 0, s, s);
        jack(r, P, 0, 0, rad, k, g + 40 + i * 2, b, (ph + i) % 4 === 0 ? 4 : 3, i % 2 ? 0.5 : -0.5);
      });
      // The knot: a twist of straw and a red leaf.
      fillAll(r, [tuft(H, 0.4, 0, Math.PI, 2.2, 1.6, 4, 0.4, 3)], m('straw'), o, 0.5);
      fillAll(r, [leaf(H, 0.6, 0.2, -2.2 + [0, 0.15, 0.25, 0.1][ph], 2.4)], m('leaf'), o, 0.6);
      fillAll(r, [H.circ(0.6, 0, 0.95)], m('cord'), o, 1);
    },
  };
}

// -----------------------------------------------------------------------------
// Battle sprites (their own materials)
// -----------------------------------------------------------------------------

const HM = mats({
  rind: rind(), rindDk: rindDk(), stem: stem(), fire: fire(), hot: hot(), deep: deep(),
  cord: twine(), straw: straw(), leaf: leafRed(), leafG: leafGold(), vine: vine(), bat: bat(), batHi: bat(),
});
type HK = keyof typeof HM;

const bolasProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // Three jack-o'-lanterns whirling round the knot, each trailing a tail of candle fire along its orbit,
    // their faces staying upright as they spin.
    const k = new Xf(t.ox, t.oy, -f * (Math.PI / 6));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const outer: number[] = [], inner: number[] = [];
      for (let s = 0; s <= 6; s++) {
        const u = s / 6, b = a + u * 1.25, w = 1.6 * (1 - u) + 0.1;
        outer.push(Math.cos(b) * (6.2 + w), Math.sin(b) * (6.2 + w));
        inner.unshift(Math.cos(b) * (6.2 - w * 0.7), Math.sin(b) * (6.2 - w * 0.7));
      }
      r.fill(k.poly([...outer, ...inner]), h(HM.deep), { group: 1, noLine: true });
      const core: number[] = [];
      for (let s = 0; s <= 4; s++) { const b = a + (s / 4) * 0.7; core.push(Math.cos(b) * 6.6, Math.sin(b) * 6.6); }
      for (let s = 4; s >= 0; s--) { const b = a + (s / 4) * 0.7; core.push(Math.cos(b) * 5.9, Math.sin(b) * 5.9); }
      r.fill(k.poly(core), h(HM.fire), { group: 1, noLine: true });
      r.line(t.ox, t.oy, k.x(Math.cos(a) * 6, Math.sin(a) * 6), k.y(Math.cos(a) * 6, Math.sin(a) * 6), h(HM.cord), 2, 2);
    }
    const jm = { rind: h(HM.rind), rindDk: h(HM.rindDk), stem: h(HM.stem), fire: h(HM.fire), hot: h(HM.hot) };
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const P = new Xf(k.x(Math.cos(a) * 6, Math.sin(a) * 6), k.y(Math.cos(a) * 6, Math.sin(a) * 6), 0);
      jack(r, P, 0, 0, i ? 2.2 : 2.4, jm, 3 + i * 2, 0, (f + i) % 2 ? 4 : 3);
    }
    r.fill(leaf(k, 0, 0, f * 0.4 + 0.6, 2.6), h(HM.leaf), { group: 10, bevel: 0.6 });
    r.fill(k.circ(0, 0, 0.9), h(HM.cord), { group: 10, bevel: 0.8 });
  },
};

/**
 * The bat-winged jack-o'-lantern at (0, 0) of t: wings beating either side of a carved pumpkin, a curled vine
 * off its stem with a leaf; `f` steps the four-frame loop, `s` scales the pumpkin, `ws` the wings.
 */
function batJack(r: Raster, t: Xf, f: number, h: (k: HK) => number, s = 1, ws = 1, g = 1): void {
  const lift = [-0.55, 0.05, 0.5, 0.05][f % 4];
  const R0 = 3.8 * s;
  for (const side of [-1, 1]) {
    const w = batWing(t, side * R0 * 0.8, R0 * 0.18, side, 7 * ws, lift);
    r.fill(w.shape, h('bat'), { group: g + (side < 0 ? 0 : 1), bevel: 1, toneBias: side < 0 ? -1 : 0, local: t });
    for (const [ax, ay, bx, by] of w.bones) r.line(t.x(ax, ay), t.y(ax, ay), t.x(bx, by), t.y(bx, by), h('batHi'), 3, g + (side < 0 ? 0 : 1));
  }
  // A vine curling off the stem, and a leaf.
  const sw = [0, 0.15, 0.25, 0.1][f % 4];
  r.fill(chain(t, [[R0 * 0.05, R0 * 1.05, 0.38 * s], [-R0 * 0.35, R0 * 1.25, 0.34 * s], [-R0 * 0.62, R0 * 1.08, 0.3 * s], [-R0 * 0.55, R0 * 0.86, 0.22 * s]]), h('vine'), { group: g + 2, bevel: 0.5 });
  r.fill(leaf(t, R0 * 0.25, R0 * 1.12, 0.5 - sw, 2.2 * s), h('leafG'), { group: g + 2, bevel: 0.6 });
  jack(r, t, 0, 0, R0, { rind: h('rind'), rindDk: h('rindDk'), stem: h('stem'), fire: h('fire'), hot: h('hot') }, g + 3, 0, f % 4 === 2 ? 4 : 3, 0.4);
}

const lanternProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    batJack(r, t, f, (k) => h(HM[k]));
  },
};

const wispProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t0, f, h) {
    // A bat of candle fire seen from above, flying head first: wings beating, a tail of flame streaming behind.
    const t = new Xf(t0.ox, t0.oy, t0.ang, 1.3, 1.3);
    const w = [0, 0.6, 0, -0.6][f];
    r.fill(t.poly([-1, -2.2, -5, -1.6 + w * 0.5, -9, -0.6 + w, -12.5, w * 1.5, -9, 0.8 + w, -5, 1.8 + w * 0.5, -1, 2.2]), h(HM.deep), { group: 1 });
    r.fill(t.poly([-1, -1.1, -6, -0.4 + w * 0.5, -8.5, w * 0.9, -6, 0.5 + w * 0.5, -1, 1.1]), h(HM.fire), { group: 1 });
    // Wings: spread wide, half up, folded, half up (seen from above they sweep forward and back).
    const span = [6.2, 5, 3.4, 5][f], sweepBack = [0, 0.8, 1.6, 0.8][f];
    for (const side of [-1, 1]) {
      const p = (u: number, v: number) => [u - sweepBack * (v / span), side * v];
      const pts = [...p(0.9, 0.5), ...p(0.9, span * 0.5), ...p(-0.4, span), ...p(-1.5, span * 0.74), ...p(-1.3, span * 0.56), ...p(-2.5, span * 0.44), ...p(-2, span * 0.27), ...p(-2.8, 0.5)];
      r.fill(t.poly(pts), h(HM.bat), { group: 2, bevel: 0.6, toneBias: side < 0 ? -1 : 0 });
      const [ex, ey] = p(-0.4, span), [wx, wy] = p(0.9, span * 0.5);
      r.line(t.x(0.9, side * 0.5), t.y(0.9, side * 0.5), t.x(wx, wy), t.y(wx, wy), h(HM.fire), 3, 2);
      r.line(t.x(wx, wy), t.y(wx, wy), t.x(ex, ey), t.y(ex, ey), h(HM.fire), 3, 2);
    }
    // Body, head and pointed ears, eyes burning.
    r.fill(t.ell(-0.4, 0, 2, 1.15), h(HM.bat), { group: 3, bevel: 0.7 });
    r.fill(union(t.circ(1.8, 0, 1.1), t.poly([1.6, 0.5, 3.4, 1.4, 2.4, 0.2]), t.poly([1.6, -0.5, 3.4, -1.4, 2.4, -0.2])), h(HM.bat), { group: 4, bevel: 0.6 });
    r.dot(t.x(2.4, 0.45), t.y(2.4, 0.45), h(HM.hot), 3, 4);
    r.dot(t.x(2.4, -0.45), t.y(2.4, -0.45), h(HM.hot), 3, 4);
  },
};

const jackOLantern: SkinArt = {
  mats: {
    // Stock names: the familiar's metal and light, and the wisp shots, in candle orange.
    lantern: { base: RIND[2], ramp: RIND }, wisp: fire(), wispHot: hot(),
    'k.rind': rind(), 'k.rindDk': rindDk(), 'k.stem': stem(), 'k.fire': fire(), 'k.hot': hot(), 'k.deep': deep(),
    'k.cord': twine(), 'k.straw': straw(), 'k.leaf': leafRed(), 'k.leafG': leafGold(), 'k.vine': vine(), 'k.bat': bat(), 'k.batHi': bat(),
  },
  glow: [0xffd060, 0xe0500a],
  icon(r, t, m) {
    // The bat-winged jack-o'-lantern, big, a harvest moon behind it.
    const k: Record<HK, string> = {
      rind: 'k.rind', rindDk: 'k.rindDk', stem: 'k.stem', fire: 'k.fire', hot: 'k.hot', deep: 'k.deep', cord: 'k.cord',
      straw: 'k.straw', leaf: 'k.leaf', leafG: 'k.leafG', vine: 'k.vine', bat: 'k.bat', batHi: 'k.batHi',
    };
    batJack(r, new Xf(t.ox, t.oy + 1.5, 0), 2, (n) => m(k[n]), 1.75, 1.5);
  },
  proj: { lantern: lanternProj, wisp: wispProj },
};

// -----------------------------------------------------------------------------
// Pumpkin King's Head
// -----------------------------------------------------------------------------

function pumpkinHead(): SkinArt {
  // The whole head a great carved pumpkin, lit from within: a ribbed rind, triangle eyes and a jagged grin
  // flickering with candle light, a ruff of scarecrow straw bursting out at the neck, a curled stem and a
  // vine with a red leaf, and a crooked gold crown set with three dripping candles burning on top.
  /** The pumpkin's top edge at x. */
  const top = (x: number) => 1.2 + 6.8 * Math.sqrt(Math.max(0, 1 - (x / 7.8) ** 2));
  return {
    head: () => ({
      mats: {
        'h.rind': material(rind((x, y) => (hash(Math.floor(x * 1.3), Math.floor(y * 1.3)) < 0.05 ? -1 : 0))),
        'h.rindDk': material(rindDk()), 'h.stem': material(stem()), 'h.vine': material(vine()), 'h.leaf': material(leafRed()),
        'h.straw': material(straw()), 'h.gold': material(gold()), 'h.wax': material(wax()),
        'h.fire': material(fire()), 'h.hot': material(hot()), 'h.gem': material(amber()), 'h.pit': material(R([0x2a0a02, 0x3e1404, 0x5a2008, 0x7a300c, 0x9a4010])),
      },
      draw(r, H, m, g, sway) {
        const ph = r.phase % 4, s = sway * 1.5;
        // The straw ruff bursting out under the pumpkin, behind it.
        r.fill(tuft(H, -1.4, -4.2, -Math.PI / 2 - 0.15, 4.4, 2.1, 8, 0.5, 11), m('h.straw'), { group: g, bevel: 0.6, toneBias: -1 });
        r.fill(tuft(H, 0.8, -4.6, -Math.PI / 2 + 0.25, 3.6, 1.6, 6, 0.45, 4), m('h.straw'), { group: g, bevel: 0.6 });
        // The vine trailing down the back of the head from the stem, a red leaf on it.
        const vs = [0, 0.2, 0.35, 0.15][ph];
        r.fill(chain(H, [[-1.2, 8.2, 0.42], [-4.6 - s * 0.3, 8.8, 0.38], [-7.6 - s * 0.6, 7.4 + vs * 0.4, 0.34], [-9 - s, 5 + vs, 0.28], [-8.4 - s, 3.4 + vs, 0.22]]), m('h.vine'), { group: 41, bevel: 0.6 });
        r.fill(leaf(H, -7.4 - s * 0.6, 7.2, 2.5 + vs, 3.1), m('h.leaf'), { group: 41, bevel: 0.8 });
        // The pumpkin: back and front lobes shaded, the near middle lobe over them (the contours make the ribs).
        r.fill(H.ell(-3.4, 1.2, 4.4, 6.5), m('h.rindDk'), { group: 42, bevel: 2, toneBias: -1 });
        r.fill(H.ell(3.6, 1.1, 4.3, 6.3), m('h.rindDk'), { group: 43, bevel: 2 });
        r.fill(H.ell(0.4, 1.2, 4.7, 6.8), m('h.rind'), { group: 44, bevel: 2.4, local: H });
        // The carving: the near eye, the far eye narrow at the profile, a nose and the jagged grin, each a
        // dark cut with the candle light glowing inside it.
        const pit = m('h.pit'), fl = m('h.fire');
        carve(r, H, [0.9, 0.7, 4.4, 1, 2.8, 4.2], pit, fl, 44);
        carve(r, H, [5.4, 1, 7.7, 0.7, 7.1, 3.9], pit, fl, 44);
        carve(r, H, [5.2, -0.6, 6.8, -0.8, 6.2, 0.7], pit, fl, 44, 0.3);
        carve(r, H, [
          0.2, -1.4, 1.6, -2.4, 2.6, -1.8, 3.8, -2.6, 4.8, -1.9, 5.9, -2.6, 6.8, -1.7, 7.9, -1.3,
          7.5, -3.6, 6.4, -4.8, 5.4, -4, 4.4, -5.2, 3.4, -4.2, 2.2, -4.9, 1.2, -3.6,
        ], pit, fl, 44, 0.62);
        r.dot(H.x(2.7, 1.9), H.y(2.7, 1.9), m('h.hot'), ph === 3 ? 4 : 3, 44);
        r.dot(H.x(6.8, 2), H.y(6.8, 2), m('h.hot'), ph === 1 ? 4 : 3, 44);
        r.dot(H.x(4.3, -3.4), H.y(4.3, -3.4), m('h.hot'), 3, 44);
        // The stem, crooked and leaning back.
        r.fill(H.poly([-2, 7.6, -2.6, 10.4, -1.8, 10.9, -0.6, 10.6, -0.4, 7.8]), m('h.stem'), { group: 45, bevel: 0.7 });
        // The crown: a band of tarnished gold following the pumpkin's top, small points between three candles.
        const band: number[] = [];
        for (let x = -5.2; x <= 5.4; x += 1.06) band.push(x, top(x) + 0.5);
        for (let x = 5.4; x >= -5.2; x -= 1.06) band.push(x, top(x) - 0.9);
        r.fill(H.poly(band), m('h.gold'), { group: 46, bevel: 0.8, local: H });
        // Amber gems in the band.
        for (const [i, x] of [-3, 0.6, 4].entries()) r.dot(H.x(x, top(x) - 0.2), H.y(x, top(x) - 0.2), m('h.gem'), (i + ph) % 3 === 0 ? 4 : 3, 46);
        // Three candles on the crown, wax dripping over the band, flames flickering out of step.
        const CANDLES: [number, number][] = [[-3.2, 2.4], [0.6, 3.6], [4.2, 2.8]];
        CANDLES.forEach(([x, hgt], i) => {
          const y0 = top(x) + 0.2, y1 = y0 + hgt;
          r.fill(union(H.rect(x, (y0 + y1) / 2, 0.7, hgt / 2), H.cap(x - 0.55, y0 + 0.1, x - 0.6, y0 - 0.9, 0.28, 0.24)), m('h.wax'), { group: 47 + i, bevel: 0.5, local: H });
          r.dot(H.x(x, y1 + 0.2), H.y(x, y1 + 0.2), m('h.pit'), 0, 47 + i);
          const fh = [[2.2, 2.8, 2.4], [2.8, 2.2, 3], [2.4, 3, 2.1], [3, 2.5, 2.8]][ph][i];
          flameTongue(r, H, x, y1 + 0.3, 0.85, fh, ((ph + i) % 2 ? 0.35 : -0.3) - s * 0.2, m('h.fire'), m('h.fire'), 47 + i);
          r.dot(H.x(x, y1 + 0.9), H.y(x, y1 + 0.9), m('h.hot'), 3, 47 + i);
        });
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Scarecrow Rags
// -----------------------------------------------------------------------------

/** The torso's main volumes (as the figure draws them), for clipping patches to it. */
function torsoBody(T: Xf, b: { hipW: number; waistW: number; chestW: number; chestPush: number }, top: number): Shape {
  return union(T.ell(0.3, 0.6, b.hipW, 3.6), T.ell(0.5, top * 0.46, b.waistW, top * 0.28), T.ell(b.chestPush * 0.7, top - 3.4, b.chestW, 5.4));
}

/** A row of cross stitches from (ax, ay) to (bx, by) in frame F. */
function stitches(r: Raster, F: Xf, ax: number, ay: number, bx: number, by: number, n: number, mat: number, tone: number, g: number): void {
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * 0.45, ny = (dx / l) * 0.45;
  for (let i = 0; i <= n; i++) {
    const x = ax + (dx * i) / n, y = ay + (dy * i) / n;
    r.line(F.x(x - nx, y - ny), F.y(x - nx, y - ny), F.x(x + nx, y + ny), F.y(x + nx, y + ny), mat, tone, g);
  }
}

function scarecrowRags(): SkinArt {
  // A plum plaid shirt patched with burlap and moss-green cloth, cross-stitched in twine, straw bursting out
  // at the collar, the shoulders and under the rope belt; a ragged black cape fluttering behind, and a little
  // jack-o'-lantern hanging lit from the belt.
  return {
    mats: {
      'hk.plaid': R(PLUM, { tex: plaid }), 'hk.burlap': R(BURLAP, { tex: weave }), 'hk.moss': R(MOSS, { tex: weave }),
      'hk.rag': R(RAG, { tex: folds }), 'hk.straw': straw(), 'hk.rope': twine(), 'hk.glove': R(LEATHER),
      'hk.thread': R(TWINE), 'hk.rind': rind(), 'hk.rindDk': rindDk(), 'hk.stem': stem(), 'hk.fire': fire(), 'hk.hot': hot(),
      'hk.brass': gold(),
    },
    chest: {
      torso: 'hk.plaid', sleeve: 'hk.plaid', sleeveLen: 1, forearm: 'hk.plaid', hands: 'hk.glove', pauldron: null,
      skirt: 0, cape: null, hood: null, spikes: null, belt: 'hk.rope', trim: null, noScarf: true,
      back(r, T, m, c) {
        const top = c.top, s = c.sway * 3, ph = r.phase % 4;
        // A ragged black cape: long tatters of different lengths, each swinging on its own beat.
        const hem: number[] = [];
        const N = 6;
        for (let i = 0; i <= N; i++) {
          const u = i / N, rip = Math.sin(ph * Q + i * 2.3) * 0.8;
          const x = -11.4 - s * 1.3 + u * 9.6 + u * s * 0.6, y = -10.5 + u * 3.6;
          hem.push(x, y + (i % 2 ? 2.4 + rip * 0.4 : rip) - (i === 3 ? 1.8 : 0));
          if (i < N) hem.push(x + 0.8, y + 3.2 + rip * 0.3);
        }
        r.fill(T.poly([-0.6, top + 0.6, -5.2, top - 0.8, -9.2 - s, top - 6.4, -11.8 - s * 1.3, -6, ...hem, -1.6, -3, -0.6, 0]), m('hk.rag'), { group: c.g, bevel: 2.6, toneBias: -1, softLight: true, local: T });
        // A burlap patch stitched on it.
        const px = -6.4 - s * 0.6, py = top - 9;
        r.fill(T.rect(px, py, 1.5, 1.3, 0.2), m('hk.burlap'), { group: c.g, bevel: 0.6, toneBias: -1 });
        stitches(r, T, px - 1.5, py + 1.3, px + 1.5, py + 1.3, 3, m('hk.thread'), 2, c.g);
        // Straw poking out of the collar at the back.
        r.fill(tuft(T, -2.2, top + 0.4, Math.PI * 0.82 + s * 0.05, 3.2, 0.9, 4, 0.42, 21), m('hk.straw'), { group: c.g, bevel: 0.5, toneBias: -1 });
      },
      shoulder(r, S, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        // Straw bursting out of the top of the sleeve, a burlap patch sewn over the shoulder.
        r.fill(tuft(S, -0.6, 1.8, Math.PI * 0.62, 3.4, 1.2, 5, 0.45, c.far ? 3 : 8), m('hk.straw'), { ...o, bevel: 0.5 });
        r.fill(S.poly([-2.2, 2.2, 2, 2.6, 2.4, -0.6, -1.8, -1]), m('hk.burlap'), { ...o, bevel: 0.9 });
        if (!c.far) stitches(r, S, -2, 2.1, 2.1, 2.5, 3, m('hk.thread'), 3, c.g);
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, ph = r.phase % 4, fx = b.chestPush * 0.7;
        const body = torsoBody(T, b, top);
        // A burlap patch on the chest, cross-stitched round, and a moss-green one low on the belly.
        const cx = fx + 1.4, cy = top - 4.2;
        r.fill(intersect(body, T.poly([cx - 2, cy + 1.9, cx + 2.2, cy + 1.6, cx + 2.4, cy - 1.8, cx - 1.8, cy - 1.7])), m('hk.burlap'), { group: 60, bevel: 0.8, local: T });
        stitches(r, T, cx - 1.9, cy + 1.8, cx + 2.2, cy + 1.6, 4, m('hk.thread'), 3, 60);
        stitches(r, T, cx + 2.3, cy + 1.5, cx + 2.4, cy - 1.7, 3, m('hk.thread'), 3, 60);
        const mx = fx - 1, my = top * 0.42;
        r.fill(intersect(body, T.poly([mx - 1.6, my + 1.3, mx + 1.4, my + 1.5, mx + 1.6, my - 1.2, mx - 1.4, my - 1.4])), m('hk.moss'), { group: 61, bevel: 0.6, local: T });
        stitches(r, T, mx - 1.6, my + 1.3, mx + 1.4, my + 1.5, 3, m('hk.thread'), 2, 61);
        // Straw bursting out under the rope belt over the hips, and at the collar.
        const sw = c.sway * 0.4;
        r.fill(tuft(T, -b.hipW * 0.6, 1.6, -Math.PI / 2 - 0.35 - sw, 3.4, 0.7, 4, 0.45, 13), m('hk.straw'), { group: 62, bevel: 0.5, toneBias: -1 });
        r.fill(tuft(T, fx + 1, top + 0.8, Math.PI / 2 - 0.4, 1.9, 1.2, 4, 0.4, 5), m('hk.straw'), { group: 63, bevel: 0.5 });
        r.fill(T.ell(fx + 0.2, top + 0.2, 3.2, 1.3, -0.1), m('hk.rope'), { group: 63, bevel: 0.8, local: T });
        // The rope belt's knot with its ends hanging, and a little jack-o'-lantern hung from it on a cord.
        const kx = b.waistW + 0.3, ky = 2.6;
        r.fill(T.circ(kx, ky, 0.9), m('hk.rope'), { group: 64, bevel: 0.6 });
        r.fill(union(T.cap(kx, ky, kx - 0.6 - sw, ky - 3.4, 0.38, 0.32), T.cap(kx, ky, kx + 0.4 - sw, ky - 2.6, 0.36, 0.3)), m('hk.rope'), { group: 64, bevel: 0.4 });
        const lx = kx + 1.6 - sw * 1.4, ly = -1.6 + [0, 0.15, 0.25, 0.1][ph];
        r.line(T.x(kx + 0.5, ky - 0.3), T.y(kx + 0.5, ky - 0.3), T.x(lx, ly + 1.8), T.y(lx, ly + 1.8), m('hk.rope'), 1, 65);
        jack(r, new Xf(T.x(lx, ly), T.y(lx, ly), 0), 0, 0, 1.75, { rind: m('hk.rind'), rindDk: m('hk.rindDk'), stem: m('hk.stem'), fire: m('hk.fire'), hot: m('hk.hot') }, 65, 0, ph === 2 ? 4 : 3);
        // A brass pin holding the patch, catching the light.
        r.dot(T.x(cx + 1.8, cy + 1.1), T.y(cx + 1.8, cy + 1.1), m('hk.brass'), 4, 60);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Patchwork Trousers
// -----------------------------------------------------------------------------

function patchworkTrousers(): SkinArt {
  // Old trousers of patchwork burlap, a plum patch on the thigh sewn with ember-bright thread, a brass button,
  // twine tied under the knee, and straw poking out of the ragged hems over the boots.
  return {
    mats: {
      legLeather: R(BURLAP, { tex: weave }), legLeatherDark: twine(),
      'l.hw.plum': R([0x2e1238, 0x4a1e56, 0x6e3082, 0x9450a8, 0xc080d0], { tex: plaid }), 'l.hw.moss': R(MOSS, { tex: weave }),
      'l.hw.thread': { base: 0xb06a2a, ramp: [0x4a2208, 0x6e3410, 0x9a5420, 0xc87a34, 0xffc060], tex: embers },
      'l.hw.straw': straw(), 'l.hw.twine': twine(), 'l.hw.brass': gold(), 'l.hw.rag': R(BURLAP),
    },
    legs: {
      mat: 'legLeather', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.25,
      over(r, t, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const L = c.len, w = c.w;
        // A patch on the front of the thigh, ember-stitched round its edge (plum on the near leg, moss on the far).
        const p0 = L * 0.3, p1 = L * 0.86;
        const patch = t.poly([p0, -w * 0.35, p0 - 0.2, w + 0.35, p1, w + 0.2, p1 + 0.2, -w * 0.25]);
        r.fill(patch, m(c.far ? 'l.hw.moss' : 'l.hw.plum'), { ...o, bevel: 0.8, local: t });
        stitches(r, t, p0, w + 0.35, p1, w + 0.2, 4, m('l.hw.thread'), 2, c.g);
        stitches(r, t, p0, -w * 0.35, p0 - 0.2, w + 0.35, 3, m('l.hw.thread'), 2, c.g);
        if (!c.far) r.dot(t.x(p1 - 0.6, w * 0.3), t.y(p1 - 0.6, w * 0.3), m('l.hw.brass'), 4, c.g);
        // Twine tied round just under the knee... and just above it, a loose loop.
        r.fill(t.cap(0.5, -w - 0.3, 0.7, w + 0.3, 0.42), m('l.hw.twine'), { ...o, bevel: 0.4 });
      },
      shin(r, shin, _foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const w = c.body.shinR + 0.5, x = c.top + 0.4, ph = r.phase % 4;
        // The ragged hem over the boot cuff, straw sticking out from under it.
        r.fill(tuft(shin, x + 0.6, 0, -0.1 + [0, 0.05, 0.1, 0.05][ph], 2.8, 2.6, 5, 0.42, c.far ? 2 : 6), m('l.hw.straw'), { ...o, bevel: 0.4, toneBias: c.bias - (c.far ? 1 : 0) });
        r.fill(shin.poly([x + 1.6, -w, x + 1.6, w, x - 0.3, w, x + 0.4, w * 0.4, x - 0.5, -w * 0.1, x + 0.3, -w * 0.6, x - 0.2, -w]), m('legLeather'), { ...o, bevel: 1, local: shin });
        r.fill(shin.cap(x + 1.2, -w - 0.2, x + 1.3, w + 0.2, 0.4), m('l.hw.twine'), { ...o, bevel: 0.4 });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Hallow Treads
// -----------------------------------------------------------------------------

function hallowTreads(): SkinArt {
  // Black leather boots with long toes curling up to a point, a plum cuff, a gold buckle set with an amber gem
  // and a little bat wing at each ankle, beating.
  return {
    mats: {
      shadow: R(LEATHER, { tex: (x) => (wrap(x, 2.4) < 0.4 ? -1 : 0) }), shadowGlow: R(PLUM, { tex: plaid }),
      'b.hw.leather': R(LEATHER), 'b.hw.gold': gold(), 'b.hw.gem': amber(), 'b.hw.bat': R([0x16101e, 0x2a1c38, 0x44305a, 0x624a7e, 0x8a72a8]), 'b.hw.batHi': R(PLUM),
    },
    boots: {
      height: 0.64, bulk: 0.32,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w, T = c.toe;
        // The toe drawn out long and curling up to a point.
        r.fill(foot.poly([T - 2.4, -1.4, T + 0.6, -1.2, T + 2.4, -0.4, T + 3.4, 1, T + 3, 2.2, T + 2.2, 1.4, T + 1.8, 0.4, T, 0.6, T - 2.4, 0.9]), m('b.hw.leather'), { ...o, bevel: 0.9 });
        r.dot(foot.x(T + 3, 2.1), foot.y(T + 3, 2.1), m('b.hw.gold'), 4, c.g);
        // The buckle over the instep with its amber gem.
        r.fill(foot.rect(0.8, 0.9, 0.9, 0.75, 0.15), m('b.hw.gold'), { ...o, bevel: 0.5 });
        r.dot(foot.x(0.8, 0.9), foot.y(0.8, 0.9), m('b.hw.gem'), ph === 1 ? 4 : 3, c.g);
        if (c.far) return;
        // A bat wing at the back of the ankle, beating.
        const lift = [-0.35, 0.05, 0.4, 0.05][ph];
        const W = new Xf(shin.x(c.top * 0.62, -w + 0.2), shin.y(c.top * 0.62, -w + 0.2), 0);
        const wg = batWing(W, 0, 0, -1, 5.6, lift);
        r.fill(wg.shape, m('b.hw.bat'), { ...o, bevel: 0.7 });
        for (const [ax, ay, bx, by] of wg.bones.slice(0, 3)) r.line(W.x(ax, ay), W.y(ax, ay), W.x(bx, by), W.y(bx, by), m('b.hw.batHi'), 3, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const A = {
  leaf: [css(0xe0602a), css(0xb8361a), css(0xf0c848), css(0x8a4a1a), css(0xf8962e)],
  rind: css(RIND[2]), rindHi: css(RIND[3]), rindDk: css(RIND[1]), stem: css(STEM[3]),
  fire: css(FIRE[3]), hot: css(HOT), bat: css(BAT[1]), batHi: css(BAT[3]),
};

/** A small jack-o'-lantern sitting on the ground at (px, py), its face flickering. */
function groundJack(g: CanvasRenderingContext2D, px: number, py: number, t: number, k: number): void {
  g.fillStyle = A.rindDk; g.fillRect(px - 3, py - 3, 7, 3);
  g.fillStyle = A.rind; g.fillRect(px - 2, py - 4, 5, 4); g.fillRect(px - 3, py - 2, 7, 1);
  g.fillStyle = A.rindHi; g.fillRect(px - 1, py - 4, 1, 1);
  g.fillStyle = A.stem; g.fillRect(px, py - 5, 1, 1);
  const f = 0.75 + Math.sin(t * 9 + k * 2.1) * 0.15 + Math.sin(t * 23 + k) * 0.1;
  g.globalAlpha = f;
  g.fillStyle = A.fire; g.fillRect(px - 2, py - 3, 1, 1); g.fillRect(px + 2, py - 3, 1, 1); g.fillRect(px - 1, py - 1, 3, 1);
  g.globalAlpha = 1;
}

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function hallowAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  // Fallen leaves swirling round the feet on the wind, tumbling as they go.
  const step = Math.floor(t * 6);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + t * 0.7, s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const rad = 14 + (i % 3) * 1.5;
    const px = Math.round(x + Math.cos(a) * rad), py = Math.round(y + s * 3.6) - (i % 2);
    const flat = (step + i) % 3;
    g.fillStyle = A.leaf[i % 5];
    g.fillRect(px, py, 1, 1);
    g.fillRect(px + (flat === 0 ? 1 : 0), py + (flat === 1 ? -1 : 0), 1, 1);
  }
  // Two jack-o'-lanterns sitting on the ground, one behind and one in front.
  if (layer === 'back') groundJack(g, x - 15, y - 3, t, 0);
  else groundJack(g, x + 16, y + 3, t, 1);
  // Bats circling up round the fighter, wings beating.
  for (let k = 0; k < 2; k++) {
    const u = (t * 0.22 + k * 0.5) % 1;
    const a = u * Math.PI * 4 + k * 2;
    const s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const px = Math.round(x + Math.cos(a) * (15 - u * 4)), py = Math.round(y - 14 - u * 30 + s * 3);
    g.globalAlpha = u < 0.1 ? u / 0.1 : u > 0.85 ? (1 - u) / 0.15 : 1;
    const up = Math.floor(t * 10 + k * 3) % 2 === 0;
    g.fillStyle = A.bat;
    g.fillRect(px, py, 1, 2);
    g.fillRect(px - 2, up ? py - 1 : py + 1, 2, 1); g.fillRect(px + 1, up ? py - 1 : py + 1, 2, 1);
    g.fillRect(px - 1, py, 1, 1); g.fillRect(px + 1, py, 1, 1);
    g.fillStyle = A.batHi; g.fillRect(px - 3, up ? py - 2 : py + 1, 1, 1); g.fillRect(px + 3, up ? py - 2 : py + 1, 1, 1);
  }
  g.globalAlpha = 1;
}

export const HALLOW: Record<string, SkinArt> = {
  'soul_scythe.hallow': { weapon: harvestScythe, ...FX },
  'bolas.hallow': { weapon: pumpkinBolas, proj: { bolas: bolasProj }, ...FX },
  'wisp_lantern.hallow': jackOLantern,
  'dread_helm.hallow': pumpkinHead(),
  'shadow_garb.hallow': scarecrowRags(),
  'leather_leggings.hallow': patchworkTrousers(),
  'shadow_treads.hallow': hallowTreads(),
};
