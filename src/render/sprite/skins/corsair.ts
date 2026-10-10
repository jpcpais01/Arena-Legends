import { ring, type Layer } from '../../auraKit';
import { css } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { hairCap } from '../draw';
import { fillAll, hangAt, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { HeadSkin } from './heads';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, mats, Q, wrap } from './kit';

/**
 * Epic set: Dread Tide Corsair. A ghost-pirate captain: tar-black coats,
 * tarnished gold and sea-green ghostlight, gulls and spray on the wind.
 * Night accents are the ghostlight only: a tide rolling along the cutlass
 * edge, the skull pommel's and the hat badge's eyes, the coat's gem pin, the
 * pistol's chambers, the boots' foam and the wolf's eye, plus glints on the
 * tarnished gold.
 */

/** Tar black: pitch-dark with a cold sea-green cast in the light. */
const TAR = [0x06080a, 0x0e1216, 0x1a2026, 0x2a343a, 0x4a5c62];
/** Tarnished gold: dull brass browns, the top tone a worn-bright glint. */
const GOLD = [0x3a2a10, 0x6a5020, 0x9a7c34, 0xc8aa56, 0xf4e6a8];
/** Sea-green silk and feathers (matte). */
const SEA = [0x05221e, 0x0c4038, 0x166a5a, 0x2e9a80, 0x70d0b0];
/** Faded verdigris stripes. */
const VERD = [0x0a1e1c, 0x163a36, 0x285e56, 0x3e8476, 0x6ab0a0];
/** Ghostlight (self-lit; glow draws tone 3). */
const GHOST = [0x0a4a40, 0x18947c, 0x3ad8b0, 0x8affd8, 0xe8fff6];
const GHOST_DK = [0x06302a, 0x0e5a4c, 0x188a74, 0x2ab896, 0x8affd8];
/** Pitted steel, its fifth tone the ghostly tide along the edge. */
const STEEL = [0x1a2426, 0x3a4c4c, 0x7a908c, 0xb4ccc4, 0x9effd8];
/** Linen, bone and gull feathers. */
const LINEN = [0x5e5a4e, 0x9a9684, 0xd0cab6, 0xeee8d8, 0xffffff];
const BONE = [0x5a5040, 0x948870, 0xccc2a4, 0xece4cc, 0xfffcf0];
const SLATE = [0x16181c, 0x2c3036, 0x4a5058, 0x707882, 0xa8b0b8];
/** Black wood of the pistol stock. */
const EBONY = [0x0e0a08, 0x1e1612, 0x32261e, 0x4e3c2e, 0x725a46];
const IRON = [0x101416, 0x20282c, 0x38444a, 0x5a6a70, 0xb0c8c4];

// -----------------------------------------------------------------------------
// Textures
// -----------------------------------------------------------------------------

/** Worn tar-black cloth: a faint weave and a few scuffs. */
const tarCloth: Tex = (x, y) => (hash(Math.floor(x * 1.1), Math.floor(y * 1.1) + 5) < 0.07 ? -1 : wrap(Math.floor(x) + Math.floor(y), 3) === 0 ? -1 : 0);
/** Tarnished gold: dark pits, and a glint wandering over it frame by frame. */
const tarnish = (glints = 0.05): Tex => (x, y, ph) => {
  if (hash(Math.floor(x) + ph * 31, Math.floor(y) - ph * 17) < glints) return 2;
  return hash(Math.floor(x * 1.3) + 3, Math.floor(y * 1.3)) < 0.18 ? -1 : 0;
};
/** Silk folds running across a sash. */
const silk: Tex = (x, y) => (wrap(x * 0.6 + y * 0.9, 2.6) < 0.7 ? -1 : 0);
/** Polished boot leather: a highlight sliding down the shaft. */
const polish: Tex = (x, y, ph) => (wrap(x * 0.8 - y * 0.3 + ph * 2, 10) < 0.8 ? 1 : 0);
/** Wood grain along the stock. */
const woodGrain: Tex = (x, y) => (wrap(y * 2.3 + Math.sin(x * 0.6) * 0.7, 2.1) < 0.45 ? -1 : 0);
/** Gull feather: barbs, and the grey band before the tip. */
const barbs: Tex = (x, y) => (wrap(x * 0.9 + y * 0.6, 2.4) < 0.5 ? -1 : 0);

// -----------------------------------------------------------------------------
// Materials
// -----------------------------------------------------------------------------

const R = (r: number[], o: Partial<MaterialSpec> = {}): MaterialSpec => ({ base: r[2], ramp: r, ...o });
const tar = (tex: Tex | undefined = tarCloth) => R(TAR, { tex });
const gold = (tex: Tex = tarnish()) => R(GOLD, { shiny: true, tex });
const sea = (tex?: Tex) => R(SEA, { tex });
const ghost = (tex?: Tex): MaterialSpec => ({ base: GHOST[3], ramp: GHOST, glow: true, tex });
const ghostDk = (): MaterialSpec => ({ base: GHOST_DK[3], ramp: GHOST_DK, glow: true });
const linen = (tex?: Tex) => R(LINEN, { tex });
const bone = () => R(BONE);

const FX = epicFx(0xb8ffe0, 0x1a8a7a, 'twinkle', 0x8affd8);

/** Particles the full set sheds in battle: ghostlight sparkles and spray. */
export const CORSAIR_FX: SkinFx = { spark: 0xb8ffe0, spark2: 0x1a8a7a, kind: 'twinkle' };

// -----------------------------------------------------------------------------
// Shapes
// -----------------------------------------------------------------------------

/** Caps through [x, y, radius] points. */
function bend(F: Xf, pts: number[]): Shape {
  const out: Shape[] = [];
  for (let i = 0; i + 5 < pts.length; i += 3) out.push(F.cap(pts[i], pts[i + 1], pts[i + 3], pts[i + 4], pts[i + 2], pts[i + 5]));
  return union(...out);
}

/** A feather from (x, y) toward angle `a`: a narrow quill widening to `w`, then a soft point; `curl` bends it. */
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

// -----------------------------------------------------------------------------
// Gravetide Cutlass
// -----------------------------------------------------------------------------

/** The cutting edge of the cutlass (weapon space), and the blade's curve. */
const EDGE: [number, number][] = [[1.6, -1.5], [10, -1.6], [17, -1.5], [23, -1.1], [28, -0.2], [31.5, 0.9], [34.4, 2.3]];
const SPINE: [number, number][] = [[1.6, 1.4], [10, 1.5], [17, 1.9], [23, 2.6], [27.6, 3.2], [29.2, 3.3], [34.4, 2.3]];
const along = (pts: [number, number][], x: number) => {
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      return ay + ((x - ax) / (bx - ax || 1)) * (by - ay);
    }
  }
  return pts[pts.length - 1][1];
};

