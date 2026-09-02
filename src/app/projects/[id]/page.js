"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import AssignTeamDialog from "@/components/AssignTeamDialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  getProjectById,
  updateProjectDetails,
  updateProjectStatus,
  deleteProject,
  setProjectLeader,
} from "@/lib/firebase/projects";
import { createEvent, getEventsForProject, sumEventTeamCost, updateEventTeam } from "@/lib/firebase/events";
import { getAllEmployees } from "@/lib/firebase/employees";
import {
  ensureDeliverablesForProject,
  addDeliverable,
  deleteDeliverable,
} from "@/lib/firebase/deliverables";
import {
  getInvoicesForProject,
  createInvoice,
  setInvoiceStatus,
  deleteInvoice,
  getNextInvoiceNumber,
  sumReceived,
  INVOICE_STATUSES,
} from "@/lib/firebase/invoices";
import {
  getExpensesForProject,
  createExpense,
  deleteExpense,
  MANUAL_EXPENSE_CATEGORIES,
  getAllExpenseCategories,
  addCustomExpenseCategory,
  removeCustomExpenseCategory,
} from "@/lib/firebase/expenses";
import { PROJECT_STATUSES } from "@/lib/constants/projects";
import { isEventPast } from "@/lib/status";
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
import StatusBadge from "@/components/ui/status-badge";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Crown, X } from "lucide-react";

const ADMIN_ROLES = ["super_admin", "admin", "project_manager"];

function inr(n) {
  return `₹${(Number(n) || 0).toLocaleString("en-IN")}`;
}

// Stable, deterministic color per category so the same label always gets
// the same pill color across sessions — including custom categories added
// later, which fall through to the hash-based palette.
const CATEGORY_COLORS = {
  Travel: "bg-blue-50 text-blue-700",
  Equipment: "bg-violet-50 text-violet-700",
  Accommodation: "bg-amber-50 text-amber-700",
  Food: "bg-emerald-50 text-emerald-700",
  Miscellaneous: "bg-slate-100 text-slate-700",
};
const FALLBACK_CATEGORY_PALETTE = [
  "bg-rose-50 text-rose-700",
  "bg-cyan-50 text-cyan-700",
  "bg-fuchsia-50 text-fuchsia-700",
  "bg-lime-50 text-lime-700",
  "bg-orange-50 text-orange-700",
];
function categoryColor(category) {
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return FALLBACK_CATEGORY_PALETTE[hash % FALLBACK_CATEGORY_PALETTE.length];
}

