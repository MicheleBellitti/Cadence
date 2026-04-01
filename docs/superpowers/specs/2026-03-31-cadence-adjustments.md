# Cadence Adjustments — Design Spec

## Overview

Four changes to the project planning tool:
1. Rename from "ICCREA Planner" to "Cadence"
2. Fix Gantt chart readability (auto-fit zoom, wider columns)
3. Rich item creation (type picker, full fields, add from Gantt)
4. JIRA-style sprint management

---

## 1. Rename to Cadence

Replace "ICCREA Planner" in:
- `src/components/layout/sidebar.tsx` — logo text
- `src/app/layout.tsx` — page title and description metadata
- `CLAUDE.md` — header and all references
- `docs/architecture.md` — header and all references
- `package.json` — name field → `cadence`
- `src/lib/seed-data.ts` — sample project name → "AI Platform"

Rename project directory from `Plato` to `Cadence`.

---

## 2. Gantt Chart Readability

### Problem
Column widths are fixed (day: 40px, week: 140px, month: 200px). Chart doesn't fill the viewport, making bars too compact to read.

### Solution

**Wider minimums:**
- Day: 60px (was 40)
- Week: 180px (was 140)
- Month: 240px (was 200)

**Auto-fit on mount:** Compute column width to fill available viewport width.
```
colWidth = max(MIN_WIDTH, availableWidth / visibleColumnCount)
```

**Fit-to-screen button** in GanttControls toolbar: recalculates column widths to fill viewport.

**Zoom +/- buttons:** Increase/decrease column width by 20% increments, independent of day/week/month toggle.

**Larger rows:** Row height 48px (was 40px), bar height 34px (was 28px).

### State Changes

Add to `ganttStore`:
```typescript
columnWidth: number | null;  // null = auto-fit
setColumnWidth: (w: number | null) => void;
```

### Files Changed
- `src/stores/gantt-store.ts` — add columnWidth state
- `src/components/gantt/gantt-timeline.tsx` — use dynamic column width
- `src/components/gantt/gantt-body.tsx` — use dynamic column width, larger rows
- `src/components/gantt/gantt-bar.tsx` — larger bar height
- `src/components/gantt/gantt-row.tsx` — larger row height
- `src/components/gantt/gantt-chart.tsx` — compute auto-fit width on mount/resize
- `src/components/gantt/gantt-controls.tsx` — add zoom +/-, fit-to-screen button

---

## 3. Rich Item Creation

### Global Create Button
Add a "+" button in the Navbar that opens the full ItemForm modal. User picks type first (Epic/Story/Task/Bug), then fills all relevant fields.

### Kanban Quick-Add Upgrade
The inline input at column bottom gets a type dropdown (defaults to Task). Pressing Enter creates with the selected type. Minimal friction — just adds a dropdown.

### Gantt Add Button
Add "New Item" button to GanttControls bar. Opens the same full creation modal.

### Context-Aware Defaults
- From Kanban column: status = that column's status
- From Gantt: status = "todo"
- From Navbar: status = "todo"

### Files Changed
- `src/components/layout/navbar.tsx` — add create button
- `src/components/board/kanban-column.tsx` — add type dropdown to quick-add
- `src/components/gantt/gantt-controls.tsx` — add "New Item" button
- `src/components/items/item-form.tsx` — ensure it works as a creation modal (may already work)
- New: `src/components/items/create-item-modal.tsx` — wrapper that combines Modal + ItemForm for creation

---

## 4. JIRA-Style Sprint Management

### Data Model

