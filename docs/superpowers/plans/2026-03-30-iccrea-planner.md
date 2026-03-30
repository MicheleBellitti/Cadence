# ICCREA Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-side project planning tool with Kanban board, interactive Gantt chart with Critical Path Method analysis, and workload management — stored entirely in localStorage.

**Architecture:** Next.js 15 App Router with static export. Three Zustand stores (project/persisted, gantt/ephemeral, ui/persisted). Pure scheduling/CPM logic in `lib/`, components organized by feature. All date arithmetic uses business days. Dependency graph is a DAG with cycle detection via DFS.

**Tech Stack:** Next.js 15, TypeScript 5 (strict), Tailwind CSS 4, Zustand 5, @dnd-kit, Framer Motion 12, date-fns 4, Zod 3, Lucide React, Vitest

**Reference docs:**
- PRD: `docs/ICCREA_Planner_PRD.md` (copied from docx)
- Architecture: `docs/architecture.md`
- CLAUDE.md at project root

---

## File Structure

```
src/
  types/
    index.ts                    — All TypeScript interfaces, enums, type unions
  lib/
    date-utils.ts               — Business day arithmetic (addBusinessDays, businessDaysBetween, isBusinessDay)
    date-utils.test.ts          — Tests for date utils
    validators.ts               — Zod schemas for all item types, project, import validation
    validators.test.ts          — Tests for validators
    scheduler.ts                — Forward/backward scheduling engine
    scheduler.test.ts           — Tests for scheduler
    critical-path.ts            — CPM algorithm (topo sort, forward/backward pass, slack, cycle detection)
    critical-path.test.ts       — Tests for critical path
    workload.ts                 — Per-person daily load calculator
    workload.test.ts            — Tests for workload
    export.ts                   — JSON/PNG/PDF export via Canvas API
  stores/
    project-store.ts            — Items CRUD, team, overrides (persisted → iccrea-project)
    gantt-store.ts              — Zoom, scroll, selection, collapsed epics (ephemeral)
    ui-store.ts                 — Theme, sidebar, modals (persisted → iccrea-ui)
  components/
    ui/
      button.tsx                — Button component (variants: primary, secondary, ghost, danger)
      input.tsx                 — Input component (text, number, date)
      select.tsx                — Select dropdown
      badge.tsx                 — Badge/pill (for priority, type, status)
      modal.tsx                 — Modal dialog with overlay
      tooltip.tsx               — Tooltip (follows cursor or anchored)
    layout/
      sidebar.tsx               — Navigation sidebar (collapsible, 240px/64px)
      navbar.tsx                — Top bar (breadcrumb, search, theme toggle, export)
      theme-toggle.tsx          — Dark/light mode toggle
      theme-provider.tsx        — Theme context provider (system-aware)
    board/
      kanban-board.tsx          — Board container with DndContext, columns, filters
      kanban-column.tsx         — Single status column (header, cards, quick-add)
      kanban-card.tsx           — Draggable card (type icon, title, assignee, priority)
    items/
      item-detail-drawer.tsx    — Slide-in panel (480px) with full item form
      item-form.tsx             — Form fields for all item types
    gantt/
      gantt-chart.tsx           — Main gantt container (task list + chart area)
      gantt-controls.tsx        — Zoom toggle, filters, export buttons
      gantt-task-list.tsx       — Left panel with sortable rows
      gantt-timeline.tsx        — Column headers (day/week/month)
      gantt-body.tsx            — Chart area with grid, bars, arrows
      gantt-row.tsx             — Single row in chart area
      gantt-bar.tsx             — Draggable, resizable bar
      gantt-tooltip.tsx         — Hover tooltip on bars
      dependency-arrows.tsx     — SVG overlay with Bezier curves
    workload/
      workload-grid.tsx         — Grid: rows=members, cols=days, cells=hours
      workload-cell.tsx         — Single cell with color coding
      workload-drilldown.tsx    — Modal showing contributing tasks
    settings/
      settings-page.tsx         — Container for all settings sections
      project-settings.tsx      — Project name, deadline
      team-manager.tsx          — Team member CRUD
      data-manager.tsx          — Import/export/reset
  app/
    globals.css                 — CSS variables for light/dark themes
    layout.tsx                  — Root layout with providers
    page.tsx                    — Redirect to /board
    board/page.tsx              — Kanban view page
    gantt/page.tsx              — Gantt view page
    workload/page.tsx           — Workload view page
    settings/page.tsx           — Settings page
```

---

## Phase 1: Foundation

### Task 1: Initialize Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.gitignore`, `CLAUDE.md`

- [ ] **Step 1: Create Next.js app with TypeScript and Tailwind**

```bash
cd /Users/michele.bellitti/dev/private/Plato
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias --use-npm
```

Accept defaults. This scaffolds the project with App Router, TypeScript, Tailwind CSS, and ESLint.

- [ ] **Step 2: Install all dependencies**

```bash
npm install zustand @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities framer-motion date-fns zod lucide-react react-window
npm install -D @types/react-window vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

- [ ] **Step 3: Configure Next.js for static export**

Write `next.config.ts`:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
```

- [ ] **Step 4: Configure Vitest**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Create `src/test-setup.ts`:
```typescript
import "@testing-library/jest-dom/vitest";
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Copy CLAUDE.md to project root**

Copy from the reference file. This is the agent onboarding guide.

- [ ] **Step 6: Copy architecture.md to docs/**

```bash
mkdir -p docs
```
Copy `architecture.md` to `docs/architecture.md`.

- [ ] **Step 7: Initialize git repo and commit**

```bash
git init
git add -A
git commit -m "feat: initialize Next.js 15 project with TypeScript, Tailwind, Zustand, dnd-kit, Vitest"
```

---

### Task 2: TypeScript Types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Define all types and interfaces**

```typescript
// src/types/index.ts

export type ItemType = "epic" | "story" | "task" | "bug";
export type Status = "todo" | "in_progress" | "in_review" | "done";
export type Priority = "critical" | "high" | "medium" | "low";
export type Severity = "critical" | "high" | "medium" | "low";
export type ZoomLevel = "day" | "week" | "month";
export type Theme = "light" | "dark" | "system";

