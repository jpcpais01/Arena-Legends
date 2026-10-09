import {
  ACCENT_COLORS, DEFAULT_LOOK, EYE_COLORS, HAIR_COLORS, OUTFIT_COLORS, SPECIES, type Appearance,
} from '../../character/appearance';
import { skinOn, type SkinMap } from '../../character/skins';
import type { CharacterBuild } from '../../sim/loadout';
import type { ChestId, FormId, GearId, GearSet, HeadId, BootsId, MainWeaponId, SecondaryId } from '../../sim/types';
import { mix, toHsl, fromHsl } from '../pixel/color';
import { material, type Material } from '../pixel/raster';
import { bodyFor, type BodySpec } from './body';
import { SKIN_ART, type SkinArt } from './skins';
import type { BodyDraw, LegDraw, ShoulderDraw } from './skins/armour';
import type { HeadDraw } from './skins/heads';
import { MAIN_FAMILY, SEC_FAMILY, weaponArt, type MainFamily, type SecFamily, type WeaponArt } from './weapons';

/**
 * Everything needed to draw one character, resolved once per build: body
 * measurements, materials (skin, hair, clothes, armour) and weapon art.
 */
export interface CharacterArt {
  build: CharacterBuild;
  look: Appearance;
  form: FormId;
  body: BodySpec;
  gear: GearSet;
  mats: Record<string, Material>;
  mainId: MainWeaponId;
  main: WeaponArt;
  family: MainFamily;
  hands: 1 | 2;
  secId: SecondaryId | null;
  sec: WeaponArt | null;
  secFamily: SecFamily | null;
  chest: ChestLook;
  headgear: HeadId | null;
  boots: BootsLook;
  /** Item skins in use, and their art (null when the item is plain). */
  skins: SkinMap;
  mainSkin: SkinArt | null;
  secSkin: SkinArt | null;
  headSkin: SkinArt | null;
  chestSkin: SkinArt | null;
  bootsSkin: SkinArt | null;
  /** Special item skin: recolours its icon, battle sprites and particles. */
  specialSkin: SkinArt | null;
  specialSkinId: string | null;
  /** Reshaped headgear from a skin, drawn instead of the stock piece. */
  headDraw: HeadDraw | null;
}

export interface ChestLook {
  torso: string;
  /** Upper-arm sleeve material and how far down it goes (0..1 of the upper arm). */
  sleeve: string | null;
  sleeveLen: number;
  /** Forearm covering (bracers, long sleeves). */
  forearm: string | null;
  hands: string;
  pauldron: string | null;
  /** Robe skirt down to this fraction of the leg (0 = none). */
  skirt: number;
  skirtMat: string;
  cape: string | null;
  hood: string | null;
  spikes: string | null;
  belt: string;
  /** Plate seams and trims drawn on the torso. */
  trim: string | null;
  /** Reshaped armour from a skin: extra shapes behind the body, over the torso, and on each shoulder. */
  back?: BodyDraw | null;
  over?: BodyDraw | null;
  shoulder?: ShoulderDraw | null;
}

export interface BootsLook {
  mat: string;
  /** How far up the shin the boot goes (0..1). */
  height: number;
  /** Extra width over the shin. */
  bulk: number;
  trim: string | null;
  wing: string | null;
  knee: string | null;
  /** Reshaped boots from a skin: extra shapes on each leg. */
  over?: LegDraw | null;
}

const tunicFor = (chest: ChestId | undefined): ChestLook => {
  const base: ChestLook = {
    torso: 'outfit', sleeve: 'outfit', sleeveLen: 0.55, forearm: null, hands: 'skin', pauldron: null,
    skirt: 0, skirtMat: 'outfit', cape: null, hood: null, spikes: null, belt: 'belt', trim: 'accent',
  };
  switch (chest) {
    case 'plate_armor':
      return { ...base, torso: 'plate', sleeve: 'outfit', sleeveLen: 1, forearm: 'plate', hands: 'plateDark', pauldron: 'plate', trim: 'plateDark', belt: 'leather' };
    case 'phase_cloak':
      return { ...base, torso: 'outfit', sleeve: 'cloak', sleeveLen: 0.9, forearm: null, cape: 'cloak', hood: 'cloak', trim: 'cloakTrim' };
    case 'thornmail':
      return { ...base, torso: 'thorn', sleeve: 'outfit', sleeveLen: 0.7, forearm: 'thorn', pauldron: 'thorn', spikes: 'thornSpike', trim: 'thornDark', belt: 'leather' };
    case 'mirror_mail':
      return { ...base, torso: 'mirror', sleeve: 'mirror', sleeveLen: 0.6, forearm: 'mirror', hands: 'skin', pauldron: 'mirror', trim: 'mirrorGlow', belt: 'belt' };
    case 'leather_jerkin':
      return { ...base, torso: 'jerkin', sleeve: 'outfit', sleeveLen: 0.5, forearm: 'jerkin', trim: 'jerkinDark', belt: 'leather' };
    case 'mage_robe':
      return { ...base, torso: 'robe', sleeve: 'robe', sleeveLen: 1, forearm: 'robe', skirt: 0.62, skirtMat: 'robe', trim: 'robeTrim', belt: 'robeTrim' };
    default:
      return base;
  }
};

