import type { FormId, Stats } from './types';

/** Temperament the AI starts from. Gear nudges it (see `buildProfile`). */
export interface Personality {
  /** Desire to close distance and trade. */
  aggression: number;
  /** Weight given to avoiding damage. */
  caution: number;
  /** Likelihood of feints, baits and reads. */
  cunning: number;
  /** How quickly it updates its model of the opponent. */
  adaptivity: number;
  /** Seconds before it can react to an enemy windup. */
  reaction: number;
}

export interface FormDef {
  id: FormId;
  name: string;
  /** One-line identity shown under the name. */
  title: string;
  blurb: string;
  /** UI accent colour. */
  color: number;
  base: Stats;
  personality: Personality;
}

export const BASE_STATS: Stats = {
  maxHp: 2030, power: 60, armor: 20, resist: 20, attackSpeed: 1, moveSpeed: 3.9,
  critChance: 0.05, critMult: 1.6, lifesteal: 0, cdr: 0, energyRegen: 1, tenacity: 0,
  thorns: 0, healMult: 1, damageMult: 1, damageTakenMult: 1,
  poise: 0.18, reach: 1, force: 1, knockbackTaken: 1,
};

const stats = (s: Partial<Stats>): Stats => ({ ...BASE_STATS, ...s });

export const FORMS: Record<FormId, FormDef> = {
  robust: {
    id: 'robust', name: 'Robust', title: 'Big and hard to move',
    blurb: 'Tall and heavy. The most health and armor, shrugs off light hits and knockback, but slow on its feet.',
    color: 0x6f8fb8,
    base: stats({ maxHp: 2324, power: 58, armor: 28, resist: 22, attackSpeed: 0.94, moveSpeed: 3.55, poise: 0.28, knockbackTaken: 0.8, force: 1.05 }),
    personality: { aggression: 0.55, caution: 0.55, cunning: 0.35, adaptivity: 0.55, reaction: 0.22 },
  },
  agile: {
    id: 'agile', name: 'Agile', title: 'Small and quick',
    blurb: 'Short and light. Fastest movement and attacks, but fragile and easily knocked around.',
    color: 0x52d6a0,
    base: stats({ maxHp: 1820, power: 57, armor: 18, resist: 18, attackSpeed: 1.16, moveSpeed: 4.6, critChance: 0.1, poise: 0.1, knockbackTaken: 1.15, reach: 0.95 }),
    personality: { aggression: 0.7, caution: 0.4, cunning: 0.75, adaptivity: 0.7, reaction: 0.16 },
  },
  balanced: {
    id: 'balanced', name: 'Balanced', title: 'Even in everything',
    blurb: 'Average height and build. No weaknesses, no extremes: a clean canvas for any gear.',
    color: 0xd8c27a,
    base: stats({ maxHp: 2128, power: 60, armor: 22, resist: 22, attackSpeed: 1, moveSpeed: 3.95, poise: 0.18 }),
    personality: { aggression: 0.55, caution: 0.5, cunning: 0.5, adaptivity: 0.65, reaction: 0.19 },
  },
  slender: {
    id: 'slender', name: 'Slender', title: 'Long reach, precise strikes',
    blurb: 'Tall and lean with long limbs. Melee reach and critical hits are its edge; light on health.',
    color: 0x9b8cff,
    base: stats({ maxHp: 1960, power: 60, armor: 18, resist: 22, attackSpeed: 1.02, moveSpeed: 4.1, critChance: 0.1, critMult: 1.75, poise: 0.14, reach: 1.15 }),
    personality: { aggression: 0.5, caution: 0.55, cunning: 0.7, adaptivity: 0.7, reaction: 0.18 },
  },
  mighty: {
    id: 'mighty', name: 'Mighty', title: 'Raw strength',
    blurb: 'Broad shoulders and heavy muscle. Hits the hardest and sends enemies flying, but resists magic poorly.',
    color: 0xe0703a,
    base: stats({ maxHp: 2100, power: 61, armor: 22, resist: 16, attackSpeed: 0.96, moveSpeed: 3.8, poise: 0.22, force: 1.15 }),
    personality: { aggression: 0.8, caution: 0.3, cunning: 0.3, adaptivity: 0.5, reaction: 0.22 },
  },
  ethereal: {
    id: 'ethereal', name: 'Ethereal', title: 'Light body, deep reserves',
    blurb: 'Slight and graceful. Regenerates energy faster with shorter cooldowns and high magic resist, but little armor.',
    color: 0x7fd8ff,
    base: stats({ maxHp: 2044, power: 64, armor: 20, resist: 34, attackSpeed: 1, moveSpeed: 4.0, energyRegen: 1.4, cdr: 0.15, poise: 0.1 }),
    personality: { aggression: 0.4, caution: 0.65, cunning: 0.7, adaptivity: 0.75, reaction: 0.19 },
  },
  stout: {
    id: 'stout', name: 'Stout', title: 'Short, round and hearty',
    blurb: 'Short legs and a big belly. Hard to knock over and heals more from every source, but short reach and slow steps.',
    color: 0xc89060,
    base: stats({ maxHp: 2180, power: 59, armor: 23, resist: 24, attackSpeed: 0.97, moveSpeed: 3.6, poise: 0.3, knockbackTaken: 0.7, reach: 0.92, healMult: 1.15 }),
    personality: { aggression: 0.6, caution: 0.45, cunning: 0.4, adaptivity: 0.6, reaction: 0.2 },
  },
  feral: {
    id: 'feral', name: 'Feral', title: 'Hunched and savage',
    blurb: 'Low and coiled with long arms. Quick, relentless strikes that drink a little life, but thin hide.',
    color: 0xb8d040,
    base: stats({ maxHp: 1820, power: 59, armor: 18, resist: 18, attackSpeed: 1.06, moveSpeed: 4.3, critChance: 0.07, lifesteal: 0.04, poise: 0.14, reach: 1.05 }),
    personality: { aggression: 0.85, caution: 0.3, cunning: 0.55, adaptivity: 0.6, reaction: 0.17 },
  },
  titan: {
    id: 'titan', name: 'Titan', title: 'A towering giant',
    blurb: 'Head and shoulders above everyone. Huge health, long reach and crushing force, but the slowest swings in the arena.',
    color: 0x8a7ad0,
    base: stats({ maxHp: 2380, power: 62, armor: 25, resist: 20, attackSpeed: 0.86, moveSpeed: 3.35, poise: 0.34, knockbackTaken: 0.65, reach: 1.2, force: 1.2 }),
    personality: { aggression: 0.5, caution: 0.5, cunning: 0.3, adaptivity: 0.5, reaction: 0.24 },
  },
};

export const FORM_IDS: FormId[] = ['robust', 'agile', 'balanced', 'slender', 'mighty', 'ethereal', 'stout', 'feral', 'titan'];
