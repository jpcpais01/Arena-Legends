import { material, type Tex } from '../../pixel/raster';
import { union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { hairCap } from '../draw';
import { fillAll, M, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt } from './index';
import { epicFx, glow, mats, plain, Q, shiny, wrap } from './kit';

/**
 * Epic set: Wildwood. Living elder wood and emerald, leaves and blossoms
 * growing out of every piece, sap glowing in its veins and fireflies drifting
 * around it.
 */

const BARK = 0x6a4a2e, LEAF = 0x4aa83a, EMERALD = 0x2ec27a, BLOSSOM = 0xf6a8c8, FIREFLY = 0xfff07a;

/** Bark: dark furrows running along the part. */
const bark: Tex = (x, y) => (Math.sin(y * 2.6 + Math.sin(x * 0.45) * 1.6) > 0.55 ? -1 : 0);
/** Sap rising through a part, one step per frame. */
const sap = (speed = 1.5, period = 7): Tex => (x, _y, ph) => (wrap(x - ph * speed, period) < 1.6 ? 1 : 0);
/** Leaf veins: a midrib and side veins (in a leaf's own frame, x along it). */
const veins: Tex = (x, y) => (Math.abs(y) < 0.35 || wrap(x - Math.abs(y) * 1.2, 2.2) < 0.45 ? -1 : 0);

const FX = epicFx(FIREFLY, EMERALD, 'twinkle', 0xc8ffd8);

/** A leaf from (x, y) in frame F pointing along angle `a`, `l` long. */
function leaf(F: Xf, x: number, y: number, a: number, l: number, w = 0.42): Shape {
  const c = Math.cos(a), s = Math.sin(a);
  const p = (u: number, v: number): [number, number] => [x + c * u - s * v, y + s * u + c * v];
  return F.poly([...p(0, 0), ...p(l * 0.35, l * w), ...p(l * 0.75, l * w * 0.7), ...p(l, 0), ...p(l * 0.75, -l * w * 0.7), ...p(l * 0.35, -l * w)]);
}

/** A five-petal blossom at (x, y) in frame F. */
function blossom(F: Xf, x: number, y: number, r: number): Shape {
  const ps: Shape[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    ps.push(F.circ(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.85));
  }
  return union(...ps);
}

function elderheart(): WeaponArt {
  // An emerald blade with glowing sap up its core, a crossguard of living branches in leaf and bloom,
  // an ivy vine climbing the blade, an acorn pommel, and two fireflies circling the tip.
  const facets: Tex = (x, y, ph) => (wrap(x - ph * 2, 9) < 1.2 ? 1 : y > 0.3 ? 1 : y < -0.6 ? -1 : 0);
  return {
    tip: 31,
    mats: {
      blade: material({ base: 0x5ad8a0, shiny: true, step: 0.15, tex: facets }),
      sap: material({ base: 0xb8ffd8, glow: true, tex: sap(2, 9) }),
      wood: material({ base: BARK, tex: bark }), vine: material({ base: 0x2e6a2a }),
      leaf: material({ base: LEAF, tex: veins }), bloom: material({ base: BLOSSOM, shiny: true, step: 0.13 }),
      gold: material({ base: 0xe8c050, shiny: true }), seed: material({ base: EMERALD, shiny: true, step: 0.16 }),
      fly: M.glow(FIREFLY),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-5.6, 0, -1, 0, 1.3, 1.1)], m('wood'), o, 1);
      r.line(t.x(-5, -1), t.y(-5, -1), t.x(-3.4, 1), t.y(-3.4, 1), m('vine'), 2, g);
      r.line(t.x(-3, -1), t.y(-3, -1), t.x(-1.4, 1), t.y(-1.4, 1), m('vine'), 2, g);
      // Acorn pommel: a gold cap over an emerald nut.
      fillAll(r, [t.ell(-7.4, 0, 1.6, 1.4)], m('seed'), o, 1);
      fillAll(r, [t.ell(-6.2, 0, 0.9, 1.7)], m('gold'), o, 0.8);
      const blade = t.poly([2, -1.7, 26.2, -1.5, 31, 0, 26.2, 1.5, 2, 1.7]);
      fillAll(r, [blade], m('blade'), o, 1.4);
      r.fill(t.poly([3, -0.45, 24.5, -0.3, 27, 0, 24.5, 0.3, 3, 0.45]), m('sap'), { group: g, noLine: true, local: o.local });
      // Ivy climbing the blade.
      for (let x = 3; x < 13; x += 1) {
        const y = Math.sin(x * 0.9) * 1.6;
        r.dot(t.x(x, y), t.y(x, y), m('vine'), 2, g);
      }
      for (const [x, s] of [[5, 1], [8.6, -1], [12, 1]]) r.fill(leaf(t, x, Math.sin(x * 0.9) * 1.6, s * 1.1, 2.4), m('leaf'), { group: g, bevel: 0.8, local: o.local });
      // Branch crossguard curling toward the blade, a leaf at each end and a blossom at the heart.
      for (const s of [-1, 1]) {
        fillAll(r, [t.cap(1, 0, 1.6, s * 2.8, 0.75, 0.65), t.cap(1.6, s * 2.8, 3.4, s * 4.4, 0.65, 0.4)], m('wood'), o, 1);
        r.fill(leaf(t, 3.2, s * 4.4, s * 0.4, 3), m('leaf'), { group: g, bevel: 0.8, local: o.local });
      }
      r.fill(blossom(t, 1, 0, 0.9), m('bloom'), { group: g, bevel: 0.8 });
      r.dot(t.x(1, 0), t.y(1, 0), m('gold'), 4, g);
      // Two fireflies orbit near the tip: a quarter turn per frame, half a turn apart.
      for (let k = 0; k < 2; k++) {
        const a = r.phase * Q + k * Math.PI;
        r.dot(t.x(27 + Math.cos(a) * 2.6, Math.sin(a) * 3.2), t.y(27 + Math.cos(a) * 2.6, Math.sin(a) * 3.2), m('fly'), 3, g);
      }
    },
  };
}

