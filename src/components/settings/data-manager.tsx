"use client";
import { useRef, useState } from "react";
import { useProjectStore } from "@/stores/project-store";
import { loadSeedData } from "@/lib/seed-data";
import { exportJSON, importJSON } from "@/lib/export";
import { Button } from "@/components/ui/button";

export function DataManager() {
  const project = useProjectStore((s) => s.project);
  const resetProject = useProjectStore((s) => s.resetProject);
  const importProject = useProjectStore((s) => s.importProject);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleLoadSample() {
    if (window.confirm("This will replace all current data. Continue?")) {
      loadSeedData();
    }
  }

  function handleReset() {
    if (confirmReset) {
      resetProject();
      setConfirmReset(false);
    } else {
      setConfirmReset(true);
    }
  }

  function handleExportJSON() {
    exportJSON(project);
  }

  async function handleImportJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    try {
      const imported = await importJSON(file);
      if (window.confirm("This will replace all current project data with the imported file. Continue?")) {
        importProject(imported);
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
          <Button variant="secondary" size="sm" onClick={handleLoadSample}>
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
              >
                Cancel
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={handleReset}>
              {confirmReset ? "Confirm Reset" : "Reset Project"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
