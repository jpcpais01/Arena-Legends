import { css } from '../../pixel/color';
import { material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { ring, type Layer } from '../../auraKit';
import { hairCap } from '../draw';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, mats, wrap } from './kit';

/**
 * Mythic set: Oba, The Ruler. Oba Femi as he walks to the ring: bald and
 * bearded, shirtless and built like a wall. The chest piece is the muscle
 * itself (a broad chest, slabs of pecs, abs, a thick neck, big arms), over
 * black trunks with a gold waistband; black kneepads and ring boots trimmed
 * in gold, white tape on the fists, and his championship floating at the
 * shoulder. Night accents: the diamonds on the title glow, the gold glints,
 * sweat catches the light on his head.
 */

/** Championship gold. */
const GOLD = [0x5a3406, 0x9c680e, 0xdcac24, 0xffe058, 0xfffad0];
/** Black ring gear: glossy, its top tone the shine. */
const BLACK = [0x060508, 0x121014, 0x221e24, 0x3a343c, 0x726a74];
/** White athletic tape. */
const TAPE = [0x8a8478, 0xbcb6a8, 0xe2ded4, 0xf6f4ee, 0xffffff];
/** A short black beard. */
const BEARD = [0x050404, 0x0e0b0a, 0x1a1513, 0x2c2420, 0x463a34];
/** Diamonds (self-lit at night). */
const ICE = [0x5a7a9a, 0x9ac8e8, 0xd8f0ff, 0xf2faff, 0xffffff];
/** Rubies on the title. */
const RUBY = [0x420810, 0x82121e, 0xc4242e, 0xf25a58, 0xffc4b8];
const WHITE = 0xffffff;

/** A glint sliding along polished gold, one step a frame. */
const sweep = (period = 10, speed = 2.5, w = 1.1): Tex => (x, y, ph) => (wrap(x * 0.8 + y * 0.45 - ph * speed, period) < w ? 1 : 0);
/** Glossy leather: a few bright flecks. */
const gloss: Tex = (x, y) => (hash(Math.floor(x * 1.4), Math.floor(y * 1.4)) < 0.07 ? 1 : 0);
/** Tape wound round in overlapping turns. */
const turns: Tex = (x, y) => (wrap(x * 1.1 + y * 0.35, 1.6) < 0.4 ? -1 : 0);
/** Tight beard curls. */
const curls: Tex = (x, y) => (hash(Math.floor(x * 1.6), Math.floor(y * 1.6)) < 0.22 ? -1 : hash(Math.floor(x * 1.6) + 7, Math.floor(y * 1.6)) < 0.08 ? 1 : 0);
/** A diamond flashing over the loop. */
const flash: Tex = (_x, _y, ph) => [0, 1, 0, -1][ph % 4];

const S = {
  gold: (tex: Tex | undefined = sweep()): MaterialSpec => ({ base: GOLD[2], ramp: GOLD, shiny: true, step: 0.15, tex }),
  black: (tex: Tex | undefined = gloss): MaterialSpec => ({ base: BLACK[2], ramp: BLACK, shiny: true, step: 0.14, tex }),
  tape: (tex: Tex | undefined = turns): MaterialSpec => ({ base: TAPE[2], ramp: TAPE, tex }),
  ice: (tex: Tex | undefined = flash): MaterialSpec => ({ base: ICE[2], ramp: ICE, glow: true, tex }),
  ruby: (): MaterialSpec => ({ base: RUBY[2], ramp: RUBY, shiny: true, step: 0.16 }),
};

/** Gold and white sparkles; a swing trails gold. */
const FX = { ...epicFx(0xffe890, 0xffffff, 'twinkle'), trail: [0xfff6d0, 0xe0a828] as [number, number] };

/** Particles the full set sheds in battle: gold glitter and white flashes. */
export const OBA_FX: SkinFx = { spark: 0xffe890, spark2: 0xffffff, kind: 'twinkle' };

/** A diamond (a cut gem seen face-on) at (x, y) of F. */
const diamond = (F: Xf, x: number, y: number, rx: number, ry = rx * 1.3): Shape => F.poly([x - rx, y, x, y + ry, x + rx, y, x, y - ry]);

// -----------------------------------------------------------------------------
// Oba's Taped Fists (spirit wraps)
// -----------------------------------------------------------------------------

