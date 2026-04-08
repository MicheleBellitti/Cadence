"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { GripVertical } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface CardData {
  label: string;
  type: "task" | "story" | "epic";
  assignee?: string;
  priority?: "high" | "medium" | "low";
}

const TYPE_COLORS: Record<string, string> = {
  task: "var(--success)",
  story: "var(--accent)",
  epic: "var(--purple)",
};

const TYPE_LABELS: Record<string, string> = {
  task: "Task",
  story: "Story",
  epic: "Epic",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--accent)",
};

const CARDS: CardData[] = [
  { label: "Set up database", type: "task", assignee: "AL", priority: "high" },
  { label: "User auth flow", type: "story", assignee: "BO", priority: "medium" },
  { label: "Launch MVP", type: "epic", assignee: "CA", priority: "low" },
];

const STEPS = [
  { title: "Create items", description: "Add tasks, stories, and epics to your board in seconds." },
  { title: "Drag to organize", description: "Move cards between columns to reflect your workflow." },
  { title: "Track progress", description: "See what is done at a glance as cards reach the finish line." },
];

/* ------------------------------------------------------------------ */
/*  Mini card component — richer with assignee avatar + priority dot   */
/* ------------------------------------------------------------------ */

function MiniCard({
  card,
  opacity,
  x,
  strikethrough,
  showDragHint,
}: {
  card: CardData;
  opacity: MotionValue<number>;
  x?: MotionValue<number>;
  strikethrough?: MotionValue<number>;
  showDragHint?: MotionValue<number>;
}) {
  return (
    <motion.div
      className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 shadow-sm"
      style={{ opacity, x }}
    >
      {/* Top row: type badge + drag handle */}
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: TYPE_COLORS[card.type] }}
        >
          {TYPE_LABELS[card.type]}
        </span>
        {showDragHint && (
          <motion.div style={{ opacity: showDragHint }}>
            <GripVertical className="h-3 w-3 text-[var(--text-tertiary)]" />
          </motion.div>
        )}
      </div>

      {/* Label with strikethrough */}
      <span className="relative text-sm font-medium text-[var(--text-primary)]">
        {card.label}
        {strikethrough && (
          <motion.span
            className="absolute left-0 top-1/2 h-px w-full bg-[var(--text-secondary)]"
            style={{ scaleX: strikethrough, transformOrigin: "left" }}
          />
        )}
      </span>

      {/* Bottom row: assignee + priority */}
      <div className="flex items-center justify-between">
        {card.assignee && (
          <div
            className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white"
            style={{ backgroundColor: TYPE_COLORS[card.type] }}
          >
            {card.assignee}
          </div>
        )}
        {card.priority && (
          <div className="flex items-center gap-1">
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: PRIORITY_COLORS[card.priority] }}
            />
            <span className="text-[10px] capitalize text-[var(--text-tertiary)]">
              {card.priority}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Static card for reduced-motion fallback */
function StaticCard({
  card,
  showStrike,
}: {
  card: CardData;
  showStrike?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 shadow-sm">
      <span
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: TYPE_COLORS[card.type] }}
      >
        {TYPE_LABELS[card.type]}
      </span>
      <span className="relative text-sm font-medium text-[var(--text-primary)]">
        {card.label}
        {showStrike && (
          <span className="absolute left-0 top-1/2 h-px w-full bg-[var(--text-secondary)]" />
        )}
      </span>
      <div className="flex items-center justify-between">
        {card.assignee && (
          <div
            className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white"
            style={{ backgroundColor: TYPE_COLORS[card.type] }}
          >
            {card.assignee}
          </div>
        )}
        {card.priority && (
          <div className="flex items-center gap-1">
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: PRIORITY_COLORS[card.priority] }}
            />
            <span className="text-[10px] capitalize text-[var(--text-tertiary)]">
              {card.priority}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Column component — wider with count badge                          */
/* ------------------------------------------------------------------ */

function Column({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-44 flex-shrink-0 flex-col gap-2">
      <div className="flex items-center justify-between rounded-lg bg-[var(--bg-surface)] px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {title}
        </span>
        {count !== undefined && count > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--bg-elevated)] px-1 text-[10px] font-medium text-[var(--text-tertiary)]">
            {count}
          </span>
        )}
      </div>
      <div className="flex min-h-[140px] flex-col gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-primary)] p-2">
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step label component                                               */
/* ------------------------------------------------------------------ */

function StepLabel({
  step,
  index,
  opacity,
}: {
  step: { title: string; description: string };
  index: number;
  opacity: MotionValue<number>;
}) {
  return (
    <motion.div className="flex items-start gap-3" style={{ opacity }}>
      <span
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: "var(--accent)" }}
      >
        {index + 1}
      </span>
      <div>
        <p className="text-base font-semibold text-[var(--text-primary)]">{step.title}</p>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{step.description}</p>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main section                                                       */
