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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getAttendanceForDate } from "@/lib/firebase/attendance";
import { getAllEmployees } from "@/lib/firebase/employees";
import { getPendingLeaveRequests } from "@/lib/firebase/leave";
import { getAllDevices } from "@/lib/firebase/devices";
import { getAllTasks, getTasksForEmployee, isOverdue } from "@/lib/firebase/postProduction";
import { getAnnouncement, setAnnouncement, clearAnnouncement } from "@/lib/firebase/announcements";
import { getEventsForEmployee } from "@/lib/firebase/events";
import { isEventPast } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Users,
  UserX,
  CalendarClock,
  Smartphone,
  Clapperboard,
  Eye,
  AlertTriangle,
  ListChecks,
  FolderKanban,
  Megaphone,
  Pencil,
} from "lucide-react";

const ADMIN_ROLES = ["super_admin", "admin"];
// Who can post/edit the dashboard-wide announcement — same boundary as
// project ops elsewhere (super_admin/admin/project_manager).
const ANNOUNCEMENT_ADMIN_ROLES = ["super_admin", "admin", "project_manager"];
// Post-production visibility is broader than the attendance/HR admin view above —
// project managers manage post-prod work too, so they get the team-wide widget.
const POST_PROD_ADMIN_ROLES = ["super_admin", "admin", "project_manager"];

function DashboardContent() {
  const { user } = useAuth();
  const isAdminView = ADMIN_ROLES.includes(user.role);
  const canEditAnnouncement = ANNOUNCEMENT_ADMIN_ROLES.includes(user.role);

  const [adminStats, setAdminStats] = useState({
    presentToday: null,
    absentToday: null,
    pendingLeaves: null,
    pendingDevices: null,
  });

  const [myProjects, setMyProjects] = useState([]); // [{ projectId, projectName, eventCount, latestNote: { text, addedAt } | null }]

  const isPostProdAdminView = POST_PROD_ADMIN_ROLES.includes(user.role);
  const [postProdStats, setPostProdStats] = useState({
    inProgress: null,
    inReview: null,
    overdue: null,
    myOpen: null,
  });

  const [announcement, setAnnouncementState] = useState(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);

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
      setAnnouncementState({ text, updatedBy: user.name, updatedByUid: user.uid, updatedAt: new Date().toISOString() });
      setEditingAnnouncement(false);
      toast.success("Note updated for everyone");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingAnnouncement(false);
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
    }
  }, [isAdminView]);

  useEffect(() => {
    loadPostProdStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPostProdAdminView, user.uid]);

  async function loadPostProdStats() {
    try {
      if (isPostProdAdminView) {
        const all = await getAllTasks();
        setPostProdStats({
          inProgress: all.filter((t) => t.status === "In Progress").length,
          inReview: all.filter((t) => t.status === "In Review").length,
          overdue: all.filter((t) => isOverdue(t)).length,
          myOpen: null,
        });
      } else {
        const mine = await getTasksForEmployee(user.uid);
        const open = mine.filter((t) => t.status !== "Completed");
        setPostProdStats({
          inProgress: null,
          inReview: mine.filter((t) => t.status === "In Review").length,
          overdue: open.filter((t) => isOverdue(t)).length,
          myOpen: open.length,
        });
      }
    } catch (err) {
      console.error("Failed to load post-production stats:", err);
    }
  }

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

  return (
    <AppShell>
      <div className="flex h-full flex-col gap-3 sm:gap-4">
        <h2 className="text-lg font-semibold text-slate-900 sm:text-2xl">
          Welcome back, {user.name.split(" ")[0]}
        </h2>

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
                  <div className="flex items-start gap-2">
                    <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <div>
                      <p className="whitespace-pre-wrap text-sm font-medium text-amber-900">{announcement.text}</p>
                      <p className="mt-1 text-[11px] text-amber-700">
                        — {announcement.updatedBy}, {new Date(announcement.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </p>
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
                  <StatCard icon={Users} label="Present Today" value={adminStats.presentToday} accent="emerald" />
                  <StatCard icon={UserX} label="Absent Today" value={adminStats.absentToday} accent="rose" />
                  <StatCard icon={CalendarClock} label="Pending Leaves" value={adminStats.pendingLeaves} accent="amber" href="/leave" />
                  <StatCard icon={Smartphone} label="Pending Devices" value={adminStats.pendingDevices} accent="sky" href="/devices" />
                </div>
              )}

              {!isAdminView && <MyProjectsPanel projects={myProjects} />}

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Clapperboard className="h-3.5 w-3.5" /> Post-Production
                </p>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
                  {isPostProdAdminView ? (
                    <>
                      <StatCard icon={ListChecks} label="In Progress" value={postProdStats.inProgress} accent="sky" href="/post-production" />
                      <StatCard icon={Eye} label="In Review" value={postProdStats.inReview} accent="violet" href="/post-production" />
                      <StatCard icon={AlertTriangle} label="Overdue" value={postProdStats.overdue} accent="rose" href="/post-production" />
                    </>
                  ) : (
                    <>
                      <StatCard icon={ListChecks} label="My Open Tasks" value={postProdStats.myOpen} accent="sky" href="/post-production" />
                      <StatCard icon={Eye} label="Awaiting Review" value={postProdStats.inReview} accent="violet" href="/post-production" />
                      <StatCard icon={AlertTriangle} label="Overdue" value={postProdStats.overdue} accent="rose" href="/post-production" />
                    </>
                  )}
                </div>
              </div>
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