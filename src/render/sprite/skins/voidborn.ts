import { ring, type Layer } from '../../auraKit';
import { css } from '../../pixel/color';
import { material, type LocalSpace, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, glow, mats, plain, Q, wrap } from './kit';

/**
 * Epic set: Voidborn. Something from between the stars: black chitin split by
 * violet void-light, tendrils that never stop writhing, and far too many eyes,
 * each blinking and looking around on its own.
 */

/** Black chitin; its fifth tone is the violet light in its veins. */
const CHITIN = [0x150e22, 0x2a1e44, 0x403062, 0x645090];
const VIOLET = 0xa04aff, PALE = 0xe0b8ff, MAGENTA = 0xff4ad8, ACID = 0xd8ff6a;
/** Void-light: deep violet up to near white (glow materials sit on the fourth tone). */
const VOID = [0x2a0a50, 0x5a1aa8, 0x8a3ae8, VIOLET, 0xf0dcff];
const IRIS = [0x2a4a10, 0x5a8a20, 0x9ad040, ACID, 0xf8ffd0];
const SCLERA = [0x5a4a6a, 0x9a88aa, 0xcabadc, 0xeadff4, 0xffffff];
const FLESH = [0x2a0a36, 0x4e1660, 0x7a2a8e, 0xa848b8, 0xe080e8];

/** Organic veins through chitin; light pulses along them one step per frame. */
const veins = (scale = 1, w = 0.13): Tex => (x, y, ph) => {
  const v = Math.sin(x * 0.7 * scale + Math.sin(y * 1.1 * scale) * 2.4) + Math.sin(y * 0.9 * scale + x * 0.35 * scale) * 0.7;
  if (Math.abs(v) >= w) return 0;
  return wrap(Math.floor((x - y) * 0.45) - ph, 4) === 0 ? 4 : 1;
};
/** Segment seams across a part (insect-leg joints), plus veins. */
const segments = (p = 3, scale = 1.3): Tex => (x, y, ph) => (wrap(x, p) < 0.45 ? -1 : 0) + veins(scale, 0.1)(x, y, ph);
/** Leg-like segments whose joints light up in turn, a pulse climbing toward the head. */
const joints = (p = 3.2): Tex => (x, _y, ph) => (wrap(x, p) < 0.55 ? (wrap(Math.floor(x / p) - ph, 4) === 0 ? 4 : -1) : 0);
/** Light running along void-light, one step per frame. */
const run = (speed = 1.5, period = 6): Tex => (x, y, ph) => (wrap(x + y * 0.4 - ph * speed, period) < 1.3 ? 1 : 0);

const chitin = (tex: Tex = veins()): MaterialSpec => ({ base: CHITIN[2], ramp: [...CHITIN, 0xb060ff], tex });
const shell = (): MaterialSpec => ({ base: 0x33264e, shiny: true, ramp: [0x150e22, 0x2e2248, 0x46366a, 0x6c5a9a, 0xb4a0e4] });
const voidLight = (tex?: Tex): MaterialSpec => ({ base: VIOLET, glow: true, ramp: VOID, tex });
const sclera = (): MaterialSpec => ({ base: SCLERA[2], ramp: SCLERA, shiny: true, step: 0.14 });
const iris = (): MaterialSpec => ({ base: ACID, glow: true, ramp: IRIS });
const flesh = (): MaterialSpec => ({ base: FLESH[2], ramp: FLESH });

const FX = epicFx(PALE, 0x7a1ad0, 'flame', 0xc070ff);

// -----------------------------------------------------------------------------
// Eyes and tendrils
// -----------------------------------------------------------------------------

/** Where an eye looks over the four frames: right, up-left, shut, down-left. `null` is a blink. */
type Look = [number, number] | null;
const LOOKS: Look[] = [[0.32, 0.04], [-0.14, 0.3], null, [-0.3, -0.14]];
const lookAt = (ph: number, k = 0): Look => LOOKS[wrap(ph + k, 4)];

interface EyeMats { white: number; iris: number; pupil: number; lid: number; seam?: number }

/** An eyeball of radius `rad` at (x, y) in frame F: sclera, a glowing iris with a slit pupil, or a shut lid. */
function eyeball(r: Raster, F: Xf, x: number, y: number, rad: number, look: Look, e: EyeMats, g: number, local?: LocalSpace, bias = 0): void {
  const ball = F.circ(x, y, rad);
  if (!look) {
    r.fill(ball, e.lid, { group: g, bevel: rad * 0.9, toneBias: bias, local });
    r.line(F.x(x - rad * 0.8, y - rad * 0.1), F.y(x - rad * 0.8, y - rad * 0.1), F.x(x + rad * 0.8, y - rad * 0.1), F.y(x + rad * 0.8, y - rad * 0.1), e.seam ?? e.pupil, e.seam ? 3 : 0, g);
    return;
  }
  r.fill(ball, e.white, { group: g, bevel: rad * 0.9, toneBias: bias, local });
  const ix = x + look[0] * rad, iy = y + look[1] * rad;
  r.fill(intersect(F.circ(ix, iy, rad * 0.6), ball), e.iris, { group: g, local });
  r.fill(intersect(F.ell(ix, iy, rad * 0.17, rad * 0.44), ball), e.pupil, { group: g, flat: 0, noLine: true });
}

