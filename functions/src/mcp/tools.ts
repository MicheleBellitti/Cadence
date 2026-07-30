import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Firestore } from "firebase-admin/firestore";
import type { Project, Sprint } from "@/types";
import { getMyTasks, getAtRiskItems, getTodayStr, computeSprintProgress } from "@/lib/dashboard-utils";
import { computeBurndown } from "@/lib/burndown-utils";
import { computeWorkload } from "@/lib/workload";
import { parseDate, formatDate } from "@/lib/date-utils";
import {
  ToolError,
  toToolError,
  resolveProjectId,
  listProjectsForUser,
  loadProjectSnapshot,
  getCurrentProjectId,
  isSafeDocumentId,
  type ProjectMeta,
} from "./project-data.js";
import {
  buildMemberNameMap,
  buildSprintNameMap,
  isCallerLinked,
  toItemSummary,
  toAtRiskSummary,
  truncateList,
  summarizeBurndown,
  summarizeWorkloadByMember,
  buildBoardColumns,
  neutralizeForMarkdown,
  mdItemLine,
  mdSection,
  mdTruncationNote,
} from "./format.js";
import { buildBriefing, computeScheduledItems, renderBriefingMarkdown } from "./briefing.js";

export interface ToolDeps {
  db: Firestore;
  uid: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ─── Shared schema fragments ────────────────────────────────────────────────

const projectIdInput = z
  .string()
  .min(1)
  .describe("Project id. Defaults to the caller's currently selected project.");

// Generous but bounded: catches obviously-wrong input (typos, a model
// hallucinating a year) without constraining legitimate long-range planning
// or "what-if" recomputation.
const MAX_DATE_SKEW_DAYS = 365 * 5;

function isWithinSensibleWindow(dateStr: string): boolean {
  return Math.abs(Date.parse(dateStr) - Date.now()) / ONE_DAY_MS <= MAX_DATE_SKEW_DAYS;
}

const baseDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date in YYYY-MM-DD format")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Not a valid calendar date")
  .refine(isWithinSensibleWindow, `Date must be within ${MAX_DATE_SKEW_DAYS} days of today`);

// Used by `get_briefing` and `get_at_risk_items`: this does NOT show
// historical state (there is no completion history in this data model) — it
// re-runs the forward-schedule/critical-path computation as if today were
// this date. Say so explicitly so an assistant doesn't guess at semantics.
const recomputeDateSchema = baseDateSchema.describe(
  "Optional. Recomputes the schedule and critical path as if this were today's date, instead of showing historical state (there is no completion history in this data model). Defaults to the real current date. YYYY-MM-DD, within about 5 years of today."
);

// Used by `get_workload`: an ordinary reporting-window boundary, not a
// "pretend today is this date" override.
const windowDateSchema = baseDateSchema.describe(
  "Optional. Boundary of the workload reporting window, in YYYY-MM-DD format."
);

const statusEnumSchema = z.enum(["todo", "in_progress", "in_review", "done"]);
const priorityEnumSchema = z.enum(["critical", "high", "medium", "low"]);
const itemTypeEnumSchema = z.enum(["epic", "story", "task", "bug"]);
const sprintStatusEnumSchema = z.enum(["planning", "active", "completed"]);
const atRiskReasonEnumSchema = z.enum(["critical-path", "overdue", "both"]);

const itemSummarySchema = z.object({
  id: z.string(),
  type: itemTypeEnumSchema,
  title: z.string(),
  status: statusEnumSchema,
  statusLabel: z.string(),
  priority: priorityEnumSchema,
  priorityLabel: z.string(),
  assignees: z.array(z.string()),
  sprintId: z.string().nullable(),
  sprintName: z.string().nullable(),
  tags: z.array(z.string()),
});

const criticalItemSummarySchema = itemSummarySchema.extend({
  startDate: z.string(),
  endDate: z.string(),
});

const atRiskItemSummarySchema = itemSummarySchema.extend({
  reason: atRiskReasonEnumSchema,
  startDate: z.string(),
  endDate: z.string(),
  slack: z.number(),
});

