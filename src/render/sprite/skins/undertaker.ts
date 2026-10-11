import { ring, type Layer } from '../../auraKit';
import { css } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { HeadSkin } from './heads';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { mats, wrap } from './kit';

/**
 * Mythic set: The Undertaker. The Deadman of the ring: a long black leather
 * duster lined in purple, the wide-brimmed hat pulled low, long black hair,
 * eyes rolled back to white, fingerless black gloves, a granite tombstone for
 * a shield and the golden urn that never stays shut: every few seconds its
 * lid lifts and a ghost flies out at the enemy. Purple is the night accent:
 * the urn's seam, the tombstone's crack, the white eyes, a few amethysts.
 */

/** Black leather, a cold purple cast in its highlights. */
const INK = [0x050407, 0x0e0b12, 0x1b1622, 0x2e2738, 0x5e5470];
/** Deep royal purple (lining, ribbons, stripes). */
const PURPLE = [0x18062a, 0x320f56, 0x562090, 0x8646c8, 0xc8a0ff];
/** Ghost light: lilac to white (self-lit). */
const SPIRIT = [0x3a1a6a, 0x6a3ab8, 0xa47aff, 0xd8c8ff, 0xfaf6ff];
/** The urn's old gold. */
const URN = [0x3a2208, 0x6e4a14, 0xa8802c, 0xdcb658, 0xfff0b8];
/** Weathered granite. */
const STONE = [0x1e2026, 0x383c44, 0x5c616a, 0x868b94, 0xb8bcc4];
const MOSS = [0x121c0e, 0x22341a, 0x385226, 0x557636, 0x84a458];
const SILVER = [0x26282e, 0x52565f, 0x9298a4, 0xd0d4dc, 0xffffff];
/** Long black hair with a blue-violet sheen. */
const HAIR = [0x030205, 0x0b0910, 0x17141d, 0x29253a, 0x4c4766];
/** The open dark of a ghost's eyes and mouth. */
const VOID = 0x14062a;

// -----------------------------------------------------------------------------
// Textures and materials
// -----------------------------------------------------------------------------

/** Leather: long creases and a few glossy flecks. */
const hide: Tex = (x, y) => {
  if (hash(Math.floor(x * 1.3), Math.floor(y * 1.3) + 7) < 0.06) return 1;
  return wrap(x * 0.25 + y * 1.1 + Math.sin(x * 0.4) * 0.8, 4.2) < 0.5 ? -1 : 0;
};
/** Speckled granite. */
const granite: Tex = (x, y) => {
  const h = hash(Math.floor(x), Math.floor(y) + 3);
  return h < 0.12 ? -1 : h > 0.95 ? 1 : 0;
};
/** Hair falling in strands, a sheen across them. */
const strands: Tex = (x, y) => (wrap(x * 1.15 + y * 0.12, 1.7) < 0.55 ? -1 : wrap(y * 0.3, 6) < 0.6 ? 1 : 0);
/** Old gold with a glint sliding across it. */
const sheen: Tex = (x, y, ph) => (wrap(x * 0.7 + y * 0.5 - ph * 2.5, 10) < 1 ? 1 : hash(Math.floor(x * 1.2), Math.floor(y * 1.2)) < 0.12 ? -1 : 0);
/** A glow breathing over the four-step loop. */
const breathe: Tex = (_x, _y, ph) => [0, 1, 0, -1][ph % 4];

const R = (r: number[], o: Partial<MaterialSpec> = {}): MaterialSpec => ({ base: r[2], ramp: r, ...o });
const S = {
  leather: (tex: Tex | undefined = hide): MaterialSpec => R(INK, { shiny: true, step: 0.13, tex }),
  matte: (): MaterialSpec => R(INK),
  purple: (tex?: Tex): MaterialSpec => R(PURPLE, { tex }),
  spirit: (tex?: Tex): MaterialSpec => ({ base: SPIRIT[3], ramp: SPIRIT, glow: true, tex }),
  amethyst: (): MaterialSpec => ({ base: PURPLE[3], ramp: [PURPLE[1], PURPLE[2], PURPLE[3], SPIRIT[3], SPIRIT[4]], glow: true, tex: breathe }),
  urn: (tex: Tex | undefined = sheen): MaterialSpec => R(URN, { shiny: true, step: 0.15, tex }),
  stone: (tex: Tex | undefined = granite): MaterialSpec => R(STONE, { step: 0.12, tex }),
  moss: (): MaterialSpec => R(MOSS, { tex: (x, y) => (hash(Math.floor(x), Math.floor(y)) < 0.3 ? -1 : 0) }),
  silver: (): MaterialSpec => R(SILVER, { shiny: true, step: 0.16 }),
  hair: (): MaterialSpec => R(HAIR, { shiny: true, step: 0.12, tex: strands }),
};

/** Purple ghost-fire rising off the gear, a swing trailing lilac into deep purple. */
const FX = { fx: { spark: 0xd8c8ff, spark2: 0x6a2aa8, kind: 'flame' as const }, trail: [0xe6dcff, 0x7a3ac0] as [number, number] };

/** Particles the full set sheds in battle: lilac ghost-fire. */
export const UNDERTAKER_FX: SkinFx = { spark: 0xd8c8ff, spark2: 0x5a2096, kind: 'flame' };

