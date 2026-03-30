// src/lib/critical-path.test.ts
import { describe, it, expect } from "vitest";
import { computeCriticalPath, hasCycle } from "./critical-path";
import { scheduleForward } from "./scheduler";
import type { Item } from "@/types";

function makeTask(overrides: Partial<Item> & { id: string }): Item {
  return {
    type: "task", title: "Task", description: "", status: "todo",
    priority: "medium", assigneeId: null, estimatedDays: 1,
    dependencies: [], tags: [], parentId: null, order: 0,
    createdAt: "2026-03-30T00:00:00Z", updatedAt: "2026-03-30T00:00:00Z",
    ...overrides,
  } as Item;
}

const today = "2026-03-30"; // Monday

describe("computeCriticalPath", () => {
  it("single item is always critical", () => {
    const items = [makeTask({ id: "a", estimatedDays: 3 })];
    const scheduled = scheduleForward(items, [], today);
    const result = computeCriticalPath(items, scheduled, null);
    expect(result[0].isCritical).toBe(true);
    expect(result[0].slack).toBe(0);
  });

  it("identifies critical path in parallel chains", () => {
    // A(2d) → C(1d)
    // B(4d) → C(1d)
    // B→C is longer, so B and C are critical. A has slack.
    const items = [
      makeTask({ id: "a", estimatedDays: 2 }),
      makeTask({ id: "b", estimatedDays: 4 }),
      makeTask({ id: "c", estimatedDays: 1, dependencies: ["a", "b"] }),
    ];
    const scheduled = scheduleForward(items, [], today);
    const result = computeCriticalPath(items, scheduled, null);

    const a = result.find(r => r.itemId === "a")!;
    const b = result.find(r => r.itemId === "b")!;
    const c = result.find(r => r.itemId === "c")!;

    expect(b.isCritical).toBe(true);
    expect(c.isCritical).toBe(true);
    expect(b.slack).toBe(0);
    expect(c.slack).toBe(0);
    expect(a.isCritical).toBe(false);
    expect(a.slack).toBeGreaterThan(0);
  });

  it("all items critical in single chain", () => {
    const items = [
      makeTask({ id: "a", estimatedDays: 2 }),
      makeTask({ id: "b", estimatedDays: 3, dependencies: ["a"] }),
      makeTask({ id: "c", estimatedDays: 1, dependencies: ["b"] }),
    ];
    const scheduled = scheduleForward(items, [], today);
    const result = computeCriticalPath(items, scheduled, null);

    expect(result.every(r => r.isCritical)).toBe(true);
    expect(result.every(r => r.slack === 0)).toBe(true);
  });

  it("computes slack with deadline", () => {
    // Single 1-day task, deadline in 2 weeks
    const items = [makeTask({ id: "a", estimatedDays: 1 })];
    const scheduled = scheduleForward(items, [], today);
    const result = computeCriticalPath(items, scheduled, "2026-04-10"); // Friday Apr 10

    const a = result[0];
    expect(a.slack).toBeGreaterThan(0); // Has slack because deadline is far out
    expect(a.isCritical).toBe(false);
  });

  it("independent items have slack relative to project end", () => {
    const items = [
      makeTask({ id: "a", estimatedDays: 5 }), // Mon-Fri (longer)
      makeTask({ id: "b", estimatedDays: 2 }), // Mon-Tue (shorter)
    ];
    const scheduled = scheduleForward(items, [], today);
    const result = computeCriticalPath(items, scheduled, null);

    const a = result.find(r => r.itemId === "a")!;
    const b = result.find(r => r.itemId === "b")!;

    expect(a.isCritical).toBe(true); // Longer path
    expect(b.isCritical).toBe(false); // Has slack
  });
});

describe("hasCycle", () => {
  it("returns true when adding dependency creates cycle", () => {
    const items = [
      makeTask({ id: "a" }),
      makeTask({ id: "b", dependencies: ["a"] }),
      makeTask({ id: "c", dependencies: ["b"] }),
    ];
    // c depends on b depends on a. Adding "a depends on c" creates: a→c→b→a cycle
    expect(hasCycle(items, "a", "c")).toBe(true);
  });

  it("returns false for unrelated items", () => {
    const items = [
      makeTask({ id: "a" }),
      makeTask({ id: "b" }),
    ];
    expect(hasCycle(items, "a", "b")).toBe(false);
  });

  it("detects direct self-dependency", () => {
    const items = [makeTask({ id: "a" })];
    expect(hasCycle(items, "a", "a")).toBe(true);
  });

  it("returns false for valid extension of DAG", () => {
    const items = [
      makeTask({ id: "a" }),
      makeTask({ id: "b", dependencies: ["a"] }),
      makeTask({ id: "c" }),
    ];
    // a←b, c is independent. Adding "c depends on b" means: DFS from b: b→a, never reaches c.
    // So no cycle.
    expect(hasCycle(items, "c", "b")).toBe(false);
  });
});
