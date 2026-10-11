import { material } from '../pixel/raster';
import { union, type Shape } from '../pixel/sdf';
import { fillAll, hangAt, M, type WeaponArt } from './weaponKit';

/**
 * Fist weapons: worn over the hands, one on each. Drawn in hand space: the
 * origin is the centre of the hand, +x runs down the forearm's line out
 * through the knuckles, +y is the back of the hand (thumb on top). The same
 * art goes on both fists; the far one is drawn a tone darker.
 */

/** Padded leather mitts with a laced white cuff and a gold maker's badge. */
export function boxingGloves(): WeaponArt {
  return {
    tip: 5,
    mats: {
      leather: material({ base: 0xc8282e, shiny: true, step: 0.14 }),
      cuff: material({ base: 0xf0ece4 }),
      lace: material({ base: 0x3a2a30 }),
      badge: M.gold(),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      // Cuff up the wrist, laced down the middle.
      fillAll(r, [t.cap(-5.2, 0, -2.4, 0, 2.3, 2.5)], m('cuff'), o, 1.2);
      for (const x of [-4.6, -3.6, -2.6]) r.dot(t.x(x, 0.4), t.y(x, 0.4), m('lace'), 1, g);
      // The padded mitt: a fat knuckle roll with the thumb tucked along the top.
      fillAll(r, [union(t.ell(1.1, 0, 3.6, 3.1), t.ell(-0.8, 0.2, 2.6, 2.7))], m('leather'), o, 2.2);
      fillAll(r, [t.ell(0.2, 2.5, 2.2, 1.05, -0.15)], m('leather'), o, 1, -1);
      fillAll(r, [t.rect(-1.4, -0.6, 0.7, 0.75, 0.3)], m('badge'), o, 0.8);
    },
  };
}

/** Brass knuckles with a row of steel spikes, over hands taped for a street fight. */
export function spikedKnuckles(): WeaponArt {
  return {
    tip: 6,
    mats: {
      tape: material({ base: 0xd8d0bc }),
      brass: material({ base: 0xd8a040, shiny: true, step: 0.14 }),
      spike: material({ base: 0xc8d0dc, shiny: true, step: 0.16 }),
      gem: material({ base: 0xe02a3a, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      // Tape around the wrist and across the palm.
      fillAll(r, [t.cap(-4.2, 0, -1.4, 0, 1.75, 1.95)], m('tape'), o, 1);
      for (const x of [-3.6, -2.2]) r.line(t.x(x - 0.4, -1.7), t.y(x - 0.4, -1.7), t.x(x + 0.4, 1.8), t.y(x + 0.4, 1.8), m('tape'), 1, g);
      // The brass bar over the knuckles, a grip curling back under the palm.
      fillAll(r, [union(t.rect(1.8, 0, 1.25, 3.0, 0.6), t.cap(0.6, -2.6, -1.4, -1.8, 0.8))], m('brass'), o, 1.3);
      for (const y of [-1.8, 0, 1.8]) r.dot(t.x(1.0, y), t.y(1.0, y), m('brass'), 1, g);
      const spikes: Shape[] = [];
      for (const y of [-1.85, -0.6, 0.6, 1.85]) spikes.push(t.poly([2.8, y - 0.65, 5.8, y, 2.8, y + 0.65]));
      fillAll(r, [union(...spikes)], m('spike'), o, 0.7);
      // A ruby set in the middle of the bar: the one thing that catches the light at night.
      r.dot(t.x(1.9, 0), t.y(1.9, 0), m('gem'), 3, g);
    },
  };
}

/** A monk's cloth wraps bound up to the elbow, a prayer-bead cuff and a glowing spirit rune on the back of the hand. */
export function spiritWraps(): WeaponArt {
  return {
    tip: 4,
    mats: {
      wrap: material({ base: 0xe8e0cc }),
      wrapShade: material({ base: 0xb8ac94 }),
      bead: material({ base: 0x6a3a2a, shiny: true }),
      rune: material({ base: 0x6af0dc, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      // Bound from the forearm over the knuckles, in overlapping turns.
      fillAll(r, [t.cap(-7.4, 0, 0.6, 0, 1.7, 2.15)], m('wrap'), o, 1.4);
      for (const x of [-6.4, -4.8, -1.4, 0.2]) r.line(t.x(x - 0.6, -1.9), t.y(x - 0.6, -1.9), t.x(x + 0.6, 2), t.y(x + 0.6, 2), m('wrapShade'), 2, g);
      // A loose end of the binding hangs from the wrist.
      const h = hangAt(t, -3.4, -1.4);
      fillAll(r, [h.poly([0, -0.5, 3.8, -0.9, 4.6, 0.2, 0.4, 0.6])], m('wrapShade'), o, 0.8);
      // Prayer beads around the wrist.
      for (const y of [-1.8, -0.6, 0.6, 1.8]) fillAll(r, [t.circ(-2.9, y, 0.7)], m('bead'), o, 0.6);
      // The spirit rune glows on the back of the hand.
      r.line(t.x(-0.8, 1.6), t.y(-0.8, 1.6), t.x(0.8, 1.6), t.y(0.8, 1.6), m('rune'), 3, g);
      r.dot(t.x(0, 1.2), t.y(0, 1.2), m('rune'), 4, g);
    },
  };
}
