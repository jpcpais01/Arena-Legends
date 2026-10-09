import { mix } from '../../pixel/color';
import { material, type Material, type MaterialSpec, type Raster } from '../../pixel/raster';
import { bands, damascus, glint, grain, hash, lattice, speckle } from '../../pixel/tex';
import type { BootsLook, ChestLook, LegsLook } from '../look';
import type { WeaponArt } from '../weaponKit';
import type { Xf } from '../xform';
import { FOXFIRE } from './foxfire';
import { HELLFORGED } from './hellforged';
import { SUNBORN } from './sunborn';
import { WILDWOOD } from './wildwood';
import { ABYSSAL } from './abyssal';
import { CLOCKWORK } from './clockwork';
import {
  geodeHeart, icicleScepter, kagutsuchi, krakenConch, lionheart, morningstar, skullcrusher, solarDisc, swordbreaker,
  frostreaver, voidfang, wintersHeart, wyrmRepeater,
} from './arsenal';
import {
  buccaneerBoots, earthshakers, gothicSabatons, prismMail, rangerMantle, rosethornMail, soulboundPlate, umbralTreads, wraithShroud,
} from './armour';
import { auroraHorn, everbloom, lotusChakram, ravenFeather, tidecaller, venomspitter } from './armory';
import {
  bloodfuryVisage, celestialCrown, eternityCirclet, hornedWarhelm, hourglassCrown, musketeerHat, oniMask, phoenixBand, ravenHood,
  seraphHelm, thunderbirdCrest, type HeadSkin,
} from './heads';
import {
  aegis, boneTorch, cosmicStaff, dawnbreaker, dragonGlaive, dragonscaleShield, serpentKris, serpentStaff, starpiercer,
  sunstring, thunderfall, tsukuyomi, twinmoon, volcanoHeart, wyrmfang, wyvernRecurve,
} from './weapons';

/**
 * How each skin in character/skins.ts looks. Rare skins only recolour and
 * texture the stock item (`mats`, by the item's material names); mythic and
 * legendary ones bring a reshaped item (`weapon` or `head`), and legendary
 * ones add battle effects (`fx`).
 */
export interface SkinArt {
  /** Material overrides: weapon material names for weapons, body material names for armour. */
  mats?: Record<string, MaterialSpec>;
  weapon?: () => WeaponArt;
  head?: () => HeadSkin;
  /** Reshaped armour: changes to how the chest piece, legs or boots are built (capes, spikes, wings...). */
  chest?: Partial<ChestLook>;
  legs?: Partial<LegsLook>;
  boots?: Partial<BootsLook>;
  /** Swing trail colours (bright, dim). */
  trail?: [number, number];
  /**
   * Legendary sparkles and impact colours (bright, fading to). They rise from
   * where the item is: the weapon tip, the head, the body or the feet.
   */
  fx?: SkinFx;
  /** Special items: particle colours in battle (bright, deep) for its aura, shots and bursts. */
  glow?: [number, number];
  /** Epic special items: a reshaped icon, drawn around the frame's origin (about 13 units across each way). */
  icon?: (r: Raster, t: Xf, m: (k: string) => number) => void;
  /**
   * Epic items: reshaped battle sprites, by sprite id (an item's projectiles,
   * the meteor sigil, the familiar's `lantern`, a floating `core`, thrown weapons). Each brings
   * its own materials.
   */
  proj?: Partial<Record<string, ProjArt>>;
  /** Phoenix feather worn in the hair: drawn in head space instead of the stock plume. */
  plume?: (r: Raster, H: Xf, m: (k: string) => number, g: number, sway: number) => void;
}

export interface SkinFx {
  spark: number;
  spark2: number;
  /** Particle shape: twinkling stars (the default) or flickering flames. */
  kind?: 'twinkle' | 'flame';
}

/** A battle sprite drawn pointing +x around the frame origin; `f` is the animation frame. */
export interface ProjArt {
  frames: number;
  outline?: boolean;
  draw(r: Raster, t: Xf, f: number, h: (m: Material) => number): void;
}

const built = new Map<string, Record<string, Material>>();

