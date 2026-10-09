import { material, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { flow, glint, hash, lattice } from '../../pixel/tex';
import { hairCap } from '../draw';
import { fillAll, M, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { SkinArt } from './index';
import { epicFx, glow, plain, shiny, wrap } from './kit';

/**
 * Epic set: Sunborn Dynasty. Gold, lapis and turquoise of a god-king: a sun
 * that turns in its horns, falcon wings, a striped nemes and a broad collar.
 */

const GOLD = 0xf0c040, LAPIS = 0x2a4ab8, TURQ = 0x3ad0c0, LINEN = 0xf2e8d2;

/** The sun's surface: rings of heat rolling out from (cx, cy), one step per frame. */
const corona = (cx: number, cy: number): Tex => (x, y, ph) => (wrap(Math.floor(Math.hypot(x - cx, y - cy) * 1.4) - ph, 4) === 0 ? 1 : 0);
const SUN = [0xc8401a, 0xf07a20, 0xffb030, 0xffe070, 0xfffbe0];
/** Feather rows across a wing (pale between the quills). */
const quills: Tex = (x, y) => (wrap(Math.floor(Math.abs(y) * 1.2 + x * 0.25), 2) === 0 ? -1 : 0);

const FX = epicFx(0xfff4c0, 0x3a6ae0, 'twinkle', 0xffe8a0);

function scepterOfRa(): WeaponArt {
  // A lapis staff flecked with gold; at its head the sun turns between the horns of Hathor over falcon wings.
  const C = 28.4;
  return {
    tip: 31,
    grip2: 12,
    mats: {
      shaft: material({ base: LAPIS, step: 0.13, tex: glint(0.05, 3) }),
      gold: material({ base: GOLD, shiny: true, step: 0.15, tex: flow(9, 1, 2, 1) }),
      sun: material({ base: SUN[2], glow: true, ramp: SUN, tex: corona(C, 0) }),
      ray: M.glow(0xffe890),
      wing: material({ base: GOLD, shiny: true, step: 0.15, tex: quills }),
      turq: material({ base: TURQ, shiny: true }),
      gem: M.glow(0xff5a3a),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-19.5, 0, 23, 0, 1.2, 1.05)], m('shaft'), o, 1);
      fillAll(r, [t.rect(-15, 0, 0.6, 1.5), t.rect(-6.5, 0, 0.6, 1.5), t.rect(6, 0, 0.6, 1.45), t.rect(17, 0, 0.6, 1.4)], m('gold'), o, 1);
      // The forked foot of a was-sceptre.
      fillAll(r, [t.poly([-19, -1.3, -22.6, -2.8, -21.4, -0.2, -22.6, 2.8, -19, 1.3])], m('gold'), o, 1);
      // Falcon wings spreading from the lotus capital, a turquoise row along their tops.
      for (const s of [-1, 1]) {
        const wing = t.poly([24, s * 1, 22.8, s * 5.4, 21.4, s * 7.6, 19.8, s * 7.4, 20.4, s * 5.4, 18.8, s * 4.6, 20.4, s * 2.8, 21.8, s * 1]);
        fillAll(r, [wing], m('wing'), o, 1.2, s < 0 ? -1 : 0);
        r.fill(intersect(wing, t.rect(23.2, s * 3.4, 0.9, 3)), m('turq'), { group: g, flat: 2, noLine: true });
      }
      fillAll(r, [t.poly([22, -1.2, 24.6, -2.8, 25.8, -2, 25.2, 0, 25.8, 2, 24.6, 2.8, 22, 1.2])], m('gold'), o, 1.2);
      r.dot(t.x(24, 0), t.y(24, 0), m('gem'), 3, g);
      // Eight rays turning a sixteenth of a turn per frame: seamless over the idle loop.
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + r.phase * (Math.PI / 16);
        const c = Math.cos(a), s = Math.sin(a);
        r.fill(t.poly([C + c * 4 - s * 0.8, s * 4 + c * 0.8, C + c * 6.6, s * 6.6, C + c * 4 + s * 0.8, s * 4 - c * 0.8]), m('ray'), { group: g });
      }
      fillAll(r, [subtract(t.circ(C - 0.9, 0, 5.4), t.circ(C + 0.9, 0, 4.5))], m('gold'), o, 1.3);
      r.fill(t.circ(C, 0, 3.4), m('sun'), { group: g, local: o.local });
    },
  };
}

