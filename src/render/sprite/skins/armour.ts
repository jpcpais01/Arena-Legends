import type { MaterialSpec, Raster, Tex } from '../../pixel/raster';
import { union, type Shape } from '../../pixel/sdf';
import { bands, hash, lattice, speckle } from '../../pixel/tex';
import type { BodySpec } from '../body';
import type { BootsLook, ChestLook } from '../look';
import type { Xf } from '../xform';

/**
 * Reshaped chest pieces and boots for mythic and legendary skins. These add
 * shapes to the stock armour through hooks in the figure drawer; materials
 * come from the skin's `mats` (named `k.*`) and are added to the character.
 */

export interface BodyCtx {
  /** Torso height (top of the chest) in torso space. */
  top: number;
  sway: number;
  body: BodySpec;
  g: number;
}
/** Drawn in torso space: x toward the face, y up from the hips. */
export type BodyDraw = (r: Raster, T: Xf, m: (k: string) => number, c: BodyCtx) => void;

export interface ShoulderCtx {
  g: number;
  bias: number;
  far: boolean;
  body: BodySpec;
}
/** Drawn at each shoulder joint, upright with the torso (x toward the face, y up). */
export type ShoulderDraw = (r: Raster, S: Xf, m: (k: string) => number, c: ShoulderCtx) => void;

export interface LegCtx {
  g: number;
  bias: number;
  far: boolean;
  body: BodySpec;
  /** Ankle to knee. */
  len: number;
  /** Where the boot ends up the shin. */
  top: number;
  /** Boot half width over the shin. */
  w: number;
  /** Ankle to toe tip. */
  toe: number;
}
/** Drawn per leg: `shin` runs up from the ankle (y toward the front), `foot` runs to the toe (y up). */
export type LegDraw = (r: Raster, shin: Xf, foot: Xf, m: (k: string) => number, c: LegCtx) => void;

// -----------------------------------------------------------------------------
// Skins
// -----------------------------------------------------------------------------

type ArmourSkin = { mats: Record<string, MaterialSpec>; chest?: Partial<ChestLook>; boots?: Partial<BootsLook> };

const wrap = (v: number, p: number) => ((v % p) + p) % p;
const shiny = (base: number, tex?: Tex, step = 0.15): MaterialSpec => ({ base, shiny: true, step, tex });
const plain = (base: number, tex?: Tex): MaterialSpec => ({ base, tex });
const glow = (base: number): MaterialSpec => ({ base, glow: true });
const veined = (dark: number[], hot: number, tex: Tex): MaterialSpec => ({ base: dark[2], ramp: [...dark, hot], tex });

/** A long cape whose hem is torn into rags (trails the motion like the stock cape). */
const tatteredCape = (mat: string): BodyDraw => (r, T, m, c) => {
  const s = c.sway * 3, top = c.top;
  r.fill(T.poly([
    -1, top + 0.6, -5.8, top - 0.8, -10.4 - s * 1.2, -7,
    -12.4 - s * 1.5, -15, -10 - s * 1.3, -12.4, -8.6 - s * 1.4, -17, -6.6 - s * 1.2, -13.2,
    -4.4 - s, -16.2, -2.8 - s * 0.8, -11.6, -0.8, -3,
  ]), m(mat), { group: c.g, bevel: 3, toneBias: -1, softLight: true });
};

/** A five-petal rose with a leaf, centred at (x, y) in frame F. */
function rose(r: Raster, F: Xf, m: (k: string) => number, x: number, y: number, size: number, g: number, bias: number): void {
  const petals: Shape[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    petals.push(F.circ(x + Math.cos(a) * size, y + Math.sin(a) * size, size * 0.95));
  }
  r.fill(F.ell(x - size * 1.9, y - size * 0.6, size * 1.3, size * 0.55, 0.4), m('k.leaf'), { group: g, bevel: 1, toneBias: bias });
  r.fill(union(...petals), m('k.rose'), { group: g, bevel: 1.2, toneBias: bias });
  r.fill(F.circ(x, y, size * 0.75), m('k.roseDark'), { group: g, flat: 1, noLine: true });
  r.dot(F.x(x + size * 0.2, y + size * 0.2), F.y(x + size * 0.2, y + size * 0.2), m('k.rose'), 4, g);
}

