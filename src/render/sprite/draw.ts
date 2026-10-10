import { mix as mixHex } from '../pixel/color';
import { material, type Material, type Raster } from '../pixel/raster';
import {
  arc, capsule as capsuleR, circle as circleR, ellipse as ellipseR, intersect, polygon as polyR, subtract, union, type Shape,
} from '../pixel/sdf';
import { SPECIES } from '../../character/appearance';
import { stockHead } from './armour2';
import type { CharacterArt } from './look';
import { alongWeapon, rotateSkeleton, rotPivot, solve, type P, type Pose, type Skeleton } from './pose';
import { frameAt, Xf } from './xform';

/**
 * Draws one frame of a character into a raster: body, clothes, armour,
 * species features, face and the weapons in (or away from) its hands.
 * Everything faces right; the renderer mirrors sprites facing left.
 */

export type Expression = 'calm' | 'fierce' | 'hurt' | 'ko' | 'shout' | 'blink';

export interface Hold {
  /** Main weapon: in hand, or slung on the back while the secondary is out. */
  main: 'hand' | 'back' | 'none';
  /** Secondary: in the far hand, holstered, or away (thrown). */
  sec: 'hand' | 'stowed' | 'gone';
  /** Shield-like items held in front of the torso rather than behind it. */
  secFront?: boolean;
  /** Draw the main weapon behind the body (big back-swings). */
  mainBehind?: boolean;
  /** Bow/crossbow string pull 0..1. */
  pull?: number;
  /** Main weapon length scale: foreshortened while it swings past the viewer (negative points it back). */
  mainScale?: number;
  /** Usable item: on the belt (default when one is carried), in the far hand, or used up. */
  use?: 'belt' | 'hand' | 'none';
  /** The item in hand is uncorked (drinking). */
  uncorked?: boolean;
  /** The item in hand is behind the head and body (wound back for a throw). */
  useBehind?: boolean;
  /** A two-handed main held in the near hand only (the far hand is busy with an item). */
  oneHand?: boolean;
}

export interface Smear {
  /** Weapon angles (rig radians) the swing sweeps between. */
  from: number;
  to: number;
  /** Horizontal whirl around the waist instead of an arc. */
  ring?: boolean;
}

export interface FrameSpec {
  pose: Pose;
  hold: Hold;
  face: Expression;
  smear?: Smear;
  /** Extra glow drawn around the body (iron skin, barrier...). Handled by the renderer. */
}

/** Groups: contour lines appear where different groups overlap. */
const G = {
  torso: 1, armF: 2, armN: 3, legF: 4, legN: 5, main: 6, sec: 7, head: 8, hair: 9, tail: 10,
  ears: 11, cape: 12, headgear: 13, skirt: 14, smear: 15,
} as const;

/** Where the last drawn figure's weapon tips were (raster space, in hand only), for legendary sparkles. */
export const figureMarks: { tip: [number, number] | null; secTip: [number, number] | null } = { tip: null, secTip: null };

export function drawFigure(r: Raster, art: CharacterArt, spec: FrameSpec, OX: number, OY: number): Skeleton {
  const { body, chest } = art;
  // Feral bodies stay coiled: the spine tips forward and the hips sink, the head stays level.
  const pose = body.hunch || body.crouch
    ? { ...spec.pose, lean: spec.pose.lean + body.hunch, head: spec.pose.head + body.hunch * 0.75, hipY: spec.pose.hipY - body.crouch }
    : spec.pose;
  const hold = spec.hold;
  const h: Record<string, number> = {};
  for (const [k, v] of Object.entries(art.mats)) h[k] = r.add(v);
  const m = (k: string) => h[k];

  // Two-handed weapons: the far hand rides the shaft. Solved upright, then
  // the whole skeleton turns for rolls and falls.
  const upright = pose.rot ? { ...pose, rot: 0 } : pose;
  let sk = solve(body, upright);
  const twoHanded = hold.main === 'hand' && !hold.oneHand && art.main.grip2 !== undefined && art.family !== 'bow';
  if (twoHanded) {
    const g2 = alongWeapon(sk.handN, pose.wAng, art.main.grip2!);
    sk = solve(body, upright, { far: backFromHand(sk.elF, g2, body.hand) });
    sk.handF = g2;
  }
  if (pose.rot) rotateSkeleton(sk, pose.rot, rotPivot(body, sk));

  const X = (p: P) => OX + p.x;
  const Y = (p: P) => OY - p.y;
  const T = frameAt(OX, OY, sk.hip, -pose.lean + pose.rot);
  const H = frameAt(OX, OY, sk.head, sk.headAng, body.headRx / 6.2, body.headRy / 6.4);
  const sp = art.look.species;
  const sway = pose.sway;
  figureMarks.tip = null;
  figureMarks.secTip = null;
  // Skin textures on clothes and armour follow the torso (and the head, below).
  r.space = T;

  // --- Behind everything: tail, cape, long hair, slung gear --------------------
  drawTail(r, art, T, m, sway);
  if (sp === 'human' && !chest.noScarf) drawScarfTails(r, art, T, m, sway);
  if (chest.cape) drawCape(r, T, body.torso, m(chest.cape), sway);
  chest.back?.(r, T, m, { top: body.torso, sway, body, g: G.cape });
  if (sp === 'imp' && !chest.cape) drawWings(r, art, T, m, sway);
  drawHairBack(r, art, H, m, sway);
  if (hold.main === 'back') drawMainOnBack(r, art, sk, OX, OY, m);
  if (hold.sec === 'stowed' && art.secFamily === 'shield') drawSecHolster(r, art, sk, T, OX, OY, m, true);
  if (hold.main === 'hand' && hold.mainBehind) drawMain(r, art, sk, pose, hold, OX, OY, m, -1);

  // --- Far side -------------------------------------------------------------------
  if (hold.sec === 'hand' && !hold.secFront) drawSec(r, art, sk, pose, hold, OX, OY, m, -1);
  drawArm(r, art, sk, 'F', X, Y, m, T.ang);
  // A cestus stays on the off fist when it isn't punching.
  if (hold.sec === 'stowed' && art.sec && art.secFamily === 'fist') {
    art.sec.draw(r, frameAt(OX, OY, sk.handF, Math.atan2(sk.handF.y - sk.elF.y, sk.handF.x - sk.elF.x)), (k) => m('s.' + k), { group: G.sec, toneBias: -1 });
  }
  if (art.use && hold.use === 'hand' && hold.useBehind) drawUseHand(r, art, sk, pose, hold, OX, OY, m);
  if (art.family === 'bow' && hold.main === 'hand') drawMain(r, art, sk, pose, hold, OX, OY, m, 0);
  drawLeg(r, art, sk, 'F', X, Y, m);

  // --- Body -------------------------------------------------------------------------
  drawTorso(r, art, sk, T, X, Y, m);
  if (hold.sec === 'stowed' && art.secFamily !== 'shield' && art.secFamily !== 'fist') drawSecHolster(r, art, sk, T, OX, OY, m, false);
  drawLeg(r, art, sk, 'N', X, Y, m);
  if (sp === 'human' && !chest.noScarf) drawScarfWrap(r, art, T, m);
  if (sp === 'myco' && !chest.hood) drawVeil(r, art, T, m);
  if (chest.skirt > 0) drawSkirt(r, art, T, sk, m(chest.skirtMat), sway, m(chest.trim ?? chest.skirtMat));
  else drawHem(r, art, T, m);
  chest.over?.(r, T, m, { top: body.torso, sway, body, g: G.cape });
  if (art.use && (hold.use ?? 'belt') === 'belt') drawUseBelt(r, art, T, m);

  // --- Head -------------------------------------------------------------------------
  r.space = H;
  drawEarsBehind(r, art, H, m);
  drawHead(r, art, H, m);
  drawFace(r, art, H, spec.face, m);
  drawHairFront(r, art, H, m);
  drawEarsFront(r, art, H, m, sp);
  drawHeadgear(r, art, H, m, sway);
  r.space = T;

  // --- Front --------------------------------------------------------------------------
  if (hold.sec === 'hand' && hold.secFront) drawSec(r, art, sk, pose, hold, OX, OY, m, 0);
  if (spec.smear && hold.main === 'hand') drawSmear(r, art, sk, { ...spec.smear, from: spec.smear.from + pose.rot, to: spec.smear.to + pose.rot }, OX, OY);
  if (hold.main === 'hand' && !hold.mainBehind && art.family !== 'bow') drawMain(r, art, sk, pose, hold, OX, OY, m, 0);
  if (art.use && hold.use === 'hand' && !hold.useBehind) drawUseHand(r, art, sk, pose, hold, OX, OY, m);
  drawArm(r, art, sk, 'N', X, Y, m, T.ang);
  if (sp === 'wisp' || sp === 'myco') drawMotes(r, art, T, m, sway);
  r.space = null;
  return sk;
}

/** Wrist position that puts the hand's centre at `grip`, coming from the elbow side. */
function backFromHand(el: P, grip: P, hand: number): P {
  const dx = grip.x - el.x, dy = grip.y - el.y, l = Math.hypot(dx, dy) || 1;
  return { x: grip.x - (dx / l) * hand * 0.7, y: grip.y - (dy / l) * hand * 0.7 };
}

// -----------------------------------------------------------------------------
// Limbs
// -----------------------------------------------------------------------------

