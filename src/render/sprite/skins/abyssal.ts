import { material, type Tex } from '../../pixel/raster';
import { subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { hairCap } from '../draw';
import { clearShape, fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt } from './index';
import { epicFx, glow, mats, plain, Q, shiny, veined, wrap } from './kit';

/**
 * Epic set: Abyssal Tide. Treasure of the deep: dark teal scale and coral,
 * pearls, kelp that never stops swaying, and bioluminescent light pulsing
 * through it all.
 */

const DEEP = [0x0a1e2a, 0x123444, 0x1e4e5e, 0x2e6e7a];
const CORAL = 0xff6a5a, PEARL = 0xf4eeff, BIO = 0x5affe0, KELP = 0x3a8a5a;
/** Pearl: soft iridescence from lilac to aqua across its tones. */
const PEARL_RAMP = [0x8a80a8, 0xb8b0d8, 0xdcd8f0, PEARL, 0xffffff];

/** Bioluminescent dots blinking through dark scale, out of step with each other. */
const biolum: Tex = (x, y, ph) => {
  const cx = Math.floor(x / 2.4), cy = Math.floor(y / 2.4);
  if (hash(cx * 3 + 1, cy * 5) > 0.16) return 0;
  return wrap(cx + cy * 2 - ph, 4) < 2 ? 4 : 2;
};
/** Overlapping scales (rows of arcs). */
const scales: Tex = (x, y) => {
  const row = Math.floor(y / 1.6);
  const u = wrap(x + (row % 2) * 1.2, 2.4) - 1.2, v = wrap(y, 1.6);
  return u * u * 0.6 + (v - 1.6) * (v - 1.6) < 0.5 ? 0 : -1;
};
/** Light running along a part like a wave, one step per frame. */
const wave = (speed = 1.5, period = 6): Tex => (x, y, ph) => (wrap(x + Math.sin(y * 0.8) * 1.2 - ph * speed, period) < 1.3 ? 1 : 0);

const FX = epicFx(0xe0fff8, 0x2a8ab8, 'twinkle', 0x9afff0);

/** A strand of kelp from (x, y) in frame F, waving with `ph`; `dir` is its general heading. */
function kelp(F: Xf, x: number, y: number, dir: number, len: number, ph: number, k = 0): Shape {
  const parts: Shape[] = [];
  let px = x, py = y;
  const n = 5;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const a = dir + Math.sin(ph * Q + u * 3 + k) * 0.35 * u;
    const nx = px + Math.cos(a) * (len / n), ny = py + Math.sin(a) * (len / n);
    parts.push(F.cap(px, py, nx, ny, 0.7 - u * 0.25, 0.65 - u * 0.3));
    px = nx; py = ny;
  }
  return union(...parts);
}

