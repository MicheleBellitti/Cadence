# Firebase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace localStorage persistence with Firebase (Auth + Firestore) for multi-user collaboration in a 2-5 person team.

**Architecture:** Firebase client SDK only — no backend server. Firebase Auth (email/password) for authentication, Firestore for real-time data sync with sub-collections per entity type. Zustand store becomes a thin wrapper around Firestore listeners. Static export (`output: "export"`) is preserved.

**Tech Stack:** Firebase v11 (modular SDK), Zustand 5, Next.js 15 (static export), TypeScript 5 strict, Tailwind CSS 4, Vitest

**Spec:** `docs/superpowers/specs/2026-03-31-firebase-migration-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/lib/firebase.ts` | Firebase app init, auth instance, Firestore instance with offline persistence |
| `src/lib/firestore-sync.ts` | onSnapshot listeners, CRUD write ops, optimistic locking, cascade deletes, timestamp serialization |
| `src/lib/invite.ts` | Invite creation, acceptance transaction, email normalization for doc IDs |
| `src/components/auth/auth-provider.tsx` | React context: `onAuthStateChanged` listener, user doc fetch with retry, auth state machine |
| `src/components/auth/auth-gate.tsx` | Renders loading spinner until auth resolves; hides app shell from unauthenticated users |
| `src/app/login/page.tsx` | Login form (email/password), link to register |
| `src/app/register/page.tsx` | Registration form, creates Firebase Auth account + `users/{uid}` doc |
| `firestore.rules` | Firestore security rules from spec |
| `.env.local` | Firebase config keys (`NEXT_PUBLIC_*` prefix) — already gitignored via `.env*` |
| `src/lib/firestore-sync.test.ts` | Unit tests for timestamp serialization, email normalization, cascade logic |
| `src/lib/firebase.test.ts` | Unit tests for Firebase config validation |

### Modified files

| File | Change |
|------|--------|
| `package.json` | Add `firebase` dependency |
| `src/types/index.ts` | Add `updatedBy` to BaseItem, add `FirebaseUser`, `Invite` interfaces, add `linkedUserId` to TeamMember |
| `src/lib/validators.ts` | Add `updatedBy` to baseItemSchema, add `inviteSchema`, add `linkedUserId` to teamMemberSchema |
| `src/stores/project-store.ts` | Remove `persist` middleware, add `loading`/`syncing` state, wire all actions to Firestore writes via `firestore-sync.ts` |
| `src/app/layout.tsx` | Wrap children with `AuthProvider`, move `Sidebar`/`Navbar`/`MainContent` inside `AuthGate` |
| `src/app/page.tsx` | Replace `redirect("/board")` with client-side auth-aware redirect |
| `src/components/settings/team-manager.tsx` | Add "Invite Member" section below team list |
| `src/components/settings/data-manager.tsx` | Adapt import/export to read from store (already Firestore-backed), batch write on import |
| `src/lib/seed-data.ts` | Update `loadSeedData()` to write via Firestore batch instead of direct store import |
| `src/lib/export.ts` | No change to `exportJSON`/`importJSON` signatures — they work on `Project` objects from the store |

### Unchanged files (no modifications needed)

- `src/stores/ui-store.ts`, `src/stores/gantt-store.ts`
- `src/lib/scheduler.ts`, `critical-path.ts`, `date-utils.ts`, `workload.ts`
- All UI components under `src/components/board/`, `gantt/`, `workload/`, `items/`, `ui/`
- `next.config.ts`, `vitest.config.ts`

---

## Task 1: Install Firebase SDK and add type definitions

**Files:**
- Modify: `package.json`
- Modify: `src/types/index.ts`
- Modify: `src/lib/validators.ts`
- Test: `npm run test` (existing tests must still pass)

- [ ] **Step 1.1: Install firebase**

```bash
npm install firebase
```

- [ ] **Step 1.2: Add new types to `src/types/index.ts`**

Add `updatedBy` to `BaseItem` (optional for backward compat during migration):
```typescript
updatedBy?: string; // Firebase UID of last editor
```

Add `linkedUserId` to `TeamMember`:
```typescript
linkedUserId?: string | null; // Firebase UID linked to this team member
```

Add `ownerId` and `memberIds` to `Project` (optional for backward compat during migration from localStorage):
```typescript
ownerId?: string;       // Firebase UID of project creator
memberIds?: string[];   // Firebase UIDs of all project members
```

