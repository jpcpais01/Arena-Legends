import type { Fx } from './fx';
import { mix } from './pixel/color';
import type { SuperLook } from './supers';

/**
 * Signature animations for each main-weapon super: what it looks like as it
 * is let loose and where it lands. Every one is drawn in its look's colours,
 * so a skinned weapon plays its super in the skin's colours and with the
 * skin's own sparks (flames, petals, snowflakes...).
 */
export interface SuperHost {
  fx: Fx;
  shake(amount: number): void;
  flash(color: number, amount: number): void;
  /** Runs `fn` after `seconds` of battle time (slowed with the slow motion). */
  later(seconds: number, fn: () => void): void;
}

/** Where a fighter stands: feet x, y and facing. */
export interface At { x: number; y: number; facing: number }

const DUST = [0xd8c8b0, 0x8a7a70] as const;

function dust(fx: Fx, x: number, dir: number, count: number, speed: [number, number] = [1.5, 3.5]): void {
  fx.burst({ x, y: 0.1, count, jitter: 0.25, dir, spread: 0.35, speed, life: [0.35, 0.65], color: DUST[0], color2: DUST[1], kind: 'smoke', size: 3, drag: 1.5 });
}

function sparks(fx: Fx, look: SuperLook, x: number, y: number, count: number, speed: [number, number] = [2, 6]): void {
  fx.burst({ x, y, count, jitter: 0.15, speed, life: [0.3, 0.7], color: look.hi, color2: look.lo, drag: 2.2, kind: look.kind });
}

/** The strike coming out. */
export function superRelease(h: SuperHost, id: string, look: SuperLook, f: At): void {
  const { fx } = h, { hi, lo } = look, face = f.facing;
  const back = face > 0 ? Math.PI : 0, fwd = face > 0 ? 0 : Math.PI;
  const cy = f.y + 1.15;
  switch (id) {
    case 'rising_cleave':
    case 'crescent_chop':
    case 'skull_crack':
    case 'grave_harvest':
      // The big swing: an arc of light ahead, the ground kicked up under it.
      fx.slash(f.x + face * 0.6, cy + 0.1, id === 'crescent_chop' ? 1.5 : 1.2, face, id === 'rising_cleave', hi, 0xffffff, 0.24);
      dust(fx, f.x + face * 0.5, Math.PI / 2, 6, [1, 2.5]);
      break;
    case 'iaido':
    case 'fleche':
    case 'skewer':
      // A rush: wind ripping along the path and dust thrown back.
      fx.burst({ x: f.x + face * 0.8, y: cy, count: 16, jitter: 0.2, jitterY: 0.45, dir: fwd, spread: 0.05, speed: [10, 18], life: [0.1, 0.22], color: 0xffffff, color2: hi, kind: 'streak' });
      dust(fx, f.x - face * 0.3, Math.PI / 2 - face * 1.1, 8, [2, 4.5]);
      fx.pulse('groundRing', f.x, 0, 1.2, lo, 0.3);
      break;
    case 'whirlwind':
      fx.pulse('swirl', f.x, cy, 1.4, hi, 0.5, lo);
      fx.pulse('groundRing', f.x, 0, 2.2, hi, 0.45);
      dust(fx, f.x - 0.4, Math.PI - 0.3, 5);
      dust(fx, f.x + 0.4, 0.3, 5);
      break;
    case 'venom_flurry':
      fx.pulse('rays', f.x + face * 0.7, cy, 1.0, hi, 0.25, lo);
      fx.burst({ x: f.x + face * 0.6, y: cy, count: 10, dir: fwd, spread: 0.5, speed: [3, 6], life: [0.3, 0.5], color: hi, color2: lo, gravity: 8, kind: 'drop' });
      break;
    case 'flame_wave':
      fx.burst({ x: f.x + face * 0.5, y: 0.2, count: 26, jitter: 0.3, dir: Math.PI / 2 - face * 0.5, spread: 0.6, speed: [2, 6], life: [0.35, 0.7], color: hi, color2: lo, gravity: -2, drag: 1.5, kind: 'flame' });
      fx.pulse('groundRing', f.x + face * 0.5, 0, 1.8, lo, 0.4);
      break;
    case 'ground_slam':
      fx.pulse('crack', f.x + face * 0.9, 0, 1.8, mix(lo, 0x2a1a10, 0.4), 1.6);
      fx.pulse('groundRing', f.x + face * 0.9, 0, 2.4, hi, 0.45);
      fx.burst({ x: f.x + face * 0.9, y: 0.2, count: 22, jitter: 0.5, dir: Math.PI / 2, spread: 0.8, speed: [3, 8], life: [0.4, 0.8], color: hi, color2: lo, gravity: 16, size: 2 });
      dust(fx, f.x + face * 0.9, Math.PI / 2 + face * 0.8, 6, [2, 4]);
      dust(fx, f.x + face * 0.9, Math.PI / 2 - face * 0.8, 6, [2, 4]);
      h.shake(0.6);
      break;
    case 'power_shot':
      fx.pulse('star', f.x + face * 0.9, cy + 0.2, 0.9, hi, 0.16);
      fx.pulse('rays', f.x + face * 0.9, cy + 0.2, 1.2, hi, 0.22, lo);
      fx.burst({ x: f.x + face * 0.9, y: cy + 0.2, count: 12, dir: fwd, spread: 0.1, speed: [8, 14], life: [0.12, 0.22], color: 0xffffff, color2: hi, kind: 'streak' });
      break;
    case 'chain_hook':
      fx.burst({ x: f.x + face * 0.6, y: cy, count: 10, dir: fwd, spread: 0.12, speed: [7, 12], life: [0.12, 0.22], color: 0xffffff, color2: hi, kind: 'streak' });
      break;
    case 'thunderclap':
      for (let i = 0; i < 3; i++) fx.bolt(f.x + (i - 1) * 0.9, 7, f.x + (i - 1) * 0.3, cy + 0.6, lo, 0.22);
      fx.pulse('ring', f.x, cy, 2.2, hi, 0.35, lo);
      h.flash(hi, 0.5);
      break;
    case 'hex_orb':
    case 'bone_spikes':
      fx.pulse('runes', f.x, f.y + 0.4, 0.8, hi, 0.55, lo);
      fx.pulse('implode', f.x + face * 0.6, cy + 0.3, 1.2, hi, 0.25, lo);
      break;
  }
  // Every super: speed lines streaming back off the body.
  fx.burst({ x: f.x, y: cy, count: 10, jitter: 0.1, jitterY: 0.5, dir: back, spread: 0.08, speed: [6, 11], life: [0.12, 0.22], color: 0xffffff, color2: hi, kind: 'streak' });
}

