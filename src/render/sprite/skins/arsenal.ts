import { material, type Tex } from '../../pixel/raster';
import { subtract, union, type Shape } from '../../pixel/sdf';
import { bands, damascus, flow, grain, hash, speckle } from '../../pixel/tex';
import { clearShape, fillAll, M, type WeaponArt } from '../weaponKit';

/**
 * The second wave of reshaped weapons (mythic and legendary). Same contract
 * as weapons.ts: stock grip, stock `grip2`, reach within a tenth of stock.
 * Animated parts step with `r.phase`; steps divide evenly into the four idle
 * frames so idles loop without a jump.
 */

const Q = Math.PI / 2; // one idle frame of a four-frame loop

/** Dark tones with a hot fifth tone that textures light up (veins, cracks, stars). */
const veined = (dark: number[], hot: number, tex: Tex) => material({ base: dark[2], ramp: [...dark, hot], tex });

/** Spikes radiating from a ball at (cx, 0), skipping those that point back down the haft. */
function spikes(t: Parameters<WeaponArt['draw']>[1], cx: number, r0: number, r1: number, n: number, rot = 0): Shape[] {
  const out: Shape[] = [];
  for (let k = 0; k < n; k++) {
    const a = rot + (k / n) * Math.PI * 2;
    if (Math.cos(a) < -0.75) continue;
    out.push(t.poly([
      cx + Math.cos(a - 0.36) * r0, Math.sin(a - 0.36) * r0,
      cx + Math.cos(a) * r1, Math.sin(a) * r1,
      cx + Math.cos(a + 0.36) * r0, Math.sin(a + 0.36) * r0,
    ]));
  }
  return out;
}

// -----------------------------------------------------------------------------
// Mythic
// -----------------------------------------------------------------------------

export function morningstar(): WeaponArt {
  // An iron ball bristling with steel spikes on a wrapped haft.
  return {
    tip: 22,
    mats: {
      haft: material({ base: 0x3a2a1e, tex: grain() }),
      wrap: material({ base: 0x8a2420, tex: bands(1.6, 1, -1) }),
      ball: material({ base: 0x5a5e6e, shiny: true, tex: speckle(0.1, -1) }),
      spike: material({ base: 0xd0d8e4, shiny: true, step: 0.15 }),
      band: material({ base: 0xb07a40, shiny: true }),
    },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-4.6, 0, 15, 0, 1.25, 1.05)], m('haft'), o, 1);
      fillAll(r, [t.cap(-4, 0, 0, 0, 1.45)], m('wrap'), o, 1);
      fillAll(r, [t.rect(14.6, 0, 0.9, 1.7)], m('band'), o, 1);
      fillAll(r, [union(...spikes(t, 18.6, 2.6, 5.6, 8, 0.2))], m('spike'), o, 1);
      fillAll(r, [t.circ(18.6, 0, 3.2)], m('ball'), o, 1.8);
      r.dot(t.x(17.6, 1.2), t.y(17.6, 1.2), m('spike'), 4, o.group ?? 6);
    },
  };
}

