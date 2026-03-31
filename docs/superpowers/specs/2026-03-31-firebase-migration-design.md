# Cadence: Migration from localStorage to Firebase

**Date**: 2026-03-31
**Status**: Approved
**Scope**: Replace localStorage persistence with Firebase (Auth + Firestore) for multi-user collaboration

## Context

Cadence is a project planning tool (Kanban, Gantt, workload) currently running as a fully client-side static app with localStorage persistence. A small team (2-5 people) needs to collaborate on a shared project across different machines.

### Constraints

- No Supabase
- Prefer minimal infrastructure — Firebase client SDK only, no custom backend
- Keep `output: "export"` (static deploy on Vercel)
- Single shared project per team (multi-project deferred to future)
- No push to remote without explicit authorization

## Decision: Firebase Pure (Client-Side Only)

Firebase Auth for authentication, Firestore as the database. The client talks directly to Firestore via the SDK. Security rules protect access. No backend server needed.

### Why Firebase over alternatives

| Criteria | Firebase | FastAPI + PostgreSQL | Hybrid |
|----------|----------|---------------------|--------|
| Backend to maintain | None | Yes | Yes |
| Real-time sync | Built-in (onSnapshot) | Custom (WebSocket/polling) | Custom |
| Cost for 2-5 users | Free tier | ~$5/month min | ~$5/month min |
| Implementation effort | Low | High | Highest |
| Vendor lock-in | Yes (Google) | No | Partial |

For a small team with small data (20-100KB), Firebase's free tier, built-in real-time, and zero-ops model is the clear winner.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Next.js App (Vercel, static export)            │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ project- │  │ ui-store │  │ gantt-   │     │
│  │ store    │  │ (local)  │  │ store    │     │
│  │ (sync)   │  │          │  │ (ephem.) │     │
│  └────┬─────┘  └──────────┘  └──────────┘     │
│       │                                         │
│  ┌────▼──────────────────────────┐              │
│  │  lib/firestore-sync.ts        │              │
│  │  - onSnapshot listeners       │              │
│  │  - write operations           │              │
│  │  - optimistic locking         │              │
│  └────┬──────────────────────────┘              │
└───────┼─────────────────────────────────────────┘
        │ Firestore SDK (client)
        ▼
┌─────────────────────────────────────────────────┐
│  Firebase                                       │
│  ┌──────────────┐  ┌──────────────────────┐    │
│  │ Firebase Auth │  │ Firestore            │    │
│  │ email/pass   │  │                       │    │
│  └──────────────┘  │ projects/{id}         │    │
│                     │   ├── items/{id}      │    │
│                     │   ├── team/{id}       │    │
│                     │   ├── overrides/{id}  │    │
│                     │   └── sprints/{id}    │    │
│                     └──────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### What changes

- `project-store` drops `persist` middleware, becomes a wrapper around Firestore listeners and writes
- `ui-store` stays in localStorage (theme/sidebar are per-device preferences)
- `gantt-store` stays ephemeral, no changes
- All UI components remain unchanged — they read from the Zustand store as before

### What doesn't change

- `next.config.ts` stays `output: "export"`
- All `lib/` pure functions (scheduler, critical-path, date-utils, workload) — no storage dependency
- All UI components (board, gantt, workload) — they consume the store, unaware of persistence layer
- Type interfaces in `types/index.ts` — mostly unchanged

## Data Model (Firestore)

```
firestore-root/
│
├── projects/{projectId}
│   ├── name: string
│   ├── deadline: string | null
│   ├── ownerId: string              ← uid of creator
│   ├── memberIds: string[]          ← uids of all members (owner included)
│   ├── activeSprint: string | null
│   ├── createdAt: Timestamp
│   ├── updatedAt: Timestamp
│   │
│   ├── items/{itemId}               ← sub-collection
│   │   ├── type, title, description, status, priority...
│   │   ├── assigneeIds: string[]
│   │   ├── dependencies: string[]
│   │   ├── updatedAt: Timestamp     ← for optimistic locking
│   │   └── updatedBy: string        ← uid, for "modified by X" display
│   │
│   ├── team/{memberId}              ← sub-collection
│   │   ├── name, color, role, hoursPerDay
│   │   └── linkedUserId: string | null  ← links TeamMember to Firebase uid
│   │
│   ├── sprints/{sprintId}           ← sub-collection
│   │   ├── name, goal, status, startDate, endDate
│   │   └── updatedAt: Timestamp
│   │
│   └── overrides/{itemId}           ← sub-collection, doc ID = itemId
│       └── startDate: string
│
├── users/{uid}
│   ├── email: string
│   ├── displayName: string
│   └── projectId: string | null     ← single project for now
│
└── invites/{inviteId}
    ├── email: string
    ├── projectId: string
    ├── invitedBy: string             ← uid
    ├── status: "pending" | "accepted"
    └── createdAt: Timestamp
```

