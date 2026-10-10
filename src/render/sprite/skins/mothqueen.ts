import { ring, type Layer } from '../../auraKit';
import { css } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, mats, wrap } from './kit';

/**
 * Epic set: Moth Queen's Court. Fae royalty of the moonlit wood: pale
 * luna-moth green wings edged in mauve with amber eyespots, night-violet
 * velvet, white moth fur, moonsilver and moonstones, silver dust drifting
 * off everything, and soft teal mushrooms glowing in a fairy ring. The light
 * lives in the moonstones, the eyespots' hearts, the mushroom caps and a few
 * motes of dust; the wings themselves stay matte and pale.
 */

/** Luna-moth wing green: pale, cool and soft. */
const LUNA = [0x3c6c5a, 0x68a488, 0xa4dabc, 0xd0f0dc, 0xf2fff6];
/** The mauve-maroon leading edge of a luna wing. */
const EDGE = [0x3a1c34, 0x5e3252, 0x8c5276, 0xb87c9c, 0xe8b8d0];
/** Eyespot ring: amber with a rosy rim. */
const SPOT = [0x6a341c, 0xa8602a, 0xe0a050, 0xf6d084, 0xfff4d4];
/** Moonstone: milky blue-white, self-lit. */
const MOONSTONE = [0x4a68a8, 0x7aa0d8, 0xb8d6f6, 0xe6f2ff, 0xffffff];
/** Moonsilver. */
const SILVER = [0x464a66, 0x747a9a, 0xaab0cc, 0xdae0f2, 0xffffff];
/** Night-violet velvet (with a hot tone for silver dust). */
const VELVET = [0x140e28, 0x21183e, 0x322658, 0x4a3a7c];
/** White moth fur. */
const FUZZ = [0x84829c, 0xb6b4ca, 0xe0dfec, 0xf4f4fa, 0xffffff];
/** Glowing mushroom caps: teal to white. */
const SHROOM = [0x1a5a6a, 0x2a98a6, 0x5ad6cc, 0xa8fcee, 0xf0fffc];
/** Feathery antennae: pale amber. */
const ANT = [0x5a3c1c, 0x8a6232, 0xc49454, 0xe8c88a, 0xfff2cc];
/** Silver birch bark. */
const BIRCH = [0x3a3a4c, 0x6c6c80, 0xaeaec0, 0xd6d6e2, 0xf2f2f8];
const WHITE = 0xffffff, DUST = 0xf0fff6, MOTH = 0x8ad8b8;

const FX = epicFx(DUST, MOTH, 'twinkle', 0xd8fff0);

/** Particles the full set sheds in battle: silver dust and moth-green motes. */
export const MOTHQUEEN_FX: SkinFx = { spark: DUST, spark2: MOTH, kind: 'twinkle' };

// -----------------------------------------------------------------------------
// Textures
// -----------------------------------------------------------------------------

/** Faint veins fanning along a wing (wing-local space). */
const veins: Tex = (x, y) => (wrap(y * 1.1 - x * 0.18, 1.9) < 0.3 ? -1 : 0);
/** Silver dust on velvet: sparse motes that flare in turn (hot tone 4) over a soft nap. */
const dust = (cell = 2.8, density = 0.012): Tex => (x, y, ph) => {
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
  const h = hash(cx * 3 + 1, cy * 5 + 2);
  if (h < density && wrap(Math.floor(h * 97) + ph, 4) < 2) return 4;
  return Math.sin(x * 0.7 + Math.sin(y * 0.4) * 1.4) > 0.8 ? -1 : 0;
};
/** Moth fur: soft tufts. */
const tufts: Tex = (x, y) => (hash(Math.floor(x * 1.4), Math.floor(y * 1.4)) < 0.16 ? -1 : 0);
/** Birch bark: dark dashes across a pale trunk. */
const bark: Tex = (x, y) => (wrap(x, 3.1) < 0.5 && Math.abs(y + Math.sin(x) * 0.4) < 0.7 ? -2 : hash(Math.floor(x * 2), Math.floor(y * 2)) < 0.07 ? -1 : 0);
/** A glint sliding along a part, one step per frame. */
const sheen = (period = 8, speed = 2, w = 1): Tex => (x, _y, ph) => (wrap(x - ph * speed, period) < w ? 1 : 0);
/** A moonstone's milky light rolling over it. */
const milk: Tex = (_x, _y, ph) => [0, 1, 0, -1][ph % 4];
/** Silk wound round a leg: diagonal wraps. */
const silk: Tex = (x, y) => (wrap(x * 0.8 + y * 1.3, 2.2) < 0.42 ? -1 : 0);

// -----------------------------------------------------------------------------
// Shape helpers
// -----------------------------------------------------------------------------

/**
 * A frame at (x, y) of P pointing along local angle `a`, scaled by `k`; P's
 * handedness is kept and `flip` mirrors the new frame across its own x axis.
 */
function sub(P: Xf, x: number, y: number, a: number, k = 1, flip = 1): Xf {
  const hand = Math.sign(P.sx * P.sy) || 1;
  return new Xf(P.x(x, y), P.y(x, y), P.ang + a * hand, Math.abs(P.sx) * k, Math.abs(P.sy) * k * hand * flip);
}

/** A ring as a polygon (stays round in squashed frames). */
function hoop(F: Xf, cx: number, cy: number, rx: number, ry: number, w: number, n = 24): Shape {
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

/** A crescent moon opening toward angle `dir`. */
function crescent(F: Xf, cx: number, cy: number, R: number, dir: number, bite = 0.45): Shape {
  return subtract(F.circ(cx, cy, R), F.circ(cx + Math.cos(dir) * R * bite, cy + Math.sin(dir) * R * bite, R * 0.86));
}

/** A tapering chain of capsules through [x, y, radius] points. */
function chain(F: Xf, pts: number[][]): Shape {
  const s: Shape[] = [];
  for (let i = 1; i < pts.length; i++) s.push(F.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i - 1][2], pts[i][2]));
  return union(...s);
}

const dot = (r: Raster, F: Xf, x: number, y: number, m: number, tone: number, g?: number) => r.dot(F.x(x, y), F.y(x, y), m, tone, g);

// -----------------------------------------------------------------------------
// The luna-moth wing
// -----------------------------------------------------------------------------

/**
 * A luna forewing in its own frame, ten units long: root at the origin, out
 * along +x, its leading edge on the -y side, a hooked apex.
 */
const FORE = [0, -0.8, 2.4, -2.4, 5.8, -3.1, 8.8, -3, 10.3, -1.9, 10.2, 0.3, 8.4, 2.5, 5, 3.4, 1.6, 1.8];
/** A hindwing: a rounded lobe that runs out into the long, curling luna tail. */
const HIND = [0, -0.7, 2.8, -2.4, 5.8, -2.5, 7.6, -1, 10, -0.2, 13, 0.3, 14.8, 1.4, 14.2, 2.7, 12.6, 1.7, 10.4, 1.9, 8.2, 2.9, 5.4, 3.6, 2.4, 2.8, 0, 1];

