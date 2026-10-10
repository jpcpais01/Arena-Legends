import { ring, type Layer } from '../../auraKit';
import { css } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { arc, intersect, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { fillAll, hangAt, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, mats, Q, wrap } from './kit';

/**
 * Epic set: Primal Beastlord. The regalia of the first hunters: weathered
 * bone and polished mammoth ivory, tawny sabertooth pelts and shaggy mammoth
 * fur, red-ochre war paint laid on in claw marks, and the hearth fire
 * smouldering in skull sockets, amber beads and cracks in the earth. A
 * sabertooth's spirit prowls round his feet and the ground splits under
 * every stamp.
 */

// -----------------------------------------------------------------------------
// Palette
// -----------------------------------------------------------------------------

/** Weathered bone. */
const BONE = [0x5a4630, 0x957d5a, 0xc9b48c, 0xe6d6b2, 0xfaf0d8];
/** Old mammoth bone, stained brown with age and hearth smoke. */
const OLDBONE = [0x4a3824, 0x7e6646, 0xae946a, 0xceb88c, 0xece0bc];
/** Polished mammoth ivory, a touch yellower: its top tone the glint on a tusk. */
const IVORY = [0x6a5232, 0xa88c5c, 0xd8c08c, 0xf0e2b8, 0xfffae6];
/** Tanned hide. */
const HIDE = [0x4a2c16, 0x7a4c28, 0xa86e3e, 0xc8925a, 0xe2b880];
/** Shaggy mammoth fur, dark and reddish. */
const FUR = [0x22140c, 0x3a2414, 0x5a3820, 0x7e522e, 0xa47444];
/** Sabertooth pelt: tawny gold. */
const PELT = [0x5a3414, 0x96602a, 0xc89040, 0xe4b460, 0xf6d898];
/** Red-ochre war paint. */
const OCHRE = [0x3e0e08, 0x6e1a0e, 0xa02c18, 0xc84a26, 0xe87a46];
/** Hearth fire: deep red up to white-hot amber (glow materials show the fourth tone). */
const EMBER = [0x6a2006, 0xb44a0c, 0xf08a20, 0xffc860, 0xfff0c8];
/** Mastodon hide: thick grey-brown, deeply wrinkled. */
const MASTO = [0x22201e, 0x3a3634, 0x58524c, 0x7a726a, 0xa0968a];
const PIT = 0x140c08;
const SPARK = 0xffc860, SPARK2 = 0xb8401a;

// -----------------------------------------------------------------------------
// Textures
// -----------------------------------------------------------------------------

/** Bone: a few pits and pores. */
const aged: Tex = (x, y) => (hash(Math.floor(x * 1.3), Math.floor(y * 1.3)) < 0.07 ? -1 : 0);
/** Ivory: fine growth rings across the tusk. */
const rings: Tex = (x) => (wrap(x, 2.2) < 0.4 ? -1 : 0);
/** Tanned hide: a few scars and darker blotches. */
const tanned: Tex = (x, y) => {
  const h = hash(Math.floor(x * 0.7), Math.floor(y * 0.7));
  return h < 0.08 ? -1 : h > 0.95 ? 1 : 0;
};
/** Shaggy fur hanging in locks (strands run along y). */
const shag: Tex = (x, y) => {
  const v = wrap(x * 1.2 + Math.sin(y * 1.3) * 0.6, 1.8);
  return v < 0.5 ? -1 : hash(Math.floor(x * 2), Math.floor(y)) < 0.08 ? 1 : 0;
};
/** Shaggy fur combed the other way (strands run along x: thighs and shins). */
const shagX: Tex = (x, y) => shag(y, x, 0);
/** Sabertooth pelt: broken dark stripes. */
const stripes: Tex = (x, y) => {
  const v = wrap(x * 0.55 + Math.sin(y * 0.5) * 1.2, 3.4);
  return v < 0.75 ? (hash(Math.floor(x * 0.5), Math.floor(y * 0.6)) < 0.3 ? -1 : -2) : 0;
};
/** Mastodon hide: deep horizontal wrinkles. */
const wrinkles: Tex = (x, y) => (wrap(x + Math.sin(y * 0.9) * 0.4, 1.6) < 0.38 ? -1 : hash(Math.floor(x * 1.5), Math.floor(y * 1.5)) < 0.05 ? 1 : 0);
/** A smouldering ember: dim, bright, brighter, bright. */
const smoulder: Tex = (_x, _y, ph) => [0, 1, 1, 0][ph % 4];
/** Flicker for eyes: bright, dim, bright, brighter. */
const flick: Tex = (_x, _y, ph) => [0, -1, 0, 1][ph % 4];

// -----------------------------------------------------------------------------
// Materials
// -----------------------------------------------------------------------------

const bone = (tex: Tex | undefined = aged): MaterialSpec => ({ base: BONE[2], ramp: BONE, shiny: true, step: 0.13, tex });
const ivory = (tex: Tex | undefined = rings): MaterialSpec => ({ base: IVORY[2], ramp: IVORY, shiny: true, tex });
const hide = (tex: Tex | undefined = tanned): MaterialSpec => ({ base: HIDE[2], ramp: HIDE, tex });
const fur = (tex: Tex | undefined = shag): MaterialSpec => ({ base: FUR[2], ramp: FUR, tex });
const pelt = (tex: Tex | undefined = stripes): MaterialSpec => ({ base: PELT[2], ramp: PELT, tex });
const ochre = (tex?: Tex): MaterialSpec => ({ base: OCHRE[2], ramp: OCHRE, tex });
const ember = (tex: Tex | undefined = smoulder): MaterialSpec => ({ base: EMBER[3], ramp: EMBER, glow: true, tex });
const hot = (): MaterialSpec => ({ base: EMBER[4], glow: true });
const pit = (): MaterialSpec => ({ base: PIT, ramp: [PIT, PIT, 0x241610, 0x34221a, 0x4a3226] });
const strap = (): MaterialSpec => ({ base: 0x4a2c18, ramp: [0x160c06, 0x2a1a0e, 0x4a2c18, 0x6a4428, 0x8a603a] });

const FX = epicFx(SPARK, SPARK2, 'flame', 0xffe0a8);

/** Particles the full set sheds in battle: embers off the hearth fire. */
export const BEASTLORD_FX: SkinFx = { spark: SPARK, spark2: SPARK2, kind: 'flame' };

// -----------------------------------------------------------------------------
// Shared shapes
// -----------------------------------------------------------------------------

/** A tapering chain of capsules through [x, y, radius] points. */
function chain(F: Xf, pts: number[][]): Shape {
  const s: Shape[] = [];
  for (let i = 1; i < pts.length; i++) s.push(F.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i - 1][2], pts[i][2]));
  return union(...s);
}

/** A curved fang from its root (x, y) toward angle `a`, `len` long and `w` wide at the root, bending by `curl`. */
function fang(F: Xf, x: number, y: number, a: number, len: number, w: number, curl = 0.25): Shape {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  const p = (u: number, v: number) => {
    const b = curl * u * u * len;
    return [x + c * u * len + nx * (v + b), y + s * u * len + ny * (v + b)];
  };
  return F.poly([...p(0, -w), ...p(0.45, -w * 0.75), ...p(0.8, -w * 0.4), ...p(1, 0), ...p(0.75, w * 0.35), ...p(0.4, w * 0.8), ...p(0, w)]);
}

