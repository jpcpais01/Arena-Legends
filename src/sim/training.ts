import type { Stats } from './types';

/**
 * Stat points a hero has spent on their base stats (earned by levelling up).
 * They add to the body form's base stats, before gear, so gear multipliers
 * still apply on top. Each stat gives its full value for the first points and
 * less after that, so no single stat runs away however high the level gets.
 */
export type TrainId = 'health' | 'power' | 'armor' | 'resist' | 'speed' | 'crit';
export type Training = Partial<Record<TrainId, number>>;

export const TRAIN_IDS: TrainId[] = ['health', 'power', 'armor', 'resist', 'speed', 'crit'];

export interface TrainDef {
  id: TrainId;
  name: string;
  blurb: string;
  /** What one full-value point adds. */
  add: Partial<Stats>;
}

export const TRAIN: Record<TrainId, TrainDef> = {
  health: { id: 'health', name: 'Health', blurb: 'More health to soak hits.', add: { maxHp: 20 } },
  power: { id: 'power', name: 'Power', blurb: 'Every attack and skill hits harder.', add: { power: 0.6 } },
  armor: { id: 'armor', name: 'Armor', blurb: 'Less damage from physical hits.', add: { armor: 1 } },
  resist: { id: 'resist', name: 'Resist', blurb: 'Less damage from magic.', add: { resist: 1 } },
  speed: { id: 'speed', name: 'Speed', blurb: 'Faster swings and quicker feet.', add: { attackSpeed: 0.008, moveSpeed: 0.03 } },
  crit: { id: 'crit', name: 'Crit', blurb: 'More critical hits.', add: { critChance: 0.004 } },
};

/** Points past FULL count at TAPER, and past SOFT at the LOW rate. */
const FULL = 15, SOFT = 40, TAPER = 0.6, LOW = 0.3;
/** Most points a single stat can hold (a guard against broken saves and peers). */
export const TRAIN_MAX = 500;

/** How many full points `n` points in one stat are worth. */
export function trainWeight(n: number): number {
  if (n <= FULL) return n;
  if (n <= SOFT) return FULL + (n - FULL) * TAPER;
  return FULL + (SOFT - FULL) * TAPER + (n - SOFT) * LOW;
}

/** What the next point in a stat that already holds `n` is worth (1, 0.6 or 0.3). */
export const nextPointWorth = (n: number) => trainWeight(n + 1) - trainWeight(n);

export function spentPoints(t: Training | undefined): number {
  let s = 0;
  for (const id of TRAIN_IDS) s += t?.[id] ?? 0;
  return s;
}

/** Adds the training to a copy of `s`. */
export function applyTraining(s: Stats, t: Training | undefined): void {
  if (!t) return;
  const w = s as unknown as Record<string, number>;
  for (const id of TRAIN_IDS) {
    const n = t[id];
    if (!n) continue;
    const k = trainWeight(n);
    for (const [stat, v] of Object.entries(TRAIN[id].add)) w[stat] += v * k;
  }
}

/** Strict copy of training from storage or the network. */
export function sanitizeTraining(raw: unknown): Training | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const out: Training = {};
  let any = false;
  for (const id of TRAIN_IDS) {
    const n = Math.floor(Number(o[id]));
    if (n > 0) { out[id] = Math.min(TRAIN_MAX, n); any = true; }
  }
  return any ? out : undefined;
}

/** Leans for generated fighters: most points go to health and power. */
const LEAN: Record<TrainId, number> = { health: 3, power: 3, armor: 2, resist: 2, speed: 2, crit: 1 };

/** Spends `points` for a generated fighter (rivals, cup bots), the same way every time for the same `seed`. */
export function autoTraining(points: number, seed: number): Training | undefined {
  if (points <= 0) return undefined;
  const out: Training = {};
  let total = 0;
  for (const id of TRAIN_IDS) total += LEAN[id];
  let x = seed >>> 0 || 1;
  for (let i = 0; i < points; i++) {
    // xorshift: cheap, deterministic, no Math.random.
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    let k = (x / 4294967296) * total;
    let pick: TrainId = 'health';
    for (const id of TRAIN_IDS) { k -= LEAN[id]; if (k < 0) { pick = id; break; } }
    out[pick] = (out[pick] ?? 0) + 1;
  }
  return out;
}

/** A small stable hash of a string (seeds generated fighters' training from their name). */
export function strHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
