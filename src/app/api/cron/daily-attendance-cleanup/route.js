export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { STANDARD_WORKING_HOURS, WEEKLY_OFF_DAY } from "@/lib/constants/attendance";
import { getISTDateStr, getISTYesterdayStr, getISTDay } from "@/lib/dateIST";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { adminDb } = await import("@/lib/firebase/admin");

  const todayStr = getISTDateStr();
  let autoClosedCount = 0;
  let autoDeductedCount = 0;

  // --- 1. Auto-close forgotten checkouts ---
  const openRecordsSnap = await adminDb
    .collection("attendance")
    .where("checkOutTime", "==", null)
    .get();

  const closeBatch = adminDb.batch();
  for (const docSnap of openRecordsSnap.docs) {
    const data = docSnap.data();
    if (!data.checkInTime || data.date === todayStr) continue;

    const checkInDate = new Date(data.checkInTime);
    const cappedCheckOut = new Date(checkInDate.getTime() + STANDARD_WORKING_HOURS * 60 * 60 * 1000);

    closeBatch.update(docSnap.ref, {
      checkOutTime: cappedCheckOut.toISOString(),
      totalWorkingMs: STANDARD_WORKING_HOURS * 60 * 60 * 1000,
      autoCheckedOut: true,
    });
    autoClosedCount++;
  }
  if (autoClosedCount > 0) await closeBatch.commit();

  // --- 2. Auto-deduct Paid Leave for missed weekday yesterday, or for
  //        attending without submitting a Daily Report (allowed to go negative) ---
  const yesterdayStr = getISTYesterdayStr();
  const yesterdayIST = new Date(`${yesterdayStr}T12:00:00+05:30`);
  let autoDeductedNoReportCount = 0;

  if (getISTDay(yesterdayIST) !== WEEKLY_OFF_DAY) {
    const activeUsersSnap = await adminDb.collection("users").where("status", "==", "active").get();

    for (const userDoc of activeUsersSnap.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data();
      if (userData.role === "super_admin") continue; // super admins don't mark attendance at all

      const attendanceId = `${uid}_${yesterdayStr}`;
      const attendanceRef = adminDb.collection("attendance").doc(attendanceId);
      const attendanceSnap = await attendanceRef.get();

      const leaveSnap = await adminDb
        .collection("leaveRequests")
        .where("employeeUid", "==", uid)
        .where("status", "==", "approved")
        .where("startDate", "<=", yesterdayStr)
        .get();
      const coveredByLeave = leaveSnap.docs.some((d) => d.data().endDate >= yesterdayStr);
      if (coveredByLeave) continue;

      if (!attendanceSnap.exists) {
        // Didn't show up at all — existing behavior: auto-mark the day as leave.
        const currentBalance = userData.leaveBalance || {};
        const paidBalance = currentBalance.Paid || 0;

        await adminDb.collection("users").doc(uid).update({
          leaveBalance: { ...currentBalance, Paid: paidBalance - 1 },
        });
        await attendanceRef.set({
          id: attendanceId,
          employeeUid: uid,
          employeeName: userData.name,
          department: userData.department,
          date: yesterdayStr,
          status: "auto_leave",
          checkInTime: null,
          checkOutTime: null,
          breaks: [],
          totalWorkingMs: 0,
          createdAt: new Date().toISOString(),
          autoDeducted: true,
        });
        autoDeductedCount++;
        continue;
      }

      // Showed up, but never submitted a Daily Report for that day — this
      // normally can't happen since checkOut() requires a report first, but
      // it CAN happen if step 1 above force-closed a forgotten checkout, or
      // if the employee never checked out and was auto-closed on a later run.
      const attendanceData = attendanceSnap.data();
      if (attendanceData.status === "auto_leave" || attendanceData.reportMissingAutoLeave) continue;

      const reportRef = adminDb.collection("dailyReports").doc(attendanceId);
      const reportSnap = await reportRef.get();
      if (reportSnap.exists) continue;

      const currentBalance = userData.leaveBalance || {};
      const paidBalance = currentBalance.Paid || 0;

      await adminDb.collection("users").doc(uid).update({
        leaveBalance: { ...currentBalance, Paid: paidBalance - 1 },
      });
      await attendanceRef.update({
        status: "auto_leave",
        reportMissingAutoLeave: true,
      });
      autoDeductedNoReportCount++;
    }
  }

  return NextResponse.json({
    success: true,
    autoClosedCount,
    autoDeductedCount,
    autoDeductedNoReportCount,
    date: todayStr,
  });
}