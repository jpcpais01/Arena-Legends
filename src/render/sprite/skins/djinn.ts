import { ring, type Layer } from '../../auraKit';
import { css, mix } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { fillAll, hangAt, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, mats, Q, wrap } from './kit';

/**
 * Epic set: Djinn of the Endless Sands. A djinn-king's finery: silks of
 * turquoise and saffron with a sheen sliding over them, gold filigree,
 * a sapphire of bound djinn fire on every piece, smoky blue djinn fire
 * licking off the blade and curling out of the lamp, and sand on the wind.
 */

/** Turquoise silk: sea-green in the folds, its top tone the light along the sheen. */
const TURQ = [0x0a3a48, 0x13697a, 0x1f9ea6, 0x56d2c8, 0xbff6ee];
/** Saffron silk: burnt orange in the folds, warm yellow in the light. */
const SAFF = [0x6a2808, 0xa84e10, 0xe0861c, 0xf8b648, 0xffe4a0];
const GOLD = [0x5a3210, 0x9a6418, 0xd8a032, 0xf8d468, 0xfff6cc];
/** Night-blue silk for the sash. */
const INDIGO = [0x0e0c2a, 0x1c1a4a, 0x2e2e72, 0x464a9a, 0x7a84c8];
/** Djinn fire: smoky blue flame with a white-hot heart. */
const DFIRE = [0x16307a, 0x2456c0, 0x3a8eee, 0x86d0ff, 0xe8faff];
/** The smoke a djinn is made of: dusky blue, lit pale at its edges. */
const SMOKE = [0x1e2a5e, 0x2e4690, 0x4a70c4, 0x7ea6e8, 0xc8e0ff];
const SAND = [0x6a4a22, 0xa07a44, 0xd0a868, 0xecd298, 0xfff2d0];
/** Watered steel, faintly blue. */
const STEEL = [0x262c3c, 0x56607a, 0x98a4ba, 0xd0daea, 0xffffff];
const PEARL = [0x7a7468, 0xbcb4a4, 0xe8e2d4, 0xfaf6ee, 0xffffff];

// -----------------------------------------------------------------------------
// Textures
// -----------------------------------------------------------------------------

/** Silk: soft folds, and a sheen sliding across it one step per frame. */
const silk = (fold = 3.2, sheen = true): Tex => (x, y, ph) => {
  if (sheen && wrap(x * 0.55 + y * 0.35 - ph * 1.7, 9) < 1.1) return 1;
  return wrap(y * 0.9 + Math.sin(x * 0.5) * 0.8, fold) < 0.6 ? -1 : 0;
};
/** Loose trousers: long folds down the leg (thigh and shin frames run along it), the sheen sliding over them. */
const drape: Tex = (x, y, ph) => {
  if (wrap(x * 0.35 - y * 0.6 + ph * 1.5, 10) < 1) return 1;
  return wrap(y + Math.sin(x * 0.45) * 0.7, 3.8) < 0.7 ? -1 : 0;
};
/** Wrapped cloth: diagonal folds round a turban, the sheen riding along them. */
const wound: Tex = (x, y, ph) => {
  const v = wrap(y * 0.85 - x * 0.32, 2.4);
  if (v < 0.55) return -1;
  return v > 1.5 && v < 1.9 && wrap(x * 0.4 + ph * 1.6, 6) < 1.4 ? 1 : 0;
};
/** Gold filigree: a band of tiny scrolls (dark), a glint wandering along it. */
const filigree: Tex = (x, y, ph) => {
  if (hash(Math.floor(x * 0.8) + ph * 17, Math.floor(y * 0.8) - ph * 5) < 0.05) return 1;
  const a = wrap(x, 2.6) - 1.3, b = wrap(y + Math.floor(x / 2.6) * 1.3, 2.6) - 1.3;
  const d = a * a + b * b;
  return d > 0.5 && d < 0.95 ? -1 : 0;
};
/** Watered (damascus) steel ripples down the blade. */
const watered: Tex = (x, y) => (wrap(x * 0.55 + Math.sin(y * 2.2 + x * 0.3) * 0.7, 2.4) < 0.55 ? -1 : 0);
/** Flames flickering upward, hot tongues stepping each frame. */
const flicker: Tex = (x, y, ph) => (wrap(y * 0.9 - ph * 1.4 + Math.sin(x * 1.3) * 0.6, 3) < 0.9 ? 1 : 0);
/** A gem's heart breathing over the loop. */
const pulse: Tex = (_x, _y, ph) => [0, 1, 0, -1][ph % 4];
/** Thread wound round a grip. */
const binding: Tex = (x, y) => (wrap(x * 1.1 + y * 0.6, 1.4) < 0.45 ? -1 : 0);
/** Embroidered stripes of the sash. */
const sashStripe: Tex = (_x, y) => (wrap(y, 2.2) < 0.55 ? 1 : 0);
/** Embroidery on slippers: little gold lozenges. */
const lozenge: Tex = (x, y) => (wrap(Math.floor(x * 0.9 + y * 0.9), 3) === 0 && wrap(Math.floor(x * 0.9 - y * 0.9), 3) === 0 ? 1 : 0);

// -----------------------------------------------------------------------------
// Materials
// -----------------------------------------------------------------------------

const ramp = (r: number[], o: Partial<MaterialSpec> = {}): MaterialSpec => ({ base: r[2], ramp: r, ...o });
const turq = (tex?: Tex): MaterialSpec => ramp(TURQ, { tex });
const saff = (tex?: Tex): MaterialSpec => ramp(SAFF, { tex });
/**
 * Cloth: the ramp shifted up a tone and the texture one tone down, so the sheen reaches the light
 * tone but never the top one (cloth stays dark at night; only gems, gold and fire shine).
 */
