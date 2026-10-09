import { ring, type Layer } from '../../auraKit';
import { css, mix } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { hash } from '../../pixel/tex';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, mats, Q, wrap } from './kit';

/**
 * Epic set: Prismheart. Living crystal: clear pale quartz shaded in lilac,
 * bursting in hard-edged shards out of dark slate geode rock, splitting the
 * light into small rainbow glints that wander over every facet.
 */

/** Pale quartz: lilac in the shadows, aqua-white in the light, pure white glints. */
const QUARTZ = [0x4a3a7c, 0x7c6cb4, 0xb2b0e2, 0xe0f2fa, 0xffffff];
/** Slate geode rock (four dark tones; the fifth is a crystal vein catching the light). */
const SLATE = [0x272c37, 0x3d4452, 0x5a6372, 0x7c8796];
const VEIN = 0xd8f6ff;
/** Polished slate for frames, bands and settings. */
const SLATE_HI = [0x1e2129, 0x323744, 0x4e5766, 0x76829a, 0xaab6c8];
const CORE = 0xf4fbff, LILAC = 0xb8a0ff, CYAN = 0xa8ecff;
/** The spectrum the crystal throws: red, orange, yellow, green, blue, violet. */
const RAIN = [0xff4a5e, 0xffa040, 0xffe85a, 0x5af08a, 0x4aaaff, 0xb46aff];

/** A rainbow glint: saturated, self-lit. */
const hue = (c: number): MaterialSpec => ({ base: c, glow: true, ramp: [mix(c, 0, 0.45), mix(c, 0, 0.25), c, c, mix(c, 0xffffff, 0.55)] });
const quartz = (tex?: Tex): MaterialSpec => ({ base: QUARTZ[2], ramp: QUARTZ, shiny: true, tex });
const polished = (tex?: Tex): MaterialSpec => ({ base: SLATE_HI[2], ramp: SLATE_HI, shiny: true, tex });

/**
 * Geode rock: chunky angular facets (a few cells a shade darker) and thin
 * crystal veins, a light running along them one step per frame.
 */
const geode = (cell = 3.4, vein = 0.09, seed = 0): Tex => (x, y, ph) => {
  const v = Math.sin(x * 0.55 + Math.sin(y * 0.7 + seed) * 1.8) + Math.sin(y * 0.8 - x * 0.3 + seed) * 0.6;
  if (Math.abs(v) < vein) return wrap(Math.floor((x + y) * 0.4) - ph, 4) === 0 ? 4 : 1;
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
  const up = wrap(x, cell) + wrap(y, cell) > cell ? 1 : 0;
  return hash(cx * 2 + up + seed * 7, cy) < 0.28 ? -1 : 0;
};
const rock = (cell?: number, vein?: number, seed?: number): MaterialSpec => ({ base: SLATE[2], ramp: [...SLATE, VEIN], tex: geode(cell, vein, seed) });

const FX = epicFx(0xffffff, LILAC, 'twinkle', 0xe8f8ff);

/** Particles the full set sheds in battle. */
export const PRISMHEART_FX: SkinFx = { spark: 0xffffff, spark2: LILAC, kind: 'twinkle' };

/** The six rainbow glint materials, named `${p}r0`..`${p}r5`. */
const rainMats = (p: string): Record<string, MaterialSpec> => Object.fromEntries(RAIN.map((c, i) => [`${p}r${i}`, hue(c)]));
/** Rainbow colour `k` (any integer). */
const rk = (p: string, k: number) => `${p}r${wrap(k, 6)}`;

// -----------------------------------------------------------------------------
// Facets
// -----------------------------------------------------------------------------

/**
 * A faceted crystal shard in frame F, standing on (x, y) and pointing along
 * angle `a`, `len` long and `w` half wide: split down its spine into a lit
 * facet and a shaded one (whichever side faces the light), with a white glint
 * on the lit edge. Returns the tip in raster space.
 */
function shard(r: Raster, F: Xf, x: number, y: number, a: number, len: number, w: number, mat: number, g: number, bias = 0, glint = true): [number, number] {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  const P = (u: number, v: number) => [x + c * u + nx * v, y + s * u + ny * v];
  const sh = len * 0.42;
  const tip = P(len, 0), base = P(-0.4, 0);
  // Which side faces the light (upper front in raster space).
  const rx = F.x(nx, ny) - F.x(0, 0), ry = F.y(nx, ny) - F.y(0, 0);
  const litPlus = rx * 0.42 - ry * 0.72 > 0;
  const plus = F.poly([...base, ...P(-0.4, w * 0.7), ...P(sh, w), ...tip]);
  const minus = F.poly([...base, ...tip, ...P(sh, -w), ...P(-0.4, -w * 0.7)]);
  r.fill(plus, mat, { group: g, flat: litPlus ? 3 : 2, toneBias: bias });
  r.fill(minus, mat, { group: g, flat: litPlus ? 2 : 3, toneBias: bias, noLine: true });
  // A brighter sliver down the lit edge, and the glint.
  if (len > 3.2) {
    const k = litPlus ? 1 : -1;
    r.fill(F.poly([...P(sh * 0.5, k * w * 0.55), ...P(sh, k * w * 0.85), ...P(len - 0.3, 0), ...P(sh, k * w * 0.25)]), mat, { group: g, flat: 4, toneBias: bias, noLine: true });
  }
  if (glint) {
    const [gx, gy] = P(sh, (litPlus ? 1 : -1) * w * 0.5);
    r.dot(F.x(gx, gy), F.y(gx, gy), mat, 4 + bias, g);
  }
  return [F.x(tip[0], tip[1]), F.y(tip[0], tip[1])];
}

