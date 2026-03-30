"use client";
import { useState, useMemo } from "react";
import { useProjectStore } from "@/stores/project-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ProjectSettings() {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);

  // Use key to reset local state when project changes externally
  const storeKey = useMemo(() => `${project.name}|${project.deadline}`, [project.name, project.deadline]);
  const [name, setName] = useState(project.name);
  const [deadline, setDeadline] = useState(project.deadline ?? "");

  // Reset local state when store changes (avoids setState-in-effect)
  const [prevKey, setPrevKey] = useState(storeKey);
  if (storeKey !== prevKey) {
    setPrevKey(storeKey);
    setName(project.name);
    setDeadline(project.deadline ?? "");
  }

  function handleNameBlur() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== project.name) {
      updateProject({ name: trimmed });
    } else {
      setName(project.name);
    }
  }

  function handleDeadlineChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setDeadline(val);
    updateProject({ deadline: val || null });
  }

  function handleClearDeadline() {
    setDeadline("");
    updateProject({ deadline: null });
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
        Project Configuration
      </h2>
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <Input
          id="project-name"
          label="Project Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
          placeholder="Enter project name"
        />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="project-deadline"
            className="text-sm font-medium text-[var(--text-secondary)]"
          >
            Project Deadline
          </label>
          <div className="flex items-center gap-2">
            <input
              id="project-deadline"
              type="date"
              value={deadline}
              onChange={handleDeadlineChange}
              className="w-full px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-colors duration-150"
            />
            {deadline && (
              <Button variant="ghost" size="sm" onClick={handleClearDeadline}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
