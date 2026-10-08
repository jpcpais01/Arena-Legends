import { Rng } from '../core/rng';
import { mix } from './pixel/color';
import { bayer, Pix } from './pixel/paint';
import { buildIsle } from './isleArt';

/**
 * Hand-painted (procedurally) arena backdrops. Everything is built as plain
 * pixel buffers so it can be previewed headless; `ArenaView` turns them into
 * canvases and scrolls them with parallax.
 *
 * Layout, from the ground line `gy` (where feet stand) upward:
 *   floor (perspective rows) · wall (gates, torches) · stands with the crowd ·
 *   distant city · mountains · clouds · sky.
 */

export interface Theme {
  id: string;
  name: string;
  /** Which painter builds it: the walled colosseum (default) or the floating isle. */
  kind?: 'isle';
  sky: number[];
  body: { color: number; glow: number; r: number; x: number; y: number; moon?: boolean };
  stars: boolean;
  cloud: [number, number, number];
  mountFar: number;
  mountNear: number;
  snow: number | null;
  city: number;
  windows: number;
  stone: number;
  stoneDark: number;
  gate: number;
  trim: number;
  crowd: number[];
  skins: number[];
  banner: number[];
  floor: number;
  slab: number;
  grout: number;
  emblem: number;
  /** Warm light pooled around torches and braziers. */
  fire: number;
}

export const THEMES: Theme[] = [
  {
    id: 'dusk', name: 'Sunset Colosseum',
    sky: [0x2a1f4f, 0x46306e, 0x74407e, 0xae5476, 0xe4775e, 0xf7a85c, 0xffd486],
    body: { color: 0xfff1b8, glow: 0xffc070, r: 22, x: 0.68, y: 0.42 },
    stars: false,
    cloud: [0xffc29a, 0xd27a7e, 0x8a4e78],
    mountFar: 0x8a4f80, mountNear: 0x5e3768, snow: null,
    city: 0x47295a, windows: 0xffc070,
    stone: 0xb08466, stoneDark: 0x7a5650, gate: 0x2e1c2c, trim: 0xd8b07a,
    crowd: [0xc84a4a, 0x4a7ad0, 0xe8c050, 0x5aa860, 0xe8e0d0, 0x8a5ac8, 0xd87a3a, 0x3a3a50],
    skins: [0xf0c8a0, 0xd8a078, 0xa87050, 0x8a5a3e],
    banner: [0xc83a3a, 0x2f5fd0],
    floor: 0xd0a873, slab: 0xb89068, grout: 0x8a6448, emblem: 0xe8c890,
    fire: 0xffa040,
  },
  {
    id: 'night', name: 'Moonlit Keep',
    sky: [0x0a0f26, 0x101a3a, 0x182a52, 0x22406a, 0x2e5a80, 0x3e7290],
    body: { color: 0xf0f4ff, glow: 0x9ab8e8, r: 15, x: 0.26, y: 0.3, moon: true },
    stars: true,
    cloud: [0x5a7aa8, 0x3a5480, 0x26385e],
    mountFar: 0x22385e, mountNear: 0x182846, snow: 0x8aa8d0,
    city: 0x141e38, windows: 0xffd080,
    stone: 0x6a7490, stoneDark: 0x434a66, gate: 0x101426, trim: 0x9aa6c4,
    crowd: [0x8a3a4a, 0x3a5aa0, 0xb89a50, 0x4a7a60, 0xa8b0c0, 0x6a4a98, 0x9a5a3a, 0x2a2a40],
    skins: [0xd8b8a0, 0xb08870, 0x8a6650, 0x6a4a3a],
    banner: [0x6a3ab0, 0x2a8a8a],
    floor: 0x7a8296, slab: 0x666e84, grout: 0x464c62, emblem: 0xa8b4d0,
    fire: 0xffa850,
  },
  {
    id: 'jade', name: 'Jade Temple',
    sky: [0x2e6a80, 0x4a8c98, 0x72aeaa, 0xa2ccb4, 0xd2e6c4, 0xf4f2d2],
    body: { color: 0xffffe8, glow: 0xfff0b0, r: 18, x: 0.36, y: 0.3 },
    stars: false,
    cloud: [0xf8fae8, 0xc8dcc0, 0x8ab0a0],
    mountFar: 0x6a9c96, mountNear: 0x4a7e72, snow: null,
    city: 0x34605a, windows: 0xfff0a0,
    stone: 0x7aa08a, stoneDark: 0x4a7266, gate: 0x1c3434, trim: 0xd8c070,
    crowd: [0xd84a4a, 0xe8b040, 0x3a8ad0, 0xf0e8d8, 0x8a5ac8, 0x4aa060, 0xd87a9a, 0x2e3a3a],
    skins: [0xf0d0a8, 0xd8a880, 0xb07a58, 0x8a5e44],
    banner: [0xd83a3a, 0xe8b040],
    floor: 0xb8b08a, slab: 0x9a9a78, grout: 0x6a7058, emblem: 0xe8d898,
    fire: 0xffb040,
  },
  {
    id: 'isle', name: 'Skygrove Isle', kind: 'isle',
    sky: [0x3672cc, 0x4a8cdc, 0x66a8e8, 0x8cc6f0, 0xb8e0f4, 0xe4f4f2],
    body: { color: 0xfffbe2, glow: 0xfff0b4, r: 15, x: 0.74, y: 0.26 },
    stars: false,
    cloud: [0xffffff, 0xdae8f6, 0xb4cae4],
    mountFar: 0x8eaed6, mountNear: 0x7898c4, snow: 0xf2f8ff,
    city: 0x6a8ab0, windows: 0xfff0a0,
    stone: 0x828c86, stoneDark: 0x5a6462, gate: 0x24343a, trim: 0x8ef0d6,
    crowd: [0xd84a5a, 0xe8b040, 0x3a8ad0, 0xf0e8d8, 0x8a5ac8, 0xe07a3a, 0xd87a9a, 0x2e4a5a],
    skins: [0xf0d0a8, 0xd8a880, 0xb07a58, 0x8a5e44],
    banner: [0xd84a6a, 0xe8b040],
    floor: 0x58a84a, slab: 0xbf9666, grout: 0x3f8a42, emblem: 0xffe07a,
    fire: 0x8ef0d6,
  },
];

