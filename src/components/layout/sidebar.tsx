"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GanttChart,
  Users,
  Settings,
  PanelLeftClose,
  PanelLeft,
  LogOut,
} from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useAuth } from "@/components/auth/auth-provider";
import { motion } from "framer-motion";

const navItems = [
  { href: "/board", label: "Board", icon: LayoutDashboard },
  { href: "/gantt", label: "Gantt", icon: GanttChart },
  { href: "/workload", label: "Workload", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 64;

export function Sidebar() {
  const pathname = usePathname();
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const { user, signOut } = useAuth();

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      initial={false}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="fixed left-0 top-0 h-full flex flex-col overflow-hidden z-30"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center h-14 px-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {!sidebarCollapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="font-semibold text-sm truncate"
              style={{ color: "var(--text-primary)" }}
            >
              Cadence
            </motion.span>
          )}
        </div>
        <button
          onClick={toggleSidebar}
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-md transition-colors"
          style={{ color: "var(--text-secondary)" }}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          {sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 flex flex-col gap-1 px-2 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              title={sidebarCollapsed ? label : undefined}
              className="flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors relative"
              style={{
                color: isActive ? "var(--accent)" : "var(--text-secondary)",
                backgroundColor: isActive ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }
              }}
            >
              {/* Active left border indicator */}
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r"
                  style={{ backgroundColor: "var(--accent)" }}
                />
              )}
              <Icon size={18} className="shrink-0" />
              {!sidebarCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  className="truncate"
                >
                  {label}
                </motion.span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      {user && (
        <div
          className="shrink-0 px-2 py-3 flex items-center gap-2"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {/* Avatar circle */}
          <div
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)",
              color: "var(--accent)",
            }}
            title={user.email}
          >
            {(user.displayName || user.email || "?").charAt(0).toUpperCase()}
          </div>

          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="flex-1 min-w-0"
            >
              <p
                className="text-sm font-medium truncate leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                {user.displayName || "User"}
              </p>
              <p
                className="text-xs truncate leading-tight"
                style={{ color: "var(--text-tertiary)" }}
              >
                {user.email}
              </p>
            </motion.div>
          )}

          <button
            onClick={signOut}
            title="Sign out"
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-md transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
              e.currentTarget.style.color = "var(--danger)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </motion.aside>
  );
}
