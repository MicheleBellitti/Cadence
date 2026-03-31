# Cadence Adjustments Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Rename to Cadence, fix Gantt readability, add rich item creation, add JIRA-style sprints.

**Spec:** `docs/superpowers/specs/2026-03-31-cadence-adjustments.md`

---

## Task 1: Rename to Cadence

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `CLAUDE.md`
- Modify: `package.json`
- Modify: `src/lib/seed-data.ts`

Steps:
- [ ] Replace "ICCREA Planner" with "Cadence" in sidebar.tsx logo text
- [ ] Replace title/description in layout.tsx metadata
- [ ] Replace all "ICCREA Planner" references in CLAUDE.md
- [ ] Change package.json name to "cadence"
- [ ] Change seed data project name to "AI Platform"
- [ ] Run `npx tsc --noEmit && npm run build`
- [ ] Commit

---

## Task 2: Sprint Data Model + Store

**Files:**
- Modify: `src/types/index.ts` — add Sprint interface, sprintId to BaseItem, sprints/activeSprint to Project
- Modify: `src/lib/validators.ts` — add sprint schema, update item/project schemas
- Modify: `src/lib/validators.test.ts` — add sprint validation tests
- Modify: `src/stores/project-store.ts` — add sprint CRUD, assignToSprint, startSprint, completeSprint

Steps:
- [ ] Add Sprint type and update BaseItem/Project in types
- [ ] Add sprint Zod schema and update existing schemas in validators
- [ ] Add sprint tests to validators.test.ts
- [ ] Add sprint CRUD actions to project-store
- [ ] Add startSprint and completeSprint actions
- [ ] Add assignToSprint action
- [ ] Add selector hooks: useSprints(), useActiveSprint()
- [ ] Run tests, typecheck
- [ ] Commit

---

## Task 3: Gantt Chart Readability

**Files:**
- Modify: `src/stores/gantt-store.ts` — add columnWidth state
- Modify: `src/components/gantt/gantt-timeline.tsx` — dynamic column width, wider minimums
- Modify: `src/components/gantt/gantt-body.tsx` — dynamic width, larger rows
- Modify: `src/components/gantt/gantt-bar.tsx` — larger bar height
- Modify: `src/components/gantt/gantt-row.tsx` — larger row height
- Modify: `src/components/gantt/gantt-chart.tsx` — auto-fit computation, resize listener
- Modify: `src/components/gantt/gantt-controls.tsx` — zoom +/-, fit-to-screen button
- Modify: `src/components/gantt/dependency-arrows.tsx` — update row height constant

Steps:
- [ ] Add columnWidth to gantt-store
- [ ] Update COLUMN_WIDTHS minimums in gantt-timeline (60/180/240)
- [ ] Update gantt-chart to compute auto-fit width on mount and window resize
- [ ] Update gantt-body and gantt-row to use 48px row height
- [ ] Update gantt-bar to use 34px bar height
- [ ] Update dependency-arrows for new row height
- [ ] Add zoom +/- and fit-to-screen buttons to gantt-controls
- [ ] Pass dynamic column width through to timeline and body
- [ ] Run typecheck and build
- [ ] Commit

---

## Task 4: Rich Item Creation

**Files:**
- Create: `src/components/items/create-item-modal.tsx`
- Modify: `src/components/layout/navbar.tsx` — add global "+" create button
- Modify: `src/components/board/kanban-column.tsx` — add type dropdown to quick-add
- Modify: `src/components/gantt/gantt-controls.tsx` — add "New Item" button
- Modify: `src/components/items/item-form.tsx` — ensure creation mode works standalone

Steps:
- [ ] Create CreateItemModal wrapping Modal + ItemForm for creation
- [ ] Add "+" button to Navbar that opens CreateItemModal
- [ ] Add type selector dropdown to kanban-column quick-add input
- [ ] Add "New Item" button to gantt-controls
- [ ] Ensure context-aware defaults (status from column, etc.)
- [ ] Run typecheck and build
- [ ] Commit

---

## Task 5: Sprint UI — Board Integration

**Files:**
- Create: `src/components/board/sprint-header.tsx`
- Create: `src/components/board/sprint-complete-modal.tsx`
- Modify: `src/components/board/kanban-board.tsx` — sprint filtering, header integration
- Modify: `src/components/items/item-form.tsx` — sprint dropdown field

Steps:
- [ ] Create SprintHeader: sprint selector, info display, Start/Complete/Create buttons
- [ ] Create SprintCompleteModal: lists incomplete items, bulk move options
- [ ] Integrate SprintHeader into KanbanBoard (between filters and columns)
- [ ] Add sprint-based filtering to KanbanBoard (show active sprint items by default)
- [ ] Add "Sprint" dropdown to ItemForm
- [ ] Run typecheck and build
- [ ] Commit

---

## Task 6: Sprint UI — Gantt + Settings + Seed Data

**Files:**
- Modify: `src/components/gantt/gantt-body.tsx` — sprint boundary bands
- Modify: `src/components/gantt/gantt-chart.tsx` — pass sprints data
- Modify: `src/app/settings/page.tsx` — sprint management section
- Modify: `src/lib/seed-data.ts` — add sample sprints

Steps:
- [ ] Add sprint vertical bands to gantt-body (shaded regions with labels)
- [ ] Pass sprint data from gantt-chart to gantt-body
- [ ] Add sprint list/edit section to settings page
- [ ] Update seed data with 2 sample sprints (1 completed, 1 active)
- [ ] Assign seed items to sprints
- [ ] Update validators test with sprint data
- [ ] Run full verification: tsc, lint, test, build
- [ ] Commit
