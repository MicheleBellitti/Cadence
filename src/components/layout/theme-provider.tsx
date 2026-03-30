"use client";

import { useEffect } from "react";
import { useUIStore } from "@/stores/ui-store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;

    function applyTheme(dark: boolean) {
      if (dark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      applyTheme(mq.matches);
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }

    applyTheme(theme === "dark");
  }, [theme]);

  return <>{children}</>;
}
