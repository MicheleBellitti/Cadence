"use client";

import { Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SprintProgress } from "@/lib/dashboard-utils";

interface SprintProgressCardProps {
  progress: SprintProgress | null;
}

const STATUS_SEGMENTS: {
  key: keyof Pick<SprintProgress, "done" | "inReview" | "inProgress" | "todo">;
  color: string;
  label: string;
}[] = [
  { key: "done", color: "var(--success)", label: "Done" },
  { key: "inReview", color: "var(--purple)", label: "In Review" },
  { key: "inProgress", color: "var(--accent)", label: "In Progress" },
  { key: "todo", color: "var(--bg-elevated)", label: "To Do" },
];

export function SprintProgressCard({ progress }: SprintProgressCardProps) {
  if (!progress) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Timer size={16} className="text-[var(--accent)]" />
          Sprint Progress
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          No active sprint. Start a sprint in the Board view to see progress here.
        </p>
      </div>
    );
  }

  const { sprint, total, percentComplete, daysRemaining, totalDays } = progress;
  const daysElapsed = totalDays - daysRemaining;
  const timePercent = totalDays > 0 ? Math.round((daysElapsed / totalDays) * 100) : 0;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Timer size={16} className="text-[var(--accent)]" />
          Sprint Progress
        </h2>
        <Badge variant="blue">{sprint.name}</Badge>
      </div>

      {/* Sprint goal */}
      {sprint.goal && (
        <p className="text-xs text-[var(--text-secondary)] mb-4 line-clamp-2">
          {sprint.goal}
        </p>
      )}

      {/* Progress bar (stacked by status) */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {percentComplete}% complete
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">
            {progress.done}/{total} items
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden flex">
          {STATUS_SEGMENTS.map(({ key, color }) => {
            const count = progress[key];
            if (count === 0) return null;
            const width = (count / total) * 100;
            return (
              <div
                key={key}
                className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                style={{ width: `${width}%`, backgroundColor: color }}
              />
            );
          })}
        </div>
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4">
        {STATUS_SEGMENTS.map(({ key, color, label }) => (
          <div key={key} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-[var(--text-secondary)]">
              {label}: {progress[key]}
            </span>
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--text-primary)]">
            {daysRemaining}
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">Days left</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--text-primary)]">
            {progress.completedPoints}/{progress.totalPoints}
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">Story points</div>
        </div>
        <div className="text-center">
          <div className={`text-lg font-bold ${timePercent > percentComplete + 15 ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>
            {timePercent}%
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">Time elapsed</div>
        </div>
      </div>
    </div>
  );
}
