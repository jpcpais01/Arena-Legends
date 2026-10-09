import { material, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt } from './index';
import { epicFx, glow, mats, plain, shiny, veined, wrap } from './kit';

/**
 * Epic set: Clockwork Titan. Riveted brass and dark steel, gears that never
 * stop turning, pistons pumping, steam venting, and an arcane cyan core
 * humming at the heart of every piece.
 */

const BRASS = [0x4a2e14, 0x7a5224, 0xb88438, 0xe8b850, 0xfce8a0];
/** Plate brass: a deeper ramp, so a whole torso of it still reads as brass under the light. */
const PLATE = [0x3a2410, 0x6a4620, 0x9a6c2c, 0xc89640, 0xecc870];
const STEEL = [0x181c22, 0x262c34, 0x3a424c, 0x5a6470];
const COPPER = 0xc8743e, CORE = 0x6af0ff, CORE_HOT = 0xe8ffff, STEAM = 0xe4e8ee;

/** Riveted panels: seams every few units, a rivet at each corner. */
const rivets = (p = 3.2, hi = 2): Tex => (x, y) => {
  const u = wrap(x, p), v = wrap(y, p);
  if (u < 0.75 && v < 0.75) return hi;
  return u < 0.32 || v < 0.32 ? -1 : 0;
};
/** A gleam sliding along polished brass, one step per frame. */
const gleam = (period = 8): Tex => (x, y, ph) => (wrap(x + y * 0.5 - ph * 2, period) < 1.2 ? 1 : 0);
/** Arcane circuits in dark steel: traces on a grid that light up in a running pulse. */
const circuit: Tex = (x, y, ph) => {
  const cx = Math.floor(x / 2.6), cy = Math.floor(y / 2.6);
  const onX = wrap(y, 2.6) < 0.45, onY = wrap(x, 2.6) < 0.45;
  if (!(onX && hash(cx, cy * 3 + 1) < 0.5) && !(onY && hash(cx * 5 + 2, cy) < 0.4)) return 0;
  return wrap(cx + cy - ph, 4) < 1 ? 4 : 1;
};
/** The arcane core beating: bright on the downbeat. */
const beat: Tex = (_x, _y, ph) => [1, 0, 1, 0][ph % 4] - (ph % 4 === 3 ? 1 : 0);

const brass = (tex: Tex = rivets()) => material({ base: BRASS[2], ramp: BRASS, shiny: true, tex });
const FX = epicFx(0xfff0c0, 0x3ab8e0, 'twinkle', 0xffe0a0);

/** A gear outline: `n` teeth `d` deep around radius `r`, turned by `spin` (a polygon, so it squashes with its frame). */
function gear(F: Xf, cx: number, cy: number, r: number, n: number, spin: number, d = 1, hole = 0): Shape {
  const pts: number[] = [], w = Math.PI / n;
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * Math.PI * 2;
    for (const [da, rr] of [[-w * 0.6, r], [-w * 0.34, r + d], [w * 0.34, r + d], [w * 0.6, r]] as const) {
      pts.push(cx + Math.cos(a + da) * rr, cy + Math.sin(a + da) * rr);
    }
  }
  const s = F.poly(pts);
  return hole ? subtract(s, disc(F, cx, cy, hole)) : s;
}
/** A round disc as a polygon (stays round in squashed frames, unlike `circ`). */
function disc(F: Xf, cx: number, cy: number, r: number, n = 14): Shape {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) pts.push(cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r);
  return F.poly(pts);
}
/** A gear's turn per frame so `n` teeth loop seamlessly over four frames. */
const turn = (n: number, ph: number) => ((Math.PI * 2) / n / 4) * (ph % 4);

