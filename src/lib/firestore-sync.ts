import {
  collection,
  doc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  type Firestore,
  type DocumentData,
  type Unsubscribe,
  type Timestamp,
} from "firebase/firestore";
import type { Item, TeamMember, Sprint, GanttOverride, Invite } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalize an email for use as part of a Firestore document ID.
 * Lowercases only — Firebase Auth already normalizes to lowercase, and the
 * security rules use `request.auth.token.email` directly, so the doc ID must
 * match the raw email.
 */
export function normalizeEmailForDocId(email: string): string {
  return email.toLowerCase();
}

/**
 * Convert a Firestore Timestamp (or string, or null) to an ISO string.
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
 * Convert a Firestore document snapshot to a typed Item.
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

// ─── Realtime Listeners ──────────────────────────────────────────────────────

export interface SyncCallbacks {
  onProjectUpdate: (data: {
    name?: string;
    deadline?: string | null;
    ownerId?: string;
    memberIds?: string[];
    activeSprint?: string | null;
  }) => void;
  onItemsUpdate: (items: Item[]) => void;
  onTeamUpdate: (team: TeamMember[]) => void;
  onSprintsUpdate: (sprints: Sprint[]) => void;
  onOverridesUpdate: (overrides: GanttOverride[]) => void;
  onError: (error: Error) => void;
  onSyncStateChange: (loading: boolean, syncing: boolean) => void;
}

export function subscribeToProject(
  db: Firestore,
  projectId: string,
  callbacks: SyncCallbacks,
): Unsubscribe[] {
  const resolved = new Set<string>();
  const REQUIRED = ["project", "items", "team", "sprints", "overrides"];

  function checkReady(name: string, fromCache: boolean) {
    resolved.add(name);
    const allResolved = REQUIRED.every((r) => resolved.has(r));
    callbacks.onSyncStateChange(!allResolved, fromCache);
  }

  // 1. Project document listener
  const unsubProject = onSnapshot(
    doc(db, "projects", projectId),
    (snapshot) => {
      const data = snapshot.data();
      if (data) {
        callbacks.onProjectUpdate({
          name: data.name,
          deadline: data.deadline ?? null,
          ownerId: data.ownerId,
          memberIds: data.memberIds,
          activeSprint: data.activeSprint ?? null,
        });
      }
      checkReady("project", snapshot.metadata.fromCache);
    },
    (error) => callbacks.onError(error),
  );

  // 2. Items collection listener
  const unsubItems = onSnapshot(
    collection(db, "projects", projectId, "items"),
    (snapshot) => {
      const items = snapshot.docs.map((d) => docToItem(d.data(), d.id));
      callbacks.onItemsUpdate(items);
      checkReady("items", snapshot.metadata.fromCache);
    },
    (error) => callbacks.onError(error),
  );

  // 3. Team collection listener
  const unsubTeam = onSnapshot(
    collection(db, "projects", projectId, "team"),
    (snapshot) => {
      const team = snapshot.docs.map((d) => docToTeamMember(d.data(), d.id));
      callbacks.onTeamUpdate(team);
      checkReady("team", snapshot.metadata.fromCache);
    },
    (error) => callbacks.onError(error),
  );

  // 4. Sprints collection listener
  const unsubSprints = onSnapshot(
    collection(db, "projects", projectId, "sprints"),
    (snapshot) => {
      const sprints = snapshot.docs.map((d) => docToSprint(d.data(), d.id));
      callbacks.onSprintsUpdate(sprints);
      checkReady("sprints", snapshot.metadata.fromCache);
    },
    (error) => callbacks.onError(error),
  );

  // 5. Overrides collection listener
  const unsubOverrides = onSnapshot(
    collection(db, "projects", projectId, "overrides"),
    (snapshot) => {
      const overrides = snapshot.docs.map((d) => docToOverride(d.data(), d.id));
      callbacks.onOverridesUpdate(overrides);
      checkReady("overrides", snapshot.metadata.fromCache);
    },
    (error) => callbacks.onError(error),
  );

  return [unsubProject, unsubItems, unsubTeam, unsubSprints, unsubOverrides];
}

// ─── Write Operations ────────────────────────────────────────────────────────

/**
 * Create a new project document.
 */
