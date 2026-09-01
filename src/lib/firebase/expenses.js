import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
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
 *   category: string,         // e.g. "Travel", "Equipment", "Food", "Accommodation", "Miscellaneous", or any custom category — required for type "manual"
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

// Fixed defaults — always available, cannot be removed via Manage
// Categories. Org-added custom categories (see below) are layered on top.
export const DEFAULT_EXPENSE_CATEGORIES = ["Travel", "Equipment", "Accommodation", "Food", "Miscellaneous"];
// Back-compat alias — some pages already import this name.
export const MANUAL_EXPENSE_CATEGORIES = DEFAULT_EXPENSE_CATEGORIES;

// --- Org-wide custom expense categories, stored alongside the other
// org-wide config in orgSettings/main (see quoteSettings.js). Kept as a
// simple string array so "Add" is just an array-union write, no separate
// collection needed for what's essentially a short list of labels. ---
const ORG_SETTINGS_REF = () => doc(db, "orgSettings", "main");

export async function getCustomExpenseCategories() {
  const snap = await getDoc(ORG_SETTINGS_REF());
  const custom = snap.exists() ? snap.data().customExpenseCategories : [];
  return Array.isArray(custom) ? custom : [];
}

/** Full list shown in pickers: fixed defaults + org's custom categories. */
export async function getAllExpenseCategories() {
  const custom = await getCustomExpenseCategories();
  return [...DEFAULT_EXPENSE_CATEGORIES, ...custom];
}

export async function addCustomExpenseCategory(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Category name is required");
  if (DEFAULT_EXPENSE_CATEGORIES.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("That category already exists");
  }
  const existing = await getCustomExpenseCategories();
  if (existing.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("That category already exists");
  }
  const next = [...existing, trimmed];
  await setDoc(ORG_SETTINGS_REF(), { customExpenseCategories: next, updatedAt: new Date().toISOString() }, { merge: true });
  return next;
}

export async function removeCustomExpenseCategory(name) {
  const existing = await getCustomExpenseCategories();
  const next = existing.filter((c) => c !== name);
  await setDoc(ORG_SETTINGS_REF(), { customExpenseCategories: next, updatedAt: new Date().toISOString() }, { merge: true });
  return next;
}

export async function createExpense(data, createdByUid, createdByName) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "expenses"), {
    projectId: data.projectId,
    projectName: data.projectName || "",
    type: data.type,
    category: data.category || (data.type === "manual" ? "Miscellaneous" : ""),
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