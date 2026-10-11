import { css, mix } from '../../pixel/color';
import { material, type LocalSpace, type Material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { ring, type Layer } from '../../auraKit';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { glow, mats, plain, wrap } from './kit';

/**
 * Epic set: Skybell Sanctum. The monks who keep the bells on the windswept
 * peaks: saffron robes under a maroon shawl, temple bronze gone sea-green
 * with age, wide straw hats, five-colour prayer flags snapping in the wind
 * and marigold petals carried on it. The night accents are the jade wind
 * runes: the stone in the bow's grip, the chakram's hub, the bead on the
 * hat, the mala's pendant, the knee and ankle beads and the bell's band.
 */

/** Saffron cloth: warm orange-gold. */
const SAFFRON = [0x7a3410, 0xb85e18, 0xe88a28, 0xf8b44c, 0xffe09a];
/** Maroon: the monks' shawl, lacquer and cords. */
const MAROON = [0x2e0a12, 0x52141e, 0x7a202a, 0xa0343a, 0xc8584e];
/** Temple bronze: deep brown to a pale gold glint. */
const BRONZE = [0x3e2410, 0x6e4220, 0xa46e32, 0xd8a458, 0xfbe6a8];
/** Verdigris: bronze gone sea-green with age. */
const PATINA = [0x16403c, 0x24665e, 0x3e9484, 0x6ec8b0, 0xb4f0de];
/** Jade wind runes (self-lit). */
const JADE = [0x1c7a68, 0x3cc0a4, 0x7ae8cc, 0xc4fff0, 0xffffff];
/** Woven straw. */
const STRAW = [0x6a4818, 0x9a7028, 0xc89c44, 0xe8c670, 0xfff0b8];
/** Mountain cloud. */
const CLOUD = [0x7a88a4, 0xa8b6cc, 0xd8e2ee, 0xf2f6fb, 0xffffff];
/** Unbleached cotton for the trousers. */
const COTTON = [0x7a5a3c, 0xb08e66, 0xdcc298, 0xf2e2c0, 0xfff8e8];
/** Dark wood for soles and arrow shafts. */
const WOOD = [0x24100a, 0x40200f, 0x62341a, 0x8c5028, 0xb87a44];
/** Prayer flags: blue, white, red, green, yellow. */
const FLAGS = [0x3a6ad8, 0xf2f0e6, 0xd83a34, 0x3aa858, 0xf0c038];
const WHITE = 0xffffff, WIND = 0xe8fff6, PETAL = 0xffd860, PETAL2 = 0xf09a20;

/** A jade rune swelling and dimming over the loop. */
const breathe: Tex = (_x, _y, ph) => [0, 1, 0, -1][ph % 4];
/** Lacquer with a thin gold-leaf band every so often (along local y, the limb). */
const lacquer: Tex = (_x, y) => (wrap(y, 4.4) < 0.55 ? 1 : 0);
/** Bronze catching the light in a band that slides along it. */
const sheen = (period = 9, speed = 2.2, w = 1): Tex => (x, y, ph) => (wrap(x * 0.8 + y * 0.4 - ph * speed, period) < w ? 1 : 0);
/** Cloth wound in strips. */
const wound: Tex = (x, y) => (wrap(x * 0.9 + y * 0.35, 1.5) < 0.42 ? -1 : 0);
/** Straw woven in a twill. */
const weave: Tex = (x, y) => ((wrap(x * 0.8 + y * 0.8, 1.7) < 0.55) !== (wrap(x * 0.8 - y * 0.8, 1.7) < 0.55) ? -1 : 0);
/** Robes: soft vertical folds swaying a little. */
const folds: Tex = (x, y) => (wrap(y * 0.42 + Math.sin(x * 0.45) * 0.9, 3.2) < 0.55 ? -1 : 0);
/** Tassel threads. */
const strands: Tex = (x) => (wrap(x, 1.2) < 0.4 ? -1 : 0);
/** Patina creeping over bronze in patches. */
const blotch: Tex = (x, y) => (hash(Math.floor(x * 0.7), Math.floor(y * 0.7) + 5) < 0.18 ? -1 : 0);

const S = {
  bronze: (tex: Tex = sheen()): MaterialSpec => ({ base: BRONZE[2], ramp: BRONZE, shiny: true, step: 0.15, tex }),
  patina: (tex?: Tex): MaterialSpec => ({ base: PATINA[2], ramp: PATINA, shiny: true, step: 0.14, tex }),
  jade: (tex: Tex = breathe): MaterialSpec => ({ base: JADE[2], ramp: JADE, glow: true, tex }),
  saffron: (tex?: Tex): MaterialSpec => ({ base: SAFFRON[2], ramp: SAFFRON, tex }),
  maroon: (tex?: Tex): MaterialSpec => ({ base: MAROON[2], ramp: MAROON, tex }),
  straw: (): MaterialSpec => ({ base: STRAW[2], ramp: STRAW, tex: weave }),
  cloud: (): MaterialSpec => ({ base: CLOUD[3], ramp: CLOUD }),
  wood: (tex?: Tex): MaterialSpec => ({ base: WOOD[2], ramp: WOOD, tex }),
  flag: (i: number): MaterialSpec => plain(FLAGS[i]),
};

/** Petals and the swing trail: marigolds carried on a pale wind. */
const FX: Pick<SkinArt, 'fx' | 'trail'> = {
  fx: { spark: PETAL, spark2: PETAL2, kind: 'petal' },
  trail: [WIND, mix(WIND, PATINA[3], 0.55)],
};

/** Particles the full set sheds in battle. */
export const SKYBELL_FX: SkinFx = { spark: PETAL, spark2: PETAL2, kind: 'petal' };

// -----------------------------------------------------------------------------
// Shared shapes
// -----------------------------------------------------------------------------

const dot = (r: Raster, F: Xf, x: number, y: number, m: number, tone: number, g?: number) => r.dot(F.x(x, y), F.y(x, y), m, tone, g);

/** A wind curl: a spiral of one-pixel line winding in from radius R around (cx, cy), `dir` its handedness. */
function curl(r: Raster, F: Xf, cx: number, cy: number, R: number, turns: number, a0: number, dir: number, m: number, tone: number, g: number): void {
  const n = Math.max(6, Math.round(R * turns * 5));
  let px = cx + Math.cos(a0) * R, py = cy + Math.sin(a0) * R;
  for (let i = 1; i <= n; i++) {
    const u = i / n, rr = R * (1 - u * 0.75), a = a0 + dir * u * turns * Math.PI * 2;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    r.line(F.x(px, py), F.y(px, py), F.x(x, y), F.y(x, y), m, tone, g);
    px = x; py = y;
  }
}

/** A ribbon streaming from (x, y) toward −x of F, `len` long, `w` wide, waving with `ph`. */
function ribbon(F: Xf, x: number, y: number, len: number, w: number, ph: number, amp = 0.8, droop = 0): Shape {
  const top: number[] = [], bot: number[] = [];
  for (let i = 0; i <= 5; i++) {
    const u = i / 5, wave = Math.sin(u * 4.2 - ph * (Math.PI / 2)) * amp * u, ww = w * (1 - u * 0.45);
    const px = x - len * u, py = y + wave - droop * u * u;
    top.push(px, py + ww);
    bot.unshift(px, py - ww);
  }
  // A forked end.
  const ex = x - len, ey = y + Math.sin(4.2 - ph * (Math.PI / 2)) * amp - droop;
  return F.poly([...top, ex - 0.8, ey + w * 0.6, ex - 0.2, ey, ex - 0.8, ey - w * 0.6, ...bot]);
}

/** A small temple bell hanging from (x, y) of F (its axis along −y of F), `k` its scale. */
function tinyBell(r: Raster, F: Xf, x: number, y: number, k: number, bronze: number, dark: number, g: number, bias = 0): void {
  r.fill(F.poly([x - 0.7 * k, y - 0.3 * k, x + 0.7 * k, y - 0.3 * k, x + 1.1 * k, y - 1.9 * k, x + 1.4 * k, y - 2.6 * k, x - 1.4 * k, y - 2.6 * k, x - 1.1 * k, y - 1.9 * k], 0.2), bronze, { group: g, bevel: 0.8, toneBias: bias });
  r.dot(F.x(x, y - 2.9 * k), F.y(x, y - 2.9 * k), dark, 1, g);
}

// -----------------------------------------------------------------------------
// Windsong Bow
// -----------------------------------------------------------------------------

function windsongBow(): WeaponArt {
  // A recurve of maroon lacquer banded in gold leaf, bronze cloud scrolls curling off the back of both limbs
  // (a jade eye in each), bronze-capped tips, a saffron ribbon streaming from the top and a little temple bell
  // swinging from the bottom, a grip wound in saffron cloth with a jade wind stone set in bronze.
  const recurve = 0.9;
  return {
    tip: 22,
    mats: {
      limb: material({ base: MAROON[2], ramp: MAROON, shiny: true, step: 0.14, tex: lacquer }),
      scroll: material(S.bronze(sheen(8, 2, 1))),
      cap: material(S.bronze(undefined)),
      bell: material(S.bronze(undefined)),
      bellDark: material(plain(BRONZE[0])),
      grip: material(S.saffron(wound)),
      setting: material(S.bronze(undefined)),
      jade: material(S.jade()),
      ribbon: material(S.saffron()),
      ribbon2: material(S.maroon()),
      string: material(plain(0xf2e8d0)),
      arrow: material(S.wood()),
      head: material(S.bronze(undefined)),
      fletch: material(S.saffron()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4, L = o.local;
      const pull = o.pull ?? 0;
      const bend = 2.5 + pull * 2.5;
      const path = (u: number, s: number): [number, number] => {
        const flick = Math.max(0, u - 0.74);
        return [-bend * u * u + recurve * flick * flick * 14, s * 22 * u];
      };
      const thick = (u: number) => 1.4 - u * 0.65 + (u > 0.14 && u < 0.3 ? 0.2 : 0);
      // The ribbon from the top tip, streaming back in the wind (drawn first, under the limb).
      const [tx, ty] = path(0.97, 1);
      const R = new Xf(t.x(tx, ty), t.y(tx, ty), t.ang + 0.35 * Math.sign(t.sx * t.sy || 1), t.sx, t.sy);
      r.fill(ribbon(R, -0.2, 0.4, 7.4, 0.55, ph, 0.9, 0.6), m('ribbon2'), { group: g, bevel: 0.5, toneBias: (o.toneBias ?? 0) - 1, local: L });
      r.fill(ribbon(R, -0.2, -0.3, 8.6, 0.6, ph + 1, 1.1, 1.4), m('ribbon'), { group: g, bevel: 0.5, toneBias: o.toneBias, local: L });
      // Cloud scrolls curling off the back of each limb.
      for (const s of [-1, 1]) {
        const [x, y] = path(0.5, s);
        const cl = union(
          t.circ(x + 1.5, y - s * 1.6, 1.2), t.circ(x + 2.3, y, 1.15), t.circ(x + 1.4, y + s * 1.6, 1),
          t.poly([x, y - s * 2.6, x + 1, y - s * 2.8, x + 0.6, y + s * 2.6, x - 0.2, y + s * 2]),
        );
        fillAll(r, [cl], m('scroll'), o, 1, s < 0 ? -1 : 0);
        r.dot(t.x(x + 2.3, y), t.y(x + 2.3, y), m('jade'), 3, g);
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
      // Bronze caps on the recurved tips, bronze collars where the riser meets the limbs.
      for (const s of [-1, 1]) {
        const [ax, ay] = path(0.86, s), [bx, by] = path(1, s);
        fillAll(r, [t.cap(ax, ay, bx, by, 0.85, 0.6)], m('cap'), o, 0.7);
        const [cx, cy] = path(0.18, s);
        fillAll(r, [t.rect(cx, cy, 1.55, 0.45)], m('cap'), o, 0.6);
      }
      // The grip, wound in saffron, and the jade wind stone in its bronze setting.
      fillAll(r, [t.cap(0, -2.6, 0, 2.6, 1.45)], m('grip'), o, 1);
      fillAll(r, [t.circ(1.5, 0, 1.15)], m('setting'), o, 0.6);
      r.dot(t.x(1.6, 0), t.y(1.6, 0), m('jade'), 3, g);
      // A little bell on a cord from the bottom tip, swinging.
      const [lx, ly] = path(1, -1);
      const sw = [0, 0.5, 0.8, 0.5][ph] - 0.4;
      const B = new Xf(t.x(lx - 0.2, ly - 0.4), t.y(lx - 0.2, ly - 0.4), t.ang + sw * 0.4 * Math.sign(t.sx * t.sy || 1), t.sx, t.sy);
      r.line(B.x(0, 0), B.y(0, 0), B.x(0, -1.4), B.y(0, -1.4), m('ribbon2'), 2, g);
      tinyBell(r, B, 0, -1.3, 0.9, m('bell'), m('bellDark'), g, o.toneBias ?? 0);
      // The string, and a nocked arrow with saffron fletching.
      const [ux, uy] = path(1, 1), [dx, dy] = path(1, -1);
      const st = o.stringTo ?? t.p(-bend - 0.5, 0);
      r.line(t.x(ux, uy - 0.5), t.y(ux, uy - 0.5), st[0], st[1], m('string'), 3, 9);
      r.line(st[0], st[1], t.x(dx, dy + 0.5), t.y(dx, dy + 0.5), m('string'), 3, 9);
      if (o.stringTo && pull > 0.15) {
        const hx = t.x(7, 0), hy = t.y(7, 0);
        r.line(st[0], st[1], hx, hy, m('arrow'), 3, 9);
        r.dot(hx, hy, m('head'), 4, 9);
        r.dot(t.x(7.8, 0), t.y(7.8, 0), m('head'), 3, 9);
        r.dot(st[0], st[1] - 1, m('fletch'), 3, 9);
        r.dot(st[0] - 1, st[1] - 1, m('fletch'), 2, 9);
      }
    },
  };
}

// Battle sprites (their own materials).
const PM = mats({
  wood: S.wood(), bronze: S.bronze(undefined), saffron: S.saffron(), maroon: S.maroon(),
  wind: glow(WIND), windDeep: glow(PATINA[3]), jade: S.jade(undefined), petal: glow(PETAL), hot: glow(WHITE),
  patina: S.patina(),
});

const arrowProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A saffron streamer snaking out behind the fletching, wind curling off the shaft.
    r.fill(ribbon(t, -10.6, 0, 7, 0.65, f, 1.2), h(PM.saffron), { group: 1, bevel: 0.5 });
    for (const s of [-1, 1]) {
      const x0 = -3 - ((f * 2 + (s > 0 ? 0 : 3)) % 6);
      r.line(t.x(x0, s * 2.2), t.y(x0, s * 2.2), t.x(x0 - 4, s * 2.6), t.y(x0 - 4, s * 2.6), h(PM.windDeep), 3, 2);
      r.dot(t.x(x0 + 0.6, s * 2.1), t.y(x0 + 0.6, s * 2.1), h(PM.wind), 3, 2);
    }
    r.fill(t.cap(-11, 0, 3, 0, 0.5), h(PM.wood), { group: 3, bevel: 0.5 });
    // Saffron fletching, a leaf-shaped bronze head.
    r.fill(t.poly([-11.6, 0, -8.4, 0.4, -10.4, 2.2, -12.4, 2]), h(PM.saffron), { group: 4, bevel: 0.6 });
    r.fill(t.poly([-11.6, 0, -8.4, -0.4, -10.4, -2.2, -12.4, -2]), h(PM.saffron), { group: 4, bevel: 0.6, toneBias: -1 });
    r.fill(t.poly([2.2, -1.5, 5.6, -1.1, 8.4, 0, 5.6, 1.1, 2.2, 1.5, 3, 0]), h(PM.bronze), { group: 5, bevel: 0.9 });
    r.dot(t.x(4.2, 0), t.y(4.2, 0), h(PM.jade), 3, 5);
  },
};

// -----------------------------------------------------------------------------
// Prayer Wheel Chakram
// -----------------------------------------------------------------------------

interface WheelInk { blade: number; ring: number; spoke: number; jade: number; edge: number }

/** The wheel at (cx, 0) of t, turned by `rot`, `k` its scale: six hooked wind blades on a sea-green ring, six spokes to a jade hub. */
function wheel(r: Raster, t: Xf, cx: number, rot: number, k: number, m: WheelInk, g: number, bias = 0, L?: LocalSpace): void {
  const P = (rr: number, a: number) => [cx + Math.cos(a) * rr * k, Math.sin(a) * rr * k];
  const blades: Shape[] = [];
  for (let i = 0; i < 6; i++) {
    const a = rot + i * (Math.PI / 3);
    blades.push(t.poly([...P(3.5, a - 0.42), ...P(5.1, a - 0.08), ...P(6.5, a + 0.5), ...P(4.7, a + 0.36), ...P(3.5, a + 0.3)]));
  }
  r.fill(union(...blades), m.blade, { group: g, bevel: 1, toneBias: bias, local: L });
  // Bright honed edges on the blades' leading curves.
  for (let i = 0; i < 6; i++) {
    const a = rot + i * (Math.PI / 3);
    const [x0, y0] = P(5.1, a - 0.08), [x1, y1] = P(6.2, a + 0.42);
    r.line(t.x(x0, y0), t.y(x0, y0), t.x(x1, y1), t.y(x1, y1), m.edge, 4, g);
  }
  r.fill(subtract(t.circ(cx, 0, 4.3 * k), t.circ(cx, 0, 3.2 * k)), m.ring, { group: g + 1, bevel: 0.9, toneBias: bias, local: L });
  // Spokes to the hub, and the jade hub.
  for (let i = 0; i < 6; i++) {
    const a = rot + Math.PI / 6 + i * (Math.PI / 3);
    const [x0, y0] = P(1, a), [x1, y1] = P(3.2, a);
    r.line(t.x(x0, y0), t.y(x0, y0), t.x(x1, y1), t.y(x1, y1), m.spoke, 2 + bias, g + 2);
  }
  r.fill(t.circ(cx, 0, 1.25 * k), m.spoke, { group: g + 2, bevel: 0.7, toneBias: bias });
  r.dot(t.x(cx, 0), t.y(cx, 0), m.jade, 3, g + 2);
}

function prayerWheel(): WeaponArt {
  // A prayer wheel made a weapon: a sea-green bronze ring with six hooked blades of honed bronze curling like
  // wind, six spokes to a jade hub, the grip wound in saffron and a maroon tassel fluttering off it.
  return {
    tip: 5,
    mats: {
      blade: material(S.bronze(sheen(7, 1.75))),
      edge: material(S.bronze(undefined)),
      ring: material(S.patina()),
      spoke: material(S.bronze(undefined)),
      jade: material(S.jade()),
      grip: material(S.saffron(wound)),
      tassel: material(S.maroon(strands)),
      knot: material(S.saffron()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // The tassel off the end of the grip, fluttering.
      const fl = [0, 0.35, 0.6, 0.3][ph];
      r.fill(t.poly([-2.2, -0.5, -5.6, -1.6 - fl, -6.2, -0.2 - fl * 0.6, -5.4, 0.4, -2.2, 0.5]), m('tassel'), { group: g, bevel: 0.6, toneBias: (o.toneBias ?? 0) - 1, local: o.local });
      r.fill(t.circ(-2.3, 0, 0.75), m('knot'), { group: g, bevel: 0.5, toneBias: o.toneBias });
      wheel(r, t, 3, 0.3, 1, { blade: m('blade'), ring: m('ring'), spoke: m('spoke'), jade: m('jade'), edge: m('edge') }, 40, o.toneBias ?? 0, o.local);
      fillAll(r, [t.cap(-1.2, -1.5, -1.2, 1.5, 0.95)], m('grip'), o, 1);
    },
  };
}

const wheelProj: ProjArt = {
  frames: 8,
  outline: true,
  draw(r, t, f, h) {
    // The wheel spinning, a wake of wind curling behind it and a petal caught in it.
    for (const s of [-1, 1]) {
      const sh = ((f + (s > 0 ? 0 : 4)) % 8) * 0.5;
      const pts: number[] = [];
      for (let i = 0; i <= 5; i++) {
        const u = i / 5, x = -4 - u * 9 - sh * 0.4, y = s * (4.6 - u * 2.4 + Math.sin(u * 5 + f * 0.8) * 0.5);
        pts.push(t.x(x, y), t.y(x, y));
      }
      for (let i = 0; i + 3 < pts.length; i += 2) r.line(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], h(i < 4 ? PM.wind : PM.windDeep), 3, 1);
    }
    const px = -9 - (f % 4) * 1.4, py = Math.sin(f * 1.3) * 1.6;
    r.dot(t.x(px, py), t.y(px, py), h(PM.petal), 3, 1);
    wheel(r, t, 0, -f * (Math.PI / 12), 1.05, { blade: h(PM.bronze), ring: h(PM.patina), spoke: h(PM.bronze), jade: h(PM.jade), edge: h(PM.hot) }, 10);
  },
};

// -----------------------------------------------------------------------------
// Bell of the Four Winds
// -----------------------------------------------------------------------------

/** The bell's materials, by the names the icon and the battle sprite share. */
const BELL_SPECS: Record<string, MaterialSpec> = {
  'k.bronze': S.bronze(blotch),
  'k.dark': { base: BRONZE[1], ramp: BRONZE },
  'k.patina': S.patina(),
  'k.rune': S.jade(),
  'k.runeDim': { base: PATINA[1], ramp: PATINA },
  'k.hot': glow(0xfff4d0),
  'k.cord': S.maroon(),
  'k.tassel': S.saffron(strands),
  'k.gust': glow(WIND),
  'k.gustDeep': glow(PATINA[3]),
  'k.string': plain(0x8a6a4a),
  'k.f0': S.flag(0), 'k.f1': S.flag(1), 'k.f2': S.flag(2), 'k.f3': S.flag(3), 'k.f4': S.flag(4),
};
const BM: Record<string, Material> = mats(BELL_SPECS);

type BellState = 'ready' | 'spent' | 'toll';

/**
 * The temple bell hanging from the origin of B (its axis down −y): a hanger loop, a domed crown, two rows of
 * bosses, sea-green bands, the jade rune band (dark while it recharges, blazing as it tolls), a flared lip,
 * and a maroon cord with a saffron tassel hanging from the clapper, swung by `sway` (radians, world).
 */
function bellBody(r: Raster, B: Xf, m: (k: string) => number, state: BellState, ph: number, sway: number, g = 2): void {
  const lit = state !== 'spent', toll = state === 'toll';
  // The tassel first, under the lip.
  const T = new Xf(B.x(0, -11.3), B.y(0, -11.3), sway, B.sx, B.sy);
  r.fill(T.cap(0, 0, 0, -1.7, 0.35), m('k.cord'), { group: g, bevel: 0.3 });
  r.fill(T.poly([-0.75, -2.3, 0.75, -2.3, 1.25, -4.8, 0.3, -4.5, -0.3, -4.9, -1.25, -4.6]), m('k.tassel'), { group: g + 3, bevel: 0.6, local: T });
  r.fill(T.circ(0, -2, 0.62), m('k.cord'), { group: g + 3, bevel: 0.4 });
  if (lit) dot(r, T, 0, -2, m('k.rune'), 3, g + 3);
  // Hanger loop and crown.
  r.fill(subtract(B.circ(0, -0.5, 1.35), B.circ(0, -0.5, 0.6)), m('k.bronze'), { group: g, bevel: 0.6 });
  const body = union(
    B.ell(0, -2.4, 2.6, 1.15),
    B.poly([-2.4, -2.2, 2.4, -2.2, 3.3, -2.9, 3.8, -4.4, 4, -6.6, 4.3, -9, 4.9, -10.5, 5.7, -11.4, -5.7, -11.4, -4.9, -10.5, -4.3, -9, -4, -6.6, -3.8, -4.4, -3.3, -2.9], 0.4),
  );
  r.fill(body, m('k.bronze'), { group: g + 1, bevel: 2.4, local: B });
  // Two rows of bosses, lit on top, shadowed beneath.
  for (const [y, xs] of [[-3.9, [-2.2, -0.7, 0.8, 2.3]], [-5.3, [-2.4, -0.8, 0.8, 2.4]]] as const) {
    for (const x of xs) {
      dot(r, B, x, y, m('k.bronze'), x < 0 ? 4 : 3, g + 1);
      dot(r, B, x, y - 0.9, m('k.dark'), 0, g + 1);
    }
  }
  // Sea-green bands above and below the rune band.
  for (const y of [-6.7, -9.6]) r.fill(intersect(body, B.rect(0, y, 6, 0.42)), m('k.patina'), { group: g + 1, flat: 2, noLine: true });
  // The rune band with a wave glyph running round it.
  const band = intersect(body, B.rect(0, -8.15, 6, 0.85));
  r.fill(band, m(lit ? 'k.rune' : 'k.runeDim'), { group: g + 1, bevel: 0.6, toneBias: toll ? 0 : -1, noLine: true, local: B });
  for (let i = -4; i <= 4; i++) {
    const x = i, y = -8.15 + (wrap(i + ph, 4) < 2 ? 0.4 : -0.4);
    dot(r, B, x, y, m(toll ? 'k.hot' : lit ? 'k.rune' : 'k.patina'), toll ? 4 : 3, g + 1);
  }
  // The lip: dark bronze, white-hot as it tolls.
  r.fill(intersect(body, B.rect(0, -11.05, 6.2, 0.45)), m(toll ? 'k.hot' : 'k.dark'), { group: g + 1, flat: toll ? 3 : 1, noLine: true });
  // A glint sliding over the shoulder while it's ready.
  if (state === 'ready' && ph === 2) dot(r, B, -2, -3.2, m('k.hot'), 3, g + 1);
  // As it tolls, rings of sound fan out to both sides.
  if (toll) {
    for (const s of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const rr = 6.6 + ((ph + k * 2) % 4) * 1.1;
        for (let a = -0.55; a <= 0.56; a += 0.18) {
          const x = s * Math.cos(a) * rr, y = -6.6 + Math.sin(a) * rr;
          dot(r, B, x, y, m(k ? 'k.gustDeep' : 'k.gust'), 3, g + 4);
        }
      }
    }
  }
}

