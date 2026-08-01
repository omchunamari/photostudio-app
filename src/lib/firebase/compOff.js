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