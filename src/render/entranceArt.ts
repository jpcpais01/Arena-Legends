import type { View } from './fx';
import { css, mix } from './pixel/color';
import { drawText } from './font';
import { PPM } from './sprite/animator';

/**
 * The drawn parts of the entrances (pools, beams, columns of fire, the
 * meteor, the twister, bats, statues, pillars, rifts, constellations,
 * wings...): pixel shapes the particles can't make, drawn behind ('under')
 * or in front of ('over') the fighter. Light on top comes from the shader
 * layer (or its canvas stand-in); these stay plain pixel art.
 */

/** What the drawings need to know about the entrance playing. */
export interface EntSpot {
  /** The fighter's spot (world metres) and which way they face. */
  x: number;
  facing: number;
  /** Full battle scene (true) or a small menu preview. */
  stage: boolean;
}

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export const easeOut = (k: number): number => 1 - (1 - clamp01(k)) ** 2;
export const easeIn = (k: number): number => clamp01(k) ** 2;
export const rnd = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export const FIRE = [0xfff4c0, 0xffd060, 0xff8030, 0xd83a1a, 0x7a1a10];
const INK = '#140c18';

/** A filled pixel ellipse, row by row. */
export function blob(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string): void {
  if (rx < 1 || ry < 1) return;
  g.fillStyle = color;
  for (let i = -ry; i <= ry; i++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (i / (ry + 0.5)) ** 2)));
    if (w > 0) g.fillRect(Math.round(cx - w), Math.round(cy + i), w * 2, 1);
  }
}

/** A one-pixel line. */
export function line(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w = 1): void {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), w, w);
}

// --- Paths shared with the choreography ------------------------------------------------------

export const METEOR_HIT = 0.95;
/** The meteor's path (k 0..1): from high behind the fighter down onto their spot, speeding up. */
export function meteorAt(e: EntSpot, k: number): [number, number] {
  const kk = k ** 2.2;
  return [e.x - e.facing * 6.5 * (1 - kk), 10 * (1 - kk) + 0.3];
}

/** The whirlwind's x: in from far behind, slowing over the spot. */
export function twisterX(e: EntSpot, t: number): number {
  return e.x - e.facing * 4.4 * (1 - easeOut(t / 0.8));
}

/** The rift opens just behind the hero's spot. */
export const riftX = (e: EntSpot): number => e.x - e.facing * 0.9;

/** The bomb's roll (smoke): in from behind with a couple of hops; [x, y] world. */
export function bombAt(e: EntSpot, t: number): [number, number] {
  const k = clamp01(t / 0.55);
  const x = e.x - e.facing * 2.6 * (1 - easeOut(k));
  const hop = Math.abs(Math.sin(k * Math.PI * 2.5)) * 0.5 * (1 - k);
  return [x, 0.16 + hop];
}

// --- Under the fighter -----------------------------------------------------------------------

/** A spreading pool of shadow with grasping tendrils, its rim lit violet. */
export function drawPool(g: CanvasRenderingContext2D, cx: number, gy: number, t: number): void {
  const grow = easeOut(t / 0.45), fade = t > 1.45 ? clamp01(1 - (t - 1.45) / 0.45) : 1;
  const rx = Math.round(26 * grow * (0.35 + 0.65 * fade)), ry = Math.max(1, Math.round(rx * 0.24));
  if (rx < 2) return;
  // Tendrils reaching up and curling, before the hero rises.
  if (t > 0.15 && t < 1.2) {
    const k = t < 0.5 ? (t - 0.15) / 0.35 : 1 - (t - 0.5) / 0.7;
    for (let i = 0; i < 7; i++) {
      const bx = cx + Math.round((rnd(i) - 0.5) * rx * 1.6);
      const h = Math.round((8 + rnd(i + 9) * 18) * clamp01(k));
      for (let y = 0; y < h; y++) {
        const u = y / Math.max(1, h);
        const x = bx + Math.round(Math.sin(u * 5 + t * 9 + i) * 3 * u);
        g.fillStyle = y > h - 3 ? '#9a50e0' : '#1a0a2a';
        g.fillRect(x, gy - y, Math.max(1, Math.round(2.5 * (1 - u))), 1);
      }
    }
  }
  for (let i = -ry; i <= ry; i++) {
    const w = Math.round(rx * Math.sqrt(1 - (i / (ry + 0.5)) ** 2) + Math.sin(i * 1.3 + t * 8) * 1.2);
    g.fillStyle = Math.abs(i) >= ry ? '#9a50e0' : '#0c0414';
    g.fillRect(cx - w, gy + i, w * 2, 1);
    g.fillStyle = (i + Math.floor(t * 12)) % 3 ? '#9a50e0' : '#e0b0ff';
    g.fillRect(cx - w, gy + i, 1, 1);
    g.fillRect(cx + w - 1, gy + i, 1, 1);
  }
  // Swirl inside the pool.
  g.fillStyle = '#5a2a90';
  for (let i = 0; i < 10; i++) {
    const a = i * 0.63 + t * 4;
    const r = (0.2 + (i % 5) * 0.16) * rx;
    g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(gy + Math.sin(a) * r * 0.24), 2, 1);
  }
}

