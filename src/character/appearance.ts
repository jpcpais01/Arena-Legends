import type { FormId } from '../sim/types';

/**
 * What a character looks like. Pure data: the sim carries it, the renderer
 * draws it. Species are looks only; stats come from the body form and gear,
 * but each species only grows into the body forms that suit it.
 */

export type SpeciesId = 'human' | 'kitsu' | 'ogrin' | 'wisp' | 'lop' | 'imp' | 'golem' | 'saurin' | 'ursin' | 'myco';

export const SPECIES_IDS: SpeciesId[] = ['human', 'kitsu', 'lop', 'imp', 'saurin', 'myco', 'ogrin', 'ursin', 'wisp', 'golem'];

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  blurb: string;
  /** Skin (or fur, stone, spirit) base colours to choose from. */
  skins: number[];
  /** Has hair (golems grow crystals, saurin a crest, myco a cap instead). */
  hair: boolean;
  /** Body forms this species can take, in display order. */
  forms: FormId[];
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  human: {
    id: 'human', name: 'Human', blurb: 'Wandering heroes with a trailing scarf and nothing to lean on but nerve.',
    skins: [0xf6dcc4, 0xe8b893, 0xc98c62, 0x9a6440, 0x6a4230], hair: true,
    forms: ['robust', 'agile', 'balanced', 'slender', 'mighty', 'stout'],
  },
  kitsu: {
    id: 'kitsu', name: 'Kitsu', blurb: 'Fox-folk with tall ears and a brush of a tail.',
    skins: [0xf2c9a0, 0xe8a77a, 0xd98a5a, 0xf6e2c8], hair: true,
    forms: ['agile', 'balanced', 'slender', 'ethereal', 'feral'],
  },
  lop: {
    id: 'lop', name: 'Lop', blurb: 'Rabbit-folk with long drooping ears. Quick to bolt, quicker to bite.',
    skins: [0xf6dcc6, 0xe9c2a6, 0xc99a7a, 0xfaf0e6], hair: true,
    forms: ['agile', 'balanced', 'slender', 'stout', 'feral'],
  },
  imp: {
    id: 'imp', name: 'Imp', blurb: 'Horned and mischievous, with a whip of a tail.',
    skins: [0xd2584a, 0xa04ab0, 0x5a6ad0, 0xe07a3a], hair: true,
    forms: ['agile', 'balanced', 'mighty', 'stout', 'feral'],
  },
  ogrin: {
    id: 'ogrin', name: 'Ogrin', blurb: 'Tusked and broad. Green-skinned brawlers from the bogs.',
    skins: [0x7ab060, 0x5a9a7a, 0x9aa858, 0x6a8ab0], hair: true,
    forms: ['robust', 'balanced', 'mighty', 'stout', 'feral', 'titan'],
  },
  wisp: {
    id: 'wisp', name: 'Wisp', blurb: 'Spirit-folk with glowing eyes and hair that burns like cold flame.',
    skins: [0xcfe4ff, 0xe2d4ff, 0xc8fff0, 0xffe0f0], hair: true,
    forms: ['agile', 'balanced', 'slender', 'ethereal'],
  },
  golem: {
    id: 'golem', name: 'Golem', blurb: 'Living stone with crystals growing from the shoulders and crown.',
    skins: [0x9a9488, 0x7a8494, 0xb0906a, 0x6e7a6a], hair: false,
    forms: ['robust', 'balanced', 'mighty', 'stout', 'titan'],
  },
  saurin: {
    id: 'saurin', name: 'Saurin', blurb: 'Lizard-folk with a long snout, a spiny crest and a heavy, sweeping tail.',
    skins: [0x5aa060, 0x3a9a90, 0xc8a860, 0xb85040, 0x6a7ac0], hair: false,
    forms: ['agile', 'balanced', 'slender', 'mighty', 'feral'],
  },
  myco: {
    id: 'myco', name: 'Myco', blurb: 'Mushroom-folk under a broad spotted cap that glows softly in the dark.',
    skins: [0xf2e6d0, 0xe6d6ee, 0xd8ead0, 0xc8b49a], hair: false,
    forms: ['agile', 'balanced', 'stout', 'ethereal'],
  },
  ursin: {
    id: 'ursin', name: 'Ursin', blurb: 'Bear-folk: round ears, a broad muzzle and the strength to match.',
    skins: [0x8a5a36, 0x5a3e2c, 0x2e2a2c, 0xece6da, 0xb08a5a], hair: true,
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

export const DEFAULT_LOOK: Appearance = { species: 'kitsu', skin: 0, hair: 0, hairColor: 2, eyes: 1, outfit: 0, accent: 0 };

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
