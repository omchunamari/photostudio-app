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
  addHardDisk,
  updateHardDisk,
  toggleHardDiskReceived,
  setHardDiskStatus,
  removeHardDisk,
  HARD_DISK_STATUSES,
} from "@/lib/firebase/projects";
import { createEvent, getEventsForProject, sumEventTeamCost, updateEventTeam } from "@/lib/firebase/events";
import { getAllEmployees } from "@/lib/firebase/employees";
import {
  ensureDeliverablesForProject,
  addDeliverable,
  deleteDeliverable,
  getAllDeliverableCategories,
  addCustomDeliverableCategory,
  removeCustomDeliverableCategory,
  DEFAULT_DELIVERABLE_CATEGORIES,
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
import { getTransactionsForProject, getAccounts } from "@/lib/firebase/finance";
import { plExpense, plIncome } from "@/lib/finance/calc";
import { PROJECT_STATUSES } from "@/lib/constants/projects";
import { PROJECT_TYPES } from "@/lib/constants/leads";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import CategoryField from "@/components/CategoryField";
import StatusBadge from "@/components/ui/status-badge";
import { formatDateIST } from "@/lib/dateIST";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Crown, X, ChevronDown, HardDrive, FileText, Wallet, UserSquare2 } from "lucide-react";

const ADMIN_ROLES = ["super_admin", "admin", "project_manager"];

function formatDate(dateStr) {
  return formatDateIST(dateStr);
}

function _legacyFormatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

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

// Deterministic initials + color per team member, for the small avatar
// chips on the Events timeline (mirrors categoryColor's hash approach).
const AVATAR_COLOR_PALETTE = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];
function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || name[0].toUpperCase();
}
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLOR_PALETTE[hash % AVATAR_COLOR_PALETTE.length];
}

/** Category-wise deliverables list — one collapsed-by-default card per
 *  category (mirrors the same pattern on the Post-Production page), each
 *  expanding to the existing per-deliverable card list. Replaces the old
 *  "All Categories" select filter so every category stays reachable at a
 *  glance instead of hiding everything else. */