function drawLeg(r: Raster, art: CharacterArt, sk: Skeleton, side: 'N' | 'F', X: (p: P) => number, Y: (p: P) => number, m: (k: string) => number): void {
  const { body, boots } = art;
  const far = side === 'F';
  const g = far ? G.legF : G.legN;
  const bias = far ? -1 : 0;
  const hip = far ? sk.hipF : sk.hipN, knee = far ? sk.kneeF : sk.kneeN, ankle = far ? sk.ankleF : sk.ankleN;
  const toe = far ? sk.toeTipF : sk.toeTipN;
  const cap = (a: P, b: P, ra: number, rb: number) => capsuleR(X(a), Y(a), X(b), Y(b), ra, rb);
  const L = art.legs;
  const pants = m(L.mat ?? 'pants');
  const lb = L.mat ? L.bulk : 0;
  // Leg armour textures follow the thigh: x up from the knee, y toward the front.
  const torsoSpace = r.space;
  const thigh = new Xf(X(knee), Y(knee), Math.atan2(hip.y - knee.y, hip.x - knee.x), 1, -1);
  if (L.mat) r.space = thigh;
  r.fill(cap(hip, knee, body.thighR + lb, body.kneeR + lb * 0.7), pants, { group: g, bevel: 2.6, toneBias: bias });
  const bt = { x: ankle.x + (knee.x - ankle.x) * boots.height, y: ankle.y + (knee.y - ankle.y) * boots.height };
  if (boots.height < 0.98) r.fill(cap(knee, bt, body.kneeR * 0.95 + lb * 0.5, body.shinR + lb * 0.4), pants, { group: g, bevel: 2.2, toneBias: bias });
  if (L.mat) drawLegArmour(r, art, thigh, Math.hypot(hip.x - knee.x, hip.y - knee.y), far, g, bias, m);
  const bulk = boots.bulk;
  // Boot textures follow the shin: x up from the ankle, y toward the front.
  const shin = new Xf(X(ankle), Y(ankle), Math.atan2(knee.y - ankle.y, knee.x - ankle.x), 1, -1);
  r.space = shin;
  r.fill(cap(bt, ankle, body.shinR + bulk, body.ankleR + bulk * 0.8), m(boots.mat), { group: g, bevel: 2, toneBias: bias });
  // Foot: heel to toe.
  const heel = { x: ankle.x - 1.1, y: ankle.y - body.footH * 0.55 };
  r.fill(cap(heel, toe, body.ankleR + 0.3 + bulk * 0.6, 1.15 + bulk * 0.4), m(boots.mat), { group: g, bevel: 1.6, toneBias: bias });
  if (boots.trim) {
    // A cuff band across the top of the boot.
    const dx = knee.x - ankle.x, dy = knee.y - ankle.y, l = Math.hypot(dx, dy) || 1;
    const w = body.shinR + bulk + 0.4;
    const nx = -dy / l * w, ny = dx / l * w;
    const c = { x: bt.x - dx / l * 0.6, y: bt.y - dy / l * 0.6 };
    r.fill(cap({ x: c.x - nx, y: c.y - ny }, { x: c.x + nx, y: c.y + ny }, 0.9, 0.9), m(boots.trim), { group: g, bevel: 0.8, toneBias: bias });
  }
  if (boots.knee) r.fill(circleR(X(knee) + 0.6, Y(knee), body.kneeR + 0.9), m(boots.knee), { group: g, bevel: 1.8, toneBias: bias });
  if (L.shin || boots.over) {
    // Foot frame: x toward the toe, y up.
    const len = Math.hypot(knee.x - ankle.x, knee.y - ankle.y);
    const foot = new Xf(X(ankle), Y(ankle), Math.atan2(toe.y - ankle.y, toe.x - ankle.x));
    const c = { g, bias, far, body, len, top: len * boots.height, w: body.shinR + bulk, toe: Math.hypot(toe.x - ankle.x, toe.y - ankle.y) };
    L.shin?.(r, shin, foot, m, c);
    if (boots.wing && !far) drawBootWing(r, X(ankle), Y(ankle) - 1, m(boots.wing));
    boots.over?.(r, shin, foot, m, c);
  } else if (boots.wing && !far) drawBootWing(r, X(ankle), Y(ankle) - 1, m(boots.wing));
  r.space = torsoSpace;
}

function drawBootWing(r: Raster, ax: number, ay: number, wing: number): void {
  r.fill(polyR([ax - 1, ay, ax - 6, ay - 4, ax - 5, ay - 1.5, ax - 7, ay - 1, ax - 4, ay + 1]), wing, { group: G.legN, bevel: 1.2 });
}

function drawArm(r: Raster, art: CharacterArt, sk: Skeleton, side: 'N' | 'F', X: (p: P) => number, Y: (p: P) => number, m: (k: string) => number, lean: number): void {
  const { body, chest } = art;
  const far = side === 'F';
  const g = far ? G.armF : G.armN;
  const bias = far ? -1 : 0;
  const sh = far ? sk.shF : sk.shN, el = far ? sk.elF : sk.elN, wr = far ? sk.wrF : sk.wrN, hand = far ? sk.handF : sk.handN;
  const cap = (a: P, b: P, ra: number, rb: number) => capsuleR(X(a), Y(a), X(b), Y(b), ra, rb);
  const sleeveEnd = { x: sh.x + (el.x - sh.x) * chest.sleeveLen, y: sh.y + (el.y - sh.y) * chest.sleeveLen };
  if (chest.sleeve && chest.sleeveLen < 1) r.fill(cap(sleeveEnd, el, body.armR * 0.92, body.elbowR), m('skin'), { group: g, bevel: 2, toneBias: bias });
  if (chest.sleeve) r.fill(cap(sh, sleeveEnd, body.armR + 0.35, body.armR + (chest.sleeveLen >= 1 ? 0.1 : 0.25)), m(chest.sleeve), { group: g, bevel: 2.2, toneBias: bias });
  else r.fill(cap(sh, el, body.armR, body.elbowR), m('skin'), { group: g, bevel: 2, toneBias: bias });
  const fore = chest.forearm ?? 'skin';
  r.fill(cap(el, wr, body.elbowR, body.wristR + (chest.forearm ? 0.35 : 0)), m(fore), { group: g, bevel: 1.8, toneBias: bias });
  if (chest.forearm && chest.forearm !== 'robe') {
    // Cuff at the wrist end of the bracer.
    const c = { x: wr.x + (el.x - wr.x) * 0.15, y: wr.y + (el.y - wr.y) * 0.15 };
    r.fill(circleR(X(c), Y(c), body.wristR + 0.75), m(fore), { group: g, bevel: 1.2, toneBias: bias });
  }
  if (chest.pauldron) {
    r.fill(ellipseR(X(sh) - 0.3, Y(sh) - 0.4, body.armR + 1.7, body.armR + 1.2, 0), m(chest.pauldron), { group: g, bevel: 2.2, toneBias: bias });
    if (chest.spikes) r.fill(polyR([X(sh) - 2, Y(sh) - 2.2, X(sh) - 1, Y(sh) - 6, X(sh) + 0.6, Y(sh) - 2.5]), m(chest.spikes), { group: g, bevel: 1, toneBias: bias });
  }
  chest.shoulder?.(r, new Xf(X(sh), Y(sh), lean), m, { g, bias, far, body });
  const sp = art.look.species;
  if (sp === 'golem' && !chest.pauldron) {
    // A slab of shoulder stone with moss on top, crystals breaking through on the near side.
    r.fill(polyR([X(sh) - 3.4, Y(sh) + 1, X(sh) - 2.6, Y(sh) - 2.8, X(sh) + 1.4, Y(sh) - 3.2, X(sh) + 3, Y(sh) + 0.6]), m('skin'), { group: g, bevel: 1.8, toneBias: bias });
    r.fill(ellipseR(X(sh) - 0.8, Y(sh) - 2.9, 2.6, 0.9, 0.1), m('moss'), { group: g, bevel: 0.8, noLine: true, toneBias: bias });
    if (!far) {
      r.fill(polyR([X(sh) - 2.5, Y(sh) - 2.5, X(sh) - 1.6, Y(sh) - 7, X(sh) - 0.2, Y(sh) - 2.8]), m('gem'), { group: g });
      r.fill(polyR([X(sh) - 0.2, Y(sh) - 2.8, X(sh) + 1.2, Y(sh) - 5.4, X(sh) + 1.8, Y(sh) - 2.4]), m('gem'), { group: g });
    }
  } else if (sp === 'myco' && !far && !chest.pauldron) {
    // A little mushroom sprouting from the shoulder.
    r.fill(capsuleR(X(sh) - 1, Y(sh) - 2, X(sh) - 1.4, Y(sh) - 4.2, 0.6, 0.5), m('gill'), { group: g, bevel: 0.6 });
    r.fill(intersect(ellipseR(X(sh) - 1.4, Y(sh) - 4.2, 2, 1.7, 0), polyR([X(sh) - 4, Y(sh) - 4.2, X(sh) + 1, Y(sh) - 4.2, X(sh) + 1, Y(sh) - 7, X(sh) - 4, Y(sh) - 7])), m('cap'), { group: g, bevel: 1 });
    r.dot(Math.floor(X(sh) - 1.6), Math.floor(Y(sh) - 5.2), m('capSpot'), 3, g);
  }
  // Golems and ogrins have big fists.
  const fist = sp === 'golem' ? 0.7 : sp === 'ogrin' ? 0.35 : 0;
  r.fill(circleR(X(hand), Y(hand), body.hand + fist + (chest.hands !== 'skin' ? 0.25 : 0)), m(chest.hands), { group: g, bevel: 1.6, toneBias: bias });
}

