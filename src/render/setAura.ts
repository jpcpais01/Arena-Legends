import type { SkinSetId } from '../character/skins';
import { css } from './pixel/color';
import type { SkinFx } from './sprite/skins';

/**
 * Set auras: what a fighter wearing a whole epic set gets around them, in
 * battle and in the gear preview. Drawn straight onto the canvas in art
 * pixels around the feet: a `back` layer before the fighter and a `front`
 * layer after, so things can circle around them. A few dozen rects a frame.
 */

/** Particles the set sheds around the fighter in battle. */
export const SET_FX: Record<SkinSetId, SkinFx> = {
  sunborn: { spark: 0xfff4c0, spark2: 0x3a6ae0, kind: 'twinkle' },
  hellforged: { spark: 0xffd060, spark2: 0xc01a10, kind: 'flame' },
  foxfire: { spark: 0xd8f8ff, spark2: 0x2a5ae0, kind: 'flame' },
  wildwood: { spark: 0xfff07a, spark2: 0x2ec27a, kind: 'twinkle' },
};

type Layer = 'back' | 'front';
type G = CanvasRenderingContext2D;

const C = {
  gold: css(0xf0c040), goldHi: css(0xfff0a0), lapis: css(0x3a6ae0), sun: css(0xffd870),
  ember: css(0x8a1a10), fire: css(0xff6a1a), fireHi: css(0xffd060), crack: css(0x3a0c0a),
  fox: css(0x4aa8ff), foxHi: css(0xd8f8ff), foxDeep: css(0x2a5ae0),
  grass: css(0x4aa83a), grassHi: css(0x8ad860), bloom: css(0xf6a8c8), fly: css(0xfff07a), flyDim: css(0xa8c040),
};

/** Points of a ground ellipse, split into the half behind the feet and the half in front. */
function ring(g: G, x: number, y: number, rx: number, ry: number, n: number, layer: Layer, dot: (g: G, px: number, py: number, i: number) => void): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    dot(g, Math.round(x + Math.cos(a) * rx), Math.round(y + s * ry), i);
  }
}

function sunborn(g: G, x: number, y: number, t: number, layer: Layer): void {
  if (layer === 'back') {
    // A sun halo behind the shoulders, its rays turning slowly.
    g.globalAlpha = 0.35;
    g.fillStyle = C.sun;
    const cx = x, cy = y - 36;
    for (let k = 0; k < 12; k++) {
      const a = t * 0.5 + (k * Math.PI) / 6;
      const c = Math.cos(a), s = Math.sin(a);
      for (let d = 11; d <= (k % 2 ? 15 : 18); d++) g.fillRect(Math.round(cx + c * d), Math.round(cy + s * d), 1, 1);
    }
    g.globalAlpha = 1;
  }
  // A gold ring on the ground, its dashes running round; four lapis stones riding it.
  const step = Math.floor(t * 10);
  g.fillStyle = C.gold;
  ring(g, x, y, 17, 4, 56, layer, (g, px, py, i) => { if ((i + step) % 7) g.fillRect(px, py, 1, 1); });
  for (let k = 0; k < 4; k++) {
    const a = t * 0.8 + (k * Math.PI) / 2, s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const px = Math.round(x + Math.cos(a) * 17), py = Math.round(y + s * 4);
    g.fillStyle = C.lapis; g.fillRect(px - 1, py - 1, 3, 2);
    g.fillStyle = C.goldHi; g.fillRect(px, py - 1, 1, 1);
  }
}

