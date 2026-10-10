import { material } from '../pixel/raster';
import { union, type Shape } from '../pixel/sdf';
import { grain } from '../pixel/tex';
import { chainLine, fillAll, hangAt, M, type WeaponArt } from './weaponKit';
import type { Xf } from './xform';

/**
 * Art for the second wave of weapons (same conventions as weapons.ts: the
 * origin is the grip, +x runs toward the business end, +y is the spine
 * side, −y the edge that leads a forehand swing).
 */

/** Caps through a list of points (x, y, radius), for curved hafts, horns and bows. */
function bend(t: Xf, pts: number[]): Shape {
  const out: Shape[] = [];
  for (let i = 0; i + 5 < pts.length; i += 3) out.push(t.cap(pts[i], pts[i + 1], pts[i + 3], pts[i + 4], pts[i + 2], pts[i + 5]));
  return union(...out);
}

// -----------------------------------------------------------------------------
// Main weapons
// -----------------------------------------------------------------------------

/** Kusarigama: a hooked sickle on a short haft, its chain coiled round the grip and hanging to a weight. */
export function chainSickle(): WeaponArt {
  return {
    tip: 16,
    mats: {
      blade: material({ base: 0xbccad8, shiny: true, step: 0.15 }), haft: M.darkWood(), collar: M.darkSteel(),
      chain: material({ base: 0xb0bac8, shiny: true }), weight: material({ base: 0x5a6274, shiny: true }), wrap: M.wrap(0x7a2a3a),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      // The chain hangs from the butt ring in a short loop, swinging back under its weight.
      const butt = t.p(-5.8, 0);
      const back = -Math.cos(t.ang) * Math.sign(t.sx || 1);
      const H = hangAt(t, -5.8, 0);
      const end = H.p(7.2, back * 1.6);
      chainLine(r, butt[0], butt[1], butt[0] + back * 3.5, butt[1] + 2.5, end[0], end[1], m('chain'), g);
      fillAll(r, [H.cap(7.6, back * 1.6, 10.4, back * 1.8, 1.25, 1.55)], m('weight'), o, 1.2);
      r.dot(H.x(10.6, back * 1.8 + 0.4), H.y(10.6, back * 1.8 + 0.4), m('weight'), 4, g);
      fillAll(r, [t.cap(-5, 0, 10, 0, 1.2, 1.05)], m('haft'), o, 1);
      fillAll(r, [t.cap(-1.2, 0, 2.6, 0, 1.4)], m('wrap'), o, 1);
      // Chain coiled round the grip.
      for (const x of [-4.4, -2.9]) r.line(t.x(x - 0.5, -1.3), t.y(x - 0.5, -1.3), t.x(x + 0.5, 1.3), t.y(x + 0.5, 1.3), m('chain'), 3, g);
      fillAll(r, [t.circ(-5.9, 0, 1.25)], m('collar'), o, 1);
      fillAll(r, [t.rect(9.6, 0, 1.1, 1.6, 0.3)], m('collar'), o, 1);
      // Hooked blade sweeping forward off the top, the cutting edge on the inside.
      fillAll(r, [t.poly([
        8.6, 1.5, 11.6, 1.0, 13.5, -1.6, 14.2, -5, 13.4, -8.6, 11.4, -11.4, 8.4, -13.4, 4.6, -14.6,
        7.2, -11.8, 9.6, -9.1, 10.8, -6, 11, -3, 10.2, -0.9, 8.6, -0.6,
      ])], m('blade'), o, 1.5);
      // A bright bevel along the inner edge.
      const e = [5.6, -13.6, 8.2, -11.8, 9.9, -9.4, 11.0, -6.2, 11.3, -3];
      for (let i = 0; i + 3 < e.length; i += 2) r.line(t.x(e[i], e[i + 1]), t.y(e[i], e[i + 1]), t.x(e[i + 2], e[i + 3]), t.y(e[i + 2], e[i + 3]), m('blade'), 4, g);
    },
  };
}

