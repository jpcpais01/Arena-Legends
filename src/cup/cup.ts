// The Arena Cup: a 32-fighter knockout bracket over five rounds. The player
// (and any friends who joined) take slots; generated fighters fill the rest.
//
// Everything about a cup follows from its entrants and its seed: every match
// has its own battle seed, and fights are deterministic, so each player's
// device can work out the whole bracket on its own. Matches with a player in
// them are real battles (watched by that player, simulated headless by
// everyone else); bot against bot is settled by a seeded roll on their levels.
import { Rng } from '../core/rng';
import { generateRival, parseCharacter, type PlayerCharacter } from '../character/profile';
import { pointsAt } from '../character/progress';
import type { CharacterBuild } from '../sim/loadout';
import { autoTraining, strHash } from '../sim/training';

export const CUP_SIZE = 32;
export const ROUND_COUNT = 5;
/** Players (you and friends) a cup takes at most: one in each eighth of the bracket. */
export const MAX_HUMANS = 8;

export interface RoundDef { name: string; short: string; sub: string }
export const ROUNDS: RoundDef[] = [
  { name: 'Opening Clash', short: 'Opening', sub: '32 fighters' },
  { name: 'Gauntlet', short: 'Gauntlet', sub: 'Last 16' },
  { name: 'Quarter-finals', short: 'Quarters', sub: 'Last 8' },
  { name: 'Semi-finals', short: 'Semis', sub: 'Last 4' },
  { name: 'Final', short: 'Final', sub: 'For the cup' },
];

export interface Entrant {
  build: PlayerCharacter;
  level: number;
  /** A player (you or a friend), not a generated fighter. */
  human?: boolean;
  /** Players only: who they are (account id, or a per-device id), so each device finds its own slot. */
  pid?: string;
}

/** How a match ended: the winning side (0 = upper slot), the winner's health left, K.O. or on time. */
export interface MatchResult { w: 0 | 1; hp: number; ko: boolean }

export interface Cup {
  v: 1;
  id: string;
  seed: number;
  /** When it started (ms). */
  at: number;
  /** In bracket order: slots 2m and 2m+1 meet in opening match m. */
  entrants: Entrant[];
  /** This device's player. */
  me: number;
  /** A cup with friends: every build was locked when it started. */
  shared: boolean;
  /** results[round][match], null until played. */
  results: (MatchResult | null)[][];
  /** XP and gems this cup has paid so far. */
  xp: number;
  gems: number;
  /** The end-of-cup rewards were paid. */
  paid?: boolean;
}

export const matchCount = (r: number) => CUP_SIZE >> (r + 1);

/** Who stands in a match's slot: the entrant index, or -1 while the match before it is unplayed. */
export function entrantAt(cup: Cup, r: number, m: number, side: 0 | 1): number {
  if (r === 0) return 2 * m + side;
  return winnerOf(cup, r - 1, 2 * m + side);
}

export function winnerOf(cup: Cup, r: number, m: number): number {
  const res = cup.results[r]?.[m];
  return res ? entrantAt(cup, r, m, res.w) : -1;
}

export type CupStatus =
  | { kind: 'play'; round: number; match: number; side: 0 | 1 }
  | { kind: 'out'; round: number }
  | { kind: 'champion' };

/** Where this device's player stands: their next match, the round they fell in, or champion. */
export function statusOf(cup: Cup, who = cup.me): CupStatus {
  for (let r = 0; r < ROUND_COUNT; r++) {
    const m = who >> (r + 1);
    const side = ((who >> r) & 1) as 0 | 1;
    const res = cup.results[r][m];
    if (!res) return { kind: 'play', round: r, match: m, side };
    if (res.w !== side) return { kind: 'out', round: r };
  }
  return { kind: 'champion' };
}

/** The first round with a match still to settle (ROUND_COUNT when the cup is decided). */
export function openRound(cup: Cup): number {
  for (let r = 0; r < ROUND_COUNT; r++) if (cup.results[r].some((x) => !x)) return r;
  return ROUND_COUNT;
}