export interface Layer {
  pix: Pix;
  /** Parallax factor (0 = fixed, 1 = moves with the world). */
  factor: number;
  /** Screen y of the layer's top. */
  y: number;
  /** Slow wind drift in px/s (the layer must tile horizontally). */
  drift?: number;
}

export interface ArenaArt {
  theme: Theme;
  gy: number;
  /** Screen y of the vanishing line used by the floor. */
  hy: number;
  floorTop: number;
  wallFactor: number;
  layers: Layer[];
  /** Two crowd frames, same placement as the stands layer. */
  crowd: [Pix, Pix];
  crowdLayer: Layer;
  /** Floor texture: u = world px (centre at w/2), v = depth row. */
  floor: Pix;
  /** Torch positions in stands-layer coordinates. */
  torches: [number, number][];
  /** World-anchored pillar sprite drawn at the arena bounds. */
  pillar: Pix;
  /** Layers drawn over the floor (the isle's underside). */
  front: Layer[];
  /** Screen row where the floor stops (the isle's front lip). */
  floorEnd: number;
  /** Floating crystal over each pillar; without one the pillars carry burning braziers. */
  crystal: Pix | null;
  /** Colours of petals and leaves drifting on the wind, if any. */
  motes: number[] | null;
}

/** `travel`: how far (px) the camera can travel from centre. */
export function buildArena(theme: Theme, W: number, H: number, gy: number, travel: number, seed = 7): ArenaArt {
  if (theme.kind === 'isle') return buildIsle(theme, W, H, gy, travel, seed);
  const rng = new Rng(seed);
  const wallFactor = 0.78;
  const floorTop = gy - 22;
  // Floor perspective: scale s(y) = (y − hy) / (gy − hy) matches the wall's parallax at floorTop.
  const hy = gy - 22 / (1 - wallFactor);
  const lw = (f: number) => Math.ceil(W + 2 * travel * f + 8);

  // --- Sky -------------------------------------------------------------------
  const skyH = floorTop;
  const sky = new Pix(W, skyH);
  sky.gradient(0, 0, W, skyH, theme.sky);
  if (theme.stars) {
    for (let i = 0; i < W * skyH * 0.0016; i++) {
      const x = rng.int(0, W - 1), y = rng.int(0, Math.floor(skyH * 0.6));
      sky.set(x, y, rng.chance(0.2) ? 0xffffff : 0xa8c0e8);
      if (rng.chance(0.06)) { sky.set(x + 1, y, 0x6a88b8); sky.set(x - 1, y, 0x6a88b8); sky.set(x, y + 1, 0x6a88b8); sky.set(x, y - 1, 0x6a88b8); }
    }
  }
  const b = theme.body;
  const bx = Math.round(W * b.x), by = Math.round(skyH * b.y);
  // Halo rings, dithered.
  for (let k = 3; k >= 1; k--) {
    const r = b.r + k * 9;
    for (let y = by - r; y <= by + r; y++) for (let x = bx - r; x <= bx + r; x++) {
      const d = Math.hypot(x - bx, y - by) / r;
      if (d > 1) continue;
      if (bayer(x, y) < 0.22 + (3 - k) * 0.2) sky.set(x, y, mix(sky.get(x, y) ? unpack(sky.get(x, y)) : b.glow, b.glow, 0.35 + (3 - k) * 0.15));
    }
  }
  sky.ellipse(bx, by, b.r, b.r, b.color);
  if (b.moon) {
    sky.ellipse(bx - 4, by - 3, 4, 3, mix(b.color, b.glow, 0.5));
    sky.ellipse(bx + 5, by + 5, 3, 2, mix(b.color, b.glow, 0.5));
  } else {
    // Sun bands near the horizon.
    for (let i = 0; i < 3; i++) sky.rect(bx - b.r, by + 6 + i * 5, b.r * 2 + 1, 1 + (i >> 1), unpack(sky.get(0, by + 6 + i * 5)) || theme.sky[3]);
  }

  // --- Clouds (slow) --------------------------------------------------------------
  const clouds = new Pix(lw(0.06), skyH);
  for (let i = 0; i < Math.ceil(clouds.w / 140) + 2; i++) {
    const cx = rng.range(0, clouds.w), cy = rng.range(skyH * 0.12, skyH * 0.55);
    paintCloud(clouds, cx, cy, rng.range(30, 70), rng, theme.cloud);
  }

  // --- Mountains -------------------------------------------------------------------
  const mFar = new Pix(lw(0.12), skyH);
  const horizon = theme.sky[theme.sky.length - 1];
  ridge(mFar, rng, gy - 128, 44, theme.mountFar, mix(theme.mountFar, theme.body.glow, 0.35), mix(theme.mountFar, horizon, 0.3), theme.snow);
  const mNear = new Pix(lw(0.2), skyH);
  ridge(mNear, rng, gy - 112, 26, theme.mountNear, mix(theme.mountNear, theme.body.glow, 0.3), mix(theme.mountNear, horizon, 0.25), null);

  // --- Distant city -------------------------------------------------------------------
  const city = new Pix(lw(0.35), skyH);
  paintCity(city, rng, gy - 112, theme);

  // --- Stands + wall ---------------------------------------------------------------------
  const stands = new Pix(lw(wallFactor), floorTop + 1);
  const crowdA = new Pix(stands.w, stands.h), crowdB = new Pix(stands.w, stands.h);
  const torches: [number, number][] = [];
  paintStands(stands, crowdA, crowdB, torches, rng, gy, floorTop, theme);

  // --- Floor texture --------------------------------------------------------------------
  const floor = paintFloor(rng, theme, Math.ceil(W / 0.65 + 2 * travel * 1.6 + 64), Math.ceil(gy - hy + 0) * 2);

  const pillar = paintPillar(theme, 132);

  const L = (pix: Pix, factor: number, y = 0): Layer => ({ pix, factor, y });
  const crowdLayer = L(crowdA, wallFactor);
  return {
    theme, gy, hy, floorTop, wallFactor,
    layers: [L(sky, 0), L(clouds, 0.06), L(mFar, 0.12), L(mNear, 0.2), L(city, 0.35), L(stands, wallFactor)],
    crowd: [crowdA, crowdB], crowdLayer, floor, torches, pillar,
    front: [], floorEnd: Infinity, crystal: null, motes: null,
  };
}