function wingsOfHorus(): WeaponArt {
  // Two falcon wings folded into a shield, the Eye of Horus watching from a lapis roundel under a small sun.
  return {
    tip: 10.5,
    mats: {
      rim: material({ base: GOLD, shiny: true, step: 0.15, tex: flow(7, 1, 1.5, 1) }),
      feather: material({ base: 0xf4e2a8, shiny: true, step: 0.13, tex: quills }),
      lapis: material({ base: LAPIS, step: 0.13, tex: quills }),
      turq: material({ base: TURQ, tex: quills }),
      quill: material({ base: 0x1a2460 }),
      eye: material({ base: 0xf8f4ea }),
      pupil: material({ base: SUN[2], glow: true, ramp: SUN, tex: (_x, _y, ph) => (ph % 2 ? 1 : 0) }),
      sun: material({ base: SUN[2], glow: true, ramp: SUN, tex: corona(-9.4, 0) }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      const op = { group: g, toneBias: o.toneBias, local: o.local, noLine: true };
      const outer = t.poly([-8.4, 0, -10.6, -3.4, -11.6, -7, -8, -7.4, -2, -6.6, 4.6, -3.7, 11.6, 0, 4.6, 3.7, -2, 6.6, -8, 7.4, -11.6, 7, -10.6, 3.4]);
      fillAll(r, [outer], m('rim'), o, 2);
      const inner = t.poly([-7.8, 0, -9.8, -3.2, -10.4, -6.1, -7.8, -6.4, -2, -5.6, 4.2, -2.9, 9.8, 0, 4.2, 2.9, -2, 5.6, -7.8, 6.4, -10.4, 6.1, -9.8, 3.2]);
      // Pale gold primaries fanning to the point, lapis secondaries above, turquoise coverts at the top.
      r.fill(inner, m('feather'), { ...op, bevel: 3.5 });
      r.fill(intersect(inner, t.rect(-1, 0, 2.9, 8)), m('lapis'), { ...op, bevel: 3.5 });
      r.fill(intersect(inner, t.rect(-7, 0, 3.2, 8)), m('turq'), { ...op, bevel: 3.5 });
      for (const s of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          const y = s * (1.9 + k * 1.25);
          r.fill(intersect(inner, t.rect(0, y, 12, 0.3)), m('quill'), { ...op, flat: 1 });
        }
      }
      // The falcon's body down the middle, its tail at the point.
      fillAll(r, [t.poly([-6, -1.1, 7.6, -0.6, 10, 0, 7.6, 0.6, -6, 1.1])], m('rim'), o, 1);
      // Sun in the dip between the wing tips; the Eye on a lapis roundel below it.
      r.fill(t.circ(-9.2, 0, 1.7), m('sun'), { group: g, local: o.local });
      fillAll(r, [t.circ(-4.8, 0, 3)], m('rim'), o, 1.6);
      r.fill(t.circ(-4.8, 0, 2.3), m('lapis'), { ...op, bevel: 2 });
      r.fill(t.ell(-5, 0, 0.9, 1.7), m('eye'), { ...op, bevel: 1 });
      r.dot(t.x(-5, 0.2), t.y(-5, 0.2), m('pupil'), 3, g);
      // The falcon's cheek mark and the spiral under the eye.
      r.line(t.x(-4, 0.4), t.y(-4, 0.4), t.x(-2.6, 0.6), t.y(-2.6, 0.6), m('quill'), 0, g);
      r.line(t.x(-4, -0.9), t.y(-4, -0.9), t.x(-3, -1.8), t.y(-3, -1.8), m('quill'), 0, g);
    },
  };
}

