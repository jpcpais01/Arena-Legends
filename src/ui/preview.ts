import type { CharacterBuild } from '../sim/loadout';
import { clipLength, clipsFor } from '../render/sprite/anims';
import type { AnimOut } from '../render/sprite/animator';
import { SpriteBank } from '../render/sprite/bank';
import { makeArt } from '../render/sprite/look';

const SHOWCASE_SKIP = new Set(['idle', 'run', 'back', 'hurt', 'stun', 'air', 'ko', 'roll', 'leap', 'evade', 'blink', 'sec.riposte']);

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
  private out: AnimOut = { clip: 'idle', frame: 0, face: null, secOut: false, jitter: 0, hop: 0, key: '' };

  /** `w`, `h` in art pixels; `zoom` art→device pixels is picked to fit the CSS box. */
  constructor(build: CharacterBuild, readonly w = 100, readonly h = 90, opts: { flip?: boolean; autoplay?: boolean } = {}) {
    this.el = document.createElement('canvas');
    this.el.className = 'preview';
    this.el.width = w; this.el.height = h;
    this.g = this.el.getContext('2d')!;
    this.flip = !!opts.flip;
    this.set(build);
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
  }

  /** Plays a move (a given clip, or a random one). */
  showcase(clip?: string): void {
    this.playing = clip ?? this.clips[Math.floor(Math.random() * this.clips.length)] ?? null;
    this.t = 0;
  }

  dispose(): void {
    this.alive = false;
    cancelAnimationFrame(this.raf);
  }

  private tick(dt: number): void {
    this.t += dt;
    const o = this.out;
    if (this.playing) {
      const c = this.bank.set.clips.get(this.playing)!;
      const n = clipLength(c);
      const i = Math.floor(this.t * 11);
      if (i >= n + 3) { this.playing = null; this.t = 0; }
      o.clip = this.playing ?? 'idle';
      o.frame = this.playing ? Math.min(n - 1, i) : 0;
    } else {
      o.clip = 'idle';
      o.frame = Math.floor(this.t * 3) % 4;
      if (this.next > 0 && this.t > this.next) { this.showcase(); this.next = 3 + Math.random() * 3; }
    }
    o.key = `${o.clip}.${o.frame}.`;
    const s = this.bank.get(o);
    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    // Ground shadow.
    g.fillStyle = 'rgba(0,0,0,0.3)';
    const gx = Math.round(this.w / 2), gy = this.h - 8;
    g.fillRect(gx - 11, gy - 1, 22, 3);
    if (this.flip) {
      g.save(); g.translate(gx + 1, 0); g.scale(-1, 1);
      g.drawImage(s.img, -s.ox, gy - s.oy);
      g.restore();
    } else g.drawImage(s.img, gx - s.ox, gy - s.oy);
  }
}
