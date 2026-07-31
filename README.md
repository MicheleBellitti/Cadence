# Cadence

Project planning for small teams: a Kanban board, an interactive Gantt chart with critical-path analysis, sprint tracking, and per-person workload — backed by Firebase Auth and Firestore.

## Features

- **Board** — Kanban with drag-and-drop across todo / in progress / in review / done
- **Gantt** — forward scheduling from estimates and dependencies, with CPM critical path, slack, and manual date overrides
- **Sprints** — sprint planning, burndown, and progress tracking
- **Workload** — per-person daily load against capacity, business days only
- **Dashboard** — my tasks, at-risk items, active sprint progress
- **Connector** — a read-only MCP server so Claude, ChatGPT, or Gemini can report your board state without ever seeing your credentials (see [docs/connector.md](docs/connector.md))

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will need a Firebase project; copy `.env.example` to `.env.local` and fill in the `NEXT_PUBLIC_FIREBASE_*` values.

## Commands

```bash
npm run dev              # dev server on :3000
npm run build            # production build (static export)
npm run test             # Vitest
npm run lint             # ESLint
npx tsc --noEmit         # type check
```

The connector lives in `functions/` and has its own dependency tree:

```bash
npm --prefix functions run typecheck
npm --prefix functions test
npm --prefix functions run build
```

## Documentation

- [Architecture](docs/architecture.md) — data model, scheduling engine, state layout
- [Connector](docs/connector.md) — the read-only MCP server for AI assistants

## Stack

Next.js 16 (App Router, static export) · TypeScript · Tailwind CSS 4 · Zustand · Firebase Auth + Firestore · @dnd-kit · Framer Motion · Zod · Vitest
