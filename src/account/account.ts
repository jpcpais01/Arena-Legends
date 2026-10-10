// Player accounts: a username + password (Firebase), and the local save synced
// to it. Guests play exactly as before; the Firebase code only downloads once
// someone signs in, or at boot when this device is already signed in.
import { accountsEnabled, NAME_RE, PASSWORD_MIN } from './config';
import type { AccountError } from './cloud';
import { applySave, hashSave, mergeGuest, sameSave, snapshot, type SaveMap } from './sync';

export { accountsEnabled };
export type { AccountError };

export type SyncState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

export interface AccountStatus {
  /** Signed-in username, or null for a guest. */
  name: string | null;
  sync: SyncState;
  /** True until the saved sign-in on this device has been checked. */
  restoring: boolean;
}

/** What this device remembers about the account its save belongs to. */
interface Link {
  /** Signed-in user, or null after signing out. */
  uid: string | null;
  name: string;
  /** Account the local save came from (kept after signing out, so it isn't merged into another account as guest progress). */
  owner: string | null;
  /** Hash of the save last written to or read from the cloud, and that write's time. */
  hash: string;
  at: number;
}

const KEY = 'al.account';
const RESUME = 'al.resume';
const PUSH_EVERY = 15_000;

let link: Link = readLink();
let status: AccountStatus = { name: link.uid ? link.name : null, sync: 'idle', restoring: accountsEnabled && !!link.uid };
const listeners = new Set<(s: AccountStatus) => void>();
let cloudMod: Promise<typeof import('./cloud')> | null = null;
let timer = 0;
let pushing: Promise<void> | null = null;
/** A save from the cloud waiting for the game to be somewhere it can reload. */
let pending: SaveMap | null = null;
let gate: () => boolean = () => true;
/** Firebase's own code for the last failed sign-in, shown small under the message so problems can be reported. */
export let lastError = '';

function readLink(): Link {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Link> | null;
    if (o && typeof o === 'object') {
      return { uid: typeof o.uid === 'string' ? o.uid : null, name: String(o.name ?? ''), owner: typeof o.owner === 'string' ? o.owner : null, hash: String(o.hash ?? ''), at: Number(o.at) || 0 };
    }
  } catch { /* fresh */ }
  return { uid: null, name: '', owner: null, hash: '', at: 0 };
}

function writeLink(next: Partial<Link>): void {
  link = { ...link, ...next };
  try { localStorage.setItem(KEY, JSON.stringify(link)); } catch { /* private mode */ }
}

function set(next: Partial<AccountStatus>): void {
  status = { ...status, ...next };
  for (const f of listeners) f(status);
}

const cloud = () => (cloudMod ??= import('./cloud'));
let socialMod: Promise<typeof import('./social')> | null = null;
/** Friends code (Firestore lite, loaded with the rest of Firebase). */
export const social = () => (socialMod ??= import('./social'));

/** The signed-in player, for friend requests; null for a guest. */
export function me(): { uid: string; name: string } | null {
  return link.uid && status.name ? { uid: link.uid, name: link.name } : null;
}

export function accountStatus(): AccountStatus { return status; }

