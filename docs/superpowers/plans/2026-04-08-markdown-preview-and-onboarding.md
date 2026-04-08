# Markdown Preview & Scroll-Driven Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add markdown preview tabs to item text fields and build a scroll-driven interactive tutorial page for onboarding.

**Architecture:** Feature 1 adds two components (`MarkdownTextarea` for editing, `MarkdownRenderer` for read-only) using `react-markdown` + `remark-gfm`. Feature 2 builds a `/about` page with Framer Motion `useScroll`/`useTransform` for Apple-style scroll-linked animations, with 7 section components lazily loaded. A welcome banner on dashboard links to the tutorial.

**Tech Stack:** react-markdown, remark-gfm, @tailwindcss/typography, Framer Motion 12 (useScroll/useTransform), Next.js dynamic imports, Zustand persist

**Spec:** `docs/superpowers/specs/2026-04-08-markdown-preview-and-onboarding-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|----------------|
| `src/components/ui/markdown-textarea.tsx` | Edit/Preview tabbed textarea with react-markdown |
| `src/components/ui/markdown-renderer.tsx` | Read-only markdown display wrapper |
| `src/components/about/hero-section.tsx` | Full-viewport hero with scroll-fade |
| `src/components/about/board-section.tsx` | Kanban board tutorial with animated cards |
| `src/components/about/gantt-section.tsx` | Gantt tutorial with progressive bar reveal |
| `src/components/about/workload-section.tsx` | Workload tutorial with filling grid cells |
| `src/components/about/sprint-section.tsx` | Sprint tutorial with animating progress bar |
| `src/components/about/settings-section.tsx` | Settings overview (simple fade-in) |
| `src/components/about/cta-section.tsx` | "Get Started" call to action |
| `src/components/about/use-section-scroll.ts` | Shared hook for scroll animation patterns |
| `src/app/about/page.tsx` | Page shell composing all sections |
| `src/components/layout/welcome-banner.tsx` | Dismissible first-visit banner |

### Modified Files

| File | Change |
|------|--------|
| `package.json` | Add 3 dependencies |
| `src/app/globals.css:1` | Add `@plugin "@tailwindcss/typography"` after import |
| `src/components/items/item-form.tsx:301,461,495` | Replace 3 textareas with `MarkdownTextarea` |

**Note on `item-detail-drawer.tsx`:** The spec mentions using `MarkdownRenderer` in the drawer for read-only display. However, the drawer delegates entirely to `<ItemForm>` (line 87) — there is no separate read-only rendering path. Since the `MarkdownTextarea` replaces the textareas inside `ItemForm`, the preview tab already serves as the read-only view within the drawer. No additional `MarkdownRenderer` integration is needed in the drawer.
| `src/stores/ui-store.ts:17-41` | Add `hasSeenWelcome` state + persist |
| `src/components/layout/sidebar.tsx:22-28` | Add About nav entry in secondary section |
| `src/components/layout/navbar.tsx` | Add "/about" page title |
| `src/app/dashboard/page.tsx:70` | Render WelcomeBanner |

---

## Task 1: Install Dependencies and Register Typography Plugin

**Files:**
- Modify: `package.json`
- Modify: `src/app/globals.css:1`

- [ ] **Step 1: Install markdown dependencies**

```bash
npm install react-markdown remark-gfm @tailwindcss/typography
```

- [ ] **Step 2: Register typography plugin in globals.css**

In `src/app/globals.css`, add `@plugin` after the Tailwind import (line 1):

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```

- [ ] **Step 3: Verify the build compiles**

```bash
npx tsc --noEmit
```

Expected: PASS (no type errors)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/app/globals.css
git commit -m "chore: add react-markdown, remark-gfm, @tailwindcss/typography"
```

---

## Task 2: Create MarkdownRenderer Component

**Files:**
- Create: `src/components/ui/markdown-renderer.tsx`

- [ ] **Step 1: Create the read-only markdown renderer**

```tsx
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type ComponentPropsWithoutRef } from "react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function MarkdownLink(props: ComponentPropsWithoutRef<"a">) {
  return (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {props.children}
    </a>
  );
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  if (!content.trim()) {
    return null;
  }

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

