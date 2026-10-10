import { owns } from './collection';
import { setPieces, SKIN_SETS, SKINS, type SkinDef, type SkinRarity, type SkinSet } from './skins';

/**
 * The skin shop: skins and whole epic sets bought outright with gems, next to
 * the chests. Offers rotate once a day (local midnight): one featured set at a
 * deeper discount and a handful of single skins.
 */

/** Price of one skin bought on its own. */
export const SKIN_PRICE: Record<SkinRarity, number> = { rare: 150, mythic: 350, legendary: 800, epic: 500 };
/** A set bundle costs this share of its missing pieces bought one by one. */
export const SET_SHARE = 0.75;
/** The featured set's bundle instead. */
export const FEATURED_SHARE = 0.6;
export const DAILY_PICKS = 6;

/** Days since 1970 in local time: the shop's rotation index. */
export function shopDay(now = new Date()): number {
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);
}

/** Milliseconds until the next rotation. */
export function msToRotation(now = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);

export function featuredSet(day = shopDay()): SkinSet {
  return SKIN_SETS[Math.floor(rng(day)() * SKIN_SETS.length)];
}

/** Today's single skins: a fixed list for the day (bought ones show as owned), never pieces of the featured set. */
export function dailyPicks(day = shopDay()): SkinDef[] {
  const r = rng(day + 7919);
  const feat = featuredSet(day).id;
  const pool = SKINS.filter((s) => s.set !== feat);
  const out: SkinDef[] = [];
  // One mythic-or-better slot is guaranteed, the rest any tier.
  const special = pool.filter((s) => s.rarity !== 'rare');
  out.push(special[Math.floor(r() * special.length)]);
  while (out.length < DAILY_PICKS && out.length < pool.length) {
    const s = pool[Math.floor(r() * pool.length)];
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

export interface SetOffer {
  set: SkinSet;
  pieces: SkinDef[];
  missing: SkinDef[];
  /** What the missing pieces cost one by one. */
  full: number;
  price: number;
  featured: boolean;
}

export function setOffer(set: SkinSet, featured = false): SetOffer {
  const pieces = setPieces(set.id);
  const missing = pieces.filter((p) => !owns(p.id));
  const full = missing.reduce((n, p) => n + SKIN_PRICE[p.rarity], 0);
  const price = missing.length ? round50(full * (featured ? FEATURED_SHARE : SET_SHARE)) : 0;
  return { set, pieces, missing, full, price, featured };
}