export function skullcrusher(): WeaponArt {
  // A horned skull for a hammer head, on a bone haft; the eyes smoulder.
  return {
    tip: 30,
    grip2: 10,
    mats: {
      haft: material({ base: 0xd8ccb0, shiny: true, tex: bands(2.6, 1, -1) }),
      bone: material({ base: 0xece2c8, shiny: true, step: 0.13, tex: speckle(0.06, -1) }),
      horn: material({ base: 0x3a2a30, shiny: true, tex: bands(1.5, 1, 1) }),
      socket: material({ base: 0x2a1418 }),
      eye: M.glow(0xff4a2a),
      band: material({ base: 0x6a7488, shiny: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-9, 0, 23, 0, 1.3, 1.2)], m('haft'), o, 1);
      fillAll(r, [t.rect(-9.5, 0, 1.2, 1.7), t.rect(20.8, 0, 1, 1.7)], m('band'), o, 1);
      // Horns curl back from the crown (spine side).
      fillAll(r, [
        t.poly([23.4, 3.4, 20.6, 7.4, 21.2, 10.6, 22.6, 7.6, 25.4, 4.8]),
        t.poly([28.6, 3.4, 31.6, 7, 31, 10, 29.8, 7.2, 27, 4.8]),
      ], m('horn'), o, 1.2);
      // Cranium and jaw: the face points down the striking side.
      fillAll(r, [union(t.ell(26, 0.8, 4.6, 5.2), t.rect(26, -4.4, 3.2, 1.8, 0.8))], m('bone'), o, 2.2);
      r.fill(t.circ(24.4, -1.6, 1.2), m('socket'), { group: g, flat: 0, noLine: true });
      r.fill(t.circ(27.6, -1.6, 1.2), m('socket'), { group: g, flat: 0, noLine: true });
      r.dot(t.x(24.4, -1.6), t.y(24.4, -1.6), m('eye'), 3, g);
      r.dot(t.x(27.6, -1.6), t.y(27.6, -1.6), m('eye'), 3, g);
      for (let x = 23.6; x <= 28.6; x += 1.6) r.dot(t.x(x, -5.4), t.y(x, -5.4), m('socket'), 0, g);
    },
  };
}

export function lionheart(): WeaponArt {
  // A round shield whose boss is a roaring lion's head with a golden mane.
  return {
    tip: 7.5,
    mats: {
      rim: material({ base: 0xb07a40, shiny: true }),
      mane: material({ base: 0xd8701a, tex: bands(1.4, 1, -1) }),
      face: material({ base: 0xf0c050, shiny: true, step: 0.15 }),
      mouth: material({ base: 0x5a1a14 }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.ell(2, 0, 2.4, 6.6)], m('rim'), o, 2);
      const mane: Shape[] = [];
      for (let y = -5; y <= 5; y += 2.5) mane.push(t.circ(3.4, y, 1.7));
      fillAll(r, [union(...mane)], m('mane'), o, 1.4);
      fillAll(r, [t.poly([3.4, -2.4, 6.3, -1.6, 7.6, 0.2, 6.1, 2.2, 3.4, 2.6])], m('face'), o, 1.4);
      r.fill(t.poly([5.1, -1.6, 7.2, -0.6, 5.5, -0.2]), m('mouth'), { group: g, flat: 0, noLine: true });
      r.dot(t.x(5.1, 1.2), t.y(5.1, 1.2), m('mouth'), 0, g);
    },
  };
}

export function swordbreaker(): WeaponArt {
  // A comb of teeth along the spine to catch blades, and a three-pronged guard.
  return {
    tip: 14.5,
    mats: {
      blade: material({ base: 0x8a9ab8, shiny: true, step: 0.15, tex: damascus(2.2) }),
      guard: material({ base: 0xd8a838, shiny: true }),
      grip: material({ base: 0x1e1a2a, tex: bands(1.4, 1, 1) }),
    },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-4, 0, 0, 0, 1.1)], m('grip'), o, 1);
      fillAll(r, [t.circ(-4.4, 0, 1)], m('guard'), o, 1);
      const teeth: Shape[] = [];
      for (let x = 3; x <= 10.5; x += 1.9) teeth.push(t.rect(x, 2.3, 0.5, 1.2));
      fillAll(r, [union(t.poly([2, -1.5, 11, -1.3, 14.5, 0, 11.5, 1.5, 2, 1.6]), ...teeth)], m('blade'), o, 1.2);
      fillAll(r, [union(
        t.rect(0.8, 0, 0.8, 1.8),
        t.poly([0, -1.6, 3.8, -5, 4.6, -4.2, 1.6, -0.8]),
        t.poly([0, 1.6, 3.8, 5, 4.6, 4.2, 1.6, 0.8]),
      )], m('guard'), o, 1.1);
    },
  };
}

