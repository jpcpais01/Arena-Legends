// The Sunhaven Coast region map: a top-down pixel art painting made once,
// in code like every other piece of art in the game.
//
// The land is built as fields over the whole map (sea, terrain tiers, biome,
// river, roads), painted pixel by pixel, then dressed with sprites sorted by
// their base row (trees, houses, landmarks). Higher ground is a plateau with
// a cliff face hanging below its southern edge, the way old handheld games
// draw hills, so the map reads at a glance. Water animates with a second,
// mostly transparent layer (foam and glints one step on) that the screen
// flips on and off; the floating isle and the clouds are separate sprites so
// the screen can move them without repainting anything.
import { Rng } from '../core/rng';
import { pack } from './pixel/color';
import { bayer, Pix } from './pixel/paint';
import { hash } from './pixel/tex';

export interface WorldArt {
  w: number;
  h: number;
  /** The painted map. */
  base: Pix;
  /** The water one animation step on: only the pixels that differ from `base`. */
  waves: Pix;
  /** The floating isle over the bay, and where its top-left corner sits on the map. */
  isle: Pix;
  isleAt: { x: number; y: number };
  clouds: Pix[];
}

const W = 1280, H = 800;

// --- Noise ------------------------------------------------------------------------------------------

function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const o = s * 1013;
  const a = hash(xi + o, yi), b = hash(xi + 1 + o, yi), c = hash(xi + o, yi + 1), d = hash(xi + 1 + o, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal noise, -1..1. */
function fbm(x: number, y: number, oct: number, s: number): number {
  let sum = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, s + i * 7);
    n += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return (sum / n) * 2 - 1;
}

/**
 * A smooth field sampled every `step` pixels and read back with bilinear
 * filtering: low-frequency noise costs a fraction of a per-pixel fbm.
 */
