import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
  onSnapshot,
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

/**
 * Live version of getNotificationsForUser — calls `callback` with the
 * current full list immediately, then again every time a notification
 * for this user is created, read, or deleted (anywhere — another tab,
 * an admin assigning something, a teammate's action), no polling or
 * manual refetch needed. Returns the unsubscribe function; call it in a
 * useEffect cleanup so the listener doesn't outlive the component.
 */
export function subscribeToNotifications(uid, callback) {
  const q = query(
    collection(db, "notifications"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
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

export async function deleteNotification(id) {
  await deleteDoc(doc(db, "notifications", id));
}

/** Deletes every notification belonging to this user — the "Clear all" action. */
export async function clearAllNotifications(uid) {
  const q = query(collection(db, "notifications"), where("uid", "==", uid));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}