/** The reaper's scythe: a long pale blade with a spectral edge, soul flames at the collar. */
export function soulScythe(): WeaponArt {
  return {
    tip: 34,
    grip2: 13,
    mats: {
      haft: material({ base: 0x3a2e44 }), wrap: M.wrap(0x2a5a4c), collar: material({ base: 0x5a6070, shiny: true }),
      blade: material({ base: 0xc8e4dc, shiny: true, step: 0.16 }), edge: M.glow(0x7affc8),
      flame: M.glow(0x5ae8a8), flameHot: M.glow(0xe0fff0), bone: material({ base: 0xe0d8c0 }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      // A gently bowed snath.
      fillAll(r, [bend(t, [-11, 0.2, 1.15, 4, 0.6, 1.15, 18, 0.5, 1.1, 32, -0.2, 1.05])], m('haft'), o, 1);
      fillAll(r, [t.poly([-10.6, -1, -14.2, 0.1, -10.6, 1.2])], m('bone'), o, 1);
      fillAll(r, [t.cap(-2, 0.45, 2, 0.55, 1.4), t.cap(11, 0.6, 15, 0.55, 1.4)], m('wrap'), o, 1);
      // Blade first, so the collar and its flames sit over the tang.
      fillAll(r, [t.poly([
        31.4, 1.8, 34.6, 0.8, 36.6, -2.8, 37.2, -7.5, 36.2, -12.6, 33.6, -17.2, 29.6, -21.2, 24.6, -24.2, 18.4, -25.8,
        22.4, -23, 27.4, -19.6, 30.9, -15.6, 32.7, -11, 33.1, -6.6, 32.5, -2.8, 30.8, -1,
      ])], m('blade'), o, 1.7);
      // Spectral edge on the inner curve, a dark fuller along the spine.
      const e = [19.6, -25, 23, -22.6, 27.2, -19, 30.4, -15.2, 32, -11, 32.4, -6.6, 31.9, -3];
      for (let i = 0; i + 3 < e.length; i += 2) r.line(t.x(e[i], e[i + 1]), t.y(e[i], e[i + 1]), t.x(e[i + 2], e[i + 3]), t.y(e[i + 2], e[i + 3]), m('edge'), 3, g);
      const f = [34.6, -3, 35.1, -7.5, 34.2, -12.2, 32, -16.2];
      for (let i = 0; i + 3 < f.length; i += 2) r.line(t.x(f[i], f[i + 1]), t.y(f[i], f[i + 1]), t.x(f[i + 2], f[i + 3]), t.y(f[i + 2], f[i + 3]), m('blade'), 1, g);
      // Collar: an iron socket with a little bone skull riding the spine.
      fillAll(r, [t.rect(31.6, 0.2, 1.9, 1.9, 0.5)], m('collar'), o, 1.2);
      fillAll(r, [t.circ(33.2, 2.6, 1.7)], m('bone'), o, 1);
      r.dot(t.x(33.6, 2.2), t.y(33.6, 2.2), m('flame'), 3, g);
      // Soul flames licking off the back of the collar.
      fillAll(r, [t.poly([29.2, 1.6, 30.4, 4.2, 29.6, 6.6, 31.6, 4.8, 31.4, 2])], m('flame'), o);
      r.dot(t.x(30.4, 3.4), t.y(30.4, 3.4), m('flameHot'), 3, g);
      fillAll(r, [t.poly([35.4, 1.4, 37.6, 2.8, 38.8, 5, 36.4, 3.6])], m('flame'), o);
    },
  };
}

/** Duelist's rapier: a needle blade and a gold swept hilt with a silver shell. */
export function rapier(): WeaponArt {
  return {
    tip: 34,
    mats: { blade: M.steel(), guard: M.gold(), shell: material({ base: 0xd0d8e4, shiny: true, step: 0.14 }), grip: M.wrap(0x3a2a30), wire: M.gold(), pommel: M.gold() },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-5, 0, -0.4, 0, 1.05, 0.95)], m('grip'), o, 1);
      for (let x = -4.2; x < -0.6; x += 1.3) r.dot(t.x(x, 0.3), t.y(x, 0.3), m('wire'), 3, g);
      fillAll(r, [t.circ(-5.9, 0, 1.5), t.poly([-7, -0.7, -8.4, 0, -7, 0.7])], m('pommel'), o, 1.2);
      fillAll(r, [t.poly([1.4, -1.15, 5, -1, 19, -0.72, 33, -0.32, 35, 0, 33, 0.32, 19, 0.72, 5, 1, 1.4, 1.15])], m('blade'), o, 1);
      r.line(t.x(2.5, 0.35), t.y(2.5, 0.35), t.x(26, 0.2), t.y(26, 0.2), m('blade'), 4, g);
      // Swept hilt: shell cup, curled quillons and a knuckle bow down to the pommel.
      fillAll(r, [t.ell(1.5, 0, 1.15, 3.1)], m('shell'), o, 1.2);
      fillAll(r, [bend(t, [0.8, 4.9, 0.7, 1.0, -4.6, 0.62]), t.circ(1.9, 5.3, 0.9), t.circ(0, -5.2, 0.85)], m('guard'), o, 1);
      fillAll(r, [bend(t, [1.6, -3.4, 0.55, 3.4, -3.6, 0.55, 4.2, -2, 0.5])], m('guard'), o, 1);
      fillAll(r, [bend(t, [0.4, -4.4, 0.62, -2, -5, 0.6, -4.6, -4, 0.58, -6, -1.6, 0.6])], m('guard'), o, 1);
    },
  };
}

