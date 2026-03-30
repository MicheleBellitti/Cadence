import type { Item, TeamMember, ScheduledItem } from "@/types";
import { isBusinessDay } from "./date-utils";

export interface WorkloadDay {
  date: string;
  memberId: string;
  totalHours: number;
  capacity: number;
  utilization: number;
  items: string[];
}

/** Parse a YYYY-MM-DD string to a UTC-midnight Date (consistent with isBusinessDay). */
function parseDateUTC(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Format a UTC-midnight Date to a YYYY-MM-DD string. */
function formatDateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Add `n` calendar days to a UTC-midnight Date. */
function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 24 * 60 * 60 * 1000);
}

export function computeWorkload(
  items: Item[],
  scheduled: ScheduledItem[],
  team: TeamMember[],
  startDate: string,
  endDate: string
): WorkloadDay[] {
  // Build a map from itemId → ScheduledItem for quick lookup
  const scheduleMap = new Map<string, ScheduledItem>();
  for (const s of scheduled) {
    scheduleMap.set(s.itemId, s);
  }

  // Filter items to only those that are assigned and not done
  const activeItems = items.filter(
    (item) => item.assigneeId !== null && item.status !== "done"
  );

  const rangeStart = parseDateUTC(startDate);
  const rangeEnd = parseDateUTC(endDate);

  const result: WorkloadDay[] = [];

  for (const member of team) {
    // Items assigned to this member that have a schedule entry
    const memberItems = activeItems.filter(
      (item) => item.assigneeId === member.id && scheduleMap.has(item.id)
    );

    // Iterate through each calendar day in the range
    let current = new Date(rangeStart);
    while (current.getTime() <= rangeEnd.getTime()) {
      // Skip weekends (isBusinessDay uses getUTCDay, consistent with UTC-midnight dates)
      if (!isBusinessDay(current)) {
        current = addDays(current, 1);
        continue;
      }

      const dateStr = formatDateUTC(current);

      // Find items assigned to this member whose scheduled range overlaps this day
      const overlappingItems: string[] = [];
      for (const item of memberItems) {
        const s = scheduleMap.get(item.id)!;
        const itemStart = parseDateUTC(s.startDate);
        const itemEnd = parseDateUTC(s.endDate);

        if (
          current.getTime() >= itemStart.getTime() &&
          current.getTime() <= itemEnd.getTime()
        ) {
          overlappingItems.push(item.id);
        }
      }

      // Only emit a WorkloadDay if there are contributing items
      if (overlappingItems.length > 0) {
        // Each item contributes member.hoursPerDay regardless of overlap count
        const totalHours = overlappingItems.length * member.hoursPerDay;
        const capacity = member.hoursPerDay;
        const utilization = totalHours / capacity;

        result.push({
          date: dateStr,
          memberId: member.id,
          totalHours,
          capacity,
          utilization,
          items: overlappingItems,
        });
      }

      current = addDays(current, 1);
    }
  }

  return result;
}
