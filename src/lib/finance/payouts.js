import { plExpense } from "./calc";

const FREELANCER_CATEGORIES = ["Freelancer", "Freelancer Payout"];

/**
 * Freelancer payouts still due. For every freelancer on an event team it
 * sums dayRate x shoot days per (project, person), then nets off whatever has
 * already been paid — ledger rows and older project-page expenses alike — so
 * only the remaining balance is suggested. Same logic the Analytics Expenses
 * tab used before it moved to Finance. Uses the rate set at assignment time
 * (m.dayRate), falling back to the freelancer profile's dayRate.
 */
export function suggestedFreelancerPayouts(events, freelancers, rows) {
  const logged = {};
  rows.forEach((t) => {
    if (t.personType !== "freelancer" || !t.projectId || !FREELANCER_CATEGORIES.includes(t.category)) return;
    const key = `${t.projectId}:${t.personUid}`;
    logged[key] = (logged[key] || 0) + plExpense(t);
  });

  const byKey = {};
  events.forEach((ev) => {
    (ev.team || []).forEach((m) => {
      if (m.type !== "freelancer") return;
      const fl = freelancers.find((f) => f.id === m.uid);
      const rate = m.dayRate || fl?.dayRate || 0;
      if (!rate) return;
      const key = `${ev.projectId}:${m.uid}`;
      if (!byKey[key]) {
        byKey[key] = { key, projectId: ev.projectId, projectName: ev.projectName, personUid: m.uid, personName: m.name, days: 0, total: 0, rates: new Set() };
      }
      const days = ev.shootDays || 1;
      byKey[key].days += days;
      byKey[key].total += days * rate;
      byKey[key].rates.add(rate);
    });
  });

  return Object.values(byKey)
    .map((r) => {
      const alreadyPaid = logged[r.key] || 0;
      return {
        ...r,
        alreadyPaid,
        amount: r.total - alreadyPaid,
        dayRate: r.rates.size === 1 ? [...r.rates][0] : Math.round(r.total / r.days),
      };
    })
    .filter((r) => r.amount > 0);
}
