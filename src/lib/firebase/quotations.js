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

// --- Quotation core ---
// Status flow is intentionally minimal: Draft -> Won (auto-creates the
// project) or Lost. No "Sent" / "Client Approved" / "Client Rejected"
// intermediate steps — those were busywork the client doesn't want tracked.

export async function createQuotation(data, createdByUid) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "quotations"), {
    leadId: data.leadId,
    clientName: data.clientName,
    amount: Number(data.amount) || 0,
    deliverables: data.deliverables || "",
    paymentTerms: data.paymentTerms || "",
    // Payment tracking lives here as an array of milestones, each with
    // its own amount, due date, payment mode, and paid/unpaid state.
    // e.g. { id, label: "Advance", amount, dueDate, mode, paid, paidDate }
    payments: [],
    status: "Draft",
    createdBy: createdByUid,
    createdAt: now,
    updatedAt: now,
  });

  await updateLeadStatus(data.leadId, "Quoted");
  return ref.id;
}

export async function updateQuotation(id, data) {
  await updateDoc(doc(db, "quotations", id), {
    amount: Number(data.amount) || 0,
    deliverables: data.deliverables || "",
    paymentTerms: data.paymentTerms || "",
    updatedAt: new Date().toISOString(),
  });
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

export async function getQuotationById(id) {
  const snap = await getDoc(doc(db, "quotations", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Draft -> Won or Draft -> Lost. Also flips the parent lead's status,
// same as before. Won/Lost is a one-way door in the UI (no "un-deciding"),
// which matches how the client actually uses it.
export async function setQuotationStatus(id, status, leadId) {
  await updateDoc(doc(db, "quotations", id), {
    status,
    updatedAt: new Date().toISOString(),
  });
  if (status === "Won") {
    await updateLeadStatus(leadId, "Won");
  } else if (status === "Lost") {
    await updateLeadStatus(leadId, "Lost");
  }
}

// --- Payment milestones ---
// Stored as a plain array on the quotation doc (not a subcollection) since
// there are only ever a handful per quotation and we always want them all
// at once. Firestore arrayUnion/arrayRemove can't patch a single field
// inside an array element, so these read-modify-write via getDoc first.

export async function addQuotationPayment(quotationId, payment) {
  const ref = doc(db, "quotations", quotationId);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data().payments || [] : [];
  const newPayment = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: payment.label || "Payment",
    amount: Number(payment.amount) || 0,
    dueDate: payment.dueDate || null,
    mode: payment.mode || "",
    paid: false,
    paidDate: null,
  };
  await updateDoc(ref, {
    payments: [...existing, newPayment],
    updatedAt: new Date().toISOString(),
  });
  return newPayment.id;
}

export async function markPaymentPaid(quotationId, paymentId, paidDate) {
  const ref = doc(db, "quotations", quotationId);
  const snap = await getDoc(ref);
  const payments = (snap.exists() ? snap.data().payments || [] : []).map((p) =>
    p.id === paymentId
      ? { ...p, paid: true, paidDate: paidDate || new Date().toISOString().slice(0, 10) }
      : p
  );
  await updateDoc(ref, { payments, updatedAt: new Date().toISOString() });
}

export async function markPaymentUnpaid(quotationId, paymentId) {
  const ref = doc(db, "quotations", quotationId);
  const snap = await getDoc(ref);
  const payments = (snap.exists() ? snap.data().payments || [] : []).map((p) =>
    p.id === paymentId ? { ...p, paid: false, paidDate: null } : p
  );
  await updateDoc(ref, { payments, updatedAt: new Date().toISOString() });
}

export async function removeQuotationPayment(quotationId, paymentId) {
  const ref = doc(db, "quotations", quotationId);
  const snap = await getDoc(ref);
  const payments = (snap.exists() ? snap.data().payments || [] : []).filter(
    (p) => p.id !== paymentId
  );
  await updateDoc(ref, { payments, updatedAt: new Date().toISOString() });
}

// Small pure helper used by the UI for the Total / Paid / Balance summary.
export function getPaymentSummary(quotation) {
  const payments = quotation?.payments || [];
  const totalScheduled = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalPaid = payments
    .filter((p) => p.paid)
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const amount = quotation?.amount || 0;
  return {
    totalScheduled,
    totalPaid,
    balance: amount - totalPaid,
  };
}