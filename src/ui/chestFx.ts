import type { SkinRarity } from '../character/skins';

/**
 * The skin chest and everything around it, drawn on one low-res canvas
 * (one art pixel = `k` CSS pixels, blitted pixelated) so the light, rays and
 * sparks share the game's pixel grid. It only runs while the chest screen is
 * open, and redraws nothing when the chest is idle and off-screen.
 */

/** Tier light: [deep, bright]. Epic cycles the rainbow instead. */
export const TIER_LIGHT: Record<SkinRarity, [string, string]> = {
  rare: ['#2f7cff', '#bfe0ff'],
  mythic: ['#ff3a8a', '#ffc6e0'],
  legendary: ['#ff9a1a', '#fff0a0'],
  epic: ['#7ff0e0', '#ffffff'],
};
const RAINBOW = ['#ffd860', '#ff7ac8', '#b07aff', '#7ad8ff', '#7ff0e0'];

const INK = '#0a0612';
const W = 44; // chest width (art px)
const BODY_H = 22;
const LID_H = 16;

interface Part { x: number; y: number; vx: number; vy: number; t: number; life: number; col: string; s: number; g: number; star: boolean }
interface Ring { r: number; v: number; t: number; life: number; col: string }

/** Pixel art for the chest body and lid, drawn once with rects. */
function sprite(w: number, h: number, draw: (px: (x: number, y: number, ww: number, hh: number, c: string) => void) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw((x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); });
  return c;
}

const WOOD = ['#3a1e14', '#5e3320', '#7d4a2a', '#9c6436'];
const GOLD = ['#7a420e', '#b06c1e', '#f2b542', '#ffe58f'];

function bodyArt(): HTMLCanvasElement {
  return sprite(W, BODY_H, (px) => {
    px(0, 0, W, BODY_H, INK);
    px(1, 1, W - 2, BODY_H - 2, WOOD[2]);
    // Planks: a light top edge and a dark seam on each.
    for (const y of [1, 8, 15]) { px(1, y, W - 2, 1, WOOD[3]); if (y > 1) px(1, y - 1, W - 2, 1, WOOD[0]); }
    px(1, BODY_H - 3, W - 2, 2, WOOD[1]);
    // Gold rim along the top and the foot.
    px(1, 1, W - 2, 2, GOLD[2]); px(1, 1, W - 2, 1, GOLD[3]); px(1, 3, W - 2, 1, GOLD[0]);
    px(1, BODY_H - 3, W - 2, 2, GOLD[1]); px(1, BODY_H - 3, W - 2, 1, GOLD[2]);
    // Corner bands with rivets.
    for (const x of [1, W - 7]) {
      px(x, 1, 6, BODY_H - 2, GOLD[1]); px(x + 1, 1, 4, BODY_H - 2, GOLD[2]); px(x + 1, 1, 1, BODY_H - 2, GOLD[3]);
      for (const y of [6, 12]) { px(x + 2, y, 2, 2, GOLD[0]); px(x + 2, y, 1, 1, GOLD[3]); }
    }
    // Lock plate and keyhole.
    px(17, 2, 10, 11, INK);
    px(18, 3, 8, 9, GOLD[2]); px(18, 3, 8, 1, GOLD[3]); px(18, 11, 8, 1, GOLD[0]); px(25, 3, 1, 9, GOLD[1]);
    px(21, 5, 2, 2, INK); px(21, 7, 2, 3, INK); px(20, 8, 4, 1, INK);
  });
}

function lidArt(): HTMLCanvasElement {
  return sprite(W, LID_H, (px) => {
    // Domed top: the first rows step in.
    const inset = [5, 3, 2, 1, 1];
    for (let y = 0; y < LID_H; y++) {
      const i = inset[y] ?? 0;
      px(i, y, W - i * 2, 1, INK);
      if (y > 0 && y < LID_H - 1) {
        const j = Math.max(i, inset[y - 1] ?? 0, inset[y + 1] ?? 0) + (y < 5 ? 1 : 1);
        const shade = y < 3 ? WOOD[3] : y < 8 ? WOOD[2] : WOOD[1];
        px(j, y, W - j * 2, 1, shade);
      }
    }
    // Plank seams across the dome.
    px(4, 5, W - 8, 1, WOOD[1]); px(2, 9, W - 4, 1, WOOD[0]);
    // Gold bands over the dome, and the lid rim.
    for (const x of [6, W - 10]) { px(x, 1, 4, LID_H - 2, GOLD[1]); px(x + 1, 1, 2, LID_H - 2, GOLD[2]); px(x + 1, 1, 1, LID_H - 2, GOLD[3]); }
    px(1, LID_H - 4, W - 2, 3, GOLD[2]); px(1, LID_H - 4, W - 2, 1, GOLD[3]); px(1, LID_H - 2, W - 2, 1, GOLD[0]);
    // Hasp hanging over the lock.
    px(19, LID_H - 6, 6, 6, INK); px(20, LID_H - 5, 4, 4, GOLD[2]); px(20, LID_H - 5, 4, 1, GOLD[3]);
    // A socket for the jewel on top (lit live).
    px(19, 1, 6, 4, INK);
  });
}

