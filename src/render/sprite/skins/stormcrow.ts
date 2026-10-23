import { css } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { ring, type Layer } from '../../auraKit';
import { chainLine, fillAll, hangAt, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, mats, wrap } from './kit';

/**
 * Mythic set: Stormcrow. A thief who runs with the storm: raven-black
 * feathers with a blue-violet sheen, polished silver talons and trims, and
 * storm-blue light in the eyes, gems and edges. A murder of crows circles in
 * the thundercloud overhead. Night accents: the storm gems and the blade's
 * edge glow, the silver glints, the feathers' sheen catches the light.
 */

/** Raven feathers: near black, a blue-violet sheen on the top tones. */
const FEATHER = [0x0a0a14, 0x1a1c30, 0x2e3254, 0x4a5688, 0x8a9cd8];
/** Polished silver. */
const SILVER = [0x262a36, 0x50586a, 0x8c96aa, 0xc8d2e2, 0xffffff];
/** Black leather. */
const LEATHER = [0x141218, 0x24202c, 0x3a3444, 0x56506a, 0x807898];
/** Storm-blue cloth. */
const STORMCLOTH = [0x0e1430, 0x1a2652, 0x2a3c7c, 0x4460a8, 0x7a9ad8];
/** Storm light. */
const STORM = 0x8ad8ff, STORM_HOT = 0xf0ffff;

/** Barbs down a feather (any space): a darker line now and then. */
const barbs: Tex = (x, y) => (wrap(x * 0.8 - y * 1.1, 1.5) < 0.35 ? -1 : 0);
/** A sheen sliding across the feathers. */
const sheen: Tex = (x, y, ph) => (wrap(x * 0.6 + y * 0.4 - ph * 1.5, 9) < 1 ? 1 : barbs(x, y, ph));
/** Small glints on polished silver. */
const glint: Tex = (x, y) => (hash(Math.floor(x * 1.3), Math.floor(y * 1.3)) < 0.05 ? 1 : 0);

const S = {
  feather: (tex: Tex | undefined = sheen): MaterialSpec => ({ base: FEATHER[2], ramp: FEATHER, shiny: true, step: 0.13, tex }),
  silver: (tex: Tex | undefined = glint): MaterialSpec => ({ base: SILVER[2], ramp: SILVER, shiny: true, step: 0.15, tex }),
  leather: (tex?: Tex): MaterialSpec => ({ base: LEATHER[2], ramp: LEATHER, tex }),
  storm: (): MaterialSpec => ({ base: STORM, glow: true }),
  hot: (): MaterialSpec => ({ base: STORM_HOT, glow: true }),
};

/** Storm-blue sparkles off the dark pieces; a swing trails pale lightning. */
const FX = { ...epicFx(0xb8ecff, 0x3a4a9a, 'twinkle'), trail: [0xd8f4ff, 0x4a6ac8] as [number, number] };

/** Particles the full set sheds in battle: storm sparks and dark feathers. */
export const STORMCROW_FX: SkinFx = { spark: 0xb8ecff, spark2: 0x2a2e4a, kind: 'twinkle' };

/** A feather in frame F: quill at (x, y), pointing along angle `a`, `len` long, `w` wide, a notch near the tip. */
function feather(F: Xf, x: number, y: number, a: number, len: number, w: number): Shape {
  const c = Math.cos(a), s = Math.sin(a);
  const p = (u: number, v: number) => [x + c * u - s * v, y + s * u + c * v];
  return F.poly([...p(0, 0), ...p(len * 0.3, w), ...p(len * 0.78, w * 0.8), ...p(len, 0.1), ...p(len * 0.86, -w * 0.4), ...p(len * 0.82, -w * 0.9), ...p(len * 0.3, -w * 0.8)]);
}

/** Outline groups for pieces drawn over the body (as armour2.ts). */
const GA = 60;

const ln = (r: Raster, F: Xf, ax: number, ay: number, bx: number, by: number, mat: number, tone: number, g: number) =>
  r.line(F.x(ax, ay), F.y(ax, ay), F.x(bx, by), F.y(bx, by), mat, tone, g);
const dt = (r: Raster, F: Xf, x: number, y: number, mat: number, tone: number, g: number) => r.dot(F.x(x, y), F.y(x, y), mat, tone, g);

