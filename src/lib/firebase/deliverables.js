import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  writeBatch,
  arrayUnion,
  runTransaction,
} from "firebase/firestore";
import { db } from "./client";
import { getAllProjects } from "./projects";

/**
 * Deliverable doc shape (projects/{projectId}/deliverables/{deliverableId}):
 * {
 *   type: string,              // one of DELIVERABLE_TYPES, or a custom label
 *   category: string,          // one of DEFAULT_DELIVERABLE_CATEGORIES or an org's custom category — see below
 *   status: string,            // one of DELIVERABLE_STATUSES
 *   projectId, projectName, clientName: string,  // denormalized, for org-wide queries
 *   assignedUid: string | null,
 *   assignedName: string | null,
 *   startDate: string | null,  // ISO date
 *   endDate: string | null,    // ISO date
 *   deadline: string | null,   // ISO date
 *   instructions: string,      // admin/PM-authored note for the assignee — see updateDeliverable
 *   createdAt, updatedAt: ISO strings,
 *   charge: number | null,     // employee charge logged for this deliverable — see updateDeliverableCharge
 *   chargeNotes: string,       // optional free-text note on how the charge was arrived at
 * }
 *
 * Every project gets the same fixed starter set (DELIVERABLE_TYPES) the
 * first time its deliverables are viewed — see ensureDeliverablesForProject.
 * Admins/PMs can add extra custom ones on top via addDeliverable.
 */

export const DELIVERABLE_TYPES = [
  "Earlyshare Sorting",
  "Earlyshare Editing",
  "Full Set Sorting",
  "Full Set Editing",
  "Full Set Retouching",
  "Reel",
  "Trailer",
  "Highlight",
  "Film",
  "Traditional Video",
  "Design",
  "Printing",
];

// Default category each starter type is filed under when a project's fixed
// set is first created — just a sensible starting point, editable per
// deliverable afterwards like any other field.
const DELIVERABLE_TYPE_DEFAULT_CATEGORY = {
  "Earlyshare Sorting": "Photography",
  "Earlyshare Editing": "Photography",
  "Full Set Sorting": "Photography",
  "Full Set Editing": "Photography",
  "Full Set Retouching": "Photography",
  "Reel": "Videography",
  "Trailer": "Videography",
  "Highlight": "Videography",
  "Film": "Videography",
  "Traditional Video": "Videography",
  "Design": "Album",
  "Printing": "Album",
};

/**
 * Post-production pipeline. Replaces the old 3-stage
 * Pending/In Progress/Done vocabulary — DELIVERABLE_STATUS_MIGRATION below
 * maps old values on read so nothing already stored breaks.
 */
export const DELIVERABLE_STATUSES = [
  "Not Started",
  "In Progress",
  "Draft Ready",
  "Sent to Client",
  "Approval / Revision",
  "Final Done",
  "Delivered",
];

// The status a deliverable is considered fully closed out at — used
// anywhere the app needs a single "is this done" check (dashboards,
// analytics, overdue calculations, etc).
export const DELIVERABLE_DONE_STATUS = "Delivered";

// One-time mapping from the old 3-stage vocabulary to the new pipeline.
// Applied defensively on every read (normalizeDeliverableStatus) so old
// docs display correctly immediately, and can also be run as a real
// write-back via scripts/migrate-deliverable-statuses.js.
export const DELIVERABLE_STATUS_MIGRATION = {
  "Pending": "Not Started",
  "In Progress": "In Progress",
  "Done": "Delivered",
};

export function normalizeDeliverableStatus(status) {
  if (DELIVERABLE_STATUSES.includes(status)) return status;
  return DELIVERABLE_STATUS_MIGRATION[status] || DELIVERABLE_STATUSES[0];
}

function normalizeDeliverableDoc(d) {
  return { ...d, status: normalizeDeliverableStatus(d.status) };
}

// --- Deliverable categories -------------------------------------------
// Fixed defaults — always available, cannot be removed via Manage
// Categories. Org-added custom categories are layered on top, mirroring
// the expense-category pattern in expenses.js.
export const DEFAULT_DELIVERABLE_CATEGORIES = ["Photography", "Videography", "Album", "Other"];

// Org-wide custom deliverable categories, stored alongside the other
// org-wide config in orgSettings/main (see expenses.js/quoteSettings.js).
// Kept as a simple string array — "Add" is just an array-union-style write,
// no separate collection needed for a short list of labels.
const ORG_SETTINGS_REF = () => doc(db, "orgSettings", "main");

export async function getCustomDeliverableCategories() {
  const snap = await getDoc(ORG_SETTINGS_REF());
  const custom = snap.exists() ? snap.data().customDeliverableCategories : [];
  return Array.isArray(custom) ? custom : [];
}