/** A tiny eye (a few pixels): a sclera bead with one bright iris pixel that looks around, or a shut slit. */
function bead(r: Raster, F: Xf, x: number, y: number, rx: number, ry: number, look: Look, white: number, irisM: number, lid: number, g: number, bias = 0): void {
  if (!look) {
    r.line(F.x(x - rx * 0.8, y), F.y(x - rx * 0.8, y), F.x(x + rx * 0.8, y), F.y(x + rx * 0.8, y), lid, 1, g);
    return;
  }
  r.fill(F.ell(x, y, rx, ry), white, { group: g, bevel: 0.8, toneBias: bias });
  r.dot(F.x(x + look[0] * rx * 1.1, y + look[1] * ry), F.y(x + look[0] * rx * 1.1, y + look[1] * ry), irisM, 3, g);
}

/**
 * A tendril from (x, y) in frame F heading along `dir`, writhing with the frame and
 * curling harder toward its tip. Returns the shape and where the tip ends up.
 */
function tendril(F: Xf, x: number, y: number, dir: number, len: number, ph: number, k = 0, w0 = 0.8, curl = 1.2, wave = 0.5): { shape: Shape; tip: [number, number] } {
  const parts: Shape[] = [];
  let px = x, py = y;
  const n = 6;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const a = dir + Math.sin(ph * Q + u * 2.8 + k) * wave * u + curl * u * u;
    const nx = px + Math.cos(a) * (len / n), ny = py + Math.sin(a) * (len / n);
    parts.push(F.cap(px, py, nx, ny, w0 * (1 - (u - 1 / n) * 0.72), w0 * (1 - u * 0.72)));
    px = nx; py = ny;
  }
  return { shape: union(...parts), tip: [px, py] };
}

// -----------------------------------------------------------------------------
// Weapons
// -----------------------------------------------------------------------------