function grid(step: number, f: (x: number, y: number) => number): (x: number, y: number) => number {
  const gw = Math.ceil(W / step) + 2, gh = Math.ceil(H / step) + 2;
  // Nodes are worked out the first time they are needed, so fields only cost where they are read.
  const g = new Float32Array(gw * gh).fill(NaN);
  const at = (k: number) => {
    const v = g[k];
    return v === v ? v : (g[k] = f((k % gw) * step, Math.floor(k / gw) * step));
  };
  return (x, y) => {
    const fx = Math.max(0, Math.min(gw - 1.001, x / step)), fy = Math.max(0, Math.min(gh - 1.001, y / step));
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j;
    const k = j * gw + i;
    const a = at(k), b = at(k + 1), c = at(k + gw), d = at(k + gw + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

let desertN: ((x: number, y: number) => number) | null = null;
/** How far east of the wastes' edge a point is (negative: in the wastes). */
const desertEdge = (x: number, y: number) => {
  desertN ??= grid(6, (x, y) => fbm(x * 0.008, y * 0.008, 3, 9) * 70);
  return x + desertN(x, y) + Math.max(0, 230 - y) * 0.4 - 392;
};
const desertAt = (x: number, y: number) => desertEdge(x, y) < 0;

/** A tone from a palette by a noise value, dithered between neighbours. */
const pickTone = (pal: number[], n: number, b: number, k: number) =>
  pal[Math.max(0, Math.min(pal.length - 1, Math.floor((n * k + 1) * (pal.length / 2) + (b - 0.5) * 0.9)))];

const sstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Catmull-Rom through points sorted by x, sampled at x. */
function spline(pts: number[][], x: number): number {
  let i = 0;
  while (i < pts.length - 2 && pts[i + 1][0] < x) i++;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
  const t = Math.max(0, Math.min(1, (x - p1[0]) / (p2[0] - p1[0])));
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
}

// --- Colour -----------------------------------------------------------------------------------------

const P = (hex: number) => pack(hex);
const ramp = (...hex: number[]) => hex.map(P);

/** Multiplies a packed colour per channel. */
function tint(c: number, r: number, g: number, b: number): number {
  const R = Math.min(255, (c & 255) * r), G = Math.min(255, ((c >>> 8) & 255) * g), B = Math.min(255, ((c >>> 16) & 255) * b);
  return ((255 << 24) | (B << 16) | (G << 8) | R) >>> 0;
}
const shade = (c: number, f = 1) => tint(c, 1 - 0.3 * f, 1 - 0.26 * f, 1 - 0.13 * f);
const lift = (c: number, f = 1) => tint(c, 1 + 0.16 * f, 1 + 0.14 * f, 1 + 0.1 * f);

const INK = 0x2a1f2e;

const SEA = ramp(0x9de9dc, 0x72d6d8, 0x4fc0d6, 0x3aa5cf, 0x2f8bc3, 0x2873b6, 0x2264a9, 0x1d589c);
const SEA_AT = [2.5, 6, 11, 18, 28, 42, 64];
const FOAM = P(0xf4fdff), FOAM2 = P(0xc6f0f0), GLINT = P(0x8fd0f0), GLINT2 = P(0xd8f6ff);
const GRASS = ramp(0x4f9c3c, 0x5fb046, 0x70c050, 0x84cf5c);
const HILL = ramp(0x63a846, 0x74b850, 0x86c75a, 0x9ad466);
const ALPINE = ramp(0x5f8f52, 0x6f9f5c, 0x80ae66, 0x93bc72);
const SAND = ramp(0xe2c483, 0xedd395, 0xf6e1a8, 0xfbecbf);
const WETSAND = P(0xcfb27a);
const DESERT = ramp(0xd29a5e, 0xdfaa6c, 0xe9ba7c, 0xf2ca8e);
const MESA_TOP = ramp(0xbe6a3c, 0xcc7848, 0xd98a56, 0xe49c68);
const ROCK = ramp(0x8a8794, 0x9c99a4, 0xaeabb4, 0xc2bfc6);
const SNOW = ramp(0xc6d4ea, 0xdbe6f4, 0xedf3fb, 0xffffff);
const FACE_MESA = ramp(0xc06a40, 0xa95a36, 0x914c2e, 0x7a3e26, 0x5e2e1e);
const FACE_ROCK = ramp(0x8c889c, 0x78748a, 0x666278, 0x545066, 0x403c52);
const FACE_EARTH = ramp(0xa47c54, 0x8f6a46, 0x7a5a3a, 0x664a30, 0x4e3824);
const RIVER = ramp(0x8be0e0, 0x5cc6dc, 0x46b0d6);
const DIRT = ramp(0xbc9862, 0xd2b07a, 0xdec08c, 0xe8d0a2);
const COBBLE = ramp(0x8a847e, 0xb4afa6, 0xc4bfb4, 0xd2cec4);
const PLAZA = ramp(0x9a9284, 0xcdc4b2, 0xd9d1c0, 0xe6dfd0);
const STAIR = ramp(0x7a7064, 0xa89e8e, 0xd6ccbc);
const QUAY = ramp(0x6e6a70, 0x9a96a0, 0xaeaab2, 0xc0bcc4);

// Terrain kinds (per pixel).
const SEA_T = 0;
// Biomes.
const B_GRASS = 0, B_DESERT = 1, B_MOUNT = 2;

// Roads.
const R_DIRT = 1, R_COBBLE = 2, R_PLAZA = 3;

// --- The map --------------------------------------------------------------------------------------

/** Where the floating isle hangs (map pixels, its sprite's top-left). */
const ISLE_AT = { x: 510, y: 512 };

export function paintSunhaven(): WorldArt {
  return new Painter().paint();
}

interface Sprite { y: number; draw(): void }

class Painter {
  out = new Pix(W, H);
  waves = new Pix(W, H);
  tier = new Uint8Array(W * H);
  biome = new Uint8Array(W * H);
  river = new Uint8Array(W * H);
  road = new Uint8Array(W * H);
  /** Road direction at a pixel: 1 mostly across, 2 mostly up/down. */
  rdir = new Uint8Array(W * H);
  /** Distance to the other of sea/land (sea pixels: to land; land pixels: to the sea). */
  dist = new Float32Array(W * H);
  /** Depth into a cliff face (1 at its top), 0 when not a face; and the face's plateau tier. */
  face = new Uint8Array(W * H);
  faceOf = new Uint8Array(W * H);
  /** Taken by a building, landmark or tree: nothing else goes there. */
  occ = new Uint8Array(W * H);
  /** Stone quay along the harbour (instead of beach). */
  quay = new Uint8Array(W * H);
  sprites: Sprite[] = [];
  rng = new Rng(0x5a17ec);

  paint(): WorldArt {
    this.terrain();
    this.rivers();
    this.distances();
    this.faces();
    this.roads();
    this.ground();
    this.water();
    const ground = this.out.data.slice();
    this.paintRoads();
    this.fields();
    this.dress();
    this.isleShadow();
    for (const s of this.sprites.sort((a, b) => a.y - b.y)) s.draw();
    // The wave layer only shows over open water that nothing was painted on.
    const o = this.out.data, w = this.waves.data;
    for (let i = 0; i < o.length; i++) if (w[i] && o[i] !== ground[i]) w[i] = 0;
    return { w: W, h: H, base: this.out, waves: this.waves, isle: paintIsle(), isleAt: ISLE_AT, clouds: [cloud(1, 74, 30), cloud(2, 58, 24), cloud(3, 90, 34), cloud(4, 46, 20)] };
  }

  // --- Fields --------------------------------------------------------------------------------------

  private terrain(): void {
    const coast = [[-40, 600], [100, 614], [220, 594], [330, 566], [410, 512], [470, 470], [540, 456], [620, 458], [700, 466],
      [780, 506], [860, 572], [930, 632], [985, 654], [1030, 628], [1068, 556], [1104, 470], [1150, 410], [1215, 380], [1320, 368]];
    const isles: number[][] = [[172, 724, 40, 22], [1168, 640, 44, 26], [1238, 520, 22, 16], [770, 760, 16, 10], [352, 668, 10, 7], [1100, 744, 12, 8]];
    const mesas = [[92, 248, 98, 72, 2], [296, 186, 84, 50, 2], [64, 470, 56, 40, 2], [150, 96, 130, 66, 2], [334, 466, 40, 28, 2],
      [80, 236, 44, 30, 3], [168, 86, 70, 34, 3], [304, 178, 34, 20, 3], [52, 462, 20, 14, 3]];
    const { tier, biome } = this;
    const coastY = new Float32Array(W), ridgeY = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      coastY[x] = spline(coast, x);
      ridgeY[x] = 64 + 92 * sstep(240, 470, x) - 30 * sstep(1150, 1280, x) + 16 * Math.sin(x * 0.017) + 9 * Math.sin(x * 0.041 + 1.3);
    }
    const coastN = grid(3, (x, y) => fbm(x * 0.011, y * 0.011, 3, 1) * 22 + fbm(x * 0.05, y * 0.05, 2, 2) * 5);
    const ridgeN = grid(3, (x, y) => fbm(x * 0.02, y * 0.02, 3, 4) * 16);
    const ridgeN2 = grid(3, (x, y) => fbm(x * 0.03, y * 0.03, 2, 5) * 14);
    const mesaN = grid(3, (x, y) => fbm(x * 0.035, y * 0.035, 3, 10) * 0.4);
    const hillN = grid(3, (x, y) => fbm(x * 0.03, y * 0.03, 3, 12) * 0.3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let land = y < coastY[x] - 34 || (y < coastY[x] + 34 && y < coastY[x] + coastN(x, y));
        if (!land) {
          for (let k = 0; k < isles.length; k++) {
            const e = isles[k];
            const dx = (x - e[0]) / e[2], dy = (y - e[1]) / e[3];
            if (dx * dx + dy * dy < 1.5 && dx * dx + dy * dy < 1 + fbm(x * 0.06, y * 0.06, 2, 3) * 0.45) { land = true; break; }
          }
        }
        if (!land) { tier[i] = SEA_T; continue; }
        let t = 1;
        // The northern range: a ridge, then a higher band where the peaks stand.
        const ridge = ridgeY[x];
        if (y < ridge + 20) {
          if (y < ridge + ridgeN(x, y)) t = 2;
          if (y < ridge - 42 + ridgeN2(x, y)) t = 3;
        }
        const dsert = desertAt(x, y);
        biome[i] = dsert ? B_DESERT : t >= 2 ? B_MOUNT : B_GRASS;
        // The Astral Sanctum's ledge: flat, in the saddle between peaks.
        const ox = (x - 760) / 40, oy = (y - 92) / 30;
        if (ox * ox + oy * oy < 1) t = 3;
        // Red mesas of the wastes.
        if (dsert) {
          for (let k = 0; k < mesas.length; k++) {
            const e = mesas[k], tt = e[4];
            const dx = (x - e[0]) / e[2], dy = (y - e[1]) / e[3];
            const q = dx * dx + dy * dy;
            if (q < 1.45 && q < 1 + mesaN(x + tt * 97, y)) t = Math.max(t, tt);
          }
          // The basin the Mesa arena stands in stays low.
          const ax = (x - 205) / 70, ay = (y - 374) / 46;
          if (ax * ax + ay * ay < 1) t = 1;
        }
        // The shrine's hill in the east.
        {
          const dx = (x - 1036) / 122, dy = (y - 290) / 80;
          const q = dx * dx + dy * dy;
          if (q < 1.35 && q < 1 + hillN(x, y)) { t = Math.max(t, 2); if (!dsert && y > 200) biome[i] = B_GRASS; }
        }
        tier[i] = t;
      }
    }
  }

  /** The river from the snow down to the bay, through a lake under the range. */
  private rivers(): void {
    const up = [[706, 20], [700, 56], [690, 96], [676, 136], [662, 170], [652, 196]];
    const down = [[650, 214], [658, 246], [670, 282], [668, 322], [656, 362], [642, 404], [634, 440], [630, 476]];
    const stamp = (pts: number[][], r0: number, r1: number) => {
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
        const steps = Math.ceil(Math.hypot(bx - ax, by - ay));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const q = (k + t) / (pts.length - 1);
          const r = r0 + (r1 - r0) * q;
          const cx = ax + (bx - ax) * t + Math.sin((k + t) * 2.1) * 3, cy = ay + (by - ay) * t;
          this.disc(this.river, cx, cy, r, 1);
        }
      }
    };
    stamp(up, 2.6, 4.2);
    stamp(down, 4.6, 7);
    // The lake.
    for (let y = 186; y < 228; y++) for (let x = 600; x < 700; x++) {
      const dx = (x - 648) / 34, dy = (y - 206) / 15;
      if (dx * dx + dy * dy < 1 + fbm(x * 0.08, y * 0.08, 2, 14) * 0.25) this.river[y * W + x] = 1;
    }
    // Rivers never run over the sea.
    for (let i = 0; i < W * H; i++) if (this.tier[i] === SEA_T) this.river[i] = 0;
  }

  private disc(m: Uint8Array, cx: number, cy: number, r: number, v: number, dir = 0): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      if (y < 0 || y >= H) continue;
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (x < 0 || x >= W) continue;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) {
          const i = y * W + x;
          if (v >= m[i] || m === this.river) m[i] = Math.max(m[i], v);
          if (dir) this.rdir[i] = dir;
        }
      }
    }
  }

  /** Chamfer distance from each pixel to the nearest pixel of the other kind (sea vs land). */
  private distances(): void {
    const { dist, tier } = this;
    const INF = 1e6;
    const pass = (sea: boolean) => {
      const d = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) d[i] = (tier[i] === SEA_T) === sea ? INF : 0;
      const A = 1, B = 1.414;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!d[i]) continue;
        let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + A);
        if (y > 0) {
          v = Math.min(v, d[i - W] + A);
          if (x > 0) v = Math.min(v, d[i - W - 1] + B);
          if (x < W - 1) v = Math.min(v, d[i - W + 1] + B);
        }
        d[i] = v;
      }
      for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        if (!d[i]) continue;
        let v = d[i];
        if (x < W - 1) v = Math.min(v, d[i + 1] + A);
        if (y < H - 1) {
          v = Math.min(v, d[i + W] + A);
          if (x < W - 1) v = Math.min(v, d[i + W + 1] + B);
          if (x > 0) v = Math.min(v, d[i + W - 1] + B);
        }
        d[i] = v;
      }
      for (let i = 0; i < W * H; i++) if ((tier[i] === SEA_T) === sea) dist[i] = d[i] >= INF ? 200 : d[i];
    };
    pass(true);
    pass(false);
  }

  /** Cliff faces: below the southern edge of every plateau, a face as tall as its tier says. */
  private faces(): void {
    const { tier, face, faceOf } = this;
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const t = tier[i];
      for (let k = 1; k <= 12 && k <= y; k++) {
        const tu = tier[i - k * W];
        if (tu > t && tu >= 2) {
          const ch = tu === 2 ? 9 : 11;
          if (k <= ch) { face[i] = k; faceOf[i] = tu; }
          break;
        }
        if (tu < t) break;
      }
    }
  }

  // --- Roads -----------------------------------------------------------------------------------------

  private path(pts: number[][], r: number, kind: number): void {
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      const dir = Math.abs(bx - ax) >= Math.abs(by - ay) ? 1 : 2;
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        this.disc(this.road, ax + (bx - ax) * t, ay + (by - ay) * t, r, kind, dir);
      }
    }
  }

  private roads(): void {
    // Town streets.
    this.path([[560, 236], [560, 452]], 3.6, R_COBBLE);
    this.path([[408, 330], [742, 330]], 3.6, R_COBBLE);
    this.path([[452, 276], [700, 276]], 3, R_COBBLE);
    this.path([[446, 390], [712, 390]], 3, R_COBBLE);
    this.path([[478, 262], [478, 430]], 2.8, R_COBBLE);
    this.path([[624, 262], [624, 300]], 2.8, R_COBBLE);
    this.path([[704, 276], [704, 420]], 2.8, R_COBBLE);
    this.path([[470, 452], [714, 452]], 3.2, R_COBBLE);
    // The plaza.
    this.disc(this.road, 560, 330, 30, R_PLAZA);
    // West to the Mesa arena.
    this.path([[408, 330], [370, 338], [330, 352], [292, 366], [256, 372]], 2.6, R_DIRT);
    // East to the shrine: along the coast road, up the stairs.
    this.path([[742, 330], [800, 336], [862, 348], [920, 366], [972, 376], [1010, 380], [1030, 370], [1036, 352], [1038, 320], [1040, 300]], 2.6, R_DIRT);
    // North: past the lake and up the range to the Sanctum.
    this.path([[560, 236], [552, 212], [560, 186], [590, 168], [640, 160], [700, 148], [728, 134], [744, 120], [756, 108]], 2.4, R_DIRT);
    // South-east along the point to the lighthouse.
    this.path([[712, 390], [770, 410], [830, 446], [880, 494], [924, 548], [958, 596], [976, 618]], 2.4, R_DIRT);
    // To the farms.
    this.path([[478, 262], [470, 244], [452, 228], [430, 222]], 2.2, R_DIRT);
  }

  // --- Painting the ground -------------------------------------------------------------------------------

  private ground(): void {
    const o = this.out.data;
    const { tier, biome, face, faceOf, river, dist, road } = this;
    // The harbour quay.
    for (let y = 400; y < 480; y++) for (let x = 462; x < 724; x++) {
      const i = y * W + x;
      if (tier[i] !== SEA_T && dist[i] <= 7 && !river[i]) this.quay[i] = 1;
    }
    const groundN = grid(3, (x, y) => fbm(x * 0.016, y * 0.016, 3, 20) + fbm(x * 0.07, y * 0.07, 2, 21) * 0.35);
    const beachN = grid(4, (x, y) => fbm(x * 0.03, y * 0.03, 2, 22) * 4);
    const rippleN = grid(3, (x, y) => fbm(x * 0.02, y * 0.02, 2, 23) * 7);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const t = tier[i];
        if (t === SEA_T && !face[i]) continue;
        const b = bayer(x, y);
        const n = groundN(x, y);
        if (face[i]) {
          o[i] = this.faceColor(x, y, face[i], faceOf[i], biome[i - face[i] * W]);
          continue;
        }
        const bio = biome[i];
        let c: number;
        if (t === 1) {
          const beachW = 6 + beachN(x, y);
          if (this.quay[i]) {
            const row = y % 4 === 3, seam = (x + ((y >> 2) & 1) * 3) % 6 === 5;
            c = row || seam ? QUAY[1] : QUAY[2 + (hash(x / 6 | 0, y >> 2) < 0.4 ? 1 : 0)];
          } else if (dist[i] <= beachW) {
            c = dist[i] <= 1.6 ? WETSAND : pickTone(SAND, n, b, 1.2);
            if (dist[i] > 1.6 && hash(x, y) < 0.012) c = SAND[0];
          } else if (bio === B_DESERT) {
            c = pickTone(DESERT, n, b, 1.4);
            // Wind ripples.
            if (Math.sin(x * 0.21 + y * 0.62 + rippleN(x, y)) > 0.9) c = DESERT[0];
          } else {
            c = pickTone(GRASS, n, b, 1.5);
          }
          // Desert fades into grass with a dithered seam.
          if (bio === B_GRASS && dist[i] > beachW + 2) {
            const dd = desertEdge(x, y);
            if (dd < 26 && b > dd / 26) c = pickTone(DESERT, n, b, 1.4);
          }
        } else if (bio === B_DESERT) {
          c = pickTone(MESA_TOP, n, b, 1.3);
          if (hash(x >> 1, y) < 0.03) c = MESA_TOP[0];
        } else if (bio === B_MOUNT) {
          if (t === 2) c = n + (b - 0.5) * 0.3 > 0.35 ? pickTone(ROCK, n, b, 1.5) : pickTone(ALPINE, n, b, 1.5);
          else if (t === 3) c = n + (b - 0.5) * 0.3 > -0.25 ? pickTone(ROCK, n, b, 1.5) : pickTone(SNOW, n, b, 0.8);
          else c = pickTone(SNOW, n, b, 1.1);
        } else {
          c = pickTone(HILL, n, b, 1.5);
        }
        // Rims: a light lip where a plateau drops to a face, dark ink on its other edges.
        if (t >= 2) {
          const below = y < H - 1 ? i + W : i;
          if (face[below] === 1) c = lift(c, 1.4);
          else if ((x > 0 && tier[i - 1] < t && !face[i - 1]) || (x < W - 1 && tier[i + 1] < t && !face[i + 1]) || (y > 0 && tier[i - W] < t)) c = shade(c, 1.2);
        }
        o[i] = c;
        // Tufts of grass and pebbles.
        if (t <= 2 && !road[i] && (bio === B_GRASS || (bio === B_MOUNT && t === 2)) && dist[i] > 8) {
          const hh = hash(x, y);
          if (hh < 0.018 && x > 1 && y < H - 1) {
            o[i] = shade(c, 1.1);
            o[i - 2] = shade(o[i - 2], 1.1);
            o[i + W - 1] = shade(o[i + W - 1], 0.9);
          } else if (hh > 0.9975) o[i] = P([0xffffff, 0xfff27a, 0xff9ab8, 0xe8556a][Math.floor(hash(y, x) * 4)]);
        }
      }
    }
    // Shade at the foot of faces, flower meadows, the river and its banks.
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!face[i] && face[i - W] && tier[i] !== SEA_T) o[i] = shade(o[i], 1.2);
      else if (!face[i] && face[i - 2 * W] && !face[i - W] && tier[i] !== SEA_T) o[i] = shade(o[i], 0.6);
    }
    this.meadows();
    this.paintRiver();
  }

  private faceColor(x: number, y: number, k: number, tu: number, bio: number): number {
    const pal = bio === B_DESERT ? FACE_MESA : bio === B_MOUNT ? FACE_ROCK : FACE_EARTH;
    const ch = tu === 2 ? 9 : 11;
    const f = k / ch;
    let idx = Math.floor(f * 3.2 + (bayer(x, y) - 0.5) * 0.7 + fbm(x * 0.1, (y - k) * 0.1, 2, 30) * 0.5);
    // Strata and cracks.
    if (bio === B_DESERT && (k + (hash(x >> 3, tu) * 3 | 0)) % 4 === 0) idx += 1;
    if (hash(x, (y - k) >> 2) < 0.07 || hash(x >> 1, (y - k) * 7) < 0.02) idx += 1;
    if (k === ch) idx = 4;
    if (k === 1) idx = 0;
    // Snow drapes over the top of high faces.
    if (bio === B_MOUNT && tu === 4 && k <= 2 + (hash(x, 3) * 3 | 0)) return k === 1 ? SNOW[3] : SNOW[1];
    if (bio === B_MOUNT && tu === 2 && k <= 1 + (hash(x, 5) * 2 | 0)) return ALPINE[1];
    if (bio === B_GRASS && k <= 1 + (hash(x, 5) * 2.4 | 0)) return k === 1 ? HILL[2] : HILL[0];
    return pal[Math.max(0, Math.min(4, idx))];
  }

  private meadows(): void {
    const o = this.out.data;
    const cols = [0xfff6e0, 0xffe04a, 0xff86ae, 0xb98cff, 0xff6a5a].map(P);
    for (let y = 2; y < H - 2; y += 3) for (let x = 2; x < W - 2; x += 3) {
      const i = y * W + x;
      if (this.tier[i] !== 1 || this.biome[i] !== B_GRASS || this.road[i] || this.river[i] || this.dist[i] < 10 || this.face[i]) continue;
      if (fbm(x * 0.022, y * 0.022, 2, 40) < 0.38) continue;
      const hh = hash(x * 3, y * 5);
      if (hh < 0.2) {
        const c = cols[Math.floor(hash(x, y * 3) * cols.length)];
        const jx = x + (hash(x, y) * 3 | 0) - 1, jy = y + (hash(y, x) * 3 | 0) - 1;
        o[jy * W + jx] = c;
        if (hh < 0.15) o[(jy + 1) * W + jx] = shade(o[(jy + 1) * W + jx], 1.2);
      }
    }
  }

  private paintRiver(): void {
    const o = this.out.data, w = this.waves.data;
    const { river, face, tier } = this;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!river[i]) {
        // Banks: a dark line where land meets the river.
        if (tier[i] !== SEA_T && (river[i - 1] || river[i + 1] || river[i - W] || river[i + W])) o[i] = shade(o[i], 1.5);
        continue;
      }
      if (face[i]) {
        // A waterfall: white streaks running down.
        const s = hash(x, (y + (x & 3)) >> 1);
        o[i] = s < 0.35 ? FOAM : s < 0.7 ? P(0xbdeef4) : RIVER[0];
        w[i] = hash(x, ((y + 1) + (x & 3)) >> 1) < 0.35 ? FOAM : P(0xbdeef4);
        continue;
      }
      let edge = 0;
      for (let k = 1; k <= 2 && !edge; k++) if (!river[i - k] || !river[i + k] || !river[i - k * W] || !river[i + k * W]) edge = k;
      o[i] = edge === 1 ? RIVER[0] : edge === 2 ? RIVER[1] : RIVER[2];
      // Foam under waterfalls; flow dashes.
      if (face[i - W] || face[i - 2 * W]) { o[i] = FOAM; w[i] = FOAM2; }
      else if (!edge && hash(x >> 1, y >> 2) < 0.08) { o[i] = RIVER[1]; w[i] = RIVER[2]; }
      else if (!edge && hash(x >> 1, (y + 2) >> 2) < 0.08) w[i] = RIVER[1];
    }
  }

  private water(): void {
    const o = this.out.data, w = this.waves.data;
    const { tier, dist, face } = this;
    const depthN = grid(2, (x, y) => fbm(x * 0.05, y * 0.05, 2, 50) * 2.6);
    const gapN = grid(2, (x, y) => fbm(x * 0.09, y * 0.09, 2, 51));
    const waveN = grid(2, (x, y) => fbm(x * 0.07, y * 0.07, 2, 52));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (tier[i] !== SEA_T || face[i]) continue;
      const d = dist[i];
      const b = bayer(x, y);
      const dd = d + depthN(x, y) + (b - 0.5) * 2.2 + (y / H) * 18;
      let k = 0;
      while (k < SEA_AT.length && dd > SEA_AT[k]) k++;
      let c = SEA[k];
      let c2 = c;
      // Surf: a broken foam line at the shore, one step out in the second frame.
      const gap = d < 3 ? gapN(x, y) : 0;
      if (d <= 1.5 && gap > -0.5) c = FOAM;
      if (d > 1.5 && d <= 2.6 && gap > -0.2) c2 = FOAM;
      else if (d <= 1.5 && gap > -0.5) c2 = FOAM2;
      // A softer wave line further out.
      const wv = d > 4 && d < 7.2 ? waveN(x, y) : 0;
      if (Math.abs(d - 5) < 0.6 && wv > 0.15) c = FOAM2;
      if (Math.abs(d - 6.5) < 0.6 && wv > 0.15) c2 = FOAM2;
      // Glints on open water.
      if (d > 12) {
        const cx = Math.floor(x / 14), cy = Math.floor(y / 9);
        const hx = cx * 14 + Math.floor(hash(cx, cy) * 10), hy = cy * 9 + Math.floor(hash(cy, cx) * 7);
        const len = 2 + (hash(cx, cy * 5) * 3 | 0);
        if (hash(cx * 7, cy * 3) < 0.3 && y === hy) {
          if (x >= hx && x < hx + len) c = GLINT;
          if (x >= hx + 1 && x < hx + len) c2 = GLINT2;
          else if (x === hx + len) c2 = GLINT;
        }
      }
      o[i] = c;
      if (c2 !== c) w[i] = c2;
    }
  }

  private paintRoads(): void {
    const o = this.out.data;
    const { road, river, face, rdir } = this;
    const isRoad = (i: number) => road[i] > 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const r = road[i];
      if (!r) {
        // A soft worn border beside dirt roads.
        if ((isRoad(i - 1) || isRoad(i + 1) || isRoad(i - W) || isRoad(i + W)) && this.tier[i] !== SEA_T && !river[i] && !face[i]) o[i] = shade(o[i], 0.5);
        continue;
      }
      const edge = !isRoad(i - 1) || !isRoad(i + 1) || !isRoad(i - W) || !isRoad(i + W);
      if (river[i]) {
        // A bridge.
        const across = rdir[i] === 1;
        const plank = across ? x % 3 === 0 : y % 3 === 0;
        o[i] = edge ? P(0x5a3820) : plank ? P(0x8a5a34) : P(0xb67e4a);
        continue;
      }
      if (face[i]) {
        // Steps cut into the cliff.
        o[i] = edge ? STAIR[0] : face[i] % 2 ? STAIR[2] : STAIR[1];
        continue;
      }
      if (r === R_DIRT) {
        const hh = hash(x, y);
        o[i] = edge ? DIRT[0] : hh < 0.08 ? DIRT[1] : hh > 0.97 ? DIRT[3] : DIRT[2];
      } else if (r === R_COBBLE) {
        const row = Math.floor(y / 3), off = (row & 1) * 2;
        const mortar = y % 3 === 2 || (x + off) % 4 === 3;
        const st = hash(Math.floor((x + off) / 4), row);
        o[i] = edge ? COBBLE[0] : mortar ? shade(COBBLE[1], 0.6) : st < 0.33 ? COBBLE[1] : st < 0.8 ? COBBLE[2] : COBBLE[3];
      } else {
        const dx = x - 560, dy = y - 330;
        const rr = Math.hypot(dx, dy);
        const ring = Math.floor(rr / 4);
        const a = Math.atan2(dy, dx);
        const seg = Math.floor((a + Math.PI) * (ring + 2) * 0.8);
        const mortar = rr % 4 > 3.2 || ((a + Math.PI) * (ring + 2) * 0.8) % 1 < 0.12;
        o[i] = edge ? PLAZA[0] : mortar ? PLAZA[1] : (ring + seg) % 5 === 0 ? PLAZA[3] : PLAZA[2];
      }
    }
  }

  // --- Places --------------------------------------------------------------------------------------------

  /** Farm fields north-west of town, with a windmill. */
  private fields(): void {
    const o = this.out.data;
    const plots: [number, number, number, number, number[]][] = [
      [384, 228, 30, 20, ramp(0xd6ae4c, 0xeccb62)],
      [418, 228, 26, 20, ramp(0x5f9c3c, 0x8ccc5c)],
      [384, 252, 22, 18, ramp(0x8c5a36, 0xa8744a)],
      [410, 252, 34, 18, ramp(0xd6ae4c, 0xeccb62)],
      [384, 274, 28, 16, ramp(0x5f9c3c, 0x8ccc5c)],
      [416, 274, 24, 16, ramp(0xc2577a, 0x6faa48)],
    ];
    for (const [px, py, pw, ph, pal] of plots) {
      for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) {
        const i = y * W + x;
        if (this.road[i] || this.river[i]) continue;
        const edge = x === px || y === py || x === px + pw - 1 || y === py + ph - 1;
        o[i] = edge ? P(0x6a8a3a) : y % 3 === 0 ? pal[0] : pal[1];
        if (pal[0] === P(0xc2577a) && y % 3 === 0 && x % 2) o[i] = pal[0];
        this.occ[i] = 1;
      }
      // Fence posts on the field edges.
      for (let x = px; x < px + pw; x += 4) { o[(py - 1) * W + x] = P(0x7a5230); o[(py + ph) * W + x] = P(0x7a5230); }
    }
    this.sprites.push({ y: 232, draw: () => this.windmill(452, 206) });
  }

  private dress(): void {
    this.town();
    this.harbour();
    this.lighthouse(980, 600);
    this.shrine();
    this.mesaArena(205, 372);
    this.observatory(760, 92);
    this.sea();
    this.mountains();
    this.hamlet();
    this.oasis(118, 392);
    this.plantTrees();
  }

  /** Marks a rectangle as taken. */
  private take(x: number, y: number, w: number, h: number): void {
    for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) this.occ[yy * W + xx] = 1;
  }

  private free(x: number, y: number, w: number, h: number, pad = 1): boolean {
    for (let yy = y - pad; yy < y + h + pad; yy++) for (let xx = x - pad; xx < x + w + pad; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) return false;
      const i = yy * W + xx;
      if (this.occ[i] || this.road[i] || this.river[i] || this.tier[i] !== 1 || this.face[i] || this.quay[i] || this.dist[i] < 4) return false;
    }
    return true;
  }

  /** A soft cast shadow: darkens the ground in an ellipse, dithered at its rim. */
  private shadowAt(cx: number, cy: number, rx: number, ry: number, k = 1): void {
    const o = this.out.data;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const q = dx * dx + dy * dy;
      if (q > 1 || (q > 0.7 && bayer(x, y) < (q - 0.7) / 0.3)) continue;
      const i = y * W + x;
      o[i] = shade(o[i], k);
    }
  }

  private blitSprite(s: Pix, x: number, y: number): void {
    this.out.blit(s, Math.round(x), Math.round(y));
  }

  // --- Town -----------------------------------------------------------------------------------------------

  private town(): void {
    const rng = this.rng;
    const roofs = [0xd2503c, 0x3f6fc8, 0x2f9a8e, 0xe0843a, 0x8a5ac0, 0x4f9a4a, 0xb0603a, 0xd84a6a];
    // The town hall on the plaza's north side, the fountain in its middle, market stalls around.
    this.take(536, 268, 48, 30);
    this.sprites.push({ y: 296, draw: () => this.hall(538, 270) });
    this.sprites.push({ y: 342, draw: () => this.fountain(560, 332) });
    const stalls: [number, number, number][] = [[530, 350, 0xd8402e], [582, 350, 0x3f6fc8], [540, 312, 0xe0a030], [574, 312, 0x2f9a8e]];
    for (const [sx, sy, c] of stalls) this.sprites.push({ y: sy + 6, draw: () => this.stall(sx, sy, c) });
    // A church tower and a few big houses at set spots, then houses packed into the blocks.
    this.take(668, 352, 22, 32);
    this.sprites.push({ y: 384, draw: () => this.tower(670, 352) });
    for (let y = 238; y < 446; y += 3) {
      for (let x = 392; x < 752; x += 3) {
        const dx = (x - 566) / 186, dy = (y - 342) / 112;
        if (dx * dx + dy * dy > 1) continue;
        if (rng.next() < 0.35) continue;
        const w = rng.int(14, 22), rh = rng.int(8, 11), wh = rng.int(6, 8);
        const hh = rh + wh;
        if (!this.free(x, y, w, hh + 2, 2)) continue;
        this.take(x - 1, y - 1, w + 2, hh + 4);
        const roof = roofs[rng.int(0, roofs.length - 1)];
        const chim = rng.chance(0.4), door = rng.int(0, 2);
        this.sprites.push({ y: y + hh, draw: () => this.house(x, y, w, rh, wh, roof, chim, door) });
        x += w + 2;
      }
    }
    // Lamp posts along the avenue and flower boxes.
    for (let y = 250; y < 440; y += 22) for (const x of [554, 566]) if (!this.occ[y * W + x] && this.road[y * W + x] === R_COBBLE) {
      const lx = x === 554 ? 551 : 569;
      if (this.occ[y * W + lx]) continue;
      this.sprites.push({ y: y + 1, draw: () => this.lamp(lx, y) });
    }
  }

  private house(x: number, y: number, w: number, rh: number, wh: number, roof: number, chimney: boolean, doorAt: number): void {
    const s = new Pix(w + 2, rh + wh + 3);
    const R = [shade(P(roof), 1.6), shade(P(roof), 0.8), P(roof), lift(P(roof), 1.2)];
    const wall = P(0xf3e6c8), wallD = P(0xd9c6a0);
    const ox = 1, oy = 1;
    // Walls.
    for (let yy = rh; yy < rh + wh; yy++) for (let xx = 1; xx < w - 1; xx++) s.data[(oy + yy) * s.w + ox + xx] = yy === rh + wh - 1 ? wallD : xx === 1 ? wallD : wall;
    // Roof: a ridge on top, shingle rows, gable ends, a dark eave.
    for (let yy = 0; yy < rh; yy++) for (let xx = 0; xx < w; xx++) {
      let c = yy === 0 ? R[3] : yy === rh - 1 ? R[0] : (yy % 2 === 0) ? R[1] : R[2];
      if (yy > 0 && yy < rh - 1 && yy % 2 === 1 && (xx + (yy >> 1) * 2) % 4 === 0) c = R[1];
      if (xx === 0 || xx === w - 1) c = R[0];
      if (yy === 1 && xx > 0 && xx < w - 1) c = R[3];
      s.data[(oy + yy) * s.w + ox + xx] = c;
    }
    if (chimney) for (let yy = -1; yy < 3; yy++) for (let xx = w - 6; xx < w - 3; xx++) s.data[(oy + yy) * s.w + ox + xx] = yy === -1 ? P(0x5a4a4a) : P(0x9a6a5a);
    // Door and windows.
    const dx = doorAt === 0 ? 3 : doorAt === 1 ? (w >> 1) - 1 : w - 6;
    for (let yy = rh + 1; yy < rh + wh; yy++) for (let xx = dx; xx < dx + 3; xx++) s.data[(oy + yy) * s.w + ox + xx] = yy === rh + 1 ? P(0x4a2e1c) : P(0x7a4a2a);
    for (let wx = 3; wx < w - 4; wx += 5) {
      if (wx + 3 > dx - 1 && wx < dx + 4) continue;
      for (let yy = rh + 2; yy < rh + 4; yy++) for (let xx = wx; xx < wx + 3; xx++)
        s.data[(oy + yy) * s.w + ox + xx] = yy === rh + 2 && xx === wx ? P(0xe8fbff) : P(0x6cb4e0);
    }
    s.outline(INK);
    this.shadowAt(x + w * 0.62, y + rh + wh + 1, w * 0.62, 3.2, 1);
    this.blitSprite(s, x - 1, y - 1);
  }

  private hall(x: number, y: number): void {
    const w = 44, rh = 14, wh = 12;
    const s = new Pix(w + 4, rh + wh + 16);
    const oy = 12;
    const roofP = [P(0x23366e), P(0x2f4b94), P(0x3c5eb4), P(0x5a80d4)];
    for (let yy = rh; yy < rh + wh; yy++) for (let xx = 2; xx < w - 2; xx++) {
      const col = xx % 7 === 3;
      s.data[(oy + yy) * s.w + 2 + xx] = col ? P(0xfffaf0) : yy === rh + wh - 1 ? P(0xc8b48e) : P(0xeadcbc);
    }
    for (let yy = 0; yy < rh; yy++) for (let xx = 0; xx < w; xx++) {
      let c = yy === 0 ? roofP[3] : yy === rh - 1 ? roofP[0] : yy % 2 ? roofP[2] : roofP[1];
      if (xx === 0 || xx === w - 1) c = roofP[0];
      if (yy === rh - 2) c = P(0xe0b040);
      s.data[(oy + yy) * s.w + 2 + xx] = c;
    }
    // Clock tower.
    for (let yy = -11; yy < 4; yy++) for (let xx = 17; xx < 27; xx++) {
      let c = yy < -6 ? (yy === -11 ? P(0x5a80d4) : P(0x3c5eb4)) : P(0xeadcbc);
      if (yy >= -5 && yy <= -1 && xx >= 19 && xx <= 24) c = (xx === 21 || xx === 22) && yy === -3 ? P(0x2a1f2e) : P(0xfff8e0);
      if (yy >= -5 && yy <= -1 && (xx === 19 || xx === 24) && (yy === -5 || yy === -1)) c = P(0xeadcbc);
      s.data[(oy + yy) * s.w + 2 + xx] = c;
    }
    s.data[(oy - 12) * s.w + 2 + 21] = P(0xe0b040); s.data[(oy - 12) * s.w + 2 + 22] = P(0xe0b040);
    // Big doors and windows.
    for (let yy = rh + 4; yy < rh + wh; yy++) for (let xx = 19; xx < 25; xx++) s.data[(oy + yy) * s.w + 2 + xx] = xx === 21 || xx === 22 ? P(0x5a3420) : P(0x7a4a2a);
    for (const wx of [6, 12, 30, 36]) for (let yy = rh + 3; yy < rh + 7; yy++) for (let xx = wx; xx < wx + 3; xx++) s.data[(oy + yy) * s.w + 2 + xx] = yy === rh + 3 ? P(0xe8fbff) : P(0x6cb4e0);
    s.outline(INK);
    this.shadowAt(x + 26, y + rh + wh + 2, 26, 4);
    this.blitSprite(s, x - 2, y - oy);
  }

  private fountain(cx: number, cy: number): void {
    const s = new Pix(22, 16);
    s.ellipse(11, 8, 10, 7, 0xb8b0a4);
    s.ellipse(11, 8, 8.5, 5.6, 0x3aa5cf);
    s.ellipse(11, 7, 6, 3.6, 0x5cc6dc);
    for (let x = 4; x < 18; x++) if (hash(x, 1) < 0.4) s.set(x, 8 + (x & 1), 0x9de9dc);
    s.ellipse(11, 7, 2.2, 1.8, 0xd8d0c4);
    s.set(11, 4, 0xffffff); s.set(11, 5, 0xbdeef4); s.set(10, 5, 0xffffff); s.set(12, 5, 0xffffff); s.set(11, 3, 0xffffff);
    s.outline(INK);
    this.out.blit(s, cx - 11, cy - 8);
  }

  private stall(x: number, y: number, c: number): void {
    const s = new Pix(12, 9);
    for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 12; xx++) s.set(xx, yy, (xx >> 1) % 2 ? 0xfff4e0 : c);
    for (let xx = 0; xx < 12; xx++) s.set(xx, 4, xx % 2 ? 0xfff4e0 : c);
    for (let yy = 5; yy < 8; yy++) for (let xx = 1; xx < 11; xx++) s.set(xx, yy, yy === 5 ? 0x8a5a34 : 0xb67e4a);
    s.set(3, 5, 0xe8455a); s.set(5, 5, 0xf0c040); s.set(7, 5, 0x6ac050); s.set(9, 5, 0xe8455a);
    s.outline(INK);
    this.shadowAt(x + 7, y + 8, 6, 2);
    this.out.blit(s, x - 1, y - 1);
  }

  private tower(x: number, y: number): void {
    const s = new Pix(22, 34);
    // A bell tower with a pointed spire.
    for (let yy = 12; yy < 32; yy++) for (let xx = 4; xx < 18; xx++) s.set(xx, yy, yy === 31 ? 0xc8b48e : xx === 4 ? 0xd8c8a4 : 0xeee2c4);
    for (let yy = 0; yy < 13; yy++) {
      const half = Math.round((yy / 12) * 9);
      for (let xx = 11 - half; xx < 11 + half; xx++) s.set(xx, yy, xx < 11 ? 0x8a3a3a : 0xb04a44);
    }
    for (let xx = 2; xx < 20; xx++) s.set(xx, 12, 0x6a2a2a);
    for (let yy = 15; yy < 20; yy++) for (let xx = 9; xx < 13; xx++) s.set(xx, yy, yy === 15 ? 0x3a2a2a : 0x5a4030);
    s.set(10, 17, 0xe0b040); s.set(11, 17, 0xe0b040);
    for (let yy = 25; yy < 31; yy++) for (let xx = 9; xx < 13; xx++) s.set(xx, yy, 0x7a4a2a);
    s.outline(INK);
    this.shadowAt(x + 14, y + 33, 9, 3);
    this.out.blit(s, x, y);
  }

  private lamp(x: number, y: number): void {
    const o = this.out;
    o.set(x, y - 5, 0xfff2a0); o.set(x, y - 4, 0x3a3040); o.set(x, y - 3, 0x3a3040); o.set(x, y - 2, 0x3a3040); o.set(x, y - 1, 0x3a3040);
    o.set(x - 1, y - 5, 0x2a1f2e); o.set(x + 1, y - 5, 0x2a1f2e); o.set(x, y - 6, 0x2a1f2e);
  }

  private windmill(x: number, y: number): void {
    const s = new Pix(26, 30);
    for (let yy = 12; yy < 27; yy++) for (let xx = 8; xx < 18; xx++) s.set(xx, yy, yy > 23 ? 0xc8b48e : xx < 10 ? 0xd8c8a4 : 0xeee2c4);
    for (let yy = 8; yy < 13; yy++) for (let xx = 7; xx < 19; xx++) s.set(xx, yy, yy === 8 ? 0xd06a4a : 0xb04a3a);
    for (let yy = 21; yy < 27; yy++) for (let xx = 11; xx < 15; xx++) s.set(xx, yy, 0x7a4a2a);
    // Sails.
    const cx = 13, cy = 10;
    for (let k = -11; k <= 11; k++) {
      s.set(cx + k, cy + k * 0.8, 0x8a5a34); s.set(cx + k, cy - k * 0.8, 0x8a5a34);
      if (Math.abs(k) > 2) { s.set(cx + k, cy + k * 0.8 + (k > 0 ? -1 : 1), 0xfff4e0); s.set(cx + k, cy - k * 0.8 + (k > 0 ? 1 : -1), 0xfff4e0); }
    }
    s.set(cx, cy, 0x4a3020);
    s.outline(INK);
    this.shadowAt(x + 16, y + 27, 8, 2.5);
    this.out.blit(s, x - 13, y - 2);
  }

  // --- Harbour and sea ------------------------------------------------------------------------------------

  private harbour(): void {
    const o = this.out;
    const piers: [number, number, number][] = [[498, 462, 40], [572, 466, 46], [700, 468, 36]];
    for (const [px, py, len] of piers) {
      for (let y = py; y < py + len; y++) for (let x = px; x < px + 6; x++) {
        if (this.tier[y * W + x] !== SEA_T && y > py + 2) continue;
        const edge = x === px || x === px + 5;
        o.set(x, y, edge ? 0x5a3820 : y % 3 === 0 ? 0x8a5a34 : 0xb67e4a);
      }
      for (let y = py + 3; y < py + len; y += 6) { o.set(px - 1, y, 0x3a2414); o.set(px + 6, y, 0x3a2414); }
      for (let y = py + 2; y < py + len; y++) { o.set(px + 6 + 1, y + 1, 0x1f5a8a); }
    }
    // Boats moored by the piers, and sailing out in the bay and beyond.
    const boats: [number, number, number, boolean][] = [[489, 478, 0xd8402e, false], [508, 490, 0x3f6fc8, false], [563, 486, 0xf0c040, false], [582, 500, 0x2f9a8e, false], [711, 482, 0xd8402e, false]];
    for (const [bx, by, c] of boats) this.boat(bx, by, c, false);
    this.boat(420, 640, 0xfff8ec, true);
    this.boat(830, 690, 0xfff8ec, true);
    this.boat(1210, 450, 0xffe2a0, true);
    // Crates and barrels on the quay.
    for (const [cx, cy] of [[520, 448], [524, 446], [652, 448], [690, 446], [612, 444]]) {
      const s = new Pix(5, 5);
      s.rect(0, 0, 5, 5, 0xb67e4a); s.rect(0, 2, 5, 1, 0x8a5a34); s.set(0, 0, 0xd8a06a);
      s.outline(INK);
      this.sprites.push({ y: cy + 5, draw: () => o.blit(s, cx - 1, cy - 1) });
    }
  }

  private boat(x: number, y: number, sail: number, sailing: boolean): void {
    const s = new Pix(14, 22);
    // Hull, pointing up.
    for (let yy = 2; yy < 18; yy++) {
      const half = yy < 7 ? Math.round(((yy - 2) / 5) * 3.5) : yy > 15 ? 3 : 4;
      for (let xx = 7 - half; xx < 7 + half; xx++) s.set(xx, yy, xx === 7 - half || xx === 6 + half ? 0x5a3820 : yy % 4 === 0 ? 0x9a6a3e : 0xb67e4a);
    }
    s.rect(5, 8, 4, 6, 0xd8b88a);
    if (sailing) {
      for (let yy = 4; yy < 15; yy++) {
        const half = Math.round(((yy - 4) / 10) * 5);
        for (let xx = 7; xx < 8 + half; xx++) s.set(xx, yy, xx === 7 ? 0x6a5040 : sail);
      }
    } else {
      s.rect(6, 6, 1, 9, sail);
      s.set(7, 10, 0x6a5040);
    }
    s.outline(INK);
    if (sailing) {
      // A wake behind.
      for (let k = 0; k < 10; k++) {
        this.out.set(x + 7 - 2 - k * 0.6, y + 20 + k, 0xe0f8fa);
        this.out.set(x + 7 + 2 + k * 0.6, y + 20 + k, 0xe0f8fa);
      }
    } else this.shadowAt(x + 9, y + 12, 5, 8, 0.7);
    this.out.blit(s, x, y);
  }

  private sea(): void {
    // Rocks off the coast with a ring of surf.
    const rocks = [[300, 640, 4], [316, 648, 3], [1060, 690, 5], [1076, 700, 3], [880, 760, 4], [130, 676, 3], [1240, 700, 4], [1010, 520, 3]];
    for (const [rx, ry, r] of rocks) {
      const i = ry * W + rx;
      if (this.tier[i] !== SEA_T) continue;
      for (let y = ry - r - 2; y <= ry + r + 2; y++) for (let x = rx - r - 3; x <= rx + r + 3; x++) {
        const d = Math.hypot((x - rx) / 1.3, y - ry);
        if (d > r && d < r + 1.6 && hash(x, y) < 0.8) this.out.set(x, y, 0xf4fdff);
      }
      const s = new Pix(r * 2 + 2, r * 2 + 2);
      s.ellipse(r + 1, r + 1, r, r * 0.8, 0x8a8794);
      s.ellipse(r, r, r * 0.6, r * 0.45, 0xaeabb4);
      s.outline(INK);
      this.out.blit(s, rx - r - 1, ry - r - 1);
    }
  }

  private lighthouse(x: number, y: number): void {
    this.take(x - 10, y - 4, 26, 28);
    this.sprites.push({ y: y + 22, draw: () => {
      const s = new Pix(16, 32);
      for (let yy = 8; yy < 30; yy++) {
        const half = 4 + Math.round((yy - 8) / 10);
        for (let xx = 8 - half; xx < 8 + half; xx++) {
          const band = Math.floor((yy - 8) / 4) % 2 === 1;
          const side = xx < 8 - half + 2;
          s.set(xx, yy, band ? (side ? 0xa83a32 : 0xd8463c) : (side ? 0xd8d2c8 : 0xf8f4ec));
        }
      }
      for (let yy = 3; yy < 8; yy++) for (let xx = 4; xx < 12; xx++) s.set(xx, yy, yy === 3 || yy === 7 ? 0x3a3040 : xx % 3 === 0 ? 0x5a4a3a : 0xfff27a);
      for (let yy = 0; yy < 3; yy++) for (let xx = 5 - yy + 2; xx < 11 + yy - 2; xx++) s.set(xx, yy, 0xa83a32);
      s.set(8, 0, 0xa83a32); s.set(7, 0, 0xa83a32);
      s.rect(6, 25, 4, 5, 0x5a3820);
      s.outline(INK);
      this.shadowAt(x + 14, y + 28, 10, 3);
      // A warm halo around the lamp.
      for (let yy = -10; yy <= 10; yy++) for (let xx = -14; xx <= 14; xx++) {
        const d = Math.hypot(xx / 1.4, yy);
        if (d > 5 && d < 10 && bayer(x + xx, y + 5 + yy) < 0.4 * (1 - (d - 5) / 5)) {
          const i = (y + 5 + yy) * W + x + 8 + xx;
          this.out.data[i] = lift(this.out.data[i], 1.4);
        }
      }
      this.out.blit(s, x, y);
      this.house(x + 14, y + 16, 14, 8, 6, 0xd8463c, true, 0);
    } });
  }

  private isleShadow(): void {
    // The floating isle's shadow on the bay, well below it: it is high up.
    this.shadowAt(602, 716, 62, 13, 0.9);
    this.shadowAt(602, 716, 44, 9, 0.5);
  }

  // --- Battle places ------------------------------------------------------------------------------------------

  private shrine(): void {
    // Hall on the hilltop, a pagoda beside it, torii gates up the stairs, stone lanterns.
    this.take(1008, 250, 66, 42);
    this.take(1072, 236, 20, 40);
    this.sprites.push({ y: 290, draw: () => this.shrineHall(1012, 254) });
    this.sprites.push({ y: 276, draw: () => this.pagoda(1076, 238) });
    for (const [tx, ty] of [[1040, 316], [1040, 338], [1030, 392]]) {
      this.take(tx - 9, ty - 10, 18, 12);
      this.sprites.push({ y: ty, draw: () => this.torii(tx, ty) });
    }
    for (const [lx, ly] of [[1022, 300], [1056, 300], [1026, 324], [1052, 324]]) {
      this.take(lx - 2, ly - 6, 5, 7);
      this.sprites.push({ y: ly, draw: () => this.stoneLantern(lx, ly) });
    }
    // A pond with koi.
    const o = this.out;
    for (let y = 296; y < 314; y++) for (let x = 1066; x < 1094; x++) {
      const dx = (x - 1080) / 13, dy = (y - 305) / 7;
      const q = dx * dx + dy * dy;
      if (q < 1) o.set(x, y, q > 0.75 ? 0x8a8794 : q > 0.6 ? 0x5cc6dc : 0x3aa5cf);
    }
    o.set(1076, 304, 0xf07030); o.set(1077, 304, 0xf07030); o.set(1084, 307, 0xffffff); o.set(1085, 307, 0xf07030);
    this.take(1064, 294, 32, 22);
  }

  private shrineHall(x: number, y: number): void {
    const w = 52, rh = 16, wh = 14;
    const s = new Pix(w + 8, rh + wh + 6);
    const ox = 4, oy = 3;
    for (let yy = rh - 2; yy < rh + wh; yy++) for (let xx = 4; xx < w - 4; xx++) {
      const pillar = (xx - 4) % 9 === 0;
      s.data[(oy + yy) * s.w + ox + xx] = P(pillar ? 0xb8382a : yy > rh + wh - 3 ? 0x8a6a4a : (xx % 9 > 2 && xx % 9 < 7 && yy > rh + 2 && yy < rh + 8) ? 0xfff4e0 : 0xd8463c);
    }
    // A sweeping roof with turned-up corners.
    const R = [P(0x22283e), P(0x323c5a), P(0x434f74), P(0x5a6890)];
    for (let yy = 0; yy < rh; yy++) {
      const curl = yy > rh - 4 ? (yy - (rh - 4)) : 0;
      for (let xx = -3 + curl; xx < w + 3 - curl; xx++) {
        let c = yy === 0 ? R[3] : yy === rh - 1 ? R[0] : yy % 2 ? R[2] : R[1];
        if (yy === 1) c = P(0xe0b040);
        s.data[(oy + yy) * s.w + ox + xx] = c;
      }
    }
    for (const cx of [-4, w + 3]) { s.data[(oy + rh - 4) * s.w + ox + cx] = R[1]; s.data[(oy + rh - 5) * s.w + ox + cx] = R[2]; }
    s.data[(oy - 1) * s.w + ox] = P(0xe0b040); s.data[(oy - 1) * s.w + ox + w - 1] = P(0xe0b040);
    s.data[(oy - 2) * s.w + ox] = P(0xe0b040); s.data[(oy - 2) * s.w + ox + w - 1] = P(0xe0b040);
    // Doors.
    for (let yy = rh + 4; yy < rh + wh - 1; yy++) for (let xx = 22; xx < 30; xx++) s.data[(oy + yy) * s.w + ox + xx] = P(xx === 25 || xx === 26 ? 0x5a2a1c : 0x7a3a24);
    s.outline(INK);
    this.shadowAt(x + w * 0.6, y + rh + wh + 3, w * 0.6, 4);
    this.blitSprite(s, x - ox, y - oy);
  }

  private pagoda(x: number, y: number): void {
    const s = new Pix(22, 40);
    const R = [0x22283e, 0x323c5a, 0x434f74];
    for (let tier = 0; tier < 3; tier++) {
      const ty = 4 + tier * 11, half = 5 + tier * 2;
      for (let yy = 0; yy < 5; yy++) for (let xx = 11 - half - (yy > 2 ? 0 : 1); xx < 11 + half + (yy > 2 ? 0 : 1); xx++) s.set(xx, ty + yy, R[yy === 0 ? 2 : yy === 4 ? 0 : 1]);
      for (let yy = 5; yy < 11; yy++) for (let xx = 11 - half + 2; xx < 11 + half - 2; xx++) s.set(xx, ty + yy, (xx - 11 + half) % 4 === 2 ? 0xb8382a : yy > 8 ? 0x8a6a4a : 0xd8463c);
    }
    s.set(11, 0, 0xe0b040); s.set(11, 1, 0xe0b040); s.set(11, 2, 0xe0b040); s.set(10, 3, 0xe0b040); s.set(11, 3, 0xe0b040);
    s.outline(INK);
    this.shadowAt(x + 15, y + 38, 9, 3);
    this.out.blit(s, x - 1, y - 1);
  }

  private torii(x: number, y: number): void {
    const s = new Pix(20, 12);
    for (let xx = 0; xx < 20; xx++) { s.set(xx, 1, 0x2a1f2e); s.set(xx, 2, 0xd8402e); }
    s.set(0, 0, 0x2a1f2e); s.set(19, 0, 0x2a1f2e);
    for (let xx = 2; xx < 18; xx++) s.set(xx, 4, 0xd8402e);
    for (let yy = 2; yy < 12; yy++) { s.set(4, yy, 0xd8402e); s.set(5, yy, 0xa83a32); s.set(14, yy, 0xd8402e); s.set(15, yy, 0xa83a32); }
    s.outline(INK);
    this.out.blit(s, x - 10, y - 11);
  }

  private stoneLantern(x: number, y: number): void {
    const s = new Pix(5, 7);
    s.rect(0, 0, 5, 2, 0x8a8794); s.rect(1, 2, 3, 2, 0xfff2a0); s.rect(1, 4, 3, 1, 0x8a8794); s.rect(2, 5, 1, 2, 0x9c99a4);
    s.set(0, 0, 0xaeabb4);
    s.outline(INK);
    this.out.blit(s, x - 2, y - 6);
  }

  private mesaArena(cx: number, cy: number): void {
    this.take(cx - 48, cy - 34, 96, 72);
    this.sprites.push({ y: cy + 30, draw: () => {
      const rx = 42, ry = 26, depth = 7;
      const s = new Pix(rx * 2 + 6, ry * 2 + depth + 20);
      const ox = rx + 3, oy = ry + 12;
      // Outer wall: its front face, then the top of the ring.
      for (let x = -rx; x <= rx; x++) {
        const yb = Math.round(ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)));
        for (let k = 0; k < depth; k++) s.set(ox + x, oy + yb + k, k === depth - 1 ? 0x6a3220 : (k + (x & 7 ? 0 : 1)) % 3 === 0 ? 0x9a4c2c : 0xb05a34);
      }
      for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
        const q = (x / rx) ** 2 + (y / ry) ** 2;
        if (q > 1) continue;
        let c: number;
        if (q > 0.82) c = (x + y * 3) % 5 === 0 ? 0xc88a50 : 0xe0aa6c;
        else if (q > 0.36) {
          const ring = Math.floor(Math.sqrt(q) * 9);
          c = ring % 2 ? 0xa86a3e : 0xc27e4a;
          if (hash(x >> 1, ring) < 0.25) c = [0xd8463c, 0x3f6fc8, 0xf0c040, 0xfff4e0][Math.floor(hash(x, ring) * 4)];
        } else if (q > 0.33) c = 0x7a3e26;
        else c = q < 0.02 ? 0xd8a060 : (Math.abs(x) === 0 || hash(x, y) < 0.03) ? 0xe6bc80 : 0xf2d098;
        s.set(ox + x, oy + y, c);
      }
      // A gate on the road side, banners around.
      for (let k = 0; k < depth; k++) for (let x = rx - 12; x < rx - 6; x++) s.set(ox + x, oy + Math.round(ry * Math.sqrt(1 - (x / rx) ** 2)) + k - 1, 0x3a1e14);
      for (const a of [0.3, 1.25, 2.2, 3.4, 4.6, 5.6]) {
        const bx = ox + Math.round(Math.cos(a) * (rx - 2)), by = oy + Math.round(Math.sin(a) * (ry - 2));
        for (let k = 1; k < 10; k++) s.set(bx, by - k, 0x5a3820);
        for (let k = 0; k < 4; k++) for (let j = 0; j < 3; j++) s.set(bx + 1 + k, by - 9 + j + (k > 2 ? 1 : 0), k === 3 && j === 2 ? 0xa83a32 : 0xd8402e);
      }
      s.outline(INK);
      this.shadowAt(cx + 8, cy + ry + depth, rx, 5);
      this.out.blit(s, cx - ox, cy - oy);
    } });
  }

  private observatory(cx: number, cy: number): void {
    this.take(cx - 34, cy - 30, 68, 58);
    const o = this.out;
    // A round platform of pale stone with a gold zodiac ring.
    for (let y = -24; y <= 24; y++) for (let x = -32; x <= 32; x++) {
      const q = Math.hypot(x / 32, y / 22);
      if (q > 1) continue;
      let c = q > 0.93 ? 0x6a6680 : (Math.floor(Math.hypot(x, y * 1.45) / 5) + Math.floor((Math.atan2(y, x) + 4) * 4)) % 2 ? 0xc8c4d8 : 0xb8b4cc;
      if (Math.abs(q - 0.78) < 0.035) c = 0xe0b850;
      if (Math.abs(q - 0.78) < 0.09 && Math.abs(q - 0.78) > 0.04 && hash(Math.floor(Math.atan2(y, x) * 12), 3) < 0.5 && hash(x, y) < 0.3) c = 0xfff2a0;
      o.set(cx + x, cy + y, c);
    }
    this.sprites.push({ y: cy + 12, draw: () => {
      const s = new Pix(32, 34);
      // Drum.
      for (let yy = 18; yy < 31; yy++) for (let xx = 3; xx < 29; xx++) s.set(xx, yy, yy === 30 ? 0x8a86a0 : xx < 6 ? 0xb0acc4 : (xx % 6 === 0) ? 0xb8b4cc : 0xdcd8ea);
      for (const wx of [8, 14, 20]) for (let yy = 22; yy < 26; yy++) { s.set(wx, yy, 0x3a3a6a); s.set(wx + 1, yy, 0x6a7ad8); }
      // Dome with gold ribs and an open slit.
      for (let yy = 0; yy < 19; yy++) for (let xx = 2; xx < 30; xx++) {
        const dx = (xx + 0.5 - 16) / 14, dy = (yy + 0.5 - 19) / 17;
        if (dx * dx + dy * dy > 1) continue;
        let c = dx < -0.3 ? 0x2a2e6a : dx > 0.4 ? 0x3a3e8a : 0x474ca4;
        if (dy < -0.75 && dx > -0.3) c = 0x6a70c8;
        if (Math.abs(dx - 0.55) < 0.06 || Math.abs(dx + 0.55) < 0.06) c = 0xe0b850;
        if (Math.abs(dx) < 0.12) c = yy < 4 ? 0x10102a : 0x181838;
        s.set(xx, yy, c);
      }
      // Telescope.
      for (let k = 0; k < 10; k++) { s.set(16 + k * 0.7, 9 - k * 0.8, 0xe0b850); s.set(17 + k * 0.7, 9 - k * 0.8, 0xa07a30); }
      s.set(16, 1, 0xffffff);
      s.outline(INK);
      this.shadowAt(cx + 5, cy + 12, 16, 4);
      this.out.blit(s, cx - 16, cy - 20);
    } });
    for (const [bx, by] of [[-24, -6], [24, -6], [-16, 14], [16, 14]]) {
      this.sprites.push({ y: cy + by + 2, draw: () => {
        const x = cx + bx, y = cy + by;
        o.set(x, y, 0x5a5670); o.set(x - 1, y - 1, 0x6a6680); o.set(x, y - 1, 0x6a6680); o.set(x + 1, y - 1, 0x6a6680);
        o.set(x, y - 2, 0xffb040); o.set(x - 1, y - 2, 0xf07030); o.set(x + 1, y - 2, 0xf07030); o.set(x, y - 3, 0xfff2a0);
      } });
    }
  }

  /** The peaks of the northern range: rows of mountains standing on the high ground, red ones over the wastes. */
  private mountains(): void {
    const rng = new Rng(0x9eaa);
    const ridge = (x: number) => 64 + 92 * sstep(240, 470, x) - 30 * sstep(1150, 1280, x) + 16 * Math.sin(x * 0.017) + 9 * Math.sin(x * 0.041 + 1.3);
    const rows: [number, number, number, number, number][] = [
      // base row offset from the ridge, x step, width, height, jitter
      [-96, 64, 92, 64, 8],
      [-64, 54, 76, 52, 6],
      [-38, 46, 60, 40, 5],
    ];
    for (const [off, step, mw, mh, jit] of rows) {
      for (let x = 300 + rng.int(0, step); x < W + 30; x += step + rng.int(-jit, jit)) {
        const base = Math.round(ridge(x) + off + rng.int(-4, 4));
        const w = Math.round(mw * rng.range(0.8, 1.15)), h = Math.round(mh * rng.range(0.8, 1.2));
        if (base < 8) continue;
        // Keep clear of the Sanctum's ledge and the river's gorge.
        if (Math.abs(x - 760) < w / 2 + 40 && base > 40) continue;
        if (off > -60 && Math.abs(x - 700) < w / 2 + 6) continue;
        const red = desertAt(x, base);
        const s = mountain(w, h, red, rng.int(0, 999));
        this.sprites.push({ y: base, draw: () => {
          this.shadowAt(x + w * 0.3, base - 2, w * 0.4, 4, 0.8);
          this.out.blit(s, x - (s.w >> 1), base - s.h + 2);
        } });
      }
    }
  }

  /** A fishing hamlet on the road to the lighthouse. */
  private hamlet(): void {
    const rng = new Rng(0x4a11);
    const roofs = [0x2f9a8e, 0x3f6fc8, 0xd2503c, 0xe0843a];
    let n = 0;
    for (let tries = 0; tries < 200 && n < 6; tries++) {
      const x = rng.int(840, 930), y = rng.int(470, 560);
      const w = rng.int(14, 18), rh = rng.int(8, 10), wh = 6;
      if (!this.free(x, y, w, rh + wh + 2, 3)) continue;
      this.take(x - 1, y - 1, w + 2, rh + wh + 4);
      const roof = roofs[n % roofs.length];
      this.sprites.push({ y: y + rh + wh, draw: () => this.house(x, y, w, rh, wh, roof, false, 1) });
      n++;
    }
  }

  /** A palm-ringed pool in the wastes. */
  private oasis(cx: number, cy: number): void {
    const o = this.out;
    for (let y = cy - 12; y <= cy + 12; y++) for (let x = cx - 22; x <= cx + 22; x++) {
      const q = ((x - cx) / 18) ** 2 + ((y - cy) / 9) ** 2 + vnoise(x * 0.2, y * 0.2, 90) * 0.3;
      if (q < 1.55 && q >= 1) o.set(x, y, q < 1.25 ? 0xb8d070 : 0xd0c070);
      else if (q < 1) o.set(x, y, q > 0.8 ? 0x8be0e0 : q > 0.45 ? 0x5cc6dc : 0x3aa5cf);
    }
    this.take(cx - 22, cy - 12, 44, 24);
    const bank = new TreeBank();
    for (const [dx, dy, v] of [[-24, -6, 0], [-14, -12, 1], [10, -13, 2], [24, -4, 0], [20, 10, 1], [-20, 9, 2]]) {
      const s = bank.get('palm', v), x = cx + dx, y = cy + dy;
      this.sprites.push({ y, draw: () => { this.shadowAt(x + 4, y + 1, 6, 2); o.blit(s, x - (s.w >> 1), y - s.h + 2); } });
    }
  }

  // --- Trees ---------------------------------------------------------------------------------------------------

  private plantTrees(): void {
    const rng = new Rng(0x7ee5);
    const bank = new TreeBank();
    const step = 6;
    for (let gy = 0; gy < H; gy += step) for (let gx = 0; gx < W; gx += step) {
      const x = gx + rng.int(0, step - 1), y = gy + rng.int(0, step - 1);
      if (x < 4 || y < 6 || x >= W - 4 || y >= H - 2) continue;
      const i = y * W + x;
      const t = this.tier[i], bio = this.biome[i];
      if (t === SEA_T || this.road[i] || this.river[i] || this.face[i] || this.occ[i] || this.quay[i]) continue;
      // Not too near roads, rivers, edges or buildings.
      let near = false;
      for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 3], [-3, -3], [3, -3]]) {
        const j = (y + dy) * W + x + dx;
        if (this.road[j] || this.river[j] || this.occ[j] || this.face[j] || this.tier[j] !== t) { near = true; break; }
      }
      for (let k = 1; k <= 14 && !near; k++) if (this.face[(y - k) * W + x] && y - k > 0) near = true;
      if (near) continue;
      const d = this.dist[i];
      const forest = fbm(x * 0.012, y * 0.012, 3, 60) + fbm(x * 0.05, y * 0.05, 2, 61) * 0.25;
      const inTown = ((x - 566) / 200) ** 2 + ((y - 342) / 124) ** 2 < 1;
      let kind: TreeKind | null = null;
      if (bio === B_DESERT) {
        if (t === 1 && d > 8 && rng.chance(0.05)) kind = rng.chance(0.6) ? 'cactus' : 'scrub';
      } else if (t === 1 && d <= 7) {
        if (d > 2.5 && rng.chance(0.12) && !inTown) kind = 'palm';
      } else if (bio === B_MOUNT) {
        if (t === 2 && rng.chance(forest > -0.2 ? 0.55 : 0.12)) kind = 'pine';
        else if (t === 3 && rng.chance(0.06)) kind = 'pineSnow';
      } else if (((x - 1036) / 140) ** 2 + ((y - 300) / 100) ** 2 < 1) {
        if (rng.chance(0.42)) kind = rng.chance(0.65) ? 'cherry' : 'round';
      } else if (inTown) {
        if (rng.chance(0.05)) kind = 'round';
      } else if (t === 1) {
        if (forest > 0.08 && rng.chance(0.8)) kind = forest > 0.3 ? 'dark' : 'round';
        else if (rng.chance(0.03)) kind = rng.chance(0.5) ? 'round' : 'bush';
      }
      if (!kind) continue;
      const s = bank.get(kind, rng.int(0, 2));
      for (let yy = y - 3; yy <= y; yy++) for (let xx = x - 3; xx <= x + 3; xx++) this.occ[yy * W + xx] = 1;
      this.sprites.push({ y, draw: () => {
        if (kind !== 'cactus' && kind !== 'scrub') this.shadowAt(x + s.w * 0.22, y + 1, s.w * 0.42, 2.4, 1);
        this.out.blit(s, x - (s.w >> 1), y - s.h + 2);
      } });
    }
  }
}