/** A lumpy roll of fur from (ax, ay) to (bx, by). */
function roll(F: Xf, ax: number, ay: number, bx: number, by: number, rad: number, n: number): Shape {
  const parts: Shape[] = [F.cap(ax, ay, bx, by, rad * 0.85)];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    parts.push(F.circ(ax + (bx - ax) * u, ay + (by - ay) * u, rad * (i % 2 ? 1.1 : 0.88)));
  }
  return union(...parts);
}

/** Three parallel claw-mark strokes of war paint, centred at (x, y), slanting by `a`, `len` long. */
function clawMarks(r: Raster, F: Xf, x: number, y: number, a: number, len: number, gap: number, mat: number, g: number, clip?: Shape): void {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  for (const k of [-1, 0, 1]) {
    const ox = x + nx * gap * k, oy = y + ny * gap * k, l = len * (k === 0 ? 0.5 : 0.42);
    const sh = F.cap(ox - c * l, oy - s * l, ox + c * l, oy + s * l, 0.42, 0.2);
    r.fill(clip ? intersect(sh, clip) : sh, mat, { group: g, flat: 2, noLine: true });
  }
}

// -----------------------------------------------------------------------------
// Mammoth Bone Club
// -----------------------------------------------------------------------------

function mammothClub(): WeaponArt {
  // A mammoth's thighbone: its great knuckled knee-end for a head, studded with sabertooth fangs along the
  // striking side, a curved tusk raking back over the spine, ochre claw marks across the bone, embers glowing
  // in its cracks, a hide-wrapped grip and a fang charm swinging from the neck.
  const HX = 26.6;
  return {
    tip: 30.4,
    grip2: 10,
    mats: {
      bone: material({ base: OLDBONE[2], ramp: OLDBONE, shiny: true, step: 0.13, tex: aged }), ivory: material(ivory()), fang: material(ivory(undefined)),
      wrap: material(hide((x) => (wrap(x * 1.4, 1.1) < 0.4 ? -1 : 0))), cord: material(strap()),
      paint: material(ochre()), crack: material(pit()), ember: material(ember()), hot: material(hot()),
      feather: material({ base: FUR[3], ramp: [FUR[0], FUR[1], FUR[3], FUR[4], 0xb08a62] }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // The tusk raking back off the spine side, behind the head.
      fillAll(r, [chain(t, [[24.6, 3.2, 1.5], [24.2, 6.4, 1.25], [25.6, 9.4, 0.95], [28.4, 11.2, 0.65], [31.2, 11.4, 0.25]])], m('ivory'), o, 1, -1);
      // The shaft: a long bone, swelling toward the knee end, with a knuckled butt.
      fillAll(r, [union(t.cap(-8.6, 0, 22.5, 0, 1.15, 1.6), t.circ(-9.6, 0.5, 1.45), t.circ(-9.4, -0.8, 1.3))], m('bone'), o, 1.2);
      // Hide wraps at both hands, cords crossing.
      fillAll(r, [t.cap(-3.6, 0, 3.4, 0, 1.45)], m('wrap'), o, 1);
      fillAll(r, [t.cap(8.2, 0, 12, 0, 1.4)], m('wrap'), o, 1);
      for (const x of [-3.4, 3.2, 8.4, 11.8]) fillAll(r, [t.rect(x, 0, 0.32, 1.6)], m('cord'), o, 0.6);
      // Ochre rings painted round the shaft.
      for (const x of [15.6, 17]) r.fill(t.rect(x, 0, 0.36, 1.5), m('paint'), { group: g, flat: 2, noLine: true });
      // The head: the knee end of the bone, two great knuckles either side of a notch.
      const head = union(t.ell(HX - 0.6, 0, 3.6, 4), t.circ(HX + 1.2, -2.4, 2.6), t.circ(HX + 1.2, 2.4, 2.6), t.cap(21.4, 0, HX - 2, 0, 1.6, 3.2));
      fillAll(r, [head], m('bone'), o, 2);
      r.fill(t.poly([HX + 4, -0.8, HX + 2.2, 0, HX + 4, 0.8]), m('crack'), { group: g, flat: 0, noLine: true });
      // Sabertooth fangs driven into the striking side.
      fillAll(r, [fang(t, HX - 3.2, -3, -Math.PI / 2 - 0.25, 3.4, 0.75, 0.2)], m('fang'), o, 0.7);
      fillAll(r, [fang(t, HX + 0.2, -4.2, -Math.PI / 2 + 0.05, 4.4, 0.9, 0.18)], m('fang'), o, 0.8);
      fillAll(r, [fang(t, HX + 3, -4, -Math.PI / 2 + 0.4, 3.2, 0.7, 0.2)], m('fang'), o, 0.7);
      // Claw marks of red ochre raked across the bone.
      clawMarks(r, t, HX - 1.2, 1, 0.95, 4, 1.15, m('paint'), g, head);
      // Cracks with the hearth fire smouldering in them.
      const k = m('crack');
      r.line(t.x(HX - 3.4, -1.4), t.y(HX - 3.4, -1.4), t.x(HX - 1.6, -2.2), t.y(HX - 1.6, -2.2), k, 0, g);
      r.line(t.x(HX - 1.6, -2.2), t.y(HX - 1.6, -2.2), t.x(HX - 0.6, -1.4), t.y(HX - 0.6, -1.4), k, 0, g);
      r.dot(t.x(HX - 1.6, -2.2), t.y(HX - 1.6, -2.2), m('ember'), 3, g);
      r.dot(t.x(HX + 2, 3.2), t.y(HX + 2, 3.2), m('ember'), ph === 1 ? 4 : 3, g);
      // A fang charm on a cord, hanging from the neck of the head whichever way the club is held: an amber bead and a feather.
      const H = hangAt(t, 21.4, -1.4);
      const sw = [0, 0.5, 0.8, 0.3][ph];
      r.line(H.x(0, 0), H.y(0, 0), H.x(3.6, sw), H.y(3.6, sw), m('cord'), 1, g);
      r.fill(H.circ(2, sw * 0.6, 0.75), m('ember'), { group: g });
      r.dot(H.x(1.8, sw * 0.6 - 0.3), H.y(1.8, sw * 0.6 - 0.3), m('hot'), 3, g);
      r.fill(fang(H, 3.4, sw, 0.1, 2.6, 0.55, 0.2), m('fang'), { group: g, bevel: 0.6 });
      r.fill(H.poly([1, -0.2, 3.2, -1.4 - sw * 0.4, 5.8, -1.2 - sw, 4.2, -0.4 - sw * 0.5, 1.4, 0.4]), m('feather'), { group: g, bevel: 0.6 });
      r.dot(H.x(5.4, -1.2 - sw), H.y(5.4, -1.2 - sw), m('paint'), 3, g);
    },
  };
}

// --- Ground slam: bone spikes and tusks bursting out of the earth ---------------

const GM = mats({
  dirt: { base: MASTO[2], ramp: [0x2a1e14, 0x4a3624, 0x6a5038, 0x8c6e4e, 0xb09070] },
  bone: bone(),
  ivory: ivory(),
  crack: pit(),
  ember: ember(undefined),
  hot: hot(),
  paint: ochre(),
});

const quake: ProjArt = {
  frames: 3,
  outline: true,
  draw(r, t, f, h) {
    // A heave of earth split by fire, mammoth tusks and bone spikes tearing up through it, stones flung high.
    const hs = [[6, 10, 6], [8, 7, 10], [5, 11, 8]][f];
    // Tusks curling out of the ground, behind the spikes.
    r.fill(chain(t, [[-7, 0, 1.4], [-8.2, hs[0] * 0.6, 1.1], [-6.6, hs[0] + 1.6, 0.7], [-4, hs[0] + 2.6, 0.25]]), h(GM.ivory), { group: 1, bevel: 1 });
    r.fill(chain(t, [[8, 0, 1.4], [9.4, hs[2] * 0.6, 1.1], [8.4, hs[2] + 1.4, 0.7], [5.6, hs[2] + 2.4, 0.25]]), h(GM.ivory), { group: 1, bevel: 1 });
    // Bone spikes.
    r.fill(t.poly([-3.4, 0, -1.6, hs[1] + 1, 0, 0]), h(GM.bone), { group: 2, bevel: 1 });
    r.fill(t.poly([1.4, 0, 3, hs[1] * 0.7, 4.2, 0]), h(GM.bone), { group: 2, bevel: 1 });
    r.line(t.x(-1.8, 2), t.y(-1.8, 2), t.x(-1.7, hs[1] - 1), t.y(-1.7, hs[1] - 1), h(GM.paint), 2, 2);
    // The heave of earth, split with fire.
    r.fill(t.poly([-13, 0, -10, 2.6, -7, 3.6, -4, 2.2, -1, 3.4, 2, 2, 5, 3.6, 8, 2.6, 11, 3, 13, 0]), h(GM.dirt), { group: 3, bevel: 1.6 });
    for (const [x0, x1] of [[-8, -6.4], [-2.6, -1], [3, 4.6], [8.8, 10]]) {
      r.line(t.x(x0, 0.4), t.y(x0, 0.4), t.x(x1, 2.4), t.y(x1, 2.4), h(GM.crack), 0, 3);
      r.dot(t.x((x0 + x1) / 2, 1.4), t.y((x0 + x1) / 2, 1.4), h(f % 2 ? GM.hot : GM.ember), 3, 3);
    }
    // Stones flung up.
    for (const [x, y] of [[-10, hs[0] + 3], [1.4, hs[1] + 4], [11, hs[2] + 2]]) r.fill(t.circ(x + f, y, 1.1), h(GM.dirt), { group: 4, bevel: 1 });
  },
};

// -----------------------------------------------------------------------------
// Hunter's Skull Bolas
// -----------------------------------------------------------------------------

interface SkullMats { skull: number; pit: number; eye: number; fang: number; paint: number }

/** A small beast skull upright at (x, y) of frame F (x right, y up), `s` its size: cranium, ember sockets, snout and two fangs. */
function beastSkull(r: Raster, F: Xf, x: number, y: number, s: number, h: SkullMats, g: number, eyeTone = 3, paint = true): void {
  r.fill(union(F.ell(x, y + 0.3 * s, 1.75 * s, 1.5 * s), F.rect(x, y - 0.9 * s, 1.05 * s, 0.85 * s, 0.4 * s)), h.skull, { group: g, bevel: 1.1 * s });
  for (const k of [-1, 1]) {
    r.fill(F.ell(x + k * 0.72 * s, y + 0.15 * s, 0.55 * s, 0.5 * s), h.pit, { group: g, flat: 0, noLine: true });
    r.dot(F.x(x + k * 0.72 * s, y + 0.15 * s), F.y(x + k * 0.72 * s, y + 0.15 * s), h.eye, eyeTone, g);
  }
  r.dot(F.x(x, y - 0.75 * s), F.y(x, y - 0.75 * s), h.pit, 0, g);
  for (const k of [-1, 1]) r.fill(F.poly([x + k * 0.75 * s - 0.35, y - 1.4 * s, x + k * 0.6 * s, y - 2.9 * s, x + k * 0.75 * s + 0.35, y - 1.4 * s]), h.fang, { group: g, bevel: 0.5 });
  if (paint) r.line(F.x(x - 0.2 * s, y + 1.6 * s), F.y(x - 0.2 * s, y + 1.6 * s), F.x(x + 0.2 * s, y + 0.75 * s), F.y(x + 0.2 * s, y + 0.75 * s), h.paint, 2, g);
}

function skullBolas(): WeaponArt {
  // Three little beast skulls on braided hide cords, ember light in their sockets, fangs bared, ochre streaked
  // down their brows; bound together under a bone toggle with two feathers.
  return {
    tip: 7.2,
    mats: {
      skull: material(bone()), pit: material(pit()), eye: material(ember(flick)), fang: material(ivory(undefined)),
      paint: material(ochre()), cord: material(strap()), knot: material(bone(undefined)),
      feather: material({ base: OCHRE[3], ramp: [OCHRE[0], OCHRE[1], OCHRE[2], OCHRE[3], OCHRE[4]] }),
      bead: material(ember()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      const H = hangAt(t, 0, 0);
      const sw = [0, 0.3, 0.5, 0.2][ph];
      const ends: [number, number, number][] = [[6, -3.4 + sw, 1.2], [5, 3.6 + sw, 1.15], [7.6, 0.2 + sw, 1.3]];
      for (const [x, y] of ends) r.line(H.x(0.6, 0), H.y(0.6, 0), H.x(x - 1.4, y), H.y(x - 1.4, y), m('cord'), 2, g);
      // Feathers sticking out of the binding.
      r.fill(H.poly([0.4, -0.4, 2.6, -2.2, 4.4, -2.8, 3, -1.2, 0.8, 0.4]), m('feather'), { group: g, bevel: 0.6 });
      const h: SkullMats = { skull: m('skull'), pit: m('pit'), eye: m('eye'), fang: m('fang'), paint: m('paint') };
      // The skulls hang upright, whatever angle the hand is at.
      ends.forEach(([x, y, s], i) => {
        const U = new Xf(H.x(x, y), H.y(x, y), 0, Math.abs(t.sy), Math.abs(t.sy));
        beastSkull(r, U, 0, 0, s, h, g + (i === 2 ? 1 : 0), (i + ph) % 4 === 0 ? 4 : 3, false);
      });
      // The binding: a bone toggle with an amber bead.
      fillAll(r, [H.cap(0.2, -0.9, 0.9, 0.9, 0.7)], m('knot'), o, 0.8);
      r.dot(H.x(1.4, 0), H.y(1.4, 0), m('bead'), 3, g);
    },
  };
}

const BM = mats({ skull: bone(), pit: pit(), eye: ember(undefined), fang: ivory(undefined), paint: ochre(), cord: strap(), knot: bone(undefined), bead: ember(undefined), whirl: { base: PELT[3], ramp: PELT } });

const bolasProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // The three skulls whirling round their toggle on hide cords, a dusty arc of their swing behind.
    const spin = -f * (Math.PI / 6);
    const sk: SkullMats = { skull: h(BM.skull), pit: h(BM.pit), eye: h(BM.eye), fang: h(BM.fang), paint: h(BM.paint) };
    const [cx, cy] = [t.ox, t.oy];
    r.fill(arc(cx, cy, 6.2, 7, spin + 0.3 - Math.PI * 0.9, spin + 0.3), h(BM.whirl), { group: 1, flat: 1, noLine: true });
    const at: [number, number][] = [];
    for (let i = 0; i < 3; i++) {
      const a = spin + (i / 3) * Math.PI * 2;
      at.push([cx + Math.cos(a) * 6, cy - Math.sin(a) * 6]);
      r.line(cx, cy, cx + Math.cos(a) * 4.6, cy - Math.sin(a) * 4.6, h(BM.cord), 2, 2);
    }
    at.forEach(([x, y], i) => beastSkull(r, new Xf(x, y, 0), 0, 0, i ? 0.95 : 1.05, sk, 3 + i, (f + i) % 4 === 0 ? 4 : 3, i === 0));
    r.fill(t.circ(0, 0, 1), h(BM.knot), { group: 6, bevel: 0.8 });
    r.dot(Math.round(cx), Math.round(cy), h(BM.bead), 3, 6);
  },
};

