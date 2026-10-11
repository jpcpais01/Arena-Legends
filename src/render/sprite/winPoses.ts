import type { PoseId } from '../../character/finales';
import type { Clip, ClipSet, FrameDef } from './anims';
import type { Expression, Hold } from './draw';
import type { CharacterArt } from './look';
import type { Pose, PoseKey } from './pose';
import type { MainFamily } from './weapons';

/**
 * Victory poses: what the winner does once the fight is won. Each one is a
 * short intro played once (the move into the pose) and a loop it settles
 * into, as key frames held for their own beat, authored per weapon family:
 * a bow lives in the far hand, two-handed weapons let go with the far hand
 * when only one is needed, and poses that need both hands sling the weapon
 * on the back. The secondary stays holstered throughout.
 *
 * Built only for the pose a fighter actually uses (`ensurePose`), so the
 * sprite bank only ever draws one set of pose frames per hero.
 */

/** A key frame and how long it is held (seconds). */
type Beat = [FrameDef, number];

interface PoseSpec {
  intro: Beat[];
  loop: Beat[];
  /** Hold changes for every frame (weapon slung on the back, one hand on a two-hander). */
  hold?: Partial<Hold>;
}

interface Kit {
  fam: MainFamily;
  /** Two-handed main (not a bow). */
  two: boolean;
  /** A short stick (wand): held like a sword but never planted. */
  wand: boolean;
  stance: Pose;
}

const UPR = Math.PI / 2;
const F = (p: PoseKey, face: Expression = 'calm', hold?: Partial<Hold>): FrameDef => ({ p, face, ...(hold ? { hold } : {}) });
/** Feet a little apart, standing tall. */
const TALL: PoseKey = { hipY: -0.03, lean: 0.02, fNx: -0.16, fNy: -1, fFx: 0.18, fFy: -1, toeN: 0, toeF: 0 };