/* ------------------------------------------------------------------ */

export function BoardSection() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ["start end", "end start"],
  });

  /* ---- Step opacities ---- */
  const step1Opacity = useTransform(scrollYProgress, [0.05, 0.15, 0.28, 0.33], [0, 1, 1, 0]);
  const step2Opacity = useTransform(scrollYProgress, [0.33, 0.4, 0.58, 0.66], [0, 1, 1, 0]);
  const step3Opacity = useTransform(scrollYProgress, [0.66, 0.73, 0.88, 0.95], [0, 1, 1, 0]);

  /* ---- Card animations ---- */
  const card0Opacity = useTransform(scrollYProgress, [0.05, 0.12], [0, 1]);
  const card1Opacity = useTransform(scrollYProgress, [0.1, 0.17], [0, 1]);
  const card2Opacity = useTransform(scrollYProgress, [0.15, 0.22], [0, 1]);

  // Step 2: drag hint appears, card1 fades from TO DO to IN PROGRESS
  const dragHintOpacity = useTransform(scrollYProgress, [0.34, 0.38], [0, 1]);
  const card1InTodo = useTransform(scrollYProgress, [0.40, 0.54], [1, 0]);
  const card1InProgress = useTransform(scrollYProgress, [0.40, 0.54], [0, 1]);

  // Step 3: card0 fades from TO DO to DONE with strikethrough
  const card0InTodo = useTransform(scrollYProgress, [0.7, 0.82], [1, 0]);
  const card0InDone = useTransform(scrollYProgress, [0.7, 0.82], [0, 1]);
  const card0Strike = useTransform(scrollYProgress, [0.82, 0.9], [0, 1]);

  /* ---- Reduced-motion fallback ---- */
  if (prefersReduced) {
    return (
      <section className="px-6 py-32">
        <div className="mx-auto max-w-[900px]">
          <h2 className="mb-4 text-3xl font-bold text-[var(--text-primary)]">
            Your Kanban Board
          </h2>
          <p className="mb-10 max-w-md text-[var(--text-secondary)]">
            Organize work visually with drag-and-drop simplicity.
          </p>
          <motion.div
            className="flex gap-3"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <Column title="To Do" count={1}>
              <StaticCard card={CARDS[2]} />
            </Column>
            <Column title="In Progress" count={1}>
              <StaticCard card={CARDS[1]} />
            </Column>
            <Column title="Done" count={1}>
              <StaticCard card={CARDS[0]} showStrike />
            </Column>
          </motion.div>
        </div>
      </section>
    );
  }

  return (
    <section ref={wrapperRef} className="relative" style={{ height: "300vh" }}>
      <div className="sticky top-0 flex h-screen items-center justify-center px-6">
        <div className="mx-auto flex w-full max-w-[900px] flex-col items-center gap-10 lg:flex-row lg:items-start lg:gap-16">
          {/* Left: step labels */}
          <div className="flex w-full max-w-[340px] flex-col gap-6 lg:pt-8">
            <h2 className="text-3xl font-bold text-[var(--text-primary)]">
              Your Kanban Board
            </h2>
            <div className="flex flex-col gap-5">
              {STEPS.map((step, i) => (
                <StepLabel
                  key={step.title}
                  step={step}
                  index={i}
                  opacity={[step1Opacity, step2Opacity, step3Opacity][i]}
                />
              ))}
            </div>
          </div>

          {/* Right: board illustration */}
          <div className="flex gap-3 will-change-transform">
            {/* TO DO column */}
            <Column title="To Do" count={3}>
              <MiniCard card={CARDS[2]} opacity={card2Opacity} />
              <motion.div style={{ opacity: card1InTodo }}>
                <MiniCard card={CARDS[1]} opacity={card1Opacity} showDragHint={dragHintOpacity} />
              </motion.div>
              <motion.div style={{ opacity: card0InTodo }}>
                <MiniCard card={CARDS[0]} opacity={card0Opacity} />
              </motion.div>
            </Column>

            {/* IN PROGRESS column */}
            <Column title="In Progress">
              <motion.div style={{ opacity: card1InProgress }}>
                <MiniCard card={CARDS[1]} opacity={card1Opacity} />
              </motion.div>
            </Column>

            {/* DONE column */}
            <Column title="Done">
              <motion.div style={{ opacity: card0InDone }}>
                <MiniCard
                  card={CARDS[0]}
                  opacity={card0Opacity}
                  strikethrough={card0Strike}
                />
              </motion.div>
            </Column>
          </div>
        </div>
      </div>
    </section>
  );
}
