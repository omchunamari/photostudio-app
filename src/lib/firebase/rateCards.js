import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./client";

/**
 * Per-employee deliverable rate chart, admin/PM maintained, used to
 * quick-fill a charge when logging a deliverable's employee charge.
 * Manual entry (updateDeliverableCharge in deliverables.js) always stays
 * available — this is just an optional lookup table so an admin isn't
 * re-typing the same per-type rate every time.
 *
 * Stored as a single doc, one entry per employee:
 * rateCards/main -> {
 *   byEmployee: {
 *     [uid]: { [deliverableType]: number, default: number },
 *   },
 *   updatedAt: ISO string,
 * }
 */
const RATE_CARD_REF = () => doc(db, "rateCards", "main");

export async function getAllRateCards() {
  const snap = await getDoc(RATE_CARD_REF());
  return snap.exists() ? snap.data().byEmployee || {} : {};
}

export async function getRateCardForEmployee(uid) {
  const all = await getAllRateCards();
  return all[uid] || {};
}

/** Suggests a rate for (employee, deliverable type): type-specific rate, falling back to that employee's default rate, or null if neither is set. */
export function suggestCharge(rateCard, deliverableType) {
  if (!rateCard) return null;
  if (typeof rateCard[deliverableType] === "number") return rateCard[deliverableType];
  if (typeof rateCard.default === "number") return rateCard.default;
  return null;
}

export async function setRateCardForEmployee(uid, rates) {
  const all = await getAllRateCards();
  const next = { ...all, [uid]: rates };
  await setDoc(RATE_CARD_REF(), { byEmployee: next, updatedAt: new Date().toISOString() }, { merge: true });
  return next;
}