const SPECS: Record<PoseId, (k: Kit) => PoseSpec> = {
  // Weapon thrust up, a shout to the crowd (the classic, as the game always had it).
  cheer(k) {
    const up: PoseKey = k.fam === 'bow'
      ? { hFx: 0.3, hFy: 0.85, elF: 1, wAng: 0, hNx: 0.35, hNy: 0.3 }
      : { hNx: 0.25, hNy: 0.85, elN: 1, wAng: 1.65, hFx: 0.35, hFy: k.two ? 0.6 : -0.15 };
    return {
      intro: [],
      loop: [
        [F({ ...up, lean: 0, head: 0.2, hipY: -0.03 }, 'shout'), 0.25],
        [F({ ...up, hNy: (up.hNy ?? 0) - 0.06, hFy: (up.hFy ?? 0) - 0.06, lean: 0.04, head: 0.15, hipY: -0.1 }, 'shout'), 0.25],
      ],
    };
  },

  // The weapon comes up before the face, blade to the sky; the free hand at the side or a fist on the heart.
  salute(k) {
    const heels: PoseKey = { ...TALL, fNx: -0.08, fFx: 0.1, head: 0.06 };
    let lift: PoseKey, sal: PoseKey;
    if (k.fam === 'bow') {
      lift = { hFx: 0.55, hFy: -0.3, wAng: -0.4, hNx: 0.3, hNy: -0.5 };
      sal = { hFx: 0.5, hFy: -0.12, elF: 1, wAng: 0, hNx: 0.32, hNy: -0.22, elN: 1 };
    } else if (k.two) {
      lift = { hNx: 0.4, hNy: -0.35, wAng: 1.3, hFx: 0.3, hFy: -0.5 };
      sal = { hNx: 0.36, hNy: -0.3, elN: 1, wAng: UPR, hFx: 0.06, hFy: -0.3, elF: 1 };
    } else {
      lift = { hNx: 0.42, hNy: -0.25, wAng: 1.25, hFx: 0.2, hFy: -0.7 };
      sal = { hNx: 0.3, hNy: 0.1, elN: 1, wAng: UPR, hFx: 0.12, hFy: -0.86 };
    }
    return {
      hold: k.two ? { oneHand: true } : undefined,
      intro: [
        [F({ ...k.stance, ...lift, ...heels, hipY: -0.06 }, 'calm'), 0.1],
        [F({ ...sal, ...heels, hipY: -0.01, head: 0.12 }, 'fierce'), 0.14],
        [F({ ...sal, ...heels }, 'fierce'), 0.9],
      ],
      loop: [
        [F({ ...sal, ...heels }, 'calm'), 0.7],
        [F({ ...sal, ...heels, hipY: -0.045, head: 0.03, hNy: (sal.hNy ?? 0) - 0.02, hFy: (sal.hFy ?? 0) - 0.02 }, 'calm'), 0.7],
      ],
    };
  },

  // Weapon slung on the back, both arms curl up and the chest goes out: twice, then a held pump.
  flex() {
    const wide: PoseKey = { fNx: -0.32, fNy: -1, fFx: 0.34, fFy: -1, toeN: 0, toeF: 0 };
    const a: PoseKey = { ...wide, hipY: -0.09, lean: -0.12, head: 0.16, hNx: -0.62, hNy: 0.3, elN: 1, hFx: 0.66, hFy: 0.34, elF: 1, sway: -0.6 };
    const b: PoseKey = { ...wide, hipY: -0.05, lean: -0.06, head: 0.08, hNx: -0.56, hNy: 0.4, elN: 1, hFx: 0.6, hFy: 0.46, elF: 1, sway: 0.3 };
    const down: PoseKey = { ...wide, hipY: -0.16, lean: 0.24, head: -0.1, hNx: 0.2, hNy: -0.7, hFx: 0.3, hFy: -0.7, sway: 0.6 };
    return {
      hold: { main: 'back' },
      intro: [[F(down, 'fierce'), 0.14], [F(a, 'shout'), 0.32], [F(down, 'fierce'), 0.12]],
      loop: [[F(a, 'shout'), 0.45], [F(b, 'fierce'), 0.18], [F(a, 'shout'), 0.18], [F(b, 'fierce'), 0.4]],
    };
  },

  // A deep, slow bow from the waist, weapon lowered, the free hand on the heart; then up, calm and proud.
  bow(k) {
    let low: PoseKey;
    if (k.fam === 'bow') low = { hFx: 0.3, hFy: -0.82, elF: 1, wAng: -0.25, hNx: 0.24, hNy: -0.3, elN: 1 };
    else if (k.two) low = { hNx: 0.3, hNy: -0.5, elN: 1, wAng: UPR, hFx: 0.1, hFy: -0.3, elF: 1 };
    else low = { hNx: 0.12, hNy: -0.9, wAng: -1.35, hFx: 0.1, hFy: -0.3, elF: 1 };
    const up: PoseKey = { ...low, ...TALL, fNx: -0.1, fFx: 0.12 };
    const bowed: PoseKey = { ...up, lean: 1.15, head: -0.3, hipX: -0.1, hipY: -0.06 };
    const half: PoseKey = { ...up, lean: 0.5, head: -0.1, hipX: -0.03 };
    return {
      hold: k.two ? { oneHand: true } : undefined,
      intro: [[F(up, 'calm'), 0.25], [F(half, 'calm'), 0.1], [F(bowed, 'blink'), 0.95], [F(half, 'calm'), 0.12]],
      loop: [[F({ ...up, head: 0.08 }, 'calm'), 0.8], [F({ ...up, head: 0.06, hipY: -0.05 }, 'calm'), 0.8]],
    };
  },

  // A spin of the weapon in front (blade smears round), then it is planted and leaned on.
  twirl(k) {
    const spin: Beat[] = [];
    const bow = k.fam === 'bow';
    for (let i = 0; i < 12; i++) {
      const a = 1.2 - (i + 1) * (Math.PI / 3), from = a + Math.PI / 3;
      const p: PoseKey = bow
        ? { hFx: 0.62, hFy: -0.1, elF: 1, wAng: a, hNx: 0.25, hNy: -0.5, lean: 0.08 }
        : { hNx: 0.55, hNy: -0.15, elN: 1, wAng: a, hFx: 0.2, hFy: -0.6, lean: 0.08 };
      spin.push([F({ ...p, hipY: -0.06 - 0.02 * (i & 1) }, i < 10 ? 'fierce' : 'shout', bow ? undefined : { ...(k.two ? { oneHand: true } : {}) }), i < 10 ? 0.045 : 0.06]);
      // Every other frame smears, so the spin reads as a whirl rather than a fan.
      if (!bow && i & 1) spin[i][0].smear = { from: from + Math.PI / 3, to: a };
    }
    let rest: PoseKey;
    if (bow) rest = { hFx: 0.45, hFy: -0.55, elF: 1, wAng: 0, hNx: -0.18, hNy: -0.6, elN: -1 };
    else if (k.wand) rest = { hNx: 0.4, hNy: -0.15, elN: 1, wAng: 1.2, hFx: 0.0, hFy: -0.62, elF: -1 };
    else if (k.fam === 'polearm' || k.fam === 'staff') rest = { hNx: 0.42, hNy: -0.15, elN: 1, wAng: UPR, hFx: 0.0, hFy: -0.62, elF: -1 };
    else rest = { hNx: 0.42, hNy: -0.62, elN: 1, wAng: -UPR, hFx: 0.42, hFy: -0.5, elF: 1 };
    const plant = k.two && rest.wAng === -UPR ? {} : k.two ? { oneHand: true } : {};
    const settle: PoseKey = { ...TALL, ...rest, lean: 0.14, hipY: -0.06 };
    return {
      intro: [...spin, [F({ ...settle, hipY: -0.12, lean: 0.2 }, 'fierce', plant), 0.12], [F(settle, 'fierce', plant), 0.6]],
      loop: [[F({ ...settle, head: 0.06 }, 'calm', plant), 0.7], [F({ ...settle, hipY: -0.085, head: 0.02 }, 'calm', plant), 0.7]],
    };
  },

  // Fists on the hips, chin up, a belly laugh that shakes the whole body.
  hips() {
    const base: PoseKey = { ...TALL, fNx: -0.26, fFx: 0.28, hNx: -0.18, hNy: -0.6, elN: -1, hFx: 0.06, hFy: -0.62, elF: -1, wAng: -1.6 };
    const ha: PoseKey = { ...base, lean: -0.14, head: 0.32, hipY: -0.05 };
    const ho: PoseKey = { ...base, lean: -0.06, head: 0.18, hipY: -0.09 };
    return {
      hold: { main: 'back' },
      intro: [[F({ ...base, lean: 0.1 }, 'calm'), 0.18]],
      loop: [
        [F(ha, 'shout'), 0.13], [F(ho, 'shout'), 0.13], [F(ha, 'shout'), 0.13], [F(ho, 'shout'), 0.13],
        [F(ha, 'shout'), 0.13], [F({ ...base, head: 0.1, lean: 0.02 }, 'calm'), 0.9],
      ],
    };
  },

  // Down on one knee, palms together, eyes closed: a slow breath in and out.
  meditate() {
    const kneel: PoseKey = {
      hipY: -0.47, hipX: -0.02, lean: 0.04, head: -0.1,
      fNx: -0.55, fNy: -1, toeN: -0.7, fFx: 0.34, fFy: -1, toeF: 0,
      hNx: 0.42, hNy: -0.22, elN: 1, hFx: 0.3, hFy: -0.22, elF: 1, sway: 0,
    };
    return {
      hold: { main: 'back' },
      intro: [
        [F({ ...kneel, hipY: -0.18, lean: 0.2, hNy: -0.5, hFy: -0.5, fNx: -0.35 }, 'calm'), 0.14],
        [F({ ...kneel, hipY: -0.38, lean: 0.12 }, 'calm'), 0.14],
      ],
      loop: [
        [F(kneel, 'blink'), 0.9],
        [F({ ...kneel, hipY: -0.455, lean: 0.02, head: -0.06, hNy: -0.2, hFy: -0.2 }, 'blink'), 0.9],
      ],
    };
  },

  // A crouch, then the weapon thrust straight up at the sky, chin up, holding it there.
  skyward(k) {
    const bow = k.fam === 'bow';
    const up: PoseKey = bow
      ? { hFx: 0.14, hFy: 0.98, elF: 1, wAng: UPR, hNx: 0.12, hNy: -0.86 }
      : { hNx: 0.1, hNy: 0.98, elN: 1, wAng: UPR, hFx: 0.18, hFy: -0.86 };
    const low: PoseKey = bow
      ? { hFx: 0.4, hFy: -0.5, wAng: 0.4, hNx: 0.3, hNy: -0.6 }
      : { hNx: 0.35, hNy: -0.5, wAng: 0.5, hFx: 0.3, hFy: -0.6 };
    const stand: PoseKey = { ...TALL, ...up, lean: -0.06, head: 0.34 };
    return {
      hold: k.two ? { oneHand: true } : undefined,
      intro: [
        [F({ ...TALL, ...low, hipY: -0.18, lean: 0.28, head: -0.15 }, 'fierce'), 0.18],
        [F({ ...stand, hipY: 0, lean: -0.1 }, 'shout'), 0.12],
        [F(stand, 'shout'), 0.7],
      ],
      loop: [[F(stand, 'calm'), 0.6], [F({ ...stand, hipY: -0.05, head: 0.3 }, 'calm'), 0.6]],
    };
  },

  // One foot up on a rock, the weapon resting on the shoulder, the cloth streaming in the wind.
  champion(k) {
    const bow = k.fam === 'bow';
    const legs: PoseKey = { hipY: -0.1, lean: 0.14, head: 0.12, fNx: -0.3, fNy: -1, toeN: 0, fFx: 0.4, fFy: -0.66, toeF: 0.1 };
    const arms: PoseKey = bow
      ? { hFx: 0.48, hFy: -0.6, elF: 1, wAng: 0.1, hNx: -0.18, hNy: -0.6, elN: -1 }
      : { hNx: 0.14, hNy: -0.08, elN: 1, wAng: 2.55, hFx: 0.45, hFy: -0.62, elF: 1 };
    const pose = { ...legs, ...arms };
    return {
      hold: k.two ? { oneHand: true } : undefined,
      intro: [
        [F({ ...TALL, ...arms, hipY: -0.14, lean: 0.25 }, 'fierce'), 0.12],
        [F({ ...pose, hipY: -0.04 }, 'shout'), 0.14],
        [F(pose, 'fierce'), 0.25],
      ],
      loop: [
        [F({ ...pose, sway: -1 }, 'fierce'), 0.22], [F({ ...pose, sway: -0.55, head: 0.14 }, 'fierce'), 0.22],
        [F({ ...pose, sway: -0.85, hipY: -0.115 }, 'fierce'), 0.22], [F({ ...pose, sway: -0.4, head: 0.1 }, 'fierce'), 0.22],
      ],
    };
  },
};

