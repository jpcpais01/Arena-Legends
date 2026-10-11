import type { SkinRarity } from '../character/skins';
import { SceneGl, type Glow } from './sceneGl';

/**
 * The moonlit grove and its chest, painted on one low-res canvas (one art
 * pixel = `k` CSS pixels) and shown through the shader layer (bloom,
 * shockwaves, light, camera push-in), or as it is where WebGL2 is missing.
 *
 * The grove: a waterfall falling from a mossy cliff into a pool under the
 * moon, two ancient trees, a canopy with vines, stone lanterns, flowers,
 * fireflies and drifting petals, and the chest on a mossy stone dais. The
 * whole scene travels with the chest, so when an opening starts the camera
 * pans to put it centre stage. Two chests: the wooden one for single pulls
 * and the grand one for ten.
 */

/** Tier light: [deep, bright]. Epic cycles the rainbow instead. */
export const TIER_LIGHT: Record<SkinRarity, [string, string]> = {
  rare: ['#2f7cff', '#bfe0ff'],
  mythic: ['#9a4aff', '#e6ccff'],
  legendary: ['#ff9a1a', '#fff0a0'],
  epic: ['#7ff0e0', '#ffffff'],
};
const RAINBOW = ['#ffd860', '#ff7ac8', '#b07aff', '#7ad8ff', '#7ff0e0'];
const TIERS: SkinRarity[] = ['rare', 'mythic', 'legendary', 'epic'];

const INK = '#0a0612';
const W = 52; // chest width (art px)
const BODY_H = 24;
const LID_H = 18;
const GOLD = ['#7a420e', '#b06c1e', '#f2b542', '#ffe58f'];
const FIRE = ['#8a1a0a', '#d8400e', '#ff8a1a', '#ffd24a', '#fff6c8'];

export type ChestLook = 'wood' | 'grand';
interface Look { wood: string[]; gem: string; studs: string[] }
const LOOKS: Record<ChestLook, Look> = {
  wood: { wood: ['#3a1e14', '#5e3320', '#7d4a2a', '#9c6436'], gem: '#b09aff', studs: [] },
  grand: { wood: ['#1a1034', '#2a1c52', '#3e2d78', '#5844a2'], gem: '#7ff0e0', studs: ['#ff5a9a', '#7ad8ff', '#ffd860'] },
};

/** Runes carved in the chest's planks (5x5), lit from inside while it charges. */
const GLYPHS = [
  ['..#..', '.###.', '#.#.#', '..#..', '.#.#.'],
  ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  ['.###.', '#...#', '#.#.#', '#...#', '.###.'],
  ['##.##', '#...#', '..#..', '#...#', '##.##'],
];
const RUNE_AT: [number, number, number][] = [[11, 9, 0], [36, 9, 1], [11, 16, 2], [36, 16, 3]];

interface Part { x: number; y: number; vx: number; vy: number; t: number; life: number; col: string; s: number; g: number; star: boolean; coin?: boolean; floor?: number; to?: { x: number; y: number } }
interface Ring { r: number; v: number; t: number; life: number; col: string; x?: number; y?: number }

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

/** Draws pixel art with rects; metal pixels also go to a mask (for the glint). */
function sprite(w: number, h: number, draw: (px: Px) => void): { art: HTMLCanvasElement; mask: HTMLCanvasElement } {
  const art = document.createElement('canvas');
  const mask = document.createElement('canvas');
  art.width = mask.width = w; art.height = mask.height = h;
  const g = art.getContext('2d')!, m = mask.getContext('2d')!;
  m.fillStyle = '#fff';
  draw((x, y, ww, hh, col) => {
    g.fillStyle = col; g.fillRect(x, y, ww, hh);
    if (GOLD.includes(col)) m.fillRect(x, y, ww, hh); else m.clearRect(x, y, ww, hh);
  });
  return { art, mask };
}

function bodyArt(lk: Look) {
  const WD = lk.wood;
  return sprite(W, BODY_H, (px) => {
    px(0, 0, W, BODY_H, INK);
    px(1, 1, W - 2, BODY_H - 2, WD[2]);
    for (const y of [1, 8, 15]) { px(1, y, W - 2, 1, WD[3]); if (y > 1) px(1, y - 1, W - 2, 1, WD[0]); }
    px(1, BODY_H - 4, W - 2, 2, WD[1]);
    // Wood grain flecks.
    for (let i = 0; i < 14; i++) px(3 + ((i * 37) % (W - 6)), 4 + ((i * 11) % 15), 2, 1, WD[1]);
    // Carved runes.
    for (const [x, y, gi] of RUNE_AT) GLYPHS[gi].forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') px(x + c, y + r - 4, 1, 1, WD[0]); }));
    // Gold rims.
    px(1, 1, W - 2, 3, GOLD[2]); px(1, 1, W - 2, 1, GOLD[3]); px(1, 4, W - 2, 1, GOLD[0]);
    px(1, BODY_H - 3, W - 2, 2, GOLD[1]); px(1, BODY_H - 3, W - 2, 1, GOLD[2]);
    // Corner bands with rivets (and jewels on the grand chest).
    for (const x of [1, W - 8]) {
      px(x, 1, 7, BODY_H - 2, GOLD[1]); px(x + 1, 1, 5, BODY_H - 2, GOLD[2]); px(x + 1, 1, 1, BODY_H - 2, GOLD[3]); px(x + 6, 1, 1, BODY_H - 2, GOLD[0]);
      for (const y of [7, 15]) { px(x + 2, y, 3, 3, GOLD[0]); px(x + 2, y, 2, 2, GOLD[3]); }
      if (lk.studs.length) { px(x + 2, 11, 3, 3, INK); px(x + 3, 11, 1, 2, lk.studs[x > 10 ? 1 : 0]); px(x + 2, 11, 1, 1, '#ffffff'); }
    }
    // Lock plate and keyhole.
    px(20, 2, 12, 14, INK);
    px(21, 3, 10, 12, GOLD[2]); px(21, 3, 10, 1, GOLD[3]); px(21, 14, 10, 1, GOLD[0]); px(30, 3, 1, 12, GOLD[1]);
    px(25, 6, 2, 2, INK); px(25, 8, 2, 4, INK); px(24, 10, 4, 1, INK);
    if (lk.studs.length) { px(22, 4, 2, 2, lk.studs[2]); px(28, 4, 2, 2, lk.studs[2]); }
  });
}

function lidArt(lk: Look) {
  const WD = lk.wood;
  return sprite(W, LID_H, (px) => {
    const inset = [6, 4, 2, 1, 1];
    for (let y = 0; y < LID_H; y++) {
      const i = inset[y] ?? 0;
      px(i, y, W - i * 2, 1, INK);
      if (y > 0 && y < LID_H - 1) {
        const j = Math.max(i, inset[y - 1] ?? 0, inset[y + 1] ?? 0) + 1;
        px(j, y, W - j * 2, 1, y < 3 ? WD[3] : y < 9 ? WD[2] : WD[1]);
      }
    }
    px(4, 5, W - 8, 1, WD[1]); px(2, 10, W - 4, 1, WD[0]);
    for (let i = 0; i < 8; i++) px(6 + ((i * 29) % (W - 12)), 3 + ((i * 7) % 8), 2, 1, WD[1]);
    for (const x of [7, W - 12]) {
      px(x, 1, 5, LID_H - 2, GOLD[1]); px(x + 1, 1, 3, LID_H - 2, GOLD[2]); px(x + 1, 1, 1, LID_H - 2, GOLD[3]);
      if (lk.studs.length) { px(x + 1, 6, 3, 3, INK); px(x + 2, 6, 1, 2, lk.studs[x > 10 ? 0 : 1]); }
    }
    px(1, LID_H - 5, W - 2, 3, GOLD[2]); px(1, LID_H - 5, W - 2, 1, GOLD[3]); px(1, LID_H - 2, W - 2, 1, GOLD[0]);
    // Hasp over the lock, and the jewel socket on top (lit live).
    px(23, LID_H - 7, 6, 7, INK); px(24, LID_H - 6, 4, 5, GOLD[2]); px(24, LID_H - 6, 4, 1, GOLD[3]);
    px(21, 0, 10, 6, INK); px(22, 1, 8, 4, GOLD[1]);
  });
}

