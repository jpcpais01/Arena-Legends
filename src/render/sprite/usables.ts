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
  // A slate-grey clay ball bound in cord, a short fuse fizzing at the top.
  smoke_bomb: () => ({
    mats: {
      glass: material({ base: 0x6a6878, tex: speckle(0.16, -1), step: 0.12 }),
      band: material({ base: 0xc8b898 }),
      cork: material({ base: 0x3a3440 }),
      fuse: material({ base: 0x8a6a4a }),
      smoke: material({ base: 0xb8b8c4 }),
      hot: material({ base: 0xfff0b0, glow: true }),
      flame: material({ base: 0xff9a3a, glow: true }),
    },
    glow: [0xd8d8e4, 0x6a6878],
    draw(r, t, m, o = {}) {
      const fill = filler(r, o);
      const g = o.group ?? 7;
      const k = (o.frame ?? 0) % 3;
      // A curl of smoke off the fuse, then the fuse itself and its spark.
      const puff = [[6.4, 1.6], [6.8, 2.2], [6.1, 2.6]][k];
      fill(t.circ(puff[0], puff[1], 0.95), m('smoke'), 0.6, { noLine: true });
      fill(t.cap(2.6, 0, 3.9, 0.5, 0.55), m('fuse'), 0.5);
      fill(t.cap(3.9, 0.5, 4.9, -0.2, 0.5), m('fuse'), 0.5);
      r.dot(t.x(5.3, -0.2), t.y(5.3, -0.2), m(k === 1 ? 'flame' : 'hot'), 4, g);
      r.dot(t.x(5.3 + (k === 2 ? 0.9 : 0), 0.7), t.y(5.3 + (k === 2 ? 0.9 : 0), 0.7), m('flame'), 4, g);
      // Clay nub with a wax plug.
      fill(t.cap(1.6, 0, 2.8, 0, 1.25, 1.0), m('cork'), 0.8);
      fill(t.circ(-0.9, 0, 3.6), m('glass'), 2.6);
      // Cord binding: a cross over the ball.
      const ball = t.circ(-0.9, 0, 3.6);
      fill(intersect(ball, t.rect(-0.9, 0, 0.45, 4)), m('band'), 0.5, { noLine: true });
      fill(intersect(ball, t.rect(-0.9, 0, 4, 0.42)), m('band'), 0.5, { noLine: true });
      r.dot(t.x(-0.9, 0), t.y(-0.9, 0), m('cork'), 1, g);
    },
  }),
  // A small leather pouch, cinched shut, iron spike points poking out of the mouth.
  caltrops: () => ({
    mats: {
      glass: material({ base: 0x8a5a36, tex: speckle(0.12, -1), step: 0.12 }),
      band: material({ base: 0x5a3a24 }),
      cork: material({ base: 0x9aa2ae, shiny: true, step: 0.16 }),
      cord: material({ base: 0xd8c08a }),
    },
    glow: [0xd8dce4, 0x6a7280],
    draw(r, t, m, o = {}) {
      const fill = filler(r, o);
      // Spikes out of the open mouth.
      fill(t.poly([2.6, -1.0, 5.4, -2.6, 3.0, 0.0]), m('cork'), 0.6);
      fill(t.poly([2.8, -0.3, 6.3, 0.3, 3.0, 0.9]), m('cork'), 0.6);
      fill(t.poly([2.6, 0.7, 4.6, 3.0, 2.3, 1.6]), m('cork'), 0.6);
      // Ruffled mouth of the bag.
      fill(t.poly([2.0, -1.9, 3.4, -2.4, 3.0, -0.6, 3.5, 0.6, 3.0, 2.2, 1.8, 1.9]), m('glass'), 0.9);
      // The bag: a soft, heavy bottom.
      fill(union(t.ell(-1.4, 0, 3.1, 3.5), t.cap(-1, 0, 1.8, 0, 2.9, 1.3)), m('glass'), 2.4);
      // Drawstring: wraps the neck, a tail with a knot hanging off.
      fill(t.cap(1.7, -1.6, 1.7, 1.6, 0.5), m('band'), 0.5);
      fill(t.cap(1.7, 1.5, 0.2, 3.3, 0.38), m('cord'), 0.5);
      r.dot(t.x(0.1, 3.5), t.y(0.1, 3.5), m('cord'), 3, o.group ?? 7);
      // Stitched seam down the front.
      r.line(t.x(-3.6, 1.2), t.y(-3.6, 1.2), t.x(0.6, 1.0), t.y(0.6, 1.0), m('band'), 1, o.group ?? 7);
    },
  }),
  // A pale, frosted flask of liquid winter, ice crystals growing off its sides.
  frost_bomb: () => ({
    mats: {
      glass: material({ base: 0xc8eaf8, shiny: true, step: 0.12 }),
      liquid: material({ base: 0x5ac8f0, shiny: true, step: 0.13 }),
      ice: material({ base: 0xe8faff, shiny: true, step: 0.14 }),
      cork: material({ base: 0xa8c8dc }),
      hot: material({ base: 0xf0ffff, glow: true }),
    },
    glow: [0xe8fbff, 0x5ab8e8],
    draw(r, t, m, o = {}) {
      const fill = filler(r, o);
      const g = o.group ?? 7;
      neck(r, t, m, o, 1.8, 3.8, 0.9);
      // Frost crusted on the stopper.
      if (!o.open) fill(t.cap(4.6, -0.6, 5.5, 0.6, 0.5), m('ice'), 0.5);
      fill(t.circ(-1, 0, 3.4), m('glass'), 2.2);
      fill(intersect(t.circ(-1, 0, 2.8), t.rect(-2.2, 0, 2.6, 4)), m('liquid'), 1.8);
      // Crystals: two shards breaking through the glass.
      fill(t.poly([-1.4, 2.6, -0.6, 4.9, 0.2, 2.8]), m('ice'), 0.6);
      fill(t.poly([-3.4, -2.0, -4.6, -3.6, -2.6, -2.8]), m('ice'), 0.6);
      fill(t.poly([0.4, -2.6, 1.2, -3.7, 1.3, -2.2]), m('ice'), 0.5);
      // A cold glint swirling inside.
      const k = (o.frame ?? 0) % 3;
      const s = [[-1.8, -0.6], [-0.6, -1.4], [-2.4, 0.2]][k];
      r.dot(t.x(s[0], s[1]), t.y(s[0], s[1]), m('hot'), 4, g);
      r.dot(t.x(-2.2, 1.4), t.y(-2.2, 1.4), m('ice'), 4, g);
    },
  }),
  // A chunky bottle of murky green troll blood, a curved tusk for a stopper.
  troll_tonic: () => ({
    mats: {
      glass: material({ base: 0x3a5a36, shiny: true, step: 0.12 }),
      liquid: material({ base: 0x6a7a2a, step: 0.12 }),
      cork: material({ base: 0xece0c0, shiny: true }),
      cord: material({ base: 0x7a5a3a }),
      hot: material({ base: 0xc8ff6a, glow: true }),
    },
    glow: [0xb8f070, 0x3a8a2a],
    draw(r, t, m, o = {}) {
      const fill = filler(r, o);
      const g = o.group ?? 7;
      // Short, thick neck with a twine wrap.
      fill(t.cap(1.6, 0, 3.4, 0, 1.4, 1.2), m('glass'), 1);
      fill(t.cap(3.4, 0, 3.7, 0, 1.6), m('glass'), 0.8);
      fill(t.rect(2.4, 0, 0.45, 1.5), m('cord'), 0.5, { noLine: true });
      // The tusk: jammed in the neck, curving up and back.
      if (!o.open) fill(union(t.cap(3.6, 0.2, 5.4, -0.4, 1.0, 0.8), t.cap(5.4, -0.4, 6.6, -2.0, 0.8, 0.35)), m('cork'), 1);
      // A squat, square-shouldered body.
      fill(t.rect(-1.3, 0, 3.1, 3.3, 1.4), m('glass'), 2.2);
      fill(intersect(t.rect(-1.5, 0, 2.5, 2.7, 1), t.rect(-2.2, 0, 2.6, 4)), m('liquid'), 1.6);
      // Sludge bubbles, one of them faintly glowing.
      const k = (o.frame ?? 0) % 3;
      r.dot(t.x(-2.6 + k * 0.6, -1.2), t.y(-2.6 + k * 0.6, -1.2), m('hot'), 3, g);
      r.dot(t.x(-1.0, 1.1 - k * 0.4), t.y(-1.0, 1.1 - k * 0.4), m('liquid'), 4, g);
      r.dot(t.x(-3.4, 0.6), t.y(-3.4, 0.6), m('liquid'), 4, g);
    },
  }),
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