const key = (id: PoseId): string => 'pose.' + id;

/** The clip for a victory pose. */
export function poseClip(art: CharacterArt, base: Pose, hold: Hold, id: PoseId): Clip {
  const kit: Kit = { fam: art.family, two: art.hands === 2 && art.family !== 'bow', wand: art.family === 'wand', stance: base };
  const s = SPECS[id](kit);
  const beats = [...s.intro, ...s.loop];
  return {
    draw: [], a: [], r: [], stow: [], base, hold: { ...hold, ...s.hold },
    w: beats.map(([f]) => f),
    beats: beats.map(([, d]) => d),
    loopFrom: s.intro.length,
  };
}

/** Adds a pose's clip to a fighter's clips if it is not there yet; returns its name. */
export function ensurePose(set: ClipSet, art: CharacterArt, id: PoseId): string {
  const k = key(id);
  if (!set.clips.has(k)) {
    const idle = set.clips.get('idle')!;
    set.clips.set(k, poseClip(art, idle.base, idle.hold, id));
  }
  return k;
}

/** Which frame of a pose clip shows `t` seconds in: the intro once, then the loop over and over. */
export function poseFrame(c: Clip, t: number): number {
  const b = c.beats ?? [];
  const from = c.loopFrom ?? 0;
  let i = 0;
  for (; i < from; i++) {
    if (t < b[i]) return i;
    t -= b[i];
  }
  let len = 0;
  for (let j = from; j < b.length; j++) len += b[j];
  if (len <= 0) return Math.max(0, b.length - 1);
  t %= len;
  for (i = from; i < b.length - 1; i++) {
    if (t < b[i]) return i;
    t -= b[i];
  }
  return i;
}

