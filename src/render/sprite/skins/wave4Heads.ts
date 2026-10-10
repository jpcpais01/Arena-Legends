import { mix } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import type { BodySpec } from '../body';
import { hairCap } from '../draw';
import type { Xf } from '../xform';
import type { HeadSkin } from './heads';
import type { SkinArt } from './index';
import { glow, plain, shiny, wrap } from './kit';

/**
 * Fourth-wave skins (v0.40.0) for the v0.39 head and chest pieces. Rare
 * skins recolour the stock piece by its own material names; the mythic and
 * legendary ones reshape it (headgear drawn in head space, chest pieces
 * through the back/over/shoulder hooks) and bring their own materials:
 * `h.*` for headgear, and a short prefix per chest skin.
 */

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** A material from a full five-tone ramp. */
const rp = (r: number[], o: Partial<MaterialSpec> = {}): MaterialSpec => ({ base: r[2], ramp: r, ...o });
const mat = (r: number[], o: Partial<MaterialSpec> = {}) => material(rp(r, o));

/** Legendary effects in one colour family: sparkles and impact colours, and the swing trail. */
const legend = (spark: number, spark2: number, trail = spark): Pick<SkinArt, 'fx' | 'trail'> => ({
  fx: { spark, spark2 },
  trail: [trail, mix(trail, spark2, 0.55)],
});

/** A tapering chain of capsules through [x, y, radius] points. */
function chain(F: Xf, pts: number[][]): Shape {
  const s: Shape[] = [];
  for (let i = 1; i < pts.length; i++) s.push(F.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i - 1][2], pts[i][2]));
  return union(...s);
}

const ln = (r: Raster, F: Xf, ax: number, ay: number, bx: number, by: number, m: number, tone: number, g: number) =>
  r.line(F.x(ax, ay), F.y(ax, ay), F.x(bx, by), F.y(bx, by), m, tone, g);
const dt = (r: Raster, F: Xf, x: number, y: number, m: number, tone: number, g: number) => r.dot(F.x(x, y), F.y(x, y), m, tone, g);

/** The torso's main volumes (as the figure draws them), for clipping plates and bands to it. */
function torsoBody(T: Xf, b: BodySpec, top: number): Shape {
  return union(
    T.ell(0.3, 0.6, b.hipW, 3.6),
    T.ell(0.5, top * 0.46, b.waistW, top * 0.28),
    T.ell(b.chestPush * 0.7, top - 3.4, b.chestW, 5.4),
  );
}

/** A lumpy roll (fur, moss) from (ax, ay) to (bx, by). */
function roll(F: Xf, ax: number, ay: number, bx: number, by: number, rad: number, n: number): Shape {
  const parts: Shape[] = [F.cap(ax, ay, bx, by, rad * 0.85)];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    parts.push(F.circ(ax + (bx - ax) * u, ay + (by - ay) * u, rad * (i % 2 ? 1.08 : 0.9)));
  }
  return union(...parts);
}

/** A leaf (or feather) at (x, y) pointing along angle `a`. */
function leaf(F: Xf, x: number, y: number, a: number, len: number, w: number): Shape {
  const c = Math.cos(a), s = Math.sin(a);
  const p = (u: number, v: number) => [x + c * u - s * v, y + s * u + c * v];
  return F.poly([...p(0, 0), ...p(len * 0.4, w), ...p(len, 0), ...p(len * 0.4, -w)]);
}

/** A five-petal blossom at (x, y), with a glowing heart. */
function blossom(r: Raster, F: Xf, x: number, y: number, size: number, petal: number, heart: number, g: number, bias = 0): void {
  const petals: Shape[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    petals.push(F.circ(x + Math.cos(a) * size * 0.8, y + Math.sin(a) * size * 0.8, size * 0.62));
  }
  r.fill(union(...petals), petal, { group: g, bevel: 0.8, toneBias: bias });
  dt(r, F, x, y, heart, 3, g);
}

/** A four-pointed throwing star centred at (x, y), turned by `a`. */
function shuriken(F: Xf, x: number, y: number, s: number, a: number): Shape {
  const pts: number[] = [];
  for (let k = 0; k < 4; k++) {
    const t = a + (k / 4) * Math.PI * 2;
    pts.push(x + Math.cos(t) * s, y + Math.sin(t) * s);
    const u = t + Math.PI / 4;
    pts.push(x + Math.cos(u) * s * 0.32, y + Math.sin(u) * s * 0.32);
  }
  return F.poly(pts);
}

// Overlay groups (contours between overlapping parts).
const GA = 50;

// -----------------------------------------------------------------------------
// Head: legendary and mythic
// -----------------------------------------------------------------------------

/**
 * Oracle's Gaze: an ivory silk blindfold banded in gold, a jewelled third eye
 * that glances about, a gold tiara spike on the brow, long gold-tipped ribbons
 * and a thin gold halo above the head with glyphs of light circling it.
 */
function oracleGaze(): HeadSkin {
  const weave: Tex = (x, y) => (wrap(y * 1.4 - x * 0.15, 2.2) < 0.45 ? -1 : 0);
  return {
    mats: {
      'h.silk': mat([0x8a7458, 0xc4ae86, 0xe8dcc0, 0xf8f2e2, 0xffffff], { tex: weave }),
      'h.tail': mat([0x8a7a62, 0xb8a888, 0xe0d4b8, 0xf4ecd8, 0xfffaf0]),
      'h.gold': mat([0x6a3e10, 0xa8701e, 0xe0aa38, 0xf8d878, 0xfff6c8], { shiny: true }),
      'h.white': mat([0x8a8aa0, 0xc0c4d4, 0xe8ecf6, 0xf8faff, 0xffffff]),
      'h.iris': material({ base: 0x4ac8f8, ramp: [0x0a3a6a, 0x1a6aa8, 0x3aa8e8, 0x7ae0ff, 0xe8ffff], glow: true }),
      'h.pupil': mat([0x08081a, 0x101030, 0x1c1c48, 0x2c2c66, 0x44448a]),
      'h.glyph': material({ base: 0xffe48a, ramp: [0x8a5a1a, 0xc8902a, 0xf0c050, 0xffe89a, 0xfffbe8], glow: true }),
      'h.gem': material({ base: 0x8ae8ff, ramp: [0x1a4a7a, 0x2a7ab8, 0x5ac0f0, 0xa8f0ff, 0xf0ffff], glow: true }),
    },
    draw(r, H, m, g, sway) {
      const s = sway * 2.4, ph = r.phase % 4, fl = [0, 0.5, 0.8, 0.4][ph];
      const gold = m('h.gold');
      // The halo, floating above and a little behind the head, tilted toward the viewer.
      const cx = -1.4, cy = 11.4;
      r.fill(subtract(H.ell(cx, cy, 5.8, 1.6, 0.08), H.ell(cx, cy, 4.7, 0.75, 0.08)), gold, { group: GA + 6, flat: 3 });
      r.fill(intersect(subtract(H.ell(cx, cy, 5.8, 1.6, 0.08), H.ell(cx, cy, 4.7, 0.75, 0.08)), H.rect(cx + 1.6, cy - 1.4, 2.4, 0.9)), gold, { group: GA + 6, flat: 4, noLine: true });
      // Three glyphs of light riding the halo, a third of a turn apart: the loop closes in four frames.
      const gl = m('h.glyph');
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + ph * (Math.PI / 6) + 0.5;
        const x = H.x(cx + Math.cos(a) * 5.15, cy + Math.sin(a) * 1.1), y = H.y(cx + Math.cos(a) * 5.15, cy + Math.sin(a) * 1.1);
        const t = Math.sin(a) < 0 ? 4 : 3;
        r.dot(x, y - 1, gl, t, GA + 7); r.dot(x, y, gl, t, GA + 7);
        if (k === 0) r.dot(x + 1, y - 1, gl, t - 1, GA + 7);
        else if (k === 1) r.dot(x - 1, y, gl, t - 1, GA + 7);
      }
      // Two ribbons streaming back, the far one higher, each ending in a gold bead.
      r.fill(chain(H, [[-5.8, 1.4, 0.95], [-9.4 - s * 0.6, 2.4 - fl * 0.5, 0.9], [-13 - s, 1.4, 0.85], [-15.6 - s * 1.3, -0.4 + fl, 0.7]]), m('h.tail'), { group: GA, bevel: 1, toneBias: -1, local: H });
      r.fill(H.circ(-16.2 - s * 1.3, -0.8 + fl, 0.85), gold, { group: GA, bevel: 0.7, toneBias: -1 });
      r.fill(chain(H, [[-5.8, -0.4, 1.05], [-8.8 - s * 0.6, -2.8, 1], [-10.8 - s, -6.2 + fl * 0.6, 0.95], [-11.6 - s * 1.3, -9.8, 0.8]]), m('h.tail'), { group: GA + 1, bevel: 1.2, local: H });
      r.fill(H.poly([-10.8 - s * 1.3, -9.6, -11.6 - s * 1.3, -11.8, -12.4 - s * 1.3, -9.6]), gold, { group: GA + 1, bevel: 0.6 });
      // The silk band over the eyes, a fine gold thread along its edges.
      const band = intersect(H.ell(0.1, 0.5, 6.9, 6.8), H.poly([-9, 2.4, 9, 1.9, 9, -2.2, -9, -1.5]));
      r.fill(band, m('h.silk'), { group: g, bevel: 1.6, softLight: true, local: H });
      r.fill(intersect(band, H.poly([-9, 2.4, 9, 1.9, 9, 1.4, -9, 1.9])), gold, { group: g, flat: 3, noLine: true });
      r.fill(intersect(band, H.poly([-9, -1.0, 9, -1.7, 9, -2.2, -9, -1.5])), gold, { group: g, flat: 2, noLine: true });
      // The knot at the back, held by a gold clasp with a blue stone.
      r.fill(union(H.ell(-6.1, 0.4, 1.5, 1.8), H.ell(-6.6, -0.6, 1.1, 1.2, 0.5)), m('h.silk'), { group: GA + 2, bevel: 1.1, local: H });
      r.fill(H.circ(-6.1, 0.5, 1), gold, { group: GA + 2, bevel: 0.7 });
      dt(r, H, -6.1, 0.5, m('h.gem'), 3, GA + 2);
      // A fine gold circlet above the band, rising to a setting on the brow with three rays.
      const ex = 3.5, ey = 4.6;
      r.fill(union(H.cap(-6, 2.8, ex, ey - 0.6, 0.45), H.poly([ex - 0.5, ey + 1, ex - 1.4, ey + 3.4, ex + 0.1, ey + 1.6, ex + 0.4, ey + 4.2, ex + 0.9, ey + 1.6, ex + 2.2, ey + 3, ex + 1.3, ey + 0.8])), gold, { group: GA + 3, bevel: 0.7, local: H });
      // The third eye: upright in its gold almond, a blue iris that glances about.
      r.fill(H.poly([ex, ey + 1.9, ex + 1.3, ey, ex, ey - 1.9, ex - 1.3, ey]), gold, { group: GA + 4, bevel: 0.8 });
      r.fill(H.poly([ex, ey + 1.2, ex + 0.75, ey, ex, ey - 1.2, ex - 0.75, ey]), m('h.white'), { group: GA + 4, flat: 3, noLine: true });
      const look = [0, 0.35, 0, -0.35][ph];
      dt(r, H, ex + look, ey + 0.5, m('h.iris'), 4, GA + 4);
      dt(r, H, ex + look, ey - 0.5, m('h.iris'), 3, GA + 4);
      // The two blue stones in the band where the eyes would be.
      dt(r, H, 1.8, 0.4, m('h.gem'), 3, g);
      dt(r, H, 5.2, 0.3, m('h.gem'), 3, g);
    },
  };
}

