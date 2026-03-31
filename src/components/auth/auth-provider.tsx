"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"; // useCallback kept for signIn/signUp/signOut
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { FirebaseUser } from "@/types";

interface AuthState {
  /** null = loading, undefined = unauthenticated, FirebaseUser = authenticated */
  user: FirebaseUser | null | undefined;
  firebaseUser: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        const userData = await fetchOrCreateUserDoc(fbUser);
        setUser(userData);
      } else {
        setFirebaseUser(null);
        setUser(undefined); // explicitly unauthenticated
      }
      setLoading(false);
    });

    return unsubscribe;
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
  }, []);

  const signOutFn = useCallback(async () => {
    // Clear state FIRST to unmount ProjectSync (unsubscribes listeners),
    // then sign out — prevents "permission denied" from still-active listeners
    setUser(undefined);
    setFirebaseUser(null);
    await firebaseSignOut(auth);
  }, []);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, signIn, signUp, signOut: signOutFn }}>
      {children}
    </AuthContext.Provider>
  );
}
