import { css, mix } from './pixel/color';
import { bayer } from './pixel/paint';
import { drawText, type TextStyle } from './font';
import { PPM } from './sprite/animator';

/** World (metres, y up) → art pixels. */
export interface View {
  sx(x: number): number;
  sy(y: number): number;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  color: number; color2: number;
  size: number;
  gravity: number; drag: number;
  kind: 'dot' | 'streak' | 'smoke' | 'ember';
  ground: boolean;
}

export interface Burst {
  x: number; y: number;
  count: number;
  /** Direction (radians, world) and spread; omitted = all around. */
  dir?: number;
  spread?: number;
  speed: [number, number];
  life: [number, number];
  color: number;
  /** Colour particles fade toward. */
  color2?: number;
  size?: number;
  gravity?: number;
  drag?: number;
  kind?: Particle['kind'];
  jitter?: number;
  jitterY?: number;
}

interface Pulse {
  kind: 'ring' | 'star' | 'groundRing' | 'crack' | 'pillar';
  x: number; y: number;
  r: number;
  t: number; max: number;
  color: number;
  seed: number;
}

interface Pop {
  text: string; x: number; y: number; vy: number;
  t: number; max: number;
  style: TextStyle;
}

const MAX_PARTICLES = 900;

/** Pixel particles, flashes, rings and floating text. */
export class Fx {
  private ps: Particle[] = [];
  private pulses: Pulse[] = [];
  private pops: Pop[] = [];
  private smokeCache = new Map<string, HTMLCanvasElement>();
  private rnd = Math.random;

  burst(b: Burst): void {
    for (let i = 0; i < b.count && this.ps.length < MAX_PARTICLES; i++) {
      const a = b.dir === undefined ? this.rnd() * Math.PI * 2 : b.dir + (this.rnd() - 0.5) * 2 * (b.spread ?? 0.5);
      const sp = b.speed[0] + this.rnd() * (b.speed[1] - b.speed[0]);
      const life = b.life[0] + this.rnd() * (b.life[1] - b.life[0]);
      this.ps.push({
        x: b.x + (this.rnd() - 0.5) * 2 * (b.jitter ?? 0), y: b.y + (this.rnd() - 0.5) * 2 * (b.jitterY ?? b.jitter ?? 0),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life,
        color: b.color, color2: b.color2 ?? b.color, size: b.size ?? 1,
        gravity: b.gravity ?? 0, drag: b.drag ?? 0, kind: b.kind ?? 'dot', ground: (b.gravity ?? 0) > 0,
      });
    }
  }

  pulse(kind: Pulse['kind'], x: number, y: number, r: number, color: number, life = 0.3): void {
    this.pulses.push({ kind, x, y, r, t: 0, max: life, color, seed: Math.floor(this.rnd() * 1000) });
  }

  pop(text: string, x: number, y: number, style: TextStyle, life = 0.9, vy = 1.6): void {
    // Nudge up when stacking on a recent pop so numbers don't overlap.
    for (const p of this.pops) if (Math.abs(p.x - x) < 0.8 && Math.abs(p.y - y) < 0.35 && p.t < 0.25) y = p.y + 0.38;
    this.pops.push({ text, x, y, vy, t: 0, max: life, style });
  }

