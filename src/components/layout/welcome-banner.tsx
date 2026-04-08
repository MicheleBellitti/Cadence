"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/stores/ui-store";

export function WelcomeBanner() {
  const hasSeenWelcome = useUIStore((s) => s.hasSeenWelcome);
  const setHasSeenWelcome = useUIStore((s) => s.setHasSeenWelcome);

  return (
    <AnimatePresence>
      {!hasSeenWelcome && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
          className="relative mb-6 rounded-xl p-5 border border-[var(--border)]"
          style={{
            background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, transparent), color-mix(in srgb, var(--purple) 10%, transparent))",
          }}
        >
          <button
            onClick={() => setHasSeenWelcome(true)}
            aria-label="Dismiss welcome banner"
            className="absolute right-3 top-3 rounded-md p-1 transition-colors text-[var(--text-secondary)]"
          >
            <X size={16} />
          </button>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Welcome to Cadence!
          </h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            New here?{" "}
            <Link
              href="/about"
              className="font-medium underline text-[var(--accent)]"
            >
              Take a quick tour
            </Link>{" "}
            to see what you can do.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