/** A skin's material overrides, built once (special item icons and battle sprites swap materials by name). */
export function skinMaterials(id: string): Record<string, Material> {
  let out = built.get(id);
  if (!out) {
    out = {};
    for (const [k, spec] of Object.entries(SKIN_ART[id]?.mats ?? {})) out[k] = material(spec);
    built.set(id, out);
  }
  return out;
}

const shiny = (base: number, tex?: MaterialSpec['tex'], step = 0.15): MaterialSpec => ({ base, shiny: true, step, tex });
const plain = (base: number, tex?: MaterialSpec['tex']): MaterialSpec => ({ base, tex });
const glow = (base: number, tex?: MaterialSpec['tex']): MaterialSpec => ({ base, glow: true, tex });

/** Legendary effects in one colour family. */
const legend = (spark: number, spark2: number, trail = spark): Pick<SkinArt, 'fx' | 'trail'> => ({
  fx: { spark, spark2 },
  trail: [trail, mix(trail, spark2, 0.55)],
});

const hamon = (x: number, y: number) => (y < -0.25 + Math.sin(x * 0.9) * 0.35 ? 1 : 0);

const Q = Math.PI / 2; // one idle frame of a four-frame loop

/** Dark tones with a hot fifth tone that the texture lights up. */
const veined = (dark: number[], hot: number, tex: MaterialSpec['tex']): MaterialSpec => ({ base: dark[2], ramp: [...dark, hot], tex });

/** Nebula cloth: drifting violet clouds and twinkling stars (torso space). */
const nebula: MaterialSpec['tex'] = (x, y, ph) => {
  if (hash(Math.floor(x) + ph * 29, Math.floor(y) - ph * 11) < 0.045) return 4;
  return Math.sin(x * 0.55 + y * 0.4 - ph * Q + Math.sin(y * 0.3) * 1.5) > 0.55 ? 1 : 0;
};

/** Forked lightning crawling through a material. */
const storm: MaterialSpec['tex'] = (x, y, ph) => {
  const v = Math.sin(y * 1.2 + Math.sin(x * 1.6 + ph * Q) * 2) + Math.sin(x * 0.9 - ph * Q) * 0.5;
  return Math.abs(v) < 0.24 ? 4 : 0;
};

