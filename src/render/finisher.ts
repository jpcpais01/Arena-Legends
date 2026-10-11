import type { Sfx } from '../audio/sfx';
import { FINISHERS, type FinisherId } from '../character/finales';
import type { EntranceHost, EntrancePose } from './entrance';
import { clamp01, drawCrackle, drawFireColumn, drawFireRing, drawHeat, drawStormCloud, easeIn, easeOut, rnd } from './entranceArt';
import {
  drawBlackSun, drawCut, drawDragon, drawEclipseSky, drawFallingStar, drawGreatSword, drawIce, drawNight, drawPetalGust,
  drawRuneRing, drawScorch, drawShard, type DragonPt,
} from './finisherArt';
import type { Fx, View } from './fx';
import type { Light } from './glfx';
import { css, mix } from './pixel/color';
import { PPM } from './sprite/animator';

/**
 * KO finishers: the winner's signature cinematic, played from the knockout
 * on, render-side only (the sim never knows). A finisher runs on real time
 * and sets the pace the sim is stepped at (slow motion, a dead stop while
 * the fallen hangs frozen in the air), poses both fighters (a frozen tint, a
 * black silhouette, the winner lowering their weapon or calling the storm),
 * draws its own shapes and fires light, shockwaves and sound through the
 * same host the entrances use. Then the winner's victory pose takes over.
 */

/** Where things are: world metres, y up. */
type Spot = [number, number];

export interface FinisherOptions {
  /** Full battle scene (camera, full-view skies) rather than a small menu preview. */
  stage: boolean;
  /** The menu's background duel: no full-view takeovers, softer flashes. */
  quiet?: boolean;
  /** The winner's own colours (their weapon skin), for the finishers that take them. */
  hi?: number;
  lo?: number;
  /** World height of the top of the view right now (the sky effects stay in sight under a zoomed camera). */
  top?: () => number;
}

/** What to draw for each fighter this frame (null: their normal animation). `clip` '' keeps the animation and only tints. */
export interface FinaleFrame {
  win: EntrancePose | null;
  fall: EntrancePose | null;
}

const blank = (): EntrancePose => ({
  clip: '', frame: 0, face: null, dx: 0, dy: 0, alpha: 1, tint: null, tintA: 0, shadow: 1, clipGround: false, flip: false,
  ghosts: 0, ghostDx: 0, ghostCol: null, sx: 1, sy: 1,
});
const reset = (p: EntrancePose): void => { Object.assign(p, blank()); };

const UP = Math.PI / 2;
const WHITE = 0xffffff;
const ink = (c: number): number => mix(c, 0x0a0614, 0.86);

/** A bit of debris the finisher throws about itself (ice shards, falling stars): screen-free, world metres. */
interface Bit { x: number; y: number; vx: number; vy: number; a: number; va: number; t: number; life: number; s: number; hit?: boolean }

interface Def {
  /** Seconds it plays (the pose begins as it ends). */
  len: number;
  step(e: Finisher, t: number): void;
  draw?(e: Finisher, g: CanvasRenderingContext2D, v: View, layer: 'under' | 'over', t: number): void;
}

export class Finisher {
  private t = -1e-6;
  private prev = -1e-6;
  private timers = new Map<string, number>();
  /** How fast the sim runs this frame (1 = normal, 0 = frozen). */
  pace = 1;
  readonly frame: FinaleFrame = { win: null, fall: null };
  private readonly winP = blank();
  private readonly fallP = blank();
  /** Live positions (feet) of the winner and the fallen. */
  W: Spot = [0, 0];
  F: Spot = [0, 0];
  /** Which way from the winner the fallen lies (±1). */
  dir = 1;
  /** The fallen has been thrown up and came down again: when (finisher time), or −1. */
  landT = -1;
  private flew = false;
  /** Moments a finisher fixes when they happen (a strike, a spot). */
  mark: Record<string, number> = {};
  bits: Bit[] = [];
  readonly stage: boolean;
  readonly quiet: boolean;
  readonly hi: number;
  readonly lo: number;
  /** Size of drawn shapes (menu previews are small). */
  readonly scale: number;
  private readonly top: () => number;

  constructor(readonly id: FinisherId, private host: EntranceHost, private winAt: () => Spot, private fallAt: () => Spot, opts: FinisherOptions) {
    this.stage = opts.stage;
    this.quiet = !!opts.quiet;
    this.scale = opts.stage ? 1 : 0.62;
    this.top = opts.top ?? (() => (opts.stage ? 6.5 : 2.6));
    const sig = FINISHERS[id].color;
    this.hi = opts.hi ?? sig;
    this.lo = opts.lo ?? mix(sig, 0x10081a, 0.55);
    this.locate();
  }

  get len(): number { return DEFS[this.id].len; }
  get time(): number { return this.t; }
  get done(): boolean { return this.t >= this.len; }

  private locate(): void {
    this.W = this.winAt();
    this.F = this.fallAt();
    this.dir = Math.sign(this.F[0] - this.W[0]) || 1;
  }

