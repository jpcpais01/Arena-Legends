import type { Layer } from '../../auraKit';
import type { SkinArt, SkinFx } from './index';

/** Epic set: Lionheart. A paladin king's white steel and gold, lion crests and royal blue, sunlight blazing at every edge. */

export const LIONHEART_FX: SkinFx = { spark: 0xfff4c0, spark2: 0xf0b030, kind: 'twinkle' };

/** The full-set aura around the feet at (x, y) art pixels. */
export function lionheartAura(_g: CanvasRenderingContext2D, _x: number, _y: number, _t: number, _layer: Layer): void {
}

export const LIONHEART: Record<string, SkinArt> = {
};
