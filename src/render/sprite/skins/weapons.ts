import { material, type Raster, type Tex } from '../../pixel/raster';
import { subtract, union, type Shape } from '../../pixel/sdf';
import { bands, damascus, flow, glint, grain, hash, lattice, speckle } from '../../pixel/tex';
import { fillAll, M, type WeaponArt, type WeaponDrawOpts } from '../weaponKit';
import type { Xf } from '../xform';

/**
 * Reshaped weapons for mythic and legendary skins. Each keeps its stock
 * weapon's grip point and two-hand grip (`grip2`), and a reach close to it,
 * so every animation, hand position and trail still lines up.
 *
 * Legendary pieces use `phase` (the animation frame) for parts that move:
 * light running along a blade, a turning sun, stars orbiting an orb. Steps
 * are picked so the four idle frames loop seamlessly.
 */

/** Wavy polygon around a centre line: points from `x0` to `x1`, half width `w(u)`, centre offset `c(x)`. */
function ribbon(x0: number, x1: number, step: number, w: (u: number) => number, c: (x: number) => number, tip: [number, number]): number[] {
  const top: number[] = [], bot: number[] = [];
  for (let x = x0; x <= x1 + 1e-6; x += step) {
    const u = (x - x0) / (x1 - x0);
    top.push(x, c(x) + w(u));
    bot.push(x, c(x) - w(u));
  }
  const pts = [...top, tip[0], tip[1]];
  for (let i = bot.length - 2; i >= 0; i -= 2) pts.push(bot[i], bot[i + 1]);
  return pts;
}

/** Light-on-dark ramp for materials whose texture picks out glowing veins or stars at tone 4. */
const veined = (dark: number[], hot: number, tex: Tex) => material({ base: dark[2], ramp: [...dark, hot], tex });

// -----------------------------------------------------------------------------
// Swords and daggers
// -----------------------------------------------------------------------------

export function wyrmfang(): WeaponArt {
  // Serrated bone blade, swept wing guard, claw pommel.
  const edge: number[] = [2, 1.5, 26, 1.3, 31, 0];
  for (let x = 26; x >= 4; x -= 3) edge.push(x, -1.7, x - 1.6, -0.9);
  edge.push(2, -1.5);
  return {
    tip: 31,
    mats: {
      bone: material({ base: 0xe8dcc0, shiny: true, step: 0.13, tex: speckle(0.07, -1) }),
      spine: material({ base: 0x8a1e2a, shiny: true }),
      guard: material({ base: 0x4a4458, shiny: true }),
      grip: material({ base: 0x6a1e28, tex: bands(2, 1, -1) }),
      eye: M.glow(0xff4a3a),
    },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-5.2, 0, -1, 0, 1.3, 1.1)], m('grip'), o, 1);
      fillAll(r, [t.poly([-7.6, 0, -5.6, -1.9, -4.4, 0, -5.6, 1.9])], m('bone'), o, 1.2);
      fillAll(r, [t.poly(edge)], m('bone'), o, 1.4);
      r.line(t.x(3, 0.4), t.y(3, 0.4), t.x(23, 0.3), t.y(23, 0.3), m('spine'), 2, o.group ?? 6);
      fillAll(r, [union(
        t.rect(1, 0, 1.1, 1.8, 0.4),
        t.poly([0.2, 0.6, 3, 5.6, 1.6, 6.6, -0.8, 2.2]),
        t.poly([0.2, -0.6, 3, -5.6, 1.6, -6.6, -0.8, -2.2]),
      )], m('guard'), o, 1.2);
      r.dot(t.x(1, 0), t.y(1, 0), m('eye'), 3, o.group ?? 6);
    },
  };
}

