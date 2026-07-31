/**
 * Composes the pure scheduling/analytics functions from `@/lib` into the
 * shape the `get_briefing` tool returns.
 *
 * IMPORTANT: `computeScheduledItems` mirrors `src/app/dashboard/page.tsx`
 * (~lines 30-70) on purpose — forward schedule, then critical path, then
 * everything derived from that — so the connector and the dashboard UI never
 * disagree about what's overdue or on the critical path. If that composition
 * order ever changes on the dashboard, mirror the change here too.
 */
import type { Project, ScheduledItem, Status } from "@/types";
import { scheduleForward } from "@/lib/scheduler";
import { computeCriticalPath } from "@/lib/critical-path";
import { computeSprintProgress, getMyTasks, getAtRiskItems, type SprintProgress } from "@/lib/dashboard-utils";
import { computeBurndown } from "@/lib/burndown-utils";
import {
  buildMemberNameMap,
  buildSprintNameMap,
  isCallerLinked,
  toItemSummary,
  toAtRiskSummary,
  truncateList,
  summarizeBurndown,
  neutralizeForMarkdown,
  mdItemLine,
  mdSection,
  mdTruncationNote,
  type ItemSummary,
  type AtRiskItemSummary,
  type CriticalItemSummary,
  type BurndownSummary,
} from "./format.js";

const MY_TASKS_LIMIT = 10;
const AT_RISK_LIMIT = 10;
const CRITICAL_PATH_PREVIEW_LIMIT = 5;

export interface Briefing {
  project: { id: string; name: string; deadline: string | null };
  todayStr: string;
  sprint: SprintProgress | null;
  burndown: BurndownSummary | null;
  myTasks: { items: ItemSummary[]; total: number; truncated: boolean; linkedMember: boolean };
  atRisk: { items: AtRiskItemSummary[]; total: number; truncated: boolean };
  criticalPathPreview: CriticalItemSummary[];
  statusCounts: Record<Status, number>;
}

/**
 * Forward schedule → critical path, exactly as the dashboard computes it.
 * Shared by every tool that needs `ScheduledItem[]` so they all agree with
 * each other (and with the dashboard) about slack and criticality.
 */
export function computeScheduledItems(project: Project, todayStr: string): ScheduledItem[] {
  if (project.items.length === 0) return [];
  const forward = scheduleForward(project.items, project.overrides, todayStr);
  return computeCriticalPath(project.items, forward, project.deadline);
}

