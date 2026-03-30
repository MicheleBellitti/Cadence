"use client";

import { useUIStore } from "@/stores/ui-store";

const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 64;

export function MainContent({ children }: { children: React.ReactNode }) {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const marginLeft = sidebarCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  return (
    <main
      className="min-h-screen pt-14 transition-all duration-200"
      style={{ marginLeft }}
    >
      {children}
    </main>
  );
}
