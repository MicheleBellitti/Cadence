"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb, withTokenRetry, clearLegacyFirestoreCache } from "@/lib/firebase";
import { firestoreCreateProject } from "@/lib/firestore-sync";
import { onPendingInvites, acceptInvite } from "@/lib/invite";
import { useProjectStore } from "@/stores/project-store";
import type { FirebaseUser, Invite } from "@/types";

interface AuthState {
  /** null = loading, undefined = unauthenticated, FirebaseUser = authenticated */
  user: FirebaseUser | null | undefined;
  firebaseUser: User | null;
  loading: boolean;
  pendingInvites: Invite[];
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  acceptInviteFn: (inviteId: string, projectId: string) => Promise<void>;
  createProject: (name: string) => Promise<string>;
  selectProject: (projectId: string | null) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

const USER_CACHE_KEY = "cadence-user-cache";
const LAST_UID_KEY = "cadence-last-uid";

/** Persist minimal user profile in localStorage for instant sign-in. */
function cacheUserProfile(u: FirebaseUser): void {
  try {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify({ uid: u.uid, email: u.email, displayName: u.displayName, projectId: u.projectId }));
    localStorage.setItem(LAST_UID_KEY, u.uid);
  } catch { /* quota exceeded or SSR — ignore */ }
}

function clearUserCache(): void {
  try { localStorage.removeItem(USER_CACHE_KEY); } catch { /* ignore */ }
}

/** Read the UID from the previous session. */
function getLastUid(): string | null {
  try { return localStorage.getItem(LAST_UID_KEY); } catch { return null; }
}

function clearLastUid(): void {
  try { localStorage.removeItem(LAST_UID_KEY); } catch { /* ignore */ }
}

function snapToUser(fbUser: User, data: Record<string, unknown>): FirebaseUser {
  return {
    uid: fbUser.uid,
    email: (data.email as string) ?? fbUser.email ?? "",
    displayName: (data.displayName as string) ?? fbUser.displayName ?? "",
    projectId: (data.projectId as string) ?? null,
  };
}

/**
 * Fetch or create the user document from Firestore.
 * Uses `withTokenRetry` to handle stale tokens after cold starts.
 */