const unpack = (c: number) => ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255);

function paintCloud(p: Pix, cx: number, cy: number, w: number, rng: Rng, [light, mid, dark]: [number, number, number]): void {
  const puffs: [number, number, number][] = [];
  for (let i = 0; i < 5; i++) puffs.push([cx + rng.range(-w / 2, w / 2), cy - rng.range(0, 7), rng.range(5, 11)]);
  const inside = (x: number, y: number) => {
    if (y > cy + 3) return false;
    for (const [px, py, r] of puffs) if (((x - px) / (r * 1.6)) ** 2 + ((y - py) / r) ** 2 <= 1) return true;
    return Math.abs(x - cx) < w / 2 && y > cy - 2 && y <= cy + 3;
  };
  for (let y = Math.floor(cy - 20); y <= cy + 4; y++) for (let x = Math.floor(cx - w); x <= cx + w; x++) {
    if (!inside(x, y)) continue;
    const top = !inside(x, y - 2), bottom = !inside(x, y + 2);
    const c = top ? light : bottom ? dark : bayer(x, y) < 0.5 ? mid : (y < cy - 3 ? light : mid);
    p.set(x, y, c);
  }
}

function ridge(p: Pix, rng: Rng, base: number, amp: number, color: number, lit: number, haze: number, snow: number | null): void {
  // Midpoint displacement ridge line.
  const n = 64;
  const pts = new Float32Array(n + 1);
  pts[0] = rng.range(0.3, 0.9); pts[n] = rng.range(0.3, 0.9);
  for (let step = n; step > 1; step >>= 1) {
    for (let i = step >> 1; i < n; i += step) {
      pts[i] = (pts[i - (step >> 1)] + pts[i + (step >> 1)]) / 2 + rng.range(-0.5, 0.5) * (step / n) * 1.6;
    }
  }
  const top = new Int32Array(p.w);
  for (let x = 0; x < p.w; x++) {
    const t = (x / p.w) * n, i = Math.min(n - 1, Math.floor(t)), f = t - i;
    const v = Math.max(0, pts[i] * (1 - f) + pts[i + 1] * f);
    top[x] = Math.round(base - v * amp);
  }
  for (let x = 0; x < p.w; x++) {
    const rising = top[Math.min(p.w - 1, x + 1)] < top[Math.max(0, x - 1)];
    for (let y = top[x]; y < p.h; y++) {
      const depth = y - top[x];
      let c = color;
      // Sunlit rims on the slopes facing the light, then haze toward the base.
      if (!rising && depth < 2) c = lit;
      else if (depth > 6 && bayer(x, y) < Math.min(0.5, (depth - 6) / 60)) c = haze;
      if (snow && depth < 2 + ((x * 5) % 3) && top[x] < base - amp * 0.6) c = snow;
      p.set(x, y, c);
    }
  }
}