### Design decisions

- **Sub-collections** for items/team/sprints/overrides instead of a single project document. Firestore has a 1MB document limit, and onSnapshot on sub-collections delivers only the changed documents (deltas), not the entire collection on every change.
- **`updatedAt` + `updatedBy`** on items for optimistic locking and attribution.
- **`users/{uid}`** collection for reverse lookup ("my project") without complex queries.
- **`linkedUserId`** on team members keeps the TeamMember concept (name, color, role) separate from the Firebase account. A team member can exist before they have an account.
- **`projectId` on user** (singular) — single project for now. When multi-project is added, this becomes `projectIds: string[]`.

## Authentication

### Method

Email/password via Firebase Auth. Google sign-in can be added later as a secondary provider (Firebase Auth supports multiple providers per project out of the box).

### User flow

```
Unauthenticated user
  → /login (or /register)
  → Firebase Auth createUser / signIn
  → If user has a project → redirect to /board
  → If user has no project → auto-create project (first user) or show pending invites

Invitation:
  Owner goes to Settings → "Invite member" → enters email
  → Creates doc in invites/{inviteId} with email + projectId
  → Invitee logs in / registers → sees pending invite on first access
  → Accepts → added to project memberIds + users/{uid}.projectId
```

### Route protection

- `AuthProvider` React context wraps the app
- Listens to `onAuthStateChanged`
- **Auth gate pattern**: since `output: "export"` produces static HTML, all authenticated pages are wrapped in a client-side `AuthGate` component that renders a loading spinner until auth state resolves. This prevents flash-of-content (unauthenticated users briefly seeing the app shell). The `<Sidebar />` and `<Navbar />` render only inside the authenticated branch.
- Unauthenticated → redirect to `/login`
- Authenticated without project → show invite acceptance or project creation
- Existing routes (`/board`, `/gantt`, `/workload`, `/settings`) require auth + active project

### Registration flow

When a user registers:
1. Create Firebase Auth account (`createUserWithEmailAndPassword`)
2. Create `users/{uid}` Firestore document with `email`, `displayName`, `projectId: null`
3. Check for pending invites matching their email → show acceptance UI

The `AuthProvider` must not emit "authenticated" state until the `users/{uid}` document exists. The registration handler completes steps 1-2 before setting auth state, preventing the AuthGate from evaluating a user with no Firestore document.

### Team member linking

When a user accepts an invite and joins a project, the system auto-links them to a TeamMember if one exists with a matching email or name. If no match, the owner can manually link team members to accounts in Settings. This ensures existing team members (created before the account existed) are properly associated.

### No roles for now

All project members have equal read/write access. Only the owner can delete the project.

### Environment configuration

Firebase config keys must use `NEXT_PUBLIC_` prefix to be available in the client bundle (static export inlines env vars at build time):
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```
For Vercel deployment, these are set in the Vercel dashboard environment variables. `.env.local` is for local development only and must be in `.gitignore`.

## Sync Strategy

### Real-time listeners

```
On app mount (authenticated, project selected):
  → onSnapshot("projects/{id}")           ← project metadata
  → onSnapshot("projects/{id}/items")     ← all items
  → onSnapshot("projects/{id}/team")      ← team members
  → onSnapshot("projects/{id}/sprints")   ← sprints
  → onSnapshot("projects/{id}/overrides") ← gantt overrides

Each listener updates the Zustand store on change.
```

### Optimistic locking

```
1. User opens ItemDetailDrawer → reads item with updatedAt = T1
2. User edits and saves
3. Before writing: Firestore transaction
   a. Read current item from server
   b. If server updatedAt == T1 → write with updatedAt = now
   c. If server updatedAt != T1 → CONFLICT
