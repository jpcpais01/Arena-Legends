import type { Fx } from './fx';
import { hash } from './scenery';

/**
 * The desert's living details, drawn live over a windswept arena (see `Wind`
 * in arenaArt.ts): heat shimmer on the horizon, dust devils far off on the
 * dunes, hawks circling, sand blowing over the floor, twinkling stars and a
 * rare shooting star at night, embers off the fire bowls, and the sand the
 * fighters kick up. Everything is a handful of 1px fills per frame.
 */

const wrap = (v: number, span: number) => (((v % span) + span) % span) - 30;

/** Heat shimmer: rows of a far layer redrawn a pixel to either side, wavering. `k` fades it (0 = still air). */
export function shimmer(g: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, rows: [number, number], t: number, k: number): void {
  if (k < 0.05) return;
  for (let r = rows[0]; r < rows[1]; r++) {
    const o = Math.round(Math.sin(t * 2.1 + r * 1.9) * Math.sin(t * 0.83 + r * 0.37) * 1.7 * k);
    if (o) g.drawImage(img, 0, r - y, img.width, 1, x + o, r, img.width, 1);
  }
}

/** Two small dust devils wandering the far dunes, whirling up and dying down; `k` fades them with the sun. */
export function devils(g: CanvasRenderingContext2D, cam: number, factor: number, W: number, row: number, t: number, k: number, color: string): void {
  if (k < 0.05) return;
  g.fillStyle = color;
  for (let i = 0; i < 2; i++) {
    const T = 16 + i * 7, ph = (t + i * 9.1) / T, n = Math.floor(ph), f = ph - n;
    const life = Math.min(1, f / 0.15) * Math.min(1, (0.75 - f) / 0.2);
    if (life <= 0) continue;
    const x = (hash(n, i, 601) < 0.5 ? 0.06 + hash(n, i, 602) * 0.3 : 0.64 + hash(n, i, 602) * 0.3) * W - f * 26 - cam * factor;
    const y = row + Math.round(hash(n, i, 603) * 8);
    const h = Math.round((14 + hash(n, i, 604) * 10) * (0.6 + 0.4 * life));
    for (let j = 0; j < h; j++) {
      const w = 0.6 + j * 0.28;
      const lean = Math.sin(t * 0.9 + i * 2) * j * 0.18 - j * 0.12;
      const sw = Math.sin(t * 9 + j * 0.8 + i) * w;
      g.globalAlpha = life * k * (0.75 - (j / h) * 0.55);
      g.fillRect(Math.round(x + lean + sw), y - j, 1, 1);
      if (j > 2) { g.globalAlpha *= 0.5; g.fillRect(Math.round(x + lean - sw * 0.7), y - j, 1, 1); }
    }
    // Dust skirting its foot.
    g.globalAlpha = life * k * 0.35;
    g.fillRect(Math.round(x) - 3, y, 7, 1);
    g.fillRect(Math.round(x) - 1, y - 1, 3, 1);
  }
  g.globalAlpha = 1;
}

/** A pair of hawks circling high on the thermals, gliding with a few wingbeats now and then. */
export function hawks(g: CanvasRenderingContext2D, cam: number, W: number, hz: number, t: number, k: number, color: string): void {
  if (k < 0.05) return;
  g.fillStyle = color;
  g.globalAlpha = Math.min(1, k * 1.5);
  for (let i = 0; i < 2; i++) {
    const a = t * (i ? -0.26 : 0.34) + i * 2.4;
    const x = Math.round(W * (0.28 + i * 0.4) - cam * 0.08 + Math.cos(a) * (36 + i * 14));
    const y = Math.round(hz * (0.3 + i * 0.13) + Math.sin(a) * (7 + i * 3));
    // Wings narrow as the bird banks away from us.
    const span = Math.abs(Math.sin(a)) > 0.85 ? 2 : 3;
    const flap = Math.sin(t * 9 + i * 4) > 0.2 && Math.sin(t * 0.45 + i * 3) > 0.6;
    g.fillRect(x - 1, y, 3, 1);
    g.fillRect(x, y + 1, 1, 1);
    const tip = flap ? -1 : 1;
    g.fillRect(x - span, y + (flap ? -1 : 0), span - 1, 1);
    g.fillRect(x + 2, y + (flap ? -1 : 0), span - 1, 1);
    g.fillRect(x - span - 1, y + tip, 1, 1);
    g.fillRect(x + span + 1, y + tip, 1, 1);
  }
  g.globalAlpha = 1;
}