/**
 * Nightmare Crown: a blackened great helm with a jagged iron crown fused to
 * its brow, great horns sweeping back and up with violet fire at their tips,
 * a burning violet visor and crown stones, and faint violet veins that pulse
 * through the iron.
 */
function nightmareCrown(): HeadSkin {
  const cracks: Tex = (x, y) => {
    const v = Math.sin(x * 1.1 + Math.sin(y * 1.3) * 2) + Math.sin(y * 0.9 - x * 0.35) * 0.6;
    return Math.abs(v) < 0.1 ? -1 : 0;
  };
  const ridges: Tex = (x, y) => (wrap(x * 0.9 + y * 0.8, 1.6) < 0.45 ? -1 : 0);
  return {
    mats: {
      'h.iron': material({ base: 0x342c42, ramp: [0x0e0b14, 0x1e1828, 0x342c42, 0x52486a, 0xc88aff], tex: cracks }),
      'h.dark': mat([0x060508, 0x0e0c14, 0x18141e, 0x26202e, 0x3a3246]),
      'h.crown': mat([0x2a2440, 0x575078, 0x8a82aa, 0xbcb4da, 0xf4f0ff], { shiny: true }),
      'h.horn': mat([0x0a080c, 0x1e1820, 0x342a36, 0x56485a, 0x9a8a9e], { shiny: true, tex: ridges }),
      'h.visor': material({ base: 0xb86aff, ramp: [0x3a0a6a, 0x6a1ab0, 0xa04ae8, 0xd08aff, 0xfff0ff], glow: true }),
      'h.gem': material({ base: 0xd060ff, ramp: [0x4a0a6a, 0x8a1ab0, 0xc040f0, 0xe890ff, 0xfff0ff], glow: true }),
      'h.flame': material({ base: 0x8a3aff, ramp: [0x2a0a5a, 0x4a1a9a, 0x7a3ae0, 0xa870ff, 0xf0d8ff], glow: true }),
    },
    draw(r, H, m, g) {
      const ph = r.phase % 4, lick = [0, 1, 0.4, 1.4][ph];
      const horn = m('h.horn'), crown = m('h.crown'), flame = m('h.flame');
      // The far horn, sweeping back from the far temple and curling up behind the head.
      r.fill(chain(H, [[0.4, 3.8, 1.4], [-3, 3.6, 1.2], [-6.6, 4.6, 0.95], [-8.4, 7, 0.7], [-8, 9, 0.3]]), horn, { group: GA, bevel: 1.2, toneBias: -1, local: H });
      // The helm: a tall dome and a faceplate jutting to a point at the chin.
      const helm = union(H.ell(-0.4, 1.2, 7.2, 7), H.poly([0.4, 6, 6.8, 4.4, 8.2, 1.2, 8, -3.4, 5.4, -6.6, 3.2, -8.4, 0.6, -7, -6.4, -5.6, -7.4, 0]));
      r.fill(helm, m('h.iron'), { group: g, bevel: 3, local: H });
      // A ridge down the cheek and a dark rim round the bottom.
      ln(r, H, 1.4, -1.8, 3.2, -7.6, m('h.dark'), 0, g);
      r.fill(intersect(helm, H.poly([-9, -5.4, 9, -3.6, 9, -4.6, -9, -6.4])), m('h.dark'), { group: g, flat: 1, noLine: true });
      for (const x of [4.8, 6.2]) ln(r, H, x, -2.8, x, -5, m('h.dark'), 0, g);
      // The visor: a dark slit with violet fire burning in it, streaming back along the helm.
      ln(r, H, 1.4, 0.6, 8.2, 0.4, m('h.dark'), 0, g);
      r.fill(H.poly([2.4, 1.4, -1.4 - lick * 0.5, 2.6 + lick * 0.3, -4.6 - lick, 3.6 + lick * 0.4, -2.8, 1.8, -0.6, 0.8, 2.4, 0]), flame, { group: g });
      ln(r, H, 2.4, 0.6, 7.6, 0.4, m('h.visor'), 3, g);
      dt(r, H, 6.4, 0.5, m('h.visor'), 4, g);
      dt(r, H, 3, 0.6, m('h.visor'), 4, g);
      // The crown: a broad band round the brow, three great jagged spikes standing up off the dome, stones at their feet.
      const domeY = (x: number) => 1.2 + 7 * Math.sqrt(Math.max(0, 1 - ((x + 0.4) / 7.2) ** 2));
      const parts: Shape[] = [intersect(helm, H.poly([-9, 6.4, 9, 5.4, 9, 3.4, -9, 4.4]))];
      for (const [x, h, w, lean] of [[-3.8, 4.2, 1.6, -0.8], [0.2, 5.8, 1.8, 0], [4, 4.4, 1.6, 0.9]] as const) {
        const y0 = domeY(x) - 1.6;
        parts.push(H.poly([x - w, y0, x - w * 0.35, y0 + h * 0.55, x + lean, y0 + h, x + w * 0.35, y0 + h * 0.55, x + w, y0]));
      }
      r.fill(union(...parts), crown, { group: GA + 1, bevel: 1.2, lightBias: 0.25, local: H });
      for (const x of [-3.8, 0.2, 4]) dt(r, H, x, 4.9 - (x + 9) * 0.055, m('h.gem'), x === 0.2 ? 4 : 3, GA + 1);
      // The near horn: out from the temple, back over the ear, curling up with violet fire at its tip.
      r.fill(chain(H, [[-1, 3, 1.9], [-4.6, 2.4, 1.7], [-8.4, 3, 1.4], [-11, 5.4, 1.05], [-11.6, 8.4, 0.7], [-10.4, 10.4, 0.25]]), horn, { group: GA + 2, bevel: 1.4, local: H });
      r.fill(H.poly([-11.6, 9.6, -12 - lick * 0.3, 12.2 + lick, -10.8, 11, -10 + lick * 0.2, 12.6 + lick * 0.6, -9.6, 10.2]), flame, { group: GA + 2 });
      r.fill(H.circ(-1, 3, 1.6), crown, { group: GA + 2, bevel: 1 });
      dt(r, H, -1, 3.1, m('h.gem'), 3, GA + 2);
    },
  };
}

/**
 * Eagle Mask: a hood made into a bald eagle's head, white crown feathers over
 * a brown feather mantle, the golden hooked beak jutting over the brow as a
 * visor, fierce amber eyes and a fan of barred crest feathers at the back.
 */
