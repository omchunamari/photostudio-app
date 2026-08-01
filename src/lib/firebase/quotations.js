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
import { updateLeadStatus } from "./leads";

export async function createQuotation(data, createdByUid) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "quotations"), {
    leadId: data.leadId,
    clientName: data.clientName,
    amount: data.amount,
    advanceAmount: data.advanceAmount || 0,
    advancePaid: false,
    deliverables: data.deliverables || "",
    paymentTerms: data.paymentTerms || "",
    status: "Draft",
    createdBy: createdByUid,
    createdAt: now,
    updatedAt: now,
  });

  await updateLeadStatus(data.leadId, "Quoted");
  return ref.id;
}

export async function getQuotationsForLead(leadId) {
  const q = query(collection(db, "quotations"), where("leadId", "==", leadId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAllQuotations() {
  const q = query(collection(db, "quotations"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function markQuotationSent(id) {
  await updateDoc(doc(db, "quotations", id), {
    status: "Sent",
    updatedAt: new Date().toISOString(),
  });
}

export async function decideQuotation(id, decision, leadId) {
  await updateDoc(doc(db, "quotations", id), {
    status: decision,
    updatedAt: new Date().toISOString(),
  });
  if (decision === "Approved") {
    await updateLeadStatus(leadId, "Won");
  } else if (decision === "Rejected") {
    await updateLeadStatus(leadId, "Lost");
  }
}

export async function markAdvancePaid(id) {
  await updateDoc(doc(db, "quotations", id), {
    advancePaid: true,
    updatedAt: new Date().toISOString(),
  });
}