// -----------------------------------------------------------------------------
// Torso
// -----------------------------------------------------------------------------

function torsoShape(art: CharacterArt, T: Xf): Shape {
  const b = art.body;
  const top = b.torso;
  const parts = [
    T.ell(0.3, 0.6, b.hipW, 3.6),
    T.ell(0.5, top * 0.46, b.waistW, top * 0.28),
    T.ell(b.chestPush * 0.7, top - 3.4, b.chestW, 5.4),
    T.circ(-b.shoulderSpread, top - 1.6, b.armR + 0.6),
    T.circ(b.shoulderSpread, top - 1.6, b.armR + 0.6),
  ];
  // A round belly pushing out over the belt.
  if (b.belly > 0) parts.push(T.ell(b.chestPush * 0.7 + 0.6 + 2 * b.belly, top * 0.4, b.waistW + 1.2 * b.belly, top * 0.3 + b.belly));
  return blendShapes(3, parts);
}

function blendShapes(k: number, s: Shape[]): Shape {
  const u = union(...s);
  return {
    sdf: (x, y) => {
      let d = s[0].sdf(x, y);
      for (let i = 1; i < s.length; i++) {
        const b = s[i].sdf(x, y);
        const hh = Math.max(k - Math.abs(d - b), 0) / k;
        d = Math.min(d, b) - hh * hh * k * 0.25;
      }
      return d;
    },
    box: { x0: u.box.x0 - k, y0: u.box.y0 - k, x1: u.box.x1 + k, y1: u.box.y1 + k },
  };
}

function drawTorso(r: Raster, art: CharacterArt, sk: Skeleton, T: Xf, X: (p: P) => number, Y: (p: P) => number, m: (k: string) => number): void {
  const { body, chest } = art;
  // Neck first so the collar overlaps it.
  r.fill(capsuleR(X(sk.neck), Y(sk.neck), X(sk.chest), Y(sk.chest), 1.9, 2.2), m('skin'), { group: G.torso, bevel: 1.6, toneBias: -1 });
  const shape = torsoShape(art, T);
  r.fill(shape, m(chest.torso), { group: G.torso, bevel: 3.2 });
  const top = body.torso;
  // Belt.
  const beltBand = intersect(shape, T.rect(0, 2.6, 12, 1.1));
  r.fill(beltBand, m(chest.belt), { group: G.torso, bevel: 2, noLine: true });
  r.dot(T.x(body.waistW + 0.2, 2.6), T.y(body.waistW + 0.2, 2.6), m('accent'), 4, G.torso);
  // Trims per chest piece.
  if (chest.torso === 'plate' || chest.torso === 'thorn' || chest.torso === 'mirror') {
    const d = m(chest.trim!);
    for (const yy of [top * 0.36, top * 0.52]) {
      r.fill(intersect(shape, T.rect(1, yy, 12, 0.45)), d, { group: G.torso, flat: 1, noLine: true });
    }
    r.fill(intersect(shape, T.ell(body.chestPush * 0.7 + 1.6, top - 3.6, 2.4, 2.6)), m(chest.torso), { group: G.torso, bevel: 2, lightBias: 0.25, noLine: true });
  } else if (chest.torso === 'jerkin') {
    for (let yy = 5; yy < top - 3; yy += 3) r.dot(T.x(body.waistW + 0.6, yy), T.y(body.waistW + 0.6, yy), m(chest.trim!), 2, G.torso);
    r.fill(intersect(shape, T.rect(-1, top - 1.2, 8, 0.8)), m(chest.trim!), { group: G.torso, flat: 1, noLine: true });
  } else if (chest.torso === 'robe') {
    r.fill(intersect(shape, T.rect(body.chestPush * 0.7 + 2.6, top * 0.5, 0.7, top * 0.5)), m(chest.trim!), { group: G.torso, flat: 3, noLine: true });
  } else if (chest.trim) {
    // Tunic: a collar V in the accent colour.
    const cx = body.chestPush * 0.7 + 1;
    r.line(T.x(cx - 1.5, top + 0.5), T.y(cx - 1.5, top + 0.5), T.x(cx + 1, top - 3), T.y(cx + 1, top - 3), m(chest.trim), 2, G.torso);
    r.line(T.x(cx + 1, top - 3), T.y(cx + 1, top - 3), T.x(cx + 3.5, top - 0.4), T.y(cx + 3.5, top - 0.4), m(chest.trim), 2, G.torso);
  }
  if (chest.hood) {
    // Hood worn down, bunched behind the neck.
    r.fill(T.ell(-2.8, top + 0.8, 3.6, 2.6, 0.3), m(chest.hood), { group: G.cape, bevel: 2 });
  }
  const bare = chest.torso === 'outfit' || chest.torso === 'jerkin';
  if (art.look.species === 'golem') {
    // A crack across the back and a rune glowing through whatever it wears.
    const c = m('stoneCrack');
    r.line(T.x(-1, top - 5), T.y(-1, top - 5), T.x(1, top - 8), T.y(1, top - 8), c, 0, G.torso);
    const rx = body.chestPush * 0.7 + 1.6, ry = top - 4.4;
    const rune = m('gem');
    r.line(T.x(rx, ry + 2), T.y(rx, ry + 2), T.x(rx, ry - 2), T.y(rx, ry - 2), rune, 3, G.torso);
    r.line(T.x(rx - 1.4, ry + 0.6), T.y(rx - 1.4, ry + 0.6), T.x(rx + 1.4, ry + 0.6), T.y(rx + 1.4, ry + 0.6), rune, 3, G.torso);
  } else if (art.look.species === 'wisp' && bare) {
    // The spirit's heart shows through the cloth.
    const cx = body.chestPush * 0.7 + 1.4, cy = top - 4.6;
    r.fill(T.poly([cx, cy + 1.6, cx + 1.1, cy, cx, cy - 1.6, cx - 1.1, cy]), m('hairGlow'), { group: G.torso, flat: 3, noLine: true });
  }
  const fang = art.gear.special === 'vampiric_fang';
  if (fang) {
    const px = T.x(body.chestPush * 0.7 + 2.5, top - 2.5), py = T.y(body.chestPush * 0.7 + 2.5, top - 2.5);
    r.dot(px, py, m('fangTooth'), 2, G.torso);
    r.dot(px, py + 1, m('fangBlood'), 3, G.torso);
  }
}

/** Leg armour over one thigh, in thigh space (x up from the knee to the hip, y toward the front). */
function drawLegArmour(r: Raster, art: CharacterArt, t: Xf, len: number, far: boolean, g: number, bias: number, m: (k: string) => number): void {
  const { body, legs: L } = art;
  const w = body.thighR + L.bulk;
  const o = { group: g, toneBias: bias };
  const band = (at: number, mat: string, slant = 0, rad = 0.65) =>
    r.fill(t.cap(at - slant, -w - 0.2, at + slant, w + 0.2, rad), m(mat), { ...o, bevel: 0.8 });
  if (L.wraps) for (const k of [0.3, 0.52, 0.74]) band(len * k, L.wraps, 0.9, 0.5);
  if (L.trim) { band(len * 0.84, L.trim); band(len * 0.22, L.trim, 0, 0.55); }
  if (L.rune) {
    // A glowing seam down the front of the thigh, with a notch.
    const y = w * 0.45;
    const pts = [[len * 0.82, y], [len * 0.6, y - 0.6], [len * 0.45, y + 0.4], [len * 0.28, y]];
    for (let i = 0; i < pts.length - 1; i++) r.line(t.x(pts[i][0], pts[i][1]), t.y(pts[i][0], pts[i][1]), t.x(pts[i + 1][0], pts[i + 1][1]), t.y(pts[i + 1][0], pts[i + 1][1]), m(L.rune), 3, g);
  }
  if (L.tasset) {
    // A plate hanging from the belt over the top of the thigh.
    r.fill(t.poly([len + 1.2, -w - 0.4, len + 1.2, w + 1.2, len * 0.5, w + 1.4, len * 0.42, -w + 0.4], 0.4), m(L.tasset), { ...o, bevel: 1.8 });
    if (L.trim) r.fill(intersect(t.poly([len + 1.2, -w - 0.4, len + 1.2, w + 1.2, len * 0.5, w + 1.4, len * 0.42, -w + 0.4]), t.rect(len * 0.5, 0, 0.5, w + 2)), m(L.trim), { ...o, flat: 1, noLine: true });
  }
  if (L.knee) r.fill(t.ell(0.2, 0.6, body.kneeR + L.bulk + 0.6, body.kneeR + L.bulk + 0.9), m(L.knee), { ...o, bevel: 1.6 });
  L.over?.(r, t, m, { g, bias, far, body, len, w });
}

/** The usable item hanging at the front of the belt. */
function drawUseBelt(r: Raster, art: CharacterArt, T: Xf, m: (k: string) => number): void {
  const um = (k: string) => m('u.' + k);
  const x = art.body.waistW * 0.35, y = 0.6;
  // Hangs neck up, tipped a little forward, a touch smaller than in hand.
  art.use!.draw(r, new Xf(T.x(x, y), T.y(x, y), T.ang + Math.PI / 2 - 0.25, 0.85, 0.85), um, { group: G.skirt, frame: r.phase });
}