/** A tapering chain of capsules through [x, y, radius] points. */
function chain(F: Xf, pts: number[][]): Shape {
  const s: Shape[] = [];
  for (let i = 1; i < pts.length; i++) s.push(F.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i - 1][2], pts[i][2]));
  return union(...s);
}

// -----------------------------------------------------------------------------
// Deadman's Grips (spirit wraps)
// -----------------------------------------------------------------------------

function grips(): WeaponArt {
  // Black fingerless MMA gloves: a padded knuckle bar, a wide wrist strap closed with a purple band, the
  // fingers bare past the pad, and a small amethyst stud on the strap.
  return {
    tip: 4,
    mats: {
      leather: material(S.leather()), pad: material(S.leather(undefined)), strap: material(S.matte()),
      band: material(S.purple()), stud: material(S.silver()), gem: material(S.amethyst()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, b = o.toneBias ?? 0;
      // The wrist strap, a purple band round it.
      fillAll(r, [t.cap(-5.6, 0, -2.2, 0, 2.05, 2.3)], m('strap'), o, 1.2);
      r.fill(t.rect(-3.8, 0, 0.75, 2.4), m('band'), { group: g, bevel: 0.6, toneBias: b, local: o.local });
      // The back of the glove over the hand, and the padded knuckle bar.
      fillAll(r, [t.ell(-0.4, 0.3, 2.9, 2.55)], m('leather'), o, 1.6);
      fillAll(r, [t.rect(1.5, 0, 1.15, 2.6, 0.9)], m('pad'), o, 1.1, 1);
      r.line(t.x(1.5, -2), t.y(1.5, -2), t.x(1.5, 2), t.y(1.5, 2), m('strap'), 0, g);
      // The finger loops between the knuckles.
      for (const y of [-1.3, 0, 1.3]) r.dot(t.x(2.6, y), t.y(2.6, y), m('strap'), 1, g);
      // The stud on the strap.
      r.dot(t.x(-3.8, 1.2), t.y(-3.8, 1.2), m('gem'), 3, g);
      r.dot(t.x(-5, 1.6), t.y(-5, 1.6), m('stud'), 4, g);
    },
  };
}

/** The spirit palm thrown from the grips: a great ghost hand closing to chokeslam. */
const PM = mats({
  hand: S.spirit(), deep: { base: SPIRIT[1], ramp: SPIRIT, glow: true }, crease: R(PURPLE), smoke: { base: PURPLE[3], ramp: PURPLE, glow: true },
});

const chokeslamProj: ProjArt = {
  frames: 2,
  outline: true,
  draw(r, t, f, h) {
    // Purple smoke streaming behind.
    for (const [y, l] of [[-4, 7 + f * 2], [-0.6, 11 - f], [3, 8 + f]]) r.line(t.x(-4.4, y), t.y(-4.4, y), t.x(-4.4 - l, y + 0.6), t.y(-4.4 - l, y + 0.6), h(PM.smoke), 2, 1);
    // The palm, the fingers rising and hooking forward to grab a throat, the thumb reaching under.
    const curl = f ? 0.8 : 0;
    const palm = t.ell(0, -2, 4.6, 4.4);
    r.fill(palm, h(PM.hand), { group: 2, bevel: 1.4 });
    // Four long fingers, each its own piece so they read apart, rising and hooking forward.
    const FING = [[-3.2, 7.4, 2.4], [-0.9, 9.4, 3], [1.4, 9, 3], [3.6, 6.6, 2.4]] as const;
    FING.forEach(([x, top, len], i) => {
      const fing = union(t.cap(x, 1, x + 0.6, top, 0.85, 0.8), t.cap(x + 0.6, top, x + 0.6 + len, top - 1.6 - curl, 0.8, 0.55));
      r.fill(fing, h(PM.hand), { group: 3 + i, bevel: 0.9, toneBias: i % 2 ? 0 : -1 });
    });
    r.fill(chain(t, [[-3, -4, 1.3], [1, -6.8, 1.05], [4.2, -6 + curl, 0.8]]), h(PM.hand), { group: 8, bevel: 0.9 });
    r.fill(t.ell(1.2, -1.2, 2.2, 2.4), h(PM.deep), { group: 2, noLine: true });
  },
};

// -----------------------------------------------------------------------------
// Rest in Peace (tower shield)
// -----------------------------------------------------------------------------

function tombstone(): WeaponArt {
  // A granite headstone: an arched top, a carved border, a cross cut deep into it over lines of a worn
  // epitaph, a chipped corner, moss creeping up from the plinth, and a crack down its face where purple
  // light seeps through, pulsing.
  return {
    tip: 14,
    mats: {
      stone: material(S.stone()), carve: material(R(STONE, { step: 0.12 })), plinth: material(S.stone()),
      moss: material(S.moss()), crack: material(S.spirit(breathe)), soil: material(R([0x140e0a, 0x241a12, 0x3a2a1c, 0x54402c, 0x6e5640])),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, b = o.toneBias ?? 0, L = o.local;
      const flat = (s: Shape, k: string, bevel: number, tone = 0) => r.fill(s, m(k), { group: g, bevel, toneBias: b + tone, noLine: true, local: L });
      // The arched slab, a chip out of one shoulder of the arch.
      const arch: number[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI;
        arch.push(-8.4 - Math.sin(a) * 6.6, Math.cos(a) * 6.6);
      }
      const slab = subtract(t.poly([...arch, 12.6, -6.6, 12.6, 6.6], 0.4), t.poly([-13.8, -5.4, -11.6, -7.4, -11, -5.6]));
      fillAll(r, [slab], m('stone'), o, 2.2);
      // The plinth it stands on, wider, earth clinging to its foot.
      fillAll(r, [t.rect(13.5, 0, 1.4, 7.6, 0.4)], m('plinth'), o, 1.2, -1);
      flat(t.rect(14.6, 0, 0.5, 7.4), 'soil', 0.4);
      // A carved border inside the edge.
      const inner: number[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI;
        inner.push(-8.4 - Math.sin(a) * 5, Math.cos(a) * 5);
      }
      const border = subtract(t.poly([...inner, 11.2, -5, 11.2, 5]), t.poly([...inner.map((v, i) => (i % 2 ? v * 0.84 : v + 0.8)), 10.4, -4.2, 10.4, 4.2]));
      flat(border, 'carve', 0.5, -1);
      // The cross, cut deep.
      flat(union(t.rect(-6.6, 0, 5.2, 0.85), t.rect(-8.6, 0, 0.85, 3)), 'carve', 0.6, -2);
      // The worn epitaph: short carved strokes, no letter left legible.
      for (const [x, w] of [[1.4, 3], [3.4, 3.6], [5.4, 2.6], [7.6, 3.2]] as const) {
        for (let y = -w; y < w; y += 1.4) if (hash(x * 7, y * 3) > 0.25) r.dot(t.x(x, y), t.y(x, y), m('carve'), 0, g);
      }
      // The crack: from the chipped shoulder down across the face, purple light in it.
      const crack = [[-12.4, -5], [-10.6, -3.4], [-9.6, -4], [-7, -2.2], [-4.6, -3.6], [-1.8, -2.4]];
      for (let i = 1; i < crack.length; i++) r.line(t.x(crack[i - 1][0], crack[i - 1][1]), t.y(crack[i - 1][0], crack[i - 1][1]), t.x(crack[i][0], crack[i][1]), t.y(crack[i][0], crack[i][1]), m('crack'), 3, g);
      r.dot(t.x(-7, -2.2), t.y(-7, -2.2), m('crack'), 4, g);
      // Moss creeping up from the plinth at both corners.
      flat(union(t.ell(11.6, -5.6, 2, 1.4), t.ell(12, 5, 1.4, 1.8), t.ell(9.6, -6.2, 1.1, 0.7)), 'moss', 0.6);
    },
  };
}

// -----------------------------------------------------------------------------
// The Urn (wisp lantern)
// -----------------------------------------------------------------------------

const UM = mats({
  gold: S.urn(), goldDk: R(URN, { shiny: true, step: 0.15 }), band: S.purple(), gem: S.amethyst(),
  light: S.spirit(), ghost: S.spirit(), void: { base: VOID }, smoke: { base: PURPLE[3], ramp: PURPLE, glow: true },
});
type UK = keyof typeof UM;

/**
 * The urn at (0, 0) of F, about 14 units tall at s = 1 (y up): a round gold body on a footed stem, a purple
 * band round its belly set with an amethyst, handles at the shoulders, a narrow neck and a domed lid with a
 * knob, raised by `lift`. Light seeps from under the lid; `glint` -1..1 runs a shine down the gold.
 */
function urn(r: Raster, F: Xf, s: number, lift: number, glint: number, h: (k: UK) => number, g = 1): void {
  const k = (v: number) => v * s;
  const gold = h('gold');
  // The foot and stem.
  r.fill(F.poly([k(-3), k(-7), k(3), k(-7), k(1.6), k(-5.4), k(-1.6), k(-5.4)]), gold, { group: g, bevel: k(0.8) });
  r.fill(F.rect(0, k(-4.9), k(1.2), k(0.8)), h('goldDk'), { group: g, bevel: k(0.5) });
  // Handles: loops at the shoulders.
  for (const d of [-1, 1]) r.fill(subtract(F.circ(k(4.2 * d), k(1.4), k(1.6)), F.circ(k(4.3 * d), k(1.4), k(0.8))), h('goldDk'), { group: g, bevel: k(0.5), toneBias: -1 });
  // The body, its neck and lip.
  const body = union(F.ell(0, k(-1.2), k(4.5), k(4)), F.rect(0, k(3), k(2.2), k(1.2)));
  r.fill(body, gold, { group: g + 1, bevel: k(2) });
  r.fill(F.ell(0, k(4.3), k(3.1), k(0.75)), gold, { group: g + 1, bevel: k(0.5) });
  // The purple band, the amethyst at its front.
  r.fill(intersect(body, F.rect(0, k(-1), k(5), k(0.9))), h('band'), { group: g + 1, bevel: k(0.5), noLine: true });
  r.fill(F.poly([k(-0.9), k(-1), 0, k(0.4), k(0.9), k(-1), 0, k(-2.4)]), h('gem'), { group: g + 1 });
  // Light seeping out from under the lid (a column of it once the lid is up).
  if (lift > 0.3) r.fill(F.rect(0, k(4.6) + k(lift) / 2, k(2.4), k(lift) / 2 + k(0.2)), h('light'), { group: g + 2, noLine: true });
  else r.line(F.x(k(-2.4), k(4.7)), F.y(k(-2.4), k(4.7)), F.x(k(2.4), k(4.7)), F.y(k(2.4), k(4.7)), h('light'), 3, g + 2);
  // The lid and its knob.
  const ly = k(4.8) + k(lift);
  r.fill(intersect(F.ell(0, ly, k(2.9), k(1.8)), F.rect(0, ly + k(1), k(3), k(1))), gold, { group: g + 3, bevel: k(0.8) });
  r.fill(F.rect(0, ly + k(0.15), k(3.1), k(0.3)), h('goldDk'), { group: g + 3, bevel: k(0.3) });
  r.fill(F.circ(0, ly + k(2.4), k(0.8)), gold, { group: g + 3, bevel: k(0.5) });
  // A shine running down the gold.
  if (glint > -1 && glint < 1) {
    const y = k(-glint * 5);
    r.fill(intersect(body, F.poly([k(-5), y + k(1.6), k(5), y - k(0.4), k(5), y - k(1.4), k(-5), y + k(0.6)])), gold, { group: g + 1, flat: 4, noLine: true });
  }
}

/** A ghost's face at (x, y) of F: hollow eyes and a wailing mouth (y up, facing +x). */
function ghostFace(r: Raster, F: Xf, x: number, y: number, s: number, v: number, g: number, wail = 1): void {
  r.fill(F.ell(x + 0.2 * s, y + 0.9 * s, 0.55 * s, 0.75 * s), v, { group: g, noLine: true });
  r.fill(F.ell(x + 1.6 * s, y + 0.8 * s, 0.45 * s, 0.7 * s), v, { group: g, noLine: true });
  r.fill(F.ell(x + 1.1 * s, y - 1.3 * s, 0.6 * s, (0.6 + wail * 0.5) * s), v, { group: g, noLine: true });
}

const urnProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // Floating, a shine crossing the gold, a curl of purple smoke slipping from under the lid.
    urn(r, new Xf(t.ox, t.oy, 0), 0.95, 0, [-0.8, -0.1, 0.6, 1][f], (k) => h(UM[k]));
    const sx = [2.6, 3.4, 4, 4.4][f], sy = [5.4, 6.8, 8.2, 9.4][f];
    r.fill(t.circ(sx, sy, [0.9, 1, 0.9, 0.6][f]), h(UM.smoke), { group: 9, noLine: true });
    if (f > 0) r.dot(t.x(sx - 1.2, sy - 1.4), t.y(sx - 1.2, sy - 1.4), h(UM.smoke), 2, 9);
  },
};

