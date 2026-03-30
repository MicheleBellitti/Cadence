"use client";
import { Modal } from "@/components/ui/modal";
import { ItemForm } from "./item-form";
import type { ItemType, Status } from "@/types";

interface CreateItemModalProps {
  open: boolean;
  onClose: () => void;
  defaultType?: ItemType;
  defaultStatus?: Status;
  defaultParentId?: string | null;
}

export function CreateItemModal({
  open,
  onClose,
  defaultType = "task",
  defaultStatus = "todo",
  defaultParentId = null,
}: CreateItemModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Create Item" width="max-w-2xl">
      <ItemForm
        defaultType={defaultType}
        defaultParentId={defaultParentId}
        defaultStatus={defaultStatus}
        onSave={onClose}
        onCancel={onClose}
      />
    </Modal>
  );
}
