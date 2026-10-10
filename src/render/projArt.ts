import type { ProjectileStyle, UsableId } from '../sim/types';
import { material, Raster, type Frame, type Material } from './pixel/raster';
import { arc, union, type Shape } from './pixel/sdf';
import type { Sprite } from './sprite/bank';
import { SKIN_ART, skinMaterials, type ProjArt } from './sprite/skins';
import { usableArt } from './sprite/usables';
import { Xf } from './sprite/xform';

/**
 * Projectile and item sprites, rasterized with the same shading and outlines
 * as the characters. Drawn pointing +x and cached per style, animation frame
 * and direction (32 steps), so arcs and falling meteors stay pixel-crisp.
 */

const M = {
  steel: material({ base: 0xc8d2e0, shiny: true, step: 0.15 }),
  wood: material({ base: 0x8a5a32 }),
  fletch: material({ base: 0xe84a3a }),
  knifeGrip: material({ base: 0x4a4a5a }),
  dark: material({ base: 0x3a2a40 }),
  rock: material({ base: 0x6a4a3a, step: 0.13 }),
  lava: material({ base: 0xff7a1a, glow: true }),
  lavaHot: material({ base: 0xffe070, glow: true }),
  fire: material({ base: 0xff8a2a, glow: true }),
  fireHot: material({ base: 0xfff0a0, glow: true }),
  fireDeep: material({ base: 0xd83a1a, glow: true }),
  arcane: material({ base: 0xb07aff, glow: true }),
  arcaneHot: material({ base: 0xf2e4ff, glow: true }),
  hex: material({ base: 0x6a2a9a, glow: true }),
  hexHot: material({ base: 0xd08aff, glow: true }),
  hexEye: material({ base: 0x9cff4a, glow: true }),
  wind: material({ base: 0xd8f4ff, glow: true }),
  windDim: material({ base: 0x8ac8e8, glow: true }),
  dirt: material({ base: 0x9a7a58 }),
  dirtLight: material({ base: 0xd8b888 }),
  wisp: material({ base: 0x7ae8ff, glow: true }),
  wispHot: material({ base: 0xf0ffff, glow: true }),
  chakram: material({ base: 0xb8e4f0, shiny: true, step: 0.16 }),
  chakramGrip: material({ base: 0x3a8aa0 }),
  phantom: material({ base: 0xa8c8ff, glow: true }),
  phantomHot: material({ base: 0xf0f8ff, glow: true }),
  sigil: material({ base: 0xff9a3a, glow: true }),
  iron: material({ base: 0x6a7488, shiny: true }),
  chain: material({ base: 0x9aa4b4, shiny: true }),
  hookBlade: material({ base: 0xbccad8, shiny: true, step: 0.15 }),
  bolaStone: material({ base: 0x8a8070, step: 0.13 }),
  bolaStone2: material({ base: 0x6e6458, step: 0.13 }),
  cord: material({ base: 0x6a4028 }),
  ash: material({ base: 0xb08a58 }),
  binding: material({ base: 0xe0d0a8 }),
  tuft: material({ base: 0xc83a3a }),
  spark: material({ base: 0x7ad0ff, glow: true }),
  sparkDim: material({ base: 0x3a7ae0, glow: true }),
  sparkHot: material({ base: 0xf0ffff, glow: true }),
  soul: material({ base: 0x7ae8b0, glow: true }),
  soulDim: material({ base: 0x3aa880, glow: true }),
  soulHot: material({ base: 0xeafff2, glow: true }),
  soulEye: material({ base: 0x1a4a3a }),
  bone: material({ base: 0xe6dec6, step: 0.12 }),
  boneDark: material({ base: 0xa89a80, step: 0.12 }),
  caltrop: material({ base: 0xa8b0bc, shiny: true, step: 0.16 }),
  pouch: material({ base: 0x8a5a36 }),
  feather: material({ base: 0x8a5a3a }),
  featherDark: material({ base: 0x4a3020 }),
  belly: material({ base: 0xe8d8b8 }),
  beak: material({ base: 0xe8b840, shiny: true }),
  hawkEye: material({ base: 0x1a1418 }),
  smoke: material({ base: 0x5a4a50 }),
};

