import { DEFAULT_LOOK } from '../character/appearance';
import { gearOf } from '../sim/gear';
import type { GearId, GearSet, SpecialId } from '../sim/types';
import { material, Raster, type Frame, type Material } from './pixel/raster';
import { arc } from './pixel/sdf';
import { STAND } from './sprite/pose';
import { drawFigure } from './sprite/draw';
import { makeArt } from './sprite/look';
import { weaponArt } from './sprite/weapons';
import { Xf } from './sprite/xform';

/**
 * Pixel icons for every piece of gear, drawn with the same rasterizer as the
 * fighters: weapons laid diagonally, armour cropped from a body wearing it,
 * special items hand-drawn.
 */

const SIZE = 48;
let raster: Raster | null = null;
const R = () => (raster ??= new Raster(140, 140));

function handles(r: Raster) {
  const map = new Map<Material, number>();
  return (m: Material) => {
    let k = map.get(m);
    if (!k) { k = r.add(m); map.set(m, k); }
    return k;
  };
}

const SM = {
  gold: material({ base: 0xe0b040, shiny: true }),
  ember: material({ base: 0xff8a2a, glow: true }),
  emberHot: material({ base: 0xfff0a0, glow: true }),
  emberDeep: material({ base: 0xd83a1a, glow: true }),
  ice: material({ base: 0x9ae8ff, shiny: true, step: 0.16 }),
  iceGlow: material({ base: 0xe8ffff, glow: true }),
  stone: material({ base: 0x5a6aa0, step: 0.14 }),
  rune: material({ base: 0x9af0ff, glow: true }),
  fang: material({ base: 0xf4ecd8, shiny: true }),
  blood: material({ base: 0xc0182a, shiny: true }),
  cord: material({ base: 0x3a2a30 }),
  feather: material({ base: 0xff6a2a }),
  featherTip: material({ base: 0xffd060, glow: true }),
  lantern: material({ base: 0xb08a3a, shiny: true }),
  wisp: material({ base: 0x7ae8ff, glow: true }),
  wispHot: material({ base: 0xf0ffff, glow: true }),
  sigil: material({ base: 0xff9a3a, glow: true }),
  rock: material({ base: 0x6a4a3a }),
  phantom: material({ base: 0xa8c8ff, glow: true }),
  phantomHot: material({ base: 0xf0f8ff, glow: true }),
};

function special(id: SpecialId, r: Raster, c: number): void {
  const h = handles(r);
  const t = new Xf(c, c, 0);
  switch (id) {
    case 'meteor_sigil':
      r.fill(arc(c, c, 11, 13, -Math.PI, Math.PI), h(SM.sigil), { group: 1 });
      r.fill(t.circ(-2, 2, 6.5), h(SM.rock), { group: 2, bevel: 3 });
      r.fill(t.circ(-0.5, 0.5, 2.6), h(SM.ember), { group: 3 });
      r.fill(t.poly([3, 7, 12, 14, 7, 3]), h(SM.ember), { group: 1 });
      break;
    case 'phantom_blade': {
      const b = new Xf(c - 9, c + 9, Math.PI / 4);
      r.fill(b.poly([0, -1.8, 20, -1.6, 25, 0, 20, 1.6, 0, 1.8]), h(SM.phantom), { group: 1 });
      r.line(b.x(2, 0), b.y(2, 0), b.x(20, 0), b.y(20, 0), h(SM.phantomHot), 3, 1);
      r.fill(b.rect(-1, 0, 1, 4.6, 0.5), h(SM.phantomHot), { group: 1 });
      r.fill(b.cap(-6, 0, -2, 0, 1.2), h(SM.phantom), { group: 1 });
      break;
    }
    case 'wisp_lantern':
      r.fill(t.rect(0, 8, 5, 1.2), h(SM.lantern), { group: 1, bevel: 1 });
      r.fill(t.rect(0, -8, 6, 1.4), h(SM.lantern), { group: 1, bevel: 1 });
      r.fill(t.cap(0, 9, 0, 12, 0.8), h(SM.lantern), { group: 1, bevel: 1 });
      r.fill(t.rect(0, 0, 4.4, 7), h(SM.wisp), { group: 2 });
      r.fill(t.circ(0, -1, 2.2), h(SM.wispHot), { group: 2 });
      r.fill(t.rect(-5, 0, 0.8, 7), h(SM.lantern), { group: 3, bevel: 1 });
      r.fill(t.rect(5, 0, 0.8, 7), h(SM.lantern), { group: 3, bevel: 1 });
      break;
    case 'phoenix_feather': {
      const f = new Xf(c - 8, c - 8, Math.PI / 4);
      r.fill(f.poly([0, 0, 8, -4, 18, -3, 25, 0, 18, 4, 8, 4.4]), h(SM.feather), { group: 1, bevel: 2 });
      r.fill(f.poly([16, -2, 25, 0, 16, 2.4]), h(SM.featherTip), { group: 2 });
      r.line(f.x(-3, 0), f.y(-3, 0), f.x(22, 0), f.y(22, 0), h(SM.gold), 3, 3);
      break;
    }
    case 'echo_stone':
      r.fill(arc(c, c, 12, 13, -Math.PI, Math.PI), h(SM.rune), { group: 3 });
      r.fill(t.poly([-7, -6, -8, 3, -2, 9, 6, 7, 8, -2, 3, -8]), h(SM.stone), { group: 1, bevel: 3 });
      r.line(t.x(-3, 2), t.y(-3, 2), t.x(1, -2), t.y(1, -2), h(SM.rune), 3, 1);
      r.line(t.x(1, -2), t.y(1, -2), t.x(4, 2), t.y(4, 2), h(SM.rune), 3, 1);
      break;
    case 'vampiric_fang':
      r.fill(t.cap(-8, 9, 0, 3, 0.7), h(SM.cord), { group: 1, bevel: 1 });
      r.fill(t.cap(8, 9, 0, 3, 0.7), h(SM.cord), { group: 1, bevel: 1 });
      r.fill(t.poly([-3, 3, 3, 3, 1, -9, 0, -11]), h(SM.fang), { group: 2, bevel: 2 });
      r.fill(t.circ(0, -8, 1.4), h(SM.blood), { group: 3, bevel: 1 });
      break;
    case 'ember_core':
      r.fill(t.poly([0, 13, -5, 5, -9, 2, -7, -6, 0, -10, 7, -6, 9, 2, 5, 5]), h(SM.emberDeep), { group: 1 });
      r.fill(t.circ(0, -1, 7), h(SM.ember), { group: 1 });
      r.fill(t.circ(-1, 0, 3.6), h(SM.emberHot), { group: 1 });
      break;
    case 'frost_core':
      for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
        const k = new Xf(c, c, a);
        r.fill(k.poly([-12, 0, -8, -1.6, 8, -1.6, 12, 0, 8, 1.6, -8, 1.6]), h(SM.ice), { group: 1, bevel: 1.5 });
      }
      r.fill(t.circ(0, 0, 4.6), h(SM.ice), { group: 2, bevel: 2.5 });
      r.fill(t.circ(-1, 1, 2), h(SM.iceGlow), { group: 2 });
      break;
  }
}