// --- Mythic ---------------------------------------------------------------------

export function wraithShroud(): ArmourSkin {
  return {
    mats: {
      cloak: plain(0x2c3846, speckle(0.08, -1)), cloakTrim: glow(0x8affd8),
      'k.shroud': plain(0x222c38, lattice(3, -1)), 'k.bone': shiny(0xe8e0c8, undefined, 0.13), 'k.soul': glow(0x8affd8),
    },
    chest: {
      cape: null,
      back: tatteredCape('k.shroud'),
      over(r, T, m, c) {
        const w = c.body.waistW, top = c.top;
        // A torn sash at the hip and a skull clasp at the collar.
        r.fill(T.poly([w - 0.6, 3, w + 1, 3, w + 1.4, -3.6, w + 0.6, -2.4, w + 0.2, -4.4, w - 0.6, -2]), m('k.shroud'), { group: c.g, bevel: 1.4 });
        const cx = c.body.chestPush * 0.7 + 1.2, cy = top - 1.4;
        r.fill(union(T.circ(cx, cy, 1.25), T.rect(cx + 0.2, cy - 1.1, 0.7, 0.45)), m('k.bone'), { group: c.g, bevel: 1 });
        r.dot(T.x(cx + 0.5, cy + 0.1), T.y(cx + 0.5, cy + 0.1), m('k.soul'), 3, c.g);
      },
    },
  };
}

export function rosethornMail(): ArmourSkin {
  return {
    mats: {
      thorn: shiny(0x2e6a3a), thornDark: plain(0x1a3a22),
      'k.vine': plain(0x2a4a1e), 'k.rose': shiny(0xd8284a, undefined, 0.14), 'k.roseDark': plain(0x7a1028),
      'k.leaf': shiny(0x4a9a40), 'k.prick': shiny(0xe8e0c0),
    },
    chest: {
      spikes: null,
      shoulder(r, S, m, c) {
        rose(r, S, m, 0.2, 2, 1.1, c.g, c.bias);
        r.fill(S.poly([-1.6, 1.2, -2.8, 2.8, -1, 1.8]), m('k.prick'), { group: c.g, bevel: 0.6, toneBias: c.bias });
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top;
        // A thorny vine winding up from the back hip to the front shoulder, a rose on the chest.
        const a = [-b.hipW + 0.5, 3.4], z = [b.chestPush * 0.7 + 2.4, top - 1.2];
        const pts: [number, number][] = [];
        for (let i = 0; i <= 6; i++) {
          const u = i / 6;
          pts.push([a[0] + (z[0] - a[0]) * u + Math.sin(u * Math.PI * 3) * 1.1, a[1] + (z[1] - a[1]) * u]);
        }
        const segs: Shape[] = [];
        for (let i = 1; i < pts.length; i++) segs.push(T.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 0.55));
        r.fill(union(...segs), m('k.vine'), { group: c.g, bevel: 0.8 });
        for (let i = 1; i < pts.length - 1; i += 2) {
          const [x, y] = pts[i];
          r.fill(T.poly([x - 0.4, y, x + 0.4, y + 1.6, x + 0.5, y - 0.2]), m('k.prick'), { group: c.g, bevel: 0.5 });
        }
        rose(r, T, m, b.chestPush * 0.7 + 1, top - 4.6, 0.85, c.g, 0);
      },
    },
  };
}

