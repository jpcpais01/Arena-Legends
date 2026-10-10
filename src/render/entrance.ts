import type { Sfx } from '../audio/sfx';
import type { EntranceId } from '../character/entrances';
import type { Fx, View } from './fx';
import { css, mix } from './pixel/color';
import { PPM } from './sprite/animator';
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
  /** Turned the other way this frame (spins, tumbles). */
  flip: boolean;
  /** Afterimages trailing behind: how many, metres apart (world x), and their colour (null: the plain sprite). */
  ghosts: number;
  ghostDx: number;
  ghostCol: string | null;
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
  whirlwind: 1.75, cannon: 1.6, bats: 1.7, jackpot: 1.6, blade: 1.55, quake: 2.0, rift: 1.85, starborn: 1.85, phoenix: 1.95,
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
  private readonly pose: EntrancePose = { clip: 'idle', frame: 0, face: null, dx: 0, dy: 0, alpha: 1, tint: null, tintA: 0, shadow: 1, clipGround: false, flip: false, ghosts: 0, ghostDx: 0, ghostCol: null };
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
    p.tint = null; p.tintA = 0; p.shadow = 1; p.clipGround = false; p.flip = false; p.ghosts = 0; p.ghostDx = 0; p.ghostCol = null;
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
    else if (this.id === 'whirlwind' && layer === 'over') drawTwister(g, Math.round(v.sx(twisterX(this, t))), gy, t);
    else if (this.id === 'bats' && layer === 'over') drawBats(g, v, this, t);
    else if (this.id === 'jackpot' && layer === 'under') drawCoinPile(g, cx, gy, t);
    else if (this.id === 'blade' && layer === 'over') drawSlashes(g, cx, gy, t);
    else if (this.id === 'quake' && layer === 'under') drawPillar(g, cx, gy, t);
    else if (this.id === 'rift' && layer === 'under') drawRift(g, Math.round(v.sx(riftX(this))), gy, t);
    else if (this.id === 'starborn') drawStars(g, v, this, gy, t, layer);
    else if (this.id === 'phoenix' && layer === 'under') drawWings(g, cx, gy, t);
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

/** The whirlwind's x: in from far behind, slowing over the spot. */
function twisterX(e: Entrance, t: number): number {
  return e.x - e.facing * 4.2 * (1 - easeOut(t / 0.75));
}
/** The rift opens just behind the hero's spot. */
const riftX = (e: Entrance) => e.x - e.facing * 0.9;

