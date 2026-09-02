"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { getEventsForEmployee } from "@/lib/firebase/events";
import { isEventPast } from "@/lib/status";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/ui/status-badge";

// Super admin/admin manage every project via Team Assignment already — "My
// Projects" (events assigned to *you personally*) isn't meaningful for
// them, so they're redirected out even if they land here directly by URL.
const HIDDEN_ROLES = ["super_admin", "admin"];

function MyProjectsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active"); // "active" | "past"

  useEffect(() => {
    if (HIDDEN_ROLES.includes(user.role)) {
      router.replace("/dashboard");
      return;
    }
    getEventsForEmployee(user.uid)
      .then(setAllEvents)
      .finally(() => setLoading(false));
  }, [user.uid, user.role, router]);

  // Group by project, but only using events that match the active tab —
  // a project you're on drops out of "Active" once every event of yours
  // on it is past, and appears in "Past" once at least one of yours is.
  const projects = useMemo(() => {
    const events = allEvents.filter((ev) => (tab === "past" ? isEventPast(ev) : !isEventPast(ev)));
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
    return Object.values(byProject);
  }, [allEvents, tab]);

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

  return (
    <AppShell>
      <h2 className="mb-4 text-xl font-semibold text-slate-900 sm:text-2xl">My Projects</h2>

      <div className="mb-6 flex gap-1 rounded-md bg-slate-100 p-1 w-fit">
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

      {projects.length === 0 ? (
        <p className="text-sm text-slate-500">
          {tab === "past"
            ? "No past projects yet."
            : "You're not currently assigned to any active project."}
        </p>
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