export function wyrmRepeater(): WeaponArt {
  // A dragon-headed stock, wing-shaped prod and a bolt magazine on top.
  return {
    tip: 9.8,
    mats: {
      stock: material({ base: 0x2e3a2a, tex: grain() }),
      head: material({ base: 0x3a8a5a, shiny: true }),
      prod: material({ base: 0x8a2a2a, shiny: true, tex: bands(1.6, 1, 1) }),
      mag: material({ base: 0x6a5a40, shiny: true }),
      string: material({ base: 0xe8e0c8 }),
      bolt: material({ base: 0xd8e0e8, shiny: true }),
      eye: M.glow(0xffd040),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.poly([-2, -1.6, 8, -1.2, 8, 1.2, 1, 1.4, -1, 3.8, -3, 3.6, -1.6, 0.6])], m('stock'), o, 1.4);
      fillAll(r, [t.poly([7.6, -1.4, 10.4, -1.0, 11.4, 0.2, 10.2, 1.4, 7.6, 1.4])], m('head'), o, 1.2);
      r.dot(t.x(9.4, 0.6), t.y(9.4, 0.6), m('eye'), 3, g);
      fillAll(r, [t.rect(3, 2.4, 2.2, 1)], m('mag'), o, 1);
      fillAll(r, [
        t.poly([6.5, -0.5, 3.8, 3.2, 3.2, 5.8, 5.8, 5.2, 8, 0]),
        t.poly([6.5, 0.5, 3.8, -3.2, 3.2, -5.8, 5.8, -5.2, 8, 0]),
      ], m('prod'), o, 1);
      const pull = o.pull ?? 1;
      const sx = 5 - pull * 3.5;
      r.line(t.x(4, 5.2), t.y(4, 5.2), t.x(sx, 0), t.y(sx, 0), m('string'), 3, 9);
      r.line(t.x(sx, 0), t.y(sx, 0), t.x(4, -5.2), t.y(4, -5.2), m('string'), 3, 9);
      if (pull > 0.5) r.line(t.x(sx, 0.3), t.y(sx, 0.3), t.x(10, 0.3), t.y(10, 0.3), m('bolt'), 3, 9);
    },
  };
}

export function krakenConch(): WeaponArt {
  // A spiral conch with knobs along its curl and a pink, pearly mouth.
  return {
    tip: 10,
    mats: {
      shell: material({ base: 0xf0c8a8, shiny: true, step: 0.13, tex: bands(1.8, 1, -1) }),
      knob: material({ base: 0xd89a80, shiny: true }),
      mouth: material({ base: 0xe07090, shiny: true }),
      tentacle: material({ base: 0x7a3a8a, tex: speckle(0.2, 1) }),
    },
    draw(r, t, m, o) {
      const path: Shape[] = [];
      let px = -1.5, py = 0;
      for (let i = 1; i <= 7; i++) {
        const u = i / 7;
        const nx = -1.5 + u * 10.5, ny = u * u * 3.6;
        path.push(t.cap(px, py, nx, ny, 0.7 + u * 1.9));
        px = nx; py = ny;
      }
      fillAll(r, [union(...path)], m('shell'), o, 1.6);
      fillAll(r, [0.35, 0.55, 0.75].map((u) => {
        const x = -1.5 + u * 10.5, y = u * u * 3.6 + 0.7 + u * 1.9;
        return t.poly([x - 0.9, y - 0.4, x - 0.2, y + 1.6, x + 0.8, y - 0.2]);
      }), m('knob'), o, 1);
      // A tentacle wrapped round the middle.
      fillAll(r, [t.cap(2.6, -1.6, 4, 2.8, 0.6), t.cap(4, 2.8, 5.4, -0.6, 0.55)], m('tentacle'), o, 0.8);
      r.fill(t.ell(9.4, 3.8, 1, 2.5, 0.5), m('mouth'), { group: o.group ?? 6, bevel: 1, noLine: true });
    },
  };
}

