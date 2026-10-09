import { Raster, type Frame } from '../pixel/raster';
import { clipLength, frameSpec, type ClipSet } from './anims';
import type { AnimOut } from './animator';
import { drawFigure, figureMarks } from './draw';
import type { CharacterArt } from './look';

export interface Sprite {
  img: HTMLCanvasElement;
  /** Feet position inside the image. */
  ox: number;
  oy: number;
  w: number;
  h: number;
  /** Main and secondary weapon tips relative to the feet, when in hand. */
  tip?: [number, number];
  secTip?: [number, number];
  /** Night accents: the parts of the gear that shine after dark (additive layer, same frame). */
  glow?: HTMLCanvasElement;
  /** Spots in the frame where night sparkles may twinkle (x, y pairs). */
  sparks?: number[];
}

const OX = 88, OY = 126;
let shared: Raster | null = null;

function toCanvas(f: Frame, data = f.data): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, f.w);
  c.height = Math.max(1, f.h);
  if (f.w && f.h) {
    const img = new ImageData(new Uint8ClampedArray(data.buffer as ArrayBuffer, data.byteOffset, f.w * f.h * 4), f.w, f.h);
    c.getContext('2d')!.putImageData(img, 0, 0);
  }
  return c;
}

/** A sprite filled with one colour (hit flash, silhouettes). */
export function solidOf(s: Sprite, color: string): Sprite {
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  const g = c.getContext('2d')!;
  g.drawImage(s.img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, s.w, s.h);
  return { ...s, img: c };
}

/**
 * Lazily drawn sprites for one character. Frames are rasterized the first
 * time they're shown; `warm` pre-draws within a time budget so battles start
 * without hitches.
 */
export class SpriteBank {
  private sprites = new Map<string, Sprite>();
  private flashes = new Map<string, Sprite>();
  private queue: { clip: string; frame: number }[] = [];

  constructor(readonly art: CharacterArt, readonly set: ClipSet) {
    // Most-seen clips first.
    const first = ['idle', 'run', 'back', 'hurt'];
    const order = [...first, ...[...set.clips.keys()].filter((k) => !first.includes(k))];
    for (const clip of order) {
      const c = set.clips.get(clip);
      if (!c) continue;
      for (let i = 0; i < clipLength(c); i++) this.queue.push({ clip, frame: i });
    }
  }

  get(o: AnimOut): Sprite {
    return this.sprites.get(o.key) ?? this.draw(o.key, o.clip, o.frame, o.face, o.secOut, o.useOut);
  }

  flash(o: AnimOut, color = '#fff'): Sprite {
    const k = o.key + color;
    let s = this.flashes.get(k);
    if (!s) { s = solidOf(this.get(o), color); this.flashes.set(k, s); }
    return s;
  }

  /** Draws queued frames until `budgetMs` is spent. Returns true when done. */
  warm(budgetMs: number): boolean {
    const end = performance.now() + budgetMs;
    while (this.queue.length && performance.now() < end) {
      const q = this.queue.shift()!;
      const key = `${q.clip}.${q.frame}.`;
      if (!this.sprites.has(key)) this.draw(key, q.clip, q.frame, null, false);
    }
    return !this.queue.length;
  }

  private draw(key: string, clip: string, frame: number, face: AnimOut['face'], secOut: boolean, useOut = false): Sprite {
    const c = this.set.clips.get(clip) ?? this.set.clips.get('idle')!;
    const r = (shared ??= new Raster(176, 150));
    r.clear();
    // Animated skin surfaces step with the frame. Their loops are four steps
    // long; the idle loop has more frames, so it is spread over them evenly
    // (0,1,1,2,3,3 for six) to wrap seamlessly.
    r.phase = clip === 'idle' ? Math.floor((frame * 4) / Math.max(4, c.w.length)) : frame;
    drawFigure(r, this.art, frameSpec(c, frame, face, secOut, useOut), OX, OY);
    const { tip, secTip } = figureMarks;
    const f = r.compose(OX, OY, true, true);
    const s: Sprite = { img: toCanvas(f), ox: f.ox, oy: f.oy, w: f.w, h: f.h, tip: tip ? [tip[0] - OX, tip[1] - OY] : undefined,
      secTip: secTip ? [secTip[0] - OX, secTip[1] - OY] : undefined,
      glow: f.glow && toCanvas(f, f.glow), sparks: f.sparks,
    };
    this.sprites.set(key, s);
    return s;
  }
}
