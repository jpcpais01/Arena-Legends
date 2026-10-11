import type { Sfx } from '../audio/sfx';
import type { PoseId } from '../character/finales';
import { drawRock } from './finisherArt';
import type { Fx, View } from './fx';
import type { Light } from './glfx';
import { PPM } from './sprite/animator';

/**
 * The little extras a victory pose brings with it: a glint on the saluting
 * blade, the whoosh of a twirl and the clank as it is planted, a laugh that
 * pops up over the head, motes of light rising round someone deep in thought,
 * a pillar of light on the raised weapon, a rock to put a foot on and a
 * shower of confetti. Driven by the pose's own frames, so each one lands on
 * the beat it belongs to; drawn and lit through the same host as the
 * finishers, in battle and in the menu previews.
 */

export interface PoseFxHost {
  fx: Fx;
  light(l: Light): void;
  sound(name: Sfx, k?: number): void;
}

/** Where the winner is this frame: feet (world metres), facing and the weapon tip (world), if any. */
export interface PoseSpot {
  x: number;
  y: number;
  facing: number;
  tip: [number, number] | null;
}

const UP = Math.PI / 2;
const CONFETTI: [number, number][] = [[0xff5a6a, 0xa02838], [0xffd040, 0xb08010], [0x5ad8ff, 0x2a78b0], [0x8aff9a, 0x2a9a48], [0xd890ff, 0x7a3ab0]];

interface Spec {
  /** On entering a frame of the pose clip. */
  frame?(e: PoseFx, i: number, p: PoseSpot): void;
  /** Every update while it shows. */
  tick?(e: PoseFx, t: number, p: PoseSpot): void;
  /** Drawn behind the fighter. */
  under?(e: PoseFx, g: CanvasRenderingContext2D, v: View, t: number, p: PoseSpot): void;
}

export class PoseFx {
  private last = -1;
  private prevT = -1;
  private timers = new Map<string, number>();
  private t = 0;

  /** `scale` sizes drawn shapes and particle counts (menu previews are small). */
  constructor(readonly id: PoseId, private host: PoseFxHost, readonly scale = 1) {}

  get fx(): Fx { return this.host.fx; }
  light(l: Light): void { this.host.light(l); }
  sound(name: Sfx, k = 1): void { this.host.sound(name, k); }

  /** True once every `s` seconds on a named clock. */
  every(name: string, s: number): boolean {
    const next = this.timers.get(name) ?? 0;
    if (this.t < next) return false;
    this.timers.set(name, this.t + s);
    return true;
  }

  /** True on the update the pose's clock passes `k`. */
  at(k: number): boolean {
    return this.prevT < k && this.t >= k;
  }

  /** Starts over (the pose was restarted). */
  reset(): void {
    this.last = -1;
    this.prevT = -1;
    this.t = 0;
    this.timers.clear();
  }

  /** `t` seconds into the pose, showing frame `frame` of its clip. */
  update(t: number, frame: number, p: PoseSpot): void {
    this.prevT = this.t;
    this.t = t;
    const s = SPECS[this.id];
    if (frame !== this.last) {
      this.last = frame;
      s.frame?.(this, frame, p);
    }
    s.tick?.(this, t, p);
  }

  drawUnder(g: CanvasRenderingContext2D, v: View, p: PoseSpot): void {
    SPECS[this.id].under?.(this, g, v, this.t, p);
  }

  /** A four-point glint of light at a spot. */
  glint(x: number, y: number, r: number, hi = 0xffffff, lo = 0x9ad8ff, life = 0.3): void {
    this.light({ kind: 'star', x, y, r0: r * 0.4, r1: r, w: 0.03, hi, lo, life, power: 1, fin: 0.1, real: true });
  }

  /** A pinch of confetti thrown up from a spot. */
  confetti(x: number, y: number, n: number, dir = UP, spread = 0.7, speed: [number, number] = [3, 6]): void {
    for (let i = 0; i < CONFETTI.length; i++) {
      const [c, c2] = CONFETTI[i];
      this.fx.burst({ x, y, count: Math.max(1, Math.round(n / CONFETTI.length)), dir, spread, speed, life: [1.1, 1.8], color: c, color2: c2, kind: 'petal', gravity: 2.4, drag: 2.2 });
    }
  }
}

