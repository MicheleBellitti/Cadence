# Markdown Preview & Scroll-Driven Tutorial Page

**Date:** 2026-04-08
**Branch:** `feature/markdown-preview-and-onboarding`
**Status:** Design approved

## Summary

Two features:
1. **Markdown preview tabs** for item description and acceptance criteria textareas
2. **Scroll-driven tutorial page** — an immersive, Apple-style onboarding experience with scroll-linked animations that walk users through each feature step by step

---

## Feature 1: Markdown Preview Tabs

### Problem

The `ItemForm` textarea placeholder says "Markdown supported..." but markdown is never rendered. Users write markdown that displays as raw text.

### Solution

A reusable `MarkdownTextarea` component with Edit/Preview tab switching. Applied to both the `description` and `acceptanceCriteria` fields in `ItemForm`.

### New Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `react-markdown` | Render markdown as React elements (safe by default, no dangerouslySetInnerHTML) | ~30KB |
| `remark-gfm` | GitHub Flavored Markdown: tables, strikethrough, task lists | ~5KB |
| `@tailwindcss/typography` | `prose` classes for rendered markdown styling | Tailwind plugin |

### Component: `src/components/ui/markdown-textarea.tsx`

**Props:**

```typescript
interface MarkdownTextareaProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  rows?: number;        // default: 3
  maxLength?: number;
}
```

**Behavior:**
- Two tabs: **Edit** and **Preview**
- Edit tab: standard `<textarea>` (same as current)
- Preview tab: `react-markdown` with `remark-gfm` plugin, styled with Tailwind `prose dark:prose-invert` classes
- Tab bar: surface background, accent color underline/text for active tab
- Preview area has minimum height matching the textarea rows
- Empty preview shows placeholder text: "Nothing to preview"

**Tab styling:**
- Matches existing UI patterns: `var(--bg-surface)` background, `var(--accent)` for active state
- Compact tab bar (not full-width tabs — just text links with underline indicator)

### Integration Points

**`src/components/items/item-form.tsx`:**
- Replace `<textarea>` for `description` (~line 305) with `<MarkdownTextarea>`
- Replace `<textarea>` for `acceptanceCriteria` (~line 318) with `<MarkdownTextarea>`
- No changes to data model, validation, or stores — descriptions remain plain strings

### Markdown Features Supported (via remark-gfm)

- Headings, bold, italic, strikethrough
- Ordered and unordered lists
- Task lists (checkboxes)
- Tables
- Code blocks and inline code
- Links
- Blockquotes

---

## Feature 2: Scroll-Driven Tutorial Page

### Problem

No onboarding experience for new users. The app has multiple powerful views (Board, Gantt, Workload, Sprints, Settings) but no way to discover what they do without clicking around.

### Solution

A dedicated `/about` page with an immersive, scroll-driven tutorial experience inspired by Apple product pages. Each feature gets a full-viewport "act" with animations tied directly to scroll progress using Framer Motion's `useScroll` + `useTransform`.

### Design Philosophy

- **Scroll is the interaction** — content animates continuously as the user scrolls, not just on intersection
- **Full-viewport sections** — each feature occupies at least one viewport height, giving it breathing room
- **Progressive reveal** — illustrations build up step by step as scroll progresses (e.g., Gantt bars appear, then dependencies draw in, then critical path glows)
- **Large, bold typography** — hero text and section headings use oversized fonts with high contrast
- **Dark-first aesthetic** — designed primarily for dark mode, works in light mode too
- **Tutorial, not brochure** — each section teaches *how* to use the feature, not just *what* it is

### Architecture

The page is split into composable section components, each self-contained with their own scroll-linked animations.

**File structure:**

```
src/app/about/page.tsx                    → Page shell, section composition
src/components/about/hero-section.tsx     → Full-viewport hero with fade-on-scroll
src/components/about/board-section.tsx    → Board tutorial with animated cards
src/components/about/gantt-section.tsx    → Gantt tutorial with progressive bar reveal
src/components/about/workload-section.tsx → Workload tutorial with filling grid
src/components/about/sprint-section.tsx   → Sprint tutorial with animating progress
src/components/about/settings-section.tsx → Settings overview
src/components/about/cta-section.tsx      → Final "Get Started" call to action
```

### Section-by-Section Design

#### 1. Hero Section

- Full viewport height, centered content
- Large title: "Welcome to Cadence" — fades and scales down as user scrolls away
- Subtitle: "Scroll to explore" with a subtle animated down-arrow
- Gradient background: accent-to-purple tint, matching app identity
- **Scroll behavior:** Title opacity goes from 1→0 and scale from 1→0.95 as user scrolls through the first viewport

#### 2. Board Tutorial

- **Sticky layout:** Left side pins a mini Kanban board illustration, right side scrolls through tutorial steps
- **Scroll-driven steps:**
  1. "Create items" — cards fade in one by one into the TO DO column
  2. "Drag to organize" — a card animates from TO DO → IN PROGRESS
  3. "Track progress" — a card moves to DONE with a strikethrough effect
- **Technique:** Wrapper div is ~300vh tall. The illustration is `position: sticky` in the center. `useScroll` on the wrapper maps scroll progress (0→1) to step transitions. Each step threshold triggers the next animation state.
- Mini board uses the real app's visual language: type-color left stripes on cards, column headers, surface/elevated backgrounds

