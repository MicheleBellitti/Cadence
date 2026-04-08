"use client";

import { motion } from "framer-motion";
import { Settings, Moon, Users, CalendarDays } from "lucide-react";
import { useSectionScroll } from "./use-section-scroll";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const SETTINGS_ITEMS = [
  { icon: Moon, label: "Theme", value: "Dark", color: "var(--purple)" },
  { icon: Users, label: "Team", value: "4 members", color: "var(--accent)" },
  { icon: CalendarDays, label: "Deadline", value: "Mar 30", color: "var(--warning)" },
] as const;

/* ------------------------------------------------------------------ */
/*  Main section                                                       */
/* ------------------------------------------------------------------ */

export function SettingsSection() {
  const { ref, opacity, y, scale } = useSectionScroll();

  return (
    <section ref={ref} className="px-6 py-32">
      <motion.div
        className="mx-auto max-w-[900px]"
        style={{ opacity, y, scale }}
      >
        <h2 className="mb-4 text-3xl font-bold text-[var(--text-primary)]">
          Configure Your Way
        </h2>
        <p className="mb-10 max-w-md text-[var(--text-secondary)]">
          Tweak settings to match your team and workflow.
        </p>

        {/* Mini settings card */}
        <div className="inline-block overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg">
          {/* Card header */}
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3">
            <Settings className="h-4 w-4 text-[var(--text-secondary)]" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">Settings</span>
          </div>

          {/* Key-value pairs */}
          <div className="flex flex-col divide-y divide-[var(--border)]">
            {SETTINGS_ITEMS.map(({ icon: Icon, label, value, color }) => (
              <div
                key={label}
                className="flex items-center justify-between gap-12 px-5 py-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
                    }}
                  >
                    <Icon className="h-4 w-4" style={{ color }} />
                  </div>
                  <span className="text-sm text-[var(--text-secondary)]">{label}</span>
                </div>
                <span className="text-sm font-medium text-[var(--text-primary)]">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
