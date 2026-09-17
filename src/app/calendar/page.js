"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAllEvents, getEventsForEmployee } from "@/lib/firebase/events";
import { getProjectsForLeader } from "@/lib/firebase/projects";
import { getAllLeaveRequests, getLeaveHistoryForEmployee } from "@/lib/firebase/leave";
import { getAllLeads } from "@/lib/firebase/leads";
import { getAllDeliverables, getDeliverablesForEmployee } from "@/lib/firebase/deliverables";
import { getOrgHolidays } from "@/lib/firebase/holidays";
import { getHolidayForDate } from "@/lib/holidays";
import { getAllCalendarBookings } from "@/lib/firebase/calendarBookings";
import { formatBookingTimeRange } from "@/lib/calendarBookings";
import { getAllEmployees } from "@/lib/firebase/employees";
import { getAllFreelancers } from "@/lib/firebase/freelancers";
import BookingDialog from "@/components/BookingDialog";
import { Button } from "@/components/ui/button";
import { isEventPast } from "@/lib/status";
import { getISTDateStr } from "@/lib/dateIST";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarOff,
  ListChecks,
  Target,
  Users2,
  Plus,
  Pencil,
} from "lucide-react";

// Toggle-able categories shown as pill filters above the calendar, plus
// the dot color each uses consistently across the month grid, stat bar,
// and agenda list.
const CATEGORY_META = {
  shoots: { label: "Shoots", dot: "bg-accent" },
  leave: { label: "Leave", dot: "bg-destructive" },
  deadlines: { label: "Deadlines", dot: "bg-[oklch(0.6_0.14_220)]" },
  meetings: { label: "Meetings & Tasks", dot: "bg-[oklch(0.65_0.15_150)]" },
  leads: { label: "Lead follow-ups", dot: "bg-[oklch(0.7_0.15_260)]" },
};

// HR sees org-wide leave (privacy boundary carried over from the Leave
// module — PMs don't get org-wide leave visibility there either).
const HR_ROLES = ["super_admin", "admin", "hr"];
// Admin/PM/HR all get the org-wide events view via isCalendarViewer() on
// the backend; everyone else only sees what they're personally on.
const ORG_WIDE_ROLES = ["super_admin", "admin", "project_manager", "hr"];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n) {
  return String(n).length < 2 ? `0${n}` : `${n}`;
}

function toDateStr(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function rangeDates(start, end) {
  const dates = [];
  if (!start) return dates;
  const s = new Date(start);
  const e = new Date(end || start);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    dates.push(getISTDateStr(d));
  }
  return dates;
}

const ADMIN_PM_ROLES = ["super_admin", "admin", "project_manager"];

