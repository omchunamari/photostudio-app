import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "./client";
import { getISTDateStr } from "@/lib/dateIST";

// --- Quote numbering ---
// One global running counter (counters/quotations, { next: <int> }).
// A transaction avoids two staff members getting the same Q-#### if they
// both hit "New Quote" at the same moment.
async function nextQuoteNumber() {
  const ref = doc(db, "counters", "quotations");
  const n = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? snap.data().next || 1 : 1;
    tx.set(ref, { next: current + 1 }, { merge: true });
    return current;
  });
  return `Q-${String(n).padStart(4, "0")}`;
}

// --- Pricing helpers (pure, used by both the builder UI and here) ---
export function computeLineTotal(item) {
  return (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
}

export function computeSubtotal(lineItems) {
  return (lineItems || []).reduce((sum, li) => sum + computeLineTotal(li), 0);
}

export function computeDiscountAmount(subtotal, discountType, discountValue) {
  const v = Number(discountValue) || 0;
  if (discountType === "percent") return Math.round((subtotal * v) / 100);
  return v;
}

export function computeTotals({ lineItems, discountType, discountValue, gstPercent }) {
  const subtotal = computeSubtotal(lineItems);
  const discountAmount = computeDiscountAmount(subtotal, discountType, discountValue);
  const taxable = Math.max(0, subtotal - discountAmount);
  const gstAmount = Math.round((taxable * (Number(gstPercent) || 0)) / 100);
  const total = taxable + gstAmount;
  return { subtotal, discountAmount, gstAmount, total };
}

// Latest event date across every line item, used as the anchor for
// auto-generated installment due dates ("last event date").
export function lastEventDate(lineItems) {
  const dates = (lineItems || [])
    .flatMap((li) => li.events || [])
    .map((ev) => ev.date)
    .filter(Boolean)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Turns a % split (e.g. [30, 60, 10]) into concrete installments against a
// total, with sensible default due dates: first on the issue date, the
// middle one(s) on the last event date, and the final installment 30 days
// after that (post-delivery). Every date/amount produced here stays
// freely editable afterwards in the builder.
export function buildInstallmentsFromSplit(splitPercents, total, issueDate, lastEvDate) {
  const n = splitPercents.length;
  return splitPercents.map((pct, idx) => {
    const amount = Math.round((total * pct) / 100);
    let dueDate = issueDate || "";
    if (idx === n - 1 && lastEvDate) {
      dueDate = addDays(lastEvDate, 30);
    } else if (idx > 0 && lastEvDate) {
      dueDate = lastEvDate;
    }
    return {
      id: `in_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      label: `Installment ${idx + 1}`,
      dueDate,
      amount,
    };
  });
}

// --- Quotation CRUD ---

const QUOTE_FIELDS = [
  "leadId",
  "clientName",
  "clientEmail",
  "clientPhone",
  "issueDate",
  "status",
  "lineItems",
  "discountType",
  "discountValue",
  "discountLabel",
  "gstPercent",
  "paymentScheduleLabel",
  "installments",
  "contractTemplateName",
  "contractHtml",
  "paymentDetails",
  "notesHtml",
];

function sanitize(data) {
  const out = {};
  for (const key of QUOTE_FIELDS) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  const { subtotal, discountAmount, gstAmount, total } = computeTotals({
    lineItems: data.lineItems || [],
    discountType: data.discountType || "flat",
    discountValue: data.discountValue || 0,
    gstPercent: data.gstPercent || 0,
  });
  out.subtotal = subtotal;
  out.discountAmount = discountAmount;
  out.gstAmount = gstAmount;
  out.total = total;
  // Back-compat alias: analytics/projects still read `amount` as "the
  // quote's value" — keep it in sync with the computed total.
  out.amount = total;
  out.lastEventDate = lastEventDate(data.lineItems || []);
  return out;
}

export async function createQuotation(data, createdByUid) {
  const now = new Date().toISOString();
  const quoteNumber = await nextQuoteNumber();
  const payload = {
    ...sanitize(data),
    quoteNumber,
    status: data.status || "draft",
    issueDate: data.issueDate || now.slice(0, 10),
    createdBy: createdByUid,
    createdAt: now,
    updatedAt: now,
  };
  const ref = await addDoc(collection(db, "quotations"), payload);
  return ref.id;
}

export async function updateQuotation(id, data) {
  await updateDoc(doc(db, "quotations", id), {
    ...sanitize(data),
    updatedAt: new Date().toISOString(),
  });
}

export async function setQuotationStatus(id, status) {
  await updateDoc(doc(db, "quotations", id), {
    status,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteQuotation(id) {
  await deleteDoc(doc(db, "quotations", id));
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

// Used by the public /q/[id] page — no auth, doc id is the share token.
export async function getQuotationById(id) {
  const snap = await getDoc(doc(db, "quotations", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// --- Client accept/reject response (public /q/[id] page, no auth) ---
// Only touches status + the response fields — matches the Firestore rule
// that permits an unauthenticated client to update just these keys.
export async function submitClientQuoteResponse(id, status, note) {
  if (status !== "accepted" && status !== "declined") {
    throw new Error("status must be 'accepted' or 'declined'");
  }
  await updateDoc(doc(db, "quotations", id), {
    status,
    clientResponseNote: note || "",
    respondedAt: new Date().toISOString(),
  });
}

// --- Installment payment tracking (Paid/Unpaid, shown on the public
// quote and rolled up by Analytics' P&L tab) ---

export function getPaymentSummary(quotation) {
  const installments = quotation?.installments || [];
  const totalScheduled = installments.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalPaid = installments
    .filter((i) => i.paid)
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const balance = Math.max(0, (quotation?.total || 0) - totalPaid);
  return { totalScheduled, totalPaid, balance };
}

async function setInstallmentPaid(quotationId, installmentId, paid) {
  const q = await getQuotationById(quotationId);
  if (!q) throw new Error("Quotation not found");
  const installments = (q.installments || []).map((i) =>
    i.id === installmentId
      ? { ...i, paid, paidDate: paid ? getISTDateStr() : null }
      : i
  );
  await updateDoc(doc(db, "quotations", quotationId), {
    installments,
    updatedAt: new Date().toISOString(),
  });
}

export const markInstallmentPaid = (quotationId, installmentId) =>
  setInstallmentPaid(quotationId, installmentId, true);
export const markInstallmentUnpaid = (quotationId, installmentId) =>
  setInstallmentPaid(quotationId, installmentId, false);

// Deep-clones a quotation into a fresh Draft (new number, new id) — the
// "duplicate" action in the Quotes list.
export async function duplicateQuotation(id, createdByUid) {
  const original = await getQuotationById(id);
  if (!original) throw new Error("Quotation not found");
  const { id: _id, quoteNumber: _qn, createdAt, updatedAt, createdBy, ...rest } = original;
  return createQuotation({ ...rest, status: "draft" }, createdByUid);
}