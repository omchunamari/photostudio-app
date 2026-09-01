import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  arrayUnion,
} from "firebase/firestore";
import { db } from "./client";
import { getAllProjects } from "./projects";

/**
 * Deliverable doc shape (projects/{projectId}/deliverables/{deliverableId}):
 * {
 *   type: string,              // one of DELIVERABLE_TYPES, or a custom label
 *   status: string,            // one of DELIVERABLE_STATUSES
 *   projectId, projectName, clientName: string,  // denormalized, for org-wide queries
 *   assignedUid: string | null,
 *   assignedName: string | null,
 *   startDate: string | null,  // ISO date
 *   endDate: string | null,    // ISO date
 *   deadline: string | null,   // ISO date
 *   instructions: string,      // admin/PM-authored note for the assignee — see updateDeliverable
 *   createdAt, updatedAt: ISO strings,
 * }
 *
 * Every project gets the same fixed starter set (DELIVERABLE_TYPES) the
 * first time its deliverables are viewed — see ensureDeliverablesForProject.
 * Admins/PMs can add extra custom ones on top via addDeliverable.
 */

export const DELIVERABLE_TYPES = [
  "Raw Photos",
  "Trailer",
  "Reels",
  "Full Film",
  "Photo Selection",
  "Photo Editing",
  "Album Designing",
  "Albums",
];

export const DELIVERABLE_STATUSES = ["Pending", "In Progress", "Done"];

export async function ensureDeliverablesForProject(project) {
  const existing = await getDeliverablesForProject(project.id);
  if (existing.length > 0) return existing;

  const now = new Date().toISOString();
  const batch = writeBatch(db);
  const colRef = collection(db, "projects", project.id, "deliverables");
  const created = [];
  DELIVERABLE_TYPES.forEach((type) => {
    const ref = doc(colRef);
    const data = {
      type,
      status: "Pending",
      projectId: project.id,
      projectName: project.projectName || "",
      clientName: project.clientName || "",
      assignedUid: null,
      assignedName: null,
      startDate: null,
      endDate: null,
      deadline: null,
      instructions: "",
      createdAt: now,
      updatedAt: now,
    };
    batch.set(ref, data);
    created.push({ id: ref.id, ...data });
  });
  await batch.commit();
  return created;
}

export async function getDeliverablesForProject(projectId) {
  const snap = await getDocs(collection(db, "projects", projectId, "deliverables"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Recomputes and stores `assignedDeliverableUids` on the parent project doc
 * — the deduplicated set of everyone currently assigned to at least one of
 * that project's deliverables. This is denormalized purely so
 * firestore.rules can check it: rules can't run a query across the
 * deliverables subcollection to see "is this uid assigned to anything
 * here", but they *can* cheaply get() a single field off the project doc.
 * See isDeliverableAssigneeOfProject() in firestore.rules, which uses this
 * to let a deliverable assignee read that project's events (and therefore
 * log storage for them) without being added to any event's team.
 * Called after any write that could change who's assigned to a deliverable
 * on this project — always from an admin/PM context, matching the project
 * doc's own update rule.
 */
async function syncProjectDeliverableAssigneeUids(projectId) {
  const list = await getDeliverablesForProject(projectId);
  const uids = Array.from(new Set(list.map((d) => d.assignedUid).filter(Boolean)));
  await updateDoc(doc(db, "projects", projectId), {
    assignedDeliverableUids: uids,
  });
}

/**
 * Org-wide read across every project's deliverables subcollection.
 * Loops per-project (like getAllEvents in events.js) rather than a
 * collectionGroup query, since a collectionGroup list gated by a role
 * lookup can be denied even when the equivalent per-project reads are
 * allowed. Also backfills the fixed starter set for any project that
 * hasn't had its deliverables touched yet.
 */
export async function getAllDeliverables(projects) {
  const projectList = projects || (await getAllProjects());
  const lists = await Promise.all(
    projectList.map((p) => ensureDeliverablesForProject(p))
  );
  return lists.flat();
}

/**
 * Deliverables assigned to a specific employee, across every project —
 * used for the non-admin Post-Production view. Uses a collectionGroup
 * query instead of looping over getAllProjects(), because getAllProjects()
 * is gated by isCalendarViewer()/leaderUid under firestore.rules and
 * returns nothing for a regular employee. The collectionGroup query is
 * covered by its own top-level rule (assignedUid == me), matching the
 * same pattern used for getEventsForEmployee.
 */
export async function getDeliverablesForEmployee(uid) {
  const q = query(
    collectionGroup(db, "deliverables"),
    where("assignedUid", "==", uid),
    orderBy("deadline", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Employee-facing status/note update. Kept separate from the generic
 * updateDeliverable() (used by the admin dialog for reassignment/dates)
 * because firestore.rules only lets the assigned employee touch
 * status/updates/updatedAt — sending any other field here would fail
 * the rule's affectedKeys().hasOnly(...) check.
 */
export async function addDeliverableStatusUpdate(projectId, deliverableId, { status, note, byUid, byName }) {
  const now = new Date().toISOString();
  const payload = { updatedAt: now };
  if (status) payload.status = status;
  if (note && note.trim()) {
    payload.updates = arrayUnion({
      text: note.trim(),
      status: status || null,
      byUid,
      byName,
      at: now,
    });
  }
  await updateDoc(doc(db, "projects", projectId, "deliverables", deliverableId), payload);
}

export async function addDeliverable(project, type) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "projects", project.id, "deliverables"), {
    type,
    status: "Pending",
    projectId: project.id,
    projectName: project.projectName || "",
    clientName: project.clientName || "",
    assignedUid: null,
    assignedName: null,
    startDate: null,
    endDate: null,
    deadline: null,
    instructions: "",
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateDeliverable(projectId, deliverableId, data) {
  await updateDoc(doc(db, "projects", projectId, "deliverables", deliverableId), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
  if ("assignedUid" in data) {
    await syncProjectDeliverableAssigneeUids(projectId);
  }
}

export async function deleteDeliverable(projectId, deliverableId) {
  await deleteDoc(doc(db, "projects", projectId, "deliverables", deliverableId));
  await syncProjectDeliverableAssigneeUids(projectId);
}