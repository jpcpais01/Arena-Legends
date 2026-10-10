import { Score, hz } from './score';

/**
 * The cosmic arena's own soundtrack: deep space instead of a concert hall.
 *
 * Same engine and the same rules as the orchestral score (Score): intensity
 * from the weaker fighter's health picks the section on phrase boundaries,
 * the tempo climbs, near death brings a heartbeat and a riser, overtime lifts
 * the key. The sound is its own: slow-breathing nebula pads in extended
 * chords (maj7, add9), an "oo" choir of distant voices, plucked star arpeggios
 * bouncing through a ping-pong echo, a pulsing synth bass over a sub drone,
 * deep booms, glass ticks and a soaring glide lead. It moves from floating A
 * minor (Am9 Fmaj7 Cmaj7 G6/9) through a tense i–VI–iv–V to the Andalusian
 * descent (Am G F E) for the climax, and ends on a shimmering A major.
 */

type Bar = { bass: number; tones: number[] };
/** [step, semitones above the key, length in steps] */
type Note = [number, number, number];

const K = 57; // A3

const CALM: Bar[] = [
  { bass: 0, tones: [0, 3, 7, 10, 14] }, // Am9
  { bass: -4, tones: [-4, 0, 3, 7] }, // Fmaj7
  { bass: 3, tones: [3, 7, 10, 14] }, // Cmaj7
  { bass: -2, tones: [-2, 2, 5, 7, 12] }, // G6/9
];
const TENSE: Bar[] = [
  { bass: 0, tones: [0, 3, 7, 12] }, // Am
  { bass: -4, tones: [-4, 0, 3, 7] }, // F
  { bass: 5, tones: [5, 8, 12, 17] }, // Dm
  { bass: 7, tones: [7, 11, 14, 19] }, // E
];
const CLIMAX: Bar[] = [
  { bass: 0, tones: [0, 3, 7, 12] }, // Am
  { bass: -2, tones: [-2, 2, 5, 10] }, // G
  { bass: -4, tones: [-4, 0, 3, 7] }, // Fmaj7
  { bass: -5, tones: [-5, -1, 2, 7] }, // E
];

/** The soaring theme over the Andalusian descent. */
const THEME: Note[][] = [
  [[0, 7, 4], [4, 12, 4], [8, 15, 6], [14, 14, 2]],
  [[0, 14, 6], [6, 12, 2], [8, 10, 4], [12, 7, 4]],
  [[0, 12, 4], [4, 15, 4], [8, 19, 6], [14, 17, 2]],
  [[0, 14, 6], [6, 11, 2], [8, 7, 8]],
];
/** A glassy call in the tense section. */
const CALL: Note[][] = [
  [[0, 12, 6], [6, 10, 2], [8, 7, 8]],
  [[0, 12, 6], [6, 15, 2], [8, 12, 8]],
  [[0, 17, 6], [6, 15, 2], [8, 12, 8]],
  [[0, 11, 8], [8, 14, 8]],
];
/** Where stars twinkle in a calm bar, and which chord tone (two octaves up). */
const STARS: [number, number][][] = [
  [[0, 4], [6, 2], [10, 3]],
  [[2, 3], [8, 1], [12, 2]],
  [[0, 2], [4, 3], [10, 1]],
  [[2, 4], [6, 3], [12, 0]],
];
const ARP = [0, 2, 4, 1, 3, 5, 2, 4, 6, 3, 5, 7, 4, 6, 3, 5];

export class CosmicScore extends Score {
  private readonly glow: BiquadFilterNode;
  private readonly voice: GainNode;
  private readonly echo: GainNode;
  private readonly delays: DelayNode[];
  private lastLead = 0;

