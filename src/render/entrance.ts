import type { Sfx } from '../audio/sfx';
import { ENTRANCES, type EntranceId } from '../character/entrances';
import {
  METEOR_HIT, PHX_BEAT, PHX_DIVE, STARBORN_FLARE, STAR_COUNT, bombAt, clamp01, drawBats, drawBeam, drawBomb, drawCoinPile,
  drawCrackle, drawFireColumn, drawFireRing, drawFrostFloor, drawHeat, drawIceShell, drawMeteor, drawPhoenix, drawPillar,
  drawPool, drawQuakeCracks, drawReels, drawRift, drawSlashes, drawSmokeCloud, drawStars, drawStormCloud, drawTwister,
  easeIn, easeOut, meteorAt, pillarH, riftX, starAt, twisterX, type EntSpot,
} from './entranceArt';
import type { Fx, View } from './fx';
import type { Light, Shock } from './glfx';
import { mix } from './pixel/color';
import { PPM } from './sprite/animator';
import type { Expression } from './sprite/draw';

/**
 * Pre-fight entrances, played while the sim holds before the countdown. Each
 * one is a short choreography over the fighter's own clips (run, air, land,
 * victory...) plus offsets, fades, tints, squash and stretch, drawn effects,
 * particles and light, so it costs no extra sprites. In battle the light
 * comes from the shader layer (glows, beams, shockwaves, impact frames) and
 * the camera leans in on the hero; the menu previews play the same
 * choreography with soft canvas light.
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
  /** Squash and stretch about the feet (1 = as drawn). */
  sx: number;
  sy: number;
}

/** What an entrance can do to the scene around it. */
export interface EntranceHost {
  fx: Fx;
  shake(amount: number): void;
  flash(color: number, amount: number): void;
  sound(name: Sfx, k?: number): void;
  /** Light in world metres: the shader layer in battle, soft canvas light in the menus. */
  light(l: Light): void;
  /** Screen beats: a shockwave bending the picture, a two-tone impact frame, zoom blur, colour split, a tinted vignette. */
  shock(s: Shock): void;
  impact(hi: number, lo: number, len?: number): void;
  zoomBlur(x: number, y: number, k: number, life: number): void;
  split(k: number, life: number): void;
  vignette(color: number, k: number, life: number): void;
  /** The camera leans in on world x for `seconds` (battle only). */
  focus(x: number, seconds: number, levels?: number): void;
  /** The weapon tip as last drawn (world metres), if the hero holds one. */
  tip(): [number, number] | null;
}

export interface EntranceOptions {
  /** Seconds before it begins (hidden until then). */
  delay?: number;
  /** Full battle scene (camera, dimmed sky) rather than a small menu preview. */
  stage?: boolean;
  /** Art px of room above the hero's head (the Earthshaker pillar never lifts them past it). */
  room?: number;
}

const LEN: Record<EntranceId, number> = {
  stride: 1.7, skyfall: 1.75, smoke: 1.75, shadow: 1.95, thunder: 1.85, inferno: 1.95, frost: 1.95, meteor: 2.3, divine: 2.3,
  whirlwind: 1.9, cannon: 1.85, bats: 1.95, jackpot: 1.95, blade: 1.8, quake: 2.35, rift: 2.15, starborn: 2.2, phoenix: 2.3,
};

export const entranceLength = (id: EntranceId): number => LEN[id];

const UP = Math.PI / 2;
const WHITE = 0xffffff;

/**
 * One fighter's entrance. `x` is the fighter's spot (world metres), `facing`
 * which way they look.
 */
export class Entrance implements EntSpot {
  private t: number;
  private prev: number;
  private readonly pose: EntrancePose = {
    clip: 'idle', frame: 0, face: null, dx: 0, dy: 0, alpha: 1, tint: null, tintA: 0, shadow: 1, clipGround: false, flip: false,
    ghosts: 0, ghostDx: 0, ghostCol: null, sx: 1, sy: 1,
  };
  private trailT = 0;
  readonly stage: boolean;
  readonly room: number;
  /** Signature colour and its deep shade. */
  readonly hi: number;
  readonly lo: number;

