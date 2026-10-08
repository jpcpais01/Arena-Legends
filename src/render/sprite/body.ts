import type { SpeciesId } from '../../character/appearance';
import type { FormId } from '../../sim/types';

/**
 * Body measurements in art pixels (one pixel of the low-resolution screen).
 * A Balanced body stands about 58 px to the top of the head.
 */
export interface BodySpec {
  footH: number;
  shin: number;
  thigh: number;
  footLen: number;
  torso: number;
  neck: number;
  headRx: number;
  headRy: number;
  upperArm: number;
  forearm: number;
  hand: number;
  thighR: number;
  kneeR: number;
  shinR: number;
  ankleR: number;
  armR: number;
  elbowR: number;
  wristR: number;
  chestW: number;
  waistW: number;
  hipW: number;
  /** Horizontal gap between the near and far shoulder (3/4 view). */
  shoulderSpread: number;
  hipSpread: number;
  /** Chest depth that pushes forward (pecs, plate). */
  chestPush: number;
}

interface Shape {
  height: number;
  bulk: number;
  shoulders: number;
  limbs: number;
  head: number;
}

/** Proportions per body form (relative to Balanced). */
export const FORM_SHAPE: Record<FormId, Shape> = {
  robust: { height: 1.1, bulk: 1.3, shoulders: 1.18, limbs: 0.98, head: 0.94 },
  agile: { height: 0.88, bulk: 0.86, shoulders: 0.95, limbs: 1.0, head: 1.08 },
  balanced: { height: 1, bulk: 1, shoulders: 1, limbs: 1, head: 1 },
  slender: { height: 1.12, bulk: 0.82, shoulders: 0.95, limbs: 1.12, head: 0.95 },
  mighty: { height: 1.04, bulk: 1.18, shoulders: 1.32, limbs: 1.02, head: 0.92 },
  ethereal: { height: 1.03, bulk: 0.8, shoulders: 0.9, limbs: 1.05, head: 1.0 },
};

/** Species tweak the build a little on top of the form (looks only). */
const SPECIES_SHAPE: Record<SpeciesId, Shape> = {
  kitsu: { height: 1, bulk: 0.97, shoulders: 1, limbs: 1.02, head: 1 },
  lop: { height: 0.97, bulk: 0.95, shoulders: 0.96, limbs: 1, head: 1.04 },
  imp: { height: 0.95, bulk: 0.95, shoulders: 1, limbs: 1, head: 1.04 },
  ogrin: { height: 1.02, bulk: 1.14, shoulders: 1.1, limbs: 0.98, head: 0.98 },
  wisp: { height: 1.02, bulk: 0.9, shoulders: 0.95, limbs: 1.04, head: 1 },
  golem: { height: 1.04, bulk: 1.18, shoulders: 1.16, limbs: 0.97, head: 0.94 },
};

export function bodyFor(form: FormId, species: SpeciesId): BodySpec {
  const f = FORM_SHAPE[form], s = SPECIES_SHAPE[species];
  const H = f.height * s.height;
  const B = f.bulk * s.bulk;
  const S = f.shoulders * s.shoulders;
  const L = f.limbs * s.limbs;
  const hd = f.head * s.head;
  // Limbs grow with height and their own factor; the torso takes up the rest.
  return {
    footH: 2,
    shin: 11.5 * H * L,
    thigh: 11.5 * H * L,
    footLen: 5.5 * (0.8 + 0.2 * B),
    torso: 17 * H * (2 - L) ,
    neck: 2.5 * H,
    headRx: 6.2 * hd * (0.9 + 0.1 * B),
    headRy: 6.4 * hd,
    upperArm: 9 * H * L,
    forearm: 8.2 * H * L,
    hand: 1.9 * (0.85 + 0.15 * B),
    thighR: 3.1 * B,
    kneeR: 2.3 * B,
    shinR: 2.3 * B,
    ankleR: 1.5 * (0.8 + 0.2 * B),
    armR: 2.1 * B * (0.85 + 0.15 * S),
    elbowR: 1.75 * B,
    wristR: 1.35 * (0.8 + 0.2 * B),
    chestW: 5.6 * B * (0.6 + 0.4 * S),
    waistW: 4.2 * B,
    hipW: 4.8 * B,
    shoulderSpread: 2.2 * S,
    hipSpread: 1.2 * B,
    chestPush: 1 + 0.6 * (B - 1),
  };
}
