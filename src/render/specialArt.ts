import { inkFor, pack } from './pixel/color';
import { hash } from './pixel/tex';
import type { Sprite } from './sprite/bank';

/**
 * Hand-pixelled battle sprites for the small things that ride along with a
 * fighter or sit on the ground: the hunting hawk and the dragon whelp, the
 * thunder totem, the hourglass, the ward stone, status marks and the
 * caltrops patch. At 8 to 28 px they read best placed pixel by pixel, so
 * each one is a little character map with a palette; the ink outline is
 * added around the silhouette like the rasterizer does for the fighters.
 *
 * Everything is built once and cached. Palette entries given as
 * `[colour, shine]` are night accents (a gem, a rune, a glowing crystal):
 * they go into the sprite's `glow` layer, which battleView lights up after
 * dark, scaled by `shine`.
 */

type Pal = Record<string, number | [number, number]>;

export interface PixFrame {
  w: number;
  h: number;
  /** Anchor inside the frame (where the sprite is placed). */
  ox: number;
  oy: number;
  data: Uint32Array;
  glow: Uint32Array | null;
}

/**
 * Builds a frame from a character map. `.` and space are empty. (ax, ay) is
 * the anchor in map coordinates; the outline adds one pixel all round.
 */
export function pixFrame(rows: readonly string[], pal: Pal, ax: number, ay: number, outline = true): PixFrame {
  const p = outline ? 1 : 0;
  const w0 = Math.max(...rows.map((r) => r.length)), h0 = rows.length;
  const w = w0 + p * 2, h = h0 + p * 2;
  const data = new Uint32Array(w * h);
  const col = new Int32Array(w * h).fill(-1);
  let glow: Uint32Array | null = null;
  for (let y = 0; y < h0; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const e = pal[ch];
      if (e === undefined) throw new Error(`pixFrame: no colour for '${ch}'`);
      const [c, shine] = typeof e === 'number' ? [e, 0] : e;
      const i = (y + p) * w + x + p;
      data[i] = pack(c);
      col[i] = c;
      if (shine > 0) {
        glow ??= new Uint32Array(w * h);
        glow[i] = pack(c, Math.round(shine * 255));
      }
    }
  }
  if (outline) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (col[i] >= 0) continue;
      const n = x > 0 && col[i - 1] >= 0 ? col[i - 1] : x < w - 1 && col[i + 1] >= 0 ? col[i + 1]
        : y > 0 && col[i - w] >= 0 ? col[i - w] : y < h - 1 && col[i + w] >= 0 ? col[i + w] : -1;
      if (n >= 0) data[i] = pack(inkFor(n));
    }
  }
  return { w, h, ox: ax + p, oy: ay + p, data, glow };
}

function canvasOf(w: number, h: number, data: Uint32Array): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data.buffer as ArrayBuffer), w, h), 0, 0);
  return c;
}

const cache = new Map<string, Sprite>();

function sprite(key: string, make: () => PixFrame): Sprite {
  let s = cache.get(key);
  if (s) return s;
  const f = make();
  s = { img: canvasOf(f.w, f.h, f.data), ox: f.ox, oy: f.oy, w: f.w, h: f.h };
  if (f.glow) s.glow = canvasOf(f.w, f.h, f.glow);
  cache.set(key, s);
  return s;
}

// -----------------------------------------------------------------------------
// Hunting hawk (faces +x; anchor = the talons)
// -----------------------------------------------------------------------------

const HAWK_PAL: Pal = {
  k: 0x3a2418, B: 0x7a4a2a, l: 0xb07a42, c: 0xf2e4c6, d: 0xc8a882,
  y: 0xf2c440, Y: 0xb8862a, e: 0x141018, w: 0xffffff,
};

export type HawkPose = 'perch0' | 'perch1' | 'up' | 'down' | 'glide';

