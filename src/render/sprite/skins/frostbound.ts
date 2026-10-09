import { css } from '../../pixel/color';
import { material, type Raster, type Tex } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { ring, type Layer } from '../../auraKit';
import { hairCap } from '../draw';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, glow, mats, plain, Q, shiny, wrap } from './kit';

/**
 * Epic set: Frostbound Jarl. A northern warlord's gear: dark iron gone white
 * with rime, thick white fur, glacier ice growing out of it all, hail runes
 * pulsing with cold light and snow on the wind.
 */

/** Rimed iron: dark blue-grey steel whose top tone is hoarfrost. */
const IRON = [0x34404c, 0x52616e, 0x7a8b9a, 0xa4b6c4, 0xdcf0f8];
/** Darker iron for straps, bosses and gauntlets. */
const IRON_DK = [0x1a2028, 0x2a3440, 0x3e4c5a, 0x5a6a7a, 0xa8c4d4];
/** Glacier ice, deep blue in the shadow to white at the edge. */
const ICE = [0x2a6a9a, 0x4a9ccc, 0x6ac8f0, 0xbff4ff, 0xffffff];
/** White fur, warm grey in the shadow. */
const FUR = [0x86847e, 0xb2aea4, 0xd6d2c8, 0xf0eee6, 0xffffff];
/** Hail-rune light. */
const RUNE = [0x1a5a7a, 0x2a9ac0, 0x5ad8f0, 0x9af8ff, 0xf0ffff];
const LEATHER = 0x5a3a24;

/** Hoarfrost on iron: sparse frost crystals lighting up the top tone. */
const rime: Tex = (x, y) => (hash(Math.floor(x * 1.3), Math.floor(y * 1.3)) < 0.07 ? 2 : 0);
/** A lighter rime for small, busy parts. */
const rimeSoft: Tex = (x, y) => (hash(Math.floor(x), Math.floor(y) + 7) < 0.035 ? 1 : 0);
/** A glint sweeping across ice, one step per frame. */
const sweep = (period = 9, speed = 2.4): Tex => (x, y, ph) => (wrap(x * 0.8 + y * 0.6 - ph * speed, period) < 1.1 ? 2 : 0);
/** Fur: soft tufts combed in one direction. */
const tufts: Tex = (x, y) => (wrap(x * 1.2 + Math.sin(y * 1.9) * 0.7, 1.7) < 0.4 ? -1 : 0);
/** Rune light pulsing over the loop. */
const pulse: Tex = (_x, _y, ph) => [-1, 0, 1, 0][ph % 4];

const iron = (tex: Tex = rime) => material({ base: IRON[2], ramp: IRON, shiny: true, tex });
const ironDk = () => material({ base: IRON_DK[2], ramp: IRON_DK, shiny: true });
const ice = (tex: Tex = sweep()) => material({ base: ICE[2], ramp: ICE, shiny: true, tex });
const fur = () => material({ base: FUR[2], ramp: FUR, tex: tufts });
const rune = () => material({ base: RUNE[3], ramp: RUNE, glow: true, tex: pulse });

const FX = epicFx(0xf0ffff, 0x5ab0e8, 'twinkle', 0xd8f8ff);

/** Particles the full set sheds in battle. */
export const FROSTBOUND_FX: SkinFx = { spark: 0xf0ffff, spark2: 0x5ab0e8, kind: 'twinkle' };

/** An ice crystal growing from (x, y) toward angle `a`: a six-sided prism with a pointed end. */
function shard(F: Xf, x: number, y: number, a: number, len: number, w: number): Shape {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  const p = (u: number, v: number) => [x + c * u + nx * v, y + s * u + ny * v];
  return F.poly([...p(-0.4, -w * 0.8), ...p(len * 0.62, -w), ...p(len, w * 0.15), ...p(len * 0.66, w), ...p(-0.4, w * 0.8)]);
}

/** The hail rune ᚼ (a stem crossed by an X, like a snowflake) centred at (x, y), `s` half tall. */
function hailRune(r: Raster, F: Xf, x: number, y: number, s: number, mat: number, tone: number, g: number): void {
  r.line(F.x(x, y - s), F.y(x, y - s), F.x(x, y + s), F.y(x, y + s), mat, tone, g);
  const d = s * 0.6;
  r.line(F.x(x - d, y - d), F.y(x - d, y - d), F.x(x + d, y + d), F.y(x + d, y + d), mat, tone, g);
  r.line(F.x(x - d, y + d), F.y(x - d, y + d), F.x(x + d, y - d), F.y(x + d, y - d), mat, tone, g);
}

