import { material, type Material, type Tex } from '../../pixel/raster';
import { intersect, union, type Shape } from '../../pixel/sdf';
import { lattice } from '../../pixel/tex';
import { fillAll, M, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt } from './index';
import { epicFx, flameTongue, glow, mats, plain, Q, shiny, wrap } from './kit';

/**
 * Epic set: Foxfire Shrine. White lacquer, vermilion and gold of a fox
 * shrine, haunted by kitsunebi: cold blue fox flames that flicker on every piece.
 */

const WHITE = 0xf4f0ea, VERMILION = 0xd8302a, BLACK = 0x1a1418, GOLD = 0xe8c050;
const FOX = [0x1a2a8a, 0x2a5ae0, 0x4aa8ff, 0x9ae8ff, 0xf0ffff];

/** Foxfire: blue flame with a bright band running through it, one step per frame. */
const foxfire = (speed = 1.5, period = 6): Material => material({ base: FOX[2], glow: true, ramp: FOX, tex: (x, y, ph) => (wrap(x + y * 0.5 - ph * speed, period) < 1.4 ? 1 : 0) });

const FX = epicFx(0xd8f8ff, 0x2a5ae0, 'flame', 0x9ae8ff);

/** Piecewise-linear lookup through (x, y) points. */
const lerpPts = (pts: number[][], x: number) => {
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
};

function kitsunebi(): WeaponArt {
  // White steel whose hamon burns with foxfire, a fox-eared tsuba, and a vermilion cord with a bell.
  const TOP = [[2, 1.1], [11, 1.1], [20, 1.3], [27, 2], [31.5, 2.2]];
  const BOT = [[2, -1.2], [12, -1.1], [22, -0.4], [29, 0.9], [31.5, 2.2]];
  const hamon: number[] = [];
  for (let x = 3; x <= 30; x += 1) hamon.push(x, (lerpPts(TOP, x) + lerpPts(BOT, x)) / 2 - 0.25 + Math.sin(x * 1.3) * 0.32);
  for (let x = 30; x >= 3; x -= 1) hamon.push(x, lerpPts(BOT, x) - 0.6);
  return {
    tip: 31,
    mats: {
      blade: material({ base: 0xe8eef6, shiny: true, step: 0.13 }),
      hamon: foxfire(2, 9),
      guard: material({ base: GOLD, shiny: true, step: 0.15 }),
      grip: material({ base: WHITE }), wrapHi: material({ base: VERMILION }),
      cord: material({ base: VERMILION }), bell: material({ base: GOLD, shiny: true, step: 0.16 }),
      flame: foxfire(1, 4), hot: M.glow(0xf0ffff),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // The cord swings from the pommel, its bell trailing.
      const sw = [0, 0.7, 1.1, 0.7][ph];
      fillAll(r, [t.cap(-7.4, 0, -9.6, -2.2 - sw, 0.45), t.cap(-9.6, -2.2 - sw, -10.4 - sw * 0.6, -4.6 - sw, 0.45)], m('cord'), o, 0.6);
      fillAll(r, [t.circ(-10.6 - sw * 0.6, -5.2 - sw, 0.9)], m('bell'), o, 0.8);
      fillAll(r, [t.cap(-7, 0, 0, 0, 1.2, 1.15)], m('grip'), o, 1);
      for (let i = -6; i <= -1; i += 2) r.dot(t.x(i, 0), t.y(i, 0), m('wrapHi'), 2, g);
      fillAll(r, [t.circ(-7.4, 0, 1.3)], m('guard'), o, 1);
      // Foxfire licking up off the spine.
      const hs = [[1.6, 2.6, 1.2], [2.4, 1.4, 2.2], [1.4, 2.2, 2.8], [2.6, 1.8, 1.6]][ph];
      for (const [i, x] of [10, 17, 24].entries()) flameTongue(r, t, x, lerpPts(TOP, x) - 0.4, 0.9, hs[i], ((i + ph) % 2) * 0.8 - 0.6, m('flame'), m('hot'), g, o.local);
      const blade = t.poly([2, -1.2, 12, -1.1, 22, -0.4, 29, 0.9, 31.5, 2.2, 27, 2.0, 20, 1.3, 11, 1.1, 2, 1.1]);
      fillAll(r, [blade], m('blade'), o, 1.3);
      r.fill(intersect(blade, t.poly(hamon)), m('hamon'), { group: g, noLine: true, local: o.local });
      // Tsuba: a gold disc with two fox ears.
      fillAll(r, [union(t.circ(0.8, 0, 2.2), t.poly([0.2, 1.6, 0.8, 3.6, 1.6, 1.6]), t.poly([0.2, -1.6, 0.8, -3.6, 1.6, -1.6]))], m('guard'), o, 1.2);
    },
  };
}

