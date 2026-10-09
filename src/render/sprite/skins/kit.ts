import { mix } from '../../pixel/color';
import { material, type LocalSpace, type Material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import type { Xf } from '../xform';

/**
 * Small helpers shared by the epic skin sets (kept apart from skins/index.ts
 * so the set files don't import the registry they are part of).
 */

export const Q = Math.PI / 2; // one idle frame of a four-frame loop

export const wrap = (v: number, p: number) => ((v % p) + p) % p;

export const shiny = (base: number, tex?: Tex, step = 0.15): MaterialSpec => ({ base, shiny: true, step, tex });
export const plain = (base: number, tex?: Tex): MaterialSpec => ({ base, tex });
export const glow = (base: number, tex?: Tex): MaterialSpec => ({ base, glow: true, tex });
/** Dark tones with a hot fifth tone that the texture lights up. */
export const veined = (dark: number[], hot: number, tex: Tex): MaterialSpec => ({ base: dark[2], ramp: [...dark, hot], tex });

/** Epic effects: sparkles or flames in one colour family, and the swing trail. */
export const epicFx = (spark: number, spark2: number, kind: 'twinkle' | 'flame' = 'twinkle', trail = spark) => ({
  fx: { spark, spark2, kind },
  trail: [trail, mix(trail, spark2, 0.55)] as [number, number],
});

/** Materials built once for a hand-drawn battle sprite. */
export const mats = <K extends string>(specs: Record<K, MaterialSpec>): Record<K, Material> => {
  const out = {} as Record<K, Material>;
  for (const k of Object.keys(specs) as K[]) out[k] = material(specs[k]);
  return out;
};

/** A flame tongue standing on (x, y) in frame F, leaning by `lean`, `h` tall. */
export function flameTongue(r: Raster, F: Xf, x: number, y: number, w: number, h: number, lean: number, mat: number, hot: number, g: number, local?: LocalSpace): void {
  r.fill(F.poly([x - w, y, x - w * 0.5 + lean * 0.4, y + h * 0.55, x + lean, y + h, x + w * 0.6 + lean * 0.5, y + h * 0.45, x + w, y]), mat, { group: g, local });
  if (h > 2) r.fill(F.poly([x - w * 0.45, y, x + lean * 0.6, y + h * 0.6, x + w * 0.45, y]), hot, { group: g, noLine: true, local });
}