// -----------------------------------------------------------------------------
// Crowbeak Cleaver (bloodletter)
// -----------------------------------------------------------------------------

function crowbeakCleaver(): WeaponArt {
  // A long black blade that thickens and hooks down at the end like a raven's beak, a silver edge with a
  // thread of storm light along it, a guard of silver feathers fanned out, a storm gem in the pommel.
  return {
    tip: 30,
    mats: {
      blade: material(S.feather((x, _y, ph) => (wrap(x * 0.5 - ph * 1.6, 10) < 0.9 ? 1 : 0))), edge: material(S.silver(undefined)),
      bolt: material(S.storm()), guard: material(S.silver()), grip: material(S.leather((x) => (wrap(x * 1.2, 1.4) < 0.4 ? -1 : 0))),
      gem: material(S.hot()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-5.6, 0, -0.8, 0, 1.2, 1.05)], m('grip'), o, 1);
      fillAll(r, [t.poly([-6, -1.3, -8.6, 0, -6, 1.3, -5.4, 0])], m('guard'), o, 1);
      dt(r, t, -6.6, 0, m('gem'), 4, g);
      // The silver edge first, peeking under the black: then the beak blade over it.
      fillAll(r, [t.poly([2, -1.4, 22, -2.2, 27, -3, 29.6, -4.6, 28.4, -2.4, 24, -1.2, 2, -0.6])], m('edge'), o, 1);
      fillAll(r, [t.poly([1.8, -1, 14, -1.6, 22, -1.8, 26.6, -2.6, 29.4, -4.2, 28.8, -1.4, 26.4, 1.2, 20, 2.4, 10, 2, 1.8, 1.4])], m('blade'), o, 1.5);
      r.line(t.x(3, -1.2), t.y(3, -1.2), t.x(23, -2), t.y(23, -2), m('bolt'), 3, g);
      r.line(t.x(23, -2), t.y(23, -2), t.x(27.6, -3.2), t.y(27.6, -3.2), m('bolt'), 4, g);
      // A nostril notch near the tip, like the beak's.
      dt(r, t, 24.8, 0.6, m('blade'), 0, g);
      // The guard: silver feathers fanning up and down from the hilt.
      const fan = [feather(t, 1, 0.8, 1.9, 4.6, 0.9), feather(t, 1, 0.8, 1.4, 4, 0.8), feather(t, 1, -0.8, -1.9, 4.6, 0.9), feather(t, 1, -0.8, -1.4, 4, 0.8)];
      fillAll(r, fan, m('guard'), o, 0.8);
      fillAll(r, [t.rect(1, 0, 0.9, 1.7, 0.4)], m('edge'), o, 0.8);
    },
  };
}

// -----------------------------------------------------------------------------
// Raven Talon (grapnel)
// -----------------------------------------------------------------------------

