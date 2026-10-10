import { mix } from '../../pixel/color';
import type { MaterialSpec, Raster, Tex } from '../../pixel/raster';
import { intersect, union } from '../../pixel/sdf';
import { bands, grain, hash, lattice, speckle } from '../../pixel/tex';
import { filler, type UsableArt } from '../usables';
import type { Xf } from '../xform';
import type { SkinArt } from './index';
import { glow, mats, plain, shiny } from './kit';

/**
 * Fourth-wave skins (v0.40.0) for the usable items: the first usable skins.
 * Rare ones recolour the stock item by its material names; the fancy ones
 * bring a reshaped item (`usable`), drawn in item-local space like
 * sprite/usables.ts (origin at the grip, +x up toward the cork or fuse).
 * Every skin's `glow` colours its battle effects (clouds, bursts, patches,
 * drinks), and the legendary ones drift petals or snow (`fx.kind`).
 */

/** Legendary usable effects: drifting particles of one kind, and the colour its throws trail. */
const drift = (spark: number, spark2: number, kind: 'petal' | 'flake'): Pick<SkinArt, 'fx' | 'trail'> => ({
  fx: { spark, spark2, kind },
  trail: [spark, mix(spark, spark2, 0.55)],
});

/** A ramp that steps from dark to a bright fifth tone (lacquer with a highlight). */
const ramped = (ramp: number[], tex?: Tex, shine = true): MaterialSpec => ({ base: ramp[2], ramp, shiny: shine, tex });

// --- Textures (item-local units, about one pixel each) ------------------------------------

/** Ink splashed over black lacquer: a few blots and their spatter. */
const inkSplash: Tex = (x, y) => {
  const v = Math.sin(x * 1.25 + y * 0.45 + 0.6) + Math.sin(y * 1.6 - x * 0.7);
  if (v > 1.25) return 2;
  return hash(Math.floor(x * 1.3) + 7, Math.floor(y * 1.3)) < 0.07 ? 2 : 0;
};

/** Tooled leather: a diamond stamp with a stitched border. */
const tooled: Tex = (x, y) => {
  const d = Math.abs(((x + 40) % 3) - 1.5) + Math.abs(((y + 40) % 3) - 1.5);
  return d < 0.5 ? 1 : d > 2.4 ? -1 : 0;
};

/** Frost feathering on glass. */
const frostGlass: Tex = (x, y) => (Math.abs(Math.sin(x * 2.1 + Math.sin(y * 2.7) * 1.4)) < 0.16 ? 1 : 0);

/** Swamp muck: cakes of mud and a few dark specks. */
const muck: Tex = (x, y) => {
  const v = Math.sin(x * 0.9 + Math.sin(y * 1.4) * 1.8) * Math.sin(y * 0.8 - x * 0.3);
  return v > 0.45 ? -1 : hash(Math.floor(x) + 3, Math.floor(y) - 5) < 0.08 ? 1 : 0;
};

/** Paper ribs of a lantern: thin bamboo bands across it. */
const ribs: Tex = (x) => ((((x + 40) % 1.6) + 1.6) % 1.6 < 0.45 ? -1 : 0);

/** Old cracked bone. */
const boneCrack: Tex = (x, y) => (Math.abs(Math.sin(x * 1.7 + Math.sin(y * 2.3) * 1.2) + Math.sin(y * 0.9)) < 0.14 ? -1 : hash(Math.floor(x), Math.floor(y) + 9) < 0.06 ? -1 : 0);

// --- Sakura Smoke: a paper lantern bomb that bursts into cherry blossom ---------------------

