import type { Fx } from './fx';
import type { GlFx, Light } from './glfx';
import type { SuperLook } from './supers';

/**
 * Signature animations for each main-weapon super, drawn mostly with the
 * shader light layer: blade arcs of light, beams, rings, shockwaves and an
 * impact frame on the blow, plus a few pixel sparks in the skin's own
 * particle (flames, petals, snowflakes...). Everything is in the look's
 * colours, so a skinned weapon plays its super in the skin's colours.
 * On devices without WebGL2 the lights are skipped and the sparks remain.
 */
export interface SuperHost {
  fx: Fx;
  gl: GlFx;
  shake(amount: number): void;
  /** Runs `fn` after `seconds` of battle time (slowed with the slow motion). */
  later(seconds: number, fn: () => void): void;
}

/** Where a fighter stands (feet), its facing, and its weapon tip if known (world). */
export interface At { x: number; y: number; facing: number; tip?: [number, number] }

const WHITE = 0xffffff;
const UP = Math.PI / 2;

/** Mirrors a right-facing angle for a fighter facing left. */
function ang(a: number, face: number): number {
  return face > 0 ? a : Math.PI - a;
}

function arc(h: SuperHost, look: SuperLook, x: number, y: number, face: number, r: number, start: number, sweep: number, w: number, life: number, extra: Partial<Light> = {}): void {
  h.gl.add({ kind: 'arc', x, y, r0: r, r1: r * 1.08, w, rot: ang(start, face), sweep: sweep * face, hi: look.hi, lo: look.lo, life, power: 1.25, fin: 0, ...extra });
}

function beam(h: SuperHost, look: SuperLook, x: number, y: number, rot: number, len: number, w: number, life: number, extra: Partial<Light> = {}): void {
  h.gl.add({ kind: 'beam', x, y, r0: len * 0.35, r1: len, w, rot, hi: look.hi, lo: look.lo, life, power: 1.2, fin: 0, ...extra });
}

function glow(h: SuperHost, x: number, y: number, r0: number, r1: number, hi: number, lo: number, life: number, power = 1, extra: Partial<Light> = {}): void {
  h.gl.add({ kind: 'glow', x, y, r0, r1, hi, lo, life, power, ...extra });
}

function sparks(fx: Fx, look: SuperLook, x: number, y: number, count: number, speed: [number, number] = [2.5, 6.5], dir?: number, spread?: number): void {
  fx.burst({ x, y, count, dir, spread, jitter: 0.1, speed, life: [0.3, 0.65], color: look.hi, color2: look.lo, drag: 2.4, kind: look.kind });
}

function dust(fx: Fx, x: number, count: number): void {
  fx.burst({ x, y: 0.08, count, jitter: 0.35, dir: UP, spread: 1.1, speed: [1, 2.6], life: [0.4, 0.75], color: 0xd8c8b0, color2: 0x8a7a70, kind: 'smoke', size: 3, drag: 1.6 });
}

/** A flat ring of light racing out along the ground, with the floor's refraction under it. */
function groundShock(h: SuperHost, look: SuperLook, x: number, r: number, life = 0.5): void {
  h.gl.add({ kind: 'ring', x, y: 0.05, r0: r * 0.15, r1: r, w: 0.07, squash: 0.22, hi: look.hi, lo: look.lo, life, power: 1.1, fin: 0 });
  h.gl.shock({ x, y: 0.1, r: r * 0.9, amp: 3, life: life * 0.9, hi: look.lo, squash: 0.35 });
}

/**
 * The blow that lands: an impact frame, a shockwave that bends the picture,
 * a burst of light with a long lens streak, and the screen smearing in.
 */
function blow(h: SuperHost, look: SuperLook, face: number, x: number, y: number, size = 1): void {
  const { gl } = h;
  gl.impactFrame(look.hi, mixInk(look.lo));
  gl.shock({ x, y, r: 2.6 * size, amp: 6, life: 0.5, hi: look.hi, dir: face, squash: 0.8 });
  gl.zoomBlur(x, y, 0.035 * size, 0.22);
  glow(h, x, y, 0.3, 0.8 * size, look.hi, look.lo, 0.35, 0.6, { fin: 0, real: true });
  gl.add({ kind: 'ring', x, y, r0: 0.2, r1: 1.9 * size, w: 0.07, squash: 0.85, hi: look.hi, lo: look.lo, life: 0.4, power: 0.9, fin: 0, real: true });
  gl.add({ kind: 'flare', x, y, r0: 1.0 * size, r1: 3.2 * size, w: 0.045, hi: look.hi, lo: look.lo, life: 0.45, power: 0.9, fin: 0, real: true });
  gl.add({ kind: 'rays', x, y, r0: 0.8 * size, r1: 2.2 * size, hi: look.hi, lo: look.lo, life: 0.35, power: 0.4, seed: Math.random() * 50, real: true });
  sparks(h.fx, look, x, y, Math.round(14 * size));
}

