import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  increment,
} from "firebase/firestore";
import { db } from "./client";
import { buildTransaction, newId } from "./finance";
import { CAT_ADVANCE, CAT_SALARY, DEFAULT_ANNUAL_PAID_LEAVES } from "@/lib/finance/constants";
import { addMonthsISO } from "@/lib/finance/payrollCalc";
import { round2 } from "@/lib/finance/calc";
import { getISTDateStr } from "@/lib/dateIST";

const now = () => new Date().toISOString();

/**
 * Payroll data — deliberately NOT stored on users/{uid}: that document is
 * self-writable by the employee (see firestore.rules), which would let anyone
 * edit their own salary.
 *
 * employeeFinance/{uid}  monthlySalary, annualPaidLeaves, lastIncrementDate,
 *                        nextIncrementDate, increments[] (history)
 * payrolls/{YYYY-MM_uid} one salary run per employee per month; status
 *                        "processed" -> "paid". Holds a full snapshot so a
 *                        payslip never changes if the salary later does.
 * employeeAdvances/{id}  salary advances / staff loans, recovered through payroll
 */

// ------------------------- Salary structure -------------------------
export async function getAllEmployeeFinance() {
  const snap = await getDocs(collection(db, "employeeFinance"));
  const map = {};
  snap.docs.forEach((d) => {
    map[d.id] = { uid: d.id, ...d.data() };
  });
  return map;
}

export async function saveSalaryStructure(uid, { monthlySalary, annualPaidLeaves, nextIncrementDate }) {
  const sal = Number(monthlySalary);
  if (!(sal >= 0)) throw new Error("Enter a valid salary");
  await setDoc(
    doc(db, "employeeFinance", uid),
    {
      monthlySalary: sal,
      annualPaidLeaves: annualPaidLeaves === "" || annualPaidLeaves == null ? DEFAULT_ANNUAL_PAID_LEAVES : Number(annualPaidLeaves),
      nextIncrementDate: nextIncrementDate || null,
      updatedAt: now(),
    },
    { merge: true }
  );
}

/**
 * Applies an increment: by amount or by percent. Appends to history, updates
 * current salary + last/next increment dates. Future payroll uses the new
 * salary; already-processed months keep their snapshot.
 */
export async function applyIncrement(uid, current, { mode, value, effectiveDate, note, nextIncrementDate }, by) {
  const v = Number(value);
  if (!(v > 0)) throw new Error("Enter an increment amount or percentage");
  const oldSalary = Number(current?.monthlySalary) || 0;
  if (!oldSalary) throw new Error("Set the current salary first");
  const amount = mode === "percent" ? round2((oldSalary * v) / 100) : v;
  const newSalary = round2(oldSalary + amount);
  const date = effectiveDate || getISTDateStr();
  const entry = {
    date,
    oldSalary,
    newSalary,
    amount,
    percent: round2((amount / oldSalary) * 100),
    note: note || "",
    by: by?.name || "",
  };
  await setDoc(
    doc(db, "employeeFinance", uid),
    {
      monthlySalary: newSalary,
      lastIncrementDate: date,
      nextIncrementDate: nextIncrementDate || addMonthsISO(date, 12),
      increments: [...(current?.increments || []), entry],
      updatedAt: now(),
    },
    { merge: true }
  );
  return entry;
}

