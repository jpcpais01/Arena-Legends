import { css, mix } from './pixel/color';
import { bayer } from './pixel/paint';
import { drawText, type TextStyle } from './font';
import { coinSprite } from './specialArt';
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
  kind: 'dot' | 'streak' | 'smoke' | 'ember' | 'twinkle' | 'flame' | 'plus' | 'drop' | 'petal' | 'flake';
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

/**
 * One-off shapes that play out over their life:
 * - ring, star, groundRing, crack, pillar: impacts and auras;
 * - bolt: a jagged lightning bolt from (x, y) to (x2, y2), flickering;
 * - cloud: a billowing smoke cloud `r` wide that lingers and thins out;
 * - clock: a clock face whose hand sweeps backwards (the hourglass);
 * - runes: a ring of rune glyphs rising around a body (ward stone);
 * - eye: an eye that opens and closes (foresight);
 * - swirl: dots spiralling in to a point;
 * - coin: a coin flipped up into the air;
 * - icicles: ice spikes that jut out of the ground and melt back;
 * - slash: a crescent blade arc swept across a point (super strikes), `x2` the facing;
 * - implode: a ring closing in on a point (a super gathering power);
 * - rays: speed lines bursting out of a point (a super let loose);
 * - focus: anime focus lines closing in on a point from far round it, flickering (a super's big moment).
 * Meteor impacts (see meteorFx.ts):
 * - dome: a blast dome swelling off the ground, then lifting and burning away core first;
 * - crater: a glowing pool on the ground that cools (`v` picks molten, ice, hellfire or stardust);
 * - spires: big ice crystals jutting out across the ring, then shattering;
 * - hellgate: a burning rune circle on the ground, a hexagram turning inside it;
 * - constellation: stars pricking out above a point and joined up by lines;
 * - jet: a geyser of fire shooting `r` metres up off the ground, then falling away.
 */
interface Pulse {
  kind: 'ring' | 'star' | 'groundRing' | 'crack' | 'pillar' | 'bolt' | 'cloud' | 'clock' | 'runes' | 'eye' | 'swirl' | 'coin' | 'icicles'
    | 'slash' | 'implode' | 'rays' | 'focus' | 'dome' | 'crater' | 'spires' | 'hellgate' | 'constellation' | 'jet';
  x: number; y: number;
  r: number;
  t: number; max: number;
  color: number;
  seed: number;
  x2: number; y2: number;
  color2: number;
  /** Variant, for shapes that have several looks (crater). */
  v: number;
}

