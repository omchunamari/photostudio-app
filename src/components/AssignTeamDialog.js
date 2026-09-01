"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getEventById,
  updateEventTeam,
  getConflictingEvents,
} from "@/lib/firebase/events";
import { getAllEmployees } from "@/lib/firebase/employees";
import { getAllFreelancers } from "@/lib/firebase/freelancers";
import { notifyEmployee } from "@/lib/firebase/notifications";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import AvatarInitials from "@/components/ui/avatar-initials";
import { toast } from "sonner";
import { AlertTriangle, X, Users2, Banknote } from "lucide-react";

const SHOOT_ROLES = ["photographer", "videographer", "editor", "data_manager"];
const ADMIN_ROLES = ["super_admin", "admin", "project_manager"];

/**
 * Popup version of the Team Assignment card that used to live only on the
 * full event detail page. Pass the project + event and this loads
 * employees/freelancers/conflicts itself, exactly like the event page did.
 *
 * Props:
 * - open, onOpenChange: dialog visibility
 * - projectId, eventId: which event to manage
 * - eventName, clientName: for the header (avoids an extra fetch before open)
 * - onUpdated: called with the freshly-saved event after any change, so the
 *   parent (project page) can update its own local event list without a
 *   full page reload.
 */
export default function AssignTeamDialog({
  open,
  onOpenChange,
  projectId,
  eventId,
  eventName,
  clientName,
  onUpdated,
}) {
  const { user } = useAuth();
  const isAdminOrPM = ADMIN_ROLES.includes(user.role);

  const [event, setEvent] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [freelancers, setFreelancers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [conflictMap, setConflictMap] = useState({});

  const [selectedKey, setSelectedKey] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [assignDayRate, setAssignDayRate] = useState("");
  const [assignCost, setAssignCost] = useState("");
  const [assignCostLabel, setAssignCostLabel] = useState("Full Day");
  const [savingTeam, setSavingTeam] = useState(false);
  const [editingCostUid, setEditingCostUid] = useState(null);
  const [editingCostValue, setEditingCostValue] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const ev = await getEventById(projectId, eventId);
      setEvent(ev);

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

      if (isAdminOrPM && ev) {
        try {
          const conflicts = await getConflictingEvents(ev.eventStartDate, ev.eventEndDate, ev.id);
          setConflictMap(conflicts);
        } catch (err) {
          toast.error(`Failed loading conflicts: ${err.message}`);
        }
      }
    } catch (err) {
      toast.error(`Failed loading event: ${err.message}`);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (open && projectId && eventId) {
      loadData();
      setSelectedKey("");
      setAssignNote("");
      setAssignDayRate("");
      setAssignCost("");
      setAssignCostLabel("Full Day");
      setEditingCostUid(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, eventId]);

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

  async function persistTeam(newTeam) {
    await updateEventTeam(projectId, eventId, newTeam, event.status);
    const updated = { ...event, team: newTeam };
    setEvent(updated);
    onUpdated?.(updated);
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
          dayRate: Number(assignDayRate) || fl.dayRate || 0,
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
          sourceTeamId: null,
          cost: Number(assignCost) || 0,
          costLabel: assignCostLabel || "Full Day",
          assignments: trimmedNote
            ? [{ text: trimmedNote, addedBy: user.name, addedAt: new Date().toISOString() }]
            : [],
        };
      }
      const newTeam = [...(event.team || []), newMember];
      await persistTeam(newTeam);

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
      const newTeam = (event.team || []).map((m) => (m.uid === uid ? { ...m, cost } : m));
      await persistTeam(newTeam);
      toast.success("Amount updated");
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
      await persistTeam(newTeam);
      toast.success("Team member removed");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingTeam(false);
    }
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

  const assignedCount = event?.team?.length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[95vw] max-w-lg flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 px-5 pb-3 pt-5">
          <DialogTitle>Assign Team — {eventName || event?.eventName}</DialogTitle>
        </DialogHeader>

        {loading || !event ? (
          <div className="p-5">
            <p className="text-sm text-slate-500">Loading...</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* --- Summary strip --- */}
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <p className="font-medium text-slate-900">
                  {clientName || event.clientName}
                </p>
                <p className="text-xs text-slate-500">
                  {event.eventStartDate
                    ? event.eventStartDate === event.eventEndDate
                      ? event.eventStartDate
                      : `${event.eventStartDate} – ${event.eventEndDate}`
                    : "No date set"}
                </p>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span>Team size: {assignedCount} assigned</span>
                <span
                  className={
                    assignedCount === 0
                      ? "font-medium text-slate-500"
                      : "font-medium text-amber-600"
                  }
                >
                  {assignedCount === 0 ? "Not Assigned" : "Assigned"}
                </span>
              </div>
            </div>

            {/* --- Currently assigned --- */}
            <div className="mb-4">
              <Label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-400">
                Currently assigned
              </Label>
              {(event.team || []).length === 0 ? (
                <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-slate-200 py-6 text-center">
                  <Users2 className="h-5 w-5 text-slate-300" />
                  <p className="text-sm text-slate-500">No team members assigned yet.</p>
                </div>
              ) : (
                <div className="grid max-h-48 gap-2 overflow-y-auto pr-1">
                  {event.team.map((m) => (
                    <div
                      key={m.uid}
                      className="flex items-start gap-3 rounded-lg border border-slate-200 p-2.5 text-sm"
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
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {m.type === "freelancer" && (
                            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                              Freelancer
                            </span>
                          )}
                          {editingCostUid === m.uid ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                              <Banknote className="h-3 w-3 shrink-0" />
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
                                className="w-16 border-b border-emerald-400 bg-transparent text-[10px] font-medium text-emerald-700 outline-none"
                              />
                            </span>
                          ) : (
                            (m.cost > 0 || isAdminOrPM) && (
                              <button
                                type="button"
                                disabled={!isAdminOrPM}
                                onClick={() => {
                                  if (!isAdminOrPM) return;
                                  setEditingCostValue(String(m.cost || 0));
                                  setEditingCostUid(m.uid);
                                }}
                                className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ${
                                  isAdminOrPM ? "hover:bg-emerald-100" : ""
                                }`}
                                title={isAdminOrPM ? "Click to edit amount" : undefined}
                              >
                                <Banknote className="h-3 w-3" />
                                {m.costLabel || "Full Day"} · ₹{(m.cost || 0).toLocaleString("en-IN")}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* --- Add team member --- */}
            <div className="border-t border-slate-100 pt-4">
              <Label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-400">
                Add team member
              </Label>

              <div className="mb-3">
                <Select value={selectedKey} onValueChange={setSelectedKey}>
                  <SelectTrigger>
                    {selectedLabel || <span className="text-slate-400">Select...</span>}
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

              {selectedConflicts?.length > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    Already assigned to overlapping event(s): {selectedConflicts.join(", ")}.
                    You can still add them if this is intentional.
                  </span>
                </div>
              )}

              {selectedKey && (
                <>
                  <div className="mb-3 grid grid-cols-2 gap-3">
                    <div>
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
                    <div>
                      <Label htmlFor="assignCost">Wage (₹)</Label>
                      <Input
                        id="assignCost"
                        type="number"
                        min="0"
                        placeholder={selectedKind === "freelancer" ? "Auto: profile rate" : "e.g. 10000"}
                        value={assignCost}
                        onChange={(e) => setAssignCost(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mb-3">
                    <Label htmlFor="assignNote">Notes (goals / instructions)</Label>
                    <Textarea
                      id="assignNote"
                      placeholder="e.g. Handle candid shots during the ceremony"
                      value={assignNote}
                      onChange={(e) => setAssignNote(e.target.value)}
                      rows={2}
                    />
                  </div>
                </>
              )}

              <Button
                onClick={handleAddMember}
                disabled={savingTeam || !selectedKey}
                className="w-full"
              >
                Assign
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}