import { describe, it, expect } from "vitest";
import { scheduleForward } from "./scheduler";
import type { Item, GanttOverride } from "@/types";

// Helper to create test items
function makeTask(overrides: Partial<Item> & { id: string }): Item {
  return {
    type: "task",
    title: "Task",
    description: "",
    status: "todo",
    priority: "medium",
    assigneeIds: [],
    estimatedDays: 1,
    dependencies: [],
    tags: [],
    parentId: null,
    order: 0,
    createdAt: "2026-03-30T00:00:00Z",
    updatedAt: "2026-03-30T00:00:00Z",
    ...overrides,
  } as Item;
}

describe("scheduleForward", () => {
  const today = "2026-03-30"; // Monday

  it("schedules a single 3-day item starting today", () => {
    const items = [makeTask({ id: "a", estimatedDays: 3 })];
    const result = scheduleForward(items, [], today);
    expect(result).toHaveLength(1);
    expect(result[0].startDate).toBe("2026-03-30"); // Monday
    expect(result[0].endDate).toBe("2026-04-01");   // Wednesday (Mon+Tue+Wed)
  });

  it("schedules dependent item after predecessor ends", () => {
    const items = [
      makeTask({ id: "a", estimatedDays: 2 }),       // Mon-Tue
      makeTask({ id: "b", estimatedDays: 1, dependencies: ["a"] }),
    ];
    const result = scheduleForward(items, [], today);
    const a = result.find(r => r.itemId === "a")!;
    const b = result.find(r => r.itemId === "b")!;
    expect(a.endDate).toBe("2026-03-31");   // Tuesday
    expect(b.startDate).toBe("2026-04-01"); // Wednesday (day after Tue)
    expect(b.endDate).toBe("2026-04-01");   // Wednesday (1 day)
  });

  it("handles weekend gap correctly", () => {
    const items = [
      makeTask({ id: "a", estimatedDays: 5 }),       // Mon-Fri
      makeTask({ id: "b", estimatedDays: 1, dependencies: ["a"] }),
    ];
    const result = scheduleForward(items, [], today);
    const b = result.find(r => r.itemId === "b")!;
    expect(b.startDate).toBe("2026-04-06"); // Monday (skips weekend)
  });

  it("respects manual override (later than computed)", () => {
    const items = [makeTask({ id: "a", estimatedDays: 2 })];
    const overrides: GanttOverride[] = [{ itemId: "a", startDate: "2026-04-06" }];
    const result = scheduleForward(items, overrides, today);
    expect(result[0].startDate).toBe("2026-04-06"); // Override wins
  });

  it("uses max of override and dependency end", () => {
    const items = [
      makeTask({ id: "a", estimatedDays: 5 }),  // Mon Mar 30 - Fri Apr 3
      makeTask({ id: "b", estimatedDays: 1, dependencies: ["a"] }),
    ];
    // Override says start Apr 1 (Wed), but dep says start Apr 6 (Mon)
    const overrides: GanttOverride[] = [{ itemId: "b", startDate: "2026-04-01" }];
    const result = scheduleForward(items, overrides, today);
    const b = result.find(r => r.itemId === "b")!;
    expect(b.startDate).toBe("2026-04-06"); // Dependency wins (later)
  });

  it("done items have same start and end as today", () => {
    const items = [makeTask({ id: "a", estimatedDays: 5, status: "done" })];
    const result = scheduleForward(items, [], today);
    expect(result[0].startDate).toBe(today);
    expect(result[0].endDate).toBe(today);
  });

  it("handles multiple predecessors (uses latest)", () => {
    const items = [
      makeTask({ id: "a", estimatedDays: 3 }),  // Mon-Wed
      makeTask({ id: "b", estimatedDays: 5 }),   // Mon-Fri
      makeTask({ id: "c", estimatedDays: 1, dependencies: ["a", "b"] }),
    ];
    const result = scheduleForward(items, [], today);
    const c = result.find(r => r.itemId === "c")!;
    expect(c.startDate).toBe("2026-04-06"); // After B's Friday → Monday
  });

  it("handles items with zero estimated days", () => {
    const items = [makeTask({ id: "a", estimatedDays: 0 })];
    const result = scheduleForward(items, [], today);
    expect(result[0].startDate).toBe(today);
    expect(result[0].endDate).toBe(today);
  });

  it("handles chain of 3 dependencies", () => {
    const items = [
      makeTask({ id: "a", estimatedDays: 1 }),       // Mon
      makeTask({ id: "b", estimatedDays: 1, dependencies: ["a"] }), // Tue
      makeTask({ id: "c", estimatedDays: 1, dependencies: ["b"] }), // Wed
    ];
    const result = scheduleForward(items, [], today);
    expect(result.find(r => r.itemId === "a")!.startDate).toBe("2026-03-30");
    expect(result.find(r => r.itemId === "b")!.startDate).toBe("2026-03-31");
    expect(result.find(r => r.itemId === "c")!.startDate).toBe("2026-04-01");
  });

  it("items with no deps and no override start today", () => {
    const items = [
      makeTask({ id: "a", estimatedDays: 2 }),
      makeTask({ id: "b", estimatedDays: 3 }),
    ];
    const result = scheduleForward(items, [], today);
    expect(result[0].startDate).toBe(today);
    expect(result[1].startDate).toBe(today);
  });
});
