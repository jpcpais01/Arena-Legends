import type { Layer } from '../../auraKit';
import type { SkinArt, SkinFx } from './index';

/** Epic set: Oni Shogun. Black and crimson lacquer of a demon warlord, gold crests and drifting red maple leaves. */

export const ONI_FX: SkinFx = { spark: 0xffd070, spark2: 0xc0201a, kind: 'twinkle' };

/** The full-set aura around the feet at (x, y) art pixels. */
export function oniAura(_g: CanvasRenderingContext2D, _x: number, _y: number, _t: number, _layer: Layer): void {
}

export const ONI: Record<string, SkinArt> = {
};
