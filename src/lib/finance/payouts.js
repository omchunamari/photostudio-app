import { plExpense } from "./calc";

const FREELANCER_CATEGORIES = ["Freelancer", "Freelancer Payout"];

/**
 * Freelancer payouts, grouped person → project → event.
 *
 * Earned: for every freelancer on an event team, dayRate × shoot days (the rate
 * set at assignment time, falling back to the freelancer profile's dayRate).
 * Paid: every Freelancer-category expense tagged to that person on that project
 * — ledger rows and older project-page expenses alike.
 *
 * Payments are recorded per project, not per event, so within a project they are
 * applied to events oldest-first. That gives each event a Paid / Partly paid /
 * Pending status that always adds up to the project's totals.
 */
export function freelancerPayoutsByPerson(events, freelancers, rows) {
  const paidByKey = {};
  const paymentsByKey = {};
  rows.forEach((t) => {
    if (t.personType !== "freelancer" || !t.projectId || !FREELANCER_CATEGORIES.includes(t.category)) return;
    if (t.status === "pending") return; // an unpaid bill isn't a payment
    const key = `${t.projectId}:${t.personUid}`;
    paidByKey[key] = (paidByKey[key] || 0) + plExpense(t);
    (paymentsByKey[key] ||= []).push(t);
  });

  const people = new Map();
  events.forEach((ev) => {
    (ev.team || []).forEach((m) => {
      if (m.type !== "freelancer") return;
      const fl = freelancers.find((f) => f.id === m.uid);
      const rate = Number(m.dayRate || fl?.dayRate || 0);
      if (!rate) return;
      const days = Number(ev.shootDays) || 1;
      if (!people.has(m.uid)) people.set(m.uid, { personUid: m.uid, personName: m.name || fl?.name || "Freelancer", projects: new Map() });
      const person = people.get(m.uid);
      if (!person.projects.has(ev.projectId)) {
        person.projects.set(ev.projectId, { projectId: ev.projectId, projectName: ev.projectName || "Project", events: [] });
      }
      person.projects.get(ev.projectId).events.push({
        eventId: ev.id,
        eventName: ev.eventName || "Event",
        date: ev.eventStartDate || "",
        days,
        rate,
        amount: days * rate,
      });
    });
  });

  return [...people.values()]
    .map((person) => {
      const projects = [...person.projects.values()].map((p) => {
        const key = `${p.projectId}:${person.personUid}`;
        const paid = paidByKey[key] || 0;
        let left = paid;
        const evs = p.events
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((e) => {
            const applied = Math.min(left, e.amount);
            left -= applied;
            return { ...e, paid: applied, due: e.amount - applied, status: applied >= e.amount ? "paid" : applied > 0 ? "partial" : "pending" };
          });
        const earned = evs.reduce((s, e) => s + e.amount, 0);
        const due = Math.max(0, earned - paid);
        return {
          ...p,
          events: evs,
          earned,
          paid,
          due,
          payments: (paymentsByKey[key] || []).sort((a, b) => (b.date || "").localeCompare(a.date || "")),
          status: due <= 0 ? "paid" : paid > 0 ? "partial" : "pending",
          lastDate: evs.length ? evs[evs.length - 1].date : "",
        };
      });
      projects.sort((a, b) => b.due - a.due || b.lastDate.localeCompare(a.lastDate));
      const earned = projects.reduce((s, p) => s + p.earned, 0);
      const paid = projects.reduce((s, p) => s + Math.min(p.paid, p.earned), 0);
      const due = projects.reduce((s, p) => s + p.due, 0);
      return {
        ...person,
        projects,
        earned,
        paid,
        due,
        eventCount: projects.reduce((s, p) => s + p.events.length, 0),
        pendingProjects: projects.filter((p) => p.due > 0).length,
      };
    })
    .sort((a, b) => b.due - a.due || (a.personName || "").localeCompare(b.personName || ""));
}
