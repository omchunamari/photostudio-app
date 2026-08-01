import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "./client";
import { syncLinkedEventsForEditorTeam } from "./events";

/**
 * Reusable named team doc (editorTeams/{teamId}):
 * {
 *   name: string,                          // e.g. "Editing Team A"
 *   members: [{ uid, name }],               // denormalized names so lists render without extra reads
 *   createdAt, updatedAt: ISO strings,
 * }
 *
 * This is a convenience shortcut for bulk-adding people to an event's team
 * (see mergeEditorTeamIntoEventTeam + linkEditorTeamToEvent in events.js),
 * but it's also a *live* source of truth for any event it's been linked to:
 * once an event is linked (event.linkedEditorTeamIds contains this team's
 * id), adding or removing a member here automatically adds/removes them on
 * every linked event via syncLinkedEventsForEditorTeam. Members who were
 * removed keep their individual instruction/status-update history on those
 * events — only their active roster spot goes away.
 */

const COLLECTION = "editorTeams";

export async function createEditorTeam(name, members) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, COLLECTION), {
    name: name.trim(),
    members,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function getAllEditorTeams() {
  const q = query(collection(db, COLLECTION), orderBy("name", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getEditorTeamById(teamId) {
  const snap = await getDoc(doc(db, COLLECTION, teamId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function renameEditorTeam(teamId, name) {
  await updateDoc(doc(db, COLLECTION, teamId), {
    name: name.trim(),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Persists the new member list, then reconciles every event this team is
 * linked to: newly added members are appended to those events' teams, and
 * members no longer in the roster are pulled off those events' active
 * teams (history preserved). This is the one place team membership changes
 * — always go through here rather than updateDoc directly, or linked
 * events will drift out of sync.
 */
export async function updateEditorTeamMembers(teamId, members) {
  await updateDoc(doc(db, COLLECTION, teamId), {
    members,
    updatedAt: new Date().toISOString(),
  });
  await syncLinkedEventsForEditorTeam(teamId, members);
}

export async function deleteEditorTeam(teamId) {
  await deleteDoc(doc(db, COLLECTION, teamId));
}