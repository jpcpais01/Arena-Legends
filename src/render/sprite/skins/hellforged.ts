import { material, type Material, type Tex } from '../../pixel/raster';
import { arc, subtract, union } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { fillAll, M, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt } from './index';
import { epicFx, flameTongue, glow, mats, shiny, wrap } from './kit';

/**
 * Epic set: Hellforged. Black iron from the abyss with magma pulsing through
 * every seam, charred horns with burning tips, and hellfire licking off it all.
 */

/** Black iron whose fourth tone is a rusty red highlight and fifth is magma. */
const IRON = [0x1a1418, 0x2e2428, 0x463a3e, 0x7a5450];
const LAVA = [0x5a0a0a, 0xa01a10, 0xe0501a, 0xffa030, 0xffe8a0];

/** Cracks through the iron; magma pulses along them, one step per frame. */
const magma = (scale = 1): Tex => (x, y, ph) => {
  const v = Math.sin(x * 0.8 * scale + Math.sin(y * 1.4 * scale) * 2.2) + Math.sin(y * scale - x * 0.3 * scale) * 0.6;
  if (Math.abs(v) >= 0.15) return 0;
  return wrap(Math.floor((x + y) * 0.5) - ph, 4) < 2 ? 4 : 1;
};
const iron = (scale = 1) => material({ base: IRON[2], ramp: [...IRON, 0xffa040], tex: magma(scale) });
/** Molten glow that brightens and dims over the loop. */
const molten = () => material({ base: LAVA[2], glow: true, ramp: LAVA, tex: (_x, _y, ph) => [0, 1, 1, 0][ph % 4] });

const FX = epicFx(0xffd060, 0xc01a10, 'flame', 0xffa040);

/** A frame mirrored across its x axis (so "up" points out of a blade's edge). */
const mirrored = (t: Xf) => new Xf(t.ox, t.oy, t.ang, t.sx, -t.sy);

function hellmaw(): WeaponArt {
  // A jagged double crescent of black iron with a horned skull at its heart and hellfire licking off the edge.
  return {
    tip: 31,
    grip2: 11,
    mats: {
      haft: iron(1.4), head: iron(), wrap: material({ base: 0x8a1a1e, tex: (x) => (wrap(x, 1.6) < 0.6 ? -1 : 0) }),
      edge: molten(), bone: material({ base: 0xcabaa0, shiny: true, step: 0.14 }), eye: M.glow(0xffe060),
      flame: M.glow(0xff6a1a), hot: M.glow(0xffd870),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      fillAll(r, [t.cap(-8, 0, 28, 0, 1.3, 1.2)], m('haft'), o, 1);
      fillAll(r, [t.poly([-7.6, -1.4, -11.6, 0, -7.6, 1.4])], m('bone'), o, 1);
      fillAll(r, [t.cap(-3, 0, 2, 0, 1.55)], m('wrap'), o, 1);
      // Hellfire on the edge, behind the blade so only the tongues show past it.
      const E = mirrored(t);
      const hs = [[1.6, 2.4, 1.2], [2.2, 1.4, 2], [1.4, 2.2, 2.6], [2.6, 1.8, 1.4]][ph];
      for (const [i, x] of [18.6, 22.8, 27].entries()) flameTongue(r, E, x, 12.6, 1.1, hs[i], ((i + ph) % 2) - 0.5, m('flame'), m('hot'), g);
      // The great blade on the edge side, toothed; a bat-wing blade on the back.
      const blade = t.poly([
        19, -1.2, 16.8, -4.6, 15.2, -8.8, 14.2, -12.8, 17.2, -11.6, 18.6, -13.6, 20.6, -12.2, 22.8, -14, 24.8, -12.6,
        27, -14, 28.6, -12, 31.6, -13, 30.2, -8.6, 28.6, -4.6, 27.6, -1.2,
      ]);
      fillAll(r, [blade], m('head'), o, 2.2);
      r.fill(t.poly([15.4, -11.4, 18.6, -12.4, 22.6, -12.8, 27, -12.8, 30.4, -12, 29.8, -10.6, 26.6, -11.4, 22.6, -11.6, 18.6, -11.2, 16, -10.2]), m('edge'), { group: g, noLine: true });
      fillAll(r, [t.poly([20.6, 1.2, 19, 4.6, 18, 8, 21.2, 6.4, 23.2, 8.6, 25.4, 6.4, 28.8, 8, 27.6, 4.6, 26.2, 1.2])], m('head'), o, 1.6);
      fillAll(r, [t.poly([28, -1, 32.4, 0, 28, 1])], m('bone'), o, 1);
      // Horned skull at the heart of the head, eyes burning.
      fillAll(r, [t.poly([21.4, 1.6, 18.6, 4, 19.8, 1.2]), t.poly([25.4, 1.6, 28.2, 4, 27, 1.2])], m('bone'), o, 1);
      fillAll(r, [union(t.circ(23.4, 0.4, 2.6), t.rect(23.4, -2.4, 1.6, 1, 0.4))], m('bone'), o, 1.4);
      r.dot(t.x(22.4, 0.2), t.y(22.4, 0.2), m('eye'), 3, g);
      r.dot(t.x(24.4, 0.2), t.y(24.4, 0.2), m('eye'), 3, g);
      r.line(t.x(22.4, -2.6), t.y(22.4, -2.6), t.x(24.4, -2.6), t.y(24.4, -2.6), m('haft'), 0, g);
    },
  };
}