/** Storm rod: an iron rod with copper coils, a lightning crystal caged at the tip. */
export function stormRod(): WeaponArt {
  return {
    tip: 18,
    mats: {
      rod: material({ base: 0x5a6478, shiny: true }), grip: M.wrap(0x24304c), coil: material({ base: 0xd08a48, shiny: true }),
      cage: M.steel(), crystal: M.glow(0x7ad0ff), core: M.glow(0xf0ffff),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-4.6, 0, 11, 0, 1.0, 0.85)], m('rod'), o, 1);
      fillAll(r, [t.cap(-3.6, 0, 1.2, 0, 1.2)], m('grip'), o, 1);
      fillAll(r, [t.circ(-5.2, 0, 1.3)], m('coil'), o, 1.2);
      // Copper wire coiled round the rod.
      for (let x = 3.4; x <= 8.2; x += 1.2) fillAll(r, [t.poly([x - 0.7, -1.3, x - 0.1, -1.3, x + 0.7, 1.3, x + 0.1, 1.3])], m('coil'), o, 0.6);
      // Lightning crystal, then the cage prongs over it meeting in a spike.
      fillAll(r, [t.poly([11.4, 0, 13.8, -2, 17.6, 0, 13.8, 2])], m('crystal'), o);
      r.dot(t.x(14, 0), t.y(14, 0), m('core'), 4, g);
      r.dot(t.x(15.2, 0.6), t.y(15.2, 0.6), m('core'), 4, g);
      fillAll(r, [t.rect(11, 0, 0.8, 1.9, 0.3)], m('cage'), o, 1);
      fillAll(r, [bend(t, [11.2, -1.6, 0.48, 13.6, -2.7, 0.45, 16.6, -1.7, 0.42, 18.4, 0, 0.5]), bend(t, [11.2, 1.6, 0.48, 13.6, 2.7, 0.45, 16.6, 1.7, 0.42, 18.4, 0, 0.5])], m('cage'), o, 0.8);
      fillAll(r, [t.poly([18, -0.6, 20.4, 0, 18, 0.6])], m('cage'), o, 0.8);
    },
  };
}

/** Halberd: an axe blade with a back spike under a spear point, on a long pole. */
export function halberd(): WeaponArt {
  return {
    tip: 41,
    grip2: 12,
    mats: { haft: M.wood(), head: M.steel(), spike: M.darkSteel(), band: M.darkSteel(), wrap: M.leather(), tassel: M.cloth(0x2f5fd0) },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-11.5, 0, 33, 0, 1.15, 1.05)], m('haft'), o, 1);
      fillAll(r, [t.poly([-11.4, -1.2, -13.6, 0, -11.4, 1.2]), t.rect(22.8, 0, 0.8, 1.55), t.rect(-0.2, 0, 0.6, 1.5)], m('band'), o, 1);
      fillAll(r, [t.cap(1, 0, 4, 0, 1.38)], m('wrap'), o, 1);
      // Langets running down from the socket.
      fillAll(r, [t.poly([23.8, -1.25, 32, -1.25, 32, 1.25, 23.8, 1.25])], m('band'), o, 0.8);
      // Back spike, curving down like a beak.
      fillAll(r, [t.poly([27.2, 1, 28.4, 3.8, 27, 8.4, 30.2, 4.6, 31.2, 1])], m('spike'), o, 1.2);
      // Axe blade: a broad cleaver with horns at both ends of a convex edge.
      fillAll(r, [t.poly([
        26.2, -1, 25, -4, 22.8, -8.2, 23.2, -10.4, 26, -10.8, 29.2, -11.2, 32.4, -11.6, 34.6, -12.4,
        33.8, -8.4, 33.2, -4.4, 32.6, -1,
      ])], m('head'), o, 1.8);
      r.line(t.x(23.6, -10.1), t.y(23.6, -10.1), t.x(33.6, -11.4), t.y(33.6, -11.4), m('head'), 4, g);
      // A hole punched through the blade's heart.
      r.dot(t.x(29.5, -5.6), t.y(29.5, -5.6), m('spike'), 0, g);
      // Spear point with a raised ridge.
      fillAll(r, [t.poly([32.6, -1.15, 35, -2, 42.4, 0, 35, 2, 32.6, 1.15])], m('head'), o, 1.4);
      r.line(t.x(34, 0), t.y(34, 0), t.x(40, 0), t.y(40, 0), m('head'), 4, g);
      fillAll(r, [t.rect(32.6, 0, 0.7, 1.7)], m('band'), o, 1);
      fillAll(r, [t.poly([23.4, 1, 21.8, 2.6, 20, 2.2, 22.4, 0.6])], m('tassel'), o, 1);
    },
  };
}

