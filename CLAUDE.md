# Cadence

Project planning tool with Kanban board, interactive Gantt chart with critical path, and workload management. Multi-user, backed by Firebase Auth + Firestore, shipped as a static export.

## Stack

- **Framework**: Next.js 15 (App Router, static export)
- **Language**: TypeScript 5 strict mode
- **Styling**: Tailwind CSS 4 (dark mode via `class` strategy)
- **State**: Zustand 5 (project data from Firestore listeners; only UI prefs persist to localStorage)
- **Backend**: Firebase Auth (email/password) + Firestore realtime sync
- **Connector**: read-only remote MCP server on Cloud Functions gen2 (`functions/`)
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
    project-store.ts      → Items CRUD, team, overrides (fed by Firestore listeners)
    gantt-store.ts        → Zoom, scroll, selection (ephemeral)
    ui-store.ts           → Theme, sidebar, modals (persisted → `cadence-ui`)
  lib/
    scheduler.ts          → Forward/backward scheduling engine
    critical-path.ts      → CPM algorithm (topological sort + forward/backward pass)
    workload.ts           → Per-person daily load calculator
    dashboard-utils.ts    → My tasks, at-risk items, sprint progress
    firestore-sync.ts     → Firestore listeners + write operations (browser SDK)
    firestore-converters.ts → Pure doc↔type converters (no SDK import; shared with functions/)
    export.ts             → JSON/PNG/PDF export via Canvas API
    date-utils.ts         → Business day arithmetic
    validators.ts         → Zod schemas for all item types
  types/
    index.ts              → TypeScript interfaces & enums

functions/                → Cadence Connector: read-only MCP server (own package.json)
  src/oauth/              → OAuth 2.1 authorization server (DCR, PKCE, token rotation)
  src/mcp/                → MCP tools reading Firestore via the Admin SDK
```

## Commands

```bash
npm run dev              # Start dev server on :3000
npm run build            # Production build (static export)
npm run test             # Run Vitest
npm run test -- --watch  # Watch mode
npm run lint             # ESLint
npx tsc --noEmit         # Type check without emitting

# Connector (functions/ has its own dependency tree)
npm --prefix functions run typecheck
npm --prefix functions test
npm --prefix functions run build      # esbuild bundle for deploy
npm --prefix functions run dev        # local connector against the emulators
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
- Firestore is the source of truth. Only `ui-store` persists to localStorage (key `cadence-ui`); project data comes from `subscribeToProject` listeners.
- **IMPORTANT**: `firestore.rules` is the real security boundary (`uid ∈ project.memberIds`); `auth-gate.tsx` is UX only. The connector uses the Admin SDK, which **bypasses rules** — it must re-check membership itself via `authorizeProjectAccess`.
- Code shared with `functions/` must stay free of browser-SDK imports (see `lib/firestore-converters.ts`); the connector bundles `src/lib/**` with esbuild.
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

When `functions/` changed, also verify:
5. `npm --prefix functions run typecheck` passes
6. `npm --prefix functions test` passes
7. `npm --prefix functions run build` succeeds
