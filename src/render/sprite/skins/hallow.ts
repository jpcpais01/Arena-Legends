import type { Layer } from '../../auraKit';
import type { SkinArt, SkinFx } from './index';

/** Epic set: Hallow King. The pumpkin king of harvest night: carved pumpkins, scarecrow straw and candle-orange fire, bats and leaves on the wind. */

export const HALLOW_FX: SkinFx = { spark: 0xffd060, spark2: 0xff6a10, kind: 'twinkle' };

/** The full-set aura around the feet at (x, y) art pixels. */
export function hallowAura(_g: CanvasRenderingContext2D, _x: number, _y: number, _t: number, _layer: Layer): void {
}

export const HALLOW: Record<string, SkinArt> = {
};