const SPECS: Record<PoseId, Spec> = {
  cheer: {},

  // The blade comes up with a ring and a glint runs along it; now and then it catches the light again.
  salute: {
    frame(e, i, p) {
      if (i !== 1 && i !== 3) return;
      const [x, y] = p.tip ?? [p.x + p.facing * 0.3, p.y + 1.9];
      if (i === 1) e.sound('shing', 0.45);
      e.glint(x, y, i === 1 ? 0.55 : 0.35);
      e.fx.burst({ x, y, count: Math.round(3 * e.scale), jitter: 0.08, speed: [0.2, 0.6], life: [0.3, 0.5], color: 0xffffff, color2: 0x9ad8ff, kind: 'twinkle' });
    },
  },

  // Every pump of the arms sparkles.
  flex: {
    frame(e, i, p) {
      if (i !== 1 && i !== 3 && i !== 5) return;
      for (const s of [-1, 1]) {
        const x = p.x + s * 0.42, y = p.y + 1.7;
        e.glint(x, y, 0.3, 0xffffff, 0xffa060, 0.25);
        e.fx.burst({ x, y, count: Math.round(2 * e.scale + 0.5), jitter: 0.1, speed: [0.4, 1], life: [0.25, 0.45], color: 0xffffff, color2: 0xffd060, kind: 'twinkle' });
      }
      if (i === 1) e.light({ kind: 'glow', x: p.x, y: p.y + 1.2, r0: 0.6, r1: 1.2, hi: 0xffd0a0, lo: 0xa04010, life: 0.5, power: 0.35 });
    },
  },

  // At the bottom of the bow, a soft ring of light on the ground and a few drifting petals.
  bow: {
    frame(e, i, p) {
      if (i !== 2) return;
      e.light({ kind: 'ring', x: p.x, y: p.y + 0.04, r0: 0.3, r1: 1.4, w: 0.04, squash: 0.25, hi: 0xe8e0ff, lo: 0x6a5aa0, life: 0.9, power: 0.6, fin: 0.1 });
      e.fx.burst({ x: p.x, y: p.y + 2.4, count: Math.round(5 * e.scale + 1), jitter: 0.9, jitterY: 0.2, dir: -UP, spread: 0.4, speed: [0.2, 0.5], life: [1.2, 1.7], color: 0xffd0e4, color2: 0xf070a0, kind: 'petal', gravity: 0.3 });
    },
  },

  // Each half turn whooshes; the plant clanks, kicks up dust and the blade flashes.
  twirl: {
    frame(e, i, p) {
      if (i < 12) {
        if (!(i & 1)) e.sound('whoosh', 0.3);
        if (p.tip && i & 1) e.fx.burst({ x: p.tip[0], y: p.tip[1], count: 1, speed: [0.2, 0.6], life: [0.15, 0.3], color: 0xffffff, color2: 0x9ad8ff, kind: 'streak' });
        return;
      }
      if (i !== 12) return;
      e.sound('block', 0.6);
      const x = p.x + p.facing * 0.45;
      e.light({ kind: 'ring', x, y: p.y + 0.04, r0: 0.2, r1: 1.2, w: 0.05, squash: 0.25, hi: 0xffffff, lo: 0x9ad8ff, life: 0.45, power: 0.8, fin: 0 });
      for (const d of [0.25, Math.PI - 0.25]) e.fx.burst({ x, y: p.y + 0.1, count: Math.round(3 * e.scale + 1), dir: d, spread: 0.3, speed: [0.6, 1.6], life: [0.3, 0.6], color: 0xd8c8a8, color2: 0x6a5a48, kind: 'smoke', size: 2, drag: 3 });
      if (p.tip) e.glint(p.tip[0], p.tip[1], 0.5);
    },
  },

  // The laugh pops up over the head, HA by HA.
  hips: {
    frame(e, i, p) {
      if (i < 1 || i > 5 || !(i & 1)) return;
      const n = (i - 1) / 2;
      const x = p.x + p.facing * (0.1 + n * 0.22), y = p.y + 2.25 + n * 0.12;
      e.fx.pop(n === 2 ? 'HA!' : 'HA', x, y, { color: '#ffe080', shade: '#c88a20', scale: e.scale < 1 ? 1 : 2 }, 0.75, 1.1);
    },
  },

  // Calm: motes of light drift up round the kneeling body and a slow aura breathes with it.
  meditate: {
    frame(e, i, p) {
      if (i === 2 && e.at(0.28)) e.sound('bell', 0.35);
      if (i < 2) return;
      e.light({ kind: 'glow', x: p.x, y: p.y + 0.9, r0: 0.7, r1: 1.2, hi: 0xd0ffe8, lo: 0x2a8a68, life: 1.6, power: 0.4, fin: 0.5 });
      e.light({ kind: 'ring', x: p.x, y: p.y + 0.04, r0: 0.5, r1: 1.3, w: 0.03, squash: 0.25, hi: 0xd0ffe8, lo: 0x2a8a68, life: 1.4, power: 0.45, fin: 0.3 });
    },
    tick(e, t, p) {
      if (t < 0.25 || !e.every('mote', e.scale < 1 ? 0.22 : 0.12)) return;
      e.fx.burst({ x: p.x, y: p.y + 0.2, count: 1, jitter: 0.6, jitterY: 0.3, dir: UP, spread: 0.2, speed: [0.3, 0.6], life: [0.9, 1.4], color: 0xe8fff4, color2: 0x5ad8a8, kind: 'twinkle', gravity: -0.2 });
    },
  },

  // As the weapon reaches the sky, a pillar of light comes down on it and motes rise round the winner.
  skyward: {
    frame(e, i, p) {
      if (i === 1) {
        e.sound('entChoir', 0.5);
        e.sound('shing', 0.4);
        const [x, y] = p.tip ?? [p.x, p.y + 2.6];
        e.glint(x, y, 0.8, 0xffffff, 0xffd060, 0.45);
        e.light({ kind: 'rays', x, y, r0: 0.6, r1: 1.6, hi: 0xfff4c0, lo: 0xc8901a, life: 0.8, power: 0.5, fin: 0 });
        e.light({ kind: 'ring', x: p.x, y: p.y + 0.04, r0: 0.3, r1: 1.8, w: 0.05, squash: 0.25, hi: 0xfff4c0, lo: 0xc8901a, life: 0.7, power: 0.8, fin: 0 });
      }
    },
    tick(e, t, p) {
      if (t < 0.18) return;
      // The pillar, laid down again and again so it holds steady.
      if (e.every('beam', 0.5)) e.light({ kind: 'beam', x: p.x + p.facing * 0.05, y: p.y, r0: 9, r1: 9, w: 0.5, rot: UP, hi: 0xfff4c0, lo: 0xffb040, life: 1.1, power: 0.42, fin: 0.45 });
      if (e.every('rise', e.scale < 1 ? 0.12 : 0.07)) e.fx.burst({ x: p.x, y: p.y + 0.1, count: 1, jitter: 0.5, dir: UP, spread: 0.1, speed: [1, 2.2], life: [0.6, 1], color: 0xfff4c0, color2: 0xffb040, kind: 'twinkle' });
    },
  },

  // Foot up on a rock; the crowd roars and confetti goes up, then keeps drifting down.
  champion: {
    frame(e, i, p) {
      if (i !== 1) return;
      e.sound('entCheer', 0.6);
      e.sound('entSlam', 0.3);
      for (const s of [-1, 1]) e.confetti(p.x + s * 1.1, p.y + 0.2, Math.round(16 * e.scale), UP - s * 0.35, 0.35, [4, 7]);
      if (p.tip) e.glint(p.tip[0], p.tip[1], 0.45, 0xffffff, 0xffd040);
    },
    tick(e, t, p) {
      if (t > 0.6 && e.every('drift', e.scale < 1 ? 0.18 : 0.09)) {
        const [c, c2] = CONFETTI[Math.floor(t * 13) % CONFETTI.length];
        e.fx.burst({ x: p.x, y: p.y + 3.2, count: 1, jitter: 1.8, jitterY: 0.3, dir: -UP, spread: 0.3, speed: [0.3, 0.7], life: [1.4, 2], color: c, color2: c2, kind: 'petal', gravity: 0.5 });
      }
    },
    under(_e, g, v, t, p) {
      // The rock, nudged up out of the sand as the foot comes down on it.
      const k = Math.min(1, t / 0.12);
      const x = Math.round(v.sx(p.x + p.facing * ROCK_X)), gy = Math.round(v.sy(p.y));
      drawRock(g, x, gy + Math.round((1 - k) * 4), 7, Math.round(ROCK_H * PPM));
    },
  },
};

/** The champion's rock: how far ahead of the feet (m) and how tall (m, to the raised foot's sole). */
const ROCK_X = 0.4;
const ROCK_H = 0.22;