  constructor(readonly id: EntranceId, private host: EntranceHost, public x: number, public facing: number, opts: EntranceOptions = {}) {
    // A hair before its start, so the beats at 0 fire on the first step even without a delay.
    this.t = -(opts.delay ?? 0) - 1e-6;
    this.prev = this.t;
    this.stage = !!opts.stage;
    this.room = opts.room ?? 999;
    this.hi = ENTRANCES[id].color;
    this.lo = mix(this.hi, 0x10081a, 0.55);
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
    p.sx = 1; p.sy = 1;
    if (this.t < 0) { p.alpha = 0; p.shadow = 0; return p; }
    // The camera leans in on the hero, letting go as they strike their pose.
    if (this.at(0)) this.host.focus(this.x, LEN[this.id] - 0.4, 1);
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
  light(l: Light): void { this.host.light(l); }
  impact(hi: number, lo: number, len = 0.06): void { this.host.impact(hi, lo, len); }
  vignette(c: number, k: number, life: number): void { this.host.vignette(c, k, life); }

  glow(x: number, y: number, r0: number, r1: number, hi: number, lo: number, life: number, power = 1, extra: Partial<Light> = {}): void {
    this.light({ kind: 'glow', x, y, r0, r1, hi, lo, life, power, ...extra });
  }

  /** A shockwave bending the picture (battle), with a ring of light that also shows in the menus. */
  shock(x: number, y: number, r: number, amp: number, life: number, hi: number, squash = 1): void {
    this.host.shock({ x, y, r, amp, life, hi, squash, dir: this.facing });
    this.light({ kind: 'ring', x, y, r0: r * 0.12, r1: r * 0.85, w: 0.06, squash, hi, lo: mix(hi, 0x000000, 0.5), life: life * 0.85, power: 0.9, fin: 0 });
  }

  /** A flat ring of light racing out over the ground. */
  groundShock(r: number, hi: number, lo: number, life = 0.5, x = this.x): void {
    this.light({ kind: 'ring', x, y: 0.04, r0: r * 0.15, r1: r, w: 0.08, squash: 0.22, hi, lo, life, power: 1.1, fin: 0 });
    this.host.shock({ x, y: 0.1, r: r * 0.9, amp: 3, life: life * 0.9, hi: lo, squash: 0.35 });
  }

  /** A big blow on the spot: impact frame, shockwave, smear and colour split. */
  blow(x: number, y: number, hi: number, lo: number, size = 1, frame = true): void {
    // The two-tone impact frame is kept for the signature moments, so it stays special.
    if (frame) this.impact(hi, ink(lo), 0.05 + 0.03 * size);
    this.shock(x, y, 2.6 * size, 5 + 3 * size, 0.55, hi, 0.75);
    this.host.zoomBlur(x, y, 0.025 * size, 0.22);
    this.host.split(1.5 * size, 0.35);
    this.light({ kind: 'flare', x, y, r0: 1.2 * size, r1: 3.4 * size, w: 0.05, hi, lo, life: 0.5, power: 0.9, fin: 0, real: true });
  }

  /** Leans the camera in harder for a moment (big impacts). */
  punch(seconds = 0.4): void {
    this.host.focus(this.x, seconds, 2);
  }

  /** Squash on landing: wide and short at `from`, springing back over `len`. */
  squash(p: EntrancePose, t: number, from: number, amount: number, len = 0.2): void {
    const k = (t - from) / len;
    if (k < 0 || k >= 1) return;
    // Squash, a little overshoot into stretch, then settle.
    const s = Math.cos(k * Math.PI * 1.5) * (1 - k);
    p.sy = 1 - amount * s;
    p.sx = 1 + amount * 0.6 * s;
  }

  /**
   * The flourish every entrance ends on: a raised weapon and a shout, with the
   * crowd. Fancier entrances end on more light: a glint on the weapon (rare),
   * a glow round the hero (mythic), rays behind them (legendary).
   */
  cheer(p: EntrancePose, t: number, from: number): void {
    const tier = ENTRANCES[this.id].tier;
    if (this.at(from)) {
      this.sound('entCheer');
      const n = tier === 'legendary' ? 3 : tier === 'mythic' ? 2 : tier === 'rare' ? 1 : 0;
      this.fx.burst({ x: this.x, y: 0.1, count: 3 + n * 2, jitter: 0.3, dir: UP, spread: 1.4, speed: [0.6, 1.6], life: [0.3, 0.6], color: 0xd8c8a8, color2: 0x7a6a58, kind: 'smoke', size: 2, drag: 2.5 });
      if (n >= 2) this.glow(this.x, 1.1, 0.8, 1.5, this.hi, this.lo, 0.9, 0.45, { fin: 0.2 });
      if (n >= 3) {
        this.light({ kind: 'rays', x: this.x, y: 1.2, r0: 1.2, r1: 2.6, hi: this.hi, lo: this.lo, life: 1.0, power: 0.55, fin: 0.25 });
        this.fx.burst({ x: this.x, y: 1.1, count: 10, jitter: 0.5, jitterY: 0.8, speed: [0.3, 1], life: [0.4, 0.8], color: WHITE, color2: this.hi, kind: 'twinkle' });
      }
    }
    // The glint as the weapon reaches the top.
    if (this.at(from + 0.14)) {
      const tip = this.host.tip() ?? [this.x + this.facing * 0.4, 2.1];
      const big = tier === 'common' ? 0.6 : tier === 'rare' ? 0.85 : 1.1;
      this.light({ kind: 'star', x: tip[0], y: tip[1], r0: 0.35 * big, r1: 0.75 * big, w: 0.035, hi: WHITE, lo: tier === 'common' ? 0xd8c8a8 : this.hi, life: 0.35, power: 1.1, fin: 0 });
      if (tier !== 'common') this.sound('shing', 0.35);
    }
    const u = t - from;
    p.clip = 'victory';
    p.frame = Math.floor(Math.max(0, u) * 5) % 2;
    // A hop of stretch as the arm goes up.
    if (u >= 0 && u < 0.16) { const s = Math.sin((u / 0.16) * Math.PI); p.sy = 1 + 0.07 * s; p.sx = 1 - 0.04 * s; }
  }

  /** Effects that aren't particles (pools, beams, the meteor...), behind or in front of the fighter. */
  draw(g: CanvasRenderingContext2D, v: View, layer: 'under' | 'over'): void {
    const t = this.t;
    if (t < 0 || this.done) return;
    const cx = Math.round(v.sx(this.x)), gy = Math.round(v.sy(0));
    const under = layer === 'under';
    switch (this.id) {
      case 'shadow': if (under) drawPool(g, cx, gy, t); break;
      case 'divine': if (under) drawBeam(g, cx, gy, t, this.stage); break;
      case 'inferno':
        if (under) { drawFireRing(g, cx, gy, t, INF.ERUPT, 1.9); drawHeat(g, cx, gy, t, t < INF.ERUPT ? t / INF.ERUPT : clamp01(1 - (t - 1.2) / 0.6)); }
        else drawFireColumn(g, cx, gy, t, INF.ERUPT, INF.BURN + 0.15);
        break;
      case 'frost':
        if (under) drawFrostFloor(g, cx, gy, t);
        else drawIceShell(g, cx, gy, t, 0.35, FROST_BREAK);
        break;
      case 'thunder':
        if (!under) {
          drawStormCloud(g, cx, this.stage ? Math.round(v.sy(5.2)) : 3, t, THUNDER_HIT);
          drawCrackle(g, cx, gy, t, THUNDER_HIT, THUNDER_HIT + 0.75);
        }
        break;
      case 'smoke':
        if (!under) {
          if (t < SMOKE_BANG) { const [bx, by] = bombAt(this, t); drawBomb(g, Math.round(v.sx(bx)), Math.round(v.sy(by)), t); }
          drawSmokeCloud(g, cx, gy, t, SMOKE_BANG);
        }
        break;
      case 'whirlwind': if (!under) drawTwister(g, Math.round(v.sx(twisterX(this, t))), gy, t); break;
      case 'bats': if (!under) drawBats(g, v, this, t); break;
      case 'jackpot':
        if (under) drawCoinPile(g, cx, gy, t);
        else drawReels(g, cx, Math.max(2, Math.round(v.sy(2.05)) - 11), t);
        break;
      case 'blade': if (!under) drawSlashes(g, cx, gy, t, BLADE_CUT); break;
      case 'quake':
        if (under) { drawQuakeCracks(g, cx, gy, t); drawPillar(g, cx, gy, t, this.pillarCap); }
        break;
      case 'rift': if (under) drawRift(g, Math.round(v.sx(riftX(this))), gy, t); break;
      case 'starborn': drawStars(g, v, this, t, layer); break;
      case 'phoenix': drawPhoenix(g, v, this, t, layer); break;
      case 'meteor':
        if (!under && t < METEOR_HIT) {
          const [mx, my] = meteorAt(this, t / METEOR_HIT);
          drawMeteor(g, Math.round(v.sx(mx)), Math.round(v.sy(my)), t, this.facing, this.stage ? 1.2 : 0.85);
        }
        if (under && t > METEOR_HIT) drawHeat(g, cx, gy, t, clamp01(1 - (t - METEOR_HIT - 0.6) / 0.7));
        break;
      default: break;
    }
  }

  /** How high the Earthshaker pillar may lift the hero here (art px). */
  get pillarCap(): number {
    return Math.max(8, this.room);
  }
}

/** A very dark version of a colour, for an impact frame's ink. */
function ink(c: number): number {
  return mix(c, 0x0a0614, 0.86);
}

const SMOKE_BANG = 0.55;
const THUNDER_HIT = 0.62;
const FROST_BREAK = 1.2;
const BLADE_CUT = 1.15;
const INF = { ERUPT: 0.55, SHOW: 0.8, BURN: 1.25 };

type Step = (e: Entrance, t: number, p: EntrancePose) => void;

const dust = (e: Entrance, x: number, count: number, spread = 1.2) =>
  e.fx.burst({ x, y: 0.1, count, jitter: 0.25 * spread, speed: [0.4, 1.4 * spread], dir: UP, spread: 1.3, life: [0.35, 0.7], color: 0xc8b898, color2: 0x7a6a58, kind: 'smoke', size: 3, drag: 2.5 });

/** Dust thrown out low to both sides of a landing. */
function dustWall(e: Entrance, x: number, count: number, speed = 4): void {
  for (const d of [0, Math.PI]) e.fx.burst({ x, y: 0.15, count, jitter: 0.2, jitterY: 0.1, dir: d + (d ? -0.25 : 0.25), spread: 0.35, speed: [speed * 0.4, speed], life: [0.4, 0.8], color: 0xd8c8a8, color2: 0x6a5a48, kind: 'smoke', size: 3, drag: 3 });
}

/** Rock chips thrown up and falling back. */
function debris(e: Entrance, x: number, count: number, color = 0x8a7458, speed = 5): void {
  e.fx.burst({ x, y: 0.2, count, dir: UP, spread: 1.1, speed: [speed * 0.4, speed], life: [0.5, 1], color, color2: 0x3a2e28, gravity: 14, size: 2 });
}

const STEPS: Record<EntranceId, Step> = {
  // Strides on from behind, skids to a stop and pumps a fist to the crowd.
  stride(e, t, p) {
    const WALK = 0.9, STOP = 1.1;
    if (t < WALK) {
      const k = t / WALK;
      p.clip = 'run';
      p.frame = Math.floor(t * 11);
      p.dx = -e.facing * 3 * (1 - easeOut(k * 0.6 + k * 0.4));
      p.alpha = clamp01(t / 0.15);
      if (e.tick(0.18)) { dust(e, e.x + p.dx, 2, 0.6); e.sound('entStep', 0.8); }
      return;
    }
    if (e.at(WALK)) {
      dust(e, e.x + e.facing * 0.2, 6, 1);
      e.fx.burst({ x: e.x + e.facing * 0.3, y: 0.05, count: 5, jitter: 0.1, dir: e.facing > 0 ? 0.3 : Math.PI - 0.3, spread: 0.3, speed: [1.5, 3], life: [0.3, 0.5], color: 0xd8c8a8, color2: 0x7a6a58, kind: 'smoke', size: 2, drag: 3 });
      e.sound('entStep', 1.2);
    }
    e.squash(p, t, WALK, 0.1, 0.16);
    if (t < STOP) { p.clip = 'stop'; p.frame = t < 1.0 ? 0 : 1; return; }
    if (e.at(STOP)) { e.shake(0.15); dustWall(e, e.x, 3, 2.5); }
    e.cheer(p, t, STOP);
  },

  // Whistles down out of the sky like a stone and craters the sand.
  skyfall(e, t, p) {
    const HIT = 0.6;
    if (e.at(0)) {
      e.sound('entFall');
      // Where they'll land: a ring of light tightening on the spot.
      e.light({ kind: 'ring', x: e.x, y: 0.04, r0: 1.6, r1: 0.4, w: 0.05, squash: 0.25, hi: 0x9ad8ff, lo: 0x3a6aa0, life: HIT, power: 0.7, fin: 0.5 });
      e.light({ kind: 'beam', x: e.x, y: 0, follow: () => (e.time < HIT ? [e.x, 9 * (1 - (e.time / HIT) ** 2) + 1.6] : null), r0: 2.4, r1: 3.2, w: 0.22, rot: UP, hi: 0xe8f4ff, lo: 0x5a8ac8, life: HIT + 0.1, power: 0.7, fin: 0.3 });
    }
    if (t < HIT) {
      const k = t / HIT;
      p.clip = 'air'; p.frame = 1; p.face = 'fierce';
      p.dy = 9 * (1 - k * k);
      p.shadow = k;
      // Stretched by the speed.
      p.sy = 1 + 0.12 * k; p.sx = 1 - 0.07 * k;
      if (e.tick(0.025)) e.fx.burst({ x: e.x, y: p.dy + 1.4, count: 2, jitter: 0.5, dir: UP, spread: 0.05, speed: [6, 9], life: [0.08, 0.16], color: 0xe8f4ff, color2: 0x9ab8d8, kind: 'streak' });
      return;
    }
    if (e.at(HIT)) {
      e.sound('entSlam');
      e.sound('explosion', 0.35);
      e.shake(1.1);
      e.punch();
      e.blow(e.x, 0.3, 0xe8f4ff, 0x3a5a80, 1, false);
      e.groundShock(2.8, 0xe8dcc0, 0x8a7458);
      e.fx.pulse('crack', e.x, 0, 1.5, 0x6a5040, 1.3);
      e.fx.pulse('groundRing', e.x, 0, 1.9, 0xe8dcc0, 0.4);
      dustWall(e, e.x, 10, 5);
      debris(e, e.x, 14);
      e.glow(e.x, 0.2, 0.5, 1.2, 0xfff4e0, 0xc8a878, 0.35, 0.8, { fin: 0 });
    }
    e.squash(p, t, HIT, 0.24, 0.24);
    if (t < HIT + 0.35) { p.clip = 'land'; p.frame = 0; p.face = 'fierce'; }
    else if (t < HIT + 0.55) { p.clip = 'land'; p.frame = 1; }
    else e.cheer(p, t, HIT + 0.55);
  },

  // A lit bomb rolls in and goes off; they're standing in the smoke as it parts.
  smoke(e, t, p) {
    const BANG = SMOKE_BANG;
    if (e.at(0)) {
      e.sound('hiss', 0.7);
      e.glow(0, 0, 0.15, 0.3, 0xffd060, 0xff6020, BANG, 0.9, { follow: () => { if (e.time >= BANG) return null; const [bx, by] = bombAt(e, e.time); return [bx + e.facing * 0.1, by + 0.25]; } });
    }
    if (t < BANG) {
      if (e.tick(0.04)) { const [bx, by] = bombAt(e, t); e.fx.burst({ x: bx + 0.1, y: by + 0.25, count: 2, jitter: 0.03, dir: UP, spread: 1, speed: [0.5, 1.6], life: [0.12, 0.28], color: 0xfff4c0, color2: 0xff6020, kind: 'ember' }); }
      p.alpha = 0; p.shadow = 0;
      return;
    }
    if (e.at(BANG)) {
      e.sound('entPoof', 1.3);
      e.sound('explosion', 0.35);
      e.shake(0.5);
      e.flash(0xffffff, 0.4);
      e.light({ kind: 'star', x: e.x, y: 0.5, r0: 0.6, r1: 1.4, w: 0.05, hi: WHITE, lo: 0xffd060, life: 0.25, power: 1.2, fin: 0 });
      e.glow(e.x, 0.8, 0.6, 1.6, 0xfff4c0, 0xff8030, 0.4, 0.9, { fin: 0 });
      e.shock(e.x, 0.8, 2.2, 5, 0.45, 0xe0d8f0);
      e.fx.pulse('cloud', e.x, 0, 1.3, 0xb8b0c8, 1.4, 0x6a6280);
      e.fx.burst({ x: e.x, y: 0.7, count: 18, jitter: 0.3, speed: [1.5, 3.5], life: [0.4, 0.9], color: 0xd0c8e0, color2: 0x5a5470, kind: 'smoke', size: 4, drag: 3 });
    }
    if (e.at(BANG + 0.3)) e.fx.burst({ x: e.x, y: 2.4, count: 22, jitter: 0.9, dir: -UP, spread: 0.6, speed: [0.3, 1.2], life: [0.6, 1.1], color: 0xffe8a0, color2: 0xff8040, kind: 'twinkle', gravity: 2 });
    // A dark shape in the smoke first, then the hero as it clears.
    p.alpha = clamp01((t - BANG - 0.08) / 0.15);
    p.shadow = p.alpha;
    p.tint = '#2a2438'; p.tintA = 0.9 * (1 - clamp01((t - BANG - 0.3) / 0.35));
    if (t < BANG + 0.4) { p.clip = 'land'; p.frame = 0; p.face = 'fierce'; }
    else if (t < BANG + 0.55) { p.clip = 'land'; p.frame = 1; }
    else e.cheer(p, t, BANG + 0.55);
  },

  // A pool of shadow spreads and reaches up; they rise out of it, still dark, and step free.
  shadow(e, t, p) {
    const RISE = 0.5, UPT = 1.25;
    if (e.at(0)) {
      e.sound('entRise');
      e.vignette(0x2a1048, 0.65, 1.7);
      e.glow(e.x, 0.1, 0.5, 1.3, 0x9a50e0, 0x2a1048, 1.6, 0.7, { fin: 0.3 });
    }
    if (t < 1.5 && e.tick(0.05)) e.fx.burst({ x: e.x, y: 0.05, count: 2, jitter: 0.7, jitterY: 0, dir: UP, spread: 0.2, speed: [0.6, 1.8], life: [0.4, 0.8], color: 0xc890ff, color2: 0x3a1a60, kind: 'twinkle' });
    if (t < 1.3 && e.tick(0.09)) e.fx.burst({ x: e.x, y: 0.1, count: 1, jitter: 0.6, jitterY: 0, dir: UP, spread: 0.2, speed: [0.3, 0.8], life: [0.5, 0.9], color: 0x3a1a60, color2: 0x0c0414, kind: 'smoke', size: 3 });
    if (t < RISE) { p.alpha = 0; p.shadow = 0; return; }
    p.clipGround = true;
    p.shadow = 0;
    if (t < UPT) {
      const k = easeOut((t - RISE) / (UPT - RISE));
      p.dy = -2.3 * (1 - k);
      p.face = 'fierce';
      p.tint = '#1a0828'; p.tintA = 0.92 - k * 0.3;
      return;
    }
    if (e.at(UPT)) {
      e.sound('cast');
      e.sound('entSlam', 0.35);
      e.shock(e.x, 1, 2, 4, 0.5, 0xc890ff);
      e.groundShock(2.2, 0xc890ff, 0x3a1a60);
      e.light({ kind: 'star', x: e.x, y: 1.75, r0: 0.3, r1: 0.7, w: 0.03, hi: 0xffd0ff, lo: 0x9a50e0, life: 0.3, power: 1, fin: 0 });
      e.fx.burst({ x: e.x, y: 1, count: 14, jitter: 0.3, jitterY: 0.7, speed: [1, 3], life: [0.3, 0.6], color: 0x9a50e0, color2: 0x1a0828, kind: 'smoke', size: 3, drag: 3 });
    }
    p.tint = '#1a0828'; p.tintA = Math.max(0, 0.6 - (t - UPT) * 2);
    if (t < UPT + 0.08) { p.clip = 'land'; p.frame = 1; return; }
    e.cheer(p, t, UPT + 0.08);
  },

  // Storm clouds gather, the air crackles, and a bolt drops them crouched in its sparks.
  thunder(e, t, p) {
    const HIT = THUNDER_HIT;
    if (e.at(0)) {
      e.sound('entRumble', 0.6);
      e.vignette(0x0a1428, 0.7, 1.5);
      e.fx.pulse('swirl', e.x, 1.1, 1.4, 0x7ac8ff, HIT, WHITE);
    }
    for (const k of [0.25, 0.42]) if (e.at(k)) { e.fx.bolt(e.x - 1.5, 5, e.x + 1.2, 5.3, 0x7ac8ff, 0.08); e.flash(0xc8e8ff, 0.25); e.sound('lightning', 0.25); }
    if (t < HIT) {
      if (e.tick(0.05)) e.fx.burst({ x: e.x, y: 0.05, count: 1, jitter: 0.5, jitterY: 0, dir: UP, spread: 0.3, speed: [1, 2.5], life: [0.12, 0.25], color: WHITE, color2: 0x7ac8ff, kind: 'streak' });
      p.alpha = 0; p.shadow = 0;
      return;
    }
    if (e.at(HIT)) {
      e.sound('lightning');
      e.sound('entSlam', 0.7);
      e.fx.bolt(e.x + 0.4, 10, e.x, 0, 0x7ac8ff, 0.32);
      e.fx.bolt(e.x - 0.6, 10, e.x + 0.1, 0.2, 0x9ad8ff, 0.22);
      e.light({ kind: 'beam', x: e.x, y: 0, r0: 12, r1: 12, w: 0.3, rot: UP, hi: WHITE, lo: 0x5aa8ff, life: 0.35, power: 1.4, fin: 0, real: true });
      e.flash(0xe8f4ff, 1.2);
      e.shake(1.0);
      e.punch(0.35);
      e.blow(e.x, 0.4, 0xe8f4ff, 0x2a5aa0, 1.1);
      e.groundShock(2.6, 0x9ad8ff, 0x2a5aa0);
      e.fx.pulse('groundRing', e.x, 0, 1.9, 0x9ad8ff, 0.45);
      e.fx.pulse('crack', e.x, 0, 1.1, 0x3a6aa0, 1);
      e.fx.burst({ x: e.x, y: 0.3, count: 24, dir: UP, spread: 1.4, speed: [2, 6], life: [0.2, 0.5], color: WHITE, color2: 0x7ac8ff, kind: 'streak' });
    }
    if (e.at(HIT + 0.35)) { e.fx.bolt(e.x - 0.3, 2.2, e.x + 0.5, 0.4, 0x7ac8ff, 0.12); e.sound('lightning', 0.3); }
    if (t < HIT + 0.8 && e.tick(0.06)) e.fx.burst({ x: e.x, y: 1, count: 1, jitter: 0.5, jitterY: 0.8, speed: [0.3, 1], life: [0.15, 0.3], color: WHITE, color2: 0x7ac8ff, kind: 'twinkle' });
    e.squash(p, t, HIT, 0.18);
    p.tint = '#ffffff'; p.tintA = Math.max(0, 1 - (t - HIT) * 3);
    if (t < HIT + 0.4) { p.clip = 'land'; p.frame = 0; p.face = 'fierce'; }
    else if (t < HIT + 0.58) { p.clip = 'land'; p.frame = 1; }
    else e.cheer(p, t, HIT + 0.58);
  },

  // Embers spiral in, the sand glows, and a column of fire bursts up and burns down around them.
  inferno(e, t, p) {
    const { ERUPT, SHOW, BURN } = INF;
    if (e.at(0)) {
      e.sound('cast');
      e.fx.pulse('swirl', e.x, 0.6, 1.5, 0xffb040, ERUPT, 0xd83a1a);
      e.glow(e.x, 0.1, 0.3, 1.1, 0xffb040, 0x8a1a08, ERUPT + 0.25, 0.8, { fin: 0.9 });
    }
    if (t < ERUPT && e.tick(0.04)) e.fx.burst({ x: e.x, y: 0.05, count: 2, jitter: 1, jitterY: 0, dir: UP, spread: 0.3, speed: [0.5, 1.5], life: [0.3, 0.6], color: 0xffd060, color2: 0xd83a1a, kind: 'ember' });
    if (e.at(ERUPT)) {
      e.sound('entIgnite');
      e.sound('explosion', 0.3);
      e.shake(0.7);
      e.flash(0xff8030, 0.5);
      e.blow(e.x, 0.6, 0xffd060, 0xa02810, 0.9, false);
      e.groundShock(2.4, 0xffb040, 0x8a1a08);
      e.light({ kind: 'beam', x: e.x, y: 0, r0: 3, r1: 5, w: 0.55, rot: UP, hi: 0xffe080, lo: 0xd83a1a, life: BURN - ERUPT + 0.3, power: 1.1, fin: 0.05 });
      e.vignette(0x3a0c04, 0.55, 1.3);
    }
    if (t > ERUPT && t < BURN + 0.2 && e.tick(0.03)) e.fx.burst({ x: e.x, y: 0.4, count: 3, jitter: 0.5, jitterY: 0.4, dir: UP, spread: 0.25, speed: [2, 5], life: [0.25, 0.55], color: 0xffe080, color2: 0xd83a1a, kind: 'flame' });
    if (t < SHOW) { p.alpha = 0; p.shadow = 0; return; }
    p.tint = '#ff9040'; p.tintA = Math.max(0, 0.75 - (t - SHOW) * 1.3);
    if (t < BURN) { p.clip = 'land'; p.frame = 1; p.face = 'fierce'; return; }
    if (e.at(BURN)) {
      e.sound('entIgnite', 0.5);
      e.fx.burst({ x: e.x, y: 1, count: 18, jitter: 0.4, speed: [1, 3], life: [0.4, 0.9], color: 0xffd060, color2: 0xc83a1a, kind: 'ember' });
      e.glow(e.x, 1, 0.6, 1.3, 0xffd060, 0xc83a1a, 0.5, 0.6, { fin: 0 });
    }
    e.cheer(p, t, BURN);
  },

  // Frost creeps out, ice closes round them, cracks race over it and the shell shatters.
  frost(e, t, p) {
    const BREAK = FROST_BREAK;
    if (e.at(0)) {
      e.sound('freeze');
      e.vignette(0x0a2a40, 0.5, 1.7);
      e.glow(e.x, 0.1, 0.5, 1.2, 0xbff0ff, 0x2a6a90, 1.3, 0.5, { fin: 0.4 });
    }
    if (t < 1.4 && e.tick(0.06)) e.fx.burst({ x: e.x, y: 0.1, count: 1, jitter: 1, jitterY: 0, dir: UP, spread: 0.5, speed: [0.2, 0.6], life: [0.5, 0.9], color: 0xe8fbff, color2: 0x8ad8ff, kind: 'smoke', size: 3, drag: 1 });
    if (e.at(0.3)) {
      e.sound('freeze', 0.6);
      e.fx.pulse('icicles', e.x, 0, 1.2, 0xbff0ff, 1.2, 0x6ab8e0);
      e.fx.burst({ x: e.x, y: 0.3, count: 14, jitter: 0.9, dir: UP, spread: 0.7, speed: [0.5, 2], life: [0.6, 1.1], color: 0xf0ffff, color2: 0x8ad8ff, kind: 'flake', gravity: 1 });
    }
    if (t < 0.35) { p.alpha = 0; p.shadow = 0; return; }
    p.alpha = clamp01((t - 0.35) / 0.12);
    p.shadow = p.alpha;
    if (t < BREAK) {
      p.tint = '#c8f4ff'; p.tintA = 0.75;
      if (e.at(BREAK - 0.4)) { e.sound('glass', 0.35); e.shake(0.15); }
      if (e.at(BREAK - 0.18)) { e.sound('glass', 0.45); e.shake(0.2); }
      // The shell creaks.
      p.dx = t > BREAK - 0.25 ? ((Math.floor(t * 40) & 1) ? 0.03 : -0.03) : 0;
      return;
    }
    if (e.at(BREAK)) {
      e.sound('glass');
      e.sound('entSlam', 0.45);
      e.shake(0.55);
      e.flash(0xbff0ff, 0.5);
      e.blow(e.x, 1, 0xe8fbff, 0x2a6a90, 0.8, false);
      for (let i = 0; i < 3; i++) e.light({ kind: 'star', x: e.x + (i - 1) * 0.45, y: 0.8 + i * 0.45, r0: 0.25, r1: 0.6, w: 0.03, hi: WHITE, lo: 0x8ad8ff, life: 0.3, power: 1, fin: 0, delay: i * 0.05 });
      e.fx.burst({ x: e.x, y: 1, count: 30, jitter: 0.4, jitterY: 0.9, dir: UP, spread: 1.4, speed: [2, 5.5], life: [0.4, 0.9], color: WHITE, color2: 0x8ad8ff, size: 2, gravity: 12 });
      e.fx.burst({ x: e.x, y: 1.2, count: 12, jitter: 0.6, jitterY: 0.8, speed: [0.3, 1], life: [0.6, 1.1], color: 0xf0ffff, color2: 0x8ad8ff, kind: 'flake', gravity: 0.5 });
    }
    p.tint = '#c8f4ff'; p.tintA = Math.max(0, 0.5 - (t - BREAK) * 2.5);
    if (t < BREAK + 0.12) { p.clip = 'land'; p.frame = 1; p.face = 'shout'; }
    else e.cheer(p, t, BREAK + 0.12);
  },

  // The sky reddens and a blazing meteor rides them down: the biggest impact of them all.
  meteor(e, t, p) {
    const HIT = METEOR_HIT;
    if (e.at(0)) {
      e.sound('entFall');
      e.sound('roar', 0.6);
      e.vignette(0x401008, 0.6, HIT + 1.2);
      const at = (): [number, number] | null => (e.time < HIT ? meteorAt(e, e.time / HIT) : null);
      e.glow(0, 0, 0.7, 1.3, 0xffd060, 0xc83a1a, HIT + 0.05, 1, { follow: at, fin: 0.2 });
      e.light({ kind: 'ring', x: e.x, y: 0.04, r0: 2.2, r1: 0.5, w: 0.06, squash: 0.25, hi: 0xffb040, lo: 0x8a1a08, life: HIT, power: 0.8, fin: 0.6 });
      e.glow(e.x, 0.05, 0.3, 1.2, 0xff8030, 0x5a1004, HIT, 0.6, { fin: 0.9 });
    }
    if (t < HIT) {
      const [mx, my] = meteorAt(e, t / HIT);
      if (e.tick(0.016)) {
        e.fx.burst({ x: mx, y: my, count: 3, jitter: 0.18, dir: UP + e.facing * 0.6, spread: 0.4, speed: [0.5, 2], life: [0.2, 0.45], color: 0xffe080, color2: 0xc83a1a, kind: 'flame' });
        e.fx.burst({ x: mx, y: my, count: 1, jitter: 0.1, speed: [0.1, 0.4], life: [0.5, 0.9], color: 0x6a5a5a, color2: 0x2a2028, kind: 'smoke', size: 3 });
      }
      if (e.at(HIT - 0.3)) e.sound('entFall', 0.7);
      p.alpha = 0;
      p.shadow = t / HIT;
      return;
    }
    if (e.at(HIT)) {
      e.sound('explosion');
      e.sound('entSlam');
      e.shake(1.6);
      e.punch(0.5);
      e.flash(0xffc060, 1.4);
      e.blow(e.x, 0.5, 0xfff0a0, 0xa02810, 1.5);
      e.groundShock(3.4, 0xffb040, 0x8a1a08, 0.7);
      e.light({ kind: 'rays', x: e.x, y: 0.8, r0: 1.5, r1: 4, hi: 0xffe080, lo: 0xc83a1a, life: 0.8, power: 0.6, fin: 0 });
      e.fx.pulse('dome', e.x, 0, 1.2, 0xffe080, 0.7, 0xc83a1a);
      e.fx.pulse('crater', e.x, 0, 1.3, 0xff8030, 2.4, 0xfff0a0);
      e.fx.pulse('crack', e.x, 0, 1.9, 0x8a3a1a, 1.4);
      e.fx.pulse('cloud', e.x, 0, 1.5, 0x5a4a4a, 1.4, 0x2a2028);
      e.fx.burst({ x: e.x, y: 0.3, count: 34, dir: UP, spread: 1.3, speed: [2, 7], life: [0.4, 1], color: 0xffe080, color2: 0xc83a1a, kind: 'ember' });
      debris(e, e.x, 18, 0x5a4038, 6.5);
      dustWall(e, e.x, 8, 6);
    }
    if (t < HIT + 0.9 && e.tick(0.06)) e.fx.burst({ x: e.x, y: 0.1, count: 1, jitter: 0.9, jitterY: 0, dir: UP, spread: 0.3, speed: [0.5, 1.2], life: [0.4, 0.8], color: 0xffd060, color2: 0xd83a1a, kind: 'ember' });
    // They rise out of the crater's smoke, still glowing from the fire.
    p.alpha = clamp01((t - HIT - 0.05) / 0.2);
    p.shadow = p.alpha;
    e.squash(p, t, HIT + 0.05, 0.2, 0.22);
    p.tint = '#ffa040'; p.tintA = Math.max(0, 0.8 - (t - HIT) * 1.4);
    if (t < HIT + 0.5) { p.clip = 'land'; p.frame = 0; p.face = 'fierce'; }
    else if (t < HIT + 0.68) { p.clip = 'land'; p.frame = 1; }
    else e.cheer(p, t, HIT + 0.68);
  },

  // The clouds part, a golden beam comes down and they float down in it under a halo, feathers falling.
  divine(e, t, p) {
    const LAND = 1.45, FROM = 4.8;
    const yAt = (tt: number) => FROM * (1 - easeOut(tt / LAND));
    if (e.at(0)) {
      e.sound('entChoir');
      e.vignette(0x2a1c08, 0.35, LAND + 0.8);
      e.light({ kind: 'beam', x: e.x, y: 0, r0: 9, r1: 9, w: 0.5, rot: UP, hi: 0xfff4c0, lo: 0xffb040, life: LAND + 0.7, power: 0.75, fin: 0.12 });
      e.light({ kind: 'rays', x: e.x, y: 2.6, r0: 2, r1: 3.6, hi: 0xfff0c0, lo: 0xc8901a, life: LAND + 0.8, power: 0.45, fin: 0.3 });
      e.light({ kind: 'ring', x: e.x, y: 0, follow: () => (e.time < LAND + 0.3 ? [e.x, Math.max(0, yAt(Math.min(e.time, LAND))) + 2.15] : null), r0: 0.3, r1: 0.32, w: 0.035, squash: 0.3, hi: 0xffe070, lo: 0xc8901a, life: LAND + 0.5, power: 1, fin: 0.3 });
    }
    if (t < 1.8 && e.tick(0.05)) e.fx.burst({ x: e.x, y: 3.5, count: 2, jitter: 0.7, jitterY: 1.5, dir: -UP, spread: 0.2, speed: [0.3, 0.9], life: [0.5, 1], color: 0xfff4c0, color2: 0xffc040, kind: 'twinkle' });
    if (t < 1.7 && e.tick(0.12)) e.fx.burst({ x: e.x, y: 3.2, count: 1, jitter: 1.4, jitterY: 0.8, dir: -UP, spread: 0.4, speed: [0.2, 0.5], life: [0.9, 1.4], color: 0xfffbf0, color2: 0xe8d8b0, kind: 'petal', gravity: 0.6 });
    if (t < LAND) {
      const k = easeOut(t / LAND);
      p.clip = 'victory'; p.frame = 0; p.face = 'calm';
      p.dy = yAt(t) + 0.08 * Math.sin(t * 6);
      p.alpha = clamp01(t / 0.35);
      p.shadow = k;
      p.tint = '#fff4c0'; p.tintA = 0.55 * (1 - k);
      return;
    }
    if (e.at(LAND)) {
      e.sound('tierUp', 3);
      e.groundShock(2.8, 0xffe070, 0xc8901a, 0.7);
      e.shock(e.x, 0.6, 2.2, 3, 0.6, 0xffe070, 0.6);
      e.glow(e.x, 0.6, 0.6, 1.6, 0xfff4c0, 0xffb040, 0.7, 0.7, { fin: 0 });
      e.fx.pulse('groundRing', e.x, 0, 2, 0xffe070, 0.6);
      e.fx.burst({ x: e.x, y: 0.2, count: 22, jitter: 0.3, dir: UP, spread: 1.4, speed: [1, 3], life: [0.4, 0.9], color: 0xfff4c0, color2: 0xffb040, kind: 'twinkle' });
    }
    e.squash(p, t, LAND, 0.1);
    if (t < LAND + 0.14) { p.clip = 'land'; p.frame = 1; p.face = 'calm'; }
    else e.cheer(p, t, LAND + 0.14);
  },

  // A tornado tears in from behind, debris whirling, and spits them out still spinning.
  whirlwind(e, t, p) {
    const OUT = 1.05;
    if (e.at(0)) e.sound('entWind');
    if (e.at(0.5)) e.sound('entWind', 0.7);
    if (t < 1.15 && e.tick(0.04)) {
      const tx = twisterX(e, t);
      e.fx.burst({ x: tx, y: 0.2, count: 2, jitter: 0.5, jitterY: 0.2, dir: UP, spread: 0.4, speed: [1.5, 3], life: [0.3, 0.6], color: 0x9ac860, color2: 0x4a7a30, kind: 'petal', gravity: 1 });
      e.fx.burst({ x: tx, y: 0.05, count: 1, jitter: 0.5, jitterY: 0, dir: UP, spread: 1, speed: [0.4, 1], life: [0.3, 0.6], color: 0xc8b898, color2: 0x7a6a58, kind: 'smoke', size: 3 });
    }
    if (t < 0.5) { p.alpha = 0; p.shadow = 0; return; }
    if (t < OUT) {
      const k = (t - 0.5) / (OUT - 0.5);
      p.dx = twisterX(e, t) - e.x;
      p.dy = 0.9 * Math.sin(k * Math.PI);
      p.clip = 'air'; p.frame = 0; p.face = 'fierce';
      p.flip = (Math.floor(t * 16) & 1) === 1;
      p.ghosts = 2; p.ghostDx = e.facing * 0.25; p.ghostCol = '#e8e0c8';
      p.alpha = clamp01((t - 0.5) / 0.15);
      p.shadow = p.alpha;
      return;
    }
    if (e.at(OUT)) {
      dust(e, e.x, 8, 1.2);
      dustWall(e, e.x, 5, 4);
      e.sound('entSlam', 0.5);
      e.sound('gale', 0.6);
      e.shake(0.35);
      e.fx.pulse('gust', e.x, 1.1, 2.4, 0xc8c0a8, 0.5, 0xf0e8d0);
      e.shock(e.x, 1, 2.2, 4, 0.45, 0xf0e8d0);
    }
    e.squash(p, t, OUT, 0.16);
    if (t < OUT + 0.2) { p.clip = 'land'; p.frame = t < OUT + 0.1 ? 0 : 1; }
    else e.cheer(p, t, OUT + 0.2);
  },

  // Boom! Fired from a cannon offstage: a tumbling arc trailing smoke, a skidding landing.
  cannon(e, t, p) {
    const LAND = 0.8, FROM = 7;
    if (e.at(0)) {
      const mx = e.x - e.facing * FROM;
      e.sound('entCannon');
      e.shake(0.45);
      e.light({ kind: 'flare', x: mx, y: 1.2, r0: 1, r1: 2.6, w: 0.08, hi: 0xfff0c0, lo: 0xff8030, life: 0.35, power: 1.2, fin: 0 });
      e.glow(mx, 1.2, 0.6, 1.4, 0xffd060, 0xc84a1a, 0.4, 1, { fin: 0 });
      e.fx.pulse('cloud', mx, 0.6, 1.2, 0xd8d0c8, 1.2, 0x6a6470);
      e.fx.burst({ x: mx, y: 1.2, count: 14, dir: e.facing > 0 ? 0.3 : Math.PI - 0.3, spread: 0.5, speed: [3, 7], life: [0.2, 0.45], color: 0xffe080, color2: 0xc83a1a, kind: 'ember' });
    }
    if (t < LAND) {
      const k = t / LAND;
      p.dx = -e.facing * FROM * (1 - k);
      p.dy = 1.2 * (1 - k) + 4.6 * k * (1 - k) * 1.6;
      p.clip = 'air'; p.frame = Math.floor(t * 12); p.face = 'shout';
      p.flip = (Math.floor(t * 10) & 1) === 1;
      p.shadow = k;
      p.sx = 1.08; p.sy = 0.94;
      p.ghosts = 2; p.ghostDx = e.facing * 0.35; p.ghostCol = null;
      if (e.tick(0.025)) e.fx.burst({ x: e.x + p.dx, y: p.dy + 0.9, count: 1, jitter: 0.1, speed: [0.1, 0.3], life: [0.5, 0.9], color: 0xd8d0c8, color2: 0x6a6470, kind: 'smoke', size: 3 });
      return;
    }
    if (e.at(LAND)) {
      e.sound('entSlam', 0.8);
      e.shake(0.6);
      e.fx.pulse('groundRing', e.x, 0, 1.5, 0xe8dcc0, 0.35);
      e.shock(e.x, 0.3, 1.8, 4, 0.4, 0xe8dcc0, 0.6);
      e.fx.burst({ x: e.x, y: 0.2, count: 10, dir: e.facing > 0 ? 0.4 : Math.PI - 0.4, spread: 0.4, speed: [2, 5], life: [0.4, 0.8], color: 0xd8c8a8, color2: 0x6a5a48, kind: 'smoke', size: 3, drag: 3 });
    }
    e.squash(p, t, LAND, 0.2);
    if (t < LAND + 0.35) {
      // Skids to a stop on the spot, heels striking sparks.
      const k = (t - LAND) / 0.35;
      p.dx = -e.facing * 0.8 * (1 - easeOut(k));
      p.clip = 'land'; p.frame = 0; p.face = 'fierce';
      if (e.tick(0.04)) {
        dust(e, e.x + p.dx + e.facing * 0.2, 2, 0.8);
        e.fx.burst({ x: e.x + p.dx, y: 0.05, count: 2, dir: e.facing > 0 ? Math.PI - 0.5 : 0.5, spread: 0.4, speed: [1.5, 3], life: [0.12, 0.25], color: 0xfff4c0, color2: 0xff8030, kind: 'streak' });
      }
      return;
    }
    if (t < LAND + 0.47) { p.clip = 'land'; p.frame = 1; }
    else e.cheer(p, t, LAND + 0.47);
  },

  // Bats gather into a whirling dark cloud with red eyes in it, then scatter: the hero is standing inside.
  bats(e, t, p) {
    const REVEAL = 1.15;
    if (e.at(0)) { e.sound('entBats'); e.vignette(0x300818, 0.6, 1.7); }
    if (e.at(0.55)) e.sound('entBats', 0.8);
    if (e.at(0.65)) e.glow(e.x, 1.1, 0.4, 1.0, 0xff3050, 0x400818, 0.6, 0.6, { fin: 0.4 });
    if (e.at(REVEAL)) {
      e.sound('entBats', 1.3);
      e.sound('castBig', 0.4);
      e.flash(0xff3050, 0.3);
      e.shock(e.x, 1.1, 2.4, 5, 0.5, 0xff5070);
      e.light({ kind: 'rays', x: e.x, y: 1.1, r0: 1, r1: 2.4, hi: 0xff5070, lo: 0x400818, life: 0.5, power: 0.5, fin: 0 });
      e.fx.burst({ x: e.x, y: 1.1, count: 16, jitter: 0.3, jitterY: 0.6, speed: [1.5, 4], life: [0.3, 0.6], color: 0x3a1a30, color2: 0x0c040c, kind: 'smoke', size: 3, drag: 3 });
    }
    if (t < REVEAL - 0.12) { p.alpha = 0; p.shadow = 0; return; }
    p.alpha = clamp01((t - (REVEAL - 0.12)) / 0.15);
    p.shadow = p.alpha;
    p.tint = '#1a0a20'; p.tintA = Math.max(0, 0.85 - (t - REVEAL) * 2.4);
    if (t < REVEAL + 0.15) { p.clip = 'land'; p.frame = 1; p.face = 'fierce'; }
    else e.cheer(p, t, REVEAL + 0.15);
  },

  // Three sevens roll in, coins pour down on a golden statue of the hero, and it cracks open with a grin.
  jackpot(e, t, p) {
    const BREAK = 1.15, PAY = 0.7;
    for (const k of [0.35, 0.5, 0.65]) if (e.at(k)) e.sound('entReel');
    if (e.at(PAY)) {
      e.sound('entCoins');
      e.sound('gems');
      e.flash(0xffe080, 0.4);
      e.light({ kind: 'rays', x: e.x, y: 1.2, r0: 1.4, r1: 2.8, hi: 0xffe070, lo: 0xa06818, life: 1.0, power: 0.6, fin: 0.1 });
      e.glow(e.x, 1, 0.8, 1.4, 0xffe070, 0xa06818, 0.9, 0.5);
    }
    if (t > PAY && t < 1.35 && e.tick(0.04)) {
      e.fx.burst({ x: e.x, y: 4.2, count: 2, jitter: 1.4, jitterY: 0.4, dir: -UP, spread: 0.2, speed: [0.5, 1.5], life: [0.7, 1.1], color: 0xffe070, color2: 0xc88a20, size: 2, gravity: 9 });
      if ((Math.floor(t * 25) & 3) === 0) e.fx.pulse('coin', e.x + (Math.random() - 0.5) * 1.8, 0, 0.8 + Math.random() * 0.6, 0xffd040, 0.5);
    }
    if (t < 0.15) { p.alpha = 0; p.shadow = 0; return; }
    p.alpha = clamp01((t - 0.15) / 0.12);
    p.shadow = p.alpha;
    if (e.at(0.15)) e.fx.pulse('star', e.x, 1.1, 0.7, 0xffd040, 0.25);
    if (t < BREAK) {
      p.tint = '#ffd040'; p.tintA = 0.88; p.clip = 'victory'; p.frame = 0;
      if (t > PAY && e.tick(0.12)) e.light({ kind: 'star', x: e.x + (Math.random() - 0.5) * 0.7, y: 0.4 + Math.random() * 1.5, r0: 0.15, r1: 0.35, w: 0.025, hi: WHITE, lo: 0xffd040, life: 0.25, power: 0.9, fin: 0 });
      return;
    }
    if (e.at(BREAK)) {
      e.sound('shing');
      e.sound('entCoins', 0.8);
      e.shake(0.3);
      e.shock(e.x, 1, 2, 4, 0.45, 0xffe070);
      e.groundShock(2, 0xffe070, 0xa06818);
      e.fx.burst({ x: e.x, y: 1, count: 28, jitter: 0.4, jitterY: 0.8, dir: UP, spread: 1.4, speed: [2, 5], life: [0.4, 0.9], color: 0xffe070, color2: 0xc88a20, size: 2, gravity: 12 });
      e.fx.burst({ x: e.x, y: 1.2, count: 12, jitter: 0.5, jitterY: 0.7, speed: [0.3, 1], life: [0.3, 0.6], color: WHITE, color2: 0xffd040, kind: 'twinkle' });
    }
    p.tint = '#ffd040'; p.tintA = Math.max(0, 0.6 - (t - BREAK) * 2.5);
    if (t < BREAK + 0.14) { p.clip = 'land'; p.frame = 1; p.face = 'shout'; }
    else e.cheer(p, t, BREAK + 0.14);
  },

  // Three passes in a blur of afterimages, a calm beat back on the spot, then the air splits.
  blade(e, t, p) {
    const f = e.facing, CUT = BLADE_CUT;
    // Each pass: [start, end, from x, to x (in facing metres), height of its streak].
    const PASSES: [number, number, number, number, number][] = [[0, 0.2, -4.5, 3.5, 1.0], [0.3, 0.48, 3.5, -3.5, 1.35], [0.58, 0.8, -3.5, 0, 0.75]];
    for (const [a, b, x0, x1, h] of PASSES) {
      if (e.at(a)) {
        e.sound('whoosh', 1.1);
        const dir = x1 > x0 ? f : -f;
        e.light({ kind: 'beam', x: e.x + f * x0, y: h, r0: Math.abs(x1 - x0) * 0.5, r1: Math.abs(x1 - x0), w: 0.06, rot: dir > 0 ? 0 : Math.PI, hi: WHITE, lo: 0x5aa8ff, life: 0.35, power: 1, fin: 0 });
      }
      if (t >= a && t < b) {
        const k = (t - a) / (b - a), last = x1 === 0;
        const kk = last ? easeOut(k) : k;
        p.dx = f * (x0 + (x1 - x0) * kk);
        p.flip = x1 < x0;
        p.clip = 'run'; p.frame = 1; p.face = 'fierce';
        p.ghosts = 5; p.ghostDx = (x1 > x0 ? f : -f) * 0.45; p.ghostCol = '#9ad8ff';
        p.alpha = 1; p.shadow = 0.5;
        if (e.tick(0.03)) e.fx.burst({ x: e.x + p.dx, y: 0.05, count: 1, jitter: 0.1, dir: UP, spread: 0.6, speed: [0.5, 1.2], life: [0.2, 0.4], color: 0xd8c8a8, color2: 0x7a6a58, kind: 'smoke', size: 2 });
        return;
      }
    }
    if (t < PASSES[2][1]) { p.alpha = 0; p.shadow = 0; return; }
    if (e.at(0.8)) dust(e, e.x, 5, 0.8);
    e.squash(p, t, 0.8, 0.1);
    if (t < CUT) {
      // The calm before: blade lowered, a breath.
      p.clip = 'stop'; p.frame = t < 0.9 ? 0 : 1; p.face = 'calm';
      if (e.at(1.0)) e.sound('block', 0.3);
      return;
    }
    if (e.at(CUT)) {
      e.sound('shing');
      e.sound('swingHeavy', 0.8);
      e.shake(0.5);
      e.flash(0xe8f4ff, 0.4);
      e.blow(e.x, 1.2, WHITE, 0x2a5aa0, 0.8);
      for (let i = 0; i < 3; i++) {
        e.light({ kind: 'arc', x: e.x + f * (0.3 - i * 0.3), y: 1.2 + (i - 1) * 0.35, r0: 1.4 + i * 0.25, r1: 1.55 + i * 0.25, w: 0.07, rot: f > 0 ? 2.6 - i * 0.4 : Math.PI - 2.6 + i * 0.4, sweep: (f > 0 ? -1 : 1) * 2.2, hi: WHITE, lo: 0x5aa8ff, life: 0.4, power: 1.2, fin: 0, delay: i * 0.05 });
      }
      e.fx.burst({ x: e.x, y: 1.1, count: 16, jitter: 1.4, jitterY: 0.4, dir: 0, spread: Math.PI, speed: [1, 3], life: [0.2, 0.45], color: WHITE, color2: 0x9ad8ff, kind: 'streak' });
    }
    e.cheer(p, t, CUT);
  },

  // The ground rumbles and cracks, a rock pillar bursts up carrying the hero, and they leap down as it crumbles.
  quake(e, t, p) {
    const BURST = 0.55, JUMP = 1.3, LAND = 1.62;
    const top = pillarH(1, e.pillarCap) / PPM;
    if (e.at(0)) { e.sound('entRumble'); e.glow(e.x, 0.05, 0.4, 1.2, 0xff9040, 0x5a1a04, BURST + 0.3, 0.5, { fin: 0.9 }); }
    if (t < BURST) {
      if (e.tick(0.07)) {
        e.shake(0.2);
        dust(e, e.x + (Math.random() - 0.5) * 1.6, 1, 0.5);
        e.fx.burst({ x: e.x + (Math.random() - 0.5) * 1.6, y: 0.05, count: 2, dir: UP, spread: 0.4, speed: [1, 2.5], life: [0.3, 0.5], color: 0x8a7458, color2: 0x3a2e28, gravity: 14, size: 1 });
      }
      p.alpha = 0; p.shadow = 0;
      return;
    }
    if (e.at(BURST)) {
      e.sound('entSlam');
      e.sound('explosion', 0.3);
      e.shake(0.9);
      e.punch(0.35);
      e.blow(e.x, 0.4, 0xffd8a0, 0x5a3a20, 0.9, false);
      e.groundShock(2.6, 0xd8c8a8, 0x6a4a30);
      e.fx.pulse('crack', e.x, 0, 1.5, 0x5a4030, 1.4);
      debris(e, e.x, 18);
      dustWall(e, e.x, 8, 5);
    }
    if (t < JUMP) {
      p.dy = pillarH(t, e.pillarCap) / PPM;
      p.clip = t < BURST + 0.2 ? 'land' : 'idle'; p.frame = 0; p.face = 'fierce';
      p.shadow = 0;
      e.squash(p, t, BURST + 0.17, 0.15);
      return;
    }
    if (e.at(JUMP)) { e.sound('whoosh'); debris(e, e.x, 10, 0x7a6a58, 3); }
    if (t < LAND) {
      const k = (t - JUMP) / (LAND - JUMP);
      p.dy = top * (1 - k) + 1.3 * Math.sin(k * Math.PI);
      p.dx = e.facing * 0.25 * Math.sin(k * Math.PI);
      p.clip = 'air'; p.frame = k < 0.5 ? 0 : 1; p.face = 'fierce';
      p.shadow = k;
      p.sy = 1 + 0.08 * Math.sin(k * Math.PI);
      return;
    }
    if (e.at(LAND)) {
      e.sound('entSlam', 0.9);
      e.shake(0.7);
      dust(e, e.x, 10, 1.3);
      dustWall(e, e.x, 6, 4);
      e.groundShock(2, 0xd8c8a8, 0x6a4a30);
      e.fx.pulse('groundRing', e.x, 0, 1.6, 0xd8c8a8, 0.4);
    }
    e.squash(p, t, LAND, 0.2);
    if (t < LAND + 0.2) { p.clip = 'land'; p.frame = t < LAND + 0.1 ? 0 : 1; }
    else e.cheer(p, t, LAND + 0.2);
  },

  // The air cracks, a starry rift tears open, the hero steps out of it, and it implodes behind them.
  rift(e, t, p) {
    const OPEN = 0.3, OUT = 0.75, FREE = 1.25, SHUT = 1.45;
    const rx = riftX(e);
    if (e.at(0)) { e.sound('entPortal'); e.sound('glass', 0.3); e.vignette(0x100828, 0.55, 1.9); }
    if (e.at(OPEN)) {
      e.sound('castBig', 0.6);
      e.light({ kind: 'star', x: rx, y: 1.2, r0: 0.6, r1: 1.6, w: 0.05, hi: WHITE, lo: 0x9a70ff, life: 0.35, power: 1.2, fin: 0 });
      e.glow(rx, 1.2, 0.8, 1.4, 0xb090ff, 0x2a1060, SHUT - OPEN + 0.2, 0.8, { fin: 0.2 });
      e.light({ kind: 'rays', x: rx, y: 1.2, r0: 1.2, r1: 2.2, hi: 0x9a70ff, lo: 0x40e0d0, life: SHUT - OPEN + 0.2, power: 0.4, fin: 0.3 });
      e.shock(rx, 1.2, 1.8, 4, 0.4, 0xb090ff);
    }
    if (t > OPEN && t < 1.4 && e.tick(0.05)) e.fx.gather(rx, 1.2, 1.6, 2, 0xd8c8ff, 0x6a40d0, 'twinkle');
    if (e.at(SHUT)) {
      e.sound('castBig');
      e.sound('entSlam', 0.4);
      e.flash(0xb090ff, 0.5);
      e.fx.pulse('implode', rx, 1.2, 1.6, 0xb090ff, 0.3, 0x40e0d0);
      e.fx.pulse('swirl', rx, 1.2, 1.4, 0xb090ff, 0.35, 0x40e0d0);
      e.blow(rx, 1.2, 0xd8c8ff, 0x3a1a90, 0.9);
      e.light({ kind: 'star', x: rx, y: 1.2, r0: 0.5, r1: 1.3, w: 0.04, hi: WHITE, lo: 0x40e0d0, life: 0.4, power: 1.2, fin: 0 });
    }
    if (t < OUT) { p.alpha = 0; p.shadow = 0; return; }
    if (t < FREE) {
      const k = (t - OUT) / (FREE - OUT);
      p.dx = rx - e.x + (e.x - rx) * easeOut(k);
      p.clip = 'run'; p.frame = Math.floor(t * 7); p.face = 'calm';
      p.alpha = clamp01(k * 2.5);
      p.shadow = p.alpha;
      p.tint = '#9a70ff'; p.tintA = 0.75 * (1 - k);
      if (k < 0.5) { p.ghosts = 2; p.ghostDx = e.facing * 0.2; p.ghostCol = '#9a70ff'; }
      return;
    }
    if (t < SHUT + 0.05) { p.clip = 'stop'; p.frame = t < FREE + 0.1 ? 0 : 1; return; }
    e.cheer(p, t, SHUT + 0.05);
  },

  // Night falls, stars draw the hero as a constellation, and it flares into flesh.
  starborn(e, t, p) {
    const FLARE = STARBORN_FLARE;
    if (e.at(0.05)) { e.sound('entStars'); e.vignette(0x05030f, 0.75, FLARE + 0.9); }
    for (let i = 0; i < STAR_COUNT; i++) {
      if (!e.at(0.3 + i * 0.03)) continue;
      const [sx, sy] = starAt(e, i);
      e.light({ kind: 'star', x: sx, y: sy, r0: 0.1, r1: 0.22, w: 0.02, hi: WHITE, lo: 0x8ab0ff, life: FLARE - 0.3 - i * 0.03, power: 0.75, fin: 0.1 });
    }
    if (e.at(1.15)) { e.sound('charge', 0.6); e.glow(e.x, 1.1, 0.5, 1.3, 0xc8e0ff, 0x3a4a90, FLARE - 1.15 + 0.1, 0.8, { fin: 0.9 }); }
    if (t < FLARE) { p.alpha = 0; p.shadow = 0; return; }
    if (e.at(FLARE)) {
      e.sound('tierUp', 3);
      e.sound('castBig', 0.6);
      e.flash(0xe8f0ff, 0.9);
      e.punch(0.4);
      e.blow(e.x, 1.1, 0xe8f0ff, 0x3a4a90, 1.1);
      e.light({ kind: 'rays', x: e.x, y: 1.1, r0: 1.4, r1: 3.4, hi: 0xe8f0ff, lo: 0x5a6ac8, life: 0.8, power: 0.6, fin: 0 });
      e.fx.pulse('ring', e.x, 1, 1.6, 0xc8e0ff, 0.4);
      e.fx.burst({ x: e.x, y: 1, count: 28, jitter: 0.4, jitterY: 0.8, speed: [1.5, 4], life: [0.4, 0.9], color: WHITE, color2: 0x8ab0ff, kind: 'twinkle' });
    }
    p.tint = '#e8f0ff'; p.tintA = Math.max(0, 1 - (t - FLARE) * 2.5);
    if (t < FLARE + 0.18) { p.clip = 'land'; p.frame = 1; p.face = 'calm'; }
    else e.cheer(p, t, FLARE + 0.18);
  },

  // A firebird dives into the sand, burning wings spread and beat once, and the hero is reborn in the blaze.
  phoenix(e, t, p) {
    const DIVE = PHX_DIVE, BEAT = PHX_BEAT;
    if (e.at(0)) {
      e.sound('entPhoenix');
      e.glow(0, 0, 0.4, 0.6, 0xffd060, 0xd83a1a, DIVE, 1, { follow: () => { if (e.time >= DIVE) return null; const k = easeIn(e.time / DIVE); return [e.x - e.facing * 5 * (1 - k), 7 * (1 - k) + 1.2]; } });
    }
    if (t < DIVE) {
      if (e.tick(0.04)) e.fx.burst({ x: e.x, y: 0.05, count: 2, jitter: 0.5, jitterY: 0, dir: UP, spread: 0.3, speed: [0.4, 1.2], life: [0.3, 0.6], color: 0xffd060, color2: 0xd83a1a, kind: 'ember' });
      p.alpha = 0; p.shadow = 0;
      return;
    }
    if (e.at(DIVE)) {
      e.sound('entIgnite');
      e.flash(0xff8030, 0.5);
      e.shake(0.5);
      e.shock(e.x, 0.6, 2, 4, 0.45, 0xffb040);
      e.groundShock(2.2, 0xff8030, 0x8a1a08);
      e.vignette(0x401000, 0.5, BEAT - DIVE + 0.8);
      e.glow(e.x, 1.2, 0.8, 1.5, 0xffd060, 0xd83a1a, BEAT - DIVE + 0.1, 0.7, { fin: 0.3 });
      e.fx.burst({ x: e.x, y: 0.5, count: 18, jitter: 0.3, dir: UP, spread: 1.2, speed: [2, 4.5], life: [0.3, 0.7], color: 0xffe080, color2: 0xc83a1a, kind: 'flame' });
    }
    if (t < BEAT && e.tick(0.03)) e.fx.burst({ x: e.x, y: 1.2, count: 2, jitter: 1.3, jitterY: 0.6, dir: UP, spread: 0.4, speed: [0.5, 1.5], life: [0.3, 0.6], color: 0xffe080, color2: 0xd83a1a, kind: 'flame' });
    if (e.at(BEAT)) {
      e.sound('entPhoenix', 1.3);
      e.sound('explosion', 0.5);
      e.shake(0.7);
      e.punch(0.4);
      e.blow(e.x, 1.2, 0xffe080, 0xa02810, 1.2);
      e.light({ kind: 'rays', x: e.x, y: 1.3, r0: 1.4, r1: 3.6, hi: 0xffd060, lo: 0xc83a1a, life: 0.8, power: 0.6, fin: 0 });
      e.groundShock(3, 0xffb040, 0x8a1a08, 0.6);
      e.fx.burst({ x: e.x, y: 1.3, count: 34, jitter: 0.4, jitterY: 0.5, speed: [2, 5.5], life: [0.4, 0.9], color: 0xffe080, color2: 0xc83a1a, kind: 'flame' });
      e.fx.burst({ x: e.x, y: 2.4, count: 12, jitter: 1.4, jitterY: 0.4, dir: -UP, spread: 0.5, speed: [0.2, 0.6], life: [0.8, 1.3], color: 0xffd060, color2: 0xc83a1a, kind: 'ember' });
    }
    p.alpha = clamp01((t - DIVE - 0.05) / 0.2);
    p.shadow = p.alpha;
    p.tint = '#ff8030'; p.tintA = t < BEAT ? 0.7 : Math.max(0, 0.6 - (t - BEAT) * 2);
    if (t < BEAT) { p.clip = 'victory'; p.frame = 0; p.face = 'calm'; p.dy = 0.18 + 0.12 * Math.sin((t - DIVE) * 6); p.shadow = 0.6; return; }
    e.squash(p, t, BEAT, 0.14);
    if (t < BEAT + 0.16) { p.clip = 'land'; p.frame = 1; p.face = 'shout'; }
    else e.cheer(p, t, BEAT + 0.16);
  },
};