function sakuraLantern(): UsableArt {
  return {
    mats: mats({
      paper: plain(0xf4a6c2, ribs),
      lacquer: ramped([0x140a10, 0x24121c, 0x3a1e2c, 0x5a3044, 0xd8a0b8]),
      gold: shiny(0xe8b840, undefined, 0.16),
      tassel: plain(0xd0283a, bands(1.2, 0.5, -1)),
      petal: plain(0xfff2f8),
      petalPink: plain(0xff8ab4),
      branch: plain(0x3a2028),
      heart: glow(0xffd860),
      fuse: plain(0x2a1a1e),
      hot: glow(0xfff0f6),
      flame: glow(0xff6aa0),
      lamp: glow(0xffe0a0),
    }),
    glow: [0xffc8dc, 0xd85a8a],
    draw(r, t, m, o = {}) {
      const fill = filler(r, o);
      const g = o.group ?? 7;
      const k = (o.frame ?? 0) % 3;
      // A petal drifting off the lantern, then the fuse with its pink spark.
      const pf = [[5.6, 2.6], [4.6, 3.2], [3.6, 3.4]][k];
      r.dot(t.x(pf[0], pf[1]), t.y(pf[0], pf[1]), m('petalPink'), 3, g);
      r.dot(t.x(pf[0] + 0.9, pf[1] + 0.4), t.y(pf[0] + 0.9, pf[1] + 0.4), m('petal'), 2, g);
      fill(t.cap(3.0, 0, 4.2, 0.7, 0.5), m('fuse'), 0.5);
      fill(t.cap(4.2, 0.7, 5.1, 0.1, 0.5), m('fuse'), 0.5);
      r.dot(t.x(5.5, 0.0), t.y(5.5, 0.0), m(k === 1 ? 'flame' : 'hot'), 4, g);
      r.dot(t.x(5.5 + (k === 2 ? 0.9 : 0), k === 0 ? 0.9 : -0.9), t.y(5.5 + (k === 2 ? 0.9 : 0), k === 0 ? 0.9 : -0.9), m('flame'), 4, g);
      // Tassel hanging from the bottom cap, threads fanning out under a gold bead.
      fill(t.cap(-4.9, 0.4, -6.0, 0.8, 0.4), m('tassel'), 0.5);
      fill(t.circ(-6.2, 0.85, 0.7), m('gold'), 0.6);
      fill(t.poly([-6.6, 0.4, -9.0, -0.2, -9.0, 2.1, -6.6, 1.3]), m('tassel'), 0.8);
      // Lacquered caps top and bottom, then the round paper body between them.
      fill(t.rect(2.7, 0, 0.75, 1.9, 0.4), m('lacquer'), 0.9);
      fill(t.rect(-4.6, 0, 0.75, 2.1, 0.4), m('lacquer'), 0.9);
      const body = t.ell(-0.9, 0, 3.45, 3.85);
      fill(body, m('paper'), 2.6);
      // Lamplight peeking out under the top cap.
      fill(intersect(body, t.rect(2.05, 0, 0.35, 1.3)), m('lamp'), 0.5, { noLine: true });
      // Gold rims where paper meets lacquer.
      fill(t.rect(2.05, 0, 0.3, 2.1), m('gold'), 0.4, { noLine: true });
      fill(t.rect(-3.95, 0, 0.3, 2.4), m('gold'), 0.4, { noLine: true });
      // A branch of blossom painted across the paper.
      r.line(t.x(-3.4, -2.6), t.y(-3.4, -2.6), t.x(-1.4, -0.6), t.y(-1.4, -0.6), m('branch'), 1, g);
      r.line(t.x(-1.4, -0.6), t.y(-1.4, -0.6), t.x(0.6, 0.0), t.y(0.6, 0.0), m('branch'), 1, g);
      r.line(t.x(-1.4, -0.6), t.y(-1.4, -0.6), t.x(-2.0, 1.2), t.y(-2.0, 1.2), m('branch'), 1, g);
      const bloom = (x: number, y: number, big: boolean) => {
        for (const [dx, dy] of big ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[0.9, 0.5], [-0.6, -0.8]]) {
          r.dot(t.x(x + dx, y + dy), t.y(x + dx, y + dy), m(big ? 'petal' : 'petalPink'), big ? 3 : 2, g);
        }
        r.dot(t.x(x, y), t.y(x, y), m('heart'), 3, g);
      };
      bloom(0.7, 0.2, true);
      bloom(-2.2, 1.5, true);
      bloom(-3.0, -2.0, false);
    },
  };
}

// --- Thornseeds: spiny seed pods that sprout into a bramble patch --------------------------

/** A spiny burr: thorns all round a round pod, `n` of them, `len` long, turned by `rot`. */
function burr(r: Raster, t: Xf, m: (k: string) => number, g: number, cx: number, cy: number, rad: number, n: number, len: number, rot: number, glowSeed: boolean): void {
  const thorns = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a), w = 0.5 + rad * 0.08;
    const L = rad + len * (0.75 + 0.25 * ((i * 7) % 3) / 2);
    thorns.push(t.poly([cx + c * rad * 0.7 - s * w, cy + s * rad * 0.7 + c * w, cx + c * L, cy + s * L, cx + c * rad * 0.7 + s * w, cy + s * rad * 0.7 - c * w]));
  }
  r.fill(union(...thorns), m('thorn'), { group: g, bevel: 0.6 });
  r.fill(t.circ(cx, cy, rad), m('pod'), { group: g, bevel: rad * 0.8 });
  if (glowSeed) {
    // Split along one side, a glowing seed inside.
    r.fill(t.ell(cx + rad * 0.15, cy + rad * 0.2, rad * 0.55, rad * 0.28, 0.5), m('podDark'), { group: g, flat: 0, noLine: true });
    r.dot(t.x(cx + rad * 0.15, cy + rad * 0.2), t.y(cx + rad * 0.15, cy + rad * 0.2), m('seed'), 3, g);
  }
}

