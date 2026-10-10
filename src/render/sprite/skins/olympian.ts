import type { Layer } from '../../auraKit';
import type { SkinArt, SkinFx } from './index';

/** Epic set: Olympian. White marble and bronze of the gods of Olympus, laurel and lightning, a crimson cloak in the wind. */

export const OLYMPIAN_FX: SkinFx = { spark: 0xfff6c0, spark2: 0x4ab0ff, kind: 'twinkle' };

/** The full-set aura around the feet at (x, y) art pixels. */
export function olympianAura(_g: CanvasRenderingContext2D, _x: number, _y: number, _t: number, _layer: Layer): void {
}

export const OLYMPIAN: Record<string, SkinArt> = {
};