function eagleMask(): HeadSkin {
  const scallop: Tex = (x, y) => (wrap(y * 1.1 + Math.abs(wrap(x * 0.8, 2) - 1) * 0.9, 1.9) < 0.42 ? -1 : 0);
  const barred: Tex = (x, y) => (wrap(x * 0.9 - y * 0.7, 2.1) < 0.6 ? -1 : 0);
  return {
    mats: {
      'h.white': mat([0x6a6a74, 0xa8a8b4, 0xdcdce4, 0xf4f4f8, 0xffffff], { tex: scallop }),
      'h.brown': mat([0x1e120a, 0x3a2414, 0x5e3c20, 0x86582e, 0xb07c48], { tex: scallop }),
      'h.crest': mat([0x3a2412, 0x6a4422, 0x9a6a3a, 0xc8a070, 0xf0e0c0], { tex: barred }),
      'h.beak': mat([0x7a4a0a, 0xc0801a, 0xf0b830, 0xffe070, 0xfff8c8], { shiny: true }),
      'h.hook': mat([0x3a2a1a, 0x5a4428, 0x7a6038, 0xa08458, 0xd0b888], { shiny: true }),
      'h.eye': material({ base: 0xffb020, ramp: [0x7a3a00, 0xc06a0a, 0xf0a020, 0xffd060, 0xfff4c0], glow: true }),
      'h.gold': mat([0x6a3e10, 0xa8701e, 0xe0aa38, 0xf8d878, 0xfff6c8], { shiny: true }),
    },
    draw(r, H, m, g, sway) {
      const s = sway * 1.6, ph = r.phase % 4, rf = [0, 0.3, 0.5, 0.2][ph];
      // The crest: barred feathers fanning back from the crown, then the brown mantle feathers at the nape.
      const crest: Shape[] = [];
      for (const [x, y, a, len] of [[-2.6, 5.6, 2.25, 7.4], [-4.2, 4.4, 2.55, 7.8], [-5.2, 2.6, 2.85, 7]] as const) crest.push(leaf(H, x, y, a + s * 0.04 + rf * 0.03, len, 1.15));
      r.fill(union(...crest), m('h.crest'), { group: GA, bevel: 1, local: H });
      const mantle: Shape[] = [];
      for (const [x, y, a, len] of [[-5.4, 0.6, 3.5, 5.8], [-5, -2.4, 3.9, 5.4], [-3, -5, 4.3, 4.6]] as const) mantle.push(leaf(H, x, y, a + s * 0.03, len, 1.5));
      r.fill(union(...mantle), m('h.brown'), { group: GA + 1, bevel: 1.2, toneBias: -1, local: H });
      // The hood: white feathers over the head, brown below the jaw, open at the face.
      const outer = union(H.ell(-0.7, 1.5, 7.6, 7.4), H.poly([-7.4, 1.4, -7.2, -6.4, -1.2, -7.8, 2.4, -5.6]));
      const open = H.ell(4.9, -1.6, 4, 4.6);
      const hood = subtract(outer, open);
      r.fill(hood, m('h.white'), { group: g, bevel: 3, softLight: true, local: H });
      r.fill(intersect(hood, H.poly([-9, -1.6, 2, -3.2, 4, -9, -9, -9])), m('h.brown'), { group: g, bevel: 1.6, local: H });
      r.fill(intersect(open, H.ell(4.6, 3.2, 4.6, 1.4)), m('h.white'), { group: g, flat: 0, noLine: true });
      // A gold band where the white meets the brown.
      r.fill(intersect(hood, H.poly([-9, -0.4, 2.2, -2.2, 2.4, -3, -9, -1.3])), m('h.gold'), { group: g, flat: 3, noLine: true });
      // The beak: upper mandible jutting over the brow and hooking down, the dark tip curling under.
      const beak = H.poly([1.4, 6.2, 5.6, 5.8, 9.2, 4.4, 11.2, 2.2, 11, 0.2, 10, 0.8, 9.4, 2, 6, 2.6, 3, 3]);
      r.fill(beak, m('h.beak'), { group: GA + 2, bevel: 1.2, local: H });
      r.fill(intersect(beak, H.poly([9.6, 5, 12, 5, 12, -1, 9.4, 1.2])), m('h.hook'), { group: GA + 2, bevel: 0.8, local: H });
      ln(r, H, 4.4, 3.4, 9, 2.6, m('h.hook'), 1, GA + 2);
      dt(r, H, 7.6, 4.6, m('h.beak'), 4, GA + 2);
      // The eagle's eye on the side of the head, under a scowling brow.
      r.fill(H.poly([1, 5.6, 4.2, 5.4, 4.6, 4.8, 1.4, 4.6]), m('h.crest'), { group: GA + 3, flat: 0, noLine: true });
      dt(r, H, 2.6, 4, m('h.eye'), 4, GA + 3);
      dt(r, H, 3.4, 4, m('h.eye'), 3, GA + 3);
    },
  };
}

/**
 * Champion's Laurel: a polished steel murmillo helm with a broad brim and a
 * gold fin crest carrying a great crimson plume, a gold laurel wreath round
 * the dome tied with red ribbons, and a ruby at the brow.
 */
function championsLaurel(): HeadSkin {
  const strands: Tex = (x, y) => (wrap(x * 1.3 + y * 0.25, 1.5) < 0.5 ? -1 : 0);
  return {
    mats: {
      'h.steel': mat([0x3a4252, 0x6a7488, 0xa4aec0, 0xd8e0ec, 0xffffff], { shiny: true, step: 0.15 }),
      'h.dark': mat([0x1a1e28, 0x2e3442, 0x4a5264, 0x6a7488, 0x98a2b4], { shiny: true }),
      'h.gold': mat([0x6a3e10, 0xa8701e, 0xe0aa38, 0xf8d878, 0xfff6c8], { shiny: true }),
      'h.leaf': mat([0x3a4a0a, 0x6a7a14, 0xa8a828, 0xd8d060, 0xfff4b8], { shiny: true }),
      'h.plume': mat([0x4a0810, 0x7e1018, 0xb8202a, 0xe84a3e, 0xff8a6a], { tex: strands }),
      'h.ribbon': mat([0x3a0a10, 0x6a1420, 0xa02030, 0xd04050, 0xf07a80]),
      'h.mane': mat([0x8a6a3a, 0xc8a870, 0xf0dcb0, 0xfff4dc, 0xffffff]),
      'h.gem': material({ base: 0xff3a4a, ramp: [0x6a0814, 0xb01828, 0xe83a48, 0xff8a90, 0xffe8ea], glow: true }),
    },
    draw(r, H, m, g, sway) {
      const s = sway * 1.4, ph = r.phase % 4, fl = [0, 0.4, 0.7, 0.3][ph];
      const steel = m('h.steel'), gold = m('h.gold');
      // Laurel ribbons fluttering from the knot at the back.
      r.fill(H.poly([-6.2, 2.6, -9.6 - s, 1.6 + fl * 0.6, -11.4 - s * 1.3, 2.4 + fl, -10.8 - s * 1.3, 0.8 + fl * 0.5, -9.4 - s, 0.6, -6.4, 1.4]), m('h.ribbon'), { group: GA, bevel: 0.8, toneBias: -1 });
      r.fill(H.poly([-6.2, 1.8, -8.8 - s, -1.6 - fl * 0.4, -9.8 - s * 1.2, -3.8, -8.2 - s, -3.2, -6.2, 0.8]), m('h.ribbon'), { group: GA, bevel: 0.8 });
      // The neck guard flaring at the back, the dome and the broad brim.
      const dome = hairCap(H, 1.8, -3, 1.35);
      r.fill(H.poly([-5.6, 2.6, -9.6 - s * 0.2, -2.6, -7.8, -3.8, -4.6, -0.6]), steel, { group: g, bevel: 1.4, toneBias: -1 });
      r.fill(dome, steel, { group: g, bevel: 3 });
      r.fill(H.ell(5.6, 2.2, 3, 0.75, -0.08), steel, { group: g, bevel: 0.8 });
      // The near cheek guard, hinged at the temple, gold-rimmed.
      const cheek = H.poly([-1.6, 2.4, 0.8, 2.4, 0.9, -1.8, 2.6, -2.8, 2.4, -5.6, 0.2, -6, -1.8, -2.6]);
      r.fill(cheek, steel, { group: GA + 1, bevel: 1.4 });
      r.fill(subtract(cheek, H.poly([-1, 1.8, 0.2, 1.8, 0.3, -1.8, 1.8, -2.8, 1.7, -5, 0.4, -5.3, -1.2, -2.6])), gold, { group: GA + 1, flat: 3, noLine: true });
      dt(r, H, -0.4, 1.4, gold, 4, GA + 1);
      // The fin crest: a gold blade standing on the dome from brow to nape.
      const fin = intersect(
        subtract(H.ell(-1, 1.2, 8.4, 9.2), H.ell(-0.4, 0.9, 6.9, 6.9)),
        H.poly([5, 5, 5, 16, -9, 16, -9, 2.4]),
      );
      r.fill(fin, gold, { group: GA + 2, bevel: 1, local: H });
      // The plume: a great crimson brush rising off the fin and streaming far back like a horse's tail,
      // a gold-white crest of hair along its top.
      const pts = [[3.2, 9.2, 1.2], [1, 12.4, 2], [-3.4, 13.8 + fl * 0.2, 2.4], [-8 - s * 0.4, 12.4 + fl * 0.3, 2.2], [-11.4 - s * 0.8, 8.8 + fl * 0.5, 1.7], [-13 - s * 1.2, 4.6 + fl, 1.15], [-13.2 - s * 1.4, 1 + fl * 1.2, 0.5]];
      r.fill(chain(H, pts), m('h.plume'), { group: GA + 3, bevel: 1.6, local: H });
      r.fill(chain(H, [[1.4, 13.4, 0.5], [-3.4, 15.2 + fl * 0.2, 0.7], [-8.2 - s * 0.4, 13.8 + fl * 0.3, 0.6], [-11.6 - s * 0.8, 10.4 + fl * 0.5, 0.4]]), m('h.mane'), { group: GA + 3, bevel: 0.6, local: H });
      // The laurel: three pairs of gold leaves on a band round the dome, pointing back to the knot.
      r.fill(intersect(dome, H.poly([-9, 3.6, 9, 3.2, 9, 2.4, -9, 2.8])), gold, { group: GA + 4, flat: 3, noLine: true });
      const leaves: Shape[] = [];
      for (let i = 0; i < 3; i++) {
        const x = 3.8 - i * 3.6, y = 3.1 + i * 0.1;
        leaves.push(leaf(H, x, y, Math.PI - 0.7, 3, 0.85), leaf(H, x, y, Math.PI + 0.5, 2.6, 0.75));
      }
      r.fill(union(...leaves), m('h.leaf'), { group: GA + 4, bevel: 0.8, local: H });
      r.fill(H.circ(-6.2, 2, 0.9), m('h.ribbon'), { group: GA + 4, bevel: 0.6 });
      // A ruby set in the brim's front.
      r.fill(H.circ(6.4, 3, 0.95), gold, { group: GA + 5, bevel: 0.6 });
      dt(r, H, 6.4, 3, m('h.gem'), 3, GA + 5);
    },
  };
}

