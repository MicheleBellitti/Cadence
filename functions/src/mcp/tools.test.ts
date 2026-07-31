import { describe, it, expect, beforeAll } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server.js";
import { loadProjectSnapshot, PROJECT_ACCESS_DENIED_MESSAGE } from "./project-data.js";
import { buildBriefing } from "./briefing.js";
import { buildFakeFirestore, type FakeData } from "./test-helpers.js";

const OWNER_UID = "uid-owner";
const OTHER_UID = "uid-other";
const TODAY = "2026-07-30";

function makeItem(id: string, overrides: FakeData = {}): FakeData & { id: string } {
  return {
    id,
    type: "task",
    title: `Task ${id}`,
    description: "",
    status: "todo",
    priority: "medium",
    assigneeIds: [],
    estimatedDays: 1,
    dependencies: [],
    tags: [],
    parentId: null,
    sprintId: null,
    order: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

// A board with more items in "todo" than the default limitPerColumn, to exercise truncation.
const BOARD_ITEM_COUNT = 20;
const boardItems = Array.from({ length: BOARD_ITEM_COUNT }, (_, i) => makeItem(`board-${i}`, { order: i }));

const myTaskItem = makeItem("mine-1", {
  status: "in_progress",
  priority: "high",
  assigneeIds: ["member-1"],
  sprintId: "sprint-1",
});
const notMyTaskItem = makeItem("theirs-1", { status: "todo", assigneeIds: ["member-2"] });
// A tiny dependency chain so the critical path (and get_at_risk_items) has something to report.
const criticalA = makeItem("crit-a", { estimatedDays: 2 });
const criticalB = makeItem("crit-b", { estimatedDays: 2, dependencies: ["crit-a"] });

function seedDb(): Firestore {
  return buildFakeFirestore({
    projects: [
      {
        id: "proj-1",
        name: "Owner's Project",
        ownerId: OWNER_UID,
        memberIds: [OWNER_UID],
        activeSprint: "sprint-1",
        items: [...boardItems, myTaskItem, notMyTaskItem, criticalA, criticalB],
        team: [
          { id: "member-1", name: "Alice", color: "#000", role: "Dev", hoursPerDay: 8, linkedUserId: OWNER_UID },
          { id: "member-2", name: "Bob", color: "#111", role: "Dev", hoursPerDay: 8, linkedUserId: null },
        ],
        sprints: [
          {
            id: "sprint-1",
            name: "Sprint 1",
            goal: "Ship it",
            status: "active",
            startDate: "2026-07-20",
            endDate: "2026-08-03",
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z",
          },
        ],
      },
      {
        id: "proj-2",
        name: "Someone Else's Project",
        ownerId: OTHER_UID,
        memberIds: [OTHER_UID],
      },
    ],
    users: [{ uid: OWNER_UID, projectId: "proj-1" }],
  }) as unknown as Firestore;
}

async function connectClient(db: Firestore, uid: string): Promise<Client> {
  const server = createMcpServer({ db, uid });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const EXPECTED_TOOL_NAMES = [
  "list_projects",
  "get_briefing",
  "get_my_tasks",
  "get_board",
  "get_sprint_status",
  "get_at_risk_items",
  "get_workload",
];

describe("MCP tools", () => {
  let db: Firestore;
  let client: Client;

  beforeAll(async () => {
    db = seedDb();
    client = await connectClient(db, OWNER_UID);
  });

  it("registers every expected tool, all marked read-only", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOL_NAMES].sort());

    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, `${tool.name} should be readOnlyHint: true`).toBe(true);
      expect(tool.annotations?.openWorldHint, `${tool.name} should be openWorldHint: false`).toBe(false);
    }
  });

  it("get_briefing matches a direct composition of the pure functions", async () => {
    const result = await client.callTool({
      name: "get_briefing",
      arguments: { projectId: "proj-1", date: TODAY },
    });

    expect(result.isError).toBeFalsy();

    const project = await loadProjectSnapshot(db, OWNER_UID, "proj-1");
    const expected = buildBriefing(project, OWNER_UID, TODAY);

    expect(result.structuredContent).toEqual(expected);
  });

  it("get_board truncates each column and reports it honestly", async () => {
    const result = await client.callTool({
      name: "get_board",
      arguments: { projectId: "proj-1", limitPerColumn: 5 },
    });

    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as {
      columns: Array<{ status: string; items: unknown[]; count: number; truncated: boolean }>;
      counts: Record<string, number>;
      truncated: boolean;
    };

    const todoColumn = content.columns.find((c) => c.status === "todo")!;
    // BOARD_ITEM_COUNT todo items from the board fixture, plus notMyTaskItem and the
    // two critical-path fixture items (criticalA/criticalB default to "todo" too).
    expect(todoColumn.count).toBe(BOARD_ITEM_COUNT + 3);
    expect(todoColumn.items).toHaveLength(5);
    expect(todoColumn.truncated).toBe(true);
    expect(content.truncated).toBe(true);
  });

  it("only returns the caller's own unfinished items from get_my_tasks", async () => {
    const result = await client.callTool({ name: "get_my_tasks", arguments: { projectId: "proj-1" } });
    expect(result.isError).toBeFalsy();

    const content = result.structuredContent as { items: Array<{ id: string }> };
    const ids = content.items.map((i) => i.id);
    expect(ids).toContain("mine-1");
    expect(ids).not.toContain("theirs-1");
  });

  it("fails with the generic access-denied message for another user's project", async () => {
    const result = await client.callTool({
      name: "get_briefing",
      arguments: { projectId: "proj-2", date: TODAY },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
    expect(text).toBe(PROJECT_ACCESS_DENIED_MESSAGE);
  });

  it("rejects a malformed date instead of calling the handler", async () => {
    const result = await client.callTool({
      name: "get_briefing",
      arguments: { projectId: "proj-1", date: "not-a-date" },
    });

    expect(result.isError).toBe(true);
  });
});