async function fetchOrCreateUserDoc(fbUser: User): Promise<FirebaseUser> {
  const userRef = doc(getFirebaseDb(), "users", fbUser.uid);

  const snap = await withTokenRetry(() => getDoc(userRef), fbUser);

  if (snap.exists()) {
    const u = snapToUser(fbUser, snap.data());
    cacheUserProfile(u);
    return u;
  }

  // Document doesn't exist — lazy create.
  const newUser: FirebaseUser = {
    uid: fbUser.uid,
    email: fbUser.email ?? "",
    displayName: fbUser.displayName ?? "",
    projectId: null,
  };
  await withTokenRetry(() => setDoc(userRef, newUser), fbUser);
  cacheUserProfile(newUser);
  return newUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null | undefined>(null); // null = loading
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);

  // Flag: when true, the user just signed in manually — force them through /projects.
  // onAuthStateChanged must NOT override projectId back from cache.
  const manualSignInRef = useRef(false);

  // Real-time invite listener: watches for pending invites for the
  // authenticated user. Active on all pages (notification bell in navbar).
  useEffect(() => {
    if (user && user.email) {
      const unsub = onPendingInvites(user.email, setPendingInvites);
      return () => unsub();
    }
    setPendingInvites([]);
  }, [user]);

  useEffect(() => {
    // Delete old Firestore IndexedDB from persistentLocalCache.
    // Prevents any possibility of stale cross-user cached data.
    clearLegacyFirestoreCache();

    let unsubscribe: (() => void) | undefined;
    try {
      const realAuth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(realAuth, async (fbUser) => {
        // If a manual sign-in is in progress, signIn() manages state directly.
        // Skip ALL processing — both sign-in and sign-out events — to prevent
        // the onAuthStateChanged(null) from firebaseSignOut racing with
        // signIn()'s setUser() call.
        if (manualSignInRef.current) {
          if (fbUser) {
            // This is the onAuthStateChanged(UserB) from signInWithEmailAndPassword.
            // signIn() already set the state. Just clear the flag.
            manualSignInRef.current = false;
          }
          // For null events (from firebaseSignOut), keep the flag set —
          // signIn() will handle the state.
          setLoading(false);
          return;
        }

        try {
          if (fbUser) {
            setFirebaseUser(fbUser);

            // Detect UID change: if the authenticated user differs from the
            // last session, clear localStorage caches and reset project store.
            const lastUid = getLastUid();
            if (lastUid && lastUid !== fbUser.uid) {
              clearUserCache();
              useProjectStore.getState().resetProject();
            }

            // Force-refresh the ID token so Firestore security rules
            // accept requests immediately (stale tokens from days ago fail).
            try {
              await fbUser.getIdToken(true);
            } catch {
              // Token refresh failed (offline?) — proceed anyway,
              // fetchOrCreateUserDoc will retry on permission errors.
            }

            const userData = await fetchOrCreateUserDoc(fbUser);
            if (userData) cacheUserProfile(userData);
            setUser(userData);
          } else {
            setFirebaseUser(null);
            setUser(undefined); // explicitly unauthenticated
          }
        } catch (err) {
          console.error("Auth state handler error:", err);
          if (fbUser) {
            // Auth succeeded but Firestore read failed — create a minimal user.
            setUser({
              uid: fbUser.uid,
              email: fbUser.email ?? "",
              displayName: fbUser.displayName ?? "",
              projectId: null,
            });
          } else {
            setUser(undefined);
          }
        } finally {
          setLoading(false);
        }
      });
    } catch {
      console.error("Firebase Auth initialization failed. Check your .env.local configuration.");
      setUser(undefined);
      setLoading(false);
    }

    return () => unsubscribe?.();
  }, []);

  const refreshUser = useCallback(async () => {
    const fbUser = getFirebaseAuth().currentUser;
    if (!fbUser) return;
    const userData = await fetchOrCreateUserDoc(fbUser);
    if (userData) cacheUserProfile(userData);
    setUser(userData);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const realAuth = getFirebaseAuth();

    // Sign out any existing user FIRST to prevent stale sessions.
    try {
      await firebaseSignOut(realAuth);
    } catch { /* ignore sign-out errors */ }

    // Reset project store and clear localStorage caches.
    useProjectStore.getState().resetProject();
    clearUserCache();
    clearLastUid();

    // Tell onAuthStateChanged to skip ALL events during the sign-in flow.
    // This prevents the onAuthStateChanged(null) from firebaseSignOut from
    // racing with our setUser() call below.
    manualSignInRef.current = true;

    try {
      const cred = await signInWithEmailAndPassword(realAuth, email, password);

      // Force-refresh the ID token so Firestore accepts requests immediately.
      try {
        await cred.user.getIdToken(true);
      } catch { /* best-effort */ }

      setFirebaseUser(cred.user);
      setUser({
        uid: cred.user.uid,
        email: cred.user.email ?? "",
        displayName: cred.user.displayName ?? "",
        projectId: null,
      });
      setLoading(false);
    } catch (err) {
      manualSignInRef.current = false;
      setUser(undefined);
      setFirebaseUser(null);
      setLoading(false);
      throw err;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);

    const newUser: FirebaseUser = {
      uid: cred.user.uid,
      email: email.toLowerCase(),
      displayName,
      projectId: null,
    };

    // Best-effort: create the user doc so onAuthStateChanged's
    // fetchOrCreateUserDoc finds it immediately (with the display name).
    try {
      await setDoc(doc(getFirebaseDb(), "users", cred.user.uid), newUser);
    } catch (err) {
      console.error("Post-registration user doc creation failed:", err);
    }

    // Immediately unblock the UI.
    cacheUserProfile(newUser);
    setFirebaseUser(cred.user);
    setUser(newUser);
    setLoading(false);
  }, []);

  const signOutFn = useCallback(async () => {
    // Clear state FIRST to unmount ProjectSync (unsubscribes listeners),
    // then sign out — prevents "permission denied" from still-active listeners
    clearUserCache();
    clearLastUid();
    useProjectStore.getState().resetProject();
    setUser(undefined);
    setFirebaseUser(null);
    setPendingInvites([]);
    await firebaseSignOut(getFirebaseAuth());
  }, []);

  const acceptInviteFn = useCallback(async (inviteId: string, projectId: string) => {
    const fbUser = getFirebaseAuth().currentUser;
    if (!fbUser) throw new Error("Not authenticated");
    await acceptInvite(inviteId, projectId, fbUser.uid);
    // Refresh user doc to pick up the new projectId written by acceptInvite
    await refreshUser();
  }, [refreshUser]);

  const selectProject = useCallback((projectId: string | null) => {
    setUser((prev) => prev ? { ...prev, projectId } : prev);
    // Update user doc with the active projectId
    const fbUser = getFirebaseAuth().currentUser;
    if (fbUser) {
      updateDoc(doc(getFirebaseDb(), "users", fbUser.uid), { projectId }).catch(
        (err) => console.error("Failed to update active projectId:", err)
      );
      if (projectId) {
        cacheUserProfile({ ...(user as FirebaseUser), projectId });
      } else {
        clearUserCache();
      }
    }
  }, [user]);

  const createProject = useCallback(async (name: string): Promise<string> => {
    const fbUser = getFirebaseAuth().currentUser;
    if (!fbUser) throw new Error("Not authenticated");
    const projectId = crypto.randomUUID();
    await firestoreCreateProject(getFirebaseDb(), projectId, name, fbUser.uid);
    return projectId;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        pendingInvites,
        signIn,
        signUp,
        signOut: signOutFn,
        acceptInviteFn,
        createProject,
        selectProject,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
