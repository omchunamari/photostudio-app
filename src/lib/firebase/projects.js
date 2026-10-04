import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "./client";
import { notifyEmployee } from "./notifications";

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function createProject(data, createdByUid, createdByName) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "projects"), {
    projectName: data.projectName,
    // Standalone projects (created directly from the Projects list rather
    // than via "Convert to Project" on a lead) have no lead — must fall
    // back to null since Firestore's addDoc rejects `undefined` fields.
    leadId: data.leadId ?? null,
    // Firestore's addDoc rejects any field whose value is `undefined`, so
    // this must never be left as data.quotationId directly — always fall
    // back to null when no quote was passed in.
    quotationId: data.quotationId ?? null,
    clientName: data.clientName,
    // Wedding / Pre-Wedding / Commercial ... — kept as its own field rather
    // than being baked into projectName, so it can be shown as a column and
    // filtered on without string-matching the name.
    eventType: data.eventType || null,
    // Denormalized from the originating lead at conversion time. leadId is
    // the source of truth for the link; this is just so lists and headers
    // can show the lead without a second read per project.
    leadName: data.leadName || null,
    eventDate: data.eventDate || null,
    shootDays: data.shootDays || 1,
    deliverables: data.deliverables || "",
    paymentTerms: data.paymentTerms || "",
    quotationAmount: data.quotationAmount || 0,
    status: "Planning",
    // Project Leader: any employee can be assigned to lead a specific
    // project. Once set, that employee gets access scoped to only this
    // project (see firestore.rules and the access checks in
    // projects/[id]/page.js and events/[eventId]/page.js) — they don't see
    // or edit other projects. null until an admin/PM assigns one.
    leaderUid: data.leaderUid || null,
    leaderName: data.leaderName || null,
    createdBy: createdByUid,
    createdAt: now,
    updatedAt: now,
  });

  if (data.leaderUid) {
    await notifyEmployee(data.leaderUid, {
      type: "project_leader_assignment",
      title: "You're now Project Leader",
      message: `${createdByName || "Someone"} made you Project Leader for "${data.projectName}".`,
      projectId: ref.id,
    });
  }

  return ref.id;
}