// Mirrors the full `Sprint` shape (@/types) verbatim: `computeSprintProgress`
// (from `@/lib/dashboard-utils`, not reimplemented here) embeds the original
// Sprint object as-is, so the schema must declare every one of its fields —
// the SDK generates `additionalProperties: false` JSON Schema, and the
// client validates structuredContent against it.
const sprintSchema = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  status: sprintStatusEnumSchema,
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const sprintProgressSchema = z.object({
  sprint: sprintSchema,
  total: z.number(),
  done: z.number(),
  inProgress: z.number(),
  inReview: z.number(),
  todo: z.number(),
  totalPoints: z.number(),
  completedPoints: z.number(),
  percentComplete: z.number(),
  daysRemaining: z.number(),
  totalDays: z.number(),
});

const burndownSummarySchema = z.object({
  totalItems: z.number(),
  completedItems: z.number(),
  totalPoints: z.number(),
  completedPoints: z.number(),
  latestActual: z.number().nullable(),
  latestIdeal: z.number().nullable(),
  latestDate: z.string().nullable(),
});

const statusCountsSchema = z.object({
  todo: z.number(),
  in_progress: z.number(),
  in_review: z.number(),
  done: z.number(),
});

const boardColumnSchema = z.object({
  status: statusEnumSchema,
  statusLabel: z.string(),
  items: z.array(itemSummarySchema),
  count: z.number(),
  truncated: z.boolean(),
});

const workloadMemberSchema = z.object({
  memberId: z.string(),
  memberName: z.string(),
  avgUtilization: z.number(),
  overallocatedDays: z.array(z.string()),
  daysWithWork: z.number(),
});

const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  deadline: z.string().nullable(),
  isOwner: z.boolean(),
  isCurrent: z.boolean(),
});

// ─── Tunables ────────────────────────────────────────────────────────────

const MY_TASKS_TOOL_LIMIT = 25;
const AT_RISK_TOOL_LIMIT = 25;
const DEFAULT_BOARD_LIMIT = 15;
const MAX_BOARD_LIMIT = 50;
const DEFAULT_WORKLOAD_WINDOW_DAYS = 14;
const MAX_WORKLOAD_WINDOW_DAYS = 60;

// ─── Small shared helpers ───────────────────────────────────────────────────

/** Builds a successful `CallToolResult` carrying both structured and text content. */
function toolResult(structuredContent: object, text: string): CallToolResult {
  return {
    structuredContent: structuredContent as Record<string, unknown>,
    content: [{ type: "text", text }],
  };
}

/**
 * Builds an error `CallToolResult`. `isError: true` skips output-schema
 * validation (see the SDK's `validateToolOutput`), and — via `toToolError` —
 * never surfaces anything but a safe, user-facing message.
 */
function toolErrorResult(err: unknown): CallToolResult {
  return { isError: true, content: [{ type: "text", text: toToolError(err).message }] };
}

function addCalendarDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * ONE_DAY_MS);
}

interface ProjectSummary {
  id: string;
  name: string;
  deadline: string | null;
  isOwner: boolean;
  isCurrent: boolean;
}

function toProjectSummary(meta: ProjectMeta, uid: string, currentProjectId: string | null): ProjectSummary {
  return {
    id: meta.id,
    name: meta.name,
    deadline: meta.deadline,
    isOwner: meta.ownerId === uid,
    isCurrent: meta.id === currentProjectId,
  };
}

/**
 * `sprintId` is only ever compared in-memory against an already-authorized
 * project's own `project.sprints` — it never becomes a Firestore document
 * path — but a malformed id (e.g. containing "/") is guaranteed not to match
 * a real sprint anyway, so folding the `isSafeDocumentId` check in here
 * costs nothing and keeps every client-supplied id held to the same bar.
 */
function isKnownSprintId(project: Project, id: string): boolean {
  return isSafeDocumentId(id) && project.sprints.some((s) => s.id === id);
}

/**
 * An unknown/hallucinated sprintId must be a hard error naming the real
 * sprints, not a silently empty result — otherwise an assistant will
 * confidently report "empty" instead of "wrong id".
 */
function unknownSprintMessage(project: Project, id: string): string {
  const known =
    project.sprints.length > 0
      ? project.sprints.map((s) => `"${neutralizeForMarkdown(s.name, 60)}" (${s.id})`).join(", ")
      : "none — this project has no sprints yet";
  return `Sprint "${neutralizeForMarkdown(id, 60)}" was not found in this project. Known sprints: ${known}.`;
}

