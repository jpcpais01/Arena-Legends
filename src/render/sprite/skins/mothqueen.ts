import type { Layer } from '../../auraKit';
import type { SkinArt, SkinFx } from './index';

/** Epic set: Moth Queen's Court. Fae royalty of the moonlit wood: luna-moth wings, silver dust and soft glowing mushrooms. */

export const MOTHQUEEN_FX: SkinFx = { spark: 0xe8fff0, spark2: 0x8ad0b0, kind: 'twinkle' };

/** The full-set aura around the feet at (x, y) art pixels. */
export function mothqueenAura(_g: CanvasRenderingContext2D, _x: number, _y: number, _t: number, _layer: Layer): void {
}

export const MOTHQUEEN: Record<string, SkinArt> = {
};
