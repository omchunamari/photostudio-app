"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
// import RegularizationGate from "@/components/RegularizationGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import AttendanceCard from "@/components/AttendanceCard";
import DailyReportPanel from "@/components/DailyReportPanel";
import FinanceOverview from "@/components/dashboard/FinanceOverview";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { getAttendanceForDate } from "@/lib/firebase/attendance";
import { getAllEmployees } from "@/lib/firebase/employees";
import { getPendingLeaveRequests } from "@/lib/firebase/leave";
import { getAllDevices } from "@/lib/firebase/devices";
import { getAnnouncement, setAnnouncement, clearAnnouncement, toggleAnnouncementAck } from "@/lib/firebase/announcements";
import { getEventsForEmployee } from "@/lib/firebase/events";
import { getDeliverablesForEmployee } from "@/lib/firebase/deliverables";
import { isEventPast } from "@/lib/status";
import { FINANCE_ROLES, fyStartYearForDate, fyLabel, loadFinanceOverview } from "@/lib/dashboardFinance";
import { formatShortDateIST, formatShortDateTime12 } from "@/lib/dateIST";
import { toast } from "sonner";
import {
  Users,
  UserX,
  CalendarClock,
  Smartphone,
  FolderKanban,
  Megaphone,
  Pencil,
  ClipboardList,
  ThumbsUp,
} from "lucide-react";

// Admin behaves like a regular employee on the dashboard now — they check
// in, track their own projects/deliverables, and submit daily reports just
// like everyone else. Only super_admin gets the org-wide admin stats view.
const ADMIN_ROLES = ["super_admin"];
// Who can post/edit the dashboard-wide announcement — same boundary as
// project ops elsewhere (super_admin/admin/project_manager).
const ANNOUNCEMENT_ADMIN_ROLES = ["super_admin", "admin", "project_manager"];

