/**
 * Tiny procedural sound engine on the Web Audio API — no audio files to
 * download. Every sound is a few oscillators / noise bursts shaped by
 * envelopes, so it costs almost nothing and works offline.
 */
export type Sfx =
  | 'swing' | 'swingHeavy' | 'hit' | 'hitHeavy' | 'crit' | 'block' | 'parry' | 'cast' | 'castBig'
  | 'explosion' | 'lightning' | 'whoosh' | 'freeze' | 'ko' | 'revive' | 'shield' | 'roar' | 'ui' | 'start' | 'win'
  | 'select' | 'back' | 'equip' | 'confirm' | 'cork' | 'gulp' | 'glass' | 'firebomb'
  // Skin chests
  | 'rattle' | 'tierUp' | 'chestOpen' | 'flip' | 'gems'
  | 'revealRare' | 'revealMythic' | 'revealLegendary' | 'revealEpic'
  // Pre-fight entrances
  | 'entStep' | 'entSlam' | 'entPoof' | 'entRise' | 'entChoir' | 'entFall' | 'entCheer' | 'entIgnite'
  | 'entWind' | 'entCannon' | 'entBats' | 'entCoins' | 'entRumble' | 'entPortal' | 'entStars' | 'entPhoenix'
  // Big pulls and the forge
  | 'omen' | 'slam' | 'forge' | 'meld' | 'clang' | 'fire' | 'steam'
  // Super attacks: the callout stingers, the power gathering, the blade ring on release
  | 'superSkill' | 'superUlt' | 'charge' | 'shing';