const cloth = (r: number[], tex: Tex = silk()): MaterialSpec => ({
  base: r[2], ramp: [mix(r[0], r[1], 0.45), r[2], r[3], r[4], r[4]], tex: (x, y, ph) => tex(x, y, ph) - 1,
});
const gold = (tex?: Tex): MaterialSpec => ramp(GOLD, { shiny: true, tex });
const gem = (): MaterialSpec => ({ base: DFIRE[3], ramp: DFIRE, glow: true, tex: pulse });
const fire = (tex: Tex = flicker): MaterialSpec => ({ base: DFIRE[2], ramp: DFIRE, glow: true, tex });
/** Smoke: not lit by the sun, just its own soft volume. */
const smoke = (): MaterialSpec => ramp(SMOKE, { minTone: 2 });
const sand = (tex?: Tex): MaterialSpec => ramp(SAND, { tex });
const pearl = (tex?: Tex): MaterialSpec => ramp(PEARL, { tex });

const FX = epicFx(0xfff0b8, 0x3a8ae8, 'twinkle', 0x9ae0ff);

/** Particles the full set sheds in battle: wisps of smoky blue djinn fire. */
export const DJINN_FX: SkinFx = { spark: 0xc8f0ff, spark2: 0x2a5ad8, kind: 'flame' };

// -----------------------------------------------------------------------------
// Shapes
// -----------------------------------------------------------------------------

/** A tapering chain of capsules through [x, y, radius] points. */
function chain(F: Xf, pts: number[][]): Shape {
  const s: Shape[] = [];
  for (let i = 1; i < pts.length; i++) s.push(F.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i - 1][2], pts[i][2]));
  return union(...s);
}

/** A plume from (x, y) toward angle `a`: a narrow quill widening to `w`, then a soft point; `curl` bends it. */
function plumeShape(F: Xf, x: number, y: number, a: number, len: number, w: number, curl = 0): Shape {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  const p = (u: number, v: number) => {
    const b = curl * u * u * len;
    return [x + c * u * len + nx * (v + b), y + s * u * len + ny * (v + b)];
  };
  return F.poly([
    ...p(0, -w * 0.25), ...p(0.35, -w * 0.8), ...p(0.7, -w), ...p(0.92, -w * 0.6), ...p(1, 0),
    ...p(0.92, w * 0.6), ...p(0.7, w), ...p(0.35, w * 0.8), ...p(0, w * 0.25),
  ]);
}

/** Fills smoke puffs, alternating outline groups so each reads as its own puff. */
function puffs(r: Raster, shapes: Shape[], mat: number, g0: number, local?: Xf, bias = 0): void {
  shapes.forEach((sh, i) => r.fill(sh, mat, { group: g0 + (i % 2), bevel: 1.1, toneBias: bias, local, softLight: true }));
}

/** A gold rosette: a disc ringed with `n` round petals (one shape). */
function rosette(F: Xf, cx: number, cy: number, rad: number, n = 8): Shape {
  const parts: Shape[] = [F.circ(cx, cy, rad * 0.8)];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    parts.push(F.circ(cx + Math.cos(a) * rad * 0.8, cy + Math.sin(a) * rad * 0.8, rad * 0.32));
  }
  return union(...parts);
}

/** The main volumes of the torso (as the figure draws it), for clipping the vest's front to it. */
function torsoBody(T: Xf, b: { hipW: number; waistW: number; chestW: number; chestPush: number }, top: number): Shape {
  return union(
    T.ell(0.3, 0.6, b.hipW, 3.6),
    T.ell(0.5, top * 0.46, b.waistW, top * 0.28),
    T.ell(b.chestPush * 0.7, top - 3.4, b.chestW, 5.4),
  );
}

// -----------------------------------------------------------------------------
// Weapons
// -----------------------------------------------------------------------------