/** The tall feather of Ma'at, curling over at its tip, in frame F (x up the quill). */
function maatFeather(r: Parameters<NonNullable<SkinArt['icon']>>[0], F: Xf, m: (k: string) => number, len: number, g: number, wide = 1): void {
  const k = len / 23, kw = k * wide;
  const vane = F.poly([
    1 * k, 0.6 * kw, 6 * k, 3.1 * kw, 13 * k, 4.2 * kw, 18.6 * k, 4.4 * kw, 22.2 * k, 3.4 * kw, 23.6 * k, 1 * kw,
    22.6 * k, -1.4 * kw, 20.8 * k, -0.6 * kw, 19.4 * k, -2.4 * kw, 12 * k, -3.2 * kw, 5 * k, -2.4 * kw, 1 * k, -0.8 * kw,
  ]);
  r.fill(vane, m('p.vane'), { group: g, bevel: 1.6, local: F });
  r.line(F.x(-1 * k, 0), F.y(-1 * k, 0), F.x(21 * k, 0.4 * k), F.y(21 * k, 0.4 * k), m('p.gold'), 3, g);
  r.fill(F.cap(-3.4 * k, 0, 0.6 * k, 0, 1.5 * Math.max(k, 0.7)), m('p.gold'), { group: g, bevel: 1 });
  r.dot(F.x(-1.4 * k, 0), F.y(-1.4 * k, 0), m('p.lapis'), 3, g);
}

const maat: SkinArt = {
  mats: {
    // Body (the feather worn in the hair) and stock names, for anything drawn the stock way.
    plume: shiny(LINEN), plumeTip: glow(0xffe890), feather: shiny(LINEN), featherTip: glow(0xffe890), gold: shiny(GOLD),
    'p.vane': {
      base: LINEN, ramp: [0xa89c88, 0xd2c6ae, 0xeee4cc, 0xfff8e8, 0xffffff],
      // Fine barbs, and a glow that runs up the feather.
      tex: (x, y, ph) => (wrap(x - ph * 3, 12) < 1.6 ? 1 : wrap(Math.floor(x * 0.9 + Math.abs(y) * 0.7), 2) === 0 ? -1 : 0),
    },
    'p.gold': shiny(GOLD),
    'p.lapis': plain(LAPIS),
    'p.ankh': shiny(GOLD),
  },
  glow: [0xfff0b0, 0x3a6ae0],
  icon(r, t, m) {
    maatFeather(r, new Xf(t.x(-7, -10), t.y(-7, -10), 1.1), m, 25, 1, 1.25);
    // An ankh hangs from the socket on a lapis cord.
    r.line(t.x(-6.6, -9.4), t.y(-6.6, -9.4), t.x(1.4, -6.6), t.y(1.4, -6.6), m('p.lapis'), 2, 3);
    const ankh = union(subtract(t.ell(4, -4.6, 1.7, 2.1), t.ell(4, -4.6, 0.8, 1.2)), t.rect(4, -7, 2.6, 0.6), t.rect(4, -9.8, 0.6, 2.6));
    r.fill(ankh, m('p.ankh'), { group: 2, bevel: 1.2 });
  },
  plume(r, H, m, g, sway) {
    maatFeather(r, new Xf(H.x(-4.2, 3.6), H.y(-4.2, 3.6), H.ang + 1.85 + sway * 0.25, H.sx, H.sy), m, 13, g, 1.7);
  },
};

