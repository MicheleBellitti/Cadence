"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { AlertTriangle } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface MemberData {
  name: string;
  initials: string;
  color: string;
  /** Hours per day across 5 days (Mon-Fri) */
  hours: number[];
}

const MEMBERS: MemberData[] = [
  { name: "Alice", initials: "AL", color: "var(--accent)", hours: [6, 4, 8, 3, 5] },
  { name: "Bob", initials: "BO", color: "var(--purple)", hours: [4, 7, 5, 9, 8] },
  { name: "Carol", initials: "CA", color: "var(--success)", hours: [3, 5, 6, 8, 10] },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const MAX_CAPACITY = 8;

const STEPS = [
  { title: "See your team's capacity", description: "A heatmap grid shows daily hours for every member at a glance." },
  { title: "Track daily hours", description: "Cells fill proportionally — taller bars mean heavier days." },
  { title: "Spot overallocation", description: "Red cells and warning icons flag anyone above capacity." },
];

function getCellStatus(hours: number): "normal" | "warning" | "danger" {
  if (hours >= 9) return "danger";
  if (hours >= 7) return "warning";
  return "normal";
}

function getCellBg(status: "normal" | "warning" | "danger"): string {
  switch (status) {
    case "danger":
      return "color-mix(in srgb, var(--danger) 20%, transparent)";
    case "warning":
      return "color-mix(in srgb, var(--warning) 15%, transparent)";
    default:
      return "color-mix(in srgb, var(--accent) 10%, transparent)";
  }
}

function getBarColor(status: "normal" | "warning" | "danger"): string {
  switch (status) {
    case "danger":
      return "var(--danger)";
    case "warning":
      return "var(--warning)";
    default:
      return "var(--accent)";
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
/*  Workload cell — heatmap style with inner capacity bar              */
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
  const barHeight = Math.min((hours / MAX_CAPACITY) * 100, 100);

  return (
    <div className="relative flex h-14 w-16 flex-col items-center justify-end overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]">
      {/* Heatmap background fill (step 2) */}
      <motion.div
        className="absolute inset-0 rounded-lg"
        style={{
          opacity: fillOpacity,
          backgroundColor: getCellBg("normal"),
        }}
      />
      {/* Status-colored background override (step 3) */}
      {status !== "normal" && (
        <motion.div
          className="absolute inset-0 rounded-lg"
          style={{
            opacity: colorOpacity,
            backgroundColor: getCellBg(status),
          }}
        />
      )}

      {/* Capacity bar from bottom */}
      <motion.div
        className="relative z-10 w-full"
        style={{ opacity: fillOpacity }}
      >
        <div
          className="mx-1.5 rounded-t-sm"
          style={{
            height: `${barHeight}%`,
            minHeight: hours > 0 ? 4 : 0,
            backgroundColor: getBarColor(status),
            opacity: 0.6,
          }}
        />
      </motion.div>

      {/* Hour label */}
      <motion.span
        className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[var(--text-primary)]"
        style={{ opacity: fillOpacity }}
      >
        {hours}h
      </motion.span>

      {/* Danger icon (step 3) */}
      {status === "danger" && (
        <motion.div
          className="absolute right-0.5 top-0.5 z-20"
          style={{ opacity: colorOpacity }}
        >
          <AlertTriangle className="h-3 w-3 text-[var(--danger)]" />
        </motion.div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Static cell for reduced-motion                                     */
/* ------------------------------------------------------------------ */

function StaticWorkloadCell({ hours }: { hours: number }) {
  const status = getCellStatus(hours);
  const barHeight = Math.min((hours / MAX_CAPACITY) * 100, 100);

  return (
    <div
      className="relative flex h-14 w-16 flex-col items-center justify-end overflow-hidden rounded-lg border border-[var(--border)]"
      style={{ backgroundColor: getCellBg(status) }}
    >
      <div
        className="mx-1.5 rounded-t-sm"
        style={{
          height: `${barHeight}%`,
          minHeight: hours > 0 ? 4 : 0,
          backgroundColor: getBarColor(status),
          opacity: 0.6,
        }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[var(--text-primary)]">
        {hours}h
      </span>
      {status === "danger" && (
        <div className="absolute right-0.5 top-0.5">
          <AlertTriangle className="h-3 w-3 text-[var(--danger)]" />
        </div>
      )}
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
  const gridAppear = useTransform(scrollYProgress, [0.05, 0.2], [0, 1]);
  const cellFill = useTransform(scrollYProgress, [0.36, 0.55], [0, 1]);
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
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <WorkloadGrid
              members={MEMBERS}
              renderCell={(hours) => <StaticWorkloadCell hours={hours} />}
            />
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

          {/* Right: heatmap illustration */}
          <motion.div
            className="will-change-transform"
            style={{ opacity: gridAppear }}
          >
            <WorkloadGrid
              members={MEMBERS}
              renderCell={(hours) => (
                <WorkloadCell
                  hours={hours}
                  fillOpacity={cellFill}
                  colorOpacity={overallocationColor}
                />
              )}
            />

            {/* Capacity legend */}
            <motion.div
              className="mt-3 flex items-center justify-center gap-4 text-[10px] text-[var(--text-tertiary)]"
              style={{ opacity: overallocationColor }}
            >
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: "var(--accent)", opacity: 0.6 }} />
                Normal
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: "var(--warning)", opacity: 0.6 }} />
                Heavy
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: "var(--danger)", opacity: 0.6 }} />
                Over capacity
              </span>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared grid layout                                                 */
/* ------------------------------------------------------------------ */

function WorkloadGrid({
  members,
  renderCell,
}: {
  members: MemberData[];
  renderCell: (hours: number) => React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-lg">
      {/* Day headers */}
      <div className="mb-2 flex gap-2">
        <div className="w-24" />
        {DAYS.map((day) => (
          <div key={day} className="flex w-16 justify-center text-xs font-medium text-[var(--text-secondary)]">
            {day}
          </div>
        ))}
      </div>

      {/* Member rows */}
      {members.map((member) => (
        <div key={member.name} className="mt-2 flex items-center gap-2">
          <div className="flex w-24 items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: member.color }}
            >
              {member.initials}
            </div>
            <span className="text-xs font-medium text-[var(--text-primary)]">
              {member.name}
            </span>
          </div>
          {member.hours.map((h, dayIdx) => (
            <div key={dayIdx}>
              {renderCell(h)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