/** The tide along the edge: a bright band, and crests of ghostlight rolling up it toward the point. */
const tide: Tex = (x, y, ph) => {
  if (x < 2.6 || x > 34.4) return 0;
  const d = y - along(EDGE, x);
  const band = 0.75 + Math.sin(x * 0.9 - ph * Q) * 0.3;
  if (d < band) return wrap(x - ph * 2.5, 7) < 2.4 ? 4 : 1;
  // Pitting on the flat, a few dark specks.
  return hash(Math.floor(x * 1.2), Math.floor(y * 1.2) + 41) < 0.06 ? -1 : 0;
};

function gravetideCutlass(): WeaponArt {
  // A broad cutlass of pitted sea-steel, curving to a clipped point, a tide of ghostlight rolling up its
  // edge; barnacles crusting the spine by the guard; a tarnished gold shell and knuckle bow, a black grip
  // bound in gold wire, a bone skull pommel with green eyes and a tattered sea-green pennant hanging off it.
  return {
    tip: 34,
    mats: {
      blade: material(R(STEEL, { tex: tide })), gold: material(gold()), grip: material(tar(undefined)),
      bone: material(bone()), eye: material(ghost()), crust: material(R(VERD, { tex: (x, y) => (hash(Math.floor(x * 2), Math.floor(y * 2)) < 0.3 ? -1 : 0) })),
      ribbon: material(sea(silk)),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // The pennant hanging off the pommel ring, its tails swinging.
      const H = hangAt(t, -7.6, 0);
      const s = [0, 0.4, 0.7, 0.3][ph];
      fillAll(r, [H.poly([0, -0.5, 4.4, -0.9 + s, 5.6, -0.4 + s * 1.3, 4.6, 0 + s, 5.2, 0.6 + s * 1.4, 3.6, 0.5 + s * 0.8, 0, 0.5])], m('ribbon'), o, 0.6);
      // Grip and wire.
      fillAll(r, [t.cap(-5.2, 0, -0.4, 0, 1.05, 0.95)], m('grip'), o, 1);
      for (let x = -4.4; x < -0.6; x += 1.2) r.dot(t.x(x, 0.35), t.y(x, 0.35), m('gold'), 3, g);
      // The blade, a dark fuller along the spine and barnacles crusting it by the guard.
      const blade: number[] = [];
      for (const [x, y] of SPINE) blade.push(x, y);
      for (let i = EDGE.length - 2; i >= 0; i--) blade.push(EDGE[i][0], EDGE[i][1]);
      fillAll(r, [t.poly(blade)], m('blade'), o, 1.1);
      for (let x = 4; x < 24; x += 4) {
        const a = along(SPINE, x) - 0.55, b = along(SPINE, x + 4) - 0.55;
        r.line(t.x(x, a), t.y(x, a), t.x(x + 4, b), t.y(x + 4, b), m('blade'), 1, g);
      }
      r.fill(union(t.circ(4.4, 1.5, 0.75), t.circ(5.7, 1.7, 0.6), t.circ(3.6, 0.6, 0.5)), m('crust'), { group: g, bevel: 0.6, toneBias: o.toneBias, local: o.local });
      r.dot(t.x(5.6, 1.9), t.y(5.6, 1.9), m('bone'), 3, g);
      // The shell guard, the knuckle bow sweeping down to the pommel, a curled quillon on the spine side.
      fillAll(r, [t.ell(1.6, -0.3, 1.35, 3.5)], m('gold'), o, 1.2);
      fillAll(r, [bend(t, [1.4, -3.2, 0.85, -1.4, -5.1, 0.75, -4.6, -4.6, 0.7, -6.4, -1.8, 0.7])], m('gold'), o, 0.9);
      fillAll(r, [bend(t, [1.6, 2.6, 0.6, 1.4, 4.4, 0.55, 0.2, 5, 0.5]), t.circ(-0.4, 4.4, 0.7)], m('gold'), o, 0.8);
      r.dot(t.x(1.9, -0.6), t.y(1.9, -0.6), m('eye'), 3, g);
      // The skull pommel, its eyes lit green.
      fillAll(r, [t.circ(-6.9, 0, 1.6), t.rect(-8.2, 0, 0.7, 1, 0.3)], m('bone'), o, 1.1);
      r.dot(t.x(-7.2, 0.6), t.y(-7.2, 0.6), m('eye'), 3, g);
      r.dot(t.x(-7.2, -0.6), t.y(-7.2, -0.6), m('eye'), 3, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Flintlock Repeater
// -----------------------------------------------------------------------------

/** Which side the hand crossbow's grip hangs (+y in weapon space, like the stock crossbow's). */
const DOWN = 1;

function flintlockRepeater(): WeaponArt {
  // A black-wood pistol with a revolving brass drum of three chambers glowing green, a long iron barrel
  // flaring to a brass muzzle, gold inlay, a skull butt cap and a flint hammer that cocks as it draws;
  // a curl of ghostlight smoke drifts from the muzzle.
  const v = (y: number) => y * DOWN;
  const P = (pts: number[]) => pts.map((n, i) => (i % 2 ? v(n) : n));
  return {
    tip: 9.2,
    mats: {
      stock: material(R(EBONY, { tex: woodGrain })), iron: material(R(IRON, { shiny: true })), brass: material(gold()),
      bone: material(bone()), ghost: material(ghost()), flint: material(R(SLATE)),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4, pull = o.pull ?? 1;
      // The stock: fore-end under the barrel, the grip dropping to the butt.
      fillAll(r, [t.poly(P([-2.6, -1, 6.8, -0.7, 7, 0.7, 1.8, 1.1, 0.4, 2.6, -1.2, 4.4, -4, 4.8, -3.8, 2.8, -2.6, 0.9]))], m('stock'), o, 1.3);
      // Gold inlay down the grip and a trigger guard.
      r.line(t.x(-0.6, v(1.2)), t.y(-0.6, v(1.2)), t.x(-2.6, v(3.6)), t.y(-2.6, v(3.6)), m('brass'), 3, g);
      fillAll(r, [bend(t, P([2.2, 1, 0.38, 1.8, 2.5, 0.38, 0.2, 2.2, 0.38]))], m('brass'), o, 0.5);
      // Skull butt cap.
      fillAll(r, [t.circ(-3.2, v(5), 1.4)], m('bone'), o, 1);
      r.dot(t.x(-2.7, v(5)), t.y(-2.7, v(5)), m('ghost'), 3, g);
      // The barrel, banded, flaring to a brass bell at the muzzle.
      fillAll(r, [t.cap(2.6, v(-1.6), 8.2, v(-1.6), 1, 0.9)], m('iron'), o, 1);
      fillAll(r, [t.poly(P([7.6, -2.8, 9.6, -3.5, 9.6, 0.3, 7.6, -0.4]))], m('brass'), o, 0.9);
      fillAll(r, [t.rect(5.4, v(-1.6), 0.4, 1.1)], m('brass'), o, 0.5);
      // The drum: three chambers, turning a step each frame.
      fillAll(r, [t.rect(1.5, v(-1.4), 1.6, 2, 0.6)], m('brass'), o, 1.1);
      r.line(t.x(0.2, v(-1.4)), t.y(0.2, v(-1.4)), t.x(2.8, v(-1.4)), t.y(2.8, v(-1.4)), m('brass'), 1, g);
      for (let k = 0; k < 3; k++) {
        const yy = -2.8 + ((k + ph) % 3) * 1.4;
        r.dot(t.x(3.3, v(yy)), t.y(3.3, v(yy)), m('ghost'), 3, g);
      }
      // The hammer: leaning forward on the frizzen at rest, cocked back as it draws, a flint in its jaws.
      const ang = 1.15 + pull * 1.1;
      const hx = -0.6, hy = -1.8;
      const tx = hx + Math.cos(ang) * 2.2, ty = hy - Math.sin(ang) * 2.2;
      r.fill(t.cap(hx, v(hy), tx, v(ty), 0.5, 0.55), m('iron'), { group: g, bevel: 0.5, toneBias: o.toneBias });
      r.dot(t.x(tx, v(ty - 0.5)), t.y(tx, v(ty - 0.5)), m('flint'), 3, g);
      // A wisp of ghostlight smoke curling up off the muzzle.
      const wx = 10 + [0, 0.4, 0.6, 0.2][ph], wy = -3.4 - [0, 0.8, 1.6, 2.4][ph];
      r.dot(t.x(wx, v(wy)), t.y(wx, v(wy)), m('ghost'), 3, g);
      if (ph < 3) r.dot(t.x(wx - 0.6, v(wy - 0.8)), t.y(wx - 0.6, v(wy - 0.8)), m('ghost'), 3, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Battle sprites (their own materials)
// -----------------------------------------------------------------------------

const CM = mats({
  ghost: ghost(), ghostDk: ghostDk(), hot: { base: GHOST[4], glow: true }, smoke: R(LINEN), lead: R(IRON, { shiny: true }),
});

const boltProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A ball of ghostlight streaking from the barrel: a rippling wake of spray behind it, puffs of powder
    // smoke peeling off and a spiral of spray droplets.
    const w = [0, 0.5, 0, -0.5][f];
    r.fill(t.poly([-1, -1.7, -5, -1.3 + w * 0.4, -10, -0.5 + w, -14, w * 1.2, -10, 0.7 + w, -5, 1.4 + w * 0.4, -1, 1.7]), h(CM.ghostDk), { group: 1 });
    r.line(t.x(-2, 0), t.y(-2, 0), t.x(-9, w * 0.6), t.y(-9, w * 0.6), h(CM.ghost), 3, 1);
    for (let k = 0; k < 2; k++) {
      const u = (f + k * 2) % 4;
      const x = -5 - u * 1.8, y = (k ? -1 : 1) * (2 + u * 0.4);
      r.fill(t.circ(x, y, 1.5 - u * 0.2), h(CM.smoke), { group: 2 + k, bevel: 1 });
    }
    r.fill(t.circ(0.6, 0, 2.3), h(CM.ghost), { group: 4, bevel: 1.2 });
    r.fill(t.circ(1, 0.3, 1.3), h(CM.hot), { group: 4, noLine: true });
    const sa = f * Q;
    r.dot(t.x(-3 - f * 0.8, Math.sin(sa) * 2.4), t.y(-3 - f * 0.8, Math.sin(sa) * 2.4), h(CM.hot), 3, 5);
    r.dot(t.x(-7 - f * 0.8, Math.cos(sa) * 2.2), t.y(-7 - f * 0.8, Math.cos(sa) * 2.2), h(CM.ghost), 3, 5);
  },
};

// -----------------------------------------------------------------------------
// Ghost Parrot
// -----------------------------------------------------------------------------

/** A pixel map letter: a material name and the tone of its ramp to paint. */
type Ink = [string, number];

function pix(r: Raster, t: Xf, m: (k: string) => number, rows: readonly string[], pal: Record<string, Ink>, ax: number, ay: number, group = 1): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const e = pal[ch];
      if (!e) throw new Error(`corsair: no ink for '${ch}'`);
      r.dot(t.ox + x - ax, t.oy + y - ay, m(e[0]), e[1], group);
    }
  }
}

const PARROT_SPECS: Record<string, MaterialSpec> = {
  'k.plume': R(SEA), 'k.plumeDk': R([0x03100e, 0x061e1a, 0x0c3830, 0x165a4c, 0x2a8a72]),
  'k.gold': gold(), 'k.beak': bone(), 'k.bill': R(SLATE), 'k.ghost': ghost(), 'k.ghostDk': ghostDk(), 'k.eye': ghost(),
  'k.anchor': gold(tarnish(0.04)), 'k.chain': R(IRON, { shiny: true }),
};
const PM = mats(PARROT_SPECS);
type PK = keyof typeof PM;

/**
 * The ghost parrot's poses (faces +x; origin at the talons, frames in
 * specialArt's HAWK_POSES order: perch0, perch1, up, down, glide): sea-green
 * plumage with a tarnished gold wing patch, a bone beak, a ghostlight eye
 * and its long tail and wingtips fading into ghostlight.
 */
const PARROT: { rows: string[]; ax: number; ay: number }[] = [
  {
    ax: 7, ay: 12,
    rows: [
      '....BBB.....',
      '...BllllB...',
      '..BllllllB..',
      '..Bllccbbb..',
      '..BlccwbbbY.',
      '..BBlccYbbY.',
      '..BBBl..YY..',
      '.kkBBll.....',
      'kkoBBlll....',
      'kooBBllll...',
      'kkoBBllll...',
      'kkkBBBll....',
      '.kkBBByff...',
      '.GkkB.......',
      '.Ggk........',
      '..Gg........',
      '..gG........',
      '...G........',
    ],
  },
  {
    ax: 7, ay: 12,
    rows: [
      '....BBB.....',
      '...BllllBb..',
      '..BlllllbbbY',
      '..BlcccbbbbY',
      '..BlcwcY..Y.',
      '..BBlccYb...',
      '..BBBl.YYb..',
      '.kkBBll.....',
      'kkoBBlll....',
      'kooBBllll...',
      'kkoBBllll...',
      'kkkBBBll....',
      '.kkBBByff...',
      '.GkkB.......',
      '.Ggk........',
      '..Gg........',
      '..gG........',
      '...G........',
    ],
  },
  {
    ax: 8, ay: 13,
    rows: [
      'G............',
      'gG...BBB.....',
      'kgG.BllllB...',
      'okgBllllllB..',
      '.okBllccbbb..',
      '.okBlccwbbbY.',
      '..kBBlccYbbY.',
      '..kBBBl..YY..',
      '..kBBBll.....',
      '..BBBBlll....',
      '..BBBBllll...',
      '..kBBBllll...',
      '..kkBBBll....',
      '..kkBBByff...',
      '..GkkB.......',
      '..Ggk........',
      '...Gg........',
      '...gG........',
      '....G........',
    ],
  },
  {
    ax: 7, ay: 12,
    rows: [
      '....BBB.....',
      '...BllllB...',
      '..BllllllB..',
      '..Bllccbbb..',
      '..BlccwbbbY.',
      '..BBlccYbbY.',
      '..BBBl..YY..',
      '..BBBll.....',
      'kkkBBlll....',
      'ookBBllll...',
      'GgoBBllll...',
      '.GgkBBll....',
      '..gkBByff...',
      '.GkkB.......',
      '.Ggk........',
      '..Gg........',
      '..gG........',
      '...G........',
    ],
  },
  {
    ax: 13, ay: 5,
    rows: [
      '.........Gg............',
      '..........gko..........',
      '...........kooB...BBB..',
      '............kBBB.BlllBb.',
      'GGggkkBBBBBBBBBBBlcccbbY',
      '.GgggkkBBBllllllllcwcbbbY',
      '.......kkBBlllllBBlccYbY.',
      '..........kBB.yf....YY...',
    ],
  },
];

const PARROT_INK: Record<string, Ink> = {
  k: ['k.plumeDk', 2], B: ['k.plume', 2], l: ['k.plume', 3], o: ['k.gold', 3], c: ['k.beak', 3],
  b: ['k.bill', 2], Y: ['k.bill', 1], w: ['k.eye', 3], G: ['k.ghost', 3], g: ['k.ghostDk', 3],
  y: ['k.gold', 3], f: ['k.bill', 1],
};

type Draw = (r: Raster, t: Xf, m: (k: string) => number, f: number) => void;

const parrotPose: Draw = (r, t, m, pose) => {
  const p = PARROT[pose] ?? PARROT[0];
  pix(r, t, m, p.rows, PARROT_INK, p.ax, p.ay);
};

/** Projectiles with a top and a bottom fly upright both ways. */
const upright = (t: Xf) => (Math.cos(t.ang) < 0 ? new Xf(t.ox, t.oy, t.ang, 1, -1) : t);

/** The parrot's dive: wings swept back, its long tail streaming into a wake of ghostlight. */
const parrotDive: Draw = (r, t0, m, f) => {
  const t = upright(t0);
  const d = f ? -0.8 : 0;
  const plume = m('k.plume'), dk = m('k.plumeDk'), gh = m('k.ghost'), ghd = m('k.ghostDk');
  // The wake.
  r.fill(t.poly([-6, -0.8, -12, -1.6 + d, -17 + f, -0.4, -12, 0.6, -6, 0.6]), ghd, { group: 1 });
  r.line(t.x(-7, -0.4), t.y(-7, -0.4), t.x(-14 + f, -0.6), t.y(-14 + f, -0.6), gh, 3, 1);
  // Far wing, the long tail.
  r.fill(t.poly([0.5, 1.6, -3.6, 7 + d, -9.6, 8.4 + d, -5.2, 3]), dk, { group: 2, bevel: 1 });
  r.fill(t.poly([-3.6, 0.6, -11.6, -0.4, -12.2, -1.4, -3.6, -1]), dk, { group: 3, bevel: 0.8 });
  r.fill(t.poly([-10, -0.2, -12.6, -0.6, -12.6, -1.4, -10, -1.2]), gh, { group: 3 });
  // Body, head, the hooked bone beak and a green eye.
  r.fill(t.ell(0, 0, 4.6, 2.2, -0.05), plume, { group: 4, bevel: 1.6 });
  r.fill(t.ell(0.6, -1, 3.4, 1), m('k.gold'), { group: 4, bevel: 0.8 });
  r.fill(t.circ(4.2, 0.8, 2.2), plume, { group: 4, bevel: 1.4 });
  r.fill(t.ell(4.8, 0.9, 1.3, 1), m('k.beak'), { group: 4, bevel: 0.6, noLine: true });
  r.fill(t.poly([5.8, 1.8, 7.8, 1.2, 8.2, -0.4, 7.2, -1.2, 6.6, -0.2, 5.8, 0]), m('k.bill'), { group: 5, bevel: 0.8 });
  r.dot(t.x(4.8, 1.2), t.y(4.8, 1.2), m('k.eye'), 3, 5);
  // Near wing raised and swept back, a gold patch, its tips trailing ghostlight.
  r.fill(t.poly([3, 1.2, 0.4, 4.4, -4, 6.6 + d, -11.4, 7.4 + d, -7, 3.4, -2, 1.2]), plume, { group: 6, bevel: 1.2 });
  r.fill(t.poly([1.4, 2.2, -1.4, 4.2, -3, 3.2, -0.6, 1.6]), m('k.gold'), { group: 6, bevel: 0.6 });
  r.fill(t.poly([-7.4, 5.2 + d * 0.8, -11.4, 7.4 + d, -8, 6.8 + d]), dk, { group: 6, bevel: 0.8 });
  r.dot(t.x(-12.2, 7.8 + d), t.y(-12.2, 7.8 + d), gh, 3, 6);
  r.dot(t.x(-13.4 + f, 8.2 + d), t.y(-13.4 + f, 8.2 + d), ghd, 3, 6);
};

const sprite = (frames: number, draw: Draw): ProjArt => ({
  frames, outline: true,
  draw: (r, t, f, h) => draw(r, t, (k) => h(PM[k as PK]), f),
});

const ghostParrot: SkinArt = {
  mats: {
    // Stock names (icon materials and the stock dive's), in case anything draws the stock way.
    hawk: R(SEA), hawkLight: R(SEA), beak: bone(), eye: ghost(), cord: gold(),
    feather: R(SEA), featherDark: R(TAR), belly: gold(), hawkEye: ghost(),
    ...PARROT_SPECS,
  },
  glow: [0xc0ffe8, 0x18947c],
  icon(r, t, m) {
    // The parrot perched on the stock of a tarnished gold anchor, its long tail hanging past the shank,
    // wisps of ghostlight rising round it.
    const anc = m('k.anchor'), plume = m('k.plume'), dk = m('k.plumeDk'), gh = m('k.ghost');
    // The anchor: ring, stock, shank and the curved arms with their flukes.
    r.fill(subtract(t.circ(-3, 7.4, 2), t.circ(-3, 7.4, 1)), anc, { group: 1, bevel: 0.8 });
    r.fill(t.cap(-3, 5.4, -3, -9.4, 1), anc, { group: 2, bevel: 1 });
    r.fill(bend(t, [-10.6, -3.6, 0.9, -9, -8, 1, -6, -10.4, 1, -3, -11.2, 1.1, 0, -10.4, 1, 3, -8, 1, 4.6, -3.6, 0.9]), anc, { group: 2, bevel: 1 });
    r.fill(union(t.poly([-12.2, -2.2, -10.6, -6.2, -8.6, -4]), t.poly([6.2, -2.2, 4.6, -6.2, 2.6, -4])), anc, { group: 2, bevel: 0.9 });
    // The tail, hanging down past the shank and fading into ghostlight.
    r.fill(t.poly([2.2, 2.6, 0.4, -6, -0.6, -9.4, 0.8, -9.6, 3.6, 2.2]), dk, { group: 3, bevel: 1 });
    r.fill(t.poly([0.2, -6.6, -0.6, -9.4, 0.8, -9.6, 1.4, -6.8]), gh, { group: 3 });
    r.fill(t.cap(-8.6, 3.2, 2.6, 3.2, 1), anc, { group: 4, bevel: 1 });
    r.fill(union(t.circ(-9, 3.2, 1.3), t.circ(3.4, 3.2, 1.3)), anc, { group: 4, bevel: 1 });
    // Body and folded wing with a gold patch, head, beak and eye.
    r.fill(t.ell(3.6, 7.4, 3, 4.6, -0.35), plume, { group: 5, bevel: 2.2 });
    r.fill(t.poly([3, 11, 0, 7, 0.6, 2.6, 3.4, 4, 4.2, 8]), dk, { group: 6, bevel: 1.4 });
    r.fill(t.poly([2.8, 9.6, 1.2, 7.4, 2.6, 6.2, 3.8, 8.2]), m('k.gold'), { group: 6, bevel: 0.8 });
    r.fill(t.circ(5.6, 11.2, 2.6), plume, { group: 7, bevel: 1.6 });
    r.fill(t.ell(6.4, 10.8, 1.8, 1.5), m('k.beak'), { group: 7, bevel: 0.8, noLine: true });
    r.fill(t.poly([7, 12.6, 9.4, 12.2, 10.4, 10, 9.4, 8.6, 8.6, 9.8, 7.4, 10]), m('k.bill'), { group: 8, bevel: 1 });
    r.dot(t.x(6.6, 11.2), t.y(6.6, 11.2), m('k.eye'), 3, 8);
    r.dot(t.x(9.6, 9), t.y(9.6, 9), m('k.bill'), 1, 8);
    // Talons on the stock.
    r.fill(union(t.cap(3, 4.2, 2.6, 3.6, 0.5), t.cap(4.6, 4.2, 4.6, 3.6, 0.5)), m('k.bill'), { group: 8, bevel: 0.5 });
    // Ghost wisps.
    for (const [x, y] of [[-7.4, 9.6], [-6.6, 11], [9.6, 4.6], [10.4, 6]]) r.dot(t.x(x, y), t.y(x, y), gh, 3, 9);
  },
  proj: { perch: sprite(5, parrotPose), hawk: sprite(2, parrotDive) },
};

// -----------------------------------------------------------------------------
// Captain's Tricorn
// -----------------------------------------------------------------------------

function captainsTricorn(): SkinArt {
  // A great tar-black tricorn edged in tarnished gold lace, a bullet notch torn out of its brim, a bone
  // skull-and-crossbones on the front flap with ghostlight in its eyes, a white gull feather sweeping back,
  // and a dark sea-green bandana underneath, its tails flapping in the wind.
  const head = (): HeadSkin => ({
    mats: {
      'h.felt': material(tar()), 'h.lace': material(gold()), 'h.bone': material(bone()), 'h.eye': material(ghost()),
      'h.gull': material(R(LINEN, { tex: barbs })), 'h.gullTip': material(R(SLATE)), 'h.band': material(sea()),
    },
    draw(r, H, m, g, sway) {
      const s = sway * 1.8, ph = r.phase % 4, fl = [0, 0.5, 0.8, 0.3][ph];
      // Bandana tails from the knot at the nape.
      r.fill(H.poly([-6.4, 0.6, -10 - s, -1.4 + fl * 0.5, -11.4 - s * 1.2, -0.6 + fl, -10.6 - s, -2.6 + fl * 0.6, -6.6, -1.4]), m('h.band'), { group: g, bevel: 0.8, toneBias: -1, local: H });
      r.fill(H.poly([-6.2, -0.6, -8.8 - s, -4.4 - fl * 0.3, -10.2 - s * 1.1, -4.6 - fl * 0.2, -8.8 - s, -5.6, -6, -2.4]), m('h.band'), { group: g, bevel: 0.8, local: H });
      // The bandana over the head down to the brow, the knot.
      const cap = hairCap(H, 2.6, -3.6, 1.1);
      r.fill(cap, m('h.band'), { group: g, bevel: 2.4, local: H });
      // Bone-white spots on the bandana.
      for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) {
        const x = -7 + i * 2.6 + (j % 2) * 1.3, y = -3.4 + j * 2.3;
        const px = H.x(x, y), py = H.y(x, y);
        if (cap.sdf(px, py) < -0.8) r.dot(px, py, m('h.bone'), 2, g);
      }
      r.fill(H.circ(-6.6, -0.2, 1.3), m('h.band'), { group: g, bevel: 1 });
      // The gull feather tucked under the brim, sweeping back on the wind: white with a slate tip.
      const fa = 3.42 + s * 0.03 + fl * 0.03;
      const fx = -7.2, fy = 9.2;
      const sh = feather(H, fx, fy, fa, 8.4, 1.35, -0.05);
      r.fill(sh, m('h.gull'), { group: 52, bevel: 1, local: H });
      const tx = fx + Math.cos(fa) * 7.8, ty = fy + Math.sin(fa) * 7.8 - 0.4;
      r.fill(intersect(sh, H.circ(tx, ty, 2)), m('h.gullTip'), { group: 52, bevel: 0.6, noLine: true });
      // The crown.
      r.fill(H.ell(-0.6, 9.4, 5.8, 3.8), m('h.felt'), { group: g, bevel: 2.4, toneBias: -1 });
      // The brim cocked up fore and aft, a notch torn out of the top edge.
      const top = [-11.6, 12.4, -9.2, 10.2, -5.8, 9, -4.4, 8.8, -3.8, 7.8, -3.2, 8.7, -1, 8.4, 3.2, 8.5, 7.2, 9.5, 10.8, 12];
      const brim = H.poly([...top, 9.6, 6.6, 4, 4.4, -2.4, 4.3, -8.4, 6.2, -11.4, 9.8]);
      r.fill(brim, m('h.felt'), { group: g, bevel: 1.8 });
      // Gold lace along the edge, broken at the notch.
      for (let i = 2; i < top.length; i += 2) {
        if (i === 6 || i === 8) continue;
        r.line(H.x(top[i - 2], top[i - 1] - 0.4), H.y(top[i - 2], top[i - 1] - 0.4), H.x(top[i], top[i + 1] - 0.4), H.y(top[i], top[i + 1] - 0.4), m('h.lace'), 3, g);
      }
      r.dot(H.x(10.4, 11.5), H.y(10.4, 11.5), m('h.lace'), 4, g);
      r.dot(H.x(-11.2, 11.9), H.y(-11.2, 11.9), m('h.lace'), 4, g);
      // Skull and crossbones on the front flap.
      const bx = 1.8, by = 6.7;
      r.line(H.x(bx - 1.8, by - 1.4), H.y(bx - 1.8, by - 1.4), H.x(bx + 1.8, by + 1.2), H.y(bx + 1.8, by + 1.2), m('h.bone'), 3, 53);
      r.line(H.x(bx - 1.8, by + 1.2), H.y(bx - 1.8, by + 1.2), H.x(bx + 1.8, by - 1.4), H.y(bx + 1.8, by - 1.4), m('h.bone'), 3, 53);
      r.fill(union(H.circ(bx, by + 0.3, 1.25), H.rect(bx, by - 0.9, 0.7, 0.45)), m('h.bone'), { group: 53, bevel: 0.9 });
      r.dot(H.x(bx - 0.5, by + 0.2), H.y(bx - 0.5, by + 0.2), m('h.eye'), 3, 53);
      r.dot(H.x(bx + 0.5, by + 0.2), H.y(bx + 0.5, by + 0.2), m('h.eye'), 3, 53);
    },
  });
  return { head, ...FX };
}

// -----------------------------------------------------------------------------
// Dread Captain's Coat
// -----------------------------------------------------------------------------

function captainsCoat(): SkinArt {
  // A long tar-black frock coat: tails down to the knee lined in sea-green silk, their hems tattered, a tall
  // collar standing behind the neck, gold-fringed epaulettes, tarnished gold lace on every edge, a linen jabot
  // spilling from the throat pinned with a ghostlight gem, and gold buttons down the front.
  return {
    mats: {
      jerkin: tar(), jerkinDark: R(TAR),
      'k.coat': tar(), 'k.lining': sea(silk), 'k.gold': gold(), 'k.linen': linen(),
      'k.gem': ghost(), 'k.belt': R(TAR, { shiny: true }),
    },
    chest: {
      torso: 'k.coat', sleeve: 'k.coat', sleeveLen: 1, forearm: 'k.coat', trim: 'k.gold', belt: 'k.belt',
      back(r, T, m, c) {
        const top = c.top, s = c.sway * 3, ph = r.phase % 4;
        // The tails: from the back of the waist down to the knee, swinging out behind, the hem in rags.
        const hem: number[] = [];
        const N = 5;
        for (let i = 0; i <= N; i++) {
          const u = i / N, rip = Math.sin(ph * Q + i * 1.7) * 0.6;
          hem.push(-9.4 - s * 1.3 + u * 9.6 + s * u * 0.6, -13.6 + u * 2 + (i % 2 ? 1.4 : 0) + rip);
        }
        const outline = [-0.6, top - 4, -4.2, top - 5, -6.2 - s * 0.4, 1, -8.4 - s, -7, ...hem, 1.4, -3];
        const lining = outline.map((v, i) => (i % 2 ? v - 0.5 : v - 1.3));
        r.fill(T.poly(lining), m('k.lining'), { group: 40, bevel: 1.6, toneBias: -1, softLight: true, local: T });
        r.fill(T.poly(outline), m('k.coat'), { group: 41, bevel: 2.6, softLight: true, local: T });
        // The rags of the hem fraying into ghostlight, a wisp drifting off one tip and then the next.
        for (let i = 0; i <= N; i += 2) {
          const hx = hem[i * 2], hy = hem[i * 2 + 1];
          r.dot(T.x(hx, hy + 0.4), T.y(hx, hy + 0.4), m('k.gem'), 3, 41);
          if (((i >> 1) + ph) % 3 === 0) r.dot(T.x(hx - 0.6, hy - 1.4), T.y(hx - 0.6, hy - 1.4), m('k.gem'), 3, 41);
        }
        // Gold lace down the back edge of the tails, the vent seam.
        r.line(T.x(-6.4 - s * 0.4, 0), T.y(-6.4 - s * 0.4, 0), T.x(-9 - s * 1.2, -12.4), T.y(-9 - s * 1.2, -12.4), m('k.gold'), 3, 41);
        r.line(T.x(-3.4, -1), T.y(-3.4, -1), T.x(-4.6 - s * 0.8, -11), T.y(-4.6 - s * 0.8, -11), m('k.coat'), 0, 41);
        // The tall collar standing behind the neck, lined in silk and edged in gold.
        const col = [-0.2, top + 0.2, -4.4, top - 0.6, -6.2, top + 3.4, -3.4, top + 4.4, -0.6, top + 2.6];
        r.fill(T.poly(col), m('k.coat'), { group: 42, bevel: 1.4 });
        r.fill(T.poly([-0.8, top + 0.6, -4.2, top, -5.4, top + 3.2, -3.2, top + 3.8, -1, top + 2.4]), m('k.lining'), { group: 42, bevel: 1, noLine: true });
        r.line(T.x(-6.2, top + 3.4), T.y(-6.2, top + 3.4), T.x(-3.4, top + 4.4), T.y(-3.4, top + 4.4), m('k.gold'), 3, 42);
      },
      shoulder(r, S, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        // A gold epaulette board, its bullion fringe hanging over the shoulder.
        for (let i = 0; i < 6; i++) {
          const x = -2.4 + i * 0.95;
          r.line(S.x(x, 1), S.y(x, 1), S.x(x - 0.2, -1.6 - (i % 2) * 0.5), S.y(x - 0.2, -1.6 - (i % 2) * 0.5), m('k.gold'), c.far ? 1 : i % 2 ? 2 : 3, c.g);
        }
        r.fill(S.ell(0, 1.6, 2.8, 1.2), m('k.gold'), { ...o, bevel: 0.9 });
        r.fill(S.ell(0.1, 1.7, 1.6, 0.6), m('k.coat'), { ...o, bevel: 0.5, noLine: true });
      },
      over(r, T, m, c) {
        const top = c.top, f = c.body.chestPush * 0.7;
        // The open front: linen shirt in a V, the lapel edged in gold.
        r.fill(T.poly([f + 0.8, top + 0.4, f + 4.8, top + 0.4, f + 4, top - 6.4]), m('k.linen'), { group: c.g, bevel: 1, softLight: true });
        r.line(T.x(f + 4.9, top + 0.2), T.y(f + 4.9, top + 0.2), T.x(f + 4.1, top - 6.8), T.y(f + 4.1, top - 6.8), m('k.gold'), 3, c.g);
        r.line(T.x(f + 0.6, top + 0.2), T.y(f + 0.6, top + 0.2), T.x(f + 3.8, top - 6.8), T.y(f + 3.8, top - 6.8), m('k.gold'), 2, c.g);
        // The jabot: ruffles spilling down the V, and the gem pin.
        for (const [x, y, rx] of [[3.8, -1.4, 1.5], [4.1, -2.8, 1.35], [3.9, -4.1, 1.1]] as const) {
          r.fill(T.ell(f + x, top + y, rx, 0.85), m('k.linen'), { group: c.g + 20, bevel: 0.7 });
        }
        r.fill(T.circ(f + 4, top - 1.6, 0.7), m('k.gem'), { group: c.g + 20 });
        // Gold buttons, two rows down the front.
        for (const y of [top - 8, top - 10.2, top - 12.4]) {
          r.dot(T.x(f + 4.8, y), T.y(f + 4.8, y), m('k.gold'), 4, c.g);
          r.dot(T.x(f + 2.8, y + 0.2), T.y(f + 2.8, y + 0.2), m('k.gold'), 2, c.g);
        }
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Corsair Breeches
// -----------------------------------------------------------------------------

function corsairBreeches(): SkinArt {
  // Tar-black canvas breeches striped in faded verdigris, gathered at the knee under a gold-buckled band,
  // a sea-green silk sash wound round the hips, its fringed tails swinging at the side with a few gold coins.
  return {
    mats: {
      'l.cloth': tar(undefined), 'l.stripe': R(VERD), 'l.sash': sea(silk), 'l.gold': gold(), 'l.band': R(TAR, { shiny: true }),
    },
    legs: {
      mat: 'l.cloth', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.55, shin: null,
      over(r, t, m, c) {
        const w = c.w, L = c.len, ph = r.phase % 4, s = [0, 0.4, 0.7, 0.3][ph];
        const o = { group: c.g, toneBias: c.bias };
        // Stripes down the leg.
        const leg = t.cap(L, 0, 0, 0, w, c.body.kneeR + 0.5);
        const stripes: Shape[] = [];
        for (const y of [-w * 0.6, -w * 0.05, w * 0.5]) stripes.push(t.poly([L + 2, y - 0.45, L + 2, y + 0.45, -2, y * 0.85 + 0.45, -2, y * 0.85 - 0.45]));
        r.fill(intersect(leg, union(...stripes)), m('l.stripe'), { group: c.g, bevel: 0.3, toneBias: c.bias, noLine: true });
        // The knee band and its buckle.
        r.fill(t.cap(0.8, -w - 0.4, 0.8, w + 0.4, 0.75), m('l.band'), { ...o, bevel: 0.7 });
        r.fill(t.rect(0.8, w * 0.45, 0.7, 0.6), m('l.gold'), { ...o, bevel: 0.5 });
        // The sash round the hips.
        r.fill(t.cap(L * 0.9, -w - 0.6, L * 0.93, w + 0.8, 1.35), m('l.sash'), { ...o, bevel: 1.1, local: t });
        if (c.far) return;
        // Its tails hanging from the knot at the side, swinging, gold fringe at their ends, coins on the knot.
        r.fill(t.poly([L * 0.9, w * 0.1, L * 0.88, w + 0.6, L * 0.3, w + 1.4 + s, L * 0.36, w * 0.5 + s]), m('l.sash'), { group: c.g + 20, bevel: 0.9, local: t });
        r.fill(t.poly([L * 0.86, -w * 0.3, L * 0.86, w * 0.4, L * 0.42, -w * 0.1 + s * 0.8, L * 0.46, -w * 0.6 + s * 0.8]), m('l.sash'), { group: c.g + 21, bevel: 0.8, toneBias: -1, local: t });
        for (const y of [w * 0.6, w + 1.1]) r.dot(t.x(L * 0.28, y + s), t.y(L * 0.28, y + s), m('l.gold'), 3, c.g + 20);
        r.fill(t.circ(L * 0.9, w * 0.4, 1.1), m('l.sash'), { group: c.g + 22, bevel: 0.8 });
        r.dot(t.x(L * 0.78, w * 0.9), t.y(L * 0.78, w * 0.9), m('l.gold'), 4, c.g + 22);
        r.dot(t.x(L * 0.72, w * 0.2), t.y(L * 0.72, w * 0.2), m('l.gold'), 3, c.g + 22);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Seawolf Boots
// -----------------------------------------------------------------------------

function seawolfBoots(): SkinArt {
  // Tall polished tar-black boots with wide bucket cuffs edged in tarnished gold, a strap at the ankle with a
  // gold wolf's-head buckle whose eye glows green, a square toe, and sea-foam of ghostlight curling round the heel.
  return {
    mats: {
      'b.boot': R(TAR, { shiny: true, tex: polish }), 'b.cuff': tar(), 'b.gold': gold(), 'b.foam': ghost(), 'b.foamDk': ghostDk(),
      'b.strap': R(EBONY),
    },
    boots: {
      mat: 'b.boot', height: 0.94, bulk: 0.42, trim: 'b.cuff', wing: null, knee: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias }, w = c.w, ph = r.phase % 4;
        // The bucket cuff flaring at the top, gold along its rim.
        const top = c.top;
        r.fill(shin.poly([top - 3.4, -w - 0.4, top + 0.9, -w - 1.7, top + 1.3, w + 1.9, top - 3.4, w + 0.6]), m('b.cuff'), { ...o, bevel: 1.3 });
        r.line(shin.x(top + 0.7, -w - 1.5), shin.y(top + 0.7, -w - 1.5), shin.x(top + 1.1, w + 1.7), shin.y(top + 1.1, w + 1.7), m('b.gold'), c.far ? 2 : 3, c.g);
        // The square toe.
        r.fill(foot.poly([c.toe - 2.4, 1.2, c.toe + 0.6, 0.9, c.toe + 0.8, -1.3, c.toe - 2.4, -1.4]), m('b.boot'), { ...o, bevel: 1 });
        // Ankle strap and the wolf's-head buckle.
        r.fill(shin.rect(1.8, 0, 0.5, w + 0.3), m('b.strap'), { ...o, bevel: 0.5 });
        r.fill(shin.poly([1.1, w * 0.1, 2.6, w * 0.15, 3, w * 0.55, 2.2, w * 0.9, 1.1, w * 0.8]), m('b.gold'), { ...o, bevel: 0.6 });
        if (c.far) return;
        r.dot(shin.x(2.2, w * 0.6), shin.y(2.2, w * 0.6), m('b.foam'), 3, c.g);
        // Sea-foam curling back off the heel, a wave rolling through it.
        const k = [0, 0.5, 1, 0.5][ph];
        r.fill(foot.poly([-1.6, -1.6, -3.4 - k, -1.2, -4.2 - k, -0.2 + k * 0.4, -3.2 - k * 0.6, -0.6, -1.8, -0.8]), m('b.foamDk'), { group: c.g + 20 });
        r.dot(foot.x(-3.6 - k, -0.4 + k * 0.4), foot.y(-3.6 - k, -0.4 + k * 0.4), m('b.foam'), 3, c.g + 20);
        r.dot(foot.x(c.toe + 1.2, -1.2 + (ph % 2) * 0.6), foot.y(c.toe + 1.2, -1.2 + (ph % 2) * 0.6), m('b.foam'), 3, c.g + 20);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const C = {
  foam: css(0xe8fff6), crest: css(GHOST[3]), sea: css(GHOST[2]), deep: css(GHOST_DK[2]), dark: css(GHOST_DK[1]),
  gull: css(0xf4f2ea), gullDk: css(SLATE[2]), gold: css(GOLD[3]),
};

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function corsairAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  // A ring of ghostly tide round the feet: three waves rolling round it, foam on their crests.
  const RX = 17, RY = 4, N = 40;
  ring(g, x, y, RX, RY, N, layer, (g, px, py, i) => {
    const w = Math.sin((i / N) * Math.PI * 6 - t * 3.2);
    if (w < -0.4) { g.globalAlpha = 0.55; g.fillStyle = C.dark; g.fillRect(px, py, 1, 1); g.globalAlpha = 1; return; }
    g.fillStyle = w > 0.7 ? C.crest : w > 0.1 ? C.sea : C.deep;
    g.fillRect(px, py, 1, 1);
    // Foam riding the crest, curling over the way the wave rolls.
    if (w > 0.7) {
      g.fillStyle = C.foam;
      g.fillRect(px, py - 1, 1, 1);
      if (w > 0.93) g.fillRect(px + (Math.sin((i / N) * Math.PI * 2) > 0 ? -1 : 1), py - 2, 1, 1);
    }
  });
  // Spray thrown up off the crests, arcing out and falling.
  for (let k = 0; k < 4; k++) {
    const a = k * 1.57 + 0.4 + Math.floor(t * 0.8 + k * 0.25) * 2.1;
    const s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const u = (t * 0.8 + k * 0.25) % 1;
    const px = Math.round(x + Math.cos(a) * (RX + u * 4)), py = Math.round(y + s * RY - Math.sin(u * Math.PI) * 9);
    g.globalAlpha = 1 - u * 0.6;
    g.fillStyle = u < 0.5 ? C.foam : C.crest;
    g.fillRect(px, py, 1, 1);
  }
  g.globalAlpha = 1;
  // Two ghost gulls wheeling high round the captain, wings beating now and then.
  for (let k = 0; k < 2; k++) {
    const a = t * (0.55 + k * 0.12) + k * Math.PI;
    const s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const px = Math.round(x + Math.cos(a) * (22 + k * 4)), py = Math.round(y - 50 - k * 6 + s * 3 + Math.sin(t * 1.3 + k) * 2);
    const flap = Math.floor(t * 5 + k * 2) % 4 === 0;
    const dir = Math.cos(a + Math.PI / 2) > 0 ? 1 : -1;
    g.globalAlpha = 0.85;
    g.fillStyle = C.gull;
    g.fillRect(px - 2, py + (flap ? 1 : -1), 2, 1);
    g.fillRect(px + 1, py + (flap ? 1 : -1), 2, 1);
    g.fillRect(px, py, 1, 1);
    g.fillStyle = C.gullDk;
    g.fillRect(px + (dir > 0 ? 3 : -3), py + (flap ? 1 : -1), 1, 1);
  }
  g.globalAlpha = 1;
}

export const CORSAIR: Record<string, SkinArt> = {
  'rapier.corsair': { weapon: gravetideCutlass, ...FX },
  'hand_crossbow.corsair': { weapon: flintlockRepeater, proj: { bolt: boltProj }, ...FX },
  'hunter_hawk.corsair': ghostParrot,
  'hawkeye_hood.corsair': captainsTricorn(),
  'leather_jerkin.corsair': captainsCoat(),
  'acrobat_trousers.corsair': corsairBreeches(),
  'savate_boots.corsair': seawolfBoots(),
};
