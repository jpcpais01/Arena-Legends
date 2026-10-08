import type { CharacterBuild } from '../sim/loadout';
import { clipLength, clipsFor } from '../render/sprite/anims';
import type { AnimOut } from '../render/sprite/animator';
import { SpriteBank, type Sprite } from '../render/sprite/bank';
import { makeArt } from '../render/sprite/look';
import { css } from '../render/pixel/color';
import { fitPixels } from './pixelfit';

export interface PreviewOptions {
  flip?: boolean;
  /** Plays a random move every few seconds. */
  autoplay?: boolean;
  /** Draws one idle frame and stops (portraits on cards). */
  still?: boolean;
  /** Feet height above the canvas bottom, in art pixels; negative crops to a bust. */
  ground?: number;
  /** A small stone pedestal under the feet. */
  pedestal?: boolean;
  /** Box the canvas is fitted into at a whole device-pixel scale. */
  fit?: HTMLElement;
}

// Still portraits are rasterized a couple per frame so opening a screen full of them doesn't hitch.
const stills: Preview[] = [];
let stillRaf = 0;
function queueStill(p: Preview): void {
  stills.push(p);
  if (stillRaf) return;
  const run = () => {
    const t0 = performance.now();
    while (stills.length && performance.now() - t0 < 8) stills.shift()!.drawStill();
    stillRaf = stills.length ? requestAnimationFrame(run) : 0;
  };
  stillRaf = requestAnimationFrame(run);
}

const SHOWCASE_SKIP = new Set(['idle', 'run', 'back', 'hurt', 'stun', 'air', 'ko', 'roll', 'leap', 'evade', 'blink', 'sec.riposte']);

/**
 * A character standing in a small pixel canvas (creator, menu, gear picker).
 * Idles, and plays one of its moves when tapped or when `showcase` is called.
 */
export class Preview {
  readonly el: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private bank!: SpriteBank;
  private clips: string[] = [];
  private playing: string | null = null;
  private t = 0;
  private last = 0;
  private raf = 0;
  private alive = true;
  private next = 0;
  private flip = false;
  private out: AnimOut = { clip: 'idle', frame: 0, face: null, secOut: false, jitter: 0, hop: 0, key: '' };
  /** Legendary weapon sparkles: position (canvas px) and age. */
  private sparks: { x: number; y: number; t: number }[] = [];
  private sparkT = 0;

  private still: boolean;
  private ground: number;
  private pedestal: boolean;
  private unfit: (() => void) | null = null;