/** A tiny rainbow sparkle at a raster point: a coloured pixel with a white heart, or a small cross when `big`. */
function sparkle(r: Raster, x: number, y: number, col: number, hot: number, g: number, big = false): void {
  if (big) {
    r.dot(x - 1, y, col, 3, g); r.dot(x + 1, y, col, 3, g); r.dot(x, y - 1, col, 3, g); r.dot(x, y + 1, col, 3, g);
    r.dot(x, y, hot, 3, g);
  } else r.dot(x, y, col, 3, g);
}

/** A cut gem outline of `n` sides round (cx, cy), `rx` by `ry`, turned by `rot`. */
function gem(cx: number, cy: number, rx: number, ry: number, n: number, rot = 0): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return pts;
}

/** Facets fanning from (cx, cy) to each edge of an outline, toned in turn (shifted by `turn`) so the stone seems to rotate. */
function facets(r: Raster, F: Xf, pts: number[], cx: number, cy: number, mat: number, g: number, tones: number[], turn: number, bias = 0): void {
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    r.fill(F.poly([cx, cy, pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1]]), mat, {
      group: g, flat: tones[wrap(i + turn, tones.length)], toneBias: bias, noLine: i > 0,
    });
  }
}

// -----------------------------------------------------------------------------
// Prism Maul
// -----------------------------------------------------------------------------

function prismMaul(): WeaponArt {
  // A slate haft studded with crystal; the head is a lump of dark geode cracked open on its flank to show
  // a rainbow heart, crystal shards bursting out of it, the biggest cluster forming the striking face.
  return {
    tip: 31,
    grip2: 10,
    mats: {
      haft: material(polished((x) => (wrap(x, 3.2) < 0.5 ? -1 : 0))), rock: material(rock(3.2, 0.07, 2)), band: material(polished()),
      crystal: material(quartz()), core: material({ base: CORE, glow: true }),
      ...Object.fromEntries(Object.entries(rainMats('')).map(([k, v]) => [k, material(v)])),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4, b = o.toneBias ?? 0;
      const cr = m('crystal');
      fillAll(r, [t.cap(-9, 0, 23, 0, 1.25, 1.15)], m('haft'), o, 1);
      // A crystal pommel and studs set down the haft, one catching a rainbow each frame.
      shard(r, t, -9, 0, Math.PI, 3, 1.3, cr, g, b, false);
      fillAll(r, [t.rect(-8.4, 0, 0.7, 1.6), t.rect(2.2, 0, 0.5, 1.45), t.rect(20.8, 0, 0.9, 1.7)], m('band'), o, 0.8);
      const studs = [-4.6, -1.6, 6, 12, 18];
      for (const [i, x] of studs.entries()) {
        r.fill(t.poly([x - 0.9, 0, x, 1.1, x + 0.9, 0, x, -1.1]), cr, { group: g, flat: 3, toneBias: b });
        r.dot(t.x(x - 0.2, 0.3), t.y(x - 0.2, 0.3), (i + ph) % 5 === 0 ? m(rk('', i + ph)) : cr, 4, g);
      }
      // Shards bursting out of the head: the striking face (-y), the back (+y) and the crown (+x).
      const S = 40;
      const tips: [number, number][] = [];
      tips.push(shard(r, t, 22.6, -2.6, -Math.PI / 2 - 0.6, 6.4, 1.8, cr, S, b));
      tips.push(shard(r, t, 29.2, -2.6, -Math.PI / 2 + 0.5, 6.8, 1.9, cr, S + 1, b));
      tips.push(shard(r, t, 25.8, -3, -Math.PI / 2 - 0.05, 9.2, 2.5, cr, S + 2, b));
      tips.push(shard(r, t, 24, 3, Math.PI / 2 + 0.4, 5.6, 1.7, cr, S + 3, b));
      tips.push(shard(r, t, 28.4, 2.8, Math.PI / 2 - 0.3, 4.6, 1.5, cr, S + 4, b));
      tips.push(shard(r, t, 30, 0.4, 0.1, 3.8, 1.5, cr, S + 5, b));
      // The geode lump, angular, and the hollow in its flank lined with small crystal teeth.
      const lump = t.poly([21, -2, 22.6, -3.6, 26, -4, 29.4, -3.4, 30.8, -1.2, 30.6, 1.8, 29.2, 3.6, 25.6, 4, 22.4, 3.4, 20.8, 1.4]);
      fillAll(r, [lump], m('rock'), o, 1.8);
      const hx = 25.8, hy = 0;
      const hollow = gem(hx, hy, 2.5, 2.3, 7, 0.3 + ph * 0.1);
      r.fill(t.poly(hollow), m('rock'), { group: g, flat: 0, toneBias: b, noLine: true });
      for (let i = 0; i < 7; i++) {
        const a = 0.3 + (i / 7) * Math.PI * 2;
        const px = hx + Math.cos(a) * 1.9, py = hy + Math.sin(a) * 1.8;
        r.dot(t.x(px, py), t.y(px, py), cr, (i + ph) % 3 === 0 ? 4 : 2, g);
      }
      // The rainbow heart: a white core with the spectrum wheeling round it.
      r.fill(t.poly(gem(hx, hy, 1.2, 1.2, 4, Math.PI / 4)), m('core'), { group: g });
      for (let k = 0; k < 4; k++) {
        const a = k * Q + ph * 0.5;
        r.dot(t.x(hx + Math.cos(a) * 1.3, hy + Math.sin(a) * 1.3), t.y(hx + Math.cos(a) * 1.3, hy + Math.sin(a) * 1.3), m(rk('', k + ph)), 3, g);
      }
      // A rainbow glint hopping from shard tip to shard tip.
      const [sx, sy] = tips[[2, 1, 4, 0][ph]];
      sparkle(r, sx, sy, m(rk('', ph * 2)), m('core'), g, ph % 2 === 0);
    },
  };
}