/** Pulses drawn flat on the ground, under the fighters. */
const GROUND = new Set<Pulse['kind']>(['groundRing', 'crack', 'crater', 'spires', 'hellgate']);

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
  private timers: { t: number; fn: () => void }[] = [];

  /** Runs `fn` after `delay` seconds of effect time (follow-up beats of a big impact). */
  later(delay: number, fn: () => void): void {
    this.timers.push({ t: delay, fn });
  }

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

  pulse(kind: Pulse['kind'], x: number, y: number, r: number, color: number, life = 0.3, color2 = color): Pulse {
    const q: Pulse = { kind, x, y, r, t: 0, max: life, color, seed: Math.floor(this.rnd() * 1000), x2: x, y2: y, color2, v: 0 };
    this.pulses.push(q);
    return q;
  }

  /** A lightning bolt between two points (world metres). */
  bolt(x: number, y: number, x2: number, y2: number, color: number, life = 0.2, core = 0xffffff): void {
    const q = this.pulse('bolt', x, y, 0, color, life, core);
    q.x2 = x2; q.y2 = y2;
  }

  /** A crescent slash across (x, y) facing `facing`, swept upward (`rising`) or downward. */
  slash(x: number, y: number, r: number, facing: number, rising: boolean, color: number, core = 0xffffff, life = 0.2): void {
    const q = this.pulse('slash', x, y, r, color, life, core);
    q.x2 = facing; q.y2 = rising ? 1 : -1;
  }

  /**
   * Particles drawn in to a point from a ring `r` metres round it, arriving
   * as they fade (power gathering for a super).
   */
  gather(x: number, y: number, r: number, count: number, color: number, color2: number, kind: Particle['kind'] = 'streak'): void {
    for (let i = 0; i < count && this.ps.length < MAX_PARTICLES; i++) {
      const a = this.rnd() * Math.PI * 2;
      const d = r * (0.7 + this.rnd() * 0.3);
      const life = 0.18 + this.rnd() * 0.12;
      const sp = d / life;
      this.ps.push({
        x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, vx: -Math.cos(a) * sp, vy: -Math.sin(a) * sp * 0.8,
        life, max: life, color, color2, size: 1, gravity: 0, drag: 0, kind, ground: false,
      });
    }
  }

  pop(text: string, x: number, y: number, style: TextStyle, life = 0.9, vy = 1.6): void {
    // Nudge up when stacking on a recent pop so numbers don't overlap.
    for (const p of this.pops) if (Math.abs(p.x - x) < 0.8 && Math.abs(p.y - y) < 0.35 && p.t < 0.25) y = p.y + 0.38;
    this.pops.push({ text, x, y, vy, t: 0, max: life, style });
  }

  update(dt: number): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      if ((tm.t -= dt) > 0) continue;
      this.timers.splice(i, 1);
      tm.fn();
    }
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
      if (!GROUND.has(q.kind)) continue;
      const k = q.t / q.max;
      const cx = Math.round(v.sx(q.x)), cy = Math.round(v.sy(0));
      if (q.kind === 'crater') drawCrater(g, q, cx, cy, k);
      else if (q.kind === 'spires') drawSpires(g, q, cx, cy, k);
      else if (q.kind === 'hellgate') drawHellgate(g, q, cx, cy, k);
      else if (q.kind === 'groundRing') {
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
      } else if (p.kind === 'flame') {
        // A flickering tongue of fire (epic skins): two pixels tall with a wide base, shrinking to one.
        g.fillRect(x, y, 1, k < 0.55 ? 2 : 1);
        if (k < 0.3 && (Math.floor(p.life * 24) & 1) === 0) g.fillRect(x - 1, y + 1, 3, 1);
      } else if (p.kind === 'plus') {
        // A small plus that rises (regeneration), shrinking to a dot.
        g.fillRect(x, y, 1, 1);
        if (k < 0.6) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
      } else if (p.kind === 'drop') {
        // A falling drop (sweat): a dot with a lighter top.
        g.fillRect(x, y, 1, 2);
        g.fillStyle = '#fff';
        g.fillRect(x, y, 1, 1);
      } else if (p.kind === 'petal' || p.kind === 'flake') {
        // Drifting petals and snowflakes (usable item skins): they sway side to side as they fall.
        const sx = x + Math.round(Math.sin(p.life * 5 + p.max * 41) * 1.4);
        if (p.kind === 'petal') {
          // Two pixels, flipping between flat and tilted as it tumbles, the lit edge in the first colour.
          const flat = (Math.floor(p.life * 9 + p.max * 13) & 1) === 0;
          g.fillRect(sx, y, 1, 1);
          g.fillStyle = css(mix(col, p.color2, 0.5));
          g.fillRect(sx + 1, flat ? y : y + 1, 1, 1);
        } else {
          g.fillRect(sx, y, 1, 1);
          if (k < 0.35) { g.fillRect(sx - 1, y, 3, 1); g.fillRect(sx, y - 1, 1, 3); }
        }
      } else if (p.kind === 'twinkle') {
        // A little four-point star that shrinks to a dot (legendary skins).
        g.fillRect(x, y, 1, 1);
        if (k < 0.45) {
          g.fillRect(x - 1, y, 3, 1);
          g.fillRect(x, y - 1, 1, 3);
          if (k < 0.15) { g.fillRect(x - 2, y, 5, 1); g.fillRect(x, y - 2, 1, 5); }
          g.fillStyle = '#fff';
          g.fillRect(x, y, 1, 1);
        }
      } else {
        const s = p.size > 1 && k > 0.6 ? p.size - 1 : p.size;
        g.fillRect(x, y, s, s);
      }
    }
    for (const q of this.pulses) {
      if (GROUND.has(q.kind)) continue;
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
      } else if (q.kind === 'bolt') {
        this.drawBolt(g, q, v, k);
      } else if (q.kind === 'cloud') {
        this.drawCloud(g, q, cx, cy, k);
      } else if (q.kind === 'clock') {
        drawClock(g, q, cx, cy, k);
      } else if (q.kind === 'runes') {
        drawRunes(g, q, cx, cy, k);
      } else if (q.kind === 'eye') {
        drawEye(g, q, cx, cy, k);
      } else if (q.kind === 'swirl') {
        // Dots spiralling inward, trailing a second colour.
        const n = 10, R = q.r * PPM * (1 - k * 0.85);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + k * 9 + q.seed;
          const r = R * (0.75 + 0.25 * Math.sin(i * 2.3));
          g.fillStyle = css(i & 1 ? q.color2 : q.color);
          g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.6), 1, 1);
          if (k < 0.5) g.fillRect(Math.round(cx + Math.cos(a - 0.25) * r), Math.round(cy + Math.sin(a - 0.25) * r * 0.6), 1, 1);
        }
      } else if (q.kind === 'coin') {
        // Flipped up with a spin, hanging at the top before it fades.
        const s = coinSprite(Math.floor(q.t * 18));
        const up = Math.round(q.r * PPM * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5));
        if (k < 0.8 || (Math.floor(q.t * 30) & 1) === 0) g.drawImage(s.img, cx - s.ox, cy - up - s.oy);
      } else if (q.kind === 'icicles') {
        drawIcicles(g, q, cx, cy, k);
      } else if (q.kind === 'slash') {
        drawSlash(g, q, cx, cy, k);
      } else if (q.kind === 'implode') {
        // Closing in, brighter as it tightens.
        const r = q.r * PPM * (1 - k * k);
        if (r >= 1) ellipseOutline(g, cx, cy, r, r * 0.8, css(k > 0.6 ? q.color2 : q.color), k < 0.3 ? 0.5 : 1);
      } else if (q.kind === 'rays') {
        drawRays(g, q, cx, cy, k);
      } else if (q.kind === 'focus') {
        drawFocus(g, q, cx, cy, k);
      } else if (q.kind === 'dome') {
        drawDome(g, q, cx, cy, k);
      } else if (q.kind === 'constellation') {
        drawConstellation(g, q, cx, cy, k);
      } else if (q.kind === 'jet') {
        drawJet(g, q, cx, cy, k);
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

  /** Jagged lightning, re-forked a few times while it lives, with a coloured halo and a branch. */
  private drawBolt(g: CanvasRenderingContext2D, q: Pulse, v: View, k: number): void {
    if (k > 0.55 && (Math.floor(q.t * 40) & 1)) return;
    const x0 = v.sx(q.x), y0 = v.sy(q.y), x1 = v.sx(q.x2), y1 = v.sy(q.y2);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.round(len / 7));
    const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
    let seed = q.seed * 7 + Math.floor(q.t * 25) * 131;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const pts = BOLT_PTS;
    pts.length = 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const off = i === 0 || i === n ? 0 : (rnd() - 0.5) * Math.min(12, len * 0.18);
      pts.push(Math.round(x0 + (x1 - x0) * t + nx * off), Math.round(y0 + (y1 - y0) * t + ny * off));
    }
    g.fillStyle = css(q.color);
    for (let i = 0; i + 2 < pts.length; i += 2) {
      pxLine(g, pts[i] + 1, pts[i + 1], pts[i + 2] + 1, pts[i + 3]);
      pxLine(g, pts[i] - 1, pts[i + 1], pts[i + 2] - 1, pts[i + 3]);
    }
    // One fork off a middle joint.
    const j = 2 * (1 + Math.floor(rnd() * Math.max(1, n - 1)));
    if (j + 1 < pts.length && k < 0.7) {
      const bx = pts[j] + (rnd() - 0.5) * 14 + (x1 - x0) * 0.12, by = pts[j + 1] + (y1 - y0) * 0.15 + (rnd() - 0.5) * 8;
      pxLine(g, pts[j], pts[j + 1], Math.round(bx), Math.round(by));
    }
    g.fillStyle = css(q.color2);
    for (let i = 0; i + 2 < pts.length; i += 2) pxLine(g, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
  }

  /** Billowing smoke: a few big dithered puffs that swell, drift up and thin away. */
  private drawCloud(g: CanvasRenderingContext2D, q: Pulse, cx: number, cy: number, k: number): void {
    const R = q.r * PPM;
    const grow = 0.55 + 0.45 * Math.min(1, k * 5);
    let s = q.seed;
    for (let i = 0; i < 9; i++) {
      s = (s * 9301 + 49297) % 233280;
      const u = s / 233280;
      s = (s * 9301 + 49297) % 233280;
      const w = s / 233280;
      // Puffs low and wide first, the upper ones rising and drifting as it ages.
      const px = cx + (u - 0.5) * 2 * R * 0.75 * grow + Math.sin(q.t * 0.9 + i) * 2;
      const py = cy - 6 - w * R * 0.9 * grow - k * 10 * w;
      const r = Math.max(2, Math.round((5 + w * 7 + (i % 3) * 2) * grow * (1 + k * 0.35)));
      const tone = i % 3 === 0 ? q.color2 : q.color;
      // Thins out: the dither pattern gets sparser, then every other frame.
      if (k > 0.85 && (Math.floor(q.t * 20) + i) & 1) continue;
      g.drawImage(this.puff(tone, r, k > 0.6 ? 0.45 : k > 0.35 ? 0.7 : 0.88), Math.round(px) - r, Math.round(py) - r);
    }
  }

  clear(): void {
    this.ps.length = 0;
    this.pulses.length = 0;
    this.pops.length = 0;
    this.timers.length = 0;
  }

  /**
   * A cloud puff: solid in the middle, dithering out at the rim, lit from
   * the upper left and shaded underneath. `density` thins the whole puff.
   */
  private puff(col: number, r: number, density: number): HTMLCanvasElement {
    const key = `p${col}.${r}.${density}`;
    let c = this.smokeCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = r * 2 + 1;
    const g = c.getContext('2d')!;
    const hi = css(mix(col, 0xffffff, 0.3)), mid = css(col), lo = css(mix(col, 0x2a2838, 0.3));
    for (let y = 0; y <= r * 2; y++) for (let x = 0; x <= r * 2; x++) {
      const dx = x - r, dy = y - r;
      const d = Math.hypot(dx, dy) / (r + 0.5);
      if (d > 1) continue;
      const fill = density * (d < 0.55 ? 1 : 1 - (d - 0.55) / 0.45 * 0.85);
      if (bayer(x, y) >= fill) continue;
      const light = -(dx * 0.5 + dy * 0.85) / (r + 0.5);
      g.fillStyle = light > 0.35 ? hi : light < -0.3 ? lo : mid;
      g.fillRect(x, y, 1, 1);
    }
    this.smokeCache.set(key, c);
    return c;
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

const BOLT_PTS: number[] = [];

/** Pixel line in the current fill colour. */
export function pxLine(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 400; guard++) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** A clock face around the body, its hands sweeping backwards. */
function drawClock(g: CanvasRenderingContext2D, q: Pulse, cx: number, cy: number, k: number): void {
  if (k > 0.75 && (Math.floor(q.t * 30) & 1)) return;
  const r = Math.round(q.r * PPM * (0.6 + 0.4 * Math.min(1, k * 4)));
  ellipseOutline(g, cx, cy, r, r, css(q.color), k > 0.5 ? 0.5 : 1);
  g.fillStyle = css(q.color2);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * (r - 2)), y = Math.round(cy + Math.sin(a) * (r - 2));
    g.fillRect(x, y, 1, 1);
    if (i % 3 === 0) g.fillRect(Math.round(cx + Math.cos(a) * (r - 3)), Math.round(cy + Math.sin(a) * (r - 3)), 1, 1);
  }
  // Minute hand: one and a half turns backwards; hour hand: a quarter.
  const ease = 1 - Math.pow(1 - k, 2);
  const m = -Math.PI / 2 - ease * Math.PI * 3, hr = -Math.PI / 2 - ease * Math.PI * 0.5;
  g.fillStyle = css(q.color);
  pxLine(g, cx, cy, Math.round(cx + Math.cos(hr) * r * 0.45), Math.round(cy + Math.sin(hr) * r * 0.45));
  g.fillStyle = '#fff';
  pxLine(g, cx, cy, Math.round(cx + Math.cos(m) * (r - 4)), Math.round(cy + Math.sin(m) * (r - 4)));
  // A fading wedge trailing the minute hand.
  g.fillStyle = css(q.color2);
  for (let i = 1; i <= 3; i++) {
    const a = m + i * 0.22;
    g.fillRect(Math.round(cx + Math.cos(a) * (r - 5)), Math.round(cy + Math.sin(a) * (r - 5)), 1, 1);
  }
}

