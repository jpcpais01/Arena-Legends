/**
 * Helpers for set auras (setAura.ts and the set files' own aura drawers),
 * kept apart so set files don't import setAura.
 */

export type Layer = 'back' | 'front';

/** Points of a ground ellipse, split into the half behind the feet and the half in front. */
export function ring(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, n: number, layer: Layer, dot: (g: CanvasRenderingContext2D, px: number, py: number, i: number) => void): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    dot(g, Math.round(x + Math.cos(a) * rx), Math.round(y + s * ry), i);
  }
}