Add new interfaces at the end of the file:
```typescript
export interface FirebaseUser {
  uid: string;
  email: string;
  displayName: string;
  projectId: string | null;
}

export interface Invite {
  id: string;
  email: string;
  projectId: string;
  invitedBy: string;
  status: "pending" | "accepted";
  createdAt: string;
}
```

- [ ] **Step 1.3: Update validators to include new fields**

In `src/lib/validators.ts`:

Add `updatedBy` to `baseItemSchema`:
```typescript
updatedBy: z.string().optional(),
```

Add `linkedUserId` to `teamMemberSchema`:
```typescript
linkedUserId: z.string().nullable().optional(),
```

Add `ownerId` and `memberIds` to `projectSchema`:
```typescript
ownerId: z.string().optional(),
memberIds: z.array(z.string()).optional(),
```

Add `inviteSchema`:
```typescript
export const inviteSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  projectId: z.string().min(1),
  invitedBy: z.string().min(1),
  status: z.enum(["pending", "accepted"]),
  createdAt: z.string(),
});
```

- [ ] **Step 1.4: Run existing tests to ensure nothing broke**

```bash
npm run test
```
Expected: all existing tests pass (scheduler, critical-path, date-utils, validators, workload).

- [ ] **Step 1.5: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 1.6: Commit**

```bash
git add package.json package-lock.json src/types/index.ts src/lib/validators.ts
git commit -m "feat: add Firebase SDK, extend types for multi-user collaboration"
```

---

## Task 2: Firebase initialization module

**Files:**
- Create: `src/lib/firebase.ts`
- Create: `.env.local` (template — user fills in real values)

- [ ] **Step 2.1: Create `.env.example` (committed) and `.env.local` (gitignored)**

Create `.env.example` (committed to repo for other developers):
```
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
```

- [ ] **Step 2.2: Create `src/lib/firebase.ts`**

```typescript
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
```

- [ ] **Step 2.3: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 2.4: Commit**

Then copy `.env.example` to `.env.local` and fill in real values. Only `.env.example` is committed.

```bash
git add src/lib/firebase.ts .env.example
git commit -m "feat: add Firebase initialization with offline persistence"
```

Note: `.env.local` is gitignored — do NOT commit it.

---

## Task 3: Firestore sync layer — timestamp serialization and helpers

**Files:**
- Create: `src/lib/firestore-sync.ts`
- Create: `src/lib/firestore-sync.test.ts`

- [ ] **Step 3.1: Write tests for timestamp serialization and email normalization**

Create `src/lib/firestore-sync.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { normalizeEmailForDocId, serializeTimestamp } from "./firestore-sync";

describe("normalizeEmailForDocId", () => {
  it("lowercases email", () => {
    expect(normalizeEmailForDocId("User@Example.COM")).toBe("user@example.com");
  });

  it("preserves dots (valid in Firestore doc IDs)", () => {
    expect(normalizeEmailForDocId("alice@my.company.com")).toBe("alice@my.company.com");
  });

  it("handles email with + alias", () => {
    expect(normalizeEmailForDocId("user+tag@gmail.com")).toBe("user+tag@gmail.com");
  });
});

describe("serializeTimestamp", () => {
  it("converts Firestore-like timestamp to ISO string", () => {
    const fakeTimestamp = {
      toDate: () => new Date("2026-03-31T10:00:00.000Z"),
    };
    expect(serializeTimestamp(fakeTimestamp)).toBe("2026-03-31T10:00:00.000Z");
  });

  it("returns ISO string as-is if already a string", () => {
    expect(serializeTimestamp("2026-03-31T10:00:00.000Z")).toBe("2026-03-31T10:00:00.000Z");
  });

  it("returns empty string for null/undefined", () => {
    expect(serializeTimestamp(null)).toBe("");
    expect(serializeTimestamp(undefined)).toBe("");
  });
});

describe("docToItem", () => {
  it("converts Firestore document data to Item with serialized timestamps", () => {
    const data = {
      type: "task",
      title: "Test task",
      description: "",
      status: "todo",
      priority: "medium",
      estimatedDays: 1,
      order: 0,
      createdAt: { toDate: () => new Date("2026-01-01T00:00:00Z") },
      updatedAt: { toDate: () => new Date("2026-01-02T00:00:00Z") },
    };
    const item = docToItem(data, "test-id");
    expect(item.id).toBe("test-id");
    expect(item.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(item.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(item.assigneeIds).toEqual([]);
    expect(item.dependencies).toEqual([]);
    expect(item.tags).toEqual([]);
    expect(item.parentId).toBeNull();
    expect(item.sprintId).toBeNull();
  });
});

describe("collectDescendantIds", () => {
  it("collects all descendants recursively", () => {
    const items = [
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "b" },
      { id: "d", parentId: null },
    ] as Item[];
    const result = collectDescendantIds("a", items);
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).toContain("c");
    expect(result).not.toContain("d");
    expect(result.size).toBe(3);
  });
});
```

