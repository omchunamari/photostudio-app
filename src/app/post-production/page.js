"use client";

import { useEffect, useMemo, useState, Suspense, Fragment } from "react";
import { useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  DELIVERABLE_TYPES,
  DELIVERABLE_STATUSES,
  DEFAULT_DELIVERABLE_CATEGORIES,
  getAllDeliverables,
  addDeliverableStatusUpdate,
  ensureDeliverablesForProject,
  addDeliverable,
  updateDeliverable,
  updateDeliverableCharge,
  deleteDeliverable,
  getAllDeliverableCategories,
  addCustomDeliverableCategory,
  removeCustomDeliverableCategory,
} from "@/lib/firebase/deliverables";
import { getRateCardForEmployee, suggestCharge } from "@/lib/firebase/rateCards";
import {
  getAllStorageEntries,
  logStorageEntry,
  updateStorageEntry,
} from "@/lib/firebase/storageEntries";
import { getAllProjects } from "@/lib/firebase/projects";
import { getAllEvents, getEventsForProject } from "@/lib/firebase/events";
import { getAllEmployees } from "@/lib/firebase/employees";
import SearchableSelect from "@/components/ui/searchable-select";
import CategoryField from "@/components/CategoryField";
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
  X,
  ChevronDown,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { formatDateIST } from "@/lib/dateIST";

const STATUS_COLORS = {
  "Not Started": "oklch(0.75 0.05 75)",
  "In Progress": "oklch(0.75 0.15 75)",
  "Draft Ready": "oklch(0.75 0.15 230)",
  "Sent to Client": "oklch(0.7 0.15 290)",
  "Approval / Revision": "oklch(0.75 0.16 45)",
  "Final Done": "oklch(0.7 0.14 165)",
  Delivered: "oklch(0.65 0.14 155)",
};

// Deliverable category badge colors — fixed defaults get a stable color,
// any custom category falls back to a deterministic hash-based pick so
// it stays consistent across renders without needing to be registered
// here. Mirrors categoryColor() on the project detail page.
const DELIVERABLE_CATEGORY_COLORS = {
  Photography: "bg-sky-50 text-sky-700",
  Videography: "bg-violet-50 text-violet-700",
  Album: "bg-amber-50 text-amber-700",
  Other: "bg-slate-100 text-slate-700",
};
const FALLBACK_DELIVERABLE_CATEGORY_PALETTE = [
  "bg-rose-50 text-rose-700",
  "bg-cyan-50 text-cyan-700",
  "bg-fuchsia-50 text-fuchsia-700",
  "bg-lime-50 text-lime-700",
  "bg-orange-50 text-orange-700",
];
function categoryColor(category) {
  if (DELIVERABLE_CATEGORY_COLORS[category]) return DELIVERABLE_CATEGORY_COLORS[category];
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return FALLBACK_DELIVERABLE_CATEGORY_PALETTE[hash % FALLBACK_DELIVERABLE_CATEGORY_PALETTE.length];
}

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
  return formatDateIST(d);
}

/* ---------------------------------------------------------------------- */
/* Deliverable edit dialog                                                 */
/* ---------------------------------------------------------------------- */

/**
 * Single dialog used by both admin/PM and the assigned employee.
 * `canManage` (true for admin/PM) controls whether reassignment, dates,
 * and instructions are editable — matching what firestore.rules allows
 * each side to write. Everyone — admin and employee alike — can change
 * status and leave a dated, attributed update/message on the
 * deliverable; that always goes through addDeliverableStatusUpdate
 * (status + updates + updatedAt only), which both roles are permitted
 * to call. Management-field changes (assignedUid/dates/instructions) go
 * through the separate updateDeliverable() call and are skipped
 * entirely when canManage is false, so an employee's save can never
 * attempt a write firestore.rules would reject.
 */
