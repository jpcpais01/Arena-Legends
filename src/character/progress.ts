/**
 * Hero level and XP. Levels never end: every level gives stat points to spend
 * on the hero's base stats (see sim/training). XP comes from fights, most of it
 * from the Arena Cup. Saved locally as `al.progress` (synced with the account).
 */
export interface Progress {
  /** All XP ever earned. */
  xp: number;
}

const KEY = 'al.progress';
/** Stat points each level up gives. */
export const POINTS_PER_LEVEL = 2;

/** XP from `level` to the next one: a gentle ramp. */
export const xpToNext = (level: number) => 100 + 30 * (level - 1);

/** Total XP needed to reach `level`. */
export function xpForLevel(level: number): number {
  const n = Math.max(0, level - 1);
  return 100 * n + 15 * n * (n - 1);
}

export interface LevelInfo {
  level: number;
  /** XP earned inside this level, and needed for the next. */
  into: number;
  need: number;
}

export function levelOf(xp: number): LevelInfo {
  let level = 1;
  // A first guess from the closed form, then settle (no float drift at level edges).
  const guess = Math.floor((-85 + Math.sqrt(85 * 85 + 60 * Math.max(0, xp))) / 30) + 1;
  if (guess > 1) level = guess;
  while (level > 1 && xpForLevel(level) > xp) level--;
  while (xpForLevel(level + 1) <= xp) level++;
  return { level, into: xp - xpForLevel(level), need: xpToNext(level) };
}

/** Stat points a hero of `level` has earned in total. */
export const pointsAt = (level: number) => (Math.max(1, level) - 1) * POINTS_PER_LEVEL;

let prog: Progress | null = null;
const listeners = new Set<(p: Progress) => void>();

export function progress(): Progress {
  if (prog) return prog;
  let raw: Partial<Progress> | null = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Progress> | null; } catch { raw = null; }
  const xp = Math.floor(Number(raw?.xp));
  prog = { xp: xp > 0 ? xp : 0 };
  return prog;
}

export const heroLevel = () => levelOf(progress().xp).level;

function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify(prog)); } catch { /* private mode */ }
  for (const f of listeners) f(prog!);
}

/** Gives XP; returns the level before and after. */
export function addXp(n: number): { from: LevelInfo; to: LevelInfo; gained: number } {
  const p = progress();
  const from = levelOf(p.xp);
  const gained = Math.max(0, Math.round(n));
  p.xp += gained;
  persist();
  return { from, to: levelOf(p.xp), gained };
}

export function onProgress(f: (p: Progress) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

// --- What fights pay -----------------------------------------------------------------------------

/** A cup win: a base, more each round, and more the more health was kept. */
export function cupWinXp(round: number, hpLeft: number): number {
  const hp = Math.max(0, Math.min(1, hpLeft));
  return 40 + 15 * (round + 1) + Math.round((40 * hp) / 5) * 5;
}
/** Knocked out of the cup: a little for the effort, more the further it got. */
export const cupLossXp = (round: number) => 15 + 5 * (round + 1);
/** Lifting the cup. */
export const CHAMPION_XP = 150;
export const CHAMPION_GEMS = 300;
export const FINALIST_GEMS = 100;

/** Quick fights against the rival pay a little XP too. */
export function quickXp(won: boolean, draw: boolean, hpLeft: number): number {
  if (draw) return 10;
  if (!won) return 5;
  return 20 + Math.round((20 * Math.max(0, Math.min(1, hpLeft))) / 5) * 5;
}