function gohei(): WeaponArt {
  // A vermilion shrine wand trailing zigzag paper streamers, a foxfire wisp floating at its tip.
  return {
    tip: 14,
    mats: {
      shaft: material({ base: VERMILION, shiny: true, step: 0.14 }), gold: material({ base: GOLD, shiny: true, step: 0.15 }),
      paper: material({ base: 0xfaf6ee, tex: (x) => (wrap(x, 2.4) < 0.5 ? -1 : 0) }),
      fire: foxfire(1, 4), hot: M.glow(0xf0ffff),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      fillAll(r, [t.cap(-3.5, 0, 10.2, 0, 1, 0.85)], m('shaft'), o, 1);
      fillAll(r, [t.rect(-3.6, 0, 0.6, 1.2), t.rect(9.8, 0, 0.6, 1.2)], m('gold'), o, 1);
      // Two zigzag streamers (shide) hanging back from the head, flapping out of step.
      const flap = [0, 0.6, 1, 0.5][ph];
      for (const [k, dx] of [[0, -1.4], [1, 0]]) {
        const f = k ? flap : 1 - flap, s = -1;
        const pts = [[10.6 + dx, s * 0.6], [9.2 + dx, s * (2.6 + f * 0.3)], [10.4 + dx, s * (3.3 + f * 0.4)], [8.4 + dx - f * 0.4, s * (5.3 + f * 0.5)], [9.6 + dx - f * 0.4, s * (6 + f * 0.6)], [7 + dx - f, s * (8 + f * 0.6)]];
        const parts: Shape[] = [];
        for (let i = 1; i < pts.length; i++) parts.push(t.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 0.55));
        fillAll(r, [union(...parts)], m('paper'), o, 0.8, k ? 0 : -1);
      }
      fillAll(r, [t.poly([10, -1.2, 11.6, -0.6, 11.6, 0.6, 10, 1.2])], m('gold'), o, 0.8);
      // The wisp at the tip, bobbing and flickering.
      const bob = [0, 0.4, 0.6, 0.3][ph];
      const F = new Xf(t.x(13.2 + bob, 0), t.y(13.2 + bob, 0), t.ang - Math.PI / 2, t.sx, t.sy);
      r.fill(t.circ(13.4 + bob, 0, 1.5), m('fire'), { group: g, local: o.local });
      flameTongue(r, F, 0, -0.6, 1.1, [2.6, 3.4, 2.2, 3][ph], ph % 2 ? 0.5 : -0.5, m('fire'), m('hot'), g);
      r.dot(t.x(13.4 + bob, 0), t.y(13.4 + bob, 0), m('hot'), 3, g);
    },
  };
}

// Battle sprites (their own materials).
const FM = mats({
  paper: { base: 0xfff4e0, glow: true, ramp: [0xc8a888, 0xe8d4b8, 0xfff4e0, 0xfffaf0, 0xffffff], tex: (_x, y) => (wrap(y, 2) < 0.6 ? -1 : 0) },
  lacq: { base: BLACK, shiny: true }, verm: { base: VERMILION }, gold: { base: GOLD, shiny: true },
  fire: { base: FOX[2], glow: true, ramp: FOX }, hot: { base: 0xf0ffff, glow: true }, deep: { base: FOX[1], glow: true, ramp: FOX },
});

