import { material } from '../pixel/raster';
import { union, type Shape } from '../pixel/sdf';
import { chainLine, fillAll, hangAt, M, type WeaponArt } from './weaponKit';
import type { Xf } from './xform';

/**
 * Art for the third wave of weapons (same conventions as weapons.ts: the
 * origin is the grip, +x runs toward the business end, +y is the spine
 * side, −y the edge that leads a forehand swing).
 */

/** Teeth along the edge of a blade, from x0 to x1 at edge height y (pointing −y). */
function teeth(t: Xf, x0: number, x1: number, y0: number, y1: number, n: number, depth: number): Shape {
  const out: Shape[] = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, a = x0 + (x1 - x0) * (i / n), b = x0 + (x1 - x0) * ((i + 1) / n);
    const y = y0 + (y1 - y0) * u;
    out.push(t.poly([a, y + 0.6, b, y + 0.6, b - 0.2, y - depth]));
  }
  return union(...out);
}

/** The Bloodletter: a broad serrated saber, a crimson groove down the spine and a ruby in the pommel. */
export function bloodletter(): WeaponArt {
  return {
    tip: 29,
    mats: {
      blade: material({ base: 0xb4bcc8, shiny: true, step: 0.15 }), teeth: material({ base: 0x8a94a4, shiny: true }),
      groove: material({ base: 0x9a1a2a, shiny: true }), guard: material({ base: 0x3a3440, shiny: true }),
      grip: M.wrap(0x5a1a24), wrapHi: M.wrap(0xa83040), ruby: M.glow(0xff3a4a),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-5.4, 0, -0.8, 0, 1.25, 1.1)], m('grip'), o, 1);
      for (let x = -4.8; x < -1; x += 1.4) r.line(t.x(x - 0.4, -1), t.y(x - 0.4, -1), t.x(x + 0.4, 1), t.y(x + 0.4, 1), m('wrapHi'), 2, g);
      fillAll(r, [t.circ(-6, 0, 1.55), t.poly([-7, -0.8, -8.6, 0, -7, 0.8])], m('guard'), o, 1.2);
      r.dot(t.x(-6, 0), t.y(-6, 0), m('ruby'), 3, g);
      // Broad blade, swelling toward a clipped point, its edge (−y) cut with teeth.
      fillAll(r, [teeth(t, 4, 22, -1.6, -2.3, 7, 1.3)], m('teeth'), o, 1);
      fillAll(r, [t.poly([1.6, -1.6, 14, -2.2, 22.5, -2.4, 28.8, -0.4, 26.4, 1.5, 18, 1.7, 1.6, 1.5])], m('blade'), o, 1.4);
      // The blood groove runs along the spine.
      r.line(t.x(3, 0.5), t.y(3, 0.5), t.x(21, 0.4), t.y(21, 0.4), m('groove'), 2, g);
      r.line(t.x(3, -0.4), t.y(3, -0.4), t.x(19, -0.8), t.y(19, -0.8), m('blade'), 4, g);
      // A hooked crossguard: the front quillon curls back toward the hand.
      fillAll(r, [t.rect(1, 0, 1.1, 4.4, 0.4), t.cap(1.4, -2.1, 3.4, -3.6, 0.7, 0.5), t.cap(0.6, 2.1, -0.8, 3.4, 0.7, 0.5)], m('guard'), o, 1.2);
      r.dot(t.x(1, 0), t.y(1, 0), m('ruby'), 3, g);
    },
  };
}

/** Grappling hook: three iron prongs on a ring, a coil of rope looped over the fist. */
export function grapnel(): WeaponArt {
  return {
    tip: 9,
    mats: { iron: material({ base: 0x6a7080, shiny: true }), point: M.steel(), rope: material({ base: 0xb89a68 }), ropeDark: material({ base: 0x8a7048 }) },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      // The coil hangs below the fist.
      const H = hangAt(t, -1, 0);
      for (const [x, w] of [[3.2, 2.6], [3.8, 2.2]] as const) {
        const a = H.p(0.4, -w), c = H.p(x + 2.4, 0), b = H.p(0.4, w);
        chainLine(r, a[0], a[1], c[0], c[1], b[0], b[1], m(x > 3.5 ? 'ropeDark' : 'rope'), g);
      }
      fillAll(r, [t.cap(-2, 0, 4, 0, 0.75)], m('iron'), o, 1);
      fillAll(r, [t.circ(-2.4, 0, 1.2)], m('iron'), o, 1);
      // Three prongs curling back off the crown.
      fillAll(r, [
        t.cap(4, 0, 7.8, 0, 0.75, 0.55),
        t.cap(4, 0, 6.4, -2.6, 0.7, 0.5), t.cap(6.4, -2.6, 5.2, -4.2, 0.5, 0.35),
        t.cap(4, 0, 6.4, 2.6, 0.7, 0.5), t.cap(6.4, 2.6, 5.2, 4.2, 0.5, 0.35),
      ], m('iron'), o, 1);
      fillAll(r, [t.poly([7.6, -0.6, 9.2, 0, 7.6, 0.6]), t.poly([5.6, -3.8, 4.4, -4.8, 5, -3.4]), t.poly([5.6, 3.8, 4.4, 4.8, 5, 3.4])], m('point'), o, 0.8);
    },
  };
}