/** A combo's follow-up hit: a small flash of light and a few sparks. */
function tap(h: SuperHost, look: SuperLook, x: number, y: number): void {
  glow(h, x, y, 0.3, 0.8, look.hi, look.lo, 0.22, 0.8, { fin: 0 });
  h.gl.add({ kind: 'star', x, y, r0: 0.5, r1: 0.8, w: 0.04, hi: WHITE, lo: look.hi, life: 0.16, power: 0.9, fin: 0 });
  sparks(h.fx, look, x, y, 5, [2, 4.5]);
}

/** A very dark version of the colour, for the impact frame's ink. */
function mixInk(c: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return (Math.round(r * 0.12 + 6) << 16) | (Math.round(g * 0.1 + 4) << 8) | Math.round(b * 0.16 + 14);
}

/** Power gathering: a soft light swelling round the body until the strike comes out. */
export function superWindup(h: SuperHost, look: SuperLook, follow: () => [number, number] | null, len: number): void {
  h.gl.add({ kind: 'glow', x: 0, y: 0, follow, r0: 0.7, r1: 1.25, hi: look.hi, lo: look.lo, life: len + 0.25, power: 0.5, fin: 0.7 });
  h.gl.vignette(look.lo, 0.55, len + 0.9);
}

/** The strike coming out. */
export function superRelease(h: SuperHost, id: string, look: SuperLook, f: At): void {
  const { fx, gl } = h, face = f.facing, fwd = face > 0 ? 0 : Math.PI;
  const tip = f.tip ?? [f.x + face * 0.5, f.y + 1.4];
  // The glint on the weapon as it goes.
  gl.add({ kind: 'star', x: tip[0], y: tip[1], r0: 0.4, r1: 1.0, w: 0.035, hi: WHITE, lo: look.hi, life: 0.22, power: 1.2, fin: 0 });
  switch (id) {
    case 'rising_cleave':
      arc(h, look, f.x + face * 0.55, 1.0, face, 1.25, -1.2, 2.5, 0.16, 0.34);
      break;
    case 'crescent_chop':
      arc(h, look, f.x + face * 0.9, 1.05, face, 1.75, 2.0, -2.7, 0.2, 0.4);
      break;
    case 'skull_crack':
      arc(h, look, f.x + face * 0.6, 1.0, face, 1.15, 1.9, -2.3, 0.2, 0.32);
      break;
    case 'grave_harvest':
      arc(h, look, f.x + face * 0.45, 1.1, face, 1.65, 2.3, -3.0, 0.13, 0.42);
      arc(h, look, f.x + face * 0.45, 1.1, face, 1.4, 2.3, -3.0, 0.06, 0.42, { delay: 0.05, power: 0.8, hi: look.lo, lo: look.lo });
      break;
    case 'iaido':
      // The draw: a streak of light on the scabbard and the line of the dash ahead.
      gl.add({ kind: 'flare', x: f.x + face * 0.4, y: 1.0, r0: 1.2, r1: 2.6, w: 0.04, hi: WHITE, lo: look.hi, life: 0.25, power: 1.1, fin: 0 });
      beam(h, look, f.x, 1.0, fwd, 4.6, 0.05, 0.3, { power: 0.9 });
      fx.burst({ x: f.x, y: 1.0, count: 8, jitter: 0.1, jitterY: 0.4, dir: fwd + Math.PI, spread: 0.06, speed: [5, 9], life: [0.12, 0.22], color: WHITE, color2: look.hi, kind: 'streak' });
      break;
    case 'fleche':
    case 'skewer': {
      const thick = id === 'skewer' ? 0.13 : 0.08;
      beam(h, look, f.x + face * 0.3, 1.2, fwd, id === 'skewer' ? 3.0 : 2.6, thick, 0.26);
      gl.add({ kind: 'flare', x: f.x + face * 1.2, y: 1.2, r0: 0.8, r1: 1.8, w: 0.035, hi: look.hi, lo: look.lo, life: 0.22, power: 0.9, fin: 0 });
      dust(fx, f.x - face * 0.3, 5);
      break;
    }
    case 'whirlwind':
      arc(h, look, f.x, 1.0, face, 1.3, -0.4, Math.PI * 2, 0.12, 0.42);
      groundShock(h, look, f.x, 1.8, 0.45);
      break;
    case 'venom_flurry':
      arc(h, look, f.x + face * 0.5, 1.15, face, 0.8, -0.8, 1.9, 0.1, 0.2);
      break;
    case 'flame_wave':
    case 'bone_spikes':
    case 'hex_orb':
    case 'power_shot':
    case 'chain_hook':
      glow(h, tip[0], tip[1], 0.3, 1.0, look.hi, look.lo, 0.3, 1.1, { fin: 0 });
      if (id === 'power_shot') gl.add({ kind: 'flare', x: tip[0], y: tip[1], r0: 1, r1: 3, w: 0.04, hi: look.hi, lo: look.lo, life: 0.3, power: 1.1, fin: 0 });
      if (id === 'flame_wave' || id === 'bone_spikes') groundShock(h, look, f.x + face * 0.6, 1.6, 0.4);
      break;
    case 'ground_slam':
      groundShock(h, look, f.x + face * 0.8, 3.2, 0.55);
      glow(h, f.x + face * 0.8, 0.2, 0.4, 1.2, look.hi, look.lo, 0.35, 1, { fin: 0 });
      dust(fx, f.x + face * 0.8, 10);
      h.shake(0.3);
      break;
    case 'thunderclap':
      // Thunder bursts round the caster: a white-hot dome and the air itself rippling out.
      glow(h, f.x, 1.1, 0.6, 2.0, look.hi, look.lo, 0.4, 1.3, { fin: 0 });
      gl.shock({ x: f.x, y: 1.0, r: 3.2, amp: 7, life: 0.55, hi: look.hi, squash: 0.75 });
      gl.add({ kind: 'ring', x: f.x, y: 1.0, r0: 0.4, r1: 2.6, w: 0.08, hi: look.hi, lo: look.lo, life: 0.4, power: 1.1, fin: 0 });
      gl.add({ kind: 'rays', x: f.x, y: 1.1, r0: 1.2, r1: 3, hi: look.hi, lo: look.lo, life: 0.35, power: 0.6, seed: Math.random() * 50 });
      groundShock(h, look, f.x, 2.4, 0.45);
      break;
  }
}

