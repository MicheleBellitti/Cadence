import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Lazy initialization — Firebase should only init in the browser.
// During Next.js static export (SSR/prerender), this module is evaluated
// but Firebase APIs are never called, so we defer initialization.
let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

function getFirebaseApp(): FirebaseApp {
  if (!_app) {
    _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  }
  return _app;
}

export function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getFirebaseApp());
  }
  return _auth;
}

/**
 * Delete the legacy Firestore IndexedDB cache left over from persistentLocalCache.
 * Called once on startup to prevent any possibility of stale cross-user data.
 */
export function clearLegacyFirestoreCache(): void {
  if (typeof indexedDB === "undefined") return;
  try {
    const projectId = firebaseConfig.projectId;
    if (projectId) {
      indexedDB.deleteDatabase(`firestore/[DEFAULT]/${projectId}/main`);
    }
  } catch { /* SSR or unavailable — ignore */ }
}

export function getFirebaseDb(): Firestore {
  if (!_db) {
    try {
      // initializeFirestore can only be called ONCE per app. On HMR the
      // module-level _db resets to null while the app singleton survives.
      // Using memoryLocalCache (NOT persistentLocalCache) to prevent
      // cross-user data leakage. IndexedDB persistence serves stale docs
      // from a previous user's session when server requests fail, bypassing
      // Firestore security rules entirely.
      _db = initializeFirestore(getFirebaseApp(), {
        localCache: memoryLocalCache(),
      });
    } catch {
      // Already initialized (HMR reload) — fall back to the existing instance.
      _db = getFirestore(getFirebaseApp());
    }
  }
  return _db;
}

/**
 * Run a Firestore operation with automatic token refresh and retry.
 *
 * After sign-in, the auth token may not have propagated to Firestore's
 * backend yet. This wrapper catches "permission-denied" / "unauthenticated"
 * errors, force-refreshes the ID token, and retries the operation.
 *
 * Pass `user` explicitly — `auth.currentUser` may still be null during
 * the React render triggered by signIn's `setUser()`, because Firebase's
 * internal state update (onAuthStateChanged) hasn't fired yet.
 */
export async function withTokenRetry<T>(
  fn: () => Promise<T>,
  user?: { getIdToken: (forceRefresh: boolean) => Promise<string> } | null,
  maxRetries = 4,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const code =
        (err as { code?: string })?.code ??
        (err as { message?: string })?.message ??
        "";
      const isPermError =
        code.includes("permission-denied") ||
        code.includes("insufficient") ||
        code.includes("unauthenticated");

      if (!isPermError || attempt === maxRetries) throw err;

      // Force-refresh the auth token before retrying.
      // Try the explicitly passed user first, fall back to auth.currentUser.
      const fbUser = user ?? getFirebaseAuth().currentUser;
      try {
        if (fbUser) await fbUser.getIdToken(true);
      } catch { /* best-effort */ }

      // Exponential backoff: 800ms, 1.6s, 2.4s, 3.2s
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw new Error("withTokenRetry: exhausted retries");
}

// NOTE: getFirebaseAuth() is already exported above. Always use it directly
// instead of a Proxy — proxies break internal SDK writes (currentUser
// assignment, persistence) because they only trap `get`, not `set`.
