"use client";

import { useMemo } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useProjectStore,
  useSprints,
  useItems,
  useTeam,
} from "@/stores/project-store";
import type { ItemType } from "@/types";

interface SprintCompleteModalProps {
  open: boolean;
  onClose: () => void;
  sprintId: string;
}

const TYPE_BADGE_VARIANT: Record<ItemType, "purple" | "blue" | "success" | "danger"> = {
  epic: "purple",
  story: "blue",
  task: "success",
  bug: "danger",
};

const TYPE_LABEL: Record<ItemType, string> = {
  epic: "Epic",
  story: "Story",
  task: "Task",
  bug: "Bug",
};

function SprintCompleteModal({ open, onClose, sprintId }: SprintCompleteModalProps) {
  const sprints = useSprints();
  const items = useItems();
  const team = useTeam();
  const completeSprint = useProjectStore((s) => s.completeSprint);

  const sprint = useMemo(
    () => sprints.find((sp) => sp.id === sprintId) ?? null,
    [sprints, sprintId]
  );

  const sprintItems = useMemo(
    () => items.filter((i) => i.sprintId === sprintId),
    [items, sprintId]
  );

  const completedItems = useMemo(
    () => sprintItems.filter((i) => i.status === "done"),
    [sprintItems]
  );

  const incompleteItems = useMemo(
    () => sprintItems.filter((i) => i.status !== "done"),
    [sprintItems]
  );

  const hasNextSprint = useMemo(
    () => sprints.some((sp) => sp.status === "planning"),
    [sprints]
  );

  function getAssigneeName(assigneeId: string | null): string | null {
    if (!assigneeId) return null;
    return team.find((m) => m.id === assigneeId)?.name ?? null;
  }

  function handleMoveToNext() {
    completeSprint(sprintId, "next");
    onClose();
  }

  function handleMoveToBacklog() {
    completeSprint(sprintId, "backlog");
    onClose();
  }

  if (!sprint) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Complete Sprint: ${sprint.name}`}
      width="max-w-xl"
    >
      <div className="flex flex-col gap-4">
        {/* Summary */}
        <div className="flex items-center gap-4 p-3 bg-[var(--bg-elevated)] rounded-lg">
          <div className="flex flex-col items-center flex-1">
            <span className="text-2xl font-bold text-[var(--success)]">
              {completedItems.length}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">Completed</span>
          </div>
          <div className="w-px h-8 bg-[var(--border)]" />
          <div className="flex flex-col items-center flex-1">
            <span className="text-2xl font-bold text-[var(--warning)]">
              {incompleteItems.length}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">Incomplete</span>
          </div>
        </div>

        {/* Incomplete items list */}
        {incompleteItems.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-[var(--text-secondary)]">
              Incomplete Items
            </h3>
            <div className="max-h-48 overflow-y-auto flex flex-col gap-1 border border-[var(--border)] rounded-lg">
              {incompleteItems.map((item) => {
                const assigneeName = getAssigneeName(item.assigneeId);
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] last:border-b-0"
                  >
                    <Badge variant={TYPE_BADGE_VARIANT[item.type]} className="shrink-0">
                      {TYPE_LABEL[item.type]}
                    </Badge>
                    <span className="text-sm text-[var(--text-primary)] truncate flex-1">
                      {item.title}
                    </span>
                    {assigneeName && (
                      <span className="text-xs text-[var(--text-secondary)] shrink-0">
                        {assigneeName}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Info text */}
        {incompleteItems.length > 0 && (
          <p className="text-xs text-[var(--text-secondary)]">
            {hasNextSprint
              ? "\"Move to Next Sprint\" will move incomplete items to the next planning sprint. \"Move to Backlog\" will unassign them from any sprint."
              : "No planning sprint exists. \"Move to Next Sprint\" will move items to the backlog. \"Move to Backlog\" will also unassign them from any sprint."}
          </p>
        )}

        {incompleteItems.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            All items in this sprint are complete. Nice work!
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {incompleteItems.length > 0 && (
            <Button variant="secondary" size="sm" onClick={handleMoveToBacklog}>
              Move to Backlog
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={incompleteItems.length > 0 ? handleMoveToNext : handleMoveToBacklog}
          >
            {incompleteItems.length > 0 ? "Move to Next Sprint" : "Complete Sprint"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export { SprintCompleteModal };
export type { SprintCompleteModalProps };
