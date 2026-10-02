"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getTodayAttendance,
  checkIn,
  checkOut,
  startBreak,
  endBreak,
  formatDuration,
  getTotalBreakMs,
} from "@/lib/firebase/attendance";
import { requestCompOff, hasExistingCompOffRequest } from "@/lib/firebase/compOff";
import { getTodayReport } from "@/lib/firebase/dailyReports";
import { getISTDateStr } from "@/lib/dateIST";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatTime12 } from "@/lib/dateIST";

export default function AttendanceCard({ className = "" }) {
  const { user } = useAuth();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [compOffRequested, setCompOffRequested] = useState(false);
  const [hasReport, setHasReport] = useState(false);

  const isSunday = new Date().getDay() === 0;

  async function loadRecord({ notify = false } = {}) {
    const [data, report] = await Promise.all([
      getTodayAttendance(user.uid),
      getTodayReport(user.uid),
    ]);
    setRecord(data);
    setHasReport(!!report);
    setLoading(false);
    // Lets other widgets on the page (e.g. "My attendance") refresh after a
    // check-in / check-out without a page reload.
    if (notify) window.dispatchEvent(new Event("attendanceChanged"));
  }

  useEffect(() => {
    loadRecord();
  }, [user.uid]);

  useEffect(() => {
    if (isSunday && user?.uid) {
      const todayStr = getISTDateStr();
      hasExistingCompOffRequest(user.uid, todayStr).then(setCompOffRequested);
    }
  }, [isSunday, user?.uid]);

  useEffect(() => {
    function handleReportSubmitted() {
      setHasReport(true);
    }
    window.addEventListener("dailyReportSubmitted", handleReportSubmitted);
    return () => window.removeEventListener("dailyReportSubmitted", handleReportSubmitted);
  }, []);

  // Tick every second so live break/working duration updates on screen
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const isOnBreak =
    record?.breaks?.length > 0 && !record.breaks[record.breaks.length - 1].end;

  const liveBreakMs = (() => {
    const completedMs = getTotalBreakMs(record);
    if (isOnBreak) {
      const activeStart = new Date(record.breaks[record.breaks.length - 1].start);
      return completedMs + (now - activeStart);
    }
    return completedMs;
  })();

  const liveWorkingMs = (() => {
    if (!record?.checkInTime) return 0;
    if (record.checkOutTime) return record.totalWorkingMs;
    const checkInTime = new Date(record.checkInTime);
    return now - checkInTime - liveBreakMs;
  })();

  async function handleCheckIn() {
    setActionLoading(true);
    try {
      await checkIn(user.uid, user.name, user.department);
      toast.success("Checked in successfully");
      loadRecord({ notify: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCheckOut() {
    setActionLoading(true);
    try {
      await checkOut(user.uid);
      toast.success("Checked out successfully");
      loadRecord({ notify: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBreak() {
    setActionLoading(true);
    try {
      if (isOnBreak) {
        await endBreak(user.uid);
        toast.success("Break ended");
      } else {
        await startBreak(user.uid);
        toast.success("Break started");
      }
      loadRecord({ notify: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRequestCompOff() {
    const todayStr = getISTDateStr();
    try {
      await requestCompOff({
        employeeUid: user.uid,
        employeeName: user.name,
        department: user.department,
        date: todayStr,
      });
      toast.success("Comp off requested — pending admin approval");
      setCompOffRequested(true);
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (loading) return null;

  const status = !record
    ? { label: "Not checked in", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" }
    : record.checkOutTime
      ? { label: "Checked out", cls: "bg-muted text-foreground", dot: "bg-foreground/60" }
      : isOnBreak
        ? { label: "On break", cls: "bg-warning/15 text-warning", dot: "bg-warning" }
        : { label: "Working", cls: "bg-success/10 text-success", dot: "bg-success animate-pulse" };

  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-base font-semibold text-foreground">Today</h3>
            <p className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground sm:text-sm">Check In</p>
            <p className="text-base font-semibold text-foreground sm:text-lg">
              {formatTime12(record?.checkInTime)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground sm:text-sm">Check Out</p>
            <p className="text-base font-semibold text-foreground sm:text-lg">
              {formatTime12(record?.checkOutTime)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Break {isOnBreak && <span className="text-warning">(ongoing)</span>}
            </p>
            <p className="text-base font-semibold text-foreground sm:text-lg">
              {formatDuration(liveBreakMs)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground sm:text-sm">Working</p>
            <p className="text-base font-semibold text-foreground sm:text-lg">
              {formatDuration(liveWorkingMs)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!record && (
            <Button onClick={handleCheckIn} disabled={actionLoading}>
              Check In
            </Button>
          )}
          {record && !record.checkOutTime && (
            <>
              <Button variant="secondary" onClick={handleBreak} disabled={actionLoading}>
                {isOnBreak ? "Resume" : "Break"}
              </Button>
              <Button onClick={handleCheckOut} disabled={actionLoading || isOnBreak || !hasReport}>
                Check Out
              </Button>
              {!hasReport && (
                <p className="w-full text-xs text-warning">
                  Submit today&apos;s Daily Report before you can check out.
                </p>
              )}
              {hasReport && isOnBreak && (
                <p className="w-full text-xs text-muted-foreground">End your break (Resume) before checking out.</p>
              )}
            </>
          )}
          {record?.checkOutTime && (
            <p className="text-sm text-muted-foreground">Attendance completed for today.</p>
          )}
          {isSunday && record && (
            <Button
              variant="secondary"
              onClick={handleRequestCompOff}
              disabled={compOffRequested}
            >
              {compOffRequested ? "Comp Off Requested" : "Request Comp Off"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}