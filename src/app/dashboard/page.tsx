"use client";

import { useMemo, useState, useCallback } from "react";
import { useItems, useTeam, useOverrides, useSprints, useActiveSprint } from "@/stores/project-store";
import { useAuth } from "@/components/auth/auth-provider";
import { scheduleForward } from "@/lib/scheduler";
import { computeCriticalPath } from "@/lib/critical-path";
import {
  computeSprintProgress,
  getMyTasks,
  getAtRiskItems,
  getTodayStr,
} from "@/lib/dashboard-utils";
import { useProjectStore } from "@/stores/project-store";
import { SprintProgressCard } from "@/components/dashboard/sprint-progress-card";
import { MyTasksCard } from "@/components/dashboard/my-tasks-card";
import { AtRiskCard } from "@/components/dashboard/at-risk-card";
import { ItemDetailDrawer } from "@/components/items/item-detail-drawer";

export default function DashboardPage() {
  const items = useItems();
  const team = useTeam();
  const overrides = useOverrides();
  const activeSprint = useActiveSprint();
  const { user } = useAuth();
  const deadline = useProjectStore((s) => s.project.deadline);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const todayStr = useMemo(() => getTodayStr(), []);

  // Scheduling is DERIVED state — computed, never stored.
  const scheduled = useMemo(() => {
    if (items.length === 0) return [];
    const forward = scheduleForward(items, overrides, todayStr);
    return computeCriticalPath(items, forward, deadline);
  }, [items, overrides, todayStr, deadline]);

  const sprintProgress = useMemo(() => {
    if (!activeSprint) return null;
    return computeSprintProgress(activeSprint, items, todayStr);
  }, [activeSprint, items, todayStr]);

  const myTasks = useMemo(() => {
    if (!user) return [];
    return getMyTasks(items, team, user.uid);
  }, [items, team, user]);

  const atRiskItems = useMemo(() => {
    return getAtRiskItems(items, scheduled, todayStr);
  }, [items, scheduled, todayStr]);



  const handleItemClick = useCallback((id: string) => {
    setSelectedItemId(id);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setSelectedItemId(null);
  }, []);

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* Sprint progress — full width at top */}
        <SprintProgressCard progress={sprintProgress} />

        {/* Two-column: My Tasks + At Risk */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <MyTasksCard
            tasks={myTasks}
            onItemClick={handleItemClick}
          />
          <AtRiskCard
            items={atRiskItems}
            onItemClick={handleItemClick}
          />
        </div>
      </div>

      {/* Item detail drawer — click any item to open */}
      <ItemDetailDrawer
        itemId={selectedItemId}
        onClose={handleCloseDrawer}
      />
    </>
  );
}