function voidreaver(): WeaponArt {
  // A crescent of black chitin with horned tips and a violet edge, a great eye set in the head
  // that looks around and blinks, veins of light running from it, tendrils curling off the haft.
  const OUT = [13.6, -12.4, 15.6, -14.2, 18.6, -15.2, 22, -15.6, 25.4, -15.3, 28.4, -14.4, 31, -12.8, 32.8, -10.4];
  const blade = [...OUT, 30.6, -10.2, 29.6, -7.6, 28.8, -4.4, 28.2, -1.1, 19.6, -1.1, 18.8, -4, 17.6, -7.4, 16, -10, 14.6, -10.6];
  const band: number[] = [...OUT];
  for (let i = OUT.length - 2; i >= 0; i -= 2) {
    const inner = i === 0 || i === OUT.length - 2 ? 0.7 : 2.1;
    band.push(OUT[i] + (OUT[i] < 20 ? 0.4 : OUT[i] > 28 ? -0.4 : 0), OUT[i + 1] + inner);
  }
  return {
    tip: 31,
    grip2: 11,
    mats: {
      haft: material(chitin(joints())), head: material(chitin(veins(0.9, 0.09))), rim: material(shell()),
      edge: material(voidLight(run(2, 8))), vein: material(voidLight()),
      white: material(sclera()), iris: material(iris()), pupil: material({ base: 0x0a0610 }),
      tendril: material(flesh()), tip: material(voidLight()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // Tendrils off the haft below the head, behind everything.
      for (const [x, y, dir, len, k] of [[18.4, 1, Math.PI * 0.84, 8.4, 0], [16.2, -1, Math.PI * 1.14, 6.8, 2.6]] as const) {
        const { shape, tip } = tendril(t, x, y, dir, len, ph, k, 0.95, k ? -1.5 : 1.5);
        fillAll(r, [shape], m('tendril'), o, 0.8, -1);
        r.dot(t.x(tip[0], tip[1]), t.y(tip[0], tip[1]), m('tip'), 3, g);
      }
      fillAll(r, [union(t.cap(-8, 0, 28, 0, 1.3, 1.15), t.circ(-4.2, 0, 1.5), t.circ(5, 0, 1.45))], m('haft'), o, 1);
      // A tendril wound round the grip.
      for (let x = -2.6; x <= 2; x += 1.5) r.line(t.x(x, -1.3), t.y(x, -1.3), t.x(x + 1, 1.3), t.y(x + 1, 1.3), m('tendril'), 2, g);
      // A hooked claw for a butt.
      fillAll(r, [t.poly([-7.4, -1.3, -10, -1.7, -12.6, -0.6, -13.4, 0.8, -11.6, 0, -9.8, 1.3, -7.4, 1.3])], m('rim'), o, 1);
      // A mandible hook on the back, a spike on top.
      fillAll(r, [t.poly([21, 1.1, 22.2, 4, 24.2, 6.6, 26.8, 7.6, 25.6, 5.6, 24.8, 3.2, 25.4, 1.1])], m('rim'), o, 1.2);
      fillAll(r, [t.poly([27.4, -1.2, 31, -0.5, 33.6, 0.2, 31, 1, 27.4, 1.2])], m('rim'), o, 1);
      // The crescent, its edge alight.
      const B = t.poly(blade);
      fillAll(r, [B], m('head'), o, 2.2);
      r.fill(intersect(B, t.poly(band)), m('edge'), { group: g, noLine: true, local: o.local });
      // Veins of light from the eye to the edge.
      for (const [x, y] of [[17.6, -12.4], [24.4, -14], [30.2, -10.8]]) r.line(t.x(23.2, -7.2), t.y(23.2, -7.2), t.x(x, y), t.y(x, y), m('vein'), 1, g);
      // The eye in its socket.
      fillAll(r, [t.circ(23.2, -7.4, 3.6)], m('rim'), o, 1.4);
      eyeball(r, t, 23.2, -7.4, 2.7, lookAt(ph), { white: m('white'), iris: m('iris'), pupil: m('pupil'), lid: m('rim'), seam: m('vein') }, g, o.local, o.toneBias ?? 0);
    },
  };
}

function eldritchRepeater(): WeaponArt {
  // A chitin body like an insect's thorax, limbs like jointed insect legs strung with violet light,
  // mandibles at the muzzle, an eye in the bulb of the stock and a tendril curling beneath.
  return {
    tip: 9.4,
    mats: {
      stock: material(chitin(segments(2.4, 1.6))), prod: material(shell()), string: material(voidLight()),
      bolt: material(voidLight()), white: material(sclera()), iris: material(iris()), pupil: material({ base: 0x0a0610 }),
      tendril: material(flesh()), tip: material(voidLight()), vein: material(voidLight()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      const { shape, tip } = tendril(t, 1.4, -1.2, -Math.PI / 2 - 0.5, 4.6, ph, 1, 0.6, 1.4, 0.7);
      fillAll(r, [shape], m('tendril'), o, 0.8, -1);
      r.dot(t.x(tip[0], tip[1]), t.y(tip[0], tip[1]), m('tip'), 3, g);
      // Body: the stock with a bulbous abdomen at the back.
      fillAll(r, [union(t.poly([-2, -1.6, 8, -1.2, 8, 1.2, 1, 1.4, -1, 3.8, -3, 3.6, -1.6, 0.6]), t.ell(-1.8, 0, 2.4, 1.9))], m('stock'), o, 1.4);
      // Mandibles at the muzzle.
      for (const s of [-1, 1]) fillAll(r, [t.poly([7.4, s * 0.3, 9.4, s * 1.7, 10.8, s * 0.8, 9.6, s * 0.7, 8.4, s * -0.1])], m('prod'), o, 0.8);
      // Limbs: two jointed insect legs, a claw hooked at each end.
      for (const s of [-1, 1]) {
        fillAll(r, [union(t.cap(7, s * 0.6, 5.6, s * 3.4, 1, 0.75), t.cap(5.6, s * 3.4, 3.9, s * 6.2, 0.7, 0.4), t.circ(5.6, s * 3.4, 1.05), t.poly([3.6, s * 6, 4.6, s * 7.2, 5.4, s * 6.8, 4.4, s * 6.4]))], m('prod'), o, 1);
      }
      // The eye in the abdomen, in a ring of light.
      r.fill(t.circ(-1.8, 0.2, 1.6), m('vein'), { group: g });
      eyeball(r, t, -1.8, 0.2, 1.25, lookAt(ph, 1), { white: m('white'), iris: m('iris'), pupil: m('pupil'), lid: m('prod'), seam: m('vein') }, g, o.local, o.toneBias ?? 0);
      const pull = o.pull ?? 1;
      const sx = 5 - pull * 3.5;
      r.line(t.x(4, 5.8), t.y(4, 5.8), t.x(sx, 0), t.y(sx, 0), m('string'), 3, 9);
      r.line(t.x(sx, 0), t.y(sx, 0), t.x(4, -5.8), t.y(4, -5.8), m('string'), 3, 9);
      if (pull > 0.5) r.line(t.x(sx, 0.3), t.y(sx, 0.3), t.x(10, 0.3), t.y(10, 0.3), m('bolt'), 3, 9);
    },
  };
}

// -----------------------------------------------------------------------------
// Battle sprites (their own materials)
// -----------------------------------------------------------------------------

const VM = mats({
  chitin: chitin(veins(1.6)), shell: shell(), white: sclera(), iris: iris(), pupil: { base: 0x0a0610 },
  flesh: flesh(), tip: voidLight(), void: voidLight(), deep: { base: 0x6a1ac0, glow: true, ramp: [0x14061e, 0x2a0a50, 0x4a1490, 0x6a1ac0, 0xa04aff] },
  core: { base: 0x1a0830, glow: true, ramp: [0x060208, 0x0e0418, 0x140626, 0x1a0830, 0x3a1460] },
  hot: { base: 0xf4e8ff, glow: true }, vein: { base: MAGENTA, glow: true, ramp: [0x5a0a4a, 0x8a1a70, 0xc02aa0, 0xe03ac0, MAGENTA] },
  vane: { base: 0x5a3a8a, ramp: [0x1e1432, 0x34245a, 0x5a3a8a, 0x8a6ac0, 0xc8b0f0] },
});

const boltProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A barbed stinger of void-light on a chitin shaft, trailing a ribbon of void that writhes as it flies.
    const w = [0, 0.7, 0, -0.7][f];
    r.fill(t.poly([-1, -2, -7, -1.3 + w, -12, w * 0.8, -16, w * 1.6, -12, 0.9 + w * 0.6, -7, 1.4 + w, -1, 2]), h(VM.deep), { group: 1 });
    r.fill(t.poly([-1, -1, -6, w * 0.5 - 0.4, -11, w, -6, 0.6 + w * 0.5, -1, 1]), h(VM.void), { group: 1 });
    r.fill(t.cap(-5, 0, 3, 0, 0.8), h(VM.chitin), { group: 2, bevel: 0.8 });
    for (const s of [-1, 1]) r.fill(t.poly([-3, s * 0.5, -6.4, s * 2.2, -5.4, s * 0.3]), h(VM.vane), { group: 3, bevel: 0.6 });
    r.fill(t.poly([1, -2.8, 3.6, -1.3, 9, 0, 3.6, 1.3, 1, 2.8, 2.2, 0]), h(VM.void), { group: 4 });
    r.line(t.x(2.4, 0), t.y(2.4, 0), t.x(7.4, 0), t.y(7.4, 0), h(VM.hot), 3, 4);
    r.dot(t.x(-2 - f * 2.5, w * 0.5), t.y(-2 - f * 2.5, w * 0.5), h(VM.hot), 3, 1);
  },
};