// -----------------------------------------------------------------------------
// Chest: legendary and mythic
// -----------------------------------------------------------------------------

/**
 * Siegebreaker: blackened plate trimmed in brass, battering-ram pauldrons with
 * curled brass horns and ember eyes, a ram's skull on the breast and siege
 * fire glowing in the seams, a torn war banner behind.
 */
function siegebreaker(): SkinArt {
  const hammered: Tex = (x, y) => (hash(Math.floor(x * 0.9) + 5, Math.floor(y * 0.9)) < 0.08 ? -1 : 0);
  const coil: Tex = (x, y) => (wrap(x * 1.1 + y * 0.9, 1.6) < 0.45 ? -1 : 0);
  return {
    mats: {
      'jug.plate': rp([0x1a1a22, 0x32323e, 0x545466, 0x84849a, 0xdcdcec], { shiny: true, step: 0.15, tex: hammered }),
      'jug.dark': rp([0x08080c, 0x121218, 0x1e1e26, 0x2e2e38, 0x4a4a56], { shiny: true }),
      'jug.chain': rp([0x4a2a0a, 0x7a4c18, 0xb07a2e, 0xe0b05a, 0xfff0b0], { shiny: true }),
      'jug.rivet': rp([0x4a2a0a, 0x7a4c18, 0xb07a2e, 0xe0b05a, 0xfff0b0], { shiny: true }),
      'jug.ember': rp([0x6a1a00, 0xb03a08, 0xf07020, 0xffb050, 0xfff0c0], { glow: true }),
      'sb.horn': rp([0x3a2008, 0x6a4214, 0xa06e28, 0xd8a650, 0xfff0b0], { shiny: true, tex: coil }),
      'sb.banner': rp([0x2a0606, 0x4a0c0c, 0x701616, 0x962626, 0xc04a3a], { tex: (x) => (wrap(x, 3) < 0.6 ? -1 : 0) }),
      'sb.fire': rp([0x6a1a00, 0xb03a08, 0xf07020, 0xffb050, 0xfff0c0], { glow: true }),
      'sb.bone': rp([0x5a5040, 0x8a7e66, 0xbcb094, 0xe0d6bc, 0xfaf4e4], { shiny: true }),
    },
    chest: {
      pauldron: null, spikes: null,
      back(r, T, m, c) {
        // A war banner torn into tails, hanging from the back plate.
        const s = c.sway * 3, top = c.top, ph = r.phase % 4, fl = [0, 0.4, 0.7, 0.3][ph];
        r.fill(T.poly([
          -1.4, top + 0.4, -6.4, top - 0.6, -9.6 - s, -4, -10.8 - s * 1.2 - fl, -10.4, -9 - s * 1.1, -8.6, -7.6 - s, -12.2 + fl,
          -6 - s * 0.9, -9.4, -4.2 - s * 0.7, -11, -2.2, -3,
        ]), m('sb.banner'), { group: c.g, bevel: 2.4, toneBias: -1, softLight: true });
        r.fill(T.cap(-7, top - 1.6, -1.6, top - 0.2, 0.5), m('jug.chain'), { group: c.g, bevel: 0.6, toneBias: -1 });
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, fx = b.chestPush * 0.7;
        const body = torsoBody(T, b, top);
        const plate = m('jug.plate'), dark = m('jug.dark'), brass = m('jug.chain');
        // Three tiers of tassets over the hips, brass-edged.
        for (let i = 0; i < 3; i++) {
          const y = 2.2 - i * 2.4;
          const lame = T.poly([-b.hipW - 0.6 + i * 0.2, y, b.hipW + 1.6 + i * 0.4, y, b.hipW + 2.4 + i * 0.4, y - 3, -b.hipW - 0.8 + i * 0.2, y - 2.6], 0.3);
          r.fill(lame, plate, { group: GA + i, bevel: 1.6 });
          r.fill(intersect(lame, T.rect(0, y - 2.6, 12, 0.4)), brass, { group: GA + i, flat: 2, noLine: true });
        }
        // Belly lames, and a heavy breastplate with brass edging.
        for (const y of [top * 0.28, top * 0.42]) r.fill(intersect(body, T.rect(1, y, 12, 0.5)), dark, { group: c.g, flat: 1, noLine: true });
        const chestPlate = intersect(body, T.poly([fx - 3.4, top - 0.4, fx + b.chestW + 0.8, top - 1.2, fx + b.chestW + 1, top * 0.54, fx + 1, top * 0.46, fx - 4, top * 0.58]));
        r.fill(chestPlate, plate, { group: GA + 3, bevel: 2.4, lightBias: 0.15 });
        r.fill(subtract(chestPlate, T.poly([fx - 2.8, top - 1, fx + b.chestW + 0.2, top - 1.8, fx + b.chestW + 0.4, top * 0.58, fx + 1, top * 0.51, fx - 3.4, top * 0.62])), brass, { group: GA + 3, flat: 2, noLine: true });
        // Siege fire in the seams between the plates.
        const ph = r.phase % 4;
        for (const [x, y, k] of [[fx - 1, top * 0.44, 0], [fx + 2.2, top * 0.47, 1], [b.waistW - 1, top * 0.3, 2]] as const) {
          dt(r, T, x, y, m('sb.fire'), (k + ph) % 4 === 0 ? 4 : 3, GA + 3);
        }
        // The ram's skull on the breast: brow, muzzle, eyes of ember, horns curling round.
        const kx = fx + 2.4, ky = top - 4.4;
        r.fill(union(T.ell(kx, ky + 0.6, 1.5, 1.3), T.poly([kx - 0.9, ky, kx + 0.9, ky, kx + 0.5, ky - 2.4, kx - 0.5, ky - 2.4])), m('sb.bone'), { group: GA + 4, bevel: 1 });
        r.fill(union(T.circ(kx - 1.8, ky + 0.6, 1.05), T.circ(kx + 1.8, ky + 0.6, 1.05)), m('sb.horn'), { group: GA + 5, bevel: 0.8 });
        dt(r, T, kx - 0.5, ky + 0.4, m('jug.ember'), 3, GA + 4);
        dt(r, T, kx + 0.5, ky + 0.4, m('jug.ember'), 3, GA + 4);
        // A thick gorget with a brass rim.
        r.fill(T.ell(0.4, top + 0.4, 4.6, 2.5, -0.1), plate, { group: GA + 6, bevel: 1.8 });
        r.fill(intersect(T.ell(0.4, top + 0.4, 4.6, 2.5, -0.1), T.rect(0, top - 0.6, 6, 0.45)), brass, { group: GA + 6, flat: 2, noLine: true });
      },
      shoulder(r, S, m, c) {
        const a = c.body.armR, o = { group: c.g, toneBias: c.bias };
        const plate = m('jug.plate');
        // Stacked lames down the arm, then the ram's head: a domed brow, a blunt battering muzzle
        // jutting forward, a great brass horn coiled on its side and an ember eye.
        r.fill(S.ell(0.6, -4.6, a + 2.2, 1.5, -0.1), plate, { ...o, bevel: 1.2, toneBias: c.bias - 1 });
        r.fill(S.ell(0.3, -2.8, a + 2.9, 1.8, -0.08), plate, { ...o, bevel: 1.4 });
        const head = union(S.ell(-0.4, 0.6, a + 3.2, a + 2.2, -0.05), S.poly([a + 1, 2.4, a + 5, 1.2, a + 5.4, -1.4, a + 3, -2.4, a + 0.6, -1.2], 0.4));
        r.fill(head, plate, { ...o, bevel: 2.2 });
        r.fill(intersect(head, S.poly([a + 4.2, 3, a + 7, 3, a + 7, -3, a + 4.2, -3])), m('jug.chain'), { ...o, flat: 2, noLine: true });
        if (c.far) {
          r.fill(subtract(S.circ(-0.6, 0.8, 3), S.circ(-0.4, 0.9, 1.1)), m('sb.horn'), { ...o, bevel: 1.2, toneBias: c.bias - 1 });
          return;
        }
        // The coiled horn: a thick ring round a boss, its tip sweeping out and curling forward under the muzzle.
        r.fill(union(subtract(S.circ(-0.9, 0.8, 3.5), S.circ(-0.6, 0.9, 1.3)), chain(S, [[-0.4, -2.4, 1.3], [1.8, -3.6, 1], [3.6, -3.2, 0.7], [4.2, -1.8, 0.35]])), m('sb.horn'), { group: c.g, bevel: 1.3 });
        r.fill(S.circ(-0.6, 0.9, 1.2), m('jug.rivet'), { group: c.g, bevel: 0.6 });
        dt(r, S, a + 2.2, 1.6, m('jug.ember'), 3, c.g);
        dt(r, S, a + 2.8, 1.6, m('jug.ember'), 3, c.g);
      },
    },
    ...legend(0xffd8a0, 0xd84a10, 0xffb060),
  };
}

