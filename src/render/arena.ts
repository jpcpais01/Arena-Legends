import { ARENA_HALF_WIDTH } from '../sim/constants';
import { css, mix } from './pixel/color';
import type { Pix } from './pixel/paint';
import { buildArena, floorRow, type ArenaArt, type Theme } from './arenaArt';
import { PPM } from './sprite/animator';

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
  private layers: { img: HTMLCanvasElement; factor: number; y: number }[];
  private crowd: HTMLCanvasElement[];
  private floor: HTMLCanvasElement;
  private pillar: HTMLCanvasElement;
  private torch: HTMLCanvasElement[];
  private brazier: HTMLCanvasElement[];
  private excite = 0;
  private crowdT = 0;
  private crowdFrame = 0;

  constructor(readonly theme: Theme, readonly W: number, readonly H: number, readonly gy: number, travel: number) {
    this.art = buildArena(theme, W, gy, travel);
    this.layers = this.art.layers.map((l) => ({ img: canvasOf(l.pix), factor: l.factor, y: l.y }));
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
    for (const l of this.layers) g.drawImage(l.img, off(l.img, l.factor), l.y);
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
    for (let y = this.art.floorTop; y < this.H; y++) {
      const { s, v } = floorRow(this.art, y);
      const srcW = W / s;
      const sx = fw / 2 + cam - srcW / 2;
      g.drawImage(this.floor, sx, v, srcW, 1, 0, y, W, 1);
    }
    // Pillars with braziers at the arena bounds.
    for (const side of [-1, 1]) {
      const x = Math.round(W / 2 + side * (ARENA_HALF_WIDTH + 0.75) * PPM - cam - this.pillar.width / 2);
      if (x > W || x + this.pillar.width < 0) continue;
      g.drawImage(this.pillar, x, this.gy - this.pillar.height + 2);
      const fr = this.brazier[(fi + (side > 0 ? 1 : 0)) % 3];
      g.drawImage(fr, x + (this.pillar.width >> 1) - (fr.width >> 1), this.gy - this.pillar.height + 2 - fr.height + 3);
    }
  }
}