export function dawnbreaker(): WeaponArt {
  // Broad white-gold blade with light running up it, a sun-disc guard whose rays turn.
  return {
    tip: 32,
    mats: {
      blade: material({ base: 0xfff0c8, shiny: true, step: 0.12, tex: flow(8, 2, 2, 1) }),
      core: M.glow(0xffd860),
      gold: material({ base: 0xe8b030, shiny: true, step: 0.15 }),
      ray: M.glow(0xffc040),
      gem: M.glow(0xff8a2a),
      grip: material({ base: 0x8a3a20, tex: bands(2, 1, 1) }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-5.6, 0, -1.6, 0, 1.25, 1.1)], m('grip'), o, 1);
      fillAll(r, [t.poly([-8.2, 0, -6.6, -1.7, -5, 0, -6.6, 1.7])], m('gold'), o, 1.2);
      r.dot(t.x(-6.6, 0), t.y(-6.6, 0), m('gem'), 3, g);
      fillAll(r, [t.poly([2, -2.2, 8, -2.7, 24, -2.0, 32, 0, 24, 2.0, 8, 2.7, 2, 2.2])], m('blade'), o, 1.6);
      r.line(t.x(4, 0), t.y(4, 0), t.x(25, 0), t.y(25, 0), m('core'), 3, g);
      // Sun guard: rays turn a little every frame.
      const rays: Shape[] = [];
      const spin = r.phase * (Math.PI / 16);
      for (let k = 0; k < 8; k++) {
        const a = spin + (k / 8) * Math.PI * 2;
        const len = k % 2 ? 4.2 : 5.4;
        rays.push(t.poly([1.2 + Math.cos(a - 0.3) * 2, Math.sin(a - 0.3) * 2, 1.2 + Math.cos(a) * len, Math.sin(a) * len, 1.2 + Math.cos(a + 0.3) * 2, Math.sin(a + 0.3) * 2]));
      }
      r.fill(union(...rays), m('ray'), { group: g });
      fillAll(r, [t.circ(1.2, 0, 2.5)], m('gold'), o, 1.4);
      r.fill(t.circ(1.2, 0, 1.1), m('gem'), { group: g });
    },
  };
}

export function tsukuyomi(): WeaponArt {
  // Deeper curve, a midnight blade flecked with stars, silver edge, crescent tsuba.
  return {
    tip: 31,
    mats: {
      blade: material({ base: 0x2a3060, shiny: true, step: 0.13, tex: speckle(0.08, 3) }),
      edge: material({ base: 0xd8e4f4, shiny: true, step: 0.15 }),
      guard: material({ base: 0xc8d0e0, shiny: true }),
      grip: material({ base: 0x161a30 }),
      wrapHi: material({ base: 0xb8c8e8 }),
    },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-7, 0, 0, 0, 1.2, 1.15)], m('grip'), o, 1);
      for (let i = -6; i <= -1; i += 2) r.dot(t.x(i, 0), t.y(i, 0), m('wrapHi'), 2, o.group ?? 6);
      fillAll(r, [subtract(t.circ(0.8, 0, 2.9), t.circ(1.6, 1.2, 2.2))], m('guard'), o, 1.1);
      fillAll(r, [t.poly([2, -1.3, 12, -1.0, 21, 0.2, 27.5, 2.0, 31, 4.0, 26.5, 3.3, 19.5, 2.0, 11, 1.25, 2, 1.2])], m('blade'), o, 1.3);
      fillAll(r, [t.poly([2, -1.3, 12, -1.0, 21, 0.2, 27.5, 2.0, 31, 4.0, 27, 2.6, 20.5, -0.5, 11.5, -0.4, 2, -0.6])], m('edge'), o, 1);
    },
  };
}