/** Grave staff: an ash shaft knotted like a spine, a horned skull cradling a soul light. */
export function graveStaff(): WeaponArt {
  return {
    tip: 39,
    grip2: 12,
    mats: {
      shaft: material({ base: 0xb0a288, tex: grain(-1) }), bone: material({ base: 0xe6dec6, step: 0.12 }), horn: material({ base: 0x4a3c40, shiny: true }),
      wrap: M.wrap(0x36302e), socket: material({ base: 0x241c22 }), soul: M.glow(0x8affc0), soulHot: M.glow(0xeafff2),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-20, 0, 26.5, 0, 1.15, 1.0)], m('shaft'), o, 1);
      fillAll(r, [t.poly([-19.8, -1.1, -23.4, 0, -19.8, 1.1])], m('bone'), o, 1);
      // Vertebrae knuckling up the top of the shaft.
      fillAll(r, [t.ell(20.4, 0, 0.75, 1.65), t.ell(22.6, 0, 0.75, 1.7), t.ell(24.8, 0, 0.75, 1.75)], m('bone'), o, 1);
      fillAll(r, [t.cap(-1.8, 0, 1.8, 0, 1.38), t.cap(10.6, 0, 13.4, 0, 1.35)], m('wrap'), o, 1);
      // Horns rising either side, cradling the light.
      fillAll(r, [bend(t, [30, -2.6, 1.3, 33.4, -4.6, 1.05, 37, -4.4, 0.75, 39.8, -2, 0.45])], m('horn'), o, 1.2);
      fillAll(r, [bend(t, [30.4, 2.8, 1.3, 33.6, 4.8, 1.05, 37.2, 4.4, 0.75, 39.8, 2, 0.45])], m('horn'), o, 1.2);
      fillAll(r, [t.circ(35.6, 0, 2.6), t.poly([36.5, -1.4, 39.4, 0.2, 36.5, 1.6])], m('soul'), o);
      fillAll(r, [t.circ(35.4, 0.2, 1.2)], m('soulHot'), o);
      // The skull, facing forward (the −y side when the staff stands upright).
      fillAll(r, [t.circ(29.6, 0.9, 3.4), t.rect(28.2, -2.6, 1.9, 2.0, 0.7)], m('bone'), o, 1.5);
      r.dot(t.x(30.9, -1.1), t.y(30.9, -1.1), m('socket'), 0, g);
      r.dot(t.x(29.9, -1.1), t.y(29.9, -1.1), m('soul'), 3, g);
      r.line(t.x(26.8, -2.6), t.y(26.8, -2.6), t.x(26.8, -4.2), t.y(26.8, -4.2), m('socket'), 0, g);
      r.dot(t.x(28.4, -1.9), t.y(28.4, -1.9), m('socket'), 1, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Secondary weapons
// -----------------------------------------------------------------------------

/** Three weighted stones on leather cords, hanging bunched from the fist. */
export function bolas(): WeaponArt {
  return {
    tip: 7,
    mats: { stone: material({ base: 0x8a8070, step: 0.13 }), stone2: material({ base: 0x6e6458, step: 0.13 }), cord: M.leather(), knot: material({ base: 0xb08a58 }), band: material({ base: 0xc8a060 }) },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      const H = hangAt(t, 0, 0);
      const ends: [number, number, number, string][] = [[6.4, -2.6, 1.7, 'stone2'], [5.4, 2.8, 1.6, 'stone'], [8, 0.3, 1.85, 'stone']];
      for (const [x, y] of ends) r.line(H.x(0.5, 0), H.y(0.5, 0), H.x(x, y), H.y(x, y), m('cord'), 2, g);
      for (const [x, y, rad, k] of ends) {
        fillAll(r, [H.circ(x, y, rad)], m(k), o, 1.4);
        // Leather strap round each stone.
        r.line(H.x(x - rad + 0.5, y - 0.4), H.y(x - rad + 0.5, y - 0.4), H.x(x - rad + 0.5, y + 0.4), H.y(x - rad + 0.5, y + 0.4), m('band'), 2, g);
      }
      fillAll(r, [H.circ(0.6, 0, 1.0)], m('knot'), o, 1);
    },
  };
}