Note: If `prose dark:prose-invert` doesn't work under Tailwind v4's typography plugin, check the plugin docs and adjust class names. The plugin may use `@typography` or require different configuration.

- [ ] **Step 2: Verify type check passes**

```bash
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/markdown-renderer.tsx
git commit -m "feat: add MarkdownRenderer component for read-only markdown display"
```

---

## Task 3: Create MarkdownTextarea Component

**Files:**
- Create: `src/components/ui/markdown-textarea.tsx`

- [ ] **Step 1: Create the markdown textarea with Edit/Preview tabs**

Uses Tailwind arbitrary value classes for CSS variable colors (e.g., `text-[var(--text-secondary)]`), matching the codebase convention. No inline `style` objects except where Tailwind cannot express the value.

Includes a React error boundary around the preview panel to catch rendering failures from pathological markdown input.

```tsx
"use client";

import { Component, useState, useId, type KeyboardEvent, type ReactNode } from "react";
import { MarkdownRenderer } from "./markdown-renderer";

// Error boundary for preview panel
class PreviewErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return <p className="px-3 py-2 text-sm text-[var(--text-secondary)]">Unable to render preview.</p>;
    }
    return this.props.children;
  }
}

interface MarkdownTextareaProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}

type Tab = "edit" | "preview";

export function MarkdownTextarea({
  value,
  onChange,
  id,
  label,
  placeholder,
  rows = 3,
  maxLength,
}: MarkdownTextareaProps) {
  const [activeTab, setActiveTab] = useState<Tab>("edit");
  const generatedId = useId();
  const tabPanelId = `${id ?? generatedId}-tabpanel`;
  const editTabId = `${id ?? generatedId}-tab-edit`;
  const previewTabId = `${id ?? generatedId}-tab-preview`;

  function handleTabKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setActiveTab((prev) => (prev === "edit" ? "preview" : "edit"));
    }
  }

  const tabClass = (active: boolean) =>
    `px-3.5 py-1.5 text-[13px] font-medium bg-transparent border-none cursor-pointer transition-colors duration-150 border-b-2 ${
      active
        ? "border-b-[var(--accent)] text-[var(--accent)]"
        : "border-b-transparent text-[var(--text-secondary)]"
    }`;

  return (
    <div>
      {label && (
        <label
          htmlFor={activeTab === "edit" ? id : undefined}
          className="block mb-1.5 text-sm font-medium text-[var(--text-secondary)]"
        >
          {label}
        </label>
      )}
      <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-primary)]">
        {/* Tab bar */}
        <div
          role="tablist"
          aria-label={label ? `${label} editor` : "Markdown editor"}
          className="flex border-b border-[var(--border)] bg-[var(--bg-surface)]"
        >
          <button
            role="tab"
            id={editTabId}
            aria-selected={activeTab === "edit"}
            aria-controls={tabPanelId}
            tabIndex={activeTab === "edit" ? 0 : -1}
            onKeyDown={handleTabKeyDown}
            onClick={() => setActiveTab("edit")}
            className={tabClass(activeTab === "edit")}
          >
            Edit
          </button>
          <button
            role="tab"
            id={previewTabId}
            aria-selected={activeTab === "preview"}
            aria-controls={tabPanelId}
            tabIndex={activeTab === "preview" ? 0 : -1}
            onKeyDown={handleTabKeyDown}
            onClick={() => setActiveTab("preview")}
            className={tabClass(activeTab === "preview")}
          >
            Preview
          </button>
        </div>

        {/* Tab panel */}
        <div
          role="tabpanel"
          id={tabPanelId}
          aria-labelledby={activeTab === "edit" ? editTabId : previewTabId}
        >
          {activeTab === "edit" ? (
            <textarea
              id={id}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              rows={rows}
              maxLength={maxLength}
              className="w-full resize-y bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-inset"
              style={{ minHeight: `${rows * 1.5 + 1}rem` }}
            />
          ) : (
            <PreviewErrorBoundary>
              <div className="px-3 py-2" style={{ minHeight: `${rows * 1.5 + 1}rem` }}>
                {value.trim() ? (
                  <MarkdownRenderer content={value} />
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">
                    Nothing to preview
                  </p>
                )}
              </div>
            </PreviewErrorBoundary>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify type check passes**

```bash
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/markdown-textarea.tsx
git commit -m "feat: add MarkdownTextarea component with Edit/Preview tabs"
```

---

## Task 4: Integrate Markdown Components into ItemForm

**Files:**
- Modify: `src/components/items/item-form.tsx:301,461,495`

- [ ] **Step 1: Add import to item-form.tsx**

At the top of `src/components/items/item-form.tsx`, add:

```tsx
import { MarkdownTextarea } from "../ui/markdown-textarea";
```

- [ ] **Step 2: Replace description textarea (around line 301)**

Find the `<textarea>` with `id="item-description"` and replace the entire textarea element (keeping the label above it) with:

```tsx
<MarkdownTextarea
  id="item-description"
  value={description}
  onChange={(val) => setDescription(val)}
  placeholder="Markdown supported..."
  rows={3}
  maxLength={10000}