/** Steam puffs rising from (x, y) along `up` in frame F, two of them looping over four frames. */
function steam(r: Raster, F: Xf, x: number, y: number, up: number, ph: number, mat: number, g: number, size = 1): void {
  const c = Math.cos(up), s = Math.sin(up);
  for (let k = 0; k < 2; k++) {
    const u = wrap(ph + k * 2, 4) / 4;
    const d = 0.6 + u * 4.2 * size, side = Math.sin((ph + k) * 1.7) * 0.5;
    r.fill(F.circ(x + c * d - s * side, y + s * d + c * side, (0.55 + u * 0.9) * size), mat, { group: g, noLine: true });
  }
}

function steamforge(): WeaponArt {
  // A brass piston-hammer: the striking face pumps in and out, a cog spins round an arcane core,
  // a gauge needle shivers and steam vents from the exhaust stack on its back.
  return {
    tip: 31,
    grip2: 10,
    mats: {
      haft: material(veined(STEEL, CORE, circuit)), band: brass(gleam()), head: brass(), strap: material({ base: STEEL[2], shiny: true }),
      face: material({ base: 0xc8d0dc, shiny: true, step: 0.15 }), cog: material({ base: COPPER, shiny: true, step: 0.14 }),
      core: material({ base: CORE, glow: true, ramp: [0x1a6a8a, 0x2ab8e0, CORE, 0xb8fcff, CORE_HOT], tex: beat }),
      pipe: material({ base: COPPER, shiny: true }), gauge: material({ base: 0xf0ead8 }), needle: material({ base: 0xd83a2a }),
      steam: material({ base: STEAM }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      fillAll(r, [t.cap(-9, 0, 23, 0, 1.25, 1.15)], m('haft'), o, 1);
      fillAll(r, [gear(t, -10.4, 0, 1.3, 6, turn(6, ph), 0.6)], m('cog'), o, 0.8);
      fillAll(r, [t.rect(-8.6, 0, 0.8, 1.7), t.rect(-2.6, 0, 0.5, 1.5), t.rect(2.6, 0, 0.5, 1.5), t.rect(21.4, 0, 1, 1.8)], m('band'), o, 1);
      // A copper feed pipe up the haft into the head.
      fillAll(r, [t.cap(5, 1.7, 21.6, 1.7, 0.42), t.cap(21.6, 1.7, 22.4, 3, 0.42)], m('pipe'), o, 0.6);
      // Exhaust stack on the back, venting.
      steam(r, t, 24.6, 10.4, Math.PI / 2, ph, m('steam'), g, 1.1);
      fillAll(r, [t.rect(24.6, 8, 1.1, 1.8, 0.2)], m('strap'), o, 0.8);
      fillAll(r, [t.rect(24.6, 9.8, 1.5, 0.45, 0.2)], m('band'), o, 0.6);
      // The piston face, pumping out of the head.
      const pump = [0, 0.5, 1, 0.5][ph];
      fillAll(r, [t.rect(26.6, -6.4 - pump * 0.5, 1.6, 0.9 + pump * 0.5)], m('face'), o, 0.8);
      fillAll(r, [t.rect(26.6, -7.6 - pump, 4.2, 1, 0.4)], m('face'), o, 1.2);
      // The block, its steel straps and the cog round the core.
      fillAll(r, [t.rect(26.6, 0.4, 4.4, 6, 0.6)], m('head'), o, 2);
      fillAll(r, [t.rect(22.7, 0.4, 0.55, 6.1), t.rect(30.5, 0.4, 0.55, 6.1)], m('strap'), o, 0.8);
      fillAll(r, [gear(t, 26.6, 0.6, 2.4, 8, turn(8, ph), 0.9, 1.2)], m('cog'), o, 1);
      r.fill(t.circ(26.6, 0.6, 1.25), m('core'), { group: g });
      // A pressure gauge, the needle shivering.
      r.fill(t.circ(28.8, 4.4, 1.05), m('gauge'), { group: g, bevel: 0.6 });
      const na = 0.6 + [0, 0.35, 0.1, 0.45][ph];
      r.line(t.x(28.8, 4.4), t.y(28.8, 4.4), t.x(28.8 + Math.cos(na) * 0.9, 4.4 + Math.sin(na) * 0.9), t.y(28.8 + Math.cos(na) * 0.9, 4.4 + Math.sin(na) * 0.9), m('needle'), 2, g);
    },
  };
}

function cogwheelAegis(): WeaponArt {
  // A buckler that is one great toothed gear, a copper cog counter-turning inside it, an arcane core at the hub.
  return {
    tip: 7.4,
    mats: {
      rim: brass(rivets(2.6)), face: material(veined(STEEL, CORE, circuit)), cog: material({ base: COPPER, shiny: true, step: 0.14 }),
      core: material({ base: CORE, glow: true, ramp: [0x1a6a8a, 0x2ab8e0, CORE, 0xb8fcff, CORE_HOT], tex: beat }),
      spike: material({ base: 0xc8d0dc, shiny: true, step: 0.15 }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // The disc seen side-on: a frame squashed across the shield's depth.
      const P = new Xf(t.x(2.1, 0), t.y(2.1, 0), t.ang, t.sx * 0.36, t.sy);
      const F = new Xf(t.x(2.5, 0), t.y(2.5, 0), t.ang, t.sx * 0.36, t.sy);
      fillAll(r, [gear(P, 0, 0, 5.5, 12, turn(12, ph), 1)], m('rim'), o, 2);
      r.fill(disc(F, 0, 0, 4.4), m('face'), { group: g, bevel: 2.4, noLine: true, toneBias: o.toneBias, local: o.local });
      fillAll(r, [gear(F, 0, 0, 2.6, 8, -turn(8, ph) * 1.5, 0.8, 1.2)], m('cog'), o, 1);
      r.fill(disc(F, 0, 0, 1.2, 10), m('core'), { group: g });
      fillAll(r, [t.poly([3.4, -1.2, 7.6, 0, 3.4, 1.2])], m('spike'), o, 1);
    },
  };
}

// Battle sprites (their own materials).
const CM = mats({
  brass: { base: BRASS[2], ramp: BRASS, shiny: true, tex: rivets(2.6) }, copper: { base: COPPER, shiny: true, step: 0.14 },
  steel: { base: STEEL[2], shiny: true }, core: { base: CORE, glow: true }, coreHot: { base: CORE_HOT, glow: true },
  steam: { base: STEAM },
});

/** The clockwork heart: a riveted brass heart with a window onto the core (centre at 0, 0, `s` scales it). */
function heartShape(F: Xf, s: number): Shape {
  return F.poly([0, -10.6, -7.6, -3.4, -9.8, 1.6, -8.8, 6.6, -5.4, 9, -2, 8.4, 0, 6.2, 2, 8.4, 5.4, 9, 8.8, 6.6, 9.8, 1.6, 7.6, -3.4].map((v) => v * s));
}

const heartProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A small clockwork heart floating at the shoulder: a cog turning behind it, the core beating.
    const s = 0.55;
    r.fill(gear(t, -3, 3, 2.6, 7, turn(7, f), 0.9, 0.9), h(CM.copper), { group: 1, bevel: 0.8 });
    r.fill(heartShape(t, s), h(CM.brass), { group: 2, bevel: 1.6, local: t });
    const big = f % 2 === 0;
    r.fill(t.circ(0, 0.6, big ? 2 : 1.5), h(CM.core), { group: 2 });
    r.dot(t.x(-0.4, 1), t.y(-0.4, 1), h(CM.coreHot), 3, 2);
    if (f === 1) r.fill(t.circ(1.6, 4.6, 0.6), h(CM.steam), { group: 3, noLine: true });
    if (f === 2) r.fill(t.circ(2, 5.8, 0.8), h(CM.steam), { group: 3, noLine: true });
  },
};

