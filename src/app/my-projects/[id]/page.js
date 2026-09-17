"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  getEventsForEmployee,
  getEventStatusUpdate,
  addEventStatusUpdate,
} from "@/lib/firebase/events";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/ui/status-badge";
import AvatarInitials from "@/components/ui/avatar-initials";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  History,
  MessageSquareText,
  Search,
  Sparkles,
  Users2,
} from "lucide-react";
import { formatDateTime12, formatDateIST } from "@/lib/dateIST";

const HIDDEN_ROLES = ["super_admin", "admin"];

// One small colored icon-badge + label, reused across every section box
// below so each area of the panel reads as its own topic at a glance
// (brass = your info/action items, blue = the team, amber = team-wide
// notes) instead of every section looking like the same grey card.
function SectionHeader({ icon: Icon, tone, children, trailing }) {
  const TONES = {
    accent: "bg-accent/10 text-accent",
    blue: "bg-sky-100 text-sky-700",
    amber: "bg-warning/15 text-warning",
  };
  return (
    <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      {children}
      {trailing && <span className="ml-auto text-xs font-normal text-slate-400">{trailing}</span>}
    </h4>
  );
}

function formatEventDate(ev) {
  if (!ev.eventStartDate) return "No date set";
  if (!ev.eventEndDate || ev.eventEndDate === ev.eventStartDate) {
    return formatDateIST(ev.eventStartDate);
  }
  return `${formatDateIST(ev.eventStartDate)} – ${formatDateIST(ev.eventEndDate)}`;
}