function paintCity(p: Pix, rng: Rng, base: number, th: Theme): void {
  let x = rng.range(-10, 10);
  while (x < p.w) {
    const w = rng.int(8, 22), h = rng.int(10, 34);
    const top = base - h;
    p.rect(x, top, w, p.h - top, th.city);
    // Roofs: spires, domes or battlements.
    const kind = rng.int(0, 2);
    if (kind === 0) p.poly([x - 1, top, x + w / 2, top - rng.int(6, 14), x + w + 1, top], th.city);
    else if (kind === 1) p.ellipse(x + w / 2, top, w / 2, w / 3, th.city);
    else for (let i = 0; i < w; i += 3) p.rect(x + i, top - 2, 2, 2, th.city);
    for (let wy = top + 4; wy < base - 2; wy += 5) for (let wx = x + 2; wx < x + w - 2; wx += 4) {
      if (rng.chance(0.28)) p.set(wx, wy, th.windows);
    }
    x += w + rng.int(-2, 6);
  }
}

function paintStands(p: Pix, ca: Pix, cb: Pix, torches: [number, number][], rng: Rng, gy: number, floorTop: number, th: Theme): void {
  const W = p.w;
  const wallTop = gy - 76;
  const standsTop = gy - 124;
  const stone = th.stone, dark = th.stoneDark;
  const light = mix(stone, 0xffffff, 0.18);
  // Stands: stepped tiers receding upward.
  const tiers = 4;
  const tierH = Math.floor((wallTop - standsTop) / tiers);
  for (let t = 0; t < tiers; t++) {
    const y = standsTop + t * tierH;
    p.rect(0, y, W, tierH, mix(dark, th.sky[2], 0.25 - t * 0.05));
    p.rect(0, y + tierH - 2, W, 2, mix(stone, th.sky[2], 0.2 - t * 0.04));
  }
  // Railing and awning posts on the top tier.
  p.rect(0, standsTop - 3, W, 3, mix(dark, 0x000000, 0.2));
  for (let x = rng.int(0, 40); x < W; x += 96) {
    p.rect(x, standsTop - 30, 3, 28, mix(dark, 0x000000, 0.25));
    // Pennant.
    const col = th.banner[(x / 96) & 1];
    p.poly([x + 3, standsTop - 30, x + 17, standsTop - 26, x + 3, standsTop - 22], col);
    p.set(x + 4, standsTop - 29, mix(col, 0xffffff, 0.4));
  }
  // Crowd: little people on every tier, two frames (bobbing, arms up).
  for (let t = 0; t < tiers; t++) {
    const y = standsTop + t * tierH + tierH - 2;
    for (let x = rng.int(0, 4); x < W; x += rng.int(5, 8)) {
      if (rng.chance(0.08)) continue;
      const shirt = mix(th.crowd[rng.int(0, th.crowd.length - 1)], th.sky[2], 0.22 - t * 0.04);
      const skin = mix(th.skins[rng.int(0, th.skins.length - 1)], th.sky[2], 0.18);
      const hair = mix(rng.pick([0x2a1a14, 0x5a3a20, 0xc89040, 0x1a1a24, 0xa83a2a]), th.sky[2], 0.2);
      const hop = rng.chance(0.45);
      const cheer = rng.chance(0.3);
      for (const [buf, up] of [[ca, 0], [cb, hop ? 1 : 0]] as const) {
        const yy = y - up;
        buf.rect(x, yy - 5, 4, 5, shirt);
        buf.rect(x, yy - 5, 4, 1, mix(shirt, 0xffffff, 0.2));
        buf.rect(x + 1, yy - 8, 3, 3, skin);
        buf.rect(x + 1, yy - 9, 3, 1, hair);
        if (buf === cb && cheer) { buf.set(x - 1, yy - 7, skin); buf.set(x - 1, yy - 8, skin); buf.set(x + 4, yy - 7, skin); buf.set(x + 4, yy - 8, skin); }
      }
    }
  }
  // Arena wall: stone courses with a lit top ledge.
  p.rect(0, wallTop, W, floorTop - wallTop + 1, stone);
  for (let y = wallTop + 4; y < floorTop; y += 7) {
    p.rect(0, y, W, 1, dark);
    const off = ((y / 7) & 1) * 9;
    for (let x = off; x < W; x += 18) p.rect(x, y + 1, 1, 6, dark);
  }
  for (let y = wallTop; y < floorTop; y++) for (let x = 0; x < W; x++) {
    // Weathering: dithered darker bottom, speckles.
    const t = (y - wallTop) / (floorTop - wallTop);
    if (bayer(x, y) < t * 0.45) p.set(x, y, mix(stone, dark, 0.55));
    else if (((x * 7 + y * 13) % 23) === 0) p.set(x, y, light);
  }
  p.rect(0, wallTop - 4, W, 4, th.trim);
  p.rect(0, wallTop - 4, W, 1, mix(th.trim, 0xffffff, 0.35));
  p.rect(0, wallTop, W, 1, mix(dark, 0x000000, 0.3));
  // Gates with torches between.
  for (let x = rng.int(20, 60); x < W - 20; x += rng.int(150, 190)) {
    const gw = 22, gh = 34;
    const gx = x, gyT = floorTop - gh;
    p.rect(gx - 3, gyT - 3, gw + 6, gh + 3, th.trim);
    p.ellipse(gx + gw / 2, gyT, gw / 2 + 3, 8, th.trim);
    p.rect(gx, gyT, gw, gh, th.gate);
    p.ellipse(gx + gw / 2, gyT, gw / 2, 6, th.gate);
    // Portcullis bars.
    for (let i = 3; i < gw; i += 4) p.rect(gx + i, gyT - 4, 1, gh + 4, mix(th.gate, th.stone, 0.35));
    for (let j = gyT + 4; j < floorTop; j += 6) p.rect(gx, j, gw, 1, mix(th.gate, th.stone, 0.3));
    // Banners on either side.
    for (const [k, bx] of [gx - 22, gx + gw + 12].entries()) {
      const col = th.banner[k];
      p.rect(bx, wallTop + 2, 10, 30, col);
      p.rect(bx, wallTop + 2, 10, 2, mix(col, 0x000000, 0.35));
      p.rect(bx + 1, wallTop + 4, 1, 28, mix(col, 0xffffff, 0.25));
      p.poly([bx, wallTop + 32, bx + 5, wallTop + 37, bx + 10, wallTop + 32], col);
      p.ellipse(bx + 5, wallTop + 16, 2.5, 3, th.trim);
    }
    // Torch sconce: light pooled on the wall.
    const tx = gx + gw + 46;
    if (tx < W - 6) {
      const ty = wallTop + 14;
      for (let y = ty - 14; y < ty + 16; y++) for (let xx = tx - 16; xx < tx + 16; xx++) {
        const d = Math.hypot(xx - tx, (y - ty) * 1.2) / 16;
        if (d < 1 && bayer(xx, y) < (1 - d) * 0.5 && p.has(xx, y)) p.set(xx, y, mix(unpack(p.get(xx, y)), th.fire, 0.35));
      }
      p.rect(tx - 1, ty, 3, 7, mix(th.gate, th.stone, 0.4));
      p.rect(tx - 2, ty, 5, 2, th.trim);
      torches.push([tx, ty - 1]);
    }
  }
  // Wall base shadow line where it meets the floor.
  p.rect(0, floorTop - 1, W, 2, mix(dark, 0x000000, 0.35));
}

