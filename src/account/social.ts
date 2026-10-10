// Friends over Firestore (lite): look a player up by name, send, accept or
// decline requests, and read the hero a friend shares. Loaded on demand with
// the rest of the Firebase code, only by signed-in players.
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where, writeBatch,
} from 'firebase/firestore/lite';
import { db } from './cloud';

export interface Me { uid: string; name: string }
export interface Friend { uid: string; name: string }
export interface FriendRequest { from: string; to: string; fromName: string; toName: string }
export interface FriendsData { friends: Friend[]; incoming: FriendRequest[]; outgoing: FriendRequest[] }
/** A friend's shared hero: the raw saved character (checked by the caller) and their win record. */
export interface SharedHero { name: string; hero: unknown; w: number; l: number; at: number }

export type AddResult = 'sent' | 'friends' | 'self' | 'missing' | 'already' | 'pending';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const int = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
const reqRef = (from: string, to: string) => doc(db, 'requests', `${from}_${to}`);
const entryRef = (uid: string, other: string) => doc(db, 'friends', uid, 'list', other);

function asRequest(d: Record<string, unknown>): FriendRequest {
  return { from: str(d.from), to: str(d.to), fromName: str(d.fromName), toName: str(d.toName) };
}

export async function load(me: Me): Promise<FriendsData> {
  const reqs = collection(db, 'requests');
  const [list, inc, out] = await Promise.all([
    getDocs(collection(db, 'friends', me.uid, 'list')),
    getDocs(query(reqs, where('to', '==', me.uid))),
    getDocs(query(reqs, where('from', '==', me.uid))),
  ]);
  const friends = list.docs.map((d) => ({ uid: d.id, name: str(d.data().name) || '?' }));
  const known = new Set(friends.map((f) => f.uid));
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  return {
    friends: friends.sort(byName),
    // A request left over from someone already a friend is just noise.
    incoming: inc.docs.map((d) => asRequest(d.data())).filter((r) => !known.has(r.from)),
    outgoing: out.docs.map((d) => asRequest(d.data())).filter((r) => !known.has(r.to)),
  };
}

/** How many friend requests are waiting for this player (the menu's dot). */
export async function incomingCount(uid: string): Promise<number> {
  const snap = await getDocs(query(collection(db, 'requests'), where('to', '==', uid)));
  return snap.size;
}

/** Sends a friend request by username; if they already asked us, it makes us friends instead. */
export async function add(me: Me, rawName: string): Promise<AddResult> {
  const named = await getDoc(doc(db, 'usernames', rawName.trim().toLowerCase()));
  if (!named.exists()) return 'missing';
  const uid = str(named.data().uid);
  const name = str(named.data().name) || rawName.trim();
  if (!uid) return 'missing';
  if (uid === me.uid) return 'self';
  const [mine, theirs, sent] = await Promise.all([getDoc(entryRef(me.uid, uid)), getDoc(reqRef(uid, me.uid)), getDoc(reqRef(me.uid, uid))]);
  if (mine.exists()) return 'already';
  if (theirs.exists()) { await accept(me, asRequest(theirs.data())); return 'friends'; }
  if (sent.exists()) return 'pending';
  await setDoc(reqRef(me.uid, uid), { from: me.uid, to: uid, fromName: me.name, toName: name, at: Date.now() });
  return 'sent';
}

/** Accepts a request sent to us: both friend lists get the other player, and the request goes away. */
export async function accept(me: Me, r: FriendRequest): Promise<void> {
  const at = Date.now();
  const b = writeBatch(db);
  b.set(entryRef(me.uid, r.from), { name: r.fromName, at });
  b.set(entryRef(r.from, me.uid), { name: me.name, at });
  b.delete(reqRef(r.from, me.uid));
  await b.commit();
}

/** Declines a request to us, or cancels one we sent. */
export async function drop(r: FriendRequest): Promise<void> {
  await deleteDoc(reqRef(r.from, r.to));
}

export async function remove(me: Me, uid: string): Promise<void> {
  const b = writeBatch(db);
  b.delete(entryRef(me.uid, uid));
  b.delete(entryRef(uid, me.uid));
  await b.commit();
}

export async function hero(uid: string): Promise<SharedHero | null> {
  const snap = await getDoc(doc(db, 'heroes', uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  let parsed: unknown = null;
  try { parsed = JSON.parse(str(d.hero)); } catch { /* broken hero: shown as not shared */ }
  return parsed ? { name: str(d.name), hero: parsed, w: int(d.w), l: int(d.l), at: int(d.at) } : null;
}

/** Shares this player's hero and record so friends can see them. */
export async function share(me: Me, heroJson: string, w: number, l: number): Promise<void> {
  await setDoc(doc(db, 'heroes', me.uid), { name: me.name.slice(0, 16), hero: heroJson, w: int(w), l: int(l), at: Date.now() });
}