const lanternProj: ProjArt = {
  frames: 4,
  outline: true,
  draw(r, t, f, h) {
    // A small paper chochin with a fox flame flickering inside, its tassel swinging below.
    const sw = [0, 0.6, 0, -0.6][f];
    r.fill(t.cap(0, -5.2, sw, -7.4, 0.4), h(FM.verm), { group: 1 });
    r.fill(t.circ(sw, -7.8, 0.7), h(FM.verm), { group: 1 });
    const paper = t.ell(0, 0, 3.4, 4.2);
    r.fill(paper, h(FM.paper), { group: 2, local: t });
    r.fill(intersect(paper, t.rect(0, 2.6, 4, 0.5)), h(FM.verm), { group: 2, flat: 2, noLine: true });
    r.fill(intersect(paper, t.rect(0, -2.6, 4, 0.5)), h(FM.verm), { group: 2, flat: 2, noLine: true });
    r.fill(t.circ(0, 0, 1.3 + (f % 2) * 0.3), h(FM.fire), { group: 2, noLine: true });
    r.dot(t.x(0, 0), t.y(0, 0), h(FM.hot), 3, 2);
    r.fill(t.rect(0, 4.4, 2.2, 0.7), h(FM.lacq), { group: 3, bevel: 0.6 });
    r.fill(t.rect(0, -4.4, 2.2, 0.7), h(FM.lacq), { group: 3, bevel: 0.6 });
    r.fill(t.cap(0, 5, 0, 6.6, 0.4), h(FM.lacq), { group: 3 });
  },
};

const wispProj: ProjArt = {
  frames: 3,
  draw(r, t, f, h) {
    // A fox of blue flame: pointed ears, a bright muzzle and a long flickering tail.
    const w = (f - 1) * 0.7;
    r.fill(t.poly([1, -2.6, -6, -1.8 + w, -12, 0.4 + w, -14, -0.6, -9, 1.6 - w, -4, 2.6, 1, 2.6]), h(FM.deep), { group: 1 });
    r.fill(t.poly([-1.2, 1.6, -0.6, 5.6, 1.4, 1.8]), h(FM.fire), { group: 1 });
    r.fill(t.poly([-3.2, 1.4, -3.6, 5, -1.6, 1.8]), h(FM.deep), { group: 1 });
    r.fill(t.ell(0.4, 0, 3, 2.4), h(FM.fire), { group: 1 });
    r.fill(t.poly([1.8, -1.2, 5, -0.4, 1.8, 1]), h(FM.fire), { group: 1 });
    r.fill(t.ell(1, -0.2, 1.4, 1.1), h(FM.hot), { group: 1 });
  },
};

