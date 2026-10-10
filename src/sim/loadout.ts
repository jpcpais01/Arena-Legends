import { fitForm, randomAppearance, sanitizeAppearance, type Appearance } from '../character/appearance';
import { sanitizeSkins, type SkinMap } from '../character/skins';
import type { Rng } from '../core/rng';
import { EVADE } from './abilities';
import { FORMS, FORM_IDS, type Personality } from './forms';
import { drawTimes, useTimes, GEAR, GEAR_SLOTS, gearIdsFor, gearOf, type GearDef } from './gear';
import { FIGHT_STYLES, isFightStyle, type FightStyleId } from './styles';
import type { AbilityDef, FormId, GearId, GearSet, GearSlot, Stats } from './types';

export type { Appearance };

/**
 * One persistent character: who the player is. There are no classes: the form
 * is the body, and the gear decides how it fights.
 */
export interface CharacterBuild {
  name: string;
  form: FormId;
  gear: GearSet;
  look?: Appearance;
  /** Cosmetic item skins. The sim never reads them. */
  skins?: SkinMap;
  /** How the hero likes to fight (AI habits only). Balanced when absent. */
  style?: FightStyleId;
}

/** Fighting habits the AI derives from form + gear. */
export interface CombatProfile {
  personality: Personality;
  /** Ideal fighting distance (centre to centre). */
  preferredRange: number;
  /** Prefers to fight from range. */
  ranged: boolean;
  style: FightStyleId;
}

/** Equipped gear pieces, in slot order. */
export function equipped(gear: GearSet): GearDef[] {
  const out: GearDef[] = [];
  for (const s of GEAR_SLOTS) {
    const id = gear[s];
    if (id) out.push(gearOf(id));
  }
  return out;
}

export function gearIds(gear: GearSet): GearId[] {
  return equipped(gear).map((g) => g.id);
}

/** Hands the main weapon needs. */
export function mainHands(gear: GearSet): 1 | 2 {
  return GEAR.main[gear.main].weapon!.hands;
}

/**
 * Abilities a build can use, in a stable order: main weapon (basic, skill),
 * secondary weapon, chest, special item, usable item, and always the evade last.
 * Secondary and usable abilities include the time to take the item out and put it away.
 */
export function buildAbilities(gear: GearSet): AbilityDef[] {
  const out: AbilityDef[] = [];
  const order: GearSlot[] = ['main', 'secondary', 'chest', 'special', 'usable'];
  const hands = mainHands(gear);
  for (const slot of order) {
    const id = gear[slot];
    if (!id) continue;
    for (const ab of gearOf(id).abilities ?? []) {
      if (slot === 'secondary' || slot === 'usable') {
        const swap = slot === 'secondary' ? drawTimes(hands) : useTimes(hands);
        out.push({
          ...ab, from: slot, draw: swap.draw, stow: swap.stow,
          windup: ab.windup + swap.draw, recovery: ab.recovery + swap.stow,
        });
      } else {
        out.push({ ...ab, from: slot });
      }
    }
  }
  const boots = gear.boots ? GEAR.boots[gear.boots] : null;
  const evade = boots?.evade ?? EVADE;
  // Acrobat Trousers: the evade recharges faster.
  const evadeCd = gear.legs === 'acrobat_trousers' ? evade.cooldown * 0.72 : evade.cooldown;
  out.push({ ...evade, cooldown: evadeCd, from: 'boots' });
  return out;
}

/** Form base stats + gear additions, then gear multipliers. */
export function computeBaseStats(form: FormId, gear: GearSet): Stats {
  const s: Stats = { ...FORMS[form].base };
  const pieces = equipped(gear);
  const w = s as unknown as Record<string, number>;
  for (const it of pieces) if (it.add) for (const [k, v] of Object.entries(it.add)) w[k] += v;
  for (const it of pieces) if (it.mul) for (const [k, v] of Object.entries(it.mul)) w[k] *= v;
  s.cdr = Math.min(s.cdr, 0.6);
  s.tenacity = Math.min(s.tenacity, 0.7);
  return s;
}

const clamp01 = (v: number) => Math.min(0.95, Math.max(0.05, v));

