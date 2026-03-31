import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Item, Project, TeamMember, GanttOverride, Status, Sprint } from "@/types";
import { projectSchema } from "@/lib/validators";

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

  // Item CRUD
  addItem: (item: Omit<Item, "id" | "createdAt" | "updatedAt" | "order">) => string;
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
  updateSprint: (id: string, updates: Partial<Pick<Sprint, "name" | "goal">>) => void;
  deleteSprint: (id: string) => void;

  // Sprint lifecycle
  startSprint: (id: string, durationDays?: number) => void;
  completeSprint: (id: string, moveIncomplete: "next" | "backlog") => void;

  // Item-sprint assignment
  assignToSprint: (itemId: string, sprintId: string | null) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      project: emptyProject(),

      addItem: (item) => {
        const id = newId();
        const timestamp = now();
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
        return id;
      },

      updateItem: (id, updates) => {
        const timestamp = now();
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
      },

      deleteItem: (id) => {
        const timestamp = now();
        set((state) => {
          // Collect all IDs to delete: the item itself and all descendants
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
      },

      moveItem: (id, status) => {
        const timestamp = now();
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
      },

      reorderItem: (id, newOrder) => {
        const timestamp = now();
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
      },

      addDependency: (itemId, dependsOnId) => {
        const timestamp = now();
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
      },

      removeDependency: (itemId, dependsOnId) => {
        const timestamp = now();
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
      },

      addTeamMember: (member) => {
        const id = newId();
        const timestamp = now();
        set((state) => ({
          project: {
            ...state.project,
            team: [...state.project.team, { ...member, id }],
            updatedAt: timestamp,
          },
        }));
        return id;
      },

      updateTeamMember: (id, updates) => {
        const timestamp = now();
        set((state) => ({
          project: {
            ...state.project,
            team: state.project.team.map((member) =>
              member.id === id ? { ...member, ...updates } : member
            ),
            updatedAt: timestamp,
          },
        }));
      },

      removeTeamMember: (id) => {
        const timestamp = now();
        set((state) => ({
          project: {
            ...state.project,
            team: state.project.team.filter((member) => member.id !== id),
            items: state.project.items.map((item) =>
              item.assigneeIds.includes(id)
                ? ({ ...item, assigneeIds: item.assigneeIds.filter(aid => aid !== id), updatedAt: timestamp } as Item)
                : item
            ),
            updatedAt: timestamp,
          },
        }));
      },

      setOverride: (itemId, startDate) => {
        const timestamp = now();
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
      },

      removeOverride: (itemId) => {
        const timestamp = now();
        set((state) => ({
          project: {
            ...state.project,
            overrides: state.project.overrides.filter(
              (o) => o.itemId !== itemId
            ),
            updatedAt: timestamp,
          },
        }));
      },

      updateProject: (updates) => {
        const timestamp = now();
        set((state) => ({
          project: {
            ...state.project,
            ...updates,
            updatedAt: timestamp,
          },
        }));
      },

      importProject: (project) => {
        set({ project });
      },

      resetProject: () => {
        set({ project: emptyProject() });
      },

      addSprint: (name, goal = "") => {
        const id = newId();
        const timestamp = now();
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
        set((state) => ({
          project: {
            ...state.project,
            sprints: [...state.project.sprints, sprint],
            updatedAt: timestamp,
          },
        }));
        return id;
      },

      updateSprint: (id, updates) => {
        const timestamp = now();
        set((state) => ({
          project: {
            ...state.project,
            sprints: state.project.sprints.map((sp) =>
              sp.id === id ? { ...sp, ...updates, updatedAt: timestamp } : sp
            ),
            updatedAt: timestamp,
          },
        }));
      },

      deleteSprint: (id) => {
        const timestamp = now();
        set((state) => {
          const sprint = state.project.sprints.find((sp) => sp.id === id);
          if (!sprint || sprint.status !== "planning") return state;

          // Move items in this sprint to backlog
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
      },

      startSprint: (id, durationDays = 14) => {
        const timestamp = now();
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
      },

      completeSprint: (id, moveIncomplete) => {
        const timestamp = now();
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
      },

      assignToSprint: (itemId, sprintId) => {
        const timestamp = now();
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
      },
    }),
    {
      name: "cadence-project",
      // Migrate old assigneeId → assigneeIds when loading from localStorage,
      // then validate the result with Zod before trusting it.
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== "object") return current;
        const state = persisted as Record<string, unknown>;
        if (!state.project) return current;

        // Step 1: Run migrations on the raw persisted data BEFORE Zod validation,
        // because old data won't have assigneeIds.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const proj = state.project as any;
        if (proj?.items) {
          proj.items = proj.items.map((item: Record<string, unknown>) => {
            if (!("assigneeIds" in item)) {
              const oldId = item.assigneeId as string | null;
              const { assigneeId: _unused, ...rest } = item;
              return { ...rest, assigneeIds: oldId ? [oldId] : [] };
            }
            // Ensure assigneeIds is always an array (guard against undefined)
            if (!Array.isArray(item.assigneeIds)) {
              return { ...item, assigneeIds: [] };
            }
            return item;
          });
          // Ensure sprints and activeSprint exist (migration from pre-sprint data)
          if (!proj.sprints) proj.sprints = [];
          if (proj.activeSprint === undefined) proj.activeSprint = null;
        }

        // Step 2: Validate the migrated project data with Zod.
        const result = projectSchema.safeParse(proj);
        if (!result.success) {
          console.warn("Corrupted localStorage data, using defaults:", result.error.issues.slice(0, 3));
          return current;
        }
        return { ...current, project: result.data };
      },
    }
  )
);

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
