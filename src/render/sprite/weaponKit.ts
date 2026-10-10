import { material, type LocalSpace, type Material, type Raster } from '../pixel/raster';
import type { Shape } from '../pixel/sdf';
import { Xf } from './xform';

/**
 * Shared pieces for weapon art: the WeaponArt contract, stock materials and
 * fill helpers. Weapons are built from shapes in weapon-local space: the
 * origin is the grip (centre of the hand), +x runs toward the business end,
 * +y is the spine side.
 */

export type MainFamily = 'sword' | 'wand' | 'heavy' | 'polearm' | 'staff' | 'bow';
/** `fist`: worn on the off hand all fight (cestus), never holstered. */
export type SecFamily = 'shield' | 'parry' | 'buckler' | 'knife' | 'crossbow' | 'chakram' | 'wand' | 'horn' | 'fist';

export interface WeaponArt {
  /** Distance from the grip to the tip (smears, hit sparks). */
  tip: number;
  /** Two-handed: where the far hand holds the weapon (x along the weapon). */
  grip2?: number;
  /** Draw order details: parts in order. */
  draw(r: Raster, t: Xf, m: (name: string) => number, opts: WeaponDrawOpts): void;
  mats: Record<string, Material>;
}

export interface WeaponDrawOpts {
  /** Toned down when on the far side. */
  toneBias?: number;
  group?: number;
  /** 0..1 how far the bowstring is drawn (bows and crossbows). */
  pull?: number;
  /** Bow: where the string hand is, in raster space. */
  stringTo?: [number, number];
  /** Weapon space for textures (set by `weaponArt`'s draw wrapper). */
  local?: LocalSpace;
}

export const M = {
  steel: () => material({ base: 0xb8c4d4, shiny: true, step: 0.15 }),
  darkSteel: () => material({ base: 0x6a7488, shiny: true }),
  gold: () => material({ base: 0xd8a838, shiny: true }),
  bronze: () => material({ base: 0xb07a40, shiny: true }),
  wood: () => material({ base: 0x8a5a32 }),
  darkWood: () => material({ base: 0x5a3a24 }),
  leather: () => material({ base: 0x6a4028 }),
  wrap: (c: number) => material({ base: c }),
  cloth: (c: number) => material({ base: c }),
  glow: (c: number) => material({ base: c, glow: true }),
  gem: (c: number) => material({ base: c, shiny: true, step: 0.17 }),
  string: () => material({ base: 0xe8e0c8 }),
};

export const fillAll = (r: Raster, shapes: Shape[], mat: number, o: WeaponDrawOpts, bevel = 1.6, extra = 0) => {
  for (const s of shapes) r.fill(s, mat, { group: o.group ?? 6, bevel, toneBias: (o.toneBias ?? 0) + extra, local: o.local });
};

export function clearShape(r: Raster, s: Shape): void {
  const x0 = Math.max(0, Math.floor(s.box.x0)), y0 = Math.max(0, Math.floor(s.box.y0));
  const x1 = Math.min(r.w - 1, Math.ceil(s.box.x1)), y1 = Math.min(r.h - 1, Math.ceil(s.box.y1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (s.sdf(x + 0.5, y + 0.5) < 0) {
      const i = y * r.w + x;
      // Only clear what the ring just drew (keep the body behind it).
      if (r.group[i] === 6 || r.group[i] === 7) { r.mat[i] = 0; r.order[i] = 0; }
    }
  }
}


/**
 * A frame at the weapon's point (lx, ly) whose +x points straight down the
 * screen, +y toward screen right: for parts that hang (chains, cords,
 * charms) whatever angle the weapon is held at. Keeps the weapon's size.
 */
export function hangAt(t: Xf, lx: number, ly: number): Xf {
  const s = Math.abs(t.sy);
  return new Xf(t.x(lx, ly), t.y(lx, ly), -Math.PI / 2, s, s);
}

/**
 * A chain along a quadratic curve (raster space): one-pixel links in
 * alternating tones, so it reads as metal links at any length.
 */
export function chainLine(r: Raster, ax: number, ay: number, cx: number, cy: number, bx: number, by: number, mat: number, group = 6): void {
  const len = Math.hypot(cx - ax, cy - ay) + Math.hypot(bx - cx, by - cy);
  const n = Math.max(2, Math.ceil(len));
  let lx = -1, ly = -1, k = 0;
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    const x = Math.floor(v * v * ax + 2 * u * v * cx + u * u * bx);
    const y = Math.floor(v * v * ay + 2 * u * v * cy + u * u * by);
    if (x === lx && y === ly) continue;
    r.dot(x, y, mat, k++ % 2 ? 1 : 3, group);
    lx = x; ly = y;
  }
}
