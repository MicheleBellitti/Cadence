"use client";

import { useState } from "react";
import { useSprints, useItems, useProjectStore } from "@/stores/project-store";
import type { Sprint, SprintStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { BadgeVariant } from "@/components/ui/badge";

function statusBadgeVariant(status: SprintStatus): BadgeVariant {
  if (status === "active") return "success";
  if (status === "planning") return "blue";
  return "default";
}

function statusLabel(status: SprintStatus): string {
  if (status === "active") return "Active";
  if (status === "planning") return "Planning";
  return "Completed";
}

function formatDateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate && !endDate) return "—";
  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (startDate && endDate) return `${fmt(startDate)} – ${fmt(endDate)}`;
  if (startDate) return `From ${fmt(startDate)}`;
  return `Until ${fmt(endDate!)}`;
}

interface EditFormState {
  name: string;
  goal: string;
}

interface SprintRowProps {
  sprint: Sprint;
  itemCount: number;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (data: EditFormState) => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
}

function SprintRow({
  sprint,
  itemCount,
  isEditing,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  canEdit,
  canDelete,
}: SprintRowProps) {
  const [form, setForm] = useState<EditFormState>({ name: sprint.name, goal: sprint.goal });
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSaveEdit({ name: form.name.trim(), goal: form.goal.trim() });
  }

  if (isEditing) {
    return (
      <form
        onSubmit={handleSubmit}
        className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-4 space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <Input
            id={`sprint-name-${sprint.id}`}
            label="Sprint Name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Sprint 3"
            required
          />
          <Input
            id={`sprint-goal-${sprint.id}`}
            label="Goal"
            value={form.goal}
            onChange={(e) => setForm((prev) => ({ ...prev, goal: e.target.value }))}
            placeholder="e.g. Ship authentication"
          />
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm">
            Save
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
            {sprint.name}
          </span>
          <Badge variant={statusBadgeVariant(sprint.status)}>
            {statusLabel(sprint.status)}
          </Badge>
        </div>
        {sprint.goal && (
          <p className="text-xs text-[var(--text-secondary)] truncate">{sprint.goal}</p>
        )}
        <p className="text-xs text-[var(--text-secondary)]">
          {formatDateRange(sprint.startDate, sprint.endDate)}
          {" · "}
          {itemCount} item{itemCount !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
        )}
        {canDelete && (
          confirmDelete ? (
            <>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete();
                }}
              >
                Confirm
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-[var(--danger)] hover:text-[var(--danger)]"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          )
        )}
      </div>
    </div>
  );
}

export function SprintManager() {
  const sprints = useSprints();
  const items = useItems();
  const updateSprint = useProjectStore((s) => s.updateSprint);
  const deleteSprint = useProjectStore((s) => s.deleteSprint);

  const [editingId, setEditingId] = useState<string | null>(null);

  // Item count per sprint
  const itemCountBySprint = new Map<string, number>();
  for (const item of items) {
    if (item.sprintId) {
      itemCountBySprint.set(item.sprintId, (itemCountBySprint.get(item.sprintId) ?? 0) + 1);
    }
  }

  // Sort: active first, then planning, then completed
  const statusOrder: Record<SprintStatus, number> = { active: 0, planning: 1, completed: 2 };
  const sorted = [...sprints].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  function handleSaveEdit(id: string, data: EditFormState) {
    updateSprint(id, data);
    setEditingId(null);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Sprint Management</h2>
      </div>

      <div className="space-y-2">
        {sorted.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)] py-4 text-center bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl">
            No sprints yet. Create one from the Board page.
          </p>
        )}

        {sorted.map((sprint) => {
          const count = itemCountBySprint.get(sprint.id) ?? 0;
          const canEdit = sprint.status === "planning" || sprint.status === "active";
          const canDelete = sprint.status === "planning" && count === 0;

          return (
            <SprintRow
              key={sprint.id}
              sprint={sprint}
              itemCount={count}
              isEditing={editingId === sprint.id}
              onEdit={() => setEditingId(sprint.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(data) => handleSaveEdit(sprint.id, data)}
              onDelete={() => deleteSprint(sprint.id)}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          );
        })}
      </div>

      <p className="mt-3 text-xs text-[var(--text-secondary)]">
        To start or complete sprints, use the Board page.
      </p>
    </section>
  );
}
