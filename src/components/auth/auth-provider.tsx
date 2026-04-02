"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, getDocFromCache, setDoc, updateDoc } from "firebase/firestore";
import { auth, getFirebaseDb } from "@/lib/firebase";
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

const MAX_RETRIES = 3;
const RETRY_DELAY = 500;
const USER_CACHE_KEY = "cadence-user-cache";

/** Persist minimal user profile in localStorage for instant sign-in. */
function cacheUserProfile(u: FirebaseUser): void {
  try {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify({ uid: u.uid, email: u.email, displayName: u.displayName, projectId: u.projectId }));
  } catch { /* quota exceeded or SSR — ignore */ }
}

/** Read cached user profile. Returns null on miss or uid mismatch. */
function getCachedUserProfile(uid: string): FirebaseUser | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FirebaseUser;
    if (parsed.uid !== uid) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearUserCache(): void {
  try { localStorage.removeItem(USER_CACHE_KEY); } catch { /* ignore */ }
}

function snapToUser(fbUser: User, data: Record<string, unknown>): FirebaseUser {
  return {
    uid: fbUser.uid,
    email: (data.email as string) ?? fbUser.email ?? "",
    displayName: (data.displayName as string) ?? fbUser.displayName ?? "",
    projectId: (data.projectId as string) ?? null,
  };
}

async function fetchOrCreateUserDoc(fbUser: User, retries = 0): Promise<FirebaseUser | null> {
  const userRef = doc(getFirebaseDb(), "users", fbUser.uid);

  // Fast path: read from the persistent cache (IndexedDB).
  // This works even before Firestore's auth token has propagated because
  // the local cache doesn't evaluate security rules.
  if (retries === 0) {
    try {
      const cached = await getDocFromCache(userRef);
      if (cached.exists()) {
        const u = snapToUser(fbUser, cached.data());
        cacheUserProfile(u);
        return u;
      }
    } catch {
      // Cache miss — fall through to server fetch
    }
  }

  // Server fetch with retry on permission-denied (token propagation delay)
  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (err) {
    if (retries < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
      return fetchOrCreateUserDoc(fbUser, retries + 1);
    }
    throw err;
  }

  if (snap.exists()) {
    const u = snapToUser(fbUser, snap.data());
    cacheUserProfile(u);
    return u;
  }

  // Document doesn't exist — might be mid-registration
  if (retries < MAX_RETRIES) {
    await new Promise((r) => setTimeout(r, RETRY_DELAY));
    return fetchOrCreateUserDoc(fbUser, retries + 1);
  }

  // Lazy create as fallback
  const newUser: FirebaseUser = {
    uid: fbUser.uid,
    email: fbUser.email ?? "",
    displayName: fbUser.displayName ?? "",
    projectId: null,
  };
  await setDoc(userRef, newUser);
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
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        try {
          if (fbUser) {
            setFirebaseUser(fbUser);

            // If the user just signed in manually, skip fetching the
            // user doc here — signIn() already set the state and we
            // must NOT restore a stale projectId from the cache.
            if (manualSignInRef.current) {
              manualSignInRef.current = false;
              setLoading(false);
              return;
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
            // Do NOT read from localStorage cache — it may be from a different user.
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
      // Firebase not configured (missing API key, etc.) — treat as unauthenticated
      console.error("Firebase Auth initialization failed. Check your .env.local configuration.");
      setUser(undefined);
      setLoading(false);
    }

    return () => unsubscribe?.();
  }, []);

  const refreshUser = useCallback(async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) return;
    const userData = await fetchOrCreateUserDoc(fbUser);
    if (userData) cacheUserProfile(userData);
    setUser(userData);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // Reset project store before signing in a (possibly different) user.
    useProjectStore.getState().resetProject();
    clearUserCache();

    // Tell onAuthStateChanged to NOT override our state with cached data.
    manualSignInRef.current = true;

    const cred = await signInWithEmailAndPassword(auth, email, password);

    setFirebaseUser(cred.user);
    // Don't assume a projectId — the /projects page will handle project selection.
    // This avoids serving stale data from a previous user's session.
    setUser({
      uid: cred.user.uid,
      email: cred.user.email ?? "",
      displayName: cred.user.displayName ?? "",
      projectId: null,
    });
    setLoading(false);
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

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
    useProjectStore.getState().resetProject();
    setUser(undefined);
    setFirebaseUser(null);
    setPendingInvites([]);
    await firebaseSignOut(auth);
  }, []);

  const acceptInviteFn = useCallback(async (inviteId: string, projectId: string) => {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error("Not authenticated");
    await acceptInvite(inviteId, projectId, fbUser.uid);
    // Refresh user doc to pick up the new projectId written by acceptInvite
    await refreshUser();
  }, [refreshUser]);

  const selectProject = useCallback((projectId: string | null) => {
    setUser((prev) => prev ? { ...prev, projectId } : prev);
    // Update user doc with the active projectId
    const fbUser = auth.currentUser;
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
    const fbUser = auth.currentUser;
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