// ------------------- Salary advances / staff loans -------------------
export async function getEmployeeAdvances() {
  const snap = await getDocs(collection(db, "employeeAdvances"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export function advanceOutstanding(a) {
  return Math.max(0, round2((Number(a.amount) || 0) - (Number(a.recovered) || 0)));
}

/** Gives an advance/loan to an employee: one write that also posts the cash-out. */
export async function createEmployeeAdvance(data, by) {
  const amount = Number(data.amount);
  if (!(amount > 0)) throw new Error("Amount must be greater than zero");
  if (!data.employeeUid) throw new Error("Select an employee");
  if (!data.accountId) throw new Error("Select an account");
  const id = newId("employeeAdvances");
  const txId = newId("financeTransactions");
  const date = data.date || getISTDateStr();
  const batch = writeBatch(db);
  batch.set(doc(db, "employeeAdvances", id), {
    employeeUid: data.employeeUid,
    employeeName: data.employeeName || "",
    kind: data.kind === "loan" ? "loan" : "salary_advance",
    amount,
    recovered: 0,
    monthlyRecovery: Number(data.monthlyRecovery) || amount,
    accountId: data.accountId,
    date,
    note: data.note || "",
    status: "open",
    txId,
    createdAt: now(),
    updatedAt: now(),
  });
  batch.set(doc(db, "financeTransactions", txId), {
    ...buildTransaction(
      {
        kind: "advance",
        date,
        amount,
        category: CAT_ADVANCE,
        accountId: data.accountId,
        personUid: data.employeeUid,
        personName: data.employeeName,
        personType: "employee",
        description: data.kind === "loan" ? "Staff loan" : "Salary advance",
        source: "employee_advance",
        advanceId: id,
      },
      by
    ),
    createdAt: now(),
    updatedAt: now(),
  });
  await batch.commit();
  return id;
}

// ------------------------------ Payroll ------------------------------
export function payrollId(ym, uid) {
  return `${ym}_${uid}`;
}

export async function getPayrollsForMonth(ym) {
  const snap = await getDocs(query(collection(db, "payrolls"), where("month", "==", ym)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAllPayrolls() {
  const snap = await getDocs(collection(db, "payrolls"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.month || "").localeCompare(a.month || ""));
}

/** An employee's own payslips — the query is scoped by uid so it satisfies the read rule. */
export async function getPayrollsForEmployee(uid) {
  const snap = await getDocs(query(collection(db, "payrolls"), where("employeeUid", "==", uid)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.month || "").localeCompare(a.month || ""));
}

/** Saves (or re-saves) a month's computed figures. A paid payroll is locked. */
export async function processPayroll(row, by) {
  const id = payrollId(row.month, row.employeeUid);
  const existing = await getDoc(doc(db, "payrolls", id));
  if (existing.exists() && existing.data().status === "paid") {
    throw new Error(`${row.employeeName}'s ${row.month} salary is already paid`);
  }
  await setDoc(doc(db, "payrolls", id), {
    ...row,
    status: "processed",
    processedAt: now(),
    processedBy: by?.name || "",
    paidAt: null,
    accountId: null,
    txId: null,
  });
  return id;
}

/**
 * Pays a processed salary: ONE batch that marks it paid, posts the
 * Salary expense against the chosen account (which is what reduces the
 * balance and lands in Company P&L), and books the advance recovery.
 */
export async function paySalary(payroll, { accountId, date }, by) {
  if (!accountId) throw new Error("Select the account to pay from");
  const ref = doc(db, "payrolls", payroll.id);
  const fresh = await getDoc(ref);
  if (!fresh.exists()) throw new Error("Payroll not found");
  if (fresh.data().status === "paid") throw new Error("This salary is already paid");

  const payDate = date || getISTDateStr();
  const txId = newId("financeTransactions");
  const recoveries = payroll.recoveries || [];
  const batch = writeBatch(db);

  batch.set(doc(db, "financeTransactions", txId), {
    ...buildTransaction(
      {
        kind: "expense",
        date: payDate,
        amount: payroll.netSalary,
        category: CAT_SALARY,
        accountId,
        personUid: payroll.employeeUid,
        personName: payroll.employeeName,
        personType: "employee",
        description: `Salary ${payroll.month}`,
        source: "salary",
        payrollId: payroll.id,
        plAmount: round2((Number(payroll.netSalary) || 0) + (Number(payroll.advanceRecovery) || 0)),
      },
      by
    ),
    createdAt: now(),
    updatedAt: now(),
  });
  batch.update(ref, { status: "paid", paidAt: payDate, accountId, txId });

  for (const r of recoveries) {
    const aRef = doc(db, "employeeAdvances", r.advanceId);
    batch.update(aRef, {
      recovered: increment(r.amount),
      status: r.clears ? "cleared" : "open",
      updatedAt: now(),
    });
  }
  await batch.commit();
  return txId;
}

/** Reverses a payment (mis-click / wrong account): deletes its expense and re-opens the payroll. */
export async function undoSalaryPayment(payroll) {
  if (payroll.status !== "paid") return;
  const batch = writeBatch(db);
  if (payroll.txId) batch.delete(doc(db, "financeTransactions", payroll.txId));
  batch.update(doc(db, "payrolls", payroll.id), { status: "processed", paidAt: null, accountId: null, txId: null });
  for (const r of payroll.recoveries || []) {
    batch.update(doc(db, "employeeAdvances", r.advanceId), {
      recovered: increment(-r.amount),
      status: "open",
      updatedAt: now(),
    });
  }
  await batch.commit();
}

// ---------------- Source data for leave / attendance ----------------
export async function getApprovedLeaveForYear(year) {
  const snap = await getDocs(
    query(
      collection(db, "leaveRequests"),
      where("startDate", ">=", `${year}-01-01`),
      where("startDate", "<=", `${year}-12-31`)
    )
  );
  return snap.docs.map((d) => d.data()).filter((r) => r.status === "approved");
}

export async function getAutoLeaveForYear(year) {
  const snap = await getDocs(
    query(
      collection(db, "attendance"),
      where("status", "==", "auto_leave"),
      where("date", ">=", `${year}-01-01`),
      where("date", "<=", `${year}-12-31`)
    )
  );
  return snap.docs.map((d) => d.data());
}
