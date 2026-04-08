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

interface BarData {
  label: string;
  type: "epic" | "task" | "story" | "bug";
  width: number; // percentage of max
  offsetLeft: number; // percentage offset
  critical?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  epic: "var(--purple)",
  task: "var(--success)",
  story: "var(--accent)",
  bug: "var(--danger)",
};

const BARS: BarData[] = [
  { label: "Research & plan", type: "epic", width: 55, offsetLeft: 0, critical: true },
  { label: "Design system", type: "story", width: 35, offsetLeft: 10 },
  { label: "API layer", type: "task", width: 40, offsetLeft: 30, critical: true },
  { label: "Fix auth bug", type: "bug", width: 20, offsetLeft: 50 },
  { label: "Launch prep", type: "task", width: 25, offsetLeft: 60, critical: true },
];

const STEPS = [
  { title: "Visualize your timeline", description: "See every item laid out across time with color-coded bars." },
  { title: "See dependencies", description: "Arrows show which items block others so nothing slips." },
  { title: "Spot the critical path", description: "Purple glow highlights the longest chain that sets your deadline." },
];

/* ------------------------------------------------------------------ */
/*  Timeline bar                                                       */
/* ------------------------------------------------------------------ */

function GanttBarRow({
  bar,
  index,
  slideIn,
  criticalGlow,
  nonCriticalFade,
}: {
  bar: BarData;
  index: number;
  slideIn: MotionValue<number>;
  criticalGlow: MotionValue<number>;
  nonCriticalFade: MotionValue<number>;
}) {
  const barX = useTransform(slideIn, [0, 1], [-120 - index * 30, 0]);
  const barOpacity = useTransform(slideIn, [0, 1], [0, 1]);
  // Always call hooks unconditionally, then select based on critical status
  const zeroOpacity = useTransform(criticalGlow, () => 0);
  const fullOpacity = useTransform(nonCriticalFade, () => 1);
  const glowOpacity = bar.critical ? criticalGlow : zeroOpacity;
  const dimOpacity = bar.critical ? fullOpacity : nonCriticalFade;

  return (
    <motion.div
      className="flex items-center gap-3"
      style={{ opacity: barOpacity, x: barX }}
    >
      {/* Label */}
      <span className="w-28 flex-shrink-0 truncate text-right text-xs text-[var(--text-secondary)]">
        {bar.label}
      </span>
      {/* Track */}
      <div className="relative h-7 flex-1 rounded bg-[var(--bg-surface)]">
        <motion.div
          className="absolute top-0 flex h-full items-center rounded"
          style={{
            left: `${bar.offsetLeft}%`,
            width: `${bar.width}%`,
            opacity: dimOpacity,
          }}
        >
          {/* Type stripe */}
          <div
            className="h-full w-1 flex-shrink-0 rounded-l"
            style={{ backgroundColor: TYPE_COLORS[bar.type] }}
          />
          {/* Bar body */}
          <div className="relative h-full flex-1 rounded-r bg-[var(--bg-elevated)]">
            {/* Critical path glow */}
            {bar.critical && (
              <motion.div
                className="absolute inset-0 rounded-r"
                style={{
                  opacity: glowOpacity,
                  boxShadow: `0 0 12px 2px color-mix(in srgb, var(--purple) 50%, transparent),
                              inset 0 0 6px color-mix(in srgb, var(--purple) 20%, transparent)`,
                }}
              />
            )}
            <span className="relative z-10 flex h-full items-center px-2 text-[10px] font-medium text-[var(--text-primary)]">
              {bar.label}
            </span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dependency arrow SVG                                               */
/* ------------------------------------------------------------------ */

function DependencyArrow({
  pathLength,
}: {
  pathLength: MotionValue<number>;
}) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 400 200"
      fill="none"
      preserveAspectRatio="none"
    >
      {/* Arrow from bar 0 end to bar 2 start */}
      <motion.path
        d="M 240 28 C 270 28, 270 88, 170 88"
        stroke="var(--text-secondary)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        fill="none"
        style={{ pathLength }}
        strokeOpacity={0.6}
      />
      {/* Arrowhead */}
      <motion.polygon
        points="170,84 170,92 162,88"
        fill="var(--text-secondary)"
        style={{ opacity: pathLength }}
        fillOpacity={0.6}
      />
      {/* Arrow from bar 2 end to bar 4 start */}
      <motion.path
        d="M 310 88 C 340 88, 340 168, 280 168"
        stroke="var(--text-secondary)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        fill="none"
        style={{ pathLength }}
        strokeOpacity={0.6}
      />
      <motion.polygon
        points="280,164 280,172 272,168"
        fill="var(--text-secondary)"
        style={{ opacity: pathLength }}
        fillOpacity={0.6}
      />
    </svg>
  );
}

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
        style={{ backgroundColor: "var(--purple)" }}
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

