import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { db } from "./client";

/**
 * Notification doc shape:
 * {
 *   uid: string,          // recipient
 *   type: string,         // e.g. "project_assignment"
 *   title: string,
 *   message: string,
 *   projectId: string | null,
 *   eventId: string | null,
 *   read: boolean,
 *   createdAt: string (ISO),
 * }
 */

export async function createNotification({
  uid,
  type,
  title,
  message,
  projectId = null,
  eventId = null,
}) {
  await addDoc(collection(db, "notifications"), {
    uid,
    type,
    title,
    message,
    projectId,
    eventId,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

// Convenience wrapper used from the project assignment flow
export async function notifyEmployee(uid, { type, title, message, projectId, eventId }) {
  return createNotification({ uid, type, title, message, projectId, eventId });
}

export async function getNotificationsForUser(uid) {
  const q = query(
    collection(db, "notifications"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getUnreadCount(uid) {
  const q = query(
    collection(db, "notifications"),
    where("uid", "==", uid),
    where("read", "==", false)
  );
  const snap = await getDocs(q);
  return snap.size;
}

export async function markNotificationRead(id) {
  await updateDoc(doc(db, "notifications", id), { read: true });
}

export async function markAllRead(uid) {
  const q = query(
    collection(db, "notifications"),
    where("uid", "==", uid),
    where("read", "==", false)
  );
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}