  constructor(ctx: BaseAudioContext, noise: AudioBuffer) {
    super(ctx, noise);
    const c = ctx;

    // Nebula pad: a lowpass that slowly breathes on its own.
    this.glow = c.createBiquadFilter();
    this.glow.type = 'lowpass';
    this.glow.frequency.value = 900;
    this.glow.Q.value = 3;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = c.createGain();
    depth.gain.value = 450;
    lfo.connect(depth).connect(this.glow.frequency);
    lfo.start();
    this.glow.connect(this.mix);
    const glowVerb = c.createGain();
    glowVerb.gain.value = 1.2;
    this.glow.connect(glowVerb).connect(this.verb);

    // Distant voices: "oo" formants.
    this.voice = c.createGain();
    const voiceOut = c.createGain();
    voiceOut.gain.value = 1.6;
    for (const [f, q, g] of [[320, 5, 1], [870, 8, 0.4], [2250, 10, 0.12]] as const) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const gg = c.createGain();
      gg.gain.value = g;
      this.voice.connect(bp).connect(gg).connect(voiceOut);
    }
    voiceOut.connect(this.mix);
    const voiceVerb = c.createGain();
    voiceVerb.gain.value = 2;
    voiceOut.connect(voiceVerb).connect(this.verb);

    // Ping-pong echo: left and right delays feeding each other.
    this.echo = c.createGain();
    this.echo.gain.value = 0.5;
    const dl = c.createDelay(2), dr = c.createDelay(2);
    dl.delayTime.value = dr.delayTime.value = 0.45;
    const fbl = c.createGain(), fbr = c.createGain();
    fbl.gain.value = fbr.gain.value = 0.42;
    const damp = c.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 3200;
    const pl = c.createStereoPanner(), pr = c.createStereoPanner();
    pl.pan.value = -0.8;
    pr.pan.value = 0.8;
    this.echo.connect(damp).connect(dl);
    dl.connect(pl).connect(this.mix);
    dr.connect(pr).connect(this.mix);
    dl.connect(fbl).connect(dr);
    dr.connect(fbr).connect(dl);
    this.delays = [dl, dr];
    // A longer, darker space than the hall.
    this.verb.gain.value = 0.42;
  }

  protected override stepTime(): number {
    // 88 bpm floating, 134 at death's door, +8 in overtime.
    const target = 88 + 46 * this.level + (this.overtime ? 8 : 0);
    this.bpm += (target - this.bpm) * 0.08;
    return 15 / this.bpm;
  }

  private bars(): Bar[] {
    return this.tier >= 3 ? CLIMAX : this.tier === 2 ? TENSE : CALM;
  }

  /** The base score's opening hits (FIGHT): a boom and a shimmer instead of orchestral drums. */
  protected override crash(t: number, v: number): void {
    this.shimmer(t, v);
  }

  protected override taiko(t: number, v: number): void {
    this.boom(t, v);
  }

  protected override timpani(t: number, midi: number, v: number): void {
    this.sub(t, midi - 12, 1.2, 0.6 * v);
  }

  protected override lift(t: number, big: boolean): void {
    this.shimmer(t, big ? 1 : 0.6);
    if (big) {
      this.boom(t, 1);
      this.downsweep(t);
    }
  }

  override finish(t: number): void {
    if (!this.running) return;
    this.running = false;
    const k = K + this.shift;
    this.boom(t, 1);
    this.shimmer(t, 1);
    this.downsweep(t);
    // A shimmering A major: pad, voices, sub and a rising star cascade.
    this.pad(t, [k - 12, k, k + 4, k + 7, k + 11, k + 14], 3, 0.05);
    this.voices(t, [k + 4, k + 7, k + 12], 3, 0.05);
    this.sub(t, k - 24, 3, 0.6);
    [0, 4, 7, 12, 16, 19, 24, 28].forEach((n, i) => this.star(t + i * 0.09, k + 12 + n, 0.8 - i * 0.06));
  }

  protected override voiceBar(t: number, d: number): void {
    const lv = this.level;
    const tier = this.tier;
    const now = Math.max(t, this.ctx.currentTime);
    this.glow.frequency.setTargetAtTime(this.priming ? 500 : 700 + 2600 * lv ** 1.3, now, 0.6);
    for (const dl of this.delays) dl.delayTime.setTargetAtTime(d * 3, now, 0.1);

    const k = K + this.shift;
    const dur = d * 16;
    if (this.priming) {
      this.sub(t, k - 24, dur, 0.45);
      this.pad(t, [k - 12, k - 5, k], dur, 0.04);
      this.voices(t, [k, k + 7], dur, 0.03);
      return;
    }
    const bar = this.bars()[this.bar % 4];
    const tones = bar.tones.map((n) => k + n);
    const voicing = tier >= 3 ? [k - 12 + bar.bass, ...tones, tones[1] + 12] : [k - 12 + bar.bass, ...tones];
    this.pad(t, voicing, dur, tier >= 3 ? 0.032 : 0.04);
    if (tier >= 1 || this.overtime) {
      const lift = tier >= 3 || lv > 0.9 ? 12 : 0;
      this.voices(t, tones.slice(0, 3).map((n) => n + lift), dur, 0.025 + 0.03 * lv + (this.overtime ? 0.012 : 0));
    }
    if (tier === 0) this.sub(t, k - 24 + bar.bass, dur, 0.4);
  }

  protected override tick(t: number, d: number): void {
    const tau = this.target > this.level ? 0.6 : 5;
    this.level += (this.target - this.level) * (1 - Math.exp(-d / tau));
    const s = this.step;
    if (s === 0) this.downbeat(t, d);
    if (this.priming) return;
    const phraseEnd = this.bar % 4 === 3;

    const tier = this.tier;
    const lv = this.level;
    const crit = lv > 0.9;
    const bar = this.bars()[this.bar % 4];
    const k = K + this.shift;
    const root = k - 12 + bar.bass;

    // --- Pulse ------------------------------------------------------------------
    const BOOM = [[0], [0, 8], [0, 6, 8, 10], [0, 4, 8, 12, 14]][tier];
    if (BOOM.includes(s) || (crit && s % 4 === 0)) this.boom(t, s === 0 ? 1 : 0.75);
    if (tier === 1 && s === 12) this.nebula(t, 0.6);
    if (tier >= 2 && (s === 4 || s === 12)) this.nebula(t, 1);
    if (tier >= 1) {
      const every = tier >= 3 ? 1 : 2;
      if (s % every === 0) this.tick16(t, s % 4 === 2 ? 1 : 0.55);
    }
    if (phraseEnd && tier >= 1 && s === 8) this.swell(t, d * 8);
    if (phraseEnd && tier >= 2 && s >= 12) this.nebula(t, 0.3 + 0.15 * (s - 12));
    if (this.overtime && (s === 6 || s === 14)) this.boom(t, 0.8);
    if (crit && (s === 0 || s === 2 || s === 8 || s === 10)) this.heart(t, s % 8 === 0 ? 1 : 0.7);

    // --- Bass ---------------------------------------------------------------------
    if (tier === 1 && s % 2 === 0) this.pulse(t, root, d * 1.6, s % 8 === 0 ? 0.9 : 0.65);
    else if (tier === 2 && s % 2 === 0) this.pulse(t, s === 6 || s === 14 ? root + 12 : root, d * 1.6, s % 8 === 0 ? 1 : 0.7);
    else if (tier >= 3) this.pulse(t, s % 4 === 3 ? root + 12 : root, d * 0.9, s % 4 === 0 ? 1 : 0.6);
    if (tier >= 1 && (s === 0 || s === 8)) this.sub(t, root - 12, d * 7.5, 0.35);

    // --- Stars ----------------------------------------------------------------------
    const up = bar.tones.map((n) => k + 12 + n);
    const ladder = [...up, ...up.map((n) => n + 12)];
    if (tier === 0) {
      for (const [at, i] of STARS[this.bar % 4]) if (at === s) this.star(t, k + 24 + bar.tones[i % bar.tones.length], 0.8);
    } else if (tier === 1 ? s % 2 === 0 : true) {
      this.pluck(t, ladder[ARP[s] % ladder.length], tier >= 3 ? 0.5 : 0.75);
    }

    // --- Lead -----------------------------------------------------------------------
    const line = tier >= 3 ? THEME : tier === 2 ? CALL : null;
    if (line) {
      for (const [at, n, len] of line[this.bar % 4]) {
        if (at !== s) continue;
        this.lead(t, k + n + (tier >= 3 ? 12 : 0), d * len, tier >= 3 ? 1 : 0.7);
      }
    }

    // --- Near death -----------------------------------------------------------------
    if (crit) {
      if (s % 4 === 0) this.star(t, k + 36 + (s / 4) * 2, 0.6);
      if (phraseEnd && s === 0) this.riser(t, d * 16);
    }
  }

  // --- Instruments ----------------------------------------------------------------

  /** Deep space kick: a long falling sine and a soft click. */
  private boom(t: number, v: number): void {
    const g = this.gain(this.drums);
    const o = this.osc('sine', 72, t, this.env(g.gain, t, 0.003, 0, 0.95 * v, 0.55), g);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const c = this.gain(this.drums);
    this.hiss(t, this.env(c.gain, t, 0.001, 0, 0.08 * v, 0.02), 'highpass', 2500, 0.7, c);
    const r = this.gain(this.verb);
    this.osc('sine', 60, t, this.env(r.gain, t, 0.003, 0, 0.25 * v, 0.3), r);
  }

  /** Snare thrown into the void: noise with a huge tail. */
  private nebula(t: number, v: number): void {
    const g = this.gain(this.drums);
    this.hiss(t, this.env(g.gain, t, 0.002, 0, 0.22 * v, 0.12), 'bandpass', 1600, 0.6, g);
    const r = this.gain(this.verb);
    this.hiss(t, this.env(r.gain, t, 0.002, 0, 0.4 * v, 0.35), 'bandpass', 1800, 0.5, r);
  }

  /** Glass tick: a tiny high ping. */
  private tick16(t: number, v: number): void {
    const g = this.gain(this.drums, Math.random() * 0.6 - 0.3);
    this.osc('sine', 6200 + Math.random() * 1600, t, this.env(g.gain, t, 0.001, 0, 0.025 * v, 0.03), g);
    this.hiss(t, this.env(g.gain, t, 0.001, 0, 0.04 * v, 0.025), 'highpass', 9000, 0.7, g);
  }

  /** Bright noise bloom with ringing stars: the cosmic crash. */
  private shimmer(t: number, v: number): void {
    const g = this.gain(this.verb);
    this.hiss(t, this.env(g.gain, t, 0.01, 0, 0.3 * v, 2), 'highpass', 6000, 0.5, g);
    const d = this.gain(this.drums);
    this.hiss(t, this.env(d.gain, t, 0.003, 0, 0.1 * v, 1), 'highpass', 7000, 0.5, d);
  }

  /** A falling whoosh after a big hit. */
  private downsweep(t: number): void {
    const g = this.gain(this.mix);
    g.connect(this.verb);
    const bq = this.hiss(t, this.env(g.gain, t, 0.01, 0, 0.1, 1.4), 'bandpass', 6000, 3, g);
    bq.frequency.exponentialRampToValueAtTime(200, t + 1.4);
  }

  private sub(t: number, midi: number, dur: number, v: number): void {
    const g = this.gain(this.mix);
    this.osc('sine', hz(midi), t, this.env(g.gain, t, 0.08, Math.max(0, dur - 0.3), 0.32 * v, 0.3), g);
  }

  /** Pulsing synth bass: filter snaps open on each note. */
  private pulse(t: number, midi: number, len: number, v: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 4;
    const top = 500 + 1800 * this.level;
    f.frequency.setValueAtTime(top, t);
    f.frequency.exponentialRampToValueAtTime(160, t + Math.max(0.08, len));
    const g = this.gain(this.mix);
    f.connect(g);
    const end = this.env(g.gain, t, 0.004, 0, 0.2 * v, Math.max(0.08, len));
    this.osc('sawtooth', hz(midi), t, end, f, -5);
    this.osc('square', hz(midi), t, end, f, 5);
  }

  private pad(t: number, notes: number[], dur: number, v: number): void {
    const lo = Math.min(...notes), hi = Math.max(...notes);
    for (const n of notes) {
      const pan = hi > lo ? ((n - lo) / (hi - lo)) * 0.9 - 0.45 : 0;
      const g = this.gain(this.glow, pan);
      const end = this.env(g.gain, t, Math.min(0.8, dur * 0.35), Math.max(0, dur - 0.8), v, 1.4);
      this.osc('sawtooth', hz(n), t, end, g, -13);
      this.osc('sawtooth', hz(n), t, end, g, 13);
      const air = this.gain(g);
      air.gain.value = 0.5;
      this.osc('triangle', hz(n + 12), t, end, air, 4);
    }
  }

  private voices(t: number, notes: number[], dur: number, v: number): void {
    notes.forEach((n, i) => {
      const g = this.gain(this.voice, i % 2 ? 0.4 : -0.4);
      const end = this.env(g.gain, t, Math.min(0.9, dur * 0.4), Math.max(0, dur - 0.9), v, 1.4);
      for (const det of [-16, 16]) {
        const o = this.osc('sawtooth', hz(n), t, end, g, det);
        o.frequency.setValueAtTime(hz(n), t + 0.6);
        o.frequency.linearRampToValueAtTime(hz(n) * 1.004, t + dur * 0.5);
        o.frequency.linearRampToValueAtTime(hz(n) * 0.997, t + dur);
      }
    });
  }

  /** Plucked star: a quick sine/triangle blip into the ping-pong echo. */
  private pluck(t: number, midi: number, v: number): void {
    const g = this.gain(this.mix, 0.1);
    g.connect(this.echo);
    const end = this.env(g.gain, t, 0.002, 0, 0.06 * v, 0.22);
    this.osc('triangle', hz(midi), t, end, g);
    this.osc('sine', hz(midi) * 2, t, end, g);
  }

  /** A single twinkling star: bell partials, long echo. */
  private star(t: number, midi: number, v: number): void {
    const g = this.gain(this.mix, Math.random() * 0.8 - 0.4);
    g.connect(this.echo);
    g.connect(this.verb);
    const end = this.env(g.gain, t, 0.002, 0, 0.045 * v, 1.6);
    this.osc('sine', hz(midi), t, end, g);
    const p = this.gain(g);
    this.osc('sine', hz(midi) * 3.01, t, this.env(p.gain, t, 0.002, 0, 0.3, 0.4), p);
  }

  /** Soaring lead: glides from the last note, vibrato, echo and space. */
  private lead(t: number, midi: number, dur: number, v: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400 + 1600 * this.level;
    f.Q.value = 1;
    const g = this.gain(this.mix, -0.1);
    f.connect(g);
    g.connect(this.echo);
    g.connect(this.verb);
    const end = this.env(g.gain, t, 0.03, Math.max(0, dur - 0.1), 0.075 * v, 0.35);
    const from = this.lastLead ? hz(this.lastLead) : hz(midi);
    this.lastLead = midi;
    for (const [type, det, mul] of [['sawtooth', -9, 1], ['sawtooth', 9, 1], ['sine', 0, 0.5]] as const) {
      const o = this.osc(type, from * mul, t, end, f, det);
      o.frequency.exponentialRampToValueAtTime(hz(midi) * mul, t + 0.07);
      if (dur > 0.4) {
        o.frequency.setValueAtTime(hz(midi) * mul, t + 0.3);
        o.frequency.linearRampToValueAtTime(hz(midi) * mul * 1.006, t + dur * 0.6);
        o.frequency.linearRampToValueAtTime(hz(midi) * mul * 0.996, t + dur);
      }
    }
  }
}
