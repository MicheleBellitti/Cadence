import {
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
  runTransaction,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import { db } from "./firebase";
import { normalizeEmailForDocId } from "./firestore-sync";
import type { Invite } from "@/types";

export async function createInvite(
  projectId: string,
  email: string,
  invitedByUid: string
): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  const inviteId = `${projectId}_${normalizeEmailForDocId(normalizedEmail)}`;

  await setDoc(doc(db, "invites", inviteId), {
    email: normalizedEmail,
    projectId,
    invitedBy: invitedByUid,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

export async function acceptInvite(
  inviteId: string,
  projectId: string,
  uid: string
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const inviteRef = doc(db, "invites", inviteId);
    const projectRef = doc(db, "projects", projectId);

    const inviteSnap = await transaction.get(inviteRef);
    if (!inviteSnap.exists()) throw new Error("Invite not found");

    const projectSnap = await transaction.get(projectRef);
    if (!projectSnap.exists()) throw new Error("Project not found");

    // Update invite status
    transaction.update(inviteRef, { status: "accepted" });

    // Add user to project memberIds
    transaction.update(projectRef, {
      memberIds: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });

    // Update user's projectId
    transaction.update(doc(db, "users", uid), {
      projectId,
    });
  });
}

export async function getPendingInvites(email: string): Promise<Invite[]> {
  const q = query(
    collection(db, "invites"),
    where("email", "==", email.toLowerCase()),
    where("status", "==", "pending")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invite));
}

export async function getPendingInvitesForProject(
  projectId: string
): Promise<Invite[]> {
  const q = query(
    collection(db, "invites"),
    where("projectId", "==", projectId),
    where("status", "==", "pending")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invite));
}