const lantern: SkinArt = {
  mats: {
    // Stock names: the familiar's light and the wisp shots, in fox blue.
    lantern: shiny(BLACK), wisp: glow(FOX[2]), wispHot: glow(0xf0ffff),
    'k.paper': { base: 0xfff4e0, ramp: [0xc8a888, 0xe8d4b8, 0xfff4e0, 0xfffaf0, 0xffffff], tex: (_x, y) => (wrap(y, 2.2) < 0.6 ? -1 : 0) },
    'k.lacq': shiny(BLACK), 'k.verm': plain(VERMILION), 'k.gold': shiny(GOLD), 'k.fire': glow(FOX[2]), 'k.hot': glow(0xf0ffff),
  },
  glow: [0xc8f4ff, 0x2a5ae0],
  icon(r, t, m) {
    // A paper chochin with a vermilion fox crest, two fox flames drifting beside it.
    flameTongue(r, t, -10, -6, 1.4, 4.6, -0.8, m('k.fire'), m('k.hot'), 1);
    flameTongue(r, t, 10, 1, 1.2, 3.6, 0.8, m('k.fire'), m('k.hot'), 1);
    r.fill(t.cap(0, 10.4, 0, 13, 0.7), m('k.lacq'), { group: 2 });
    const paper = t.ell(0, 0, 7.4, 8.6);
    r.fill(paper, m('k.paper'), { group: 3, bevel: 3.5, local: t });
    for (const y of [5.6, -5.6]) r.fill(intersect(paper, t.rect(0, y, 9, 0.8)), m('k.verm'), { group: 3, flat: 2, noLine: true });
    r.fill(t.rect(0, 8.8, 4.6, 1.4), m('k.lacq'), { group: 4, bevel: 1 });
    r.fill(t.rect(0, -8.8, 4.6, 1.4), m('k.lacq'), { group: 4, bevel: 1 });
    // Fox crest: a narrow face with two tall ears.
    r.fill(union(t.poly([-2.6, 1.6, 0, -3.4, 2.6, 1.6]), t.poly([-2.6, 1.6, -2.4, 4.4, -0.8, 1.8]), t.poly([2.6, 1.6, 2.4, 4.4, 0.8, 1.8])), m('k.verm'), { group: 5, flat: 2 });
    r.dot(t.x(-1, 0.6), t.y(-1, 0.6), m('k.gold'), 4, 5);
    r.dot(t.x(1, 0.6), t.y(1, 0.6), m('k.gold'), 4, 5);
  },
  proj: { lantern: lanternProj, wisp: wispProj },
};

function kitsuneMask(): SkinArt {
  // A white fox mask worn tilted on the side of the head, its eyes lit with foxfire; a vermilion cord streams behind.
  return {
    head: () => ({
      mats: {
        'h.cord': material({ base: VERMILION }), 'h.gold': material({ base: GOLD, shiny: true, step: 0.15 }),
        'h.mask': material({ base: WHITE, shiny: true, step: 0.12 }), 'h.mark': material({ base: VERMILION }),
        'h.nose': material({ base: BLACK }), 'h.eye': foxfire(1, 4), 'h.fire': foxfire(1, 4), 'h.hot': material({ base: 0xf0ffff, glow: true }),
      },
      draw(r, H, m, g, sway) {
        const s = sway * 2, ph = r.phase % 4;
        const flut = [0, 0.6, 1, 0.5][ph];
        // Cord tails behind, ending in gold tassels.
        r.fill(H.poly([-6.2, 2.4, -11 - s, 1 + flut, -10.4 - s, -0.2 + flut, -6.4, 0.9]), m('h.cord'), { group: g, bevel: 1 });
        r.fill(H.poly([-6.2, 1.6, -9.6 - s, -3 - flut * 0.6, -8.6 - s, -3.8 - flut * 0.6, -6, 0.4]), m('h.cord'), { group: g, bevel: 1, toneBias: -1 });
        r.dot(H.x(-11 - s, 0.4 + flut), H.y(-11 - s, 0.4 + flut), m('h.gold'), 4, g);
        r.dot(H.x(-9.2 - s, -3.6 - flut * 0.6), H.y(-9.2 - s, -3.6 - flut * 0.6), m('h.gold'), 3, g);
        r.fill(H.cap(-6.6, 1.8, 6.6, 3, 0.7), m('h.cord'), { group: g, bevel: 1 });
        // The mask, tipped back on the crown, facing out.
        const F = new Xf(H.x(-1.4, 5.8), H.y(-1.4, 5.8), H.ang + 0.32, H.sx, H.sy);
        const face = union(
          F.ell(0, 0.4, 2.8, 2.4),
          F.poly([-2.2, -0.6, 0, -4.6, 2.2, -0.6]),
          F.poly([-2.8, 0.6, -3, 5, -0.8, 2]),
          F.poly([2.8, 0.6, 3, 5, 0.8, 2]),
        );
        r.fill(face, m('h.mask'), { group: g, bevel: 1.8 });
        r.fill(union(F.poly([-2.4, 1.6, -2.6, 4, -1.4, 2.2]), F.poly([2.4, 1.6, 2.6, 4, 1.4, 2.2])), m('h.mark'), { group: g, flat: 2, noLine: true });
        r.line(F.x(-2.2, 0.2), F.y(-2.2, 0.2), F.x(-0.8, -0.4), F.y(-0.8, -0.4), m('h.eye'), 3, g);
        r.line(F.x(2.2, 0.2), F.y(2.2, 0.2), F.x(0.8, -0.4), F.y(0.8, -0.4), m('h.eye'), 3, g);
        r.dot(F.x(0, 1.6), F.y(0, 1.6), m('h.mark'), 2, g);
        r.dot(F.x(0, -4), F.y(0, -4), m('h.nose'), 1, g);
        // A wisp of foxfire drifting by the ear.
        const bob = [0, 0.5, 0.8, 0.4][ph];
        flameTongue(r, H, -7.4, 6.4 + bob, 0.9, [2.4, 3, 2, 2.8][ph], ph % 2 ? 0.5 : -0.5, m('h.fire'), m('h.hot'), g);
      },
    }),
    ...FX,
  };
}

