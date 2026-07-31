import { describe, it, expect } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import {
  authorizeProjectAccess,
  resolveProjectId,
  listProjectsForUser,
  loadProjectSnapshot,
  getCurrentProjectId,
  ToolError,
  PROJECT_ACCESS_DENIED_MESSAGE,
} from "./project-data.js";
import { buildFakeFirestore } from "./test-helpers.js";

function fakeDb(opts: Parameters<typeof buildFakeFirestore>[0]): Firestore {
  return buildFakeFirestore(opts) as unknown as Firestore;
}

const OWNER_UID = "uid-owner";
const MEMBER_UID = "uid-member";
const OUTSIDER_UID = "uid-outsider";

function seedTwoProjects() {
  return fakeDb({
    projects: [
      {
        id: "proj-a",
        name: "Project A",
        ownerId: OWNER_UID,
        memberIds: [OWNER_UID, MEMBER_UID],
        activeSprint: "sprint-1",
        items: [{ id: "item-1", type: "task", title: "Do the thing", status: "todo" }],
        team: [{ id: "member-1", name: "Alice" }],
        sprints: [{ id: "sprint-1", name: "Sprint 1" }],
        overrides: [{ id: "item-1", startDate: "2026-08-01" }],
      },
      {
        id: "proj-b",
        name: "Project B",
        ownerId: OUTSIDER_UID,
        memberIds: [OUTSIDER_UID],
      },
    ],
    users: [
      { uid: OWNER_UID, projectId: "proj-a" },
      { uid: MEMBER_UID, projectId: null },
    ],
  });
}

describe("authorizeProjectAccess", () => {
  it("allows a member", async () => {
    const db = seedTwoProjects();
    const meta = await authorizeProjectAccess(db, MEMBER_UID, "proj-a");
    expect(meta.id).toBe("proj-a");
    expect(meta.name).toBe("Project A");
    expect(meta.memberIds).toContain(MEMBER_UID);
  });

  it("rejects a non-member with the generic access-denied message", async () => {
    const db = seedTwoProjects();
    await expect(authorizeProjectAccess(db, OUTSIDER_UID, "proj-a")).rejects.toMatchObject({
      name: "ToolError",
      message: PROJECT_ACCESS_DENIED_MESSAGE,
    });
  });

  it("rejects a nonexistent project with the same generic message", async () => {
    const db = seedTwoProjects();
    await expect(authorizeProjectAccess(db, MEMBER_UID, "proj-does-not-exist")).rejects.toMatchObject({
      name: "ToolError",
      message: PROJECT_ACCESS_DENIED_MESSAGE,
    });
  });

  it("gives byte-identical messages for 'non-member' and 'nonexistent' — a non-member must not be able to tell them apart", async () => {
    const db = seedTwoProjects();

    let nonMemberMessage: string | undefined;
    let nonexistentMessage: string | undefined;

    try {
      await authorizeProjectAccess(db, OUTSIDER_UID, "proj-a");
    } catch (err) {
      nonMemberMessage = (err as ToolError).message;
    }

    try {
      await authorizeProjectAccess(db, MEMBER_UID, "proj-does-not-exist");
    } catch (err) {
      nonexistentMessage = (err as ToolError).message;
    }

    expect(nonMemberMessage).toBeDefined();
    expect(nonexistentMessage).toBeDefined();
    expect(nonMemberMessage).toBe(nonexistentMessage);
    expect(nonMemberMessage).toBe(PROJECT_ACCESS_DENIED_MESSAGE);
  });
});

describe("resolveProjectId", () => {
  it("prefers an explicit projectId over the user's current project", async () => {
    const db = seedTwoProjects();
    const pid = await resolveProjectId(db, OWNER_UID, "proj-b");
    expect(pid).toBe("proj-b");
  });

  it("falls back to users/{uid}.projectId when no explicit id is given", async () => {
    const db = seedTwoProjects();
    const pid = await resolveProjectId(db, OWNER_UID, undefined);
    expect(pid).toBe("proj-a");
  });

  it("throws a ToolError directing the caller to list_projects when neither is available", async () => {
    const db = seedTwoProjects();
    await expect(resolveProjectId(db, MEMBER_UID, undefined)).rejects.toMatchObject({
      name: "ToolError",
    });
    await expect(resolveProjectId(db, MEMBER_UID, undefined)).rejects.toThrow(/list_projects/);
  });

  it("throws for a uid with no users/ doc at all", async () => {
    const db = seedTwoProjects();
    await expect(resolveProjectId(db, "uid-never-seen", undefined)).rejects.toMatchObject({
      name: "ToolError",
    });
  });
});

describe("getCurrentProjectId", () => {
  it("returns null when the user doc doesn't exist", async () => {
    const db = seedTwoProjects();
    expect(await getCurrentProjectId(db, "uid-never-seen")).toBeNull();
  });

  it("returns null when projectId is null", async () => {
    const db = seedTwoProjects();
    expect(await getCurrentProjectId(db, MEMBER_UID)).toBeNull();
  });

  it("returns the projectId when set", async () => {
    const db = seedTwoProjects();
    expect(await getCurrentProjectId(db, OWNER_UID)).toBe("proj-a");
  });
});

describe("listProjectsForUser", () => {
  it("returns only projects the uid is a member of", async () => {
    const db = seedTwoProjects();
    const asOwner = await listProjectsForUser(db, OWNER_UID);
    expect(asOwner.map((p) => p.id)).toEqual(["proj-a"]);

    const asOutsider = await listProjectsForUser(db, OUTSIDER_UID);
    expect(asOutsider.map((p) => p.id)).toEqual(["proj-b"]);
  });

  it("returns an empty list for a uid in no projects", async () => {
    const db = seedTwoProjects();
    expect(await listProjectsForUser(db, "uid-nobody")).toEqual([]);
  });
});

describe("loadProjectSnapshot", () => {
  it("authorizes and returns the full project graph for a member", async () => {
    const db = seedTwoProjects();
    const project = await loadProjectSnapshot(db, MEMBER_UID, "proj-a");

    expect(project.id).toBe("proj-a");
    expect(project.items).toHaveLength(1);
    expect(project.items[0].id).toBe("item-1");
    expect(project.team).toHaveLength(1);
    expect(project.sprints).toHaveLength(1);
    expect(project.overrides).toEqual([{ itemId: "item-1", startDate: "2026-08-01" }]);
  });

  it("cannot be used to bypass authorization for a non-member", async () => {
    const db = seedTwoProjects();
    await expect(loadProjectSnapshot(db, OUTSIDER_UID, "proj-a")).rejects.toMatchObject({
      name: "ToolError",
      message: PROJECT_ACCESS_DENIED_MESSAGE,
    });
  });
});