const urnCharge: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // Rattling: the lid jumps, light pours out, and a ghost rises out of the urn, wailing.
    const lift = [1.4, 2.8, 2, 3.2][f];
    const U = new Xf(t.ox, t.oy, 0);
    urn(r, U, 0.95, lift, -1, (k) => h(UM[k]));
    const rise = [0.6, 1.4, 2, 2.6][f];
    const gy = 6.4 + rise, sway = [0, 0.4, 0, -0.4][f];
    r.fill(union(U.ell(sway, gy, 2.2, 2.4), U.poly([-1.8 + sway, gy - 1, 1.8 + sway, gy - 1, 1.2, 4.8, -1.2, 4.8])), h(UM.ghost), { group: 12, bevel: 0.8 });
    ghostFace(r, U, sway - 0.9, gy, 0.85, h(UM.void), 12, f % 2);
    // Sparks of ghost-light spilling over the lip.
    for (const d of [-1, 1]) r.dot(U.x(d * (2.8 + (f % 2)), 4.4 - (f >> 1)), U.y(d * (2.8 + (f % 2)), 4.4 - (f >> 1)), h(UM.light), 4, 13);
  },
};

const ghostProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t0, f, h) {
    // A ghost flying head first: a round wailing head, arms reaching ahead, its sheet trailing off into a
    // rippling tail, wisps of purple left behind.
    const t = new Xf(t0.ox, t0.oy, t0.ang, 1.25, 1.25);
    const w = [0, 0.8, 0, -0.8][f];
    const tail = t.poly([3, 3.6, -1, 3.2, -5, 1.8 + w * 0.4, -9, 0.8 + w, -12.4, 1.4 + w * 1.6, -10.4, -0.2 + w, -11.8, -1.6 + w * 0.6, -8, -1.8 + w * 0.3, -4, -3.2, 1, -3.8, 4, -2.6]);
    r.fill(tail, h(UM.ghost), { group: 2, bevel: 1.4 });
    r.fill(t.circ(3.4, 0.6, 3.6), h(UM.ghost), { group: 2, bevel: 1.6 });
    // Arms reaching forward.
    const reach = [0, 0.4, 0.8, 0.4][f];
    r.fill(chain(t, [[2.4, -2, 0.9], [5.4 + reach, -2.6, 0.7], [7 + reach, -2, 0.55]]), h(UM.ghost), { group: 3, bevel: 0.6 });
    ghostFace(r, t, 3.6, 0.8, 1.05, h(UM.void), 4, f % 2 ? 1 : 0.4);
    // Purple wisps behind.
    for (let i = 0; i < 3; i++) r.dot(t.x(-13.6 - i * 1.6 - (f % 2), 0.6 + w * (1 - i * 0.4) + (i - 1) * 0.8), t.y(-13.6 - i * 1.6 - (f % 2), 0.6 + w * (1 - i * 0.4) + (i - 1) * 0.8), h(UM.smoke), 3 - (i >> 1), 1);
  },
};