function trident(): WeaponArt {
  // A coral-crusted shaft lit by deep-sea runes, three barbed pearl-steel prongs, a glowing pearl, kelp streaming off the head.
  return {
    tip: 44,
    grip2: 13,
    mats: {
      shaft: material(veined(DEEP, BIO, wave(1.5, 7))),
      prong: material({ base: 0xc8e8e8, shiny: true, step: 0.15, tex: wave(2, 9) }),
      coral: material({ base: CORAL, shiny: true, step: 0.14 }),
      pearl: material({ base: PEARL, ramp: PEARL_RAMP, shiny: true, tex: (_x, _y, ph) => (ph % 2 ? 1 : 0) }),
      kelp: material({ base: KELP, tex: (x) => (wrap(x, 2) < 0.5 ? -1 : 0) }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      fillAll(r, [kelp(t, 32, 0.6, Math.PI * 0.82, 9, ph), kelp(t, 32, -0.4, Math.PI * 0.9, 7, ph, 1.6)], m('kelp'), o, 0.8, -1);
      fillAll(r, [t.cap(-20, 0, 33, 0, 1.1)], m('shaft'), o, 1);
      // Coral and barnacles grown over the butt and the throat.
      fillAll(r, [t.cap(-19.6, 0, -21.6, 1.6, 0.6, 0.35), t.cap(-18.6, 0, -19.4, -2.2, 0.55, 0.3), t.circ(-16.6, 1, 0.7)], m('coral'), o, 0.8);
      fillAll(r, [t.cap(31, 0.8, 30, 3.2, 0.55, 0.3), t.cap(30.4, -0.8, 28.8, -2.6, 0.5, 0.3)], m('coral'), o, 0.8);
      // Three prongs, the outer two curving out, each barbed.
      const prongs = [
        t.poly([33, -1.2, 40, -0.9, 45, 0, 40, 0.9, 33, 1.2]),
        t.poly([33.4, 0.8, 36, 3.4, 39.6, 4.8, 41.6, 4.6, 39.2, 3.8, 36.6, 2.2, 34, 0]),
        t.poly([33.4, -0.8, 36, -3.4, 39.6, -4.8, 41.6, -4.6, 39.2, -3.8, 36.6, -2.2, 34, 0]),
        t.poly([38.4, 0.6, 37.4, 1.8, 39, 1]), t.poly([38.4, -0.6, 37.4, -1.8, 39, -1]),
        t.poly([39.4, 4.2, 38.6, 5.8, 40.4, 4.8]), t.poly([39.4, -4.2, 38.6, -5.8, 40.4, -4.8]),
      ];
      fillAll(r, [union(...prongs)], m('prong'), o, 1.2);
      fillAll(r, [t.rect(33, 0, 0.9, 2.2, 0.4)], m('coral'), o, 1);
      r.fill(t.circ(33.6, 0, 1.4), m('pearl'), { group: g, bevel: 1 });
    },
  };
}

/** The nautilus shell: a coiled spiral of cream and coral bands, fins on its rim (centre at cx, 0). */
function nautilus(r: Parameters<WeaponArt['draw']>[0], t: Xf, cx: number, spin: number, m: (k: string) => number, g: number, bias = 0): void {
  const fins: Shape[] = [t.circ(cx, 0, 4.4)];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + spin;
    fins.push(t.poly([cx + Math.cos(a) * 3.6, Math.sin(a) * 3.6, cx + Math.cos(a + 0.55) * 6.6, Math.sin(a + 0.55) * 6.6, cx + Math.cos(a + 0.9) * 3.8, Math.sin(a + 0.9) * 3.8]));
  }
  r.fill(union(...fins), m('shell'), { group: g, bevel: 1.6, toneBias: bias, local: new Xf(t.x(cx, 0), t.y(cx, 0), t.ang + spin, t.sx, t.sy) });
  // The coil: an inner whorl and the pearl at its heart.
  r.fill(subtract(t.circ(cx + 0.6, 0.3, 2.6), t.circ(cx + 1.1, 0.5, 1.6)), m('band'), { group: g, flat: 1, noLine: true });
  r.fill(t.circ(cx + 1.1, 0.5, 1), m('pearl'), { group: g, bevel: 0.8 });
}

function nautilusDisc(): WeaponArt {
  // A nautilus shell with fin blades for a chakram, its coil turning frame by frame.
  const coil: Tex = (x, y, ph) => {
    const a = Math.atan2(y, x), d = Math.hypot(x, y);
    return wrap(a * 1.9 + d * 0.9 - ph * (Math.PI / 2), Math.PI) < 1 ? -1 : 0;
  };
  return {
    tip: 5,
    mats: {
      shell: material({ base: 0xf2dcc0, shiny: true, step: 0.14, tex: coil }), band: material({ base: CORAL }),
      pearl: material({ base: PEARL, ramp: PEARL_RAMP, shiny: true }), grip: material({ base: KELP }),
    },
    draw(r, t, m, o) {
      nautilus(r, t, 3, r.phase * (Math.PI / 6), m, o.group ?? 6, o.toneBias ?? 0);
      clearShape(r, t.circ(3.6, -1.6, 0.9));
      fillAll(r, [t.cap(-1.2, -1.4, -1.2, 1.4, 0.9)], m('grip'), o, 1);
    },
  };
}