/** Picks the sprint a `get_sprint_status` call should report on. */
function resolveSprint(project: Project, sprintId?: string): Sprint {
  const id = sprintId ?? project.activeSprint;
  if (!id) {
    throw new ToolError("This project has no active sprint, and no sprintId was given. Pass a sprintId explicitly.");
  }
  if (!isKnownSprintId(project, id)) {
    throw new ToolError(unknownSprintMessage(project, id));
  }
  return project.sprints.find((s) => s.id === id)!;
}

// ─── Tool registration ──────────────────────────────────────────────────────

/**
 * Registers every read-only Cadence tool against `server`, scoped to a
 * single already-authenticated `uid`. `deps.uid` is trusted here — it must
 * have come from a verified bearer token (see `createMcpHandler` in
 * `server.ts`), never from tool arguments.
 */
export function registerTools(server: McpServer, deps: ToolDeps): void {
  const { db, uid } = deps;

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "Lists every Cadence project the caller is a member of, noting which one they own and which is currently selected.",
      inputSchema: {},
      outputSchema: { projects: z.array(projectSummarySchema) },
      annotations: { title: "List projects", readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const [projects, currentProjectId] = await Promise.all([
          listProjectsForUser(db, uid),
          getCurrentProjectId(db, uid),
        ]);
        const summaries = projects
          .map((p) => toProjectSummary(p, uid, currentProjectId))
          .sort((a, b) => a.name.localeCompare(b.name));

        const lines = summaries.map(
          (p) =>
            `- ${neutralizeForMarkdown(p.name)}${p.isCurrent ? " (current)" : ""}${p.isOwner ? " — owner" : ""} — id: \`${neutralizeForMarkdown(p.id, 100)}\``
        );
        const text = `# Your projects\n\n${lines.length > 0 ? lines.join("\n") : "_You are not a member of any project yet._"}`;

        return toolResult({ projects: summaries }, text);
      } catch (err) {
        return toolErrorResult(err);
      }
    }
  );

  server.registerTool(
    "get_briefing",
    {
      title: "Get project briefing",
      description:
        "A morning-briefing style snapshot: active sprint progress, the caller's top tasks, at-risk items, and an upcoming critical-path preview.",
      inputSchema: {
        projectId: projectIdInput.optional(),
        date: recomputeDateSchema.optional(),
      },
      outputSchema: {
        project: z.object({ id: z.string(), name: z.string(), deadline: z.string().nullable() }),
        todayStr: z.string(),
        sprint: sprintProgressSchema.nullable(),
        burndown: burndownSummarySchema.nullable(),
        myTasks: z.object({
          items: z.array(itemSummarySchema),
          total: z.number(),
          truncated: z.boolean(),
          linkedMember: z.boolean(),
        }),
        atRisk: z.object({ items: z.array(atRiskItemSummarySchema), total: z.number(), truncated: z.boolean() }),
        criticalPathPreview: z.array(criticalItemSummarySchema),
        statusCounts: statusCountsSchema,
      },
      annotations: { title: "Get project briefing", readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, date }) => {
      try {
        const pid = await resolveProjectId(db, uid, projectId);
        const project = await loadProjectSnapshot(db, uid, pid);
        const todayStr = date ?? getTodayStr();
        const briefing = buildBriefing(project, uid, todayStr);
        return toolResult(briefing, renderBriefingMarkdown(briefing));
      } catch (err) {
        return toolErrorResult(err);
      }
    }
  );

  server.registerTool(
    "get_my_tasks",
    {
      title: "Get my tasks",
      description:
        "Lists unfinished items assigned to the caller, via their linked team member. If no team member in the project is linked to the caller's account yet, says so explicitly (linkedMember: false) instead of returning an unexplained empty list.",
      inputSchema: { projectId: projectIdInput.optional() },
      outputSchema: {
        items: z.array(itemSummarySchema),
        total: z.number(),
        truncated: z.boolean(),
        linkedMember: z.boolean(),
      },
      annotations: { title: "Get my tasks", readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId }) => {
      try {
        const pid = await resolveProjectId(db, uid, projectId);
        const project = await loadProjectSnapshot(db, uid, pid);
        const memberNames = buildMemberNameMap(project.team);
        const sprintNames = buildSprintNameMap(project.sprints);
        const linkedMember = isCallerLinked(project.team, uid);

        const all = getMyTasks(project.items, project.team, uid);
        const { items: sliced, truncated, total } = truncateList(all, MY_TASKS_TOOL_LIMIT);
        const summaries = sliced.map((i) => toItemSummary(i, memberNames, sprintNames));

        const text = [
          mdSection(
            `My Tasks (${total})`,
            summaries.map(mdItemLine),
            linkedMember
              ? "Nothing assigned to you right now."
              : "No team member in this project is linked to your account yet — link one in Cadence → Settings → Team to see your tasks here."
          ),
          mdTruncationNote(summaries.length, total),
        ]
          .filter(Boolean)
          .join("\n");

        return toolResult({ items: summaries, total, truncated, linkedMember }, text);
      } catch (err) {
        return toolErrorResult(err);
      }
    }
  );

  server.registerTool(
    "get_board",
    {
      title: "Get board",
      description:
        "Returns the Kanban board grouped by status column (sorted by manual order), optionally scoped to one sprint. An unrecognized sprintId is an error naming the project's real sprints, not an empty board.",
      inputSchema: {
        projectId: projectIdInput.optional(),
        sprintId: z.string().min(1).optional(),
        limitPerColumn: z.number().int().min(1).max(MAX_BOARD_LIMIT).default(DEFAULT_BOARD_LIMIT),
      },
      outputSchema: {
        columns: z.array(boardColumnSchema),
        counts: statusCountsSchema,
        truncated: z.boolean(),
      },
      annotations: { title: "Get board", readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, sprintId, limitPerColumn }) => {
      try {
        const pid = await resolveProjectId(db, uid, projectId);
        const project = await loadProjectSnapshot(db, uid, pid);
        // A hallucinated/mistyped sprintId must fail loudly — a silently
        // empty board reads as "nothing's scheduled," not "wrong id."
        if (sprintId && !isKnownSprintId(project, sprintId)) {
          throw new ToolError(unknownSprintMessage(project, sprintId));
        }
        const memberNames = buildMemberNameMap(project.team);
        const sprintNames = buildSprintNameMap(project.sprints);

        const scoped = sprintId ? project.items.filter((i) => i.sprintId === sprintId) : project.items;
        const { columns, counts, truncated } = buildBoardColumns(scoped, memberNames, sprintNames, limitPerColumn);

        const text = columns
          .map((c) => mdSection(`${c.statusLabel} (${c.count})`, c.items.map(mdItemLine)))
          .join("\n");

        return toolResult({ columns, counts, truncated }, text);
      } catch (err) {
        return toolErrorResult(err);
      }
    }
  );

  server.registerTool(
    "get_sprint_status",
    {
      title: "Get sprint status",
      description:
        "Sprint progress (item/point counts, days remaining) plus a burndown summary, for the active sprint or a given sprintId. An unrecognized sprintId is an error naming the project's real sprints.",
      inputSchema: { projectId: projectIdInput.optional(), sprintId: z.string().min(1).optional() },
      outputSchema: { progress: sprintProgressSchema, burndown: burndownSummarySchema.nullable() },
      annotations: { title: "Get sprint status", readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, sprintId }) => {
      try {
        const pid = await resolveProjectId(db, uid, projectId);
        const project = await loadProjectSnapshot(db, uid, pid);
        const sprint = resolveSprint(project, sprintId);
        const todayStr = getTodayStr();

        const progress = computeSprintProgress(sprint, project.items, todayStr);
        const burndown = summarizeBurndown(computeBurndown(sprint, project.items, todayStr));

        const text = [
          `# Sprint: ${neutralizeForMarkdown(sprint.name)} (${progress.percentComplete}%)`,
          `${progress.done}/${progress.total} done · ${progress.daysRemaining} of ${progress.totalDays} days remaining`,
          burndown?.latestDate
            ? `Burndown: ${burndown.latestActual} remaining vs. ${burndown.latestIdeal} ideal as of ${burndown.latestDate}`
            : "_No burndown data yet._",
        ].join("\n");

        return toolResult({ progress, burndown }, text);
      } catch (err) {
        return toolErrorResult(err);
      }
    }
  );

  server.registerTool(
    "get_at_risk_items",
    {
      title: "Get at-risk items",
      description: "Lists unfinished items that are overdue and/or on the critical path, with scheduled dates and slack.",
      inputSchema: { projectId: projectIdInput.optional(), date: recomputeDateSchema.optional() },
      outputSchema: { items: z.array(atRiskItemSummarySchema), total: z.number(), truncated: z.boolean() },
      annotations: { title: "Get at-risk items", readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, date }) => {
      try {
        const pid = await resolveProjectId(db, uid, projectId);
        const project = await loadProjectSnapshot(db, uid, pid);
        const todayStr = date ?? getTodayStr();
        const scheduled = computeScheduledItems(project, todayStr);
        const memberNames = buildMemberNameMap(project.team);
        const sprintNames = buildSprintNameMap(project.sprints);

        const all = getAtRiskItems(project.items, scheduled, todayStr);
        const { items: sliced, truncated, total } = truncateList(all, AT_RISK_TOOL_LIMIT);
        const summaries = sliced.map((e) => toAtRiskSummary(e, memberNames, sprintNames));

        const text = [
          mdSection(
            `At Risk (${total})`,
            summaries.map((i) => `${mdItemLine(i)} — ${i.reason}, slack ${i.slack}d, due ${i.endDate}`),
            "Nothing at risk."
          ),
          mdTruncationNote(summaries.length, total),
        ]
          .filter(Boolean)
          .join("\n");

        return toolResult({ items: summaries, total, truncated }, text);
      } catch (err) {
        return toolErrorResult(err);
      }
    }
  );

  server.registerTool(
    "get_workload",
    {
      title: "Get workload",
      description:
        "Per-member workload over a date window: average utilization and any overallocated days. Defaults to today through +14 days; the window is capped at 60 days.",
      inputSchema: {
        projectId: projectIdInput.optional(),
        startDate: windowDateSchema.optional(),
        endDate: windowDateSchema.optional(),
      },
      outputSchema: {
        startDate: z.string(),
        endDate: z.string(),
        capped: z.boolean(),
        members: z.array(workloadMemberSchema),
      },
      annotations: { title: "Get workload", readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, startDate, endDate }) => {
      try {
        const pid = await resolveProjectId(db, uid, projectId);
        const project = await loadProjectSnapshot(db, uid, pid);
        const todayStr = getTodayStr();

        const start = startDate ?? todayStr;
        let end = endDate ?? formatDate(addCalendarDays(parseDate(start), DEFAULT_WORKLOAD_WINDOW_DAYS));

        if (parseDate(end).getTime() < parseDate(start).getTime()) {
          throw new ToolError("endDate must be on or after startDate.");
        }

        let capped = false;
        const spanDays = Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / ONE_DAY_MS);
        if (spanDays > MAX_WORKLOAD_WINDOW_DAYS) {
          end = formatDate(addCalendarDays(parseDate(start), MAX_WORKLOAD_WINDOW_DAYS));
          capped = true;
        }

        const scheduled = computeScheduledItems(project, todayStr);
        const days = computeWorkload(project.items, scheduled, project.team, start, end);
        const memberNames = buildMemberNameMap(project.team);
        const members = summarizeWorkloadByMember(days, memberNames);

        const lines = members.map(
          (m) =>
            `- **${neutralizeForMarkdown(m.memberName)}**: ${Math.round(m.avgUtilization * 100)}% avg utilization` +
            (m.overallocatedDays.length > 0 ? `, overallocated on ${m.overallocatedDays.join(", ")}` : "")
        );
        const text = [
          `# Workload: ${start} → ${end}${capped ? " (capped to 60 days)" : ""}`,
          "",
          ...(lines.length > 0 ? lines : ["_No assigned, unfinished work in this window._"]),
        ].join("\n");

        return toolResult({ startDate: start, endDate: end, capped, members }, text);
      } catch (err) {
        return toolErrorResult(err);
      }
    }
  );
}
