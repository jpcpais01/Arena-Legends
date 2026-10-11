import type { FinisherId, PoseId } from '../character/finales';
import type { EntranceHost, EntrancePose } from './entrance';
import { Finisher } from './finisher';
import type { View } from './fx';
import { clipLength } from './sprite/anims';
import type { AnimOut } from './sprite/animator';
import type { Sprite, SpriteBank } from './sprite/bank';
import { ensureFinClips, ensurePose, poseFrame, poseIntro } from './sprite/winPoses';
import { PoseFx } from './victory';

/**
 * A finisher or a victory pose acted out on a menu preview (hero creator,
 * shop): the hero strikes a shadow double of themselves, the finisher plays
 * on it, then the pose. Works like an entrance for the preview: each frame
 * it says how to draw the hero, and draws the rest itself around them.
 */

const blank = (): EntrancePose => ({
  clip: 'idle', frame: 0, face: null, dx: 0, dy: 0, alpha: 1, tint: null, tintA: 0, shadow: 1, clipGround: false, flip: false,
  ghosts: 0, ghostDx: 0, ghostCol: null, sx: 1, sy: 1,
});

/** The shadow double: a dusky body with a pale rim, so it reads on a dark stage too. */
const SHADE = '#3a2c58';
const RIM = '#b8a8e8';
/** Frames per second the strike plays at. */
const FPS = 14;
/** How long the pose shows once it has settled in (seconds). */
const HOLD = 2.4;

interface Dummy { x: number; y: number; vx: number; vy: number; koT: number; alpha: number }

export interface FinaleShowOptions {
  finisher?: FinisherId;
  pose: PoseId;
  /** The hero's weapon colours, for finishers that take them. */
  hi?: number;
  lo?: number;
  /** World height of the canvas top. */
  top?: number;
  /** Half the canvas width (world metres): how far the double can be thrown. */
  room?: number;
}

export class FinaleShow {
  private t = 0;
  private fin: Finisher | null = null;
  private readonly poseFx: PoseFx;
  private readonly poseClip: string;
  private poseT = -1;
  private poseLen: number;
  /** The hero's swing at the double: clip, frame it connects on, length; and seconds into it. */
  private strike: { clip: string; hit: number; n: number } | null = null;
  private strikeT = -1;
  private dummy: Dummy | null = null;
  private readonly heroX: number;
  readonly hero = blank();
  private readonly out: AnimOut = { clip: 'ko', frame: 0, face: 'ko', secOut: false, useOut: false, jitter: 0, hop: 0, key: '' };

  constructor(private bank: SpriteBank, private host: EntranceHost, private facing: number, private opts: FinaleShowOptions) {
    const set = bank.set;
    ensureFinClips(set, bank.art);
    this.poseClip = ensurePose(set, bank.art, opts.pose);
    this.poseLen = poseIntro(set.clips.get(this.poseClip)!) + HOLD;
    this.poseFx = new PoseFx(opts.pose, host, 0.6);
    if (opts.finisher) {
      const room = opts.room ?? 1.5;
      this.heroX = -Math.min(0.5, room * 0.45) * facing;
      this.dummy = { x: this.heroX + Math.min(0.95, room * 0.85) * facing, y: 0, vx: 0, vy: 0, koT: -1, alpha: 0 };
      const clip = [...set.clips.keys()].find((k) => !SKIP.test(k)) ?? 'idle';
      const c = set.clips.get(clip)!;
      this.strike = { clip, hit: c.draw.length + c.w.length, n: clipLength(c) };
    } else {
      this.heroX = 0;
      this.poseT = 0;
    }
  }

  /** Advances; false once it is over. */
  update(dt: number): boolean {
    this.t += dt;
    const h = this.hero;
    Object.assign(h, blank());
    h.dx = this.heroX;
    const fin = this.fin;
    if (fin && !fin.update(dt)) {
      this.fin = null;
      this.poseT = 0;
    }
    const pace = this.fin ? this.fin.pace : 1;
    const d = this.dummy;
    if (d) this.moveDummy(d, dt * pace);
    // The swing: a beat to square up, then the blow; it connects and the finisher takes over.
    if (this.strike && this.poseT < 0) {
      const s = this.strike;
      if (this.t > 0.3) this.strikeT = this.strikeT < 0 ? 0 : this.strikeT + dt * pace;
      const i = this.strikeT < 0 ? -1 : Math.floor(this.strikeT * FPS);
      if (i >= s.hit && !this.fin && d && d.koT < 0) this.knockOut(d);
      if (i >= 0 && i < s.n) { h.clip = s.clip; h.frame = i; }
      else { h.clip = 'idle'; h.frame = Math.floor(this.t * 3) % 4; }
      const w = this.fin?.frame.win;
      if (w) {
        if (w.clip) { h.clip = w.clip; h.frame = w.frame; h.face = w.face; }
        h.tint = w.tint; h.tintA = w.tintA; h.flip = w.flip;
      }
      return true;
    }
    if (this.poseT < 0) return true;
    this.poseT += dt;
    const c = this.bank.set.clips.get(this.poseClip)!;
    h.clip = this.poseClip;
    h.frame = poseFrame(c, this.poseT);
    this.poseFx.update(this.poseT, h.frame, { x: this.heroX, y: 0, facing: this.facing, tip: this.host.tip() });
    if (d) d.alpha = Math.max(0, d.alpha - dt * 1.6);
    return this.poseT < this.poseLen;
  }