export interface BaseItem {
  id: string;
  type: ItemType;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  assigneeId: string | null;
  estimatedDays: number;
  dependencies: string[];
  tags: string[];
  parentId: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Epic extends BaseItem {
  type: "epic";
  targetDate: string | null;
}

export interface Story extends BaseItem {
  type: "story";
  storyPoints: number;
  acceptanceCriteria: string;
}

export interface Task extends BaseItem {
  type: "task";
}

export interface Bug extends BaseItem {
  type: "bug";
  severity: Severity;
  stepsToReproduce: string;
}

export type Item = Epic | Story | Task | Bug;

export interface TeamMember {
  id: string;
  name: string;
  color: string;
  role: string;
  hoursPerDay: number;
}

export interface GanttOverride {
  itemId: string;
  startDate: string;
}

export interface Project {
  id: string;
  name: string;
  deadline: string | null;
  items: Item[];
  team: TeamMember[];
  overrides: GanttOverride[];
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledItem {
  itemId: string;
  startDate: string;
  endDate: string;
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
  slack: number;
  isCritical: boolean;
}

export const STATUSES: Status[] = ["todo", "in_progress", "in_review", "done"];

export const STATUS_LABELS: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const ITEM_COLORS: Record<ItemType, string> = {
  epic: "#7C3AED",
  story: "#2563EB",
  task: "#059669",
  bug: "#DC2626",
};
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: define TypeScript data model (Item hierarchy, Project, TeamMember, ScheduledItem)"
```

---

### Task 3: Date Utilities (TDD)

**Files:**
- Create: `src/lib/date-utils.ts`, `src/lib/date-utils.test.ts`

- [ ] **Step 1: Write failing tests for date utilities**

```typescript
// src/lib/date-utils.test.ts
import { describe, it, expect } from "vitest";
import { isBusinessDay, addBusinessDays, businessDaysBetween } from "./date-utils";

describe("isBusinessDay", () => {
  it("returns true for Monday through Friday", () => {
    expect(isBusinessDay(new Date("2026-03-30"))).toBe(true); // Monday
    expect(isBusinessDay(new Date("2026-04-03"))).toBe(true); // Friday
  });

  it("returns false for Saturday and Sunday", () => {
    expect(isBusinessDay(new Date("2026-03-28"))).toBe(false); // Saturday
    expect(isBusinessDay(new Date("2026-03-29"))).toBe(false); // Sunday
  });
});

describe("addBusinessDays", () => {
  it("adds days within the same week", () => {
    const monday = new Date("2026-03-30");
    const result = addBusinessDays(monday, 3);
    expect(result.toISOString().slice(0, 10)).toBe("2026-04-02"); // Thursday
  });

  it("skips weekends", () => {
    const friday = new Date("2026-04-03");
    const result = addBusinessDays(friday, 1);
    expect(result.toISOString().slice(0, 10)).toBe("2026-04-06"); // Monday
  });

  it("handles multi-week spans", () => {
    const monday = new Date("2026-03-30");
    const result = addBusinessDays(monday, 7);
    expect(result.toISOString().slice(0, 10)).toBe("2026-04-08"); // Wednesday next week
  });

  it("handles half days (rounds up)", () => {
    const monday = new Date("2026-03-30");
    const result = addBusinessDays(monday, 0.5);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-30"); // Same day
  });

  it("returns same day for 0 days", () => {
    const monday = new Date("2026-03-30");
    const result = addBusinessDays(monday, 0);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-30");
  });
});

describe("businessDaysBetween", () => {
  it("counts days within a week", () => {
    const monday = new Date("2026-03-30");
    const friday = new Date("2026-04-03");
    expect(businessDaysBetween(monday, friday)).toBe(4);
  });

  it("excludes weekends", () => {
    const friday = new Date("2026-04-03");
    const nextMonday = new Date("2026-04-06");
    expect(businessDaysBetween(friday, nextMonday)).toBe(1);
  });

  it("returns 0 for same day", () => {
    const day = new Date("2026-03-30");
    expect(businessDaysBetween(day, day)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/date-utils.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement date utilities**

```typescript
// src/lib/date-utils.ts
import { addDays, differenceInCalendarDays, getDay, startOfDay } from "date-fns";

export function isBusinessDay(date: Date): boolean {
  const day = getDay(date);
  return day !== 0 && day !== 6;
}

export function addBusinessDays(date: Date, days: number): Date {
  const wholeDays = Math.ceil(days);
  if (wholeDays <= 0) return startOfDay(date);

  let current = startOfDay(date);
  let remaining = wholeDays;

  // If starting on a weekend, advance to Monday first
  while (!isBusinessDay(current)) {
    current = addDays(current, 1);
  }

  // For durations < 1, stay on the same day
  if (days < 1) return current;

  // Count business days (we need `wholeDays - 1` more days after start)
  let added = 0;
  while (added < wholeDays - 1) {
    current = addDays(current, 1);
    if (isBusinessDay(current)) {
      added++;
    }
  }

  return current;
}

export function businessDaysBetween(start: Date, end: Date): number {
  const s = startOfDay(start);
  const e = startOfDay(end);
  const totalDays = differenceInCalendarDays(e, s);

  if (totalDays <= 0) return 0;

  let count = 0;
  let current = s;
  for (let i = 0; i < totalDays; i++) {
    current = addDays(current, 1);
    if (isBusinessDay(current)) {
      count++;
    }
  }

  return count;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDate(dateStr: string): Date {
  return startOfDay(new Date(dateStr));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/date-utils.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/date-utils.ts src/lib/date-utils.test.ts
git commit -m "feat: add business day arithmetic utilities with tests"
```

---

### Task 4: Zod Validators

**Files:**
- Create: `src/lib/validators.ts`, `src/lib/validators.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/validators.test.ts
import { describe, it, expect } from "vitest";
import { itemSchema, projectSchema } from "./validators";

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

  it("rejects item with missing title", () => {
    const item = { type: "task", title: "" };
    expect(itemSchema.safeParse(item).success).toBe(false);
  });

  it("validates an epic with targetDate", () => {
    const epic = {
      id: "123e4567-e89b-12d3-a456-426614174001",
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

  it("validates a bug with severity", () => {
    const bug = {
      id: "123e4567-e89b-12d3-a456-426614174002",
      type: "bug",
      title: "Login fails",
      description: "",
      status: "todo",
      priority: "critical",
      assigneeId: null,
      estimatedDays: 1,
      dependencies: [],
      tags: [],
      parentId: null,
      order: 0,
      severity: "critical",
      stepsToReproduce: "1. Go to login\n2. Enter credentials",
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    expect(itemSchema.safeParse(bug).success).toBe(true);
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/validators.test.ts
```

- [ ] **Step 3: Implement validators**

```typescript
// src/lib/validators.ts
import { z } from "zod";

const itemTypeSchema = z.enum(["epic", "story", "task", "bug"]);
const statusSchema = z.enum(["todo", "in_progress", "in_review", "done"]);
const prioritySchema = z.enum(["critical", "high", "medium", "low"]);
const severitySchema = z.enum(["critical", "high", "medium", "low"]);

const baseItemSchema = z.object({
  id: z.string().min(1),
  type: itemTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string(),
  status: statusSchema,
  priority: prioritySchema,
  assigneeId: z.string().nullable(),
  estimatedDays: z.number().min(0),
  dependencies: z.array(z.string()),
  tags: z.array(z.string()),
  parentId: z.string().nullable(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const epicSchema = baseItemSchema.extend({
  type: z.literal("epic"),
  targetDate: z.string().nullable(),
});

const storySchema = baseItemSchema.extend({
  type: z.literal("story"),
  storyPoints: z.number().min(0),
  acceptanceCriteria: z.string(),
});

const taskSchema = baseItemSchema.extend({
  type: z.literal("task"),
});

const bugSchema = baseItemSchema.extend({
  type: z.literal("bug"),
  severity: severitySchema,
  stepsToReproduce: z.string(),
});

export const itemSchema = z.discriminatedUnion("type", [
  epicSchema,
  storySchema,
  taskSchema,
  bugSchema,
]);

export const teamMemberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string(),
  role: z.string(),
  hoursPerDay: z.number().min(0).max(24),
});

export const ganttOverrideSchema = z.object({
  itemId: z.string().min(1),
  startDate: z.string(),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  deadline: z.string().nullable(),
  items: z.array(itemSchema),
  team: z.array(teamMemberSchema),
  overrides: z.array(ganttOverrideSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/validators.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators.ts src/lib/validators.test.ts
git commit -m "feat: add Zod validation schemas for items, team members, and project"
```

---

### Task 5: Zustand Stores

**Files:**
- Create: `src/stores/project-store.ts`, `src/stores/gantt-store.ts`, `src/stores/ui-store.ts`

- [ ] **Step 1: Create the project store**

```typescript
// src/stores/project-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Item, Project, TeamMember, GanttOverride, Status, ItemType } from "@/types";

function now(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
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

function createEmptyProject(): Project {
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

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      project: createEmptyProject(),

      addItem: (itemData) => {
        const id = newId();
        const timestamp = now();
        const items = get().project.items;
        const maxOrder = items
          .filter((i) => i.parentId === (itemData.parentId ?? null))
          .reduce((max, i) => Math.max(max, i.order), -1);

        const item = {
          ...itemData,
          id,
          order: maxOrder + 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        } as Item;

        set((state) => ({
          project: {
            ...state.project,
            items: [...state.project.items, item],
            updatedAt: timestamp,
          },
        }));

        return id;
      },

      updateItem: (id, updates) => {
        const timestamp = now();
        set((state) => ({
          project: {
            ...state.project,
            items: state.project.items.map((item) =>
              item.id === id ? { ...item, ...updates, updatedAt: timestamp } : item
            ),
            updatedAt: timestamp,
          },
        }));
      },

      deleteItem: (id) => {
        const timestamp = now();
        set((state) => ({
          project: {
            ...state.project,
            items: state.project.items
              .filter((item) => item.id !== id && item.parentId !== id)
              .map((item) => ({
                ...item,
                dependencies: item.dependencies.filter((depId) => depId !== id),
              })),
            overrides: state.project.overrides.filter((o) => o.itemId !== id),
            updatedAt: timestamp,
          },
        }));
      },

      moveItem: (id, status) => {
        const timestamp = now();
        set((state) => ({
          project: {
            ...state.project,
            items: state.project.items.map((item) =>
              item.id === id ? { ...item, status, updatedAt: timestamp } : item
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
              item.id === id ? { ...item, order: newOrder, updatedAt: timestamp } : item
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
              item.id === itemId && !item.dependencies.includes(dependsOnId)
                ? { ...item, dependencies: [...item.dependencies, dependsOnId], updatedAt: timestamp }
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
                ? { ...item, dependencies: item.dependencies.filter((d) => d !== dependsOnId), updatedAt: timestamp }
                : item
            ),
            updatedAt: timestamp,
          },
        }));
      },

      addTeamMember: (memberData) => {
        const id = newId();
        const timestamp = now();
        set((state) => ({
          project: {
            ...state.project,
            team: [...state.project.team, { ...memberData, id }],
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
            team: state.project.team.map((m) =>
              m.id === id ? { ...m, ...updates } : m
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
            team: state.project.team.filter((m) => m.id !== id),
            items: state.project.items.map((item) =>
              item.assigneeId === id ? { ...item, assigneeId: null, updatedAt: timestamp } : item
            ),
            updatedAt: timestamp,
          },
        }));
      },

      setOverride: (itemId, startDate) => {
        const timestamp = now();
        set((state) => ({
          project: {
            ...state.project,
            overrides: [
              ...state.project.overrides.filter((o) => o.itemId !== itemId),
              { itemId, startDate },
            ],
            updatedAt: timestamp,
          },
        }));
      },

      removeOverride: (itemId) => {
        const timestamp = now();
        set((state) => ({
          project: {
            ...state.project,
            overrides: state.project.overrides.filter((o) => o.itemId !== itemId),
            updatedAt: timestamp,
          },
        }));
      },

      updateProject: (updates) => {
        const timestamp = now();
        set((state) => ({
          project: { ...state.project, ...updates, updatedAt: timestamp },
        }));
      },

      importProject: (project) => {
        set({ project: { ...project, updatedAt: now() } });
      },

      resetProject: () => {
        set({ project: createEmptyProject() });
      },
    }),
    { name: "iccrea-project" }
  )
);

// Selector hooks
export const useItems = () => useProjectStore((s) => s.project.items);
export const useTeam = () => useProjectStore((s) => s.project.team);
export const useOverrides = () => useProjectStore((s) => s.project.overrides);
export const useItemById = (id: string) =>
  useProjectStore((s) => s.project.items.find((i) => i.id === id));
```

- [ ] **Step 2: Create the gantt store**

```typescript
// src/stores/gantt-store.ts
import { create } from "zustand";
import type { ZoomLevel } from "@/types";

interface GanttState {
  zoomLevel: ZoomLevel;
  scrollPosition: { x: number; y: number };
  selectedItemId: string | null;
  collapsedEpicIds: Set<string>;

  setZoomLevel: (level: ZoomLevel) => void;
  setScrollPosition: (pos: { x: number; y: number }) => void;
  setSelectedItemId: (id: string | null) => void;
  toggleEpicCollapse: (epicId: string) => void;
}

export const useGanttStore = create<GanttState>()((set) => ({
  zoomLevel: "week",
  scrollPosition: { x: 0, y: 0 },
  selectedItemId: null,
  collapsedEpicIds: new Set(),

  setZoomLevel: (level) => set({ zoomLevel: level }),
  setScrollPosition: (pos) => set({ scrollPosition: pos }),
  setSelectedItemId: (id) => set({ selectedItemId: id }),
  toggleEpicCollapse: (epicId) =>
    set((state) => {
      const next = new Set(state.collapsedEpicIds);
      if (next.has(epicId)) next.delete(epicId);
      else next.add(epicId);
      return { collapsedEpicIds: next };
    }),
}));
```

- [ ] **Step 3: Create the UI store**

```typescript
// src/stores/ui-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Theme } from "@/types";

interface UIState {
  theme: Theme;
  sidebarCollapsed: boolean;
  activeModal: string | null;

  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "system",
      sidebarCollapsed: false,
      activeModal: null,

      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      openModal: (modalId) => set({ activeModal: modalId }),
      closeModal: () => set({ activeModal: null }),
    }),
    { name: "iccrea-ui" }
  )
);
```

- [ ] **Step 4: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/stores/
git commit -m "feat: add Zustand stores (project with persist, gantt ephemeral, ui with persist)"
```

---

### Task 6: CSS Variables & Dark Mode Theme

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/components/layout/theme-provider.tsx`

- [ ] **Step 1: Replace globals.css with theme variables**

```css
/* src/app/globals.css */
@import "tailwindcss";

:root {
  --bg-primary: #ffffff;
  --bg-surface: #f8f9fc;
  --bg-elevated: #f1f5f9;
  --border: #dae0eb;
  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --success: #059669;
  --warning: #d97706;
  --danger: #dc2626;
  --purple: #7c3aed;
}

.dark {
  --bg-primary: #0f1117;
  --bg-surface: #1a1d27;
  --bg-elevated: #232733;
  --border: #2e3344;
  --text-primary: #e4e6f0;
  --text-secondary: #8b8fa3;
  --accent: #60a5fa;
  --accent-hover: #3b82f6;
  --success: #34d399;
  --warning: #fbbf24;
  --danger: #f87171;
  --purple: #a78bfa;
}

body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  transition: background-color 200ms ease, color 200ms ease;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--bg-surface);
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}
```

- [ ] **Step 2: Create ThemeProvider component**

```tsx
// src/components/layout/theme-provider.tsx
"use client";

import { useEffect } from "react";
import { useUIStore } from "@/stores/ui-store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;

    function applyTheme(dark: boolean) {
      if (dark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      applyTheme(mq.matches);
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }

    applyTheme(theme === "dark");
  }, [theme]);

  return <>{children}</>;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css src/components/layout/theme-provider.tsx
git commit -m "feat: add CSS theme variables (light/dark) and ThemeProvider component"
```

---

### Task 7: UI Primitives

**Files:**
- Create: `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/modal.tsx`, `src/components/ui/tooltip.tsx`, `src/components/ui/select.tsx`

- [ ] **Step 1: Create Button component**

```tsx
// src/components/ui/button.tsx
"use client";

import { forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] active:scale-[0.98]",
  secondary:
    "bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--border)]",
  ghost:
    "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]",
  danger:
    "bg-[var(--danger)] text-white hover:opacity-90 active:scale-[0.98]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs rounded",
  md: "px-3.5 py-1.5 text-sm rounded-md",
  lg: "px-5 py-2.5 text-base rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", children, ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
);
Button.displayName = "Button";
```

- [ ] **Step 2: Create Input component**

```tsx
// src/components/ui/input.tsx
"use client";

import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[var(--text-secondary)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full px-3 py-1.5 text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-md outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] placeholder:text-[var(--text-secondary)]/50 ${error ? "border-[var(--danger)]" : ""} ${className}`}
          {...props}
        />
        {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
      </div>
    );
  }
);
Input.displayName = "Input";
```

- [ ] **Step 3: Create Select component**

```tsx
// src/components/ui/select.tsx
"use client";

import { forwardRef } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, placeholder, className = "", id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-[var(--text-secondary)]">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`w-full px-3 py-1.5 text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-md outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
);
Select.displayName = "Select";
```

- [ ] **Step 4: Create Badge component**

```tsx
// src/components/ui/badge.tsx
type BadgeVariant = "default" | "success" | "warning" | "danger" | "purple" | "blue";

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
  success: "bg-[var(--success)]/15 text-[var(--success)]",
  warning: "bg-[var(--warning)]/15 text-[var(--warning)]",
  danger: "bg-[var(--danger)]/15 text-[var(--danger)]",
  purple: "bg-[var(--purple)]/15 text-[var(--purple)]",
  blue: "bg-[var(--accent)]/15 text-[var(--accent)]",
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 5: Create Modal component**

```tsx
// src/components/ui/modal.tsx
"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export function Modal({ open, onClose, title, children, width = "max-w-lg" }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => {
            if (e.target === overlayRef.current) onClose();
          }}
        >
          <motion.div
            className={`${width} w-full mx-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-2xl`}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
              <button
                onClick={onClose}
                className="p-1 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 6: Create Tooltip component**

```tsx
// src/components/ui/tooltip.tsx
"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom";
}

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const yOffset = side === "top" ? -4 : 4;

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.div
            className={`absolute z-50 px-2.5 py-1.5 text-xs rounded-md bg-[var(--text-primary)] text-[var(--bg-primary)] shadow-lg whitespace-nowrap pointer-events-none ${
              side === "top" ? "bottom-full mb-1.5 left-1/2 -translate-x-1/2" : "top-full mt-1.5 left-1/2 -translate-x-1/2"
            }`}
            initial={{ opacity: 0, y: yOffset }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: yOffset }}
            transition={{ duration: 0.15 }}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 7: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/
git commit -m "feat: add UI primitives (Button, Input, Select, Badge, Modal, Tooltip)"
```

---

### Task 8: Layout Shell (Sidebar + Navbar)

**Files:**
- Create: `src/components/layout/sidebar.tsx`, `src/components/layout/navbar.tsx`, `src/components/layout/theme-toggle.tsx`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Create ThemeToggle component**

```tsx
// src/components/layout/theme-toggle.tsx
"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import type { Theme } from "@/types";

const icons: Record<Theme, React.ReactNode> = {
  light: <Sun size={16} />,
  dark: <Moon size={16} />,
  system: <Monitor size={16} />,
};

const next: Record<Theme, Theme> = {
  light: "dark",
  dark: "system",
  system: "light",
};

export function ThemeToggle() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <button
      onClick={() => setTheme(next[theme])}
      className="p-2 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
      title={`Theme: ${theme}`}
      aria-label={`Switch theme, current: ${theme}`}
    >
      {icons[theme]}
    </button>
  );
}
```

- [ ] **Step 2: Create Sidebar component**

```tsx
// src/components/layout/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, GanttChart, Users, Settings, PanelLeftClose, PanelLeft } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { motion } from "framer-motion";

