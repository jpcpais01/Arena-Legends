import type { GearId, GearSet } from '../sim/types';

/**
 * Item skins: cosmetic variants of a piece of gear. A skin never changes how
 * an item fights; the sim doesn't read skins at all.
 *
 *  - rare: new colours and surface finish
 *  - mythic: also reshapes the item
 *  - legendary: reshaped, with animated surfaces and its own effects in battle
 *  - epic: the showpieces. Everything legendary has, more of it, and they come
 *    in sets of six (one per gear slot) that share one look; wearing a whole
 *    set gives the fighter that set's aura
 */
export type SkinRarity = 'rare' | 'mythic' | 'legendary' | 'epic';
export const SKIN_RARITIES: readonly SkinRarity[] = ['rare', 'mythic', 'legendary', 'epic'];

export const RARITY_INFO: Record<SkinRarity, string> = {
  rare: 'New colours and finish.',
  mythic: 'Reshaped: a new silhouette.',
  legendary: 'Reshaped, animated, with its own battle effects.',
  epic: 'Part of a set of six. Wear the whole set for its aura.',
};

export interface SkinDef {
  id: string;
  gear: GearId;
  name: string;
  rarity: SkinRarity;
  /** Epic skins: the set this piece belongs to. */
  set?: SkinSetId;
}

export type SkinSetId = 'sunborn' | 'hellforged' | 'foxfire' | 'wildwood' | 'abyssal' | 'clockwork';

export interface SkinSet {
  id: SkinSetId;
  name: string;
  blurb: string;
}

/** Epic sets: one piece per gear slot, all in one look. */
export const SKIN_SETS: readonly SkinSet[] = [
  { id: 'sunborn', name: 'Sunborn Dynasty', blurb: 'Gold and lapis of a god-king, crowned by the sun.' },
  { id: 'hellforged', name: 'Hellforged', blurb: 'Black iron from the abyss, molten at every seam.' },
  { id: 'foxfire', name: 'Foxfire Shrine', blurb: 'White lacquer and vermilion, haunted by blue fox flames.' },
  { id: 'wildwood', name: 'Wildwood', blurb: 'Living wood and emerald in bloom, with fireflies drifting about.' },
  { id: 'abyssal', name: 'Abyssal Tide', blurb: 'Treasure of the deep: scale, coral and pearl, lit by glowing sea life.' },
  { id: 'clockwork', name: 'Clockwork Titan', blurb: 'Brass and steam, gears turning and pistons pumping, an arcane core humming.' },
];
export const SKIN_SET_BY_ID: ReadonlyMap<SkinSetId, SkinSet> = new Map(SKIN_SETS.map((s) => [s.id, s]));

/** The skin picked for each item (kept per item, so swapping gear back restores it). */
export type SkinMap = Partial<Record<GearId, string>>;

const S = (gear: GearId, rarity: SkinRarity, id: string, name: string): SkinDef => ({ id: `${gear}.${id}`, gear, name, rarity });
const E = (set: SkinSetId, gear: GearId, id: string, name: string): SkinDef => ({ id: `${gear}.${id}`, gear, name, rarity: 'epic', set });