function thornseeds(): UsableArt {
  return {
    mats: mats({
      pod: plain(0x7a6a2e, lattice(2, -1)),
      podDark: plain(0x2a2010),
      thorn: shiny(0xe8dca0, undefined, 0.14),
      vine: plain(0x3a6a2a, grain()),
      leaf: shiny(0x5aaa3a, undefined, 0.13),
      seed: glow(0xd8ff6a),
    }),
    glow: [0xe0f590, 0x4a7a2a],
    draw(r, t, m, o = {}) {
      const fill = filler(r, o);
      const g = o.group ?? 7;
      const k = (o.frame ?? 0) % 3;
      // The vine the pods hang from, curling up into a tendril, a leaf off it that stirs.
      fill(t.cap(1.2, 0.2, 3.6, 0.5, 0.6, 0.5), m('vine'), 0.6);
      fill(t.cap(3.6, 0.5, 5.2, -0.4, 0.5, 0.4), m('vine'), 0.5);
      r.line(t.x(5.2, -0.4), t.y(5.2, -0.4), t.x(5.9, 0.6), t.y(5.9, 0.6), m('vine'), 2, g);
      r.dot(t.x(5.4, 1.2), t.y(5.4, 1.2), m('vine'), 2, g);
      fill(t.ell(3.8, 2.0 + (k === 1 ? 0.2 : 0), 1.5, 0.75, 0.75), m('leaf'), 0.8);
      r.line(t.x(3.2, 1.4), t.y(3.2, 1.4), t.x(4.4, 2.5), t.y(4.4, 2.5), m('vine'), 3, g);
      // Two small pods tucked behind, then the big one.
      burr(r, t, m, g, 1.6, -2.0, 1.4, 7, 1.3, 0.3, false);
      burr(r, t, m, g, 1.4, 2.4, 1.15, 6, 1.1, 0.9, true);
      burr(r, t, m, g, -1.4, 0, 2.6, 11, 1.7, 0.15 + k * 0.05, true);
    },
    shot: {
      frames: 4,
      draw(r, t, f, m) {
        // Three burrs tumbling apart.
        const spin = f * (Math.PI / 6);
        burr(r, t, m, 1, -3.4, 2, 1.7, 8, 1.5, spin, false);
        burr(r, t, m, 2, 3.4, 1.2, 1.5, 7, 1.4, -spin, true);
        burr(r, t, m, 3, 0, -3, 1.8, 8, 1.6, spin * 1.5, false);
      },
    },
    // On the ground they sprout: thorny bramble shoots and a few split burrs.
    patch: {
      shapes: [
        ['s..', '.gs', 'kg.', '.kk'],
        ['..s', 'sg.', '.gl', 'kk.'],
        ['.s.', 'sps', 'kek'],
        ['s.s.', '.gg.', 'lgk.', '.kk.'],
        ['.s', 'sg', 'kp'],
      ],
      key: { k: ['vine', 0], g: ['vine', 2], l: ['leaf', 3], s: ['thorn', 4], p: ['pod', 2], e: ['seed', 3] },
    },
  };
}

// --- Snow Globe: a tiny winter scene under glass, shattering into a snowburst ---------------

