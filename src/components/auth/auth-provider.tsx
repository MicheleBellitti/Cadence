"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"; // useCallback kept for signIn/signUp/signOut
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { firestoreCreateProject } from "@/lib/firestore-sync";
import { getPendingInvites, acceptInvite } from "@/lib/invite";
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

async function fetchOrCreateUserDoc(fbUser: User, retries = 0): Promise<FirebaseUser | null> {
  const userRef = doc(db, "users", fbUser.uid);
  const snap = await getDoc(userRef);

  if (snap.exists()) {
    const data = snap.data();
    return {
      uid: fbUser.uid,
      email: data.email ?? fbUser.email ?? "",
      displayName: data.displayName ?? fbUser.displayName ?? "",
      projectId: data.projectId ?? null,
    };
  }

  // Document doesn't exist — might be mid-registration or edge case
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
  return newUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null | undefined>(null); // null = loading
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);

  // Fetch pending invites for a user with no project
  async function fetchPendingInvitesForUser(userData: FirebaseUser): Promise<void> {
    if (userData.projectId === null && userData.email) {
      try {
        const invites = await getPendingInvites(userData.email);
        setPendingInvites(invites);
      } catch {
        setPendingInvites([]);
      }
    } else {
      setPendingInvites([]);
    }
  }

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        if (fbUser) {
          setFirebaseUser(fbUser);
          const userData = await fetchOrCreateUserDoc(fbUser);
          setUser(userData);
          if (userData) {
            await fetchPendingInvitesForUser(userData);
          }
        } else {
          setFirebaseUser(null);
          setUser(undefined); // explicitly unauthenticated
          setPendingInvites([]);
        }
        setLoading(false);
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
    setUser(userData);
    if (userData) {
      await fetchPendingInvitesForUser(userData);
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const newUser: FirebaseUser = {
      uid: cred.user.uid,
      email: email.toLowerCase(),
      displayName,
      projectId: null,
    };
    await setDoc(doc(db, "users", cred.user.uid), newUser);
    setUser(newUser);
    setFirebaseUser(cred.user);
    await fetchPendingInvitesForUser(newUser);
  }, []);

  const signOutFn = useCallback(async () => {
    // Clear state FIRST to unmount ProjectSync (unsubscribes listeners),
    // then sign out — prevents "permission denied" from still-active listeners
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

  const createProject = useCallback(async (name: string): Promise<string> => {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error("Not authenticated");
    const projectId = crypto.randomUUID();
    await firestoreCreateProject(db, projectId, name, fbUser.uid);
    // Update user doc with the new projectId
    await updateDoc(doc(db, "users", fbUser.uid), { projectId });
    // Refresh user state
    await refreshUser();
    return projectId;
  }, [refreshUser]);

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
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
