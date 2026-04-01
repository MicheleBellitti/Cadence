import {
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
  runTransaction,
  updateDoc,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import { normalizeEmailForDocId } from "./firestore-sync";
import type { Invite } from "@/types";

export async function createInvite(
  projectId: string,
  email: string,
  invitedByUid: string
): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  const inviteId = `${projectId}_${normalizeEmailForDocId(normalizedEmail)}`;

  await setDoc(doc(getFirebaseDb(),"invites", inviteId), {
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
  const db = getFirebaseDb();
  const inviteRef = doc(db, "invites", inviteId);

  // Step 1: Mark invite as accepted.
  // This is a standalone write so the security rule can verify the invite
  // status update independently.
  await updateDoc(inviteRef, { status: "accepted" });

  // Step 2: Add user to project + update user doc.
  // The project update rule uses get() to read the invite — now it sees
  // status == 'accepted' because step 1 already committed.
  await runTransaction(db, async (transaction) => {
    const projectRef = doc(db, "projects", projectId);

    const projectSnap = await transaction.get(projectRef);
    if (!projectSnap.exists()) throw new Error("Project not found");

    transaction.update(projectRef, {
      memberIds: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });

    transaction.update(doc(db, "users", uid), {
      projectId,
    });
  });
}

export async function getPendingInvites(email: string): Promise<Invite[]> {
  const q = query(
    collection(getFirebaseDb(), "invites"),
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
    collection(getFirebaseDb(), "invites"),
    where("projectId", "==", projectId),
    where("status", "==", "pending")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invite));
}
