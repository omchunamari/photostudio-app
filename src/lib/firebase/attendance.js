import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "./client";
import { getISTDateStr } from "@/lib/dateIST";

function todayId(uid) {
  const today = getISTDateStr();
  return `${uid}_${today}`;
}

export async function getTodayAttendance(uid) {
  const ref = doc(db, "attendance", todayId(uid));
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/**
 * Checks whether the employee has a pending or approved leave request that
 * covers the given date. Scoped to the employee's own uid so it satisfies
 * the same "employeeUid == request.auth.uid" list rule as the rest of the
 * self-service attendance queries.
 */
export async function hasLeaveRequestForDate(uid, dateStr) {
  const q = query(
    collection(db, "leaveRequests"),
    where("employeeUid", "==", uid),
    where("status", "in", ["pending", "approved"])
  );
  const snap = await getDocs(q);
  return snap.docs.some((d) => {
    const req = d.data();
    return req.startDate <= dateStr && dateStr <= req.endDate;
  });
}

export async function checkIn(uid, employeeName, department) {
  const now = new Date();
  const dateStr = getISTDateStr(now);
  const onLeave = await hasLeaveRequestForDate(uid, dateStr);
  if (onLeave) {
    throw new Error(
      "You have a pending or approved leave request covering today. Cancel it before marking attendance."
    );
  }
  const ref = doc(db, "attendance", todayId(uid));
  const record = {
    id: todayId(uid),
    employeeUid: uid,
    employeeName,
    department,
    date: getISTDateStr(now),
    checkInTime: now.toISOString(),
    checkOutTime: null,
    breaks: [],
    status: "present",
    totalWorkingMs: 0,
    createdAt: now.toISOString(),
  };
  await setDoc(ref, record);
  return record;
}

export async function checkOut(uid) {
  const ref = doc(db, "attendance", todayId(uid));
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("No check-in found for today.");

  const reportRef = doc(db, "dailyReports", todayId(uid));
  const reportSnap = await getDoc(reportRef);
  if (!reportSnap.exists()) {
    throw new Error("Submit today's Daily Report before checking out.");
  }

  const data = snap.data();
  const now = new Date();
  const checkInTime = new Date(data.checkInTime);
  const totalBreakMs = (data.breaks || []).reduce((sum, b) => {
    if (b.start && b.end) return sum + (new Date(b.end) - new Date(b.start));
    return sum;
  }, 0);
  const totalWorkingMs = now - checkInTime - totalBreakMs;

  await updateDoc(ref, {
    checkOutTime: now.toISOString(),
    totalWorkingMs,
  });

  return { ...data, checkOutTime: now.toISOString(), totalWorkingMs };
}

export async function startBreak(uid) {
  const ref = doc(db, "attendance", todayId(uid));
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Not checked in.");
  const data = snap.data();
  const breaks = [...(data.breaks || []), { start: new Date().toISOString(), end: null }];
  await updateDoc(ref, { breaks });
  return breaks;
}

export async function endBreak(uid) {
  const ref = doc(db, "attendance", todayId(uid));
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Not checked in.");
  const data = snap.data();
  const breaks = [...(data.breaks || [])];
  const lastBreak = breaks[breaks.length - 1];
  if (!lastBreak || lastBreak.end) throw new Error("No active break.");
  lastBreak.end = new Date().toISOString();
  await updateDoc(ref, { breaks });
  return breaks;
}

export async function getAttendanceForDate(date) {
  const targetDate = date || getISTDateStr();
  const q = query(collection(db, "attendance"), where("date", "==", targetDate));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export async function getAttendanceForMonth(year, month) {
  // month is 1-indexed (1 = January)
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const q = query(
    collection(db, "attendance"),
    where("date", ">=", start),
    where("date", "<=", end),
    orderBy("date", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export async function getEmployeeAttendanceHistory(uid) {
  const q = query(
    collection(db, "attendance"),
    where("employeeUid", "==", uid),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export async function getAutoLeaveRecordsForEmployee(uid) {
  const q = query(
    collection(db, "attendance"),
    where("employeeUid", "==", uid),
    where("status", "==", "auto_leave")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export async function getAllAutoLeaveRecords(year) {
  if (year) {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const q = query(
      collection(db, "attendance"),
      where("status", "==", "auto_leave"),
      where("date", ">=", start),
      where("date", "<=", end)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data());
  }
  const q = query(collection(db, "attendance"), where("status", "==", "auto_leave"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export function formatDuration(ms) {
  if (!ms || ms < 0) return "0h 0m";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

/** Sums up all completed break durations (ms) for a given attendance record. */
export function getTotalBreakMs(record) {
  if (!record?.breaks?.length) return 0;
  return record.breaks.reduce((sum, b) => {
    if (b.start && b.end) {
      return sum + (new Date(b.end) - new Date(b.start));
    }
    return sum;
  }, 0);
}