/** Rune glyphs (3x3) for the ward ring. */
const GLYPHS = [0b010111010, 0b101010101, 0b110010011, 0b011010110, 0b111101111, 0b100111001];

/** A flat ring of runes turning and rising up a body, the back half dimmer. */
function drawRunes(g: CanvasRenderingContext2D, q: Pulse, cx: number, cy: number, k: number): void {
  if (k > 0.8 && (Math.floor(q.t * 30) & 1)) return;
  const rx = q.r * PPM, ry = rx * 0.28;
  const yc = cy - Math.round(k * 26);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + q.t * 5;
    const back = Math.sin(a) < 0;
    const x = Math.round(cx + Math.cos(a) * rx) - 1, y = Math.round(yc + Math.sin(a) * ry) - 1;
    g.fillStyle = css(back ? q.color2 : q.color);
    const gl = GLYPHS[(i + q.seed) % GLYPHS.length];
    for (let b = 0; b < 9; b++) if (gl & (1 << b)) g.fillRect(x + (b % 3), y + ((b / 3) | 0), 1, 1);
  }
}

/** An eye that opens wide and shuts again. */
function drawEye(g: CanvasRenderingContext2D, q: Pulse, cx: number, cy: number, k: number): void {
  const open = k < 0.25 ? k / 0.25 : k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
  const w = 6, h = Math.round(2.6 * open);
  g.fillStyle = css(q.color);
  for (let x = -w; x <= w; x++) {
    const e = Math.round(h * Math.sqrt(1 - (x / (w + 0.5)) ** 2));
    g.fillRect(cx + x, cy - e, 1, 1);
    g.fillRect(cx + x, cy + e, 1, 1);
  }
  if (open > 0.4) {
    g.fillStyle = css(q.color2);
    g.fillRect(cx - 1, cy - 1, 3, 3);
    g.fillStyle = '#fff';
    g.fillRect(cx, cy - 1, 1, 1);
  }
  // Lashes / rays.
  if (open > 0.8 && k < 0.6) {
    g.fillStyle = css(q.color);
    g.fillRect(cx, cy - h - 3, 1, 2);
    g.fillRect(cx - 4, cy - h - 2, 1, 1); g.fillRect(cx + 4, cy - h - 2, 1, 1);
  }
}