function ravenTalon(): WeaponArt {
  // A raven's foot cast in black iron: a scaled ankle, three toes curling forward ending in silver claws,
  // a back claw; a chain coiled from the ankle, a storm gem set where the toes meet.
  return {
    tip: 9,
    mats: {
      foot: material(S.feather((x) => (wrap(x * 1.4, 1.3) < 0.35 ? -1 : 0))), claw: material(S.silver(undefined)),
      chain: material(S.silver(undefined)), gem: material(S.storm()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      const H = hangAt(t, -2.6, 0);
      const back = -Math.cos(t.ang) * Math.sign(t.sx || 1);
      const a = t.p(-2.6, 0), e = H.p(6, back * 1.4);
      chainLine(r, a[0], a[1], a[0] + back * 3, a[1] + 3, e[0], e[1], m('chain'), g);
      fillAll(r, [t.cap(-2.6, 0, 3, 0, 0.8, 1)], m('foot'), o, 1);
      // Toes: one straight ahead, two splayed, each hooking down at the end into a claw.
      const toes: [number, number, number, number][] = [[3, 0, 6.6, 0], [3, 0.4, 5.6, 2.6], [3, -0.4, 5.6, -2.6]];
      fillAll(r, toes.map(([x0, y0, x1, y1]) => t.cap(x0, y0, x1, y1, 0.75, 0.55)), m('foot'), o, 0.9);
      fillAll(r, [
        t.poly([6.4, -0.5, 9.2, -0.6, 8, 0.6]), t.poly([5.4, 2.2, 7.4, 3.8, 6.4, 1.8]), t.poly([5.4, -2.2, 7.4, -3.8, 6.4, -1.8]),
        t.poly([-0.6, 0.6, -2, 2.6, -0.4, 1.4]),
      ], m('claw'), o, 0.6);
      dt(r, t, 3, 0, m('gem'), 4, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Murder of Crows (storm cloud)
// -----------------------------------------------------------------------------

const CLOUD: Record<string, MaterialSpec> = {
  'k.scCloud': { base: 0x50587e, ramp: [0x1e2236, 0x343a56, 0x50587e, 0x7480a8, 0xa8b4d8] },
  'k.scCloudDk': { base: 0x282e4a, ramp: [0x0e1020, 0x1a1e34, 0x282e4a, 0x3a4262, 0x56608a] },
  'k.scCrow': { base: 0x0c0c16, ramp: [0x020204, 0x08080e, 0x0c0c16, 0x1c1e30, 0x3a4060] },
  'k.scEye': { base: STORM, glow: true },
  'k.scBolt': { base: STORM, glow: true },
  'k.scHot': { base: STORM_HOT, glow: true },
};
const CM = mats(CLOUD);

/** A crow in flight at (x, y) of F (s its size), wings `flap` up (1) or down (-1), heading +x. */
function crow(r: Raster, F: Xf, x: number, y: number, s: number, flap: number, m: (k: string) => number, g: number, eye = true): void {
  r.fill(union(
    F.ell(x, y, 2.2 * s, 0.9 * s),
    F.poly([x + 1.8 * s, y + 0.3 * s, x + 3.2 * s, y - 0.1 * s, x + 1.8 * s, y - 0.5 * s]),
    F.poly([x - 1.6 * s, y, x - 3.4 * s, y + 0.8 * s, x - 3.4 * s, y - 0.8 * s]),
    F.poly([x - 0.6 * s, y, x + 0.8 * s, y, x - 1.2 * s, y + flap * 3 * s, x - 2.2 * s, y + flap * 2.6 * s]),
  ), m('k.scCrow'), { group: g, bevel: 0.6 });
  if (eye) r.dot(Math.round(F.x(x + 1.4 * s, y + 0.3 * s)), Math.round(F.y(x + 1.4 * s, y + 0.3 * s)), m('k.scEye'), 4, g);
}

/** The thunderhead itself, around (0, 0) of F at scale s: billows over a dark underside. */
function thunderhead(r: Raster, F: Xf, s: number, m: (k: string) => number, g: number): void {
  r.fill(union(F.circ(-6 * s, 0, 4 * s), F.circ(6 * s, 0.4 * s, 3.8 * s), F.cap(-7 * s, -2 * s, 7 * s, -2 * s, 2.8 * s)), m('k.scCloudDk'), { group: g, bevel: 1.6 * s });
  r.fill(union(F.circ(-2.6 * s, 3.4 * s, 5.2 * s), F.circ(3.2 * s, 4 * s, 4.6 * s), F.circ(-7.4 * s, 1.4 * s, 3.2 * s), F.circ(8 * s, 1.8 * s, 3 * s)), m('k.scCloud'), { group: g + 1, bevel: 2.4 * s });
}

/** A forked bolt from (x, y) down `len`, in frame F. */
function fork(r: Raster, F: Xf, x: number, y: number, len: number, m: (k: string) => number, g: number, seed: number): void {
  let px = x, py = y;
  const steps = 4;
  for (let i = 1; i <= steps; i++) {
    const nx = x + (hash(seed, i) - 0.5) * 3, ny = y - (len * i) / steps;
    ln(r, F, px, py, nx, ny, m(i < 3 ? 'k.scHot' : 'k.scBolt'), 3, g);
    px = nx; py = ny;
  }
}

/** Battle sprite: four resting frames (crows circling in the cloud), four charged (lightning forking out under it). */
const crowCloud: ProjArt = {
  frames: 8,
  outline: true,
  draw(r, t, f, h) {
    const m = (k: string) => h(CM[k]);
    const F = new Xf(t.ox, t.oy - 8, 0, 1, 1);
    const k = f & 3, charged = f >= 4;
    thunderhead(r, F, 0.78, m, 1);
    // Three crows circling round the cloud: the ones behind it are hidden, the ones in front pass across.
    for (let i = 0; i < 3; i++) {
      const a = ((k + i * 1.33) / 4) * Math.PI * 2;
      if (Math.sin(a) < -0.2) continue;
      crow(r, F, Math.cos(a) * 9, 2 + Math.sin(a) * 2, 0.75, k % 2 ? 1 : -1, m, 3 + i, true);
    }
    if (charged) {
      fork(r, F, -2 + k, -2.2, 6, m, 6, k);
      fork(r, F, 3 - k * 0.5, -2.2, 5, m, 6, k + 5);
    } else if (k === 2) dt(r, F, 1, 1.4, m('k.scBolt'), 4, 2);
  },
};

const murderOfCrows: SkinArt = {
  mats: { ...CLOUD, cloud: CLOUD['k.scCloud'], cloudDark: CLOUD['k.scCloudDk'], storm: { base: STORM, glow: true }, stormHot: { base: STORM_HOT, glow: true } },
  glow: [0xd8f4ff, 0x3a4a9a],
  icon(r, t, m) {
    const F = new Xf(t.ox, t.oy - 1, 0, 1, 1);
    thunderhead(r, F, 1, m, 1);
    crow(r, F, -9, 9, 1, 1, m, 3);
    crow(r, F, 9.6, 6, 0.85, -1, m, 4);
    fork(r, F, 1.4, -3.4, 11, m, 5, 3);
  },
  proj: { cloud: crowCloud },
};

// -----------------------------------------------------------------------------
// Stormcrow Visage (magpie mask)
// -----------------------------------------------------------------------------

function stormcrowVisage(): SkinArt {
  // A hood of raven feathers swept back into a crest, a sleek black beak mask over the face with a silver
  // brow band, two storm-blue eyes burning in it.
  return {
    head: () => ({
      mats: {
        'h.scFeather': material(S.feather()), 'h.scMask': material(S.feather((x, y, ph) => (wrap(x * 0.5 + y * 0.3 - ph * 1.2, 8) < 0.8 ? 1 : 0))),
        'h.scSilver': material(S.silver()), 'h.scEye': material(S.hot()), 'h.scGem': material(S.storm()),
      },
      hair: true,
      draw(r, H, m, g, sway) {
        const s = sway * 1.8, ph = r.phase % 4, fl = [0, 0.4, 0.7, 0.3][ph];
        // The crest: long feathers swept back off the crown, the far ones darker.
        const crest = [feather(H, -1, 5.6, 2.7 + s * 0.04, 9.6, 1.4), feather(H, -2.4, 4.6, 2.95 + s * 0.05, 10.4 + fl, 1.5), feather(H, -3.2, 2.8, 3.2 + s * 0.06, 9 + fl, 1.3)];
        r.fill(union(...crest), m('h.scFeather'), { group: g, bevel: 1.2, toneBias: -1 });
        // The hood: round over the head, layered feathers down the nape.
        const hood = union(H.ell(-0.6, 1.4, 7.6, 7.4), H.poly([-7.4, 1, -6.8, -6.2, -1.4, -7.2, 2.4, -5]));
        r.fill(hood, m('h.scFeather'), { group: g, bevel: 3, softLight: true });
        for (const [x, y] of [[-6, -2.6], [-5.2, -5], [-3, -6.4]]) r.fill(feather(H, x + 2, y + 2, -2.2, 3.6, 0.9), m('h.scFeather'), { group: g, bevel: 0.8, toneBias: -1 });
        // The mask over the face and its beak, hooking down.
        const mask = intersect(H.ell(1.2, 0.2, 7.6, 7), H.poly([0, 3, 7.6, 2.6, 8, -4.6, 0.6, -5.4]));
        r.fill(mask, m('h.scMask'), { group: GA, bevel: 2 });
        r.fill(H.poly([6.4, 0.8, 11.6, -0.6, 13.4, -2.8, 12.2, -3.2, 6.6, -3]), m('h.scMask'), { group: GA, bevel: 1.2 });
        ln(r, H, 7.2, -1.2, 12, -1.8, m('h.scMask'), 4, GA);
        // The silver brow band with its storm gem.
        r.fill(intersect(H.ell(1.2, 0.2, 7.7, 7.1), H.rect(3.6, 2.5, 5, 0.55)), m('h.scSilver'), { group: GA, bevel: 0.6 });
        dt(r, H, 1.4, 2.6, m('h.scGem'), 4, GA);
        // Eyes of storm light.
        const blink = ph === 3 ? 3 : 4;
        r.fill(H.poly([1.4, 0.2, 3.6, 0.6, 3.6, -0.4, 1.8, -0.6]), m('h.scEye'), { group: GA, flat: blink, noLine: true });
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Raven Mantle (grudge mail)
// -----------------------------------------------------------------------------

function ravenMantle(): SkinArt {
  // Black leather wrapped tight, a mantle of raven feathers over the shoulders falling into a long feathered
  // cape, silver bracers, and a silver clasp with a storm gem at the throat.
  return {
    mats: {
      'k.scLeather': S.leather((x, y) => (wrap(y * 1.1 - x * 0.4, 2.4) < 0.5 ? -1 : 0)), 'k.scFeather': S.feather(),
      'k.scSilver': S.silver(), 'k.scGem': S.storm(), 'k.scStrap': S.leather(undefined),
    },
    chest: {
      torso: 'k.scLeather', sleeve: 'k.scLeather', sleeveLen: 1, forearm: 'k.scSilver', hands: 'k.scStrap', pauldron: null,
      trim: null, belt: 'k.scStrap', cape: null, hood: null, spikes: null, skirt: 0, noScarf: true,
      back(r, T, m, c) {
        // The cape: rows of long feathers falling from the shoulders, lifting in the wind.
        const top = c.top + 0.4, s = c.sway * 3, ph = r.phase % 4, fl = [0, 0.4, 0.7, 0.3][ph];
        const rows: Shape[] = [];
        for (let i = 0; i < 7; i++) {
          const y = top - i * 2.3, len = 8 + i * 1.6;
          rows.push(feather(T, -1.6 - i * 0.2, y, -2.05 - s * 0.05 - i * 0.07 + fl * 0.03, len + fl, 1.7));
        }
        r.fill(union(...rows), m('k.scFeather'), { group: c.g, bevel: 1.2 });
        // Silver tips on the lowest feathers.
        for (let i = 4; i < 7; i++) {
          const y = top - i * 2.3, len = 8 + i * 1.6 + fl, a = -2.05 - s * 0.05 - i * 0.07 + fl * 0.03;
          dt(r, T, -1.6 - i * 0.2 + Math.cos(a) * (len - 0.6), y + Math.sin(a) * (len - 0.6), m('k.scSilver'), 4, c.g);
        }
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, fx = b.chestPush * 0.7;
        // A crossed strap over the leather.
        const body = union(T.ell(0.3, 0.6, b.hipW, 3.6), T.ell(0.5, top * 0.46, b.waistW, top * 0.28), T.ell(fx, top - 3.4, b.chestW, 5.4));
        r.fill(intersect(body, T.cap(-b.waistW, top - 0.8, b.waistW + 1, 3.6, 0.55)), m('k.scStrap'), { group: c.g, bevel: 0.6 });
        r.fill(T.rect(b.waistW - 0.4, 2.6, 1.1, 1.2, 0.3), m('k.scSilver'), { group: c.g, bevel: 0.6 });
        dt(r, T, b.waistW - 0.4, 2.6, m('k.scGem'), 4, c.g);
        // The feather mantle over the shoulders and upper chest: three overlapping tiers.
        for (let k = 0; k < 3; k++) {
          const y = top + 0.6 - k * 1.4, n = 5;
          const f: Shape[] = [];
          for (let i = 0; i < n; i++) {
            const x = -2.4 + i * ((fx + b.chestW + 1.6) / (n - 1));
            f.push(feather(T, x, y + 0.8, -Math.PI / 2 - 0.2 + i * 0.06, 3.4 + k * 0.4, 1.1));
          }
          r.fill(union(...f), m('k.scFeather'), { group: GA + k, bevel: 0.9 });
        }
        // The clasp at the throat.
        r.fill(T.circ(fx + 1.6, top - 0.6, 1.1), m('k.scSilver'), { group: GA + 3, bevel: 0.8 });
        dt(r, T, fx + 1.6, top - 0.6, m('k.scGem'), 4, GA + 3);
      },
      shoulder(r, S2, m, c) {
        const a = c.body.armR, o = { group: c.g, toneBias: c.bias };
        // Feather pauldron: layered feathers falling over the upper arm, silver-tipped.
        const f = [feather(S2, -1.8, a + 0.6, -1.7, a + 4.6, 1.3), feather(S2, 0, a + 1, -1.57, a + 5, 1.4), feather(S2, 1.8, a + 0.6, -1.44, a + 4.6, 1.3)];
        r.fill(union(...f), m('k.scFeather'), { ...o, bevel: 1 });
        r.fill(S2.ell(0, a * 0.6, a + 1.4, 1.4), m('k.scFeather'), { ...o, bevel: 1.2 });
        if (!c.far) for (const x of [-1.8, 0, 1.8]) dt(r, S2, x, -3.6 + Math.abs(x) * 0.25, m('k.scSilver'), 4, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Corvid Breeches (springheel leggings)
// -----------------------------------------------------------------------------

function corvidBreeches(): SkinArt {
  // Storm-blue breeches bound in black straps, raven-feather tassets hanging from the belt and a silver knee
  // cop shaped like a folded wing.
  return {
    mats: {
      'l.scCloth': { base: STORMCLOTH[2], ramp: STORMCLOTH, tex: (x) => (wrap(x * 1.1, 2) < 0.4 ? -1 : 0) },
      'l.scFeather': S.feather(), 'l.scSilver': S.silver(), 'l.scStrap': S.leather(undefined), 'l.scGem': S.storm(),
    },
    legs: {
      mat: 'l.scCloth', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.3,
      over(r, t, m, c) {
        const w = c.w, L = c.len, o = { group: c.g, toneBias: c.bias };
        // Straps wound round the thigh.
        for (const x of [L * 0.62, L * 0.36]) r.fill(t.cap(x + 0.6, -w - 0.3, x - 0.6, w + 0.4, 0.45), m('l.scStrap'), { ...o, bevel: 0.5 });
        // Feather tassets: four long feathers hanging from the hip over the outside of the thigh.
        const f: Shape[] = [];
        for (let i = 0; i < 4; i++) f.push(feather(t, L + 0.8, -w + i * ((2 * w + 1) / 3), Math.PI + (i - 1.5) * 0.06, L * 0.55, 1.2));
        r.fill(union(...f), m('l.scFeather'), { group: GA, bevel: 1, toneBias: c.bias });
        // The knee cop, a folded wing of silver.
        const kr = c.body.kneeR + 0.8;
        r.fill(union(t.ell(0.2, 0.6, kr, kr + 0.2), feather(t, 0.6, 0.4, 0.5, kr + 3, 1)), m('l.scSilver'), { group: GA + 1, bevel: 1.2, toneBias: c.bias });
        if (!c.far) dt(r, t, 0.2, 0.8, m('l.scGem'), 4, GA + 1);
      },
      shin(r, shin, _foot, m, c) {
        const w = c.body.shinR + 0.4, top = Math.max(c.top, 2);
        for (let x = top + 1; x < c.len - 1.4; x += 2.2) r.fill(shin.cap(x + 0.5, -w, x - 0.5, w, 0.4), m('l.scStrap'), { group: c.g, bevel: 0.4, toneBias: c.bias });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Talon Greaves (mirage boots)
// -----------------------------------------------------------------------------

function talonGreaves(): SkinArt {
  // Black scaled greaves up the shin, the toes cased as a raven's foot with silver claws curling down, a
  // spur at the heel, a storm gem at the ankle and a fringe of feathers at the cuff.
  return {
    mats: {
      'k.scScale': { base: FEATHER[2], ramp: FEATHER, shiny: true, step: 0.13, tex: (x, y) => (wrap(x * 1.1 + (Math.floor(y * 1.1) & 1) * 0.5, 1.2) < 0.3 ? -1 : 0) },
      'k.scClaw': S.silver(undefined), 'k.scCuff': S.feather(), 'k.scGem': S.storm(),
    },
    boots: {
      mat: 'k.scScale', height: 0.78, bulk: 0.35, trim: null, wing: null, knee: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias }, w = c.w;
        // Claws curling down off the toes, and the heel spur.
        const claws: Shape[] = [];
        for (const [x, d] of [[c.toe + 0.4, 0], [c.toe - 1.2, 0.5]] as const) claws.push(foot.poly([x - 0.6, -0.2 - d, x + 2.2, -0.6 - d, x + 2.4, -2.4 - d, x + 1.2, -1.2 - d]));
        claws.push(foot.poly([-1.6, -0.6, -4, -0.2, -2.2, -1.6]));
        r.fill(union(...claws), m('k.scClaw'), { ...o, bevel: 0.6 });
        // Feathers at the cuff, falling over the top of the greave.
        const f = [feather(shin, c.top + 1, w * 0.4, Math.PI - 0.2, 3.4, 0.9), feather(shin, c.top + 1, -w * 0.4, Math.PI + 0.3, 3.6, 0.9)];
        r.fill(union(...f), m('k.scCuff'), { ...o, bevel: 0.8 });
        if (!c.far) dt(r, shin, 2.4, w * 0.3, m('k.scGem'), 4, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = { storm: css(STORM), hot: css(STORM_HOT), deep: css(0x5a6ac8), feather: css(FEATHER[1]), sheen: css(FEATHER[3]) };

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function stormcrowAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  const back = layer === 'back';
  // A dark ring on the ground, a spark of storm light running round it.
  const run = Math.floor(t * 18) % 44;
  g.globalAlpha = back ? 0.45 : 0.65;
  ring(g, x, y, 15, 3.8, 44, layer, (g, px, py, i) => {
    const d = (i - run + 44) % 44;
    g.fillStyle = d === 0 ? AC.hot : d < 3 ? AC.storm : i % 3 ? AC.deep : AC.feather;
    g.fillRect(px, py, 1, 1);
  });
  // Feathers drifting down, rocking side to side as they fall.
  for (let k = 0; k < 6; k++) {
    if ((k % 2 === 0) !== back) continue;
    const fall = 3 + (k % 3) * 0.8, w = ((t + k * 0.53) / fall) % 1;
    const sway = Math.sin(t * 2.4 + k * 1.7);
    const px = Math.round(x + (hash(k, 21) - 0.5) * 34 + sway * 3), py = Math.round(y - 52 + w * 52);
    g.globalAlpha = Math.min(1, (1 - w) * 4, w * 8) * (back ? 0.6 : 0.9);
    g.fillStyle = AC.feather;
    g.fillRect(px, py, 2, 1);
    g.fillRect(px + (sway > 0 ? 2 : -1), py + (sway > 0 ? -1 : 1), 1, 1);
    g.fillStyle = AC.sheen;
    g.fillRect(px, py, 1, 1);
  }
  // Every few seconds a thread of lightning cracks down to the ring.
  const per = 2.6, u = (t % per) / per, n = Math.floor(t / per);
  if (!back && u < 0.12) {
    const side = hash(n, 3) < 0.5 ? -1 : 1, bx = x + side * (8 + hash(n, 4) * 6);
    g.globalAlpha = 1 - u / 0.12;
    let px = bx, py = y - 30;
    while (py < y) {
      const nx = px + Math.round((hash(n, py) - 0.5) * 5), ny = py + 2;
      g.fillStyle = py > y - 6 ? AC.storm : AC.hot;
      g.fillRect(nx, ny, 1, 2);
      px = nx; py = ny;
    }
  }
  g.globalAlpha = 1;
}

export const STORMCROW: Record<string, SkinArt> = {
  'bloodletter.stormcrow': { weapon: crowbeakCleaver, ...FX },
  'grapnel.stormcrow': { weapon: ravenTalon, ...FX },
  'storm_cloud.stormcrow': murderOfCrows,
  'magpie_mask.stormcrow': stormcrowVisage(),
  'grudge_mail.stormcrow': ravenMantle(),
  'springheel_leggings.stormcrow': corvidBreeches(),
  'mirage_boots.stormcrow': talonGreaves(),
};