#### 3. Gantt Tutorial

- **Sticky layout:** Same pattern — illustration pins, content scrolls
- **Scroll-driven steps:**
  1. "Visualize your timeline" — Gantt bars slide in from left, staggered by row
  2. "See dependencies" — dashed arrow curves draw between connected bars (SVG path animation via `pathLength`)
  3. "Spot the critical path" — critical bars pulse with purple glow, non-critical fade to lower opacity
- Bars use real visual patterns: left type-color stripes, rounded corners, status opacity

#### 4. Workload Tutorial

- **Sticky layout**
- **Scroll-driven steps:**
  1. "See your team's capacity" — member names and empty grid appear
  2. "Track daily hours" — cells fill in with green (under capacity)
  3. "Spot overallocation" — some cells turn yellow/red, drawing attention to overloaded days
- Grid uses the real color-coding: green (<80%), yellow (80-100%), red (>100%) with `color-mix` tints

#### 5. Sprint Tutorial

- **Sticky layout**
- **Scroll-driven steps:**
  1. "Plan in sprints" — sprint card appears with title and date range
  2. "Assign and track" — item count ticks up, progress bar fills from 0→66%
  3. "Ship and iterate" — completion badge animates in
- Progress bar fill width is directly mapped to scroll progress via `useTransform`

#### 6. Settings Section

- Lighter treatment — no sticky scroll, just a fade-in section
- Key points: team management, deadlines, theme switching
- Uses `whileInView` for simple fade + slide-up entry

#### 7. CTA Section

- Centered "Get Started →" button linking to `/board`
- Fade-in on scroll into view
- Generous vertical padding

### Scroll Animation Technique

All scroll-linked animations use Framer Motion's scroll API:

```typescript
// Each section wraps content in a tall container
const sectionRef = useRef(null);
const { scrollYProgress } = useScroll({
  target: sectionRef,
  offset: ["start end", "end start"]
});

// Map scroll progress to animation values
const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0, 1, 1, 0]);
const barWidth = useTransform(scrollYProgress, [0.2, 0.5], ["0%", "66%"]);
```

No external scroll animation libraries needed — Framer Motion (already installed) handles everything.

### Layout Constraints

- **Max-width: 900px** centered within the main content area
- Sticky illustrations are capped at reasonable sizes (~400px wide)
- Text columns have comfortable line widths (~450px max)
- Sections have generous vertical padding (80-120px between features)
- The page scrolls within the app's existing `MainContent` area — sidebar and navbar remain visible

### Sidebar Entry

**`src/components/layout/sidebar.tsx`:**
- Add "About" entry at the bottom of navigation list (after Settings)
- Icon: `HelpCircle` from Lucide React
- Route: `/about`

**`src/components/layout/navbar.tsx`:**
- Add page title mapping: `"/about": "About"`

### Welcome Banner: `src/components/layout/welcome-banner.tsx`

**Appearance:**
- Subtle gradient background matching hero section
- Short welcome message + "Learn more" link to `/about`
- Dismiss X button in top-right corner

**Behavior:**
- Renders on the Dashboard page only
- Only shows when `hasSeenWelcome === false`
- Clicking X sets `hasSeenWelcome = true` in ui-store

### State Changes

**`src/stores/ui-store.ts`:**
- Add `hasSeenWelcome: boolean` (default: `false`)
- Add `setHasSeenWelcome: (seen: boolean) => void`
- Persist `hasSeenWelcome` to localStorage (add to `partialize`)

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/ui/markdown-textarea.tsx` | Reusable markdown edit/preview component |
| `src/app/about/page.tsx` | Tutorial page shell, section composition |
| `src/components/about/hero-section.tsx` | Full-viewport hero with scroll fade |
| `src/components/about/board-section.tsx` | Board tutorial with animated cards |
| `src/components/about/gantt-section.tsx` | Gantt tutorial with progressive reveal |
| `src/components/about/workload-section.tsx` | Workload tutorial with filling grid |
| `src/components/about/sprint-section.tsx` | Sprint tutorial with progress animation |
| `src/components/about/settings-section.tsx` | Settings overview |
| `src/components/about/cta-section.tsx` | Final call to action |
| `src/components/layout/welcome-banner.tsx` | Dismissible first-visit banner |

## Files to Modify

| File | Change |
|------|--------|
| `src/components/items/item-form.tsx` | Replace 2 textareas with `MarkdownTextarea` |
| `src/components/layout/sidebar.tsx` | Add "About" nav entry |
| `src/components/layout/navbar.tsx` | Add "/about" page title |
| `src/stores/ui-store.ts` | Add `hasSeenWelcome` state |
| `src/app/dashboard/page.tsx` (or equivalent) | Render `WelcomeBanner` |
| `package.json` | Add `react-markdown`, `remark-gfm`, `@tailwindcss/typography` |
| `tailwind.config.ts` (or CSS) | Register typography plugin |

## Testing

- **Unit test** for `MarkdownTextarea`: tab switching, markdown rendering, empty state
- No complex tests for About page (scroll animations are visual — verified manually)

## Out of Scope

- Keyboard shortcuts or markdown tips on the About page
- Step-by-step guided tooltip tour
- Auto-redirect to /about on first visit
- Video or image assets — all illustrations are HTML/CSS