const PILLAR_TOP = 40;
/** The rock pillar's height (art px): bursts up, holds, sinks back after the jump. */
function pillarH(t: number): number {
  if (t < 0.35) return 0;
  if (t < 0.55) return PILLAR_TOP * easeOut((t - 0.35) / 0.2);
  if (t < 1.05) return PILLAR_TOP;
  return PILLAR_TOP * Math.max(0, 1 - (t - 1.05) / 0.5);
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
  // A tornado tears in from behind and spits them out, still spinning.
  whirlwind(e, t, p) {
    const OUT = 0.95;
    if (e.at(0)) e.sound('entWind');
    if (t < 1.05 && e.tick(0.04)) {
      const tx = twisterX(e, t);
      e.fx.burst({ x: tx, y: 0.2, count: 2, jitter: 0.5, jitterY: 0.2, dir: Math.PI / 2, spread: 0.4, speed: [1.5, 3], life: [0.3, 0.6], color: 0x9ac860, color2: 0x4a7a30, kind: 'petal', gravity: 1 });
      e.fx.burst({ x: tx, y: 0.05, count: 1, jitter: 0.4, jitterY: 0, dir: Math.PI / 2, spread: 1, speed: [0.4, 1], life: [0.3, 0.6], color: 0xc8b898, color2: 0x7a6a58, kind: 'smoke', size: 3 });
    }
    if (t < 0.45) { p.alpha = 0; p.shadow = 0; return; }
    if (t < OUT) {
      const k = (t - 0.45) / (OUT - 0.45);
      p.dx = twisterX(e, t) - e.x;
      p.dy = 0.7 * Math.sin(k * Math.PI);
      p.clip = 'air'; p.frame = 0; p.face = 'fierce';
      p.flip = (Math.floor(t * 16) & 1) === 1;
      p.alpha = clamp01((t - 0.45) / 0.15);
      p.shadow = p.alpha;
      return;
    }
    if (e.at(OUT)) { dust(e, e.x, 8, 1.2); e.sound('entSlam', 0.4); }
    if (t < OUT + 0.18) { p.clip = 'land'; p.frame = t < OUT + 0.09 ? 0 : 1; }
    else e.cheer(p, t, OUT + 0.18);
  },

  // Fired from a cannon offstage: a tumbling arc, a skidding landing.
  cannon(e, t, p) {
    const LAND = 0.62;
    if (e.at(0)) { e.sound('entCannon'); e.shake(0.35); }
    if (t < LAND) {
      const k = t / LAND;
      p.dx = -e.facing * 6.5 * (1 - k);
      p.dy = 1.2 * (1 - k) + 4.2 * k * (1 - k) * 1.6;
      p.clip = 'air'; p.frame = Math.floor(t * 12); p.face = 'shout';
      p.flip = (Math.floor(t * 10) & 1) === 1;
      p.shadow = k;
      if (e.tick(0.03)) e.fx.burst({ x: e.x + p.dx, y: p.dy + 0.9, count: 1, jitter: 0.1, speed: [0.1, 0.3], life: [0.4, 0.8], color: 0xd8d0c8, color2: 0x6a6470, kind: 'smoke', size: 3 });
      return;
    }
    if (e.at(LAND)) { e.sound('entSlam', 0.7); e.shake(0.5); e.fx.pulse('groundRing', e.x, 0, 1.4, 0xe8dcc0, 0.35); }
    if (t < LAND + 0.3) {
      // Skids to a stop on the spot.
      const k = (t - LAND) / 0.3;
      p.dx = -e.facing * 0.7 * (1 - easeOut(k));
      p.clip = 'land'; p.frame = 0; p.face = 'fierce';
      if (e.tick(0.04)) dust(e, e.x + p.dx + e.facing * 0.2, 2, 0.8);
      return;
    }
    if (t < LAND + 0.42) { p.clip = 'land'; p.frame = 1; }
    else e.cheer(p, t, LAND + 0.42);
  },

  // Bats gather into a whirling dark cloud, then scatter: the hero is standing inside.
  bats(e, t, p) {
    const REVEAL = 0.95;
    if (e.at(0)) e.sound('entBats');
    if (e.at(REVEAL)) { e.sound('entBats', 1.2); e.fx.pulse('ring', e.x, 1, 1.2, 0xc04060, 0.3); }
    if (t < REVEAL - 0.12) { p.alpha = 0; p.shadow = 0; return; }
    p.alpha = clamp01((t - (REVEAL - 0.12)) / 0.15);
    p.shadow = p.alpha;
    p.tint = '#1a0a20'; p.tintA = Math.max(0, 0.8 - (t - REVEAL) * 2.4);
    if (t < REVEAL + 0.15) { p.clip = 'land'; p.frame = 1; p.face = 'fierce'; }
    else e.cheer(p, t, REVEAL + 0.15);
  },

  // A golden statue in a shower of coins; it cracks and the hero shakes off the gold.
  jackpot(e, t, p) {
    const BREAK = 0.85;
    if (e.at(0)) {
      e.sound('entCoins');
      e.fx.pulse('star', e.x, 1.1, 0.8, 0xffd040, 0.25);
      e.flash(0xffe080, 0.6);
    }
    if (t < 1.1 && e.tick(0.04)) {
      e.fx.burst({ x: e.x, y: 4.2, count: 2, jitter: 1.3, jitterY: 0.4, dir: -Math.PI / 2, spread: 0.2, speed: [0.5, 1.5], life: [0.7, 1.1], color: 0xffe070, color2: 0xc88a20, size: 2, gravity: 9 });
      if ((Math.floor(t * 25) & 3) === 0) e.fx.pulse('coin', e.x + (Math.random() - 0.5) * 1.6, 0, 0.8 + Math.random() * 0.6, 0xffd040, 0.5);
    }
    if (e.at(0.4)) e.sound('gems');
    if (t < 0.12) { p.alpha = 0; p.shadow = 0; return; }
    p.alpha = clamp01((t - 0.12) / 0.12);
    p.shadow = p.alpha;
    if (t < BREAK) { p.tint = '#ffd040'; p.tintA = 0.88; p.clip = 'victory'; p.frame = 0; return; }
    if (e.at(BREAK)) {
      e.sound('shing');
      e.sound('entCoins', 0.8);
      e.fx.burst({ x: e.x, y: 1, count: 24, jitter: 0.35, jitterY: 0.8, dir: Math.PI / 2, spread: 1.4, speed: [2, 4.5], life: [0.4, 0.9], color: 0xffe070, color2: 0xc88a20, size: 2, gravity: 12 });
      e.fx.burst({ x: e.x, y: 1.2, count: 10, jitter: 0.5, jitterY: 0.7, speed: [0.3, 1], life: [0.3, 0.6], color: 0xffffff, color2: 0xffd040, kind: 'twinkle' });
    }
    p.tint = '#ffd040'; p.tintA = Math.max(0, 0.6 - (t - BREAK) * 2.5);
    if (t < BREAK + 0.14) { p.clip = 'land'; p.frame = 1; p.face = 'shout'; }
    else e.cheer(p, t, BREAK + 0.14);
  },

  // A blur of afterimages straight through the spot and back; the air splits a beat later.
  blade(e, t, p) {
    const PAST = 0.28, BACK = 0.62, CUT = 0.95;
    const f = e.facing;
    if (e.at(0)) e.sound('whoosh');
    if (e.at(PAST + 0.06)) e.sound('whoosh', 1.2);
    if (t < PAST) {
      const k = t / PAST;
      p.dx = f * (-4.5 + 6 * k);
      p.clip = 'run'; p.frame = 1; p.face = 'fierce';
      p.ghosts = 4; p.ghostDx = f * 0.5; p.ghostCol = '#9ad8ff';
      p.alpha = clamp01(t / 0.08);
      p.shadow = 0.5;
      return;
    }
    if (t < PAST + 0.08) { p.dx = f * 1.5; p.clip = 'stop'; p.frame = 0; p.shadow = 0.7; return; }
    if (t < BACK) {
      const k = (t - PAST - 0.08) / (BACK - PAST - 0.08);
      p.dx = f * 1.5 * (1 - easeOut(k));
      p.clip = 'back'; p.frame = 1; p.face = 'fierce';
      p.ghosts = 3; p.ghostDx = -f * 0.4; p.ghostCol = '#9ad8ff';
      p.shadow = 0.7;
      return;
    }
    if (t < CUT) { p.clip = 'stop'; p.frame = t < BACK + 0.1 ? 0 : 1; p.face = 'calm'; return; }
    if (e.at(CUT)) {
      e.sound('shing');
      e.shake(0.4);
      e.flash(0xe8f4ff, 0.5);
      e.fx.burst({ x: e.x, y: 1.1, count: 14, jitter: 1.4, jitterY: 0.4, dir: 0, spread: Math.PI, speed: [1, 3], life: [0.2, 0.45], color: 0xffffff, color2: 0x9ad8ff, kind: 'streak' });
    }
    e.cheer(p, t, CUT);
  },

  // The ground rumbles, a rock pillar bursts up carrying the hero; they leap down as it crumbles.
  quake(e, t, p) {
    const BURST = 0.35, JUMP = 1.0, LAND = 1.32;
    if (e.at(0)) e.sound('entRumble');
    if (t < BURST) {
      if (e.tick(0.08)) { e.shake(0.18); dust(e, e.x + (Math.random() - 0.5) * 1.2, 1, 0.5); }
      p.alpha = 0; p.shadow = 0;
      return;
    }
    if (e.at(BURST)) {
      e.sound('entSlam');
      e.shake(0.7);
      e.fx.pulse('crack', e.x, 0, 1.4, 0x5a4030, 1.3);
      e.fx.burst({ x: e.x, y: 0.4, count: 14, dir: Math.PI / 2, spread: 0.9, speed: [2, 5], life: [0.4, 0.9], color: 0x8a7458, color2: 0x4a3a30, gravity: 12, size: 2 });
    }
    if (t < JUMP) {
      p.dy = pillarH(t) / PPM;
      p.clip = t < BURST + 0.2 ? 'land' : 'idle'; p.frame = 0; p.face = 'fierce';
      p.shadow = 0;
      return;
    }
    if (e.at(JUMP)) e.sound('whoosh');
    if (t < LAND) {
      const k = (t - JUMP) / (LAND - JUMP);
      p.dy = (PILLAR_TOP / PPM) * (1 - k) + 1.2 * Math.sin(k * Math.PI);
      p.dx = e.facing * 0.25 * Math.sin(k * Math.PI);
      p.clip = 'air'; p.frame = k < 0.5 ? 0 : 1; p.face = 'fierce';
      p.shadow = k;
      return;
    }
    if (e.at(LAND)) { e.sound('entSlam', 0.8); e.shake(0.6); dust(e, e.x, 10, 1.3); e.fx.pulse('groundRing', e.x, 0, 1.6, 0xd8c8a8, 0.4); }
    if (t < LAND + 0.2) { p.clip = 'land'; p.frame = t < LAND + 0.1 ? 0 : 1; }
    else e.cheer(p, t, LAND + 0.2);
  },

  // A starry rift tears open; the hero steps out of it, and it implodes behind them.
  rift(e, t, p) {
    const OUT = 0.45, FREE = 0.95, SHUT = 1.15;
    if (e.at(0)) e.sound('entPortal');
    if (t < 1.1 && e.tick(0.05)) e.fx.burst({ x: riftX(e), y: 1.2, count: 2, jitter: 0.3, jitterY: 1, speed: [0.2, 0.8], life: [0.3, 0.6], color: 0xd8c8ff, color2: 0x6a40d0, kind: 'twinkle' });
    if (e.at(SHUT)) {
      e.sound('castBig');
      e.flash(0xb090ff, 0.6);
      e.fx.pulse('swirl', riftX(e), 1.2, 1.4, 0xb090ff, 0.35, 0x40e0d0);
      e.fx.pulse('ring', riftX(e), 1.2, 1.6, 0x9a70ff, 0.35);
    }
    if (t < OUT) { p.alpha = 0; p.shadow = 0; return; }
    if (t < FREE) {
      const k = (t - OUT) / (FREE - OUT);
      p.dx = riftX(e) - e.x + (e.x - riftX(e)) * easeOut(k);
      p.clip = 'run'; p.frame = Math.floor(t * 7); p.face = 'calm';
      p.alpha = clamp01(k * 2.5);
      p.shadow = p.alpha;
      p.tint = '#9a70ff'; p.tintA = 0.7 * (1 - k);
      return;
    }
    if (t < SHUT + 0.05) { p.clip = 'stop'; p.frame = t < FREE + 0.1 ? 0 : 1; return; }
    e.cheer(p, t, SHUT + 0.05);
  },

  // Night falls; stars draw the hero as a constellation, and it flares into flesh.
  starborn(e, t, p) {
    const FLARE = 1.05;
    if (e.at(0.1)) e.sound('entStars');
    if (t < FLARE) { p.alpha = 0; p.shadow = 0; return; }
    if (e.at(FLARE)) {
      e.sound('tierUp', 3);
      e.flash(0xe8f0ff, 1);
      e.fx.pulse('ring', e.x, 1, 1.5, 0xc8e0ff, 0.4);
      e.fx.burst({ x: e.x, y: 1, count: 24, jitter: 0.4, jitterY: 0.8, speed: [1.5, 4], life: [0.4, 0.9], color: 0xffffff, color2: 0x8ab0ff, kind: 'twinkle' });
    }
    p.tint = '#e8f0ff'; p.tintA = Math.max(0, 1 - (t - FLARE) * 2.5);
    if (t < FLARE + 0.18) { p.clip = 'land'; p.frame = 1; p.face = 'calm'; }
    else e.cheer(p, t, FLARE + 0.18);
  },

  // Embers flare into a phoenix; its burning wings beat once and the hero is reborn in the fire.
  phoenix(e, t, p) {
    const RISE = 0.35, SHOW = 0.55, BEAT = 1.15;
    if (t < RISE && e.tick(0.04)) e.fx.burst({ x: e.x, y: 0.05, count: 2, jitter: 0.4, jitterY: 0, dir: Math.PI / 2, spread: 0.3, speed: [0.4, 1.2], life: [0.3, 0.6], color: 0xffd060, color2: 0xd83a1a, kind: 'ember' });
    if (e.at(RISE)) { e.sound('entIgnite'); e.sound('entPhoenix'); e.flash(0xff8030, 0.6); e.shake(0.4); }
    if (t > RISE && t < BEAT && e.tick(0.03)) e.fx.burst({ x: e.x, y: 1.2, count: 2, jitter: 1.2, jitterY: 0.6, dir: Math.PI / 2, spread: 0.4, speed: [0.5, 1.5], life: [0.3, 0.6], color: 0xffe080, color2: 0xd83a1a, kind: 'flame' });
    if (t < SHOW) { p.alpha = 0; p.shadow = 0; return; }
    if (e.at(BEAT)) {
      e.sound('entPhoenix', 1.3);
      e.sound('explosion', 0.5);
      e.shake(0.6);
      e.fx.pulse('groundRing', e.x, 0, 2.2, 0xff8030, 0.45);
      e.fx.burst({ x: e.x, y: 1.3, count: 30, jitter: 0.4, jitterY: 0.5, speed: [2, 5], life: [0.4, 0.9], color: 0xffe080, color2: 0xc83a1a, kind: 'flame' });
    }
    p.alpha = clamp01((t - SHOW) / 0.2);
    p.shadow = p.alpha;
    p.tint = '#ff8030'; p.tintA = t < BEAT ? 0.7 : Math.max(0, 0.6 - (t - BEAT) * 2);
    if (t < BEAT) { p.clip = 'victory'; p.frame = 0; p.face = 'calm'; p.dy = 0.15 * Math.sin((t - SHOW) * 6); p.shadow = 0.6; return; }
    if (t < BEAT + 0.16) { p.clip = 'land'; p.frame = 1; p.face = 'shout'; }
    else e.cheer(p, t, BEAT + 0.16);
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

/** A dusty tornado, its bands swirling and swaying, fading as it leaves. */
function drawTwister(g: CanvasRenderingContext2D, cx: number, gy: number, t: number): void {
  const k = t < 0.15 ? t / 0.15 : t > 0.85 ? clamp01(1 - (t - 0.85) / 0.3) : 1;
  if (k <= 0) return;
  const H = Math.round(78 * (0.6 + 0.4 * k));
  for (let y = 0; y < H; y += 2) {
    const u = y / H;
    const w = (4 + u * 22) * (0.5 + 0.5 * k);
    const sway = Math.sin(u * 4 + t * 9) * 4 * u;
    const x0 = cx + sway;
    for (let b = 0; b < 3; b++) {
      const ph = t * 18 + y * 0.32 + b * 2.1;
      const px = Math.round(x0 + Math.cos(ph) * w);
      const front = Math.sin(ph) > 0;
      g.globalAlpha = (front ? 0.85 : 0.4) * k;
      g.fillStyle = front ? '#e8e0c8' : '#8a8070';
      g.fillRect(px - 2, gy - y - 1, 4, 2);
    }
    g.globalAlpha = 0.18 * k;
    g.fillStyle = '#c8c0a8';
    g.fillRect(Math.round(x0 - w), gy - y - 1, Math.round(w * 2), 2);
  }
  g.globalAlpha = 1;
}

/** Bats: fly in from all round, whirl in a dark knot, then burst away. */
function drawBats(g: CanvasRenderingContext2D, v: View, e: Entrance, t: number): void {
  if (t > 1.6) return;
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a0 = i * 2.39996 + 0.3;
    const far = 4 + (i % 5) * 0.6;
    const orb = 0.35 + (i % 4) * 0.18;
    const spin = (i & 1 ? 1 : -1) * (5 + (i % 3));
    let x: number, y: number;
    const ang = a0 + t * spin;
    if (t < 0.55) {
      const k = easeOut(t / 0.55);
      const r = far + (orb - far) * k;
      x = Math.cos(ang) * r; y = 1.1 + Math.sin(ang) * r * 0.55 + (1 - k) * 1.5;
    } else if (t < 0.95) {
      x = Math.cos(ang) * orb; y = 1.1 + Math.sin(ang) * orb * 1.3;
    } else {
      const k = (t - 0.95) / 0.65;
      const r = orb + k * k * 9;
      x = Math.cos(a0) * r; y = 1.1 + Math.abs(Math.sin(a0)) * r * 0.8 + k * 2;
    }
    const px = Math.round(v.sx(e.x + x)), py = Math.round(v.sy(y));
    const up = (Math.floor(t * 22 + i) & 1) === 0;
    g.fillStyle = '#1a0a20';
    g.fillRect(px - 1, py, 3, 2);
    if (up) { g.fillRect(px - 3, py - 1, 2, 1); g.fillRect(px + 2, py - 1, 2, 1); g.fillRect(px - 4, py - 2, 1, 1); g.fillRect(px + 4, py - 2, 1, 1); }
    else { g.fillRect(px - 3, py + 1, 2, 1); g.fillRect(px + 2, py + 1, 2, 1); g.fillRect(px - 4, py + 2, 1, 1); g.fillRect(px + 4, py + 2, 1, 1); }
    if (i % 3 === 0) { g.fillStyle = '#ff3050'; g.fillRect(px, py, 1, 1); }
  }
  // The knot reads as a dark cloud while it's tight.
  if (t > 0.4 && t < 1.05) {
    const k = t < 0.55 ? (t - 0.4) / 0.15 : t > 0.95 ? 1 - (t - 0.95) / 0.1 : 1;
    const cx = Math.round(v.sx(e.x)), cy = Math.round(v.sy(1.05));
    g.globalAlpha = 0.55 * clamp01(k);
    g.fillStyle = '#1a0a20';
    for (let i = -16; i <= 16; i++) {
      const w = Math.round(13 * Math.sqrt(1 - (i / 17) ** 2) + Math.sin(i * 1.7 + t * 30) * 2);
      g.fillRect(cx - w, cy + i * 2, w * 2, 2);
    }
    g.globalAlpha = 1;
  }
}

/** A heap of gold growing at the feet, sinking away after the statue breaks. */
function drawCoinPile(g: CanvasRenderingContext2D, cx: number, gy: number, t: number): void {
  const grow = clamp01(t / 0.8), fade = t > 1.05 ? clamp01(1 - (t - 1.05) / 0.45) : 1;
  const h = Math.round(6 * grow * fade), w = Math.round(20 * grow * (0.5 + 0.5 * fade));
  if (h < 1 || w < 2) return;
  for (let i = 0; i < h; i++) {
    const ww = Math.round(w * (1 - i / (h + 1)));
    g.fillStyle = i === h - 1 ? '#fff0a0' : i % 2 ? '#e0a830' : '#ffd040';
    g.fillRect(cx - ww, gy - i, ww * 2, 1);
  }
  g.fillStyle = '#fffbe8';
  for (let i = 0; i < 4; i++) if ((Math.floor(t * 8) + i) % 3 === 0) g.fillRect(cx - w + 4 + i * Math.max(1, Math.round(w / 2)), gy - 1 - (i % 2), 1, 1);
}

/** Two long cuts across the air that open late, then fade. */
function drawSlashes(g: CanvasRenderingContext2D, cx: number, gy: number, t: number): void {
  const S = 0.95;
  if (t < S || t > S + 0.4) return;
  const k = (t - S) / 0.4;
  const len = Math.round(70 * Math.min(1, k * 5));
  const cuts: [number, number, number][] = [[-1, -48, 0.35], [1, -26, -0.28]];
  for (const [d, oy, slope] of cuts) {
    for (let i = -len; i <= len; i++) {
      const x = cx + i, y = Math.round(gy + oy + i * slope * d);
      g.globalAlpha = (1 - k) * (1 - Math.abs(i) / (len + 1));
      g.fillStyle = '#9ad8ff';
      g.fillRect(x, y - 1, 1, 3);
      g.fillStyle = '#ffffff';
      g.fillRect(x, y, 1, 1);
    }
  }
  g.globalAlpha = 1;
}

/** A rock column punched up out of the sand, lit on one side, with an ink edge. */
function drawPillar(g: CanvasRenderingContext2D, cx: number, gy: number, t: number): void {
  const h = Math.round(pillarH(t));
  if (h < 2) return;
  const w = 12;
  g.fillStyle = '#1a1020';
  g.fillRect(cx - w - 1, gy - h - 1, w * 2 + 2, h + 1);
  for (let y = 0; y < h; y++) {
    const jag = ((y * 7) % 5 === 0) ? 1 : 0;
    g.fillStyle = '#7a6a58';
    g.fillRect(cx - w + jag, gy - y - 1, w * 2 - jag, 1);
    g.fillStyle = '#5a4a40';
    g.fillRect(cx + Math.round(w * 0.35), gy - y - 1, Math.round(w * 0.65), 1);
    g.fillStyle = '#9a8a72';
    g.fillRect(cx - w + jag, gy - y - 1, 3, 1);
  }
  g.fillStyle = '#b8a888';
  g.fillRect(cx - w, gy - h, w * 2, 2);
  g.fillStyle = '#3a2e2a';
  for (let y = 8; y < h - 4; y += 11) { g.fillRect(cx - 4 + ((y * 3) % 7), gy - y, 3, 1); g.fillRect(cx - 2 + ((y * 3) % 7), gy - y - 1, 1, 1); }
}

/** An upright starry rift: a dark void in a rim of swirling violet and teal light. */
function drawRift(g: CanvasRenderingContext2D, cx: number, gy: number, t: number): void {
  const k = t < 0.4 ? easeOut(t / 0.4) : t > 1.0 ? clamp01(1 - (t - 1.0) / 0.18) : 1;
  if (k <= 0.02) return;
  const cy = gy - 38, rx = Math.max(1, Math.round(14 * k * (t > 1.0 ? k : 1))), ry = Math.round(36 * k);
  for (let i = -ry; i <= ry; i++) {
    const w = Math.round(rx * Math.sqrt(1 - (i / (ry + 0.5)) ** 2));
    g.fillStyle = '#0a0618';
    g.fillRect(cx - w, cy + i, w * 2, 1);
  }
  // Stars drifting inside.
  g.fillStyle = '#d8c8ff';
  for (let i = 0; i < 9; i++) {
    const sx = Math.round(cx + Math.sin(i * 3.7 + t * 2) * rx * 0.6), sy = Math.round(cy + Math.cos(i * 2.3 + t * 1.3) * ry * 0.7);
    if ((i + Math.floor(t * 6)) % 4) g.fillRect(sx, sy, 1, 1);
  }
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t * 5;
    g.fillStyle = i % 3 === 0 ? '#40e0d0' : i % 2 ? '#9a70ff' : '#e0d0ff';
    g.fillRect(Math.round(cx + Math.cos(a) * (rx + 1)), Math.round(cy + Math.sin(a) * (ry + 1)), 2, 2);
  }
  // A faint outer halo.
  g.globalAlpha = 0.35 * k;
  g.fillStyle = '#9a70ff';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - t * 3;
    g.fillRect(Math.round(cx + Math.cos(a) * (rx + 4)), Math.round(cy + Math.sin(a) * (ry + 4)), 1, 1);
  }
  g.globalAlpha = 1;
}

