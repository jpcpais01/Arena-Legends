import { gearOf } from '../../sim/gear';
import type { CharacterArt } from './look';
import type { Expression, FrameSpec, Hold, Smear } from './draw';
import { STAND, type Pose, type PoseKey } from './pose';
import type { MainFamily } from './weapons';

/**
 * Hand-authored pixel animation. Every clip is a short list of key frames
 * (classic sprite timing: three or four frames of anticipation, one or two
 * of impact, a few of follow-through). Frames are full drawings, never
 * tweens, so each one can be cached as a sprite.
 *
 * Poses are layered: family stance → context (main slung on the back) →
 * the frame's own changes. Clips for actions are split into the phases the
 * sim runs (windup / active / recovery) plus, for secondary items, the draw
 * and stow sub-phases.
 */

export interface FrameDef {
  p: PoseKey;
  hold?: Partial<Hold>;
  face?: Expression;
  smear?: Smear;
}

export interface Clip {
  /** Draw sub-phase (start of the windup), secondary items only. */
  draw: FrameDef[];
  w: FrameDef[];
  a: FrameDef[];
  r: FrameDef[];
  /** Stow sub-phase (end of the recovery). */
  stow: FrameDef[];
  /** Base pose and hold every frame starts from. */
  base: Pose;
  hold: Hold;
  /**
   * Active frames loop instead of playing once: the number of frames per hit
   * (flurry, spin), or −1 to loop on time (horn).
   */
  cycle?: number;
}

/** Loops (idle, walk...) use `w` only. */
const loop = (base: Pose, hold: Hold, frames: FrameDef[]): Clip => ({ draw: [], w: frames, a: [], r: [], stow: [], base, hold });

// -----------------------------------------------------------------------------
// Stances
// -----------------------------------------------------------------------------

/** Fighting stance shared by everyone: knees soft, lead (far) foot forward. */
const READY: Pose = {
  ...STAND, hipY: -0.075, lean: 0.12,
  fNx: -0.3, fNy: -1, fFx: 0.3, fFy: -1, toeN: 0, toeF: 0.05,
};

const STANCE: Record<MainFamily, Pose> = {
  sword: { ...READY, hNx: 0.38, hNy: -0.55, elN: 1, wAng: 1.0, hFx: 0.45, hFy: -0.38, elF: 1 },
  wand: { ...READY, hNx: 0.42, hNy: -0.5, wAng: 0.55, hFx: 0.42, hFy: -0.42 },
  heavy: { ...READY, lean: 0.15, hNx: 0.22, hNy: -0.62, wAng: 1.25 },
  polearm: { ...READY, hNx: 0.12, hNy: -0.72, wAng: 0.15 },
  staff: { ...READY, lean: 0.08, hNx: 0.35, hNy: -0.62, wAng: 1.4 },
  bow: { ...READY, lean: 0.06, hFx: 0.55, hFy: -0.55, elF: 1, wAng: -0.5, hNx: 0.22, hNy: -0.62 },
};

/** Rear hand when the main weapon is slung on the back. */
const FREE_NEAR: PoseKey = { hNx: 0.3, hNy: -0.48, elN: 1 };

export function stanceOf(art: CharacterArt): Pose {
  return STANCE[art.family];
}

// -----------------------------------------------------------------------------
// Locomotion
// -----------------------------------------------------------------------------

/** Run cycle for the near foot: [x, y, toe] relative to the hip joint (leg units). */
const RUN_FOOT: [number, number, number][] = [
  [0.42, -1, 0.25], // contact
  [0.2, -1, 0], // load
  [-0.02, -1, 0], // mid-stance
  [-0.28, -1, -0.25], // push
  [-0.48, -0.86, -0.6], // toe-off
  [-0.34, -0.6, -0.35], // swing back
  [0.02, -0.56, 0], // pass
  [0.32, -0.74, 0.2], // reach
];
const RUN_HIP = [-0.1, -0.075, -0.04, -0.06, -0.1, -0.075, -0.04, -0.06];

/** Stride length (px of travel) covered by one full run cycle, per leg length. */
export const RUN_CYCLE_LEGS = 2.9;
export const BACK_CYCLE_LEGS = 1.6;