/** Pixel ellipse, filled. */
function ellipse(px: Px, cx: number, cy: number, rx: number, ry: number, col: string): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
    px(cx - hw, cy + dy, hw * 2, 1, col);
  }
}

const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

/** Pixel disc, filled. */
function disc(px: Px, cx: number, cy: number, r: number, col: string): void {
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
    px(cx - hw, cy + dy, hw * 2, 1, col);
  }
}

const FLOWERS = ['#ff8ac8', '#f4f0ff', '#ffd860', '#7ad8ff', '#c89aff'];
const MOSS = ['#1f4a2a', '#2e5a34', '#3e7a3c', '#5a9a48'];
const STONE = ['#26302f', '#36423f', '#4a5853', '#62706a'];

/**
 * The grove, drawn once per size: a moonlit forest glade with a waterfall
 * spilling from a mossy cliff into a pool, two ancient trees framing it,
 * a canopy with hanging vines, mountains under the moon, stone lanterns,
 * flowers, ferns and glowing mushrooms, and the chest on a mossy stone dais.
 * The chest stands at (ax, ay); the room is twice the screen each way so it
 * covers it wherever the chest goes.
 */
function roomArt(sw: number, sh: number): { c: HTMLCanvasElement; ax: number; ay: number } {
  const RW = sw * 2 + 120, RH = sh * 2;
  const c = document.createElement('canvas');
  c.width = RW; c.height = RH;
  const g = c.getContext('2d')!;
  const px: Px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const X = Math.round(RW / 2), Y = sh, seam = Y - 16;

  // Night sky, stars, the moon.
  const sky = g.createLinearGradient(0, seam - 190, 0, seam - 20);
  sky.addColorStop(0, '#050d18');
  sky.addColorStop(0.6, '#0e2632');
  sky.addColorStop(1, '#1b3f46');
  g.fillStyle = sky; g.fillRect(0, 0, RW, seam);
  for (let i = 0; i < 260; i++) {
    const x = hash(i * 3.7) * RW, y = seam - 60 - hash(i * 9.1) * 200;
    px(x, y, 1, 1, hash(i) > 0.85 ? '#ffffff' : '#7a98b0');
  }
  const mx = X - 46, my = seam - 64;
  const halo = g.createRadialGradient(mx, my, 10, mx, my, 70);
  halo.addColorStop(0, 'rgba(200, 236, 220, 0.35)');
  halo.addColorStop(1, 'rgba(200, 236, 220, 0)');
  g.fillStyle = halo; g.fillRect(mx - 70, my - 70, 140, 140);
  disc(px, mx, my, 11, '#e6f2da');
  disc(px, mx + 2, my - 2, 9, '#f6fbee');
  for (const [dx, dy, r] of [[-4, 3, 3], [4, 5, 2], [-1, -6, 2], [6, -2, 1]] as const) disc(px, mx + dx, my + dy, r, '#cfdcc4');

  // Mountains, two layers.
  for (const [base, amp, col, f] of [[seam - 34, 18, '#10243a', 0.021], [seam - 22, 10, '#14323a', 0.034]] as const) {
    for (let x = 0; x < RW; x++) {
      const hgt = amp * (0.6 + 0.4 * Math.sin(x * f + base) + 0.25 * Math.sin(x * f * 2.7 + 1.3) + 0.12 * Math.sin(x * f * 6.1));
      px(x, base - hgt, 1, seam - base + hgt, col);
    }
  }
  // Far trees in silhouette.
  for (let i = 0; i < 26; i++) {
    const tx = hash(i * 5.3) * RW;
    if (Math.abs(tx - X) < 70) continue;
    const th = 26 + hash(i * 2.1) * 34;
    px(tx - 3, seam - th, 6, th, '#0d211d');
    for (let k = 0; k < 4; k++) disc(px, tx + (hash(i + k) - 0.5) * 18, seam - th - 4 + k * 8, 9 + Math.round(hash(i * 7 + k) * 6), '#0f2620');
  }

  // The cliff and its waterfall.
  for (const s of [-1, 1]) {
    for (let x = 0; x < 48; x++) {
      const cx = X + s * (15 + x);
      const top = seam - 62 + Math.round(x * 0.5 + Math.sin(x * 0.7 + s) * 2.5 + (x > 30 ? (x - 30) * 1.6 : 0));
      px(cx, top, 1, seam - top, STONE[1]);
      // Rock strata and cracks.
      for (let y = top + 4 + Math.floor(hash(x * 0.7) * 5); y < seam; y += 5 + Math.floor(hash(x + y) * 6)) px(cx, y + Math.round(Math.sin(x * 0.3) * 2), 1 + (hash(y * x) > 0.6 ? 1 : 0), 1, STONE[0]);
      if (hash(x * 1.9 + s) > 0.82) px(cx, top + 4, 1, Math.round(hash(x * 5) * 14), STONE[0]);
      if (hash(x * 3.3 + s) > 0.86) px(cx, top + 2, 1, 6 + Math.round(hash(x) * 18), STONE[2]);
      px(cx, top, 1, 2, MOSS[2]); px(cx, top + 2, 1, 1, MOSS[1]);
      if (hash(x * 3 + s) > 0.7) px(cx, top + 3, 1, 3 + Math.floor(hash(x) * 6), MOSS[1]);
    }
  }
  px(X - 15, seam - 64, 30, 64, '#2f6d8c');
  for (let x = X - 14; x < X + 15; x += 2) px(x, seam - 63, 1, 63, hash(x) > 0.5 ? '#4a92b0' : '#3a7e9e');
  px(X - 16, seam - 65, 32, 2, '#d8f0f8');
  for (const s of [-1, 1]) { px(X + s * 16 - (s < 0 ? 4 : 0), seam - 66, 5, 3, MOSS[2]); px(X + s * 18 - (s < 0 ? 2 : 0), seam - 67, 3, 1, MOSS[3]); }
  // The pool below.
  ellipse(px, X, seam + 1, 44, 6, '#163e52');
  ellipse(px, X, seam, 40, 5, '#1e5470');
  for (let i = 0; i < 9; i++) px(X - 30 + i * 7, seam - 1 + (i % 3), 4, 1, '#4a92b0');

  // Two ancient trees framing the glade.
  for (const s of [-1, 1]) {
    const cx = X + s * 98;
    px(cx - 12, 0, 24, seam + 4, '#1a120e');
    px(cx - 11, 0, 22, seam + 4, '#2a1d18');
    px(cx - 11, 0, 4, seam + 4, '#3d2a20');
    px(cx + 6, 0, 5, seam + 4, '#1d140f');
    for (let x = cx - 5; x < cx + 6; x += 4) for (let y = 0; y < seam; y += 1) if (hash(x * 13 + y * 0.3) > 0.35) px(x, y, 1, 1, '#22170f');
    for (let i = 0; i < 10; i++) {
      const my2 = seam - 20 - hash(i * 3 + s) * 120;
      px(cx - 11 + Math.round(hash(i + s * 9) * 10), my2, 4 + Math.round(hash(i) * 5), 2 + Math.round(hash(i * 2) * 3), MOSS[1]);
    }
    // Roots flaring into the ground.
    for (const r of [-1, 1]) {
      for (let i = 0; i < 22; i++) {
        const rx = cx + r * (10 + i), ry = seam + 4 - Math.round(Math.max(0, 10 - i * 0.6));
        px(rx, ry, 1, seam + 6 - ry, i < 12 ? '#2a1d18' : '#22170f');
        px(rx, ry, 1, 1, '#3d2a20');
      }
    }
    // A hollow with glowing mushrooms at its foot.
    for (const [mxx, h2] of [[-16, 3], [-12, 5], [-8, 2], [14, 4], [18, 2]] as const) {
      const fx = cx + mxx * (s > 0 ? -1 : 1);
      px(fx, seam + 4 - h2, 1, h2, '#d8e4d0');
      px(fx - 2, seam + 3 - h2, 5, 2, '#2a8a9a'); px(fx - 1, seam + 3 - h2, 3, 1, '#7ae8f0');
    }
  }
  // The canopy: layered leaf clumps, sagging toward the sides, open over the moon.
  for (const [col, n, off] of [['#0b1d12', 70, 0], ['#12301c', 70, 4], ['#1a4426', 60, 7], ['#245a30', 46, 10]] as const) {
    for (let i = 0; i < n; i++) {
      const dx = (hash(i * 7.7 + off) - 0.5) * RW;
      const ad = Math.abs(dx);
      if (ad < 90 && hash(i + off) > 0.12) continue;
      const cy = seam - 118 + Math.min(1, ad / 200) * 56 + (hash(i * 3.3 + off) - 0.5) * 24 - off;
      disc(px, X + dx, cy, 10 + Math.round(hash(i * 1.9 + off) * 14), col);
    }
  }
  for (let i = 0; i < 90; i++) {
    const dx = (hash(i * 4.1 + 2) - 0.5) * RW, ad = Math.abs(dx);
    if (ad < 50) continue;
    const cy = seam - 104 + Math.min(1, ad / 200) * 56 + (hash(i * 2.9) - 0.5) * 24;
    px(X + dx, cy, 2, 1, MOSS[3]);
  }
  // Vines hanging from the canopy.
  for (let i = 0; i < 26; i++) {
    const dx = (hash(i * 6.3 + 1) - 0.5) * RW * 0.9, ad = Math.abs(dx);
    if (ad < 34) continue;
    const top = seam - 100 + Math.min(1, ad / 200) * 50;
    const len = 12 + hash(i * 2.2) * 30;
    for (let y = 0; y < len; y++) {
      const vx = X + dx + Math.round(Math.sin(y * 0.18 + i) * 1.5);
      px(vx, top + y, 1, 1, MOSS[1]);
      if (y % 5 === 2) px(vx + (y % 10 < 5 ? 1 : -2), top + y, 2, 1, MOSS[2]);
    }
    if (hash(i * 9) > 0.6) px(X + dx - 1, top + len, 3, 2, FLOWERS[i % FLOWERS.length]);
  }

  // The glade floor: grass and moss, tufts, flowers.
  px(0, seam + 4, RW, RH - seam, '#132a18');
  const bands = ['#162e1a', '#18331c', '#1b371e', '#1d3b20', '#203f22'];
  for (let i = 0, y = seam + 6; y < RH; i++) { px(0, y, RW, 4 + i * 2, bands[Math.min(bands.length - 1, i)]); y += 4 + i * 2; }
  px(0, seam + 3, RW, 2, MOSS[1]);
  for (let i = 0; i < 700; i++) {
    const x = hash(i * 1.37) * RW, y = seam + 4 + hash(i * 2.71) ** 1.4 * (RH - seam - 4);
    const d = (y - seam) / 60;
    const col = MOSS[1 + Math.floor(hash(i * 5.1) * 3)];
    px(x, y - 1 - d, 1, 1 + d, col);
    px(x + 1 + d, y - 2 - d, 1, 2 + d, col);
    px(x - 1 - d, y - 1, 1, 1 + d * 0.5, col);
  }
  for (let i = 0; i < 260; i++) {
    const x = hash(i * 8.17) * RW, y = seam + 5 + hash(i * 4.33) ** 1.2 * (RH - seam - 6);
    if (Math.abs(x - X) < 56 && y < Y + 14) continue;
    const col = FLOWERS[Math.floor(hash(i * 3.3) * FLOWERS.length)];
    px(x, y, 1, 2, MOSS[2]);
    px(x - 1, y - 1, 3, 1, col); px(x, y - 2, 1, 3, col); px(x, y - 1, 1, 1, '#fff6c8');
  }
  // Ferns at the tree roots.
  for (const s of [-1, 1]) for (const o of [-30, 26]) {
    const fx = X + s * 98 + o, fy = seam + 8;
    for (let f = -3; f <= 3; f++) for (let k = 0; k < 10; k++) px(fx + f * k * 0.7, fy - k * (1 - Math.abs(f) * 0.12) - Math.abs(f), 1, 1, k > 6 ? MOSS[3] : MOSS[2]);
  }

  // Light falloff: deep shade under the canopy and out to the sides, the dais in a pool of moonlight.
  const up = g.createLinearGradient(0, seam - 120, 0, seam - 50);
  up.addColorStop(0, 'rgba(3, 8, 8, 0.45)');
  up.addColorStop(1, 'rgba(3, 8, 8, 0)');
  g.fillStyle = up; g.fillRect(0, 0, RW, seam);
  const pool = g.createRadialGradient(X, seam - 10, 34, X, seam - 10, sw * 0.95);
  pool.addColorStop(0, 'rgba(3, 8, 10, 0)');
  pool.addColorStop(1, 'rgba(3, 8, 10, 0.68)');
  g.fillStyle = pool; g.fillRect(0, 0, RW, RH);

  // The dais: a round, mossy stone with a ring of tiny flowers.
  ellipse(px, X, Y + 4, 52, 11, INK);
  ellipse(px, X, Y + 3, 51, 10, STONE[0]);
  ellipse(px, X, Y, 51, 10, INK);
  ellipse(px, X, Y, 50, 9, STONE[1]);
  ellipse(px, X, Y - 1, 46, 7, STONE[2]);
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    if (hash(i * 2.3) > 0.45) px(X + Math.cos(a) * 50, Y + Math.sin(a) * 9 + 1, 2, 1, MOSS[1 + (i % 2)]);
    if (i % 9 === 0) px(X + Math.cos(a) * 40, Y + Math.sin(a) * 6.5, 1, 1, FLOWERS[i % FLOWERS.length]);
  }
  for (let i = 0; i < 30; i++) px(X + (hash(i * 3.1) - 0.5) * 80, Y - 4 + hash(i * 1.7) * 6, 2, 1, STONE[3]);
  // Coin piles spilled at the dais' feet.
  for (const [s, big] of [[-1, 1], [1, 0.8]] as const) {
    const cx = X + s * 46, cy = Y + 10;
    const rows = [15, 13, 10, 7, 4].map((n) => Math.round(n * big));
    rows.forEach((n, r) => { px(cx - n / 2 - 1, cy - r * 2 - 1, n + 2, 3, INK); });
    rows.forEach((n, r) => {
      px(cx - n / 2, cy - r * 2, n, 2, GOLD[1]);
      for (let i = 0; i < n; i += 2) px(cx - n / 2 + i, cy - r * 2, 1, 1, hash(i + r * 5 + s) > 0.5 ? GOLD[3] : GOLD[2]);
    });
    px(cx + s * 9, cy + 1, 3, 2, INK); px(cx + s * 9, cy + 1, 2, 1, s < 0 ? '#ff5a9a' : '#7ad8ff');
  }
  // Stone lanterns, moss on their caps.
  for (const s of [-1, 1]) {
    const bx = X + s * 66, by = seam + 6;
    px(bx - 6, by - 4, 13, 5, INK); px(bx - 5, by - 3, 11, 3, STONE[1]); px(bx - 5, by - 3, 11, 1, STONE[2]);
    px(bx - 3, by - 20, 7, 17, INK); px(bx - 2, by - 20, 5, 17, STONE[1]); px(bx - 2, by - 20, 1, 17, STONE[3]);
    px(bx - 9, by - 26, 19, 7, INK); px(bx - 8, by - 25, 17, 5, STONE[2]); px(bx - 8, by - 25, 17, 1, STONE[3]);
    px(bx - 8, by - 21, 17, 1, STONE[0]);
    px(bx - 7, by - 27, 15, 2, '#3a1a06');
    for (const mx2 of [-8, -5, 4, 7]) px(bx + mx2, by - 21, 2, 1 + (mx2 & 1), MOSS[2]);
    px(bx - 3, by - 6, 2, 3, MOSS[1]);
  }
  return { c, ax: X, ay: Y };
}