export function onAccount(f: (s: AccountStatus) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Main tells us when reloading the page is fine (menu, no online match). */
export function setReloadGate(f: () => boolean): void { gate = f; }

/** True once after a reload this module asked for: the game skips the title screen. */
export function consumeResume(): boolean {
  try {
    const on = sessionStorage.getItem(RESUME) === '1';
    sessionStorage.removeItem(RESUME);
    return on;
  } catch { return false; }
}

/** Called when the game reaches the menu: applies a cloud save that was waiting, and pushes local changes. */
export function poke(): void {
  if (pending && gate()) { reloadWith(pending); return; }
  void push();
}

function reloadWith(s: SaveMap): void {
  applySave(s);
  writeLink({ hash: hashSave(s) });
  try { sessionStorage.setItem(RESUME, '1'); } catch { /* ignore */ }
  location.reload();
}

/** Puts `s` on this device: now if the game can reload, else at the next menu. */
function adopt(s: SaveMap): void {
  if (sameSave(s, snapshot())) { writeLink({ hash: hashSave(s) }); return; }
  if (gate()) reloadWith(s); else pending = s;
}

export function validName(name: string): boolean { return NAME_RE.test(name); }
export function validPassword(p: string): boolean { return p.length >= PASSWORD_MIN; }

export async function signUp(name: string, password: string): Promise<AccountError | null> {
  return enter(name, password, true);
}

export async function signIn(name: string, password: string): Promise<AccountError | null> {
  return enter(name, password, false);
}

async function enter(name: string, password: string, create: boolean): Promise<AccountError | null> {
  if (!accountsEnabled) return 'disabled';
  let c: typeof import('./cloud');
  try { c = await cloud(); } catch { return 'network'; }
  try {
    const user = create ? await c.signUp(name, password) : await c.signIn(name, password);
    let saved = await c.load(user.uid);
    if (!saved) { await c.repair(user, name); saved = { name, save: {}, at: 0 }; }
    const display = saved.name || name;
    const local = snapshot();
    // Guest progress (and a new account's starting save) merges in; a save from another account is replaced; our own account's save resumes.
    const owner = link.owner;
    const merged = create || !owner ? mergeGuest(local, saved.save) : owner === user.uid ? resolve(local, saved) : { ...saved.save };
    writeLink({ uid: user.uid, name: display, owner: user.uid, hash: hashSave(saved.save), at: saved.at });
    set({ name: display, sync: 'saved', restoring: false });
    start();
    // Offline right after signing in is fine: the status says so and the next push retries.
    if (!sameSave(merged, saved.save)) await upload(merged).catch(() => {});
    adopt(merged);
    return null;
  } catch (e) {
    lastError = String((e as { code?: string })?.code ?? (e as Error)?.message ?? e);
    console.warn('[account]', e);
    return c.errorCode(e);
  }
}

/** Our own account on this device: whichever side changed since the last sync wins (the cloud on a tie). */
function resolve(local: SaveMap, saved: { save: SaveMap; at: number }): SaveMap {
  const localChanged = hashSave(local) !== link.hash;
  const cloudChanged = saved.at !== link.at;
  return localChanged && !cloudChanged ? local : saved.save;
}

export async function signOut(): Promise<void> {
  await push().catch(() => {});
  stop();
  writeLink({ uid: null });
  set({ name: null, sync: 'idle', restoring: false });
  try { await (await cloud()).signOut(); } catch { /* already signed out locally */ }
}

/** Boot: if this device was signed in, check the sign-in and pull or push the save. Runs after the first frame. */
export function restoreAccount(): void {
  if (!accountsEnabled || !link.uid) return;
  const run = async () => {
    try {
      const c = await cloud();
      const user = await c.restore();
      if (!user || user.uid !== link.uid) {
        writeLink({ uid: null });
        set({ name: null, sync: 'idle', restoring: false });
        return;
      }
      set({ restoring: false });
      start();
      const saved = await c.load(user.uid);
      if (!saved) { await push(true); return; }
      const next = resolve(snapshot(), saved);
      if (next === saved.save) {
        writeLink({ at: saved.at, name: saved.name || link.name });
        set({ name: link.name, sync: 'saved' });
        adopt(saved.save);
      } else {
        await push(true);
      }
    } catch {
      set({ restoring: false, sync: 'offline' });
      start();
    }
  };
  const idle = (window as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(() => void run(), { timeout: 2500 }); else setTimeout(() => void run(), 800);
}

function start(): void {
  if (timer) return;
  timer = window.setInterval(() => void push(), PUSH_EVERY);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('online', onOnline);
}

function stop(): void {
  clearInterval(timer);
  timer = 0;
  document.removeEventListener('visibilitychange', onHide);
  window.removeEventListener('online', onOnline);
}

const onHide = () => { if (document.visibilityState === 'hidden') void push(); };
const onOnline = () => void push();

/** Hero + record last shared with friends, and when a failed share may retry. */
let shared = '';
let sharing = false;
let shareAfter = 0;

/** Shares the hero and record with friends when they changed (its own doc, so the save never waits on it). */
function shareHero(): void {
  const who = me();
  if (!who || sharing || Date.now() < shareAfter) return;
  let hero = '', rec: { w?: unknown; l?: unknown } = {};
  try {
    hero = localStorage.getItem('al.character') ?? '';
    rec = JSON.parse(localStorage.getItem('al.record') ?? '{}') ?? {};
  } catch { /* storage blocked */ }
  const key = `${who.uid}|${hero}|${rec.w}|${rec.l}`;
  if (!hero || hero.length > 8000 || key === shared) return;
  sharing = true;
  social().then((m) => m.share(who, hero, Number(rec.w) || 0, Number(rec.l) || 0))
    .then(() => { shared = key; })
    .catch(() => { shareAfter = Date.now() + 5 * 60_000; })
    .finally(() => { sharing = false; });
}

/** Writes the local save to the account if it changed since the last sync. */
export function push(force = false): Promise<void> {
  if (!link.uid || pending) return Promise.resolve();
  shareHero();
  if (pushing) return pushing;
  const s = snapshot();
  if (!force && hashSave(s) === link.hash) return Promise.resolve();
  pushing = upload(s).catch(() => {}).finally(() => { pushing = null; });
  return pushing;
}

async function upload(s: SaveMap): Promise<void> {
  const uid = link.uid;
  if (!uid) return;
  set({ sync: 'saving' });
  try {
    const at = Date.now();
    await (await cloud()).store(uid, link.name, s, at);
    if (link.uid === uid) { writeLink({ hash: hashSave(s), at }); set({ sync: 'saved' }); }
  } catch (e) {
    const c = await cloud().catch(() => null);
    set({ sync: c && c.errorCode(e) === 'network' || !navigator.onLine ? 'offline' : 'error' });
    throw e;
  }
}