// -----------------------------------------------------------------------------
// Raptor Pup
// -----------------------------------------------------------------------------

const RAPTOR: Record<string, MaterialSpec> = {
  'k.pelt': pelt((x, y) => (wrap(x * 0.8 + Math.sin(y * 0.9) * 0.6, 3) < 0.7 ? -1 : 0)),
  'k.belly': { base: 0xe8d0a0, ramp: [0x8a6a42, 0xb8946a, 0xe0c696, 0xf2e2c0, 0xfff6e0] },
  'k.feather': { base: FUR[3], ramp: [FUR[0], FUR[1], FUR[3], FUR[4], 0xb08a62] },
  'k.quill': ochre(),
  'k.bone': ivory(undefined),
  'k.eye': ember(flick),
  'k.ink': pit(),
  'k.paint': ochre(),
  'k.fire': { base: EMBER[2], ramp: EMBER, glow: true },
  'k.fireDeep': { base: OCHRE[3], ramp: [OCHRE[0], OCHRE[1], OCHRE[2], OCHRE[3], EMBER[2]], glow: true },
  'k.hot': hot(),
};
const RM = mats(RAPTOR);

/** A pixel-map letter: a material name and the tone of its ramp. */
type Ink = [string, number];

const RAPTOR_INK: Record<string, Ink> = {
  P: ['k.pelt', 2], p: ['k.pelt', 1], L: ['k.pelt', 3], s: ['k.pelt', 0],
  c: ['k.belly', 2], C: ['k.belly', 1],
  F: ['k.feather', 1], f: ['k.feather', 3],
  r: ['k.quill', 2], R: ['k.quill', 3], o: ['k.paint', 2],
  w: ['k.bone', 3], e: ['k.eye', 3], k: ['k.ink', 1], m: ['k.ink', 0],
};

