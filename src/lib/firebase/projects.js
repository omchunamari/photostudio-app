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

export async function createProject(data, createdByUid) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "projects"), {
    projectName: data.projectName,
    leadId: data.leadId,
    quotationId: data.quotationId,
    clientName: data.clientName,
    eventDate: data.eventDate || null,
    shootDays: data.shootDays || 1,
    deliverables: data.deliverables || "",
    paymentTerms: data.paymentTerms || "",
    quotationAmount: data.quotationAmount || 0,
    status: "Planning",
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