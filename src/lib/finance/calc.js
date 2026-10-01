import {
  CAT_EMI,
  CAT_SALARY,
  OFFICE_CATEGORIES,
  MARKETING_CATEGORIES,
  SOFTWARE_CATEGORIES,
} from "./constants";
import { collectionDate } from "@/lib/firebase/invoices";

// ---------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------
export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function inr(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}₹${Math.abs(Math.round(v)).toLocaleString("en-IN")}`;
}

/** Plain-number INR used inside PDFs, where the ₹ glyph is missing from jsPDF's built-in fonts. */
export function inrPlain(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}Rs. ${Math.abs(Math.round(v)).toLocaleString("en-IN")}`;
}

// ---------------------------------------------------------------------
// Legacy bridge.
//
// Before the Finance module, project money lived in `invoices` (paid =
// received) and `expenses`. Those collections stay untouched; here they are
// re-shaped into ledger-style rows so every report / P&L sees ONE stream.
// Legacy rows move an account balance only once an account has been assigned
// to them (on the project page, or via "Assign account" in Finance).
// ---------------------------------------------------------------------
export function legacyToTransactions(invoices = [], expenses = []) {
  const rows = [];
  invoices.forEach((inv) => {
    if (inv.status !== "paid") return;
    rows.push({
      id: `legacy-inv-${inv.id}`,
      legacy: true,
      kind: "income",
      scope: "project",
      status: "paid",
      date: collectionDate(inv),
      accountId: inv.accountId || null,
      amount: Number(inv.amount) || 0,
      category: "Project Payment",
      projectId: inv.projectId,
      projectName: inv.projectName || "",
      description: `Invoice ${inv.invoiceNumber || ""}`.trim(),
    });
  });
  expenses.forEach((e) => {
    rows.push({
      id: `legacy-exp-${e.id}`,
      legacy: true,
      kind: "expense",
      scope: "project",
      status: "paid",
      date: e.date,
      accountId: e.accountId || null,
      amount: Number(e.amount) || 0,
      category: e.category || (e.type === "freelancer_payout" ? "Freelancer" : e.type === "advance" ? "Advance" : "Miscellaneous"),
      projectId: e.projectId,
      projectName: e.projectName || "",
      personUid: e.personUid || null,
      personName: e.personName || null,
      personType: e.personType || null,
      description: e.description || "",
    });
  });
  return rows;
}

// ---------------------------------------------------------------------
// Per-transaction accounting rules — the single place that decides how a
// transaction touches accounts and the P&L.
// ---------------------------------------------------------------------

/** [{accountId, delta}] — how a transaction moves account balances. */
export function accountEffects(tx) {
  const amt = Number(tx.amount) || 0;
  if (!amt) return [];
  // Pending payables and spends paid out of an employee's allowance don't
  // touch an account (the allowance advance already did).
  if (tx.status === "pending" || tx.paidFrom === "allowance") return [];
  switch (tx.kind) {
    case "income":
    case "advance_return":
    case "loan_in":
      return tx.accountId ? [{ accountId: tx.accountId, delta: amt }] : [];
    case "expense":
    case "advance":
      return tx.accountId ? [{ accountId: tx.accountId, delta: -amt }] : [];
    case "transfer": {
      const out = [];
      if (tx.accountId) out.push({ accountId: tx.accountId, delta: -amt });
      if (tx.toAccountId) out.push({ accountId: tx.toAccountId, delta: amt });
      return out;
    }
    default:
      return [];
  }
}

/** Revenue this transaction contributes to P&L. */
export function plIncome(tx) {
  return tx.kind === "income" ? Number(tx.amount) || 0 : 0;
}

/**
 * Expense this transaction contributes to P&L. An EMI moves the full EMI out
 * of the bank, but only the interest portion is a cost — principal repays a
 * liability.
 */
export function plExpense(tx) {
  if (tx.kind !== "expense") return 0;
  if (tx.source === "emi") return Number(tx.interest) || 0;
  // Salary: cost to the company is the net paid PLUS any advance recovered
  // (recovery clears an employee balance, it doesn't make the salary cheaper).
  if (tx.source === "salary" && tx.plAmount != null) return Number(tx.plAmount) || 0;
  return Number(tx.amount) || 0;
}

