import type { Layer } from '../../auraKit';
import type { SkinArt, SkinFx } from './index';

/** Epic set: Djinn of the Endless Sands. Silks of turquoise and saffron, gold filigree and smoky blue djinn fire, sand on the wind. */

export const DJINN_FX: SkinFx = { spark: 0xfff0b0, spark2: 0x2ab8d0, kind: 'twinkle' };

/** The full-set aura around the feet at (x, y) art pixels. */
export function djinnAura(_g: CanvasRenderingContext2D, _x: number, _y: number, _t: number, _layer: Layer): void {
}

export const DJINN: Record<string, SkinArt> = {
};