function snowGlobe(): UsableArt {
  return {
    mats: mats({
      sky: { base: 0x6aa0dc, ramp: [0x2a4a8a, 0x3a64a8, 0x5a88c8, 0x8ab4e4, 0xe8f6ff], shiny: true },
      snow: shiny(0xf0f8ff, undefined, 0.1),
      pine: plain(0x2a6a4a),
      cottage: plain(0xa04030),
      window: glow(0xffd070),
      wood: plain(0x5a3420, grain()),
      gold: shiny(0xe8c050, undefined, 0.16),
      star: glow(0xfff6c8),
      glint: glow(0xffffff),
    }),
    glow: [0xf0faff, 0x6aa8e8],
    draw(r, t, m, o = {}) {
      const fill = filler(r, o);
      const g = o.group ?? 7;
      const k = (o.frame ?? 0) % 3;
      // Gold finial and its little star on top.
      if (!o.open) {
        fill(t.poly([4.6, 0, 5.4, -0.9, 6.3, 0, 5.4, 0.9]), m('star'), 0.5);
        fill(t.cap(3.6, 0, 4.6, 0, 0.75, 0.5), m('gold'), 0.7);
      }
      // A turned wooden plinth with a gold band.
      fill(t.poly([-5.6, -3.0, -5.6, 3.0, -3.4, 2.4, -3.4, -2.4], 0.3), m('wood'), 1.2);
      fill(t.rect(-5.4, 0, 0.35, 3.1), m('gold'), 0.4, { noLine: true });
      fill(t.rect(-3.5, 0, 0.4, 2.6, 0.2), m('gold'), 0.5);
      // The globe: night-blue sky inside the glass...
      const globe = t.circ(0.2, 0, 3.6);
      fill(globe, m('sky'), 2.8);
      // ...a snowy hill, a pine and a cottage with a lit window.
      fill(intersect(globe, t.ell(-3.2, 0.3, 1.9, 4.2)), m('snow'), 1.2, { noLine: true });
      fill(t.poly([-1.7, -2.4, 2.1, -1.1, -1.7, 0.2]), m('pine'), 0.6, { noLine: true });
      r.dot(t.x(0.6, -1.4), t.y(0.6, -1.4), m('snow'), 3, g);
      r.dot(t.x(-0.7, -0.4), t.y(-0.7, -0.4), m('snow'), 2, g);
      fill(t.rect(-1.0, 1.5, 0.75, 1.0), m('cottage'), 0.5, { noLine: true });
      fill(t.poly([-0.3, 0.2, 0.9, 1.5, -0.3, 2.8]), m('snow'), 0.5, { noLine: true });
      r.dot(t.x(-1.0, 1.4), t.y(-1.0, 1.4), m('window'), 3, g);
      // Snow falling inside, a new drift each frame.
      const flakes = [[[2.4, 0.4], [1.0, 2.6], [0.6, -2.6], [2.8, -1.4]], [[1.8, 1.0], [0.2, 2.2], [1.6, -2.4], [2.2, -0.6]], [[1.2, 0.0], [1.8, 2.2], [0.0, -2.0], [3.0, 0.8]]][k];
      for (const [x, y] of flakes) r.dot(t.x(x, y), t.y(x, y), m('snow'), 4, g);
      // A curved highlight on the glass.
      r.dot(t.x(2.6, 1.6), t.y(2.6, 1.6), m('glint'), 3, g);
      r.dot(t.x(3.0, 0.9), t.y(3.0, 0.9), m('glint'), 3, g);
      r.dot(t.x(2.0, 2.3), t.y(2.0, 2.3), m('sky'), 4, g);
    },
  };
}

// --- Troll Skull Flask: tonic sloshing in a little troll skull, tusks and all ---------------

function trollSkull(): UsableArt {
  return {
    mats: mats({
      bone: plain(0xd8cca0, boneCrack),
      socket: plain(0x1e1a10),
      tusk: shiny(0xf6eed6, undefined, 0.14),
      glass: shiny(0x3a5a36, undefined, 0.12),
      cord: plain(0x7a4a2a),
      cork: plain(0x8a6a4a, grain()),
      bead: shiny(0xc84a2a),
      hot: glow(0xb8ff5a),
      liquid: glow(0x7ad83a),
    }),
    glow: [0xc8ff7a, 0x3a8a2a],
    draw(r, t, m, o = {}) {
      const fill = filler(r, o);
      const g = o.group ?? 7;
      const k = (o.frame ?? 0) % 3;
      // A clay neck out of the crown, bound with cord, a wooden stopper.
      fill(t.cap(1.8, 0, 3.8, 0, 1.2, 1.0), m('glass'), 1);
      fill(t.cap(3.8, 0, 4.1, 0, 1.4), m('glass'), 0.8);
      fill(t.rect(2.8, 0, 0.4, 1.3), m('cord'), 0.5, { noLine: true });
      fill(t.cap(2.8, 1.2, 1.6, 2.6, 0.35), m('cord'), 0.5);
      r.dot(t.x(1.4, 2.9), t.y(1.4, 2.9), m('bead'), 3, g);
      if (!o.open) fill(t.cap(4.3, 0, 5.6, 0, 0.95, 1.15), m('cork'), 0.8);
      // Lower jaw, jutting forward like a troll's.
      fill(t.rect(-3.9, 0, 1.0, 2.7, 0.7), m('bone'), 1);
      // The cranium, heavy-browed.
      fill(t.ell(-0.3, 0, 3.0, 3.3), m('bone'), 2.2);
      fill(t.cap(0.6, -2.4, 0.6, 2.4, 0.95), m('bone'), 0.9);
      // Eye sockets with the tonic glowing through them, one brighter as it sloshes.
      for (const s of [-1, 1]) {
        fill(t.ell(-0.5, s * 1.35, 0.95, 0.85), m('socket'), 0.4, { noLine: true });
        r.dot(t.x(-0.5, s * 1.35), t.y(-0.5, s * 1.35), m(k === (s > 0 ? 1 : 2) ? 'hot' : 'liquid'), 3, g);
      }
      // Nose slits.
      r.dot(t.x(-1.9, -0.4), t.y(-1.9, -0.4), m('socket'), 1, g);
      r.dot(t.x(-1.9, 0.4), t.y(-1.9, 0.4), m('socket'), 1, g);
      // A crack in the crown, the tonic seeping through it.
      r.line(t.x(2.0, -1.4), t.y(2.0, -1.4), t.x(1.2, -0.6), t.y(1.2, -0.6), m('socket'), 1, g);
      r.dot(t.x(1.6, -1.0), t.y(1.6, -1.0), m('liquid'), 3, g);
      // Teeth along the jaw, and the two tusks curving up past the cheeks.
      for (const y of [-0.9, 0, 0.9]) r.dot(t.x(-3.0, y), t.y(-3.0, y), m('tusk'), 3, g);
      for (const s of [-1, 1]) {
        fill(t.poly([-4.5, s * 1.5, -3.4, s * 3.0, -1.6, s * 4.1, 0.6, s * 4.5, -0.9, s * 3.4, -2.9, s * 1.8]), m('tusk'), 0.8);
      }
    },
  };
}