/**
 * Where it lands. `first` is the opening hit (combo follow-ups are lighter
 * and skip the big set pieces); `fromX` is where the attacker stands.
 * Returns false for supers with no signature impact (the element one plays).
 */
export function superImpactFx(h: SuperHost, id: string, look: SuperLook, x: number, y: number, face: number, first: boolean, fromX: number): boolean {
  const { fx } = h, { hi, lo } = look;
  const fwd = face > 0 ? 0 : Math.PI;
  switch (id) {
    case 'rising_cleave':
      // An upward crescent, a second echo of it, and a thin column of light the blow throws them up.
      fx.slash(x, y, 1.5, face, true, hi, 0xffffff, 0.26);
      h.later(0.05, () => fx.slash(x + face * 0.15, y + 0.2, 1.05, face, true, lo, hi, 0.2));
      fx.pulse('pillar', x, 0, 0.14, hi, 0.35);
      sparks(fx, look, x, y, 18, [3, 8]);
      dust(fx, x, Math.PI / 2, 6);
      return true;
    case 'crescent_chop':
      // A crescent moon coming down, an inner one after it, and the floor splits.
      fx.slash(x, y + 0.2, 1.8, face, false, hi, 0xffffff, 0.3);
      h.later(0.06, () => fx.slash(x, y, 1.15, face, false, lo, hi, 0.22));
      fx.pulse('crack', x, 0, 1.6, mix(lo, 0x1a1020, 0.5), 1.5);
      fx.pulse('groundRing', x, 0, 2.2, hi, 0.45);
      sparks(fx, look, x, y, 16);
      dust(fx, x - 0.3, Math.PI - 0.4, 5);
      dust(fx, x + 0.3, 0.4, 5);
      return true;
    case 'skull_crack':
      fx.slash(x, y + 0.3, 1.2, face, false, hi, 0xffffff, 0.22);
      fx.pulse('star', x, y + 0.5, 1.1, hi, 0.2);
      // Stars knocked loose, circling out.
      fx.burst({ x, y: y + 0.6, count: 10, speed: [2, 4], life: [0.5, 0.9], color: 0xfff0a0, color2: hi, drag: 2.5, kind: 'twinkle' });
      fx.pulse('crack', x, 0, 1.2, mix(lo, 0x2a1a10, 0.4), 1.3);
      dust(fx, x, Math.PI / 2, 8);
      return true;
    case 'iaido':
    case 'fleche':
    case 'skewer': {
      // Run through: a line of light well past them, and for the iaido a cross cut a beat later.
      fx.burst({ x, y, count: 22, dir: fwd, spread: 0.04, speed: [10, 20], life: [0.14, 0.28], color: 0xffffff, color2: hi, drag: 2, kind: 'streak' });
      fx.pulse('rays', x, y, 1.3, hi, 0.22, lo);
      sparks(fx, look, x, y, 12);
      if (id === 'iaido') {
        h.later(0.14, () => {
          fx.slash(x, y, 1.2, face, true, hi, 0xffffff, 0.2);
          fx.slash(x, y, 1.2, -face, false, hi, 0xffffff, 0.2);
          fx.pulse('star', x, y, 1.0, 0xffffff, 0.16);
          h.flash(0xffffff, 0.35);
          h.shake(0.4);
        });
      } else if (id === 'skewer') {
        // The shock rolls on along the ground behind them.
        fx.pulse('groundRing', x + face * 0.8, 0, 1.6, hi, 0.35);
        dust(fx, x + face * 0.4, Math.PI / 2 - face * 0.6, 8, [2, 4]);
      } else fx.pulse('ring', x, y, 1.0, 0xffffff, 0.2, hi);
      return true;
    }
    case 'whirlwind':
      // Each turn of the spin cuts across them, alternating direction.
      fx.slash(x, y, first ? 1.3 : 1.0, Math.random() < 0.5 ? face : -face, Math.random() < 0.5, hi, 0xffffff, 0.2);
      fx.pulse('swirl', fromX, y, 1.3, hi, 0.3, lo);
      sparks(fx, look, x, y, first ? 12 : 6);
      return true;
    case 'venom_flurry':
      fx.pulse('rays', x, y, first ? 1.0 : 0.7, hi, 0.18, lo);
      fx.burst({ x, y, count: first ? 12 : 6, speed: [2, 5], life: [0.4, 0.7], color: hi, color2: lo, gravity: 9, kind: 'drop' });
      if (first) fx.burst({ x, y, count: 8, jitter: 0.3, speed: [0.3, 0.8], life: [0.5, 0.9], color: lo, color2: 0x1a3a18, kind: 'smoke', size: 3, drag: 1.5 });
      return true;
    case 'grave_harvest': {
      // The scythe comes down and their soul is torn out, streaming back to the reaper.
      fx.slash(x, y + 0.2, 1.4, face, false, hi, 0xffffff, 0.26);
      const toward = fromX < x ? Math.PI : 0, d = Math.abs(fromX - x);
      fx.burst({ x, y, count: 16, jitter: 0.25, jitterY: 0.3, dir: toward, spread: 0.25, speed: [d * 2.2, d * 3], life: [0.3, 0.45], color: hi, color2: lo, drag: 0.8, kind: look.kind });
      h.later(0.32, () => fx.pulse('swirl', fromX, y, 1.1, hi, 0.4, lo));
      fx.pulse('swirl', x, y + 0.3, 1.0, lo, 0.35, hi);
      return true;
    }
    case 'flame_wave':
      fx.burst({ x, y: 0.3, count: 30, jitter: 0.35, dir: Math.PI / 2, spread: 0.5, speed: [2, 7], life: [0.4, 0.9], color: hi, color2: lo, gravity: -2, drag: 1.3, kind: 'flame' });
      fx.pulse('pillar', x, 0, 0.3, lo, 0.4);
      fx.pulse('groundRing', x, 0, 1.8, hi, 0.45);
      return true;
    case 'ground_slam':
      fx.pulse('crack', x, 0, 1.6, mix(lo, 0x2a1a10, 0.4), 1.4);
      fx.burst({ x, y: 0.2, count: 20, jitter: 0.4, dir: Math.PI / 2, spread: 0.6, speed: [4, 9], life: [0.4, 0.8], color: hi, color2: lo, gravity: 16, size: 2 });
      dust(fx, x, Math.PI / 2, 10, [1.5, 4]);
      return true;
    case 'power_shot':
      fx.burst({ x, y, count: 20, dir: fwd, spread: 0.06, speed: [9, 16], life: [0.14, 0.26], color: 0xffffff, color2: hi, kind: 'streak' });
      fx.pulse('ring', x, y, 1.3, hi, 0.28, lo);
      sparks(fx, look, x, y, 14);
      return true;
    case 'thunderclap':
      for (let i = 0; i < 2; i++) fx.bolt(x + (Math.random() - 0.5) * 1.4, 6.5, x, y, lo, 0.22);
      fx.burst({ x, y, count: 22, speed: [3, 8], life: [0.15, 0.35], color: 0xffffff, color2: lo, drag: 2.5, kind: 'streak' });
      return true;
    case 'bone_spikes':
      fx.pulse('icicles', x, 0, 1.3, hi, 0.9, lo);
      fx.burst({ x, y: 0.4, count: 14, dir: Math.PI / 2, spread: 0.7, speed: [2, 5], life: [0.4, 0.8], color: hi, color2: lo, gravity: 12, size: 1 });
      dust(fx, x, Math.PI / 2, 6);
      return true;
    case 'hex_orb':
      fx.pulse('runes', x, y - 0.6, 0.7, hi, 0.55, lo);
      fx.pulse('implode', x, y, 1.4, hi, 0.3, lo);
      sparks(fx, look, x, y, 18, [1.5, 5]);
      return true;
  }
  return false;
}