// --- Tree sprites -------------------------------------------------------------------------------------------

type TreeKind = 'round' | 'dark' | 'cherry' | 'pine' | 'pineSnow' | 'palm' | 'cactus' | 'scrub' | 'bush';

class TreeBank {
  private cache = new Map<string, Pix>();
  get(kind: TreeKind, v: number): Pix {
    const key = `${kind}${v}`;
    let s = this.cache.get(key);
    if (!s) { s = makeTree(kind, v); this.cache.set(key, s); }
    return s;
  }
}

function makeTree(kind: TreeKind, v: number): Pix {
  switch (kind) {
    case 'round': return roundTree(5 + v, [0x2f7a3a, 0x3f9a44, 0x5ab84e, 0x8ad46a], 0x1f3a26, v);
    case 'dark': return roundTree(6 + v, [0x1f5a34, 0x2b7440, 0x3f904a, 0x66b05c], 0x142a1c, v + 3);
    case 'cherry': return roundTree(5 + v, [0xb84a7a, 0xe0709a, 0xf49ab8, 0xffd4e4], 0x4a1e34, v + 6);
    case 'bush': return roundTree(3 + (v > 1 ? 1 : 0), [0x2f7a3a, 0x3f9a44, 0x5ab84e, 0x8ad46a], 0x1f3a26, v + 9, false);
    case 'pine': return pine(9 + v * 2, false);
    case 'pineSnow': return pine(9 + v * 2, true);
    case 'palm': return palm(v);
    case 'cactus': return cactus(v);
    case 'scrub': return roundTree(3, [0x7a6a3a, 0x948446, 0xae9e58, 0xc8b878], 0x3a2e1c, v + 12, false);
  }
}

