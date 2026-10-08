import { ARENA_HALF_WIDTH } from '../sim/constants';
import { css, mix } from './pixel/color';
import type { Pix } from './pixel/paint';
import { buildArena, floorRow, type ArenaArt, type Layer, type Theme } from './arenaArt';
import { PPM } from './sprite/animator';

interface LayerImg { img: HTMLCanvasElement; factor: number; y: number; drift: number; after?: Layer['after'] }
interface FloaterImg { img: HTMLCanvasElement; x: number; y: number; factor: number; front: boolean; phase: number }

function canvasOf(p: Pix): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = p.w; c.height = p.h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data.buffer as ArrayBuffer), p.w, p.h), 0, 0);
  return c;
}

/** Three-frame flicker for torches and braziers. */
function flameFrames(fire: number, big: boolean): HTMLCanvasElement[] {
  const hot = mix(fire, 0xffffe0, 0.65), mid = fire, deep = mix(fire, 0xc02010, 0.55);
  const shapes = big
    ? [[0, 3, 5, 7, 7, 5, 3], [0, 2, 4, 6, 7, 6, 4], [0, 3, 6, 7, 6, 4, 2]]
    : [[0, 2, 3, 3, 2], [0, 1, 3, 3, 2], [0, 2, 3, 2, 1]];
  return shapes.map((rowsW, f) => {
    const h = rowsW.length * 2 + 2, w = 9 + (big ? 6 : 0);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    const cx = Math.floor(w / 2);
    // Width grows toward the base; a tip that wobbles per frame.
    for (let i = 0; i < rowsW.length; i++) {
      const hw = rowsW[i], y = i * 2 + 1;
      const sway = i < 2 ? (f - 1) : 0;
      g.fillStyle = css(deep); g.fillRect(cx - hw + sway, y, hw * 2 + 1, 2);
      if (hw > 1) { g.fillStyle = css(mid); g.fillRect(cx - hw + 1 + sway, y, hw * 2 - 1, 2); }
      if (hw > 2 && i > 1) { g.fillStyle = css(hot); g.fillRect(cx - hw + 2 + sway, y + 1, hw * 2 - 3, 1); }
    }
    return c;
  });
}

/**
 * The arena backdrop at runtime: parallax layers, crowd that bobs (more when
 * excited), flickering torches, and a perspective floor drawn row by row.
 */
export class ArenaView {
  readonly art: ArenaArt;
  private layers: LayerImg[];
  private front: LayerImg[];
  private crowd: HTMLCanvasElement[];
  private floor: HTMLCanvasElement;
  private pillar: HTMLCanvasElement;
  private crystal: HTMLCanvasElement | null;
  private rays: HTMLCanvasElement[];
  private floaters: FloaterImg[];
  private amb: { petals: string[]; wings: string[]; sparkle: string; bird: string } | null;
  private torch: HTMLCanvasElement[];
  private brazier: HTMLCanvasElement[];
  private excite = 0;
  private crowdT = 0;
  private crowdFrame = 0;

  constructor(readonly theme: Theme, readonly W: number, readonly H: number, readonly gy: number, travel: number) {
    this.art = buildArena(theme, W, H, gy, travel);
    const img = (l: Layer): LayerImg => ({ img: canvasOf(l.pix), factor: l.factor, y: l.y, drift: l.drift ?? 0, after: l.after });
    this.layers = this.art.layers.map(img);
    this.front = this.art.front.map(img);
    this.crystal = this.art.crystal && canvasOf(this.art.crystal);
    this.rays = (this.art.rays ?? []).map(canvasOf);
    this.floaters = this.art.floaters.map((f) => ({ ...f, img: canvasOf(f.pix) }));
    const a = this.art.ambience;
    this.amb = a && { petals: a.petals.map((c) => css(c)), wings: a.butterflies.map((c) => css(c)), sparkle: css(a.sparkle), bird: css(a.bird) };
    this.crowd = this.art.crowd.map(canvasOf);
    this.floor = canvasOf(this.art.floor);
    this.pillar = canvasOf(this.art.pillar);
    this.torch = flameFrames(theme.fire, false);
    this.brazier = flameFrames(theme.fire, true);
  }