function nineTails(): SkinArt {
  // A white haori with a vermilion obi; behind it nine fox tails fan out, swaying out of step, tips lit with foxfire.
  return {
    mats: {
      cloak: plain(WHITE, lattice(3, -1)), cloakTrim: shiny(VERMILION, undefined, 0.13),
      'k.obi': shiny(VERMILION, (x) => (wrap(x, 3) < 0.5 ? -1 : 0), 0.13), 'k.gold': shiny(GOLD),
      'k.fur': { base: 0xf6f2ea, ramp: [0x9a8e8a, 0xc8bcb4, 0xe8e0d6, 0xf6f2ea, 0xffffff], tex: (x, y) => (wrap(Math.floor(x * 0.8 - y * 0.6), 3) === 0 ? -1 : 0) },
      'k.tip': { base: FOX[3], glow: true, ramp: FOX, tex: (x, y, ph) => (wrap(x + y - ph * 1.5, 6) < 1.4 ? 1 : 0) },
    },
    chest: {
      torso: 'cloak', cape: null, hood: null, belt: 'k.obi',
      back(r, T, m, c) {
        const s = c.sway * 0.25;
        const rx = -2.2, ry = 3;
        // Far tails first (darker), the nearest last.
        for (const i of [0, 8, 1, 7, 2, 6, 3, 5, 4]) {
          const a = Math.PI * 0.42 + i * (Math.PI * 0.66 / 8) + Math.sin(r.phase * Q + i * 1.3) * 0.07 + s;
          const L = 19 - Math.abs(i - 4) * 0.8;
          const dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
          const pt = (u: number): [number, number] => {
            const curl = u * u * 3;
            return [rx + dx * u * L + px * curl, ry + dy * u * L + py * curl];
          };
          const bias = i % 2 ? -1 : 0;
          const parts: Shape[] = [];
          const us = [0, 0.3, 0.55, 0.78];
          const ws = [0.8, 2, 2.3, 1.7];
          for (let k = 1; k < us.length; k++) {
            const [ax, ay] = pt(us[k - 1]), [bx, by] = pt(us[k]);
            parts.push(T.cap(ax, ay, bx, by, ws[k - 1], ws[k]));
          }
          // Each tail its own outline group, so they read as nine and not one mass.
          const tg = 40 + i;
          r.fill(union(...parts), m('k.fur'), { group: tg, bevel: 2, toneBias: bias, local: T });
          const [ax, ay] = pt(0.74), [bx, by] = pt(1);
          r.fill(T.cap(ax, ay, bx, by, 1.8, 0.5), m('k.tip'), { group: tg, local: T });
        }
      },
      over(r, T, m, c) {
        // Vermilion lapels down the front and a gold cord knot on the obi.
        const x = c.body.chestPush * 0.7 + 1.2, top = c.top;
        r.line(T.x(x - 1.6, top + 0.4), T.y(x - 1.6, top + 0.4), T.x(x + 1.4, 3.4), T.y(x + 1.4, 3.4), m('cloakTrim'), 2, c.g);
        r.dot(T.x(c.body.waistW + 0.2, 2.6), T.y(c.body.waistW + 0.2, 2.6), m('k.gold'), 4, c.g);
        r.dot(T.x(c.body.waistW - 0.4, 1.4), T.y(c.body.waistW - 0.4, 1.4), m('k.gold'), 3, c.g);
      },
    },
    ...FX,
  };
}

