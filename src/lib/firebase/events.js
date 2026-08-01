import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  arrayUnion,
} from "firebase/firestore";
import { db } from "./client";
import { getAllProjects } from "./projects";

/**
 * Event doc shape (projects/{projectId}/events/{eventId}):
 * {
 *   eventName: string,       // e.g. "Mehendi", "Wedding Day", "Reception"
 *   eventStartDate: string,  // ISO date
 *   eventEndDate: string,    // ISO date
 *   shootDays: number,       // derived from start/end, stored for display/sorting convenience
 *   projectId: string,       // denormalized, for employee views that don't load the parent project
 *   projectName: string,     // denormalized
 *   clientName: string,      // denormalized
 *   team: [{
 *     uid, name, role,
 *     assignments: [{ id, text, addedBy, addedAt, editedAt? }],  // history of instructions from admins, newest last
 *     sourceTeamId: string | null,  // editorTeams/{id} this member arrived via, or null if added individually
 *   }],
 *   assignedUids: string[],  // flat array for array-contains queries
 *   teamNotes: [{
 *     id, text, addedBy, addedAt, editedAt?,
 *     targetUids: string[],        // who currently sees this note
 *     sourceTeamId: string | null, // if posted alongside an editor-team assign, that team's id — lets
 *                                  // syncLinkedEventsForEditorTeam retroactively add newly-synced
 *                                  // members to targetUids so they see notes posted before they joined.
 *                                  // null for notes posted outside that flow, which stay frozen to
 *                                  // whoever was explicitly targeted at post time.
 *   }],
 *   linkedEditorTeamIds: string[],  // editorTeams/{id}s bulk-assigned to this event; kept in sync live
 *   status: string,
 *   createdAt, updatedAt: ISO strings,
 * }
 *
 * Note: `id` fields on teamNotes/assignments were added after this schema's
 * initial version. Entries created before that will have `id: undefined`;
 * edit/delete on those specific old entries will no-op (safe, just inert)
 * until they're touched once and get an id stamped on.
 */

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function computeShootDays(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const days = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  return days > 0 ? days : 1;
}