export async function getProjectById(id) {
  const snap = await getDoc(doc(db, "projects", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getAllProjects() {
  const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getProjectByQuotationId(quotationId) {
  const q = query(collection(db, "projects"), where("quotationId", "==", quotationId));
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// "Convert to Project" on the lead is independent of any single quote's
// status now (quotes just track draft/sent/accepted/declined/expired for
// the client-facing side) — this looks up a project by lead directly.
export async function getProjectByLeadId(leadId) {
  const q = query(collection(db, "projects"), where("leadId", "==", leadId));
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

/** Projects a given employee currently leads. Used to scope a Project Leader's own view. */
export async function getProjectsForLeader(uid) {
  const q = query(
    collection(db, "projects"),
    where("leaderUid", "==", uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Sets (or clears, by passing null) the Project Leader for a project.
 * Admin/PM only (enforced in firestore.rules + hidden in UI for others).
 */
export async function setProjectLeader(id, leaderUid, leaderName, setByName) {
  const snap = await getDoc(doc(db, "projects", id));
  const project = snap.exists() ? snap.data() : null;
  const priorLeaderUid = project?.leaderUid || null;

  await updateDoc(doc(db, "projects", id), {
    leaderUid: leaderUid || null,
    leaderName: leaderName || null,
    updatedAt: new Date().toISOString(),
  });

  if (leaderUid && leaderUid !== priorLeaderUid) {
    await notifyEmployee(leaderUid, {
      type: "project_leader_assignment",
      title: "You're now Project Leader",
      message: `${setByName || "Someone"} made you Project Leader for "${project?.projectName || "a project"}".`,
      projectId: id,
    });
  }
}

export async function updateProjectStatus(id, status) {
  await updateDoc(doc(db, "projects", id), {
    status,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateProjectDetails(id, data) {
  await updateDoc(doc(db, "projects", id), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * hardDisks: [{ id, label, capacityGB, eventId, status, received, receivedAt }]
 * Tracks each physical client hard disk for a project (a project can hand
 * over more than one, e.g. separate drives per shoot day or per
 * photo/video deliverable). Stored as a plain array field on the project
 * doc, read-modify-write style — same pattern as event.team in events.js —
 * since Firestore rules can't cheaply diff individual array entries.
 *
 * eventId is null for a disk that isn't tied to one specific event
 * ("Not event-specific"). status is one of HARD_DISK_STATUSES; `received`
 * is kept in sync with status (true once status reaches "Received") so
 * older UI reading the boolean still works.
 */
export const HARD_DISK_STATUSES = ["Pending Backup", "Backed Up", "Received", "Returned to Client"];

/** Appends a new hard disk entry. capacityGB should be a number (or null if unknown). */
export async function addHardDisk(projectId, { label, capacityGB, eventId, status }) {
  const ref = doc(db, "projects", projectId);
  const snap = await getDoc(ref);
  const hardDisks = snap.data()?.hardDisks || [];
  const resolvedStatus = status || HARD_DISK_STATUSES[0];
  const entry = {
    id: makeId(),
    label: label || "",
    capacityGB: capacityGB || null,
    eventId: eventId || null,
    status: resolvedStatus,
    received: resolvedStatus === "Received",
    receivedAt: resolvedStatus === "Received" ? new Date().toISOString() : null,
  };
  await updateDoc(ref, {
    hardDisks: [...hardDisks, entry],
    updatedAt: new Date().toISOString(),
  });
  return entry;
}

/** Edits an existing hard disk entry's label/capacity/event in place. */
export async function updateHardDisk(projectId, diskId, { label, capacityGB, eventId }) {
  const ref = doc(db, "projects", projectId);
  const snap = await getDoc(ref);
  const hardDisks = (snap.data()?.hardDisks || []).map((d) =>
    d.id === diskId
      ? {
          ...d,
          label: label ?? d.label,
          capacityGB: capacityGB ?? d.capacityGB,
          eventId: eventId !== undefined ? eventId : d.eventId,
        }
      : d
  );
  await updateDoc(ref, { hardDisks, updatedAt: new Date().toISOString() });
}

/** Sets one hard disk entry's status explicitly, stamping/clearing receivedAt. */
export async function setHardDiskStatus(projectId, diskId, status) {
  const ref = doc(db, "projects", projectId);
  const snap = await getDoc(ref);
  const now = new Date().toISOString();
  const hardDisks = (snap.data()?.hardDisks || []).map((d) =>
    d.id === diskId
      ? { ...d, status, received: status === "Received", receivedAt: status === "Received" ? now : null }
      : d
  );
  await updateDoc(ref, { hardDisks, updatedAt: now });
}

/** Toggles one hard disk entry's received status, stamping/clearing receivedAt. */
export async function toggleHardDiskReceived(projectId, diskId) {
  const ref = doc(db, "projects", projectId);
  const snap = await getDoc(ref);
  const now = new Date().toISOString();
  const hardDisks = (snap.data()?.hardDisks || []).map((d) =>
    d.id === diskId ? { ...d, received: !d.received, receivedAt: !d.received ? now : null } : d
  );
  await updateDoc(ref, { hardDisks, updatedAt: now });
}

/** Removes a hard disk entry entirely. */
export async function removeHardDisk(projectId, diskId) {
  const ref = doc(db, "projects", projectId);
  const snap = await getDoc(ref);
  const hardDisks = (snap.data()?.hardDisks || []).filter((d) => d.id !== diskId);
  await updateDoc(ref, { hardDisks, updatedAt: new Date().toISOString() });
}

/**
 * Deletes a project and every event beneath it (projects/{id}/events/*),
 * along with each event's statusUpdates subcollection, in a single atomic
 * batch. Restricted to admins via firestore.rules (allow delete: if
 * isAdmin()) — the UI additionally hides the control from non-admins, but
 * the rule is the actual enforcement boundary.
 */
export async function deleteProject(projectId) {
  // Everything that belongs only to this project goes with it: events (and
  // their status updates), deliverables, invoices and project expenses.
  // Deliverables used to be left behind, so editors kept seeing tasks for a
  // deleted project in "my deliverables"; orphaned paid invoices kept counting
  // as Cash Received on the dashboard.
  // Finance ledger rows are NOT deleted — they're real money movements and
  // carry the project name, so balances and reports stay correct.
  const [eventsSnap, deliverablesSnap, invoicesSnap, expensesSnap] = await Promise.all([
    getDocs(collection(db, "projects", projectId, "events")),
    getDocs(collection(db, "projects", projectId, "deliverables")),
    getDocs(query(collection(db, "invoices"), where("projectId", "==", projectId))),
    getDocs(query(collection(db, "expenses"), where("projectId", "==", projectId))),
  ]);

  const statusUpdatesSnaps = await Promise.all(
    eventsSnap.docs.map((eventDoc) =>
      getDocs(collection(db, "projects", projectId, "events", eventDoc.id, "statusUpdates"))
    )
  );

  const refs = [
    ...statusUpdatesSnaps.flatMap((snap) => snap.docs.map((d) => d.ref)),
    ...eventsSnap.docs.map((d) => d.ref),
    ...deliverablesSnap.docs.map((d) => d.ref),
    ...invoicesSnap.docs.map((d) => d.ref),
    ...expensesSnap.docs.map((d) => d.ref),
  ];

  // Firestore batches cap at 500 writes; the project doc goes in the last one.
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  await deleteDoc(doc(db, "projects", projectId));
}