"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { SprintHeader } from "./sprint-header";
import { SprintCompleteModal } from "./sprint-complete-modal";
import { ItemDetailDrawer } from "@/components/items/item-detail-drawer";
import { Select } from "@/components/ui/select";
import {
  useProjectStore,
  useItems,
  useTeam,
  useActiveSprint,
} from "@/stores/project-store";
import type { Item, Status, ItemType, Priority, TeamMember } from "@/types";
import { STATUSES } from "@/types";

function KanbanBoard() {
  const items = useItems();
  const team = useTeam();
  const activeSprint = useActiveSprint();
  const addItem = useProjectStore((s) => s.addItem);
  const moveItem = useProjectStore((s) => s.moveItem);
  const reorderItem = useProjectStore((s) => s.reorderItem);

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);

  // Drawer state
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Sprint filter state — initialize to active sprint if available
  const [sprintFilter, setSprintFilter] = useState<string | null | "all">(
    () => activeSprint?.id ?? "all"
  );
  const [completeSprintId, setCompleteSprintId] = useState<string | null>(null);

  // Sync filter when active sprint changes (render-phase sync, no useEffect)
  const [prevActiveId, setPrevActiveId] = useState(activeSprint?.id ?? null);
  if ((activeSprint?.id ?? null) !== prevActiveId) {
    setPrevActiveId(activeSprint?.id ?? null);
    if (activeSprint && sprintFilter === "all") {
      setSprintFilter(activeSprint.id);
    }
  }

  // Filter state
  const [filterEpic, setFilterEpic] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  // Build filter options
  const epics = useMemo(
    () => items.filter((i) => i.type === "epic"),
    [items]
  );

  const epicOptions = useMemo(
    () => [
      { value: "", label: "All Epics" },
      ...epics.map((e) => ({ value: e.id, label: e.title })),
    ],
    [epics]
  );

  const assigneeOptions = useMemo(
    () => [
      { value: "", label: "All Assignees" },
      ...team.map((m) => ({ value: m.id, label: m.name })),
    ],
    [team]
  );

  const typeOptions = useMemo(
    () => [
      { value: "", label: "All Types" },
      { value: "epic", label: "Epic" },
      { value: "story", label: "Story" },
      { value: "task", label: "Task" },
      { value: "bug", label: "Bug" },
    ],
    []
  );

  const priorityOptions = useMemo(
    () => [
      { value: "", label: "All Priorities" },
      { value: "critical", label: "Critical" },
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
    ],
    []
  );

  // Apply sprint filter first
  const sprintFilteredItems = useMemo(() => {
    if (sprintFilter === "all") return items;
    if (sprintFilter === null) return items.filter((i) => i.sprintId === null);
    return items.filter((i) => i.sprintId === sprintFilter);
  }, [items, sprintFilter]);

  // Apply filters
  const filteredItems = useMemo(() => {
    return sprintFilteredItems.filter((item) => {
      if (filterEpic && item.parentId !== filterEpic) return false;
      if (filterAssignee && !(item.assigneeIds ?? []).includes(filterAssignee)) return false;
      if (filterType && item.type !== filterType) return false;
      if (filterPriority && item.priority !== filterPriority) return false;
      return true;
    });
  }, [sprintFilteredItems, filterEpic, filterAssignee, filterType, filterPriority]);

  // Group items by status
  const columnItems = useMemo(() => {
    const grouped: Record<Status, Item[]> = {
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
    };
    for (const item of filteredItems) {
      grouped[item.status].push(item);
    }
    // Sort by order within each column
    for (const status of STATUSES) {
      grouped[status].sort((a, b) => a.order - b.order);
    }
    return grouped;
  }, [filteredItems]);

  // Active item for DragOverlay
  const activeItem = useMemo(
    () => (activeId ? items.find((i) => i.id === activeId) ?? null : null),
    [activeId, items]
  );

  const activeTeamMembers = useMemo(
    () => {
      const ids = activeItem?.assigneeIds ?? [];
      return ids.map((id) => team.find((m) => m.id === id)).filter(Boolean) as TeamMember[];
    },
    [activeItem, team]
  );

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // We keep this simple: no temporary reordering during drag.
    // The column highlight via useDroppable isOver provides visual feedback.
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over) return;

      const activeItemId = String(active.id);
      const overId = String(over.id);

      // Determine the target status.
      // If overId is a Status (column droppable), use it directly.
      // Otherwise, the item was dropped on another card; find that card's status.
      let targetStatus: Status | undefined;

      if (STATUSES.includes(overId as Status)) {
        targetStatus = overId as Status;
      } else {
        const overItem = items.find((i) => i.id === overId);
        if (overItem) {
          targetStatus = overItem.status;
        }
      }

      if (!targetStatus) return;

      const currentItem = items.find((i) => i.id === activeItemId);
      if (!currentItem) return;

      if (currentItem.status === targetStatus) {
        // Same column — reorder
        const targetItemId = overId;
        if (targetItemId !== activeItemId && !STATUSES.includes(targetItemId as Status)) {
          const targetItem = items.find((i) => i.id === targetItemId);
          if (targetItem) {
            reorderItem(activeItemId, targetItem.order);
          }
        }
        return;
      }

      // Cross-column: status changed, move the item
      moveItem(activeItemId, targetStatus);
    },
    [items, moveItem, reorderItem]
  );

  // Quick-add handler
  const handleQuickAdd = useCallback(
    (title: string, status: Status, type: ItemType = "task") => {
      type NewItem = Omit<Item, "id" | "createdAt" | "updatedAt" | "order">;
      // Inherit the active sprint when a specific sprint is selected
      const itemSprintId = (sprintFilter && sprintFilter !== "all") ? sprintFilter : null;
      const base = {
        title,
        description: "",
        status,
        priority: "medium" as Priority,
        assigneeIds: [],
        estimatedDays: 1,
        dependencies: [],
        tags: [],
        parentId: null,
        sprintId: itemSprintId,
      };
      if (type === "epic") {
        addItem({ ...base, type: "epic", targetDate: null } as NewItem);
      } else if (type === "story") {
        addItem({ ...base, type: "story", storyPoints: 0, acceptanceCriteria: "" } as NewItem);
      } else if (type === "bug") {
        addItem({ ...base, type: "bug", severity: "medium", stepsToReproduce: "" } as NewItem);
      } else {
        addItem({ ...base, type: "task" } as NewItem);
      }
    },
    [addItem, sprintFilter]
  );

  const handleCardClick = useCallback((itemId: string) => {
    setSelectedItemId(itemId);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setSelectedItemId(null);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-6 py-3 border-b border-[var(--border)] bg-[var(--bg-primary)]">
        <span className="text-sm font-medium text-[var(--text-secondary)] shrink-0">
          Filters:
        </span>
        <Select
          options={epicOptions}
          value={filterEpic}
          onChange={(e) => setFilterEpic(e.target.value)}
          className="max-w-[180px]"
        />
        <Select
          options={assigneeOptions}
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          className="max-w-[180px]"
        />
        <Select
          options={typeOptions}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="max-w-[160px]"
        />
        <Select
          options={priorityOptions}
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="max-w-[160px]"
        />
      </div>

      {/* Sprint header */}
      <SprintHeader
        currentFilter={sprintFilter}
        onFilterChange={setSprintFilter}
        onCompleteSprint={(id) => setCompleteSprintId(id)}
      />

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-6">
        <DndContext
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 min-w-max">
            {STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                items={columnItems[status]}
                team={team}
                onCardClick={handleCardClick}
                onQuickAdd={handleQuickAdd}
              />
            ))}
          </div>

          <DragOverlay>
            {activeItem ? (
              <KanbanCard
                item={activeItem}
                teamMembers={activeTeamMembers}
                onClick={() => {}}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Detail drawer */}
      <ItemDetailDrawer itemId={selectedItemId} onClose={handleDrawerClose} />

      {/* Sprint complete modal */}
      {completeSprintId && (
        <SprintCompleteModal
          open={!!completeSprintId}
          onClose={() => {
            setCompleteSprintId(null);
            // After completing, switch to "all" if the completed sprint was the filter
            if (sprintFilter === completeSprintId) {
              setSprintFilter("all");
            }
          }}
          sprintId={completeSprintId}
        />
      )}
    </div>
  );
}

export { KanbanBoard };
