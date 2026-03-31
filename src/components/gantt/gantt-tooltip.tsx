"use client";

import { createPortal } from "react-dom";
import type { Item, ScheduledItem, TeamMember } from "@/types";
import { ITEM_COLORS, STATUS_LABELS } from "@/types";

interface GanttTooltipProps {
  item: Item;
  scheduled: ScheduledItem;
  assignee?: TeamMember;
  assignees?: TeamMember[];
  x: number;
  y: number;
}

const TYPE_LABELS: Record<string, string> = {
  epic: "Epic",
  story: "Story",
  task: "Task",
  bug: "Bug",
};

export function GanttTooltip({
  item,
  scheduled,
  assignee,
  assignees,
  x,
  y,
}: GanttTooltipProps) {
  const formatDisplay = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-");
    return `${month}/${day}/${year}`;
  };

  const startD = new Date(scheduled.startDate + "T00:00:00");
  const endD = new Date(scheduled.endDate + "T00:00:00");
  const diffMs = endD.getTime() - startD.getTime();
  const durationDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;

  const content = (
    <div
      className="fixed z-[100] pointer-events-none"
      style={{
        left: x,
        top: y - 8,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg shadow-lg px-3 py-2 text-xs max-w-[260px]">
        <div className="font-semibold text-[var(--text-primary)] truncate mb-1">
          {item.title}
        </div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: ITEM_COLORS[item.type] }}
          />
          <span className="text-[var(--text-secondary)]">
            {TYPE_LABELS[item.type]}
          </span>
        </div>
        <div className="space-y-0.5 text-[var(--text-secondary)]">
          <div>
            {formatDisplay(scheduled.startDate)} &rarr;{" "}
            {formatDisplay(scheduled.endDate)}
          </div>
          <div>Duration: {durationDays} calendar day{durationDays !== 1 ? "s" : ""} ({item.estimatedDays} business day{item.estimatedDays !== 1 ? "s" : ""})</div>
          <div>Status: {STATUS_LABELS[item.status]}</div>
          <div>Assignee{(assignees?.length ?? 0) > 1 ? "s" : ""}: {
            assignees && assignees.length > 0
              ? assignees.map((a) => a.name).join(", ")
              : assignee ? assignee.name : "\u2014"
          }</div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