function geta(): SkinArt {
  // White tabi under vermilion lacquer shin guards, black geta soles, and foxfire circling the ankles.
  const tabi: Tex = (x) => (wrap(x, 2.2) < 0.4 ? -1 : 0);
  return {
    mats: {
      boot: plain(WHITE, tabi), bootDark: shiny(VERMILION, undefined, 0.13),
      'k.lacq': shiny(BLACK), 'k.verm': shiny(VERMILION, undefined, 0.14), 'k.gold': shiny(GOLD),
      'k.fire': { base: FOX[2], glow: true, ramp: FOX }, 'k.hot': glow(0xf0ffff),
    },
    boots: {
      height: 0.5,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        r.fill(foot.cap(-1.4, -1.7, c.toe - 0.2, -1.5, 0.6), m('k.lacq'), { ...o, bevel: 0.6 });
        r.line(foot.x(0.6, 0.6), foot.y(0.6, 0.6), foot.x(c.toe - 1.2, -0.2), foot.y(c.toe - 1.2, -0.2), m('k.verm'), 2, c.g);
        // Shin guard: a lacquered plate on the front of the shin, gold-edged.
        const top = c.top + 2.4;
        r.fill(shin.poly([2, -c.w * 0.1, top, 0, top + 0.6, c.w + 0.8, 2, c.w + 0.6]), m('k.verm'), { ...o, bevel: 1 });
        r.line(shin.x(top + 0.2, 0.2), shin.y(top + 0.2, 0.2), shin.x(top + 0.6, c.w + 0.6), shin.y(top + 0.6, c.w + 0.6), m('k.gold'), 3, c.g);
        r.dot(shin.x((top + 2) / 2, c.w * 0.5), shin.y((top + 2) / 2, c.w * 0.5), m('k.gold'), 4, c.g);
        if (c.far) return;
        // A flame circling the ankle: in front on two frames, behind the leg on the others.
        const a = r.phase * Q + 0.4;
        if (Math.sin(a) > -0.2) {
          const y = Math.cos(a) * (c.w + 1.8);
          flameTongue(r, new Xf(shin.x(1.4, y), shin.y(1.4, y), 0), 0, 0, 0.8, 2.4 + (r.phase % 2) * 0.8, 0.3, m('k.fire'), m('k.hot'), c.g);
        }
      },
    },
    ...FX,
  };
}