const navItems = [
  { href: "/board", label: "Board", icon: LayoutDashboard },
  { href: "/gantt", label: "Gantt", icon: GanttChart },
  { href: "/workload", label: "Workload", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <motion.aside
      className="fixed left-0 top-0 h-screen bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col z-40"
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.2 }}
    >
      {/* Logo area */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-[var(--border)]">
        {!collapsed && (
          <span className="text-sm font-bold text-[var(--text-primary)] truncate">
            ICCREA Planner
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                active
                  ? "bg-[var(--accent)]/10 text-[var(--accent)] border-l-2 border-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              }`}
              title={collapsed ? label : undefined}
            >
              <Icon size={18} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>
    </motion.aside>
  );
}
```

- [ ] **Step 3: Create Navbar component**

```tsx
// src/components/layout/navbar.tsx
"use client";

import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { useUIStore } from "@/stores/ui-store";
import { useProjectStore } from "@/stores/project-store";

const pageTitles: Record<string, string> = {
  "/board": "Kanban Board",
  "/gantt": "Gantt Chart",
  "/workload": "Workload",
  "/settings": "Settings",
};

export function Navbar() {
  const pathname = usePathname();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const projectName = useProjectStore((s) => s.project.name);

  const pageTitle = pageTitles[pathname] || "Dashboard";

  return (
    <header
      className="fixed top-0 right-0 h-14 bg-[var(--bg-surface)]/80 backdrop-blur-md border-b border-[var(--border)] flex items-center justify-between px-6 z-30 transition-all duration-200"
      style={{ left: collapsed ? 64 : 240 }}
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[var(--text-secondary)]">{projectName}</span>
        <span className="text-[var(--text-secondary)]">/</span>
        <span className="font-medium text-[var(--text-primary)]">{pageTitle}</span>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Update root layout**

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ICCREA Planner",
  description: "Project planning tool with Kanban, Gantt, and workload management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <Sidebar />
          <Navbar />
          <MainContent>{children}</MainContent>
        </ThemeProvider>
      </body>
    </html>
  );
}

function MainContent({ children }: { children: React.ReactNode }) {
  return (
    <main className="pt-14 transition-all duration-200" id="main-content">
      {children}
    </main>
  );
}
```

Note: The `MainContent` needs the sidebar width offset. Since we can't use hooks in a server component, we'll handle this with a client wrapper. See Step 5.

- [ ] **Step 5: Create client layout wrapper for sidebar offset**

```tsx
// src/components/layout/main-content.tsx
"use client";

import { useUIStore } from "@/stores/ui-store";

export function MainContent({ children }: { children: React.ReactNode }) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);

  return (
    <main
      className="pt-14 min-h-screen transition-all duration-200"
      style={{ marginLeft: collapsed ? 64 : 240 }}
    >
      {children}
    </main>
  );
}
```

Update `layout.tsx` to import this instead of the inline `MainContent`.

- [ ] **Step 6: Create home page (redirect to /board)**

```tsx
// src/app/page.tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/board");
}
```

- [ ] **Step 7: Create placeholder pages**

```tsx
// src/app/board/page.tsx
export default function BoardPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Kanban Board</h1>
      <p className="mt-2 text-[var(--text-secondary)]">Board view coming soon.</p>
    </div>
  );
}
```

```tsx
// src/app/gantt/page.tsx
export default function GanttPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Gantt Chart</h1>
      <p className="mt-2 text-[var(--text-secondary)]">Gantt view coming soon.</p>
    </div>
  );
}
```

```tsx
// src/app/workload/page.tsx
export default function WorkloadPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Workload</h1>
      <p className="mt-2 text-[var(--text-secondary)]">Workload view coming soon.</p>
    </div>
  );
}
```

```tsx
// src/app/settings/page.tsx
export default function SettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Settings</h1>
      <p className="mt-2 text-[var(--text-secondary)]">Settings view coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 8: Verify the app builds and runs**