/** A round broadleaf crown of lumps, lit from the top left, on a short trunk. */
function roundTree(r: number, pal: number[], ink: number, seed: number, trunk = true): Pix {
  const w = r * 2 + 5, h = r * 2 + (trunk ? 6 : 3);
  const s = new Pix(w, h);
  const cx = w / 2, cy = r + 1.5;
  const lumps: number[][] = [[0, 0, r]];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + seed;
    lumps.push([Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.45, r * 0.55]);
  }
  if (trunk) for (let y = Math.floor(cy + r * 0.5); y < h - 1; y++) { s.set(Math.floor(cx) - 1, y, 0x6a3e22); s.set(Math.floor(cx), y, 0x8a5430); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let inside = false, best = -9;
    for (const [lx, ly, lr] of lumps) {
      const dx = x + 0.5 - (cx + lx), dy = y + 0.5 - (cy + ly);
      const q = (dx * dx + dy * dy) / (lr * lr);
      if (q <= 1) {
        inside = true;
        // Light from the top left, each lump its own little ball.
        const l = (-dx * 0.55 - dy * 0.8) / lr + (1 - q) * 0.6 - (ly + lr * 0.2) / r * 0.5;
        best = Math.max(best, l);
      }
    }
    if (!inside) continue;
    const idx = best + (bayer(x, y) - 0.5) * 0.35;
    s.set(x, y, pal[idx > 0.95 ? 3 : idx > 0.35 ? 2 : idx > -0.25 ? 1 : 0]);
  }
  s.outline(ink);
  return s;
}

