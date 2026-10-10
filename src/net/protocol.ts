import type { CharacterBuild } from '../sim/loadout';

/** Bumped when messages change shape; peers on different protocols refuse to pair. */
export const PROTOCOL = 1;
/** Victories needed to take the match (best of five). */
export const WINS_NEEDED = 3;
/** Seconds to pick a build: longer for the first round. */
export const PICK_SECONDS_FIRST = 180;
export const PICK_SECONDS = 180;

export type Side = 0 | 1;

export interface RoundResult {
  round: number;
  winner: Side | -1;
  reason: 'ko' | 'time';
  /** Both devices simulated the round and their results differed (the host's counts). */
  desync?: boolean;
}

/**
 * The whole match as the host sees it, sent to the guest on every change.
 * Side 0 is the host (blue corner), side 1 the guest (red corner).
 */
export interface Snapshot {
  id: string;
  round: number;
  phase: 'pick' | 'fight' | 'over';
  /** While picking: the builds each side fought with last (their starting build in round 1).
   *  While fighting: the builds locked in for this round. */
  builds: [CharacterBuild, CharacterBuild];
  ready: [boolean, boolean];
  /** Milliseconds of picking left when this snapshot was sent. */
  pickLeft: number;
  seed: number;
  results: RoundResult[];
  /** Finished watching this round's fight. */
  done: [boolean, boolean];
  rematch: [boolean, boolean];
  /** The guest is disconnected: the pick timer is frozen. */
  held: boolean;
}

export type GuestMsg =
  | { t: 'hello'; proto: number; version: string; matchId?: string; build: CharacterBuild }
  | { t: 'lock'; round: number; build: CharacterBuild }
  | { t: 'unlock'; round: number }
  | { t: 'verdict'; round: number; hash: string; checks: string[] }
  | { t: 'done'; round: number }
  | { t: 'rematch'; id: string }
  // Arena Cup lobby (rooms whose code starts with CUP_PREFIX).
  | { t: 'cupJoin'; proto: number; version: string; pid: string; build: CharacterBuild; level: number };

export type HostMsg =
  | { t: 'state'; s: Snapshot }
  | { t: 'reject'; reason: 'version' | 'full' | 'started'; version: string }
  | { t: 'cupRoom'; members: { pid: string; build: CharacterBuild; level: number }[] }
  // The drawn cup, as its JSON in pieces (a JSON data channel message must stay under ~16 KB).
  | { t: 'cupPart'; id: string; i: number; n: number; data: string };

export type CommonMsg = { t: 'ping' } | { t: 'pong' } | { t: 'bye' };

export type Msg = GuestMsg | HostMsg | CommonMsg;

/** Cheap shape check on anything that arrives from the network. */
export function asMsg(raw: unknown): Msg | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = (raw as { t?: unknown }).t;
  return typeof t === 'string' ? (raw as Msg) : null;
}

export function scoreOf(results: RoundResult[], uptoRound = Infinity): [number, number] {
  const s: [number, number] = [0, 0];
  for (const r of results) if (r.round <= uptoRound && r.winner !== -1) s[r.winner]++;
  return s;
}

export function matchWinner(results: RoundResult[], uptoRound = Infinity): Side | -1 {
  const [a, b] = scoreOf(results, uptoRound);
  return a >= WINS_NEEDED ? 0 : b >= WINS_NEEDED ? 1 : -1;
}

/** Room codes are digits only, so they can be typed on the in-game keypad. */
const CODE_CHARS = '0123456789';
export const CODE_LENGTH = 5;

/** Arena Cup lobbies have codes starting with this digit; duel rooms never do. */
export const CUP_PREFIX = '9';
export const isCupCode = (code: string) => code.length === CODE_LENGTH && code[0] === CUP_PREFIX;

/** A duel room code (never starts with CUP_PREFIX), or a cup lobby code when `cup`. */
export function newRoomCode(cup = false): string {
  const r = crypto.getRandomValues(new Uint32Array(CODE_LENGTH));
  let s = cup ? CUP_PREFIX : String(r[0] % 9);
  for (let i = 1; i < CODE_LENGTH; i++) s += CODE_CHARS[r[i] % CODE_CHARS.length];
  return s;
}

/** Drops anything that can't be in a code (spaces, dashes) and trims it to length. */
export function normalizeCode(raw: string): string {
  return raw.split('').filter((c) => CODE_CHARS.includes(c)).join('').slice(0, CODE_LENGTH);
}

export function randomId(): string {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return r[0].toString(36) + r[1].toString(36);
}