/** A big two-faced coin on a cord: sun on one half, moon on the other. */
export function tricksterTalisman(): WeaponArt {
  return {
    tip: 13,
    mats: {
      cord: M.cloth(0xc8343a), gold: M.gold(), silver: material({ base: 0xc8d0e4, shiny: true, step: 0.14 }),
      sun: material({ base: 0xffb02a, shiny: true }), moon: material({ base: 0x34306a }),
      sunEye: M.glow(0xfff0a0), star: M.glow(0xd8e8ff), tassel: M.cloth(0xc8343a),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      const cx = 8.6, rad = 4.6;
      r.line(t.x(-0.5, 0), t.y(-0.5, 0), t.x(cx - rad, 0), t.y(cx - rad, 0), m('cord'), 2, g);
      fillAll(r, [t.circ(1.6, 0, 1)], m('cord'), o, 1);
      // Sun rays on the gold half.
      const rays: Shape[] = [];
      for (const a of [-0.45, -1.05, -1.6, -2.15, -2.7]) {
        const c = Math.cos(a), s = Math.sin(a);
        rays.push(t.poly([cx + c * rad - s * 1.2, s * rad + c * 1.2, cx + c * (rad + 1.9), s * (rad + 1.9), cx + c * rad + s * 1.2, s * rad - c * 1.2]));
      }
      fillAll(r, [union(...rays)], m('gold'), o, 0.8);
      // Rim: gold on the sun's side, silver on the moon's.
      fillAll(r, [t.circ(cx, 0, rad)], m('gold'), o, 1.6);
      fillAll(r, [t.poly(half(cx, rad + 0.1, 1))], m('silver'), o, 1.6);
      // Face: a yin-yang of sun and moon.
      const f = rad - 1.1;
      r.fill(t.circ(cx, 0, f), m('sun'), { group: g, bevel: 2.2, toneBias: o.toneBias, noLine: true, local: o.local });
      r.fill(t.poly(half(cx, f, 1)), m('moon'), { group: g, bevel: 2.2, toneBias: o.toneBias, noLine: true, local: o.local });
      r.fill(t.circ(cx - f / 2, 0, f / 2), m('moon'), { group: g, bevel: 1, toneBias: o.toneBias, noLine: true, local: o.local });
      r.fill(t.circ(cx + f / 2, 0, f / 2), m('sun'), { group: g, bevel: 1, toneBias: o.toneBias, noLine: true, local: o.local });
      r.dot(t.x(cx + f / 2, -0.4), t.y(cx + f / 2, -0.4), m('sunEye'), 3, g);
      r.dot(t.x(cx - f / 2, 0.6), t.y(cx - f / 2, 0.6), m('star'), 3, g);
      fillAll(r, [t.poly([cx + rad - 0.4, -0.7, cx + rad + 2.6, -1.4, cx + rad + 2.6, 1.4, cx + rad - 0.4, 0.7])], m('tassel'), o, 0.8);
    },
  };
}

/** Half-disc polygon on the +y side (k = 1) or −y side (k = −1) of a coin at (cx, 0). */
function half(cx: number, rad: number, k: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI;
    out.push(cx + Math.cos(a) * rad, k * Math.sin(a) * rad);
  }
  return out;
}