export function rangerMantle(): ArmourSkin {
  const fur: Tex = (x, y) => (hash(Math.floor(x * 1.5), Math.floor(y * 2)) < 0.3 ? -1 : 0);
  return {
    mats: {
      'k.mantle': plain(0x3a5a34, speckle(0.08, -1)), 'k.fur': plain(0xd8c8a4, fur),
      'k.strap': plain(0x4a2e1c), 'k.buckle': shiny(0xd8b050),
      'k.quiver': plain(0x7a4424, bands(1.6, 0.5, -1)), 'k.fletch': plain(0xece4d4), 'k.fletch2': plain(0xc0302a),
    },
    chest: {
      sleeve: 'k.mantle', sleeveLen: 0.6,
      back(r, T, m, c) {
        // A quiver slung across the back, fletchings over the shoulder.
        const top = c.top;
        r.fill(T.poly([-2.2, top + 2.2, -1.2, top + 4.8, -0.6, top + 4.4, -1.4, top + 2]), m('k.fletch2'), { group: c.g, bevel: 0.6 });
        r.fill(T.poly([-3.4, top + 2.6, -3, top + 5.4, -2.2, top + 5, -2.6, top + 2.4]), m('k.fletch'), { group: c.g, bevel: 0.6 });
        r.fill(T.poly([-4.4, top + 2.4, -4.6, top + 4.8, -3.8, top + 4.6, -3.6, top + 2.2]), m('k.fletch2'), { group: c.g, bevel: 0.6, toneBias: -1 });
        r.fill(T.poly([-1.4, top + 2.2, -4.4, top + 3, -8, 1.6, -5.4, 0.6]), m('k.quiver'), { group: c.g, bevel: 1.6, toneBias: -1 });
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, f = b.chestPush * 0.7;
        // A short hooded capelet over the shoulders, a strap across the chest, a fur collar.
        r.fill(T.poly([-4.2, top + 0.8, f + 3.4, top + 0.2, f + 3.2, top - 2.6, f + 1.6, top - 3.6, f + 0.4, top - 2.8, -1, top - 4.2, -3, top - 3.2, -4.6, top - 3.8]), m('k.mantle'), { group: c.g, bevel: 1.8, softLight: true });
        const a = [-2.6, top - 0.2], z = [f + 2.8, 4.2];
        r.fill(T.cap(a[0], a[1], z[0], z[1], 0.65), m('k.strap'), { group: c.g, bevel: 0.8 });
        const bx = a[0] + (z[0] - a[0]) * 0.55, by = a[1] + (z[1] - a[1]) * 0.55;
        r.fill(T.rect(bx, by, 0.7, 0.6, 0.2), m('k.buckle'), { group: c.g, bevel: 0.6 });
        r.fill(T.ell(0.8, top - 0.3, 4.4, 1.8, -0.1), m('k.fur'), { group: c.g, bevel: 1.6 });
      },
    },
  };
}

export function buccaneerBoots(): ArmourSkin {
  return {
    mats: {
      boot: plain(0x2a2226), bootDark: plain(0x16121a),
      'k.cuff': plain(0x9a6a40, speckle(0.1, -1)), 'k.strap': plain(0x5a3a26), 'k.buckle': shiny(0xf0c040),
    },
    boots: {
      height: 0.9, bulk: 0.38, trim: null,
      over(r, shin, _foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        // A wide folded cuff flaring over the knee, and a buckled strap at the ankle.
        r.fill(shin.poly([c.top - 2.8, -c.w - 0.5, c.top + 0.8, -c.w - 1.6, c.top + 1.1, c.w + 1.9, c.top - 2.8, c.w + 0.8]), m('k.cuff'), { ...o, bevel: 1.4 });
        r.fill(shin.rect(1.4, 0, 0.55, c.w + 0.25), m('k.strap'), { ...o, bevel: 0.6 });
        r.fill(shin.rect(1.4, c.w * 0.35, 0.75, 0.6), m('k.buckle'), { ...o, bevel: 0.5 });
      },
    },
  };
}

export function gothicSabatons(): ArmourSkin {
  return {
    mats: { greave: shiny(0xc0c8d8, undefined, 0.16), greaveDark: shiny(0x48506a), 'k.gold': shiny(0xd8a838) },
    boots: {
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const dark = m('greaveDark');
        // Long pointed toe, foot lames, fluted shin and a fan at the knee.
        r.fill(foot.poly([c.toe - 1.6, 1.3, c.toe + 2.8, 0.1, c.toe - 1.2, -1.1]), m('greave'), { ...o, bevel: 1 });
        for (const u of [0.35, 0.7]) r.line(foot.x(c.toe * u, -1.3), foot.y(c.toe * u, -1.3), foot.x(c.toe * u, 1.5), foot.y(c.toe * u, 1.5), dark, 1, c.g);
        for (const y of [c.w * 0.25, -c.w * 0.4]) r.line(shin.x(2, y), shin.y(2, y), shin.x(c.top - 1.8, y), shin.y(c.top - 1.8, y), dark, 1, c.g);
        r.fill(shin.rect(c.top - 0.6, 0, 0.45, c.w + 0.4), m('k.gold'), { ...o, bevel: 0.6 });
        r.fill(shin.poly([c.len - 1.6, -0.4, c.len + 1.4, -c.w - 2.6, c.len - 0.6, -c.w - 3.2, c.len - 3, -c.w - 1.4]), m('greave'), { ...o, bevel: 1 });
        r.dot(shin.x(c.len, 0), shin.y(c.len, 0), m('k.gold'), 4, c.g);
      },
    },
  };
}