const heart: SkinArt = {
  mats: {
    // Stock names: the echo stone drawn the stock way.
    stone: shiny(BRASS[2], rivets(2.6)), rune: glow(CORE),
    'k.brass': { base: BRASS[2], ramp: BRASS, shiny: true, tex: rivets(3) }, 'k.copper': shiny(COPPER, undefined, 0.14),
    'k.steel': shiny(STEEL[2]), 'k.core': glow(CORE), 'k.hot': glow(CORE_HOT), 'k.steam': plain(STEAM),
  },
  glow: [0xc8fcff, 0xd8a040],
  icon(r, t, m) {
    // A brass heart of gears with a window onto its arcane core, copper pipes rising from the top, venting steam.
    r.fill(gear(t, -6.6, 5.4, 4.2, 9, 0.2, 1.2, 1.4), m('k.copper'), { group: 1, bevel: 1.2 });
    r.fill(gear(t, 7.4, -3.6, 3.2, 7, 0.4, 1.1, 1), m('k.copper'), { group: 1, bevel: 1, toneBias: -1 });
    r.fill(union(t.cap(-2.6, 7, -3.6, 12.4, 1), t.cap(2.4, 7.4, 4.6, 11.6, 1)), m('k.copper'), { group: 2, bevel: 1 });
    r.fill(union(t.rect(-3.6, 12.4, 1.5, 0.6, 0.2), t.rect(4.6, 11.6, 1.5, 0.6, 0.2)), m('k.steel'), { group: 2, bevel: 0.6 });
    for (const [x, y, s] of [[-4.4, 14.6, 1], [-2.2, 15.4, 0.7]] as const) r.fill(t.circ(x, y, s), m('k.steam'), { group: 6, noLine: true });
    r.fill(heartShape(t, 1), m('k.brass'), { group: 3, bevel: 3, local: t });
    r.fill(subtract(t.circ(0, 0.6, 4.4), t.circ(0, 0.6, 3.3)), m('k.steel'), { group: 4, bevel: 1 });
    r.fill(t.circ(0, 0.6, 3.3), m('k.core'), { group: 4 });
    r.fill(t.circ(-0.8, 1.4, 1.4), m('k.hot'), { group: 4, noLine: true });
    for (const [a, b] of [[0.2, 4.4], [2.6, 4.4], [-1.9, 4.4]] as const) {
      r.line(t.x(Math.cos(a) * b, 0.6 + Math.sin(a) * b), t.y(Math.cos(a) * b, 0.6 + Math.sin(a) * b), t.x(Math.cos(a) * (b + 3), 0.6 + Math.sin(a) * (b + 3)), t.y(Math.cos(a) * (b + 3), 0.6 + Math.sin(a) * (b + 3)), m('k.core'), 2, 4);
    }
  },
  proj: { core: heartProj },
};

