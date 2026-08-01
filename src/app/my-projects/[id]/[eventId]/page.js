"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  getEventById,
  getEventStatusUpdate,
  addEventStatusUpdate,
} from "@/lib/firebase/events";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import StatusBadge from "@/components/ui/status-badge";
import { toast } from "sonner";
import { ArrowLeft, ClipboardList, History, Users2 } from "lucide-react";

function MyEventDetailContent() {
  const { id: projectId, eventId } = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notAssigned, setNotAssigned] = useState(false);

  const [updateHistory, setUpdateHistory] = useState([]);
  const [newUpdate, setNewUpdate] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const ev = await getEventById(projectId, eventId);

    if (!ev || !(ev.team || []).some((m) => m.uid === user.uid)) {
      setNotAssigned(true);
      setLoading(false);
      return;
    }

    setEvent(ev);

    const existing = await getEventStatusUpdate(projectId, eventId, user.uid);
    setUpdateHistory(existing?.updates || []);

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId, eventId]);

  async function handleSaveUpdate() {
    if (!newUpdate.trim()) return;
    setSaving(true);
    try {
      await addEventStatusUpdate(projectId, eventId, user.uid, {
        name: user.name,
        text: newUpdate,
      });
      toast.success("Update added");
      setNewUpdate("");
      const existing = await getEventStatusUpdate(projectId, eventId, user.uid);
      setUpdateHistory(existing?.updates || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Loading...</p>
      </AppShell>
    );
  }

  if (notAssigned) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">
          You're not assigned to this event, or it doesn't exist.
        </p>
      </AppShell>
    );
  }

  const myEntry = (event.team || []).find((m) => m.uid === user.uid);
  const assignments = [...(myEntry?.assignments || [])].reverse(); // newest first
  const historyNewestFirst = [...updateHistory].reverse();
  const myTeamNotes = (event.teamNotes || [])
    .filter((n) => (n.targetUids || []).includes(user.uid))
    .reverse(); // newest first

  return (
    <AppShell>
      <button
        onClick={() => router.push("/my-projects")}
        className="mb-3 flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to My Projects
      </button>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-slate-900 sm:text-2xl">
            {event.eventName}
          </h2>
          <p className="text-sm text-slate-500">
            {event.projectName} · {event.clientName}
          </p>
        </div>
        <StatusBadge status={event.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h3 className="mb-3 font-medium text-slate-900">Event Info</h3>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Start Date</span>
                  <span className="text-slate-900">{event.eventStartDate || "Not set"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">End Date</span>
                  <span className="text-slate-900">{event.eventEndDate || "Not set"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Shoot Days</span>
                  <span className="text-slate-900">{event.shootDays || 1}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Your Role</span>
                  <span className="text-slate-900">{myEntry?.role}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {myTeamNotes.length > 0 && (
            <Card>
              <CardContent className="p-4 sm:p-5">
                <h3 className="mb-3 flex items-center gap-1.5 font-medium text-slate-900">
                  <Users2 className="h-4 w-4 text-slate-400" />
                  Team Notes
                  <span className="ml-auto text-xs font-normal text-slate-400">Visible to your team</span>
                </h3>
                <div className="grid gap-2">
                  {myTeamNotes.map((n, idx) => (
                    <div key={idx} className="rounded-md bg-slate-50 p-2.5">
                      <p className="text-sm text-slate-700">{n.text}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {n.addedBy ? `${n.addedBy} · ` : ""}
                        {new Date(n.addedAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4 sm:p-5">
              <h3 className="mb-3 flex items-center gap-1.5 font-medium text-slate-900">
                <ClipboardList className="h-4 w-4 text-slate-400" />
                Instructions for You
              </h3>
              {assignments.length === 0 ? (
                <p className="text-sm text-slate-500">No instructions yet.</p>
              ) : (
                <div className="grid gap-2">
                  {assignments.map((a, idx) => (
                    <div key={idx} className="rounded-md bg-slate-50 p-2.5">
                      <p className="text-sm text-slate-700">{a.text}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {a.addedBy ? `${a.addedBy} · ` : ""}
                        {new Date(a.addedAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <h3 className="mb-1 font-medium text-slate-900">Your Updates</h3>
            <p className="mb-3 text-xs text-slate-500">
              Let the team know how things are going on your end — progress, blockers, or anything
              they should know. Each update is added to the log below.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="myUpdate">New update</Label>
              <Textarea
                id="myUpdate"
                rows={4}
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

            {historyNewestFirst.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <History className="h-3.5 w-3.5" />
                  History
                </h4>
                <div className="grid gap-2">
                  {historyNewestFirst.map((u, idx) => (
                    <div key={idx} className="border-l-2 border-slate-200 pl-3">
                      <p className="text-sm text-slate-700">{u.text}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {new Date(u.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

export default function MyEventDetailPage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <MyEventDetailContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}