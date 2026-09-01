"use client";

import { useEffect, useMemo, useState, Suspense, Fragment } from "react";
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
import { cn } from "@/lib/utils";
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
  ClipboardList,
  History,
  CheckCircle2,
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

/**
 * Section header used across the employee's Post-Production page —
 * small icon tile + title + optional count chip + description, so each
 * block (deliverables / storage log / storage history) reads as a
 * distinct, labeled area rather than a bare all-caps line floating on
 * the page background.
 */
function SectionHeader({ icon: Icon, title, description, count }) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {typeof count === "number" && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{count}</span>
          )}
        </div>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
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
 * Small pill summarizing a saved storage entry — a "logged" chip plus the
 * main/backup drive names as compact mono tags. Used wherever a resolved
 * entry needs a compact, scannable summary instead of a plain text link.
 */
function StorageStatusPill({ entry }) {
  if (!entry) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> Logged
      </span>
      <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
        {entry.mainStorage}
      </span>
      {entry.backupStorage && (
        <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          + {entry.backupStorage}
        </span>
      )}
    </span>
  );
}

/**
 * Employee's own "log storage" list — one row per event they're on,
 * showing whether they've already logged their storage handoff for it,
 * with a button to log it if not. Unlike the admin StorageEventList,
 * this only ever shows the current employee's own row per event, since
 * that's the only entry firestore.rules lets them create/edit.
 */
