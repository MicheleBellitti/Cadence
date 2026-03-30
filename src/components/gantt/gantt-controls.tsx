"use client";

import { useMemo, useState } from "react";
import { useGanttStore } from "@/stores/gantt-store";
import { useItems, useTeam, useOverrides, useProjectStore } from "@/stores/project-store";
import { scheduleForward } from "@/lib/scheduler";
import { computeCriticalPath } from "@/lib/critical-path";
import { formatDate } from "@/lib/date-utils";
import { exportGanttPNG, exportGanttPDF } from "@/lib/export";
import { COLUMN_WIDTHS } from "./gantt-timeline";
import { ZoomIn, ZoomOut, Maximize2, Plus } from "lucide-react";
import type { ZoomLevel } from "@/types";
import { CreateItemModal } from "@/components/items/create-item-modal";

const ZOOM_OPTIONS: { value: ZoomLevel; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

interface GanttControlsProps {
  effectiveColWidth?: number;
}

export function GanttControls({ effectiveColWidth }: GanttControlsProps) {
  const zoomLevel = useGanttStore((s) => s.zoomLevel);
  const setZoomLevel = useGanttStore((s) => s.setZoomLevel);
  const setColumnWidth = useGanttStore((s) => s.setColumnWidth);
  const [showCreate, setShowCreate] = useState(false);

  const items = useItems();
  const team = useTeam();
  const overrides = useOverrides();
  const deadline = useProjectStore((s) => s.project.deadline);

  const todayStr = formatDate(new Date());

  const scheduled = useMemo(
    () => scheduleForward(items, overrides, todayStr),
    [items, overrides, todayStr]
  );

  const withCriticalPath = useMemo(
    () => computeCriticalPath(items, scheduled, deadline),
    [items, scheduled, deadline]
  );

  function handleExportPNG() {
    exportGanttPNG(items, withCriticalPath, team, overrides, deadline);
  }

  function handleExportPDF() {
    exportGanttPDF(items, withCriticalPath, team, overrides, deadline);
  }

  const currentColWidth = effectiveColWidth ?? COLUMN_WIDTHS[zoomLevel];
  const minWidth = COLUMN_WIDTHS[zoomLevel];

  function handleZoomIn() {
    setColumnWidth(Math.round(currentColWidth * 1.2));
  }

  function handleZoomOut() {
    setColumnWidth(Math.max(minWidth, Math.round(currentColWidth * 0.8)));
  }

  function handleFitToScreen() {
    setColumnWidth(null);
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-surface)] shrink-0">
      <button
        onClick={() => setShowCreate(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-[var(--accent)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity duration-100"
        title="Create new item"
      >
        <Plus size={13} />
        New Item
      </button>

      <div className="w-px h-4 bg-[var(--border)]" />

      <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
        Zoom
      </span>
      <div className="inline-flex rounded border border-[var(--border)] overflow-hidden">
        {ZOOM_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setZoomLevel(opt.value)}
            className={[
              "px-3 py-1 text-xs font-medium transition-colors duration-100",
              zoomLevel === opt.value
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]",
            ].join(" ")}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="inline-flex items-center gap-1 ml-2">
        <button
          onClick={handleZoomOut}
          className="p-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors duration-100"
          title="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={handleZoomIn}
          className="p-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors duration-100"
          title="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={handleFitToScreen}
          className="p-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors duration-100"
          title="Fit to screen"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <button
          onClick={handleExportPNG}
          disabled={items.length === 0}
          className="px-3 py-1 text-xs font-medium rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors duration-100 disabled:opacity-40 disabled:pointer-events-none"
          title="Export chart as PNG image"
        >
          Export PNG
        </button>
        <button
          onClick={handleExportPDF}
          disabled={items.length === 0}
          className="px-3 py-1 text-xs font-medium rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors duration-100 disabled:opacity-40 disabled:pointer-events-none"
          title="Export chart as PDF (print dialog)"
        >
          Export PDF
        </button>
      </div>

      <CreateItemModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
