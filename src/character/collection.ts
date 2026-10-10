import { SKINS, SKIN_BY_ID, SKIN_RARITIES, type SkinDef, type SkinMap, type SkinRarity } from './skins';

/**
 * The player's skin collection and gems. Skins are collectibles: a skin can
 * only be worn once it has been pulled from a skin chest. Gems pay for the
 * chests and are earned by winning fights.
 *
 * Saved locally next to the character (`al.collection`).
 */
export interface Collection {
  gems: number;
  /** Skin ids the player owns. */
  owned: string[];
  /** Pulls since the last epic (the epic guarantee counts these). */
  pity: number;
  /** Online rounds already paid out ("match:round"), so a resumed match never pays twice. */
  paid: string[];
}

const KEY = 'al.collection';
export const START_GEMS = 1000;
export const PULL_COST = 100;
/** Ten pulls at once: one pull free, and at least one mythic or better. */
export const TEN_COST = 900;
/** An epic is guaranteed on this pull at the latest. */
export const EPIC_PITY = 60;

/** Odds per pull by tier (they add up to 1). */
export const ODDS: Record<SkinRarity, number> = { rare: 0.7, mythic: 0.22, legendary: 0.07, epic: 0.01 };
/** Gems back for a skin already owned. */
export const DUPE_GEMS: Record<SkinRarity, number> = { rare: 15, mythic: 35, legendary: 80, epic: 200 };

/** Win reward: a base plus a bonus for the health the winner kept. */
export const WIN_BASE = 25;
export const WIN_HP_BONUS = 75;

export function winGems(hpLeft: number): number {
  const hp = Math.max(0, Math.min(1, hpLeft));
  return WIN_BASE + Math.round((WIN_HP_BONUS * hp) / 5) * 5;
}

let col: Collection | null = null;

/**
 * Loads (or starts) the collection. A first start gives the starting gems and
 * keeps every skin the character already wears, so nobody loses their look.
 */
export function loadCollection(worn?: SkinMap): Collection {
  if (col) return col;
  let raw: Partial<Collection> | null = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Collection> | null; } catch { raw = null; }
  if (raw && typeof raw === 'object') {
    col = {
      gems: Number.isFinite(raw.gems) ? Math.max(0, Math.floor(raw.gems as number)) : START_GEMS,
      owned: Array.isArray(raw.owned) ? [...new Set(raw.owned.filter((id) => typeof id === 'string' && SKIN_BY_ID.has(id)))] : [],
      pity: Number.isFinite(raw.pity) ? Math.max(0, Math.min(EPIC_PITY - 1, Math.floor(raw.pity as number))) : 0,
      paid: Array.isArray(raw.paid) ? raw.paid.filter((k) => typeof k === 'string').slice(-40) : [],
    };
  } else {
    col = { gems: START_GEMS, owned: [], pity: 0, paid: [] };
  }
  // Anything worn stays owned (the first start, and saves from before skins were collectibles).
  for (const id of Object.values(worn ?? {})) if (id && SKIN_BY_ID.has(id) && !col.owned.includes(id)) col.owned.push(id);
  persist();
  return col;
}

function get(): Collection {
  return col ?? loadCollection();
}

function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify(col)); } catch { /* private mode: lives for this session only */ }
  for (const f of listeners) f();
}

const listeners = new Set<() => void>();
/** Called after every change (gems or skins). */
export function onCollection(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export const gems = (): number => get().gems;
/** Accounts that own every skin, now and later (checked live, never written into the save). */
let allSkins: () => boolean = () => false;
export function setAllSkins(f: () => boolean): void {
  allSkins = f;
  for (const l of listeners) l();
}

export const owns = (id: string): boolean => allSkins() || get().owned.includes(id);
/** Accounts that own every collectible (skins, entrances). */
export const allUnlocked = (): boolean => allSkins();
export const pity = (): number => get().pity;

export function addGems(n: number): void {
  const c = get();
  c.gems += Math.max(0, Math.round(n));
  persist();
}

/** Takes gems for a purchase; false (and nothing taken) when short. */
export function spendGems(n: number): boolean {
  const c = get();
  const cost = Math.max(0, Math.round(n));
  if (c.gems < cost) return false;
  c.gems -= cost;
  persist();
  return true;
}

/** Pays a won online round once; returns the gems given (0 if it was paid already). */
export function payRound(key: string, n: number): number {
  const c = get();
  if (c.paid.includes(key)) return 0;
  c.paid = [...c.paid, key].slice(-40);
  c.gems += n;
  persist();
  return n;
}

/** Owned and total skins per tier. */
export function progress(): Record<SkinRarity, [number, number]> {
  const out = {} as Record<SkinRarity, [number, number]>;
  for (const r of SKIN_RARITIES) out[r] = [0, 0];
  for (const s of SKINS) {
    out[s.rarity][1]++;
    if (owns(s.id)) out[s.rarity][0]++;
  }
  return out;
}

export interface Pull {
  skin: SkinDef;
  /** First copy (false: a duplicate, paid back in gems). */
  fresh: boolean;
  refund: number;
}

function rollTier(r: () => number, floor: SkinRarity): SkinRarity {
  const tiers = SKIN_RARITIES.slice(SKIN_RARITIES.indexOf(floor));
  let total = 0;
  for (const t of tiers) total += ODDS[t];
  let k = r() * total;
  for (const t of tiers) {
    k -= ODDS[t];
    if (k < 0) return t;
  }
  return tiers[tiers.length - 1];
}

/**
 * Opens `count` (1 or 10) pulls: takes the gems, rolls, adds the skins and
 * refunds duplicates, and saves before anything is shown (a reload mid-reveal
 * keeps what was pulled). Null when there are not enough gems.
 */
export function openChest(count: 1 | 10, r: () => number = Math.random): Pull[] | null {
  const c = get();
  const cost = count === 10 ? TEN_COST : PULL_COST;
  if (c.gems < cost) return null;
  c.gems -= cost;
  const out: Pull[] = [];
  for (let i = 0; i < count; i++) {
    c.pity++;
    let tier: SkinRarity;
    if (c.pity >= EPIC_PITY) tier = 'epic';
    // The last of ten with nothing mythic or better yet.
    else if (count === 10 && i === 9 && out.every((p) => p.skin.rarity === 'rare')) tier = rollTier(r, 'mythic');
    else tier = rollTier(r, 'rare');
    if (tier === 'epic') c.pity = 0;
    const pool = SKINS.filter((s) => s.rarity === tier);
    const skin = pool[Math.floor(r() * pool.length) % pool.length];
    const fresh = !owns(skin.id);
    const refund = fresh ? 0 : DUPE_GEMS[tier];
    if (fresh) c.owned.push(skin.id);
    c.gems += refund;
    out.push({ skin, fresh, refund });
  }
  persist();
  return out;
}

/** Buys skins outright for `cost` gems (skins already owned are skipped). False when short of gems. */
export function buySkins(ids: string[], cost: number): boolean {
  const c = get();
  if (c.gems < cost) return false;
  c.gems -= cost;
  for (const id of ids) if (SKIN_BY_ID.has(id) && !c.owned.includes(id)) c.owned.push(id);
  persist();
  return true;
}

/** Drops skins the player doesn't own from a worn-skin map. */
export function ownedOnly(skins: SkinMap | undefined): SkinMap {
  const out: SkinMap = {};
  for (const [g, id] of Object.entries(skins ?? {})) if (id && owns(id)) out[g as keyof SkinMap] = id;
  return out;
}

/** Test hook: forget the loaded state. */
export function resetCollectionForTests(): void {
  col = null;
}
