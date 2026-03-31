export type ItemType = "epic" | "story" | "task" | "bug";
export type Status = "todo" | "in_progress" | "in_review" | "done";
export type Priority = "critical" | "high" | "medium" | "low";
export type Severity = "critical" | "high" | "medium" | "low";
export type ZoomLevel = "day" | "week" | "month";
export type Theme = "light" | "dark" | "system";
export type SprintStatus = "planning" | "active" | "completed";

export interface Sprint {
  id: string;
  name: string;
  goal: string;
  status: SprintStatus;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BaseItem {
  id: string;
  type: ItemType;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  assigneeIds: string[];
  estimatedDays: number;
  dependencies: string[];
  tags: string[];
  parentId: string | null;
  sprintId: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Epic extends BaseItem {
  type: "epic";
  targetDate: string | null;
}

export interface Story extends BaseItem {
  type: "story";
  storyPoints: number;
  acceptanceCriteria: string;
}

export interface Task extends BaseItem {
  type: "task";
}

export interface Bug extends BaseItem {
  type: "bug";
  severity: Severity;
  stepsToReproduce: string;
}

export type Item = Epic | Story | Task | Bug;

export interface TeamMember {
  id: string;
  name: string;
  color: string;
  role: string;
  hoursPerDay: number;
}

export interface GanttOverride {
  itemId: string;
  startDate: string;
}

export interface Project {
  id: string;
  name: string;
  deadline: string | null;
  items: Item[];
  team: TeamMember[];
  overrides: GanttOverride[];
  sprints: Sprint[];
  activeSprint: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledItem {
  itemId: string;
  startDate: string;
  endDate: string;
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
  slack: number;
  isCritical: boolean;
}

export const STATUSES: Status[] = ["todo", "in_progress", "in_review", "done"];

export const STATUS_LABELS: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const ITEM_COLORS: Record<ItemType, string> = {
  epic: "#7C3AED",
  story: "#2563EB",
  task: "#059669",
  bug: "#DC2626",
};