export async function createEvent(projectId, data) {
  const now = new Date().toISOString();
  const eventStartDate = data.eventStartDate || null;
  const eventEndDate = data.eventEndDate || data.eventStartDate || null;
  const ref = await addDoc(collection(db, "projects", projectId, "events"), {
    eventName: data.eventName,
    eventStartDate,
    eventEndDate,
    shootDays: computeShootDays(eventStartDate, eventEndDate),
    projectId,
    projectName: data.projectName,
    clientName: data.clientName,
    team: [],
    assignedUids: [],
    linkedEditorTeamIds: [],
    status: "Planning",
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function getEventsForProject(projectId) {
  const q = query(
    collection(db, "projects", projectId, "events"),
    orderBy("eventStartDate", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getEventById(projectId, eventId) {
  const snap = await getDoc(doc(db, "projects", projectId, "events", eventId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateEventDetails(projectId, eventId, data) {
  const eventStartDate = data.eventStartDate ?? null;
  const eventEndDate = data.eventEndDate ?? eventStartDate;
  await updateDoc(doc(db, "projects", projectId, "events", eventId), {
    eventName: data.eventName,
    eventStartDate,
    eventEndDate,
    shootDays: computeShootDays(eventStartDate, eventEndDate),
    updatedAt: new Date().toISOString(),
  });
}

export async function updateEventStatus(projectId, eventId, status) {
  await updateDoc(doc(db, "projects", projectId, "events", eventId), {
    status,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Deletes a single event doc (and, implicitly, leaves any statusUpdates
 * subcollection docs orphaned in Firestore — subcollections are not
 * auto-deleted with their parent). Restricted to admins via firestore.rules
 * (allow delete: if isAdmin()) — the UI additionally hides the control from
 * non-admins, but the rule is the actual enforcement boundary.
 */
export async function deleteEvent(projectId, eventId) {
  await deleteDoc(doc(db, "projects", projectId, "events", eventId));
}

/**
 * Updates an event's team array (membership only — who's on the team).
 * Pass the event's *current* status so we don't clobber later-stage
 * statuses (e.g. "In Progress") back down to "Team Assigned" just because
 * a member was added/removed. Status only auto-advances on the very first
 * assignment (status === "Planning"). New members start with an empty
 * assignments history and no source team unless the caller sets one
 * (e.g. via mergeEditorTeamIntoEventTeam).
 */
export async function updateEventTeam(projectId, eventId, team, currentStatus) {
  const normalizedTeam = team.map((m) => ({
    assignments: [],
    sourceTeamId: null,
    ...m,
  }));
  await updateDoc(doc(db, "projects", projectId, "events", eventId), {
    team: normalizedTeam,
    assignedUids: normalizedTeam.map((m) => m.uid),
    ...(currentStatus === "Planning" ? { status: "Team Assigned" } : {}),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Appends a new assignment instruction for one team member, on top of any
 * prior instructions for that same event — admins can hand out several
 * assignments over time for the same event without losing earlier ones.
 * Read-modify-write is required here since `team` is an array of objects
 * and Firestore's arrayUnion can't target a field nested inside one member
 * of that array. Stamped with a stable id so it can be edited/deleted later.
 */
export async function addTeamAssignmentNote(projectId, eventId, uid, text, addedBy) {
  if (!text || !text.trim()) throw new Error("Instruction can't be empty");
  const ref = doc(db, "projects", projectId, "events", eventId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Event not found");

  const event = snap.data();
  const now = new Date().toISOString();
  const newTeam = (event.team || []).map((m) =>
    m.uid === uid
      ? {
          ...m,
          assignments: [
            ...(m.assignments || []),
            { id: makeId(), text: text.trim(), addedBy, addedAt: now },
          ],
        }
      : m
  );

  await updateDoc(ref, { team: newTeam, updatedAt: now });
}

/** Edits one individual assignment instruction for one team member, in place. */
export async function editTeamAssignmentNote(projectId, eventId, uid, assignmentId, newText) {
  if (!newText || !newText.trim()) throw new Error("Instruction can't be empty");
  const ref = doc(db, "projects", projectId, "events", eventId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Event not found");
  const now = new Date().toISOString();
  const newTeam = (snap.data().team || []).map((m) =>
    m.uid === uid
      ? {
          ...m,
          assignments: (m.assignments || []).map((a) =>
            a.id === assignmentId ? { ...a, text: newText.trim(), editedAt: now } : a
          ),
        }
      : m
  );
  await updateDoc(ref, { team: newTeam, updatedAt: now });
}

/** Removes one individual assignment instruction for one team member. */
export async function deleteTeamAssignmentNote(projectId, eventId, uid, assignmentId) {
  const ref = doc(db, "projects", projectId, "events", eventId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Event not found");
  const newTeam = (snap.data().team || []).map((m) =>
    m.uid === uid
      ? { ...m, assignments: (m.assignments || []).filter((a) => a.id !== assignmentId) }
      : m
  );
  await updateDoc(ref, { team: newTeam, updatedAt: new Date().toISOString() });
}

/**
 * Adds a shared instruction, visible to the specific people listed in
 * targetUids. Pass sourceTeamId when this note is posted alongside an
 * editor-team assignment (see AssignEditorTeamButton) — doing so lets
 * syncLinkedEventsForEditorTeam retroactively extend targetUids to cover
 * anyone added to that team later, so they see this note's full history
 * rather than only notes posted after they joined. Leave it null for
 * one-off notes not tied to a reusable team; those stay frozen to whoever
 * was explicitly targeted at post time.
 * Stamped with a stable id so it can be edited/deleted later. Uses
 * read-modify-write (rather than arrayUnion) so the id is deterministic
 * and we can return/rely on it consistently with the edit/delete functions.
 */
export async function addSharedTeamNote(projectId, eventId, text, addedBy, targetUids, sourceTeamId = null) {
  if (!text || !text.trim()) throw new Error("Note can't be empty");
  if (!targetUids || targetUids.length === 0) throw new Error("No recipients for this note");
  const ref = doc(db, "projects", projectId, "events", eventId);
  await updateDoc(ref, {
    teamNotes: arrayUnion({
      id: makeId(),
      text: text.trim(),
      addedBy,
      addedAt: new Date().toISOString(),
      targetUids,
      sourceTeamId,
    }),
    updatedAt: new Date().toISOString(),
  });
}

/** Edits an existing shared team note in place, keeping its position/history/targetUids. */
export async function editSharedTeamNote(projectId, eventId, noteId, newText) {
  if (!newText || !newText.trim()) throw new Error("Note can't be empty");
  const ref = doc(db, "projects", projectId, "events", eventId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Event not found");
  const now = new Date().toISOString();
  const newNotes = (snap.data().teamNotes || []).map((n) =>
    n.id === noteId ? { ...n, text: newText.trim(), editedAt: now } : n
  );
  await updateDoc(ref, { teamNotes: newNotes, updatedAt: now });
}

/** Removes a shared team note entirely (employees stop seeing it immediately). */
export async function deleteSharedTeamNote(projectId, eventId, noteId) {
  const ref = doc(db, "projects", projectId, "events", eventId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Event not found");
  const newNotes = (snap.data().teamNotes || []).filter((n) => n.id !== noteId);
  await updateDoc(ref, { teamNotes: newNotes, updatedAt: new Date().toISOString() });
}

/**
 * Merges a reusable editor team's members into an event's existing `team`
 * array — a shortcut for bulk-adding several people at once. Anyone already
 * on the event keeps their existing assignments untouched; only members not
 * yet present are appended (with an empty assignments history), tagged with
 * `sourceTeamId` so the UI can show they arrived via a team rather than an
 * individual add, and so future roster changes on that team can find them.
 * Returns a new array — pass it to updateEventTeam to persist, and call
 * linkEditorTeamToEvent alongside it so the link is remembered for live sync.
 */
export function mergeEditorTeamIntoEventTeam(existingTeam, editorTeamMembers, defaultRole = "Editor", sourceTeamId = null) {
  const existingUids = new Set((existingTeam || []).map((m) => m.uid));
  const additions = (editorTeamMembers || [])
    .filter((m) => !existingUids.has(m.uid))
    .map((m) => ({ uid: m.uid, name: m.name, role: defaultRole, assignments: [], sourceTeamId }));
  return [...(existingTeam || []), ...additions];
}

/** Records that an editor team was bulk-assigned to this event, so future roster edits on that team sync here automatically. */
export async function linkEditorTeamToEvent(projectId, eventId, teamId) {
  await updateDoc(doc(db, "projects", projectId, "events", eventId), {
    linkedEditorTeamIds: arrayUnion(teamId),
    updatedAt: new Date().toISOString(),
  });
}

/** Every event (across all projects) that a given editor team has been bulk-assigned to. */
export async function getEventsLinkedToEditorTeam(teamId) {
  const q = query(
    collectionGroup(db, "events"),
    where("linkedEditorTeamIds", "array-contains", teamId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Reconciles every event linked to an editor team against that team's
 * *current* member list. Called after an editor team's roster changes.
 * - Anyone who arrived via this team (sourceTeamId === teamId) but is no
 *   longer a member gets dropped from the event's team/assignedUids — their
 *   individual assignments and status-update history are left untouched,
 *   only their active roster spot is removed (same effect as a manual
 *   admin removal).
 * - Anyone newly added to the team who isn't already on the event gets
 *   appended, tagged with this sourceTeamId, so they immediately gain
 *   access to the event.
 * - Newly-added members are also retroactively added to targetUids on any
 *   of the event's teamNotes that came from this same team (sourceTeamId
 *   match), so they see that team's full note history, not just notes
 *   posted after they joined.
 * - Members already on the event for other reasons (individually added, or
 *   via a different team) are left exactly as they are.
 * Idempotent and safe to call even if nothing changed.
 */
export async function syncLinkedEventsForEditorTeam(teamId, currentMembers) {
  const events = await getEventsLinkedToEditorTeam(teamId);
  const currentUids = new Set((currentMembers || []).map((m) => m.uid));

  await Promise.all(
    events.map(async (ev) => {
      const existingTeam = ev.team || [];

      const kept = existingTeam.filter(
        (m) => m.sourceTeamId !== teamId || currentUids.has(m.uid)
      );
      const keptUids = new Set(kept.map((m) => m.uid));
      const additions = (currentMembers || [])
        .filter((m) => !keptUids.has(m.uid))
        .map((m) => ({ uid: m.uid, name: m.name, role: "Editor", assignments: [], sourceTeamId: teamId }));

      const newTeam = [...kept, ...additions];
      const newlyAddedUids = additions.map((m) => m.uid);

      const teamChanged =
        newTeam.length !== existingTeam.length ||
        !newTeam.every((m, i) => m.uid === existingTeam[i]?.uid);

      const existingNotes = ev.teamNotes || [];
      let notesChanged = false;
      const updatedNotes = existingNotes.map((n) => {
        if (n.sourceTeamId !== teamId || newlyAddedUids.length === 0) return n;
        const merged = Array.from(new Set([...(n.targetUids || []), ...newlyAddedUids]));
        if (merged.length === (n.targetUids || []).length) return n;
        notesChanged = true;
        return { ...n, targetUids: merged };
      });

      if (!teamChanged && !notesChanged) return;

      await updateDoc(doc(db, "projects", ev.projectId, "events", ev.id), {
        team: newTeam,
        assignedUids: newTeam.map((m) => m.uid),
        ...(notesChanged ? { teamNotes: updatedNotes } : {}),
        updatedAt: new Date().toISOString(),
      });
    })
  );
}

export async function getEventsForProjectAscending(projectId) {
  return getEventsForProject(projectId);
}

/**
 * All events across all projects — used for admin conflict detection and
 * Team Overview. Deliberately fetches per-project rather than a single
 * collectionGroup scan: an unfiltered collection-group list query gated by
 * a role lookup (isCrmUser(), which itself calls get()) can be denied by
 * Firestore even when the same rule happily allows single-document reads.
 * Looping over projects uses the exact same nested-collection read path
 * that's already proven to work for a single event.
 */
export async function getAllEvents() {
  const projects = await getAllProjects();
  const eventLists = await Promise.all(
    projects.map((p) => getEventsForProject(p.id))
  );
  return eventLists.flat();
}

/** Events assigned to a specific employee, across every project. */
export async function getEventsForEmployee(uid) {
  const q = query(
    collectionGroup(db, "events"),
    where("assignedUids", "array-contains", uid),
    orderBy("eventStartDate", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function dateRangeOverlap(startA, endA, startB, endB) {
  if (!startA || !startB) return false;
  const rangeAEnd = endA || startA;
  const rangeBEnd = endB || startB;
  return new Date(startA) <= new Date(rangeBEnd) && new Date(startB) <= new Date(rangeAEnd);
}

/** Map of uid -> [{ eventName, projectName }] for events that overlap the given date range. */
export async function getConflictingEvents(eventStartDate, eventEndDate, excludeEventId) {
  if (!eventStartDate) return {};
  const all = await getAllEvents();
  const overlapping = all.filter(
    (e) =>
      e.id !== excludeEventId &&
      e.eventStartDate &&
      dateRangeOverlap(eventStartDate, eventEndDate, e.eventStartDate, e.eventEndDate)
  );
  const conflictMap = {};
  overlapping.forEach((e) => {
    (e.team || []).forEach((member) => {
      if (!conflictMap[member.uid]) conflictMap[member.uid] = [];
      conflictMap[member.uid].push(`${e.eventName} (${e.projectName})`);
    });
  });
  return conflictMap;
}

/**
 * Employee's own progress update log for an event, stored separately from
 * team[] so an employee can only ever write their own doc. `updates` holds
 * the full history, oldest first; `latestUpdate`/`latestUpdatedAt` are
 * denormalized for quick display without reading the whole array.
 */
export async function getEventStatusUpdate(projectId, eventId, uid) {
  const snap = await getDoc(
    doc(db, "projects", projectId, "events", eventId, "statusUpdates", uid)
  );
  return snap.exists() ? snap.data() : null;
}

/** Appends a new update to the employee's history for this event (never overwrites prior entries). */
export async function addEventStatusUpdate(projectId, eventId, uid, { name, text }) {
  if (!text || !text.trim()) throw new Error("Update can't be empty");
  const ref = doc(db, "projects", projectId, "events", eventId, "statusUpdates", uid);
  const snap = await getDoc(ref);
  const now = new Date().toISOString();
  const entry = { text: text.trim(), updatedAt: now };

  const priorUpdates = snap.exists() ? snap.data().updates || [] : [];
  await setDoc(
    ref,
    {
      uid,
      name,
      updates: [...priorUpdates, entry],
      latestUpdate: entry.text,
      latestUpdatedAt: now,
    },
    { merge: true }
  );
}

export async function getAllStatusUpdatesForEvent(projectId, eventId) {
  const snap = await getDocs(
    collection(db, "projects", projectId, "events", eventId, "statusUpdates")
  );
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}