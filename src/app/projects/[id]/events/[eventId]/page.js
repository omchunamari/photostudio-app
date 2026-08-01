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
import { getAllEmployees } from "@/lib/firebase/employees";
import { getAllEditorTeams } from "@/lib/firebase/editorTeams";
import { notifyEmployee } from "@/lib/firebase/notifications";
import { PROJECT_STATUSES } from "@/lib/constants/projects";
import AssignEditorTeamButton from "@/components/AssignEditorTeamButton";
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
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, X, Trash2, Users2 } from "lucide-react";

const SHOOT_ROLES = ["photographer", "videographer", "editor", "data_manager"];

function EventDetailContent() {
  const { id: projectId, eventId } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const canDelete = ["super_admin", "admin"].includes(user.role);

  const [event, setEvent] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [editorTeamsById, setEditorTeamsById] = useState({}); // teamId -> name, for the "via <team>" badge
  const [loading, setLoading] = useState(true);
  const [conflictMap, setConflictMap] = useState({});
  const [statusUpdates, setStatusUpdates] = useState([]);
  const [selectedUid, setSelectedUid] = useState("");
  const [assignNote, setAssignNote] = useState("");
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
          setEmployees(emps.filter((e) => SHOOT_ROLES.includes(e.role)));
        } catch (err) {
          toast.error(`Failed loading employees: ${err.message}`);
        }

        try {
          const teams = await getAllEditorTeams();
          setEditorTeamsById(Object.fromEntries(teams.map((t) => [t.id, t.name])));
        } catch (err) {
          toast.error(`Failed loading editor teams: ${err.message}`);
        }

        try {
          const conflicts = await getConflictingEvents(ev.eventStartDate, ev.eventEndDate, ev.id);
          setConflictMap(conflicts);
        } catch (err) {
          toast.error(`Failed loading conflicts: ${err.message}`);
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
  }, [projectId, eventId]);

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
    if (!selectedUid) {
      toast.error("Select an employee");
      return;
    }
    if (event.team?.some((m) => m.uid === selectedUid)) {
      toast.error("Already assigned to this event");
      return;
    }
    setSavingTeam(true);
    try {
      const emp = employees.find((e) => e.uid === selectedUid);
      const trimmedNote = assignNote.trim();
      const newMember = {
        uid: selectedUid,
        name: emp.name,
        role: emp.role,
        sourceTeamId: null, // individually added, distinct from a bulk team-assign
        assignments: trimmedNote
          ? [{ text: trimmedNote, addedBy: user.name, addedAt: new Date().toISOString() }]
          : [],
      };
      const newTeam = [...(event.team || []), newMember];
      await updateEventTeam(projectId, eventId, newTeam, event.status);

      await notifyEmployee(selectedUid, {
        type: "event_assignment",
        title: `Assigned to ${event.eventName} (${event.projectName})`,
        message: trimmedNote || "You've been added to this event's team.",
        projectId,
        eventId,
      });

      toast.success("Team member added");
      setSelectedUid("");
      setAssignNote("");
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

  const selectedConflicts = selectedUid ? conflictMap[selectedUid] : null;
  const selectedEmployee = employees.find((e) => e.uid === selectedUid);
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
        className="mb-3 flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to {event.projectName}
      </button>

      <div className="sticky top-0 z-10 mb-6 flex flex-col gap-3 border-b border-slate-200 bg-white py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-slate-900 sm:text-2xl">
            {event.eventName}
          </h2>
          <p className="text-sm text-slate-500">{event.clientName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        <Card>
          <CardContent className="p-4 sm:p-5">
            <h3 className="mb-3 font-medium text-slate-900">Event Details</h3>
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

        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium text-slate-900">Team Assignment</h3>
              <AssignEditorTeamButton
                projectId={projectId}
                eventId={eventId}
                currentTeam={event.team}
                currentStatus={event.status}
                addedByName={user.name}
                onAssigned={loadData}
              />
            </div>

            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label>Employee</Label>
                <Select value={selectedUid} onValueChange={setSelectedUid}>
                  <SelectTrigger>
                    {selectedEmployee
                      ? `${selectedEmployee.name} (${selectedEmployee.role})`
                      : <span className="text-slate-400">Select employee</span>}
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.uid} value={e.uid}>
                        {e.name} ({e.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddMember} disabled={savingTeam || !selectedUid} className="w-full sm:w-auto">
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
              <p className="text-sm text-slate-500">No team members assigned yet.</p>
            ) : (
              <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
                {event.team.map((m) => {
                  const latestNote = (m.assignments || []).slice(-1)[0]?.text;
                  const teamName = m.sourceTeamId ? editorTeamsById[m.sourceTeamId] : null;
                  return (
                    <div
                      key={m.uid}
                      className="flex flex-col gap-1 rounded-md border border-slate-200 p-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                          {m.name}
                           {/* — <span className="text-slate-500">{m.role}</span> */}
                          {m.sourceTeamId ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">
                              <Users2 className="h-3 w-3" /> {teamName || "Team"}
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              Individual
                            </span>
                          )}
                        </span>
                        <button onClick={() => handleRemoveMember(m.uid)} disabled={savingTeam} className="shrink-0">
                          <X className="h-4 w-4 text-slate-400 hover:text-red-600" />
                        </button>
                      </div>
                      {latestNote && <p className="text-xs text-slate-500">{latestNote}</p>}
                      {(m.assignments?.length || 0) > 1 && (
                        <p className="text-[11px] text-slate-400">
                          +{m.assignments.length - 1} earlier instruction{m.assignments.length - 1 !== 1 && "s"}
                        </p>
                      )}
                      {/* {m.sourceTeamId && (
                        <p className="text-[11px] text-slate-400">
                          Stays in sync with {teamName || "this team"} — removing them there removes them here too.
                        </p>
                      )} */}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardContent className="p-4 sm:p-5">
          <h3 className="mb-1 font-medium text-slate-900">Team Updates</h3>
          <p className="mb-3 text-xs text-slate-500">
            Progress notes reported directly by team members assigned to this event.
          </p>

          {statusUpdates.filter((u) => (u.updates || []).length > 0).length === 0 ? (
            <p className="text-sm text-slate-500">No updates from the team yet.</p>
          ) : (
            <div className="grid max-h-72 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {statusUpdates
                .filter((u) => (u.updates || []).length > 0)
                .map((u) => {
                  const latest = u.updates[u.updates.length - 1];
                  return (
                    <div key={u.uid} className="rounded-md border border-slate-200 p-3 text-sm">
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
    <ProtectedRoute allowedRoles={["super_admin", "admin", "project_manager"]}>
      <DeviceGate>
        <EventDetailContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}