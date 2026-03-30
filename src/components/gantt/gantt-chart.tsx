"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useItems, useTeam, useOverrides, useProjectStore } from "@/stores/project-store";
import { useGanttStore } from "@/stores/gantt-store";
import { scheduleForward } from "@/lib/scheduler";
import { computeCriticalPath } from "@/lib/critical-path";
import { formatDate, parseDate } from "@/lib/date-utils";
import type { ZoomLevel, Item } from "@/types";

import { GanttControls } from "./gantt-controls";
import { GanttTaskList } from "./gantt-task-list";
import { GanttTimeline, COLUMN_WIDTHS } from "./gantt-timeline";
import type { TimelineColumn } from "./gantt-timeline";
import { GanttBody } from "./gantt-body";
import { ItemDetailDrawer } from "@/components/items/item-detail-drawer";

const MS_PER_DAY = 86400000;

/** Day-of-week abbreviations (0=Sun..6=Sat) */
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];



function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const dow = copy.getDay();
  const diff = dow === 0 ? 6 : dow - 1; // Monday = 0 offset
  copy.setDate(copy.getDate() - diff);
  return copy;
}

function addCalendarDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

function calendarDaysDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * ISO week number calculation.
 */
function getISOWeek(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7);
}

/** Compute the date range for the Gantt viewport. */
function computeDateRange(
  scheduled: { startDate: string; endDate: string }[],
  todayStr: string,
  deadline: string | null
): { rangeStart: Date; rangeEnd: Date } {
  const today = parseDate(todayStr);
  let minDate = today;
  let maxDate = today;

  for (const s of scheduled) {
    const sd = parseDate(s.startDate);
    const ed = parseDate(s.endDate);
    if (sd < minDate) minDate = sd;
    if (ed > maxDate) maxDate = ed;
  }

  if (deadline) {
    const dl = parseDate(deadline);
    if (dl > maxDate) maxDate = dl;
  }

  // Add buffers: 1 week before, 2 weeks after
  const rangeStart = addCalendarDays(minDate, -7);
  const rangeEnd = addCalendarDays(maxDate, 14);

  return { rangeStart, rangeEnd };
}

