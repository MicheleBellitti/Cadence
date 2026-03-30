import { describe, it, expect } from "vitest";
import { itemSchema, projectSchema, teamMemberSchema } from "./validators";

describe("itemSchema", () => {
  it("validates a valid task", () => {
    const task = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      type: "task",
      title: "Implement feature",
      description: "",
      status: "todo",
      priority: "medium",
      assigneeId: null,
      estimatedDays: 2,
      dependencies: [],
      tags: [],
      parentId: null,
      order: 0,
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    expect(itemSchema.safeParse(task).success).toBe(true);
  });

  it("rejects item with empty title", () => {
    const item = {
      id: "abc",
      type: "task",
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      assigneeId: null,
      estimatedDays: 0,
      dependencies: [],
      tags: [],
      parentId: null,
      order: 0,
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    expect(itemSchema.safeParse(item).success).toBe(false);
  });

  it("validates an epic with targetDate", () => {
    const epic = {
      id: "e1",
      type: "epic",
      title: "Epic 1",
      description: "",
      status: "todo",
      priority: "high",
      assigneeId: null,
      estimatedDays: 0,
      dependencies: [],
      tags: [],
      parentId: null,
      order: 0,
      targetDate: "2026-06-01",
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    expect(itemSchema.safeParse(epic).success).toBe(true);
  });

  it("validates a story with storyPoints and acceptanceCriteria", () => {
    const story = {
      id: "s1",
      type: "story",
      title: "User can login",
      description: "As a user I want to login",
      status: "in_progress",
      priority: "high",
      assigneeId: "m1",
      estimatedDays: 3,
      dependencies: [],
      tags: ["auth"],
      parentId: "e1",
      order: 0,
      storyPoints: 5,
      acceptanceCriteria: "Login form works",
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    expect(itemSchema.safeParse(story).success).toBe(true);
  });

  it("validates a bug with severity", () => {
    const bug = {
      id: "b1",
      type: "bug",
      title: "Login fails",
      description: "",
      status: "todo",
      priority: "critical",
      assigneeId: null,
      estimatedDays: 1,
      dependencies: [],
      tags: [],
      parentId: "s1",
      order: 0,
      severity: "critical",
      stepsToReproduce: "1. Go to login\n2. Enter credentials",
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    expect(itemSchema.safeParse(bug).success).toBe(true);
  });

  it("rejects invalid status", () => {
    const task = {
      id: "t1",
      type: "task",
      title: "Test",
      description: "",
      status: "invalid",
      priority: "medium",
      assigneeId: null,
      estimatedDays: 1,
      dependencies: [],
      tags: [],
      parentId: null,
      order: 0,
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    expect(itemSchema.safeParse(task).success).toBe(false);
  });
});

describe("teamMemberSchema", () => {
  it("validates a valid team member", () => {
    const member = {
      id: "m1",
      name: "Alice",
      color: "#FF5733",
      role: "Developer",
      hoursPerDay: 8,
    };
    expect(teamMemberSchema.safeParse(member).success).toBe(true);
  });

  it("rejects hoursPerDay > 24", () => {
    const member = {
      id: "m1",
      name: "Alice",
      color: "#FF5733",
      role: "Developer",
      hoursPerDay: 25,
    };
    expect(teamMemberSchema.safeParse(member).success).toBe(false);
  });
});

describe("projectSchema", () => {
  it("validates a minimal project", () => {
    const project = {
      id: "p1",
      name: "Test Project",
      deadline: null,
      items: [],
      team: [],
      overrides: [],
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    expect(projectSchema.safeParse(project).success).toBe(true);
  });

  it("validates a project with items and team", () => {
    const project = {
      id: "p1",
      name: "Test Project",
      deadline: "2026-12-31",
      items: [
        {
          id: "t1",
          type: "task",
          title: "Test Task",
          description: "",
          status: "todo",
          priority: "medium",
          assigneeId: "m1",
          estimatedDays: 2,
          dependencies: [],
          tags: [],
          parentId: null,
          order: 0,
          createdAt: "2026-03-30T00:00:00.000Z",
          updatedAt: "2026-03-30T00:00:00.000Z",
        },
      ],
      team: [
        { id: "m1", name: "Alice", color: "#FF5733", role: "Dev", hoursPerDay: 8 },
      ],
      overrides: [],
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    expect(projectSchema.safeParse(project).success).toBe(true);
  });
});
