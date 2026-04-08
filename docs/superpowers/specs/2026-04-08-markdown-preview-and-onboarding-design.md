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

Two components:
1. A **`MarkdownTextarea`** component with Edit/Preview tab switching, used in forms
2. A **`MarkdownRenderer`** component for read-only markdown display, used wherever `description`, `acceptanceCriteria`, or `stepsToReproduce` appear in read-only contexts

Applied to all three markdown-capable fields in `ItemForm`: `description`, `acceptanceCriteria` (Story type), and `stepsToReproduce` (Bug type).

### New Dependencies

| Package | Purpose | Approx gzipped total |
|---------|---------|----------------------|
| `react-markdown` | Render markdown as React elements (safe by default, no dangerouslySetInnerHTML) | ~80-120KB including transitive deps (unified, remark-parse, micromark) |
| `remark-gfm` | GitHub Flavored Markdown: tables, strikethrough, task lists | included above |
| `@tailwindcss/typography` | `prose` classes for rendered markdown styling | Tailwind plugin (no runtime cost) |

**Tailwind v4 plugin registration:** This project uses Tailwind CSS 4, configured via `src/app/globals.css` with `@import "tailwindcss"`. There is no `tailwind.config.ts`. The typography plugin must be registered using the `@plugin` directive in `globals.css`:

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```

### Component: `src/components/ui/markdown-textarea.tsx`

**Props:**

```typescript
interface MarkdownTextareaProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;            // forwarded to textarea for label association
  label?: string;
  placeholder?: string;
  rows?: number;           // default: 3
  maxLength?: number;
}
```

**Behavior:**
- Two tabs: **Edit** and **Preview**
- Edit tab: standard `<textarea>` (same as current), with `id` prop forwarded
- Preview tab: `react-markdown` with `remark-gfm` plugin, styled with Tailwind `prose dark:prose-invert` classes
- Tab bar: surface background, accent color underline/text for active tab
- Preview area has minimum height matching the textarea rows
- Empty preview shows placeholder text: "Nothing to preview"

**Accessibility:**
- Tab bar implements `role="tablist"` with `role="tab"` buttons and `role="tabpanel"` content area
- Arrow key navigation between tabs
- `aria-selected` state on active tab
- `id` prop forwarded to textarea for `<label htmlFor>` association

**Link rendering:** Custom link component passed to react-markdown that adds `target="_blank"` and `rel="noopener noreferrer"` to all rendered links.

**Error boundary:** The preview panel is wrapped in a React error boundary that catches rendering failures from pathological markdown input and shows a fallback message.

**Tab styling:**
- Matches existing UI patterns: `var(--bg-surface)` background, `var(--accent)` for active state
- Compact tab bar (not full-width tabs — just text links with underline indicator)

### Component: `src/components/ui/markdown-renderer.tsx`

A lightweight read-only wrapper around `react-markdown` + `remark-gfm` with the same `prose dark:prose-invert` styling and custom link renderer. Used for displaying markdown content outside of edit forms.

**Props:**

```typescript
interface MarkdownRendererProps {
  content: string;
  className?: string;
}
```

### Integration Points

**`src/components/items/item-form.tsx`:**
- Replace `<textarea>` for `description` with `<MarkdownTextarea>`
- Replace `<textarea>` for `acceptanceCriteria` (conditional on `type === "story"`) with `<MarkdownTextarea>`
- Replace `<textarea>` for `stepsToReproduce` (conditional on `type === "bug"`) with `<MarkdownTextarea>`
- No changes to data model, validation, or stores — all fields remain plain strings

**Read-only display locations — replace raw text with `<MarkdownRenderer>`:**
- `src/components/items/item-detail-drawer.tsx` — wherever description/acceptanceCriteria/stepsToReproduce are displayed
- Any other component that renders these fields as plain text (audit during implementation)

### Markdown Features Supported (via remark-gfm)

- Headings, bold, italic, strikethrough
- Ordered and unordered lists
- Task lists (checkboxes)
- Tables
- Code blocks and inline code
- Links (open in new tab)
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

The page is split into composable section components, each self-contained with their own scroll-linked animations. All components are `"use client"` since they use Framer Motion hooks (`useScroll`, `useTransform`, `useRef`).

**File structure:**

```
src/app/about/page.tsx                    → "use client" page shell, section composition
src/components/about/hero-section.tsx     → Full-viewport hero with fade-on-scroll
src/components/about/board-section.tsx    → Board tutorial with animated cards
src/components/about/gantt-section.tsx    → Gantt tutorial with progressive bar reveal
src/components/about/workload-section.tsx → Workload tutorial with filling grid
src/components/about/sprint-section.tsx   → Sprint tutorial with animating progress
src/components/about/settings-section.tsx → Settings overview
src/components/about/cta-section.tsx      → Final "Get Started" call to action
src/components/about/use-section-scroll.ts → Shared hook for common scroll animation patterns
```

**Shared scroll hook (`use-section-scroll.ts`):**

```typescript
function useSectionScroll(ref: RefObject<HTMLElement>, offsets?: ScrollOffset) {
  const { scrollYProgress } = useScroll({ target: ref, offset: offsets });
  // Returns common motion values: opacity, y-translate, scale
  // Reduces duplication across section components
}
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

- Centered "Get Started →" button linking to `/dashboard`
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

