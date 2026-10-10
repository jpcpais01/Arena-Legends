import type { Sfx } from '../audio/sfx';
import type { EntranceId } from '../character/entrances';
import type { Fx, View } from './fx';
import { css, mix } from './pixel/color';
import type { Expression } from './sprite/draw';

/**
 * Pre-fight entrances, played while the sim holds before the countdown. Each
 * one is a short choreography over the fighter's own clips (run, air, land,
 * victory...) plus offsets, fades, tints and effects, so it costs no extra
 * sprites. The same player runs in battle and in the menu previews.
 */

/** A pose's frame wrapped into a clip of `n` frames (never negative). */
export const wrapFrame = (frame: number, n: number): number => (Number.isFinite(frame) ? ((Math.floor(frame) % n) + n) % n : 0);

/** What to draw for the fighter this frame. */
export interface EntrancePose {
  clip: string;
  /** Wrapped by the caller to the clip's length. */
  frame: number;
  face: Expression | null;
  /** Offset from the fighter's spot, metres (y up). */
  dx: number;
  dy: number;
  /** 0 hides the fighter (and their shadow, auras, familiars). */
  alpha: number;
  /** A colour wash over the body (frozen shell, lightning white...). */
  tint: string | null;
  tintA: number;
  /** Ground shadow strength, 0..1. */
  shadow: number;
  /** Only the part above the ground shows (rising out of a pool). */
  clipGround: boolean;
}

/** What an entrance can do to the scene around it. */
export interface EntranceHost {
  fx: Fx;
  shake(amount: number): void;
  flash(color: number, amount: number): void;
  sound(name: Sfx, k?: number): void;
}

const LEN: Record<EntranceId, number> = {
  stride: 1.55, skyfall: 1.5, smoke: 1.4, shadow: 1.65, thunder: 1.5, inferno: 1.6, frost: 1.6, meteor: 1.85, divine: 1.95,
};

export const entranceLength = (id: EntranceId): number => LEN[id];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (k: number) => 1 - (1 - clamp01(k)) ** 2;

/**
 * One fighter's entrance. `x` is the fighter's spot (world metres), `facing`
 * which way they look; it starts after `delay` seconds (hidden until then).
 */
export class Entrance {
  private t: number;
  private prev: number;
  private readonly pose: EntrancePose = { clip: 'idle', frame: 0, face: null, dx: 0, dy: 0, alpha: 1, tint: null, tintA: 0, shadow: 1, clipGround: false };
  private trailT = 0;

  constructor(readonly id: EntranceId, private host: EntranceHost, public x: number, public facing: number, delay = 0) {
    this.t = -delay;
    this.prev = this.t - 1e-6;
  }

  get done(): boolean { return this.t >= LEN[this.id]; }
  /** Seconds since it began (negative while waiting). */
  get time(): number { return this.t; }

  /** Advances and returns the pose, or null once it's over (back to the normal animation). */
  update(dt: number): EntrancePose | null {
    this.prev = this.t;
    this.t += dt;
    if (this.done) return null;
    const p = this.pose;
    p.clip = 'idle'; p.frame = 0; p.face = null; p.dx = 0; p.dy = 0; p.alpha = 1;
    p.tint = null; p.tintA = 0; p.shadow = 1; p.clipGround = false;
    if (this.t < 0) { p.alpha = 0; p.shadow = 0; return p; }
    this.trailT -= dt;
    STEPS[this.id](this, this.t, p);
    return p;
  }

  /** True on the frame the timeline passes `k`. */
  at(k: number): boolean {
    return this.prev < k && this.t >= k;
  }

  /** Every `every` seconds (for trails). */
  tick(every: number): boolean {
    if (this.trailT > 0) return false;
    this.trailT = every;
    return true;
  }

  get fx(): Fx { return this.host.fx; }
  sound(name: Sfx, k = 1): void { this.host.sound(name, k); }
  shake(a: number): void { this.host.shake(a); }
  flash(c: number, a: number): void { this.host.flash(c, a); }

  /** The flourish every entrance ends on: a raised weapon and a shout, with the crowd. */
  cheer(p: EntrancePose, t: number, from: number): void {
    if (this.at(from)) this.sound('entCheer');
    p.clip = 'victory';
    p.frame = Math.floor(Math.max(0, t - from) * 5) % 2;
  }

