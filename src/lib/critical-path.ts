import type { Item, ScheduledItem } from "@/types";
import { businessDaysBetween, isBusinessDay } from "./date-utils";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parses a YYYY-MM-DD string directly to UTC midnight.
 * This avoids local-timezone shifts that occur with new Date(year, month, day).
 * All internal Date arithmetic in this module uses UTC midnight.
 */
function parseDateUTC(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Formats a UTC midnight date to a YYYY-MM-DD string.
 * Uses UTC accessors so the result is correct regardless of local timezone.
 */
function formatDateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns the last business day strictly before `date`.
 * Assumes `date` is UTC midnight.
 */
function prevBusinessDay(date: Date): Date {
  let d = new Date(date.getTime() - ONE_DAY_MS);
  while (!isBusinessDay(d)) {
    d = new Date(d.getTime() - ONE_DAY_MS);
  }
  return d;
}

/**
 * Returns the date that is `n-1` business days before `date` (going backwards).
 * This is the inverse of addBusinessDays: if addBusinessDays(result, n) = date,
 * then subtractBusinessDays(date, n) = result.
 *
 * For n <= 1, returns date unchanged (a 1-day task starts and ends on same day).
 * Assumes `date` is UTC midnight.
 */
function subtractBusinessDays(date: Date, n: number): Date {
  if (n <= 1) return date;

  let remaining = n - 1;
  let current = date;
  while (remaining > 0) {
    current = new Date(current.getTime() - ONE_DAY_MS);
    if (isBusinessDay(current)) {
      remaining--;
    }
  }
  return current;
}

/**
 * Computes the Critical Path Method backward pass, filling in lateStart,
 * lateFinish, slack, and isCritical for each ScheduledItem.
 *
 * @param items - The original items (with dependency info)
 * @param scheduled - Forward-scheduled items (earlyStart/earlyFinish already set)
 * @param deadline - Optional project deadline string (YYYY-MM-DD)
 * @returns Updated ScheduledItem array with all CPM fields filled in
 */
export function computeCriticalPath(
  items: Item[],
  scheduled: ScheduledItem[],
  deadline: string | null
): ScheduledItem[] {
  // 1. Build maps
  const itemMap = new Map<string, Item>();
  for (const item of items) {
    itemMap.set(item.id, item);
  }

  const scheduledMap = new Map<string, ScheduledItem>();
  for (const s of scheduled) {
    scheduledMap.set(s.itemId, s);
  }

  // Build successor map: for each item, which items depend on it?
  const successors = new Map<string, string[]>();
  for (const item of items) {
    if (!successors.has(item.id)) {
      successors.set(item.id, []);
    }
    for (const depId of item.dependencies) {
      if (!successors.has(depId)) {
        successors.set(depId, []);
      }
      successors.get(depId)!.push(item.id);
    }
  }

  // 2. Find terminal nodes (items with no successors)
  const terminalIds = new Set<string>();
  for (const item of items) {
    const succs = successors.get(item.id) ?? [];
    if (succs.length === 0) {
      terminalIds.add(item.id);
    }
  }

  // 3. Determine project end date (UTC midnight)
  // = deadline if provided, else max(earlyFinish) across all items
  let projectEnd: Date;

  if (deadline) {
    projectEnd = parseDateUTC(deadline);
  } else {
    let maxEnd: Date | null = null;
    for (const s of scheduled) {
      if (s.earlyFinish) {
        const d = parseDateUTC(s.earlyFinish);
        if (!maxEnd || d.getTime() > maxEnd.getTime()) {
          maxEnd = d;
        }
      }
    }
    projectEnd =
      maxEnd ??
      parseDateUTC(scheduled[0]?.earlyFinish ?? "2026-01-01");
  }

  // 4. Backward pass
  // We process items in reverse topological order.
  // All dates in lateFinishMap and lateStartMap are UTC midnight.
  const lateFinishMap = new Map<string, Date>();
  const lateStartMap = new Map<string, Date>();

  const topoOrder = topologicalSort(items);

  // Process in reverse topological order (from terminals back to roots)
  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const item = topoOrder[i];
    const s = scheduledMap.get(item.id);
    if (!s) continue;

    let lf: Date;

    if (terminalIds.has(item.id)) {
      // Terminal node: lateFinish = project end
      lf = projectEnd;
    } else {
      // lateFinish = last business day before the earliest lateStart of successors
      // (because the successor starts the next business day after this item finishes)
      const succIds = successors.get(item.id) ?? [];
      let minSuccLateStart: Date | null = null;
      for (const succId of succIds) {
        const succLateStart = lateStartMap.get(succId);
        if (succLateStart) {
          if (
            !minSuccLateStart ||
            succLateStart.getTime() < minSuccLateStart.getTime()
          ) {
            minSuccLateStart = succLateStart;
          }
        }
      }
      if (!minSuccLateStart) {
        // Fallback: shouldn't happen in a valid DAG
        lf = projectEnd;
      } else {
        lf = prevBusinessDay(minSuccLateStart);
      }
    }

    // lateStart = lateFinish - (estimatedDays - 1) business days
    const ls = subtractBusinessDays(lf, item.estimatedDays);

    lateFinishMap.set(item.id, lf);
    lateStartMap.set(item.id, ls);
  }

  // 5. Compute slack and mark critical
  return scheduled.map((s) => {
    const lf = lateFinishMap.get(s.itemId);
    const ls = lateStartMap.get(s.itemId);

    if (!lf || !ls) {
      return s;
    }

    const lateStartStr = formatDateUTC(ls);
    const lateFinishStr = formatDateUTC(lf);

    // Both earlyStart and lateStart are converted from strings directly to
    // UTC midnight (via parseDateUTC), ensuring consistent comparison in
    // businessDaysBetween which normalizes to UTC midnight internally.
    const slack = businessDaysBetween(
      parseDateUTC(s.earlyStart),
      parseDateUTC(lateStartStr)
    );
    const isCritical = slack === 0;

    return {
      ...s,
      lateStart: lateStartStr,
      lateFinish: lateFinishStr,
      slack,
      isCritical,
    };
  });
}

/**
 * Checks if adding a dependency "fromId depends on toId" would create a cycle.
 *
 * We do DFS from `toId` following existing dependencies.
 * If we can reach `fromId`, there's a cycle.
 * Also handles self-dependency: fromId === toId → always a cycle.
 */
export function hasCycle(items: Item[], fromId: string, toId: string): boolean {
  // Self-dependency
  if (fromId === toId) return true;

  // Build adjacency: item → its dependencies (items that item depends on)
  const depsMap = new Map<string, string[]>();
  for (const item of items) {
    depsMap.set(item.id, item.dependencies);
  }

  // DFS from toId following existing dependencies.
  // If we reach fromId, then adding "fromId depends on toId" would create a cycle:
  // toId → ... → fromId → toId
  const visited = new Set<string>();
  const stack = [toId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === fromId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = depsMap.get(current) ?? [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        stack.push(dep);
      }
    }
  }

  return false;
}

/**
 * Topological sort of items using DFS (same as scheduler.ts).
 * Returns items in order from no-dependencies to most-dependent.
 */
function topologicalSort(items: Item[]): Item[] {
  const idToItem = new Map<string, Item>();
  for (const item of items) {
    idToItem.set(item.id, item);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const result: Item[] = [];

  function visit(item: Item): void {
    if (visited.has(item.id)) return;
    if (visiting.has(item.id)) return; // cycle, skip

    visiting.add(item.id);

    for (const depId of item.dependencies) {
      const dep = idToItem.get(depId);
      if (dep) {
        visit(dep);
      }
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
