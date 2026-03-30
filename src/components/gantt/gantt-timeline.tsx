"use client";

import type { ZoomLevel } from "@/types";

export interface TimelineColumn {
  key: string;
  label: string;
  date: Date;
  isWeekend: boolean;
  isWeekBoundary: boolean;
}

const COLUMN_WIDTHS: Record<ZoomLevel, number> = {
  day: 60,
  week: 180,
  month: 240,
};

const ROW_HEIGHT = 48;

interface GanttTimelineProps {
  columns: TimelineColumn[];
  zoomLevel: ZoomLevel;
  colWidth?: number;
}

export function GanttTimeline({ columns, zoomLevel, colWidth: colWidthProp }: GanttTimelineProps) {
  const colWidth = colWidthProp ?? COLUMN_WIDTHS[zoomLevel];
  const totalWidth = columns.length * colWidth;

  return (
    <div
      className="flex shrink-0 border-b border-[var(--border)] bg-[var(--bg-elevated)]"
      style={{ width: totalWidth, height: ROW_HEIGHT }}
    >
      {columns.map((col) => (
        <div
          key={col.key}
          className={[
            "flex items-center justify-center text-[10px] font-medium text-[var(--text-secondary)] border-r border-[var(--border)] shrink-0 select-none",
            col.isWeekend ? "bg-[color-mix(in_srgb,var(--bg-elevated)_70%,var(--border))]" : "",
          ].join(" ")}
          style={{ width: colWidth, height: ROW_HEIGHT }}
        >
          {col.label}
        </div>
      ))}
    </div>
  );
}

export { COLUMN_WIDTHS };
