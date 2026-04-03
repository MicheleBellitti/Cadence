"use client";

import { AlertTriangle, Clock, ArrowRight, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AtRiskItem } from "@/lib/dashboard-utils";
import { ITEM_COLORS, STATUS_LABELS } from "@/types";
import type { BadgeVariant } from "@/components/ui/badge";

interface AtRiskCardProps {
  items: AtRiskItem[];
  onItemClick: (id: string) => void;
}

const TYPE_ICONS: Record<string, string> = {
  epic: "⬡",
  story: "◈",
  task: "◻",
  bug: "⬤",
};

const REASON_CONFIG: Record<
  AtRiskItem["reason"],
  { label: string; variant: BadgeVariant; icon: typeof Zap }
> = {
  both: { label: "Critical & Overdue", variant: "danger", icon: AlertTriangle },
  overdue: { label: "Overdue", variant: "warning", icon: Clock },
  "critical-path": { label: "Critical Path", variant: "purple", icon: Zap },
};

export function AtRiskCard({ items, onItemClick }: AtRiskCardProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <AlertTriangle size={16} className="text-[var(--warning)]" />
          At Risk
        </h2>
        {items.length > 0 && (
          <Badge variant="danger">{items.length}</Badge>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-[var(--success)]">
            No items at risk — everything is on track.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {items.map(({ item, scheduled, reason }) => {
            const config = REASON_CONFIG[reason];
            const ReasonIcon = config.icon;
            return (
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

                {/* Title */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-primary)] truncate">
                    {item.title}
                  </p>
                  {/* Scheduled end date */}
                  <p className="text-xs text-[var(--text-tertiary)]">
                    Ends: {scheduled.endDate} · Slack: {scheduled.slack}d
                  </p>
                </div>

                {/* Reason badge */}
                <Badge variant={config.variant} className="shrink-0">
                  <ReasonIcon size={10} className="mr-1" />
                  {config.label}
                </Badge>

                {/* Arrow hint on hover */}
                <ArrowRight
                  size={14}
                  className="shrink-0 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