Note: import `docToItem` and `collectDescendantIds` from `./firestore-sync` in the test imports.

- [ ] **Step 3.2: Run tests to confirm they fail**

```bash
npm run test -- src/lib/firestore-sync.test.ts
```
Expected: FAIL — functions don't exist yet.

- [ ] **Step 3.3: Create `src/lib/firestore-sync.ts` with helpers**

```typescript
import {
  collection,
  doc,
  onSnapshot,
  writeBatch,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type DocumentData,
  type Unsubscribe,
  Timestamp,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
} from "firebase/firestore";
import type { Item, TeamMember, Sprint, GanttOverride, Invite } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalize an email for use as part of a Firestore document ID.
 * Lowercases only — Firebase Auth already normalizes to lowercase, and the
 * security rules use `request.auth.token.email` directly, so the doc ID must
 * match the raw email. Dots are fine in Firestore doc IDs. Only `/` would break
 * (virtually nonexistent in real emails — documented as unsupported in spec).
 */
export function normalizeEmailForDocId(email: string): string {
  return email.toLowerCase();
}

/**
 * Convert a Firestore Timestamp (or string, or null) to an ISO string.
 * Used when reading data from Firestore into the Zustand store.
 */
export function serializeTimestamp(
  value: Timestamp | string | null | undefined | { toDate: () => Date }
): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "toDate" in value) {
    return value.toDate().toISOString();
  }
  return "";
}

/**
 * Strip undefined fields from an object before writing to Firestore.
 * Firestore does not accept undefined values.
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Convert a Firestore document snapshot to a typed object,
 * serializing all Timestamp fields to ISO strings.
 */
export function docToItem(data: DocumentData, id: string): Item {
  return {
    ...data,
    id,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
    assigneeIds: data.assigneeIds ?? [],
    dependencies: data.dependencies ?? [],
    tags: data.tags ?? [],
    parentId: data.parentId ?? null,
    sprintId: data.sprintId ?? null,
    updatedBy: data.updatedBy ?? undefined,
  } as Item;
}

export function docToTeamMember(data: DocumentData, id: string): TeamMember {
  return {
    ...data,
    id,
    linkedUserId: data.linkedUserId ?? null,
  } as TeamMember;
}

export function docToSprint(data: DocumentData, id: string): Sprint {
  return {
    ...data,
    id,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
  } as Sprint;
}

export function docToOverride(data: DocumentData, id: string): GanttOverride {
  return {
    itemId: id,
    startDate: data.startDate,
  };
}

/**
 * Collect an item and all its descendants by parentId.
 * Pure function — used by cascade delete logic.
 */
export function collectDescendantIds(rootId: string, allItems: Pick<Item, "id" | "parentId">[]): Set<string> {
  const toDelete = new Set<string>();
  const collect = (parentId: string) => {
    toDelete.add(parentId);
    allItems.forEach((item) => {
      if (item.parentId === parentId) collect(item.id);
    });
  };
  collect(rootId);
  return toDelete;
}

export function docToInvite(data: DocumentData, id: string): Invite {
  return {
    id,
    email: data.email,
    projectId: data.projectId,
    invitedBy: data.invitedBy,
    status: data.status,
    createdAt: serializeTimestamp(data.createdAt),
  };
}
```

- [ ] **Step 3.4: Run tests to confirm they pass**

```bash
npm run test -- src/lib/firestore-sync.test.ts
```
Expected: PASS.

- [ ] **Step 3.5: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3.6: Commit**

```bash
git add src/lib/firestore-sync.ts src/lib/firestore-sync.test.ts
git commit -m "feat: add Firestore sync helpers with timestamp serialization"
```

---

## Task 4: Firestore security rules and indexes

**Files:**
- Create: `firestore.rules`
- Create: `firestore.indexes.json`

- [ ] **Step 4.1: Create `firestore.rules`**

Copy the security rules verbatim from the spec (section "Security Rules" in `docs/superpowers/specs/2026-03-31-firebase-migration-design.md`, lines 284-358). This is the production-ready version with:
- `memberIds` locked in normal update path
- Invite acceptance rule with `affectedKeys` constraint
- `ownerId` immutability
- Sub-collection member check via parent doc `get()`

- [ ] **Step 4.2: Create `firestore.indexes.json`**