  update(dt: number): void {
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.vy -= p.gravity * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.ground && p.y < 0) { p.y = 0; p.vy *= -0.35; p.vx *= 0.6; }
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const q = this.pulses[i];
      q.t += dt;
      if (q.t >= q.max) this.pulses.splice(i, 1);
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      p.y += p.vy * dt * Math.max(0, 1 - p.t * 2.2);
      if (p.t >= p.max) this.pops.splice(i, 1);
    }
  }

  /** Ground-level effects (rings, cracks) drawn under the fighters. */
  drawUnder(g: CanvasRenderingContext2D, v: View): void {
    for (const q of this.pulses) {
      if (q.kind !== 'groundRing' && q.kind !== 'crack') continue;
      const k = q.t / q.max;
      const cx = Math.round(v.sx(q.x)), cy = Math.round(v.sy(0));
      if (q.kind === 'groundRing') {
        const rx = q.r * PPM * (0.3 + 0.7 * Math.sqrt(k)), ry = rx * 0.22;
        ellipseOutline(g, cx, cy, rx, ry, css(q.color), k > 0.6 ? 0.5 : 1);
      } else {
        // Radiating ground cracks that fade.
        g.fillStyle = css(mix(q.color, 0x1a1020, k));
        let s = q.seed;
        for (let i = 0; i < 6; i++) {
          s = (s * 9301 + 49297) % 233280;
          const dir = i % 2 ? 1 : -1;
          let x = cx, y = cy;
          const len = q.r * PPM * (0.5 + (s / 233280) * 0.5);
          for (let j = 0; j < len; j += 2) {
            x += dir * 2; y += ((s >> (j % 7)) & 1) - 0.5 * ((j / 4) & 1);
            g.fillRect(Math.round(x), Math.round(y + (i >> 1) - 1), 2, 1);
          }
        }
      }
    }
  }

  draw(g: CanvasRenderingContext2D, v: View): void {
    for (const p of this.ps) {
      const k = 1 - p.life / p.max;
      const x = Math.round(v.sx(p.x)), y = Math.round(v.sy(p.y));
      const col = k < 0.5 ? p.color : mix(p.color, p.color2, (k - 0.5) * 2);
      if (p.kind === 'smoke') {
        const r = Math.max(1, Math.round(p.size * (0.5 + k)));
        const img = this.smoke(col, r, k > 0.6);
        g.drawImage(img, x - r, y - r);
        continue;
      }
      g.fillStyle = css(col);
      if (p.kind === 'streak') {
        // A short line along the velocity.
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const len = Math.min(5, 1 + sp * 0.35);
        const ux = p.vx / sp, uy = -p.vy / sp;
        for (let i = 0; i < len; i++) g.fillRect(Math.round(x - ux * i), Math.round(y - uy * i), 1, 1);
      } else if (p.kind === 'ember') {
        if ((Math.floor(p.life * 20) & 1) === 0) g.fillRect(x, y, 1, 1);
      } else {
        const s = p.size > 1 && k > 0.6 ? p.size - 1 : p.size;
        g.fillRect(x, y, s, s);
      }
    }
    for (const q of this.pulses) {
      if (q.kind === 'groundRing' || q.kind === 'crack') continue;
      const k = q.t / q.max;
      const cx = Math.round(v.sx(q.x)), cy = Math.round(v.sy(q.y));
      if (q.kind === 'ring') {
        const r = q.r * PPM * (0.25 + 0.75 * Math.sqrt(k));
        ellipseOutline(g, cx, cy, r, r, css(q.color), k > 0.55 ? 0.5 : 1);
      } else if (q.kind === 'star') {
        // Four-point impact flash that shrinks.
        const r = Math.max(1, Math.round(q.r * PPM * (1 - k)));
        g.fillStyle = css(k < 0.3 ? 0xffffff : q.color);
        g.fillRect(cx - r, cy, r * 2 + 1, 1);
        g.fillRect(cx, cy - r, 1, r * 2 + 1);
        const d = Math.round(r * 0.45);
        g.fillRect(cx - d, cy - 1, d * 2 + 1, 3);
        g.fillRect(cx - 1, cy - d, 3, d * 2 + 1);
        if (r > 4) { g.fillStyle = '#fff'; g.fillRect(cx - 1, cy - 1, 3, 3); }
      } else if (q.kind === 'pillar') {
        // Column of light (revive, meteor).
        const w = Math.max(1, Math.round(q.r * PPM * (1 - k)));
        g.fillStyle = css(q.color);
        g.globalAlpha = 1 - k * 0.6;
        g.fillRect(cx - w, 0, w * 2, cy);
        g.fillStyle = '#fff';
        g.fillRect(cx - (w >> 1), 0, w, cy);
        g.globalAlpha = 1;
      }
    }
    for (const p of this.pops) {
      if (p.t > p.max - 0.15 && (Math.floor(p.t * 30) & 1)) continue; // blink out
      drawText(g, p.text, v.sx(p.x), v.sy(p.y), p.style);
    }
  }

  clear(): void {
    this.ps.length = 0;
    this.pulses.length = 0;
    this.pops.length = 0;
  }

  private smoke(col: number, r: number, thin: boolean): HTMLCanvasElement {
    const key = `${col}.${r}.${thin ? 1 : 0}`;
    let c = this.smokeCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = r * 2 + 1;
    const g = c.getContext('2d')!;
    g.fillStyle = css(col);
    for (let y = 0; y <= r * 2; y++) for (let x = 0; x <= r * 2; x++) {
      const d = Math.hypot(x - r, y - r) / (r + 0.5);
      if (d > 1) continue;
      if (bayer(x, y) < (thin ? 0.35 : 0.75) * (1 - d * d * 0.5)) g.fillRect(x, y, 1, 1);
    }
    this.smokeCache.set(key, c);
    return c;
  }
}

/** One-pixel ellipse outline (dithered when fading). */
export function ellipseOutline(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string, density = 1): void {
  g.fillStyle = color;
  const n = Math.max(12, Math.round((rx + ry) * 3));
  let lx = NaN, ly = NaN;
  for (let i = 0; i < n; i++) {
    if (density < 1 && i % 2) continue;
    const a = (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
    if (x === lx && y === ly) continue;
    lx = x; ly = y;
    g.fillRect(x, y, 1, 1);
  }
}