/** A lumpy roll of fur along a line from (ax, ay) to (bx, by), `n` tufts of radius `rad`. */
function furRoll(F: Xf, ax: number, ay: number, bx: number, by: number, rad: number, n: number): Shape {
  const parts: Shape[] = [F.cap(ax, ay, bx, by, rad * 0.85)];
  for (let i = 0; i <= n; i++) {
    const u = i / n, k = i % 2 ? 1.08 : 0.92;
    parts.push(F.circ(ax + (bx - ax) * u, ay + (by - ay) * u, rad * k));
  }
  return union(...parts);
}

/** A round disc as a polygon (stays round in squashed frames). */
function disc(F: Xf, cx: number, cy: number, rx: number, ry = rx, n = 16): Shape {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) pts.push(cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry);
  return F.poly(pts);
}

// -----------------------------------------------------------------------------
// Weapons
// -----------------------------------------------------------------------------

function winterfist(): WeaponArt {
  // An iron haft bound in leather with a fur collar under the head; the head is a rimed iron
  // flange split open by a cluster of glacier crystals, a glint sweeping across them and frost mist circling.
  return {
    tip: 22.4,
    mats: {
      haft: ironDk(), wrap: material({ base: LEATHER, tex: (x) => (wrap(x, 1.5) < 0.5 ? -1 : 0) }),
      fur: fur(), head: iron(), band: ironDk(), ice: ice(), rune: rune(),
      mist: material({ base: 0xe8fbff, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      fillAll(r, [t.cap(-4.6, 0, 14.6, 0, 1.2, 1.05)], m('haft'), o, 1);
      // Leather binding over the grip and a pommel of iron with an ice bead.
      fillAll(r, [t.cap(-3.4, 0, 2.4, 0, 1.35)], m('wrap'), o, 1);
      fillAll(r, [t.poly([-4.4, -1.6, -6.4, -1, -7, 0, -6.4, 1, -4.4, 1.6])], m('band'), o, 1);
      fillAll(r, [shard(t, -6.6, 0, Math.PI, 1.8, 0.7)], m('ice'), o, 0.8);
      // The fur collar under the head, a band of iron above it.
      fillAll(r, [furRoll(t, 11.6, -1.2, 11.6, 1.2, 1.5, 2)], m('fur'), o, 1.2);
      // Small crystals behind (far side), the flared iron socket, then the bouquet of crystals bursting out of it.
      fillAll(r, [shard(t, 16.4, 2.6, 1.3, 3.6, 0.8), shard(t, 16.4, -2.6, -1.3, 3.2, 0.75)], m('ice'), o, 1, -1);
      const cup = t.poly([13, -1.5, 16, -2.8, 17.4, -3.8, 18, -2.6, 18, 2.6, 17.4, 3.8, 16, 2.8, 13, 1.5]);
      fillAll(r, [cup], m('head'), o, 1.4);
      fillAll(r, [t.rect(13.5, 0, 0.5, 1.8)], m('band'), o, 0.8);
      r.line(t.x(15.4, -1.4), t.y(15.4, -1.4), t.x(15.4, 1.4), t.y(15.4, 1.4), m('rune'), [2, 3, 4, 3][ph], g);
      // The bouquet: two crystals splayed out, a long one straight up the middle, each with a bright facet.
      const bouquet: [number, number, number, number][] = [[2, 0.72, 4.6, 1.2], [-2, -0.72, 4.2, 1.1], [0, 0, 5.2, 1.6]];
      for (const [i, [y, a, len, w]] of bouquet.entries()) {
        r.fill(shard(t, 17.4, y, a, len, w), m('ice'), { group: 40 + i, bevel: 1, toneBias: o.toneBias, local: o.local });
        const c = Math.cos(a), s = Math.sin(a), off = w * 0.35;
        r.line(t.x(17.8 + c * 0.6 - s * off, y + s * 0.6 + c * off), t.y(17.8 + c * 0.6 - s * off, y + s * 0.6 + c * off), t.x(17.4 + c * len * 0.7 - s * off, y + s * len * 0.7 + c * off), t.y(17.4 + c * len * 0.7 - s * off, y + s * len * 0.7 + c * off), m('ice'), 4, 40 + i);
      }
      // Frost mist circling the head, two motes half a turn apart.
      for (let k = 0; k < 2; k++) {
        const a = ph * Q + k * Math.PI + 0.6;
        r.dot(t.x(19.4 + Math.cos(a) * 5, Math.sin(a) * 5), t.y(19.4 + Math.cos(a) * 5, Math.sin(a) * 5), m('mist'), k ? 3 : 4, g);
      }
    },
  };
}

function rimeguard(): WeaponArt {
  // A round Norse shield seen side-on: iron-rimmed planks crusted with ice, a ring of runes
  // pulsing round a rimed iron boss, an ice spike for a boss point and icicles off the lower rim.
  return {
    tip: 7.6,
    mats: {
      rim: iron(), face: material({ base: 0x45627e, ramp: [0x1e2a3a, 0x2e4258, 0x45627e, 0x6a8aa6, 0x9ab8cc], tex: (_x, y) => (wrap(y, 2.2) < 0.45 ? -1 : 0) }),
      boss: material({ base: IRON_DK[3], ramp: IRON, shiny: true, tex: rime }), ice: ice(sweep(8, 2)), rune: rune(),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4;
      // Ice crust over the rim: crystals jutting from the top and icicles under the bottom (behind the rim).
      fillAll(r, [shard(t, 1.4, 6.2, 1.8, 3, 0.9), shard(t, 2.9, 5.8, 1.2, 2.4, 0.75), shard(t, 1.8, -6.2, -1.57, 2.6, 0.6), shard(t, 3, -5.8, -1.35, 1.8, 0.5)], m('ice'), o, 0.8);
      fillAll(r, [t.ell(2.2, 0, 2.8, 6.6)], m('rim'), o, 2);
      r.fill(t.ell(2.7, 0, 2.1, 5.6), m('face'), { group: g, bevel: 3, noLine: true, toneBias: o.toneBias, local: o.local });
      // The knotwork rune ring round the boss, pulsing.
      r.fill(subtract(t.ell(3.1, 0, 1.6, 4.4), t.ell(3.25, 0, 1.05, 3.6)), m('rune'), { group: g, noLine: true });
      const tone = [3, 4, 4, 3][ph];
      for (const y of [-2.6, 2.6]) r.dot(t.x(3.4, y), t.y(3.4, y), m('rune'), tone, g);
      // The boss and its ice spike.
      fillAll(r, [t.ell(4.4, 0, 1.5, 2)], m('boss'), o, 1.4);
      r.fill(shard(t, 5.2, 0, 0, 2.6, 1.1), m('ice'), { group: 45, bevel: 1, toneBias: o.toneBias, local: o.local });
    },
  };
}

// -----------------------------------------------------------------------------
// Heart of Winter (frost core)
// -----------------------------------------------------------------------------

const FM = mats({
  ice: { base: ICE[2], ramp: ICE, shiny: true }, iceDk: { base: ICE[1], ramp: ICE, shiny: true },
  core: { base: RUNE[3], ramp: RUNE, glow: true }, hot: { base: 0xf6ffff, glow: true }, snow: { base: 0xffffff, glow: true },
});

const CORE_FRAMES = 8;

const coreProj: ProjArt = {
  frames: CORE_FRAMES,
  outline: true,
  draw(r, t0, f, h) {
    // A cluster of ice shards turning slowly round a glowing heart, snowflakes drifting off below.
    const t = new Xf(t0.ox, t0.oy, t0.ang, 1.35, 1.35);
    const spin = (f / CORE_FRAMES) * ((Math.PI * 2) / 3);
    // Shards point out from the heart in 3D: around the vertical axis at alternating heights, plus one up and one down.
    type S = { dx: number; dy: number; z: number; len: number; w: number };
    const shards: S[] = [];
    const add = (az: number, el: number, len: number, w: number) => {
      const dx = Math.cos(az) * Math.cos(el), dy = Math.sin(el), z = Math.sin(az) * Math.cos(el);
      shards.push({ dx, dy, z, len: len * Math.max(0.35, Math.hypot(dx, dy)), w });
    };
    for (let k = 0; k < 6; k++) add(spin + (k * Math.PI) / 3, k % 2 ? -0.45 : 0.4, k % 2 ? 4 : 5, k % 2 ? 0.95 : 1.15);
    add(spin * 3, 1.35, 5.4, 1.2);
    add(spin * 3 + Math.PI, -1.3, 3.6, 0.95);
    shards.sort((p, q) => p.z - q.z);
    let gi = 1;
    const fillShard = (s: S) => r.fill(shard(t, s.dx * (s.z > 0 ? 2.2 : 1.2), s.dy * (s.z > 0 ? 2.2 : 1.2), Math.atan2(s.dy, s.dx), s.len - (s.z > 0 ? 0.6 : 0), s.w), h(s.z < -0.2 ? FM.iceDk : FM.ice), { group: gi++, bevel: 0.9, toneBias: s.z < -0.4 ? -1 : 0 });
    for (const s of shards) if (s.z < 0) fillShard(s);
    // The heart: a faceted gem of light.
    r.fill(t.poly([0, 2.2, 1.7, 1, 1.7, -1, 0, -2.2, -1.7, -1, -1.7, 1]), h(FM.core), { group: gi++ });
    r.fill(t.poly([0, 1.1, 0.8, 0, 0, -1.1, -0.8, 0]), h(FM.hot), { group: gi - 1, noLine: true });
    for (const s of shards) if (s.z >= 0) fillShard(s);
    // Two snowflakes falling off it, one after the other.
    for (let k = 0; k < 2; k++) {
      const u = wrap(f + k * 4, CORE_FRAMES) / CORE_FRAMES;
      const x = (k ? 2.6 : -2.8) + Math.sin(u * 6 + k) * 0.6, y = -4.4 - u * 6;
      const px = t.x(x, y), py = t.y(x, y);
      r.dot(px, py, h(FM.snow), 3, 30);
      if (u < 0.6) { r.dot(px - 1, py, h(FM.core), 3, 30); r.dot(px + 1, py, h(FM.core), 3, 30); r.dot(px, py - 1, h(FM.core), 3, 30); r.dot(px, py + 1, h(FM.core), 3, 30); }
    }
  },
};

const heartOfWinter: SkinArt = {
  mats: {
    // Stock names: the frost core's particles and anything drawn the stock way.
    ice: shiny(0xbff4ff, undefined, 0.16), iceGlow: glow(0xf0ffff),
    'k.ice': { base: ICE[2], ramp: ICE, shiny: true }, 'k.iceDk': { base: ICE[1], ramp: ICE, shiny: true },
    'k.core': { base: RUNE[3], ramp: RUNE, glow: true }, 'k.hot': glow(0xf6ffff), 'k.ring': glow(0x5ab8e0),
    'k.iron': { base: IRON[2], ramp: IRON, shiny: true, tex: rime }, 'k.snow': glow(0xffffff),
  },
  glow: [0xe8fbff, 0x4a9ccc],
  icon(r, t, m) {
    // A burst of glacier crystals round a heart of rune light, set in a ring of rimed iron, snow drifting by.
    r.fill(subtract(disc(t, 0, 0, 11.4, 11.4, 24), disc(t, 0, 0, 10, 10, 24)), m('k.ring'), { group: 1 });
    const back: [number, number, number][] = [[2.2, 9, 2], [0.4, 10.6, 1.9], [4.4, 7.6, 1.6], [-1.7, 9.4, 1.8], [-3.8, 7.6, 1.5]];
    for (const [a, len, w] of back) r.fill(shard(t, Math.cos(a) * 2, Math.sin(a) * 2, a, len, w), m('k.iceDk'), { group: 2, bevel: 1.4, toneBias: -1 });
    const front: [number, number, number][] = [[1.5, 12.6, 2.4], [0.95, 9.4, 2], [2.15, 9.8, 2], [-0.35, 8.6, 1.9], [3.5, 8, 1.8], [-1.2, 7, 1.6], [4.3, 6.4, 1.4]];
    for (const [i, [a, len, w]] of front.entries()) r.fill(shard(t, Math.cos(a) * 2.6, Math.sin(a) * 2.6, a, len, w), m('k.ice'), { group: 3 + i, bevel: 1.6 });
    r.fill(t.poly([0, 5.4, 4.4, 2.6, 4.4, -2.6, 0, -5.4, -4.4, -2.6, -4.4, 2.6]), m('k.iron'), { group: 12, bevel: 1.6 });
    r.fill(t.poly([0, 4, 3.3, 2, 3.3, -2, 0, -4, -3.3, -2, -3.3, 2]), m('k.core'), { group: 12 });
    hailRune(r, t, 0, 0, 2.6, m('k.hot'), 3, 12);
    for (const [x, y] of [[-9, -6], [7.4, -9.4], [-11, 3]] as const) {
      r.dot(t.x(x, y), t.y(x, y), m('k.snow'), 3, 13);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) r.dot(t.x(x, y) + dx, t.y(x, y) + dy, m('k.core'), 3, 13);
    }
  },
  proj: { core: coreProj },
};

// -----------------------------------------------------------------------------
// Armour
// -----------------------------------------------------------------------------

function jarlHelm(): SkinArt {
  // A rimed iron spangenhelm with a nasal, a roll of white fur round the brow, two great horns
  // curving up and back whose tips are glacier ice, icicles under the fur and the ice rune glowing on the brow.
  return {
    head: () => ({
      mats: {
        'h.iron': iron(rimeSoft), 'h.dark': ironDk(), 'h.fur': fur(),
        'h.horn': material({ base: 0xd8ccb0, ramp: [0x5a4e40, 0x8a7a64, 0xb8a888, 0xe0d4b8, 0xf6f0e0], shiny: true, tex: (x, y) => (wrap(x * 0.9 - y * 0.5, 1.6) < 0.4 ? -1 : 0) }),
        'h.ice': ice(sweep(10, 2.6)), 'h.rune': rune(),
      },
      draw(r, H, m, g) {
        const ph = r.phase % 4;
        // A horn as a chain of tapering segments along a curve, its tip grown over with glacier ice.
        const horn = (pts: number[][], bias: number, gg: number) => {
          const bone: Shape[] = [];
          const n = pts.length;
          for (let i = 0; i < n - 2; i++) {
            const [ax, ay, ra] = pts[i], [bx, by, rb] = pts[i + 1];
            bone.push(H.cap(ax, ay, bx, by, ra, rb));
          }
          r.fill(union(...bone), m('h.horn'), { group: gg, bevel: 1.4, toneBias: bias, local: H });
          const [px, py] = pts[n - 3], [qx, qy, qr] = pts[n - 2], [ex, ey] = pts[n - 1];
          const sx = px + (qx - px) * 0.3, sy = py + (qy - py) * 0.3;
          r.fill(shard(H, sx, sy, Math.atan2(ey - sy, ex - sx), Math.hypot(ex - sx, ey - sy) + 1.2, qr * 1.45), m('h.ice'), { group: gg + 1, bevel: 0.9, toneBias: bias, local: H });
        };
        // Far horn, curving out over the brow toward the front.
        horn([[2.6, 5.6, 1.2], [4.8, 6.6, 1.05], [6.6, 8.2, 0.9], [7.6, 10.2, 0.7], [7.6, 12, 0.5], [6.8, 13.4, 0.3]], -1, 50);
        // The dome: a rimed iron cap with a ridge, a dark brow band, the cheek guard and nasal.
        const dome = hairCap(H, 1.4, -3.4, 1.4);
        r.fill(dome, m('h.iron'), { group: g, bevel: 3, local: H });
        r.line(H.x(-1.6, 8.2), H.y(-1.6, 8.2), H.x(5.6, 4.4), H.y(5.6, 4.4), m('h.dark'), 1, g);
        r.fill(intersect(dome, H.rect(0, 2.1, 9, 0.55)), m('h.dark'), { group: g, flat: 2, noLine: true });
        r.fill(H.poly([1.4, 1.6, 4.8, 1.6, 4, -3.2, 1.8, -2.8]), m('h.iron'), { group: g, bevel: 1.4, local: H });
        r.fill(H.rect(5.8, 0.4, 0.6, 2.8), m('h.dark'), { group: g, bevel: 0.8 });
        // The ice rune on the brow.
        r.line(H.x(3.6, 3), H.y(3.6, 3), H.x(3.4, 5.6), H.y(3.4, 5.6), m('h.rune'), [2, 3, 4, 3][ph], g);
        // The fur roll round the back of the helm, falling to a ruff at the nape; icicles under it.
        const ice = m('h.ice');
        for (const [x, y, len] of [[-3.6, -0.4, 1.6], [-5.6, -2.6, 2.2], [-7.2, -3, 1.4]] as const) {
          r.fill(H.poly([x - 0.55, y + 0.4, x + 0.55, y + 0.4, x + 0.1, y - len]), ice, { group: 52, bevel: 0.6, local: H });
        }
        r.fill(union(furRoll(H, -6.8, 1.8, 0.8, 3, 1.15, 5), furRoll(H, -7, 1.6, -6.6, -2.2, 1.3, 2)), m('h.fur'), { group: 52, bevel: 1.2, local: H });
        // Near horn, sweeping back from the side of the helm and curling up.
        horn([[-1, 4.6, 1.6], [-4, 5.4, 1.45], [-6.6, 6.8, 1.2], [-8.2, 8.8, 0.95], [-8.6, 11, 0.7], [-7.8, 12.8, 0.4]], 0, 53);
        r.fill(H.circ(-0.8, 4.4, 1.3), m('h.dark'), { group: 55, bevel: 1, local: H });
        r.dot(H.x(-0.8, 4.5), H.y(-0.8, 4.5), m('h.rune'), [2, 3, 4, 3][ph], 55);
      },
    }),
    ...FX,
  };
}

function frostboundPlate(): SkinArt {
  // Rimed iron plate under a heavy white fur mantle, pauldrons crusted with ice crystals,
  // a hail rune pulsing on the breast and a fur cloak swaying behind.
  const cloakFur: Tex = (x, y) => (wrap(x * 0.9 + Math.sin(y * 0.8) * 0.8, 2.2) < 0.5 ? -1 : 0);
  return {
    mats: {
      plate: { base: IRON[2], ramp: IRON, shiny: true, step: 0.13, tex: rimeSoft }, plateDark: { base: IRON_DK[2], ramp: IRON_DK, shiny: true },
      'k.fur': { base: FUR[2], ramp: FUR, tex: tufts },
      'k.cloak': { base: 0xb8b0a0, ramp: [0x5a564e, 0x847e72, 0xb0a898, 0xd8d2c4, 0xf0ece2], tex: cloakFur },
      'k.ice': { base: ICE[2], ramp: ICE, shiny: true, tex: sweep(8, 2) }, 'k.iron': { base: IRON[2], ramp: IRON, shiny: true, tex: rime },
      'k.dark': { base: IRON_DK[2], ramp: IRON_DK, shiny: true }, 'k.rune': { base: RUNE[3], ramp: RUNE, glow: true, tex: pulse },
      'k.leather': plain(LEATHER),
    },
    chest: {
      pauldron: null, spikes: null,
      back(r, T, m, c) {
        // A long fur cloak, its hem in tufts, trailing the motion.
        const s = c.sway * 3, top = c.top, ph = r.phase % 4, fl = [0, 0.4, 0.7, 0.3][ph];
        r.fill(T.poly([
          -0.6, top + 1, -6.2, top - 0.4, -9.8 - s, -5, -11.6 - s * 1.3 - fl, -12.6,
          -10.2 - s * 1.3 - fl, -11.6, -9 - s * 1.2, -14, -7.4 - s * 1.1, -12.4, -5.8 - s, -14.2 + fl,
          -4.2 - s * 0.9, -12, -2.4 - s * 0.6, -13.2, -1.2, -9, -0.6, -2,
        ]), m('k.cloak'), { group: c.g, bevel: 3, toneBias: -1, softLight: true, local: T });
      },
      shoulder(r, S, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        // Two lames of rimed iron, then fur over the top, ice crystals growing up out of the fur.
        r.fill(S.ell(-0.2, -0.4, 3.4, 2.6), m('k.iron'), { ...o, bevel: 1.8, local: S });
        r.fill(S.ell(0, -2.4, 3, 1.4), m('k.iron'), { ...o, bevel: 1.2, local: S });
        r.line(S.x(-3, -1.6), S.y(-3, -1.6), S.x(2.8, -1.4), S.y(2.8, -1.4), m('k.dark'), 1, c.g);
        if (!c.far) {
          for (const [x, a, len, w] of [[-1.6, 1.95, 4.2, 0.9], [0.4, 1.45, 3.2, 0.8], [-2.8, 2.5, 2.6, 0.7]] as const) {
            r.fill(shard(S, x, 1.4, a, len, w), m('k.ice'), { ...o, bevel: 0.8, local: S });
          }
        } else r.fill(shard(S, -0.6, 1.4, 1.7, 3.2, 0.9), m('k.ice'), { ...o, bevel: 0.8, local: S });
        r.fill(furRoll(S, -3.4, 1, 3, 1.5, 1.6, 4), m('k.fur'), { ...o, bevel: 1.2, local: S });
      },
      over(r, T, m, c) {
        // The fur mantle round the neck and over the shoulders, a leather strap and the rune on the breast.
        const x = c.body.chestPush * 0.7 + 1.2, y = c.top - 4.6, ph = r.phase % 4;
        r.fill(T.poly([x - 2.4, y + 2.4, x + 2.2, y + 2.4, x + 2.6, y - 0.4, x + 0.2, y - 3.2, x - 2.4, y - 1]), m('k.dark'), { group: c.g, bevel: 1, local: T });
        hailRune(r, T, x + 0.1, y + 0.1, 2.1, m('k.rune'), [2, 3, 4, 3][ph], c.g);
        r.fill(T.cap(-3.6, c.top - 1, x + 1.6, c.top * 0.42, 0.45), m('k.leather'), { group: c.g, bevel: 0.6, noLine: true });
        r.fill(furRoll(T, -5.4, c.top + 0.2, x + 2.4, c.top - 0.8, 2.2, 6), m('k.fur'), { group: c.g, bevel: 1.4, local: T });
      },
    },
    ...FX,
  };
}

function glacierGreaves(): SkinArt {
  // Rimed iron greaves with glacier crystals growing up the front of the shin, fur cuffs at the knee
  // and a hail rune glowing on the knee cop.
  return {
    mats: {
      greave: { base: IRON[2], ramp: IRON, shiny: true, tex: rimeSoft }, greaveDark: { base: IRON_DK[2], ramp: IRON_DK, shiny: true },
      'k.ice': { base: ICE[2], ramp: ICE, shiny: true, tex: sweep(8, 2) }, 'k.fur': { base: FUR[2], ramp: FUR, tex: tufts },
      'k.rune': { base: RUNE[3], ramp: RUNE, glow: true, tex: pulse },
    },
    boots: {
      over(r, shin, foot, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w;
        // Crystals growing up the front of the shin, tallest at mid-shin.
        const xs: [number, number, number, number][] = [[1.4, 0.55, 2.6, 0.8], [c.top * 0.38, 0.4, 3.6, 0.95], [c.top * 0.66, 0.5, 2.6, 0.75]];
        for (const [i, [x, a, len, ww]] of xs.entries()) r.fill(shard(shin, x, w - 0.4, a, len, ww), m('k.ice'), { group: c.g + (i % 2 ? 0 : 0), bevel: 0.8, toneBias: c.bias, local: shin });
        // An ice spur on the toe.
        r.fill(shard(foot, c.toe - 1, 0.4, 0.35, 2.4, 0.7), m('k.ice'), { ...o, bevel: 0.7, local: foot });
        // The fur cuff at the top of the greave.
        r.fill(furRoll(shin, c.top - 0.4, -w - 0.6, c.top - 0.2, w + 0.6, 1.2, 3), m('k.fur'), { ...o, bevel: 1, local: shin });
        if (!c.far) r.dot(shin.x(c.len, 0.4), shin.y(c.len, 0.4), m('k.rune'), [2, 3, 4, 3][ph], c.g);
      },
    },
    ...FX,
  };
}

function frostboundChausses(): SkinArt {
  // Rimed mail chausses under a fringe of white fur hanging from the belt, a dark iron cuisse on the
  // front of the thigh with the hail rune pulsing on it, and iron knee cops with a glacier crystal growing out of each.
  return {
    mats: {
      chain: { base: IRON[2], ramp: IRON, shiny: true, step: 0.14, tex: (x, y) => (wrap(Math.floor(x + y), 2) === 0 ? -1 : 0) },
      chainDark: { base: IRON_DK[2], ramp: IRON_DK, shiny: true }, chainPlate: { base: IRON[2], ramp: IRON, shiny: true, tex: rimeSoft },
      'l.fur': { base: FUR[2], ramp: FUR, tex: tufts }, 'l.dark': { base: IRON_DK[2], ramp: IRON_DK, shiny: true },
      'l.ice': { base: ICE[2], ramp: ICE, shiny: true, tex: sweep(8, 2) }, 'l.rune': { base: RUNE[3], ramp: RUNE, glow: true, tex: pulse },
    },
    legs: {
      mat: 'chain', trim: null, knee: 'chainPlate', tasset: null, rune: null, wraps: null, bulk: 0.25,
      over(r, t, m, c) {
        const o = { group: c.g, toneBias: c.bias };
        const ph = r.phase % 4, w = c.w, L = c.len;
        // The cuisse: a dark iron plate over the front of the thigh, the hail rune glowing on it.
        const hail = (x: number, y: number, k: number, tone: number) => {
          // The hail rune with its stem along the thigh.
          const ln = (ax: number, ay: number, bx: number, by: number) => r.line(t.x(ax, ay), t.y(ax, ay), t.x(bx, by), t.y(bx, by), m('l.rune'), tone, c.g);
          ln(x - k, y, x + k, y);
          ln(x - k * 0.6, y - k * 0.6, x + k * 0.6, y + k * 0.6);
          ln(x - k * 0.6, y + k * 0.6, x + k * 0.6, y - k * 0.6);
        };
        const plate = t.poly([L * 0.62, -w * 0.5, L * 0.62, w + 0.5, L * 0.16, w + 0.6, L * 0.12, -w * 0.3], 0.4);
        r.fill(plate, m('l.dark'), { ...o, bevel: 1.2 });
        if (!c.far) hail(L * 0.33, w * 0.3, 1.5, [2, 3, 4, 3][ph]);
        // A glacier crystal growing up out of the top of the knee cop, leaning forward, and a small one beside it.
        const kr = c.body.kneeR + 0.25;
        r.fill(shard(t, 0.4, kr + 0.6, 0.8, 4.2, 1), m('l.ice'), { ...o, bevel: 0.8 });
        r.fill(shard(t, -0.6, kr + 0.8, -0.2, 2, 0.6), m('l.ice'), { ...o, bevel: 0.7 });
        // The fur flap hanging from the belt over the thigh, its lumpy hem stirring.
        const hem = L * 0.56, fl = [0, 0.3, 0.5, 0.3][ph];
        r.fill(union(
          t.poly([L + 1, -w - 0.2, L + 1, w + 1.2, hem + 0.6, w + 1.4, hem + 0.6, -w]),
          furRoll(t, hem + 0.6, -w + 0.1, hem + 0.2 - fl, w + 1.3, 1.1, 3),
        ), m('l.fur'), { ...o, bevel: 1.4 });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const C = {
  frost: css(0x6ac8f0), frostDk: css(0x2a6a9a), rim: css(0xbff4ff), white: css(0xffffff), snow: css(0xe8fbff),
};

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function frostboundAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  // A frosted ring on the ground, a shimmer running round it, small ice shards jutting up.
  const step = Math.floor(t * 9);
  ring(g, x, y, 16, 3.8, 48, layer, (g, px, py, i) => {
    if (i % 6 === 5) return;
    const k = (i + step) % 12;
    g.fillStyle = k === 0 ? C.white : k < 3 ? C.rim : i % 3 ? C.frostDk : C.frost;
    g.fillRect(px, py, 1, 1);
  });
  ring(g, x, y, 16, 3.8, 7, layer, (g, px, py, i) => {
    const h = 1 + (i % 3 === 1 ? 2 : 1);
    g.fillStyle = C.frost; g.fillRect(px, py - h + 1, 1, h);
    g.fillStyle = (i + Math.floor(t * 3)) % 7 === 0 ? C.white : C.rim; g.fillRect(px, py - h, 1, 1);
    g.fillStyle = C.frostDk; g.fillRect(px + 1, py, 1, 1);
  });
  // Snowflakes drifting down around the fighter, swaying as they fall.
  for (let k = 0; k < 8; k++) {
    const a = k * 2.2 + t * 0.25;
    const s = Math.sin(a);
    if ((s < 0) !== (layer === 'back')) continue;
    const u = (t * (0.18 + (k % 3) * 0.04) + k * 0.31) % 1;
    const px = Math.round(x + Math.cos(a) * (12 + (k % 3) * 4) + Math.sin(t * 1.6 + k * 1.3) * 2), py = Math.round(y + s * 3 - 60 + u * 60);
    g.globalAlpha = u > 0.85 ? (1 - u) / 0.15 : 1;
    g.fillStyle = C.snow;
    g.fillRect(px, py, 1, 1);
    if (k % 2 === 0) { g.fillStyle = C.frost; g.fillRect(px - 1, py, 3, 1); g.fillRect(px, py - 1, 1, 3); g.fillStyle = C.white; g.fillRect(px, py, 1, 1); }
  }
  g.globalAlpha = 1;
}

export const FROSTBOUND: Record<string, SkinArt> = {
  'mace.winterfist': { weapon: winterfist, ...FX },
  'buckler.rimeguard': { weapon: rimeguard, ...FX },
  'frost_core.winter': heartOfWinter,
  'iron_helm.jarl': jarlHelm(),
  'plate_armor.frostbound': frostboundPlate(),
  'iron_greaves.glacier': glacierGreaves(),
  'chain_leggings.frostbound': frostboundChausses(),
};