/**
 * Heart of the World Tree: ancient silver-brown bark grown into armour, a
 * glowing seed at its heart sending veins of light up through the wood, moss
 * dotted with blossoms, and young branches with leaves and flowers growing
 * from the shoulders.
 */
function worldTree(): SkinArt {
  const BARK = [0x3a3028, 0x66584a, 0x968672, 0xc2b49c, 0xe0ff90];
  const sap: Tex = (x, y, ph) => {
    if (wrap(x * 0.75 + Math.sin(y * 0.45) * 1.1, 2.6) < 0.7) {
      const v = Math.sin(x * 1.2 + y * 0.3) + Math.sin(y * 0.7) * 0.4;
      return Math.abs(v) < 0.3 && wrap(Math.floor(y * 0.6) - ph, 4) < 2 ? 4 : -1;
    }
    return 0;
  };
  const furrow: Tex = (x, y) => (wrap(x * 0.75 + Math.sin(y * 0.45) * 1.1, 2.6) < 0.7 ? -1 : 0);
  return {
    mats: {
      'hw.bark': rp(BARK, { tex: sap }),
      'hw.plate': rp([0x2e2418, 0x52422e, 0x7a6448, 0xa48c6a, 0xcab494], { tex: furrow }),
      'hw.moss': rp([0x1a3a14, 0x2e5a1c, 0x4a8a2a, 0x72b440, 0xa8dc6a], { tex: (x, y) => (hash(Math.floor(x), Math.floor(y)) < 0.25 ? -1 : 0) }),
      'hw.leaf': rp([0x14401a, 0x22702a, 0x3aa03a, 0x6ad058, 0xb8f08a], { shiny: true }),
      'hw.knot': rp([0x1a120a, 0x2e2014, 0x4a3420, 0x6a4c2e, 0x8e6c46]),
      'hw.heart': rp([0x3a8a1a, 0x7ac83a, 0xc8ff6a, 0xf0ffb0, 0xffffff], { glow: true }),
      'hw.bud': glow(0xffe8f0),
      'wt.twig': rp([0x1e140c, 0x3a2a1a, 0x5a442c, 0x7e6444, 0xa4886a]),
      'wt.petal': rp([0xa04a7a, 0xd878a8, 0xf8b4d4, 0xffe0ee, 0xffffff]),
      'wt.seed': rp([0x6a8a10, 0xb0d830, 0xe8ff70, 0xfaffc0, 0xffffff], { glow: true }),
      'wt.gold': glow(0xffe070),
    },
    chest: {
      torso: 'hw.bark', sleeve: 'hw.bark', sleeveLen: 0.6,
      back(r, T, m, c) {
        // A young crown of branches growing up from the back behind the head, in leaf and flower.
        const s = c.sway * 1.6, top = c.top, ph = r.phase % 4, fl = [0, 0.2, 0.35, 0.15][ph];
        const tw = m('wt.twig'), lf = m('hw.leaf');
        const o = { group: c.g, bevel: 0.7, toneBias: -1 };
        const X = (x: number, k: number) => x - s * k;
        r.fill(union(
          T.cap(-2.2, top - 2, X(-6.4, 0.4), top + 3.6, 0.9, 0.6),
          T.cap(X(-6.4, 0.4), top + 3.6, X(-10.6, 0.8), top + 8 + fl, 0.5, 0.3),
          T.cap(X(-6.4, 0.4), top + 3.6, X(-8.2, 0.6), top + 12.4 + fl, 0.5, 0.28),
          T.cap(X(-7.8, 0.5), top + 4.4, X(-12.4, 0.9), top + 3.4 + fl, 0.4, 0.22),
        ), tw, o);
        const cluster = (x: number, y: number, a: number) => union(leaf(T, x, y, a, 2.8, 0.95), leaf(T, x, y, a + 0.9, 2.4, 0.85), leaf(T, x, y, a - 0.9, 2.4, 0.85));
        r.fill(union(cluster(X(-10.6, 0.8), top + 8 + fl, 2.3), cluster(X(-8.2, 0.6), top + 12.4 + fl, 1.8), cluster(X(-12.4, 0.9), top + 3.4 + fl, 3), leaf(T, X(-7.4, 0.5), top + 6, 1.6, 2.2, 0.75)), lf, o);
        blossom(r, T, X(-11.2, 0.8), top + 9.6 + fl, 0.9, m('wt.petal'), m('wt.gold'), c.g, -1);
        blossom(r, T, X(-7.6, 0.6), top + 13.8 + fl, 0.85, m('wt.petal'), m('wt.gold'), c.g, -1);
        blossom(r, T, X(-13.4, 0.9), top + 4.6 + fl, 0.8, m('wt.petal'), m('wt.gold'), c.g, -1);
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, fx = b.chestPush * 0.7;
        const body = torsoBody(T, b, top);
        // Bark plates over the belly and the chest, and a hip tasset.
        r.fill(intersect(body, T.poly([-b.waistW - 1, top * 0.52, b.waistW + 2, top * 0.6, b.waistW + 2, 3.6, -b.waistW - 1, 3.4], 0.6)), m('hw.plate'), { group: GA, bevel: 1.8 });
        const chestPlate = intersect(body, T.poly([fx - 4, top + 0.4, fx + b.chestW + 1, top - 0.6, fx + b.chestW + 1, top * 0.54, fx - 1, top * 0.46, fx - 4.4, top * 0.62], 0.6));
        r.fill(chestPlate, m('hw.plate'), { group: GA + 1, bevel: 2.2 });
        r.fill(T.poly([b.hipW - 1.6, 2.4, b.hipW + 1.8, 2.2, b.hipW + 2.2, -3.6, b.hipW - 0.6, -2.8], 0.4), m('hw.plate'), { group: GA + 2, bevel: 1.4 });
        // Moss along the collar, blossoms open in it.
        r.fill(intersect(body, roll(T, fx - 3.8, top + 0.2, fx + 3.8, top - 0.5, 1.1, 5)), m('hw.moss'), { group: GA + 3, bevel: 1, noLine: true });
        r.fill(roll(T, b.hipW - 1.4, 2.4, b.hipW + 1.8, 2.2, 0.8, 2), m('hw.moss'), { group: GA + 3, bevel: 0.8 });
        // The heart-seed: roots of light reaching out from a knot of wood round a glowing seed.
        const kx = fx + 2.2, ky = top - 5;
        const ph = r.phase % 4;
        for (const [ax, ay] of [[-2.8, -2.2], [2.6, -2.6], [-2.2, 2.4], [0.4, -3.6]] as const) ln(r, T, kx, ky, kx + ax, ky + ay, m('wt.gold'), 2, GA + 4);
        r.fill(T.ell(kx, ky, 2.5, 2.6), m('hw.knot'), { group: GA + 4, bevel: 1.2 });
        r.fill(T.poly([kx, ky + 2.1, kx + 1.4, ky - 0.1, kx, ky - 1.9, kx - 1.4, ky - 0.1]), m('wt.seed'), { group: GA + 4 });
        dt(r, T, kx, ky + 0.2, m('wt.seed'), ph === 1 || ph === 2 ? 4 : 3, GA + 4);
        blossom(r, T, fx - 2.4, top + 0.4, 0.95, m('wt.petal'), m('wt.gold'), GA + 5);
        blossom(r, T, fx + 2.8, top - 0.2, 0.8, m('wt.petal'), m('wt.gold'), GA + 5);
        blossom(r, T, b.hipW + 0.6, 2.8, 0.75, m('wt.petal'), m('wt.gold'), GA + 5);
        r.fill(leaf(T, fx + 0.2, top + 0.6, 1.9, 2.4, 0.8), m('hw.leaf'), { group: GA + 5, bevel: 0.7 });
      },
      shoulder(r, S, m, c) {
        const a = c.body.armR, o = { group: c.g, toneBias: c.bias };
        // A slab of bark with moss on top; young branches grow up out of it with leaves and a blossom.
        r.fill(S.poly([-a - 2, 1.4, -a - 1.2, -2.8, 0.4, -3.6, a + 2, -2, a + 2.2, 1.8, 0, 3], 0.8), m('hw.plate'), { ...o, bevel: 1.8 });
        const sw = r.phase % 4 === 2 ? 0.25 : 0;
        if (c.far) {
          r.fill(S.cap(-1, 2, -3.6, 4.6, 0.45, 0.25), m('wt.twig'), { ...o, bevel: 0.6, toneBias: c.bias - 1 });
          r.fill(leaf(S, -3.6, 4.6, 2.4, 2, 0.7), m('hw.leaf'), { ...o, bevel: 0.6 });
        } else {
          // Branches reach up and back from the shoulder, clear of the face.
          const tw = m('wt.twig');
          r.fill(union(S.cap(-0.6, 2, -3.4 - sw, 5.6, 0.55, 0.3), S.cap(-2, 3.8, -5.6, 4.2 + sw, 0.35, 0.2), S.cap(-1.6, 2.4, -1.4, 4.8, 0.35, 0.2)), tw, { group: c.g, bevel: 0.6 });
          r.fill(union(leaf(S, -3.4 - sw, 5.4, 1.9, 2.2, 0.8), leaf(S, -5.6, 4.2 + sw, 2.9, 2, 0.75), leaf(S, -1.4, 4.6, 1.2, 1.8, 0.65)), m('hw.leaf'), { group: c.g, bevel: 0.6 });
          blossom(r, S, -3.2 - sw, 6.2, 0.85, m('wt.petal'), m('wt.gold'), c.g);
        }
        r.fill(roll(S, -a - 1.6, 1.8, a + 1.8, 2.2, 1.1, 4), m('hw.moss'), { ...o, bevel: 1 });
        if (!c.far) blossom(r, S, a + 0.6, 2.6, 0.7, m('wt.petal'), m('wt.gold'), c.g);
      },
    },
    ...legend(0xf0ffc0, 0x6ac83a, 0xd8ff9a),
  };
}

