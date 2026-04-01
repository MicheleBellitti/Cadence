import { create } from "zustand";

export interface Toast {
  id: string;
  type: "error" | "success" | "info";
  message: string;
  /** Auto-dismiss after ms. 0 = manual dismiss only. Default: 5000 */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${++counter}`;
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));

    if (toast.duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, toast.duration);
    }
  },

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

/** Convenience: call from anywhere (store actions, lib functions, etc.) */
export function showErrorToast(message: string): void {
  useToastStore.getState().addToast({ type: "error", message, duration: 6000 });
}

export function showSuccessToast(message: string): void {
  useToastStore.getState().addToast({ type: "success", message, duration: 3000 });
}