/** Full list shown in pickers: fixed defaults + org's custom categories. */
export async function getAllDeliverableCategories() {
  const custom = await getCustomDeliverableCategories();
  return [...DEFAULT_DELIVERABLE_CATEGORIES, ...custom];
}

export async function addCustomDeliverableCategory(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Category name is required");
  if (DEFAULT_DELIVERABLE_CATEGORIES.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("That category already exists");
  }
  const existing = await getCustomDeliverableCategories();
  if (existing.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("That category already exists");
  }
  const next = [...existing, trimmed];
  await setDoc(ORG_SETTINGS_REF(), { customDeliverableCategories: next, updatedAt: new Date().toISOString() }, { merge: true });
  return next;
}

export async function removeCustomDeliverableCategory(name) {
  const existing = await getCustomDeliverableCategories();
  const next = existing.filter((c) => c !== name);
  await setDoc(ORG_SETTINGS_REF(), { customDeliverableCategories: next, updatedAt: new Date().toISOString() }, { merge: true });
  return next;
}

/**
 * Creates the fixed starter set of deliverables for a project the first
 * time anyone views it. Guarded by a transactional "claim" on the project
 * doc (deliverablesInitialized) so that concurrent callers — e.g. two
 * pages loading this project around the same time, or React StrictMode's
 * double-effect in dev — can't both pass the "is it empty?" check before
 * either has written, which used to create the starter set twice. Only
 * the caller that wins the transaction writes the batch; everyone else
 * just reads (waiting briefly if the winner hasn't committed yet).
 */
export async function ensureDeliverablesForProject(project) {
  const existing = await getDeliverablesForProject(project.id);
  if (existing.length > 0) return existing;

  const projectRef = doc(db, "projects", project.id);
  const wonClaim = await runTransaction(db, async (tx) => {
    const snap = await tx.get(projectRef);
    if (snap.exists() && snap.data().deliverablesInitialized) {
      return false;
    }
    tx.update(projectRef, { deliverablesInitialized: true });
    return true;
  });

  if (!wonClaim) {
    // Someone else is (or already did) create the starter set. Poll
    // briefly for their batch to land instead of creating our own.
    for (let i = 0; i < 5; i++) {
      const dels = await getDeliverablesForProject(project.id);
      if (dels.length > 0) return dels;
      await new Promise((r) => setTimeout(r, 300));
    }
    return getDeliverablesForProject(project.id);
  }

  const now = new Date().toISOString();
  const batch = writeBatch(db);
  const colRef = collection(db, "projects", project.id, "deliverables");
  const created = [];
  DELIVERABLE_TYPES.forEach((type) => {
    const ref = doc(colRef);
    const data = {
      type,
      category: DELIVERABLE_TYPE_DEFAULT_CATEGORY[type] || "Other",
      status: DELIVERABLE_STATUSES[0],
      projectId: project.id,
      projectName: project.projectName || "",
      clientName: project.clientName || "",
      assignedUid: null,
      assignedName: null,
      startDate: null,
      endDate: null,
      deadline: null,
      instructions: "",
      charge: null,
      chargeNotes: "",
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
  return snap.docs.map((d) => normalizeDeliverableDoc({ id: d.id, ...d.data() }));
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
  return snap.docs.map((d) => normalizeDeliverableDoc({ id: d.id, ...d.data() }));
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

export async function addDeliverable(project, type, category) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "projects", project.id, "deliverables"), {
    type,
    category: category || "Other",
    status: DELIVERABLE_STATUSES[0],
    projectId: project.id,
    projectName: project.projectName || "",
    clientName: project.clientName || "",
    assignedUid: null,
    assignedName: null,
    startDate: null,
    endDate: null,
    deadline: null,
    instructions: "",
    charge: null,
    chargeNotes: "",
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

/**
 * Admin/PM-only: log or edit the employee charge for a deliverable.
 * Kept separate from the generic updateDeliverable() so it's easy to gate
 * to project-ops in firestore.rules (charge is a financial field, not
 * something the assigned employee can self-report via
 * addDeliverableStatusUpdate).
 */
export async function updateDeliverableCharge(projectId, deliverableId, { charge, chargeNotes }) {
  await updateDoc(doc(db, "projects", projectId, "deliverables", deliverableId), {
    charge: charge === "" || charge === null || charge === undefined ? null : Number(charge),
    chargeNotes: chargeNotes || "",
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteDeliverable(projectId, deliverableId) {
  await deleteDoc(doc(db, "projects", projectId, "deliverables", deliverableId));
  await syncProjectDeliverableAssigneeUids(projectId);
}