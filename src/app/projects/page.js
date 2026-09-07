"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { getAllProjects, getProjectsForLeader, createProject, updateProjectDetails } from "@/lib/firebase/projects";
import { getAllQuotations } from "@/lib/firebase/quotations";
import { getAllInvoices, sumReceived } from "@/lib/firebase/invoices";
import { getAllExpenses, sumExpensesByProject } from "@/lib/firebase/expenses";
import { getAllEmployees } from "@/lib/firebase/employees";
import { ROLES } from "@/lib/constants/roles";
import { PROJECT_STATUSES } from "@/lib/constants/projects";
import { isProjectPast } from "@/lib/status";
import { fyStartYearForDate, fyLabel, inFY, formatINR } from "@/lib/dashboardFinance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import StatusBadge from "@/components/ui/status-badge";
import { toast } from "sonner";
import { Download, Plus, Search, HardDrive } from "lucide-react";

const ADMIN_ROLES = ["super_admin", "admin", "project_manager"];
// Financial columns (Package/Received/Balance/Net Profit) read invoices,
// expenses, and quotations — all gated to admin/PM in firestore.rules
// (isProjectOps()). A "leader" who isn't admin/PM would get a permission
// error querying those collections, so this list gates both the fetch
// and the columns themselves, same boundary as Analytics.
const FINANCE_ROLES = ["super_admin", "admin", "project_manager"];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthKey(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  const [year, month] = key.split("-");
  return `${MONTH_LABELS[Number(month) - 1]} ${year}`;
}
function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const emptyForm = { projectName: "", clientName: "", quotationAmount: "", eventDate: "", leaderUid: "" };

function ProjectsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdminOrPM = ADMIN_ROLES.includes(user.role);
  const canSeeFinance = FINANCE_ROLES.includes(user.role);

  const [projects, setProjects] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [employees, setEmployees] = useState([]);
  const projectLeaders = useMemo(
    () => employees.filter((e) => e.role === ROLES.PROJECT_MANAGER),
    [employees]
  );
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState("active"); // "active" | "done"
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [leaderFilter, setLeaderFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const currentFYStart = fyStartYearForDate(new Date());
  const [fyStart, setFyStart] = useState("all");
  const fyOptions = [0, 1, 2, 3, 4].map((offset) => currentFYStart - offset);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // projectId -> manually-edited package amount. Lets Package stay editable
  // right from the list (e.g. a client adds extra requirements after the
  // quote was sent) without waiting on a new quotation. Overrides quote.total
  // once set; persisted to project.quotationAmount.
  const [packageOverrides, setPackageOverrides] = useState({});
  const [editingPackageId, setEditingPackageId] = useState(null);
  const [editingPackageValue, setEditingPackageValue] = useState("");
  const [savingPackageId, setSavingPackageId] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const projList = isAdminOrPM ? await getAllProjects() : await getProjectsForLeader(user.uid);
        setProjects(projList);

        if (canSeeFinance) {
          const [quotes, invs, exps, emps] = await Promise.all([
            getAllQuotations(),
            getAllInvoices(),
            getAllExpenses(),
            getAllEmployees(),
          ]);
          setQuotations(quotes);
          setInvoices(invs);
          setExpenses(exps);
          setEmployees(emps);
        }
      } catch (err) {
        toast.error(err.message || "Failed to load projects");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAdminOrPM, canSeeFinance, user.uid]);

  const receivedByProject = useMemo(() => {
    const byProject = {};
    invoices.forEach((inv) => {
      if (inv.status !== "paid") return;
      byProject[inv.projectId] = (byProject[inv.projectId] || 0) + (inv.amount || 0);
    });
    return byProject;
  }, [invoices]);
  const costByProject = useMemo(() => sumExpensesByProject(expenses), [expenses]);

  // One enriched row per project — financial fields are 0 (not hidden)
  // for non-finance roles, since those columns aren't rendered for them
  // anyway; the values just never get used.
  const rows = useMemo(() => {
    return projects.map((p) => {
      const quote = quotations.find((q) => q.id === p.quotationId);
      const packageAmount = packageOverrides[p.id] ?? (p.quotationAmount ?? quote?.total ?? 0);
      const received = receivedByProject[p.id] || 0;
      const balance = Math.max(0, packageAmount - received);
      const cost = costByProject[p.id] || 0;
      const netProfit = packageAmount - cost;
      const hardDisks = p.hardDisks || [];
      const hddReceivedCount = hardDisks.filter((d) => d.received).length;
      return {
        ...p,
        quoteNumber: quote?.quoteNumber || null,
        packageAmount,
        received,
        balance,
        netProfit,
        bookedMonthKey: monthKey(p.createdAt),
        hddReceivedCount,
        hddTotalCount: hardDisks.length,
      };
    });
  }, [projects, quotations, receivedByProject, costByProject, packageOverrides]);

  const monthOptions = useMemo(() => {
    const keys = new Set(rows.map((r) => r.bookedMonthKey).filter(Boolean));
    return [...keys].sort().reverse();
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows
      .filter((r) => (tab === "done" ? isProjectPast(r) : !isProjectPast(r)))
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => leaderFilter === "all" || r.leaderUid === leaderFilter)
      .filter((r) => monthFilter === "all" || r.bookedMonthKey === monthFilter)
      .filter((r) => fyStart === "all" || inFY(r.createdAt, Number(fyStart)))
      .filter((r) => {
        const term = search.trim().toLowerCase();
        if (!term) return true;
        return (
          r.projectName?.toLowerCase().includes(term) ||
          r.clientName?.toLowerCase().includes(term) ||
          r.quoteNumber?.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [rows, tab, statusFilter, leaderFilter, monthFilter, fyStart, search]);

  function handleExport() {
    const header = ["Project", "Client", "Booked", "Handled By", "Package", "Received", "Balance", "Net Profit", "Status"];
    const exportRows = filteredRows.map((r) => [
      r.projectName, r.clientName, (r.createdAt || "").slice(0, 10), r.leaderName || "",
      r.packageAmount, r.received, r.balance, r.netProfit, r.status,
    ]);
    const csv = [header, ...exportRows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "projects-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleUpdatePackageAmount(projectId, newAmount) {
    const amount = Number(newAmount);
    if (Number.isNaN(amount) || amount < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSavingPackageId(projectId);
    try {
      await updateProjectDetails(projectId, { quotationAmount: amount });
      setPackageOverrides((prev) => ({ ...prev, [projectId]: amount }));
      toast.success("Package amount updated");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingPackageId(null);
    }
  }

  // Standalone creation — not linked to any lead (leadId: null). For
  // projects that come from a won lead, "Convert to Project" on the lead
  // itself is still the right path (it carries over the quotation).
  async function handleCreate(e) {
    e.preventDefault();
    if (!form.projectName.trim() || !form.clientName.trim()) {
      toast.error("Project name and client name are required");
      return;
    }
    setSaving(true);
    try {
      const leader = employees.find((emp) => emp.uid === form.leaderUid);
      const projectId = await createProject(
        {
          projectName: form.projectName.trim(),
          clientName: form.clientName.trim(),
          leadId: null,
          quotationAmount: Number(form.quotationAmount) || 0,
          eventDate: form.eventDate || null,
          leaderUid: form.leaderUid || null,
          leaderName: leader?.name || null,
        },
        user.uid
      );
      toast.success("Project created");
      setDialogOpen(false);
      setForm(emptyForm);
      router.push(`/projects/${projectId}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
            {isAdminOrPM ? "Projects" : "My Led Projects"}
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground">{filteredRows.length}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSeeFinance && (
            <Select value={String(fyStart)} onValueChange={setFyStart}>
              <SelectTrigger className="w-[130px]">
                <SelectValue>{(v) => (v === "all" ? "All years" : fyLabel(Number(v)))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {fyOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{fyLabel(y)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          {isAdminOrPM && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-3.5 w-3.5" /> New Project
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] w-[95vw] max-w-md overflow-y-auto sm:w-full">
                <DialogHeader>
                  <DialogTitle>New Project</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="flex flex-col gap-4">
                  <p className="text-xs text-muted-foreground">
                    For a project coming from a won lead, use &quot;Convert to Project&quot; on that lead instead — it
                    carries over the quotation automatically. This creates a standalone project.
                  </p>
                  <div>
                    <Label htmlFor="projectName">Project Name *</Label>
                    <Input
                      id="projectName"
                      placeholder="e.g. Vaibhav &amp; Shraddha"
                      value={form.projectName}
                      onChange={(e) => updateForm("projectName", e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label htmlFor="clientName">Client Name *</Label>
                    <Input
                      id="clientName"
                      value={form.clientName}
                      onChange={(e) => updateForm("clientName", e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="quotationAmount">Package Amount (₹)</Label>
                      <Input
                        id="quotationAmount"
                        type="number"
                        min="0"
                        placeholder="0"
                        value={form.quotationAmount}
                        onChange={(e) => updateForm("quotationAmount", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="eventDate">Event Date</Label>
                      <Input
                        id="eventDate"
                        type="date"
                        value={form.eventDate}
                        onChange={(e) => updateForm("eventDate", e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Project Leader</Label>
                    <Select value={form.leaderUid} onValueChange={(v) => updateForm("leaderUid", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Assign later...">
                          {(v) => employees.find((e) => e.uid === v)?.name || "Assign later..."}
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
                      {saving ? "Creating..." : "Create Project"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="mb-4 flex gap-1 rounded-md bg-muted p-1 w-fit">
        {[
          { id: "active", label: "Active" },
          { id: "done", label: "Done" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${
              tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client or project..."
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue>{(v) => (v === "all" ? "All statuses" : v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PROJECT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue>{(v) => (v === "all" ? "All months" : monthLabel(v))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {monthOptions.map((k) => (
              <SelectItem key={k} value={k}>{monthLabel(k)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdminOrPM && (
          <Select value={leaderFilter} onValueChange={setLeaderFilter}>
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue>
                {(v) => (v === "all" ? "All project leaders" : projectLeaders.find((e) => e.uid === v)?.name || "All project leaders")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All project leaders</SelectItem>
              {projectLeaders.map((e) => (
                <SelectItem key={e.uid} value={e.uid}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading projects...</p>
      ) : filteredRows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {tab === "done"
              ? "No done projects yet."
              : isAdminOrPM
              ? "No active projects found."
              : "You haven't been assigned as Project Leader on any active project."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Booked</TableHead>
                <TableHead>Handled By</TableHead>
                {canSeeFinance && (
                  <>
                    <TableHead className="text-right">Package</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Net Profit</TableHead>
                  </>
                )}
                <TableHead>HDD</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((r) => (
                <TableRow key={r.id} onClick={() => router.push(`/projects/${r.id}`)} className="cursor-pointer">
                  <TableCell>
                    <span className="font-medium text-foreground">{r.projectName}</span>
                    <p className="text-xs text-muted-foreground">{r.quoteNumber || r.clientName}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                  <TableCell>
                    {r.leaderName ? (
                      <span className="inline-flex h-5 w-fit shrink-0 items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
                        {r.leaderName}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {canSeeFinance && (
                    <>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {editingPackageId === r.id ? (
                          <span className="inline-flex items-center gap-0.5 justify-end">
                            ₹
                            <input
                              autoFocus
                              type="number"
                              min="0"
                              value={editingPackageValue}
                              onChange={(e) => setEditingPackageValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                } else if (e.key === "Escape") {
                                  setEditingPackageId(null);
                                }
                              }}
                              onBlur={() => {
                                setEditingPackageId(null);
                                if (editingPackageValue !== String(r.packageAmount)) {
                                  handleUpdatePackageAmount(r.id, editingPackageValue);
                                }
                              }}
                              disabled={savingPackageId === r.id}
                              className="w-20 border-b border-slate-300 bg-transparent text-right outline-none focus:border-slate-900"
                            />
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPackageValue(String(r.packageAmount));
                              setEditingPackageId(r.id);
                            }}
                            title="Click to edit package amount"
                            className="rounded hover:bg-slate-50"
                          >
                            {formatINR(r.packageAmount)}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatINR(r.received)}</TableCell>
                      <TableCell className={`text-right ${r.balance > 0 ? "font-medium text-amber-700" : "text-muted-foreground"}`}>
                        {formatINR(r.balance)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${r.netProfit >= 0 ? "text-foreground" : "text-destructive"}`}>
                        {formatINR(r.netProfit)}
                      </TableCell>
                    </>
                  )}
                  <TableCell>
                    {r.hddTotalCount === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={`inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                          r.hddReceivedCount === r.hddTotalCount
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        <HardDrive className="h-3 w-3" />
                        {r.hddReceivedCount}/{r.hddTotalCount}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </AppShell>
  );
}

export default function ProjectsPage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <ProjectsContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}