export function serpentKris(): WeaponArt {
  // Wavy blade, a snake-head guard.
  const blade = ribbon(1.6, 12.6, 1, (u) => 1.45 * (1 - u * 0.55), (x) => Math.sin(x * 0.95) * 0.8, [15.5, 0]);
  return {
    tip: 15,
    mats: {
      blade: material({ base: 0x9ac8a0, shiny: true, step: 0.15, tex: damascus(2, 0.8) }),
      gold: material({ base: 0xd8a838, shiny: true }),
      grip: material({ base: 0x3a6a3a, tex: lattice(2, -1) }),
      eye: M.glow(0xff3a30),
    },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-4, 0, 0, 0, 1.15)], m('grip'), o, 1);
      fillAll(r, [t.circ(-4.4, 0, 1.1)], m('gold'), o, 1);
      fillAll(r, [t.poly(blade)], m('blade'), o, 1.2);
      fillAll(r, [t.poly([0.2, -2.4, 2.4, -3.4, 3.4, -1.2, 2.6, 1.6, 0.6, 1.8])], m('gold'), o, 1.2);
      r.dot(t.x(2.2, -2.2), t.y(2.2, -2.2), m('eye'), 3, o.group ?? 6);
    },
  };
}

// -----------------------------------------------------------------------------
// Wands and staves
// -----------------------------------------------------------------------------

export function boneTorch(): WeaponArt {
  // Vertebrae shaft, a rib cage holding spectral green fire.
  return {
    tip: 15,
    mats: {
      bone: material({ base: 0xe8e0c8, shiny: true, step: 0.12 }),
      fire: M.glow(0x6aff8a),
      core: M.glow(0xe8fff0),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      const spine: Shape[] = [t.cap(-4, 0, 10.5, 0, 0.6)];
      for (let i = 0; i < 6; i++) spine.push(t.ell(-3.2 + i * 2.5, 0, 0.9, 1.25));
      fillAll(r, [union(...spine)], m('bone'), o, 1);
      r.fill(t.poly([11.2, -1.8, 13.6, -1.6, 17.6, 0.3, 14, 1.6, 11.2, 1.8]), m('fire'), { group: g });
      r.dot(t.x(13.4, 0), t.y(13.4, 0), m('core'), 3, g);
      r.dot(t.x(15, 0.2), t.y(15, 0.2), m('core'), 3, g);
      fillAll(r, [
        t.cap(10.6, 0.8, 13.6, 2.7, 0.55), t.cap(13.6, 2.7, 16.2, 1.2, 0.5),
        t.cap(10.6, -0.8, 13.6, -2.7, 0.55), t.cap(13.6, -2.7, 16.2, -1.2, 0.5),
      ], m('bone'), o, 0.8);
    },
  };
}

export function volcanoHeart(): WeaponArt {
  // Twisted obsidian with lava veins that crawl, claws holding a molten crystal.
  const lava = (x: number, y: number, ph: number) => {
    const v = Math.sin(x * 0.9 + Math.sin(y * 1.6) * 2.4) + Math.sin(y * 1.1 - x * 0.3) * 0.6;
    return Math.abs(v) < 0.2 + 0.14 * Math.sin(x * 0.45 - ph * (Math.PI / 2)) ? 4 : 0;
  };
  return {
    tip: 16,
    mats: {
      rock: veined([0x140c12, 0x24161e, 0x3a2630, 0x553844], 0xff8a2a, lava),
      magma: material({ base: 0xff7a20, glow: true, tex: glint(0.14, 1) }),
      core: M.glow(0xfff0a0),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-4.5, 0, 11, 0, 1.3, 0.95)], m('rock'), o, 1.1);
      fillAll(r, [
        t.poly([10, -0.8, 11.8, -3.2, 15, -3.4, 13, -2, 11.6, -0.4]),
        t.poly([10, 0.8, 11.8, 3.2, 15, 3.4, 13, 2, 11.6, 0.4]),
      ], m('rock'), o, 1);
      r.fill(t.poly([12.6, 0, 15, -2.3, 18, 0, 15, 2.3]), m('magma'), { group: g, local: o.local });
      r.dot(t.x(15, 0), t.y(15, 0), m('core'), 3, g);
    },
  };
}

