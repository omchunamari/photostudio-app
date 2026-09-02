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

/**
 * Invoice doc shape (invoices/{id}):
 * {
 *   projectId: string,
 *   projectName: string,   // denormalized, for list/table display
 *   invoiceNumber: string, // e.g. "INV-0001"
 *   date: string,          // ISO date, when the invoice was raised
 *   amount: number,
 *   status: "unpaid" | "paid",
 *   note: string,
 *   createdBy: uid,
 *   createdByName: string,
 *   createdAt, updatedAt: ISO strings,
 * }
 *
 * Access is gated the same as expenses/quotations in firestore.rules
 * (isProjectOps() — admin/PM only): this is financial data.
 */

export const INVOICE_STATUSES = ["unpaid", "paid"];

/** Generates the next sequential invoice number (INV-0001, INV-0002, ...) by scanning existing invoices. */
export async function getNextInvoiceNumber() {
  const snap = await getDocs(collection(db, "invoices"));
  let max = 0;
  snap.docs.forEach((d) => {
    const n = parseInt((d.data().invoiceNumber || "").replace(/\D/g, ""), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  });
  return `INV-${String(max + 1).padStart(4, "0")}`;
}

export async function createInvoice(data, createdByUid, createdByName) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "invoices"), {
    projectId: data.projectId,
    projectName: data.projectName || "",
    invoiceNumber: data.invoiceNumber,
    date: data.date || now.slice(0, 10),
    amount: Number(data.amount) || 0,
    status: data.status || "unpaid",
    note: data.note || "",
    createdBy: createdByUid,
    createdByName: createdByName || "",
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateInvoice(id, data) {
  await updateDoc(doc(db, "invoices", id), {
    invoiceNumber: data.invoiceNumber,
    date: data.date,
    amount: Number(data.amount) || 0,
    status: data.status,
    note: data.note || "",
    updatedAt: new Date().toISOString(),
  });
}

export async function setInvoiceStatus(id, status) {
  await updateDoc(doc(db, "invoices", id), {
    status,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteInvoice(id) {
  await deleteDoc(doc(db, "invoices", id));
}

export async function getInvoicesForProject(projectId) {
  const q = query(
    collection(db, "invoices"),
    where("projectId", "==", projectId),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAllInvoices() {
  const q = query(collection(db, "invoices"), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Sum of "paid" invoices only — this is what counts as actually Received. */
export function sumReceived(invoices) {
  return invoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + (inv.amount || 0), 0);
}