```bash
npm run build
npm run dev  # manual check: sidebar, navbar, navigation, dark mode
```

- [ ] **Step 9: Commit**

```bash
git add src/components/layout/ src/app/
git commit -m "feat: add layout shell (Sidebar, Navbar, ThemeToggle) with routing and dark mode"
```

---

### Task 9: Seed Data

**Files:**
- Create: `src/lib/seed-data.ts`

- [ ] **Step 1: Create seed data function**

Create a function that populates the store with a sample ICCREA project — 2 epics, 4 stories, 8 tasks, 2 bugs, 3 team members, and some dependencies. This is for development and demo purposes.

The function should call `useProjectStore.getState().importProject(sampleProject)` with a pre-built `Project` object.

Include realistic item titles related to an AI/ML project planning scenario.

- [ ] **Step 2: Add a "Load Sample Data" button to the Settings page**

Place it in the settings page alongside the future import/export controls. It calls `loadSeedData()` and shows a confirmation.

- [ ] **Step 3: Commit**

```bash
git add src/lib/seed-data.ts src/app/settings/page.tsx
git commit -m "feat: add seed data generator for development and demo"
```

---

## Phase 2: Item Management + Kanban Board

### Task 10: Item CRUD in Store — Form Infrastructure

**Files:**
- Create: `src/components/items/item-form.tsx`, `src/components/items/item-detail-drawer.tsx`