  /** Advances on real time; false once it is over. */
  update(dt: number): boolean {
    this.prev = this.t;
    this.t += dt;
    this.locate();
    if (this.F[1] > 0.25) this.flew = true;
    if (this.flew && this.landT < 0 && this.F[1] < 0.06) this.landT = this.t;
    reset(this.winP);
    reset(this.fallP);
    this.frame.win = this.frame.fall = null;
    this.pace = 1;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.t += dt;
      if (b.t >= b.life) { this.bits.splice(i, 1); continue; }
      b.vy -= (b.hit === undefined ? 14 : 0) * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt;
      if (b.y < 0 && b.hit === undefined) { b.y = 0; b.vy *= -0.3; b.vx *= 0.5; b.va *= 0.5; }
    }
    if (this.done) return false;
    DEFS[this.id].step(this, this.t);
    return true;
  }

  draw(g: CanvasRenderingContext2D, v: View, layer: 'under' | 'over'): void {
    if (this.t < 0 || this.done) return;
    DEFS[this.id].draw?.(this, g, v, layer, this.t);
  }

  // --- Timeline helpers ----------------------------------------------------------------------

  /** True on the frame the timeline passes `k`. */
  at(k: number): boolean {
    return this.prev < k && this.t >= k;
  }

  /** Every `s` seconds on its own named clock (trails, drizzles). */
  every(name: string, s: number): boolean {
    const next = this.timers.get(name) ?? 0;
    if (this.t < next) return false;
    this.timers.set(name, this.t + s);
    return true;
  }

  /** The fallen has come down (or `by` passed): the moment a strike lands. Fixed the first time it happens. */
  strike(name: string, after: number, by: number): number {
    if (this.mark[name] === undefined && this.t >= after && (this.landT >= 0 || this.t >= by)) this.mark[name] = this.t;
    return this.mark[name] ?? -1;
  }

  /** The winner shows `clip` (frame, face) instead of their animation. */
  win(clip: string, frame = 0, face: EntrancePose['face'] = null): EntrancePose {
    const p = this.winP;
    p.clip = clip; p.frame = frame; p.face = face;
    this.frame.win = p;
    return p;
  }

  /** The fallen keeps their animation but takes a colour wash. */
  fall(tint: string | null, a: number): EntrancePose {
    const p = this.fallP;
    p.tint = tint; p.tintA = a;
    this.frame.fall = p;
    return p;
  }

  /** The angle of the cut (eclipse, delayed cut), radians, world: down across from the winner's side. */
  get cutAngle(): number {
    return this.dir > 0 ? -0.42 : Math.PI + 0.42;
  }

  /** A height in the sky (world) that is still in view: `pad` below the top, never above `cap`. */
  sky(pad = 0.5, cap = 5.6): number {
    return Math.max(1.6, Math.min(this.top() - pad, cap));
  }

  /** The middle of the fallen body (world). */
  get body(): Spot {
    return [this.F[0], this.F[1] + 0.55];
  }

  get fx(): Fx { return this.host.fx; }
  sound(name: Sfx, k = 1): void { this.host.sound(name, k); }
  shake(a: number): void { this.host.shake(this.quiet ? a * 0.4 : a); }
  flash(c: number, a: number): void { if (!this.quiet) this.host.flash(c, a); }
  light(l: Light): void { this.host.light(l); }
  impact(hi: number, lo: number, len = 0.06): void { this.host.impact(hi, lo, len); }
  split(k: number, life: number): void { this.host.split(k, life); }
  vignette(c: number, k: number, life: number): void { this.host.vignette(c, k, life); }
  focus(x: number, seconds: number, levels = 1): void { this.host.focus(x, seconds, levels); }

  glow(x: number, y: number, r0: number, r1: number, hi: number, lo: number, life: number, power = 1, extra: Partial<Light> = {}): void {
    this.light({ kind: 'glow', x, y, r0, r1, hi, lo, life, power, ...extra });
  }

  /** A shockwave bending the picture (battle) with a ring of light that also shows in the menus. */
  shock(x: number, y: number, r: number, amp: number, life: number, hi: number, squash = 1): void {
    this.host.shock({ x, y, r, amp, life, hi, squash, dir: this.dir });
    this.light({ kind: 'ring', x, y, r0: r * 0.12, r1: r * 0.85, w: 0.06, squash, hi, lo: mix(hi, 0x000000, 0.5), life: life * 0.85, power: 0.9, fin: 0 });
  }

  /** A flat ring of light racing out over the ground. */
  groundShock(x: number, r: number, hi: number, lo: number, life = 0.5): void {
    this.light({ kind: 'ring', x, y: 0.04, r0: r * 0.15, r1: r, w: 0.08, squash: 0.22, hi, lo, life, power: 1.1, fin: 0 });
    this.host.shock({ x, y: 0.1, r: r * 0.9, amp: 3, life: life * 0.9, hi: lo, squash: 0.35 });
  }

  /** A big blow on the spot: impact frame, shockwave, smear, colour split, flare. */
  blow(x: number, y: number, hi: number, lo: number, size = 1, frame = true): void {
    if (frame) this.impact(hi, ink(lo), 0.05 + 0.03 * size);
    this.shock(x, y, 2.6 * size, 5 + 3 * size, 0.55, hi, 0.75);
    this.host.zoomBlur(x, y, 0.025 * size, 0.22);
    this.split(1.5 * size, 0.35);
    this.light({ kind: 'flare', x, y, r0: 1.2 * size, r1: 3.4 * size, w: 0.05, hi, lo, life: 0.5, power: 0.9, fin: 0, real: true });
  }

  /** The knockout itself, shared by every finisher: the crowd roars, the hit rings out. */
  ko(hi: number, shake = 0.8): void {
    this.sound('ko');
    this.shake(shake);
    const [x, y] = this.body;
    this.fx.pulse('star', x, y, 1.1 * this.scale, 0xfff0c0, 0.25);
    this.fx.burst({ x, y, count: this.stage ? 26 : 12, speed: [3, 9], life: [0.25, 0.6], color: WHITE, color2: hi, drag: 1.5, kind: 'streak' });
  }

  /** Dust thrown out low to both sides where the fallen lands. */
  dust(x: number, count: number, speed = 3): void {
    for (const d of [0, Math.PI]) this.fx.burst({ x, y: 0.12, count, jitter: 0.2, jitterY: 0.08, dir: d + (d ? -0.25 : 0.25), spread: 0.35, speed: [speed * 0.4, speed], life: [0.35, 0.7], color: 0xd8c8a8, color2: 0x6a5a48, kind: 'smoke', size: 3, drag: 3 });
  }
}

/** Screen x/y of a world spot. */
const sxy = (v: View, p: Spot): [number, number] => [Math.round(v.sx(p[0])), Math.round(v.sy(p[1]))];

