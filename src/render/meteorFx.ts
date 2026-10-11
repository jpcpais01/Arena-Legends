import type { Sfx } from '../audio/sfx';
import { css, mix } from './pixel/color';
import { ellipseOutline, type Fx, type View } from './fx';
import { PPM } from './sprite/animator';

/**
 * The Meteor Sigil's meteor, render side: the mark it throws on the ground
 * while it falls, its trail, and its impact. Every skin strikes in its own
 * way (the sim is the same for all of them):
 * - inferno (stock): a molten rock; a fireball dome, lava splash, a rolling
 *   dust wall, a mushroom of smoke and a molten crater that cools;
 * - frost (Frostfall): an ice comet; giant crystals burst out across the
 *   ring, frost mist and snow, a glittering glaze, then the crystals shatter;
 * - hell (Doomcaller): a burning skull; a rune circle opens under it, hellfire
 *   geysers erupt across the ring, black smoke and a brimstone rain;
 * - star (Comet): a comet; a nova of rings and rays, a constellation drawn in
 *   the air over the ring, a shower of shooting stars and stardust.
 */
export type MeteorStyle = 'inferno' | 'frost' | 'hell' | 'star';

/** The look for a meteor sigil skin (unknown skins strike the stock way in their own colours). */
export function meteorStyle(skinId?: string | null): MeteorStyle {
  const name = skinId?.slice(skinId.indexOf('.') + 1);
  return name === 'frostfall' ? 'frost' : name === 'doom' ? 'hell' : name === 'comet' ? 'star' : 'inferno';
}

/** Stock colours (bright, deep); skins pass their own glow pair. */
export const METEOR_GLOW: [number, number] = [0xffe070, 0xc83a1a];

const TAU = Math.PI * 2;

/**
 * The mark on the ground while the meteor falls: the full reach of the blast
 * outlined from the start, a shadow swelling inside it and the outline
 * tightening and flashing as it nears. `k` runs 0..1 over the fall.
 */
export function meteorMark(g: CanvasRenderingContext2D, v: View, x: number, reach: number, k: number, style: MeteorStyle, hi: number, lo: number, time: number): void {
  const cx = Math.round(v.sx(x)), cy = Math.round(v.sy(0));
  const rx = reach * PPM, ry = rx * 0.22;
  // The shadow of what's coming.
  g.globalAlpha = 0.12 + k * 0.3;
  g.fillStyle = style === 'star' ? '#140a30' : style === 'frost' ? '#0a1a30' : '#120608';
  const sr = rx * (0.15 + 0.6 * k * k);
  for (let dy = -Math.ceil(sr * 0.22); dy <= Math.ceil(sr * 0.22); dy++) {
    const w = Math.round(sr * Math.sqrt(Math.max(0, 1 - (dy / (sr * 0.22)) ** 2)));
    g.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
  g.globalAlpha = 1;
  const blink = k > 0.7 && (Math.floor(time * 20) & 1);
  const edge = blink ? '#ffffff' : css(k > 0.5 ? hi : lo);
  ellipseOutline(g, cx, cy, rx, ry, edge, k < 0.25 ? 0.5 : 1);
  // An inner ring closing in on the centre.
  const ir = rx * (1 - k * 0.85);
  if (ir > 3) ellipseOutline(g, cx, cy, ir, ir * 0.22, css(mix(hi, lo, 0.4)), 0.5);
  const spin = time * (style === 'hell' ? -1.4 : 1.1);
  switch (style) {
    case 'hell': {
      // The rune circle opens: glyph marks riding round the ring, a triangle turning inside.
      g.fillStyle = css(k > 0.5 ? hi : lo);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + spin;
        const px = Math.round(cx + Math.cos(a) * rx * 0.86), py = Math.round(cy + Math.sin(a) * ry * 0.86);
        g.fillRect(px - 1, py, 3, 1);
        if (i & 1) g.fillRect(px, py - 1, 1, 1);
      }
      if (k > 0.3) for (let i = 0; i < 3; i++) {
        const a0 = -spin + (i * TAU) / 3, a1 = a0 + TAU / 3;
        line(g, cx + Math.cos(a0) * rx * 0.7, cy + Math.sin(a0) * ry * 0.7, cx + Math.cos(a1) * rx * 0.7, cy + Math.sin(a1) * ry * 0.7);
      }
      break;
    }
    case 'star': {
      // A ring of little stars turning, twinkling in turn.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + spin;
        const px = Math.round(cx + Math.cos(a) * rx), py = Math.round(cy + Math.sin(a) * ry);
        const tw = (Math.floor(time * 8) + i) % 3 === 0;
        g.fillStyle = tw ? '#ffffff' : css(hi);
        g.fillRect(px - 1, py, 3, 1);
        g.fillRect(px, py - 1, 1, 3);
        if (tw && k > 0.4) { g.fillRect(px - 2, py, 5, 1); g.fillRect(px, py - 2, 1, 5); }
      }
      break;
    }
    case 'frost': {
      // Frost creeping in from the rim: little spikes standing up round the ring.
      g.fillStyle = css(hi);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + 0.2;
        const h = Math.round((1 + ((i * 7) % 3)) * Math.min(1, k * 1.6));
        if (!h) continue;
        const px = Math.round(cx + Math.cos(a) * rx * 0.95), py = Math.round(cy + Math.sin(a) * ry * 0.95);
        g.fillRect(px, py - h, 1, h);
      }
      break;
    }
    default: {
      // Heat: embers flickering up off the ground inside the ring.
      g.fillStyle = css(hi);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + i * 1.7;
        if ((Math.floor(time * 14) + i) % 3) continue;
        const d = 0.3 + ((i * 37) % 10) / 15;
        g.fillRect(Math.round(cx + Math.cos(a) * rx * d), Math.round(cy + Math.sin(a) * ry * d) - Math.round(k * 3), 1, 1);
      }
    }
  }
}

