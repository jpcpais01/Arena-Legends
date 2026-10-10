import type { Layer } from '../../auraKit';
import { css, mix } from '../../pixel/color';
import { material, type Material, type MaterialSpec, type Raster, type Tex } from '../../pixel/raster';
import { intersect, union, type Shape } from '../../pixel/sdf';
import { hash } from '../../pixel/tex';
import { fillAll, type WeaponArt } from '../weaponKit';
import { Xf } from '../xform';
import type { ProjArt, SkinArt, SkinFx } from './index';
import { epicFx, mats, wrap } from './kit';

/**
 * Epic set: Sugar Rush. A candy shop come to life: candy-cane stripes and
 * swirled lollipops, pink frosting piped in tiers and dripping off cookies,
 * rainbow sprinkles everywhere, glossy cherries, licorice and marshmallow,
 * and sweets popping in little fizzy bursts of sprinkles.
 */

/** Strawberry frosting. */
const PINK = [0x8a2a5c, 0xd0508e, 0xff8cc0, 0xffc4e0, 0xfff0f8];
/** Mint icing. */
const MINT = [0x1e6a5e, 0x38a88c, 0x6ad8b8, 0xaef4dc, 0xeefff8];
/** Lemon drop. */
const LEMON = [0x8a6414, 0xc89c28, 0xf8d860, 0xfff0a0, 0xfffce0];
/** Grape taffy. */
const GRAPE = [0x3a2a78, 0x6a52b8, 0xa48ce8, 0xd0c4ff, 0xf4f0ff];
/** Blue raspberry. */
const SKY = [0x24548a, 0x4088d0, 0x80c0f8, 0xc0e2ff, 0xf2faff];
/** Vanilla cream, sugar glass and marshmallow white, shaded in pink-lilac. */
const CREAM = [0x9a7c96, 0xd2b8cc, 0xf6e8f0, 0xfffafc, 0xffffff];
/** Golden-baked cookie and graham cracker. */
const COOKIE = [0x5a3014, 0x8c5424, 0xc48644, 0xe8b46c, 0xfadcaa];
/** Chocolate. */
const CHOC = [0x24100a, 0x3e1e12, 0x5e321e, 0x80482c, 0xa86a44];
/** Glossy black licorice: the fifth tone is the sugar-gloss glint. */
const LICORICE = [0x0e080e, 0x1e121c, 0x34222e, 0x52384a, 0xa088a0];
/** Candied cherry. */
const CHERRY = [0x5a0618, 0x9a1028, 0xe02a48, 0xff6a80, 0xffd8e0];
const WHITE = 0xffffff, HOT_PINK = 0xff5aa8;
/** Sprinkles: strawberry, lemon, blue raspberry, apple, grape, orange. */
const SPRINKLE = [0xff5a8a, 0xffd84a, 0x5ab8ff, 0x6ae0a0, 0xb07aff, 0xffa04a];

const ramp = (r: number[], tex?: Tex, shiny = false): MaterialSpec => ({ base: r[2], ramp: r, tex, shiny });
const candy = (r: number[], tex?: Tex): MaterialSpec => ({ base: r[2], ramp: r, tex, shiny: true, step: 0.15 });
/** A sprinkle colour: bright and glossy, but not self-lit (only a few candy gems glow at night). */
const sprinkle = (c: number): MaterialSpec => ({ base: c, shiny: true, ramp: [mix(c, 0, 0.5), mix(c, 0, 0.28), c, mix(c, WHITE, 0.35), mix(c, WHITE, 0.7)] });
/** A candy gem that glows a little at night. */
const gem = (c: number, tex?: Tex): MaterialSpec => ({ base: c, glow: true, ramp: [mix(c, 0, 0.45), mix(c, 0, 0.22), c, mix(c, WHITE, 0.3), mix(c, WHITE, 0.65)], tex });

/** The six sprinkle materials, named `${p}s0`..`${p}s5`. */
const sprinkleMats = (p: string): Record<string, MaterialSpec> => Object.fromEntries(SPRINKLE.map((c, i) => [`${p}s${i}`, sprinkle(c)]));
const sk = (p: string, k: number) => `${p}s${wrap(k, 6)}`;
const built = (specs: Record<string, MaterialSpec>): Record<string, Material> => Object.fromEntries(Object.entries(specs).map(([k, v]) => [k, material(v)]));

/** Pleated paper (cupcake liners): a fold every `p` units across x. */
const pleats = (p = 1.6): Tex => (x) => (wrap(x, p) < 0.55 ? -1 : 0);
/** Candy stripes: every other band sunk two tones down a ramp that runs from strawberry up to cream, so it reads as two colours (never reaching the glinting top tone). */
const stripes = (p = 2.6, lean = 0.35): Tex => (x, y) => (wrap(x + y * lean, p) < p / 2 ? 0 : -2);
/** Licorice twist: glossy ridges running round the rope, a gloss glint sliding along one step a frame. */
const twist: Tex = (x, y, ph) => {
  const u = wrap(x * 0.9 + y * 1.3, 2.4);
  if (u < 0.55) return -1;
  return u > 1.5 && u < 1.95 && wrap(Math.floor(x * 0.9 + y * 1.3) - ph, 4) === 0 ? 2 : 0;
};
/** Baked cookie: a few dark chocolate chips (dropped to the chocolate end of the ramp) and crumbly pits. */
const cookieTex: Tex = (x, y) => {
  const cx = Math.floor(x / 2.2), cy = Math.floor(y / 2.2);
  const h = hash(cx * 3 + 7, cy * 5 + 1);
  if (h < 0.2 && wrap(x, 2.2) > 0.5 && wrap(y, 2.2) > 0.5 && wrap(x, 2.2) < 1.7) return -3;
  return hash(Math.floor(x * 1.3), Math.floor(y * 1.3)) < 0.12 ? -1 : 0;
};
/** Cookie ramp running down into chocolate, so chips read as chocolate. */
const COOKIE_CHIP = [CHOC[1], CHOC[3], COOKIE[2], COOKIE[3], COOKIE[4]];

