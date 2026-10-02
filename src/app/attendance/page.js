"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import AttendanceCard from "@/components/AttendanceCard";
import { MonthCalendar, MonthNav, CalendarLegend, monthName } from "@/components/attendance/MonthCalendar";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAttendanceForDate,
  getAttendanceForMonth,
  getEmployeeAttendanceHistory,
  formatDuration,
  getTotalBreakMs,
} from "@/lib/firebase/attendance";
import { getAllLeaveRequests, getLeaveHistoryForEmployee } from "@/lib/firebase/leave";
import { getAllEmployees } from "@/lib/firebase/employees";
import { getOrgHolidays } from "@/lib/firebase/holidays";
import { monthCalendar, employeeMonth, PRESENT_STATUSES, LEAVE_STATUSES } from "@/lib/attendanceMonth";
import { formatTime12, formatDateIST, getISTDateStr } from "@/lib/dateIST";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import StatusBadge from "@/components/ui/status-badge";
import AvatarInitials from "@/components/ui/avatar-initials";
import {
  Users,
  CheckCircle2,
  Clock,
  CalendarX,
  CalendarDays,
  CalendarCheck,
  Download,
  ChevronDown,
  ChevronUp,
  UserX,
  Percent,
  Search,
} from "lucide-react";

// Admin marks their own attendance like any other employee now — only
// super_admin and HR get the org-wide view/manage table below.
const ADMIN_ROLES = ["super_admin", "hr"];

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

const TONES = {
  neutral: "bg-muted text-muted-foreground",
  positive: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  negative: "bg-destructive/10 text-destructive",
};

function StatCard({ icon: Icon, label, value, subtext, tone = "neutral" }) {
  return (
    <Card className="h-full">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">{label}</p>
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </div>
        </div>
        <p className="mt-2 font-heading text-xl font-semibold tabular-nums text-foreground sm:text-2xl">{value}</p>
        {subtext && <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">{subtext}</p>}
      </CardContent>
    </Card>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-grid grid-flow-col gap-1 rounded-lg bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PctBar({ pct }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  const tone = pct >= 90 ? "bg-success" : pct >= 75 ? "bg-warning" : "bg-destructive";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums">{pct}%</span>
    </div>
  );
}

function Skeleton({ rows = 4 }) {
  return (
    <div className="flex animate-pulse flex-col gap-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 rounded-lg bg-muted/70" />
      ))}
    </div>
  );
}

