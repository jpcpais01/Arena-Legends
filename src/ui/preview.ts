import type { CharacterBuild } from '../sim/loadout';
import { clipLength, clipsFor } from '../render/sprite/anims';
import type { AnimOut } from '../render/sprite/animator';
import { SpriteBank, type Sprite } from '../render/sprite/bank';
import { makeArt } from '../render/sprite/look';
import { css } from '../render/pixel/color';
import { drawSetAura, SET_FX } from '../render/setAura';
import type { SkinFx } from '../render/sprite/skins';
import { fitPixels } from './pixelfit';
import { sfx } from '../audio/sfx';
import type { EntranceId } from '../character/entrances';
import { Entrance, type EntrancePose } from '../render/entrance';
import { Fx } from '../render/fx';
import { PPM } from '../render/sprite/animator';

export interface PreviewOptions {
  flip?: boolean;
  /** Plays a random move every few seconds. */
  autoplay?: boolean;
  /** Draws one idle frame and stops (portraits on cards). */
  still?: boolean;
  /** Feet height above the canvas bottom, in art pixels; negative crops to a bust. */
  ground?: number;
  /** A small stone pedestal under the feet. */
  pedestal?: boolean;
  /** Box the canvas is fitted into at a whole device-pixel scale. */
  fit?: HTMLElement;
}

// Still portraits are rasterized a couple per frame so opening a screen full of them doesn't hitch.
const stills: Preview[] = [];
let stillRaf = 0;
function queueStill(p: Preview): void {
  stills.push(p);
  if (stillRaf) return;
  const run = () => {
    const t0 = performance.now();
    while (stills.length && performance.now() - t0 < 8) stills.shift()!.drawStill();
    stillRaf = stills.length ? requestAnimationFrame(run) : 0;
  };
  stillRaf = requestAnimationFrame(run);
}

const SHOWCASE_SKIP = new Set(['idle', 'run', 'back', 'stop', 'stopB', 'land', 'hurt', 'stun', 'air', 'ko', 'roll', 'leap', 'evade', 'blink', 'sec.riposte']);

/**
 * A character standing in a small pixel canvas (creator, menu, gear picker).
 * Idles, and plays one of its moves when tapped or when `showcase` is called.
 */
export class Preview {
  readonly el: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private bank!: SpriteBank;
  private clips: string[] = [];
  private playing: string | null = null;
  private t = 0;
  private last = 0;
  private raf = 0;
  private alive = true;
  private next = 0;
  private flip = false;
  private out: AnimOut = { clip: 'idle', frame: 0, face: null, secOut: false, useOut: false, jitter: 0, hop: 0, key: '' };
  /** Legendary skin sparkles: position (canvas px), age and colours. */
  private sparks: { x: number; y: number; t: number; a: number; b: number; flame: boolean }[] = [];
  private sparkT = 0;
  /** Seconds since the preview started (set auras). */
  private clock = 0;
  /** An entrance being shown, its effects, and the screen flash and shake it asks for. */
  private ent: Entrance | null = null;
  private fx: Fx | null = null;
  private flashT = 0;
  private flashCol = 0xffffff;
  private shakeT = 0;
  private shakeA = 0;
  private shakeX = 0;
  private readonly view = { sx: (x: number) => Math.round(this.w / 2) + x * PPM + this.shakeX, sy: (y: number) => this.h - this.ground - y * PPM };

  private still: boolean;
  private ground: number;
  private pedestal: boolean;
  private unfit: (() => void) | null = null;

