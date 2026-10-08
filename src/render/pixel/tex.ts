import type { Tex } from './raster';

/**
 * Surface patterns for skins. Each returns a tone offset at a point in the
 * part's own space (weapon units: x along the weapon, y across it), so the
 * pattern stays glued to the item as it swings. `phase` is the animation
 * frame: flowing patterns move one step per frame at no extra cost.
 */

/** Stable 0..1 noise per integer cell. */
export function hash(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const wrap = (v: number, p: number) => ((v % p) + p) % p;

/** Random flecks (patina, stone, starlight). */
export const speckle = (density = 0.12, d = -1): Tex => (x, y) => (hash(Math.floor(x), Math.floor(y)) < density ? d : 0);

/** Folded-steel bands rippling along the part. */
export const damascus = (period = 3, amp = 1.2): Tex => (x, y) => {
  const v = Math.sin((y + Math.sin(x * 0.55) * amp) * ((Math.PI * 2) / period));
  return v > 0.6 ? 1 : v < -0.8 ? -1 : 0;
};

/** Wood or bone grain: thin dark streaks along the part. */
export const grain = (d = -1): Tex => (x, y) => (Math.sin(y * 2.9 + Math.sin(x * 0.3 + hash(Math.floor(y * 2), 3) * 4) * 1.4) > 0.72 ? d : 0);

/** Bands across the part (wraps, lacquer rings). */
export const bands = (period = 3, width = 1, d = 1): Tex => (x) => (wrap(x, period) < width ? d : 0);

/** Diamond lattice (scales, quilting). */
export const lattice = (size = 3, d = -1): Tex => (x, y) => (wrap(Math.floor(x + y), size) === 0 || wrap(Math.floor(x - y), size) === 0 ? d : 0);

/** Branching cracks (lava, lightning, roots). */
export const veins = (scale = 1, d = 1): Tex => (x, y) => {
  const v = Math.sin(x * 0.7 * scale + Math.sin(y * 1.3 * scale) * 2.2) + Math.sin(y * 0.9 * scale - x * 0.25 * scale) * 0.6;
  return Math.abs(v) < 0.24 ? d : 0;
};

/** A band of light running along the part, one step per animation frame. */
export const flow = (period = 8, width = 2, speed = 2, d = 1): Tex => (x, _y, ph) => (wrap(x - ph * speed, period) < width ? d : 0);

/** Twinkling points that move every frame. */
export const glint = (density = 0.05, d = 2): Tex => (x, y, ph) => (hash(Math.floor(x) + ph * 31, Math.floor(y) - ph * 17) < density ? d : 0);

/** Several patterns stacked. */
export const sum = (...ts: Tex[]): Tex => (x, y, ph) => {
  let t = 0;
  for (const f of ts) t += f(x, y, ph);
  return t;
};