The `getPendingInvites` query filters by `email` + `status`, which requires a composite index:

```json
{
  "indexes": [
    {
      "collectionGroup": "invites",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "email", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

Note: if using the Firebase console, the first query attempt will fail with a link to create the index automatically.

- [ ] **Step 4.3: Commit**

```bash
git add firestore.rules firestore.indexes.json
git commit -m "feat: add Firestore security rules and composite indexes"
```

---

## Task 5: Auth Provider and Auth Gate components

**Files:**
- Create: `src/components/auth/auth-provider.tsx`
- Create: `src/components/auth/auth-gate.tsx`

- [ ] **Step 5.1: Create `src/components/auth/auth-provider.tsx`**

```typescript
"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null | undefined>(null); // null = loading
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrCreateUserDoc = useCallback(async (fbUser: User, retries = 0): Promise<FirebaseUser | null> => {
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

    // Lazy create as fallback (handles page refresh between auth create and doc write)
    const newUser: FirebaseUser = {
      uid: fbUser.uid,
      email: fbUser.email ?? "",
      displayName: fbUser.displayName ?? "",
      projectId: null,
    };
    await setDoc(userRef, newUser);
    return newUser;
  }, []);

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
  }, [fetchOrCreateUserDoc]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Create Firestore user doc immediately
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
    await firebaseSignOut(auth);
    setUser(undefined);
    setFirebaseUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, signIn, signUp, signOut: signOutFn }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 5.2: Create `src/components/auth/auth-gate.tsx`**

```typescript
"use client";

import { useAuth } from "./auth-provider";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

const PUBLIC_ROUTES = ["/login", "/register"];

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublic = PUBLIC_ROUTES.includes(pathname);

  useEffect(() => {
    if (loading) return;

    if (user === undefined && !isPublic) {
      // Not authenticated, on a protected route → redirect to login
      router.replace("/login");
    } else if (user && isPublic) {
      // Authenticated, on a public route → redirect to board
      router.replace("/board");
    }
  }, [user, loading, isPublic, router]);

  // Show loading spinner while auth state resolves
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-secondary)]">Loading...</p>
        </div>
      </div>
    );
  }

  // On protected routes, don't render content if not authenticated
  if (user === undefined && !isPublic) {
    return null;
  }

  // On public routes, don't render content if authenticated (redirect in progress)
  if (user && isPublic) {
    return null;
  }

  return <>{children}</>;
}
```

- [ ] **Step 5.3: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5.4: Commit**

```bash
git add src/components/auth/auth-provider.tsx src/components/auth/auth-gate.tsx
git commit -m "feat: add AuthProvider context and AuthGate route protection"
```

---

## Task 6: Login and Register pages

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/register/page.tsx`

- [ ] **Step 6.1: Create `src/app/login/page.tsx`**

A form with email/password fields, error display, and link to register. Uses `useAuth().signIn`. On success, the `AuthGate` handles redirect. Style with Tailwind, dark mode variants.

Key elements:
- Email input, password input
- "Sign In" button
- Error message area
- Link: "Don't have an account? Register"
- No `Sidebar`/`Navbar` — public route renders standalone

- [ ] **Step 6.2: Create `src/app/register/page.tsx`**

Same layout as login but with additional "Display Name" field. Uses `useAuth().signUp`. On success, `AuthGate` redirects.

Key elements:
- Display name input, email input, password input, confirm password input
- "Create Account" button
- Error message area
- Link: "Already have an account? Sign In"

- [ ] **Step 6.3: Test manually in browser**

```bash
npm run dev
```
Navigate to `http://localhost:3000/login` and `http://localhost:3000/register`. Verify:
- Pages render without errors
- Forms display correctly in both light and dark mode
- No console errors

- [ ] **Step 6.4: Commit**

```bash
git add src/app/login/page.tsx src/app/register/page.tsx
git commit -m "feat: add login and registration pages"
```

---

## Task 7: Wire AuthProvider and AuthGate into layout

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 7.1: Update `src/app/layout.tsx`**

Wrap the entire tree with `AuthProvider`. Move `Sidebar`, `Navbar`, and `MainContent` inside a new inner component that uses `AuthGate` to conditionally render them:

```typescript
import { AuthProvider } from "@/components/auth/auth-provider";
import { AuthGate } from "@/components/auth/auth-gate";

// In the return:
<body className="min-h-full">
  <ThemeProvider>
    <AuthProvider>
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    </AuthProvider>
  </ThemeProvider>
</body>
```