export function icicleScepter(): WeaponArt {
  // A silver rod crowned with a cluster of jagged ice shards.
  return {
    tip: 15,
    mats: {
      shaft: material({ base: 0xc8d4e4, shiny: true, tex: bands(2.4, 1, -1) }),
      ice: material({ base: 0xa8e8ff, shiny: true, step: 0.16, tex: speckle(0.08, 2) }),
      core: M.glow(0xf0ffff),
    },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-3.5, 0, 9.5, 0, 1, 0.8)], m('shaft'), o, 1);
      fillAll(r, [t.ell(9, 0, 1, 1.7)], m('shaft'), o, 1);
      fillAll(r, [
        t.poly([9.6, -1, 11, -3.8, 12.6, -4.6, 11.8, -1.6]),
        t.poly([9.6, 1, 11, 3.8, 12.6, 4.6, 11.8, 1.6]),
      ], m('ice'), o, 1, -1);
      fillAll(r, [t.poly([9.4, -1.5, 12.2, -1.9, 16.4, 0, 12.2, 1.9, 9.4, 1.5])], m('ice'), o, 1.3);
      r.dot(t.x(12, 0), t.y(12, 0), m('core'), 3, o.group ?? 6);
    },
  };
}

// -----------------------------------------------------------------------------
// Legendary
// -----------------------------------------------------------------------------

export function kagutsuchi(): WeaponArt {
  // A black blade cracked with fire that crawls toward the tip, flames licking off the spine.
  const fire = (x: number, y: number, ph: number) => {
    const v = Math.sin(x * 0.8 - ph * Q + Math.sin(y * 2.2) * 1.4);
    return v > 0.82 ? 4 : v > 0.55 ? 1 : 0;
  };
  return {
    tip: 31,
    mats: {
      blade: veined([0x1a0e10, 0x2e1416, 0x4a1e1e, 0x6a2a24], 0xffa040, fire),
      edge: M.glow(0xff7a2a),
      flame: M.glow(0xffb040),
      flameHot: M.glow(0xfff0a0),
      guard: material({ base: 0xd8a030, shiny: true }),
      grip: material({ base: 0x1a1014, tex: bands(2, 1, 2) }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-7, 0, 0, 0, 1.2, 1.15)], m('grip'), o, 1);
      // Flame-tongue tsuba.
      fillAll(r, [t.poly([0.2, -2.6, 1.8, -3.4, 1.4, -1.6, 2.2, 0, 1.4, 1.6, 1.8, 3.4, 0.2, 2.6, -0.6, 0])], m('guard'), o, 1.1);
      fillAll(r, [t.poly([2, -1.2, 12, -1.1, 22, -0.4, 29, 0.9, 31.5, 2.2, 27, 2.0, 20, 1.3, 11, 1.1, 2, 1.1])], m('blade'), o, 1.3);
      r.line(t.x(3, -1), t.y(3, -1), t.x(21, -0.3), t.y(21, -0.3), m('edge'), 3, g);
      // Flames rise off the spine and drift toward the tip as frames pass.
      for (let k = 0; k < 3; k++) {
        const x = 5 + ((k * 7.5 + r.phase * 1.875) % 22.5);
        const y = 1.1 + (x / 31) * 0.8;
        const hgt = 2.2 + hash(k, 3) * 1.6;
        r.fill(t.poly([x - 1.3, y, x + 0.4, y + hgt, x + 1.2, y]), m('flame'), { group: g, noLine: true });
        r.dot(t.x(x, y + 0.5), t.y(x, y + 0.5), m('flameHot'), 3, g);
      }
    },
  };
}