```typescript
interface Sprint {
  id: string;
  name: string;
  goal: string;
  status: "planning" | "active" | "completed";
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Add to `Project`:
```typescript
sprints: Sprint[];
activeSprint: string | null;  // Sprint ID
```

Add to `BaseItem`:
```typescript
sprintId: string | null;  // null = backlog
```

### Sprint Lifecycle

1. **Create** — name + goal, status = "planning"
2. **Plan** — assign items by setting sprintId (drag from backlog or dropdown)
3. **Start** — sets startDate, endDate = startDate + 14 days (configurable), status = "active". Only one active sprint allowed.
4. **Complete** — user chooses: move incomplete items to next sprint or back to backlog. Status = "completed", actual endDate recorded.

### Store Changes

Add to `projectStore`:
```typescript
// Sprint CRUD
addSprint: (sprint: Omit<Sprint, "id" | "createdAt" | "updatedAt">) => string;
updateSprint: (id: string, updates: Partial<Sprint>) => void;
deleteSprint: (id: string) => void;
startSprint: (id: string, durationDays?: number) => void;
// Guard: if another sprint is already active, throw an error.
// UI: "Start Sprint" button is disabled when activeSprint !== null.

completeSprint: (id: string, moveIncomplete: "next" | "backlog") => void;
// "next" = the first sprint in "planning" status, ordered by createdAt.
// If no planning sprint exists when "next" is chosen, the action falls back
// to "backlog" and the UI shows a toast: "No planning sprint found — items moved to backlog."
// UI: the "Move to next sprint" option is disabled (greyed out with tooltip)
// when no sprint in "planning" status exists.

// Item-sprint assignment
assignToSprint: (itemId: string, sprintId: string | null) => void;
```

### Validator Changes

Add `sprintSchema` to `validators.ts`. Add `sprintId` to base item schema. Add `sprints` and `activeSprint` to project schema.

### UI: Board Page

**Sprint header bar** (between controls and columns):
- Sprint selector dropdown: shows all sprints, active one highlighted
- Sprint info: name, goal, dates, items count, story points total
- Action buttons: "Start Sprint" (when planning), "Complete Sprint" (when active), "Create Sprint"

**Board filtering:**
- When active sprint exists: board shows only items with matching sprintId
- "Show Backlog" toggle: shows items with sprintId = null
- "Show All" toggle: removes sprint filter

**Hierarchy rules for sprint filtering:**
- **Epics** are never assigned to sprints (they span multiple sprints). Epics are always visible on the board regardless of sprint filter — they serve as grouping headers.
- **Stories, Tasks, Bugs** can be assigned to sprints via `sprintId`.
- When filtering by sprint: show all items with matching `sprintId`, plus their parent Epic (if any) for context. Do NOT show child items of a parent just because the parent is in the sprint — each item's `sprintId` is authoritative.
- A Story can be in sprint A while its child Tasks are in sprint B (or backlog). This is valid and expected.

**Sprint completion dialog:**
- Modal listing incomplete items
- For each: choose "Move to [next sprint name]" or "Move to Backlog"
- Bulk options: "Move all to next sprint" / "Move all to backlog"

### UI: Item Detail

Add "Sprint" dropdown to ItemForm — lists available sprints + "Backlog" option.

### UI: Gantt Integration

Sprint boundaries shown as light-colored vertical bands with sprint name labels at top. Active sprint band uses accent color at 10% opacity. Completed sprints use gray.

### UI: Settings

Sprint management section: list of all sprints, edit name/goal, delete (only if planning and empty).

### Files Changed

**New files:**
- `src/components/board/sprint-header.tsx` — sprint selector, info, action buttons
- `src/components/board/sprint-complete-modal.tsx` — completion dialog

**Modified files:**
- `src/types/index.ts` — Sprint interface, BaseItem.sprintId
- `src/stores/project-store.ts` — sprint CRUD actions, assignToSprint
- `src/lib/validators.ts` — sprint schema, updated item/project schemas
- `src/components/board/kanban-board.tsx` — sprint filtering, sprint header integration
- `src/components/items/item-form.tsx` — sprint dropdown field
- `src/components/gantt/gantt-body.tsx` — sprint boundary bands
- `src/components/gantt/gantt-chart.tsx` — pass sprints to body
- `src/components/settings/settings-page.tsx` — sprint management section (or inline in board)
- `src/lib/seed-data.ts` — add sample sprints to seed data
