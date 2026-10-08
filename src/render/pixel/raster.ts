import { inkFor, pack, ramp as makeRamp } from './color';
import type { Shape } from './sdf';

/**
 * Pixel-art rasterizer. Shapes are filled without anti-aliasing and shaded
 * with a few tones from a hue-shifted ramp (lit from the upper front), then
 * the sprite gets a coloured ink outline around its silhouette and thin
 * contour lines where a front part overlaps a part behind it. The result
 * reads as hand-placed pixels, but any pose or angle can be drawn.
 */

export interface Material {
  /** Five tones: deep shadow, shadow, base, light, highlight (0xRRGGBB). */
  ramp: number[];
  /** Highest tone the lighting may reach (4 only for shiny materials). */
  maxTone: number;
  /** Lowest tone (cloth in shadow rarely needs the deepest). */
  minTone: number;
  /** Outline colour against the background. */
  ink: number;
  /** Self-lit: always drawn at `glowTone`, no outline. */
  glow: boolean;
  glowTone: number;
  /** Surface texture: tone offset at a point (see tex.ts). */
  tex?: Tex;
}

/**
 * A surface pattern: tone offset (usually -1, 0 or +1) at a point in the
 * shape's own space. `phase` is the animation frame, so patterns can flow.
 */
export type Tex = (x: number, y: number, phase: number) => number;

/** Maps raster pixels back into a part's own space (weapon-local textures). */
export interface LocalSpace {
  ix(x: number, y: number): number;
  iy(x: number, y: number): number;
}

export interface MaterialSpec {
  base: number;
  shiny?: boolean;
  glow?: boolean;
  minTone?: number;
  ramp?: number[];
  ink?: number;
  /** Lightness step of the ramp (contrast). */
  step?: number;
  tex?: Tex;
}

export function material(spec: MaterialSpec): Material {
  const r = spec.ramp ?? makeRamp(spec.base, { step: spec.step });
  return {
    ramp: r,
    maxTone: spec.shiny ? 4 : 3,
    minTone: spec.minTone ?? 0,
    ink: spec.ink ?? inkFor(r[0]),
    glow: !!spec.glow,
    glowTone: 3,
    tex: spec.tex,
  };
}

export interface FillOptions {
  /** Outline group: contour lines are drawn where different groups overlap. */
  group?: number;
  /** Pixels over which the surface curves away at the silhouette (bigger = rounder). */
  bevel?: number;
  /** Added to the tone after lighting (−1 for limbs on the far side). */
  toneBias?: number;
  /** Added to the light term before quantizing. */
  lightBias?: number;
  /** Single tone, no lighting. */
  flat?: number;
  /** Never draw a contour line on the parts behind this one. */
  noLine?: boolean;
  /** Ignore the light's horizontal component (cloth hanging, faces). */
  softLight?: boolean;
  /** Space textures are laid out in (raster space when omitted). */
  local?: LocalSpace;
}

export interface Frame {
  w: number;
  h: number;
  /** Position of the sprite origin (feet) inside the cropped frame. */
  ox: number;
  oy: number;
  /** Packed RGBA (ImageData little-endian layout). */
  data: Uint32Array;
}

// Light from the upper front (the side the sprite faces), toward the viewer.
const LX = 0.42, LY = -0.72, LZ = 0.55;
const LN = Math.sqrt(LX * LX + LY * LY + LZ * LZ);
const lx = LX / LN, ly = LY / LN, lz = LZ / LN;

const FLAG_GLOW = 1, FLAG_NOLINE = 2, FLAG_LINE = 4;