/**
 * Sand blowing across the floor on the wind (right to left), coming in
 * gusts: thin streaks skimming the ground with a brighter head, and grains
 * hopping along it. World-anchored, so they slide with the floor.
 */
export function sandDrift(g: CanvasRenderingContext2D, cam: number, W: number, top: number, gy: number, t: number, colors: string[]): void {
  const gust = 0.5 + 0.5 * Math.sin(t * 0.31) * Math.sin(t * 0.17 + 1);
  const span = W + 60;
  for (let i = 0; i < 30; i++) {
    const T = 1.7 + (i % 7) * 0.3, ph = t / T + i * 0.37, n = Math.floor(ph), f = ph - n;
    const a = Math.sin(f * Math.PI) * (0.12 + hash(n, i, 611) * 0.22) * (0.35 + 0.65 * gust);
    if (a < 0.03) continue;
    let y = top + 1 + Math.floor(hash(n, i, 612) * (gy + 9 - top));
    if (i % 6 === 0) y -= 4 + Math.floor(hash(n, i, 613) * 16);
    const depth = 0.7 + 0.3 * (y - top) / (gy - top);
    const speed = (110 + (i % 4) * 30) * depth;
    const x = Math.round(wrap(hash(n, i, 614) * span - f * T * speed - cam * depth, span));
    const len = Math.round((6 + hash(n, i, 615) * 16) * depth);
    g.fillStyle = colors[i % 2 ? 3 : 2];
    g.globalAlpha = a;
    g.fillRect(x + 2, y, len, 1);
    g.globalAlpha = a * 0.6;
    g.fillRect(x + 2 + len, y, len >> 1, 1);
    g.globalAlpha = Math.min(1, a * 1.8);
    g.fillRect(x, y, 2, 1);
  }
  for (let i = 0; i < 18; i++) {
    const hop = (t * (2 + (i % 3) * 0.4) + i * 0.71) % 1;
    const x = Math.round(wrap(i * 67.3 - t * (40 + (i % 5) * 9) - cam, span));
    const y = Math.round(gy - 2 + (i % 4) * 3 - Math.sin(hop * Math.PI) * (2 + (i % 3)));
    g.fillStyle = colors[(i % 3) + 1];
    g.globalAlpha = 0.25 + 0.35 * gust;
    g.fillRect(x, y, 1, 1);
  }
  g.globalAlpha = 1;
}

/**
 * Night sky, slipped behind what is already drawn ('destination-over'): the
 * bright stars twinkling, and now and then a shooting star. `k` is how far
 * night has fallen.
 */
export function nightSky(g: CanvasRenderingContext2D, tw: number[], W: number, hz: number, t: number, k: number): void {
  if (k <= 0) return;
  // Shooting stars first: in this mode what is drawn first stays in front.
  const T = 6.5, ph = t / T, n = Math.floor(ph), f = (ph - n) * T;
  if (hash(n, 0, 621) < 0.4 && f < 0.6) {
    const q = f / 0.6, right = hash(n, 1, 621) < 0.5;
    const ang = 0.25 + hash(n, 2, 621) * 0.35, dx = (right ? -1 : 1) * Math.cos(ang), dy = Math.sin(ang);
    const len = 50 + hash(n, 3, 621) * 70;
    const x0 = W * (0.15 + hash(n, 4, 621) * 0.7), y0 = hz * (0.05 + hash(n, 5, 621) * 0.4);
    const hx = x0 + dx * len * q, hy = y0 + dy * len * q, fade = Math.sin(q * Math.PI) * k;
    g.fillStyle = '#ffffff';
    g.globalAlpha = fade;
    g.fillRect(Math.round(hx), Math.round(hy), 1, 1);
    g.fillStyle = '#c8d8ff';
    const trail = Math.min(len * q, 18);
    for (let s = 1; s < trail; s++) {
      g.globalAlpha = fade * (1 - s / trail) * 0.75;
      g.fillRect(Math.round(hx - dx * s), Math.round(hy - dy * s), 1, 1);
    }
  }
  g.fillStyle = '#eef2ff';
  for (let i = 0, j = 0; i < tw.length; i += 3, j++) {
    const s = Math.sin(t * (0.7 + (j % 5) * 0.31) + j * 2.17);
    const a = (0.5 + 0.5 * s) * k, x = tw[i], y = tw[i + 1];
    g.globalAlpha = 0.25 * k + 0.75 * a;
    g.fillRect(x, y, 1, 1);
    if (tw[i + 2] < 2 || s < 0.2) continue;
    g.globalAlpha = a * 0.4;
    g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); g.fillRect(x, y + 1, 1, 1);
  }
  g.globalAlpha = 1;
}

