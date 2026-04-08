"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { MarkdownTextarea } from "../ui/markdown-textarea";
import { Select } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProjectStore, useTeam, useItems, useSprints } from "@/stores/project-store";
import { hasCycle } from "@/lib/critical-path";
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
  const allItems = useItems();
  const sprints = useSprints();
  const isEditing = !!item;

  const [type, setType] = useState<ItemType>(getInitialType(item, defaultType));
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [status, setStatus] = useState<Status>(item?.status ?? defaultStatus ?? "todo");
  const [priority, setPriority] = useState<Priority>(item?.priority ?? "medium");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(item?.assigneeIds ?? []);
  const [estimatedDays, setEstimatedDays] = useState<string>(
    item ? String(item.estimatedDays) : "0"
  );
  const [tagsInput, setTagsInput] = useState<string>(getInitialTagsInput(item));
  const [sprintId, setSprintId] = useState<string>(item?.sprintId ?? "");

  // Dependencies & Parent
  const [dependencies, setDependencies] = useState<string[]>(item?.dependencies ?? []);
  const [parentId, setParentId] = useState<string>(
    item ? (item.parentId ?? "") : (defaultParentId ?? "")
  );

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

  const toggleAssignee = (id: string) => {
    setSelectedAssignees((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

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

  // Dependency options: all items except self and items that would create a cycle
  const currentItemId = item?.id;
  const dependencyOptions = useMemo(() => {
    return allItems
      .filter((i) => i.id !== currentItemId) // exclude self
      .filter((i) => {
        // Exclude items that would create a cycle
        if (!currentItemId) return true; // new item, no cycles possible
        return !hasCycle(allItems, currentItemId, i.id);
      })
      .map((i) => ({
        value: i.id,
        label: i.title,
        secondary: i.type,
      }));
  }, [allItems, currentItemId]);

  // Parent epic options: only epics, excluding self
  const epicOptions = useMemo(() => {
    return [
      { value: "", label: "None (top-level)" },
      ...allItems
        .filter((i) => i.type === "epic" && i.id !== item?.id)
        .map((i) => ({ value: i.id, label: i.title })),
    ];
  }, [allItems, item?.id]);

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
      assigneeIds: selectedAssignees,
      estimatedDays: parseFloat(estimatedDays) || 0,
      tags: parsedTags,
      dependencies,
      parentId: parentId || null,
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
      <MarkdownTextarea
        id="item-description"
        label="Description"
        value={description}
        onChange={(val) => setDescription(val)}
        placeholder="Markdown supported..."
        rows={3}
        maxLength={10000}
      />

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

      {/* Assignees + Estimated Days */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Assignees
          </label>
          {team.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">No team members</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {team.map((m) => {
                const isSelected = selectedAssignees.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleAssignee(m.id)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors border"
                    style={{
                      backgroundColor: isSelected ? m.color + "20" : "var(--bg-primary)",
                      borderColor: isSelected ? m.color : "var(--border)",
                      color: isSelected ? m.color : "var(--text-secondary)",
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: m.color }}
                    />
                    {m.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
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

      {/* Parent Epic */}
      {type !== "epic" && (
        <Select
          id="item-parent"
          label="Parent Epic"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          options={epicOptions}
        />
      )}

      {/* Dependencies */}
      <MultiSelect
        id="item-dependencies"
        label="Dependencies (blocks this item)"
        options={dependencyOptions}
        selected={dependencies}
        onChange={setDependencies}
        placeholder="Search items to add as dependency..."
        emptyMessage="No other items to depend on"
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
          <MarkdownTextarea
            id="item-acceptance-criteria"
            label="Acceptance Criteria"
            value={acceptanceCriteria}
            onChange={(val) => setAcceptanceCriteria(val)}
            placeholder="Define the acceptance criteria..."
            rows={3}
            maxLength={10000}
          />
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
          <MarkdownTextarea
            id="item-steps-to-reproduce"
            label="Steps to Reproduce"
            value={stepsToReproduce}
            onChange={(val) => setStepsToReproduce(val)}
            placeholder="1. Go to...\n2. Click on...\n3. See error..."
            rows={3}
            maxLength={10000}
          />
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