  private knockOut(d: Dummy): void {
    // Thrown about as far as the canvas has room for (it is in the air ~0.47 s).
    const room = this.opts.room ?? 1.5;
    d.vx = Math.max(0.3, Math.min(1.4, (room - 0.4 - Math.abs(d.x)) / 0.47)) * this.facing;
    d.vy = 5.2;
    d.koT = 0;
    this.fin = new Finisher(this.opts.finisher!, this.host, () => [this.heroX, 0], () => [d.x, d.y], { stage: false, hi: this.opts.hi, lo: this.opts.lo, top: () => this.opts.top ?? 2.6 });
  }

  private moveDummy(d: Dummy, dt: number): void {
    if (d.koT < 0) { d.alpha = Math.min(1, d.alpha + dt * 5); return; }
    d.koT += dt;
    d.vy -= 22 * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (d.y <= 0) { d.y = 0; d.vy = 0; d.vx *= Math.max(0, 1 - dt * 8); }
  }

  draw(g: CanvasRenderingContext2D, v: View, layer: 'under' | 'over'): void {
    if (layer === 'under') {
      if (this.poseT >= 0) this.poseFx.drawUnder(g, v, { x: this.heroX, y: 0, facing: this.facing, tip: null });
      this.drawDummy(g, v);
    }
    this.fin?.draw(g, v, layer);
  }

  /** The shadow double: the hero's own shape in ink, facing them, with whatever wash the finisher gives it. */
  private drawDummy(g: CanvasRenderingContext2D, v: View): void {
    const d = this.dummy;
    if (!d || d.alpha <= 0) return;
    const o = this.out, k = d.koT;
    if (k < 0) { o.clip = 'idle'; o.frame = 0; o.face = 'fierce'; }
    else { o.clip = 'ko'; o.frame = k < 0.09 ? 0 : k < 0.18 ? 1 : k < 0.26 ? 2 : k < 0.32 ? 3 : k < 0.4 ? 4 : 3; o.face = 'ko'; }
    o.key = `${o.clip}.${o.frame}.${o.face}`;
    const x = Math.round(v.sx(d.x)), y = Math.round(v.sy(d.y)), gy = Math.round(v.sy(0));
    const flip = this.facing > 0;
    g.globalAlpha = 0.3 * d.alpha * Math.max(0.3, 1 - d.y / 2);
    g.fillStyle = '#000';
    g.fillRect(x - 9, gy - 1, 18, 3);
    const s = this.bank.get(o);
    g.globalAlpha = 0.55 * d.alpha;
    const rim = this.bank.flash(o, RIM);
    for (const [ox, oy] of RIM_AT) blit(g, rim, s, x + ox, y + oy, flip);
    g.globalAlpha = 0.92 * d.alpha;
    blit(g, this.bank.flash(o, SHADE), s, x, y, flip);
    const w = this.fin?.frame.fall;
    if (w?.tint && w.tintA > 0) {
      g.globalAlpha = d.alpha * Math.min(1, w.tintA);
      blit(g, this.bank.flash(o, w.tint), s, x, y, flip);
    }
    g.globalAlpha = 1;
  }
}

const RIM_AT: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Clips that are not a plain swing. */
const SKIP = /^(idle|run|back|stop|stopB|land|hurt|stun|air|ko|victory|roll|leap|evade|blink)$|^(sec|use|pose|fin)\./;

function blit(g: CanvasRenderingContext2D, img: Sprite, s: Sprite, x: number, y: number, flip: boolean): void {
  if (flip) {
    g.save(); g.translate(x + 1, 0); g.scale(-1, 1);
    g.drawImage(img.img, -s.ox, y - s.oy);
    g.restore();
  } else g.drawImage(img.img, x - s.ox, y - s.oy);
}
