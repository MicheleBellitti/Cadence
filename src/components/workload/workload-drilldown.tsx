"use client";
import type { WorkloadDay } from "@/lib/workload";
import type { Item, TeamMember } from "@/types";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";

interface WorkloadDrilldownProps {
  open: boolean;
  onClose: () => void;
  workloadDay: WorkloadDay | null;
  member: TeamMember | null;
  items: Item[];
  dateLabel: string;
}

const TYPE_VARIANT: Record<string, "blue" | "success" | "purple" | "danger" | "default"> = {
  epic: "purple",
  story: "blue",
  task: "success",
  bug: "danger",
};

export function WorkloadDrilldown({
  open,
  onClose,
  workloadDay,
  member,
  items,
  dateLabel,
}: WorkloadDrilldownProps) {
  if (!workloadDay || !member) return null;

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const contributingItems = workloadDay.items
    .map((id) => itemMap.get(id))
    .filter((i): i is Item => i !== undefined);

  const title = `${member.name} \u2014 ${dateLabel}`;

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        {contributingItems.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No items for this day.</p>
        ) : (
          contributingItems.map((item) => {
            const hoursContributed = member.hoursPerDay;
            return (
              <div
                key={item.id}
                className="flex items-start gap-3 p-3 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={TYPE_VARIANT[item.type] ?? "default"}>
                      {item.type}
                    </Badge>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {item.estimatedDays} day{item.estimatedDays !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <span className="text-sm font-medium text-[var(--text-primary)] flex-shrink-0">
                  {hoursContributed}h
                </span>
              </div>
            );
          })
        )}

        {/* Totals */}
        <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
          <span className="text-sm text-[var(--text-secondary)]">
            Total: {workloadDay.totalHours}h / {workloadDay.capacity}h capacity
          </span>
          <span
            className={`text-sm font-medium ${
              workloadDay.utilization > 1
                ? "text-[var(--danger)]"
                : workloadDay.utilization >= 0.8
                ? "text-[var(--warning)]"
                : "text-[var(--success)]"
            }`}
          >
            {Math.round(workloadDay.utilization * 100)}% utilized
          </span>
        </div>
      </div>
    </Modal>
  );
}