const HAWK: Record<HawkPose, { rows: string[]; ax: number; ay: number }> = {
  // Upright on the shoulder, wing folded, tail down the back.
  perch0: {
    ax: 5, ay: 10,
    rows: [
      '....kkk...',
      '...kBBBy..',
      '...BBewyy.',
      '...Bcckc.Y',
      '..kBcdcc..',
      '.kBlBcdc..',
      '.kBlBdcc..',
      '.kBBlBcd..',
      '..kBBlBc..',
      '.kkkBByy..',
      'kkk.......',
    ],
  },
  // Head turned a touch, looking ahead with the beak lifted.
  perch1: {
    ax: 5, ay: 10,
    rows: [
      '....kkky..',
      '...kBBwyy.',
      '...BBecc.Y',
      '...Bcckc..',
      '..kBcdcc..',
      '.kBlBcdc..',
      '.kBlBdcc..',
      '.kBBlBcd..',
      '..kBBlBc..',
      '.kkkBByy..',
      'kkk.......',
    ],
  },
  // Wings raised high (a flap, or rousing on the shoulder before the dive).
  up: {
    ax: 6, ay: 11,
    rows: [
      'k...........',
      'kBk.........',
      '.lBk..kkk...',
      '.klBk.kBBy..',
      '..klBkBewyy.',
      '...klBBckcY.',
      '....kBcdcc..',
      '...kBlBcdc..',
      '...kBBlcc...',
      '....kBBcd...',
      '...kkkByy...',
      '..kkk.......',
    ],
  },
  // Wings swept down and out.
  down: {
    ax: 6, ay: 10,
    rows: [
      '.......kkk...',
      '......kBBBy..',
      '......BBewyy.',
      '......Bcckc.Y',
      '.....kBcdcc..',
      'kkkBBBBlBdc..',
      '.kllBBBBlcc..',
      '..kkllBBBcd..',
      '.....kkkBBc..',
      '....kkkBByy..',
      '...kk........',
    ],
  },
  // Flying level, wings out (heading home after a dive).
  glide: {
    ax: 7, ay: 4,
    rows: [
      '...kk.........',
      '....kBk.......',
      '.....klBk.kkk.',
      'kk...kBBBkBewy',
      '.kkBBBBccccyyY',
      '...kkBBdcdc...',
      '......kBBk....',
    ],
  },
};

export function hawkSprite(pose: HawkPose): Sprite {
  return sprite('hawk.' + pose, () => { const h = HAWK[pose]; return pixFrame(h.rows, HAWK_PAL, h.ax, h.ay); });
}

// -----------------------------------------------------------------------------
// Dragon whelp (faces +x; anchor = the middle of its belly)
// -----------------------------------------------------------------------------

const WHELP_PAL: Pal = {
  R: 0x9a2a26, r: 0xd84a2a, o: 0xf27a3a, y: 0xf8d088, Y: 0xe0a860,
  h: 0xf4ecd8, e: 0x141018, w: 0xffffff, m: 0x5a1420, t: 0xffb0a0,
  f: [0xffd060, 0.5],
};

export type WhelpPose = 'hover0' | 'hover1' | 'rear' | 'breath';

const WHELP: Record<WhelpPose, { rows: string[]; ax: number; ay: number }> = {
  // Wings up, little legs tucked, tail curled under.
  hover0: {
    ax: 6, ay: 6,
    rows: [
      '.R.R.........',
      'RrRrR....hh..',
      'RrorR...hrrr.',
      '.RorrR.Rrrrro',
      '..RrrrRrewrro',
      '..RRrrrrrrrrR',
      '...rrryyrRR..',
      '..rrryyyr....',
      '.rr.ryyYr....',
      'rR...r..r....',
      'R............',
    ],
  },
  // Wings down: the downstroke.
  hover1: {
    ax: 6, ay: 6,
    rows: [
      '.........hh..',
      '........hrrr.',
      '.......Rrrrro',
      '....RrRrewrro',
      '..RRrrrrrrrrR',
      '.RoorrrrrRR..',
      'RoorRryyr....',
      'RrRRryyyr....',
      '.R.rryyYr....',
      '.rR..r..r....',
      '.R...........',
    ],
  },
  // Rearing back, chest out, wings flared: drawing breath.
  rear: {
    ax: 7, ay: 6,
    rows: [
      'R.R....hh....',
      'RrRR..hrrr...',
      'RorrR.rrrrr..',
      '.RorrRrewrro.',
      '..RrrrrrrrrR.',
      '...RrryyrRR..',
      '...rryyyyr...',
      '..rrryyyyr...',
      '.rr..yyYr....',
      'rR...r..r....',
      'R............',
    ],
  },
  // Head thrust forward, jaws wide: the breath.
  breath: {
    ax: 6, ay: 6,
    rows: [
      '.R.R......hh...',
      'RrRrR....hrrro.',
      'RrorR...Rrrewro',
      '.RorrR.Rrrrrrmf',
      '..RrrrRrrrrrmff',
      '..RRrrrrrrtttf.',
      '...rrryyrRRR...',
      '..rrryyyr......',
      '.rr.ryyYr......',
      'rR...r..r......',
      'R..............',
    ],
  },
};

export function whelpSprite(pose: WhelpPose): Sprite {
  return sprite('whelp.' + pose, () => { const h = WHELP[pose]; return pixFrame(h.rows, WHELP_PAL, h.ax, h.ay); });
}

// -----------------------------------------------------------------------------
// Thunder totem (anchor = the base, centre)
// -----------------------------------------------------------------------------