export function voidfang(): WeaponArt {
  // A jagged blade of night with violet cracks, and a void shard circling the pommel.
  const crack = (x: number, y: number, ph: number) => {
    const v = Math.sin(x * 1.3 + Math.sin(y * 2.4 + ph * Q) * 1.8) + Math.sin(y * 1.6 - x * 0.4) * 0.5;
    if (hash(Math.floor(x * 1.5) + ph * 7, Math.floor(y * 1.5)) < 0.05) return 4;
    return Math.abs(v) < 0.28 ? 4 : 0;
  };
  return {
    tip: 15.5,
    mats: {
      blade: veined([0x0c0814, 0x1a1028, 0x2a1a40, 0x40285c], 0xd890ff, crack),
      horn: material({ base: 0x4a3a6a, shiny: true }),
      grip: material({ base: 0x14101e, tex: bands(1.4, 1, 1) }),
      orb: M.glow(0xb070ff),
      orbHot: M.glow(0xf0d8ff),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-4, 0, 0, 0, 1.15)], m('grip'), o, 1);
      fillAll(r, [
        t.poly([0.4, -1.2, 2.4, -4.4, 1.2, -4.8, -0.6, -1.6]),
        t.poly([0.4, 1.2, 2.4, 4.4, 1.2, 4.8, -0.6, 1.6]),
      ], m('horn'), o, 1);
      fillAll(r, [t.poly([1.6, -1.6, 5, -1.9, 6.4, -1.2, 9, -1.7, 10.4, -1, 13, -1.1, 16, 0, 12.4, 1.2, 9.4, 0.9, 7.2, 1.6, 4.4, 1.2, 1.6, 1.5])], m('blade'), o, 1.2);
      // A shard of the void orbits the pommel.
      const a = r.phase * Q;
      const ox = -5.6 + Math.cos(a) * 2.6, oy = Math.sin(a) * 1.4;
      r.fill(t.circ(ox, oy, 0.9), m('orb'), { group: g });
      r.dot(t.x(ox, oy), t.y(ox, oy), m('orbHot'), 3, g);
    },
  };
}

export function geodeHeart(): WeaponArt {
  // A cracked stone head split open on a cluster of crystals that pulse with light.
  return {
    tip: 22,
    mats: {
      haft: material({ base: 0x3a2c40, tex: grain() }),
      gold: material({ base: 0xe0b040, shiny: true }),
      rock: material({ base: 0x5a5060, tex: speckle(0.14, -1) }),
      crystal: material({ base: 0x7ae8ff, shiny: true, step: 0.16, tex: flow(4, 1, 1, 2) }),
      amethyst: material({ base: 0xc070ff, shiny: true, step: 0.16, tex: flow(4, 1, 1, 2) }),
      core: M.glow(0xf0ffff),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-4.5, 0, 14.5, 0, 1.25, 1.1)], m('haft'), o, 1);
      fillAll(r, [t.rect(-1, 0, 0.9, 1.6), t.rect(14, 0, 1, 1.9)], m('gold'), o, 1);
      // Rock shell, open on the striking side.
      fillAll(r, [subtract(t.poly([14.6, -2.4, 16.4, -4.2, 20, -4.6, 22.8, -2.6, 23.2, 1.2, 21, 4.2, 17.4, 4.6, 15, 2.6]), t.ell(19.6, -1.8, 3, 2.6))], m('rock'), o, 1.6);
      fillAll(r, [
        t.poly([16.6, -1.2, 17.6, -5.2, 18.8, -1]),
        t.poly([20.2, -0.8, 22.4, -4.8, 22.6, -0.4]),
      ], m('amethyst'), o, 1);
      fillAll(r, [t.poly([18.2, -0.6, 19.6, -6.4, 21, -0.6]), t.poly([19, 0.6, 21.6, 1.2, 23.8, 0, 21.6, -1.2])], m('crystal'), o, 1.1);
      r.dot(t.x(19.6, -2), t.y(19.6, -2), m('core'), 3, g);
    },
  };
}

export function frostreaver(): WeaponArt {
  // A crescent of jagged ice on a rimed haft, with icicles hanging off the beard.
  return {
    tip: 30,
    grip2: 11,
    mats: {
      haft: material({ base: 0x2a3448, shiny: true, tex: bands(3, 1, 2) }),
      ice: material({ base: 0x9ae4ff, shiny: true, step: 0.16, tex: flow(8, 2, 2, 2) }),
      deep: material({ base: 0x4a8ad8, shiny: true, tex: speckle(0.1, 2) }),
      wrap: material({ base: 0xe8f4ff, tex: bands(1.6, 1, -1) }),
      core: M.glow(0xf0ffff),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-8, 0, 28, 0, 1.3, 1.2)], m('haft'), o, 1);
      fillAll(r, [t.cap(-3, 0, 2, 0, 1.55)], m('wrap'), o, 1);
      // Spine-side crystal spike.
      fillAll(r, [t.poly([22, 1, 23.4, 6.4, 25, 5.2, 26, 1])], m('deep'), o, 1.2);
      // The blade: a jagged ice crescent.
      fillAll(r, [t.poly([19.6, -1, 17.4, -4.4, 18.6, -6.6, 17.2, -9.4, 20.4, -10.2, 22.4, -12.2, 24.6, -10.6, 28, -11.6, 29, -9, 31, -7.2, 29.8, -4.6, 30.8, -2.6, 28.2, -1])], m('ice'), o, 2.2);
      fillAll(r, [t.poly([21, -2.2, 24, -3.4, 27, -2.2, 24, -7])], m('deep'), o, 1.2);
      // Icicles drip off the lower horn.
      for (const [x, len] of [[18.4, 2.4], [19.6, 1.6]] as const) {
        r.fill(t.poly([x - 0.5, -1.4, x, -1.4 + len * 0.1, x + 0.5, -1.4, x + 0.1, -1.4 - len]), m('ice'), { group: g, bevel: 0.8, local: o.local });
      }
      r.dot(t.x(24, -4.2), t.y(24, -4.2), m('core'), 3, g);
    },
  };
}

