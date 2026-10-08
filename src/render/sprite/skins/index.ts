import { mix } from '../../pixel/color';
import type { MaterialSpec } from '../../pixel/raster';
import { bands, damascus, glint, grain, lattice, speckle } from '../../pixel/tex';
import type { WeaponArt } from '../weaponKit';
import { celestialCrown, hornedWarhelm, type HeadSkin } from './heads';
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
  /** Swing trail colours (bright, dim). */
  trail?: [number, number];
  /** Legendary sparkles and impact colours (bright, fading to). */
  fx?: { spark: number; spark2: number };
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
};
