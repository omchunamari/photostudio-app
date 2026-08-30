"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  DELIVERABLE_TYPES,
  DELIVERABLE_STATUSES,
  getAllDeliverables,
  getDeliverablesForEmployee,
  addDeliverableStatusUpdate,
  ensureDeliverablesForProject,
  addDeliverable,
  updateDeliverable,
  deleteDeliverable,
} from "@/lib/firebase/deliverables";
import {
  getAllStorageEntries,
  getStorageEntriesForEmployee,
  logStorageEntry,
  updateStorageEntry,
} from "@/lib/firebase/storageEntries";
import { getAllProjects } from "@/lib/firebase/projects";
import { getAllEvents, getEventsForProject, getEventsForEmployee } from "@/lib/firebase/events";
import { getAllEmployees } from "@/lib/firebase/employees";
import { getAllFreelancers } from "@/lib/firebase/freelancers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AvatarInitials from "@/components/ui/avatar-initials";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import StatusBadge from "@/components/ui/status-badge";
import {
  BarChart3,
  Layers,
  HardDrive,
  Search,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  MessageSquare,
  FileText,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const ADMIN_ROLES = ["super_admin", "admin", "project_manager"];

const STATUS_COLORS = {
  Done: "oklch(0.65 0.14 155)",
  "In Progress": "oklch(0.75 0.15 75)",
  Pending: "oklch(0.75 0.05 75)",
};

/** Indian financial year (Apr–Mar) label list, current year first, going back 4 years. */
function getFinancialYearOptions() {
  const now = new Date();
  const currentFyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const options = [];
  for (let i = 0; i < 5; i++) {
    const startYear = currentFyStart - i;
    options.push({
      value: `${startYear}`,
      label: `FY ${startYear}-${String(startYear + 1).slice(2)}`,
      startDate: `${startYear}-04-01`,
      endDate: `${startYear + 1}-03-31`,
    });
  }
  return options;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/* ---------------------------------------------------------------------- */
/* Deliverable edit dialog                                                 */
/* ---------------------------------------------------------------------- */

function DeliverableDialog({ open, onOpenChange, deliverable, people, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (deliverable) {
      setForm({
        status: deliverable.status || "Pending",
        assignedUid: deliverable.assignedUid || "",
        startDate: deliverable.startDate || "",
        endDate: deliverable.endDate || "",
        deadline: deliverable.deadline || "",
        instructions: deliverable.instructions || "",
      });
    }
  }, [deliverable]);

  if (!deliverable) return null;

  async function handleSave() {
    setSaving(true);
    try {
      const person = people.find((p) => p.uid === form.assignedUid);
      await updateDeliverable(deliverable.projectId, deliverable.id, {
        status: form.status,
        assignedUid: form.assignedUid || null,
        assignedName: person?.name || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        deadline: form.deadline || null,
        instructions: form.instructions || "",
      });
      toast.success("Deliverable updated");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>{deliverable.type}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DELIVERABLE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Assigned To</Label>
            <Select
              value={form.assignedUid || "none"}
              onValueChange={(v) => setForm((f) => ({ ...f, assignedUid: v === "none" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned">
                  {(v) => (v === "none" || !v ? "Unassigned" : people.find((p) => p.uid === v)?.name || "Unassigned")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p.uid} value={p.uid}>{p.name}{p.isFreelancer ? " (Freelancer)" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Start</Label>
              <Input type="date" value={form.startDate || ""} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <Label>End</Label>
              <Input type="date" value={form.endDate || ""} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
            <div>
              <Label>Deadline</Label>
              <Input type="date" value={form.deadline || ""} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Instructions for assignee</Label>
            <Textarea
              value={form.instructions || ""}
              onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              placeholder="Anything the assignee should know — edit style, folder to pull from, client preferences..."
              rows={3}
            />
          </div>
          {(deliverable.updates || []).length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Updates from assignee</Label>
              <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-md border p-2">
                {[...deliverable.updates].sort((a, b) => new Date(b.at) - new Date(a.at)).map((u, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium text-foreground">{u.byName || "Someone"}</span>
                    <span className="text-muted-foreground"> · {fmtDate(u.at)}{u.status ? ` · moved to ${u.status}` : ""}</span>
                    <p className="text-muted-foreground">{u.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Employee-facing counterpart to DeliverableDialog above — lets the
 * assigned employee change status and leave a note, without exposing
 * reassignment/date fields (firestore.rules only allows them to touch
 * status/updates/updatedAt on this doc).
 */
function EmployeeDeliverableDialog({ open, onOpenChange, deliverable, onSaved }) {
  const { user } = useAuth();
  const [status, setStatus] = useState("Pending");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (deliverable) {
      setStatus(deliverable.status || "Pending");
      setNote("");
    }
  }, [deliverable]);

  if (!deliverable) return null;

  const history = [...(deliverable.updates || [])].sort(
    (a, b) => new Date(b.at) - new Date(a.at)
  );

  async function handleSave() {
    setSaving(true);
    try {
      await addDeliverableStatusUpdate(deliverable.projectId, deliverable.id, {
        status,
        note,
        byUid: user.uid,
        byName: user.name || "",
      });
      toast.success("Deliverable updated");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err.message || "Failed to update deliverable");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>{deliverable.type}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {deliverable.projectName && (
            <p className="text-sm text-muted-foreground">{deliverable.projectName}</p>
          )}
          {deliverable.instructions && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Instructions</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{deliverable.instructions}</p>
            </div>
          )}
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DELIVERABLE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Add an update (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What's the latest on this deliverable?"
              rows={3}
            />
          </div>
          {history.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Previous updates</Label>
              <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-md border p-2">
                {history.map((u, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium text-foreground">{u.byName || "Someone"}</span>
                    <span className="text-muted-foreground"> · {fmtDate(u.at)}{u.status ? ` · moved to ${u.status}` : ""}</span>
                    <p className="text-muted-foreground">{u.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Employee's own "log storage" list — one row per event they're on,
 * showing whether they've already logged their storage handoff for it,
 * with a button to log it if not. Unlike the admin StorageEventList,
 * this only ever shows the current employee's own row per event, since
 * that's the only entry firestore.rules lets them create/edit.
 */
function MyStorageLogList({ events, user, entriesByKey, onLogStorage, onViewStorage }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">You&apos;re not assigned to any events yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {events.map((ev) => {
        const me = (ev.team || []).find((m) => m.uid === user.uid) || { uid: user.uid, name: user.name, role: "" };
        const entry = entriesByKey.get(`${ev.id}_${user.uid}`);
        const day = ev.eventStartDate ? fmtDate(ev.eventStartDate) : "—";
        return (
          <div key={ev.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
            <div>
              <p className="text-sm font-medium text-foreground">{ev.eventName}</p>
              <p className="text-xs text-muted-foreground">{ev.projectName}{ev.clientName ? ` · ${ev.clientName}` : ""} · {day}</p>
            </div>
            {entry ? (
              <button
                type="button"
                className="text-xs text-emerald-700 underline-offset-2 hover:underline"
                onClick={() => onViewStorage(ev, me, entry)}
              >
                {entry.mainStorage}{entry.backupStorage ? ` · backup ${entry.backupStorage}` : ""}
              </button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => onLogStorage(ev, me)}>
                + Log Storage
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AddDeliverableDialog({ open, onOpenChange, project, onAdded }) {
  const [type, setType] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setType("");
  }, [open]);

  async function handleAdd() {
    if (!type.trim()) {
      toast.error("Name this deliverable");
      return;
    }
    setSaving(true);
    try {
      await addDeliverable(project, type.trim());
      toast.success("Deliverable added");
      onOpenChange(false);
      onAdded();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Deliverable</DialogTitle>
        </DialogHeader>
        <div>
          <Label htmlFor="dtype">Name</Label>
          <Input id="dtype" value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. Teaser, Cinematic Trailer" />
        </div>
        <DialogFooter>
          <Button onClick={handleAdd} disabled={saving}>{saving ? "Adding..." : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------- */
/* Storage entry dialog                                                    */
/* ---------------------------------------------------------------------- */

function StorageEntryDialog({ open, onOpenChange, context, currentUid, currentName, onSaved }) {
  const [date, setDate] = useState("");
  const [cards, setCards] = useState([{ label: "", gb: "" }]);
  const [mainStorage, setMainStorage] = useState("");
  const [backupStorage, setBackupStorage] = useState("");
  const [copiedBy, setCopiedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const existing = context?.existingEntry || null;

  useEffect(() => {
    if (open && context) {
      if (existing) {
        setDate(existing.date || "");
        setCards(existing.cards?.length ? existing.cards.map((c) => ({ label: c.label, gb: String(c.gb ?? "") })) : [{ label: "", gb: "" }]);
        setMainStorage(existing.mainStorage || "");
        setBackupStorage(existing.backupStorage || "");
        setCopiedBy(existing.copiedBy || "");
        setNotes(existing.notes || "");
      } else {
        setDate(context.event.eventStartDate || "");
        setCards([{ label: "", gb: "" }]);
        setMainStorage("");
        setBackupStorage("");
        setCopiedBy("");
        setNotes("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, context]);

  if (!context) return null;
  const { event, member } = context;

  function updateCard(i, field, value) {
    setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  async function handleSave() {
    if (!date) {
      toast.error("Date is required");
      return;
    }
    if (!cards.some((c) => c.label.trim())) {
      toast.error("Add at least one card");
      return;
    }
    if (!mainStorage.trim()) {
      toast.error("Main storage is required");
      return;
    }
    if (!copiedBy.trim()) {
      toast.error("Copied By is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date,
        cards: cards.filter((c) => c.label.trim()).map((c) => ({ label: c.label.trim(), gb: Number(c.gb) || 0 })),
        mainStorage: mainStorage.trim(),
        backupStorage: backupStorage.trim(),
        copiedBy: copiedBy.trim(),
        notes: notes.trim(),
      };
      if (existing) {
        await updateStorageEntry(existing.id, payload);
      } else {
        await logStorageEntry(
          {
            projectId: event.projectId,
            projectName: event.projectName,
            clientName: event.clientName,
            eventId: event.id,
            eventName: event.eventName,
            memberUid: member.uid,
            memberName: member.name,
            memberRole: member.role,
            ...payload,
          },
          currentUid,
          currentName
        );
      }
      toast.success("Storage entry saved");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Storage Entry Details" : "Storage Entry"}</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">{event.eventName} — {member.role || "Team"}</p>
        {existing && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Logged by {existing.loggedBy || "someone"}{existing.createdAt ? ` · ${fmtDate(existing.createdAt)}` : ""}
          </p>
        )}
        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
          <div>
            <Label>Team Member</Label>
            <Input value={member.name} disabled />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label className="mb-0">Cards & Data Size</Label>
              <Button type="button" size="sm" variant="secondary" onClick={() => setCards((prev) => [...prev, { label: "", gb: "" }])}>
                <Plus className="h-3.5 w-3.5" /> Add Card
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {cards.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="Card #1 (e.g. SD-04)" value={c.label} onChange={(e) => updateCard(i, "label", e.target.value)} />
                  <Input className="w-24" placeholder="GB" value={c.gb} onChange={(e) => updateCard(i, "gb", e.target.value)} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label>Main Storage</Label>
            <Input placeholder="Drive #1 (e.g. WD-001)" value={mainStorage} onChange={(e) => setMainStorage(e.target.value)} />
          </div>
          <div>
            <Label>Backup Storage</Label>
            <Input placeholder="Backup #1 (e.g. SEA-002)" value={backupStorage} onChange={(e) => setBackupStorage(e.target.value)} />
          </div>
          <div>
            <Label>Copied By</Label>
            <Input placeholder="Name of person who copied the data" value={copiedBy} onChange={(e) => setCopiedBy(e.target.value)} />
          </div>
          <div>
            <Label>Notes — optional</Label>
            <Textarea placeholder="e.g. Card was formatted early — recovered from backup." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Entry"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------- */
/* Storage list (shared by the Projects>Storage sub-tab and top Storage)   */
/* ---------------------------------------------------------------------- */

function StorageEventList({ events, entriesByKey, onLogStorage, onViewStorage }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events found.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {events.map((ev) => {
        const day = ev.eventStartDate ? new Date(ev.eventStartDate) : null;
        const team = ev.team || [];
        return (
          <Card key={ev.id}>
            <CardContent className="p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 flex-col items-center justify-center rounded-md bg-muted text-center">
                    <span className="text-[10px] font-medium uppercase text-muted-foreground">
                      {day ? day.toLocaleDateString("en-IN", { month: "short" }) : "—"}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{day ? day.getDate() : "—"}</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{ev.eventName}</p>
                    <p className="text-xs text-muted-foreground">{ev.projectName}{ev.clientName ? ` · ${ev.clientName}` : ""}</p>
                  </div>
                </div>
                <div className="text-right">
                  {team.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No team assigned</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {team.filter((m) => entriesByKey.has(`${ev.id}_${m.uid}`)).length}/{team.length} received
                    </span>
                  )}
                </div>
              </div>

              {team.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No team members assigned. Assign team via the Events tab to enable storage logging for this event.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {team.map((m) => {
                    const entry = entriesByKey.get(`${ev.id}_${m.uid}`);
                    return (
                      <div key={m.uid} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <AvatarInitials name={m.name} size="sm" className="h-6 w-6 text-[10px]" />
                          <span className="text-sm text-foreground">{m.name}</span>
                          <span className="text-xs text-muted-foreground">{m.role}</span>
                          {!entry && <span className="text-xs text-rose-600">— not received yet</span>}
                        </div>
                        {entry ? (
                          <button
                            type="button"
                            className="text-xs text-emerald-700 underline-offset-2 hover:underline"
                            onClick={() => onViewStorage(ev, m, entry)}
                          >
                            {entry.mainStorage}{entry.backupStorage ? ` · backup ${entry.backupStorage}` : ""}
                          </button>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => onLogStorage(ev, m)}>
                            + Log Storage
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Deliverables table (per project)                                        */
/* ---------------------------------------------------------------------- */

function DeliverablesTable({ deliverables, isAdminView, onEdit, onDelete, showProject = false, rowsClickable = isAdminView }) {
  const pending = deliverables.filter((d) => d.status === "Pending");
  const inProgress = deliverables.filter((d) => d.status === "In Progress");
  const done = deliverables.filter((d) => d.status === "Done");
  const ordered = [...pending, ...inProgress, ...done];

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            {showProject && <TableHead>Project</TableHead>}
            <TableHead>Deliverable</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assigned To</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead>Deadline</TableHead>
            {isAdminView && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordered.map((d) => (
            <TableRow key={d.id} className={rowsClickable ? "cursor-pointer" : ""} onClick={() => rowsClickable && onEdit(d)}>
              {showProject && (
                <TableCell className="text-muted-foreground">{d.projectName || "—"}</TableCell>
              )}
              <TableCell className="font-medium text-foreground">
                <div className="flex items-center gap-1.5">
                  {d.type}
                  {d.instructions && (
                    <span title="Has instructions for assignee">
                      <FileText className="h-3 w-3 text-amber-600" />
                    </span>
                  )}
                  {(d.updates || []).length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      {d.updates.length}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell><StatusBadge status={d.status === "Done" ? "Completed" : d.status}>{d.status}</StatusBadge></TableCell>
              <TableCell className="text-muted-foreground">{d.assignedName || "Unassigned"}</TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(d.startDate)}</TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(d.endDate)}</TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(d.deadline)}</TableCell>
              {isAdminView && (
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(d)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(d)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/* Main content                                                            */
/* ---------------------------------------------------------------------- */

function PostProductionContent() {
  const { user } = useAuth();
  const isAdminView = ADMIN_ROLES.includes(user.role);

  const [mainTab, setMainTab] = useState("overview"); // overview | projects | storage
  const [projectSubTab, setProjectSubTab] = useState("deliverables"); // deliverables | storage
  const fyOptions = useMemo(() => getFinancialYearOptions(), []);
  const [fy, setFy] = useState(fyOptions[0].value);

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [events, setEvents] = useState([]);
  const [allDeliverables, setAllDeliverables] = useState([]);
  const [allStorageEntries, setAllStorageEntries] = useState([]);
  const [people, setPeople] = useState([]);
  const [myDeliverables, setMyDeliverables] = useState([]);
  const [myStorageEntries, setMyStorageEntries] = useState([]);
  const [myEvents, setMyEvents] = useState([]);

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectDeliverables, setProjectDeliverables] = useState([]);
  const [projectEvents, setProjectEvents] = useState([]);

  const [editingDeliverable, setEditingDeliverable] = useState(null);
  const [editingMyDeliverable, setEditingMyDeliverable] = useState(null);
  const [addDeliverableOpen, setAddDeliverableOpen] = useState(false);
  const [storageContext, setStorageContext] = useState(null);

  async function loadOrgData() {
    // Non-admin employees don't have list access to org-wide projects/events
    // under firestore.rules (isProjectOps()/isHR() only), so the admin
    // dashboard queries below (getAllProjects/getAllEvents/etc.) are
    // skipped for them. They still get their own assigned deliverables via
    // a collectionGroup query scoped to assignedUid == them, which is
    // allowed under firestore.rules independent of project list access.
    if (!isAdminView) {
      setLoading(true);
      try {
        const [mine, myStorage, evs] = await Promise.all([
          getDeliverablesForEmployee(user.uid),
          getStorageEntriesForEmployee(user.uid),
          getEventsForEmployee(user.uid),
        ]);
        setMyDeliverables(mine || []);
        setMyStorageEntries(myStorage || []);
        setMyEvents(evs || []);
      } catch (err) {
        console.error("Failed to load your deliverables:", err);
        toast.error(err.message || "Failed to load your deliverables");
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      const [projs, evs, emps, frees] = await Promise.all([
        getAllProjects(),
        getAllEvents(),
        getAllEmployees(),
        getAllFreelancers(),
      ]);
      setProjects(projs || []);
      setEvents(evs || []);
      const employeePeople = (emps || [])
        .filter((e) => e.status === "active")
        .map((e) => ({ uid: e.uid, name: e.name, role: e.role, isFreelancer: false }));
      const freelancerPeople = (frees || [])
        .filter((f) => f.status === "active")
        .map((f) => ({ uid: f.id, name: f.name, role: f.skill, isFreelancer: true }));
      setPeople([...employeePeople, ...freelancerPeople]);

      const [dels, entries] = await Promise.all([
        getAllDeliverables(projs || []),
        getAllStorageEntries(),
      ]);
      setAllDeliverables(dels);
      setAllStorageEntries(entries);
    } catch (err) {
      console.error("Failed to load post-production data:", err);
      toast.error(err.message || "Failed to load post-production data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrgData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid, isAdminView]);

  async function loadProject(projectId) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const [dels, evs] = await Promise.all([
      ensureDeliverablesForProject(project),
      getEventsForProject(projectId),
    ]);
    setProjectDeliverables(dels);
    setProjectEvents(evs);
  }

  useEffect(() => {
    if (selectedProjectId) loadProject(selectedProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, projects]);

  // FY-scoped projects: a project is "in range" if any of its events fall
  // inside the selected financial year (falls back to including projects
  // with no dated events yet, so brand-new projects aren't hidden).
  const fyRange = fyOptions.find((o) => o.value === fy);
  const eventsInFy = useMemo(
    () => events.filter((e) => e.eventStartDate && e.eventStartDate >= fyRange.startDate && e.eventStartDate <= fyRange.endDate),
    [events, fyRange]
  );
  const projectIdsInFy = useMemo(() => new Set(eventsInFy.map((e) => e.projectId)), [eventsInFy]);
  const projectsInFy = useMemo(
    () => projects.filter((p) => projectIdsInFy.has(p.id) || !events.some((e) => e.projectId === p.id)),
    [projects, projectIdsInFy, events]
  );

  const deliverablesInFy = useMemo(
    () => allDeliverables.filter((d) => projectsInFy.some((p) => p.id === d.projectId)),
    [allDeliverables, projectsInFy]
  );

  const statusCounts = DELIVERABLE_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: deliverablesInFy.filter((d) => d.status === s).length }),
    {}
  );

  const byType = DELIVERABLE_TYPES.map((type) => {
    const rows = deliverablesInFy.filter((d) => d.type === type);
    return {
      type,
      total: rows.length,
      pending: rows.filter((d) => d.status === "Pending").length,
      inProgress: rows.filter((d) => d.status === "In Progress").length,
      done: rows.filter((d) => d.status === "Done").length,
    };
  });

  const entriesByKey = useMemo(() => {
    const m = new Map();
    allStorageEntries.forEach((entry) => m.set(`${entry.eventId}_${entry.memberUid}`, entry));
    return m;
  }, [allStorageEntries]);

  const storageStats = useMemo(() => {
    let allReceived = 0, partial = 0, missing = 0;
    let missingCount = 0;
    eventsInFy.forEach((ev) => {
      const team = ev.team || [];
      if (team.length === 0) return;
      const receivedCount = team.filter((m) => entriesByKey.has(`${ev.id}_${m.uid}`)).length;
      if (receivedCount === team.length) allReceived += 1;
      else if (receivedCount > 0) partial += 1;
      else missing += 1;
      missingCount += team.length - receivedCount;
    });
    return { totalEvents: eventsInFy.length, allReceived, partial, missing, missingCount };
  }, [eventsInFy, entriesByKey]);

  const openDeliverables = deliverablesInFy.filter((d) => d.status !== "Done");

  const pieData = DELIVERABLE_STATUSES.map((s) => ({ name: s, value: statusCounts[s] })).filter((d) => d.value > 0);

  const filteredProjects = projects.filter((p) =>
    !projectSearch.trim() || p.projectName.toLowerCase().includes(projectSearch.trim().toLowerCase())
  );
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  async function handleDeliverableSaved() {
    if (selectedProjectId) await loadProject(selectedProjectId);
    if (isAdminView) await loadOrgData();
  }

  async function handleDeleteDeliverable(d) {
    if (!confirm(`Remove "${d.type}"?`)) return;
    try {
      await deleteDeliverable(d.projectId, d.id);
      toast.success("Deliverable removed");
      handleDeliverableSaved();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleStorageSaved() {
    if (selectedProjectId) await loadProject(selectedProjectId);
    if (isAdminView) await loadOrgData();
  }

  if (!isAdminView) {
    async function refreshMine() {
      setLoading(true);
      try {
        const [mine, myStorage, evs] = await Promise.all([
          getDeliverablesForEmployee(user.uid),
          getStorageEntriesForEmployee(user.uid),
          getEventsForEmployee(user.uid),
        ]);
        setMyDeliverables(mine || []);
        setMyStorageEntries(myStorage || []);
        setMyEvents(evs || []);
      } catch (err) {
        console.error("Failed to reload your data:", err);
      } finally {
        setLoading(false);
      }
    }
    const myEntriesByKey = new Map();
    myStorageEntries.forEach((entry) => myEntriesByKey.set(`${entry.eventId}_${entry.memberUid}`, entry));

    return (
      <AppShell>
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">Post-Production</h2>
          <p className="text-sm text-muted-foreground">Tap a deliverable to update its status or add a note.</p>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-col gap-8">
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your deliverables</h3>
              {myDeliverables.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deliverables assigned to you yet.</p>
              ) : (
                <DeliverablesTable
                  deliverables={myDeliverables}
                  isAdminView={false}
                  rowsClickable
                  onEdit={setEditingMyDeliverable}
                  onDelete={() => {}}
                  showProject
                />
              )}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your storage log</h3>
              <p className="mb-3 text-xs text-muted-foreground">One entry per event — log it once your cards/backups are handed off.</p>
              <MyStorageLogList
                events={myEvents}
                user={user}
                entriesByKey={myEntriesByKey}
                onLogStorage={(ev, member) => setStorageContext({ event: ev, member })}
                onViewStorage={(ev, member, entry) => setStorageContext({ event: ev, member, existingEntry: entry })}
              />
            </div>
          </div>
        )}
        <EmployeeDeliverableDialog
          open={!!editingMyDeliverable}
          onOpenChange={(v) => !v && setEditingMyDeliverable(null)}
          deliverable={editingMyDeliverable}
          onSaved={refreshMine}
        />
        <StorageEntryDialog
          open={!!storageContext}
          onOpenChange={(open) => !open && setStorageContext(null)}
          context={storageContext}
          currentUid={user.uid}
          currentName={user.name}
          onSaved={refreshMine}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">Post-Production</h2>
          <p className="text-sm text-muted-foreground">Deliverables and storage handoff, across every project.</p>
        </div>
        <Select value={fy} onValueChange={setFy}>
          <SelectTrigger className="w-[140px]">
            <SelectValue>{(v) => fyOptions.find((o) => o.value === v)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {fyOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-6 flex gap-2">
        <Button variant={mainTab === "overview" ? "default" : "secondary"} onClick={() => setMainTab("overview")}>
          <BarChart3 className="h-4 w-4" /> Overview
        </Button>
        <Button variant={mainTab === "projects" ? "default" : "secondary"} onClick={() => setMainTab("projects")}>
          <Layers className="h-4 w-4" /> Projects
        </Button>
        <Button variant={mainTab === "storage" ? "default" : "secondary"} onClick={() => setMainTab("storage")}>
          <HardDrive className="h-4 w-4" /> Storage
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : mainTab === "overview" ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Projects</p><p className="mt-1 text-3xl font-semibold text-foreground">{projectsInFy.length}</p><p className="text-xs text-muted-foreground">in selected range</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Deliverables</p><p className="mt-1 text-3xl font-semibold text-foreground">{deliverablesInFy.length}</p><p className="text-xs text-muted-foreground">across all projects</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pending / In Progress</p><p className="mt-1 text-3xl font-semibold text-amber-600">{statusCounts.Pending + statusCounts["In Progress"]}</p><p className="text-xs text-muted-foreground">{statusCounts.Pending} pending · {statusCounts["In Progress"]} in progress</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Done</p><p className="mt-1 text-3xl font-semibold text-emerald-600">{statusCounts.Done}</p><p className="text-xs text-muted-foreground">{deliverablesInFy.length ? Math.round((statusCounts.Done / deliverablesInFy.length) * 100) : 0}% complete</p></CardContent></Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">In the pipeline</p>
                <p className="mb-3 text-lg font-semibold text-foreground">Who&apos;s doing what</p>
                {openDeliverables.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No open deliverables. Everything in this period is delivered.</p>
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead>Deliverable</TableHead>
                          <TableHead>Assigned To</TableHead>
                          <TableHead>Deadline</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {openDeliverables.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="text-foreground">{d.clientName || d.projectName}</TableCell>
                            <TableCell className="text-muted-foreground">{d.type}</TableCell>
                            <TableCell className={d.assignedName ? "text-foreground" : "text-muted-foreground"}>{d.assignedName || "Unassigned"}</TableCell>
                            <TableCell className="text-muted-foreground">{fmtDate(d.deadline)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                <p className="mb-2 text-lg font-semibold text-foreground">Split</p>
                {deliverablesInFy.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No deliverables yet</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={2}>
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={STATUS_COLORS[entry.name]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 flex flex-col gap-1.5 text-sm">
                      {DELIVERABLE_STATUSES.map((s) => (
                        <div key={s} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[s] }} />
                            {s}
                          </span>
                          <span className="font-medium text-foreground">{statusCounts[s]}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Storage</p>
              <p className="mb-3 text-lg font-semibold text-foreground">What has come in</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card><CardContent className="p-4 text-center"><p className="text-3xl font-semibold text-foreground">{storageStats.totalEvents}</p><p className="text-xs text-muted-foreground">Total Events</p></CardContent></Card>
                <Card><CardContent className="p-4 text-center"><p className="text-3xl font-semibold text-emerald-600">{storageStats.allReceived}</p><p className="text-xs text-muted-foreground">All Received ✓</p></CardContent></Card>
                <Card><CardContent className="p-4 text-center"><p className="text-3xl font-semibold text-amber-600">{storageStats.partial}</p><p className="text-xs text-muted-foreground">Partially Done</p></CardContent></Card>
                <Card><CardContent className="p-4 text-center"><p className="text-3xl font-semibold text-rose-600">{storageStats.missing}</p><p className="text-xs text-muted-foreground">Missing Entries</p></CardContent></Card>
              </div>
              {storageStats.missingCount > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {storageStats.missingCount} storage {storageStats.missingCount === 1 ? "entry is" : "entries are"} still pending from team members.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Deliverables</p>
              <p className="mb-3 text-lg font-semibold text-foreground">Where the work stands</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right text-amber-600">Pending</TableHead>
                    <TableHead className="text-right">In Progress</TableHead>
                    <TableHead className="text-right">Done</TableHead>
                    <TableHead className="text-right">% Done</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byType.map((r) => (
                    <TableRow key={r.type}>
                      <TableCell className="font-medium text-foreground">{r.type}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.total || "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.total ? r.pending : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.total ? r.inProgress : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.total ? r.done : "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${r.total ? Math.round((r.done / r.total) * 100) : 0}%` }} />
                          </div>
                          <span className="w-9 text-xs text-muted-foreground">{r.total ? Math.round((r.done / r.total) * 100) : 0}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-semibold text-foreground">Total</TableCell>
                    <TableCell className="text-right font-semibold text-foreground">{deliverablesInFy.length}</TableCell>
                    <TableCell className="text-right font-semibold text-foreground">{statusCounts.Pending}</TableCell>
                    <TableCell className="text-right font-semibold text-foreground">{statusCounts["In Progress"]}</TableCell>
                    <TableCell className="text-right font-semibold text-foreground">{statusCounts.Done}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : mainTab === "projects" ? (
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <div>
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search projects..." value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} />
            </div>
            <p className="mb-2 text-xs text-muted-foreground">{filteredProjects.length} project{filteredProjects.length === 1 ? "" : "s"}</p>
            <div className="flex flex-col gap-1">
              {filteredProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProjectId(p.id); setProjectSubTab("deliverables"); }}
                  className={`rounded-md border p-3 text-left transition-colors ${
                    selectedProjectId === p.id ? "border-accent bg-accent/10" : "border-border hover:bg-muted"
                  }`}
                >
                  <p className="text-sm font-medium text-foreground">{p.projectName}</p>
                  <p className="text-xs text-muted-foreground">{p.eventDate ? fmtDate(p.eventDate) : p.clientName}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            {!selectedProject ? (
              <p className="text-sm text-muted-foreground">Select a project to view its deliverables and storage log.</p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-foreground">{selectedProject.projectName}</p>
                    <p className="text-xs text-muted-foreground">{projectEvents.length} event{projectEvents.length === 1 ? "" : "s"}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant={projectSubTab === "storage" ? "default" : "secondary"} size="sm" onClick={() => setProjectSubTab("storage")}>
                      Storage
                    </Button>
                    <Button variant={projectSubTab === "deliverables" ? "default" : "secondary"} size="sm" onClick={() => setProjectSubTab("deliverables")}>
                      Deliverables ({projectDeliverables.length})
                    </Button>
                  </div>
                </div>

                {projectSubTab === "deliverables" ? (
                  <>
                    <div className="mb-3 flex justify-end">
                      <Button size="sm" onClick={() => setAddDeliverableOpen(true)}>
                        <Plus className="h-4 w-4" /> Add Deliverable
                      </Button>
                    </div>
                    <DeliverablesTable
                      deliverables={projectDeliverables}
                      isAdminView={isAdminView}
                      onEdit={setEditingDeliverable}
                      onDelete={handleDeleteDeliverable}
                    />
                  </>
                ) : (
                  <StorageEventList
                    events={projectEvents}
                    entriesByKey={entriesByKey}
                    onLogStorage={(ev, member) => setStorageContext({ event: ev, member })}
                    onViewStorage={(ev, member, entry) => setStorageContext({ event: ev, member, existingEntry: entry })}
                  />
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <StorageEventList
          events={eventsInFy}
          entriesByKey={entriesByKey}
          onLogStorage={(ev, member) => setStorageContext({ event: ev, member })}
          onViewStorage={(ev, member, entry) => setStorageContext({ event: ev, member, existingEntry: entry })}
        />
      )}

      <DeliverableDialog
        open={!!editingDeliverable}
        onOpenChange={(open) => !open && setEditingDeliverable(null)}
        deliverable={editingDeliverable}
        people={people}
        onSaved={handleDeliverableSaved}
      />
      <AddDeliverableDialog
        open={addDeliverableOpen}
        onOpenChange={setAddDeliverableOpen}
        project={selectedProject}
        onAdded={handleDeliverableSaved}
      />
      <StorageEntryDialog
        open={!!storageContext}
        onOpenChange={(open) => !open && setStorageContext(null)}
        context={storageContext}
        currentUid={user.uid}
        currentName={user.name}
        onSaved={handleStorageSaved}
      />
    </AppShell>
  );
}

export default function PostProductionPage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <Suspense fallback={null}>
          <PostProductionContent />
        </Suspense>
      </DeviceGate>
    </ProtectedRoute>
  );
}