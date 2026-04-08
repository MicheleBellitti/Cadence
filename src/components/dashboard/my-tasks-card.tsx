"use client";

import { useCallback } from "react";
import { ClipboardList, ArrowRight, Check, Loader2, Eye } from "lucide-react";
import type { Item, Status } from "@/types";
import { ITEM_COLORS, STATUSES, STATUS_LABELS } from "@/types";
import { useProjectStore } from "@/stores/project-store";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MyTasksCardProps {
  tasks: Item[];
  onItemClick: (id: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Status cycling                                                     */
/* ------------------------------------------------------------------ */

/**
 * Returns the next status in the cycle:
 * todo → in_progress → in_review → done → todo
 */
function getNextStatus(current: Status): Status {
  const idx = STATUSES.indexOf(current);
  return STATUSES[(idx + 1) % STATUSES.length];
}

/* ------------------------------------------------------------------ */
/*  Status checkbox — visual indicator per status                      */
/* ------------------------------------------------------------------ */

const STATUS_ICON_CONFIG: Record<
  Status,
  {
    border: string;
    bg: string;
    icon: "empty" | "loader" | "eye" | "check";
    iconColor: string;
  }
> = {
  todo: {
    border: "var(--border)",
    bg: "transparent",
    icon: "empty",
    iconColor: "transparent",
  },
  in_progress: {
    border: "var(--accent)",
    bg: "color-mix(in srgb, var(--accent) 15%, transparent)",
    icon: "loader",
    iconColor: "var(--accent)",
  },
  in_review: {
    border: "var(--purple)",
    bg: "color-mix(in srgb, var(--purple) 15%, transparent)",
    icon: "eye",
    iconColor: "var(--purple)",
  },
  done: {
    border: "var(--success)",
    bg: "var(--success)",
    icon: "check",
    iconColor: "white",
  },
};

function StatusCheckbox({
  status,
  onClick,
}: {
  status: Status;
  onClick: (e: React.MouseEvent) => void;
}) {
  const config = STATUS_ICON_CONFIG[status];

  return (
    <button
      onClick={onClick}
      className="group/check relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all hover:scale-110 active:scale-95"
      style={{
        borderColor: config.border,
        backgroundColor: config.bg,
      }}
      title={`${STATUS_LABELS[status]} — click to advance`}
    >
      {config.icon === "loader" && (
        <Loader2
          size={12}
          className="animate-[spin_3s_linear_infinite]"
          style={{ color: config.iconColor }}
        />
      )}
      {config.icon === "eye" && (
        <Eye size={11} style={{ color: config.iconColor }} />
      )}
      {config.icon === "check" && (
        <Check size={12} strokeWidth={3} style={{ color: config.iconColor }} />
      )}
      {/* Hover hint: next status ring */}
      <span
        className="absolute inset-0 rounded-md opacity-0 transition-opacity group-hover/check:opacity-100"
        style={{
          boxShadow: `0 0 0 2px color-mix(in srgb, ${STATUS_ICON_CONFIG[getNextStatus(status)].border} 30%, transparent)`,
        }}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Task row                                                           */
/* ------------------------------------------------------------------ */

function TaskRow({
  item,
  onItemClick,
  onStatusCycle,
}: {
  item: Item;
  onItemClick: (id: string) => void;
  onStatusCycle: (id: string, newStatus: Status) => void;
}) {
  const isDone = item.status === "done";
  const nextStatus = getNextStatus(item.status);

  const handleCheckClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onStatusCycle(item.id, nextStatus);
    },
    [item.id, nextStatus, onStatusCycle],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onItemClick(item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onItemClick(item.id);
        }
      }}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--bg-elevated)]"
    >
      {/* Status checkbox */}
      <StatusCheckbox status={item.status} onClick={handleCheckClick} />

      {/* Type stripe + title */}
      <div className="flex flex-1 items-center gap-2.5 min-w-0">
        <div
          className="h-5 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: ITEM_COLORS[item.type] }}
        />
        <span
          className={`text-sm truncate transition-colors ${
            isDone
              ? "text-[var(--text-tertiary)] line-through"
              : "text-[var(--text-primary)]"
          }`}
        >
          {item.title}
        </span>
      </div>

      {/* Status label */}
      <span
        className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium"
        style={{
          backgroundColor: `color-mix(in srgb, ${STATUS_ICON_CONFIG[item.status].border} 12%, transparent)`,
          color: isDone ? "var(--success)" : STATUS_ICON_CONFIG[item.status].iconColor || "var(--text-secondary)",
        }}
      >
        {STATUS_LABELS[item.status]}
      </span>

      {/* Arrow on hover */}
      <ArrowRight
        size={14}
        className="shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main card                                                          */
/* ------------------------------------------------------------------ */

export function MyTasksCard({ tasks, onItemClick }: MyTasksCardProps) {
  const updateItem = useProjectStore((s) => s.updateItem);

  const handleStatusCycle = useCallback(
    (id: string, newStatus: Status) => {
      updateItem(id, { status: newStatus });
    },
    [updateItem],
  );

  // Split tasks: open items first, done items at bottom
  const openTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <ClipboardList size={16} className="text-[var(--accent)]" />
          My Tasks
        </h2>
        {tasks.length > 0 && (
          <span className="text-xs text-[var(--text-tertiary)]">
            {openTasks.length} open{doneTasks.length > 0 ? ` · ${doneTasks.length} done` : ""}
          </span>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            No tasks assigned to you.
          </p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Make sure your account is linked in Settings &rarr; Team.
          </p>
        </div>
      ) : (
        <div className="max-h-80 space-y-0.5 overflow-y-auto">
          {/* Open tasks */}
          {openTasks.map((item) => (
            <TaskRow
              key={item.id}
              item={item}
              onItemClick={onItemClick}
              onStatusCycle={handleStatusCycle}
            />
          ))}

          {/* Done tasks — separated with subtle divider */}
          {doneTasks.length > 0 && openTasks.length > 0 && (
            <div className="my-2 border-t border-dashed border-[var(--border)]" />
          )}
          {doneTasks.map((item) => (
            <TaskRow
              key={item.id}
              item={item}
              onItemClick={onItemClick}
              onStatusCycle={handleStatusCycle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
