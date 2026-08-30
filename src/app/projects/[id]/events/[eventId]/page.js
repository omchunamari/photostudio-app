"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  getEventById,
  updateEventDetails,
  updateEventTeam,
  updateEventStatus,
  deleteEvent,
  getConflictingEvents,
  getAllStatusUpdatesForEvent,
} from "@/lib/firebase/events";
import { getProjectById } from "@/lib/firebase/projects";
import { getAllEmployees } from "@/lib/firebase/employees";
import { getAllFreelancers } from "@/lib/firebase/freelancers";
import { notifyEmployee } from "@/lib/firebase/notifications";
import { PROJECT_STATUSES } from "@/lib/constants/projects";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import AvatarInitials from "@/components/ui/avatar-initials";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, X, Trash2, Users2, CalendarDays, MessageSquare, Banknote } from "lucide-react";

const SHOOT_ROLES = ["photographer", "videographer", "editor", "data_manager"];
const ADMIN_ROLES = ["super_admin", "admin", "project_manager"];

function EventDetailContent() {
  const { id: projectId, eventId } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const isAdminOrPM = ADMIN_ROLES.includes(user.role);
  const canDelete = ["super_admin", "admin"].includes(user.role);

  const [event, setEvent] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [freelancers, setFreelancers] = useState([]);
  const [editorTeamsById, setEditorTeamsById] = useState({}); // teamId -> name, for the "via <team>" badge
  const [loading, setLoading] = useState(true);
  const [conflictMap, setConflictMap] = useState({});
  const [statusUpdates, setStatusUpdates] = useState([]);
  // Combined picker value is "employee:{uid}" or "freelancer:{id}" so one
  // Select can offer both pools without id collisions between them.
  const [selectedKey, setSelectedKey] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [assignDayRate, setAssignDayRate] = useState("");
  const [assignCost, setAssignCost] = useState("");
  const [assignCostLabel, setAssignCostLabel] = useState("Full Day");
  const [savingTeam, setSavingTeam] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [detailsForm, setDetailsForm] = useState({
    eventName: "",
    eventStartDate: "",
    eventEndDate: "",
  });
  const [savingDetails, setSavingDetails] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      // A Project Leader may only manage events under the project they
      // lead. Check the parent project's leaderUid before showing anything.
      if (!isAdminOrPM) {
        const project = await getProjectById(projectId);
        if (!project || project.leaderUid !== user.uid) {
          toast.error("You don't have access to this project");
          router.replace("/projects");
          return;
        }
      }

      const ev = await getEventById(projectId, eventId);
      setEvent(ev);
      if (ev) {
        setDetailsForm({
          eventName: ev.eventName || "",
          eventStartDate: ev.eventStartDate || "",
          eventEndDate: ev.eventEndDate || ev.eventStartDate || "",
        });

        try {
          const emps = await getAllEmployees();
          setEmployees(emps.filter((e) => SHOOT_ROLES.includes(e.role) && e.status === "active"));
        } catch (err) {
          toast.error(`Failed loading employees: ${err.message}`);
        }

        try {
          const fls = await getAllFreelancers();
          setFreelancers(fls.filter((f) => f.status === "active"));
        } catch (err) {
          toast.error(`Failed loading freelancers: ${err.message}`);
        }

        // Conflict-checking scans every project's events, which is
        // intentionally admin/PM-only data (a Project Leader can't see
        // other projects' schedules) — skip it for leaders rather than
        // let it fail with a permission error.
        if (isAdminOrPM) {
          try {
            const conflicts = await getConflictingEvents(ev.eventStartDate, ev.eventEndDate, ev.id);
            setConflictMap(conflicts);
          } catch (err) {
            toast.error(`Failed loading conflicts: ${err.message}`);
          }
        }

        try {
          const updates = await getAllStatusUpdatesForEvent(projectId, eventId);
          setStatusUpdates(updates);
        } catch (err) {
          toast.error(`Failed loading status updates: ${err.message}`);
        }
      }
    } catch (err) {
      toast.error(`Failed loading event: ${err.message}`);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, eventId]);

  // Prefill the per-assignment day rate with the freelancer's default rate
  // whenever a freelancer is picked, so it's a one-click "use default" but
  // still editable per assignment (e.g. a negotiated rate for this project).
  useEffect(() => {
    if (!selectedKey) {
      setAssignDayRate("");
      return;
    }
    const [kind, selId] = selectedKey.split(":");
    if (kind === "freelancer") {
      const fl = freelancers.find((f) => f.id === selId);
      setAssignDayRate(fl?.dayRate ? String(fl.dayRate) : "");
      setAssignCost(fl?.dayRate ? String(fl.dayRate) : "");
    } else {
      setAssignDayRate("");
      setAssignCost("");
    }
    setAssignCostLabel("Full Day");
  }, [selectedKey, freelancers]);

  async function handleSaveDetails(e) {
    e.preventDefault();
    if (
      detailsForm.eventStartDate &&
      detailsForm.eventEndDate &&
      detailsForm.eventEndDate < detailsForm.eventStartDate
    ) {
      toast.error("End date can't be before start date");
      return;
    }
    setSavingDetails(true);
    try {
      await updateEventDetails(projectId, eventId, {
        eventName: detailsForm.eventName,
        eventStartDate: detailsForm.eventStartDate,
        eventEndDate: detailsForm.eventEndDate || detailsForm.eventStartDate,
      });
      toast.success("Event details updated");
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleStatusChange(status) {
    try {
      await updateEventStatus(projectId, eventId, status);
      setEvent((prev) => ({ ...prev, status }));
      toast.success("Status updated");
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleAddMember() {
    if (!selectedKey) {
      toast.error("Select an employee or freelancer");
      return;
    }
    const [kind, id] = selectedKey.split(":");
    if (event.team?.some((m) => m.uid === id)) {
      toast.error("Already assigned to this event");
      return;
    }
    setSavingTeam(true);
    try {
      const trimmedNote = assignNote.trim();
      let newMember;
      if (kind === "freelancer") {
        const fl = freelancers.find((f) => f.id === id);
        newMember = {
          uid: fl.id,
          name: fl.name,
          role: fl.skill,
          type: "freelancer",
          sourceTeamId: null,
          // Per-assignment override of the freelancer's default day rate
          // (e.g. a negotiated rate for this specific project) — this is
          // what the Expenses payout suggestion uses, falling back to the
          // freelancer's profile dayRate only if this wasn't set.
          dayRate: Number(assignDayRate) || fl.dayRate || 0,
          // Cost + label used for the project's Team Cost / Net Profit rollup
          // (e.g. "Full Day ₹10,000"). Independent of dayRate so it can be
          // set for employees too, not just freelancers.
          cost: Number(assignCost) || 0,
          costLabel: assignCostLabel || "Full Day",
          assignments: trimmedNote
            ? [{ text: trimmedNote, addedBy: user.name, addedAt: new Date().toISOString() }]
            : [],
        };
      } else {
        const emp = employees.find((e) => e.uid === id);
        newMember = {
          uid: emp.uid,
          name: emp.name,
          role: emp.role,
          type: "employee",
          sourceTeamId: null, // individually added, distinct from a bulk team-assign
          cost: Number(assignCost) || 0,
          costLabel: assignCostLabel || "Full Day",
          assignments: trimmedNote
            ? [{ text: trimmedNote, addedBy: user.name, addedAt: new Date().toISOString() }]
            : [],
        };
      }
      const newTeam = [...(event.team || []), newMember];
      await updateEventTeam(projectId, eventId, newTeam, event.status);

      // Freelancers have no login account, so there's nothing to notify —
      // only employees get an in-app notification.
      if (kind === "employee") {
        await notifyEmployee(id, {
          type: "event_assignment",
          title: `Assigned to ${event.eventName} (${event.projectName})`,
          message: trimmedNote || "You've been added to this event's team.",
          projectId,
          eventId,
        });
      }

      toast.success("Team member added");
      setSelectedKey("");
      setAssignNote("");
      setAssignDayRate("");
      setAssignCost("");
      setAssignCostLabel("Full Day");
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingTeam(false);
    }
  }

  async function handleRemoveMember(uid) {
    setSavingTeam(true);
    try {
      const newTeam = (event.team || []).filter((m) => m.uid !== uid);
      await updateEventTeam(projectId, eventId, newTeam, event.status);
      toast.success("Team member removed");
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingTeam(false);
    }
  }

  async function handleDeleteEvent() {
    setDeleting(true);
    try {
      await deleteEvent(projectId, eventId);
      toast.success("Event deleted");
      router.push(`/projects/${projectId}`);
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

  if (!event) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Event not found.</p>
      </AppShell>
    );
  }

  const [selectedKind, selectedId] = selectedKey ? selectedKey.split(":") : [null, null];
  const selectedConflicts = selectedId ? conflictMap[selectedId] : null;
  const selectedEmployee = employees.find((e) => e.uid === selectedId);
  const selectedFreelancer = freelancers.find((f) => f.id === selectedId);
  const selectedLabel = selectedEmployee
    ? `${selectedEmployee.name} (${selectedEmployee.role})`
    : selectedFreelancer
    ? `${selectedFreelancer.name} (${selectedFreelancer.skill}, freelancer)`
    : null;
  const detailsShootDays =
    detailsForm.eventStartDate && detailsForm.eventEndDate
      ? Math.max(
          1,
          Math.round(
            (new Date(detailsForm.eventEndDate) - new Date(detailsForm.eventStartDate)) / 86400000
          ) + 1
        )
      : 1;

  return (
    <AppShell>
      <button
        onClick={() => router.push(`/projects/${projectId}`)}
        className="mb-3 flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to {event.projectName}
      </button>

      <div className="sticky top-0 z-10 mb-6 flex flex-col gap-3 border-b border-slate-200 bg-white/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-slate-900 sm:text-2xl">
              {event.eventName}
            </h2>
            <p className="text-sm text-slate-500">
              {event.clientName}
              {detailsShootDays > 0 && (
                <span className="text-slate-400">
                  {" "}
                  · {detailsShootDays} shoot day{detailsShootDays !== 1 && "s"}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:pl-2">
          <StatusBadge status={event.status} />
          <Select value={event.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-8 w-36 text-xs sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROJECT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon" className="h-8 w-8">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitleEl>Delete "{event.eventName}"?</AlertDialogTitleEl>
                  <AlertDialogDescription>
                    This permanently deletes the event, its team assignments, and all status
                    updates. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteEvent}
                    disabled={deleting}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {deleting ? "Deleting..." : "Delete Event"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <h3 className="font-medium text-slate-900">Event Details</h3>
            </div>
            <form onSubmit={handleSaveDetails} className="flex flex-col gap-3">
              <div>
                <Label htmlFor="eventName">Event Name</Label>
                <Input
                  id="eventName"
                  value={detailsForm.eventName}
                  onChange={(e) => setDetailsForm((p) => ({ ...p, eventName: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="eventStartDate">Start Date</Label>
                  <Input
                    id="eventStartDate"
                    type="date"
                    value={detailsForm.eventStartDate}
                    onChange={(e) =>
                      setDetailsForm((p) => ({
                        ...p,
                        eventStartDate: e.target.value,
                        eventEndDate:
                          p.eventEndDate && p.eventEndDate < e.target.value ? e.target.value : p.eventEndDate,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="eventEndDate">End Date</Label>
                  <Input
                    id="eventEndDate"
                    type="date"
                    min={detailsForm.eventStartDate || undefined}
                    value={detailsForm.eventEndDate}
                    onChange={(e) => setDetailsForm((p) => ({ ...p, eventEndDate: e.target.value }))}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">{detailsShootDays} shoot day{detailsShootDays !== 1 && "s"}</p>
              <Button type="submit" disabled={savingDetails} className="w-full">
                {savingDetails ? "Saving..." : "Save Details"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <Users2 className="h-4 w-4 text-slate-400" />
              <h3 className="font-medium text-slate-900">Team Assignment</h3>
              {(event.team || []).length > 0 && (
                <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  {event.team.length} assigned
                </span>
              )}
            </div>

            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label>Employee or Freelancer</Label>
                <Select value={selectedKey} onValueChange={setSelectedKey}>
                  <SelectTrigger>
                    {selectedLabel || <span className="text-slate-400">Select employee or freelancer</span>}
                  </SelectTrigger>
                  <SelectContent>
                    {employees.length > 0 && (
                      <>
                        <p className="px-2 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Employees
                        </p>
                        {employees.map((e) => (
                          <SelectItem key={`employee:${e.uid}`} value={`employee:${e.uid}`}>
                            {e.name} ({e.role})
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {freelancers.length > 0 && (
                      <>
                        <p className="px-2 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Freelancers
                        </p>
                        {freelancers.map((f) => (
                          <SelectItem key={`freelancer:${f.id}`} value={`freelancer:${f.id}`}>
                            {f.name} ({f.skill})
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddMember} disabled={savingTeam || !selectedKey} className="w-full sm:w-auto">
                Add
              </Button>
            </div>

            <div className="mb-3">
              <Label htmlFor="assignNote">Notes for this assignment (goals / instructions)</Label>
              <Textarea
                id="assignNote"
                placeholder="e.g. Handle candid shots during the ceremony, hand raw files to editor by EOD"
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
                rows={2}
              />
            </div>

            {selectedKey && (
              <div className="mb-3 flex flex-wrap gap-3">
                <div className="w-32">
                  <Label htmlFor="assignCostLabel">Rate type</Label>
                  <Select value={assignCostLabel} onValueChange={setAssignCostLabel}>
                    <SelectTrigger id="assignCostLabel">{assignCostLabel}</SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Full Day">Full Day</SelectItem>
                      <SelectItem value="Half Day">Half Day</SelectItem>
                      <SelectItem value="Fixed">Fixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-40">
                  <Label htmlFor="assignCost">Cost for this assignment (₹)</Label>
                  <Input
                    id="assignCost"
                    type="number"
                    min="0"
                    placeholder="e.g. 10000"
                    value={assignCost}
                    onChange={(e) => setAssignCost(e.target.value)}
                  />
                </div>
                {selectedKind === "freelancer" && (
                  <p className="w-full text-[11px] text-slate-500">
                    Defaults to their profile day rate — override here for a project-specific rate.
                    This also feeds the Expenses payout suggestion.
                  </p>
                )}
              </div>
            )}

            {selectedConflicts?.length > 0 && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  This employee is already assigned to overlapping event(s): {selectedConflicts.join(", ")}.
                  You can still add them if this is intentional.
                </span>
              </div>
            )}

            {(event.team || []).length === 0 ? (
              <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-slate-200 py-8 text-center">
                <Users2 className="h-5 w-5 text-slate-300" />
                <p className="text-sm text-slate-500">No team members assigned yet.</p>
              </div>
            ) : (
              <div className="grid max-h-64 gap-2 overflow-y-auto pr-1">
                {event.team.map((m) => {
                  const latestNote = (m.assignments || []).slice(-1)[0]?.text;
                  const teamName = m.sourceTeamId ? editorTeamsById[m.sourceTeamId] : null;
                  return (
                    <div
                      key={m.uid}
                      className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm transition-colors hover:border-slate-300"
                    >
                      <AvatarInitials name={m.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="font-medium text-slate-900">{m.name}</span>
                            {m.role && <span className="text-xs text-slate-400">{m.role}</span>}
                          </span>
                          <button
                            onClick={() => handleRemoveMember(m.uid)}
                            disabled={savingTeam}
                            className="shrink-0 rounded-full p-1 hover:bg-red-50"
                          >
                            <X className="h-3.5 w-3.5 text-slate-400 hover:text-red-600" />
                          </button>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {m.type === "freelancer" && (
                            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                              Freelancer
                            </span>
                          )}
                          {m.cost > 0 && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                              <Banknote className="h-3 w-3" />
                              {m.costLabel || "Full Day"} · ₹{m.cost.toLocaleString("en-IN")}
                            </span>
                          )}
                          {m.sourceTeamId ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">
                              <Users2 className="h-3 w-3" /> {teamName || "Team"}
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              Individual
                            </span>
                          )}
                        </div>
                        {latestNote && <p className="mt-1.5 text-xs text-slate-500">{latestNote}</p>}
                        {(m.assignments?.length || 0) > 1 && (
                          <p className="mt-1 text-[11px] text-slate-400">
                            +{m.assignments.length - 1} earlier instruction{m.assignments.length - 1 !== 1 && "s"}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="mb-1 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-slate-400" />
            <h3 className="font-medium text-slate-900">Team Updates</h3>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Progress notes reported directly by team members assigned to this event.
          </p>

          {statusUpdates.filter((u) => (u.updates || []).length > 0).length === 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-slate-200 py-8 text-center">
              <MessageSquare className="h-5 w-5 text-slate-300" />
              <p className="text-sm text-slate-500">No updates from the team yet.</p>
            </div>
          ) : (
            <div className="grid max-h-72 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {statusUpdates
                .filter((u) => (u.updates || []).length > 0)
                .map((u) => {
                  const latest = u.updates[u.updates.length - 1];
                  return (
                    <div key={u.uid} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                      <AvatarInitials name={u.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                          <span className="font-medium text-slate-900">{u.name}</span>
                          {latest?.updatedAt && (
                            <span className="text-xs text-slate-400">
                              {new Date(latest.updatedAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <p className="text-slate-600">{latest?.text}</p>
                        {u.updates.length > 1 && (
                          <p className="mt-1 text-[11px] text-slate-400">
                            +{u.updates.length - 1} earlier update{u.updates.length - 1 !== 1 && "s"}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

export default function EventDetailPage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <EventDetailContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}