  /** Effects that aren't particles (pools, beams, the meteor), behind or in front of the fighter. */
  draw(g: CanvasRenderingContext2D, v: View, layer: 'under' | 'over'): void {
    const t = this.t;
    if (t < 0 || this.done) return;
    const cx = Math.round(v.sx(this.x)), gy = Math.round(v.sy(0));
    if (this.id === 'shadow' && layer === 'under') drawPool(g, cx, gy, t);
    else if (this.id === 'divine' && layer === 'under') drawBeam(g, cx, gy, t);
    else if (this.id === 'inferno' && layer === 'over') drawFireColumn(g, cx, gy, t);
    else if (this.id === 'meteor' && layer === 'over' && t < METEOR_HIT) {
      const k = t / METEOR_HIT;
      const [mx, my] = meteorAt(this, k);
      drawMeteor(g, Math.round(v.sx(mx)), Math.round(v.sy(my)), t, this.facing);
    }
  }
}

const METEOR_HIT = 0.62;
/** The meteor's path: from high behind the fighter down onto their spot. */
function meteorAt(e: Entrance, k: number): [number, number] {
  const kk = k * k;
  return [e.x - e.facing * 5.5 * (1 - kk), 9 * (1 - kk) + 0.3];
}

type Step = (e: Entrance, t: number, p: EntrancePose) => void;

const dust = (e: Entrance, x: number, count: number, spread = 1.2) =>
  e.fx.burst({ x, y: 0.1, count, jitter: 0.25 * spread, speed: [0.4, 1.4 * spread], dir: Math.PI / 2, spread: 1.3, life: [0.35, 0.7], color: 0xc8b898, color2: 0x7a6a58, kind: 'smoke', size: 3, drag: 2.5 });

