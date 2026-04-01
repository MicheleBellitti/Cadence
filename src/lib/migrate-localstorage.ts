import { writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { firestoreUpdateProject } from "./firestore-sync";
import { projectSchema } from "./validators";
import type { Project } from "@/types";

/**
 * Check if there is old localStorage data to migrate.
 * Returns the parsed Project if valid, null otherwise.
 */
export function getLocalStorageProject(): Project | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem("cadence-project");
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const projectData = parsed?.state?.project;
    if (!projectData) return null;

    // Run migration for old assigneeId -> assigneeIds (same as old persist merge)
    if (projectData.items) {
      projectData.items = projectData.items.map((item: Record<string, unknown>) => {
        if (!("assigneeIds" in item)) {
          const oldId = item.assigneeId as string | null;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { assigneeId: _assigneeId, ...rest } = item;
          return { ...rest, assigneeIds: oldId ? [oldId] : [] };
        }
        if (!Array.isArray(item.assigneeIds)) {
          return { ...item, assigneeIds: [] };
        }
        return item;
      });
      if (!projectData.sprints) projectData.sprints = [];
      if (projectData.activeSprint === undefined) projectData.activeSprint = null;
    }

    // Validate with Zod
    const result = projectSchema.safeParse(projectData);
    if (!result.success) {
      console.warn("localStorage data failed validation:", result.error.issues.slice(0, 3));
      return null;
    }

    return result.data as Project;
  } catch {
    return null;
  }
}

/**
 * Migrate a localStorage project to Firestore.
 * Writes all items, team, sprints, overrides as sub-collection docs.
 * Splits into multiple batches if there are more than 400 ops to stay
 * safely under Firestore's 500-operation batch limit.
 */
export async function migrateToFirestore(project: Project, projectId: string): Promise<void> {
  const BATCH_LIMIT = 400;

  // Collect all (ref, data) tuples to write
  type SetOp = { path: string[]; data: Record<string, unknown> };
  const setOps: SetOp[] = [];

  for (const item of project.items) {
    const { id, ...data } = item;
    setOps.push({
      path: ["projects", projectId, "items", id],
      data: { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }

  for (const member of project.team) {
    const { id, ...data } = member;
    setOps.push({
      path: ["projects", projectId, "team", id],
      data: { ...data },
    });
  }

  for (const sprint of project.sprints) {
    const { id, ...data } = sprint;
    setOps.push({
      path: ["projects", projectId, "sprints", id],
      data: { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }

  for (const override of project.overrides) {
    setOps.push({
      path: ["projects", projectId, "overrides", override.itemId],
      data: { startDate: override.startDate },
    });
  }

  // Flush in chunks of BATCH_LIMIT
  for (let i = 0; i < setOps.length; i += BATCH_LIMIT) {
    const chunk = setOps.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const op of chunk) {
      const [col, colId, subCol, subId] = op.path;
      const ref = subCol
        ? doc(db, col, colId, subCol, subId)
        : doc(db, col, colId);
      batch.set(ref, op.data);
    }
    await batch.commit();
  }

  // Update project metadata
  await firestoreUpdateProject(db, projectId, {
    name: project.name,
    deadline: project.deadline,
  });
}

/**
 * Clear the old localStorage data after successful migration.
 */
export function clearLocalStorageProject(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("cadence-project");
}
