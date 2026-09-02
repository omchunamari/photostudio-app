import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "./client";

export async function createLead(data, createdByUid, createdByName) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "leads"), {
    clientName: data.clientName,
    phone: data.phone || "",
    email: data.email || "",
    projectType: data.projectType || null,
    eventDate: data.eventDate || null, // tentative event date (the client's event, not a sales meeting)
    eventDetails: data.eventDetails || "",
    source: data.source || null,
    origin: "manual", // form-submitted leads get "form" — see public-submit route
    budget: data.budget || 0,
    handledByUid: data.handledByUid || null,
    handledByName: data.handledByName || "",
    followUpDate: data.followUpDate || null,
    followUpTime: data.followUpTime || null,
    priority: data.priority || null, // "Hot" | "Warm" | "Cold" | null (unset)
    status: "New Inquiry",
    createdBy: createdByUid,
    createdAt: now,
    updatedAt: now,
  });

  // Seed the timeline with a system entry so the lead's origin is always
  // visible, matching how studioops shows "Lead added via <source>".
  await addDoc(collection(db, "leads", ref.id, "activities"), {
    type: "system",
    text: `Lead added${data.source ? ` via ${data.source}` : ""}`,
    addedByUid: createdByUid,
    addedByName: createdByName || "",
    addedAt: now,
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

export async function updateLeadPriority(id, priority) {
  await updateDoc(doc(db, "leads", id), {
    priority: priority || null,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteLead(id) {
  await deleteDoc(doc(db, "leads", id));
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

// --- Timeline activities (Call / WhatsApp / Message / Email / Meeting / Note) ---

export async function getLeadActivities(leadId) {
  const q = query(collection(db, "leads", leadId, "activities"), orderBy("addedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addLeadActivity(leadId, { type, text }, addedByUid, addedByName) {
  const now = new Date().toISOString();
  await addDoc(collection(db, "leads", leadId, "activities"), {
    type, // "call" | "whatsapp" | "message" | "email" | "meeting" | "note" | "system"
    text: text || "",
    addedByUid,
    addedByName: addedByName || "",
    addedAt: now,
  });
  // Touch the lead so list views sorted by activity stay fresh.
  await updateDoc(doc(db, "leads", leadId), { updatedAt: now });
}

// Schedules (or clears, if date is falsy) a follow-up and logs it on the
// timeline in one call, mirroring studioops' "Follow-up scheduled for..."
// system entry.
export async function scheduleFollowUp(leadId, date, time, addedByUid, addedByName) {
  await updateLead(leadId, { followUpDate: date || null, followUpTime: time || null });
  if (date) {
    await addLeadActivity(
      leadId,
      { type: "system", text: `Follow-up scheduled for ${date}${time ? `, ${time}` : ""}` },
      addedByUid,
      addedByName
    );
  }
}