/**
 * Shinobi Shozoku: a midnight-indigo ninja wrap bound with a crimson obi, a
 * very long scarf streaming behind in waves, a bandolier of steel shuriken
 * across the chest, a tanto at the hip and a lacquered shoulder guard.
 */
function shinobi(): SkinArt {
  const weave: Tex = (x, y) => (wrap(y - x * 0.55, 2.8) < 0.55 ? -1 : 0);
  return {
    mats: {
      'sg.cloth': rp([0x08081a, 0x12142c, 0x1e2244, 0x30365e, 0x4a527e], { tex: weave }),
      'sg.wrap': rp([0x0a0a14, 0x161622, 0x242434, 0x36364a, 0x50506a], { tex: (x, y) => (wrap(y * 1.1 + x * 0.6, 1.8) < 0.5 ? -1 : 0) }),
      'sg.scarf': rp([0x2a0408, 0x520a12, 0x86141e, 0xb82a30, 0xe85a50]),
      'sg.strap': rp([0x0e0a0a, 0x1e1614, 0x30241e, 0x46362c, 0x5e4c3e]),
      'sg.blade': rp([0x3a4250, 0x6a7484, 0xa4aebe, 0xd8e0ec, 0xffffff], { shiny: true }),
      'sg.buckle': rp([0x5a3a0a, 0x9a6a18, 0xd8a030, 0xf8d070, 0xfff4c0], { shiny: true }),
      'shz.obi': rp([0x3a0408, 0x6a0a12, 0x9a1a22, 0xc83a3a, 0xf07a6a], { tex: (_x, y) => (wrap(y, 1.4) < 0.35 ? -1 : 0) }),
      'shz.lacquer': rp([0x0a0608, 0x1a1014, 0x2a1a20, 0x46303a, 0x8a6878], { shiny: true }),
      'shz.seal': glow(0xff4a3a),
      'shz.paper': plain(0xe8dcc0),
      'shz.hilt': rp([0x1a0408, 0x3a0a12, 0x6a121c, 0x9a2a30, 0xc85a5a], { tex: (x, y) => (wrap(Math.floor(x + y), 2) === 0 ? -1 : 0) }),
    },
    chest: {
      noScarf: true,
      back(r, T, m, c) {
        // The scarf's two tails, very long, rippling in waves that travel down them.
        const top = c.top + 0.8, s = c.sway * 3.4, ph = r.phase % 4;
        const tail = (len: number, w: number, lift: number, bias: number) => {
          const pts: number[][] = [];
          for (let i = 0; i <= 6; i++) {
            const u = i / 6;
            const wave = Math.sin(u * 6.28 - ph * (Math.PI / 2)) * (0.2 + u * 1.5);
            pts.push([-1.5 - u * len - s * u * 1.4, top - u * lift + wave, w * (1 - u * 0.4)]);
          }
          r.fill(chain(T, pts), m('sg.scarf'), { group: c.g, bevel: 1.2, toneBias: bias });
          const [ex, ey] = pts[6];
          r.fill(T.poly([ex + 0.4, ey + 0.8, ex - 2.2, ey + 0.2, ex - 0.8, ey - 0.3, ex - 1.8, ey - 1.2, ex + 0.4, ey - 0.8]), m('sg.scarf'), { group: c.g, bevel: 0.6, toneBias: bias });
        };
        tail(15, 1.15, 10, -1);
        // A ninjato slung across the back, its hilt rising over the shoulder.
        const ax = 1, ay = -2.4, bx = -7.4, by = c.top + 1.8, hx = -11.2, hy = c.top + 4.6;
        r.fill(T.cap(ax, ay, bx, by, 0.75), m('shz.lacquer'), { group: c.g, bevel: 0.8, toneBias: -1 });
        r.fill(T.cap(bx, by, hx, hy, 0.55), m('shz.hilt'), { group: c.g, bevel: 0.5 });
        r.fill(T.ell(bx, by, 1.5, 0.55, Math.atan2(by - ay, bx - ax) + Math.PI / 2), m('sg.buckle'), { group: c.g, bevel: 0.5 });
        dt(r, T, hx + 0.1, hy + 0.3, m('sg.buckle'), 3, c.g);
        tail(20, 1.45, 7, 0);
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, fx = b.chestPush * 0.7;
        const body = torsoBody(T, b, top);
        // The crossed front of the wrap, then the obi at the waist with its knot at the back hip.
        ln(r, T, fx - 1.6, top + 0.2, fx + 2.6, top * 0.56, m('sg.wrap'), 0, c.g);
        r.fill(intersect(body, T.rect(0.5, 4, 12, 1.7)), m('shz.obi'), { group: GA, bevel: 1.2, noLine: true });
        r.fill(union(T.ell(-b.waistW + 0.2, 4.4, 1.3, 1, 0.4), T.poly([-b.waistW, 3.8, -b.waistW - 1.6, 0.2, -b.waistW - 0.4, 0.8, -b.waistW + 0.6, 3.4])), m('shz.obi'), { group: GA + 1, bevel: 0.9 });
        // Two shuriken tucked in the obi at the front hip.
        for (const [x, y, a] of [[b.waistW + 0.4, 4.2, 0.2], [b.waistW - 1.8, 3.8, 0.7]] as const) {
          r.fill(shuriken(T, x, y, 1.45, a), m('sg.blade'), { group: GA + 9, bevel: 0.6 });
          dt(r, T, x, y, m('shz.obi'), 1, GA + 9);
        }
        // A paper seal tucked in the obi, its ink glowing.
        r.fill(T.rect(-0.6, 3.4, 0.6, 1.3, 0.1), m('shz.paper'), { group: GA + 2, flat: 3 });
        dt(r, T, -0.6, 3.6, m('shz.seal'), 3, GA + 2);
        // A tanto through the obi, hilt forward.
        r.fill(T.cap(b.waistW - 3, 5.6, b.waistW + 1.6, 4.2, 0.55), m('shz.lacquer'), { group: GA + 3, bevel: 0.6 });
        r.fill(T.cap(b.waistW + 1.6, 4.2, b.waistW + 3.4, 3.8, 0.45), m('sg.strap'), { group: GA + 3, bevel: 0.4 });
        r.fill(T.rect(b.waistW + 1.6, 4.2, 0.3, 0.75, 0), m('sg.buckle'), { group: GA + 3, bevel: 0.3 });
        // The bandolier from the back shoulder to the front hip, shuriken riding along it.
        const ax = -2.4, ay = top - 0.6, bx = b.waistW + 0.8, by = 5.8;
        r.fill(intersect(body, T.cap(ax, ay, bx, by, 0.75)), m('sg.strap'), { group: GA + 4, bevel: 0.6 });
        for (let i = 0; i < 3; i++) {
          const u = 0.3 + i * 0.24, x = ax + (bx - ax) * u, y = ay + (by - ay) * u;
          r.fill(shuriken(T, x, y, 1.35, 0.3 + i * 0.4), m('sg.blade'), { group: GA + 5 + i, bevel: 0.6 });
          dt(r, T, x, y, m('sg.strap'), 0, GA + 5 + i);
        }
        // The scarf wound high round the neck up to the chin.
        r.fill(T.ell(0.4, top + 1.2, 4, 2.4, -0.12), m('sg.scarf'), { group: GA + 8, bevel: 1.8 });
        r.fill(intersect(T.ell(0.4, top + 1.2, 4, 2.4, -0.12), T.rect(0, top + 0.6, 6, 0.35)), m('sg.scarf'), { group: GA + 8, flat: 1, noLine: true });
      },
      shoulder(r, S, m, c) {
        const a = c.body.armR, o = { group: c.g, toneBias: c.bias };
        // A small lacquered guard of three laced plates.
        for (let i = 0; i < 3; i++) {
          r.fill(S.rect(0.2, 1 - i * 1.5, a + 1.3 - i * 0.15, 0.85, 0.4), m('shz.lacquer'), { ...o, bevel: 0.8 });
        }
        if (!c.far) {
          for (const x of [-1.2, 1.4]) ln(r, S, x, 1.6, x, -2.8, m('shz.obi'), 2, c.g);
          ln(r, S, -a - 0.9, 1.8, a + 1.3, 1.8, m('sg.blade'), 3, c.g);
        }
      },
    },
  };
}

