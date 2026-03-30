# Architecture — Cadence

## Overview

Cadence is a client-side project planning tool that combines a Kanban board for daily backlog management with an interactive Gantt chart featuring Critical Path Method (CPM) analysis. It targets small teams (3-5 people) and stores all data in localStorage via Zustand.

## Data Model

### Item hierarchy

```
Epic (root container)
└── Story (user story with acceptance criteria)
    ├── Task (unit of work)
    └── Bug (defect with severity)
```

### BaseItem (shared fields)

| Field           | Type              | Notes                                     |
|-----------------|-------------------|-------------------------------------------|
| id              | string            | UUID v4, generated client-side             |
| type            | ItemType          | `'epic' \| 'story' \| 'task' \| 'bug'`    |
| title           | string            | Required, max 200 chars                    |
| description     | string            | Markdown                                   |
| status          | Status            | `'todo' \| 'in_progress' \| 'in_review' \| 'done'` |
| priority        | Priority          | `'critical' \| 'high' \| 'medium' \| 'low'` |
| assigneeId      | string \| null    | References TeamMember.id                   |
| estimatedDays   | number            | Decimal (0.5 = half day)                   |
| dependencies    | string[]          | Item IDs of predecessors                   |
| parentId        | string \| null    | Epic ID for stories, Story ID for tasks/bugs |
| tags            | string[]          | Freeform categorization                    |
| order           | number            | Sort order within column/parent            |
| createdAt       | string            | ISO 8601                                   |
| updatedAt       | string            | ISO 8601                                   |

### Type-specific fields

- **Epic**: `targetDate: string | null`
- **Story**: `storyPoints: number`, `acceptanceCriteria: string`
- **Task**: (no extra fields)
- **Bug**: `severity: Severity`, `stepsToReproduce: string`

### TeamMember

| Field       | Type   | Notes                          |
|-------------|--------|--------------------------------|
| id          | string | UUID v4                        |
| name        | string | Display name                   |
| color       | string | Hex color for Gantt bars/cards |
| role        | string | Freeform (e.g., "AI Engineer") |
| hoursPerDay | number | Default 8, used for workload   |

### GanttOverride

| Field     | Type   | Notes                         |
|-----------|--------|-------------------------------|
| itemId    | string | References BaseItem.id        |
| startDate | string | ISO 8601, manual start date   |

### Project (root object in localStorage)

```typescript
interface Project {
  id: string;
  name: string;
  deadline: string | null;
  items: Item[];
  team: TeamMember[];
  overrides: GanttOverride[];
  createdAt: string;
  updatedAt: string;
}
```

## State Architecture

Three Zustand stores with clear separation of concerns:

### projectStore (persisted → `cadence-project`)
- `project: Project` — the entire project state
- CRUD actions for items, team members, overrides
- Every mutation auto-updates `updatedAt`
- Dependency validation (cycle detection via DFS) before `addDependency`
- Selector hooks: `useItems()`, `useTeam()`, `useItemById(id)`, etc.

### ganttStore (ephemeral — not persisted)
- `zoomLevel: 'day' | 'week' | 'month'`
- `scrollPosition: { x: number, y: number }`
- `selectedItemId: string | null`
- `collapsedEpicIds: Set<string>`

### uiStore (persisted → `cadence-ui`)
- `theme: 'light' | 'dark' | 'system'`
- `sidebarCollapsed: boolean`
- `activeModal: string | null`

## Scheduling Engine (`lib/scheduler.ts`)

### Forward scheduling (default)

Given TODAY and a list of items with dependencies:

1. Items with `status === 'done'` → `start = end = TODAY` (zero residual)
2. Items with no predecessors → `start = max(TODAY, overrideDate)`
3. Items with predecessors → `start = max(end of all predecessors) + 1 business day`
4. `end = addBusinessDays(start, estimatedDays)`

Override handling: if a `GanttOverride` exists for an item, use `max(overrideDate, computed start from deps)`.

### Backward scheduling

Given a deadline:
1. Compute `lateFinish` for the terminal node = deadline
2. Walk backwards: `lateStart = lateFinish - estimatedDays`
3. For each predecessor: `lateFinish = min(lateStart of all successors)`
4. `slack = lateStart - earlyStart`

### Business days

All scheduling operates on business days (Mon-Fri). Helper functions in `lib/date-utils.ts`:
- `addBusinessDays(date, n)` — skip weekends
- `businessDaysBetween(a, b)` — count business days in range
- `isBusinessDay(date)` — true if Mon-Fri

## Critical Path Algorithm (`lib/critical-path.ts`)

Standard CPM on a DAG:

1. **Topological sort** of the dependency graph
2. **Forward pass**: compute Early Start (ES) and Early Finish (EF)
3. **Backward pass**: compute Late Start (LS) and Late Finish (LF)
4. **Slack** = LS - ES for each item
5. **Critical path** = all items where slack === 0

Complexity: O(V + E). Recalculated reactively via `useMemo` on every change.

Cycle detection (prerequisite): DFS-based check in `lib/validators.ts`. Must be called before any `addDependency` operation.

## Views

### 1. Kanban Board (`/board`)

