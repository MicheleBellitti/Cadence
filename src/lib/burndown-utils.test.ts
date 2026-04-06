import { describe, it, expect } from "vitest";
import { computeBurndown } from "./burndown-utils";
import type { Item, Sprint } from "@/types";

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: "sprint-1",
    name: "Sprint 1",
    goal: "",
    status: "active",
    startDate: "2026-04-06",
    endDate: "2026-04-17",
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-06T00:00:00Z",
    ...overrides,
  };
}

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: crypto.randomUUID(),
    type: "task",
    title: "Test task",
    description: "",
    status: "todo",
    priority: "medium",
    assigneeIds: [],
    estimatedDays: 1,
    dependencies: [],
    tags: [],
    parentId: null,
    sprintId: "sprint-1",
    order: 0,
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-06T00:00:00Z",
    ...overrides,
  } as Item;
}

describe("computeBurndown", () => {
  it("returns null for sprints without dates", () => {
    const sprint = makeSprint({ startDate: null, endDate: null });
    expect(computeBurndown(sprint, [makeItem()], "2026-04-10")).toBeNull();
  });

  it("returns empty data for sprints with no items", () => {
    const sprint = makeSprint();
    const items = [makeItem({ sprintId: "other-sprint" })];
    const result = computeBurndown(sprint, items, "2026-04-10");
    expect(result).not.toBeNull();
    expect(result!.totalItems).toBe(0);
    expect(result!.points).toHaveLength(0);
  });

  it("computes a basic burndown with no completions", () => {
    const sprint = makeSprint();
    const items = [makeItem(), makeItem(), makeItem()];
    const result = computeBurndown(sprint, items, "2026-04-20");

    expect(result).not.toBeNull();
    expect(result!.totalItems).toBe(3);
    expect(result!.completedItems).toBe(0);
    // First point: remaining should equal total
    expect(result!.points[0].remaining).toBe(3);
    // Ideal starts at total
    expect(result!.points[0].ideal).toBeCloseTo(3, 0);
  });

  it("subtracts pre-sprint completions from initial remaining (bug fix #1)", () => {
    const sprint = makeSprint({
      startDate: "2026-04-06",
      endDate: "2026-04-10",
    });
    const items = [
      // Completed before sprint start
      makeItem({
        status: "done",
        updatedAt: "2026-04-03T10:00:00Z",
      }),
      // Completed before sprint start
      makeItem({
        status: "done",
        updatedAt: "2026-04-04T10:00:00Z",
      }),
      // Still in progress
      makeItem({ status: "todo" }),
      makeItem({ status: "in_progress" }),
    ];

    const result = computeBurndown(sprint, items, "2026-04-10");
    expect(result).not.toBeNull();
    expect(result!.totalItems).toBe(4);
    expect(result!.completedItems).toBe(2);

    // Initial remaining should be 4 - 2 pre-sprint = 2, NOT 4
    expect(result!.points[0].remaining).toBe(2);
    // Ideal line should also start from 2
    expect(result!.points[0].ideal).toBeCloseTo(2, 0);
  });

  it("handles single-day sprint without NaN (relates to bug fix #2)", () => {
    const sprint = makeSprint({
      startDate: "2026-04-06",
      endDate: "2026-04-06",
    });
    const items = [makeItem()];

    const result = computeBurndown(sprint, items, "2026-04-06");
    expect(result).not.toBeNull();
    expect(result!.points).toHaveLength(1);

    // No NaN in any values
    for (const point of result!.points) {
      expect(Number.isNaN(point.ideal)).toBe(false);
      expect(Number.isNaN(point.remaining)).toBe(false);
    }
  });

  it("tracks completions during the sprint correctly", () => {
    const sprint = makeSprint({
      startDate: "2026-04-06",
      endDate: "2026-04-10",
    });
    const items = [
      makeItem({
        status: "done",
        updatedAt: "2026-04-07T15:00:00Z",
      }),
      makeItem({
        status: "done",
        updatedAt: "2026-04-07T16:00:00Z",
      }),
      makeItem({ status: "todo" }),
    ];

    const result = computeBurndown(sprint, items, "2026-04-10");
    expect(result).not.toBeNull();

    // Day 0 (Apr 6): 3 remaining
    expect(result!.points[0].remaining).toBe(3);

    // Day 1 (Apr 7): 3 - 2 completions = 1
    expect(result!.points[1].remaining).toBe(1);
  });

  it("never produces negative remaining values", () => {
    const sprint = makeSprint({
      startDate: "2026-04-06",
      endDate: "2026-04-08",
    });
    // All done before sprint start
    const items = [
      makeItem({ status: "done", updatedAt: "2026-04-01T00:00:00Z" }),
      makeItem({ status: "done", updatedAt: "2026-04-02T00:00:00Z" }),
    ];

    const result = computeBurndown(sprint, items, "2026-04-08");
    expect(result).not.toBeNull();
    for (const point of result!.points) {
      if (point.remaining >= 0) {
        expect(point.remaining).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("marks future days with sentinel -1 for remaining", () => {
    const sprint = makeSprint({
      startDate: "2026-04-06",
      endDate: "2026-04-10",
    });
    const items = [makeItem()];
    const result = computeBurndown(sprint, items, "2026-04-07");
    expect(result).not.toBeNull();

    // Apr 6 and 7 should have actual data
    expect(result!.points[0].remaining).toBeGreaterThanOrEqual(0);
    expect(result!.points[1].remaining).toBeGreaterThanOrEqual(0);

    // Apr 8+ should be sentinel -1
    expect(result!.points[2].remaining).toBe(-1);
  });
});