function nemes(): SkinArt {
  // A striped gold-and-lapis nemes with the rearing cobra and a small sun at the brow.
  return {
    head: () => ({
      mats: {
        'h.gold': material({ base: GOLD, shiny: true, step: 0.15, tex: flow(7, 1.2, 1.75, 1) }),
        'h.lapis': material({ base: LAPIS, step: 0.12 }),
        'h.band': material({ base: GOLD, shiny: true, step: 0.16 }),
        'h.cobra': material({ base: 0xf6d050, shiny: true, step: 0.15 }),
        'h.eye': material({ base: 0xff4a2a, glow: true, tex: (_x, _y, ph) => (ph % 2 ? 1 : 0) }),
        'h.sun': material({ base: SUN[2], glow: true, ramp: SUN, tex: corona(7, 6.8) }),
      },
      draw(r, H, m, g, sway) {
        const s = sway * 0.6;
        const cloth = union(
          hairCap(H, 2.2, -3.2, 1.35),
          // The cloth falls behind the ear to the shoulders, and the lappet hangs down in front of it.
          H.poly([-6.4, 3.2, -8.6 - s, -2.2, -9 - s, -8.2, -6.2, -8.8, -4.4, -4.2, -3.4, 0]),
          H.poly([-0.6, 1.6, -4, 1.2, -3.6, -9.8, -0.6, -10.4, 0.4, -3]),
        );
        r.fill(cloth, m('h.gold'), { group: g, bevel: 2.6, local: H });
        for (let k = 0; k < 11; k++) {
          const y = 7.6 - k * 1.75;
          r.fill(intersect(cloth, H.rect(0, y, 12, 0.48)), m('h.lapis'), { group: g, bevel: 2.6, noLine: true });
        }
        // Brow band, cobra and sun.
        r.fill(H.cap(-2.6, 1.8, 6.4, 2.6, 0.75), m('h.band'), { group: g, bevel: 1 });
        r.fill(H.circ(7, 6.8, 1.5), m('h.sun'), { group: g, local: H });
        r.fill(H.poly([5.6, 2.6, 6.8, 3.8, 6.2, 5.2, 7, 6.4, 8.2, 5.8, 7.6, 4.6, 8, 3.4, 6.8, 2.4]), m('h.cobra'), { group: g, bevel: 1 });
        r.dot(H.x(7.6, 5.6), H.y(7.6, 5.6), m('h.eye'), 3, g);
      },
    }),
    ...FX,
  };
}

function regalia(): SkinArt {
  // Pleated white linen, a broad collar of lapis, turquoise and gold, a striped apron and folded wings of Isis.
  const pleats: Tex = (x, y, ph) => (y < 2 && wrap(Math.floor(x * 1.2), 3) === 0 ? -1 : hash(Math.floor(x * 2) + ph * 7, Math.floor(y * 2)) < 0.012 ? 1 : 0);
  return {
    mats: {
      robe: plain(LINEN, pleats), robeTrim: shiny(GOLD, flow(8, 1.2, 2, 1)),
      'k.bracer': shiny(GOLD, lattice(2.6, -1)), 'k.lapis': plain(LAPIS), 'k.turq': shiny(TURQ),
      'k.gold': shiny(GOLD), 'k.bead': glow(0xff6a3a),
      'k.wing': { base: GOLD, shiny: true, step: 0.15, tex: quills }, 'k.wingL': { base: LAPIS, step: 0.12, tex: quills }, 'k.wingT': { base: TURQ, tex: quills },
    },
    chest: {
      sleeveLen: 0.4, forearm: 'k.bracer',
      back(r, T, m, c) {
        // Wings folded down the back, breathing open a little over the idle loop.
        const open = [0, 0.5, 0.9, 0.5][r.phase % 4], s = c.sway * 2, top = c.top;
        const wing = T.poly([
          -1, top + 0.4, -5.6 - open, top + 1.4, -9.2 - open * 1.6 - s, top - 2.4,
          -10.6 - open * 1.4 - s * 1.3, -6, -9.6 - s * 1.4, -12, -7.6 - s * 1.2, -9, -6.8 - s, -13, -4.8 - s, -8.4, -3.4, -2,
        ]);
        r.fill(wing, m('k.wing'), { group: c.g, bevel: 2.6, local: T });
        r.fill(intersect(wing, T.ell(-5, top - 3.4, 7, 4.2)), m('k.wingL'), { group: c.g, bevel: 2.6, noLine: true, local: T });
        r.fill(intersect(wing, T.ell(-4.6, top + 0.2, 6, 2.4)), m('k.wingT'), { group: c.g, bevel: 2.6, noLine: true, local: T });
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top;
        // A striped apron hanging from the belt.
        const ax = b.hipW * 0.35 + 0.6;
        const apron = T.poly([ax - 1.4, 2.2, ax + 1.8, 2.2, ax + 2.4, -7.6, ax - 1.8, -7.6]);
        r.fill(apron, m('k.gold'), { group: c.g, bevel: 1.2 });
        for (let k = 0; k < 4; k++) r.fill(intersect(apron, T.rect(ax, 0.6 - k * 2.2, 3, 0.5)), m('k.lapis'), { group: c.g, flat: 1, noLine: true });
        // The broad collar, in rings from the throat out, beads of carnelian along its edge.
        const cx = b.chestPush * 0.35, cy = top + 0.9;
        const lower = T.rect(cx, cy - 5, 9, 5);
        const ring = (r0: number, r1: number): Shape => intersect(subtract(T.ell(cx, cy, r0 + 0.8, r0), T.ell(cx, cy + 0.6, r1 + 0.8, r1)), lower);
        r.fill(intersect(T.ell(cx, cy, 6.6, 5.8), lower), m('k.gold'), { group: c.g, bevel: 1.6 });
        r.fill(ring(5, 4), m('k.lapis'), { group: c.g, flat: 2, noLine: true });
        r.fill(ring(3.8, 2.8), m('k.turq'), { group: c.g, flat: 2, noLine: true });
        for (let k = 0; k < 7; k++) {
          const a = -Math.PI * 0.15 - (k / 6) * Math.PI * 0.7;
          r.dot(T.x(cx + Math.cos(a) * 7, cy + Math.sin(a) * 6), T.y(cx + Math.cos(a) * 7, cy + Math.sin(a) * 6), m('k.bead'), 3, c.g);
        }
      },
    },
    ...FX,
  };
}

