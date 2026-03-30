"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { ItemForm } from "./item-form";
import { Button } from "@/components/ui/button";
import { useProjectStore, useItemById } from "@/stores/project-store";
import { ITEM_COLORS } from "@/types";

interface ItemDetailDrawerProps {
  itemId: string | null;
  onClose: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  epic: "⬡",
  story: "◈",
  task: "◻",
  bug: "⬤",
};

const TYPE_LABELS: Record<string, string> = {
  epic: "Epic",
  story: "Story",
  task: "Task",
  bug: "Bug",
};

function DrawerContent({
  itemId,
  onClose,
}: {
  itemId: string;
  onClose: () => void;
}) {
  const item = useItemById(itemId);

  if (!item) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
        Item not found.
      </div>
    );
  }

  const itemColor = ITEM_COLORS[item.type];

  function handleDelete() {
    const confirmed = window.confirm(
      "Delete this item? This cannot be undone."
    );
    if (confirmed) {
      useProjectStore.getState().deleteItem(itemId);
      onClose();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)] shrink-0">
        <span
          className="text-base font-bold select-none"
          style={{ color: itemColor }}
          aria-label={TYPE_LABELS[item.type]}
        >
          {TYPE_ICONS[item.type]}
        </span>
        <h2
          className="flex-1 min-w-0 text-base font-semibold text-[var(--text-primary)] truncate"
          title={item.title}
        >
          {item.title}
        </h2>
        <button
          onClick={onClose}
          className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors duration-150 shrink-0"
          aria-label="Close drawer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <ItemForm item={item} onSave={onClose} onCancel={onClose} />
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[var(--border)] shrink-0">
        <Button variant="danger" size="sm" onClick={handleDelete}>
          Delete Item
        </Button>
      </div>
    </div>
  );
}

export function ItemDetailDrawer({ itemId, onClose }: ItemDetailDrawerProps) {
  const isOpen = itemId !== null;

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <motion.div
            className="fixed top-0 right-0 h-full z-50 bg-[var(--bg-surface)] border-l border-[var(--border)] shadow-2xl"
            style={{ width: 480 }}
            initial={{ x: 480 }}
            animate={{ x: 0 }}
            exit={{ x: 480 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            aria-modal="true"
            role="dialog"
          >
            {itemId && (
              <DrawerContent itemId={itemId} onClose={onClose} />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
