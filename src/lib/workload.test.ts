import { describe, it, expect } from "vitest";
import { computeWorkload } from "./workload";
import type { Item, TeamMember, ScheduledItem } from "@/types";

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

function makeScheduled(
  id: string,
  start: string,
  end: string
): ScheduledItem {
  return {
    itemId: id,
    startDate: start,
    endDate: end,
    earlyStart: start,
    earlyFinish: end,
    lateStart: "",
    lateFinish: "",
    slack: 0,
    isCritical: false,
  };
}

const member: TeamMember = {
  id: "m1",
  name: "Alice",
  color: "#2563EB",
  role: "Dev",
  hoursPerDay: 8,
};

describe("computeWorkload", () => {
  it("single item on one day", () => {
    const items = [makeTask({ id: "a", assigneeIds: ["m1"], estimatedDays: 1 })];
    const scheduled = [makeScheduled("a", "2026-03-30", "2026-03-30")]; // Monday
    const result = computeWorkload(
      items,
      scheduled,
      [member],
      "2026-03-30",
      "2026-03-30"
    );

    const day = result.find(
      (d) => d.memberId === "m1" && d.date === "2026-03-30"
    );
    expect(day).toBeDefined();
    expect(day!.totalHours).toBe(8);
    expect(day!.utilization).toBe(1.0);
    expect(day!.items).toEqual(["a"]);
  });

  it("two items same day = overallocated", () => {
    const items = [
      makeTask({ id: "a", assigneeIds: ["m1"], estimatedDays: 1 }),
      makeTask({ id: "b", assigneeIds: ["m1"], estimatedDays: 1 }),
    ];
    const scheduled = [
      makeScheduled("a", "2026-03-30", "2026-03-30"),
      makeScheduled("b", "2026-03-30", "2026-03-30"),
    ];
    const result = computeWorkload(
      items,
      scheduled,
      [member],
      "2026-03-30",
      "2026-03-30"
    );

    const day = result.find(
      (d) => d.memberId === "m1" && d.date === "2026-03-30"
    );
    expect(day!.totalHours).toBe(16);
    expect(day!.utilization).toBe(2.0); // 200% = overallocated
  });

  it("multi-day item spans multiple days", () => {
    const items = [
      makeTask({ id: "a", assigneeIds: ["m1"], estimatedDays: 3 }),
    ];
    const scheduled = [makeScheduled("a", "2026-03-30", "2026-04-01")]; // Mon-Wed
    const result = computeWorkload(
      items,
      scheduled,
      [member],
      "2026-03-30",
      "2026-04-01"
    );

    const mon = result.find((d) => d.date === "2026-03-30")!;
    const tue = result.find((d) => d.date === "2026-03-31")!;
    const wed = result.find((d) => d.date === "2026-04-01")!;

    expect(mon.totalHours).toBe(8);
    expect(tue.totalHours).toBe(8);
    expect(wed.totalHours).toBe(8);
  });

  it("skips weekends", () => {
    const items = [
      makeTask({ id: "a", assigneeIds: ["m1"], estimatedDays: 6 }),
    ];
    const scheduled = [makeScheduled("a", "2026-03-30", "2026-04-06")]; // Mon Mar 30 - Mon Apr 6
    const result = computeWorkload(
      items,
      scheduled,
      [member],
      "2026-03-28",
      "2026-04-06"
    );

    // Saturday Mar 28 and Sunday Mar 29 should not appear
    const sat = result.find((d) => d.date === "2026-03-28");
    const sun = result.find((d) => d.date === "2026-03-29");
    expect(sat).toBeUndefined();
    expect(sun).toBeUndefined();
  });

  it("unassigned items don't contribute", () => {
    const items = [
      makeTask({ id: "a", assigneeIds: [], estimatedDays: 1 }),
    ];
    const scheduled = [makeScheduled("a", "2026-03-30", "2026-03-30")];
    const result = computeWorkload(
      items,
      scheduled,
      [member],
      "2026-03-30",
      "2026-03-30"
    );

    const day = result.find(
      (d) => d.memberId === "m1" && d.date === "2026-03-30"
    );
    expect(day).toBeUndefined(); // or totalHours === 0
  });

  it("done items don't contribute", () => {
    const items = [
      makeTask({ id: "a", assigneeIds: ["m1"], estimatedDays: 1, status: "done" }),
    ];
    const scheduled = [makeScheduled("a", "2026-03-30", "2026-03-30")];
    const result = computeWorkload(
      items,
      scheduled,
      [member],
      "2026-03-30",
      "2026-03-30"
    );

    const day = result.find(
      (d) => d.memberId === "m1" && d.date === "2026-03-30"
    );
    expect(day).toBeUndefined(); // or totalHours === 0
  });
});
