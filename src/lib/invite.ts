import {
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import { normalizeEmailForDocId } from "./firestore-sync";
import type { Invite } from "@/types";

export async function createInvite(
  projectId: string,
  email: string,
  invitedByUid: string,
  projectName: string
): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  const inviteId = `${projectId}_${normalizeEmailForDocId(normalizedEmail)}`;

  await setDoc(doc(getFirebaseDb(),"invites", inviteId), {
    email: normalizedEmail,
    projectId,
    projectName,
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
  // Use a batch instead of a transaction — the invitee can't read the
  // project doc yet (not a member), so transaction.get() would be denied.
  // update() already fails if the doc doesn't exist, giving us the same safety.
  const { writeBatch } = await import("firebase/firestore");
  const batch = writeBatch(db);
  batch.update(doc(db, "projects", projectId), {
    memberIds: arrayUnion(uid),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "users", uid), {
    projectId,
  });
  await batch.commit();
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

/**
 * Real-time listener for pending invites matching a user's email.
 * Returns an unsubscribe function to tear down the listener.
 */
export function onPendingInvites(
  email: string,
  callback: (invites: Invite[]) => void
): () => void {
  const q = query(
    collection(getFirebaseDb(), "invites"),
    where("email", "==", email.toLowerCase()),
    where("status", "==", "pending")
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invite)));
    },
    () => {
      // On error (e.g. permission denied), surface empty list
      callback([]);
    }
  );
}