/** Ice spikes jutting from the ground across the ring, then melting back. */
function drawIcicles(g: CanvasRenderingContext2D, q: Pulse, cx: number, cy: number, k: number): void {
  const R = q.r * PPM;
  const up = k < 0.15 ? k / 0.15 : k > 0.6 ? Math.max(0, (1 - k) / 0.4) : 1;
  let s = q.seed;
  for (let i = 0; i < 9; i++) {
    s = (s * 9301 + 49297) % 233280;
    const u = s / 233280 * 2 - 1;
    const x = Math.round(cx + u * R * 0.9);
    const hgt = Math.round((3 + (1 - Math.abs(u)) * 8 + (i % 3) * 2) * up);
    if (hgt < 1) continue;
    const y0 = cy + 1 + (i % 3);
    for (let j = 0; j < hgt; j++) {
      const wd = j < hgt * 0.4 ? 1 : 0;
      g.fillStyle = css(j > hgt - 3 ? 0xffffff : j < 2 ? q.color2 : q.color);
      g.fillRect(x - wd, y0 - j, 1 + wd * 2 - (j & 1 && wd ? 1 : 0), 1);
    }
  }
}

/**
 * A crescent blade arc: thick in the middle, tapering at both tips, a white
 * core inside a coloured edge. It is swept in over the first third of its
 * life, then thins and burns away from the tail.
 */