const bootsFor = (b: BootsId | undefined): BootsLook => {
  switch (b) {
    case 'leather_boots': return { mat: 'boot', height: 0.55, bulk: 0.3, trim: 'bootDark', wing: null, knee: null };
    case 'zephyr_boots': return { mat: 'zephyr', height: 0.6, bulk: 0.3, trim: 'zephyrTrim', wing: 'wing', knee: null };
    case 'iron_greaves': return { mat: 'greave', height: 0.95, bulk: 0.55, trim: 'greaveDark', wing: null, knee: 'greave' };
    case 'shadow_treads': return { mat: 'shadow', height: 0.6, bulk: 0.3, trim: 'shadowGlow', wing: null, knee: null };
    case 'colossus_boots': return { mat: 'colossus', height: 0.62, bulk: 1.1, trim: 'colossusDark', wing: null, knee: null };
    case 'leaping_boots': return { mat: 'leap', height: 0.66, bulk: 0.35, trim: 'leapTrim', wing: 'feather', knee: null };
    default: return { mat: 'shoe', height: 0.18, bulk: 0.15, trim: null, wing: null, knee: null };
  }
};

/** A darker, slightly desaturated version of a colour (trousers under a tunic). */
const shade = (hex: number, dl: number, ds = 0) => {
  const [h, s, l] = toHsl(hex);
  return fromHsl(h, Math.max(0, s + ds), Math.max(0.05, l + dl));
};

