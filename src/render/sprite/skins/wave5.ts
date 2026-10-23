import { mix } from '../../pixel/color';
import { material, type MaterialSpec, type Tex } from '../../pixel/raster';
import { union, type Shape } from '../../pixel/sdf';
import { grain, speckle } from '../../pixel/tex';
import { filler, type UsableArt } from '../usables';
import { fillAll, M, type WeaponArt } from '../weaponKit';
import type { Xf } from '../xform';
import type { SkinArt } from './index';
import { glow, mats, plain, shiny, wrap } from './kit';

/**
 * Fifth-wave skins (v0.99.0): for the eight items of that wave and the fist
 * weapons. Rare ones recolour the stock item by its own material names
 * (weapons3.ts, fists.ts, usables.ts, armour2.ts, icons.ts); the mythic and
 * legendary ones reshape it in the same space as the stock art.
 */

const ramp = (r: number[], o: Partial<MaterialSpec> = {}): MaterialSpec => ({ base: r[2], ramp: r, ...o });

/** Legendary sparkles (or flames) and the swing trail in one colour family. */
const legend = (spark: number, spark2: number, kind?: 'twinkle' | 'flame'): Pick<SkinArt, 'fx' | 'trail'> => ({
  fx: { spark, spark2, ...(kind ? { kind } : {}) },
  trail: [spark, mix(spark, spark2, 0.55)],
});

/** Caps through a list of points (x, y, radius). */
function bend(t: Xf, pts: number[]): Shape {
  const out: Shape[] = [];
  for (let i = 0; i + 5 < pts.length; i += 3) out.push(t.cap(pts[i], pts[i + 1], pts[i + 3], pts[i + 4], pts[i + 2], pts[i + 5]));
  return union(...out);
}

/** Overlapping scales (weapon or hand space). */
const scales: Tex = (x, y) => (wrap(x * 0.9 + (Math.floor(y * 0.9) & 1) * 0.55, 1.1) < 0.3 ? -1 : 0);
/** Veins of light crawling through dark glass. */
const veins: Tex = (x, y, ph) => (Math.abs(Math.sin(x * 0.7 + Math.sin(y * 1.3 + ph * 0.8) * 1.6)) < 0.14 ? 4 : 0);
/** Wind-rippled sand. */
const dunes: Tex = (x, y) => (wrap(y * 1.3 + Math.sin(x * 0.6) * 0.9, 2.2) < 0.5 ? -1 : 0);

// -----------------------------------------------------------------------------
// Crimson Tithe (bloodletter, legendary)
// -----------------------------------------------------------------------------