/** Temperament and spacing for the AI, from the body and what it carries. */
export function buildProfile(form: FormId, gear: GearSet, style: FightStyleId = 'balanced'): CombatProfile {
  const p = { ...FORMS[form].personality };
  const t = FIGHT_STYLES[style].temper;
  p.aggression += t.aggression ?? 0;
  p.caution += t.caution ?? 0;
  p.cunning += t.cunning ?? 0;
  const weapon = GEAR.main[gear.main].weapon!;
  const tags = new Set(equipped(gear).flatMap((g) => g.tags));
  if (weapon.ranged) { p.aggression -= 0.15; p.caution += 0.1; }
  if (tags.has('heavy')) p.aggression += 0.08;
  if (tags.has('tank')) p.caution -= 0.04;
  if (tags.has('parry')) p.cunning += 0.06;
  if (gear.head === 'berserker_mask') p.aggression += 0.12;
  if (tags.has('sustain')) p.caution += 0.03;
  return {
    personality: {
      aggression: clamp01(p.aggression), caution: clamp01(p.caution), cunning: clamp01(p.cunning),
      adaptivity: p.adaptivity, reaction: p.reaction,
    },
    preferredRange: weapon.preferredRange,
    ranged: weapon.ranged,
    style,
  };
}

export const DEFAULT_BUILDS: [CharacterBuild, CharacterBuild] = [
  {
    name: 'Aren', form: 'balanced',
    gear: { main: 'longsword', secondary: 'kite_shield', special: 'phantom_blade', usable: 'healing_potion', head: 'storm_crown', chest: 'plate_armor', legs: 'chain_leggings', boots: 'leather_boots' },
    look: { species: 'human', skin: 0, hair: 0, hairColor: 2, eyes: 1, outfit: 0, accent: 0 },
  },
  {
    name: 'Vesper', form: 'ethereal',
    gear: { main: 'arcane_staff', secondary: 'frost_wand', special: 'meteor_sigil', usable: 'energy_tonic', head: 'chrono_circlet', chest: 'phase_cloak', legs: 'runed_leggings', boots: 'zephyr_boots' },
    look: { species: 'wisp', skin: 1, hair: 1, hairColor: 6, eyes: 6, outfit: 4, accent: 1 },
  },
];

const NAMES = ['Aren', 'Vesper', 'Kael', 'Brakka', 'Lyra', 'Tor', 'Mira', 'Soren', 'Ysolde', 'Dax', 'Nyx', 'Oren', 'Pip', 'Rook', 'Sable', 'Juno'];

/** A random, fully equipped character. Uses `Math.random` unless an Rng is given. */
export function randomBuild(rng?: Rng): CharacterBuild {
  const r = () => (rng ? rng.next() : Math.random());
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const gear = { main: pick(gearIdsFor('main')) } as GearSet;
  const w = gear as Record<GearSlot, GearId>;
  for (const s of GEAR_SLOTS) if (s !== 'main') w[s] = pick(gearIdsFor(s));
  const form = pick(FORM_IDS);
  return { name: pick(NAMES), form, gear, look: randomAppearance(r, form) };
}

/**
 * Validates data from storage or the network. Unknown forms or gear fall back
 * to `fallback`.
 */
export function sanitizeBuild(raw: unknown, fallback: CharacterBuild): CharacterBuild {
  if (!raw || typeof raw !== 'object') return fallback;
  const o = raw as Record<string, unknown>;
  let form: FormId = FORM_IDS.includes(o.form as FormId) ? (o.form as FormId) : fallback.form;
  const g = (o.gear && typeof o.gear === 'object' ? o.gear : {}) as Record<string, unknown>;
  const gear = {} as Record<GearSlot, GearId>;
  for (const s of GEAR_SLOTS) {
    const id = g[s];
    if (typeof id === 'string' && id in GEAR[s]) gear[s] = id as GearId;
  }
  if (!gear.main) return fallback;
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 16) : fallback.name;
  const look = o.look && typeof o.look === 'object' ? sanitizeAppearance(o.look) : fallback.look;
  // A species only takes the body forms that suit it (older saves predate that rule).
  if (look) form = fitForm(look.species, form);
  const style = isFightStyle(o.style) ? o.style : fallback.style;
  return { name, form, gear: gear as unknown as GearSet, look, skins: sanitizeSkins(o.skins), ...(style ? { style } : {}) };
}

/** Replaces one slot, keeping the rest. Passing null empties it (not allowed for `main`). */
export function withGear(build: CharacterBuild, slot: GearSlot, id: GearId | null): CharacterBuild {
  const gear = { ...build.gear } as Record<GearSlot, GearId | undefined>;
  if (id) {
    if (gearOf(id).slot !== slot) throw new Error(`${id} does not go in ${slot}`);
    gear[slot] = id;
  } else if (slot !== 'main') {
    delete gear[slot];
  }
  return { ...build, gear: gear as GearSet };
}