/** A golden beam from the top of the view down to the ground, with clouds parting at its head. */
export function drawBeam(g: CanvasRenderingContext2D, cx: number, gy: number, t: number, stage: boolean): void {
  const k = t < 0.3 ? easeOut(t / 0.3) : t > 1.6 ? clamp01(1 - (t - 1.6) / 0.6) : 1;
  if (k <= 0) return;
  const w = Math.round(15 * (0.4 + 0.6 * k) + Math.sin(t * 14) * 1);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = '#ffc040';
  g.globalAlpha = 0.14 * k;
  g.fillRect(cx - w - 6, 0, (w + 6) * 2, gy);
  g.fillStyle = '#ffe890';
  g.globalAlpha = 0.22 * k;
  g.fillRect(cx - w, 0, w * 2, gy);
  g.fillStyle = '#fffbe8';
  g.globalAlpha = 0.32 * k;
  g.fillRect(cx - (w >> 2), 0, (w >> 2) * 2 + 1, gy);
  // Motes of light drifting down the shaft.
  g.globalAlpha = 0.8 * k;
  for (let i = 0; i < 12; i++) {
    const y = ((rnd(i) * gy + t * 40 * (0.6 + rnd(i + 3))) % gy);
    g.fillRect(Math.round(cx + (rnd(i + 7) - 0.5) * w * 1.8), Math.round(y), 1, 1);
  }
  g.globalAlpha = 0.4 * k;
  g.fillStyle = '#ffe890';
  g.fillRect(cx - w - 10, gy - 1, (w + 10) * 2, 2);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  if (!stage) return;
  // Clouds rolling apart at the top.
  const open = easeOut(t / 0.5) * (t > 1.6 ? clamp01(1 - (t - 1.6) / 0.6) : 1);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = cx + s * (w + 8 + i * 14 + open * 30), y = 8 + (i % 2) * 6;
      g.globalAlpha = 0.85 * open;
      blob(g, x, y, 12 - i, 6, '#e8e0f0');
      blob(g, x, y + 3, 10 - i, 3, '#b8a8c8');
      g.fillStyle = '#ffe890';
      g.fillRect(Math.round(x - s * (10 - i)), y - 2, 2, 5);
    }
  }
  g.globalAlpha = 1;
}

/** A ring of flame tongues licking up around the spot, burning down after the eruption. */
export function drawFireRing(g: CanvasRenderingContext2D, cx: number, gy: number, t: number, from: number, to: number): void {
  if (t < from || t > to) return;
  const k = (t - from) / (to - from);
  const grow = easeOut(k * 4), die = 1 - easeIn(k);
  const rx = 10 + 20 * grow, ry = rx * 0.25;
  const n = 18, f = Math.floor(t * 20);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(gy + Math.sin(a) * ry);
    const h = Math.round((4 + rnd(i + f) * 7) * die);
    for (let j = 0; j < h; j++) {
      g.fillStyle = css(FIRE[Math.min(4, Math.floor((j / Math.max(1, h)) * 3 + (1 - die) * 2))]);
      g.fillRect(x + (j > h * 0.6 ? ((i + f) & 1) : 0), y - j, 2, 1);
    }
  }
}

/** Frost creeping out over the ground in crystal fronds. */
export function drawFrostFloor(g: CanvasRenderingContext2D, cx: number, gy: number, t: number): void {
  const grow = easeOut(t / 0.4), fade = t > 1.5 ? clamp01(1 - (t - 1.5) / 0.4) : 1;
  if (grow <= 0 || fade <= 0) return;
  const R = 30 * grow;
  g.globalAlpha = fade;
  blob(g, cx, gy, Math.round(R * 0.9), Math.max(1, Math.round(R * 0.2)), '#a8dcf0');
  blob(g, cx, gy, Math.round(R * 0.6), Math.max(1, Math.round(R * 0.13)), '#e0f8ff');
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const L = R * (0.7 + rnd(i) * 0.5);
    const x1 = cx + Math.cos(a) * L, y1 = gy + Math.sin(a) * L * 0.22;
    line(g, cx + Math.cos(a) * L * 0.4, gy + Math.sin(a) * L * 0.09, x1, y1);
    // A little fork at the tip.
    g.fillRect(Math.round(x1 + Math.cos(a + 0.8) * 2), Math.round(y1), 1, 1);
    g.fillRect(Math.round(x1 + Math.cos(a - 0.8) * 2), Math.round(y1), 1, 1);
  }
  g.globalAlpha = 1;
}

/** A heap of gold growing at the feet, sinking away after the statue breaks. */
export function drawCoinPile(g: CanvasRenderingContext2D, cx: number, gy: number, t: number): void {
  const grow = clamp01(t / 1.0), fade = t > 1.35 ? clamp01(1 - (t - 1.35) / 0.5) : 1;
  const h = Math.round(8 * grow * fade), w = Math.round(24 * grow * (0.5 + 0.5 * fade));
  if (h < 1 || w < 2) return;
  for (let i = 0; i < h; i++) {
    const ww = Math.round(w * (1 - i / (h + 1)));
    g.fillStyle = i === h - 1 ? '#fff0a0' : i % 2 ? '#e0a830' : '#ffd040';
    g.fillRect(cx - ww, gy - i, ww * 2, 1);
    g.fillStyle = '#a06818';
    g.fillRect(cx - ww, gy - i, 1, 1);
  }
  g.fillStyle = '#fffbe8';
  for (let i = 0; i < 6; i++) if ((Math.floor(t * 9) + i) % 3 === 0) g.fillRect(cx - w + 3 + i * Math.max(1, Math.round(w / 3)), gy - 1 - (i % 3), 1, 1);
}

const PILLAR_TOP = 34;
/** The rock pillar's height (art px): bursts up, holds, sinks back after the jump; never past `cap`. */
export function pillarH(t: number, cap = PILLAR_TOP): number {
  const top = Math.min(PILLAR_TOP, cap);
  if (t < 0.55) return 0;
  if (t < 0.72) return top * easeOut((t - 0.55) / 0.17);
  if (t < 1.3) return top;
  return top * Math.max(0, 1 - (t - 1.3) / 0.45);
}

