"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  createLead,
  getAllLeads,
  updateLeadStatus,
  deleteLead,
} from "@/lib/firebase/leads";
import { LEAD_STATUSES, PROJECT_TYPES, LEAD_SOURCES } from "@/lib/constants/leads";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import Link from "next/link";
import { Trash2 } from "lucide-react";

function LeadsContent() {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [search, setSearch] = useState("");

  // Note: dropped the unused `discussionNotes` field — it was collected
  // in state but never actually shown as an input, just dead weight.
  // `meetingNotes` (labeled "Notes" in the UI) covers this.
  const [form, setForm] = useState({
    clientName: "",
    contactDetails: "",
    projectType: "Wedding",
    source: "Referral",
    meetingNotes: "",
    budget: "",
    requirements: "",
    meetingDate: "",
    followUpDate: "",
  });

  async function loadLeads() {
    setLoading(true);
    const list = await getAllLeads();
    setLeads(list);
    setLoading(false);
  }

  useEffect(() => {
    loadLeads();
  }, []);

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await createLead(
        { ...form, budget: Number(form.budget) || 0 },
        user.uid
      );
      toast.success("Lead created");
      setDialogOpen(false);
      setShowMoreFields(false);
      setForm({
        clientName: "",
        contactDetails: "",
        projectType: "Wedding",
        source: "Referral",
        meetingNotes: "",
        budget: "",
        requirements: "",
        meetingDate: "",
        followUpDate: "",
      });
      loadLeads();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(lead, status) {
    try {
      await updateLeadStatus(lead.id, status);
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, status } : l))
      );
      toast.success("Status updated");
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete(lead) {
    setDeletingId(lead.id);
    try {
      await deleteLead(lead.id);
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
      toast.success("Lead deleted");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  function isOverdue(lead) {
    return (
      lead.followUpDate &&
      lead.followUpDate < today &&
      lead.status !== "Won" &&
      lead.status !== "Lost"
    );
  }

  const filteredLeads = leads
    .filter((l) => statusFilter === "All" || l.status === statusFilter)
    .filter((l) => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return (
        l.clientName?.toLowerCase().includes(term) ||
        l.contactDetails?.toLowerCase().includes(term)
      );
    })
    // Overdue follow-ups float to the top so nothing slips through.
    .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)));

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">Leads</h2>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setShowMoreFields(false);
          }}
        >
          <DialogTrigger className="inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:w-auto">
            Add Lead
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] w-[95vw] max-w-md overflow-y-auto sm:w-full">
            <DialogHeader>
              <DialogTitle>New Lead</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <Label htmlFor="clientName">Client Name</Label>
                <Input
                  id="clientName"
                  value={form.clientName}
                  onChange={(e) => updateForm("clientName", e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="contactDetails">Contact Details</Label>
                <Input
                  id="contactDetails"
                  value={form.contactDetails}
                  onChange={(e) => updateForm("contactDetails", e.target.value)}
                  placeholder="Phone / Email"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Project Type</Label>
                  <Select value={form.projectType} onValueChange={(v) => updateForm("projectType", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROJECT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Source</Label>
                  <Select value={form.source} onValueChange={(v) => updateForm("source", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Budget, dates, requirements, and notes are all optional —
                  collapsed by default so a quick lead capture (name + contact,
                  the only two required fields) is 4 fields instead of 9. */}
              {showMoreFields ? (
                <>
                  <div>
                    <Label htmlFor="budget">Budget</Label>
                    <Input
                      id="budget"
                      type="number"
                      min="0"
                      value={form.budget}
                      onChange={(e) => updateForm("budget", e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="meetingDate">Meeting Date</Label>
                      <Input
                        id="meetingDate"
                        type="date"
                        value={form.meetingDate}
                        onChange={(e) => updateForm("meetingDate", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="followUpDate">Follow-up Date</Label>
                      <Input
                        id="followUpDate"
                        type="date"
                        value={form.followUpDate}
                        onChange={(e) => updateForm("followUpDate", e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="requirements">Requirements</Label>
                    <Textarea
                      id="requirements"
                      value={form.requirements}
                      onChange={(e) => updateForm("requirements", e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="meetingNotes">Notes</Label>
                    <Textarea
                      id="meetingNotes"
                      value={form.meetingNotes}
                      onChange={(e) => updateForm("meetingNotes", e.target.value)}
                      rows={3}
                    />
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowMoreFields(true)}
                  className="text-left text-xs font-medium text-slate-500 hover:text-slate-800"
                >
                  + Add budget, dates, requirements, notes (optional)
                </button>
              )}

              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create Lead"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by client name or contact..."
          className="max-w-sm"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={statusFilter === "All" ? "default" : "secondary"}
          onClick={() => setStatusFilter("All")}
        >
          All
        </Button>
        {LEAD_STATUSES.map((status) => (
          <Button
            key={status}
            size="sm"
            variant={statusFilter === status ? "default" : "secondary"}
            onClick={() => setStatusFilter(status)}
          >
            {status}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading leads...</p>
      ) : filteredLeads.length === 0 ? (
        <p className="text-sm text-slate-500">No leads found.</p>
      ) : (
        <div className="grid gap-3">
          {filteredLeads.map((lead) => (
            <Card key={lead.id} className={isOverdue(lead) ? "border-red-300 bg-red-50/40" : ""}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:underline">
                    {lead.clientName}
                  </Link>
                  <p className="truncate text-xs text-slate-500">
                    {lead.projectType} · {lead.source} · ₹{lead.budget || 0}
                  </p>
                  {lead.followUpDate && (
                    <p className={`text-xs ${isOverdue(lead) ? "font-medium text-red-600" : "text-slate-500"}`}>
                      {isOverdue(lead) ? "Follow-up overdue: " : "Follow-up: "}
                      {lead.followUpDate}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={lead.status} />
                  <Select value={lead.status} onValueChange={(v) => handleStatusChange(lead, v)}>
                    <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="icon-sm">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitleEl>Delete {lead.clientName}?</AlertDialogTitleEl>
                        <AlertDialogDescription>
                          This permanently removes this lead. Any quotations linked to it are not deleted. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(lead)}
                          disabled={deletingId === lead.id}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {deletingId === lead.id ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export default function LeadsPage() {
  return (
    <ProtectedRoute allowedRoles={["super_admin", "admin", "project_manager"]}>
      <DeviceGate>
        <LeadsContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}