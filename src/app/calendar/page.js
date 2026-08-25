"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/ui/status-badge";
import { getAllEvents, getEventsForEmployee } from "@/lib/firebase/events";
import { getProjectsForLeader } from "@/lib/firebase/projects";
import { getAllLeaveRequests, getLeaveHistoryForEmployee } from "@/lib/firebase/leave";
import { getAllTasks, getTasksForEmployee } from "@/lib/firebase/postProduction";
import { getAllLeads } from "@/lib/firebase/leads";
import { isEventPast } from "@/lib/status";
import { getISTDateStr } from "@/lib/dateIST";
import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  CalendarDays,
  ListChecks,
  Target,
  X,
} from "lucide-react";

// HR sees org-wide leave (privacy boundary carried over from the Leave
// module — PMs don't get org-wide leave visibility there either).
const HR_ROLES = ["super_admin", "admin", "hr"];
// Admin/PM/HR all get the org-wide events + task view via isCalendarViewer()
// on the backend; everyone else only sees what they're personally on.
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
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [tasks, setTasks] = useState([]);
  // Leads only load for project-ops roles — the leads collection's
  // Firestore rules don't grant read access to HR or regular employees,
  // so requesting it for anyone else would just fail.
  const [leads, setLeads] = useState([]);
  // projectIds this user leads — determines whether a non-admin/PM user can
  // open an event's full detail page (mirrors the access check that page
  // itself does against project.leaderUid).
  const [ledProjectIds, setLedProjectIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [evts, leaves, tsks, ledProjects, lds] = await Promise.all([
          isOrgWide ? getAllEvents() : getEventsForEmployee(user.uid),
          isHRView ? getAllLeaveRequests(cursor.year) : getLeaveHistoryForEmployee(user.uid),
          isOrgWide ? getAllTasks() : getTasksForEmployee(user.uid),
          isAdminOrPM ? Promise.resolve([]) : getProjectsForLeader(user.uid),
          isAdminOrPM ? getAllLeads() : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setEvents(evts);
        setLeaveRequests(leaves.filter((l) => l.status === "approved" || l.status === "pending"));
        setTasks(tsks);
        setLedProjectIds(new Set(ledProjects.map((p) => p.id)));
        setLeads(lds);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load calendar data");
      } finally {
        if (!cancelled) setLoading(false);
      }
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

  // Bucket everything by date string for fast day lookups. Past events
  // (Delivered/Archived) are excluded unless "Show past" is on — keeps
  // the calendar focused on what's actually coming up by default.
  const dayMap = useMemo(() => {
    const visibleEvents = showPast ? events : events.filter((ev) => !isEventPast(ev));
    const map = {};
    const ensure = (d) => {
      if (!map[d]) map[d] = { events: [], leaves: [], tasks: [], leads: [] };
      return map[d];
    };
    visibleEvents.forEach((ev) => {
      rangeDates(ev.eventStartDate, ev.eventEndDate).forEach((d) => {
        ensure(d).events.push(ev);
      });
    });
    leaveRequests.forEach((lv) => {
      rangeDates(lv.startDate, lv.endDate).forEach((d) => {
        ensure(d).leaves.push(lv);
      });
    });
    tasks.forEach((t) => {
      if (t.dueDate) ensure(t.dueDate).tasks.push(t);
    });
    leads.forEach((ld) => {
      if (ld.meetingDate) ensure(ld.meetingDate).leads.push({ ...ld, kind: "meeting" });
      if (ld.followUpDate) ensure(ld.followUpDate).leads.push({ ...ld, kind: "follow-up" });
    });
    return map;
  }, [events, leaveRequests, tasks, leads, showPast]);

  const { year, month } = cursor;
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay();
  const monthLabel = firstOfMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

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

  const selectedInfo = dayMap[selectedDate] || { events: [], leaves: [], tasks: [], leads: [] };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold text-foreground">Team Calendar</h1>
          <p className="text-sm text-muted-foreground">
            {isOrgWide
              ? isAdminOrPM
                ? "Shoots, leave, post-production due dates, and lead meetings/follow-ups."
                : "Shoots, leave, and post-production due dates across the team."
              : "Your shoots, leave, and post-production due dates."}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showPast}
            onChange={(e) => setShowPast(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border"
          />
          Show past (Delivered/Archived) events
        </label>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Month grid */}
        <Card>
          <CardContent>
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

            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, idx) => {
                if (d === null) return <div key={`empty-${idx}`} className="aspect-square" />;
                const dateStr = toDateStr(year, month, d);
                const info = dayMap[dateStr];
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const hasEvents = info?.events?.length > 0;
                const hasLeaves = info?.leaves?.length > 0;
                const hasTasks = info?.tasks?.length > 0;
                const hasLeads = info?.leads?.length > 0;

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`flex aspect-square flex-col items-center justify-start gap-1 rounded-md border p-1 text-xs transition-colors ${
                      isSelected
                        ? "border-accent bg-accent/10"
                        : isToday
                        ? "border-accent/50 bg-muted"
                        : "border-transparent hover:bg-muted"
                    }`}
                  >
                    <span className={`font-medium ${isToday ? "text-accent" : "text-foreground"}`}>{d}</span>
                    <div className="flex flex-wrap items-center justify-center gap-0.5">
                      {hasEvents && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                      {hasLeaves && <span className="h-1.5 w-1.5 rounded-full bg-destructive" />}
                      {hasTasks && <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.55_0.09_150)]" />}
                      {hasLeads && <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.7_0.15_260)]" />}
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
                <span className="h-2 w-2 rounded-full bg-[oklch(0.55_0.09_150)]" /> Task due
              </span>
              {isAdminOrPM && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[oklch(0.7_0.15_260)]" /> Lead meeting / follow-up
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Day detail panel */}
        <Card>
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading text-sm font-semibold text-foreground">
                {new Date(selectedDate).toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}
              </h3>
              {selectedDate !== todayStr && (
                <button
                  onClick={() => setSelectedDate(todayStr)}
                  className="text-xs text-accent hover:underline"
                >
                  Today
                </button>
              )}
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="flex flex-col gap-4">
                <DaySection
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
                  icon={<X className="h-3.5 w-3.5" />}
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
                  icon={<Clapperboard className="h-3.5 w-3.5" />}
                  title="Tasks Due"
                  empty="No tasks due"
                >
                  {selectedInfo.tasks.map((t) => (
                    <div key={t.id} className="rounded-md border border-border p-2">
                      <p className="text-sm font-medium text-foreground">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.taskType} · {t.assignedName}
                      </p>
                      <div className="mt-1">
                        <StatusBadge status={t.status} />
                      </div>
                    </div>
                  ))}
                </DaySection>

                {isAdminOrPM && (
                  <DaySection
                    icon={<Target className="h-3.5 w-3.5" />}
                    title="Lead Meetings / Follow-ups"
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
                            {ld.kind === "meeting" ? "Meeting" : "Follow-up"} · {ld.projectType}
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
    </div>
  );
}

function DaySection({ icon, title, empty, children }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      {hasChildren ? (
        <div className="flex flex-col gap-2">{children}</div>
      ) : (
        <p className="text-xs text-muted-foreground">{empty}</p>
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