function wildHunt(): WeaponArt {
  // A horn of pale antler wrapped in ivy, tines branching off the bell, a blossom on its band.
  return {
    tip: 10,
    mats: {
      horn: material({ base: 0xe8dcc0, shiny: true, step: 0.13, tex: (x) => (wrap(x, 2.2) < 0.4 ? -1 : 0) }),
      band: material({ base: 0x3a8a3a, tex: veins }), mouth: M.darkWood(),
      leaf: material({ base: LEAF, tex: veins }), bloom: material({ base: BLOSSOM, shiny: true, step: 0.13 }),
      gem: material({ base: EMERALD, glow: true, tex: (_x, _y, ph) => (ph % 2 ? 1 : 0) }), fly: M.glow(FIREFLY),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      const pts: Shape[] = [];
      let px = -1.5, py = 0;
      for (let i = 1; i <= 6; i++) {
        const u = i / 6;
        const nx = -1.5 + u * 10.5, ny = u * u * 3.5;
        pts.push(t.cap(px, py, nx, ny, 0.8 + u * 1.6));
        px = nx; py = ny;
      }
      // Antler tines off the bell, behind the horn.
      fillAll(r, [t.cap(6.6, 3.4, 5.4, 7.2, 0.55, 0.3), t.cap(8.4, 4.6, 9.6, 8, 0.5, 0.3), t.cap(5.8, 5.6, 4, 6.4, 0.4, 0.25)], m('horn'), o, 0.8);
      fillAll(r, [union(...pts)], m('horn'), o, 1.6);
      fillAll(r, [t.rect(3, 0.5, 0.8, 1.9), t.rect(7, 1.8, 0.8, 2.3)], m('band'), o, 1);
      r.fill(t.ell(9.2, 3.6, 0.9, 2.1, 0.5), m('mouth'), { group: g, flat: 1, noLine: true });
      r.fill(leaf(t, 3, -1.2, -0.9, 2.6), m('leaf'), { group: g, bevel: 0.8, local: o.local });
      r.fill(leaf(t, 7.4, -0.2, -0.5, 2.4), m('leaf'), { group: g, bevel: 0.8, local: o.local });
      r.fill(blossom(t, 3, 2.2, 0.75), m('bloom'), { group: g, bevel: 0.8 });
      r.dot(t.x(7, 1.8), t.y(7, 1.8), m('gem'), 3, g);
      const a = r.phase * Q;
      r.dot(t.x(4 + Math.cos(a) * 3, 5.6 + Math.sin(a) * 1.6), t.y(4 + Math.cos(a) * 3, 5.6 + Math.sin(a) * 1.6), m('fly'), 3, g);
    },
  };
}

