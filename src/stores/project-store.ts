import { create } from "zustand";
import type {
  Item,
  Project,
  TeamMember,
  GanttOverride,
  Status,
  Sprint,
} from "@/types";
import type { Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  subscribeToProject,
  firestoreUpdateProject,
  firestoreAddItem,
  firestoreUpdateItem,
  firestoreDeleteItem,
  firestoreMoveItem,
  firestoreReorderItem,
  firestoreAddDependency,
  firestoreRemoveDependency,
  firestoreAddTeamMember,
  firestoreUpdateTeamMember,
  firestoreRemoveTeamMember,
  firestoreSetOverride,
  firestoreRemoveOverride,
  firestoreAddSprint,
  firestoreUpdateSprint,
  firestoreDeleteSprint,
  firestoreStartSprint,
  firestoreCompleteSprint,
  firestoreAssignToSprint,
} from "@/lib/firestore-sync";

function now(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

function emptyProject(): Project {
  return {
    id: newId(),
    name: "New Project",
    deadline: null,
    items: [],
    team: [],
    overrides: [],
    sprints: [],
    activeSprint: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

interface ProjectState {
  project: Project;
  projectId: string | null;
  loading: boolean;
  syncing: boolean;

  // Internal setters (called by onSnapshot listeners — not for UI use)
  _setProject: (data: Partial<Project>) => void;
  _setItems: (items: Item[]) => void;
  _setTeam: (team: TeamMember[]) => void;
  _setSprints: (sprints: Sprint[]) => void;
  _setOverrides: (overrides: GanttOverride[]) => void;
  _setLoading: (loading: boolean) => void;
  _setSyncing: (syncing: boolean) => void;
  _setProjectId: (id: string) => void;

  // Initialize sync (called by ProjectSync component)
  initializeSync: (projectId: string) => Unsubscribe[];

  // Item CRUD
  addItem: (
    item: Omit<Item, "id" | "createdAt" | "updatedAt" | "order">
  ) => string;
  updateItem: (id: string, updates: Partial<Item>) => void;
  deleteItem: (id: string) => void;
  moveItem: (id: string, status: Status) => void;
  reorderItem: (id: string, newOrder: number) => void;

  // Dependencies
  addDependency: (itemId: string, dependsOnId: string) => void;
  removeDependency: (itemId: string, dependsOnId: string) => void;

  // Team
  addTeamMember: (member: Omit<TeamMember, "id">) => string;
  updateTeamMember: (id: string, updates: Partial<TeamMember>) => void;
  removeTeamMember: (id: string) => void;

  // Overrides
  setOverride: (itemId: string, startDate: string) => void;
  removeOverride: (itemId: string) => void;

  // Project
  updateProject: (updates: Partial<Pick<Project, "name" | "deadline">>) => void;
  importProject: (project: Project) => void;
  resetProject: () => void;

  // Sprint CRUD
  addSprint: (name: string, goal?: string) => string;
  updateSprint: (
    id: string,
    updates: Partial<Pick<Sprint, "name" | "goal">>
  ) => void;
  deleteSprint: (id: string) => void;

  // Sprint lifecycle
  startSprint: (id: string, durationDays?: number) => void;
  completeSprint: (id: string, moveIncomplete: "next" | "backlog") => void;

  // Item-sprint assignment
  assignToSprint: (itemId: string, sprintId: string | null) => void;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  project: emptyProject(),
  projectId: null,
  loading: true,
  syncing: false,

  // ─── Internal setters ───────────────────────────────────────────────────────

  _setProject: (data) =>
    set((state) => ({ project: { ...state.project, ...data } })),

  _setItems: (items) =>
    set((state) => ({ project: { ...state.project, items } })),

  _setTeam: (team) =>
    set((state) => ({ project: { ...state.project, team } })),

  _setSprints: (sprints) =>
    set((state) => ({ project: { ...state.project, sprints } })),

  _setOverrides: (overrides) =>
    set((state) => ({ project: { ...state.project, overrides } })),

  _setLoading: (loading) => set({ loading }),

  _setSyncing: (syncing) => set({ syncing }),

  _setProjectId: (id) => set({ projectId: id }),

  // ─── Initialize sync ───────────────────────────────────────────────────────

  initializeSync: (projectId) => {
    set({ projectId, loading: true });
    const unsubscribes = subscribeToProject(db, projectId, {
      onProjectUpdate: (data) =>
        set((state) => ({ project: { ...state.project, ...data } })),
      onItemsUpdate: (items) =>
        set((state) => ({ project: { ...state.project, items } })),
      onTeamUpdate: (team) =>
        set((state) => ({ project: { ...state.project, team } })),
      onSprintsUpdate: (sprints) =>
        set((state) => ({ project: { ...state.project, sprints } })),
      onOverridesUpdate: (overrides) =>
        set((state) => ({ project: { ...state.project, overrides } })),
      onError: (error) => console.error("Firestore sync error:", error),
      onSyncStateChange: (loading, syncing) => set({ loading, syncing }),
    });
    return unsubscribes;
  },

  // ─── Item CRUD ──────────────────────────────────────────────────────────────

  addItem: (item) => {
    const id = newId();
    const timestamp = now();
    const { projectId } = get();

    // 1. Optimistic local update
    set((state) => {
      const siblings = state.project.items.filter(
        (i) => i.parentId === item.parentId
      );
      const maxOrder = siblings.reduce(
        (max, i) => Math.max(max, i.order),
        -1
      );
      const newItem = {
        ...item,
        id,
        order: maxOrder + 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      } as Item;
      return {
        project: {
          ...state.project,
          items: [...state.project.items, newItem],
          updatedAt: timestamp,
        },
      };
    });

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      const { project } = get();
      const addedItem = project.items.find((i) => i.id === id);
      if (addedItem) {
        firestoreAddItem(db, projectId, addedItem, "").catch(console.error);
      }
    }
    return id;
  },

  updateItem: (id, updates) => {
    const timestamp = now();
    const { projectId } = get();

    // 1. Optimistic local update
    set((state) => ({
      project: {
        ...state.project,
        items: state.project.items.map((item) =>
          item.id === id
            ? ({ ...item, ...updates, updatedAt: timestamp } as Item)
            : item
        ),
        updatedAt: timestamp,
      },
    }));

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreUpdateItem(db, projectId, id, updates, "").catch(
        console.error
      );
    }
  },

  deleteItem: (id) => {
    const timestamp = now();
    const { projectId, project } = get();
    const allItems = project.items;
    const allOverrides = project.overrides;

    // 1. Optimistic local update
    set((state) => {
      const toDelete = new Set<string>();
      const collectDescendants = (parentId: string) => {
        toDelete.add(parentId);
        state.project.items.forEach((item) => {
          if (item.parentId === parentId) {
            collectDescendants(item.id);
          }
        });
      };
      collectDescendants(id);

      const filteredItems = state.project.items
        .filter((item) => !toDelete.has(item.id))
        .map((item) => ({
          ...item,
          dependencies: item.dependencies.filter(
            (depId) => !toDelete.has(depId)
          ),
        })) as Item[];

      const filteredOverrides = state.project.overrides.filter(
        (o) => !toDelete.has(o.itemId)
      );

      return {
        project: {
          ...state.project,
          items: filteredItems,
          overrides: filteredOverrides,
          updatedAt: timestamp,
        },
      };
    });

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreDeleteItem(db, projectId, id, allItems, allOverrides).catch(
        console.error
      );
    }
  },

  moveItem: (id, status) => {
    const timestamp = now();
    const { projectId } = get();

    // 1. Optimistic local update
    set((state) => ({
      project: {
        ...state.project,
        items: state.project.items.map((item) =>
          item.id === id
            ? ({ ...item, status, updatedAt: timestamp } as Item)
            : item
        ),
        updatedAt: timestamp,
      },
    }));

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreMoveItem(db, projectId, id, status, "").catch(console.error);
    }
  },

  reorderItem: (id, newOrder) => {
    const timestamp = now();
    const { projectId } = get();

    // 1. Optimistic local update
    set((state) => ({
      project: {
        ...state.project,
        items: state.project.items.map((item) =>
          item.id === id
            ? ({ ...item, order: newOrder, updatedAt: timestamp } as Item)
            : item
        ),
        updatedAt: timestamp,
      },
    }));

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreReorderItem(db, projectId, id, newOrder, "").catch(
        console.error
      );
    }
  },

  // ─── Dependencies ─────────────────────────────────────────────────────────

  addDependency: (itemId, dependsOnId) => {
    const timestamp = now();
    const { projectId } = get();

    // Get current deps before updating
    const currentItem = get().project.items.find((i) => i.id === itemId);
    const currentDeps = currentItem?.dependencies ?? [];

    // 1. Optimistic local update
    set((state) => ({
      project: {
        ...state.project,
        items: state.project.items.map((item) =>
          item.id === itemId
            ? ({
                ...item,
                dependencies: [...item.dependencies, dependsOnId],
                updatedAt: timestamp,
              } as Item)
            : item
        ),
        updatedAt: timestamp,
      },
    }));

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreAddDependency(
        db,
        projectId,
        itemId,
        currentDeps,
        dependsOnId,
        ""
      ).catch(console.error);
    }
  },

  removeDependency: (itemId, dependsOnId) => {
    const timestamp = now();
    const { projectId } = get();

    // Get current deps before updating
    const currentItem = get().project.items.find((i) => i.id === itemId);
    const currentDeps = currentItem?.dependencies ?? [];

    // 1. Optimistic local update
    set((state) => ({
      project: {
        ...state.project,
        items: state.project.items.map((item) =>
          item.id === itemId
            ? ({
                ...item,
                dependencies: item.dependencies.filter(
                  (d) => d !== dependsOnId
                ),
                updatedAt: timestamp,
              } as Item)
            : item
        ),
        updatedAt: timestamp,
      },
    }));

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreRemoveDependency(
        db,
        projectId,
        itemId,
        currentDeps,
        dependsOnId,
        ""
      ).catch(console.error);
    }
  },

  // ─── Team ─────────────────────────────────────────────────────────────────

  addTeamMember: (member) => {
    const id = newId();
    const timestamp = now();
    const { projectId } = get();

    // 1. Optimistic local update
    set((state) => ({
      project: {
        ...state.project,
        team: [...state.project.team, { ...member, id }],
        updatedAt: timestamp,
      },
    }));

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreAddTeamMember(db, projectId, { ...member, id }).catch(console.error);
    }
    return id;
  },

  updateTeamMember: (id, updates) => {
    const timestamp = now();
    const { projectId } = get();

    // 1. Optimistic local update
    set((state) => ({
      project: {
        ...state.project,
        team: state.project.team.map((member) =>
          member.id === id ? { ...member, ...updates } : member
        ),
        updatedAt: timestamp,
      },
    }));

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreUpdateTeamMember(db, projectId, id, updates).catch(
        console.error
      );
    }
  },

  removeTeamMember: (id) => {
    const timestamp = now();
    const { projectId, project } = get();
    const allItems = project.items;

    // 1. Optimistic local update
    set((state) => ({
      project: {
        ...state.project,
        team: state.project.team.filter((member) => member.id !== id),
        items: state.project.items.map((item) =>
          item.assigneeIds.includes(id)
            ? ({
                ...item,
                assigneeIds: item.assigneeIds.filter((aid) => aid !== id),
                updatedAt: timestamp,
              } as Item)
            : item
        ),
        updatedAt: timestamp,
      },
    }));

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreRemoveTeamMember(db, projectId, id, allItems).catch(
        console.error
      );
    }
  },

  // ─── Overrides ────────────────────────────────────────────────────────────

  setOverride: (itemId, startDate) => {
    const timestamp = now();
    const { projectId } = get();

    // 1. Optimistic local update
    set((state) => {
      const filteredOverrides = state.project.overrides.filter(
        (o) => o.itemId !== itemId
      );
      const newOverride: GanttOverride = { itemId, startDate };
      return {
        project: {
          ...state.project,
          overrides: [...filteredOverrides, newOverride],
          updatedAt: timestamp,
        },
      };
    });

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreSetOverride(db, projectId, itemId, startDate).catch(
        console.error
      );
    }
  },

  removeOverride: (itemId) => {
    const timestamp = now();
    const { projectId } = get();

    // 1. Optimistic local update
    set((state) => ({
      project: {
        ...state.project,
        overrides: state.project.overrides.filter(
          (o) => o.itemId !== itemId
        ),
        updatedAt: timestamp,
      },
    }));

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreRemoveOverride(db, projectId, itemId).catch(console.error);
    }
  },

  // ─── Project ──────────────────────────────────────────────────────────────

  updateProject: (updates) => {
    const timestamp = now();
    const { projectId } = get();

    // 1. Optimistic local update
    set((state) => ({
      project: {
        ...state.project,
        ...updates,
        updatedAt: timestamp,
      },
    }));

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreUpdateProject(db, projectId, updates).catch(console.error);
    }
  },

  importProject: (project) => {
    set({ project });
  },

  resetProject: () => {
    set({ project: emptyProject() });
  },

  // ─── Sprint CRUD ──────────────────────────────────────────────────────────

  addSprint: (name, goal = "") => {
    const id = newId();
    const timestamp = now();
    const { projectId } = get();
    const sprint: Sprint = {
      id,
      name,
      goal,
      status: "planning",
      startDate: null,
      endDate: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // 1. Optimistic local update
    set((state) => ({
      project: {
        ...state.project,
        sprints: [...state.project.sprints, sprint],
        updatedAt: timestamp,
      },
    }));

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreAddSprint(db, projectId, sprint).catch(console.error);
    }
    return id;
  },

  updateSprint: (id, updates) => {
    const timestamp = now();
    const { projectId } = get();

    // 1. Optimistic local update
    set((state) => ({
      project: {
        ...state.project,
        sprints: state.project.sprints.map((sp) =>
          sp.id === id ? { ...sp, ...updates, updatedAt: timestamp } : sp
        ),
        updatedAt: timestamp,
      },
    }));

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreUpdateSprint(db, projectId, id, updates).catch(console.error);
    }
  },

  deleteSprint: (id) => {
    const timestamp = now();
    const { projectId, project } = get();
    const sprint = project.sprints.find((sp) => sp.id === id);
    const allItems = project.items;

    // 1. Optimistic local update
    set((state) => {
      const localSprint = state.project.sprints.find((sp) => sp.id === id);
      if (!localSprint || localSprint.status !== "planning") return state;

      const updatedItems = state.project.items.map((item) =>
        item.sprintId === id
          ? ({ ...item, sprintId: null, updatedAt: timestamp } as Item)
          : item
      );

      return {
        project: {
          ...state.project,
          sprints: state.project.sprints.filter((sp) => sp.id !== id),
          items: updatedItems,
          updatedAt: timestamp,
        },
      };
    });

    // 2. Fire-and-forget Firestore write
    if (projectId && sprint && sprint.status === "planning") {
      firestoreDeleteSprint(db, projectId, id, allItems).catch(
        console.error
      );
    }
  },

  // ─── Sprint lifecycle ─────────────────────────────────────────────────────

  startSprint: (id, durationDays = 14) => {
    const timestamp = now();
    const { projectId } = get();

    // 1. Optimistic local update
    set((state) => {
      const hasActive = state.project.sprints.some(
        (sp) => sp.status === "active"
      );
      if (hasActive) return state;

      const startDate = timestamp;
      const endDateObj = new Date(startDate);
      endDateObj.setDate(endDateObj.getDate() + durationDays);
      const endDate = endDateObj.toISOString();

      return {
        project: {
          ...state.project,
          sprints: state.project.sprints.map((sp) =>
            sp.id === id
              ? {
                  ...sp,
                  status: "active" as const,
                  startDate,
                  endDate,
                  updatedAt: timestamp,
                }
              : sp
          ),
          activeSprint: id,
          updatedAt: timestamp,
        },
      };
    });

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      const endDateObj = new Date(timestamp);
      endDateObj.setDate(endDateObj.getDate() + durationDays);
      firestoreStartSprint(
        db,
        projectId,
        id,
        timestamp,
        endDateObj.toISOString()
      ).catch(console.error);
    }
  },

  completeSprint: (id, moveIncomplete) => {
    const timestamp = now();
    const { projectId, project } = get();
    const allItems = project.items;
    const allSprints = project.sprints;

    // 1. Optimistic local update
    set((state) => {
      let nextSprintId: string | null = null;
      if (moveIncomplete === "next") {
        const nextSprint = state.project.sprints.find(
          (sp) => sp.status === "planning"
        );
        nextSprintId = nextSprint?.id ?? null;
      }

      const updatedItems = state.project.items.map((item) => {
        if (item.sprintId === id && item.status !== "done") {
          return {
            ...item,
            sprintId: nextSprintId,
            updatedAt: timestamp,
          } as Item;
        }
        return item;
      });

      return {
        project: {
          ...state.project,
          sprints: state.project.sprints.map((sp) =>
            sp.id === id
              ? {
                  ...sp,
                  status: "completed" as const,
                  endDate: timestamp,
                  updatedAt: timestamp,
                }
              : sp
          ),
          items: updatedItems,
          activeSprint: null,
          updatedAt: timestamp,
        },
      };
    });

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreCompleteSprint(
        db,
        projectId,
        id,
        allItems,
        moveIncomplete,
        allSprints
      ).catch(console.error);
    }
  },

  // ─── Item-sprint assignment ───────────────────────────────────────────────

  assignToSprint: (itemId, sprintId) => {
    const timestamp = now();
    const { projectId } = get();

    // 1. Optimistic local update
    set((state) => ({
      project: {
        ...state.project,
        items: state.project.items.map((item) =>
          item.id === itemId
            ? ({ ...item, sprintId, updatedAt: timestamp } as Item)
            : item
        ),
        updatedAt: timestamp,
      },
    }));

    // 2. Fire-and-forget Firestore write
    if (projectId) {
      firestoreAssignToSprint(db, projectId, itemId, sprintId, "").catch(
        console.error
      );
    }
  },
}));

// Convenience selector hooks
export const useItems = () => useProjectStore((s) => s.project.items);
export const useTeam = () => useProjectStore((s) => s.project.team);
export const useOverrides = () => useProjectStore((s) => s.project.overrides);
export const useItemById = (id: string) =>
  useProjectStore((s) => s.project.items.find((i) => i.id === id));
export const useSprints = () => useProjectStore((s) => s.project.sprints);
export const useActiveSprint = () =>
  useProjectStore((s) => {
    const id = s.project.activeSprint;
    return id ? s.project.sprints.find((sp) => sp.id === id) ?? null : null;
  });

// New selectors for sync state
export const useLoading = () => useProjectStore((s) => s.loading);
export const useSyncing = () => useProjectStore((s) => s.syncing);
export const useProjectId = () => useProjectStore((s) => s.projectId);