export class ChestFx {
  /** The art canvas everything is painted on. */
  readonly src: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private readonly gl: SceneGl;
  private sprites: Record<ChestLook, { body: ReturnType<typeof bodyArt>; lid: ReturnType<typeof lidArt> }>;
  private room: ReturnType<typeof roomArt> | null = null;
  private glint = document.createElement('canvas');
  look: ChestLook = 'wood';
  /** CSS px per art px; canvas size in art px. */
  k = 3;
  w = 0;
  h = 0;
  private home = { x: 0, y: 0 };
  private at = { x: 0, y: 0 };
  private center = false;
  private t = 0;

  tier: SkinRarity | null = null;
  glow = 0;
  shake = 0;
  /** Steps of the charge so far (lights the rune ring). */
  private steps = 0;
  private lidT = -1;
  private gone = 0;
  private goneV = 0;
  rays = 0;
  rayTier: SkinRarity = 'rare';
  private flash = 0;
  private flashCol = '#ffffff';
  dim = 0;
  private dimTarget = 0;
  private beam = 0;
  private beamTarget = 0;
  private beamLight: Glow | null = null;
  private starfall = 0;
  /** Light being drawn into the chest before it bursts. */
  private gathering = 0;
  private halo: { x: number; y: number; r: number; tier: SkinRarity } | null = null;
  private haloT = 0;
  private haloLight: Glow | null = null;
  private parts: Part[] = [];
  private rings: Ring[] = [];
  private moteT = 0;
  /** Idle: a little hop now and then, and a glint across the gold. */
  idle = true;
  private hopT = 1.2;
  private glintT = 0.8;
  private zoom = 1;
  private zoomBase = 1;
  private punch = 0;
  private raf = 0;
  private last = 0;