export const WAVE4_USABLES: Record<string, SkinArt> = {
  // --- Rare: the stock item recoloured (material names from sprite/usables.ts) ---------------
  // Black lacquer splashed with ink, a vermilion seal for a plug and a blue fuse spark.
  'smoke_bomb.ink': {
    mats: {
      glass: ramped([0x0c0d16, 0x161828, 0x22263e, 0x3a5ad8, 0xb8c8ff], inkSplash),
      band: plain(0x2a3e9a),
      cork: shiny(0xc8302a),
      fuse: plain(0x1e1e26),
      smoke: plain(0x5a6a9a),
      hot: glow(0xe0eaff),
      flame: glow(0x5a8aff),
    },
    glow: [0x8a9ae0, 0x1a1e38],
  },
  // Verdigris-teal tooled leather, gold cord, and spikes of polished bronze.
  'caltrops.bronze': {
    mats: {
      glass: plain(0x2a6a64, tooled),
      band: plain(0x143a36),
      cork: { base: 0xc8883a, ramp: [0x5a3414, 0x8a5420, 0xc0843a, 0xe0aa5a, 0xfff0c0], shiny: true },
      cord: shiny(0xe8c060),
    },
    glow: [0xffd890, 0xa8682a],
  },
  // Frosted white glass over deep glacier-blue, a slate stopper and pale blue ice.
  'frost_bomb.glacial': {
    mats: {
      glass: shiny(0xe0f2fa, frostGlass, 0.1),
      liquid: shiny(0x2a48c0, speckle(0.1, 1), 0.15),
      ice: shiny(0xaee4ff, undefined, 0.14),
      cork: plain(0x4a5868, speckle(0.15, -1)),
      hot: glow(0xb8f0ff),
    },
    glow: [0xd0e8ff, 0x2a48c0],
  },
  // A mud-caked bottle of black bog water, stoppered with a gnarled root, a swamp light inside.
  'troll_tonic.swamp': {
    mats: {
      glass: plain(0x6a5a30, muck),
      liquid: plain(0x1e3a30),
      cork: plain(0x6a4626, grain()),
      cord: plain(0x6a9a3a, speckle(0.2, -1)),
      hot: glow(0x9affd8),
    },
    glow: [0x9affd0, 0x2a5a3a],
  },

  // --- Mythic: reshaped -----------------------------------------------------------------------
  'caltrops.thornseed': { usable: thornseeds, glow: [0xe0f590, 0x4a7a2a] },
  'troll_tonic.trollskull': { usable: trollSkull, glow: [0xc8ff7a, 0x3a8a2a] },

  // --- Legendary: reshaped, with drifting particles in battle ----------------------------------
  'smoke_bomb.sakura': { usable: sakuraLantern, glow: [0xffc8dc, 0xd85a8a], ...drift(0xffd0e2, 0xe0608e, 'petal') },
  'frost_bomb.snowglobe': { usable: snowGlobe, glow: [0xf0faff, 0x6aa8e8], ...drift(0xffffff, 0x9ad0ff, 'flake') },
};