/**
 * Projectiles whose art has a top and a bottom (a bird, a face, a hook)
 * fly upright both ways: the local frame mirrors instead of turning upside down.
 */
const upright = (t: Xf) => (Math.cos(t.ang) < 0 ? new Xf(t.ox, t.oy, t.ang, 1, -1) : t);

/** Ground-hugging shots stay on the floor, mirrored to face the way they run. */
const grounded = (t: Xf) => new Xf(t.ox, t.oy, 0, Math.cos(t.ang) < 0 ? -1 : 1, 1);

const ART: Record<ProjectileStyle | 'phantom' | 'sigil', ProjArt> = {
  // Chain hook: the weighted, barbed head of the sickle's chain (the chain itself is drawn back to the hand).
  hook: {
    frames: 2, outline: true,
    draw(r, t, f, h) {
      const k = upright(t);
      // Last links of the chain, then the iron weight and its hooked blade.
      for (let i = 0; i < 4; i++) r.dot(k.x(-9 + i * 1.1, 0), k.y(-9 + i * 1.1, 0), h(M.chain), (i + f) % 2 ? 1 : 3, 1);
      r.fill(k.circ(-4.4, 0, 1.1), h(M.iron), { group: 1, bevel: 1 });
      r.fill(k.poly([-3.4, -1.2, -1, -2.2, 2, -1.6, 3, 0, 2, 1.6, -1, 2.2, -3.4, 1.2]), h(M.iron), { group: 2, bevel: 1.4 });
      // The hook sweeps forward and curls back over the top, barbed.
      r.fill(k.poly([1.6, 0.8, 4.2, 1.8, 6.4, 4, 6.6, 6.8, 4.8, 8.8, 1.6, 9.2, -1.8, 8, 1.2, 7.4, 3.6, 6.4, 4.2, 4.6, 3, 2.8, 0.6, 1.8]), h(M.hookBlade), { group: 3, bevel: 1.2 });
      r.line(k.x(5.3, 4.4), k.y(5.3, 4.4), k.x(5.2, 6.8), k.y(5.2, 6.8), h(M.hookBlade), 4, 3);
      r.fill(k.poly([2.6, -0.8, 6.8, 0, 2.6, 0.8]), h(M.hookBlade), { group: 3, bevel: 0.8 });
    },
  },
  // Bolas: three stones whirling round their knot.
  bolas: {
    frames: 4, outline: true,
    draw(r, t, f, h) {
      const k = new Xf(t.ox, t.oy, -f * (Math.PI / 6));
      const stones: Shape[] = [];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const x = Math.cos(a) * 6, y = Math.sin(a) * 6;
        r.line(t.ox, t.oy, k.x(x, y), k.y(x, y), h(M.cord), 2, 1);
        stones.push(k.circ(x, y, i ? 1.7 : 1.9));
      }
      r.fill(stones[0], h(M.bolaStone2), { group: 2, bevel: 1.4 });
      r.fill(union(stones[1], stones[2]), h(M.bolaStone), { group: 2, bevel: 1.4 });
      r.fill(k.circ(0, 0, 0.9), h(M.binding), { group: 3, bevel: 1 });
    },
  },
  javelin: {
    frames: 1, outline: true,
    draw(r, t, _f, h) {
      r.fill(t.cap(-17, 0, 9, 0, 0.75, 0.68), h(M.ash), { group: 1, bevel: 0.8 });
      r.fill(t.poly([-17, -0.7, -18.6, 0, -17, 0.7]), h(M.iron), { group: 1, bevel: 0.8 });
      for (let x = -4; x <= 0; x += 1) r.dot(t.x(x, 0), t.y(x, 0), h(M.binding), x % 2 ? 1 : 3, 1);
      r.fill(t.cap(7.6, 0, 9.4, 0, 0.92), h(M.binding), { group: 2, bevel: 0.8 });
      r.fill(t.poly([9, -0.8, 11.6, -1.9, 16.6, 0, 11.6, 1.9, 9, 0.8]), h(M.steel), { group: 3, bevel: 1.2 });
      r.line(t.x(10.4, 0), t.y(10.4, 0), t.x(15, 0), t.y(15, 0), h(M.steel), 4, 3);
      r.fill(t.poly([7.4, 0.6, 5.6, 2.2, 4.8, 1.6, 6.8, 0.4]), h(M.tuft), { group: 2, bevel: 0.8 });
    },
  },
  // Spark: a bright head trailing a jagged bolt that changes shape every frame.
  spark: {
    frames: 3,
    draw(r, t, f, h) {
      const zz = [[-3, 1.4, -5.5, -1, -8, 1.2, -10.5, -0.6], [-3, -1.2, -5.5, 1.3, -8.4, -0.8, -10, 0.8], [-2.6, 1, -5, -1.4, -7.2, 0.6, -10.6, -1]][f];
      let px = 0, py = 0;
      for (let i = 0; i < zz.length; i += 2) {
        r.line(t.x(px, py), t.y(px, py), t.x(zz[i], zz[i + 1]), t.y(zz[i], zz[i + 1]), h(i < 4 ? M.spark : M.sparkDim), 3, 1);
        px = zz[i]; py = zz[i + 1];
      }
      const br = [[-5.5, -1, -6.6, -3], [-5.5, 1.3, -6.2, 3.2], [-5, -1.4, -6.6, -3.2]][f];
      r.line(t.x(br[0], br[1]), t.y(br[0], br[1]), t.x(br[2], br[3]), t.y(br[2], br[3]), h(M.sparkDim), 3, 1);
      r.fill(t.poly([3.4, 0, 0.6, -2.4, -2, 0, 0.6, 2.4]), h(M.spark), { group: 1 });
      r.fill(t.circ(0.6, 0, 1.2), h(M.sparkHot), { group: 1 });
      const tip = [[4.4, 1.6], [4.2, -1.8], [5, 0.4]][f];
      r.dot(t.x(tip[0], tip[1]), t.y(tip[0], tip[1]), h(M.sparkHot), 3, 1);
    },
  },
  // Soul bolt: a pale-green wisp with a little skull face, its tail flickering.
  soul: {
    frames: 3,
    draw(r, t, f, h) {
      const k = upright(t);
      const w = [0, 0.8, -0.6][f];
      r.fill(k.poly([1.4, -3, -4, -2.4 - w * 0.5, -7.6, -0.8 + w, -11.4, 0.6 + w * 1.5, -7, 1.2 + w * 0.5, -4.4, 3.2, 1.4, 3.2]), h(M.soulDim), { group: 1 });
      r.fill(k.poly([0, -2.2, -5, -1, -8.4, 0.4 + w, -4.6, 1.6, 0, 2.4]), h(M.soul), { group: 1 });
      r.fill(k.circ(1.2, 0.3, 3.3), h(M.soul), { group: 1 });
      r.fill(k.ell(1.6, 0.6, 2.4, 2.2), h(M.soulHot), { group: 1 });
      // Hollow eyes and a grin.
      r.dot(k.x(1.6, 1.4), k.y(1.6, 1.4), h(M.soulEye), 1, 1);
      r.dot(k.x(3.4, 1.4), k.y(3.4, 1.4), h(M.soulEye), 1, 1);
      r.line(k.x(2, -0.9), k.y(2, -0.9), k.x(3.4, -0.9), k.y(3.4, -0.9), h(M.soulDim), 3, 1);
    },
  },
  // Bone spikes bursting up out of the ground as the wave runs (origin at its base).
  bonespike: {
    frames: 3, outline: true,
    draw(r, t, f, h) {
      const k = grounded(t);
      // [x, height, lean] per spike; the front ones are still rising.
      const set = [
        [[-10, 5, -2], [-5, 10, -1.4], [0.4, 15, 0.6], [5.4, 9, 2], [9.4, 4, 2.4]],
        [[-10, 3, -2], [-5.6, 7, -1.6], [-0.6, 12, -0.4], [4.6, 15, 1.4], [9.4, 8, 2.6]],
        [[-10, 2, -2], [-6, 5, -1.6], [-1.6, 9, -0.8], [3.4, 13, 0.6], [8.6, 14, 2]],
      ][f];
      for (const [x, ht, lean] of set) {
        const w = 1.4 + ht * 0.12;
        // Fang-like: a curved spike, ridged near the base.
        r.fill(k.poly([x - w, 0, x - w * 0.7 + lean * 0.3, ht * 0.45, x - 0.3 + lean * 0.8, ht * 0.82, x + lean * 1.3, ht, x + w * 0.4 + lean * 0.8, ht * 0.7, x + w * 0.7 + lean * 0.3, ht * 0.35, x + w, 0]), h(M.bone), { group: 1, bevel: 1.4 });
        if (ht > 6) r.line(k.x(x - w * 0.6, ht * 0.25), k.y(x - w * 0.6, ht * 0.25), k.x(x + w * 0.5, ht * 0.25 + 0.6), k.y(x + w * 0.5, ht * 0.25 + 0.6), h(M.boneDark), 1, 1);
      }
      r.fill(k.poly([-13, 0, -11, 1.8, -7, 2.6, -3, 1.6, 1, 2.8, 6, 1.8, 11, 2.4, 13.5, 0]), h(M.dirt), { group: 2, bevel: 1.5 });
      for (const [x, y] of [[-12 + f, 5], [7 - f, 4 + f], [0, 3 + f * 2]]) r.fill(k.circ(x, y, 0.9), h(M.rock), { group: 3, bevel: 1 });
      const top = set[2];
      r.dot(k.x(top[0] + top[2] * 1.3, top[1] - 0.6), k.y(top[0] + top[2] * 1.3, top[1] - 0.6), h(M.soul), 3, 1);
    },
  },
  // Frost bomb: its flask tumbling end over end along the lob.
  frostflask: {
    frames: 6, outline: true,
    draw(r, t, f, h) {
      const a = usableArt('frost_bomb');
      a.draw(r, new Xf(t.ox, t.oy, -f * (Math.PI / 3)), (k) => h(a.mats[k]), { group: 1, frame: f });
    },
  },
  // Caltrops: a handful of four-pointed iron spikes tumbling apart.
  caltrops: {
    frames: 4, outline: true,
    draw(r, t, f, h) {
      const spots = [[-3.4, 2, 0.3], [3.4, 1.4, 1.4], [0, -3, 2.2]];
      spots.forEach(([x, y, a0], i) => {
        const k = new Xf(t.ox + x, t.oy - y, a0 + f * (Math.PI / 4) * (i % 2 ? -1 : 1));
        const arms: Shape[] = [];
        for (let j = 0; j < 4; j++) {
          const a = (j / 4) * Math.PI * 2 + (j % 2) * 0.3;
          const c = Math.cos(a), s = Math.sin(a), len = j === 3 ? 2.6 : 3.6;
          arms.push(k.poly([-s * 0.85, c * 0.85, c * len, s * len, s * 0.85, -c * 0.85]));
        }
        r.fill(union(...arms), h(M.caltrop), { group: 1 + i, bevel: 0.9 });
      });
    },
  },
  // Hunting hawk stooping on its prey, wings swept back into a dart.
  hawk: {
    frames: 2, outline: true,
    draw(r, t, f, h) {
      const k = upright(t);
      const d = f ? -0.8 : 0;
      // Far wing peeking above the near one.
      r.fill(k.poly([0.5, 1.6, -3.6, 7.6 + d, -10.6, 9 + d, -5.2, 3]), h(M.featherDark), { group: 1, bevel: 1 });
      // Tail fanned behind.
      r.fill(k.poly([-4, 0.9, -10.2, 0.4, -10.6, -2.2, -9, -2.6, -4, -0.9]), h(M.feather), { group: 2, bevel: 1 });
      r.line(k.x(-9.6, -0.2), k.y(-9.6, -0.2), k.x(-10.2, -1.8), k.y(-10.2, -1.8), h(M.featherDark), 1, 2);
      r.fill(k.ell(0, 0, 5, 2.2, -0.05), h(M.feather), { group: 3, bevel: 1.6 });
      r.fill(k.ell(0.6, -1, 3.8, 1.1), h(M.belly), { group: 3, bevel: 1 });
      r.fill(k.circ(4.6, 0.7, 2.1), h(M.feather), { group: 3, bevel: 1.4 });
      r.fill(k.ell(5.2, -0.1, 1.2, 0.8), h(M.belly), { group: 3, bevel: 1 });
      r.fill(k.poly([6.2, 1.4, 8.6, 0.6, 8, -0.8, 6.4, -0.2]), h(M.beak), { group: 4, bevel: 0.8 });
      r.dot(k.x(5.2, 1.2), k.y(5.2, 1.2), h(M.hawkEye), 0, 3);
      r.dot(k.x(4.4, 1.5), k.y(4.4, 1.5), h(M.featherDark), 1, 3);
      // Near wing raised and swept back, barred, dark primaries at the tip.
      r.fill(k.poly([3, 1.2, 0.4, 4.4, -4, 6.6 + d, -12.4, 7.4 + d, -7, 3.4, -2, 1.2]), h(M.feather), { group: 5, bevel: 1.2 });
      r.fill(k.poly([-7.4, 5.2 + d * 0.8, -12.4, 7.4 + d, -8, 6.8 + d]), h(M.featherDark), { group: 5, bevel: 1 });
      r.line(k.x(-1, 3.4), k.y(-1, 3.4), k.x(-6, 5.2 + d * 0.6), k.y(-6, 5.2 + d * 0.6), h(M.belly), 2, 5);
    },
  },
  // Dragon breath: a short rolling puff of flame.
  breath: {
    frames: 3,
    draw(r, t, f, h) {
      const p = [[0, 0.6, -0.4], [0.7, -0.4, 0.6], [-0.5, 0.2, 0.9]][f];
      r.fill(union(t.circ(2.4, p[0], 4.2), t.circ(-2.8, 1.8 + p[1], 3.2), t.circ(-2.4, -2 + p[2], 2.9), t.circ(-7, p[0], 2.2), t.circ(-10.4, 1 - p[1], 1.2)), h(M.fireDeep), { group: 1 });
      r.fill(union(t.circ(2.6, p[0] * 0.5, 3.1), t.circ(-2.2, 1.2 + p[1], 2.1), t.circ(-2, -1.4 + p[2], 1.9), t.circ(-6.4, p[0], 1.2)), h(M.fire), { group: 1 });
      r.fill(union(t.circ(3, 0, 1.8), t.circ(0.2, 0.8 + p[1] * 0.5, 1.1)), h(M.fireHot), { group: 1 });
      r.dot(t.x(-9 - f, -2.2 + f), t.y(-9 - f, -2.2 + f), h(M.fire), 3, 1);
    },
  },
  arrow: {
    frames: 1, outline: true,
    draw(r, t, _f, h) {
      r.fill(t.cap(-11, 0, 4, 0, 0.6), h(M.wood), { group: 1, bevel: 0.8 });
      r.fill(t.poly([3, -1.6, 7.5, 0, 3, 1.6]), h(M.steel), { group: 2, bevel: 1 });
      r.fill(t.poly([-12, -2, -8, 0, -12, 2, -10.5, 0]), h(M.fletch), { group: 3, bevel: 0.8 });
    },
  },
  bolt: {
    frames: 1, outline: true,
    draw(r, t, _f, h) {
      r.fill(t.cap(-6, 0, 3, 0, 0.7), h(M.dark), { group: 1, bevel: 0.8 });
      r.fill(t.poly([2.5, -1.5, 6.5, 0, 2.5, 1.5]), h(M.steel), { group: 2, bevel: 1 });
      r.fill(t.poly([-7, -1.6, -4.5, 0, -7, 1.6]), h(M.steel), { group: 3, bevel: 0.8 });
    },
  },
  knife: {
    frames: 4, outline: true,
    draw(r, t, f, h) {
      // Spinning end over end.
      const k = new Xf(t.ox, t.oy, t.ang - f * (Math.PI / 2));
      r.fill(k.cap(-3, 0, 0.5, 0, 0.9), h(M.knifeGrip), { group: 1, bevel: 0.8 });
      r.fill(k.poly([0.5, -1.1, 6, -0.8, 8, 0, 6, 0.8, 0.5, 1.1]), h(M.steel), { group: 2, bevel: 1 });
    },
  },
  chakram: {
    frames: 4, outline: true,
    draw(r, t, f, h) {
      const k = new Xf(t.ox, t.oy, f * (Math.PI / 8));
      const parts = [arc(t.ox, t.oy, 3.2, 6, -Math.PI, Math.PI)];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        parts.push(k.poly([Math.cos(a) * 5, Math.sin(a) * 5, Math.cos(a + 0.6) * 8.5, Math.sin(a + 0.6) * 8.5, Math.cos(a + 0.8) * 5.4, Math.sin(a + 0.8) * 5.4]));
      }
      r.fill(union(...parts), h(M.chakram), { group: 1, bevel: 1.6 });
      r.fill(k.cap(-1.4, -4.4, 1.4, -4.4, 0.9), h(M.chakramGrip), { group: 2, bevel: 0.8 });
    },
  },
  fire: {
    frames: 3,
    draw(r, t, f, h) {
      const wob = [0, 0.8, -0.6][f];
      r.fill(t.poly([3.5, 0, 1, -3.6, -6, -2 + wob, -12, -1 + wob, -6, 0.6, -11, 2.2 - wob, -5, 2.8, 1, 3.6]), h(M.fireDeep), { group: 1 });
      r.fill(t.ell(0, 0, 3.4, 2.8), h(M.fire), { group: 1 });
      r.fill(t.poly([1.5, 0, -1, -1.6, -6, -0.8 + wob, -2, 0.4, -6, 1.4 - wob, -1, 1.8]), h(M.fire), { group: 1 });
      r.fill(t.ell(0.8, 0, 1.8, 1.4), h(M.fireHot), { group: 1 });
    },
  },
  flamewave: {
    frames: 3,
    draw(r, t, f, h) {
      // A wall of flame rolling along the ground (origin at its base).
      const tips = [[-8, 10, -4, 15, 1, 12, 6, 17, 9, 9], [-8, 12, -3, 13, 2, 16, 6, 12, 9, 10], [-8, 9, -4, 14, 0, 11, 5, 15, 9, 11]][f];
      const outer = [-10, 0, -9, 6, tips[0], tips[1], tips[2], tips[3], tips[4], tips[5], tips[6], tips[7], tips[8], tips[9], 11, 4, 10, 0];
      r.fill(t.poly(outer), h(M.fireDeep), { group: 1 });
      r.fill(t.poly([-7, 0, -6, 6, tips[2] + 1, tips[3] - 5, tips[4], tips[5] - 4, tips[6], tips[7] - 6, 8, 3, 7, 0]), h(M.fire), { group: 1 });
      r.fill(t.poly([-3, 0, -2, 4, 1, tips[5] - 7, 4, 4, 4, 0]), h(M.fireHot), { group: 1 });
    },
  },
  arcane: {
    frames: 3,
    draw(r, t, f, h) {
      r.fill(t.poly([2, -3, -10, -1 - f * 0.4, -14, 0, -10, 1 + f * 0.4, 2, 3]), h(M.arcane), { group: 1 });
      r.fill(t.circ(1, 0, 3.4), h(M.arcane), { group: 1 });
      r.fill(t.circ(1.4, 0, 2), h(M.arcaneHot), { group: 1 });
      const sp = [[-5, -3], [-8, 2.6], [-3, 3.4]][f];
      r.dot(t.x(sp[0], sp[1]), t.y(sp[0], sp[1]), h(M.arcaneHot), 3);
    },
  },
  hex: {
    frames: 3,
    draw(r, t, f, h) {
      r.fill(t.circ(0, 0, 6 + (f === 1 ? 0.6 : 0)), h(M.hex), { group: 1 });
      r.fill(t.poly([-3, -5.5, -13, -3 + f, -9, 0, -14, 2 - f, -3, 5.5]), h(M.hex), { group: 1 });
      r.fill(t.circ(0.5, 0.5, 3.6), h(M.hexHot), { group: 1 });
      r.dot(t.x(-0.5, 1.5), t.y(-0.5, 1.5), h(M.hexEye), 3);
      r.dot(t.x(2, 1.5), t.y(2, 1.5), h(M.hexEye), 3);
      r.line(t.x(-0.5, -1.5), t.y(-0.5, -1.5), t.x(2, -1.5), t.y(2, -1.5), h(M.hex), 2);
    },
  },
  wave: {
    frames: 2,
    draw(r, t, f, h) {
      const [cx, cy] = t.p(-6, 0);
      r.fill(arc(cx, cy, 7, 10 + f * 0.5, -t.ang - 1.25, -t.ang + 1.25), h(M.windDim), { group: 1 });
      r.fill(arc(cx, cy, 8.5, 10 + f * 0.5, -t.ang - 1.1, -t.ang + 1.1), h(M.wind), { group: 1 });
    },
  },
  groundwave: {
    frames: 3,
    draw(r, t, f, h) {
      // Rocks and dust erupting along the ground (origin at its base).
      const hs = [[6, 9, 5], [8, 6, 9], [5, 10, 7]][f];
      r.fill(t.poly([-12, 0, -9, 3, -6, hs[0] * 0.7, -3, 2, 0, hs[1], 3, 3, 6, hs[2], 9, 2, 12, 0]), h(M.dirt), { group: 1, bevel: 2 });
      r.fill(t.poly([-1, 0, 0, hs[1] - 1, 2, 2]), h(M.dirtLight), { group: 2, bevel: 1 });
      r.fill(t.poly([5, 0, 6, hs[2] - 1, 8, 1]), h(M.dirtLight), { group: 2, bevel: 1 });
      for (const [x, y] of [[-8, hs[0] + 3], [2, hs[1] + 4], [9, hs[2] + 2]]) r.fill(t.circ(x + f, y, 1.2), h(M.rock), { group: 3, bevel: 1 });
    },
  },
  meteor: {
    frames: 3, outline: true,
    draw(r, t, f, h) {
      const flick = [0, 1, -1][f];
      r.fill(t.poly([6, -7, -10, -6 + flick, -26, -2, -30 - flick * 2, 0, -26, 2, -10, 6 - flick, 6, 7]), h(M.fireDeep), { group: 1 });
      r.fill(t.poly([5, -5, -8, -3, -20, 0, -8, 3, 5, 5]), h(M.fire), { group: 1 });
      r.fill(t.circ(4, 0, 8), h(M.rock), { group: 2, bevel: 3 });
      r.fill(t.circ(6, 1, 3.6), h(M.lava), { group: 3 });
      r.line(t.x(1, -4), t.y(1, -4), t.x(5, -1), t.y(5, -1), h(M.lavaHot), 3);
      r.dot(t.x(7, 2), t.y(7, 2), h(M.lavaHot), 3);
    },
  },
  wisp: {
    frames: 3,
    draw(r, t, f, h) {
      r.fill(t.poly([2, -2.4, -7, -1 + (f - 1) * 0.6, -10, 0, -7, 1 - (f - 1) * 0.6, 2, 2.4]), h(M.wisp), { group: 1 });
      r.fill(t.circ(1, 0, 2.6), h(M.wisp), { group: 1 });
      r.fill(t.circ(1.4, 0, 1.4), h(M.wispHot), { group: 1 });
    },
  },
  // Fire bomb: the flask tumbling end over end, fuse burning.
  flask: {
    frames: 6, outline: true,
    draw(r, t, f, h) {
      const a = usableArt('fire_bomb');
      a.draw(r, new Xf(t.ox, t.oy, -f * (Math.PI / 3)), (k) => h(a.mats[k]), { group: 1, frame: f });
    },
  },
  // Phantom blade (special item): a ghostly greatsword.
  phantom: {
    frames: 1,
    draw(r, t, _f, h) {
      r.fill(t.poly([0, -1.8, 24, -1.6, 29, 0, 24, 1.6, 0, 1.8]), h(M.phantom), { group: 1 });
      r.line(t.x(2, 0), t.y(2, 0), t.x(24, 0), t.y(24, 0), h(M.phantomHot), 3, 1);
      r.fill(t.rect(-1, 0, 1, 4.8, 0.5), h(M.phantomHot), { group: 1 });
      r.fill(t.cap(-7, 0, -2, 0, 1.2), h(M.phantom), { group: 1 });
      r.fill(t.circ(-7.6, 0, 1.6), h(M.phantomHot), { group: 1 });
    },
  },
  // Meteor sigil: a rune circle that turns while the meteor is called.
  sigil: {
    frames: 4,
    draw(r, t, f, h) {
      r.fill(arc(t.ox, t.oy, 9, 10.5, -Math.PI, Math.PI), h(M.sigil), { group: 1 });
      r.fill(arc(t.ox, t.oy, 5, 6, -Math.PI, Math.PI), h(M.sigil), { group: 1 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + f * (Math.PI / 12);
        r.line(t.ox + Math.cos(a) * 6, t.oy + Math.sin(a) * 6, t.ox + Math.cos(a + 2.1) * 6, t.oy + Math.sin(a + 2.1) * 6, h(M.sigil), 3, 1);
        r.dot(t.ox + Math.cos(a) * 9.8, t.oy + Math.sin(a) * 9.8, h(M.lavaHot), 3, 1);
      }
    },
  },
};