/**
 * Skald's Saga Mail: bright mail under blued plates with bronze edges, a grey
 * wolf-pelt mantle over the shoulders and down the back, a bronze ring brooch,
 * and a column of saga runes on the breast that light up one after another,
 * telling their story from top to bottom.
 */
function skaldMail(): SkinArt {
  const fur: Tex = (x, y) => (wrap(x * 0.9 + Math.sin(y * 0.8) * 0.8, 2.2) < 0.5 ? -1 : hash(Math.floor(x * 1.5), Math.floor(y * 2)) < 0.15 ? 1 : 0);
  const knot: Tex = (x, y) => (wrap(Math.floor(x * 0.9) + Math.floor(y * 0.9), 3) === 0 && hash(Math.floor(x), Math.floor(y)) < 0.5 ? -1 : 0);
  return {
    mats: {
      'rm.mail': rp([0x2e3442, 0x525a6c, 0x8a94a8, 0xb8c2d4, 0xeef4ff], { shiny: true, tex: (x, y) => (wrap(Math.floor(x + y), 2) === 0 || wrap(Math.floor(x - y), 2) === 0 ? -1 : 0) }),
      'rm.plate': rp([0x10182a, 0x1e2c48, 0x34486e, 0x5a74a0, 0xb8d0f0], { shiny: true, step: 0.15, tex: knot }),
      'rm.belt': rp([0x1a100a, 0x2e2016, 0x4a3424, 0x6a4c34, 0x8e6a4c]),
      'rm.engrave': rp([0x4a2a0a, 0x7a4c18, 0xb07a2e, 0xe0b05a, 0xfff0b0], { shiny: true }),
      'rm.rune': rp([0x8a5a10, 0xd09a28, 0xffd060, 0xfff0a8, 0xffffff], { glow: true }),
      'skald.fur': rp([0x3a2e24, 0x6a5848, 0x9a8670, 0xc8b8a0, 0xf0e6d4], { tex: fur }),
      'skald.bronze': rp([0x4a2a0a, 0x7a4c18, 0xb07a2e, 0xe0b05a, 0xfff0b0], { shiny: true }),
      'skald.dim': rp([0x2a1c0a, 0x4a3214, 0x6a4a20, 0x8a6430, 0xa88040]),
    },
    chest: {
      sleeveLen: 0.85,
      back(r, T, m, c) {
        // The wolf pelt hanging down the back, its hem in tufts, a tail at the end.
        const s = c.sway * 3, top = c.top, ph = r.phase % 4, fl = [0, 0.4, 0.7, 0.3][ph];
        r.fill(T.poly([
          -0.6, top + 1, -6, top - 0.4, -9.2 - s, -2.6, -10.4 - s * 1.2 - fl, -8,
          -9 - s * 1.1, -7.2, -8 - s, -9.4 + fl, -6.6 - s * 0.9, -7.8, -5 - s * 0.8, -9.2, -3.4 - s * 0.6, -7.4, -1.6, -5, -0.6, -1,
        ]), m('skald.fur'), { group: c.g, bevel: 2.6, toneBias: -1, softLight: true });
        r.fill(chain(T, [[-8.6 - s, -6, 1.1], [-10.6 - s * 1.3, -9.6 + fl, 0.9], [-11 - s * 1.5, -12.4 + fl * 1.4, 0.4]]), m('skald.fur'), { group: c.g, bevel: 1, toneBias: -1 });
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, fx = b.chestPush * 0.7;
        const body = torsoBody(T, b, top);
        // The breastplate, edged in bronze.
        const plate = intersect(body, T.poly([fx - 2.6, top - 0.4, fx + b.chestW + 0.6, top - 0.8, fx + b.chestW + 0.4, top * 0.5, fx + 2, top * 0.44, fx - 2.6, top * 0.52], 0.5));
        r.fill(plate, m('rm.plate'), { group: GA, bevel: 2 });
        r.fill(subtract(plate, T.poly([fx - 2, top - 0.9, fx + b.chestW, top - 1.3, fx + b.chestW - 0.2, top * 0.53, fx + 2, top * 0.48, fx - 2, top * 0.56])), m('skald.bronze'), { group: GA, flat: 2, noLine: true });
        // Saga runes down the breast: each lights in turn, the rest burn low.
        const rx = fx + 2.6, ph = r.phase % 4;
        const glyphs: [number, number, number, number][][] = [
          [[0, -1, 0, 1], [0, 1, 0.9, 0.2], [0, 0.2, 0.9, -0.6]], // ansuz
          [[0, -1, 0, 1], [0, 1, 0.9, 0], [0.9, 0, 0, -1]], // thurisaz
          [[-0.7, -1, -0.7, 1], [-0.7, 1, 0.7, -1], [0.7, -1, 0.7, 1]], // naudiz
        ];
        glyphs.forEach((gl, i) => {
          const y = top - 2.6 - i * 2.8, lit = i === ph % 3 && ph !== 3;
          const mm = m(lit || ph === 3 ? 'rm.rune' : 'skald.dim');
          for (const [ax, ay, bx, by] of gl) ln(r, T, rx + ax, y + ay, rx + bx, y + by, mm, lit ? 4 : ph === 3 ? 3 : 2, GA);
        });
        // The belt with a bronze buckle plate.
        const bx = b.waistW - 0.4;
        r.fill(T.rect(bx, 2.6, 1.2, 1.3, 0.2), m('skald.bronze'), { group: GA + 1, bevel: 0.8 });
        dt(r, T, bx, 2.6, m('rm.rune'), 3, GA + 1);
        // The wolf-pelt mantle round the neck, pinned with a bronze ring brooch.
        r.fill(roll(T, -5.4, top + 0.6, fx + 3, top - 0.8, 2.4, 6), m('skald.fur'), { group: GA + 2, bevel: 1.4 });
        const px = fx + 1.6, py = top - 1.2;
        r.fill(subtract(T.circ(px, py, 1.25), T.circ(px, py, 0.6)), m('skald.bronze'), { group: GA + 3, bevel: 0.6 });
        ln(r, T, px - 1.6, py + 1.1, px + 0.9, py - 1.5, m('skald.bronze'), 3, GA + 3);
      },
      shoulder(r, S, m, c) {
        const a = c.body.armR, o = { group: c.g, toneBias: c.bias };
        // A blued plate edged in bronze under a roll of fur, a rune of victory cut in the plate.
        r.fill(S.ell(-0.2, -0.8, a + 1.9, a + 1.3), m('rm.plate'), { ...o, bevel: 2 });
        r.fill(subtract(S.ell(-0.2, -0.8, a + 1.9, a + 1.3), S.ell(-0.2, -0.4, a + 1.4, a + 0.9)), m('skald.bronze'), { ...o, flat: 2, noLine: true });
        if (!c.far) {
          const rr = m('rm.rune');
          // Tiwaz: an arrow pointing up.
          ln(r, S, 0.4, -2.4, 0.4, 0.2, rr, 3, c.g);
          ln(r, S, 0.4, 0.2, -0.6, -0.8, rr, 3, c.g);
          ln(r, S, 0.4, 0.2, 1.4, -0.8, rr, 3, c.g);
        }
        r.fill(roll(S, -a - 1.8, 1.4, a + 1.6, 1.9, 1.3, 4), m('skald.fur'), { ...o, bevel: 1.2 });
      },
    },
    ...legend(0xfff0b0, 0xd8902a, 0xffe08a),
  };
}