/** Cracks spreading out from the spot while the ground rumbles. */
export function drawQuakeCracks(g: CanvasRenderingContext2D, cx: number, gy: number, t: number): void {
  const k = clamp01(t / 0.55), fade = t > 1.7 ? clamp01(1 - (t - 1.7) / 0.4) : 1;
  if (k <= 0 || fade <= 0) return;
  g.globalAlpha = fade;
  for (let i = 0; i < 6; i++) {
    const s = i & 1 ? 1 : -1;
    let x = cx, y = gy;
    const L = (14 + rnd(i) * 22) * k;
    g.fillStyle = '#2a1c18';
    for (let j = 0; j < L; j++) {
      x += s;
      if (rnd(i * 31 + j) > 0.7) y += rnd(i + j) > 0.5 ? 1 : -1;
      y = Math.max(gy - 2, Math.min(gy + 3, y));
      g.fillRect(x, y, 1, 1);
    }
    // Glow of the deep earth in the widest cracks.
    if (t > 0.3) { g.fillStyle = '#ff9040'; g.fillRect(x - s * 3, y, 1, 1); }
  }
  g.globalAlpha = 1;
}

/** A rock column punched up out of the sand, lit on one side, with an ink edge and falling chips. */
export function drawPillar(g: CanvasRenderingContext2D, cx: number, gy: number, t: number, cap: number): void {
  const h = Math.round(pillarH(t, cap));
  if (h < 2) return;
  const w = 13;
  const crumble = t > 1.3 ? (t - 1.3) / 0.45 : 0;
  g.fillStyle = INK;
  g.fillRect(cx - w - 1, gy - h - 1, w * 2 + 2, h + 1);
  for (let y = 0; y < h; y++) {
    const jag = ((y * 7) % 5 === 0) ? 1 : 0;
    const bite = crumble > 0 && rnd(y * 3.3) < crumble * 0.6 ? 2 : 0;
    g.fillStyle = '#7a6a58';
    g.fillRect(cx - w + jag + bite, gy - y - 1, w * 2 - jag - bite * 2, 1);
    g.fillStyle = '#5a4a40';
    g.fillRect(cx + Math.round(w * 0.35), gy - y - 1, Math.round(w * 0.65) - bite, 1);
    g.fillStyle = '#a89878';
    g.fillRect(cx - w + jag + bite, gy - y - 1, 3, 1);
  }
  g.fillStyle = '#c8b898';
  g.fillRect(cx - w, gy - h, w * 2, 2);
  g.fillStyle = '#3a2e2a';
  for (let y = 8; y < h - 4; y += 11) { g.fillRect(cx - 4 + ((y * 3) % 7), gy - y, 3, 1); g.fillRect(cx - 2 + ((y * 3) % 7), gy - y - 1, 1, 1); }
  // Hot seams lit from below as it bursts up.
  if (t < 1.0) {
    g.fillStyle = '#ff9040';
    for (let y = 3; y < Math.min(h, 14); y += 4) g.fillRect(cx - w + 2 + ((y * 5) % 9), gy - y, 2, 1);
  }
}

/** An upright starry rift: first a crack of white light, then a dark void in a swirling violet and teal rim. */
export function drawRift(g: CanvasRenderingContext2D, cx: number, gy: number, t: number): void {
  const cy = gy - 38;
  if (t < 0.3) {
    // The air cracks: a jagged white line drawing down.
    const k = easeOut(t / 0.3);
    g.fillStyle = '#ffffff';
    let x = cx;
    const n = Math.round(72 * k);
    for (let i = 0; i < n; i++) {
      if (i % 6 === 0) x = cx + Math.round((rnd(i) - 0.5) * 6);
      g.fillRect(x, cy - 36 + i, 1, 1);
      g.fillStyle = i % 2 ? '#e0d0ff' : '#ffffff';
    }
    return;
  }
  const u = t - 0.3;
  const k = u < 0.35 ? easeOut(u / 0.35) : t > 1.35 ? clamp01(1 - (t - 1.35) / 0.18) : 1;
  if (k <= 0.02) return;
  const rx = Math.max(1, Math.round(15 * k * (t > 1.35 ? k : 1) + Math.sin(t * 9) * 1)), ry = Math.round(38 * Math.max(k, 0.3));
  for (let i = -ry; i <= ry; i++) {
    const w = Math.round(rx * Math.sqrt(1 - (i / (ry + 0.5)) ** 2) * (1 + 0.15 * Math.sin(i * 0.5 + t * 7)));
    g.fillStyle = Math.abs(i) > ry * 0.8 ? '#1a0e30' : '#06030f';
    g.fillRect(cx - w, cy + i, w * 2, 1);
  }
  // A galaxy turning deep inside.
  for (let i = 0; i < 16; i++) {
    const a = i * 0.9 + t * 3, r = (i / 16) * rx * 0.85;
    g.fillStyle = i % 4 ? '#8a70e0' : '#ffffff';
    g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * (ry / Math.max(1, rx)) * 0.5), 1, 1);
  }
  const n = 56;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t * 5;
    const wob = 1 + Math.sin(a * 5 + t * 11) * 1.2;
    g.fillStyle = i % 3 === 0 ? '#40e0d0' : i % 2 ? '#9a70ff' : '#f0e8ff';
    g.fillRect(Math.round(cx + Math.cos(a) * (rx + wob)), Math.round(cy + Math.sin(a) * (ry + wob)), 2, 2);
  }
  // Wisps sucked toward the rim.
  g.fillStyle = '#c8b0ff';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.4;
    const d = (1 - ((t * 1.8 + rnd(i)) % 1)) * 16 + 2;
    g.fillRect(Math.round(cx + Math.cos(a) * (rx + d)), Math.round(cy + Math.sin(a) * (ry + d * 0.6)), 1, 1);
  }
}