function ProjectDetailContent() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const isAdminOrPM = ADMIN_ROLES.includes(user.role);
  const canDelete = ["super_admin", "admin"].includes(user.role);

  const [project, setProject] = useState(null);
  const [events, setEvents] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [addDeliverableOpen, setAddDeliverableOpen] = useState(false);
  const [newDeliverableType, setNewDeliverableType] = useState("");
  const [savingDeliverable, setSavingDeliverable] = useState(false);
  const [deletingDeliverableId, setDeletingDeliverableId] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingLeader, setSavingLeader] = useState(false);
  const [assignDialogEvent, setAssignDialogEvent] = useState(null); // event object | null
  const [editingCost, setEditingCost] = useState(null); // { eventId, uid } | null
  const [editingCostValue, setEditingCostValue] = useState("");
  const [savingCost, setSavingCost] = useState(false);
  const [editingPackage, setEditingPackage] = useState(false);
  const [editingPackageValue, setEditingPackageValue] = useState("");
  const [savingPackage, setSavingPackage] = useState(false);

  const [detailsForm, setDetailsForm] = useState({
    projectName: "",
  });
  const [savingDetails, setSavingDetails] = useState(false);

  const [eventForm, setEventForm] = useState({
    eventName: "",
    eventStartDate: "",
    eventEndDate: "",
  });

  // --- Invoices ---
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: "",
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    status: "unpaid",
    note: "",
  });

  // --- Other Expenses ---
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState(MANUAL_EXPENSE_CATEGORIES);
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [removingCategory, setRemovingCategory] = useState(null);
  const [expenseForm, setExpenseForm] = useState({
    category: MANUAL_EXPENSE_CATEGORIES[0],
    amount: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
  });

  async function loadData() {
    setLoading(true);
    const p = await getProjectById(id);
    setProject(p);
    if (p) {
      // A Project Leader only has access to the project they lead — anyone
      // else who isn't admin/PM and isn't the leader gets bounced out.
      const isLeader = p.leaderUid === user.uid;
      if (!isAdminOrPM && !isLeader) {
        toast.error("You don't have access to this project");
        router.replace("/projects");
        return;
      }

      setDetailsForm({ projectName: p.projectName || "" });
      const evts = await getEventsForProject(id);
      setEvents(evts);

      try {
        // Same starter-set-on-first-view pattern used by the
        // Post-Production page — deliverables live in a subcollection so
        // they stay in sync between both pages automatically.
        const dels = await ensureDeliverablesForProject(p);
        setDeliverables(dels);
      } catch (err) {
        toast.error(`Failed loading deliverables: ${err.message}`);
      }

      if (isAdminOrPM) {
        try {
          const emps = await getAllEmployees();
          setEmployees(emps.filter((e) => e.status === "active"));
        } catch (err) {
          toast.error(`Failed loading employees: ${err.message}`);
        }
        try {
          const [invs, exps, cats] = await Promise.all([
            getInvoicesForProject(id),
            getExpensesForProject(id),
            getAllExpenseCategories(),
          ]);
          setInvoices(invs);
          setExpenses(exps);
          setExpenseCategories(cats);
        } catch (err) {
          toast.error(`Failed loading financials: ${err.message}`);
        }
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSetLeader(uid) {
    setSavingLeader(true);
    try {
      const emp = uid === "none" ? null : employees.find((e) => e.uid === uid);
      await setProjectLeader(id, emp?.uid || null, emp?.name || null);
      setProject((prev) => ({ ...prev, leaderUid: emp?.uid || null, leaderName: emp?.name || null }));
      toast.success(emp ? `${emp.name} set as Project Leader` : "Project Leader cleared");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingLeader(false);
    }
  }

  async function handleSaveDetails(e) {
    e.preventDefault();
    setSavingDetails(true);
    try {
      await updateProjectDetails(id, { projectName: detailsForm.projectName });
      toast.success("Project details updated");
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingDetails(false);
    }
  }

  // Add/remove deliverables from the project page. Assignment, dates, and
  // deadlines are intentionally NOT editable here — those stay Post-
  // Production-only, matching firestore.rules (only isProjectOps() can
  // create/delete a deliverable, and updateDeliverable's assignedUid/date
  // fields are only ever sent from the Post-Production dialog).
  async function handleAddDeliverable(e) {
    e.preventDefault();
    if (!newDeliverableType.trim()) {
      toast.error("Name this deliverable");
      return;
    }
    setSavingDeliverable(true);
    try {
      await addDeliverable(project, newDeliverableType.trim());
      toast.success("Deliverable added");
      setAddDeliverableOpen(false);
      setNewDeliverableType("");
      const dels = await ensureDeliverablesForProject(project);
      setDeliverables(dels);
    } catch (err) {
      toast.error(err.message || "Failed to add deliverable");
    } finally {
      setSavingDeliverable(false);
    }
  }

  async function handleDeleteDeliverable(d) {
    if (!confirm(`Remove "${d.type}"?`)) return;
    setDeletingDeliverableId(d.id);
    try {
      await deleteDeliverable(id, d.id);
      setDeliverables((prev) => prev.filter((row) => row.id !== d.id));
      toast.success("Deliverable removed");
    } catch (err) {
      toast.error(err.message || "Failed to remove deliverable");
    } finally {
      setDeletingDeliverableId(null);
    }
  }

  async function handleStatusChange(status) {
    try {
      await updateProjectStatus(id, status);
      setProject((prev) => ({ ...prev, status }));
      toast.success("Status updated");
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleUpdatePackageAmount(newAmount) {
    const amount = Number(newAmount);
    if (Number.isNaN(amount) || amount < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSavingPackage(true);
    try {
      await updateProjectDetails(id, { quotationAmount: amount });
      setProject((prev) => ({ ...prev, quotationAmount: amount }));
      toast.success("Package amount updated");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingPackage(false);
    }
  }

  async function handleUpdateMemberCost(eventId, uid, newCost) {
    const cost = Number(newCost);
    if (Number.isNaN(cost) || cost < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    setSavingCost(true);
    try {
      const newTeam = (ev.team || []).map((m) =>
        m.uid === uid ? { ...m, cost } : m
      );
      await updateEventTeam(id, eventId, newTeam, ev.status);
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, team: newTeam } : e))
      );
      toast.success("Amount updated");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingCost(false);
    }
  }

  async function handleCreateEvent(e) {
    e.preventDefault();
    if (!eventForm.eventName.trim()) {
      toast.error("Event name is required");
      return;
    }
    if (!eventForm.eventStartDate) {
      toast.error("Start date is required");
      return;
    }
    if (eventForm.eventEndDate && eventForm.eventEndDate < eventForm.eventStartDate) {
      toast.error("End date can't be before start date");
      return;
    }
    setCreating(true);
    try {
      const eventId = await createEvent(id, {
        eventName: eventForm.eventName.trim(),
        eventStartDate: eventForm.eventStartDate,
        eventEndDate: eventForm.eventEndDate || eventForm.eventStartDate,
        projectName: project.projectName,
        clientName: project.clientName,
      });
      toast.success("Event created");
      setDialogOpen(false);
      setEventForm({ eventName: "", eventStartDate: "", eventEndDate: "" });
      router.push(`/projects/${id}/events/${eventId}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteProject() {
    setDeleting(true);
    try {
      await deleteProject(id);
      toast.success("Project deleted");
      router.push("/projects");
    } catch (err) {
      toast.error(err.message);
      setDeleting(false);
    }
  }

  // --- Invoices handlers ---
  async function openInvoiceDialog() {
    setInvoiceDialogOpen(true);
    try {
      const nextNumber = await getNextInvoiceNumber();
      setInvoiceForm({
        invoiceNumber: nextNumber,
        date: new Date().toISOString().slice(0, 10),
        amount: "",
        status: "unpaid",
        note: "",
      });
    } catch {
      // fine to leave invoiceNumber blank if the lookup fails; the field is still editable
    }
  }

  async function handleCreateInvoice(e) {
    e.preventDefault();
    if (!invoiceForm.invoiceNumber.trim()) {
      toast.error("Invoice number is required");
      return;
    }
    if (!invoiceForm.amount || Number(invoiceForm.amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSavingInvoice(true);
    try {
      await createInvoice(
        {
          projectId: id,
          projectName: project.projectName,
          invoiceNumber: invoiceForm.invoiceNumber.trim(),
          date: invoiceForm.date,
          amount: invoiceForm.amount,
          status: invoiceForm.status,
          note: invoiceForm.note,
        },
        user.uid,
        user.name
      );
      toast.success("Invoice created");
      setInvoiceDialogOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingInvoice(false);
    }
  }

  async function handleToggleInvoiceStatus(inv) {
    const nextStatus = inv.status === "paid" ? "unpaid" : "paid";
    try {
      await setInvoiceStatus(inv.id, nextStatus);
      setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, status: nextStatus } : i)));
      toast.success(nextStatus === "paid" ? "Marked as paid" : "Marked as unpaid");
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDeleteInvoice(invId) {
    try {
      await deleteInvoice(invId);
      setInvoices((prev) => prev.filter((i) => i.id !== invId));
      toast.success("Invoice deleted");
    } catch (err) {
      toast.error(err.message);
    }
  }

  // --- Expenses handlers ---
  async function handleCreateExpense(e) {
    e.preventDefault();
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSavingExpense(true);
    try {
      await createExpense(
        {
          projectId: id,
          projectName: project.projectName,
          type: "manual",
          category: expenseForm.category,
          amount: expenseForm.amount,
          description: expenseForm.description,
          date: expenseForm.date,
        },
        user.uid,
        user.name
      );
      toast.success("Expense added");
      setExpenseDialogOpen(false);
      setExpenseForm({
        category: MANUAL_EXPENSE_CATEGORIES[0],
        amount: "",
        description: "",
        date: new Date().toISOString().slice(0, 10),
      });
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingExpense(false);
    }
  }

  async function handleDeleteExpense(expId) {
    try {
      await deleteExpense(expId);
      setExpenses((prev) => prev.filter((e) => e.id !== expId));
      toast.success("Expense deleted");
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleAddCategory(e) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setSavingCategory(true);
    try {
      const next = await addCustomExpenseCategory(newCategoryName);
      setExpenseCategories([...MANUAL_EXPENSE_CATEGORIES, ...next]);
      setNewCategoryName("");
      toast.success("Category added");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleRemoveCategory(name) {
    setRemovingCategory(name);
    try {
      const next = await removeCustomExpenseCategory(name);
      setExpenseCategories([...MANUAL_EXPENSE_CATEGORIES, ...next]);
      // If the expense form currently has this category selected, fall
      // back to the first default so it never points at a removed value.
      setExpenseForm((p) => (p.category === name ? { ...p, category: MANUAL_EXPENSE_CATEGORIES[0] } : p));
      toast.success("Category removed");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRemovingCategory(null);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Loading...</p>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Project not found.</p>
      </AppShell>
    );
  }

  // --- Financial rollups ---
  const packageAmount = Number(project.quotationAmount) || 0;
  const received = sumReceived(invoices);
  const balanceDue = Math.max(packageAmount - received, 0);
  const receivedPct = packageAmount > 0 ? Math.round((received / packageAmount) * 100) : 0;
  const balancePct = packageAmount > 0 ? Math.round((balanceDue / packageAmount) * 100) : 0;
  const teamCost = events.reduce((sum, ev) => sum + sumEventTeamCost(ev.team), 0);
  const teamCostPct = packageAmount > 0 ? Math.round((teamCost / packageAmount) * 100) : 0;
  const otherExpensesTotal = expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  const otherExpensesPct = packageAmount > 0 ? Math.round((otherExpensesTotal / packageAmount) * 100) : 0;
  const netProfit = packageAmount - teamCost - otherExpensesTotal;
  const marginPct = packageAmount > 0 ? Math.round((netProfit / packageAmount) * 100) : 0;

  return (
    <AppShell>
      <button
        onClick={() => router.push("/projects")}
        className="mb-3 -ml-1.5 flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Projects
      </button>

      {/* top-14 clears AppShell's fixed mobile top bar (h-14); on md+ that
          bar doesn't exist so the header can stick flush to top-0. */}
      <div className="sticky top-14 z-10 mb-6 flex flex-col gap-3 border-b border-slate-200 bg-white py-3 sm:flex-row sm:items-center sm:justify-between md:top-0">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-slate-900 sm:text-2xl">
            {project.projectName}
          </h2>
          <p className="text-sm text-slate-500">{project.clientName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={project.status} />
          <Link href={`/post-production?projectId=${project.id}`}>
            <Button size="sm" variant="secondary">Post-Production</Button>
          </Link>
          <Select value={project.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-8 w-36 text-xs sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROJECT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" /> Add Event
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-md">
              <DialogHeader>
                <DialogTitle>New Event</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateEvent} className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="eventName">Event Name</Label>
                  <Input
                    id="eventName"
                    placeholder="e.g. Mehendi, Wedding Day, Reception"
                    value={eventForm.eventName}
                    onChange={(e) => setEventForm((p) => ({ ...p, eventName: e.target.value }))}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="eventStartDate">Start Date</Label>
                    <Input
                      id="eventStartDate"
                      type="date"
                      value={eventForm.eventStartDate}
                      onChange={(e) =>
                        setEventForm((p) => ({
                          ...p,
                          eventStartDate: e.target.value,
                          eventEndDate:
                            p.eventEndDate && p.eventEndDate < e.target.value ? e.target.value : p.eventEndDate,
                        }))
                      }
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="eventEndDate">End Date</Label>
                    <Input
                      id="eventEndDate"
                      type="date"
                      min={eventForm.eventStartDate || undefined}
                      value={eventForm.eventEndDate}
                      onChange={(e) => setEventForm((p) => ({ ...p, eventEndDate: e.target.value }))}
                    />
                  </div>
                </div>
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create Event"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon" className="h-8 w-8">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitleEl>Delete "{project.projectName}"?</AlertDialogTitleEl>
                  <AlertDialogDescription>
                    This permanently deletes the project and all {events.length} event
                    {events.length !== 1 && "s"} under it, including team assignments and status
                    updates. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteProject}
                    disabled={deleting}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {deleting ? "Deleting..." : "Delete Project"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* --- Financial summary cards --- */}
      {isAdminOrPM && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">Package</p>
              {editingPackage ? (
                <p className="mt-1 flex items-center gap-1 text-lg font-semibold text-slate-900">
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
                        setEditingPackage(false);
                      }
                    }}
                    onBlur={() => {
                      setEditingPackage(false);
                      if (editingPackageValue !== String(project.quotationAmount || 0)) {
                        handleUpdatePackageAmount(editingPackageValue);
                      }
                    }}
                    disabled={savingPackage}
                    className="w-24 border-b border-slate-300 bg-transparent text-lg font-semibold text-slate-900 outline-none focus:border-slate-900"
                  />
                </p>
              ) : (
                <button
                  type="button"
                  disabled={!isAdminOrPM}
                  onClick={() => {
                    if (!isAdminOrPM) return;
                    setEditingPackageValue(String(project.quotationAmount || 0));
                    setEditingPackage(true);
                  }}
                  title={isAdminOrPM ? "Click to edit package amount" : undefined}
                  className={`mt-1 block text-left text-lg font-semibold text-slate-900 ${
                    isAdminOrPM ? "rounded hover:bg-slate-50" : ""
                  }`}
                >
                  {inr(packageAmount)}
                </button>
              )}
              <p className="text-[11px] text-slate-400">100% (base)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">Received</p>
              <p className="mt-1 text-lg font-semibold text-emerald-600">{inr(received)}</p>
              <p className="text-[11px] text-slate-400">{receivedPct}% collected</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">Balance Due</p>
              <p className="mt-1 text-lg font-semibold text-red-600">{inr(balanceDue)}</p>
              <p className="text-[11px] text-slate-400">{balancePct}% pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">Team Cost</p>
              <p className="mt-1 text-lg font-semibold text-amber-600">{inr(teamCost)}</p>
              <p className="text-[11px] text-slate-400">{teamCostPct}% of package</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">Other Expenses</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{inr(otherExpensesTotal)}</p>
              <p className="text-[11px] text-slate-400">{otherExpensesPct}% of package</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">Net Profit</p>
              <p className="mt-1 text-lg font-semibold text-emerald-700">{inr(netProfit)}</p>
              <p className="text-[11px] text-slate-400">{marginPct}% margin</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {/* --- Project Details --- compact single row, not a tall sidebar
            column, so it doesn't dominate the page next to Invoices/Events
            below it. */}
        <Card>
          <CardContent className="flex flex-wrap items-end gap-x-6 gap-y-4 p-4">
            <form onSubmit={handleSaveDetails} className="flex w-full items-end gap-2 sm:w-auto sm:min-w-[220px] sm:flex-1">
              <div className="flex-1">
                <Label htmlFor="projectName" className="text-xs text-slate-500">Project Name</Label>
                <Input
                  id="projectName"
                  className="h-8"
                  value={detailsForm.projectName}
                  onChange={(e) => setDetailsForm({ projectName: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" size="sm" disabled={savingDetails}>
                {savingDetails ? "Saving..." : "Save"}
              </Button>
            </form>

            <div className="w-full sm:w-auto sm:min-w-[220px]">
              <Label className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
                <Crown className="h-3.5 w-3.5 text-amber-500" /> Project Leader
              </Label>
              {isAdminOrPM ? (
                <Select
                  value={project.leaderUid || "none"}
                  onValueChange={handleSetLeader}
                  disabled={savingLeader}
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="No leader assigned">
                      {(v) =>
                        v === "none" || !v
                          ? "No leader"
                          : (() => {
                              const emp = employees.find((e) => e.uid === v);
                              return emp ? `${emp.name} (${emp.role})` : project.leaderName || v;
                            })()
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No leader</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.uid} value={e.uid}>
                        {e.name} ({e.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-slate-900">{project.leaderName || "Unassigned"}</p>
              )}
            </div>

            {project.deliverables && (
              <div className="w-full sm:w-auto sm:min-w-[160px]">
                <p className="text-xs text-slate-500">Deliverables</p>
                <p className="text-sm text-slate-900">{project.deliverables}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* --- Invoices --- */}
          {isAdminOrPM && (
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-slate-900">Invoices</h3>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      New
                    </span>
                  </div>
                  <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" onClick={openInvoiceDialog}>
                        <Plus className="h-4 w-4" /> New Invoice
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[95vw] max-w-md">
                      <DialogHeader>
                        <DialogTitle>New Invoice</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateInvoice} className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="invoiceNumber">Invoice #</Label>
                            <Input
                              id="invoiceNumber"
                              value={invoiceForm.invoiceNumber}
                              onChange={(e) =>
                                setInvoiceForm((p) => ({ ...p, invoiceNumber: e.target.value }))
                              }
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="invoiceDate">Date</Label>
                            <Input
                              id="invoiceDate"
                              type="date"
                              value={invoiceForm.date}
                              onChange={(e) => setInvoiceForm((p) => ({ ...p, date: e.target.value }))}
                              required
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="invoiceAmount">Amount (₹)</Label>
                            <Input
                              id="invoiceAmount"
                              type="number"
                              min="0"
                              value={invoiceForm.amount}
                              onChange={(e) => setInvoiceForm((p) => ({ ...p, amount: e.target.value }))}
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="invoiceStatus">Status</Label>
                            <Select
                              value={invoiceForm.status}
                              onValueChange={(v) => setInvoiceForm((p) => ({ ...p, status: v }))}
                            >
                              <SelectTrigger id="invoiceStatus">
                                {invoiceForm.status === "paid" ? "Paid" : "Unpaid"}
                              </SelectTrigger>
                              <SelectContent>
                                {INVOICE_STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {s === "paid" ? "Paid" : "Unpaid"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="invoiceNote">Note (optional)</Label>
                          <Textarea
                            id="invoiceNote"
                            rows={2}
                            value={invoiceForm.note}
                            onChange={(e) => setInvoiceForm((p) => ({ ...p, note: e.target.value }))}
                          />
                        </div>
                        <Button type="submit" disabled={savingInvoice}>
                          {savingInvoice ? "Saving..." : "Create Invoice"}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>

                {invoices.length === 0 ? (
                  <p className="text-sm text-slate-500">No invoices yet.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {invoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-slate-200 p-3"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">
                            {inv.invoiceNumber} · {inv.date}
                          </p>
                          <p className="text-sm text-slate-500">{inr(inv.amount)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            onClick={() => handleToggleInvoiceStatus(inv)}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              inv.status === "paid"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-stone-100 text-stone-600"
                            }`}
                          >
                            {inv.status === "paid" ? "paid" : "unpaid"}
                          </button>
                          <button onClick={() => handleDeleteInvoice(inv.id)}>
                            <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* --- Events --- */}
          <div>
            <h3 className="mb-2 text-base font-medium text-slate-900 sm:text-lg">Events</h3>
            {events.length === 0 ? (
              <p className="text-sm text-slate-500">No events yet. Add one to start assigning a team.</p>
            ) : (
              <ol className="relative ml-3 flex flex-col gap-5 border-l-2 border-slate-200 pl-6">
                {[...events]
                  .sort((a, b) =>
                    (a.eventStartDate || "").localeCompare(b.eventStartDate || "") ||
                    (a.createdAt || "").localeCompare(b.createdAt || "")
                  )
                  .map((ev) => {
                    const done = isEventPast(ev);
                    const evCost = sumEventTeamCost(ev.team);
                    const assignedCount = ev.team?.length || 0;
                    return (
                      <li key={ev.id} className="relative">
                        <span
                          className={`absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 ${
                            done
                              ? "border-emerald-600 bg-emerald-600"
                              : "border-slate-400 bg-white"
                          }`}
                        />
                        <Card className="transition hover:border-slate-300">
                          <CardContent className="p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <Link href={`/projects/${id}/events/${ev.id}`} className="min-w-0 flex-1 sm:pt-0.5">
                                <div className="flex items-center gap-2">
                                  <p className="truncate font-medium text-slate-900">{ev.eventName}</p>
                                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                    {assignedCount > 0 ? "Assigned" : "Not Assigned"}
                                  </span>
                                </div>
                                <p className="truncate text-xs text-slate-500">
                                  {ev.eventStartDate
                                    ? ev.eventStartDate === ev.eventEndDate
                                      ? ev.eventStartDate
                                      : `${ev.eventStartDate} – ${ev.eventEndDate}`
                                    : "No date set"}{" "}
                                  · {ev.shootDays || 1} day{ev.shootDays !== 1 && "s"} · {assignedCount} assigned
                                </p>
                              </Link>
                              {/*
                                Alignment fix: cost / status / Assign button used
                                to sit in a plain flex row, so a longer status
                                label (e.g. "In Progress" vs "Done") shifted the
                                Assign button left/right on different cards.
                                Giving the status a fixed-width centered slot
                                (and matching width on the button) keeps every
                                Assign button in the same horizontal position
                                regardless of status text length.
                              */}
                              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
                                {isAdminOrPM && evCost > 0 && (
                                  <span className="text-sm font-medium text-amber-600">{inr(evCost)}</span>
                                )}
                                <span className="flex w-[104px] shrink-0 justify-center">
                                  <StatusBadge status={ev.status} />
                                </span>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="w-[92px] shrink-0"
                                  onClick={() => setAssignDialogEvent(ev)}
                                >
                                  Assign →
                                </Button>
                              </div>
                            </div>
                            {assignedCount > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {ev.team.map((m) => (
                                  <span
                                    key={m.uid}
                                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                                  >
                                    {m.name}
                                    {editingCost?.eventId === ev.id && editingCost?.uid === m.uid ? (
                                      <span className="inline-flex items-center gap-0.5 text-slate-500">
                                        {m.costLabel || "Full Day"}{" "}
                                        <input
                                          autoFocus
                                          type="number"
                                          min="0"
                                          value={editingCostValue}
                                          onClick={(e) => e.preventDefault()}
                                          onChange={(e) => setEditingCostValue(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              e.currentTarget.blur();
                                            } else if (e.key === "Escape") {
                                              setEditingCost(null);
                                            }
                                          }}
                                          onBlur={() => {
                                            setEditingCost(null);
                                            if (editingCostValue !== String(m.cost || 0)) {
                                              handleUpdateMemberCost(ev.id, m.uid, editingCostValue);
                                            }
                                          }}
                                          disabled={savingCost}
                                          className="w-16 border-b border-slate-400 bg-transparent text-[11px] text-slate-700 outline-none"
                                        />
                                      </span>
                                    ) : (m.cost > 0 || isAdminOrPM) && (
                                      <span
                                        role={isAdminOrPM ? "button" : undefined}
                                        tabIndex={isAdminOrPM ? 0 : undefined}
                                        onClick={(e) => {
                                          if (!isAdminOrPM) return;
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setEditingCostValue(String(m.cost || 0));
                                          setEditingCost({ eventId: ev.id, uid: m.uid });
                                        }}
                                        className={`text-slate-400 ${
                                          isAdminOrPM ? "cursor-pointer underline decoration-dotted hover:text-slate-700" : ""
                                        }`}
                                        title={isAdminOrPM ? "Click to edit amount" : undefined}
                                      >
                                        {m.costLabel || "Full Day"} {inr(m.cost || 0)}
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </li>
                    );
                  })}
              </ol>
            )}
          </div>

          {/* --- Deliverables ---
              Mirrors the same subcollection shown on the Post-Production
              page, so anything added/removed here shows up there too (and
              vice versa). Assignment, dates, and deadlines are read-only
              here — set those from Post-Production. */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-medium text-slate-900 sm:text-lg">Deliverables</h3>
              {isAdminOrPM && (
                <Button size="sm" variant="secondary" onClick={() => setAddDeliverableOpen(true)}>
                  <Plus className="h-4 w-4" /> Add Deliverable
                </Button>
              )}
            </div>
            {deliverables.length === 0 ? (
              <p className="text-sm text-slate-500">No deliverables yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {deliverables.map((d) => (
                  <Card key={d.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{d.type}</p>
                        <p className="truncate text-xs text-slate-500">
                          {d.assignedName ? `Assigned to ${d.assignedName}` : "Unassigned"}
                          {d.deadline ? ` · Due ${d.deadline}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge status={d.status} />
                        {isAdminOrPM && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title="Remove deliverable"
                            disabled={deletingDeliverableId === d.id}
                            onClick={() => handleDeleteDeliverable(d)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-slate-400">
              Assignment, dates, and deadlines are set from the Post-Production page.
            </p>
          </div>

          {/* --- Other Expenses --- */}
          {isAdminOrPM && (
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-slate-900">Other Expenses</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Dialog open={manageCategoriesOpen} onOpenChange={setManageCategoriesOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">Manage Categories</Button>
                      </DialogTrigger>
                      <DialogContent className="w-[95vw] max-w-sm">
                        <DialogHeader>
                          <DialogTitle>Manage Expense Categories</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleAddCategory} className="flex items-center gap-2">
                          <Input
                            placeholder="New category name..."
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                          />
                          <Button type="submit" size="sm" disabled={savingCategory || !newCategoryName.trim()}>
                            {savingCategory ? "Adding..." : "Add"}
                          </Button>
                        </form>
                        <div>
                          <p className="mb-2 text-xs font-medium text-slate-500">Default (cannot remove)</p>
                          <div className="flex flex-wrap gap-2">
                            {MANUAL_EXPENSE_CATEGORIES.map((c) => (
                              <span
                                key={c}
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${categoryColor(c)}`}
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                        {expenseCategories.length > MANUAL_EXPENSE_CATEGORIES.length && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-slate-500">Custom</p>
                            <div className="flex flex-wrap gap-2">
                              {expenseCategories
                                .filter((c) => !MANUAL_EXPENSE_CATEGORIES.includes(c))
                                .map((c) => (
                                  <span
                                    key={c}
                                    className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1.5 text-xs font-medium ${categoryColor(c)}`}
                                  >
                                    {c}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveCategory(c)}
                                      disabled={removingCategory === c}
                                      className="rounded-full p-0.5 hover:bg-black/10 disabled:opacity-50"
                                      title={`Remove ${c}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                            </div>
                          </div>
                        )}
                        <Button type="button" variant="outline" onClick={() => setManageCategoriesOpen(false)}>
                          Done
                        </Button>
                      </DialogContent>
                    </Dialog>
                  <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4" /> Add Expense
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[95vw] max-w-md">
                      <DialogHeader>
                        <DialogTitle>Add Expense</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateExpense} className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="expenseCategory">Category</Label>
                            <Select
                              value={expenseForm.category}
                              onValueChange={(v) => setExpenseForm((p) => ({ ...p, category: v }))}
                            >
                              <SelectTrigger id="expenseCategory">{expenseForm.category}</SelectTrigger>
                              <SelectContent>
                                {expenseCategories.map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {c}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor="expenseDate">Date</Label>
                            <Input
                              id="expenseDate"
                              type="date"
                              value={expenseForm.date}
                              onChange={(e) => setExpenseForm((p) => ({ ...p, date: e.target.value }))}
                              required
                            />
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="expenseAmount">Amount (₹)</Label>
                          <Input
                            id="expenseAmount"
                            type="number"
                            min="0"
                            value={expenseForm.amount}
                            onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))}
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="expenseDescription">Description</Label>
                          <Textarea
                            id="expenseDescription"
                            rows={2}
                            value={expenseForm.description}
                            onChange={(e) =>
                              setExpenseForm((p) => ({ ...p, description: e.target.value }))
                            }
                          />
                        </div>
                        <Button type="submit" disabled={savingExpense}>
                          {savingExpense ? "Saving..." : "Add Expense"}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                  </div>
                </div>

                {expenses.length === 0 ? (
                  <p className="text-sm text-slate-500">No expenses recorded.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {expenses.map((exp) => (
                      <div
                        key={exp.id}
                        className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-slate-200 p-3"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryColor(exp.category)}`}>
                              {exp.category}
                            </span>
                            <span className="text-slate-500">{exp.date}</span>
                          </p>
                          {exp.description && (
                            <p className="text-xs text-slate-500">{exp.description}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-sm font-medium text-slate-900">{inr(exp.amount)}</span>
                          <button onClick={() => handleDeleteExpense(exp.id)}>
                            <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
      </div>

      {assignDialogEvent && (
        <AssignTeamDialog
          open={!!assignDialogEvent}
          onOpenChange={(v) => {
            if (!v) setAssignDialogEvent(null);
          }}
          projectId={id}
          eventId={assignDialogEvent.id}
          eventName={assignDialogEvent.eventName}
          clientName={project?.clientName}
          onUpdated={(updatedEvent) => {
            setEvents((prev) =>
              prev.map((e) => (e.id === updatedEvent.id ? { ...e, ...updatedEvent } : e))
            );
            setAssignDialogEvent(updatedEvent);
          }}
        />
      )}

      <Dialog open={addDeliverableOpen} onOpenChange={setAddDeliverableOpen}>
        <DialogContent className="w-[95vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Deliverable</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddDeliverable} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="newDeliverableType">Name</Label>
              <Input
                id="newDeliverableType"
                autoFocus
                value={newDeliverableType}
                onChange={(e) => setNewDeliverableType(e.target.value)}
                placeholder="e.g. Teaser, Cinematic Trailer"
              />
            </div>
            <Button type="submit" disabled={savingDeliverable}>
              {savingDeliverable ? "Adding..." : "Add"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export default function ProjectDetailPage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <ProjectDetailContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}