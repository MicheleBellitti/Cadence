"use client";

import { ClipboardList, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Item } from "@/types";
import { ITEM_COLORS, STATUS_LABELS } from "@/types";
import type { BadgeVariant } from "@/components/ui/badge";

interface MyTasksCardProps {
  tasks: Item[];
  onItemClick: (id: string) => void;
}

const TYPE_ICONS: Record<string, string> = {
  epic: "⬡",
  story: "◈",
  task: "◻",
  bug: "⬤",
};

const PRIORITY_BADGE_VARIANT: Record<string, BadgeVariant> = {
  critical: "danger",
  high: "warning",
  medium: "default",
  low: "blue",
};

const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  todo: "default",
  in_progress: "blue",
  in_review: "purple",
};

export function MyTasksCard({ tasks, onItemClick }: MyTasksCardProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <ClipboardList size={16} className="text-[var(--accent)]" />
          My Tasks
        </h2>
        {tasks.length > 0 && (
          <span className="text-xs text-[var(--text-tertiary)]">
            {tasks.length} open
          </span>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-[var(--text-secondary)]">
            No tasks assigned to you.
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Make sure your account is linked in Settings → Team.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {tasks.map((item) => (
            <button
              key={item.id}
              onClick={() => onItemClick(item.id)}
              className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-elevated)] group"
            >
              {/* Type icon */}
              <span
                className="text-xs shrink-0 font-bold"
                style={{ color: ITEM_COLORS[item.type] }}
              >
                {TYPE_ICONS[item.type]}
              </span>

              {/* Title + badges */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text-primary)] truncate">
                  {item.title}
                </p>
              </div>

              {/* Priority */}
              <Badge
                variant={PRIORITY_BADGE_VARIANT[item.priority] ?? "default"}
                className="shrink-0"
              >
                {item.priority}
              </Badge>

              {/* Status */}
              <Badge
                variant={STATUS_BADGE_VARIANT[item.status] ?? "default"}
                className="shrink-0"
              >
                {STATUS_LABELS[item.status]}
              </Badge>

              {/* Arrow hint on hover */}
              <ArrowRight
                size={14}
                className="shrink-0 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
