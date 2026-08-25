"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  getProjectById,
  updateProjectDetails,
  updateProjectStatus,
  deleteProject,
  setProjectLeader,
} from "@/lib/firebase/projects";
import { createEvent, getEventsForProject } from "@/lib/firebase/events";
import { getAllEmployees } from "@/lib/firebase/employees";
import { PROJECT_STATUSES } from "@/lib/constants/projects";
import { isEventPast } from "@/lib/status";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle as AlertDialogTitleEl,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import StatusBadge from "@/components/ui/status-badge";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Crown } from "lucide-react";

const ADMIN_ROLES = ["super_admin", "admin", "project_manager"];

function ProjectDetailContent() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const isAdminOrPM = ADMIN_ROLES.includes(user.role);
  const canDelete = ["super_admin", "admin"].includes(user.role);

  const [project, setProject] = useState(null);
  const [events, setEvents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingLeader, setSavingLeader] = useState(false);

  const [detailsForm, setDetailsForm] = useState({
    projectName: "",
  });
  const [savingDetails, setSavingDetails] = useState(false);

  const [eventForm, setEventForm] = useState({
    eventName: "",
    eventStartDate: "",
    eventEndDate: "",
  });

  async function loadData() {
    setLoading(true);
    const p = await getProjectById(id);
    setProject(p);
    if (p) {
      // A Project Leader only has access to the project they lead — anyone
      // else who isn't admin/PM and isn't the leader gets bounced out.
      const isLeader = p.leaderUid === user.uid;
      if (!isAdminOrPM && !isLeader) {
        toast.error("You don't have access to this project");
        router.replace("/projects");
        return;
      }

      setDetailsForm({ projectName: p.projectName || "" });
      const evts = await getEventsForProject(id);
      setEvents(evts);

      if (isAdminOrPM) {
        try {
          const emps = await getAllEmployees();
          setEmployees(emps.filter((e) => e.status === "active"));
        } catch (err) {
          toast.error(`Failed loading employees: ${err.message}`);
        }
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSetLeader(uid) {
    setSavingLeader(true);
    try {
      const emp = uid === "none" ? null : employees.find((e) => e.uid === uid);
      await setProjectLeader(id, emp?.uid || null, emp?.name || null);
      setProject((prev) => ({ ...prev, leaderUid: emp?.uid || null, leaderName: emp?.name || null }));
      toast.success(emp ? `${emp.name} set as Project Leader` : "Project Leader cleared");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingLeader(false);
    }
  }

  async function handleSaveDetails(e) {
    e.preventDefault();
    setSavingDetails(true);
    try {
      await updateProjectDetails(id, { projectName: detailsForm.projectName });
      toast.success("Project details updated");
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleStatusChange(status) {
    try {
      await updateProjectStatus(id, status);
      setProject((prev) => ({ ...prev, status }));
      toast.success("Status updated");
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleCreateEvent(e) {
    e.preventDefault();
    if (!eventForm.eventName.trim()) {
      toast.error("Event name is required");
      return;
    }
    if (!eventForm.eventStartDate) {
      toast.error("Start date is required");
      return;
    }
    if (eventForm.eventEndDate && eventForm.eventEndDate < eventForm.eventStartDate) {
      toast.error("End date can't be before start date");
      return;
    }
    setCreating(true);
    try {
      const eventId = await createEvent(id, {
        eventName: eventForm.eventName.trim(),
        eventStartDate: eventForm.eventStartDate,
        eventEndDate: eventForm.eventEndDate || eventForm.eventStartDate,
        projectName: project.projectName,
        clientName: project.clientName,
      });
      toast.success("Event created");
      setDialogOpen(false);
      setEventForm({ eventName: "", eventStartDate: "", eventEndDate: "" });
      router.push(`/projects/${id}/events/${eventId}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteProject() {
    setDeleting(true);
    try {
      await deleteProject(id);
      toast.success("Project deleted");
      router.push("/projects");
    } catch (err) {
      toast.error(err.message);
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Loading...</p>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Project not found.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <button
        onClick={() => router.push("/projects")}
        className="mb-3 flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Projects
      </button>

      <div className="sticky top-0 z-10 mb-6 flex flex-col gap-3 border-b border-slate-200 bg-white py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-slate-900 sm:text-2xl">
            {project.projectName}
          </h2>
          <p className="text-sm text-slate-500">{project.clientName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={project.status} />
          <Link href={`/post-production?projectId=${project.id}`}>
            <Button size="sm" variant="secondary">Post-Production</Button>
          </Link>
          <Select value={project.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-8 w-36 text-xs sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROJECT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger className="inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              <Plus className="h-4 w-4" /> Add Event
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-md">
              <DialogHeader>
                <DialogTitle>New Event</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateEvent} className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="eventName">Event Name</Label>
                  <Input
                    id="eventName"
                    placeholder="e.g. Mehendi, Wedding Day, Reception"
                    value={eventForm.eventName}
                    onChange={(e) => setEventForm((p) => ({ ...p, eventName: e.target.value }))}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="eventStartDate">Start Date</Label>
                    <Input
                      id="eventStartDate"
                      type="date"
                      value={eventForm.eventStartDate}
                      onChange={(e) =>
                        setEventForm((p) => ({
                          ...p,
                          eventStartDate: e.target.value,
                          eventEndDate:
                            p.eventEndDate && p.eventEndDate < e.target.value ? e.target.value : p.eventEndDate,
                        }))
                      }
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="eventEndDate">End Date</Label>
                    <Input
                      id="eventEndDate"
                      type="date"
                      min={eventForm.eventStartDate || undefined}
                      value={eventForm.eventEndDate}
                      onChange={(e) => setEventForm((p) => ({ ...p, eventEndDate: e.target.value }))}
                    />
                  </div>
                </div>
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create Event"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon" className="h-8 w-8">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitleEl>Delete "{project.projectName}"?</AlertDialogTitleEl>
                  <AlertDialogDescription>
                    This permanently deletes the project and all {events.length} event
                    {events.length !== 1 && "s"} under it, including team assignments and status
                    updates. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteProject}
                    disabled={deleting}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {deleting ? "Deleting..." : "Delete Project"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <h3 className="mb-3 font-medium text-slate-900">Project Details</h3>
            <form onSubmit={handleSaveDetails} className="flex flex-col gap-3">
              <div>
                <Label htmlFor="projectName">Project Name</Label>
                <Input
                  id="projectName"
                  value={detailsForm.projectName}
                  onChange={(e) => setDetailsForm({ projectName: e.target.value })}
                  required
                />
              </div>
              {project.deliverables && (
                <div>
                  <p className="text-xs text-slate-500">Deliverables</p>
                  <p className="text-sm text-slate-900">{project.deliverables}</p>
                </div>
              )}
              <Button type="submit" disabled={savingDetails} className="w-full">
                {savingDetails ? "Saving..." : "Save Details"}
              </Button>
            </form>

            <div className="mt-4 border-t border-slate-200 pt-4">
              <Label className="mb-1.5 flex items-center gap-1.5">
                <Crown className="h-3.5 w-3.5 text-amber-500" /> Project Leader
              </Label>
              {isAdminOrPM ? (
                <>
                  <Select
                    value={project.leaderUid || "none"}
                    onValueChange={handleSetLeader}
                    disabled={savingLeader}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="No leader assigned">
                        {(v) =>
                          v === "none" || !v
                            ? "No leader"
                            : (() => {
                                const emp = employees.find((e) => e.uid === v);
                                return emp ? `${emp.name} (${emp.role})` : project.leaderName || v;
                              })()
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No leader</SelectItem>
                      {employees.map((e) => (
                        <SelectItem key={e.uid} value={e.uid}>
                          {e.name} ({e.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1.5 text-xs text-slate-500">
                    The leader can manage only this project — assign its team (employees +
                    freelancers) and update event status — but can't see other projects.
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-900">{project.leaderName || "Unassigned"}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div>
          <h3 className="mb-2 text-base font-medium text-slate-900 sm:text-lg">Events</h3>
          {events.length === 0 ? (
            <p className="text-sm text-slate-500">No events yet. Add one to start assigning a team.</p>
          ) : (
            <ol className="relative ml-3 flex flex-col gap-5 border-l-2 border-slate-200 pl-6">
              {[...events]
                .sort((a, b) =>
                  (a.eventStartDate || "").localeCompare(b.eventStartDate || "") ||
                  (a.createdAt || "").localeCompare(b.createdAt || "")
                )
                .map((ev) => {
                  const done = isEventPast(ev);
                  return (
                    <li key={ev.id} className="relative">
                      <span
                        className={`absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 ${
                          done
                            ? "border-emerald-600 bg-emerald-600"
                            : "border-slate-400 bg-white"
                        }`}
                      />
                      <Link href={`/projects/${id}/events/${ev.id}`}>
                        <Card className="transition hover:border-slate-300">
                          <CardContent className="flex items-center justify-between gap-3 p-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">{ev.eventName}</p>
                              <p className="truncate text-xs text-slate-500">
                                {ev.eventStartDate
                                  ? ev.eventStartDate === ev.eventEndDate
                                    ? ev.eventStartDate
                                    : `${ev.eventStartDate} – ${ev.eventEndDate}`
                                  : "No date set"}{" "}
                                · {ev.shootDays || 1} day{ev.shootDays !== 1 && "s"} · {ev.team?.length || 0} assigned
                              </p>
                            </div>
                            <StatusBadge status={ev.status} />
                          </CardContent>
                        </Card>
                      </Link>
                    </li>
                  );
                })}
            </ol>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function ProjectDetailPage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <ProjectDetailContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}