export async function firestoreCreateProject(
  db: Firestore,
  projectId: string,
  name: string,
  ownerUid: string,
): Promise<void> {
  await setDoc(doc(db, "projects", projectId), {
    name,
    deadline: null,
    ownerId: ownerUid,
    memberIds: [ownerUid],
    activeSprint: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update project metadata (name, deadline).
 */
export async function firestoreUpdateProject(
  db: Firestore,
  projectId: string,
  updates: Partial<{ name: string; deadline: string | null }>,
): Promise<void> {
  await updateDoc(
    doc(db, "projects", projectId),
    stripUndefined({
      ...updates,
      updatedAt: serverTimestamp(),
    }),
  );
}

// ─── Item CRUD ───────────────────────────────────────────────────────────────

/**
 * Add a new item. Auto-generates doc ID. Returns the new ID.
 */
export async function firestoreAddItem(
  db: Firestore,
  projectId: string,
  item: Omit<Item, "id"> & { id?: string },
  uid: string,
): Promise<string> {
  const ref = item.id
    ? doc(db, "projects", projectId, "items", item.id)
    : doc(collection(db, "projects", projectId, "items"));
  const { id: _id, ...data } = item;
  await setDoc(
    ref,
    stripUndefined({
      ...data,
      updatedBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  return ref.id;
}

/**
 * Update an existing item with partial data.
 */
export async function firestoreUpdateItem(
  db: Firestore,
  projectId: string,
  itemId: string,
  updates: Partial<Item>,
  uid: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...rest } = updates as Partial<Item> & { id?: string };
  await updateDoc(
    doc(db, "projects", projectId, "items", itemId),
    stripUndefined({
      ...rest,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    }),
  );
}

/**
 * Delete an item and all its descendants, plus related overrides.
 * Also removes deleted IDs from other items' dependencies arrays.
 */
export async function firestoreDeleteItem(
  db: Firestore,
  projectId: string,
  itemId: string,
  allItems: Item[],
  allOverrides: GanttOverride[],
): Promise<void> {
  const toDelete = collectDescendantIds(itemId, allItems);
  const batch = writeBatch(db);

  // Delete item docs
  for (const id of toDelete) {
    batch.delete(doc(db, "projects", projectId, "items", id));
  }

  // Delete matching override docs
  for (const override of allOverrides) {
    if (toDelete.has(override.itemId)) {
      batch.delete(doc(db, "projects", projectId, "overrides", override.itemId));
    }
  }

  // Update other items to remove deleted IDs from their dependencies
  for (const item of allItems) {
    if (toDelete.has(item.id)) continue;
    const filtered = item.dependencies.filter((depId) => !toDelete.has(depId));
    if (filtered.length !== item.dependencies.length) {
      batch.update(doc(db, "projects", projectId, "items", item.id), {
        dependencies: filtered,
        updatedAt: serverTimestamp(),
      });
    }
  }

  await batch.commit();
}

/**
 * Move an item to a new status.
 */
export async function firestoreMoveItem(
  db: Firestore,
  projectId: string,
  itemId: string,
  status: string,
  uid: string,
): Promise<void> {
  await updateDoc(doc(db, "projects", projectId, "items", itemId), {
    status,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update an item's order.
 */
export async function firestoreReorderItem(
  db: Firestore,
  projectId: string,
  itemId: string,
  newOrder: number,
  uid: string,
): Promise<void> {
  await updateDoc(doc(db, "projects", projectId, "items", itemId), {
    order: newOrder,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
}

// ─── Dependencies ────────────────────────────────────────────────────────────

export async function firestoreAddDependency(
  db: Firestore,
  projectId: string,
  itemId: string,
  currentDeps: string[],
  dependsOnId: string,
  uid: string,
): Promise<void> {
  await updateDoc(doc(db, "projects", projectId, "items", itemId), {
    dependencies: [...currentDeps, dependsOnId],
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
}

export async function firestoreRemoveDependency(
  db: Firestore,
  projectId: string,
  itemId: string,
  currentDeps: string[],
  dependsOnId: string,
  uid: string,
): Promise<void> {
  await updateDoc(doc(db, "projects", projectId, "items", itemId), {
    dependencies: currentDeps.filter((d) => d !== dependsOnId),
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
}

// ─── Sprint Assignment ───────────────────────────────────────────────────────

export async function firestoreAssignToSprint(
  db: Firestore,
  projectId: string,
  itemId: string,
  sprintId: string | null,
  uid: string,
): Promise<void> {
  await updateDoc(doc(db, "projects", projectId, "items", itemId), {
    sprintId,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
}

// ─── Team CRUD ───────────────────────────────────────────────────────────────

export async function firestoreAddTeamMember(
  db: Firestore,
  projectId: string,
  member: Omit<TeamMember, "id"> & { id?: string },
): Promise<string> {
  const ref = member.id
    ? doc(db, "projects", projectId, "team", member.id)
    : doc(collection(db, "projects", projectId, "team"));
  const { id: _id, ...data } = member;
  await setDoc(ref, stripUndefined({ ...data }));
  return ref.id;
}

export async function firestoreUpdateTeamMember(
  db: Firestore,
  projectId: string,
  memberId: string,
  updates: Partial<TeamMember>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...rest } = updates as Partial<TeamMember> & { id?: string };
  await updateDoc(
    doc(db, "projects", projectId, "team", memberId),
    stripUndefined({ ...rest }),
  );
}

export async function firestoreRemoveTeamMember(
  db: Firestore,
  projectId: string,
  memberId: string,
  allItems: Item[],
): Promise<void> {
  const batch = writeBatch(db);

  // Delete the team member doc
  batch.delete(doc(db, "projects", projectId, "team", memberId));

  // Update items that reference this member in assigneeIds
  for (const item of allItems) {
    if (item.assigneeIds.includes(memberId)) {
      batch.update(doc(db, "projects", projectId, "items", item.id), {
        assigneeIds: item.assigneeIds.filter((id) => id !== memberId),
        updatedAt: serverTimestamp(),
      });
    }
  }

  await batch.commit();
}

// ─── Sprint CRUD ─────────────────────────────────────────────────────────────

export async function firestoreAddSprint(
  db: Firestore,
  projectId: string,
  sprint: Omit<Sprint, "id"> & { id?: string },
): Promise<string> {
  const ref = sprint.id
    ? doc(db, "projects", projectId, "sprints", sprint.id)
    : doc(collection(db, "projects", projectId, "sprints"));
  const { id: _id, ...data } = sprint;
  await setDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function firestoreUpdateSprint(
  db: Firestore,
  projectId: string,
  sprintId: string,
  updates: Partial<Sprint>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...rest } = updates as Partial<Sprint> & { id?: string };
  await updateDoc(
    doc(db, "projects", projectId, "sprints", sprintId),
    stripUndefined({
      ...rest,
      updatedAt: serverTimestamp(),
    }),
  );
}

export async function firestoreDeleteSprint(
  db: Firestore,
  projectId: string,
  sprintId: string,
  allItems: Item[],
): Promise<void> {
  const batch = writeBatch(db);

  // Delete the sprint doc
  batch.delete(doc(db, "projects", projectId, "sprints", sprintId));

  // Set sprintId to null on items in this sprint
  for (const item of allItems) {
    if (item.sprintId === sprintId) {
      batch.update(doc(db, "projects", projectId, "items", item.id), {
        sprintId: null,
        updatedAt: serverTimestamp(),
      });
    }
  }

  await batch.commit();
}

export async function firestoreStartSprint(
  db: Firestore,
  projectId: string,
  sprintId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  const batch = writeBatch(db);

  // Update sprint status and dates
  batch.update(doc(db, "projects", projectId, "sprints", sprintId), {
    status: "active",
    startDate,
    endDate,
    updatedAt: serverTimestamp(),
  });

  // Set project's activeSprint
  batch.update(doc(db, "projects", projectId), {
    activeSprint: sprintId,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function firestoreCompleteSprint(
  db: Firestore,
  projectId: string,
  sprintId: string,
  allItems: Item[],
  moveIncomplete: "next" | "backlog",
  allSprints: Sprint[],
): Promise<void> {
  const batch = writeBatch(db);

  // Mark sprint as completed
  batch.update(doc(db, "projects", projectId, "sprints", sprintId), {
    status: "completed",
    updatedAt: serverTimestamp(),
  });

  // Clear project's activeSprint
  batch.update(doc(db, "projects", projectId), {
    activeSprint: null,
    updatedAt: serverTimestamp(),
  });

  // Find incomplete items in this sprint
  const incompleteItems = allItems.filter(
    (item) => item.sprintId === sprintId && item.status !== "done",
  );

  if (incompleteItems.length > 0) {
    // Find the next planning sprint if moving to next
    let targetSprintId: string | null = null;
    if (moveIncomplete === "next") {
      const nextSprint = allSprints.find((s) => s.status === "planning");
      targetSprintId = nextSprint?.id ?? null;
    }

    for (const item of incompleteItems) {
      batch.update(doc(db, "projects", projectId, "items", item.id), {
        sprintId: targetSprintId,
        updatedAt: serverTimestamp(),
      });
    }
  }

  await batch.commit();
}

// ─── Overrides ───────────────────────────────────────────────────────────────

export async function firestoreSetOverride(
  db: Firestore,
  projectId: string,
  itemId: string,
  startDate: string,
): Promise<void> {
  await setDoc(
    doc(db, "projects", projectId, "overrides", itemId),
    { startDate },
    { merge: true },
  );
}

export async function firestoreRemoveOverride(
  db: Firestore,
  projectId: string,
  itemId: string,
): Promise<void> {
  await deleteDoc(doc(db, "projects", projectId, "overrides", itemId));
}