export class Raster {
  readonly w: number;
  readonly h: number;
  /** Material index + 1 per pixel (0 = empty). */
  readonly mat: Uint16Array;
  readonly tone: Uint8Array;
  readonly group: Uint8Array;
  readonly order: Uint16Array;
  readonly flags: Uint8Array;
  readonly materials: Material[] = [];
  /** Animation frame being drawn (flowing textures). */
  phase = 0;
  /** Default space for textures when a fill doesn't name one (null = raster space). */
  space: LocalSpace | null = null;
  private nextOrder = 1;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.mat = new Uint16Array(n);
    this.tone = new Uint8Array(n);
    this.group = new Uint8Array(n);
    this.order = new Uint16Array(n);
    this.flags = new Uint8Array(n);
  }

  clear(): void {
    this.mat.fill(0);
    this.tone.fill(0);
    this.group.fill(0);
    this.order.fill(0);
    this.flags.fill(0);
    this.materials.length = 0;
    this.nextOrder = 1;
    this.space = null;
  }

  /** Registers a material for this frame and returns its handle. */
  add(m: Material): number {
    this.materials.push(m);
    return this.materials.length;
  }

  /** Fills a shape with a material, shading it as a rounded volume. */
  fill(shape: Shape, m: number, o: FillOptions = {}): void {
    const { w, h } = this;
    const mt = this.materials[m - 1];
    const x0 = Math.max(0, Math.floor(shape.box.x0) - 1), y0 = Math.max(0, Math.floor(shape.box.y0) - 1);
    const x1 = Math.min(w - 1, Math.ceil(shape.box.x1) + 1), y1 = Math.min(h - 1, Math.ceil(shape.box.y1) + 1);
    if (x0 > x1 || y0 > y1) return;
    const sdf = shape.sdf;
    const bevel = o.bevel ?? 3;
    const bias = o.toneBias ?? 0;
    const lightBias = o.lightBias ?? 0;
    const group = o.group ?? 1;
    const ord = this.nextOrder++;
    const flag = (mt.glow ? FLAG_GLOW : 0) | (o.noLine ? FLAG_NOLINE : 0);
    const tex = mt.tex, loc = o.local ?? this.space, phase = this.phase;
    const e = 0.5;
    for (let y = y0; y <= y1; y++) {
      const cy = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const cx = x + 0.5;
        const d = sdf(cx, cy);
        if (d >= 0) continue;
        let tone: number;
        if (mt.glow) tone = mt.glowTone;
        else if (o.flat !== undefined) tone = o.flat;
        else {
          const gx = sdf(cx + e, cy) - sdf(cx - e, cy);
          const gy = sdf(cx, cy + e) - sdf(cx, cy - e);
          const gl = Math.sqrt(gx * gx + gy * gy) || 1;
          let s = 1 + d / bevel;
          s = s < 0 ? 0 : s > 1 ? 1 : s;
          const nx = (gx / gl) * s, ny = (gy / gl) * s, nz = Math.sqrt(1 - s * s);
          let lam = (o.softLight ? 0 : nx * lx) + ny * ly + nz * lz + lightBias;
          if (o.softLight) lam += 0.08;
          tone = lam > 0.86 ? 4 : lam > 0.6 ? 3 : lam > 0.24 ? 2 : lam > -0.12 ? 1 : 0;
        }
        tone += bias;
        if (tone > mt.maxTone && !mt.glow) tone = mt.maxTone;
        if (tone < mt.minTone) tone = mt.minTone;
        // Textures may reach past the lighting's range (glints, glowing veins).
        if (tex) tone += loc ? tex(loc.ix(cx, cy), loc.iy(cx, cy), phase) : tex(cx, cy, phase);
        if (tone < 0) tone = 0;
        if (tone > 4) tone = 4;
        const i = y * w + x;
        this.mat[i] = m;
        this.tone[i] = tone;
        this.group[i] = group;
        this.order[i] = ord;
        this.flags[i] = flag;
      }
    }
  }

  /** Writes one pixel (eyes, mouths, rivets, glints). */
  dot(x: number, y: number, m: number, tone: number, group?: number): void {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    const mt = this.materials[m - 1];
    this.mat[i] = m;
    this.tone[i] = Math.max(0, Math.min(4, tone));
    if (group !== undefined || !this.group[i]) this.group[i] = group ?? 1;
    if (!this.order[i]) this.order[i] = this.nextOrder++;
    this.flags[i] = mt.glow ? FLAG_GLOW : FLAG_NOLINE;
  }

  /** One-pixel line without doubled corners (bowstrings, cracks, trims). */
  line(xa: number, ya: number, xb: number, yb: number, m: number, tone: number, group?: number): void {
    let x0 = Math.floor(xa), y0 = Math.floor(ya);
    const x1 = Math.floor(xb), y1 = Math.floor(yb);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 512; guard++) {
      this.dot(x0, y0, m, tone, group);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Material handle at a pixel (0 = empty). */
  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.mat[y * this.w + x];
  }

  /**
   * Contour lines: a pixel of a part sitting behind a different, frontier
   * part gets darkened, so overlapping limbs and gear read clearly.
   */
  private contours(): void {
    const { w, h, mat, order, group, flags } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mat[i] || flags[i] & FLAG_GLOW) continue;
        const o = order[i], g = group[i];
        let line = false;
        if (x > 0) line ||= this.frontOf(i - 1, o, g);
        if (!line && x < w - 1) line ||= this.frontOf(i + 1, o, g);
        if (!line && y > 0) line ||= this.frontOf(i - w, o, g);
        if (!line && y < h - 1) line ||= this.frontOf(i + w, o, g);
        if (line) flags[i] |= FLAG_LINE;
      }
    }
  }

  private frontOf(j: number, o: number, g: number): boolean {
    return this.mat[j] !== 0 && this.order[j] > o && this.group[j] !== g && !(this.flags[j] & (FLAG_NOLINE | FLAG_GLOW));
  }

  /**
   * Composes the final sprite: tones to colours, contour lines and the
   * silhouette outline, cropped to its bounds. (ox, oy) is the origin.
   */
  compose(ox: number, oy: number, outline = true): Frame {
    const { w, h, mat, tone, flags, order } = this;
    this.contours();
    const px = new Uint32Array(w * h);
    let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
    for (let i = 0; i < w * h; i++) {
      const m = mat[i];
      if (!m) continue;
      const mt = this.materials[m - 1];
      let t = tone[i];
      if (flags[i] & FLAG_LINE) t = Math.max(0, Math.min(t - 2, 0));
      px[i] = pack(flags[i] & FLAG_LINE ? mixLine(mt) : mt.ramp[t]);
      const x = i % w, y = (i / w) | 0;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    if (bx1 < 0) return { w: 1, h: 1, ox: 0, oy: 0, data: new Uint32Array(1) };
    if (outline) {
      bx0 = Math.max(0, bx0 - 1); by0 = Math.max(0, by0 - 1);
      bx1 = Math.min(w - 1, bx1 + 1); by1 = Math.min(h - 1, by1 + 1);
      for (let y = by0; y <= by1; y++) {
        for (let x = bx0; x <= bx1; x++) {
          const i = y * w + x;
          if (mat[i]) continue;
          let best = -1, bo = -1;
          const test = (j: number) => {
            if (mat[j] && !(flags[j] & FLAG_GLOW) && order[j] > bo) { bo = order[j]; best = j; }
          };
          if (x > 0) test(i - 1);
          if (x < w - 1) test(i + 1);
          if (y > 0) test(i - w);
          if (y < h - 1) test(i + w);
          if (best >= 0) px[i] = pack(this.materials[mat[best] - 1].ink);
        }
      }
    }
    const cw = bx1 - bx0 + 1, ch = by1 - by0 + 1;
    const data = new Uint32Array(cw * ch);
    for (let y = 0; y < ch; y++) data.set(px.subarray((y + by0) * w + bx0, (y + by0) * w + bx0 + cw), y * cw);
    return { w: cw, h: ch, ox: ox - bx0, oy: oy - by0, data };
  }
}

/** Contour line colour: the material's deepest tone pulled toward its ink. */
function mixLine(mt: Material): number {
  const a = mt.ramp[0], b = mt.ink;
  const r = (((a >> 16) & 255) + ((b >> 16) & 255)) >> 1;
  const g = (((a >> 8) & 255) + ((b >> 8) & 255)) >> 1;
  const bl = ((a & 255) + (b & 255)) >> 1;
  return (r << 16) | (g << 8) | bl;
}