function drawSlash(g: CanvasRenderingContext2D, q: Pulse, cx: number, cy: number, k: number): void {
  const R = q.r * PPM, face = q.x2 >= 0 ? 1 : -1, up = q.y2 > 0 ? -1 : 1;
  const span = 2.2, n = Math.max(12, Math.round(R * span * 0.9));
  const sweep = Math.min(1, k * 3.2), tail = k > 0.45 ? (k - 0.45) / 0.55 : 0;
  const thick = Math.max(1, R * 0.16 * (1 - tail * 0.7));
  // Centre of the arc sits behind the strike point so the curve bows through it.
  const ox = cx - face * R * 0.85, oy = cy;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    if (u > sweep || u < tail) continue;
    // From the tip it starts at to the other one (screen y is down: a rising cut starts low).
    const a = (u * span - span / 2) * up;
    const w = Math.max(0, Math.sin(u * Math.PI)) * thick;
    const ca = Math.cos(a) * face, sa = Math.sin(a);
    for (let j = -Math.ceil(w); j <= Math.ceil(w); j++) {
      const rr = R + j;
      const x = Math.round(ox + ca * rr), y = Math.round(oy + sa * rr * 0.85);
      g.fillStyle = Math.abs(j) < w * 0.45 ? css(q.color2) : css(q.color);
      g.fillRect(x, y, 1, 1);
    }
  }
}

/** Speed lines bursting out of a point, longer and fainter as they fly. */
function drawRays(g: CanvasRenderingContext2D, q: Pulse, cx: number, cy: number, k: number): void {
  if (k > 0.7 && (Math.floor(q.t * 30) & 1)) return;
  const R = q.r * PPM;
  let s = q.seed;
  for (let i = 0; i < 14; i++) {
    s = (s * 9301 + 49297) % 233280;
    const a = (i / 14) * Math.PI * 2 + (s / 233280) * 0.4;
    const r0 = R * (0.25 + k * 0.8), r1 = r0 + R * (0.2 + (s % 7) * 0.05) * (1 - k * 0.5);
    g.fillStyle = css(i & 1 ? q.color2 : q.color);
    pxLine(g, Math.round(cx + Math.cos(a) * r0), Math.round(cy + Math.sin(a) * r0 * 0.75),
      Math.round(cx + Math.cos(a) * r1), Math.round(cy + Math.sin(a) * r1 * 0.75));
  }
}