- [ ] **Step 1: Create ItemForm component**

A form with fields that adapt to `ItemType`:
- Common: title, description (textarea), status (select), priority (select), assignee (select from team), estimatedDays (number), tags (comma-separated input)
- Epic: targetDate (date input)
- Story: storyPoints (number), acceptanceCriteria (textarea)
- Bug: severity (select), stepsToReproduce (textarea)

Use controlled inputs bound to local state. On submit, call the store's `addItem` or `updateItem`.

- [ ] **Step 2: Create ItemDetailDrawer component**

A slide-in panel (480px from right) with:
- Header: item type icon + title (editable inline)
- Body: ItemForm pre-filled with current item
- Footer: Delete button with confirmation
- Close on Escape key or clicking overlay
- Use Framer Motion for slide animation

```tsx
// Skeleton structure:
"use client";
import { motion, AnimatePresence } from "framer-motion";

export function ItemDetailDrawer({ itemId, onClose }: { itemId: string | null; onClose: () => void }) {
  // Fetch item from store via useItemById
  // Render slide-in panel with ItemForm
}
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/items/
git commit -m "feat: add ItemForm and ItemDetailDrawer components"
```

---

### Task 11: Kanban Board

**Files:**
- Create: `src/components/board/kanban-board.tsx`, `src/components/board/kanban-column.tsx`, `src/components/board/kanban-card.tsx`
- Modify: `src/app/board/page.tsx`

- [ ] **Step 1: Create KanbanCard component**

A draggable card showing:
- Left color strip by item type (epic=purple, story=blue, task=green, bug=red)
- Title (truncated)
- Bottom row: priority badge, assignee avatar (initials + color), story points (if story)
- Hover: translateY(-2px) + shadow elevation
- Click: opens ItemDetailDrawer

Use `@dnd-kit/sortable` `useSortable` hook.

- [ ] **Step 2: Create KanbanColumn component**

A column for one status:
- Header: status label + item count + story point sum
- Body: list of KanbanCards wrapped in `SortableContext`
- Footer: quick-add input (text + Enter to create task)
- Drop zone highlighting when dragging over

- [ ] **Step 3: Create KanbanBoard component**

The main board container:
- `DndContext` wrapping all columns
- 4 columns: To Do, In Progress, In Review, Done
- `onDragEnd`: determine if card moved between columns (→ `moveItem`) or within column (→ `reorderItem`)
- Filter bar at top: dropdowns for Epic, Assignee, Type, Priority
- Swimlane toggle (group by Epic or flat)

Key `@dnd-kit` setup:
```tsx
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
```

- [ ] **Step 4: Wire up the board page**

```tsx
// src/app/board/page.tsx
"use client";
import { KanbanBoard } from "@/components/board/kanban-board";

export default function BoardPage() {
  return <KanbanBoard />;
}
```

- [ ] **Step 5: Test manually with seed data**

Load seed data → verify cards appear in correct columns → drag between columns → verify status changes in store.

```bash
npm run dev
```

- [ ] **Step 6: Commit**

```bash
git add src/components/board/ src/app/board/page.tsx
git commit -m "feat: add Kanban board with drag-and-drop, filters, and quick-add"
```

---

### Task 12: Kanban Animations & Polish

**Files:**
- Modify: `src/components/board/kanban-card.tsx`, `src/components/board/kanban-column.tsx`

- [ ] **Step 1: Add Framer Motion layout animations**

- `KanbanCard`: wrap in `motion.div` with `layoutId={item.id}` for smooth animations when cards move
- Hover: `whileHover={{ y: -2 }}` with spring
- Drag overlay: semi-transparent card clone with extended shadow

- [ ] **Step 2: Add column drop zone visual feedback**

- Active drop zone: subtle accent border + slight background tint
- Card placeholder line showing insertion point

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/board/
git commit -m "feat: add Kanban animations (layout, hover lift, drag overlay)"
```

---

## Phase 3: Gantt Core

### Task 13: Scheduling Engine (TDD)

**Files:**
- Create: `src/lib/scheduler.ts`, `src/lib/scheduler.test.ts`

- [ ] **Step 1: Write failing tests for forward scheduling**

```typescript
// src/lib/scheduler.test.ts
import { describe, it, expect } from "vitest";
import { scheduleForward } from "./scheduler";
import type { Item, GanttOverride } from "@/types";