function runFrames(stance: Pose, twoHand: boolean, scale: number, lean: number): FrameDef[] {
  const out: FrameDef[] = [];
  for (let i = 0; i < 8; i++) {
    const n = RUN_FOOT[i], f = RUN_FOOT[(i + 4) % 8];
    const swing = Math.cos((i / 8) * Math.PI * 2); // + when the near foot is forward
    const p: PoseKey = {
      fNx: n[0] * scale, fNy: n[1] === -1 ? -1 : -1 + (1 + n[1]) * scale, toeN: n[2] * scale,
      fFx: f[0] * scale + 0.04, fFy: f[1] === -1 ? -1 : -1 + (1 + f[1]) * scale, toeF: f[2] * scale,
      hipY: RUN_HIP[i] * (0.6 + 0.4 * scale), lean: stance.lean + lean,
      // The weapon hand bobs with the step; a free lead hand pumps opposite the near foot.
      hNy: stance.hNy + (i % 4 === 0 ? -0.03 : 0.02), hNx: stance.hNx - swing * 0.04,
      sway: -swing * 0.5,
    };
    if (!twoHand) { p.hFx = stance.hFx + swing * 0.14 * scale; p.hFy = stance.hFy + Math.abs(swing) * 0.04; }
    out.push({ p });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Main weapon clips per family
// -----------------------------------------------------------------------------

type Phases = Pick<Clip, 'w' | 'a' | 'r'> & { cycle?: number };

const F = (p: PoseKey, face: Expression = 'fierce', extra: Omit<FrameDef, 'p' | 'face'> = {}): FrameDef => ({ p, face, ...extra });

function swordClips(): Record<string, Phases> {
  return {
    // Forehand diagonal cut from over the shoulder.
    slash: {
      w: [F({ hNx: 0.12, hNy: 0.2, wAng: 2.0, lean: 0.06, hipX: -0.02 }), F({ hNx: -0.08, hNy: 0.42, wAng: 2.5, lean: -0.06, head: 0.08, hipX: -0.04, hFx: 0.55, hFy: -0.2 })],
      a: [
        F({ hNx: 0.78, hNy: 0.02, wAng: 0.15, lean: 0.26, hipX: 0.06, fFx: 0.38, hFx: 0.2, hFy: -0.45 }, 'shout', { smear: { from: 2.5, to: 0.15 } }),
        F({ hNx: 0.68, hNy: -0.42, wAng: -0.65, lean: 0.3, hipX: 0.07, fFx: 0.38, hFx: 0.15, hFy: -0.5 }, 'shout', { smear: { from: 1.3, to: -0.65 } }),
      ],
      r: [F({ hNx: 0.55, hNy: -0.6, wAng: -0.9, lean: 0.26, hipX: 0.05 }), F({ hNx: 0.46, hNy: -0.56, wAng: -0.1, lean: 0.18 }, 'calm'), F({ hNx: 0.42, hNy: -0.55, wAng: 0.6, lean: 0.14 }, 'calm')],
    },
    // Backhand rising cut (every other basic swing).
    slash2: {
      w: [F({ hNx: 0.15, hNy: -0.7, wAng: -1.9, lean: 0.06, hipX: -0.02 }), F({ hNx: -0.12, hNy: -0.62, wAng: -2.55, lean: 0.0, hipX: -0.04, hFx: 0.55, hFy: -0.2 })],
      a: [
        F({ hNx: 0.75, hNy: -0.25, wAng: -0.2, lean: 0.24, hipX: 0.06, fFx: 0.38 }, 'shout', { smear: { from: -2.55, to: -0.2 } }),
        F({ hNx: 0.6, hNy: 0.3, wAng: 1.25, lean: 0.18, hipX: 0.07, fFx: 0.38, hFx: 0.2, hFy: -0.5 }, 'shout', { smear: { from: -1.2, to: 1.25 } }),
      ],
      r: [F({ hNx: 0.5, hNy: 0.2, wAng: 1.6, lean: 0.14 }), F({ hNx: 0.42, hNy: -0.3, wAng: 1.3, lean: 0.12 }, 'calm'), F({ hNx: 0.4, hNy: -0.5, wAng: 1.05, lean: 0.12 }, 'calm')],
    },
    // Two-beat overhead: rise up on the toes, then chop down to the floor.
    overhead: {
      w: [
        F({ hNx: 0.2, hNy: 0.45, wAng: 1.9, lean: 0.0, hipY: -0.04, hFx: 0.3, hFy: 0.1 }),
        F({ hNx: 0.02, hNy: 0.85, wAng: 2.35, lean: -0.14, hipY: -0.01, head: 0.12, hFx: 0.22, hFy: 0.5, toeN: -0.3 }),
        F({ hNx: -0.05, hNy: 0.88, wAng: 2.6, lean: -0.18, hipY: 0, head: 0.15, hFx: 0.18, hFy: 0.55, toeN: -0.3 }, 'shout'),
      ],
      a: [
        F({ hNx: 0.82, hNy: 0.05, wAng: 0.0, lean: 0.36, hipY: -0.12, hipX: 0.05, fFx: 0.42, hFx: 0.5, hFy: -0.1 }, 'shout', { smear: { from: 2.6, to: 0.0 } }),
        F({ hNx: 0.72, hNy: -0.58, wAng: -1.15, lean: 0.44, hipY: -0.17, hipX: 0.06, fFx: 0.42, fNx: -0.42, hFx: 0.4, hFy: -0.45 }, 'shout', { smear: { from: 1.1, to: -1.15 } }),
      ],
      r: [
        F({ hNx: 0.7, hNy: -0.6, wAng: -1.2, lean: 0.42, hipY: -0.16, hipX: 0.05, fFx: 0.42, fNx: -0.42, hFx: 0.4, hFy: -0.45 }),
        F({ hNx: 0.55, hNy: -0.6, wAng: -0.5, lean: 0.3, hipY: -0.12 }, 'calm'),
        F({ hNx: 0.42, hNy: -0.56, wAng: 0.5, lean: 0.18, hipY: -0.09 }, 'calm'),
      ],
    },
    // Quick stab (dagger).
    thrust: {
      w: [F({ hNx: 0.12, hNy: -0.38, wAng: 0.12, lean: 0.02, hipX: -0.04, hFx: 0.55, hFy: -0.25 })],
      a: [F({ hNx: 0.98, hNy: -0.12, wAng: 0.04, lean: 0.3, hipX: 0.08, fFx: 0.46, hFx: 0.15, hFy: -0.45 }, 'shout')],
      r: [F({ hNx: 0.75, hNy: -0.25, wAng: 0.1, lean: 0.24, hipX: 0.05 }), F({ hNx: 0.45, hNy: -0.45, wAng: 0.6, lean: 0.16 }, 'calm')],
    },
    thrust2: {
      w: [F({ hNx: 0.1, hNy: -0.6, wAng: 0.3, lean: 0.05, hipX: -0.04, hFx: 0.55, hFy: -0.25 })],
      a: [F({ hNx: 0.96, hNy: -0.42, wAng: 0.3, lean: 0.34, hipX: 0.08, hipY: -0.12, fFx: 0.46, hFx: 0.15, hFy: -0.4 }, 'shout')],
      r: [F({ hNx: 0.7, hNy: -0.45, wAng: 0.35, lean: 0.26, hipX: 0.05 }), F({ hNx: 0.45, hNy: -0.5, wAng: 0.7, lean: 0.16 }, 'calm')],
    },
    // Four quick stabs, high and low.
    flurry: {
      w: [F({ hNx: 0.15, hNy: -0.35, wAng: 0.1, lean: 0.08, hipX: -0.03, hFx: 0.5, hFy: -0.2 }), F({ hNx: 0.05, hNy: -0.32, wAng: 0.1, lean: 0.12, hipY: -0.1, hFx: 0.55, hFy: -0.15 })],
      a: [
        F({ hNx: 0.98, hNy: -0.08, wAng: 0.12, lean: 0.3, hipX: 0.06, hipY: -0.1, fFx: 0.44 }, 'shout'),
        F({ hNx: 0.42, hNy: -0.38, wAng: 0.25, lean: 0.26, hipX: 0.05, hipY: -0.1, fFx: 0.44 }, 'fierce'),
        F({ hNx: 0.97, hNy: -0.36, wAng: -0.1, lean: 0.32, hipX: 0.06, hipY: -0.12, fFx: 0.44 }, 'shout'),
        F({ hNx: 0.42, hNy: -0.42, wAng: 0.3, lean: 0.26, hipX: 0.05, hipY: -0.1, fFx: 0.44 }, 'fierce'),
      ],
      cycle: 2,
      r: [F({ hNx: 0.6, hNy: -0.35, wAng: 0.3, lean: 0.22 }), F({ hNx: 0.45, hNy: -0.5, wAng: 0.8, lean: 0.15 }, 'calm')],
    },
    // Iaido dash: crouch with the blade low behind, blur through, cut.
    dash: {
      w: [
        F({ hNx: 0.0, hNy: -0.72, wAng: -2.7, lean: 0.3, hipY: -0.14, fNx: -0.45, fFx: 0.4, hFx: 0.35, hFy: -0.62 }),
        F({ hNx: -0.1, hNy: -0.74, wAng: -2.85, lean: 0.4, hipY: -0.2, fNx: -0.55, fFx: 0.45, hFx: 0.3, hFy: -0.66, head: 0.15 }, 'fierce'),
      ],
      a: [
        F({ hNx: -0.35, hNy: -0.62, wAng: -2.95, lean: 0.55, hipY: -0.18, fNx: -0.75, fNy: -0.8, toeN: -0.5, fFx: 0.62, fFy: -0.9, hFx: 0.6, hFy: -0.45, head: 0.2, sway: -1 }, 'fierce'),
        F({ hNx: 0.88, hNy: -0.1, wAng: -0.15, lean: 0.4, hipY: -0.15, fNx: -0.7, fNy: -0.85, fFx: 0.55, hFx: -0.1, hFy: -0.55, sway: -1 }, 'shout', { smear: { from: -2.9, to: -0.15 } }),
      ],
      r: [
        F({ hNx: 0.85, hNy: -0.05, wAng: 0.05, lean: 0.35, hipY: -0.15, fNx: -0.6, fFx: 0.5, hFx: -0.15, hFy: -0.6 }),
        F({ hNx: 0.6, hNy: -0.2, wAng: 0.9, lean: 0.22, hipY: -0.1 }, 'calm'),
        F({ hNx: 0.42, hNy: -0.5, wAng: 1.0, lean: 0.15 }, 'calm'),
      ],
    },
  };
}

function wandClips(): Record<string, Phases> {
  return {
    cast: {
      w: [F({ hNx: 0.2, hNy: 0.05, wAng: 1.45, lean: 0.04, hFx: 0.55, hFy: -0.15 }), F({ hNx: 0.08, hNy: 0.2, wAng: 1.8, lean: -0.04, hFx: 0.6, hFy: -0.05 })],
      a: [F({ hNx: 0.98, hNy: 0.0, wAng: 0.05, lean: 0.2, hipX: 0.04, hFx: 0.3, hFy: -0.35 }, 'shout')],
      r: [F({ hNx: 0.85, hNy: -0.1, wAng: 0.2, lean: 0.18 }), F({ hNx: 0.55, hNy: -0.4, wAng: 0.45, lean: 0.14 }, 'calm')],
    },
    castBig: {
      w: [
        F({ hNx: 0.25, hNy: 0.3, wAng: 1.6, lean: 0.02, hFx: 0.35, hFy: 0.25, hipY: -0.05 }),
        F({ hNx: 0.12, hNy: 0.6, wAng: 1.95, lean: -0.1, hFx: 0.25, hFy: 0.55, hipY: -0.02, head: 0.15 }),
        F({ hNx: 0.08, hNy: 0.68, wAng: 2.05, lean: -0.14, hFx: 0.2, hFy: 0.62, hipY: -0.01, head: 0.2 }, 'shout'),
      ],
      a: [F({ hNx: 0.95, hNy: -0.3, wAng: -0.3, lean: 0.36, hipY: -0.12, hipX: 0.05, fFx: 0.42, hFx: 0.85, hFy: -0.25 }, 'shout')],
      r: [F({ hNx: 0.9, hNy: -0.32, wAng: -0.3, lean: 0.34, hipY: -0.12, hipX: 0.04, fFx: 0.42, hFx: 0.8, hFy: -0.3 }), F({ hNx: 0.6, hNy: -0.45, wAng: 0.2, lean: 0.2, hipY: -0.09 }, 'calm')],
    },
  };
}

function heavyClips(): Record<string, Phases> {
  return {
    slash: {
      w: [
        F({ hNx: 0.12, hNy: 0.05, wAng: 2.1, lean: 0.02, hipX: -0.03 }),
        F({ hNx: -0.12, hNy: 0.25, wAng: 2.65, lean: -0.12, hipX: -0.06, head: 0.1, toeN: -0.2 }),
      ],
      a: [
        F({ hNx: 0.62, hNy: -0.08, wAng: 0.55, lean: 0.24, hipX: 0.06, fFx: 0.42 }, 'shout', { smear: { from: 2.65, to: 0.55 } }),
        F({ hNx: 0.62, hNy: -0.55, wAng: -0.75, lean: 0.34, hipX: 0.07, fFx: 0.42, hipY: -0.12 }, 'shout', { smear: { from: 1.6, to: -0.75 } }),
      ],
      r: [
        F({ hNx: 0.58, hNy: -0.6, wAng: -0.95, lean: 0.34, hipX: 0.06, hipY: -0.12 }),
        F({ hNx: 0.4, hNy: -0.62, wAng: 0.2, lean: 0.24, hipY: -0.1 }, 'calm'),
        F({ hNx: 0.28, hNy: -0.62, wAng: 0.95, lean: 0.17 }, 'calm'),
      ],
    },
    slash2: {
      w: [
        F({ hNx: 0.1, hNy: -0.68, wAng: -1.9, lean: 0.1, hipX: -0.03 }),
        F({ hNx: -0.15, hNy: -0.66, wAng: -2.55, lean: 0.04, hipX: -0.06, hipY: -0.1 }),
      ],
      a: [
        F({ hNx: 0.62, hNy: -0.35, wAng: -0.3, lean: 0.26, hipX: 0.06, fFx: 0.42, hipY: -0.1 }, 'shout', { smear: { from: -2.55, to: -0.3 } }),
        F({ hNx: 0.5, hNy: 0.2, wAng: 1.35, lean: 0.12, hipX: 0.07, fFx: 0.42 }, 'shout', { smear: { from: -1.4, to: 1.35 } }),
      ],
      r: [
        F({ hNx: 0.4, hNy: 0.15, wAng: 1.75, lean: 0.1 }),
        F({ hNx: 0.3, hNy: -0.3, wAng: 1.5, lean: 0.12 }, 'calm'),
        F({ hNx: 0.24, hNy: -0.55, wAng: 1.3, lean: 0.14 }, 'calm'),
      ],
    },
    // Hammer overhead into the floor.
    slam: {
      w: [
        F({ hNx: 0.15, hNy: 0.35, wAng: 1.8, lean: 0.0, hipY: -0.05 }),
        F({ hNx: 0.0, hNy: 0.8, wAng: 2.2, lean: -0.18, hipY: -0.01, head: 0.15, toeN: -0.3 }),
        F({ hNx: -0.05, hNy: 0.85, wAng: 2.45, lean: -0.22, hipY: 0.0, head: 0.2, toeN: -0.3 }, 'shout'),
      ],
      a: [
        F({ hNx: 0.75, hNy: 0.1, wAng: 0.4, lean: 0.35, hipY: -0.12, hipX: 0.04, fFx: 0.45 }, 'shout', { smear: { from: 2.45, to: 0.4 } }),
        F({ hNx: 0.7, hNy: -0.62, wAng: -0.62, lean: 0.52, hipY: -0.22, hipX: 0.05, fFx: 0.5, fNx: -0.52 }, 'shout', { smear: { from: 1.2, to: -0.62 } }),
      ],
      r: [
        F({ hNx: 0.7, hNy: -0.64, wAng: -0.62, lean: 0.5, hipY: -0.22, hipX: 0.05, fFx: 0.5, fNx: -0.52 }),
        F({ hNx: 0.5, hNy: -0.62, wAng: 0.3, lean: 0.32, hipY: -0.15 }, 'calm'),
        F({ hNx: 0.3, hNy: -0.62, wAng: 1.0, lean: 0.2, hipY: -0.1 }, 'calm'),
      ],
    },
    // Whirlwind: the axe circles the body; foreshortened as it swings past the viewer.
    spin: {
      w: [
        F({ hNx: -0.05, hNy: -0.45, wAng: 2.8, lean: 0.1, hipY: -0.12, hipX: -0.04 }, 'fierce', { hold: { mainBehind: true } }),
        F({ hNx: -0.25, hNy: -0.4, wAng: 3.0, lean: 0.15, hipY: -0.15, hipX: -0.05, head: 0.1 }, 'shout', { hold: { mainBehind: true } }),
      ],
      a: [
        F({ hNx: 0.85, hNy: -0.3, wAng: -0.05, lean: 0.2, hipY: -0.14, fFx: 0.35, sway: 1 }, 'shout', { smear: { from: 0, to: 0, ring: true } }),
        F({ hNx: 0.25, hNy: -0.38, wAng: -0.05, lean: 0.2, hipY: -0.14, fFx: 0.22, fNx: -0.38, sway: 0.5 }, 'shout', { hold: { mainScale: -0.4 }, smear: { from: 0, to: 0, ring: true } }),
        F({ hNx: -0.7, hNy: -0.3, wAng: 3.2, lean: 0.12, hipY: -0.14, fFx: 0.35, sway: -1 }, 'shout', { hold: { mainBehind: true }, smear: { from: 0, to: 0, ring: true } }),
        F({ hNx: 0.0, hNy: -0.35, wAng: -0.05, lean: 0.15, hipY: -0.14, fFx: 0.25, fNx: -0.35, sway: -0.5 }, 'shout', { hold: { mainBehind: true, mainScale: 0.4 }, smear: { from: 0, to: 0, ring: true } }),
      ],
      cycle: 4,
      r: [
        F({ hNx: 0.75, hNy: -0.45, wAng: -0.4, lean: 0.25, hipY: -0.12 }),
        F({ hNx: 0.4, hNy: -0.6, wAng: 0.6, lean: 0.2, hipY: -0.1 }, 'calm'),
      ],
    },
  };
}

function polearmClips(): Record<string, Phases> {
  return {
    thrust: {
      w: [
        F({ hNx: -0.1, hNy: -0.62, wAng: 0.15, lean: 0.0, hipX: -0.05 }),
        F({ hNx: -0.22, hNy: -0.6, wAng: 0.18, lean: -0.06, hipX: -0.07, toeF: 0.2 }),
      ],
      a: [F({ hNx: 0.68, hNy: -0.42, wAng: 0.06, lean: 0.32, hipX: 0.1, fFx: 0.5, hipY: -0.1 }, 'shout')],
      r: [
        F({ hNx: 0.6, hNy: -0.46, wAng: 0.06, lean: 0.3, hipX: 0.08, fFx: 0.5, hipY: -0.1 }),
        F({ hNx: 0.3, hNy: -0.62, wAng: 0.12, lean: 0.2, hipX: 0.03 }, 'calm'),
      ],
    },
    // High thrust angled down at the shoulder line.
    thrust2: {
      w: [F({ hNx: -0.15, hNy: -0.3, wAng: -0.05, lean: -0.02, hipX: -0.06 }), F({ hNx: -0.25, hNy: -0.22, wAng: -0.08, lean: -0.08, hipX: -0.08 })],
      a: [F({ hNx: 0.72, hNy: -0.08, wAng: -0.12, lean: 0.3, hipX: 0.1, fFx: 0.5 }, 'shout')],
      r: [F({ hNx: 0.62, hNy: -0.15, wAng: -0.1, lean: 0.28, hipX: 0.08, fFx: 0.5 }), F({ hNx: 0.25, hNy: -0.5, wAng: 0.1, lean: 0.18 }, 'calm')],
    },
  };
}

function staffClips(): Record<string, Phases> {
  return {
    cast: {
      w: [F({ hNx: 0.3, hNy: -0.3, wAng: 1.55, lean: 0.02 }), F({ hNx: 0.18, hNy: -0.15, wAng: 1.75, lean: -0.06, head: 0.08 })],
      a: [F({ hNx: 0.75, hNy: -0.25, wAng: 0.55, lean: 0.24, hipX: 0.05, fFx: 0.4 }, 'shout')],
      r: [F({ hNx: 0.65, hNy: -0.32, wAng: 0.75, lean: 0.2 }), F({ hNx: 0.42, hNy: -0.55, wAng: 1.2, lean: 0.12 }, 'calm')],
    },
    castBig: {
      w: [
        F({ hNx: 0.3, hNy: 0.0, wAng: 1.57, lean: 0.0, hipY: -0.05 }),
        F({ hNx: 0.22, hNy: 0.45, wAng: 1.57, lean: -0.12, head: 0.15, hipY: -0.02 }),
        F({ hNx: 0.2, hNy: 0.55, wAng: 1.6, lean: -0.16, head: 0.2, hipY: -0.01 }, 'shout'),
      ],
      a: [F({ hNx: 0.72, hNy: -0.5, wAng: 1.0, lean: 0.34, hipY: -0.14, hipX: 0.05, fFx: 0.45 }, 'shout')],
      r: [F({ hNx: 0.7, hNy: -0.52, wAng: 1.0, lean: 0.32, hipY: -0.14, fFx: 0.45 }), F({ hNx: 0.45, hNy: -0.6, wAng: 1.3, lean: 0.16, hipY: -0.1 }, 'calm')],
    },
  };
}

function bowClips(): Record<string, Phases> {
  // Far hand holds the bow; the near hand draws the string to the cheek.
  const aim = { hFx: 0.96, hFy: 0.04, elF: 1, wAng: 0, lean: 0.04 };
  return {
    shoot: {
      w: [
        F({ hFx: 0.75, hFy: -0.3, wAng: -0.25, hNx: 0.55, hNy: -0.3, lean: 0.06 }, 'fierce', { hold: { pull: 0.1 } }),
        F({ ...aim, hNx: 0.45, hNy: 0.02 }, 'fierce', { hold: { pull: 0.35 } }),
        F({ ...aim, hNx: 0.08, hNy: 0.1, elN: 1, head: 0.02 }, 'fierce', { hold: { pull: 0.8 } }),
        F({ ...aim, hNx: -0.04, hNy: 0.1, elN: 1, lean: 0.0, head: 0.02 }, 'fierce', { hold: { pull: 1 } }),
      ],
      a: [F({ ...aim, hFx: 0.92, hFy: 0.08, hNx: -0.28, hNy: 0.16, lean: -0.02 }, 'shout', { hold: { pull: 0 } })],
      r: [
        F({ ...aim, hFx: 0.92, hFy: 0.06, hNx: -0.25, hNy: 0.1 }, 'fierce', { hold: { pull: 0 } }),
        F({ hFx: 0.75, hFy: -0.25, wAng: -0.25, hNx: 0.4, hNy: -0.35 }, 'calm', { hold: { pull: 0 } }),
      ],
    },
  };
}

const FAMILY_CLIPS: Record<MainFamily, () => Record<string, Phases>> = {
  sword: swordClips, wand: wandClips, heavy: heavyClips, polearm: polearmClips, staff: staffClips, bow: bowClips,
};

// -----------------------------------------------------------------------------
// Secondary items (always the far hand), with draw and stow sub-phases
// -----------------------------------------------------------------------------

function secondaryClip(art: CharacterArt, anim: string): Phases | null {
  const fam = art.secFamily;
  if (!fam) return null;
  const front = fam === 'shield' || fam === 'buckler';
  const S = (p: PoseKey, face: Expression = 'fierce', hold: Partial<Hold> = {}) => F(p, face, { hold: { sec: 'hand', secFront: front, ...hold } });
  switch (anim) {
    case 'guard':
      return {
        w: [S({ hFx: 0.38, hFy: -0.35, sAng: -1.25, lean: 0.12 })],
        a: [S({ hFx: 0.56, hFy: -0.16, sAng: -1.55, lean: 0.14, hipY: -0.11, fNx: -0.36, fFx: 0.36, head: -0.08 })],
        r: [S({ hFx: 0.42, hFy: -0.32, sAng: -1.25, lean: 0.12 }, 'calm')],
      };
    case 'counter':
      return {
        w: [S({ hFx: 0.38, hFy: -0.15, sAng: 0.9 })],
        a: [S({ hFx: 0.6, hFy: 0.04, sAng: 1.25, lean: 0.05, hipY: -0.1, fNx: -0.36, fFx: 0.36 })],
        r: [S({ hFx: 0.45, hFy: -0.25, sAng: 0.6 }, 'calm')],
      };
    case 'bash':
      return {
        w: [S({ hFx: 0.18, hFy: -0.35, sAng: 0, lean: 0.0, hipX: -0.04 }), S({ hFx: 0.05, hFy: -0.32, sAng: 0, lean: -0.05, hipX: -0.06 })],
        a: [S({ hFx: 1, hFy: -0.15, sAng: 0, lean: 0.36, hipX: 0.1, fFx: 0.5 }, 'shout')],
        r: [S({ hFx: 0.8, hFy: -0.22, sAng: 0, lean: 0.28, hipX: 0.07, fFx: 0.5 }), S({ hFx: 0.5, hFy: -0.32, sAng: 0, lean: 0.16 }, 'calm')],
      };
    case 'throw':
      return {
        w: [S({ hFx: 0.12, hFy: 0.28, sAng: 2.0, lean: 0.02 }), S({ hFx: -0.22, hFy: 0.45, sAng: 2.6, lean: -0.12, head: 0.08, toeF: 0.2 })],
        a: [S({ hFx: 0.98, hFy: 0.0, sAng: 0.1, lean: 0.3, hipX: 0.05, fFx: 0.42 }, 'shout', { sec: 'gone' })],
        r: [S({ hFx: 0.85, hFy: -0.3, sAng: 0, lean: 0.28, hipX: 0.05, fFx: 0.42 }, 'fierce', { sec: 'gone' }), S({ hFx: 0.6, hFy: -0.2, lean: 0.16 }, 'calm', { sec: 'gone' })],
      };
    case 'crossbow':
      return {
        w: [S({ hFx: 0.62, hFy: -0.25, sAng: -0.2 }), S({ hFx: 0.96, hFy: 0.04, sAng: 0, lean: 0.06 })],
        a: [S({ hFx: 0.86, hFy: 0.1, sAng: 0.2, lean: -0.02 }, 'shout', { pull: 0 })],
        r: [S({ hFx: 0.9, hFy: 0.04, sAng: 0.06, lean: 0.02 }, 'fierce', { pull: 0 }), S({ hFx: 0.6, hFy: -0.3, sAng: -0.3 }, 'calm', { pull: 0 })],
      };
    case 'castBig': // frost wand burst
      return {
        w: [S({ hFx: 0.3, hFy: 0.4, sAng: 1.7, lean: -0.05 }), S({ hFx: 0.18, hFy: 0.6, sAng: 2.0, lean: -0.12, head: 0.15 })],
        a: [S({ hFx: 1, hFy: -0.08, sAng: 0.05, lean: 0.32, hipY: -0.1, fFx: 0.42 }, 'shout')],
        r: [S({ hFx: 0.85, hFy: -0.2, sAng: 0.1, lean: 0.26, hipY: -0.1 }), S({ hFx: 0.55, hFy: -0.35, sAng: 0.4, lean: 0.14 }, 'calm')],
      };
    case 'horn':
      return {
        w: [S({ hFx: 0.32, hFy: 0.0, sAng: 0.4 }), S({ hFx: 0.2, hFy: 0.3, sAng: 0.85, lean: -0.12, head: 0.22 })],
        a: [
          S({ hFx: 0.2, hFy: 0.32, sAng: 0.95, lean: -0.22, head: 0.32, hipY: -0.1 }, 'shout'),
          S({ hFx: 0.2, hFy: 0.33, sAng: 1.0, lean: -0.24, head: 0.34, hipY: -0.12 }, 'shout'),
        ],
        cycle: -1,
        r: [S({ hFx: 0.35, hFy: -0.05, sAng: 0.3, lean: 0.05 }, 'calm')],
      };
  }
  return null;
}

/** Riposte after a perfect parry (replaces the guard's recovery). */
function riposteFrames(art: CharacterArt): FrameDef[] {
  const front = art.secFamily === 'shield' || art.secFamily === 'buckler';
  const hold: Partial<Hold> = { sec: 'hand', secFront: front };
  if (art.secFamily === 'parry') {
    return [
      F({ hFx: 1, hFy: -0.08, sAng: 0.05, lean: 0.32, hipX: 0.08, fFx: 0.48 }, 'shout', { hold }),
      F({ hFx: 0.8, hFy: -0.15, sAng: 0.1, lean: 0.26, hipX: 0.06, fFx: 0.48 }, 'fierce', { hold }),
      F({ hFx: 0.5, hFy: -0.3, sAng: 0.5, lean: 0.16 }, 'calm', { hold }),
    ];
  }
  return [
    F({ hFx: 0.95, hFy: -0.15, sAng: -1.5, lean: 0.34, hipX: 0.08, fFx: 0.48 }, 'shout', { hold }),
    F({ hFx: 0.75, hFy: -0.2, sAng: -1.4, lean: 0.24, hipX: 0.06 }, 'fierce', { hold }),
    F({ hFx: 0.45, hFy: -0.32, sAng: -1.25, lean: 0.14 }, 'calm', { hold }),
  ];
}

/** Getting the secondary out: a two-handed main goes over the shoulder first. */
function drawFrames(art: CharacterArt): FrameDef[] {
  const out: FrameDef[] = [];
  const shield = art.secFamily === 'shield';
  const reach: PoseKey = shield ? { hFx: -0.15, hFy: 0.15, elF: -1 } : { hFx: -0.28, hFy: -0.72 };
  if (art.hands === 2) {
    out.push(F({ hNx: 0.12, hNy: 0.32, wAng: 2.4, lean: 0.06 }, 'calm', { hold: { main: 'hand' } }));
    out.push(F({ ...FREE_NEAR, hNx: 0.05, hNy: 0.3, lean: 0.08 }, 'calm', { hold: { main: 'back' } }));
  }
  out.push(F({ ...reach }, 'calm', { hold: { sec: 'stowed' } }));
  out.push(F({ hFx: 0.25, hFy: -0.45, sAng: shield ? -1.2 : 0.3 }, 'calm', { hold: { sec: 'hand', secFront: shield || art.secFamily === 'buckler' } }));
  return out;
}

/** Putting the secondary away and, for two-handed mains, taking the main back. */
function stowFrames(art: CharacterArt, gone: boolean): FrameDef[] {
  const out: FrameDef[] = [];
  const shield = art.secFamily === 'shield';
  const reach: PoseKey = shield ? { hFx: -0.15, hFy: 0.15, elF: -1 } : { hFx: -0.28, hFy: -0.72 };
  out.push(F({ hFx: 0.2, hFy: -0.5, sAng: shield ? -1.2 : 0.3 }, 'calm', { hold: { sec: gone ? 'gone' : 'hand', secFront: shield || art.secFamily === 'buckler' } }));
  out.push(F({ ...reach }, 'calm', { hold: { sec: 'stowed' } }));
  if (art.hands === 2) {
    out.push(F({ ...FREE_NEAR, hNx: 0.05, hNy: 0.3, lean: 0.08 }, 'calm', { hold: { main: 'back' } }));
    out.push(F({ hNx: 0.12, hNy: 0.32, wAng: 2.4, lean: 0.06 }, 'calm', { hold: { main: 'hand' } }));
  }
  return out;
}

// -----------------------------------------------------------------------------
// Chest abilities, evades, reactions
// -----------------------------------------------------------------------------

const CHEST: Record<string, Phases> = {
  // Iron skin: crouch, then flex with the chest thrown out.
  harden: {
    w: [F({ hipY: -0.16, lean: 0.32, head: -0.15, hFx: 0.3, hFy: -0.6, hNx: 0.28, hNy: -0.6, fNx: -0.38, fFx: 0.38 })],
    a: [F({ hipY: -0.15, lean: -0.1, head: 0.15, hFx: 0.3, hFy: 0.28, elF: 1, hNx: 0.18, hNy: 0.22, wAng: 2.0, fNx: -0.42, fFx: 0.42, sway: -1 }, 'shout')],
    r: [F({ hipY: -0.12, lean: 0.06, hFx: 0.42, hFy: -0.2, hNx: 0.32, hNy: -0.35, wAng: 1.2 }, 'calm')],
  },
  // Blink: a hand sign in front of the face, then gone.
  blink: {
    w: [F({ hipY: -0.1, lean: 0.18, hFx: 0.42, hFy: 0.3, elF: 1, head: -0.05 }), F({ hipY: -0.16, lean: 0.28, hFx: 0.38, hFy: 0.42, elF: 1, head: -0.12, fNx: -0.38, fFx: 0.4 }, 'blink')],
    a: [F({ hipY: -0.04, lean: 0.1, hFx: 0.5, hFy: 0.1, sway: 1 }, 'calm')],
    r: [F({ hipY: -0.14, lean: 0.2, hFx: 0.45, hFy: -0.25, fNx: -0.38, fFx: 0.38 }, 'calm')],
  },
  // Barrier: both hands thrust forward, weapon raised.
  barrier: {
    w: [F({ hFx: 0.3, hFy: 0.15, hNx: 0.25, hNy: -0.1, wAng: 1.6, lean: -0.04, hipY: -0.08 })],
    a: [F({ hFx: 0.95, hFy: 0.12, elF: 1, hNx: 0.6, hNy: 0.1, wAng: 1.65, lean: 0.12, hipY: -0.12, head: 0.08, fNx: -0.4, fFx: 0.4 }, 'shout')],
    r: [F({ hFx: 0.6, hFy: -0.15, hNx: 0.42, hNy: -0.3, wAng: 1.3, lean: 0.1 }, 'calm')],
  },
};

const TUCK: PoseKey = {
  hipY: -0.32, lean: 0.75, head: -0.35, fNx: 0.32, fNy: -0.42, fFx: 0.4, fFy: -0.46, toeN: 0.6, toeF: 0.6,
  hFx: 0.55, hFy: -0.55, elF: 1, sway: 1,
};

function evadeClips(stance: Pose): Record<string, Phases> {
  const crouch: PoseKey = { hipY: -0.15, lean: 0.28, fNx: -0.36, fFx: 0.36 };
  // The weapon hand tucks in too; its angle keeps the blade along the body.
  const tuckArm: PoseKey = { hNx: 0.5, hNy: -0.45, wAng: stance.wAng - 0.4 };
  const roll = (rot: number, extra: PoseKey = {}) => F({ ...TUCK, ...tuckArm, rot, ...extra }, 'fierce');
  return {
    evade: {
      w: [F(crouch, 'fierce')],
      a: [
        F({ hipY: 0, lean: -0.28, head: 0.1, fNx: -0.3, fNy: -0.68, toeN: -0.5, fFx: 0.18, fFy: -0.62, toeF: 0.4, hFx: 0.62, hFy: 0.1, sway: 1 }, 'fierce'),
        F({ hipY: -0.04, lean: -0.12, fNx: -0.36, fNy: -0.85, toeN: -0.3, fFx: 0.3, fFy: -0.78, toeF: 0.2, hFx: 0.55, hFy: -0.05, sway: 0.5 }, 'fierce'),
      ],
      r: [F({ hipY: -0.16, lean: 0.12, fNx: -0.4, fFx: 0.34 }, 'calm')],
    },
    roll: {
      w: [F(crouch, 'fierce')],
      a: [roll(0), roll(-Math.PI / 2), roll(-Math.PI), roll(-Math.PI * 1.5)],
      r: [F({ ...crouch, hipY: -0.2, lean: 0.35 }, 'fierce'), F({ hipY: -0.1, lean: 0.18 }, 'calm')],
    },
    leap: {
      w: [F({ ...crouch, lean: 0.1 }, 'fierce')],
      a: [roll(0, { lean: 0.4 }), roll(Math.PI / 2), roll(Math.PI), roll(Math.PI * 1.5)],
      r: [F({ hipY: -0.2, lean: 0.25, fNx: -0.42, fFx: 0.38 }, 'fierce'), F({ hipY: -0.1, lean: 0.15 }, 'calm')],
    },
  };
}

// -----------------------------------------------------------------------------
// Assembly
// -----------------------------------------------------------------------------

export interface ClipSet {
  clips: Map<string, Clip>;
  /** Locomotion cycle lengths in px of travel. */
  runCycle: number;
  backCycle: number;
}

const clipCache = new WeakMap<CharacterArt, ClipSet>();

export function clipsFor(art: CharacterArt): ClipSet {
  let set = clipCache.get(art);
  if (set) return set;
  const stance = stanceOf(art);
  const secOut = art.sec ? 'stowed' : 'gone';
  const hold: Hold = { main: 'hand', sec: secOut };
  const twoHand = art.hands === 2;
  const clips = new Map<string, Clip>();
  const add = (id: string, ph: Phases, extra: Partial<Clip> = {}) =>
    clips.set(id, { draw: [], stow: [], base: stance, hold, ...ph, ...extra });

  // Idle: a one-pixel breath.
  clips.set('idle', loop(stance, hold, [
    { p: {}, face: 'calm' },
    { p: { hipY: stance.hipY - 0.025, hNy: stance.hNy - 0.02, hFy: stance.hFy - 0.02 }, face: 'calm' },
    { p: { hipY: stance.hipY - 0.045, hNy: stance.hNy - 0.04, hFy: stance.hFy - 0.04, head: -0.04 }, face: 'calm' },
    { p: { hipY: stance.hipY - 0.025, hNy: stance.hNy - 0.02, hFy: stance.hFy - 0.02 }, face: 'calm' },
  ]));
  clips.set('run', loop(stance, hold, runFrames(stance, twoHand, 1, 0.12).map((f) => ({ ...f, face: 'fierce' }))));
  clips.set('back', loop(stance, hold, runFrames(stance, twoHand, 0.6, -0.06).map((f) => ({ ...f, face: 'calm' }))));

  for (const [id, ph] of Object.entries(FAMILY_CLIPS[art.family]())) add(id, ph);
  for (const [id, ph] of Object.entries(CHEST)) add(id, ph);
  for (const [id, ph] of Object.entries(evadeClips(stance))) add(id, ph);

  if (art.sec) {
    const base = twoHand ? { ...stance, ...FREE_NEAR } : stance;
    const secHold: Hold = { main: twoHand ? 'back' : 'hand', sec: 'hand' };
    for (const anim of new Set((gearOf(art.secId!).abilities ?? []).map((a) => a.anim))) {
      const ph = secondaryClip(art, anim);
      if (!ph) continue;
      const gone = anim === 'throw';
      clips.set('sec.' + anim, { base, hold: secHold, draw: drawFrames(art), stow: stowFrames(art, gone), ...ph });
    }
    if (art.secFamily === 'shield' || art.secFamily === 'parry') clips.set('sec.riposte', { base, hold: secHold, draw: [], w: [], a: [], r: riposteFrames(art), stow: stowFrames(art, false) });
  }

  // Reactions.
  const hurt: PoseKey = { lean: -0.22, head: -0.28, hipX: -0.06, hipY: -0.1, hNx: stance.hNx - 0.15, hNy: stance.hNy + 0.2, wAng: stance.wAng + 0.35, hFx: 0.1, hFy: -0.2, sway: 1 };
  clips.set('hurt', loop(stance, hold, [
    { p: hurt, face: 'hurt' },
    { p: { lean: -0.06, head: -0.12, hipX: -0.03, hipY: -0.09, sway: 0.5 }, face: 'hurt' },
  ]));
  const stunBase: PoseKey = { hipY: -0.13, lean: 0.24, head: -0.32, hNx: 0.18, hNy: -0.85, wAng: stance.wAng - 1.6, hFx: 0.15, hFy: -0.85 };
  clips.set('stun', loop(stance, hold, [
    { p: { ...stunBase }, face: 'hurt' },
    { p: { ...stunBase, lean: 0.3, hipX: 0.03, head: -0.22 }, face: 'hurt' },
    { p: { ...stunBase, lean: 0.2, head: -0.38 }, face: 'hurt' },
    { p: { ...stunBase, lean: 0.16, hipX: -0.03, head: -0.26 }, face: 'hurt' },
  ]));
  clips.set('air', loop(stance, hold, [
    { p: { lean: -0.35, head: -0.2, fNx: -0.12, fNy: -0.62, fFx: 0.22, fFy: -0.66, toeN: -0.3, hNx: 0.3, hNy: 0.15, wAng: stance.wAng + 0.6, hFx: 0.25, hFy: 0.3, sway: -1 }, face: 'hurt' },
    { p: { lean: -0.12, fNx: -0.24, fNy: -0.92, fFx: 0.3, fFy: -0.86, hNx: 0.32, hNy: -0.3, hFx: 0.4, hFy: -0.1, sway: 1 }, face: 'hurt' },
  ]));
  const lying: PoseKey = { rot: Math.PI / 2, hipY: -0.78, lean: 0, head: 0.25, fNx: 0.02, fNy: -0.98, fFx: 0.12, fFy: -0.95, toeN: 0.9, toeF: 0.8, hNx: 0.25, hNy: -0.9, elN: 1, wAng: stance.wAng - 1.6, hFx: 0.5, hFy: -0.85, sway: 0 };
  clips.set('ko', loop(stance, hold, [
    { p: { ...hurt, lean: -0.3 }, face: 'hurt' },
    { p: { ...hurt, rot: 0.5, hipY: -0.28, lean: -0.15, fNx: -0.1, fFx: 0.35, fFy: -0.9 }, face: 'hurt' },
    { p: { ...lying, rot: 1.15, hipY: -0.6, head: 0.1, fNy: -0.85, fFy: -0.8 }, face: 'ko' },
    { p: lying, face: 'ko' },
  ]));
  const cheer: PoseKey = art.family === 'bow'
    ? { hFx: 0.3, hFy: 0.85, elF: 1, wAng: 0, hNx: 0.35, hNy: 0.3 }
    : { hNx: 0.25, hNy: 0.85, elN: 1, wAng: 1.65, hFx: 0.35, hFy: twoHand ? 0.6 : -0.15 };
  clips.set('victory', loop(stance, hold, [
    { p: { ...cheer, lean: 0.0, head: 0.2, hipY: -0.03 }, face: 'shout' },
    { p: { ...cheer, hNy: (cheer.hNy ?? 0) - 0.06, hFy: (cheer.hFy ?? 0) - 0.06, lean: 0.04, head: 0.15, hipY: -0.1 }, face: 'shout' },
  ]));

  const leg = art.body.thigh + art.body.shin;
  set = { clips, runCycle: RUN_CYCLE_LEGS * leg, backCycle: BACK_CYCLE_LEGS * leg };
  clipCache.set(art, set);
  return set;
}

/** Frame `i` of a clip laid out as draw | w | a | r | stow. */
export function clipFrame(c: Clip, i: number): FrameDef {
  const parts = [c.draw, c.w, c.a, c.r, c.stow];
  for (const p of parts) {
    if (i < p.length) return p[i];
    i -= p.length;
  }
  return c.w[0] ?? c.r[c.r.length - 1];
}

export function clipLength(c: Clip): number {
  return c.draw.length + c.w.length + c.a.length + c.r.length + c.stow.length;
}

/** Resolves a frame of a clip into everything `drawFigure` needs. */
export function frameSpec(c: Clip, i: number, face: Expression | null, secOut: boolean): FrameSpec {
  const d = clipFrame(c, i);
  const hold: Hold = { ...c.hold, ...d.hold };
  if (secOut && hold.sec !== 'gone') hold.sec = 'gone';
  return { pose: { ...c.base, ...d.p }, hold, face: face ?? d.face ?? 'calm', smear: d.smear };
}
