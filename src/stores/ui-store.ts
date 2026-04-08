import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Theme } from "@/types";

interface UIState {
  theme: Theme;
  sidebarCollapsed: boolean;
  activeModal: string | null;
  hasSeenWelcome: boolean;

  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;
  setHasSeenWelcome: (seen: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "system",
      sidebarCollapsed: false,
      activeModal: null,
      hasSeenWelcome: false,

      setTheme: (theme) => set({ theme }),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      openModal: (modalId) => set({ activeModal: modalId }),

      closeModal: () => set({ activeModal: null }),

      setHasSeenWelcome: (seen) => set({ hasSeenWelcome: seen }),
    }),
    {
      name: "cadence-ui",
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        hasSeenWelcome: state.hasSeenWelcome,
      }),
    }
  )
);