const TOTEM_PAL = (hot: number): Pal => ({
  k: 0x2a1610, w: 0x5a3820, W: 0x8a5a36, L: 0xb48050, r: 0xc8402a, p: 0x2a8ab0, P: 0x6ad0e8,
  e: 0xf2e4c6, y: 0xf2c440,
  c: [hot ? 0xb8f0ff : 0x7ad8ff, 0.9], C: [0xf4ffff, 1],
});

const TOTEM_ROWS = [
  '.....C.....',
  '....cCc....',
  '...ccCcc...',
  '....cCc....',
  '.....c.....',
  '...kWWWk...',
  'pP.wWLWw.Pp',
  'ppPwWLWwPpp',
  '.ppwWWWwpp.',
  '...rrrrr...',
  '...WeWeW...',
  '...WkWkW...',
  '...WWyWW...',
  '...WkkkW...',
  '...wWLWw...',
  '...rrrrr...',
  '...WeWeW...',
  '...WkWkW...',
  '...WWLWW...',
  '...WkkkW...',
  '...wWWWw...',
  '...WWLWw...',
  '...WWLWw...',
  '..wWWLWWw..',
  '.wwWWWWWww.',
];

/** The planted totem; `hot` while it strikes (the crystal flares). */
export function totemSprite(hot: boolean): Sprite {
  return sprite('totem.' + (hot ? 1 : 0), () => pixFrame(TOTEM_ROWS, TOTEM_PAL(hot ? 1 : 0), 5, TOTEM_ROWS.length - 1));
}

/** Where the storm crystal sits, in px above the base. */
export const TOTEM_TOP = TOTEM_ROWS.length - 2;

/** The little carved charm that rides along before the totem is planted. */
export function charmSprite(): Sprite {
  return sprite('charm', () => pixFrame([
    '.c.',
    'cCc',
    '.c.',
    'kWk',
    'WeW',
    'WkW',
    'rrr',
    'WeW',
    'wWw',
  ], TOTEM_PAL(0), 1, 4));
}

// -----------------------------------------------------------------------------
// Hourglass (anchor = centre), ward stone (anchor = centre)
// -----------------------------------------------------------------------------

const GLASS_PAL: Pal = {
  g: 0xa07020, G: 0xe8b848, q: 0x9ab8d0, Q: 0xd8f0ff, s: [0xf0c060, 0.35], S: [0xfff0b0, 0.7],
};

/** Four steps of sand trickling through. */
export function hourglassSprite(frame: number): Sprite {
  const f = ((frame % 4) + 4) % 4;
  return sprite('hourglass.' + f, () => {
    const fall = ['s..', '.s.', '..s', '.S.'][f];
    return pixFrame([
      'gGGGGGg',
      '.QsssQ.',
      '.qsssq.',
      '..qsq..',
      '...' + fall[0] + '...',
      '..q' + fall[1] + 'q..',
      '.qq' + fall[2] + 'qq.',
      '.qsSsq.',
      'gGGGGGg',
    ], GLASS_PAL, 3, 4);
  });
}

const WARD_PAL: Pal = { k: 0x4a5468, s: 0x7a889e, S: 0xa8b6c8, r: [0x8ac8ff, 0.6], R: [0xe0f4ff, 0.8] };

/** The ward stone; `lit` when it has just raised a shield. */
export function wardSprite(lit: boolean): Sprite {
  return sprite('ward.' + (lit ? 1 : 0), () => pixFrame([
    '.sss.',
    'sSrSs',
    lit ? 'SRrRs' : 'SrrrS',
    'sSrSs',
    'ssrsk',
    '.skk.',
  ], WARD_PAL, 2, 3));
}

// -----------------------------------------------------------------------------
// Status marks (anchor = bottom centre)
// -----------------------------------------------------------------------------

/** Silenced: a violet seal, a struck-through rune. */
export function silenceSprite(): Sprite {
  return sprite('silence', () => pixFrame([
    '..vvv..',
    '.vV..v.',
    'vV..hVv',
    'v..hV.v',
    'v.hV..v',
    '.vV..v.',
    '..vvv..',
  ], { v: 0x9a60f0, V: 0xd8b8ff, h: 0xfaf0ff }, 3, 6));
}

/** Afraid: a small pale skull. */
export function skullSprite(): Sprite {
  return sprite('skull', () => pixFrame([
    '.www.',
    'wwwWw',
    'wkwkW',
    'wwkwW',
    '.www.',
    '.w.W.',
  ], { w: 0xf0e4ff, W: 0xb898d8, k: 0x3a1a4a }, 2, 5));
}