/** The usable item in the far hand. */
function drawUseHand(r: Raster, art: CharacterArt, sk: Skeleton, pose: Pose, hold: Hold, OX: number, OY: number, m: (k: string) => number): void {
  const um = (k: string) => m('u.' + k);
  const t = frameAt(OX, OY, sk.handF, pose.sAng + pose.rot);
  art.use!.draw(r, t, um, { group: G.sec, frame: r.phase, open: hold.uncorked });
  // The fingers wrap over the bottle.
  r.fill(circleR(OX + sk.handF.x, OY - sk.handF.y, art.body.hand * 0.75), m(art.chest.hands), { group: G.sec, bevel: 1.2 });
}

/** A short tunic hem over the hips (when no robe). */
function drawHem(r: Raster, art: CharacterArt, T: Xf, m: (k: string) => number): void {
  const { body, chest } = art;
  if (chest.torso === 'plate' || chest.torso === 'mirror' || chest.torso === 'thorn') {
    // Tassets: two small plates over the hips.
    const mat = m(chest.torso);
    r.fill(T.poly([-body.hipW + 0.5, 1.6, body.hipW + 0.6, 1.6, body.hipW + 1.2, -2.8, -body.hipW, -2.4]), mat, { group: G.skirt, bevel: 2 });
    r.fill(intersect(T.poly([-body.hipW + 0.5, 1.6, body.hipW + 0.6, 1.6, body.hipW + 1.2, -2.8, -body.hipW, -2.4]), T.rect(0, -0.6, 10, 0.4)), m(chest.trim!), { group: G.skirt, flat: 1, noLine: true });
    return;
  }
  const mat = m(chest.torso === 'jerkin' ? 'jerkin' : chest.torso === 'outfit' ? 'outfit' : chest.torso);
  r.fill(T.poly([-body.hipW - 0.2, 1.8, body.hipW + 0.9, 1.8, body.hipW + 1.6, -2.4, -body.hipW - 0.6, -2]), mat, { group: G.skirt, bevel: 2.2 });
}

function drawSkirt(r: Raster, art: CharacterArt, T: Xf, sk: Skeleton, mat: number, sway: number, trim: number): void {
  const { body, chest } = art;
  const leg = body.thigh + body.shin;
  const len = leg * chest.skirt;
  // Spreads toward the feet; the hem trails the motion.
  const spread = Math.max(Math.abs(sk.ankleN.x - sk.ankleF.x) * 0.5, body.hipW + 1);
  const sw = sway * 2.2;
  const pts = [
    -body.hipW - 0.3, 2,
    body.hipW + 1, 2,
    spread + 2.2 - sw, -len,
    -spread - 1.8 - sw, -len + 0.6,
  ];
  r.fill(T.poly(pts), mat, { group: G.skirt, bevel: 2.6, softLight: true });
  r.fill(intersect(T.poly(pts), T.rect(0, -len + 0.6, 20, 0.7)), trim, { group: G.skirt, flat: 3, noLine: true });
}

// -----------------------------------------------------------------------------
// Species extras behind the body
// -----------------------------------------------------------------------------

function drawTail(r: Raster, art: CharacterArt, T: Xf, m: (k: string) => number, sway: number): void {
  if (art.look.species !== 'imp') return;
  // A whip of a tail in an S, ending in a heart-shaped spade.
  const s = sway * 2.5;
  const pts: [number, number, number][] = [[-3, 1.5, 1.2], [-7.5, -2, 1], [-11.5 - s, -0.5, 0.85], [-13 - s * 1.3, 4, 0.7], [-11.6 - s * 1.5, 7.4, 0.6]];
  const shapes: Shape[] = [];
  for (let i = 1; i < pts.length; i++) shapes.push(T.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i - 1][2], pts[i][2]));
  r.fill(union(...shapes), m('skin'), { group: G.tail, bevel: 1.2 });
  const tx = -11.6 - s * 1.5, ty = 8.4;
  r.fill(union(T.circ(tx - 1, ty + 0.6, 1.3), T.circ(tx + 1, ty + 0.6, 1.3), T.poly([tx - 2.2, ty + 0.4, tx + 2.2, ty + 0.4, tx, ty + 3.6])), m('horn'), { group: G.tail, bevel: 1 });
}

/** Imp: folded bat wings on the back, the far one a step behind. They flutter with the motion. */
function drawWings(r: Raster, art: CharacterArt, T: Xf, m: (k: string) => number, sway: number): void {
  const top = art.body.torso;
  const wing = (dx: number, dy: number, k: number, bias: number) => {
    const s = sway * 3 * k;
    const ox = -2.4 + dx, oy = top - 1 + dy;
    const tip = [ox - 5 * k - s * 0.5, oy + 12 * k];
    const f1 = [ox - 12 * k - s, oy + 7 * k];
    const f2 = [ox - 13.5 * k - s * 1.2, oy + 0.5 * k];
    const f3 = [ox - 9.5 * k - s, oy - 5 * k];
    const membrane = T.poly([
      ox, oy, tip[0], tip[1], f1[0], f1[1],
      ox - 8.6 * k - s * 0.8, oy + 3 * k, f2[0], f2[1],
      ox - 7.6 * k - s * 0.7, oy - 1.4 * k, f3[0], f3[1],
      ox - 1.5, oy - 4 * k,
    ]);
    r.fill(membrane, m('impWing'), { group: G.cape, bevel: 1.6, toneBias: bias, softLight: true });
    const bone = m('horn');
    for (const f of [tip, f1, f2, f3]) r.line(T.x(ox - 0.6, oy + 0.6), T.y(ox - 0.6, oy + 0.6), T.x(f[0], f[1]), T.y(f[0], f[1]), bone, 1, G.cape);
    r.fill(T.cap(ox - 0.6, oy + 0.6, tip[0], tip[1], 0.7, 0.4), bone, { group: G.cape, bevel: 0.6, toneBias: bias });
  };
  wing(2.8, 2.2, 0.8, -1);
  wing(0, 0, 1, 0);
}

/** Myco: a frilled ring (the veil) around the neck. */
function drawVeil(r: Raster, art: CharacterArt, T: Xf, m: (k: string) => number): void {
  const top = art.body.torso;
  const ring = T.ell(0.4, top - 0.2, 4.2, 1.7, -0.08);
  r.fill(ring, m('gill'), { group: G.cape, bevel: 1.4 });
  // Scalloped hem: darker notches along the bottom edge.
  for (let x = -3; x <= 3.5; x += 1.6) r.dot(T.x(x, top - 1.5), T.y(x, top - 1.5), m('gillDark'), 1, G.cape);
}

/** Wisp motes and myco spores: a few points of light drifting around the body. */
function drawMotes(r: Raster, art: CharacterArt, T: Xf, m: (k: string) => number, sway: number): void {
  const top = art.body.torso;
  const mat = m(art.look.species === 'wisp' ? 'hairGlow' : 'capSpot');
  const s = sway * 2;
  const pts = art.look.species === 'wisp'
    ? [[-6 - s, top + 4], [6.5, top + 7 + s * 0.5], [-8 - s * 1.4, top - 6]]
    : [[-5.5 - s, top + 9], [4.5 - s * 0.6, top + 12], [-8 - s * 1.2, top + 2]];
  for (const [x, y] of pts) r.dot(Math.floor(T.x(x, y)), Math.floor(T.y(x, y)), mat, 4, G.smear);
}

/** Human: a long scarf whose two tails stream back from the neck and trail the motion. */
function drawScarfTails(r: Raster, art: CharacterArt, T: Xf, m: (k: string) => number, sway: number): void {
  const top = art.body.torso + 0.8;
  const s = sway * 3;
  const tail = (pts: [number, number, number][]) => {
    const shapes: Shape[] = [];
    for (let i = 1; i < pts.length; i++) shapes.push(T.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i - 1][2], pts[i][2]));
    return union(...shapes);
  };
  // The far tail sits a little lower and darker, so the pair reads as two strips.
  r.fill(tail([[-1.5, top - 0.6, 1.4], [-5.5 - s * 0.5, top - 2.6, 1.3], [-8.5 - s, top - 5.6, 1.2], [-10 - s * 1.3, top - 8.6, 1.1]]), m('scarf'), { group: G.cape, bevel: 1.4, toneBias: -1 });
  r.fill(tail([[-1.5, top, 1.6], [-6 - s * 0.6, top - 0.6, 1.5], [-10.5 - s, top - 2.4, 1.4], [-14 - s * 1.5, top - 4.2, 1.2]]), m('scarf'), { group: G.cape, bevel: 1.6 });
  // Frayed tip.
  r.fill(T.poly([-13.4 - s * 1.5, top - 3, -16.4 - s * 1.7, top - 3.6, -14.6 - s * 1.6, top - 4.6, -15.6 - s * 1.7, top - 5.8, -13 - s * 1.4, top - 5.2]), m('scarf'), { group: G.cape, bevel: 1 });
}

/** Human: the scarf's wrap around the neck, over the collar. */
function drawScarfWrap(r: Raster, art: CharacterArt, T: Xf, m: (k: string) => number): void {
  if (art.chest.hood) return; // the cloak's hood is bunched there instead
  const top = art.body.torso;
  r.fill(T.ell(0.3, top + 0.9, 3.4, 1.9, -0.12), m('scarf'), { group: G.cape, bevel: 1.8 });
  r.fill(intersect(T.ell(0.3, top + 0.9, 3.4, 1.9, -0.12), T.rect(0, top + 0.4, 6, 0.35)), m('scarf'), { group: G.cape, flat: 1, noLine: true });
}