// Everything the employee could previously only see/do after a second click
// into /my-projects/[id]/[eventId] now lives here, expanded inline — so the
// project page itself is the one stop for viewing and updating an event.
function EventPanel({ projectId, ev, user }) {
  const [statusDoc, setStatusDoc] = useState(null);
  const [loadingUpdates, setLoadingUpdates] = useState(true);
  const [newUpdate, setNewUpdate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingUpdates(true);
    getEventStatusUpdate(projectId, ev.id, user.uid).then((res) => {
      if (!cancelled) {
        setStatusDoc(res);
        setLoadingUpdates(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, ev.id, user.uid]);

  async function handleSaveUpdate() {
    if (!newUpdate.trim()) return;
    setSaving(true);
    try {
      await addEventStatusUpdate(projectId, ev.id, user.uid, {
        name: user.name,
        text: newUpdate,
      });
      toast.success("Update added");
      setNewUpdate("");
      const existing = await getEventStatusUpdate(projectId, ev.id, user.uid);
      setStatusDoc(existing);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const myEntry = (ev.team || []).find((m) => m.uid === user.uid);
  const teammates = (ev.team || []).filter((m) => m.uid !== user.uid);
  const assignments = [...(myEntry?.assignments || [])].reverse(); // newest first
  const myTeamNotes = (ev.teamNotes || [])
    .filter((n) => (n.targetUids || []).includes(user.uid))
    .reverse(); // newest first
  const historyNewestFirst = [...(statusDoc?.updates || [])].reverse();

  return (
    <div className="grid gap-4 border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
          <SectionHeader icon={CalendarDays} tone="accent">Event Info</SectionHeader>
          <div className="grid gap-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Start Date</span>
              <span className="text-slate-900">{formatDateIST(ev.eventStartDate, "Not set")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">End Date</span>
              <span className="text-slate-900">{formatDateIST(ev.eventEndDate, "Not set")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Shoot Days</span>
              <span className="text-slate-900">{ev.shootDays || 1}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Your Role</span>
              <span className="text-slate-900">{myEntry?.role}</span>
            </div>
          </div>
        </div>

        {/* Who else is on this shoot. Crew regularly need to know who the
            other shooter is or who's handling video — this page previously
            only ever showed the viewer's own row, so they had to ask.
            Names and roles only: day rates and cost stay admin/PM-only. */}
        {teammates.length > 0 && (
          <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
            <SectionHeader icon={Users2} tone="blue" trailing={`${(ev.team || []).length} assigned`}>
              Team on this event
            </SectionHeader>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {(ev.team || []).map((m) => (
                <div
                  key={m.uid}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                    m.uid === user.uid ? "bg-accent/5 ring-1 ring-accent/20" : "bg-slate-50"
                  }`}
                >
                  <AvatarInitials name={m.name} size="sm" className="h-6 w-6 shrink-0 text-[10px]" />
                  <span className="min-w-0 flex-1 truncate text-slate-800">
                    {m.name}
                    {m.uid === user.uid && (
                      <span className="ml-1 text-xs text-accent">(you)</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{m.role}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {myTeamNotes.length > 0 && (
          <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
            <SectionHeader icon={MessageSquareText} tone="amber" trailing="Visible to your team">
              Team Notes
            </SectionHeader>
            <div className="grid gap-2">
              {myTeamNotes.map((n, idx) => (
                <div key={idx} className="rounded-md border-l-2 border-warning bg-warning/5 p-2.5">
                  <p className="text-sm text-slate-700">{n.text}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {n.addedBy ? `${n.addedBy} · ` : ""}
                    {formatDateTime12(n.addedAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
          <SectionHeader icon={ClipboardList} tone="accent">Instructions for You</SectionHeader>
          {assignments.length === 0 ? (
            <p className="text-sm text-slate-500">No instructions yet.</p>
          ) : (
            <div className="grid gap-2">
              {assignments.map((a, idx) => (
                <div key={idx} className="rounded-md border-l-2 border-accent bg-accent/5 p-2.5">
                  <p className="text-sm text-slate-700">{a.text}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {a.addedBy ? `${a.addedBy} · ` : ""}
                    {formatDateTime12(a.addedAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 shadow-sm">
        <SectionHeader icon={Sparkles} tone="accent">Your Updates</SectionHeader>
        <p className="mb-3 text-xs text-slate-500">
          Let the team know how things are going on your end — progress, blockers, or anything
          they should know. Each update is added to the log below.
        </p>
        <div className="grid gap-2">
          <Label htmlFor={`update-${ev.id}`}>New update</Label>
          <Textarea
            id={`update-${ev.id}`}
            rows={3}
            value={newUpdate}
            onChange={(e) => setNewUpdate(e.target.value)}
            placeholder="e.g. Ceremony shots done, working on reception edits now, on track for Friday deadline"
          />
        </div>
        <Button
          className="mt-3 w-full"
          onClick={handleSaveUpdate}
          disabled={saving || !newUpdate.trim()}
        >
          {saving ? "Saving..." : "Add Update"}
        </Button>

        {!loadingUpdates && historyNewestFirst.length > 0 && (
          <div className="mt-4">
            <h5 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <History className="h-3.5 w-3.5" />
              History
            </h5>
            <div className="grid gap-2">
              {historyNewestFirst.map((u, idx) => (
                <div key={idx} className="border-l-2 border-accent/30 pl-3">
                  <p className="text-sm text-slate-700">{u.text}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {formatDateTime12(u.updatedAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MyProjectDetailContent() {
  const { id: projectId } = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (HIDDEN_ROLES.includes(user.role)) {
      router.replace("/dashboard");
      return;
    }
    getEventsForEmployee(user.uid)
      .then((all) => {
        setEvents(all.filter((ev) => ev.projectId === projectId));
      })
      .finally(() => setLoading(false));
  }, [user.uid, user.role, projectId, router]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((ev) => {
      const myEntry = (ev.team || []).find((m) => m.uid === user.uid);
      return (
        ev.eventName?.toLowerCase().includes(q) ||
        ev.status?.toLowerCase().includes(q) ||
        myEntry?.role?.toLowerCase().includes(q)
      );
    });
  }, [events, search, user.uid]);

  if (HIDDEN_ROLES.includes(user.role)) {
    return null;
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Loading...</p>
      </AppShell>
    );
  }

  if (events.length === 0) {
    return (
      <AppShell>
        <button
          onClick={() => router.push("/my-projects")}
          className="mb-4 flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to My Projects
        </button>
        <p className="text-sm text-slate-500">
          You're not assigned to any events in this project, or it doesn't exist.
        </p>
      </AppShell>
    );
  }

  const { projectName, clientName } = events[0];

  return (
    <AppShell>
      <button
        onClick={() => router.push("/my-projects")}
        className="mb-4 flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to My Projects
      </button>

      <div className="mb-4">
        <h2 className="truncate text-xl font-semibold text-slate-900 sm:text-2xl">
          {projectName}
        </h2>
        <p className="text-sm text-slate-500">{clientName}</p>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-base font-medium text-slate-900 sm:text-lg">
          Your Events in this Project
        </h3>
        <span className="text-xs text-slate-400">
          {expandedId ? "· click an event to collapse it" : "· click an event to view and update it"}
        </span>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your events by name, status, or role..."
          className="pl-8"
        />
      </div>

      {filteredEvents.length === 0 ? (
        <p className="text-sm text-slate-500">No events match your search.</p>
      ) : (
        <div className="grid gap-3">
          {filteredEvents.map((ev) => {
            const myEntry = (ev.team || []).find((m) => m.uid === user.uid);
            const latestInstruction = (myEntry?.assignments || []).slice(-1)[0]?.text;
            const myTeamNotes = (ev.teamNotes || []).filter((n) =>
              (n.targetUids || []).includes(user.uid)
            );
            const latestTeamNote = myTeamNotes.slice(-1)[0]?.text;
            const isOpen = expandedId === ev.id;
            return (
              <Card key={ev.id} className="transition hover:border-slate-300">
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : ev.id)}
                  className="block w-full text-left"
                >
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{ev.eventName}</p>
                        <p className="truncate text-xs text-slate-500">
                          {formatEventDate(ev)} · {myEntry?.role}
                          {(ev.team || []).length > 1 &&
                            ` · +${(ev.team || []).length - 1} on team`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge status={ev.status} />
                        <ChevronDown
                          className={`h-4 w-4 text-slate-400 transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                    </div>
                    {!isOpen && latestInstruction && (
                      <p className="rounded-md border-l-2 border-accent bg-accent/5 p-2 text-sm text-slate-600">
                        <span className="font-medium text-accent">Instructions for you: </span>
                        {latestInstruction}
                      </p>
                    )}
                    {!isOpen && latestTeamNote && (
                      <p className="mt-2 rounded-md border-l-2 border-warning bg-warning/5 p-2 text-sm text-slate-600">
                        <span className="font-medium text-warning">Instructions for team: </span>
                        {latestTeamNote}
                      </p>
                    )}
                  </CardContent>
                </button>
                {isOpen && <EventPanel projectId={projectId} ev={ev} user={user} />}
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

export default function MyProjectDetailPage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <MyProjectDetailContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}