/** The constellation: a figure of stars joined by faint lines (x as the hero faces, metres, y up). */
const STAR_PTS: [number, number][] = [
  [0, 1.9], [0, 1.55], [-0.32, 1.42], [0.32, 1.42], [-0.5, 0.95], [0.55, 1.75], [0.8, 2.3], [0, 0.95], [-0.22, 0.48], [0.24, 0.48], [-0.3, 0.02], [0.32, 0.02],
];
const STAR_LINES: [number, number][] = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 5], [5, 6], [1, 7], [7, 8], [7, 9], [8, 10], [9, 11]];
export const STAR_COUNT = STAR_PTS.length;
/** A constellation star's world position. */
export const starAt = (e: EntSpot, i: number): [number, number] => [e.x + STAR_PTS[i][0] * e.facing, STAR_PTS[i][1]];

export const STARBORN_FLARE = 1.45;

export function drawStars(g: CanvasRenderingContext2D, v: View, e: EntSpot, t: number, layer: 'under' | 'over'): void {
  const night = t < 0.3 ? t / 0.3 : t > 1.6 ? clamp01(1 - (t - 1.6) / 0.5) : 1;
  if (layer === 'under') {
    if (night <= 0) return;
    // The sky dims around the fight while the stars are out (only on the battle stage:
    // menu previews are see-through, where a dimmed sky would show as a dark box).
    if (e.stage) {
      g.globalAlpha = 0.55 * night;
      g.fillStyle = '#05030f';
      g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    }
    // A field of stars pricking out, and a shooting star or two.
    const W = g.canvas.width, H = e.stage ? Math.round(v.sy(0)) - 20 : g.canvas.height;
    const n = e.stage ? 60 : 16;
    for (let i = 0; i < n; i++) {
      const on = clamp01((t - rnd(i) * 0.5) / 0.15) * night;
      if (on <= 0) continue;
      const tw = (Math.floor(t * 8 + i) % 5) === 0;
      g.globalAlpha = on * (tw ? 1 : 0.6);
      g.fillStyle = i % 4 ? '#c8d8ff' : '#ffffff';
      g.fillRect(Math.round(rnd(i + 0.5) * W), Math.round(rnd(i + 2.5) * H * 0.85), 1, 1);
    }
    for (let s = 0; s < 2; s++) {
      const k = (t - 0.35 - s * 0.45) / 0.3;
      if (k < 0 || k > 1) continue;
      const x0 = W * (0.2 + s * 0.5), y0 = H * 0.1;
      g.fillStyle = '#ffffff';
      for (let j = 0; j < 10; j++) {
        g.globalAlpha = night * (1 - j / 10) * (1 - k);
        g.fillRect(Math.round(x0 + k * 50 - j * 2), Math.round(y0 + k * 20 - j * 0.8), 1, 1);
      }
    }
    g.globalAlpha = 1;
    return;
  }
  if (t > STARBORN_FLARE + 0.1) return;
  const pt = (i: number): [number, number] => {
    const [x, y] = starAt(e, i);
    return [Math.round(v.sx(x)), Math.round(v.sy(y))];
  };
  const fade = t > STARBORN_FLARE - 0.1 ? clamp01(1 - (t - (STARBORN_FLARE - 0.1)) / 0.2) : 1;
  // Lines draw in one after another, then brighten just before the flare.
  const hot = clamp01((t - 1.15) / 0.25);
  g.fillStyle = hot > 0.5 ? '#e8f0ff' : '#8ab0ff';
  STAR_LINES.forEach(([a, b], i) => {
    const k = clamp01((t - 0.55 - i * 0.05) / 0.12);
    if (k <= 0) return;
    const [x0, y0] = pt(a), [x1, y1] = pt(b);
    const len = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
    const n = Math.round(len * k);
    g.globalAlpha = (0.6 + 0.4 * hot) * fade;
    for (let j = 0; j <= n; j += hot > 0.5 ? 1 : 2) g.fillRect(Math.round(x0 + ((x1 - x0) * j) / len), Math.round(y0 + ((y1 - y0) * j) / len), 1, 1);
  });
  STAR_PTS.forEach((_, i) => {
    const k = clamp01((t - 0.3 - i * 0.03) / 0.1);
    if (k <= 0) return;
    const [x, y] = pt(i);
    const tw = (Math.floor(t * 10) + i) % 4 === 0;
    g.globalAlpha = fade;
    g.fillStyle = '#ffffff';
    g.fillRect(x, y, 1, 1);
    g.fillStyle = '#c8e0ff';
    g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); g.fillRect(x, y + 1, 1, 1);
    if (tw || k < 1 || hot > 0) { g.fillRect(x - 2, y, 1, 1); g.fillRect(x + 2, y, 1, 1); g.fillRect(x, y - 2, 1, 1); g.fillRect(x, y + 2, 1, 1); }
  });
  g.globalAlpha = 1;
}