function pine(h: number, snow: boolean): Pix {
  const w = Math.round(h * 0.8) | 1;
  const s = new Pix(w + 2, h + 4);
  const cx = (w + 2) / 2;
  const pal = [0x1a4a3a, 0x255f46, 0x337a52, 0x4a9662];
  for (let y = 0; y < h; y++) {
    const tierY = y % Math.ceil(h / 3);
    const half = (0.18 + (tierY / Math.ceil(h / 3)) * 0.45 + (y / h) * 0.3) * w / 2;
    for (let x = Math.ceil(cx - half); x < cx + half; x++) {
      const side = (x - cx) / Math.max(1, half);
      let c = pal[side < -0.4 ? 3 : side < 0.2 ? 2 : side < 0.7 ? 1 : 0];
      if (snow && (tierY < 2 || side < -0.5) && y < h - 2) c = side < 0 ? 0xffffff : 0xd8e4f4;
      s.set(x, y + 1, c);
    }
  }
  s.set(Math.floor(cx) - 1, h + 1, 0x5a3420); s.set(Math.floor(cx), h + 1, 0x6a3e22); s.set(Math.floor(cx), h + 2, 0x5a3420);
  s.outline(0x10261c);
  return s;
}

function palm(v: number): Pix {
  const s = new Pix(17, 20);
  // A curved trunk.
  for (let y = 8; y < 19; y++) { const x = 8 + Math.round(Math.sin((y - 8) * 0.25 + v) * 1.4); s.set(x, y, y % 2 ? 0xa8784a : 0x8a5a34); s.set(x + 1, y, 0x6a4026); }
  const cx = 8, cy = 7;
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + v * 0.4;
    for (let t = 1; t < 8; t++) {
      const x = cx + Math.cos(a) * t, y = cy + Math.sin(a) * t * 0.7 + (t * t) * 0.05;
      s.set(x, y, t > 5 ? 0x8ad46a : 0x3f9a44);
      if (t < 6) s.set(x, y + 1, 0x2f7a3a);
    }
  }
  s.set(cx, cy, 0x6a4026); s.set(cx + 1, cy, 0x8a5430);
  s.outline(0x1f3a26);
  return s;
}

