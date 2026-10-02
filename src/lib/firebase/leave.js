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
import { notifyEmployee } from "./notifications";
import { getOrgHolidays } from "./holidays";
import { isHolidayDate } from "@/lib/holidays";

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

/**
 * Checks whether the employee already has attendance marked (checked in,
 * not just auto-marked leave) for any day in [startDate, endDate]. Scoped
 * to the employee's own uid so it satisfies the same
 * "employeeUid == request.auth.uid" list rule the rest of the self-service
 * attendance queries rely on.
 */
async function hasAttendanceMarkedInRange(uid, startDate, endDate) {
  const q = query(
    collection(db, "attendance"),
    where("employeeUid", "==", uid),
    where("date", ">=", startDate),
    where("date", "<=", endDate)
  );
  const snap = await getDocs(q);
  return snap.docs.some((d) => {
    const status = d.data().status;
    return status === "present" || status === "late";
  });
}

export async function applyLeave({ employeeUid, employeeName, department, leaveType, startDate, endDate, reason }) {
  if (!startDate || !endDate) throw new Error("Please select both start and end dates.");
  // A reversed range used to slip through, count as 0 days and never deduct.
  if (endDate < startDate) throw new Error("End date can't be before the start date.");
  const overlapping = await hasOverlappingLeave(employeeUid, startDate, endDate);
  if (overlapping) {
    throw new Error("You already have a leave request for one or more of these dates.");
  }

  const alreadyAttended = await hasAttendanceMarkedInRange(employeeUid, startDate, endDate);
  if (alreadyAttended) {
    throw new Error(
      "You've already marked attendance on one or more of these dates. Leave can't be applied for a day you've attended."
    );
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

// Days that actually cost leave: skips Sundays and the org's fixed holidays
// (Settings → Holidays), the same days attendance treats as non-working.
// Walks dates in UTC so the result doesn't depend on the browser's timezone.
function countLeaveDays(startDate, endDate, holidays = []) {
  let count = 0;
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10);
    if (current.getUTCDay() !== 0 && !isHolidayDate(dateStr, holidays)) count++;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}

/**
 * Updates a leave request's status. If approved, deducts balance.
 * If rejected, `rejectionReason` is required.
 */
export async function decideLeaveRequest(requestId, decision, decidedByUid, leaveRequest, rejectionReason, decidedByName) {
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

  // Only a pending request can be decided. Without this, approving twice
  // (double-click, or two HR people at once) deducted the balance twice.
  const current = await getDoc(doc(db, "leaveRequests", requestId));
  if (!current.exists()) throw new Error("Leave request not found.");
  if (current.data().status !== "pending") {
    throw new Error(`This request is already ${current.data().status}.`);
  }

  await updateDoc(doc(db, "leaveRequests", requestId), updates);

  if (decision === "approved" && leaveRequest) {
    const userRef = doc(db, "users", leaveRequest.employeeUid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const currentBalance = userSnap.data().leaveBalance || {};
      const holidays = await getOrgHolidays().catch(() => []);
      const daysUsed = countLeaveDays(leaveRequest.startDate, leaveRequest.endDate, holidays);
      const currentTypeBalance = currentBalance[leaveRequest.leaveType] || 0;
      const updatedBalance = {
        ...currentBalance,
        [leaveRequest.leaveType]: currentTypeBalance - daysUsed,
      };
      await updateDoc(userRef, { leaveBalance: updatedBalance });
    }

    const range =
      leaveRequest.startDate === leaveRequest.endDate
        ? leaveRequest.startDate
        : `${leaveRequest.startDate} to ${leaveRequest.endDate}`;
    await notifyEmployee(leaveRequest.employeeUid, {
      type: "leave_approved",
      title: "Leave approved",
      message: decidedByName
        ? `${decidedByName} approved your ${leaveRequest.leaveType} leave for ${range}.`
        : `Your ${leaveRequest.leaveType} leave for ${range} was approved.`,
    });
  }
}