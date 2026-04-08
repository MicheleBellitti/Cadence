"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { CheckCircle, Calendar, Target } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const STEPS = [
  { title: "Plan in sprints", description: "Time-box your work into focused iterations with clear goals." },
  { title: "Assign and track", description: "Watch the progress bar fill as your team completes items." },
  { title: "Ship and iterate", description: "Celebrate milestones and start the next sprint with momentum." },
];

const SPRINT_ITEMS = [
  { label: "User auth flow", done: true },
  { label: "Dashboard layout", done: true },
  { label: "API endpoints", done: true },
  { label: "Write tests", done: false },
  { label: "Deploy staging", done: false },
];

/* ------------------------------------------------------------------ */
/*  Step label                                                         */
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
/*  Sprint card illustration                                           */
/* ------------------------------------------------------------------ */

function SprintCard({
  cardOpacity,
  progressScale,
  badgeOpacity,
}: {
  cardOpacity: MotionValue<number>;
  progressScale: MotionValue<number>;
  badgeOpacity: MotionValue<number>;
}) {
  return (
    <motion.div
      className="w-full max-w-[380px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg will-change-transform"
      style={{ opacity: cardOpacity }}
    >
      {/* Sprint header */}
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-[var(--accent)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Sprint 4</h3>
          </div>
          <motion.div style={{ opacity: badgeOpacity }}>
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: "color-mix(in srgb, var(--success) 15%, transparent)",
                color: "var(--success)",
              }}
            >
              <CheckCircle className="h-3 w-3" />
              Complete
            </span>
          </motion.div>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <Calendar className="h-3 w-3" />
          <span>Mar 18 — Mar 29</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 py-3">
        <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>Progress</span>
          <span>3 / 5 items</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
          <motion.div
            className="h-full rounded-full bg-[var(--accent)]"
            style={{
              scaleX: progressScale,
              transformOrigin: "left",
              width: "60%",
            }}
          />
        </div>
      </div>

      {/* Items list */}
      <div className="border-t border-[var(--border)] px-5 py-3">
        <div className="flex flex-col gap-1.5">
          {SPRINT_ITEMS.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 text-xs"
            >
              <div
                className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border"
                style={{
                  borderColor: item.done ? "var(--success)" : "var(--border)",
                  backgroundColor: item.done
                    ? "color-mix(in srgb, var(--success) 15%, transparent)"
                    : "transparent",
                }}
              >
                {item.done && (
                  <CheckCircle className="h-3 w-3 text-[var(--success)]" />
                )}
              </div>
              <span
                className={
                  item.done
                    ? "text-[var(--text-secondary)] line-through"
                    : "text-[var(--text-primary)]"
                }
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/** Static sprint card for reduced-motion fallback (no hooks needed) */
function StaticSprintCard() {
  return (
    <div className="w-full max-w-[380px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-[var(--accent)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Sprint 4</h3>
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: "color-mix(in srgb, var(--success) 15%, transparent)",
              color: "var(--success)",
            }}
          >
            <CheckCircle className="h-3 w-3" />
            Complete
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <Calendar className="h-3 w-3" />
          <span>Mar 18 &mdash; Mar 29</span>
        </div>
      </div>
      <div className="px-5 py-3">
        <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>Progress</span>
          <span>3 / 5 items</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: "60%" }} />
        </div>
      </div>
      <div className="border-t border-[var(--border)] px-5 py-3">
        <div className="flex flex-col gap-1.5">
          {SPRINT_ITEMS.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              <div
                className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border"
                style={{
                  borderColor: item.done ? "var(--success)" : "var(--border)",
                  backgroundColor: item.done
                    ? "color-mix(in srgb, var(--success) 15%, transparent)"
                    : "transparent",
                }}
              >
                {item.done && <CheckCircle className="h-3 w-3 text-[var(--success)]" />}
              </div>
              <span
                className={
                  item.done
                    ? "text-[var(--text-secondary)] line-through"
                    : "text-[var(--text-primary)]"
                }
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main section                                                       */
/* ------------------------------------------------------------------ */

export function SprintSection() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ["start end", "end start"],
  });

  /* Step opacities */
  const step1Opacity = useTransform(scrollYProgress, [0.05, 0.15, 0.28, 0.33], [0, 1, 1, 0]);
  const step2Opacity = useTransform(scrollYProgress, [0.33, 0.4, 0.58, 0.66], [0, 1, 1, 0]);
  const step3Opacity = useTransform(scrollYProgress, [0.66, 0.73, 0.88, 0.95], [0, 1, 1, 0]);

  /* Animation values */
  const cardOpacity = useTransform(scrollYProgress, [0.05, 0.18], [0, 1]);
  const progressScale = useTransform(scrollYProgress, [0.36, 0.58], [0, 1]);
  const badgeOpacity = useTransform(scrollYProgress, [0.72, 0.84], [0, 1]);

  /* Reduced motion fallback */
  if (prefersReduced) {
    return (
      <section className="px-6 py-32">
        <div className="mx-auto max-w-[900px]">
          <h2 className="mb-4 text-3xl font-bold text-[var(--text-primary)]">
            Sprint Planning
          </h2>
          <p className="mb-10 max-w-md text-[var(--text-secondary)]">
            Time-box your work and ship with confidence.
          </p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <StaticSprintCard />
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
              Sprint Planning
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
          <SprintCard
            cardOpacity={cardOpacity}
            progressScale={progressScale}
            badgeOpacity={badgeOpacity}
          />
        </div>
      </div>
    </section>
  );
}