function cactus(v: number): Pix {
  const s = new Pix(9, 13);
  for (let y = 1; y < 12; y++) { s.set(4, y, 0x5aa65a); s.set(5, y, 0x3f8a48); }
  const arm = (side: number, y0: number) => {
    const ax = side > 0 ? 7 : 2;
    for (let x = Math.min(ax, 4); x <= Math.max(ax, 5); x++) s.set(x, y0, 0x4f9a52);
    for (let y = y0 - 3; y < y0; y++) s.set(ax, y, side > 0 ? 0x3f8a48 : 0x5aa65a);
  };
  arm(-1, 6 + (v % 2));
  if (v !== 1) arm(1, 5);
  s.set(4, 1, 0x7ac47a);
  s.outline(0x1a3a22);
  return s;
}

/** A mountain: a jagged peak lit from the west, its eastern face in shade, snow on top (red rock and no snow over the wastes). */
function mountain(w: number, h: number, red: boolean, seed: number): Pix {
  const s = new Pix(w + 2, h + 2);
  const lit = red ? [0xe49a64, 0xd2844e] : [0xc4c0d0, 0xaeaabe];
  const dark = red ? [0xb4643c, 0x9a5232, 0x7e4228] : [0x8a869e, 0x76728c, 0x625e78];
  const snowLit = 0xffffff, snowDark = 0xc8d6ee;
  const ax = w * (0.42 + hash(seed, 1) * 0.16);
  const sx = seed * 13.7;
  for (let y = 0; y < h; y++) {
    const f = (y + 1) / h;
    const e = Math.pow(f, 0.85);
    const xl = ax - ax * e + vnoise(sx + y * 0.35, 1, 80) * 4 * f;
    const xr = ax + (w - ax) * e - vnoise(sx + y * 0.35, 2, 81) * 4 * f;
    const rx = ax + f * w * 0.1 + Math.sin(y * 0.4 + seed) * 1.2;
    const snowLine = h * (0.3 + hash(seed, 2) * 0.12);
    for (let x = Math.ceil(xl); x < xr; x++) {
      const left = x < rx;
      // Gullies run down from the ridge.
      const g = (left ? ((rx - x) * 0.7 + y) % 7 : ((x - rx) * 0.8 + y) % 6) + (hash(Math.floor(x / 3), Math.floor(y / 4) + seed) < 0.45 ? 3 : 0);
      let c = left ? (g < 1.2 ? lit[1] : lit[0]) : (g < 1.2 ? dark[2] : x > xr - 2 ? dark[2] : dark[1]);
      if (left && x < xl + 1.5) c = lit[1];
      if (!left && x < rx + 1.5) c = dark[0];
      const snowY = snowLine + vnoise(sx + x * 0.5, 3, 82) * h * 0.18 + (g < 1.4 ? h * 0.1 : 0);
      if (!red && y < snowY) c = left ? (g < 1.2 && y > 3 ? 0xe4ecf8 : snowLit) : (g < 1.2 ? 0xaebcd8 : snowDark);
      if (y > h - 3) c = shadeHex(c);
      s.set(x + 1, y + 1, c);
    }
  }
  s.outline(INK);
  return s;
}