function DeliverableDialog({ open, onOpenChange, deliverable, people, categories, canManage, onSaved, onAddCategory, onRemoveCategory }) {
  const { user } = useAuth();
  const [form, setForm] = useState({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggestedCharge, setSuggestedCharge] = useState(null);

  useEffect(() => {
    if (deliverable) {
      setForm({
        status: deliverable.status || DELIVERABLE_STATUSES[0],
        category: deliverable.category || DEFAULT_DELIVERABLE_CATEGORIES[DEFAULT_DELIVERABLE_CATEGORIES.length - 1],
        assignedUid: deliverable.assignedUid || "",
        startDate: deliverable.startDate || "",
        endDate: deliverable.endDate || "",
        deadline: deliverable.deadline || "",
        instructions: deliverable.instructions || "",
        charge: deliverable.charge ?? "",
        chargeNotes: deliverable.chargeNotes || "",
      });
      setNote("");
      setSuggestedCharge(null);
    }
  }, [deliverable]);

  // Look up this assignee's rate chart to suggest a charge — purely a
  // convenience fill, the admin can always override the amount.
  useEffect(() => {
    if (!canManage || !form.assignedUid) {
      setSuggestedCharge(null);
      return;
    }
    let cancelled = false;
    getRateCardForEmployee(form.assignedUid)
      .then((card) => {
        if (!cancelled) setSuggestedCharge(suggestCharge(card, deliverable?.type));
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [canManage, form.assignedUid, deliverable?.type]);

  if (!deliverable) return null;

  const history = [...(deliverable.updates || [])].sort((a, b) => new Date(b.at) - new Date(a.at));

  async function handleSave() {
    setSaving(true);
    try {
      if (canManage) {
        const person = people.find((p) => p.uid === form.assignedUid);
        await updateDeliverable(
          deliverable.projectId,
          deliverable.id,
          {
            category: form.category || "Other",
            assignedUid: form.assignedUid || null,
            assignedName: person?.name || null,
            startDate: form.startDate || null,
            endDate: form.endDate || null,
            deadline: form.deadline || null,
            instructions: form.instructions || "",
          },
          user.name
        );
        await updateDeliverableCharge(deliverable.projectId, deliverable.id, {
          charge: form.charge,
          chargeNotes: form.chargeNotes,
        });
      }
      // Status + optional message, for both roles.
      await addDeliverableStatusUpdate(deliverable.projectId, deliverable.id, {
        status: form.status,
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
          {!canManage && deliverable.projectName && (
            <p className="text-sm text-muted-foreground">{deliverable.projectName}</p>
          )}
          {!canManage && deliverable.instructions && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Instructions</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{deliverable.instructions}</p>
            </div>
          )}
          <div>
            <Label>Status</Label>
            <SearchableSelect
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              options={DELIVERABLE_STATUSES}
              searchPlaceholder="Search statuses..."
            />
          </div>

          {canManage ? (
            <CategoryField
              id="deliverableCategory"
              label="Category"
              value={form.category}
              onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              categories={categories}
              builtIns={DEFAULT_DELIVERABLE_CATEGORIES}
              onAdd={onAddCategory}
              onRemove={onRemoveCategory}
            />
          ) : (
            deliverable.category && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Category</p>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${categoryColor(deliverable.category)}`}>
                  {deliverable.category}
                </span>
              </div>
            )
          )}

          {canManage ? (
            <>
              <div>
                <Label>Assigned To</Label>
                <SearchableSelect
                  value={form.assignedUid || "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, assignedUid: v === "none" ? "" : v }))}
                  options={assigneeOptions(people)}
                  placeholder="Unassigned"
                  searchPlaceholder="Search name or role..."
                  emptyText="Nobody matches that"
                  alwaysSearch
                  renderValue={(_, v) =>
                    v === "none" || !v
                      ? "Unassigned"
                      : people.find((p) => p.uid === v)?.name || "Unassigned"
                  }
                />
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
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="mb-0">Employee Charge (₹)</Label>
                  {suggestedCharge != null && Number(form.charge) !== suggestedCharge && (
                    <button
                      type="button"
                      className="text-xs text-blue-600 underline-offset-2 hover:underline"
                      onClick={() => setForm((f) => ({ ...f, charge: suggestedCharge }))}
                    >
                      Use rate chart (₹{suggestedCharge})
                    </button>
                  )}
                </div>
                <Input
                  type="number"
                  min="0"
                  value={form.charge}
                  onChange={(e) => setForm((f) => ({ ...f, charge: e.target.value }))}
                  placeholder={suggestedCharge != null ? `Suggested ₹${suggestedCharge}` : "Enter manually"}
                />
                <Input
                  className="mt-2"
                  value={form.chargeNotes}
                  onChange={(e) => setForm((f) => ({ ...f, chargeNotes: e.target.value }))}
                  placeholder="Notes on this charge (optional)"
                />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Start</p>
                <p className="text-foreground">{fmtDate(deliverable.startDate)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">End</p>
                <p className="text-foreground">{fmtDate(deliverable.endDate)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Deadline</p>
                <p className="text-foreground">{fmtDate(deliverable.deadline)}</p>
              </div>
            </div>
          )}

          <div>
            <Label>Add an update / message (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What's the latest on this deliverable?"
              rows={3}
            />
          </div>

          {history.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Updates</Label>
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

function AddDeliverableDialog({ open, onOpenChange, project, categories, onAdded, onAddCategory, onRemoveCategory }) {
  const [type, setType] = useState("");
  const [category, setCategory] = useState(categories[0] || DEFAULT_DELIVERABLE_CATEGORIES[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType("");
      setCategory(categories[0] || DEFAULT_DELIVERABLE_CATEGORIES[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleAdd() {
    if (!type.trim()) {
      toast.error("Name this deliverable");
      return;
    }
    setSaving(true);
    try {
      await addDeliverable(project, type.trim(), category);
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
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="dtype">Name</Label>
            <Input id="dtype" value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. Teaser, Cinematic Trailer" />
          </div>
          <CategoryField
            id="dcategory"
            label="Category"
            value={category}
            onValueChange={setCategory}
            categories={categories}
            builtIns={DEFAULT_DELIVERABLE_CATEGORIES}
            onAdd={onAddCategory}
            onRemove={onRemoveCategory}
          />
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
  const [projectFile, setProjectFile] = useState("");
  const [catalogueFile, setCatalogueFile] = useState("");
  const [lightroomFile, setLightroomFile] = useState("");
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
        setProjectFile(existing.projectFile || "");
        setCatalogueFile(existing.catalogueFile || "");
        setLightroomFile(existing.lightroomFile || "");
        setCopiedBy(existing.copiedBy || "");
        setNotes(existing.notes || "");
      } else {
        setDate(context.event.eventStartDate || "");
        setCards([{ label: "", gb: "" }]);
        setMainStorage("");
        setBackupStorage("");
        setProjectFile("");
        setCatalogueFile("");
        setLightroomFile("");
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
        projectFile: projectFile.trim(),
        catalogueFile: catalogueFile.trim(),
        lightroomFile: lightroomFile.trim(),
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
      {/* Wider (max-w-3xl vs the old max-w-2xl) and more generously
          padded than a typical form dialog — this one has ten fields
          across five logical groups, and cramming that into a narrow
          column made it feel like a wall of inputs. Section labels +
          dividers below do the same job a multi-step wizard would, without
          the extra clicks. */}
      {/* sm:max-w-3xl alone doesn't beat the base Dialog's sm:max-w-md —
          twMerge only dedupes classes that share both the same responsive
          prefix AND property, and a bare `max-w-3xl` here is a different
          variant from `sm:max-w-md` on the base component, so both ended
          up in the compiled CSS and the sm: one won the cascade. Matching
          the prefix (sm:max-w-4xl) is what actually makes this wider. */}
      <DialogContent className="w-[95vw] sm:max-w-4xl p-6 sm:p-8">
        <DialogHeader className="gap-1.5">
          <DialogTitle>{existing ? "Storage Entry Details" : "Storage Entry"}</DialogTitle>
          <p className="text-sm text-muted-foreground">{event.eventName} — {member.role || "Team"}</p>
          {existing && (
            <p className="text-xs text-muted-foreground">
              Logged by {existing.loggedBy || "someone"}{existing.createdAt ? ` · ${fmtDate(existing.createdAt)}` : ""}
            </p>
          )}
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto pr-2">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Team Member</Label>
                <Input value={member.name} disabled />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cards & Data Size</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => setCards((prev) => [...prev, { label: "", gb: "" }])}>
                <Plus className="h-3.5 w-3.5" /> Add Card
              </Button>
            </div>
            <div className="flex flex-col gap-2.5">
              {cards.map((c, i) => (
                <div key={i} className="flex gap-3">
                  <Input placeholder="Card #1 (e.g. SD-04)" value={c.label} onChange={(e) => updateCard(i, "label", e.target.value)} />
                  <Input className="w-28" placeholder="GB" value={c.gb} onChange={(e) => updateCard(i, "gb", e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Storage Drives</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Main Storage</Label>
                <Input placeholder="Drive #1 (e.g. WD-001)" value={mainStorage} onChange={(e) => setMainStorage(e.target.value)} />
              </div>
              <div>
                <Label>Backup Storage</Label>
                <Input placeholder="Backup #1 (e.g. SEA-002)" value={backupStorage} onChange={(e) => setBackupStorage(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">File References</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Project File</Label>
                <Input placeholder="e.g. Project.ppj" value={projectFile} onChange={(e) => setProjectFile(e.target.value)} />
              </div>
              <div>
                <Label>Catalogue File</Label>
                <Input placeholder="e.g. Catalogue.ptf" value={catalogueFile} onChange={(e) => setCatalogueFile(e.target.value)} />
              </div>
              <div>
                <Label>Lightroom File</Label>
                <Input placeholder="e.g. Session.lrcat" value={lightroomFile} onChange={(e) => setLightroomFile(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-border pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attribution & Notes</p>
            <div>
              <Label>Copied By</Label>
              <Input placeholder="Name of person who copied the data" value={copiedBy} onChange={(e) => setCopiedBy(e.target.value)} />
            </div>
            <div>
              <Label>Notes — optional</Label>
              <Textarea placeholder="e.g. Card was formatted early — recovered from backup." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
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

function StorageEventList({ events, entriesByKey, onLogStorage, onViewStorage, loggedMembersByEventId, currentUser, emptyMessage = "No events found." }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {events.map((ev) => {
        const day = ev.eventStartDate ? new Date(ev.eventStartDate) : null;

        // Rows are no longer a checklist against the event's crew or
        // deliverable assignees — this used to pre-populate one row per
        // team member and flag every one who hadn't logged yet as "not
        // received", which read as an obligation list rather than a log.
        // Now a row only exists once someone has actually logged
        // something: it's a record of what's come in, not a roster of
        // who owes what.
        const members = loggedMembersByEventId?.get(ev.id) || [];
        const alreadyLogged = currentUser && members.some((m) => m.uid === currentUser.uid);

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
                <span className="shrink-0 text-xs text-muted-foreground">
                  {members.length === 0
                    ? "Nothing logged yet"
                    : `${members.length} ${members.length === 1 ? "person" : "people"} logged`}
                </span>
              </div>

              {members.length > 0 && (
                <div className="mb-3 flex flex-col gap-2">
                  {members.map((m) => {
                    const entries = entriesByKey.get(`${ev.id}_${m.uid}`) || [];
                    return (
                      <div
                        key={m.uid}
                        className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5"
                      >
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <AvatarInitials name={m.name} size="sm" className="h-6 w-6 shrink-0 text-[10px]" />
                            <span className="truncate text-sm text-foreground">{m.name}</span>
                            {m.role && <span className="shrink-0 text-xs text-muted-foreground">{m.role}</span>}
                          </div>
                          <Button size="sm" variant="secondary" className="w-full sm:w-auto" onClick={() => onLogStorage(ev, m)}>
                            + Log Storage
                          </Button>
                        </div>
                        <div className="flex flex-col gap-1 pl-8">
                          {entries.map((entry) => (
                            <button
                              key={entry.id}
                              type="button"
                              className="self-start truncate text-xs text-emerald-700 underline-offset-2 hover:underline"
                              onClick={() => onViewStorage(ev, m, entry)}
                            >
                              {entry.mainStorage}{entry.backupStorage ? ` · backup ${entry.backupStorage}` : ""} — logged by {entry.loggedBy || "someone"}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Self-service entry point — you log your own storage
                  under your own name. No roster, no "not received yet"
                  pressure: this is just how any employee, on any project,
                  logs a handoff, whether or not they're formally assigned
                  to it. Hidden once you've already logged here, since
                  your own row above already has a "+ Log Storage" button
                  for a second entry if you need one. */}
              {currentUser && !alreadyLogged && (
                <button
                  type="button"
                  onClick={() => onLogStorage(ev, { uid: currentUser.uid, name: currentUser.name, role: currentUser.role })}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-left text-sm text-muted-foreground transition hover:border-accent hover:text-accent"
                >
                  <span className="flex items-center gap-2">
                    <AvatarInitials name={currentUser.name} size="sm" className="h-6 w-6 shrink-0 text-[10px]" />
                    Log your own storage for this event
                  </span>
                  <span className="shrink-0 font-medium">+ Log Storage</span>
                </button>
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
  "Not Started": "bg-amber-50 text-amber-700",
  "In Progress": "bg-blue-50 text-blue-700",
  "Draft Ready": "bg-sky-50 text-sky-700",
  "Sent to Client": "bg-violet-50 text-violet-700",
  "Approval / Revision": "bg-orange-50 text-orange-700",
  "Final Done": "bg-teal-50 text-teal-700",
  Delivered: "bg-emerald-50 text-emerald-700",
};

const STATUS_DOT_STYLES = {
  "Not Started": "bg-amber-500",
  "In Progress": "bg-blue-500",
  "Draft Ready": "bg-sky-500",
  "Sent to Client": "bg-violet-500",
  "Approval / Revision": "bg-orange-500",
  "Final Done": "bg-teal-500",
  Delivered: "bg-emerald-500",
};

function personLabel(uid, people) {
  if (!uid) return "Unassigned";
  const p = people.find((p) => p.uid === uid);
  return p ? `${p.name}${p.isFreelancer ? " (Freelancer)" : ""}` : "Unassigned";
}

/**
 * Option list for every "who's doing this" picker on this page, split into
 * Staff / Freelancers headings with the person's role or skill on the hint
 * line — so searching "editor" or "album" finds the right people even when
 * you can't remember the name. Always leads with an explicit Unassigned.
 */
function assigneeOptions(people) {
  return [
    { value: "none", label: "Unassigned" },
    ...people
      .filter((p) => !p.isFreelancer)
      .map((p) => ({ value: p.uid, label: p.name, hint: p.role, group: "Staff" })),
    ...people
      .filter((p) => p.isFreelancer)
      .map((p) => ({
        value: p.uid,
        label: p.name,
        hint: `${p.role} · freelancer`,
        group: "Freelancers",
      })),
  ];
}

/**
 * Assignee dropdown shared by the desktop table and mobile cards. Renders
 * the matched person's name via the trigger's render-prop — the underlying
 * select otherwise falls back to printing the raw option `value` (the uid)
 * once selected, which is what showed ids like "8TVKTbnQGNaJ" instead of a
 * name.
 */
function AssigneeSelect({ value, people, onChange, className }) {
  return (
    <SearchableSelect
      value={value || "none"}
      onValueChange={(v) => {
        const person = people.find((p) => p.uid === v);
        onChange({
          assignedUid: v === "none" ? null : v,
          assignedName: v === "none" ? null : person?.name || null,
        });
      }}
      options={assigneeOptions(people)}
      className={cn("h-8 text-sm", className)}
      contentClassName="min-w-60"
      placeholder="Unassigned"
      searchPlaceholder="Search name or role..."
      emptyText="Nobody matches that"
      alwaysSearch
      renderValue={(_, v) => (v === "none" || !v ? "Unassigned" : personLabel(v, people))}
    />
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
            <button
              type="button"
              title={updates.length > 0 ? "View updates / add a message" : "Add a message"}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(d);
              }}
              className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground hover:text-accent"
            >
              <MessageSquare className="h-3 w-3" />
              {updates.length > 0 && updates.length}
            </button>
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

      <div className="mt-3 flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
          {canEditInline ? (
            <SearchableSelect
              value={d.status}
              onValueChange={(v) => onInlineUpdate(d, { status: v })}
              options={DELIVERABLE_STATUSES}
              className="w-full"
              searchPlaceholder="Search statuses..."
            />
          ) : (
            <p className="text-sm text-foreground">{d.status}</p>
          )}
        </div>
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

/** Category-wise deliverables table. Instead of a select-box filter that
 *  hides every other category, this renders one collapsible ("dropdown")
 *  section per category — each with its own status-grouped table inside —
 *  so all categories stay reachable at a glance and can be expanded/
 *  collapsed individually. */
function DeliverablesByCategoryTable({
  deliverables,
  categoryOrder = [],
  isAdminView,
  onEdit,
  onDelete,
  onInlineUpdate,
  people = [],
  showProject = false,
  rowsClickable = false,
  emptyMessage = "No deliverables yet.",
}) {
  const categories = useMemo(() => {
    const present = new Set(deliverables.map((d) => d.category).filter(Boolean));
    const ordered = categoryOrder.filter((c) => present.has(c));
    const extra = Array.from(present).filter((c) => !categoryOrder.includes(c)).sort();
    const all = [...ordered, ...extra];
    if (deliverables.some((d) => !d.category)) all.push("Uncategorized");
    return all;
  }, [deliverables, categoryOrder]);

  const [openCategories, setOpenCategories] = useState(() => new Set());

  function toggleCategory(c) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  if (deliverables.length === 0) {
    return (
      <Card>
        <div className="p-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {categories.map((c) => {
        const rows = deliverables.filter((d) => (d.category || "Uncategorized") === c);
        const isOpen = openCategories.has(c);
        return (
          <Card key={c} className="overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCategory(c)}
              className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${c === "Uncategorized" ? "bg-muted text-muted-foreground" : categoryColor(c)}`}>
                  {c}
                </span>
                <span className="text-xs text-muted-foreground">
                  {rows.length} deliverable{rows.length === 1 ? "" : "s"}
                </span>
              </div>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="border-t px-0 pb-0 pt-0">
                <DeliverablesTable
                  deliverables={rows}
                  isAdminView={isAdminView}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onInlineUpdate={onInlineUpdate}
                  people={people}
                  showProject={showProject}
                  rowsClickable={rowsClickable}
                  emptyMessage={emptyMessage}
                  bare
                />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function DeliverablesByEventDateTable({
  rows, // [{ ...deliverable, eventDate }]
  isAdminView,
  onEdit,
  onDelete,
  onInlineUpdate,
  people = [],
}) {
  const groups = useMemo(() => {
    const byDate = new Map();
    rows.forEach((d) => {
      const key = d.eventDate || "No event date";
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(d);
    });
    return Array.from(byDate.entries())
      .sort(([a], [b]) => {
        if (a === "No event date") return 1;
        if (b === "No event date") return -1;
        return a < b ? -1 : a > b ? 1 : 0;
      });
  }, [rows]);

  const [openDates, setOpenDates] = useState(() => new Set());
  function toggleDate(k) {
    setOpenDates((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  }

  if (rows.length === 0) {
    return <Card><div className="p-6 text-center text-sm text-muted-foreground">No deliverables in this range.</div></Card>;
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map(([dateKey, dRows]) => {
        const isOpen = openDates.has(dateKey);
        return (
          <Card key={dateKey} className="overflow-hidden">
            <button
              type="button"
              onClick={() => toggleDate(dateKey)}
              className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {dateKey === "No event date" ? dateKey : fmtDate(dateKey)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {dRows.length} deliverable{dRows.length === 1 ? "" : "s"}
                </span>
              </div>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="border-t px-0 pb-0 pt-0">
                <DeliverablesTable
                  deliverables={dRows}
                  isAdminView={isAdminView}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onInlineUpdate={onInlineUpdate}
                  people={people}
                  showProject
                  rowsClickable
                  bare
                />
              </div>
            )}
          </Card>
        );
      })}
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
  emptyMessage = "No deliverables yet.",
  bare = false,
}) {
  const grouped = DELIVERABLE_STATUSES.map((status) => ({
    status,
    rows: deliverables.filter((d) => d.status === status),
  })).filter((g) => g.rows.length > 0);

  if (deliverables.length === 0) {
    return bare ? (
      <div className="p-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
    ) : (
      <Card>
        <div className="p-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
      </Card>
    );
  }

  return (
    <>
      {/* Mobile: stacked cards grouped by status. Tables don't reflow well
            on narrow screens — six columns of dates/selects just get
            crushed — so below md we swap to a card-per-deliverable layout
            instead of forcing horizontal scroll. */}
      <div className={`flex flex-col gap-4 md:hidden ${bare ? "p-3" : ""}`}>
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
      <div className={`hidden overflow-x-auto md:block ${bare ? "" : "rounded-xl border bg-card"}`}>
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
            {grouped.map((group) => (
              <Fragment key={group.status}>
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={
                      (showProject ? 1 : 0) + 5 + (isAdminView ? 1 : 0)
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
                            <button
                              type="button"
                              title={updates.length > 0 ? "View updates / add a message" : "Add a message"}
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(d);
                              }}
                              className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground hover:text-accent"
                            >
                              <MessageSquare className="h-3 w-3" />
                              {updates.length > 0 && updates.length}
                            </button>
                          </div>
                        </TableCell>
                        {canEditInline ? (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <SearchableSelect
                              value={d.status}
                              onValueChange={(v) => onInlineUpdate(d, { status: v })}
                              options={DELIVERABLE_STATUSES}
                              className="w-[9.5rem]"
                              searchPlaceholder="Search statuses..."
                            />
                          </TableCell>
                        ) : (
                          <TableCell>
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_GROUP_STYLES[d.status] || "bg-muted text-muted-foreground"}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_STYLES[d.status] || "bg-muted-foreground"}`} />
                              {d.status}
                            </span>
                          </TableCell>
                        )}
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
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* Main content                                                            */
/* ---------------------------------------------------------------------- */

function PostProductionContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  // Deep link from a project's "Post-Production" button
  // (`/post-production?projectId=...`). Read once on mount rather than
  // reactively — after that, clicking between projects in the picker
  // should drive the view, not the URL falling back to a stale param.
  const deepLinkedProjectId = useMemo(() => searchParams.get("projectId") || "", []);
  // Mirrors isProjectOps() in firestore.rules: only these roles may
  // reassign deliverables, edit dates, or delete — everyone else gets a
  // read-only view plus status/message updates via the dialog.
  const isAdminView = ["super_admin", "admin", "project_manager"].includes(user.role);

  // A deep-linked project always lands on the Projects tab, where the
  // detail view actually lives — regardless of which tab a plain visit
  // would otherwise default to.
  const [mainTab, setMainTab] = useState(
    deepLinkedProjectId ? "projects" : isAdminView ? "overview" : "projects"
  ); // overview | projects | storage
  const [projectSubTab, setProjectSubTab] = useState("deliverables"); // deliverables | storage
  const fyOptions = useMemo(() => getFinancialYearOptions(), []);
  const [fy, setFy] = useState(fyOptions[0].value);
  // Independent date-range filter for the "by event date" breakdown
  // below — separate from the FY selector so admins can zoom into a
  // specific shoot window without losing the FY-scoped stats above.
  const [evDateFrom, setEvDateFrom] = useState("");
  const [evDateTo, setEvDateTo] = useState("");

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [events, setEvents] = useState([]);
  const [allDeliverables, setAllDeliverables] = useState([]);
  const [allStorageEntries, setAllStorageEntries] = useState([]);
  const [people, setPeople] = useState([]);

  const [selectedProjectId, setSelectedProjectId] = useState(deepLinkedProjectId);
  const [projectSearch, setProjectSearch] = useState("");
  const [storageSearch, setStorageSearch] = useState("");
  const [projectDeliverables, setProjectDeliverables] = useState([]);
  const [projectEvents, setProjectEvents] = useState([]);

  const [editingDeliverable, setEditingDeliverable] = useState(null);
  const [expandedUpdateIds, setExpandedUpdateIds] = useState(() => new Set());
  const [addDeliverableOpen, setAddDeliverableOpen] = useState(false);
  const [deliverableCategories, setDeliverableCategories] = useState(DEFAULT_DELIVERABLE_CATEGORIES);
  const [storageContext, setStorageContext] = useState(null);

  async function loadDeliverableCategories() {
    try {
      const cats = await getAllDeliverableCategories();
      setDeliverableCategories(cats);
    } catch (err) {
      toast.error(err.message || "Failed to load deliverable categories");
    }
  }

  // Passed into CategoryField wherever a deliverable's category is
  // edited (the deliverable dialog, the Add Deliverable dialog). Adding
  // or removing refreshes the shared deliverableCategories list, since
  // categories are org-wide (orgSettings/main) and both dialogs read
  // from the same state.
  async function handleAddDeliverableCategory(name) {
    const result = await addCustomDeliverableCategory(name);
    await loadDeliverableCategories();
    return result;
  }
  async function handleRemoveDeliverableCategory(name) {
    await removeCustomDeliverableCategory(name);
    await loadDeliverableCategories();
  }

  // `silent` skips the setLoading(true)/(false) toggle — used for every
  // refresh after the initial mount, so a background re-fetch (after an
  // inline edit, dialog save, delete, etc.) doesn't blank the whole tab
  // out to "Loading..." and unmount things like the deliverables'
  // collapsed/expanded category state.
  async function loadOrgData({ silent = false } = {}) {
    if (!silent) setLoading(true);
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

      if (isAdminView) await loadDeliverableCategories();
    } catch (err) {
      console.error("Failed to load post-production data:", err);
      toast.error(err.message || "Failed to load post-production data");
    } finally {
      if (!silent) setLoading(false);
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
      pending: rows.filter((d) => d.status === "Not Started").length,
      inProgress: rows.filter((d) => !["Not Started", "Delivered"].includes(d.status)).length,
      done: rows.filter((d) => d.status === "Delivered").length,
    };
  });

  // Event-wise: any number of entries can exist per (event, member) —
  // multiple people can log storage for the same member/event, so this
  // maps to an array, not a single entry.
  const entriesByKey = useMemo(() => {
    const m = new Map();
    allStorageEntries.forEach((entry) => {
      const key = `${entry.eventId}_${entry.memberUid}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(entry);
    });
    return m;
  }, [allStorageEntries]);

  // Reconstructs who's been logged for, per event, from the entries
  // themselves — every row in the Storage view now comes from here (see
  // the "no roster" note on StorageEventList below), so this map IS the
  // row list, not just a fallback for one edge case.
  const loggedMembersByEventId = useMemo(() => {
    const m = new Map();
    allStorageEntries.forEach((entry) => {
      if (!m.has(entry.eventId)) m.set(entry.eventId, new Map());
      const inner = m.get(entry.eventId);
      if (!inner.has(entry.memberUid)) {
        inner.set(entry.memberUid, {
          uid: entry.memberUid,
          name: entry.memberName || "—",
          role: entry.memberRole || "",
        });
      }
    });
    const out = new Map();
    m.forEach((inner, eventId) => out.set(eventId, [...inner.values()]));
    return out;
  }, [allStorageEntries]);

  // Org-wide Storage tab search: across every event in the selected FY,
  // not just the currently-open project, so it needs its own filter to
  // avoid being a long scroll through every shoot the studio has ever
  // done. Matches the event/project/client name, or anyone who's already
  // logged something for that event — handy for "did Girish log his card
  // for anything yet" style lookups.
  const storageSearchResults = useMemo(() => {
    const term = storageSearch.trim().toLowerCase();
    if (!term) return eventsInFy;
    return eventsInFy.filter((ev) => {
      if (ev.eventName?.toLowerCase().includes(term)) return true;
      if (ev.projectName?.toLowerCase().includes(term)) return true;
      if (ev.clientName?.toLowerCase().includes(term)) return true;
      const loggedHere = loggedMembersByEventId.get(ev.id) || [];
      return loggedHere.some((m) => m.name?.toLowerCase().includes(term));
    });
  }, [eventsInFy, storageSearch, loggedMembersByEventId]);

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

  const openDeliverables = deliverablesInFy.filter((d) => d.status !== "Delivered");

  // Each deliverable's "event date" = the earliest shoot date among its
  // project's events — lets the org-wide view be filtered/grouped by
  // when the shoot actually happened, not just by FY or category.
  const projectEventDatesById = useMemo(() => {
    const m = new Map();
    events.forEach((ev) => {
      if (!ev.eventStartDate) return;
      if (!m.has(ev.projectId)) m.set(ev.projectId, []);
      m.get(ev.projectId).push(ev.eventStartDate);
    });
    m.forEach((dates) => dates.sort());
    return m;
  }, [events]);

  function eventDateForProject(projectId) {
    const dates = projectEventDatesById.get(projectId);
    return dates && dates.length ? dates[0] : null;
  }

  const deliverablesByEventDate = useMemo(() => {
    return allDeliverables
      .map((d) => ({ ...d, eventDate: eventDateForProject(d.projectId) }))
      .filter((d) => {
        if (evDateFrom && (!d.eventDate || d.eventDate < evDateFrom)) return false;
        if (evDateTo && (!d.eventDate || d.eventDate > evDateTo)) return false;
        return true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDeliverables, projectEventDatesById, evDateFrom, evDateTo]);

  const pieData = DELIVERABLE_STATUSES.map((s) => ({ name: s, value: statusCounts[s] })).filter((d) => d.value > 0);

  const filteredProjects = projects
    .filter((p) =>
      !projectSearch.trim() || p.projectName.toLowerCase().includes(projectSearch.trim().toLowerCase())
    )
    // Date-wise, soonest first — undated projects sink to the bottom
    // instead of appearing in creation order.
    .sort((a, b) => {
      if (!a.eventDate && !b.eventDate) return 0;
      if (!a.eventDate) return 1;
      if (!b.eventDate) return -1;
      return a.eventDate < b.eventDate ? -1 : a.eventDate > b.eventDate ? 1 : 0;
    });
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  async function handleDeliverableSaved() {
    if (selectedProjectId) await loadProject(selectedProjectId);
    if (isAdminView) await loadOrgData({ silent: true });
  }

  async function handleInlineDeliverableUpdate(d, patch) {
    // Optimistic local update so the row doesn't flicker/reset while the
    // write is in flight, then reconcile with a real reload.
    setProjectDeliverables((prev) => prev.map((row) => (row.id === d.id ? { ...row, ...patch } : row)));
    try {
      await updateDeliverable(d.projectId, d.id, patch, user.name);
      if (isAdminView) loadOrgData({ silent: true });
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
    if (isAdminView) await loadOrgData({ silent: true });
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">Post-Production</h2>
          <p className="text-sm text-muted-foreground">Deliverables and storage handoff, across every project.</p>
        </div>
        <SearchableSelect
          value={fy}
          onValueChange={setFy}
          options={fyOptions}
          className="w-[140px]"
        />
      </div>

      <div className="mb-6 flex gap-2">
        {isAdminView && (
          <Button variant={mainTab === "overview" ? "default" : "secondary"} onClick={() => setMainTab("overview")}>
            <BarChart3 className="h-4 w-4" /> Overview
          </Button>
        )}
        <Button variant={mainTab === "projects" ? "default" : "secondary"} onClick={() => setMainTab("projects")}>
          <Layers className="h-4 w-4" /> Projects
        </Button>
        <Button variant={mainTab === "storage" ? "default" : "secondary"} onClick={() => setMainTab("storage")}>
          <HardDrive className="h-4 w-4" /> Storage
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : mainTab === "overview" && isAdminView ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Projects</p><p className="mt-1 text-3xl font-semibold text-foreground">{projectsInFy.length}</p><p className="text-xs text-muted-foreground">in selected range</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Deliverables</p><p className="mt-1 text-3xl font-semibold text-foreground">{deliverablesInFy.length}</p><p className="text-xs text-muted-foreground">across all projects</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Open</p><p className="mt-1 text-3xl font-semibold text-amber-600">{deliverablesInFy.length - statusCounts.Delivered}</p><p className="text-xs text-muted-foreground">{statusCounts["Not Started"]} not started · {deliverablesInFy.length - statusCounts["Not Started"] - statusCounts.Delivered} in the pipeline</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Delivered</p><p className="mt-1 text-3xl font-semibold text-emerald-600">{statusCounts.Delivered}</p><p className="text-xs text-muted-foreground">{deliverablesInFy.length ? Math.round((statusCounts.Delivered / deliverablesInFy.length) * 100) : 0}% complete</p></CardContent></Card>
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
                <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      <span className="font-semibold">{storageStats.missingCount} storage {storageStats.missingCount === 1 ? "entry" : "entries"}</span> are still pending from team members.
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" className="shrink-0 text-amber-800 hover:bg-amber-100" onClick={() => setMainTab("storage")}>
                    Review
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Deliverables</p>
              <p className="mb-3 text-lg font-semibold text-foreground">Where the work stands</p>
              <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> Pending</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-400" /> In Progress</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Done</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead className="text-right">% Done</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byType.map((r) => {
                    const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
                    const pendingPct = r.total ? (r.pending / r.total) * 100 : 0;
                    const progressPct = r.total ? (r.inProgress / r.total) * 100 : 0;
                    const donePct = r.total ? (r.done / r.total) * 100 : 0;
                    return (
                      <TableRow key={r.type}>
                        <TableCell className="font-medium text-foreground">{r.type}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{r.total || "—"}</TableCell>
                        <TableCell>
                          <div className="flex h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-muted">
                            {r.total ? (
                              <>
                                <div className="h-full bg-amber-400" style={{ width: `${pendingPct}%` }} />
                                <div className="h-full bg-blue-400" style={{ width: `${progressPct}%` }} />
                                <div className="h-full bg-emerald-500" style={{ width: `${donePct}%` }} />
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{r.total ? `${pct}%` : "0%"}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow>
                    <TableCell className="font-semibold text-foreground">Total</TableCell>
                    <TableCell className="text-right font-semibold text-foreground">{deliverablesInFy.length}</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold text-foreground">—</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">In the pipeline</p>
              <p className="mb-3 text-lg font-semibold text-foreground">Who&apos;s doing what</p>
              {openDeliverables.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open deliverables. Everything in this period is delivered.</p>
              ) : (
                <div className="flex max-h-[520px] flex-col divide-y divide-border overflow-y-auto">
                  {openDeliverables.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{d.assignedName || d.clientName || d.projectName}</p>
                        <p className="truncate text-sm text-muted-foreground">{d.type}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium",
                            d.assignedName ? "bg-secondary text-secondary-foreground" : "bg-amber-50 text-amber-700"
                          )}
                        >
                          {d.assignedName || "Unassigned"}
                        </span>
                        <Button size="sm" variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => setEditingDeliverable(d)}>
                          {d.assignedName ? "Edit" : "Assign"}
                        </Button>
                      </div>
                    </div>
                  ))}
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
                    <TableCell className="text-right font-semibold text-foreground">{statusCounts["Not Started"]}</TableCell>
                    <TableCell className="text-right font-semibold text-foreground">{deliverablesInFy.length - statusCounts["Not Started"] - statusCounts.Delivered}</TableCell>
                    <TableCell className="text-right font-semibold text-foreground">{statusCounts.Delivered}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Deliverables</p>
                  <p className="text-lg font-semibold text-foreground">By event date</p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Input type="date" className="w-[140px] min-w-0" value={evDateFrom} onChange={(e) => setEvDateFrom(e.target.value)} />
                  <span className="shrink-0 text-xs text-muted-foreground">to</span>
                  <Input type="date" className="w-[140px] min-w-0" value={evDateTo} onChange={(e) => setEvDateTo(e.target.value)} />
                  {(evDateFrom || evDateTo) && (
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => { setEvDateFrom(""); setEvDateTo(""); }}>
                      <X className="h-3.5 w-3.5" /> Clear
                    </Button>
                  )}
                </div>
              </div>
              <DeliverablesByEventDateTable
                rows={deliverablesByEventDate}
                isAdminView={isAdminView}
                onEdit={(d) => setEditingDeliverable(d)}
                onDelete={handleDeleteDeliverable}
                onInlineUpdate={handleInlineDeliverableUpdate}
                people={people}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
              <p className="mb-2 text-lg font-semibold text-foreground">Split</p>
              {deliverablesInFy.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No deliverables yet</p>
              ) : (
                <div className="grid gap-6 sm:grid-cols-[220px_1fr] sm:items-center">
                  {/* min-w-0 below guards against the same 1fr overflow
                      trap even though nothing here is currently wide
                      enough to trigger it. */}
                  <div className="relative mx-auto w-full max-w-[220px]">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={100} paddingAngle={2}>
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={STATUS_COLORS[entry.name]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-3xl font-semibold text-foreground">{deliverablesInFy.length}</p>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col gap-2 text-sm">
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : mainTab === "projects" ? (
        // min-w-0 on the right pane below is load-bearing: a 1fr grid track
        // defaults to min-width:auto, so without it the track grows to fit
        // the deliverables table's intrinsic width instead of shrinking —
        // which pushes the *whole page* into horizontal scroll instead of
        // just the table (which already has its own overflow-x-auto).
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
                  className={`rounded-md border p-3 text-left transition-colors ${selectedProjectId === p.id ? "border-accent bg-accent/10" : "border-border hover:bg-muted"
                    }`}
                >
                  <p className="text-sm font-medium text-foreground">{p.projectName}</p>
                  <p className="text-xs text-muted-foreground">{p.eventDate ? fmtDate(p.eventDate) : p.clientName}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0">
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
                    {isAdminView && (
                      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                        <Button size="sm" onClick={() => setAddDeliverableOpen(true)}>
                          <Plus className="h-4 w-4" /> Add Deliverable
                        </Button>
                      </div>
                    )}
                    <DeliverablesByCategoryTable
                      deliverables={projectDeliverables}
                      categoryOrder={deliverableCategories}
                      isAdminView={isAdminView}
                      onEdit={setEditingDeliverable}
                      onDelete={handleDeleteDeliverable}
                      onInlineUpdate={handleInlineDeliverableUpdate}
                      people={people}
                      rowsClickable={!isAdminView}
                      emptyMessage="No deliverables yet."
                    />
                  </>
                ) : (
                  <StorageEventList
                    events={projectEvents}
                    entriesByKey={entriesByKey}
                    onLogStorage={(ev, member) => setStorageContext({ event: ev, member })}
                    onViewStorage={(ev, member, entry) => setStorageContext({ event: ev, member, existingEntry: entry })}
                    loggedMembersByEventId={loggedMembersByEventId}
                    currentUser={user}
                  />
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by event, project, client, or who's logged..."
              value={storageSearch}
              onChange={(e) => setStorageSearch(e.target.value)}
            />
          </div>
          {storageSearch.trim() && (
            <p className="text-xs text-muted-foreground">
              {storageSearchResults.length === eventsInFy.length
                ? `${eventsInFy.length} events`
                : `${storageSearchResults.length} of ${eventsInFy.length} events`}
            </p>
          )}
          <StorageEventList
            events={storageSearchResults}
            entriesByKey={entriesByKey}
            onLogStorage={(ev, member) => setStorageContext({ event: ev, member })}
            onViewStorage={(ev, member, entry) => setStorageContext({ event: ev, member, existingEntry: entry })}
            loggedMembersByEventId={loggedMembersByEventId}
            currentUser={user}
            emptyMessage={storageSearch.trim() ? "No events match that search." : "No events found."}
          />
        </div>
      )}

      <DeliverableDialog
        open={!!editingDeliverable}
        onOpenChange={(open) => !open && setEditingDeliverable(null)}
        deliverable={editingDeliverable}
        people={people}
        categories={deliverableCategories}
        canManage={isAdminView}
        onSaved={handleDeliverableSaved}
        onAddCategory={handleAddDeliverableCategory}
        onRemoveCategory={handleRemoveDeliverableCategory}
      />
      <AddDeliverableDialog
        open={addDeliverableOpen}
        onOpenChange={setAddDeliverableOpen}
        project={selectedProject}
        categories={deliverableCategories}
        onAdded={handleDeliverableSaved}
        onAddCategory={handleAddDeliverableCategory}
        onRemoveCategory={handleRemoveDeliverableCategory}
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