export const champion = (cup: Cup) => winnerOf(cup, ROUND_COUNT - 1, 0);

/** The battle seed of a match: the same on every device. */
export function matchSeed(cup: Cup, r: number, m: number): number {
  let x = (cup.seed ^ Math.imul(r + 1, 0x9e3779b1) ^ Math.imul(m + 1, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** Bot against bot: a seeded roll leaning towards the higher level. */
export function quickResult(cup: Cup, r: number, m: number): MatchResult {
  const a = cup.entrants[entrantAt(cup, r, m, 0)], b = cup.entrants[entrantAt(cup, r, m, 1)];
  const rng = new Rng(matchSeed(cup, r, m));
  const lean = Math.max(-0.35, Math.min(0.35, (a.level - b.level) * 0.045));
  const w: 0 | 1 = rng.next() < 0.5 + lean ? 0 : 1;
  return { w, hp: Math.round(rng.range(0.08, 0.85) * 100) / 100, ko: rng.next() < 0.8 };
}

/** A battle's outcome as a cup result. A draw goes to whoever dealt more damage (then the upper slot). */
export function fromBattle(winner: 0 | 1 | -1, hp: [number, number], dmg: [number, number], ko: boolean): MatchResult {
  const w: 0 | 1 = winner !== -1 ? winner : hp[0] !== hp[1] ? (hp[0] > hp[1] ? 0 : 1) : dmg[1] > dmg[0] ? 1 : 0;
  return { w, hp: Math.round(Math.max(0, Math.min(1, hp[w])) * 100) / 100, ko };
}

export type Judge = (seed: number, builds: [CharacterBuild, CharacterBuild]) => Promise<{ winner: 0 | 1 | -1; reason: 'ko' | 'time'; hp: [number, number]; dmg: [number, number] }>;

/**
 * Settles every match of round `r` that is ready and doesn't need this
 * player to watch it: bot fights by roll, friends' fights by a headless battle.
 * Returns how many it settled.
 */
export async function settleRound(cup: Cup, r: number, judge: Judge): Promise<number> {
  let n = 0;
  const jobs: Promise<void>[] = [];
  for (let m = 0; m < matchCount(r); m++) {
    if (cup.results[r][m]) continue;
    const a = entrantAt(cup, r, m, 0), b = entrantAt(cup, r, m, 1);
    if (a < 0 || b < 0 || a === cup.me || b === cup.me) continue;
    const A = cup.entrants[a], B = cup.entrants[b];
    if (!A.human && !B.human) { cup.results[r][m] = quickResult(cup, r, m); n++; continue; }
    jobs.push(judge(matchSeed(cup, r, m), [A.build, B.build]).then((v) => {
      cup.results[r][m] = fromBattle(v.winner, v.hp, v.dmg, v.reason === 'ko');
      n++;
    }));
  }
  await Promise.all(jobs);
  return n;
}

// --- A new cup -----------------------------------------------------------------------------

/** Standard seeding: the bracket position of each seed, so the strongest meet last. */
function seedPositions(n: number): number[] {
  let order = [1, 2];
  while (order.length < n) {
    const k = order.length * 2;
    order = order.flatMap((s) => [s, k + 1 - s]);
  }
  // order[pos] = seed; we want positions by seed.
  const pos = new Array<number>(n);
  order.forEach((seed, p) => { pos[seed - 1] = p; });
  return pos;
}

/** Eighths of the bracket in the order players fill them: two players can only meet in the final, four in the semis. */
const EIGHTHS = [0, 4, 2, 6, 1, 5, 3, 7];

/**
 * Draws a cup: the players spread over the bracket so they meet as late as
 * possible, and generated fighters around them, the strongest seeded apart.
 * Bots range from a little under the host's level to well over it, so each
 * round tends to bring a stronger opponent.
 */
export function newCup(players: Entrant[], hostLevel: number, shared: boolean, seed = (Math.random() * 2 ** 32) >>> 0): Cup {
  const rng = new Rng(seed);
  const slots: (Entrant | null)[] = new Array(CUP_SIZE).fill(null);
  const humans = players.slice(0, MAX_HUMANS);
  const humanSlots: number[] = [];
  humans.forEach((p, i) => {
    const at = EIGHTHS[i] * 4 + rng.int(0, 3);
    slots[at] = { ...p, human: true };
    humanSlots.push(at);
  });
  const free = CUP_SIZE - humans.length;
  const taken = new Set(humans.map((p) => p.build.name.toLowerCase()));
  const bots: Entrant[] = [];
  for (let k = 0; k < free; k++) {
    // Strongest first: from host + 6 down to host - 2.
    const level = Math.max(1, Math.round(hostLevel + 6 - (8 * k) / Math.max(1, free - 1)));
    let b = generateRival();
    for (let i = 0; i < 6 && taken.has(b.name.toLowerCase()); i++) b = generateRival();
    taken.add(b.name.toLowerCase());
    const train = autoTraining(pointsAt(level), strHash(b.name) ^ seed);
    bots.push({ build: { ...b, level, ...(train ? { train } : {}) }, level });
  }
  const pos = seedPositions(CUP_SIZE).filter((p) => !slots[p]);
  bots.forEach((b, i) => { slots[pos[i]] = b; });
  const entrants = slots as Entrant[];
  return {
    v: 1,
    id: (seed.toString(36) + Date.now().toString(36)).slice(0, 14),
    seed,
    at: Date.now(),
    entrants,
    me: humanSlots[0] ?? 0,
    shared,
    results: Array.from({ length: ROUND_COUNT }, (_, r) => new Array<MatchResult | null>(matchCount(r)).fill(null)),
    xp: 0,
    gems: 0,
  };
}

// --- Saving --------------------------------------------------------------------------------

const KEY = 'al.cup';

/** Strict copy of a cup from storage or the network; null if anything is off. */
export function parseCup(raw: unknown): Cup | null {
  const o = raw as Partial<Cup> | null;
  if (!o || o.v !== 1 || !Array.isArray(o.entrants) || o.entrants.length !== CUP_SIZE || !Array.isArray(o.results)) return null;
  const entrants: Entrant[] = [];
  for (const e of o.entrants as unknown[]) {
    const x = e as Partial<Entrant> | null;
    const build = parseCharacter(x?.build);
    if (!build) return null;
    const level = Math.max(1, Math.min(9999, Math.floor(Number(x?.level)) || 1));
    const pid = typeof x?.pid === 'string' ? x.pid.slice(0, 64) : '';
    entrants.push({ build, level, ...(x?.human ? { human: true } : {}), ...(pid ? { pid } : {}) });
  }
  const results: (MatchResult | null)[][] = [];
  for (let r = 0; r < ROUND_COUNT; r++) {
    const row = (o.results as unknown[])[r];
    if (!Array.isArray(row) || row.length !== matchCount(r)) return null;
    results.push(row.map((x) => {
      const m = x as Partial<MatchResult> | null;
      if (!m || (m.w !== 0 && m.w !== 1)) return null;
      return { w: m.w, hp: Math.max(0, Math.min(1, Number(m.hp) || 0)), ko: !!m.ko };
    }));
  }
  const me = Math.floor(Number(o.me));
  if (!(me >= 0 && me < CUP_SIZE)) return null;
  return {
    v: 1, id: String(o.id ?? ''), seed: Number(o.seed) >>> 0, at: Number(o.at) || Date.now(),
    entrants, me, shared: !!o.shared, results,
    xp: Math.max(0, Number(o.xp) || 0), gems: Math.max(0, Number(o.gems) || 0), ...(o.paid ? { paid: true } : {}),
  };
}

export function loadCup(): Cup | null {
  try { return parseCup(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return null; }
}

export function saveCup(c: Cup | null): void {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY);
  } catch { /* private mode */ }
}
