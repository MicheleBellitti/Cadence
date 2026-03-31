import type { DocumentData, Timestamp } from "firebase/firestore";
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
