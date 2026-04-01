"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useProjectStore } from "@/stores/project-store";

export function ProjectSync({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const initSync = useProjectStore((s) => s.initializeSync);
  const loading = useProjectStore((s) => s.loading);
  const projectId = user?.projectId;

  useEffect(() => {
    if (!projectId) return;
    const unsubscribes = initSync(projectId);
    return () => unsubscribes.forEach((unsub) => unsub());
  }, [projectId, initSync]);

  if (!projectId) return null; // "No Project" screen handled by AuthGate

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-secondary)]">Loading project...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