export const SKINS: readonly SkinDef[] = [
  // Main weapons
  S('longsword', 'rare', 'verdigris', 'Verdigris Blade'),
  S('longsword', 'mythic', 'wyrmfang', 'Wyrmfang'),
  S('longsword', 'legendary', 'dawnbreaker', 'Dawnbreaker'),
  S('katana', 'rare', 'sakura', 'Sakura Edge'),
  S('katana', 'mythic', 'tsukuyomi', 'Tsukuyomi'),
  S('mace', 'rare', 'obsidian', 'Obsidian Mace'),
  S('dagger', 'rare', 'nightshade', 'Nightshade'),
  S('dagger', 'mythic', 'serpent', 'Serpent Kris'),
  S('ember_wand', 'rare', 'driftwood', 'Driftwood Wand'),
  S('ember_wand', 'mythic', 'bonetorch', 'Bone Torch'),
  S('ember_wand', 'legendary', 'volcano', 'Heart of the Volcano'),
  S('warhammer', 'rare', 'glacier', 'Glacier Maul'),
  S('warhammer', 'legendary', 'thunderfall', 'Thunderfall'),
  S('greataxe', 'rare', 'bloodmoon', 'Blood Moon'),
  S('greataxe', 'mythic', 'twinmoon', 'Twinmoon Axe'),
  S('spear', 'rare', 'jade', 'Jade Spear'),
  S('spear', 'mythic', 'glaive', 'Dragon Glaive'),
  S('spear', 'legendary', 'starpiercer', 'Starpiercer'),
  S('arcane_staff', 'rare', 'verdant', 'Verdant Staff'),
  S('arcane_staff', 'mythic', 'serpent', 'Serpent Staff'),
  S('arcane_staff', 'legendary', 'cosmos', 'Staff of the Cosmos'),
  S('longbow', 'rare', 'ashen', 'Ashen Bow'),
  S('longbow', 'mythic', 'wyvern', 'Wyvern Recurve'),
  S('longbow', 'legendary', 'sunstring', 'Sunstring'),
  // Secondary
  S('kite_shield', 'rare', 'crimson', 'Crimson Crest'),
  S('kite_shield', 'mythic', 'dragonscale', 'Dragonscale Shield'),
  S('kite_shield', 'legendary', 'aegis', 'Aegis of Dawn'),
  S('parrying_dagger', 'rare', 'blacksteel', 'Blacksteel Main-Gauche'),
  S('buckler', 'rare', 'sunbronze', 'Sunbronze Buckler'),
  S('throwing_knives', 'rare', 'gilded', 'Gilded Knives'),
  S('hand_crossbow', 'rare', 'ebon', 'Ebon Crossbow'),
  S('wind_chakram', 'rare', 'jade', 'Jade Chakram'),
  S('frost_wand', 'rare', 'amethyst', 'Amethyst Wand'),
  S('war_horn', 'rare', 'dragon', 'Dragon Horn'),
  // Armour
  S('iron_helm', 'rare', 'blackiron', 'Blackiron Helm'),
  S('iron_helm', 'mythic', 'warhelm', 'Horned Warhelm'),
  S('storm_crown', 'rare', 'frost', 'Frost Crown'),
  S('storm_crown', 'legendary', 'celestial', 'Celestial Crown'),
  S('plate_armor', 'rare', 'gilded', 'Gilded Plate'),
  S('mage_robe', 'rare', 'starweave', 'Starweave Robe'),
  S('leather_jerkin', 'rare', 'snakeskin', 'Snakeskin Jerkin'),
  S('leather_boots', 'rare', 'snakeskin', 'Snakeskin Boots'),
  S('iron_greaves', 'rare', 'gilded', 'Gilded Greaves'),

  // Second wave (v0.7.0)
  S('chrono_circlet', 'rare', 'rosegold', 'Rose Gold Circlet'),
  S('executioner_hood', 'rare', 'crimson', 'Crimson Cowl'),
  S('duelist_band', 'rare', 'azure', 'Azure Band'),
  S('phase_cloak', 'rare', 'ember', 'Ember Cloak'),
  S('thornmail', 'rare', 'autumn', 'Autumn Thornmail'),
  S('mirror_mail', 'rare', 'obsidian', 'Obsidian Mirror'),
  S('zephyr_boots', 'rare', 'stormwind', 'Stormwind Boots'),
  S('shadow_treads', 'rare', 'bloodshadow', 'Bloodshadow Treads'),
  S('colossus_boots', 'rare', 'mossback', 'Mossback Boots'),
  S('leaping_boots', 'rare', 'jade', 'Jade Leapers'),
  S('mace', 'mythic', 'morningstar', 'Morningstar'),
  S('warhammer', 'mythic', 'skullcrusher', 'Skullcrusher'),
  S('buckler', 'mythic', 'lionheart', 'Lionheart'),
  S('parrying_dagger', 'mythic', 'swordbreaker', 'Swordbreaker'),
  S('hand_crossbow', 'mythic', 'wyrm', 'Wyrm Repeater'),
  S('war_horn', 'mythic', 'kraken', 'Kraken Conch'),
  S('frost_wand', 'mythic', 'icicle', 'Icicle Scepter'),
  S('berserker_mask', 'mythic', 'oni', 'Oni Mask'),
  S('executioner_hood', 'mythic', 'raven', 'Raven Hood'),
  S('plate_armor', 'mythic', 'dragonknight', 'Dragonknight Plate'),
  S('katana', 'legendary', 'kagutsuchi', 'Kagutsuchi'),
  S('dagger', 'legendary', 'voidfang', 'Voidfang'),
  S('mace', 'legendary', 'geode', 'Geode Heart'),
  S('greataxe', 'legendary', 'frostreaver', 'Frostreaver'),
  S('frost_wand', 'legendary', 'winter', "Winter's Heart"),
  S('wind_chakram', 'legendary', 'solar', 'Solar Disc'),
  S('chrono_circlet', 'legendary', 'eternity', 'Eternity Circlet'),
  S('duelist_band', 'legendary', 'phoenix', 'Phoenix Band'),
  S('mage_robe', 'legendary', 'nebula', 'Nebula Robe'),
  S('zephyr_boots', 'legendary', 'stormstriders', 'Stormstriders'),
  // Third wave: rare (the special items get their first skins)
  S('longsword', 'rare', 'royal', 'Royal Guard'),
  S('berserker_mask', 'rare', 'bone', 'Bone Mask'),
  S('meteor_sigil', 'rare', 'frostfall', 'Frostfall Sigil'),
  S('phantom_blade', 'rare', 'crimson', 'Crimson Phantom'),
  S('wisp_lantern', 'rare', 'firefly', 'Firefly Lantern'),
  S('phoenix_feather', 'rare', 'azure', 'Bluefire Plume'),
  S('echo_stone', 'rare', 'amber', 'Amber Echo'),
  S('vampiric_fang', 'rare', 'moonsilver', 'Moonsilver Fang'),
  S('ember_core', 'rare', 'soulfire', 'Soulfire Core'),
  S('frost_core', 'rare', 'amethyst', 'Amethyst Core'),
  // Third wave: mythic
  S('throwing_knives', 'mythic', 'feathers', 'Raven Feathers'),
  S('wind_chakram', 'mythic', 'lotus', 'Lotus Chakram'),
  S('chrono_circlet', 'mythic', 'hourglass', 'Hourglass Crown'),
  S('storm_crown', 'mythic', 'thunderbird', 'Thunderbird Crest'),
  S('duelist_band', 'mythic', 'musketeer', 'Musketeer Hat'),
  S('phase_cloak', 'mythic', 'wraith', 'Wraith Shroud'),
  S('thornmail', 'mythic', 'rosethorn', 'Rosethorn Mail'),
  S('leather_jerkin', 'mythic', 'ranger', 'Ranger Mantle'),
  S('leather_boots', 'mythic', 'buccaneer', 'Buccaneer Boots'),
  S('iron_greaves', 'mythic', 'gothic', 'Gothic Sabatons'),
  // Third wave: legendary
  S('parrying_dagger', 'legendary', 'tidecaller', 'Tidecaller'),
  S('buckler', 'legendary', 'everbloom', 'Everbloom'),
  S('hand_crossbow', 'legendary', 'venom', 'Venomspitter'),
  S('war_horn', 'legendary', 'aurora', 'Horn of the Aurora'),
  S('berserker_mask', 'legendary', 'bloodfury', 'Bloodfury Visage'),
  S('iron_helm', 'legendary', 'seraph', 'Seraph Helm'),
  S('plate_armor', 'legendary', 'soulbound', 'Soulbound Plate'),
  S('mirror_mail', 'legendary', 'prism', 'Prism Mail'),
  S('colossus_boots', 'legendary', 'earthshaker', 'Earthshakers'),
  S('shadow_treads', 'legendary', 'umbral', 'Umbral Treads'),
  // Epic sets
  E('sunborn', 'arcane_staff', 'ra', 'Scepter of Ra'),
  E('sunborn', 'kite_shield', 'horus', 'Wings of Horus'),
  E('sunborn', 'phoenix_feather', 'maat', "Feather of Ma'at"),
  E('sunborn', 'chrono_circlet', 'nemes', 'Nemes of the Sun King'),
  E('sunborn', 'mage_robe', 'pharaoh', "Pharaoh's Regalia"),
  E('sunborn', 'leaping_boots', 'sunstride', 'Sandals of the Sun'),
  E('hellforged', 'greataxe', 'hellmaw', 'Hellmaw'),
  E('hellforged', 'throwing_knives', 'brimstone', 'Brimstone Fangs'),
  E('hellforged', 'meteor_sigil', 'doom', 'Doomcaller Sigil'),
  E('hellforged', 'storm_crown', 'brimstone', 'Crown of Brimstone'),
  E('hellforged', 'thornmail', 'hellforged', 'Hellforged Carapace'),
  E('hellforged', 'iron_greaves', 'hellstride', 'Hellstriders'),
  E('foxfire', 'katana', 'kitsunebi', 'Kitsunebi'),
  E('foxfire', 'frost_wand', 'gohei', 'Shrine Gohei'),
  E('foxfire', 'wisp_lantern', 'foxfire', 'Foxfire Lantern'),
  E('foxfire', 'duelist_band', 'kitsune', 'Kitsune Mask'),
  E('foxfire', 'phase_cloak', 'ninetails', 'Nine-Tails Haori'),
  E('foxfire', 'leather_boots', 'geta', 'Foxfire Geta'),
  E('wildwood', 'longsword', 'elderheart', 'Elderheart'),
  E('wildwood', 'war_horn', 'wildhunt', 'Horn of the Wild Hunt'),
  E('wildwood', 'phantom_blade', 'dryad', "Dryad's Spirit Blade"),
  E('wildwood', 'executioner_hood', 'stag', 'Hood of the Stag King'),
  E('wildwood', 'leather_jerkin', 'wildwood', 'Wildwood Mantle'),
  E('wildwood', 'zephyr_boots', 'rootwalkers', 'Rootwalkers'),
  E('abyssal', 'spear', 'trident', 'Trident of the Deep'),
  E('abyssal', 'wind_chakram', 'nautilus', 'Nautilus Disc'),
  E('abyssal', 'frost_core', 'pearl', 'Pearl of the Abyss'),
  E('abyssal', 'iron_helm', 'leviathan', 'Leviathan Helm'),
  E('abyssal', 'mirror_mail', 'abyssal', 'Abyssal Scale'),
  E('abyssal', 'shadow_treads', 'tidewalkers', 'Tidewalkers'),
  E('clockwork', 'warhammer', 'steamforge', 'Steamforge Hammer'),
  E('clockwork', 'buckler', 'cogwheel', 'Cogwheel Aegis'),
  E('clockwork', 'echo_stone', 'heart', 'Clockwork Heart'),
  E('clockwork', 'berserker_mask', 'automaton', 'Automaton Visage'),
  E('clockwork', 'plate_armor', 'titan', 'Titan Frame'),
  E('clockwork', 'colossus_boots', 'piston', 'Piston Stompers'),
];