function drawCape(r: Raster, T: Xf, top: number, mat: number, sway: number): void {
  const s = sway * 3;
  r.fill(T.poly([
    -1, top + 0.5,
    -5.5, top - 1,
    -9 - s, -6,
    -7.5 - s * 1.2, -12,
    -3.5 - s, -11,
    -1, -2,
  ]), mat, { group: G.cape, bevel: 3, toneBias: -1, softLight: true });
}

// -----------------------------------------------------------------------------
// Head, face, hair
// -----------------------------------------------------------------------------

function headShape(art: CharacterArt, H: Xf): Shape {
  const sp = art.look.species;
  // Golem: a carved block with a square jaw.
  if (sp === 'golem') return H.poly([-5.8, -1.6, -5.4, 5.4, -0.4, 6.9, 5.4, 5.6, 6.6, 0.4, 6.4, -4, 4.4, -6, -1.4, -5.6], 1.4);
  // Ogrin: a huge underslung jaw.
  const jaw = sp === 'ogrin' ? H.ell(2.8, -3.2, 5.2, 3.9) : H.ell(1.9, -2.4, 4.1, 3.3);
  return blendShapes(2.2, [H.ell(0, 0.5, 6.2, 6.1), jaw]);
}

function drawHead(r: Raster, art: CharacterArt, H: Xf, m: (k: string) => number): void {
  r.fill(headShape(art, H), m('skin'), { group: G.head, bevel: 3.4, softLight: true });
  const sp = art.look.species;
  if (sp === 'golem') {
    const c = m('stoneCrack');
    r.line(H.x(-3, 4), H.y(-3, 4), H.x(-1, 1.5), H.y(-1, 1.5), c, 0, G.head);
    r.line(H.x(-1, 1.5), H.y(-1, 1.5), H.x(-2, -1.5), H.y(-2, -1.5), c, 0, G.head);
    r.line(H.x(1.4, -5.4), H.y(1.4, -5.4), H.x(2.4, -3.6), H.y(2.4, -3.6), c, 0, G.head);
    // Moss on the back of the skull.
    r.fill(intersect(H.ell(-3.4, 4.6, 3.4, 1.6, 0.4), headShape(art, H)), m('moss'), { group: G.head, bevel: 1, noLine: true });
  } else if (sp === 'ogrin') {
    // A heavy brow ridge shading the eyes.
    r.fill(H.ell(3.4, 2.7, 3.8, 1.2, -0.06), m('skin'), { group: G.head, bevel: 1.2, noLine: true, lightBias: 0.2 });
  }
}

/** Pixel position of a head-local point. */
const px = (H: Xf, x: number, y: number): [number, number] => [Math.floor(H.x(x, y)), Math.floor(H.y(x, y))];

function drawFace(r: Raster, art: CharacterArt, H: Xf, face: Expression, m: (k: string) => number): void {
  const sp = art.look.species;
  const glowEyes = sp === 'wisp' || sp === 'imp';
  const hood = art.headgear === 'executioner_hood';
  const mask = art.headgear === 'berserker_mask' || !!stockHead(art.headgear)?.face;
  if ((hood || mask) && !art.headFace) return; // drawn by the headgear
  if (sp === 'golem') { drawGolemFace(r, H, face, m); return; }
  const [nx, ny] = px(H, 1.4, 0.4);
  const [fx, fy] = px(H, 4.8, 0.3);
  const lash = m('lash');
  const iris = glowEyes ? m('eyeGlow') : m('iris');
  const white = m('white');
  const g = G.head;
  if (face === 'ko') {
    // X eyes.
    r.dot(nx, ny, lash, 0, g); r.dot(nx + 1, ny + 1, lash, 0, g); r.dot(nx + 1, ny, lash, 0, g); r.dot(nx, ny + 1, lash, 0, g);
    r.dot(fx, fy, lash, 0, g); r.dot(fx, fy + 1, lash, 0, g);
  } else if (face === 'hurt' || face === 'blink') {
    // Squeezed shut: > <
    r.dot(nx, ny + 1, lash, 0, g); r.dot(nx + 1, ny + 1, lash, 0, g);
    if (face === 'hurt') r.dot(nx + 1, ny, lash, 0, g);
    r.dot(fx, fy + 1, lash, 0, g);
  } else {
    // Lash line, iris with a highlight.
    r.dot(nx, ny, lash, 0, g); r.dot(nx + 1, ny, lash, 0, g);
    r.dot(nx, ny + 1, iris, glowEyes ? 3 : 1, g); r.dot(nx + 1, ny + 1, glowEyes ? iris : white, glowEyes ? 4 : 2, g);
    r.dot(nx, ny + 2, iris, glowEyes ? 3 : 2, g); r.dot(nx + 1, ny + 2, iris, glowEyes ? 3 : 1, g);
    r.dot(fx, fy, lash, 0, g);
    r.dot(fx, fy + 1, iris, glowEyes ? 3 : 1, g); r.dot(fx, fy + 2, iris, glowEyes ? 3 : 2, g);
    if (face === 'fierce' || face === 'shout') {
      // Brows angled down toward the nose.
      r.dot(nx - 1, ny - 2, lash, 0, g); r.dot(nx, ny - 2, lash, 0, g); r.dot(nx + 1, ny - 1, lash, 0, g);
      r.dot(fx - 1, fy - 1, lash, 0, g);
    }
  }
  if (sp === 'human' && face !== 'fierce' && face !== 'shout') {
    // Humans wear their mood on their brows: level when calm, lifted when hurt.
    const lift = face === 'hurt' || face === 'ko' ? -1 : 0;
    const brow = m('brow');
    r.dot(nx - 1, ny - 2 + lift + (face === 'hurt' ? 1 : 0), brow, 0, g); r.dot(nx, ny - 2 + lift, brow, 0, g); r.dot(nx + 1, ny - 2 + lift, brow, 0, g);
    r.dot(fx, fy - 2 + lift, brow, 0, g);
  }
  if (sp === 'human') {
    // A small nose: one shaded pixel under the far eye.
    const [qx, qy] = px(H, 5.4, -1.4);
    r.dot(qx, qy, m('skin'), 1, g);
  }
  // Mouth.
  const [mx, my] = px(H, 3.6, -3.4);
  if (face === 'shout' || face === 'hurt') {
    r.dot(mx, my, m('mouth'), 0, g); r.dot(mx + 1, my, m('mouth'), 0, g);
    r.dot(mx, my + 1, m('mouth'), 0, g); r.dot(mx + 1, my + 1, m('inner'), 2, g);
  } else if (face !== 'ko') {
    r.dot(mx, my, m('mouth'), 1, g);
  } else {
    r.dot(mx, my, m('mouth'), 0, g); r.dot(mx + 1, my, m('mouth'), 0, g);
  }
  if (sp === 'ogrin') {
    // Shadow under the brow, a broad flat nose, war paint and two big tusks.
    r.line(H.x(0.2, 2.6), H.y(0.2, 2.6), H.x(6.2, 2.1), H.y(6.2, 2.1), m('skinDark'), 0, g);
    const [qx, qy] = px(H, 6.3, -1.2);
    r.dot(qx, qy, m('skinDark'), 0, g); r.dot(qx - 1, qy + 1, m('skinDark'), 1, g);
    r.line(H.x(0.8, -0.8), H.y(0.8, -0.8), H.x(1.2, -2.8), H.y(1.2, -2.8), m('paint'), 2, g);
    r.line(H.x(-0.6, -0.6), H.y(-0.6, -0.6), H.x(-0.4, -2.4), H.y(-0.4, -2.4), m('paint'), 2, g);
    r.fill(H.poly([4.6, -5.6, 6.4, -5.6, 6.6, -1, 5.8, -0.4]), m('tusk'), { group: g, bevel: 0.8 });
    r.fill(H.poly([1.8, -5.8, 3, -5.8, 2.9, -2.6, 2.3, -2.4]), m('tusk'), { group: g, bevel: 0.6, toneBias: -1 });
  }
  if (sp === 'imp' && face !== 'ko') {
    // One fang over the lip.
    r.dot(mx + 1, my + 1, m('tusk'), 3, g);
  }
  if (sp === 'wisp' && face !== 'ko') {
    // Glowing tear marks under the eyes.
    r.dot(nx, ny + 3, m('hairGlow'), 3, g); r.dot(nx, ny + 4, m('hairGlow'), 2, g);
    r.dot(fx, fy + 3, m('hairGlow'), 3, g);
  }
  if (sp === 'myco') {
    // Rosy cheeks under the eyes.
    const [ax, ay] = px(H, 1.6, -1.4);
    r.dot(ax, ay, m('inner'), 2, g);
    const [bx, by] = px(H, 5.4, -1.6);
    r.dot(bx, by, m('inner'), 2, g);
  }
}

/** Golem: no eyes, just a glowing visor slit that dims when hurt, and a carved seam for a mouth. */
function drawGolemFace(r: Raster, H: Xf, face: Expression, m: (k: string) => number): void {
  const g = G.head;
  r.line(H.x(0.6, 1.6), H.y(0.6, 1.6), H.x(6.4, 1.2), H.y(6.4, 1.2), m('skinDark'), 0, g);
  if (face === 'ko') {
    r.line(H.x(0.8, 0.6), H.y(0.8, 0.6), H.x(6, 0.4), H.y(6, 0.4), m('stoneCrack'), 0, g);
  } else {
    const dim = face === 'hurt' || face === 'blink';
    r.line(H.x(0.8, 0.6), H.y(0.8, 0.6), H.x(6, 0.4), H.y(6, 0.4), m(dim ? 'stoneCrack' : 'eyeGlow'), dim ? 1 : 4, g);
    if (!dim) { r.dot(...px(H, 1.6, 0.6), m('eyeGlow'), 4, g); r.dot(...px(H, 4.8, 0.5), m('eyeGlow'), 4, g); }
  }
  const open = face === 'shout';
  r.line(H.x(2.6, -3.4), H.y(2.6, -3.4), H.x(6, -3.6), H.y(6, -3.6), m(open ? 'gem' : 'stoneCrack'), open ? 3 : 0, g);
}