  /** `w`, `h` in art pixels; the CSS size comes from the stylesheet or the `fit` box. */
  constructor(build: CharacterBuild, readonly w = 100, readonly h = 90, opts: PreviewOptions = {}) {
    this.el = document.createElement('canvas');
    this.el.className = 'preview';
    this.el.width = w; this.el.height = h;
    this.g = this.el.getContext('2d')!;
    this.flip = !!opts.flip;
    this.still = !!opts.still;
    this.ground = opts.ground ?? (opts.pedestal ? 12 : 8);
    this.pedestal = !!opts.pedestal;
    if (opts.fit) this.unfit = fitPixels(this.el, opts.fit);
    this.set(build);
    if (this.still) return;
    this.el.addEventListener('click', () => this.showcase());
    if (opts.autoplay) this.next = 2.5;
    const loop = (now: number) => {
      if (!this.alive) return;
      const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
      this.last = now;
      if (this.el.isConnected) this.tick(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  set(build: CharacterBuild): void {
    const art = makeArt(build);
    const set = clipsFor(art);
    this.bank = new SpriteBank(art, set);
    this.clips = [...set.clips.keys()].filter((k) => !SHOWCASE_SKIP.has(k));
    this.playing = null;
    this.t = 0;
    this.sparks.length = 0;
    if (this.still) queueStill(this);
  }

  /** Fits the canvas into `box` at a whole device-pixel scale (see `fitPixels`). */
  fitTo(box: HTMLElement): void {
    this.unfit?.();
    this.unfit = fitPixels(this.el, box);
  }

  /** Still portraits: the first idle frame. */
  drawStill(): void {
    if (!this.alive) return;
    this.out.clip = 'idle';
    this.out.frame = 0;
    this.out.key = 'idle.0.';
    this.draw(this.bank.get(this.out));
  }

  /** Plays a move (a given clip, or a random one). */
  showcase(clip?: string): void {
    this.playing = clip ?? this.clips[Math.floor(Math.random() * this.clips.length)] ?? null;
    this.t = 0;
  }

  dispose(): void {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.unfit?.();
  }

  private tick(dt: number): void {
    this.t += dt;
    const o = this.out;
    if (this.playing) {
      const c = this.bank.set.clips.get(this.playing)!;
      const n = clipLength(c);
      const i = Math.floor(this.t * 11);
      if (i >= n + 3) { this.playing = null; this.t = 0; }
      o.clip = this.playing ?? 'idle';
      o.frame = this.playing ? Math.min(n - 1, i) : 0;
    } else {
      o.clip = 'idle';
      o.frame = Math.floor(this.t * 3) % 4;
      if (this.next > 0 && this.t > this.next) { this.showcase(); this.next = 3 + Math.random() * 3; }
    }
    o.key = `${o.clip}.${o.frame}.`;
    const s = this.bank.get(o);
    const [gx, gy] = this.draw(s);
    this.drawSparks(dt, s.tip ? [gx + (this.flip ? -s.tip[0] : s.tip[0]), gy + s.tip[1]] : null);
  }

  private draw(s: Sprite): [number, number] {
    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    const gx = Math.round(this.w / 2), gy = this.h - this.ground;
    if (this.pedestal) drawPedestal(g, gx, gy);
    // Ground shadow.
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(gx - 11, gy - 1, 22, 3);
    if (this.flip) {
      g.save(); g.translate(gx + 1, 0); g.scale(-1, 1);
      g.drawImage(s.img, -s.ox, gy - s.oy);
      g.restore();
    } else g.drawImage(s.img, gx - s.ox, gy - s.oy);
    return [gx, gy];
  }

  /** A legendary weapon twinkles at its tip, like it does in battle. */
  private drawSparks(dt: number, tip: [number, number] | null): void {
    const fx = this.bank.art.mainSkin?.fx;
    if (!fx) { this.sparks.length = 0; return; }
    if (tip && (this.sparkT -= dt) <= 0) {
      this.sparkT = this.playing ? 0.05 : 0.16;
      this.sparks.push({ x: Math.round(tip[0] + (Math.random() - 0.5) * 4), y: Math.round(tip[1] + (Math.random() - 0.5) * 4), t: 0 });
    }
    const g = this.g;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.t += dt;
      if (p.t > 0.5) { this.sparks.splice(i, 1); continue; }
      const y = Math.round(p.y - p.t * 8);
      g.fillStyle = css(p.t < 0.25 ? fx.spark : fx.spark2);
      g.fillRect(p.x, y, 1, 1);
      if (p.t < 0.2) { g.fillRect(p.x - 1, y, 3, 1); g.fillRect(p.x, y - 1, 1, 3); }
    }
  }
}

/** A round stone dais, its top face centred on (x, y): a lit top with a gold inlay over a darker side. */
function drawPedestal(g: CanvasRenderingContext2D, x: number, y: number): void {
  const rx = 30, ry = 6, depth = 6;
  const half = (i: number) => Math.round(rx * Math.sqrt(Math.max(0, 1 - (i / (ry + 0.5)) ** 2)));
  // Side: the ellipse swept down, darker towards the bottom.
  for (let d = depth; d >= 1; d--) {
    g.fillStyle = d > depth - 2 ? '#1c1530' : '#2c2346';
    for (let i = 0; i <= ry; i++) g.fillRect(x - half(i), y + i + d, half(i) * 2, 1);
  }
  // Top face with a lit back rim.
  for (let i = -ry; i <= ry; i++) {
    g.fillStyle = i <= -ry + 1 ? '#8c7cb4' : i < 0 ? '#5f5186' : '#524577';
    g.fillRect(x - half(i), y + i, half(i) * 2, 1);
  }
  g.fillStyle = 'rgba(245,191,69,0.6)';
  for (let a = 0; a < 72; a++) {
    const t = (a / 72) * Math.PI * 2;
    g.fillRect(Math.round(x + Math.cos(t) * (rx - 6)), Math.round(y + Math.sin(t) * (ry - 2)), 1, 1);
  }
}