/** Embers rising off a fire bowl at (x, y) and blowing away downwind; additive, `k` their strength. */
export function embers(g: CanvasRenderingContext2D, x: number, y: number, t: number, k: number, seed: number): void {
  for (let i = 0; i < 7; i++) {
    const ph = (t * (0.38 + (i % 3) * 0.07) + i / 7 + seed * 0.13) % 1;
    const ex = Math.round(x + Math.sin(t * 1.7 + i * 2.3 + seed) * 2.5 - ph * ph * 22);
    const ey = Math.round(y - ph * 38);
    g.globalAlpha = k * (1 - ph) * (0.55 + 0.45 * Math.sin(t * 13 + i * 5));
    g.fillStyle = ph < 0.35 ? '#ffe08a' : '#ff8a3a';
    g.fillRect(ex, ey, 1, 1);
  }
  g.globalAlpha = 1;
}

/**
 * Sand kicked up by a fighter at `x` (metres): `land` for a landing or a fall
 * (a low ring of dust both ways), `dodge` for an evade or dash pushing off
 * (`dir` = which way they go), `wall` for a body slammed into the arena's end.
 * The dust leans downwind (to the left).
 */
export function kickSand(fx: Fx, sand: number[], x: number, how: 'land' | 'dodge' | 'wall', dir = 0, k = 1): void {
  const [, mid, light, pale] = sand;
  const n = (c: number) => Math.max(1, Math.round(c * k));
  if (how === 'land') {
    for (const side of [-1, 1]) {
      fx.burst({ x: x + side * 0.25, y: 0.1, count: n(5), jitter: 0.15, jitterY: 0.05, dir: side > 0 ? 0.15 : Math.PI - 0.15, spread: 0.2, speed: [1.8, 3.6 + (side < 0 ? 1.2 : 0)], life: [0.4, 0.7], color: pale, color2: mid, kind: 'smoke', size: 4, drag: 2.4 });
    }
    fx.burst({ x, y: 0.1, count: n(8), jitter: 0.35, dir: Math.PI / 2 + 0.35, spread: 0.6, speed: [1.5, 3.5], life: [0.25, 0.5], color: pale, color2: mid, gravity: 9 });
    return;
  }
  if (how === 'dodge') {
    // Thrown out behind the push-off, then carried off on the wind.
    const back = dir > 0 ? Math.PI : 0;
    fx.burst({ x: x - dir * 0.2, y: 0.12, count: n(6), jitter: 0.2, jitterY: 0.06, dir: back + (dir > 0 ? -0.2 : 0.2), spread: 0.3, speed: [1.4, 3.2], life: [0.45, 0.75], color: pale, color2: mid, kind: 'smoke', size: 4, drag: 2.2 });
    fx.burst({ x: x - dir * 0.1, y: 0.1, count: n(7), jitter: 0.25, dir: back + (dir > 0 ? -0.6 : 0.6), spread: 0.4, speed: [1.5, 3.6], life: [0.3, 0.55], color: pale, color2: mid, gravity: 8 });
    fx.burst({ x, y: 0.3, count: n(3), jitter: 0.3, jitterY: 0.2, dir: Math.PI, spread: 0.08, speed: [3, 5], life: [0.25, 0.45], color: pale, color2: light, kind: 'streak', drag: 1.5 });
    return;
  }
  fx.burst({ x, y: 0.5, count: n(9), jitter: 0.25, jitterY: 0.5, dir: Math.PI / 2, spread: 1.2, speed: [0.6, 2], life: [0.6, 1], color: pale, color2: mid, kind: 'smoke', size: 4, drag: 1.4 });
  fx.burst({ x, y: 1.2, count: n(10), jitter: 0.2, jitterY: 0.8, dir: -Math.PI / 2, spread: 0.4, speed: [0.5, 2], life: [0.4, 0.8], color: pale, color2: mid, gravity: 10 });
}
