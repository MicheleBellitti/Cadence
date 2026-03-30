import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Item, Project, TeamMember, GanttOverride, Status } from "@/types";

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
              item.assigneeId === id
                ? ({ ...item, assigneeId: null, updatedAt: timestamp } as Item)
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
    }),
    {
      name: "iccrea-project",
    }
  )
);

// Convenience selector hooks
export const useItems = () => useProjectStore((s) => s.project.items);
export const useTeam = () => useProjectStore((s) => s.project.team);
export const useOverrides = () => useProjectStore((s) => s.project.overrides);
export const useItemById = (id: string) =>
  useProjectStore((s) => s.project.items.find((i) => i.id === id));