const theUrn: SkinArt = {
  mats: {
    // Stock names: the familiar's metal and light, and the spirit bolt, in gold and ghost-light.
    lantern: R(URN, { shiny: true }), wisp: S.spirit(), wispHot: { base: SPIRIT[4], glow: true },
    'k.gold': S.urn(), 'k.goldDk': R(URN, { shiny: true, step: 0.15 }), 'k.band': S.purple(), 'k.gem': S.amethyst(),
    'k.light': S.spirit(), 'k.ghost': S.spirit(), 'k.void': { base: VOID }, 'k.smoke': { base: PURPLE[3], ramp: PURPLE, glow: true },
  },
  glow: [0xd8c8ff, 0x5a2096],
  icon(r, t, m) {
    // The urn, its lid up, a ghost rising out of it.
    const U = new Xf(t.x(0, -4), t.y(0, -4), 0);
    const hm = (k: UK) => m('k.' + k);
    urn(r, U, 1.25, 2.4, 0.3, hm);
    r.fill(union(U.ell(0.6, 12.2, 3.2, 3.4), U.poly([-2.6, 10.6, 3, 10.6, 1.6, 6.4, -1.6, 6.4])), m('k.ghost'), { group: 12, bevel: 1 });
    ghostFace(r, U, -0.8, 12.2, 1.2, m('k.void'), 12);
  },
  proj: { lantern: urnProj, lanternCharge: urnCharge, wisp: ghostProj },
};