/** Seconds until a pose settles into its loop. */
export function poseIntro(c: Clip): number {
  let s = 0;
  for (let i = 0; i < (c.loopFrom ?? 0); i++) s += c.beats?.[i] ?? 0;
  return s;
}

/**
 * Stances the finishers put the winner in while they play: `fin.lower` (the
 * weapon lowered, at rest) and `fin.call` (an arm thrust out at the fallen,
 * commanding). One frame each.
 */
export function ensureFinClips(set: ClipSet, art: CharacterArt): void {
  if (set.clips.has('fin.lower')) return;
  const idle = set.clips.get('idle')!;
  const bow = art.family === 'bow', two = art.hands === 2 && !bow;
  const lower: PoseKey = bow
    ? { hFx: 0.28, hFy: -0.84, elF: 1, wAng: -0.3, hNx: 0.1, hNy: -0.86 }
    : two ? { hNx: 0.12, hNy: -0.86, wAng: -2.3, hFx: 0.2, hFy: -0.84 }
      : { hNx: 0.14, hNy: -0.88, wAng: -1.4, hFx: 0.2, hFy: -0.84 };
  const call: PoseKey = bow
    ? { hFx: 0.95, hFy: 0.3, elF: 1, wAng: 0.2, hNx: 0.2, hNy: -0.5 }
    : { hNx: 0.85, hNy: 0.32, elN: 1, wAng: 0.75, hFx: 0.7, hFy: 0.1, elF: 1 };
  const one = (p: PoseKey, face: Expression): Clip => ({
    draw: [], a: [], r: [], stow: [], base: idle.base, hold: { ...idle.hold, ...(two ? { oneHand: true } : {}) }, w: [F(p, face)],
  });
  set.clips.set('fin.lower', one({ ...TALL, ...lower, lean: 0.04, head: -0.04, fNx: -0.1, fFx: 0.12 }, 'calm'));
  set.clips.set('fin.call', one({ ...lower, ...call, hipY: -0.12, lean: 0.16, head: 0.1, fNx: -0.34, fNy: -1, fFx: 0.38, fFy: -1 }, 'shout'));
}