// Battle sprites (their own materials).
const AM = mats({
  shell: { base: 0xf2dcc0, shiny: true, step: 0.14 }, band: { base: CORAL }, pearl: { base: PEARL, ramp: PEARL_RAMP, shiny: true },
  water: { base: 0x5ad8ff, glow: true }, foam: { base: 0xe8fbff, glow: true },
  glowPearl: { base: PEARL, glow: true, ramp: PEARL_RAMP }, bubble: { base: 0x9af0ff, glow: true },
});
const AMK = (k: string) => AM[k as keyof typeof AM];

const chakramProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // The spinning shell trailing a ribbon of water.
    r.fill(t.poly([-2, -2.4, -9, -1.2 + (f % 2) * 0.6, -13, 0, -9, 1.4 - (f % 2) * 0.6, -2, 2.4]), h(AM.water), { group: 1 });
    r.fill(t.poly([-2, -1, -7, 0, -2, 1]), h(AM.foam), { group: 1 });
    nautilus(r, t, 0, f * (Math.PI / 6) * 2, (k) => h(AMK(k)), 2);
  },
};

const coreProj: ProjArt = {
  frames: 4,
  draw(r, t, f, h) {
    // A glowing pearl floating in a ring of bubbles that drift round it.
    r.fill(t.circ(0, 0, 2.6), h(AM.glowPearl), { group: 1 });
    r.dot(t.x(-0.8, 0.8), t.y(-0.8, 0.8), h(AM.foam), 3, 1);
    for (let k = 0; k < 3; k++) {
      const a = f * Q * 0.5 + (k * Math.PI * 2) / 3;
      const x = Math.cos(a) * 4.6, y = Math.sin(a) * 2.4 + 0.4;
      r.fill(t.circ(x, y, k === 0 ? 0.9 : 0.6), h(AM.bubble), { group: 1, noLine: true });
    }
  },
};

const pearl: SkinArt = {
  mats: {
    // Stock names: the frost core's particles and anything drawn the stock way.
    ice: shiny(0x9af0ff, undefined, 0.16), iceGlow: glow(0xe0fff8),
    'k.shell': shiny(0xf2dcc0, (x, y) => (wrap(Math.atan2(y, x) * 4, 1) < 0.25 ? -1 : 0), 0.14), 'k.inner': plain(0xffb8b0),
    'k.pearl': { base: PEARL, ramp: PEARL_RAMP, shiny: true }, 'k.bubble': glow(0x9af0ff), 'k.coral': shiny(CORAL, undefined, 0.14),
  },
  glow: [0xe0fff8, 0x2ab8c8],
  icon(r, t, m) {
    // An open clam on a bed of coral, a great pearl inside, bubbles rising.
    r.fill(union(t.cap(-9, -8, -11, -3, 0.9, 0.5), t.cap(-9, -8, -6, -4, 0.8, 0.4), t.cap(9, -8, 11.4, -4.4, 0.9, 0.5)), m('k.coral'), { group: 1, bevel: 0.8 });
    r.fill(t.ell(0, 5, 10, 6.4), m('k.shell'), { group: 2, bevel: 2.4, toneBias: -1, local: new Xf(t.x(0, -2), t.y(0, -2), 0) });
    r.fill(t.ell(0, -4, 10.4, 4.6), m('k.shell'), { group: 3, bevel: 2.4, local: new Xf(t.x(0, -9), t.y(0, -9), 0) });
    r.fill(t.ell(0, -2.4, 8.2, 2.6), m('k.inner'), { group: 3, bevel: 2 });
    r.fill(t.circ(0, 0.4, 4.4), m('k.pearl'), { group: 4, bevel: 3 });
    for (const [x, y, s] of [[6, 9, 1.3], [8.6, 12.6, 0.9], [4.4, 13, 0.7]] as const) r.fill(t.circ(x, y, s), m('k.bubble'), { group: 5, noLine: true });
  },
  proj: { core: coreProj },
};

