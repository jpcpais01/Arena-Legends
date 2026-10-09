// Firebase Auth + Firestore (lite: plain REST, no live listeners, a much
// smaller download). Loaded on demand by account.ts, so guests never fetch it.
import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword, indexedDBLocalPersistence, browserLocalPersistence, initializeAuth,
  signInWithEmailAndPassword, signOut as fbSignOut, type User,
} from 'firebase/auth';
import { doc, getDoc, getFirestore, setDoc, writeBatch } from 'firebase/firestore/lite';
import { emailFor, firebaseConfig } from './config';
import type { SaveMap } from './sync';

export type AccountError = 'taken' | 'wrong' | 'weak' | 'network' | 'busy' | 'disabled' | 'unknown';

export interface CloudSave { name: string; save: SaveMap; at: number }

const app = initializeApp(firebaseConfig);
// No popup/redirect resolver: username + password never needs one, and it keeps the bundle small.
const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
const db = getFirestore(app);

export function errorCode(e: unknown): AccountError {
  const code = String((e as { code?: string })?.code ?? '');
  if (code === 'auth/email-already-in-use' || code === 'taken') return 'taken';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') return 'wrong';
  if (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements') return 'weak';
  if (code === 'auth/network-request-failed' || code === 'unavailable' || code === 'deadline-exceeded') return 'network';
  if (code === 'auth/too-many-requests' || code === 'resource-exhausted') return 'busy';
  if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found' || code === 'auth/api-key-not-valid'
    || code.startsWith('auth/api-key') || code === 'permission-denied') return 'disabled';
  return 'unknown';
}

/** The signed-in user restored from this device, if any. */
export async function restore(): Promise<User | null> {
  await auth.authStateReady();
  return auth.currentUser;
}

export async function signUp(name: string, password: string): Promise<User> {
  const { user } = await createUserWithEmailAndPassword(auth, emailFor(name), password);
  try {
    await reserve(user, name);
  } catch (e) {
    // Don't leave an account behind without its name.
    await user.delete().catch(() => {});
    throw e;
  }
  return user;
}

export async function signIn(name: string, password: string): Promise<User> {
  const { user } = await signInWithEmailAndPassword(auth, emailFor(name), password);
  return user;
}

export const signOut = () => fbSignOut(auth);

/**
 * Claims usernames/{name} for this user and creates their player doc in one
 * atomic batch. No transaction: Firestore refuses client transactions on this
 * project, and the rules already make a name claimable only once (create only,
 * and only by the account whose sign-in address carries it).
 */
async function reserve(user: User, name: string): Promise<void> {
  const nameRef = doc(db, 'usernames', name.toLowerCase());
  const playerRef = doc(db, 'players', user.uid);
  const [taken, player] = await Promise.all([getDoc(nameRef), getDoc(playerRef)]);
  if (taken.exists() && taken.data().uid !== user.uid) throw Object.assign(new Error('taken'), { code: 'taken' });
  if (taken.exists() && player.exists()) return;
  const batch = writeBatch(db);
  if (!taken.exists()) batch.set(nameRef, { uid: user.uid, name });
  if (!player.exists()) batch.set(playerRef, { name, save: {}, at: 0, v: 1 });
  await batch.commit();
}

export async function load(uid: string): Promise<CloudSave | null> {
  const snap = await getDoc(doc(db, 'players', uid));
  if (!snap.exists()) return null;
  const d = snap.data() as Partial<CloudSave>;
  const save: SaveMap = {};
  if (d.save && typeof d.save === 'object') for (const [k, v] of Object.entries(d.save)) if (typeof v === 'string') save[k] = v;
  return { name: typeof d.name === 'string' ? d.name : '', save, at: typeof d.at === 'number' ? d.at : 0 };
}

export async function store(uid: string, name: string, save: SaveMap, at: number): Promise<void> {
  await setDoc(doc(db, 'players', uid), { name, save, at, v: 1 });
}

/** A user from an older sign-up whose name or player doc didn't get written (went offline mid-way). */
export async function repair(user: User, name: string): Promise<void> {
  await reserve(user, name).catch(() => {});
}