// -----------------------------------------------------------------------------
// The Phenom's Hat (executioner hood)
// -----------------------------------------------------------------------------

function phenomHat(): SkinArt {
  // A wide-brimmed black hat pulled low over the eyes, a purple band with a silver concho and a small
  // amethyst; long straight black hair falling from under it past the shoulders; the eyes rolled back to
  // white under heavy brows, and a dark goatee.
  const head = (): HeadSkin => ({
    mats: {
      'h.utFelt': material(S.leather((x, y) => (hash(Math.floor(x * 1.2), Math.floor(y * 1.2)) < 0.05 ? 1 : 0))),
      'h.utBand': material(S.purple()), 'h.utConcho': material(S.silver()), 'h.utGem': material(S.amethyst()),
      'h.utHair': material(S.hair()), 'h.utBeard': material(R(HAIR)), 'h.utEye': material({ base: 0xeee6ff, ramp: [0x8a7aa8, 0xbcb0d6, 0xeee6ff, 0xfaf6ff, 0xffffff], glow: true }),
    },
    draw(r, H, m, g, sway) {
      const s = sway * 1.6, ph = r.phase % 4, fl = [0, 0.3, 0.5, 0.2][ph];
      const hair = m('h.utHair');
      // Long hair falling down the back, its ends uneven and swaying.
      const back = H.poly([
        -1.6, 4.6, -6.2, 4.6, -7.6, 1.2, -8, -4, -8.6 - s * 0.4, -9.6, -9.4 - s, -14 + fl,
        -8.2 - s, -13 + fl, -7.6 - s, -15 + fl * 0.6, -6.4 - s * 0.8, -13.4, -5.4 - s * 0.8, -14.6 + fl,
        -4.4 - s * 0.6, -12.6, -3.4 - s * 0.5, -13.6 + fl * 0.8, -2.6 - s * 0.4, -11, -2, -6.4, -1.2, -2.2, -0.6, 1.6,
      ], 0.3);
      r.fill(back, hair, { group: g, bevel: 1.6, local: H });
      // A lock falling in front of the shoulder.
      r.fill(H.poly([-0.6, 2.6, 0.6, 2.2, 0.6, -4, 1.4 - s * 0.3, -10.4 + fl, 0.4 - s * 0.3, -9.4 + fl, -0.4 - s * 0.3, -11 + fl * 0.6, -1.4, -6]), hair, { group: g + 1, bevel: 1, local: H });
      // The face under the brim: heavy brows, the eyes rolled back to white, a goatee.
      const beard = m('h.utBeard'), eye = m('h.utEye');
      r.fill(H.poly([3.6, -3.6, 5.6, -3.2, 6.2, -4.6, 5.6, -6.2, 4.2, -6.4, 3.4, -5]), beard, { group: g + 2, bevel: 0.6, noLine: true });
      r.line(H.x(4.6, -2.7), H.y(4.6, -2.7), H.x(6.2, -2.9), H.y(6.2, -2.9), beard, 1, g + 2);
      const P = (x: number, y: number) => [Math.floor(H.x(x, y)), Math.floor(H.y(x, y))] as const;
      const [nx, ny] = P(1.4, 0.4), [fx, fy] = P(4.8, 0.3);
      r.dot(nx - 1, ny - 1, beard, 0, g + 2); r.dot(nx, ny - 1, beard, 0, g + 2); r.dot(nx + 1, ny - 1, beard, 0, g + 2); r.dot(nx + 2, ny, beard, 0, g + 2);
      r.dot(fx - 1, fy, beard, 0, g + 2); r.dot(fx, fy - 1, beard, 0, g + 2);
      for (const [x, y] of [[nx, ny + 1], [nx + 1, ny + 1], [nx, ny + 2], [nx + 1, ny + 2]]) r.dot(x, y, eye, 2, g + 2);
      r.dot(fx, fy + 1, eye, 2, g + 2); r.dot(fx, fy + 2, eye, 1, g + 2);
      // The crown, creased down the middle.
      const crown = H.poly([-5.8, 4.4, -6, 8.4, -5, 10.6, -2.4, 11.4, -0.4, 10.6, 1.6, 11.4, 4.2, 10.8, 5.4, 8.6, 5.6, 4]);
      r.fill(crown, m('h.utFelt'), { group: g + 3, bevel: 2.2, local: H });
      r.line(H.x(-0.4, 10.4), H.y(-0.4, 10.4), H.x(-0.2, 8.2), H.y(-0.2, 8.2), m('h.utFelt'), 0, g + 3);
      // The band, the concho and its amethyst.
      r.fill(intersect(crown, H.poly([-7, 4.8, 7, 4.2, 7, 5.8, -7, 6.4])), m('h.utBand'), { group: g + 3, bevel: 0.6, noLine: true });
      r.fill(H.circ(-2.6, 5.4, 1), m('h.utConcho'), { group: g + 3, bevel: 0.7 });
      r.dot(H.x(-2.6, 5.4), H.y(-2.6, 5.4), m('h.utGem'), 3, g + 3);
      // The brim: wide and flat, dipping low over the eyes in front.
      const brim = H.poly([-11.6, 6.4, -6, 5.4, 0, 4.7, 6, 3.9, 11.8, 2.8, 12.2, 2, 6, 2.8, 0, 3.6, -6, 4.3, -11.4, 5.3], 0.35);
      r.fill(brim, m('h.utFelt'), { group: g + 4, bevel: 1.2, local: H });
      // A glint walking along the brim.
      const gx = [8, 3, -2, -7][ph];
      r.dot(H.x(gx, 4.6 - gx * 0.1), H.y(gx, 4.6 - gx * 0.1), m('h.utConcho'), 4, g + 4);
    },
  });
  return { head, ...FX };
}