export function serpentStaff(): WeaponArt {
  // A snake coiled round the shaft, rearing to hold the orb in its jaws.
  return {
    tip: 30,
    grip2: 12,
    mats: {
      shaft: material({ base: 0x4a3020, tex: grain() }),
      snake: material({ base: 0x3a9a5a, shiny: true, tex: lattice(2, -1) }),
      belly: material({ base: 0xe0d890 }),
      eye: M.glow(0xffe040),
      orb: M.glow(0xffb030),
      core: M.glow(0xfff4c0),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      const coil = (front: boolean) => {
        const parts: Shape[] = [];
        for (let x = 1; x < 22; x += 1) {
          const y0 = Math.sin(x * 0.55) * 1.9, y1 = Math.sin((x + 1) * 0.55) * 1.9;
          if ((Math.cos((x + 0.5) * 0.55) > 0) === front) parts.push(t.cap(x, y0, x + 1, y1, 0.85));
        }
        return union(...parts);
      };
      fillAll(r, [coil(false)], m('snake'), o, 1, -1);
      fillAll(r, [t.cap(-20, 0, 24.5, 0, 1.2, 1.05)], m('shaft'), o, 1);
      fillAll(r, [coil(true)], m('snake'), o, 1);
      fillAll(r, [t.cap(22, 0.4, 25.6, 3.4, 1.05, 0.95)], m('snake'), o, 1);
      fillAll(r, [t.poly([24.6, 2.6, 29.6, 4.6, 30.6, 3.2, 28.6, 1.6, 26, 1.8])], m('snake'), o, 1.2);
      r.line(t.x(26, 2.1), t.y(26, 2.1), t.x(29.6, 3.4), t.y(29.6, 3.4), m('belly'), 2, g);
      r.dot(t.x(28.4, 3.8), t.y(28.4, 3.8), m('eye'), 3, g);
      r.fill(t.circ(28.4, -0.4, 2.4), m('orb'), { group: g });
      r.dot(t.x(27.8, 0.2), t.y(27.8, 0.2), m('core'), 4, g);
      fillAll(r, [t.cap(24, -0.6, 27, -3.2, 0.7, 0.5)], m('snake'), o, 1);
    },
  };
}

