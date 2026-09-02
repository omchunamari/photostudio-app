import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./client";

// Yearly fixed org holidays live on the same orgSettings/main doc as the
// other org-wide config (quote defaults etc.) under a `holidays` field, so
// no new Firestore rule is needed — write access already matches the
// admin/PM roles that can reach the Settings page.

const ORG_SETTINGS_REF = () => doc(db, "orgSettings", "main");

/** Returns the org's yearly fixed holidays: [{ id, name, monthDay: "MM-DD" }]. */
export async function getOrgHolidays() {
  const snap = await getDoc(ORG_SETTINGS_REF());
  return snap.exists() ? snap.data().holidays || [] : [];
}

export async function saveOrgHolidays(holidays) {
  await setDoc(
    ORG_SETTINGS_REF(),
    { holidays, holidaysUpdatedAt: new Date().toISOString() },
    { merge: true }
  );
}