import { doc, deleteDoc, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "./client";
import { buildTransaction, newId } from "./finance";
import { undoSalaryPayment } from "./payroll";
import { CAT_LOAN_RECEIPT } from "@/lib/finance/constants";
import { addMonthsISO } from "@/lib/finance/payrollCalc";
import { round2 } from "@/lib/finance/calc";

/**
 * Edit / delete for everything the Finance flows create. A ledger row made by
 * a flow (salary, EMI, allowance, staff advance, loan receipt) is tied to a
 * parent doc that keeps running totals, so it's never deleted on its own —
 * each helper here reverses the parent in the same batch, keeping balances,
 * P&L and the parent screens in step.
 */

const now = () => new Date().toISOString();
const txRef = (id) => doc(db, "financeTransactions", id);

/** Which flow a ledger row came from — drives the edit/delete wording. */
export function linkedKind(tx) {
  if (!tx || tx.legacy) return null;
  if (tx.source === "salary") return "salary";
  if (tx.source === "emi") return "emi";
  if (tx.source === "loan") return "loan_in";
  if (tx.source === "employee_advance") return "employee_advance";
  if (tx.source === "allowance") {
    if (tx.kind === "advance") return "allowance_given";
    if (tx.kind === "advance_return") return "allowance_return";
    return "allowance_writeoff";
  }
  return null;
}

/** Confirmation text for deleting a row, saying what else it reverses. */
export function describeDelete(tx, ctx) {
  switch (linkedKind(tx)) {
    case "salary":
      return `Reverse this salary payment for ${tx.personName || "the employee"}? The payroll goes back to "Processed" and any advance recovered through it is undone.`;
    case "emi":
      return "Undo this EMI? The loan's outstanding goes back up by its principal and the EMI count drops by one.";
    case "loan_in":
      return "Remove this loan receipt? The loan stays; only the money-in entry on the account is removed.";
    case "employee_advance":
      return `Delete this advance to ${tx.personName || "the employee"}? Its cash-out entry is removed too.`;
    case "allowance_given": {
      const n = (ctx?.ledger || []).filter((t) => t.allowanceId === tx.allowanceId && t.id !== tx.id).length;
      return `Delete the whole allowance for ${tx.personName || "the employee"}?${n ? ` This also deletes ${n} spend/settlement entr${n === 1 ? "y" : "ies"} logged against it.` : ""}`;
    }
    case "allowance_return":
    case "allowance_writeoff":
      return "Undo this allowance settlement? The allowance reopens with its balance restored.";
    default:
      return "Delete this transaction? Balances and P&L will update.";
  }
}

/** Deletes any ledger row, reversing whatever parent record it belongs to. */
export async function deleteLedgerEntry(tx, ctx) {
  const kind = linkedKind(tx);
  if (kind === "salary") {
    const payroll = ctx.payrolls.find((p) => p.id === tx.payrollId);
    if (payroll && payroll.status === "paid" && payroll.txId === tx.id) return undoSalaryPayment(payroll);
  }
  if (kind === "emi") {
    const loan = ctx.loans.find((l) => l.id === tx.loanId);
    if (loan) return undoEmi(loan, tx);
  }
  if (kind === "loan_in") {
    const batch = writeBatch(db);
    batch.delete(txRef(tx.id));
    if (ctx.loans.some((l) => l.id === tx.loanId)) batch.update(doc(db, "loans", tx.loanId), { accountId: null, updatedAt: now() });
    return batch.commit();
  }
  if (kind === "employee_advance") {
    const adv = ctx.advances.find((a) => a.id === tx.advanceId);
    if (adv) return deleteEmployeeAdvance(adv, ctx.payrolls);
  }
  if (kind === "allowance_given") {
    const a = ctx.allowances.find((x) => x.id === tx.allowanceId);
    if (a) return deleteAllowanceCascade(a, ctx.ledger);
  }
  if (kind === "allowance_return" || kind === "allowance_writeoff") {
    const a = ctx.allowances.find((x) => x.id === tx.allowanceId);
    const batch = writeBatch(db);
    batch.delete(txRef(tx.id));
    if (a) {
      const field = kind === "allowance_return" ? "returned" : "writtenOff";
      batch.update(doc(db, "allowances", a.id), {
        [field]: Math.max(0, round2((Number(a[field]) || 0) - (Number(tx.amount) || 0))),
        status: "open",
        settledAt: null,
        updatedAt: now(),
      });
    }
    return batch.commit();
  }
  // Manual rows, allowance spends, and rows whose parent is already gone.
  return deleteDoc(txRef(tx.id));
}

/**
 * Date / account / note on a flow-made row. Amounts stay with the flow that
 * computed them (payroll, EMI split, allowance, advance, loan) so the parent's
 * totals can't drift from the ledger.
 */
export async function updateLedgerEntryBasics(tx, { date, accountId, description }) {
  if (!date) throw new Error("Date is required");
  const usesAccount = tx.paidFrom !== "allowance";
  if (usesAccount && !accountId) throw new Error("Select an account");
  const batch = writeBatch(db);
  batch.update(txRef(tx.id), {
    date,
    ...(usesAccount ? { accountId } : {}),
    description: (description || "").trim(),
    updatedAt: now(),
  });
  const kind = linkedKind(tx);
  if (kind === "salary" && tx.payrollId) batch.update(doc(db, "payrolls", tx.payrollId), { paidAt: date, accountId });
  if (kind === "loan_in" && tx.loanId) batch.update(doc(db, "loans", tx.loanId), { accountId, updatedAt: now() });
  if (kind === "employee_advance" && tx.advanceId)
    batch.update(doc(db, "employeeAdvances", tx.advanceId), { date, accountId, updatedAt: now() });
  if (kind === "allowance_given" && tx.allowanceId)
    batch.update(doc(db, "allowances", tx.allowanceId), { date, accountId, updatedAt: now() });
  await batch.commit();
}

// -------------------------------- Loans --------------------------------
/** Reverses one paid EMI: deletes its expense and puts the principal back on the loan. */
export async function undoEmi(loan, tx) {
  const principal = Number(tx.principal) || 0;
  const interest = Number(tx.interest) || 0;
  const outstanding = round2((Number(loan.outstanding) || 0) + principal);
  const batch = writeBatch(db);
  batch.delete(txRef(tx.id));
  batch.update(doc(db, "loans", loan.id), {
    outstanding,
    paidCount: Math.max(0, (loan.paidCount || 0) - 1),
    totalPrincipalPaid: Math.max(0, round2((loan.totalPrincipalPaid || 0) - principal)),
    totalInterestPaid: Math.max(0, round2((loan.totalInterestPaid || 0) - interest)),
    status: outstanding > 0 ? "active" : "closed",
    updatedAt: now(),
  });
  await batch.commit();
}

/**
 * Edits a loan's terms. Outstanding is recomputed as amount − principal
 * already repaid; the loan-receipt entry follows the amount, date and account.
 */
export async function updateLoan(loan, form, ledger, by) {
  const amount = Number(form.amount);
  if (!form.name?.trim()) throw new Error("Loan name is required");
  if (!(amount > 0)) throw new Error("Loan amount must be greater than zero");
  if (!(Number(form.emi) > 0)) throw new Error("EMI must be greater than zero");
  if (!form.startDate) throw new Error("First EMI date is required");
  const repaid = Number(loan.totalPrincipalPaid) || 0;
  if (amount < repaid) throw new Error(`Amount can't be below the principal already repaid (${repaid})`);
  const outstanding = round2(amount - repaid);
  const name = form.name.trim();

  const batch = writeBatch(db);
  batch.update(doc(db, "loans", loan.id), {
    name,
    lender: (form.lender || "").trim(),
    amount,
    interestRate: Number(form.interestRate) || 0,
    emi: Number(form.emi),
    startDate: form.startDate,
    tenureMonths: Number(form.tenureMonths) || 0,
    outstanding,
    status: outstanding > 0 ? "active" : "closed",
    accountId: form.disbursalAccountId || null,
    updatedAt: now(),
  });
  const receipt = ledger.find((t) => t.loanId === loan.id && t.kind === "loan_in");
  if (receipt && !form.disbursalAccountId) batch.delete(txRef(receipt.id));
  else if (receipt)
    batch.update(txRef(receipt.id), {
      amount,
      date: form.startDate,
      accountId: form.disbursalAccountId,
      description: `${name} disbursed`,
      updatedAt: now(),
    });
  else if (form.disbursalAccountId)
    batch.set(txRef(newId("financeTransactions")), {
      ...buildTransaction(
        {
          kind: "loan_in",
          date: form.startDate,
          amount,
          category: CAT_LOAN_RECEIPT,
          accountId: form.disbursalAccountId,
          description: `${name} disbursed`,
          source: "loan",
          loanId: loan.id,
        },
        by
      ),
      createdAt: now(),
      updatedAt: now(),
    });
  await batch.commit();
}

/** Deletes a loan with its receipt and every EMI paid on it (balances and P&L roll back). */
export async function deleteLoan(loan, ledger) {
  const batch = writeBatch(db);
  ledger.filter((t) => t.loanId === loan.id).forEach((t) => batch.delete(txRef(t.id)));
  batch.delete(doc(db, "loans", loan.id));
  await batch.commit();
}

// ------------------------------ Allowances ------------------------------
/**
 * Edits an allowance. Its cash-out entry follows; if the employee or project
 * changes, the spends and settlements logged against it move with it.
 */
export async function updateAllowance(a, form, ledger) {
  const amount = Number(form.amount);
  if (!(amount > 0)) throw new Error("Amount must be greater than zero");
  if (!form.employeeUid) throw new Error("Select an employee");
  if (!form.projectId) throw new Error("Select a project");
  if (!form.accountId) throw new Error("Select an account");
  if (!form.date) throw new Error("Date is required");
  const who = { personUid: form.employeeUid, personName: form.employeeName || "", projectId: form.projectId, projectName: form.projectName || "" };

  const batch = writeBatch(db);
  batch.update(doc(db, "allowances", a.id), {
    employeeUid: form.employeeUid,
    employeeName: form.employeeName || "",
    projectId: form.projectId,
    projectName: form.projectName || "",
    amount,
    accountId: form.accountId,
    date: form.date,
    note: (form.note || "").trim(),
    updatedAt: now(),
  });
  ledger
    .filter((t) => t.allowanceId === a.id)
    .forEach((t) => {
      const isGiven = t.id === a.givenTxId || (t.kind === "advance" && t.source === "allowance");
      batch.update(txRef(t.id), {
        ...who,
        ...(isGiven
          ? { amount, accountId: form.accountId, date: form.date, description: (form.note || "").trim() || `Allowance for ${form.projectName || "project"}` }
          : {}),
        updatedAt: now(),
      });
    });
  await batch.commit();
}

/** Undoes a settlement: removes the return / write-off entries and reopens the allowance. */
export async function reopenAllowance(a, ledger) {
  const batch = writeBatch(db);
  ledger
    .filter((t) => t.allowanceId === a.id && t.source === "allowance" && t.kind !== "advance")
    .forEach((t) => batch.delete(txRef(t.id)));
  batch.update(doc(db, "allowances", a.id), { status: "open", returned: 0, writtenOff: 0, settledAt: null, updatedAt: now() });
  await batch.commit();
}

/** Deletes an allowance together with its cash-out, spends and settlement entries. */
export async function deleteAllowanceCascade(a, ledger) {
  const batch = writeBatch(db);
  ledger.filter((t) => t.allowanceId === a.id).forEach((t) => batch.delete(txRef(t.id)));
  if (a.givenTxId) batch.delete(txRef(a.givenTxId));
  batch.delete(doc(db, "allowances", a.id));
  await batch.commit();
}

// --------------------------- Staff advances ---------------------------
export async function updateEmployeeAdvance(adv, form) {
  const amount = Number(form.amount);
  const recovered = Number(adv.recovered) || 0;
  if (!(amount > 0)) throw new Error("Amount must be greater than zero");
  if (amount < recovered) throw new Error(`Amount can't be below what's already recovered (${recovered})`);
  if (!form.accountId) throw new Error("Select an account");
  if (!form.date) throw new Error("Date is required");
  const kind = form.kind === "loan" ? "loan" : "salary_advance";
  const batch = writeBatch(db);
  batch.update(doc(db, "employeeAdvances", adv.id), {
    kind,
    amount,
    monthlyRecovery: Number(form.monthlyRecovery) || amount,
    accountId: form.accountId,
    date: form.date,
    note: (form.note || "").trim(),
    status: recovered >= amount ? "cleared" : "open",
    updatedAt: now(),
  });
  if (adv.txId)
    batch.update(txRef(adv.txId), {
      amount,
      accountId: form.accountId,
      date: form.date,
      description: kind === "loan" ? "Staff loan" : "Salary advance",
      updatedAt: now(),
    });
  await batch.commit();
}

/** An advance that payroll has already recovered from can't be deleted — reverse those salary payments first. */
export async function deleteEmployeeAdvance(adv, payrolls = []) {
  if ((Number(adv.recovered) || 0) > 0)
    throw new Error("Part of this advance was already recovered through salary. Reverse those salary payments first, or edit the amount instead.");
  const pending = payrolls.find((p) => p.status !== "paid" && (p.recoveries || []).some((r) => r.advanceId === adv.id));
  if (pending) throw new Error(`The ${pending.month} payroll is set to recover this advance. Discard or recalculate that payroll first.`);
  const batch = writeBatch(db);
  if (adv.txId) batch.delete(txRef(adv.txId));
  batch.delete(doc(db, "employeeAdvances", adv.id));
  await batch.commit();
}

// ------------------------------- Accounts -------------------------------
/** Number of entries that move this account — an account in use can only be deactivated. */
export function accountUsage(accountId, data) {
  return data.all.filter((t) => t.accountId === accountId || t.toAccountId === accountId).length;
}

export async function deleteAccount(account, data) {
  const used = accountUsage(account.id, data);
  if (used) throw new Error(`${used} entr${used === 1 ? "y uses" : "ies use"} this account. Untick "Active" to hide it instead, or move those entries first.`);
  await deleteDoc(doc(db, "financeAccounts", account.id));
}

// -------------------------------- Payroll --------------------------------
/** Discards a processed (unpaid) salary so the month can be recalculated from scratch. */
export async function deletePayroll(payroll) {
  if (payroll.status === "paid") throw new Error("Reverse the payment first");
  await deleteDoc(doc(db, "payrolls", payroll.id));
}

// ------------------------------- Increments -------------------------------
/** Removes the most recent increment and puts the salary back to what it was before it. */
export async function undoLastIncrement(uid, current) {
  const history = [...(current?.increments || [])];
  const last = history.pop();
  if (!last) throw new Error("No increment to undo");
  const prev = history[history.length - 1];
  await setDoc(
    doc(db, "employeeFinance", uid),
    {
      monthlySalary: Number(last.oldSalary) || 0,
      lastIncrementDate: prev?.date || null,
      nextIncrementDate: last.prevNextIncrementDate ?? (prev ? addMonthsISO(prev.date, 12) : null),
      increments: history,
      updatedAt: now(),
    },
    { merge: true }
  );
}

/** Corrects the note / date on a past increment without touching salaries. */
export async function updateIncrementEntry(uid, current, index, { date, note }) {
  const history = [...(current?.increments || [])];
  if (!history[index]) throw new Error("Increment not found");
  history[index] = { ...history[index], date: date || history[index].date, note: (note || "").trim() };
  const isLast = index === history.length - 1;
  await updateDoc(doc(db, "employeeFinance", uid), {
    increments: history,
    ...(isLast ? { lastIncrementDate: history[index].date } : {}),
    updatedAt: now(),
  });
}
