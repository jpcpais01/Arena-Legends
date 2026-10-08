/**
 * Colour helpers for pixel art: packed RGBA, hue-shifted shading ramps and
 * a few mixes. Colours are packed as 0xAABBGGRR so they can be written
 * straight into a Uint32Array view of ImageData (little-endian).
 */

export type RGB = [number, number, number];

export const rgbOf = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

export const hexOf = ([r, g, b]: RGB): number =>
  (Math.round(clamp255(r)) << 16) | (Math.round(clamp255(g)) << 8) | Math.round(clamp255(b));

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Packs a 0xRRGGBB colour with alpha into ImageData's little-endian Uint32 layout. */
export const pack = (hex: number, a = 255): number =>
  ((a << 24) | ((hex & 255) << 16) | (hex & 0xff00) | ((hex >> 16) & 255)) >>> 0;

export const unpackHex = (c: number): number => ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255);

export const css = (hex: number, a = 1): string => {
  const [r, g, b] = rgbOf(hex);
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};

export function mix(a: number, b: number, t: number): number {
  const x = rgbOf(a), y = rgbOf(b);
  return hexOf([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

// -----------------------------------------------------------------------------
// HSL
// -----------------------------------------------------------------------------

export function toHsl(hex: number): [number, number, number] {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255) as RGB;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function fromHsl(h: number, s: number, l: number): number {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return hexOf([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

/** Moves hue `h` toward `target` by up to `amount` degrees along the short way. */
function hueToward(h: number, target: number, amount: number): number {
  let d = ((target - h + 540) % 360) - 180;
  if (Math.abs(d) < amount) return target;
  return h + Math.sign(d) * amount;
}

export interface RampOptions {
  /** How far shadows drift toward blue/purple (degrees). */
  coolShift?: number;
  /** How far lights drift toward yellow (degrees). */
  warmShift?: number;
  /** Lightness step between tones. */
  step?: number;
}

/**
 * A five-tone shading ramp around a base colour, the way pixel artists build
 * them: shadows get darker, more saturated and cooler (hue toward blue),
 * lights get brighter, a little less saturated and warmer (hue toward yellow).
 *
 * Index: 0 deep shadow, 1 shadow, 2 base, 3 light, 4 highlight.
 */
export function ramp(base: number, o: RampOptions = {}): number[] {
  const [h, s, l] = toHsl(base);
  const cool = o.coolShift ?? 14;
  const warm = o.warmShift ?? 10;
  const step = o.step ?? 0.13;
  const grey = s < 0.08;
  const shadowHue = grey ? h : hueToward(h, 245, cool);
  const deepHue = grey ? h : hueToward(h, 250, cool * 1.8);
  const lightHue = grey ? h : hueToward(h, 55, warm);
  const hiHue = grey ? h : hueToward(h, 55, warm * 1.6);
  const tint = grey ? 0 : 0.04;
  return [
    fromHsl(deepHue, Math.min(1, s * 1.05 + tint * 2), Math.max(0.06, l - step * 2.1)),
    fromHsl(shadowHue, Math.min(1, s * 1.08 + tint), Math.max(0.1, l - step)),
    base,
    fromHsl(lightHue, s * 0.94, Math.min(0.93, l + step * 0.85)),
    fromHsl(hiHue, s * 0.8, Math.min(0.97, l + step * 1.75)),
  ];
}

/** Dark outline colour that still carries a hint of the colour it borders. */
export function inkFor(hex: number, ink = 0x1a1220, keep = 0.28): number {
  const [h, s] = toHsl(hex);
  const tinted = fromHsl(h, Math.min(1, s), 0.16);
  return mix(ink, tinted, keep);
}
