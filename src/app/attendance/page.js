"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import StatusBadge from "@/components/ui/status-badge";
import {
  Users,
  CheckCircle2,
  Clock,
  CalendarX,
  CalendarDays,
  Download,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";
import { formatTime12, getISTDayFromDateStr, formatDateIST } from "@/lib/dateIST";
import { getOrgHolidays } from "@/lib/firebase/holidays";
import { isHolidayDate } from "@/lib/holidays";

// Admin marks their own attendance like any other employee now — only
// super_admin and HR get the org-wide view/manage table below.
const ADMIN_ROLES = ["super_admin", "hr"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Days in a given month. month is 1-indexed (matches selectedMonth below). */
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// "present"/"late" both mean the person showed up; "auto_leave"/"on_leave"
// both mean the day is booked against leave balance. Grouping them this
// way keeps the summary cards and CSV totals meaningful regardless of
// which of the two labels a given record happens to carry.
const PRESENT_STATUSES = ["present", "late"];
const LEAVE_STATUSES = ["auto_leave", "on_leave"];

// Thin wrapper over the shared IST/12-hour formatter — CSV exports want a
// bare "-" for blanks rather than the em-dash used in the UI.
function formatTime(iso) {
  return formatTime12(iso, "-");
}

function statusLabel(status) {
  if (!status) return "-";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function csvEscape(value) {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function downloadCSV(filename, headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(","));
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function StatCard({ icon: Icon, label, value, subtext }) {
  return (
    <Card className="h-full">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
            {label}
          </p>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </div>
        </div>
        <p className="mt-2 font-heading text-xl font-semibold text-foreground sm:text-2xl">{value}</p>
        {subtext && <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">{subtext}</p>}
      </CardContent>
    </Card>
  );
}

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

  // Org holidays are a fixed yearly-recurring list (see Settings >
  // Holidays), so unlike attendance records they don't need refetching
  // when the month/year selector changes — one load covers every month.
  const [orgHolidays, setOrgHolidays] = useState([]);

  useEffect(() => {
    if (!isAdminView) return;
    getOrgHolidays().then(setOrgHolidays);
  }, [isAdminView]);

  // Every calendar day in the selected month that's a Sunday or a
  // configured org holiday — this is a calendar fact independent of who
  // was marked present/on leave that day, so it doesn't come from
  // monthRecords the way presentDays/leaveDays do.
  const holidayDatesInMonth = useMemo(() => {
    const total = daysInMonth(selectedYear, selectedMonth);
    const dates = [];
    for (let day = 1; day <= total; day++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const isSunday = getISTDayFromDateStr(dateStr) === 0;
      if (isSunday || isHolidayDate(dateStr, orgHolidays)) dates.push(dateStr);
    }
    return dates;
  }, [selectedYear, selectedMonth, orgHolidays]);
  const holidayCount = holidayDatesInMonth.length;

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

  // Sorted by name so the table (and the CSV export, which reuses this
  // order) reads consistently instead of following whatever order
  // Firestore happened to return docs in.
  const sortedRecords = useMemo(
    () => records.slice().sort((a, b) => (a.employeeName || "").localeCompare(b.employeeName || "")),
    [records]
  );

  const todaySummary = useMemo(() => {
    const present = records.filter((r) => PRESENT_STATUSES.includes(r.status)).length;
    const onLeave = records.filter((r) => LEAVE_STATUSES.includes(r.status)).length;
    const stillWorking = records.filter((r) => r.checkInTime && !r.checkOutTime).length;
    return { total: records.length, present, onLeave, stillWorking };
  }, [records]);

  const groupedByEmployee = useMemo(() => {
    const groups = {};
    monthRecords.forEach((rec) => {
      if (!groups[rec.employeeUid]) {
        groups[rec.employeeUid] = { employeeName: rec.employeeName, department: rec.department, days: [] };
      }
      groups[rec.employeeUid].days.push(rec);
    });
    Object.values(groups).forEach((emp) => {
      emp.days.sort((a, b) => a.date.localeCompare(b.date));
      const presentDays = emp.days.filter((d) => PRESENT_STATUSES.includes(d.status)).length;
      const leaveDays = emp.days.filter((d) => LEAVE_STATUSES.includes(d.status)).length;
      const workingDurations = emp.days.filter((d) => d.totalWorkingMs > 0).map((d) => d.totalWorkingMs);
      emp.presentDays = presentDays;
      emp.leaveDays = leaveDays;
      emp.avgWorkingMs = workingDurations.length
        ? workingDurations.reduce((a, b) => a + b, 0) / workingDurations.length
        : 0;
    });
    return Object.entries(groups).sort(([, a], [, b]) => (a.employeeName || "").localeCompare(b.employeeName || ""));
  }, [monthRecords]);

  const monthSummary = useMemo(() => {
    const employeesTracked = groupedByEmployee.length;
    const presentMarkings = monthRecords.filter((r) => PRESENT_STATUSES.includes(r.status)).length;
    const leaveMarkings = monthRecords.filter((r) => LEAVE_STATUSES.includes(r.status)).length;
    const workingDurations = monthRecords.filter((r) => r.totalWorkingMs > 0).map((r) => r.totalWorkingMs);
    const avgWorkingMs = workingDurations.length
      ? workingDurations.reduce((a, b) => a + b, 0) / workingDurations.length
      : 0;
    return { employeesTracked, presentMarkings, leaveMarkings, avgWorkingMs };
  }, [monthRecords, groupedByEmployee]);

  function exportToday() {
    const headers = ["Employee", "Department", "Status", "Check In", "Check Out", "Break", "Working Hours"];
    const rows = sortedRecords.map((rec) => [
      rec.employeeName || "",
      rec.department || "",
      statusLabel(rec.status),
      formatTime(rec.checkInTime),
      formatTime(rec.checkOutTime),
      formatDuration(getTotalBreakMs(rec)),
      formatDuration(rec.totalWorkingMs),
    ]);
    downloadCSV(`attendance-${now.toISOString().split("T")[0]}.csv`, headers, rows);
  }

  function exportMonth() {
    const headers = ["Employee", "Department", "Date", "Status", "Check In", "Check Out", "Break", "Working Hours", "Is Holiday"];
    const rows = groupedByEmployee.flatMap(([, emp]) =>
      emp.days.map((rec) => [
        emp.employeeName || "",
        emp.department || "",
        rec.date,
        statusLabel(rec.status),
        formatTime(rec.checkInTime),
        formatTime(rec.checkOutTime),
        formatDuration(getTotalBreakMs(rec)),
        formatDuration(rec.totalWorkingMs),
        holidayDatesInMonth.includes(rec.date) ? "Yes" : "",
      ])
    );
    downloadCSV(`attendance-${MONTH_NAMES[selectedMonth - 1]}-${selectedYear}.csv`, headers, rows);
  }

  const hasExportableData = viewMode === "today" ? sortedRecords.length > 0 : groupedByEmployee.length > 0;

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
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
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

            <Button
              size="sm"
              variant="outline"
              disabled={!hasExportableData}
              onClick={viewMode === "today" ? exportToday : exportMonth}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>

          {viewMode === "today" ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
                <StatCard icon={Users} label="Marked Today" value={loading ? "-" : todaySummary.total} />
                <StatCard
                  icon={CheckCircle2}
                  label="Present"
                  value={loading ? "-" : todaySummary.present}
                  subtext={loading ? undefined : `${todaySummary.stillWorking} still checked in`}
                />
                <StatCard icon={CalendarX} label="On Leave" value={loading ? "-" : todaySummary.onLeave} />
                <StatCard
                  icon={Clock}
                  label="Not Checked Out"
                  value={loading ? "-" : todaySummary.stillWorking}
                />
              </div>

              <h3 className="mb-3 text-base font-medium text-slate-900 sm:text-lg">
                Today's Attendance - All Employees
              </h3>
              {loading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : sortedRecords.length === 0 ? (
                <p className="text-sm text-slate-500">No one has checked in today yet.</p>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>In</TableHead>
                          <TableHead>Out</TableHead>
                          <TableHead>Break</TableHead>
                          <TableHead>Working</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedRecords.map((rec) => (
                          <TableRow key={rec.id}>
                            <TableCell className="font-medium text-foreground">{rec.employeeName}</TableCell>
                            <TableCell className="text-muted-foreground">{rec.department}</TableCell>
                            <TableCell><StatusBadge status={rec.status} /></TableCell>
                            <TableCell>{formatTime(rec.checkInTime)}</TableCell>
                            <TableCell>{formatTime(rec.checkOutTime)}</TableCell>
                            <TableCell>{formatDuration(getTotalBreakMs(rec))}</TableCell>
                            <TableCell>{formatDuration(rec.totalWorkingMs)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5">
                <StatCard
                  icon={Users}
                  label="Employees Tracked"
                  value={monthLoading ? "-" : monthSummary.employeesTracked}
                />
                <StatCard
                  icon={CheckCircle2}
                  label="Present Markings"
                  value={monthLoading ? "-" : monthSummary.presentMarkings}
                />
                <StatCard
                  icon={CalendarX}
                  label="Leave Markings"
                  value={monthLoading ? "-" : monthSummary.leaveMarkings}
                />
                <StatCard
                  icon={CalendarDays}
                  label="Holidays This Month"
                  value={holidayCount}
                  subtext="Sundays + org holidays"
                />
                <StatCard
                  icon={Clock}
                  label="Avg Working Hours"
                  value={monthLoading ? "-" : formatDuration(monthSummary.avgWorkingMs)}
                  subtext="per day worked"
                />
              </div>

              <h3 className="mb-3 text-base font-medium text-slate-900 sm:text-lg">
                {MONTH_NAMES[selectedMonth - 1]} {selectedYear} - All Employees
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">
                {holidayCount} holiday{holidayCount === 1 ? "" : "s"} this month (Sundays + org holidays) ·{" "}
                <Link href="/settings?tab=holidays" className="underline-offset-2 hover:underline">
                  Manage holiday list
                </Link>
              </p>
              {monthLoading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : groupedByEmployee.length === 0 ? (
                <p className="text-sm text-slate-500">No attendance records for this month.</p>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Present Days</TableHead>
                          <TableHead>Leave Days</TableHead>
                          <TableHead>Holidays</TableHead>
                          <TableHead>Avg Working</TableHead>
                          <TableHead className="text-right">Daily Log</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupedByEmployee.map(([uid, emp]) => {
                          const isExpanded = expandedEmployee === uid;
                          return (
                            <Fragment key={uid}>
                              <TableRow
                                className="cursor-pointer"
                                onClick={() => setExpandedEmployee(isExpanded ? null : uid)}
                              >
                                <TableCell className="font-medium text-foreground">{emp.employeeName}</TableCell>
                                <TableCell className="text-muted-foreground">{emp.department}</TableCell>
                                <TableCell>{emp.presentDays}</TableCell>
                                <TableCell>{emp.leaveDays}</TableCell>
                                <TableCell className="text-muted-foreground">{holidayCount}</TableCell>
                                <TableCell>{formatDuration(emp.avgWorkingMs)}</TableCell>
                                <TableCell className="text-right">
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    {emp.days.length} day{emp.days.length !== 1 ? "s" : ""}
                                    {isExpanded ? (
                                      <ChevronUp className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    )}
                                  </span>
                                </TableCell>
                              </TableRow>
                              {isExpanded && (
                                <TableRow className="hover:bg-transparent">
                                  <TableCell colSpan={7} className="bg-muted/30 p-0">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Date</TableHead>
                                          <TableHead>Status</TableHead>
                                          <TableHead>In</TableHead>
                                          <TableHead>Out</TableHead>
                                          <TableHead>Break</TableHead>
                                          <TableHead>Working</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {emp.days.map((rec) => (
                                          <TableRow key={rec.id}>
                                            <TableCell className="font-medium text-foreground">{formatDateIST(rec.date)}</TableCell>
                                            <TableCell><StatusBadge status={rec.status} /></TableCell>
                                            <TableCell>{formatTime(rec.checkInTime)}</TableCell>
                                            <TableCell>{formatTime(rec.checkOutTime)}</TableCell>
                                            <TableCell>{formatDuration(getTotalBreakMs(rec))}</TableCell>
                                            <TableCell>{formatDuration(rec.totalWorkingMs)}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
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