/**
 * Focus lines: thin streaks pointing in at the centre from well outside it,
 * redrawn at new angles every few frames so they flicker like a manga panel.
 * Fades from the outside in.
 */
function drawFocus(g: CanvasRenderingContext2D, q: Pulse, cx: number, cy: number, k: number): void {
  const R = q.r * PPM, inner = R * 0.32;
  let s = q.seed * 31 + Math.floor(q.t * 24) * 977;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  g.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85 * 0.85;
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2;
    const r0 = inner * (0.9 + rnd() * 0.6), r1 = R * (1.1 + rnd() * 0.5);
    g.fillStyle = css(i % 3 ? q.color : q.color2);
    pxLine(g, Math.round(cx + Math.cos(a) * r0), Math.round(cy + Math.sin(a) * r0 * 0.7),
      Math.round(cx + Math.cos(a) * r1), Math.round(cy + Math.sin(a) * r1 * 0.7));
  }
  g.globalAlpha = 1;
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

/** Seeded 0..1 sequence for pulses that need stable random layouts. */
function seq(seed: number): () => number {
  let s = seed % 233280;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/**
 * Horizontal spans of an ellipse, one fillRect per row, between rows `top`
 * and `bottom` (offsets from the centre). `skip` drops every other row,
 * shifting with `ph`, for a scanline break-up as a shape fades.
 */
function fillEllipse(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, top: number, bottom: number, skip = false, ph = 0): void {
  if (rx < 0.5 || ry < 0.5) return;
  const r0 = Math.max(-Math.ceil(ry), Math.floor(top)), r1 = Math.min(Math.ceil(ry), Math.ceil(bottom));
  for (let dy = r0; dy <= r1; dy++) {
    if (skip && ((dy + ph) & 1)) continue;
    const q = 1 - (dy / ry) ** 2;
    if (q <= 0) continue;
    const w = Math.round(rx * Math.sqrt(q));
    g.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}

/**
 * A blast dome: swells off the ground fast, then lifts like a fireball and
 * burns away from the inside out (white core first, then the hot layer, the
 * deep outer shell last, breaking into scanlines).
 */
function drawDome(g: CanvasRenderingContext2D, q: Pulse, cx: number, cy: number, k: number): void {
  const R = q.r * PPM;
  const grow = k < 0.16 ? 1 - (1 - k / 0.16) ** 3 : 1;
  const burn = Math.max(0, (k - 0.2) / 0.8);
  const rise = burn * burn * R * 0.55;
  const ph = Math.floor(q.t * 24);
  const layers: [number, number, number, number][] = [
    // scale, colour, alpha, how fast it burns away
    [1, q.color2, 0.55, 1],
    [0.74, q.color, 0.85, 1.5],
    [0.44, 0xffffff, 1, 2.6],
  ];
  for (const [sc, col, al, speed] of layers) {
    const s = sc * grow * (1 - Math.min(1, burn * speed)) ** 0.6;
    if (s <= 0.02) continue;
    const rx = R * s * (1 + burn * 0.25), ry = R * s * 0.82;
    const yc = cy - rise;
    g.globalAlpha = al * (k > 0.75 ? 1 - (k - 0.75) * 2.4 : 1);
    g.fillStyle = css(col);
    fillEllipse(g, cx, Math.round(yc), rx, ry, -ry, cy - yc, k > 0.55, ph);
  }
  g.globalAlpha = 1;
}

/** Crater looks: [crust, hot, core, glints] colour roles, by variant (molten, ice, hellfire, stardust). */
function craterLook(q: Pulse): { crust: number; crustA: number; glints: number } {
  switch (q.v) {
    case 1: return { crust: mix(q.color, 0x6a8ab8, 0.5), crustA: 0.5, glints: 14 };
    case 2: return { crust: 0x14060a, crustA: 0.6, glints: 0 };
    case 3: return { crust: mix(q.color, 0x140a30, 0.7), crustA: 0.35, glints: 16 };
    default: return { crust: 0x241014, crustA: 0.5, glints: 0 };
  }
}

/**
 * A pool on the ground where the meteor struck: a dark crust, a hot middle
 * that shrinks and cools, a white core that goes first. Ice and stardust
 * pools glitter instead of cooling.
 */
function drawCrater(g: CanvasRenderingContext2D, q: Pulse, cx: number, cy: number, k: number): void {
  const R = q.r * PPM;
  const L = craterLook(q);
  const grow = k < 0.06 ? k / 0.06 : 1;
  const ph = Math.floor(q.t * 12);
  const fade = k > 0.55 ? (k - 0.55) / 0.45 : 0;
  g.globalAlpha = L.crustA * (1 - fade);
  g.fillStyle = css(L.crust);
  fillEllipse(g, cx, cy, R * grow, R * grow * 0.2, -R, R, fade > 0.3, ph);
  const heat = (1 - k) ** 1.4;
  g.globalAlpha = 0.9 * (1 - fade);
  g.fillStyle = css(mix(q.color, L.crust, 1 - heat));
  fillEllipse(g, cx, cy, R * grow * 0.66 * (0.5 + heat * 0.5), R * grow * 0.13 * (0.5 + heat * 0.5), -R, R, k > 0.5, ph);
  if (k < 0.45) {
    g.globalAlpha = 1;
    g.fillStyle = css(q.color2);
    const c = 1 - k / 0.45;
    fillEllipse(g, cx, cy, R * grow * 0.32 * c, R * grow * 0.065 * c, -R, R);
  }
  g.globalAlpha = 1;
  if (!L.glints) return;
  // Frost and stardust glitter: points across the pool winking on and off.
  const rnd = seq(q.seed + 7);
  for (let i = 0; i < L.glints; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 0.92;
    const on = (ph + i * 3) % 5;
    if (on > 1 || fade > rnd()) continue;
    const x = Math.round(cx + Math.cos(a) * d * R), y = Math.round(cy + Math.sin(a) * d * R * 0.2);
    g.fillStyle = on ? css(q.color2) : '#fff';
    g.fillRect(x, y, 1, 1);
    if (!on) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
  }
}

/**
 * Big ice crystals jutting out of the ground across the ring, leaning
 * outward, a white edge catching the light; they hold, flicker and shatter.
 */
function drawSpires(g: CanvasRenderingContext2D, q: Pulse, cx: number, cy: number, k: number): void {
  if (k > 0.78 || (k > 0.68 && (Math.floor(q.t * 30) & 1))) return;
  const R = q.r * PPM;
  const rnd = seq(q.seed + 3);
  const n = 13;
  for (let i = 0; i < n; i++) {
    const u = Math.max(-1, Math.min(1, (i / (n - 1)) * 2 - 1 + (rnd() - 0.5) * 0.14));
    const lag = Math.abs(u) * 0.06;
    const grow = Math.max(0, Math.min(1, (k - lag) / 0.08));
    const up = 1 - (1 - grow) ** 3;
    if (up <= 0) { rnd(); rnd(); continue; }
    const h = Math.round((12 + (1 - Math.abs(u)) * 30 + rnd() * 10) * up);
    const bw = 1.5 + (1 - Math.abs(u)) * 3 + rnd() * 1.5;
    const x = cx + u * R * 0.95, y0 = cy + 2 - (i % 3) * 2;
    const lean = u * 0.5;
    for (let j = 0; j < h; j++) {
      const w = bw * (1 - j / h);
      const xs = Math.round(x + lean * j);
      g.fillStyle = css(j > h - 4 ? 0xffffff : j < 3 ? q.color2 : q.color);
      g.fillRect(Math.round(xs - w), y0 - j, Math.max(1, Math.round(w * 2)), 1);
      // The lit edge, facing away from the impact.
      if (w > 1) {
        g.fillStyle = '#fff';
        g.fillRect(u < 0 ? Math.round(xs - w) : Math.round(xs + w) - 1, y0 - j, 1, 1);
      }
    }
  }
}

/** A burning rune circle laid flat on the ground: two rings, glyphs between, a hexagram turning inside. */
function drawHellgate(g: CanvasRenderingContext2D, q: Pulse, cx: number, cy: number, k: number): void {
  if (k > 0.72 && (Math.floor(q.t * 24) & 1)) return;
  const open = k < 0.1 ? 1 - (1 - k / 0.1) ** 2 : 1;
  const rx = q.r * PPM * open, ry = rx * 0.22;
  const dense = k > 0.55 ? 0.5 : 1;
  ellipseOutline(g, cx, cy, rx, ry, css(q.color), dense);
  ellipseOutline(g, cx, cy, rx * 0.8, ry * 0.8, css(q.color2), dense);
  const spin = q.t * 0.9 + q.seed;
  // Glyphs riding between the rings.
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - spin * 0.5;
    const x = Math.round(cx + Math.cos(a) * rx * 0.9) - 1, y = Math.round(cy + Math.sin(a) * ry * 0.9) - 1;
    g.fillStyle = css(Math.sin(a) < 0 ? q.color : q.color2);
    const gl = GLYPHS[(i + q.seed) % GLYPHS.length];
    for (let b = 0; b < 9; b++) if (gl & (1 << b)) g.fillRect(x + (b % 3), y + ((b / 3) | 0), 1, 1);
  }
  // Two triangles, turning the other way.
  g.fillStyle = css(q.color);
  for (let t = 0; t < 2; t++) {
    for (let i = 0; i < 3; i++) {
      const a0 = spin + t * Math.PI / 3 + (i * Math.PI * 2) / 3, a1 = a0 + (Math.PI * 2) / 3;
      pxLine(g, Math.round(cx + Math.cos(a0) * rx * 0.78), Math.round(cy + Math.sin(a0) * ry * 0.78),
        Math.round(cx + Math.cos(a1) * rx * 0.78), Math.round(cy + Math.sin(a1) * ry * 0.78));
    }
  }
}

/** Stars pricking out over the impact, joined one by one into a constellation, twinkling, then gone. */
function drawConstellation(g: CanvasRenderingContext2D, q: Pulse, cx: number, cy: number, k: number): void {
  if (k > 0.75 && (Math.floor(q.t * 24) & 1)) return;
  const R = q.r * PPM;
  const rnd = seq(q.seed + 11);
  const n = 8;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * 2 - 1 + (rnd() - 0.5) * 0.18;
    pts.push(Math.round(cx + u * R * 0.9), Math.round(cy - (0.3 + rnd() * 0.55 + (1 - Math.abs(u)) * 0.35) * R * 0.75));
  }
  const drawn = Math.min(n - 1, k * 3.2 * (n - 1));
  g.fillStyle = css(q.color2);
  for (let i = 0; i < drawn; i++) {
    const f = Math.min(1, drawn - i);
    const x0 = pts[i * 2], y0 = pts[i * 2 + 1], x1 = pts[i * 2 + 2], y1 = pts[i * 2 + 3];
    pxLine(g, x0, y0, Math.round(x0 + (x1 - x0) * f), Math.round(y0 + (y1 - y0) * f));
  }
  const ph = Math.floor(q.t * 10);
  for (let i = 0; i < n; i++) {
    if (i > drawn + 1) break;
    const x = pts[i * 2], y = pts[i * 2 + 1];
    const big = (ph + i) % 4 === 0 ? 3 : (ph + i) % 2 ? 2 : 1;
    g.fillStyle = css(q.color);
    g.fillRect(x - big, y, big * 2 + 1, 1);
    g.fillRect(x, y - big, 1, big * 2 + 1);
    g.fillStyle = '#fff';
    g.fillRect(x, y, 1, 1);
  }
}

