"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { getEventsForEmployee } from "@/lib/firebase/events";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/ui/status-badge";
import { ArrowLeft } from "lucide-react";

function formatEventDate(ev) {
  if (!ev.eventStartDate) return "No date set";
  if (!ev.eventEndDate || ev.eventEndDate === ev.eventStartDate) return ev.eventStartDate;
  return `${ev.eventStartDate} – ${ev.eventEndDate}`;
}

function MyProjectDetailContent() {
  const { id: projectId } = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEventsForEmployee(user.uid)
      .then((all) => {
        setEvents(all.filter((ev) => ev.projectId === projectId));
      })
      .finally(() => setLoading(false));
  }, [user.uid, projectId]);

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

      <div className="mb-6">
        <h2 className="truncate text-xl font-semibold text-slate-900 sm:text-2xl">
          {projectName}
        </h2>
        <p className="text-sm text-slate-500">{clientName}</p>
      </div>

      <h3 className="mb-3 text-base font-medium text-slate-900 sm:text-lg">
        Your Events in this Project
      </h3>

      <div className="grid max-w-2xl gap-3">
        {events.map((ev) => {
          const myEntry = (ev.team || []).find((m) => m.uid === user.uid);
          const latestInstruction = (myEntry?.assignments || []).slice(-1)[0]?.text;
          const myTeamNotes = (ev.teamNotes || []).filter((n) =>
            (n.targetUids || []).includes(user.uid)
          );
          const latestTeamNote = myTeamNotes.slice(-1)[0]?.text;
          return (
            <Link key={ev.id} href={`/my-projects/${projectId}/${ev.id}`}>
              <Card className="transition hover:border-slate-300">
                <CardContent className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{ev.eventName}</p>
                      <p className="truncate text-xs text-slate-500">
                        {formatEventDate(ev)} · {myEntry?.role}
                      </p>
                    </div>
                    <StatusBadge status={ev.status} />
                  </div>
                  {latestInstruction && (
                    <p className="rounded-md bg-slate-50 p-2 text-sm text-slate-600">
                      <span className="font-medium text-slate-700">Instructions for you: </span>
                      {latestInstruction}
                    </p>
                  )}
                  {latestTeamNote && (
                    <p className="mt-2 rounded-md bg-slate-50 p-2 text-sm text-slate-600">
                      <span className="font-medium text-slate-700">Instructions for team: </span>
                      {latestTeamNote}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
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