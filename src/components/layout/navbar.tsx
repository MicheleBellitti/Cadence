"use client";

import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { useUIStore } from "@/stores/ui-store";
import { useProjectStore } from "@/stores/project-store";

const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 64;

const pageTitles: Record<string, string> = {
  "/board": "Kanban Board",
  "/gantt": "Gantt Chart",
  "/workload": "Workload",
  "/settings": "Settings",
};

export function Navbar() {
  const pathname = usePathname();
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const projectName = useProjectStore((s) => s.project.name);

  const sidebarWidth = sidebarCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  // Find the matching page title (exact or prefix match)
  const pageTitle =
    pageTitles[pathname] ??
    Object.entries(pageTitles).find(([key]) => pathname.startsWith(key + "/"))?.[1] ??
    "";

  return (
    <header
      className="fixed top-0 right-0 h-14 z-20 flex items-center px-4 gap-3 transition-all duration-200"
      style={{
        left: sidebarWidth,
        backgroundColor: "color-mix(in srgb, var(--bg-surface) 80%, transparent)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Left: breadcrumb */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {projectName && (
          <>
            <span
              className="text-sm font-medium truncate"
              style={{ color: "var(--text-secondary)" }}
            >
              {projectName}
            </span>
            {pageTitle && (
              <span style={{ color: "var(--border)" }} className="text-sm">
                /
              </span>
            )}
          </>
        )}
        {pageTitle && (
          <span
            className="text-sm font-semibold truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {pageTitle}
          </span>
        )}
      </div>

      {/* Right: theme toggle */}
      <div className="shrink-0">
        <ThemeToggle />
      </div>
    </header>
  );
}
