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
  /** Duplicate copies kept in the inventory, by skin id (the forge melts them). */
  spare: Record<string, number>;
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
/** Spare copies of one rarity the forge melts into one skin of the next rarity. */
export const FORGE_COST = 3;

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
      spare: cleanSpare(raw.spare),
    };
  } else {
    col = { gems: START_GEMS, owned: [], pity: 0, paid: [], spare: {} };
  }
  // Anything worn stays owned (the first start, and saves from before skins were collectibles).
  for (const id of Object.values(worn ?? {})) if (id && SKIN_BY_ID.has(id) && !col.owned.includes(id)) col.owned.push(id);
  persist();
  return col;
}

function cleanSpare(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
    const k = Math.floor(Number(n));
    if (SKIN_BY_ID.has(id) && k > 0) out[id] = Math.min(999, k);
  }
  return out;
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
export const pity = (): number => get().pity;

export function addGems(n: number): void {
  const c = get();
  c.gems += Math.max(0, Math.round(n));
  persist();
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
  /** First copy (false: a duplicate, kept as a spare for the forge). */
  fresh: boolean;
}

/** Adds a pulled skin: owned on the first copy, a spare after that. */
function take(c: Collection, skin: SkinDef): Pull {
  const fresh = !owns(skin.id);
  if (fresh) c.owned.push(skin.id);
  else c.spare[skin.id] = (c.spare[skin.id] ?? 0) + 1;
  return { skin, fresh };
}

function rollSkin(r: () => number, tier: SkinRarity): SkinDef {
  const pool = SKINS.filter((s) => s.rarity === tier);
  return pool[Math.floor(r() * pool.length) % pool.length];
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
    out.push(take(c, rollSkin(r, tier)));
  }
  persist();
  return out;
}

/** Spare copies in the inventory: [skin, count], best tier first, most copies first. */
export function spares(): [SkinDef, number][] {
  const out: [SkinDef, number][] = [];
  for (const [id, n] of Object.entries(get().spare)) { const s = SKIN_BY_ID.get(id); if (s && n > 0) out.push([s, n]); }
  return out.sort((a, b) => SKIN_RARITIES.indexOf(b[0].rarity) - SKIN_RARITIES.indexOf(a[0].rarity) || b[1] - a[1] || a[0].name.localeCompare(b[0].name));
}

/** Spare copies per rarity. */
export function spareCount(tier: SkinRarity): number {
  let n = 0;
  for (const [s, k] of spares()) if (s.rarity === tier) n += k;
  return n;
}

/** The rarity the forge turns a rarity into (null for the top one). */
export function forgeInto(tier: SkinRarity): SkinRarity | null {
  return SKIN_RARITIES[SKIN_RARITIES.indexOf(tier) + 1] ?? null;
}

/**
 * Melts FORGE_COST spare copies (`ids`, repeats allowed, all one rarity below
 * the top) into one random skin of the next rarity. Null when the copies
 * aren't there or the rarities don't match.
 */
export function forge(ids: string[], r: () => number = Math.random): Pull | null {
  const c = get();
  if (ids.length !== FORGE_COST) return null;
  const skins = ids.map((id) => SKIN_BY_ID.get(id));
  if (skins.some((s) => !s)) return null;
  const tier = skins[0]!.rarity;
  const into = forgeInto(tier);
  if (!into || skins.some((s) => s!.rarity !== tier)) return null;
  const need = new Map<string, number>();
  for (const id of ids) need.set(id, (need.get(id) ?? 0) + 1);
  for (const [id, n] of need) if ((c.spare[id] ?? 0) < n) return null;
  for (const [id, n] of need) { c.spare[id] -= n; if (c.spare[id] <= 0) delete c.spare[id]; }
  const out = take(c, rollSkin(r, into));
  persist();
  return out;
}

/** Picks the copies a forge of `tier` uses: the ones you hold most of first. */
export function forgePick(tier: SkinRarity): string[] | null {
  const out: string[] = [];
  for (const [s, n] of spares()) {
    if (s.rarity !== tier) continue;
    for (let i = 0; i < n && out.length < FORGE_COST; i++) out.push(s.id);
  }
  return out.length === FORGE_COST ? out : null;
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