/** Hair cap: everything of an enlarged head above the brow-to-nape line. */
export function hairCap(H: Xf, front: number, back: number, grow = 0.9): Shape {
  const cap = H.ell(-0.4, 0.9, 6.2 + grow, 6.1 + grow);
  const a = H.p(7, front), b = H.p(-7.5, back);
  // Keep the side of line a→b where the crown is.
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let nx = -dy, ny = dx;
  const crown = H.p(0, 6);
  if ((crown[0] - a[0]) * nx + (crown[1] - a[1]) * ny > 0) { nx = -nx; ny = -ny; }
  const l = Math.hypot(nx, ny) || 1;
  const ux = nx / l, uy = ny / l;
  const half: Shape = { sdf: (x, y) => (x - a[0]) * ux + (y - a[1]) * uy, box: cap.box };
  return intersect(cap, half);
}

function hidesHair(art: CharacterArt): boolean {
  return art.headgear === 'iron_helm' || art.headgear === 'executioner_hood' || !!stockHead(art.headgear)?.hair;
}

function drawHairBack(r: Raster, art: CharacterArt, H: Xf, m: (k: string) => number, sway: number): void {
  if (!hasHair(art)) return;
  const style = art.look.hair;
  const hm = m('hair');
  const s = sway * 2;
  if (style === 1) {
    // Ponytail
    const pts: [number, number, number][] = [[-5.6, 3, 1.9], [-9.5 - s, 1, 2.2], [-11 - s * 1.3, -4, 1.8], [-10.5 - s * 1.6, -9, 1.0]];
    const shapes: Shape[] = [];
    for (let i = 1; i < pts.length; i++) shapes.push(H.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i - 1][2], pts[i][2]));
    r.fill(union(...shapes), hm, { group: G.hair, bevel: 2 });
  } else if (style === 3) {
    // Mane: a big wild volume behind the head and down the back.
    const shapes: Shape[] = [
      H.ell(-3, 0.5, 6.4, 7.6),
      H.poly([-6, -3, -9.5 - s, -9, -5.5, -6, -6.5 - s, -12, -2.5, -6.5, -1, -4]),
      H.poly([-7, 4, -11 - s, 3, -7.5, 1]),
      H.poly([-6, 6, -9.5 - s, 8.5, -4.5, 7.5]),
    ];
    r.fill(union(...shapes), hm, { group: G.hair, bevel: 2.6 });
  } else if (style === 5) {
    // Braid down the back.
    const shapes: Shape[] = [];
    let x = -5.5, y = -1;
    for (let i = 0; i < 5; i++) {
      const nx = -6.5 - s * (i / 4) - i * 0.3, ny = y - 2.8;
      shapes.push(H.circ(x, y, 1.9 - i * 0.12));
      x = nx; y = ny;
    }
    r.fill(union(...shapes), hm, { group: G.hair, bevel: 1.6 });
    r.dot(H.x(x + 0.2, y + 1.4), H.y(x + 0.2, y + 1.4), m('accent'), 3, G.hair);
  } else if (style === 2) {
    // Bob: back volume down to the jaw.
    r.fill(H.poly([-6.8, 3, -7.4, -2.5, -6, -5.2, -2.5, -5, -1, 0]), hm, { group: G.hair, bevel: 2.4 });
  }
}

function hasHair(art: CharacterArt): boolean {
  return SPECIES[art.look.species].hair;
}

/** Head-space half plane above the line through (−10, back) and (10, front). */
function above(H: Xf, front: number, back: number, box: Shape['box']): Shape {
  const a = H.p(10, front), b = H.p(-10, back);
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let nx = -dy, ny = dx;
  const crown = H.p(0, front + 10);
  if ((crown[0] - a[0]) * nx + (crown[1] - a[1]) * ny > 0) { nx = -nx; ny = -ny; }
  const l = Math.hypot(nx, ny) || 1;
  const ux = nx / l, uy = ny / l;
  return { sdf: (x, y) => (x - a[0]) * ux + (y - a[1]) * uy, box };
}

/** What grows on a hairless head: a myco cap or golem crystals, in the shape `look.hair` picks. */
function drawCrown(r: Raster, art: CharacterArt, H: Xf, m: (k: string) => number): void {
  if (hidesHair(art)) return;
  const sp = art.look.species;
  const style = art.look.hair % (SPECIES[sp].styles?.length ?? 1);
  if (sp === 'myco') drawCap(r, H, m, style);
  else drawCrystals(r, H, m, style);
}

function drawCap(r: Raster, H: Xf, m: (k: string) => number, style: number): void {
  const g = G.hair;
  const spot = (x: number, y: number, rad: number) => r.fill(H.circ(x, y, rad), m('capSpot'), { group: g, flat: 2, noLine: true });
  if (style === 1) {
    // Cone: a tall pointed cap that bends back at the tip.
    r.fill(H.ell(-0.2, 3, 7.4, 1.2), m('gill'), { group: g, bevel: 1, toneBias: -1 });
    r.fill(H.poly([-7.6, 3.2, 7, 3.4, 3.2, 9, -1.2, 14.4, -5, 15.8, -3, 12.6, -4.6, 7.6], 0.6), m('cap'), { group: g, bevel: 2.6, softLight: true });
    spot(1.8, 6.2, 1.1); spot(-2.4, 9.6, 0.9); spot(-4.6, 5, 0.8);
  } else if (style === 2) {
    // Parasol: flat and very wide, drooping at the rim, with a nub on top.
    r.fill(H.ell(-0.4, 3.6, 10.6, 1.2), m('gill'), { group: g, bevel: 1, toneBias: -1 });
    const top = H.ell(-0.4, 3.8, 11.4, 4.2);
    r.fill(intersect(top, above(H, 3.8, 3, top.box)), m('cap'), { group: g, bevel: 2.6, softLight: true });
    r.fill(H.ell(-0.4, 7.9, 2.2, 1.1), m('cap'), { group: g, bevel: 1.2, toneBias: -1 });
    spot(4.6, 5.4, 1); spot(-3.6, 6.2, 1.2); spot(-8.4, 4.6, 0.8); spot(8.6, 4.4, 0.7);
  } else {
    // Dome: broad, round and spotted.
    r.fill(H.ell(-0.4, 2.7, 8.4, 1.3), m('gill'), { group: g, bevel: 1, toneBias: -1 });
    const dome = H.ell(-0.4, 2.6, 9.2, 7.6);
    r.fill(intersect(dome, above(H, 3.2, 2.2, dome.box)), m('cap'), { group: g, bevel: 3, softLight: true });
    for (const [x, y, rad] of [[1.6, 6.6, 1.4], [-3.6, 7.4, 1.1], [5.4, 4.6, 0.9], [-6.8, 4.2, 1], [-1, 9.1, 0.8]]) spot(x, y, rad);
  }
}

function drawCrystals(r: Raster, H: Xf, m: (k: string) => number, style: number): void {
  const c = m('gem');
  const o = { group: G.hair, bevel: 1 };
  if (style === 1) {
    // Spire: one tall crystal with two small ones at its foot.
    r.fill(H.poly([-2.2, 5.6, -1, 15, 0.6, 15.6, 1.8, 6]), c, o);
    r.fill(H.poly([-4.6, 4.4, -6.4, 8.6, -2.6, 5.6]), c, { ...o, toneBias: -1 });
    r.fill(H.poly([2, 5.8, 4.4, 9.4, 4.4, 5.2]), c, o);
  } else if (style === 2) {
    // Shards: a cluster swept back like a mane.
    r.fill(H.poly([-1.6, 6.4, -6, 11.6, -4.4, 6.2]), c, o);
    r.fill(H.poly([-4, 5.2, -10, 7.4, -6, 3.2]), c, { ...o, toneBias: -1 });
    r.fill(H.poly([-5.4, 2.4, -10.6, 2, -6, 0]), c, { ...o, toneBias: -1 });
    r.fill(H.poly([1, 6.6, -1.6, 12.2, -0.8, 6.6]), c, o);
    r.fill(H.poly([2.8, 6.2, 2.4, 9.4, 4.8, 5.6]), c, o);
  } else {
    // Crown: three crystals in a row.
    r.fill(H.poly([-4, 4.5, -5.5, 9.5, -2, 6]), c, o);
    r.fill(H.poly([-1.5, 6, -0.5, 11, 1.8, 6.2]), c, o);
    r.fill(H.poly([1.5, 5.8, 4, 8.6, 4, 5]), c, o);
  }
}

