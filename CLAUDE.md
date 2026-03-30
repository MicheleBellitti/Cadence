# ICCREA Planner

Project planning tool with Kanban board, interactive Gantt chart with critical path, and workload management. Single-user, localStorage persistence, deployed on Vercel.

## Stack

- **Framework**: Next.js 15 (App Router, static export)
- **Language**: TypeScript 5 strict mode
- **Styling**: Tailwind CSS 4 (dark mode via `class` strategy)
- **State**: Zustand 5 with `persist` middleware → localStorage
- **Drag & Drop**: @dnd-kit/core + @dnd-kit/sortable
- **Animations**: Framer Motion 12
- **Date logic**: date-fns 4
- **Validation**: Zod 3
- **Icons**: Lucide React
- **Testing**: Vitest + @testing-library/react

## Project structure

```
src/
  app/                    → Next.js App Router pages
    layout.tsx            → Root layout, providers, theme
    page.tsx              → Dashboard redirect
    board/page.tsx        → Kanban view
    gantt/page.tsx        → Gantt chart view
    workload/page.tsx     → Workload per-person view
    settings/page.tsx     → Team & project config
  components/
    layout/               → Sidebar, Navbar, ThemeToggle
    board/                → KanbanBoard, KanbanColumn, KanbanCard
    gantt/                → GanttChart, GanttRow, GanttBar, DependencyArrows, GanttTimeline, GanttTooltip
    workload/             → WorkloadGrid, WorkloadBar
    items/                → ItemDetailDrawer, ItemForm, ItemCard
    ui/                   → Button, Modal, Select, Input, Badge, Tooltip (design system primitives)
  stores/
    project-store.ts      → Items CRUD, team, overrides (persisted)
    gantt-store.ts        → Zoom, scroll, selection (ephemeral)
    ui-store.ts           → Theme, sidebar, modals (persisted)
  lib/
    scheduler.ts          → Forward/backward scheduling engine
    critical-path.ts      → CPM algorithm (topological sort + forward/backward pass)
    workload.ts           → Per-person daily load calculator
    export.ts             → JSON/PNG/PDF export via Canvas API
    date-utils.ts         → Business day arithmetic
    validators.ts         → Zod schemas for all item types
  types/
    index.ts              → TypeScript interfaces & enums
```

## Commands

```bash
npm run dev              # Start dev server on :3000
npm run build            # Production build (static export)
npm run test             # Run Vitest
npm run test -- --watch  # Watch mode
npm run lint             # ESLint
npx tsc --noEmit         # Type check without emitting
```

## Code style

- ES modules only (import/export), never CommonJS (require)
- Functional components with hooks, never class components
- Destructure imports: `import { useState } from "react"`
- Name files in kebab-case: `gantt-bar.tsx`, `critical-path.ts`
- Name components in PascalCase: `GanttBar`, `KanbanCard`
- Name stores with suffix: `project-store.ts`
- Prefer `interface` over `type` for object shapes
- All lib/ functions must be pure (no side effects, no store access)
- Tailwind only for styling, no CSS files, no inline style objects
- Dark mode: always provide both light and dark variants

## Architecture rules

- **IMPORTANT**: Scheduling and critical path are DERIVED state computed with `useMemo` from raw store data. Never store computed dates.
- **IMPORTANT**: All date arithmetic uses business days only (Mon-Fri). Use `lib/date-utils.ts` helpers, never raw Date math.
- Zustand stores use `persist` middleware with explicit localStorage keys: `iccrea-project`, `iccrea-ui`
- Before adding a dependency, run cycle detection (DFS in `lib/critical-path.ts`). UI must prevent circular deps.
- The `GanttOverride` type holds manual date overrides separate from items. Scheduler respects: `max(override, dependency end)`.
- Canvas-based PNG/PDF export renders a fresh offscreen canvas, always in light theme for print readability.

## Testing strategy

- Unit tests for `lib/` modules: scheduler, critical-path, date-utils, validators
- Component tests for complex interactions: KanbanBoard drag-drop, GanttBar resize
- Run `npm run test` before committing. Run `npx tsc --noEmit` to catch type errors.
- Test file naming: `scheduler.test.ts` next to `scheduler.ts`

## Verification checklist

After any change, verify:
1. `npx tsc --noEmit` passes
2. `npm run lint` passes
3. `npm run test` passes
4. `npm run build` succeeds (static export)