  constructor() {
    this.src = document.createElement('canvas');
    this.src.className = 'chest-fx';
    this.g = this.src.getContext('2d')!;
    this.sprites = {
      wood: { body: bodyArt(LOOKS.wood), lid: lidArt(LOOKS.wood) },
      grand: { body: bodyArt(LOOKS.grand), lid: lidArt(LOOKS.grand) },
    };
    this.glint.width = W; this.glint.height = BODY_H + LID_H;
    this.gl = new SceneGl(this.src);
    this.gl.canvas.className = 'chest-fx';
    this.gl.vignette = { col: '#000000', k: 0.45 };
    this.gl.onLost = () => { this.gl.canvas.replaceWith(this.src); };
  }

  /** The element to put on screen. */
  get canvas(): HTMLCanvasElement {
    return this.gl.ok ? this.gl.canvas : this.src;
  }

  /** Sizes the canvases to their box; the chest stands about a third of the height. */
  resize(): void {
    const r = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.k = Math.max(2, Math.floor((r.height * 0.34) / (BODY_H + LID_H)));
    this.w = Math.ceil(r.width / this.k);
    this.h = Math.ceil(r.height / this.k);
    this.src.width = this.w;
    this.src.height = this.h;
    this.src.style.width = `${this.w * this.k}px`;
    this.src.style.height = `${this.h * this.k}px`;
    this.gl.resize(this.k);
    this.room = roomArt(this.w, this.h);
  }

