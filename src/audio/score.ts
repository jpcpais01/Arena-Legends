/**
 * The battle soundtrack, composed live on the Web Audio API (no audio files).
 *
 * An epic orchestral score in D minor played by a 16-step sequencer: string
 * ensemble, choir, horns, spiccato string ostinato, harp/celesta, timpani,
 * taiko war drums, anvils and cymbals, all synthesized and sent through a
 * concert-hall reverb. Everything that makes it feel urgent follows `target`
 * (0 calm .. 1 one hit from death): which sections play, the chord
 * progression, the tempo, how hard the drums drive and how bright the
 * orchestra sounds. Near death a heartbeat, string tremolo and risers join
 * in. Night overtime lifts the key a semitone and adds war drums. The fight
 * ends on a major chord (a Picardy third).
 *
 * Context-agnostic on purpose: the game runs it on the live AudioContext, and
 * an OfflineAudioContext can render it for previews.
 */

type Quality = 'm' | 'M';
type Chord = [root: number, q: Quality];
/** [step, semitones above the key, length in steps] */
type Note = [number, number, number];

/** Four bars each; one chord per bar. Roots in semitones from the key. */
const CALM: Chord[] = [[0, 'm'], [-4, 'M'], [5, 'm'], [0, 'm']]; // i VI iv i, brooding
const TENSE: Chord[] = [[0, 'm'], [-4, 'M'], [-2, 'M'], [7, 'M']]; // i VI VII V, building
const CLIMAX: Chord[] = [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']]; // i VI III VII, heroic

/** The main theme, for horns over the climax progression. */
const THEME: Note[][] = [
  [[0, 7, 6], [6, 10, 2], [8, 12, 6], [14, 10, 2]],
  [[0, 12, 6], [6, 10, 2], [8, 8, 4], [12, 5, 4]],
  [[0, 7, 6], [6, 10, 2], [8, 15, 6], [14, 14, 2]],
  [[0, 14, 8], [8, 12, 4], [12, 10, 4]],
];
/** A rising call for low horns over the tense progression. */
const CALL: Note[][] = [
  [[0, 0, 4], [4, 3, 4], [8, 7, 8]],
  [[0, 8, 4], [4, 7, 4], [8, 3, 8]],
  [[0, 10, 4], [4, 12, 4], [8, 14, 8]],
  [[0, 11, 8], [8, 7, 8]],
];
/** Celesta answering phrase in the calm section. */
const BELLS: Note[][] = [
  [[0, 19, 4], [4, 17, 4], [8, 15, 8]],
  [[0, 20, 4], [4, 19, 4], [8, 15, 8]],
  [[0, 24, 4], [4, 20, 4], [8, 17, 8]],
  [[0, 15, 6], [6, 14, 2], [8, 12, 8]],
];
/** Spiccato ostinato: indexes into [root, octave, fifth, third] per 16th. */
const OSTINATO = [0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 3, 0, 2, 0];

/** Intensity where tiers 1, 2 and 3 begin. Dropping back needs a margin below. */
export const TIERS = [0.18, 0.44, 0.7];
const KEY = 50; // D3

export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
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

  protected readonly mix: DynamicsCompressorNode;
  protected readonly tone: BiquadFilterNode;
  protected readonly verb: GainNode;
  protected readonly drums: GainNode;
  protected readonly strings: BiquadFilterNode;
  protected readonly spic: BiquadFilterNode;
  protected readonly choir: GainNode;
  protected readonly brass: GainNode;
  protected readonly bells: GainNode;

  protected next = 0;
  protected step = 0;
  protected bar = 0;
  protected bpm = 96;
  protected shift = 0;
  protected wasOvertime = false;
  protected running = false;
  /** Before FIGHT: a low drone only. */
  protected priming = false;

  constructor(protected readonly ctx: BaseAudioContext, protected readonly noise: AudioBuffer) {
    const c = ctx;
    this.out = c.createGain();
    this.tone = c.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 20000;
    this.tone.Q.value = 0.5;
    this.tone.connect(this.out);

    // Glue compressor into a gentle limiter.
    this.mix = c.createDynamicsCompressor();
    this.mix.threshold.value = -18;
    this.mix.ratio.value = 3;
    this.mix.attack.value = 0.015;
    this.mix.release.value = 0.25;
    const limit = c.createDynamicsCompressor();
    limit.threshold.value = -4;
    limit.knee.value = 2;
    limit.ratio.value = 16;
    limit.attack.value = 0.002;
    limit.release.value = 0.12;
    this.mix.connect(limit).connect(this.tone);

    // Concert hall: a generated stereo impulse with a short pre-delay.
    const conv = c.createConvolver();
    const len = Math.floor(c.sampleRate * 2.4);
    const pre = Math.floor(c.sampleRate * 0.02);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = pre; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-6 * (i - pre)) / (len - pre));
    }
    conv.buffer = ir;
    const verbHp = c.createBiquadFilter();
    verbHp.type = 'highpass';
    verbHp.frequency.value = 180;
    this.verb = c.createGain();
    this.verb.gain.value = 0.32;
    this.verb.connect(verbHp).connect(conv).connect(limit);

    this.drums = c.createGain();
    this.drums.connect(this.mix);

    // String ensemble: warm, brighter with intensity.
    this.strings = c.createBiquadFilter();
    this.strings.type = 'lowpass';
    this.strings.frequency.value = 1400;
    this.strings.Q.value = 0.7;
    this.strings.connect(this.mix);
    this.strings.connect(this.verb);

    this.spic = c.createBiquadFilter();
    this.spic.type = 'lowpass';
    this.spic.frequency.value = 1500;
    this.spic.Q.value = 1;
    this.spic.connect(this.mix);
    const spicVerb = c.createGain();
    spicVerb.gain.value = 0.4;
    this.spic.connect(spicVerb).connect(this.verb);

    // Choir: saws through "ah" formants.
    this.choir = c.createGain();
    const choirOut = c.createGain();
    choirOut.gain.value = 1.4;
    for (const [f, q, g] of [[750, 6, 1], [1150, 8, 0.55], [2800, 10, 0.22]] as const) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const gg = c.createGain();
      gg.gain.value = g;
      this.choir.connect(bp).connect(gg).connect(choirOut);
    }
    choirOut.connect(this.mix);
    const choirVerb = c.createGain();
    choirVerb.gain.value = 1.4;
    choirOut.connect(choirVerb).connect(this.verb);

    this.brass = c.createGain();
    this.brass.connect(this.mix);
    const brassVerb = c.createGain();
    brassVerb.gain.value = 0.8;
    this.brass.connect(brassVerb).connect(this.verb);

    this.bells = c.createGain();
    this.bells.connect(this.mix);
    const bellVerb = c.createGain();
    bellVerb.gain.value = 1.6;
    this.bells.connect(bellVerb).connect(this.verb);
  }

  get playing(): boolean { return this.running; }

  /** Low drone while the fighters are introduced. */
  prime(t: number): void {
    this.reset(t);
    this.priming = true;
    this.running = true;
  }

  /** FIGHT: the orchestra comes in on the downbeat at `t`. */
  begin(t: number): void {
    const fresh = !this.running || this.priming;
    if (!fresh) return;
    this.reset(t);
    this.running = true;
    this.crash(t, 0.9);
    this.taiko(t, 1, false);
    this.timpani(t, KEY + this.shift - 12, 1);
  }

  protected reset(t: number): void {
    this.next = t;
    this.step = 0;
    this.bar = 0;
    this.tier = -1;
    this.level = this.target;
    this.priming = false;
    this.wasOvertime = this.overtime;
    this.shift = this.overtime ? 1 : 0;
  }

  /** The fight is over: the whole orchestra lands on a major chord and rings out. */
  finish(t: number): void {
    if (!this.running) return;
    this.running = false;
    const k = KEY + this.shift;
    const major = [0, 4, 7].map((n) => k + n);
    this.taiko(t, 1, false);
    this.timpani(t, k - 12, 1);
    this.crash(t, 1);
    this.anvil(t, 0.6);
    this.stringChord(t, [k - 12, ...major, k + 12, k + 16], 2.6, 0.06);
    this.choirChord(t, [k, k + 4, k + 7, k + 12], 2.6, 0.05);
    for (const n of [k, k + 7, k + 12]) this.horn(t, n, 2.2, 0.8);
    this.bass(t, k - 12, 2.4, 0.6);
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

  protected stepTime(): number {
    // Tempo climbs with intensity: 96 bpm calm, 140 at death's door, +8 in overtime.
    const target = 96 + 44 * this.level + (this.overtime ? 8 : 0);
    this.bpm += (target - this.bpm) * 0.08;
    return 15 / this.bpm;
  }

  protected progression(): Chord[] {
    return this.tier >= 3 ? CLIMAX : this.tier === 2 ? TENSE : CALM;
  }

  protected tick(t: number, d: number): void {
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
    const chord = this.progression()[this.bar % 4];
    const k = KEY + this.shift;
    const tones = triad(chord);
    const root = k - 12 + chord[0];

    // --- Percussion -------------------------------------------------------------
    const BIG = [[0], [0, 8], [0, 3, 8, 11], [0, 3, 6, 8, 10, 11, 14]][tier];
    if (BIG.includes(s) || (crit && s % 4 === 0)) this.taiko(t, s === 0 ? 1 : 0.75, false);
    if (tier >= 1 && (s === 4 || s === 12)) this.taiko(t, 0.8, true);
    if (tier >= 2 && (s === 4 || s === 12)) this.snare(t, 0.8);
    if (tier >= 3 && (s === 4 || s === 12) && this.bar % 2 === 1) this.anvil(t, 0.45);
    if (tier >= 2) {
      const every = tier >= 3 ? 1 : 2;
      if (s % every === 0) this.shaker(t, s % 4 === 2 ? 1 : 0.5);
    }
    // Timpani on the root; a roll into each new phrase.
    if (s === 0 && tier <= 1) this.timpani(t, root, tier === 0 ? 0.5 : 0.75);
    if (phraseEnd && tier >= 1 && s >= 12) {
      const v = 0.35 + 0.5 * ((s - 12) / 4);
      this.timpani(t, root, v);
      this.timpani(t + d / 2, root, v + 0.06);
      if (tier >= 2) this.snare(t, v);
    }
    if (phraseEnd && tier >= 2 && s === 8) this.swell(t, d * 8);
    if (this.overtime && (s === 6 || s === 14 || (tier >= 2 && s === 10))) this.taiko(t, 0.85, false);
    if (crit && (s === 0 || s === 2 || s === 8 || s === 10)) this.heart(t, s % 8 === 0 ? 1 : 0.7);

    // --- Low end ------------------------------------------------------------------
    if (tier <= 1) {
      if (s === 0 || s === 8) this.bass(t, root, d * 7.5, tier === 0 ? 0.45 : 0.55);
    } else if (s % 4 === 0) {
      this.bass(t, root, d * 3.6, s === 0 ? 0.6 : 0.45);
    }

    // --- Spiccato ostinato --------------------------------------------------------
    if (tier >= 1) {
      const notes = [root + 12, root + 24, root + 19, root + 12 + (tones[1] - tones[0])];
      const sixteenths = tier >= 2;
      if (sixteenths || s % 2 === 0) {
        const n = notes[sixteenths ? OSTINATO[s] : OSTINATO[s] === 3 ? 0 : OSTINATO[s]];
        this.spiccato(t, n, d * (sixteenths ? 0.9 : 1.6), s % 4 === 0 ? 1 : 0.7);
      }
    }

    // --- Brass stabs --------------------------------------------------------------
    if (tier >= 2 && (s === 0 || (tier >= 3 && s === 10))) {
      for (const n of tones) this.horn(t, k + n, d * 2.5, 0.55);
    }

    // --- Melodies ---------------------------------------------------------------
    if (tier === 0) {
      for (const [at, n, len] of BELLS[this.bar % 4]) if (at === s) this.bell(t, k + n, 0.7, len * d);
    } else if (tier === 1) {
      // Harp arpeggio rising through the chord.
      if (s % 2 === 0) {
        const harp = [tones[0], tones[1], tones[2], tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[0] + 24, tones[2] + 12];
        this.bell(t, k + harp[s / 2], 0.4, d * 3);
      }
    } else {
      const line = tier >= 3 ? THEME : CALL;
      for (const [at, n, len] of line[this.bar % 4]) {
        if (at !== s) continue;
        const pitch = k + n + 12;
        this.horn(t, pitch, d * len, 1);
        this.horn(t, pitch - 12, d * len, tier >= 3 ? 0.7 : 0.5);
        if (tier >= 3) this.bell(t, pitch + 12, 0.35, d * len);
      }
    }

    // --- Near death -----------------------------------------------------------
    if (crit) {
      const n = k + 24 + tones[1 + (s & 1)];
      this.trem(t, n, 0.7);
      this.trem(t + d / 2, n, 0.5);
      if (phraseEnd && s === 0) this.riser(t, d * 16);
    }
  }

  protected downbeat(t: number, d: number): void {
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
      this.lift(t, true);
      // Re-enter the phrase at its start so the new progression begins on its i chord.
      this.bar = 0;
    } else if (!this.priming && this.bar % 4 === 0 && this.bar > 0 && tier >= 2) {
      this.lift(t, false);
    }
    this.tier = tier;
    this.voiceBar(t, d);
  }

  /** A new section (`big`) or a new phrase at high intensity. */
  protected lift(t: number, big: boolean): void {
    this.crash(t, big ? 1 : 0.55);
    if (big) this.taiko(t, 1, false);
  }

  /** The sustained parts of a bar: pads, strings, choir. */
  protected voiceBar(t: number, d: number): void {
    const lv = this.level;
    const tier = this.tier;
    // Brighten the orchestra with intensity.
    const now = Math.max(t, this.ctx.currentTime);
    this.strings.frequency.setTargetAtTime(this.priming ? 700 : 1100 + 3400 * lv ** 1.4, now, 0.5);
    this.spic.frequency.setTargetAtTime(1200 + 3000 * lv, now, 0.3);

    const chord = this.progression()[this.bar % 4];
    const k = KEY + this.shift;
    const dur = d * 16;
    if (this.priming) {
      this.stringChord(t, [k - 12, k - 5, k], dur, 0.05);
      this.choirChord(t, [k, k + 7], dur, 0.025);
      return;
    }
    const tones = triad(chord).map((n) => k + n);
    // Strings: low root plus the chord, opening upward as it builds.
    const voicing = [k - 12 + chord[0], ...tones];
    if (tier >= 2) voicing.push(tones[1] + 12);
    if (tier >= 3) voicing.push(tones[2] + 12, tones[0] + 24);
    this.stringChord(t, voicing, dur, tier >= 3 ? 0.04 : 0.05);
    // Choir from the second tier, louder and higher near the end and in overtime.
    if (tier >= 1 || this.overtime) {
      const lift = tier >= 3 || lv > 0.9 ? 12 : 0;
      this.choirChord(t, tones.map((n) => n + lift), dur, 0.02 + 0.025 * lv + (this.overtime ? 0.01 : 0));
    }
  }

  // --- Instruments ---------------------------------------------------------------

  protected env(g: AudioParam, t: number, a: number, hold: number, peak: number, rel: number): number {
    peak = Math.max(peak, 0.0002);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + a);
    if (hold > 0) g.setValueAtTime(peak, t + a + hold);
    g.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
    return t + a + hold + rel + 0.02;
  }

  protected osc(type: OscillatorType, f: number, t: number, end: number, dest: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(end);
    return o;
  }

  protected hiss(t: number, end: number, type: BiquadFilterType, f: number, q: number, dest: AudioNode): BiquadFilterNode {
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

  protected gain(dest: AudioNode, pan = 0): GainNode {
    const g = this.ctx.createGain();
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(dest);
    } else g.connect(dest);
    return g;
  }

  /** Big war drum (or the higher, drier one). */
  protected taiko(t: number, v: number, high: boolean): void {
    const f0 = high ? 190 : 82, f1 = high ? 120 : 44;
    const g = this.gain(this.drums);
    const o = this.osc('sine', f0, t, this.env(g.gain, t, 0.003, 0, (high ? 0.5 : 0.95) * v, high ? 0.3 : 0.7), g);
    o.frequency.exponentialRampToValueAtTime(f1, t + (high ? 0.15 : 0.32));
    const n = this.gain(this.drums);
    this.hiss(t, this.env(n.gain, t, 0.002, 0, (high ? 0.3 : 0.4) * v, high ? 0.08 : 0.16), 'lowpass', high ? 1400 : 600, 1, n);
    const r = this.gain(this.verb);
    this.hiss(t, this.env(r.gain, t, 0.002, 0, 0.45 * v, 0.25), 'lowpass', high ? 1200 : 500, 1, r);
  }

  protected timpani(t: number, midi: number, v: number): void {
    while (midi > 50) midi -= 12;
    while (midi < 38) midi += 12;
    const g = this.gain(this.drums);
    const end = this.env(g.gain, t, 0.004, 0, 0.5 * v, 0.9);
    const o = this.osc('sine', hz(midi) * 1.02, t, end, g);
    o.frequency.exponentialRampToValueAtTime(hz(midi), t + 0.08);
    const h = this.gain(this.drums);
    this.osc('sine', hz(midi) * 1.5, t, this.env(h.gain, t, 0.004, 0, 0.12 * v, 0.4), h);
    const n = this.gain(this.verb);
    this.hiss(t, this.env(n.gain, t, 0.002, 0, 0.25 * v, 0.12), 'lowpass', 900, 1, n);
  }

  protected snare(t: number, v: number): void {
    const g = this.gain(this.drums);
    this.hiss(t, this.env(g.gain, t, 0.002, 0, 0.3 * v, 0.14), 'bandpass', 2200, 0.7, g);
    const r = this.gain(this.verb);
    this.hiss(t, this.env(r.gain, t, 0.002, 0, 0.18 * v, 0.12), 'bandpass', 2200, 0.7, r);
  }

  protected shaker(t: number, v: number): void {
    const g = this.gain(this.drums, 0.25);
    this.hiss(t, this.env(g.gain, t, 0.004, 0, 0.07 * v, 0.05), 'bandpass', 6500, 1.2, g);
  }

  /** Struck metal: inharmonic partials ring into the hall. */
  protected anvil(t: number, v: number): void {
    const g = this.gain(this.mix, -0.2);
    g.connect(this.verb);
    const end = this.env(g.gain, t, 0.001, 0, 0.09 * v, 0.5);
    for (const f of [1180, 2950, 4130]) this.osc('sine', f, t, end, g);
  }

  protected crash(t: number, v: number): void {
    const g = this.gain(this.drums);
    this.hiss(t, this.env(g.gain, t, 0.003, 0, 0.16 * v, 2), 'highpass', 4500, 0.5, g);
    const r = this.gain(this.verb);
    this.hiss(t, this.env(r.gain, t, 0.003, 0, 0.16 * v, 1.4), 'highpass', 5000, 0.5, r);
  }

  /** Reversed-cymbal swell into the next phrase. */
  protected swell(t: number, dur: number): void {
    const g = this.gain(this.drums);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    this.hiss(t, t + dur + 0.06, 'highpass', 5000, 0.5, g);
  }

  protected heart(t: number, v: number): void {
    const g = this.gain(this.drums);
    const o = this.osc('sine', 62, t, this.env(g.gain, t, 0.004, 0, 0.7 * v, 0.2), g);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
  }

  protected riser(t: number, dur: number): void {
    const g = this.gain(this.mix);
    g.connect(this.verb);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    const bq = this.hiss(t, t + dur + 0.08, 'bandpass', 400, 2, g);
    bq.frequency.exponentialRampToValueAtTime(7000, t + dur);
  }

  /** Cellos and basses: a round low note. */
  protected bass(t: number, midi: number, dur: number, v: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    f.Q.value = 0.8;
    const g = this.gain(this.mix);
    f.connect(g);
    const end = this.env(g.gain, t, 0.04, Math.max(0, dur - 0.15), 0.3 * v, 0.2);
    this.osc('sawtooth', hz(midi), t, end, f, -6);
    this.osc('sawtooth', hz(midi), t, end, f, 6);
    const sub = this.gain(this.mix);
    this.osc('sine', hz(midi - 12), t, this.env(sub.gain, t, 0.04, Math.max(0, dur - 0.15), 0.3 * v, 0.2), sub);
  }

  /** String section: three slightly detuned players per note, spread in the stereo field. */
  protected stringChord(t: number, notes: number[], dur: number, v: number): void {
    const lo = Math.min(...notes), hi = Math.max(...notes);
    for (const n of notes) {
      const pan = hi > lo ? ((n - lo) / (hi - lo)) * 0.7 - 0.35 : 0;
      const g = this.gain(this.strings, pan);
      const end = this.env(g.gain, t, Math.min(0.4, dur * 0.3), Math.max(0, dur - 0.4), v, 0.9);
      for (const det of [-11, 0, 12]) {
        const o = this.osc('sawtooth', hz(n), t, end, g, det);
        // Bowing vibrato that eases in.
        o.frequency.setValueAtTime(hz(n), t + 0.5);
        o.frequency.linearRampToValueAtTime(hz(n) * 1.003, t + dur * 0.5);
        o.frequency.linearRampToValueAtTime(hz(n) * 0.998, t + dur);
      }
    }
  }

  protected choirChord(t: number, notes: number[], dur: number, v: number): void {
    notes.forEach((n, i) => {
      const g = this.gain(this.choir, i % 2 ? 0.3 : -0.3);
      const end = this.env(g.gain, t, Math.min(0.6, dur * 0.35), Math.max(0, dur - 0.6), v, 1);
      this.osc('sawtooth', hz(n), t, end, g, -14);
      this.osc('sawtooth', hz(n), t, end, g, 14);
    });
  }

  protected spiccato(t: number, midi: number, len: number, v: number): void {
    const g = this.gain(this.spic, -0.15);
    const end = this.env(g.gain, t, 0.005, 0, 0.11 * v, Math.max(0.06, len));
    this.osc('sawtooth', hz(midi), t, end, g, -8);
    this.osc('sawtooth', hz(midi), t, end, g, 8);
  }

  /** French horn: the filter opens as the note blooms; long notes swell. */
  protected horn(t: number, midi: number, dur: number, v: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.2;
    const bright = 900 + 1400 * v + 1200 * this.level;
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(bright, t + 0.09);
    f.frequency.exponentialRampToValueAtTime(bright * 0.7, t + Math.max(0.2, dur));
    const g = this.gain(this.brass, 0.15);
    f.connect(g);
    const end = this.env(g.gain, t, 0.05, Math.max(0, dur - 0.12), 0.07 * v, 0.22);
    for (const det of [-7, 0, 7]) {
      const o = this.osc('sawtooth', hz(midi) * 0.985, t, end, f, det);
      o.frequency.exponentialRampToValueAtTime(hz(midi), t + 0.06);
      if (dur > 0.4) {
        o.frequency.setValueAtTime(hz(midi), t + 0.25);
        o.frequency.linearRampToValueAtTime(hz(midi) * 1.004, t + dur * 0.7);
        o.frequency.linearRampToValueAtTime(hz(midi), t + dur);
      }
    }
  }

  /** Celesta / harp: a bright struck tone with a bell partial. */
  protected bell(t: number, midi: number, v: number, len: number): void {
    const g = this.gain(this.bells, 0.3);
    const end = this.env(g.gain, t, 0.003, 0, 0.06 * v, Math.max(0.5, len * 1.4));
    this.osc('triangle', hz(midi), t, end, g);
    const p = this.gain(this.bells, 0.3);
    this.osc('sine', hz(midi) * 4.01, t, this.env(p.gain, t, 0.002, 0, 0.015 * v, 0.3), p);
  }

  protected trem(t: number, midi: number, v: number): void {
    const g = this.gain(this.strings, 0.2);
    const end = this.env(g.gain, t, 0.01, 0, 0.05 * v, 0.08);
    this.osc('sawtooth', hz(midi), t, end, g, -6);
    this.osc('sawtooth', hz(midi), t, end, g, 6);
  }
}