  /** `w`, `h` in art pixels; the CSS size comes from the stylesheet or the `fit` box. */
  constructor(build: CharacterBuild, readonly w = 100, readonly h = 90, opts: PreviewOptions = {}) {
    this.el = document.createElement('canvas');
    this.el.className = 'preview';
    this.el.width = w; this.el.height = h;
    this.g = this.el.getContext('2d')!;
    this.flip = !!opts.flip;
    this.still = !!opts.still;
    this.ground = opts.ground ?? (opts.pedestal ? 12 : 8);
    this.pedestal = !!opts.pedestal;
    if (opts.fit) this.unfit = fitPixels(this.el, opts.fit);
    this.set(build);
    if (this.still) return;
    this.el.addEventListener('click', () => this.showcase());
    if (opts.autoplay) this.next = 2.5;
    const loop = (now: number) => {
      if (!this.alive) return;
      const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
      this.last = now;
      if (this.el.isConnected) this.tick(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  set(build: CharacterBuild): void {
    const art = makeArt(build);
    const set = clipsFor(art);
    this.bank = new SpriteBank(art, set);
    this.clips = [...set.clips.keys()].filter((k) => !SHOWCASE_SKIP.has(k));
    this.playing = null;
    this.t = 0;
    this.sparks.length = 0;
    if (this.still) queueStill(this);
  }

  /** Fits the canvas into `box` at a whole device-pixel scale (see `fitPixels`). */
  fitTo(box: HTMLElement): void {
    this.unfit?.();
    this.unfit = fitPixels(this.el, box);
  }

  /** Still portraits: the first idle frame. */
  drawStill(): void {
    if (!this.alive) return;
    this.out.clip = 'idle';
    this.out.frame = 0;
    this.out.key = 'idle.0.';
    this.draw(this.bank.get(this.out));
  }

  /** Plays a pre-fight entrance on the spot (creator and shop previews), with its sounds. */
  playEntrance(id: EntranceId): void {
    if (this.still) return;
    this.fx ??= new Fx();
    this.fx.clear();
    this.playing = null;
    this.ent = new Entrance(id, {
      fx: this.fx,
      shake: (a) => { this.shakeA = Math.max(this.shakeA, a); this.shakeT = 0.25 + a * 0.3; },
      flash: (c, a) => { this.flashCol = c; this.flashT = Math.max(this.flashT, a * 0.12); },
      sound: (name, k) => sfx.play(name, 0, k),
    }, 0, this.flip ? -1 : 1, 0.15);
    // Hold off the next random move until it's over.
    this.t = 0;
    if (this.next > 0) this.next = 4.5;
  }

  /** Plays a move (a given clip, or a random one). */
  showcase(clip?: string): void {
    this.playing = clip ?? this.clips[Math.floor(Math.random() * this.clips.length)] ?? null;
    this.t = 0;
  }

  dispose(): void {
    this.alive = false;
    this.ent = null;
    cancelAnimationFrame(this.raf);
    this.unfit?.();
  }

  private tick(dt: number): void {
    this.t += dt;
    this.clock += dt;
    const o = this.out;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      this.shakeX = this.shakeT > 0 ? Math.round((Math.random() - 0.5) * this.shakeA * 6 * Math.min(1, this.shakeT * 3)) : 0;
    }
    const pose = this.ent ? this.ent.update(dt) : null;
    if (this.ent && !pose) this.ent = null;
    this.fx?.update(dt);
    if (pose) {
      const c = this.bank.set.clips.get(pose.clip) ? pose.clip : 'idle';
      o.clip = c;
      o.frame = pose.frame % clipLength(this.bank.set.clips.get(c)!);
      o.face = pose.face;
      o.key = `${o.clip}.${o.frame}.${o.face ?? ''}`;
      this.drawEntrance(dt, pose);
      return;
    }
    o.face = null;
    if (this.playing) {
      const c = this.bank.set.clips.get(this.playing)!;
      const n = clipLength(c);
      const i = Math.floor(this.t * 14);
      if (i >= n + 3) { this.playing = null; this.t = 0; }
      o.clip = this.playing ?? 'idle';
      o.frame = this.playing ? Math.min(n - 1, i) : 0;
    } else {
      o.clip = 'idle';
      const n = this.bank.set.clips.get('idle')!.w.length;
      o.frame = Math.floor(this.t * 0.62 * n) % n;
      if (this.next > 0 && this.t > this.next) { this.showcase(); this.next = 3 + Math.random() * 3; }
    }
    o.key = `${o.clip}.${o.frame}.`;
    const s = this.bank.get(o);
    const [gx, gy] = this.draw(s);
    if (this.fx) this.fx.draw(this.g, this.view);
    this.drawSparks(dt, s, gx, gy);
  }

  /** One frame of an entrance: the effects around the fighter, who may be faded, washed or half in the ground. */
  private drawEntrance(dt: number, pose: EntrancePose): void {
    const g = this.g, v = this.view, ent = this.ent!, fx = this.fx!;
    g.clearRect(0, 0, this.w, this.h);
    const gx = Math.round(this.w / 2) + this.shakeX, gy = this.h - this.ground;
    if (this.pedestal) drawPedestal(g, gx, gy);
    fx.drawUnder(g, v);
    ent.draw(g, v, 'under');
    const x = Math.round(v.sx(pose.dx)), y = Math.round(v.sy(pose.dy));
    if (pose.shadow > 0.05) {
      g.fillStyle = `rgba(0,0,0,${(0.3 * pose.shadow).toFixed(2)})`;
      const r = Math.round(11 * (0.4 + 0.6 * pose.shadow));
      g.fillRect(Math.round(v.sx(pose.dx)) - r, gy - 1, r * 2, 3);
    }
    if (pose.alpha > 0) {
      const s = this.bank.get(this.out);
      const set = this.bank.art.set;
      if (pose.clipGround) { g.save(); g.beginPath(); g.rect(0, 0, this.w, gy + 1); g.clip(); }
      if (set && pose.alpha >= 1) drawSetAura(g, set, x, y, this.clock, 'back');
      g.globalAlpha = pose.alpha;
      this.blit(s.img, s, x, y);
      if (pose.tint && pose.tintA > 0) {
        g.globalAlpha = pose.alpha * Math.min(1, pose.tintA);
        this.blit(this.bank.flash(this.out, pose.tint).img, s, x, y);
      }
      g.globalAlpha = 1;
      if (set && pose.alpha >= 1) drawSetAura(g, set, x, y, this.clock, 'front');
      if (pose.clipGround) g.restore();
    }
    ent.draw(g, v, 'over');
    fx.draw(g, v);
    if (this.flashT > 0) {
      g.globalAlpha = Math.min(0.5, this.flashT * 4);
      g.fillStyle = css(this.flashCol);
      g.fillRect(0, 0, this.w, this.h);
      g.globalAlpha = 1;
      this.flashT -= dt;
    }
  }

  private blit(img: CanvasImageSource, s: Sprite, x: number, y: number): void {
    const g = this.g;
    if (this.flip) {
      g.save(); g.translate(x + 1, 0); g.scale(-1, 1);
      g.drawImage(img, -s.ox, y - s.oy);
      g.restore();
    } else g.drawImage(img, x - s.ox, y - s.oy);
  }

  private draw(s: Sprite): [number, number] {
    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    const gx = Math.round(this.w / 2), gy = this.h - this.ground;
    if (this.pedestal) drawPedestal(g, gx, gy);
    // Ground shadow.
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(gx - 11, gy - 1, 22, 3);
    const set = this.bank.art.set;
    if (set) drawSetAura(g, set, gx, gy, this.clock, 'back');
    if (this.flip) {
      g.save(); g.translate(gx + 1, 0); g.scale(-1, 1);
      g.drawImage(s.img, -s.ox, gy - s.oy);
      g.restore();
    } else g.drawImage(s.img, gx - s.ox, gy - s.oy);
    if (set) drawSetAura(g, set, gx, gy, this.clock, 'front');
    return [gx, gy];
  }

  /** Legendary skins twinkle where they're worn (weapon tips, head, body, feet), like in battle. */
  private drawSparks(dt: number, s: Sprite, gx: number, gy: number): void {
    const art = this.bank.art;
    const fl = (p: [number, number]): [number, number] => [gx + (this.flip ? -p[0] : p[0]), gy + p[1]];
    const top = gy - s.oy;
    const spots: [SkinFx | undefined, [number, number] | null, number][] = [
      [art.mainSkin?.fx, s.tip ? fl(s.tip) : null, 4],
      [art.secSkin?.fx, s.secTip ? fl(s.secTip) : null, 4],
      [art.headSkin?.fx, [gx, top + 4], 8],
      [art.chestSkin?.fx, [gx, gy - 30], 14],
      [art.bootsSkin?.fx, [gx, gy - 1], 12],
      [art.useSkin?.fx, fl([4, -26]), 4],
      [art.set ? SET_FX[art.set] : undefined, [gx, gy - 1], 30],
    ];
    if ((this.sparkT -= dt) <= 0) {
      this.sparkT = this.playing ? 0.05 : 0.14;
      for (const [fx, p, spread] of spots) {
        if (!fx || !p) continue;
        this.sparks.push({ x: Math.round(p[0] + (Math.random() - 0.5) * spread), y: Math.round(p[1] + (Math.random() - 0.5) * spread * 0.6), t: 0, a: fx.spark, b: fx.spark2, flame: fx.kind === 'flame' });
      }
    }
    const g = this.g;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.t += dt;
      if (p.t > 0.5) { this.sparks.splice(i, 1); continue; }
      const y = Math.round(p.y - p.t * (p.flame ? 16 : 8));
      g.fillStyle = css(p.t < 0.25 ? p.a : p.b);
      if (p.flame) {
        // Flames: a flickering tongue, two pixels tall while young.
        g.fillRect(p.x, y, 1, p.t < 0.28 ? 2 : 1);
        if (p.t < 0.15) g.fillRect(p.x - 1, y + 1, 3, 1);
        continue;
      }
      g.fillRect(p.x, y, 1, 1);
      if (p.t < 0.2) { g.fillRect(p.x - 1, y, 3, 1); g.fillRect(p.x, y - 1, 1, 3); }
    }
  }

}

/** A round stone dais, its top face centred on (x, y): a lit top with a gold inlay over a darker side. */
function drawPedestal(g: CanvasRenderingContext2D, x: number, y: number): void {
  const rx = 30, ry = 6, depth = 6;
  const half = (i: number) => Math.round(rx * Math.sqrt(Math.max(0, 1 - (i / (ry + 0.5)) ** 2)));
  // Side: the ellipse swept down, darker towards the bottom.
  for (let d = depth; d >= 1; d--) {
    g.fillStyle = d > depth - 2 ? '#1c1530' : '#2c2346';
    for (let i = 0; i <= ry; i++) g.fillRect(x - half(i), y + i + d, half(i) * 2, 1);
  }
  // Top face with a lit back rim.
  for (let i = -ry; i <= ry; i++) {
    g.fillStyle = i <= -ry + 1 ? '#8c7cb4' : i < 0 ? '#5f5186' : '#524577';
    g.fillRect(x - half(i), y + i, half(i) * 2, 1);
  }
  g.fillStyle = 'rgba(245,191,69,0.6)';
  for (let a = 0; a < 72; a++) {
    const t = (a / 72) * Math.PI * 2;
    g.fillRect(Math.round(x + Math.cos(t) * (rx - 6)), Math.round(y + Math.sin(t) * (ry - 2)), 1, 1);
  }
}