export class ChestFx {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private body = bodyArt();
  private lid = lidArt();
  /** CSS px per art px; canvas size in art px. */
  k = 3;
  w = 0;
  h = 0;
  /** Chest anchor (bottom centre, art px) and where it currently is. */
  private home = { x: 0, y: 0 };
  private at = { x: 0, y: 0 };
  private center = false;
  private t = 0;

  /** Light leaking from the seams. */
  tier: SkinRarity | null = null;
  glow = 0;
  shake = 0;
  /** 0 = closed, rising as the lid flies off. */
  private lidT = -1;
  /** The chest fades away after the burst (cards take its place). */
  private gone = 0;
  private goneV = 0;
  rays = 0;
  rayTier: SkinRarity = 'rare';
  private flash = 0;
  private flashCol = '#ffffff';
  /** Darkens the screen behind the opening. */
  dim = 0;
  private dimTarget = 0;
  /** A pillar of light out of the chest before a big pull (0..1 wide). */
  private beam = 0;
  private beamTarget = 0;
  /** Epic: stars falling across the screen. */
  private starfall = 0;
  /** Sparkles circling a revealed card (art px), in its tier. */
  private halo: { x: number; y: number; r: number; tier: SkinRarity } | null = null;
  private haloT = 0;
  private parts: Part[] = [];
  private rings: Ring[] = [];
  private moteT = 0;
  private raf = 0;
  private last = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'chest-fx';
    this.g = this.canvas.getContext('2d')!;
  }

  /** Sizes the canvas to its box; the chest stands about 40% of the height. */
  resize(): void {
    const r = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.k = Math.max(2, Math.floor((r.height * 0.36) / (BODY_H + LID_H)));
    this.w = Math.ceil(r.width / this.k);
    this.h = Math.ceil(r.height / this.k);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.canvas.style.width = `${this.w * this.k}px`;
    this.canvas.style.height = `${this.h * this.k}px`;
  }

  /** Where the chest rests: bottom centre of an element's box. */
  anchor(el: HTMLElement): void {
    const c = this.canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!r.width) return;
    this.home = { x: Math.round((r.left + r.width / 2 - c.left) / this.k), y: Math.round((r.bottom - c.top) / this.k) - 4 };
    if (!this.at.x) this.at = { ...this.home };
  }

  /** Art-px point for a screen element's centre (bursts on cards). */
  pointOf(el: Element): { x: number; y: number } {
    const c = this.canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - c.left) / this.k, y: (r.top + r.height / 2 - c.top) / this.k };
  }

  /** The chest glides to the middle of the screen for the opening (or back home). */
  setCentered(on: boolean): void {
    this.center = on;
    this.dimTarget = on ? 0.62 : 0;
  }

  /** A fresh closed chest. */
  reset(): void {
    this.lidT = -1;
    this.gone = 0;
    this.goneV = 0;
    this.glow = 0;
    this.tier = null;
    this.shake = 0;
    this.rays = 0;
    this.beam = 0;
    this.beamTarget = 0;
    this.starfall = 0;
    this.halo = null;
    this.parts.length = 0;
    this.rings.length = 0;
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Chest top (where the light comes out), art px. */
  get mouth(): { x: number; y: number } {
    return { x: this.at.x, y: this.at.y - BODY_H };
  }

  color(tier: SkinRarity, bright = false, i = 0): string {
    if (tier === 'epic') return RAINBOW[(i + Math.floor(this.t * 6)) % RAINBOW.length];
    return TIER_LIGHT[tier][bright ? 1 : 0];
  }

  /** A tier step during the charge: light, a ring and sparks from the seam. */
  pulse(tier: SkinRarity): void {
    this.tier = tier;
    this.flashOnce(this.color(tier, true), 0.28);
    const m = this.mouth;
    this.rings.push({ r: 6, v: 90, t: 0, life: 0.5, col: this.color(tier, true) });
    for (let i = 0; i < 24; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 40 + Math.random() * 70;
      this.spark(m.x + (Math.random() - 0.5) * W, m.y, Math.cos(a) * v, Math.sin(a) * v, this.color(tier, i % 2 === 0, i), 0.5 + Math.random() * 0.4, 90, i % 5 === 0);
    }
  }

  /** The lid blows off: flash, shockwaves, a fountain of sparks, then rays. */
  burst(tier: SkinRarity): void {
    this.lidT = 0;
    this.rayTier = tier;
    this.tier = tier;
    this.shake = 0;
    this.goneV = 1.6;
    this.flashOnce('#ffffff', 1);
    const m = this.mouth;
    const big = tier === 'epic' ? 2 : tier === 'legendary' ? 1.5 : 1;
    for (let i = 0; i < 3; i++) this.rings.push({ r: 4, v: 120 + i * 60, t: -i * 0.08, life: 0.7, col: this.color(tier, i === 0, i) });
    for (let i = 0; i < 90 * big; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 30 + Math.random() * 150 * big;
      this.spark(m.x, m.y, Math.cos(a) * v, Math.sin(a) * v - 40, this.color(tier, Math.random() < 0.5, i), 0.6 + Math.random() * 0.9, 60, Math.random() < 0.2);
    }
  }

  /** A burst of light at a point (a card being revealed). */
  pop(x: number, y: number, tier: SkinRarity, n = 30): void {
    const big = tier === 'epic' ? 2 : 1;
    this.rings.push({ r: 3, v: 80 * big, t: 0, life: 0.45, col: this.color(tier, true) });
    for (let i = 0; i < n * big; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 20 + Math.random() * 90 * big;
      this.spark(x, y, Math.cos(a) * v, Math.sin(a) * v, this.color(tier, Math.random() < 0.5, i), 0.4 + Math.random() * 0.6, 40, Math.random() < 0.3);
    }
    if (tier === 'epic') this.flashOnce('#ffffff', 0.6);
  }

  /**
   * The omen before a legendary or epic: the room goes dark and a pillar of
   * light shoots out of the chest (epic adds falling stars).
   */
  omen(tier: SkinRarity): void {
    this.tier = tier;
    this.rayTier = tier;
    this.dimTarget = 0.9;
    this.beamTarget = 1;
    this.glow = 1;
    this.shake = 2.4;
    if (tier === 'epic') this.starfall = 1;
    for (let i = 0; i < 4; i++) this.rings.push({ r: 4, v: 160 + i * 50, t: -i * 0.12, life: 0.8, col: this.color(tier, true, i) });
  }

  /** The tier name lands: a flash and a wide ring, then the dark lifts a little. */
  slam(tier: SkinRarity): void {
    this.flashOnce(this.color(tier, true), 0.75);
    const m = this.mouth;
    this.rings.push({ r: 10, v: 260, t: 0, life: 0.9, col: this.color(tier, true) });
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 160;
      this.spark(m.x, m.y - 30, Math.cos(a) * v, Math.sin(a) * v, this.color(tier, Math.random() < 0.5, i), 0.6 + Math.random() * 0.8, 50, Math.random() < 0.4);
    }
  }

  /** Sparkles orbiting a revealed card; null stops them. */
  setHalo(el: Element | null, tier: SkinRarity = 'legendary'): void {
    if (!el) { this.halo = null; return; }
    const p = this.pointOf(el), r = el.getBoundingClientRect();
    this.halo = { x: p.x, y: p.y, r: Math.max(r.width, r.height) / this.k / 2 + 3, tier };
  }

  flashOnce(col: string, a: number): void {
    this.flashCol = col;
    this.flash = Math.max(this.flash, a);
  }

  private spark(x: number, y: number, vx: number, vy: number, col: string, life: number, g: number, star: boolean): void {
    if (this.parts.length > 420) this.parts.shift();
    this.parts.push({ x, y, vx, vy, t: 0, life, col, s: Math.random() < 0.3 ? 2 : 1, g, star });
  }

  private update(dt: number): void {
    this.t += dt;
    const target = this.center ? { x: Math.round(this.w / 2), y: Math.round(this.h * 0.64) } : this.home;
    const e = 1 - Math.exp(-dt * 9);
    this.at.x += (target.x - this.at.x) * e;
    this.at.y += (target.y - this.at.y) * e;
    this.dim += (this.dimTarget - this.dim) * (1 - Math.exp(-dt * 6));
    if (this.lidT >= 0) this.lidT += dt;
    if (this.goneV) this.gone = Math.min(1, this.gone + dt * this.goneV);
    this.flash = Math.max(0, this.flash - dt * 2.6);
    this.beam += (this.beamTarget - this.beam) * (1 - Math.exp(-dt * (this.beamTarget > this.beam ? 5 : 3)));
    if (this.starfall > 0 && Math.random() < dt * 40) {
      this.spark(Math.random() * this.w, -2, (Math.random() - 0.3) * 20, 40 + Math.random() * 50, RAINBOW[Math.floor(Math.random() * RAINBOW.length)], 2 + Math.random(), 10, Math.random() < 0.5);
    }
    if (this.halo) {
      this.haloT -= dt;
      const hl = this.halo;
      if (this.haloT <= 0) {
        this.haloT = hl.tier === 'epic' ? 0.02 : 0.04;
        const a = Math.random() * Math.PI * 2;
        const x = hl.x + Math.cos(a) * hl.r * 0.8, y = hl.y + Math.sin(a) * hl.r;
        this.spark(x, y, -Math.sin(a) * 14, Math.cos(a) * 14 - 6, this.color(hl.tier, Math.random() < 0.6, Math.floor(Math.random() * 5)), 0.8 + Math.random() * 0.6, -6, Math.random() < 0.5);
      }
    }
    // Idle motes drift up around the chest; more of them in the tier colour while charging.
    this.moteT -= dt;
    if (this.moteT <= 0 && this.gone < 1) {
      this.moteT = this.tier ? 0.025 : 0.12;
      const col = this.tier ? this.color(this.tier, Math.random() < 0.5) : Math.random() < 0.5 ? GOLD[3] : '#b09aff';
      this.spark(this.at.x + (Math.random() - 0.5) * (W + 16), this.at.y - Math.random() * 8, (Math.random() - 0.5) * 6, -10 - Math.random() * 18, col, 1.2 + Math.random(), -4, false);
    }
    for (const p of this.parts) {
      p.t += dt;
      p.vy += p.g * dt;
      p.vx *= 1 - dt * 1.2;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const r of this.rings) { r.t += dt; if (r.t > 0) r.r += r.v * dt * (1 - r.t / r.life); }
    this.rings = this.rings.filter((r) => r.t < r.life);
  }

  private draw(): void {
    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    if (this.dim > 0.01) { g.fillStyle = `rgba(6, 3, 12, ${this.dim})`; g.fillRect(0, 0, this.w, this.h); }
    const m = this.mouth;
    const sx = this.shake ? Math.round(Math.sin(this.t * 53) * this.shake * 2) : 0;
    const sy = this.shake ? Math.round(Math.abs(Math.sin(this.t * 37)) * -this.shake) : 0;
    const x0 = Math.round(this.at.x - W / 2) + sx, y0 = Math.round(this.at.y - BODY_H) + sy;

    // Rays behind everything once open.
    if (this.rays > 0.01) this.drawRays(m.x, m.y - 6);
    if (this.beam > 0.01) this.drawBeam(m.x, m.y);

    // Soft light behind the chest while charging.
    if (this.tier && this.glow > 0.01 && this.gone < 1) {
      g.globalCompositeOperation = 'lighter';
      const rad = 30 + this.glow * 40 + Math.sin(this.t * 10) * 3;
      const grd = g.createRadialGradient(m.x, m.y, 2, m.x, m.y, rad);
      grd.addColorStop(0, this.color(this.tier, false));
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.55 * this.glow * (1 - this.gone);
      g.fillStyle = grd;
      g.fillRect(m.x - rad, m.y - rad, rad * 2, rad * 2);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }

    // Shadow and chest.
    if (this.gone < 1) {
      g.globalAlpha = 1 - this.gone;
      g.fillStyle = 'rgba(0, 0, 0, 0.45)';
      g.fillRect(x0 + 2, y0 + BODY_H, W - 4, 2);
      g.fillRect(x0 + 5, y0 + BODY_H + 2, W - 10, 1);
      g.drawImage(this.body, x0, y0);
      if (this.lidT < 0) {
        const lift = this.tier ? Math.round(this.glow * 2 * Math.abs(Math.sin(this.t * 22))) : 0;
        this.drawLid(x0, y0 - LID_H + 1 - lift, 0, 1);
        // Light through the seam and keyhole.
        if (this.tier && this.glow > 0) {
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = Math.min(1, this.glow * 1.3) * (1 - this.gone);
          g.fillStyle = this.color(this.tier, true);
          g.fillRect(x0 + 1, y0 - lift, W - 2, 1 + lift);
          g.fillRect(x0 + 21, y0 + 5, 2, 5);
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'source-over';
        }
      }
      g.globalAlpha = 1;
    }
    if (this.lidT >= 0 && this.lidT < 0.7) {
      const t = this.lidT;
      this.drawLid(x0 + t * 50, y0 - LID_H + 1 - t * 160 + t * t * 120, -t * 5, Math.max(0, 1 - t / 0.7));
    }

    // Rings and sparks.
    g.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      if (r.t < 0) continue;
      g.globalAlpha = 1 - r.t / r.life;
      g.strokeStyle = r.col;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(m.x, m.y, r.r, r.r * 0.6, 0, 0, Math.PI * 2);
      g.stroke();
    }
    for (const p of this.parts) {
      const a = 1 - p.t / p.life;
      g.globalAlpha = a;
      g.fillStyle = p.col;
      const x = Math.round(p.x), y = Math.round(p.y);
      if (p.star && a > 0.3) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
      else g.fillRect(x, y, p.s, p.s);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    if (this.flash > 0.01) {
      g.globalAlpha = Math.min(1, this.flash);
      g.fillStyle = this.flashCol;
      g.fillRect(0, 0, this.w, this.h);
      g.globalAlpha = 1;
    }
  }

  private drawLid(x: number, y: number, rot: number, alpha: number): void {
    const g = this.g;
    g.globalAlpha *= alpha;
    if (rot) {
      g.save();
      g.translate(Math.round(x + W / 2), Math.round(y + LID_H / 2));
      g.rotate(rot);
      g.drawImage(this.lid, -W / 2, -LID_H / 2);
      g.restore();
    } else {
      g.drawImage(this.lid, Math.round(x), Math.round(y));
      // The jewel on top takes the light's colour.
      g.fillStyle = this.tier ? this.color(this.tier, Math.sin(this.t * 12) > 0) : '#b09aff';
      g.fillRect(Math.round(x) + 20, Math.round(y) + 2, 4, 2);
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(x) + 20, Math.round(y) + 2, 1, 1);
    }
    g.globalAlpha = 1;
  }

  /** A column of light from the chest to the top of the screen, flickering, with a bright core. */
  private drawBeam(x: number, y: number): void {
    const g = this.g;
    const tier = this.rayTier;
    const wide = Math.round((10 + Math.sin(this.t * 30) * 1.5) * this.beam * (tier === 'epic' ? 1.4 : 1));
    g.globalCompositeOperation = 'lighter';
    for (let i = 3; i >= 0; i--) {
      const w = wide * (1 + i * 0.7);
      g.globalAlpha = this.beam * (i ? 0.16 : 0.9);
      g.fillStyle = i ? this.color(tier, false, i) : this.color(tier, true, Math.floor(this.t * 4));
      g.fillRect(Math.round(x - w / 2), 0, Math.round(w), Math.round(y));
    }
    g.globalAlpha = this.beam;
    g.fillStyle = '#ffffff';
    g.fillRect(Math.round(x - Math.max(1, wide / 5)), 0, Math.max(2, Math.round(wide / 2.5)), Math.round(y));
    // Rising sparks inside the column.
    if (Math.random() < this.beam) this.spark(x + (Math.random() - 0.5) * wide * 2, y - Math.random() * 10, 0, -120 - Math.random() * 120, this.color(tier, true, Math.floor(Math.random() * 5)), 0.6, 0, Math.random() < 0.3);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  /** Lets the dark and the beam go (the burst takes over). */
  release(): void {
    this.beamTarget = 0;
    this.starfall = 0;
    this.dimTarget = this.center ? 0.62 : 0;
  }

  /** Rotating light rays from the open chest. */
  private drawRays(x: number, y: number): void {
    const g = this.g;
    const n = this.rayTier === 'epic' ? 18 : 14;
    const len = Math.max(this.w, this.h);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.t * (this.rayTier === 'epic' ? 0.5 : 0.25);
      const half = (Math.PI / n) * 0.45;
      g.globalAlpha = this.rays * (i % 2 ? 0.16 : 0.26);
      g.fillStyle = this.color(this.rayTier, i % 3 === 0, i);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a - half) * len, y + Math.sin(a - half) * len);
      g.lineTo(x + Math.cos(a + half) * len, y + Math.sin(a + half) * len);
      g.closePath();
      g.fill();
    }
    const grd = g.createRadialGradient(x, y, 1, x, y, 60);
    grd.addColorStop(0, this.color(this.rayTier, true));
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = this.rays * 0.7;
    g.fillStyle = grd;
    g.fillRect(x - 60, y - 60, 120, 120);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}
