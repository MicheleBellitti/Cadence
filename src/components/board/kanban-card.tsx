"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import type { Item, TeamMember } from "@/types";
import { ITEM_COLORS } from "@/types";
import type { BadgeVariant } from "@/components/ui/badge";

const PRIORITY_BADGE_VARIANT: Record<string, BadgeVariant> = {
  critical: "danger",
  high: "warning",
  medium: "default",
  low: "blue",
};

interface KanbanCardProps {
  item: Item;
  teamMember?: TeamMember;
  onClick: () => void;
}

function KanbanCard({ item, teamMember, onClick }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const typeColor = ITEM_COLORS[item.type];

  function handleClick(e: React.MouseEvent) {
    // Only open detail if this wasn't a drag
    if (!isDragging) {
      onClick();
    }
    e.stopPropagation();
  }

  const initials = teamMember
    ? teamMember.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className="group relative flex rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-3 cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-md transition-all duration-150"
    >
      {/* Left color strip */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
        style={{ backgroundColor: typeColor }}
      />

      <div className="flex flex-col gap-2 min-w-0 pl-2 w-full">
        {/* Title */}
        <span className="text-sm font-medium text-[var(--text-primary)] line-clamp-2">
          {item.title}
        </span>

        {/* Bottom row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={PRIORITY_BADGE_VARIANT[item.priority] ?? "default"}>
            {item.priority}
          </Badge>

          {item.type === "story" && (
            <Badge variant="purple">{item.storyPoints} SP</Badge>
          )}

          {teamMember && initials && (
            <div
              className="flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white shrink-0"
              style={{ backgroundColor: teamMember.color }}
              title={teamMember.name}
            >
              {initials}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { KanbanCard };
export type { KanbanCardProps };