/** Which Company P&L line an expense belongs to. */
export function companyBucket(tx) {
  if (tx.source === "emi") return "Loan Interest";
  if (tx.scope === "project" || tx.projectId) return "Project Expenses";
  if (tx.category === CAT_SALARY || tx.source === "salary") return "Salaries";
  if (MARKETING_CATEGORIES.includes(tx.category)) return "Marketing";
  if (SOFTWARE_CATEGORIES.includes(tx.category)) return "Software";
  if (OFFICE_CATEGORIES.includes(tx.category)) return "Office Expenses";
  return "Other Company Expenses";
}

// ---------------------------------------------------------------------
// Account balances
// ---------------------------------------------------------------------
export function computeBalances(accounts, transactions) {
  const map = {};
  accounts.forEach((a) => {
    map[a.id] = Number(a.openingBalance) || 0;
  });
  transactions.forEach((tx) => {
    accountEffects(tx).forEach(({ accountId, delta }) => {
      if (accountId in map) map[accountId] = round2(map[accountId] + delta);
    });
  });
  return map;
}

// ---------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------
export function inDateRange(dateStr, from, to) {
  if (!dateStr) return false;
  const d = String(dateStr).slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function filterTransactions(txs, f = {}) {
  return txs.filter((tx) => {
    if ((f.from || f.to) && !inDateRange(tx.date, f.from, f.to)) return false;
    if (f.projectId && tx.projectId !== f.projectId) return false;
    if (f.personUid && tx.personUid !== f.personUid) return false;
    if (f.category && tx.category !== f.category) return false;
    if (f.accountId && tx.accountId !== f.accountId && tx.toAccountId !== f.accountId) return false;
    return true;
  });
}

// ---------------------------------------------------------------------
// Project money
// ---------------------------------------------------------------------
export function projectFinancials(project, txs) {
  const mine = txs.filter((t) => t.projectId === project.id);
  const value = Number(project.quotationAmount) || 0;
  const received = mine.reduce((s, t) => s + plIncome(t), 0);
  const expense = mine.reduce((s, t) => s + plExpense(t), 0);
  const byCategory = {};
  mine.forEach((t) => {
    const e = plExpense(t);
    if (e) byCategory[t.category || "Uncategorised"] = round2((byCategory[t.category || "Uncategorised"] || 0) + e);
  });
  return {
    value,
    received,
    pending: Math.max(value - received, 0),
    expense,
    // Profit is on money actually received, so it moves as each payment / expense is entered.
    profit: received - expense,
    byCategory,
  };
}

// ---------------------------------------------------------------------
// Company P&L
// ---------------------------------------------------------------------
export function companyPnL(txs) {
  const revenue = { "Project Income": 0, "Other Income": 0 };
  const expenses = {
    "Project Expenses": 0,
    Salaries: 0,
    "Office Expenses": 0,
    Marketing: 0,
    Software: 0,
    "Other Company Expenses": 0,
  };
  const finance = { "Loan Interest": 0, "Other Finance Costs": 0 };

  txs.forEach((t) => {
    const inc = plIncome(t);
    if (inc) {
      if (t.projectId) revenue["Project Income"] += inc;
      else revenue["Other Income"] += inc;
    }
    const exp = plExpense(t);
    if (exp) {
      const b = companyBucket(t);
      if (b === "Loan Interest") finance["Loan Interest"] += exp;
      else if (b === "Other Finance Costs") finance["Other Finance Costs"] += exp;
      else expenses[b] += exp;
    }
  });

  const totalRevenue = Object.values(revenue).reduce((a, b) => a + b, 0);
  const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0);
  const totalFinance = Object.values(finance).reduce((a, b) => a + b, 0);
  return {
    revenue,
    expenses,
    finance,
    totalRevenue,
    totalExpenses,
    totalFinance,
    profit: totalRevenue - totalExpenses - totalFinance,
  };
}

export function monthKey(dateStr) {
  return dateStr ? String(dateStr).slice(0, 7) : "";
}

export { CAT_EMI };
