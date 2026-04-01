"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useProjectStore } from "@/stores/project-store";
import {
  getLocalStorageProject,
  migrateToFirestore,
  clearLocalStorageProject,
} from "@/lib/migrate-localstorage";
import type { Project } from "@/types";

type MigrationState = "idle" | "prompting" | "migrating" | "done";

export function ProjectSync({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const initSync = useProjectStore((s) => s.initializeSync);
  const loading = useProjectStore((s) => s.loading);
  const project = useProjectStore((s) => s.project);
  const projectId = user?.projectId;
  const uid = user?.uid;

  const [migrationState, setMigrationState] = useState<MigrationState>("idle");
  const [localProject, setLocalProject] = useState<Project | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const checkedRef = useRef(false);

  // Depend on primitive strings (projectId, uid) — NOT the `user` object,
  // which is a new reference on every setUser call and would cause re-subscribes.
  useEffect(() => {
    if (!projectId || !uid) return;
    const unsubscribes = initSync(projectId, uid);
    return () => unsubscribes.forEach((unsub) => unsub());
  }, [projectId, uid, initSync]);

  // After Firestore finishes loading, check for localStorage data to migrate.
  // We use startTransition-style batching: both state updates happen in the same
  // synchronous block so React batches them into a single render.
  useEffect(() => {
    if (loading) return;
    if (migrationState !== "idle") return;
    if (checkedRef.current) return;
    checkedRef.current = true;

    // Only prompt if Firestore project is truly empty across all collections.
    // Checking only items would miss projects with team/sprints/overrides already set up.
    const hasData =
      project.items.length > 0 ||
      project.team.length > 0 ||
      project.sprints.length > 0 ||
      project.overrides.length > 0;

    if (hasData) {
      clearLocalStorageProject();
      setMigrationState("done");
      return;
    }

    const found = getLocalStorageProject();
    if (found) {
      // Batch both updates — React 18 batches setState calls in effects automatically
      setLocalProject(found);
      setMigrationState("prompting");
    } else {
      setMigrationState("done");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, project.items.length, project.team.length, project.sprints.length, project.overrides.length]);

  async function handleImport() {
    if (!localProject || !projectId) return;
    setMigrationState("migrating");
    setMigrationError(null);
    try {
      await migrateToFirestore(localProject, projectId);
      clearLocalStorageProject();
      setMigrationState("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setMigrationError(message);
      setMigrationState("prompting");
    }
  }

  function handleSkip() {
    clearLocalStorageProject();
    setMigrationState("done");
  }

  if (!projectId) return <>{children}</>; // No project yet — pass through (AuthGate handles redirect/no-project screen)

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

  return (
    <>
      {children}

      {migrationState === "prompting" && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg p-4">
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
              Import existing data?
            </p>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              We found existing project data on this device
              {localProject ? ` ("${localProject.name}", ${localProject.items.length} item${localProject.items.length !== 1 ? "s" : ""})` : ""}
              . Would you like to import it?
            </p>
            {migrationError && (
              <p className="text-xs text-red-500 mb-3">Import failed: {migrationError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleSkip}
                className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleImport}
                className="px-3 py-1.5 text-xs rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {migrationState === "migrating" && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin shrink-0" />
              <p className="text-sm text-[var(--text-primary)]">Importing data…</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
