import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "./client";

export const LEAVE_TYPES = ["Paid"];

function datesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Checks whether the employee already has a pending/approved leave request covering any day in [startDate, endDate]. */
export async function hasOverlappingLeave(uid, startDate, endDate) {
  const q = query(
    collection(db, "leaveRequests"),
    where("employeeUid", "==", uid),
    where("status", "in", ["pending", "approved"])
  );
  const snap = await getDocs(q);
  return snap.docs.some((d) => {
    const req = d.data();
    return datesOverlap(startDate, endDate, req.startDate, req.endDate);
  });
}

export async function applyLeave({ employeeUid, employeeName, department, leaveType, startDate, endDate, reason }) {
  const overlapping = await hasOverlappingLeave(employeeUid, startDate, endDate);
  if (overlapping) {
    throw new Error("You already have a leave request for one or more of these dates.");
  }

  const now = new Date().toISOString();
  const docRef = await addDoc(collection(db, "leaveRequests"), {
    employeeUid,
    employeeName,
    department,
    leaveType,
    startDate,
    endDate,
    reason: reason || "",
    status: "pending",
    appliedAt: now,
    decidedAt: null,
    decidedBy: null,
    rejectionReason: null,
  });
  return docRef.id;
}

export async function getLeaveHistoryForEmployee(uid) {
  const q = query(
    collection(db, "leaveRequests"),
    where("employeeUid", "==", uid)
  );
  const snap = await getDocs(q);
  const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return results.sort((a, b) => (b.appliedAt || "").localeCompare(a.appliedAt || ""));
}

export async function getAllLeaveRequests(year) {
  if (year) {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const q = query(
      collection(db, "leaveRequests"),
      where("startDate", ">=", start),
      where("startDate", "<=", end)
    );
    const snap = await getDocs(q);
    const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return results.sort((a, b) => (b.appliedAt || "").localeCompare(a.appliedAt || ""));
  }
  const q = query(collection(db, "leaveRequests"), orderBy("appliedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPendingLeaveRequests() {
  const q = query(collection(db, "leaveRequests"), where("status", "==", "pending"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function countLeaveDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    if (current.getDay() !== 0) count++; // skip Sundays
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * Updates a leave request's status. If approved, deducts balance.
 * If rejected, `rejectionReason` is required.
 */
export async function decideLeaveRequest(requestId, decision, decidedByUid, leaveRequest, rejectionReason) {
  const updates = {
    status: decision,
    decidedAt: new Date().toISOString(),
    decidedBy: decidedByUid,
  };

  if (decision === "rejected") {
    if (!rejectionReason || !rejectionReason.trim()) {
      throw new Error("Rejection reason is required.");
    }
    updates.rejectionReason = rejectionReason.trim();
  }

  await updateDoc(doc(db, "leaveRequests", requestId), updates);

  if (decision === "approved" && leaveRequest) {
    const userRef = doc(db, "users", leaveRequest.employeeUid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const currentBalance = userSnap.data().leaveBalance || {};
      const daysUsed = countLeaveDays(leaveRequest.startDate, leaveRequest.endDate);
      const currentTypeBalance = currentBalance[leaveRequest.leaveType] || 0;
      const updatedBalance = {
        ...currentBalance,
        [leaveRequest.leaveType]: currentTypeBalance - daysUsed,
      };
      await updateDoc(userRef, { leaveBalance: updatedBalance });
    }
  }
}