/** Elements of the super attacks, for their impact sounds (see render/supers.ts). */
export type SfxElement = 'steel' | 'fire' | 'storm' | 'arcane' | 'soul' | 'venom' | 'earth' | 'wind';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastPlay = new Map<Sfx, number>();
  muted = false;
  volume = 0.6;

  /** The shared context and noise, once unlocked (the music plays on them too). */
  get context(): AudioContext | null { return this.ctx; }
  get noiseBuffer(): AudioBuffer | null { return this.noise; }

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** 0..1 effects level (master x effects slider). */
  setVolume(v: number): void {
    this.volume = 0.6 * v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, pan = 0): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(g, t, 0.005, peak, dur);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(t: number, dur: number, peak: number, filter: BiquadFilterType, f0: number, f1: number, q = 1, pan = 0): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bq = c.createBiquadFilter();
    bq.type = filter;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, t);
    bq.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, 0.004, peak, dur);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    s.connect(bq).connect(g).connect(p).connect(this.master!);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  /** A brassy stab: a sawtooth through a low-pass that opens and closes (horn hits, stingers). */
  private brass(f: number, t: number, dur: number, peak: number, pan = 0, bright = 3200): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.97, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(f * 1.5, t);
    lp.frequency.exponentialRampToValueAtTime(bright, t + 0.05);
    lp.frequency.exponentialRampToValueAtTime(f * 1.2, t + dur);
    const g = c.createGain();
    this.env(g, t, 0.012, peak, dur);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    o.connect(lp).connect(g).connect(p).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /**
   * A short vowel shout: a buzzy pitch through the formants of an open "ah"
   * that closes toward "eh", with a breath of noise (a fighter's kiai).
   */
  private voice(f0: number, f1: number, t: number, dur: number, peak: number, pan: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.85, t);
    o.frequency.exponentialRampToValueAtTime(f0, t + 0.04);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    // A little vibrato in the throat.
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 22;
    lg.gain.value = f0 * 0.025;
    lfo.connect(lg).connect(o.frequency);
    const out = c.createGain();
    this.env(out, t, 0.02, peak, dur);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    out.connect(p).connect(this.master!);
    for (const [fa, fb, q, gain] of [[760, 560, 9, 1], [1180, 1700, 10, 0.55], [2500, 2400, 12, 0.25]] as const) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(fa, t);
      bp.frequency.linearRampToValueAtTime(fb, t + dur);
      const fg = c.createGain();
      fg.gain.value = gain * 2.2;
      o.connect(bp).connect(fg).connect(out);
    }
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    this.burst(t, dur * 0.7, peak * 0.25, 'bandpass', 1400, 900, 1.5, pan);
  }

  /** A fighter shouts as a super lands; `pitch` 1 is a mid voice (bigger bodies lower). */
  kiai(pan = 0, pitch = 1): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime + 0.005;
    const f = 175 * pitch * (0.96 + Math.random() * 0.08);
    this.voice(f * 1.12, f * 0.82, t, 0.32, 0.32, Math.max(-0.8, Math.min(0.8, pan)));
  }

  /** The signature impact of a super, by element; `k` scales it (follow-up hits of a combo are lighter). */
  superHit(el: SfxElement, pan = 0, k = 1): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime + 0.005;
    pan = Math.max(-0.8, Math.min(0.8, pan));
    // A deep thump under every one of them.
    this.tone('sine', 150, 34, t, 0.45, 0.75 * k, pan);
    this.burst(t, 0.3, 0.45 * k, 'lowpass', 2600, 90, 0.7, pan);
    switch (el) {
      case 'steel':
        // A bright blade ring over the crunch.
        this.tone('triangle', 2350, 2200, t, 0.5, 0.09 * k, pan);
        this.tone('triangle', 3520, 3400, t + 0.01, 0.4, 0.06 * k, pan);
        this.burst(t, 0.1, 0.35 * k, 'highpass', 4000, 2500, 1, pan);
        break;
      case 'wind':
        this.burst(t, 0.35, 0.4 * k, 'bandpass', 3000, 600, 1.4, pan);
        this.tone('triangle', 1800, 1500, t, 0.3, 0.06 * k, pan);
        break;
      case 'fire':
        this.burst(t, 0.7, 0.55 * k, 'lowpass', 3000, 160, 0.6, pan);
        this.burst(t + 0.05, 0.5, 0.2 * k, 'highpass', 3500, 6000, 0.8, pan);
        break;
      case 'storm':
        for (let i = 0; i < 5; i++) this.burst(t + i * 0.025, 0.05, 0.4 * k, 'highpass', 3000, 1500, 0.6, pan);
        this.tone('sawtooth', 70, 45, t, 0.5, 0.18 * k, pan);
        break;
      case 'arcane':
        this.tone('sine', 880, 1320, t, 0.35, 0.12 * k, pan);
        this.tone('sine', 1320, 1980, t + 0.04, 0.35, 0.08 * k, pan);
        this.tone('square', 220, 110, t, 0.2, 0.06 * k, pan);
        break;
      case 'soul':
        // A hollow wail sliding down.
        this.tone('sine', 660, 330, t, 0.6, 0.12 * k, pan);
        this.tone('sine', 668, 334, t, 0.6, 0.1 * k, pan);
        this.burst(t, 0.5, 0.2 * k, 'bandpass', 900, 400, 4, pan);
        break;
      case 'venom':
        this.burst(t, 0.25, 0.35 * k, 'bandpass', 1400, 500, 3, pan);
        this.tone('sine', 420, 180, t + 0.03, 0.15, 0.12 * k, pan);
        break;
      case 'earth':
        this.burst(t, 0.6, 0.6 * k, 'lowpass', 900, 60, 0.6, pan);
        this.tone('square', 70, 40, t, 0.12, 0.12 * k, pan);
        break;
    }
  }

  private ready(): boolean {
    return !!this.ctx && !this.muted && this.ctx.state === 'running';
  }

  /** `pan` in -1..1 (screen position). */
  play(name: Sfx, pan = 0, intensity = 1): void {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // Throttle identical sounds that stack in the same instant.
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < 0.03) return;
    this.lastPlay.set(name, now);
    const t = now + 0.005;
    const k = intensity;
    pan = Math.max(-0.8, Math.min(0.8, pan));
    switch (name) {
      case 'swing': this.burst(t, 0.12, 0.25 * k, 'bandpass', 900, 3200, 1.2, pan); break;
      case 'swingHeavy': this.burst(t, 0.25, 0.35 * k, 'bandpass', 400, 1800, 1.0, pan); break;
      case 'whoosh': this.burst(t, 0.2, 0.22 * k, 'bandpass', 1800, 500, 0.8, pan); break;
      case 'hit':
        this.burst(t, 0.09, 0.5 * k, 'lowpass', 2400, 400, 0.7, pan);
        this.tone('sine', 180, 60, t, 0.12, 0.45 * k, pan);
        break;
      case 'hitHeavy':
        this.burst(t, 0.22, 0.7 * k, 'lowpass', 1800, 120, 0.8, pan);
        this.tone('sine', 120, 38, t, 0.3, 0.8 * k, pan);
        this.tone('square', 90, 40, t, 0.08, 0.12 * k, pan);
        break;
      case 'crit':
        this.burst(t, 0.12, 0.5 * k, 'highpass', 3000, 6000, 0.7, pan);
        this.tone('triangle', 1400, 700, t, 0.15, 0.2 * k, pan);
        break;
      case 'block':
        this.burst(t, 0.08, 0.35 * k, 'bandpass', 1400, 900, 3, pan);
        this.tone('square', 320, 260, t, 0.06, 0.1 * k, pan);
        break;
      case 'parry':
        this.tone('sine', 1760, 1700, t, 0.5, 0.3 * k, pan);
        this.tone('sine', 2640, 2600, t, 0.35, 0.18 * k, pan);
        this.burst(t, 0.06, 0.4 * k, 'highpass', 4000, 3000, 1, pan);
        break;
      case 'cast':
        this.tone('sine', 400, 1200, t, 0.18, 0.18 * k, pan);
        this.tone('triangle', 800, 2000, t + 0.02, 0.14, 0.08 * k, pan);
        break;
      case 'castBig':
        this.tone('sawtooth', 110, 440, t, 0.6, 0.12 * k, pan);
        this.tone('sine', 220, 880, t, 0.6, 0.18 * k, pan);
        break;
      case 'explosion':
        this.burst(t, 0.8, 0.9 * k, 'lowpass', 1500, 60, 0.6, pan);
        this.tone('sine', 90, 30, t, 0.7, 0.9 * k, pan);
        break;
      case 'lightning':
        for (let i = 0; i < 4; i++) this.burst(t + i * 0.03, 0.06, 0.5 * k, 'highpass', 2500, 1500, 0.5, pan);
        this.tone('sawtooth', 60, 40, t, 0.4, 0.2 * k, pan);
        break;
      case 'freeze':
        this.tone('sine', 2200, 3400, t, 0.3, 0.12 * k, pan);
        this.burst(t, 0.3, 0.25 * k, 'highpass', 5000, 8000, 1, pan);
        break;
      case 'ko':
        this.tone('sine', 70, 25, t, 1.2, 1 * k, pan);
        this.burst(t, 0.9, 0.8 * k, 'lowpass', 900, 50, 0.5, pan);
        break;
      case 'revive':
        this.tone('sine', 300, 1200, t, 0.8, 0.25 * k, pan);
        this.burst(t, 0.8, 0.4 * k, 'bandpass', 600, 2400, 0.7, pan);
        break;
      case 'shield':
        this.tone('sine', 600, 900, t, 0.25, 0.12 * k, pan);
        break;
      // Potions: a thumb-popped cork, two gulps, a bottle breaking.
      case 'cork':
        this.tone('sine', 900, 380, t, 0.05, 0.3 * k, pan);
        this.burst(t, 0.03, 0.2 * k, 'bandpass', 2400, 1600, 2, pan);
        break;
      case 'gulp':
        this.tone('sine', 260, 150, t, 0.09, 0.32 * k, pan);
        this.tone('sine', 240, 140, t + 0.16, 0.09, 0.28 * k, pan);
        this.tone('triangle', 520, 900, t + 0.34, 0.12, 0.08 * k, pan);
        break;
      case 'glass':
        this.burst(t, 0.18, 0.3 * k, 'highpass', 5000, 3000, 1.2, pan);
        this.tone('triangle', 2400, 1900, t, 0.12, 0.08 * k, pan);
        this.tone('triangle', 3100, 2600, t + 0.03, 0.1, 0.06 * k, pan);
        break;
      case 'firebomb':
        this.burst(t, 0.12, 0.3 * k, 'highpass', 5000, 3000, 1.2, pan);
        this.burst(t + 0.02, 0.6, 0.6 * k, 'lowpass', 2200, 200, 0.7, pan);
        this.tone('sine', 140, 50, t, 0.4, 0.5 * k, pan);
        break;
      case 'roar':
        this.tone('sawtooth', 140, 80, t, 0.5, 0.2 * k, pan);
        this.burst(t, 0.5, 0.35 * k, 'bandpass', 500, 300, 1.5, pan);
        break;
      case 'ui': this.tone('triangle', 660, 880, t, 0.06, 0.12); break;
      // Menu picks: a two-note blip up, a soft step down, a metal clink, a little fanfare.
      case 'select':
        this.tone('square', 520, 520, t, 0.05, 0.05);
        this.tone('square', 780, 780, t + 0.05, 0.07, 0.05);
        break;
      case 'back': this.tone('triangle', 520, 330, t, 0.09, 0.12); break;
      case 'equip':
        this.burst(t, 0.12, 0.18, 'highpass', 3000, 5000, 2);
        this.tone('triangle', 1320, 990, t, 0.14, 0.08);
        this.tone('square', 330, 300, t, 0.06, 0.04);
        break;
      case 'confirm':
        [392, 523, 659].forEach((f, i) => this.tone('square', f, f, t + i * 0.06, 0.12, 0.05));
        this.tone('triangle', 784, 784, t + 0.18, 0.3, 0.1);
        break;
      case 'start':
        this.tone('sawtooth', 220, 110, t, 0.6, 0.15);
        this.burst(t, 0.6, 0.4, 'lowpass', 800, 100, 0.6);
        this.tone('sine', 110, 55, t, 0.8, 0.5);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.09, 0.35, 0.16));
        break;
      // Skin chests. `intensity` is the tier step for tierUp (1, 2, 3: each one higher).
      case 'rattle':
        this.burst(t, 0.07, 0.22, 'bandpass', 700, 500, 4, pan);
        this.tone('square', 140, 110, t, 0.05, 0.05, pan);
        break;
      case 'tierUp': {
        const f = 392 * Math.pow(2, (k - 1) * 4 / 12);
        this.tone('square', f, f * 2, t, 0.22, 0.07);
        this.tone('triangle', f * 1.5, f * 3, t + 0.03, 0.3, 0.1);
        this.burst(t, 0.35, 0.18, 'highpass', 3000, 9000, 1);
        break;
      }
      case 'chestOpen':
        this.burst(t, 0.5, 0.6, 'lowpass', 2400, 120, 0.7);
        this.tone('sine', 110, 40, t, 0.6, 0.7);
        this.burst(t + 0.02, 0.4, 0.3, 'highpass', 4000, 9000, 0.8);
        break;
      case 'flip':
        this.burst(t, 0.06, 0.2, 'bandpass', 2600, 1400, 2);
        this.tone('triangle', 880, 1320, t, 0.05, 0.05);
        break;
      case 'gems':
        [1568, 2093, 2637].forEach((f, i) => this.tone('square', f, f, t + i * 0.05, 0.08, 0.035));
        this.tone('triangle', 3136, 3136, t + 0.15, 0.25, 0.05);
        break;
      case 'revealRare':
        [523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.07, 0.3, 0.14));
        break;
      case 'revealMythic':
        [587, 740, 880, 1175].forEach((f, i) => this.tone('square', f, f, t + i * 0.06, 0.28, 0.06));
        this.tone('triangle', 1760, 1760, t + 0.24, 0.6, 0.1);
        this.burst(t + 0.2, 0.5, 0.12, 'highpass', 5000, 9000, 1);
        break;
      case 'revealLegendary':
        [392, 523, 659, 784, 1046].forEach((f, i) => this.tone('square', f, f, t + i * 0.07, 0.3, 0.06));
        [784, 988, 1175].forEach((f) => this.tone('triangle', f, f, t + 0.35, 1.1, 0.08));
        for (let i = 0; i < 6; i++) this.tone('sine', 2093 + i * 260, 2093 + i * 260, t + 0.35 + i * 0.07, 0.25, 0.04);
        this.tone('sine', 98, 49, t + 0.35, 0.9, 0.4);
        break;
      case 'revealEpic':
        this.tone('sine', 65, 33, t, 1.4, 0.8);
        this.burst(t, 1.2, 0.5, 'lowpass', 1600, 80, 0.6);
        [330, 415, 494, 659, 831, 988].forEach((f, i) => this.tone('square', f, f, t + 0.1 + i * 0.06, 0.4, 0.05));
        [659, 831, 988, 1319].forEach((f) => this.tone('triangle', f, f * 1.003, t + 0.5, 1.8, 0.08));
        for (let i = 0; i < 10; i++) this.tone('sine', 1760 + (i % 5) * 330, 1760 + (i % 5) * 330, t + 0.5 + i * 0.09, 0.3, 0.035);
        break;
      // Entrances: a boot in the sand, a heavy landing, a smoke pop, a dark swell,
      // a heavenly chord, something big falling in, the crowd, a fire whoomph.
      case 'entStep':
        this.burst(t, 0.07, 0.16 * k, 'lowpass', 900, 200, 0.8, pan);
        this.tone('sine', 120, 70, t, 0.08, 0.18 * k, pan);
        break;
      case 'entSlam':
        this.tone('sine', 110, 32, t, 0.55, 0.95 * k, pan);
        this.burst(t, 0.45, 0.7 * k, 'lowpass', 1800, 70, 0.6, pan);
        this.burst(t, 0.08, 0.35 * k, 'highpass', 3000, 1500, 0.8, pan);
        break;
      case 'entPoof':
        this.burst(t, 0.05, 0.4 * k, 'highpass', 4000, 2500, 1, pan);
        this.burst(t + 0.02, 0.55, 0.45 * k, 'bandpass', 1400, 300, 0.6, pan);
        this.tone('sine', 180, 60, t, 0.25, 0.35 * k, pan);
        break;
      case 'entRise':
        this.tone('sawtooth', 55, 110, t, 0.9, 0.14 * k, pan);
        this.tone('sine', 110, 220, t, 0.9, 0.2 * k, pan);
        this.burst(t, 0.9, 0.22 * k, 'bandpass', 300, 1200, 2, pan);
        break;
      case 'entChoir':
        [262, 330, 392, 523].forEach((f, i) => {
          this.tone('triangle', f, f * 1.004, t + i * 0.04, 1.6, 0.07 * k, pan);
          this.tone('sine', f * 2, f * 2.01, t + 0.1 + i * 0.04, 1.4, 0.03 * k, pan);
        });
        this.burst(t, 1.4, 0.08 * k, 'highpass', 6000, 9000, 1, pan);
        break;
      case 'entFall':
        this.burst(t, 0.7, 0.3 * k, 'bandpass', 3000, 400, 0.9, pan);
        this.tone('sawtooth', 900, 150, t, 0.65, 0.06 * k, pan);
        break;
      case 'entCheer':
        // A crowd swelling and fading: wide noise bands that rise a little.
        this.burst(t, 1.1, 0.16 * k, 'bandpass', 700, 1100, 0.7, pan * 0.5);
        this.burst(t + 0.08, 0.9, 0.1 * k, 'bandpass', 1800, 2600, 0.9, -pan * 0.5);
        break;
      case 'entWind':
        this.burst(t, 1.1, 0.3 * k, 'bandpass', 300, 1400, 2.5, pan);
        this.burst(t + 0.2, 0.9, 0.18 * k, 'bandpass', 1600, 700, 3, -pan);
        break;
      case 'entCannon':
        this.tone('sine', 140, 35, t, 0.5, 0.9 * k, pan);
        this.burst(t, 0.35, 0.8 * k, 'lowpass', 2500, 120, 0.7, pan);
        this.burst(t + 0.05, 0.6, 0.25 * k, 'bandpass', 2400, 600, 1, pan);
        break;
      case 'entBats':
        // Flutter: quick soft wing beats and a few high squeaks.
        for (let i = 0; i < 9; i++) this.burst(t + i * 0.055, 0.04, 0.16 * k, 'bandpass', 900 + (i % 3) * 300, 700, 2, pan);
        for (let i = 0; i < 3; i++) this.tone('square', 3200 + i * 500, 2600 + i * 400, t + 0.08 + i * 0.13, 0.05, 0.025 * k, pan);
        break;
      case 'entCoins':
        for (let i = 0; i < 7; i++) {
          const f = 1800 + ((i * 7) % 5) * 260;
          this.tone('square', f, f, t + i * 0.07, 0.07, 0.03 * k, pan);
          this.tone('triangle', f * 1.5, f * 1.5, t + i * 0.07 + 0.02, 0.12, 0.04 * k, pan);
        }
        break;
      case 'entRumble':
        this.tone('sine', 45, 35, t, 0.9, 0.6 * k, pan);
        this.burst(t, 0.9, 0.45 * k, 'lowpass', 300, 120, 0.8, pan);
        break;
      case 'entPortal':
        this.tone('sine', 180, 520, t, 0.9, 0.18 * k, pan);
        this.tone('sawtooth', 90, 260, t, 0.9, 0.06 * k, pan);
        this.tone('triangle', 1400, 700, t + 0.1, 0.8, 0.05 * k, pan);
        this.burst(t, 0.9, 0.18 * k, 'bandpass', 500, 3000, 4, pan);
        break;
      case 'entStars':
        [1047, 1319, 1568, 2093, 1568, 2637].forEach((f, i) => this.tone('sine', f, f, t + i * 0.11, 0.35, 0.05 * k, pan));
        this.tone('triangle', 523, 523, t, 1.2, 0.04 * k, pan);
        break;
      case 'entPhoenix':
        // A screech that rises and cracks, over a roar of fire.
        this.tone('sawtooth', 900, 2200, t, 0.35, 0.09 * k, pan);
        this.tone('square', 1300, 2900, t + 0.05, 0.3, 0.04 * k, pan);
        this.burst(t, 0.8, 0.4 * k, 'lowpass', 900, 2600, 0.7, pan);
        break;
      case 'entIgnite':
        this.burst(t, 0.8, 0.55 * k, 'lowpass', 600, 2400, 0.7, pan);
        this.tone('sine', 70, 140, t, 0.6, 0.4 * k, pan);
        this.burst(t + 0.15, 0.6, 0.25 * k, 'highpass', 2500, 5000, 0.8, pan);
        break;
      // Super attacks.
      case 'superSkill':
        // A swish up into a two-chord brass hit (the name slamming on screen).
        this.burst(t, 0.16, 0.3, 'bandpass', 600, 4000, 1.2, pan);
        [293.7, 440, 587.3].forEach((f) => this.brass(f, t + 0.1, 0.18, 0.07, pan));
        [349.2, 523.3, 698.5].forEach((f) => this.brass(f, t + 0.26, 0.42, 0.08, pan, 4200));
        this.tone('sine', 98, 49, t + 0.1, 0.4, 0.4, pan);
        break;
      case 'superUlt':
        // A boom, a rising sweep and a big held chord with sparkle on top.
        this.tone('sine', 70, 28, t, 1.1, 0.9);
        this.burst(t, 0.9, 0.5, 'lowpass', 1400, 60, 0.6);
        this.burst(t, 0.45, 0.25, 'bandpass', 400, 5000, 1);
        [146.8, 220, 293.7, 349.2, 440].forEach((f) => this.brass(f, t + 0.12, 0.9, 0.06, 0, 3800));
        [1175, 1480, 1760, 2349].forEach((f, i) => this.tone('sine', f, f, t + 0.2 + i * 0.06, 0.4, 0.04));
        break;
      case 'charge':
        // Power gathering: a shimmering rise.
        this.tone('sawtooth', 160 * k, 640 * k, t, 0.45, 0.05, pan);
        this.tone('sine', 320 * k, 1280 * k, t, 0.45, 0.12, pan);
        this.burst(t, 0.45, 0.12, 'bandpass', 800, 5000, 2, pan);
        break;
      case 'shing':
        this.burst(t, 0.08, 0.4, 'highpass', 5000, 3000, 1, pan);
        this.burst(t, 0.22, 0.35, 'bandpass', 900, 3600, 1.1, pan);
        this.tone('triangle', 2640, 2500, t, 0.35, 0.07, pan);
        break;
      // A swell under the chest before a legendary or epic: `intensity` 2 for epic.
      case 'omen': {
        const d = k > 1 ? 1.5 : 1.1;
        this.tone('sawtooth', 55, 110 * k, t, d, 0.12);
        this.tone('sine', 41, 82, t, d, 0.5);
        this.burst(t, d, 0.25, 'bandpass', 200, 3200, 3);
        for (let i = 0; i < 8; i++) this.tone('square', 220 * Math.pow(2, i / 6), 220 * Math.pow(2, i / 6), t + (i / 8) * d, 0.08, 0.03);
        break;
      }
      // The tier name lands.
      case 'slam':
        this.tone('sine', 90, 30, t, 0.7, 0.9);
        this.burst(t, 0.45, 0.6, 'lowpass', 3000, 90, 0.8);
        this.tone('square', 196, 98, t, 0.25, 0.08);
        this.burst(t + 0.01, 0.25, 0.25, 'highpass', 6000, 9000, 0.7);
        break;
      // Spares melting together: three anvil strikes.
      case 'forge':
        for (let i = 0; i < 3; i++) {
          const at = t + i * 0.16;
          this.tone('triangle', 1180 + i * 90, 1150 + i * 90, at, 0.35, 0.09);
          this.tone('square', 2350 + i * 170, 2300 + i * 170, at, 0.12, 0.03);
          this.burst(at, 0.08, 0.3, 'bandpass', 3500, 2500, 6);
        }
        break;
      // A hammer blow on hot metal: `intensity` 1..3, each a little brighter and heavier.
      case 'clang': {
        const f = 1040 * Math.pow(2, (k - 1) * 2 / 12);
        this.tone('triangle', f, f * 0.98, t, 0.5 + k * 0.1, 0.1 + k * 0.02);
        this.tone('square', f * 2.01, f * 2, t, 0.14, 0.035);
        this.tone('sine', f * 2.76, f * 2.7, t, 0.35, 0.05);
        this.burst(t, 0.07, 0.35 + k * 0.08, 'bandpass', 3800, 2600, 5);
        this.tone('sine', 140, 60, t, 0.18, 0.25 + k * 0.08);
        break;
      }
      // The furnace roaring up.
      case 'fire':
        this.burst(t, 1.1, 0.4, 'lowpass', 400, 1600, 0.7);
        this.burst(t + 0.05, 0.9, 0.12, 'bandpass', 1800, 900, 1.5);
        this.tone('sine', 55, 70, t, 1, 0.3);
        break;
      // Quenching: a long hiss.
      case 'steam':
        this.burst(t, 0.9, 0.35, 'highpass', 5000, 2500, 0.8);
        this.burst(t, 0.25, 0.25, 'bandpass', 1200, 600, 2);
        break;
      case 'meld':
        this.burst(t, 0.5, 0.3, 'bandpass', 500, 4000, 2);
        this.tone('sine', 220, 880, t, 0.5, 0.12);
        break;
    }
  }
}

export const sfx = new AudioEngine();