// --- Legendary --------------------------------------------------------------------

export function soulboundPlate(): ArmourSkin {
  // Runes climb the plate in a slow wave of soul light.
  const runes: Tex = (x, y, ph) => {
    const cx = Math.floor(x / 2.2), cy = Math.floor(y / 2.2);
    if (hash(cx + 7, cy) > 0.24) return 0;
    const lx = wrap(x, 2.2), ly = wrap(y, 2.2);
    if (lx >= 0.8 && ly >= 0.8) return 0;
    return wrap(cy - ph, 4) < 2 ? 4 : 1;
  };
  return {
    mats: {
      plate: veined([0x1a1e28, 0x262c3a, 0x363e52, 0x4a5470], 0xa8fff0, runes), plateDark: shiny(0x2a3040),
      'k.skull': shiny(0xe0dccc, undefined, 0.13), 'k.socket': plain(0x101218), 'k.eye': glow(0x8afff0), 'k.cape': plain(0x1c2230, speckle(0.1, 1)),
      'k.flame': glow(0x7af8e8), 'k.hot': glow(0xe8fffc),
    },
    chest: {
      pauldron: null, spikes: null,
      back: tatteredCape('k.cape'),
      shoulder(r, S, m, c) {
        // A skull for a pauldron, eyes burning.
        r.fill(union(S.circ(0, 1.4, 2.9), S.rect(1, -1.1, 1.5, 0.8, 0.3)), m('k.skull'), { group: c.g, bevel: 1.6, toneBias: c.bias });
        r.fill(union(S.circ(0.5, 1.2, 0.8), S.circ(2, 1, 0.8)), m('k.socket'), { group: c.g, flat: 0, noLine: true });
        r.dot(S.x(0.5, 1.2), S.y(0.5, 1.2), m('k.eye'), 3, c.g);
        r.dot(S.x(2, 1), S.y(2, 1), m('k.eye'), 3, c.g);
        r.line(S.x(0, -1.3), S.y(0, -1.3), S.x(2.2, -1.3), S.y(2.2, -1.3), m('k.socket'), 0, c.g);
      },
      over(r, T, m, c) {
        // A soul flame burning in a crystal at the heart.
        const x = c.body.chestPush * 0.7 + 1.4, y = c.top - 4.2;
        const lick = [0, 0.7, 0.2, 1][r.phase % 4];
        r.fill(T.poly([x, y + 1.6, x + 1.1, y, x, y - 1.6, x - 1.1, y]), m('k.flame'), { group: c.g, bevel: 0.8 });
        r.fill(T.poly([x - 0.6, y + 0.8, x, y + 2.6 + lick, x + 0.6, y + 0.8]), m('k.hot'), { group: c.g, noLine: true });
      },
    },
  };
}

