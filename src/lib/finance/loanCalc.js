import { round2 } from "./calc";
import { addMonthsISO } from "./payrollCalc";

/** Standard reducing-balance EMI for a principal, annual rate (%) and tenure in months. */
export function calcEmi(principal, annualRate, months) {
  const P = Number(principal) || 0;
  const n = Number(months) || 0;
  const r = (Number(annualRate) || 0) / 1200;
  if (!P || !n) return 0;
  if (!r) return round2(P / n);
  return round2((P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
}

/** Splits one EMI into interest (on current outstanding) and principal. */
export function splitEmi(outstanding, emi, annualRate) {
  const out = Number(outstanding) || 0;
  const interest = round2((out * (Number(annualRate) || 0)) / 1200);
  const principal = Math.max(0, Math.min(round2((Number(emi) || 0) - interest), out));
  return { interest, principal, total: round2(interest + principal) };
}

/** First EMI falls on startDate; each paid EMI moves the due date one month on. */
export function nextEmiDate(loan) {
  if (loan.status === "closed" || !loan.startDate) return null;
  return addMonthsISO(loan.startDate, loan.paidCount || 0);
}
