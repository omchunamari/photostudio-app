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
  deleteLead,
} from "@/lib/firebase/leads";
import { getAllEmployees } from "@/lib/firebase/employees";
import {
  LEAD_STATUSES,
  PROJECT_TYPES,
  LEAD_SOURCES,
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
import { useRouter } from "next/navigation";
import {
  Trash2,
  List,
  LayoutGrid,
  Download,
  Upload,
  Plus,
  Search,
} from "lucide-react";

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
};

function LeadsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [view, setView] = useState("list"); // "list" | "grid"
  const [tab, setTab] = useState("all"); // "all" | "uncontacted" | "followups"
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all"); // "all" | one of LEAD_STATUSES
  const [sourceFilter, setSourceFilter] = useState("all");
  const [execFilter, setExecFilter] = useState("all");

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
    const header = ["Client Name", "Phone", "Email", "Event Type", "Tentative Event Date", "Event Details", "Quoted Amount", "Source", "Stage", "Handled By", "Follow Up", "Added"];
    const rows = filteredLeads.map((l) => [
      l.clientName, l.phone, l.email, l.projectType || "", l.eventDate || "",
      (l.eventDetails || "").replace(/\n/g, " "), l.budget || 0, l.source || "",
      l.status, l.handledByName || "", l.followUpDate || "", (l.createdAt || "").slice(0, 10),
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

  const today = new Date().toISOString().slice(0, 10);
  function isOverdue(lead) {
    return lead.followUpDate && lead.followUpDate < today && lead.status !== "Won" && lead.status !== "Lost";
  }
  function isUncontacted(lead) {
    return lead.status === "New Inquiry";
  }

  const filteredLeads = useMemo(() => {
    return leads
      .filter((l) => {
        if (tab === "uncontacted") return isUncontacted(l);
        if (tab === "followups") return !!l.followUpDate && l.status !== "Won" && l.status !== "Lost";
        return true;
      })
      .filter((l) => {
        if (stageFilter === "all") return true;
        return l.status === stageFilter;
      })
      .filter((l) => sourceFilter === "all" || l.source === sourceFilter)
      .filter((l) => execFilter === "all" || l.handledByUid === execFilter)
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
  }, [leads, tab, stageFilter, sourceFilter, execFilter, search]);

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
            <DialogContent className="max-h-[85vh] w-[95vw] max-w-md overflow-y-auto sm:w-full">
              <DialogHeader>
                <DialogTitle>Add New Lead</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="flex flex-col gap-4">
                <div>
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
                <div className="grid grid-cols-2 gap-3">
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Event Type</Label>
                    <Select value={form.projectType} onValueChange={(v) => updateForm("projectType", v)}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {PROJECT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                </div>
                <div>
                  <Label htmlFor="eventDetails">Event Details</Label>
                  <Textarea
                    id="eventDetails"
                    placeholder="Events, days, requirements... e.g. Day 1: haldi & cocktail, Day 2: wedding"
                    value={form.eventDetails}
                    onChange={(e) => updateForm("eventDetails", e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Source</Label>
                    <Select value={form.source} onValueChange={(v) => updateForm("source", v)}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {LEAD_SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                </div>
                <div>
                  <Label>Handled By</Label>
                  <Select value={form.handledByUid} onValueChange={(v) => updateForm("handledByUid", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Assign to sales exec...">
                        {(v) => employees.find((e) => e.uid === v)?.name || "Assign to sales exec..."}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem key={e.uid} value={e.uid}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
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
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-full sm:w-[170px]">
            <SelectValue>
              {(v) => (v === "all" ? "All stages" : v)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue>{(v) => (v === "all" ? "All sources" : v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {LEAD_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={execFilter} onValueChange={setExecFilter}>
          <SelectTrigger className="w-full sm:w-[170px]">
            <SelectValue>
              {(v) => (v === "all" ? "All executives" : employees.find((e) => e.uid === v)?.name || "All executives")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All executives</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.uid} value={e.uid}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                    <span className="font-medium text-foreground">{lead.clientName}</span>
                    <p className="text-xs text-muted-foreground">{lead.phone || lead.email || "—"}</p>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select value={lead.status} onValueChange={(v) => handleStatusChange(lead, v)}>
                      <SelectTrigger className="h-7 w-auto border-none bg-transparent p-0 shadow-none [&>svg]:ml-1">
                        <StatusBadge status={lead.status} />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{lead.source || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{lead.handledByName || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{lead.projectType || "—"}</TableCell>
                  <TableCell>
                    {lead.followUpDate ? (
                      <span className={isOverdue(lead) ? "font-medium text-red-600" : "text-muted-foreground"}>
                        {lead.followUpDate}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{(lead.createdAt || "").slice(0, 10)}</TableCell>
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
                  <span className="font-medium text-foreground">{lead.clientName}</span>
                  <StatusBadge status={lead.status} />
                </div>
                <p className="text-xs text-muted-foreground">{lead.phone || lead.email || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {lead.projectType || "—"} · {lead.source || "—"} · ₹{lead.budget || 0}
                </p>
                <p className="text-xs text-muted-foreground">Handled by: {lead.handledByName || "—"}</p>
                {lead.followUpDate && (
                  <p className={`text-xs ${isOverdue(lead) ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                    {isOverdue(lead) ? "Follow-up overdue: " : "Follow-up: "}
                    {lead.followUpDate}
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