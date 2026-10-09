/**
 * The battle soundtrack, composed live on the Web Audio API (no audio files).
 *
 * A 16-step sequencer plays layered parts in D minor. Everything that makes
 * music feel urgent follows `target` (0 calm .. 1 one hit from death): the
 * number of layers, the chord progression (natural minor, then harmonic minor
 * with a raised V, then a Neapolitan climax), the tempo, the drum patterns,
 * the bass rhythm, and how bright the synths are. Near death a heartbeat,
 * string tremolo and risers join in. Night overtime lifts the key a semitone
 * and adds war drums.
 *
 * Context-agnostic on purpose: the game runs it on the live AudioContext, and
 * an OfflineAudioContext can render it for previews.
 */

type Quality = 'm' | 'M';
type Chord = [root: number, q: Quality];
/** [step, semitones above the key, length in steps] */
type Note = [number, number, number];

/** Four bars each; one chord per bar. Roots in semitones from the key. */
const CALM: Chord[] = [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']]; // i VI III VII
const TENSE: Chord[] = [[0, 'm'], [-4, 'M'], [5, 'm'], [7, 'M']]; // i VI iv V
const CLIMAX: Chord[] = [[0, 'm'], [-4, 'M'], [1, 'M'], [7, 'M']]; // i VI bII V

/** The theme over the climax progression. */
const THEME: Note[][] = [
  [[0, 12, 3], [3, 15, 3], [6, 19, 2], [8, 17, 2], [10, 15, 2], [12, 14, 2], [14, 12, 2]],
  [[0, 15, 3], [3, 12, 3], [6, 20, 4], [10, 19, 2], [12, 15, 4]],
  [[0, 13, 3], [3, 17, 3], [6, 20, 2], [8, 17, 2], [10, 13, 2], [12, 17, 4]],
  [[0, 19, 3], [3, 23, 3], [6, 26, 4], [10, 23, 2], [12, 19, 4]],
];
/** A lower answering phrase over the tense progression. */
const MOTIF: Note[][] = [
  [[0, 7, 4], [4, 10, 2], [6, 12, 6], [12, 10, 4]],
  [[0, 8, 4], [4, 7, 2], [6, 3, 6], [12, 5, 4]],
  [[0, 5, 4], [4, 8, 2], [6, 12, 6], [12, 10, 4]],
  [[0, 11, 6], [6, 7, 4], [10, 4, 2], [12, 7, 4]],
];

/** Intensity where tiers 1, 2 and 3 begin. Dropping back needs a margin below. */
const TIERS = [0.18, 0.44, 0.7];
const KEY = 50; // D3

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const triad = ([r, q]: Chord) => [r, r + (q === 'm' ? 3 : 4), r + 7];

export class Score {
  /** Final output: connect it to the destination. */
  readonly out: GainNode;
  /** Where the fighters are: 0 both healthy .. 1 someone is nearly dead. */
  target = 0;
  overtime = false;
  /** Smoothed intensity the sequencer plays from. */
  level = 0;
  tier = -1;

  private readonly mix: DynamicsCompressorNode;
  private readonly tone: BiquadFilterNode;
  private readonly drums: GainNode;
  private readonly padBus: BiquadFilterNode;
  private readonly arpBus: BiquadFilterNode;
  private readonly leadBus: GainNode;
  private readonly verb: GainNode;
  private readonly echo: GainNode;

  private next = 0;
  private step = 0;
  private bar = 0;
  private bpm = 100;
  private shift = 0;
  private wasOvertime = false;
  private running = false;
  /** Before FIGHT: a low drone only. */
  private priming = false;

  constructor(private readonly ctx: BaseAudioContext, private readonly noise: AudioBuffer) {
    const c = ctx;
    this.out = c.createGain();
    this.tone = c.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 20000;
    this.tone.Q.value = 0.5;
    this.tone.connect(this.out);

    this.mix = c.createDynamicsCompressor();
    this.mix.threshold.value = -16;
    this.mix.ratio.value = 3;
    this.mix.attack.value = 0.01;
    this.mix.release.value = 0.2;
    this.mix.connect(this.tone);

    // Reverb: a generated stereo impulse, decaying noise.
    const conv = c.createConvolver();
    const len = Math.floor(c.sampleRate * 1.8);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    conv.buffer = ir;
    this.verb = c.createGain();
    this.verb.gain.value = 0.35;
    this.verb.connect(conv).connect(this.tone);

    // Dotted-eighth echo for the arp and lead (time follows the tempo).
    this.echo = c.createGain();
    this.echo.gain.value = 0.28;
    const delay = c.createDelay(1.5);
    delay.delayTime.value = 0.42;
    const fb = c.createGain();
    fb.gain.value = 0.32;
    const damp = c.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2200;
    this.echo.connect(delay).connect(damp).connect(fb).connect(delay);
    damp.connect(this.tone);
    this.delay = delay;

    this.drums = c.createGain();
    this.drums.connect(this.mix);
    this.padBus = c.createBiquadFilter();
    this.padBus.type = 'lowpass';
    this.padBus.frequency.value = 500;
    this.padBus.Q.value = 2;
    this.padBus.connect(this.mix);
    this.padBus.connect(this.verb);
    this.arpBus = c.createBiquadFilter();
    this.arpBus.type = 'lowpass';
    this.arpBus.frequency.value = 1600;
    this.arpBus.Q.value = 4;
    this.arpBus.connect(this.mix);
    this.arpBus.connect(this.echo);
    this.leadBus = c.createGain();
    this.leadBus.connect(this.mix);
    this.leadBus.connect(this.echo);
    this.leadBus.connect(this.verb);
  }
  private readonly delay: DelayNode;

  get playing(): boolean { return this.running; }

  /** Low drone while the fighters are introduced. */
  prime(t: number): void {
    this.reset(t);
    this.priming = true;
    this.running = true;
  }

  /** FIGHT: the groove starts on the downbeat at `t`. */
  begin(t: number): void {
    const fresh = !this.running || this.priming;
    if (!fresh) return;
    this.reset(t);
    this.running = true;
    this.crash(t, 0.9);
  }

  private reset(t: number): void {
    this.next = t;
    this.step = 0;
    this.bar = 0;
    this.tier = -1;
    this.level = this.target;
    this.priming = false;
    this.wasOvertime = this.overtime;
    this.shift = this.overtime ? 1 : 0;
  }

  /** The fight is over: a last struck chord rings out. */
  finish(t: number): void {
    if (!this.running) return;
    this.running = false;
    const prog = this.progression();
    const k = KEY + this.shift;
    const r = prog[0][0];
    this.kick(t, 1);
    this.taiko(t, 1);
    this.crash(t, 1);
    this.pad(t, triad(prog[0]).map((n) => k + n).concat(k + r + 12, k + r - 12), 2.2, 0.08, 3000);
    this.bassNote(t, k - 12 + r, 2.2, 0.5, 0.3);
  }

  stop(): void {
    this.running = false;
  }

  /** Paused: the music carries on behind a wall. */
  muffle(on: boolean, t: number): void {
    this.tone.frequency.setTargetAtTime(on ? 600 : 20000, t, 0.08);
  }

  /** Schedules every step that starts before `until`. `now` resyncs after a stall (hidden tab). */
  schedule(until: number, now = -1): void {
    if (!this.running) return;
    if (now >= 0 && this.next < now) this.next = now + 0.02;
    while (this.next < until) {
      const d = this.stepTime();
      this.tick(this.next, d);
      this.next += d;
      if (++this.step === 16) { this.step = 0; this.bar++; }
    }
  }

  private stepTime(): number {
    // Tempo climbs with intensity: 100 bpm calm, 146 at death's door, +8 in overtime.
    const target = 100 + 46 * this.level + (this.overtime ? 8 : 0);
    this.bpm += (target - this.bpm) * 0.08;
    return 15 / this.bpm;
  }

  private progression(): Chord[] {
    return this.tier >= 3 ? CLIMAX : this.tier === 2 ? TENSE : CALM;
  }

  private tick(t: number, d: number): void {
    // Rise fast when someone takes a beating; ease down slowly after a heal.
    const tau = this.target > this.level ? 0.6 : 5;
    this.level += (this.target - this.level) * (1 - Math.exp(-d / tau));
    const s = this.step;
    if (s === 0) this.downbeat(t, d);
    if (this.priming) return;
    const phraseEnd = this.bar % 4 === 3;

    const tier = this.tier;
    const lv = this.level;
    const crit = lv > 0.9;
    const prog = this.progression();
    const chord = prog[this.bar % 4];
    const k = KEY + this.shift;
    const tones = triad(chord);

    // --- Drums -----------------------------------------------------------------
    const KICK = [[0, 8], [0, 8, 10], [0, 3, 8, 10], [0, 3, 6, 8, 10, 11, 14]][tier];
    if (KICK.includes(s) || (crit && s % 4 === 0)) this.kick(t, s === 0 ? 1 : 0.8);
    if (tier >= 1) {
      if (s === 4 || s === 12) this.snare(t, 1);
      if (tier >= 2 && (s === 15 || (tier >= 3 && s === 7))) this.snare(t, 0.3);
      if (phraseEnd) {
        if (tier === 1 && s >= 12 && s < 15) this.tom(t, [196, 147, 110][s - 12], 0.7);
        if (tier >= 2 && s >= (tier >= 3 ? 8 : 12)) this.snare(t, 0.35 + 0.6 * ((s - 8) / 8));
      }
      const hatEvery = tier >= 3 ? 1 : 2;
      if (s % hatEvery === 0) {
        const open = tier >= 3 && (s === 6 || s === 14);
        this.hat(t, open, s % 4 === 2 ? 1 : 0.55);
      } else if (tier === 2) this.hat(t, false, 0.25);
    }
    if (this.overtime && (s === 0 || s === 6 || s === 8 || (tier >= 3 && s === 14))) this.taiko(t, s === 0 ? 1 : 0.7);
    if (crit && (s === 0 || s === 2 || s === 8 || s === 10)) this.heart(t, s % 8 === 0 ? 1 : 0.7);

    // --- Bass -------------------------------------------------------------------
    const root = k - 12 + chord[0];
    const bright = 0.2 + 0.8 * lv;
    if (tier === 0) {
      if (s === 0 || s === 8) this.bassNote(t, root, d * 7.5, 0.55, 0.1);
    } else if (tier <= 2) {
      if (s % 2 === 0) {
        const n = s === 6 || s === 14 ? root + 12 : s === 10 ? root + 7 : root;
        this.bassNote(t, n, d * 1.7, s % 8 === 0 ? 0.6 : 0.45, bright);
      }
    } else if (s % 4 !== 1) {
      this.bassNote(t, s % 8 === 6 ? root + 12 : root, d * 0.9, s % 4 === 0 ? 0.6 : 0.42, bright);
    }

    // --- Stabs ------------------------------------------------------------------
    const STAB = [[], [0], [0, 6], [0, 10]][tier];
    if (STAB.includes(s)) this.stab(t, tones.map((n) => k + 12 + n), tier >= 3 ? d * 2 : d * 3, 0.5 + 0.5 * lv);

    // --- Arp ---------------------------------------------------------------------
    if (tier >= 2) {
      const notes = [...tones, tones[0] + 12, tones[1] + 12];
      const ARP = [0, 1, 2, 3, 4, 3, 2, 1];
      this.arp(t, k + 12 + notes[ARP[s % 8]], d, tier >= 3 ? 0.55 : 0.8);
    }

    // --- Melody ----------------------------------------------------------------
    const line = tier >= 3 ? THEME : tier === 2 ? MOTIF : null;
    if (line) {
      for (const [at, n, len] of line[this.bar % 4]) {
        if (at !== s) continue;
        this.lead(t, k + n + (tier >= 3 ? 12 : 0), d * len, tier >= 3 ? 1 : 0.6, crit);
      }
    }

    // --- Near death -----------------------------------------------------------
    if (crit) {
      const n = k + 24 + tones[1 + (s & 1)];
      this.trem(t, n, 0.6);
      this.trem(t + d / 2, n, 0.45);
      if (phraseEnd && s === 0) this.riser(t, d * 16);
    }
  }

  private downbeat(t: number, d: number): void {
    // A new section only on bar 1 of a phrase, so changes land musically.
    const lv = this.level;
    let tier = this.tier;
    if (this.priming) tier = 0;
    else {
      let up = 0;
      while (up < 3 && lv >= TIERS[up]) up++;
      if (tier < 0) tier = up;
      else if (up > tier) tier = up;
      else if (up < tier && lv < TIERS[tier - 1] - 0.08) tier = up;
    }
    const otNow = this.overtime && !this.wasOvertime;
    if (otNow) { this.shift = 1; this.wasOvertime = true; }
    if (!this.priming && (tier > this.tier || otNow) && this.tier >= 0) {
      this.crash(t, 1);
      // Re-enter the phrase at its start so the new progression begins on its i chord.
      this.bar = 0;
    } else if (!this.priming && this.bar % 4 === 0 && this.bar > 0 && tier >= 2) {
      this.crash(t, 0.55);
    }
    this.tier = tier;

    // Sweep the shared filters with intensity.
    const now = Math.max(t, this.ctx.currentTime);
    this.padBus.frequency.setTargetAtTime(this.priming ? 380 : 480 + 2600 * lv ** 1.5, now, 0.4);
    this.arpBus.frequency.setTargetAtTime(1200 + 3200 * lv, now, 0.3);
    this.delay.delayTime.setTargetAtTime(d * 3, now, 0.1);

    const chord = this.progression()[this.bar % 4];
    const k = KEY + this.shift;
    const notes = triad(chord).map((n) => k + n);
    if (this.priming) {
      this.pad(t, [k - 12, k, k + 7], d * 16, 0.07, 0);
      return;
    }
    const pv = tier >= 3 ? 0.055 : 0.07;
    this.pad(t, notes.concat(this.overtime ? [k - 12 + chord[0]] : []), d * 16, pv, 0);
  }

  // --- Instruments ---------------------------------------------------------------

  private env(g: AudioParam, t: number, a: number, hold: number, peak: number, rel: number): number {
    peak = Math.max(peak, 0.0002);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + a);
    if (hold > 0) g.setValueAtTime(peak, t + a + hold);
    g.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
    return t + a + hold + rel + 0.02;
  }

  private osc(type: OscillatorType, f: number, t: number, end: number, dest: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(end);
    return o;
  }

  private hiss(t: number, end: number, type: BiquadFilterType, f: number, q: number, dest: AudioNode): BiquadFilterNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const bq = this.ctx.createBiquadFilter();
    bq.type = type;
    bq.frequency.setValueAtTime(f, t);
    bq.Q.value = q;
    s.connect(bq).connect(dest);
    s.start(t, Math.random() * 0.5);
    s.stop(end);
    return bq;
  }

  private gain(dest: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.connect(dest);
    return g;
  }

  private kick(t: number, v: number): void {
    const g = this.gain(this.drums);
    const end = this.env(g.gain, t, 0.002, 0, 0.9 * v, 0.3);
    const o = this.osc('sine', 150, t, end, g);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const c = this.gain(this.drums);
    this.hiss(t, this.env(c.gain, t, 0.001, 0, 0.12 * v, 0.015), 'highpass', 3000, 0.7, c);
  }

  private snare(t: number, v: number): void {
    const g = this.gain(this.drums);
    this.hiss(t, this.env(g.gain, t, 0.002, 0, 0.42 * v, 0.17), 'bandpass', 1900, 0.8, g);
    const b = this.gain(this.drums);
    const o = this.osc('triangle', 210, t, this.env(b.gain, t, 0.002, 0, 0.28 * v, 0.08), b);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    if (v > 0.6) { const r = this.gain(this.verb); this.hiss(t, this.env(r.gain, t, 0.002, 0, 0.12 * v, 0.12), 'bandpass', 1900, 0.8, r); }
  }

  private hat(t: number, open: boolean, v: number): void {
    const g = this.gain(this.drums);
    this.hiss(t, this.env(g.gain, t, 0.001, 0, 0.14 * v, open ? 0.22 : 0.035), 'highpass', 7500, 0.8, g);
  }

  private crash(t: number, v: number): void {
    const g = this.gain(this.drums);
    this.hiss(t, this.env(g.gain, t, 0.002, 0, 0.2 * v, 1.6), 'highpass', 4200, 0.5, g);
    const r = this.gain(this.verb);
    this.hiss(t, this.env(r.gain, t, 0.002, 0, 0.18 * v, 1.2), 'highpass', 5000, 0.5, r);
  }

  private tom(t: number, f: number, v: number): void {
    const g = this.gain(this.drums);
    const o = this.osc('sine', f, t, this.env(g.gain, t, 0.002, 0, 0.6 * v, 0.28), g);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.25);
  }

  private taiko(t: number, v: number): void {
    const g = this.gain(this.drums);
    const o = this.osc('sine', 95, t, this.env(g.gain, t, 0.003, 0, 0.85 * v, 0.6), g);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.35);
    const n = this.gain(this.drums);
    this.hiss(t, this.env(n.gain, t, 0.002, 0, 0.35 * v, 0.18), 'lowpass', 500, 1, n);
    const r = this.gain(this.verb);
    this.hiss(t, this.env(r.gain, t, 0.002, 0, 0.3 * v, 0.3), 'lowpass', 400, 1, r);
  }

  private heart(t: number, v: number): void {
    const g = this.gain(this.drums);
    const o = this.osc('sine', 62, t, this.env(g.gain, t, 0.004, 0, 0.7 * v, 0.2), g);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
  }

  private riser(t: number, dur: number): void {
    const g = this.gain(this.mix);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    const bq = this.hiss(t, t + dur + 0.08, 'bandpass', 400, 2, g);
    bq.frequency.exponentialRampToValueAtTime(7000, t + dur);
  }

  private bassNote(t: number, midi: number, dur: number, v: number, bright: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(220 + 1400 * bright, t);
    f.frequency.exponentialRampToValueAtTime(140 + 200 * bright, t + Math.min(dur, 0.25));
    const g = this.gain(this.mix);
    f.connect(g);
    const end = this.env(g.gain, t, 0.006, Math.max(0, dur - 0.08), 0.32 * v, 0.08);
    this.osc('sawtooth', hz(midi), t, end, f);
    const sub = this.gain(this.mix);
    this.osc('sine', hz(midi), t, this.env(sub.gain, t, 0.006, Math.max(0, dur - 0.08), 0.38 * v, 0.08), sub);
  }

  private pad(t: number, notes: number[], dur: number, v: number, extraBright: number): void {
    const dest = extraBright ? this.brightPad(t, dur, extraBright) : this.padBus;
    const g = this.gain(dest);
    const end = this.env(g.gain, t, Math.min(0.35, dur * 0.3), Math.max(0, dur - 0.35), v, 0.7);
    for (const n of notes) {
      this.osc('sawtooth', hz(n), t, end, g, -9);
      this.osc('sawtooth', hz(n), t, end, g, 9);
    }
  }

  /** The final chord gets its own open filter that closes as it rings. */
  private brightPad(t: number, dur: number, f: number): AudioNode {
    const bq = this.ctx.createBiquadFilter();
    bq.type = 'lowpass';
    bq.frequency.setValueAtTime(f, t);
    bq.frequency.exponentialRampToValueAtTime(300, t + dur + 0.6);
    bq.connect(this.mix);
    bq.connect(this.verb);
    return bq;
  }

  private stab(t: number, notes: number[], dur: number, v: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(700, t + dur);
    const g = this.gain(this.mix);
    f.connect(g);
    f.connect(this.verb);
    const end = this.env(g.gain, t, 0.008, dur * 0.4, 0.07 * v, dur * 0.6);
    for (const n of notes) {
      this.osc('sawtooth', hz(n), t, end, f, -6);
      this.osc('sawtooth', hz(n), t, end, f, 6);
    }
  }

  private arp(t: number, midi: number, d: number, v: number): void {
    const g = this.gain(this.arpBus);
    this.osc('square', hz(midi), t, this.env(g.gain, t, 0.003, 0, 0.07 * v, d * 1.4), g);
  }

  private lead(t: number, midi: number, dur: number, v: number, high: boolean): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2800;
    f.connect(this.leadBus);
    const g = this.gain(f);
    const end = this.env(g.gain, t, 0.015, Math.max(0, dur - 0.1), 0.09 * v, 0.14);
    const a = this.osc('sawtooth', hz(midi), t, end, g, -7);
    const b = this.osc('sawtooth', hz(midi), t, end, g, 7);
    // A little vibrato on long notes.
    if (dur > 0.3) {
      for (const o of [a, b]) {
        o.frequency.setValueAtTime(hz(midi), t + 0.18);
        o.frequency.linearRampToValueAtTime(hz(midi) * 1.006, t + dur * 0.6);
        o.frequency.linearRampToValueAtTime(hz(midi) * 0.997, t + dur);
      }
    }
    if (high) {
      const oct = this.gain(g);
      oct.gain.value = 0.3;
      this.osc('square', hz(midi + 12), t, end, oct);
    }
  }

  private trem(t: number, midi: number, v: number): void {
    const g = this.gain(this.mix);
    g.connect(this.verb);
    this.osc('triangle', hz(midi), t, this.env(g.gain, t, 0.004, 0, 0.05 * v, 0.07), g);
  }
}