export const SKIN_BY_ID: ReadonlyMap<string, SkinDef> = new Map(SKINS.map((s) => [s.id, s]));

/** Skins for one item, rare first. */
export function skinsFor(gear: GearId): SkinDef[] {
  return SKINS.filter((s) => s.gear === gear).sort((a, b) => SKIN_RARITIES.indexOf(a.rarity) - SKIN_RARITIES.indexOf(b.rarity));
}

/** The skin worn on an item, if any. */
export function skinOn(skins: SkinMap | undefined, gear: GearId): SkinDef | null {
  const id = skins?.[gear];
  const s = id ? SKIN_BY_ID.get(id) : undefined;
  return s && s.gear === gear ? s : null;
}

/** Validates a skin map from storage: unknown skins, or skins on the wrong item, are dropped. */
export function sanitizeSkins(raw: unknown): SkinMap {
  const out: SkinMap = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [gear, id] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id !== 'string') continue;
    const s = SKIN_BY_ID.get(id);
    if (s && s.gear === gear) out[s.gear] = s.id;
  }
  return out;
}

/** The pieces of a set, in gear slot order. */
export function setPieces(set: SkinSetId): SkinDef[] {
  return SKINS.filter((s) => s.set === set);
}

/** The set a fighter wears in full (all six items equipped, each in its set skin), if any. */
export function fullSet(gear: GearSet, skins: SkinMap | undefined): SkinSetId | null {
  const first = skinOn(skins, gear.main)?.set;
  if (!first) return null;
  for (const p of setPieces(first)) {
    if ((Object.values(gear) as GearId[]).indexOf(p.gear) < 0 || skins?.[p.gear] !== p.id) return null;
  }
  return first;
}

const WEIGHT: Record<SkinRarity, number> = { rare: 6, mythic: 3, legendary: 1.2, epic: 0.6 };

/** Random skins for a generated rival: some items plain, rarer skins less often. */
export function randomSkins(gear: GearSet, r: () => number = Math.random): SkinMap {
  const out: SkinMap = {};
  for (const id of Object.values(gear) as GearId[]) {
    const list = skinsFor(id);
    if (!list.length || r() < 0.4) continue;
    let total = 0;
    for (const s of list) total += WEIGHT[s.rarity];
    let k = r() * total;
    let pick = list[list.length - 1];
    for (const s of list) {
      k -= WEIGHT[s.rarity];
      if (k <= 0) { pick = s; break; }
    }
    out[id] = pick.id;
  }
  return out;
}
