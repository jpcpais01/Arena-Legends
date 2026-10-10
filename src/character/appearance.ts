import type { FormId } from '../sim/types';

/**
 * What a character looks like. Pure data: the sim carries it, the renderer
 * draws it. Species are looks only; stats come from the body form and gear,
 * but each species only grows into the body forms that suit it.
 */

export type SpeciesId = 'human' | 'imp' | 'myco' | 'ogrin' | 'wisp' | 'golem';

export const SPECIES_IDS: SpeciesId[] = ['human', 'imp', 'myco', 'ogrin', 'wisp', 'golem'];

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  blurb: string;
  /** Skin (or stone, spirit) base colours to choose from. */
  skins: number[];
  /** Has hair (golems grow crystals, myco a cap instead). */
  hair: boolean;
  /** Hairless species: the shapes their crown comes in (picked with `Appearance.hair`), and what it's called. */
  styles?: readonly string[];
  styleLabel?: string;
  /** Body forms this species can take, in display order. */
  forms: FormId[];
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  human: {
    id: 'human', name: 'Human', blurb: 'Wandering heroes with a trailing scarf and nothing to lean on but nerve.',
    skins: [0xf6dcc4, 0xe8b893, 0xc98c62, 0x9a6440, 0x6a4230], hair: true,
    forms: ['robust', 'agile', 'balanced', 'slender', 'mighty', 'stout'],
  },
  imp: {
    id: 'imp', name: 'Imp', blurb: 'Little devils with curling horns, burning eyes, bat wings and a spade-tipped tail.',
    skins: [0xd2584a, 0xa04ab0, 0x5a6ad0, 0xe07a3a, 0x3a3448], hair: true,
    forms: ['agile', 'balanced', 'slender', 'mighty', 'stout', 'feral'],
  },
  myco: {
    id: 'myco', name: 'Myco', blurb: 'Mushroom-folk under a glowing cap, trailing spores and sprouting little mushrooms of their own.',
    skins: [0xf2e6d0, 0xe6d6ee, 0xd8ead0, 0xc8b49a], hair: false,
    styles: ['Dome', 'Cone', 'Parasol'], styleLabel: 'Cap',
    forms: ['agile', 'balanced', 'stout', 'ethereal'],
  },
  ogrin: {
    id: 'ogrin', name: 'Ogrin', blurb: 'Huge-jawed bog brawlers with jutting tusks, heavy brows, war paint and gold in their ears.',
    skins: [0x7ab060, 0x5a9a7a, 0x9aa858, 0x6a8ab0, 0xa8865a], hair: true,
    forms: ['robust', 'balanced', 'mighty', 'stout', 'feral', 'titan'],
  },
  wisp: {
    id: 'wisp', name: 'Wisp', blurb: 'Spirit-folk crowned with cold flame and a floating halo, motes of light drifting around them.',
    skins: [0xcfe4ff, 0xe2d4ff, 0xc8fff0, 0xffe0f0], hair: true,
    forms: ['agile', 'balanced', 'slender', 'ethereal'],
  },
  golem: {
    id: 'golem', name: 'Golem', blurb: 'Carved stone woken by runes: a glowing visor for eyes, moss on the shoulders and crystals for a crown.',
    skins: [0x9a9488, 0x7a8494, 0xb0906a, 0x6e7a6a, 0x5a5662], hair: false,
    styles: ['Crown', 'Spire', 'Shards'], styleLabel: 'Crystals',
    forms: ['robust', 'balanced', 'mighty', 'stout', 'titan'],
  },
};

/**
 * Closest form to each body form, best first, used when a species can't take
 * a form (old saves, network data, switching species in the creator).
 */
const NEAREST: Record<FormId, FormId[]> = {
  robust: ['mighty', 'titan', 'stout', 'balanced'],
  agile: ['feral', 'slender', 'balanced'],
  balanced: ['agile', 'mighty', 'slender'],
  slender: ['ethereal', 'agile', 'balanced'],
  mighty: ['robust', 'feral', 'titan', 'balanced'],
  ethereal: ['slender', 'agile', 'balanced'],
  stout: ['robust', 'mighty', 'balanced'],
  feral: ['agile', 'mighty', 'balanced'],
  titan: ['robust', 'mighty', 'stout', 'balanced'],
};

