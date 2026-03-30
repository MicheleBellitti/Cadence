import { z } from "zod";

const itemTypeSchema = z.enum(["epic", "story", "task", "bug"]);
const statusSchema = z.enum(["todo", "in_progress", "in_review", "done"]);
const prioritySchema = z.enum(["critical", "high", "medium", "low"]);
const severitySchema = z.enum(["critical", "high", "medium", "low"]);

const baseItemSchema = z.object({
  id: z.string().min(1),
  type: itemTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string(),
  status: statusSchema,
  priority: prioritySchema,
  assigneeId: z.string().nullable(),
  estimatedDays: z.number().min(0),
  dependencies: z.array(z.string()),
  tags: z.array(z.string()),
  parentId: z.string().nullable(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const epicSchema = baseItemSchema.extend({
  type: z.literal("epic"),
  targetDate: z.string().nullable(),
});

const storySchema = baseItemSchema.extend({
  type: z.literal("story"),
  storyPoints: z.number().min(0),
  acceptanceCriteria: z.string(),
});

const taskSchema = baseItemSchema.extend({
  type: z.literal("task"),
});

const bugSchema = baseItemSchema.extend({
  type: z.literal("bug"),
  severity: severitySchema,
  stepsToReproduce: z.string(),
});

export const itemSchema = z.discriminatedUnion("type", [
  epicSchema,
  storySchema,
  taskSchema,
  bugSchema,
]);

export const teamMemberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string(),
  role: z.string(),
  hoursPerDay: z.number().min(0).max(24),
});

export const ganttOverrideSchema = z.object({
  itemId: z.string().min(1),
  startDate: z.string(),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  deadline: z.string().nullable(),
  items: z.array(itemSchema),
  team: z.array(teamMemberSchema),
  overrides: z.array(ganttOverrideSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