export function wintersHeart(): WeaponArt {
  // A six-armed snowflake that turns frame by frame around a heart of ice.
  return {
    tip: 15,
    mats: {
      shaft: material({ base: 0xd8e4f4, shiny: true, step: 0.15, tex: flow(4, 1, 1, 1) }),
      flake: M.glow(0xbff0ff),
      heart: material({ base: 0x7ad0ff, shiny: true, step: 0.16 }),
      core: M.glow(0xffffff),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-3.5, 0, 9, 0, 1, 0.8)], m('shaft'), o, 1);
      const cx = 12.4;
      const arms: Shape[] = [];
      const spin = r.phase * (Math.PI / 12); // six-fold, so four frames make a full turn of symmetry
      for (let k = 0; k < 6; k++) {
        const a = spin + (k / 6) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        arms.push(t.cap(cx, 0, cx + c * 4.6, s * 4.6, 0.45));
        const bx = cx + c * 3, by = s * 3;
        arms.push(t.cap(bx, by, bx + Math.cos(a + 0.8) * 1.3, by + Math.sin(a + 0.8) * 1.3, 0.35));
        arms.push(t.cap(bx, by, bx + Math.cos(a - 0.8) * 1.3, by + Math.sin(a - 0.8) * 1.3, 0.35));
      }
      r.fill(union(...arms), m('flake'), { group: g, noLine: true });
      fillAll(r, [t.poly([cx - 1.6, 0, cx, -1.7, cx + 1.6, 0, cx, 1.7])], m('heart'), o, 1);
      r.dot(t.x(cx, 0.3), t.y(cx, 0.3), m('core'), 3, g);
    },
  };
}

export function solarDisc(): WeaponArt {
  // A gold ring whose sun-ray blades turn, with light running round it.
  return {
    tip: 5,
    mats: {
      ring: material({ base: 0xf0c048, shiny: true, step: 0.15, tex: flow(4, 1, 1, 1) }),
      ray: material({ base: 0xffe8a0, shiny: true }),
      grip: material({ base: 0x8a3a20 }),
      core: M.glow(0xfff0a0),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      const rays: Shape[] = [];
      const spin = r.phase * (Math.PI / 8); // eight blades
      for (let k = 0; k < 8; k++) {
        const a = spin + (k / 8) * Math.PI * 2;
        rays.push(t.poly([3 + Math.cos(a - 0.22) * 4, Math.sin(a - 0.22) * 4, 3 + Math.cos(a + 0.12) * 7.4, Math.sin(a + 0.12) * 7.4, 3 + Math.cos(a + 0.32) * 4, Math.sin(a + 0.32) * 4]));
      }
      fillAll(r, [union(...rays)], m('ray'), o, 1);
      fillAll(r, [t.circ(3, 0, 4.6)], m('ring'), o, 1.6);
      clearShape(r, t.circ(3, 0, 2.5));
      r.dot(t.x(3, 3.6), t.y(3, 3.6), m('core'), 3, g);
      fillAll(r, [t.cap(-1.2, -1.4, -1.2, 1.4, 0.9)], m('grip'), o, 1);
    },
  };
}

