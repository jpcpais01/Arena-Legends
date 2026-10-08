import type { BodySpec } from './body';

/**
 * A pose describes the body in proportion-free units so one animation fits
 * every body form: the pelvis offset and feet are in leg lengths, hands in
 * arm lengths, angles in radians. The rig is drawn facing right with y up;
 * "near" limbs are on the viewer's side, "far" limbs behind the body.
 *
 * In this 3/4 fighting view the far shoulder sits forward, so the far hand is
 * the lead hand (shield, bow, off-hand weapon) and the near hand holds the
 * main weapon.
 */
export interface Pose {
  /** Pelvis offset from standing (leg units). */
  hipX: number;
  hipY: number;
  /** Torso tilt, + leans forward. */
  lean: number;
  /** Head tilt, + chin up. */
  head: number;
  /** Ankle targets relative to each hip joint (leg units). */
  fNx: number; fNy: number;
  fFx: number; fFy: number;
  /** Foot pitch, + lifts the toes. */
  toeN: number;
  toeF: number;
  /** Wrist targets relative to each shoulder (arm units). */
  hNx: number; hNy: number;
  hFx: number; hFy: number;
  /** Elbow bend: 1 points the elbow down/back, −1 up/forward. */
  elN: number;
  elF: number;
  /** Main weapon angle (0 points forward, + rotates up). */
  wAng: number;
  /** Secondary item angle in the far hand. */
  sAng: number;
  /** Tail / cloth sway (−1..1), driven by motion. */
  sway: number;
  /** Whole-body rotation around the belly (rolls, tumbles, falls), + counter-clockwise. */
  rot: number;
}

export const STAND: Pose = {
  hipX: 0, hipY: -0.04, lean: 0.06, head: 0,
  fNx: -0.16, fNy: -0.95, fFx: 0.2, fFy: -0.95, toeN: 0, toeF: 0,
  hNx: 0.12, hNy: -0.9, hFx: 0.22, hFy: -0.85, elN: 1, elF: 1,
  wAng: -1.2, sAng: 0.4, sway: 0, rot: 0,
};

export type PoseKey = Partial<Pose>;

const KEYS = Object.keys(STAND) as (keyof Pose)[];

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out = { ...a };
  for (const k of KEYS) {
    if (k === 'elN' || k === 'elF') { out[k] = t < 0.5 ? a[k] : b[k]; continue; }
    out[k] = a[k] + (b[k] - a[k]) * t;
  }
  return out;
}

export type Ease = (t: number) => number;
export const ease = {
  linear: ((t) => t) as Ease,
  inOut: ((t) => t * t * (3 - 2 * t)) as Ease,
  out: ((t) => 1 - (1 - t) * (1 - t)) as Ease,
  in: ((t) => t * t) as Ease,
  /** Snappy: most of the motion happens at once (strikes). */
  snap: ((t) => 1 - Math.pow(1 - t, 4)) as Ease,
};

export interface Key {
  t: number;
  pose: PoseKey;
  /** Easing used to arrive at this key. */
  ease?: Ease;
}

/**
 * Samples a key track at t (0..1). Each key's partial pose is layered on the
 * base, so keys only list what they change.
 */
export function sample(base: Pose, keys: Key[], t: number): Pose {
  if (!keys.length) return base;
  const full = (k: Key) => ({ ...base, ...k.pose });
  if (t <= keys[0].t) return full(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t <= k.t) {
      const p = keys[i - 1];
      const u = (t - p.t) / Math.max(1e-6, k.t - p.t);
      return lerpPose(full(p), full(k), (k.ease ?? ease.inOut)(u));
    }
  }
  return full(keys[keys.length - 1]);
}

// -----------------------------------------------------------------------------
// Skeleton
// -----------------------------------------------------------------------------

export interface P { x: number; y: number }

export interface Skeleton {
  hip: P;
  /** Unit vector up the spine. */
  up: P;
  chest: P;
  neck: P;
  head: P;
  headAng: number;
  hipN: P; hipF: P;
  kneeN: P; kneeF: P;
  ankleN: P; ankleF: P;
  toeTipN: P; toeTipF: P;
  shN: P; shF: P;
  elN: P; elF: P;
  wrN: P; wrF: P;
  /** Centre of each hand (the grip point). */
  handN: P; handF: P;
}

const v = (x: number, y: number): P => ({ x, y });
const rot = (p: P, a: number): P => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });

/**
 * Two-bone IK: from root toward target with segment lengths a and b. `bend`
 * picks the side the middle joint goes (+1 = clockwise from the root→target
 * direction, i.e. down/back for an arm reaching forward).
 */
export function ik(root: P, target: P, a: number, b: number, bend: number): { mid: P; end: P } {
  let dx = target.x - root.x, dy = target.y - root.y;
  let d = Math.hypot(dx, dy);
  const maxD = a + b - 0.01, minD = Math.abs(a - b) + 0.01;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  if (d < minD) {
    if (d < 1e-4) { dx = 0; dy = -minD; } else { dx *= minD / d; dy *= minD / d; }
    d = minD;
  }
  const base = Math.atan2(dy, dx);
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
  const t = base - bend * ang;
  const mid = v(root.x + Math.cos(t) * a, root.y + Math.sin(t) * a);
  return { mid, end: v(root.x + dx, root.y + dy) };
}

