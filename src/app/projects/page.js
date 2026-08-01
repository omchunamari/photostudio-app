"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { getAllProjects } from "@/lib/firebase/projects";
import { getEventsForProject } from "@/lib/firebase/events";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/ui/status-badge";
import { toast } from "sonner";

function ProjectsContent() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const list = await getAllProjects();

        const withEvents = await Promise.all(
          list.map(async (p) => {
            const events = await getEventsForProject(p.id);
            const upcoming = events
              .filter((e) => e.eventStartDate)
              .sort((a, b) => a.eventStartDate.localeCompare(b.eventStartDate))[0];
            return { ...p, eventCount: events.length, nextEventDate: upcoming?.eventStartDate || null };
          })
        );

        setProjects(withEvents);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <AppShell>
      <h2 className="mb-4 text-xl font-semibold text-slate-900 sm:text-2xl">Projects</h2>

      {loading ? (
        <p className="text-sm text-slate-500">Loading projects...</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-slate-500">No projects yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="h-full transition hover:border-slate-300 hover:shadow-sm">
                <CardContent className="flex h-full flex-col justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{p.projectName}</p>
                    <p className="truncate text-xs text-slate-500">{p.clientName}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={p.status} />
                    <span className="text-xs text-slate-500">
                      {p.eventCount} event{p.eventCount !== 1 && "s"}
                      {p.nextEventDate ? ` · ${p.nextEventDate}` : ""}
                    </span>
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

export default function ProjectsPage() {
  return (
    <ProtectedRoute allowedRoles={["super_admin", "admin", "project_manager"]}>
      <DeviceGate>
        <ProjectsContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}