  /** Crowd reaction (0..1). */
  cheer(amount: number): void {
    this.excite = Math.min(1, Math.max(this.excite, amount));
  }

  update(dt: number): void {
    this.excite = Math.max(0, this.excite - dt * 0.5);
    this.crowdT += dt * (1.5 + this.excite * 9);
    if (this.crowdT >= 1) { this.crowdT -= 1; this.crowdFrame ^= 1; }
  }

  /** Everything behind the fighters. `cam` is the camera centre in art px; `t` real time. */
  draw(g: CanvasRenderingContext2D, cam: number, t: number): void {
    const W = this.W;
    const off = (img: HTMLCanvasElement, f: number) => Math.round(-(img.width - W) / 2 - cam * f);
    const layer = (l: LayerImg) => {
      const x = off(l.img, l.factor);
      if (!l.drift) { g.drawImage(l.img, x, l.y); return; }
      // Drifting layers tile: two copies cover the screen at any offset.
      const dx = x + Math.round((t * l.drift) % l.img.width);
      g.drawImage(l.img, dx, l.y);
      g.drawImage(l.img, dx - l.img.width, l.y);
    };
    for (const l of this.layers) {
      layer(l);
      if (l.after === 'birds' && this.amb) this.drawBirds(g, cam, t);
      else if (l.after === 'floaters') this.drawFloaters(g, cam, t, false);
    }
    const wf = this.art.wallFactor;
    const cx = off(this.crowd[0], wf);
    g.drawImage(this.crowd[this.crowdFrame], cx, 0);
    const fi = Math.floor(t * 9);
    for (const [x, y] of this.art.torches) {
      const fr = this.torch[(fi + x) % 3];
      g.drawImage(fr, cx + x - (fr.width >> 1), y - fr.height + 2);
    }
    // Floor rows, nearest-neighbour, each with its own scale.
    const fw = this.floor.width;
    const floorEnd = Math.min(this.H, this.art.floorEnd);
    for (let y = this.art.floorTop; y < floorEnd; y++) {
      const { s, v } = floorRow(this.art, y);
      const srcW = W / s;
      const sx = fw / 2 + cam - srcW / 2;
      g.drawImage(this.floor, sx, v, srcW, 1, 0, y, W, 1);
    }
    // Sun shafts slowly trading places.
    for (let k = 0; k < this.rays.length; k++) {
      g.globalAlpha = 0.55 + 0.45 * Math.sin(t * 0.45 + k * Math.PI);
      g.drawImage(this.rays[k], 0, 0);
    }
    g.globalAlpha = 1;
    for (const l of this.front) layer(l);
    if (this.floaters.length) this.drawFloaters(g, cam, t, true);
    if (this.amb) this.drawAmbience(g, cam, t);
    // Pillars with braziers at the arena bounds.
    for (const side of [-1, 1]) {
      const x = Math.round(W / 2 + side * (ARENA_HALF_WIDTH + 0.75) * PPM - cam - this.pillar.width / 2);
      if (x > W || x + this.pillar.width < 0) continue;
      g.drawImage(this.pillar, x, this.gy - this.pillar.height + 2);
      if (this.crystal) {
        const bob = Math.round(Math.sin(t * 1.8 + side) * 2);
        g.drawImage(this.crystal, x + ((this.pillar.width - this.crystal.width) >> 1), this.gy - this.pillar.height - this.crystal.height + bob);
        continue;
      }
      const fr = this.brazier[(fi + (side > 0 ? 1 : 0)) % 3];
      g.drawImage(fr, x + (this.pillar.width >> 1) - (fr.width >> 1), this.gy - this.pillar.height + 2 - fr.height + 3);
    }
  }