/** The watcher: a floating eyeball in a chitin shell, at (0, 0) in frame t; `look` steers the iris, `open` the lids (0..1). */
function watcher(r: Raster, t: Xf, f: number, look: [number, number], open: number, h: (k: keyof typeof VM) => number, s = 1): void {
  const S = (v: number) => v * s;
  // Tendrils hanging beneath, each writhing out of step.
  for (const [x, len, k] of [[-2.4, 6.4, 0], [-0.6, 8, 1.6], [1.2, 7, 3.1], [2.8, 5.4, 4.4]] as const) {
    const { shape, tip } = tendril(t, S(x), S(-3.4), -Math.PI / 2 - x * 0.08, S(len), f, k, S(0.95), x < 0 ? -1.1 : 1.1, 0.7);
    r.fill(shape, h('flesh'), { group: 1, bevel: S(0.8), local: t });
    r.fill(t.circ(tip[0], tip[1], S(0.7)), h('tip'), { group: 1 });
  }
  // Shell: a chitin carapace cupping the eye, three spines curving back off its crown.
  r.fill(union(
    t.circ(S(-0.6), 0, S(4.9)),
    t.poly([S(-2.4), S(3.8), S(-5.6), S(6.8), S(-4.2), S(3.6)]),
    t.poly([S(-4.2), S(2.4), S(-7.6), S(3.6), S(-5.2), S(0.8)]),
    t.poly([S(-0.2), S(4.4), S(-1.8), S(7.6), S(0.8), S(4.6)]),
  ), h('chitin'), { group: 2, bevel: S(1.8), local: t });
  const cx = S(0.9), R = S(3.7);
  const ball = t.circ(cx, 0, R);
  r.fill(ball, h('white'), { group: 3, bevel: S(2.2) });
  // Bloodshot veins creeping in from the rim.
  for (const [a, l] of [[2.5, 1.5], [-2.3, 1.3]] as const) {
    r.line(t.x(cx + Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95), t.y(cx + Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95), t.x(cx + Math.cos(a) * (R - S(l)), Math.sin(a) * (R - S(l))), t.y(cx + Math.cos(a) * (R - S(l)), Math.sin(a) * (R - S(l))), h('vein'), 2, 3);
  }
  const ix = cx + look[0] * R, iy = look[1] * R;
  r.fill(intersect(t.circ(ix, iy, R * 0.58), ball), h('iris'), { group: 3 });
  r.fill(intersect(t.circ(ix, iy, R * 0.58), subtract(ball, t.circ(ix, iy, R * 0.44))), h('deep'), { group: 3, noLine: true });
  r.fill(intersect(t.ell(ix, iy, R * 0.15, R * 0.4), ball), h('pupil'), { group: 3, flat: 0, noLine: true });
  r.dot(t.x(ix + R * 0.22, iy + R * 0.26), t.y(ix + R * 0.22, iy + R * 0.26), h('hot'), 3, 3);
  // Lids closing over the eye from above and below.
  if (open < 1) {
    const lid = t.circ(cx, 0, R + S(0.3));
    const gap = open * R;
    r.fill(intersect(lid, t.rect(cx, gap + S(3), S(6), S(3))), h('shell'), { group: 4, bevel: S(1.2) });
    r.fill(intersect(lid, t.rect(cx, -gap - S(3), S(6), S(3))), h('shell'), { group: 5, bevel: S(1.2), toneBias: -1 });
  }
}

const VK = (k: keyof typeof VM) => VM[k];
const lanternProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // The watcher looks about: ahead, up and back, blinks, then peers down, half-lidded.
    const look = ([[0.3, 0.04], [-0.16, 0.28], [0, 0], [-0.24, -0.24]] as [number, number][])[f];
    watcher(r, t, f, look, [1, 1, 0, 0.55][f], (k) => h(VK(k)), 1.15);
  },
};

