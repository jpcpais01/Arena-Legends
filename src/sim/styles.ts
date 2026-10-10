import type { Personality } from './forms';

/**
 * Fighting styles: how the player's hero likes to fight, picked at creation.
 * A style doesn't change stats or gear, only the AI's habits: its temper,
 * how much heat it takes before stepping back to breathe, how far it rests,
 * which plans it leans toward, and how readily it reaches for a defense.
 */
export type FightStyleId = 'balanced' | 'relentless' | 'tactician' | 'skirmisher' | 'guardian';

/** Strategic plans the brain picks between (see ai/brain.ts). */
type PlanId = 'pressure' | 'kite' | 'bait' | 'turtle' | 'allin' | 'recover' | 'breathe';

export interface FightStyle {
  id: FightStyleId;
  name: string;
  /** One-line identity shown under the name. */
  title: string;
  blurb: string;
  /** UI accent colour. */
  color: number;
  /** Shifts on the temper the form and gear give. */
  temper: Partial<Pick<Personality, 'aggression' | 'caution' | 'cunning'>>;
  /** Added to the heat tolerance: more stamina, fewer breathers. */
  stamina: number;
  /** Extra metres kept while catching a breath. */
  rest: number;
  /** Bias on each plan's score. */
  plans: Partial<Record<PlanId, number>>;
  /** Multiplier on the value of defensive answers (guards, dodges, armour). */
  defense: number;
  /** For the UI: aggression, defense, trickery and stamina, 1..10. */
  bars: [number, number, number, number];
}

export const FIGHT_STYLES: Record<FightStyleId, FightStyle> = {
  balanced: {
    id: 'balanced', name: 'Balanced', title: 'Reads the fight',
    blurb: 'No set habits: presses where it wins, backs off where it doesn\'t and adapts to what the opponent does. Fights the way your body and gear want.',
    color: 0xd8c27a,
    temper: {}, stamina: 0, rest: 0, plans: {}, defense: 1,
    bars: [5, 5, 5, 5],
  },
  relentless: {
    id: 'relentless', name: 'Relentless', title: 'Never lets up',
    blurb: 'Hot-blooded and tireless. Keeps the pressure on, hardly ever steps back to breathe and goes all in the moment it smells blood. Lands more, takes more.',
    color: 0xe05a3a,
    temper: { aggression: 0.2, caution: -0.12 }, stamina: 0.35, rest: -0.6,
    plans: { pressure: 0.15, allin: 0.12, turtle: -0.15, recover: -0.15, kite: -0.1 }, defense: 0.88,
    bars: [9, 3, 4, 9],
  },
  tactician: {
    id: 'tactician', name: 'Tactician', title: 'Patience and tricks',
    blurb: 'Cold and patient. Probes, feints and baits out your defenses, steps back to reset when it gets heated, and punishes every mistake.',
    color: 0x9a7aff,
    temper: { cunning: 0.18, caution: 0.08, aggression: -0.08 }, stamina: -0.12, rest: 0.3,
    plans: { bait: 0.18, pressure: -0.05 }, defense: 1.05,
    bars: [4, 6, 9, 4],
  },
  skirmisher: {
    id: 'skirmisher', name: 'Skirmisher', title: 'Hit and run',
    blurb: 'Light on its feet. Darts in for a quick hit and gets back out of reach before the answer comes, fighting at the edge of range. Loves to kite.',
    color: 0x52d6a0,
    temper: { caution: 0.04, cunning: 0.08 }, stamina: 0, rest: 0.35,
    plans: { kite: 0.12, bait: 0.08, pressure: -0.03 }, defense: 1.05,
    bars: [6, 5, 6, 5],
  },
  guardian: {
    id: 'guardian', name: 'Guardian', title: 'Wall and counter',
    blurb: 'Defense first. Holds its ground behind guards and dodges, waits for the opponent to swing, then answers. Hard to break, slow to finish.',
    color: 0x6f8fb8,
    temper: { caution: 0.16, aggression: -0.14, cunning: 0.04 }, stamina: 0.1, rest: -0.2,
    plans: { turtle: 0.15, bait: 0.06, allin: -0.05, pressure: -0.04 }, defense: 1.15,
    bars: [3, 9, 5, 7],
  },
};

export const FIGHT_STYLE_IDS = Object.keys(FIGHT_STYLES) as FightStyleId[];

export function isFightStyle(v: unknown): v is FightStyleId {
  return typeof v === 'string' && v in FIGHT_STYLES;
}