function automaton(): SkinArt {
  // A riveted brass faceplate with a great glowing lens for an eye, a grille for a mouth,
  // a cog turning at the temple and copper pipes swept back like horns, venting steam.
  return {
    head: () => ({
      mats: {
        'h.brass': brass(), 'h.steel': material({ base: STEEL[2], shiny: true }), 'h.copper': material({ base: COPPER, shiny: true, step: 0.14 }),
        'h.lens': material({ base: CORE, glow: true, ramp: [0x1a6a8a, 0x2ab8e0, CORE, 0xb8fcff, CORE_HOT], tex: beat }),
        'h.grille': material({ base: STEEL[0] }), 'h.steam': material({ base: STEAM }),
      },
      draw(r, H, m, g) {
        const ph = r.phase % 4;
        // Pipes swept back over the head; steam from their ends.
        steam(r, H, -7.4, 8.2, 2.5, ph, m('h.steam'), g);
        r.fill(union(H.cap(0.6, 4, -3, 7.6, 0.85, 0.7), H.cap(-3, 7.6, -7, 8.2, 0.7, 0.6)), m('h.copper'), { group: g, bevel: 1, local: H });
        r.fill(H.rect(-7.2, 8.2, 0.5, 0.95, 0.2), m('h.steel'), { group: g, bevel: 0.6 });
        r.fill(H.cap(1, -3.8, -3.2, -5, 0.6, 0.5), m('h.copper'), { group: g, bevel: 0.8, toneBias: -1, local: H });
        // The faceplate, a steel brow over it.
        r.fill(H.poly([0.6, 4, 7.4, 3.2, 7.8, -1.2, 6.4, -5.6, 1.2, -5.4, 0.2, -1]), m('h.brass'), { group: g, bevel: 2, local: H });
        r.fill(H.poly([0.8, 4.2, 7.6, 3.4, 7.8, 2, 0.8, 2.6]), m('h.steel'), { group: g, bevel: 0.8 });
        // The great lens over the near eye, a slit for the far one.
        r.fill(subtract(H.circ(3.4, 0.2, 1.9), H.circ(3.4, 0.2, 1.25)), m('h.steel'), { group: g, bevel: 0.8 });
        r.fill(H.circ(3.4, 0.2, 1.25), m('h.lens'), { group: g });
        r.line(H.x(5.9, 0.2), H.y(5.9, 0.2), H.x(6.9, 0.1), H.y(6.9, 0.1), m('h.lens'), 3, g);
        // The grille.
        r.fill(H.rect(5, -3.6, 2, 1.1, 0.3), m('h.grille'), { group: g, flat: 0 });
        for (const x of [3.6, 4.6, 5.6, 6.6]) r.line(H.x(x, -2.7), H.y(x, -2.7), H.x(x, -4.4), H.y(x, -4.4), m('h.steel'), 3, g);
        // The cog at the temple.
        r.fill(gear(H, -0.6, 0.6, 2, 7, turn(7, ph), 0.8, 0.8), m('h.copper'), { group: g, bevel: 1, local: H });
        r.dot(H.x(-0.6, 0.6), H.y(-0.6, 0.6), m('h.lens'), 3, g);
      },
    }),
    ...FX,
  };
}

