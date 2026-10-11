import type { View } from './fx';
import type { Light } from './glfx';
import { PPM } from './sprite/animator';

/**
 * Canvas stand-in for the shader light layer: the same lights (glows, rings,
 * beams, flares, star glints, rays, arcs) drawn additively with gradients
 * into the art-resolution canvas, so they come out as soft pixel light once
 * the canvas is scaled up. The menu previews use it (their canvases are see-
 * through, so the full-screen shader pass can't run there), and so does the
 * battle on devices without WebGL2. World metres, like the shader layer.
 */

const rgba = (c: number, a: number): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

const hash = (n: number): number => {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
};

export class SoftLights {
  private ls: Light[] = [];

  add(l: Light): Light {
    l.t = -(l.delay ?? 0);
    l.seed ??= Math.random() * 97;
    if (this.ls.length >= 32) this.ls.shift();
    this.ls.push(l);
    return l;
  }

  clear(): void {
    this.ls.length = 0;
  }

  get busy(): boolean {
    return this.ls.length > 0;
  }

  /** Ages the lights (`dt` scene time, `real` wall time) and moves followers. */
  update(dt: number, real = dt): void {
    for (let i = this.ls.length - 1; i >= 0; i--) {
      const l = this.ls[i];
      l.t! += l.real ? real : dt;
      if (l.follow && l.t! >= 0) {
        const at = l.gone === undefined ? l.follow() : null;
        if (at) { l.x = at[0]; l.y = at[1]; } else l.gone = (l.gone ?? 0) + dt;
      }
      if (l.t! >= l.life || (l.gone ?? 0) > 0.2) this.ls.splice(i, 1);
    }
  }

  draw(g: CanvasRenderingContext2D, v: View): void {
    if (!this.ls.length) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const l of this.ls) {
      if (l.t! < 0) continue;
      const k = Math.min(1, l.t! / l.life);
      const e = 1 - (1 - k) ** 3;
      const fin = l.fin ?? 0.08;
      let pw = (l.power ?? 1) * Math.min(1, fin > 0 ? k / fin : 1) * (1 - k) ** 1.6;
      if (l.gone !== undefined) pw *= Math.max(0, 1 - l.gone / 0.2);
      if (pw <= 0.01) continue;
      const R = Math.max(1, (l.r0 + (l.r1 - l.r0) * e) * PPM);
      const W = Math.max(1, (l.w ?? 0.1) * PPM);
      const x = Math.round(v.sx(l.x)), y = Math.round(v.sy(l.y));
      g.setTransform(1, 0, 0, 1, 0, 0);
      switch (l.kind) {
        case 'glow': {
          const gr = g.createRadialGradient(x, y, 0, x, y, R);
          gr.addColorStop(0, rgba(0xffffff, 0.45 * pw));
          gr.addColorStop(0.18, rgba(l.hi, 0.7 * pw));
          gr.addColorStop(0.55, rgba(l.lo, 0.3 * pw));
          gr.addColorStop(1, rgba(l.lo, 0));
          g.fillStyle = gr;
          g.fillRect(x - R, y - R, R * 2, R * 2);
          break;
        }
        case 'ring': {
          const sq = l.squash ?? 1;
          g.lineWidth = Math.max(1, W);
          g.strokeStyle = rgba(l.hi, 0.75 * pw);
          g.beginPath();
          g.ellipse(x, y, R, Math.max(1, R * sq), 0, 0, Math.PI * 2);
          g.stroke();
          g.lineWidth = Math.max(1, W * 2.5);
          g.strokeStyle = rgba(l.lo, 0.25 * pw);
          g.stroke();
          break;
        }
        case 'arc': {
          const head = Math.min(1, k / 0.45), tail = Math.max(0, (k - 0.2) / 0.8) ** 0.8;
          const sw = l.sweep ?? Math.PI, a0 = -(l.rot ?? 0);
          if (head <= tail) break;
          g.lineCap = 'round';
          g.lineWidth = Math.max(1, W);
          g.strokeStyle = rgba(l.hi, 0.9 * pw);
          g.beginPath();
          g.arc(x, y, R, a0 - sw * tail, a0 - sw * head, sw > 0);
          g.stroke();
          g.lineWidth = Math.max(1, W * 2.6);
          g.strokeStyle = rgba(l.lo, 0.3 * pw);
          g.stroke();
          break;
        }
        case 'beam': {
          g.translate(x, y);
          g.rotate(-(l.rot ?? 0));
          const gr = g.createLinearGradient(0, -W * 2, 0, W * 2);
          gr.addColorStop(0, rgba(l.lo, 0));
          gr.addColorStop(0.3, rgba(l.lo, 0.35 * pw));
          gr.addColorStop(0.5, rgba(l.hi, 0.85 * pw));
          gr.addColorStop(0.7, rgba(l.lo, 0.35 * pw));
          gr.addColorStop(1, rgba(l.lo, 0));
          g.fillStyle = gr;
          g.fillRect(0, -W * 2, R, W * 4);
          g.fillStyle = rgba(0xffffff, 0.35 * pw);
          g.fillRect(0, -Math.max(0.5, W * 0.2), R, Math.max(1, W * 0.4));
          break;
        }
        case 'flare': {
          g.translate(x, y);
          g.scale(1, Math.max(0.04, W / R));
          const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
          gr.addColorStop(0, rgba(0xffffff, 0.8 * pw));
          gr.addColorStop(0.3, rgba(l.hi, 0.55 * pw));
          gr.addColorStop(1, rgba(l.lo, 0));
          g.fillStyle = gr;
          g.fillRect(-R, -R, R * 2, R * 2);
          break;
        }
        case 'star': {
          const t = Math.max(1, Math.round(W));
          g.fillStyle = rgba(l.hi, 0.9 * pw);
          g.fillRect(x - R, y - (t >> 1), R * 2, t);
          g.fillRect(x - (t >> 1), y - R, t, R * 2);
          g.fillStyle = rgba(0xffffff, pw);
          g.fillRect(x - R * 0.4, y - (t >> 1), R * 0.8, t);
          g.fillRect(x - (t >> 1), y - R * 0.4, t, R * 0.8);
          const gr = g.createRadialGradient(x, y, 0, x, y, R * 0.45);
          gr.addColorStop(0, rgba(l.hi, 0.6 * pw));
          gr.addColorStop(1, rgba(l.lo, 0));
          g.fillStyle = gr;
          g.fillRect(x - R, y - R, R * 2, R * 2);
          break;
        }
        case 'rays': {
          g.translate(x, y);
          const n = 14, seed = l.seed ?? 0;
          for (let i = 0; i < n; i++) {
            const h = hash(i + seed);
            if (h < 0.35) continue;
            const a = (i / n) * Math.PI * 2 + hash(i * 3.1 + seed) * 0.3;
            const gr = g.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
            gr.addColorStop(0, rgba(l.hi, 0.45 * pw * h));
            gr.addColorStop(1, rgba(l.lo, 0));
            g.fillStyle = gr;
            g.beginPath();
            g.moveTo(0, 0);
            g.arc(0, 0, R, a - 0.07, a + 0.07);
            g.closePath();
            g.fill();
          }
          break;
        }
      }
    }
    g.restore();
  }
}