function brimstoneFangs(): WeaponArt {
  // A hooked obsidian fang with a molten core and a ring pommel.
  return {
    tip: 8.4,
    mats: { blade: iron(2), core: molten(), grip: material({ base: 0x8a1a1e }), ring: material(shiny(0x3a2a2e)) },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [subtract(t.circ(-3.4, 0, 1.5), t.circ(-3.4, 0, 0.7))], m('ring'), o, 0.8);
      fillAll(r, [t.cap(-2.2, 0, 0.5, 0, 0.9)], m('grip'), o, 1);
      fillAll(r, [t.poly([0.4, -1.3, 4, -1.5, 6.6, -0.9, 8.8, 0.8, 6.4, 0.7, 3.6, 1.2, 0.4, 1.2])], m('blade'), o, 1);
      r.line(t.x(1.4, 0), t.y(1.4, 0), t.x(6.2, -0.2), t.y(6.2, -0.2), m('core'), 3, g);
    },
  };
}

// Battle sprites (their own materials).
const HM = mats({
  blade: { base: IRON[2], ramp: [...IRON, 0xffa040], tex: magma(2) },
  core: { base: LAVA[3], glow: true, ramp: LAVA },
  fire: { base: 0xff5a1a, glow: true }, fireHot: { base: 0xffd870, glow: true }, fireDeep: { base: 0xa8140e, glow: true },
  skull: { base: IRON[2], ramp: [...IRON, 0xffb040], tex: magma(1.2) },
  horn: { base: 0xcabaa0, shiny: true, step: 0.14 }, eye: { base: 0xfff070, glow: true },
  sigil: { base: 0xff3a2a, glow: true }, sigilHot: { base: 0xffd060, glow: true },
});

const knifeProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A smear of hellfire behind, the fang spinning end over end.
    r.fill(t.poly([-1, -1.6, -7, -0.8 + (f % 2) * 0.6, -10, 0, -7, 0.9 - (f % 2) * 0.6, -1, 1.6]), h(HM.fireDeep), { group: 1 });
    r.fill(t.poly([-1, -0.8, -5.6, 0, -1, 0.8]), h(HM.fire), { group: 1 });
    const k = new Xf(t.ox, t.oy, t.ang - f * (Math.PI / 2));
    r.fill(k.cap(-3, 0, 0.5, 0, 0.9), h(HM.blade), { group: 2, bevel: 0.8 });
    r.fill(k.poly([0.4, -1.3, 4, -1.5, 6.6, -0.9, 8.8, 0.8, 6.4, 0.7, 3.6, 1.2, 0.4, 1.2]), h(HM.blade), { group: 3, bevel: 1 });
    r.line(k.x(1.4, 0), k.y(1.4, 0), k.x(6.2, -0.2), k.y(6.2, -0.2), h(HM.core), 3, 3);
  },
};