// Battle sprite (its own materials).
const WM = mats({
  spirit: { base: 0x7af0a8, glow: true, ramp: [0x1a6a3a, 0x2e9a5a, 0x5ad88a, 0xa8ffc8, 0xf0fff4], tex: (x) => (wrap(x, 2.4) < 0.5 ? -1 : 0) },
  hot: { base: 0xf0fff4, glow: true },
  wood: { base: 0xa8e8b8, glow: true },
});

const spiritBlade: ProjArt = {
  frames: 2,
  draw(r, t, f, h) {
    // A great spectral leaf for a blade, its midrib bright, on a hilt of glowing branches.
    const w = f ? 0.2 : 0;
    r.fill(t.poly([0, -2.2 - w, 8, -3.6 - w, 18, -3.4 - w, 25, -2 - w, 30, 0, 25, 2 + w, 18, 3.4 + w, 8, 3.6 + w, 0, 2.2 + w]), h(WM.spirit), { group: 1, local: t });
    r.line(t.x(1, 0), t.y(1, 0), t.x(28, 0), t.y(28, 0), h(WM.hot), 3, 1);
    for (let x = 5; x < 25; x += 4.5) {
      r.line(t.x(x, 0), t.y(x, 0), t.x(x + 2.6, 2.4), t.y(x + 2.6, 2.4), h(WM.hot), 2, 1);
      r.line(t.x(x, 0), t.y(x, 0), t.x(x + 2.6, -2.4), t.y(x + 2.6, -2.4), h(WM.hot), 2, 1);
    }
    r.fill(union(t.cap(-1, 0, -1.6, 4.2, 0.7, 0.4), t.cap(-1, 0, -1.6, -4.2, 0.7, 0.4)), h(WM.wood), { group: 1 });
    r.fill(t.cap(-7.4, 0, -1, 0, 1.2), h(WM.wood), { group: 1 });
    r.fill(t.circ(-8, 0, 1.5), h(WM.hot), { group: 1 });
  },
};

const dryad: SkinArt = {
  mats: {
    // Stock names, for the battle trail colours and anything drawn the stock way.
    phantom: glow(0x7af0a8), phantomHot: glow(0xf0fff4),
    'k.leaf': { base: 0x5ad88a, glow: true, ramp: [0x1a6a3a, 0x2e9a5a, 0x5ad88a, 0xa8ffc8, 0xf0fff4], tex: veins },
    'k.hot': glow(0xf0fff4), 'k.wood': plain(BARK, bark), 'k.bloom': shiny(BLOSSOM, undefined, 0.13), 'k.fly': glow(FIREFLY),
  },
  glow: [0xd8ffc8, 0x2e9a5a],
  icon(r, t, m) {
    const b = new Xf(t.x(-9, -9), t.y(-9, -9), Math.PI / 4);
    r.fill(b.poly([0, -2.4, 7, -4, 16, -3.8, 22, -2.2, 27, 0, 22, 2.2, 16, 3.8, 7, 4, 0, 2.4]), m('k.leaf'), { group: 1, local: b });
    r.line(b.x(1, 0), b.y(1, 0), b.x(25, 0), b.y(25, 0), m('k.hot'), 3, 1);
    r.fill(union(b.cap(-1, 0, -1.6, 4.4, 0.8, 0.5), b.cap(-1, 0, -1.6, -4.4, 0.8, 0.5), b.cap(-6.4, 0, -1, 0, 1.3)), m('k.wood'), { group: 2, bevel: 1 });
    r.fill(blossom(b, -1, 0, 0.9), m('k.bloom'), { group: 3, bevel: 0.8 });
    r.dot(t.x(8, 2), t.y(8, 2), m('k.fly'), 3, 4);
    r.dot(t.x(-4, 9), t.y(-4, 9), m('k.fly'), 3, 4);
  },
  proj: { phantom: spiritBlade },
};

