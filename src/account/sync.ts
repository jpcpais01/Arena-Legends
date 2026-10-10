// What an account saves: every `al.*` localStorage key except device-only ones,
// so new saved data (gems, owned skins...) syncs without being listed here.

export type SaveMap = Record<string, string>;

const PREFIX = 'al.';
/** Keys that stay on this device: the account link itself, online match resume, seen patch notes. */
export const LOCAL_ONLY = new Set(['al.account', 'al.online', 'al.notesSeen']);

export const synced = (key: string) => key.startsWith(PREFIX) && !LOCAL_ONLY.has(key);

export function snapshot(ls: Storage = localStorage): SaveMap {
  const out: SaveMap = {};
  try {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && synced(k)) out[k] = ls.getItem(k) ?? '';
    }
  } catch { /* storage blocked */ }
  return out;
}

/** Stable FNV-1a hash of a save, to tell whether anything changed since the last sync. */
export function hashSave(s: SaveMap): string {
  let h = 0x811c9dc5;
  for (const k of Object.keys(s).sort()) {
    const str = k + '\u0000' + s[k] + '\u0001';
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  }
  return (h >>> 0).toString(36) + ':' + Object.keys(s).length;
}

function parse(raw: string | undefined): unknown {
  try { return raw ? JSON.parse(raw) : undefined; } catch { return undefined; }
}

/** Keys that combine guest and account progress instead of the account's value winning. */
const MERGERS: Record<string, (local: unknown, cloud: unknown) => unknown> = {
  'al.record': (a, b) => {
    const n = (o: unknown, k: string) => Math.max(0, Number((o as Record<string, unknown>)?.[k]) || 0);
    return { w: Math.max(n(a, 'w'), n(b, 'w')), l: Math.max(n(a, 'l'), n(b, 'l')) };
  },
  // Entrances bought on either side are kept.
  'al.entrances': (a, b) => [...new Set([...(Array.isArray(b) ? b : []), ...(Array.isArray(a) ? a : [])].filter((v) => typeof v === 'string'))],
  // Skins pulled on either side are kept; the bigger gem purse wins.
  'al.collection': (a, b) => {
    const o = (x: unknown) => (x && typeof x === 'object' ? x as Record<string, unknown> : {});
    const num = (x: unknown) => Math.max(0, Number(x) || 0);
    const list = (x: unknown) => (Array.isArray(x) ? x.filter((v) => typeof v === 'string') : []);
    const A = o(a), B = o(b);
    return {
      gems: Math.max(num(A.gems), num(B.gems)),
      owned: [...new Set([...list(B.owned), ...list(A.owned)])],
      pity: Math.max(num(A.pity), num(B.pity)),
      paid: [...new Set([...list(B.paid), ...list(A.paid)])].slice(-40),
    };
  },
};

/**
 * First sign-in from a guest save: the account's data wins key by key, guest
 * keys the account lacks are kept (a new account takes the whole guest save),
 * and keys with a merger combine both.
 */
export function mergeGuest(local: SaveMap, cloud: SaveMap): SaveMap {
  const out: SaveMap = { ...local, ...cloud };
  for (const k in MERGERS) {
    if (k in local && k in cloud) {
      const v = MERGERS[k](parse(local[k]), parse(cloud[k]));
      if (v !== undefined) out[k] = JSON.stringify(v);
    }
  }
  return out;
}

export function sameSave(a: SaveMap, b: SaveMap): boolean {
  return hashSave(a) === hashSave(b);
}

/** Replaces this device's synced keys with `s`. */
export function applySave(s: SaveMap, ls: Storage = localStorage): void {
  try {
    for (const k of Object.keys(snapshot(ls))) if (!(k in s)) ls.removeItem(k);
    for (const [k, v] of Object.entries(s)) if (synced(k)) ls.setItem(k, v);
  } catch { /* storage blocked */ }
}