export function makeArt(build: CharacterBuild): CharacterArt {
  const look = build.look ?? DEFAULT_LOOK;
  const sp = SPECIES[look.species];
  const skin = sp.skins[look.skin] ?? sp.skins[0];
  const hair = HAIR_COLORS[look.hairColor];
  const outfit = OUTFIT_COLORS[look.outfit];
  const accent = ACCENT_COLORS[look.accent];
  const eye = EYE_COLORS[look.eyes];
  const glowSpecies = look.species === 'wisp';
  const mats: Record<string, Material> = {
    skin: material({ base: skin, step: 0.11 }),
    hair: glowSpecies ? material({ base: mix(hair, 0xffffff, 0.35), glow: true }) : material({ base: hair, shiny: true, step: 0.14 }),
    hairGlow: material({ base: mix(hair, 0xffffff, 0.6), glow: true }),
    iris: material({ base: eye }),
    eyeGlow: material({ base: mix(eye, 0xffffff, 0.45), glow: true }),
    white: material({ base: 0xf6f2ea }),
    lash: material({ base: 0x1e1422 }),
    mouth: material({ base: shade(skin, -0.32, 0.1) }),
    inner: material({ base: mix(skin, 0xf08a9a, 0.45) }),
    outfit: material({ base: outfit }),
    pants: material({ base: shade(outfit, -0.12, -0.08) }),
    accent: material({ base: accent, shiny: true }),
    scarf: material({ base: accent, step: 0.13 }),
    brow: material({ base: shade(hair, -0.18) }),
    belt: material({ base: 0x5a3a26 }),
    leather: material({ base: 0x6a4428 }),
    shoe: material({ base: 0x4a3024 }),
    fur: material({ base: mix(skin, 0xffffff, 0.15) }),
    furTip: material({ base: 0xf6f0e6 }),
    horn: material({ base: 0x3a2a30, shiny: true }),
    tusk: material({ base: 0xf2ead2 }),
    crystal: material({ base: 0x7ae8ff, glow: true }),
    stoneCrack: material({ base: shade(skin, -0.25) }),
    muzzle: material({ base: mix(skin, 0xf2e2c8, 0.55) }),
    nose: material({ base: 0x241a1e, shiny: true }),
    scale: material({ base: shade(skin, -0.14, 0.05) }),
    crest: material({ base: hair, shiny: true, step: 0.13 }),
    cap: material({ base: hair, step: 0.13 }),
    capSpot: material({ base: mix(hair, 0xfff8e0, 0.75), glow: true }),
    gill: material({ base: mix(skin, 0xe8d8c0, 0.4) }),
    // Chest pieces
    plate: material({ base: 0x9aa6ba, shiny: true, step: 0.15 }),
    plateDark: material({ base: 0x5e687c, shiny: true }),
    cloak: material({ base: 0x3ab8c8 }),
    cloakTrim: material({ base: 0xbff8ff, glow: true }),
    thorn: material({ base: 0x3e8a4e, shiny: true }),
    thornDark: material({ base: 0x245a32 }),
    thornSpike: material({ base: 0xd8e6b8, shiny: true }),
    mirror: material({ base: 0xc8eef8, shiny: true, step: 0.16 }),
    mirrorGlow: material({ base: 0x9ff4ff, glow: true }),
    jerkin: material({ base: 0x8a5a32 }),
    jerkinDark: material({ base: 0x5a3820 }),
    robe: material({ base: 0x4a3ab0 }),
    robeTrim: material({ base: 0xe8c050, shiny: true }),
    // Boots
    boot: material({ base: 0x7a4a2a }),
    bootDark: material({ base: 0x4a2c1a }),
    zephyr: material({ base: 0x3ac8a0 }),
    zephyrTrim: material({ base: 0xe8fff8 }),
    wing: material({ base: 0xf6fbff }),
    greave: material({ base: 0x8a94a8, shiny: true }),
    greaveDark: material({ base: 0x50586a }),
    shadow: material({ base: 0x3a2a5a }),
    shadowGlow: material({ base: 0xb07aff, glow: true }),
    colossus: material({ base: 0x8a6a48 }),
    colossusDark: material({ base: 0x5a4430 }),
    leap: material({ base: 0xe0b040 }),
    leapTrim: material({ base: 0xfff0b0 }),
    feather: material({ base: 0xfff4d8 }),
    // Headgear
    mask: material({ base: 0xb8282a, shiny: true }),
    maskHorn: material({ base: 0xf0e2c0 }),
    maskEye: material({ base: 0xffd040, glow: true }),
    helm: material({ base: 0x9aa4b6, shiny: true, step: 0.15 }),
    helmDark: material({ base: 0x5a6274 }),
    gold: material({ base: 0xe0b040, shiny: true }),
    gemPurple: material({ base: 0xd0a0ff, glow: true }),
    hood: material({ base: 0x2e2a38 }),
    hoodEye: material({ base: 0xff5040, glow: true }),
    spark: material({ base: 0xc8f0ff, glow: true }),
    band: material({ base: 0xf0c040 }),
    bandTail: material({ base: 0xd8a030 }),
    // Special items worn on the body (skins recolour these)
    plume: material({ base: 0xb8282a, shiny: true }),
    plumeTip: material({ base: 0xffd040, glow: true }),
    fangTooth: material({ base: 0xf6f2ea }),
    fangBlood: material({ base: 0xb8282a, shiny: true }),
  };
  const skins = build.skins ?? {};
  const skinArt = (id: GearId | undefined): [string | null, SkinArt | null] => {
    const s = id ? skinOn(skins, id) : null;
    return s ? [s.id, SKIN_ART[s.id] ?? null] : [null, null];
  };
  const mainId = build.gear.main;
  const secId = build.gear.secondary ?? null;
  const [mainSkinId, mainSkin] = skinArt(mainId);
  const [secSkinId, secSkin] = skinArt(secId ?? undefined);
  const main = weaponArt(mainId, mainSkinId)!;
  const sec = secId ? weaponArt(secId, secSkinId) : null;
  for (const [k, v] of Object.entries(main.mats)) mats['w.' + k] = v;
  if (sec) for (const [k, v] of Object.entries(sec.mats)) mats['s.' + k] = v;
  // Armour skins recolour the body's armour materials; reshaped headgear brings its own.
  let headDraw: HeadDraw | null = null;
  const worn: Record<'head' | 'chest' | 'boots', SkinArt | null> = { head: null, chest: null, boots: null };
  for (const slot of ['head', 'chest', 'boots'] as const) {
    const [, art] = skinArt(build.gear[slot]);
    if (!art) continue;
    worn[slot] = art;
    for (const [k, spec] of Object.entries(art.mats ?? {})) mats[k] = material(spec);
    if (art.head) {
      const hs = art.head();
      Object.assign(mats, hs.mats);
      headDraw = hs.draw;
    }
  }
  // Special item skins only recolour what the body wears of them (feather, fang).
  const [specialSkinId, specialSkin] = skinArt(build.gear.special);
  for (const k of ['plume', 'plumeTip', 'fangTooth', 'fangBlood']) {
    const spec = specialSkin?.mats?.[k];
    if (spec) mats[k] = material(spec);
  }
  return {
    build, look, form: build.form,
    body: bodyFor(build.form, look.species),
    gear: build.gear,
    mats,
    mainId, main, family: MAIN_FAMILY[mainId],
    hands: MAIN_FAMILY[mainId] === 'sword' || MAIN_FAMILY[mainId] === 'wand' ? 1 : 2,
    secId, sec, secFamily: secId ? SEC_FAMILY[secId] : null,
    chest: { ...tunicFor(build.gear.chest), ...worn.chest?.chest },
    headgear: build.gear.head ?? null,
    boots: { ...bootsFor(build.gear.boots), ...worn.boots?.boots },
    skins, mainSkin, secSkin, headDraw,
    headSkin: worn.head, chestSkin: worn.chest, bootsSkin: worn.boots,
    specialSkin, specialSkinId,
  };
}