export function GanttSection() {
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
  // Step 1: bars slide in
  const slideIn = useTransform(scrollYProgress, [0.05, 0.28], [0, 1]);
  // Step 2: dependency arrows draw
  const arrowPath = useTransform(scrollYProgress, [0.36, 0.58], [0, 1]);
  // Step 3: critical glow + non-critical fade
  const criticalGlow = useTransform(scrollYProgress, [0.7, 0.82], [0, 1]);
  const nonCriticalFade = useTransform(scrollYProgress, [0.7, 0.82], [1, 0.35]);

  /* Reduced motion fallback */
  if (prefersReduced) {
    return (
      <section className="px-6 py-32">
        <div className="mx-auto max-w-[900px]">
          <h2 className="mb-4 text-3xl font-bold text-[var(--text-primary)]">
            Interactive Gantt Chart
          </h2>
          <p className="mb-10 max-w-md text-[var(--text-secondary)]">
            See your project timeline, dependencies, and critical path at a glance.
          </p>
          <motion.div
            className="flex flex-col gap-2"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            {BARS.map((bar) => (
              <div key={bar.label} className="flex items-center gap-3">
                <span className="w-28 flex-shrink-0 truncate text-right text-xs text-[var(--text-secondary)]">
                  {bar.label}
                </span>
                <div className="relative h-7 flex-1 rounded bg-[var(--bg-surface)]">
                  <div
                    className="absolute top-0 flex h-full items-center rounded"
                    style={{
                      left: `${bar.offsetLeft}%`,
                      width: `${bar.width}%`,
                    }}
                  >
                    <div
                      className="h-full w-1 flex-shrink-0 rounded-l"
                      style={{ backgroundColor: TYPE_COLORS[bar.type] }}
                    />
                    <div className="h-full flex-1 rounded-r bg-[var(--bg-elevated)]">
                      <span className="flex h-full items-center px-2 text-[10px] font-medium text-[var(--text-primary)]">
                        {bar.label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
              Interactive Gantt Chart
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
          <div className="relative flex w-full max-w-[460px] flex-col gap-2 will-change-transform">
            {/* Timeline header */}
            <div className="mb-1 flex gap-3">
              <span className="w-28 flex-shrink-0" />
              <div className="flex flex-1 justify-between text-[10px] text-[var(--text-secondary)]">
                <span>Mon</span>
                <span>Wed</span>
                <span>Fri</span>
                <span>Mon</span>
                <span>Wed</span>
              </div>
            </div>

            {/* Bars */}
            {BARS.map((bar, i) => (
              <GanttBarRow
                key={bar.label}
                bar={bar}
                index={i}
                slideIn={slideIn}
                criticalGlow={criticalGlow}
                nonCriticalFade={nonCriticalFade}
              />
            ))}

            {/* Dependency arrows */}
            <DependencyArrow pathLength={arrowPath} />
          </div>
        </div>
      </div>
    </section>
  );
}