function leviathanHelm(): SkinArt {
  // A helm of dark scale shaped like a sea serpent's head, a rippling fin crest, side fins, a pearl at the brow.
  return {
    head: () => ({
      mats: {
        'h.scale': material({ base: DEEP[2], ramp: [...DEEP, BIO], tex: (x, y, ph) => scales(x, y, ph) + biolum(x, y, ph) }),
        'h.fin': material({ base: 0xd85ab0, ramp: [0x5a1a5a, 0x8a2a7a, 0xd85ab0, 0xff9ae0, 0xffe0f8], tex: (x) => (wrap(x, 1.6) < 0.4 ? 1 : 0) }),
        'h.spine': material({ base: 0xe8e0d0, shiny: true }),
        'h.pearl': material({ base: PEARL, ramp: PEARL_RAMP, shiny: true }),
        'h.eye': material({ base: BIO, glow: true, tex: (_x, _y, ph) => (ph % 2 ? 1 : 0) }),
      },
      draw(r, H, m, g) {
        const rip = [0, 0.5, 0.9, 0.4][r.phase % 4];
        // The crest: spines with a membrane between them, rippling back.
        const crest: number[] = [5.4, 6];
        for (let k = 0; k <= 5; k++) {
          const x = 4 - k * 2.1, top = 11.2 - Math.abs(k - 1.5) * 0.9 + (k % 2 ? rip : -rip * 0.5);
          crest.push(x + 0.5, top, x - 0.5, top - 1.4);
        }
        crest.push(-8.6, 2, -6, 3.6);
        r.fill(H.poly(crest), m('h.fin'), { group: g, bevel: 1, local: H });
        for (let k = 0; k <= 5; k++) {
          const x = 4 - k * 2.1, top = 11.2 - Math.abs(k - 1.5) * 0.9 + (k % 2 ? rip : -rip * 0.5);
          r.line(H.x(x - 0.6, 5), H.y(x - 0.6, 5), H.x(x + 0.5, top), H.y(x + 0.5, top), m('h.spine'), 2, g);
        }
        const dome = hairCap(H, 1.6, -3.4, 1.4);
        r.fill(dome, m('h.scale'), { group: g, bevel: 3, local: H });
        // Cheek guard swept back like a gill, with a side fin.
        r.fill(H.poly([1.4, 1.8, 5.6, 1.8, 5.2, -2.6, 2.6, -4.8, 1, -2.6]), m('h.scale'), { group: g, bevel: 1.6, local: H });
        r.fill(H.poly([-1, 1, -5.4, 2.6 + rip, -7.6, 0.4 + rip, -5, -0.6, -2, -1.2]), m('h.fin'), { group: g, bevel: 1, local: H });
        r.line(H.x(2.6, 0.4), H.y(2.6, 0.4), H.x(5, 0.4), H.y(5, 0.4), m('h.eye'), 3, g);
        r.fill(H.circ(6.2, 2.8, 0.9), m('h.pearl'), { group: g, bevel: 0.8 });
      },
    }),
    ...FX,
  };
}