function stagHood(): SkinArt {
  // A leaf-green hood thrown over the head, the face left open, and a stag's antlers rising through it,
  // hung with leaves and blossoms, a firefly circling the tines.
  const leafy: Tex = (x, y) => (hash(Math.floor(x * 0.8 + y * 0.4), Math.floor(y * 0.9)) < 0.22 ? 1 : wrap(Math.floor(x + y * 1.3), 3) === 0 ? -1 : 0);
  return {
    head: () => ({
      mats: {
        'h.hood': material({ base: 0x3a7a32, tex: leafy }), 'h.trim': material({ base: 0xe8c050, shiny: true }),
        'h.antler': material({ base: 0xd8c8a8, shiny: true, step: 0.13 }), 'h.leaf': material({ base: LEAF, tex: veins }),
        'h.bloom': material({ base: BLOSSOM, shiny: true, step: 0.13 }), 'h.fly': material({ base: FIREFLY, glow: true }),
        'h.gem': material({ base: EMERALD, glow: true, tex: (_x, _y, ph) => (ph % 2 ? 1 : 0) }),
      },
      draw(r, H, m, g, sway) {
        const s = sway * 1.2;
        const antler = (dx: number, bias: number) => {
          const o = { group: g, bevel: 0.9, toneBias: bias };
          r.fill(union(
            H.cap(0.4 + dx, 6, -1.4 + dx, 10.4, 0.85, 0.6),
            H.cap(-1.4 + dx, 10.4, -4.6 + dx, 13.6, 0.6, 0.35),
            H.cap(-0.8 + dx, 9, 2.4 + dx, 12.4, 0.5, 0.3),
            H.cap(-2.8 + dx, 12, -2.2 + dx, 15.4, 0.45, 0.25),
            H.cap(-1.2 + dx, 7.8, -4.6 + dx, 9.6, 0.45, 0.25),
          ), m('h.antler'), o);
        };
        antler(-2.2, -1);
        // The hood: over the crown and down the back to the shoulders, a gold-leaf rim around the face.
        const hood = union(hairCap(H, 2.6, -2.2, 1.7), H.poly([-6.8, 3.4, -9.2 - s, -3, -8.8 - s, -9.4, -4.6, -9.6, -3, -4, -2.4, 0]));
        r.fill(hood, m('h.hood'), { group: g, bevel: 2.8, softLight: true, local: H });
        r.fill(H.cap(-2.6, -1.6, 2.2, 6.4, 0.55, 0.5), m('h.trim'), { group: g, bevel: 0.6 });
        r.fill(H.cap(2.2, 6.4, 6.6, 3.4, 0.5, 0.5), m('h.trim'), { group: g, bevel: 0.6 });
        r.dot(H.x(4.6, 5.2), H.y(4.6, 5.2), m('h.gem'), 3, g);
        antler(0, 0);
        r.fill(leaf(H, -1.4, 10.4, 2.6, 2.6), m('h.leaf'), { group: g, bevel: 0.8, local: H });
        r.fill(leaf(H, 0.6, 7.6, 0.2, 2.4), m('h.leaf'), { group: g, bevel: 0.8, local: H });
        r.fill(blossom(H, -0.8, 9, 0.7), m('h.bloom'), { group: g, bevel: 0.6 });
        const a = r.phase * Q;
        r.dot(H.x(-1.8 + Math.cos(a) * 4, 13 + Math.sin(a) * 1.4), H.y(-1.8 + Math.cos(a) * 4, 13 + Math.sin(a) * 1.4), m('h.fly'), 3, g);
      },
    }),
    ...FX,
  };
}

