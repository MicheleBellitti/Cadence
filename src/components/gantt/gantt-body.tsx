"use client";

import { useMemo } from "react";
import type { Item, ScheduledItem, TeamMember, ZoomLevel } from "@/types";
import { GanttRow, ROW_HEIGHT } from "./gantt-row";
import { GanttBar } from "./gantt-bar";
import { DependencyArrows } from "./dependency-arrows";
import type { TimelineColumn } from "./gantt-timeline";
import { COLUMN_WIDTHS } from "./gantt-timeline";

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

  // Ordered array of item IDs matching the row order
  const itemOrder = useMemo(() => items.map((i) => i.id), [items]);

  return (
    <div className="relative" style={{ width: totalWidth, minHeight: totalHeight }}>
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
        const assignee = item.assigneeId ? teamMap.get(item.assigneeId) : undefined;

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