/>
```

Remove the separate `<label>` element above it — the label text is not needed since the field is clearly labeled by context. Or, pass `label="Description"` to the component and remove the external label.

- [ ] **Step 3: Replace acceptanceCriteria textarea (around line 461)**

Find the `<textarea>` with `id="item-acceptance-criteria"` inside `{type === "story" && (...)}` and replace with:

```tsx
<MarkdownTextarea
  id="item-acceptance-criteria"
  value={acceptanceCriteria}
  onChange={(val) => setAcceptanceCriteria(val)}
  placeholder="Define the acceptance criteria..."
  rows={3}
  maxLength={10000}
/>
```

Same label handling as description.

- [ ] **Step 4: Replace stepsToReproduce textarea (around line 495)**

Find the `<textarea>` with `id="item-steps-to-reproduce"` inside `{type === "bug" && (...)}` and replace with:

```tsx
<MarkdownTextarea
  id="item-steps-to-reproduce"
  value={stepsToReproduce}
  onChange={(val) => setStepsToReproduce(val)}
  placeholder="1. Go to...\n2. Click on...\n3. See error..."
  rows={3}
  maxLength={10000}
/>
```

- [ ] **Step 5: Verify type check and lint pass**

```bash
npx tsc --noEmit && npm run lint
```

Expected: PASS

- [ ] **Step 6: Test manually in dev server**

```bash
npm run dev
```

Open the app, create/edit an item. Verify:
- Edit tab shows textarea
- Preview tab renders markdown (bold, lists, links, code)
- Links open in new tab
- Empty preview shows "Nothing to preview"
- Acceptance criteria tab appears for Story type
- Steps to reproduce tab appears for Bug type

- [ ] **Step 7: Commit**

```bash
git add src/components/items/item-form.tsx
git commit -m "feat: replace plain textareas with MarkdownTextarea in item form"
```

---

## Task 5: Write Tests for Markdown Components

**Files:**
- Create: `src/components/ui/markdown-textarea.test.tsx`
- Create: `src/components/ui/markdown-renderer.test.tsx`

- [ ] **Step 1: Write MarkdownRenderer tests**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MarkdownRenderer } from "./markdown-renderer";

describe("MarkdownRenderer", () => {
  it("renders markdown as HTML", () => {
    render(<MarkdownRenderer content="**bold text**" />);
    expect(screen.getByText("bold text").tagName).toBe("STRONG");
  });

  it("renders links with target=_blank", () => {
    render(<MarkdownRenderer content="[link](https://example.com)" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("returns null for empty content", () => {
    const { container } = render(<MarkdownRenderer content="   " />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Write MarkdownTextarea tests**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MarkdownTextarea } from "./markdown-textarea";

describe("MarkdownTextarea", () => {
  it("shows textarea in edit mode by default", () => {
    render(<MarkdownTextarea value="hello" onChange={vi.fn()} id="test" />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("switches to preview on tab click", async () => {
    render(<MarkdownTextarea value="**bold**" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
  });

  it("shows placeholder in empty preview", async () => {
    render(<MarkdownTextarea value="" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByText("Nothing to preview")).toBeInTheDocument();
  });

  it("has correct ARIA attributes", () => {
    render(<MarkdownTextarea value="" onChange={vi.fn()} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    const editTab = screen.getByRole("tab", { name: "Edit" });
    expect(editTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm run test
```

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/markdown-textarea.test.tsx src/components/ui/markdown-renderer.test.tsx
git commit -m "test: add unit tests for MarkdownTextarea and MarkdownRenderer"
```

---

## Task 6: Add hasSeenWelcome State to UI Store

**Files:**
- Modify: `src/stores/ui-store.ts:17-41`

- [ ] **Step 1: Add hasSeenWelcome to the store interface and implementation**

In `src/stores/ui-store.ts`:

1. Add to the interface (around line 3-15):
   ```tsx
   hasSeenWelcome: boolean;
   setHasSeenWelcome: (seen: boolean) => void;
   ```

2. Add to the store creation (inside `(set) => ({...})`):
   ```tsx
   hasSeenWelcome: false,
   setHasSeenWelcome: (seen) => set({ hasSeenWelcome: seen }),
   ```

3. Add to `partialize` (around line 36-39):
   ```tsx
   partialize: (state) => ({
     theme: state.theme,
     sidebarCollapsed: state.sidebarCollapsed,
     hasSeenWelcome: state.hasSeenWelcome,
   }),
   ```

- [ ] **Step 2: Verify type check**

```bash
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/stores/ui-store.ts
git commit -m "feat: add hasSeenWelcome state to ui-store"
```

---

## Task 7: Add Sidebar Entry and Navbar Title for About

**Files:**
- Modify: `src/components/layout/sidebar.tsx:22-28`
- Modify: `src/components/layout/navbar.tsx`

- [ ] **Step 1: Add About to sidebar**

In `src/components/layout/sidebar.tsx`:

1. Add import: `import { HelpCircle } from "lucide-react";` (or add to existing Lucide import)

2. After the `navItems` array (line 28) and after the nav rendering loop, add a secondary section before the user footer. Find the divider or user section at the bottom of the sidebar and insert above it:

```tsx
{/* Secondary nav */}
<div style={{ borderTop: "1px solid var(--border)", paddingTop: "8px", marginTop: "8px" }}>
  <Link
    href="/about"
    /* same styling as navItems, but using HelpCircle icon and "About" label */
  />