function mantle(): SkinArt {
  // Bark plates bound with vines, a cloak of leaves that ripples behind, sprouting pauldrons and an emerald at the heart.
  return {
    mats: {
      jerkin: plain(BARK, bark), jerkinDark: plain(0x3a2618),
      'k.leaf': { base: LEAF, tex: veins }, 'k.leafD': { base: 0x2e7a2e, tex: veins }, 'k.bloom': shiny(BLOSSOM, undefined, 0.13),
      'k.moss': plain(0x5a8a32, (x, y) => (hash(Math.floor(x * 2), Math.floor(y * 2)) < 0.3 ? 1 : 0)), 'k.bark': plain(0x5a3c24, bark),
      'k.gem': { base: EMERALD, glow: true, ramp: [0x0e5a3a, 0x1a8a52, EMERALD, 0x8affc0, 0xf0fff4], tex: (_x, y, ph) => (wrap(Math.floor(y * 2) + ph, 4) === 0 ? 1 : 0) },
      'k.vine': plain(0x2e6a2a),
    },
    chest: {
      back(r, T, m, c) {
        // Leaves layered in rows down the back, each row swaying a beat behind the one above.
        const top = c.top;
        for (let row = 0; row < 4; row++) {
          const y = top - 1 - row * 4.2;
          const sw = (c.sway * 2 + Math.sin(r.phase * Q - row * 0.9) * 0.35) * (row + 1) * 0.5;
          for (let k = 0; k < 3; k++) {
            const x = -2.6 - k * 2.4 - row * 0.6 - sw;
            const mat = (row + k) % 2 ? 'k.leafD' : 'k.leaf';
            r.fill(leaf(T, x, y, -Math.PI / 2 - 0.25 - k * 0.12, 5.2, 0.38), m(mat), { group: c.g, bevel: 1, toneBias: -1, local: T });
          }
        }
        r.fill(blossom(T, -6.6 - c.sway * 2, top - 6.4, 0.8), m('k.bloom'), { group: c.g, bevel: 0.6, toneBias: -1 });
      },
      shoulder(r, S, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        r.fill(S.ell(0, 0.8, 3, 2.2), m('k.bark'), { ...o, bevel: 1.6, local: S });
        r.fill(S.ell(-0.2, 2, 2.4, 1), m('k.moss'), { ...o, bevel: 1, local: S });
        r.fill(leaf(S, -0.6, 2.4, 1.9, 3.2), m('k.leaf'), { ...o, bevel: 0.8, local: S });
        r.fill(leaf(S, 0.4, 2.6, 1.1, 2.6), m('k.leafD'), { ...o, bevel: 0.8, local: S });
      },
      over(r, T, m, c) {
        // A moss collar, a vine across the chest and the emerald heart.
        const b = c.body, top = c.top;
        r.fill(T.ell(b.chestPush * 0.35, top + 0.4, 4.4, 1.6), m('k.moss'), { group: c.g, bevel: 1.2 });
        const x = b.chestPush * 0.7 + 1.4, y = top - 4.4;
        r.line(T.x(x - 4, top - 1), T.y(x - 4, top - 1), T.x(x + 1, 2.6), T.y(x + 1, 2.6), m('k.vine'), 2, c.g);
        r.fill(T.poly([x, y + 1.6, x + 1.2, y, x, y - 1.6, x - 1.2, y]), m('k.gem'), { group: c.g, bevel: 0.8, local: T });
        r.fill(leaf(T, x - 1, y - 0.4, Math.PI + 0.5, 2.2), m('k.leaf'), { group: c.g, bevel: 0.6, local: T });
      },
    },
    ...FX,
  };
}

function rootwalkers(): SkinArt {
  // Bark boots with roots reaching into the ground, a sprout swaying at the cuff and a glowing rune.
  return {
    mats: {
      zephyr: plain(BARK, bark), zephyrTrim: plain(0x5a8a32, (x, y) => (hash(Math.floor(x * 2), Math.floor(y * 2)) < 0.3 ? 1 : 0)),
      'k.root': plain(0x4a3220), 'k.leaf': { base: LEAF, tex: veins }, 'k.rune': glow(0x8affc0, sap(1, 4)),
    },
    boots: {
      wing: null,
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        // Roots splaying off the toe and heel.
        r.fill(union(foot.cap(c.toe - 0.6, -1.2, c.toe + 1.6, -2.2, 0.5, 0.25), foot.cap(-1, -1.4, -2.8, -2.2, 0.5, 0.25), foot.cap(c.toe * 0.4, -1.6, c.toe * 0.5, -2.6, 0.4, 0.2)), m('k.root'), { ...o, bevel: 0.6 });
        r.dot(shin.x(c.top * 0.5, c.w * 0.4), shin.y(c.top * 0.5, c.w * 0.4), m('k.rune'), 3, c.g);
        if (c.far) return;
        const sw = [0, 0.25, 0.4, 0.2][r.phase % 4];
        r.fill(leaf(shin, c.top + 0.2, c.w - 0.4, 0.5 + sw, 2.8), m('k.leaf'), { ...o, bevel: 0.8, local: shin });
        r.fill(leaf(shin, c.top + 0.2, c.w - 0.4, 1.5 + sw, 2.2), m('k.leaf'), { ...o, bevel: 0.8, local: shin });
      },
    },
    ...FX,
  };
}

export const WILDWOOD: Record<string, SkinArt> = {
  'longsword.elderheart': { weapon: elderheart, ...FX },
  'war_horn.wildhunt': { weapon: wildHunt, ...FX },
  'phantom_blade.dryad': dryad,
  'executioner_hood.stag': stagHood(),
  'leather_jerkin.wildwood': mantle(),
  'zephyr_boots.rootwalkers': rootwalkers(),
};