/**
 * Sprite ids: the stock ones, plus two only skins draw: `lantern` (the
 * familiar) and `core` (a special item floating at the shoulder).
 */
export type ProjArtId = keyof typeof ART | 'lantern' | 'core';

/** The art for a sprite: the skin's reshaped one if it has it, else the stock one. */
const artFor = (id: ProjArtId, skin?: string | null): ProjArt | undefined => (skin ? SKIN_ART[skin]?.proj?.[id] : undefined) ?? (id === 'lantern' || id === 'core' ? undefined : ART[id]);

/** Whether a skin reshapes this sprite. */
export function skinDraws(id: ProjArtId, skin?: string | null): boolean {
  return !!skin && !!SKIN_ART[skin]?.proj?.[id];
}

const M_NAME = new Map<Material, string>(Object.entries(M).map(([k, m]) => [m, k]));

const cache = new Map<string, Sprite>();
let raster: Raster | null = null;
const STEPS = 32;

export function projFrames(id: ProjArtId, skin?: string | null): number {
  return artFor(id, skin)?.frames ?? 1;
}

/** Sprite for a projectile flying at `angle` (world radians, y up), optionally in a special item skin's colours. */
export function projSprite(id: ProjArtId, frame: number, angle = 0, skin?: string | null): Sprite {
  const a = ((Math.round((angle / (Math.PI * 2)) * STEPS) % STEPS) + STEPS) % STEPS;
  const f = frame % (artFor(id, skin)?.frames ?? 1);
  const key = `${id}.${f}.${a}.${skin ?? ''}`;
  let s = cache.get(key);
  if (s) return s;
  const fr = projFrame(id, f, (a / STEPS) * Math.PI * 2, skin);
  const c = document.createElement('canvas');
  c.width = fr.w; c.height = fr.h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(fr.data.buffer as ArrayBuffer), fr.w, fr.h), 0, 0);
  s = { img: c, ox: fr.ox, oy: fr.oy, w: fr.w, h: fr.h };
  cache.set(key, s);
  return s;
}