function line(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i += 1) {
    const t = n ? i / n : 0;
    g.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, 1);
  }
}

/** The trail behind a falling meteor, one frame's worth (`back` is the angle pointing back up its path). */
export function meteorTrail(fx: Fx, style: MeteorStyle, x: number, y: number, back: number, hi: number, lo: number): void {
  fx.burst({ x, y, count: 2, dir: back, spread: 0.4, speed: [1, 3], life: [0.3, 0.6], color: hi, color2: mix(lo, 0x200a08, 0.4), kind: 'ember', jitter: 0.3 });
  switch (style) {
    case 'frost':
      fx.burst({ x, y, count: 1, dir: back, spread: 0.5, speed: [0.5, 2], life: [0.6, 1.1], color: 0xffffff, color2: hi, kind: 'flake', jitter: 0.35 });
      if (Math.random() < 0.6) fx.burst({ x, y, count: 1, dir: back, spread: 0.15, speed: [3, 5], life: [0.15, 0.3], color: 0xffffff, color2: hi, kind: 'streak', jitter: 0.25 });
      break;
    case 'hell':
      fx.burst({ x, y, count: 2, dir: back, spread: 0.35, speed: [1, 2.5], life: [0.25, 0.5], color: hi, color2: lo, kind: 'flame', jitter: 0.3 });
      if (Math.random() < 0.5) fx.burst({ x, y, count: 1, dir: back, spread: 0.3, speed: [0.5, 1.2], life: [0.5, 0.9], color: 0x3a1418, color2: 0x140608, kind: 'smoke', size: 4, drag: 1, jitter: 0.2 });
      break;
    case 'star':
      fx.burst({ x, y, count: 2, dir: back, spread: 0.3, speed: [1, 3], life: [0.4, 0.8], color: 0xffffff, color2: hi, kind: 'twinkle', jitter: 0.35 });
      if (Math.random() < 0.5) fx.burst({ x, y, count: 1, dir: back, spread: 0.6, speed: [0.3, 1], life: [0.6, 1], color: 0xffd858, color2: lo, kind: 'twinkle', jitter: 0.5 });
      break;
    default:
      fx.burst({ x, y, count: 1, dir: back, spread: 0.3, speed: [1, 2.5], life: [0.25, 0.45], color: 0xfff0a0, color2: hi, kind: 'flame', jitter: 0.25 });
      if (Math.random() < 0.5) fx.burst({ x, y, count: 1, dir: back, spread: 0.3, speed: [0.4, 1], life: [0.6, 1], color: 0x6a5048, color2: 0x2a2028, kind: 'smoke', size: 4, drag: 1, jitter: 0.2 });
  }
}