// -----------------------------------------------------------------------------
// Facet Ward
// -----------------------------------------------------------------------------

/** The shield's crystal field (local x down the shield, y across), as a gem outline. */
const WARD = [-7.4, -4.6, -8.2, 0, -7.4, 4.6, -2, 5.2, 5.2, 2.5, 9.4, 0, 5.2, -2.5, -2, -5.2];
/** The slate frame's outline, its corners cut hard. */
const WARD_RIM = [-8.6, -6.2, -10.2, -3.4, -10.2, 3.4, -8.6, 6.2, -2, 6.8, 6.2, 3.5, 12, 0, 6.2, -3.5, -2, -6.8];

function facetWard(): WeaponArt {
  // A slate kite set with interlocking crystal facets like a leaded window, crystal points jutting from its
  // corners; a prism at its heart throws rainbow glints that run round the frame.
  return {
    tip: 10.5,
    mats: {
      rim: material(polished()), crystal: material(quartz()), lead: material({ base: SLATE_HI[1], ramp: SLATE_HI }),
      core: material({ base: CORE, glow: true }),
      ...Object.fromEntries(Object.entries(rainMats('')).map(([k, v]) => [k, material(v)])),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4, b = o.toneBias ?? 0;
      const cr = m('crystal');
      // Crystal points jutting from the top corners and the shoulders, behind the frame.
      shard(r, t, -8.4, -5, Math.PI + 0.85, 4.2, 1.3, cr, g, b);
      shard(r, t, -8.4, 5, Math.PI - 0.85, 4.2, 1.3, cr, g, b);
      shard(r, t, -9.4, 0, Math.PI, 3, 1.2, cr, g, b);
      fillAll(r, [t.poly(WARD_RIM)], m('rim'), o, 1.4);
      // The facets: a ring of panes round the prism, toned like cut stone; one flares white each frame.
      const cx = -0.6, cy = 0;
      const inner = gem(cx, cy, 2.6, 2.2, 8, Math.PI / 8);
      const n = WARD.length / 2;
      const tones = [3, 2, 1, 2, 3, 1, 2, 1];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        // Each outer pane joins two rim corners to the inner ring.
        const ai = Math.atan2(WARD[i * 2 + 1] - cy, WARD[i * 2] - cx), aj = Math.atan2(WARD[j * 2 + 1] - cy, WARD[j * 2] - cx);
        const pi = [cx + Math.cos(ai) * 2.6, cy + Math.sin(ai) * 2.2], pj = [cx + Math.cos(aj) * 2.6, cy + Math.sin(aj) * 2.2];
        const flare = wrap(ph * 2 + 1, n) === i;
        r.fill(t.poly([WARD[i * 2], WARD[i * 2 + 1], WARD[j * 2], WARD[j * 2 + 1], ...pj, ...pi]), cr, {
          group: g, flat: flare ? 4 : tones[i], toneBias: b, noLine: true,
        });
      }
      // Slate leading between the panes.
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(WARD[i * 2 + 1] - cy, WARD[i * 2] - cx);
        r.line(t.x(WARD[i * 2], WARD[i * 2 + 1]), t.y(WARD[i * 2], WARD[i * 2 + 1]), t.x(cx + Math.cos(a) * 2.4, cy + Math.sin(a) * 2), t.y(cx + Math.cos(a) * 2.4, cy + Math.sin(a) * 2), m('lead'), 1, g);
      }
      // The prism: a slate setting, a cut crystal turning its bright facet, a white heart.
      r.fill(t.poly(inner), m('lead'), { group: g, flat: 1, toneBias: b, noLine: true });
      const prism = gem(cx, cy, 1.9, 1.7, 6, ph * (Math.PI / 12));
      facets(r, t, prism, cx, cy, cr, g, [4, 3, 2, 1, 2, 3], ph, b);
      r.dot(t.x(cx, cy), t.y(cx, cy), m('core'), 3, g);
      // Rainbow glints thrown round the frame: three running along it, a step each frame.
      const rim = WARD_RIM, rn = rim.length / 2;
      for (let k = 0; k < 3; k++) {
        const u = wrap(k / 3 + ph / 12, 1) * rn, e = Math.floor(u), f = u - e, e2 = (e + 1) % rn;
        const x = rim[e * 2] + (rim[e2 * 2] - rim[e * 2]) * f, y = rim[e * 2 + 1] + (rim[e2 * 2 + 1] - rim[e * 2 + 1]) * f;
        const ix = x + (cx - x) * 0.06, iy = y + (cy - y) * 0.06;
        sparkle(r, t.x(ix, iy), t.y(ix, iy), m(rk('', k * 2 + ph)), m('core'), g, k === ph % 3);
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Heart of the Prism
// -----------------------------------------------------------------------------

/** A gem-cut heart (centre near the origin, about 5.6 across each way at s = 1). */
const HEART = [0, 2.8, -2.2, 4.8, -4.6, 4.2, -5.6, 1.6, -3.8, -2.4, 0, -6.2, 3.8, -2.4, 5.6, 1.6, 4.6, 4.2, 2.2, 4.8];
const heartPts = (s: number) => HEART.map((v) => v * s);
const HEART_TONES = [4, 3, 3, 2, 1, 1, 2, 2, 3, 2];

const PM = mats({
  crystal: quartz(), core: { base: CORE, glow: true }, lilac: hue(0x9a6aff), cyan: { base: CYAN, glow: true },
  ...rainMats(''),
} as Record<string, MaterialSpec>);
const rain = (k: number) => PM[rk('', k)];

const heartCore: ProjArt = {
  frames: 8,
  outline: true,
  draw(r, t0, f, h) {
    // A crystal heart floating at the shoulder, turning (it narrows as it swings edge-on and its bright
    // facet moves round), its white core pulsing, three small shards orbiting and flashing rainbow colours.
    const turn = [1, 0.86, 0.62, 0.86, 1, 0.86, 0.62, 0.86][f];
    const t = new Xf(t0.ox, t0.oy, 0, 1, 1), H = new Xf(t0.ox, t0.oy, 0, turn * (f < 4 ? 1 : -1), 1);
    const orbit = (back: boolean) => {
      for (let k = 0; k < 3; k++) {
        const a = (f / 8) * Math.PI * 2 + (k * Math.PI * 2) / 3;
        if ((Math.sin(a) > 0) !== back) continue;
        const x = Math.cos(a) * 8.4, y = Math.sin(a) * 2.6 - 0.6 + k * 0.6;
        shard(r, t, x, y - 1.4, Math.PI / 2, 2.8, 1, h(PM.crystal), back ? 1 : 4, back ? -1 : 0, false);
        r.dot(t.x(x, y), t.y(x, y), h(Math.cos(a * 2) > 0.3 ? rain(k * 2 + f) : PM.crystal), 3, back ? 1 : 4);
      }
    };
    orbit(true);
    const pts = heartPts(1);
    facets(r, H, pts, 0, 0.6, h(PM.crystal), 2, HEART_TONES, f);
    const pulse = f % 4 < 2;
    r.fill(H.poly(gem(0, 0.6, pulse ? 2.4 : 2, pulse ? 2.4 : 2, 4, Math.PI / 4)), h(PM.lilac), { group: 3 });
    r.fill(H.poly(gem(0, 0.6, pulse ? 1.3 : 0.9, pulse ? 1.3 : 0.9, 4, Math.PI / 4)), h(PM.core), { group: 3 });
    r.dot(t.x(-1.6 * turn, 2.4), t.y(-1.6 * turn, 2.4), h(rain(f)), 3, 3);
    orbit(false);
  },
};

const heartOfThePrism: SkinArt = {
  mats: {
    // Stock names: anything drawn the stock way burns in crystal light.
    ember: { base: CYAN, glow: true }, emberHot: { base: CORE, glow: true }, emberDeep: { base: LILAC, glow: true },
    'k.crystal': quartz(), 'k.slate': polished(), 'k.core': { base: CORE, glow: true }, 'k.lilac': hue(0x9a6aff),
    ...rainMats('k.'),
  },
  glow: [0xf4f8ff, 0xa080f0],
  icon(r, t, m) {
    // The crystal heart, its facets cut sharp round a white core, throwing a spectrum out behind it,
    // with three small shards caught in orbit.
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * 0.18 + (k * Math.PI) / 3.4, c = Math.cos(a), s = Math.sin(a);
      r.line(t.x(c * 8.6, s * 8.6), t.y(c * 8.6, s * 8.6), t.x(c * 13, s * 13), t.y(c * 13, s * 13), m(`k.r${k}`), 3, 1);
    }
    shard(r, t, -10.6, -2.4, Math.PI / 2 + 0.3, 4.4, 1.4, m('k.crystal'), 2, -1);
    const pts = heartPts(1.45);
    facets(r, t, pts, 0, 1, m('k.crystal'), 3, HEART_TONES, 0);
    r.fill(t.poly(gem(0, 1, 3, 3, 4, Math.PI / 4)), m('k.lilac'), { group: 3 });
    r.fill(t.poly(gem(0, 1, 1.7, 1.7, 4, Math.PI / 4)), m('k.core'), { group: 3 });
    r.dot(t.x(-2.6, 4.6), t.y(-2.6, 4.6), m('k.crystal'), 4, 3);
    shard(r, t, 9.8, -4.6, Math.PI / 2 - 0.3, 4, 1.3, m('k.crystal'), 4);
    shard(r, t, 6.6, -10.4, 0.2, 3.4, 1.1, m('k.crystal'), 5);
    sparkle(r, t.x(11.4, 0.2), t.y(11.4, 0.2), m('k.r2'), m('k.core'), 4, true);
    sparkle(r, t.x(-7.8, -9.6), t.y(-7.8, -9.6), m('k.r4'), m('k.core'), 4, true);
  },
  proj: { core: heartCore },
};

// -----------------------------------------------------------------------------
// Crystal Crown
// -----------------------------------------------------------------------------

function crystalCrown(): SkinArt {
  // A band of polished slate set with a crown of jagged crystal spires of uneven height, a rainbow glint
  // running along their tips from back to front, and a cut prism at the brow.
  return {
    head: () => ({
      mats: {
        'h.slate': material(polished()), 'h.crystal': material(quartz()), 'h.core': material({ base: CORE, glow: true }),
        ...Object.fromEntries(Object.entries(rainMats('h.')).map(([k, v]) => [k, material(v)])),
      },
      draw(r, H, m, g) {
        const ph = r.phase % 4, cr = m('h.crystal');
        // Spires standing on the band, back to front: x, height, lean, half width, far-side shade.
        const spires: [number, number, number, number, number][] = [
          [-5, 4.4, 0.55, 1.2, -1], [-2.8, 7, 0.28, 1.4, 0], [-0.4, 5, 0.1, 1.3, 0], [1.8, 9, -0.05, 1.6, 0],
          [4.2, 6, -0.25, 1.4, 0], [6.2, 3.4, -0.6, 1.1, 0],
        ];
        const tips = spires.map(([x, h, lean, w, b], i) => shard(r, H, x, 3.4 + x * 0.09, Math.PI / 2 + lean, h, w, cr, g + (i % 2), b));
        r.fill(H.cap(-6.4, 2.2, 6.6, 3.4, 0.75), m('h.slate'), { group: g, bevel: 1, local: H });
        // The brow prism.
        const bx = 5.8, by = 3.1;
        facets(r, H, gem(bx, by, 1.3, 1.5, 6, Math.PI / 6), bx, by, cr, g, [4, 3, 2, 1, 2, 3], ph);
        r.dot(H.x(bx, by), H.y(bx, by), m('h.core'), 3, g);
        // The glint runs along the spire tips, one a frame, in a new colour each time.
        const k = [1, 2, 3, 4][ph];
        sparkle(r, tips[k][0], tips[k][1] + 1, m(rk('h.', ph * 2 + 1)), m('h.core'), g, true);
        r.dot(tips[(k + 2) % 6][0], tips[(k + 2) % 6][1] + 1, m(rk('h.', ph * 2 + 4)), 3, g);
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Crystalline Carapace
// -----------------------------------------------------------------------------

function crystallineCarapace(): SkinArt {
  // Geode-rock plates veined with crystal, a slate pauldron on each shoulder split open by crystal shards,
  // a crown of great shards erupting from the back, and a cut crystal heart blazing in the chest.
  return {
    mats: {
      thorn: { base: SLATE[2], ramp: [...SLATE, VEIN], tex: (x, y, ph) => (wrap(y + x * 0.35, 4.2) < 0.5 ? -1 : 0) + geode(4, 0, 1)(x, y, ph) },
      thornDark: polished(), thornSpike: quartz(),
      'k.rock': rock(3.4, 0, 3), 'k.slate': polished(), 'k.crystal': quartz(), 'k.core': { base: CORE, glow: true }, 'k.lilac': hue(0x9a6aff),
      ...rainMats('k.'),
    },
    chest: {
      pauldron: null, spikes: null, sleeve: 'thorn', sleeveLen: 1,
      back(r, T, m, c) {
        const top = c.top, ph = r.phase % 4, cr = m('k.crystal');
        // Shards erupting from the upper back, fanning up and back, each its own outline group.
        const fan: [number, number, number, number, number, number][] = [
          [-1.8, top - 0.4, Math.PI * 0.62, 10, 2.1, -1], [-2.8, top - 1.6, Math.PI * 0.76, 11.5, 2.4, 0],
          [-3.4, top - 4, Math.PI * 0.9, 9.6, 2.1, 0], [-3.4, top - 7, Math.PI * 1.02, 6.4, 1.7, -1],
        ];
        const tips = fan.map(([x, y, a, len, w, b], i) => shard(r, T, x, y, a, len, w, cr, 40 + i, b));
        // A rock ridge they burst out of.
        r.fill(T.poly([-1, top + 0.4, -4, top - 1, -4.6, top - 6, -4, top - 10, -1.4, top - 9]), m('k.rock'), { group: c.g, bevel: 1.4, toneBias: -1, local: T });
        const [sx, sy] = tips[[1, 0, 2, 1][ph]];
        sparkle(r, sx, sy + 1, m(rk('k.', ph * 2)), m('k.core'), c.g, ph !== 3);
      },
      shoulder(r, S, m, c) {
        // A geode pauldron cracked open by two shards, a glint in the crack.
        const o = { group: c.g, toneBias: c.bias };
        const cr = m('k.crystal');
        if (!c.far) {
          shard(r, S, -1.6, 1.6, Math.PI * 0.82, 7.4, 1.9, cr, 45, c.bias);
          shard(r, S, -0.6, 2.6, Math.PI * 0.66, 5.4, 1.5, cr, 46, c.bias);
        } else shard(r, S, -1.2, 2, Math.PI * 0.8, 6, 1.7, cr, 45, c.bias);
        r.fill(S.poly([-3.4, 0.4, -2.8, 2.4, -0.6, 3.4, 2.2, 3, 3.4, 1, 2.6, -1.4, -0.4, -1.8, -2.8, -1.2]), m('k.rock'), { ...o, bevel: 1.6, local: S });
        if (!c.far) r.dot(S.x(0.4, 1), S.y(0.4, 1), m(rk('k.', r.phase % 4 + 2)), 3, c.g);
      },
      over(r, T, m, c) {
        // The heart: a cut crystal set in a ring of slate, its bright facet turning, a rainbow glint at its edge.
        const x = c.body.chestPush * 0.7 + 1.2, y = c.top - 4.4, ph = r.phase % 4;
        r.fill(T.poly(gem(x, y, 2.5, 2.9, 6, Math.PI / 2)), m('k.slate'), { group: c.g, bevel: 1 });
        facets(r, T, gem(x, y, 1.6, 2, 6, Math.PI / 2), x, y, m('k.crystal'), c.g, [4, 3, 2, 1, 2, 3], ph);
        r.fill(T.poly(gem(x, y, 1, 1.3, 4, Math.PI / 2)), m('k.lilac'), { group: c.g });
        r.dot(T.x(x, y), T.y(x, y), m('k.core'), 3, c.g);
        // Crystal veins running out from the heart through the rock.
        for (const [dx, dy] of [[-2.6, 3.4], [-3.6, -2.2], [-1.2, -5.4]] as const) {
          r.line(T.x(x - 1.2, y + Math.sign(dy) * 1.6), T.y(x - 1.2, y + Math.sign(dy) * 1.6), T.x(x + dx, y + dy), T.y(x + dx, y + dy), m('k.crystal'), 2, c.g);
        }
        const a = Math.PI / 2 + ph * Q;
        r.dot(T.x(x + Math.cos(a) * 1.9, y + Math.sin(a) * 2.3), T.y(x + Math.cos(a) * 1.9, y + Math.sin(a) * 2.3), m(rk('k.', ph * 2 + 1)), 3, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Geode Legguards
// -----------------------------------------------------------------------------

function geodeLegguards(): SkinArt {
  // Slate rock plates threaded with crystal veins, an angular tasset over the hip, and a cluster of crystal
  // shards breaking out of the knee, a rainbow glint moving between them.
  return {
    mats: {
      runeLeg: rock(3.8, 0, 5), runeDark: polished(), runeGlow: { base: CYAN, glow: true },
      'l.plate': { base: SLATE[2], ramp: [...SLATE, VEIN], tex: geode(3.6, 0, 6) }, 'l.slate': polished(),
      'l.crystal': quartz(), 'l.core': { base: CORE, glow: true },
      ...rainMats('l.'),
    },
    legs: {
      mat: 'runeLeg', trim: 'runeDark', knee: null, tasset: null, rune: null, wraps: null, bulk: 0.3,
      over(r, t, m, c) {
        const ph = r.phase % 4, L = c.len, w = c.w, cr = m('l.crystal');
        const o = { group: c.g + 20, toneBias: c.bias };
        // The tasset: an angular slate plate from the belt, a crystal vein down its face.
        const x1 = L * 0.5;
        r.fill(t.poly([L + 1.4, -w - 0.5, L + 1.4, w + 1.3, x1 + 1.2, w + 1.6, x1, w * 0.3, x1 + 0.8, -w - 0.4]), m('l.plate'), { ...o, group: c.g + 21, bevel: 1.4, local: t });
        r.line(t.x(L + 0.6, w * 0.6), t.y(L + 0.6, w * 0.6), t.x(x1 + 1.4, w + 0.6), t.y(x1 + 1.4, w + 0.6), cr, c.far ? 2 : 3, c.g + 21);
        // The knee: a slate cop, crystals breaking out of it forward and up.
        const kx = 0.4, ky = w * 0.3;
        const tips: [number, number][] = [];
        tips.push(shard(r, t, kx + 0.8, ky + 1.2, 0.85, 7, 1.8, cr, c.g + 22, c.bias));
        if (!c.far) tips.push(shard(r, t, kx - 0.8, ky + 1.4, 1.55, 5.4, 1.5, cr, c.g + 23, c.bias));
        tips.push(shard(r, t, kx + 2.4, ky, 0.3, 4.6, 1.3, cr, c.g + 24, c.bias - 1));
        r.fill(t.poly(gem(kx, ky, c.body.kneeR + 0.5, c.body.kneeR + 0.3, 6, 0.3)), m('l.slate'), { ...o, bevel: 1.1 });
        r.dot(t.x(kx, ky), t.y(kx, ky), cr, 4, c.g + 20);
        if (c.far) return;
        const [sx, sy] = tips[ph % tips.length];
        sparkle(r, sx, sy, m(rk('l.', ph * 2 + 3)), m('l.core'), c.g + 22, ph === 0);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Geode Stompers
// -----------------------------------------------------------------------------

function geodeStompers(): SkinArt {
  // Heavy boots of slate rock veined with crystal, a cracked rock cuff, crystal clusters growing out of the
  // toe and heel, and rainbow glints hopping between their tips.
  return {
    mats: {
      colossus: { base: SLATE[2], ramp: [...SLATE, VEIN], tex: geode(3.6, 0, 8) }, colossusDark: polished(),
      'k.rock': rock(3.2, 0, 9), 'k.crystal': quartz(), 'k.core': { base: CORE, glow: true },
      ...rainMats('k.'),
    },
    boots: {
      over(r, shin, foot, m, c) {
        const ph = r.phase % 4, w = c.w, cr = m('k.crystal');
        const o = { group: c.g, toneBias: c.bias };
        // A cracked rock cuff round the top of the boot.
        r.fill(shin.poly([c.top - 1.4, -w - 0.7, c.top + 0.6, -w - 0.4, c.top + 1.2, -w * 0.2, c.top + 0.7, w + 0.6, c.top - 1.2, w + 0.8, c.top - 0.6, 0]), m('k.rock'), { ...o, bevel: 1.2, local: shin });
        const tips: [number, number][] = [];
        // The toe cluster: shards growing forward and up.
        if (!c.far) tips.push(shard(r, foot, c.toe - 3.4, 2.2, 1.35, 5.4, 1.4, cr, c.g + 32, c.bias - 1));
        tips.push(shard(r, foot, c.toe - 1.8, 1.6, 0.95, 6.6, 1.8, cr, c.g + 30, c.bias));
        tips.push(shard(r, foot, c.toe - 0.4, 0.6, 0.35, 4.6, 1.4, cr, c.g + 31, c.bias));
        // The heel cluster: shards raking back and up.
        tips.push(shard(r, foot, -1, 1.8, Math.PI - 0.95, 6.2, 1.7, cr, c.g + 33, c.bias));
        tips.push(shard(r, foot, -1.6, 0.6, Math.PI - 0.35, 4.4, 1.3, cr, c.g + 34, c.bias - 1));
        if (c.far) return;
        // Rainbow glints hop from tip to tip.
        const [sx, sy] = tips[[0, 3, 1, 2][ph] % tips.length];
        sparkle(r, sx, sy, m(rk('k.', ph * 2)), m('k.core'), c.g + 30, ph % 2 === 0);
        const [qx, qy] = tips[[3, 1, 4, 0][ph] % tips.length];
        r.dot(qx, qy, m(rk('k.', ph * 2 + 3)), 3, c.g + 30);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = {
  ring: css(CYAN), vertex: css(0xffffff), lilac: css(LILAC), lit: css(0xeefaff), dark: css(0x7c6cb4),
  rain: RAIN.map((c) => css(c)),
};
/** The orbiting shards: height above the feet, orbit radius, speed (signed), phase. */
const ORBIT: [number, number, number, number][] = [
  [8, 19, 1.3, 0], [18, 17, -0.9, 2.1], [27, 16, 1.05, 4.2], [13, 21, -1.2, 1], [33, 13, 1.5, 3.3],
];

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function prismheartAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  const RX = 15, RY = 3.8, back = layer === 'back';
  // A faceted ring of light on the ground: an octagon, its vertices bright, a pulse running round it.
  const N = 8, spin = t * 0.25;
  const run = Math.floor(t * 10) % 24;
  for (let i = 0; i < N; i++) {
    const a0 = spin + (i / N) * Math.PI * 2, a1 = spin + ((i + 1) / N) * Math.PI * 2;
    const x0 = Math.cos(a0) * RX, y0 = Math.sin(a0) * RY, x1 = Math.cos(a1) * RX, y1 = Math.sin(a1) * RY;
    for (let k = 0; k < 3; k++) {
      const u = k / 3, px = x0 + (x1 - x0) * u, py = y0 + (y1 - y0) * u;
      if ((py < 0) !== back) continue;
      if (k === 0) { g.globalAlpha = 0.9; g.fillStyle = AC.vertex; }
      else { g.globalAlpha = (i * 3 + k) % 24 === run || (i * 3 + k + 12) % 24 === run ? 0.95 : 0.45; g.fillStyle = AC.ring; }
      g.fillRect(Math.round(x + px), Math.round(y + py), 1, 1);
    }
  }
  g.globalAlpha = 0.35;
  g.fillStyle = AC.lilac;
  ring(g, x, y, RX - 3, RY - 1, 16, layer, (g, px, py, i) => { if (i % 2) g.fillRect(px, py, 1, 1); });
  g.globalAlpha = 1;
  // Now and then a vertex throws a rainbow spark: a coloured cross, rising a little.
  const tick = Math.floor(t * 4);
  for (let k = 0; k < 2; k++) {
    const seed = tick * 2 + k;
    if (hash(seed, 31) < 0.45) continue;
    const i = Math.floor(hash(seed, 57) * N), a = spin + (i / N) * Math.PI * 2;
    const s = Math.sin(a);
    if ((s < 0) !== back) continue;
    const u = t * 4 - tick;
    const px = Math.round(x + Math.cos(a) * RX), py = Math.round(y + s * RY - u * 3);
    g.fillStyle = AC.rain[Math.floor(hash(seed, 91) * 6)];
    g.fillRect(px - 1, py, 3, 1); g.fillRect(px, py - 1, 1, 3);
    g.fillStyle = AC.vertex; g.fillRect(px, py, 1, 1);
  }
  // Crystal shards orbiting at different heights and speeds, turning as they go: a lit facet, a lilac
  // facet, and a rainbow flash as each turns its face to the light.
  for (const [k, [h, R, sp, p0]] of ORBIT.entries()) {
    const a = p0 + t * sp, s = Math.sin(a);
    if ((s < 0) !== back) continue;
    const px = Math.round(x + Math.cos(a) * R), py = Math.round(y - h + s * 2.4 + Math.sin(t * 2 + k) * 1.2);
    const face = Math.cos(a * 2 + t * 3 + k);
    // The diamond: a tall centre column, and shorter columns either side; the facet facing the light swaps as it turns.
    const lit = face > 0 ? -1 : 1;
    g.fillStyle = AC.vertex;
    g.fillRect(px, py - 3, 1, 7);
    g.fillStyle = AC.lit;
    g.fillRect(px + lit, py - 2, 1, 5);
    g.fillStyle = AC.dark;
    g.fillRect(px - lit, py - 2, 1, 5);
    g.fillStyle = back ? AC.dark : AC.lilac;
    g.fillRect(px - 2 * lit, py - 1, 1, 3);
    g.fillStyle = AC.lit;
    g.fillRect(px + 2 * lit, py - 1, 1, 3);
    if (Math.abs(face) > 0.7) {
      g.fillStyle = AC.rain[(k + Math.floor(t * 3)) % 6];
      g.fillRect(px, py - 1, 1, 2);
    }
  }
}

export const PRISMHEART: Record<string, SkinArt> = {
  'warhammer.prism': { weapon: prismMaul, ...FX },
  'kite_shield.facet': { weapon: facetWard, ...FX },
  'ember_core.prism': heartOfThePrism,
  'chrono_circlet.crystal': crystalCrown(),
  'thornmail.crystalline': crystallineCarapace(),
  'runed_leggings.geode': geodeLegguards(),
  'colossus_boots.geode': geodeStompers(),
};