/** A horned skull burning from within, facing +x, centred at (x, 0) in frame t. */
function hornedSkull(r: Parameters<ProjArt['draw']>[0], t: Xf, x: number, s: number, h: (m: Material) => number, gBase: number): void {
  // Black horns sweeping back, a pale skull, eyes and jaw burning.
  for (const k of [-1, 1]) r.fill(t.poly([x - 0.6 * s, k * 3.2 * s, x - 4.4 * s, k * 7.4 * s, x - 10.4 * s, k * 7.8 * s, x - 6.4 * s, k * 6 * s, x - 3.4 * s, k * 2.2 * s]), h(HM.skull), { group: gBase, bevel: 1.2 * s, local: t });
  r.fill(union(t.circ(x, 0.6 * s, 5 * s), t.rect(x + 3.4 * s, -2.4 * s, 2 * s, 2 * s, 1)), h(HM.horn), { group: gBase + 1, bevel: 2.4 * s });
  for (const y of [-2 * s, 2 * s]) r.fill(t.circ(x + 2.4 * s, y + 0.8 * s, 1.3 * s), h(HM.eye), { group: gBase + 1, noLine: true });
  r.line(t.x(x + 4.8 * s, -2.6 * s), t.y(x + 4.8 * s, -2.6 * s), t.x(x + 4.8 * s, 2.2 * s), t.y(x + 4.8 * s, 2.2 * s), h(HM.fire), 3, gBase + 1);
}

const meteorProj: ProjArt = {
  frames: 3,
  outline: true,
  draw(r, t, f, h) {
    // A burning horned skull trailing hellfire.
    const flick = [0, 1, -1][f];
    r.fill(t.poly([2, -8, -10, -7 + flick, -27, -2.4, -32 - flick * 2, 0, -27, 2.4, -10, 7 - flick, 2, 8]), h(HM.fireDeep), { group: 1 });
    r.fill(t.poly([1, -5.6, -8, -3.6, -21, 0, -8, 3.6, 1, 5.6]), h(HM.fire), { group: 1 });
    r.fill(t.poly([0, -2.6, -6, -1.4, -13 - flick, 0, -6, 1.4, 0, 2.6]), h(HM.fireHot), { group: 1 });
    hornedSkull(r, t, 3, 1.25, h, 2);
  },
};

const sigilProj: ProjArt = {
  frames: 4,
  draw(r, t, f, h) {
    // Two burning rings, three horns turning around them and a triangle of runes between.
    const turn = f * (Math.PI / 6);
    r.fill(arc(t.ox, t.oy, 9.4, 10.6, -Math.PI, Math.PI), h(HM.sigil), { group: 1 });
    r.fill(arc(t.ox, t.oy, 5.2, 6, -Math.PI, Math.PI), h(HM.sigil), { group: 1 });
    for (let i = 0; i < 3; i++) {
      const a = turn + (i * Math.PI * 2) / 3;
      const c = Math.cos(a), s = Math.sin(a);
      r.fill(t.poly([c * 10 - s * 1.6, s * 10 + c * 1.6, c * 14.2 + s * 1.4, s * 14.2 - c * 1.4, c * 10 + s * 1.4, s * 10 - c * 1.4]), h(HM.sigilHot), { group: 1 });
      const b = a + (Math.PI * 2) / 3;
      r.line(t.ox + c * 5.6, t.oy - s * 5.6, t.ox + Math.cos(b) * 5.6, t.oy - Math.sin(b) * 5.6, h(HM.sigil), 3, 1);
      for (let k = 1; k < 4; k++) {
        const q = a + (k * Math.PI) / 6;
        r.dot(t.ox + Math.cos(q) * 8, t.oy - Math.sin(q) * 8, h(k === 2 ? HM.sigilHot : HM.sigil), 3, 1);
      }
    }
    r.fill(t.circ(0, 0, 1.8), h(HM.fireHot), { group: 1 });
  },
};

