import { getStatus, type Fighter } from '../../sim/fighter';
import type { AbilityDef } from '../../sim/types';
import type { Expression } from './draw';
import { clipsFor, type ClipSet } from './anims';
import type { CharacterArt } from './look';

/** World metres to art pixels. */
export const PPM = 32;

/** Which sprite to show this frame, plus small render-only offsets. */
export interface AnimOut {
  clip: string;
  frame: number;
  face: Expression | null;
  secOut: boolean;
  /** No usable items left: the belt is empty. */
  useOut: boolean;
  /** Heavy-windup tremble (px). */
  jitter: number;
  /** Visual hop for ground evades (px, up). */
  hop: number;
  /** Cache key for the drawn sprite. */
  key: string;
}

/**
 * Turns a fighter's sim state into a clip and frame. Locomotion advances with
 * distance travelled (feet never skate); actions follow the sim's phase
 * timers exactly, so what you see is what the sim is doing.
 */
export class Animator {
  readonly set: ClipSet;
  private lastX: number | null = null;
  private dist = 0;
  private time = 0;
  private koT = 0;
  private winT = 0;
  private swing = 0;
  private lastAction: object | null = null;
  private alt = false;
  private blinkAt = 1 + Math.random() * 2;
  private moving = 0;
  /** Each fighter breathes on its own rhythm. */
  private breath = Math.random();
  /** What the legs were last doing, for the stop and landing transitions. */
  private gait: 'still' | 'run' | 'back' | 'air' = 'still';
  private ranFor = 0;
  private settle: { clip: string; t: number; len: number } | null = null;
  private out: AnimOut = { clip: 'idle', frame: 0, face: null, secOut: false, useOut: false, jitter: 0, hop: 0, key: '' };

  constructor(readonly art: CharacterArt) {
    this.set = clipsFor(art);
  }

  /** `x` is the interpolated world position, `dt` real seconds since the last call. */
  update(f: Fighter, x: number, dt: number, over: boolean, winner: boolean, secOut: boolean, useOut = false): AnimOut {
    this.time += dt;
    const dx = this.lastX === null ? 0 : x - this.lastX;
    this.lastX = x;
    if (getStatus(f, 'frozen') && f.alive) return this.out; // frozen solid: hold the frame
    const o = this.out;
    o.face = null; o.jitter = 0; o.hop = 0; o.secOut = secOut; o.useOut = useOut;

    if (!f.alive) {
      this.koT += dt;
      const k = this.koT;
      // Topple, hit the floor, bounce once and lie still.
      this.set1('ko', k < 0.09 ? 0 : k < 0.18 ? 1 : k < 0.26 ? 2 : k < 0.32 ? 3 : k < 0.4 ? 4 : 3);
    } else if (over && winner && (this.winT += dt) > 0.6) {
      this.set1('victory', Math.floor(this.winT * 4) % 2);
    } else if (f.action) {
      this.action(f);
    } else if (getStatus(f, 'stun')) {
      this.set1('stun', Math.floor(this.time * 6) % 4);
    } else if (f.stagger > 0) {
      this.set1('hurt', f.sinceHurt < 0.12 ? 0 : 1);
    } else if (f.y > 0.12) {
      this.set1('air', f.vy > 0 ? 0 : 1);
      this.gait = 'air';
    } else {
      this.locomotion(f, dx, dt);
    }
    if (o.clip !== 'air' && o.clip !== 'idle' && o.clip !== 'run' && o.clip !== 'back' && !this.settle) this.gait = 'still';
    // Knock-back: the sprite gives a couple of pixels on a real hit.
    if (f.alive && f.stagger > 0 && f.sinceHurt < 0.1) o.jitter -= f.facing * (f.sinceHurt < 0.05 ? 2 : 1);
    if (f.alive && f.action && f.sinceHurt < 0.16) o.face = 'hurt';
    o.key = `${o.clip}.${o.frame}.${o.face ?? ''}${o.secOut ? '.o' : ''}${o.useOut ? '.u' : ''}`;
    return o;
  }

  private set1(clip: string, frame: number): void {
    this.out.clip = clip;
    this.out.frame = frame;
  }

