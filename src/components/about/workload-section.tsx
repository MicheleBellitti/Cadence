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

interface MemberData {
  name: string;
  color: string;
  /** Hours per day across 5 days (Mon-Fri) */
  hours: number[];
}

const MEMBERS: MemberData[] = [
  { name: "Alice", color: "var(--accent)", hours: [6, 4, 8, 3, 5] },
  { name: "Bob", color: "var(--purple)", hours: [4, 7, 5, 9, 8] },
  { name: "Carol", color: "var(--success)", hours: [3, 5, 6, 8, 10] },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const STEPS = [
  { title: "See your team's capacity", description: "A clear grid shows who is available and when." },
  { title: "Track daily hours", description: "Cells fill to reflect how loaded each person is." },
  { title: "Spot overallocation", description: "Red cells warn you before anyone gets overwhelmed." },
];

function getCellStatus(hours: number): "normal" | "warning" | "danger" {
  if (hours >= 9) return "danger";
  if (hours >= 7) return "warning";
  return "normal";
}

function getCellColor(status: "normal" | "warning" | "danger"): string {
  switch (status) {
    case "danger":
      return "color-mix(in srgb, var(--danger) 25%, transparent)";
    case "warning":
      return "color-mix(in srgb, var(--warning) 20%, transparent)";
    default:
      return "color-mix(in srgb, var(--success) 15%, transparent)";
  }
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
        style={{ backgroundColor: "var(--success)" }}
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
/*  Workload cell                                                      */
/* ------------------------------------------------------------------ */

function WorkloadCell({
  hours,
  fillOpacity,
  colorOpacity,
}: {
  hours: number;
  fillOpacity: MotionValue<number>;
  colorOpacity: MotionValue<number>;
}) {
  const status = getCellStatus(hours);
  const normalBg = getCellColor("normal");
  const finalBg = getCellColor(status);

  return (
    <div className="relative flex h-10 w-14 items-center justify-center rounded border border-[var(--border)]">
      {/* Green fill (step 2) */}
      <motion.div
        className="absolute inset-0 rounded"
        style={{
          opacity: fillOpacity,
          backgroundColor: normalBg,
        }}
      />
      {/* Warning/danger override (step 3) */}
      {status !== "normal" && (
        <motion.div
          className="absolute inset-0 rounded"
          style={{
            opacity: colorOpacity,
            backgroundColor: finalBg,
          }}
        />
      )}
      {/* Hour label */}
      <motion.span
        className="relative z-10 text-xs font-medium text-[var(--text-primary)]"
        style={{ opacity: fillOpacity }}
      >
        {hours}h
      </motion.span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main section                                                       */
/* ------------------------------------------------------------------ */

export function WorkloadSection() {
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
  // Step 1: grid structure appears
  const gridAppear = useTransform(scrollYProgress, [0.05, 0.2], [0, 1]);
  // Step 2: cells fill green
  const cellFill = useTransform(scrollYProgress, [0.36, 0.55], [0, 1]);
  // Step 3: overallocated cells turn warning/danger
  const overallocationColor = useTransform(scrollYProgress, [0.7, 0.85], [0, 1]);

  /* Reduced motion fallback */
  if (prefersReduced) {
    return (
      <section className="px-6 py-32">
        <div className="mx-auto max-w-[900px]">
          <h2 className="mb-4 text-3xl font-bold text-[var(--text-primary)]">
            Workload Management
          </h2>
          <p className="mb-10 max-w-md text-[var(--text-secondary)]">
            Balance your team&apos;s workload and prevent burnout.
          </p>
          <motion.div
            className="inline-block"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex gap-1">
              <div className="w-20" />
              {DAYS.map((day) => (
                <div key={day} className="flex w-14 justify-center text-xs text-[var(--text-secondary)]">
                  {day}
                </div>
              ))}
            </div>
            {MEMBERS.map((member) => (
              <div key={member.name} className="mt-1 flex items-center gap-1">
                <div className="flex w-20 items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: member.color }} />
                  <span className="text-xs font-medium text-[var(--text-primary)]">{member.name}</span>
                </div>
                {member.hours.map((h, i) => (
                  <div
                    key={i}
                    className="flex h-10 w-14 items-center justify-center rounded border border-[var(--border)]"
                    style={{ backgroundColor: getCellColor(getCellStatus(h)) }}
                  >
                    <span className="text-xs font-medium text-[var(--text-primary)]">{h}h</span>
                  </div>
                ))}
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
              Workload Management
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
          <motion.div
            className="will-change-transform"
            style={{ opacity: gridAppear }}
          >
            {/* Day headers */}
            <div className="mb-1 flex gap-1">
              <div className="w-20" />
              {DAYS.map((day) => (
                <div key={day} className="flex w-14 justify-center text-xs text-[var(--text-secondary)]">
                  {day}
                </div>
              ))}
            </div>

            {/* Member rows */}
            {MEMBERS.map((member) => (
              <div key={member.name} className="mt-1 flex items-center gap-1">
                <div className="flex w-20 items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: member.color }}
                  />
                  <span className="text-xs font-medium text-[var(--text-primary)]">
                    {member.name}
                  </span>
                </div>
                {member.hours.map((h, dayIdx) => (
                  <WorkloadCell
                    key={dayIdx}
                    hours={h}
                    fillOpacity={cellFill}
                    colorOpacity={overallocationColor}
                  />
                ))}
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
