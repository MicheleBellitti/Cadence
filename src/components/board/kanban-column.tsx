"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { KanbanCard } from "./kanban-card";
import type { Item, Status, TeamMember } from "@/types";
import { STATUS_LABELS } from "@/types";

interface KanbanColumnProps {
  status: Status;
  items: Item[];
  team: TeamMember[];
  onCardClick: (itemId: string) => void;
  onQuickAdd: (title: string, status: Status) => void;
}

function KanbanColumn({
  status,
  items,
  team,
  onCardClick,
  onQuickAdd,
}: KanbanColumnProps) {
  const [quickAddValue, setQuickAddValue] = useState("");
  const { setNodeRef, isOver } = useDroppable({ id: status });

  const totalStoryPoints = items.reduce((sum, item) => {
    if (item.type === "story") {
      return sum + item.storyPoints;
    }
    return sum;
  }, 0);

  const itemIds = items.map((item) => item.id);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && quickAddValue.trim()) {
      onQuickAdd(quickAddValue.trim(), status);
      setQuickAddValue("");
    }
  }

  function findTeamMember(assigneeId: string | null): TeamMember | undefined {
    if (!assigneeId) return undefined;
    return team.find((m) => m.id === assigneeId);
  }

  return (
    <div
      className={[
        "flex flex-col flex-1 min-w-[260px] rounded-xl border bg-[var(--bg-primary)]",
        isOver
          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30"
          : "border-[var(--border)]",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {STATUS_LABELS[status]}
          </span>
          <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded-full font-medium">
            {items.length}
          </span>
        </div>
        {totalStoryPoints > 0 && (
          <span className="text-xs text-[var(--text-secondary)]">
            {totalStoryPoints} SP
          </span>
        )}
      </div>

      {/* Body */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto p-2 space-y-2"
        style={{ maxHeight: "calc(100vh - 220px)" }}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <KanbanCard
              key={item.id}
              item={item}
              teamMember={findTeamMember(item.assigneeId)}
              onClick={() => onCardClick(item.id)}
            />
          ))}
        </SortableContext>

        {items.length === 0 && (
          <div className="flex items-center justify-center py-8 text-xs text-[var(--text-secondary)]">
            No items
          </div>
        )}
      </div>

      {/* Footer: Quick-add */}
      <div className="px-2 pb-2 pt-1">
        <input
          type="text"
          value={quickAddValue}
          onChange={(e) => setQuickAddValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add item..."
          className="w-full px-2.5 py-1.5 text-sm bg-[var(--bg-surface)] border border-[var(--border)] rounded-md text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-colors duration-150"
        />
      </div>
    </div>
  );
}

export { KanbanColumn };
export type { KanbanColumnProps };