4. On conflict:
   → Toast: "This item was modified by [name] in the meantime"
   → Reload fresh data into the form
   → User decides whether to re-apply their changes
```

### Optimistic UI updates

- On save, the local store updates immediately (responsive UI)
- Firestore transaction runs in background
- On conflict, the store is corrected by the onSnapshot listener bringing server data

### Cascade operations

Some operations affect multiple documents (e.g., deleting an item with descendants, removing a team member referenced in assigneeIds). These are implemented as Firestore batched writes:

- **Delete item**: collect all descendant items (recursive by `parentId`), remove their IDs from other items' `dependencies` arrays, delete all in a single batch. Firestore batches support up to 500 operations — more than sufficient for this use case.
- **Delete team member**: remove their ID from `assigneeIds` on all items, then delete the team member document.
- **Delete sprint**: unset `sprintId` on all items assigned to it, then delete the sprint document.

### Drag-and-drop reordering

Kanban reordering (changing `order` and/or `status` on items) uses **fractional indexing**: each item's `order` is a float. When an item is dropped between two others, its new `order` is the midpoint. This requires updating only the moved item's document — no multi-document batch needed. For the expected item count (< 500 items), floating-point precision will not be an issue in practice — re-normalization is deferred to future if ever needed.

### Offline support

Firestore SDK has built-in offline persistence. In Firebase v10+ (modular SDK), this is configured at initialization:

```ts
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
```

The multi-tab manager ensures multiple browser tabs work correctly. Writes are queued and sent when connection returns. Default behavior is sufficient for this use case — no custom offline queue needed.

### Loading and error states

- **Initial load**: a full-screen loading spinner is shown while the 5 onSnapshot listeners resolve for the first time. The store exposes a `loading: boolean` state that components check.
- **Write failures**: network errors or permission denied → toast notification with the error. The onSnapshot listener will bring the store back to the server's state.
- **Listener errors**: if an onSnapshot listener errors (e.g., permission revoked because user was removed from project), redirect to `/login` with a message "You no longer have access to this project."

### Timestamp serialization

Firestore uses native `Timestamp` objects, but the existing TypeScript interfaces use ISO strings (`createdAt: string`, `updatedAt: string`). The sync layer (`firestore-sync.ts`) handles conversion:

- **On read** (onSnapshot): convert Firestore `Timestamp` → ISO string via `timestamp.toDate().toISOString()`
- **On write**: convert ISO string → Firestore `serverTimestamp()` for `createdAt`/`updatedAt` (server-generated for consistency)

This keeps all TypeScript interfaces unchanged. Components and pure lib/ functions never see Firestore types.

## Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    match /projects/{projectId} {
      allow read: if request.auth != null
        && request.auth.uid in resource.data.memberIds;

      // Create: must set yourself as owner and sole member
      allow create: if request.auth != null
        && request.resource.data.ownerId == request.auth.uid
        && request.resource.data.memberIds == [request.auth.uid];

      // Update: must be a member; cannot change ownerId
      allow update: if request.auth != null
        && request.auth.uid in resource.data.memberIds
        && request.resource.data.ownerId == resource.data.ownerId;

      allow delete: if request.auth != null
        && request.auth.uid == resource.data.ownerId;

      // Sub-collections: member check via parent doc
      match /{subcollection}/{docId} {
        allow read, write: if request.auth != null
          && request.auth.uid in
             get(/databases/$(database)/documents/projects/$(projectId)).data.memberIds;
      }
    }

    // Invite acceptance: allows invitee to add themselves to project memberIds.
    // Uses email-based deterministic invite ID: {projectId}_{emailHash}
    // so the invite can be created before the invitee has an account.
    // Only memberIds and updatedAt can be changed; ownerId is immutable.
    match /projects/{projectId} {
      allow update: if request.auth != null
        && !(request.auth.uid in resource.data.memberIds)
        && request.resource.data.memberIds.hasAll(resource.data.memberIds)
        && request.resource.data.memberIds.size() == resource.data.memberIds.size() + 1
        && request.auth.uid in request.resource.data.memberIds
        && request.resource.data.ownerId == resource.data.ownerId
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['memberIds', 'updatedAt'])
        && exists(/databases/$(database)/documents/invites/$(projectId + '_' + request.auth.token.email));
    }

    match /invites/{inviteId} {
      // Readable by invitee (by email) or by project members (inviter)
      allow read: if request.auth != null
        && (request.auth.token.email == resource.data.email
            || request.auth.uid in
               get(/databases/$(database)/documents/projects/$(resource.data.projectId)).data.memberIds);

      // Only project members can create invites
      allow create: if request.auth != null
        && request.auth.uid in
           get(/databases/$(database)/documents/projects/$(request.resource.data.projectId)).data.memberIds;

      // Invitee can update (accept) their own invite
      allow update: if request.auth != null
        && request.auth.token.email == resource.data.email;

      // Project members or invitee can delete
      allow delete: if request.auth != null
        && (request.auth.token.email == resource.data.email
            || request.auth.uid in
               get(/databases/$(database)/documents/projects/$(resource.data.projectId)).data.memberIds);
    }
  }
}
```