function paintFloor(rng: Rng, th: Theme, w: number, h: number): Pix {
  const p = new Pix(w, h);
  const cx = w / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = bayer(x * 3 + y, y * 5 + x);
    p.set(x, y, n < 0.12 ? mix(th.floor, th.grout, 0.25) : n > 0.93 ? mix(th.floor, 0xffffff, 0.12) : th.floor);
  }
  // Slab paths: courses of stone slabs, staggered, with sand between some.
  const rowH = 12;
  for (let y = 0; y < h; y += rowH) {
    const off = rng.int(0, 40);
    for (let x = -off; x < w; x += 44) {
      if (rng.chance(0.22)) continue;
      const sw = 40, sh = rowH - 2;
      p.rect(x + 1, y + 1, sw, sh, th.slab);
      p.rect(x + 1, y + 1, sw, 1, mix(th.slab, 0xffffff, 0.15));
      p.rect(x + 1, y + sh, sw, 1, th.grout);
      p.rect(x + sw, y + 1, 1, sh, th.grout);
      if (rng.chance(0.3)) {
        // A crack.
        let px = x + rng.int(8, 30), py = y + 2;
        for (let i = 0; i < 6; i++) { p.set(px, py, th.grout); px += rng.int(-1, 1); py += 1; if (py > y + sh) break; }
      }
    }
  }
  // Centre emblem ring (a circle top-down; perspective squashes it).
  const ey = Math.round(h * 0.5);
  for (let y = 0; y < h; y++) for (let x = Math.floor(cx - 90); x < cx + 90; x++) {
    const d = Math.hypot(x - cx, (y - ey) * 2.6);
    if ((d > 72 && d < 78) || (d > 52 && d < 55)) p.set(x, y, th.emblem);
    else if (d >= 78 && d < 80) p.set(x, y, th.grout);
  }
  // Pebbles.
  for (let i = 0; i < w * h * 0.004; i++) p.set(rng.int(0, w - 1), rng.int(0, h - 1), mix(th.grout, th.floor, 0.4));
  return p;
}