const FX = { ...epicFx(0xffd8f0, 0x9ae8ff, 'twinkle', 0xffd0ea), fx: { spark: 0xff8ad0, spark2: 0x9ae8ff, kind: 'petal' } as SkinFx };

/** Particles the full set sheds in battle: sprinkles tumbling in pink and blue raspberry. */
export const SUGARRUSH_FX: SkinFx = { spark: 0xff8ad0, spark2: 0x9ae8ff, kind: 'petal' };

// -----------------------------------------------------------------------------
// Shapes
// -----------------------------------------------------------------------------

/** A round disc as a polygon (squashes with its frame, unlike `circ`). */
function disc(F: Xf, cx: number, cy: number, rx: number, ry = rx, n = 18): Shape {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) pts.push(cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry);
  return F.poly(pts);
}

/**
 * One arm of a lollipop swirl round (cx, cy): the band between a spiral and the same spiral turned by `w`
 * radians, `turns` round out to radius `R`, turned by `rot`.
 */
function swirlArm(F: Xf, cx: number, cy: number, R: number, turns: number, rot: number, w: number): Shape {
  const T = turns * Math.PI * 2, n = Math.ceil(turns * 20);
  const out: number[] = [], back: number[] = [];
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * T, rr = (R * th) / T;
    out.push(cx + Math.cos(th + rot) * rr, cy + Math.sin(th + rot) * rr);
    const r2 = (R * Math.max(0, th - w)) / T;
    back.push(cx + Math.cos(th + rot) * r2, cy + Math.sin(th + rot) * r2);
  }
  for (let i = back.length - 2; i >= 0; i -= 2) out.push(back[i], back[i + 1]);
  return F.poly(out);
}

/** A satin bow: two loops either side of a knot at (x, y), tails trailing back along -x, fluttering by `fl`. */
function bow(r: Raster, F: Xf, x: number, y: number, s: number, fl: number, mat: number, knot: number, g: number, bias = 0): void {
  const o = { group: g, bevel: 0.9 * s, toneBias: bias };
  r.fill(F.poly([x, y, x - 3.2 * s - fl * 0.3, y + 2.2 * s + fl * 0.4, x - 2.6 * s - fl * 0.6, y + 3.2 * s + fl * 0.5, x - 0.6 * s, y + 0.8 * s]), mat, { ...o, toneBias: bias - 1 });
  r.fill(F.poly([x, y, x - 3 * s + fl * 0.3, y - 2.6 * s - fl * 0.3, x - 2.2 * s + fl * 0.5, y - 3.4 * s - fl * 0.4, x - 0.6 * s, y - 0.8 * s]), mat, { ...o, toneBias: bias - 1 });
  r.fill(F.ell(x + 1.2 * s, y + 1.7 * s, 1.5 * s, 1, 0.5), mat, o);
  r.fill(F.ell(x + 1.2 * s, y - 1.7 * s, 1.5 * s, 1, -0.5), mat, o);
  r.fill(F.ell(x + 0.2 * s, y, 0.75 * s, 0.85 * s), knot, { ...o, bevel: 0.6 });
}

/** A fizzy burst at raster point (x, y): a white heart and four sprinkles flying out, `k` = 0..3 how far along. */
function fizz(r: Raster, x: number, y: number, k: number, m: (k: string) => number, p: string, hot: number, g: number, c0 = 0): void {
  if (k === 0) { r.dot(x, y, hot, 3, g); return; }
  const d = k === 1 ? 1 : k === 2 ? 2 : 3;
  r.dot(x - d, y, m(sk(p, c0)), 3, g); r.dot(x + d, y, m(sk(p, c0 + 1)), 3, g);
  r.dot(x, y - d, m(sk(p, c0 + 2)), 3, g); r.dot(x, y + d, m(sk(p, c0 + 3)), 3, g);
  if (k === 1) r.dot(x, y, hot, 3, g);
}

// -----------------------------------------------------------------------------
// Lollipop Smasher
// -----------------------------------------------------------------------------

function lollipopSmasher(): WeaponArt {
  // A candy-cane stick with a gumdrop pommel, a pink satin bow tied under the head, and for a head a great
  // swirl lollipop of strawberry and mint on sugar-white that spins as it swings, a candy heart at its eye;
  // sprinkles pop off its rim in little fizzy bursts.
  const CX = 25.4, CY = 0, R = 6.3;
  return {
    tip: 31.7,
    grip2: 10,
    mats: built({
      stick: candy(CREAM), stripe: candy([0x7a1236, 0xc02852, 0xec4a72, 0xff8aa4, 0xffd0dc]), gum: candy(MINT, (x, y) => (hash(Math.floor(x * 1.6), Math.floor(y * 1.6)) < 0.18 ? 1 : 0)),
      sugar: candy(CREAM), pink: candy(PINK), mint: candy(MINT), lemon: candy(LEMON), satin: candy(PINK), knot: candy(GRAPE),
      heart: gem(HOT_PINK), fizz: { base: WHITE, glow: true },
      ...sprinkleMats(''),
    }),
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4, b = o.toneBias ?? 0;
      // The candy-cane stick: sugar white, striped round in strawberry.
      fillAll(r, [t.cap(-9, 0, 21, 0, 1.2, 1.1)], m('stick'), o, 1);
      for (let x = -8.2; x < 19.6; x += 2.8) {
        r.line(t.x(x - 0.55, -1), t.y(x - 0.55, -1), t.x(x + 0.55, 1), t.y(x + 0.55, 1), m('stripe'), 2 + b, g);
      }
      // A mint gumdrop for a pommel, sugar crystals on it.
      r.fill(t.poly([-9, -1.9, -9, 1.9, -10.6, 1.6, -11.8, 0.6, -12.1, 0, -11.8, -0.6, -10.6, -1.6]), m('gum'), { group: g, bevel: 1.1, toneBias: b, local: o.local });
      // The lollipop: a sugar-white disc, two swirled arms of strawberry and mint turning a quarter each frame.
      const rot = -ph * (Math.PI / 4);
      fillAll(r, [disc(t, CX, CY, R + 0.15, R + 0.15, 22)], m('sugar'), o, 2.6);
      const face = disc(t, CX, CY, R - 0.1, R - 0.1, 22);
      r.fill(intersect(swirlArm(t, CX, CY, R + 1.6, 1.5, rot, 2.1), face), m('pink'), { group: g, bevel: 2.6, toneBias: b, noLine: true });
      r.fill(intersect(swirlArm(t, CX, CY, R + 1.6, 1.5, rot + Math.PI, 2.1), face), m('mint'), { group: g, bevel: 2.6, toneBias: b, noLine: true });
      // The candy heart at the eye of the swirl.
      r.fill(t.poly([CX - 1.1, CY, CX + 0.2, CY + 1.2, CX + 1, CY + 0.9, CX + 1.2, CY, CX + 1, CY - 0.9, CX + 0.2, CY - 1.2]), m('heart'), { group: g });
      // The bow tied under the head, its tails fluttering.
      bow(r, t, 19, 0, 1, [0, 0.5, 0.9, 0.5][ph], m('satin'), m('knot'), g, b);
      // Sprinkles stuck in the sugar round the rim; a fizzy burst pops off the rim, a new spot each frame.
      for (let k = 0; k < 5; k++) {
        const a = k * 1.26 + 0.4, rr = R - 0.7;
        r.dot(t.x(CX + Math.cos(a) * rr, CY + Math.sin(a) * rr), t.y(CX + Math.cos(a) * rr, CY + Math.sin(a) * rr), m(sk('', k * 2)), 3, g);
      }
      const pa = [0.5, 2.3, -0.9, 1.4][ph], pr = R + 2.2;
      fizz(r, t.x(CX + Math.cos(pa) * pr, CY + Math.sin(pa) * pr), t.y(CX + Math.cos(pa) * pr, CY + Math.sin(pa) * pr), ph % 2 ? 2 : 1, m, '', m('fizz'), g, ph);
    },
  };
}