const wispProj: ProjArt = {
  frames: 4,
  draw(r, t, f, h) {
    // An orb of void: a black heart in a violet rim, a writhing tail and two motes circling it.
    const w = [0, 0.8, 0, -0.8][f];
    r.fill(t.poly([1, -2.8, -5, -1.6 + w * 0.5, -9, -0.4 + w, -13, w * 1.6, -9, 1 + w, -5, 2 + w * 0.5, 1, 2.8]), h(VM.deep), { group: 1 });
    r.fill(t.circ(0.6, 0, 3.2), h(VM.void), { group: 1 });
    r.fill(t.circ(0.9, 0, 2), h(VM.core), { group: 1 });
    r.dot(t.x(2, 1.2), t.y(2, 1.2), h(VM.hot), 3, 1);
    for (let k = 0; k < 2; k++) {
      const a = f * Q + k * Math.PI;
      r.dot(t.x(0.6 + Math.cos(a) * 4.6, Math.sin(a) * 3.4), t.y(0.6 + Math.cos(a) * 4.6, Math.sin(a) * 3.4), h(k ? VM.vein : VM.hot), 3, 1);
    }
  },
};

const watcherSkin: SkinArt = {
  mats: {
    // Stock names: the familiar's metal and light, and the wisp shots, in void colours.
    lantern: { base: CHITIN[3], ramp: [...CHITIN, 0x8a70c0], shiny: true }, wisp: glow(VIOLET), wispHot: glow(PALE),
    'k.chitin': chitin(veins(1.2)), 'k.shell': shell(), 'k.white': sclera(), 'k.iris': iris(), 'k.pupil': plain(0x0a0610),
    'k.flesh': flesh(), 'k.tip': voidLight(), 'k.void': voidLight(), 'k.hot': glow(0xf4e8ff), 'k.vein': { base: MAGENTA, glow: true, ramp: [0x5a0a4a, 0x8a1a70, 0xc02aa0, 0xe03ac0, MAGENTA] },
    'k.deep': { base: 0x6a1ac0, glow: true, ramp: [0x14061e, 0x2a0a50, 0x4a1490, 0x6a1ac0, 0xa04aff] },
  },
  glow: [PALE, 0x7a1ad0],
  icon(r, t, m) {
    // The watcher at full size, peering up and out, two void motes drifting by.
    const k: Record<keyof typeof VM, string> = {
      chitin: 'k.chitin', shell: 'k.shell', white: 'k.white', iris: 'k.iris', pupil: 'k.pupil', flesh: 'k.flesh', tip: 'k.tip',
      void: 'k.void', deep: 'k.deep', core: 'k.deep', hot: 'k.hot', vein: 'k.vein', vane: 'k.shell',
    };
    const T = new Xf(t.ox + 0.5, t.oy - 3, 0);
    watcher(r, T, 0, [0.3, 0.2], 1, (n) => m(k[n]), 1.75);
    r.fill(t.circ(10.6, 9.6, 1.3), m('k.void'), { group: 9 });
    r.dot(t.x(10.6, 9.6), t.y(10.6, 9.6), m('k.hot'), 3, 9);
    r.fill(t.circ(-11, 4, 0.9), m('k.void'), { group: 9 });
  },
  proj: { lantern: lanternProj, wisp: wispProj },
};

// -----------------------------------------------------------------------------
// Armour
// -----------------------------------------------------------------------------

function thousandEyes(): SkinArt {
  // A black hood whose peak curls back like a tendril, small violet eyes all over it blinking out of step,
  // tendrils hanging from the hem and three burning eyes in the shadow where the face should be.
  const folds: Tex = (x, y) => (Math.sin(x * 0.9 + y * 0.35) > 0.82 ? -1 : 0);
  const EYES: [number, number][] = [[-3.2, 6.4], [0.4, 7], [-6.2, 3.8], [-2.4, 3.2], [-5.8, -0.8], [-2.8, -4.4], [-6.6, -5], [-6.4, 9.2]];
  return {
    head: () => ({
      mats: {
        'h.hood': material({ base: 0x1e1430, ramp: [0x0a0610, 0x140e20, 0x1e1430, 0x34264c, VIOLET], tex: folds }),
        'h.tendril': material(flesh()), 'h.tip': material(voidLight()),
        'h.eye': material({ base: VIOLET, glow: true, ramp: [0x3a1470, 0x6a2ab8, 0x8a3ae8, 0xb060ff, 0xf0d8ff] }),
        'h.pupil': material({ base: 0x0a0610 }), 'h.burn': material(iris()), 'h.mag': material({ base: MAGENTA, glow: true }),
      },
      draw(r, H, m, g, sway) {
        const ph = r.phase % 4, s = sway * 1.5;
        // Tendrils hanging from the hem, behind the hood.
        for (const [x, y, len, k] of [[-7.2, -2.6, 7, 0], [-6.4, -5.6, 8.4, 1.7], [-3.6, -6.8, 6.2, 3.3]] as const) {
          const { shape, tip } = tendril(H, x, y, -Math.PI / 2 - 0.65 - s * 0.05, len, ph, k, 1.05, k === 1.7 ? 0.9 : -0.9, 0.6);
          r.fill(shape, m('h.tendril'), { group: g, bevel: 0.8, toneBias: -1, local: H });
          r.dot(H.x(tip[0], tip[1]), H.y(tip[0], tip[1]), m('h.tip'), 3, g);
        }
        // The hood and its peak curling back like a tendril.
        const peak = tendril(H, -0.8, 7.6, Math.PI * 0.55, 10, ph, 0.6, 2.4, 2.6, 0.2);
        const hood = union(H.ell(-0.8, 1.2, 7.8, 7.6), H.poly([-7.6, 1, -6.4, -6.8, 1, -7.4, 3, -4]), peak.shape);
        r.fill(hood, m('h.hood'), { group: g, bevel: 3, softLight: true, local: H });
        r.dot(H.x(peak.tip[0], peak.tip[1]), H.y(peak.tip[0], peak.tip[1]), m('h.eye'), 3, g);
        // The face lost in shadow, three eyes burning in it.
        r.fill(H.ell(3.8, -1.3, 3.7, 4.1), m('h.hood'), { group: g, flat: 0, noLine: true });
        const open = ph !== 3;
        if (open) {
          r.dot(H.x(2.6, 0.2), H.y(2.6, 0.2), m('h.burn'), 3, g);
          r.dot(H.x(3.6, 0.2), H.y(3.6, 0.2), m('h.burn'), 4, g);
          r.dot(H.x(5.8, 0.1), H.y(5.8, 0.1), m('h.burn'), 3, g);
        } else {
          r.line(H.x(2.4, 0), H.y(2.4, 0), H.x(3.8, 0), H.y(3.8, 0), m('h.burn'), 1, g);
        }
        r.dot(H.x(4.4, 2.4), H.y(4.4, 2.4), m('h.mag'), ph === 1 ? 2 : 3, g);
        // Small eyes all over the hood, each blinking and looking about on its own beat.
        EYES.forEach(([x, y], i) => {
          const look = lookAt(ph, i * 3 + (i >> 1));
          if (!look) { r.line(H.x(x - 0.9, y), H.y(x - 0.9, y), H.x(x + 0.9, y), H.y(x + 0.9, y), m('h.eye'), 0, g); return; }
          r.fill(H.ell(x, y, 1.35, 0.85), m('h.eye'), { group: g });
          r.dot(H.x(x + look[0] * 0.8, y), H.y(x + look[0] * 0.8, y), m('h.pupil'), 0, g);
        });
      },
    }),
    ...FX,
  };
}

