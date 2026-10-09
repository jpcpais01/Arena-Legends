// Pixel-art UI frames. Each frame is one corner drawn as a character grid; the
// other three corners are mirrored from it, with the right and bottom sides one
// shade darker so the light comes from the top left. The result is a small
// canvas used as a CSS border-image (9-slice), so panels, plaques and select
// cursors get real pixel ornaments at any size for the cost of one image each.
//
// `--px` is the size of one UI art pixel in CSS px, rounded to whole device
// pixels so every frame pixel lands on the same number of screen pixels.

/** Palette: one char per colour; DARKER gives each one's shade on the right and bottom sides. */
const PAL: Record<string, string> = {
  k: '#0a0612', // ink
  G: '#ffe58f', g: '#f2b542', d: '#b06c1e', D: '#5a3010', // gold
  W: '#ffffff', w: '#d8cff0', S: '#8a7cb8', s: '#54467e', t: '#2c2248', T: '#1a1330', // iron / stone
  R: '#ff5a62', r: '#b02a40', // ruby
  C: '#9ef4ff', c: '#3ab0e0', // sapphire
  p: '#1a1329', // panel fill under the rim
};
const DARKER: Record<string, string> = { W: 'w', G: 'g', g: 'd', d: 'D', w: 'S', S: 's', s: 't', t: 'T', C: 'c', R: 'r' };

interface FrameDef {
  /** Top-left corner, K×K, outside edge first. Row K-1 and column K-1 are the edge profiles. */
  corner: string[];
}

const FRAMES = {
  /** Main panel: ink, a bevelled gold rim with rivets, then a dark inner line. */
  gold: {
    corner: [
      '..kkkkk',
      '.kGGGGG',
      'kGWGggg',
      'kGGddkk',
      'kGgdkpp',
      'kGgkppp',
      'kGgkppp',
    ],
  },
  /** Secondary panel: dark iron with a rivet. */
  iron: {
    corner: [
      '.kkkkk',
      'kSSSSS',
      'kSwSss',
      'kSSttt',
      'kSstkk',
      'kSstkp',
    ],
  },
  /** Selection cursor: bright gold corner brackets, no edges. */
  cursor: {
    corner: [
      'kkkkkk.',
      'kGGGGk.',
      'kGgkkk.',
      'kGk....',
      'kGk....',
      'kkk....',
      '.......',
    ],
  },
  /** Ribbon-free title plaque: thin gold double line. */
  plaque: {
    corner: [
      '.kkkk',
      'kdGGG',
      'kGkkk',
      'kGkpp',
      'kGkpp',
    ],
  },
} satisfies Record<string, FrameDef>;

export type FrameName = keyof typeof FRAMES;

function draw(def: FrameDef): HTMLCanvasElement {
  const k = def.corner.length;
  const n = k * 2 + 1;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  // Edge profiles: the last row of the corner is the left edge, the last column the top edge.
  const at = (x: number, y: number): string => {
    // Fold into the top-left quadrant; remember which sides we mirrored from.
    const right = x > k, bottom = y > k;
    const fx = right ? n - 1 - x : x, fy = bottom ? n - 1 - y : y;
    let ch: string;
    if (fx === k && fy === k) return '.';
    if (fx === k) ch = def.corner[Math.min(fy, k - 1)][k - 1];
    else if (fy === k) ch = def.corner[k - 1][Math.min(fx, k - 1)];
    else if (fx < k && fy < k) ch = def.corner[fy][fx];
    else ch = '.';
    // Which edge this pixel belongs to: the nearer one.
    const horiz = fy <= fx;
    const dark = horiz ? bottom : right;
    return dark ? DARKER[ch] ?? ch : ch;
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const ch = at(x, y);
      if (ch === '.') continue;
      g.fillStyle = PAL[ch];
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

/** A small tiling texture: a sparse dither of a lighter tone. */
function dither(size: number, dots: [number, number][], col: string): string {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = col;
  for (const [x, y] of dots) g.fillRect(x, y, 1, 1);
  return c.toDataURL();
}

let lastPx = 0;
function setPx(): void {
  const root = document.documentElement;
  const rem = parseFloat(getComputedStyle(root).fontSize) || 16;
  const dpr = window.devicePixelRatio || 1;
  // One art pixel is about a sixth of the root font: 2.7px desktop, 2.3px phones.
  const px = Math.max(1, Math.round((rem / 6) * dpr)) / dpr;
  if (px === lastPx) return;
  lastPx = px;
  root.style.setProperty('--px', `${px}px`);
}

/** Builds every frame once and publishes them as CSS variables (`--frame-gold`, …) plus `--px`. */
export function installFrames(): void {
  const root = document.documentElement;
  for (const [name, def] of Object.entries(FRAMES)) {
    root.style.setProperty(`--frame-${name}`, `url(${draw(def).toDataURL()})`);
    root.style.setProperty(`--slice-${name}`, String(def.corner.length));
  }
  root.style.setProperty('--tex-panel', `url(${dither(8, [[0, 0], [4, 4]], 'rgba(255,255,255,0.035)')})`);
  root.style.setProperty('--tex-cloth', `url(${dither(4, [[0, 0], [2, 2]], 'rgba(0,0,0,0.18)')})`);
  setPx();
  window.addEventListener('resize', setPx);
  matchMedia('(orientation: portrait)').addEventListener('change', setPx);
}