// -----------------------------------------------------------------------------
// Cookie Buckler
// -----------------------------------------------------------------------------

function cookieBuckler(): WeaponArt {
  // A thick chocolate-chip cookie for a buckler, iced in strawberry frosting that drips over its edge and
  // scattered with rainbow sprinkles, a swirl of whipped cream at its heart crowned with a glossy cherry.
  return {
    tip: 7.4,
    mats: built({
      cookie: ramp(COOKIE_CHIP, cookieTex), icing: ramp(PINK), cream: candy(CREAM), cherry: candy(CHERRY), stem: ramp(MINT),
      glint: { base: WHITE, glow: true },
      ...sprinkleMats(''),
    }),
    draw(r, t, m, o) {
      const g = o.group ?? 6, ph = r.phase % 4, b = o.toneBias ?? 0;
      // The cookie seen side-on: its baked edge, then the iced face in front.
      const Pb = new Xf(t.x(0.4, 0), t.y(0.4, 0), t.ang, t.sx * 0.42, t.sy);
      const Pf = new Xf(t.x(2.1, 0), t.y(2.1, 0), t.ang, t.sx * 0.42, t.sy);
      const F = new Xf(t.x(2.9, 0), t.y(2.9, 0), t.ang, t.sx * 0.34, t.sy);
      // A thick cookie: its back face and front face joined into one baked edge.
      fillAll(r, [union(disc(Pb, 0, 0, 6.4, 6.4, 20), disc(Pf, 0, 0, 6.4, 6.4, 20), t.rect(1.25, 0, 0.85, 6.3))], m('cookie'), o, 2);
      // Frosting over the front face, lobed where it drips over the rim.
      const lobes: number[] = [];
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2, rr = 4.9 + (i % 4 === 0 ? 1.2 : i % 4 === 2 ? 0.5 : 0);
        lobes.push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      r.fill(F.poly(lobes), m('icing'), { group: g, bevel: 1.4, toneBias: b, local: o.local });
      // Drips running back over the baked edge.
      for (const y of [-4.2, 0.8, 4.6]) r.fill(t.cap(2.4, y, 1.2, y * 1.02, 0.6, 0.45), m('icing'), { group: g, bevel: 0.5, toneBias: b, noLine: true });
      // Rainbow sprinkles on the icing: short dashes at their own angles; one catches the light each frame.
      const sp: [number, number, number][] = [[-4.4, 0.4, 0], [-2.6, -0.4, 1], [-0.8, 0.3, 2], [1.6, -0.3, 3], [3.4, 0.4, 4], [4.6, -0.2, 5], [-3.6, -0.6, 3], [2.4, 0.5, 1]];
      for (const [i, [y, dx, c]] of sp.entries()) {
        const x = 3.3 + dx * 0.6;
        r.dot(t.x(x, y), t.y(x, y), m(sk('', c)), i % 4 === ph ? 4 : 2 + b, g);
        r.dot(t.x(x, y + 0.6), t.y(x, y + 0.6), m(sk('', c)), 2 + b, g);
      }
      // Whipped cream piped in a swirl at the heart, and the cherry on top, its stem curling back.
      r.fill(t.ell(3.7, 0, 1.3, 2.3), m('cream'), { group: g, bevel: 1, toneBias: b });
      r.fill(t.ell(4.7, 0, 1, 1.6), m('cream'), { group: g, bevel: 0.9, toneBias: b });
      r.line(t.x(3.4, -1.4), t.y(3.4, -1.4), t.x(4.6, 1.2), t.y(4.6, 1.2), m('cream'), 1 + b, g);
      const j = [0, 0.15, 0.25, 0.1][ph];
      r.line(t.x(6.2, 0.2), t.y(6.2, 0.2), t.x(8, 1.4 + j), t.y(8, 1.4 + j), m('stem'), 1 + b, g);
      r.fill(t.circ(6.3 + j * 0.3, -0.1, 1.15), m('cherry'), { group: g, bevel: 1, toneBias: b });
      r.dot(t.x(6.6, 0.4), t.y(6.6, 0.4), m('glint'), 3, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Gumball Echo
// -----------------------------------------------------------------------------

/** Gumball colours, in the order the machine's globe holds them. */
const GUMS = [0, 2, 1, 3, 4, 5, 2, 0, 3];
/** The pile of gumballs in the globe (x, y at icon scale). */
const PILE: [number, number][] = [[-4.4, 0.6], [-1.4, -0.4], [1.8, -0.2], [4.6, 0.8], [-3, 3.2], [0.2, 2.6], [3.2, 3.4], [-1.2, 5.6], [1.8, 6]];

const GM = mats({
  glass: { base: 0xd8f0ff, ramp: [0x6a8aa8, 0x9ac0dc, 0xc8e4f6, 0xe8f6ff, WHITE], shiny: true },
  red: candy(PINK), gold: candy(LEMON), slot: ramp(CHOC), fizz: { base: WHITE, glow: true }, heart: gem(HOT_PINK),
  ...Object.fromEntries(SPRINKLE.map((c, i) => [`g${i}`, { base: c, shiny: true, ramp: [mix(c, 0, 0.5), mix(c, 0, 0.25), c, mix(c, WHITE, 0.4), mix(c, WHITE, 0.8)] }])),
} as Record<string, MaterialSpec>);

/**
 * The gumball machine (base at y = -s*12, globe centred at y = s*3.4) in frame F, `s` scaling it.
 * `shuffle` turns the gumballs round in the globe; `pop` 0..3 shoots one out of the chute in a fizzy burst.
 */
function gumballMachine(r: Raster, F: Xf, s: number, shuffle: number, pop: number, h: (k: string) => number, g0: number): void {
  const S = (v: number) => v * s;
  // The globe: glass first (behind), the gumballs inside, then the gloss over them.
  const gx = 0, gy = S(3.4), gr = S(7.4);
  r.fill(disc(F, gx, gy, gr, gr, 22), h('glass'), { group: g0, bevel: S(2), toneBias: -1 });
  for (const [i, [x, y]] of PILE.entries()) {
    const c = GUMS[(i + shuffle) % GUMS.length];
    r.fill(F.circ(gx + S(x), gy + S(y - 3.6), S(1.75)), h(`g${c}`), { group: g0 + 1 + (i % 2), bevel: S(1.4) });
  }
  r.line(F.x(gx - S(4.6), gy + S(3.2)), F.y(gx - S(4.6), gy + S(3.2)), F.x(gx - S(2), gy + S(6)), F.y(gx - S(2), gy + S(6)), h('glass'), 4, g0 + 3);
  // The cap and its knob.
  r.fill(F.rect(0, gy + gr - S(0.2), S(3.6), S(1.1), S(0.6)), h('red'), { group: g0 + 4, bevel: S(0.9) });
  r.fill(F.circ(0, gy + gr + S(1.8), S(1.25)), h('heart'), { group: g0 + 4 });
  // A gold collar, the base flaring down, the coin knob and the chute.
  r.fill(F.rect(0, gy - gr + S(0.4), S(4.4), S(1), S(0.5)), h('gold'), { group: g0 + 4, bevel: S(0.8) });
  r.fill(F.poly([S(-4.2), gy - gr, S(4.2), gy - gr, S(5.4), S(-12), S(-5.4), S(-12)]), h('red'), { group: g0 + 4, bevel: S(1.6) });
  r.fill(F.rect(0, S(-11.6), S(6), S(0.8), S(0.4)), h('gold'), { group: g0 + 4, bevel: S(0.6) });
  r.fill(F.circ(S(-0.2), S(-6.6), S(1.7)), h('gold'), { group: g0 + 5, bevel: S(1) });
  r.line(F.x(S(-0.2), S(-5.6)), F.y(S(-0.2), S(-5.6)), F.x(S(-0.2), S(-7.6)), F.y(S(-0.2), S(-7.6)), h('slot'), 1, g0 + 5);
  r.fill(F.rect(S(3.8), S(-9.6), S(1.6), S(1.1), S(0.3)), h('slot'), { group: g0 + 5, bevel: S(0.6) });
  // A gumball shooting out of the chute and bursting into sprinkles.
  if (pop > 0) {
    const px = S(6.4 + pop * 1.6), py = S(-9.2 + [0, 1.6, 2.4, 2.6][pop]);
    const c = GUMS[shuffle % GUMS.length];
    if (pop < 3) r.fill(F.circ(px, py, S(1.6)), h(`g${c}`), { group: g0 + 6, bevel: S(1.2) });
    const fx = F.x(px, py), fy = F.y(px, py), d = Math.max(1, Math.round(S(pop * 1.4)));
    if (pop >= 2) {
      r.dot(fx - d - 1, fy, h(`g${(c + 1) % 6}`), 3, g0 + 6); r.dot(fx + d + 1, fy - 1, h(`g${(c + 2) % 6}`), 3, g0 + 6);
      r.dot(fx, fy - d - 1, h(`g${(c + 3) % 6}`), 3, g0 + 6); r.dot(fx + 1, fy + d + 1, h(`g${(c + 4) % 6}`), 3, g0 + 6);
      r.dot(fx, fy, h('fizz'), 3, g0 + 6);
    }
  }
}

const gumballCore: ProjArt = {
  frames: 8,
  outline: true,
  draw(r, t, f, h) {
    // A little gumball machine floating at the shoulder: the gumballs tumbling round in the globe, and every
    // so often one shooting out of the chute and bursting in sprinkles, the echo of a hit.
    const k = (n: string) => h(GM[n]);
    gumballMachine(r, new Xf(t.ox, t.oy, 0, 1, 1), 0.5, Math.floor(f / 2), [0, 0, 0, 0, 1, 2, 3, 0][f], k, 1);
  },
};

const gumballEcho: SkinArt = {
  mats: {
    // Stock names: the echo stone drawn the stock way is a gumball with a mint swirl.
    stone: candy(PINK), rune: gem(0x8af0d0),
    'k.glass': { base: 0xd8f0ff, ramp: [0x6a8aa8, 0x9ac0dc, 0xc8e4f6, 0xe8f6ff, WHITE], shiny: true },
    'k.red': candy(PINK), 'k.gold': candy(LEMON), 'k.slot': ramp(CHOC), 'k.fizz': { base: WHITE, glow: true }, 'k.heart': gem(HOT_PINK),
    ...Object.fromEntries(SPRINKLE.map((c, i) => [`k.g${i}`, { base: c, shiny: true, ramp: [mix(c, 0, 0.5), mix(c, 0, 0.25), c, mix(c, WHITE, 0.4), mix(c, WHITE, 0.8)] }])),
  },
  glow: [0xffd0ec, 0xff5aa8],
  icon(r, t, m) {
    // A candy-pink gumball machine, its glass globe heaped with gumballs in every flavour, one shooting out of
    // the chute in a fizzy burst of sprinkles.
    gumballMachine(r, new Xf(t.x(-1.4, 0.4), t.y(-1.4, 0.4), 0, 0.92, 0.92), 1, 0, 2, (k) => m(`k.${k}`), 1);
  },
  proj: { core: gumballCore },
};

// -----------------------------------------------------------------------------
// Cupcake Crown
// -----------------------------------------------------------------------------

function cupcakeCrown(): SkinArt {
  // A pleated mint cupcake liner cut into crown points, a gumdrop on every point, strawberry frosting piped
  // up out of it in three swirled tiers sprinkled in every colour, and a glossy cherry on top that jiggles.
  return {
    head: () => ({
      mats: built({
        'h.liner': ramp(MINT, pleats(1.5)), 'h.rim': candy(CREAM), 'h.frost': ramp(PINK), 'h.frost2': ramp([0x9a3468, 0xe068a0, 0xff9ccc, 0xffd0e6, 0xfff4fa]),
        'h.cherry': candy(CHERRY), 'h.stem': ramp(MINT), 'h.glint': { base: WHITE, glow: true },
        'h.gem0': gem(0xff7ab8), 'h.gem1': gem(0xffd860), 'h.gem2': gem(0x7ac8ff),
        ...sprinkleMats('h.'),
      }),
      draw(r, H, m, g) {
        const ph = r.phase % 4;
        // The liner: pleated paper flaring up from the brow, cut into points.
        const pts = [-5, 4.2, 5.3, 4.6];
        const tops: [number, number][] = [[5.8, 7.6], [3, 8.2], [0, 8.1], [-3, 7.8], [-5.6, 7]];
        const liner = H.poly([pts[0], pts[1], pts[2], pts[3], 6, 6.6, ...tops.flatMap(([x, y], i) => i < tops.length - 1 ? [x, y, (x + tops[i + 1][0]) / 2, y - 1.6] : [x, y]), -6, 6.2]);
        // Frosting tiers first so the liner's points stand in front of the bottom tier.
        const jig = [0, 0.3, 0, -0.3][ph];
        r.fill(H.ell(0.2, 7.9, 6.6, 1.9), m('h.frost'), { group: g + 1, bevel: 1.3, local: H });
        r.fill(H.ell(0.5, 9.9, 5, 1.7), m('h.frost2'), { group: g, bevel: 1.2, local: H });
        r.fill(H.ell(0.8, 11.7, 3.3, 1.5), m('h.frost'), { group: g + 1, bevel: 1.1, local: H });
        r.fill(H.poly([-0.6, 12.4, 1.2, 15, 1.9, 14.6, 2.2, 12.4]), m('h.frost2'), { group: g, bevel: 0.8 });
        // Piped swirl lines between the tiers.
        r.line(H.x(-5.6, 8.6), H.y(-5.6, 8.6), H.x(5.4, 9.2), H.y(5.4, 9.2), m('h.frost'), 1, g);
        r.line(H.x(-3.6, 10.6), H.y(-3.6, 10.6), H.x(4.4, 11), H.y(4.4, 11), m('h.frost'), 1, g + 1);
        // The liner over the bottom tier.
        r.fill(liner, m('h.liner'), { group: g + 2, bevel: 1, local: H });
        r.fill(H.cap(-5.1, 4.3, 5.4, 4.7, 0.6), m('h.rim'), { group: g + 2, bevel: 0.6 });
        // A gumdrop on each crown point.
        tops.forEach(([x, y], i) => {
          if (i === 4) return;
          r.fill(H.poly([x - 0.9, y - 0.2, x + 0.9, y - 0.2, x + 0.6, y + 0.8, x, y + 1.2, x - 0.6, y + 0.8]), m(`h.gem${i % 3}`), { group: g + 2 });
        });
        // Sprinkles all over the frosting; one twinkles each frame.
        const sp: [number, number][] = [[-4.4, 8.2], [-1.6, 8.8], [3.6, 8.4], [-3, 10.4], [0.6, 10.2], [3.4, 10.6], [-1.4, 12], [1.8, 12.4], [5.2, 8.9]];
        sp.forEach(([x, y], i) => r.dot(H.x(x, y), H.y(x, y), m(sk('h.', i)), i % 4 === ph ? 4 : 3, g + 1));
        // The cherry on top, jiggling, its stem curling.
        const cx = 1.4 + jig, cy = 16.2;
        r.line(H.x(cx + 0.2, cy + 1), H.y(cx + 0.2, cy + 1), H.x(cx - 1.2 - jig, cy + 2.8), H.y(cx - 1.2 - jig, cy + 2.8), m('h.stem'), 2, g + 3);
        r.fill(H.circ(cx, cy, 1.45), m('h.cherry'), { group: g + 3, bevel: 1.1 });
        r.dot(H.x(cx + 0.5, cy + 0.6), H.y(cx + 0.5, cy + 0.6), m('h.glint'), 3, g + 3);
      },
    }),
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Candy Stripe Vest
// -----------------------------------------------------------------------------

function candyStripeVest(): SkinArt {
  // A strawberry-and-cream candy-striped vest with mint icing piping, a hem of vanilla frosting dripping
  // over the belt of chocolate squares, candy buttons down the front that glow like boiled sweets, a grape
  // taffy bow tie, puffs of whipped cream at the shoulders, and a great pink satin bow tied at the back.
  return {
    mats: {
      jerkin: { base: 0xffe0ee, ramp: [0xd85496, 0xf684bc, 0xffdcec, 0xfff6fa, WHITE], tex: stripes(3, 0.04) },
      jerkinDark: candy(MINT),
      'k.srCream': ramp(CREAM), 'k.srMint': candy(MINT), 'k.srChoc': ramp(CHOC, (x) => (wrap(x, 2.2) < 0.45 ? -1 : 0), true),
      'k.srBow': candy(PINK), 'k.srKnot': candy(GRAPE), 'k.srTie': candy(GRAPE),
      'k.srB0': gem(0xff7ab8), 'k.srB1': gem(0xffd860), 'k.srB2': gem(0x7ac8ff),
      ...sprinkleMats('k.sr'),
    },
    chest: {
      sleeve: 'k.srMint', sleeveLen: 0.45, forearm: null, belt: 'k.srChoc', pauldron: null, trim: 'jerkinDark',
      back(r, T, m, c) {
        // The big satin bow at the small of the back, loops standing out behind, tails swinging.
        const ph = r.phase % 4, fl = [0, 0.5, 0.9, 0.5][ph] + c.sway * 2;
        const x = -3.4, y = c.top * 0.42;
        const B = new Xf(T.x(x, y), T.y(x, y), T.ang + Math.PI, T.sx, T.sy);
        r.fill(B.poly([0, -0.6, 2.6 + fl * 0.3, -6.4 - fl * 0.2, 4.4 + fl * 0.5, -5.8, 1.2, -0.4]), m('k.srBow'), { group: 41, bevel: 0.9, toneBias: -1 });
        r.fill(B.poly([0, -0.4, -1 + fl * 0.4, -6.8 - fl * 0.3, 0.8 + fl * 0.6, -6.6, 1, -0.2]), m('k.srBow'), { group: 42, bevel: 0.9, toneBias: -1 });
        r.fill(B.ell(2.8, 3.2, 3.6, 2.2, 0.9), m('k.srBow'), { group: 43, bevel: 1.2 });
        r.fill(B.ell(3, -2.2, 3.4, 2, -0.7), m('k.srBow'), { group: 44, bevel: 1.2, toneBias: -1 });
        r.fill(B.ell(0.6, 0.4, 1.3, 1.5), m('k.srKnot'), { group: 45, bevel: 0.8 });
      },
      shoulder(r, S, m, c) {
        // A puff of whipped cream piped in a swirl, sprinkles on it.
        const o = { group: c.g, toneBias: c.bias };
        r.fill(S.ell(0, 0.8, 3, 1.9), m('k.srCream'), { ...o, bevel: 1.4 });
        r.fill(S.ell(-0.2, 2.2, 2, 1.3), m('k.srCream'), { ...o, bevel: 1 });
        r.fill(S.poly([-0.6, 3, 0.4, 4.4, 0.9, 3]), m('k.srCream'), { ...o, bevel: 0.6 });
        if (c.far) return;
        r.dot(S.x(-1.6, 1), S.y(-1.6, 1), m('k.srs0'), 3, c.g);
        r.dot(S.x(1.2, 1.4), S.y(1.2, 1.4), m('k.srs2'), 3, c.g);
        r.dot(S.x(0, 2.6), S.y(0, 2.6), m('k.srs1'), 3, c.g);
      },
      over(r, T, m, c) {
        const b = c.body, top = c.top, ph = r.phase % 4;
        const fx = b.chestPush * 0.7 + 1.6;
        // Candy buttons down the front, glowing like boiled sweets; a glint runs down them.
        for (let k = 0; k < 3; k++) {
          const y = top - 4.6 - k * 2.6, x = fx - 1.2 - k * 0.1;
          r.fill(T.circ(x, y, 0.75), m(`k.srB${k}`), { group: c.g });
          if (k === ph % 3) r.dot(T.x(x + 0.3, y + 0.3), T.y(x + 0.3, y + 0.3), m('k.srCream'), 4, c.g);
        }
        // The grape taffy bow tie at the collar.
        const tx = b.chestPush * 0.5 + 1.3, ty = top - 0.9;
        r.fill(T.poly([tx, ty, tx - 1.2, ty + 1.3, tx - 1.4, ty - 1.2]), m('k.srTie'), { group: c.g + 1, bevel: 0.6 });
        r.fill(T.poly([tx, ty, tx + 1.3, ty + 1.2, tx + 1.2, ty - 1.3]), m('k.srTie'), { group: c.g + 1, bevel: 0.6 });
        r.fill(T.circ(tx, ty, 0.6), m('k.srKnot'), { group: c.g + 1, bevel: 0.4 });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Licorice Leggings
// -----------------------------------------------------------------------------

function licoriceLeggings(): SkinArt {
  // Glossy black licorice twisted like rope, banded in strawberry candy at hip and knee, and a licorice
  // allsort (pink, black and lemon layers) for each knee guard with a sugar sparkle hopping over it.
  return {
    mats: {
      windLeg: { base: LICORICE[2], ramp: LICORICE, shiny: true, tex: twist },
      windTrim: candy(PINK, (x) => (wrap(x * 2, 1.4) < 0.5 ? 1 : 0)),
      'l.srPink': candy(PINK), 'l.srLemon': candy(LEMON), 'l.srBlack': { base: LICORICE[2], ramp: LICORICE, shiny: true },
      'l.srSugar': gem(0xfff0fa),
    },
    legs: {
      mat: 'windLeg', trim: 'windTrim', knee: null, tasset: null, rune: null, wraps: null, bulk: 0.15,
      over(r, t, m, c) {
        const w = c.w, ph = r.phase % 4;
        const o = { group: c.g + 20, toneBias: c.bias };
        // The allsort on the knee: a square of pink, black and lemon layers, sugared.
        const kx = 0.6, ky = w * 0.3, s = c.body.kneeR + 0.5;
        const K = new Xf(t.x(kx, ky), t.y(kx, ky), t.ang, t.sx, t.sy);
        r.fill(K.rect(0, 0, s, s, 0.3), m('l.srBlack'), { ...o, bevel: 0.8 });
        r.fill(K.rect(s * 0.62, 0, s * 0.38, s - 0.1, 0.2), m('l.srPink'), { ...o, bevel: 0.6, noLine: true });
        r.fill(K.rect(-s * 0.62, 0, s * 0.38, s - 0.1, 0.2), m('l.srLemon'), { ...o, bevel: 0.6, noLine: true });
        if (c.far) return;
        // A sugar sparkle on the allsort, hopping corner to corner.
        const [dx, dy] = [[0.5, 0.5], [-0.5, 0.6], [-0.4, -0.5], [0.6, -0.4]][ph];
        r.dot(K.x(dx * s, dy * s), K.y(dx * s, dy * s), m('l.srSugar'), 3, c.g + 20);
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Marshmallow Boots
// -----------------------------------------------------------------------------

function marshmallowBoots(): SkinArt {
  // Puffy boots of vanilla marshmallow on graham-cracker soles, a strawberry marshmallow for a cuff, a candy
  // heart at the ankle, and a tuft of cotton candy fluttering at the back.
  return {
    mats: {
      zephyr: { base: CREAM[2], ramp: CREAM },
      zephyrTrim: candy(PINK),
      'k.srMallow': ramp(CREAM), 'k.srMallowP': ramp([0xa05878, 0xe08ab0, 0xffbcd8, 0xffe0ee, 0xfff6fa]),
      'k.srGraham': ramp(COOKIE, (x, y) => (hash(Math.floor(x * 1.4), Math.floor(y * 1.4)) < 0.16 ? -1 : 0)),
      'k.srFloss': ramp([0xa05890, 0xe08ac8, 0xffb8e4, 0xffdcf2, WHITE]), 'k.srFlossB': ramp(SKY),
      'k.srHeart': gem(HOT_PINK),
    },
    boots: {
      wing: null, height: 0.62, bulk: 0.55,
      over(r, shin, foot, m, c) {
        const ph = r.phase % 4, w = c.w;
        const o = { group: c.g, toneBias: c.bias };
        // The graham-cracker sole.
        r.fill(foot.cap(-1.6, -1.5, c.toe + 0.2, -1.3, 0.75), m('k.srGraham'), { ...o, bevel: 0.6 });
        // Cotton candy tufted at the back of the ankle, fluttering.
        if (!c.far) {
          const fl = [0, 0.3, 0.5, 0.25][ph];
          r.fill(union(shin.circ(c.top * 0.55 + fl, -w - 1.1, 1.3), shin.circ(c.top * 0.3 - fl * 0.4, -w - 1.5 - fl * 0.3, 1.1)), m('k.srFloss'), { group: c.g + 30, bevel: 1, toneBias: c.bias, softLight: true });
          r.fill(shin.circ(c.top * 0.42 + fl * 0.6, -w - 2.3 - fl * 0.3, 0.8), m('k.srFlossB'), { group: c.g + 31, bevel: 0.7, toneBias: c.bias, softLight: true });
        }
        // The puffy marshmallow boot, a plump toe, and a strawberry marshmallow for a cuff.
        r.fill(shin.ell(c.top * 0.48, 0.1, c.top * 0.5 + 0.4, w + 0.8), m('k.srMallow'), { ...o, bevel: 1.6 });
        r.fill(foot.ell(c.toe - 1.6, 0, 2.1, 1.55), m('k.srMallow'), { ...o, bevel: 1.3 });
        r.fill(shin.ell(c.top + 0.2, 0, 1.15, w + 0.75), m('k.srMallowP'), { ...o, bevel: 1 });
        // A candy heart at the ankle.
        if (!c.far) r.fill(shin.poly([1.8, w * 0.5 + 0.2, 2.8, w * 0.5 - 0.8, 3.4, w * 0.5 - 0.1, 3.2, w * 0.5 + 0.4, 3.4, w * 0.5 + 0.9, 2.8, w * 0.5 + 1.4]), m('k.srHeart'), { group: c.g });
      },
    },
    ...FX,
  };
}

// -----------------------------------------------------------------------------
// Aura
// -----------------------------------------------------------------------------

const AC = {
  sprinkle: SPRINKLE.map((c) => css(c)), frost: css(PINK[3]), cream: css(CREAM[3]), white: css(WHITE),
  bubble: css(0xd8f4ff), bubbleHi: css(WHITE), pink: css(PINK[2]), mint: css(MINT[2]),
  sweet: [[PINK[2], PINK[1]], [MINT[2], MINT[1]], [LEMON[2], LEMON[1]]].map(([a, b]) => [css(a), css(b)]),
};
/** Wrapped sweets orbiting the fighter: height above the feet, orbit radius, speed (signed), phase. */
const SWEETS: [number, number, number, number][] = [[12, 18, 1.1, 0], [24, 16, -0.85, 2.2], [33, 14, 1.3, 4.1]];
const SPR_N = 22;

/** The full-set aura around the feet at (x, y) art pixels; `t` is seconds. */
export function sugarrushAura(g: CanvasRenderingContext2D, x: number, y: number, t: number, layer: Layer): void {
  const back = layer === 'back';
  const RX = 15, RY = 3.6;
  // A ring of strawberry frosting piped on the ground, scalloped, a sugary shine running round it.
  const run = Math.floor(t * 9) % 30;
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2, s = Math.sin(a);
    if ((s < 0) !== back) continue;
    const px = Math.round(x + Math.cos(a) * RX), py = Math.round(y + s * RY);
    g.globalAlpha = back ? 0.6 : 0.8;
    g.fillStyle = i === run || i === (run + 15) % 30 ? AC.white : i % 3 === 0 ? AC.frost : AC.pink;
    g.fillRect(px, py, 1, 1);
  }
  // Rainbow sprinkles scattered round it, drifting slowly round, each lying its own way.
  g.globalAlpha = 0.95;
  const spin = t * 0.35;
  for (let i = 0; i < SPR_N; i++) {
    const a = (i / SPR_N) * Math.PI * 2 + spin + hash(i, 3) * 0.2, s = Math.sin(a);
    if ((s < 0) !== back) continue;
    const rr = 1 + (hash(i, 7) - 0.5) * 0.36 + (i % 2 ? 0.14 : -0.12);
    g.fillStyle = AC.sprinkle[i % 6];
    const flat = (i + Math.floor(t * 2 + hash(i, 9) * 4)) % 3 !== 0;
    g.fillRect(Math.round(x + Math.cos(a) * RX * rr), Math.round(y + s * RY * rr), flat ? 2 : 1, flat ? 1 : 2);
  }
  // Soda fizz: bubbles rising round the fighter, wobbling, each popping into a burst of sprinkles at the top.
  for (let k = 0; k < 6; k++) {
    const a = k * 2.4 + 0.5 + t * 0.3, s = Math.sin(a);
    if ((s < 0) !== back) continue;
    const per = 1.9 + (k % 3) * 0.35, u = ((t + k * 0.71) / per) % 1;
    const top = 18 + (k % 3) * 7;
    const px = Math.round(x + Math.cos(a) * (RX - 1 - (k % 2) * 4) + Math.sin(t * 5 + k) * 0.8), py = Math.round(y + s * RY - u * top);
    if (u < 0.86) {
      g.globalAlpha = Math.min(1, u * 6);
      g.fillStyle = AC.bubble;
      if (k % 3 === 0 && u > 0.35) {
        // A bigger bubble: a hollow ring of four pixels with a white glint.
        g.fillRect(px - 1, py, 1, 1); g.fillRect(px + 1, py, 1, 1); g.fillRect(px, py - 1, 1, 1); g.fillRect(px, py + 1, 1, 1);
        g.fillStyle = AC.bubbleHi; g.fillRect(px, py - 1, 1, 1);
      } else g.fillRect(px, py, 1, 1);
    } else {
      // Pop: four sprinkles flying out from where the bubble was.
      const d = 1 + Math.round((u - 0.86) * 20);
      g.globalAlpha = 1 - (u - 0.86) * 5;
      g.fillStyle = AC.sprinkle[k % 6]; g.fillRect(px - d, py, 1, 1);
      g.fillStyle = AC.sprinkle[(k + 2) % 6]; g.fillRect(px + d, py, 1, 1);
      g.fillStyle = AC.sprinkle[(k + 4) % 6]; g.fillRect(px, py - d, 1, 1);
      g.fillStyle = AC.white; g.fillRect(px, py, 1, 1);
    }
  }
  // Wrapped sweets orbiting at different heights, bobbing, their wrapper twists flicking as they turn.
  for (let k = 0; k < SWEETS.length; k++) {
    const [h, R, sp, p0] = SWEETS[k];
    const a = p0 + t * sp, s = Math.sin(a);
    if ((s < 0) !== back) continue;
    const px = Math.round(x + Math.cos(a) * R), py = Math.round(y - h + s * 2 + Math.sin(t * 2.6 + k * 2) * 1.4);
    const [lit, dk] = AC.sweet[k];
    g.globalAlpha = back ? 0.75 : 1;
    g.fillStyle = dk; g.fillRect(px - 1, py, 3, 2);
    g.fillStyle = lit; g.fillRect(px - 1, py - 1, 3, 2);
    g.fillStyle = AC.white; g.fillRect(px - 1, py - 1, 1, 1);
    const flick = Math.floor(t * 6 + k) % 2;
    g.fillStyle = AC.cream;
    g.fillRect(px - 2, py - 1 + flick, 1, 2 - flick); g.fillRect(px - 3, py - 1 - flick + 1, 1, 1);
    g.fillRect(px + 2, py - flick, 1, 2 - flick); g.fillRect(px + 3, py - 1 + flick, 1, 1);
  }
  // Now and then a wrapped sweet hops up off the ring and bursts in a ring of sprinkles.
  const cyc = 1.3, n = Math.floor(t / cyc), u = (t / cyc) % 1;
  const a = hash(n, 41) * Math.PI * 2, s = Math.sin(a);
  if ((s < 0) === back) {
    const bx = Math.round(x + Math.cos(a) * RX * 0.9), by0 = y + s * RY;
    if (u < 0.55) {
      const v = u / 0.55, py = Math.round(by0 - Math.sin(v * Math.PI * 0.5) * 16);
      g.globalAlpha = 1;
      // The sweet: a round candy with twisted wrapper ends either side.
      g.fillStyle = n % 2 ? AC.pink : AC.mint; g.fillRect(bx - 1, py - 1, 3, 2);
      g.fillStyle = AC.white; g.fillRect(bx - 1, py - 1, 1, 1);
      g.fillStyle = AC.cream; g.fillRect(bx - 3, py - 2, 1, 1); g.fillRect(bx - 2, py - 1, 1, 1); g.fillRect(bx + 2, py - 1, 1, 1); g.fillRect(bx + 3, py, 1, 1);
    } else if (u < 0.85) {
      const v = (u - 0.55) / 0.3, py = Math.round(by0 - 16), d = 1 + Math.round(v * 5);
      g.globalAlpha = 1 - v * 0.7;
      for (let k = 0; k < 8; k++) {
        const b = (k / 8) * Math.PI * 2 + n;
        g.fillStyle = AC.sprinkle[(k + n) % 6];
        g.fillRect(Math.round(bx + Math.cos(b) * d), Math.round(py + Math.sin(b) * d * 0.8 + v * 2), 1, 1);
      }
      if (v < 0.4) { g.fillStyle = AC.white; g.fillRect(bx, py, 1, 1); }
    }
  }
  g.globalAlpha = 1;
}

export const SUGARRUSH: Record<string, SkinArt> = {
  'warhammer.sugarrush': { weapon: lollipopSmasher, ...FX },
  'buckler.sugarrush': { weapon: cookieBuckler, ...FX },
  'echo_stone.sugarrush': gumballEcho,
  'storm_crown.sugarrush': cupcakeCrown(),
  'leather_jerkin.sugarrush': candyStripeVest(),
  'windrunner_leggings.sugarrush': licoriceLeggings(),
  'zephyr_boots.sugarrush': marshmallowBoots(),
};