function CalendarContent() {
  const { user } = useAuth();
  const isOrgWide = ORG_WIDE_ROLES.includes(user.role);
  const isHRView = HR_ROLES.includes(user.role);
  const isAdminOrPM = ADMIN_PM_ROLES.includes(user.role);

  const todayStr = getISTDateStr();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const [events, setEvents] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  // Leads only load for project-ops roles — the leads collection's
  // Firestore rules don't grant read access to HR or regular employees,
  // so requesting it for anyone else would just fail.
  const [leads, setLeads] = useState([]);
  const [bookings, setBookings] = useState([]);
  // Everyone who could conceivably be booked — active employees +
  // freelancers. Loaded unconditionally (not gated by role) since
  // anyone can book a slot for anyone: the attendee picker in
  // BookingDialog needs the full list regardless of who's logged in.
  const [bookablePeople, setBookablePeople] = useState([]);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  // projectIds this user leads — determines whether a non-admin/PM user can
  // open an event's full detail page (mirrors the access check that page
  // itself does against project.leaderUid).
  const [ledProjectIds, setLedProjectIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [showPast, setShowPast] = useState(false);
  const [viewMode, setViewMode] = useState("month"); // "month" | "agenda"
  const [activeCategories, setActiveCategories] = useState({
    shoots: true,
    leave: true,
    deadlines: true,
    meetings: true,
    leads: true,
  });
  const [personFilter, setPersonFilter] = useState("Everyone");

  function toggleCategory(key) {
    setActiveCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    getOrgHolidays().then(setHolidays);
  }, []);

  useEffect(() => {
    Promise.all([getAllEmployees(), getAllFreelancers()]).then(([emps, frees]) => {
      setBookablePeople([
        ...(emps || [])
          .filter((e) => e.status === "active")
          .map((e) => ({ uid: e.uid, name: e.name, role: e.role, isFreelancer: false })),
        ...(frees || [])
          .filter((f) => f.status === "active")
          .map((f) => ({ uid: f.id, name: f.name, role: f.skill, isFreelancer: true })),
      ]);
    });
  }, []);

  // Bookings are org-wide and unconditional — everyone can see and create
  // them for anyone, so unlike events/leave/leads there's no role-gated
  // fetch to choose between. The effect uses .then() directly (matching
  // the holidays effect above) rather than calling loadBookings() from
  // inside it — the compiler flags a named async function invoked
  // directly in an effect as a cascading-render risk even though this
  // one only runs once on mount.
  async function loadBookings() {
    try {
      setBookings(await getAllCalendarBookings());
    } catch (err) {
      console.error("Calendar: failed to load bookings:", err);
    }
  }
  useEffect(() => {
    getAllCalendarBookings()
      .then(setBookings)
      .catch((err) => console.error("Calendar: failed to load bookings:", err));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      // Promise.allSettled instead of Promise.all: these five sources are
      // independent (different collections/queries with their own access
      // rules and, in some cases, their own composite index requirements),
      // so one of them failing — e.g. a missing Firestore index — should
      // never blank out the other four. Each source keeps its previously
      // loaded value on failure and reports its own error individually.
      const results = await Promise.allSettled([
        isOrgWide ? getAllEvents() : getEventsForEmployee(user.uid),
        isHRView ? getAllLeaveRequests(cursor.year) : getLeaveHistoryForEmployee(user.uid),
        isAdminOrPM ? Promise.resolve([]) : getProjectsForLeader(user.uid),
        isAdminOrPM ? getAllLeads() : Promise.resolve([]),
        isOrgWide ? getAllDeliverables() : getDeliverablesForEmployee(user.uid),
      ]);
      if (cancelled) return;

      const [evtsResult, leavesResult, ledResult, leadsResult, deliverablesResult] = results;
      const labels = ["events", "leave", "your led projects", "leads", "deliverables"];
      const failed = results
        .map((r, i) => (r.status === "rejected" ? labels[i] : null))
        .filter(Boolean);

      if (evtsResult.status === "fulfilled") setEvents(evtsResult.value);
      if (leavesResult.status === "fulfilled") {
        setLeaveRequests(
          leavesResult.value.filter((l) => l.status === "approved" || l.status === "pending")
        );
      }
      if (ledResult.status === "fulfilled") {
        setLedProjectIds(new Set(ledResult.value.map((p) => p.id)));
      }
      if (leadsResult.status === "fulfilled") setLeads(leadsResult.value);
      if (deliverablesResult.status === "fulfilled") setDeliverables(deliverablesResult.value);

      if (failed.length > 0) {
        // Log the underlying reasons for debugging (e.g. a missing
        // composite index shows up here with a Firestore console link),
        // while keeping the on-screen message short.
        results.forEach((r, i) => {
          if (r.status === "rejected") {
            console.error(`Calendar: failed to load ${labels[i]}:`, r.reason);
          }
        });
        setError(`Couldn't load: ${failed.join(", ")}. Check the console for details.`);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user.uid, isOrgWide, isHRView, isAdminOrPM, cursor.year]);

  // Where clicking an event on the calendar should go, mirroring the same
  // access checks the destination pages themselves enforce — admins/PMs and
  // the project's leader get the full edit page; a regular team member gets
  // their own read/status-update view; anyone else (e.g. HR looking at an
  // event they're not on) gets no link, since neither page would let them in.
  function eventHref(ev) {
    if (isAdminOrPM || ledProjectIds.has(ev.projectId)) {
      return `/projects/${ev.projectId}/events/${ev.id}`;
    }
    if ((ev.team || []).some((m) => m.uid === user.uid)) {
      return `/my-projects/${ev.projectId}/${ev.id}`;
    }
    return null;
  }

  // Same idea for deliverables: only link to the full project page for
  // roles that can actually open it — isOrgWide (admin/PM/HR, matching
  // isCalendarViewer on the rules side) or the project's own leader. A
  // deliverable assignee who's neither would hit a permission error on
  // that page, so they get a plain (non-clickable) card instead.
  function deliverableHref(dl) {
    if (isOrgWide || ledProjectIds.has(dl.projectId)) {
      return `/projects/${dl.projectId}`;
    }
    return null;
  }

  // Everyone who shows up on an event's crew — powers the "Everyone /
  // person" filter dropdown so a PM can see just one person's schedule.
  const peopleOptions = useMemo(() => {
    const names = new Set();
    events.forEach((ev) => (ev.team || []).forEach((m) => m.name && names.add(m.name)));
    // Union in booking attendees too — someone who only ever attends
    // meetings (e.g. office staff never on a shoot crew) would otherwise
    // never appear in the person filter.
    bookings.forEach((b) => (b.attendeeNames || []).forEach((n) => n && names.add(n)));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [events, bookings]);

  // Bucket everything by date string for fast day lookups. Past events
  // (Delivered/Archived) are excluded unless "Show past" is on — keeps
  // the calendar focused on what's actually coming up by default.
  // Category pills and the person filter are applied here too, so the
  // month grid, stat bar, and agenda list all stay in sync.
  const dayMap = useMemo(() => {
    const visibleEvents = showPast ? events : events.filter((ev) => !isEventPast(ev));
    const map = {};
    const ensure = (d) => {
      if (!map[d]) map[d] = { events: [], leaves: [], leads: [], deliverables: [], bookings: [] };
      return map[d];
    };
    const personMatches = (name) => personFilter === "Everyone" || name === personFilter;

    if (activeCategories.shoots) {
      visibleEvents
        .filter((ev) => personFilter === "Everyone" || (ev.team || []).some((m) => m.name === personFilter))
        .forEach((ev) => {
          rangeDates(ev.eventStartDate, ev.eventEndDate).forEach((d) => {
            ensure(d).events.push(ev);
          });
        });
    }
    if (activeCategories.leave) {
      leaveRequests
        .filter((lv) => personMatches(lv.employeeName))
        .forEach((lv) => {
          rangeDates(lv.startDate, lv.endDate).forEach((d) => {
            ensure(d).leaves.push(lv);
          });
        });
    }
    if (activeCategories.leads && personFilter === "Everyone") {
      leads.forEach((ld) => {
        if (ld.eventDate) ensure(ld.eventDate).leads.push({ ...ld, kind: "event" });
        if (ld.followUpDate) ensure(ld.followUpDate).leads.push({ ...ld, kind: "follow-up" });
      });
    }
    // Post-production deliverables: plotted on their deadline (the date
    // that actually matters for "is this late"), same way tasks use
    // dueDate. Done deliverables are skipped by default along with past
    // events unless "Show past" is on, so a wrapped-up delivery doesn't
    // keep cluttering the calendar.
    if (activeCategories.deadlines) {
      deliverables
        .filter((dl) => personMatches(dl.assignedName))
        .forEach((dl) => {
          if (!dl.deadline) return;
          if (!showPast && dl.status === "Delivered") return;
          ensure(dl.deadline).deliverables.push(dl);
        });
    }
    if (activeCategories.meetings) {
      bookings
        .filter((b) => personFilter === "Everyone" || (b.attendeeNames || []).includes(personFilter))
        .forEach((b) => {
          if (b.date) ensure(b.date).bookings.push(b);
        });
    }
    return map;
  }, [events, leaveRequests, leads, deliverables, bookings, showPast, activeCategories, personFilter]);

  const { year, month } = cursor;
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay();
  const monthLabel = firstOfMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthDateStrs = useMemo(() => {
    const arr = [];
    for (let d = 1; d <= daysInMonth; d++) arr.push(toDateStr(year, month, d));
    return arr;
  }, [year, month, daysInMonth]);

  // Summary counters shown in the strip above the grid — scoped to the
  // currently visible month and whatever category/person filters are on.
  const monthStats = useMemo(() => {
    const shootIds = new Set();
    let crewDays = 0;
    let leaveDays = 0;
    let deadlineCount = 0;
    let leadCount = 0;
    let bookingCount = 0;
    monthDateStrs.forEach((d) => {
      const info = dayMap[d];
      if (!info) return;
      info.events.forEach((ev) => {
        shootIds.add(ev.id);
        crewDays += (ev.team || []).length;
      });
      leaveDays += info.leaves.length;
      deadlineCount += info.deliverables.length;
      leadCount += info.leads.length;
      bookingCount += info.bookings.length;
    });
    return {
      shoots: shootIds.size,
      crewDays,
      leaveDays,
      deadlineCount,
      leadCount,
      bookingCount,
    };
  }, [dayMap, monthDateStrs]);

  function goMonth(delta) {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setCursor({ year: y, month: m });
  }

  const selectedInfo = dayMap[selectedDate] || { events: [], leaves: [], leads: [], deliverables: [], bookings: [] };

  function openNewBooking(dateForNew) {
    setEditingBooking(null);
    setBookingDialogOpen(true);
    if (dateForNew) setSelectedDate(dateForNew);
  }
  function openEditBooking(b) {
    setEditingBooking(b);
    setBookingDialogOpen(true);
  }
  function canManageBooking(b) {
    return isAdminOrPM || b.createdByUid === user.uid;
  }
  const selectedHoliday = getHolidayForDate(selectedDate, holidays);
  const selectedIsSunday = new Date(`${selectedDate}T12:00:00`).getDay() === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-semibold text-foreground sm:text-2xl">Team Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Who is shooting where, who's off, and what's due — in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => openNewBooking(selectedDate)}>
            <Plus className="h-4 w-4" /> New Booking
          </Button>
          <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showPast}
              onChange={(e) => setShowPast(e.target.checked)}
              className="h-3.5 w-3.5 shrink-0 rounded border-border"
            />
            Show past
          </label>
          <div className="flex shrink-0 items-center rounded-md border border-border p-0.5">
            <button
              onClick={() => setViewMode("month")}
              className={`rounded-[calc(var(--radius-md))] px-3 py-1 text-sm font-medium transition-colors ${
                viewMode === "month"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode("agenda")}
              className={`rounded-[calc(var(--radius-md))] px-3 py-1 text-sm font-medium transition-colors ${
                viewMode === "agenda"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Agenda
            </button>
          </div>
        </div>
      </div>

      {/* Summary strip */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <span>
          <strong className="font-semibold text-foreground">{monthStats.shoots}</strong> shoots
        </span>
        <span>
          <strong className="font-semibold text-foreground">{monthStats.crewDays}</strong> crew-days booked
        </span>
        <span>
          <strong className="font-semibold text-foreground">{monthStats.leaveDays}</strong>{" "}
          {monthStats.leaveDays === 1 ? "leave day" : "leave days"}
        </span>
        <span>
          <strong className="font-semibold text-foreground">{monthStats.deadlineCount}</strong> deliverable
          deadlines
        </span>
        <span>
          <strong className="font-semibold text-foreground">{monthStats.bookingCount}</strong>{" "}
          {monthStats.bookingCount === 1 ? "meeting/task" : "meetings/tasks"}
        </span>
        {isAdminOrPM && (
          <span>
            <strong className="font-semibold text-foreground">{monthStats.leadCount}</strong> lead follow-up
            {monthStats.leadCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Filter pills + person picker */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {Object.entries(CATEGORY_META).map(([key, meta]) => {
            if (key === "leads" && !isAdminOrPM) return null;
            const active = activeCategories[key];
            return (
              <button
                key={key}
                onClick={() => toggleCategory(key)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-transparent bg-foreground text-background"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-background" : meta.dot}`} />
                {meta.label}
              </button>
            );
          })}
        </div>
        {peopleOptions.length > 0 && (
          <Select value={personFilter} onValueChange={setPersonFilter}>
            <SelectTrigger className="w-full sm:w-[180px]" size="sm">
              <SelectValue placeholder="Everyone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Everyone">Everyone</SelectItem>
              {peopleOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div
        className={`grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] ${
          viewMode === "agenda" ? "items-start" : "items-stretch"
        }`}
      >
        {/* Month grid / Agenda list */}
        <Card
          className={
            viewMode === "agenda"
              ? "overflow-hidden py-0"
              : "h-full [--card-spacing:--spacing(3)] sm:[--card-spacing:--spacing(6)]"
          }
        >
          {viewMode === "agenda" ? (
            <AgendaList
              monthDateStrs={monthDateStrs}
              dayMap={dayMap}
              todayStr={todayStr}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              holidays={holidays}
            />
          ) : (
          <CardContent className="flex h-full flex-col">
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={() => goMonth(-1)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h2 className="font-heading text-base font-semibold text-foreground">{monthLabel}</h2>
              <button
                onClick={() => goMonth(1)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>

            <div className="grid flex-1 grid-cols-7 auto-rows-fr overflow-hidden rounded-md border border-border">
              {cells.map((d, idx) => {
                const edgeClasses = "border-r border-b border-border";
                if (d === null)
                  return (
                    <div
                      key={`empty-${idx}`}
                      className={`min-h-[4rem] bg-muted/30 sm:min-h-[5.5rem] ${edgeClasses}`}
                    />
                  );
                const dateStr = toDateStr(year, month, d);
                const info = dayMap[dateStr];
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const isOffDay = new Date(`${dateStr}T12:00:00`).getDay() === 0;
                const holiday = getHolidayForDate(dateStr, holidays);

                // Flatten the day's items into one ordered, color-coded list so
                // the cell itself shows *what's* happening, not just dots
                // hinting that something is. Events lead (most decision-
                // relevant), then deliverables, leave, then leads. Capped at 3
                // with a "+N more" so a heavy day doesn't blow out the grid —
                // full detail is still one click away in the side panel.
                const dayItems = info
                  ? [
                      ...info.events.map((ev) => ({ label: ev.eventName, bg: "bg-accent/10", text: "text-accent" })),
                      ...info.deliverables.map((dl) => ({
                        label: dl.type,
                        bg: "bg-[oklch(0.6_0.14_220)]/10",
                        text: "text-[oklch(0.6_0.14_220)]",
                      })),
                      ...info.bookings.map((b) => ({
                        label: b.title,
                        bg: "bg-[oklch(0.65_0.15_150)]/10",
                        text: "text-[oklch(0.65_0.15_150)]",
                      })),
                      ...info.leaves.map((lv) => ({
                        label: lv.employeeName || "On leave",
                        bg: "bg-destructive/10",
                        text: "text-destructive",
                      })),
                      ...info.leads.map((ld) => ({
                        label: ld.clientName,
                        bg: "bg-[oklch(0.7_0.15_260)]/10",
                        text: "text-[oklch(0.7_0.15_260)]",
                      })),
                    ]
                  : [];
                const visibleItems = dayItems.slice(0, 3);
                const extraCount = dayItems.length - visibleItems.length;

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    title={holiday ? holiday.name : undefined}
                    className={`flex h-full min-h-[4rem] min-w-0 flex-col items-stretch gap-1 p-1 text-left text-xs transition-colors sm:min-h-[5.5rem] sm:p-1.5 ${edgeClasses} ${
                      isSelected
                        ? "bg-accent/10 ring-2 ring-inset ring-accent"
                        : isToday
                        ? "bg-muted ring-1 ring-inset ring-accent/50"
                        : holiday
                        ? "bg-destructive/5"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span
                      className={`self-start font-medium ${
                        isToday ? "text-accent" : holiday || isOffDay ? "text-destructive/70" : "text-foreground"
                      }`}
                    >
                      {d}
                    </span>
                    <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                      {visibleItems.map((item, i) => (
                        <span
                          key={i}
                          className={`truncate rounded-sm px-1 py-0.5 text-left text-[10px] font-medium leading-tight ${item.bg} ${item.text}`}
                        >
                          {item.label}
                        </span>
                      ))}
                      {extraCount > 0 && (
                        <span className="px-1 text-[10px] text-muted-foreground">+{extraCount} more</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-accent" /> Shoot / event
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-destructive" /> Leave
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[oklch(0.6_0.14_220)]" /> Deliverable deadline
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[oklch(0.65_0.15_150)]" /> Meeting / task
              </span>
              {isAdminOrPM && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[oklch(0.7_0.15_260)]" /> Lead event / follow-up
                </span>
              )}
            </div>
          </CardContent>
          )}
        </Card>

        {/* Day detail panel */}
        <Card className="flex h-full flex-col overflow-hidden py-0">
          <div className="flex shrink-0 items-center justify-between gap-2 bg-muted/60 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-heading text-base font-semibold text-foreground">
                {new Date(selectedDate).toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}
                {selectedDate === todayStr && (
                  <span className="ml-2 align-middle text-[10px] font-medium uppercase tracking-wide text-accent">
                    Today
                  </span>
                )}
              </h3>
              {(selectedHoliday || selectedIsSunday) && (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                  {selectedHoliday ? selectedHoliday.name : "Weekly Off"}
                </span>
              )}
            </div>
            {selectedDate !== todayStr && (
              <button
                onClick={() => setSelectedDate(todayStr)}
                className="text-xs text-accent hover:underline"
              >
                Jump to today
              </button>
            )}
          </div>
          <CardContent className="flex-1 overflow-y-auto pt-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="flex flex-col gap-4">
                <DaySection
                  first
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                  title="Shoots / Events"
                  empty="No events"
                >
                  {selectedInfo.events.map((ev) => {
                    const href = eventHref(ev);
                    const CardTag = href ? Link : "div";
                    const past = isEventPast(ev);
                    return (
                      <CardTag
                        key={ev.id}
                        {...(href ? { href } : {})}
                        className={`flex items-start justify-between gap-2 rounded-md border border-border p-2 ${
                          past ? "opacity-60" : ""
                        } ${href ? "transition-colors hover:border-accent/50 hover:bg-muted" : ""}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{ev.eventName}</p>
                          <p className="text-xs text-muted-foreground">
                            {ev.projectName} · {ev.clientName}
                          </p>
                          {ev.team?.length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Team: {ev.team.map((m) => m.name).join(", ")}
                            </p>
                          )}
                          <div className="mt-1">
                            <StatusBadge status={ev.status} />
                          </div>
                        </div>
                        {href && (
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </CardTag>
                    );
                  })}
                </DaySection>

                <DaySection
                  icon={<Users2 className="h-3.5 w-3.5" />}
                  title="Meetings & Tasks"
                  empty="Nothing booked"
                >
                  {selectedInfo.bookings.map((b) => {
                    const manageable = canManageBooking(b);
                    return (
                      <div
                        key={b.id}
                        onClick={() => manageable && openEditBooking(b)}
                        className={`flex items-start justify-between gap-2 rounded-md border border-border p-2 ${
                          manageable ? "cursor-pointer transition-colors hover:border-accent/50 hover:bg-muted" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{b.title}</p>
                          <p className="text-xs text-muted-foreground">{formatBookingTimeRange(b)}</p>
                          {b.attendeeNames?.length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              With: {b.attendeeNames.join(", ")}
                            </p>
                          )}
                          {b.location && <p className="mt-0.5 text-xs text-muted-foreground">📍 {b.location}</p>}
                        </div>
                        {manageable && (
                          <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                      </div>
                    );
                  })}
                </DaySection>

                <DaySection
                  icon={<CalendarOff className="h-3.5 w-3.5" />}
                  title="On Leave"
                  empty="No one on leave"
                >
                  {selectedInfo.leaves.map((lv) => (
                    <div key={lv.id} className="rounded-md border border-border p-2">
                      <p className="text-sm font-medium text-foreground">
                        {lv.employeeName || "Employee"}
                      </p>
                      <p className="text-xs text-muted-foreground">{lv.department}</p>
                      <div className="mt-1">
                        <StatusBadge status={lv.status} />
                      </div>
                    </div>
                  ))}
                </DaySection>

                <DaySection
                  icon={<ListChecks className="h-3.5 w-3.5" />}
                  title="Deliverable Deadlines"
                  empty="No deliverables due"
                >
                  {selectedInfo.deliverables.map((dl) => {
                    const overdue = dl.status !== "Delivered" && dl.deadline < todayStr;
                    const href = deliverableHref(dl);
                    const CardTag = href ? Link : "div";
                    return (
                      <CardTag
                        key={dl.id}
                        {...(href ? { href } : {})}
                        className={`flex items-start justify-between gap-2 rounded-md border border-border p-2 ${
                          href ? "transition-colors hover:border-accent/50 hover:bg-muted" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{dl.type}</p>
                          <p className="text-xs text-muted-foreground">
                            {dl.projectName} · {dl.clientName}
                            {dl.assignedName ? ` · ${dl.assignedName}` : ""}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <StatusBadge status={dl.status} />
                            {overdue && (
                              <span className="text-[10px] font-medium uppercase tracking-wide text-destructive">
                                Overdue
                              </span>
                            )}
                          </div>
                        </div>
                        {href && (
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </CardTag>
                    );
                  })}
                </DaySection>

                {isAdminOrPM && (
                  <DaySection
                    icon={<Target className="h-3.5 w-3.5" />}
                    title="Lead Events / Follow-ups"
                    empty="No lead meetings or follow-ups"
                  >
                    {selectedInfo.leads.map((ld) => (
                      <Link
                        key={`${ld.id}-${ld.kind}`}
                        href={`/leads/${ld.id}`}
                        className="flex items-start justify-between gap-2 rounded-md border border-border p-2 transition-colors hover:border-accent/50 hover:bg-muted"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{ld.clientName}</p>
                          <p className="text-xs text-muted-foreground">
                            {ld.kind === "event" ? "Tentative Event" : "Follow-up"} · {ld.projectType}
                          </p>
                          <div className="mt-1">
                            <StatusBadge status={ld.status} />
                          </div>
                        </div>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    ))}
                  </DaySection>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <BookingDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        booking={editingBooking}
        defaultDate={selectedDate}
        people={bookablePeople}
        allBookings={bookings}
        events={events}
        leaveRequests={leaveRequests}
        currentUser={{ uid: user.uid, name: user.name }}
        canDelete={editingBooking ? canManageBooking(editingBooking) : true}
        onSaved={loadBookings}
      />
    </div>
  );
}

// Flat, scrollable list of every day in the month that has at least one
// item — a quicker way to scan what's coming up than clicking through
// the grid day by day.
function AgendaList({ monthDateStrs, dayMap, todayStr, selectedDate, setSelectedDate, holidays }) {
  const daysWithItems = monthDateStrs.filter((d) => {
    const info = dayMap[d];
    return (
      info &&
      (info.events.length || info.leaves.length || info.deliverables.length || info.leads.length || info.bookings.length)
    );
  });

  if (daysWithItems.length === 0) {
    return (
      <div className="flex items-center justify-center px-6 py-16 text-sm text-muted-foreground">
        Nothing scheduled this month.
      </div>
    );
  }

  return (
    <div className="max-h-[38rem] divide-y divide-border overflow-y-auto">
      {daysWithItems.map((d) => {
        const info = dayMap[d];
        const date = new Date(`${d}T12:00:00`);
        const dayNum = date.getDate();
        const weekday = date.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase();
        const isToday = d === todayStr;
        const isSelected = d === selectedDate;
        const holiday = getHolidayForDate(d, holidays);

        const items = [
          ...info.events.map((ev) => ({ key: `ev-${ev.id}`, label: ev.eventName, sub: ev.projectName, dot: CATEGORY_META.shoots.dot })),
          ...info.deliverables.map((dl) => ({ key: `dl-${dl.id}`, label: dl.type, sub: dl.projectName, dot: CATEGORY_META.deadlines.dot })),
          ...info.bookings.map((b) => ({ key: `bk-${b.id}`, label: b.title, sub: formatBookingTimeRange(b), dot: CATEGORY_META.meetings.dot })),
          ...info.leaves.map((lv) => ({ key: `lv-${lv.id}`, label: lv.employeeName || "On leave", sub: lv.department, dot: CATEGORY_META.leave.dot })),
          ...info.leads.map((ld) => ({ key: `ld-${ld.id}-${ld.kind}`, label: ld.clientName, sub: ld.kind === "event" ? "Tentative event" : "Follow-up", dot: CATEGORY_META.leads.dot })),
        ];

        return (
          <button
            key={d}
            onClick={() => setSelectedDate(d)}
            className={`flex w-full items-start gap-4 px-4 py-3 text-left transition-colors sm:px-5 ${
              isSelected ? "bg-accent/10" : "hover:bg-muted"
            }`}
          >
            <div className="w-12 shrink-0 text-center">
              <div
                className={`text-2xl font-semibold leading-none ${
                  isToday ? "text-accent" : holiday ? "text-destructive/80" : "text-foreground"
                }`}
              >
                {dayNum}
              </div>
              <div className="mt-1 text-[10px] font-medium tracking-wide text-muted-foreground">{weekday}</div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
              {items.map((item) => (
                <div key={item.key} className="flex items-center gap-2 text-sm">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.dot}`} />
                  <span className="truncate font-medium text-foreground">{item.label}</span>
                  {item.sub && <span className="truncate text-xs text-muted-foreground">{item.sub}</span>}
                </div>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DaySection({ icon, title, empty, children, first }) {
  const count = Array.isArray(children) ? children.length : children ? 1 : 0;
  const hasChildren = count > 0;
  return (
    <div className={first ? "" : "border-t border-border pt-4"}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {icon}
          {title}
        </div>
        {hasChildren && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {hasChildren ? (
        <div className="flex flex-col gap-2">{children}</div>
      ) : (
        <p className="text-xs text-muted-foreground/80">{empty}</p>
      )}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <AppShell>
          <CalendarContent />
        </AppShell>
      </DeviceGate>
    </ProtectedRoute>
  );
}