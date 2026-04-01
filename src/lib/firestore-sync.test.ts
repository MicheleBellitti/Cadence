import { describe, it, expect } from "vitest";
import { normalizeEmailForDocId, serializeTimestamp, docToItem, collectDescendantIds } from "./firestore-sync";
import type { Item } from "@/types";

describe("normalizeEmailForDocId", () => {
  it("lowercases email", () => {
    expect(normalizeEmailForDocId("User@Example.COM")).toBe("user@example.com");
  });

  it("preserves dots (valid in Firestore doc IDs)", () => {
    expect(normalizeEmailForDocId("alice@my.company.com")).toBe("alice@my.company.com");
  });

  it("handles email with + alias", () => {
    expect(normalizeEmailForDocId("user+tag@gmail.com")).toBe("user+tag@gmail.com");
  });
});

describe("serializeTimestamp", () => {
  it("converts Firestore-like timestamp to ISO string", () => {
    const fakeTimestamp = {
      toDate: () => new Date("2026-03-31T10:00:00.000Z"),
    };
    expect(serializeTimestamp(fakeTimestamp)).toBe("2026-03-31T10:00:00.000Z");
  });

  it("returns ISO string as-is if already a string", () => {
    expect(serializeTimestamp("2026-03-31T10:00:00.000Z")).toBe("2026-03-31T10:00:00.000Z");
  });

  it("returns empty string for null/undefined", () => {
    expect(serializeTimestamp(null)).toBe("");
    expect(serializeTimestamp(undefined)).toBe("");
  });
});

describe("docToItem", () => {
  it("converts Firestore document data to Item with serialized timestamps", () => {
    const data = {
      type: "task",
      title: "Test task",
      description: "",
      status: "todo",
      priority: "medium",
      estimatedDays: 1,
      order: 0,
      createdAt: { toDate: () => new Date("2026-01-01T00:00:00Z") },
      updatedAt: { toDate: () => new Date("2026-01-02T00:00:00Z") },
    };
    const item = docToItem(data, "test-id");
    expect(item.id).toBe("test-id");
    expect(item.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(item.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(item.assigneeIds).toEqual([]);
    expect(item.dependencies).toEqual([]);
    expect(item.tags).toEqual([]);
    expect(item.parentId).toBeNull();
    expect(item.sprintId).toBeNull();
  });
});

describe("collectDescendantIds", () => {
  it("collects all descendants recursively", () => {
    const items = [
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "b" },
      { id: "d", parentId: null },
    ] as Pick<Item, "id" | "parentId">[];
    const result = collectDescendantIds("a", items);
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).toContain("c");
    expect(result).not.toContain("d");
    expect(result.size).toBe(3);
  });
});