/** Materials a wing is painted with (raster handles). */
interface WingInk { wing: number; edge: number; spot: number; eye: number }
interface WingOpts { group: number; toneBias?: number; spots?: boolean; edge?: boolean }

/** The hindwing (and its tail) in frame F (scale = 1/10 of the forewing). */
function hindWing(r: Raster, F: Xf, m: WingInk, o: WingOpts): void {
  const k = Math.abs(F.sy);
  r.fill(F.poly(HIND), m.wing, { group: o.group, bevel: 1.4 * k + 0.4, toneBias: o.toneBias, lightBias: 0.15, local: F });
  if (o.spots !== false && k > 0.3) {
    r.fill(F.circ(4.1, 0.5, 0.95), m.spot, { group: o.group, flat: 2, noLine: true });
    dot(r, F, 4.1, 0.5, m.eye, 3, o.group);
  }
  // The tail's rosy tip.
  r.fill(F.poly([13.2, 0.4, 14.8, 1.4, 14.2, 2.7, 13, 1.8]), m.edge, { group: o.group, flat: 2 + Math.min(0, o.toneBias ?? 0), noLine: true });
}

/** The forewing in frame F: mauve leading edge, an amber eyespot with a lit heart. */
function foreWing(r: Raster, F: Xf, m: WingInk, o: WingOpts): void {
  const k = Math.abs(F.sy);
  r.fill(F.poly(FORE), m.wing, { group: o.group, bevel: 1.6 * k + 0.4, toneBias: o.toneBias, lightBias: 0.2, local: F });
  if (o.edge !== false) r.fill(intersect(F.poly(FORE), F.poly([0, -0.2, 2, -1.25, 6, -1.75, 9.2, -1.4, 10.8, -0.8, 10.8, -4, 0, -4])), m.edge, { group: o.group, bevel: 0.8, toneBias: o.toneBias, noLine: true });
  if (o.spots !== false) {
    r.fill(F.circ(5.4, 0.4, 1.35), m.spot, { group: o.group, flat: 2, noLine: true });
    if (k > 0.6) r.fill(F.circ(5.4, 0.4, 0.75), m.edge, { group: o.group, flat: 1, noLine: true });
    dot(r, F, 5.4, 0.4, m.eye, 3, o.group);
  }
  // A vein down the middle of the wing.
  if (k > 0.9) r.line(F.x(1, 0.2), F.y(1, 0.2), F.x(4, 0.3), F.y(4, 0.3), m.wing, 1 + Math.min(0, o.toneBias ?? 0), o.group);
}

/** A pair of wings, one side, rooted at (x, y) of F: hindwing at angle `hind`, forewing over it at `fore`. */
function wingPair(r: Raster, F: Xf, x: number, y: number, fore: number, hind: number, k: number, flip: number, m: WingInk, o: WingOpts, kh = k): void {
  hindWing(r, sub(F, x, y, hind, kh, flip), m, o);
  foreWing(r, sub(F, x, y, fore, k, flip), m, { ...o, group: o.group + 1 });
}

/**
 * Both sides of a moth seen from above, rooted at (x, y) of F with the body
 * along +x: forewings at ±`fore` from +x, hindwings at ±`hind`, mirrored.
 */
function topWings(r: Raster, F: Xf, x: number, y: number, fore: number, hind: number, k: number, m: WingInk, g: number, o: Omit<WingOpts, 'group'> = {}): void {
  for (const s of [-1, 1]) wingPair(r, F, x, y + s * 0.3, s * fore, s * hind, k, s, m, { ...o, group: g + (s > 0 ? 0 : 2) });
}

// -----------------------------------------------------------------------------
// Moonlit Scepter
// -----------------------------------------------------------------------------

const wingMats = () => ({
  wing: material({ base: LUNA[2], ramp: LUNA, tex: veins }),
  edge: material({ base: EDGE[2], ramp: EDGE }),
  spot: material({ base: SPOT[2], ramp: SPOT, shiny: true }),
  eye: material({ base: MOONSTONE[3], ramp: MOONSTONE, glow: true, tex: milk }),
});

/** A little glowing mushroom on (x, y) of F growing toward +y: a pale stem and a domed teal cap. */
function mushroom(r: Raster, F: Xf, x: number, y: number, h: number, w: number, stem: number, cap: number, g: number, lean = 0): void {
  r.fill(F.cap(x, y, x + lean * 0.5, y + h, 0.45, 0.4), stem, { group: g, bevel: 0.5 });
  r.fill(F.poly([x + lean - w, y + h - 0.2, x + lean - w * 0.7, y + h + w * 0.55, x + lean, y + h + w * 0.8, x + lean + w * 0.7, y + h + w * 0.55, x + lean + w, y + h - 0.2]), cap, { group: g });
}

