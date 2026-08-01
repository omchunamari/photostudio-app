import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "./client";
import { getISTDateStr } from "@/lib/dateIST";

function reportId(uid, date) {
  return `${uid}_${date}`;
}

/** Returns today's report for this employee, or null if not submitted yet. */
export async function getTodayReport(uid) {
  const ref = doc(db, "dailyReports", reportId(uid, getISTDateStr()));
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/** Returns whether this employee has already submitted a report for the given date (defaults to today). */
export async function hasSubmittedReport(uid, date = getISTDateStr()) {
  const ref = doc(db, "dailyReports", reportId(uid, date));
  const snap = await getDoc(ref);
  return snap.exists();
}

export async function submitDailyReport({ employeeUid, employeeName, department, report }) {
  const date = getISTDateStr();
  const trimmed = (report || "").trim();
  if (!trimmed) throw new Error("Please write something before submitting.");

  const ref = doc(db, "dailyReports", reportId(employeeUid, date));
  const existing = await getDoc(ref);
  if (existing.exists()) {
    throw new Error("You've already submitted today's report.");
  }

  const now = new Date().toISOString();
  await setDoc(ref, {
    employeeUid,
    employeeName,
    department,
    date,
    report: trimmed,
    submittedAt: now,
  });
}

/** Employee's own report history, most recent first. */
export async function getReportHistoryForEmployee(uid) {
  const q = query(collection(db, "dailyReports"), where("employeeUid", "==", uid));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Admin/HR: all reports submitted for a given date (defaults to today). */
export async function getAllReportsForDate(date = getISTDateStr()) {
  const q = query(collection(db, "dailyReports"), where("date", "==", date));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}