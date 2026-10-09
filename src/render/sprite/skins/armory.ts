import { material, type Tex } from '../../pixel/raster';
import { union, type Shape } from '../../pixel/sdf';
import { bands, grain, lattice, speckle } from '../../pixel/tex';
import { clearShape, fillAll, M, type WeaponArt } from '../weaponKit';

/**
 * Third wave of reshaped weapons: off-hand items. Same contract as
 * weapons.ts and arsenal.ts: stock grip at the origin, reach within a tenth
 * of stock. Animated parts step with `r.phase` and loop over the four idle
 * frames.
 */

const Q = Math.PI / 2; // one idle frame of a four-frame loop
const wrap = (v: number, p: number) => ((v % p) + p) % p;

/** Dark tones with a hot fifth tone that textures light up. */
const veined = (dark: number[], hot: number, tex: Tex) => material({ base: dark[2], ramp: [...dark, hot], tex });

// -----------------------------------------------------------------------------
// Mythic
// -----------------------------------------------------------------------------

export function ravenFeather(): WeaponArt {
  // Throwing knives as black raven feathers: a bone quill, a dark vane and a steel-edged tip.
  const barbs: Tex = (x, y) => (wrap(Math.floor(x * 1.4 + Math.abs(y) * 1.6), 2) === 0 ? -1 : 0);
  return {
    tip: 8.4,
    mats: {
      quill: material({ base: 0xe0d6c0, shiny: true }),
      vane: material({ base: 0x4a4278, tex: barbs }),
      sheen: material({ base: 0x9a88e8 }),
      edge: material({ base: 0xd0d8e8, shiny: true, step: 0.16 }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-3, 0, 1, 0, 0.55, 0.45)], m('quill'), o, 0.8);
      fillAll(r, [t.poly([0.4, 0.1, 2, -1.3, 5.4, -1.5, 7.6, -0.5, 8.7, 0.2, 6.6, 1.3, 4.6, 1.1, 3.8, 1.7, 2.6, 1.3, 0.8, 0.8])], m('vane'), o, 1);
      r.fill(t.poly([2.2, 0.3, 5.4, 0.9, 6.4, 0.6, 3.4, 0.1]), m('sheen'), { group: g, flat: 2, noLine: true });
      fillAll(r, [t.poly([5.8, -0.7, 8.7, 0.2, 5.8, 0.5])], m('edge'), o, 0.8);
      r.line(t.x(0.6, 0), t.y(0.6, 0), t.x(6.4, 0), t.y(6.4, 0), m('quill'), 2, g);
    },
  };
}

export function lotusChakram(): WeaponArt {
  // A lotus in bloom: two rings of petals around a gold hoop.
  const petal = (t: Parameters<WeaponArt['draw']>[1], a: number, r0: number, r1: number, w: number): Shape =>
    t.poly([
      3 + Math.cos(a - w) * r0, Math.sin(a - w) * r0,
      3 + Math.cos(a - w * 0.55) * (r0 + r1) * 0.55, Math.sin(a - w * 0.55) * (r0 + r1) * 0.55,
      3 + Math.cos(a) * r1, Math.sin(a) * r1,
      3 + Math.cos(a + w * 0.55) * (r0 + r1) * 0.55, Math.sin(a + w * 0.55) * (r0 + r1) * 0.55,
      3 + Math.cos(a + w) * r0, Math.sin(a + w) * r0,
    ]);
  return {
    tip: 5,
    mats: {
      petal: material({ base: 0xf08ab4, shiny: true, step: 0.14 }),
      inner: material({ base: 0xc04a7a }),
      ring: material({ base: 0xe8c058, shiny: true }),
      grip: material({ base: 0x2a6a4a, tex: bands(1.4, 1, -1) }),
    },
    draw(r, t, m, o) {
      const outer: Shape[] = [], inner: Shape[] = [];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        outer.push(petal(t, a, 3.2, 6.3, 0.34));
        inner.push(petal(t, a + Math.PI / 8, 3, 5, 0.3));
      }
      fillAll(r, [union(...outer)], m('petal'), o, 1.4);
      fillAll(r, [union(...inner)], m('inner'), o, 1.2);
      fillAll(r, [t.circ(3, 0, 3.5)], m('ring'), o, 1.4);
      clearShape(r, t.circ(3, 0, 2.4));
      fillAll(r, [t.cap(-1.2, -1.4, -1.2, 1.4, 0.9)], m('grip'), o, 1);
    },
  };
}

// -----------------------------------------------------------------------------
// Legendary
// -----------------------------------------------------------------------------