function greetingPart() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function DashboardContent() {
  const { user } = useAuth();
  const isAdminView = ADMIN_ROLES.includes(user.role);
  const canEditAnnouncement = ANNOUNCEMENT_ADMIN_ROLES.includes(user.role);
  const isFinanceView = FINANCE_ROLES.includes(user.role);

  // --- Finance overview (Total Revenue / Received / Outstanding / Cash
  // Received / Payments chart / Team Wages Due) — admin/PM only. See
  // src/lib/dashboardFinance.js for the FY math and data aggregation. ---
  const currentFYStart = fyStartYearForDate(new Date());
  const [fyStart, setFyStart] = useState(currentFYStart);
  const fyOptions = [0, 1, 2, 3, 4].map((offset) => currentFYStart - offset);

  const [financeLoading, setFinanceLoading] = useState(true);
  const [finance, setFinance] = useState({
    totalRevenue: 0,
    projectsBooked: 0,
    receivedOnBookings: 0,
    outstanding: 0,
    cashReceived: 0,
    monthly: [],
    wagesDue: [],
  });

  useEffect(() => {
    if (!isFinanceView) return;
    let cancelled = false;
    setFinanceLoading(true);
    loadFinanceOverview(fyStart)
      .then((data) => {
        if (!cancelled) setFinance(data);
      })
      .catch((err) => console.error("Failed to load finance overview:", err))
      .finally(() => {
        if (!cancelled) setFinanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isFinanceView, fyStart]);

  const [adminStats, setAdminStats] = useState({
    presentToday: null,
    absentToday: null,
    pendingLeaves: null,
    pendingDevices: null,
  });

  const [myProjects, setMyProjects] = useState([]); // [{ projectId, projectName, eventCount, latestNote: { text, addedAt } | null }]
  const [myDeliverables, setMyDeliverables] = useState([]);

  const [announcement, setAnnouncementState] = useState(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [ackBusy, setAckBusy] = useState(false);

  const acks = announcement?.acks || {};
  const hasAcked = Boolean(acks[user.uid]);
  const ackCount = Object.keys(acks).length;
  const ackNames = Object.values(acks)
    .map((a) => a?.name)
    .filter(Boolean);

  useEffect(() => {
    loadAnnouncement();
  }, []);

  async function loadAnnouncement() {
    try {
      const a = await getAnnouncement();
      setAnnouncementState(a);
    } catch {
      // Non-critical widget — a failed load just means no banner shows.
    }
  }

  function openEditAnnouncement() {
    setAnnouncementDraft(announcement?.text || "");
    setEditingAnnouncement(true);
  }

  async function handleSaveAnnouncement() {
    const text = announcementDraft.trim();
    if (!text) {
      toast.error("Note can't be empty — use Remove to clear it instead");
      return;
    }
    setSavingAnnouncement(true);
    try {
      await setAnnouncement(text, user.uid, user.name);
      setAnnouncementState({ text, updatedBy: user.name, updatedByUid: user.uid, updatedAt: new Date().toISOString(), acks: {} });
      setEditingAnnouncement(false);
      toast.success("Note updated for everyone");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingAnnouncement(false);
    }
  }

  /**
   * Thumbs-up = "seen it". Optimistic so the tap feels instant; on failure we
   * roll the local state back rather than leave a tick that never persisted.
   */
  async function handleToggleAck() {
    if (!announcement || ackBusy) return;
    const previous = announcement;
    const nextAcks = { ...acks };
    if (hasAcked) delete nextAcks[user.uid];
    else nextAcks[user.uid] = { name: user.name, at: new Date().toISOString() };

    setAckBusy(true);
    setAnnouncementState({ ...announcement, acks: nextAcks });
    try {
      await toggleAnnouncementAck(user.uid, user.name, hasAcked);
    } catch (err) {
      setAnnouncementState(previous);
      toast.error(err.message);
    } finally {
      setAckBusy(false);
    }
  }

  async function handleClearAnnouncement() {
    setSavingAnnouncement(true);
    try {
      await clearAnnouncement();
      setAnnouncementState(null);
      setEditingAnnouncement(false);
      toast.success("Note removed");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingAnnouncement(false);
    }
  }

  useEffect(() => {
    if (isAdminView) {
      loadAdminStats();
    } else {
      loadMyProjects();
      loadMyDeliverables();
    }
  }, [isAdminView]);

  async function loadAdminStats() {
    const [todayAttendance, allEmployees, pendingLeaves, allDevices] = await Promise.all([
      getAttendanceForDate(),
      getAllEmployees(),
      getPendingLeaveRequests(),
      getAllDevices(),
    ]);

    const activeEmployees = allEmployees.filter((e) => e.status === "active");
    const presentToday = todayAttendance.filter((r) =>
      ["present", "late"].includes(r.status)
    ).length;
    const absentToday = activeEmployees.length - presentToday;
    const pendingDevices = allDevices.filter((d) => d.status === "pending").length;

    setAdminStats({
      presentToday,
      absentToday: absentToday < 0 ? 0 : absentToday,
      pendingLeaves: pendingLeaves.length,
      pendingDevices,
    });
  }

  async function loadMyProjects() {
    const events = await getEventsForEmployee(user.uid);
    const active = events.filter((ev) => !isEventPast(ev));

    const byProject = {};
    active.forEach((ev) => {
      if (!byProject[ev.projectId]) {
        byProject[ev.projectId] = { projectId: ev.projectId, projectName: ev.projectName, eventCount: 0, latestNote: null };
      }
      const entry = byProject[ev.projectId];
      entry.eventCount += 1;

      // Latest instruction for this employee on this event: either a
      // personal assignment note or a shared team note targeted to them.
      const member = (ev.team || []).find((m) => m.uid === user.uid);
      const personal = (member?.assignments || []).slice(-1)[0];
      const shared = (ev.teamNotes || [])
        .filter((n) => (n.targetUids || []).includes(user.uid))
        .slice(-1)[0];

      [personal, shared].forEach((note) => {
        if (note && (!entry.latestNote || note.addedAt > entry.latestNote.addedAt)) {
          entry.latestNote = { text: note.text, addedAt: note.addedAt };
        }
      });
    });

    setMyProjects(Object.values(byProject).sort((a, b) => b.eventCount - a.eventCount));
  }

  /**
   * Pulls the employee's assigned post-production deliverables for the
   * dashboard summary card — same collectionGroup query the
   * Post-Production page itself uses (see getDeliverablesForEmployee in
   * deliverables.js), just capped/sorted for a glanceable widget here
   * rather than the full management view.
   */
  async function loadMyDeliverables() {
    try {
      const deliverables = await getDeliverablesForEmployee(user.uid);
      setMyDeliverables(deliverables.filter((d) => d.status !== "Delivered"));
    } catch (err) {
      console.error("Failed to load your deliverables:", err);
    }
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col gap-3 sm:gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h2 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
              Good {greetingPart()}, {user.name.split(" ")[0]}.
            </h2>
          </div>
          {isFinanceView && (
            <Select value={String(fyStart)} onValueChange={(v) => setFyStart(Number(v))}>
              <SelectTrigger className="w-[130px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fyOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {fyLabel(y)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {isFinanceView && <FinanceOverview finance={finance} loading={financeLoading} fyLabelText={fyLabel(fyStart)} />}

        {(announcement || (canEditAnnouncement && editingAnnouncement)) && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-3 sm:p-4">
              {editingAnnouncement ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={announcementDraft}
                    onChange={(e) => setAnnouncementDraft(e.target.value)}
                    placeholder="Note visible to everyone on the dashboard..."
                    rows={3}
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={handleSaveAnnouncement} disabled={savingAnnouncement}>
                      {savingAnnouncement ? "Saving..." : "Save"}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingAnnouncement(false)} disabled={savingAnnouncement}>
                      Cancel
                    </Button>
                    {announcement && (
                      <Button size="sm" variant="destructive" onClick={handleClearAnnouncement} disabled={savingAnnouncement}>
                        Remove note
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <div className="min-w-0">
                      <p className="whitespace-pre-wrap text-sm font-medium text-amber-900">{announcement.text}</p>
                      <p className="mt-1 text-[11px] text-amber-700">
                        — {announcement.updatedBy}, {formatShortDateTime12(announcement.updatedAt)}
                      </p>

                      {/* "Got it" acknowledgement. Everyone can tap it; the
                          count doubles as a read-receipt for whoever posted
                          the note, with names on hover for the full list. */}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          onClick={handleToggleAck}
                          disabled={ackBusy}
                          aria-pressed={hasAcked}
                          aria-label={hasAcked ? "Remove your acknowledgement" : "Acknowledge this note"}
                          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-60 ${
                            hasAcked
                              ? "border-amber-600 bg-amber-600 text-white hover:bg-amber-700"
                              : "border-amber-300 bg-white/70 text-amber-800 hover:bg-amber-100"
                          }`}
                        >
                          <ThumbsUp className="h-3.5 w-3.5" strokeWidth={2} />
                          {hasAcked ? "Got it" : "Mark as read"}
                          {ackCount > 0 && (
                            <span className={hasAcked ? "text-white/80" : "text-amber-600"}>· {ackCount}</span>
                          )}
                        </button>
                        {ackCount > 0 && (
                          <span
                            className="truncate text-[11px] text-amber-700"
                            title={ackNames.join(", ")}
                          >
                            {ackCount === 1 ? "1 person has" : `${ackCount} people have`} seen this
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {canEditAnnouncement && (
                    <button
                      onClick={openEditAnnouncement}
                      className="shrink-0 rounded p-1 text-amber-700 hover:bg-amber-100"
                      aria-label="Edit note"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!announcement && canEditAnnouncement && !editingAnnouncement && (
          <button
            onClick={openEditAnnouncement}
            className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            <Megaphone className="h-3.5 w-3.5" /> Add an important note for everyone
          </button>
        )}

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="dailyReport">Daily Report</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="flex flex-col gap-3 sm:gap-4">
              {!isAdminView && <AttendanceCard />}

              {isAdminView && (
                <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
                  <StatCard icon={Users} label="Present Today" value={adminStats.presentToday} accent="emerald" href="/attendance" />
                  <StatCard icon={UserX} label="Absent Today" value={adminStats.absentToday} accent="rose" href="/attendance" />
                  <StatCard icon={CalendarClock} label="Pending Leaves" value={adminStats.pendingLeaves} accent="amber" href="/leave" />
                  <StatCard icon={Smartphone} label="Pending Devices" value={adminStats.pendingDevices} accent="sky" href="/devices" />
                </div>
              )}

              {!isAdminView && <MyProjectsPanel projects={myProjects} />}

              {!isAdminView && <MyPostProductionPanel deliverables={myDeliverables} />}
            </div>
          </TabsContent>

          <TabsContent value="dailyReport">
            <DailyReportPanel />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function MyProjectsPanel({ projects }) {
  const VISIBLE_CAP = 3;
  const visible = projects.slice(0, VISIBLE_CAP);
  const extra = projects.length - visible.length;

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <FolderKanban className="h-3.5 w-3.5" /> My Active Projects
      </p>
      {projects.length === 0 ? (
        <Card>
          <CardContent className="p-3 text-sm text-slate-500 sm:p-4">
            You&apos;re not currently assigned to any active project.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((p) => (
            <Link key={p.projectId} href={`/my-projects/${p.projectId}`}>
              <Card className="transition hover:border-slate-300 hover:shadow-sm">
                <CardContent className="flex items-start justify-between gap-3 p-3 sm:p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{p.projectName}</p>
                    {p.latestNote ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{p.latestNote.text}</p>
                    ) : (
                      <p className="mt-0.5 text-xs text-slate-400">No instructions yet</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">
                    {p.eventCount} event{p.eventCount !== 1 && "s"}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
          {extra > 0 && (
            <Link
              href="/my-projects"
              className="text-center text-xs font-medium text-accent hover:underline"
            >
              +{extra} more project{extra !== 1 && "s"} — view all
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

const DELIVERABLE_STATUS_DOT = {
  "Not Started": "bg-amber-500",
  "In Progress": "bg-sky-500",
  "Draft Ready": "bg-blue-500",
  "Sent to Client": "bg-violet-500",
  "Approval / Revision": "bg-orange-500",
  "Final Done": "bg-teal-500",
  Delivered: "bg-emerald-500",
};

function MyPostProductionPanel({ deliverables }) {
  const VISIBLE_CAP = 3;
  // Deadline-soonest first, undated ones last — this is a "what needs my
  // attention" widget, so the most urgent item should be on top.
  const sorted = [...deliverables].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });
  const visible = sorted.slice(0, VISIBLE_CAP);
  const extra = sorted.length - visible.length;

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <ClipboardList className="h-3.5 w-3.5" /> My Post-Production Tasks
      </p>
      {deliverables.length === 0 ? (
        <Card>
          <CardContent className="p-3 text-sm text-slate-500 sm:p-4">
            You&apos;re not assigned to any open deliverables right now.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((d) => (
            <Link key={d.id} href="/post-production">
              <Card className="transition hover:border-slate-300 hover:shadow-sm">
                <CardContent className="flex items-start justify-between gap-3 p-3 sm:p-4">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DELIVERABLE_STATUS_DOT[d.status] || "bg-slate-400"}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{d.type}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{d.projectName}{d.clientName ? ` · ${d.clientName}` : ""}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">
                    {d.deadline ? `Due ${fmtShortDate(d.deadline)}` : d.status}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
          {extra > 0 && (
            <Link
              href="/post-production"
              className="text-center text-xs font-medium text-accent hover:underline"
            >
              +{extra} more task{extra !== 1 && "s"} — view all
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function fmtShortDate(d) {
  return formatShortDateIST(d);
}

const ACCENTS = {
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
  violet: "bg-violet-50 text-violet-600",
};

function StatCard({ icon: Icon, label, value, accent = "sky", href }) {
  const content = (
    <Card className={href ? "h-full transition hover:border-slate-300 hover:shadow-sm" : "h-full"}>
      <CardContent className="flex items-center gap-3 p-3 sm:p-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 ${ACCENTS[accent]}`}>
          <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-slate-500 sm:text-xs">{label}</p>
          <p className="truncate text-base font-bold text-slate-900 sm:text-xl">{value ?? "—"}</p>
        </div>
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <DashboardContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}