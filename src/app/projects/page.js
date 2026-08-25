"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { getAllProjects, getProjectsForLeader } from "@/lib/firebase/projects";
import { getEventsForProject } from "@/lib/firebase/events";
import { isProjectPast } from "@/lib/status";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/ui/status-badge";
import { toast } from "sonner";

const ADMIN_ROLES = ["super_admin", "admin", "project_manager"];

function ProjectsContent() {
  const { user } = useAuth();
  const isAdminOrPM = ADMIN_ROLES.includes(user.role);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active"); // "active" | "past"

  useEffect(() => {
    async function load() {
      try {
        // Admins/PMs see every project. Everyone else only sees projects
        // they've been assigned as Project Leader on — they can't browse
        // or discover projects they don't lead.
        const list = isAdminOrPM ? await getAllProjects() : await getProjectsForLeader(user.uid);

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
  }, [isAdminOrPM, user.uid]);

  const visibleProjects = projects.filter((p) =>
    tab === "past" ? isProjectPast(p) : !isProjectPast(p)
  );

  return (
    <AppShell>
      <h2 className="mb-4 text-xl font-semibold text-slate-900 sm:text-2xl">
        {isAdminOrPM ? "Projects" : "My Led Projects"}
      </h2>

      <div className="mb-4 flex gap-1 rounded-md bg-slate-100 p-1 w-fit">
        {[
          { id: "active", label: "Active" },
          { id: "past", label: "Past" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${
              tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading projects...</p>
      ) : visibleProjects.length === 0 ? (
        <p className="text-sm text-slate-500">
          {tab === "past"
            ? "No past projects yet."
            : isAdminOrPM
            ? "No active projects."
            : "You haven't been assigned as Project Leader on any active project."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleProjects.map((p) => (
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
    <ProtectedRoute>
      <DeviceGate>
        <ProjectsContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}