/** Generate timeline columns for the given range and zoom level. */
function generateColumns(
  rangeStart: Date,
  rangeEnd: Date,
  zoomLevel: ZoomLevel
): TimelineColumn[] {
  const columns: TimelineColumn[] = [];

  if (zoomLevel === "day") {
    let current = new Date(rangeStart);
    while (current <= rangeEnd) {
      const dow = current.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isWeekBoundary = dow === 1; // Monday
      const dayNum = current.getDate();
      const dayName = DAY_NAMES[dow];
      columns.push({
        key: formatDate(current),
        label: `${dayName} ${dayNum}`,
        date: new Date(current),
        isWeekend,
        isWeekBoundary,
      });
      current = addCalendarDays(current, 1);
    }
  } else if (zoomLevel === "week") {
    // Start from the Monday of the week containing rangeStart
    let current = startOfWeek(rangeStart);
    while (current <= rangeEnd) {
      const weekNum = getISOWeek(current);
      const weekEnd = addCalendarDays(current, 4); // Friday
      const label = `W${weekNum} (${MONTH_NAMES[current.getMonth()]} ${current.getDate()}\u2013${weekEnd.getDate()})`;
      columns.push({
        key: `week-${formatDate(current)}`,
        label,
        date: new Date(current),
        isWeekend: false,
        isWeekBoundary: true,
      });
      current = addCalendarDays(current, 7);
    }
  } else {
    // month zoom
    let current = startOfMonth(rangeStart);
    while (current <= rangeEnd) {
      const label = `${MONTH_NAMES[current.getMonth()]} ${current.getFullYear()}`;
      columns.push({
        key: `month-${current.getFullYear()}-${current.getMonth()}`,
        label,
        date: new Date(current),
        isWeekend: false,
        isWeekBoundary: false,
      });
      // Advance to next month
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
  }

  return columns;
}

/** Get the pixel offset for a date relative to rangeStart. */
function getPixelOffset(
  date: Date,
  rangeStart: Date,
  zoomLevel: ZoomLevel,
  _columns: TimelineColumn[],
  colWidth?: number
): number {
  if (zoomLevel === "day") {
    const days = calendarDaysDiff(rangeStart, date);
    return days * (colWidth ?? COLUMN_WIDTHS.day);
  } else if (zoomLevel === "week") {
    const days = calendarDaysDiff(rangeStart, date);
    return days * ((colWidth ?? COLUMN_WIDTHS.week) / 7);
  } else {
    // month: approximate
    const days = calendarDaysDiff(rangeStart, date);
    return days * ((colWidth ?? COLUMN_WIDTHS.month) / 30);
  }
}

/**
 * Sort items for display: epics first, then their children (stories), then grandchildren (tasks/bugs).
 * Within each level, sort by order.
 */
function sortItemsHierarchically(items: Item[]): Item[] {
  const childrenOf = new Map<string | null, Item[]>();

  for (const item of items) {
    const parentId = item.parentId;
    if (!childrenOf.has(parentId)) {
      childrenOf.set(parentId, []);
    }
    childrenOf.get(parentId)!.push(item);
  }

  // Sort children by order
  for (const [, children] of childrenOf) {
    children.sort((a, b) => a.order - b.order);
  }

  const result: Item[] = [];
  function traverse(parentId: string | null) {
    const children = childrenOf.get(parentId) ?? [];
    for (const child of children) {
      result.push(child);
      traverse(child.id);
    }
  }
  traverse(null);

  return result;
}

export function GanttChart() {
  const items = useItems();
  const team = useTeam();
  const overrides = useOverrides();
  const deadline = useProjectStore((s) => s.project.deadline);
  const setOverride = useProjectStore((s) => s.setOverride);
  const updateItem = useProjectStore((s) => s.updateItem);

  const zoomLevel = useGanttStore((s) => s.zoomLevel);
  const selectedItemId = useGanttStore((s) => s.selectedItemId);
  const setSelectedItemId = useGanttStore((s) => s.setSelectedItemId);
  const storeColumnWidth = useGanttStore((s) => s.columnWidth);

  // Auto-fit: measure chart container width
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const todayStr = formatDate(new Date());

  // Schedule items
  const scheduled = useMemo(
    () => scheduleForward(items, overrides, todayStr),
    [items, overrides, todayStr]
  );

  // Compute critical path
  const withCriticalPath = useMemo(
    () => computeCriticalPath(items, scheduled, deadline),
    [items, scheduled, deadline]
  );

  // Sort items hierarchically
  const sortedItems = useMemo(() => sortItemsHierarchically(items), [items]);

  // Compute date range
  const { rangeStart, rangeEnd } = useMemo(
    () => computeDateRange(scheduled, todayStr, deadline),
    [scheduled, todayStr, deadline]
  );

  // Generate columns
  const columns = useMemo(
    () => generateColumns(rangeStart, rangeEnd, zoomLevel),
    [rangeStart, rangeEnd, zoomLevel]
  );

  // Compute effective column width (auto-fit or manual)
  const effectiveColWidth = useMemo(() => {
    if (storeColumnWidth !== null) return storeColumnWidth;
    // Auto-fit: fill available width
    const taskListWidth = 370; // left panel
    const availableWidth = containerWidth - taskListWidth;
    if (availableWidth <= 0 || columns.length === 0) return COLUMN_WIDTHS[zoomLevel];
    const fitted = Math.floor(availableWidth / columns.length);
    return Math.max(COLUMN_WIDTHS[zoomLevel], fitted);
  }, [storeColumnWidth, containerWidth, columns.length, zoomLevel]);

  // Compute today and deadline pixel offsets
  const todayOffset = useMemo(
    () => getPixelOffset(parseDate(todayStr), rangeStart, zoomLevel, columns, effectiveColWidth),
    [todayStr, rangeStart, zoomLevel, columns, effectiveColWidth]
  );

  const deadlineOffset = useMemo(
    () =>
      deadline
        ? getPixelOffset(parseDate(deadline), rangeStart, zoomLevel, columns, effectiveColWidth)
        : null,
    [deadline, rangeStart, zoomLevel, columns, effectiveColWidth]
  );

  // Refs for synchronized scrolling
  const taskListScrollRef = useRef<HTMLDivElement>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  // Sync vertical scroll between task list and chart body
  const handleChartScroll = useCallback(() => {
    if (chartScrollRef.current && taskListScrollRef.current) {
      taskListScrollRef.current.scrollTop = chartScrollRef.current.scrollTop;
    }
  }, []);

  // Also sync if task list scrolls (e.g., trackpad on task list)
  const handleTaskListScroll = useCallback(() => {
    if (taskListScrollRef.current && chartScrollRef.current) {
      chartScrollRef.current.scrollTop = taskListScrollRef.current.scrollTop;
    }
  }, []);

  useEffect(() => {
    const chartEl = chartScrollRef.current;
    const taskEl = taskListScrollRef.current;
    if (chartEl) {
      chartEl.addEventListener("scroll", handleChartScroll, { passive: true });
    }
    if (taskEl) {
      taskEl.addEventListener("scroll", handleTaskListScroll, { passive: true });
    }
    return () => {
      if (chartEl) chartEl.removeEventListener("scroll", handleChartScroll);
      if (taskEl) taskEl.removeEventListener("scroll", handleTaskListScroll);
    };
  }, [handleChartScroll, handleTaskListScroll]);

  const handleOverride = useCallback(
    (itemId: string, startDate: string) => {
      setOverride(itemId, startDate);
    },
    [setOverride]
  );

  const handleUpdateDays = useCallback(
    (itemId: string, days: number) => {
      updateItem(itemId, { estimatedDays: days });
    },
    [updateItem]
  );

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedItemId(id);
    },
    [setSelectedItemId]
  );

  const handleCloseDrawer = useCallback(() => {
    setSelectedItemId(null);
  }, [setSelectedItemId]);

  return (
    <div ref={chartContainerRef} className="flex flex-col h-full">
      <GanttControls effectiveColWidth={effectiveColWidth} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: task list */}
        <GanttTaskList
          ref={taskListScrollRef}
          items={sortedItems}
          scheduled={withCriticalPath}
          team={team}
          selectedItemId={selectedItemId}
          onSelect={handleSelect}
        />

        {/* Right panel: timeline + body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Timeline header (scrolls horizontally with body, hidden overflow) */}
          <div
            ref={timelineScrollRef}
            className="overflow-hidden shrink-0"
          >
            <GanttTimeline columns={columns} zoomLevel={zoomLevel} colWidth={effectiveColWidth} />
          </div>

          {/* Chart body (scrollable both X and Y) */}
          <div
            ref={chartScrollRef}
            className="flex-1 overflow-auto"
            onScroll={() => {
              // Sync timeline horizontal scroll with body
              if (timelineScrollRef.current && chartScrollRef.current) {
                timelineScrollRef.current.scrollLeft = chartScrollRef.current.scrollLeft;
              }
            }}
          >
            <GanttBody
              items={sortedItems}
              scheduled={withCriticalPath}
              team={team}
              columns={columns}
              zoomLevel={zoomLevel}
              rangeStart={rangeStart}
              todayOffset={todayOffset}
              deadlineOffset={deadlineOffset}
              selectedItemId={selectedItemId}
              onSelect={handleSelect}
              onOverride={handleOverride}
              onUpdateDays={handleUpdateDays}
              colWidth={effectiveColWidth}
            />
          </div>
        </div>
      </div>

      {/* Detail drawer */}
      <ItemDetailDrawer itemId={selectedItemId} onClose={handleCloseDrawer} />
    </div>
  );
}