function scimitar(): WeaponArt {
  // A broad scimitar of watered steel sweeping up to a clipped point, gold filigree inlaid along its back,
  // smoky blue djinn fire licking off the spine; a gold guard with curling quillons and turquoise beads,
  // a turquoise-bound grip, a gold crescent pommel holding a sapphire of djinn fire, a saffron tassel.
  return {
    tip: 31,
    mats: {
      blade: material(ramp(STEEL, { shiny: true, tex: watered })), gold: material(gold()), inlay: material(gold(filigree)),
      grip: material(turq(binding)), gem: material(gem()), fire: material(fire()), hot: material({ base: 0xe8faff, glow: true }),
      tassel: material(saff((x) => (wrap(x * 2, 1.6) < 0.5 ? -1 : 0))),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // Spine curve: the blade rises toward the tip.
      const cy = (x: number) => 0.0052 * (x - 2) * (x - 2);
      // The saffron tassel hanging off the pommel, swinging a beat behind.
      const sw = [0, 0.5, 0.8, 0.3][ph];
      const Hg = hangAt(t, -8.6, -0.4);
      fillAll(r, [Hg.cap(0, 0, 2.2, sw * 0.4, 0.25)], m('gold'), o, 0.5);
      fillAll(r, [Hg.cap(2.6, sw * 0.5, 5.4, sw * 1.4, 0.55, 0.95)], m('tassel'), o, 0.8);
      fillAll(r, [Hg.circ(2.4, sw * 0.45, 0.6)], m('gold'), o, 0.6);
      // Grip and pommel: a gold crescent curling toward the edge, the gem in its cup.
      fillAll(r, [t.cap(-6.8, 0, -0.4, 0, 1.15, 1.1)], m('grip'), o, 1);
      fillAll(r, [t.rect(-3.6, 0, 0.35, 1.3), t.rect(-1.2, 0, 0.35, 1.3)], m('gold'), o, 0.6);
      fillAll(r, [union(t.ell(-7.7, 0.1, 1.5, 1.45), t.cap(-8.2, -0.6, -9.2, -2.2, 0.75, 0.4), t.cap(-8.1, 0.8, -9.3, 1.9, 0.6, 0.35))], m('gold'), o, 1);
      r.fill(t.circ(-7.8, 0.15, 0.7), m('gem'), { group: g });
      // The blade: narrow at the guard, swelling toward the clip, sweeping up to the point.
      const xs = [2, 6, 10, 14, 18, 22, 25, 27.5, 29.6];
      const lo = [1.05, 1.25, 1.65, 2.15, 2.75, 3.4, 3.8, 3.5, 2.3];
      const hi = [0.95, 0.95, 0.95, 0.95, 0.95, 0.9, 0.8, 0.45, 0.1];
      const pts: number[] = [];
      for (let i = 0; i < xs.length; i++) pts.push(xs[i], cy(xs[i]) + hi[i]);
      pts.push(31.6, cy(31.6) + 0.5);
      for (let i = xs.length - 1; i >= 0; i--) pts.push(xs[i], cy(xs[i]) - lo[i]);
      const blade = t.poly(pts);
      // Djinn fire licking off the spine, each tongue on its own beat (behind the blade so it rises from it).
      fillAll(r, [blade], m('blade'), o, 1.3);
      // Gold filigree inlaid down the back, a fuller line, and a gold collar at the ricasso.
      r.fill(intersect(blade, t.poly([4, cy(4) + 0.9, 10, cy(10) + 0.9, 7.6, cy(7.6) - 0.6, 4, cy(4) - 0.8])), m('inlay'), { group: g, bevel: 0.6, noLine: true, local: o.local });
      // Djinn fire running down the fuller, a hot pulse travelling toward the point.
      for (let x = 10; x < 26; x += 0.5) {
        const y = cy(x) - 0.55 - (x - 10) * 0.035;
        const d = x - (11 + ph * 4);
        if (d > -2.5 && d < 1) r.dot(t.x(x, y), t.y(x, y), d > -0.6 ? m('hot') : m('fire'), 3, g);
        else r.dot(t.x(x, y), t.y(x, y), m('blade'), Math.floor(x * 2) % 3 ? 1 : 2, g);
      }
      fillAll(r, [t.poly([1.6, -1.2, 3.6, -1.15, 3.8, 1.05, 1.6, 1.15])], m('gold'), o, 0.8);
      // A glint running down the edge, one step per frame.
      const gx = 8 + ph * 5.5;
      r.dot(t.x(gx, cy(gx) - [1.3, 1.6, 2, 2.3][ph]), t.y(gx, cy(gx) - [1.3, 1.6, 2, 2.3][ph]), m('blade'), 4, g);
      // The guard: a gold bar whose quillons curl toward the blade, turquoise beads at their tips, a gem at the heart.
      fillAll(r, [union(t.rect(0.6, 0, 0.75, 2.9, 0.3), t.cap(0.8, 2.6, 2.6, 3.6, 0.55, 0.45), t.cap(0.8, -2.6, 2.6, -3.6, 0.55, 0.45))], m('gold'), o, 1);
      fillAll(r, [t.circ(2.9, 3.7, 0.65), t.circ(2.9, -3.7, 0.65)], m('grip'), o, 0.6);
      r.fill(t.circ(0.7, 0, 0.55), m('gem'), { group: g });
    },
  };
}

