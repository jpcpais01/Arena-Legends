// Firebase web config. It isn't secret (it ships in every player's browser;
// firestore.rules protects the data), so the game's own project is built in.
// VITE_FIREBASE_* env vars override it, e.g. to point a fork at another project.

const env = import.meta.env;
/** First word of an env value, without quotes: survives values pasted with quotes, commas or extra lines. */
const clean = (v: unknown) => (typeof v === 'string' ? v.trim().split(/\s+/)[0].replace(/^["']|["'],?$/g, '') : '') || undefined;

const envKey = clean(env.VITE_FIREBASE_API_KEY);
/** Env vars only win when they carry a well-formed key; a mangled one would break every sign-in. */
const useEnv = !!envKey && /^AIza[\w-]{35}$/.test(envKey) && !!clean(env.VITE_FIREBASE_PROJECT_ID);

export const firebaseConfig = useEnv ? {
  apiKey: envKey,
  authDomain: clean(env.VITE_FIREBASE_AUTH_DOMAIN) ?? `${clean(env.VITE_FIREBASE_PROJECT_ID)}.firebaseapp.com`,
  projectId: clean(env.VITE_FIREBASE_PROJECT_ID),
  appId: clean(env.VITE_FIREBASE_APP_ID),
} : {
  apiKey: 'AIzaSyBvPR6vg3aZLgy78woFZ7ncyoaUYDVTtdE',
  authDomain: 'arena-legends-f0df2.firebaseapp.com',
  projectId: 'arena-legends-f0df2',
  appId: '1:964426660044:web:f10c34700679adb094aa69',
};

export const accountsEnabled = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain);

/**
 * Firebase Auth has no username sign-in, so each username maps to an internal
 * address on this (never mailed) domain. firestore.rules checks the same domain.
 */
export const EMAIL_DOMAIN = 'users.arenalegends.app';

export const NAME_RE = /^[a-zA-Z0-9_]{3,16}$/;
export const PASSWORD_MIN = 6;

export const emailFor = (name: string) => `${name.toLowerCase()}@${EMAIL_DOMAIN}`;
