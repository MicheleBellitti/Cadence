"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { useUIStore } from "@/stores/ui-store";
import { useProjectStore } from "@/stores/project-store";
import { CreateItemModal } from "@/components/items/create-item-modal";

const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 64;

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/board": "Kanban Board",
  "/gantt": "Gantt Chart",
  "/workload": "Workload",
  "/settings": "Settings",
  "/about": "About",
};

export function Navbar() {
  const pathname = usePathname();
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const projectName = useProjectStore((s) => s.project.name);
  const [showCreate, setShowCreate] = useState(false);

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

      {/* Right: create button + notifications + theme toggle */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center justify-center w-7 h-7 rounded-md bg-[var(--accent)] text-white hover:opacity-90 transition-opacity duration-150"
          title="Create item"
          aria-label="Create item"
        >
          <Plus size={16} />
        </button>
        <NotificationBell />
        <ThemeToggle />
      </div>

      <CreateItemModal open={showCreate} onClose={() => setShowCreate(false)} />
    </header>
  );
}