/**
 * The raptor pup, pixel by pixel (faces +x, anchor at its belly; specialArt's WHELP_POSES order):
 * hovering on feathered arms (up, then down), rearing to roar, roaring. Tawny and striped, a big
 * young head with an ember eye in a stripe of ochre war paint, a crest of ochre quills, dark wing
 * feathers tipped red, a tail fan, and bone-white sickle claws.
 */
const RAPTOR_POSES: { rows: string[]; ax: number; ay: number }[] = [
  {
    ax: 9, ay: 8,
    rows: [
      '....r..r............',
      '...fF.fFr...........',
      '...FfrFfF.....RR....',
      '....FfFfF....RPPPL..',
      '.....FFfFP..RPPoePL.',
      '......FFPPPPPPPoPPPP',
      '..rf...PLLLPPPcccwc.',
      'rFfPPPPPsPsPPPcc....',
      '..ffPPPpPsPccc......',
      '.......ppcccC.......',
      '........pP.pP.......',
      '.......pP..pP.......',
      '......ww...ww.......',
    ],
  },
  {
    ax: 9, ay: 8,
    rows: [
      '....................',
      '....................',
      '..............RR....',
      '.............RPPPL..',
      '............RPPoePL.',
      '.......PPPPPPPPoPPPP',
      '..rf..PLLLLPPPcccwc.',
      'rFfPPPPPsPsPPPcc....',
      '..ffPFFFfPsccc......',
      '...FfFfFfpcccC......',
      '...rFfFfFpP.pP......',
      '....rFrFr.pP..pP....',
      '.....r.r...ww..ww...',
    ],
  },
  {
    ax: 8, ay: 8,
    rows: [
      '..r.r.......RR......',
      '.fFrFr.....RPPPL....',
      '.FfFfFr....PPoePL...',
      '..FfFfFF..PPPoPPPPw.',
      '...FFfFFP.PPPcmmm...',
      '....FFPPPPPPccccw...',
      '.....PLLLPPPcc......',
      '....PPsPsPPcc.......',
      '...PPPPPpccC........',
      '..pPP..pppcC........',
      'rfP....pP..pP.......',
      'Ff.....pP...pP......',
      'r.....ww...ww.......',
    ],
  },
  {
    ax: 9, ay: 8,
    rows: [
      '....r..r..............',
      '...fFrfFr.............',
      '...FfFfFF.......RR....',
      '....FfFfF......RPPPPL.',
      '.....FFfFP....RPPoePPLP',
      '......FFPPPPPPPPoPPPPPw',
      '..rf...PLLLPPPPPkmmmmm.',
      'rFfPPPPPsPsPPPccccccw..',
      '..ffPPPpPsPccc.........',
      '.......ppcccC..........',
      '........pP.pP..........',
      '.......pP..pP..........',
      '......ww...ww..........',
    ],
  },
];

/** Paints a pixel map with (ax, ay) on the frame origin, `S` raster pixels per letter. */
function pix(r: Raster, t: Xf, m: (k: string) => number, rows: readonly string[], ax: number, ay: number, S = 1, group = 1): void {
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const e = RAPTOR_INK[rows[y][x]];
      if (!e) continue;
      if (S === 1) r.dot(Math.round(t.ox) + x - ax, Math.round(t.oy) + y - ay, m(e[0]), e[1], group);
      else {
        const x0 = Math.round(t.ox + (x - ax) * S), y0 = Math.round(t.oy + (y - ay) * S);
        const x1 = Math.round(t.ox + (x + 1 - ax) * S), y1 = Math.round(t.oy + (y + 1 - ay) * S);
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) r.dot(xx, yy, m(e[0]), e[1], group);
      }
    }
  }
}

