import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "./client";

/**
 * Storage entry doc shape (storageEntries/{entryId}):
 * {
 *   projectId, projectName, clientName: string,
 *   eventId, eventName: string,
 *   memberUid: string,
 *   memberName: string,
 *   memberRole: string,        // denormalized from the event's team entry
 *   date: string,               // ISO date the data was shot/copied
 *   cards: [{ label: string, gb: number }],
 *   mainStorage: string,
 *   backupStorage: string,
 *   projectFile: string,
 *   catalogueFile: string,
 *   lightroomFile: string,
 *   copiedBy: string,
 *   notes: string,
 *   loggedBy: string,           // name of whoever filled the form — always shown, so it's clear who logged it
 *   loggedByUid: string,
 *   createdAt, updatedAt: ISO strings,
 * }
 *
 * Event-wise, not person-wise: any number of entries can exist for the
 * same (eventId, memberUid) pair — anyone assigned to the project (or
 * admin/PM) can log a storage entry for any team member on that event,
 * not just their own. loggedBy/loggedByUid record who actually logged
 * each entry, and that name is visible to everyone. An update/delete is
 * only allowed by whoever logged the entry (or an admin/PM) — see
 * firestore.rules.
 */

export async function getStorageEntriesForProject(projectId) {
  const q = query(collection(db, "storageEntries"), where("projectId", "==", projectId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Storage entries belonging to a specific employee — i.e. the footage/
 * cards were theirs (memberUid == uid), for their "my storage log" view.
 * storageEntries is a top-level collection with `read: if isSignedIn()`
 * in firestore.rules, so a plain query (no collectionGroup) works fine.
 */
export async function getStorageEntriesForEmployee(uid) {
  const q = query(collection(db, "storageEntries"), where("memberUid", "==", uid));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
}

/** Org-wide read, used for the Overview "what has come in" stats. */
export async function getAllStorageEntries() {
  const snap = await getDocs(collection(db, "storageEntries"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function logStorageEntry(data, loggedByUid, loggedByName) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "storageEntries"), {
    projectId: data.projectId,
    projectName: data.projectName || "",
    clientName: data.clientName || "",
    eventId: data.eventId,
    eventName: data.eventName || "",
    memberUid: data.memberUid,
    memberName: data.memberName || "",
    memberRole: data.memberRole || "",
    date: data.date || null,
    cards: data.cards || [],
    mainStorage: data.mainStorage || "",
    backupStorage: data.backupStorage || "",
    projectFile: data.projectFile || "",
    catalogueFile: data.catalogueFile || "",
    lightroomFile: data.lightroomFile || "",
    copiedBy: data.copiedBy || "",
    notes: data.notes || "",
    loggedBy: loggedByName || "",
    loggedByUid: loggedByUid || "",
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateStorageEntry(entryId, data) {
  await updateDoc(doc(db, "storageEntries", entryId), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteStorageEntry(entryId) {
  await deleteDoc(doc(db, "storageEntries", entryId));
}