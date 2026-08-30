import { getAllProjects } from "@/lib/firebase/projects";
import { getAllQuotations, getPaymentSummary } from "@/lib/firebase/quotations";
import { getAllEvents } from "@/lib/firebase/events";
import { getAllExpenses } from "@/lib/firebase/expenses";
import { getAllFreelancers } from "@/lib/firebase/freelancers";

// Who can see the dashboard finance widgets — mirrors isProjectOps() in
// firestore.rules (admin/PM only). Never fire these queries for anyone
// outside this list; they don't have read access to quotations/expenses.
export const FINANCE_ROLES = ["super_admin", "admin", "project_manager"];

// --- FY helpers (India: Apr 1 – Mar 31, no DST/timezone edge cases to
// worry about since we only ever compare against calendar dates) ---
export function fyStartYearForDate(d) {
  const date = new Date(d);
  return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
}

export function fyLabel(startYear) {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function fyRange(startYear) {
  return {
    start: new Date(startYear, 3, 1),
    end: new Date(startYear + 1, 2, 31, 23, 59, 59, 999),
  };
}

function inFY(dateStr, startYear) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const { start, end } = fyRange(startYear);
  return d >= start && d <= end;
}

export function formatINR(n) {
  return `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
}

function monthKeyOf(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function last6MonthKeys() {
  const keys = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${MONTH_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
    });
  }
  return keys;
}

/**
 * Loads and computes everything the dashboard's Finance Overview needs
 * for one financial year (startYear = the year FY "startYear-startYear+1"
 * begins in, e.g. 2026 for "FY 2026-27").
 *
 * Shape returned:
 * {
 *   totalRevenue, projectsBooked, receivedOnBookings, outstanding, cashReceived,
 *   monthly: [{ label, amount }],   // trailing 6 calendar months, cash actually received
 *   wagesDue: [{ personName, amount }],  // sorted desc, amount > 0 only
 * }
 */
export async function loadFinanceOverview(startYear) {
  const [projects, quotations, events, expenses, freelancers] = await Promise.all([
    getAllProjects(),
    getAllQuotations(),
    getAllEvents(),
    getAllExpenses(),
    getAllFreelancers(),
  ]);

  const quotesById = Object.fromEntries(quotations.map((q) => [q.id, q]));
  const fyProjects = projects.filter((p) => inFY(p.createdAt, startYear));

  // Total Revenue / Received on Bookings / Outstanding — scoped to
  // projects *booked* (created) within the selected FY.
  let totalRevenue = 0;
  let receivedOnBookings = 0;
  fyProjects.forEach((p) => {
    const quote = p.quotationId ? quotesById[p.quotationId] : null;
    const revenue = quote?.total ?? p.quotationAmount ?? 0;
    totalRevenue += revenue;
    receivedOnBookings += quote ? getPaymentSummary(quote).totalPaid : 0;
  });
  const outstanding = Math.max(0, totalRevenue - receivedOnBookings);

  // Cash Received / monthly trend — actual cash flow: every paid
  // installment across ALL quotations whose paidDate falls in the
  // relevant window, regardless of which FY the underlying project was
  // booked in.
  let cashReceived = 0;
  const months = last6MonthKeys();
  const byMonth = Object.fromEntries(months.map((m) => [m.key, 0]));
  quotations.forEach((q) => {
    (q.installments || []).forEach((inst) => {
      if (!inst.paid || !inst.paidDate) return;
      if (inFY(inst.paidDate, startYear)) cashReceived += Number(inst.amount) || 0;
      const mk = monthKeyOf(inst.paidDate);
      if (mk && mk in byMonth) byMonth[mk] += Number(inst.amount) || 0;
    });
  });
  const monthly = months.map((m) => ({ label: m.label, amount: byMonth[m.key] }));

  // Team Wages Due ("who you owe") — freelancer cost accrued across
  // events (dayRate × shoot days), netted against freelancer_payout
  // expenses already logged for that person. Mirrors the payout-suggestion
  // logic in Analytics' Expenses tab, so the two stay consistent.
  const loggedByPerson = {};
  expenses
    .filter((e) => e.type === "freelancer_payout")
    .forEach((e) => {
      loggedByPerson[e.personUid] = (loggedByPerson[e.personUid] || 0) + (e.amount || 0);
    });

  const accruedByPerson = {};
  events.forEach((ev) => {
    (ev.team || []).forEach((m) => {
      if (m.type !== "freelancer") return;
      const fl = freelancers.find((f) => f.id === m.uid);
      const rate = m.dayRate || fl?.dayRate || 0;
      if (!rate) return;
      const days = ev.shootDays || 1;
      if (!accruedByPerson[m.uid]) accruedByPerson[m.uid] = { personName: m.name, amount: 0 };
      accruedByPerson[m.uid].amount += days * rate;
    });
  });

  const wagesDue = Object.entries(accruedByPerson)
    .map(([uid, v]) => ({ personName: v.personName, amount: v.amount - (loggedByPerson[uid] || 0) }))
    .filter((v) => v.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return {
    totalRevenue,
    projectsBooked: fyProjects.length,
    receivedOnBookings,
    outstanding,
    cashReceived,
    monthly,
    wagesDue,
  };
}