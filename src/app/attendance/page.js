"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import AttendanceCard from "@/components/AttendanceCard";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAttendanceForDate,
  getAttendanceForMonth,
  formatDuration,
  getTotalBreakMs,
} from "@/lib/firebase/attendance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import StatusBadge from "@/components/ui/status-badge";

const ADMIN_ROLES = ["super_admin", "admin", "hr"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function AttendanceContent() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const isAdminView = ADMIN_ROLES.includes(user.role);

  const now = new Date();
  const [viewMode, setViewMode] = useState("today"); // "today" | "month"
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [monthRecords, setMonthRecords] = useState([]);
  const [monthLoading, setMonthLoading] = useState(false);
  const [expandedEmployee, setExpandedEmployee] = useState(null);

  useEffect(() => {
    if (!isAdminView) return;
    getAttendanceForDate().then((data) => {
      setRecords(data);
      setLoading(false);
    });
  }, [isAdminView]);

  useEffect(() => {
    if (!isAdminView || viewMode !== "month") return;
    setMonthLoading(true);
    getAttendanceForMonth(selectedYear, selectedMonth)
      .then(setMonthRecords)
      .finally(() => setMonthLoading(false));
  }, [isAdminView, viewMode, selectedYear, selectedMonth]);

  const groupedByEmployee = monthRecords.reduce((acc, rec) => {
    if (!acc[rec.employeeUid]) {
      acc[rec.employeeUid] = { employeeName: rec.employeeName, department: rec.department, days: [] };
    }
    acc[rec.employeeUid].days.push(rec);
    return acc;
  }, {});

  return (
    <AppShell>
      <h2 className="mb-6 text-xl font-semibold text-slate-900 sm:text-2xl">Attendance</h2>

      {user.role !== "super_admin" && (
        <div className="mb-8 max-w-xl">
          <AttendanceCard />
        </div>
      )}

      {isAdminView && (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Button
                size="sm"
                variant={viewMode === "today" ? "default" : "secondary"}
                onClick={() => setViewMode("today")}
              >
                Today
              </Button>
              <Button
                size="sm"
                variant={viewMode === "month" ? "default" : "secondary"}
                onClick={() => setViewMode("month")}
              >
                Monthly View
              </Button>
            </div>

            {viewMode === "month" && (
              <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
                <Select
                  value={String(selectedMonth)}
                  onValueChange={(v) => setSelectedMonth(Number(v))}
                >
                  <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, idx) => (
                      <SelectItem key={idx} value={String(idx + 1)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(selectedYear)}
                  onValueChange={(v) => setSelectedYear(Number(v))}
                >
                  <SelectTrigger className="w-full sm:w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[now.getFullYear(), now.getFullYear() - 1].map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {viewMode === "today" ? (
            <>
              <h3 className="mb-3 text-base font-medium text-slate-900 sm:text-lg">
                Today's Attendance — All Employees
              </h3>
              {loading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : records.length === 0 ? (
                <p className="text-sm text-slate-500">No one has checked in today yet.</p>
              ) : (
                <div className="grid gap-3">
                  {records.map((rec) => (
                    <Card key={rec.id}>
                      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{rec.employeeName}</p>
                          <p className="text-xs text-slate-500">{rec.department}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-1 sm:text-sm">
                          <span>
                            In:{" "}
                            {new Date(rec.checkInTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span>
                            Out:{" "}
                            {rec.checkOutTime
                              ? new Date(rec.checkOutTime).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </span>
                          <span>Break: {formatDuration(getTotalBreakMs(rec))}</span>
                          <span>Working: {formatDuration(rec.totalWorkingMs)}</span>
                          <span className="col-span-2 sm:col-span-1">
                            <StatusBadge status={rec.status} />
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <h3 className="mb-3 text-base font-medium text-slate-900 sm:text-lg">
                {MONTH_NAMES[selectedMonth - 1]} {selectedYear} — All Employees
              </h3>
              {monthLoading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : Object.keys(groupedByEmployee).length === 0 ? (
                <p className="text-sm text-slate-500">No attendance records for this month.</p>
              ) : (
                <div className="grid gap-3">
                  {Object.entries(groupedByEmployee).map(([uid, emp]) => (
                    <Card key={uid}>
                      <CardContent className="p-4">
                        <button
                          className="flex w-full items-center justify-between gap-3 text-left"
                          onClick={() => setExpandedEmployee(expandedEmployee === uid ? null : uid)}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">{emp.employeeName}</p>
                            <p className="truncate text-xs text-slate-500">{emp.department}</p>
                          </div>
                          <span className="shrink-0 text-xs text-slate-500">
                            {emp.days.length} day(s) {expandedEmployee === uid ? "▲" : "▼"}
                          </span>
                        </button>

                        {expandedEmployee === uid && (
                          <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
                            {emp.days
                              .slice()
                              .sort((a, b) => a.date.localeCompare(b.date))
                              .map((rec) => (
                                <div
                                  key={rec.id}
                                  className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-b border-slate-50 pb-2 text-xs last:border-0 last:pb-0 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-1 sm:border-0 sm:pb-0 sm:text-sm"
                                >
                                  <span className="col-span-2 font-medium text-slate-700 sm:col-span-1">
                                    {rec.date}
                                  </span>
                                  <span>
                                    In:{" "}
                                    {rec.checkInTime
                                      ? new Date(rec.checkInTime).toLocaleTimeString([], {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })
                                      : "—"}
                                  </span>
                                  <span>
                                    Out:{" "}
                                    {rec.checkOutTime
                                      ? new Date(rec.checkOutTime).toLocaleTimeString([], {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })
                                      : "—"}
                                  </span>
                                  <span>Break: {formatDuration(getTotalBreakMs(rec))}</span>
                                  <span>Working: {formatDuration(rec.totalWorkingMs)}</span>
                                  <span className="col-span-2 sm:col-span-1">
                                    <StatusBadge status={rec.status} />
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </AppShell>
  );
}

export default function AttendancePage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <AttendanceContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}