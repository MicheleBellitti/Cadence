"use client";

import { useMemo } from "react";
import type { Item, ScheduledItem } from "@/types";
import { parseDate } from "@/lib/date-utils";

interface ArrowData {
  id: string;
  path: string;
  isCritical: boolean;
}

interface DependencyArrowsProps {
  items: Item[];
  scheduled: ScheduledItem[];
  rangeStart: Date;
  dayWidth: number;
  rowHeight: number;
  itemOrder: string[]; // ordered array of item IDs matching the row order
}

const MS_PER_DAY = 86400000;

function calendarDaysDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function computeArrowPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): string {
  const midX = (fromX + toX) / 2;
  return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
}

export function DependencyArrows({
  items,
  scheduled,
  rangeStart,
  dayWidth,
  rowHeight,
  itemOrder,
}: DependencyArrowsProps) {
  const arrows = useMemo(() => {
    const scheduleMap = new Map<string, ScheduledItem>();
    for (const s of scheduled) {
      scheduleMap.set(s.itemId, s);
    }

    const orderIndex = new Map<string, number>();
    for (let i = 0; i < itemOrder.length; i++) {
      orderIndex.set(itemOrder[i], i);
    }

    const result: ArrowData[] = [];

    for (const item of items) {
      if (item.dependencies.length === 0) continue;

      const succSched = scheduleMap.get(item.id);
      const succIdx = orderIndex.get(item.id);
      if (succSched === undefined || succIdx === undefined) continue;

      for (const depId of item.dependencies) {
        const predSched = scheduleMap.get(depId);
        const predIdx = orderIndex.get(depId);
        if (predSched === undefined || predIdx === undefined) continue;

        // fromX: right edge of predecessor bar
        const predEndDate = parseDate(predSched.endDate);
        const predEndDays = calendarDaysDiff(rangeStart, predEndDate);
        const fromX = (predEndDays + 1) * dayWidth; // +1 because endDate is inclusive

        // fromY: vertical center of predecessor row
        const fromY = predIdx * rowHeight + rowHeight / 2;

        // toX: left edge of successor bar
        const succStartDate = parseDate(succSched.startDate);
        const succStartDays = calendarDaysDiff(rangeStart, succStartDate);
        const toX = succStartDays * dayWidth;

        // toY: vertical center of successor row
        const toY = succIdx * rowHeight + rowHeight / 2;

        // Arrow is critical if both predecessor and successor are critical
        const isCritical =
          (predSched.isCritical ?? false) && (succSched.isCritical ?? false);

        result.push({
          id: `${depId}->${item.id}`,
          path: computeArrowPath(fromX, fromY, toX, toY),
          isCritical,
        });
      }
    }

    return result;
  }, [items, scheduled, rangeStart, dayWidth, rowHeight, itemOrder]);

  if (arrows.length === 0) return null;

  const totalWidth = itemOrder.length > 0 ? "100%" : "0";
  const totalHeight = itemOrder.length * rowHeight;

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-[5]"
      style={{ width: totalWidth, height: totalHeight }}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="var(--text-secondary)" />
        </marker>
        <marker
          id="arrowhead-critical"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="var(--purple)" />
        </marker>
      </defs>
      {arrows.map((arrow) => (
        <path
          key={arrow.id}
          d={arrow.path}
          stroke={arrow.isCritical ? "var(--purple)" : "var(--text-secondary)"}
          strokeWidth={arrow.isCritical ? 2 : 1}
          strokeDasharray={arrow.isCritical ? undefined : "4 4"}
          fill="none"
          markerEnd={
            arrow.isCritical
              ? "url(#arrowhead-critical)"
              : "url(#arrowhead)"
          }
        />
      ))}
    </svg>
  );
}
