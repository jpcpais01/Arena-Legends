import type { Layer } from '../../auraKit';
import type { SkinArt, SkinFx } from './index';

/** Epic set: Plague Doctor. Waxed black leather, brass and glass vials of sickly green, a miasma creeping along the ground. */

export const PLAGUE_FX: SkinFx = { spark: 0xd8ff8a, spark2: 0x4a8a2a, kind: 'twinkle' };

/** The full-set aura around the feet at (x, y) art pixels. */
export function plagueAura(_g: CanvasRenderingContext2D, _x: number, _y: number, _t: number, _layer: Layer): void {
}

export const PLAGUE: Record<string, SkinArt> = {
};
