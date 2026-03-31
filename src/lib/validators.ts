import { z } from "zod";

const itemTypeSchema = z.enum(["epic", "story", "task", "bug"]);
const statusSchema = z.enum(["todo", "in_progress", "in_review", "done"]);
const prioritySchema = z.enum(["critical", "high", "medium", "low"]);
const severitySchema = z.enum(["critical", "high", "medium", "low"]);
const sprintStatusSchema = z.enum(["planning", "active", "completed"]);

export const sprintSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  goal: z.string().max(1000),
  status: sprintStatusSchema,
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const baseItemSchema = z.object({
  id: z.string().min(1),
  type: itemTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(10000),
  status: statusSchema,
  priority: prioritySchema,
  assigneeIds: z.array(z.string()).default([]),
  estimatedDays: z.number().min(0),
  dependencies: z.array(z.string()),
  tags: z.array(z.string().max(50)).max(50),
  parentId: z.string().nullable(),
  sprintId: z.string().nullable(),
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
  acceptanceCriteria: z.string().max(5000),
});

const taskSchema = baseItemSchema.extend({
  type: z.literal("task"),
});

const bugSchema = baseItemSchema.extend({
  type: z.literal("bug"),
  severity: severitySchema,
  stepsToReproduce: z.string().max(5000),
});

export const itemSchema = z.discriminatedUnion("type", [
  epicSchema,
  storySchema,
  taskSchema,
  bugSchema,
]);

export const teamMemberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  color: z.string().max(20),
  role: z.string().max(100),
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
  sprints: z.array(sprintSchema),
  activeSprint: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