/** The phoenix: a firebird diving in, then two burning wings spread from the hero's back, beat once and burn away. */
export const PHX_DIVE = 0.55, PHX_BEAT = 1.45;
export function drawPhoenix(g: CanvasRenderingContext2D, v: View, e: EntSpot, t: number, layer: 'under' | 'over'): void {
  const cx = Math.round(v.sx(e.x)), gy = Math.round(v.sy(0));
  if (t < PHX_DIVE) {
    if (layer !== 'over') return;
    // The firebird dives in from high behind: a burning arrowhead with a long tail.
    const k = easeIn(t / PHX_DIVE);
    const bx = e.x - e.facing * 5 * (1 - k), by = 7 * (1 - k) + 1.2;
    const x = Math.round(v.sx(bx)), y = Math.round(v.sy(by));
    const f = e.facing, flap = Math.floor(t * 18) & 1;
    for (let i = 0; i < 16; i++) {
      g.fillStyle = css(FIRE[Math.min(4, Math.floor(i / 4))]);
      g.globalAlpha = 1 - i / 18;
      g.fillRect(Math.round(x - f * i * 2), Math.round(y - i * 1.4 + Math.sin(i + t * 30) * 1), 3 - (i >> 3), 2);
    }
    g.globalAlpha = 1;
    for (const s of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        g.fillStyle = css(FIRE[Math.min(4, (i >> 1))]);
        g.fillRect(Math.round(x - f * i), Math.round(y + s * (i + (flap ? 2 : -1)) * 0.9 - (flap ? 0 : 2)), 2, 1);
      }
    }
    blob(g, x, y, 3, 2, '#fff4c0');
    return;
  }
  if (layer !== 'under') return;
  const OPEN = PHX_DIVE, END = PHX_BEAT + 0.45;
  if (t > END) return;
  const open = easeOut((t - OPEN) / 0.35);
  const fade = t > PHX_BEAT ? clamp01(1 - (t - PHX_BEAT) / (END - PHX_BEAT)) : 1;
  const span = 50 * open * (t > PHX_BEAT ? 1 + (t - PHX_BEAT) * 0.8 : 1);
  // Wings rise and breathe, then sweep down hard on the beat.
  const ang = t < PHX_BEAT - 0.15 ? 0.6 + 0.18 * Math.sin(t * 10) : t < PHX_BEAT ? 0.78 - ((t - (PHX_BEAT - 0.15)) / 0.15) * 1.05 : -0.27;
  const y0 = gy - 36;
  for (const s of [-1, 1]) {
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      const bend = Math.sin(u * Math.PI) * 7;
      const x = cx + s * span * u * Math.cos(ang), y = y0 - span * u * Math.sin(ang) - bend;
      const L = Math.round((1 - u * 0.5) * 24 * open);
      for (let j = 0; j < L; j++) {
        const q = j / Math.max(1, L);
        g.globalAlpha = fade * (1 - q * 0.6);
        g.fillStyle = css(FIRE[Math.min(4, Math.floor(q * 3 + u * 1.5 + ((j + i + Math.floor(t * 20)) % 3 === 0 ? 1 : 0)))]);
        g.fillRect(Math.round(x + s * j * 0.3), Math.round(y + j), 2, 1);
      }
      // Feather tips flicking off.
      if (i % 3 === 0 && fade > 0.3) {
        g.fillStyle = '#fff4c0';
        g.fillRect(Math.round(x + s * 2), Math.round(y - 1 - ((Math.floor(t * 12) + i) & 1)), 1, 1);
      }
    }
  }
  // A bright body of flame behind the hero, a tail fanning below and the head crest above.
  g.globalAlpha = 0.85 * fade;
  for (let y = 0; y < 50; y += 2) {
    const w = Math.max(1, Math.round(8 * Math.sin((y / 50) * Math.PI) + Math.sin(y + t * 30)));
    g.fillStyle = css(FIRE[Math.min(4, 1 + Math.floor((y / 50) * 3))]);
    g.fillRect(cx - w, gy - 6 - y, w * 2, 2);
  }
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.35;
    g.fillStyle = css(FIRE[1 + (i & 1)]);
    line(g, cx, gy - 10, cx + Math.cos(a) * 14 * open, gy - 10 - Math.sin(a) * 8 * open);
  }
  g.globalAlpha = 1;
}

// --- Over the fighter ------------------------------------------------------------------------

/** A roaring column of fire that bursts up from the ground and burns down to reveal the hero. */
export function drawFireColumn(g: CanvasRenderingContext2D, cx: number, gy: number, t: number, from: number, to: number): void {
  if (t < from || t > to) return;
  const k = (t - from) / (to - from);
  const h = Math.round(130 * Math.min(1, k * 7) * (1 - k * 0.45));
  const w = Math.round(17 * (1 - k * 0.8) * Math.min(1, k * 10));
  const frame = Math.floor(t * 24);
  for (let y = 0; y < h; y += 2) {
    const u = y / Math.max(1, h);
    const ww = Math.max(1, Math.round(w * (1 - u * 0.5) + Math.sin(y * 0.35 + frame) * 2.5));
    // Hot white core low down, cooling to red at the top and edges.
    const band = Math.min(FIRE.length - 1, Math.floor(u * 3 + k * 2));
    g.fillStyle = css(FIRE[Math.min(FIRE.length - 1, band + 2)]);
    g.fillRect(cx - ww - 2, gy - y - 2, ww * 2 + 4, 2);
    g.fillStyle = css(FIRE[Math.min(FIRE.length - 1, band + 1)]);
    g.fillRect(cx - ww, gy - y - 2, ww * 2, 2);
    g.fillStyle = css(FIRE[band]);
    g.fillRect(cx - (ww >> 1), gy - y - 2, ww, 2);
    // Tongues breaking off the sides.
    if ((y + frame * 3) % 14 === 0) {
      g.fillStyle = css(FIRE[Math.min(4, band + 1)]);
      g.fillRect(cx + (((y >> 1) + frame) & 1 ? ww + 2 : -ww - 5), gy - y - 4, 3, 3);
    }
  }
}

