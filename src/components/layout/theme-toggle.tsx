"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import type { Theme } from "@/types";

const THEME_CYCLE: Theme[] = ["light", "dark", "system"];

const THEME_ICONS: Record<Theme, React.ReactNode> = {
  light: <Sun size={16} />,
  dark: <Moon size={16} />,
  system: <Monitor size={16} />,
};

const THEME_LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function ThemeToggle() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  function cycleTheme() {
    const currentIndex = THEME_CYCLE.indexOf(theme);
    const nextIndex = (currentIndex + 1) % THEME_CYCLE.length;
    setTheme(THEME_CYCLE[nextIndex]);
  }

  return (
    <button
      onClick={cycleTheme}
      title={`Theme: ${THEME_LABELS[theme]}`}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors"
      style={{
        color: "var(--text-secondary)",
        backgroundColor: "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
    >
      {THEME_ICONS[theme]}
      <span>{THEME_LABELS[theme]}</span>
    </button>
  );
}
