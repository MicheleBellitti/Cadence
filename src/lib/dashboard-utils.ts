import type { Item, ScheduledItem, Sprint, TeamMember, Status } from "@/types";
import { parseDate, formatDate } from "./date-utils";

// ─── Sprint progress ────────────────────────────────────────────────────────

export interface SprintProgress {
  sprint: Sprint;
  total: number;
  done: number;
  inProgress: number;
  inReview: number;
  todo: number;
  totalPoints: number;
  completedPoints: number;
  /** 0–100 percentage of items done */
  percentComplete: number;
  /** Days remaining in sprint (business or calendar as appropriate) */
  daysRemaining: number;
  /** Total sprint duration in days */
  totalDays: number;
}

const STATUS_COUNT_KEYS: Record<Status, keyof Pick<SprintProgress, "todo" | "inProgress" | "inReview" | "done">> = {
  todo: "todo",
  in_progress: "inProgress",
  in_review: "inReview",
  done: "done",
};

export function computeSprintProgress(
  sprint: Sprint,
  items: Item[],
  todayStr: string
): SprintProgress {
  const sprintItems = items.filter((i) => i.sprintId === sprint.id);
  const total = sprintItems.length;

  const counts = { todo: 0, inProgress: 0, inReview: 0, done: 0 };
  let totalPoints = 0;
  let completedPoints = 0;

  for (const item of sprintItems) {
    counts[STATUS_COUNT_KEYS[item.status]]++;
    if (item.type === "story") {
      totalPoints += item.storyPoints;
      if (item.status === "done") {
        completedPoints += item.storyPoints;
      }
    }
  }

  const percentComplete = total > 0 ? Math.round((counts.done / total) * 100) : 0;

  let daysRemaining = 0;
  let totalDays = 0;
  if (sprint.startDate && sprint.endDate) {
    const start = new Date(sprint.startDate);
    const end = new Date(sprint.endDate);
    const today = new Date(todayStr);
    totalDays = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    daysRemaining = Math.max(0, Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
  }

  return {
    sprint,
    total,
    ...counts,
    totalPoints,
    completedPoints,
    percentComplete,
    daysRemaining,
    totalDays,
  };
}

// ─── My tasks ───────────────────────────────────────────────────────────────

/**
 * Returns items assigned to the current user.
 * A user's tasks are items whose `assigneeIds` include a TeamMember
 * whose `linkedUserId` matches the given Firebase UID.
 */
export function getMyTasks(
  items: Item[],
  team: TeamMember[],
  uid: string
): Item[] {
  const myMemberIds = new Set(
    team.filter((m) => m.linkedUserId === uid).map((m) => m.id)
  );
  if (myMemberIds.size === 0) return [];

  return items
    .filter(
      (item) =>
        item.status !== "done" &&
        item.assigneeIds.some((aid) => myMemberIds.has(aid))
    )
    .sort((a, b) => {
      // Critical/high first, then by status (in_progress > in_review > todo)
      const priorityOrder: Record<string, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      const statusOrder: Record<string, number> = {
        in_progress: 0,
        in_review: 1,
        todo: 2,
      };
      const pa = priorityOrder[a.priority] ?? 9;
      const pb = priorityOrder[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      const sa = statusOrder[a.status] ?? 9;
      const sb = statusOrder[b.status] ?? 9;
      return sa - sb;
    });
}

// ─── At-risk items ──────────────────────────────────────────────────────────

export interface AtRiskItem {
  item: Item;
  scheduled: ScheduledItem;
  reason: "critical-path" | "overdue" | "both";
}

/**
 * Returns items that are at risk: on the critical path, overdue, or both.
 *
 * - **Critical path**: isCritical === true AND status !== "done"
 * - **Overdue**: scheduled endDate < today AND status !== "done"
 */
export function getAtRiskItems(
  items: Item[],
  scheduled: ScheduledItem[],
  todayStr: string
): AtRiskItem[] {
  const today = parseDate(todayStr);
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const results: AtRiskItem[] = [];

  for (const s of scheduled) {
    const item = itemMap.get(s.itemId);
    if (!item || item.status === "done") continue;

    const isCritical = s.isCritical;
    const isOverdue = parseDate(s.endDate).getTime() < today.getTime();

    if (isCritical || isOverdue) {
      const reason: AtRiskItem["reason"] =
        isCritical && isOverdue ? "both" : isCritical ? "critical-path" : "overdue";
      results.push({ item, scheduled: s, reason });
    }
  }

  // Sort: "both" first, then "overdue", then "critical-path"
  const reasonOrder: Record<string, number> = { both: 0, overdue: 1, "critical-path": 2 };
  results.sort((a, b) => (reasonOrder[a.reason] ?? 9) - (reasonOrder[b.reason] ?? 9));

  return results;
}

// ─── Today's date helper ────────────────────────────────────────────────────

export function getTodayStr(): string {
  return formatDate(new Date());
}
