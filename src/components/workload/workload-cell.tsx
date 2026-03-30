"use client";
import type { WorkloadDay } from "@/lib/workload";

export interface WorkloadCellProps {
  workloadDay: WorkloadDay | undefined;
  onClick: () => void;
}

export function WorkloadCell({ workloadDay, onClick }: WorkloadCellProps) {
  if (!workloadDay || workloadDay.items.length === 0) {
    return (
      <div
        className="h-10 border border-[var(--border)] rounded cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors"
        onClick={onClick}
      />
    );
  }

  const { totalHours, utilization } = workloadDay;

  let bgStyle: React.CSSProperties;
  let textColor: string;

  if (utilization > 1) {
    // Over capacity — red tint
    bgStyle = { backgroundColor: "color-mix(in srgb, var(--danger) 15%, transparent)" };
    textColor = "text-[var(--danger)]";
  } else if (utilization >= 0.8) {
    // 80–100% — yellow tint
    bgStyle = { backgroundColor: "color-mix(in srgb, var(--warning) 15%, transparent)" };
    textColor = "text-[var(--warning)]";
  } else {
    // Under 80% — green tint
    bgStyle = { backgroundColor: "color-mix(in srgb, var(--success) 15%, transparent)" };
    textColor = "text-[var(--success)]";
  }

  return (
    <div
      className={`h-10 border border-[var(--border)] rounded cursor-pointer flex items-center justify-center transition-opacity hover:opacity-80 ${textColor}`}
      style={bgStyle}
      onClick={onClick}
      title={`${totalHours}h (${Math.round(utilization * 100)}%)`}
    >
      <span className="text-xs font-medium">{totalHours}h</span>
    </div>
  );
}