export function tidecaller(): WeaponArt {
  // A wavy blade of living water: foam crests roll down it, a shell guard and a pearl pommel.
  const wave: Tex = (x, y, ph) => {
    const v = Math.sin(x * 1.1 - ph * Q * 2 + y * 0.9);
    return v > 0.86 ? 4 : v < -0.7 ? -1 : 0;
  };
  return {
    tip: 14,
    mats: {
      blade: veined([0x0c2444, 0x123a66, 0x1a5688, 0x2878b0], 0xe0ffff, wave),
      guard: material({ base: 0xf0cdb4, shiny: true, step: 0.14, tex: bands(1.1, 0.5, -1) }),
      grip: material({ base: 0x1a4a5a, tex: bands(1.2, 0.5, -1) }),
      pearl: material({ base: 0xf2eeff, shiny: true, step: 0.1 }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-3.6, 0, 0, 0, 1.1)], m('grip'), o, 1);
      fillAll(r, [t.circ(-4.4, 0, 1.3)], m('pearl'), o, 1);
      // Scallop shell guard.
      const shell: Shape[] = [];
      for (let k = -2; k <= 2; k++) shell.push(t.ell(1.2 + Math.abs(k) * -0.2, k * 1.7, 1.2, 1.1));
      fillAll(r, [union(...shell)], m('guard'), o, 1.2);
      // The blade ripples like a wave, narrowing to the tip.
      const top: number[] = [], bot: number[] = [];
      const N = 10;
      for (let i = 0; i <= N; i++) {
        const u = i / N, x = 2 + u * 11.4;
        const w = 1.6 * (1 - u) + 0.2, s = Math.sin(u * Math.PI * 3) * 0.45;
        top.push(x, w + s);
        bot.unshift(x, -w + s);
      }
      fillAll(r, [t.poly([...top, 14.6, 0.2, ...bot])], m('blade'), o, 1.3);
      r.dot(t.x(1.4, 0), t.y(1.4, 0), m('pearl'), 4, g);
    },
  };
}

export function everbloom(): WeaponArt {
  // A bark buckler overgrown with moss; a great blossom on its face turns slowly.
  return {
    tip: 7,
    mats: {
      rim: material({ base: 0x6a4a2a, tex: grain() }),
      face: material({ base: 0x6a8a3a, tex: speckle(0.14, 1) }),
      petal: material({ base: 0xff8ab8, shiny: true, step: 0.14 }),
      petalHi: material({ base: 0xffd8e8 }),
      core: material({ base: 0xffe060, glow: true }),
      leaf: material({ base: 0x4aa040, shiny: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.ell(2, 0, 2.3, 6.3)], m('rim'), o, 2);
      r.fill(t.ell(2.4, 0, 1.7, 5.3), m('face'), { group: g, bevel: 3, noLine: true, toneBias: o.toneBias, local: o.local });
      // Leaves around the rim.
      for (const y of [-5.6, 5.6]) fillAll(r, [t.ell(1.6, y, 0.8, 1.6, y > 0 ? 0.6 : -0.6)], m('leaf'), o, 0.8);
      // Six petals, seen at the shield's angle; a sixth of a turn every four frames.
      const spin = r.phase * (Math.PI / 12);
      const petals: Shape[] = [], hi: Shape[] = [];
      for (let k = 0; k < 6; k++) {
        const a = spin + (k / 6) * Math.PI * 2;
        const cx = 3.4 + Math.cos(a) * 0.9, cy = Math.sin(a) * 2.6;
        petals.push(t.ell(cx, cy, 0.9, 1.9, Math.cos(a) * 0.4));
        hi.push(t.ell(cx + 0.2, cy * 1.05, 0.4, 0.9, Math.cos(a) * 0.4));
      }
      fillAll(r, [union(...petals)], m('petal'), o, 1);
      r.fill(union(...hi), m('petalHi'), { group: g, flat: 3, noLine: true });
      // A green bud spike at the centre.
      fillAll(r, [t.poly([3.6, -1.1, 7.2, 0, 3.6, 1.1])], m('leaf'), o, 1);
      r.fill(t.circ(3.8, 0, 1.1), m('core'), { group: g });
    },
  };
}

