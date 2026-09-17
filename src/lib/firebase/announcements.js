import { doc, getDoc, setDoc, deleteDoc, updateDoc, deleteField } from "firebase/firestore";
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
 *   acks: { [uid]: { name: string, at: string } },  // thumbs-up acknowledgements
 * } | null (doc absent = no active note)
 */

export async function getAnnouncement() {
  const snap = await getDoc(doc(db, "announcements", ANNOUNCEMENT_ID));
  return snap.exists() ? snap.data() : null;
}

export async function setAnnouncement(text, updatedByUid, updatedByName) {
  // Full overwrite, acks included: editing the text makes it a new message,
  // so old thumbs-ups shouldn't carry over and imply people have read it.
  await setDoc(doc(db, "announcements", ANNOUNCEMENT_ID), {
    text,
    updatedBy: updatedByName,
    updatedByUid,
    updatedAt: new Date().toISOString(),
    acks: {},
  });
}

/**
 * Toggles the current user's thumbs-up on the note. Writes only the single
 * `acks.<uid>` key, which is what the Firestore rule for this collection
 * checks — an employee can add or remove their own acknowledgement but
 * can't touch the note text or anyone else's ack.
 */
export async function toggleAnnouncementAck(uid, name, acknowledged) {
  await updateDoc(doc(db, "announcements", ANNOUNCEMENT_ID), {
    [`acks.${uid}`]: acknowledged
      ? deleteField()
      : { name: name || "", at: new Date().toISOString() },
  });
}

export async function clearAnnouncement() {
  await deleteDoc(doc(db, "announcements", ANNOUNCEMENT_ID));
}