"use client";

import { useMemo } from "react";
import { useItems, useActiveSprint } from "@/stores/project-store";
import { computeBurndown } from "@/lib/burndown-utils";
import { formatDate } from "@/lib/date-utils";
import { BurndownChart } from "@/components/dashboard/burndown-chart";

export default function DashboardPage() {
  const items = useItems();
  const activeSprint = useActiveSprint();

  const todayStr = useMemo(() => formatDate(new Date()), []);

  const burndownData = useMemo(() => {
    if (!activeSprint) return null;
    return computeBurndown(activeSprint, items, todayStr);
  }, [activeSprint, items, todayStr]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <BurndownChart
        data={burndownData}
        sprintName={activeSprint?.name}
      />
    </div>
  );
}