Create an `AppShell` client component (can be inline or separate) that renders `Sidebar`, `Navbar`, `MainContent` only when on an authenticated route (check `usePathname()` against PUBLIC_ROUTES to decide whether to show the shell or just render `{children}` bare).

- [ ] **Step 7.2: Update `src/app/page.tsx`**

Replace the server-side `redirect("/board")` with a client component that checks auth and redirects:

```typescript
"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace("/board");
    } else {
      router.replace("/login");
    }
  }, [user, loading, router]);

  return null;
}
```

- [ ] **Step 7.3: Type check and lint**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Step 7.4: Test manually**

```bash
npm run dev
```
Verify:
- Hitting `/` redirects to `/login` (when not authenticated)
- `/board`, `/gantt`, etc. redirect to `/login`
- `/login` and `/register` render without the Sidebar/Navbar
- No flash of authenticated content

- [ ] **Step 7.5: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx
git commit -m "feat: wire AuthProvider and AuthGate into app layout"
```

---

## Task 8: Firestore sync layer — listeners and write operations

**Files:**
- Modify: `src/lib/firestore-sync.ts` (add listener and write functions)

This is the core of the migration. Add functions that:
1. Subscribe to all 5 sub-collections via `onSnapshot`
2. Write individual items/team/sprints/overrides to Firestore
3. Handle cascade deletes as batched writes
4. Implement optimistic locking for item updates

- [ ] **Step 8.1: Add listener functions**

Add to `firestore-sync.ts`:

```typescript
export interface SyncCallbacks {
  onProjectUpdate: (data: Partial<Project>) => void;
  onItemsUpdate: (items: Item[]) => void;
  onTeamUpdate: (team: TeamMember[]) => void;
  onSprintsUpdate: (sprints: Sprint[]) => void;
  onOverridesUpdate: (overrides: GanttOverride[]) => void;
  onError: (error: Error) => void;
  onSyncStateChange: (loading: boolean, syncing: boolean) => void;
}

export function subscribeToProject(
  firestore: Firestore,
  projectId: string,
  callbacks: SyncCallbacks
): Unsubscribe[] { ... }
```

Each listener:
- Converts Firestore `Timestamp` → ISO string via `serializeTimestamp`
- Calls the appropriate callback to update the Zustand store
- Handles errors by calling `callbacks.onError`

**Composite loading/syncing state:** Track per-listener resolution with a `Set<string>` of resolved listener names (e.g., `"items"`, `"team"`, etc.). `loading = true` until ALL 5 listeners have fired at least once. `syncing = true` if ANY listener's latest snapshot has `metadata.fromCache === true`. This prevents the app rendering with partial data (e.g., items loaded but team not yet). Implementation:

```typescript
const resolved = new Set<string>();
const REQUIRED = ["project", "items", "team", "sprints", "overrides"];

function checkReady(name: string, fromCache: boolean) {
  resolved.add(name);
  const allResolved = REQUIRED.every((r) => resolved.has(r));
  callbacks.onSyncStateChange(!allResolved, fromCache);
}
```

- [ ] **Step 8.2: Add write functions**

```typescript
// Single item CRUD
export async function firestoreAddItem(db: Firestore, projectId: string, item: Item, uid: string): Promise<void>
export async function firestoreUpdateItem(db: Firestore, projectId: string, itemId: string, updates: Partial<Item>, uid: string, expectedUpdatedAt: string): Promise<void>
export async function firestoreDeleteItem(db: Firestore, projectId: string, itemId: string, allItems: Item[], allOverrides: GanttOverride[]): Promise<void>
export async function firestoreMoveItem(db: Firestore, projectId: string, itemId: string, status: Status, uid: string): Promise<void>
export async function firestoreReorderItem(db: Firestore, projectId: string, itemId: string, newOrder: number, uid: string): Promise<void>

// Team CRUD
export async function firestoreAddTeamMember(db: Firestore, projectId: string, member: TeamMember): Promise<void>
export async function firestoreUpdateTeamMember(db: Firestore, projectId: string, memberId: string, updates: Partial<TeamMember>): Promise<void>
export async function firestoreRemoveTeamMember(db: Firestore, projectId: string, memberId: string, allItems: Item[]): Promise<void>

// Sprint CRUD
export async function firestoreAddSprint(db: Firestore, projectId: string, sprint: Sprint): Promise<void>
export async function firestoreUpdateSprint(db: Firestore, projectId: string, sprintId: string, updates: Partial<Sprint>): Promise<void>
export async function firestoreDeleteSprint(db: Firestore, projectId: string, sprintId: string, allItems: Item[]): Promise<void>
export async function firestoreStartSprint(db: Firestore, projectId: string, sprintId: string, startDate: string, endDate: string): Promise<void>
export async function firestoreCompleteSprint(db: Firestore, projectId: string, sprintId: string, allItems: Item[], moveIncomplete: "next" | "backlog", allSprints: Sprint[]): Promise<void>

