import { ring, type Layer } from '../../auraKit';
import { css } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import type { BodySpec } from '../body';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, mats, Q, wrap } from './kit';

/**
 * Epic set: Olympian. The gods of Olympus: white marble veined in grey,
 * polished bronze, gold laurel, Zeus's thunderbolt crackling pale blue, and a
 * crimson cloak streaming in the wind. Marble and bronze carry the shapes;
 * the light lives only in the thunderbolts, a few sapphire-blue sparks.
 */

/** White marble: cool grey-violet shadows so the white still has form. */
const MARBLE = [0x6a6676, 0xa4a0b0, 0xd4d0d6, 0xf0ece6, 0xffffff];
/** Polished bronze, warm and deep. */
const BRONZE = [0x4a2610, 0x86501e, 0xc4843a, 0xeab866, 0xfff2c0];
/** Laurel gold: brighter and yellower than the bronze. */
const GOLD = [0x6a4610, 0xa8801c, 0xe2b836, 0xf8e070, 0xfffbd8];
/** Crimson wool for the cloak, the crest, ribbons and the chiton. */
const CRIMSON = [0x34060e, 0x640c16, 0xa01a22, 0xd03430, 0xf8705a];
/** Zeus's lightning (self-lit: glow draws at tone 3, so the colour sits there). */
const BOLT = [0x2a5ad0, 0x4a9cff, 0x8ad0ff, 0xd8f2ff, 0xffffff];
/** White leather for the pteruges and sandals. */
const LEATHER = [0x7a6a5a, 0xb4a48c, 0xe0d4bc, 0xf6eedc, 0xffffff];
/** White feathers of Hermes' wings. */
const FEATHER = [0x7a82a2, 0xaab2cc, 0xdce2f0, 0xf4f6fc, 0xffffff];
const WHITE = 0xffffff;

/** Grey veins wandering through marble (any space), sparse. */
const veins = (seed = 0): Tex => (x, y) => {
  const v = Math.sin(x * 0.42 + Math.sin(y * 0.55 + seed) * 1.9 + y * 0.28) + Math.sin(y * 0.31 - x * 0.17 + seed * 2) * 0.5;
  return Math.abs(v) < 0.075 ? -1 : 0;
};
/** A glint sliding along polished metal, one step per frame. */
const sheen = (period = 8, speed = 2, w = 1.1): Tex => (x, y, ph) => (wrap(x + y * 0.4 - ph * speed, period) < w ? 1 : 0);
/** A light breathing over the four-frame loop. */
const breathe: Tex = (_x, _y, ph) => [0, 1, 0, -1][ph % 4];
/** Lightning flicker: a cell or two flashes white each frame. */
const crackle: Tex = (x, y, ph) => (hash(Math.floor(x) + ph * 17, Math.floor(y) - ph * 5) < 0.18 ? 1 : 0);
/** Wool: fine strands. */
const strands: Tex = (x, y) => (wrap(x * 1.3 + y * 0.25, 1.5) < 0.5 ? -1 : 0);

const marble = (seed = 0, o: Partial<MaterialSpec> = {}): MaterialSpec => ({ base: MARBLE[2], ramp: MARBLE, shiny: true, step: 0.14, tex: veins(seed), ...o });
const bronze = (tex: Tex | undefined = sheen()): MaterialSpec => ({ base: BRONZE[2], ramp: BRONZE, shiny: true, tex });
const gold = (tex?: Tex): MaterialSpec => ({ base: GOLD[2], ramp: GOLD, shiny: true, tex });
const crimson = (tex?: Tex): MaterialSpec => ({ base: CRIMSON[2], ramp: CRIMSON, tex });
const bolt = (tex: Tex | undefined = crackle): MaterialSpec => ({ base: BOLT[3], ramp: BOLT, glow: true, tex });

/** Head-space outline groups for the helm's crest (above the body's own). */
const GH = 60;

const FX = epicFx(0xfff4c8, 0x5ab4ff, 'twinkle', 0xfff0c8);

/** Particles the full set sheds in battle: gold-white twinkles and blue sparks. */
export const OLYMPIAN_FX: SkinFx = { spark: 0xfff6c0, spark2: 0x4ab0ff, kind: 'twinkle' };

// -----------------------------------------------------------------------------
// Shared shapes
// -----------------------------------------------------------------------------

/** A frame at (x, y) of frame P pointing along local angle `a` (P's own handedness kept). */
function sub(P: Xf, x: number, y: number, a: number, s = 1): Xf {
  const flip = Math.sign(P.sx * P.sy) || 1;
  return new Xf(P.x(x, y), P.y(x, y), P.ang + a * flip, Math.abs(P.sx) * s, Math.abs(P.sy) * flip * s);
}

/** A ring as a polygon (stays round in squashed frames). */
function hoop(F: Xf, cx: number, cy: number, rx: number, ry: number, w: number, n = 28): Shape {
  const out: number[] = [], inn: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    inn.push(cx + Math.cos(a) * (rx - w), cy + Math.sin(a) * (ry - w));
  }
  const pts = [...out];
  for (let i = inn.length - 2; i >= 0; i -= 2) pts.push(inn[i], inn[i + 1]);
  return F.poly(pts);
}

/** A laurel leaf at (x, y) pointing along angle `a`. */
function leaf(F: Xf, x: number, y: number, a: number, len: number, w: number): Shape {
  const c = Math.cos(a), s = Math.sin(a);
  const p = (u: number, v: number) => [x + c * u - s * v, y + s * u + c * v];
  return F.poly([...p(0, 0), ...p(len * 0.35, w), ...p(len, 0), ...p(len * 0.35, -w)]);
}

/** One feather in its own frame (x from the quill to the tip). */
function featherShape(F: Xf, len: number, w: number): Shape {
  return F.poly([0, -w * 0.5, len * 0.35, -w, len * 0.8, -w * 0.85, len, -w * 0.1, len * 0.95, w * 0.45, len * 0.7, w * 0.95, len * 0.3, w * 0.9, 0, w * 0.5]);
}

/**
 * Zeus's thunderbolt (keraunos) along local x in frame F, centred on (cx, cy):
 * a spindle grip and two zigzag prongs, the far one turned half round.
 */