</div>
```

Follow the exact same link styling pattern used for the `navItems` map (active state, hover, icon + label layout).

- [ ] **Step 2: Add page title to navbar**

In `src/components/layout/navbar.tsx`, find the `pageTitles` object and add:

```tsx
"/about": "About",
```

- [ ] **Step 3: Verify type check**

```bash
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/sidebar.tsx src/components/layout/navbar.tsx
git commit -m "feat: add About entry to sidebar and navbar"
```

---

## Task 8: Create Shared Scroll Animation Hook

**Files:**
- Create: `src/components/about/use-section-scroll.ts`

**Scroll container note:** The app's `MainContent` component does NOT have `overflow-y: auto` — the page scrolls at the window level. This means `useScroll({ target })` with default window scrolling works correctly. If this changes in the future, a `container` ref would need to be passed to `useScroll`.

- [ ] **Step 1: Create the shared hook**

```tsx
"use client";

import { useRef } from "react";
import { useScroll, useTransform, type MotionValue } from "framer-motion";

interface SectionScrollResult {
  ref: React.RefObject<HTMLDivElement | null>;
  scrollYProgress: MotionValue<number>;
  opacity: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
}

export function useSectionScroll(
  fadeIn = [0, 0.2],
  fadeOut = [0.8, 1],
): SectionScrollResult {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const opacity = useTransform(
    scrollYProgress,
    [fadeIn[0], fadeIn[1], fadeOut[0], fadeOut[1]],
    [0, 1, 1, 0],
  );
  const y = useTransform(scrollYProgress, [fadeIn[0], fadeIn[1]], [40, 0]);
  const scale = useTransform(scrollYProgress, [fadeIn[0], fadeIn[1]], [0.97, 1]);

  return { ref, scrollYProgress, opacity, y, scale };
}
```

- [ ] **Step 2: Verify type check**

```bash
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/about/use-section-scroll.ts
git commit -m "feat: add useSectionScroll shared hook for about page animations"
```

---

## Task 9: Create Hero Section

**Files:**
- Create: `src/components/about/hero-section.tsx`

- [ ] **Step 1: Create the hero with scroll fade**

```tsx
"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