function DeliverablesByCategoryCards({ deliverables, isAdminOrPM, deletingDeliverableId, onDelete }) {
  const categories = Array.from(new Set(deliverables.map((d) => d.category).filter(Boolean)));
  if (deliverables.some((d) => !d.category)) categories.push("Uncategorized");

  const [openCategories, setOpenCategories] = useState(() => new Set());

  function toggleCategory(c) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {categories.map((c) => {
        const rows = deliverables.filter((d) => (d.category || "Uncategorized") === c);
        const isOpen = openCategories.has(c);
        return (
          <Card key={c} className="overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCategory(c)}
              className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-slate-50"
            >
              <div className="flex items-center gap-2">
                <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${c === "Uncategorized" ? "bg-slate-100 text-slate-600" : categoryColor(c)}`}>
                  {c}
                </span>
                <span className="text-xs text-slate-500">
                  {rows.length} deliverable{rows.length === 1 ? "" : "s"}
                </span>
              </div>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="flex flex-col gap-2 border-t border-slate-100 p-3">
                {rows.map((d) => (
                  <Card key={d.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate font-medium text-slate-900">{d.type}</p>
                          {d.category && (
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${categoryColor(d.category)}`}>
                              {d.category}
                            </span>
                          )}
                        </div>
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
                            onClick={() => onDelete(d)}
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
          </Card>
        );
      })}
    </div>
  );
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
  const [newDeliverableCategory, setNewDeliverableCategory] = useState(DEFAULT_DELIVERABLE_CATEGORIES[0]);
  const [savingDeliverable, setSavingDeliverable] = useState(false);
  const [deletingDeliverableId, setDeletingDeliverableId] = useState(null);
  const [deliverableCategories, setDeliverableCategories] = useState(DEFAULT_DELIVERABLE_CATEGORIES);
  const [hddForm, setHddForm] = useState({
    label: "",
    capacityGB: "",
    eventId: "",
    status: HARD_DISK_STATUSES[0],
  });
  const [savingHdd, setSavingHdd] = useState(false);
  const [togglingHddId, setTogglingHddId] = useState(null);
  const [updatingHddStatusId, setUpdatingHddStatusId] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  // Finance-module ledger rows for this project (income / expenses entered in
  // Finance). Only loaded for roles the ledger rules allow.
  const [ledgerTxs, setLedgerTxs] = useState([]);
  // Cash / bank accounts, so money entered here can be tied to the account it
  // moved through (admin / super_admin only — same boundary as the ledger).
  const [financeAccounts, setFinanceAccounts] = useState([]);
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
    eventType: "",
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
    accountId: "",
    note: "",
  });

  // --- Other Expenses ---
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState(MANUAL_EXPENSE_CATEGORIES);
  const [expenseForm, setExpenseForm] = useState({
    category: MANUAL_EXPENSE_CATEGORIES[0],
    amount: "",
    description: "",
    accountId: "",
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

      setDetailsForm({ projectName: p.projectName || "", eventType: p.eventType || "" });
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
          const delCats = await getAllDeliverableCategories();
          setDeliverableCategories(delCats);
        } catch (err) {
          toast.error(`Failed loading deliverable categories: ${err.message}`);
        }
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
        if (["super_admin", "admin"].includes(user.role)) {
          try {
            setLedgerTxs(await getTransactionsForProject(id));
            setFinanceAccounts((await getAccounts()).filter((a) => a.active !== false));
          } catch (err) {
            console.error("Finance ledger unavailable:", err);
          }
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
      await setProjectLeader(id, emp?.uid || null, emp?.name || null, user.name);
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
      await updateProjectDetails(id, {
        projectName: detailsForm.projectName,
        eventType: detailsForm.eventType || null,
      });
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
      await addDeliverable(project, newDeliverableType.trim(), newDeliverableCategory);
      toast.success("Deliverable added");
      setAddDeliverableOpen(false);
      setNewDeliverableType("");
      setNewDeliverableCategory(deliverableCategories[0] || DEFAULT_DELIVERABLE_CATEGORIES[0]);
      const dels = await ensureDeliverablesForProject(project);
      setDeliverables(dels);
    } catch (err) {
      toast.error(err.message || "Failed to add deliverable");
    } finally {
      setSavingDeliverable(false);
    }
  }

  // These four take a plain name and let errors propagate: CategoryField
  // owns the pending/error state and shows failures inline next to the
  // input, which is more useful than a toast that covers the dialog.
  async function handleAddDeliverableCategory(name) {
    const next = await addCustomDeliverableCategory(name);
    setDeliverableCategories([...DEFAULT_DELIVERABLE_CATEGORIES, ...next]);
  }

  async function handleRemoveDeliverableCategory(name) {
    const next = await removeCustomDeliverableCategory(name);
    setDeliverableCategories([...DEFAULT_DELIVERABLE_CATEGORIES, ...next]);
    // Never leave the form pointing at a category that no longer exists.
    setNewDeliverableCategory((c) => (c === name ? DEFAULT_DELIVERABLE_CATEGORIES[0] : c));
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

  async function handleAddHardDisk() {
    if (!hddForm.label.trim() && !hddForm.capacityGB) {
      toast.error("Enter a label or capacity");
      return;
    }
    setSavingHdd(true);
    try {
      const entry = await addHardDisk(id, {
        label: hddForm.label.trim(),
        capacityGB: hddForm.capacityGB ? Number(hddForm.capacityGB) : null,
        eventId: hddForm.eventId || null,
        status: hddForm.status,
      });
      setProject((prev) => ({ ...prev, hardDisks: [...(prev.hardDisks || []), entry] }));
      setHddForm({ label: "", capacityGB: "", eventId: "", status: HARD_DISK_STATUSES[0] });
      toast.success("Hard disk added");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingHdd(false);
    }
  }

  async function handleToggleHardDiskReceived(diskId) {
    setTogglingHddId(diskId);
    try {
      await toggleHardDiskReceived(id, diskId);
      setProject((prev) => ({
        ...prev,
        hardDisks: (prev.hardDisks || []).map((d) =>
          d.id === diskId
            ? { ...d, received: !d.received, receivedAt: !d.received ? new Date().toISOString() : null }
            : d
        ),
      }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTogglingHddId(null);
    }
  }

  async function handleUpdateHardDiskStatus(diskId, status) {
    setUpdatingHddStatusId(diskId);
    try {
      await setHardDiskStatus(id, diskId, status);
      setProject((prev) => ({
        ...prev,
        hardDisks: (prev.hardDisks || []).map((d) =>
          d.id === diskId
            ? {
                ...d,
                status,
                received: status === "Received",
                receivedAt: status === "Received" ? new Date().toISOString() : null,
              }
            : d
        ),
      }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUpdatingHddStatusId(null);
    }
  }

  async function handleRemoveHardDisk(diskId) {
    if (!confirm("Remove this hard disk entry?")) return;
    try {
      await removeHardDisk(id, diskId);
      setProject((prev) => ({ ...prev, hardDisks: (prev.hardDisks || []).filter((d) => d.id !== diskId) }));
      toast.success("Hard disk removed");
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
          accountId: invoiceForm.status === "paid" ? invoiceForm.accountId || null : null,
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

  // Marking an invoice paid asks where the money landed (when the user can see
  // accounts), so the Cash/Bank balance moves at that moment, not later.
  const [payInvoice, setPayInvoice] = useState(null);
  const [payAccount, setPayAccount] = useState("");
  const [payDate, setPayDate] = useState("");

  function handleToggleInvoiceStatus(inv) {
    if (inv.status !== "paid" && financeAccounts.length > 0) {
      setPayInvoice(inv);
      setPayAccount("");
      setPayDate(new Date().toISOString().slice(0, 10));
      return;
    }
    return toggleInvoiceStatus(inv);
  }

  async function confirmInvoicePaid() {
    const inv = payInvoice;
    setPayInvoice(null);
    await toggleInvoiceStatus(inv, { accountId: payAccount || null, paidAt: payDate });
  }

  async function toggleInvoiceStatus(inv, paid = {}) {
    const nextStatus = inv.status === "paid" ? "unpaid" : "paid";
    // Mirror the paidAt stamp setInvoiceStatus writes, so the optimistic
    // local row matches what's in Firestore without a refetch.
    const nextPaidAt = nextStatus === "paid" ? paid.paidAt || new Date().toISOString().slice(0, 10) : null;
    try {
      await setInvoiceStatus(inv.id, nextStatus, nextPaidAt, paid.accountId);
      setInvoices((prev) =>
        prev.map((i) =>
          i.id === inv.id
            ? { ...i, status: nextStatus, paidAt: nextPaidAt, accountId: nextStatus === "paid" ? paid.accountId ?? i.accountId ?? null : null }
            : i
        )
      );
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
          accountId: expenseForm.accountId || null,
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
        accountId: "",
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

  async function handleAddCategory(name) {
    const next = await addCustomExpenseCategory(name);
    setExpenseCategories([...MANUAL_EXPENSE_CATEGORIES, ...next]);
  }

  async function handleRemoveCategory(name) {
    const next = await removeCustomExpenseCategory(name);
    setExpenseCategories([...MANUAL_EXPENSE_CATEGORIES, ...next]);
    // If the expense form currently has this category selected, fall back
    // to the first default so it never points at a removed value.
    setExpenseForm((p) =>
      p.category === name ? { ...p, category: MANUAL_EXPENSE_CATEGORIES[0] } : p
    );
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
  // Received / expenses = the project's own invoices & expenses PLUS anything
  // entered once in the Finance module — same numbers Finance reports show.
  const ledgerReceived = ledgerTxs.reduce((sum, t) => sum + plIncome(t), 0);
  const ledgerExpenses = ledgerTxs.reduce((sum, t) => sum + plExpense(t), 0);
  const received = sumReceived(invoices) + ledgerReceived;
  const balanceDue = Math.max(packageAmount - received, 0);
  const receivedPct = packageAmount > 0 ? Math.round((received / packageAmount) * 100) : 0;
  const balancePct = packageAmount > 0 ? Math.round((balanceDue / packageAmount) * 100) : 0;
  const teamCost = events.reduce((sum, ev) => sum + sumEventTeamCost(ev.team), 0);
  const teamCostPct = packageAmount > 0 ? Math.round((teamCost / packageAmount) * 100) : 0;
  const otherExpensesTotal = expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0) + ledgerExpenses;
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
          <h2 className="truncate font-heading text-2xl font-semibold text-slate-900 sm:text-3xl">
            {project.projectName}
          </h2>
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-slate-500">
            {/* Client name IS the lead name — the project is created from the
                lead and carries its name across. When the project came from a
                lead, that name links back to it so the full enquiry history,
                quotes and call log stay one click away. */}
            {project.leadId ? (
              <Link
                href={`/leads/${project.leadId}`}
                className="inline-flex items-center gap-1 font-medium text-slate-700 underline-offset-2 hover:text-foreground hover:underline"
              >
                <UserSquare2 className="h-3.5 w-3.5" />
                {project.leadName || project.clientName}
              </Link>
            ) : (
              <span>{project.clientName}</span>
            )}
            {project.eventType ? <span>· {project.eventType}</span> : null}
            {events.length > 0 ? (
              <span>· {events.length} event{events.length === 1 ? "" : "s"}</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={project.status} className="h-7 px-3 text-[13px]" />
          <Link href={`/post-production?projectId=${project.id}`}>
            <Button size="sm" variant="secondary" className="rounded-full">Post-Production</Button>
          </Link>
          <SearchableSelect
            value={project.status}
            onValueChange={handleStatusChange}
            options={PROJECT_STATUSES}
            className="h-8 w-36 rounded-full text-xs sm:w-40"
            searchPlaceholder="Search statuses..."
          />

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full">
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

      {/* --- Financial summary: hero Net Profit + payments bar, then a
          Package / Team Cost / Other Expenses row underneath. --- */}
      {isAdminOrPM && (
        <div className="mb-6 flex flex-col gap-3">
          {["super_admin", "admin"].includes(user.role) && (
            <div className="flex justify-end text-xs">
              <Link href="/finance/transactions" className="font-medium text-emerald-700 hover:underline">
                Add income / expense for this project in Finance →
              </Link>
            </div>
          )}
          <Card>
            <CardContent className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Net Profit</p>
                <p className="mt-1 font-heading text-4xl font-semibold text-emerald-600">{inr(netProfit)}</p>
                <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  {marginPct}% margin
                </span>
              </div>
              <div className="flex-1 sm:max-w-md sm:pl-8 sm:border-l sm:border-slate-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">Payments collected</span>
                  <span className="text-slate-500">
                    {inr(received)} of {inr(packageAmount)}
                  </span>
                </div>
                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-red-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(receivedPct, 100)}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Received — {inr(received)} ({receivedPct}%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-400" /> Balance due — {inr(balanceDue)} ({balancePct}%)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Package</p>
                {editingPackage ? (
                  <p className="mt-1 flex items-center gap-1 text-xl font-semibold text-slate-900">
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
                      className="w-28 border-b border-slate-300 bg-transparent text-xl font-semibold text-slate-900 outline-none focus:border-slate-900"
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
                    className={`mt-1 block text-left text-xl font-semibold text-slate-900 ${
                      isAdminOrPM ? "rounded hover:bg-slate-50" : ""
                    }`}
                  >
                    {inr(packageAmount)}
                  </button>
                )}
                <p className="text-xs text-slate-400">100% base value</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Team Cost</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{inr(teamCost)}</p>
                <p className="text-xs text-slate-400">{teamCostPct}% of package</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Other Expenses</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{inr(otherExpensesTotal)}</p>
                <p className="text-xs text-slate-400">{otherExpensesPct}% of package</p>
              </CardContent>
            </Card>
          </div>
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
                  onChange={(e) => setDetailsForm((p) => ({ ...p, projectName: e.target.value }))}
                  required
                />
              </div>
              <div className="w-36">
                <Label className="text-xs text-slate-500">Event Type</Label>
                <SearchableSelect
                  value={detailsForm.eventType}
                  onValueChange={(v) => setDetailsForm((p) => ({ ...p, eventType: v }))}
                  options={PROJECT_TYPES}
                  placeholder="Select..."
                  className="h-8"
                  searchPlaceholder="Search..."
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
                    <FileText className="h-4 w-4 text-slate-400" />
                    <h3 className="font-heading text-lg font-semibold text-slate-900">Invoices</h3>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      New
                    </span>
                  </div>
                  <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="rounded-full" onClick={openInvoiceDialog}>
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
                        {financeAccounts.length > 0 && invoiceForm.status === "paid" && (
                          <div>
                            <Label>Received into account</Label>
                            <SearchableSelect
                              value={invoiceForm.accountId}
                              onValueChange={(v) => setInvoiceForm((p) => ({ ...p, accountId: v }))}
                              options={financeAccounts.map((a) => ({ value: a.id, label: a.name }))}
                              placeholder="Select account..."
                            />
                            <p className="mt-1 text-xs text-slate-500">Optional — lets this move that account&apos;s balance. Can be set later in Finance.</p>
                          </div>
                        )}
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
                            {inv.invoiceNumber} · {formatDateIST(inv.date)}
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

          {/* --- Events --- date-block timeline: each event gets a
              month/day tile on a connecting vertical line, a card with
              per-member avatar chips, and a Team Cost + Manage Team footer. */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-heading text-lg font-semibold text-slate-900 sm:text-xl">Events</h3>
              {events.length > 0 && (
                <p className="text-xs text-slate-500 sm:text-sm">
                  {events.length} event{events.length === 1 ? "" : "s"} · {inr(teamCost)} total team cost
                </p>
              )}
            </div>
            {events.length === 0 ? (
              <p className="text-sm text-slate-500">No events yet. Add one to start assigning a team.</p>
            ) : (
              <ol className="relative flex flex-col gap-5">
                {[...events]
                  .sort((a, b) =>
                    (a.eventStartDate || "").localeCompare(b.eventStartDate || "") ||
                    (a.createdAt || "").localeCompare(b.createdAt || "")
                  )
                  .map((ev, idx, arr) => {
                    const done = isEventPast(ev);
                    const evCost = sumEventTeamCost(ev.team);
                    const assignedCount = ev.team?.length || 0;
                    const start = ev.eventStartDate ? new Date(ev.eventStartDate) : null;
                    const month = start && !Number.isNaN(start.getTime())
                      ? start.toLocaleDateString("en-IN", { month: "short" }).toUpperCase()
                      : "—";
                    const day = start && !Number.isNaN(start.getTime()) ? start.getDate() : "–";
                    const dayCount =
                      ev.eventStartDate && ev.eventEndDate
                        ? Math.max(
                            1,
                            Math.round(
                              (new Date(ev.eventEndDate) - new Date(ev.eventStartDate)) / 86400000
                            ) + 1
                          )
                        : ev.shootDays || 1;
                    return (
                      <li key={ev.id} className="relative flex gap-4">
                        {/* Date tile + connecting line */}
                        <div className="flex shrink-0 flex-col items-center">
                          <div
                            className={`flex w-16 flex-col items-center justify-center rounded-lg border py-2 ${
                              done
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-50 text-slate-700"
                            }`}
                          >
                            <span className="text-[10px] font-semibold tracking-wide">{month}</span>
                            <span className="font-heading text-xl font-semibold leading-none">{day}</span>
                          </div>
                          {idx < arr.length - 1 && (
                            <span className="mt-1 w-px flex-1 bg-slate-200" aria-hidden="true" />
                          )}
                        </div>

                        <Card className="mb-1 flex-1 transition hover:border-slate-300">
                          <CardContent className="p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <Link href={`/projects/${id}/events/${ev.id}`} className="min-w-0 flex-1">
                                <p className="truncate font-heading text-base font-semibold text-slate-900">
                                  {ev.eventName}
                                </p>
                                <p className="truncate text-xs text-slate-500">
                                  {dayCount} day{dayCount !== 1 && "s"} · {assignedCount} of{" "}
                                  {assignedCount || 0} assigned
                                </p>
                              </Link>
                              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                                    assignedCount > 0
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  {assignedCount > 0 && "✓ "}
                                  {assignedCount > 0 ? "Fully Assigned" : "Not Assigned"}
                                </span>
                                <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setAssignDialogEvent(ev)}>
                                  Assign →
                                </Button>
                              </div>
                            </div>

                            {assignedCount > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {ev.team.map((m) => (
                                  <span
                                    key={m.uid}
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 text-xs text-slate-700"
                                  >
                                    <span
                                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarColor(
                                        m.name
                                      )}`}
                                    >
                                      {initials(m.name)}
                                    </span>
                                    <span className="font-medium text-slate-800">{m.name}</span>
                                    {m.costLabel && m.costLabel !== "Full Day" && (
                                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                                        {m.costLabel}
                                      </span>
                                    )}
                                    {editingCost?.eventId === ev.id && editingCost?.uid === m.uid ? (
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
                                        className="w-16 border-b border-slate-400 bg-transparent text-xs text-slate-700 outline-none"
                                      />
                                    ) : (
                                      (m.cost > 0 || isAdminOrPM) && (
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
                                          className={`font-medium text-slate-500 ${
                                            isAdminOrPM
                                              ? "cursor-pointer underline decoration-dotted hover:text-slate-800"
                                              : ""
                                          }`}
                                          title={isAdminOrPM ? "Click to edit amount" : undefined}
                                        >
                                          {inr(m.cost || 0)}
                                        </span>
                                      )
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                              <p className="text-sm text-slate-600">
                                Team Cost <span className="font-semibold text-slate-900">{inr(evCost)}</span>
                              </p>
                              <div className="flex items-center gap-3">
                                <span className="flex w-[100px] justify-center">
                                  <StatusBadge status={ev.status} />
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setAssignDialogEvent(ev)}
                                  className="text-sm font-medium text-slate-500 underline decoration-dotted hover:text-slate-900"
                                >
                                  Manage Team
                                </button>
                              </div>
                            </div>
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
              <h3 className="font-heading text-lg font-semibold text-slate-900">Deliverables</h3>
              <div className="flex flex-wrap items-center gap-2">
                {isAdminOrPM && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setAddDeliverableOpen(true)}>
                    <Plus className="h-4 w-4" /> Add Deliverable
                  </Button>
                </div>
              )}
              </div>
            </div>
            {deliverables.length === 0 ? (
              <p className="text-sm text-slate-500">No deliverables yet.</p>
            ) : (
              <DeliverablesByCategoryCards
                deliverables={deliverables}
                isAdminOrPM={isAdminOrPM}
                deletingDeliverableId={deletingDeliverableId}
                onDelete={handleDeleteDeliverable}
              />
            )}
            <p className="mt-2 text-xs text-slate-400">
              Assignment, dates, and deadlines are set from the Post-Production page.
            </p>
          </div>

          {/* --- Hard Disks --- each entry can be tied to a specific event
              (or left "Not event-specific") and carries a status from
              HARD_DISK_STATUSES, editable inline via a Select. */}
          <Card className="mb-6">
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-slate-400" />
                <h3 className="font-heading text-lg font-semibold text-slate-900">Client Hard Disks</h3>
              </div>
              {(project.hardDisks || []).length === 0 ? (
                <p className="text-sm text-slate-500">No hard disks logged yet.</p>
              ) : (
                <div className="mb-4 space-y-2">
                  {(project.hardDisks || []).map((d) => {
                    const linkedEvent = events.find((e) => e.id === d.eventId);
                    return (
                      <div
                        key={d.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {d.label || "Hard Disk"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {linkedEvent ? linkedEvent.eventName : "Not event-specific"}
                            {" · "}
                            {d.capacityGB ? `${d.capacityGB} GB` : "Capacity not set"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={d.status || (d.received ? "Received" : HARD_DISK_STATUSES[0])}
                            onValueChange={(v) => handleUpdateHardDiskStatus(d.id, v)}
                            disabled={updatingHddStatusId === d.id}
                          >
                            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {HARD_DISK_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <button
                            type="button"
                            onClick={() => handleRemoveHardDisk(d.id)}
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-slate-500">Label</Label>
                  <Input
                    value={hddForm.label}
                    onChange={(e) => setHddForm((prev) => ({ ...prev, label: e.target.value }))}
                    placeholder="e.g. Photos Day 1"
                    className="h-9 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wide text-slate-500">Event</Label>
                  <Select
                    value={hddForm.eventId || "none"}
                    onValueChange={(v) => setHddForm((prev) => ({ ...prev, eventId: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue>
                        {(v) => {
                          if (!v || v === "none") return "Not event-specific";
                          return events.find((ev) => ev.id === v)?.eventName || "Not event-specific";
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="!w-[320px] max-w-[90vw]" align="start">
                      <SelectItem value="none">Not event-specific</SelectItem>
                      {events.map((ev) => (
                        <SelectItem key={ev.id} value={ev.id} className="whitespace-normal">
                          {ev.eventName}
                          {ev.eventStartDate ? ` · ${formatDate(ev.eventStartDate)}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wide text-slate-500">Capacity</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      value={hddForm.capacityGB}
                      onChange={(e) => setHddForm((prev) => ({ ...prev, capacityGB: e.target.value }))}
                      placeholder="e.g. 1000"
                      className="h-9 pr-10 text-sm"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                      GB
                    </span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wide text-slate-500">Status</Label>
                  <Select
                    value={hddForm.status}
                    onValueChange={(v) => setHddForm((prev) => ({ ...prev, status: v }))}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HARD_DISK_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button size="sm" className="mt-3 rounded-full" onClick={handleAddHardDisk} disabled={savingHdd}>
                <Plus className="h-4 w-4" /> Add Hard Disk
              </Button>
            </CardContent>
          </Card>

          {/* --- Other Expenses --- */}
          {isAdminOrPM && (
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-slate-400" />
                    <h3 className="font-heading text-lg font-semibold text-slate-900">Other Expenses</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                  <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="rounded-full">
                        <Plus className="h-4 w-4" /> Add Expense
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[95vw] max-w-md">
                      <DialogHeader>
                        <DialogTitle>Add Expense</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateExpense} className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-3">
                          <CategoryField
                            id="expenseCategory"
                            label="Category"
                            value={expenseForm.category}
                            onValueChange={(v) => setExpenseForm((p) => ({ ...p, category: v }))}
                            categories={expenseCategories}
                            builtIns={MANUAL_EXPENSE_CATEGORIES}
                            onAdd={handleAddCategory}
                            onRemove={handleRemoveCategory}
                          />
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
                        {financeAccounts.length > 0 && true && (
                          <div>
                            <Label>Paid from account</Label>
                            <SearchableSelect
                              value={expenseForm.accountId}
                              onValueChange={(v) => setExpenseForm((p) => ({ ...p, accountId: v }))}
                              options={financeAccounts.map((a) => ({ value: a.id, label: a.name }))}
                              placeholder="Select account..."
                            />
                            <p className="mt-1 text-xs text-slate-500">Optional — lets this move that account&apos;s balance. Can be set later in Finance.</p>
                          </div>
                        )}
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
                            <span className="text-slate-500">{formatDateIST(exp.date)}</span>
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

      <Dialog open={!!payInvoice} onOpenChange={(o) => !o && setPayInvoice(null)}>
        <DialogContent className="w-[95vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark {payInvoice?.invoiceNumber} as paid</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label>Received into account</Label>
              <SearchableSelect
                value={payAccount}
                onValueChange={setPayAccount}
                options={financeAccounts.map((a) => ({ value: a.id, label: a.name }))}
                placeholder="Select account..."
              />
            </div>
            <div>
              <Label htmlFor="payInvoiceDate">Date received</Label>
              <Input id="payInvoiceDate" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <Button onClick={confirmInvoicePaid} disabled={!payAccount || !payDate}>
              Mark as paid
            </Button>
            <button
              type="button"
              className="text-xs text-slate-500 hover:underline"
              onClick={() => {
                const inv = payInvoice;
                setPayInvoice(null);
                toggleInvoiceStatus(inv);
              }}
            >
              Skip — assign the account later in Finance
            </button>
          </div>
        </DialogContent>
      </Dialog>

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
            <CategoryField
              id="newDeliverableCategory"
              label="Category"
              value={newDeliverableCategory}
              onValueChange={setNewDeliverableCategory}
              categories={deliverableCategories}
              builtIns={DEFAULT_DELIVERABLE_CATEGORIES}
              onAdd={handleAddDeliverableCategory}
              onRemove={handleRemoveDeliverableCategory}
            />
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