const DEFS: Record<FinisherId, Def> = {
  // The classic, polished: a ringing blow, a white flash, slow motion and the camera in tight.
  clean: {
    len: 1.55,
    step(e, t) {
      const [bx, by] = e.body;
      if (e.at(0)) {
        e.ko(e.hi, 1.1);
        e.flash(WHITE, 1.2);
        e.impact(WHITE, ink(e.lo), 0.06);
        e.shock(bx, by, 2.4, 6, 0.55, 0xfff0c0, 0.8);
        e.light({ kind: 'star', x: bx, y: by, r0: 0.5, r1: 1.3, w: 0.04, hi: WHITE, lo: e.hi, life: 0.3, power: 1.2, fin: 0 });
        e.fx.pulse('groundRing', e.F[0], 0, 3.2, 0xffffff, 0.6);
        e.fx.burst({ x: bx, y: by, count: e.stage ? 30 : 12, speed: [4, 10], life: [0.4, 0.9], color: WHITE, color2: 0xffd27a, gravity: 6, drag: 1, kind: 'streak' });
        e.focus(e.F[0], 1.5, 2);
      }
      e.pace = t < 0.07 ? 0 : t < 1.3 ? 0.25 : 1;
      const land = e.strike('land', 0.1, 9);
      if (land >= 0 && e.at(land)) {
        e.sound('entSlam', 0.5);
        e.dust(e.F[0], 5, 3);
        e.groundShock(e.F[0], 1.6, 0xe8dcc0, 0x8a7458, 0.4);
      }
    },
  },

  // The fallen freezes solid in mid-air, ice cracks over them, and it bursts into shards.
  frost: {
    len: 2.0,
    step(e, t) {
      const FREEZE = 0.3, BREAK = 1.15;
      const [bx, by] = e.body;
      if (e.at(0)) {
        e.ko(0xbff0ff, 0.6);
        e.impact(WHITE, ink(0x2a6a90), 0.05);
        e.focus(e.F[0], BREAK + 0.6, 2);
        e.vignette(0x0a2a40, 0.55, 1.9);
      }
      e.pace = t < FREEZE ? 0.8 : t < BREAK ? 0 : 0.5;
      if (e.at(FREEZE)) {
        e.mark.ix = bx; e.mark.iy = by;
        e.sound('freeze');
        e.flash(0xbff0ff, 0.5);
        e.glow(bx, by, 0.5, 1.2, 0xe8fbff, 0x2a6a90, BREAK - FREEZE + 0.1, 0.7, { fin: 0.2 });
        e.fx.burst({ x: bx, y: by, count: e.stage ? 20 : 8, jitter: 0.4, jitterY: 0.5, speed: [0.5, 2], life: [0.4, 0.8], color: 0xf0ffff, color2: 0x8ad8ff, kind: 'flake', drag: 2 });
      }
      for (const k of [BREAK - 0.42, BREAK - 0.2]) if (e.at(k)) { e.sound('glass', 0.4); e.shake(0.2); }
      if (t < FREEZE) { e.fall('#c8f4ff', t / FREEZE * 0.4); return; }
      if (t < BREAK) {
        // The ice creaks as it gives.
        const p = e.fall('#c8f4ff', 0.75);
        if (t > BREAK - 0.25) p.dx = (Math.floor(t * 40) & 1 ? 0.03 : -0.03);
        if (e.every('mist', 0.07)) e.fx.burst({ x: bx, y: by - 0.3, count: 1, jitter: 0.4, speed: [0.1, 0.4], life: [0.5, 0.9], color: 0xe8fbff, color2: 0x8ad8ff, kind: 'smoke', size: 3, drag: 1 });
        return;
      }
      if (e.at(BREAK)) {
        e.sound('glass');
        e.sound('entSlam', 0.5);
        e.shake(0.9);
        e.flash(0xe8fbff, 0.6);
        e.blow(bx, by, 0xe8fbff, 0x2a6a90, 1);
        for (let i = 0; i < 3; i++) e.light({ kind: 'star', x: bx + (i - 1) * 0.45, y: by + (i - 1) * 0.3, r0: 0.25, r1: 0.6, w: 0.03, hi: WHITE, lo: 0x8ad8ff, life: 0.3, power: 1, fin: 0, delay: i * 0.05 });
        const n = e.stage ? 16 : 9;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd(i) * 0.4, sp = 3 + rnd(i + 3) * 4;
          e.bits.push({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, a: rnd(i + 7) * 6, va: (rnd(i + 9) - 0.5) * 20, t: 0, life: 0.7 + rnd(i + 2) * 0.4, s: 3 + rnd(i + 5) * 4 });
        }
        e.fx.burst({ x: bx, y: by, count: e.stage ? 34 : 14, jitter: 0.3, jitterY: 0.4, speed: [2, 6], life: [0.4, 0.9], color: WHITE, color2: 0x8ad8ff, size: 2, gravity: 12 });
        e.fx.burst({ x: bx, y: by, count: e.stage ? 16 : 6, jitter: 0.5, jitterY: 0.6, speed: [0.3, 1.2], life: [0.6, 1.2], color: 0xf0ffff, color2: 0x8ad8ff, kind: 'flake', gravity: 0.5 });
      }
      e.fall('#c8f4ff', Math.max(0, 0.6 - (t - BREAK) * 1.6));
      if (e.every('snow', 0.06)) e.fx.burst({ x: bx, y: 3.2, count: 1, jitter: 1.6, jitterY: 0.4, dir: -UP, spread: 0.3, speed: [0.2, 0.6], life: [0.7, 1.1], color: 0xf0ffff, color2: 0x8ad8ff, kind: 'flake', gravity: 0.6 });
    },
    draw(e, g, v, layer, t) {
      if (layer !== 'over') return;
      if (t >= 0.3 && t < 1.15) {
        const [x, y] = sxy(v, [e.mark.ix, e.mark.iy]);
        drawIce(g, x, y, (t - 0.3) / 0.22, clamp01((t - 0.73) / 0.4), e.scale);
      }
      for (const b of e.bits) {
        const [x, y] = sxy(v, [b.x, b.y]);
        drawShard(g, x, y, b.a, b.s * e.scale, 1 - b.t / b.life);
      }
    },
  },

  // The storm gathers over the fallen, the winner calls it down, and a bolt strikes where they land.
  thunder: {
    len: 2.0,
    step(e, t) {
      if (e.at(0)) {
        e.ko(0x9ad8ff, 0.6);
        e.impact(WHITE, ink(0x2a5aa0), 0.05);
        e.focus((e.W[0] + e.F[0]) / 2 + e.dir * 0.6, 2, 1);
        e.vignette(0x0a1428, 0.7, 2);
        e.sound('entRumble', 0.7);
      }
      const hit = e.strike('hit', 0.5, 1.0);
      e.pace = t < 0.06 ? 0 : hit < 0 ? 0.7 : t < hit + 0.14 ? 0 : 0.6;
      if (t > 0.18 && (hit < 0 || t < hit + 0.45)) e.win('victory', 0, 'shout');
      for (const k of [0.28, 0.46]) if (e.at(k)) { e.fx.bolt(e.F[0] - 1.4, e.sky(0.6), e.F[0] + 1.1, e.sky(0.4), 0x7ac8ff, 0.08); e.flash(0xc8e8ff, 0.25); e.sound('lightning', 0.25); }
      if (hit < 0) {
        if (e.every('crackle', 0.05)) e.fx.burst({ x: e.F[0], y: 0.05, count: 1, jitter: 0.6, jitterY: 0, dir: UP, spread: 0.3, speed: [1, 2.5], life: [0.12, 0.25], color: WHITE, color2: 0x7ac8ff, kind: 'streak' });
        return;
      }
      const x = e.F[0];
      if (e.at(hit)) {
        e.mark.x = x;
        e.sound('lightning');
        e.sound('entSlam', 0.7);
        e.sound('explosion', 0.3);
        e.fx.bolt(x + 0.4, 10, x, 0.1, 0x7ac8ff, 0.34);
        e.fx.bolt(x - 0.6, 10, x + 0.1, 0.3, 0x9ad8ff, 0.24);
        e.light({ kind: 'beam', x, y: 0, r0: 12, r1: 12, w: 0.32, rot: UP, hi: WHITE, lo: 0x5aa8ff, life: 0.4, power: 1.4, fin: 0, real: true });
        e.flash(0xe8f4ff, 1.3);
        e.shake(1.2);
        e.blow(x, 0.5, 0xe8f4ff, 0x2a5aa0, 1.2);
        e.groundShock(x, 2.8, 0x9ad8ff, 0x2a5aa0);
        e.fx.pulse('crack', x, 0, 1.3, 0x3a6aa0, 1.2);
        e.fx.burst({ x, y: 0.3, count: e.stage ? 28 : 12, dir: UP, spread: 1.4, speed: [2, 6], life: [0.2, 0.5], color: WHITE, color2: 0x7ac8ff, kind: 'streak' });
        e.dust(x, 4, 3);
      }
      if (e.at(hit + 0.38)) { e.fx.bolt(x - 0.3, 2.4, x + 0.5, 0.3, 0x7ac8ff, 0.12); e.sound('lightning', 0.3); }
      // Electrified: the body flickers white and blue.
      const k = clamp01(1 - (t - hit) / 0.7);
      e.fall((Math.floor(t * 30) & 1) ? '#ffffff' : '#7ac8ff', 0.85 * k);
      if (k > 0 && e.every('zap', 0.06)) e.fx.burst({ x, y: 0.6, count: 1, jitter: 0.5, jitterY: 0.4, speed: [0.3, 1], life: [0.15, 0.3], color: WHITE, color2: 0x7ac8ff, kind: 'twinkle' });
    },
    draw(e, g, v, layer, t) {
      const hit = e.mark.hit ?? 99;
      const x = Math.round(v.sx(e.mark.x ?? e.F[0])), gy = Math.round(v.sy(0));
      if (layer === 'under') { if (t > hit) drawScorch(g, x, gy, clamp01(1 - (t - hit - 0.9) / 0.6), t, e.scale, 0x7ac8ff); return; }
      drawStormCloud(g, Math.round(v.sx(e.F[0])), Math.round(v.sy(e.sky(e.stage ? 0.45 : 0.15))), t, Math.min(hit, 1.4));
      if (t > hit) drawCrackle(g, Math.round(v.sx(e.F[0])), gy + 30, t, hit, hit + 0.7);
    },
  },

  // Time all but stops while a gust of cherry petals sweeps across the arena; the winner closes their eyes.
  blossom: {
    len: 2.3,
    step(e, t) {
      const GO = 1.6;
      if (e.at(0)) {
        e.ko(0xffb0d0, 0.5);
        e.impact(WHITE, ink(0xc04070), 0.05);
        e.focus((e.W[0] + e.F[0]) / 2, 2.2, 1);
        e.vignette(0x401830, 0.4, 2.3);
        e.sound('entWind');
      }
      if (e.at(0.5)) e.sound('gale', 0.6);
      // A pink glow rides the front of the gust.
      if (e.at(0.15)) e.light({ kind: 'glow', x: e.F[0], y: 1.2, r0: 1.1, r1: 1.5, hi: 0xffe0f0, lo: 0xc04070, life: 1.5, power: 0.55, fin: 0.15, real: true, follow: () => [gustX(e), 1.2] });
      e.pace = t < 0.08 ? 0 : t < GO ? 0.08 : 0.7;
      if (t > 0.3) { const p = e.win('fin.lower', 0, t > 0.5 && t < GO + 0.2 ? 'blink' : 'calm'); p.flip = false; }
      if (e.at(0.2)) e.glow(e.body[0], e.body[1], 0.6, 1.4, 0xffe0f0, 0xc04070, GO, 0.22, { fin: 0.3 });
      if (t < GO) e.fall('#ffd0e4', 0.25 * clamp01(t / 0.4));
      if (e.at(GO)) {
        e.sound('whoosh', 1.2);
        e.sound('hitHeavy', 0.6);
        e.shake(0.6);
        e.flash(0xffe0f0, 0.4);
        const [bx, by] = e.body;
        e.shock(bx, by, 2, 4, 0.5, 0xffd0e4, 0.8);
        e.fx.burst({ x: bx, y: by, count: e.stage ? 30 : 12, jitter: 0.4, jitterY: 0.5, speed: [1.5, 4], life: [0.7, 1.2], color: 0xffd0e4, color2: 0xf070a0, kind: 'petal', gravity: 1.2, drag: 1.5 });
      }
      // Petals drifting down over everything once the gust has passed.
      if (t > 0.9 && e.every('drift', e.stage ? 0.05 : 0.1)) e.fx.burst({ x: e.F[0] + (rnd(t) - 0.5) * 5, y: 3.4, count: 1, jitter: 1.5, dir: -UP, spread: 0.4, speed: [0.3, 0.8], life: [1, 1.6], color: 0xffd0e4, color2: 0xf070a0, kind: 'petal', gravity: 0.4 });
    },
    draw(e, g, v, layer, t) {
      if (layer !== 'over') return;
      const mid = Math.round(v.sx((e.W[0] + e.F[0]) / 2));
      drawPetalGust(g, mid, GUST * PPM * (e.stage ? 1 : 0.34), Math.round(v.sy(e.stage ? 1.2 : 0.9)), (t - 0.15) / 1.45, t, e.dir, e.scale);
    },
  },

  // A roaring pillar of flame bursts up out of the sand where the fallen lands.
  inferno: {
    len: 2.2,
    step(e, t) {
      if (e.at(0)) {
        e.ko(0xffb040, 0.7);
        e.impact(0xfff0c0, ink(0xa02810), 0.05);
        e.focus(e.F[0], 2.2, 2);
        e.sound('entIgnite', 0.5);
      }
      const go = e.strike('erupt', 0.45, 0.95);
      e.pace = t < 0.06 ? 0 : go < 0 ? 0.75 : t < go + 0.12 ? 0 : t < go + 1 ? 0.4 : 1;
      const x = e.mark.x ?? e.F[0];
      if (go < 0) {
        if (e.every('ember', 0.04)) e.fx.burst({ x: e.F[0], y: 0.05, count: 2, jitter: 1, jitterY: 0, dir: UP, spread: 0.3, speed: [0.5, 1.5], life: [0.3, 0.6], color: 0xffd060, color2: 0xd83a1a, kind: 'ember' });
        return;
      }
      if (e.at(go)) {
        e.mark.x = e.F[0];
        e.sound('entIgnite');
        e.sound('explosion', 0.5);
        e.shake(1.1);
        e.flash(0xff8030, 0.7);
        e.blow(e.F[0], 0.8, 0xffd060, 0xa02810, 1.1);
        e.groundShock(e.F[0], 2.6, 0xffb040, 0x8a1a08);
        e.light({ kind: 'beam', x: e.F[0], y: 0, r0: 3, r1: 6, w: 0.6, rot: UP, hi: 0xffe080, lo: 0xd83a1a, life: 1.2, power: 1.2, fin: 0.05 });
        e.vignette(0x3a0c04, 0.6, 1.5);
        e.fx.pulse('crack', e.F[0], 0, 1.4, 0x8a3a1a, 1.4);
      }
      if (t < go + 1 && e.every('flame', 0.03)) e.fx.burst({ x, y: 0.4, count: 3, jitter: 0.45, jitterY: 0.4, dir: UP, spread: 0.25, speed: [2, 5.5], life: [0.25, 0.55], color: 0xffe080, color2: 0xd83a1a, kind: 'flame' });
      if (t > go + 0.6 && e.every('smoke', 0.07)) e.fx.burst({ x, y: 1.2, count: 1, jitter: 0.4, jitterY: 0.6, dir: UP, spread: 0.2, speed: [0.6, 1.3], life: [0.7, 1.1], color: 0x5a4a4a, color2: 0x2a2028, kind: 'smoke', size: 4 });
      // Burnt in the blaze: glowing hot, then charred.
      const k = t - go;
      e.fall(k < 0.7 ? '#ff9040' : '#2a1410', k < 0.7 ? 0.7 : Math.max(0, 0.55 - (k - 0.7) * 0.6));
    },
    draw(e, g, v, layer, t) {
      const go = e.mark.erupt;
      const x = Math.round(v.sx(e.mark.x ?? e.F[0])), gy = Math.round(v.sy(0));
      if (layer === 'under') {
        if (go === undefined) { drawHeat(g, Math.round(v.sx(e.F[0])), gy, t, clamp01(t / 0.5)); return; }
        drawFireRing(g, x, gy, t, go, go + 1.1);
        drawScorch(g, x, gy, clamp01(1 - (t - go - 1.3) / 0.5), t, e.scale * 1.1, 0xff8030);
        drawHeat(g, x, gy, t, clamp01(1 - (t - go - 0.9) / 0.6));
        return;
      }
      if (go !== undefined) drawFireColumn(g, x, gy, t, go, go + 1.05);
    },
  },

  // One heartbeat of black and red: the world goes still, a white line cuts through, and it snaps back.
  eclipse: {
    len: 1.75,
    step(e, t) {
      const OFF = 0.72, CUT = 0.26;
      if (e.at(0)) {
        e.sound('ko');
        e.sound('castBig', 0.4);
        e.impact(0xff2030, 0x000000, 0.08);
        e.shake(0.4);
        e.focus((e.W[0] + e.F[0]) / 2, 1.8, 1);
      }
      e.pace = t < OFF ? 0 : t < 1.5 ? 0.45 : 1;
      if (t < OFF) {
        // Both fighters are ink against the red.
        const a = clamp01((t - 0.04) / 0.06);
        const w = e.win('');
        w.tint = '#0a0006'; w.tintA = a;
        e.fall('#0a0006', a);
      }
      if (e.at(CUT)) {
        e.sound('shing', 1.2);
        e.sound('swingHeavy', 0.7);
        const [bx, by] = e.body;
        e.light({ kind: 'beam', x: bx - Math.cos(e.cutAngle) * 6, y: by - Math.sin(e.cutAngle) * 6, r0: 12, r1: 12, w: 0.05, rot: e.cutAngle, hi: WHITE, lo: e.hi, life: OFF - CUT + 0.35, power: 0.8, fin: 0, real: true });
      }
      if (e.at(OFF)) {
        const [bx, by] = e.body;
        e.sound('hitHeavy');
        e.sound('explosion', 0.35);
        e.flash(WHITE, 0.9);
        e.shake(1.1);
        e.blow(bx, by, WHITE, 0xa00818, 1.1);
        const d = e.cutAngle;
        for (const s of [1, -1]) e.fx.burst({ x: bx, y: by, count: e.stage ? 16 : 7, dir: d + (s < 0 ? Math.PI : 0), spread: 0.25, speed: [4, 10], life: [0.25, 0.5], color: WHITE, color2: 0xff3040, kind: 'streak', drag: 2 });
        e.fx.burst({ x: bx, y: by, count: e.stage ? 18 : 8, jitter: 0.2, speed: [1, 4], life: [0.4, 0.8], color: 0xff3040, color2: 0x400010, gravity: 8, size: 2 });
      }
      if (t >= OFF) e.fall('#ff3040', Math.max(0, 0.8 - (t - OFF) * 2));
    },
    draw(e, g, v, layer, t) {
      const OFF = 0.72, CUT = 0.26;
      if (t >= OFF + 0.12) return;
      const [bx, by] = sxy(v, e.body);
      const on = clamp01((t - 0.04) / 0.06) * (t > OFF ? 1 - (t - OFF) / 0.12 : 1);
      const big = e.stage && !e.quiet;
      if (layer === 'under') {
        const mid = Math.round(v.sx((e.W[0] + e.F[0]) / 2));
        if (big) drawEclipseSky(g, g.canvas.width, g.canvas.height, Math.round(v.sy(0)), mid, Math.round(v.sy(e.sky(1.1, 3.4))), on, t);
        else { g.globalAlpha = on; drawBlackSun(g, mid, Math.round(v.sy(e.sky(e.stage ? 1.1 : 0.5, 3.2))), Math.round(11 * e.scale), t); g.globalAlpha = 1; }
        return;
      }
      if (t >= CUT && t < OFF) {
        const reach = big ? g.canvas.width : 60;
        drawCut(g, bx, by, -e.cutAngle, reach, (t - CUT) / 0.07, 1, false, css(e.hi));
      }
    },
  },

  // The winner turns away and lowers their weapon; silence; then the air splits in an ink stroke and the fallen drops.
  delayed: {
    len: 2.35,
    step(e, t) {
      const CUT = 1.45, CLICK = 1.25;
      if (e.at(0)) {
        e.sound('ko', 0.6);
        e.impact(WHITE, 0x000000, 0.04);
        e.shake(0.3);
        e.focus((e.W[0] + e.F[0]) / 2, 2.3, 1);
        e.vignette(0x000000, 0.7, CUT + 0.4);
      }
      e.pace = t < 0.2 ? 0.35 : t < CUT ? 0 : 0.75;
      if (t > 0.22 && t < CUT + 0.7) {
        const p = e.win('fin.lower', 0, t < CUT ? 'blink' : 'calm');
        p.flip = t > 0.38 && t < CUT + 0.5;
      }
      // A leaf or two drifting through the silence.
      if (t > 0.3 && t < CUT && e.every('leaf', 0.35)) e.fx.burst({ x: e.F[0] - e.dir * 2.5, y: 2.6, count: 1, jitter: 0.6, dir: e.dir > 0 ? -0.3 : Math.PI + 0.3, spread: 0.2, speed: [0.8, 1.4], life: [1.2, 1.6], color: 0x9ac860, color2: 0x4a7a30, kind: 'petal', gravity: 0.3 });
      if (e.at(CLICK)) {
        e.sound('block', 0.5);
        const [wx] = e.W;
        e.light({ kind: 'star', x: wx + e.dir * 0.1, y: 0.95, r0: 0.18, r1: 0.4, w: 0.025, hi: WHITE, lo: e.hi, life: 0.22, power: 1, fin: 0 });
      }
      if (e.at(CUT)) {
        const [bx, by] = e.body;
        e.sound('shing', 1.3);
        e.sound('swingHeavy', 0.9);
        e.sound('hitHeavy', 0.8);
        e.impact(WHITE, 0x08040a, 0.07);
        e.flash(WHITE, 0.7);
        e.shake(1);
        e.split(2.5, 0.5);
        e.shock(bx, by, 2.2, 5, 0.5, WHITE, 0.8);
        e.light({ kind: 'beam', x: bx - Math.cos(e.cutAngle) * 6, y: by - Math.sin(e.cutAngle) * 6, r0: 12, r1: 12, w: 0.04, rot: e.cutAngle, hi: WHITE, lo: e.hi, life: 0.45, power: 1, fin: 0, real: true });
        e.fx.burst({ x: bx, y: by, count: e.stage ? 22 : 9, jitter: 0.3, speed: [1.5, 5], life: [0.4, 0.8], color: 0x140c18, color2: 0x08040a, gravity: 9, size: 2 });
        for (const s of [1, -1]) e.fx.burst({ x: bx, y: by, count: e.stage ? 12 : 5, dir: e.cutAngle + (s < 0 ? Math.PI : 0), spread: 0.2, speed: [4, 9], life: [0.2, 0.4], color: WHITE, color2: e.hi, kind: 'streak', drag: 2 });
      }
      if (t >= CUT) e.fall('#ff3040', Math.max(0, 0.75 - (t - CUT) * 1.8));
    },
    draw(e, g, v, layer, t) {
      const CUT = 1.45;
      if (layer !== 'over' || t < CUT) return;
      const [bx, by] = sxy(v, e.body);
      drawCut(g, bx, by, -e.cutAngle, e.stage ? g.canvas.width : 60, (t - CUT) / 0.06, clamp01(1 - (t - CUT - 0.35) / 0.4), true, css(e.hi));
    },
  },

  // Night falls; the winner calls the heavens down, and stars rain on the fallen, the last one the biggest.
  starfall: {
    len: 2.5,
    step(e, t) {
      const N = 8, FROM = 0.42, GAP = 0.13, FALL = 0.3;
      const BIG = FROM + N * GAP + 0.12;
      if (e.at(0)) {
        e.ko(0xc8d8ff, 0.6);
        e.impact(WHITE, ink(0x3a4a90), 0.05);
        e.focus((e.W[0] + e.F[0]) / 2 + e.dir * 0.5, 2.5, 1);
        e.vignette(0x05030f, 0.8, 2.5);
        e.sound('entStars');
      }
      e.pace = t < 0.06 ? 0 : t < BIG + 0.1 ? 0.3 : 0.8;
      if (t > 0.2 && t < BIG + 0.3) e.win('victory', 0, 'shout');
      for (let i = 0; i <= N; i++) {
        const big = i === N, at = big ? BIG - FALL : FROM + i * GAP;
        if (!e.at(at)) continue;
        // Aimed at where the fallen is, give or take.
        const tx = e.F[0] + (big ? 0 : (rnd(i + 1) - 0.5) * 1.6), ty = big ? e.body[1] * 0.5 : Math.max(0, e.F[1] + rnd(i + 4) * 0.8);
        const sx = tx - e.dir * (1.5 + rnd(i) * 1.5), sy = Math.max(ty + 2, e.sky(-0.6, 6.4) + rnd(i + 2) * 0.6);
        e.bits.push({ x: sx, y: sy, vx: (tx - sx) / FALL, vy: (ty - sy) / FALL, a: 0, va: 0, t: 0, life: FALL, s: big ? 3 : 1.5, hit: false });
        e.light({ kind: 'glow', x: sx, y: sy, r0: 0.25, r1: 0.4, hi: WHITE, lo: 0x8ab0ff, life: FALL, power: 0.8, fin: 0, follow: () => { const b = e.bits.find((q) => q.life === FALL && q.x === sx && q.t < FALL); return b ? [b.x, b.y] : null; } });
      }
      for (const b of e.bits) {
        if (b.hit !== false || b.t < b.life - 0.02) continue;
        b.hit = true;
        const big = b.s > 2;
        e.sound(big ? 'castBig' : 'shing', big ? 1 : 0.25);
        e.light({ kind: 'star', x: b.x, y: b.y, r0: big ? 0.8 : 0.3, r1: big ? 1.8 : 0.7, w: 0.04, hi: WHITE, lo: 0x8ab0ff, life: big ? 0.45 : 0.25, power: 1.1, fin: 0 });
        e.fx.burst({ x: b.x, y: b.y, count: big ? (e.stage ? 36 : 14) : (e.stage ? 10 : 4), speed: big ? [2, 6] : [1, 3], life: [0.3, 0.7], color: WHITE, color2: 0x8ab0ff, kind: 'twinkle' });
        if (big) {
          e.sound('explosion', 0.45);
          e.sound('entSlam', 0.7);
          e.shake(1.3);
          e.flash(0xe8f0ff, 1);
          e.blow(b.x, Math.max(0.4, b.y), 0xe8f0ff, 0x3a4a90, 1.3);
          e.groundShock(b.x, 3, 0xc8d8ff, 0x3a4a90, 0.6);
          e.light({ kind: 'rays', x: b.x, y: 0.8, r0: 1.4, r1: 3.6, hi: 0xe8f0ff, lo: 0x5a6ac8, life: 0.8, power: 0.6, fin: 0 });
          e.fx.pulse('crack', b.x, 0, 1.4, 0x3a4a90, 1.3);
        } else {
          e.shake(0.25);
          e.fx.pulse('ring', b.x, b.y, 0.5 * e.scale, 0xc8d8ff, 0.25);
        }
      }
      if (t > BIG) e.fall('#e8f0ff', Math.max(0, 0.8 - (t - BIG) * 2));
    },
    draw(e, g, v, layer, t) {
      const night = t < 0.3 ? t / 0.3 : t > 2.0 ? clamp01(1 - (t - 2.0) / 0.5) : 1;
      if (layer === 'under') {
        drawNight(g, g.canvas.width, e.stage ? Math.round(v.sy(0)) : g.canvas.height, night, t, e.stage && !e.quiet);
        return;
      }
      for (const b of e.bits) {
        if (b.hit !== false) continue;
        const [x, y] = sxy(v, [b.x, b.y]);
        drawFallingStar(g, x, y, b.vx, -b.vy, b.s * e.scale * (e.stage ? 1 : 0.8), t, '#c8d8ff');
      }
    },
  },

  // A spirit dragon coils up around the winner, rears over them, and lunges roaring at the fallen.
  dragon: {
    len: 2.5,
    step(e, t) {
      const HIT = DRAGON.lunge[1];
      if (e.at(0)) {
        e.ko(e.hi, 0.5);
        e.impact(WHITE, ink(e.lo), 0.05);
        e.focus((e.W[0] + e.F[0]) / 2, 2.5, 1);
        e.vignette(mix(e.lo, 0x000000, 0.7), 0.6, 2.4);
        e.sound('cast');
        e.mark.wx = e.W[0];
      }
      if (e.at(0.15)) e.sound('charge', 0.7);
      e.pace = t < 0.06 ? 0 : t < HIT ? 0.12 : t < HIT + 0.12 ? 0 : 0.6;
      if (t > 0.2 && t < HIT + 0.5) e.win('fin.call', 0, 'shout');
      const head = dragonAt(e, t, 1);
      if (head && t < HIT && e.every('mote', 0.04)) e.fx.burst({ x: head[0], y: head[1], count: 1, jitter: 0.15, speed: [0.2, 0.6], life: [0.4, 0.8], color: WHITE, color2: e.hi, kind: 'twinkle' });
      if (e.at(0.2)) e.glow(e.W[0], 1.2, 0.8, 1.6, mix(e.hi, WHITE, 0.4), e.lo, HIT, 0.5, { fin: 0.3 });
      // Its head carries its own light.
      if (e.at(0.15)) e.glow(e.W[0], 0, 0.9, 1.3, mix(e.hi, WHITE, 0.5), e.lo, HIT - 0.1, 0.7, { fin: 0.2, real: true, follow: () => { const p = dragonAt(e, e.time, 1); return p ? [p[0], p[1]] : null; } });
      if (e.at(DRAGON.lunge[0] - 0.12)) e.sound('roar', 1.1);
      if (e.at(HIT)) {
        const [bx, by] = e.body;
        e.sound('explosion', 0.45);
        e.sound('castBig', 0.8);
        e.shake(1.3);
        e.flash(mix(e.hi, WHITE, 0.5), 0.9);
        e.blow(bx, by, mix(e.hi, WHITE, 0.4), e.lo, 1.3);
        e.groundShock(e.F[0], 2.8, e.hi, e.lo, 0.6);
        e.light({ kind: 'rays', x: bx, y: by, r0: 1.4, r1: 3.6, hi: mix(e.hi, WHITE, 0.4), lo: e.lo, life: 0.8, power: 0.6, fin: 0 });
        e.fx.burst({ x: bx, y: by, count: e.stage ? 36 : 14, jitter: 0.3, speed: [2, 6], life: [0.4, 0.9], color: WHITE, color2: e.hi, kind: 'twinkle' });
      }
      if (t >= HIT) {
        e.fall(css(mix(e.hi, WHITE, 0.3)), Math.max(0, 0.8 - (t - HIT) * 1.8));
        // The dragon comes apart into motes of light.
        if (t < HIT + 0.9 && e.every('dissolve', 0.03)) {
          const u = rnd(t * 7);
          const p = dragonAt(e, t, u);
          if (p) e.fx.burst({ x: p[0], y: p[1], count: 2, jitter: 0.15, dir: UP, spread: 0.6, speed: [0.3, 1.2], life: [0.4, 0.9], color: WHITE, color2: e.hi, kind: 'twinkle' });
        }
      }
    },
    draw(e, g, v, layer, t) {
      const fade = t < DRAGON.lunge[1] + 0.1 ? clamp01((t - 0.12) / 0.2) : clamp01(1 - (t - DRAGON.lunge[1] - 0.1) / 0.6);
      if (fade <= 0) return;
      const pts: DragonPt[] = [];
      for (let i = 0; i <= 44; i++) {
        const p = dragonAt(e, t, i / 44);
        if (!p) continue;
        const [x, y] = sxy(v, [p[0], p[1]]);
        pts.push({ x, y, z: p[2] });
      }
      const open = t < DRAGON.lunge[0] - 0.15 ? 0 : 1;
      drawDragon(g, pts, layer === 'over', fade, open, e.hi, e.lo, e.stage ? 1.45 : 0.55, t);
    },
  },

  // A golden rune circle opens in the sky and a giant sword drops out of it, planting itself behind the fallen.
  judgement: {
    len: 2.6,
    step(e, t) {
      const { drop, plant } = JUDGE;
      if (e.at(0)) {
        e.ko(0xffe070, 0.5);
        e.impact(0xfff4c0, ink(0xa06818), 0.05);
        e.focus(e.F[0] + e.dir * 0.4, 2.6, 1);
        e.vignette(0x2a1c08, 0.5, 2.6);
        e.sound('entChoir');
      }
      e.pace = t < 0.06 ? 0 : t < plant ? 0.25 : t < plant + 0.14 ? 0 : 0.55;
      if (t > 0.15 && t < plant + 0.5) e.win('victory', 0, 'shout');
      if (e.at(0.3)) {
        // Where it will fall: just past the fallen.
        e.mark.x = e.F[0] + e.dir * 0.75;
        e.light({ kind: 'ring', x: e.mark.x, y: 0.04, r0: 1.8, r1: 0.5, w: 0.05, squash: 0.25, hi: 0xffe070, lo: 0xa06818, life: plant - 0.3, power: 0.7, fin: 0.4 });
        e.light({ kind: 'rays', x: e.mark.x, y: e.sky(0.7), r0: 1, r1: 2.4, hi: 0xfff0c0, lo: 0xc8901a, life: plant - 0.2, power: 0.45, fin: 0.3 });
      }
      if (e.at(drop)) {
        e.sound('entFall', 0.9);
        const x = e.mark.x;
        e.light({ kind: 'beam', x, y: 0, r0: 9, r1: 9, w: 0.35, rot: UP, hi: 0xfff4c0, lo: 0xffb040, life: plant - drop + 0.3, power: 0.7, fin: 0.4 });
      }
      if (e.at(plant)) {
        const x = e.mark.x;
        e.sound('explosion');
        e.sound('entSlam');
        e.sound('shing', 0.8);
        e.shake(1.7);
        e.flash(0xffe080, 1.2);
        e.blow(x, 0.5, 0xfff0a0, 0xa06818, 1.5);
        e.groundShock(x, 3.4, 0xffe070, 0x8a5a10, 0.7);
        e.light({ kind: 'rays', x, y: 1.4, r0: 1.5, r1: 4.2, hi: 0xfff0c0, lo: 0xc8901a, life: 1, power: 0.6, fin: 0 });
        e.fx.pulse('crack', x, 0, 2, 0x6a4a20, 1.8);
        e.fx.burst({ x, y: 0.2, count: e.stage ? 18 : 8, dir: UP, spread: 1.1, speed: [2, 6], life: [0.5, 1], color: 0x8a7458, color2: 0x3a2e28, gravity: 14, size: 2 });
        e.fx.burst({ x, y: 1.5, count: e.stage ? 24 : 10, jitter: 0.3, jitterY: 1.2, speed: [1, 3], life: [0.4, 0.9], color: 0xfff4c0, color2: 0xffb040, kind: 'twinkle' });
        e.dust(x, 8, 5);
      }
      if (t > plant && t < 2.3 && e.every('mote', 0.06)) e.fx.burst({ x: e.mark.x, y: 0.3, count: 1, jitter: 0.25, jitterY: 1.5, dir: UP, spread: 0.3, speed: [0.3, 0.9], life: [0.5, 0.9], color: 0xfff4c0, color2: 0xffb040, kind: 'twinkle' });
      if (t >= plant) e.fall('#ffe080', Math.max(0, 0.7 - (t - plant) * 1.6));
      if (e.at(2.05)) e.fx.burst({ x: e.mark.x, y: 1.6, count: e.stage ? 30 : 12, jitter: 0.2, jitterY: 1.4, speed: [0.5, 2], life: [0.5, 1], color: 0xfff4c0, color2: 0xffb040, kind: 'twinkle' });
    },
    draw(e, g, v, layer, t) {
      const { drop, plant } = JUDGE;
      if (t < 0.3) return;
      const x = Math.round(v.sx(e.mark.x)), gy = Math.round(v.sy(0));
      const sky = Math.round(v.sy(e.sky(e.stage ? 0.7 : 0.25)));
      if (layer === 'under') {
        drawRuneRing(g, x, sky, 26 * e.scale, (t - 0.3) / 0.3 * (t > plant ? clamp01(1 - (t - plant) / 0.4) : 1), t);
        return;
      }
      if (t < drop) return;
      const L = Math.round((e.stage ? 100 : 46));
      const sink = Math.round(L * 0.16);
      const k = easeIn(clamp01((t - drop) / (plant - drop)));
      const from = sky - 10, to = gy + sink;
      const tip = Math.round(from + (to - from) * k);
      const alpha = t < 2.05 ? 1 : clamp01(1 - (t - 2.05) / 0.4);
      // Speed lines streaming up off it as it falls.
      if (t < plant) {
        g.fillStyle = '#fff4c0';
        for (let i = 0; i < 6; i++) {
          g.globalAlpha = 0.6;
          const lx = x + Math.round((i - 2.5) * 4 * e.scale);
          g.fillRect(lx, tip - L - 30 * e.scale - rnd(i) * 20, 1, Math.round(26 * e.scale));
        }
        g.globalAlpha = 1;
      }
      // Planted: the sand covers the point.
      g.save();
      g.beginPath();
      g.rect(0, 0, g.canvas.width, gy + 1);
      g.clip();
      drawGreatSword(g, x, tip, L, e.stage ? 1.2 : 0.62, t, e.hi === FINISHERS.judgement.color ? 0x5ad8ff : e.hi, alpha);
      g.restore();
    },
  },
};

