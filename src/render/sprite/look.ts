import {
  ACCENT_COLORS, DEFAULT_LOOK, EYE_COLORS, HAIR_COLORS, OUTFIT_COLORS, SPECIES, type Appearance,
} from '../../character/appearance';
import { fullSet, SKIN_RARITIES, skinOn, type SkinMap, type SkinRarity, type SkinSetId } from '../../character/skins';
import type { CharacterBuild } from '../../sim/loadout';
import type { ChestId, FormId, GearId, GearSet, HeadId, BootsId, LegsId, MainWeaponId, SecondaryId, UsableId } from '../../sim/types';
import { mix, toHsl, fromHsl } from '../pixel/color';
import { grain, lattice, speckle } from '../pixel/tex';
import { material, type Material } from '../pixel/raster';
import { ARMOUR2 } from './armour2';
import { bodyFor, type BodySpec } from './body';
import { SKIN_ART, type SkinArt } from './skins';
import type { BodyDraw, LegDraw, ShoulderDraw, ThighDraw } from './skins/armour';
import type { HeadDraw } from './skins/heads';
import { usableArt, type UsableArt } from './usables';
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
  legs: LegsLook;
  boots: BootsLook;
  /** Potion or bomb on the belt. */
  useId: UsableId | null;
  use: UsableArt | null;
  /** Usable item skin (its art is already in `use`): recolours its battle sprites, patches and clouds. */
  useSkin: SkinArt | null;
  useSkinId: string | null;
  /** Item skins in use, and their art (null when the item is plain). */
  skins: SkinMap;
  mainSkin: SkinArt | null;
  secSkin: SkinArt | null;
  headSkin: SkinArt | null;
  chestSkin: SkinArt | null;
  legsSkin: SkinArt | null;
  bootsSkin: SkinArt | null;
  /** Special item skin: recolours its icon, battle sprites and particles. */
  specialSkin: SkinArt | null;
  specialSkinId: string | null;
  /** Reshaped headgear from a skin, drawn instead of the stock piece. */
  headDraw: HeadDraw | null;
  /** Reshaped hood or mask that shows the face. */
  headFace: boolean;
  /** The epic set worn in full, if any (its aura plays around the fighter). */
  set: SkinSetId | null;
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
  /** Its own scarf replaces the human's. */
  noScarf?: boolean;
}

export interface LegsLook {
  /** Thigh covering (null: the trousers show). */
  mat: string | null;
  /** A band below the hip and one above the knee. */
  trim: string | null;
  /** Knee guard. */
  knee: string | null;
  /** Plates hanging from the belt over the thigh. */
  tasset: string | null;
  /** Glowing lines down the thigh. */
  rune: string | null;
  /** Cloth strips wound around the thigh. */
  wraps: string | null;
  /** Extra width over the thigh. */
  bulk: number;
  /** Reshaped legs from a skin: extra shapes on each thigh. */
  over?: ThighDraw | null;
  /** Extra shapes on each shin (over the trousers and the top of the boot). */
  shin?: LegDraw | null;
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
      return { ...base, ...(chest && ARMOUR2[chest]?.chest) };
  }
};

const legsFor = (l: LegsId | undefined): LegsLook => {
  const base: LegsLook = { mat: null, trim: null, knee: null, tasset: null, rune: null, wraps: null, bulk: 0 };
  switch (l) {
    case 'leather_leggings': return { ...base, mat: 'legLeather', trim: 'legLeatherDark', bulk: 0.15 };
    case 'chain_leggings': return { ...base, mat: 'chain', trim: 'chainDark', knee: 'chainPlate', bulk: 0.25 };
    case 'stonehide_tassets': return { ...base, mat: 'stoneLeg', knee: 'stoneLeg', tasset: 'stoneLeg', trim: 'stoneDark', bulk: 0.45 };
    case 'windrunner_leggings': return { ...base, mat: 'windLeg', trim: 'windTrim', wraps: 'windTrim', bulk: 0.1 };
    case 'runed_leggings': return { ...base, mat: 'runeLeg', trim: 'runeDark', knee: 'runeDark', rune: 'runeGlow', bulk: 0.2 };
    case 'bloodrite_wraps': return { ...base, mat: 'bloodLeg', wraps: 'bloodDark', rune: 'bloodGlow', bulk: 0.15 };
    default: return { ...base, ...(l && ARMOUR2[l]?.legs) };
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
    default: return { mat: 'shoe', height: 0.18, bulk: 0.15, trim: null, wing: null, knee: null, ...(b && ARMOUR2[b]?.boots) };
  }
};

/** A darker, slightly desaturated version of a colour (trousers under a tunic). */
const grainTex = grain(-1);

const shade = (hex: number, dl: number, ds = 0) => {
  const [h, s, l] = toHsl(hex);
  return fromHsl(h, Math.max(0, s + ds), Math.max(0.05, l + dl));
};

// --- Night accents ----------------------------------------------------------------

/**
 * How much of an item lights up at night, by tier. `shine` is for its
 * self-lit parts (gems, runes, embers) and the hot veins its textures paint;
 * `gleam` for the glints on polished metal. Plain gear barely glints, and
 * legendary and epic pieces also twinkle.
 */