/** The constellation: a figure of stars joined by faint lines (x as the hero faces, metres, y up). */
const STAR_PTS: [number, number][] = [
  [0, 1.9], [0, 1.55], [-0.32, 1.42], [0.32, 1.42], [-0.5, 0.95], [0.55, 1.75], [0.8, 2.3], [0, 0.95], [-0.22, 0.48], [0.24, 0.48], [-0.3, 0.02], [0.32, 0.02],
];
const STAR_LINES: [number, number][] = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 5], [5, 6], [1, 7], [7, 8], [7, 9], [8, 10], [9, 11]];

function drawStars(g: CanvasRenderingContext2D, v: View, e: Entrance, gy: number, t: number, layer: 'under' | 'over'): void {
  const night = t < 0.25 ? t / 0.25 : t > 1.15 ? clamp01(1 - (t - 1.15) / 0.5) : 1;
  if (layer === 'under') {
    // The sky dims around the fight while the stars are out.
    // Small menu previews are transparent canvases, where a dimmed sky would show as a dark box.
    if (night <= 0 || g.canvas.width < 240) return;
    g.globalAlpha = 0.5 * night;
    g.fillStyle = '#05030f';
    g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    g.globalAlpha = 1;
    return;
  }
  if (t > 1.2) return;
  const pt = (i: number): [number, number] => [Math.round(v.sx(e.x + STAR_PTS[i][0] * e.facing)), Math.round(v.sy(STAR_PTS[i][1]))];
  const fade = t > 1.05 ? clamp01(1 - (t - 1.05) / 0.15) : 1;
  // Lines draw in one after another.
  g.fillStyle = '#8ab0ff';
  STAR_LINES.forEach(([a, b], i) => {
    const k = clamp01((t - 0.35 - i * 0.05) / 0.12);
    if (k <= 0) return;
    const [x0, y0] = pt(a), [x1, y1] = pt(b);
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) * k));
    g.globalAlpha = 0.7 * fade;
    for (let j = 0; j <= n; j += 2) {
      const u = j / Math.max(1, Math.hypot(x1 - x0, y1 - y0));
      g.fillRect(Math.round(x0 + (x1 - x0) * u), Math.round(y0 + (y1 - y0) * u), 1, 1);
    }
  });
  STAR_PTS.forEach((_, i) => {
    const k = clamp01((t - 0.1 - i * 0.03) / 0.1);
    if (k <= 0) return;
    const [x, y] = pt(i);
    const tw = (Math.floor(t * 10) + i) % 4 === 0;
    g.globalAlpha = fade;
    g.fillStyle = '#ffffff';
    g.fillRect(x, y, 1, 1);
    g.fillStyle = '#c8e0ff';
    g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); g.fillRect(x, y + 1, 1, 1);
    if (tw || k < 1) { g.fillRect(x - 2, y, 1, 1); g.fillRect(x + 2, y, 1, 1); g.fillRect(x, y - 2, 1, 1); g.fillRect(x, y + 2, 1, 1); }
  });
  g.globalAlpha = 1;
  void gy;
}

