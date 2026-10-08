import { ARENA_HALF_WIDTH } from '../sim/constants';
import { css, mix } from './pixel/color';
import type { Pix } from './pixel/paint';
import { buildArena, floorRow, type ArenaArt, type Layer, type SkyKey, type Theme } from './arenaArt';
import { PPM } from './sprite/animator';

interface LayerImg { img: HTMLCanvasElement; factor: number; y: number; drift: number; after?: Layer['after'] }
interface FloaterImg { img: HTMLCanvasElement; x: number; y: number; factor: number; front: boolean; phase: number }

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The sky key for day progress `p`, eased between neighbours. */
function skyAt(keys: SkyKey[], p: number): SkyKey {
  let i = 0;
  while (i < keys.length - 2 && p >= keys[i + 1].at) i++;
  const a = keys[i], b = keys[i + 1];
  const t = smooth(a.at, b.at, p);
  const m = (x: number, y: number) => mix(x, y, t);
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    at: p, sky: [m(a.sky[0], b.sky[0]), m(a.sky[1], b.sky[1]), m(a.sky[2], b.sky[2]), m(a.sky[3], b.sky[3])],
    glow: m(a.glow, b.glow), glowA: n(a.glowA, b.glowA), band: m(a.band, b.band), bandA: n(a.bandA, b.bandA),
    tint: m(a.tint, b.tint), tintA: n(a.tintA, b.tintA),
  };
}