function titanFrame(): SkinArt {
  // Riveted brass plate over a frame of dark steel: gear pauldrons that turn, twin smokestacks on the back
  // venting steam, and a furnace window on the chest where the arcane core beats.
  return {
    mats: {
      plate: { base: PLATE[2], ramp: PLATE, shiny: true, step: 0.12, tex: (x, y, ph) => rivets(3, 1)(x, y, ph) + gleam(9)(x, y, ph) }, plateDark: shiny(STEEL[2]),
      'k.gear': shiny(COPPER, undefined, 0.14), 'k.hub': { base: BRASS[2], ramp: BRASS, shiny: true }, 'k.steel': shiny(STEEL[2]),
      'k.core': { base: CORE, glow: true, ramp: [0x1a6a8a, 0x2ab8e0, CORE, 0xb8fcff, CORE_HOT], tex: beat }, 'k.steam': plain(STEAM),
      'k.pipe': shiny(COPPER),
    },
    chest: {
      pauldron: null, spikes: null,
      back(r, T, m, c) {
        const top = c.top, ph = r.phase % 4;
        // Two smokestacks rising behind the shoulders.
        for (const [x, h, w, k] of [[-4.2, 4.2, 1.1, 0], [-6.6, 2.8, 0.9, 2]] as const) {
          steam(r, T, x, top + h + 0.8, Math.PI / 2 + 0.25, ph + k, m('k.steam'), c.g, 1.1);
          r.fill(T.rect(x, top + h / 2 - 1, w, h / 2 + 1, 0.2), m('k.steel'), { group: c.g, bevel: 0.8, toneBias: -1 });
          r.fill(T.rect(x, top + h, w + 0.4, 0.45, 0.2), m('k.hub'), { group: c.g, bevel: 0.6, toneBias: -1 });
        }
      },
      shoulder(r, S, m, c) {
        // A great gear for a pauldron, turning, the core winking at its hub.
        const o = { group: c.g, toneBias: c.bias };
        r.fill(gear(S, 0.2, 1, 2.6, 8, turn(8, r.phase), 1, 1.1), m('k.gear'), { ...o, bevel: 1.2, local: S });
        r.fill(S.circ(0.2, 1, 1.1), m('k.hub'), { ...o, bevel: 0.8 });
        r.dot(S.x(0.2, 1), S.y(0.2, 1), m('k.core'), 3, c.g);
      },
      over(r, T, m, c) {
        // The furnace window over the heart, a copper pipe curling over the shoulder.
        const x = c.body.chestPush * 0.7 + 1.2, y = c.top - 4.4;
        r.fill(T.cap(x - 1.6, y + 1.8, x - 3.6, c.top - 0.6, 0.45), m('k.pipe'), { group: c.g, bevel: 0.6 });
        r.fill(subtract(T.circ(x, y, 2.4), T.circ(x, y, 1.6)), m('k.hub'), { group: c.g, bevel: 0.8 });
        r.fill(T.circ(x, y, 1.6), m('k.core'), { group: c.g });
        r.fill(T.rect(x, y, 1.6, 0.25), m('k.steel'), { group: c.g, noLine: true });
      },
    },
    ...FX,
  };
}

