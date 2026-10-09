import { Score } from './score';
import { sfx } from './sfx';

/**
 * Plays the battle soundtrack (see score.ts) on the shared AudioContext and
 * feeds it the fight's state. A short look-ahead timer schedules notes on the
 * audio clock, so frame hitches never make the music stutter.
 */
class Music {
  private score: Score | null = null;
  private timer = 0;
  private soundOn = true;
  private paused = false;
  /** Output gain: 0.4 at full sliders. */
  private volume = 0.4;

  private get on(): boolean { return this.soundOn && this.volume > 0; }

  private ensure(): Score | null {
    const ctx = sfx.context, noise = sfx.noiseBuffer;
    if (!ctx || !noise) return null;
    if (!this.score) {
      this.score = new Score(ctx, noise);
      this.score.out.gain.value = this.on ? this.volume : 0;
      this.score.out.connect(ctx.destination);
    }
    return this.score;
  }

  private run(): void {
    if (this.timer) return;
    const pump = () => {
      const s = this.score, ctx = sfx.context;
      if (!s || !ctx || !s.playing) { clearInterval(this.timer); this.timer = 0; return; }
      if (ctx.state === 'running') s.schedule(ctx.currentTime + 0.15, ctx.currentTime);
    };
    this.timer = window.setInterval(pump, 30);
    pump();
  }

  /** `level` 0..1 is master x music slider; 0 stops the music. */
  setEnabled(sound: boolean, level: number): void {
    this.soundOn = sound;
    this.volume = 0.4 * level;
    const ctx = sfx.context;
    if (this.score && ctx) this.score.out.gain.setTargetAtTime(this.on ? this.volume : 0, ctx.currentTime, 0.05);
    if (!this.on) this.score?.stop();
  }

  /** Names on screen and the 3-2-1: a low drone. */
  intro(): void {
    if (!this.on) return;
    const s = this.ensure();
    if (!s) return;
    s.target = 0;
    s.overtime = false;
    this.setPaused(false);
    this.fade(this.volume, 0.3);
    s.prime(sfx.context!.currentTime + 0.05);
    this.run();
  }

  /** FIGHT! */
  fight(): void {
    if (!this.on) return;
    const s = this.ensure();
    if (!s) return;
    s.begin(sfx.context!.currentTime + 0.03);
    this.run();
  }

  /** Every frame of a fight: how close the weaker fighter is to death (0..1 HP left). */
  update(lowestHp: number, overtime: boolean, paused: boolean): void {
    const s = this.score;
    if (!s) return;
    // Spread the bottom of the range: the last third of a health bar is where it gets wild.
    const hurt = Math.min(1, Math.max(0, (1 - lowestHp) / 0.9));
    s.target = hurt ** 0.85;
    s.overtime = overtime;
    this.setPaused(paused);
  }

  /** KO or time: a final chord, then silence for the results. */
  end(): void {
    const s = this.score, ctx = sfx.context;
    if (!s || !ctx || !s.playing) return;
    const t = ctx.currentTime + 0.03;
    s.finish(t);
    this.setPaused(false);
  }

  /** Leaving the fight. */
  stop(): void {
    const s = this.score;
    if (!s?.playing) return;
    s.stop();
    this.fade(0, 0.25);
  }

  private fade(to: number, tau: number): void {
    const ctx = sfx.context;
    if (!this.score || !ctx) return;
    this.score.out.gain.cancelScheduledValues(ctx.currentTime);
    this.score.out.gain.setTargetAtTime(this.on ? to : 0, ctx.currentTime, tau / 3);
  }

  /** Paused: muffled and quieter, still going. */
  private setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    const ctx = sfx.context;
    if (!this.score || !ctx) return;
    this.score.muffle(p, ctx.currentTime);
  }
}

export const music = new Music();