// Dependencies (thin wrappers over firestoreUpdateItem — update the item's dependencies array)
export async function firestoreAddDependency(db: Firestore, projectId: string, itemId: string, dependsOnId: string, uid: string): Promise<void>
export async function firestoreRemoveDependency(db: Firestore, projectId: string, itemId: string, dependsOnId: string, uid: string): Promise<void>

// Item-sprint assignment
export async function firestoreAssignToSprint(db: Firestore, projectId: string, itemId: string, sprintId: string | null, uid: string): Promise<void>

// Overrides
export async function firestoreSetOverride(db: Firestore, projectId: string, itemId: string, startDate: string): Promise<void>
export async function firestoreRemoveOverride(db: Firestore, projectId: string, itemId: string): Promise<void>

// Project metadata
export async function firestoreUpdateProject(db: Firestore, projectId: string, updates: Partial<{name: string, deadline: string | null}>): Promise<void>
export async function firestoreCreateProject(db: Firestore, projectId: string, name: string, ownerUid: string): Promise<void>
```

Key implementation details:
- `firestoreDeleteItem`: collects descendants via `parentId`, removes from `dependencies` on other items, deletes `overrides/{id}` docs — all in one `writeBatch`
- `firestoreRemoveTeamMember`: removes member ID from `assigneeIds` on all items in a batch
- `firestoreUpdateItem`: uses `runTransaction` for optimistic locking — reads current `updatedAt`, compares with `expectedUpdatedAt`, throws `ConflictError` if mismatched
- All writes use `serverTimestamp()` for `updatedAt`/`createdAt`

- [ ] **Step 8.3: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 8.4: Commit**

```bash
git add src/lib/firestore-sync.ts
git commit -m "feat: add Firestore sync listeners and write operations"
```

---

## Task 9: Rewire project-store to use Firestore

**Files:**
- Modify: `src/stores/project-store.ts`

This is the critical integration step. The store:
1. Removes `persist` middleware
2. Adds `loading`, `syncing`, `projectId` state
3. All mutation actions call `firestore-sync.ts` write functions instead of local `set()`
4. Data flows in via `onSnapshot` listeners calling store setters
5. Convenience selectors remain unchanged

- [ ] **Step 9.1: Rewrite `project-store.ts`**

Remove `persist(...)` wrapper. Add new state:
```typescript
interface ProjectState {
  project: Project;
  projectId: string | null;    // Firestore project doc ID
  loading: boolean;            // true until first snapshot resolves
  syncing: boolean;            // true when data is from cache, waiting for server

  // Internal setters called by onSnapshot listeners (not for UI use)
  _setProject: (project: Partial<Project>) => void;
  _setItems: (items: Item[]) => void;
  _setTeam: (team: TeamMember[]) => void;
  _setSprints: (sprints: Sprint[]) => void;
  _setOverrides: (overrides: GanttOverride[]) => void;
  _setLoading: (loading: boolean) => void;
  _setSyncing: (syncing: boolean) => void;
  _setProjectId: (id: string) => void;

  // Public actions (call Firestore write functions)
  addItem: (...) => Promise<string>;
  updateItem: (...) => Promise<void>;
  // ... all existing action signatures, but now returning Promises
}
```

Each action:
1. Optimistically updates local state via `set()` (for instant UI feedback)
2. Calls the corresponding `firestore*` function from `firestore-sync.ts`
3. If the Firestore write fails, the `onSnapshot` listener will correct the local state
4. For `updateItem`, catches `ConflictError` and shows a toast

Add a `initializeSync(projectId: string)` function that:
1. Sets `projectId` and `loading = true`
2. Calls `subscribeToProject()` with callbacks that update the store
3. Returns the unsubscribe functions (for cleanup)

- [ ] **Step 9.2: Run existing tests**

```bash
npm run test
```
Note: existing tests for `lib/` modules should still pass (they don't import the store). If there are store-specific tests, they may need updating — but currently there are none.

- [ ] **Step 9.3: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 9.4: Run lint**

```bash
npm run lint
```

- [ ] **Step 9.5: Commit**

```bash
git add src/stores/project-store.ts
git commit -m "feat: rewire project-store from localStorage to Firestore sync"
```

---

## Task 10: Invite system

**Files:**
- Create: `src/lib/invite.ts`
- Modify: `src/components/settings/team-manager.tsx`

- [ ] **Step 10.1: Create `src/lib/invite.ts`**

```typescript
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where, runTransaction, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db } from "./firebase";
import { normalizeEmailForDocId } from "./firestore-sync";
import type { Invite } from "@/types";

