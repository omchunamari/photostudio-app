import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "./client";

export async function hasExistingCompOffRequest(uid, date) {
  const q = query(
    collection(db, "compOffRequests"),
    where("employeeUid", "==", uid),
    where("date", "==", date)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function requestCompOff({ employeeUid, employeeName, department, date }) {
  const now = new Date().toISOString();
  await addDoc(collection(db, "compOffRequests"), {
    employeeUid,
    employeeName,
    department,
    date,
    status: "pending",
    requestedAt: now,
    decidedAt: null,
    decidedBy: null,
  });
}

export async function getPendingCompOffRequests() {
  const q = query(collection(db, "compOffRequests"), where("status", "==", "pending"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** All comp off requests (any status), optionally scoped to a year — mirrors getAllLeaveRequests. */
export async function getAllCompOffRequests(year) {
  if (year) {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const q = query(
      collection(db, "compOffRequests"),
      where("date", ">=", start),
      where("date", "<=", end)
    );
    const snap = await getDocs(q);
    const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return results.sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));
  }
  const snap = await getDocs(collection(db, "compOffRequests"));
  const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return results.sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));
}

/** A single employee's comp off requests (any status) — mirrors getLeaveHistoryForEmployee. */
export async function getCompOffHistoryForEmployee(uid) {
  const q = query(collection(db, "compOffRequests"), where("employeeUid", "==", uid));
  const snap = await getDocs(q);
  const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return results.sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));
}

export async function decideCompOffRequest(requestId, decision, decidedByUid, request) {
  await updateDoc(doc(db, "compOffRequests", requestId), {
    status: decision,
    decidedAt: new Date().toISOString(),
    decidedBy: decidedByUid,
  });

  if (decision === "approved" && request) {
    const userRef = doc(db, "users", request.employeeUid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const currentBalance = userSnap.data().leaveBalance || {};
      const updatedBalance = {
        ...currentBalance,
        Paid: (currentBalance.Paid || 0) + 1,
      };
      await updateDoc(userRef, { leaveBalance: updatedBalance });
    }
  }
}