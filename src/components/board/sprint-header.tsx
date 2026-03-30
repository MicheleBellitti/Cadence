"use client";

import { useState, useMemo } from "react";
import { Plus, Play, CheckCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  useProjectStore,
  useSprints,
  useActiveSprint,
  useItems,
} from "@/stores/project-store";
import type { SprintStatus } from "@/types";

interface SprintHeaderProps {
  onFilterChange: (sprintId: string | null | "all") => void;
  currentFilter: string | null | "all";
  onCompleteSprint: (sprintId: string) => void;
}

const STATUS_BADGE_VARIANT: Record<SprintStatus, "success" | "blue" | "default"> = {
  active: "success",
  planning: "blue",
  completed: "default",
};

const STATUS_LABEL: Record<SprintStatus, string> = {
  active: "Active",
  planning: "Planning",
  completed: "Completed",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SprintHeader({ onFilterChange, currentFilter, onCompleteSprint }: SprintHeaderProps) {
  const sprints = useSprints();
  const activeSprint = useActiveSprint();
  const items = useItems();

  const addSprint = useProjectStore((s) => s.addSprint);
  const startSprint = useProjectStore((s) => s.startSprint);
  const deleteSprint = useProjectStore((s) => s.deleteSprint);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGoal, setNewGoal] = useState("");

  // Sort sprints: active first, then planning, then completed
  const sortedSprints = useMemo(() => {
    const order: Record<SprintStatus, number> = { active: 0, planning: 1, completed: 2 };
    return [...sprints].sort((a, b) => order[a.status] - order[b.status]);
  }, [sprints]);

  // Build filter options
  const filterOptions = useMemo(() => {
    const opts = [{ value: "all", label: "All Items" }, { value: "__backlog__", label: "Backlog" }];
    for (const sp of sortedSprints) {
      opts.push({
        value: sp.id,
        label: `${sp.name} (${STATUS_LABEL[sp.status]})`,
      });
    }
    return opts;
  }, [sortedSprints]);

  // Selected sprint (for info display)
  const selectedSprint = useMemo(() => {
    if (currentFilter === "all" || currentFilter === null) return null;
    return sprints.find((sp) => sp.id === currentFilter) ?? null;
  }, [sprints, currentFilter]);

  // Item stats for selected sprint
  const sprintStats = useMemo(() => {
    if (!selectedSprint) return null;
    const sprintItems = items.filter((i) => i.sprintId === selectedSprint.id);
    const totalPoints = sprintItems.reduce((sum, i) => {
      if (i.type === "story") return sum + i.storyPoints;
      return sum;
    }, 0);
    return {
      count: sprintItems.length,
      points: totalPoints,
    };
  }, [items, selectedSprint]);

  const hasActiveSprint = !!activeSprint;

  function handleCreateSprint() {
    if (!newName.trim()) return;
    addSprint(newName.trim(), newGoal.trim() || undefined);
    setNewName("");
    setNewGoal("");
    setShowCreateForm(false);
  }

  function handleStartSprint(id: string) {
    startSprint(id);
  }

  function handleDeleteSprint(id: string) {
    deleteSprint(id);
    if (currentFilter === id) {
      onFilterChange("all");
    }
  }

  // Map filter value for the Select (null -> "__backlog__")
  const selectValue = currentFilter === null ? "__backlog__" : (currentFilter ?? "all");

  function handleFilterSelect(value: string) {
    if (value === "__backlog__") {
      onFilterChange(null);
    } else {
      onFilterChange(value);
    }
  }

  return (
    <div className="flex flex-col gap-2 px-6 py-3 border-b border-[var(--border)]">
      <div className="flex items-center gap-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-4 py-2.5">
        {/* Left: Sprint selector */}
        <div className="shrink-0">
          <Select
            options={filterOptions}
            value={selectValue}
            onChange={(e) => handleFilterSelect(e.target.value)}
            className="max-w-[220px]"
          />
        </div>

        {/* Center: Sprint info */}
        <div className="flex-1 flex items-center gap-3 min-w-0">
          {selectedSprint && (
            <>
              <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {selectedSprint.name}
              </span>
              <Badge variant={STATUS_BADGE_VARIANT[selectedSprint.status]}>
                {STATUS_LABEL[selectedSprint.status]}
              </Badge>
              {selectedSprint.goal && (
                <span className="text-xs text-[var(--text-secondary)] truncate">
                  {selectedSprint.goal}
                </span>
              )}
              {selectedSprint.startDate && selectedSprint.endDate && (
                <span className="text-xs text-[var(--text-secondary)] shrink-0">
                  {formatDate(selectedSprint.startDate)} &mdash; {formatDate(selectedSprint.endDate)}
                </span>
              )}
              {sprintStats && (
                <span className="text-xs text-[var(--text-secondary)] shrink-0">
                  {sprintStats.count} items &middot; {sprintStats.points} pts
                </span>
              )}
            </>
          )}
          {!selectedSprint && currentFilter === null && (
            <span className="text-sm text-[var(--text-secondary)]">
              Showing backlog items (no sprint assigned)
            </span>
          )}
          {!selectedSprint && currentFilter === "all" && (
            <span className="text-sm text-[var(--text-secondary)]">
              Showing all items across all sprints
            </span>
          )}
        </div>

        {/* Right: Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {selectedSprint?.status === "planning" && (
            <>
              <Button
                size="sm"
                variant="primary"
                disabled={hasActiveSprint}
                onClick={() => handleStartSprint(selectedSprint.id)}
                title={hasActiveSprint ? "Another sprint is already active" : "Start Sprint"}
              >
                <Play size={14} className="mr-1" />
                Start Sprint
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDeleteSprint(selectedSprint.id)}
                className="text-[var(--danger)] hover:text-[var(--danger)]"
              >
                <Trash2 size={14} className="mr-1" />
                Delete
              </Button>
            </>
          )}
          {selectedSprint?.status === "active" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onCompleteSprint(selectedSprint.id)}
              className="border-[var(--warning)] text-[var(--warning)]"
            >
              <CheckCircle size={14} className="mr-1" />
              Complete Sprint
            </Button>
          )}
          {selectedSprint?.status === "completed" && (
            <Badge variant="default">Completed</Badge>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowCreateForm((v) => !v)}
            title="Create Sprint"
          >
            <Plus size={14} className="mr-1" />
            New Sprint
          </Button>
        </div>
      </div>

      {/* Inline create form */}
      {showCreateForm && (
        <div className="flex items-end gap-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-4 py-3">
          <Input
            id="sprint-name"
            label="Sprint Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Sprint 1"
            required
          />
          <Input
            id="sprint-goal"
            label="Goal (optional)"
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            placeholder="Sprint goal..."
          />
          <Button size="sm" variant="primary" onClick={handleCreateSprint} disabled={!newName.trim()}>
            Create
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setShowCreateForm(false);
              setNewName("");
              setNewGoal("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export { SprintHeader };
export type { SprintHeaderProps };