export function cosmicStaff(): WeaponArt {
  // A gold crescent cradling a galaxy orb, with stars orbiting it frame by frame.
  const galaxy = (x: number, y: number, ph: number) => {
    const dx = x - 29.4, dy = y;
    const a = Math.atan2(dy, dx), rr = Math.hypot(dx, dy);
    const arm = Math.sin(a * 2 + rr * 1.7 - ph * (Math.PI / 2));
    if (hash(Math.floor(x * 2) + ph * 13, Math.floor(y * 2)) < 0.06) return 1;
    return arm > 0.3 ? 0 : arm > -0.4 ? -1 : -2;
  };
  return {
    tip: 31,
    grip2: 12,
    mats: {
      shaft: veined([0x0e1030, 0x1a1e50, 0x2a3478, 0x4050a8], 0xf0f8ff, glint(0.05, 4)),
      gold: material({ base: 0xe8b838, shiny: true, step: 0.15 }),
      orb: material({ base: 0xb07aff, glow: true, ramp: [0x1a0a3a, 0x3a1a7a, 0x6a3ad0, 0xb07aff, 0xffffff], tex: galaxy }),
      star: M.glow(0xfff6c0),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-20, 0, 24.5, 0, 1.2, 1.05)], m('shaft'), o, 1);
      fillAll(r, [t.rect(-19, 0, 1.2, 1.5), t.rect(5, 0, 0.8, 1.5)], m('gold'), o, 1);
      fillAll(r, [subtract(t.circ(28.4, 0, 5.4), t.circ(30.2, 0, 4.5)), t.rect(24.4, 0, 1, 1.6)], m('gold'), o, 1.3);
      r.fill(t.circ(29.4, 0, 3), m('orb'), { group: g, local: o.local });
      const ph = r.phase;
      for (let k = 0; k < 3; k++) {
        const a = ph * (Math.PI / 6) + (k * Math.PI * 2) / 3;
        const ox = 29.4 + Math.cos(a) * 5.2, oy = Math.sin(a) * 2.6 + Math.cos(a) * 1.2;
        if (Math.sin(a) < -0.2) continue; // behind the orb
        r.dot(t.x(ox, oy), t.y(ox, oy), m('star'), 3, g);
      }
      r.dot(t.x(34.2, 3), t.y(34.2, 3), m('star'), 3, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Heavy and polearms
// -----------------------------------------------------------------------------

export function thunderfall(): WeaponArt {
  // Winged hammer head with lightning crawling through it.
  const bolt = (x: number, y: number, ph: number) => {
    const q = ph * (Math.PI / 2);
    const v = Math.sin(y * 1.1 + Math.sin(x * 1.7 + q) * 2) + Math.sin(x * 0.8 - q) * 0.5;
    return Math.abs(v) < 0.26 ? 4 : 0;
  };
  return {
    tip: 30,
    grip2: 10,
    mats: {
      haft: material({ base: 0x2e2e40, shiny: true, tex: bands(3, 1, 1) }),
      gold: material({ base: 0xe0b040, shiny: true }),
      head: veined([0x1a1e34, 0x2a3250, 0x3e4a74, 0x5a6aa0], 0xc8f0ff, bolt),
      face: material({ base: 0xd8ecff, shiny: true, step: 0.15 }),
      gem: M.glow(0x8ad8ff),
      core: M.glow(0xffffff),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-9, 0, 25, 0, 1.3, 1.2)], m('haft'), o, 1);
      fillAll(r, [t.rect(-9.5, 0, 1.2, 1.7), t.rect(20.8, 0, 1, 1.7)], m('gold'), o, 1);
      fillAll(r, [
        t.poly([24.2, 6, 20.4, 11, 23.2, 10.8, 27.4, 6.4]),
        t.poly([24.2, -6, 20.4, -11, 23.2, -10.8, 27.4, -6.4]),
      ], m('gold'), o, 1.2);
      fillAll(r, [t.rect(26, 0, 4.6, 6.6, 0.8)], m('head'), o, 2);
      fillAll(r, [t.rect(26, -6.5, 3.8, 1, 0.3), t.rect(26, 6.5, 3.8, 1, 0.3)], m('face'), o, 1);
      r.fill(t.circ(26, 0, 1.7), m('gem'), { group: g });
      r.dot(t.x(26, 0.4), t.y(26, 0.4), m('core'), 3, g);
    },
  };
}

export function twinmoon(): WeaponArt {
  // Two crescent blades back to back (each with a moon-shaped cut by the haft) and a spike on top.
  const EDGE = [20, -1, 18, -5, 19.5, -9.5, 24, -11, 28.5, -9.5, 30, -5, 28, -1];
  /** One blade: on the edge side (s = 1) or mirrored to the spine side (s = -1), scaled about the head. */
  const blade = (t: Xf, s: number, k: number): Shape => {
    const q: number[] = [];
    for (let i = 0; i < EDGE.length; i += 2) q.push(24 + (EDGE[i] - 24) * k, s * EDGE[i + 1] * k);
    return subtract(t.poly(q), t.circ(24, s * -3.4 * k, 2.3 * k));
  };
  return {
    tip: 30,
    grip2: 11,
    mats: {
      haft: material({ base: 0x3a2a24, tex: grain() }),
      head: material({ base: 0xc8d4e8, shiny: true, step: 0.16, tex: damascus(3, 1) }),
      wrap: material({ base: 0x2a3a6a, tex: bands(2, 1, 1) }),
      moon: M.glow(0xe8f0ff),
    },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-8, 0, 28, 0, 1.3, 1.2)], m('haft'), o, 1);
      fillAll(r, [t.cap(-3, 0, 2, 0, 1.55)], m('wrap'), o, 1);
      fillAll(r, [blade(t, -1, 0.88)], m('head'), o, 2, -1);
      fillAll(r, [blade(t, 1, 1), t.poly([27.5, -1.3, 33, 0, 27.5, 1.3])], m('head'), o, 2.2);
      r.line(t.x(19.4, -9.2), t.y(19.4, -9.2), t.x(28.6, -9.2), t.y(28.6, -9.2), m('head'), 4, o.group ?? 6);
      r.dot(t.x(24, 0), t.y(24, 0), m('moon'), 3, o.group ?? 6);
    },
  };
}