const doom: SkinArt = {
  mats: {
    // Stock names: the meteor's shockwave pieces and anything drawn the stock way.
    sigil: glow(0xff3a2a), rock: { base: IRON[2], ramp: [...IRON, 0xffa040], tex: magma(1.2) }, ember: glow(0xffd060),
    lava: glow(0xff4a1a), lavaHot: glow(0xffe070), fire: glow(0xff5a1a),
    'k.iron': { base: IRON[2], ramp: [...IRON, 0xffa040], tex: magma(1.2) }, 'k.ring': { base: 0xff3a2a, glow: true, tex: (x, y, ph) => (wrap(Math.floor(Math.atan2(y, x) * 2) - ph, 4) === 0 ? 1 : 0) },
    'k.horn': shiny(0xcabaa0, undefined, 0.14), 'k.eye': glow(0xfff070), 'k.fire': glow(0xff5a1a), 'k.hot': glow(0xffd870),
  },
  glow: [0xffd060, 0xb0101a],
  icon(r, t, m) {
    r.fill(arc(t.ox, t.oy, 11, 13, -Math.PI, Math.PI), m('k.ring'), { group: 1, local: t });
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / 3, c = Math.cos(a), s = Math.sin(a);
      r.fill(t.poly([c * 12 - s * 1.8, s * 12 + c * 1.8, c * 15.6, s * 15.6, c * 12 + s * 1.8, s * 12 - c * 1.8]), m('k.hot'), { group: 1 });
    }
    flameTongue(r, t, -3, 3, 2.4, 6, -0.6, m('k.fire'), m('k.hot'), 2);
    flameTongue(r, t, 2.6, 3, 2, 5, 0.8, m('k.fire'), m('k.hot'), 2);
    for (const k of [-1, 1]) r.fill(t.poly([k * 2.6, 3, k * 6.4, 6.4, k * 7.6, 10.4, k * 5, 6.6, k * 1.6, 4.4]), m('k.horn'), { group: 3, bevel: 1.2 });
    r.fill(union(t.circ(0, 0.6, 5.4), t.rect(0, -4, 2.6, 2.4, 1)), m('k.iron'), { group: 4, bevel: 2.4, local: t });
    r.fill(t.circ(-2, 0.2, 1.4), m('k.eye'), { group: 4, noLine: true });
    r.fill(t.circ(2, 0.2, 1.4), m('k.eye'), { group: 4, noLine: true });
    r.line(t.x(-2.4, -4.6), t.y(-2.4, -4.6), t.x(2.4, -4.6), t.y(2.4, -4.6), m('k.fire'), 1, 4);
  },
  proj: { meteor: meteorProj, sigil: sigilProj },
};