/**
 * A geyser of fire: shoots up fast, tongues flickering at its edges, then
 * its foot lifts off the ground and the column burns out from the bottom.
 */
function drawJet(g: CanvasRenderingContext2D, q: Pulse, cx: number, cy: number, k: number): void {
  const H = q.r * PPM;
  const top = H * (k < 0.25 ? 1 - (1 - k / 0.25) ** 2 : 1 + (k - 0.25) * 0.3);
  const foot = k < 0.4 ? 0 : H * ((k - 0.4) / 0.6) ** 1.5;
  const ph = Math.floor(q.t * 30);
  for (let j = Math.floor(foot); j < top; j++) {
    const u = j / Math.max(1, top);
    const w = Math.max(1, Math.round((6.5 - u * 5) * (1 - k * 0.35) + (((j + ph) * 7) % 4 === 0 ? 1 : 0)));
    const x = cx + Math.round(Math.sin(j * 0.2 + q.t * 14 + q.seed) * u);
    g.fillStyle = css(q.color);
    g.fillRect(x - w, cy - j, w * 2 + 1, 1);
    const wi = Math.round(w * 0.55);
    if (wi > 0) {
      g.fillStyle = css(q.color2);
      g.fillRect(x - wi, cy - j, wi * 2 + 1, 1);
    }
    if (u < 0.35 && k < 0.45 && w > 3) {
      g.fillStyle = '#fff';
      g.fillRect(x - 1, cy - j, 3, 1);
    }
  }
}