/** Camera and sound hooks the impact calls into (owned by the battle view). */
export interface ImpactCues {
  play(name: Sfx, k?: number): void;
  shake(amount: number): void;
  flash(color: number, amount: number): void;
}

/**
 * The meteor lands at `x`; `R` is the reach of the blast (metres). The first
 * frame carries the hit; follow-up beats (aftershocks, the shatter, the star
 * shower) play out over the next second or so.
 */
export function meteorImpact(fx: Fx, cues: ImpactCues, style: MeteorStyle, x: number, R: number, hi: number, lo: number): void {
  // Shared: the shock ring racing out across the full reach, the dust wall rolling both ways.
  fx.pulse('groundRing', x, 0, R * 1.05, hi, 0.55);
  fx.later(0.07, () => fx.pulse('groundRing', x, 0, R * 0.75, lo, 0.5));
  for (const dir of [0, Math.PI]) {
    fx.burst({ x, y: 0.25, count: 7, jitter: 0.4, jitterY: 0.15, dir, spread: 0.12, speed: [6, 10], life: [0.5, 0.9], color: style === 'frost' ? 0xe8f4ff : 0xb8a898, color2: style === 'frost' ? 0x8ab0d8 : 0x5a4a50, kind: 'smoke', size: 5, drag: 3 });
  }
  cues.play('explosion');
  cues.shake(1.15);
  switch (style) {
    case 'frost': return frost(fx, cues, x, R, hi, lo);
    case 'hell': return hell(fx, cues, x, R, hi, lo);
    case 'star': return star(fx, cues, x, R, hi, lo);
    default: return inferno(fx, cues, x, R, hi, lo);
  }
}

function inferno(fx: Fx, cues: ImpactCues, x: number, R: number, hi: number, lo: number): void {
  cues.flash(mix(hi, 0xffffff, 0.35), 1.2);
  cues.play('entRumble', 0.9);
  fx.pulse('dome', x, 0, R * 0.62, hi, 0.75, lo);
  fx.pulse('pillar', x, 0, 0.45, hi, 0.4);
  fx.pulse('crater', x, 0, R * 0.7, hi, 2.6, 0xfff0a0);
  fx.pulse('crack', x, 0, R * 1.05, mix(lo, 0x2a1a20, 0.3), 2.4);
  // Lava thrown out in arcs, rock chunks, sparks.
  fx.burst({ x, y: 0.4, count: 46, jitter: 0.6, dir: Math.PI / 2, spread: 1.15, speed: [5, 12], life: [0.6, 1.2], color: 0xfff0a0, color2: lo, gravity: 12, drag: 0.6, kind: 'flame' });
  fx.burst({ x, y: 0.4, count: 18, jitter: 0.5, dir: Math.PI / 2, spread: 1.0, speed: [5, 10], life: [0.7, 1.2], color: 0x5a4038, color2: 0x2a1a1a, gravity: 18, size: 2 });
  fx.burst({ x, y: 0.6, count: 30, jitter: R * 0.4, dir: Math.PI / 2, spread: 0.5, speed: [0.5, 2.5], life: [1.0, 2.0], color: hi, color2: lo, gravity: -0.6, kind: 'ember' });
  // A mushroom of smoke rising off the fireball.
  fx.later(0.16, () => {
    fx.pulse('cloud', x, 1.2, R * 0.55, 0x6a5450, 1.8, 0x3a2a30);
    fx.burst({ x, y: 1.2, count: 10, jitter: 0.8, dir: Math.PI / 2, spread: 0.4, speed: [1.5, 3], life: [0.9, 1.5], color: 0x5a4a48, color2: 0x2a2028, kind: 'smoke', size: 6, drag: 1.2 });
  });
  // Flames licking up across the molten crater as it cools.
  for (let i = 0; i < 8; i++) fx.later(0.25 + i * 0.16, () => {
    fx.burst({ x, y: 0.05, count: 4 - (i >> 2), jitter: R * 0.55, jitterY: 0, dir: Math.PI / 2, spread: 0.2, speed: [1, 2.6], life: [0.3, 0.6], color: 0xfff0a0, color2: lo, kind: 'flame' });
  });
}