function workingDaysSub(cal, isCurrentMonth) {
  const parts = [];
  if (isCurrentMonth) parts.push(`${cal.workingDaysSoFar} so far`);
  parts.push(`${cal.offDays} Sundays/holidays off`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// My month — every employee who marks attendance sees their own numbers.
// ---------------------------------------------------------------------------
function MyMonth({ uid, holidays, today }) {
  const [ym, setYm] = useState({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });
  const [history, setHistory] = useState(null);
  const [leaves, setLeaves] = useState([]);

  useEffect(() => {
    Promise.all([getEmployeeAttendanceHistory(uid), getLeaveHistoryForEmployee(uid)])
      .then(([h, l]) => {
        setHistory(h);
        setLeaves(l);
      })
      .catch(() => setHistory([]));
  }, [uid]);

  const cal = useMemo(() => monthCalendar(ym.y, ym.m, holidays, today), [ym, holidays, today]);
  const mine = useMemo(() => {
    if (!history) return null;
    const prefix = `${ym.y}-${String(ym.m).padStart(2, "0")}`;
    return employeeMonth(cal, history.filter((r) => r.date?.startsWith(prefix)), leaves, today);
  }, [history, leaves, cal, ym, today]);

  const isCurrent = today.startsWith(`${ym.y}-${String(ym.m).padStart(2, "0")}`);

  return (
    <Card className="h-full">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-base font-semibold text-foreground">My attendance</h3>
          <MonthNav
            year={ym.y}
            month={ym.m}
            maxYear={Number(today.slice(0, 4))}
            maxMonth={Number(today.slice(5, 7))}
            onChange={(y, m) => setYm({ y, m })}
          />
        </div>
        {!mine ? (
          <Skeleton rows={3} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Working days", cal.workingDays, isCurrent ? `${cal.workingDaysSoFar} so far` : `${cal.offDays} off`],
                ["Present", mine.present, mine.attendancePct != null ? `${mine.attendancePct}%` : ""],
                ["Leave", mine.leave, ""],
                ["Absent", mine.absent, ""],
              ].map(([label, value, sub]) => (
                <div key={label} className="rounded-lg bg-muted/50 p-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="font-heading text-xl font-semibold tabular-nums">{value}</p>
                  {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
                </div>
              ))}
            </div>
            <MonthCalendar days={mine.days} compact />
            <CalendarLegend />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function AttendanceContent() {
  const { user } = useAuth();
  const isAdminView = ADMIN_ROLES.includes(user.role);
  // Fixed for the life of the page so memoised month maths stays stable.
  const [today] = useState(() => getISTDateStr());

  const [viewMode, setViewMode] = useState("today"); // "today" | "month"
  const [ym, setYm] = useState({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });
  const [search, setSearch] = useState("");

  const [orgHolidays, setOrgHolidays] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [todayRecords, setTodayRecords] = useState([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [monthRecords, setMonthRecords] = useState([]);
  const [monthLeaves, setMonthLeaves] = useState([]);
  const [monthLoading, setMonthLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  // Org holidays are a fixed yearly-recurring list (see Settings > Holidays),
  // so one load covers every month.
  useEffect(() => {
    getOrgHolidays().then(setOrgHolidays).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAdminView) return;
    getAllEmployees()
      .then(setEmployees)
      .catch(() => {});
    getAttendanceForDate()
      .then(setTodayRecords)
      .finally(() => setTodayLoading(false));
  }, [isAdminView]);

  useEffect(() => {
    if (!isAdminView || viewMode !== "month") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMonthLoading(true);
    // Leave that started late last year can still cover January.
    const years = ym.m === 1 ? [ym.y, ym.y - 1] : [ym.y];
    Promise.all([getAttendanceForMonth(ym.y, ym.m), ...years.map((y) => getAllLeaveRequests(y))])
      .then(([recs, ...leaveLists]) => {
        setMonthRecords(recs);
        setMonthLeaves(leaveLists.flat().filter((l) => l.status === "approved"));
      })
      .finally(() => setMonthLoading(false));
  }, [isAdminView, viewMode, ym]);

  // People expected to mark attendance: active staff except super_admin
  // (who never marks it — the cron skips them too).
  const staff = useMemo(
    () =>
      employees
        .filter((e) => e.status === "active" && e.role !== "super_admin")
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [employees]
  );

  const term = search.trim().toLowerCase();
  const matchesSearch = (name, dept) => !term || (name || "").toLowerCase().includes(term) || (dept || "").toLowerCase().includes(term);

  // ---------------- Today ----------------
  const todayRows = useMemo(() => {
    const byUid = new Map(todayRecords.map((r) => [r.employeeUid, r]));
    const rows = staff.map((e) => ({ uid: e.uid, name: e.name, department: e.department, rec: byUid.get(e.uid) || null }));
    // Anyone with a record who isn't in the active staff list (e.g. deactivated since) still shows.
    todayRecords.forEach((r) => {
      if (!staff.some((e) => e.uid === r.employeeUid)) rows.push({ uid: r.employeeUid, name: r.employeeName, department: r.department, rec: r });
    });
    return rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [staff, todayRecords]);

  const todaySummary = useMemo(() => {
    const present = todayRecords.filter((r) => PRESENT_STATUSES.includes(r.status)).length;
    const onLeave = todayRecords.filter((r) => LEAVE_STATUSES.includes(r.status)).length;
    const stillWorking = todayRecords.filter((r) => r.checkInTime && !r.checkOutTime).length;
    const notIn = todayRows.filter((r) => !r.rec).length;
    return { team: todayRows.length, present, onLeave, stillWorking, notIn };
  }, [todayRecords, todayRows]);

  const todayIsWorking = monthCalendar(Number(today.slice(0, 4)), Number(today.slice(5, 7)), orgHolidays, today).days.find((d) => d.date === today)?.working;

  // ---------------- Month ----------------
  const cal = useMemo(() => monthCalendar(ym.y, ym.m, orgHolidays, today), [ym, orgHolidays, today]);
  const isCurrentMonth = today.startsWith(`${ym.y}-${String(ym.m).padStart(2, "0")}`);

  const monthRows = useMemo(() => {
    const recsByUid = {};
    monthRecords.forEach((r) => {
      (recsByUid[r.employeeUid] ||= []).push(r);
    });
    const people = new Map(staff.map((e) => [e.uid, { uid: e.uid, name: e.name, department: e.department }]));
    monthRecords.forEach((r) => {
      if (!people.has(r.employeeUid)) people.set(r.employeeUid, { uid: r.employeeUid, name: r.employeeName, department: r.department });
    });
    return [...people.values()]
      .map((p) => ({
        ...p,
        records: (recsByUid[p.uid] || []).sort((a, b) => a.date.localeCompare(b.date)),
        ...employeeMonth(cal, recsByUid[p.uid] || [], monthLeaves.filter((l) => l.employeeUid === p.uid), today),
      }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [staff, monthRecords, monthLeaves, cal, today]);

  const monthSummary = useMemo(() => {
    const withPct = monthRows.filter((r) => r.attendancePct != null);
    const avgPct = withPct.length ? Math.round(withPct.reduce((s, r) => s + r.attendancePct, 0) / withPct.length) : null;
    const worked = monthRecords.filter((r) => r.totalWorkingMs > 0).map((r) => r.totalWorkingMs);
    return {
      people: monthRows.length,
      present: monthRows.reduce((s, r) => s + r.present, 0),
      leave: monthRows.reduce((s, r) => s + r.leave, 0),
      absent: monthRows.reduce((s, r) => s + r.absent, 0),
      avgPct,
      avgWorkingMs: worked.length ? worked.reduce((a, b) => a + b, 0) / worked.length : 0,
    };
  }, [monthRows, monthRecords]);

  // ---------------- Exports ----------------
  function exportToday() {
    const headers = ["Employee", "Department", "Status", "Check In", "Check Out", "Break", "Working Hours"];
    const rows = todayRows.map(({ name, department, rec }) => [
      name || "",
      department || "",
      rec ? statusLabel(rec.status) : "Not checked in",
      formatTime(rec?.checkInTime),
      formatTime(rec?.checkOutTime),
      rec ? formatDuration(getTotalBreakMs(rec)) : "-",
      rec ? formatDuration(rec.totalWorkingMs) : "-",
    ]);
    downloadCSV(`attendance-${today}.csv`, headers, rows);
  }

  function exportMonthSummary() {
    const headers = ["Employee", "Department", "Working Days", "Working Days So Far", "Present Days", "Leave Days", "Absent Days", "Worked On Off Days", "Attendance %", "Avg Working Hours"];
    const rows = monthRows.map((r) => [
      r.name || "",
      r.department || "",
      cal.workingDays,
      cal.workingDaysSoFar,
      r.present,
      r.leave,
      r.absent,
      r.extraDays,
      r.attendancePct ?? "",
      formatDuration(r.avgWorkingMs),
    ]);
    downloadCSV(`attendance-summary-${monthName(ym.m)}-${ym.y}.csv`, headers, rows);
  }

  function exportMonthDaily() {
    const headers = ["Employee", "Department", "Date", "Day Type", "Status", "Check In", "Check Out", "Break", "Working Hours"];
    const rows = monthRows.flatMap((r) =>
      r.days
        .filter((d) => d.kind !== "future")
        .map((d) => [
          r.name || "",
          r.department || "",
          d.date,
          d.working ? "Working" : d.holidayName ? `Holiday (${d.holidayName})` : "Sunday",
          d.record ? statusLabel(d.record.status) : statusLabel(d.kind),
          formatTime(d.record?.checkInTime),
          formatTime(d.record?.checkOutTime),
          d.record ? formatDuration(getTotalBreakMs(d.record)) : "-",
          d.record ? formatDuration(d.record.totalWorkingMs) : "-",
        ])
    );
    downloadCSV(`attendance-${monthName(ym.m)}-${ym.y}.csv`, headers, rows);
  }

  const filteredToday = todayRows.filter((r) => matchesSearch(r.name, r.department));
  const filteredMonth = monthRows.filter((r) => matchesSearch(r.name, r.department));
  const marksAttendance = user.role !== "super_admin";

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-5">
          <h1 className="font-heading text-xl font-semibold text-foreground sm:text-2xl">Attendance</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatDateIST(today)}
            {todayIsWorking === false ? " · Non-working day" : ""}
          </p>
        </div>

        {marksAttendance && (
          <div className="mb-8 grid gap-4 lg:grid-cols-2">
            <div>
              <AttendanceCard />
            </div>
            <MyMonth uid={user.uid} holidays={orgHolidays} today={today} />
          </div>
        )}

        {isAdminView && (
          <>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-2 font-heading text-lg font-semibold text-foreground">Team</h2>
                <Segmented
                  value={viewMode}
                  onChange={setViewMode}
                  options={[
                    { value: "today", label: "Today" },
                    { value: "month", label: "Monthly" },
                  ]}
                />
                {viewMode === "month" && (
                  <MonthNav
                    year={ym.y}
                    month={ym.m}
                    maxYear={Number(today.slice(0, 4))}
                    maxMonth={Number(today.slice(5, 7))}
                    onChange={(y, m) => {
                      setYm({ y, m });
                      setExpanded(null);
                    }}
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-56">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or department" className="pl-8" />
                </div>
                {viewMode === "today" ? (
                  <Button size="sm" variant="outline" disabled={!todayRows.length} onClick={exportToday}>
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" disabled={!monthRows.length} onClick={exportMonthSummary}>
                      <Download className="h-3.5 w-3.5" /> Summary CSV
                    </Button>
                    <Button size="sm" variant="outline" disabled={!monthRows.length} onClick={exportMonthDaily}>
                      <Download className="h-3.5 w-3.5" /> Daily CSV
                    </Button>
                  </>
                )}
              </div>
            </div>

            {viewMode === "today" ? (
              <>
                <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
                  <StatCard icon={Users} label="Team" value={todayLoading ? "–" : todaySummary.team} subtext="Active staff" />
                  <StatCard
                    icon={CheckCircle2}
                    label="Present"
                    tone="positive"
                    value={todayLoading ? "–" : todaySummary.present}
                    subtext={todayLoading ? undefined : `${todaySummary.stillWorking} still checked in`}
                  />
                  <StatCard icon={CalendarX} label="On leave" value={todayLoading ? "–" : todaySummary.onLeave} />
                  <StatCard
                    icon={UserX}
                    label="Not checked in"
                    tone={todaySummary.notIn ? "warning" : "neutral"}
                    value={todayLoading ? "–" : todaySummary.notIn}
                    subtext={todayIsWorking === false ? "Non-working day" : undefined}
                  />
                </div>

                {todayLoading ? (
                  <Skeleton rows={5} />
                ) : filteredToday.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">No one matches.</CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Phone */}
                    <div className="flex flex-col gap-2 md:hidden">
                      {filteredToday.map(({ uid, name, department, rec }) => (
                        <div key={uid} className="rounded-xl bg-card p-3 shadow-xs ring-1 ring-foreground/10">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <AvatarInitials name={name} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{name}</p>
                                <p className="truncate text-xs text-muted-foreground">{department}</p>
                              </div>
                            </div>
                            {rec ? (
                              <StatusBadge status={rec.status} />
                            ) : (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Not in yet</span>
                            )}
                          </div>
                          {rec?.checkInTime && (
                            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                              <div><p className="text-muted-foreground">In</p><p className="font-medium">{formatTime(rec.checkInTime)}</p></div>
                              <div><p className="text-muted-foreground">Out</p><p className="font-medium">{rec.checkOutTime ? formatTime(rec.checkOutTime) : "Working"}</p></div>
                              <div><p className="text-muted-foreground">Worked</p><p className="font-medium">{formatDuration(rec.totalWorkingMs)}</p></div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Desktop */}
                    <Card className="hidden md:flex">
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
                            {filteredToday.map(({ uid, name, department, rec }) => (
                              <TableRow key={uid}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <AvatarInitials name={name} size="sm" />
                                    <span className="font-medium text-foreground">{name}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground">{department}</TableCell>
                                <TableCell>
                                  {rec ? (
                                    <StatusBadge status={rec.status} />
                                  ) : (
                                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Not in yet</span>
                                  )}
                                </TableCell>
                                <TableCell>{formatTime(rec?.checkInTime)}</TableCell>
                                <TableCell>{rec?.checkInTime && !rec.checkOutTime ? <span className="text-success">Working</span> : formatTime(rec?.checkOutTime)}</TableCell>
                                <TableCell>{rec ? formatDuration(getTotalBreakMs(rec)) : "-"}</TableCell>
                                <TableCell>{rec ? formatDuration(rec.totalWorkingMs) : "-"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5">
                  <StatCard icon={CalendarDays} label="Working days" value={cal.workingDays} subtext={workingDaysSub(cal, isCurrentMonth)} />
                  <StatCard icon={Percent} label="Avg attendance" tone={monthSummary.avgPct == null ? "neutral" : monthSummary.avgPct >= 90 ? "positive" : monthSummary.avgPct >= 75 ? "warning" : "negative"} value={monthLoading || monthSummary.avgPct == null ? "–" : `${monthSummary.avgPct}%`} subtext={`${monthSummary.people} people`} />
                  <StatCard icon={CalendarCheck} label="Present days" tone="positive" value={monthLoading ? "–" : monthSummary.present} subtext="All staff, working days" />
                  <StatCard icon={CalendarX} label="Leave / absent" value={monthLoading ? "–" : `${monthSummary.leave} / ${monthSummary.absent}`} subtext="Days" />
                  <div className="col-span-2 lg:col-span-1">
                    <StatCard icon={Clock} label="Avg working hours" value={monthLoading ? "–" : formatDuration(monthSummary.avgWorkingMs)} subtext="Per day worked" />
                  </div>
                </div>

                <p className="mb-3 text-xs text-muted-foreground">
                  Working days exclude Sundays and org holidays ({cal.holidays} this month) ·{" "}
                  <Link href="/settings?tab=holidays" className="underline-offset-2 hover:underline">Manage holiday list</Link>
                </p>

                {monthLoading ? (
                  <Skeleton rows={6} />
                ) : filteredMonth.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">No attendance for this month.</CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Phone */}
                    <div className="flex flex-col gap-2 md:hidden">
                      {filteredMonth.map((r) => {
                        const open = expanded === r.uid;
                        return (
                          <div key={r.uid} className="rounded-xl bg-card p-3 shadow-xs ring-1 ring-foreground/10">
                            <button type="button" className="w-full text-left" onClick={() => setExpanded(open ? null : r.uid)}>
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <AvatarInitials name={r.name} size="sm" />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{r.name}</p>
                                    <p className="truncate text-xs text-muted-foreground">{r.department}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="font-heading text-lg font-semibold tabular-nums">
                                    {r.present}
                                    <span className="text-sm font-normal text-muted-foreground">/{isCurrentMonth ? cal.workingDaysSoFar : cal.workingDays}</span>
                                  </p>
                                  <PctBar pct={r.attendancePct} />
                                </div>
                              </div>
                              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                                <span>Leave {r.leave} · Absent {r.absent}</span>
                                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </div>
                            </button>
                            {open && (
                              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                                <MonthCalendar days={r.days} compact />
                                <CalendarLegend />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop */}
                    <Card className="hidden md:flex">
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Employee</TableHead>
                              <TableHead className="text-right">Present / Working</TableHead>
                              <TableHead>Attendance</TableHead>
                              <TableHead className="text-right">Leave</TableHead>
                              <TableHead className="text-right">Absent</TableHead>
                              <TableHead className="text-right">Avg hours</TableHead>
                              <TableHead className="w-10" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredMonth.map((r) => {
                              const open = expanded === r.uid;
                              return [
                                <TableRow key={r.uid} className="cursor-pointer" onClick={() => setExpanded(open ? null : r.uid)}>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <AvatarInitials name={r.name} size="sm" />
                                      <div>
                                        <p className="font-medium text-foreground">{r.name}</p>
                                        <p className="text-xs text-muted-foreground">{r.department}</p>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    <span className="font-semibold">{r.present}</span>
                                    <span className="text-muted-foreground"> / {cal.workingDays}</span>
                                    {isCurrentMonth && <p className="text-[11px] text-muted-foreground">{cal.workingDaysSoFar} so far</p>}
                                  </TableCell>
                                  <TableCell><PctBar pct={r.attendancePct} /></TableCell>
                                  <TableCell className="text-right tabular-nums">{r.leave}</TableCell>
                                  <TableCell className={`text-right tabular-nums ${r.absent ? "font-medium text-destructive" : "text-muted-foreground"}`}>{r.absent}</TableCell>
                                  <TableCell className="text-right">{formatDuration(r.avgWorkingMs)}</TableCell>
                                  <TableCell>{open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}</TableCell>
                                </TableRow>,
                                open && (
                                  <TableRow key={`${r.uid}-detail`} className="hover:bg-transparent">
                                    <TableCell colSpan={7} className="bg-muted/30 p-4">
                                      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
                                        <div className="flex flex-col gap-2">
                                          <MonthCalendar days={r.days} compact />
                                          <CalendarLegend />
                                          {r.extraDays > 0 && <p className="text-xs text-muted-foreground">Also worked {r.extraDays} Sunday/holiday{r.extraDays === 1 ? "" : "s"}.</p>}
                                        </div>
                                        {r.records.length === 0 ? (
                                          <p className="text-sm text-muted-foreground">No check-ins this month.</p>
                                        ) : (
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
                                              {r.records.map((rec) => (
                                                <TableRow key={rec.id || rec.date}>
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
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ),
                              ];
                            })}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
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