function keraunos(F: Xf, cx: number, cy: number, len: number, w: number): Shape {
  const half = (s: number) => {
    const p = [0, w * 0.55, len * 0.38, w * 0.95, len * 0.3, w * 0.15, len * 0.72, w * 0.55, len, 0, len * 0.6, -w * 0.25, len * 0.66, -w * 0.85, len * 0.26, -w * 0.45, 0, -w * 0.55];
    return F.poly(p.map((v, i) => (i % 2 ? cy + v * s : cx + v * s)));
  };
  return union(half(1), half(-1), F.ell(cx, cy, len * 0.14, w * 0.42));
}
/** The glowing core of a keraunos: the zigzag running down its middle, both ways. */
function keraunosCore(r: Raster, F: Xf, cx: number, cy: number, len: number, w: number, mat: number, tone: number, g: number): void {
  const p = [[0, 0], [len * 0.34, w * 0.42], [len * 0.4, -w * 0.05], [len * 0.82, w * 0.12]];
  for (const s of [1, -1]) {
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i], [bx, by] = p[i + 1];
      r.line(F.x(cx + ax * s, cy + ay * s), F.y(cx + ax * s, cy + ay * s), F.x(cx + bx * s, cy + by * s), F.y(cx + bx * s, cy + by * s), mat, tone, g);
    }
  }
}

/** A jagged lightning line through raster-space points of frame F. */
function zigzag(r: Raster, F: Xf, pts: number[], mat: number, tone: number, g: number): void {
  for (let i = 0; i < pts.length - 2; i += 2) r.line(F.x(pts[i], pts[i + 1]), F.y(pts[i], pts[i + 1]), F.x(pts[i + 2], pts[i + 3]), F.y(pts[i + 2], pts[i + 3]), mat, tone, g);
}

/** The torso's main volumes (as the figure draws them), for clipping engraving to it. */
function torsoBody(T: Xf, b: BodySpec, top: number): Shape {
  return union(
    T.ell(0.3, 0.6, b.hipW, 3.6),
    T.ell(0.5, top * 0.46, b.waistW, top * 0.28),
    T.ell(b.chestPush * 0.7, top - 3.4, b.chestW, 5.4),
  );
}

// -----------------------------------------------------------------------------
// Dory of Olympus
// -----------------------------------------------------------------------------

