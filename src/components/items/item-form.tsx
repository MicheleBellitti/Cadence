"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProjectStore, useTeam, useSprints } from "@/stores/project-store";
import type { Item, ItemType, Status, Priority, Severity } from "@/types";
import { STATUSES, STATUS_LABELS } from "@/types";

interface ItemFormProps {
  item?: Item;
  defaultType?: ItemType;
  defaultStatus?: Status;
  defaultParentId?: string | null;
  onSave: () => void;
  onCancel: () => void;
}

const ITEM_TYPES: ItemType[] = ["epic", "story", "task", "bug"];

const TYPE_LABELS: Record<ItemType, string> = {
  epic: "Epic",
  story: "Story",
  task: "Task",
  bug: "Bug",
};

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }));

function getInitialType(item?: Item, defaultType?: ItemType): ItemType {
  if (item) return item.type;
  return defaultType ?? "task";
}

function getInitialTagsInput(item?: Item): string {
  if (!item) return "";
  return item.tags.join(", ");
}

export function ItemForm({
  item,
  defaultType,
  defaultStatus,
  defaultParentId,
  onSave,
  onCancel,
}: ItemFormProps) {
  const team = useTeam();
  const sprints = useSprints();
  const isEditing = !!item;

  const [type, setType] = useState<ItemType>(getInitialType(item, defaultType));
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [status, setStatus] = useState<Status>(item?.status ?? defaultStatus ?? "todo");
  const [priority, setPriority] = useState<Priority>(item?.priority ?? "medium");
  const [assigneeId, setAssigneeId] = useState<string>(item?.assigneeId ?? "");
  const [estimatedDays, setEstimatedDays] = useState<string>(
    item ? String(item.estimatedDays) : "0"
  );
  const [tagsInput, setTagsInput] = useState<string>(getInitialTagsInput(item));
  const [sprintId, setSprintId] = useState<string>(item?.sprintId ?? "");

  // Epic-specific
  const [targetDate, setTargetDate] = useState<string>(
    item?.type === "epic" ? (item.targetDate ?? "") : ""
  );

  // Story-specific
  const [storyPoints, setStoryPoints] = useState<string>(
    item?.type === "story" ? String(item.storyPoints) : "0"
  );
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<string>(
    item?.type === "story" ? item.acceptanceCriteria : ""
  );

  // Bug-specific
  const [severity, setSeverity] = useState<Severity>(
    item?.type === "bug" ? item.severity : "medium"
  );
  const [stepsToReproduce, setStepsToReproduce] = useState<string>(
    item?.type === "bug" ? item.stepsToReproduce : ""
  );

  const [titleError, setTitleError] = useState<string>("");

  const parsedTags = tagsInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const assigneeOptions = [
    { value: "", label: "Unassigned" },
    ...team.map((m) => ({ value: m.id, label: m.name })),
  ];

  const sprintStatusLabel = (status: string) => {
    if (status === "active") return "Active";
    if (status === "planning") return "Planning";
    return "Completed";
  };

  const sprintOptions = [
    { value: "", label: "Backlog" },
    ...sprints
      .filter((sp) => sp.status === "active" || sp.status === "planning")
      .map((sp) => ({
        value: sp.id,
        label: `${sp.name} (${sprintStatusLabel(sp.status)})`,
      })),
  ];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      setTitleError("Title is required");
      return;
    }
    if (title.length > 200) {
      setTitleError("Title must be 200 characters or fewer");
      return;
    }
    setTitleError("");

    const base = {
      title: title.trim(),
      description,
      status,
      priority,
      assigneeId: assigneeId || null,
      estimatedDays: parseFloat(estimatedDays) || 0,
      tags: parsedTags,
      dependencies: item?.dependencies ?? [],
      parentId: item ? item.parentId : (defaultParentId ?? null),
      sprintId: sprintId || null,
    };

    type NewItem = Omit<Item, "id" | "createdAt" | "updatedAt" | "order">;

    if (isEditing && item) {
      if (type === "epic") {
        useProjectStore.getState().updateItem(item.id, {
          ...base,
          type: "epic",
          targetDate: targetDate || null,
        } satisfies Partial<Item>);
      } else if (type === "story") {
        useProjectStore.getState().updateItem(item.id, {
          ...base,
          type: "story",
          storyPoints: parseFloat(storyPoints) || 0,
          acceptanceCriteria,
        } satisfies Partial<Item>);
      } else if (type === "bug") {
        useProjectStore.getState().updateItem(item.id, {
          ...base,
          type: "bug",
          severity,
          stepsToReproduce,
        } satisfies Partial<Item>);
      } else {
        useProjectStore.getState().updateItem(item.id, {
          ...base,
          type: "task",
        } satisfies Partial<Item>);
      }
    } else {
      if (type === "epic") {
        useProjectStore.getState().addItem({
          ...base,
          type: "epic",
          targetDate: targetDate || null,
        } as NewItem);
      } else if (type === "story") {
        useProjectStore.getState().addItem({
          ...base,
          type: "story",
          storyPoints: parseFloat(storyPoints) || 0,
          acceptanceCriteria,
        } as NewItem);
      } else if (type === "bug") {
        useProjectStore.getState().addItem({
          ...base,
          type: "bug",
          severity,
          stepsToReproduce,
        } as NewItem);
      } else {
        useProjectStore.getState().addItem({ ...base, type: "task" } as NewItem);
      }
    }

    onSave();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Type selector — only shown when creating */}
      {!isEditing && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-[var(--text-secondary)]">Type</span>
          <div className="flex gap-1 p-1 bg-[var(--bg-elevated)] rounded-lg">
            {ITEM_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={[
                  "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150",
                  type === t
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Title */}
      <Input
        id="item-title"
        label="Title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (titleError) setTitleError("");
        }}
        placeholder="Enter title..."
        maxLength={200}
        error={titleError}
        required
      />

      {/* Description */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="item-description"
          className="text-sm font-medium text-[var(--text-secondary)]"
        >
          Description
        </label>
        <textarea
          id="item-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Markdown supported..."
          rows={3}
          className={[
            "w-full px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-md",
            "text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]",
            "focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent",
            "transition-colors duration-150 resize-y",
          ].join(" ")}
        />
      </div>

      {/* Status + Priority */}
      <div className="grid grid-cols-2 gap-3">
        <Select
          id="item-status"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          options={STATUS_OPTIONS}
        />
        <Select
          id="item-priority"
          label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          options={PRIORITY_OPTIONS}
        />
      </div>

      {/* Assignee + Estimated Days */}
      <div className="grid grid-cols-2 gap-3">
        <Select
          id="item-assignee"
          label="Assignee"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          options={assigneeOptions}
        />
        <Input
          id="item-estimated-days"
          label="Estimated Days"
          type="number"
          min={0}
          step={0.5}
          value={estimatedDays}
          onChange={(e) => setEstimatedDays(e.target.value)}
        />
      </div>

      {/* Sprint */}
      <Select
        id="item-sprint"
        label="Sprint"
        value={sprintId}
        onChange={(e) => setSprintId(e.target.value)}
        options={sprintOptions}
      />

      {/* Tags */}
      <div className="flex flex-col gap-1">
        <Input
          id="item-tags"
          label="Tags (comma-separated)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="e.g. frontend, auth, urgent"
        />
        {parsedTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {parsedTags.map((tag) => (
              <Badge key={tag} variant="default">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Epic-specific fields */}
      {type === "epic" && (
        <Input
          id="item-target-date"
          label="Target Date"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      )}

      {/* Story-specific fields */}
      {type === "story" && (
        <>
          <Input
            id="item-story-points"
            label="Story Points"
            type="number"
            min={0}
            step={1}
            value={storyPoints}
            onChange={(e) => setStoryPoints(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label
              htmlFor="item-acceptance-criteria"
              className="text-sm font-medium text-[var(--text-secondary)]"
            >
              Acceptance Criteria
            </label>
            <textarea
              id="item-acceptance-criteria"
              value={acceptanceCriteria}
              onChange={(e) => setAcceptanceCriteria(e.target.value)}
              placeholder="Define the acceptance criteria..."
              rows={3}
              className={[
                "w-full px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-md",
                "text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]",
                "focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent",
                "transition-colors duration-150 resize-y",
              ].join(" ")}
            />
          </div>
        </>
      )}

      {/* Bug-specific fields */}
      {type === "bug" && (
        <>
          <Select
            id="item-severity"
            label="Severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
            options={SEVERITY_OPTIONS}
          />
          <div className="flex flex-col gap-1">
            <label
              htmlFor="item-steps-to-reproduce"
              className="text-sm font-medium text-[var(--text-secondary)]"
            >
              Steps to Reproduce
            </label>
            <textarea
              id="item-steps-to-reproduce"
              value={stepsToReproduce}
              onChange={(e) => setStepsToReproduce(e.target.value)}
              placeholder="1. Go to...\n2. Click on...\n3. Observe..."
              rows={3}
              className={[
                "w-full px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-md",
                "text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]",
                "focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent",
                "transition-colors duration-150 resize-y",
              ].join(" ")}
            />
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {isEditing ? "Save Changes" : "Create"}
        </Button>
      </div>
    </form>
  );
}
