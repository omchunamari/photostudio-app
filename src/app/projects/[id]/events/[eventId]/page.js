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
import SearchableSelect from "@/components/ui/searchable-select";
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
import { formatDateTime12 } from "@/lib/dateIST";

const ADMIN_ROLES = ["super_admin", "admin", "project_manager"];

/**
 * Flat option list for the "Employee or Freelancer" picker, split into
 * Employees / Freelancers headings with role or skill on the hint line, so
 * searching "editor" or "video" works when the name escapes you.
 *
 * People already on this event stay listed but greyed out and tagged
 * "Added" — you used to be able to pick one and only find out on clicking
 * Add, via an error toast. Anyone double-booked on an overlapping event
 * gets a "Conflict" tag up front rather than after selecting.
 *
 * Kept identical in shape to the one in AssignTeamDialog so the two
 * assignment surfaces behave the same way.
 */
function buildAssigneeOptions(employees, freelancers, assignedUids, conflictMap) {
  const badgeFor = (id) => {
    if (assignedUids.has(id)) return "Added";
    return conflictMap[id]?.length ? "Conflict" : undefined;
  };
  return [
    ...employees.map((e) => ({
      value: `employee:${e.uid}`,
      label: e.name,
      hint: e.role,
      group: "Employees",
      disabled: assignedUids.has(e.uid),
      badge: badgeFor(e.uid),
    })),
    ...freelancers.map((fl) => ({
      value: `freelancer:${fl.id}`,
      label: fl.name,
      hint: `${fl.skill} · freelancer`,
      group: "Freelancers",
      disabled: assignedUids.has(fl.id),
      badge: badgeFor(fl.id),
    })),
  ];
}

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
  const [editingCostUid, setEditingCostUid] = useState(null);
  const [editingCostValue, setEditingCostValue] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [detailsForm, setDetailsForm] = useState({
    eventName: "",
    eventStartDate: "",
    eventEndDate: "",
  });
  const [savingDetails, setSavingDetails] = useState(false);
  const [editingName, setEditingName] = useState(false);

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
          setEmployees(emps.filter((e) => e.status === "active"));
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

  // Picks the right freelancer profile rate for a given rate-type label —
  // "Fixed" has no profile rate to suggest, so it's left for manual entry.
  function freelancerRateForLabel(fl, label) {
    if (!fl) return "";
    if (label === "Half Day") return fl.halfDayRate ? String(fl.halfDayRate) : "";
    if (label === "Full Day") return fl.fullDayRate ? String(fl.fullDayRate) : (fl.dayRate ? String(fl.dayRate) : "");
    return "";
  }

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
      setAssignCost(freelancerRateForLabel(fl, "Full Day"));
    } else {
      setAssignDayRate("");
      setAssignCost("");
    }
    setAssignCostLabel("Full Day");
  }, [selectedKey, freelancers]);

  // When the rate-type toggle changes (Full Day / Half Day / Fixed) for a
  // freelancer, re-suggest the wage from their profile so half-day
  // assignments pick up halfDayRate automatically instead of staying on
  // whatever full-day figure was auto-filled at selection time.
  function handleAssignCostLabelChange(label) {
    setAssignCostLabel(label);
    if (!selectedKey) return;
    const [kind, id] = selectedKey.split(":");
    if (kind === "freelancer") {
      const fl = freelancers.find((f) => f.id === id);
      const suggested = freelancerRateForLabel(fl, label);
      if (suggested) setAssignCost(suggested);
    }
  }

  async function saveDetails(values, { silent } = {}) {
    if (values.eventStartDate && values.eventEndDate && values.eventEndDate < values.eventStartDate) {
      toast.error("End date can't be before start date");
      return;
    }
    if (!values.eventName?.trim()) {
      toast.error("Event name is required");
      return;
    }
    setSavingDetails(true);
    try {
      await updateEventDetails(projectId, eventId, {
        eventName: values.eventName,
        eventStartDate: values.eventStartDate,
        eventEndDate: values.eventEndDate || values.eventStartDate,
      });
      if (!silent) toast.success("Event details updated");
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleSaveDetails(e) {
    e.preventDefault();
    await saveDetails(detailsForm);
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

  async function handleUpdateMemberCost(uid, newCost) {
    const cost = Number(newCost);
    if (Number.isNaN(cost) || cost < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSavingTeam(true);
    try {
      const newTeam = (event.team || []).map((m) =>
        m.uid === uid ? { ...m, cost } : m
      );
      await updateEventTeam(projectId, eventId, newTeam, event.status);
      toast.success("Amount updated");
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
  const assignedUidSet = new Set((event?.team || []).map((m) => m.uid));
  const assigneeOptions = buildAssigneeOptions(employees, freelancers, assignedUidSet, conflictMap);

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
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {event.projectName}
      </button>

      <div className="sticky top-0 z-10 mb-8 flex flex-col gap-4 border-b border-border bg-background/90 py-5 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="aperture-ring flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            {editingName ? (
              <Input
                autoFocus
                value={detailsForm.eventName}
                onChange={(e) => setDetailsForm((p) => ({ ...p, eventName: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  else if (e.key === "Escape") {
                    setDetailsForm((p) => ({ ...p, eventName: event.eventName }));
                    setEditingName(false);
                  }
                }}
                onBlur={() => {
                  setEditingName(false);
                  if (detailsForm.eventName.trim() && detailsForm.eventName !== event.eventName) {
                    saveDetails(detailsForm, { silent: true });
                  } else {
                    setDetailsForm((p) => ({ ...p, eventName: event.eventName }));
                  }
                }}
                className="h-auto border-transparent px-1 -mx-1 py-0 font-heading text-2xl font-semibold tracking-tight text-foreground shadow-none focus-visible:border-ring sm:text-[1.75rem]"
              />
            ) : (
              <h2
                onClick={() => isAdminOrPM && setEditingName(true)}
                title={isAdminOrPM ? "Click to rename" : undefined}
                className={`truncate rounded px-1 -mx-1 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem] ${
                  isAdminOrPM ? "cursor-text hover:bg-muted" : ""
                }`}
              >
                {event.eventName}
              </h2>
            )}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
              <span>{event.clientName}</span>
              <span className="text-muted-foreground/50">·</span>
              <input
                type="date"
                value={detailsForm.eventStartDate}
                disabled={!isAdminOrPM}
                onChange={(e) => {
                  const eventStartDate = e.target.value;
                  const eventEndDate =
                    detailsForm.eventEndDate && detailsForm.eventEndDate < eventStartDate
                      ? eventStartDate
                      : detailsForm.eventEndDate;
                  const next = { ...detailsForm, eventStartDate, eventEndDate };
                  setDetailsForm(next);
                  saveDetails(next, { silent: true });
                }}
                className="rounded border-none bg-transparent p-0 text-sm text-muted-foreground [color-scheme:light] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <span className="text-muted-foreground/50">–</span>
              <input
                type="date"
                value={detailsForm.eventEndDate}
                min={detailsForm.eventStartDate || undefined}
                disabled={!isAdminOrPM}
                onChange={(e) => {
                  const next = { ...detailsForm, eventEndDate: e.target.value };
                  setDetailsForm(next);
                  saveDetails(next, { silent: true });
                }}
                className="rounded border-none bg-transparent p-0 text-sm text-muted-foreground [color-scheme:light] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {detailsShootDays > 0 && (
                <span className="text-muted-foreground/70">
                  · {detailsShootDays} shoot day{detailsShootDays !== 1 && "s"}
                </span>
              )}
              {savingDetails && <span className="text-muted-foreground/50">Saving…</span>}
            </div>
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

      <div className="grid gap-6">
        <Card className="overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/12 text-accent">
                <Users2 className="h-3.5 w-3.5" />
              </span>
              <h3 className="font-heading text-base font-semibold text-foreground">Team Assignment</h3>
              {(event.team || []).length > 0 && (
                <span className="ml-auto rounded-full bg-accent/12 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                  {event.team.length} assigned
                </span>
              )}
            </div>

            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label>Employee or Freelancer</Label>
                <SearchableSelect
                  value={selectedKey}
                  onValueChange={setSelectedKey}
                  options={assigneeOptions}
                  placeholder="Select employee or freelancer"
                  searchPlaceholder="Search by name, role or skill..."
                  emptyText="Nobody matches that"
                  alwaysSearch
                  renderValue={() =>
                    selectedLabel || (
                      <span className="text-muted-foreground">Select employee or freelancer</span>
                    )
                  }
                />
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
                  <Select value={assignCostLabel} onValueChange={handleAssignCostLabelChange}>
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
                  <p className="w-full text-[11px] text-muted-foreground">
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
              <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border py-8 text-center">
                <Users2 className="h-5 w-5 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No team members assigned yet.</p>
              </div>
            ) : (
              <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                {event.team.map((m) => {
                  const latestNote = (m.assignments || []).slice(-1)[0]?.text;
                  const teamName = m.sourceTeamId ? editorTeamsById[m.sourceTeamId] : null;
                  return (
                    <div
                      key={m.uid}
                      className="group relative flex flex-col gap-1.5 rounded-lg border border-border bg-background/60 p-2.5 text-sm transition-colors hover:border-foreground/20"
                    >
                      <button
                        onClick={() => handleRemoveMember(m.uid)}
                        disabled={savingTeam}
                        className="absolute right-1 top-1 rounded-full bg-background/80 p-1 opacity-100 hover:bg-red-50 sm:bg-transparent sm:p-0.5 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-red-600 sm:h-3 sm:w-3" />
                      </button>

                      <div className="flex items-center gap-2 pr-4">
                        <AvatarInitials name={m.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground" title={m.name}>
                            {m.name}
                          </p>
                          {m.role && (
                            <p className="truncate text-[10px] text-muted-foreground">{m.role}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        {m.type === "freelancer" && (
                          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600">
                            Freelancer
                          </span>
                        )}
                        {m.sourceTeamId ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-medium text-violet-600">
                            <Users2 className="h-2.5 w-2.5" /> {teamName || "Team"}
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                            Individual
                          </span>
                        )}
                      </div>

                      {editingCostUid === m.uid ? (
                        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-accent/12 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                          <Banknote className="h-2.5 w-2.5 shrink-0" />
                          {m.costLabel || "Full Day"} · ₹
                          <input
                            autoFocus
                            type="number"
                            min="0"
                            value={editingCostValue}
                            onChange={(e) => setEditingCostValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              } else if (e.key === "Escape") {
                                setEditingCostUid(null);
                              }
                            }}
                            onBlur={() => {
                              setEditingCostUid(null);
                              if (editingCostValue !== String(m.cost)) {
                                handleUpdateMemberCost(m.uid, editingCostValue);
                              }
                            }}
                            disabled={savingTeam}
                            className="w-14 border-b border-accent bg-transparent text-[10px] font-medium text-accent outline-none"
                          />
                        </span>
                      ) : (m.cost > 0 || isAdminOrPM) && (
                        <button
                          type="button"
                          disabled={!isAdminOrPM}
                          onClick={() => {
                            if (!isAdminOrPM) return;
                            setEditingCostValue(String(m.cost || 0));
                            setEditingCostUid(m.uid);
                          }}
                          className={`inline-flex w-fit items-center gap-1 rounded-full bg-accent/12 px-1.5 py-0.5 text-[10px] font-medium text-accent ${
                            isAdminOrPM ? "hover:bg-accent/20" : ""
                          }`}
                          title={isAdminOrPM ? "Click to edit amount" : undefined}
                        >
                          <Banknote className="h-2.5 w-2.5" />
                          {m.costLabel || "Full Day"} · ₹{(m.cost || 0).toLocaleString("en-IN")}
                        </button>
                      )}

                      {latestNote && (
                        <p className="line-clamp-2 text-[10px] text-muted-foreground" title={latestNote}>
                          {latestNote}
                        </p>
                      )}
                      {(m.assignments?.length || 0) > 1 && (
                        <p className="text-[9px] text-muted-foreground/70">
                          +{m.assignments.length - 1} more note{m.assignments.length - 1 !== 1 && "s"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardContent className="p-5 sm:p-6">
          <div className="mb-1 flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/12 text-accent">
              <MessageSquare className="h-3.5 w-3.5" />
            </span>
            <h3 className="font-heading text-base font-semibold text-foreground">Team Updates</h3>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Progress notes reported directly by team members assigned to this event.
          </p>

          {statusUpdates.filter((u) => (u.updates || []).length > 0).length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border py-8 text-center">
              <MessageSquare className="h-5 w-5 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No updates from the team yet.</p>
            </div>
          ) : (
            <div className="grid max-h-72 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {statusUpdates
                .filter((u) => (u.updates || []).length > 0)
                .map((u) => {
                  const latest = u.updates[u.updates.length - 1];
                  return (
                    <div key={u.uid} className="flex items-start gap-3 rounded-lg border border-border bg-background/60 p-3 text-sm">
                      <AvatarInitials name={u.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                          <span className="font-medium text-foreground">{u.name}</span>
                          {latest?.updatedAt && (
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime12(latest.updatedAt)}
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground">{latest?.text}</p>
                        {u.updates.length > 1 && (
                          <p className="mt-1 text-[11px] text-muted-foreground/70">
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