const STEPS: Record<EntranceId, Step> = {
  // Walks on from behind, catches the weight and raises a fist to the crowd.
  stride(e, t, p) {
    const WALK = 0.8;
    if (t < WALK) {
      const k = t / WALK;
      p.clip = 'run';
      p.frame = Math.floor(t * 11);
      p.dx = -e.facing * 2.6 * (1 - easeOut(k * 0.5 + k * 0.5));
      p.alpha = clamp01(t / 0.15);
      if (e.tick(0.18)) { dust(e, e.x + p.dx, 2, 0.6); e.sound('entStep', 0.8); }
    } else if (t < 1.0) {
      p.clip = 'stop';
      p.frame = t < 0.9 ? 0 : 1;
      if (e.at(WALK)) dust(e, e.x + e.facing * 0.2, 5, 1);
    } else e.cheer(p, t, 1.0);
  },

  // Falls out of the sky and hits the sand hard.
  skyfall(e, t, p) {
    const HIT = 0.5;
    if (e.at(0)) e.sound('entFall');
    if (t < HIT) {
      const k = t / HIT;
      p.clip = 'air'; p.frame = 1; p.face = 'fierce';
      p.dy = 7.5 * (1 - k * k);
      p.shadow = k;
      if (e.tick(0.03)) e.fx.burst({ x: e.x, y: p.dy + 1.2, count: 2, jitter: 0.5, dir: Math.PI / 2, spread: 0.05, speed: [5, 8], life: [0.08, 0.16], color: 0xe8f4ff, color2: 0x9ab8d8, kind: 'streak' });
      return;
    }
    if (e.at(HIT)) {
      e.sound('entSlam');
      e.shake(0.9);
      e.fx.pulse('crack', e.x, 0, 1.3, 0x6a5040, 1.2);
      e.fx.pulse('groundRing', e.x, 0, 1.8, 0xe8dcc0, 0.4);
      e.fx.burst({ x: e.x, y: 0.1, count: 14, dir: Math.PI / 2, spread: 1.45, speed: [1.5, 4], life: [0.4, 0.9], color: 0xd8c8a8, color2: 0x6a5a48, kind: 'smoke', size: 3, drag: 3 });
      e.fx.burst({ x: e.x, y: 0.2, count: 12, dir: Math.PI / 2, spread: 1.1, speed: [2, 5], life: [0.4, 0.8], color: 0x8a7458, gravity: 14 });
    }
    if (t < HIT + 0.32) { p.clip = 'land'; p.frame = 0; }
    else if (t < HIT + 0.5) { p.clip = 'land'; p.frame = 1; }
    else e.cheer(p, t, HIT + 0.5);
  },

  // A bang and a cloud of smoke; they're standing in it as it clears.
  smoke(e, t, p) {
    if (e.at(0)) {
      e.sound('entPoof');
      e.fx.pulse('cloud', e.x, 0, 1.15, 0xb8b0c8, 1.25, 0x6a6280);
      e.fx.pulse('star', e.x, 1, 0.5, 0xffffff, 0.2);
      e.fx.burst({ x: e.x, y: 0.6, count: 16, jitter: 0.3, speed: [1.5, 3.5], life: [0.4, 0.9], color: 0xd0c8e0, color2: 0x5a5470, kind: 'smoke', size: 4, drag: 3 });
    }
    if (e.at(0.22)) e.fx.burst({ x: e.x, y: 2.4, count: 18, jitter: 0.8, dir: -Math.PI / 2, spread: 0.6, speed: [0.3, 1.2], life: [0.6, 1.1], color: 0xffe8a0, color2: 0xff8040, kind: 'twinkle', gravity: 2 });
    if (t < 0.25) { p.alpha = 0; p.shadow = 0; return; }
    p.alpha = clamp01((t - 0.25) / 0.25);
    p.shadow = p.alpha;
    if (t < 0.55) { p.clip = 'land'; p.frame = 0; p.face = 'fierce'; }
    else if (t < 0.72) { p.clip = 'land'; p.frame = 1; }
    else e.cheer(p, t, 0.72);
  },

  // A pool of shadow spreads; they rise out of it, still dark, and step free.
  shadow(e, t, p) {
    const RISE = 0.35, UP = 1.05;
    if (e.at(0)) e.sound('entRise');
    if (t < 1.3 && e.tick(0.05)) e.fx.burst({ x: e.x, y: 0.05, count: 2, jitter: 0.6, jitterY: 0, dir: Math.PI / 2, spread: 0.2, speed: [0.6, 1.6], life: [0.4, 0.8], color: 0xc890ff, color2: 0x3a1a60, kind: 'twinkle' });
    if (t < RISE) { p.alpha = 0; p.shadow = 0; return; }
    p.clipGround = true;
    p.shadow = 0;
    if (t < UP) {
      const k = easeOut((t - RISE) / (UP - RISE));
      p.dy = -2.3 * (1 - k);
      p.face = 'fierce';
      p.tint = '#2a1048'; p.tintA = 0.85 - k * 0.3;
      return;
    }
    if (e.at(UP)) { e.fx.pulse('ring', e.x, 1, 1.0, 0x9a50e0, 0.35); e.sound('cast'); }
    p.tint = '#2a1048'; p.tintA = Math.max(0, 0.55 - (t - UP) * 2);
    if (t < UP + 0.05) { p.clip = 'land'; p.frame = 1; return; }
    e.cheer(p, t, UP + 0.05);
  },

  // A bolt from the sky; they're crouched in its sparks, white-hot for a moment.
  thunder(e, t, p) {
    const HIT = 0.28;
    if (e.at(0)) e.fx.pulse('swirl', e.x, 1.1, 1.3, 0x7ac8ff, HIT, 0xffffff);
    if (t < HIT) { p.alpha = 0; p.shadow = 0; return; }
    if (e.at(HIT)) {
      e.sound('lightning');
      e.sound('entSlam', 0.6);
      e.fx.bolt(e.x + 0.4, 10, e.x, 0, 0x7ac8ff, 0.32);
      e.fx.bolt(e.x - 0.6, 10, e.x + 0.1, 0.2, 0x9ad8ff, 0.22);
      e.flash(0xe8f4ff, 1.4);
      e.shake(0.8);
      e.fx.pulse('groundRing', e.x, 0, 1.9, 0x9ad8ff, 0.45);
      e.fx.pulse('crack', e.x, 0, 1.0, 0x3a6aa0, 1);
      e.fx.burst({ x: e.x, y: 0.3, count: 22, dir: Math.PI / 2, spread: 1.4, speed: [2, 6], life: [0.2, 0.5], color: 0xffffff, color2: 0x7ac8ff, kind: 'streak' });
    }
    if (e.at(HIT + 0.35)) e.fx.bolt(e.x - 0.3, 2.2, e.x + 0.5, 0.4, 0x7ac8ff, 0.12);
    if (t < 1.2 && e.tick(0.07)) e.fx.burst({ x: e.x, y: 1, count: 1, jitter: 0.5, jitterY: 0.8, speed: [0.3, 1], life: [0.15, 0.3], color: 0xffffff, color2: 0x7ac8ff, kind: 'twinkle' });
    p.tint = '#ffffff'; p.tintA = Math.max(0, 1 - (t - HIT) * 3.2);
    if (t < HIT + 0.38) { p.clip = 'land'; p.frame = 0; p.face = 'fierce'; }
    else if (t < HIT + 0.52) { p.clip = 'land'; p.frame = 1; }
    else e.cheer(p, t, HIT + 0.52);
  },

  // Embers gather, a column of fire bursts out of the sand and burns down around them.
  inferno(e, t, p) {
    const ERUPT = 0.35, SHOW = 0.55, BURN = 0.95;
    if (e.at(0)) { e.fx.pulse('swirl', e.x, 0.6, 1.4, 0xffb040, ERUPT, 0xd83a1a); e.sound('cast'); }
    if (t < ERUPT && e.tick(0.04)) e.fx.burst({ x: e.x, y: 0.05, count: 2, jitter: 0.9, jitterY: 0, dir: Math.PI / 2, spread: 0.3, speed: [0.5, 1.5], life: [0.3, 0.6], color: 0xffd060, color2: 0xd83a1a, kind: 'ember' });
    if (e.at(ERUPT)) {
      e.sound('entIgnite');
      e.shake(0.5);
      e.flash(0xff8030, 0.7);
      e.fx.pulse('groundRing', e.x, 0, 1.6, 0xff8030, 0.45);
    }
    if (t > ERUPT && t < BURN + 0.2 && e.tick(0.03)) e.fx.burst({ x: e.x, y: 0.4, count: 3, jitter: 0.45, jitterY: 0.4, dir: Math.PI / 2, spread: 0.25, speed: [2, 4.5], life: [0.25, 0.55], color: 0xffe080, color2: 0xd83a1a, kind: 'flame' });
    if (t < SHOW) { p.alpha = 0; p.shadow = 0; return; }
    p.tint = '#ff9040'; p.tintA = Math.max(0, 0.7 - (t - SHOW) * 1.4);
    if (t < BURN) { p.clip = 'land'; p.frame = 1; p.face = 'fierce'; return; }
    if (e.at(BURN)) e.fx.burst({ x: e.x, y: 1, count: 16, jitter: 0.4, speed: [1, 3], life: [0.4, 0.9], color: 0xffd060, color2: 0xc83a1a, kind: 'ember' });
    e.cheer(p, t, BURN);
  },

  // Ice spikes burst up around them; they stand frozen in a shell, then shatter it.
  frost(e, t, p) {
    const BREAK = 0.8;
    if (e.at(0)) {
      e.sound('freeze');
      e.fx.pulse('icicles', e.x, 0, 1.1, 0xbff0ff, 1.0, 0x6ab8e0);
      e.fx.burst({ x: e.x, y: 0.3, count: 14, jitter: 0.9, dir: Math.PI / 2, spread: 0.7, speed: [0.5, 2], life: [0.6, 1.1], color: 0xf0ffff, color2: 0x8ad8ff, kind: 'flake', gravity: 1 });
    }
    if (t < 0.18) { p.alpha = 0; p.shadow = 0; return; }
    p.alpha = clamp01((t - 0.18) / 0.12);
    p.shadow = p.alpha;
    if (t < BREAK) {
      p.tint = '#c8f4ff'; p.tintA = 0.82;
      // The shell creaks.
      p.dx = t > BREAK - 0.2 ? ((Math.floor(t * 40) & 1) ? 0.03 : -0.03) : 0;
      return;
    }
    if (e.at(BREAK)) {
      e.sound('glass');
      e.sound('entSlam', 0.4);
      e.shake(0.45);
      e.flash(0xbff0ff, 0.6);
      e.fx.burst({ x: e.x, y: 1, count: 26, jitter: 0.35, jitterY: 0.8, dir: Math.PI / 2, spread: 1.4, speed: [2, 5], life: [0.4, 0.9], color: 0xffffff, color2: 0x8ad8ff, size: 2, gravity: 12 });
      e.fx.pulse('ring', e.x, 1, 1.1, 0xe8fbff, 0.3);
    }
    p.tint = '#c8f4ff'; p.tintA = Math.max(0, 0.5 - (t - BREAK) * 2.5);
    if (t < BREAK + 0.16) { p.clip = 'land'; p.frame = 1; p.face = 'shout'; }
    else e.cheer(p, t, BREAK + 0.16);
  },

  // Rides a blazing meteor in from the sky: the biggest impact of them all.
  meteor(e, t, p) {
    const HIT = METEOR_HIT;
    if (e.at(0)) { e.sound('entFall'); e.sound('roar', 0.6); }
    if (t < HIT) {
      const [mx, my] = meteorAt(e, t / HIT);
      if (e.tick(0.016)) {
        e.fx.burst({ x: mx, y: my, count: 3, jitter: 0.15, dir: Math.PI / 2 + e.facing * 0.6, spread: 0.4, speed: [0.5, 2], life: [0.2, 0.45], color: 0xffe080, color2: 0xc83a1a, kind: 'flame' });
        e.fx.burst({ x: mx, y: my, count: 1, jitter: 0.1, speed: [0.1, 0.4], life: [0.5, 0.9], color: 0x6a5a5a, color2: 0x2a2028, kind: 'smoke', size: 3 });
      }
      p.alpha = 0;
      p.shadow = t / HIT;
      return;
    }
    if (e.at(HIT)) {
      e.sound('explosion');
      e.sound('entSlam');
      e.shake(1.5);
      e.flash(0xffc060, 1.6);
      e.fx.pulse('crack', e.x, 0, 1.8, 0x8a3a1a, 1.4);
      e.fx.pulse('groundRing', e.x, 0, 2.4, 0xffb040, 0.5);
      e.fx.pulse('ring', e.x, 0.6, 1.4, 0xffe080, 0.3);
      e.fx.pulse('cloud', e.x, 0, 1.4, 0x5a4a4a, 1.3, 0x2a2028);
      e.fx.burst({ x: e.x, y: 0.3, count: 30, dir: Math.PI / 2, spread: 1.3, speed: [2, 6], life: [0.4, 1], color: 0xffe080, color2: 0xc83a1a, kind: 'ember' });
      e.fx.burst({ x: e.x, y: 0.3, count: 16, dir: Math.PI / 2, spread: 1, speed: [3, 6], life: [0.5, 1], color: 0x5a4038, gravity: 14, size: 2 });
    }
    if (t < 1.3 && e.tick(0.06)) e.fx.burst({ x: e.x, y: 0.1, count: 1, jitter: 0.8, jitterY: 0, dir: Math.PI / 2, spread: 0.3, speed: [0.5, 1.2], life: [0.4, 0.8], color: 0xffd060, color2: 0xd83a1a, kind: 'ember' });
    p.tint = '#ffa040'; p.tintA = Math.max(0, 0.75 - (t - HIT) * 1.6);
    if (t < HIT + 0.4) { p.clip = 'land'; p.frame = 0; p.face = 'fierce'; }
    else if (t < HIT + 0.56) { p.clip = 'land'; p.frame = 1; }
    else e.cheer(p, t, HIT + 0.56);
  },

  // A golden beam parts the sky; they float down in it, arms raised, light raining around them.
  divine(e, t, p) {
    const LAND = 1.15;
    if (e.at(0)) e.sound('entChoir');
    if (t < 1.5 && e.tick(0.05)) e.fx.burst({ x: e.x, y: 3.5, count: 2, jitter: 0.6, jitterY: 1.5, dir: -Math.PI / 2, spread: 0.2, speed: [0.3, 0.9], life: [0.5, 1], color: 0xfff4c0, color2: 0xffc040, kind: 'twinkle' });
    if (t < LAND) {
      const k = easeOut(t / LAND);
      p.clip = 'victory'; p.frame = 0; p.face = 'calm';
      p.dy = 4.2 * (1 - k);
      p.alpha = clamp01(t / 0.35);
      p.shadow = k;
      p.tint = '#fff4c0'; p.tintA = 0.5 * (1 - k);
      return;
    }
    if (e.at(LAND)) {
      e.sound('tierUp', 3);
      e.fx.pulse('groundRing', e.x, 0, 2, 0xffe070, 0.6);
      e.fx.burst({ x: e.x, y: 0.2, count: 18, jitter: 0.3, dir: Math.PI / 2, spread: 1.4, speed: [1, 3], life: [0.4, 0.9], color: 0xfff4c0, color2: 0xffb040, kind: 'twinkle' });
    }
    if (t < LAND + 0.14) { p.clip = 'land'; p.frame = 1; p.face = 'calm'; }
    else e.cheer(p, t, LAND + 0.14);
  },
};