function tapedFists(): WeaponArt {
  // Bare fists, the knuckles and wrists bound in white tape, a strip of gold tape round each wrist and a
  // black wristband above it edged in gold. The gold tape catches the light.
  return {
    tip: 4,
    mats: {
      tape: material(S.tape()), band: material(S.black()), gold: material(S.gold(sweep(7, 1.75, 0.9))), edge: material(S.gold(undefined)),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, b = o.toneBias ?? 0, L = o.local;
      // The black wristband up the forearm, gold at both edges.
      fillAll(r, [t.cap(-6.6, 0, -4.6, 0, 1.75, 1.85)], m('band'), o, 1.2);
      for (const x of [-6.5, -4.7]) r.fill(intersect(t.cap(-6.6, 0, -4.6, 0, 1.75, 1.85), t.rect(x, 0, 0.3, 3)), m('edge'), { group: g, flat: 3, noLine: true, toneBias: b, local: L });
      // Tape round the wrist, wound in turns, the gold strip in the middle of it.
      const wristTape = t.cap(-4.4, 0, -1.5, 0, 1.75, 1.95);
      fillAll(r, [wristTape], m('tape'), o, 1);
      r.fill(intersect(wristTape, t.rect(-3, 0, 0.45, 3)), m('gold'), { group: g, flat: 3, noLine: true, toneBias: b, local: L });
      // Tape over the knuckles, the bare fist showing behind it.
      const knuckles = intersect(t.ell(0.4, 0, 2.5, 2.35), t.poly([0.8, -3, 3.2, -3, 3.2, 3, 0.8, 3]));
      fillAll(r, [knuckles], m('tape'), o, 0.9);
      r.line(t.x(1.3, -1.9), t.y(1.3, -1.9), t.x(1.6, 1.9), t.y(1.6, 1.9), m('tape'), 1, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Fall From Grace Wraps (iron cestus)
// -----------------------------------------------------------------------------

function graceWraps(): WeaponArt {
  // The off fist taped up heavy for the powerbomb: black tape wound from the forearm over the whole fist,
  // two gold bands round the wrist, and a gold plate over the knuckles with three studs.
  return {
    tip: 5,
    mats: {
      wrap: material(S.black((x, y) => (wrap(x * 1.1 + y * 0.35, 1.6) < 0.4 ? -1 : gloss(x, y, 0)))),
      gold: material(S.gold(undefined)), plate: material(S.gold(sweep(8, 2, 1))), tape: material(S.tape()),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, b = o.toneBias ?? 0, L = o.local;
      const fist = union(t.cap(-6.4, 0, -1.2, 0, 1.8, 2.15), t.ell(0.9, 0, 2.6, 2.5));
      fillAll(r, [fist], m('wrap'), o, 1.4);
      // White tape at the very top of the wrap.
      r.fill(intersect(fist, t.rect(-6, 0, 0.6, 3)), m('tape'), { group: g, bevel: 0.5, toneBias: b, noLine: true, local: L });
      for (const x of [-3.6, -2.2]) r.fill(intersect(fist, t.rect(x, 0, 0.3, 3)), m('gold'), { group: g, flat: 3, noLine: true, toneBias: b, local: L });
      // The knuckle plate and its studs.
      fillAll(r, [t.rect(3.3, 0, 0.8, 2.6, 0.5)], m('plate'), o, 0.9);
      for (const y of [-1.6, 0, 1.6]) fillAll(r, [t.circ(4.4, y, 0.6)], m('gold'), o, 0.5);
    },
  };
}

// -----------------------------------------------------------------------------
// Oba's Championship (echo stone)
// -----------------------------------------------------------------------------

const TITLE: Record<string, MaterialSpec> = {
  'k.oStrap': S.black(), 'k.oGold': S.gold(undefined), 'k.oRim': S.gold(undefined), 'k.oInk': S.black(undefined),
  'k.oIce': S.ice(undefined), 'k.oRuby': S.ruby(), 'k.oSpark': { base: WHITE, glow: true },
  'k.oX': { base: GOLD[3], ramp: GOLD, shiny: true, step: 0.15 }, 'k.oWhite': { base: TAPE[3], ramp: TAPE },
};
const TM = mats(TITLE);

/**
 * The championship in frame F (`s` its scale; about 28 x 22 units at 1): a black strap stitched in white,
 * a gold side plate each end, and the big centre plate: a gold shield ringed with diamonds round black
 * enamel crossed by a great gold X, rubies at its points, a gold bar across the top. `glint` -1..1 sweeps a
 * shine across the gold (off when outside); `gem` brightens the diamonds.
 */
function championship(r: Raster, F: Xf, s: number, glint: number, gem: number, m: (k: string) => number, g0: number): void {
  const S2 = (v: number) => v * s;
  const strap = F.poly([S2(-14), S2(-1.8), S2(-7), S2(-2.8), S2(7), S2(-2.8), S2(14), S2(-1.8), S2(14), S2(2.2), S2(7), S2(2.6), S2(-7), S2(2.6), S2(-14), S2(2.2)], S2(0.6));
  r.fill(strap, m('k.oStrap'), { group: g0, bevel: S2(1.2) });
  for (let x = -13; x <= 13; x += 1.6) {
    if (Math.abs(x) < 7) continue;
    for (const y of [-2, 1.9]) r.dot(Math.round(F.x(S2(x), S2(y))), Math.round(F.y(S2(x), S2(y))), m('k.oWhite'), 3, g0);
  }
  // Side plates: gold, each with a black inlay and a diamond.
  for (const k of [-1, 1]) {
    const cx = S2(10 * k);
    r.fill(F.rect(cx, S2(0.3), S2(2.4), S2(3.6), S2(1.2)), m('k.oGold'), { group: g0 + 1, bevel: S2(1.2) });
    r.fill(F.rect(cx, S2(0.3), S2(1.4), S2(2.5), S2(0.7)), m('k.oInk'), { group: g0 + 1, bevel: S2(0.8), noLine: true });
    r.fill(diamond(F, cx, S2(0.3), S2(0.8), S2(1.1)), m('k.oIce'), { group: g0 + 1, toneBias: gem });
  }
  // The centre plate: a broad shield, wide at the top, coming to a point below.
  const plate = F.poly([S2(-7.4), S2(6.6), S2(7.4), S2(6.6), S2(8), S2(1.4), S2(5.6), S2(-4.6), S2(0), S2(-8), S2(-5.6), S2(-4.6), S2(-8), S2(1.4)], S2(1.4));
  r.fill(plate, m('k.oRim'), { group: g0 + 2, bevel: S2(1.8), lightBias: 0.2 });
  const inner = F.poly([S2(-5.6), S2(5), S2(5.6), S2(5), S2(6.1), S2(1.2), S2(4.2), S2(-3.6), S2(0), S2(-6.2), S2(-4.2), S2(-3.6), S2(-6.1), S2(1.2)], S2(1));
  r.fill(inner, m('k.oInk'), { group: g0 + 2, bevel: S2(1), noLine: true });
  // The great X across the enamel, edged in a darker gold.
  const bar = (x0: number, y0: number, x1: number, y1: number) => F.cap(S2(x0), S2(y0), S2(x1), S2(y1), S2(1.05));
  const X = intersect(inner, union(bar(-4.4, 4, 3.4, -4.6), bar(4.4, 4, -3.4, -4.6)));
  r.fill(X, m('k.oX'), { group: g0 + 3, bevel: S2(0.9), lightBias: 0.25 });
  // Diamonds round the rim, rubies at the shield's three points.
  for (const [x, y] of [[-6.2, 5.8], [-3.1, 6], [0, 6.1], [3.1, 6], [6.2, 5.8], [7, 0.6], [-7, 0.6], [4.6, -4.6], [-4.6, -4.6]]) {
    r.fill(F.circ(S2(x), S2(y), Math.max(0.55, S2(0.6))), m('k.oIce'), { group: g0 + 3, toneBias: gem });
  }
  for (const [x, y] of [[0, -7.1], [-7.6, 3.6], [7.6, 3.6]]) r.fill(F.circ(S2(x), S2(y), Math.max(0.6, S2(0.85))), m('k.oRuby'), { group: g0 + 3 });
  // A gold bar across the top of the plate.
  r.fill(F.rect(0, S2(7.6), S2(5.2), S2(0.9), S2(0.6)), m('k.oGold'), { group: g0 + 4, bevel: S2(0.6) });
  // A shine sweeping across the gold.
  if (glint > -1 && glint < 1) {
    const x = S2(glint * 8);
    const band = F.poly([x - S2(0.8), S2(-9), x + S2(0.6), S2(-9), x + S2(2.4), S2(9), x + S2(1), S2(9)]);
    r.fill(intersect(plate, band), m('k.oSpark'), { group: g0 + 5, flat: 3, noLine: true });
  }
}

/** The title floating at the shoulder: the shine crossing it, the diamonds flaring as it passes. */
const titleCore: ProjArt = {
  frames: 8,
  outline: true,
  draw(r, t, f, h) {
    const glint = [-1, -0.7, -0.25, 0.2, 0.65, 1, 1, 1][f];
    championship(r, new Xf(t.ox, t.oy, 0, 1, 1), 0.5, glint, f >= 2 && f <= 4 ? 1 : 0, (k) => h(TM[k]), 1);
  },
};

const obaTitle: SkinArt = {
  mats: { ...TITLE, stone: S.gold(), rune: S.ice() },
  glow: [0xfff0b0, 0xe0a828],
  icon(r, t, m) {
    championship(r, new Xf(t.x(0, -0.6), t.y(0, -0.6), 0, 1, 1), 0.92, -0.35, 0, m, 1);
  },
  proj: { core: titleCore },
};

// -----------------------------------------------------------------------------
// Oba's Beard (gladiator helm)
// -----------------------------------------------------------------------------

function obaBeard(): SkinArt {
  // No helmet at all: the head shaved clean (no hair at all), a short thick black beard
  // round the jaw joined to the moustache, the ear showing, and a shine on the scalp where the sweat
  // catches the light.
  return {
    head: () => ({
      mats: {
        'h.beard': material({ base: BEARD[2], ramp: BEARD, tex: curls }),
        'h.sweat': material({ base: 0xe8f4ff, ramp: [0x8aa0b4, 0xb8cadc, 0xe8f4ff, 0xf6fbff, WHITE], shiny: true }),
        // The wearer's own skin (look.ts recolours `flesh.*`), so the scalp and ear also show on the icon.
        'flesh.scalp': material({ base: 0x6a4230 }),
      },
      bald: true,
      draw(r, H, m, g) {
        const ph = r.phase % 4, sk = m('flesh.scalp');
        // The shaved scalp, then the ear behind the sideburn.
        r.fill(hairCap(H, 3.4, -2, 0.3), sk, { group: g, bevel: 3, softLight: true, noLine: true });
        r.fill(H.ell(-3.1, 0.1, 1.15, 1.7, -0.15), sk, { group: g, bevel: 1, toneBias: -1 });
        r.dot(H.x(-3, 0), H.y(-3, 0), sk, 1, g);
        // The beard: sideburns down into a full jaw, the moustache over the lip, the mouth left open.
        const beard = H.poly([
          -1.9, 1.2, -0.8, 1.2, 0, -1, 1.4, -2.2, 2.8, -2.5, 4, -2.3, 5.8, -2.3, 6.7, -2.9, 6.6, -3.7,
          6.2, -4.6, 5.2, -5.9, 3.4, -6.5, 1.4, -6.1, -0.4, -4.7, -1.6, -2.8, -2.2, -0.6,
        ], 0.6);
        r.fill(subtract(beard, H.ell(4.05, -3.85, 1.05, 0.6)), m('h.beard'), { group: g, bevel: 1.4 });
        // A shine on the shaved scalp, hopping as he moves.
        const sx = [1.6, 2, 1.8, 1.4][ph];
        r.dot(H.x(sx, 5.4), H.y(sx, 5.4), sk, 4, g);
        r.dot(H.x(sx + 1, 5.2), H.y(sx + 1, 5.2), sk, 4, g);
        r.dot(H.x(sx - 1.2, 5.6), H.y(sx - 1.2, 5.6), sk, 3, g);
        // A bead of sweat at the temple, glinting.
        r.dot(H.x(-0.4, 2.6), H.y(-0.4, 2.6), m('h.sweat'), ph === 1 ? 4 : 3, g);
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Oba's Muscles (juggernaut plate)
// -----------------------------------------------------------------------------

function obaMuscles(): SkinArt {
  // The chest piece is the man: no shirt, just muscle. A broad chest and big arms (the body bulks up),
  // slabs of pecs, a six-pack, a thick neck sloping into the traps; black trunks with a gold waistband and a
  // gold stripe down the hip.
  return {
    mats: {
      'k.oTrunk': S.black(), 'k.oBand': S.gold(sweep(9, 2.2, 1)), 'k.oTrim': S.gold(undefined),
      // The wearer's own skin and its shade (look.ts recolours `flesh.*`), so the muscle shows on the icon too.
      'flesh.muscle': { base: 0x6a4230 }, 'flesh.dark': { base: 0x4a2a1e },
    },
    chest: {
      torso: 'skin', sleeve: null, sleeveLen: 0, forearm: null, hands: 'skin', pauldron: null,
      trim: null, belt: 'k.oBand', cape: null, hood: null, spikes: null, skirt: 0, noScarf: true, muscle: 1,
      back: null, shoulder: null,
      over(r, T, m, c) {
        const b = c.body, top = c.top, fx = b.chestPush * 0.7, front = fx + b.chestW;
        const sk = m('flesh.muscle'), sd = m('flesh.dark'), o = { group: c.g, noLine: true };
        // Traps sloping from the neck to the shoulders.
        r.fill(T.poly([-2.6, top - 0.6, -1.2, top + 2.4, fx + 1.4, top + 2.6, fx + 3.6, top + 0.4, fx + 1, top - 1.4]), sk, { ...o, bevel: 1.8, softLight: true });
        // The pecs: a slab either side of the breastbone, the far one turned away.
        const near = T.ell(fx + b.chestW * 0.28, top - 3.6, b.chestW * 0.62, 3.2, -0.08);
        const far = T.ell(front - 1.2, top - 3.8, 1.9, 2.9, 0.1);
        r.fill(far, sk, { ...o, bevel: 1.6, toneBias: -1 });
        r.fill(near, sk, { ...o, bevel: 2.4, lightBias: 0.25 });
        // Their shadowed undersides.
        const under = (cx: number, cy: number, rx: number, ry: number) => subtract(T.ell(cx, cy, rx, ry), T.ell(cx, cy + 0.7, rx, ry));
        r.fill(under(fx + b.chestW * 0.28, top - 3.6, b.chestW * 0.62, 3.2), sd, { ...o, flat: 1 });
        r.fill(under(front - 1.2, top - 3.8, 1.9, 2.9), sd, { ...o, flat: 0 });
        // Six-pack: three rows of blocks either side of the line down the middle.
        const mid = front - 2.4;
        for (const [i, y] of [top * 0.6, top * 0.46, top * 0.32].entries()) {
          r.fill(T.rect(mid - 1.15, y, 0.95, 0.85 - i * 0.05, 0.45), sk, { ...o, bevel: 0.8, lightBias: 0.3 });
          r.fill(T.rect(mid + 0.95, y, 0.7, 0.8 - i * 0.05, 0.4), sk, { ...o, bevel: 0.7, toneBias: -1 });
          r.line(T.x(mid - 2, y - 1), T.y(mid - 2, y - 1), T.x(mid + 1.6, y - 1), T.y(mid + 1.6, y - 1), sd, 1, c.g);
        }
        r.line(T.x(mid, top * 0.66), T.y(mid, top * 0.66), T.x(mid, top * 0.24), T.y(mid, top * 0.24), sd, 1, c.g);
        // Serratus along the side.
        for (const y of [top * 0.68, top * 0.58]) r.line(T.x(fx - 1.2, y), T.y(fx - 1.2, y), T.x(fx + 0.2, y - 0.8), T.y(fx + 0.2, y - 0.8), sd, 1, c.g);
        // Black trunks over the hips, a gold waistband and a gold stripe down the side.
        const trunks = T.poly([-b.hipW - 0.5, 3.2, b.hipW + 1.3, 3.2, b.hipW + 1.9, -2.9, b.hipW * 0.3, -2.2, -b.hipW - 0.9, -2.6]);
        r.fill(trunks, m('k.oTrunk'), { group: c.g + 1, bevel: 2 });
        r.fill(intersect(trunks, T.rect(0, 2.6, 12, 0.65)), m('k.oBand'), { group: c.g + 1, bevel: 0.4, noLine: true });
        r.fill(intersect(trunks, T.poly([-0.8, 2.2, 0.2, 2.2, 0.6, -3, -0.4, -3])), m('k.oTrim'), { group: c.g + 1, flat: 3, noLine: true });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Oba's Ring Trunks (charger cuisses)
// -----------------------------------------------------------------------------

function ringTrunks(): SkinArt {
  // Bare, heavy thighs under the legs of black trunks cut high and edged in gold, and thick black kneepads
  // with a gold rim and a gold bar across the near one.
  return {
    mats: {
      'l.oTrunk': S.black(), 'l.oTrim': S.gold(undefined), 'l.oPad': S.black(undefined), 'l.oBar': S.gold(sweep(7, 1.75, 0.9)),
    },
    legs: {
      mat: 'skin', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.5, shin: null,
      over(r, t, m, c) {
        const L = c.len, w = c.w, kr = c.body.kneeR;
        // The leg of the trunks, cut high on the outside of the thigh.
        const leg = t.poly([L * 0.62, w + 0.6, L + 2, w + 0.6, L + 2, -w - 0.6, L * 0.86, -w - 0.6]);
        r.fill(leg, m('l.oTrunk'), { group: c.g, bevel: 1.6, toneBias: c.bias });
        r.fill(intersect(leg, t.poly([L * 0.62, w + 1, L * 0.62 + 0.7, w + 1, L * 0.86 + 0.7, -w - 1, L * 0.86, -w - 1])), m('l.oTrim'), { group: c.g, flat: 3, noLine: true, toneBias: c.bias });
        // The kneepad: thick black padding, gold round the bottom, a gold bar on the near one.
        const pad = t.ell(-0.2, 0.7, kr + 1.5, kr + 1.6);
        const g = c.far ? 25 : 27;
        r.fill(pad, m('l.oPad'), { group: g, bevel: 1.8, toneBias: c.bias });
        r.fill(intersect(subtract(pad, t.ell(-0.2, 0.7, kr + 0.8, kr + 0.9)), t.poly([-6, -6, -0.6, -6, -0.6, 6, -6, 6])), m('l.oTrim'), { group: g, flat: 2, noLine: true, toneBias: c.bias });
        if (c.far) return;
        r.fill(t.rect(0.4, 0.9, 0.55, kr * 0.8, 0.3), m('l.oBar'), { group: g, bevel: 0.4 });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Oba's Ring Boots (colossus boots)
// -----------------------------------------------------------------------------

function ringBoots(): SkinArt {
  // Tall black wrestling boots up the shin: laced in gold down the front, a gold band at the cuff, a gold
  // stripe round the sole.
  return {
    mats: {
      'k.obBoot': S.black(), 'k.obBand': S.gold(undefined), 'k.obSole': S.gold(sweep(7, 1.75, 0.9)), 'k.obLace': S.gold(undefined),
    },
    boots: {
      mat: 'k.obBoot', height: 0.8, bulk: 0.7, trim: 'k.obBand', wing: null, knee: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias }, w = c.w, ph = r.phase % 4;
        r.fill(foot.cap(-1.8, -1.6, c.toe + 0.3, -1.4, 0.55), m('k.obSole'), { ...o, bevel: 0.5 });
        if (c.far) return;
        // Laces criss-crossed up the front, a glint climbing them.
        for (let x = 1.2, i = 0; x < c.top - 1.8; x += 1.3, i++) {
          r.line(shin.x(x, w - 0.4), shin.y(x, w - 0.4), shin.x(x + 1.1, w + 0.1), shin.y(x + 1.1, w + 0.1), m('k.obLace'), i % 4 === ph ? 4 : 3, c.g);
        }
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = {
  gold: css(GOLD[3]), goldDk: css(GOLD[1]), glint: css(GOLD[4]), white: css(WHITE), ink: css(BLACK[1]),
  steam: css(0xe8ecf0), crack: css(0x2a2018), dust: css(0xc8a878),
};
let ringBeat = 0;
const apronDot = (g: CanvasRenderingContext2D, px: number, py: number, i: number) => {
  g.fillStyle = i % 6 < 3 ? (ringBeat > 0.5 && i % 6 === 1 ? AC.glint : AC.gold) : AC.ink;
  g.fillRect(px, py, 1, 1);
};

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function obaAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  const back = layer === 'back';
  // A gold and black ring on the ground, beating like a heart (two quick pulses, a rest).
  const bt = t % 1.4, beat = Math.max(0, 1 - bt * 6) + Math.max(0, 1 - Math.abs(bt - 0.3) * 6);
  ringBeat = beat;
  g.globalAlpha = (back ? 0.5 : 0.7) + beat * 0.25;
  ring(g, x, y, 14 + beat, 3.6 + beat * 0.25, 44, layer, apronDot);
  // Steam rising off his shoulders.
  for (let k = 0; k < 4; k++) {
    if ((k % 2 === 0) !== back) continue;
    const w = ((t * 0.5 + k * 0.27) % 1);
    const px = Math.round(x + (k < 2 ? -5 : 5) + Math.sin(t * 2 + k) * 1.5 + (k < 2 ? -w * 3 : w * 3)), py = Math.round(y - 42 - w * 18);
    g.globalAlpha = Math.min(1, w * 6, (1 - w) * 1.4) * 0.45;
    g.fillStyle = AC.steam;
    g.fillRect(px, py, w > 0.5 ? 2 : 1, 1);
    if (w > 0.35) g.fillRect(px + (k % 2 ? 1 : -1), py - 1, 1, 1);
  }
  // The flex: every few seconds the ground cracks round his feet, dust jumps and gold power streaks
  // shoot up around him.
  const per = 3.2, u = (t % per) / per, n = Math.floor(t / per);
  if (u < 0.32) {
    const v = u / 0.32;
    // Cracks running out from the feet.
    g.globalAlpha = (1 - v) * 0.85;
    g.fillStyle = AC.crack;
    for (let k = 0; k < 6; k++) {
      const a = hash(n, k) * Math.PI * 2, s = Math.sin(a);
      if ((s < 0) !== back) continue;
      const len = 6 + hash(k, n + 5) * 8;
      for (let d = 3; d < 3 + len * Math.min(1, v * 3); d += 1) {
        const jag = Math.round(Math.sin(d * 1.7 + k) * 0.6);
        g.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + s * d * 0.26) + jag, 1, 1);
      }
    }
    // Dust puffs either side.
    g.fillStyle = AC.dust;
    for (const s of [-1, 1]) {
      if ((s > 0) === back) continue;
      const px = Math.round(x + s * (8 + v * 8)), py = Math.round(y - v * 4);
      g.globalAlpha = (1 - v) * 0.6;
      g.fillRect(px, py, 2, 1); g.fillRect(px - s, py - 1, 2, 1);
    }
    // Power streaks rising.
    if (!back) {
      for (let k = 0; k < 6; k++) {
        const px = Math.round(x + (hash(k, n + 9) - 0.5) * 30), py = Math.round(y - 4 - v * 40 - hash(n, k + 2) * 10);
        g.globalAlpha = (1 - v) * 0.9;
        g.fillStyle = k % 3 === 0 ? AC.white : AC.gold;
        g.fillRect(px, py, 1, 3 + (k % 3) * 2);
      }
    }
  }
  // Gold glitter drifting down, now and then.
  for (let k = 0; k < 6; k++) {
    if ((k % 2 === 0) !== back) continue;
    const fall = 3.4 + (k % 3) * 0.7, w = ((t + k * 0.61) / fall) % 1;
    const px = Math.round(x + (hash(k, 13) - 0.5) * 32 + Math.sin(t * 1.6 + k) * 2), py = Math.round(y - 48 + w * 48);
    g.globalAlpha = Math.min(1, (1 - w) * 4, w * 8) * (back ? 0.6 : 0.9);
    g.fillStyle = Math.floor(t * 5 + k) % 3 === 0 ? AC.glint : AC.gold;
    g.fillRect(px, py, 1, 1);
  }
  g.globalAlpha = 1;
}

export const OBA: Record<string, SkinArt> = {
  'spirit_wraps.oba': { weapon: tapedFists, ...FX },
  'iron_cestus.oba': { weapon: graceWraps, ...FX },
  'echo_stone.oba': obaTitle,
  'gladiator_helm.oba': obaBeard(),
  'juggernaut_plate.oba': obaMuscles(),
  'charger_cuisses.oba': ringTrunks(),
  'colossus_boots.oba': ringBoots(),
};