function tendrilCarapace(): SkinArt {
  // Black chitin plates threaded with violet veins, shell pauldrons each holding a watching eye,
  // a slit eye at the sternum, and tendrils writhing from the back.
  return {
    mats: {
      thorn: chitin((x, y, ph) => (wrap(y, 2.6) < 0.45 ? -1 : 0) + veins(1, 0.09)(x, y, ph)), thornDark: plain(0x120c1c), thornSpike: shell(),
      'k.shell': shell(), 'k.flesh': flesh(), 'k.tip': voidLight(), 'k.white': sclera(), 'k.iris': iris(), 'k.vein': voidLight(),
      'k.pupil': plain(0x0a0610),
    },
    chest: {
      pauldron: null, spikes: null, sleeve: 'thorn', sleeveLen: 1,
      back(r, T, m, c) {
        const top = c.top, ph = r.phase % 4, s = c.sway * 0.3;
        // Five tendrils fanning out of the upper back, far ones darker, each its own outline group.
        const fan: [number, number, number, number, number][] = [
          [-2.4, top - 1.4, Math.PI * 0.56, 16, 0], [-3, top - 4.6, Math.PI * 0.96, 14, 3.4],
          [-2.8, top - 0.8, Math.PI * 0.68, 19, 1.2], [-3.2, top - 3, Math.PI * 0.8, 17, 2.3],
        ];
        fan.forEach(([x, y, dir, len, k], i) => {
          const { shape, tip } = tendril(T, x, y, dir + s, len, ph, k, 2.2, i % 2 ? -1.7 : 1.7, 0.55);
          r.fill(shape, m('k.flesh'), { group: 40 + i, bevel: 1, toneBias: i < 2 ? -1 : 0, local: T });
          r.fill(T.circ(tip[0], tip[1], 0.9), m('k.tip'), { group: 40 + i });
        });
      },
      shoulder(r, S, m, c) {
        // A ridged shell with spines raking back, an eye peering out of it.
        const o = { group: c.g, toneBias: c.bias };
        r.fill(union(S.ell(0, 0.8, 3.2, 2.4), S.poly([-1.2, 2.4, -3.8, 4.6, -1.6, 3.4]), S.poly([0.6, 2.8, -0.8, 5.2, 1.6, 3.2])), m('k.shell'), { ...o, bevel: 1.6, local: S });
        const look = lookAt(r.phase % 4, c.far ? 2 : 0);
        bead(r, S, 0.6, 1.1, 1.5, 1.1, look, m('k.white'), m('k.iris'), m('k.vein'), c.g, c.bias);
      },
      over(r, T, m, c) {
        // A slit eye over the sternum in a ridge of chitin, veins of light running out from it.
        const x = c.body.chestPush * 0.7 + 1.1, y = c.top - 4.6;
        for (const [dx, dy] of [[-2.4, 3.6], [1.4, -4.4], [-2, -4]]) r.line(T.x(x, y), T.y(x, y), T.x(x + dx, y + dy), T.y(x + dx, y + dy), m('k.vein'), 2, c.g);
        r.fill(subtract(T.ell(x, y, 1.9, 2.8), T.ell(x, y, 1.1, 2)), m('k.shell'), { group: c.g, bevel: 0.8 });
        const ph = r.phase % 4;
        if (ph === 2) { r.line(T.x(x, y - 1.6), T.y(x, y - 1.6), T.x(x, y + 1.6), T.y(x, y + 1.6), m('k.vein'), 1, c.g); return; }
        r.fill(T.ell(x, y, 1.1, 2), m('k.white'), { group: c.g, bevel: 0.8 });
        const ly = [0.4, 0, 0, -0.5][ph];
        r.line(T.x(x, y + ly - 0.8), T.y(x, y + ly - 0.8), T.x(x, y + ly + 0.8), T.y(x, y + ly + 0.8), m('k.iris'), 3, c.g);
      },
    },
    ...FX,
  };
}

