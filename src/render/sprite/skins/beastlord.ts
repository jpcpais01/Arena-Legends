import type { Layer } from '../../auraKit';
import type { SkinArt, SkinFx } from './index';

/** Epic set: Primal Beastlord. Bone, hide and war paint of the first hunters, a sabertooth roar and stamping earth. */

export const BEASTLORD_FX: SkinFx = { spark: 0xffe0a0, spark2: 0xc06a2a, kind: 'twinkle' };

/** The full-set aura around the feet at (x, y) art pixels. */
export function beastlordAura(_g: CanvasRenderingContext2D, _x: number, _y: number, _t: number, _layer: Layer): void {
}

export const BEASTLORD: Record<string, SkinArt> = {
};