export function HeroSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.6], [1, 0.95]);

  return (
    <section ref={ref} className="relative flex min-h-screen items-center justify-center">
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, transparent), color-mix(in srgb, var(--purple) 12%, transparent))",
        }}
      />
      <motion.div className="relative z-10 text-center px-6" style={{ opacity, scale }}>
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl text-[var(--text-primary)]">
          Welcome to Cadence
        </h1>
        <p className="mt-4 text-lg max-w-md mx-auto text-[var(--text-secondary)]">
          Plan, track, and ship projects with clarity.
        </p>
        <motion.div
          className="mt-12"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <p className="text-sm mb-2 text-[var(--text-secondary)]">
            Scroll to explore
          </p>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mx-auto text-[var(--text-secondary)]">
            <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
      </motion.div>
    </section>
  );
}
```

- [ ] **Step 2: Verify type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/about/hero-section.tsx
git commit -m "feat: add hero section with scroll-fade animation"
```

---

## Task 10: Create Board Tutorial Section

**Files:**
- Create: `src/components/about/board-section.tsx`

**Styling rule for all About section components (Tasks 10-14):** Use Tailwind arbitrary value classes for CSS variables, e.g., `text-[var(--text-primary)]`, `bg-[var(--bg-surface)]`, `border-[var(--border)]`. Only use inline `style` for values Tailwind cannot express (e.g., `color-mix()` functions, Framer Motion's `style={{ opacity, scale }}` motion values). Run `npm run lint` after each task.

- [ ] **Step 1: Create the board section with sticky illustration and scroll-driven card animation**

Build a ~300vh tall wrapper with:
- A sticky mini Kanban board illustration (left) showing 3 columns: TO DO, IN PROGRESS, DONE
- Cards that animate between columns as scroll progresses
- Use `useScroll` on the wrapper, map `scrollYProgress` to 3 step thresholds (0→0.33: cards appear, 0.33→0.66: card moves to IN PROGRESS, 0.66→1: card moves to DONE)
- Step text labels on the right that fade in/out with scroll progress
- Cards use type-color left stripes matching the real app: green for Task, blue for Story, purple for Epic
- Use `useTransform` and `motion.div` for all animations

This component will be the most complex section. Follow the pattern established in `use-section-scroll.ts` but with custom scroll mappings for the 3-step animation.

Include `prefers-reduced-motion` handling: wrap in a `useReducedMotion()` check from Framer Motion, and if true, show all cards in their final positions with simple `whileInView` fade-in.

- [ ] **Step 2: Verify type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/about/board-section.tsx
git commit -m "feat: add board tutorial section with scroll-driven card animation"
```

---

## Task 11: Create Gantt Tutorial Section

**Files:**
- Create: `src/components/about/gantt-section.tsx`

- [ ] **Step 1: Create the Gantt section with progressive bar reveal**

Build a ~300vh wrapper with sticky illustration:
- Gantt bars that slide in from the left, staggered by row (scroll 0→0.33)
- SVG dependency arrow that draws between bars using `pathLength` animation (scroll 0.33→0.66)
- Critical path bars that gain purple glow + border while non-critical fade to lower opacity (scroll 0.66→1)
- Bars have left type-color stripes: purple for Epic, green for Task, blue for Story, red for Bug
- Step text labels that transition with scroll

Use `will-change: transform` on the sticky container. Limit SVG dependency arrows to 1-2 paths to avoid repaint cost.

Include `prefers-reduced-motion` fallback.

- [ ] **Step 2: Verify type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/about/gantt-section.tsx
git commit -m "feat: add Gantt tutorial section with progressive reveal animation"
```

---

## Task 12: Create Workload Tutorial Section

**Files:**
- Create: `src/components/about/workload-section.tsx`

- [ ] **Step 1: Create the workload section with filling grid cells**

Build a ~300vh wrapper with sticky illustration:
- Member names and empty grid appear (scroll 0→0.33)
- Cells fill in with green tint + hour labels (scroll 0.33→0.66)
- Some cells transition to yellow/red showing overallocation (scroll 0.66→1)
- Grid matches real app: `color-mix(in srgb, var(--success) 15%, transparent)` for green, `var(--warning)` for yellow, `var(--danger)` for red
- Member color dots (small circles) next to names

Include `prefers-reduced-motion` fallback.

- [ ] **Step 2: Verify type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/about/workload-section.tsx
git commit -m "feat: add workload tutorial section with filling grid animation"
```

---

## Task 13: Create Sprint Tutorial Section

**Files:**
- Create: `src/components/about/sprint-section.tsx`

- [ ] **Step 1: Create the sprint section with animating progress bar**

Build a ~300vh wrapper with sticky illustration:
- Sprint card appears with title and date range (scroll 0→0.33)
- Item count ticks up, progress bar fills using `scaleX` transform from 0 to 0.66 (scroll 0.33→0.66). Use `transformOrigin: "left"` so it scales from the left edge.
- Completion badge fades in (scroll 0.66→1)

Include `prefers-reduced-motion` fallback.

- [ ] **Step 2: Verify type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/about/sprint-section.tsx
git commit -m "feat: add sprint tutorial section with progress bar animation"
```

---

## Task 14: Create Settings and CTA Sections

**Files:**
- Create: `src/components/about/settings-section.tsx`
- Create: `src/components/about/cta-section.tsx`

- [ ] **Step 1: Create settings section**

Simple `whileInView` fade + slide-up. Show 3 key-value pairs (Theme, Team, Deadline) in a mini settings card. No sticky scroll.

```tsx
"use client";

import { motion } from "framer-motion";
import { useSectionScroll } from "./use-section-scroll";

export function SettingsSection() {
  const { ref, opacity, y } = useSectionScroll();
  // ... render section with motion.div using opacity and y
}
```

- [ ] **Step 2: Create CTA section**

```tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useSectionScroll } from "./use-section-scroll";

export function CtaSection() {
  const { ref, opacity, y } = useSectionScroll();

  return (
    <section ref={ref} className="py-32 text-center">
      <motion.div style={{ opacity, y }}>
        <Link
          href="/dashboard"
          className="inline-block rounded-lg px-8 py-3 text-base font-semibold transition-colors bg-[var(--accent)] text-[var(--bg-primary)]"
        >
          Get Started →
        </Link>
      </motion.div>
    </section>
  );
}
```

- [ ] **Step 3: Verify type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/about/settings-section.tsx src/components/about/cta-section.tsx
git commit -m "feat: add settings and CTA sections for about page"
```

---

## Task 15: Create About Page Shell

**Files:**
- Create: `src/app/about/page.tsx`

- [ ] **Step 1: Create the page with lazy-loaded sections and loading skeletons**

Each `dynamic()` call includes a `loading` component so direct navigation to `/about` shows placeholders while chunks load.

```tsx
"use client";

import dynamic from "next/dynamic";
import { HeroSection } from "@/components/about/hero-section";

function SectionSkeleton() {
  return <div className="min-h-screen animate-pulse bg-[var(--bg-surface)] rounded-lg mx-6 my-8" />;
}

const BoardSection = dynamic(
  () => import("@/components/about/board-section").then(m => ({ default: m.BoardSection })),
  { loading: () => <SectionSkeleton /> },
);
const GanttSection = dynamic(
  () => import("@/components/about/gantt-section").then(m => ({ default: m.GanttSection })),
  { loading: () => <SectionSkeleton /> },
);
const WorkloadSection = dynamic(
  () => import("@/components/about/workload-section").then(m => ({ default: m.WorkloadSection })),
  { loading: () => <SectionSkeleton /> },
);
const SprintSection = dynamic(
  () => import("@/components/about/sprint-section").then(m => ({ default: m.SprintSection })),
  { loading: () => <SectionSkeleton /> },
);
const SettingsSection = dynamic(
  () => import("@/components/about/settings-section").then(m => ({ default: m.SettingsSection })),
  { loading: () => <SectionSkeleton /> },
);
const CtaSection = dynamic(
  () => import("@/components/about/cta-section").then(m => ({ default: m.CtaSection })),
  { loading: () => <SectionSkeleton /> },
);

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[900px]">
      <HeroSection />
      <BoardSection />
      <GanttSection />
      <WorkloadSection />
      <SprintSection />
      <SettingsSection />
      <CtaSection />
    </div>
  );
}
```

- [ ] **Step 2: Verify type check and test in browser**

```bash
npx tsc --noEmit && npm run dev
```

Navigate to `/about`. Verify all sections render and scroll animations work.

- [ ] **Step 3: Commit**

```bash
git add src/app/about/page.tsx
git commit -m "feat: add about page shell with lazy-loaded tutorial sections"
```

---

## Task 16: Create Welcome Banner

**Files:**
- Create: `src/components/layout/welcome-banner.tsx`
- Modify: `src/app/dashboard/page.tsx:70`

- [ ] **Step 1: Create the welcome banner component**

```tsx
"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/stores/ui-store";