// -----------------------------------------------------------------------------
// The skins
// -----------------------------------------------------------------------------

/** Birch bark: dark lenticel dashes across pale wood. */
const birch: Tex = (x, y) => {
  const row = Math.floor(y * 0.7);
  return hash(Math.floor(x * 0.45) + row * 3, row) < 0.32 && wrap(y * 0.7, 1) < 0.4 ? -2 : 0;
};

export const WAVE4_HEADS: Record<string, SkinArt> = {
  // --- Seer's Blindfold ---
  'seer_blindfold.crimson': {
    mats: {
      'seer.cloth': rp([0x3a0a14, 0x6a1424, 0x9a2234, 0xc8404a, 0xf07a70], { tex: (x, y) => (wrap(Math.floor(x + y), 3) === 0 || wrap(Math.floor(x - y), 3) === 0 ? -1 : 0) }),
      'seer.tail': rp([0x1a060c, 0x3a0e1a, 0x5e1828, 0x84283a, 0xb04a58], { tex: (x, y) => (wrap(x * 0.6 + y * 0.4, 2.4) < 0.5 ? 1 : 0) }),
      'seer.paint': shiny(0xf0c860, undefined, 0.16),
      'seer.eye': glow(0xffd060),
      'seer.gem': glow(0xff6a5a),
    },
  },
  'seer_blindfold.oracle': { head: oracleGaze, ...legend(0xfff4c8, 0x5ab8f0, 0xfff0b0) },

  // --- Dread Helm ---
  'dread_helm.bone': {
    mats: {
      'dread.iron': rp([0x5a5040, 0x8a7e66, 0xbcb094, 0xe0d6bc, 0xfaf4e4], {
        shiny: true, step: 0.14,
        tex: (x, y) => (Math.abs(Math.sin(x * 1.1 + Math.sin(y * 0.9) * 2) + Math.sin(y * 0.7) * 0.5) < 0.1 ? -2 : 0),
      }),
      'dread.dark': rp([0x2a2018, 0x463a2c, 0x6a5a46, 0x8e7c64, 0xb8a68a]),
      'dread.horn': rp([0x0e0c0c, 0x221c1c, 0x3a3030, 0x5a4a46, 0x8a7870], { shiny: true, tex: (x, y) => (wrap(x * 0.8 + y * 0.9, 1.7) < 0.45 ? -1 : 0) }),
      'dread.slit': plain(0x0a0806),
      'dread.eye': glow(0x9aff6a),
      'dread.rivet': shiny(0xb08a4a),
    },
  },
  'dread_helm.nightmare': { head: nightmareCrown, ...legend(0xe8c8ff, 0x7a2ad8, 0xd8a8ff) },

  // --- Hawkeye Hood ---
  'hawkeye_hood.autumn': {
    mats: {
      'hawk.hood': rp([0x3a1408, 0x6a2a10, 0xa04a1a, 0xc8742e, 0xe8a858], { tex: (x, y) => (hash(Math.floor(x * 0.7), Math.floor(y * 0.7) + 5) < 0.08 ? 1 : hash(Math.floor(x), Math.floor(y) + 11) < 0.06 ? -1 : 0) }),
      'hawk.rim': rp([0x1a0e06, 0x2e1a0c, 0x4a2c14, 0x6a4420, 0x8e6234]),
      'hawk.feather': rp([0x1a0a06, 0x34160c, 0x542616, 0x7a3c22, 0xa45a36], { tex: (x, y) => (wrap(x * 0.9 - y * 0.8, 2) < 0.7 ? 1 : 0) }),
      'hawk.tip': rp([0x8a7a5a, 0xb8a888, 0xe0d4b8, 0xf4ecd8, 0xfffaf0]),
      'hawk.brass': shiny(0xc87838, undefined, 0.16),
      'hawk.lens': glow(0xffc860),
    },
  },
  'hawkeye_hood.eagle': { head: eagleMask },

  // --- Gladiator Helm ---
  'gladiator_helm.silver': {
    mats: {
      'glad.bronze': rp([0x3a4250, 0x6a7484, 0xa4aebe, 0xd8e0ec, 0xffffff], { shiny: true, step: 0.15 }),
      'glad.dark': rp([0x1a1e28, 0x2e3442, 0x4a5264, 0x6a7488, 0x98a2b4], { shiny: true }),
      'glad.crest': rp([0x0a1030, 0x142058, 0x22348a, 0x3a54b8, 0x6a8ae0], { tex: (x, y) => (wrap(x * 1.3 + y * 0.2, 1.5) < 0.5 ? -1 : wrap(x * 1.3 + y * 0.2, 1.5) > 1.3 ? 1 : 0) }),
    },
  },
  'gladiator_helm.champion': { head: championsLaurel, ...legend(0xfff2b8, 0xd83a2a, 0xffe08a) },

  // --- Juggernaut Plate ---
  'juggernaut_plate.gunmetal': {
    mats: {
      'jug.plate': rp([0x141e30, 0x26364e, 0x3e5472, 0x6a84a6, 0xc8dcf4], { shiny: true, step: 0.15, tex: (x, y) => (hash(Math.floor(x * 1.1) + 9, Math.floor(y * 1.1)) < 0.05 ? -1 : 0) }),
      'jug.dark': rp([0x0a0c12, 0x121822, 0x1c2432, 0x2a3446, 0x44526a], { shiny: true }),
      'jug.chain': rp([0x3a2a12, 0x5e4620, 0x8a6c34, 0xb89656, 0xe8d090], { shiny: true }),
      'jug.rivet': rp([0x3a2a12, 0x5e4620, 0x8a6c34, 0xb89656, 0xe8d090], { shiny: true }),
      'jug.ember': glow(0x6ad8ff),
    },
  },
  'juggernaut_plate.siegebreaker': siegebreaker(),

  // --- Heartwood Armor ---
  'heartwood_armor.autumn': {
    mats: {
      'hw.bark': rp([0x4a4440, 0x8a847a, 0xc8c2b4, 0xe8e4d8, 0xfaf8f0], { tex: birch }),
      'hw.plate': rp([0x403a36, 0x7e786e, 0xbcb6a8, 0xdedacc, 0xf6f4ea], { tex: birch }),
      'hw.moss': rp([0x4a2a08, 0x7a4a10, 0xb07a1e, 0xd8a836, 0xf8d870], { tex: (x, y) => (hash(Math.floor(x), Math.floor(y)) < 0.25 ? -1 : 0) }),
      'hw.leaf': rp([0x5a0a08, 0x9a1e10, 0xd8441e, 0xf8823a, 0xffc070], { shiny: true }),
      'hw.knot': rp([0x1a120c, 0x2e2218, 0x4a3a2a, 0x6a5640, 0x8e7a5e]),
      'hw.heart': rp([0x8a3a0a, 0xc0661a, 0xffa030, 0xffd070, 0xfff4d0], { glow: true, tex: (_x, _y, ph) => [0, 1, 1, 0][ph % 4] }),
      'hw.bud': glow(0xffe070),
    },
  },
  'heartwood_armor.worldtree': worldTree(),

  // --- Shadow Garb ---
  'shadow_garb.crimson': {
    mats: {
      'sg.cloth': rp([0x14060a, 0x260a12, 0x3e121e, 0x5a1c2c, 0x7e2c40], { tex: (x, y) => (wrap(y - x * 0.55, 2.8) < 0.55 ? -1 : 0) }),
      'sg.wrap': rp([0x0a0608, 0x140c10, 0x22161c, 0x34222a, 0x4c3440], { tex: (x, y) => (wrap(y * 1.1 + x * 0.6, 1.8) < 0.5 ? -1 : 0) }),
      'sg.scarf': rp([0x4a0408, 0x7a0a12, 0xb0141e, 0xe0303a, 0xff6a60]),
      'sg.strap': rp([0x0a0808, 0x16100e, 0x241a16, 0x362820, 0x4c3a2e]),
      'sg.blade': rp([0x1a1e2a, 0x2e3446, 0x4a5268, 0x7a849c, 0xd8e0f4], { shiny: true }),
      'sg.buckle': shiny(0xd8a838),
    },
  },
  'shadow_garb.shinobi': shinobi(),

  // --- Runic Mail ---
  'runic_mail.ember': {
    mats: {
      'rm.mail': rp([0x161214, 0x2a2224, 0x443a3a, 0x665854, 0x9a8a80], { shiny: true, tex: (x, y) => (wrap(Math.floor(x + y), 2) === 0 || wrap(Math.floor(x - y), 2) === 0 ? -1 : 0) }),
      'rm.plate': rp([0x1a0e0c, 0x2e1a16, 0x4a2a22, 0x6e3e30, 0xb07050], { shiny: true, step: 0.15 }),
      'rm.belt': rp([0x120a06, 0x22140c, 0x3a2416, 0x543822, 0x725036]),
      'rm.engrave': rp([0x4a1a06, 0x7a2e0c, 0xb04a18, 0xd8702a, 0xf8a050]),
      'rm.rune': rp([0x8a2a00, 0xd05a10, 0xff8a2a, 0xffc070, 0xfff0d0], { glow: true }),
    },
  },
  'runic_mail.skald': skaldMail(),
};
