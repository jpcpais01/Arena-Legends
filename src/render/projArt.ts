import type { ProjectileStyle, UsableId } from '../sim/types';
import { material, Raster, type Material } from './pixel/raster';
import { arc, union } from './pixel/sdf';
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
};

const ART: Record<ProjectileStyle | 'phantom' | 'sigil', ProjArt> = {
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
  const art = artFor(id, skin)!;
  const f = frame % art.frames;
  const key = `${id}.${f}.${a}.${skin ?? ''}`;
  let s = cache.get(key);
  if (s) return s;
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
  art.draw(r, new Xf(40, 40, (a / STEPS) * Math.PI * 2), f, h);
  const fr = r.compose(40, 40, art.outline ?? false);
  const c = document.createElement('canvas');
  c.width = fr.w; c.height = fr.h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(fr.data.buffer as ArrayBuffer), fr.w, fr.h), 0, 0);
  s = { img: c, ox: fr.ox, oy: fr.oy, w: fr.w, h: fr.h };
  cache.set(key, s);
  return s;
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