function glowSprite(color: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, css(color, 0.6));
  grad.addColorStop(0.35, css(color, 0.22));
  grad.addColorStop(1, css(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

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
  private sky: { stars: HTMLCanvasElement; rainbow: HTMLCanvasElement; moon: HTMLCanvasElement; lamp: HTMLCanvasElement; firefly: HTMLCanvasElement } | null;
  /** Share of the round gone by (0 noon … 1 night) for arenas with a day cycle. */
  private day = 0;
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
    const cy = this.art.cycle;
    this.sky = cy && { stars: canvasOf(cy.stars), rainbow: canvasOf(cy.rainbow), moon: canvasOf(cy.moon), lamp: glowSprite(cy.lampColor), firefly: glowSprite(0xd8ff70) };
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

  /** Day progress for the live sky (0..1); arenas without one ignore it. */
  setDay(p: number): void {
    this.day = Math.min(1, Math.max(0, p));
  }

  private sunPos(): [number, number] {
    const s = Math.min(1, this.day / 0.76), hz = this.art.cycle!.hz;
    return [this.W * (0.18 + 0.64 * s), hz * (0.14 + s * s)];
  }

  update(dt: number): void {
    this.excite = Math.max(0, this.excite - dt * 0.5);
    this.crowdT += dt * (1.5 + this.excite * 9);
    if (this.crowdT >= 1) { this.crowdT -= 1; this.crowdFrame ^= 1; }
  }

  /** Everything behind the fighters. `cam` is the camera centre in art px; `t` real time. */
  draw(g: CanvasRenderingContext2D, cam: number, t: number): void {
    const W = this.W;
    // A live sky is painted behind everything afterwards (see light()).
    if (this.sky) g.clearRect(0, 0, W, this.H);
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
      if (l.after === 'birds' && this.amb && this.day < 0.8) this.drawBirds(g, cam, t);
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
    const sun = this.sky ? this.sunPos() : [0, 0];
    const o = this.art.cycle?.rayOrigin ?? [0, 0];
    const beam = this.sky ? 1 - smooth(0.55, 0.72, this.day) : 1;
    if (beam > 0) for (let k = 0; k < this.rays.length; k++) {
      g.globalAlpha = (0.55 + 0.45 * Math.sin(t * 0.45 + k * Math.PI)) * beam;
      g.drawImage(this.rays[k], Math.round(sun[0] - o[0]), Math.round(sun[1] - o[1]));
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

  /**
   * Day-cycle lighting, after the fighters: pulls the whole world toward the
   * hour's light, paints the live sky into whatever is still transparent, then
   * adds what glows at night.
   */
  light(g: CanvasRenderingContext2D, cam: number, t: number): void {
    const cy = this.art.cycle, sk = this.sky;
    if (!cy || !sk) return;
    const W = this.W, H = this.H, hz = cy.hz, p = this.day;
    const k = skyAt(cy.keys, p);
    if (k.tintA > 0.004) {
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = k.tintA;
      g.fillStyle = css(k.tint);
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    // Sky, front to back, each piece slipped behind what is already there.
    g.globalCompositeOperation = 'destination-over';
    const [sx, sy] = this.sunPos();
    const r = cy.sunR;
    if (sy < hz + r) {
      g.fillStyle = css(mix(0xffffff, 0xffe9a8, smooth(0.3, 0.7, p)));
      g.beginPath(); g.arc(sx, sy, r - 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = css(mix(0xfffbe2, 0xff9a50, smooth(0.45, 0.74, p)));
      g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
    }
    const moon = smooth(0.76, 1, p);
    if (moon > 0) {
      const mx = W * (0.12 + 0.14 * moon), my = hz * (1.08 - 0.72 * moon);
      g.drawImage(sk.moon, Math.round(mx - sk.moon.width / 2), Math.round(my - sk.moon.height / 2));
      const mg = g.createRadialGradient(mx, my, 0, mx, my, 44);
      mg.addColorStop(0, css(0xc8d8ff, 0.35 * moon)); mg.addColorStop(1, css(0xc8d8ff, 0));
      g.fillStyle = mg; g.fillRect(mx - 44, my - 44, 88, 88);
    }
    if (k.glowA > 0.01) {
      const gr = g.createRadialGradient(sx, sy, 0, sx, sy, r * 8);
      gr.addColorStop(0, css(k.glow, k.glowA)); gr.addColorStop(0.25, css(k.glow, k.glowA * 0.45)); gr.addColorStop(1, css(k.glow, 0));
      g.fillStyle = gr; g.fillRect(0, 0, W, hz + 12);
    }
    if (k.bandA > 0.01) {
      g.save();
      g.translate(Math.min(W * 0.85, sx), hz);
      g.scale(1, 0.3);
      const br = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.75);
      br.addColorStop(0, css(k.band, k.bandA)); br.addColorStop(1, css(k.band, 0));
      g.fillStyle = br; g.fillRect(-W * 2, -hz * 4, W * 4, hz * 8);
      g.restore();
    }
    const bow = 1 - smooth(0.32, 0.5, p);
    if (bow > 0) { g.globalAlpha = bow; g.drawImage(sk.rainbow, 0, 0); }
    const stars = smooth(0.74, 0.9, p);
    if (stars > 0) { g.globalAlpha = stars; g.drawImage(sk.stars, 0, 0); }
    g.globalAlpha = 1;
    const sg = g.createLinearGradient(0, 0, 0, hz + 8);
    k.sky.forEach((c, i) => sg.addColorStop(i / 3, css(c)));
    g.fillStyle = sg;
    g.fillRect(0, 0, W, H);
    // Night lights.
    const lamps = smooth(0.66, 0.86, p);
    g.globalCompositeOperation = 'lighter';
    if (lamps > 0) {
      for (let i = 0; i < cy.lamps.length; i++) {
        const l = cy.lamps[i];
        const x = l.x - cam * l.factor;
        if (x < -l.r || x > W + l.r) continue;
        g.globalAlpha = lamps * (0.85 + 0.15 * Math.sin(t * 2.3 + i * 1.7));
        g.drawImage(sk.lamp, x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      }
      // Fireflies drifting over the meadow.
      const span = W + 40;
      for (let i = 0; i < 18; i++) {
        const tw = Math.sin(t * (1.1 + (i % 4) * 0.35) + i * 2.3);
        if (tw < -0.2) continue;
        const x = ((((i * 71.3 + Math.sin(t * 0.25 + i) * 40 - cam * 0.85) % span) + span) % span) - 20;
        const y = this.art.gy - 10 - (i % 6) * 14 - Math.sin(t * 0.6 + i * 1.3) * 10;
        g.globalAlpha = lamps * (0.5 + 0.5 * tw);
        g.drawImage(sk.firefly, Math.round(x) - 6, Math.round(y) - 6, 12, 12);
        g.fillStyle = '#f4ffb0';
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
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
    const night = smooth(0.7, 0.86, this.day);
    g.fillStyle = a.sparkle;
    for (let i = 0; i < (night < 0.5 ? 22 : 0); i++) {
      const tw = Math.sin(t * (1.3 + (i % 4) * 0.4) + i * 2.1);
      if (tw < 0.1) continue;
      const x = Math.round(wrap(i * 61.7 + Math.sin(t * 0.3 + i) * 18 - cam * 0.8, spanX));
      const y = Math.round(this.gy - 8 - ((i * 37.3 + t * (2 + (i % 3))) % (this.gy * 0.7)));
      g.fillRect(x, y, 1, 1);
      if (tw > 0.85) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
    }
    for (let i = 0; i < (night < 0.4 ? a.wings.length : 0); i++) {
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
