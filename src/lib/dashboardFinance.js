import { getAllProjects } from "@/lib/firebase/projects";
import { getAllQuotations } from "@/lib/firebase/quotations";
import { getAllInvoices, sumReceived, collectionDate } from "@/lib/firebase/invoices";

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

export function inFY(dateStr, startYear) {
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
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The 12 months of the selected financial year, Apr → Mar.
 *
 * This used to be a hardcoded trailing-6-calendar-months window, which meant
 * switching the FY dropdown to a past year left the chart showing the last
 * six months of *today* — the KPI cards and the graph disagreed. Keying the
 * chart off the same FY as everything else fixes that.
 */
function fyMonthKeys(startYear) {
  const keys = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(startYear, 3 + i, 1);
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
 *   totalRevenue, projectsBooked, receivedOnBookings, outstanding,
 *   overCollected, cashReceived,
 *   monthly: [{ label, amount }],   // 12 months of the selected FY, Apr→Mar
 * }
 */
export async function loadFinanceOverview(startYear) {
  const [projects, quotations, invoices] = await Promise.all([
    getAllProjects(),
    getAllQuotations(),
    getAllInvoices(),
  ]);

  const quotesById = Object.fromEntries(quotations.map((q) => [q.id, q]));
  const fyProjects = projects.filter((p) => inFY(p.createdAt, startYear));
  const fyProjectIds = new Set(fyProjects.map((p) => p.id));

  // Total Revenue — projects *booked* (created) within the selected FY.
  // quotationAmount is seeded from the linked quote at project creation but
  // stays independently editable afterwards (e.g. extra requirements added
  // post-quote) — prefer it over the quote's original total so edits stick.
  const totalRevenue = fyProjects.reduce((sum, p) => {
    const quote = p.quotationId ? quotesById[p.quotationId] : null;
    return sum + (p.quotationAmount ?? quote?.total ?? 0);
  }, 0);

  // Received on Bookings — paid invoices (see the "Mark Paid" toggle on each
  // project's Invoices panel) belonging to projects booked in this FY,
  // *whenever* that money came in. Deliberately NOT date-filtered: this is
  // the collection rate against this year's order book, so it has to pair
  // with totalRevenue above to make Outstanding mean anything. That's the
  // difference from Cash Received below, which is a pure cash-flow figure.
  const receivedOnBookings = sumReceived(invoices.filter((inv) => fyProjectIds.has(inv.projectId)));
  const outstanding = Math.max(0, totalRevenue - receivedOnBookings);
  // Surfaced separately so the UI can flag it rather than silently clamping:
  // collecting more than the booked value means a quotationAmount is stale
  // or an invoice is tagged to the wrong project.
  const overCollected = Math.max(0, receivedOnBookings - totalRevenue);

  // Cash Received / monthly trend — actual cash flow: every paid invoice
  // (any project, including ones booked in earlier years) counted against
  // the date the money actually landed.
  //
  // This previously used inv.date, the date the invoice was *raised*. An
  // invoice raised in February and collected in June was counted as
  // February cash, which quietly misstated both the FY total and the shape
  // of the graph. collectionDate() reads paidAt and falls back to the
  // raised date only for legacy invoices that predate that field.
  const paidInvoices = invoices.filter((inv) => inv.status === "paid");
  const cashReceived = sumReceived(
    paidInvoices.filter((inv) => inFY(collectionDate(inv), startYear))
  );

  const months = fyMonthKeys(startYear);
  const byMonth = Object.fromEntries(months.map((m) => [m.key, 0]));
  paidInvoices.forEach((inv) => {
    const mk = monthKeyOf(collectionDate(inv));
    if (mk && mk in byMonth) byMonth[mk] += Number(inv.amount) || 0;
  });
  const monthly = months.map((m) => ({ label: m.label, amount: byMonth[m.key] }));

  return {
    totalRevenue,
    projectsBooked: fyProjects.length,
    receivedOnBookings,
    outstanding,
    overCollected,
    cashReceived,
    monthly,
  };
}