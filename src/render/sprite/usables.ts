import type { UsableId } from '../../sim/types';
import { material, type Material, type Raster } from '../pixel/raster';
import { intersect, union } from '../pixel/sdf';
import { speckle } from '../pixel/tex';
import type { Xf } from './xform';

/**
 * Usable items (potions and bombs) as pixel art. Drawn in item-local space:
 * the origin is where the hand grips the bottle, +x runs up the neck toward
 * the cork, +y is the side facing the light. About 11 px from base to cork,
 * so a bottle sits in a hand like a dagger hilt does.
 */

export interface UsableDrawOpts {
  group?: number;
  toneBias?: number;
  /** Animation step for flickering parts (fuse flame, swirling liquid). */
  frame?: number;
  /** The cork is out (drinking). */
  open?: boolean;
}

export interface UsableArt {
  mats: Record<string, Material>;
  /** Liquid colour for drink effects and splashes (bright, deep). */
  glow: [number, number];
  draw(r: Raster, t: Xf, m: (k: string) => number, o?: UsableDrawOpts): void;
}

const glass = () => material({ base: 0xd8eef4, shiny: true, step: 0.13 });
const cork = () => material({ base: 0xa8784a, tex: speckle(0.2, -1) });

/** Fill helper with the item's group and tone bias. */
function filler(r: Raster, o: UsableDrawOpts) {
  const group = o.group ?? 7, toneBias = o.toneBias ?? 0;
  return (s: Parameters<Raster['fill']>[0], mat: number, bevel = 1.4, extra: { flat?: number; noLine?: boolean } = {}) =>
    r.fill(s, mat, { group, toneBias, bevel, ...extra });
}

/** Neck, lip and (unless drinking) cork, from `x0` up to `x1`. */
function neck(r: Raster, t: Xf, m: (k: string) => number, o: UsableDrawOpts, x0: number, x1: number, w = 0.95, corkKey = 'cork'): void {
  const fill = filler(r, o);
  fill(t.cap(x0, 0, x1, 0, w + 0.15, w), m('glass'), 1);
  fill(t.cap(x1, 0, x1 + 0.2, 0, w + 0.45), m('glass'), 0.8);
  if (!o.open) fill(t.cap(x1 + 0.4, 0, x1 + 1.5, 0, w + 0.1, w + 0.25), m(corkKey), 0.8);
}

