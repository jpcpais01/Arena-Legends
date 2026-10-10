import type { Layer } from '../../auraKit';
import type { SkinArt, SkinFx } from './index';

/** Epic set: Sugar Rush. Candy-shop pastels, frosting and sprinkles, sweets popping in fizzy bursts. */

export const SUGARRUSH_FX: SkinFx = { spark: 0xffffff, spark2: 0xff7ac8, kind: 'twinkle' };

/** The full-set aura around the feet at (x, y) art pixels. */
export function sugarrushAura(_g: CanvasRenderingContext2D, _x: number, _y: number, _t: number, _layer: Layer): void {
}

export const SUGARRUSH: Record<string, SkinArt> = {
};
