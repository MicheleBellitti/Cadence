import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Rules tests run against the Firestore emulator, so they are not part of the
 * default `npm test`. Run them with `npm run test:rules`, which starts the
 * emulator around this suite.
 */

const OWNER = "uid-owner";
const ATTACKER = "uid-attacker";
const OWNER_EMAIL = "owner@example.com";
const ATTACKER_EMAIL = "attacker@evil.example";
const VICTIM_PROJECT = "project-victim";
const ATTACKER_PROJECT = "project-attacker";

let testEnv: RulesTestEnvironment;

function authed(uid: string, email: string) {
  return testEnv.authenticatedContext(uid, { email }).firestore();
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "cadence-rules-test",
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "projects", VICTIM_PROJECT), {
      name: "Victim board",
      deadline: null,
      ownerId: OWNER,
      memberIds: [OWNER],
      activeSprint: null,
    });
    await setDoc(doc(db, "projects", ATTACKER_PROJECT), {
      name: "Attacker's own board",
      deadline: null,
      ownerId: ATTACKER,
      memberIds: [ATTACKER],
      activeSprint: null,
    });
    await setDoc(doc(db, "projects", VICTIM_PROJECT, "items", "item-1"), {
      type: "task",
      title: "Secret roadmap item",
      status: "todo",
      priority: "high",
    });
  });
});

describe("project membership", () => {
  it("lets a member read their project", async () => {
    const db = authed(OWNER, OWNER_EMAIL);
    await assertSucceeds(getDoc(doc(db, "projects", VICTIM_PROJECT)));
  });

  it("denies a non-member reading the project", async () => {
    const db = authed(ATTACKER, ATTACKER_EMAIL);
    await assertFails(getDoc(doc(db, "projects", VICTIM_PROJECT)));
  });

  it("denies a non-member reading project items", async () => {
    const db = authed(ATTACKER, ATTACKER_EMAIL);
    await assertFails(getDoc(doc(db, "projects", VICTIM_PROJECT, "items", "item-1")));
  });

  it("denies a member silently adding someone to memberIds", async () => {
    const db = authed(OWNER, OWNER_EMAIL);
    await assertFails(
      updateDoc(doc(db, "projects", VICTIM_PROJECT), { memberIds: arrayUnion(ATTACKER) })
    );
  });
});

describe("invite forgery (the doc-id / projectId binding)", () => {
  it("denies creating an invite whose document id names a different project", async () => {
    // The attack: the create rule authorizes on the `projectId` field, but the
    // project self-join rule looks the invite up by document id. Without the
    // binding, this write succeeds and is the first step to stealing a board.
    const db = authed(ATTACKER, ATTACKER_EMAIL);
    await assertFails(
      setDoc(doc(db, "invites", `${VICTIM_PROJECT}_${ATTACKER_EMAIL}`), {
        email: ATTACKER_EMAIL,
        projectId: ATTACKER_PROJECT,
        projectName: "Attacker's own board",
        invitedBy: ATTACKER,
        status: "pending",
        createdAt: serverTimestamp(),
      })
    );
  });

  it("denies creating an invite for a project the caller is not a member of", async () => {
    const db = authed(ATTACKER, ATTACKER_EMAIL);
    await assertFails(
      setDoc(doc(db, "invites", `${VICTIM_PROJECT}_${ATTACKER_EMAIL}`), {
        email: ATTACKER_EMAIL,
        projectId: VICTIM_PROJECT,
        invitedBy: ATTACKER,
        status: "pending",
        createdAt: serverTimestamp(),
      })
    );
  });

  it("denies creating an invite that is already accepted", async () => {
    const db = authed(ATTACKER, ATTACKER_EMAIL);
    await assertFails(
      setDoc(doc(db, "invites", `${ATTACKER_PROJECT}_${ATTACKER_EMAIL}`), {
        email: ATTACKER_EMAIL,
        projectId: ATTACKER_PROJECT,
        invitedBy: ATTACKER,
        status: "accepted",
        createdAt: serverTimestamp(),
      })
    );
  });

  it("denies an invite whose document id does not match its own email", async () => {
    const db = authed(OWNER, OWNER_EMAIL);
    await assertFails(
      setDoc(doc(db, "invites", `${VICTIM_PROJECT}_someone-else@example.com`), {
        email: ATTACKER_EMAIL,
        projectId: VICTIM_PROJECT,
        invitedBy: OWNER,
        status: "pending",
        createdAt: serverTimestamp(),
      })
    );
  });

  it("still allows the legitimate invite the app actually writes", async () => {
    const db = authed(OWNER, OWNER_EMAIL);
    await assertSucceeds(
      setDoc(doc(db, "invites", `${VICTIM_PROJECT}_${ATTACKER_EMAIL}`), {
        email: ATTACKER_EMAIL,
        projectId: VICTIM_PROJECT,
        projectName: "Victim board",
        invitedBy: OWNER,
        status: "pending",
        createdAt: serverTimestamp(),
      })
    );
  });

  it("blocks the full self-join escalation end to end", async () => {
    const attackerDb = authed(ATTACKER, ATTACKER_EMAIL);

    // Step 1 — forge an invite whose id names the victim's project.
    await assertFails(
      setDoc(doc(attackerDb, "invites", `${VICTIM_PROJECT}_${ATTACKER_EMAIL}`), {
        email: ATTACKER_EMAIL,
        projectId: ATTACKER_PROJECT,
        invitedBy: ATTACKER,
        status: "pending",
        createdAt: serverTimestamp(),
      })
    );

    // Step 2 — with no accepted invite at that id, self-join must fail too.
    await assertFails(
      updateDoc(doc(attackerDb, "projects", VICTIM_PROJECT), {
        memberIds: arrayUnion(ATTACKER),
        updatedAt: serverTimestamp(),
      })
    );

    // Step 3 — and the board stays unreadable.
    await assertFails(getDoc(doc(attackerDb, "projects", VICTIM_PROJECT, "items", "item-1")));
  });

  it("lets a genuinely invited user accept and join", async () => {
    const ownerDb = authed(OWNER, OWNER_EMAIL);
    const inviteId = `${VICTIM_PROJECT}_${ATTACKER_EMAIL}`;
    await assertSucceeds(
      setDoc(doc(ownerDb, "invites", inviteId), {
        email: ATTACKER_EMAIL,
        projectId: VICTIM_PROJECT,
        projectName: "Victim board",
        invitedBy: OWNER,
        status: "pending",
        createdAt: serverTimestamp(),
      })
    );

    const inviteeDb = authed(ATTACKER, ATTACKER_EMAIL);
    await assertSucceeds(updateDoc(doc(inviteeDb, "invites", inviteId), { status: "accepted" }));
    await assertSucceeds(
      updateDoc(doc(inviteeDb, "projects", VICTIM_PROJECT), {
        memberIds: arrayUnion(ATTACKER),
        updatedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(getDoc(doc(inviteeDb, "projects", VICTIM_PROJECT, "items", "item-1")));
  });
});

describe("connector state is Admin-SDK only", () => {
  const collections = [
    "mcpClients",
    "mcpAuthRequests",
    "mcpAuthCodes",
    "mcpGrants",
    "mcpGrantTokens",
  ];

  it("denies every client read and write", async () => {
    const db = authed(OWNER, OWNER_EMAIL);
    for (const collection of collections) {
      await assertFails(getDoc(doc(db, collection, "any-id")));
      await assertFails(setDoc(doc(db, collection, "any-id"), { stolen: true }));
    }
  });
});