// --- The floating isle ---------------------------------------------------------------------------------------

function paintIsle(): Pix {
  const Wd = 184, Hd = 176;
  const s = new Pix(Wd, Hd);
  const cx = 92, cy = 58, rx = 76, ry = 40;
  // Underside: a jagged rock cone hanging from the rim, with earth on top.
  for (let x = -rx; x <= rx; x++) {
    const top = Math.round(cy + ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)));
    const u = 1 - Math.abs(x) / rx;
    const depth = Math.round(Math.pow(u, 0.85) * 100 + fbm(x * 0.12, 3, 2, 70) * 12 + (hash(x >> 2, 9) - 0.5) * 8);
    for (let k = 0; k < depth; k++) {
      const y = top + k;
      const f = k / Math.max(1, depth);
      const strata = (k + (hash(x >> 3, 4) * 4 | 0)) % 7 === 0;
      let c = k < 4 ? 0x7a5a3a : k < 7 ? 0x5e4430 : f < 0.5 ? (strata ? 0x6a6278 : 0x857d92) : f < 0.85 ? (strata ? 0x58506a : 0x6e667e) : 0x4a4258;
      if (x < -rx * 0.35 && f > 0.1) c = shadeHex(c);
      if (hash(x >> 1, k >> 3) < 0.04 && f > 0.15) c = 0x9a92a8;
      s.set(cx + x, y, c);
    }
    // Hanging roots.
    if (hash(x, 77) < 0.08 && Math.abs(x) < rx - 6) for (let k = 4; k < 14 + hash(x, 78) * 14; k++) s.set(cx + x, top + k, 0x4a3420);
  }
  // A waterfall spilling off the west rim, fading as it falls.
  for (let x = cx - 50; x < cx - 43; x++) {
    const len = (Hd - cy - 30) * (0.55 + hash(x, 31) * 0.45);
    for (let y = cy + 30; y < cy + 30 + len; y++) {
      const f = (y - cy - 30) / len;
      if (f > 0.75 && hash(x, y >> 1) < (f - 0.75) * 4) continue;
      s.set(x, y, (x + (y >> 3)) % 3 === 0 ? 0xbdeef4 : f > 0.8 ? 0xd8f6fa : 0xffffff);
    }
  }
  // Little rocks floating free around it.
  for (const [rx0, ry0, rr] of [[12, 104, 5], [168, 92, 4], [150, 140, 3], [30, 150, 3]]) {
    for (let y = -rr; y <= rr * 2; y++) for (let x = -rr; x <= rr; x++) {
      const top = y <= 0 && x * x + (y * 2) ** 2 <= rr * rr * 1.2;
      const under = y > 0 && Math.abs(x) <= rr * (1 - y / (rr * 2));
      if (top) s.set(rx0 + x, ry0 + y, y < -rr / 2 ? 0x86c75a : 0x63a846);
      else if (under) s.set(rx0 + x, ry0 + y, x < 0 ? 0x6e667e : 0x857d92);
    }
  }
  // The grassy top.
  for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const q = dx * dx + dy * dy;
    if (q > 1 + fbm(x * 0.1, y * 0.1, 2, 71) * 0.06) continue;
    const n = fbm(x * 0.05, y * 0.05, 2, 72);
    const t = n * 1.5 + (bayer(x, y) - 0.5) * 0.8 - dy * 0.6 - dx * 0.3;
    let c = t > 0.7 ? 0x9ad466 : t > 0 ? 0x86c75a : t > -0.6 ? 0x74b850 : 0x63a846;
    if (q > 0.86) c = dy > 0 ? 0x4f9a3c : 0xa8e070;
    s.set(x, y, c);
  }
  // A pond feeding the waterfall.
  for (let y = cy + 12; y < cy + 26; y++) for (let x = cx - 58; x < cx - 36; x++) {
    const q = ((x - (cx - 47)) / 10) ** 2 + ((y - (cy + 19)) / 6) ** 2;
    if (q < 1) s.set(x, y, q > 0.65 ? 0x8be0e0 : 0x46b0d6);
  }
  // The arena: a white stone ring with a sandy floor, two pillars and a crystal.
  const ax = cx + 6, ay = cy - 2;
  for (let y = -18; y <= 18; y++) for (let x = -34; x <= 34; x++) {
    const q = (x / 34) ** 2 + (y / 18) ** 2;
    if (q > 1) continue;
    const c = q > 0.78 ? ((Math.floor(Math.atan2(y, x) * 8) & 1) ? 0xe8e4f0 : 0xd4d0e0) : q > 0.7 ? 0x9a96aa : (hash(x >> 1, y) < 0.05 ? 0xe6d6a8 : 0xf2e4b8);
    s.set(ax + x, ay + y, c);
  }
  for (let y = 19; y < 22; y++) for (let x = -30; x <= 30; x++) if (Math.abs(x) < 34 * Math.sqrt(Math.max(0, 1 - ((y - 3) / 18) ** 2))) s.set(ax + x, ay + y, 0xa8a4b8);
  for (const px of [-40, 40]) {
    for (let y = -14; y < 2; y++) for (let x = -2; x <= 2; x++) s.set(ax + px + x, ay + y, x < 0 ? 0xd4d0e0 : 0xf4f2f8);
    for (let x = -3; x <= 3; x++) { s.set(ax + px + x, ay - 15, 0xb8b4c8); s.set(ax + px + x, ay + 2, 0xb8b4c8); }
  }
  for (let y = -40; y < -30; y++) {
    const half = Math.round(3 - Math.abs(y + 35) * 0.55);
    for (let x = -half; x <= half; x++) s.set(ax + 58 + x, ay + y + 20, x < 0 ? 0x5ac8f0 : 0xa8eaff);
  }
  // Trees around the rim.
  const trees = [[-62, -16, 1], [-50, -30, 0], [-30, -36, 2], [36, -34, 1], [56, -24, 0], [66, -6, 2], [-66, 6, 0], [24, 30, 1], [-22, 30, 0]];
  const sorted = trees.sort((a, b) => a[1] - b[1]);
  for (const [tx, ty, v] of sorted) {
    const t = roundTree(5 + v, [0x2f7a3a, 0x3f9a44, 0x5ab84e, 0x8ad46a], 0x1f3a26, v + tx);
    s.blit(t, cx + tx - (t.w >> 1), cy + ty - t.h + 2);
  }
  s.outline(INK);
  return s;
}

