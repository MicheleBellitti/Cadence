import type { Item, GanttOverride, ScheduledItem } from "@/types";
import { addBusinessDays, isBusinessDay, parseDate, formatDate } from "./date-utils";

/**
 * Returns the next business day strictly after `date`.
 * If `date` is a Friday, returns the following Monday.
 */
function nextBusinessDayAfter(date: Date): Date {
  // Add 1 calendar day, then advance through any weekend days
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  let next = new Date(date.getTime() + ONE_DAY_MS);
  while (!isBusinessDay(next)) {
    next = new Date(next.getTime() + ONE_DAY_MS);
  }
  return next;
}

/**
 * Returns the later of two dates by time comparison.
 */
function laterDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

/**
 * Topological sort of items using DFS.
 * Items whose dependencies reference IDs not in the items array are treated
 * as if those dependencies don't exist (they are skipped).
 */
function topologicalSort(items: Item[]): Item[] {
  const idToItem = new Map<string, Item>();
  for (const item of items) {
    idToItem.set(item.id, item);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>(); // cycle detection
  const result: Item[] = [];

  function visit(item: Item): void {
    if (visited.has(item.id)) return;
    if (visiting.has(item.id)) {
      // Cycle detected — skip to avoid infinite loop
      return;
    }

    visiting.add(item.id);

    for (const depId of item.dependencies) {
      const dep = idToItem.get(depId);
      if (dep) {
        visit(dep);
      }
      // If dep not in our items list, skip it
    }

    visiting.delete(item.id);
    visited.add(item.id);
    result.push(item);
  }

  for (const item of items) {
    visit(item);
  }

  return result;
}

/**
 * Forward scheduling engine.
 *
 * Computes start/end dates for all items based on:
 * - Dependencies (successor starts the next business day after the latest predecessor ends)
 * - Manual overrides (start = max(computedStart, overrideDate))
 * - Done items collapse to start = end = today
 *
 * Sets earlyStart/earlyFinish equal to startDate/endDate.
 * lateStart, lateFinish, slack, isCritical are left at defaults
 * (to be computed by the critical-path module).
 */
export function scheduleForward(
  items: Item[],
  overrides: GanttOverride[],
  todayStr: string
): ScheduledItem[] {
  const today = parseDate(todayStr);

  // Build override lookup
  const overrideMap = new Map<string, Date>();
  for (const override of overrides) {
    overrideMap.set(override.itemId, parseDate(override.startDate));
  }

  // Topological sort
  const sorted = topologicalSort(items);

  // Map from itemId → computed end date (for dependency resolution)
  const endDateMap = new Map<string, Date>();

  const results: ScheduledItem[] = [];

  for (const item of sorted) {
    // Done items: zero residual
    if (item.status === "done") {
      const startDate = formatDate(today);
      const endDate = formatDate(today);
      results.push({
        itemId: item.id,
        startDate,
        endDate,
        earlyStart: startDate,
        earlyFinish: endDate,
        lateStart: "",
        lateFinish: "",
        slack: 0,
        isCritical: false,
      });
      endDateMap.set(item.id, today);
      continue;
    }

    // Compute start from dependencies
    let computedStart: Date = today;

    for (const depId of item.dependencies) {
      const depEnd = endDateMap.get(depId);
      if (depEnd) {
        const nextDay = nextBusinessDayAfter(depEnd);
        computedStart = laterDate(computedStart, nextDay);
      }
    }

    // Apply override: start = max(computedStart, overrideDate)
    const override = overrideMap.get(item.id);
    if (override) {
      computedStart = laterDate(computedStart, override);
    }

    const startDate = computedStart;
    // end = addBusinessDays(start, estimatedDays)
    // addBusinessDays handles n <= 0 and n === 1 by returning the start day
    const endDate = addBusinessDays(startDate, item.estimatedDays);

    endDateMap.set(item.id, endDate);

    const startStr = formatDate(startDate);
    const endStr = formatDate(endDate);

    results.push({
      itemId: item.id,
      startDate: startStr,
      endDate: endStr,
      earlyStart: startStr,
      earlyFinish: endStr,
      lateStart: "",
      lateFinish: "",
      slack: 0,
      isCritical: false,
    });
  }

  return results;
}