function makeTask(overrides: Partial<Item> & { id: string }): Item {
  return {
    type: "task",
    title: "Task",
    description: "",
    status: "todo",
    priority: "medium",
    assigneeId: null,
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

  it("schedules a single item starting today", () => {
    const items = [makeTask({ id: "a", estimatedDays: 3 })];
    const result = scheduleForward(items, [], today);
    expect(result[0].startDate).toBe("2026-03-30");
    expect(result[0].endDate).toBe("2026-04-01"); // Wednesday (3 business days from Mon)
  });

  it("schedules dependent item after predecessor", () => {
    const items = [
      makeTask({ id: "a", estimatedDays: 2 }),
      makeTask({ id: "b", estimatedDays: 1, dependencies: ["a"] }),
    ];
    const result = scheduleForward(items, [], today);
    const b = result.find((r) => r.itemId === "b")!;
    expect(b.startDate).toBe("2026-04-01"); // Wednesday (after A ends Tuesday)
  });

  it("respects manual override", () => {
    const items = [makeTask({ id: "a", estimatedDays: 2 })];
    const overrides: GanttOverride[] = [{ itemId: "a", startDate: "2026-04-06" }]; // Next Monday
    const result = scheduleForward(items, overrides, today);
    expect(result[0].startDate).toBe("2026-04-06");
  });

  it("uses max of override and dependency end", () => {
    const items = [
      makeTask({ id: "a", estimatedDays: 5 }), // Mon-Fri
      makeTask({ id: "b", estimatedDays: 1, dependencies: ["a"] }),
    ];
    const overrides: GanttOverride[] = [{ itemId: "b", startDate: "2026-03-31" }]; // Tuesday (before A ends)
    const result = scheduleForward(items, overrides, today);
    const b = result.find((r) => r.itemId === "b")!;
    // A ends Friday 04-03, so B must start Monday 04-06 (override is earlier, dep wins)
    expect(b.startDate).toBe("2026-04-06");
  });

  it("done items have zero duration", () => {
    const items = [makeTask({ id: "a", estimatedDays: 5, status: "done" })];
    const result = scheduleForward(items, [], today);
    expect(result[0].startDate).toBe(today);
    expect(result[0].endDate).toBe(today);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/scheduler.test.ts
```

- [ ] **Step 3: Implement forward scheduling**

```typescript
// src/lib/scheduler.ts
import type { Item, GanttOverride, ScheduledItem } from "@/types";
import { addBusinessDays, parseDate, formatDate } from "./date-utils";

export function scheduleForward(
  items: Item[],
  overrides: GanttOverride[],
  todayStr: string
): ScheduledItem[] {
  const today = parseDate(todayStr);
  const overrideMap = new Map(overrides.map((o) => [o.itemId, o.startDate]));
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const results = new Map<string, ScheduledItem>();

  // Topological sort
  const sorted = topologicalSort(items);

  for (const item of sorted) {
    if (item.status === "done") {
      results.set(item.id, {
        itemId: item.id,
        startDate: todayStr,
        endDate: todayStr,
        earlyStart: todayStr,
        earlyFinish: todayStr,
        lateStart: todayStr,
        lateFinish: todayStr,
        slack: 0,
        isCritical: false,
      });
      continue;
    }

    // Compute earliest start from dependencies
    let earliestStart = today;

    for (const depId of item.dependencies) {
      const dep = results.get(depId);
      if (dep) {
        const depEnd = parseDate(dep.endDate);
        const nextDay = addBusinessDays(depEnd, 2); // day after dep ends
        if (nextDay > earliestStart) {
          earliestStart = nextDay;
        }
      }
    }

    // Consider override
    const override = overrideMap.get(item.id);
    if (override) {
      const overrideDate = parseDate(override);
      if (overrideDate > earliestStart) {
        earliestStart = overrideDate;
      }
    }

    const startDate = earliestStart;
    const endDate = item.estimatedDays <= 0
      ? startDate
      : addBusinessDays(startDate, item.estimatedDays);

    const startStr = formatDate(startDate);
    const endStr = formatDate(endDate);

    results.set(item.id, {
      itemId: item.id,
      startDate: startStr,
      endDate: endStr,
      earlyStart: startStr,
      earlyFinish: endStr,
      lateStart: startStr,
      lateFinish: endStr,
      slack: 0,
      isCritical: false,
    });
  }

  return Array.from(results.values());
}

function topologicalSort(items: Item[]): Item[] {
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const visited = new Set<string>();
  const sorted: Item[] = [];

  function visit(item: Item) {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    for (const depId of item.dependencies) {
      const dep = itemMap.get(depId);
      if (dep) visit(dep);
    }
    sorted.push(item);
  }

  for (const item of items) {
    visit(item);
  }

  return sorted;
}
```

Note: The `addBusinessDays` with `2` to get "next business day after end" needs careful attention to the test expectations. Adjust the scheduling arithmetic so that if A is 2 days starting Monday, it ends Tuesday, and B starts Wednesday. Verify against tests and fix arithmetic as needed.

- [ ] **Step 4: Run tests and iterate until they pass**

```bash
npm test -- src/lib/scheduler.test.ts
```

Fix any off-by-one issues in business day arithmetic. The key contract is:
- `estimatedDays: N` means the item occupies N business days
- A 2-day item starting Monday occupies Mon+Tue, ending Tuesday
- The successor starts on Wednesday (next business day)

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduler.ts src/lib/scheduler.test.ts
git commit -m "feat: add forward scheduling engine with topological sort and override support"
```

---

### Task 14: Gantt Chart Layout

**Files:**
- Create: `src/components/gantt/gantt-chart.tsx`, `src/components/gantt/gantt-controls.tsx`, `src/components/gantt/gantt-task-list.tsx`, `src/components/gantt/gantt-timeline.tsx`, `src/components/gantt/gantt-body.tsx`
- Modify: `src/app/gantt/page.tsx`

- [ ] **Step 1: Create GanttControls (zoom toggle, filters)**

Toolbar with:
- Zoom level buttons: Day / Week / Month
- Filter dropdowns: Epic, Assignee, Status
- Export dropdown (placeholder for Phase 6)

- [ ] **Step 2: Create GanttTimeline (column headers)**

Renders the date columns at the top of the chart area:
- Day zoom: one column per business day, shows "Mon 30" format
- Week zoom: one column per week, shows "W14 (Mar 30 - Apr 3)"
- Month zoom: one column per month, shows "March 2026"

Column width constants:
- Day: 40px
- Week: 140px
- Month: 200px

Compute visible date range from earliest item start to latest item end + buffer.

- [ ] **Step 3: Create GanttTaskList (left panel)**

370px wide, sticky left panel:
- Each row: item type icon, title (truncated), status dot, assignee dropdown, days badge
- Indent by hierarchy level (epic → story → task/bug)
- Collapsible epics (click chevron)

- [ ] **Step 4: Create GanttBody (bars + grid)**

The main chart area:
- Background grid: alternating row backgrounds, vertical column lines
- Weekend columns: darker background
- For each scheduled item: render a GanttBar (horizontal bar) positioned by start/end dates
- Today line: vertical blue dashed line
- Deadline line: vertical red dashed line (if project.deadline set)

Use `useMemo` to call `scheduleForward()` with current items and overrides.

- [ ] **Step 5: Create GanttChart container**

Split layout: `GanttTaskList` (left, sticky) + `GanttTimeline` + `GanttBody` (right, scrollable).
Synchronized vertical scroll between task list and body.

```tsx
// Skeleton:
export function GanttChart() {
  const items = useItems();
  const overrides = useOverrides();
  const today = formatDate(new Date());

  const scheduled = useMemo(
    () => scheduleForward(items, overrides, today),
    [items, overrides, today]
  );

  return (
    <div className="flex h-full">
      <GanttTaskList items={items} scheduled={scheduled} />
      <div className="flex-1 overflow-auto">
        <GanttTimeline ... />
        <GanttBody items={items} scheduled={scheduled} ... />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire up the gantt page**

```tsx
// src/app/gantt/page.tsx
"use client";
import { GanttChart } from "@/components/gantt/gantt-chart";
import { GanttControls } from "@/components/gantt/gantt-controls";

export default function GanttPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <GanttControls />
      <GanttChart />
    </div>
  );
}
```

- [ ] **Step 7: Verify build and manual test**

```bash
npm run build
npm run dev  # Load seed data → navigate to /gantt → verify layout
```

- [ ] **Step 8: Commit**

```bash
git add src/components/gantt/ src/app/gantt/page.tsx
git commit -m "feat: add Gantt chart layout (task list, timeline, body with scheduled bars)"
```

---

### Task 15: Gantt Bar (Interactive)

**Files:**
- Create: `src/components/gantt/gantt-bar.tsx`, `src/components/gantt/gantt-row.tsx`, `src/components/gantt/gantt-tooltip.tsx`

- [ ] **Step 1: Create GanttBar component**

A horizontal bar representing a scheduled item:
- Width: proportional to duration (endDate - startDate in calendar days × column width)
- Left offset: startDate distance from chart origin × column width
- Color: team member color (or item type color if unassigned)
- Label: item title (truncated to fit)
- Left edge: rounded, shows type indicator
- Right edge: circular connector for creating dependencies

Interactions:
- Horizontal drag: updates `GanttOverride` (manual start date). Use `onPointerDown` + `onPointerMove` for smooth drag.
- Right edge resize: updates `estimatedDays`. Track delta in pixels → convert to days.
- Click: selects item (opens detail drawer)

- [ ] **Step 2: Create GanttRow component**

A row in the chart body:
- Background: alternates between transparent and `bg-elevated/30`
- Contains one GanttBar positioned absolutely
- Height: 40px

- [ ] **Step 3: Create GanttTooltip component**

Shows on bar hover (150ms delay):
- Item title, type badge
- Start date → End date
- Duration: N days
- Status, Assignee
- Slack: N days (if computed)

Positioned above the cursor, follows mouse horizontally.

- [ ] **Step 4: Verify interactions work**

```bash
npm run dev
```
Manual test: hover bars for tooltip, drag bar horizontally, resize from right edge, click to select.

- [ ] **Step 5: Commit**

```bash
git add src/components/gantt/
git commit -m "feat: add interactive Gantt bars (drag to move, resize duration, hover tooltip)"
```

---

## Phase 4: Critical Path + Dependencies

### Task 16: Critical Path Algorithm (TDD)

**Files:**
- Create: `src/lib/critical-path.ts`, `src/lib/critical-path.test.ts`

- [ ] **Step 1: Write failing tests for CPM**

```typescript
// src/lib/critical-path.test.ts
import { describe, it, expect } from "vitest";
import { computeCriticalPath, hasCycle } from "./critical-path";
import type { Item, ScheduledItem } from "@/types";

// Test helpers to create items...

describe("computeCriticalPath", () => {
  it("identifies single-chain as critical path", () => {
    // A(3d) → B(2d) → C(1d), all sequential
    // All should be critical (slack = 0)
  });

  it("identifies parallel paths with different lengths", () => {
    // A(3d) → C(1d)
    // B(5d) → C(1d)
    // B→C is critical (longer), A has slack
  });

  it("computes correct slack values", () => {
    // Verify slack = lateStart - earlyStart
  });
});

describe("hasCycle", () => {
  it("returns false for DAG", () => {
    // A → B → C
    expect(hasCycle(items, "c", "a")).toBe(false); // adding A→C is fine
  });

  it("returns true for cycle", () => {
    // A → B → C, check adding C → A
    expect(hasCycle(items, "a", "c")).toBe(true); // C→A creates cycle
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement CPM and cycle detection**

```typescript
// src/lib/critical-path.ts
import type { Item, ScheduledItem } from "@/types";
import { parseDate, businessDaysBetween } from "./date-utils";

export function computeCriticalPath(
  items: Item[],
  scheduled: ScheduledItem[],
  deadlineStr: string | null
): ScheduledItem[] {
  // 1. Build scheduled map
  // 2. Forward pass already done by scheduler (earlyStart, earlyFinish)
  // 3. Backward pass: compute lateFinish, lateStart
  //    - Terminal nodes: lateFinish = deadline || max(earlyFinish)
  //    - Walk backwards: lateFinish = min(lateStart of successors)
  //    - lateStart = lateFinish - duration
  // 4. Slack = lateStart - earlyStart (in business days)
  // 5. isCritical = slack === 0
  // Return updated ScheduledItems
}

export function hasCycle(items: Item[], fromId: string, toId: string): boolean {
  // DFS from toId following dependencies
  // If we reach fromId → cycle exists
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const visited = new Set<string>();

  function dfs(current: string): boolean {
    if (current === fromId) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    const item = itemMap.get(current);
    if (!item) return false;
    return item.dependencies.some((depId) => dfs(depId));
  }

  return dfs(toId);
}
```

- [ ] **Step 4: Run tests and iterate**

```bash
npm test -- src/lib/critical-path.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/critical-path.ts src/lib/critical-path.test.ts
git commit -m "feat: add Critical Path Method algorithm with cycle detection"
```

---

### Task 17: Dependency Arrows (SVG)

**Files:**
- Create: `src/components/gantt/dependency-arrows.tsx`

- [ ] **Step 1: Implement SVG arrow rendering**

An absolutely positioned SVG overlay covering the entire chart body:
- For each dependency edge: draw a cubic Bézier from the right edge of the predecessor bar to the left edge of the successor bar
- Control points: horizontal-first tangents for smooth S-curves
- Critical path edges: solid purple, 2px stroke
- Non-critical edges: dashed gray, 1px stroke
- Arrow head: small triangle at the endpoint

```tsx
// Key math for Bézier curves:
function computeArrowPath(fromX: number, fromY: number, toX: number, toY: number): string {
  const midX = (fromX + toX) / 2;
  return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
}
```

- [ ] **Step 2: Add click handler on arrows for deletion**

Click on a path → highlight it → show confirmation popover → on confirm, call `removeDependency`.

- [ ] **Step 3: Add dependency creation via drag**

Circular connector on bar's right edge:
- `onPointerDown` on connector starts drag mode
- Show a temporary line from connector to cursor
- `onPointerUp` on another bar's left edge → call `addDependency` (with cycle check first)
- If cycle detected → show error toast

- [ ] **Step 4: Integrate CPM visual highlighting**

In `GanttBar` and `GanttRow`:
- If `isCritical`: purple border on bar, purple glow shadow, tinted row background
- Slack badge on non-critical items

- [ ] **Step 5: Commit**

```bash
git add src/components/gantt/dependency-arrows.tsx src/components/gantt/gantt-bar.tsx src/components/gantt/gantt-row.tsx
git commit -m "feat: add SVG dependency arrows (Bézier curves) and critical path highlighting"
```

---

## Phase 5: Workload + Team

### Task 18: Workload Calculator (TDD)

**Files:**
- Create: `src/lib/workload.ts`, `src/lib/workload.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/workload.test.ts
import { describe, it, expect } from "vitest";
import { computeWorkload } from "./workload";

describe("computeWorkload", () => {
  it("calculates daily hours for a single assignment", () => {
    // Item: 2 days, assigned to member with 8h/day
    // Result: member has 8h on day1, 8h on day2
  });

  it("sums hours when multiple items overlap", () => {
    // Two items on same day for same person → 16h
  });

  it("flags overallocation (>100%)", () => {
    // Member with 8h/day has 10h assigned → overallocated
  });
});
```

- [ ] **Step 2: Implement workload calculator**

```typescript
// src/lib/workload.ts
import type { Item, TeamMember, ScheduledItem } from "@/types";

export interface WorkloadDay {
  date: string;
  memberId: string;
  totalHours: number;
  capacity: number;
  utilization: number; // totalHours / capacity
  items: string[]; // contributing item IDs
}

export function computeWorkload(
  items: Item[],
  scheduled: ScheduledItem[],
  team: TeamMember[],
  startDate: string,
  endDate: string
): WorkloadDay[] {
  // For each team member, for each business day in range:
  // Sum up hours from assigned items that overlap that day
  // hours per item per day = member.hoursPerDay / item.estimatedDays
  // (simplified: assume even distribution across item duration)
}
```

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git add src/lib/workload.ts src/lib/workload.test.ts
git commit -m "feat: add workload calculator with daily hour aggregation"
```

---

### Task 19: Team Management Page

**Files:**
- Create: `src/components/settings/team-manager.tsx`, `src/components/settings/project-settings.tsx`, `src/components/settings/data-manager.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Create ProjectSettings section**

Form with:
- Project name (text input)
- Project deadline (date input, nullable)
- Auto-saves on change via `updateProject`

- [ ] **Step 2: Create TeamManager section**

- List of team members as cards (name, role, color swatch, hours/day)
- "Add Member" button → inline form or modal
- Edit: click member card → editable fields
- Delete: button with confirmation
- Color picker: a set of preset colors to choose from

- [ ] **Step 3: Create DataManager section**

- Export JSON button
- Import JSON: file input + validate with Zod
- Load Sample Data button (calls seed data)
- Reset Project: danger button with confirmation modal

- [ ] **Step 4: Wire up Settings page**

```tsx
// src/app/settings/page.tsx
"use client";
import { ProjectSettings } from "@/components/settings/project-settings";
import { TeamManager } from "@/components/settings/team-manager";
import { DataManager } from "@/components/settings/data-manager";

export default function SettingsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <ProjectSettings />
      <TeamManager />
      <DataManager />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/ src/app/settings/page.tsx
git commit -m "feat: add Settings page (project config, team management, data import/export)"
```

---

### Task 20: Workload View

**Files:**
- Create: `src/components/workload/workload-grid.tsx`, `src/components/workload/workload-cell.tsx`, `src/components/workload/workload-drilldown.tsx`
- Modify: `src/app/workload/page.tsx`

- [ ] **Step 1: Create WorkloadGrid component**

Grid layout:
- Rows: one per team member (name + avatar on left)
- Columns: one per business day in the visible range
- Each cell: WorkloadCell with hours and color coding

- [ ] **Step 2: Create WorkloadCell component**

- Color: green (<80% utilization), yellow (80-100%), red (>100%)
- Shows hour count
- Click: opens WorkloadDrilldown modal

- [ ] **Step 3: Create WorkloadDrilldown modal**

Shows which items contribute to that cell's hours:
- Item title, type, estimated days, hours contributed
- Link to open item in detail drawer

- [ ] **Step 4: Wire up workload page**

- [ ] **Step 5: Commit**

```bash
git add src/components/workload/ src/app/workload/page.tsx
git commit -m "feat: add Workload view with per-person daily capacity heatmap"
```

---

## Phase 6: Export + Polish

### Task 21: JSON Export/Import

**Files:**
- Create: `src/lib/export.ts`

- [ ] **Step 1: Implement JSON export**

```typescript
export function exportJSON(project: Project): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Implement JSON import with Zod validation**

```typescript
export async function importJSON(file: File): Promise<Project> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  return projectSchema.parse(parsed);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/export.ts
git commit -m "feat: add JSON export/import with Zod validation"
```

---

### Task 22: PNG/PDF Export

**Files:**
- Modify: `src/lib/export.ts`

- [ ] **Step 1: Implement PNG export via Canvas API**

`exportGanttPNG(items, scheduled, team, criticalSet)`:
1. Create offscreen `<canvas>` at 2x resolution
2. Draw header row with dates
3. Draw task rows with labels
4. Draw bars colored by assignee
5. Draw dependency arrows (Bézier on canvas)
6. Draw TODAY line (blue), DEADLINE line (red)
7. Draw legend
8. Always use light theme colors
9. `canvas.toDataURL('image/png')` → trigger download

- [ ] **Step 2: Implement PDF export**

```typescript
export function exportGanttPDF(canvas: HTMLCanvasElement): void {
  const dataUrl = canvas.toDataURL("image/png");
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`
    <html><head><style>
      @page { size: landscape; margin: 0; }
      body { margin: 0; }
      img { width: 100vw; height: auto; }
    </style></head>
    <body><img src="${dataUrl}" onload="window.print()"/></body></html>
  `);
}
```

- [ ] **Step 3: Wire export buttons in GanttControls and Navbar**

- [ ] **Step 4: Commit**

```bash
git add src/lib/export.ts src/components/gantt/gantt-controls.tsx src/components/layout/navbar.tsx
git commit -m "feat: add PNG and PDF export via Canvas API"
```

---

### Task 23: Performance & Accessibility

**Files:**
- Modify: `src/components/gantt/gantt-body.tsx` (virtualization)

- [ ] **Step 1: Add row virtualization for Gantt**

Use `react-window` `FixedSizeList` for the task list and chart body when items > 50:
```tsx
import { FixedSizeList } from "react-window";

// Wrap GanttBody rows in FixedSizeList
// Row height: 40px
// Only render visible rows + buffer
```

- [ ] **Step 2: Add keyboard navigation**

- Arrow keys navigate between items
- Enter opens detail drawer
- Escape closes drawers/modals
- Tab navigation for all interactive elements

- [ ] **Step 3: Add ARIA labels**

- Kanban columns: `role="list"`, cards: `role="listitem"`
- Gantt bars: `aria-label` with item name and dates
- Modals: `role="dialog"`, `aria-modal="true"`
- Status badges: `aria-label` with full status text

- [ ] **Step 4: Final verification**

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Gantt row virtualization, keyboard navigation, and ARIA labels"
```

---

### Task 24: CI/CD Configuration

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create GitHub Actions workflow**

```yaml
name: CI
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Create vercel.json (minimal)**

```json
{}
```

No special config needed — Vercel auto-detects Next.js.

- [ ] **Step 3: Commit**

```bash
git add .github/ vercel.json
git commit -m "ci: add GitHub Actions workflow for lint, typecheck, test, build"
```

---

## Execution Summary

| Phase | Tasks | Key Deliverable |
|-------|-------|-----------------|
| 1: Foundation | Tasks 1-9 | Shell app with dark mode, stores, UI primitives |
| 2: Kanban | Tasks 10-12 | Working board with drag-and-drop |
| 3: Gantt Core | Tasks 13-15 | Interactive Gantt with scheduling |
| 4: CPM + Deps | Tasks 16-17 | Critical path and dependency arrows |
| 5: Workload | Tasks 18-20 | Team management and workload heatmap |
| 6: Polish | Tasks 21-24 | Export, performance, a11y, CI |
