import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./client";
import { buildTransaction, newId } from "./finance";
import { CAT_EMI, CAT_LOAN_RECEIPT } from "@/lib/finance/constants";
import { splitEmi, nextEmiDate } from "@/lib/finance/loanCalc";
import { round2 } from "@/lib/finance/calc";
import { getISTDateStr } from "@/lib/dateIST";

const now = () => new Date().toISOString();

/**
 * loans/{id}
 * { name, lender, amount, interestRate (annual %), emi, startDate (first EMI
 *   date), tenureMonths, outstanding (principal), paidCount, totalInterestPaid,
 *   totalPrincipalPaid, status: "active"|"closed", accountId (disbursal) }
 * Each EMI paid becomes a ledger expense (source "emi") carrying the
 * principal / interest split; only the interest reaches the P&L.
 */
export async function getLoans() {
  const snap = await getDocs(collection(db, "loans"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
}

export async function createLoan(data, by) {
  const amount = Number(data.amount);
  if (!data.name?.trim()) throw new Error("Loan name is required");
  if (!(amount > 0)) throw new Error("Loan amount must be greater than zero");
  if (!(Number(data.emi) > 0)) throw new Error("EMI must be greater than zero");
  if (!data.startDate) throw new Error("Start date is required");
  const id = newId("loans");
  const batch = writeBatch(db);
  batch.set(doc(db, "loans", id), {
    name: data.name.trim(),
    lender: (data.lender || "").trim(),
    amount,
    interestRate: Number(data.interestRate) || 0,
    emi: Number(data.emi),
    startDate: data.startDate,
    tenureMonths: Number(data.tenureMonths) || 0,
    outstanding: Number(data.outstanding ?? amount),
    paidCount: 0,
    totalInterestPaid: 0,
    totalPrincipalPaid: 0,
    status: "active",
    accountId: data.disbursalAccountId || null,
    createdAt: now(),
    updatedAt: now(),
  });
  // Optionally record the disbursal so the bank balance goes up (not income).
  if (data.disbursalAccountId) {
    batch.set(doc(db, "financeTransactions", newId("financeTransactions")), {
      ...buildTransaction(
        {
          kind: "loan_in",
          date: data.startDate,
          amount,
          category: CAT_LOAN_RECEIPT,
          accountId: data.disbursalAccountId,
          description: `${data.name.trim()} disbursed`,
          source: "loan",
          loanId: id,
        },
        by
      ),
      createdAt: now(),
      updatedAt: now(),
    });
  }
  await batch.commit();
  return id;
}

/** Pays the next EMI from an account. Records principal & interest separately. */
export async function payEmi(loan, { accountId, date }, by) {
  if (!accountId) throw new Error("Select the account the EMI is paid from");
  if (loan.status === "closed") throw new Error("This loan is already closed");
  const { interest, principal } = splitEmi(loan.outstanding, loan.emi, loan.interestRate);
  const total = round2(interest + principal);
  if (!(total > 0)) throw new Error("Nothing left to pay on this loan");
  const newOutstanding = round2(loan.outstanding - principal);
  const paidCount = (loan.paidCount || 0) + 1;
  const dueDate = nextEmiDate(loan);
  const txId = newId("financeTransactions");
  const batch = writeBatch(db);
  batch.set(doc(db, "financeTransactions", txId), {
    ...buildTransaction(
      {
        kind: "expense",
        date: date || getISTDateStr(),
        amount: total,
        category: CAT_EMI,
        accountId,
        description: `${loan.name} — EMI ${paidCount}${dueDate ? ` (due ${dueDate})` : ""}`,
        source: "emi",
        loanId: loan.id,
        principal,
        interest,
      },
      by
    ),
    createdAt: now(),
    updatedAt: now(),
  });
  batch.update(doc(db, "loans", loan.id), {
    outstanding: newOutstanding,
    paidCount,
    totalInterestPaid: round2((loan.totalInterestPaid || 0) + interest),
    totalPrincipalPaid: round2((loan.totalPrincipalPaid || 0) + principal),
    status: newOutstanding <= 0 ? "closed" : "active",
    updatedAt: now(),
  });
  await batch.commit();
  return { interest, principal, total };
}
