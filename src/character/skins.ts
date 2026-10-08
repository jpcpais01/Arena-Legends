import type { GearId, GearSet } from '../sim/types';

/**
 * Item skins: cosmetic variants of a piece of gear. A skin never changes how
 * an item fights; the sim doesn't read skins at all.
 *
 *  - rare: new colours and surface finish
 *  - mythic: also reshapes the item
 *  - legendary: reshaped, with animated surfaces and its own effects in battle
 */
export type SkinRarity = 'rare' | 'mythic' | 'legendary';
export const SKIN_RARITIES: readonly SkinRarity[] = ['rare', 'mythic', 'legendary'];

export const RARITY_INFO: Record<SkinRarity, string> = {
  rare: 'New colours and finish.',
  mythic: 'Reshaped: a new silhouette.',
  legendary: 'Reshaped, animated, with its own battle effects.',
};

export interface SkinDef {
  id: string;
  gear: GearId;
  name: string;
  rarity: SkinRarity;
}

/** The skin picked for each item (kept per item, so swapping gear back restores it). */
export type SkinMap = Partial<Record<GearId, string>>;

const S = (gear: GearId, rarity: SkinRarity, id: string, name: string): SkinDef => ({ id: `${gear}.${id}`, gear, name, rarity });

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

const WEIGHT: Record<SkinRarity, number> = { rare: 6, mythic: 3, legendary: 1.2 };

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