function voidwalkers(): SkinArt {
  // Chitin boots in overlapping plates with a hooked insect claw at the toe, a small eye at the ankle
  // that blinks, and void ooze welling at the heel and dripping off.
  return {
    mats: {
      shadow: chitin((x) => (wrap(x, 2.2) < 0.45 ? -1 : 0)), shadowGlow: { base: 0x4a2a7a, ramp: [0x1a0e2a, 0x2e1a4a, 0x4a2a7a, 0x6a3aa8, 0xa060f0] },
      'k.plate': shell(), 'k.white': sclera(), 'k.iris': iris(), 'k.vein': voidLight(),
      'k.ooze': { base: 0x7a2ae0, glow: true, ramp: [0x14061e, 0x3a1070, 0x5a1aa8, 0x7a2ae0, PALE] },
    },
    boots: {
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w;
        // Plates layered down the front of the shin, each overlapping the one below.
        for (let k = 2; k >= 0; k--) {
          const a = 1 + k * (c.top - 1) / 3;
          r.fill(shin.poly([a + 0.2, w - 0.6, a + (c.top - 1) / 3 + 0.6, w - 0.2, a + (c.top - 1) / 3 + 0.4, w + 0.5, a - 0.4, w + 0.9]), m('k.plate'), { ...o, bevel: 0.8 });
        }
        // A hooked claw off the toe and a spur at the heel.
        r.fill(foot.poly([c.toe - 1.4, 0.6, c.toe + 1, 0.4, c.toe + 2.2, -0.4, c.toe + 2, -1.4, c.toe + 1.2, -0.6, c.toe - 1, -0.6]), m('k.plate'), { ...o, bevel: 0.6 });
        r.fill(foot.poly([-0.4, 0.6, -2.8, 0.4, -0.6, -0.6]), m('k.plate'), { ...o, bevel: 0.6 });
        // The eye at the ankle.
        bead(r, shin, c.top * 0.42, 0, 1.2, 0.85, lookAt(ph, c.far ? 1 : 3), m('k.white'), m('k.iris'), m('k.vein'), c.g, c.bias);
        if (c.far) return;
        // Ooze welling at the heel, stretching, falling and splashing over the loop.
        const back = new Xf(foot.ox, foot.oy, foot.ang, -foot.sx, foot.sy);
        const oz = m('k.ooze');
        r.fill(back.ell(1.4, 0.2, 1.1, 0.9), oz, { group: c.g });
        if (ph === 0) r.fill(back.cap(1.6, 0, 1.8, -1.1, 0.75, 0.6), oz, { group: c.g });
        if (ph === 1) r.fill(back.cap(1.6, 0, 1.9, -1.9, 0.6, 0.8), oz, { group: c.g });
        if (ph === 2) { r.fill(back.cap(1.6, 0, 1.8, -0.8, 0.55, 0.35), oz, { group: c.g }); r.fill(back.circ(2, -2.2, 0.7), oz, { group: c.g }); }
        if (ph === 3) r.fill(back.ell(2.1, -2.5, 1.6, 0.45), oz, { group: c.g });
        r.dot(back.x(1.3, 0.2), back.y(1.3, 0.2), oz, 4, c.g);
      },
    },
    ...FX,
  };
}