export async function createInvite(projectId: string, email: string, invitedByUid: string): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  const inviteId = `${projectId}_${normalizeEmailForDocId(normalizedEmail)}`;

  await setDoc(doc(db, "invites", inviteId), {
    email: normalizedEmail,
    projectId,
    invitedBy: invitedByUid,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

export async function acceptInvite(inviteId: string, projectId: string, uid: string): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const inviteRef = doc(db, "invites", inviteId);
    const projectRef = doc(db, "projects", projectId);

    const inviteSnap = await transaction.get(inviteRef);
    if (!inviteSnap.exists()) throw new Error("Invite not found");

    const projectSnap = await transaction.get(projectRef);
    if (!projectSnap.exists()) throw new Error("Project not found");

    // Update invite status
    transaction.update(inviteRef, { status: "accepted" });

    // Add user to project memberIds
    transaction.update(projectRef, {
      memberIds: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });

    // Update user's projectId
    transaction.update(doc(db, "users", uid), {
      projectId,
    });
  });
}

export async function getPendingInvites(email: string): Promise<Invite[]> {
  const q = query(
    collection(db, "invites"),
    where("email", "==", email.toLowerCase()),
    where("status", "==", "pending")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invite));
}
```

- [ ] **Step 10.2: Add invite UI to `team-manager.tsx`**

Add a new section below the team list with:
- Input for email address
- "Send Invite" button
- List of pending invites (fetched from Firestore)
- Uses `useAuth()` to get the current user's UID for `invitedBy`

- [ ] **Step 10.3: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 10.4: Commit**

```bash
git add src/lib/invite.ts src/components/settings/team-manager.tsx
git commit -m "feat: add invite system for team member onboarding"
```

---

## Task 11: Pending invite acceptance in AuthProvider

**Files:**
- Modify: `src/components/auth/auth-provider.tsx`

- [ ] **Step 11.1: Add invite check after authentication**

After the user doc is fetched/created, if `projectId` is null, check for pending invites via `getPendingInvites(email)`. Expose `pendingInvites` and `acceptInvite` on the auth context so the UI can show an acceptance screen.

Add to `AuthState`:
```typescript
pendingInvites: Invite[];
acceptInvite: (inviteId: string, projectId: string) => Promise<void>;
createProject: (name: string) => Promise<string>;
```

- [ ] **Step 11.2: Add team member auto-linking on invite acceptance**

After `acceptInvite` succeeds, query the `team` sub-collection for a member with matching email (via a `linkedUserId === null` filter). If found, update that team member's `linkedUserId` to the accepting user's UID. This links the Firebase account to the existing TeamMember entity. If no match, do nothing — the owner can manually link in Settings.

- [ ] **Step 11.3: Create a simple "No Project" screen**

When user is authenticated but has no project and no invites: show a "Create Project" button.
When user has pending invites: show invite cards with "Accept" buttons.

This can be handled inside `AuthGate` or as a separate component rendered when `user.projectId === null`.

- [ ] **Step 11.3: Test manually**

Register a new user → should see "Create Project" screen.
Create a project → should redirect to `/board`.
From settings, invite another email → register with that email → should see invite acceptance screen.

- [ ] **Step 11.4: Commit**

```bash
git add src/components/auth/auth-provider.tsx src/components/auth/auth-gate.tsx
git commit -m "feat: add invite acceptance flow and project creation in auth"
```

---

## Task 12: Initialize Firestore sync on project load

**Files:**
- Modify: `src/app/layout.tsx` or create `src/components/auth/project-sync.tsx`

- [ ] **Step 12.1: Create a `ProjectSync` component**

A component that sits inside `AuthGate` and:
1. Reads `user.projectId` from `useAuth()`
2. Calls `initializeSync(projectId)` on the project store
3. Returns `unsubscribe` functions in cleanup
4. Shows a loading state while initial data loads

```typescript
"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useProjectStore } from "@/stores/project-store";
import { db } from "@/lib/firebase";