/** The phoenix: two burning wings spread from the hero's back, beat once and burn away. */
function drawWings(g: CanvasRenderingContext2D, cx: number, gy: number, t: number): void {
  const OPEN = 0.35, BEAT = 1.15, END = 1.55;
  if (t < OPEN || t > END) return;
  const open = easeOut((t - OPEN) / 0.35);
  const fade = t > BEAT ? clamp01(1 - (t - BEAT) / (END - BEAT)) : 1;
  const span = 44 * open;
  // Wings rise, then sweep down hard on the beat.
  const ang = t < BEAT - 0.15 ? 0.55 + 0.2 * Math.sin(t * 10) : t < BEAT ? 0.75 - ((t - (BEAT - 0.15)) / 0.15) * 1.0 : -0.25;
  const y0 = gy - 34;
  for (const s of [-1, 1]) {
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const bend = Math.sin(u * Math.PI) * 6;
      const x = cx + s * span * u * Math.cos(ang), y = y0 - span * u * Math.sin(ang) - bend;
      const L = Math.round((1 - u * 0.55) * 20 * open);
      for (let j = 0; j < L; j++) {
        const q = j / Math.max(1, L);
        g.globalAlpha = fade * (1 - q * 0.6);
        g.fillStyle = css(FIRE[Math.min(FIRE.length - 1, Math.floor(q * 3 + u * 1.5 + ((j + i + Math.floor(t * 20)) % 3 === 0 ? 1 : 0)))]);
        g.fillRect(Math.round(x + s * j * 0.25), Math.round(y + j), 2, 1);
      }
    }
  }
  // A bright body of flame behind the hero, and the head crest above.
  g.globalAlpha = 0.8 * fade;
  for (let y = 0; y < 46; y += 2) {
    const w = Math.max(1, Math.round(7 * Math.sin((y / 46) * Math.PI) + Math.sin(y + t * 30)));
    g.fillStyle = css(FIRE[Math.min(FIRE.length - 1, 1 + Math.floor((y / 46) * 3))]);
    g.fillRect(cx - w, gy - 6 - y, w * 2, 2);
  }
  g.globalAlpha = 1;
}