/** The meteor: a tumbling rock wrapped in fire, its blaze streaming back along the fall. */
export function drawMeteor(g: CanvasRenderingContext2D, x: number, y: number, t: number, facing: number, size: number): void {
  const fl = Math.floor(t * 30) & 1;
  const R = Math.round(7 * size), r = Math.round(5 * size);
  // The tail: a cone of flame streaming up and back.
  for (let i = 1; i <= 12; i++) {
    const rr = Math.max(1, Math.round((R + 1) * (1 - i / 14)));
    const px = x - facing * i * 3.2, py = y - i * 5;
    g.globalAlpha = (1 - i / 13) * 0.9;
    blob(g, px + Math.sin(i * 2 + t * 40) * 1.5, py, rr, rr, css(FIRE[Math.min(4, 1 + (i >> 2))]));
  }
  g.globalAlpha = 1;
  blob(g, x, y, R + 2, R + 2, css(FIRE[2]));
  blob(g, x, y, R, R, css(mix(0xffd060, 0xff6020, fl ? 0.3 : 0.6)));
  // The rock, turning: a dark core with a lit rim and glowing cracks.
  blob(g, x, y, r, r, '#2a1c1c');
  blob(g, x - 1, y - 1, r - 2, r - 2, '#4a3430');
  const a = t * 9;
  g.fillStyle = '#ffd060';
  for (let i = 0; i < 3; i++) {
    const aa = a + i * 2.1;
    line(g, x + Math.cos(aa) * 1, y + Math.sin(aa) * 1, x + Math.cos(aa) * (r - 1), y + Math.sin(aa) * (r - 1));
  }
  g.fillStyle = fl ? '#fff4c0' : '#ffe080';
  g.fillRect(x + facing * 2 - 1, y + 1, 2, 2);
}

/** A dusty tornado with leaves and stones whirling in it, fading as it leaves. */
export function drawTwister(g: CanvasRenderingContext2D, cx: number, gy: number, t: number): void {
  const k = t < 0.15 ? t / 0.15 : t > 0.95 ? clamp01(1 - (t - 0.95) / 0.3) : 1;
  if (k <= 0) return;
  const H = Math.round(92 * (0.55 + 0.45 * k));
  for (let y = 0; y < H; y += 2) {
    const u = y / H;
    const w = (4 + u * 26) * (0.5 + 0.5 * k);
    const sway = Math.sin(u * 4 + t * 9) * 5 * u;
    const x0 = cx + sway;
    g.globalAlpha = 0.2 * k;
    g.fillStyle = '#c8c0a8';
    g.fillRect(Math.round(x0 - w), gy - y - 1, Math.round(w * 2), 2);
    for (let b = 0; b < 3; b++) {
      const ph = t * 20 + y * 0.32 + b * 2.1;
      const px = Math.round(x0 + Math.cos(ph) * w);
      const front = Math.sin(ph) > 0;
      g.globalAlpha = (front ? 0.9 : 0.4) * k;
      g.fillStyle = front ? '#f0e8d0' : '#8a8070';
      g.fillRect(px - 2, gy - y - 1, front ? 5 : 3, 2);
    }
  }
  // Debris: leaves and pebbles orbiting the funnel.
  for (let i = 0; i < 12; i++) {
    const u = 0.15 + (i / 12) * 0.8, y = gy - u * H;
    const w = (4 + u * 26) * (0.5 + 0.5 * k) + 4;
    const ph = t * (14 + (i % 3) * 3) + i * 1.7;
    const front = Math.sin(ph) > 0;
    g.globalAlpha = k;
    g.fillStyle = i % 3 === 0 ? '#6a5a48' : front ? '#9ac860' : '#4a7a30';
    g.fillRect(Math.round(cx + Math.sin(u * 4 + t * 9) * 5 * u + Math.cos(ph) * w), Math.round(y), 2, i % 3 === 0 ? 2 : 1);
  }
  // A skirt of dust where it touches down.
  g.globalAlpha = 0.6 * k;
  blob(g, cx, gy - 1, Math.round(16 * k), 3, '#c8b898');
  g.globalAlpha = 1;
}

/** The smoke bomb: a black ball with a sizzling fuse, rolling in. */
export function drawBomb(g: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  blob(g, x, y, 4, 4, INK);
  blob(g, x - 1, y - 1, 2, 2, '#3a3448');
  g.fillStyle = '#8a8098';
  g.fillRect(x - 2, y - 3, 1, 1);
  g.fillStyle = '#6a5040';
  g.fillRect(x + 2, y - 5, 1, 2);
  const s = Math.floor(t * 30) & 1;
  g.fillStyle = s ? '#fff4c0' : '#ffb040';
  g.fillRect(x + 2 + s, y - 7, 2, 2);
  g.fillStyle = '#ff8030';
  g.fillRect(x + 4 - s * 2, y - 8 - s, 1, 1);
}

/** The cloud: big billowing puffs that swell, roll and thin out, parting from the middle. */
export function drawSmokeCloud(g: CanvasRenderingContext2D, cx: number, gy: number, t: number, from: number): void {
  const u = t - from;
  if (u < 0 || u > 1.3) return;
  const grow = easeOut(u / 0.25), thin = clamp01((u - 0.45) / 0.85);
  const part = easeIn(clamp01((u - 0.4) / 0.6));
  for (let i = 0; i < 14; i++) {
    const s = i & 1 ? 1 : -1;
    const bx = (rnd(i) - 0.5) * 34 + s * part * (16 + rnd(i + 4) * 14);
    const by = -6 - rnd(i + 2) * 52 - u * 8 * rnd(i + 6);
    const r = (7 + rnd(i + 3) * 8) * grow * (1 + thin * 0.4);
    g.globalAlpha = 0.92 * (1 - thin);
    blob(g, cx + bx, gy + by, Math.round(r), Math.round(r * 0.85), '#6a6280');
    blob(g, cx + bx - 1, gy + by - 2, Math.round(r * 0.8), Math.round(r * 0.6), '#a8a0b8');
    blob(g, cx + bx - 2, gy + by - 3, Math.round(r * 0.45), Math.round(r * 0.35), '#d0c8e0');
  }
  g.globalAlpha = 1;
}