const BELL_STATES: BellState[] = ['ready', 'spent', 'toll'];

const bellProj: ProjArt = {
  // By state (ready, spent, toll), then tilt (−2..2 px at the lip), then a four-step idle loop (see specialArt.bellArtFrame).
  frames: 60,
  outline: true,
  draw(r, t, f, h) {
    const state = BELL_STATES[Math.floor(f / 20)] ?? 'ready', tilt = (Math.floor(f / 4) % 5) - 2, ph = f & 3;
    const ang = tilt * 0.1;
    const B = new Xf(t.ox, t.oy, ang);
    // The tassel hangs back against the swing, and flicks about as it tolls.
    const sway = -ang * 0.6 + [0, 0.12, 0.2, 0.1][ph] * (state === 'toll' ? 2.4 : 1) - 0.08;
    bellBody(r, B, (k) => h(BM[k]), state, ph, sway);
  },
};

const bellSkin: SkinArt = {
  mats: BELL_SPECS,
  glow: [0xfff4d0, 0xf0a838],
  icon(r, t, m) {
    // Gusts curling round the bell.
    for (const s of [-1, 1]) {
      curl(r, t, s * 9.6, -3.4, 3.2, 0.9, s > 0 ? Math.PI * 0.6 : Math.PI * 0.4, -s, m('k.gust'), 3, 1);
      curl(r, t, s * 11.6, 3.4, 2.2, 0.8, s > 0 ? Math.PI * 0.5 : Math.PI * 0.5, -s, m('k.gustDeep'), 3, 1);
    }
    // Prayer flags strung from the hanger out to both corners.
    for (const sd of [-1, 1]) {
      const yAt = (u: number) => 12.6 - u * 2.6 + Math.sin(u * Math.PI) * -0.9;
      for (let i = 0; i < 12; i++) {
        const u0 = i / 12, u1 = (i + 1) / 12;
        r.line(t.x(sd * (0.8 + u0 * 12), yAt(u0)), t.y(sd * (0.8 + u0 * 12), yAt(u0)), t.x(sd * (0.8 + u1 * 12), yAt(u1)), t.y(sd * (0.8 + u1 * 12), yAt(u1)), m('k.string'), 2, 1);
      }
      [0.3, 0.58, 0.86].forEach((u, i) => {
        const x = sd * (0.8 + u * 12), y = yAt(u) - 0.2;
        r.fill(t.poly([x - 1.1, y, x + 1.1, y, x + 1.1 - sd * 0.3, y - 2.6, x - 1.1 - sd * 0.3, y - 2.4]), m(`k.f${sd < 0 ? [0, 2, 4][i] : [3, 1, 0][i]}`), { group: 2, bevel: 0.6 });
      });
    }
    // The bell, swung a little, big in the frame.
    const B = new Xf(t.x(0.4, 11.2), t.y(0.4, 11.2), -0.12, 1.45, 1.45);
    bellBody(r, B, m, 'ready', 1, 0.2, 4);
  },
  proj: { bell: bellProj },
};