export const SKIN_ART: Record<string, SkinArt> = {
  // --- Main weapons -------------------------------------------------------------
  'longsword.verdigris': {
    mats: { blade: shiny(0x6aa88a, speckle(0.09, -1)), guard: shiny(0xb8743a), grip: plain(0x2a4a3a, bands(2, 1, -1)), pommel: shiny(0xb8743a) },
    trail: [0xc8f0d8, 0x6a9a8a],
  },
  'longsword.wyrmfang': { weapon: wyrmfang, trail: [0xf8ecd0, 0xb04a4a] },
  'longsword.dawnbreaker': { weapon: dawnbreaker, ...legend(0xfff2b0, 0xffa030) },
  'katana.sakura': {
    mats: { blade: shiny(0xf0d8e0, hamon, 0.13), guard: shiny(0xd8a0b0), grip: plain(0x1a1420), wrapHi: plain(0xf090b0) },
    trail: [0xffe0ea, 0xd88aa8],
  },
  'katana.tsukuyomi': { weapon: tsukuyomi, trail: [0xd8e4ff, 0x5a6aa8] },
  'mace.obsidian': {
    mats: { haft: plain(0x2a2430, grain()), head: shiny(0x2a2238, speckle(0.12, 2), 0.13), band: shiny(0xc8ccd8) },
    trail: [0xe0c8ff, 0x7a5aa8],
  },
  'dagger.nightshade': {
    mats: { blade: shiny(0x9a7ad8, damascus(2.5)), venom: glow(0xff6ad8), grip: plain(0x1e1430), guard: shiny(0x3a2a4a) },
    trail: [0xf0c8ff, 0xa060c8],
  },
  'dagger.serpent': { weapon: serpentKris, trail: [0xd8ffd8, 0x5aa86a] },
  'ember_wand.driftwood': {
    mats: { wood: plain(0xb8a890, grain()), band: shiny(0xc8d0d8), ember: glow(0x40e0d0), core: glow(0xd8fff8) },
    trail: [0xc0fff4, 0x40a8a0],
  },
  'ember_wand.bonetorch': { weapon: boneTorch, trail: [0xc8ffd0, 0x4ab86a] },
  'ember_wand.volcano': { weapon: volcanoHeart, ...legend(0xffd060, 0xd83a1a, 0xffb040) },
  'warhammer.glacier': {
    mats: { haft: plain(0xd8d0c0, grain()), head: shiny(0x8ad0f0, speckle(0.1, 1), 0.16), band: shiny(0xe8f8ff), face: shiny(0xf0ffff) },
    trail: [0xe8fbff, 0x7ab8d8],
  },
  'warhammer.thunderfall': { weapon: thunderfall, ...legend(0xffffff, 0x5aa8ff, 0xe8f8ff) },
  'greataxe.bloodmoon': {
    mats: { haft: plain(0x2a1a1e, grain()), head: shiny(0xb83040, damascus(2.4, 1.4)), back: shiny(0x5a1a24), wrap: plain(0xe0c060, bands(2, 1, -1)) },
    trail: [0xffd0d0, 0xb03040],
  },
  'greataxe.twinmoon': { weapon: twinmoon, trail: [0xe8f0ff, 0x8a9ac8] },
  'spear.jade': {
    mats: { shaft: shiny(0x8a1e1e, bands(5, 1, 1)), head: shiny(0x5ad8a0, speckle(0.08, 1)), band: shiny(0xe0b040), tassel: plain(0xf0c040) },
    trail: [0xd0ffe8, 0x5aa880],
  },
  'spear.glaive': { weapon: dragonGlaive, trail: [0xf0f8ff, 0xc84a4a] },
  'spear.starpiercer': { weapon: starpiercer, ...legend(0xffffff, 0x7a8aff, 0xd8f8ff) },
  'arcane_staff.verdant': {
    mats: { shaft: plain(0x5a4a2a, grain()), metal: shiny(0x4aa84a), orb: glow(0x8aff6a), core: glow(0xf0fff0) },
  },
  'arcane_staff.serpent': { weapon: serpentStaff },
  'arcane_staff.cosmos': { weapon: cosmicStaff, ...legend(0xffffff, 0xb07aff, 0xe0c8ff) },
  'longbow.ashen': {
    mats: { limb: plain(0xd8d0c8, grain()), grip: plain(0x2a3a5a), tip: shiny(0xd8e0e8), fletch: plain(0x4a8ef0) },
  },
  'longbow.wyvern': { weapon: wyvernRecurve },
  'longbow.sunstring': { weapon: sunstring, ...legend(0xfff6c0, 0xffa030) },

  // --- Secondary ----------------------------------------------------------------------
  'kite_shield.crimson': {
    mats: { face: plain(0xb02a32, lattice(4, -1)), rim: shiny(0xc8d0dc), boss: shiny(0xd8dce8), emblem: plain(0xf0d080) },
  },
  'kite_shield.dragonscale': { weapon: dragonscaleShield },
  'kite_shield.aegis': { weapon: aegis, ...legend(0xfff6c0, 0xffb040) },
  'parrying_dagger.blacksteel': {
    mats: { blade: shiny(0x4a4e5e, damascus(2.2)), guard: shiny(0xc8ccd8), grip: plain(0x1a1a22) },
  },
  'buckler.sunbronze': {
    mats: { face: shiny(0xc88a3a, lattice(3, -1)), rim: shiny(0xf0c050), spike: shiny(0xffe090) },
  },
  'throwing_knives.gilded': {
    mats: { blade: shiny(0xe8c060, speckle(0.08, 1)), grip: plain(0x3a1a2a) },
  },
  'hand_crossbow.ebon': {
    mats: { stock: plain(0x2a2028, grain()), prod: shiny(0xb0303a), string: plain(0xf0e0e0), bolt: shiny(0xd8c070) },
  },
  'wind_chakram.jade': {
    mats: { ring: shiny(0x5ad8a0, speckle(0.1, 1)), grip: plain(0xe0b040) },
  },
  'frost_wand.amethyst': {
    mats: { shaft: plain(0x3a2a4a), crystal: glow(0xc08aff), core: glow(0xf8e8ff) },
  },
  'war_horn.dragon': {
    mats: { horn: shiny(0x3a3038, bands(2.2, 1, 1)), band: shiny(0xe0b040), mouth: plain(0x1a1014) },
  },

  // --- Armour (body material names) ----------------------------------------------------
  'iron_helm.blackiron': { mats: { helm: shiny(0x3a3a48, speckle(0.06, 1)), helmDark: plain(0x14141c) } },
  'iron_helm.warhelm': { head: hornedWarhelm },
  'storm_crown.frost': { mats: { gold: shiny(0xbfe8ff, undefined, 0.16), spark: glow(0x7ae0ff) } },
  'storm_crown.celestial': { head: celestialCrown, fx: { spark: 0xfff6c0, spark2: 0x8ad8ff } },
  'plate_armor.gilded': { mats: { plate: shiny(0xe0b850, speckle(0.05, 1)), plateDark: shiny(0x8a5a20) } },
  'mage_robe.starweave': { mats: { robe: plain(0x1a2050, glint(0.035, 3)), robeTrim: shiny(0xc8d8ff) } },
  'leather_jerkin.snakeskin': { mats: { jerkin: plain(0x5a7a3a, lattice(3, -1)), jerkinDark: plain(0x2e4020) } },
  'leather_boots.snakeskin': { mats: { boot: plain(0x5a7a3a, lattice(3, -1)), bootDark: plain(0x2e4020) } },
  'iron_greaves.gilded': { mats: { greave: shiny(0xe0b850, speckle(0.05, 1)), greaveDark: shiny(0x8a5a20) } },

  // --- Second wave: rare armour ----------------------------------------------------------
  'chrono_circlet.rosegold': { mats: { gold: shiny(0xe8a08a, undefined, 0.15), gemPurple: glow(0x5affb0) } },
  'executioner_hood.crimson': { mats: { hood: plain(0x5a1418, lattice(3, -1)), hoodEye: glow(0xffd040) } },
  'duelist_band.azure': { mats: { band: shiny(0x3a7ae0), bandTail: plain(0xe8f0ff, bands(1.6, 1, -1)) } },
  'phase_cloak.ember': { mats: { cloak: plain(0xc8401a, speckle(0.06, 1)), cloakTrim: glow(0xffd060) } },
  'thornmail.autumn': { mats: { thorn: shiny(0xc8702a, speckle(0.08, -1)), thornDark: plain(0x6a3418), thornSpike: shiny(0xf0d890) } },
  'mirror_mail.obsidian': { mats: { mirror: shiny(0x3a2a5a, speckle(0.06, 2), 0.16), mirrorGlow: glow(0xff7ad8) } },
  'zephyr_boots.stormwind': { mats: { zephyr: plain(0x4a5a7a, bands(2, 1, 1)), zephyrTrim: shiny(0xffe080), wing: shiny(0xd8e4f0) } },
  'shadow_treads.bloodshadow': { mats: { shadow: plain(0x3a0e14, speckle(0.06, 2)), shadowGlow: glow(0xff3a3a) } },
  'colossus_boots.mossback': { mats: { colossus: plain(0x5a6a3a, speckle(0.14, -1)), colossusDark: plain(0x3a4426) } },
  'leaping_boots.jade': { mats: { leap: shiny(0x2aa878, lattice(3, -1)), leapTrim: plain(0xf0ffd0), feather: plain(0xb8f0d8) } },

  // --- Second wave: mythic ------------------------------------------------------------------
  'mace.morningstar': { weapon: morningstar, trail: [0xe8eef8, 0x8a90a8] },
  'warhammer.skullcrusher': { weapon: skullcrusher, trail: [0xfff0e0, 0xc85a3a] },
  'buckler.lionheart': { weapon: lionheart },
  'parrying_dagger.swordbreaker': { weapon: swordbreaker },
  'hand_crossbow.wyrm': { weapon: wyrmRepeater },
  'war_horn.kraken': { weapon: krakenConch },
  'frost_wand.icicle': { weapon: icicleScepter },
  'berserker_mask.oni': { head: oniMask },
  'executioner_hood.raven': { head: ravenHood },
  'plate_armor.dragonknight': {
    mats: { plate: shiny(0x3a3040, speckle(0.05, 1)), plateDark: shiny(0xb8302a), 'k.cape': plain(0x8a1a22, bands(3, 1, -1)), 'k.spike': shiny(0xece2c8) },
    chest: { cape: 'k.cape', spikes: 'k.spike' },
  },

  // --- Second wave: legendary ---------------------------------------------------------------
  'katana.kagutsuchi': { weapon: kagutsuchi, ...legend(0xffd060, 0xd83a1a, 0xffb040) },
  'dagger.voidfang': { weapon: voidfang, ...legend(0xf0d8ff, 0x7a3ad0, 0xd8a8ff) },
  'mace.geode': { weapon: geodeHeart, ...legend(0xc8f8ff, 0xc060ff, 0xb8f0ff) },
  'greataxe.frostreaver': { weapon: frostreaver, ...legend(0xf0ffff, 0x5ab8f0, 0xe0f8ff) },
  'frost_wand.winter': { weapon: wintersHeart, fx: { spark: 0xf0ffff, spark2: 0x7ac8ff } },
  'wind_chakram.solar': { weapon: solarDisc, fx: { spark: 0xfff0a0, spark2: 0xff8a20 } },
  'chrono_circlet.eternity': { head: eternityCirclet, fx: { spark: 0xfff0b0, spark2: 0xb080ff } },
  'duelist_band.phoenix': { head: phoenixBand, fx: { spark: 0xffd060, spark2: 0xd83a1a } },
  'mage_robe.nebula': {
    mats: {
      robe: veined([0x120a2a, 0x22144a, 0x382070, 0x5a34a0], 0xf0d0ff, nebula),
      robeTrim: glow(0xd8b8ff),
      'k.cape': veined([0x120a2a, 0x22144a, 0x382070, 0x5a34a0], 0xf0d0ff, nebula),
    },
    chest: { cape: 'k.cape', hood: 'k.cape' },
    fx: { spark: 0xffffff, spark2: 0x9a6aff },
  },
  'zephyr_boots.stormstriders': {
    mats: {
      zephyr: veined([0x141a30, 0x222c4a, 0x34446a, 0x4a5e8a], 0x9ae8ff, storm),
      zephyrTrim: glow(0x9ae8ff),
      'k.wing': shiny(0xe8f4ff, undefined, 0.14),
      'k.knee': shiny(0x9aa8c8),
    },
    boots: { wing: 'k.wing', knee: 'k.knee', height: 0.75 },
    fx: { spark: 0xe8fbff, spark2: 0x5aa8ff },
  },

  // --- Third wave: rare -------------------------------------------------------------------
  'longsword.royal': {
    mats: { blade: shiny(0xc8d6f0, damascus(3.2, 0.8), 0.16), guard: shiny(0xf0c040), grip: plain(0x1e3a8a, lattice(2.5, -1)), pommel: shiny(0xf0c040) },
    trail: [0xeef4ff, 0x6a8ad8],
  },
  'berserker_mask.bone': { mats: { mask: shiny(0xe8dcc0, speckle(0.08, -1), 0.13), maskHorn: plain(0x3a2a30, bands(1.4, 1, 1)), maskEye: glow(0xff3a2a) } },
  // Special items: their icon, battle sprites and particles change colour together.
  'meteor_sigil.frostfall': {
    mats: {
      sigil: glow(0x8ad8ff), rock: shiny(0x5a7aa8, speckle(0.12, 1), 0.14), ember: glow(0xbff0ff),
      lava: glow(0x6ad0ff), lavaHot: glow(0xf0ffff), fire: glow(0x9ae8ff),
    },
    glow: [0xe8fbff, 0x3a7ad8],
  },
  'phantom_blade.crimson': { mats: { phantom: glow(0xff5a6e), phantomHot: glow(0xffe0e4) }, glow: [0xffd0d8, 0xc02a3a] },
  'wisp_lantern.firefly': {
    mats: { lantern: shiny(0x6a8a3a), wisp: glow(0xd8ff6a), wispHot: glow(0xfaffe0) },
    glow: [0xf0ffb0, 0x6ac83a],
  },
  'phoenix_feather.azure': {
    mats: {
      feather: plain(0x2a6ae0, bands(2.4, 1, 1)), featherTip: glow(0x9af0ff), gold: shiny(0xd8e4f0),
      plume: shiny(0x2a6ae0), plumeTip: glow(0x9af0ff),
    },
    glow: [0xbff4ff, 0x2a6ae0],
  },
  'echo_stone.amber': { mats: { stone: plain(0xd08a2a, speckle(0.12, 1)), rune: glow(0xfff0a0) }, glow: [0xffd870, 0xc07a1a] },
  'vampiric_fang.moonsilver': {
    mats: {
      fang: shiny(0xd8e0f0, undefined, 0.16), blood: shiny(0x8a3ad8), cord: plain(0x2a2a3a),
      fangTooth: plain(0xdce4f4), fangBlood: shiny(0x8a3ad8),
    },
  },
  'ember_core.soulfire': { mats: { ember: glow(0x5aff8a), emberHot: glow(0xe8fff0), emberDeep: glow(0x1a9a5a) }, glow: [0x9affc0, 0x1a8a4a] },
  'frost_core.amethyst': { mats: { ice: shiny(0xb88aff, undefined, 0.16), iceGlow: glow(0xf4e8ff) }, glow: [0xf0e0ff, 0x9a5ae0] },

  // --- Third wave: mythic -----------------------------------------------------------------
  'throwing_knives.feathers': { weapon: ravenFeather },
  'wind_chakram.lotus': { weapon: lotusChakram },
  'chrono_circlet.hourglass': { head: hourglassCrown },
  'storm_crown.thunderbird': { head: thunderbirdCrest },
  'duelist_band.musketeer': { head: musketeerHat },
  'phase_cloak.wraith': wraithShroud(),
  'thornmail.rosethorn': rosethornMail(),
  'leather_jerkin.ranger': rangerMantle(),
  'leather_boots.buccaneer': buccaneerBoots(),
  'iron_greaves.gothic': gothicSabatons(),

  // --- Third wave: legendary --------------------------------------------------------------
  'parrying_dagger.tidecaller': { weapon: tidecaller, ...legend(0xe0ffff, 0x2a8ad8) },
  'buckler.everbloom': { weapon: everbloom, ...legend(0xffd8ea, 0xff5a9a) },
  'hand_crossbow.venom': { weapon: venomspitter, ...legend(0xe8ff9a, 0x4aa020) },
  'war_horn.aurora': { weapon: auroraHorn, ...legend(0xc8fff0, 0x8a5aff) },
  'berserker_mask.bloodfury': { head: bloodfuryVisage, fx: { spark: 0xff8a6a, spark2: 0xa01020 } },
  'iron_helm.seraph': { head: seraphHelm, fx: { spark: 0xfff6d0, spark2: 0xe0a830 } },
  'plate_armor.soulbound': { ...soulboundPlate(), fx: { spark: 0xd8fff8, spark2: 0x2ab8b8 } },
  'mirror_mail.prism': { ...prismMail(), fx: { spark: 0xffffff, spark2: 0xff7ad8 } },
  'colossus_boots.earthshaker': { ...earthshakers(), fx: { spark: 0xffd060, spark2: 0xd83a1a } },
  'shadow_treads.umbral': { ...umbralTreads(), fx: { spark: 0xe0c8ff, spark2: 0x6a2ad8 } },

  // --- Epic sets ---------------------------------------------------------------------------
  ...SUNBORN,
  ...HELLFORGED,
  ...FOXFIRE,
  ...WILDWOOD,
  ...ABYSSAL,
  ...CLOCKWORK,
};