function pistonStompers(): SkinArt {
  // Brass stompers driven by a piston up the back of the calf, a cog turning at the ankle and steam off the heel.
  return {
    mats: {
      colossus: { base: BRASS[2], ramp: BRASS, shiny: true, tex: rivets(2.6) }, colossusDark: shiny(STEEL[2]),
      'k.cyl': shiny(COPPER, undefined, 0.14), 'k.rod': shiny(0xc8d0dc, undefined, 0.15), 'k.gear': { base: BRASS[2], ramp: BRASS, shiny: true },
      'k.core': glow(CORE), 'k.steam': plain(STEAM),
    },
    boots: {
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w, pump = [0, 0.6, 1.2, 0.6][ph];
        // The piston: a copper cylinder up the calf, its rod driving down into the heel.
        const a = c.top * 0.45, b = c.top * 0.95;
        r.fill(shin.rect(a * 0.5 + pump * 0.4, -w - 0.5, a * 0.5, 0.4), m('k.rod'), { ...o, bevel: 0.6 });
        r.fill(shin.rect((a + b) / 2 + pump * 0.4, -w - 0.6, (b - a) / 2, 0.85, 0.3), m('k.cyl'), { ...o, bevel: 0.8, local: shin });
        r.fill(shin.rect(b + pump * 0.4, -w - 0.6, 0.5, 1.05, 0.2), m('k.gear'), { ...o, bevel: 0.6 });
        // A cog turning at the ankle, the core at its hub.
        r.fill(gear(shin, 0.8, w * 0.1, 1.5, 6, turn(6, ph), 0.6, 0.5), m('k.gear'), { ...o, bevel: 0.8, local: shin });
        r.dot(shin.x(0.8, w * 0.1), shin.y(0.8, w * 0.1), m('k.core'), 3, c.g);
        if (c.far) return;
        steam(r, new Xf(foot.ox, foot.oy, foot.ang, -foot.sx, foot.sy), 2, 0.6, 2.2, ph, m('k.steam'), c.g, 0.8);
      },
    },
    ...FX,
  };
}