export function WelcomeBanner() {
  const hasSeenWelcome = useUIStore((s) => s.hasSeenWelcome);
  const setHasSeenWelcome = useUIStore((s) => s.setHasSeenWelcome);

  return (
    <AnimatePresence>
      {!hasSeenWelcome && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
          className="relative mb-6 rounded-xl p-5"
          style={{
            background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, transparent), color-mix(in srgb, var(--purple) 10%, transparent))",
            border: "1px solid var(--border)",
          }}
        >
          <button
            onClick={() => setHasSeenWelcome(true)}
            aria-label="Dismiss welcome banner"
            className="absolute right-3 top-3 rounded-md p-1 transition-colors text-[var(--text-secondary)]"
          >
            <X size={16} />
          </button>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Welcome to Cadence!
          </h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            New here?{" "}
            <Link
              href="/about"
              className="font-medium underline text-[var(--accent)]"
            >
              Take a quick tour
            </Link>{" "}
            to see what you can do.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Add banner to dashboard page**

In `src/app/dashboard/page.tsx`, add import:

```tsx
import { WelcomeBanner } from "@/components/layout/welcome-banner";
```

Insert `<WelcomeBanner />` inside the `max-w-4xl` container, before the first card (around line 72, before `SprintProgressCard`).

- [ ] **Step 3: Verify type check and test in dev**

```bash
npx tsc --noEmit && npm run dev
```

Navigate to dashboard. Verify:
- Banner shows on first visit
- Clicking X dismisses it
- Refreshing page — banner stays dismissed (localStorage)
- "Take a quick tour" link goes to `/about`

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/welcome-banner.tsx src/app/dashboard/page.tsx
git commit -m "feat: add welcome banner to dashboard with link to about page"
```

---

## Task 17: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full type check**

```bash
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: PASS

- [ ] **Step 3: Run tests**

```bash
npm run test
```

Expected: All existing tests PASS

- [ ] **Step 4: Run production build**

```bash
npm run build
```

Expected: Static export succeeds with no errors

- [ ] **Step 5: Manual smoke test**

1. Open app, go to dashboard — welcome banner visible
2. Click "Take a quick tour" — navigates to `/about`
3. Scroll through about page — all sections animate
4. Check `prefers-reduced-motion` — animations degrade to fade-in
5. Go to Board, create an item — description has Edit/Preview tabs
6. Type markdown, switch to Preview — renders correctly
7. Check dark mode + light mode — both work
8. Sidebar shows "About" in secondary section

- [ ] **Step 6: Commit any final fixes if needed**
