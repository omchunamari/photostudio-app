import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { db } from "./client";
import {
  DEFAULT_ACCOUNTS,
  DEFAULT_PROJECT_EXPENSE_CATEGORIES,
  DEFAULT_COMPANY_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  CAT_ADVANCE,
  CAT_ADVANCE_RETURN,
  TX_KINDS,
} from "@/lib/finance/constants";
import { getAllExpenses } from "./expenses";
import { getAllInvoices } from "./invoices";
import { legacyToTransactions } from "@/lib/finance/calc";

/**
 * Finance ledger.
 *
 * financeAccounts/{id}      name, type ("cash"|"bank"), openingBalance, active
 * financeTransactions/{id}  ONE row per money movement — everything else
 *                           (account balances, project P&L, person expense,
 *                           company P&L, reports) is computed from these rows,
 *                           so nothing is ever entered twice.
 * allowances/{id}           advance given to an employee for a project
 *
 * Transaction shape (see finance/calc.js for how each field is interpreted):
 * {
 *   kind: "income"|"expense"|"transfer"|"advance"|"advance_return"|"loan_in",
 *   scope: "project"|"company",
 *   status: "paid"|"pending",         // pending = payable, not yet paid out
 *   date, amount, category, description,
 *   accountId, toAccountId,           // toAccountId for transfers only
 *   projectId, projectName,
 *   personUid, personName, personType ("employee"|"freelancer"|"vendor"|null),
 *   source: "manual"|"salary"|"emi"|"allowance"|"employee_advance"|"loan",
 *   paidFrom: "account"|"allowance",  // spends out of an allowance touch no account
 *   allowanceId, payrollId, loanId, advanceId,
 *   principal, interest, plAmount,    // emi / salary breakdowns
 * }
 */

const now = () => new Date().toISOString();

export function newId(colName) {
  return doc(collection(db, colName)).id;
}

// ------------------------------- Accounts -------------------------------
export async function getAccounts() {
  const snap = await getDocs(collection(db, "financeAccounts"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || (a.createdAt || "").localeCompare(b.createdAt || ""));
}

/** First-run seed: Cash, Bank Account 1, Bank Account 2. Fixed ids so two tabs can't double-seed. */
export async function ensureDefaultAccounts() {
  const existing = await getAccounts();
  if (existing.length) return existing;
  const batch = writeBatch(db);
  DEFAULT_ACCOUNTS.forEach((a, i) => {
    batch.set(doc(db, "financeAccounts", a.id), {
      name: a.name,
      type: a.type,
      openingBalance: 0,
      active: true,
      order: i,
      createdAt: now(),
      updatedAt: now(),
    });
  });
  await batch.commit();
  return getAccounts();
}

export async function createAccount({ name, type, openingBalance }) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Account name is required");
  const id = newId("financeAccounts");
  await setDoc(doc(db, "financeAccounts", id), {
    name: trimmed,
    type: type === "cash" ? "cash" : "bank",
    openingBalance: Number(openingBalance) || 0,
    active: true,
    order: 50,
    createdAt: now(),
    updatedAt: now(),
  });
  return id;
}

export async function updateAccount(id, { name, openingBalance, active }) {
  await updateDoc(doc(db, "financeAccounts", id), {
    name: (name || "").trim(),
    openingBalance: Number(openingBalance) || 0,
    active: active !== false,
    updatedAt: now(),
  });
}

// ----------------------------- Categories -----------------------------
export async function getFinanceCategories() {
  const snap = await getDoc(doc(db, "orgSettings", "main"));
  const c = (snap.exists() && snap.data().financeCategories) || {};
  return {
    project: Array.isArray(c.project) ? c.project : DEFAULT_PROJECT_EXPENSE_CATEGORIES,
    company: Array.isArray(c.company) ? c.company : DEFAULT_COMPANY_EXPENSE_CATEGORIES,
    income: Array.isArray(c.income) ? c.income : DEFAULT_INCOME_CATEGORIES,
  };
}

export async function saveFinanceCategories(cats) {
  const clean = (arr) => {
    const seen = new Set();
    return arr
      .map((s) => String(s || "").trim())
      .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
  };
  const financeCategories = {
    project: clean(cats.project),
    company: clean(cats.company),
    income: clean(cats.income),
  };
  await setDoc(doc(db, "orgSettings", "main"), { financeCategories, updatedAt: now() }, { merge: true });
  return financeCategories;
}