function MyStorageLogList({ events, user, entriesByKey, onLogStorage }) {
  // Once an event's storage is logged, it drops out of this list entirely
  // — it lives in Storage history from then on. This list is only ever
  // the "still needs action" queue, not a mixed logged/unlogged view.
  const pending = events.filter((ev) => !entriesByKey.has(`${ev.id}_${user.uid}`));

  if (pending.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        {events.length === 0
          ? "You're not assigned to any events yet."
          : "You're all caught up — every event you're on has storage logged."}
      </div>
    );
  }
  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
      {pending.map((ev) => {
        const me = (ev.team || []).find((m) => m.uid === user.uid) || { uid: user.uid, name: user.name, role: "" };
        const day = ev.eventStartDate ? fmtDate(ev.eventStartDate) : "—";
        return (
          <div
            key={ev.id}
            className="flex flex-col gap-2.5 bg-background px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <HardDrive className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{ev.eventName}</p>
                <p className="truncate text-xs text-muted-foreground">{ev.projectName}{ev.clientName ? ` · ${ev.clientName}` : ""} · {day}</p>
              </div>
            </div>
            <Button size="sm" variant="secondary" className="w-full shrink-0 sm:w-auto" onClick={() => onLogStorage(ev, me)}>
              <Plus className="h-3.5 w-3.5" /> Log Storage
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Chronological "everything I've ever logged" list for an employee —
 * independent of MyStorageLogList above, which only shows entries for
 * events they're *currently* assigned to. This reads straight from
 * getStorageEntriesForEmployee(uid), so an entry still shows up here
 * even if they're later removed from that event's team.
 */
function StorageHistoryList({ entries, onView }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        You haven&apos;t logged any storage entries yet.
      </div>
    );
  }
  const sorted = [...entries].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
      {sorted.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onView(entry)}
          className="flex flex-col gap-2 bg-background px-3.5 py-3 text-left transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <History className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{entry.eventName || "—"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {entry.projectName}{entry.clientName ? ` · ${entry.clientName}` : ""} · {fmtDate(entry.date)}
              </p>
            </div>
          </div>
          <span className="self-start sm:self-auto sm:shrink-0">
            <StorageStatusPill entry={entry} />
          </span>
        </button>
      ))}
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
                      <div
                        key={m.uid}
                        className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <AvatarInitials name={m.name} size="sm" className="h-6 w-6 shrink-0 text-[10px]" />
                          <span className="truncate text-sm text-foreground">{m.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{m.role}</span>
                          {!entry && <span className="shrink-0 text-xs text-rose-600">— not received yet</span>}
                        </div>
                        {entry ? (
                          <button
                            type="button"
                            className="self-start truncate text-xs text-emerald-700 underline-offset-2 hover:underline sm:self-auto sm:shrink-0"
                            onClick={() => onViewStorage(ev, m, entry)}
                          >
                            {entry.mainStorage}{entry.backupStorage ? ` · backup ${entry.backupStorage}` : ""}
                          </button>
                        ) : (
                          <Button size="sm" variant="secondary" className="w-full sm:w-auto" onClick={() => onLogStorage(ev, m)}>
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

const STATUS_GROUP_STYLES = {
  Pending: "bg-amber-50 text-amber-700",
  "In Progress": "bg-blue-50 text-blue-700",
  Done: "bg-emerald-50 text-emerald-700",
};

const STATUS_DOT_STYLES = {
  Pending: "bg-amber-500",
  "In Progress": "bg-blue-500",
  Done: "bg-emerald-500",
};

function personLabel(uid, people) {
  if (!uid) return "Unassigned";
  const p = people.find((p) => p.uid === uid);
  return p ? `${p.name}${p.isFreelancer ? " (Freelancer)" : ""}` : "Unassigned";
}

/**
 * Assignee dropdown shared by the desktop table and mobile cards. Renders
 * the matched person's name via SelectValue's render-prop — the base-ui
 * Select otherwise falls back to printing the raw option `value` (the
 * uid) once selected, which is what showed ids like "8TVKTbnQGNaJ"
 * instead of a name.
 */
function AssigneeSelect({ value, people, onChange, className }) {
  return (
    <Select
      value={value || "none"}
      onValueChange={(v) => {
        const person = people.find((p) => p.uid === v);
        onChange({
          assignedUid: v === "none" ? null : v,
          assignedName: v === "none" ? null : person?.name || null,
        });
      }}
    >
      <SelectTrigger className={cn("h-8 text-sm", className)}>
        <SelectValue placeholder="Unassigned">
          {(v) => (v === "none" || !v ? "Unassigned" : personLabel(v, people))}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Unassigned</SelectItem>
        {people.map((p) => (
          <SelectItem key={p.uid} value={p.uid}>
            {p.name}{p.isFreelancer ? " (Freelancer)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Inline date input — plain text when not editable, a real <input
 * type="date"> (click-anywhere-on-the-box, not just the calendar icon)
 * when it is. Stops propagation so it never triggers a parent row's
 * onClick (see the sticky-header/date-picker click issue from the
 * earlier session — keeping this self-contained avoids that class of
 * bug entirely rather than depending on z-index tuning).
 */
function InlineDateCell({ value, onChange, editable }) {
  if (!editable) {
    return <TableCell className="text-muted-foreground">{fmtDate(value)}</TableCell>;
  }
  return (
    <TableCell onClick={(e) => e.stopPropagation()}>
      <Input
        type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-8 w-[9.5rem] text-sm"
      />
    </TableCell>
  );
}

/* --- Mobile card (one per deliverable, used below the md breakpoint) --- */
function DeliverableCard({ d, isAdminView, onEdit, onDelete, onInlineUpdate, people, showProject, clickable }) {
  const canEditInline = isAdminView && !!onInlineUpdate;
  const [showUpdates, setShowUpdates] = useState(false);
  const updates = (d.updates || []).length
    ? [...d.updates].sort((a, b) => new Date(b.at) - new Date(a.at))
    : [];

  return (
    <div
      className={`rounded-lg border border-border bg-background p-3 ${clickable ? "cursor-pointer" : ""}`}
      onClick={() => clickable && onEdit(d)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {showProject && d.projectName && (
            <p className="truncate text-xs text-muted-foreground">{d.projectName}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT_STYLES[d.status] || "bg-muted-foreground"}`} />
            <p className="font-medium text-foreground">{d.type}</p>
            {d.instructions && (
              <span title="Has instructions for assignee">
                <FileText className="h-3 w-3 shrink-0 text-amber-600" />
              </span>
            )}
            {updates.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowUpdates((v) => !v);
                }}
                className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground hover:text-accent"
              >
                <MessageSquare className="h-3 w-3" />
                {updates.length}
              </button>
            )}
          </div>
        </div>
        {isAdminView && (
          <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(d)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(d)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {showUpdates && updates.length > 0 && (
        <div
          className="mt-2 flex flex-col gap-1.5 border-l-2 border-border bg-muted/40 p-2 pl-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          {updates.map((u, i) => (
            <div key={i} className="text-xs">
              <span className="font-medium text-foreground">{u.byName || "Someone"}</span>
              <span className="text-muted-foreground"> · {fmtDate(u.at)}{u.status ? ` · moved to ${u.status}` : ""}</span>
              <p className="text-muted-foreground">{u.text}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Assigned To</p>
          {canEditInline ? (
            <AssigneeSelect
              value={d.assignedUid}
              people={people}
              onChange={(patch) => onInlineUpdate(d, patch)}
              className="w-full"
            />
          ) : (
            <p className="text-sm text-foreground">{d.assignedName || "Unassigned"}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            ["Start", "startDate"],
            ["End", "endDate"],
            ["Deadline", "deadline"],
          ].map(([label, key]) => (
            <div key={key}>
              <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
              {canEditInline ? (
                <Input
                  type="date"
                  value={d[key] || ""}
                  onChange={(e) => onInlineUpdate(d, { [key]: e.target.value || null })}
                  className="h-8 w-full px-1.5 text-xs"
                />
              ) : (
                <p className="text-xs text-foreground">{fmtDate(d[key])}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DeliverablesTable({
  deliverables,
  isAdminView,
  onEdit,
  onDelete,
  onInlineUpdate,
  people = [],
  showProject = false,
  rowsClickable = false,
}) {
  const grouped = DELIVERABLE_STATUSES.map((status) => ({
    status,
    rows: deliverables.filter((d) => d.status === status),
  })).filter((g) => g.rows.length > 0);

  const [expandedRows, setExpandedRows] = useState(() => new Set());
  function toggleExpanded(id) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (deliverables.length === 0) {
    return (
      <Card>
        <div className="p-6 text-center text-sm text-muted-foreground">No deliverables yet.</div>
      </Card>
    );
  }

  return (
    <>
      {/* Mobile: stacked cards grouped by status. Tables don't reflow well
          on narrow screens — six columns of dates/selects just get
          crushed — so below md we swap to a card-per-deliverable layout
          instead of forcing horizontal scroll. */}
      <div className="flex flex-col gap-4 md:hidden">
        {grouped.map((group) => (
          <div key={group.status} className="flex flex-col gap-2">
            <p className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_GROUP_STYLES[group.status] || "bg-muted text-muted-foreground"}`}>
              {group.status} ({group.rows.length})
            </p>
            {group.rows.map((d) => (
              <DeliverableCard
                key={d.id}
                d={d}
                isAdminView={isAdminView}
                onEdit={onEdit}
                onDelete={onDelete}
                onInlineUpdate={onInlineUpdate}
                people={people}
                showProject={showProject}
                clickable={rowsClickable}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Desktop / tablet: full table. */}
      <Card className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {showProject && <TableHead>Project</TableHead>}
              <TableHead>Deliverable</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Deadline</TableHead>
              {isAdminView && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.map((group) => (
              <Fragment key={group.status}>
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={
                      (showProject ? 1 : 0) + 4 + (isAdminView ? 1 : 0)
                    }
                    className={`py-1.5 text-xs font-semibold uppercase tracking-wide ${STATUS_GROUP_STYLES[group.status] || "bg-muted text-muted-foreground"}`}
                  >
                    {group.status} ({group.rows.length})
                  </TableCell>
                </TableRow>
                {group.rows.map((d) => {
                  const canEditInline = isAdminView && !!onInlineUpdate;
                  const updates = (d.updates || []).length
                    ? [...d.updates].sort((a, b) => new Date(b.at) - new Date(a.at))
                    : [];
                  const isExpanded = expandedRows.has(d.id);
                  return (
                    <Fragment key={d.id}>
                    <TableRow
                      className={rowsClickable ? "cursor-pointer" : ""}
                      onClick={() => rowsClickable && onEdit(d)}
                    >
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
                          {updates.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(d.id);
                              }}
                              className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground hover:text-accent"
                            >
                              <MessageSquare className="h-3 w-3" />
                              {updates.length}
                            </button>
                          )}
                        </div>
                      </TableCell>
                      {canEditInline ? (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <AssigneeSelect
                            value={d.assignedUid}
                            people={people}
                            onChange={(patch) => onInlineUpdate(d, patch)}
                            className="w-[9.5rem]"
                          />
                        </TableCell>
                      ) : (
                        <TableCell className="text-muted-foreground">{d.assignedName || "Unassigned"}</TableCell>
                      )}
                      <InlineDateCell
                        value={d.startDate}
                        editable={canEditInline}
                        onChange={(v) => onInlineUpdate(d, { startDate: v })}
                      />
                      <InlineDateCell
                        value={d.endDate}
                        editable={canEditInline}
                        onChange={(v) => onInlineUpdate(d, { endDate: v })}
                      />
                      <InlineDateCell
                        value={d.deadline}
                        editable={canEditInline}
                        onChange={(v) => onInlineUpdate(d, { deadline: v })}
                      />
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
                    {isExpanded && updates.length > 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={(showProject ? 1 : 0) + 4 + (isAdminView ? 1 : 0)}
                          className="bg-muted/40"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-col gap-1.5 border-l-2 border-border py-1 pl-2.5">
                            {updates.map((u, i) => (
                              <div key={i} className="text-xs">
                                <span className="font-medium text-foreground">{u.byName || "Someone"}</span>
                                <span className="text-muted-foreground"> · {fmtDate(u.at)}{u.status ? ` · moved to ${u.status}` : ""}</span>
                                <p className="text-muted-foreground">{u.text}</p>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

/**
 * Combines the events an employee is on (team-based, via
 * getEventsForEmployee) with events belonging to any project where they
 * have a deliverable assigned — even if they were never added to that
 * event's team. The latter is what lets an editor/album-designer log
 * storage for a project's events, matching the
 * isDeliverableAssigneeOfProject() firestore.rules allowance. Falls back
 * to [] per-project on a permission error so one stale/misconfigured
 * project doesn't block the rest of the list from loading.
 */
async function getMyEventsIncludingDeliverableProjects(uid, teamEvents, deliverables) {
  const teamProjectIds = new Set((teamEvents || []).map((e) => e.projectId));
  const extraProjectIds = Array.from(
    new Set((deliverables || []).map((d) => d.projectId).filter((id) => id && !teamProjectIds.has(id)))
  );
  if (extraProjectIds.length === 0) return teamEvents || [];

  const extraEventLists = await Promise.all(
    extraProjectIds.map((projectId) =>
      getEventsForProject(projectId).catch((err) => {
        console.error(`Failed to load events for project ${projectId}:`, err);
        return [];
      })
    )
  );
  const seen = new Set((teamEvents || []).map((e) => e.id));
  const extraEvents = extraEventLists.flat().filter((e) => !seen.has(e.id));
  return [...(teamEvents || []), ...extraEvents];
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
  const [expandedUpdateIds, setExpandedUpdateIds] = useState(() => new Set());
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
        setMyEvents(await getMyEventsIncludingDeliverableProjects(user.uid, evs, mine));
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

  async function handleInlineDeliverableUpdate(d, patch) {
    // Optimistic local update so the row doesn't flicker/reset while the
    // write is in flight, then reconcile with a real reload.
    setProjectDeliverables((prev) => prev.map((row) => (row.id === d.id ? { ...row, ...patch } : row)));
    try {
      await updateDeliverable(d.projectId, d.id, patch);
      if (isAdminView) loadOrgData();
    } catch (err) {
      toast.error(err.message || "Failed to update deliverable");
      // Roll back on failure.
      setProjectDeliverables((prev) => prev.map((row) => (row.id === d.id ? d : row)));
    }
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
        setMyEvents(await getMyEventsIncludingDeliverableProjects(user.uid, evs, mine));
      } catch (err) {
        console.error("Failed to reload your data:", err);
      } finally {
        setLoading(false);
      }
    }
    const myEntriesByKey = new Map();
    myStorageEntries.forEach((entry) => myEntriesByKey.set(`${entry.eventId}_${entry.memberUid}`, entry));
    const pendingStorageCount = myEvents.filter((ev) => !myEntriesByKey.has(`${ev.id}_${user.uid}`)).length;

    return (
      <AppShell>
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-foreground sm:text-2xl">Post-Production</h2>
            <p className="text-sm text-muted-foreground">Tap a deliverable to update its status or add a note.</p>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <Card>
              <CardContent className="p-4 sm:p-5">
                <SectionHeader
                  icon={ClipboardList}
                  title="Your deliverables"
                  count={myDeliverables.length}
                  description="Tap one to update its status or leave a note for the team."
                />
                {myDeliverables.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                    No deliverables assigned to you yet.
                  </div>
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
              </CardContent>
            </Card>

            {/* Storage logging is offered to anyone with something to log
                it against — either a deliverable assigned to them
                (anywhere), or an event team assignment (myEvents already
                includes both: team-based events from getEventsForEmployee,
                plus events from any project they have a deliverable on,
                merged in getMyEventsIncludingDeliverableProjects). Someone
                with neither has no event to log storage for, so the whole
                log + history section stays hidden rather than showing an
                empty/disabled state. */}
            {(myDeliverables.length > 0 || myEvents.length > 0 || myStorageEntries.length > 0) && (
              <>
                <Card>
                  <CardContent className="p-4 sm:p-5">
                    <SectionHeader
                      icon={HardDrive}
                      title="Your storage log"
                      count={pendingStorageCount}
                      description="Events still waiting on your cards/backups being logged."
                    />
                    <MyStorageLogList
                      events={myEvents}
                      user={user}
                      entriesByKey={myEntriesByKey}
                      onLogStorage={(ev, member) => setStorageContext({ event: ev, member })}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 sm:p-5">
                    <SectionHeader
                      icon={History}
                      title="Storage history"
                      count={myStorageEntries.length}
                      description="Everything you've logged, including for events you're no longer assigned to."
                    />
                    <StorageHistoryList
                      entries={myStorageEntries}
                      onView={(entry) =>
                        setStorageContext({
                          event: {
                            id: entry.eventId,
                            eventName: entry.eventName,
                            projectId: entry.projectId,
                            projectName: entry.projectName,
                            clientName: entry.clientName,
                            eventStartDate: entry.date,
                          },
                          member: { uid: entry.memberUid, name: entry.memberName, role: entry.memberRole },
                          existingEntry: entry,
                        })
                      }
                    />
                  </CardContent>
                </Card>
              </>
            )}
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
                  <div className="max-h-96 overflow-x-auto overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead>Deliverable</TableHead>
                          <TableHead>Assigned To</TableHead>
                          <TableHead>Message</TableHead>
                          <TableHead>Deadline</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {openDeliverables.map((d) => {
                          const updates = (d.updates || []).length
                            ? [...d.updates].sort((a, b) => new Date(b.at) - new Date(a.at))
                            : [];
                          const latestUpdate = updates[0] || null;
                          const extraCount = Math.max(updates.length - 1, 0);
                          const isExpanded = expandedUpdateIds.has(d.id);
                          const message = latestUpdate?.text || d.instructions || "";
                          return (
                            <TableRow key={d.id}>
                              <TableCell className="text-foreground">{d.clientName || d.projectName}</TableCell>
                              <TableCell className="text-muted-foreground">{d.type}</TableCell>
                              <TableCell className={d.assignedName ? "text-foreground" : "text-muted-foreground"}>{d.assignedName || "Unassigned"}</TableCell>
                              <TableCell className="max-w-[260px] whitespace-normal break-words text-muted-foreground">
                                {message ? (
                                  <div>
                                    <span className="inline-flex items-start gap-1">
                                      {latestUpdate ? (
                                        <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                      ) : (
                                        <FileText className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                                      )}
                                      <span>
                                        {latestUpdate?.byName && (
                                          <span className="font-medium text-foreground">{latestUpdate.byName}: </span>
                                        )}
                                        {message}
                                      </span>
                                    </span>
                                    {extraCount > 0 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedUpdateIds((prev) => {
                                            const next = new Set(prev);
                                            next.has(d.id) ? next.delete(d.id) : next.add(d.id);
                                            return next;
                                          })
                                        }
                                        className="mt-1 block text-xs font-medium text-accent hover:underline"
                                      >
                                        {isExpanded ? "Hide earlier updates" : `+${extraCount} more update${extraCount === 1 ? "" : "s"}`}
                                      </button>
                                    )}
                                    {isExpanded && (
                                      <div className="mt-1.5 flex flex-col gap-1.5 border-l-2 border-border pl-2">
                                        {updates.slice(1).map((u, i) => (
                                          <div key={i} className="text-xs">
                                            <span className="font-medium text-foreground">{u.byName || "Someone"}</span>
                                            <span className="text-muted-foreground"> · {fmtDate(u.at)}{u.status ? ` · moved to ${u.status}` : ""}</span>
                                            <p className="text-muted-foreground">{u.text}</p>
                                          </div>
                                        ))}
                                        {d.instructions && (
                                          <div className="text-xs">
                                            <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                                              <FileText className="h-3 w-3" /> Instructions
                                            </span>
                                            <p className="text-muted-foreground">{d.instructions}</p>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{fmtDate(d.deadline)}</TableCell>
                            </TableRow>
                          );
                        })}
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
                      onInlineUpdate={handleInlineDeliverableUpdate}
                      people={people}
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