function frost(fx: Fx, cues: ImpactCues, x: number, R: number, hi: number, lo: number): void {
  cues.flash(0xf0faff, 1.2);
  cues.play('freeze', 1.2);
  fx.pulse('star', x, 0.6, R * 0.45, hi, 0.3);
  fx.pulse('spires', x, 0, R, mix(hi, lo, 0.45), 1.5, lo);
  fx.pulse('crater', x, 0, R * 0.95, hi, 3, 0xffffff).v = 1;
  fx.pulse('ring', x, 1.1, R * 0.55, 0xffffff, 0.35);
  fx.pulse('cloud', x, 0.2, R * 0.7, 0xd8f0ff, 1.5, 0x8ab8e0);
  // Ice shards sprayed up, snow hanging in the air.
  fx.burst({ x, y: 0.5, count: 40, jitter: 0.4, dir: Math.PI / 2, spread: 1.25, speed: [6, 14], life: [0.35, 0.7], color: 0xffffff, color2: hi, gravity: 8, drag: 1, kind: 'streak' });
  fx.burst({ x, y: 0.5, count: 16, jitter: 0.5, dir: Math.PI / 2, spread: 1.0, speed: [4, 9], life: [0.6, 1.0], color: 0xffffff, color2: lo, gravity: 14, size: 2 });
  fx.burst({ x, y: 2, count: 34, jitter: R, jitterY: 1.6, dir: -Math.PI / 2, spread: 0.6, speed: [0.2, 0.7], life: [1.4, 2.4], color: 0xffffff, color2: hi, kind: 'flake' });
  // The crystals shatter.
  fx.later(1.5 * 0.7, () => {
    cues.play('glass', 1.2);
    fx.burst({ x, y: 0.6, count: 40, jitter: R * 0.9, jitterY: 0.5, dir: Math.PI / 2, spread: 1.4, speed: [2, 7], life: [0.4, 0.8], color: 0xffffff, color2: hi, gravity: 14, drag: 0.8, size: 2 });
    fx.burst({ x, y: 0.6, count: 20, jitter: R * 0.9, jitterY: 0.5, speed: [1, 4], life: [0.3, 0.6], color: 0xffffff, color2: hi, kind: 'twinkle' });
  });
}

