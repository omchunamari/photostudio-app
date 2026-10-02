"use client";

import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  createLead,
  getAllLeads,
  updateLeadStatus,
  updateLeadPriority,
  deleteLead,
} from "@/lib/firebase/leads";
import { getAllEmployees } from "@/lib/firebase/employees";
import {
  LEAD_STATUSES,
  PROJECT_TYPES,
  LEAD_SOURCES,
  LEAD_PRIORITIES,
} from "@/lib/constants/leads";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
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
import SearchableSelect from "@/components/ui/searchable-select";
import StatusBadge from "@/components/ui/status-badge";
import { formatDateIST } from "@/lib/dateIST";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Trash2,
  List,
  LayoutGrid,
  Download,
  Upload,
  Plus,
  Search,
  Globe,
} from "lucide-react";
import { getISTDateStr } from "@/lib/dateIST";

// Small badge marking a lead that arrived through the public enquiry form,
// so it reads apart from leads someone typed in by hand.
function FormLeadBadge({ className }) {
  return (
    <Badge
      variant="outline"
      className={`gap-1 border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)] ${className || ""}`}
    >
      <Globe data-icon="inline-start" />
      Form
    </Badge>
  );
}

const emptyForm = {
  clientName: "",
  phone: "",
  email: "",
  projectType: "",
  eventDate: "",
  eventDetails: "",
  source: "",
  budget: "",
  handledByUid: "",
  priority: "",
};

function LeadsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [employees, setEmployees] = useState([]);
  // Everyone who can be put on a lead. The "Handled By" dialog field has
  // always offered the whole staff list, so restricting the *filter* to
  // role === PROJECT_MANAGER meant leads assigned to anyone else were
  // unreachable from the filter bar. Union of all active staff and whoever
  // is already named on a lead, so historical assignments still filter even
  // if that person's role changed or they've since left.
  const salesExecutives = useMemo(() => {
    const byUid = new Map();
    employees.forEach((e) => byUid.set(e.uid, { value: e.uid, label: e.name }));
    leads.forEach((l) => {
      if (l.handledByUid && !byUid.has(l.handledByUid)) {
        byUid.set(l.handledByUid, { value: l.handledByUid, label: l.handledByName || "Unknown" });
      }
    });
    return [...byUid.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [employees, leads]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [view, setView] = useState("list"); // "list" | "grid"
  const [tab, setTab] = useState("all"); // "all" | "uncontacted" | "followups"
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all"); // "all" | one of LEAD_STATUSES
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [execFilter, setExecFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all"); // "all" | "form" | "manual"

  const [form, setForm] = useState(emptyForm);

  async function loadData() {
    setLoading(true);
    const [list, emps] = await Promise.all([getAllLeads(), getAllEmployees()]);
    setLeads(list);
    setEmployees(emps);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.clientName.trim()) {
      toast.error("Client name is required");
      return;
    }
    setSaving(true);
    try {
      const handledBy = employees.find((emp) => emp.uid === form.handledByUid);
      await createLead(
        {
          ...form,
          budget: Number(form.budget) || 0,
          handledByName: handledBy?.name || "",
        },
        user.uid,
        user.name
      );
      toast.success("Lead added");
      setDialogOpen(false);
      setForm(emptyForm);
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(lead, status) {
    try {
      await updateLeadStatus(lead.id, status);
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l)));
      toast.success("Stage updated");
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handlePriorityChange(lead, priority) {
    try {
      await updateLeadPriority(lead.id, priority);
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, priority } : l)));
      toast.success("Priority updated");
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

  function handleExport() {
    const header = ["Client Name", "Phone", "Email", "Event Type", "Tentative Event Date", "Event Details", "Quoted Amount", "Source", "Origin", "Stage", "Priority", "Handled By", "Follow Up", "Added"];
    const rows = filteredLeads.map((l) => [
      l.clientName, l.phone, l.email, l.projectType || "", l.eventDate || "",
      (l.eventDetails || "").replace(/\n/g, " "), l.budget || 0, l.source || "",
      l.origin === "form" ? "Form" : "Manual",
      l.status, l.priority || "", l.handledByName || "", l.followUpDate || "", (l.createdAt || "").slice(0, 10),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const today = getISTDateStr();
  // "Won"/"Quoted" are older stage values kept readable for leads created
  // before the pipeline changed — not closed out, so still eligible for a
  // follow-up nudge same as any other non-terminal stage.
  const CLOSED_STATUSES = ["Converted", "Lost", "No Response", "Won"];
  function isOverdue(lead) {
    return lead.followUpDate && lead.followUpDate < today && !CLOSED_STATUSES.includes(lead.status);
  }
  function isUncontacted(lead) {
    return lead.status === "New Inquiry";
  }

  const filteredLeads = useMemo(() => {
    return leads
      .filter((l) => {
        if (tab === "uncontacted") return isUncontacted(l);
        if (tab === "followups") return !!l.followUpDate && !CLOSED_STATUSES.includes(l.status);
        return true;
      })
      .filter((l) => {
        if (stageFilter === "all") return true;
        return l.status === stageFilter;
      })
      .filter((l) => priorityFilter === "all" || l.priority === priorityFilter)
      .filter((l) => sourceFilter === "all" || l.source === sourceFilter)
      .filter((l) => execFilter === "all" || l.handledByUid === execFilter)
      .filter((l) => originFilter === "all" || (originFilter === "form" ? l.origin === "form" : l.origin !== "form"))
      .filter((l) => {
        const term = search.trim().toLowerCase();
        if (!term) return true;
        return (
          l.clientName?.toLowerCase().includes(term) ||
          l.phone?.toLowerCase().includes(term) ||
          l.email?.toLowerCase().includes(term)
        );
      })
      // Overdue follow-ups float to the top so nothing slips through.
      .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)));
  }, [leads, tab, stageFilter, priorityFilter, sourceFilter, execFilter, originFilter, search]);

  return (
    <AppShell>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">Leads</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground">{leads.length}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-border">
            <button
              onClick={() => setView("list")}
              className={`flex h-9 w-9 items-center justify-center ${view === "list" ? "bg-muted" : "hover:bg-muted/50"}`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("grid")}
              className={`flex h-9 w-9 items-center justify-center border-l border-border ${view === "grid" ? "bg-muted" : "hover:bg-muted/50"}`}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" /> New Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[88vh] w-[95vw] overflow-y-auto sm:w-full sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Add New Lead</DialogTitle>
              </DialogHeader>
              {/* Laid out three-up on desktop: the whole lead fits on one
                  screen without scrolling, which is the point of the wider
                  dialog. Collapses to one column on mobile. */}
              <form onSubmit={handleCreate} className="flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-1">
                    <Label htmlFor="clientName">Client Name *</Label>
                    <Input
                      id="clientName"
                      placeholder="e.g. Rohit Verma"
                      value={form.clientName}
                      onChange={(e) => updateForm("clientName", e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      placeholder="+91... · 10-15 digits"
                      value={form.phone}
                      onChange={(e) => updateForm("phone", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@email.com"
                      value={form.email}
                      onChange={(e) => updateForm("email", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Event Type</Label>
                    <SearchableSelect
                      value={form.projectType}
                      onValueChange={(v) => updateForm("projectType", v)}
                      options={PROJECT_TYPES}
                      placeholder="Select..."
                      searchPlaceholder="Search event types..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="eventDate">Tentative Event Date</Label>
                    <Input
                      id="eventDate"
                      type="date"
                      value={form.eventDate}
                      onChange={(e) => updateForm("eventDate", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Source</Label>
                    <SearchableSelect
                      value={form.source}
                      onValueChange={(v) => updateForm("source", v)}
                      options={LEAD_SOURCES}
                      placeholder="Select..."
                      searchPlaceholder="Search sources..."
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="budget">Quoted Amount (₹)</Label>
                    <Input
                      id="budget"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={form.budget}
                      onChange={(e) => updateForm("budget", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <SearchableSelect
                      value={form.priority}
                      onValueChange={(v) => updateForm("priority", v)}
                      options={LEAD_PRIORITIES}
                      placeholder="Select..."
                    />
                  </div>
                  <div>
                    <Label>Handled By</Label>
                    <SearchableSelect
                      value={form.handledByUid}
                      onValueChange={(v) => updateForm("handledByUid", v)}
                      options={employees.map((e) => ({ value: e.uid, label: e.name, hint: e.role }))}
                      placeholder="Assign to sales exec..."
                      searchPlaceholder="Search staff..."
                      alwaysSearch
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="eventDetails">Event Details</Label>
                  <Textarea
                    id="eventDetails"
                    placeholder="Events, days, requirements... e.g. Day 1: haldi & cocktail, Day 2: wedding"
                    value={form.eventDetails}
                    onChange={(e) => updateForm("eventDetails", e.target.value)}
                    rows={4}
                  />
                </div>

                <div className="flex justify-end gap-2 border-t border-border pt-3">
                  <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Adding..." : "Add Lead"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-border">
        {[
          { id: "all", label: "All Leads" },
          { id: "uncontacted", label: "Uncontacted" },
          { id: "followups", label: "Follow Ups" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone or email..."
            className="pl-8"
          />
        </div>
        <SearchableSelect
          value={stageFilter}
          onValueChange={setStageFilter}
          options={[{ value: "all", label: "All stages" }, ...LEAD_STATUSES]}
          className="w-full sm:w-[170px]"
          searchPlaceholder="Search stages..."
        />
        <SearchableSelect
          value={priorityFilter}
          onValueChange={setPriorityFilter}
          options={[{ value: "all", label: "All priorities" }, ...LEAD_PRIORITIES]}
          className="w-full sm:w-[140px]"
        />
        <SearchableSelect
          value={sourceFilter}
          onValueChange={setSourceFilter}
          options={[{ value: "all", label: "All sources" }, ...LEAD_SOURCES]}
          className="w-full sm:w-[150px]"
          searchPlaceholder="Search sources..."
        />
        <SearchableSelect
          value={execFilter}
          onValueChange={setExecFilter}
          options={[{ value: "all", label: "All sales executives" }, ...salesExecutives]}
          className="w-full sm:w-[180px]"
          searchPlaceholder="Search sales executives..."
          alwaysSearch
        />
        <SearchableSelect
          value={originFilter}
          onValueChange={setOriginFilter}
          options={[
            { value: "all", label: "All leads" },
            { value: "form", label: "Form leads" },
            { value: "manual", label: "Manual leads" },
          ]}
          className="w-full sm:w-[150px]"
        />
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          showing {filteredLeads.length} of {leads.length} leads
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading leads...</p>
      ) : filteredLeads.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">No leads found.</CardContent>
        </Card>
      ) : view === "list" ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"><Checkbox /></TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Handled By</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Follow Up</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => (
                <TableRow
                  key={lead.id}
                  onClick={() => router.push(`/leads/${lead.id}`)}
                  className={`cursor-pointer ${isOverdue(lead) ? "bg-red-50/60" : ""}`}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}><Checkbox /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">{lead.clientName}</span>
                      {lead.origin === "form" && <FormLeadBadge />}
                    </div>
                    <p className="text-xs text-muted-foreground">{lead.phone || lead.email || "—"}</p>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <SearchableSelect
                      value={lead.status}
                      onValueChange={(v) => handleStatusChange(lead, v)}
                      options={LEAD_STATUSES}
                      className="h-7 w-auto border-none bg-transparent p-0 shadow-none"
                      contentClassName="w-56"
                      searchPlaceholder="Search stages..."
                      renderValue={() => <StatusBadge status={lead.status} />}
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <SearchableSelect
                      value={lead.priority || ""}
                      onValueChange={(v) => handlePriorityChange(lead, v)}
                      options={LEAD_PRIORITIES}
                      className="h-7 w-auto border-none bg-transparent p-0 shadow-none"
                      contentClassName="w-40"
                      renderValue={() =>
                        lead.priority ? (
                          <StatusBadge status={lead.priority} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{lead.source || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{lead.handledByName || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{lead.projectType || "—"}</TableCell>
                  <TableCell>
                    {lead.followUpDate ? (
                      <span className={isOverdue(lead) ? "font-medium text-red-600" : "text-muted-foreground"}>
                        {formatDateIST(lead.followUpDate)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateIST(lead.createdAt)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredLeads.map((lead) => (
            <Card
              key={lead.id}
              onClick={() => router.push(`/leads/${lead.id}`)}
              className={`cursor-pointer transition-colors hover:bg-muted/50 ${isOverdue(lead) ? "border-red-300 bg-red-50/40" : ""}`}
            >
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground">{lead.clientName}</span>
                    {lead.origin === "form" && <FormLeadBadge />}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {lead.priority && <StatusBadge status={lead.priority} />}
                    <StatusBadge status={lead.status} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{lead.phone || lead.email || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {lead.projectType || "—"} · {lead.source || "—"} · ₹{lead.budget || 0}
                </p>
                <p className="text-xs text-muted-foreground">Handled by: {lead.handledByName || "—"}</p>
                {lead.followUpDate && (
                  <p className={`text-xs ${isOverdue(lead) ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                    {isOverdue(lead) ? "Follow-up overdue: " : "Follow-up: "}
                    {formatDateIST(lead.followUpDate)}
                  </p>
                )}
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