export function prismMail(): ArmourSkin {
  // Light splits into colours that sweep across the crystal, frame by frame.
  const RAMP = [0x5a4ab8, 0x4a8ae0, 0x4ad0c8, 0xe8f0a0, 0xffffff];
  const sweep: Tex = (x, y, ph) => {
    const b = wrap(Math.floor((x + y * 0.7) * 0.45) - ph, 4);
    return b === 0 ? 1 : b === 2 ? -1 : 0;
  };
  return {
    mats: {
      mirror: { base: RAMP[2], ramp: RAMP, shiny: true, tex: sweep }, mirrorGlow: glow(0xffd8f8),
      'k.prism': { base: RAMP[2], ramp: RAMP, shiny: true, tex: sweep }, 'k.core': glow(0xffffff),
    },
    chest: {
      over(r, T, m, c) {
        // Shards float off the back, bobbing out of step, and a prism sits on the chest.
        const bob = [0, 0.5, 0.9, 0.5][r.phase % 4], top = c.top;
        const shard = (x: number, y: number, w: number, h: number) => {
          r.fill(T.poly([x - w, y, x, y + h, x + w, y, x, y - h * 0.45]), m('k.prism'), { group: c.g, bevel: 0.8 });
          r.dot(T.x(x, y + h * 0.2), T.y(x, y + h * 0.2), m('k.core'), 3, c.g);
        };
        shard(-7, top - 2.6 + bob, 1.6, 3.6);
        shard(-9.4, top + 1.2 - bob * 0.6, 1.1, 2.4);
        shard(-6.2, top - 8 + bob * 0.4, 1, 2.2);
        const x = c.body.chestPush * 0.7 + 1.6, y = c.top - 4;
        r.fill(T.poly([x, y + 2, x + 1.4, y, x, y - 2, x - 1.4, y]), m('k.prism'), { group: c.g, bevel: 0.8 });
        r.dot(T.x(x + 0.3, y + 0.4), T.y(x + 0.3, y + 0.4), m('k.core'), 3, c.g);
      },
    },
  };
}

export function earthshakers(): ArmourSkin {
  // Cracks in the stone glow with magma that pulses down toward the ground.
  const lava: Tex = (x, y, ph) => {
    const v = Math.sin(x * 1.3 + Math.sin(y * 1.7) * 2.2) + Math.sin(y * 1.1 - x * 0.4) * 0.6;
    if (Math.abs(v) >= 0.24) return 0;
    return wrap(Math.floor(x * 0.6) + ph, 4) < 2 ? 4 : 2;
  };
  return {
    mats: {
      colossus: veined([0x2a2220, 0x3a302a, 0x4e4238, 0x665648], 0xffa040, lava), colossusDark: plain(0x1e1816),
      'k.rock': plain(0x5e544a, speckle(0.14, -1)), 'k.lava': glow(0xffb040),
    },
    boots: {
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias, bevel: 1.2 };
        // Jagged rocks jut from the shin and the toe.
        r.fill(shin.poly([c.top - 3.4, -c.w + 0.2, c.top + 0.4, -c.w - 1.8, c.top - 0.6, -c.w + 1.4]), m('k.rock'), o);
        r.fill(shin.poly([c.top - 2, c.w - 0.6, c.top + 1.2, c.w + 1.2, c.top - 0.2, c.w - 1.8]), m('k.rock'), o);
        r.fill(foot.poly([c.toe - 2.6, 1.6, c.toe - 0.4, 2.8, c.toe + 0.6, 1]), m('k.rock'), o);
        r.dot(shin.x(c.top - 1.8, -c.w), shin.y(c.top - 1.8, -c.w), m('k.lava'), 3, c.g);
      },
    },
  };
}

export function umbralTreads(): ArmourSkin {
  // Glowing glyphs rise up the boots; shadow smoke curls off the heels.
  const glyphs: Tex = (x, y, ph) => (wrap(Math.floor(y * 0.9) + ph, 4) === 0 && hash(Math.floor(x * 1.2), Math.floor(y * 0.9)) < 0.5 ? 4 : 0);
  return {
    mats: {
      shadow: veined([0x120a1e, 0x1e1230, 0x2c1c48, 0x3e2a62], 0xc08aff, glyphs), shadowGlow: glow(0xc08aff),
      'k.smoke': plain(0x3a2460), 'k.claw': shiny(0xd8c8f0),
    },
    boots: {
      over(r, shin, foot, m, c) {
        // Three puffs rise and shrink, looping every four frames.
        for (let k = 0; k < 3; k++) {
          const u = wrap(k * 1.07 + r.phase * 0.8, 3.2);
          r.fill(shin.circ(c.top * 0.25 + u * 2.2, -c.w - 0.8 - u * 0.6, 1.5 - u * 0.32), m('k.smoke'), { group: c.g, bevel: 1.2, toneBias: c.bias - (u > 2 ? 1 : 0) });
        }
        r.fill(foot.poly([c.toe - 0.8, 0.9, c.toe + 1.8, 0.2, c.toe - 0.6, -0.3]), m('k.claw'), { group: c.g, bevel: 0.6, toneBias: c.bias });
      },
    },
  };
}