export function buildBriefing(project: Project, uid: string, todayStr: string): Briefing {
  const memberNames = buildMemberNameMap(project.team);
  const sprintNames = buildSprintNameMap(project.sprints);

  const scheduled = computeScheduledItems(project, todayStr);

  const activeSprint = project.activeSprint
    ? project.sprints.find((s) => s.id === project.activeSprint) ?? null
    : null;

  const sprint = activeSprint ? computeSprintProgress(activeSprint, project.items, todayStr) : null;
  const burndown = activeSprint ? summarizeBurndown(computeBurndown(activeSprint, project.items, todayStr)) : null;

  const linkedMember = isCallerLinked(project.team, uid);
  const myTasksAll = getMyTasks(project.items, project.team, uid);
  const myTasksSliced = truncateList(myTasksAll, MY_TASKS_LIMIT);

  const atRiskAll = getAtRiskItems(project.items, scheduled, todayStr);
  const atRiskSliced = truncateList(atRiskAll, AT_RISK_LIMIT);

  const scheduledById = new Map(scheduled.map((s) => [s.itemId, s]));
  const itemById = new Map(project.items.map((i) => [i.id, i]));

  const criticalPathPreview: CriticalItemSummary[] = scheduled
    .filter((s) => s.isCritical)
    .map((s) => itemById.get(s.itemId))
    .filter((item): item is NonNullable<typeof item> => item !== undefined && item.status !== "done")
    .sort((a, b) => scheduledById.get(a.id)!.startDate.localeCompare(scheduledById.get(b.id)!.startDate))
    .slice(0, CRITICAL_PATH_PREVIEW_LIMIT)
    .map((item) => {
      const s = scheduledById.get(item.id)!;
      return { ...toItemSummary(item, memberNames, sprintNames), startDate: s.startDate, endDate: s.endDate };
    });

  const statusCounts: Record<Status, number> = { todo: 0, in_progress: 0, in_review: 0, done: 0 };
  for (const item of project.items) {
    statusCounts[item.status]++;
  }

  return {
    project: { id: project.id, name: project.name, deadline: project.deadline },
    todayStr,
    sprint,
    burndown,
    myTasks: {
      items: myTasksSliced.items.map((i) => toItemSummary(i, memberNames, sprintNames)),
      total: myTasksSliced.total,
      truncated: myTasksSliced.truncated,
      linkedMember,
    },
    atRisk: {
      items: atRiskSliced.items.map((e) => toAtRiskSummary(e, memberNames, sprintNames)),
      total: atRiskSliced.total,
      truncated: atRiskSliced.truncated,
    },
    criticalPathPreview,
    statusCounts,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// renderBriefingMarkdown — DEFAULT IMPLEMENTATION. This is an editorial
// choice, not a technical one: the section order, headings, and verbosity
// below are a first draft of "what a morning briefing should read like."
// The repo owner may well want a different voice, a different order, or to
// drop/merge sections once they've seen this rendered by a real assistant.
// Everything needed to change that lives inside this one function — there's
// no other renderer to keep in sync, so it is safe to rewrite wholesale.
// ─────────────────────────────────────────────────────────────────────────
export function renderBriefingMarkdown(briefing: Briefing): string {
  const lines: string[] = [];

  lines.push(`# ${neutralizeForMarkdown(briefing.project.name)} — Briefing for ${briefing.todayStr}`);
  if (briefing.project.deadline) {
    lines.push(`Deadline: ${briefing.project.deadline}`);
  }
  lines.push("");

  if (briefing.sprint) {
    const s = briefing.sprint;
    lines.push(`## Sprint: ${neutralizeForMarkdown(s.sprint.name)} (${s.percentComplete}% complete)`);
    lines.push(`${s.done}/${s.total} items done · ${s.daysRemaining} of ${s.totalDays} days remaining`);
    if (briefing.burndown?.latestDate) {
      lines.push(
        `Burndown: ${briefing.burndown.latestActual} remaining vs. ${briefing.burndown.latestIdeal} ideal as of ${briefing.burndown.latestDate}`
      );
    }
    lines.push("");
  } else {
    lines.push("## Sprint");
    lines.push("_No active sprint._");
    lines.push("");
  }

  lines.push(
    mdSection(
      `My Tasks (${briefing.myTasks.total})`,
      briefing.myTasks.items.map(mdItemLine),
      briefing.myTasks.linkedMember
        ? "Nothing assigned to you right now."
        : "No team member in this project is linked to your account yet — link one in Cadence → Settings → Team to see your tasks here."
    )
  );
  lines.push(mdTruncationNote(briefing.myTasks.items.length, briefing.myTasks.total));

  lines.push(
    mdSection(
      `At Risk (${briefing.atRisk.total})`,
      briefing.atRisk.items.map((i) => `${mdItemLine(i)} — ${i.reason}, slack ${i.slack}d, due ${i.endDate}`),
      "Nothing at risk."
    )
  );
  lines.push(mdTruncationNote(briefing.atRisk.items.length, briefing.atRisk.total));

  lines.push(
    mdSection(
      "Critical Path (next up)",
      briefing.criticalPathPreview.map((i) => `${mdItemLine(i)} — ${i.startDate} → ${i.endDate}`),
      "No unfinished critical-path items."
    )
  );

  const counts = briefing.statusCounts;
  lines.push(
    `### Status counts\n\nTo Do: ${counts.todo} · In Progress: ${counts.in_progress} · In Review: ${counts.in_review} · Done: ${counts.done}\n`
  );

  return lines.join("\n");
}