function hell(fx: Fx, cues: ImpactCues, x: number, R: number, hi: number, lo: number): void {
  cues.flash(mix(lo, 0xff8040, 0.4), 1.2);
  cues.play('entIgnite', 1);
  fx.pulse('hellgate', x, 0, R, lo, 2.2, hi);
  fx.pulse('crater', x, 0, R * 0.6, lo, 2.4, hi).v = 2;
  fx.pulse('crack', x, 0, R * 1.05, mix(lo, 0x1a0608, 0.2), 2.2);
  fx.pulse('dome', x, 0, R * 0.5, lo, 0.6, 0x1a0608);
  fx.pulse('pillar', x, 0, 0.55, lo, 0.5);
  // Hellfire geysers erupting across the ring, from the middle outward.
  const spots = [0, -0.45, 0.45, -0.85, 0.85];
  spots.forEach((u, i) => fx.later(i * 0.07, () => {
    const gx = x + u * R;
    fx.pulse('jet', gx, 0, 3.4 - Math.abs(u) * 1.4, lo, 0.75, hi);
    fx.burst({ x: gx, y: 0.1, count: 12, jitter: 0.15, jitterY: 0, dir: Math.PI / 2, spread: 0.12, speed: [6, 12], life: [0.35, 0.7], color: 0xfff0a0, color2: lo, gravity: 6, kind: 'flame' });
    fx.burst({ x: gx, y: 0.3, count: 3, jitter: 0.2, dir: Math.PI / 2, spread: 0.2, speed: [2, 4], life: [0.8, 1.3], color: 0x3a1418, color2: 0x0a0406, kind: 'smoke', size: 5, drag: 1.2 });
  }));
  fx.burst({ x, y: 0.6, count: 34, jitter: R * 0.5, dir: Math.PI / 2, spread: 0.6, speed: [0.5, 2], life: [1.0, 2.0], color: hi, color2: lo, gravity: -0.8, kind: 'ember' });
  // A second eruption, and burning brimstone raining back down.
  fx.later(0.4, () => {
    cues.play('fire', 0.8);
    for (const u of [-0.65, 0.65, -0.25, 0.25]) {
      fx.pulse('jet', x + u * R, 0, 1.8, lo, 0.55, hi);
      fx.burst({ x: x + u * R, y: 0.1, count: 7, jitter: 0.12, jitterY: 0, dir: Math.PI / 2, spread: 0.12, speed: [4, 8], life: [0.3, 0.55], color: hi, color2: lo, gravity: 6, kind: 'flame' });
    }
    fx.burst({ x, y: 6.5, count: 18, jitter: R, jitterY: 1.2, dir: -Math.PI / 2 - 0.25, spread: 0.15, speed: [6, 9], life: [0.6, 0.9], color: hi, color2: lo, gravity: 8, kind: 'flame' });
  });
}

function star(fx: Fx, cues: ImpactCues, x: number, R: number, hi: number, lo: number): void {
  const mid = mix(hi, lo, 0.5);
  cues.flash(0xffffff, 1.2);
  cues.play('entStars', 1.2);
  fx.pulse('star', x, 0.8, R * 0.7, 0xffd858, 0.4);
  fx.pulse('rays', x, 0.8, R * 1.1, 0xffffff, 0.35, hi);
  for (let i = 0; i < 3; i++) fx.later(i * 0.08, () => fx.pulse('ring', x, 0.8, R * (0.45 + i * 0.3), i === 1 ? hi : i ? lo : 0xffffff, 0.45));
  fx.pulse('constellation', x, 0, R, 0xffd858, 1.8, mid);
  fx.pulse('crater', x, 0, R * 0.85, mid, 2.6, 0xffffff).v = 3;
  fx.pulse('dome', x, 0, R * 0.42, hi, 0.5, lo);
  // A nova of starlight, stardust drifting down after it.
  fx.burst({ x, y: 0.6, count: 50, jitter: 0.3, dir: Math.PI / 2, spread: 1.5, speed: [3, 10], life: [0.4, 0.9], color: 0xffffff, color2: hi, drag: 2, kind: 'twinkle' });
  fx.burst({ x, y: 3, count: 26, jitter: R, jitterY: 1.4, dir: -Math.PI / 2, spread: 0.4, speed: [0.3, 0.9], life: [1.2, 2.2], color: 0xffd858, color2: lo, kind: 'twinkle' });
  // A shower of shooting stars streaking in over the ring.
  for (let i = 0; i < 6; i++) fx.later(0.22 + i * 0.09, () => {
    const tx = x + (Math.random() * 2 - 1) * R * 0.9;
    const dir = -Math.PI / 2 - 0.5;
    const fall = 0.32;
    fx.burst({ x: tx - Math.cos(dir) * 13 * fall, y: 0.2 - Math.sin(dir) * 13 * fall, count: 1, dir, spread: 0, speed: [13, 13], life: [fall, fall], color: 0xffffff, color2: hi, kind: 'streak' });
    fx.later(fall, () => fx.burst({ x: tx, y: 0.2, count: 6, speed: [1, 3], life: [0.25, 0.5], color: 0xffd858, color2: hi, drag: 2, kind: 'twinkle' }));
  });
}