function paintPillar(th: Theme, h: number): Pix {
  const w = 30;
  const p = new Pix(w, h);
  const stone = th.stone, dark = th.stoneDark, lit = mix(stone, 0xffffff, 0.22);
  const top = 16;
  // Shaft with fluting.
  for (let y = top; y < h - 6; y++) for (let x = 6; x < 24; x++) {
    const u = (x - 6) / 18;
    const c = u < 0.18 ? lit : u > 0.7 ? dark : (x % 4 === 0 ? mix(stone, dark, 0.4) : stone);
    p.set(x, y, c);
  }
  // Base and capital.
  p.rect(3, h - 6, 24, 6, stone); p.rect(3, h - 6, 24, 1, lit); p.rect(3, h - 1, 24, 1, dark);
  p.rect(4, top - 4, 22, 4, stone); p.rect(4, top - 4, 22, 1, lit);
  p.rect(2, top - 8, 26, 4, th.trim); p.rect(2, top - 8, 26, 1, mix(th.trim, 0xffffff, 0.4));
  // Brazier bowl.
  p.poly([4, 0, 26, 0, 22, 8, 8, 8], mix(th.trim, 0x000000, 0.35));
  p.rect(4, 0, 22, 1, th.trim);
  p.outline(mix(dark, 0x000000, 0.55));
  return p;
}

/** Floor row mapping: perspective scale and texture row for screen row `y`. */
export function floorRow(a: ArenaArt, y: number): { s: number; v: number } {
  const s = (y + 0.5 - a.hy) / (a.gy - a.hy);
  return { s, v: Math.min(a.floor.h - 1, Math.max(0, Math.round((a.gy - a.hy) / s))) };
}