function hakama(): SkinArt {
  // Wide vermilion shrine hakama hanging in pleats past the knee, white showing at the side slit,
  // a gold cord knotted at the hip with swinging tassels, and a foxfire flame burning on the hem.
  const pleats: Tex = (_x, y) => (wrap(y, 2.4) < 0.55 ? -1 : 0);
  return {
    mats: {
      'l.hak': plain(VERMILION, (x) => (wrap(x, 3) < 0.45 ? -1 : 0)),
      'l.pleat': plain(VERMILION, pleats),
      'l.white': plain(WHITE), 'l.gold': shiny(GOLD), 'l.cord': shiny(GOLD, (x, y) => (wrap(x + y, 1.6) < 0.5 ? -1 : 0)),
      'l.fire': { base: FOX[2], glow: true, ramp: FOX, tex: (x, y, ph) => (wrap(x + y * 0.5 - ph * 1.5, 5) < 1.4 ? 1 : 0) }, 'l.hot': glow(0xf0ffff),
    },
    legs: {
      mat: 'l.hak', trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0.3,
      over(r, t, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const L = c.len, w = c.w, ph = r.phase % 4;
        // The cloth hangs: a frame from the hip that follows the thigh only a little (x up, y to the front).
        const d = Math.atan2(Math.sin(t.ang - Math.PI / 2), Math.cos(t.ang - Math.PI / 2));
        const K = new Xf(t.x(L, 0), t.y(L, 0), Math.abs(d) < 1.3 ? Math.PI / 2 + d * 0.45 : t.ang, 1, -1);
        const kx = K.ix(t.ox, t.oy), ky = K.iy(t.ox, t.oy);
        // Wide legs flaring past the knee; the hem swings a step behind the body.
        const sw = [0, 0.5, 0.8, 0.3][ph];
        const hem = kx - 3.2;
        const front = Math.max(w + 1.6, ky + w + 1) + sw, back = Math.min(-w - 1.6, ky - w - 1) + sw * 0.6;
        const leg = K.poly([1.4, -w - 0.4, 1.4, w + 0.6, hem + 0.6, front, hem, back]);
        r.fill(leg, m('l.pleat'), { ...o, bevel: 1.8, local: K });
        // A darker band at the hem.
        r.fill(intersect(leg, K.poly([hem + 1.6, front + 2, hem + 1, back - 2, hem - 1, back - 2, hem - 0.4, front + 2])), m('l.pleat'), { ...o, toneBias: c.bias - 1, bevel: 1, noLine: true, local: K });
        if (c.far) return;
        // White kimono showing through the side slit at the hip.
        r.fill(K.poly([-1.6, -w * 0.1, -L * 0.55, -w * 0.4, -1.6, -w + 0.4]), m('l.white'), { ...o, bevel: 0.8, noLine: true });
        // A gold cord knotted at the front of the hip, its two tassels swinging.
        const kxp = -2.8, kyp = w * 0.7;
        for (const [dx, len] of [[-0.5, 3.8], [0.7, 2.8]] as const) {
          const ty = kyp + dx + sw * 0.8, tx = kxp - len;
          r.line(K.x(kxp, kyp), K.y(kxp, kyp), K.x(tx, ty), K.y(tx, ty), m('l.cord'), 2, c.g);
          r.fill(K.cap(tx, ty, tx - 1.2, ty + sw * 0.3, 0.6, 0.45), m('l.gold'), { ...o, bevel: 0.6 });
        }
        r.fill(K.circ(kxp, kyp, 0.95), m('l.cord'), { ...o, bevel: 0.6 });
        // A foxfire flame on the hem, flickering taller and shorter.
        const fx = hem + 2.4, fy = (front + back) * 0.5 - 0.2;
        flameTongue(r, new Xf(K.x(fx, fy), K.y(fx, fy), 0), 0, 0, 1.3, [3.2, 4, 3, 3.8][ph], ph % 2 ? 0.4 : -0.3, m('l.fire'), m('l.hot'), c.g);
      },
    },
    ...FX,
  };
}

export const FOXFIRE: Record<string, SkinArt> = {
  'katana.kitsunebi': { weapon: kitsunebi, ...FX },
  'frost_wand.gohei': { weapon: gohei, ...FX },
  'wisp_lantern.foxfire': lantern,
  'duelist_band.kitsune': kitsuneMask(),
  'phase_cloak.ninetails': nineTails(),
  'leather_boots.geta': geta(),
  'leather_leggings.hakama': hakama(),
};