function drawHairFront(r: Raster, art: CharacterArt, H: Xf, m: (k: string) => number): void {
  if (!hasHair(art)) { drawCrown(r, art, H, m); return; }
  if (hidesHair(art)) return;
  const style = art.look.hair;
  const hm = m('hair');
  const parts: Shape[] = [];
  switch (style) {
    case 0: // Spiky
      parts.push(hairCap(H, 2.4, -3.8, 1));
      parts.push(H.poly([-5.8, 2.5, -10, 4.2, -6.4, 5.8]));
      parts.push(H.poly([-5, 5.2, -7.4, 10, -2, 7]));
      parts.push(H.poly([-2.2, 6.8, -0.4, 11.2, 2, 7]));
      parts.push(H.poly([1.8, 6.6, 5.8, 9.4, 4.8, 5]));
      parts.push(H.poly([5, 4.5, 8.2, 0.6, 6.6, 3.6]));
      parts.push(H.poly([3.6, 4.4, 4.6, 0.4, 2, 3.6]));
      break;
    case 1: // Ponytail (front: neat cap with a side fringe)
      parts.push(hairCap(H, 2.6, -2.6, 0.8));
      parts.push(H.poly([4.4, 4.6, 7.4, 1.4, 6.8, 4]));
      parts.push(H.circ(-5.6, 3, 1.6));
      break;
    case 2: // Bob
      parts.push(hairCap(H, 2, -4.2, 1.1));
      parts.push(H.poly([3, 4.8, 7.4, 1, 7.2, 4.2]));
      parts.push(H.poly([0.6, 4.2, 3.2, 1.2, 4, 4.4]));
      break;
    case 3: // Mane
      parts.push(hairCap(H, 2.2, -3.2, 1.3));
      parts.push(H.poly([4.6, 5, 8.6, 0, 6.8, 4.2]));
      parts.push(H.poly([2, 6, 4.2, 9.8, 5.4, 5.2]));
      parts.push(H.poly([-2, 6.8, -1, 10.6, 1.8, 6.8]));
      break;
    case 4: // Buzz
      parts.push(hairCap(H, 3.4, -2, 0.55));
      break;
    case 5: // Braids
      parts.push(hairCap(H, 2.8, -3, 0.9));
      parts.push(H.poly([4.6, 4.4, 7.2, 1.6, 7, 4.2]));
      break;
  }
  r.fill(union(...parts), hm, { group: G.hair, bevel: 2.4 });
  if (art.look.species === 'wisp') {
    // Cold flame licking up off the crown.
    const f = m('hairGlow');
    r.fill(H.poly([-2.6, 6.4, -4.2, 12.6, -0.6, 7.6]), f, { group: G.hair, bevel: 1 });
    r.fill(H.poly([0.2, 7, 1.2, 13.6, 2.4, 7.2]), f, { group: G.hair, bevel: 1 });
    r.fill(H.poly([-5.2, 4.8, -8.4, 9, -4.2, 6.4]), f, { group: G.hair, bevel: 1 });
  }
}

function drawEarsBehind(r: Raster, art: CharacterArt, H: Xf, m: (k: string) => number): void {
  const sp = art.look.species;
  if (art.headgear === 'executioner_hood' || stockHead(art.headgear)?.ears === 'all') return;
  const helm = art.headgear === 'iron_helm' || stockHead(art.headgear)?.ears === 'side';
  if (sp === 'wisp' && !helm) {
    // A thin halo floating over the crown.
    const outer = H.ell(-1.6, 12.6, 4.8, 1.5, 0.12);
    r.fill(subtract(outer, H.ell(-1.6, 12.6, 3.7, 0.7, 0.12)), m('hairGlow'), { group: G.ears, flat: 3, noLine: true });
  }
}

/** Imp horn: rises from the crown, sweeps back and curls down at the tip. */
function hornShape(H: Xf, dx: number, k: number): Shape {
  const pts: [number, number, number][] = [[1.4, 4.8, 1.8], [1.6, 8.8, 1.5], [-0.6, 12, 1.2], [-4, 13.2, 0.9], [-6.6, 11.8, 0.6], [-7, 9.6, 0.3]];
  const shapes: Shape[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay, ar] = pts[i - 1], [bx, by, br] = pts[i];
    shapes.push(H.cap(dx + ax * k, ay * k, dx + bx * k, by * k, ar * k, br * k));
  }
  return union(...shapes);
}

function drawEarsFront(r: Raster, art: CharacterArt, H: Xf, m: (k: string) => number, sp: string): void {
  const ears = stockHead(art.headgear)?.ears;
  const hood = art.headgear === 'executioner_hood' || ears === 'all';
  const helm = art.headgear === 'iron_helm' || ears === 'side';
  if (hood) return;
  if (sp === 'imp') {
    if (!helm) {
      // Far horn a step ahead and darker, then the near one.
      r.fill(hornShape(H, 2.6, 0.88), m('horn'), { group: G.ears, bevel: 1.2, toneBias: -1 });
      r.fill(hornShape(H, 0, 1), m('horn'), { group: G.ears, bevel: 1.4 });
      // Ridges across the horn.
      for (const [x, y] of [[0.6, 6.6], [-0.2, 9.6], [-2.8, 11.6]]) r.dot(...px(H, x, y), m('hornRidge'), 1, G.ears);
    }
    // Long pointed ear swept back.
    r.fill(H.poly([-1.4, 0.8, -9, 3.8, -7.4, 1.8, -1.8, -1.8]), m('skin'), { group: G.ears, bevel: 1.4 });
    r.fill(H.poly([-2.6, 0.4, -7.4, 2.6, -2.8, -0.8]), m('inner'), { group: G.ears, flat: 2, noLine: true });
  } else if (sp === 'ogrin') {
    // Big drooping ear with a gold hoop.
    r.fill(H.poly([-1.2, 1, -8.2, 1.6, -7, -1.2, -1.6, -2]), m('skin'), { group: G.ears, bevel: 1.6 });
    r.fill(subtract(H.circ(-6.8, -1.9, 1.3), H.circ(-6.8, -1.9, 0.6)), m('gold'), { group: G.ears, bevel: 0.6 });
  } else if (sp === 'wisp') {
    // Long, thin ear swept back with a glowing tip.
    r.fill(H.poly([-1.2, 1, -9.6, 4.6, -1.8, -1.6]), m('skin'), { group: G.ears, bevel: 1.2 });
    r.dot(...px(H, -8.8, 4.1), m('hairGlow'), 3, G.ears);
  } else if (sp === 'human' && !helm) {
    // Small round ear, set back from the cheek.
    r.fill(H.ell(-2.4, -0.6, 1.5, 2), m('skin'), { group: G.ears, bevel: 1.2 });
  }
}

function drawHeadgear(r: Raster, art: CharacterArt, H: Xf, m: (k: string) => number, sway: number): void {
  const g = G.headgear;
  if (art.headDraw) art.headDraw(r, H, m, g, sway);
  else switch (art.headgear) {
    case 'iron_helm': {
      const dome = hairCap(H, 1.2, -3.6, 1.25);
      r.fill(dome, m('helm'), { group: g, bevel: 3 });
      r.fill(H.poly([1.4, 1.6, 4.8, 1.6, 4, -3.2, 1.8, -2.8]), m('helm'), { group: g, bevel: 1.6 });
      r.fill(H.rect(5.6, 0.2, 0.6, 2.6), m('helm'), { group: g, bevel: 1 });
      r.fill(intersect(dome, H.rect(0, 2.1, 9, 0.5)), m('helmDark'), { group: g, flat: 1, noLine: true });
      r.dot(H.x(-3, 1.8), H.y(-3, 1.8), m('helm'), 4, g);
      r.dot(H.x(0, 1.8), H.y(0, 1.8), m('helm'), 4, g);
      break;
    }
    case 'berserker_mask': {
      r.fill(H.poly([0.8, 3.6, 7.2, 3, 7.6, -1.2, 5.4, -5.2, 1.4, -4.8, 0.6, -1]), m('mask'), { group: g, bevel: 2 });
      // Eye slits and teeth.
      r.line(H.x(2.4, 0.4), H.y(2.4, 0.4), H.x(3.6, -0.2), H.y(3.6, -0.2), m('maskEye'), 3, g);
      r.dot(H.x(5.6, 0.2), H.y(5.6, 0.2), m('maskEye'), 3, g);
      r.line(H.x(3, -3.2), H.y(3, -3.2), H.x(6, -3.2), H.y(6, -3.2), m('maskHorn'), 3, g);
      // Horns sweeping back.
      r.fill(H.poly([1.4, 3.4, -1.4, 7.6, -5, 9.2, -2, 6.4, -0.4, 3]), m('maskHorn'), { group: g, bevel: 1.2 });
      r.fill(H.poly([5, 3.2, 5.8, 7.4, 3.6, 9.8, 4.4, 6.6, 3.6, 3.2]), m('maskHorn'), { group: g, bevel: 1.2, toneBias: -1 });
      break;
    }
    case 'chrono_circlet': {
      r.fill(H.cap(-6.4, 2.2, 6.6, 3.4, 0.7), m('gold'), { group: g, bevel: 1 });
      r.fill(H.poly([5.4, 3.4, 6.4, 5.2, 7.4, 3.4, 6.4, 1.8]), m('gemPurple'), { group: g });
      break;
    }
    case 'executioner_hood': {
      const hood = union(H.ell(-0.8, 1.2, 7.8, 7.6), H.poly([-7.6, 1, -6.4, -6.8, 1, -7.4, 3, -4]));
      r.fill(hood, m('hood'), { group: g, bevel: 3, softLight: true });
      // Face in shadow with two burning eyes.
      r.fill(H.ell(3.8, -1.3, 3.7, 4.1), m('hood'), { group: g, flat: 0, noLine: true });
      r.dot(H.x(2.6, 0.2), H.y(2.6, 0.2), m('hoodEye'), 3, g);
      r.dot(H.x(3.6, 0.2), H.y(3.6, 0.2), m('hoodEye'), 3, g);
      r.dot(H.x(5.8, 0.1), H.y(5.8, 0.1), m('hoodEye'), 3, g);
      break;
    }
    case 'storm_crown': {
      r.fill(H.poly([-4.6, 4.4, -5.4, 8.8, -3.2, 6.6, -1.6, 9.8, 0.4, 7, 2.2, 9.8, 3.4, 6.6, 5.4, 8.8, 5, 4.4, 0, 5.4]), m('gold'), { group: g, bevel: 1.6 });
      r.dot(H.x(0.2, 6.6), H.y(0.2, 6.6), m('spark'), 3, g);
      r.dot(H.x(-1.6, 9.8), H.y(-1.6, 9.8), m('spark'), 3, g);
      r.dot(H.x(2.2, 9.8), H.y(2.2, 9.8), m('spark'), 3, g);
      break;
    }
    case 'duelist_band': {
      const s = sway * 2;
      r.fill(H.cap(-6.6, 1.8, 6.6, 3, 1), m('band'), { group: g, bevel: 1 });
      r.fill(H.poly([-6.2, 2.4, -11.5 - s, 0.5, -10.6 - s, -0.8, -6.4, 0.8]), m('bandTail'), { group: g, bevel: 1 });
      r.fill(H.poly([-6.2, 1.6, -10 - s, -3.2, -9 - s, -4, -6, 0.4]), m('bandTail'), { group: g, bevel: 1, toneBias: -1 });
      break;
    }
    default:
      stockHead(art.headgear)?.draw(r, H, m, g, sway);
  }
  if (art.gear.special === 'phoenix_feather' && art.headgear !== 'executioner_hood') {
    if (art.specialSkin?.plume) art.specialSkin.plume(r, H, m, g, sway);
    else {
      r.fill(H.poly([-5, 4, -9.5, 9.5, -8.6, 10.4, -4.2, 5]), m('plume'), { group: g, bevel: 1 });
      r.dot(H.x(-9, 10), H.y(-9, 10), m('plumeTip'), 3, g);
    }
  }
}

