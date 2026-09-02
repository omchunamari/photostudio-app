import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./client";

// Single well-known doc — there's only ever one active "important note"
// shown on everyone's dashboard, so no need for a collection of them.
const ANNOUNCEMENT_ID = "dashboard";

/**
 * Announcement doc shape (announcements/dashboard):
 * {
 *   text: string,
 *   updatedBy: string,
 *   updatedByUid: string,
 *   updatedAt: string,
 * } | null (doc absent = no active note)
 */

export async function getAnnouncement() {
  const snap = await getDoc(doc(db, "announcements", ANNOUNCEMENT_ID));
  return snap.exists() ? snap.data() : null;
}

export async function setAnnouncement(text, updatedByUid, updatedByName) {
  await setDoc(doc(db, "announcements", ANNOUNCEMENT_ID), {
    text,
    updatedBy: updatedByName,
    updatedByUid,
    updatedAt: new Date().toISOString(),
  });
}

export async function clearAnnouncement() {
  await deleteDoc(doc(db, "announcements", ANNOUNCEMENT_ID));
}