  private locomotion(f: Fighter, dx: number, dt: number): void {
    const speed = dt > 0 ? Math.abs(dx) / dt : 0;
    // A little hysteresis so a fighter easing to a stop doesn't flicker between idle and run.
    this.moving = speed > (this.moving ? 0.35 : 0.8) ? 1 : 0;
    if (this.gait === 'air') this.startSettle('land', 0.16);
    if (this.moving) {
      this.settle = null;
      this.dist += Math.abs(dx) * PPM;
      const fwd = Math.sign(dx) === f.facing;
      const gait = fwd ? 'run' : 'back';
      this.ranFor = this.gait === gait ? this.ranFor + dt : 0;
      this.gait = gait;
      const cycle = fwd ? this.set.runCycle : this.set.backCycle;
      const n = this.set.clips.get(gait)!.w.length;
      const i = Math.floor((this.dist / cycle) * n) % n;
      this.set1(gait, fwd ? i : n - 1 - i);
      return;
    }
    // Coming out of a run, the body catches its weight for a moment.
    if ((this.gait === 'run' || this.gait === 'back') && this.ranFor > 0.15) this.startSettle(this.gait === 'run' ? 'stop' : 'stopB', 0.2);
    this.gait = 'still';
    const st = this.settle;
    if (st) {
      st.t += dt;
      if (st.t < st.len) { this.set1(st.clip, st.t < st.len * 0.5 ? 0 : 1); return; }
      this.settle = null;
    }
    const n = this.set.clips.get('idle')!.w.length;
    this.set1('idle', Math.floor((this.time * 0.62 + this.breath) * n) % n);
    // Blink now and then.
    if (this.time > this.blinkAt) {
      this.out.face = 'blink';
      if (this.time > this.blinkAt + 0.12) this.blinkAt = this.time + 1.6 + ((this.time * 7.31) % 1) * 3;
    }
  }

  private startSettle(clip: string, len: number): void {
    this.settle = { clip, t: 0, len };
    this.gait = 'still';
  }

  private action(f: Fighter): void {
    this.settle = null;
    const a = f.action!;
    const ab = f.abilities[a.ability];
    if (a !== this.lastAction) {
      this.lastAction = a;
      if (ab.slot === 'basic') this.alt = this.swing++ % 2 === 1;
    }
    const id = this.clipId(ab, a.isCounter);
    const c = this.set.clips.get(id) ?? this.set.clips.get('idle')!;
    const D = c.draw.length, W = c.w.length, A = c.a.length, R = c.r.length, S = c.stow.length;
    const at = (n: number, k: number) => Math.min(n - 1, Math.max(0, Math.floor(k * n)));
    // Timing: the coil at the end of a windup is held (anticipation), and the
    // recovery leaves the follow-through quickly then eases into the stance.
    const coil = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 1.6);
    const ease = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 1.4);
    let i: number;
    if (a.feint) {
      // Cancelled windup: unwind the anticipation frames backwards.
      i = W ? D + (W - 1 - at(W, a.t / Math.max(1e-3, a.recovery))) : 0;
    } else if (a.phase === 'windup') {
      if (D && a.t < a.draw) i = at(D, a.t / a.draw);
      else {
        const k = (a.t - a.draw) / Math.max(1e-3, a.windup - a.draw);
        i = W ? D + at(W, coil(k)) : Math.max(0, D - 1);
        if (ab.heavy && k > 0.6) this.out.jitter = (Math.floor(this.time * 30) % 2) * 2 - 1;
      }
    } else if (a.phase === 'active') {
      const k = a.t / Math.max(1e-3, a.active);
      if (!A) i = D + Math.max(0, W - 1);
      else if (c.cycle === -1) i = D + W + (Math.floor(a.t * 8) % A);
      else if (c.cycle) i = D + W + (Math.floor(k * Math.max(1, ab.hits ?? 1) * c.cycle) % A);
      else i = D + W + at(A, k);
      if (ab.slot === 'evade' && !ab.airborne) this.out.hop = Math.round(Math.sin(Math.min(1, k) * Math.PI) * 5);
    } else {
      const rec = a.recovery - a.stow;
      if (S && a.t >= rec) i = D + W + A + R + at(S, (a.t - rec) / Math.max(1e-3, a.stow));
      else i = R ? D + W + A + at(R, ease(a.t / Math.max(1e-3, rec))) : D + W + Math.max(0, A - 1);
    }
    this.set1(id, i);
  }

  private clipId(ab: AbilityDef, isCounter: boolean): string {
    const has = (k: string) => this.set.clips.has(k);
    if (ab.slot === 'evade') {
      if (ab.kind === 'blink') return 'blink';
      if (ab.anim === 'stomp') return 'stomp';
      return ab.dash?.through ? 'roll' : ab.airborne ? 'leap' : 'evade';
    }
    if (ab.from === 'secondary') return isCounter && has('sec.riposte') ? 'sec.riposte' : 'sec.' + ab.anim;
    if (ab.from === 'chest') return ab.anim;
    if (ab.from === 'usable') return 'use.' + ab.anim;
    if (this.alt && ab.slot === 'basic' && has(ab.anim + '2')) return ab.anim + '2';
    if (has(ab.anim)) return ab.anim;
    return [...this.set.clips.keys()].find((k) => k === 'slash' || k === 'thrust' || k === 'cast' || k === 'shoot') ?? 'idle';
  }
}