function hellforged(g: G, x: number, y: number, t: number, layer: Layer): void {
  // Molten cracks ringing the feet, hellfire flickering up out of them.
  g.fillStyle = C.crack;
  ring(g, x, y, 15, 3.6, 40, layer, (g, px, py, i) => { if (i % 5 !== 2) g.fillRect(px, py, 1, 1); });
  ring(g, x, y, 15, 3.6, 14, layer, (g, px, py, i) => {
    const h = 1 + Math.round(3.5 * Math.abs(Math.sin(t * 7 + i * 1.7)));
    g.fillStyle = C.ember; g.fillRect(px, py - 1, 1, 1);
    g.fillStyle = C.fire; g.fillRect(px, py - h, 1, h);
    g.fillStyle = C.fireHi; g.fillRect(px, py - Math.max(1, h - 1), 1, 1);
    if (h > 3) { g.fillStyle = C.fire; g.fillRect(px - 1, py - 1, 3, 1); }
  });
}

function foxfire(g: G, x: number, y: number, t: number, layer: Layer): void {
  // A faint ring of blue at the feet.
  g.globalAlpha = 0.6;
  g.fillStyle = C.foxDeep;
  const step = Math.floor(t * 6);
  ring(g, x, y, 15, 3.4, 40, layer, (g, px, py, i) => { if ((i + step) % 4 === 0) g.fillRect(px, py, 1, 1); });
  g.globalAlpha = 1;
  // Three fox flames circling the fighter at different heights, tails streaming behind.
  for (let k = 0; k < 3; k++) {
    const a = t * 1.7 + (k * Math.PI * 2) / 3;
    const s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const h = 16 + k * 9 + Math.sin(t * 3 + k * 2) * 2;
    const px = Math.round(x + Math.cos(a) * 15), py = Math.round(y - h + s * 3);
    // The tail trails against the direction of travel (around the circle).
    const dir = -Math.sin(a) >= 0 ? -1 : 1;
    for (let i = 1; i <= 4; i++) {
      g.fillStyle = i < 3 ? C.fox : C.foxDeep;
      g.fillRect(px + dir * (i + 1), py + (i > 2 ? -1 : 0), 1, 1);
    }
    g.fillStyle = C.fox; g.fillRect(px - 1, py - 1, 3, 3); g.fillRect(px, py - 3, 1, 2);
    g.fillStyle = C.foxHi; g.fillRect(px, py, 1, 1);
  }
}

function wildwood(g: G, x: number, y: number, t: number, layer: Layer): void {
  // A ring of grass and blossoms springs up around the feet, swaying.
  ring(g, x, y, 15, 3.6, 22, layer, (g, px, py, i) => {
    const lean = Math.sin(t * 2.4 + i * 0.8) > 0.3 ? 1 : 0;
    const h = 2 + (i % 3);
    g.fillStyle = C.grass; g.fillRect(px, py - h + 1, 1, h);
    g.fillStyle = C.grassHi; g.fillRect(px + lean, py - h, 1, 1);
    if (i % 5 === 1) { g.fillStyle = C.bloom; g.fillRect(px - 1 + lean, py - h - 1, 3, 1); g.fillRect(px + lean, py - h - 2, 1, 3); }
  });
  // Fireflies drifting in slow loops around the fighter, blinking.
  for (let k = 0; k < 6; k++) {
    const a = t * (0.6 + k * 0.09) + k * 1.9;
    const s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const px = Math.round(x + Math.cos(a) * (12 + (k % 3) * 3)), py = Math.round(y - 10 - k * 6 + Math.sin(t * 1.3 + k) * 3 + s * 2);
    const on = Math.sin(t * 3 + k * 2.3) > -0.3;
    g.fillStyle = on ? C.fly : C.flyDim;
    g.fillRect(px, py, 1, 1);
    if (on) { g.globalAlpha = 0.5; g.fillRect(px - 1, py, 3, 1); g.fillRect(px, py - 1, 1, 3); g.globalAlpha = 1; }
  }
}

const DRAW: Record<SkinSetId, (g: G, x: number, y: number, t: number, layer: Layer) => void> = { sunborn, hellforged, foxfire, wildwood };

/** Draws one layer of a set's aura around feet at (x, y) art pixels; `t` is seconds. */
export function drawSetAura(g: G, set: SkinSetId, x: number, y: number, t: number, layer: Layer): void {
  DRAW[set](g, x, y, t, layer);
}
