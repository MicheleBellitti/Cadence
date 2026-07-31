/**
 * Seeds the local Auth + Firestore emulators with a user and a project so the
 * connector can be exercised end to end (OAuth sign-in + MCP tool calls).
 *
 * Usage:
 *   firebase emulators:start --only firestore,auth
 *   npm --prefix functions run seed
 *
 * Prints the credentials to sign in with on the connector's consent page.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.GOOGLE_CLOUD_PROJECT ??= "cadence-e2c93";

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const EMAIL = "dev@cadence.local";
const PASSWORD = "cadence-dev-password";
const PROJECT_ID = "dev-project";
const MEMBER_ID = "member-dev";

async function main(): Promise<void> {
  initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
  const auth = getAuth();
  const db = getFirestore();

  let uid: string;
  try {
    uid = (await auth.getUserByEmail(EMAIL)).uid;
  } catch {
    uid = (await auth.createUser({ email: EMAIL, password: PASSWORD })).uid;
  }

  const now = Timestamp.now();
  await db.doc(`users/${uid}`).set({
    email: EMAIL,
    displayName: "Dev User",
    projectId: PROJECT_ID,
  });

  await db.doc(`projects/${PROJECT_ID}`).set({
    name: "Connector Dev Project",
    deadline: "2026-12-31",
    ownerId: uid,
    memberIds: [uid],
    activeSprint: "sprint-1",
    createdAt: now,
    updatedAt: now,
  });

  await db.doc(`projects/${PROJECT_ID}/team/${MEMBER_ID}`).set({
    name: "Dev User",
    color: "#6366f1",
    role: "Engineer",
    hoursPerDay: 6,
    linkedUserId: uid,
  });

  await db.doc(`projects/${PROJECT_ID}/sprints/sprint-1`).set({
    name: "Sprint 1",
    goal: "Ship the connector",
    status: "active",
    startDate: "2026-07-27",
    endDate: "2026-08-07",
    createdAt: now,
    updatedAt: now,
  });

  const items = [
    {
      id: "item-1",
      type: "task",
      title: "Design the OAuth flow",
      description: "PKCE + Firebase sign-in",
      status: "done",
      priority: "high",
      estimatedDays: 2,
      dependencies: [],
    },
    {
      id: "item-2",
      type: "task",
      title: "Implement the MCP tools",
      description: "Read-only board access",
      status: "in_progress",
      priority: "critical",
      estimatedDays: 3,
      dependencies: ["item-1"],
    },
    {
      id: "item-3",
      type: "bug",
      title: "Fix timezone drift in the scheduler",
      description: "Business-day math near DST",
      status: "todo",
      priority: "medium",
      estimatedDays: 1,
      dependencies: ["item-2"],
      severity: "medium",
      stepsToReproduce: "Schedule across a DST boundary",
    },
  ];

  for (const [index, item] of items.entries()) {
    const { id, ...rest } = item;
    await db.doc(`projects/${PROJECT_ID}/items/${id}`).set({
      ...rest,
      assigneeIds: [MEMBER_ID],
      tags: [],
      parentId: null,
      sprintId: "sprint-1",
      order: index,
      updatedBy: uid,
      createdAt: now,
      updatedAt: now,
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded emulator.\n  uid:      ${uid}\n  email:    ${EMAIL}\n  password: ${PASSWORD}\n  project:  ${PROJECT_ID}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