function abyssalScale(): SkinArt {
  // Iridescent scale mail with blinking lights, a scallop-shell breastplate holding a pearl,
  // coral grown over the shoulders and long kelp streaming behind.
  const shimmer: Tex = (x, y, ph) => scales(x, y, ph) + (wrap(Math.floor((x + y * 0.7) * 0.45) - ph, 4) === 0 ? 1 : 0) + (biolum(x, y, ph) === 4 ? 2 : 0);
  return {
    mats: {
      mirror: { base: 0x2a8a9a, ramp: [0x0e2a3a, 0x1a4a5e, 0x2a8a9a, 0x8a5ab8, BIO], shiny: true, tex: shimmer }, mirrorGlow: glow(BIO),
      'k.kelp': plain(KELP, (x) => (wrap(x, 2) < 0.5 ? -1 : 0)), 'k.kelpD': plain(0x2a6a42),
      'k.coral': shiny(CORAL, undefined, 0.14), 'k.shell': shiny(0xf2dcc0, (x, y) => (wrap(Math.atan2(x, y + 2) * 5, 1) < 0.25 ? -1 : 0), 0.14),
      'k.pearl': { base: PEARL, ramp: PEARL_RAMP, shiny: true, tex: (_x, _y, ph) => (ph % 2 ? 1 : 0) },
    },
    chest: {
      pauldron: null,
      back(r, T, m, c) {
        const top = c.top, ph = r.phase % 4, s = c.sway * 2;
        for (const [k, dx, len, mat] of [[0, -1.4, 17, 'k.kelpD'], [1.3, -3, 15, 'k.kelp'], [2.6, -2, 18, 'k.kelp'], [3.9, -4.2, 13, 'k.kelpD']] as const) {
          r.fill(kelp(T, dx, top - 0.6, -Math.PI / 2 - 0.35 - s * 0.05, len, ph, k), m(mat), { group: c.g, bevel: 0.8, toneBias: -1, local: T });
        }
      },
      shoulder(r, S, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        r.fill(S.ell(0, 0.6, 3, 2.2), m('k.shell'), { ...o, bevel: 1.6, local: S });
        r.fill(union(S.cap(-1, 2, -2, 5.4, 0.6, 0.3), S.cap(-1.4, 3.6, -3.4, 4.6, 0.45, 0.25), S.cap(0.6, 2.2, 1.4, 4.8, 0.5, 0.25)), m('k.coral'), { ...o, bevel: 0.8 });
      },
      over(r, T, m, c) {
        // A scallop over the heart with the pearl set in it.
        const x = c.body.chestPush * 0.7 + 1.2, y = c.top - 4.6;
        const fan: Shape = union(T.ell(x, y + 0.6, 2.6, 2.2), T.poly([x - 1, y - 1.2, x + 1, y - 1.2, x + 0.6, y - 2.4, x - 0.6, y - 2.4]));
        r.fill(fan, m('k.shell'), { group: c.g, bevel: 1.2, local: new Xf(T.x(x, y - 2), T.y(x, y - 2), T.ang) });
        r.fill(T.circ(x + 0.2, y + 0.6, 1), m('k.pearl'), { group: c.g, bevel: 0.8 });
      },
    },
    ...FX,
  };
}

function tidewalkers(): SkinArt {
  // Scaled boots lit from within, a fan fin at each ankle that ripples, a coral spur, bubbles rising off the heel.
  return {
    mats: {
      shadow: veined(DEEP, BIO, (x, y, ph) => scales(x, y, ph) + biolum(x, y, ph)),
      shadowGlow: glow(BIO),
      'k.fin': { base: 0xd85ab0, ramp: [0x5a1a5a, 0x8a2a7a, 0xd85ab0, 0xff9ae0, 0xffe0f8], tex: (x) => (wrap(x, 1.4) < 0.4 ? 1 : 0) },
      'k.coral': shiny(CORAL, undefined, 0.14), 'k.bubble': glow(0x9af0ff),
    },
    boots: {
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const rip = [0, 0.5, 0.9, 0.4][r.phase % 4];
        const w = c.w;
        r.fill(shin.poly([1, -w + 0.2, 3.2 + rip, -w - 2.8, 5.4 + rip * 0.6, -w - 3.6, 5.6, -w - 1.2, 4.2, -w + 0.2]), m('k.fin'), { ...o, bevel: 0.8, local: shin });
        r.fill(foot.cap(-1, -0.6, -2.6, -1.6, 0.5, 0.25), m('k.coral'), { ...o, bevel: 0.6 });
        if (c.far) return;
        // Two bubbles rise off the heel and pop, looping every four frames.
        for (let k = 0; k < 2; k++) {
          const u = wrap(r.phase + k * 2, 4);
          r.fill(shin.circ(1 + u * 1.6, -w - 1 - u * 0.3, 0.75 - u * 0.12), m('k.bubble'), { group: c.g, noLine: true });
        }
      },
    },
    ...FX,
  };
}

export const ABYSSAL: Record<string, SkinArt> = {
  'spear.trident': { weapon: trident, ...FX },
  'wind_chakram.nautilus': { weapon: nautilusDisc, proj: { chakram: chakramProj }, ...FX },
  'frost_core.pearl': pearl,
  'iron_helm.leviathan': leviathanHelm(),
  'mirror_mail.abyssal': abyssalScale(),
  'shadow_treads.tidewalkers': tidewalkers(),
};
