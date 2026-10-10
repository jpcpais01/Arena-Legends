import type { Layer } from '../../auraKit';
import type { SkinArt, SkinFx } from './index';

/** Epic set: Dread Tide Corsair. A ghost-pirate captain: tar-black coats, tarnished gold and sea-green ghostlight, gulls and spray on the wind. */

export const CORSAIR_FX: SkinFx = { spark: 0xb8ffe0, spark2: 0x1a8a7a, kind: 'twinkle' };

/** The full-set aura around the feet at (x, y) art pixels. */
export function corsairAura(_g: CanvasRenderingContext2D, _x: number, _y: number, _t: number, _layer: Layer): void {
}

export const CORSAIR: Record<string, SkinArt> = {
};