/** Spirit dragon timing: coiling up (start, end) and the lunge (start, the hit). */
const DRAGON = { coil: [0.12, 1.0], lunge: [1.05, 1.38] } as const;

/**
 * A point along the spirit dragon at time `t`: `u` runs from its tail (0) to
 * its head (1). It rises out of the ground in a helix round the winner, then
 * the head breaks away in an arc to the fallen, the body following. Returns
 * world [x, y, depth], or null where it is still under the ground.
 */
function dragonAt(e: Finisher, t: number, u: number): [number, number, number] | null {
  const [c0, c1] = DRAGON.coil, [l0, l1] = DRAGON.lunge;
  const head = t < c1 ? easeOut((t - c0) / (c1 - c0)) : t < l0 ? 1 : 1 + 0.4 * easeIn((t - l0) / (l1 - l0));
  const s = head - (1 - u) * 0.75;
  if (s < 0) return null;
  const R = e.stage ? 1.0 : 0.5, H = e.stage ? 2.6 : 1.55;
  const wx = e.mark.wx ?? e.W[0];
  if (s <= 1) {
    const a = -UP + s * Math.PI * 3.2;
    return [wx + Math.cos(a) * R * (1 - s * 0.25), 0.05 + s * H + Math.sin(s * 9) * 0.05, -Math.sin(a)];
  }
  // Breaking away: from the top of the coil, up and over, down onto the fallen.
  const k = (s - 1) / 0.4;
  const a1 = -UP + Math.PI * 3.2;
  const x0 = wx + Math.cos(a1) * R * 0.75, y0 = 0.05 + H;
  const [bx, by] = e.body;
  const x = x0 + (bx - x0) * k, y = y0 + (by - y0) * k + Math.sin(k * Math.PI) * (e.stage ? 1.1 : 0.5);
  return [x, y, 1];
}

/** How far either side of the fighters the petal gust sweeps (m, battle). */
const GUST = 4.6;

/** Where the front of the petal gust is (world x). */
function gustX(e: Finisher): number {
  const R = GUST * (e.stage ? 1 : 0.34), k = (e.time - 0.15) / 1.45;
  return (e.W[0] + e.F[0]) / 2 + e.dir * (-R + k * 3.3 * R);
}

/** Judgement timing: the sword starts falling, and plants. */
const JUDGE = { drop: 0.62, plant: 0.9 };

export const finisherLength = (id: FinisherId): number => DEFS[id].len;