export function venomspitter(): WeaponArt {
  // A viper-headed crossbow: coiled-snake limbs, glowing venom sacs and a drip that keeps falling.
  const ooze: Tex = (x, y, ph) => (Math.sin(x * 1.3 + y * 0.8 - ph * Q * 2) > 0.7 ? 4 : 0);
  return {
    tip: 9,
    mats: {
      stock: material({ base: 0x2a3a22, tex: lattice(2.2, -1) }),
      head: material({ base: 0x5a8a2a, shiny: true, tex: lattice(1.8, -1) }),
      prod: material({ base: 0x3e6a2a, shiny: true, tex: bands(1.4, 0.6, 1) }),
      string: material({ base: 0xe8e0c8 }),
      bolt: material({ base: 0xb8ff6a, glow: true }),
      venom: veined([0x1a3a10, 0x2a5a18, 0x3a8a20, 0x6ac830], 0xe8ff9a, ooze),
      fang: material({ base: 0xf4f0e0, shiny: true }),
      eye: M.glow(0xffe040),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.poly([-2, -1.6, 8, -1.2, 8, 1.2, 1, 1.4, -1, 3.8, -3, 3.6, -1.6, 0.6])], m('stock'), o, 1.4);
      fillAll(r, [t.ell(2.6, 2.2, 1.6, 1.1)], m('venom'), o, 1);
      // Limbs: two snakes curling back from the head.
      fillAll(r, [
        t.poly([6.6, -0.4, 4.6, 2.8, 3.6, 5.4, 4.6, 6, 5.6, 3.6, 8, 0]),
        t.poly([6.6, 0.4, 4.6, -2.8, 3.6, -5.4, 4.6, -6, 5.6, -3.6, 8, 0]),
      ], m('prod'), o, 1);
      // Viper head with an open jaw at the muzzle.
      fillAll(r, [t.poly([7.4, -1.2, 9.6, -1.6, 10.8, -0.4, 9.6, 0.2, 10.6, 1.0, 9.4, 1.6, 7.4, 1.4])], m('head'), o, 1.1);
      r.fill(t.poly([9.6, -0.9, 10.2, -1.6, 10, -0.6]), m('fang'), { group: g, flat: 3, noLine: true });
      r.dot(t.x(8.6, 0.9), t.y(8.6, 0.9), m('eye'), 3, g);
      // A venom drop falls from the jaw, one step per frame.
      const fall = (r.phase % 4) * 0.7;
      r.fill(t.circ(10.2, -1.9 - fall, 0.55), m('venom'), { group: g, flat: 4, noLine: true });
      const pull = o.pull ?? 1;
      const sx = 5 - pull * 3.5;
      r.line(t.x(3.9, 5.4), t.y(3.9, 5.4), t.x(sx, 0), t.y(sx, 0), m('string'), 3, 9);
      r.line(t.x(sx, 0), t.y(sx, 0), t.x(3.9, -5.4), t.y(3.9, -5.4), m('string'), 3, 9);
      if (pull > 0.5) r.line(t.x(sx, 0.3), t.y(sx, 0.3), t.x(9.6, 0.3), t.y(9.6, 0.3), m('bolt'), 3, 9);
    },
  };
}

export function auroraHorn(): WeaponArt {
  // A pale spiralled horn with the northern lights flowing through it, glowing from the bell.
  const aurora: Tex = (x, y, ph) => {
    const v = Math.sin(x * 0.8 - ph * Q + Math.sin(y * 1.6) * 1.2);
    return v > 0.35 ? 1 : v < -0.55 ? -1 : 0;
  };
  return {
    tip: 10,
    mats: {
      horn: material({ base: 0x3ac8a0, ramp: [0x1a2a4a, 0x2a5a8a, 0x3ab8a0, 0x9af0c0, 0xead8ff], tex: aurora }),
      ridge: material({ base: 0xf2f6ff, shiny: true }),
      band: material({ base: 0xd8e0f0, shiny: true, step: 0.16 }),
      bell: material({ base: 0xb8ffe0, glow: true }),
      star: material({ base: 0xffffff, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      const path: [number, number, number][] = [];
      for (let i = 0; i <= 7; i++) {
        const u = i / 7;
        path.push([-1.5 + u * 10.8, u * u * 3.8, 0.8 + u * 1.9]);
      }
      const segs: Shape[] = [];
      for (let i = 1; i < path.length; i++) segs.push(t.cap(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1], path[i - 1][2], path[i][2]));
      fillAll(r, [union(...segs)], m('horn'), o, 1.6);
      // A spiral ridge winding along the horn.
      for (let i = 0; i < 6; i++) {
        const u = (i + 0.5) / 7, x = -1.5 + u * 10.8, y = u * u * 3.8, w = 0.8 + u * 1.9;
        r.line(t.x(x - 0.4, y - w * 0.8), t.y(x - 0.4, y - w * 0.8), t.x(x + 0.5, y + w * 0.8), t.y(x + 0.5, y + w * 0.8), m('ridge'), 2, g);
      }
      fillAll(r, [t.rect(0.4, 0.05, 0.6, 1.2), t.rect(6.6, 2.1, 0.6, 2.2)], m('band'), o, 1);
      r.fill(t.ell(9.4, 3.8, 1, 2.3, 0.5), m('bell'), { group: g });
      // Two motes of light drift out of the bell and loop back.
      for (let k = 0; k < 2; k++) {
        const s = wrap(r.phase + k * 2, 4);
        const x = 10.2 + s * 0.6, y = 4 + Math.sin(s * Q + k) * 1.4 + s * 0.4;
        r.dot(t.x(x, y), t.y(x, y), m('star'), 3, g);
      }
    },
  };
}
