import {
  collection,
  doc,
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
 * Expense doc shape (expenses/{id}):
 * {
 *   projectId: string,
 *   projectName: string,      // denormalized, for list/table display
 *   type: "freelancer_payout" | "advance" | "manual",
 *   category: string,         // e.g. "Travel", "Equipment", "Food", "Misc" — required for type "manual"
 *   amount: number,
 *   description: string,
 *   personUid: string | null,     // set for freelancer_payout and advance
 *   personName: string | null,
 *   personType: "employee" | "freelancer" | null,
 *   date: string,              // ISO date, when the expense was incurred/paid
 *   createdBy: uid,
 *   createdByName: string,
 *   createdAt, updatedAt: ISO strings,
 * }
 *
 * Access is gated the same as leads/quotations in firestore.rules
 * (isProjectOps() — admin/PM only): this is financial data, not something
 * every employee should be able to read or log.
 */

export const EXPENSE_TYPES = ["freelancer_payout", "advance", "manual"];
export const MANUAL_EXPENSE_CATEGORIES = ["Travel", "Equipment", "Food", "Accommodation", "Misc"];

export async function createExpense(data, createdByUid, createdByName) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "expenses"), {
    projectId: data.projectId,
    projectName: data.projectName || "",
    type: data.type,
    category: data.category || (data.type === "manual" ? "Misc" : ""),
    amount: Number(data.amount) || 0,
    description: data.description || "",
    personUid: data.personUid || null,
    personName: data.personName || null,
    personType: data.personType || null,
    date: data.date || now.slice(0, 10),
    createdBy: createdByUid,
    createdByName: createdByName || "",
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateExpense(id, data) {
  await updateDoc(doc(db, "expenses", id), {
    category: data.category || "",
    amount: Number(data.amount) || 0,
    description: data.description || "",
    date: data.date,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteExpense(id) {
  await deleteDoc(doc(db, "expenses", id));
}

export async function getAllExpenses() {
  const q = query(collection(db, "expenses"), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getExpensesForProject(projectId) {
  const q = query(
    collection(db, "expenses"),
    where("projectId", "==", projectId),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Sums an array of expenses by projectId — used by the P&L view, which
 * loads all expenses once and groups them client-side rather than firing
 * one query per project.
 */
export function sumExpensesByProject(expenses) {
  const map = {};
  expenses.forEach((e) => {
    map[e.projectId] = (map[e.projectId] || 0) + (e.amount || 0);
  });
  return map;
}