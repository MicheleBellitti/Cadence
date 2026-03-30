"use client";

import type { ReactNode } from "react";

const ROW_HEIGHT = 48;

interface GanttRowProps {
  index: number;
  children: ReactNode;
}

export function GanttRow({ index, children }: GanttRowProps) {
  return (
    <div
      className={[
        "relative border-b border-[var(--border)]",
        index % 2 === 0 ? "bg-[var(--bg-surface)]" : "bg-[var(--bg-primary)]",
      ].join(" ")}
      style={{ height: ROW_HEIGHT }}
    >
      {children}
    </div>
  );
}

export { ROW_HEIGHT };