function sandals(): SkinArt {
  // Linen wraps bound in gold, a lapis scarab at the ankle and a falcon wing at each heel.
  return {
    mats: {
      leap: plain(0xeee4cc, lattice(2.4, -1)), leapTrim: shiny(GOLD),
      'k.gold': shiny(GOLD), 'k.scarab': shiny(LAPIS, undefined, 0.17),
      'k.wing': { base: GOLD, shiny: true, step: 0.15, tex: quills }, 'k.turq': shiny(TURQ),
    },
    boots: {
      height: 0.6, wing: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        // Gold sole and ankle cuff with the scarab.
        r.fill(foot.cap(-1.2, -1.6, c.toe, -1.3, 0.55), m('k.gold'), { ...o, bevel: 0.6 });
        r.fill(shin.cap(1.6, -c.w - 0.3, 1.6, c.w + 0.3, 0.75), m('k.gold'), { ...o, bevel: 0.8 });
        r.fill(shin.ell(1.6, c.w * 0.4, 0.9, 0.75), m('k.scarab'), { ...o, bevel: 0.8 });
        // The heel wing flutters: its tip lifts on alternate frames.
        const lift = [0, 0.8, 1.2, 0.6][r.phase % 4];
        const w = c.w;
        const wing = shin.poly([2, -w + 0.2, 4 + lift, -w - 2.6, 4.6 + lift * 1.4, -w - 5.6, 3 + lift, -w - 5, 1.6 + lift * 0.6, -w - 3.6, 0.4, -w - 1]);
        r.fill(wing, m('k.wing'), { ...o, bevel: 1, local: shin });
        r.fill(intersect(wing, shin.rect(3.4 + lift, -w - 1.2, 1.2, 1.4)), m('k.turq'), { ...o, flat: 2, noLine: true });
      },
    },
    ...FX,
  };
}

export const SUNBORN: Record<string, SkinArt> = {
  'arcane_staff.ra': { weapon: scepterOfRa, ...FX },
  'kite_shield.horus': { weapon: wingsOfHorus, ...FX },
  'phoenix_feather.maat': maat,
  'chrono_circlet.nemes': nemes(),
  'mage_robe.pharaoh': regalia(),
  'leaping_boots.sunstride': sandals(),
};
