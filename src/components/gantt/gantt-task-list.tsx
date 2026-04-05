"use client";

import { forwardRef } from "react";
import type { Item, TeamMember, ScheduledItem, Status } from "@/types";
import { ITEM_COLORS } from "@/types";

const STATUS_ICONS: Record<Status, string> = {
  todo: "\u25CB",       // ○ empty circle
  in_progress: "\u25D4", // ◔ quarter circle
  in_review: "\u25D1",   // ◑ half circle
  done: "\u25CF",        // ● filled circle
};

const STATUS_COLORS: Record<Status, string> = {
  todo: "var(--text-secondary)",
  in_progress: "#2563EB",
  in_review: "#D97706",
  done: "#059669",
};

const ROW_HEIGHT = 48;

const TYPE_ICONS: Record<string, string> = {
  epic: "\u2B21",
  story: "\u25C8",
  task: "\u25FB",
  bug: "\u25CF",
};

interface GanttTaskListProps {
  items: Item[];
  scheduled: ScheduledItem[];
  team: TeamMember[];
  selectedItemId: string | null;
  onSelect: (id: string) => void;
}

function indentForType(type: string): number {
  switch (type) {
    case "epic":
      return 0;
    case "story":
      return 16;
    default:
      return 32;
  }
}

export const GanttTaskList = forwardRef<HTMLDivElement, GanttTaskListProps>(
  function GanttTaskList({ items, scheduled, team, selectedItemId, onSelect }, ref) {
    const teamMap = new Map(team.map((m) => [m.id, m]));
    const scheduleMap = new Map(scheduled.map((s) => [s.itemId, s]));

    return (
      <div
        className="shrink-0 border-r border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden"
        style={{ width: 410 }}
      >
        {/* Header */}
        <div
          className="flex items-center px-3 text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide border-b border-[var(--border)] bg-[var(--bg-elevated)]"
          style={{ height: ROW_HEIGHT }}
        >
          <span className="flex-1">Item</span>
          <span className="w-10 text-center">Status</span>
          <span className="w-20 text-right">Assignee</span>
          <span className="w-12 text-right">Days</span>
        </div>

        {/* Scrollable rows */}
        <div ref={ref} className="overflow-y-auto" style={{ height: `calc(100% - ${ROW_HEIGHT}px)` }}>
          {items.length === 0 && (
            <div className="flex items-center justify-center h-32 text-sm text-[var(--text-secondary)]">
              No items to display.
            </div>
          )}
          {items.map((item, idx) => {
            const ids = item.assigneeIds ?? [];
            const assignees = ids.map((id) => teamMap.get(id)).filter(Boolean) as typeof team;
            const assignee = assignees[0];
            const sched = scheduleMap.get(item.id);
            const isSelected = item.id === selectedItemId;

            return (
              <div
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={[
                  "flex items-center px-3 cursor-pointer border-b border-[var(--border)] transition-colors duration-75",
                  isSelected
                    ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                    : idx % 2 === 0
                      ? "bg-[var(--bg-surface)]"
                      : "bg-[var(--bg-primary)]",
                  "hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]",
                ].join(" ")}
                style={{ height: ROW_HEIGHT }}
              >
                {/* Indented icon + title */}
                <div
                  className="flex items-center gap-1.5 flex-1 min-w-0"
                  style={{ paddingLeft: indentForType(item.type) }}
                >
                  <span
                    className="text-[10px] shrink-0"
                    style={{ color: ITEM_COLORS[item.type] }}
                  >
                    {TYPE_ICONS[item.type]}
                  </span>
                  <span className="text-xs text-[var(--text-primary)] truncate">
                    {item.title}
                  </span>
                </div>

                {/* Status */}
                <div
                  className="w-10 flex items-center justify-center shrink-0"
                  title={item.status.replace("_", " ")}
                >
                  <span
                    className="text-xs"
                    style={{ color: STATUS_COLORS[item.status] }}
                  >
                    {STATUS_ICONS[item.status]}
                  </span>
                </div>

                {/* Assignees */}
                <div className="w-24 flex items-center justify-end gap-0.5 shrink-0">
                  {assignees.length > 0 ? (
                    assignees.map((m) => (
                      <div
                        key={m.id}
                        className="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center shrink-0"
                        style={{ backgroundColor: m.color }}
                        title={m.name}
                      >
                        {m.name[0]}
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-[var(--text-secondary)]">{"\u2014"}</span>
                  )}
                </div>

                {/* Days */}
                <span className="w-12 text-right text-xs text-[var(--text-secondary)] tabular-nums shrink-0">
                  {sched ? item.estimatedDays : "\u2014"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