const cache = new Map<string, Frame>();

/** Icon frame for a piece of gear, optionally in a skin (cropped, outlined). */
export function iconFrame(id: GearId, skin?: string | null): Frame {
  const key = skin ? `${id}|${skin}` : id;
  let f = cache.get(key);
  if (f) return f;
  const def = gearOf(id);
  const r = R();
  r.clear();
  r.phase = 0;
  const c = 70;
  if (def.slot === 'main' || def.slot === 'secondary') {
    const w = weaponArt(id, skin)!;
    const shield = id === 'kite_shield' || id === 'buckler';
    const bow = id === 'longbow';
    const ang = shield ? -Math.PI / 2 : bow ? -Math.PI / 4 : Math.PI / 4;
    // Long weapons are shortened along their length so every icon fits the same box.
    const back = w.grip2 !== undefined ? w.tip * 0.5 : 6;
    const sx = Math.min(1, 46 / (w.tip + back));
    const mid = ((w.tip - back) / 2) * sx;
    const t = shield || bow ? new Xf(c, c, ang, bow ? Math.min(1, 40 / (w.tip * 2)) : 1, 1) : new Xf(c - Math.cos(ang) * mid, c + Math.sin(ang) * mid, ang, sx, 1);
    const h = handles(r);
    const mats: Record<string, number> = {};
    for (const [k, m] of Object.entries(w.mats)) mats[k] = h(m);
    w.draw(r, t, (k) => mats[k], { group: 6 });
    f = r.compose(c, c);
  } else if (def.slot === 'special') {
    special(id as SpecialId, r, c);
    f = r.compose(c, c);
  } else {
    // Armour: crop the relevant part of a body wearing only that piece.
    const gear = { main: 'dagger', [def.slot]: id } as unknown as GearSet;
    const art = makeArt({ name: '', form: 'balanced', gear, look: { ...DEFAULT_LOOK, species: 'golem', outfit: 7 }, skins: skin ? { [id]: skin } : {} });
    const ox = 70, oy = 120;
    const sk = drawFigure(r, art, { pose: { ...STAND, hNx: -0.3, hNy: -0.9, wAng: -1.8 }, hold: { main: 'none', sec: 'gone' }, face: 'calm' }, ox, oy);
    const full = r.compose(ox, oy);
    // Reshaped headgear can rise well above the head (horns, halos).
    const tall = def.slot === 'head' && !!art.headDraw;
    const center = def.slot === 'head' ? { x: sk.head.x, y: sk.head.y + (tall ? 4 : 1) } : def.slot === 'chest' ? { x: sk.chest.x - 1, y: (sk.chest.y + sk.hip.y) / 2 } : { x: (sk.ankleN.x + sk.ankleF.x) / 2 + 2, y: sk.kneeN.y * 0.45 };
    const half = def.slot === 'chest' ? 17 : tall ? 16 : 13;
    f = crop(full, ox + center.x - (ox - full.ox) - half, oy - center.y - (oy - full.oy) - half, half * 2, half * 2);
  }
  cache.set(key, f);
  return f;
}

function crop(src: Frame, x0: number, y0: number, w: number, h: number): Frame {
  x0 = Math.round(x0); y0 = Math.round(y0);
  const data = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x0 + x, sy = y0 + y;
    if (sx >= 0 && sy >= 0 && sx < src.w && sy < src.h) data[y * w + x] = src.data[sy * src.w + sx];
  }
  return { w, h, ox: 0, oy: 0, data };
}

export const ICON_SIZE = SIZE;

/** Icon as a canvas at `scale` device pixels per art pixel, centred in a square. */
export function iconCanvas(id: GearId, px = SIZE, skin?: string | null): HTMLCanvasElement {
  const f = iconFrame(id, skin);
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  const tmp = document.createElement('canvas');
  tmp.width = f.w; tmp.height = f.h;
  tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(f.data.buffer as ArrayBuffer), f.w, f.h), 0, 0);
  const s = Math.max(1, Math.floor(Math.min(px / f.w, px / f.h)));
  g.imageSmoothingEnabled = false;
  g.drawImage(tmp, Math.floor((px - f.w * s) / 2), Math.floor((px - f.h * s) / 2), f.w * s, f.h * s);
  return c;
}