### Invite acceptance flow

The invite acceptance is the trickiest security problem. The invitee is not yet a member but needs to add themselves to `memberIds`. This is solved with a dedicated update rule on `projects`:

1. Owner creates invite doc with deterministic ID: `{projectId}_{inviteeEmail}` (email as-is, since Firestore doc IDs allow most characters)
2. Invitee accepts → client runs a transaction:
   a. Update invite status to "accepted"
   b. Add own uid to project `memberIds` (special rule allows this if invite doc exists)
   c. Update own `users/{uid}.projectId`
3. The security rule validates: invite exists, user is only adding themselves, not removing existing members

### Notes on rules

- Every operation requires authentication
- Only project members can access project data and sub-collections
- Only the owner can delete the project
- Project creation enforces creator as owner and sole initial member — prevents spoofing
- `ownerId` is immutable after creation
- Invites can only be created by project members
- Invites are readable by both invitee and project members
- Sub-collection rules do a `get()` on the parent document per operation — negligible cost for 2-5 users

## Files Impact

### New files

| File | Purpose |
|------|---------|
| `src/lib/firebase.ts` | Initialize Firebase app, auth, firestore instances |
| `src/lib/firestore-sync.ts` | onSnapshot listeners, write operations, optimistic locking |
| `src/components/auth/AuthProvider.tsx` | React context, onAuthStateChanged, route protection |
| `src/app/login/page.tsx` | Login form (email/password) |
| `src/app/register/page.tsx` | Registration form |
| `firestore.rules` | Firestore security rules |
| `.env.local` | Firebase config keys (gitignored, `NEXT_PUBLIC_` prefix) |

### Modified files

| File | Change |
|------|--------|
| `src/stores/project-store.ts` | Remove `persist` middleware, add Firestore read/write actions |
| `src/app/layout.tsx` | Wrap with `AuthProvider` |
| `src/app/page.tsx` | Update redirect logic (auth check before /board) |
| `src/components/settings/data-manager.tsx` | Adapt JSON import/export for Firestore (batch write/read) |
| `src/components/settings/team-manager.tsx` | Add invite section |
| `package.json` | Add `firebase` SDK dependency |
| `src/types/index.ts` | Add `updatedBy` to Item, Firebase-related types |

### Unchanged files

- `src/stores/ui-store.ts` — stays localStorage
- `src/stores/gantt-store.ts` — stays ephemeral
- `src/lib/scheduler.ts`, `critical-path.ts`, `date-utils.ts`, `workload.ts` — pure functions, no storage dependency
- All UI components (board, gantt, workload, items) — read from store as before
- `next.config.ts` — stays `output: "export"`

## Migration Path

For existing users with data in localStorage:

1. On first authenticated load, check if `cadence-project` exists in localStorage
2. If yes and user has no Firestore project yet → offer to import localStorage data into Firestore
3. Write all items/team/sprints/overrides via batch write
4. Clear localStorage key after successful migration
5. If user declines or has no localStorage data → start fresh

## Future Considerations (Out of Scope)

- Multi-project support (change `projectId` to `projectIds[]` on users, add `/projects` page)
- Google sign-in as additional auth provider
- Role-based permissions (owner/editor/viewer)
- Cloud Functions for email notifications, scheduled tasks
- Activity log / audit trail
