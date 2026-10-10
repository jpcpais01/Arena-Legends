import { CosmicScore } from './cosmic';
import { MenuScore } from './menu';
import { Score } from './score';
import { sfx } from './sfx';

type Style = 'orchestra' | 'cosmic';
/** Arenas with a soundtrack of their own; every other arena gets the orchestra. */
const styleFor = (arena = ''): Style => (/cosm|celest|astral|star|void/i.test(arena) ? 'cosmic' : 'orchestra');
/** The home theme sits a little under the battle music. */
const MENU_LEVEL = 0.85;

/**
 * Plays the battle soundtrack (see score.ts) and the home theme (menu.ts) on
 * the shared AudioContext, crossfading between them, and feeds the battle
 * score the fight's state. A short look-ahead timer schedules notes on the
 * audio clock, so frame hitches never make the music stutter.
 */
class Music {
  private score: Score | null = null;
  private readonly scores = new Map<Style, Score>();
  private style: Style = 'orchestra';
  private home: MenuScore | null = null;
  /** The home theme should be playing (it waits for the first tap to unlock audio). */
  private wantHome = false;
  private timer = 0;
  private soundOn = true;
  private paused = false;
  /** Output gain: 0.4 at full sliders. */
  private volume = 0.4;

  private get on(): boolean { return this.soundOn && this.volume > 0; }

  private ensure(): Score | null {
    const ctx = sfx.context, noise = sfx.noiseBuffer;
    if (!ctx || !noise) return null;
    let s = this.scores.get(this.style);
    if (!s) {
      s = this.style === 'cosmic' ? new CosmicScore(ctx, noise) : new Score(ctx, noise);
      s.out.gain.value = this.on ? this.volume : 0;
      s.out.connect(ctx.destination);
      this.scores.set(this.style, s);
    }
    if (this.score && this.score !== s) {
      // Switching arenas: let the other score go quiet.
      this.score.stop();
      this.score.out.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    }
    this.score = s;
    return s;
  }

  private run(): void {
    if (this.timer) return;
    const pump = () => {
      const ctx = sfx.context;
      const live = [this.score, this.home].filter((s): s is Score => !!s?.playing);
      if (!ctx || !live.length) { clearInterval(this.timer); this.timer = 0; return; }
      if (ctx.state === 'running') for (const s of live) s.schedule(ctx.currentTime + 0.15, ctx.currentTime);
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
    if (this.home && ctx) this.home.out.gain.setTargetAtTime(this.on && this.home.playing ? this.volume * MENU_LEVEL : 0, ctx.currentTime, 0.05);
    if (!this.on) { this.score?.stop(); this.home?.stop(); }
    else if (this.wantHome) this.menu();
  }

  /** Home screen and menus: the calm theme fades in (after the first tap, if audio is still locked). */
  menu(): void {
    this.wantHome = true;
    const ctx = sfx.context, noise = sfx.noiseBuffer;
    // Battle music (or its final chord) gives way.
    if (this.score) { this.score.stop(); this.fade(0, 0.6); }
    if (!this.on || !ctx || !noise) return;
    if (!this.home) {
      this.home = new MenuScore(ctx, noise);
      this.home.out.gain.value = 0;
      this.home.out.connect(ctx.destination);
    }
    if (this.home.playing) return;
    const g = this.home.out.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(0.0001, ctx.currentTime);
    g.setTargetAtTime(this.volume * MENU_LEVEL, ctx.currentTime, 0.8);
    this.home.begin(ctx.currentTime + 0.1);
    this.run();
  }

  /** Audio just unlocked: start the home theme if we're on the home screen. */
  unlocked(): void {
    if (this.wantHome && !this.home?.playing) this.menu();
  }

  /** Into a fight: the home theme fades out under the battle drone. */
  private leaveMenu(): void {
    this.wantHome = false;
    const ctx = sfx.context;
    if (!this.home?.playing || !ctx) return;
    this.home.stop();
    this.home.out.gain.cancelScheduledValues(ctx.currentTime);
    this.home.out.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  }

  /** Names on screen and the 3-2-1: a low drone. `arena` (a theme id) picks the soundtrack. */
  intro(arena?: string): void {
    if (arena !== undefined) this.style = styleFor(arena);
    this.leaveMenu();
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
