import type { Firestore, DocumentData } from "firebase-admin/firestore";
import type { Project } from "@/types";
import {
  docToItem,
  docToTeamMember,
  docToSprint,
  docToOverride,
  serializeTimestamp,
} from "@/lib/firestore-converters";

/**
 * User-facing error for MCP tool handlers. The message is safe to show to an
 * assistant (and, transitively, to the end user) verbatim.
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

/**
 * Identical wording for "project doesn't exist" and "you're not a member" —
 * see `authorizeProjectAccess` below for why that's load-bearing, not
 * cosmetic.
 */
export const PROJECT_ACCESS_DENIED_MESSAGE = "Project not found, or you don't have access to it";

const NO_CURRENT_PROJECT_MESSAGE =
  "No project selected yet. Call list_projects to see the projects you belong to, then pass a projectId explicitly.";

function toGenericMessage(): ToolError {
  return new ToolError("Something went wrong while reading project data. Please try again.");
}

/**
 * Firestore treats "/" inside a document id as a path separator, so an
 * unvalidated, client-supplied id (e.g. a `projectId` tool argument) could
 * resolve `.doc(id)` to a *nested* document several segments down instead of
 * a top-level project — and a project member can write arbitrary fields
 * into their own project's subcollections, so a crafted nested doc could be
 * shaped to pass the `memberIds` check. Reject anything that isn't a plain,
 * single-segment id so a hostile id becomes a clean "not found" instead of
 * a path traversal. Mirrors `isSafeDocumentId` in `oauth/store.ts` — same
 * class of bug, same fix, kept local here since this module owns its own
 * Firestore access and shouldn't reach into the OAuth subsystem's internals.
 */
export function isSafeDocumentId(id: string): boolean {
  return (
    id.length > 0 && id.length <= 1500 && !id.includes("/") && id !== "." && id !== ".." && !/^__.*__$/.test(id)
  );
}

/**
 * Converts any thrown value into a `ToolError` safe to surface to an
 * assistant. `ToolError`s (deliberately user-facing) pass through unchanged;
 * anything else — a Firestore SDK error, a network failure, a bug — is
 * collapsed into a generic message so internals never leak.
 */
export function toToolError(err: unknown): ToolError {
  if (err instanceof ToolError) return err;
  return toGenericMessage();
}

/** Metadata read from a `projects/{projectId}` document. */
export interface ProjectMeta {
  id: string;
  name: string;
  deadline: string | null;
  ownerId: string;
  memberIds: string[];
  activeSprint: string | null;
  createdAt: string;
  updatedAt: string;
}

function toProjectMeta(id: string, data: DocumentData): ProjectMeta {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "Untitled project",
    deadline: typeof data.deadline === "string" ? data.deadline : null,
    ownerId: typeof data.ownerId === "string" ? data.ownerId : "",
    memberIds: Array.isArray(data.memberIds) ? (data.memberIds as string[]) : [],
    activeSprint: typeof data.activeSprint === "string" ? data.activeSprint : null,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

/**
 * THE SECURITY KEYSTONE of this connector.
 *
 * The Admin SDK bypasses Firestore security rules entirely, so this
 * membership check is the *only* thing standing between one user's board and
 * another's. Every tool handler must reach Firestore data through this
 * function (directly, or via `loadProjectSnapshot`, which calls it itself) —
 * there is no "internal" bypass path, and there must never be one.
 *
 * A non-member must not be able to distinguish "this project doesn't exist"
 * from "this project exists but isn't yours" — either case would let someone
 * probe for valid project ids. Both paths below throw the exact same
 * `ToolError` instance shape with the exact same message.
 */
export async function authorizeProjectAccess(
  db: Firestore,
  uid: string,
  projectId: string
): Promise<ProjectMeta> {
  // Same rejection, same message, whether the id is malformed or just
  // doesn't match a project the caller belongs to — an invalid shape must
  // not be a distinguishable "different" failure (no new oracle).
  if (!isSafeDocumentId(projectId)) {
    throw new ToolError(PROJECT_ACCESS_DENIED_MESSAGE);
  }

  const snap = await db.collection("projects").doc(projectId).get();
  const data = snap.exists ? snap.data() : undefined;
  const memberIds = data && Array.isArray(data.memberIds) ? (data.memberIds as unknown[]) : [];

  if (!data || !memberIds.includes(uid)) {
    throw new ToolError(PROJECT_ACCESS_DENIED_MESSAGE);
  }

  return toProjectMeta(snap.id, data);
}

/**
 * Reads the project the user currently has selected (`users/{uid}.projectId`),
 * or `null` if there isn't one. Does not check membership — callers that go
 * on to load project data must still authorize through
 * `authorizeProjectAccess` / `loadProjectSnapshot`.
 */
export async function getCurrentProjectId(db: Firestore, uid: string): Promise<string | null> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const projectId = snap.data()?.projectId;
  return typeof projectId === "string" && projectId.length > 0 ? projectId : null;
}

/**
 * Resolves which project a tool call should operate on: an explicit
 * `projectId` argument always wins; otherwise fall back to the user's
 * currently selected project; otherwise tell the assistant to call
 * `list_projects` first rather than guessing.
 */
export async function resolveProjectId(
  db: Firestore,
  uid: string,
  explicit?: string
): Promise<string> {
  if (explicit) return explicit;
  const current = await getCurrentProjectId(db, uid);
  if (current) return current;
  throw new ToolError(NO_CURRENT_PROJECT_MESSAGE);
}

/** Every project the user is a member of (owner or otherwise). */
export async function listProjectsForUser(db: Firestore, uid: string): Promise<ProjectMeta[]> {
  const snap = await db.collection("projects").where("memberIds", "array-contains", uid).get();
  return snap.docs.map((doc) => toProjectMeta(doc.id, doc.data()));
}

/**
 * Loads a full `Project` (items, team, sprints, overrides) for the given
 * project id, converted with the same converters the client app uses.
 *
 * Calls `authorizeProjectAccess` itself so there is no way to obtain a
 * `Project` snapshot without passing the membership check first — do not add
 * a code path that reads the subcollections directly.
 */
export async function loadProjectSnapshot(
  db: Firestore,
  uid: string,
  projectId: string
): Promise<Project> {
  const meta = await authorizeProjectAccess(db, uid, projectId);

  const projectRef = db.collection("projects").doc(projectId);
  const [itemsSnap, teamSnap, sprintsSnap, overridesSnap] = await Promise.all([
    projectRef.collection("items").get(),
    projectRef.collection("team").get(),
    projectRef.collection("sprints").get(),
    projectRef.collection("overrides").get(),
  ]);

  return {
    id: meta.id,
    name: meta.name,
    deadline: meta.deadline,
    items: itemsSnap.docs.map((doc) => docToItem(doc.data(), doc.id)),
    team: teamSnap.docs.map((doc) => docToTeamMember(doc.data(), doc.id)),
    overrides: overridesSnap.docs.map((doc) => docToOverride(doc.data(), doc.id)),
    sprints: sprintsSnap.docs.map((doc) => docToSprint(doc.data(), doc.id)),
    activeSprint: meta.activeSprint,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    ownerId: meta.ownerId,
    memberIds: meta.memberIds,
  };
}