// -----------------------------------------------------------------------------
// Pilgrim's Windhat
// -----------------------------------------------------------------------------

function pilgrimsWindhat(): SkinArt {
  // A maroon cowl wrapped close round the head under a wide conical hat of woven straw, a maroon band round
  // its crown with a jade bead at the front, a bronze finial with a tiny bell at the peak, a chin cord, and two
  // ribbons, saffron and maroon, streaming back from the band in the wind.
  return {
    head: () => ({
      mats: {
        'h.cowl': material(S.maroon(wound)), 'h.straw': material(S.straw()), 'h.under': material({ base: STRAW[1], ramp: STRAW, tex: weave }),
        'h.band': material(S.maroon()), 'h.saffron': material(S.saffron()), 'h.bronze': material(S.bronze(undefined)),
        'h.dark': material(plain(BRONZE[0])), 'h.jade': material(S.jade()),
      },
      draw(r, H, m, g, sway) {
        const s = sway * 1.6, ph = r.phase % 4;
        // The cowl: close over the head, its tail falling over the neck and blowing back, the face left open.
        const outer = union(
          H.ell(-0.7, 1.2, 7.4, 7.2),
          H.poly([-7.2, 1.4, -7, -6.2, -1.2, -7.6, 2.4, -5.6]),
          H.poly([-5.4, -2.4, -9 - s, -4.4 - ph * 0.15, -10.4 - s * 1.3, -6.6, -6.6, -6.8]),
        );
        const open = H.ell(4.7, -1.2, 4.1, 4.9);
        r.fill(subtract(outer, open), m('h.cowl'), { group: g, bevel: 3, softLight: true, local: H });
        r.fill(intersect(subtract(H.ell(4.6, -1, 5, 5.8), open), outer), m('h.cowl'), { group: g, bevel: 1.1, lightBias: 0.35 });
        // The chin cord, down the cheek from under the brim.
        r.line(H.x(1.6, 4.6), H.y(1.6, 4.6), H.x(3.6, -5.2), H.y(3.6, -5.2), m('h.band'), 1, g);
        // Ribbons streaming back from the band, under the hat.
        const R = new Xf(H.x(-5.4, 6.6), H.y(-5.4, 6.6), H.ang - 0.25 * Math.sign(H.sx * H.sy || 1), H.sx, H.sy);
        r.fill(ribbon(R, 0, 0.2, 7.6 + s * 0.6, 0.6, ph, 0.9, 1.2), m('h.band'), { group: 70, bevel: 0.5, toneBias: -1, local: R });
        r.fill(ribbon(R, 0, -0.4, 9 + s * 0.8, 0.65, ph + 1, 1.1, 2.4), m('h.saffron'), { group: 71, bevel: 0.5, local: R });
        // The hat: a broad shallow cone, its underside showing a little at the brim.
        const brim = 5.2;
        const cone = H.poly([-11.6, brim - 0.4, -10.6, brim + 0.4, 0.2, brim + 7.2, 1, brim + 7.2, 12.4, brim + 0.6, 13, brim - 0.2, 0.8, brim + 0.6], 0.3);
        r.fill(cone, m('h.straw'), { group: 72, bevel: 1.4, local: H });
        r.fill(intersect(cone, H.poly([-12, brim - 1, 13.4, brim - 1, 13.4, brim + 0.15, 0.8, brim + 0.85, -12, brim + 0.15])), m('h.under'), { group: 72, flat: 1, noLine: true, local: H });
        // The crown band, the jade bead at its front.
        r.fill(intersect(cone, H.poly([-6, brim + 3.6, 7, brim + 3.4, 7, brim + 4.4, -6, brim + 4.6])), m('h.band'), { group: 72, bevel: 0.5, noLine: true });
        r.fill(H.circ(5.4, brim + 3.6, 0.75), m('h.bronze'), { group: 72, bevel: 0.4 });
        dot(r, H, 5.4, brim + 3.6, m('h.jade'), 3, 72);
        // The finial at the peak, a tiny bell hanging from it, swinging.
        r.fill(union(H.circ(0.6, brim + 7.8, 0.75), H.cap(0.6, brim + 7.4, 0.6, brim + 9.4, 0.32)), m('h.bronze'), { group: 73, bevel: 0.5 });
        const bs = [0, 0.4, 0.6, 0.3][ph] + s * 0.06;
        const B = new Xf(H.x(0.6, brim + 9.4), H.y(0.6, brim + 9.4), H.ang - (0.9 + bs) * Math.sign(H.sx * H.sy || 1), H.sx, H.sy);
        tinyBell(r, B, 0, -0.4, 0.75, m('h.bronze'), m('h.dark'), 74);
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Robes of the Windward Peak
// -----------------------------------------------------------------------------

function windwardRobes(): SkinArt {
  // Saffron robes to the shin with a maroon hem worked with bronze wind curls, a maroon shawl thrown over the
  // near shoulder and across the chest, its end streaming far out behind in the wind, a bronze wind-wheel clasp,
  // a mala of wooden beads with a jade pendant, and a rope belt with a little bell at the hip.
  return {
    mats: {
      robe: S.saffron(folds),
      robeTrim: S.maroon(),
      'k.shawl': S.maroon(folds),
      'k.shawlEdge': S.saffron(),
      'k.bronze': S.bronze(undefined),
      'k.dark': plain(BRONZE[0]),
      'k.bead': S.wood(),
      'k.jade': S.jade(),
    },
    chest: {
      cape: null, hood: null, pauldron: null, noScarf: true,
      back(r, T, m, c) {
        // The shawl's end, thrown back over the shoulder and streaming out behind in the wind.
        const top = c.top, s = c.sway * 2.6, ph = r.phase % 4, fl = [0, 0.5, 0.8, 0.4][ph];
        const tail = T.poly([
          -0.6, top + 1.2, -4.4, top + 0.4 + fl * 0.3, -9 - s, top - 1.6 + fl, -13.4 - s * 1.2, top - 2.2 + fl * 1.4,
          -15.2 - s * 1.3, top - 3.6 + fl * 0.6, -12.6 - s * 1.1, top - 4.2 + fl * 0.4, -14 - s * 1.2, top - 5.6 - fl * 0.3,
          -9.4 - s, top - 5 + fl * 0.4, -4.6 - s * 0.4, top - 4.6, -1, top - 3.2,
        ]);
        r.fill(tail, m('k.shawl'), { group: c.g, bevel: 2, toneBias: -1, softLight: true, local: T });
        // A saffron stripe along its lower edge.
        r.fill(intersect(tail, T.poly([-16 - s * 1.3, top - 4.4 + fl * 0.4, -1, top - 2.4, -1, top - 4, -16 - s * 1.3, top - 7])), m('k.shawlEdge'), { group: c.g, bevel: 0.6, toneBias: -1, noLine: true, local: T });
      },
      shoulder(r, S2, m, c) {
        // The shawl draped over the shoulder, a bronze wind-wheel clasp on the near one.
        const o = { group: c.g, toneBias: c.bias };
        r.fill(union(S2.ell(0, 0.9, 3, 2.3), S2.poly([-2.8, 0.6, -3.2, -3.4, 0.4, -2.6, 2.4, 0.2])), m('k.shawl'), { ...o, bevel: 1.4, softLight: true, local: S2 });
        if (c.far) return;
        r.fill(S2.circ(0.6, 1, 1.15), m('k.bronze'), { ...o, bevel: 0.6 });
        dot(r, S2, 0.6, 1, m('k.jade'), 3, c.g);
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, ph = r.phase % 4;
        const fx = b.chestPush * 0.7;
        // The shawl across the chest, from the near shoulder down to the far hip, a saffron edge along it.
        const x0 = fx - 1.8;
        const sash = T.poly([x0 - 1.4, top + 0.2, x0 + 1.2, top + 0.4, x0 + 4.6, 3.4, x0 + 4.4, 0.6, x0 + 2.2, 0.8]);
        r.fill(sash, m('k.shawl'), { group: c.g, bevel: 0.9, softLight: true, local: T });
        r.line(T.x(x0 + 1.2, top + 0.2), T.y(x0 + 1.2, top + 0.2), T.x(x0 + 4.6, 3.2), T.y(x0 + 4.6, 3.2), m('k.shawlEdge'), 3, c.g);
        // The mala: wooden beads hanging round the neck, a jade pendant at the bottom.
        const n = 6, mx = fx + 0.9;
        for (let i = 0; i <= n; i++) {
          const u = i / n, x = mx - 2.2 + u * 3.6, y = top - 0.6 - Math.sin(u * Math.PI) * 3.6;
          dot(r, T, x, y, m(i % 3 === 0 ? 'k.bronze' : 'k.bead'), i % 3 === 0 ? 3 : 2, c.g);
        }
        r.fill(T.poly([mx - 0.4, top - 4.3, mx + 0.6, top - 4.3, mx + 0.1, top - 5.6]), m('k.jade'), { group: c.g });
        // The rope belt's knot at the front, a little bell hanging from it.
        const bx = b.waistW * 0.55 + 0.4;
        r.fill(T.circ(bx, 2.2, 0.8), m('k.shawlEdge'), { group: c.g, bevel: 0.5 });
        const sw = [0, 0.2, 0.35, 0.15][ph] - c.sway * 0.3;
        const B = new Xf(T.x(bx + 0.2, 1.6), T.y(bx + 0.2, 1.6), T.ang + sw * Math.sign(T.sx * T.sy || 1), T.sx, T.sy);
        r.line(B.x(0, 0), B.y(0, 0), B.x(0, -1.2), B.y(0, -1.2), m('k.shawlEdge'), 2, c.g);
        tinyBell(r, B, 0, -1.1, 0.75, m('k.bronze'), m('k.dark'), c.g);
        // The hem: a maroon band with bronze wind curls, swaying with the skirt.
        const leg = b.thigh + b.shin, len = leg * 0.62, swy = c.sway * 2.2;
        const hx0 = -b.hipW - 1.4, hx1 = b.hipW + 1.8;
        const hem = T.poly([hx0 - swy * 0.45, -len + 0.4, hx1 - swy * 0.75, -len - 0.1, hx1 - swy * 0.7, -len + 1.7, hx0 - swy * 0.4, -len + 2.2]);
        r.fill(hem, m('robeTrim'), { group: c.g, bevel: 0.6, softLight: true, local: T });
        for (let k = 0; k < 3; k++) {
          const u = (k + 0.5) / 3, x = hx0 + (hx1 - hx0) * u - swy * (0.45 + u * 0.3), y = -len + 1.1 - u * 0.4;
          curl(r, T, x, y, 0.85, 0.75, Math.PI * (0.2 + ph * 0.1), 1, m('k.bronze'), 3, c.g);
        }
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Cloudstep Trousers
// -----------------------------------------------------------------------------

function cloudstepTrousers(): SkinArt {
  // Loose trousers of unbleached cotton bound at hip and knee with maroon wraps, a cloud scroll embroidered
  // in bronze thread on the thigh, and maroon tie-ends fluttering off the knee wrap knotted round a jade bead.
  return {
    mats: {
      windLeg: { base: COTTON[2], ramp: COTTON, tex: folds },
      windTrim: S.maroon(wound),
      'l.thread': S.bronze(undefined),
      'l.tie': S.maroon(),
      'l.jade': S.jade(),
    },
    legs: {
      mat: 'windLeg', trim: 'windTrim', wraps: 'windTrim', knee: null, tasset: null, rune: null, bulk: 0.35,
      over(r, t, m, c) {
        const ph = r.phase % 4, w = c.w, L = c.len;
        // A cloud scroll on the outside of the thigh: three lobes and a curl.
        const cx = L * 0.52, cy = w * 0.15;
        curl(r, t, cx, cy, 1.5, 0.8, Math.PI * 0.9, -1, m('l.thread'), c.far ? 2 : 3, c.g);
        for (const [dx, dy] of [[1.6, -0.9], [2.4, 0.6]]) {
          const pts: number[] = [];
          for (let i = 0; i <= 5; i++) {
            const a = Math.PI * (1.1 - i * 0.22);
            pts.push(t.x(cx + dx + Math.cos(a) * 0.9, cy + dy + Math.sin(a) * 0.9), t.y(cx + dx + Math.cos(a) * 0.9, cy + dy + Math.sin(a) * 0.9));
          }
          for (let i = 0; i + 3 < pts.length; i += 2) r.line(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], m('l.thread'), c.far ? 2 : 3, c.g);
        }
        if (c.far) return;
        // Tie-ends off the knee wrap, fluttering back, knotted round a jade bead.
        const fl = [0, 0.4, 0.7, 0.3][ph];
        r.fill(t.poly([1.4, -w + 0.2, 0.6, -w - 2.6 - fl, 1.2, -w - 2.8 - fl, 2, -w + 0.2]), m('l.tie'), { group: c.g, bevel: 0.5, toneBias: c.bias });
        r.fill(t.poly([1.6, -w + 0.2, 2.4, -w - 2 + fl * 0.5, 3, -w - 1.8 + fl * 0.5, 2.4, -w + 0.4]), m('l.tie'), { group: c.g, bevel: 0.5, toneBias: c.bias - 1 });
        dot(r, t, 1.7, -w + 0.1, m('l.jade'), 3, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Cloudwalker Sandals
// -----------------------------------------------------------------------------

function cloudwalkerSandals(): SkinArt {
  // Maroon cloth wound up the shin and criss-crossed with saffron straps over thick wooden soles, a bronze
  // anklet with a jade bead, and little clouds puffing round the heel with every step.
  return {
    mats: {
      zephyr: S.maroon(wound),
      zephyrTrim: S.bronze(undefined),
      'k.strap': S.saffron(),
      'k.sole': S.wood(),
      'k.anklet': S.bronze(undefined),
      'k.jade': S.jade(),
      'k.cloud': S.cloud(),
    },
    boots: {
      wing: null, height: 0.62,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w;
        // Saffron straps criss-crossing up the wraps.
        for (let x = 2; x + 1.6 < c.top; x += 2.2) {
          r.line(shin.x(x, -w), shin.y(x, -w), shin.x(x + 1.6, w), shin.y(x + 1.6, w), m('k.strap'), c.far ? 2 : 3, c.g);
          r.line(shin.x(x, w), shin.y(x, w), shin.x(x + 1.6, -w), shin.y(x + 1.6, -w), m('k.strap'), c.far ? 1 : 2, c.g);
        }
        // The wooden sole under the foot.
        r.fill(foot.cap(-1.8, -2.1, c.toe - 0.3, -1.3, 0.6, 0.5), m('k.sole'), { ...o, bevel: 0.5 });
        // The anklet and its jade bead.
        r.fill(shin.rect(1.4, 0, 0.45, w + 0.35), m('k.anklet'), { ...o, bevel: 0.4 });
        if (c.far) return;
        dot(r, shin, 1.4, w + 0.3, m('k.jade'), 3, c.g);
        // Clouds puffing round the heel, rolling back and thinning out over the loop.
        const roll = [0, 0.5, 1, 1.5][ph];
        for (let k = 0; k < 3; k++) {
          const x = -2.4 - k * 1.5 - roll * 0.6, y = -1.6 + k * 0.5 + Math.sin(ph + k) * 0.3;
          const rr = 1.15 - k * 0.25 - roll * 0.08;
          if (rr > 0.45) r.fill(foot.circ(x, y, rr), m('k.cloud'), { group: 33, bevel: 0.6, toneBias: k > 1 ? -1 : 0 });
        }
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = {
  wind: css(WIND), windDeep: css(PATINA[3]), cord: css(0x8a6a4a), petal: css(PETAL), petal2: css(PETAL2),
  flags: FLAGS.map(css), flagsDim: FLAGS.map((c) => css(mix(c, 0x1a2430, 0.4))),
};

let auraStep = 0;
const windDot = (g: CanvasRenderingContext2D, px: number, py: number, i: number) => {
  // Dashes racing round: a whirlwind on the ground.
  const k = (i + auraStep) % 10;
  if (k > 4) return;
  g.fillStyle = k === 0 ? AC.wind : AC.windDeep;
  g.fillRect(px, py, 1, 1);
};

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function skybellAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  const back = layer === 'back';
  // A whirlwind ring at the feet, its dashes racing round.
  auraStep = Math.floor(t * 14) % 10;
  g.globalAlpha = 0.65;
  ring(g, x, y, 14, 3.6, 40, layer, windDot);
  // A string of prayer flags circling the shins on the wind, its flags rippling.
  const turn = t * 0.7;
  const n = 9, RX = 16, RY = 4.2, cy = y - 7;
  g.globalAlpha = back ? 0.7 : 0.95;
  for (let k = 0; k < n; k++) {
    const a = turn + (k / n) * Math.PI * 2, s = Math.sin(a);
    if ((s < 0) !== back) continue;
    const bob = Math.sin(t * 3 + k * 1.3) * 0.6;
    const px = Math.round(x + Math.cos(a) * RX), py = Math.round(cy + s * RY + bob);
    // The cord sagging to the next flag.
    g.fillStyle = AC.cord;
    for (let j = 1; j < 4; j++) {
      const b = a + (j / 4) * ((Math.PI * 2) / n);
      g.fillRect(Math.round(x + Math.cos(b) * RX), Math.round(cy + Math.sin(b) * RY + bob + (j === 2 ? 1 : 0.5)), 1, 1);
    }
    // The far side of the circle in shadow.
    g.fillStyle = (back ? AC.flagsDim : AC.flags)[k % 5];
    const fl = Math.sin(t * 9 + k * 2.1) > 0 ? 1 : 0;
    g.fillRect(px - 1, py, 2, 2 + fl);
  }
  // Marigold petals spiralling up round the fighter on the wind.
  for (let k = 0; k < 6; k++) {
    const u = (t * 0.28 + k / 6) % 1;
    const a = t * 2.2 + k * 2.4 + u * 5, s = Math.sin(a);
    if ((s < 0) !== back) continue;
    const rr = 10 + u * 6;
    const px = Math.round(x + Math.cos(a) * rr), py = Math.round(y - 3 - u * 34 + s * 3);
    g.globalAlpha = Math.min(1, (1 - u) * 3, u * 8);
    g.fillStyle = k % 2 ? AC.petal : AC.petal2;
    g.fillRect(px, py, 1, 1);
    if (Math.sin(t * 7 + k) > 0.2) g.fillRect(px + (Math.cos(a) > 0 ? 1 : -1), py, 1, 1);
  }
  g.globalAlpha = 1;
}

export const SKYBELL: Record<string, SkinArt> = {
  'longbow.skybell': { weapon: windsongBow, proj: { arrow: arrowProj }, ...FX },
  'wind_chakram.skybell': { weapon: prayerWheel, proj: { chakram: wheelProj }, ...FX },
  'gale_bell.skybell': bellSkin,
  'hawkeye_hood.skybell': pilgrimsWindhat(),
  'mage_robe.skybell': windwardRobes(),
  'windrunner_leggings.skybell': cloudstepTrousers(),
  'zephyr_boots.skybell': cloudwalkerSandals(),
};
