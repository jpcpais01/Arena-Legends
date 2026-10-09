import type { SkinArt, SkinFx } from './index';

/** Epic set: Frostbound Jarl. (Placeholder; art to come.) */

/** Particles the full set sheds in battle. */
export const FROSTBOUND_FX: SkinFx = { spark: 0xffffff, spark2: 0x888888, kind: 'twinkle' };

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function frostboundAura(_g: CanvasRenderingContext2D, _x: number, _y: number, _t: number, _layer: 'back' | 'front'): void {}

export const FROSTBOUND: Record<string, SkinArt> = {};