function dory(): WeaponArt {
  // A white marble-pale shaft banded in bronze, a broad leaf-shaped bronze head with lightning living in its
  // midrib, a gold laurel collar at the socket, crimson ribbons streaming back in the wind and a bronze butt spike.
  return {
    tip: 44,
    grip2: 13,
    mats: {
      shaft: material(marble(1, { tex: (x, y) => (wrap(x * 0.5 + y * 0.8, 6) < 0.6 ? -1 : 0) })),
      band: material(bronze(sheen(7, 1.75))),
      head: material(bronze(sheen(14, 3.5, 0.9))),
      gold: material(gold(sheen(6, 1.5, 1))),
      wrap: material(crimson((x) => (wrap(x, 1.2) < 0.4 ? -1 : 0))),
      ribbon: material(crimson()),
      bolt: material(bolt()),
      spark: material({ base: WHITE, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      const sw = [0, 0.6, 1, 0.5][ph];
      // Two crimson ribbons tied below the head, streaming back along the shaft and rippling.
      fillAll(r, [t.poly([31.4, -0.6, 29, -2.2 - sw * 0.3, 26.2, -2.8 + sw * 0.5, 23.2 - sw, -3.6 + sw * 0.2, 24.6, -2.2 + sw * 0.4, 21.6 - sw * 1.2, -2.6 - sw * 0.3, 25.2, -1.2, 28.6, -0.8])], m('ribbon'), o, 0.8, -1);
      fillAll(r, [t.poly([31.4, -1, 29.4, -3.6 - sw * 0.2, 27.6, -5.4 + sw * 0.6, 25.4 - sw * 0.8, -5.8 + sw * 0.4, 27.2, -4.2 + sw * 0.3, 28.8, -2])], m('ribbon'), o, 0.8);
      // The shaft and its butt spike.
      fillAll(r, [t.cap(-19.6, 0, 33, 0, 1.05)], m('shaft'), o, 1);
      fillAll(r, [t.poly([-19.2, -1.25, -21, -1.05, -24.4, 0, -21, 1.05, -19.2, 1.25])], m('head'), o, 1);
      fillAll(r, [t.rect(-19.2, 0, 0.5, 1.4), t.rect(-12, 0, 0.45, 1.3), t.rect(20, 0, 0.45, 1.3)], m('band'), o, 0.8);
      // The grip, bound in crimson cord between two bronze rings.
      fillAll(r, [t.cap(-2.4, 0, 2.4, 0, 1.2)], m('wrap'), o, 1);
      fillAll(r, [t.rect(-2.8, 0, 0.4, 1.35), t.rect(2.8, 0, 0.4, 1.35)], m('band'), o, 0.6);
      // The socket flaring into the head.
      fillAll(r, [t.poly([31.2, -1.25, 33.6, -0.95, 34.2, -1.3, 34.2, 1.3, 33.6, 0.95, 31.2, 1.25])], m('band'), o, 0.9);
      // The head: a broad leaf, its widest part low, a sharp long point.
      fillAll(r, [t.poly([33.8, -1.2, 35.4, -2.5, 37.4, -2.9, 39.6, -2.3, 44, 0, 39.6, 2.3, 37.4, 2.9, 35.4, 2.5, 33.8, 1.2])], m('head'), o, 1.4);
      // Lightning in the midrib, a pulse running up it toward the point.
      zigzag(r, t, [34.6, 0, 36.4, 0.5, 37.6, -0.4, 39.4, 0.3, 41, -0.1, 42.8, 0], m('bolt'), ph === 3 ? 4 : 3, g);
      r.dot(t.x(35.6 + ph * 1.8, ph % 2 ? 0.3 : -0.2), t.y(35.6 + ph * 1.8, ph % 2 ? 0.3 : -0.2), m('spark'), 3, g);
      // A gold laurel collar at the socket: three leaves each side swept back.
      for (const s of [-1, 1]) {
        const ls: Shape[] = [];
        for (let i = 0; i < 3; i++) ls.push(leaf(t, 33.2 - i * 1.2, s * (1 + i * 0.15), s > 0 ? Math.PI - 0.55 : Math.PI + 0.55, 2.2, 0.62));
        r.fill(union(...ls), m('gold'), { group: s < 0 ? 44 : 45, bevel: 0.6, toneBias: o.toneBias, local: o.local });
      }
      fillAll(r, [t.rect(33.4, 0, 0.45, 1.4)], m('gold'), o, 0.5);
      // A spark leaping off the point on the pulse's crest.
      if (ph === 3) {
        r.dot(t.x(44.8, 0), t.y(44.8, 0), m('spark'), 3, g);
        r.dot(t.x(43.6, 1.8), t.y(43.6, 1.8), m('bolt'), 3, g);
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Aspis of the Gods
// -----------------------------------------------------------------------------

function aspis(): WeaponArt {
  // A great round hoplite shield: a broad polished bronze rim, a white marble band ringed with a gold laurel
  // wreath, a crimson field, and on it Zeus's thunderbolt in gold with lightning running through its heart.
  return {
    tip: 10,
    mats: {
      rim: material(bronze(sheen(7, 1.75, 1.2))),
      band: material(marble(2)),
      face: material(crimson((x, y) => (Math.hypot(x, y) % 2.4 < 0.5 ? -1 : 0))),
      gold: material(gold(sheen(6, 1.5, 1))),
      leaf: material(gold()),
      bolt: material(bolt()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      const cx = 1.2, R = 8.6;
      fillAll(r, [t.circ(cx, 0, R)], m('rim'), o, 2.2);
      r.fill(t.circ(cx, 0, R - 1.5), m('band'), { group: g, bevel: 2.6, toneBias: o.toneBias, noLine: true, local: o.local });
      // The laurel wreath on the marble band: leaves in pairs, all pointing one way round.
      const ls: Shape[] = [];
      const n = 14;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + 0.2, rr = R - 2.3;
        const x = cx + Math.cos(a) * rr, y = Math.sin(a) * rr;
        ls.push(leaf(t, x, y, a + Math.PI / 2 + 0.5, 1.7, 0.5));
      }
      r.fill(union(...ls), m('leaf'), { group: g, bevel: 0.5, toneBias: o.toneBias, noLine: true, local: o.local });
      // The crimson field, a gold rim round it.
      r.fill(hoop(t, cx, 0, R - 3.1, R - 3.1, 0.6), m('gold'), { group: g, bevel: 0.6, toneBias: o.toneBias, noLine: true, local: o.local });
      r.fill(t.circ(cx, 0, R - 3.6), m('face'), { group: g, bevel: 2, toneBias: o.toneBias, noLine: true, local: o.local });
      // The thunderbolt across the field, along the shield's long axis.
      r.fill(keraunos(t, cx, 0, 5, 2.3), m('gold'), { group: g, bevel: 0.7, toneBias: o.toneBias, local: o.local });
      keraunosCore(r, t, cx, 0, 5, 2.3, m('bolt'), ph === 2 ? 4 : 3, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Pillar of Zeus (thunder totem)
// -----------------------------------------------------------------------------

/** Draws with materials looked up by name: `m(k)` gives the raster handle. */
type Draw = (r: Raster, t: Xf, m: (k: string) => number, f: number) => void;

const PZ_SPECS: Record<string, MaterialSpec> = {
  'z.marble': marble(3, { tex: (x) => (wrap(x + 0.5, 1.8) < 0.55 ? -1 : 0) }),
  'z.stone': marble(4),
  'z.bronze': bronze(sheen(6, 1.5, 1)),
  'z.gold': gold(sheen(5, 1.25, 1)),
  'z.leaf': gold(),
  'z.cloth': crimson((x, y) => (Math.sin(x * 0.9 + y * 0.3) > 0.8 ? -1 : 0)),
  'z.bolt': { base: 0x9ad8ff, ramp: [0x2a5ad0, 0x4a9cff, 0x6ab8ff, 0x9ad8ff, 0xffffff], glow: true, tex: crackle },
  'z.boltHot': { base: WHITE, glow: true, ramp: [0x8ad0ff, 0xd8f2ff, 0xffffff, 0xffffff, 0xffffff] },
  'z.vein': bolt(breathe),
};
const PZ = mats(PZ_SPECS);

/** A pixel at local (x, y). */
const px = (r: Raster, t: Xf, x: number, y: number, m: number, tone: number, g?: number) => r.dot(t.x(x, y), t.y(x, y), m, tone, g);

/**
 * The Pillar of Zeus (origin at its base, y up): a stepped marble plinth, a
 * fluted white column, an Ionic capital with bronze volutes, a crimson banner
 * tied under it streaming in the wind, and above it the thunderbolt floating
 * upright in a gold laurel wreath. `f` 0..3 rests (sparks crawl, the banner
 * ripples), 4..7 strikes (the bolt flares, lightning runs down the flutes).
 */
const pillar: Draw = (r, t, m, f) => {
  const hot = f >= 4, ph = f & 3;
  const marbleM = m('z.marble'), stone = m('z.stone'), brz = m('z.bronze'), gld = m('z.gold');
  const boltM = m('z.bolt'), boltHot = m('z.boltHot');
  // The banner behind the column, tied under the capital and streaming off to the back, its tail forked.
  const wv = (k: number) => Math.sin(ph * Q + k * 1.4) * 0.7;
  r.fill(t.poly([
    -1.6, 19.6, -5 , 19.8 + wv(0) * 0.4, -8.4, 19 + wv(1), -11.6, 19.6 + wv(2), -10.4, 17.2 + wv(2), -11.8, 15 + wv(3),
    -8.2, 15.6 + wv(1), -4.8, 15 + wv(0) * 0.5, -1.6, 16.2,
  ]), m('z.cloth'), { group: 2, bevel: 1.2, softLight: true });
  r.line(t.x(-2, 19.4), t.y(-2, 19.4), t.x(-2, 16.4), t.y(-2, 16.4), gld, 3, 2);
  // The plinth: two marble steps.
  r.fill(t.rect(0, 1, 6.6, 1), stone, { group: 4, bevel: 1 });
  r.fill(t.rect(0, 2.8, 5.4, 0.9), stone, { group: 4, bevel: 0.8 });
  // The base moulding and the fluted shaft, swelling a touch (entasis).
  r.fill(t.rect(0, 4.3, 4.2, 0.7, 0.3), brz, { group: 5, bevel: 0.6 });
  r.fill(t.poly([-3.3, 4.8, -3.5, 11, -3.2, 18.6, 3.2, 18.6, 3.5, 11, 3.3, 4.8]), marbleM, { group: 5, bevel: 2.4, local: t });
  // Striking: lightning runs down two flutes into the plinth.
  if (hot) {
    const x = ph % 2 ? 1.2 : -1, j = ph & 2 ? 0.9 : -0.9;
    zigzag(r, t, [x, 18.4, x + j, 16.2, x - j, 13.4, x + j * 0.6, 11.6, x - j, 8.6, x + j, 6.4, x, 5], boltHot, 3, 6);
  } else px(r, t, ph % 2 ? -1.6 : 1.4, 6 + ph * 3, m('z.vein'), 3, 6);
  // The capital: an echinus band, the abacus slab on top, bronze volutes curling at each end.
  r.fill(t.rect(0, 19.2, 3.8, 0.7), brz, { group: 7, bevel: 0.6 });
  r.fill(t.rect(0, 20.6, 4.6, 0.8, 0.2), stone, { group: 7, bevel: 0.8 });
  for (const s of [-1, 1]) {
    r.fill(subtract(t.circ(s * 4.4, 19.4, 1.65), t.circ(s * 4.2, 19.5, 0.5)), brz, { group: 8, bevel: 0.8 });
  }
  r.fill(t.rect(0, 21.9, 5, 0.55), gld, { group: 8, bevel: 0.5 });
  // Two gold laurel boughs rising from the capital, cradling the thunderbolt.
  const wy = 27.2, wr = 4.4;
  const ls: Shape[] = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 - s * (0.75 + k * 0.6);
      const x = Math.cos(a) * wr, y = wy + Math.sin(a) * wr;
      ls.push(leaf(t, x, y, a - s * (Math.PI / 2 + 0.5), 2.4, 0.8));
    }
  }
  r.fill(union(...ls), m('z.leaf'), { group: 9, bevel: 0.7 });
  r.fill(t.circ(0, wy - wr + 0.4, 0.8), m('z.cloth'), { group: 9, bevel: 0.5 });
  // The thunderbolt floating upright above the capital, bobbing: a jagged blade of light with a white-hot
  // core, bigger and whiter when it strikes.
  const bob = [0, 0.4, 0.6, 0.3][ph];
  const k0 = hot ? 1.12 : 1;
  const B = new Xf(t.x(0, 23.4 + bob), t.y(0, 23.4 + bob), 0, k0, k0);
  r.fill(B.poly([-0.6, 11, 2.6, 11, 0.8, 6.8, 3, 6.8, -1.4, 0, -0.2, 5, -2.4, 5]), hot ? boltHot : boltM, { group: 10 });
  zigzag(r, B, [0.9, 10.2, -0.6, 5.8, 1.6, 6, -0.8, 1.6], hot ? boltM : boltHot, 3, 10);
  // Its tip burns: the highest self-lit point is where the totem strikes from.
  px(r, B, 1.2, 12, hot ? boltHot : boltM, 3, 11);
  if (hot) {
    // Arcs crackle from the bolt to the wreath and spark off the tips.
    const k = ph & 1 ? 1 : -1;
    zigzag(r, t, [1.6, wy + 6, 3.4, wy + 5 + k * 0.6, 4.6, wy + 6.6, 6, wy + 5], boltHot, 3, 11);
    zigzag(r, t, [-1.2, wy + 1, -3.2, wy + 1.6 - k * 0.6, -4.4, wy + 0.4, -6, wy + 1.4], boltM, 3, 11);
    px(r, t, 2.2 + k, wy + 9.6, boltHot, 3, 11);
  } else {
    // A spark crawling round the wreath.
    const a = Math.PI / 2 + ph * (Math.PI / 2) + 0.4;
    px(r, t, Math.cos(a) * (wr + 0.2), wy + Math.sin(a) * (wr + 0.2), boltM, 3, 11);
  }
};

/** The charm that rides along: a small marble column with the gold thunderbolt on top (origin at its middle). */
const pillarCharm: Draw = (r, t, m) => {
  r.fill(t.rect(0, -4, 2.6, 0.7), m('z.stone'), { group: 1, bevel: 0.6 });
  r.fill(t.rect(0, -0.6, 1.7, 2.9), m('z.marble'), { group: 2, bevel: 1.2, local: t });
  r.fill(t.rect(0, 2.6, 2.6, 0.6), m('z.bronze'), { group: 3, bevel: 0.5 });
  const B = new Xf(t.x(0, 3.2), t.y(0, 3.2), 0, 0.6, 0.6);
  r.fill(B.poly([-0.6, 11, 2.6, 11, 0.8, 6.8, 3, 6.8, -1.4, 0, -0.2, 5, -2.4, 5]), m('z.bolt'), { group: 4 });
  for (const s of [-1, 1]) r.fill(leaf(t, s * 1.4, 3.2, Math.PI / 2 + s * 0.9, 2, 0.6), m('z.leaf'), { group: 4, bevel: 0.5 });
};

const pillarSkin: SkinArt = {
  mats: {
    ...PZ_SPECS,
    // Stock names: anything still drawn the stock way comes out marble, gold and lightning.
    totemWood: marble(5), totemPaint: gold(), totemRed: crimson(),
    hawkLight: { base: MARBLE[3], ramp: MARBLE }, beak: gold(), eye: { base: BRONZE[0] },
    storm: bolt(undefined), stormHot: { base: WHITE, glow: true },
  },
  glow: [0xeaf6ff, 0x3a8aff],
  icon(r, t, m) {
    pillar(r, new Xf(t.x(0, -15), t.y(0, -15), 0, 1, 1), m, 4);
  },
  proj: {
    totem: {
      frames: 8, outline: true,
      draw: (r, t, f, h) => pillar(r, t, (k) => h(PZ[k]), f),
    } satisfies ProjArt,
    charm: {
      frames: 1, outline: true,
      draw: (r, t, f, h) => pillarCharm(r, t, (k) => h(PZ[k]), f),
    } satisfies ProjArt,
  },
};

// -----------------------------------------------------------------------------
// Corinthian Helm
// -----------------------------------------------------------------------------

function corinthian(): SkinArt {
  // A bronze Corinthian helm closing over the face, the eyes peering out of almond openings either side of
  // the nasal, embossed gold brows, a lightning-bolt sigil on the cheek piece, and a towering crimson
  // horsehair crest on a gold holder, its tail streaming back in the wind.
  return {
    head: () => ({
      mats: {
        'h.ol.bronze': material(bronze(sheen(7, 1.75, 1))),
        'h.ol.dark': material({ base: BRONZE[1], ramp: BRONZE, shiny: true }),
        'h.ol.gold': material(gold(sheen(6, 1.5, 1))),
        'h.ol.crest': material(crimson(strands)),
        'h.ol.crestHi': material({ base: CRIMSON[3], ramp: CRIMSON }),
        'h.ol.shadow': material({ base: 0x24140c, ramp: [0x0e0806, 0x1a0e08, 0x24140c, 0x3a2414, 0x5a3a20] }),
        'h.ol.eye': material({ base: BOLT[3], ramp: BOLT, glow: true }),
      },
      draw(r, H, m, g, sway) {
        const s = sway * 1.4, ph = r.phase % 4, fl = [0, 0.4, 0.7, 0.3][ph];
        const brz = m('h.ol.bronze'), dark = m('h.ol.dark'), gld = m('h.ol.gold');
        // The crest's tail streaming far back behind the head (behind the helm itself).
        const tail = H.poly([
          -4.4, 10.6, -8.6 - s * 0.4, 10.2 + fl * 0.3, -12.4 - s, 7.6 + fl * 0.6, -14.6 - s * 1.3, 3.6 + fl, -15.2 - s * 1.5, 0.2 + fl * 1.2,
          -13.6 - s * 1.3, 2 + fl * 0.8, -13.4 - s * 1.2, -0.6 + fl, -11.8 - s, 3.6 + fl * 0.5, -9.4 - s * 0.6, 5.8, -6.4, 6.6,
        ]);
        r.fill(tail, m('h.ol.crest'), { group: GH, bevel: 1.4, toneBias: -1, local: H });
        // The helm: dome and neck guard, cheek pieces sweeping down to a point at the chin.
        const shell = union(
          H.ell(-0.4, 1, 6.9, 6.9),
          H.poly([-6.4, 2, -9 - s * 0.2, -2.8, -7.2, -4.2, -3.6, -2.6]),
          H.poly([0.2, 1, 6.4, 2.2, 7.8, -0.6, 7.4, -4.4, 6.4, -6.8, 4.2, -7.4, 1.6, -6.4, -1.8, -3.6]),
        );
        r.fill(shell, brz, { group: g, bevel: 3, local: H });
        // The T opening in shadow: almond eye holes either side of the nasal, a slot down between the cheek
        // pieces, and the eyes glinting pale blue in the dark.
        const shadow = m('h.ol.shadow');
        r.fill(H.poly([0.5, 0.7, 1.6, 1.3, 3, 0.9, 3, -0.7, 1.6, -1.2, 0.6, -0.5]), shadow, { group: g, flat: 1, noLine: true });
        r.fill(H.poly([4.2, 0.9, 5.6, 1.3, 7.2, 0.7, 7.6, -0.4, 5.6, -0.9, 4.2, -0.5]), shadow, { group: g, flat: 1, noLine: true });
        r.fill(H.poly([5.1, -1.9, 6.7, -2, 6.3, -6.2, 5.5, -6.4]), shadow, { group: g, flat: 1, noLine: true });
        r.dot(H.x(2, 0), H.y(2, 0), m('h.ol.eye'), ph === 2 ? 4 : 3, g);
        r.dot(H.x(5.6, 0), H.y(5.6, 0), m('h.ol.eye'), 3, g);
        // Embossed gold brows arching over the eyes, meeting at the nasal.
        r.line(H.x(0.4, 1.9), H.y(0.4, 1.9), H.x(1.8, 2.6), H.y(1.8, 2.6), gld, 3, g);
        r.line(H.x(1.8, 2.6), H.y(1.8, 2.6), H.x(3.6, 2), H.y(3.6, 2), gld, 3, g);
        r.line(H.x(3.6, 2), H.y(3.6, 2), H.x(6.6, 2.6), H.y(6.6, 2.6), gld, 3, g);
        // A dark seam where the cheek piece is hammered back from the dome, a darker rim round the dome.
        r.fill(intersect(shell, H.poly([-1.6, 3.4, -0.8, 3.4, -0.6, -5, -1.4, -5])), dark, { group: g, flat: 1, noLine: true });
        r.fill(intersect(shell, subtract(H.ell(-0.4, 1, 6.9, 6.9), H.ell(-0.4, 1, 6.2, 6.2))), dark, { group: g, flat: 2, noLine: true });
        // The crest holder: a gold ridge along the dome from brow to nape.
        const ridge = intersect(subtract(H.ell(-0.6, 1, 7.5, 7.5), H.ell(-0.4, 1, 6.6, 6.6)), H.poly([5.6, 4.6, 5.6, 12, -9, 12, -9, 0.6]));
        r.fill(ridge, gld, { group: GH + 1, bevel: 0.8 });
        // The crest itself: a tall crescent of crimson horsehair standing on the holder, lit along its top edge.
        const arc = intersect(
          subtract(H.ell(-1.2, 2.2, 9.4, 12.2), H.ell(-0.6, 1, 7.5, 7.5)),
          H.poly([6.2, 4.6, 6.2, 18, -14, 18, -14, 3.2, -8.4, 2.4]),
        );
        r.fill(arc, m('h.ol.crest'), { group: GH + 2, bevel: 1.6, local: H });
        r.fill(intersect(arc, subtract(H.ell(-1.2, 2.2, 9.6, 12.4), H.ell(-1.2, 2, 9, 11.6))), m('h.ol.crestHi'), { group: GH + 2, flat: 3, noLine: true });
        // A gold rivet at the temple.
        r.dot(H.x(-3.4, 2.4), H.y(-3.4, 2.4), gld, 4, g);
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Olympian Cuirass
// -----------------------------------------------------------------------------

function cuirass(): SkinArt {
  // A white marble muscle cuirass, the chest and abdomen sculpted and edged in gold, a gold collar,
  // Zeus's thunderbolt over the heart; bronze bracers and belt, white pteruges at the shoulders, and a
  // great crimson cloak pinned with a gold brooch, its hem bordered in gold, streaming in the wind.
  return {
    mats: {
      'c.ol.marble': marble(6),
      plateDark: bronze(undefined),
      'c.ol.bronze': bronze(sheen(7, 1.75)),
      'c.ol.gold': gold(sheen(6, 1.5, 1)),
      'c.ol.line': { base: MARBLE[1], ramp: MARBLE },
      'c.ol.cloak': crimson((x, y) => (Math.sin(x * 0.55 + y * 0.18) > 0.82 ? -1 : 0)),
      'c.ol.hem': gold(),
      'c.ol.strip': { base: LEATHER[3], ramp: LEATHER },
      'c.ol.bolt': bolt(),
    },
    chest: {
      torso: 'c.ol.marble', sleeve: 'c.ol.cloak', sleeveLen: 0.42, forearm: 'plateDark', hands: 'plateDark',
      pauldron: null, spikes: null, cape: null, hood: null, trim: null, belt: 'c.ol.bronze',
      back(r, T, m, c) {
        // The cloak: from both shoulders, billowing back and down, the hem rippling, a gold key border at the hem.
        const s = c.sway * 3, top = c.top, ph = r.phase % 4;
        const hem: number[] = [];
        const N = 6;
        for (let i = 0; i <= N; i++) {
          const u = i / N, rip = Math.sin(ph * Q + i * 1.9) * 0.8;
          hem.push(-15.4 - s * 1.6 + u * 11.6 + s * u * 0.9 + rip * 0.4, -12.6 + u * 4.4 + rip);
        }
        const outline = [0, top + 0.9, -4.6, top + 0.6, -9.6 - s * 0.6, top - 3.6, -13.4 - s * 1.2, top - 9.4, ...hem, -1.6, -4, -1, top - 6];
        const cape = T.poly(outline);
        r.fill(cape, m('c.ol.cloak'), { group: c.g, bevel: 2.6, toneBias: -1, softLight: true });
        // A fold running down the cloak.
        r.line(T.x(-5.6, top - 1.4), T.y(-5.6, top - 1.4), T.x(-10.4 - s * 1.2, -9 + Math.sin(ph * Q) * 0.6), T.y(-10.4 - s * 1.2, -9 + Math.sin(ph * Q) * 0.6), m('c.ol.cloak'), 0, c.g);
        const inner: number[] = [];
        for (let i = hem.length - 2; i >= 0; i -= 2) inner.push(hem[i], hem[i + 1] + 1.4);
        const band = T.poly([...hem.map((v, i) => (i % 2 ? v - 1 : v)), ...inner]);
        r.fill(intersect(cape, band), m('c.ol.hem'), { group: c.g, flat: 2, noLine: true });
      },
      shoulder(r, S, m, c) {
        // A marble shoulder guard edged in gold, white leather pteruges hanging below it, bronze-tipped.
        const o = { group: c.g, toneBias: c.bias };
        for (let k = 0; k < 3; k++) {
          const x = -1.6 + k * 1.6;
          r.fill(S.rect(x, -2.6, 0.7, 2.1, 0.3), m('c.ol.strip'), { ...o, bevel: 0.6 });
          r.fill(S.rect(x, -4.4, 0.7, 0.45, 0.2), m('c.ol.bronze'), { ...o, bevel: 0.4, noLine: true });
        }
        const guard = S.ell(-0.1, 0.4, 2.9, 2);
        r.fill(guard, m('c.ol.marble'), { ...o, bevel: 1.4, local: S });
        r.fill(intersect(guard, subtract(S.ell(-0.1, 0.4, 2.9, 2), S.ell(-0.1, 0.9, 2.6, 1.9))), m('c.ol.gold'), { ...o, flat: 3, noLine: true });
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, g = c.g;
        const body = torsoBody(T, b, top);
        const x0 = b.chestPush * 0.7;
        const line = m('c.ol.line'), gld = m('c.ol.gold');
        // Sculpted muscle: the pectoral arc, the line down the sternum and the rows of the abdomen.
        const pec = intersect(body, subtract(T.ell(x0 + 0.6, top - 4.6, b.chestW - 0.8, 2.6), T.ell(x0 + 0.6, top - 3.9, b.chestW - 0.8, 2.6)));
        r.fill(pec, line, { group: g, flat: 1, noLine: true });
        r.line(T.x(x0 + 1.6, top - 6.6), T.y(x0 + 1.6, top - 6.6), T.x(x0 + 1.2, 4.2), T.y(x0 + 1.2, 4.2), line, 1, g);
        for (const yy of [top * 0.52, top * 0.38]) {
          r.line(T.x(x0 - 0.8, yy), T.y(x0 - 0.8, yy), T.x(x0 + 2.8, yy + 0.3), T.y(x0 + 2.8, yy + 0.3), line, 1, g);
        }
        // Gold collar and the thunderbolt over the heart.
        r.fill(T.cap(-3, top - 0.1, x0 + 2.4, top - 0.7, 0.62), gld, { group: g, bevel: 0.6 });
        const B = new Xf(T.x(x0 - 0.8, top - 4.2), T.y(x0 - 0.8, top - 4.2), T.ang - 0.35, 1, 1);
        r.fill(keraunos(B, 0, 0, 2.4, 1.1), gld, { group: g, bevel: 0.5 });
        r.dot(B.x(0, 0), B.y(0, 0), m('c.ol.bolt'), 3, g);
        r.dot(B.x(1.6, 0.3), B.y(1.6, 0.3), m('c.ol.bolt'), 3, g);
        // The gold lower edge of the cuirass, flaring over the hips.
        r.fill(intersect(body, T.rect(0, 3.7, 12, 0.4)), gld, { group: g, flat: 3, noLine: true });
        // The brooch pinning the cloak at the shoulder: a gold disc with a blue spark.
        const fx = -1.6, fy = top - 0.6;
        r.fill(T.circ(fx, fy, 1.15), gld, { group: g, bevel: 0.8 });
        r.dot(T.x(fx + 0.2, fy + 0.1), T.y(fx + 0.2, fy + 0.1), m('c.ol.bolt'), 3, g);
      },
      noScarf: true,
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Pteruges of Olympus
// -----------------------------------------------------------------------------

function pteruges(): SkinArt {
  // Bare thighs under a crimson chiton, and over it two tiers of white leather pteruges hanging from the
  // belt, each strip bronze-tipped and edged in gold, swinging as the warrior moves.
  return {
    mats: {
      'l.ol.chiton': crimson((x, y) => (wrap(y * 1.1 + x * 0.2, 2.2) < 0.55 ? -1 : 0)),
      'l.ol.strip': { base: LEATHER[3], ramp: LEATHER, tex: (x) => (wrap(x, 3) < 0.4 ? -1 : 0) },
      'l.ol.bronze': bronze(sheen(6, 1.5, 1)),
      'l.ol.gold': gold(),
      'l.ol.bolt': bolt(breathe),
    },
    legs: {
      mat: 'skin', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0,
      over(r, t, m, c) {
        const ph = r.phase % 4, L = c.len, w = c.w, sw = [0, 0.35, 0.6, 0.3][ph];
        const g0 = c.g + 21;
        const part = { toneBias: c.bias };
        // The chiton, its hem low on the thigh and rippling.
        const hem = L * 0.24;
        const chiton = t.poly([L + 1.2, -w - 0.5, L + 1.2, w + 1.1, hem - sw * 0.4, w + 1.7, hem + 0.8, 0, hem + 0.3, -w - 0.7]);
        r.fill(chiton, m('l.ol.chiton'), { group: g0, ...part, bevel: 1.2, softLight: true, local: t });
        // The pteruges: broad white strips side by side, flaring out over the front of the thigh, bronze-tipped,
        // each its own outline so they read apart; they swing a little out of step.
        const n = 3, y0 = -w - 0.4, span = 2 * w + 2.4, sw0 = span / n;
        for (let k = 0; k < n; k++) {
          const a0 = y0 + k * sw0, a1 = a0 + sw0 - 0.2;
          const sl = sw * (k % 2 ? 1 : 0.5), b = L * 0.42 + (k === 1 ? -0.6 : 0);
          const flare = k * 0.35;
          const strip = t.poly([L + 1, a0, L + 1, a1, b + sl * 0.3, a1 + flare + sl * 0.3, b + sl * 0.3, a0 + flare + sl * 0.3]);
          r.fill(strip, m('l.ol.strip'), { group: g0 + 1 + k, ...part, bevel: 0.8, local: t });
          r.fill(intersect(strip, t.rect(b + 0.5 + sl * 0.3, (a0 + a1) / 2 + flare, 0.6, sw0)), m('l.ol.bronze'), { group: g0 + 1 + k, ...part, flat: 3, noLine: true });
        }
        // A gold belt plate with a blue spark, on the near leg.
        if (c.far) return;
        r.fill(t.rect(L + 0.6, w * 0.4, 0.7, 1, 0.2), m('l.ol.gold'), { group: g0 + 5, ...part, bevel: 0.6 });
        r.dot(t.x(L + 0.6, w * 0.4), t.y(L + 0.6, w * 0.4), m('l.ol.bolt'), 3, g0 + 5);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Winged Sandals of Hermes
// -----------------------------------------------------------------------------

function sandals(): SkinArt {
  // Gold-laced sandals: a white leather sole, gold straps criss-crossing up the bare shin to a gold cuff,
  // and at each ankle a pair of white wings with gold leading edges, beating.
  return {
    mats: {
      'b.ol.sole': { base: LEATHER[2], ramp: LEATHER },
      'b.ol.strap': gold(),
      'b.ol.cuff': gold(sheen(5, 1.25, 1)),
      'b.ol.wing': { base: FEATHER[2], ramp: [0x8a92b4, 0xc4cce2, 0xeceff8, 0xffffff, 0xffffff], shiny: true },
      'b.ol.gem': bolt(breathe),
    },
    boots: {
      mat: 'skin', height: 0.78, bulk: 0, trim: null, wing: null, knee: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w;
        // The sole under the foot and a strap over the toes.
        r.fill(foot.cap(-1.4, -1.5, c.toe - 0.2, -1.1, 0.55, 0.5), m('b.ol.sole'), { ...o, bevel: 0.4 });
        r.line(foot.x(c.toe - 1.6, -1.2), foot.y(c.toe - 1.6, -1.2), foot.x(c.toe - 1.6, 1), foot.y(c.toe - 1.6, 1), m('b.ol.strap'), 3, c.g);
        // Straps criss-crossing up the shin to a gold cuff below the knee.
        const top = c.top;
        for (let x = 0.6, k = 0; x < top - 2; x += 2.7, k++) {
          const a = k % 2 ? w : -w, b = -a;
          r.line(shin.x(x, a), shin.y(x, a), shin.x(x + 2.7, b), shin.y(x + 2.7, b), m('b.ol.strap'), 2, c.g);
        }
        r.fill(shin.rect(top - 0.4, 0, 0.6, w + 0.3), m('b.ol.cuff'), { ...o, bevel: 0.5 });
        r.fill(shin.rect(0.6, 0, 0.55, w + 0.25), m('b.ol.cuff'), { ...o, bevel: 0.5 });
        // The wings at the ankle, sweeping back and up, beating over the loop; the far ankle's sits behind.
        const beat = [0, 0.22, 0.38, 0.18][ph];
        const fs: [number, number, number][] = [[2, 6.4, -0.45], [1.7, 5.4, -0.95], [1.4, 4.4, -1.45], [1.1, 3.4, -1.95]];
        for (const [i, [x, len, a]] of fs.entries()) {
          const F = sub(shin, x, -w + 0.1, a + beat * (1 + i * 0.35));
          r.fill(featherShape(F, len, 0.8), m('b.ol.wing'), { group: c.far ? c.g : 30 + i, bevel: 0.5, toneBias: c.bias, local: F });
        }
        // The gold leading edge of the wing, and the clasp at its root with a blue spark.
        const E = sub(shin, 2.2, -w + 0.1, -0.45 + beat);
        r.fill(E.cap(0, 0.3, 5.8, 0.5, 0.42, 0.2), m('b.ol.cuff'), { group: c.far ? c.g : 34, bevel: 0.4, toneBias: c.bias });
        r.fill(shin.circ(1.4, -w + 0.2, 0.85), m('b.ol.cuff'), { group: c.far ? c.g : 34, bevel: 0.5, toneBias: c.bias });
        if (!c.far) r.dot(shin.x(1.4, -w + 0.2), shin.y(1.4, -w + 0.2), m('b.ol.gem'), 3, 34);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = {
  gold: css(GOLD[3]), goldDk: css(GOLD[1]), marble: css(MARBLE[3]), marbleDk: css(MARBLE[1]),
  bolt: css(BOLT[2]), boltHi: css(BOLT[3]), white: css(WHITE), leaf: css(GOLD[2]), leafDk: css(0x8a7a1c), red: css(CRIMSON[3]),
};

/** A strike's jagged path: three-pixel steps that jog left or right, seeded per strike. */
const JOG = [0, 1, -1, 1, 0, -1, -1, 1, 0, 1];

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function olympianAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  const RX = 14, RY = 3.6;
  // A ring of white marble on the ground, a gold key pattern stepping round it (every third stone gold).
  const step = Math.floor(t * 3);
  ring(g, x, y, RX, RY, 30, layer, (g, px, py, i) => {
    const k = (i + step) % 6;
    g.globalAlpha = 0.75;
    g.fillStyle = k < 2 ? AC.gold : AC.marble;
    g.fillRect(px, py, 1, 1);
    if (k === 0) { g.fillStyle = AC.goldDk; g.fillRect(px, py + 1, 1, 1); }
  });
  // Every so often Zeus strikes: a bolt falls onto the ring and flashes there.
  const period = 1.7, ph = t / period, n = Math.floor(ph), u = ph - n;
  if (u < 0.28) {
    const a = n * 2.39996 + 0.7, s = Math.sin(a);
    if ((s < 0) === (layer === 'back')) {
      const bx = Math.round(x + Math.cos(a) * RX), by = Math.round(y + s * RY);
      const H = 30, fade = 1 - u / 0.28;
      g.globalAlpha = 0.5 + 0.5 * fade;
      let cx = bx + 2 * JOG[n % 10], cy = by - H;
      g.fillStyle = AC.bolt;
      for (let j = 0; j < 10; j++) {
        const d = JOG[(n + j) % 10];
        g.fillRect(cx, cy, 1, 3);
        g.globalAlpha = (0.5 + 0.5 * fade) * 0.45;
        g.fillRect(cx - d || cx + 1, cy + 1, 1, 2);
        g.globalAlpha = 0.5 + 0.5 * fade;
        cx += d;
        cy += 3;
        if (j === 4) { g.fillStyle = AC.boltHi; g.fillRect(cx + d * 2, cy, 1, 2); g.fillStyle = AC.bolt; }
      }
      g.fillStyle = AC.white;
      g.fillRect(bx - 1, by - 1, 3, 1);
      g.fillRect(bx, by - 2, 1, 3);
      g.globalAlpha = fade;
      g.fillStyle = AC.boltHi;
      g.fillRect(bx - 3, by, 1, 1); g.fillRect(bx + 3, by, 1, 1); g.fillRect(bx - 2, by - 3, 1, 1); g.fillRect(bx + 2, by - 3, 1, 1);
    }
  }
  // Gold laurel leaves blown past on the wind, tumbling, some behind the fighter, some in front.
  for (let k = 0; k < 4; k++) {
    if ((k % 2 === 0) !== (layer === 'back')) continue;
    const v = (t * 0.22 + k * 0.29) % 1;
    const px = Math.round(x + 20 - v * 40), py = Math.round(y - 6 - k * 7 + Math.sin(t * 2.4 + k * 2) * 3);
    g.globalAlpha = Math.min(1, (1 - v) * 5, v * 6) * 0.95;
    const flip = Math.floor(t * 5 + k) % 2;
    g.fillStyle = AC.leaf;
    g.fillRect(px - 1, py + flip, 2, 1);
    g.fillRect(px + 1, py + 1 - flip, 1, 1);
    g.fillStyle = AC.gold;
    g.fillRect(px, py + flip, 1, 1);
    g.fillStyle = AC.leafDk;
    g.fillRect(px - 2, py + (flip ? 1 : 0) , 1, 1);
  }
  // Blue sparks crawling up off the ring now and then (behind only), like static before the strike.
  if (layer === 'back') {
    for (let k = 0; k < 3; k++) {
      const w = (t * 0.9 + k * 0.33) % 1;
      const a = k * 2.1 + Math.floor(t * 0.9 + k * 0.33) * 1.3;
      const sx = Math.round(x + Math.cos(a) * RX * 0.9), sy = Math.round(y + Math.sin(a) * RY - w * 10);
      g.globalAlpha = (1 - w) * 0.9;
      g.fillStyle = w < 0.3 ? AC.boltHi : AC.bolt;
      g.fillRect(sx, sy, 1, 1);
    }
  }
  g.globalAlpha = 1;
}

export const OLYMPIAN: Record<string, SkinArt> = {
  'spear.olympian': { weapon: dory, ...FX },
  'kite_shield.olympian': { weapon: aspis, ...FX },
  'thunder_totem.olympian': pillarSkin,
  'gladiator_helm.olympian': corinthian(),
  'plate_armor.olympian': cuirass(),
  'warlord_faulds.olympian': pteruges(),
  'leaping_boots.olympian': sandals(),
};
