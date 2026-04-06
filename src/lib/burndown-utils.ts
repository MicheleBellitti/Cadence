import type { Item, Sprint } from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BurndownPoint {
  /** Date string YYYY-MM-DD */
  date: string;
  /** Items remaining (not done) at end of this day */
  remaining: number;
  /** Ideal remaining at this point (linear) */
  ideal: number;
}

export interface BurndownData {
  points: BurndownPoint[];
  totalItems: number;
  completedItems: number;
  /** Story points variant */
  totalPoints: number;
  completedPoints: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns an array of YYYY-MM-DD strings from `start` to `end` inclusive.
 * Only includes calendar days (burndown charts typically show all days).
 */
function dateRange(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  const start = new Date(startStr);
  const end = new Date(endStr);
  const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUTC = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  while (current <= endUTC) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, "0");
    const d = String(current.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Extracts a YYYY-MM-DD date string from an ISO timestamp or date string.
 */
function toDateStr(isoStr: string): string {
  return isoStr.slice(0, 10);
}

// ─── Burndown computation ───────────────────────────────────────────────────

/**
 * Computes burndown data for a sprint.
 *
 * Uses item count (not story points) as the Y-axis.
 * For "done" items, uses `updatedAt` as a proxy for completion time —
 * this is the best approximation without a dedicated `completedAt` field.
 *
 * @param sprint - The sprint (must have startDate and endDate)
 * @param items - All project items
 * @param todayStr - Today's date YYYY-MM-DD (to stop the actual line at today)
 * @returns BurndownData with daily points, or null if sprint has no dates
 */
export function computeBurndown(
  sprint: Sprint,
  items: Item[],
  todayStr: string
): BurndownData | null {
  if (!sprint.startDate || !sprint.endDate) return null;

  const sprintStart = toDateStr(sprint.startDate);
  const sprintEnd = toDateStr(sprint.endDate);
  const sprintItems = items.filter((i) => i.sprintId === sprint.id);

  const totalItems = sprintItems.length;
  if (totalItems === 0) {
    return { points: [], totalItems: 0, completedItems: 0, totalPoints: 0, completedPoints: 0 };
  }

  // Build a map of date → number of items completed on that date.
  // Uses `updatedAt` as proxy for completion time.
  const completionsPerDay = new Map<string, number>();
  let completedItems = 0;
  let preSprintCompletions = 0;
  let totalPoints = 0;
  let completedPoints = 0;

  for (const item of sprintItems) {
    if (item.type === "story") {
      totalPoints += item.storyPoints;
    }
    if (item.status === "done") {
      completedItems++;
      if (item.type === "story") {
        completedPoints += item.storyPoints;
      }
      const doneDate = toDateStr(item.updatedAt);
      if (doneDate < sprintStart) {
        // Items completed before the sprint started — reduce initial remaining
        preSprintCompletions++;
      } else {
        completionsPerDay.set(doneDate, (completionsPerDay.get(doneDate) ?? 0) + 1);
      }
    }
  }

  // Generate daily points
  const allDates = dateRange(sprintStart, sprintEnd);
  const totalDays = allDates.length;
  const points: BurndownPoint[] = [];

  // Subtract pre-sprint completions so actual line starts at correct value
  let remaining = totalItems - preSprintCompletions;

  for (let i = 0; i < allDates.length; i++) {
    const date = allDates[i];

    // Ideal: linear from initial remaining on day 0 to 0 on last day
    const idealStart = totalItems - preSprintCompletions;
    const ideal = idealStart * (1 - (i / (totalDays - 1 || 1)));

    // Actual: subtract completions up to and including this date
    const completed = completionsPerDay.get(date) ?? 0;
    remaining -= completed;

    // Only include actual data up to today
    if (date <= todayStr) {
      points.push({
        date,
        remaining: Math.max(0, remaining),
        ideal: Math.round(ideal * 10) / 10,
      });
    } else {
      // Future dates: only show ideal line
      points.push({
        date,
        remaining: -1, // sentinel: no actual data
        ideal: Math.round(ideal * 10) / 10,
      });
    }
  }

  return { points, totalItems, completedItems, totalPoints, completedPoints };
}
