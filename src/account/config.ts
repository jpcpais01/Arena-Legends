// Firebase web config from Vite env vars (set them on Vercel, or in .env.local
// for dev). Without them accounts stay hidden and the game is guest-only.

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
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