  /** Where the chest rests: bottom centre of an element's box. */
  anchor(el: HTMLElement): void {
    const c = this.canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!r.width) return;
    this.home = { x: Math.round((r.left + r.width / 2 - c.left) / this.k), y: Math.round((r.bottom - c.top) / this.k) - 4 };
    if (!this.at.x) this.at = { ...this.home };
  }

  /** Art-px point for a screen element's centre. */
  pointOf(el: Element): { x: number; y: number } {
    const c = this.canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - c.left) / this.k, y: (r.top + r.height / 2 - c.top) / this.k };
  }

  /** The camera pans to put the chest centre stage (or back home). */
  setCentered(on: boolean): void {
    this.center = on;
    this.idle = !on;
    this.dimTarget = on ? 0.35 : 0;
    this.gl.vignette.k = on ? 0.75 : 0.45;
  }

  reset(): void {
    this.lidT = -1;
    this.gone = 0;
    this.goneV = 0;
    this.glow = 0;
    this.tier = null;
    this.steps = 0;
    this.shake = 0;
    this.rays = 0;
    this.beam = 0;
    this.beamTarget = 0;
    this.gathering = 0;
    this.starfall = 0;
    this.zoomBase = 1;
    this.halo = null;
    this.parts.length = 0;
    this.rings.length = 0;
    this.gl.clear();
    this.beamLight = this.haloLight = null;
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw();
      if (this.gl.ok) {
        const m = this.mouth;
        this.gl.cam = { x: m.x, y: m.y - 8, zoom: this.zoom };
        this.gl.render(dt);
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.gl.clear();
  }

  /** Chest top (where the light comes out), art px. */
  get mouth(): { x: number; y: number } {
    return { x: this.at.x, y: this.at.y - BODY_H };
  }

  color(tier: SkinRarity, bright = false, i = 0): string {
    if (tier === 'epic') return RAINBOW[(i + Math.floor(this.t * 6)) % RAINBOW.length];
    return TIER_LIGHT[tier][bright ? 1 : 0];
  }

  /** A steady colour for shader light (epic: its teal and white). */
  private hue(tier: SkinRarity, bright: boolean): string {
    return TIER_LIGHT[tier][bright ? 1 : 0];
  }

  /** A tier step during the charge: the chest jumps, light rings out, the room shudders. */
  pulse(tier: SkinRarity): void {
    this.tier = tier;
    this.steps++;
    this.flashOnce(this.color(tier, true), 0.18);
    const m = this.mouth;
    this.rings.push({ r: 6, v: 90, t: 0, life: 0.5, col: this.color(tier, true) });
    // Rune ring on the dais: a ring of light racing outward on the floor.
    this.rings.push({ x: this.at.x, y: this.at.y, r: 20, v: 140, t: 0, life: 0.55, col: this.color(tier, true) });
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 40 + Math.random() * 70;
      this.spark(m.x + (Math.random() - 0.5) * W, m.y, Math.cos(a) * v, Math.sin(a) * v, this.color(tier, i % 2 === 0, i), 0.5 + Math.random() * 0.4, 90, i % 5 === 0);
    }
    const n = TIERS.indexOf(tier);
    this.gl.shock(m.x, m.y, 40 + n * 14, 1.6 + n * 0.5, 0.6, this.hue(tier, true));
    this.gl.add({ kind: 'glow', x: m.x, y: m.y, r0: 16, r1: 30 + n * 6, hi: this.hue(tier, true), lo: this.hue(tier, false), power: 0.7, life: 0.7 });
    this.gl.split(0.8 + n * 0.4, 0.35);
    this.zoomBase = 1 + Math.min(0.12, this.steps * 0.03);
    this.punch = 0.035;
  }

  /** Light streams into the chest from all around (the moment before it blows). */
  gather(tier: SkinRarity): void {
    this.gathering = 1;
    this.tier = tier;
    const m = this.mouth;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 90;
      this.parts.push({ x: m.x + Math.cos(a) * r, y: m.y + Math.sin(a) * r * 0.7, vx: 0, vy: 0, t: -Math.random() * 0.3, life: 0.75, col: this.color(tier, Math.random() < 0.5, i), s: 1, g: 0, star: Math.random() < 0.25, to: m });
    }
    this.gl.add({ kind: 'glow', x: m.x, y: m.y, r0: 4, r1: 34, hi: this.hue(tier, true), lo: this.hue(tier, false), power: 1, life: 0.6, fin: 0.95 });
    this.gl.add({ kind: 'ring', x: m.x, y: m.y, r0: 90, r1: 4, w: 2, squash: 0.7, hi: this.hue(tier, true), lo: this.hue(tier, false), power: 0.6, life: 0.6, fin: 0.3 });
  }

  /** The lid blows off: flash, shockwaves, a fountain of sparks and gold, then rays. */
  burst(tier: SkinRarity): void {
    this.lidT = 0;
    this.gathering = 0;
    this.rayTier = tier;
    this.tier = tier;
    this.shake = 0;
    this.goneV = 1.6;
    this.flashOnce('#ffffff', 0.9);
    const m = this.mouth;
    const big = tier === 'epic' ? 2 : tier === 'legendary' ? 1.5 : 1;
    for (let i = 0; i < 3; i++) this.rings.push({ r: 4, v: 120 + i * 60, t: -i * 0.08, life: 0.7, col: this.color(tier, i === 0, i) });
    for (let i = 0; i < 90 * big; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 30 + Math.random() * 150 * big;
      this.spark(m.x, m.y, Math.cos(a) * v, Math.sin(a) * v - 40, this.color(tier, Math.random() < 0.5, i), 0.6 + Math.random() * 0.9, 60, Math.random() < 0.2);
    }
    // Gold spills out and bounces on the floor.
    for (let i = 0; i < 22 + 10 * big; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 70 + Math.random() * 90;
      this.parts.push({ x: m.x + (Math.random() - 0.5) * 20, y: m.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 1.8 + Math.random() * 0.8, col: GOLD[2 + (i & 1)], s: 2, g: 260, star: false, coin: true, floor: this.at.y + 2 + Math.random() * 12 });
    }
    const hi = this.hue(tier, true), lo = this.hue(tier, false);
    this.gl.shock(m.x, m.y, 150 * big, 5 * big, 0.9, hi);
    this.gl.shock(m.x, m.y, 70, 3, 0.5, '#ffffff');
    this.gl.add({ kind: 'flare', x: m.x, y: m.y, r0: 60, r1: 150 * big, w: 2.5, hi, lo, power: 1.2, life: 0.8 });
    this.gl.add({ kind: 'glow', x: m.x, y: m.y, r0: 30, r1: 70, hi, lo, power: 1, life: 1.1 });
    this.gl.add({ kind: 'rays', x: m.x, y: m.y - 4, r0: 60, r1: 200, hi, lo, power: 0.55, life: 2.6, seed: Math.random() * 50 });
    this.gl.zoomBlur(m.x, m.y, 0.28 * big, 0.45);
    this.gl.split(2.5 * big, 0.6);
    this.zoomBase = 1;
    this.punch = 0.1;
  }

  /** A burst of light at a point (a card being revealed); `big` for the best ones. */
  pop(x: number, y: number, tier: SkinRarity, n = 30): void {
    const big = tier === 'epic' ? 2 : 1;
    this.rings.push({ x, y, r: 3, v: 80 * big, t: 0, life: 0.45, col: this.color(tier, true) });
    for (let i = 0; i < n * big; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 20 + Math.random() * 90 * big;
      this.spark(x, y, Math.cos(a) * v, Math.sin(a) * v, this.color(tier, Math.random() < 0.5, i), 0.4 + Math.random() * 0.6, 40, Math.random() < 0.3);
    }
    const r = TIERS.indexOf(tier);
    this.gl.add({ kind: 'star', x, y, r0: 10 + r * 8, r1: 22 + r * 12, w: 0.8, hi: this.hue(tier, true), lo: this.hue(tier, false), power: 0.8 + r * 0.15, life: 0.5 + r * 0.1 });
    if (r >= 1) this.gl.shock(x, y, 26 + r * 14, 1.2 + r * 0.6, 0.5, this.hue(tier, true));
    if (tier === 'epic') this.flashOnce('#ffffff', 0.45);
  }

  /** The omen before a legendary or epic: darkness, then a pillar of light out of the chest. */
  omen(tier: SkinRarity): void {
    this.tier = tier;
    this.rayTier = tier;
    this.dimTarget = 0.85;
    this.beamTarget = 1;
    this.glow = 1;
    this.shake = 2.4;
    if (tier === 'epic') this.starfall = 1;
    for (let i = 0; i < 4; i++) this.rings.push({ r: 4, v: 160 + i * 50, t: -i * 0.12, life: 0.8, col: this.color(tier, true, i) });
    const m = this.mouth;
    this.gl.end(this.beamLight);
    this.beamLight = this.gl.add({ kind: 'beam', x: m.x, y: m.y, r0: m.y + 20, r1: m.y + 20, w: tier === 'epic' ? 16 : 12, rot: -Math.PI / 2, hi: this.hue(tier, true), lo: this.hue(tier, false), power: 1, life: 6, fin: 0.04, hold: true });
    this.gl.shock(m.x, m.y, 110, 3, 0.8, this.hue(tier, true));
    this.gl.vignette.k = 0.95;
    this.zoomBase = 1.14;
  }

  /** The tier name lands: an impact frame, a flash and a wide shockwave. */
  slam(tier: SkinRarity): void {
    this.flashOnce(this.color(tier, true), 0.5);
    const m = this.mouth;
    this.rings.push({ r: 10, v: 260, t: 0, life: 0.9, col: this.color(tier, true) });
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 160;
      this.spark(m.x, m.y - 30, Math.cos(a) * v, Math.sin(a) * v, this.color(tier, Math.random() < 0.5, i), 0.6 + Math.random() * 0.8, 50, Math.random() < 0.4);
    }
    this.gl.impact(this.hue(tier, true), INK, 0.09);
    this.gl.shock(m.x, m.y - 30, 200, 6, 1, this.hue(tier, true));
    this.gl.split(3, 0.5);
    this.punch = 0.08;
  }

  /** A legendary or epic card turning over: an impact frame and a shockwave from it. */
  impactAt(x: number, y: number, tier: SkinRarity): void {
    this.gl.impact(this.hue(tier, true), INK, tier === 'epic' ? 0.1 : 0.07);
    this.gl.shock(x, y, tier === 'epic' ? 170 : 120, tier === 'epic' ? 6 : 4, 0.8, this.hue(tier, true));
    this.gl.split(tier === 'epic' ? 3 : 2, 0.45);
    this.gl.add({ kind: 'flare', x, y, r0: 40, r1: 110, w: 2, hi: this.hue(tier, true), lo: this.hue(tier, false), power: 1, life: 0.6 });
    this.flashOnce(this.color(tier, true), 0.35);
  }

  /** Sparkles and a soft light around a revealed card; null stops them. */
  setHalo(el: Element | null, tier: SkinRarity = 'legendary'): void {
    this.gl.end(this.haloLight);
    this.haloLight = null;
    if (!el) { this.halo = null; return; }
    const p = this.pointOf(el), r = el.getBoundingClientRect();
    this.halo = { x: p.x, y: p.y, r: Math.max(r.width, r.height) / this.k / 2 + 3, tier };
    this.haloLight = this.gl.add({ kind: 'glow', x: p.x, y: p.y, r0: this.halo.r * 1.2, r1: this.halo.r * 1.5, hi: this.hue(tier, false), lo: this.hue(tier, false), power: 0.4, life: 9999, fin: 0.0001, hold: true });
  }

  /** A soft tier glow behind a screen element for a while (a revealed card). */
  glowAt(el: Element, tier: SkinRarity, life = 1.2): void {
    const p = this.pointOf(el), r = el.getBoundingClientRect();
    const R = Math.max(r.width, r.height) / this.k / 2;
    this.gl.add({ kind: 'glow', x: p.x, y: p.y, r0: R, r1: R * 1.6, hi: this.hue(tier, true), lo: this.hue(tier, false), power: 0.7, life });
    this.gl.add({ kind: 'rays', x: p.x, y: p.y, r0: R * 1.5, r1: R * 3, hi: this.hue(tier, true), lo: this.hue(tier, false), power: 0.45, life: life * 1.4, seed: Math.random() * 40 });
  }

  flashOnce(col: string, a: number): void {
    this.flashCol = col;
    this.flash = Math.max(this.flash, a);
  }

  /** Lets the dark and the beam go (the burst takes over). */
  release(): void {
    this.beamTarget = 0;
    this.starfall = 0;
    this.dimTarget = this.center ? 0.35 : 0;
    this.gl.end(this.beamLight);
    this.beamLight = null;
    this.gl.vignette.k = this.center ? 0.75 : 0.45;
  }

  private spark(x: number, y: number, vx: number, vy: number, col: string, life: number, g: number, star: boolean): void {
    if (this.parts.length > 460) this.parts.shift();
    this.parts.push({ x, y, vx, vy, t: 0, life, col, s: Math.random() < 0.3 ? 2 : 1, g, star });
  }

  private update(dt: number): void {
    this.t += dt;
    const target = this.center ? { x: Math.round(this.w / 2), y: Math.round(this.h * 0.7) } : this.home;
    const e = 1 - Math.exp(-dt * 7);
    this.at.x += (target.x - this.at.x) * e;
    this.at.y += (target.y - this.at.y) * e;
    this.dim += (this.dimTarget - this.dim) * (1 - Math.exp(-dt * 6));
    this.punch *= Math.exp(-dt * 7);
    this.zoom += (this.zoomBase + this.punch - this.zoom) * (1 - Math.exp(-dt * 10));
    if (this.lidT >= 0) this.lidT += dt;
    if (this.goneV) this.gone = Math.min(1, this.gone + dt * this.goneV);
    this.flash = Math.max(0, this.flash - dt * 2.6);
    this.beam += (this.beamTarget - this.beam) * (1 - Math.exp(-dt * (this.beamTarget > this.beam ? 5 : 3)));
    if (this.idle) {
      this.hopT -= dt;
      if (this.hopT < -0.5) this.hopT = 3 + Math.random() * 2;
      this.glintT -= dt;
      if (this.glintT < -0.6) this.glintT = 2.2 + Math.random();
    }
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
    // Motes drift up around the chest; thick with the tier colour while it charges.
    this.moteT -= dt;
    if (this.moteT <= 0 && this.gone < 1) {
      this.moteT = this.tier ? 0.025 : 0.1;
      const col = this.tier ? this.color(this.tier, Math.random() < 0.5) : Math.random() < 0.5 ? GOLD[3] : '#d8ff7a';
      this.spark(this.at.x + (Math.random() - 0.5) * (W + 24), this.at.y - Math.random() * 8, (Math.random() - 0.5) * 6, -10 - Math.random() * 18, col, 1.2 + Math.random(), -4, false);
    }
    for (const p of this.parts) {
      p.t += dt;
      if (p.t < 0) continue;
      if (p.to) {
        // Drawn in toward the chest, faster and faster.
        const k = Math.min(1, p.t / p.life);
        const pull = 1 - Math.exp(-dt * (2 + k * 14));
        p.x += (p.to.x - p.x) * pull;
        p.y += (p.to.y - p.y) * pull;
        continue;
      }
      p.vy += p.g * dt;
      p.vx *= 1 - dt * (p.coin ? 0.6 : 1.2);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.coin && p.floor !== undefined && p.y > p.floor && p.vy > 0) {
        p.y = p.floor;
        p.vy *= -0.42;
        p.vx *= 0.7;
        if (Math.abs(p.vy) < 12) { p.vy = 0; p.g = 0; p.vx = 0; }
      }
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const r of this.rings) { r.t += dt; if (r.t > 0) r.r += r.v * dt * (1 - r.t / r.life); }
    this.rings = this.rings.filter((r) => r.t < r.life);
  }

  private draw(): void {
    const g = this.g;
    const ax = Math.round(this.at.x), ay = Math.round(this.at.y);
    if (this.room) g.drawImage(this.room.c, ax - this.room.ax, ay - this.room.ay);
    else { g.fillStyle = '#0d0a16'; g.fillRect(0, 0, this.w, this.h); }
    this.drawAmbient(ax, ay);
    if (this.dim > 0.01) { g.fillStyle = `rgba(6, 3, 12, ${this.dim})`; g.fillRect(0, 0, this.w, this.h); }
    this.drawFlames(ax, ay);
    this.drawDais(ax, ay);

    const m = this.mouth;
    let hop = 0;
    if (this.idle && this.hopT < 0 && this.hopT > -0.5) hop = Math.round(Math.sin((-this.hopT / 0.5) * Math.PI) * 3);
    const sx = this.shake ? Math.round(Math.sin(this.t * 53) * this.shake * 2) : 0;
    const sy = this.shake ? Math.round(Math.abs(Math.sin(this.t * 37)) * -this.shake) : -hop;
    const x0 = Math.round(this.at.x - W / 2) + sx, y0 = Math.round(this.at.y - BODY_H) + sy;

    if (this.rays > 0.01) this.drawRays(m.x, m.y - 6);
    if (this.beam > 0.01) this.drawBeam(m.x, m.y);

    // Soft light behind the chest while it charges.
    if (this.tier && this.glow > 0.01 && this.gone < 1) {
      g.globalCompositeOperation = 'lighter';
      const rad = 30 + this.glow * 40 + Math.sin(this.t * 10) * 3 + this.gathering * 20;
      const grd = g.createRadialGradient(m.x, m.y, 2, m.x, m.y, rad);
      grd.addColorStop(0, this.color(this.tier, false));
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.5 * this.glow * (1 - this.gone);
      g.fillStyle = grd;
      g.fillRect(m.x - rad, m.y - rad, rad * 2, rad * 2);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }

    const sp = this.sprites[this.look];
    if (this.gone < 1) {
      g.globalAlpha = 1 - this.gone;
      g.fillStyle = 'rgba(0, 0, 0, 0.5)';
      const sh = hop ? 2 : 0;
      g.fillRect(x0 + 3 + sh, Math.round(this.at.y), W - 6 - sh * 2, 2);
      g.fillRect(x0 + 6 + sh, Math.round(this.at.y) + 2, W - 12 - sh * 2, 1);
      g.drawImage(sp.body.art, x0, y0);
      if (this.lidT < 0) {
        const lift = this.tier ? Math.round(this.glow * 2 * Math.abs(Math.sin(this.t * 22))) : hop > 1 ? 1 : 0;
        const ly = y0 - LID_H + 1 - lift;
        this.drawLid(sp.lid.art, x0, ly, 0, 1);
        if (this.tier && this.glow > 0) {
          // Light through the seam, the keyhole and the carved runes.
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = Math.min(1, this.glow * 1.3) * (1 - this.gone);
          g.fillStyle = this.color(this.tier, true);
          g.fillRect(x0 + 1, y0 - lift, W - 2, 1 + lift);
          g.fillRect(x0 + 25, y0 + 6, 2, 6);
          const lit = Math.min(RUNE_AT.length, this.steps);
          for (let i = 0; i < lit; i++) {
            const [rx, ry, gi] = RUNE_AT[i];
            g.fillStyle = this.color(this.tier, Math.sin(this.t * 16 + i) > 0, i);
            GLYPHS[gi].forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.fillRect(x0 + rx + c, y0 + ry + r - 4, 1, 1); }));
          }
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'source-over';
        } else if (this.idle && this.glintT < 0 && this.glintT > -0.6) {
          this.drawGlint(sp, x0, ly, y0, -this.glintT / 0.6);
        }
      }
      g.globalAlpha = 1;
    }
    if (this.lidT >= 0 && this.lidT < 0.8) {
      const t = this.lidT;
      this.drawLid(sp.lid.art, x0 + t * 60, y0 - LID_H + 1 - t * 170 + t * t * 120, -t * 6, Math.max(0, 1 - t / 0.8));
    }

    // Rings, sparks and gold.
    g.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      if (r.t < 0) continue;
      g.globalAlpha = 1 - r.t / r.life;
      g.strokeStyle = r.col;
      g.lineWidth = 2;
      g.beginPath();
      if (r.x !== undefined) g.ellipse(r.x, r.y!, r.r, r.r * 0.22, 0, 0, Math.PI * 2);
      else g.ellipse(m.x, m.y, r.r, r.r * 0.6, 0, 0, Math.PI * 2);
      g.stroke();
    }
    for (const p of this.parts) {
      if (p.t < 0 || p.coin) continue;
      const a = p.to ? Math.min(1, p.t / p.life * 3) : 1 - p.t / p.life;
      g.globalAlpha = a;
      g.fillStyle = p.col;
      const x = Math.round(p.x), y = Math.round(p.y);
      if (p.star && a > 0.3) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
      else g.fillRect(x, y, p.s, p.s);
    }
    g.globalCompositeOperation = 'source-over';
    for (const p of this.parts) {
      if (!p.coin) continue;
      g.globalAlpha = Math.min(1, (p.life - p.t) * 3);
      const x = Math.round(p.x), y = Math.round(p.y);
      // A coin spinning: wide, then edge-on.
      const wide = p.g === 0 ? 3 : [3, 2, 1, 2][Math.floor(p.t * 18 + p.floor!) & 3];
      g.fillStyle = INK; g.fillRect(x - Math.ceil(wide / 2) - 1, y - 2, wide + 2, 4);
      g.fillStyle = p.col; g.fillRect(x - Math.ceil(wide / 2), y - 1, wide, 2);
      if (wide > 1) { g.fillStyle = '#ffffff'; g.fillRect(x - Math.ceil(wide / 2), y - 1, 1, 1); }
    }
    g.globalAlpha = 1;

    if (this.flash > 0.01) {
      g.globalAlpha = Math.min(1, this.flash);
      g.fillStyle = this.flashCol;
      g.fillRect(0, 0, this.w, this.h);
      g.globalAlpha = 1;
    }
  }

  /** Moonlight through the leaves, the waterfall running, fireflies and petals, lantern light, the glow behind the chest. */
  private drawAmbient(ax: number, ay: number): void {
    const g = this.g;
    const seam = ay - 16;
    // The waterfall: bright streaks racing down, foam and mist where it meets the pool.
    const top = seam - 63;
    for (let x = ax - 14; x < ax + 15; x++) {
      const sp = 70 + hash(x * 1.3) * 50, len = 4 + Math.floor(hash(x * 2.9) * 7), gap = 12 + Math.floor(hash(x * 4.1) * 10);
      const off = (this.t * sp + hash(x) * 50) % (len + gap);
      g.fillStyle = hash(x * 7.7) > 0.5 ? '#bfeaf6' : '#7cc4dc';
      for (let y = top - (len + gap) + off; y < seam; y += len + gap) {
        const y0 = Math.max(top, Math.round(y)), y1 = Math.min(seam - 1, Math.round(y + len));
        if (y1 > y0) g.fillRect(x, y0, 1, y1 - y0);
      }
    }
    g.fillStyle = '#e8f8ff';
    for (let i = 0; i < 12; i++) {
      const fx = ax - 16 + ((i * 5 + Math.floor(this.t * 9)) % 32), fy = seam - 2 - ((i * 3 + Math.floor(this.t * 7)) % 4);
      g.fillRect(fx, fy, 2, 1);
    }
    g.globalCompositeOperation = 'lighter';
    const mist = g.createRadialGradient(ax, seam - 2, 2, ax, seam - 2, 30);
    mist.addColorStop(0, 'rgba(190, 230, 240, 0.35)');
    mist.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = mist; g.fillRect(ax - 30, seam - 32, 60, 60);
    // Shafts of moonlight through the canopy.
    for (const [ox, wd, a] of [[60, 18, 0.05], [96, 10, 0.04], [-130, 14, 0.035]] as const) {
      g.globalAlpha = a + Math.sin(this.t * 0.7 + ox) * 0.012;
      g.fillStyle = '#cfe8ff';
      g.beginPath();
      g.moveTo(ax + ox, -4);
      g.lineTo(ax + ox + wd, -4);
      g.lineTo(ax + ox + wd - 70, ay + 14);
      g.lineTo(ax + ox - 70, ay + 14);
      g.closePath();
      g.fill();
    }
    // Fireflies wandering and blinking.
    for (let i = 0; i < 22; i++) {
      const fx = ax + (hash(i * 3.7) - 0.5) * 300 + Math.sin(this.t * (0.3 + hash(i) * 0.4) + i) * 18;
      const fy = seam - 4 - hash(i * 5.9) * 60 + Math.sin(this.t * (0.5 + hash(i * 2) * 0.5) + i * 2) * 10;
      const blink = Math.max(0, Math.sin(this.t * (1.4 + hash(i * 9) * 1.6) + i * 4));
      if (blink < 0.05) continue;
      g.globalAlpha = blink * (1 - this.dim * 0.6);
      g.fillStyle = this.tier && this.steps > 0 ? this.color(this.tier, true, i) : '#d8ff7a';
      g.fillRect(Math.round(fx), Math.round(fy), 1, 1);
      if (blink > 0.8) { g.globalAlpha = 0.3 * blink; g.fillRect(Math.round(fx) - 1, Math.round(fy), 3, 1); g.fillRect(Math.round(fx), Math.round(fy) - 1, 1, 3); }
    }
    g.globalCompositeOperation = 'source-over';
    // Petals drifting down from the canopy.
    for (let i = 0; i < 12; i++) {
      const u = (hash(i * 7.3) + this.t * (0.04 + hash(i) * 0.04)) % 1;
      const x = ax + (hash(i * 3.1) - 0.5) * 280 + Math.sin(u * 12 + i) * 8 - u * 30, y = -6 + u * (ay + 14);
      g.globalAlpha = Math.min(1, Math.sin(u * Math.PI) * 2) * 0.85;
      g.fillStyle = i % 3 ? '#ff9ad0' : '#ffd0ea';
      g.fillRect(Math.round(x), Math.round(y), (i + Math.floor(this.t * 4)) % 3 ? 2 : 1, 1);
    }
    g.globalCompositeOperation = 'lighter';
    // A soft glow behind the chest over the falls: moonlit at rest, the tier's colour while charging.
    const rc = { x: ax, y: seam - 36 };
    const col = this.tier ? this.color(this.tier, false) : '#5ab8b0';
    const pulse = this.tier ? 0.35 + this.glow * 0.4 : 0.1 + Math.sin(this.t * 1.2) * 0.03;
    const grd = g.createRadialGradient(rc.x, rc.y, 4, rc.x, rc.y, 50);
    grd.addColorStop(0, col);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = pulse;
    g.fillStyle = grd;
    g.fillRect(rc.x - 50, rc.y - 50, 100, 100);
    // Lantern light on the trunks and grass.
    for (const sd of [-1, 1]) {
      const bx = ax + sd * 66, by = seam - 22;
      const fl = 0.22 + Math.sin(this.t * 11 + sd) * 0.03 + Math.sin(this.t * 23 + sd * 2) * 0.025;
      const r = 46;
      const gb = g.createRadialGradient(bx, by, 2, bx, by, r);
      gb.addColorStop(0, this.tier && this.dim > 0.3 ? this.color(this.tier, false) : '#ff9a3a');
      gb.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = fl * (1 - this.dim * 0.5);
      g.fillStyle = gb;
      g.fillRect(bx - r, by - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  /** Pixel flames in the stone lanterns; they take the tier's colour as the chest charges. */
  private drawFlames(ax: number, ay: number): void {
    const g = this.g;
    const seam = ay - 16;
    const tier = this.tier && this.steps > 0 ? this.tier : null;
    for (const s of [-1, 1]) {
      const bx = ax + s * 66, base = seam + 6 - 27;
      for (let i = 0; i < 13; i++) {
        const x = bx - 6 + i;
        const edge = 1 - Math.abs(i - 6) / 6.5;
        const wave = Math.sin(this.t * 10 + i * 1.1 + s) + Math.sin(this.t * 17 - i * 1.9) * 0.6;
        const hgt = Math.max(1, Math.round((4 + 8 * edge) * (1 + this.glow * 0.4) + wave * 1.6));
        for (let y = 0; y < hgt; y++) {
          const k = y / hgt;
          g.fillStyle = tier && k > 0.45 ? this.color(tier, k > 0.75, i) : FIRE[Math.min(4, Math.floor((1 - k) * 2.2 + edge * 2.4))];
          g.fillRect(x, base - y, 1, 1);
        }
      }
      // Embers.
      if (Math.random() < 0.12) this.spark(bx + (Math.random() - 0.5) * 8, base - 8, (Math.random() - 0.5) * 6, -14 - Math.random() * 16, tier ? this.color(tier, true) : FIRE[3], 0.9 + Math.random() * 0.6, -4, false);
    }
  }

  /** The flower ring on the dais: softly twinkling at rest, filling with the tier's light step by step. */
  private drawDais(ax: number, ay: number): void {
    const g = this.g;
    const n = 64;
    const lit = this.tier ? Math.min(1, this.steps / 3 + this.gathering * 0.4) : 0;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.t * (this.tier ? 0.9 : 0.15);
      const on = this.tier ? (i / n) < lit || Math.random() < 0.05 : (i + Math.floor(this.t * 3)) % 8 === 0;
      if (!on) continue;
      g.globalAlpha = this.tier ? 0.9 : 0.35;
      g.fillStyle = this.tier ? this.color(this.tier, i % 3 === 0, i) : ['#ff8ac8', '#f4f0ff', '#7ad8ff', '#ffd860'][i % 4];
      g.fillRect(Math.round(ax + Math.cos(a) * 40), Math.round(ay + Math.sin(a) * 6.5), i % 4 === 0 ? 2 : 1, 1);
    }
    if (this.tier && this.gone < 1) {
      const grd = g.createRadialGradient(ax, ay, 2, ax, ay, 50);
      grd.addColorStop(0, this.color(this.tier, false));
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.25 + lit * 0.3;
      g.fillStyle = grd;
      g.save();
      g.translate(ax, ay);
      g.scale(1, 0.22);
      g.fillRect(-50, -50, 100, 100);
      g.restore();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  /** A glint sliding across the chest's gold. */
  private drawGlint(sp: { body: ReturnType<typeof bodyArt>; lid: ReturnType<typeof lidArt> }, x0: number, ly: number, y0: number, k: number): void {
    const c = this.glint, gg = c.getContext('2d')!;
    const H = BODY_H + LID_H;
    gg.globalCompositeOperation = 'source-over';
    gg.clearRect(0, 0, W, H);
    gg.fillStyle = '#ffffff';
    const x = -20 + k * (W + 40);
    gg.beginPath();
    gg.moveTo(x, 0); gg.lineTo(x + 5, 0); gg.lineTo(x - 15, H); gg.lineTo(x - 20, H);
    gg.closePath();
    gg.fill();
    gg.globalCompositeOperation = 'destination-in';
    gg.drawImage(sp.lid.mask, 0, ly - (y0 - LID_H + 1));
    gg.drawImage(sp.body.mask, 0, LID_H - 1);
    const g = this.g;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.7;
    g.drawImage(c, x0, y0 - LID_H + 1);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private drawLid(art: HTMLCanvasElement, x: number, y: number, rot: number, alpha: number): void {
    const g = this.g;
    g.globalAlpha *= alpha;
    if (rot) {
      g.save();
      g.translate(Math.round(x + W / 2), Math.round(y + LID_H / 2));
      g.rotate(rot);
      g.drawImage(art, -W / 2, -LID_H / 2);
      g.restore();
    } else {
      g.drawImage(art, Math.round(x), Math.round(y));
      // The jewel on top takes the light's colour.
      const lk = LOOKS[this.look];
      g.fillStyle = this.tier ? this.color(this.tier, Math.sin(this.t * 12) > 0) : lk.gem;
      g.fillRect(Math.round(x) + 23, Math.round(y) + 2, 6, 2);
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(x) + 23, Math.round(y) + 2, 1, 1);
      if (!this.tier && Math.sin(this.t * 2.2) > 0.92) g.fillRect(Math.round(x) + 27, Math.round(y) + 1, 1, 3);
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
    if (Math.random() < this.beam) this.spark(x + (Math.random() - 0.5) * wide * 2, y - Math.random() * 10, 0, -120 - Math.random() * 120, this.color(tier, true, Math.floor(Math.random() * 5)), 0.6, 0, Math.random() < 0.3);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
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
      g.globalAlpha = this.rays * (i % 2 ? 0.12 : 0.2);
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
