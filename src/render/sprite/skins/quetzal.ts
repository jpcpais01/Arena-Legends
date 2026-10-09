import type { Layer } from '../../auraKit';
import type { SkinArt, SkinFx } from './index';

/** Epic set: quetzal (work in progress). */

export const QUETZAL_FX: SkinFx = { spark: 0xffffff, spark2: 0x888888, kind: 'twinkle' };

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function quetzalAura(_g: CanvasRenderingContext2D, _x: number, _y: number, _t: number, _layer: Layer): void {}

export const QUETZAL: Record<string, SkinArt> = {};