/** Storm clouds rolling in above the spot, lit from inside. */
export function drawStormCloud(g: CanvasRenderingContext2D, cx: number, top: number, t: number, hit: number): void {
  const k = easeOut(t / 0.35) * (t > hit + 0.7 ? clamp01(1 - (t - hit - 0.7) / 0.5) : 1);
  if (k <= 0) return;
  const lit = t > hit - 0.25 && t < hit + 0.1 && (Math.floor(t * 30) & 1) === 0;
  for (let i = 0; i < 9; i++) {
    const x = cx + (i - 4) * 9 * (0.6 + 0.4 * k) + Math.sin(t * 2 + i) * 2;
    const y = top + (i % 2) * 3;
    g.globalAlpha = 0.95 * k;
    blob(g, x, y, 9, 5, '#1a1a2e');
    blob(g, x - 1, y - 2, 6, 3, lit || (i === 4 && t > hit - 0.4) ? '#9ad8ff' : '#3a3a58');
  }
  g.globalAlpha = 1;
}

/** Little arcs of electricity crawling over the body after the strike. */
export function drawCrackle(g: CanvasRenderingContext2D, cx: number, gy: number, t: number, from: number, to: number): void {
  if (t < from || t > to) return;
  const f = Math.floor(t * 24);
  for (let i = 0; i < 3; i++) {
    if (rnd(f + i * 7) < 0.35) continue;
    let x = cx + Math.round((rnd(f + i) - 0.5) * 22), y = gy - 6 - Math.round(rnd(f * 3 + i) * 50);
    g.fillStyle = i ? '#9ad8ff' : '#ffffff';
    for (let j = 0; j < 7; j++) {
      x += rnd(f + j + i) > 0.5 ? 1 : -1;
      y += rnd(f * 2 + j) > 0.5 ? 1 : -1;
      g.fillRect(x, y, 1, 1);
    }
  }
}

