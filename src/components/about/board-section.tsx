"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface CardData {
  label: string;
  type: "task" | "story" | "epic";
}

const TYPE_COLORS: Record<string, string> = {
  task: "var(--success)",
  story: "var(--accent)",
  epic: "var(--purple)",
};

const CARDS: CardData[] = [
  { label: "Set up database", type: "task" },
  { label: "User auth flow", type: "story" },
  { label: "Launch MVP", type: "epic" },
];

const STEPS = [
  { title: "Create items", description: "Add tasks, stories, and epics to your board in seconds." },
  { title: "Drag to organize", description: "Move cards between columns to reflect your workflow." },
  { title: "Track progress", description: "See what is done at a glance as cards reach the finish line." },
];

/* ------------------------------------------------------------------ */
/*  Mini card component                                                */
/* ------------------------------------------------------------------ */

function MiniCard({
  card,
  opacity,
  x,
  strikethrough,
}: {
  card: CardData;
  opacity: MotionValue<number>;
  x?: MotionValue<number>;
  strikethrough?: MotionValue<number>;
}) {
  return (
    <motion.div
      className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 shadow-sm"
      style={{ opacity, x }}
    >
      {/* Type-color stripe */}
      <div
        className="h-6 w-1 flex-shrink-0 rounded-full"
        style={{ backgroundColor: TYPE_COLORS[card.type] }}
      />
      <span className="relative text-sm font-medium text-[var(--text-primary)]">
        {card.label}
        {/* Strikethrough line */}
        {strikethrough && (
          <motion.span
            className="absolute left-0 top-1/2 h-px w-full bg-[var(--text-secondary)]"
            style={{ scaleX: strikethrough, transformOrigin: "left" }}
          />
        )}
      </span>
    </motion.div>
  );
}

/** Static card for reduced-motion fallback (no hooks needed) */
function StaticCard({
  card,
  showStrike,
}: {
  card: CardData;
  showStrike?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 shadow-sm">
      <div
        className="h-6 w-1 flex-shrink-0 rounded-full"
        style={{ backgroundColor: TYPE_COLORS[card.type] }}
      />
      <span className="relative text-sm font-medium text-[var(--text-primary)]">
        {card.label}
        {showStrike && (
          <span className="absolute left-0 top-1/2 h-px w-full bg-[var(--text-secondary)]" />
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Column component                                                   */
/* ------------------------------------------------------------------ */

function Column({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-36 flex-shrink-0 flex-col gap-2">
      <div className="rounded-md bg-[var(--bg-surface)] px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        {title}
      </div>
      <div className="flex min-h-[120px] flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-2">
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
    <motion.div
      className="flex items-start gap-3"
      style={{ opacity }}
    >
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
  // Step 1: cards fade into TO DO column
  const card0Opacity = useTransform(scrollYProgress, [0.05, 0.12], [0, 1]);
  const card1Opacity = useTransform(scrollYProgress, [0.1, 0.17], [0, 1]);
  const card2Opacity = useTransform(scrollYProgress, [0.15, 0.22], [0, 1]);

  // Step 2: card1 (User auth flow) moves from TO DO to IN PROGRESS
  const card1X = useTransform(scrollYProgress, [0.36, 0.5], [0, 152]);
  const card1InTodo = useTransform(scrollYProgress, [0.36, 0.5], [1, 0]);
  const card1InProgress = useTransform(scrollYProgress, [0.36, 0.5], [0, 1]);

  // Step 3: card0 (Set up database) moves to DONE with strikethrough
  const card0X = useTransform(scrollYProgress, [0.7, 0.82], [0, 304]);
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
            className="flex gap-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <Column title="To Do">
              <StaticCard card={CARDS[2]} />
            </Column>
            <Column title="In Progress">
              <StaticCard card={CARDS[1]} />
            </Column>
            <Column title="Done">
              <StaticCard card={CARDS[0]} showStrike />
            </Column>
          </motion.div>
        </div>
      </section>
    );
  }

  return (
    <section ref={wrapperRef} className="relative" style={{ height: "300vh" }}>
      {/* Sticky container */}
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

          {/* Right: illustration */}
          <div className="flex gap-3 will-change-transform">
            {/* TO DO column */}
            <Column title="To Do">
              {/* Card 2 (Epic) stays in To Do */}
              <MiniCard card={CARDS[2]} opacity={card2Opacity} />
              {/* Card 1 starts here, fades out when moving */}
              <motion.div style={{ opacity: card1InTodo }}>
                <MiniCard card={CARDS[1]} opacity={card1Opacity} />
              </motion.div>
              {/* Card 0 starts here, fades out when moving */}
              <motion.div style={{ opacity: card0InTodo }}>
                <MiniCard card={CARDS[0]} opacity={card0Opacity} />
              </motion.div>
            </Column>

            {/* IN PROGRESS column */}
            <Column title="In Progress">
              <motion.div style={{ opacity: card1InProgress }}>
                <MiniCard card={CARDS[1]} opacity={card1Opacity} x={card1X} />
              </motion.div>
            </Column>

            {/* DONE column */}
            <Column title="Done">
              <motion.div style={{ opacity: card0InDone }}>
                <MiniCard
                  card={CARDS[0]}
                  opacity={card0Opacity}
                  x={card0X}
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