/** A coin spinning in the air (Trickster's swap). */
export function coinSprite(frame: number): Sprite {
  const f = ((frame % 4) + 4) % 4;
  const rows = [
    ['.ggg.', 'gGGyg', 'gGyGg', 'gyGGg', '.ggg.'],
    ['.g.', 'gGg', 'gyg', 'gGg', '.g.'],
    ['g', 'y', 'g', 'y', 'g'],
    ['.g.', 'gyg', 'gGg', 'gyg', '.g.'],
  ][f];
  return sprite('coin.' + f, () => pixFrame(rows, { g: 0xb88a28, G: 0xf0c848, y: 0xfff4c0 }, rows[0].length >> 1, 2));
}

/** Bone claws closing around the ankles (rooted by bone spikes); `front` is the layer over the legs. */
export function boneRootSprite(front: boolean): Sprite {
  return sprite('boneRoot.' + (front ? 1 : 0), () => pixFrame(front ? [
    'b..........b',
    'Bb........bB',
    '.Bb.b..b.bB.',
    '..BbB..BbB..',
    '..dBBddBBd..',
  ] : [
    '..b......b..',
    '.bB.b..b.Bb.',
    '.B..Bb.bB..B',
    '.BdddBdBdddB',
  ], { b: 0xf4ecd8, B: 0xc8bca0, d: 0x6a5a48 }, 6, front ? 4 : 3));
}

// -----------------------------------------------------------------------------
// Caltrops patch
// -----------------------------------------------------------------------------

/** Iron caltrops strewn on the ground, seen from the side: a spike up, legs splayed (k = dark iron, i = iron, s = the tip). */
const CALTROPS = [
  ['.s.', 'kik', 'k.k'],
  ['s..', '.ik', 'kk.'],
  ['..s', 'ki.', '.kk'],
  ['.s..', 'kiik', '.k.k'],
];
export interface Patch {
  sprite: Sprite;
  /** Spike tips that glint (x from the centre, y from the ground line), pairs. */
  tips: number[];
}

const patches = new Map<string, Patch>();

/** A skinned patch: its own pieces (optional) and a colour per letter; `s` marks the tips that glint. */
export interface PatchLook {
  /** Cache key (the skin id). */
  id: string;
  shapes?: string[][];
  colors: Record<string, number>;
}

/**
 * A caltrops patch `halfW` px either side of its centre, scattered by
 * `seed`. Drawn with its anchor on the ground line; the spikes lie on the
 * floor in front of it (y 0..5). A usable item skin can bring its own look.
 */
export function caltropsPatch(seed: number, halfW: number, look?: PatchLook | null): Patch {
  const key = `${seed}.${halfW}.${look?.id ?? ''}`;
  let p = patches.get(key);
  if (p) return p;
  const w = halfW * 2 + 3, h = 9;
  const data = new Uint32Array(w * h);
  const tips: number[] = [];
  const iron = pack(0x8a92a0), dark = pack(0x2a2a36), tip = pack(0xe0e6ee), shade = pack(0x1a1420, 110);
  const shapes = look?.shapes ?? CALTROPS;
  const col: Record<string, number> = {};
  if (look) for (const [k, c] of Object.entries(look.colors)) col[k] = pack(c);
  const n = Math.round(halfW / 2.2);
  for (let k = 0; k < n; k++) {
    // Denser near the middle, thinning out at the edges.
    const u = hash(seed * 31 + k, 7) * 2 - 1;
    const x = Math.round(halfW + 1 + u * Math.abs(u) ** 0.4 * halfW * 0.96 - 1);
    const y = 1 + Math.floor(hash(seed * 17 + k, 3) * 5);
    const shape = shapes[Math.floor(hash(k, seed) * shapes.length)];
    for (let j = 0; j < shape.length; j++) for (let i = 0; i < shape[j].length; i++) {
      const ch = shape[j][i];
      const px = x + i - 1, py = y + j - 1;
      if (ch === '.' || px < 0 || py < 0 || px >= w || py >= h) continue;
      data[py * w + px] = look ? col[ch] ?? iron : ch === 's' ? tip : ch === 'k' ? dark : iron;
      if (ch === 's') tips.push(px - halfW - 1, py - 1);
    }
    // A smudge of shadow under each one.
    const sy = y + shape.length - 1;
    for (const sx of [x - 1, x + 1]) if (sy < h && sx >= 0 && sx < w && !data[sy * w + sx]) data[sy * w + sx] = shade;
  }
  p = { sprite: { img: canvasOf(w, h, data), ox: halfW + 1, oy: 1, w, h }, tips };
  patches.set(key, p);
  return p;
}

/** Drops cached patches (a new battle). */
export function clearPatches(): void {
  patches.clear();
}
