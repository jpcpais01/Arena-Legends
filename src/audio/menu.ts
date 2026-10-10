import { Score } from './score';

/**
 * The home screen theme: calm, hopeful and still epic. Same orchestra as the
 * battle score (strings, choir, horns, harp/celesta, timpani) in D major at a
 * slow walk, on a 32-bar loop that breathes on its own: dawn (strings and
 * harp), rise (choir and the theme on low horns), glory (the theme an octave
 * up with full choir and timpani, then a lifting IV–V–iii–vi answer), and rest
 * (strings and bells) before it starts again. No fight state drives it.
 */

type Quality = 'm' | 'M';
type Chord = [root: number, q: Quality];
/** [step, semitones above the key, length in steps] */
type Note = [number, number, number];

const KEY = 50; // D3

/** I – V – vi – IV, bass walking down D A B G. */
const HOME: Chord[] = [[0, 'M'], [-5, 'M'], [-3, 'm'], [-7, 'M']];
/** IV – V – iii – vi: the lift in the glory section. */
const LIFT: Chord[] = [[-7, 'M'], [-5, 'M'], [-8, 'm'], [-3, 'm']];

const THEME: Note[][] = [
  [[0, 4, 4], [4, 7, 4], [8, 12, 6], [14, 11, 2]],
  [[0, 7, 6], [6, 9, 2], [8, 11, 8]],
  [[0, 16, 6], [6, 14, 2], [8, 12, 4], [12, 9, 4]],
  [[0, 12, 4], [4, 14, 4], [8, 17, 8]],
];
const ANSWER: Note[][] = [
  [[0, 9, 6], [6, 12, 2], [8, 14, 8]],
  [[0, 14, 8], [8, 11, 4], [12, 9, 4]],
  [[0, 16, 6], [6, 14, 2], [8, 11, 8]],
  [[0, 14, 4], [4, 12, 4], [8, 9, 8]],
];
/** Harp: chord tones by index (0..5 over two octaves), one per 8th. */
const HARP = [0, 2, 4, 5, 3, 4, 2, 1];

type Section = 'dawn' | 'rise' | 'glory' | 'lift' | 'rest';
/** One section per 4-bar phrase, 8 phrases per loop. */
const FORM: Section[] = ['dawn', 'dawn', 'rise', 'rise', 'glory', 'lift', 'glory', 'rest'];
const ENERGY: Record<Section, number> = { dawn: 0.15, rise: 0.4, glory: 0.8, lift: 0.85, rest: 0.1 };

/** Triad tones placed between the key and an octave above, so voicings stay close. */
const close = ([r, q]: Chord) => [r, r + (q === 'm' ? 3 : 4), r + 7].map((n) => ((n % 12) + 12) % 12);

export class MenuScore extends Score {
  private bpmNow = 76;

  override begin(t: number): void {
    this.reset(t);
    this.running = true;
  }

  protected override stepTime(): number {
    const target = 74 + 6 * this.level;
    this.bpmNow += (target - this.bpmNow) * 0.05;
    return 15 / this.bpmNow;
  }

  protected override tick(t: number, d: number): void {
    const s = this.step;
    const phrase = Math.floor(this.bar / 4) % FORM.length;
    const sec = FORM[phrase];
    const barIn = this.bar % 4;
    const chord = (sec === 'lift' ? LIFT : HOME)[barIn];
    const k = KEY;
    const tones = close(chord).map((n) => k + n);
    const root = k - 12 + chord[0];
    // Ease the energy so filters and loudness swell between sections.
    this.level += (ENERGY[sec] - this.level) * (1 - Math.exp(-d / 3));
    const e = this.level;
    const last = barIn === 3;
    const nextSec = FORM[(phrase + 1) % FORM.length];

    if (s === 0) {
      const now = Math.max(t, this.ctx.currentTime);
      this.strings.frequency.setTargetAtTime(900 + 2600 * e, now, 1);
      const voicing = [root, ...tones];
      if (e > 0.3) voicing.push(tones[1] + 12);
      if (e > 0.7) voicing.push(tones[2] + 12, tones[0] + 24);
      this.stringChord(t, voicing, d * 16, 0.045);
      if (sec !== 'dawn' && sec !== 'rest') this.choirChord(t, tones.map((n) => n + (e > 0.7 ? 12 : 0)), d * 16, 0.015 + 0.025 * e);
      this.bass(t, root, d * 15, 0.35 + 0.3 * e);
      if (sec !== 'dawn' && sec !== 'rest') this.timpani(t, root, 0.25 + 0.4 * e);
      if (barIn === 0 && (sec === 'glory' || sec === 'lift') && FORM[(phrase + FORM.length - 1) % FORM.length] !== sec) this.crash(t, 0.5);
    }

    // Harp in 8ths, celesta sparkles when it's quiet.
    if (s % 2 === 0) {
      const ladder = [...tones, ...tones.map((n) => n + 12)];
      this.bell(t, ladder[HARP[s / 2]] + 12, sec === 'rest' ? 0.3 : 0.45, d * 3);
    }
    if ((sec === 'dawn' || sec === 'rest') && (s === 4 || s === 12) && (this.bar + s) % 3 !== 0) {
      this.bell(t, tones[(this.bar + s / 4) % 3] + 24, 0.4, d * 6);
    }

    // Gentle spiccato pulse once the theme arrives.
    if (e > 0.3 && s % 2 === 0) this.spiccato(t, s % 8 === 4 ? root + 19 : root + 12, d * 1.6, (s % 4 === 0 ? 0.7 : 0.45) * e);

    // The theme: low horns in the rise, soaring in glory, the answer in the lift.
    const line = sec === 'lift' ? ANSWER : sec === 'rise' || sec === 'glory' ? THEME : null;
    if (line) {
      for (const [at, n, len] of line[barIn]) {
        if (at !== s) continue;
        const up = sec === 'rise' ? 0 : 12;
        this.horn(t, k + n + up, d * len, sec === 'rise' ? 0.7 : 1);
        if (sec !== 'rise') this.horn(t, k + n + up - 12, d * len, 0.55);
      }
    }

    // Swell and a timpani roll into the glory.
    if (last && (nextSec === 'glory' || nextSec === 'lift') && nextSec !== sec) {
      if (s === 8) this.swell(t, d * 8);
      if (s >= 12) { this.timpani(t, root, 0.3 + 0.12 * (s - 12)); this.timpani(t + d / 2, root, 0.35 + 0.12 * (s - 12)); }
    }
  }
}
