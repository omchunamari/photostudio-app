import { WEEKLY_OFF_DAY } from "@/lib/constants/attendance";
import { DEFAULT_ANNUAL_PAID_LEAVES } from "./constants";
import { round2 } from "./calc";

export function daysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

function eachDate(startStr, endStr, fn) {
  const cur = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endStr}T00:00:00Z`);
  while (cur <= end) {
    fn(cur.toISOString().slice(0, 10), cur.getUTCDay());
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

/**
 * Every date an employee was on leave, from the same two sources the rest of
 * the app uses: approved leave requests (Sundays skipped, as
 * countLeaveDays() in leave.js does) and attendance rows auto-marked as
 * `auto_leave` by the daily cron. A date is only counted once.
 */
export function leaveDateSet(approvedRequests = [], autoLeaveRecords = []) {
  const set = new Set();
  approvedRequests.forEach((r) => {
    if (r.status && r.status !== "approved") return;
    eachDate(r.startDate, r.endDate, (d, dow) => {
      if (dow !== WEEKLY_OFF_DAY) set.add(d);
    });
  });
  autoLeaveRecords.forEach((a) => {
    if (a.date) set.add(a.date);
  });
  return set;
}

/**
 * Leave & LOP for one month.
 *
 * Paid leave is a yearly allowance (24 by default). Leave days are counted
 * cumulatively across the calendar year — the same year the Leave module uses —
 * and any day beyond the allowance is LOP. The month's LOP is the increase in
 * "days over the allowance" during that month, so LOP is charged once, in the
 * month it actually occurs.
 */
export function computeLeaveAndLop(ym, leaveDates, annualPaidLeaves = DEFAULT_ANNUAL_PAID_LEAVES) {
  const year = ym.slice(0, 4);
  const monthStart = `${ym}-01`;
  const monthEnd = `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`;
  let before = 0;
  let inMonth = 0;
  leaveDates.forEach((d) => {
    if (d.slice(0, 4) !== year) return;
    if (d < monthStart) before++;
    else if (d <= monthEnd) inMonth++;
  });
  const allowance = Number(annualPaidLeaves);
  const cap = Number.isFinite(allowance) ? allowance : DEFAULT_ANNUAL_PAID_LEAVES;
  const overBefore = Math.max(0, before - cap);
  const overAfter = Math.max(0, before + inMonth - cap);
  return {
    leaveDays: inMonth,
    lopDays: overAfter - overBefore,
    paidLeaveUsedYTD: before + inMonth,
    paidLeaveRemaining: Math.max(0, cap - (before + inMonth)),
  };
}

/** Turns a salary + leave picture + manual inputs into the payslip figures. */
export function computePayslip({
  ym,
  monthlySalary,
  leaveDays,
  lopDays,
  lopAdjust = 0, // manual extra LOP days (+/-) entered by HR/accounts
  otherEarnings = 0,
  otherDeduction = 0,
  advanceRecovery = 0,
}) {
  const salary = Number(monthlySalary) || 0;
  const days = daysInMonth(ym);
  const lop = Math.max(0, Math.min(days, (Number(lopDays) || 0) + (Number(lopAdjust) || 0)));
  const perDay = salary / days;
  const lopDeduction = round2(perDay * lop);
  const earn = Number(otherEarnings) || 0;
  const other = Number(otherDeduction) || 0;
  const adv = Number(advanceRecovery) || 0;
  const gross = round2(salary + earn);
  const totalDeductions = round2(lopDeduction + other + adv);
  return {
    salary,
    daysInMonth: days,
    paidDays: round2(days - lop),
    leaveDays: Number(leaveDays) || 0,
    lopDays: lop,
    lopDeduction,
    otherEarnings: earn,
    otherDeduction: other,
    advanceRecovery: adv,
    grossEarnings: gross,
    totalDeductions,
    netSalary: Math.max(0, round2(gross - totalDeductions)),
  };
}

/** Next increment reminder helpers. */
export function daysUntil(dateStr, today = new Date().toISOString().slice(0, 10)) {
  if (!dateStr) return null;
  const a = new Date(`${today}T00:00:00Z`);
  const b = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function addMonthsISO(dateStr, months) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}
