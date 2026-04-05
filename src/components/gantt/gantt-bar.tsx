"use client";

import { useCallback, useRef, useState } from "react";
import type { Item, ScheduledItem, TeamMember, ZoomLevel } from "@/types";
import { ITEM_COLORS } from "@/types";
import { GanttTooltip } from "./gantt-tooltip";
import { COLUMN_WIDTHS } from "./gantt-timeline";
import { parseDate, formatDate } from "@/lib/date-utils";

const BAR_HEIGHT = 34;
const ROW_HEIGHT = 48;
const RESIZE_HANDLE_WIDTH = 8;

interface GanttBarProps {
  item: Item;
  scheduled: ScheduledItem;
  assignee: TeamMember | undefined;
  rangeStart: Date;
  zoomLevel: ZoomLevel;
  onOverride: (itemId: string, startDate: string) => void;
  onUpdateDays: (itemId: string, days: number) => void;
  onSelect: (id: string) => void;
  isSelected: boolean;
  colWidth?: number;
}

/**
 * Compute the number of calendar days between two dates (a to b, inclusive of both).
 * a and b should be at midnight.
 */
function calendarDaysInclusive(a: Date, b: Date): number {
  const MS_PER_DAY = 86400000;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY) + 1;
}

function calendarDaysDiff(a: Date, b: Date): number {
  const MS_PER_DAY = 86400000;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function dayWidthFn(zoomLevel: ZoomLevel, colWidthOverride?: number): number {
  const cw = colWidthOverride;
  switch (zoomLevel) {
    case "day":
      return cw ?? COLUMN_WIDTHS.day;
    case "week":
      return (cw ?? COLUMN_WIDTHS.week) / 7;
    case "month":
      return (cw ?? COLUMN_WIDTHS.month) / 30;
  }
}

export function GanttBar({
  item,
  scheduled,
  assignee,
  rangeStart,
  zoomLevel,
  onOverride,
  onUpdateDays,
  onSelect,
  isSelected,
  colWidth: colWidthProp,
}: GanttBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [resizeDelta, setResizeDelta] = useState(0);
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const dragStartX = useRef(0);

  const pxPerDay = dayWidthFn(zoomLevel, colWidthProp);
  const startDate = parseDate(scheduled.startDate);
  const endDate = parseDate(scheduled.endDate);

  const offsetDays = calendarDaysDiff(rangeStart, startDate);
  const spanDays = calendarDaysInclusive(startDate, endDate);

  const baseLeft = offsetDays * pxPerDay;
  const baseWidth = Math.max(spanDays * pxPerDay, pxPerDay); // minimum 1 day

  const left = baseLeft + dragOffset;
  const width = baseWidth + resizeDelta;
  const top = (ROW_HEIGHT - BAR_HEIGHT) / 2;

  // Bar color: assignee color if assigned, else item type color
  const bgColor = assignee ? assignee.color : ITEM_COLORS[item.type];
  // Type indicator: always shows item type color as a left stripe
  const typeColor = ITEM_COLORS[item.type];
  // Status-based visual modifiers
  const isDone = item.status === "done";
  const isTodo = item.status === "todo";
  const statusOpacity = isDone ? 0.55 : isTodo ? 0.75 : 1;

  // --- Drag to move ---
  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (isResizing.current) return;
      e.preventDefault();
      e.stopPropagation();
      isDragging.current = true;
      dragStartX.current = e.clientX;
      setDragOffset(0);

      const handleMove = (ev: PointerEvent) => {
        if (!isDragging.current) return;
        const dx = ev.clientX - dragStartX.current;
        setDragOffset(dx);
      };

      const handleUp = (ev: PointerEvent) => {
        if (!isDragging.current) return;
        isDragging.current = false;
        const dx = ev.clientX - dragStartX.current;
        const dayDelta = Math.round(dx / pxPerDay);
        setDragOffset(0);
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);

        if (dayDelta !== 0) {
          // Compute new start date by adding calendar days
          const newStart = new Date(startDate.getTime() + dayDelta * 86400000);
          onOverride(item.id, formatDate(newStart));
        }
      };

      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", handleUp);
    },
    [pxPerDay, startDate, item.id, onOverride]
  );

  // --- Resize to change duration ---
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing.current = true;
      dragStartX.current = e.clientX;
      setResizeDelta(0);

      const handleMove = (ev: PointerEvent) => {
        if (!isResizing.current) return;
        const dx = ev.clientX - dragStartX.current;
        setResizeDelta(dx);
      };

      const handleUp = (ev: PointerEvent) => {
        if (!isResizing.current) return;
        isResizing.current = false;
        const dx = ev.clientX - dragStartX.current;
        const dayDelta = Math.round(dx / pxPerDay);
        setResizeDelta(0);
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);

        if (dayDelta !== 0) {
          const newDays = Math.max(1, item.estimatedDays + dayDelta);
          onUpdateDays(item.id, newDays);
        }
      };

      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", handleUp);
    },
    [pxPerDay, item.id, item.estimatedDays, onUpdateDays]
  );

  // --- Tooltip ---
  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    if (isDragging.current || isResizing.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ x: e.clientX, y: rect.top });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging.current || isResizing.current) {
      setTooltip(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ x: e.clientX, y: rect.top });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isDragging.current && !isResizing.current) {
        onSelect(item.id);
      }
    },
    [item.id, onSelect]
  );

  return (
    <>
      <div
        ref={barRef}
        className={[
          "absolute flex items-center rounded-md cursor-grab select-none overflow-hidden",
          isSelected ? "ring-2 ring-[var(--accent)] ring-offset-1" : "",
        ].join(" ")}
        style={{
          left,
          top,
          width: Math.max(width, pxPerDay),
          height: BAR_HEIGHT,
          backgroundColor: bgColor,
          opacity: statusOpacity,
          border: scheduled.isCritical
            ? "2px solid var(--purple)"
            : "1px solid rgba(0,0,0,0.15)",
          boxShadow: scheduled.isCritical
            ? "0 0 8px var(--purple)"
            : undefined,
          touchAction: "none",
        }}
        onPointerDown={handleDragStart}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {/* Type indicator stripe — always visible to disambiguate item type from assignee color */}
        <div
          className="absolute left-0 top-0 h-full rounded-l-md pointer-events-none"
          style={{ width: 4, backgroundColor: typeColor }}
        />

        {/* Done: diagonal stripe overlay */}
        {isDone && (
          <div
            className="absolute inset-0 pointer-events-none rounded-md"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(255,255,255,0.18) 4px, rgba(255,255,255,0.18) 6px)",
            }}
          />
        )}

        {/* Done checkmark */}
        {isDone && (
          <span
            className="ml-1.5 shrink-0 text-white pointer-events-none"
            style={{ fontSize: 11, textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
          >
            ✓
          </span>
        )}

        {/* Label */}
        <span
          className="px-1.5 text-[10px] font-medium text-white truncate pointer-events-none"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
        >
          {item.title}
        </span>

        {/* Resize handle (right edge) */}
        <div
          className="absolute top-0 right-0 h-full cursor-col-resize hover:bg-white/20"
          style={{ width: RESIZE_HANDLE_WIDTH }}
          onPointerDown={handleResizeStart}
        />
      </div>

      {tooltip && (
        <GanttTooltip
          item={item}
          scheduled={scheduled}
          assignee={assignee}
          x={tooltip.x}
          y={tooltip.y}
        />
      )}
    </>
  );
}