const ART: Record<UsableId, () => UsableArt> = {
  // A round-bellied flask of red healing draught.
  healing_potion: () => ({
    mats: {
      glass: glass(), cork: cork(),
      liquid: material({ base: 0xe8283a, shiny: true, step: 0.14 }),
      hot: material({ base: 0xffb0b8, glow: true }),
    },
    glow: [0xff8a9a, 0xd01a3a],
    draw(r, t, m, o = {}) {
      const fill = filler(r, o);
      neck(r, t, m, o, 1.8, 4.2);
      fill(t.circ(-1, 0, 3.4), m('glass'), 2);
      fill(intersect(t.circ(-1, 0, 2.8), t.rect(-2.4, 0, 2.8, 4)), m('liquid'), 2);
      r.dot(t.x(-1.6, 1.6), t.y(-1.6, 1.6), m('hot'), 4, o.group ?? 7);
      r.dot(t.x(-2.6, 0.6), t.y(-2.6, 0.6), m('hot'), 3, o.group ?? 7);
    },
  }),
  // A tall, slim vial of swirling teal wind.
  swiftness_draught: () => ({
    mats: {
      glass: glass(), cork: cork(),
      liquid: material({ base: 0x3adcc8, glow: true }),
      hot: material({ base: 0xe0fffa, glow: true }),
    },
    glow: [0xc8fff4, 0x2ab8b0],
    draw(r, t, m, o = {}) {
      const fill = filler(r, o);
      neck(r, t, m, o, 3, 4.6, 0.8);
      fill(t.cap(-4.4, 0, 3, 0, 1.9, 1.5), m('glass'), 1.4);
      fill(t.cap(-3.9, 0, 1.6, 0, 1.25, 1.05), m('liquid'), 1);
      // A spiral of wind inside, turning with the frame.
      const k = (o.frame ?? 0) % 3;
      for (let i = 0; i < 3; i++) {
        const x = -3.4 + i * 1.8 + k * 0.6, y = i % 2 ? 0.5 : -0.5;
        r.dot(t.x(x, y), t.y(x, y), m('hot'), 4, o.group ?? 7);
      }
    },
  }),
  // A squat square bottle of fury, sealed with red wax and a fang label.
  fury_tonic: () => ({
    mats: {
      glass: material({ base: 0x8a3020, shiny: true, step: 0.13 }),
      cork: material({ base: 0xb01a1a, shiny: true }),
      liquid: material({ base: 0xff5a1a, glow: true }),
      label: material({ base: 0xf0dcb0 }),
      ink: material({ base: 0x3a1010 }),
    },
    glow: [0xffb060, 0xd02a10],
    draw(r, t, m, o = {}) {
      const fill = filler(r, o);
      neck(r, t, m, o, 2, 4, 0.9);
      fill(t.rect(-1, 0, 3.2, 2.8, 0.7), m('glass'), 1.8);
      fill(t.rect(-1.4, 0, 2.4, 2.1, 0.4), m('liquid'), 1);
      fill(t.rect(-0.8, 0, 1.2, 2.9), m('label'), 0.8, { noLine: true });
      fill(t.poly([0, 1.2, -1.6, 0.4, 0, -0.4]), m('ink'), 0.5, { flat: 1, noLine: true });
    },
  }),
  // A stoneware jug with a carved handle and a glowing earth rune.
  stoneskin_elixir: () => ({
    mats: {
      glass: material({ base: 0x9a8a72, tex: speckle(0.14, -1), step: 0.12 }),
      dark: material({ base: 0x5a4a3a }),
      cork: cork(),
      rune: material({ base: 0xffc860, glow: true }),
    },
    glow: [0xffe0a0, 0x9a7a50],
    draw(r, t, m, o = {}) {
      const fill = filler(r, o);
      fill(union(t.cap(2.0, 1.2, 0.6, 3.6, 0.55), t.cap(0.6, 3.6, -2.0, 3.3, 0.55)), m('dark'), 0.8);
      neck(r, t, m, o, 2, 3.8, 1.2);
      fill(t.ell(-0.8, 0, 3.6, 3.2), m('glass'), 2.4);
      fill(t.rect(1.6, 0, 0.4, 2.4), m('dark'), 0.6, { flat: 1, noLine: true });
      r.line(t.x(-2.4, -1), t.y(-2.4, -1), t.x(-0.6, 1.2), t.y(-0.6, 1.2), m('rune'), 3, o.group ?? 7);
      r.line(t.x(-0.6, 1.2), t.y(-0.6, 1.2), t.x(0.4, -1.2), t.y(0.4, -1.2), m('rune'), 3, o.group ?? 7);
    },
  }),
  // A cut-crystal flask of liquid lightning, stoppered with a gem.
  energy_tonic: () => ({
    mats: {
      glass: material({ base: 0xe8f0ff, shiny: true, step: 0.16 }),
      liquid: material({ base: 0xffd030, glow: true }),
      hot: material({ base: 0xfffbe0, glow: true }),
      metal: material({ base: 0xd8a838, shiny: true }),
      cork: material({ base: 0x7a5aff, shiny: true }),
    },
    glow: [0xfff4a0, 0xe0a020],
    draw(r, t, m, o = {}) {
      const fill = filler(r, o);
      fill(t.cap(2.2, 0, 3.8, 0, 1.0, 0.85), m('metal'), 1);
      if (!o.open) fill(t.poly([4, -1.3, 5.8, 0, 4, 1.3, 3.6, 0]), m('cork'), 1);
      fill(t.poly([-4.4, 0, -1.6, -3.2, 2.4, -1.3, 2.4, 1.3, -1.6, 3.2]), m('glass'), 1.6);
      fill(t.poly([-3.4, 0, -1.6, -2.2, 1.4, -0.9, 1.4, 0.9, -1.6, 2.2]), m('liquid'), 1);
      const k = (o.frame ?? 0) % 3;
      const z = [[-2.4, 0.6, -1.2, -0.6, 0, 0.5], [-2.6, -0.4, -1.4, 0.7, 0.2, -0.3], [-2.2, 0.2, -1, -0.8, 0.4, 0.4]][k];
      r.line(t.x(z[0], z[1]), t.y(z[0], z[1]), t.x(z[2], z[3]), t.y(z[2], z[3]), m('hot'), 4, o.group ?? 7);
      r.line(t.x(z[2], z[3]), t.y(z[2], z[3]), t.x(z[4], z[5]), t.y(z[4], z[5]), m('hot'), 4, o.group ?? 7);
    },
  }),
  // A clay grenade of alchemist fire, banded in iron, its rag fuse burning.
  fire_bomb: () => ({
    mats: {
      glass: material({ base: 0x4a3a40, shiny: true, step: 0.14 }),
      band: material({ base: 0x8a7a70, shiny: true }),
      cork: material({ base: 0xd8c8a0 }),
      flame: material({ base: 0xff8a2a, glow: true }),
      hot: material({ base: 0xfff0a0, glow: true }),
      liquid: material({ base: 0xff6a1a, glow: true }),
    },
    glow: [0xffd070, 0xe04a10],
    draw(r, t, m, o = {}) {
      const fill = filler(r, o);
      fill(t.cap(1.8, 0, 3.4, 0, 1.2), m('band'), 1);
      // The rag fuse, then its flame (always lit: it's a bomb).
      fill(t.cap(3.4, 0, 5, 0.9, 0.75, 0.6), m('cork'), 0.6);
      const k = (o.frame ?? 0) % 3;
      const tip = [[7.6, 1.6], [7.2, 2.4], [7.8, 0.8]][k];
      fill(t.poly([4.6, -0.2, tip[0], tip[1], 4.8, 2.0, 4.2, 0.9]), m('flame'), 0.5);
      r.dot(t.x(5.2, 0.9), t.y(5.2, 0.9), m('hot'), 4, o.group ?? 7);
      fill(t.circ(-0.8, 0, 3.5), m('glass'), 2.4);
      fill(intersect(t.circ(-0.8, 0, 3.5), t.rect(-0.8, 0, 0.6, 4)), m('band'), 0.6, { noLine: true });
      r.dot(t.x(-2.2, -1.4), t.y(-2.2, -1.4), m('liquid'), 3, o.group ?? 7);
      r.dot(t.x(0.6, -2), t.y(0.6, -2), m('liquid'), 3, o.group ?? 7);
    },
  }),
};

const cache = new Map<UsableId, UsableArt>();

/** The art for a usable item (built once, shared). */
export function usableArt(id: UsableId): UsableArt {
  let a = cache.get(id);
  if (!a) { a = ART[id](); cache.set(id, a); }
  return a;
}
