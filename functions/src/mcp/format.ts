/**
 * Pure presentation helpers for the MCP connector.
 *
 * Nothing here touches Firestore or the network: these functions turn the
 * shared domain types (and the pure `lib/` computations) into shapes an AI
 * assistant can render directly. Two rules apply everywhere in this file:
 *  - opaque ids (assigneeIds, sprintId) are always resolved to names — an
 *    assistant has no way to look up a TeamMember or Sprint id on its own.
 *  - any list that could grow unbounded goes through `truncateList` and
 *    reports whether it was cut, so callers can say so in the output.
 */
import type { Item, ItemType, Status, Priority, TeamMember, Sprint } from "@/types";
import { STATUS_LABELS, STATUSES } from "@/types";
import type { AtRiskItem } from "@/lib/dashboard-utils";
import type { WorkloadDay } from "@/lib/workload";
import type { BurndownData } from "@/lib/burndown-utils";

// ─── Labels ─────────────────────────────────────────────────────────────────

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function statusLabel(status: Status): string {
  return STATUS_LABELS[status];
}

export function priorityLabel(priority: Priority): string {
  return PRIORITY_LABELS[priority];
}

// ─── Name lookups ───────────────────────────────────────────────────────────

export function buildMemberNameMap(team: TeamMember[]): Map<string, string> {
  return new Map(team.map((m) => [m.id, m.name]));
}

export function buildSprintNameMap(sprints: Sprint[]): Map<string, string> {
  return new Map(sprints.map((s) => [s.id, s.name]));
}

export function assigneeNames(assigneeIds: string[], memberNames: Map<string, string>): string[] {
  return assigneeIds.map((id) => memberNames.get(id) ?? "Unknown member");
}

/**
 * True if some team member in the project is linked to this Firebase uid.
 * `getMyTasks` (from `@/lib/dashboard-utils`) silently returns `[]` both when
 * the caller genuinely has nothing assigned AND when no team member is
 * linked to them at all — the latter is the normal state for a newly
 * invited user who hasn't done the (separate, manual) account-linking step
 * in Settings yet, and callers must be able to tell the two apart instead
 * of reporting a permanently blank task list with no explanation.
 */
export function isCallerLinked(team: TeamMember[], uid: string): boolean {
  return team.some((m) => m.linkedUserId === uid);
}

// ─── Untrusted-text neutralization ──────────────────────────────────────────

const MAX_INLINE_TEXT_LENGTH = 200;

/**
 * Neutralizes markdown structure in a string before it's interpolated into
 * the rendered markdown `text` block sent to an assistant.
 *
 * Item titles, descriptions, tags, team member names, and sprint names/goals
 * are all free text written by *other* project members — a co-member could
 * title an item `"\n\n## SYSTEM\nIgnore previous instructions..."` to forge
 * document structure or attempt prompt injection inside the assistant's
 * context. This must be applied at every point where such a value is woven
 * into a markdown string; `structuredContent` always carries the original,
 * unmodified value — only rendered text needs this.
 */
