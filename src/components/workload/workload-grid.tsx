"use client";
import { useMemo, useState } from "react";
import { useItems, useTeam, useOverrides } from "@/stores/project-store";
import { scheduleForward } from "@/lib/scheduler";
import { computeWorkload } from "@/lib/workload";
import type { WorkloadDay } from "@/lib/workload";
import { formatDate, isBusinessDay } from "@/lib/date-utils";
import { WorkloadCell } from "./workload-cell";
import { WorkloadDrilldown } from "./workload-drilldown";
import type { TeamMember } from "@/types";

/** Build the list of business days in [startDate, endDate] inclusive. */
function getBusinessDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  let current = new Date(start);
  while (current <= end) {
    if (isBusinessDay(current)) {
      days.push(formatDate(current));
    }
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}

/** Format a YYYY-MM-DD string to "Mon 30" abbreviated header. */
function formatDayHeader(dateStr: string): string {
  // Parse as local date to match formatDate (local midnight)
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
  return `${dayName} ${day}`;
}

/** Get the start of the current week (Monday). */
function getMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

interface DrilldownState {
  workloadDay: WorkloadDay;
  member: TeamMember;
  dateLabel: string;
}

export function WorkloadGrid() {
  const items = useItems();
  const team = useTeam();
  const overrides = useOverrides();
  const today = formatDate(new Date());

  // 3-week window: current week Monday → Monday + 14 days (= 3 full Mon-Fri weeks)
  const { startDate, endDate } = useMemo(() => {
    const monday = getMonday(new Date());
    const end = new Date(monday.getTime() + 20 * 24 * 60 * 60 * 1000); // +20 calendar days covers 3 weeks Mon-Fri
    return {
      startDate: formatDate(monday),
      endDate: formatDate(end),
    };
  }, []);

  const businessDays = useMemo(
    () => getBusinessDays(startDate, endDate),
    [startDate, endDate]
  );

  const scheduled = useMemo(
    () => scheduleForward(items, overrides, today),
    [items, overrides, today]
  );

  const workload = useMemo(
    () => computeWorkload(items, scheduled, team, startDate, endDate),
    [items, scheduled, team, startDate, endDate]
  );

  // Build a lookup: memberId → date → WorkloadDay
  const workloadMap = useMemo(() => {
    const map = new Map<string, Map<string, WorkloadDay>>();
    for (const wd of workload) {
      if (!map.has(wd.memberId)) {
        map.set(wd.memberId, new Map());
      }
      map.get(wd.memberId)!.set(wd.date, wd);
    }
    return map;
  }, [workload]);

  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);

  if (team.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-4">
          Workload
        </h1>
        <p className="text-[var(--text-secondary)]">
          No team members found. Add team members in Settings to see the workload view.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-6">
        Workload
      </h1>

      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1" style={{ minWidth: "max-content" }}>
          <thead>
            <tr>
              {/* Sticky member column header */}
              <th
                className="sticky left-0 z-10 bg-[var(--bg-primary)] text-left text-xs font-medium text-[var(--text-secondary)] px-3 py-2 min-w-[140px]"
              >
                Member
              </th>
              {businessDays.map((date) => (
                <th
                  key={date}
                  className="text-xs font-medium text-[var(--text-secondary)] px-1 py-2 min-w-[56px] text-center whitespace-nowrap"
                >
                  {formatDayHeader(date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.map((member) => {
              const memberDays = workloadMap.get(member.id);
              return (
                <tr key={member.id}>
                  {/* Sticky member name column */}
                  <td className="sticky left-0 z-10 bg-[var(--bg-primary)] px-3 py-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-6 h-6 rounded-full flex-shrink-0 border border-[var(--border)]"
                        style={{ backgroundColor: member.color }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate max-w-[90px]">
                          {member.name}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] truncate max-w-[90px]">
                          {member.role}
                        </p>
                      </div>
                    </div>
                  </td>
                  {businessDays.map((date) => {
                    const wd = memberDays?.get(date);
                    return (
                      <td key={date} className="px-0.5 py-1">
                        <WorkloadCell
                          workloadDay={wd}
                          onClick={() => {
                            if (wd && wd.items.length > 0) {
                              setDrilldown({
                                workloadDay: wd,
                                member,
                                dateLabel: formatDayHeader(date),
                              });
                            }
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-[var(--text-secondary)]">
        <div className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded"
            style={{ backgroundColor: "color-mix(in srgb, var(--success) 15%, transparent)" }}
          />
          &lt;80% utilized
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded"
            style={{ backgroundColor: "color-mix(in srgb, var(--warning) 15%, transparent)" }}
          />
          80–100%
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded"
            style={{ backgroundColor: "color-mix(in srgb, var(--danger) 15%, transparent)" }}
          />
          &gt;100% (over capacity)
        </div>
      </div>

      <WorkloadDrilldown
        open={drilldown !== null}
        onClose={() => setDrilldown(null)}
        workloadDay={drilldown?.workloadDay ?? null}
        member={drilldown?.member ?? null}
        items={items}
        dateLabel={drilldown?.dateLabel ?? ""}
      />
    </div>
  );
}
