"use client";
import { useRef, useState } from "react";
import { writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProjectStore, useProjectId } from "@/stores/project-store";
import { useAuth } from "@/components/auth/auth-provider";
import { firestoreUpdateProject } from "@/lib/firestore-sync";
import { loadSeedData } from "@/lib/seed-data";
import { exportJSON, importJSON } from "@/lib/export";
import { Button } from "@/components/ui/button";
import type { Project } from "@/types";

export function DataManager() {
  const project = useProjectStore((s) => s.project);
  const projectId = useProjectId();
  const { user } = useAuth();
  const [confirmReset, setConfirmReset] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleLoadSample() {
    if (!projectId) return;
    if (window.confirm("This will replace all current data. Continue?")) {
      setLoading(true);
      try {
        // Delete all existing sub-collection docs first
        await deleteAllProjectData(projectId, project);
        // Write seed data to Firestore
        await loadSeedData(projectId);
      } catch (err) {
        console.error("Failed to load sample data:", err);
        alert("Failed to load sample data. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleReset() {
    if (!projectId) return;
    if (confirmReset) {
      setLoading(true);
      try {
        await deleteAllProjectData(projectId, project);
        await firestoreUpdateProject(db, projectId, { name: "My Project", deadline: null });
        setConfirmReset(false);
      } catch (err) {
        console.error("Failed to reset project:", err);
        alert("Failed to reset project. Please try again.");
      } finally {
        setLoading(false);
      }
    } else {
      setConfirmReset(true);
    }
  }

  function handleExportJSON() {
    exportJSON(project);
  }

  async function handleImportJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;

    setImportError(null);
    try {
      const imported = await importJSON(file);
      if (window.confirm("This will replace all current project data with the imported file. Continue?")) {
        setLoading(true);
        try {
          // Delete all existing sub-collection docs
          await deleteAllProjectData(projectId, project);
          // Write imported data to Firestore
          await writeProjectDataToFirestore(projectId, imported, user?.uid ?? "");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setImportError(`Import failed: ${message}`);
          alert(`Import failed: ${message}`);
        } finally {
          setLoading(false);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setImportError(`Import failed: ${message}`);
      alert(`Import failed: ${message}`);
    } finally {
      // Reset file input so the same file can be re-imported if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
        Data Management
      </h2>
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        {/* Load Sample Data */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Load Sample Data
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Replace current project with a realistic sample project to explore the app.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleLoadSample} disabled={loading}>
            Load Sample
          </Button>
        </div>

        <div className="border-t border-[var(--border)]" />

        {/* Export JSON */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Export JSON
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Download the current project as a JSON file for backup or transfer.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleExportJSON}>
            Export JSON
          </Button>
        </div>

        <div className="border-t border-[var(--border)]" />

        {/* Import JSON */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Import JSON
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Load a previously exported project JSON file. The current project will be replaced.
            </p>
            {importError && (
              <p className="text-xs text-[var(--danger)] mt-1">{importError}</p>
            )}
          </div>
          <div className="flex-shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportJSON}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              Import JSON
            </Button>
          </div>
        </div>

        <div className="border-t border-[var(--border)]" />

        {/* Reset Project */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--danger)]">
              Reset Project
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Permanently delete all project data and start fresh. This cannot be undone.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {confirmReset && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmReset(false)}
                disabled={loading}
              >
                Cancel
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={handleReset} disabled={loading}>
              {confirmReset ? "Confirm Reset" : "Reset Project"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BATCH_LIMIT = 499;

/**
 * Delete all sub-collection documents for the given project.
 * Uses multiple batches if needed to stay within the 500-op Firestore limit.
 */
async function deleteAllProjectData(projectId: string, project: Project): Promise<void> {
  let batch = writeBatch(db);
  let count = 0;
  const batches: ReturnType<typeof writeBatch>[] = [batch];

  function addDelete(col: string, id: string) {
    if (count >= BATCH_LIMIT) {
      batch = writeBatch(db);
      batches.push(batch);
      count = 0;
    }
    batch.delete(doc(db, "projects", projectId, col, id));
    count++;
  }

  for (const item of project.items) addDelete("items", item.id);
  for (const member of project.team) addDelete("team", member.id);
  for (const sprint of project.sprints) addDelete("sprints", sprint.id);
  for (const override of project.overrides) addDelete("overrides", override.itemId);

  await Promise.all(batches.map((b) => b.commit()));
}

/**
 * Write all entities from an imported Project to Firestore.
 * Uses multiple batches if needed to stay within the 500-op limit.
 */
async function writeProjectDataToFirestore(
  projectId: string,
  project: Project,
  uid: string,
): Promise<void> {
  let batch = writeBatch(db);
  let count = 0;
  const batches: ReturnType<typeof writeBatch>[] = [batch];

  function addSet(col: string, id: string, data: Record<string, unknown>) {
    if (count >= BATCH_LIMIT) {
      batch = writeBatch(db);
      batches.push(batch);
      count = 0;
    }
    batch.set(doc(db, "projects", projectId, col, id), data);
    count++;
  }

  // Write items
  for (const item of project.items) {
    const { id, ...data } = item;
    addSet("items", id, {
      ...data,
      updatedBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // Write team members
  for (const member of project.team) {
    const { id, ...data } = member;
    addSet("team", id, data);
  }

  // Write sprints
  for (const sprint of project.sprints) {
    const { id, ...data } = sprint;
    addSet("sprints", id, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // Write overrides
  for (const override of project.overrides) {
    addSet("overrides", override.itemId, { startDate: override.startDate });
  }

  await Promise.all(batches.map((b) => b.commit()));

  // Update project metadata
  await firestoreUpdateProject(db, projectId, {
    name: project.name,
    deadline: project.deadline,
  });
}