const NIGHT: Record<'stock' | SkinRarity, { shine: number; gleam: number; sparkle: boolean }> = {
  stock: { shine: 0.5, gleam: 0.12, sparkle: false },
  rare: { shine: 0.6, gleam: 0.22, sparkle: false },
  mythic: { shine: 0.75, gleam: 0.32, sparkle: false },
  legendary: { shine: 0.9, gleam: 0.42, sparkle: true },
  epic: { shine: 1, gleam: 0.5, sparkle: true },
};
const TIER_ORDER = ['stock', ...SKIN_RARITIES] as const;

/** Materials species features are drawn with (body, not gear). */
export const SPECIES_KEYS = [
  'shoe', 'horn', 'hornRidge', 'impWing', 'tusk', 'skinDark', 'paint', 'gem', 'moss', 'stoneCrack', 'cap', 'capSpot', 'gill', 'gillDark',
  // Keys of retired species features: some skins reuse these names and rely on them counting as body.
  'fur', 'furTip', 'crystal', 'muzzle', 'nose', 'scale', 'crest',
] as const;

/** Body materials stay dark at night: only gear has night accents. */
const BODY_KEYS = new Set([
  'skin', 'hair', 'hairGlow', 'iris', 'eyeGlow', 'white', 'lash', 'mouth', 'inner', 'outfit', 'pants', 'accent', 'scarf', 'brow',
  ...SPECIES_KEYS,
]);
const HEAD_KEYS = ['mask', 'maskHorn', 'maskEye', 'helm', 'helmDark', 'gold', 'gemPurple', 'hood', 'hoodEye', 'spark', 'band', 'bandTail'];
const SPECIAL_KEYS = ['plume', 'plumeTip', 'fangTooth', 'fangBlood'];

/** Materials of the second-wave stock pieces, built once and shared (night accents copy them). */
const stockMats = new Map<string, Material>();
function stockMat(k: string, spec: Parameters<typeof material>[0]): Material {
  let mt = stockMats.get(k);
  if (!mt) { mt = material(spec); stockMats.set(k, mt); }
  return mt;
}

/** A slot's material keys: the stock piece's, plus whatever its skin brings. */
const keysOf = (stock: (string | null)[], skin: SkinArt | null, id?: GearId | null) => {
  const set = new Set([...stock.filter((k): k is string => !!k), ...Object.keys(skin?.mats ?? {}), ...Object.keys((id && ARMOUR2[id]?.mats) ?? {})]);
  return (k: string) => set.has(k);
};

/**
 * Gives every gear material its night accents by the tier of the item it
 * belongs to (a skin's rarity, or plain). Materials are copied, never
 * changed in place: weapon art is shared between fighters.
 */