/** Tower shield: a tall iron-banded wall with rivets and a boss. Long axis along x, like the kite shield. */
export function towerShield(): WeaponArt {
  return {
    tip: 14,
    mats: { face: material({ base: 0x52627e }), rim: M.steel(), band: material({ base: 0x8a96a8, shiny: true }), rivet: M.steel(), boss: M.gold() },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      const flat = (s: Shape, k: string, bevel: number) => r.fill(s, m(k), { group: g, bevel, toneBias: o.toneBias, noLine: true, local: o.local });
      // Top edge arched, sides gently curved, square foot.
      const outer = t.poly([-13.4, -6.8, -14.6, -3.4, -15, 0, -14.6, 3.4, -13.4, 6.8, 13.6, 7.2, 14.6, 6.4, 14.6, -6.4, 13.6, -7.2]);
      fillAll(r, [outer], m('rim'), o, 2.2);
      flat(t.poly([-12.4, -5.7, -13.4, -2.9, -13.7, 0, -13.4, 2.9, -12.4, 5.7, 13.2, 6, 13.2, -6]), 'face', 4);
      // Iron bands across, one down the middle.
      for (const x of [-7.4, 6.4]) flat(t.rect(x, 0, 0.95, 6.2), 'band', 1);
      flat(t.rect(0, 0, 13, 0.85), 'band', 1);
      flat(t.circ(-0.5, 0, 2.6), 'band', 1.4);
      flat(t.circ(-0.5, 0, 1.6), 'boss', 1.2);
      for (const x of [-7.4, 6.4]) for (const y of [-4.6, -2.4, 2.4, 4.6]) r.dot(t.x(x, y), t.y(x, y), m('rivet'), 4, g);
      for (const x of [-11, 11.6]) for (const y of [-4.8, 4.8]) r.dot(t.x(x, y), t.y(x, y), m('rivet'), 3, g);
    },
  };
}

/** A light throwing spear: slim ash shaft, bound grip, leaf-shaped head. */
export function javelin(): WeaponArt {
  return {
    tip: 22,
    mats: { shaft: material({ base: 0xb08a58 }), head: M.steel(), binding: material({ base: 0xe0d0a8 }), butt: M.darkSteel(), tuft: M.cloth(0xc83a3a) },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-14, 0, 16, 0, 0.78, 0.7)], m('shaft'), o, 0.9);
      fillAll(r, [t.poly([-14, -0.75, -15.8, 0, -14, 0.75])], m('butt'), o, 0.8);
      for (let x = -2; x <= 2; x += 1) r.line(t.x(x - 0.3, -0.9), t.y(x - 0.3, -0.9), t.x(x + 0.3, 0.9), t.y(x + 0.3, 0.9), m('binding'), x % 2 ? 1 : 3, g);
      fillAll(r, [t.cap(14.4, 0, 16.2, 0, 0.95)], m('binding'), o, 0.8);
      fillAll(r, [t.poly([15.8, -0.8, 18.4, -1.9, 23.6, 0, 18.4, 1.9, 15.8, 0.8])], m('head'), o, 1.2);
      r.line(t.x(17, 0), t.y(17, 0), t.x(22, 0), t.y(22, 0), m('head'), 4, g);
      fillAll(r, [t.poly([14.2, 0.6, 12.6, 2.2, 11.8, 1.6, 13.6, 0.4])], m('tuft'), o, 0.8);
    },
  };
}

/** Iron cestus: a studded iron knuckle plate over a leather-strapped fist, worn on the off hand. */
export function ironCestus(): WeaponArt {
  return {
    tip: 5,
    mats: { strap: material({ base: 0x7a4a2c }), plate: material({ base: 0x6a7488, shiny: true }), knuckle: M.steel(), stud: M.steel(), lace: material({ base: 0xd8b888 }) },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      // Leather wrapped up the forearm, laced.
      fillAll(r, [t.cap(-6.2, 0, -1, 0, 1.75, 2.1)], m('strap'), o, 1.2);
      for (const x of [-5, -3.4]) r.line(t.x(x - 0.5, -1.7), t.y(x - 0.5, -1.7), t.x(x + 0.5, 1.9), t.y(x + 0.5, 1.9), m('lace'), 2, g);
      // Iron over the back of the fist, a heavy knuckle bar with studs.
      fillAll(r, [t.rect(0.4, 0, 2.2, 2.6, 0.9)], m('plate'), o, 1.4);
      fillAll(r, [t.rect(2.9, 0, 1.0, 2.9, 0.5)], m('knuckle'), o, 1.1);
      const studs: Shape[] = [];
      for (const y of [-1.9, 0, 1.9]) studs.push(t.poly([3.6, y - 0.75, 5.3, y, 3.6, y + 0.75]));
      fillAll(r, [union(...studs)], m('stud'), o, 0.8);
      r.dot(t.x(0.2, 1.4), t.y(0.2, 1.4), m('stud'), 4, g);
    },
  };
}