// -----------------------------------------------------------------------------
// Weapons
// -----------------------------------------------------------------------------

function drawMain(r: Raster, art: CharacterArt, sk: Skeleton, pose: Pose, hold: Hold, OX: number, OY: number, m: (k: string) => number, bias: number): void {
  const wm = (k: string) => m('w.' + k);
  if (art.family === 'bow') {
    const t = frameAt(OX, OY, sk.handF, pose.wAng + pose.rot);
    const pull = hold.pull ?? 0;
    const stringTo: [number, number] | undefined = pull > 0.05 ? [OX + sk.handN.x, OY - sk.handN.y] : undefined;
    art.main.draw(r, t, wm, { group: G.main, toneBias: bias, pull, stringTo });
    figureMarks.tip = t.p(-3, 20);
    return;
  }
  const sc = hold.mainScale ?? 1;
  const t = frameAt(OX, OY, sk.handN, pose.wAng + pose.rot, sc);
  art.main.draw(r, t, wm, { group: G.main, toneBias: bias });
  figureMarks.tip = t.p(art.main.tip * 0.85, 0);
}

function drawMainOnBack(r: Raster, art: CharacterArt, sk: Skeleton, OX: number, OY: number, m: (k: string) => number): void {
  const wm = (k: string) => m('w.' + k);
  const back = { x: (sk.chest.x + sk.hip.x) / 2 - 3.5, y: (sk.chest.y + sk.hip.y) / 2 + 1 };
  if (art.family === 'bow') {
    const t = frameAt(OX, OY, back, -0.75);
    art.main.draw(r, t, wm, { group: G.main, toneBias: -1 });
    return;
  }
  const ang = 2.2;
  const g = { x: back.x - Math.cos(ang) * art.main.tip * 0.45, y: back.y - Math.sin(ang) * art.main.tip * 0.45 };
  art.main.draw(r, frameAt(OX, OY, g, ang), wm, { group: G.main, toneBias: -1 });
}

function drawSec(r: Raster, art: CharacterArt, sk: Skeleton, pose: Pose, hold: Hold, OX: number, OY: number, m: (k: string) => number, bias: number): void {
  if (!art.sec) return;
  const sm = (k: string) => m('s.' + k);
  const t = frameAt(OX, OY, sk.handF, pose.sAng + pose.rot);
  art.sec.draw(r, t, sm, { group: G.sec, toneBias: bias, pull: hold.pull });
  figureMarks.secTip = t.p(art.sec.tip * 0.8, 0);
}

function drawSecHolster(r: Raster, art: CharacterArt, sk: Skeleton, T: Xf, OX: number, OY: number, m: (k: string) => number, back: boolean): void {
  if (!art.sec) return;
  const sm = (k: string) => m('s.' + k);
  if (back) {
    // Shield on the back, rim showing behind the shoulder.
    const p = { x: sk.chest.x - art.body.chestW - 1.5, y: (sk.chest.y + sk.hip.y) / 2 + 2 };
    art.sec.draw(r, frameAt(OX, OY, p, -1.45), sm, { group: G.sec, toneBias: -1 });
    return;
  }
  // Small items hang at the back of the belt.
  const bx = T.x(-art.body.waistW - 0.6, 2.2), by = T.y(-art.body.waistW - 0.6, 2.2);
  art.sec.draw(r, new Xf(bx, by, art.secFamily === 'horn' ? -2.2 : -1.95, 0.85, 0.85), sm, { group: G.sec, toneBias: 0 });
}

function drawSmear(r: Raster, art: CharacterArt, sk: Skeleton, s: Smear, OX: number, OY: number): void {
  if (s.ring) { drawRing(r, art, sk, OX, OY); return; }
  const sh = sk.shN;
  const reach = Math.hypot(sk.handN.x - sh.x, sk.handN.y - sh.y) + art.main.tip;
  const cx = OX + sh.x, cy = OY - sh.y;
  // Angles are measured around the shoulder: convert weapon angles to tip directions.
  const shape = arc(cx, cy, Math.max(3, reach - art.main.tip * 0.75), reach + 1, -s.from, -s.to);
  const mat = r.add(smearMat(art));
  const dim = r.add(smearDim(art));
  // Legendary skins leave a fuller, brighter trail.
  const legend = !!art.mainSkin?.fx;
  const span = s.to - s.from;
  const x0 = Math.max(0, Math.floor(shape.box.x0)), x1 = Math.min(r.w - 1, Math.ceil(shape.box.x1));
  const y0 = Math.max(0, Math.floor(shape.box.y0)), y1 = Math.min(r.h - 1, Math.ceil(shape.box.y1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (shape.sdf(x + 0.5, y + 0.5) >= 0) continue;
    const i = y * r.w + x;
    // Don't paint over the body; the smear trails behind the arm.
    if (r.at(x, y) && r.group[i] !== G.smear && r.order[i] > 0 && r.group[i] !== G.cape && r.group[i] !== G.tail) continue;
    const a = -Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
    let u = span === 0 ? 1 : (a - s.from) / span;
    u = ((u % 1) + 1) % 1;
    const rr = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    // A crescent: thick near the blade, thinning to nothing at the start of the swing.
    const thick = art.main.tip * (0.08 + 0.62 * u * u);
    const depth = reach + 0.5 - rr;
    if (depth > thick || u < 0.12) continue;
    if (u < (legend ? 0.3 : 0.45) && ((x + y) & 1)) continue;
    r.dot(x, y, depth < (legend ? 3.4 : 2.2) && u > 0.35 ? mat : dim, 3, G.smear);
  }
}

/** Whirlwind: a flat band of motion around the waist, behind the body where they overlap. */
function drawRing(r: Raster, art: CharacterArt, sk: Skeleton, OX: number, OY: number): void {
  const cx = OX + sk.hip.x, cy = OY - (sk.hip.y + sk.chest.y) / 2;
  const rx = art.main.tip + 10, ry = 5;
  const mat = r.add(smearMat(art));
  const dim = r.add(smearDim(art));
  const x0 = Math.max(0, Math.floor(cx - rx - 1)), x1 = Math.min(r.w - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(r.h - 1, Math.ceil(cy + ry + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
    const d = u * u + v * v;
    if (d > 1 || d < 0.55) continue;
    const i = y * r.w + x;
    if (r.at(x, y) && r.order[i] > 0 && r.group[i] !== G.smear) continue;
    // Brighter on the outer rim and on the near (lower) half.
    if (d < 0.7 && ((x + y) & 1)) continue;
    r.dot(x, y, d > 0.82 && v > 0 ? mat : dim, 3, G.smear);
  }
}

const smearCache = new WeakMap<CharacterArt, [Material, Material]>();
function smearMats(art: CharacterArt): [Material, Material] {
  let s = smearCache.get(art);
  if (!s) {
    const skin = art.mainSkin?.trail;
    const tint = art.mainId === 'ember_wand' ? 0xffc070 : art.mainId === 'dagger' ? 0xd8ffc0 : art.mainId === 'greataxe' ? 0xffe0d8 : 0xf4f8ff;
    s = skin
      ? [material({ base: skin[0], glow: true }), material({ base: skin[1], glow: true })]
      : [material({ base: tint, glow: true }), material({ base: mixHex(tint, 0x8aa0c8, 0.45), glow: true })];
    smearCache.set(art, s);
  }
  return s;
}
const smearMat = (art: CharacterArt) => smearMats(art)[0];
const smearDim = (art: CharacterArt) => smearMats(art)[1];