  private drawFloaters(g: CanvasRenderingContext2D, cam: number, t: number, front: boolean): void {
    for (const f of this.floaters) {
      if (f.front !== front) continue;
      const x = Math.round(f.x - cam * f.factor - f.img.width / 2);
      if (x > this.W || x + f.img.width < 0) continue;
      g.drawImage(f.img, x, Math.round(f.y + Math.sin(t * 0.7 + f.phase) * 3));
    }
  }

  /** Distant birds gliding across, flapping now and then. */
  private drawBirds(g: CanvasRenderingContext2D, cam: number, t: number): void {
    const span = this.W + 60;
    g.fillStyle = this.amb!.bird;
    for (let i = 0; i < 4; i++) {
      const x = Math.round(((((i * 173 + t * (7 + i * 2) - cam * 0.25) % span) + span) % span) - 30);
      const y = Math.round(this.gy - 150 + i * 23 + Math.sin(t * 0.5 + i * 2) * 6);
      const up = Math.sin(t * 7 + i * 3) > 0 && Math.sin(t * 0.8 + i) > -0.3;
      g.fillRect(x - 1, y, 3, 1);
      g.fillRect(x - 2, y + (up ? -1 : 1), 1, 1);
      g.fillRect(x + 2, y + (up ? -1 : 1), 1, 1);
    }
  }

  /** Petals on the wind, twinkling pollen and a few butterflies, all behind the fighters. */
  private drawAmbience(g: CanvasRenderingContext2D, cam: number, t: number): void {
    const a = this.amb!;
    const W = this.W, spanX = W + 40, spanY = this.gy + 30;
    const wrap = (v: number, span: number) => (((v % span) + span) % span) - 20;
    for (let i = 0; i < 24; i++) {
      const y = ((i * 53.7 + t * (7 + ((i * 7) % 11))) % spanY) - 16;
      const x = wrap(i * 97.3 + t * (9 + (i % 4) * 4) - cam * (0.6 + (i % 3) * 0.2), spanX) + Math.sin(t * (0.9 + (i % 5) * 0.21) + i) * 7;
      const spin = Math.sin(t * (3 + (i % 3)) + i * 1.7);
      g.fillStyle = a.petals[i % a.petals.length];
      g.fillRect(Math.round(x), Math.round(y), spin > 0.3 ? 2 : 1, spin < -0.3 ? 2 : 1);
    }
    g.fillStyle = a.sparkle;
    for (let i = 0; i < 22; i++) {
      const tw = Math.sin(t * (1.3 + (i % 4) * 0.4) + i * 2.1);
      if (tw < 0.1) continue;
      const x = Math.round(wrap(i * 61.7 + Math.sin(t * 0.3 + i) * 18 - cam * 0.8, spanX));
      const y = Math.round(this.gy - 8 - ((i * 37.3 + t * (2 + (i % 3))) % (this.gy * 0.7)));
      g.fillRect(x, y, 1, 1);
      if (tw > 0.85) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
    }
    for (let i = 0; i < a.wings.length; i++) {
      const x = Math.round(wrap(i * 191 + t * (5 + i) + Math.sin(t * 0.6 + i * 2) * 40 - cam * 0.85, spanX));
      const y = Math.round(this.gy - 26 - i * 9 + Math.sin(t * 1.1 + i) * 10 + Math.sin(t * 5.3 + i) * 1.5);
      const open = Math.sin(t * 16 + i * 5) > 0;
      g.fillStyle = a.wings[i];
      if (open) { g.fillRect(x - 2, y - 1, 2, 2); g.fillRect(x + 1, y - 1, 2, 2); }
      else { g.fillRect(x - 1, y - 2, 1, 2); g.fillRect(x + 1, y - 2, 1, 2); }
      g.fillStyle = '#2a2030';
      g.fillRect(x, y - 1, 1, 2);
    }
  }
}