/** The frozen shell around the hero: a block of ice, cracks racing over it before it shatters. */
export function drawIceShell(g: CanvasRenderingContext2D, cx: number, gy: number, t: number, from: number, brk: number): void {
  if (t < from || t > brk) return;
  const grow = easeOut((t - from) / 0.25);
  const H = Math.round(68 * grow), W = 17;
  g.globalAlpha = 0.5;
  for (let y = 0; y < H; y++) {
    const w = W - (y > H - 6 ? Math.round((y - (H - 6)) * 1.5) : 0);
    g.fillStyle = y % 7 === 0 ? '#e8fbff' : '#9ad8f0';
    g.fillRect(cx - w, gy - y - 1, w * 2, 1);
  }
  g.globalAlpha = 0.9;
  g.fillStyle = '#ffffff';
  g.fillRect(cx - W, gy - H, 1, H);
  g.fillRect(cx - W + 4, gy - H + 4, 1, Math.max(0, H - 20));
  g.fillStyle = '#6ab8e0';
  g.fillRect(cx + W - 1, gy - H, 1, H);
  g.fillRect(cx - W + 6, gy - H, W * 2 - 12, 1);
  // Cracks spreading in the last moments.
  const c = clamp01((t - (brk - 0.4)) / 0.4);
  if (c > 0) {
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) {
      let x = cx + Math.round((rnd(i) - 0.5) * 10), y = gy - 20 - Math.round(rnd(i + 3) * 30);
      const n = Math.round(14 * c);
      for (let j = 0; j < n; j++) {
        x += rnd(i * 13 + j) > 0.5 ? 1 : -1;
        y += rnd(i * 7 + j) > 0.4 ? 1 : -1;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  g.globalAlpha = 1;
}

/** Bats: fly in from all round, whirl in a dark knot, then burst away. */
export function drawBats(g: CanvasRenderingContext2D, v: View, e: EntSpot, t: number): void {
  if (t > 1.9) return;
  const N = e.stage ? 34 : 24;
  const IN = 0.65, OUT = 1.15;
  for (let i = 0; i < N; i++) {
    const a0 = i * 2.39996 + 0.3;
    const far = 4 + (i % 5) * 0.7;
    const orb = 0.35 + (i % 4) * 0.2;
    const spin = (i & 1 ? 1 : -1) * (5 + (i % 3));
    const big = i % 5 === 0;
    let x: number, y: number;
    const ang = a0 + t * spin;
    if (t < IN) {
      const k = easeOut(t / IN - (i % 4) * 0.05);
      const r = far + (orb - far) * k;
      x = Math.cos(ang) * r; y = 1.1 + Math.sin(ang) * r * 0.55 + (1 - k) * 1.5;
    } else if (t < OUT) {
      x = Math.cos(ang) * orb; y = 1.1 + Math.sin(ang) * orb * 1.4;
    } else {
      const k = (t - OUT) / 0.75;
      const r = orb + k * k * 10;
      x = Math.cos(a0) * r; y = 1.1 + Math.abs(Math.sin(a0)) * r * 0.8 + k * 2;
    }
    const px = Math.round(v.sx(e.x + x)), py = Math.round(v.sy(y));
    const up = (Math.floor(t * 22 + i) & 1) === 0;
    g.fillStyle = '#1a0a20';
    g.fillRect(px - 1, py, 3, 2);
    const s = big ? 2 : 1;
    if (up) { g.fillRect(px - 2 - s, py - 1, 1 + s, 1); g.fillRect(px + 2, py - 1, 1 + s, 1); g.fillRect(px - 3 - s, py - 2, 1, 1); g.fillRect(px + 3 + s, py - 2, 1, 1); }
    else { g.fillRect(px - 2 - s, py + 1, 1 + s, 1); g.fillRect(px + 2, py + 1, 1 + s, 1); g.fillRect(px - 3 - s, py + 2, 1, 1); g.fillRect(px + 3 + s, py + 2, 1, 1); }
    if (i % 3 === 0) { g.fillStyle = '#ff3050'; g.fillRect(px, py, 1, 1); if (big) g.fillRect(px + 1, py, 1, 1); }
  }
  // The knot reads as a dark cloud while it's tight.
  if (t > IN - 0.15 && t < OUT + 0.1) {
    const k = t < IN ? (t - (IN - 0.15)) / 0.15 : t > OUT ? 1 - (t - OUT) / 0.1 : 1;
    const cx = Math.round(v.sx(e.x)), cy = Math.round(v.sy(1.05));
    g.globalAlpha = 0.7 * clamp01(k);
    g.fillStyle = '#1a0a20';
    for (let i = -17; i <= 17; i++) {
      const w = Math.round(14 * Math.sqrt(1 - (i / 18) ** 2) + Math.sin(i * 1.7 + t * 30) * 2);
      g.fillRect(cx - w, cy + i * 2, w * 2, 2);
    }
    // Eyes glinting in the dark.
    g.globalAlpha = clamp01(k);
    g.fillStyle = '#ff3050';
    for (let i = 0; i < 6; i++) if ((Math.floor(t * 6) + i) % 3) g.fillRect(cx + Math.round((rnd(i) - 0.5) * 22), cy + Math.round((rnd(i + 5) - 0.5) * 50), 2, 1);
    g.globalAlpha = 1;
  }
}

/** The slot sign above the statue: three reels spinning and locking in, then JACKPOT. */
export function drawReels(g: CanvasRenderingContext2D, cx: number, top: number, t: number): void {
  const END = 1.45;
  if (t < 0.05 || t > END) return;
  const fade = t > END - 0.25 ? clamp01((END - t) / 0.25) : 1;
  const drop = easeOut((t - 0.05) / 0.15);
  const y = Math.round(top - 14 * (1 - drop));
  g.globalAlpha = fade;
  g.fillStyle = INK;
  g.fillRect(cx - 20, y - 1, 40, 13);
  g.fillStyle = '#c88a20';
  g.fillRect(cx - 19, y, 38, 11);
  g.fillStyle = '#ffd040';
  g.fillRect(cx - 19, y, 38, 1);
  const LOCK = [0.35, 0.5, 0.65];
  for (let i = 0; i < 3; i++) {
    const x = cx - 15 + i * 11;
    g.fillStyle = '#fff8e0';
    g.fillRect(x - 1, y + 2, 9, 7);
    if (t < LOCK[i]) {
      // Spinning: symbols streaking past.
      g.fillStyle = (Math.floor(t * 30) + i) & 1 ? '#c83a3a' : '#3a6ac8';
      const o = Math.floor(t * 60 + i * 3) % 7;
      g.fillRect(x + 1, y + 2 + o, 5, 1);
      g.fillRect(x + 2, y + 2 + ((o + 4) % 7), 3, 1);
    } else {
      const pop = t < LOCK[i] + 0.08 ? 1 : 0;
      drawText(g, '7', x + 3, y + 3 - pop, { color: '#e02828', ink: '#5a0a0a' });
    }
  }
  // All three in: the sign blinks.
  if (t > 0.7 && (Math.floor(t * 10) & 1)) {
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) { g.fillRect(cx - 21 + i * 8, y - 2, 2, 1); g.fillRect(cx - 18 + i * 8, y + 12, 2, 1); }
  }
  g.globalAlpha = 1;
}

/** Cuts across the air that open a beat late, then fade (in the hero's facing). */
export function drawSlashes(g: CanvasRenderingContext2D, cx: number, gy: number, t: number, cut: number): void {
  if (t < cut || t > cut + 0.45) return;
  const k = (t - cut) / 0.45;
  const len = Math.round(80 * Math.min(1, k * 6));
  const cuts: [number, number, number][] = [[-1, -50, 0.38], [1, -28, -0.3], [1, -40, 0.05]];
  cuts.forEach(([d, oy, slope], n) => {
    const kk = clamp01(k * 6 - n * 0.6);
    const L = Math.round(len * kk);
    for (let i = -L; i <= L; i++) {
      const x = cx + i, y = Math.round(gy + oy + i * slope * d);
      g.globalAlpha = (1 - k) * (1 - Math.abs(i) / (L + 1));
      g.fillStyle = '#9ad8ff';
      g.fillRect(x, y - 1, 1, 3);
      g.fillStyle = '#ffffff';
      g.fillRect(x, y, 1, 1);
    }
  });
  g.globalAlpha = 1;
}

/** Heat shimmer lines over the ground (inferno, meteor): short wavy dashes rising. */
export function drawHeat(g: CanvasRenderingContext2D, cx: number, gy: number, t: number, k: number): void {
  if (k <= 0) return;
  g.fillStyle = '#ffd060';
  for (let i = 0; i < 8; i++) {
    const u = (t * 0.9 + rnd(i)) % 1;
    g.globalAlpha = k * (1 - u) * 0.6;
    const x = cx + Math.round((rnd(i + 3) - 0.5) * 40 + Math.sin(u * 9 + i) * 2), y = gy - 4 - Math.round(u * 40);
    g.fillRect(x, y, 2, 1);
    g.fillRect(x + 2, y - 1, 2, 1);
  }
  g.globalAlpha = 1;
}

/** Room above the head for things drawn on top of the hero (art px), for small previews. */
export const HERO_PX = 2.0 * PPM;