/** The roar: a rolling gout of hearth fire with embers, the ring of the roar swelling ahead of it. */
function roar(r: Raster, t: Xf, m: (k: string) => number, f: number): void {
  const p = [[0, 0.6, -0.4], [0.7, -0.4, 0.6], [-0.5, 0.2, 0.9]][f];
  r.fill(union(t.circ(2.2, p[0], 4.2), t.circ(-2.8, 1.8 + p[1], 3.2), t.circ(-2.4, -2 + p[2], 2.9), t.circ(-7, p[0], 2.2), t.circ(-10.4, 1 - p[1], 1.2)), m('k.fireDeep'), { group: 1 });
  r.fill(union(t.circ(2.4, p[0] * 0.5, 3.1), t.circ(-2.2, 1.2 + p[1], 2.1), t.circ(-2, -1.4 + p[2], 1.9), t.circ(-6.4, p[0], 1.2)), m('k.fire'), { group: 1 });
  r.fill(union(t.circ(2.8, 0, 1.8), t.circ(0.2, 0.8 + p[1] * 0.5, 1.1)), m('k.hot'), { group: 1 });
  // The ring of the roar, swelling ahead of the flame.
  const R = 6.6 + f * 0.8;
  const [cx, cy] = t.p(0, 0);
  r.fill(arc(cx, cy, R, R + 0.9, -t.ang - 0.75, -t.ang + 0.75), m('k.fire'), { group: 2, flat: 3, noLine: true });
  for (const [x, y] of [[-8 - f, -2.6 + f], [-5 + f, 3.6 - f * 0.5], [-11 + f * 0.5, 0.8]]) r.dot(t.x(x, y), t.y(x, y), m('k.hot'), 3, 1);
}

const RAPTOR_WHELP: ProjArt = {
  frames: 4,
  outline: true,
  draw: (r, t, f, h) => { const p = RAPTOR_POSES[f % 4]; pix(r, t, (k) => h(RM[k]), p.rows, p.ax, p.ay); },
};
const RAPTOR_ROAR: ProjArt = { frames: 3, outline: false, draw: (r, t, f, h) => roar(r, t, (k) => h(RM[k]), f) };

const raptorPup: SkinArt = {
  mats: RAPTOR,
  glow: [0xffd070, 0xc8501a],
  icon(r, t, m) {
    // Rearing on the hunt, wings flared, jaws wide on a roar of fire.
    const p = RAPTOR_POSES[2];
    pix(r, t, m, p.rows, 10, 6.5, 1.3);
    const F = new Xf(t.x(10.4, 6.4), t.y(10.4, 6.4), 0.5, 0.5, 0.5);
    r.fill(union(F.circ(3, 0, 3.2), F.circ(-1.6, 0.8, 2.4), F.circ(-1.4, -1.2, 2.2)), m('k.fireDeep'), { group: 2 });
    r.fill(union(F.circ(3.2, 0, 2.2), F.circ(-1, 0.4, 1.4)), m('k.fire'), { group: 2 });
    r.fill(F.circ(3.4, 0, 1.1), m('k.hot'), { group: 2 });
  },
  proj: { whelp: RAPTOR_WHELP, breath: RAPTOR_ROAR },
};

// -----------------------------------------------------------------------------
// Sabertooth Skull
// -----------------------------------------------------------------------------