function brimstoneCrown(): SkinArt {
  // A jagged black-iron crown with charred demon horns burning at the tips and hellfire on its points.
  const ridges: Tex = (x, y) => (x < -5.2 ? 3 : x < -3.6 ? 1 : 0) + (wrap(Math.floor(y * 1.2 - x * 0.8), 2) === 0 ? -1 : 0);
  return {
    head: () => ({
      mats: {
        'h.iron': iron(1.6),
        'h.horn': material({ base: 0x6a5a50, ramp: [0x2a2024, 0x4a3c38, 0x6a5a50, 0x9a5a3a, 0xffb040], tex: ridges }),
        'h.gem': material({ base: LAVA[3], glow: true, ramp: LAVA, tex: (_x, _y, ph) => [1, 0, 1, 1][ph % 4] }),
        'h.flame': M.glow(0xff6a1a), 'h.hot': M.glow(0xffd870),
      },
      draw(r, H, m, g) {
        const ph = r.phase % 4;
        const horn = (dx: number, bias: number) => r.fill(H.poly([
          3.4 + dx, 5.2, 2.8 + dx, 8.8, 0.8 + dx, 11.6, -2.6 + dx, 13.4, -7.2 + dx, 13.6, -4.4 + dx, 12, -1.8 + dx, 9.8,
          -0.6 + dx, 7.2, -0.6 + dx, 4.8,
        ]), m('h.horn'), { group: g, bevel: 1.6, toneBias: bias, local: H });
        horn(-1.8, -1);
        // Hellfire on the crown's points.
        const hs = [[2.4, 1.4, 2], [1.6, 2.6, 1.2], [2.8, 1.8, 2.4], [1.8, 2.2, 1.6]][ph];
        for (const [i, x] of [-4.2, 0.2, 4.4].entries()) flameTongue(r, H, x, 7.6 + (i === 1 ? 0.8 : 0), 0.9, hs[i], ph % 2 ? 0.4 : -0.4, m('h.flame'), m('h.hot'), g);
        r.fill(H.poly([-5.6, 3.6, -6, 7.2, -4.2, 5.6, -2.2, 7.6, 0.2, 5.6, 2.4, 8.4, 4.4, 6, 6.2, 7.6, 6, 4.2, 0, 4.8]), m('h.iron'), { group: g, bevel: 1.6, local: H });
        r.fill(H.poly([0.2, 5.4, 1.2, 6.6, 0.2, 7.8, -0.8, 6.6]), m('h.gem'), { group: g });
        horn(0, 0);
      },
    }),
    ...FX,
  };
}

function carapace(): SkinArt {
  // Black iron plates split by magma, a furnace behind a ribcage grille, skull pauldrons and a smouldering cape.
  const embers: Tex = (x, y, ph) => {
    if (y < -11.2 + hash(Math.floor(x * 1.4), 5) * 2.4) return hash(Math.floor(x * 2) + ph * 13, Math.floor(y * 2)) < 0.5 ? 4 : 3;
    return hash(Math.floor(x * 2) - ph * 7, Math.floor(y * 2) + ph * 5) < 0.02 ? 4 : 0;
  };
  return {
    mats: {
      thorn: { base: IRON[2], ramp: [...IRON, 0xffa040], tex: magma(1.1) }, thornDark: { base: 0x1a1216 }, thornSpike: shiny(0x3a2a30),
      'k.skull': { base: IRON[2], ramp: [...IRON, 0xffb040], tex: magma(2) }, 'k.horn': shiny(0xcabaa0, undefined, 0.14),
      'k.eye': glow(0xfff070), 'k.core': { base: LAVA[3], glow: true, ramp: LAVA, tex: (_x, y, ph) => (wrap(Math.floor(y * 1.2) + ph, 4) < 2 ? 1 : 0) },
      'k.bar': shiny(0x3a2a30), 'k.cape': { base: 0x2a1e20, ramp: [0x0e0a0c, 0x1a1214, 0x2a1e20, 0x3e2c2c, 0xff7a20], tex: embers },
    },
    chest: {
      pauldron: null, spikes: null, sleeve: 'thorn', sleeveLen: 1,
      back(r, T, m, c) {
        const s = c.sway * 3, top = c.top;
        r.fill(T.poly([
          -1, top + 0.6, -6, top - 0.6, -10.6 - s * 1.2, -7, -12.6 - s * 1.5, -14.4, -10.8 - s * 1.3, -12.8, -9.6 - s * 1.4, -16,
          -7.4 - s * 1.2, -13, -5.4 - s, -15.4, -3.6 - s * 0.8, -11.8, -0.8, -3,
        ]), m('k.cape'), { group: c.g, bevel: 3, toneBias: -1, softLight: true, local: T });
      },
      shoulder(r, S, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        // A horned demon skull with two spikes rising behind it.
        r.fill(S.poly([-1.6, 1.6, -3.6, 6.4, -1.2, 3]), m('k.horn'), { ...o, bevel: 0.8 });
        r.fill(S.poly([0, 2.8, -0.6, 7.4, 1.4, 3.2]), m('k.horn'), { ...o, bevel: 0.8 });
        r.fill(union(S.circ(0.2, 1.2, 3.1), S.rect(1.4, -1.4, 1.6, 0.9, 0.3)), m('k.skull'), { ...o, bevel: 1.6, local: S });
        r.dot(S.x(0.8, 1.2), S.y(0.8, 1.2), m('k.eye'), 3, c.g);
        r.dot(S.x(2.4, 1), S.y(2.4, 1), m('k.eye'), 3, c.g);
      },
      over(r, T, m, c) {
        // The furnace in the chest, seen through three iron ribs.
        const x = c.body.chestPush * 0.7 + 1.2, y = c.top - 4.4;
        r.fill(T.ell(x, y, 2.4, 2.8), m('k.core'), { group: c.g, local: T });
        for (const dy of [-1.6, 0, 1.6]) r.fill(T.rect(x, y + dy, 2.6, 0.38), m('k.bar'), { group: c.g, bevel: 0.6, noLine: true });
        r.fill(T.rect(x - 0.2, y, 0.38, 2.6), m('k.bar'), { group: c.g, bevel: 0.6, noLine: true });
      },
    },
    ...FX,
  };
}