function pistonCuisses(): SkinArt {
  // Riveted brass tassets over dark-steel thighs traced with arcane circuits, a cog turning on the plate
  // at the hip, a brass knee cop round a beating cyan core, and a copper piston behind the knee that pumps
  // as the leg works, venting a breath of steam.
  return {
    mats: {
      stoneLeg: veined(STEEL, CORE, circuit), stoneDark: { base: STEEL[3], ramp: [...STEEL, 0x8a96a4], shiny: true },
      'l.plate': { base: PLATE[2], ramp: PLATE, shiny: true, step: 0.12, tex: (x, y, ph) => rivets(2.8, 1)(x, y, ph) + gleam(9)(x, y, ph) },
      'l.brass': { base: BRASS[2], ramp: BRASS, shiny: true },
      'l.cog': shiny(COPPER, undefined, 0.14), 'l.cyl': shiny(COPPER, undefined, 0.14), 'l.rod': shiny(0xc8d0dc, undefined, 0.15),
      'l.core': { base: CORE, glow: true, ramp: [0x1a6a8a, 0x2ab8e0, CORE, 0xb8fcff, CORE_HOT], tex: beat }, 'l.steam': plain(STEAM),
    },
    legs: {
      mat: 'stoneLeg', trim: 'stoneDark', knee: null, tasset: null, rune: null, wraps: null, bulk: 0.4,
      over(r, t, m, c) {
        const part = { group: c.g + 20, toneBias: c.bias };
        const ph = r.phase % 4, L = c.len, w = c.w, pump = [0, 0.6, 1.1, 0.6][ph];
        // A cog at the back of the hip, half out of the plate, turning; the core winks at its hub.
        const gx = L * 0.68, gy = -w + 0.1;
        r.fill(gear(t, gx, gy, 1.8, 8, turn(8, ph), 0.85, 0.6), m('l.cog'), { ...part, group: c.g + 19, bevel: 0.8, local: t });
        r.dot(t.x(gx, gy), t.y(gx, gy), m('l.core'), 3, c.g + 19);
        // The piston up the back of the thigh: a copper cylinder, its steel rod driving down into the knee.
        const py = -w + 0.1, top = L * 0.56 - pump * 0.5;
        r.fill(t.cap(0.4, py + 0.3, top - 2.6, py, 0.42), m('l.rod'), { ...part, bevel: 0.5 });
        r.fill(t.rect(top - 1.3, py, 1.4, 0.85, 0.3), m('l.cyl'), { ...part, bevel: 0.8, local: t });
        r.fill(t.rect(top - 2.8, py, 0.35, 1.05, 0.2), m('l.brass'), { ...part, bevel: 0.5 });
        if (!c.far) steam(r, t, top, py - 0.4, Math.PI - 0.9, ph, m('l.steam'), c.g + 20, 0.55);
        // The tasset: a riveted brass plate hanging from the belt over the top of the thigh, a brass rim at its foot.
        const tas = [L + 1.4, -w - 0.5, L + 1.4, w + 1.3, L * 0.5, w + 1.5, L * 0.56, -w + 0.4];
        r.fill(t.poly(tas, 0.3), m('l.plate'), { ...part, group: c.g + 21, bevel: 1.6, local: t });
        r.fill(intersect(t.poly(tas), t.rect(L * 0.5, 0, 0.55, w + 2)), m('l.brass'), { ...part, group: c.g + 21, flat: 3, noLine: true });
        // The knee cop: a brass disc round a beating arcane core.
        const kx = 0.3, ky = w * 0.3;
        r.fill(disc(t, kx, ky, c.body.kneeR + 0.2), m('l.brass'), { ...part, bevel: 1.2 });
        r.fill(t.circ(kx + 0.2, ky + 0.2, 0.75), m('l.core'), { group: c.g + 20 });
      },
    },
    ...FX,
  };
}

export const CLOCKWORK: Record<string, SkinArt> = {
  'warhammer.steamforge': { weapon: steamforge, ...FX },
  'buckler.cogwheel': { weapon: cogwheelAegis, ...FX },
  'echo_stone.heart': heart,
  'berserker_mask.automaton': automaton(),
  'plate_armor.titan': titanFrame(),
  'colossus_boots.piston': pistonStompers(),
  'stonehide_tassets.piston': pistonCuisses(),
};