const shadeHex = (c: number) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return (Math.round(r * 0.78) << 16) | (Math.round(g * 0.8) << 8) | Math.round(b * 0.9);
};

/** A puffy cloud of round lumps, white on top and blue-grey underneath. */
function cloud(seed: number, w: number, h: number): Pix {
  const s = new Pix(w, h);
  const rng = new Rng(seed * 977);
  const lumps: number[][] = [];
  for (let k = 0; k < 7; k++) lumps.push([rng.range(w * 0.2, w * 0.8), rng.range(h * 0.4, h * 0.65), rng.range(h * 0.25, h * 0.42)]);
  lumps.push([w * 0.5, h * 0.6, h * 0.36]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = -9, inside = false;
    for (const [lx, ly, lr] of lumps) {
      const dx = x + 0.5 - lx, dy = y + 0.5 - ly;
      const q = (dx * dx + dy * dy) / (lr * lr);
      if (q <= 1) { inside = true; best = Math.max(best, (-dy / lr) * 0.9 + (1 - q) * 0.3 - (ly - h * 0.4) / h); }
    }
    if (!inside || y > h * 0.8) continue;
    const t = best + (bayer(x, y) - 0.5) * 0.3;
    s.set(x, y, t > 0.3 ? 0xffffff : t > -0.1 ? 0xeef4fb : 0xcfdcee);
  }
  return s;
}