/** One projectile frame rasterized at `angle` (uncached; projSprite caches it as a canvas). */
export function projFrame(id: ProjArtId, frame: number, angle = 0, skin?: string | null): Frame {
  const art = artFor(id, skin)!;
  const f = frame % art.frames;
  const r = (raster ??= new Raster(80, 80));
  r.clear();
  const mats = new Map<Material, number>();
  const over = skin ? skinMaterials(skin) : null;
  const h = (m: Material) => {
    if (over) m = over[M_NAME.get(m)!] ?? m;
    let k = mats.get(m);
    if (!k) { k = r.add(m); mats.set(m, k); }
    return k;
  };
  art.draw(r, new Xf(40, 40, angle), f, h);
  return r.compose(40, 40, art.outline ?? false);
}

const bottles = new Map<string, Sprite>();

/** An empty bottle tumbling through the air (tossed away after drinking), 8 frames per turn. */
export function bottleSprite(id: UsableId, frame: number): Sprite {
  const f = ((frame % 8) + 8) % 8;
  const key = `${id}.${f}`;
  let s = bottles.get(key);
  if (s) return s;
  const r = (raster ??= new Raster(80, 80));
  r.clear();
  const a = usableArt(id);
  const mats = new Map<Material, number>();
  const h = (k: string) => {
    const m = a.mats[k];
    let i = mats.get(m);
    if (!i) { i = r.add(m); mats.set(m, i); }
    return i;
  };
  a.draw(r, new Xf(40, 40, f * (Math.PI / 4)), h, { group: 1, open: true });
  const fr = r.compose(40, 40, true);
  const c = document.createElement('canvas');
  c.width = fr.w; c.height = fr.h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(fr.data.buffer as ArrayBuffer), fr.w, fr.h), 0, 0);
  s = { img: c, ox: fr.ox, oy: fr.oy, w: fr.w, h: fr.h };
  bottles.set(key, s);
  return s;
}
