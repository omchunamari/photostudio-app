import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "./client";

export async function createLead(data, createdByUid) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "leads"), {
    clientName: data.clientName,
    contactDetails: data.contactDetails,
    projectType: data.projectType,
    source: data.source,
    meetingNotes: data.meetingNotes || "",
    budget: data.budget || 0,
    requirements: data.requirements || "",
    meetingDate: data.meetingDate || null,
    followUpDate: data.followUpDate || null,
    discussionNotes: data.discussionNotes || "",
    status: "New",
    createdBy: createdByUid,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function getAllLeads() {
  const q = query(collection(db, "leads"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getLeadById(id) {
  const snap = await getDoc(doc(db, "leads", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateLead(id, data) {
  await updateDoc(doc(db, "leads", id), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateLeadStatus(id, status) {
  await updateDoc(doc(db, "leads", id), {
    status,
    updatedAt: new Date().toISOString(),
  });
}

export async function getLeadsByStatus(status) {
  const q = query(
    collection(db, "leads"),
    where("status", "==", status),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}