// ---------------------------- Transactions ----------------------------
function buildTx(data, by) {
  if (!TX_KINDS.includes(data.kind)) throw new Error("Invalid transaction type");
  const amount = Number(data.amount);
  if (!(amount > 0)) throw new Error("Amount must be greater than zero");
  if (!data.date) throw new Error("Date is required");

  const pending = data.status === "pending";
  const fromAllowance = data.paidFrom === "allowance";
  if (data.kind === "transfer") {
    if (!data.accountId || !data.toAccountId) throw new Error("Select both accounts for a transfer");
    if (data.accountId === data.toAccountId) throw new Error("Choose two different accounts");
  } else if (!pending && !fromAllowance && !data.accountId) {
    throw new Error("Select an account");
  }
  if (data.kind === "income" && !data.projectId && !data.category) throw new Error("Category is required");
  if (data.kind === "expense" && !data.category) throw new Error("Category is required");

  return {
    kind: data.kind,
    scope: data.kind === "transfer" ? "company" : data.projectId ? "project" : "company",
    status: data.kind === "expense" && pending ? "pending" : "paid",
    date: data.date,
    amount,
    category: data.category || "",
    description: (data.description || "").trim(),
    accountId: data.accountId || null,
    toAccountId: data.kind === "transfer" ? data.toAccountId || null : null,
    projectId: data.projectId || null,
    projectName: data.projectId ? data.projectName || "" : "",
    personUid: data.personUid || null,
    personName: data.personName || null,
    personType: data.personType || null,
    source: data.source || "manual",
    paidFrom: fromAllowance ? "allowance" : "account",
    allowanceId: data.allowanceId || null,
    payrollId: data.payrollId || null,
    loanId: data.loanId || null,
    advanceId: data.advanceId || null,
    principal: data.principal ?? null,
    interest: data.interest ?? null,
    plAmount: data.plAmount ?? null,
    payee: data.payee || null, // vendor name for payables
    createdBy: by?.uid || null,
    createdByName: by?.name || "",
  };
}

export { buildTx as buildTransaction };

export async function createTransaction(data, by) {
  const id = newId("financeTransactions");
  await setDoc(doc(db, "financeTransactions", id), { ...buildTx(data, by), createdAt: now(), updatedAt: now() });
  return id;
}

export async function updateTransaction(id, data, by) {
  const built = buildTx(data, by);
  delete built.createdBy;
  delete built.createdByName;
  await updateDoc(doc(db, "financeTransactions", id), { ...built, updatedAt: now() });
}

export async function deleteTransaction(id) {
  await deleteDoc(doc(db, "financeTransactions", id));
}

/** Pays a pending payable: picks the account and stamps the payment date. */
export async function markPayablePaid(id, accountId, date) {
  if (!accountId) throw new Error("Select an account");
  await updateDoc(doc(db, "financeTransactions", id), {
    status: "paid",
    accountId,
    date: date || now().slice(0, 10),
    updatedAt: now(),
  });
}