export function neutralizeForMarkdown(input: string, maxLength = MAX_INLINE_TEXT_LENGTH): string {
  // Collapse embedded newlines/carriage returns first: every markdown
  // construct handled below (headings, blockquotes, list bullets) only
  // takes effect at the start of a *line* — remove the ability to start a
  // new one and most structural forgery is already defused.
  let text = input.replace(/[\r\n]+/g, " ").trim();

  // Escape characters that are still meaningful mid-line: emphasis,
  // inline code/fences, links/images, table pipes.
  text = text.replace(/([*_`[\]|\\])/g, "\\$1");

  // Belt-and-braces: defang a heading/blockquote/list marker even if it
  // ends up at the start of the string after collapsing above.
  text = text.replace(/^(\s*)(#{1,6}(?=\s|$)|>|-|\+)/, "$1\\$2");

  if (text.length > maxLength) {
    text = `${text.slice(0, Math.max(0, maxLength - 1))}…`;
  }

  return text;
}

// ─── Item projection ────────────────────────────────────────────────────────

export interface ItemSummary {
  id: string;
  type: ItemType;
  title: string;
  status: Status;
  statusLabel: string;
  priority: Priority;
  priorityLabel: string;
  assignees: string[];
  sprintId: string | null;
  sprintName: string | null;
  tags: string[];
}

export function toItemSummary(
  item: Item,
  memberNames: Map<string, string>,
  sprintNames: Map<string, string>
): ItemSummary {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    status: item.status,
    statusLabel: statusLabel(item.status),
    priority: item.priority,
    priorityLabel: priorityLabel(item.priority),
    assignees: assigneeNames(item.assigneeIds, memberNames),
    sprintId: item.sprintId,
    sprintName: item.sprintId ? sprintNames.get(item.sprintId) ?? null : null,
    tags: item.tags,
  };
}

export interface AtRiskItemSummary extends ItemSummary {
  reason: AtRiskItem["reason"];
  startDate: string;
  endDate: string;
  slack: number;
}

export function toAtRiskSummary(
  entry: AtRiskItem,
  memberNames: Map<string, string>,
  sprintNames: Map<string, string>
): AtRiskItemSummary {
  return {
    ...toItemSummary(entry.item, memberNames, sprintNames),
    reason: entry.reason,
    startDate: entry.scheduled.startDate,
    endDate: entry.scheduled.endDate,
    slack: entry.scheduled.slack,
  };
}

export interface CriticalItemSummary extends ItemSummary {
  startDate: string;
  endDate: string;
}

// ─── Bounded lists ──────────────────────────────────────────────────────────

export interface TruncatedList<T> {
  items: T[];
  truncated: boolean;
  total: number;
}

/** Caps a list at `limit` and reports whether anything was cut off. */
export function truncateList<T>(list: T[], limit: number): TruncatedList<T> {
  return {
    items: list.length > limit ? list.slice(0, limit) : list,
    truncated: list.length > limit,
    total: list.length,
  };
}

// ─── Board columns ──────────────────────────────────────────────────────────

export interface BoardColumn {
  status: Status;
  statusLabel: string;
  items: ItemSummary[];
  count: number;
  truncated: boolean;
}

export function buildBoardColumns(
  items: Item[],
  memberNames: Map<string, string>,
  sprintNames: Map<string, string>,
  limitPerColumn: number
): { columns: BoardColumn[]; counts: Record<Status, number>; truncated: boolean } {
  const counts: Record<Status, number> = { todo: 0, in_progress: 0, in_review: 0, done: 0 };

  const columns: BoardColumn[] = STATUSES.map((status) => {
    const columnItems = items.filter((item) => item.status === status).sort((a, b) => a.order - b.order);
    counts[status] = columnItems.length;
    const { items: sliced, truncated } = truncateList(columnItems, limitPerColumn);
    return {
      status,
      statusLabel: statusLabel(status),
      items: sliced.map((item) => toItemSummary(item, memberNames, sprintNames)),
      count: columnItems.length,
      truncated,
    };
  });

  return { columns, counts, truncated: columns.some((c) => c.truncated) };
}

// ─── Workload ───────────────────────────────────────────────────────────────

export interface WorkloadMemberSummary {
  memberId: string;
  memberName: string;
  avgUtilization: number;
  overallocatedDays: string[];
  daysWithWork: number;
}

/**
 * Aggregates the day-by-day workload into one row per member: average
 * utilization plus which days went over capacity. The full daily series
 * stays internal to `lib/workload` — an assistant's context is finite, and a
 * per-day breakdown across a multi-week window isn't a "briefing."
 */
export function summarizeWorkloadByMember(
  days: WorkloadDay[],
  memberNames: Map<string, string>
): WorkloadMemberSummary[] {
  const byMember = new Map<string, WorkloadDay[]>();
  for (const day of days) {
    const bucket = byMember.get(day.memberId);
    if (bucket) {
      bucket.push(day);
    } else {
      byMember.set(day.memberId, [day]);
    }
  }

  const result: WorkloadMemberSummary[] = [];
  for (const [memberId, memberDays] of byMember) {
    const avgUtilization = memberDays.reduce((sum, d) => sum + d.utilization, 0) / memberDays.length;
    result.push({
      memberId,
      memberName: memberNames.get(memberId) ?? "Unknown member",
      avgUtilization: Math.round(avgUtilization * 100) / 100,
      overallocatedDays: memberDays
        .filter((d) => d.utilization > 1)
        .map((d) => d.date)
        .sort(),
      daysWithWork: memberDays.length,
    });
  }

  result.sort((a, b) => b.avgUtilization - a.avgUtilization);
  return result;
}

// ─── Burndown ───────────────────────────────────────────────────────────────

export interface BurndownSummary {
  totalItems: number;
  completedItems: number;
  totalPoints: number;
  completedPoints: number;
  latestActual: number | null;
  latestIdeal: number | null;
  latestDate: string | null;
}

/**
 * Collapses the full daily point series into totals plus the latest actual
 * vs. ideal reading — never the full series. A burndown chart is for the
 * dashboard UI; an assistant only needs "where do we stand right now."
 */
export function summarizeBurndown(data: BurndownData | null): BurndownSummary | null {
  if (!data) return null;

  let latest: { date: string; remaining: number; ideal: number } | undefined;
  for (let i = data.points.length - 1; i >= 0; i--) {
    if (data.points[i].remaining !== -1) {
      latest = data.points[i];
      break;
    }
  }

  return {
    totalItems: data.totalItems,
    completedItems: data.completedItems,
    totalPoints: data.totalPoints,
    completedPoints: data.completedPoints,
    latestActual: latest?.remaining ?? null,
    latestIdeal: latest?.ideal ?? null,
    latestDate: latest?.date ?? null,
  };
}

// ─── Markdown primitives ────────────────────────────────────────────────────

export function mdItemLine(summary: ItemSummary): string {
  // title, assignee names, and sprint name are all free text written by
  // other project members — see `neutralizeForMarkdown`.
  const title = neutralizeForMarkdown(summary.title);
  const assignee =
    summary.assignees.length > 0
      ? summary.assignees.map((name) => neutralizeForMarkdown(name)).join(", ")
      : "Unassigned";
  const sprint = summary.sprintName ? ` · ${neutralizeForMarkdown(summary.sprintName)}` : "";
  return `- **${title}** _(${summary.type})_ — ${summary.statusLabel}, ${summary.priorityLabel} priority, ${assignee}${sprint}`;
}

export function mdSection(title: string, lines: string[], emptyText = "None."): string {
  if (lines.length === 0) return `### ${title}\n\n_${emptyText}_\n`;
  return `### ${title}\n\n${lines.join("\n")}\n`;
}

export function mdTruncationNote(shown: number, total: number): string {
  if (total <= shown) return "";
  return `_Showing ${shown} of ${total} — the rest were truncated to keep this readable._\n`;
}