- 4 columns: To Do, In Progress, In Review, Done
- Drag & drop cards between columns (changes status) and within columns (reorder)
- Library: @dnd-kit with `SortableContext` per column
- Filters: Epic, Assignee, Type, Priority
- Optional swimlanes by Epic
- Quick-add input at bottom of each column
- Click card → opens ItemDetailDrawer (slide-in from right, 480px)

### 2. Gantt Chart (`/gantt`)

Layout: `[Task list panel (370px)] | [Chart area (scrollable)]`

**Task list panel** (left, sticky):
- Rows: item name, status dot, assignee dropdown, days label
- Drag to reorder rows (@dnd-kit SortableContext, vertical)

**Chart area** (right, horizontally scrollable):
- Column headers: day/week/month depending on zoom level
- Bars: colored by assignee (or by status if unassigned)
- Bar interactions: drag horizontal (move start date), resize right edge (change duration)
- SVG overlay for dependency arrows (cubic Bézier curves)
- Vertical lines: TODAY (blue), DEADLINE (red)
- Critical path: purple border + glow on bars, tinted row background

**Dependency arrow rendering:**
- SVG layer positioned absolutely over the chart body
- For each dependency: cubic Bézier from right edge of predecessor to left edge of successor
- Control points: horizontal-first tangents for smooth S-curves
- Critical edges: solid purple, 2px. Non-critical: dashed gray, 1px
- Arrow creation: drag from circular connector on bar right edge
- Arrow deletion: click arrow → confirmation

**Zoom levels:**
- Day: 1 column = 1 day, shows day number + month
- Week: 1 column = 1 week, shows week number + date range
- Month: 1 column = 1 month, shows month name

### 3. Workload View (`/workload`)

- Grid: rows = team members, columns = days
- Cell value: total allocated hours (sum of items assigned to that person on that day)
- Color coding: green (<80%), yellow (80-100%), red (>100%)
- Click cell → drilldown showing contributing items
- Summary row: total hours per person for selected period

### 4. Settings (`/settings`)

- Project name, deadline
- Team member CRUD (name, color, role, hours/day)
- JSON import/export
- Data reset with confirmation

## Component Architecture

```
App (layout.tsx)
├── ThemeProvider (dark mode context)
├── Sidebar (navigation, collapsed state)
├── Navbar (breadcrumb, search, theme toggle, export menu)
└── PageContent (active view)
    ├── KanbanBoard
    │   ├── DndContext + SortableContext (per column)
    │   ├── KanbanColumn × 4
    │   │   ├── ColumnHeader (title, count, add button)
    │   │   └── KanbanCard × N (draggable)
    │   └── ItemDetailDrawer (slide-in panel)
    ├── GanttChart
    │   ├── GanttControls (zoom, filters, export buttons)
    │   ├── GanttTaskList (left panel, sortable rows)
    │   ├── GanttTimeline (column headers)
    │   ├── GanttBody (bars + grid)
    │   │   ├── GanttRow × N
    │   │   │   └── GanttBar (draggable, resizable)
    │   │   └── DependencyArrows (SVG overlay)
    │   └── GanttTooltip (follows cursor on bar hover)
    ├── WorkloadGrid
    │   ├── WorkloadRow × team members
    │   │   └── WorkloadCell × days
    │   └── WorkloadDrilldown (modal on cell click)
    └── SettingsPage
        ├── ProjectSettings
        ├── TeamManager
        └── DataManager (import/export/reset)
```

## Export System (`lib/export.ts`)

### JSON
- `exportJSON()`: serializes `Project` to JSON, triggers file download
- `importJSON(file)`: parses file, validates with Zod schema, replaces project store

### PNG (Canvas API — no external dependencies)
- `exportGanttPNG(tasks, scheduled, calDays, criticalSet)`:
  1. Create offscreen `<canvas>` at 2x resolution
  2. Draw header, day columns, task rows, bars with labels, dependency arrows (Bézier), today/deadline lines, legend
  3. `canvas.toDataURL('image/png')` → trigger download
- Always renders in light theme for print legibility

### PDF
- Same Canvas rendering as PNG
- Opens new window with `<img>` of canvas data
- Triggers `window.print()` with `@page { size: landscape; margin: 0 }` CSS

## Theming

CSS variables defined in `globals.css`:

```css
:root {
  --bg-primary: #ffffff;
  --bg-surface: #f8f9fc;
  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --border: #dae0eb;
  --accent: #2563eb;
  /* ... */
}

.dark {
  --bg-primary: #0f1117;
  --bg-surface: #1a1d27;
  --text-primary: #e4e6f0;
  --text-secondary: #8b8fa3;
  --border: #2e3344;
  --accent: #60a5fa;
  /* ... */
}
```

Tailwind configured with `darkMode: 'class'`. Theme toggle in uiStore. Default follows `prefers-color-scheme`.

## Performance Considerations

- Gantt row virtualization with `react-window` for >100 items
- SVG arrows: only render visible arrows (intersection with viewport)
- Scheduling/CPM: memoized with `useMemo`, deps = `[items, overrides]`
- Kanban: @dnd-kit uses `MeasuringStrategy.Always` for smooth animations
- Canvas export runs in `requestAnimationFrame` to avoid blocking UI
