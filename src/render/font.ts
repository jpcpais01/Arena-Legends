/**
 * Tiny bitmap font for text drawn inside the pixel scene (damage numbers,
 * callouts). Glyphs are 5 rows tall and drawn with a 1px dark outline so they
 * read over anything. Rendered strings are cached as canvases.
 */

const G: Record<string, string[]> = {
  '0': ['.##.', '#..#', '#..#', '#..#', '.##.'],
  '1': ['.#', '##', '.#', '.#', '.#'],
  '2': ['###.', '...#', '.##.', '#...', '####'],
  '3': ['###.', '...#', '.##.', '...#', '###.'],
  '4': ['#..#', '#..#', '####', '...#', '...#'],
  '5': ['####', '#...', '###.', '...#', '###.'],
  '6': ['.##.', '#...', '###.', '#..#', '.##.'],
  '7': ['####', '...#', '..#.', '.#..', '.#..'],
  '8': ['.##.', '#..#', '.##.', '#..#', '.##.'],
  '9': ['.##.', '#..#', '.###', '...#', '.##.'],
  A: ['.##.', '#..#', '####', '#..#', '#..#'],
  B: ['###.', '#..#', '###.', '#..#', '###.'],
  C: ['.###', '#...', '#...', '#...', '.###'],
  D: ['###.', '#..#', '#..#', '#..#', '###.'],
  E: ['####', '#...', '###.', '#...', '####'],
  F: ['####', '#...', '###.', '#...', '#...'],
  G: ['.###', '#...', '#.##', '#..#', '.###'],
  H: ['#..#', '#..#', '####', '#..#', '#..#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['...#', '...#', '...#', '#..#', '.##.'],
  K: ['#..#', '#.#.', '##..', '#.#.', '#..#'],
  L: ['#...', '#...', '#...', '#...', '####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  P: ['###.', '#..#', '###.', '#...', '#...'],
  Q: ['.##.', '#..#', '#..#', '#.#.', '.#.#'],
  R: ['###.', '#..#', '###.', '#.#.', '#..#'],
  S: ['.###', '#...', '.##.', '...#', '###.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#..#', '#..#', '#..#', '#..#', '.##.'],
  V: ['#..#', '#..#', '#..#', '.##.', '.##.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#..#', '#..#', '.##.', '#..#', '#..#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['####', '..#.', '.#..', '#...', '####'],
  ' ': ['..', '..', '..', '..', '..'],
  '!': ['#', '#', '#', '.', '#'],
  '?': ['###', '..#', '.#.', '...', '.#.'],
  '.': ['.', '.', '.', '.', '#'],
  ',': ['.', '.', '.', '#', '#'],
  ':': ['.', '#', '.', '#', '.'],
  '-': ['...', '...', '###', '...', '...'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '%': ['#..#', '..#.', '.#..', '#...', '#..#'],
  "'": ['#', '#', '.', '.', '.'],
  '(': ['.#', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '#.'],
};

export interface TextStyle {
  color: string;
  /** Outline colour. */
  ink?: string;
  /** Pixel size of each glyph pixel. */
  scale?: number;
  /** Optional darker bottom row for a bit of depth. */
  shade?: string;
}

const cache = new Map<string, HTMLCanvasElement>();

export function textWidth(s: string, scale = 1): number {
  let w = 0;
  for (const ch of s.toUpperCase()) w += ((G[ch] ?? G['?'])[0].length + 1) * scale;
  return Math.max(0, w - scale) + 2;
}

/** A canvas with the string drawn (outline included). */
export function textSprite(s: string, st: TextStyle): HTMLCanvasElement {
  const sc = st.scale ?? 1;
  const key = `${s}|${st.color}|${st.ink}|${sc}|${st.shade}`;
  let c = cache.get(key);
  if (c) return c;
  if (cache.size > 400) cache.clear();
  const up = s.toUpperCase();
  const w = textWidth(up, sc), h = 5 * sc + 2;
  c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const plot = (color: string, dx: number, dy: number, rowColor?: (row: number) => string) => {
    let x = 1 + dx;
    for (const ch of up) {
      const gl = G[ch] ?? G['?'];
      for (let r = 0; r < 5; r++) {
        g.fillStyle = rowColor ? rowColor(r) : color;
        for (let i = 0; i < gl[r].length; i++) if (gl[r][i] === '#') g.fillRect(x + i * sc, 1 + dy + r * sc, sc, sc);
      }
      x += (gl[0].length + 1) * sc;
    }
  };
  const ink = st.ink ?? '#1a1420';
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) plot(ink, dx, dy);
  plot(st.color, 0, 0, st.shade ? (r) => (r >= 4 ? st.shade! : st.color) : undefined);
  cache.set(key, c);
  return c;
}

export function drawText(g: CanvasRenderingContext2D, s: string, x: number, y: number, st: TextStyle, align: 'left' | 'center' | 'right' = 'center'): void {
  const c = textSprite(s, st);
  const ax = align === 'center' ? Math.round(x - c.width / 2) : align === 'right' ? Math.round(x - c.width) : Math.round(x);
  g.drawImage(c, ax, Math.round(y - c.height / 2));
}