/**
 * Where it lands. `first` is the opening hit (combo follow-ups are lighter
 * and skip the set pieces); `fromX` is where the attacker stands.
 */
export function superImpactFx(h: SuperHost, id: string, look: SuperLook, x: number, y: number, face: number, first: boolean, fromX: number): void {
  const { fx, gl } = h, fwd = face > 0 ? 0 : Math.PI;
  if (!first) {
    if (id === 'whirlwind') arc(h, look, x, y, Math.random() < 0.5 ? face : -face, 0.9, -0.6, 2.2, 0.09, 0.2, { power: 0.9 });
    else if (id === 'venom_flurry') arc(h, look, x - face * 0.2, y, face, 0.7, Math.random() < 0.5 ? -0.9 : 1.1, Math.random() < 0.5 ? 1.8 : -1.8, 0.08, 0.18, { power: 0.9 });
    tap(h, look, x, y);
    return;
  }
  switch (id) {
    case 'rising_cleave':
      blow(h, look, face, x, y);
      beam(h, look, x, 0, UP, 3.8, 0.2, 0.45, { power: 0.75, delay: 0.03 });
      break;
    case 'crescent_chop':
      blow(h, look, face, x, y, 1.15);
      groundShock(h, look, x, 3.2, 0.6);
      dust(fx, x, 10);
      break;
    case 'skull_crack':
      blow(h, look, face, x, y + 0.4);
      gl.add({ kind: 'star', x, y: y + 0.6, r0: 0.6, r1: 1.4, w: 0.05, hi: WHITE, lo: look.hi, life: 0.3, power: 1.2, fin: 0 });
      groundShock(h, look, x, 2.2, 0.5);
      fx.burst({ x, y: y + 0.6, count: 8, speed: [1.5, 3], life: [0.5, 0.9], color: 0xfff0a0, color2: look.hi, drag: 2.5, kind: 'twinkle' });
      dust(fx, x, 6);
      break;
    case 'grave_harvest': {
      blow(h, look, face, x, y);
      // Their soul is torn out and streams back into the reaper.
      const toward = fromX < x ? Math.PI : 0, d = Math.abs(fromX - x);
      fx.burst({ x, y, count: 18, jitter: 0.2, jitterY: 0.3, dir: toward, spread: 0.2, speed: [d * 2.2, d * 3], life: [0.3, 0.45], color: look.hi, color2: look.lo, drag: 0.8, kind: look.kind });
      h.later(0.3, () => glow(h, fromX, y, 0.4, 1.3, look.hi, look.lo, 0.5, 0.9, { fin: 0.2 }));
      break;
    }
    case 'iaido':
      // A beat after passing through them, the cut opens: an X of light and the picture flips to ink.
      gl.add({ kind: 'flare', x, y, r0: 2, r1: 4.5, w: 0.04, hi: WHITE, lo: look.hi, life: 0.4, power: 1, fin: 0 });
      sparks(fx, look, x, y, 8, [2, 5]);
      h.later(0.05, () => {
        for (const r of [0.75, -0.75]) beam(h, look, x - Math.cos(r) * 1.1, y - Math.sin(r) * 1.1, r, 2.2, 0.07, 0.32, { r0: 2.2 });
        blow(h, look, face, x, y);
        h.shake(0.45);
      });
      break;
    case 'fleche':
    case 'skewer':
      blow(h, look, face, x, y, id === 'skewer' ? 1.1 : 0.95);
      beam(h, look, x - face * 0.4, y, fwd, id === 'skewer' ? 3.2 : 3.8, id === 'skewer' ? 0.12 : 0.06, 0.3);
      if (id === 'skewer') groundShock(h, look, x + face * 0.6, 2, 0.45);
      break;
    case 'whirlwind':
      blow(h, look, face, x, y, 0.9);
      arc(h, look, x, y, face, 1.0, -0.5, 2.4, 0.1, 0.24);
      break;
    case 'venom_flurry':
      blow(h, look, face, x, y, 0.8);
      fx.burst({ x, y, count: 10, speed: [2, 5], life: [0.4, 0.7], color: look.hi, color2: look.lo, gravity: 9, kind: 'drop' });
      break;
    case 'flame_wave':
      blow(h, look, face, x, y, 1.1);
      fx.burst({ x, y: 0.3, count: 18, jitter: 0.3, dir: UP, spread: 0.5, speed: [2, 6], life: [0.4, 0.8], color: look.hi, color2: look.lo, gravity: -2, drag: 1.3, kind: 'flame' });
      break;
    case 'ground_slam':
      blow(h, look, face, x, y, 1.05);
      groundShock(h, look, x, 2.6, 0.5);
      dust(fx, x, 8);
      break;
    case 'power_shot':
      blow(h, look, face, x, y);
      beam(h, look, x - face * 2, y, fwd, 3.4, 0.05, 0.25, { power: 0.8 });
      break;
    case 'hex_orb':
      // The curse closes in on them, then bursts.
      gl.add({ kind: 'ring', x, y, r0: 1.6, r1: 0.2, w: 0.06, hi: look.hi, lo: look.lo, life: 0.22, power: 1, fin: 0 });
      h.later(0.14, () => blow(h, look, face, x, y));
      break;
    case 'bone_spikes':
      blow(h, look, face, x, y, 0.95);
      for (const dx of [-0.35, 0.1, 0.45]) beam(h, look, x + dx, 0, UP + dx * 0.4, 1.6 + Math.abs(dx), 0.08, 0.35, { power: 0.8 });
      break;
    case 'thunderclap':
      blow(h, look, face, x, y, 0.9);
      break;
    case 'chain_hook':
      tap(h, look, x, y);
      gl.shock({ x, y, r: 1.4, amp: 4, life: 0.3, hi: look.hi, dir: face });
      break;
    default:
      blow(h, look, face, x, y);
  }
}
