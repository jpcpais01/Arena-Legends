import { accountStatus } from '../account/account';
import { addGems } from './collection';

/**
 * Promo codes: six capital letters typed in the Shop. Each code pays out once
 * per save (account). The codes live here only as hashes, so the game files
 * don't spell them out.
 *
 * Admin: an account that owns every skin, entrance, finisher and pose, now and
 * later. The owners' accounts are admins by name; anyone else becomes one with
 * an admin code. Saved in `al.promo` (synced with the account like every al.* key).
 */
export const CODE_LEN = 6;
export const CODE_RE = /^[A-Z]{6}$/;

interface PromoSave {
  /** Hashes of the codes this save already redeemed. */
  used: string[];
  admin: boolean;
}

interface Reward { gems: number; admin?: boolean }

/** Code hash → reward. */
const CODES: Record<string, Reward> = {
  '1xawodn6291': { gems: 10000, admin: true },
};

const KEY = 'al.promo';
const OWNERS = /^(joao|tiago|batuca)$/i;

/** cyrb53: a small, fast 53-bit string hash. */
function hash(code: string): string {
  const str = `arena-legends:promo:${code}`;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Parsed once per stored string: isAdmin runs for every skin the UI draws, and a
// cloud save can swap the stored value underneath us.
let seen: string | null | undefined;
let cache: PromoSave = { used: [], admin: false };

function load(): PromoSave {
  let text: string | null = null;
  try { text = localStorage.getItem(KEY); } catch { /* blocked */ }
  if (text === seen) return { used: [...cache.used], admin: cache.admin };
  seen = text;
  cache = { used: [], admin: false };
  try {
    const raw = JSON.parse(text ?? 'null') as Partial<PromoSave> | null;
    if (raw && typeof raw === 'object') {
      cache = { used: Array.isArray(raw.used) ? raw.used.filter((v) => typeof v === 'string') : [], admin: raw.admin === true };
    }
  } catch { /* corrupt: start clean */ }
  return { used: [...cache.used], admin: cache.admin };
}

function save(p: PromoSave): void {
  const text = JSON.stringify(p);
  cache = { used: [...p.used], admin: p.admin };
  try { localStorage.setItem(KEY, text); seen = text; } catch { /* private mode: lives for this session only */ }
}

const listeners = new Set<() => void>();
/** Called when this save turns admin. */
export function onPromo(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** An owner's account, or a save that redeemed an admin code. */
export function isAdmin(): boolean {
  load();
  return cache.admin || OWNERS.test(accountStatus().name ?? '');
}

export type Redeemed =
  | { ok: true; gems: number; admin: boolean; wasAdmin: boolean }
  | { ok: false; why: 'short' | 'unknown' | 'used' };

/** Redeems a typed code (case and stray characters are ignored). */
export function redeem(typed: string): Redeemed {
  const code = typed.toUpperCase().replace(/[^A-Z]/g, '');
  if (!CODE_RE.test(code)) return { ok: false, why: 'short' };
  const id = hash(code);
  const reward = CODES[id];
  if (!reward) return { ok: false, why: 'unknown' };
  const p = load();
  if (p.used.includes(id)) return { ok: false, why: 'used' };
  const wasAdmin = isAdmin();
  p.used.push(id);
  if (reward.admin) p.admin = true;
  save(p);
  addGems(reward.gems);
  const admin = !!reward.admin && !wasAdmin;
  if (admin) for (const f of listeners) f();
  return { ok: true, gems: reward.gems, admin, wasAdmin: !!reward.admin && wasAdmin };
}
