"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom";
}

function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  const isTop = side === "top";

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            role="tooltip"
            className={[
              "absolute z-50 px-2 py-1 text-xs font-medium rounded whitespace-nowrap pointer-events-none",
              "bg-[var(--text-primary)] text-[var(--bg-primary)]",
              "left-1/2 -translate-x-1/2",
              isTop ? "bottom-full mb-1.5" : "top-full mt-1.5",
            ].join(" ")}
            initial={{ opacity: 0, y: isTop ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: isTop ? 4 : -4 }}
            transition={{ duration: 0.15 }}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { Tooltip };
export type { TooltipProps };