function wishingLamp(): WeaponArt {
  // A gold oil lamp held by its handle, upright whatever angle the hand is at: a filigree band round the
  // belly, a turquoise medallion, a domed lid crowned with a sapphire of djinn fire, a saffron tassel under
  // the spout, and blue djinn smoke curling up out of the spout and back over the lamp.
  return {
    tip: 13,
    mats: {
      gold: material(gold()), band: material(gold(filigree)), turq: material(turq()), gem: material(gem()),
      smoke: material(smoke()), fire: material(fire()), hot: material({ base: 0xe8faff, glow: true }),
      tassel: material(saff((x) => (wrap(x * 2, 1.6) < 0.5 ? -1 : 0))),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      const s = Math.abs(t.sy);
      const U = new Xf(t.ox, t.oy, 0, s, s);
      // Djinn smoke curling up from the spout and leaning back over the lamp (behind the lamp).
      // The lamp hangs under the hand by its handle: everything sits a little below the grip.
      const L = new Xf(U.x(0, -2.6), U.y(0, -2.6), 0, s, s);
      // A hook of smoke: up from the spout, over and back above the lamp, curling in at the end.
      const HOOK = [[13.8, 4.2, 0.6], [14.7, 6, 0.85], [14.4, 8.1, 1.05], [12.9, 9.7, 1.25], [10.8, 10.1, 1.4], [9.2, 8.9, 1.15], [9.8, 7.4, 0.75]];
      puffs(r, HOOK.map(([x, y, rr], i) => L.circ(x + Math.sin(ph * Q + i * 1.3) * 0.35, y + Math.cos(ph * Q + i) * 0.25, rr * (1 + ((ph + i) % 4 === 0 ? 0.15 : 0)))), m('smoke'), 40, L);
      r.dot(L.x(13.6, 3.8), L.y(13.6, 3.8), m('fire'), 3, 40);
      r.dot(L.x(13.4, 4.6 + (ph % 2)), L.y(13.4, 4.6 + (ph % 2)), m('hot'), 3, 40);
      // The handle: a gold loop from the lamp's back up to the hand.
      fillAll(r, [subtract(L.ell(2.2, 1.6, 2.2, 2.2), L.ell(2.2, 1.6, 1.2, 1.2))], m('gold'), o, 0.8);
      // Tassel hanging under the spout, swinging.
      const sw = [0, 0.45, 0.75, 0.3][ph];
      const Hg = hangAt(L, 10.4, -1.2);
      fillAll(r, [Hg.cap(0, 0, 1.6, sw * 0.3, 0.22)], m('gold'), o, 0.5);
      fillAll(r, [Hg.cap(1.9, sw * 0.4, 4.4, sw * 1.2, 0.5, 0.85)], m('tassel'), o, 0.8);
      fillAll(r, [Hg.circ(1.8, sw * 0.35, 0.5)], m('gold'), o, 0.5);
      // Foot, belly and spout.
      fillAll(r, [L.poly([5, -2.1, 8.6, -2.1, 9.4, -3.6, 4.2, -3.6])], m('gold'), o, 0.9, -1);
      const body = union(L.ell(6.8, 0, 4.4, 2.5), L.poly([9.4, 1.1, 12.4, 1.8, 13.8, 3.2, 13.6, 1.6, 10.6, -1.2]));
      fillAll(r, [body], m('gold'), o, 1.8);
      r.fill(intersect(body, L.rect(6.6, -0.1, 5, 0.55)), m('band'), { group: g, flat: 2, noLine: true, local: U });
      r.fill(L.circ(6.4, -0.6, 0.95), m('turq'), { group: g, bevel: 0.6 });
      // Lid and finial gem.
      fillAll(r, [L.ell(6.2, 2.4, 2.3, 1.5), L.cap(6.2, 3.6, 6.2, 4.4, 0.45, 0.3)], m('gold'), o, 1);
      r.fill(L.poly([6.2, 4.4, 7, 5.3, 6.2, 6.6, 5.4, 5.3]), m('gem'), { group: g });
      // A glint wandering over the belly.
      const ga = ph * Q + 2.2;
      r.dot(L.x(6.8 + Math.cos(ga) * 2.6, Math.sin(ga) * 1.4 + 0.6), L.y(6.8 + Math.cos(ga) * 2.6, Math.sin(ga) * 1.4 + 0.6), m('gold'), 4, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Sands of the Djinn (hourglass): icon and battle sprite share one drawing
// -----------------------------------------------------------------------------

const HG_SPECS = {
  'k.gold': gold(), 'k.band': gold(filigree), 'k.turq': turq(), 'k.gem': gem(),
  'k.glass': ramp([0x0e3a48, 0x1e7080, 0x3aa8b0, 0x8ae0e0, 0xe8ffff], { shiny: true }),
  'k.sand': sand((x, y, ph) => (hash(Math.floor(x * 1.3) + ph * 7, Math.floor(y * 1.3)) < 0.08 ? 2 : 0)),
  'k.stream': { base: SAND[3], ramp: SAND, glow: true },
  'k.smoke': smoke(), 'k.fire': fire(), 'k.hot': { base: 0xe8faff, glow: true },
} satisfies Record<string, MaterialSpec>;
type HK = keyof typeof HG_SPECS;
const HG = mats(HG_SPECS);

/**
 * An hourglass of turquoise glass between two gold plates, an onion dome on top crowned with a sapphire,
 * twisted gold posts, golden sand trickling through, and the bound djinn slipping out of the finial as a
 * hook of blue smoke. Origin at its centre; `f` steps an 8-frame loop.
 */
function sandsGlass(r: Raster, t: Xf, f: number, m: (k: HK) => number): void {
  const ph = f % 8;
  // Glass bulbs with the sand: a heap below, what's left above, a stream between.
  const top = union(t.ell(0, 3.3, 3.5, 2.9), t.rect(0, 0.9, 0.7, 0.9));
  const bot = union(t.ell(0, -3.3, 3.5, 2.9), t.rect(0, -0.9, 0.7, 0.9));
  r.fill(union(top, bot), m('k.glass'), { group: 3, bevel: 1.6 });
  r.fill(intersect(top, t.poly([-3.6, 3.4, 3.6, 3.4, 0.6, 0.4, -0.6, 0.4])), m('k.sand'), { group: 3, bevel: 0.8, noLine: true });
  r.fill(intersect(bot, t.poly([-3.6, -6.4, 3.6, -6.4, 3.6, -5, 1.4, -3.6, 0, -3, -1.4, -3.6, -3.6, -5])), m('k.sand'), { group: 3, bevel: 1, noLine: true });
  r.line(t.x(0, 0.6), t.y(0, 0.6), t.x(0, -3.2), t.y(0, -3.2), m('k.stream'), 2, 3);
  r.dot(t.x(0, -0.4 - (ph % 3) * 1.1), t.y(0, -0.4 - (ph % 3) * 1.1), m('k.stream'), 4, 3);
  // A glint on each bulb.
  r.dot(t.x(-2.2, 4.6), t.y(-2.2, 4.6), m('k.glass'), 4, 3);
  r.dot(t.x(-2.4, -1.8), t.y(-2.4, -1.8), m('k.glass'), 4, 3);
  // Twisted gold posts with a turquoise bead at the waist.
  for (const sx of [-4.6, 4.6]) {
    r.fill(t.cap(sx, -6.4, sx, 6.4, 0.55), m('k.band'), { group: 5, bevel: 0.6 });
    r.fill(t.circ(sx, 0, 0.85), m('k.turq'), { group: 5, bevel: 0.6 });
  }
  // Plates, the bowl foot and the onion dome with its finial gem.
  r.fill(union(t.rect(0, 6.6, 5.6, 0.8, 0.3), t.rect(0, -6.6, 5.6, 0.8, 0.3)), m('k.gold'), { group: 6, bevel: 1 });
  r.fill(union(t.ell(0, -8, 3.2, 1.3), t.rect(0, -9, 3.6, 0.45)), m('k.gold'), { group: 6, bevel: 0.9 });
  const dome = union(t.ell(0, 9, 3.3, 2.5), t.poly([-1.6, 10.6, 0, 13.2, 1.6, 10.6]));
  r.fill(dome, m('k.gold'), { group: 7, bevel: 1.4 });
  r.fill(intersect(dome, t.rect(0, 8.4, 4, 0.5)), m('k.turq'), { group: 7, flat: 2, noLine: true });
  r.fill(t.poly([0, 12.8, 0.9, 13.9, 0, 15.2, -0.9, 13.9]), m('k.gem'), { group: 8 });
  // The djinn bound inside slips out as a hook of blue smoke curling up off the finial.
  const w = (i: number) => Math.sin((ph / 8) * Math.PI * 2 + i * 1.2);
  const HOOK = [[0.5, 16, 0.6], [1.6, 17.6, 0.85], [1.4, 19.5, 1.05], [-0.4, 20.6, 1.2], [-2, 19.6, 0.95], [-1.5, 18.2, 0.6]];
  HOOK.forEach(([x, y, rr], i) => r.fill(t.circ(x + w(i) * 0.35, y + w(i + 2) * 0.25, rr * (1 + (((ph >> 1) + i) % 4 === 0 ? 0.15 : 0))), m('k.smoke'), { group: 20 + (i % 2), bevel: 1, softLight: true }));
  const k = ph % HOOK.length;
  r.dot(t.x(HOOK[k][0], HOOK[k][1]), t.y(HOOK[k][0], HOOK[k][1]), m('k.fire'), 3, 20 + (k % 2));
}

const hourglassProj: ProjArt = {
  frames: 8,
  outline: true,
  draw(r, t0, f, h) {
    sandsGlass(r, new Xf(t0.ox, t0.oy, 0, 0.72, 0.72), f, (k) => h(HG[k]));
  },
};

const sandsOfTheDjinn: SkinArt = {
  mats: HG_SPECS,
  glow: [0xffe8a8, 0x3a6ae0],
  icon(r, t, m) {
    sandsGlass(r, new Xf(t.ox, t.oy + 5.4, 0, 0.82, 0.82), 1, m);
  },
  proj: { hourglass: hourglassProj },
};

// -----------------------------------------------------------------------------
// Armour
// -----------------------------------------------------------------------------

function sultansTurban(): SkinArt {
  // A great turban of turquoise silk wound round and round, a saffron sash wrapped across it, a gold
  // filigree band at the brow, and at the front a gold rosette holding a sapphire of djinn fire with a
  // pearl drop, an egret plume rising from it and swaying; a silk tail flutters at the back.
  return {
    head: () => ({
      mats: {
        'h.dj.silk': material(cloth(TURQ, wound)), 'h.dj.saff': material(cloth(SAFF, wound)), 'h.dj.gold': material(gold()),
        'h.dj.band': material(gold(filigree)), 'h.dj.gem': material(gem()), 'h.dj.pearl': material(pearl()),
        'h.dj.plume': material(pearl((x, y) => (wrap(x * 0.9 + y * 0.5, 2.6) < 0.5 ? -1 : 0))),
        'h.dj.tail': material(cloth(TURQ, silk(3, false))),
      },
      face: true,
      draw(r, H, m, g, sway) {
        const ph = r.phase % 4, s = sway * 2.2, fl = [0, 0.5, 0.8, 0.4][ph];
        // The silk tail behind the head, rippling.
        r.fill(chain(H, [[-5.8, 1.4, 1.4], [-8.8 - s * 0.6, -0.6 + fl * 0.6, 1.3], [-10.6 - s, -4.2 + fl, 1.15], [-11.4 - s * 1.3, -8 + fl * 0.5, 0.9]]), m('h.dj.tail'), { group: 50, bevel: 1.2, toneBias: -1 });
        r.fill(H.poly([-10.6 - s * 1.3, -8 + fl * 0.5, -12.2 - s * 1.3, -8.2 + fl * 0.5, -11.4 - s * 1.4, -9.8 + fl * 0.4]), m('h.dj.saff'), { group: 50, bevel: 0.6 });
        // The turban: a full wound mass over the crown, its lower edge level over the brow and dipping at the nape.
        const cut = H.poly([9.5, 2.4, 1, 1.9, -4, 0.4, -9.4, -2.6, -9.4, 15, 9.5, 15]);
        const mass = union(intersect(H.ell(-0.2, 3.2, 7.6, 6.4), cut), H.ell(-0.6, 6.4, 7, 4.5));
        r.fill(mass, m('h.dj.silk'), { group: g, bevel: 3, softLight: true, local: H });
        // The saffron sash wound across it, front-low to back-high, and a second turn of it.
        r.fill(intersect(mass, H.poly([10, 5.2, 10, 3.4, -10, 8.2, -10, 10.4])), m('h.dj.saff'), { group: 53, bevel: 1.4, softLight: true, local: H });
        r.fill(intersect(mass, H.poly([10, 9.6, 10, 8.6, -2, 11.2, -2, 12.2])), m('h.dj.saff'), { group: 53, bevel: 1, softLight: true, local: H });
        // Gold filigree band along the brow.
        r.fill(intersect(mass, H.poly([9.5, 2.4, 1, 1.9, -4, 0.4, -4, 1.6, 1, 3.1, 9.5, 3.6])), m('h.dj.band'), { group: 54, bevel: 0.6, local: H });
        // The egret plume pinned at the front, rising from the brooch over the turban and swaying.
        const pa = 1.72 + sway * 0.06 + [0, 0.05, 0.08, 0.03][ph];
        r.fill(plumeShape(H, 4.8, 6.2, pa + 0.45, 7.4, 1.1, 0.15), m('h.dj.saff'), { group: 51, bevel: 0.8, toneBias: -1, local: H });
        const pl = plumeShape(H, 5.4, 6.4, pa + 0.1, 11, 1.55, 0.22);
        r.fill(pl, m('h.dj.plume'), { group: 52, bevel: 1, local: H });
        const tx = 5.4 + Math.cos(pa + 0.1) * 9 - Math.sin(pa + 0.1) * 0.22 * 0.66 * 11, ty = 6.4 + Math.sin(pa + 0.1) * 9 + Math.cos(pa + 0.1) * 0.22 * 0.66 * 11;
        r.fill(intersect(pl, H.circ(tx, ty, 2.2)), m('h.dj.saff'), { group: 52, bevel: 0.8, noLine: true, local: H });
        // The brooch: a gold rosette, the sapphire at its heart, a pearl drop under it.
        r.fill(rosette(H, 5.6, 5.2, 1.9), m('h.dj.gold'), { group: 55, bevel: 0.9 });
        r.fill(H.poly([5.6, 6.5, 6.5, 5.2, 5.6, 3.9, 4.7, 5.2]), m('h.dj.gem'), { group: 55 });
        r.fill(H.circ(5.8, 2.9, 0.6), m('h.dj.pearl'), { group: 55, bevel: 0.6 });
        // Gold studs along the brow band, one catching the light each frame.
        for (const [i, x] of [-2.2, 0.4, 3].entries()) r.dot(H.x(x, 2.3 + x * 0.06), H.y(x, 2.3 + x * 0.06), m('h.dj.gold'), i === ph % 3 ? 4 : 3, 54);
      },
    }),
    ...FX,
  };
}

function djinnSilks(): SkinArt {
  // A turquoise silk vest edged in gold filigree over a saffron shirt with full sleeves, wide gold djinn
  // cuffs on the forearms, a night-blue sash striped in gold, a gold collar with a sapphire pendant,
  // and filigree epaulets fringed in gold.
  return {
    mats: {
      cloak: cloth(TURQ), cloakTrim: gold(filigree),
      'dj.shirt': cloth(SAFF), 'dj.sleeve': cloth(TURQ, silk(2.6)), 'dj.cuff': gold(filigree), 'dj.sash': cloth(INDIGO, sashStripe),
      'dj.gold': gold(), 'dj.gem': gem(),     },
    chest: {
      torso: 'cloak', sleeve: 'dj.sleeve', sleeveLen: 1, forearm: 'dj.cuff', cape: null, hood: null, belt: 'dj.sash',
      trim: 'cloakTrim', pauldron: null, noScarf: true,
      shoulder(r, S, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        // A crescent of gold filigree over the shoulder, a turquoise bead at its centre and a fringe of gold.
        r.fill(subtract(S.ell(0.1, 1.2, 2.6, 1.7), S.ell(0.1, 0.1, 2, 1.2)), m('cloakTrim'), { ...o, bevel: 0.9 });
        if (c.far) return;
        for (const x of [-1.8, -0.6, 0.6, 1.8]) r.line(S.x(x, 0.1 + Math.abs(x) * 0.1), S.y(x, 0.1 + Math.abs(x) * 0.1), S.x(x * 1.05, -1.2), S.y(x * 1.05, -1.2), m('dj.gold'), x === -0.6 ? 3 : 2, c.g);
        r.dot(S.x(0.1, 2.2), S.y(0.1, 2.2), m('dj.gem'), 3, c.g);
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, ph = r.phase % 4;
        const torso = torsoBody(T, b, top);
        const fx = b.chestPush * 0.7 + 1.2;
        // The vest stands open over the saffron shirt: a V from the collar to the sash.
        const vee = T.poly([fx - 1, top + 1, fx + 4.6, top + 1, fx + 2.6, 3.2, fx + 1.2, 3.2]);
        r.fill(intersect(torso, vee), m('dj.shirt'), { group: c.g, bevel: 1.6, softLight: true, local: T });
        // Gold filigree edging both sides of the opening.
        r.line(T.x(fx - 1.4, top + 0.6), T.y(fx - 1.4, top + 0.6), T.x(fx + 1.5, 3.4), T.y(fx + 1.5, 3.4), m('cloakTrim'), 3, c.g);
        r.line(T.x(fx - 0.8, top + 0.6), T.y(fx - 0.8, top + 0.6), T.x(fx + 2.1, 3.6), T.y(fx + 2.1, 3.6), m('cloakTrim'), 1, c.g);
        // The gold collar: beads swagged under the neck, the sapphire pendant hanging from it.
        const ax = -1.6, ay = top - 0.2, bx = fx + 3, by = top - 0.6;
        for (let i = 0; i <= 7; i++) {
          const u = i / 7, x = ax + (bx - ax) * u, y = ay + (by - ay) * u - Math.sin(u * Math.PI) * 1.6;
          r.dot(T.x(x, y), T.y(x, y), m('dj.gold'), i === (ph * 2) % 8 ? 4 : i % 2 ? 2 : 3, c.g + 1);
        }
        const px = (ax + bx) / 2 + 0.6, py = (ay + by) / 2 - 2.4;
        r.fill(T.poly([px - 1.2, py + 0.7, px + 1.2, py + 0.7, px, py - 1.8]), m('dj.gold'), { group: c.g + 1, bevel: 0.7 });
        r.dot(T.x(px, py + 0.1), T.y(px, py + 0.1), m('dj.gem'), 3, c.g + 1);
        // The sash knotted at the hip, its gold-fringed ends swinging.
        const kx = b.waistW + 0.1, ky = 2.6, sw = [0, 0.4, 0.7, 0.3][ph];
        r.fill(T.ell(kx, ky, 1.3, 1.1), m('dj.sash'), { group: c.g + 2, bevel: 1 });
        r.fill(T.poly([kx - 0.6, ky - 0.4, kx + 0.8, ky - 0.6, kx + 1.2 + sw, ky - 4.6, kx - 0.4 + sw, ky - 4.4]), m('dj.sash'), { group: c.g + 2, bevel: 0.9 });
        r.line(T.x(kx - 0.4 + sw, ky - 4.8), T.y(kx - 0.4 + sw, ky - 4.8), T.x(kx + 1.2 + sw, ky - 5), T.y(kx + 1.2 + sw, ky - 5), m('dj.gold'), 3, c.g + 2);
      },
    },
    ...FX,
  };
}

function silkenSirwal(): SkinArt {
  // Billowing saffron silk trousers with a sheen sliding over them, a turquoise hip band hung with a fringe
  // of little gold coins that catch the light, gathered at the calf into turquoise cuffs banded in gold.
  return {
    mats: {
      'l.dj.silk': cloth(SAFF, drape), 'l.dj.band': cloth(TURQ, silk(3, false)), 'l.dj.gold': gold(),
      'l.dj.gem': gem(),
    },
    legs: {
      mat: 'l.dj.silk', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 1,
      over(r, t, m, c) {
        const w = c.w, L = c.len, ph = r.phase % 4;
        const o = { group: c.g, toneBias: c.bias };
        // The hip band and its coin fringe.
        r.fill(t.cap(L * 0.93, -w - 0.4, L * 0.95, w + 0.6, 1.05), m('l.dj.band'), { ...o, bevel: 0.9 });
        r.line(t.x(L * 0.93 + 0.9, -w), t.y(L * 0.93 + 0.9, -w), t.x(L * 0.95 + 0.9, w + 0.4), t.y(L * 0.95 + 0.9, w + 0.4), m('l.dj.gold'), 3, c.g);
        if (c.far) return;
        const sw = [0, 0.25, 0.4, 0.15][ph];
        let k = 0;
        for (let y = -w + 0.3; y <= w + 0.8; y += 1.25, k++) {
          const x = L * 0.93 - 1.5 - (k % 2) * 0.7, yy = y + sw * (k % 2 ? 1 : 0.6);
          r.dot(t.x(x, yy), t.y(x, yy), m('l.dj.gold'), (k + ph) % 4 === 0 ? 4 : 3, c.g);
        }
        // A sapphire on the band at the front.
        r.dot(t.x(L * 0.94, w + 0.1), t.y(L * 0.94, w + 0.1), m('l.dj.gem'), 3, c.g);
      },
      shin(r, shin, _foot, m, c) {
        const w = c.body.shinR + 0.4, top = Math.max(c.top, 1.6);
        // Billowing over the calf, gathered into a turquoise cuff with a gold edge.
        r.fill(shin.ell(top + 3.6, -0.1, 4, w + 1.9), m('l.dj.silk'), { group: c.g, bevel: 2.2, toneBias: c.bias, local: shin });
        r.fill(shin.cap(top + 0.7, -w - 0.6, top + 0.7, w + 0.6, 0.85), m('l.dj.band'), { group: c.g, bevel: 0.8, toneBias: c.bias });
        r.line(shin.x(top + 1.5, -w - 0.4), shin.y(top + 1.5, -w - 0.4), shin.x(top + 1.5, w + 0.4), shin.y(top + 1.5, w + 0.4), m('l.dj.gold'), 3, c.g);
      },
    },
    ...FX,
  };
}

function curledSlippers(): SkinArt {
  // Turquoise silk slippers embroidered in gold lozenges, their toes curling up and back to a gold bead,
  // saffron soles, a gold anklet set with a sapphire, and grains of sand swirling round the ankle.
  return {
    mats: {
      'wb.boot': cloth(TURQ, lozenge), 'wb.trim': gold(filigree),
      'dj.b.gold': gold(), 'dj.b.gem': gem(), 'dj.b.sole': saff(), 'dj.b.sand': sand(),
    },
    boots: {
      mat: 'wb.boot', height: 0.32, bulk: 0.15, trim: 'wb.trim', wing: null, knee: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w, T = c.toe;
        // Saffron sole.
        r.fill(foot.cap(-1.3, -1.5, T + 0.4, -1.3, 0.5), m('dj.b.sole'), { ...o, bevel: 0.5 });
        // The toe running out to a point and curling up and back.
        r.fill(chain(foot, [[T - 1.8, 0.1, 1.15], [T + 0.6, 0, 0.85], [T + 2, 0.6, 0.62], [T + 2.7, 1.8, 0.5], [T + 2.3, 2.9, 0.42]]), m('wb.boot'), { ...o, bevel: 0.8, local: foot });
        r.fill(foot.circ(T + 1.5, 3.1, 0.6), m('dj.b.gold'), { ...o, bevel: 0.5 });
        // Gold edge over the instep.
        r.line(foot.x(0.4, 1.3), foot.y(0.4, 1.3), foot.x(T - 0.6, 0.9), foot.y(T - 0.6, 0.9), m('dj.b.gold'), 3, c.g);
        // Anklet with its gem.
        r.fill(shin.cap(c.top + 0.9, -w - 0.4, c.top + 0.9, w + 0.4, 0.5), m('dj.b.gold'), { ...o, bevel: 0.5 });
        if (c.far) return;
        r.dot(shin.x(c.top + 0.9, w * 0.5), shin.y(c.top + 0.9, w * 0.5), m('dj.b.gem'), 3, c.g);
        // Sand on the wind, swirling round the ankle.
        for (let k = 0; k < 3; k++) {
          const a = ph * Q + k * 2.1;
          const x = 1.2 + k * 1.4 + Math.sin(a) * 0.6, y = Math.cos(a) * (w + 2.2);
          r.dot(shin.x(x, y), shin.y(x, y), m('dj.b.sand'), Math.sin(a) > 0 ? 3 : 2, c.g);
        }
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const C = {
  sand: css(SAND[2]), sandHi: css(SAND[3]), sandLt: css(SAND[4]), sandDk: css(SAND[1]),
  gold: css(GOLD[3]), turq: css(TURQ[3]), smoke: css(SMOKE[2]), smokeHi: css(SMOKE[3]), fire: css(DFIRE[3]), hot: css(DFIRE[4]),
};

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function djinnAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  // Drifted sand ringing the feet, its dashes sliding round with the wind, a gold glint and a turquoise one.
  const RX = 16, RY = 3.8, N = 38;
  const step = Math.floor(t * 6);
  ring(g, x, y, RX, RY, N, layer, (g, px, py, i) => {
    const k = (i + step) % 6;
    if (k === 5) return;
    g.fillStyle = k === 0 ? C.sandHi : k === 3 ? C.sandDk : C.sand;
    g.fillRect(px, py, 1, 1);
    if (i % 19 === step % 19) { g.fillStyle = i % 2 ? C.gold : C.turq; g.fillRect(px, py, 1, 1); }
  });
  // A dust devil: grains of sand whirling up round the fighter, the funnel widening as it climbs.
  // Each grain leaves a short streak behind it along its path.
  for (let k = 0; k < 10; k++) {
    const u = (t * 0.38 + k / 10) % 1;
    const a = t * 2.6 + k * 2.4 + u * 6;
    const s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const rad = 10 + u * 7;
    const px = Math.round(x + Math.cos(a) * rad), py = Math.round(y + s * (2.6 + u * 2) - 2 - u * 26);
    const dir = s < 0 ? 1 : -1;
    g.globalAlpha = u > 0.65 ? (1 - u) / 0.35 : u < 0.08 ? u / 0.08 : 1;
    g.fillStyle = C.sand; g.fillRect(dir > 0 ? px + 1 : px - 2, py, 2, 1);
    g.fillStyle = k % 4 === 0 ? C.sandLt : C.sandHi; g.fillRect(px, py, 1, 1);
  }
  // Two wisps of djinn smoke rising off the ring on either side, a blue flame in each.
  for (let k = 0; k < 2; k++) {
    const a = t * 0.7 + k * Math.PI + 0.6;
    const s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const bx = x + Math.cos(a) * RX, by = y + s * RY;
    // A thread of smoke wavering up off it, thinning out as it climbs.
    for (let j = 0; j < 7; j++) {
      const v = j / 7;
      const px = Math.round(bx + Math.sin(t * 3 - j * 0.9 + k * 2) * 1.6 * v + v * 2), py = Math.round(by - 2 - j * 2);
      g.globalAlpha = 0.95 * (1 - v);
      g.fillStyle = j < 2 ? C.fire : j < 5 ? C.smokeHi : C.smoke;
      g.fillRect(px, py, 1, 2);
    }
    g.globalAlpha = 1;
    // The flame at the wisp's root.
    const fl = Math.floor(t * 8 + k * 3) % 3;
    g.fillStyle = C.fire; g.fillRect(Math.round(bx), Math.round(by) - 1 - fl, 1, 1 + fl);
    g.fillStyle = C.hot; g.fillRect(Math.round(bx), Math.round(by) - 1, 1, 1);
  }
  g.globalAlpha = 1;
}

export const DJINN: Record<string, SkinArt> = {
  'katana.djinn': { weapon: scimitar, ...FX },
  'trickster_talisman.djinn': { weapon: wishingLamp, ...FX },
  'hourglass.djinn': sandsOfTheDjinn,
  'seer_blindfold.djinn': sultansTurban(),
  'phase_cloak.djinn': djinnSilks(),
  'acrobat_trousers.djinn': silkenSirwal(),
  'warp_boots.djinn': curledSlippers(),
};
