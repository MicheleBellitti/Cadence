import { useProjectStore } from "@/stores/project-store";
import type { Project, Epic, Story, Task, Bug, TeamMember, Sprint } from "@/types";

export function loadSeedData(): void {
  const TIMESTAMP = "2026-03-01T09:00:00.000Z";

  // Compute sprint dates dynamically relative to today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twoWeeksAgo = new Date(today.getTime() - 14 * 86400000);
  const yesterday = new Date(today.getTime() - 86400000);
  const twoWeeksLater = new Date(today.getTime() + 14 * 86400000);

  const toISO = (d: Date) => d.toISOString();

  const sprint1: Sprint = {
    id: "sprint-1",
    name: "Sprint 1",
    goal: "Set up data pipeline foundations",
    status: "completed",
    startDate: toISO(twoWeeksAgo),
    endDate: toISO(yesterday),
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const sprint2: Sprint = {
    id: "sprint-2",
    name: "Sprint 2",
    goal: "Model architecture and training setup",
    status: "active",
    startDate: toISO(today),
    endDate: toISO(twoWeeksLater),
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const team: TeamMember[] = [
    {
      id: "member-1",
      name: "Marco",
      color: "#2563EB",
      role: "Tech Lead",
      hoursPerDay: 8,
    },
    {
      id: "member-2",
      name: "Sara",
      color: "#7C3AED",
      role: "AI Engineer",
      hoursPerDay: 8,
    },
    {
      id: "member-3",
      name: "Luca",
      color: "#059669",
      role: "Full Stack Dev",
      hoursPerDay: 8,
    },
  ];

  const epic1: Epic = {
    id: "epic-1",
    type: "epic",
    title: "Data Pipeline",
    description: "",
    status: "in_progress",
    priority: "high",
    assigneeIds: [],
    estimatedDays: 0,
    dependencies: [],
    tags: [],
    parentId: null,
    sprintId: null,
    order: 0,
    targetDate: "2026-06-30",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const epic2: Epic = {
    id: "epic-2",
    type: "epic",
    title: "Model Training",
    description: "",
    status: "in_progress",
    priority: "critical",
    assigneeIds: [],
    estimatedDays: 0,
    dependencies: [],
    tags: [],
    parentId: null,
    sprintId: null,
    order: 1,
    targetDate: "2026-07-31",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const story1: Story = {
    id: "story-1",
    type: "story",
    title: "Implement data ingestion API",
    description: "",
    status: "in_progress",
    priority: "high",
    assigneeIds: ["member-3"],
    estimatedDays: 0,
    dependencies: [],
    tags: [],
    parentId: "epic-1",
    sprintId: "sprint-2",
    order: 0,
    storyPoints: 5,
    acceptanceCriteria: "",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const story2: Story = {
    id: "story-2",
    type: "story",
    title: "Build data validation layer",
    description: "",
    status: "todo",
    priority: "medium",
    assigneeIds: ["member-2"],
    estimatedDays: 0,
    dependencies: [],
    tags: [],
    parentId: "epic-1",
    sprintId: null,
    order: 1,
    storyPoints: 3,
    acceptanceCriteria: "",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const story3: Story = {
    id: "story-3",
    type: "story",
    title: "Design model architecture",
    description: "",
    status: "in_review",
    priority: "critical",
    assigneeIds: ["member-2"],
    estimatedDays: 0,
    dependencies: [],
    tags: [],
    parentId: "epic-2",
    sprintId: "sprint-2",
    order: 0,
    storyPoints: 8,
    acceptanceCriteria: "",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const story4: Story = {
    id: "story-4",
    type: "story",
    title: "Build training pipeline",
    description: "",
    status: "todo",
    priority: "high",
    assigneeIds: ["member-1"],
    estimatedDays: 0,
    dependencies: [],
    tags: [],
    parentId: "epic-2",
    sprintId: null,
    order: 1,
    storyPoints: 5,
    acceptanceCriteria: "",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const task1: Task = {
    id: "task-1",
    type: "task",
    title: "Set up FastAPI endpoints",
    description: "",
    status: "done",
    priority: "medium",
    assigneeIds: ["member-3"],
    estimatedDays: 2,
    dependencies: [],
    tags: [],
    parentId: "story-1",
    sprintId: "sprint-1",
    order: 0,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const task2: Task = {
    id: "task-2",
    type: "task",
    title: "Implement S3 connector",
    description: "",
    status: "in_progress",
    priority: "medium",
    assigneeIds: ["member-3"],
    estimatedDays: 3,
    dependencies: [],
    tags: [],
    parentId: "story-1",
    sprintId: "sprint-2",
    order: 1,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const task3: Task = {
    id: "task-3",
    type: "task",
    title: "Define Zod schemas",
    description: "",
    status: "todo",
    priority: "medium",
    assigneeIds: ["member-2"],
    estimatedDays: 1,
    dependencies: [],
    tags: [],
    parentId: "story-2",
    sprintId: null,
    order: 0,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const task4: Task = {
    id: "task-4",
    type: "task",
    title: "Write validation middleware",
    description: "",
    status: "todo",
    priority: "medium",
    assigneeIds: ["member-2"],
    estimatedDays: 2,
    dependencies: ["task-3"],
    tags: [],
    parentId: "story-2",
    sprintId: null,
    order: 1,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const task5: Task = {
    id: "task-5",
    type: "task",
    title: "Research transformer architectures",
    description: "",
    status: "done",
    priority: "medium",
    assigneeIds: ["member-2"],
    estimatedDays: 2,
    dependencies: [],
    tags: [],
    parentId: "story-3",
    sprintId: "sprint-1",
    order: 0,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const task6: Task = {
    id: "task-6",
    type: "task",
    title: "Document architecture decision",
    description: "",
    status: "in_review",
    priority: "medium",
    assigneeIds: ["member-2"],
    estimatedDays: 1,
    dependencies: ["task-5"],
    tags: [],
    parentId: "story-3",
    sprintId: "sprint-2",
    order: 1,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const task7: Task = {
    id: "task-7",
    type: "task",
    title: "Set up PyTorch training loop",
    description: "",
    status: "todo",
    priority: "medium",
    assigneeIds: ["member-1"],
    estimatedDays: 3,
    dependencies: ["task-6"],
    tags: [],
    parentId: "story-4",
    sprintId: "sprint-2",
    order: 0,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const task8: Task = {
    id: "task-8",
    type: "task",
    title: "Implement data loaders",
    description: "",
    status: "todo",
    priority: "medium",
    assigneeIds: ["member-3"],
    estimatedDays: 2,
    dependencies: ["task-7"],
    tags: [],
    parentId: "story-4",
    sprintId: null,
    order: 1,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const bug1: Bug = {
    id: "bug-1",
    type: "bug",
    title: "S3 timeout on large files",
    description: "",
    status: "todo",
    priority: "high",
    assigneeIds: ["member-3"],
    estimatedDays: 1,
    dependencies: [],
    tags: [],
    parentId: "story-1",
    sprintId: null,
    order: 2,
    severity: "high",
    stepsToReproduce: "",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const bug2: Bug = {
    id: "bug-2",
    type: "bug",
    title: "Memory leak in tokenizer",
    description: "",
    status: "in_progress",
    priority: "critical",
    assigneeIds: ["member-2"],
    estimatedDays: 2,
    dependencies: [],
    tags: [],
    parentId: "story-3",
    sprintId: "sprint-2",
    order: 2,
    severity: "critical",
    stepsToReproduce: "",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  const project: Project = {
    id: "seed-project-1",
    name: "AI Platform",
    deadline: null,
    team,
    items: [
      epic1,
      epic2,
      story1,
      story2,
      story3,
      story4,
      task1,
      task2,
      task3,
      task4,
      task5,
      task6,
      task7,
      task8,
      bug1,
      bug2,
    ],
    overrides: [],
    sprints: [sprint1, sprint2],
    activeSprint: "sprint-2",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  useProjectStore.getState().importProject(project);
}