export async function getTransactions() {
  const snap = await getDocs(query(collection(db, "financeTransactions"), orderBy("date", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Everything money-related as one stream: ledger rows plus the pre-Finance
 * `invoices` (paid) and `expenses`, so projects entered the old way still show
 * correct revenue / expense / profit.
 */
export async function getAllFinanceRows() {
  const [txs, invoices, expenses] = await Promise.all([getTransactions(), getAllInvoices(), getAllExpenses()]);
  return { ledger: txs, all: [...txs, ...legacyToTransactions(invoices, expenses)] };
}

/** Links an older project-page invoice/expense to a Cash/Bank account so it moves that balance. */
export async function setLegacyAccount(legacyId, accountId) {
  const isInvoice = legacyId.startsWith("legacy-inv-");
  const col = isInvoice ? "invoices" : "expenses";
  const id = legacyId.replace(/^legacy-(inv|exp)-/, "");
  await updateDoc(doc(db, col, id), { accountId: accountId || null, updatedAt: now() });
}

// ------------------------------ Allowances ------------------------------
/**
 * Giving an allowance is ONE write that (a) opens the allowance and (b) posts
 * the cash-out from the chosen account. It is NOT a project expense yet —
 * expense is recognised as the employee reports spends against it (each spend
 * is a normal transaction with allowanceId + paidFrom:"allowance"), so
 * category breakdowns stay accurate and nothing is counted twice.
 */
export async function createAllowance(data, by) {
  const amount = Number(data.amount);
  if (!(amount > 0)) throw new Error("Amount must be greater than zero");
  if (!data.employeeUid) throw new Error("Select an employee");
  if (!data.projectId) throw new Error("Select a project");
  if (!data.accountId) throw new Error("Select an account");
  const id = newId("allowances");
  const txId = newId("financeTransactions");
  const date = data.date || now().slice(0, 10);
  const batch = writeBatch(db);
  batch.set(doc(db, "allowances", id), {
    employeeUid: data.employeeUid,
    employeeName: data.employeeName || "",
    projectId: data.projectId,
    projectName: data.projectName || "",
    amount,
    accountId: data.accountId,
    date,
    note: data.note || "",
    status: "open",
    returned: 0,
    writtenOff: 0,
    givenTxId: txId,
    createdBy: by?.uid || null,
    createdAt: now(),
    updatedAt: now(),
  });
  batch.set(doc(db, "financeTransactions", txId), {
    ...buildTx(
      {
        kind: "advance",
        date,
        amount,
        category: CAT_ADVANCE,
        accountId: data.accountId,
        projectId: data.projectId,
        projectName: data.projectName,
        personUid: data.employeeUid,
        personName: data.employeeName,
        personType: "employee",
        description: data.note || `Allowance for ${data.projectName || "project"}`,
        source: "allowance",
        allowanceId: id,
      },
      by
    ),
    createdAt: now(),
    updatedAt: now(),
  });
  await batch.commit();
  return id;
}

export async function getAllowances() {
  const snap = await getDocs(query(collection(db, "allowances"), orderBy("date", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Used = spends logged against the allowance. Balance = given − used − returned − written off. */
export function allowanceSummary(allowance, txs) {
  const used = txs
    .filter((t) => t.allowanceId === allowance.id && t.kind === "expense")
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const returned = Number(allowance.returned) || 0;
  const writtenOff = Number(allowance.writtenOff) || 0;
  return {
    given: Number(allowance.amount) || 0,
    used,
    returned,
    writtenOff,
    balance: (Number(allowance.amount) || 0) - used - returned - writtenOff,
  };
}

/**
 * Settle an allowance. The leftover balance either goes back into an account
 * ("return") or is booked as a project expense ("expense" — e.g. the employee
 * keeps it as pocket money).
 */
export async function settleAllowance(allowance, balance, { mode, accountId, date }, by) {
  const d = date || now().slice(0, 10);
  const batch = writeBatch(db);
  const patch = { status: "settled", settledAt: now(), updatedAt: now() };
  if (balance > 0) {
    const txId = newId("financeTransactions");
    if (mode === "return") {
      if (!accountId) throw new Error("Select the account the balance is returned to");
      batch.set(doc(db, "financeTransactions", txId), {
        ...buildTx(
          {
            kind: "advance_return",
            date: d,
            amount: balance,
            category: CAT_ADVANCE_RETURN,
            accountId,
            projectId: allowance.projectId,
            projectName: allowance.projectName,
            personUid: allowance.employeeUid,
            personName: allowance.employeeName,
            personType: "employee",
            description: "Unspent allowance returned",
            source: "allowance",
            allowanceId: allowance.id,
          },
          by
        ),
        createdAt: now(),
        updatedAt: now(),
      });
      patch.returned = (Number(allowance.returned) || 0) + balance;
    } else {
      batch.set(doc(db, "financeTransactions", txId), {
        ...buildTx(
          {
            kind: "expense",
            date: d,
            amount: balance,
            category: "Miscellaneous",
            paidFrom: "allowance",
            projectId: allowance.projectId,
            projectName: allowance.projectName,
            personUid: allowance.employeeUid,
            personName: allowance.employeeName,
            personType: "employee",
            description: "Unspent allowance written off as expense",
            source: "allowance",
            allowanceId: allowance.id,
          },
          by
        ),
        createdAt: now(),
        updatedAt: now(),
      });
      patch.writtenOff = (Number(allowance.writtenOff) || 0) + balance;
    }
  }
  batch.update(doc(db, "allowances", allowance.id), patch);
  await batch.commit();
}

/** Only an allowance with no spends against it can be removed (its cash-out goes with it). */
export async function deleteAllowance(allowance, txs) {
  const hasSpends = txs.some((t) => t.allowanceId === allowance.id && t.id !== allowance.givenTxId);
  if (hasSpends) throw new Error("This allowance already has spends or a settlement logged against it");
  const batch = writeBatch(db);
  batch.delete(doc(db, "allowances", allowance.id));
  if (allowance.givenTxId) batch.delete(doc(db, "financeTransactions", allowance.givenTxId));
  await batch.commit();
}

export async function getTransactionsForProject(projectId) {
  const snap = await getDocs(query(collection(db, "financeTransactions"), where("projectId", "==", projectId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