/** Solves a pose into joint positions (rig space, y up, origin on the ground). */
export function solve(body: BodySpec, p: Pose, armOverride?: { far?: P; near?: P }): Skeleton {
  const leg = body.thigh + body.shin;
  const arm = body.upperArm + body.forearm;
  const standHip = body.footH + leg * 0.985;
  const hip = v(p.hipX * leg, standHip + p.hipY * leg);
  const up = rot(v(0, 1), -p.lean);
  const side = v(up.y, -up.x); // forward perpendicular to the spine
  const chest = v(hip.x + up.x * body.torso, hip.y + up.y * body.torso);
  const neck = v(chest.x + up.x * body.neck, chest.y + up.y * body.neck);
  const headAng = -p.lean * 0.5 + p.head;
  const hUp = rot(v(0, 1), headAng);
  const head = v(neck.x + hUp.x * body.headRy * 0.82 + side.x * 0.8, neck.y + hUp.y * body.headRy * 0.82 + side.y * 0.8);

  const hipN = v(hip.x - side.x * body.hipSpread, hip.y - side.y * body.hipSpread);
  const hipF = v(hip.x + side.x * body.hipSpread, hip.y + side.y * body.hipSpread);
  const ankle = (root: P, x: number, y: number) => {
    const t = v(root.x + x * leg, root.y + y * leg);
    // Feet stay on the ground, except when the whole body turns (rolls, falls).
    if (!p.rot && t.y < body.footH) t.y = body.footH;
    return t;
  };
  // Knees bend forward: from hip to ankle the knee lies counter-clockwise.
  const legN = ik(hipN, ankle(hipN, p.fNx, p.fNy), body.thigh, body.shin, -1);
  const legF = ik(hipF, ankle(hipF, p.fFx, p.fFy), body.thigh, body.shin, -1);
  const toe = (a: P, pitch: number) => v(a.x + Math.cos(pitch) * body.footLen, a.y - body.footH * 0.5 + Math.sin(pitch) * body.footLen);

  const shY = chest.y - up.y * 1.2;
  const shN = v(chest.x - side.x * body.shoulderSpread - up.x * 1.2, shY - side.y * body.shoulderSpread);
  const shF = v(chest.x + side.x * body.shoulderSpread - up.x * 1.2, shY + side.y * body.shoulderSpread);
  const wristTarget = (sh: P, x: number, y: number) => v(sh.x + x * arm, sh.y + y * arm);
  const tn = armOverride?.near ?? wristTarget(shN, p.hNx, p.hNy);
  const tf = armOverride?.far ?? wristTarget(shF, p.hFx, p.hFy);
  // Elbows: +1 keeps the elbow below/behind the line shoulder→wrist.
  const armN = ik(shN, tn, body.upperArm, body.forearm, armBend(shN, tn, p.elN));
  const armF = ik(shF, tf, body.upperArm, body.forearm, armBend(shF, tf, p.elF));
  const handOf = (el: P, wr: P) => {
    const dx = wr.x - el.x, dy = wr.y - el.y, l = Math.hypot(dx, dy) || 1;
    return v(wr.x + (dx / l) * body.hand * 0.7, wr.y + (dy / l) * body.hand * 0.7);
  };
  const sk: Skeleton = {
    hip, up, chest, neck, head, headAng,
    hipN, hipF, kneeN: legN.mid, kneeF: legF.mid, ankleN: legN.end, ankleF: legF.end,
    toeTipN: toe(legN.end, p.toeN), toeTipF: toe(legF.end, p.toeF),
    shN, shF, elN: armN.mid, elF: armF.mid, wrN: armN.end, wrF: armF.end,
    handN: handOf(armN.mid, armN.end), handF: handOf(armF.mid, armF.end),
  };
  if (p.rot) rotateSkeleton(sk, p.rot, rotPivot(body, sk));
  return sk;
}

/** The point whole-body rotations turn around (the belly). */
export function rotPivot(body: BodySpec, sk: Skeleton): P {
  return v(sk.hip.x + sk.up.x * body.torso * 0.35, sk.hip.y + sk.up.y * body.torso * 0.35);
}

/** Rotates every joint around `c` (rolls and falls). */
export function rotateSkeleton(sk: Skeleton, a: number, c: P): void {
  const cs = Math.cos(a), sn = Math.sin(a);
  for (const k of Object.keys(sk) as (keyof Skeleton)[]) {
    if (k === 'headAng') continue;
    const p = sk[k] as P;
    if (k === 'up') { sk.up = v(p.x * cs - p.y * sn, p.x * sn + p.y * cs); continue; }
    const dx = p.x - c.x, dy = p.y - c.y;
    (sk[k] as P) = v(c.x + dx * cs - dy * sn, c.y + dx * sn + dy * cs);
  }
  sk.headAng += a;
}

/**
 * Picks the IK side so `el` = 1 puts the elbow under the arm line when the
 * hand is in front, and behind it when the hand is raised overhead.
 */
function armBend(sh: P, wr: P, el: number): number {
  const dx = wr.x - sh.x;
  // Reaching forward (+x): clockwise rotation puts the elbow below.
  return (dx >= 0 ? 1 : -1) * el;
}

/** Where the hand must be so a weapon gripped there puts a point `along` the weapon. */
export function alongWeapon(grip: P, ang: number, along: number): P {
  return v(grip.x + Math.cos(ang) * along, grip.y + Math.sin(ang) * along);
}