function moonlitScepter(): WeaponArt {
  // A staff of silver birch crowned by a moonsilver crescent cupping a moonstone, a luna moth perched on its upper
  // horn slowly opening and closing its wings; glowing mushrooms sprout from the bark and silver dust drifts off.
  return {
    tip: 31,
    grip2: 12,
    mats: {
      shaft: material({ base: BIRCH[2], ramp: BIRCH, tex: bark }),
      silver: material({ base: SILVER[2], ramp: SILVER, shiny: true, tex: sheen(8, 2) }),
      fur: material({ base: FUZZ[2], ramp: FUZZ, tex: tufts }),
      ant: material({ base: ANT[2], ramp: ANT }),
      ink: material({ base: 0x2a1a30, ramp: [0x0e0814, 0x1a1024, 0x2a1a30, 0x3e2a46, 0x5a4264] }),
      stone: material({ base: MOONSTONE[2], ramp: MOONSTONE, glow: true, tex: milk }),
      stem: material({ base: FUZZ[3], ramp: FUZZ }),
      cap: material({ base: SHROOM[3], ramp: SHROOM, glow: true }),
      hot: material({ base: WHITE, glow: true }),
      ...wingMats(),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      const ink: WingInk = { wing: m('wing'), edge: m('edge'), spot: m('spot'), eye: m('eye') };
      // The birch shaft, a silver ferrule and bands.
      fillAll(r, [union(t.cap(-20, 0, -6, 0.25, 1.15, 1.05), t.cap(-6, 0.25, 8, -0.2, 1.05, 1.05), t.cap(8, -0.2, 23.4, 0, 1.05, 1.15))], m('shaft'), o, 1);
      fillAll(r, [t.poly([-19.4, -1.3, -21.6, -0.6, -22.2, 0, -21.6, 0.6, -19.4, 1.3]), t.rect(-18.8, 0, 0.55, 1.5), t.rect(5, 0, 0.6, 1.45), t.rect(21.6, 0, 0.6, 1.5)], m('silver'), o, 0.8);
      // Mushrooms sprouting from the bark: a cluster low down, a single one higher up.
      mushroom(r, t, -14.6, 0.9, 1.2, 1.3, m('stem'), m('cap'), g, 0.4);
      mushroom(r, t, -12.8, 0.8, 0.6, 0.9, m('stem'), m('cap'), g, 0.6);
      mushroom(r, new Xf(t.ox, t.oy, t.ang, t.sx, -t.sy), 13.6, 0.9, 0.9, 1.1, m('stem'), m('cap'), g, -0.3);
      // The crescent moon crowning the staff, horns up, the moonstone in its arms.
      fillAll(r, [crescent(t, 26.4, 0, 3.9, 0, 0.44)], m('silver'), o, 1.1);
      r.fill(t.circ(27.6, 0, 2.2), m('stone'), { group: g + 1 });
      r.dot(t.x(27, 0.7), t.y(27, 0.7), m('hot'), 3, g + 1);
      // A luna moth perched on the upper horn, wings raised and slowly opening and closing.
      const B = sub(t, 29.4, 2.6, -Math.PI / 2, 0.8);
      const beat = [0, 0.15, 0.3, 0.15][ph];
      wingPair(r, B, -0.4, 0.6, 1.62 + beat * 0.6, 2.9 + beat * 0.4, 0.52, 1, ink, { group: g + 3, toneBias: -1, spots: false });
      mothBody(r, B, (k) => m(k.slice(2)), g + 5);
      wingPair(r, B, -0.6, 0.4, 1.86 + beat, 3.15 + beat * 0.5, 0.56, 1, ink, { group: g + 7 });
      // Silver dust drifting off the stone, a fresh mote each frame.
      for (let k = 0; k < 2; k++) {
        const u = wrap(ph + k * 2, 4) / 4;
        dot(r, t, 29.8 + u * 2.6, (k ? 1 : -1) * (1.4 + u * 1.6) - 1, m(k ? 'hot' : 'stone'), 3, g + 1);
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Lunar Wing Chakram
// -----------------------------------------------------------------------------

/** The chakram's blades: four luna wings pinwheeling off a silver ring (centre (cx, 0)), turned by `rot`. */
function wingWheel(r: Raster, t: Xf, cx: number, rot: number, k: number, m: WingInk & { silver: number; stone: number }, g: number, bias = 0): void {
  for (let i = 0; i < 4; i++) {
    const a = rot + i * (Math.PI / 2);
    const F = sub(t, cx + Math.cos(a) * 2.6 * k, Math.sin(a) * 2.6 * k, a + 0.75, k * 0.54, 1);
    if (i % 2) hindWing(r, F, m, { group: g + i, toneBias: bias });
    else foreWing(r, F, m, { group: g + i, toneBias: bias });
  }
  r.fill(hoop(t, cx, 0, 3.7 * k, 3.7 * k, 1.3 * k), m.silver, { group: g + 5, bevel: 0.9, toneBias: bias });
  // Moonstones set in the ring between the blades.
  for (let i = 0; i < 4; i++) {
    const a = rot + i * (Math.PI / 2) + Math.PI / 4;
    dot(r, t, cx + Math.cos(a) * 3.05 * k, Math.sin(a) * 3.05 * k, m.stone, 3, g + 5);
  }
}

function lunarChakram(): WeaponArt {
  // A moonsilver ring with four luna wings pinwheeling off it, two with long curling tails, their leading
  // edges honed silver; moonstones in the ring, the grip bound in moth-green silk.
  return {
    tip: 5,
    mats: {
      silver: material({ base: SILVER[2], ramp: SILVER, shiny: true, step: 0.16, tex: sheen(7, 1.75) }),
      grip: material({ base: LUNA[1], ramp: LUNA, tex: (x) => (wrap(x, 1.2) < 0.4 ? -1 : 0) }),
      stone: material({ base: MOONSTONE[3], ramp: MOONSTONE, glow: true, tex: milk }),
      wing: material({ base: LUNA[2], ramp: LUNA, tex: veins }),
      edge: material({ base: SILVER[3], ramp: SILVER, shiny: true }),
      spot: material({ base: SPOT[2], ramp: SPOT, shiny: true }),
      eye: material({ base: MOONSTONE[3], ramp: MOONSTONE, glow: true, tex: milk }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      wingWheel(r, t, 3, 0.35, 1, { wing: m('wing'), edge: m('edge'), spot: m('spot'), eye: m('eye'), silver: m('silver'), stone: m('stone') }, 40, o.toneBias ?? 0);
      fillAll(r, [t.cap(-1.2, -1.5, -1.2, 1.5, 0.95)], m('grip'), o, 1);
      dot(r, t, -1.2, 0, m('silver'), 4, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Battle sprites (their own materials)
// -----------------------------------------------------------------------------

const PM = mats({
  wing: { base: LUNA[3], ramp: LUNA, glow: true },
  wingDeep: { base: LUNA[1], ramp: LUNA, glow: true },
  edge: { base: EDGE[3], ramp: EDGE, glow: true },
  spot: { base: SPOT[3], ramp: SPOT, glow: true },
  hot: { base: WHITE, glow: true },
  stone: { base: MOONSTONE[3], ramp: MOONSTONE, glow: true },
  moon: { base: MOONSTONE[3], ramp: MOONSTONE, glow: true, tex: (x, y) => (hash(Math.floor(x * 0.5) + 3, Math.floor(y * 0.5)) < 0.12 ? -1 : 0) },
  shadow: { base: 0x2a1a44, ramp: [0x120a20, 0x1e1234, 0x2a1a44, 0x3a2858, 0x50407a] },
  silver: { base: SILVER[2], ramp: SILVER, shiny: true, step: 0.16 },
  fur: { base: FUZZ[3], ramp: FUZZ },
  dust: { base: 0xd8e4ff, glow: true },
  teal: { base: SHROOM[2], ramp: SHROOM, glow: true },
});

/** Silver dust scattered along a trail running back from x0 to x1 (half width `w`), reshuffled each frame. */
function glitter(r: Raster, t: Xf, f: number, x0: number, x1: number, w: number, n: number, hot: number, dim: number, g: number): void {
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const x = x0 + (x1 - x0) * u + (hash(k, f) - 0.5) * 2;
    const y = (hash(k + 7, f * 3 + 1) - 0.5) * 2 * w * (1 - u * 0.5);
    r.dot(t.x(x, y), t.y(x, y), (k + f) % 3 ? dim : hot, 3, g);
  }
}

const mothBolt: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A luna moth of moonlight beating its wings, shedding silver dust behind it.
    const fore = [1.15, 1.6, 2.15, 1.6][f], hind = [2.2, 2.45, 2.7, 2.45][f];
    r.fill(t.poly([-2, -1.6, -8, -0.6, -12, 0, -8, 0.6, -2, 1.6]), h(PM.wingDeep), { group: 1 });
    glitter(r, t, f, -3, -14, 2.4, 5, h(PM.hot), h(PM.dust), 1);
    topWings(r, t, 0, 0, fore, hind, 0.7, { wing: h(PM.wing), edge: h(PM.edge), spot: h(PM.spot), eye: h(PM.hot) }, 2);
    r.fill(union(t.ell(-1.4, 0, 2.2, 0.85), t.circ(1, 0, 1.05)), h(PM.hot), { group: 6 });
    for (const s of [-1, 1]) r.line(t.x(1.6, s * 0.4), t.y(1.6, s * 0.4), t.x(3.4, s * 1.6), t.y(3.4, s * 1.6), h(PM.spot), 3, 6);
  },
};

const moonHex: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A full moon rolling through the air, a moth's dark silhouette across its face, motes of silver dust
    // circling it and a pale wake behind.
    r.fill(t.poly([-2, -5.4, -9, -3.6 + (f % 2) * 0.6, -15, -0.8, -9, 1.4, -14, 2.6 - (f % 2) * 0.6, -8, 4, -2, 5.4]), h(PM.wingDeep), { group: 1 });
    r.fill(t.poly([-2, -3, -10, -0.6, -2, 3]), h(PM.wing), { group: 1 });
    r.fill(t.circ(0, 0, 7), h(PM.stone), { group: 2 });
    r.fill(t.circ(0.6, 0.6, 6), h(PM.moon), { group: 2 });
    // The moth, beating its wings across the moon (seen from above, heading on).
    const U = new Xf(t.ox, t.oy, t.ang + Math.PI / 2);
    const fl = [0, 0.25, 0.45, 0.25][f];
    for (const s of [-1, 1]) {
      const sh = h(PM.shadow);
      r.fill(sub(U, 0, 0.6, s > 0 ? 0.45 + fl : Math.PI - 0.45 - fl, 0.46, -s).poly(FORE), sh, { group: 3, flat: 2, noLine: true });
      r.fill(sub(U, 0, -0.2, s > 0 ? -0.95 + fl * 0.4 : Math.PI + 0.95 - fl * 0.4, 0.4, -s).poly(HIND), sh, { group: 3, flat: 2, noLine: true });
    }
    r.fill(U.ell(0, -0.4, 0.8, 2.6), h(PM.shadow), { group: 3, flat: 1, noLine: true });
    // Dust circling it, a quarter of a gap per frame.
    for (let k = 0; k < 6; k++) {
      const a = k * (Math.PI / 3) + f * (Math.PI / 12);
      r.dot(t.x(Math.cos(a) * 9, Math.sin(a) * 9), t.y(Math.cos(a) * 9, Math.sin(a) * 9), h(k % 2 ? PM.dust : PM.hot), 3, 4);
    }
  },
};

const wheelProj: ProjArt = {
  frames: 8,
  outline: true,
  draw(r, t, f, h) {
    // The wing chakram spinning, a ribbon of silver dust behind it.
    r.fill(t.poly([-1, -3, -8, -1.6, -13, 0, -8, 1.6, -1, 3]), h(PM.wingDeep), { group: 1 });
    glitter(r, t, f, -4, -14, 2.4, 4, h(PM.hot), h(PM.dust), 1);
    wingWheel(r, t, 0, f * (Math.PI / 8), 1.05, { wing: h(PM.wing), edge: h(PM.silver), spot: h(PM.spot), eye: h(PM.hot), silver: h(PM.silver), stone: h(PM.stone) }, 10);
  },
};

// -----------------------------------------------------------------------------
// Luna Moth (hunting hawk)
// -----------------------------------------------------------------------------

const LM_SPECS: Record<string, MaterialSpec> = {
  'k.wing': { base: LUNA[2], ramp: LUNA, tex: veins },
  'k.edge': { base: EDGE[2], ramp: EDGE },
  'k.spot': { base: SPOT[2], ramp: SPOT, shiny: true },
  'k.eye': { base: MOONSTONE[3], ramp: MOONSTONE, glow: true },
  'k.fur': { base: FUZZ[2], ramp: FUZZ, tex: tufts },
  'k.ant': { base: ANT[2], ramp: ANT },
  'k.ink': { base: 0x2a1a30, ramp: [0x0e0814, 0x1a1024, 0x2a1a30, 0x3e2a46, 0x5a4264] },
  'k.dust': { base: 0xe0eaff, glow: true },
  'k.hot': { base: WHITE, glow: true },
  'k.silver': { base: SILVER[2], ramp: SILVER, shiny: true, step: 0.16 },
};
const LM = mats(LM_SPECS);

type Ink = (k: string) => number;

/** The moth's body seen side on, facing +x of B: fuzzy thorax and abdomen, a dark eye and feathery antennae. */
function mothBody(r: Raster, B: Xf, m: Ink, g: number, ant = 0): void {
  r.fill(union(B.ell(-2.5, -0.5, 2.5, 1.2, -0.3), B.ell(0, 0, 1.6, 1.5)), m('k.fur'), { group: g, bevel: 1.1, local: B });
  r.fill(B.circ(1.8, 0.4, 1), m('k.fur'), { group: g + 1, bevel: 0.8 });
  dot(r, B, 2.3, 0.5, m('k.ink'), 1, g + 1);
  // Antennae: a feathered sweep up and forward (a stem and its barbs).
  r.fill(chain(B, [[1.9, 1.2, 0.42], [2.8 + ant, 2.6, 0.38], [4 + ant, 3.1, 0.25]]), m('k.ant'), { group: g + 1, bevel: 0.4 });
  // Legs gripping the perch.
  r.line(B.x(-0.2, -1.2), B.y(-0.2, -1.2), B.x(-0.4, -2.2), B.y(-0.4, -2.2), m('k.ink'), 2, g);
  r.line(B.x(0.9, -1.1), B.y(0.9, -1.1), B.x(1.2, -2.2), B.y(1.2, -2.2), m('k.ink'), 2, g);
}

/** The moth seen from above, heading along +x of F: wings at ±`fore` and ±`hind`, a furred body, feathered antennae. */
function topMoth(r: Raster, F: Xf, m: Ink, fore: number, hind: number, k: number, g: number, ant = 0): void {
  const ink: WingInk = { wing: m('k.wing'), edge: m('k.edge'), spot: m('k.spot'), eye: m('k.eye') };
  topWings(r, F, -0.2, 0, fore, hind, k, ink, g);
  const b = k / 0.62;
  const B = new Xf(F.ox, F.oy, F.ang, F.sx * b, F.sy * b);
  r.fill(union(B.ell(-2.2, 0, 2.6, 1.05), B.ell(0.3, 0, 1.45, 1.3), B.circ(1.9, 0, 0.85)), m('k.fur'), { group: g + 5, bevel: 0.8, local: B });
  for (const s of [-1, 1]) {
    r.line(B.x(2.4, s * 0.5), B.y(2.4, s * 0.5), B.x(3.8 + ant, s * (1.6 + ant)), B.y(3.8 + ant, s * (1.6 + ant)), m('k.ant'), 3, g + 5);
  }
}

/**
 * Perched and flying poses, in specialArt HAWK_POSES order (perch0, perch1,
 * up, down, glide): the moth rests on the shoulder head up with its wings
 * open, closes them, raises them to a narrow V, sweeps them low, and glides
 * home flat. Fore and hind wing angles from the head, body tilt, and where
 * its middle sits above the feet.
 */
const POSES: { tilt: number; fore: number; hind: number; k: number; lift: number }[] = [
  { tilt: Math.PI / 2, fore: 1.12, hind: 2.3, k: 0.62, lift: 6 },
  { tilt: Math.PI / 2 + 0.12, fore: 0.86, hind: 2.5, k: 0.6, lift: 6 },
  { tilt: Math.PI / 2, fore: 0.42, hind: 2.85, k: 0.58, lift: 6.4 },
  { tilt: Math.PI / 2, fore: 1.45, hind: 2.05, k: 0.62, lift: 5.6 },
  { tilt: 0.25, fore: 1.25, hind: 2.25, k: 0.62, lift: 3 },
];

function lunaPerch(r: Raster, t: Xf, m: Ink, pose: number): void {
  const p = POSES[pose] ?? POSES[0];
  // Little legs gripping the perch.
  r.line(t.x(-1, 0), t.y(-1, 0), t.x(-0.4, 2), t.y(-0.4, 2), m('k.ink'), 2, 1);
  r.line(t.x(1, 0), t.y(1, 0), t.x(0.4, 2), t.y(0.4, 2), m('k.ink'), 2, 1);
  topMoth(r, new Xf(t.x(0, p.lift), t.y(0, p.lift), p.tilt), m, p.fore, p.hind, p.k, 2, pose === 1 ? 0.3 : 0);
  // A mote of silver dust shaken off the wings.
  const dk = pose * 1.3;
  dot(r, t, -5 - (dk % 3), 10 + (dk % 2) * 2, m('k.dust'), 3, 9);
}

/** The moth's dart at its prey: wings swept back, tails streaming, a trail of dust (2 frames). */
function lunaDive(r: Raster, t: Xf, m: Ink, f: number): void {
  r.fill(t.poly([-3, -1.6, -10, -0.8, -16, 0, -10, 1, -3, 2]), m('k.dust'), { group: 1 });
  glitter(r, t, f, -4, -17, 2.6, 6, m('k.hot'), m('k.dust'), 1);
  topMoth(r, t, m, f ? 1.75 : 1.45, f ? 2.75 : 2.55, 0.68, 2, 0.4);
}

const lunaMoth: SkinArt = {
  mats: LM_SPECS,
  glow: [0xeafff4, 0x5ab894],
  icon(r, t, m) {
    // The luna moth displayed with its wings spread: pale green, mauve leading edges, amber eyespots with
    // moonlit hearts, long curling tails, a white furred body and feathery antennae, a crescent moon behind.
    const U = new Xf(t.ox, t.oy, Math.PI / 2);
    r.fill(crescent(t, 0, 7.2, 3.4, -Math.PI / 2, 0.42), m('k.silver'), { group: 1, bevel: 1 });
    const ink: WingInk = { wing: m('k.wing'), edge: m('k.edge'), spot: m('k.spot'), eye: m('k.eye') };
    for (const s of [-1, 1]) {
      hindWing(r, sub(U, -0.6, s * 0.4, s * 2.2, 0.98, s), ink, { group: 2 + (s > 0 ? 0 : 3) });
      foreWing(r, sub(U, 0.4, s * 0.5, s * 1.05, 1.1, s), ink, { group: 3 + (s > 0 ? 0 : 3) });
    }
    r.fill(union(U.ell(-2.6, 0, 3.2, 1.35), U.ell(0.6, 0, 1.8, 1.7), U.circ(2.8, 0, 1.2)), m('k.fur'), { group: 9, bevel: 1.2, local: U });
    for (const x of [-1.8, -3.2]) r.line(U.x(x, -1), U.y(x, -1), U.x(x, 1), U.y(x, 1), m('k.fur'), 1, 9);
    for (const s of [-1, 1]) {
      dot(r, U, 3.2, s * 0.8, m('k.ink'), 1, 9);
      r.fill(chain(U, [[3.6, s * 0.6, 0.4], [5.6, s * 1.6, 0.36], [7, s * 3.2, 0.22]]), m('k.ant'), { group: 10, bevel: 0.4 });
      for (const [x, y] of [[4.6, s * 1.8], [5.6, s * 2.4], [6.4, s * 3.4], [5.2, s * 0.6]]) dot(r, U, x, y, m('k.ant'), 2, 10);
    }
    for (const [x, y] of [[-9, 8], [9.6, 4], [-5, -9], [7, -7.4]]) r.dot(t.x(x, y), t.y(x, y), m(x > 0 ? 'k.hot' : 'k.dust'), 3, 11);
  },
  proj: {
    perch: { frames: 5, outline: true, draw: (r, t, f, h) => lunaPerch(r, t, (k) => h(LM[k]), f) },
    hawk: { frames: 2, outline: true, draw: (r, t, f, h) => lunaDive(r, t, (k) => h(LM[k]), f) },
  },
};

// -----------------------------------------------------------------------------
// Antennae Circlet
// -----------------------------------------------------------------------------

function antennaeCirclet(): SkinArt {
  // A blindfold of moonsilk edged in mauve like a luna wing, an amber eyespot with a moonstone heart over the
  // eyes, a moonsilver circlet with a crescent at its front, two feathered silver antennae arching up and back,
  // and short silk tails behind the knot with rosy tips like a luna's.
  return {
    head: () => ({
      mats: {
        'h.silk': material({ base: 0xd8d6ec, ramp: [0x5e5a84, 0x9894bc, 0xcac8e2, 0xeae8f6, 0xffffff], tex: (x, y) => (wrap(y * 1.4 - x * 0.15, 2.2) < 0.45 ? -1 : 0) }),
        'h.tail': material({ base: 0xd8d6ec, ramp: [0x5e5a84, 0x9894bc, 0xcac8e2, 0xeae8f6, 0xffffff] }),
        'h.edge': material({ base: EDGE[2], ramp: EDGE }),
        'h.spot': material({ base: SPOT[2], ramp: SPOT, shiny: true }),
        'h.silver': material({ base: SILVER[2], ramp: SILVER, shiny: true, step: 0.16, tex: sheen(6, 1.5) }),
        'h.stone': material({ base: MOONSTONE[3], ramp: MOONSTONE, glow: true, tex: milk }),
        'h.ant': material({ base: SILVER[3], ramp: SILVER, shiny: true }),
        'h.dust': material({ base: DUST, glow: true }),
      },
      draw(r, H, m, g, sway) {
        const s = sway * 2.2, ph = r.phase % 4, fl = [0, 0.5, 0.8, 0.4][ph], nod = [0, 0.3, 0.5, 0.3][ph];
        const GA = 60;
        // Antenna: a stem arching from the brow up and back, barbs combing off both sides, shortening to the tip.
        const antenna = (bx: number, by: number, bias: number, gr: number) => {
          const pts: [number, number][] = [[bx, by], [bx - 0.4, by + 3], [bx - 1.8, by + 5.6 + nod * 0.4], [bx - 4, by + 7.2 + nod], [bx - 6.4, by + 7.4 + nod]];
          r.fill(chain(H, pts.map(([x, y], i) => [x, y, 0.5 - i * 0.07])), m('h.ant'), { group: gr, bevel: 0.5, toneBias: bias, local: H });
          for (let i = 1; i < pts.length; i++) {
            const [ax, ay] = pts[i - 1], [cx, cy] = pts[i];
            const dx = cx - ax, dy = cy - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
            const bl = 1.5 - i * 0.22;
            for (const u of [0.35, 0.85]) {
              const x = ax + dx * u, y = ay + dy * u;
              r.line(H.x(x + nx * 0.3, y + ny * 0.3), H.y(x + nx * 0.3, y + ny * 0.3), H.x(x + nx * bl - dx / l * 0.5, y + ny * bl - dy / l * 0.5), H.y(x + nx * bl - dx / l * 0.5, y + ny * bl - dy / l * 0.5), m('h.ant'), 2 + bias, gr);
              r.line(H.x(x - nx * 0.3, y - ny * 0.3), H.y(x - nx * 0.3, y - ny * 0.3), H.x(x - nx * bl - dx / l * 0.5, y - ny * bl - dy / l * 0.5), H.y(x - nx * bl - dx / l * 0.5, y - ny * bl - dy / l * 0.5), m('h.ant'), 3 + bias, gr);
            }
          }
        };
        // The far antenna first, behind the head's crown.
        antenna(1.6, 5.4, -1, GA + 4);
        // Silk tails behind the knot: long, curling luna tails with rosy tips, the far one higher.
        r.fill(chain(H, [[-5.8, 1.4, 1], [-8.6 - s * 0.6, 2 - fl * 0.5, 1.05], [-10.8 - s, 0.6 + fl * 0.5, 0.75], [-11.4 - s * 1.2, -0.8 + fl, 0.5]]), m('h.tail'), { group: GA, bevel: 1, toneBias: -1, local: H });
        r.fill(H.circ(-11.4 - s * 1.2, -1 + fl, 0.6), m('h.edge'), { group: GA, bevel: 0.5, toneBias: -1 });
        r.fill(chain(H, [[-5.8, -0.4, 1.1], [-8 - s * 0.6, -2.4, 1.05], [-9.2 - s, -4.8 + fl * 0.6, 0.8], [-8.8 - s * 1.2, -6.8, 0.5]]), m('h.tail'), { group: GA + 1, bevel: 1.2, local: H });
        r.fill(H.circ(-8.6 - s * 1.2, -7, 0.65), m('h.edge'), { group: GA + 1, bevel: 0.5 });
        // The silk band over the eyes, its upper edge mauve like a wing's leading edge.
        const band = intersect(H.ell(0.1, 0.5, 6.9, 6.8), H.poly([-9, 2.4, 9, 1.9, 9, -2.2, -9, -1.5]));
        r.fill(band, m('h.silk'), { group: g, bevel: 1.6, softLight: true, local: H });
        r.fill(intersect(band, H.poly([-9, 2.4, 9, 1.9, 9, 1.1, -9, 1.6])), m('h.edge'), { group: g, flat: 2, noLine: true });
        // The eyespot painted over the eyes: an amber ring around a moonstone heart.
        const ex = 3.4, ey = 0.1;
        r.fill(H.ell(ex, ey, 1.6, 1.25), m('h.spot'), { group: g, flat: 2, noLine: true });
        r.fill(H.ell(ex, ey, 0.85, 0.7), m('h.edge'), { group: g, flat: 1, noLine: true });
        dot(r, H, ex + 0.2, ey + 0.2, m('h.stone'), 3, g);
        // The knot at the back, a moonstone in a silver clasp.
        r.fill(union(H.ell(-6.1, 0.4, 1.5, 1.8), H.ell(-6.6, -0.6, 1.1, 1.2, 0.5)), m('h.silk'), { group: GA + 2, bevel: 1.1, local: H });
        r.fill(H.circ(-6.1, 0.5, 0.95), m('h.silver'), { group: GA + 2, bevel: 0.7 });
        dot(r, H, -6.1, 0.5, m('h.stone'), 3, GA + 2);
        // The moonsilver circlet above the band, a crescent at the brow cupping a moonstone.
        r.fill(H.cap(-6, 2.9, 3.8, 4.1, 0.5), m('h.silver'), { group: GA + 3, bevel: 0.6, local: H });
        r.fill(crescent(H, 4.3, 4.9, 1.7, Math.PI / 2 + 0.35, 0.45), m('h.silver'), { group: GA + 3, bevel: 0.7 });
        dot(r, H, 4.4, 5.2, m('h.stone'), 3, GA + 3);
        // The near antenna, rising from the circlet's front.
        antenna(3, 5.2, 0, GA + 5);
        // A mote of silver dust shaken from the antennae.
        const u = ph / 4;
        dot(r, H, -2.6 - u * 3, 13.4 - u * 4, m('h.dust'), 3, GA + 5);
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Moth Queen's Gown
// -----------------------------------------------------------------------------

function mothGown(): SkinArt {
  // Night-violet velvet dusted with silver, a ruff of white moth fur at the throat and puffs of it at the
  // shoulders, a crescent brooch with a moonstone, a hem scalloped in silver with eyespots, and rising from the
  // back a great pair of luna wings, their long tails curling down past the hips, breathing.
  return {
    mats: {
      robe: { base: VELVET[2], ramp: [...VELVET, 0xf0f4ff], tex: dust() },
      robeTrim: { base: SILVER[2], ramp: SILVER, shiny: true },
      'k.wing': { base: LUNA[2], ramp: LUNA, tex: veins },
      'k.edge': { base: EDGE[2], ramp: EDGE },
      'k.spot': { base: SPOT[2], ramp: SPOT, shiny: true },
      'k.eye': { base: MOONSTONE[3], ramp: MOONSTONE, glow: true, tex: milk },
      'k.fur': { base: FUZZ[2], ramp: FUZZ, tex: tufts },
      'k.silver': { base: SILVER[2], ramp: SILVER, shiny: true, step: 0.16 },
      'k.stone': { base: MOONSTONE[2], ramp: MOONSTONE, glow: true, tex: milk },
    },
    chest: {
      cape: null, hood: null, pauldron: null,
      back(r, T, m, c) {
        const ph = r.phase % 4, flex = [0, 0.07, 0.12, 0.07][ph], s = c.sway * 0.05, top = c.top;
        const ink: WingInk = { wing: m('k.wing'), edge: m('k.edge'), spot: m('k.spot'), eye: m('k.eye') };
        // The far wings sit a little forward and higher, a shade darker; the near pair over them.
        wingPair(r, T, -1.2, top - 1.6, 2.38 - flex + s, 3.6 + flex * 0.6 + s, 1.85, 1, ink, { group: 40, toneBias: -1 }, 1.25);
        wingPair(r, T, -2.8, top - 2.6, 2.52 + flex + s, 4.0 - flex * 0.4 + s, 2.25, 1, ink, { group: 44 }, 1.45);
      },
      shoulder(r, S, m, c) {
        // A puff of white moth fur, a moonstone pinned in it.
        const o = { group: c.g, toneBias: c.bias };
        r.fill(union(S.ell(0, 0.8, 2.7, 2.1), S.circ(-1.6, 1.6, 1.3), S.circ(1.5, 1.7, 1.2)), m('k.fur'), { ...o, bevel: 1.4, local: S });
        if (!c.far) dot(r, S, 0.6, 1.4, m('k.stone'), 3, c.g);
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, ph = r.phase % 4;
        const fx = b.chestPush * 0.7;
        // The ruff: a ring of fur tufts round the throat.
        const ruff: Shape[] = [];
        for (let i = 0; i < 5; i++) {
          const u = i / 4;
          ruff.push(T.circ(-2.4 + u * (fx + 4.2), top + 0.2 - Math.sin(u * Math.PI) * 0.3 - u * 0.5, 1.15 - Math.abs(u - 0.6) * 0.3));
        }
        r.fill(union(...ruff), m('k.fur'), { group: c.g, bevel: 1, local: T });
        // The crescent brooch below the ruff, a moonstone in its arms.
        const cx = fx + 1.3, cy = top - 2.5;
        r.fill(crescent(T, cx, cy, 1.55, 0.6, 0.45), m('k.silver'), { group: c.g, bevel: 0.7 });
        dot(r, T, cx + 0.4, cy + 0.3, m('k.stone'), ph % 2 ? 3 : 4, c.g);
        // The hem scalloped in silver, an eyespot in every other scallop, swaying with the skirt.
        const leg = b.thigh + b.shin, len = leg * 0.62, sw = c.sway * 2.2;
        const n = 5, x0 = -b.hipW - 1.2, x1 = b.hipW + 1.6;
        for (let k = 0; k < n; k++) {
          const u = k / (n - 1), x = x0 + (x1 - x0) * u - sw * (0.45 + u * 0.3), y = -len + 1.1 - u * 0.5;
          r.fill(T.ell(x, y, 1.2, 0.95), m('k.silver'), { group: c.g, bevel: 0.6, toneBias: k % 2 ? -1 : 0 });
          if (k % 2 === 0) dot(r, T, x, y - 0.2, m(k === 2 ? 'k.eye' : 'k.spot'), 3, c.g);
        }
        // A moonstone at the belt's front.
        dot(r, T, b.waistW * 0.55 + 0.2, 2.2, m('k.stone'), 3, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Silkspun Leggings
// -----------------------------------------------------------------------------

function silkspunLeggings(): SkinArt {
  // Pale moonsilk wound round the leg like a cocoon, moth-green bands, a silver thread spiralling down the thigh,
  // and a little moonsilver moth spread over the knee with a moonstone for a body.
  return {
    mats: {
      runeLeg: { base: 0xbcb8d6, ramp: [0x4a4670, 0x7a76a0, 0xaaa6c8, 0xd2d0e6, 0xf4f4fc], tex: silk },
      runeDark: { base: LUNA[2], ramp: LUNA, shiny: true, step: 0.14 },
      runeGlow: { base: MOONSTONE[3], ramp: MOONSTONE, glow: true },
      'l.wing': { base: SILVER[3], ramp: SILVER, shiny: true },
      'l.edge': { base: EDGE[2], ramp: EDGE },
      'l.spot': { base: SPOT[2], ramp: SPOT, shiny: true },
      'l.stone': { base: MOONSTONE[3], ramp: MOONSTONE, glow: true, tex: milk },
      'l.thread': { base: SILVER[3], ramp: SILVER, shiny: true },
    },
    legs: {
      mat: 'runeLeg', trim: 'runeDark', knee: null, tasset: null, rune: null, wraps: null, bulk: 0.2,
      over(r, t, m, c) {
        const ph = r.phase % 4, L = c.len, w = c.w;
        // The silver thread spiralling round the thigh, a glint running down it.
        for (let i = 0; i < 3; i++) {
          const x = L * (0.3 + i * 0.22);
          r.line(t.x(x + 1.4, -w * 0.9), t.y(x + 1.4, -w * 0.9), t.x(x - 1.4, w * 0.9), t.y(x - 1.4, w * 0.9), m('l.thread'), (i + ph) % 3 === 0 ? 3 : 2, c.g);
        }
        // The knee moth: wings spread over the kneecap, tails toward the shin, a moonstone body.
        const kr = c.body.kneeR, K = sub(t, 0.6, w * 0.2, 0, 1, 1);
        const flap = [0, 0.1, 0.18, 0.1][ph];
        const ink: WingInk = { wing: m('l.wing'), edge: m('l.edge'), spot: m('l.spot'), eye: m('l.stone') };
        const gk = c.far ? c.g + 20 : c.g + 22;
        for (const s of [-1, 1]) {
          hindWing(r, sub(K, 0, s * 0.3, s * (2.45 - flap * 0.5), kr * 0.13, s), ink, { group: gk, toneBias: c.bias, spots: false });
          foreWing(r, sub(K, 0.4, s * 0.3, s * (0.55 + flap), kr * 0.15, s), ink, { group: gk + 1, toneBias: c.bias, spots: !c.far });
        }
        r.fill(K.ell(0.2, 0, 1.5, 0.75), m('l.stone'), { group: gk + 2 });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Dewdrop Slippers
// -----------------------------------------------------------------------------

function dewdropSlippers(): SkinArt {
  // Night-violet velvet slippers with pointed toes that curl up to a glowing dewdrop, silver ribbons
  // criss-crossing up the shin to a bow with another drop, and a small luna wing at the ankle that flutters.
  return {
    mats: {
      zephyr: { base: VELVET[3], ramp: [VELVET[1], VELVET[2], VELVET[3], 0x6a58a0, 0xb8b0e0], shiny: true, tex: (x) => (wrap(x, 3) < 0.4 ? -1 : 0) },
      zephyrTrim: { base: SILVER[2], ramp: SILVER, shiny: true },
      'b.ribbon': { base: SILVER[3], ramp: SILVER },
      'b.dew': { base: MOONSTONE[3], ramp: MOONSTONE, glow: true, tex: milk },
      'b.wing': { base: LUNA[2], ramp: LUNA },
      'b.edge': { base: EDGE[2], ramp: EDGE },
      'b.spot': { base: SPOT[2], ramp: SPOT, shiny: true },
    },
    boots: {
      wing: null, height: 0.42, bulk: 0.18,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w, top = c.len * 0.82;
        // The pointed toe curling up, a dewdrop at its tip.
        r.fill(chain(foot, [[c.toe - 1.4, 0.2, 1], [c.toe + 0.8, 0.3, 0.6], [c.toe + 1.8, 1.2, 0.4], [c.toe + 1.7, 2.1, 0.3]]), m('zephyr'), { ...o, bevel: 0.6 });
        dot(r, foot, c.toe + 1.5, 2.6, m('b.dew'), ph === 2 ? 4 : 3, c.g);
        // Ribbons criss-crossing up the shin.
        const steps = 4;
        for (let i = 0; i < steps; i++) {
          const x0 = c.top * 0.7 + (top - c.top * 0.7) * (i / steps), x1 = c.top * 0.7 + (top - c.top * 0.7) * ((i + 1) / steps);
          const a = i % 2 ? 1 : -1;
          r.line(shin.x(x0, a * (w + 0.1)), shin.y(x0, a * (w + 0.1)), shin.x(x1, -a * (w + 0.1)), shin.y(x1, -a * (w + 0.1)), m('b.ribbon'), (i + ph) % 4 === 0 ? 3 : 2, c.g);
        }
        // The bow at the top with its dewdrop.
        r.fill(union(shin.ell(top, w * 0.6, 0.8, 0.5, 0.6), shin.ell(top, -w * 0.2, 0.8, 0.5, -0.6)), m('b.ribbon'), { ...o, bevel: 0.5 });
        dot(r, shin, top - 0.6, w * 0.3, m('b.dew'), 3, c.g);
        if (c.far) return;
        // A small luna wing at the ankle, beating.
        const beat = [0, 0.2, 0.35, 0.2][ph];
        const ink: WingInk = { wing: m('b.wing'), edge: m('b.edge'), spot: m('b.spot'), eye: m('b.dew') };
        const hand = Math.sign(shin.sx * shin.sy) || 1;
        hindWing(r, sub(shin, 1.4, -w + 0.2, -2.25 + beat * 0.5, 0.36, -1 * hand * hand), ink, { group: 30, toneBias: c.bias, spots: false });
        foreWing(r, sub(shin, 1.6, -w + 0.2, -1.05 + beat, 0.42, -1 * hand * hand), ink, { group: 31, toneBias: c.bias });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura: a fairy ring
// -----------------------------------------------------------------------------

const AC = {
  stem: css(0xd8d6e6), cap: css(SHROOM[2]), capHi: css(SHROOM[3]), capHot: css(SHROOM[4]), moss: css(0x3a8a8a),
  dust: css(DUST), wing: css(LUNA[3]), wingDk: css(LUNA[1]), tail: css(EDGE[3]), body: css(WHITE),
};
/** Mushrooms of the ring: angle, size (0 small, 1 large) and their beat. */
const SHROOMS = [[0.25, 1], [0.95, 0], [1.6, 1], [2.25, 0], [2.85, 1], [3.5, 0], [4.15, 1], [4.75, 0], [5.4, 1], [5.95, 0]] as const;

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function mothqueenAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  const RX = 15, RY = 3.8;
  // A faint teal glow on the ground where the ring grows.
  g.globalAlpha = 0.35;
  g.fillStyle = AC.moss;
  ring(g, x, y, RX - 1, RY - 0.4, 30, layer, (g, px, py, i) => { if (i % 2 === 0) g.fillRect(px, py, 1, 1); });
  // The fairy ring: soft-glowing mushrooms, each breathing on its own beat.
  for (let k = 0; k < SHROOMS.length; k++) {
    const [a, big] = SHROOMS[k];
    const s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const px = Math.round(x + Math.cos(a) * RX), py = Math.round(y + s * RY);
    const v = 0.5 + 0.5 * Math.sin(t * 1.7 + k * 1.9);
    g.globalAlpha = 1;
    g.fillStyle = AC.stem;
    g.fillRect(px, py - 1 - big, 1, 1 + big);
    g.globalAlpha = 0.75 + 0.25 * v;
    g.fillStyle = AC.cap;
    g.fillRect(px - 1, py - 2 - big, 3, 1);
    if (big) {
      g.fillStyle = v > 0.6 ? AC.capHot : AC.capHi;
      g.fillRect(px - 1, py - 4, 3, 1);
      g.fillStyle = AC.cap;
      g.fillRect(px - 2, py - 3, 5, 1);
      g.globalAlpha = 1;
    }
  }
  // Spores and silver dust rising from the ring, fading as they climb.
  for (let k = 0; k < 6; k++) {
    const a = k * 1.05 + 0.3, s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const u = (t * 0.22 + k * 0.37) % 1;
    const px = Math.round(x + Math.cos(a) * RX + Math.sin(t * 1.3 + k) * 1.5), py = Math.round(y + s * RY - 3 - u * 22);
    g.globalAlpha = Math.min(1, (1 - u) * 2.2, u * 6);
    g.fillStyle = k % 2 ? AC.dust : AC.capHi;
    g.fillRect(px, py, 1, 1);
  }
  // Two little luna moths fluttering round the queen.
  for (let k = 0; k < 2; k++) {
    const a = t * (k ? -0.75 : 0.6) + k * Math.PI, s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const px = Math.round(x + Math.cos(a) * (12 + k * 3)), py = Math.round(y - 14 - k * 9 + s * 3 + Math.sin(t * 2.3 + k * 2) * 2);
    const open = Math.floor(t * 9 + k * 3) % 3 !== 0;
    g.globalAlpha = 1;
    g.fillStyle = AC.body;
    g.fillRect(px, py, 1, 2);
    g.fillStyle = AC.wing;
    if (open) { g.fillRect(px - 2, py - 1, 2, 2); g.fillRect(px + 1, py - 1, 2, 2); }
    else { g.fillRect(px - 1, py - 2, 1, 2); g.fillRect(px + 1, py - 2, 1, 2); }
    g.fillStyle = AC.tail;
    g.fillRect(px - 1, py + 2, 1, 1);
    g.fillRect(px + 1, py + 2, 1, 1);
  }
  g.globalAlpha = 1;
}

export const MOTHQUEEN: Record<string, SkinArt> = {
  'arcane_staff.mothqueen': { weapon: moonlitScepter, proj: { arcane: mothBolt, hex: moonHex }, ...FX },
  'wind_chakram.mothqueen': { weapon: lunarChakram, proj: { chakram: wheelProj }, ...FX },
  'hunter_hawk.mothqueen': lunaMoth,
  'seer_blindfold.mothqueen': antennaeCirclet(),
  'mage_robe.mothqueen': mothGown(),
  'runed_leggings.mothqueen': silkspunLeggings(),
  'zephyr_boots.mothqueen': dewdropSlippers(),
};
