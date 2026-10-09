import { ring, type Layer } from '../../auraKit';
import { css } from '../../pixel/color';
import { material, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, flameTongue, mats, Q, wrap } from './kit';

/**
 * Epic set: Jade Dragon Emperor. Imperial China: deep crimson lacquer,
 * imperial gold and carved green jade, cloud scrolls, dragon heads with
 * whiskers and manes, jade gems glowing faintly and the flaming pearl the
 * dragon chases.
 */

/** Crimson lacquer, deep to a warm highlight. */
const LACQUER = [0x3a0a12, 0x6a121a, 0xa41e22, 0xd8402e, 0xff9a6a];
/** Imperial gold. */
const GOLD = [0x6a3a10, 0xa8701c, 0xe0a830, 0xf8d860, 0xfff4c0];
/** Carved jade. */
const JADE = [0x0e4a3a, 0x1a7a5a, 0x2ea880, 0x6ad8a8, 0xd8fff0];
/** Jade lit from within (gems, eyes). */
const JADE_LIT = [0x1a7a5a, 0x2ea880, 0x5ad8a0, 0x8af0c0, 0xe0fff0];
/** Black silk, a little warm. */
const SILK = [0x0e0a10, 0x1c1620, 0x2e2632, 0x4a3e4e, 0x7a6a78];
/** Crimson silk for capes, manes and tassels. */
const CRIMSON = [0x2a0410, 0x500818, 0x841424, 0xb82a32, 0xe86a5a];
/** Celadon steel for blades. */
const STEEL = [0x2e4a4a, 0x5a8a84, 0x9cc8bc, 0xd8f4ea, 0xffffff];
const PEARL = [0x9a8470, 0xd8c4a8, 0xf4ead8, 0xfffaf0, 0xffffff];
/** Flame materials: glow draws at tone 3, so each ramp puts its colour there. */
const FL = { base: 0xff7a1a, glow: true, ramp: [0x8a1a0a, 0xc83a10, 0xff7a1a, 0xff8a20, 0xffd060] };
const FL_HOT = { base: 0xffd860, glow: true, ramp: [0xd84a10, 0xff8a20, 0xffc840, 0xffe070, 0xfff8d0] };
const FL_DEEP = { base: 0xd02a14, glow: true, ramp: [0x4a0808, 0x7a1008, 0xa01a0c, 0xd02a14, 0xff6a2a] };
const CLOUD = [0x7a9a92, 0xbcd4cc, 0xeef4ea, 0xffffff, 0xffffff];

/** Lamellar: small lacquered scales in staggered rows, dark seams between. */
const lamellar = (px = 2.4, py = 2): Tex => (x, y) => {
  const row = Math.floor(y / py);
  if (wrap(y, py) < 0.45) return -1;
  return wrap(x + (row % 2) * px * 0.5, px) < 0.45 ? -1 : 0;
};
/** A gleam sliding along gold, one step per frame. */
const gleam = (period = 8): Tex => (x, y, ph) => (wrap(x + y * 0.5 - ph * 2, period) < 1.1 ? 1 : 0);
/** Dragon scale on lacquer: arcs in rows. */
const scales: Tex = (x, y) => {
  const row = Math.floor(y / 1.8);
  const u = wrap(x + (row % 2) * 1.3, 2.6) - 1.3, v = wrap(y, 1.8);
  return u * u * 0.5 + (v - 1.8) * (v - 1.8) < 0.55 ? 0 : -1;
};
/** Jade light breathing over the loop. */
const breathe: Tex = (_x, _y, ph) => [0, 1, 0, -1][ph % 4];

const lacquer = (tex?: Tex) => ({ base: LACQUER[2], ramp: LACQUER, shiny: true, step: 0.14, tex });
const gold = (tex: Tex | undefined = gleam()) => ({ base: GOLD[2], ramp: GOLD, shiny: true, tex });
const jade = () => ({ base: JADE[2], ramp: JADE, shiny: true });
const jadeLit = () => ({ base: JADE_LIT[2], ramp: JADE_LIT, glow: true, tex: breathe });
const crimson = (tex?: Tex) => ({ base: CRIMSON[2], ramp: CRIMSON, tex });
const silk = (tex?: Tex) => ({ base: SILK[2], ramp: SILK, tex });

const FX = epicFx(0xfff0a0, 0x2ea880, 'twinkle', 0xffe080);

/** Particles the full set sheds in battle. */
export const JADEDRAGON_FX: SkinFx = { spark: 0xfff0a0, spark2: 0x2ea880, kind: 'twinkle' };

/** A small cloud scroll: a curl with a hole and a tail, centred at (x, y), `s` its radius, `dir` the tail's side (±1). */
function cloudScroll(F: Xf, x: number, y: number, s: number, dir = 1): Shape {
  return union(
    subtract(F.circ(x, y, s), F.circ(x + s * 0.25 * dir, y + s * 0.2, s * 0.42)),
    F.circ(x - s * 1.1 * dir, y - s * 0.25, s * 0.72),
    F.cap(x - s * 1.1 * dir, y - s * 0.75, x + s * 0.9 * dir, y - s * 0.9, s * 0.3),
  );
}

// -----------------------------------------------------------------------------
// Dragon Emperor's Guandao
// -----------------------------------------------------------------------------