function hellstriders(): SkinArt {
  // Molten-seamed greaves with clawed toes, a horn at the knee and hellfire at the heels.
  return {
    mats: {
      greave: { base: IRON[2], ramp: [...IRON, 0xffa040], tex: magma(1.3) }, greaveDark: { base: 0x1a1216 },
      'k.claw': shiny(0xcabaa0, undefined, 0.14), 'k.flame': glow(0xff6a1a), 'k.hot': glow(0xffd870),
    },
    boots: {
      knee: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4;
        // Hellfire off the heel, taller and shorter frame by frame.
        const back = new Xf(foot.ox, foot.oy, foot.ang, -foot.sx, foot.sy);
        const hs = [[3.4, 2], [2.4, 3.2], [3.8, 2.6], [2.6, 3.6]][ph];
        flameTongue(r, back, 1.6, 0.2, 1, hs[0], -0.8, m('k.flame'), m('k.hot'), c.g);
        flameTongue(r, back, 0.4, 1, 0.8, hs[1], -0.4, m('k.flame'), m('k.hot'), c.g);
        // Three claws at the toe; a horn jutting forward from the knee.
        for (const [dy, len] of [[0.9, 2.2], [-0.2, 2.6], [-1.2, 1.8]]) {
          r.fill(foot.poly([c.toe - 1.2, dy + 0.6, c.toe + len, dy - 0.4, c.toe - 0.6, dy - 0.5]), m('k.claw'), { ...o, bevel: 0.6 });
        }
        r.fill(shin.poly([c.top - 1.8, c.w - 0.4, c.top + 1.4, c.w + 2.6, c.top + 0.2, c.w - 1.2]), m('k.claw'), { ...o, bevel: 0.8 });
      },
    },
    ...FX,
  };
}

export const HELLFORGED: Record<string, SkinArt> = {
  'greataxe.hellmaw': { weapon: hellmaw, ...FX },
  'throwing_knives.brimstone': { weapon: brimstoneFangs, proj: { knife: knifeProj }, ...FX },
  'meteor_sigil.doom': doom,
  'storm_crown.brimstone': brimstoneCrown(),
  'thornmail.hellforged': carapace(),
  'iron_greaves.hellstride': hellstriders(),
};
