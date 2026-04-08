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
  () => import("@/components/about/cta-section").then(m => ({ default: m.CTASection })),
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