// -----------------------------------------------------------------------------
// Deadman's Duster (shadow garb)
// -----------------------------------------------------------------------------

function duster(): SkinArt {
  // A long black leather duster down to the shins, lined in purple, its collar turned up behind the neck,
  // open over a black tank top; a black belt with a silver buckle, and an amethyst pin at the collar.
  return {
    mats: {
      'k.utCoat': S.leather(), 'k.utLining': S.purple((x, y) => (wrap(x * 0.4 + y * 0.9, 3) < 0.6 ? -1 : 0)),
      'k.utShirt': S.matte(), 'k.utBelt': S.leather(undefined), 'k.utSilver': S.silver(), 'k.utGem': S.amethyst(),
    },
    chest: {
      torso: 'k.utCoat', sleeve: 'k.utCoat', sleeveLen: 1, forearm: 'k.utCoat', hands: 'skin', pauldron: null,
      trim: null, belt: 'k.utBelt', cape: null, hood: null, spikes: null, skirt: 0, noScarf: true,
      back(r, T, m, c) {
        const top = c.top, s = c.sway * 3, ph = r.phase % 4, fl = [0, 0.5, 0.8, 0.4][ph];
        // The tails: from the shoulders down past the knees, swinging out behind, a vent up the back.
        const outline = [
          1.2, top - 2, -2.6, top - 0.6, -5, top - 4, -6.4 - s * 0.3, -2, -9.6 - s, -11, -12.6 - s * 1.4 - fl, -19.4,
          -9.4 - s * 1.2, -19.8 + fl * 0.4, -7.4 - s * 1.1, -18.6, -5.4 - s, -19.6 + fl * 0.6, -1.4 - s * 0.6, -19 + fl * 0.3, 1.6, -4,
        ];
        r.fill(T.poly(outline.map((v, i) => (i % 2 ? v + 0.3 : v - 1.4))), m('k.utLining'), { group: 40, bevel: 1.4, toneBias: -1, local: T });
        r.fill(T.poly(outline), m('k.utCoat'), { group: 41, bevel: 2.8, softLight: true, local: T });
        // The vent and a seam down each tail.
        r.line(T.x(-6.2 - s * 0.6, -9), T.y(-6.2 - s * 0.6, -9), T.x(-7.4 - s * 1.1, -18.4), T.y(-7.4 - s * 1.1, -18.4), m('k.utLining'), 1, 41);
        r.line(T.x(-3.4, -4), T.y(-3.4, -4), T.x(-3.2 - s * 0.7, -18), T.y(-3.2 - s * 0.7, -18), m('k.utCoat'), 0, 41);
        // The collar turned up behind the neck, purple showing inside.
        const col = [0.4, top + 0.4, -4.4, top - 0.8, -6.4, top + 4.2, -3.4, top + 5, -0.4, top + 3];
        r.fill(T.poly(col), m('k.utCoat'), { group: 42, bevel: 1.4 });
        r.fill(T.poly([-0.2, top + 0.8, -4, top - 0.2, -5.2, top + 3.6, -3.2, top + 4.2, -0.8, top + 2.6]), m('k.utLining'), { group: 42, bevel: 1, noLine: true });
      },
      shoulder: null,
      over(r, T, m, c) {
        const b = c.body, top = c.top, f = b.chestPush * 0.7, front = f + b.chestW;
        // The tank top showing in the open front, the lapel's edge, the collar pin.
        r.fill(T.poly([f + 0.6, top + 0.4, front + 0.2, top, front - 0.2, 3.2, f + 1.8, 3.2]), m('k.utShirt'), { group: c.g, bevel: 1.2 });
        r.line(T.x(f + 0.6, top + 0.2), T.y(f + 0.6, top + 0.2), T.x(f + 1.8, 3), T.y(f + 1.8, 3), m('k.utCoat'), 3, c.g);
        r.line(T.x(f + 1.2, top - 0.4), T.y(f + 1.2, top - 0.4), T.x(f + 2.2, top - 4.4), T.y(f + 2.2, top - 4.4), m('k.utLining'), 2, c.g);
        r.dot(T.x(f + 1, top - 1.2), T.y(f + 1, top - 1.2), m('k.utGem'), 3, c.g);
        // The belt's silver buckle.
        r.fill(T.rect(front - 0.6, 2.4, 0.8, 0.75), m('k.utSilver'), { group: c.g, bevel: 0.6 });
        // The near skirt of the coat hanging over the hip, open at the front.
        const hem = [-b.hipW - 1.2, 2.6, -b.hipW - 1.8, -6, -b.hipW * 0.2, -9.6, b.hipW * 0.55, -9.2, b.hipW * 0.6, 1.8];
        r.fill(T.poly(hem), m('k.utCoat'), { group: c.g + 1, bevel: 1.8, softLight: true, local: T });
        r.line(T.x(b.hipW * 0.6, 1.8), T.y(b.hipW * 0.6, 1.8), T.x(b.hipW * 0.55, -9.2), T.y(b.hipW * 0.55, -9.2), m('k.utLining'), 2, c.g + 1);
        r.fill(T.rect(0, 2.4, b.hipW + 0.6, 0.75), m('k.utBelt'), { group: c.g + 1, bevel: 0.6 });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Graveyard Leathers (ghoststep leggings)
// -----------------------------------------------------------------------------

function leathers(): SkinArt {
  // Black leather trousers with a thin purple stripe down the outside, and black knee pads with a purple
  // rim, a small cross stitched in silver on the near one.
  return {
    mats: {
      'l.utLeather': S.leather(), 'l.utStripe': S.purple(), 'l.utPad': S.leather(undefined), 'l.utRim': S.purple(), 'l.utCross': S.amethyst(),
    },
    legs: {
      mat: 'l.utLeather', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.35, shin: null,
      over(r, t, m, c) {
        const L = c.len, kr = c.body.kneeR;
        r.fill(t.poly([L + 1, -0.35, L + 1, 0.35, 1, 0.3, 1, -0.3]), m('l.utStripe'), { group: c.g, bevel: 0.3, toneBias: c.bias, noLine: true });
        const pad = t.ell(0.2, 0.6, kr + 1.1, kr + 1.2);
        r.fill(pad, m('l.utPad'), { group: c.far ? 25 : 27, bevel: 1.6, toneBias: c.bias });
        r.fill(subtract(pad, t.ell(0.2, 0.6, kr + 0.5, kr + 0.6)), m('l.utRim'), { group: c.far ? 25 : 27, flat: 2, noLine: true, toneBias: c.bias });
        if (c.far) return;
        const cx = t.x(0.2, 0.9), cy = t.y(0.2, 0.9);
        r.dot(cx, cy - 1, m('l.utCross'), 3, 27); r.dot(cx, cy, m('l.utCross'), 3, 27); r.dot(cx, cy + 1, m('l.utCross'), 2, 27);
        r.dot(cx - 1, cy - 1, m('l.utCross'), 2, 27); r.dot(cx + 1, cy - 1, m('l.utCross'), 2, 27);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Tombstone Boots (shadow treads)
// -----------------------------------------------------------------------------

function boots(): SkinArt {
  // Tall black wrestling boots laced up the front in purple, silver eyelets, a scuffed silver toe guard and
  // a thick black sole; an amethyst at the top lace.
  return {
    mats: {
      'b.utBoot': S.leather(), 'b.utSole': S.matte(), 'b.utLace': S.purple(), 'b.utSilver': S.silver(), 'b.utGem': S.amethyst(),
    },
    boots: {
      mat: 'b.utBoot', height: 0.9, bulk: 0.5, trim: 'b.utSole', wing: null, knee: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias }, w = c.w, ph = r.phase % 4;
        r.fill(foot.cap(-1.8, -1.55, c.toe + 0.3, -1.4, 0.7), m('b.utSole'), { ...o, bevel: 0.5 });
        r.fill(intersect(foot.ell(c.toe - 1.2, -0.4, 1.6, 1.3), foot.rect(c.toe - 1.2, -0.4, 2, 1.6)), m('b.utSilver'), { ...o, bevel: 0.8, local: foot });
        if (c.far) return;
        let i = 0;
        for (let x = 1.4; x < c.top - 1.2; x += 1.5, i++) {
          r.line(shin.x(x, w - 0.5), shin.y(x, w - 0.5), shin.x(x + 1.3, w + 0.1), shin.y(x + 1.3, w + 0.1), m('b.utLace'), 2, c.g);
          r.dot(shin.x(x, w), shin.y(x, w), m('b.utSilver'), i % 4 === ph ? 4 : 3, c.g);
        }
        r.dot(shin.x(c.top - 0.8, w - 0.2), shin.y(c.top - 0.8, w - 0.2), m('b.utGem'), 3, c.g);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = {
  fog: css(0x2a1a44), fogHi: css(0x5a3a8a), ghost: css(SPIRIT[3]), ghostHi: css(SPIRIT[4]), ghostDk: css(SPIRIT[1]),
  void: css(VOID), bolt: css(0xe8dcff), boltDk: css(PURPLE[3]),
};

/** A ghostly hand at (px, py) rising out of the ground, `u` 0..1 how far it is up, `d` which way it reaches. */
function graveHand(g: CanvasRenderingContext2D, px: number, py: number, u: number, d: number, alpha: number): void {
  const up = Math.round(Math.sin(Math.min(1, u) * Math.PI) * 7);
  if (up <= 0) return;
  g.globalAlpha = alpha;
  g.fillStyle = AC.ghost;
  // The forearm out of the earth, the palm, three fingers and a thumb clawing at the air.
  g.fillRect(px, py - up, 2, up);
  if (up > 3) {
    g.fillRect(px - 1, py - up - 1, 4, 2);
    g.fillStyle = AC.ghostHi;
    for (const k of [-1, 0.5, 2]) g.fillRect(Math.round(px + k + (up > 5 ? d : 0)), py - up - 3, 1, 2);
    g.fillRect(px + (d > 0 ? 3 : -2), py - up, 1, 1);
  }
  // Earth breaking where it comes up.
  g.globalAlpha = alpha * 0.8;
  g.fillStyle = AC.fogHi;
  g.fillRect(px - 2, py, 6, 1);
}

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function undertakerAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  const back = layer === 'back';
  // Graveyard fog rolling round the feet: a dark ring with paler clumps drifting along it.
  const RX = 17, RY = 4.2, N = 44;
  g.globalAlpha = back ? 0.55 : 0.7;
  ring(g, x, y, RX, RY, N, layer, (g, px, py, i) => {
    const w = Math.sin((i / N) * Math.PI * 4 + t * 1.3) + Math.sin((i / N) * Math.PI * 10 - t * 0.7) * 0.5;
    g.fillStyle = w > 0.6 ? AC.fogHi : AC.fog;
    g.fillRect(px - 1, py, 3, 1);
    if (w > 0.2) g.fillRect(px, py - 1, 2, 1);
  });
  // Hands of the dead clawing up out of the ground and sinking back, one after another.
  const per = 2.1;
  for (let k = 0; k < 3; k++) {
    const n = Math.floor((t + k * per / 3) / per), u = ((t + k * per / 3) % per) / per;
    const a = hash(n * 3 + k, 17) * Math.PI * 2, s = Math.sin(a);
    if ((s < 0) !== back) continue;
    graveHand(g, Math.round(x + Math.cos(a) * (RX - 3)), Math.round(y + s * RY), u * 1.25, Math.cos(a) > 0 ? -1 : 1, back ? 0.6 : 0.85);
  }
  // Ghosts rising off the fog, swaying, fading as they climb.
  for (let k = 0; k < 3; k++) {
    const life = 3.4, w = ((t + k * 1.13) % life) / life, n = Math.floor((t + k * 1.13) / life);
    const a = hash(n + k * 7, 5) * Math.PI * 2, s = Math.sin(a);
    if ((s < 0) !== back) continue;
    const px = Math.round(x + Math.cos(a) * RX * 0.8 + Math.sin(t * 2.4 + k) * 2), py = Math.round(y + s * RY - w * 34);
    g.globalAlpha = Math.min(1, w * 6, (1 - w) * 2) * (back ? 0.55 : 0.8);
    g.fillStyle = AC.ghost;
    g.fillRect(px - 1, py - 2, 3, 3);
    g.fillRect(px - 2, py - 1, 5, 2);
    g.fillRect(px - 1 + (Math.floor(t * 4 + k) % 2), py + 1, 2, 1);
    g.fillStyle = AC.void;
    g.fillRect(px - 1, py - 1, 1, 1); g.fillRect(px + 1, py - 1, 1, 1);
  }
  // Now and then the lights go purple: lightning strikes the ground behind him.
  if (back) {
    const per2 = 5.5, u = (t % per2) / per2, n = Math.floor(t / per2);
    if (u < 0.09) {
      const side = hash(n, 41) < 0.5 ? -1 : 1;
      let bx = x + side * (24 + Math.round(hash(n, 43) * 6)), by = y - 64;
      g.globalAlpha = u < 0.03 || (u > 0.05 && u < 0.07) ? 1 : 0.45;
      for (let i = 0; i < 16 && by < y - 1; i++) {
        const step = 4 + Math.round(hash(n * 13 + i, 47) * 2), jog = Math.round((hash(n + i * 5, 53) - 0.5) * 6);
        g.fillStyle = AC.boltDk;
        g.fillRect(Math.min(bx, bx + jog) - 1, by, Math.abs(jog) + 3, 1);
        g.fillStyle = AC.bolt;
        g.fillRect(Math.min(bx, bx + jog), by, Math.abs(jog) + 1, 1);
        bx += jog;
        g.fillRect(bx, by, 1, step);
        by += step;
      }
      g.globalAlpha *= 0.7;
      g.fillStyle = AC.fogHi;
      g.fillRect(bx - 3, y - 1, 7, 1);
      g.fillStyle = AC.bolt;
      g.fillRect(bx - 1, y - 2, 3, 1);
    }
  }
  g.globalAlpha = 1;
}

export const UNDERTAKER: Record<string, SkinArt> = {
  'spirit_wraps.undertaker': { weapon: grips, proj: { palm: chokeslamProj }, ...FX },
  'tower_shield.undertaker': { weapon: tombstone, ...FX },
  'wisp_lantern.undertaker': theUrn,
  'executioner_hood.undertaker': phenomHat(),
  'shadow_garb.undertaker': duster(),
  'ghoststep_leggings.undertaker': leathers(),
  'shadow_treads.undertaker': boots(),
};
