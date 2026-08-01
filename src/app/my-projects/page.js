"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { getEventsForEmployee } from "@/lib/firebase/events";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/ui/status-badge";

function MyProjectsContent() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]); // [{ projectId, projectName, clientName, events: [...] }]
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEventsForEmployee(user.uid)
      .then((events) => {
        const byProject = {};
        events.forEach((ev) => {
          if (!byProject[ev.projectId]) {
            byProject[ev.projectId] = {
              projectId: ev.projectId,
              projectName: ev.projectName,
              clientName: ev.clientName,
              events: [],
            };
          }
          byProject[ev.projectId].events.push(ev);
        });
        setProjects(Object.values(byProject));
      })
      .finally(() => setLoading(false));
  }, [user.uid]);

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Loading...</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h2 className="mb-6 text-xl font-semibold text-slate-900 sm:text-2xl">My Projects</h2>

      {projects.length === 0 ? (
        <p className="text-sm text-slate-500">You're not currently assigned to any project.</p>
      ) : (
        <div className="grid max-w-2xl gap-3">
          {projects.map((p) => (
            <Link key={p.projectId} href={`/my-projects/${p.projectId}`}>
              <Card className="transition hover:border-slate-300">
                <CardContent className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{p.projectName}</p>
                      <p className="truncate text-xs text-slate-500">{p.clientName}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">
                      {p.events.length} event{p.events.length !== 1 && "s"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.events.map((ev) => (
                      <span
                        key={ev.id}
                        className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700"
                      >
                        {ev.eventName}
                        <StatusBadge status={ev.status} />
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export default function MyProjectsPage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <MyProjectsContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}