export function dragonGlaive(): WeaponArt {
  // Curved glaive blade from a dragon-head socket, a back hook and a streamer.
  return {
    tip: 45,
    grip2: 13,
    mats: {
      shaft: material({ base: 0x3a2418, tex: bands(6, 1, 1) }),
      gold: material({ base: 0xe0a830, shiny: true }),
      blade: material({ base: 0xd8e4f0, shiny: true, step: 0.15, tex: damascus(2.6, 1) }),
      tassel: material({ base: 0xd02a2a }),
      eye: M.glow(0x50ff9a),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.poly([30, -1, 26.2, -4.8, 27.6, -5.4, 30.8, -1.6])], m('tassel'), o, 1);
      fillAll(r, [t.cap(-20, 0, 31, 0, 1.05)], m('shaft'), o, 1);
      fillAll(r, [t.poly([34, -1.6, 39, -3.1, 43.5, -2.5, 46, -0.2, 43.2, 1.0, 38, 1.7, 34, 1.7]), t.poly([35.2, 1.4, 36.6, 4.4, 38.2, 3.8, 37.4, 1.4])], m('blade'), o, 1.5);
      fillAll(r, [t.poly([29.6, -1.6, 33.6, -2.5, 35.2, -1, 35.2, 1.2, 33.6, 2.7, 30, 1.8])], m('gold'), o, 1.3);
      r.dot(t.x(33.4, 1.2), t.y(33.4, 1.2), m('eye'), 3, g);
    },
  };
}