function sabertoothSkull(): SkinArt {
  // The skull of a great sabertooth worn as a helm: its cranium over the crown, its brow and muzzle jutting
  // over the forehead, ember light in its sockets, the two great sabers framing the wearer's face. Ochre claw
  // marks across the bone, a striped pelt hanging down the back and two hunting feathers that sway.
  return {
    head: () => ({
      mats: {
        'h.bone': material(bone()), 'h.saber': material(ivory(undefined)), 'h.pit': material(pit()),
        'h.pelt': material(pelt()), 'h.paint': material(ochre()), 'h.eye': material(ember(flick)), 'h.hot': material(hot()),
        'h.feather': material({ base: 0xe8dcc4, ramp: [0x6a5a48, 0xa8987e, 0xd8ccb2, 0xf2ead8, 0xfffaf0] }),
        'h.cord': material(strap()),
      },
      face: true,
      draw(r, H, m, g, sway) {
        const ph = r.phase % 4, s = sway * 2;
        // The pelt hanging down behind, its edge ragged, a paw dangling.
        r.fill(H.poly([-2, 6.6, -6.6, 4.8, -8.6 - s * 0.4, 0, -9.4 - s, -6.6, -8 - s * 0.9, -9.2, -6.6 - s * 0.7, -7.4, -5.2 - s * 0.6, -9.6, -3.6, -6, -2.6, -1]), m('h.pelt'), { group: g, bevel: 2, toneBias: -1, softLight: true, local: H });
        r.fill(H.ell(-8.6 - s * 0.9, -9.8, 1.3, 1), m('h.pelt'), { group: g, bevel: 0.8, toneBias: -1 });
        for (const x of [-9.4, -8.6, -7.8]) r.dot(H.x(x - s * 0.9, -10.8), H.y(x - s * 0.9, -10.8), m('h.saber'), 3, g);
        // Two hunting feathers stuck in the binding at the back, swaying.
        const fs = [0, 0.4, 0.7, 0.3][ph] + s * 0.3;
        for (const [k, x, y, a, l] of [[0, -4.8, 4.6, 2.45, 5.6], [1, -3.8, 5.6, 2.15, 6.6]] as const) {
          const aa = a - fs * 0.12;
          r.fill(fang(H, x, y, aa, l, 0.8, -0.06), m('h.feather'), { group: g, bevel: 0.8, toneBias: k ? 0 : -1 });
          r.fill(intersect(fang(H, x, y, aa, l, 0.8, -0.06), H.circ(x + Math.cos(aa) * l, y + Math.sin(aa) * l, 1.9)), m('h.cord'), { group: g, flat: 1, noLine: true });
          r.dot(H.x(x + Math.cos(aa) * l * 0.55, y + Math.sin(aa) * l * 0.55), H.y(x + Math.cos(aa) * l * 0.55, y + Math.sin(aa) * l * 0.55), m('h.paint'), 2, g);
        }
        // The far saber, behind the cheek.
        r.fill(fang(H, 5.7, 2.5, -Math.PI / 2 - 0.06, 6, 1, -0.12), m('h.saber'), { group: g, bevel: 0.6, lightBias: 0.15 });
        // The cranium over the crown, the brow ridge and muzzle jutting forward over the forehead.
        const skull = union(
          H.poly([-6.6, -1.4, -6.8, 2.6, -5.2, 5.8, -1.8, 7.8, 1.8, 7.6, 4.6, 6.2, 7.2, 5.2, 9.4, 4.4, 10, 3, 9.4, 2, 7, 1.8, 5, 2.2, 2.4, 2.4, 0.2, 1.6, -2.4, 1, -4.6, -0.6], 0.6),
        );
        r.fill(skull, m('h.bone'), { group: g, bevel: 2.4, local: H });
        // Sagittal crest along the top.
        r.line(H.x(-4.4, 6.4), H.y(-4.4, 6.4), H.x(1.6, 7.9), H.y(1.6, 7.9), m('h.bone'), 4, g);
        // Ochre claw marks raked across the side of the cranium.
        for (const k of [0, 1]) r.line(H.x(-3 + k * 2.2, 5.8 - k * 0.3), H.y(-3 + k * 2.2, 5.8 - k * 0.3), H.x(-1.8 + k * 2.2, 3 - k * 0.2), H.y(-1.8 + k * 2.2, 3 - k * 0.2), m('h.paint'), 2, g);
        // The cheek arch and the hollow under it.
        r.line(H.x(-0.4, 2.2), H.y(-0.4, 2.2), H.x(4.2, 2.8), H.y(4.2, 2.8), m('h.pit'), 1, g);
        // The eye socket, ember light burning in it.
        r.fill(H.ell(5, 4.3, 1.25, 1.05), m('h.pit'), { group: g, flat: 0, noLine: true });
        r.dot(H.x(5.2, 4.2), H.y(5.2, 4.2), m('h.eye'), ph === 1 ? 4 : 3, g);
        r.dot(H.x(4.6, 4.4), H.y(4.6, 4.4), m('h.eye'), 2, g);
        // Nose hole at the end of the muzzle, and a row of small teeth along the upper jaw.
        r.fill(H.poly([9.2, 3.6, 9.8, 2.8, 8.8, 2.6]), m('h.pit'), { group: g, flat: 0, noLine: true });
        for (const x of [7.6, 8.6]) r.dot(H.x(x, 1.6), H.y(x, 1.6), m('h.saber'), 3, g);
        // The near saber sweeping down past the face.
        r.fill(fang(H, 7.5, 2.7, -Math.PI / 2 - 0.04, 8.2, 1.25, -0.12), m('h.saber'), { group: g, bevel: 0.7, lightBias: 0.35 });
        // A cord binding the skull on, under the jaw hinge, with an amber bead.
        r.line(H.x(-1.2, 1.2), H.y(-1.2, 1.2), H.x(-1.8, -2), H.y(-1.8, -2), m('h.cord'), 1, g);
        r.dot(H.x(-1.8, -2.4), H.y(-1.8, -2.4), m('h.eye'), 3, g);
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Beastlord Hides
// -----------------------------------------------------------------------------

function beastlordHides(): SkinArt {
  // A tanned hide jerkin under a breastplate of bone tubes strung in rows, a necklace of sabertooth fangs round
  // an amber bead, a shaggy mammoth-fur mantle with tusks jutting off the shoulders, ochre claw marks on the
  // belly, fur tails swinging from the belt, and a whole sabertooth pelt hanging down the back, paws and all.
  return {
    mats: {
      'bk.hide': pelt(), 'bk.wrap': { ...strap(), tex: (x, y) => (wrap(y * 1.2 + x * 0.3, 1.4) < 0.4 ? -1 : 0) }, 'bk.belt': strap(),
      'bk.fur': fur(), 'bk.pelt': pelt(), 'bk.bone': bone(), 'bk.tusk': ivory(), 'bk.fang': ivory(undefined),
      'bk.paint': ochre(), 'bk.bead': ember(), 'bk.hot': hot(), 'bk.pit': pit(),
    },
    chest: {
      torso: 'bk.hide', sleeve: 'bk.fur', sleeveLen: 0.4, forearm: 'bk.wrap', hands: 'skin', pauldron: null,
      trim: null, belt: 'bk.belt', cape: null, hood: null, spikes: null, skirt: 0, noScarf: true,
      back(r, T, m, c) {
        const top = c.top, s = c.sway * 3, ph = r.phase % 4;
        // The sabertooth pelt down the back: broad at the shoulders, ragged at the hem, a hind paw at each corner.
        const rip = [0, 0.5, 0.8, 0.3][ph];
        const pts = [
          -0.6, top + 0.8, -5.4, top - 0.4, -8.6 - s, top - 6.2, -10.4 - s * 1.3, -9.6, -11.4 - s * 1.5, -13.4 + rip * 0.5,
          -9.8 - s * 1.4, -12.6, -8.4 - s * 1.3, -14.4 + rip, -6.8 - s * 1.1, -12.2, -5 - s, -13.2 + rip * 0.6, -3.2 - s * 0.6, -10.6,
          -1.6, -6, -0.8, -1,
        ];
        r.fill(T.poly(pts), m('bk.pelt'), { group: 40, bevel: 3, toneBias: -1, softLight: true, local: T });
        // Paws hanging off the hem corners, ivory claws.
        for (const [x, y] of [[-11.4 - s * 1.5, -13.6 + rip * 0.5], [-5.2 - s, -13.4 + rip * 0.6]]) {
          r.fill(T.ell(x, y, 1.3, 1), m('bk.pelt'), { group: 40, bevel: 0.8, toneBias: -1 });
          for (const k of [-0.7, 0, 0.7]) r.dot(T.x(x + k, y - 1), T.y(x + k, y - 1), m('bk.fang'), 3, 40);
        }
      },
      shoulder(r, S, m, c) {
        const a = c.body.armR, o = { group: c.g, toneBias: c.bias };
        // A shaggy fur pad over the shoulder, two tusks curving off it, an ochre stripe painted on the near one.
        r.fill(union(S.ell(0, 1, a + 2, 2.6), roll(S, -a - 1.8, -0.4, a + 2, -0.8, 1.2, 4)), m('bk.fur'), { ...o, bevel: 1.6, local: S });
        if (!c.far) {
          r.fill(chain(S, [[-0.6, 2.4, 0.95], [-1.8, 4.6, 0.7], [-1.2, 6.6, 0.45], [0.4, 7.4, 0.2]]), m('bk.tusk'), { group: c.g, bevel: 0.8 });
          r.fill(chain(S, [[1.4, 2.2, 0.85], [1.2, 4, 0.6], [2.4, 5.4, 0.35], [3.6, 5.6, 0.15]]), m('bk.tusk'), { group: c.g, bevel: 0.8, toneBias: -1 });
          r.line(S.x(-1.6, 4), S.y(-1.6, 4), S.x(-1.4, 5.2), S.y(-1.4, 5.2), m('bk.paint'), 2, c.g);
        } else {
          r.fill(chain(S, [[0, 2.4, 0.8], [-0.6, 4.2, 0.55], [0.4, 5.6, 0.2]]), m('bk.tusk'), { group: c.g, bevel: 0.6, toneBias: -1 });
        }
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, ph = r.phase % 4, fx = b.chestPush * 0.7;
        const torso = union(T.ell(0.3, 0.6, b.hipW, 3.6), T.ell(0.5, top * 0.46, b.waistW, top * 0.28), T.ell(fx, top - 3.4, b.chestW, 5.4));
        // Claw marks of ochre on the belly.
        clawMarks(r, T, fx * 0.4 + 1.2, top * 0.34, 1.2, 3.4, 1, m('bk.paint'), 41, torso);
        // The breastplate: rows of bone tubes strung on hide between two strap ends.
        const x0 = fx - 1.4, x1 = fx + b.chestW + 0.6;
        for (let i = 0; i < 4; i++) {
          const y = top - 2 - i * 1.25;
          const xa = x0 + i * 0.25, xb = x1 - i * 0.2, mid = (xa + xb) / 2;
          r.fill(intersect(torso, T.cap(xa, y, mid - 0.35, y, 0.52)), m('bk.bone'), { group: 42 + (i % 2), bevel: 0.6 });
          r.fill(intersect(torso, T.cap(mid + 0.35, y, xb, y, 0.52)), m('bk.bone'), { group: 44 - (i % 2), bevel: 0.6 });
          r.dot(T.x(mid, y), T.y(mid, y), m(i === 1 ? 'bk.paint' : 'bk.belt'), 2, 43);
        }
        r.fill(intersect(torso, T.rect(x0 - 0.4, top - 3.9, 0.35, 2.6)), m('bk.belt'), { group: 45, flat: 1, noLine: true });
        // The fur mantle bunched round the neck and over the top of the chest.
        r.fill(roll(T, -3.6, top + 0.6, fx + 3, top - 0.1, 1.35, 5), m('bk.fur'), { group: 46, bevel: 1.2, local: T });
        // A necklace of fangs round an amber bead.
        const ny = top - 1.6, nx = fx + 1.6;
        for (const [k, dx, dy] of [[0, -1.6, 0.5], [1, -0.6, -0.1], [2, 1.4, -0.1], [3, 2.4, 0.5]] as const) {
          r.fill(fang(T, nx + dx, ny + dy, -Math.PI / 2 + (dx < 0 ? -0.2 : 0.2), 1.6 + (k === 1 || k === 2 ? 0.3 : 0), 0.38, dx < 0 ? 0.2 : -0.2), m('bk.fang'), { group: 47, bevel: 0.5 });
        }
        r.fill(T.ell(nx + 0.4, ny - 0.6, 0.8, 0.9), m('bk.bead'), { group: 47 });
        r.dot(T.x(nx + 0.2, ny - 0.3), T.y(nx + 0.2, ny - 0.3), m('bk.hot'), ph % 2 ? 3 : 4, 47);
        // A bone buckle on the belt: a small beast skull.
        beastSkull(r, new Xf(T.x(b.waistW * 0.55 + 0.8, 1.2), T.y(b.waistW * 0.55 + 0.8, 1.2), T.ang, 0.85, 0.85), 0, 0, 1,
          { skull: m('bk.bone'), pit: m('bk.pit'), eye: m('bk.bead'), fang: m('bk.fang'), paint: m('bk.paint') }, c.g, 3, false);
        // Fur tails hanging from the belt, swinging out of step.
        const sw = c.sway * 2.2;
        for (const [k, x] of [[0, -b.hipW + 0.2], [1, -b.hipW * 0.2], [2, b.hipW * 0.75]] as const) {
          const d = 4.2 + (k % 2) * 1.2, lean = Math.sin(ph * Q + k * 1.7) * 0.5 - sw * 0.4;
          r.fill(chain(T, [[x, -0.6, 0.85], [x + lean * 0.5, -d * 0.5, 1], [x + lean, -d, 0.35]]), m(k === 1 ? 'bk.pelt' : 'bk.fur'), { group: c.g, bevel: 0.8, local: T, toneBias: k === 0 ? -1 : 0 });
        }
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Mammoth Fur Leggings
// -----------------------------------------------------------------------------

function mammothLeggings(): SkinArt {
  // Shaggy mammoth fur wrapped round the thigh, bound with hide thongs, a fringe of long locks spilling over
  // the knee, a kneecap of bone painted with an ochre stripe and an amber bead knotted at the hip.
  return {
    mats: {
      'l.fur': fur(shagX), 'l.bone': bone(), 'l.paint': ochre(), 'l.bead': ember(), 'l.strap': strap(), 'l.fang': ivory(undefined),
    },
    legs: {
      mat: 'l.fur', trim: null, knee: null, tasset: null, rune: null, wraps: 'l.strap', bulk: 0.5,
      over(r, t, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, L = c.len, w = c.w;
        // Long locks spilling down over the knee, swaying out of step.
        const pts: number[] = [L * 0.36, -w - 0.3];
        const n = 5;
        for (let i = 0; i <= n; i++) {
          const v = -w - 0.3 + ((2 * w + 0.6) * i) / n, sw = Math.sin(ph * Q + i * 1.3) * 0.25;
          pts.push(L * 0.12, v, -1.6 - (i % 2) * 0.8, v + 0.25 + sw);
        }
        pts.push(L * 0.36, w + 0.3);
        r.fill(t.poly(pts), m('l.fur'), { ...o, bevel: 1, local: t });
        // The bone kneecap with an ochre stripe.
        r.fill(t.ell(L * 0.04, w * 0.55, 1.15, 1.05), m('l.bone'), { ...o, group: c.g + 22, bevel: 0.8 });
        r.line(t.x(L * 0.04 - 0.6, w * 0.55), t.y(L * 0.04 - 0.6, w * 0.55), t.x(L * 0.04 + 0.6, w * 0.55), t.y(L * 0.04 + 0.6, w * 0.55), m('l.paint'), 2, c.g + 22);
        // A fang toggle on the thong round the middle.
        r.fill(fang(t, L * 0.52, w + 0.2, -0.3, 1.5, 0.35, 0.2), m('l.fang'), { ...o, group: c.g + 23, bevel: 0.4 });
        // An amber bead knotted at the hip (near leg only).
        if (!c.far) r.dot(t.x(L * 0.82, w * 0.6), t.y(L * 0.82, w * 0.6), m('l.bead'), ph === 2 ? 4 : 3, c.g + 23);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Mastodon Stompers
// -----------------------------------------------------------------------------

function mastodonStompers(): SkinArt {
  // Huge round boots of wrinkled mastodon hide on broad pads, ivory toenails at the front, ochre bands round
  // the shin, a shaggy fur cuff with two little tusks curling forward off it, and the earth cracked and
  // smouldering under each heel.
  return {
    mats: {
      'bb.hide': { base: MASTO[2], ramp: MASTO, tex: wrinkles }, 'bb.fur': fur(shagX), 'bb.nail': ivory(undefined),
      'bb.tusk': ivory(), 'bb.paint': ochre(), 'bb.pad': { base: MASTO[1], ramp: [0x120c08, 0x241a14, 0x3a2e26, 0x524236, 0x6a5848] },
      'bb.crack': pit(), 'bb.ember': ember(), 'bb.hot': hot(),
    },
    boots: {
      mat: 'bb.hide', height: 0.64, bulk: 0.95, trim: null, wing: null, knee: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w;
        // The broad round foot: a pad under it all, wider than the boot.
        const foot0 = union(foot.ell(c.toe * 0.45, -0.6, c.toe * 0.5 + 2.6, 2.2), foot.ell(-1.4, -1, 2.4, 1.8));
        r.fill(foot0, m('bb.hide'), { ...o, bevel: 1.6, local: foot });
        r.fill(foot.poly([-3.8, -1.6, c.toe + 2.6, -1.8, c.toe + 2.4, -3.2, -3.4, -3]), m('bb.pad'), { ...o, bevel: 0.8 });
        // Ivory toenails round the front.
        for (const [x, y] of [[c.toe + 1.6, -1.2], [c.toe - 0.2, -1.4], [c.toe - 2, -1.6]]) r.fill(foot.ell(x, y, 0.85, 0.8), m('bb.nail'), { ...o, group: c.g + 24, bevel: 0.6 });
        // Ochre bands round the shin.
        for (const k of [0.35, 0.55]) r.fill(shin.cap(c.top * k, -w - 0.3, c.top * k - 0.3, w + 0.3, 0.4), m('bb.paint'), { group: c.g, flat: 2, toneBias: c.bias, noLine: true });
        // The shaggy cuff.
        r.fill(roll(shin, c.top + 0.2, -w - 1, c.top + 0.4, w + 1.1, 1.6, 4), m('bb.fur'), { ...o, bevel: 1.2, local: shin });
        // Little tusks curling forward off the cuff (near leg).
        if (!c.far) r.fill(chain(shin, [[c.top - 0.6, w + 0.4, 0.6], [c.top - 1.8, w + 1.8, 0.45], [c.top - 1.2, w + 3, 0.25], [c.top + 0.2, w + 3.4, 0.1]]), m('bb.tusk'), { ...o, group: c.g + 25, bevel: 0.6 });
        // A crack in the sole smouldering.
        r.line(foot.x(c.toe * 0.3, -1.8), foot.y(c.toe * 0.3, -1.8), foot.x(c.toe * 0.5, -3), foot.y(c.toe * 0.5, -3), m('bb.crack'), 0, c.g);
        if (!c.far) r.dot(foot.x(c.toe * 0.4, -2.4), foot.y(c.toe * 0.4, -2.4), m('bb.ember'), ph % 2 ? 4 : 3, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const A = {
  earth: css(0x6a5038), earthDk: css(0x3a2a1c), dust: css(0xb09070), crack: css(0x140c08),
  ember: css(EMBER[2]), hot: css(EMBER[4]), paint: css(OCHRE[3]),
  cat: css(0xffa838), catDk: css(0xc84a10), catHi: css(0xfff0b0), fang: css(0xfff4d8),
};

/** Screen x of a span `w` wide at `dx` along a sprite facing `d` (1 right, -1 left) from `px`. */
const cx = (px: number, d: number, dx: number, w = 1) => (d > 0 ? px + dx : px - dx - w + 1);

/** A dot of packed earth on the ring (a gap every few). */
function earthDot(g: CanvasRenderingContext2D, px: number, py: number, i: number): void {
  if (i % 7 === 3) return;
  g.fillStyle = i % 3 ? A.earth : A.earthDk;
  g.fillRect(px, py, 2, 1);
}

/** A paw print: the pad, and three toes over it. */
function pawPrint(g: CanvasRenderingContext2D, px: number, py: number): void {
  g.fillRect(px, py, 2, 1);
  g.fillRect(px - 1, py - 2, 1, 1); g.fillRect(px + 1, py - 2, 1, 1); g.fillRect(px + 3, py - 2, 1, 1);
}

/** Where the stamp shockwave is: 0..1 over a stamp, then a rest. */
const STAMP = 2.2;

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function beastlordAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  // Trodden earth: a ring of packed dirt, and the prints of the great cat that prowls it, in ochre.
  const RX = 15, RY = 3.8;
  g.globalAlpha = 0.6;
  ring(g, x, y, RX, RY, 28, layer, earthDot);
  g.globalAlpha = 0.8;
  g.fillStyle = A.paint;
  ring(g, x, y, RX + 3, RY + 1, 5, layer, pawPrint);
  // The stamp: cracks split out from the feet, the fire in them flaring and dying, dust thrown up at the wave front.
  const u = (t % STAMP) / STAMP;
  const wave = Math.min(1, u * 3);
  for (let k = 0; k < 6; k++) {
    const a = k * 1.05 + 0.4, s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const c = Math.cos(a), len = 4 + (k % 3) * 2;
    const r0 = 5;
    for (let j = 0; j < len; j += 2) {
      const d = r0 + j;
      const px = Math.round(x + c * d + ((j >> 1) % 2 ? 1 : 0)), py = Math.round(y + s * d * 0.26);
      const lit = wave * 12 > j && u < 0.55;
      g.globalAlpha = 1;
      g.fillStyle = A.crack; g.fillRect(px, py, 2, 1);
      if (lit) { g.globalAlpha = 1 - u * 1.6; g.fillStyle = j < 3 ? A.hot : A.ember; g.fillRect(px, py, 1, 1); }
    }
  }
  if (u < 0.45) {
    const rr = 6 + wave * 12;
    for (let k = 0; k < 8; k++) {
      const a = k * 0.785 + 0.2, s = Math.sin(a);
      if ((s < 0) !== (layer === 'back')) continue;
      const hop = Math.sin(Math.min(1, u * 2.4) * Math.PI) * (2 + (k % 3));
      g.globalAlpha = 0.8 * (1 - u * 2);
      g.fillStyle = k % 2 ? A.dust : A.earth;
      g.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + s * rr * 0.26 - hop), 1, 1);
    }
  }
  // The sabertooth's spirit prowling round the fighter: ember-gold and striped, sabers bared, legs striding.
  const a = t * 0.8, s = Math.sin(a);
  if ((s < 0) === (layer === 'back')) {
    const px = Math.round(x + Math.cos(a) * 18), py = Math.round(y + s * 4.6);
    // Along the near half it walks toward screen right, along the far half toward the left.
    const d = s > 0 ? 1 : -1;
    const step = Math.floor(t * 7) % 2;
    g.globalAlpha = s < 0 ? 0.35 : 0.55;
    // Legs, striding.
    g.fillStyle = A.catDk;
    g.fillRect(cx(px, d, -4 + step), py - 3, 1, 3); g.fillRect(cx(px, d, -2 - step), py - 3, 1, 3);
    g.fillRect(cx(px, d, 3 + step), py - 3, 1, 3); g.fillRect(cx(px, d, 5 - step), py - 3, 1, 3);
    // Short tail, then the body, a pale belly line and dark stripes.
    g.fillRect(cx(px, d, -7), py - 7 + step, 1, 2); g.fillRect(cx(px, d, -6), py - 6, 1, 1);
    g.fillStyle = A.cat; g.fillRect(cx(px, d, -5, 11), py - 7, 11, 4);
    g.fillStyle = A.catHi; g.fillRect(cx(px, d, -4, 9), py - 7, 9, 1);
    g.fillStyle = A.catDk; g.fillRect(cx(px, d, -3), py - 6, 1, 2); g.fillRect(cx(px, d, 0), py - 6, 1, 2); g.fillRect(cx(px, d, 3), py - 6, 1, 2);
    // Head: brow, glowing eye and a long saber.
    g.fillStyle = A.cat; g.fillRect(cx(px, d, 5, 4), py - 9, 4, 4);
    g.fillStyle = A.catHi; g.fillRect(cx(px, d, 5, 3), py - 9, 3, 1);
    g.fillStyle = A.hot; g.fillRect(cx(px, d, 7), py - 8, 1, 1);
    g.fillStyle = A.fang; g.fillRect(cx(px, d, 8), py - 5, 1, 3);
  }
  g.globalAlpha = 1;
}

export const BEASTLORD: Record<string, SkinArt> = {
  'warhammer.beastlord': { weapon: mammothClub, proj: { groundwave: quake }, ...FX },
  'bolas.beastlord': { weapon: skullBolas, proj: { bolas: bolasProj }, ...FX },
  'dragon_whelp.beastlord': raptorPup,
  'berserker_mask.beastlord': sabertoothSkull(),
  'heartwood_armor.beastlord': beastlordHides(),
  'leather_leggings.beastlord': mammothLeggings(),
  'earthshaker_boots.beastlord': mastodonStompers(),
};