// --- Drawn effects ---------------------------------------------------------------------------

/** A spreading pool of shadow on the ground, its rim lit violet. */
function drawPool(g: CanvasRenderingContext2D, cx: number, gy: number, t: number): void {
  const grow = easeOut(t / 0.35), fade = t > 1.15 ? clamp01(1 - (t - 1.15) / 0.4) : 1;
  const rx = Math.round(22 * grow * (0.4 + 0.6 * fade)), ry = Math.max(1, Math.round(rx * 0.24));
  if (rx < 2) return;
  for (let i = -ry; i <= ry; i++) {
    const w = Math.round(rx * Math.sqrt(1 - (i / (ry + 0.5)) ** 2));
    g.fillStyle = Math.abs(i) >= ry - 0 ? '#9a50e0' : '#12081e';
    g.fillRect(cx - w, gy + i, w * 2, 1);
    g.fillStyle = '#9a50e0';
    g.fillRect(cx - w, gy + i, 1, 1);
    g.fillRect(cx + w - 1, gy + i, 1, 1);
  }
}

/** A soft golden beam from the top of the view down to the ground. */
function drawBeam(g: CanvasRenderingContext2D, cx: number, gy: number, t: number): void {
  const k = t < 0.25 ? t / 0.25 : t > 1.35 ? clamp01(1 - (t - 1.35) / 0.6) : 1;
  if (k <= 0) return;
  const w = Math.round(14 * (0.5 + 0.5 * k));
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = '#ffc040';
  g.globalAlpha = 0.16 * k;
  g.fillRect(cx - w - 4, 0, (w + 4) * 2, gy);
  g.fillStyle = '#ffe890';
  g.globalAlpha = 0.24 * k;
  g.fillRect(cx - w, 0, w * 2, gy);
  g.fillStyle = '#fffbe8';
  g.globalAlpha = 0.3 * k;
  g.fillRect(cx - (w >> 2), 0, (w >> 2) * 2 + 1, gy);
  // Light pooling on the sand.
  g.globalAlpha = 0.35 * k;
  g.fillStyle = '#ffe890';
  g.fillRect(cx - w - 6, gy - 1, (w + 6) * 2, 2);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

const FIRE = [0xfff4c0, 0xffd060, 0xff8030, 0xd83a1a, 0x7a1a10];
/** A roaring column of fire that bursts up from the ground and burns down. */
function drawFireColumn(g: CanvasRenderingContext2D, cx: number, gy: number, t: number): void {
  const ERUPT = 0.35, END = 1.1;
  if (t < ERUPT || t > END) return;
  const k = (t - ERUPT) / (END - ERUPT);
  const h = Math.round(110 * Math.min(1, k * 6) * (1 - k * 0.5));
  const w = Math.round(13 * (1 - k * 0.75));
  const frame = Math.floor(t * 24);
  for (let y = 0; y < h; y += 2) {
    const u = y / Math.max(1, h);
    const ww = Math.max(1, Math.round(w * (1 - u * 0.55) + Math.sin(y * 0.35 + frame) * 2));
    // Hot white core low down, cooling to red at the top and edges.
    const band = Math.min(FIRE.length - 1, Math.floor(u * 3 + k * 2));
    g.fillStyle = css(FIRE[Math.min(FIRE.length - 1, band + 1)]);
    g.fillRect(cx - ww, gy - y - 2, ww * 2, 2);
    g.fillStyle = css(FIRE[band]);
    g.fillRect(cx - (ww >> 1), gy - y - 2, ww, 2);
  }
  g.globalAlpha = 1;
}

/** The meteor: a dark rock wrapped in fire, its glow leaning back along the fall. */
function drawMeteor(g: CanvasRenderingContext2D, x: number, y: number, t: number, facing: number): void {
  const fl = Math.floor(t * 30) & 1;
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = '#ff8030';
  g.globalAlpha = 0.35;
  for (let i = 1; i <= 4; i++) {
    const r = 8 - i;
    g.fillRect(x - facing * i * 4 - r, y - i * 6 - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  const R = 6;
  for (let i = -R; i <= R; i++) {
    const w = Math.round(Math.sqrt(R * R - i * i));
    g.fillStyle = css(mix(0xffd060, 0xff6020, (i + R) / (2 * R)));
    g.fillRect(x - w - 1, y + i, w * 2 + 2, 1);
  }
  const r = 4;
  for (let i = -r; i <= r; i++) {
    const w = Math.round(Math.sqrt(r * r - i * i));
    g.fillStyle = i < -1 ? '#5a4038' : '#2a1c1c';
    g.fillRect(x - w, y + i, w * 2, 1);
  }
  g.fillStyle = fl ? '#fff4c0' : '#ffd060';
  g.fillRect(x + facing * 2 - 1, y + 1, 2, 2);
}
