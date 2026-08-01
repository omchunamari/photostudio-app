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

export default function AttendanceCard() {
  const { user } = useAuth();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [compOffRequested, setCompOffRequested] = useState(false);
  const [hasReport, setHasReport] = useState(false);

  const isSunday = new Date().getDay() === 0;

  async function loadRecord() {
    const [data, report] = await Promise.all([
      getTodayAttendance(user.uid),
      getTodayReport(user.uid),
    ]);
    setRecord(data);
    setHasReport(!!report);
    setLoading(false);
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
      loadRecord();
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
      loadRecord();
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
      loadRecord();
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

  return (
    <Card>
      <CardContent className="p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500 sm:text-sm">Check In</p>
            <p className="text-base font-semibold text-slate-900 sm:text-lg">
              {record?.checkInTime ? new Date(record.checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 sm:text-sm">Check Out</p>
            <p className="text-base font-semibold text-slate-900 sm:text-lg">
              {record?.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 sm:text-sm">
              Break {isOnBreak && <span className="text-amber-600">(ongoing)</span>}
            </p>
            <p className="text-base font-semibold text-slate-900 sm:text-lg">
              {formatDuration(liveBreakMs)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 sm:text-sm">Working</p>
            <p className="text-base font-semibold text-slate-900 sm:text-lg">
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
                <p className="w-full text-xs text-amber-600">
                  Submit today&apos;s Daily Report (below) before you can check out.
                </p>
              )}
            </>
          )}
          {record?.checkOutTime && (
            <p className="text-sm text-slate-500">Attendance completed for today.</p>
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