function guandao(): WeaponArt {
  // A red lacquer pole banded in gold; at the top a gold dragon head whose open jaws let out a broad
  // curved blade, a crimson mane streaming back over it, whiskers trailing, a tassel swaying below
  // and a jade ring hung from the throat.
  return {
    tip: 46,
    grip2: 13,
    mats: {
      shaft: material(lacquer()), band: material(gold()), head: material(gold(gleam(7))),
      blade: material({ base: STEEL[2], ramp: STEEL, shiny: true, step: 0.15, tex: (x, y, ph) => (wrap(x * 0.8 - y * 0.6 - ph * 2.2, 9) < 1 ? 1 : 0) }),
      mane: material(crimson((x) => (wrap(x, 1.6) < 0.4 ? -1 : 0))), jade: material(jade()), eye: material(jadeLit()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      const sw = [0, 0.6, 1, 0.5][ph];
      // The tassel hanging from under the head, swaying.
      fillAll(r, [t.poly([29.4, -0.8, 27.6, -3.4 - sw * 0.4, 25.2 - sw, -5.6, 26.6 - sw * 0.5, -5.8, 25.4 - sw * 1.2, -7.4, 28.2 - sw * 0.4, -4.6, 30.4, -1])], m('mane'), o, 0.8, -1);
      fillAll(r, [t.circ(29.4, -1, 0.75)], m('band'), o, 0.6);
      fillAll(r, [t.cap(-19.5, 0, 31, 0, 1.05)], m('shaft'), o, 1);
      // Gold butt spike and bands down the pole.
      fillAll(r, [t.poly([-19, -1.3, -21, -1.1, -23.6, 0, -21, 1.1, -19, 1.3])], m('band'), o, 1);
      fillAll(r, [t.rect(-12, 0, 0.5, 1.35), t.rect(-2.6, 0, 0.45, 1.3), t.rect(2.6, 0, 0.45, 1.3), t.rect(20, 0, 0.5, 1.35)], m('band'), o, 1);
      // The jade ring on a gold loop.
      r.fill(subtract(t.circ(24.4, -3.2, 1.6), t.circ(24.4, -3.2, 0.75)), m('jade'), { group: g, bevel: 0.9, toneBias: o.toneBias, local: o.local });
      r.line(t.x(24.6, -1), t.y(24.6, -1), t.x(24.4, -1.7), t.y(24.4, -1.7), m('band'), 3, g);
      // The blade: a broad crescent, edge bellying out, its tip curling back, a notch in its spine.
      const blade = t.poly([
        32.6, -0.8, 35, -2.8, 38.4, -4.2, 41.8, -4.6, 44.4, -3.6, 46, -1.4, 46.8, 1.4, 46.4, 3.4,
        44.8, 1.8, 42, 1.3, 39.4, 1.4, 38.4, 3, 37.4, 1.4, 34.6, 1.2, 33, 1.2,
      ]);
      fillAll(r, [blade], m('blade'), o, 1.8);
      // A gold cloud-scroll inlay along the blade.
      r.line(t.x(35.6, -0.2), t.y(35.6, -0.2), t.x(41.6, -1.2), t.y(41.6, -1.2), m('band'), 3, g);
      r.fill(cloudScroll(t, 43, -0.6, 0.9, 1), m('band'), { group: g, bevel: 0.5, noLine: true });
      // The mane streaming back over the head.
      fillAll(r, [t.poly([31.4, 1.2, 29.6, 3.4, 27.4, 3.6 + sw * 0.4, 25.2, 4.2 + sw * 0.7, 26.8, 2.8 + sw * 0.3, 25.6, 2.2 + sw * 0.5, 28.2, 1.2, 30, 0.6])], m('mane'), o, 0.9);
      // A jade horn swept back.
      fillAll(r, [t.cap(30.6, 1.6, 27.8, 2.8, 0.55, 0.22)], m('jade'), o, 0.6);
      // The dragon head: skull, upper snout and lower jaw open round the blade.
      fillAll(r, [union(
        t.ell(31, 0.2, 2.1, 1.7),
        t.poly([31, 1.6, 33.4, 1.6, 34.8, 1.2, 35.2, 0.4, 33.6, 0.2, 31.6, 0]),
        t.poly([30.6, -1.4, 32.6, -1.8, 34.4, -1.8, 34.2, -1.1, 32.2, -0.6]),
      )], m('head'), o, 1);
      r.dot(t.x(32, 0.8), t.y(32, 0.8), m('eye'), 3, g);
      // Whiskers trailing back from the snout, swaying.
      const wk = [[35, 0.6, 33.2, -2.6 - sw * 0.5, 30.4, -3.4 - sw], [34.4, 1.4, 33.4, 3.4 + sw * 0.4, 30.8, 4.4 + sw * 0.8]];
      for (const [ax, ay, bx, by, cx, cy] of wk) {
        r.line(t.x(ax, ay), t.y(ax, ay), t.x(bx, by), t.y(bx, by), m('band'), 3, g);
        r.line(t.x(bx, by), t.y(bx, by), t.x(cx, cy), t.y(cx, cy), m('band'), 2, g);
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Cloudpiercer Repeater
// -----------------------------------------------------------------------------

function chukonu(): WeaponArt {
  // A red lacquer repeating crossbow: the tall bolt magazine riding on top with its lever, gold cloud
  // scrolls on the stock, a prod whose tips are small gold dragon heads, a jade bead at the stock.
  return {
    tip: 9.4,
    mats: {
      stock: material(lacquer()), mag: material(lacquer(lamellar(3, 1.6))), gold: material(gold()), prod: material(gold(gleam(6))),
      string: material({ base: 0xf0e0b0 }), bolt: material({ base: JADE_LIT[3], ramp: JADE_LIT, glow: true }),
      jade: material(jadeLit()), lever: material({ base: 0x5a3a24 }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // The stock.
      fillAll(r, [t.poly([-2.4, -1.5, 9, -1.1, 9.4, 0, 9, 1.1, 1, 1.4, -1, 3.8, -3, 3.6, -1.8, 0.6])], m('stock'), o, 1.4);
      // The magazine: a tall box riding on top (+y), bolt tips peeking from its front, the cocking lever behind.
      r.line(t.x(0.2, 5.4), t.y(0.2, 5.4), t.x(-3.4, 7), t.y(-3.4, 7), m('lever'), 2, g);
      r.line(t.x(-3.4, 7), t.y(-3.4, 7), t.x(-2.6, 2), t.y(-2.6, 2), m('lever'), 1, g);
      fillAll(r, [t.poly([-0.6, 1.2, 4.4, 1.2, 4.2, 6.4, 0, 6.8])], m('mag'), o, 1.2);
      fillAll(r, [t.rect(2, 6.6, 2.4, 0.5, 0.2), t.rect(2.1, 1.5, 2.6, 0.4)], m('gold'), o, 0.6);
      for (const y of [2.6, 3.8, 5]) r.dot(t.x(4.6, y), t.y(4.6, y), m('bolt'), 3, g);
      // A gold cloud scroll on the stock and a jade bead at the heel.
      r.fill(cloudScroll(t, 4.6, -0.1, 0.75), m('gold'), { group: g, bevel: 0.5, noLine: true });
      r.fill(t.circ(-2, 1.2, 0.7), m('jade'), { group: g });
      // The prod, its tips gold dragon heads.
      fillAll(r, [t.poly([6.6, -0.5, 4.6, 5, 5.8, 5.4, 8, 0, 5.8, -5.4, 4.6, -5])], m('prod'), o, 1);
      for (const s of [-1, 1]) {
        fillAll(r, [t.poly([4.2, s * 4.6, 6.6, s * 5.6, 7.2, s * 6.6, 5.4, s * 6.8, 3.8, s * 6])], m('prod'), o, 0.8);
        r.dot(t.x(5.6, s * 6), t.y(5.6, s * 6), m('jade'), ph % 2 ? 3 : 4, g);
      }
      const pull = o.pull ?? 1;
      const sx = 5 - pull * 3.5;
      r.line(t.x(4.6, 4.8), t.y(4.6, 4.8), t.x(sx, 0), t.y(sx, 0), m('string'), 3, 9);
      r.line(t.x(sx, 0), t.y(sx, 0), t.x(4.6, -4.8), t.y(4.6, -4.8), m('string'), 3, 9);
      if (pull > 0.5) r.line(t.x(sx, 0.3), t.y(sx, 0.3), t.x(10, 0.3), t.y(10, 0.3), m('bolt'), 3, 9);
    },
  };
}

// -----------------------------------------------------------------------------
// Battle sprites
// -----------------------------------------------------------------------------

const JM = mats({
  shaft: { base: LACQUER[2], ramp: LACQUER, shiny: true }, gold: { base: GOLD[2], ramp: GOLD, shiny: true },
  jade: { base: JADE_LIT[2], ramp: JADE_LIT, glow: true }, jadeHot: { base: JADE_LIT[4], glow: true },
  streak: { base: GOLD[3], glow: true, ramp: [0x8a5a10, 0xc88a20, 0xf0c040, GOLD[3], GOLD[4]] }, streakHot: { base: 0xfff8d8, glow: true },
  pearl: { base: PEARL[2], ramp: PEARL, shiny: true }, pearlHot: { base: 0xfffbe8, glow: true },
  flame: FL, flameHot: FL_HOT, flameDeep: FL_DEEP,
});

const boltProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A red lacquer bolt with a jade head, a gold streak trailing it, sparks peeling off.
    const w = [0, 0.5, 0, -0.5][f];
    r.fill(t.poly([-3, -1.2, -9, -0.6 + w * 0.5, -15, w, -9, 0.6 + w * 0.5, -3, 1.2]), h(JM.streak), { group: 1 });
    r.line(t.x(-3, 0), t.y(-3, 0), t.x(-10, w * 0.4), t.y(-10, w * 0.4), h(JM.streakHot), 3, 1);
    r.fill(t.cap(-5, 0, 3, 0, 0.7), h(JM.shaft), { group: 2, bevel: 0.8 });
    r.fill(t.rect(-1, 0, 0.4, 0.8), h(JM.gold), { group: 2, bevel: 0.6 });
    for (const s of [-1, 1]) r.fill(t.poly([-3, s * 0.5, -6.2, s * 2, -5.4, s * 0.3]), h(JM.gold), { group: 3, bevel: 0.6 });
    r.fill(t.poly([2.4, -1.7, 4, -1.2, 7.8, 0, 4, 1.2, 2.4, 1.7, 3, 0]), h(JM.jade), { group: 4 });
    r.dot(t.x(5.2, 0.2), t.y(5.2, 0.2), h(JM.jadeHot), 3, 4);
    const sx = -6 - f * 2.4;
    r.dot(t.x(sx, 1.4 - w), t.y(sx, 1.4 - w), h(JM.streakHot), 3, 1);
  },
};

const PEARL_FRAMES = 8;

/** The flaming pearl at (0, 0) in frame t: tongues of flame looping round it, `f` of `n` frames. */
function flamingPearl(r: Raster, t: Xf, f: number, n: number, R: number, h: (k: keyof typeof JM) => number, g0 = 1): void {
  const spin = (f / n) * ((Math.PI * 2) / 3);
  // Three tongues of flame wrapping round the pearl, leaning the way they turn; the back half behind it.
  const tongues = [0, 1, 2].map((k) => spin + (k * Math.PI * 2) / 3 + 0.4);
  const draw = (a: number, back: boolean) => {
    const F = new Xf(t.x(Math.cos(a) * R * 0.75, Math.sin(a) * R * 0.75), t.y(Math.cos(a) * R * 0.75, Math.sin(a) * R * 0.75), a - Math.PI / 2, t.sx, t.sy);
    const len = R * (1.7 + 0.3 * Math.sin(a * 3 + f));
    flameTongue(r, F, 0, 0, R * 0.62, len, -R * 1.2, h(back ? 'flameDeep' : 'flame'), h(back ? 'flame' : 'flameHot'), g0);
  };
  // A swirling corona of flame behind the pearl: pinwheel lobes turning with the tongues.
  const halo = (rIn: number, rOut: number, lobes: number, twist: number) => {
    const pts: number[] = [];
    for (let i = 0; i < lobes * 2; i++) {
      const th = (i / (lobes * 2)) * Math.PI * 2 + spin + (i % 2 ? twist : 0);
      const rr = i % 2 ? rOut + Math.sin(i * 1.7 + f) * R * 0.12 : rIn;
      pts.push(Math.cos(th) * rr, Math.sin(th) * rr);
    }
    return t.poly(pts);
  };
  r.fill(halo(R * 1.05, R * 1.75, 6, 0.32), h('flameDeep'), { group: g0 });
  r.fill(halo(R * 1, R * 1.4, 6, 0.45), h('flame'), { group: g0, noLine: true });
  for (const a of tongues) if (Math.sin(a) > 0.2) draw(a, true);
  // The pearl.
  r.fill(t.circ(0, 0, R), h('pearl'), { group: g0 + 1, bevel: R * 0.9 });
  r.fill(t.circ(-R * 0.3, R * 0.3, R * 0.32), h('pearlHot'), { group: g0 + 1, noLine: true });
  for (const a of tongues) if (Math.sin(a) <= 0.2) draw(a, false);
  // Licks of flame spiralling up off the top.
  const u = wrap(f, n / 2) / (n / 2);
  r.dot(t.x(Math.sin(u * 6) * R * 0.5, R * (1.4 + u * 1.2)), t.y(Math.sin(u * 6) * R * 0.5, R * (1.4 + u * 1.2)), h('flameHot'), 3, g0 + 2);
}

const coreProj: ProjArt = {
  frames: PEARL_FRAMES,
  outline: true,
  draw(r, t0, f, h) {
    // The pearl floats at the shoulder, bobbing, its flames looping round it.
    const bob = [0, 0.4, 0.6, 0.4, 0, -0.4, -0.6, -0.4][f];
    const t = new Xf(t0.ox, t0.oy - bob, 0, 1, 1);
    flamingPearl(r, t, f, PEARL_FRAMES, 3, (k) => h(JM[k]));
  },
};

const pearlSkin: SkinArt = {
  mats: {
    // Stock names: the echo stone drawn the stock way.
    stone: { base: PEARL[2], ramp: PEARL, shiny: true }, rune: FL,
    'k.pearl': { base: PEARL[2], ramp: PEARL, shiny: true }, 'k.pearlHot': { base: 0xfffbe8, glow: true },
    'k.flame': FL, 'k.flameHot': FL_HOT, 'k.flameDeep': FL_DEEP,
    'k.cloud': { base: GOLD[2], ramp: GOLD, shiny: true }, 'k.jade': { base: JADE[2], ramp: JADE, shiny: true },
  },
  glow: [0xfff0c0, 0xe04a18],
  icon(r, t, m) {
    // The pearl wreathed in flame over a gold cloud scroll.
    const k: Record<keyof typeof JM, string> = {
      pearl: 'k.pearl', pearlHot: 'k.pearlHot', flame: 'k.flame', flameHot: 'k.flameHot', flameDeep: 'k.flameDeep',
      shaft: 'k.flame', gold: 'k.cloud', jade: 'k.jade', jadeHot: 'k.pearlHot', streak: 'k.flame', streakHot: 'k.pearlHot',
    };
    r.fill(union(cloudScroll(t, -5, -9, 2.6, 1), cloudScroll(t, 5.4, -9.6, 2.2, -1), t.cap(-8, -11.6, 8, -11.8, 0.9)), m('k.cloud'), { group: 1, bevel: 1.2 });
    flamingPearl(r, new Xf(t.ox, t.oy - 1.5, 0), 1, PEARL_FRAMES, 5, (n) => m(k[n]), 3);
  },
  proj: { core: coreProj },
};

// -----------------------------------------------------------------------------
// Dragon Emperor's Helm
// -----------------------------------------------------------------------------

function dragonEmperorHelm(): SkinArt {
  // A red lacquer helm shaped like a dragon's head: a gold brow and snout over the face with a jade eye,
  // jade horns sweeping back, gold whiskers trailing and a crimson mane falling down the back.
  return {
    head: () => ({
      mats: {
        'h.lacquer': material(lacquer(scales)), 'h.gold': material(gold(gleam(7))), 'h.jade': material(jade()),
        'h.eye': material(jadeLit()), 'h.mane': material(crimson((x, y) => (wrap(x * 0.6 + y * 0.9, 1.8) < 0.45 ? -1 : 0))),
        'h.tooth': material({ base: 0xf4ecd8 }),
      },
      draw(r, H, m, g, sway) {
        const ph = r.phase % 4, s = sway * 1.4, rip = [0, 0.5, 0.8, 0.4][ph];
        // The mane streaming from the crown down the back, its locks rippling.
        r.fill(H.poly([
          1, 8.2, -4, 8.4, -8.4 - s * 0.3, 5.6, -11.6 - s - rip, 0.6, -12.8 - s - rip, -4.6, -11 - s - rip * 0.6, -2.6,
          -10.8 - s - rip * 0.8, -7.2, -8.8 - s - rip * 0.4, -4.4, -8 - s * 0.8 - rip * 0.6, -7.4, -6.6 - s * 0.5, -2.6, -4.4, 0.4,
        ]), m('h.mane'), { group: 49, bevel: 1.6, softLight: true, local: H });
        // A jade horn: a beam sweeping back with a tine rising off it.
        const horn = (pts: number[][], tine: number[], bias: number, gg: number) => {
          const segs: Shape[] = [];
          for (let i = 0; i < pts.length - 1; i++) segs.push(H.cap(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i][2], pts[i + 1][2]));
          segs.push(H.cap(tine[0], tine[1], tine[2], tine[3], 0.55, 0.2));
          r.fill(union(...segs), m('h.jade'), { group: gg, bevel: 1, toneBias: bias, local: H });
        };
        horn([[2, 7, 0.8], [-1.6, 9.6, 0.65], [-5.4, 10.8, 0.45], [-8.4, 12.6, 0.2]], [-2.2, 9.8, -2, 12.6], -1, 50);
        // The dome in scaled lacquer, a gold brow band.
        const dome = intersect(H.ell(-0.4, 0.9, 7.6, 7.5), H.poly([8, 2.2, 8, 12, -12, 12, -12, -3.6, -2, -2.6, 0.6, 1.6]));
        r.fill(dome, m('h.lacquer'), { group: g, bevel: 3, local: H });
        r.fill(intersect(dome, H.rect(0, 2.6, 10, 0.7)), m('h.gold'), { group: g, flat: 2, noLine: true });
        // The cheek guard, gold edged.
        r.fill(H.poly([0.8, 2, 3, 2, 2.6, -2.6, 1, -3.8, -0.4, -1]), m('h.lacquer'), { group: g, bevel: 1.2, local: H });
        r.line(H.x(3, 1.8), H.y(3, 1.8), H.x(2.4, -2.8), H.y(2.4, -2.8), m('h.gold'), 3, g);
        // The dragon's head over the brow: a gold snout jutting forward with a row of teeth and a nostril,
        // a heavy brow ridge over its jade eye.
        r.fill(H.poly([0.6, 2.6, 5, 2.4, 8.4, 2.2, 10.2, 2.8, 10.4, 4.2, 8.8, 4.8, 6.6, 5.6, 4.8, 7.4, 1.6, 8]), m('h.gold'), { group: 51, bevel: 1.2, local: H });
        for (const x of [5.6, 7, 8.4]) r.dot(H.x(x, 1.9), H.y(x, 1.9), m('h.tooth'), 3, 51);
        r.dot(H.x(9.6, 3.8), H.y(9.6, 3.8), m('h.mane'), 0, 51);
        r.fill(H.ell(5, 5, 1.1, 0.75), m('h.eye'), { group: 51 });
        r.line(H.x(3.4, 6.6), H.y(3.4, 6.6), H.x(6.4, 6), H.y(6.4, 6), m('h.gold'), 4, 51);
        // A jade pearl on the crown.
        r.fill(H.circ(0.4, 8.4, 0.9), m('h.eye'), { group: 51 });
        // Whiskers drooping from the snout tip and trailing back from the jaw; both sway.
        const wsk = (pts: number[], tone: number) => {
          for (let i = 0; i < pts.length - 2; i += 2) r.line(H.x(pts[i], pts[i + 1]), H.y(pts[i], pts[i + 1]), H.x(pts[i + 2], pts[i + 3]), H.y(pts[i + 2], pts[i + 3]), m('h.gold'), tone, 51);
        };
        wsk([10.2, 2.6, 10.8, 0.6, 10.4 - s * 0.5 - rip * 0.6, -1.8], 2);
        wsk([-0.2, -1.6, -3, -3.2 - rip * 0.3, -6 - s, -3.4 - rip * 0.6, -8 - s - rip, -2.4], 3);
        // Near horn, sweeping back from the temple.
        horn([[0, 6, 1.1], [-3.6, 8, 0.9], [-7.4, 9.2, 0.65], [-10.6, 11.4, 0.4], [-12, 13.2, 0.2]], [-6.6, 9, -7.2, 12.2], 0, 53);
        r.fill(H.rect(-1.2, 6.6, 0.5, 1.2, 0.2), m('h.gold'), { group: 53, bevel: 0.6 });
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Jade Dragon Lamellar
// -----------------------------------------------------------------------------

function jadeLamellar(): SkinArt {
  // Red lacquer lamellar laced in gold, gold dragon-head pauldrons with jade eyes, a carved jade disc on
  // the breast in a gold mount, and a short crimson silk cape with a gold-embroidered hem flowing behind.
  return {
    mats: {
      plate: lacquer(lamellar()), plateDark: gold(),
      'k.gold': gold(gleam(6)), 'k.lam': lacquer(lamellar(2.2, 1.8)), 'k.jade': jade(), 'k.eye': jadeLit(),
      'k.cape': crimson((x, y) => (Math.sin(x * 0.7 + y * 0.2) > 0.75 ? -1 : 0)), 'k.hem': gold(undefined),
      'k.mane': crimson(),
    },
    chest: {
      pauldron: null, spikes: null,
      back(r, T, m, c) {
        // A short silk cape, its hem rippling, gold embroidery along the hem.
        const s = c.sway * 2.6, top = c.top, ph = r.phase % 4;
        const hem: number[] = [];
        for (let i = 0; i <= 4; i++) {
          const u = i / 4, rip = Math.sin(ph * Q + i * 1.7) * 0.6;
          hem.push(-10.6 - s * 1.2 + u * 8.6 + s * u * 0.6, -8.4 + u * 2 + rip);
        }
        const outline = [-0.6, top + 0.8, -5.6, top - 0.2, -9 - s * 0.6, top - 5, ...hem, -1.2, -3];
        const cape = T.poly(outline);
        r.fill(cape, m('k.cape'), { group: 40, bevel: 2.4, toneBias: -1, softLight: true });
        const inner: number[] = [];
        for (let i = hem.length - 2; i >= 0; i -= 2) inner.push(hem[i], hem[i + 1] + 1.3);
        const band = T.poly([...hem.map((v, i) => (i % 2 ? v - 1 : v)), ...inner]);
        r.fill(intersect(cape, band), m('k.hem'), { group: 40, flat: 2, noLine: true });
      },
      shoulder(r, S, m, c) {
        // Two lames of lamellar under a gold dragon head that snarls out over the arm, its mane behind.
        const o = { group: c.g, toneBias: c.bias };
        r.fill(S.poly([-3, 1.2, -4.6, -0.4 - (r.phase % 2) * 0.3, -3.4, -1, -2.6, 0]), m('k.mane'), { ...o, bevel: 0.8 });
        r.fill(S.ell(0, -0.8, 3.2, 2.4), m('k.lam'), { ...o, bevel: 1.6, local: S });
        r.fill(S.rect(0, -2.6, 3, 0.4, 0.2), m('k.gold'), { ...o, flat: 2, noLine: true });
        r.fill(union(S.ell(0, 1.2, 2.8, 1.8), S.poly([1.2, 1.8, 4.4, 1, 4.6, 0, 2.4, -0.2])), m('k.gold'), { ...o, bevel: 1.2, local: S });
        r.fill(S.cap(-0.6, 2.4, -2.8, 3.8, 0.55, 0.2), m('k.jade'), { ...o, bevel: 0.6 });
        r.dot(S.x(1.6, 1.6), S.y(1.6, 1.6), m('k.eye'), 3, c.g);
        r.dot(S.x(3.6, 0.2), S.y(3.6, 0.2), m('k.mane'), 0, c.g);
      },
      over(r, T, m, c) {
        // A gold collar and the jade disc over the heart, a hole carved through it.
        const x = c.body.chestPush * 0.7 + 1.1, y = c.top - 4.8;
        r.fill(T.cap(-3.2, c.top - 0.3, x + 1.8, c.top - 1, 0.6), m('k.gold'), { group: c.g, bevel: 0.6 });
        r.line(T.x(x - 0.6, c.top - 1.4), T.y(x - 0.6, c.top - 1.4), T.x(x, y + 2), T.y(x, y + 2), m('k.gold'), 3, c.g);
        r.fill(T.circ(x, y, 2.2), m('k.gold'), { group: c.g, bevel: 0.8 });
        r.fill(subtract(T.circ(x, y, 1.6), T.circ(x, y, 0.5)), m('k.jade'), { group: c.g, bevel: 1 });
        r.dot(T.x(x - 0.6, y + 0.8), T.y(x - 0.6, y + 0.8), m('k.eye'), 4, c.g);
        // A gold lacing cord across the waist.
        r.line(T.x(-3, 1.6), T.y(-3, 1.6), T.x(x + 1.6, 1.6), T.y(x + 1.6, 1.6), m('k.gold'), 2, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Jade Dragon Tassets
// -----------------------------------------------------------------------------

function jadeTassets(): SkinArt {
  // Black silk trousers under red lacquer lamellar tassets laced and hemmed in gold, gold knee guards,
  // and a gold belt plaque set with a glowing jade.
  return {
    mats: {
      stoneLeg: silk(), stoneDark: gold(),
      'l.lam': lacquer(lamellar(2.2, 1.7)), 'l.gold': gold(gleam(6)), 'l.jade': jadeLit(), 'l.tassel': crimson(),
    },
    legs: {
      mat: 'stoneLeg', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.35,
      over(r, t, m, c) {
        const part = { group: c.g + 21, toneBias: c.bias };
        const ph = r.phase % 4, L = c.len, w = c.w, fl = [0, 0.4, 0.7, 0.3][ph];
        const hem = L * 0.42;
        const tas = [L + 1.4, -w - 0.6, L + 1.4, w + 1.4, hem - fl * 0.3, w + 1.8 + fl * 0.4, hem + 0.6, -w - 0.2];
        const P = t.poly(tas, 0.3);
        r.fill(P, m('l.lam'), { ...part, bevel: 1.4, local: t });
        // A gold hem, and a gold lacing cord across the plates.
        r.fill(intersect(P, t.poly([hem + 0.9, -w - 3, hem + 0.9 - fl * 0.3, w + 3, hem - 2, w + 3, hem - 2, -w - 3])), m('l.gold'), { ...part, flat: 2, noLine: true });
        const ly = L * 0.72;
        r.line(t.x(ly, -w), t.y(ly, -w), t.x(ly, w + 1.2), t.y(ly, w + 1.2), m('l.gold'), 3, c.g + 21);
        // A small gold knee cop.
        r.fill(t.ell(0.2, w * 0.35, c.body.kneeR * 0.75, c.body.kneeR * 0.6), m('l.gold'), { group: c.g + 20, toneBias: c.bias, bevel: 0.9 });
        if (c.far) return;
        // The belt plaque: a gold tablet with the jade in it, a small red tassel hanging.
        const px = L + 0.4, py = w * 0.5;
        r.fill(t.cap(px - 0.4, py + 0.2, px - 2.6 - fl, py + 1.6, 0.4, 0.55), m('l.tassel'), { ...part, group: c.g + 22, bevel: 0.6 });
        r.fill(t.rect(px, py, 1.1, 1.3, 0.3), m('l.gold'), { ...part, group: c.g + 22, bevel: 0.8 });
        r.fill(t.circ(px, py, 0.6), m('l.jade'), { group: c.g + 22 });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Cloudstep Boots
// -----------------------------------------------------------------------------

function cloudstep(): SkinArt {
  // Black silk boots with gold cuffs, toes that curl up in gold, a gold cloud scroll on the shin,
  // and small clouds curling off the heel.
  return {
    mats: {
      boot: silk((x) => (wrap(x, 2.6) < 0.4 ? -1 : 0)), bootDark: gold(),
      'k.gold': gold(gleam(6)), 'k.cloud': { base: CLOUD[2], ramp: CLOUD }, 'k.jade': jadeLit(),
    },
    boots: {
      height: 0.72, bulk: 0.32, trim: 'bootDark',
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w;
        // The upturned gold toe.
        r.fill(union(
          foot.poly([c.toe - 1.6, -1.1, c.toe + 0.5, -1.1, c.toe + 1, 0, c.toe - 1.6, 1]),
          foot.cap(c.toe + 0.5, -0.2, c.toe + 1.4, 1.6, 0.6, 0.35),
        ), m('k.gold'), { ...o, bevel: 0.7 });
        // The gold cuff with a jade bead, a cloud scroll on the shin.
        r.fill(shin.rect(c.top - 0.3, 0, 0.55, w + 0.35), m('k.gold'), { ...o, bevel: 0.5 });
        if (!c.far) r.dot(shin.x(c.top - 0.3, w * 0.4), shin.y(c.top - 0.3, w * 0.4), m('k.jade'), 3, c.g);
        r.fill(cloudScroll(shin, c.top * 0.5, w * 0.1, 0.9, -1), m('k.gold'), { ...o, bevel: 0.5, noLine: true });
        if (c.far) return;
        // Clouds curling off the heel, puffing up and drifting back.
        const back = new Xf(foot.ox, foot.oy, foot.ang, -foot.sx, foot.sy);
        const u = ph / 4;
        r.fill(back.circ(1.6 + u * 2.4, 0.2 + u * 1.2, 0.6 + u * 0.6), m('k.cloud'), { group: c.g, bevel: 0.6, noLine: true });
        if (ph >= 1) r.fill(back.circ(2.6 + u * 2, 0.8 + u * 0.4, 0.5 + u * 0.4), m('k.cloud'), { group: c.g, bevel: 0.6, noLine: true });
        if (ph === 3) r.dot(back.x(5, 2.2), back.y(5, 2.2), m('k.cloud'), 2, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = {
  gold: css(GOLD[3]), goldDk: css(GOLD[1]), goldHi: css(GOLD[4]), jade: css(JADE[3]), jadeDk: css(JADE[1]),
  red: css(CRIMSON[3]), eye: css(0xe0fff0), cloud: css(0xf4f0e0), cloudDk: css(0xc8b890), pearl: css(0xfff4d0), flame: css(0xff8a20),
};

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function jadedragonAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  // Gold cloud scrolls drifting slowly round the ground ring.
  const RX = 15, RY = 3.8;
  for (let k = 0; k < 5; k++) {
    const a = k * 1.257 + t * 0.25, s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const px = Math.round(x + Math.cos(a) * RX), py = Math.round(y + s * RY);
    g.globalAlpha = 0.85;
    g.fillStyle = AC.cloudDk; g.fillRect(px - 3, py, 6, 1);
    g.fillStyle = AC.cloud; g.fillRect(px - 2, py - 1, 3, 1); g.fillRect(px + 1, py - 2, 2, 1);
    g.fillStyle = AC.gold; g.fillRect(px + 2, py - 1, 1, 1);
  }
  g.globalAlpha = 0.45;
  g.fillStyle = AC.jadeDk;
  const step = Math.floor(t * 4);
  ring(g, x, y, RX, RY, 24, layer, (g, px, py, i) => { if ((i + step) % 3 === 0) g.fillRect(px, py, 2, 1); });
  g.globalAlpha = 1;
  // The dragon swimming round the fighter: a slim gold body undulating behind its head, a jade belly,
  // a crimson crest along its back, passing behind and in front of the fighter.
  const N = 20, R = 19, H = 20, head = t * 1.1;
  const at = (i: number) => {
    const a = head - i * 0.11, s = Math.sin(a);
    return { a, s, px: Math.round(x + Math.cos(a) * R), py: Math.round(y - H + s * 5 + Math.sin(t * 3.2 - i * 0.45) * 2) };
  };
  for (let i = N; i >= 1; i--) {
    const { s, px, py } = at(i);
    if ((s < 0) !== (layer === 'back')) continue;
    const thin = i > N - 4;
    g.fillStyle = (i >> 1) % 2 ? AC.gold : AC.goldDk; g.fillRect(px, py, thin ? 1 : 2, 2);
    if (i % 2 === 0 && !thin) { g.fillStyle = i % 4 ? AC.jadeDk : AC.jade; g.fillRect(px, py + 2, 2, 1); }
    if (i % 3 === 1) { g.fillStyle = AC.red; g.fillRect(px, py - 1, 1, 1); }
    if (i === N) { g.fillStyle = AC.red; g.fillRect(px - 1, py - 2, 1, 2); g.fillRect(px + 1, py + 1, 1, 2); }
    // Claws on two of the segments.
    if (i === 5 || i === 13) { g.fillStyle = AC.goldHi; g.fillRect(px, py + 2 + (i === 5 ? 1 : 0), 1, 1); }
  }
  const hd = at(0);
  if ((hd.s < 0) === (layer === 'back')) {
    // The head, facing the way it swims: snout, jade horns, an eye, whiskers streaming behind.
    const { px, py } = hd, fx = hd.s > 0 ? -1 : 1;
    g.fillStyle = AC.gold; g.fillRect(px - 1, py - 1, 3, 3); g.fillRect(px + fx * 2, py, 1, 2); g.fillRect(px + fx * 3, py + 1, 1, 1);
    g.fillStyle = AC.goldHi; g.fillRect(px, py - 1, 1, 1);
    g.fillStyle = AC.jade; g.fillRect(px - fx, py - 2, 1, 1); g.fillRect(px - fx * 2, py - 3, 1, 1);
    g.fillStyle = AC.eye; g.fillRect(px + fx, py, 1, 1);
    g.fillStyle = AC.goldDk;
    const wv = Math.floor(t * 4) % 2;
    g.fillRect(px + fx * 2, py + 2, 1, 1); g.fillRect(px + fx, py + 3, 1, 1); g.fillRect(px, py + 3 + wv, 1, 1);
    // The flaming pearl it chases, just ahead.
    const qa = hd.a + 0.42, qs = Math.sin(qa);
    const qx = Math.round(x + Math.cos(qa) * R), qy = Math.round(y - H - 3 + qs * 5);
    g.fillStyle = AC.flame; g.fillRect(qx - 1, qy, 3, 1); g.fillRect(qx, qy - 1 - (Math.floor(t * 6) % 2), 1, 1);
    g.fillStyle = AC.pearl; g.fillRect(qx, qy, 1, 1);
  }
  g.globalAlpha = 1;
}

export const JADEDRAGON: Record<string, SkinArt> = {
  'spear.guandao': { weapon: guandao, ...FX },
  'hand_crossbow.chukonu': { weapon: chukonu, proj: { bolt: boltProj }, ...FX },
  'echo_stone.pearl': pearlSkin,
  'iron_helm.dragonemperor': dragonEmperorHelm(),
  'plate_armor.lamellar': jadeLamellar(),
  'stonehide_tassets.jadedragon': jadeTassets(),
  'leather_boots.cloudstep': cloudstep(),
};