// Map scroll progress to GPU-composited animation values
const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0, 1, 1, 0]);
const progressScale = useTransform(scrollYProgress, [0.2, 0.5], [0, 0.66]); // use scaleX, not width
```

No external scroll animation libraries needed — Framer Motion (already installed) handles everything.

**Scroll container caveat:** The app's `MainContent` component may use `overflow-y: auto`, meaning the page scrolls inside a nested container rather than the window. If so, `useScroll` must receive a `container` ref pointing to the scroll parent, not just a `target` ref. Verify during implementation by checking where the scroll event fires. If `MainContent` is the scroll container, pass its ref through context or via a prop from the page layout.

### Performance Considerations

- **Animated properties:** Only animate `opacity` and `transform` (GPU-composited). Avoid animating `width`, `height`, or layout properties directly — use `scaleX` for progress bars where possible.
- **`will-change: transform`** on all sticky elements to promote to compositor layer
- **`prefers-reduced-motion` fallback:** When the user has reduced motion enabled, all scroll-linked animations are disabled. Sections degrade to simple `whileInView` fade-in with `once: true`. This is both an accessibility requirement (WCAG 2.1 guideline 2.3.3) and a performance benefit for lower-end devices.
- **SVG `pathLength` animation** (Gantt dependency arrows) triggers repaints — keep the SVG simple and limit to 2-3 paths.
- **Lazy loading:** Section components should be imported with `next/dynamic` to keep them out of shared chunks and avoid penalizing the initial load of Board/Gantt views. Include a lightweight loading skeleton in the `loading` option so direct navigation to `/about` shows a placeholder while chunks load.
- **Tailwind typography v4 class names:** Verify that `prose` and `dark:prose-invert` work with `@tailwindcss/typography` under Tailwind v4. If the plugin uses a different API, adjust class names during implementation.

### Layout Constraints

- **Max-width: 900px** centered within the main content area
- Sticky illustrations are capped at reasonable sizes (~400px wide)
- Text columns have comfortable line widths (~450px max)
- Sections have generous vertical padding (80-120px between features)
- The page scrolls within the app's existing `MainContent` area — sidebar and navbar remain visible

### Sidebar Entry

**`src/components/layout/sidebar.tsx`:**
- Add "About" entry separated from the main navigation — placed in a secondary section at the bottom of the sidebar (above the user footer area), visually separated with a divider or dimmer styling to distinguish it from core app views
- Icon: `HelpCircle` from Lucide React
- Route: `/about`

**`src/components/layout/navbar.tsx`:**
- Add page title mapping: `"/about": "About"`

### Welcome Banner: `src/components/layout/welcome-banner.tsx`

**Appearance:**
- Subtle gradient background matching hero section
- Short welcome message + "Learn more" link to `/about`
- Dismiss X button in top-right corner with `aria-label="Dismiss welcome banner"`
- Framer Motion entry/exit animation (fade + slide down) for consistency with app's animation patterns
- Positioned above the main dashboard content, within the existing `max-w-4xl` container

**Behavior:**
- Renders on the Dashboard page only
- Only shows when `hasSeenWelcome === false`
- Clicking X sets `hasSeenWelcome = true` in ui-store

### State Changes

**`src/stores/ui-store.ts`:**
- Add `hasSeenWelcome: boolean` (default: `false`)
- Add `setHasSeenWelcome: (seen: boolean) => void`
- Persist `hasSeenWelcome` to localStorage (add to `partialize`)
- **Note for existing users:** Existing users with a `cadence-ui` localStorage entry will have `hasSeenWelcome` as `undefined` on first hydration, which is falsy — they will see the welcome banner once. This is intentional: the tutorial page is new and worth surfacing to all users.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/ui/markdown-textarea.tsx` | Reusable markdown edit/preview component with tabs |
| `src/components/ui/markdown-renderer.tsx` | Read-only markdown display component |
| `src/app/about/page.tsx` | Tutorial page shell, section composition (`"use client"`) |
| `src/components/about/hero-section.tsx` | Full-viewport hero with scroll fade |
| `src/components/about/board-section.tsx` | Board tutorial with animated cards |
| `src/components/about/gantt-section.tsx` | Gantt tutorial with progressive reveal |
| `src/components/about/workload-section.tsx` | Workload tutorial with filling grid |
| `src/components/about/sprint-section.tsx` | Sprint tutorial with progress animation |
| `src/components/about/settings-section.tsx` | Settings overview |
| `src/components/about/cta-section.tsx` | Final call to action |
| `src/components/about/use-section-scroll.ts` | Shared scroll animation hook |
| `src/components/layout/welcome-banner.tsx` | Dismissible first-visit banner |

## Files to Modify

| File | Change |
|------|--------|
| `src/components/items/item-form.tsx` | Replace 3 textareas with `MarkdownTextarea` |
| `src/components/items/item-detail-drawer.tsx` | Use `MarkdownRenderer` for read-only description/criteria display |
| `src/components/layout/sidebar.tsx` | Add "About" nav entry in secondary section |
| `src/components/layout/navbar.tsx` | Add "/about" page title |
| `src/stores/ui-store.ts` | Add `hasSeenWelcome` state |
| `src/app/dashboard/page.tsx` | Render `WelcomeBanner` |
| `package.json` | Add `react-markdown`, `remark-gfm`, `@tailwindcss/typography` |
| `src/app/globals.css` | Add `@plugin "@tailwindcss/typography"` |

## Testing

- **Unit test** for `MarkdownTextarea`: tab switching, markdown rendering, empty state, ARIA attributes
- **Unit test** for `MarkdownRenderer`: renders markdown correctly, links have `target="_blank"`
- **Smoke test** for About page: renders without errors (mock `useScroll` from Framer Motion since jsdom doesn't support scroll APIs)
- No complex scroll animation tests — verified visually

## Out of Scope

- Keyboard shortcuts or markdown tips on the About page
- Step-by-step guided tooltip tour
- Auto-redirect to /about on first visit
- Video or image assets — all illustrations are HTML/CSS
- Pre-authentication access to /about (page is only accessible when logged in)