/** A blade of dark blood-glass, veins of red light pulsing through it, bat-wing quillons and a heart at the pommel. */
function crimsonTithe(): WeaponArt {
  return {
    tip: 29.5,
    mats: {
      blade: material(ramp([0x1e0408, 0x3e0a12, 0x6a1220, 0x9a1e2e, 0xff5a5a], { shiny: true, tex: veins })),
      edge: material({ base: 0xff6a6a, glow: true }),
      guard: material({ base: 0x2a1a24, shiny: true, step: 0.14 }),
      wing: material({ base: 0x4a1a2a, step: 0.13 }),
      grip: M.wrap(0x1a0a10), heart: material({ base: 0xff2a3a, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-5.4, 0, -0.8, 0, 1.2, 1.05)], m('grip'), o, 1);
      for (let x = -4.8; x < -1; x += 1.3) r.dot(t.x(x, 0.4), t.y(x, 0.4), m('guard'), 3, g);
      // A heart-shaped pommel, beating.
      fillAll(r, [union(t.circ(-6.4, 0.7, 1.1), t.circ(-6.4, -0.7, 1.1), t.poly([-6.8, -1.6, -8.8, 0, -6.8, 1.6]))], m('heart'), o, 1);
      // The jagged blade: teeth biting forward along the edge, a hooked tip.
      const pts = [1.6, -1.5];
      for (let i = 0; i < 7; i++) pts.push(3.4 + i * 3.4, -2.3 - (i % 2) * 0.2, 5 + i * 3.4, -1.7);
      pts.push(27.6, -2.6, 30, -0.2, 27.4, 1.6, 16, 1.9, 1.6, 1.5);
      fillAll(r, [t.poly(pts)], m('blade'), o, 1.4);
      r.line(t.x(3, -1.2), t.y(3, -1.2), t.x(27, -1.6), t.y(27, -1.6), m('edge'), 3, g);
      // Bat-wing quillons.
      fillAll(r, [
        t.poly([1.4, 1, 0.2, 2.2, -1, 5.4, 0.6, 4.6, 1.4, 5.8, 2, 3.8, 2.8, 4.2, 2.2, 1.4]),
        t.poly([1.4, -1, 0.2, -2.2, -1, -5.4, 0.6, -4.6, 1.4, -5.8, 2, -3.8, 2.8, -4.2, 2.2, -1.4]),
      ], m('wing'), o, 1);
      fillAll(r, [t.rect(1, 0, 1, 1.8, 0.4)], m('guard'), o, 1);
      r.dot(t.x(1, 0), t.y(1, 0), m('heart'), 4, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Kraken Grip (grapnel, mythic)
// -----------------------------------------------------------------------------

/** A curling purple tentacle for a line, its tip a cluster of hooked barnacle claws. */
function krakenGrip(): WeaponArt {
  return {
    tip: 9.2,
    mats: {
      flesh: material(ramp([0x2a0e3a, 0x4a1a5e, 0x7a3a8e, 0xa868b8, 0xe0b0ea], { shiny: true })),
      sucker: material({ base: 0xf0c8e0 }), claw: material({ base: 0xe8dcc0, shiny: true, step: 0.14 }),
      glint: material({ base: 0x7affe8, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      // The tentacle coils back round the fist, then reaches forward.
      fillAll(r, [bend(t, [-3.2, -1.6, 0.7, -2, 0.6, 0.85, 0, 0, 0.95, 3, 0.4, 0.9, 5.6, -0.2, 0.75])], m('flesh'), o, 1.2);
      for (const x of [0.6, 2.4, 4.2]) r.dot(t.x(x, -0.7), t.y(x, -0.7), m('sucker'), 3, g);
      // Hooked claws flaring off the tip.
      fillAll(r, [
        t.poly([5.2, -0.4, 8.8, -2.6, 9.2, -1.2, 6.6, 0]),
        t.poly([5.2, 0.4, 8.8, 2.6, 9.2, 1.2, 6.6, 0]),
        t.poly([5.6, -0.4, 9.6, 0, 5.6, 0.4]),
      ], m('claw'), o, 0.8);
      r.dot(t.x(5.4, 0), t.y(5.4, 0), m('glint'), 3, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Fists
// -----------------------------------------------------------------------------

/** Dragon Fists: scaled crimson gauntlets, horned knuckles, a fire-gem on the back of each hand. */
function dragonFists(): WeaponArt {
  return {
    tip: 5.2,
    mats: {
      scale: material(ramp([0x3a0a08, 0x6a1410, 0xa82a1a, 0xe0582a, 0xffb060], { shiny: true, tex: scales })),
      cuff: material({ base: 0x2a1a14, shiny: true }), horn: material({ base: 0xf0e0c0, shiny: true, step: 0.14 }),
      gem: material({ base: 0xffa030, glow: true }), gold: M.gold(),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-5.6, 0, -2.4, 0, 2.1, 2.4)], m('cuff'), o, 1.2);
      fillAll(r, [t.rect(-2.6, 0, 0.45, 2.5)], m('gold'), o, 0.6);
      fillAll(r, [union(t.ell(1.1, 0, 3.4, 2.9), t.ell(-0.8, 0.2, 2.5, 2.6))], m('scale'), o, 2);
      // Horns jutting from the knuckles.
      fillAll(r, [t.poly([3.4, -2, 5.6, -2.8, 4, -1]), t.poly([3.8, 0.2, 6.2, 0.4, 4.2, 1.2]), t.poly([3.2, 1.8, 5.2, 3, 3.6, 2.6])], m('horn'), o, 0.6);
      fillAll(r, [t.ell(0, 2.2, 1.1, 0.8)], m('gold'), o, 0.6);
      r.dot(t.x(0, 2.2), t.y(0, 2.2), m('gem'), 4, g);
    },
  };
}

/** Wolf Fangs: a knuckle-duster cast as a wolf's lower jaw, fangs for spikes and a moonstone eye. */
function wolfFangs(): WeaponArt {
  return {
    tip: 6.2,
    mats: {
      tape: material({ base: 0x5a5a6a }), iron: material(ramp([0x1e2028, 0x3a3e4a, 0x646a7a, 0x9aa2b4, 0xe0e8f4], { shiny: true })),
      fang: material({ base: 0xf2ead8, shiny: true, step: 0.14 }), fur: material({ base: 0x8a8a96, tex: speckle(0.2, -1) }),
      moon: material({ base: 0xcfe8ff, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-4.2, 0, -1.4, 0, 1.75, 1.95)], m('tape'), o, 1);
      // A ruff of grey fur at the wrist.
      fillAll(r, [union(t.circ(-3.6, 1.6, 0.9), t.circ(-3.6, 0, 1), t.circ(-3.6, -1.6, 0.9))], m('fur'), o, 0.8);
      // The jaw: a curved iron bar with a snout ridge.
      fillAll(r, [union(t.rect(1.8, 0, 1.3, 3.1, 0.7), t.cap(0.4, -2.6, -1.4, -1.8, 0.8))], m('iron'), o, 1.3);
      const fangs: Shape[] = [];
      for (const [y, l] of [[-2, 2.4], [-0.7, 3.6], [0.7, 3.6], [2, 2.4]] as const) fangs.push(t.poly([2.9, y - 0.6, 2.9 + l + 0.6, y + (y > 0 ? -0.3 : 0.3), 2.9, y + 0.6]));
      fillAll(r, [union(...fangs)], m('fang'), o, 0.7);
      r.dot(t.x(1.6, 1.2), t.y(1.6, 1.2), m('moon'), 4, g);
    },
  };
}

/** Lotus Wraps: rose silk wound to the elbow, a lotus blooming on the back of the hand, jade beads at the wrist. */
function lotusWraps(): WeaponArt {
  return {
    tip: 4.1,
    mats: {
      silk: material({ base: 0xf0a8c0, tex: (x, y) => (wrap(x * 0.8 + y * 0.5, 1.6) < 0.4 ? -1 : 0) }),
      silkDk: material({ base: 0xc0607e }), jade: material({ base: 0x3ac08a, shiny: true }),
      petal: material({ base: 0xffe0ea, shiny: true, step: 0.12 }), heart: material({ base: 0xffe08a, glow: true }),
    },
    draw(r, t, m, o) {
      const g = o.group ?? 6;
      fillAll(r, [t.cap(-7.4, 0, 0.6, 0, 1.7, 2.15)], m('silk'), o, 1.4);
      for (const x of [-6.2, -4.6, -0.8]) r.line(t.x(x - 0.6, -1.9), t.y(x - 0.6, -1.9), t.x(x + 0.6, 2), t.y(x + 0.6, 2), m('silkDk'), 2, g);
      for (const y of [-1.8, -0.6, 0.6, 1.8]) fillAll(r, [t.circ(-2.9, y, 0.7)], m('jade'), o, 0.6);
      // The lotus: three petals fanning up off the back of the hand around a glowing heart.
      fillAll(r, [t.poly([-1.4, 1.8, -1.6, 3.8, -0.4, 2.2]), t.poly([1.2, 1.8, 1.6, 3.8, 0.4, 2.2]), t.poly([-0.6, 1.9, 0, 4.4, 0.6, 1.9])], m('petal'), o, 0.6);
      r.dot(t.x(0, 2.1), t.y(0, 2.1), m('heart'), 4, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Whirlpool Conch (maelstrom flask, legendary)
// -----------------------------------------------------------------------------

/** A pearly spiral conch, the sea roaring inside it in a ring of light, stoppered with coral. */
function whirlpoolConch(): UsableArt {
  return {
    mats: mats({
      shell: ramp([0x8a5a4a, 0xc89a80, 0xf0d0b8, 0xfff0e2, 0xffffff], { shiny: true, tex: (x, y) => (wrap(x * 1.2 - y * 0.5, 1.8) < 0.45 ? -1 : 0) }),
      lip: plain(0xf09a9a),
      coral: shiny(0xff6a5a),
      sea: glow(0x3ae8e0),
      foam: glow(0xeafffc),
    }),
    glow: [0xc8fff8, 0x1a8a9a],
    draw(r, t, m, o = {}) {
      const fill = filler(r, o);
      const g = o.group ?? 7;
      const k = (o.frame ?? 0) % 3;
      // Coral stopper branching out of the mouth.
      if (!o.open) fill(union(t.cap(3, 0, 5, -0.6, 0.55), t.cap(4.2, -0.4, 5.2, 0.8, 0.4), t.cap(4.4, -0.5, 5.6, -1.6, 0.35)), m('coral'), 0.6);
      // The shell: whorls narrowing toward the spire at the bottom.
      fill(union(t.ell(-0.6, 0, 3.6, 3.2), t.cap(-3, 0.4, -5.6, 1.4, 1.9, 0.5), t.cap(1.6, 0, 3.4, 0, 2.2, 1.3)), m('shell'), 2.2);
      fill(t.ell(1.8, -1.2, 1.6, 1.4), m('lip'), 1);
      for (const [x, y] of [[-3.4, 0.6], [-1.6, -0.8], [0.4, 1.4]]) r.dot(t.x(x, y), t.y(x, y), m('shell'), 1, g);
      // The roaring sea inside: a ring of light turning in the mouth.
      const a = k * 2.1;
      for (let i = 0; i < 3; i++) {
        const b = a + i * 2.1;
        r.dot(t.x(1.8 + Math.cos(b) * 0.8, -1.2 + Math.sin(b) * 0.7), t.y(1.8 + Math.cos(b) * 0.8, -1.2 + Math.sin(b) * 0.7), m(i ? 'sea' : 'foam'), 4, g);
      }
    },
  };
}

export const WAVE5: Record<string, SkinArt> = {
  // --- Rare: the stock item recoloured ----------------------------------------------------------
  // Bone sawn into a blade, an ink groove and a sickly green eye in the pommel.
  'bloodletter.bonesaw': {
    mats: {
      blade: shiny(0xe8dcc0, speckle(0.08, -1), 0.13), teeth: shiny(0xc8b48a), groove: plain(0x1a1418), guard: plain(0x8a7a5a, grain(-1)),
      grip: plain(0x3a2a20), wrapHi: plain(0x6a5440), ruby: glow(0x9aff6a),
    },
    trail: [0xf4ecd8, 0x9a8a6a],
  },
  // Pitch-black iron, tarred rope and brass points.
  'grapnel.tarred': {
    mats: { iron: shiny(0x2a2a30), point: shiny(0xd8a840, undefined, 0.16), rope: plain(0x3a3028), ropeDark: plain(0x1e1814) },
    trail: [0xe8d8b0, 0x6a5a3a],
  },
  // An ash cloud with fire in its belly.
  'storm_cloud.ember': {
    mats: { cloud: plain(0x6a5a58, speckle(0.12, -1)), cloudDark: plain(0x2e2424), storm: glow(0xff8a2a), stormHot: glow(0xfff0a0) },
    glow: [0xffd890, 0xe0502a],
  },
  // A muddy bottle of bog water, a swamp light swirling in it.
  'maelstrom_flask.bog': {
    mats: { glass: shiny(0x8aa070, undefined, 0.12), liquid: plain(0x2a4a2a), swirl: glow(0xb8ff6a), band: shiny(0x4a9a7a), cork: plain(0x6a4626, grain()) },
    glow: [0xd8ffa0, 0x3a6a2a],
  },
  // All black, a bone beak, violet sheen and a red eye-gem.
  'magpie_mask.raven': {
    mats: {
      'mag.black': ramp([0x060508, 0x0e0c12, 0x1c1822, 0x302a3a, 0x4e4660], { shiny: true }),
      'mag.white': ramp([0x2a2630, 0x3e3846, 0x58506a, 0x72698a, 0x9a90b0]),
      'mag.sheen': ramp([0x140a24, 0x2a1450, 0x4a2a8a, 0x7a50c0, 0xc8a0ff], { shiny: true }),
      'mag.beak': shiny(0xe0d4b8), 'mag.coin': shiny(0xc8d0dc), 'mag.gem': glow(0xff3a4a),
    },
  },
  // Gold-plated grudges over royal purple, each slight tallied in cold blue light.
  'grudge_mail.gilded': {
    mats: {
      'gm.cloth': ramp([0x1a0a2a, 0x2e1446, 0x4a2270, 0x6a3a98, 0x9a6ac8]),
      'gm.iron': ramp([0x4a2e08, 0x86601a, 0xc8962e, 0xf0c860, 0xfff2c0], { shiny: true }),
      'gm.dark': ramp([0x24160a, 0x3e2810, 0x5a3c18, 0x7a5424, 0xa07a3a], { shiny: true }),
      'gm.chain': shiny(0xe0b84a), 'gm.spike': shiny(0xe0e4ec, undefined, 0.16),
      'gm.tally': glow(0x8ad8ff), 'gm.eye': glow(0xc8f4ff),
    },
  },
  // Navy trousers on clockwork copper springs.
  'springheel_leggings.clockwork': {
    mats: {
      'sh.cloth': ramp([0x0a1022, 0x16203e, 0x24345e, 0x3a4e84, 0x6a80b4]),
      'sh.pad': ramp([0x06080e, 0x10162a, 0x1c2440, 0x2c3858, 0x46567a]),
      'sh.spring': ramp([0x4a1e08, 0x7a3a14, 0xb8642a, 0xe8985a, 0xffd8b0], { shiny: true }),
      'sh.strap': plain(0x2a1a10),
    },
  },
  // Sand-gold silk with turquoise fittings and an amber gem.
  'mirage_boots.dune': {
    mats: {
      'mi.boot': ramp([0x6a4a1e, 0x9a7032, 0xd0a052, 0xecc882, 0xfff0c8], { tex: dunes }),
      'mi.gold': ramp([0x0a3a3a, 0x146a64, 0x24a098, 0x5ad0c4, 0xb8fff4], { shiny: true }),
      'mi.gem': glow(0xffa030), 'mi.ghost': glow(0xffe8b0),
    },
  },
  // Gold leather, a black cuff and a diamond badge.
  'boxing_gloves.golden': {
    mats: { leather: shiny(0xe0b030, undefined, 0.15), cuff: plain(0x1a1820), lace: plain(0xe0b030), badge: shiny(0xe8f4ff, undefined, 0.17) },
    trail: [0xfff2c0, 0xc89a28],
  },
  // Volcanic glass knuckles, black tape and a violet eye.
  'spiked_knuckles.obsidian': {
    mats: { tape: plain(0x22202a), brass: shiny(0x2a2238, speckle(0.12, 2), 0.13), spike: shiny(0x9a7ad8, undefined, 0.16), gem: glow(0xc06aff) },
    trail: [0xe0c8ff, 0x7a5aa8],
  },
  // Saffron wraps, jade beads and a golden rune.
  'spirit_wraps.sunset': {
    mats: { wrap: plain(0xf0a040), wrapShade: plain(0xc0602a), bead: shiny(0x3aa070), rune: glow(0xffd860) },
    trail: [0xfff0b0, 0xe08a2a],
  },

  // --- Mythic: reshaped --------------------------------------------------------------------------
  'grapnel.kraken': { weapon: krakenGrip, trail: [0xe0b0ea, 0x7a3a8e] },
  'spiked_knuckles.wolf': { weapon: wolfFangs, trail: [0xe8f4ff, 0x6a7a9a] },
  'spirit_wraps.lotus': { weapon: lotusWraps, trail: [0xffe0ea, 0xd87a9a] },

  // --- Legendary: reshaped, with effects -----------------------------------------------------------
  'bloodletter.tithe': { weapon: crimsonTithe, ...legend(0xff6a6a, 0x6a0a14) },
  'boxing_gloves.dragon': { weapon: dragonFists, ...legend(0xffc860, 0xd83a1a, 'flame') },
  'maelstrom_flask.conch': { usable: whirlpoolConch, glow: [0xc8fff8, 0x1a8a9a], ...legend(0xc8fff8, 0x2ab8c0) },
};
