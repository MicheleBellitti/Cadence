"use client";

import { useMemo } from "react";
import type { Item, ScheduledItem, TeamMember, ZoomLevel, Sprint } from "@/types";
import { GanttRow, ROW_HEIGHT } from "./gantt-row";
import { GanttBar } from "./gantt-bar";
import { DependencyArrows } from "./dependency-arrows";
import type { TimelineColumn } from "./gantt-timeline";
import { COLUMN_WIDTHS } from "./gantt-timeline";

const MS_PER_DAY = 86400000;

function calendarDaysDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

interface GanttBodyProps {
  items: Item[];
  scheduled: ScheduledItem[];
  team: TeamMember[];
  columns: TimelineColumn[];
  zoomLevel: ZoomLevel;
  rangeStart: Date;
  todayOffset: number;
  deadlineOffset: number | null;
  selectedItemId: string | null;
  onSelect: (id: string) => void;
  onOverride: (itemId: string, startDate: string) => void;
  onUpdateDays: (itemId: string, days: number) => void;
  colWidth?: number;
  sprints?: Sprint[];
}

export function GanttBody({
  items,
  scheduled,
  team,
  columns,
  zoomLevel,
  rangeStart,
  todayOffset,
  deadlineOffset,
  selectedItemId,
  onSelect,
  onOverride,
  onUpdateDays,
  colWidth: colWidthProp,
  sprints = [],
}: GanttBodyProps) {
  const colWidth = colWidthProp ?? COLUMN_WIDTHS[zoomLevel];
  const totalWidth = columns.length * colWidth;
  const totalHeight = items.length * ROW_HEIGHT;

  const scheduleMap = new Map(scheduled.map((s) => [s.itemId, s]));
  const teamMap = new Map(team.map((m) => [m.id, m]));

  // Compute day width for arrow positioning
  const pxPerDay = useMemo(() => {
    switch (zoomLevel) {
      case "day":
        return colWidth;
      case "week":
        return colWidth / 7;
      case "month":
        return colWidth / 30;
    }
  }, [zoomLevel, colWidth]);

  // Compute pixel offset for a date relative to rangeStart
  const getSprintPx = useMemo(() => {
    return (dateStr: string): number => {
      const date = new Date(dateStr);
      const days = calendarDaysDiff(rangeStart, date);
      return days * pxPerDay;
    };
  }, [rangeStart, pxPerDay]);

  // Ordered array of item IDs matching the row order
  const itemOrder = useMemo(() => items.map((i) => i.id), [items]);

  return (
    <div className="relative" style={{ width: totalWidth, minHeight: totalHeight }}>
      {/* Sprint bands — rendered first, behind everything */}
      {sprints.filter((s) => s.startDate && s.endDate).map((sprint) => {
        const startX = getSprintPx(sprint.startDate!);
        const endX = getSprintPx(sprint.endDate!);
        const width = endX - startX;
        const isActive = sprint.status === "active";
        const isCompleted = sprint.status === "completed";

        return (
          <div
            key={sprint.id}
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: startX,
              width,
              backgroundColor: isActive
                ? "color-mix(in srgb, var(--accent) 8%, transparent)"
                : isCompleted
                  ? "color-mix(in srgb, var(--text-secondary) 5%, transparent)"
                  : "transparent",
              borderLeft: `1px dashed ${isActive ? "var(--accent)" : "var(--border)"}`,
              borderRight: `1px dashed ${isActive ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            <span
              className="absolute top-1 left-1 text-[10px] font-medium"
              style={{ color: isActive ? "var(--accent)" : "var(--text-secondary)" }}
            >
              {sprint.name}
            </span>
          </div>
        );
      })}

      {/* Column grid lines */}
      <div className="absolute inset-0 pointer-events-none" style={{ width: totalWidth }}>
        {columns.map((col, i) => (
          <div
            key={col.key}
            className={[
              "absolute top-0 h-full border-r",
              col.isWeekend
                ? "bg-[color-mix(in_srgb,var(--bg-elevated)_50%,transparent)] border-[var(--border)]"
                : col.isWeekBoundary
                  ? "border-[var(--border)]"
                  : "border-[color-mix(in_srgb,var(--border)_40%,transparent)]",
            ].join(" ")}
            style={{ left: i * colWidth, width: colWidth }}
          />
        ))}
      </div>

      {/* Rows and bars */}
      {items.map((item, idx) => {
        const sched = scheduleMap.get(item.id);
        const ids = item.assigneeIds ?? [];
        const assignee = ids.length > 0 ? teamMap.get(ids[0]) : undefined;

        return (
          <GanttRow key={item.id} index={idx}>
            {sched && (
              <GanttBar
                item={item}
                scheduled={sched}
                assignee={assignee}
                rangeStart={rangeStart}
                zoomLevel={zoomLevel}
                onOverride={onOverride}
                onUpdateDays={onUpdateDays}
                onSelect={onSelect}
                isSelected={item.id === selectedItemId}
                colWidth={colWidth}
              />
            )}
          </GanttRow>
        );
      })}

      {/* Dependency arrows overlay */}
      <DependencyArrows
        items={items}
        scheduled={scheduled}
        rangeStart={rangeStart}
        dayWidth={pxPerDay}
        rowHeight={ROW_HEIGHT}
        itemOrder={itemOrder}
      />

      {/* Today marker */}
      {todayOffset >= 0 && (
        <div
          className="absolute top-0 h-full pointer-events-none z-10"
          style={{ left: todayOffset, width: 0 }}
        >
          <div className="absolute -top-0 -translate-x-1/2 px-1.5 py-0.5 bg-[var(--accent)] text-white text-[9px] font-semibold rounded-b whitespace-nowrap">
            Today
          </div>
          <div
            className="absolute top-5 h-[calc(100%-20px)] w-0 border-l-2 border-dashed border-[var(--accent)]"
            style={{ left: 0 }}
          />
        </div>
      )}

      {/* Deadline marker */}
      {deadlineOffset !== null && deadlineOffset >= 0 && (
        <div
          className="absolute top-0 h-full pointer-events-none z-10"
          style={{ left: deadlineOffset, width: 0 }}
        >
          <div className="absolute -top-0 -translate-x-1/2 px-1.5 py-0.5 bg-[var(--danger)] text-white text-[9px] font-semibold rounded-b whitespace-nowrap">
            Deadline
          </div>
          <div
            className="absolute top-5 h-[calc(100%-20px)] w-0 border-l-2 border-dashed border-[var(--danger)]"
            style={{ left: 0 }}
          />
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex items-center justify-center h-64 text-sm text-[var(--text-secondary)]">
          No scheduled items to display.
        </div>
      )}
    </div>
  );
}