export function ProjectSync({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const initSync = useProjectStore((s) => s.initializeSync);
  const loading = useProjectStore((s) => s.loading);
  const projectId = user?.projectId;

  useEffect(() => {
    if (!projectId) return;
    const unsubscribes = initSync(projectId);
    return () => unsubscribes.forEach((unsub) => unsub());
  }, [projectId, initSync]);

  if (!projectId) return null; // "No Project" screen handled by AuthGate

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-secondary)]">Loading project...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
```

The `initializeSync` function should pass an `onError` callback that:
- On `permission-denied` errors → call `signOut()` from auth context and redirect to `/login` with a message "You no longer have access to this project"
- On other errors → show a toast notification

The `useEffect` cleanup ensures listeners are unsubscribed before sign-out completes. The `signOut` function in `AuthProvider` should set `user = undefined` first (which unmounts `ProjectSync` and triggers cleanup), then call `firebaseSignOut`. This ordering prevents "permission denied" errors from still-active listeners after sign-out.

- [ ] **Step 12.2: Wire into layout**

Insert `ProjectSync` inside the component tree, after `AuthGate`, wrapping the app shell. The layout tree becomes:

```
AuthProvider > ThemeProvider > AuthGate > [
  if public route: {children} (login/register, no shell)
  if no project: NoProjectScreen (create or accept invite)
  if has project: ProjectSync > AppShell(Sidebar, Navbar, MainContent) > {children}
]
```

- [ ] **Step 12.3: Test manually — full flow**

1. Register new user
2. Create project
3. Navigate to `/board` → should see empty board
4. Add items via the board
5. Refresh page → items persist (from Firestore, not localStorage)
6. Open a second browser tab → same data visible

- [ ] **Step 12.4: Commit**

```bash
git add src/components/auth/project-sync.tsx src/app/layout.tsx
git commit -m "feat: initialize Firestore sync on project load"
```

---

## Task 13: Adapt data-manager for Firestore

**Files:**
- Modify: `src/components/settings/data-manager.tsx`

- [ ] **Step 13.1: Update import/export**

**Export**: no change needed — `exportJSON(project)` reads from the Zustand store which is already populated from Firestore.

**Import**: after parsing and validating the JSON file, write all entities to Firestore via batched writes instead of calling `importProject` directly:
1. Delete all existing items/team/sprints/overrides in the project
2. Write all imported entities as new documents
3. The `onSnapshot` listeners will update the store automatically

**Load Sample**: same approach — `loadSeedData()` needs to write to Firestore instead of directly to the store.

**Reset**: delete all sub-collection documents in Firestore.

- [ ] **Step 13.2: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 13.3: Test manually**

Export JSON → verify file downloads. Import JSON → verify data appears. Reset → verify data clears.

- [ ] **Step 13.4: Commit**

```bash
git add src/components/settings/data-manager.tsx
git commit -m "feat: adapt data-manager import/export for Firestore"
```

---

## Task 14: localStorage migration

**Files:**
- Modify: `src/components/auth/project-sync.tsx` or create `src/lib/migrate-localstorage.ts`

- [ ] **Step 14.1: Add migration check**

On first authenticated load, after `ProjectSync` initializes:
1. Check if `cadence-project` exists in localStorage
2. If yes and the Firestore project has no items → offer to import
3. Write all localStorage items/team/sprints/overrides via batch write to Firestore
4. Clear `cadence-project` from localStorage after successful migration

- [ ] **Step 14.2: Test manually**

Load some data into localStorage (via the old app), then log in → should see migration prompt → accept → data appears from Firestore → localStorage cleared.

- [ ] **Step 14.3: Commit**

```bash
git add src/components/auth/project-sync.tsx src/lib/migrate-localstorage.ts
git commit -m "feat: add one-time localStorage to Firestore migration"
```

---

## Task 15: Final verification and cleanup

- [ ] **Step 15.1: Run all tests**

```bash
npm run test
```

- [ ] **Step 15.2: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 15.3: Lint**

```bash
npm run lint
```

- [ ] **Step 15.4: Build**

```bash
npm run build
```
Verify static export succeeds.

- [ ] **Step 15.5: End-to-end manual testing**

Test the complete flow:
1. Register user A → create project → add items, team, sprints
2. Invite user B via email
3. Register user B → accept invite → see the shared project
4. User A adds an item → User B sees it appear in real-time
5. User B modifies an item → User A sees the change
6. Both users reorder items on the board → no conflicts
7. Test offline: disable network → make changes → re-enable → changes sync
8. Test conflict: User A and User B edit the same item → second save shows conflict toast
9. Export JSON → Import JSON → verify roundtrip
10. Page refresh → data persists from Firestore

- [ ] **Step 15.6: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final adjustments from end-to-end testing"
```