function chitinCuisses(): SkinArt {
  // Segmented black chitin with violet veins, shell plates overlapping down the front of the thigh,
  // an eye in the knee cop that looks around and blinks, and small tendrils curling from the hip.
  return {
    mats: {
      legLeather: chitin(segments(2.6, 1.3)), legLeatherDark: plain(0x120c1c),
      'l.shell': shell(), 'l.flesh': flesh(), 'l.tip': voidLight(), 'l.white': sclera(), 'l.iris': iris(),
      'l.vein': voidLight(), 'l.pupil': plain(0x0a0610),
    },
    legs: {
      mat: 'legLeather', trim: 'legLeatherDark', knee: 'l.shell', tasset: null, rune: null, wraps: null, bulk: 0.2,
      over(r, t, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w, L = c.len;
        // Tendrils curling out from under the hip, writhing (behind the plates).
        const ts: [number, number, number, number, number][] = [[L * 0.8, -w + 0.4, Math.PI * 1.22, L * 0.55, 0], [L * 0.7, w * 0.1, Math.PI * 1.1, L * 0.4, 2]];
        ts.forEach(([x, y, dir, len, k], i) => {
          const { shape, tip } = tendril(t, x, y, dir, len, ph, k, 0.85, i ? 1.4 : -1.5, 0.6);
          r.fill(shape, m('l.flesh'), { group: c.g, bevel: 0.8, toneBias: c.bias });
          r.dot(t.x(tip[0], tip[1]), t.y(tip[0], tip[1]), m('l.tip'), 3, c.g);
        });
        // Shell plates overlapping down the front of the thigh, each over the one below.
        for (let k = 0; k < 3; k++) {
          const a = L * (0.3 + k * 0.2);
          r.fill(t.poly([a + L * 0.22, w - 0.8, a + L * 0.22, w + 0.5, a - 0.2, w + 0.9, a - 0.6, w - 0.4]), m('l.shell'), { ...o, bevel: 0.8 });
        }
        // The eye in the knee cop.
        const kr = c.body.kneeR + 0.2;
        // Drawn in an upright frame (x toward the front, y up the thigh) so the lid shuts across the leg.
        const up = new Xf(t.ox, t.oy, t.ang - Math.PI / 2);
        eyeball(r, up, 0.8, 0.4, kr * 0.66, lookAt(ph, c.far ? 2 : 0), { white: m('l.white'), iris: m('l.iris'), pupil: m('l.pupil'), lid: m('l.shell'), seam: m('l.vein') }, c.g, undefined, c.bias);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Set
// -----------------------------------------------------------------------------

/** Particles the full set sheds in battle. */
export const VOIDBORN_FX: SkinFx = { spark: PALE, spark2: 0x7a1ad0, kind: 'flame' };

const C = {
  rift: css(0x0a0612), deep: css(0x5a1aa8), violet: css(VIOLET), pale: css(PALE), flesh: css(0x8a3aa8),
  white: css(0xeadff4), iris: css(ACID), pupil: css(0x0a0610), lid: css(0x2e2248),
};

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function voidbornAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  if (layer === 'back') {
    // A rift of void open under the feet, a seam of light flickering across it.
    g.globalAlpha = 0.6;
    g.fillStyle = C.rift;
    g.fillRect(x - 8, y - 2, 17, 1); g.fillRect(x - 12, y - 1, 25, 3); g.fillRect(x - 8, y + 2, 17, 1);
    g.globalAlpha = 0.5 + 0.4 * Math.abs(Math.sin(t * 2.6));
    g.fillStyle = C.violet;
    g.fillRect(x - 9, y, 4, 1); g.fillRect(x - 5, y - 1, 3, 1); g.fillRect(x - 2, y, 5, 1); g.fillRect(x + 3, y + 1, 3, 1); g.fillRect(x + 6, y, 3, 1);
    g.globalAlpha = 1;
  }
  // Ripples of dark light spreading out of the rift and fading.
  for (let k = 0; k < 2; k++) {
    const u = (t * 0.45 + k * 0.5) % 1;
    g.globalAlpha = 0.85 * (1 - u);
    g.fillStyle = u < 0.35 ? C.violet : C.deep;
    ring(g, x, y, 10 + u * 9, 2.4 + u * 2.2, 24, layer, (g, px, py, i) => { if ((i + k) % 3) g.fillRect(px, py, 1, 1); });
  }
  g.globalAlpha = 1;
  // Tendrils rising out of the ground and sinking back, swaying, their tips lit.
  for (let k = 0; k < 5; k++) {
    const a = k * 1.26 + 0.4, s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const h = Math.round(8 * Math.sin(t * 1.9 + k * 2.1));
    if (h <= 0) continue;
    const px = Math.round(x + Math.cos(a) * 14), py = Math.round(y + s * 3.4);
    const lean = Math.sin(t * 3 + k) > 0 ? 1 : -1;
    g.fillStyle = C.flesh; g.fillRect(px, py - h + 1, 1, h);
    if (h > 2) g.fillRect(px + lean, py - h, 1, 1);
    g.fillStyle = C.pale; g.fillRect(px + (h > 2 ? lean : 0), py - h - (h > 2 ? 1 : 0), 1, 1);
  }
  // Two eyes opening in the ground, looking about, then closing again.
  for (let k = 0; k < 2; k++) {
    const a = k ? -1.1 : 2.3, s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const px = Math.round(x + Math.cos(a) * 11), py = Math.round(y + s * 2.6);
    const o = Math.sin(t * 1.1 + k * 2.6);
    if (o < -0.2) continue;
    if (o < 0.25) { g.fillStyle = C.lid; g.fillRect(px - 2, py, 5, 1); continue; }
    const look = Math.round(Math.sin(t * 0.8 + k * 1.7) * 1.4);
    g.fillStyle = C.white; g.fillRect(px - 2, py, 5, 1);
    if (o > 0.6) g.fillRect(px - 1, py - 1, 3, 3);
    g.fillStyle = C.iris; g.fillRect(px + look, py - (o > 0.6 ? 1 : 0), 1, o > 0.6 ? 3 : 1);
    g.fillStyle = C.pupil; g.fillRect(px + look, py, 1, 1);
  }
}

export const VOIDBORN: Record<string, SkinArt> = {
  'greataxe.voidreaver': { weapon: voidreaver, ...FX },
  'hand_crossbow.eldritch': { weapon: eldritchRepeater, proj: { bolt: boltProj }, ...FX },
  'wisp_lantern.watcher': watcherSkin,
  'executioner_hood.thousandeyes': thousandEyes(),
  'thornmail.tendril': tendrilCarapace(),
  'shadow_treads.voidwalkers': voidwalkers(),
  'leather_leggings.chitin': chitinCuisses(),
};
