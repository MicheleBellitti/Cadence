import { create } from "zustand";
import type { ZoomLevel } from "@/types";

interface GanttState {
  zoomLevel: ZoomLevel;
  scrollPosition: { x: number; y: number };
  selectedItemId: string | null;
  collapsedEpicIds: Set<string>;

  setZoomLevel: (level: ZoomLevel) => void;
  setScrollPosition: (pos: { x: number; y: number }) => void;
  setSelectedItemId: (id: string | null) => void;
  toggleEpicCollapse: (epicId: string) => void;
}

export const useGanttStore = create<GanttState>()((set) => ({
  zoomLevel: "week",
  scrollPosition: { x: 0, y: 0 },
  selectedItemId: null,
  collapsedEpicIds: new Set<string>(),

  setZoomLevel: (level) => set({ zoomLevel: level }),

  setScrollPosition: (pos) => set({ scrollPosition: pos }),

  setSelectedItemId: (id) => set({ selectedItemId: id }),

  toggleEpicCollapse: (epicId) =>
    set((state) => {
      const next = new Set(state.collapsedEpicIds);
      if (next.has(epicId)) {
        next.delete(epicId);
      } else {
        next.add(epicId);
      }
      return { collapsedEpicIds: next };
    }),
}));