export const speciesHasForm = (species: SpeciesId, form: FormId): boolean => SPECIES[species].forms.includes(form);

/** `form` if the species can take it, else the nearest form it can. */
export function fitForm(species: SpeciesId, form: FormId): FormId {
  const ok = SPECIES[species].forms;
  if (ok.includes(form)) return form;
  return NEAREST[form].find((f) => ok.includes(f)) ?? ok[0];
}

/** Species that can take a body form. */
export const speciesFor = (form: FormId): SpeciesId[] => SPECIES_IDS.filter((id) => speciesHasForm(id, form));

export const HAIR_STYLES = ['Spiky', 'Ponytail', 'Bob', 'Mane', 'Buzz', 'Braids'] as const;

export const HAIR_COLORS = [
  0x2a2230, 0x6a3a22, 0xc8742a, 0xf0d070, 0xf4f0e8, 0xb02a3a, 0x3a6ad8, 0x2aa878, 0xd060c0, 0x8a8aa0,
];
export const EYE_COLORS = [0x3a2a1a, 0x2a7ad8, 0x2aa858, 0xd8a020, 0xd02a2a, 0x8a3ad8, 0x20c8d0, 0xf0f0f0];
export const OUTFIT_COLORS = [
  0x3a4a8a, 0x8a2a2a, 0x2a6a4a, 0x6a4a2a, 0x4a2a6a, 0x2a2a34, 0xd0c8b0, 0x2a7a8a, 0xb0682a, 0x7a7a88,
];
export const ACCENT_COLORS = [0xe8b030, 0xd0d8e8, 0xd03a3a, 0x30b0e0, 0x50d070, 0xb050e0, 0xf07a30, 0x2a2a34];

/** Portrait backdrops (painted in render/backdrops.ts), in picker order. */
export const BACKDROPS = ['Twilight', 'Sunset Peaks', 'Wildwood', 'Ember Forge', 'Frostlight'] as const;

export interface Appearance {
  species: SpeciesId;
  /** Index into the species' skins. */
  skin: number;
  /** Index into HAIR_STYLES. */
  hair: number;
  hairColor: number;
  eyes: number;
  /** Clothes under the armour. */
  outfit: number;
  /** Trims, belts, sashes. */
  accent: number;
  /** Index into BACKDROPS: the scene behind the portrait. Older saves have none (the first). */
  backdrop?: number;
}

export const DEFAULT_LOOK: Appearance = { species: 'human', skin: 0, hair: 0, hairColor: 2, eyes: 1, outfit: 0, accent: 0 };

const idx = (v: unknown, n: number, fb: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n ? v : fb;

/** Validates a look from storage or the network. */
export function sanitizeAppearance(raw: unknown): Appearance {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const species = SPECIES_IDS.includes(o.species as SpeciesId) ? (o.species as SpeciesId) : DEFAULT_LOOK.species;
  return {
    species,
    skin: idx(o.skin, SPECIES[species].skins.length, 0),
    hair: idx(o.hair, HAIR_STYLES.length, 0),
    hairColor: idx(o.hairColor, HAIR_COLORS.length, DEFAULT_LOOK.hairColor),
    eyes: idx(o.eyes, EYE_COLORS.length, DEFAULT_LOOK.eyes),
    outfit: idx(o.outfit, OUTFIT_COLORS.length, 0),
    accent: idx(o.accent, ACCENT_COLORS.length, 0),
    backdrop: idx(o.backdrop, BACKDROPS.length, 0),
  };
}

/**
 * A random look. Uses `Math.random` unless a generator is given. With a body
 * form, only species that can take it are picked.
 */
export function randomAppearance(r: () => number = Math.random, form?: FormId): Appearance {
  const pick = (n: number) => Math.floor(r() * n);
  const pool = form ? speciesFor(form) : SPECIES_IDS;
  const species = pool[pick(pool.length)];
  return {
    species,
    skin: pick(SPECIES[species].skins.length),
    hair: pick(HAIR_STYLES.length),
    hairColor: pick(HAIR_COLORS.length),
    eyes: pick(EYE_COLORS.length),
    outfit: pick(OUTFIT_COLORS.length),
    accent: pick(ACCENT_COLORS.length),
  };
}