function nightAccents(
  mats: Record<string, Material>, build: CharacterBuild, skins: SkinMap,
  slots: [GearId | null | undefined, (k: string) => boolean][], headMats: string[],
): void {
  const tierOf = (id: GearId | null | undefined) => (id ? skinOn(skins, id)?.rarity ?? 'stock' : null);
  const headTier = tierOf(build.gear.head);
  for (const k of Object.keys(mats)) {
    if (BODY_KEYS.has(k)) continue;
    let best = -1;
    for (const [id, has] of slots) {
      const t = tierOf(id);
      if (t && has(k)) best = Math.max(best, TIER_ORDER.indexOf(t));
    }
    if (headTier && headMats.includes(k)) best = Math.max(best, TIER_ORDER.indexOf(headTier));
    if (best < 0) continue;
    mats[k] = { ...mats[k], ...NIGHT[TIER_ORDER[best]] };
  }
}

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
    horn: material({ base: 0x3a2a30, shiny: true }),
    hornRidge: material({ base: 0x5a4650 }),
    impWing: material({ base: mix(shade(skin, -0.18), 0x2a1a30, 0.45), step: 0.12 }),
    skinDark: material({ base: shade(skin, -0.22, 0.04) }),
    paint: material({ base: accent === 0x2a2a34 ? 0xd03a3a : accent }),
    gem: material({ base: mix(hair, 0xffffff, 0.35), glow: true }),
    moss: material({ base: 0x5a8a3a, step: 0.1 }),
    tusk: material({ base: 0xf2ead2 }),
    crystal: material({ base: 0x7ae8ff, glow: true }),
    stoneCrack: material({ base: shade(skin, -0.25) }),
    cap: material({ base: hair, step: 0.13 }),
    capSpot: material({ base: mix(hair, 0xfff8e0, 0.75), glow: true }),
    gill: material({ base: mix(skin, 0xe8d8c0, 0.4) }),
    gillDark: material({ base: shade(mix(skin, 0xe8d8c0, 0.4), -0.18) }),
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
    // Legs
    legLeather: material({ base: 0x7a5032, tex: grainTex }),
    legLeatherDark: material({ base: 0x4a2e1c }),
    chain: material({ base: 0x9aa4b4, shiny: true, step: 0.14, tex: lattice(2, -1) }),
    chainDark: material({ base: 0x5a6274 }),
    chainPlate: material({ base: 0xaab4c4, shiny: true, step: 0.15 }),
    stoneLeg: material({ base: 0x9a8a72, step: 0.13, tex: speckle(0.14, -1) }),
    stoneDark: material({ base: 0x5a4a3a }),
    windLeg: material({ base: 0x4ab8a8 }),
    windTrim: material({ base: 0xe8fff8 }),
    runeLeg: material({ base: 0x3a3a7a }),
    runeDark: material({ base: 0x23234a, shiny: true }),
    runeGlow: material({ base: 0x7ad8ff, glow: true }),
    bloodLeg: material({ base: 0x6a1a2a }),
    bloodDark: material({ base: 0x3a0e18 }),
    bloodGlow: material({ base: 0xff3a4a, glow: true }),
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
  const useId = build.gear.usable ?? null;
  const [useSkinId, useSkin] = skinArt(useId ?? undefined);
  const use = useId ? usableArt(useId, useSkinId) : null;
  if (use) for (const [k, v] of Object.entries(use.mats)) mats['u.' + k] = v;
  if (sec) for (const [k, v] of Object.entries(sec.mats)) mats['s.' + k] = v;
  // Armour skins recolour the body's armour materials; reshaped headgear brings its own.
  let headDraw: HeadDraw | null = null;
  let headFace = false;
  let headMats: string[] = [];
  // Second-wave stock pieces bring their own materials.
  for (const slot of ['head', 'chest', 'legs', 'boots'] as const) {
    const id = build.gear[slot];
    const a = id ? ARMOUR2[id] : undefined;
    if (a) for (const [k, spec] of Object.entries(a.mats)) mats[k] = stockMat(k, spec);
  }
  const worn: Record<'head' | 'chest' | 'legs' | 'boots', SkinArt | null> = { head: null, chest: null, legs: null, boots: null };
  for (const slot of ['head', 'chest', 'legs', 'boots'] as const) {
    const [, art] = skinArt(build.gear[slot]);
    if (!art) continue;
    worn[slot] = art;
    for (const [k, spec] of Object.entries(art.mats ?? {})) mats[k] = material(spec);
    if (art.head) {
      const hs = art.head();
      Object.assign(mats, hs.mats);
      headMats = Object.keys(hs.mats);
      headDraw = hs.draw;
      headFace = !!hs.face;
    }
  }
  // Special item skins only recolour what the body wears of them (feather, fang).
  const [specialSkinId, specialSkin] = skinArt(build.gear.special);
  for (const k of ['plume', 'plumeTip', 'fangTooth', 'fangBlood']) {
    const spec = specialSkin?.mats?.[k];
    if (spec) mats[k] = material(spec);
  }
  // A reshaped plume brings its own materials (named `p.*`).
  if (specialSkin?.plume) for (const [k, spec] of Object.entries(specialSkin.mats ?? {})) if (k.startsWith('p.')) mats[k] = material(spec);
  const chest = { ...tunicFor(build.gear.chest), ...worn.chest?.chest };
  const legs = { ...legsFor(build.gear.legs), ...worn.legs?.legs };
  const boots = { ...bootsFor(build.gear.boots), ...worn.boots?.boots };
  nightAccents(mats, build, skins, [
    [build.gear.main, (k) => k.startsWith('w.')],
    [secId, (k) => k.startsWith('s.')],
    [useId, (k) => k.startsWith('u.')],
    [build.gear.head, keysOf(HEAD_KEYS, worn.head, build.gear.head)],
    [build.gear.chest, keysOf([chest.torso, chest.sleeve, chest.forearm, chest.pauldron, chest.cape, chest.hood, chest.spikes, chest.trim, chest.skirtMat, chest.belt], worn.chest, build.gear.chest)],
    [build.gear.legs, keysOf([legs.mat, legs.trim, legs.knee, legs.tasset, legs.rune, legs.wraps], worn.legs, build.gear.legs)],
    [build.gear.boots, keysOf([boots.mat, boots.trim, boots.wing, boots.knee], worn.boots, build.gear.boots)],
    [build.gear.special, (k) => SPECIAL_KEYS.includes(k) || k.startsWith('p.')],
  ], headMats);
  return {
    build, look, form: build.form,
    body: bodyFor(build.form, look.species),
    gear: build.gear,
    mats,
    mainId, main, family: MAIN_FAMILY[mainId],
    hands: MAIN_FAMILY[mainId] === 'sword' || MAIN_FAMILY[mainId] === 'wand' ? 1 : 2,
    secId, sec, secFamily: secId ? SEC_FAMILY[secId] : null,
    chest,
    headgear: build.gear.head ?? null,
    legs,
    boots,
    useId, use, useSkin, useSkinId,
    skins, mainSkin, secSkin, headDraw, headFace,
    headSkin: worn.head, chestSkin: worn.chest, legsSkin: worn.legs, bootsSkin: worn.boots,
    specialSkin, specialSkinId,
    set: fullSet(build.gear, skins),
  };
}
