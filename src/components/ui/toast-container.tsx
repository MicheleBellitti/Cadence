"use client";

import { useToastStore } from "@/stores/toast-store";
import { X, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const icons = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

const colors = {
  error: {
    bg: "var(--bg-surface)",
    border: "var(--danger)",
    icon: "var(--danger)",
  },
  success: {
    bg: "var(--bg-surface)",
    border: "var(--success)",
    icon: "var(--success)",
  },
  info: {
    bg: "var(--bg-surface)",
    border: "var(--accent)",
    icon: "var(--accent)",
  },
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismissToast);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const Icon = icons[toast.type];
          const color = colors[toast.type];

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg"
              style={{
                backgroundColor: color.bg,
                borderColor: color.border,
              }}
            >
              <Icon
                size={18}
                className="shrink-0 mt-0.5"
                style={{ color: color.icon }}
              />
              <p
                className="text-sm flex-1"
                style={{ color: "var(--text-primary)" }}
              >
                {toast.message}
              </p>
              <button
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded p-0.5 transition-colors"
                style={{ color: "var(--text-tertiary)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-tertiary)";
                }}
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