export function starpiercer(): WeaponArt {
  // A shaft full of twinkling stars, a four-point star collar and a crystal point lit from within.
  return {
    tip: 45,
    grip2: 13,
    mats: {
      shaft: veined([0x0e1030, 0x1a1e50, 0x2a3478, 0x4050a8], 0xf0f8ff, glint(0.07, 4)),
      silver: material({ base: 0xd8e0f0, shiny: true }),
      crystal: material({ base: 0x8ae0ff, shiny: true, step: 0.16, tex: flow(12, 2, 3, 2) }),
      core: M.glow(0xe8ffff),
      ribbon: material({ base: 0x6a4aff, tex: flow(4, 1, 1, 1) }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.poly([33, -1, 29.6, -5.8, 31.2, -6.2, 33.6, -1.6])], m('ribbon'), o, 1);
      fillAll(r, [t.cap(-20, 0, 33.5, 0, 1.05)], m('shaft'), o, 1);
      fillAll(r, [t.rect(33, 0, 1, 1.8)], m('silver'), o, 1);
      fillAll(r, [t.poly([35.5, -1.3, 41, -1.7, 46, 0, 41, 1.7, 35.5, 1.3])], m('crystal'), o, 1.5);
      r.line(t.x(36.5, 0), t.y(36.5, 0), t.x(42.5, 0), t.y(42.5, 0), m('core'), 3, g);
      fillAll(r, [t.poly([35, -4.4, 35.8, -0.8, 37.6, 0, 35.8, 0.8, 35, 4.4, 34.2, 0.8, 32.4, 0, 34.2, -0.8])], m('silver'), o, 1.1);
      r.dot(t.x(35, 0), t.y(35, 0), m('core'), 3, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Bows
// -----------------------------------------------------------------------------

interface BowSpec {
  mats: WeaponArt['mats'];
  /** Limb half-thickness along the limb (u = 0 at the grip, 1 at the tip). */
  thick: (u: number) => number;
  /** Forward flick of the tips (recurve). */
  recurve: number;
  /** Extra shapes on each limb (fins, feathers), given the limb's path. */
  extra?: (r: Raster, t: Xf, m: (k: string) => number, o: WeaponDrawOpts, path: (u: number, s: number) => [number, number]) => void;
}

/** A longbow with the stock one's grip, reach and string behaviour, reshaped. */
function bow(spec: BowSpec): WeaponArt {
  return {
    tip: 22,
    mats: spec.mats,
    draw(r, t, m, o) {
      const pull = o.pull ?? 0;
      const bend = 2.5 + pull * 2.5;
      const path = (u: number, s: number): [number, number] => {
        const flick = Math.max(0, u - 0.72);
        return [-bend * u * u + spec.recurve * flick * flick * 14, s * 22 * u];
      };
      const limbs: Shape[] = [];
      for (const s of [-1, 1]) {
        let [px, py] = path(0, s);
        for (let i = 1; i <= 8; i++) {
          const [nx, ny] = path(i / 8, s);
          limbs.push(t.cap(px, py, nx, ny, spec.thick(i / 8)));
          px = nx; py = ny;
        }
      }
      fillAll(r, [union(...limbs)], m('limb'), o, 1);
      spec.extra?.(r, t, m, o, path);
      fillAll(r, [t.cap(0, -2.6, 0, 2.6, 1.45)], m('grip'), o, 1);
      const top = path(1, 1), bot = path(1, -1);
      r.dot(t.x(top[0], top[1]), t.y(top[0], top[1]), m('tip'), 3, o.group ?? 6);
      r.dot(t.x(bot[0], bot[1]), t.y(bot[0], bot[1]), m('tip'), 3, o.group ?? 6);
      const st = o.stringTo ?? t.p(-bend - 0.5, 0);
      r.line(t.x(top[0], top[1] - 0.5), t.y(top[0], top[1] - 0.5), st[0], st[1], m('string'), 3, 9);
      r.line(st[0], st[1], t.x(bot[0], bot[1] + 0.5), t.y(bot[0], bot[1] + 0.5), m('string'), 3, 9);
      if (o.stringTo && pull > 0.15) {
        const hx = t.x(7, 0), hy = t.y(7, 0);
        r.line(st[0], st[1], hx, hy, m('arrow'), 2, 9);
        r.dot(hx, hy, m('arrow'), 4, 9);
        r.dot(st[0], st[1] - 1, m('fletch'), 3, 9);
      }
    },
  };
}

export function wyvernRecurve(): WeaponArt {
  // Dark horn limbs with ridges, curling tips and bony fins near the grip.
  return bow({
    mats: {
      limb: material({ base: 0x4a3440, shiny: true, tex: bands(2.2, 1, 1) }),
      fin: material({ base: 0xb83a3a }),
      grip: material({ base: 0x7a2a22 }),
      tip: material({ base: 0xf0e4c8, shiny: true }),
      string: material({ base: 0xe8e0c8 }),
      arrow: M.steel(),
      fletch: material({ base: 0x3ab870 }),
    },
    thick: (u) => 1.45 - u * 0.55 + (u > 0.85 ? 0.25 : 0),
    recurve: 1.2,
    extra(r, t, m, o) {
      for (const s of [-1, 1]) {
        fillAll(r, [t.poly([-1.2, s * 3, 1.8, s * 5.5, 1.2, s * 8.6, -1.6, s * 7])], m('fin'), o, 1);
      }
    },
  });
}

export function sunstring(): WeaponArt {
  // Gold limbs with light running along them, feather flares and a string of light.
  return bow({
    mats: {
      limb: material({ base: 0xf0c050, shiny: true, step: 0.14, tex: flow(8, 2, 2, 1) }),
      feather: material({ base: 0xfff0d0, tex: bands(1.6, 1, -1) }),
      grip: material({ base: 0x8a3a20 }),
      tip: M.glow(0xfff0a0),
      string: M.glow(0xffe080),
      arrow: M.glow(0xfff4c0),
      fletch: M.glow(0xffb040),
    },
    thick: (u) => 1.3 - u * 0.5,
    recurve: 0.6,
    extra(r, t, m, o, path) {
      for (const s of [-1, 1]) {
        const shapes: Shape[] = [];
        for (const u of [0.35, 0.55, 0.75]) {
          const [x, y] = path(u, s);
          shapes.push(t.poly([x, y, x + 2.6 + u * 1.4, y + s * 1.6, x + 0.4, y + s * 2.6]));
        }
        fillAll(r, shapes, m('feather'), o, 1);
      }
    },
  });
}

// -----------------------------------------------------------------------------
// Shields
// -----------------------------------------------------------------------------

export function dragonscaleShield(): WeaponArt {
  // Kite shield with a spiked rim, scaled face and a slit dragon eye.
  return {
    tip: 10,
    mats: {
      rim: material({ base: 0x8a6a2a, shiny: true }),
      face: material({ base: 0x2a8a6a, tex: lattice(3, -1) }),
      eye: material({ base: 0xf0c040, shiny: true }),
      pupil: material({ base: 0x2a1010 }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      const outer = t.poly([
        -8, -5.6, -10.8, -3.4, -9, -2, -10.4, 0, -9, 2, -10.8, 3.4, -8, 5.6, -5, 8.2, -2, 6.2, 2.6, 6.8, 6, 3.2, 11.5, 0,
        6, -3.2, 2.6, -6.8, -2, -6.2, -5, -8.2,
      ]);
      fillAll(r, [outer], m('rim'), o, 2);
      const inner = t.poly([-7.2, -4.4, -7.8, 0, -7.2, 4.4, -2, 5, 5.4, 2.4, 9.5, 0, 5.4, -2.4, -2, -5]);
      r.fill(inner, m('face'), { group: g, bevel: 3.5, toneBias: o.toneBias, noLine: true, local: o.local });
      r.fill(t.ell(0, 0, 2.8, 1.6), m('eye'), { group: g, bevel: 1.2, toneBias: o.toneBias, noLine: true });
      r.line(t.x(-1.8, 0), t.y(-1.8, 0), t.x(1.8, 0), t.y(1.8, 0), m('pupil'), 1, g);
    },
  };
}

export function aegis(): WeaponArt {
  // White enamel and gold, a sun whose rays turn frame by frame, light running round the rim.
  return {
    tip: 10,
    mats: {
      rim: material({ base: 0xe8b838, shiny: true, step: 0.15, tex: flow(6, 1.5, 1.5, 1) }),
      face: material({ base: 0xf4ecd8, shiny: true, step: 0.1 }),
      sun: M.glow(0xffc040),
      core: M.glow(0xfff4c0),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.poly([-8.6, -5.8, -9.4, 0, -8.6, 5.8, -2, 6.6, 6, 3.6, 12, 0, 6, -3.6, -2, -6.6])], m('rim'), o, 2);
      const inner = t.poly([-7.6, -4.6, -8.2, 0, -7.6, 4.6, -2, 5.2, 5.4, 2.6, 9.8, 0, 5.4, -2.6, -2, -5.2]);
      r.fill(inner, m('face'), { group: g, bevel: 3.5, toneBias: o.toneBias, noLine: true, local: o.local });
      const spin = r.phase * (Math.PI / 16);
      const rays: Shape[] = [];
      for (let k = 0; k < 8; k++) {
        const a = spin + (k / 8) * Math.PI * 2;
        const len = k % 2 ? 3.6 : 4.6;
        rays.push(t.poly([-0.6 + Math.cos(a - 0.32) * 1.8, Math.sin(a - 0.32) * 1.8, -0.6 + Math.cos(a) * len, Math.sin(a) * len, -0.6 + Math.cos(a + 0.32) * 1.8, Math.sin(a + 0.32) * 1.8]));
      }
      r.fill(union(...rays), m('sun'), { group: g, noLine: true });
      r.fill(t.circ(-0.6, 0, 1.9), m('sun'), { group: g, noLine: true });
      r.dot(t.x(-0.6, 0), t.y(-0.6, 0), m('core'), 3, g);
    },
  };
}
