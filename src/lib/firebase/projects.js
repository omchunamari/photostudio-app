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

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function createProject(data, createdByUid) {
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
export async function setProjectLeader(id, leaderUid, leaderName) {
  await updateDoc(doc(db, "projects", id), {
    leaderUid: leaderUid || null,
    leaderName: leaderName || null,
    updatedAt: new Date().toISOString(),
  });
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
 * hardDisks: [{ id, label, capacityGB, received, receivedAt }]
 * Tracks each physical client hard disk for a project (a project can hand
 * over more than one, e.g. separate drives per shoot day or per
 * photo/video deliverable). Stored as a plain array field on the project
 * doc, read-modify-write style — same pattern as event.team in events.js —
 * since Firestore rules can't cheaply diff individual array entries.
 */

/** Appends a new hard disk entry. capacityGB should be a number (or null if unknown). */
export async function addHardDisk(projectId, { label, capacityGB }) {
  const ref = doc(db, "projects", projectId);
  const snap = await getDoc(ref);
  const hardDisks = snap.data()?.hardDisks || [];
  const entry = {
    id: makeId(),
    label: label || "",
    capacityGB: capacityGB || null,
    received: false,
    receivedAt: null,
  };
  await updateDoc(ref, {
    hardDisks: [...hardDisks, entry],
    updatedAt: new Date().toISOString(),
  });
  return entry;
}

/** Edits an existing hard disk entry's label/capacity in place. */
export async function updateHardDisk(projectId, diskId, { label, capacityGB }) {
  const ref = doc(db, "projects", projectId);
  const snap = await getDoc(ref);
  const hardDisks = (snap.data()?.hardDisks || []).map((d) =>
    d.id === diskId ? { ...d, label: label ?? d.label, capacityGB: capacityGB ?? d.capacityGB } : d
  );
  await updateDoc(ref, { hardDisks, updatedAt: new Date().toISOString() });
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
  const eventsSnap = await getDocs(collection(db, "projects", projectId, "events"));

  const statusUpdatesSnaps = await Promise.all(
    eventsSnap.docs.map((eventDoc) =>
      getDocs(collection(db, "projects", projectId, "events", eventDoc.id, "statusUpdates"))
    )
  );

  const batch = writeBatch(db);

  eventsSnap.docs.forEach((eventDoc) => {
    batch.delete(eventDoc.ref);
  });

  statusUpdatesSnaps.forEach((snap) => {
    snap.docs.forEach((suDoc) => {
      batch.delete(suDoc.ref);
    });
  });

  batch.delete(doc(db, "projects", projectId));

  await batch.commit();
}