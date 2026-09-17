"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  LEAVE_TYPES,
  applyLeave,
  getLeaveHistoryForEmployee,
  getAllLeaveRequests,
  decideLeaveRequest,
} from "@/lib/firebase/leave";
import {
  getAllCompOffRequests,
  getCompOffHistoryForEmployee,
  decideCompOffRequest,
} from "@/lib/firebase/compOff";
import {
  getAutoLeaveRecordsForEmployee,
  getAllAutoLeaveRecords,
} from "@/lib/firebase/attendance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";
import { toast } from "sonner";
import StatusBadge from "@/components/ui/status-badge";
import { Search, Download } from "lucide-react";
import { formatDateIST } from "@/lib/dateIST";

const ADMIN_ROLES = ["super_admin", "admin", "hr"];

function LeaveContent() {
  const { user } = useAuth();
  const isAdminView = ADMIN_ROLES.includes(user.role);

  const [history, setHistory] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    leaveType: "Paid",
    startDate: "",
    endDate: "",
    reason: "",
  });

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const CURRENT_YEAR = String(new Date().getFullYear());

  const [filterMonth, setFilterMonth] = useState("all");
  const [filterYear, setFilterYear] = useState(CURRENT_YEAR);
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  function toLeaveShape(rec) {
    return {
      id: `auto_${rec.id}`,
      employeeUid: rec.employeeUid,
      employeeName: rec.employeeName,
      department: rec.department,
      leaveType: "Paid",
      startDate: rec.date,
      endDate: rec.date,
      reason: "Auto-marked — no check-in recorded",
      status: "auto_leave",
      appliedAt: rec.createdAt,
      rejectionReason: null,
      kind: "auto",
    };
  }

  function toCompOffLeaveShape(rec) {
    return {
      id: `compoff_${rec.id}`,
      rawId: rec.id,
      employeeUid: rec.employeeUid,
      employeeName: rec.employeeName,
      department: rec.department,
      leaveType: "Comp Off",
      startDate: rec.date,
      endDate: rec.date,
      reason: `Worked on ${rec.date} (Sunday)`,
      status: rec.status,
      appliedAt: rec.requestedAt,
      rejectionReason: null,
      kind: "compoff",
    };
  }

  // Leave requests come first, then comp off, then auto-marked leave; most recent within each group first.
  const KIND_ORDER = { leave: 0, compoff: 1, auto: 2 };
  function sortRequests(list) {
    return [...list].sort((a, b) => {
      const kindDiff = (KIND_ORDER[a.kind] ?? 0) - (KIND_ORDER[b.kind] ?? 0);
      if (kindDiff !== 0) return kindDiff;
      return (b.appliedAt || "").localeCompare(a.appliedAt || "");
    });
  }

  async function loadData() {
    setLoading(true);
    try {
      if (isAdminView) {
        const yearParam = filterYear === "all" ? undefined : filterYear;
        const all = await getAllLeaveRequests(yearParam);
        const autoLeaves = await getAllAutoLeaveRecords(yearParam);
        const compOffs = await getAllCompOffRequests(yearParam);
        const merged = sortRequests([
          ...all.map((r) => ({ ...r, kind: "leave" })),
          ...compOffs.map(toCompOffLeaveShape),
          ...autoLeaves.map(toLeaveShape),
        ]);
        setAllRequests(merged);
      } else {
        const own = await getLeaveHistoryForEmployee(user.uid);
        const autoLeaves = await getAutoLeaveRecordsForEmployee(user.uid);
        const ownCompOffs = await getCompOffHistoryForEmployee(user.uid);
        const merged = sortRequests([
          ...own.map((r) => ({ ...r, kind: "leave" })),
          ...ownCompOffs.map(toCompOffLeaveShape),
          ...autoLeaves.map(toLeaveShape),
        ]);
        setHistory(merged);
      }
    } catch (err) {
      console.error("Failed to load leave data:", err);
      toast.error(err.message || "Failed to load leave data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [user.uid, isAdminView, filterYear]);

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleApply(e) {
    e.preventDefault();
    if (!form.startDate || !form.endDate) {
      toast.error("Please select both start and end dates");
      return;
    }

    const currentBalance = user.leaveBalance?.[form.leaveType] ?? 0;
    if (currentBalance <= 0) {
      toast.error(`You have a negative or zero ${form.leaveType} leave balance. Contact admin.`);
      return;
    }

    setSubmitting(true);
    try {
      await applyLeave({
        employeeUid: user.uid,
        employeeName: user.name,
        department: user.department,
        ...form,
      });
      toast.success("Leave request submitted");
      setForm({ leaveType: "Paid", startDate: "", endDate: "", reason: "" });
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(req) {
    try {
      await decideLeaveRequest(req.id, "approved", user.uid, req, undefined, user.name);
      toast.success("Leave approved");
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  function openRejectDialog(req) {
    setRejectTarget(req);
    setRejectionReason("");
  }

  async function submitRejection() {
    if (!rejectionReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    try {
      await decideLeaveRequest(rejectTarget.id, "rejected", user.uid, rejectTarget, rejectionReason, user.name);
      toast.success("Leave rejected");
      setRejectTarget(null);
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleCompOffDecision(req, decision) {
    try {
      await decideCompOffRequest(req.rawId, decision, user.uid, req);
      toast.success(`Comp off ${decision}`);
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const selectedBalance = user.leaveBalance?.[form.leaveType] ?? 0;
  const insufficientBalance = selectedBalance <= 0;

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const availableYears = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i));

  const STATUS_OPTIONS = ["pending", "approved", "rejected", "auto_leave"];

  const filteredRequests = allRequests.filter((req) => {
    if (!req.startDate) {
      if (filterMonth !== "all" || filterYear !== "all") return false;
    } else {
      const [year, month] = req.startDate.split("-");
      if (filterYear !== "all" && year !== filterYear) return false;
      if (filterMonth !== "all" && MONTH_NAMES[Number(month) - 1] !== filterMonth) return false;
    }
    if (filterStatus !== "all" && req.status !== filterStatus) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      const haystack = `${req.employeeName || ""} ${req.department || ""} ${req.leaveType || ""} ${req.reason || ""}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });

  const visibleRequests = isAdminView ? filteredRequests : history;

  function exportToExcel() {
    const rows = visibleRequests.map((req) => ({
      Employee: req.employeeName || "",
      Department: req.department || "",
      "Leave Type": req.leaveType || "",
      "Start Date": req.startDate || "",
      "End Date": req.endDate || "",
      Status: req.status || "",
      Reason: req.reason || "",
      "Rejection Reason": req.rejectionReason || "",
    }));

    if (rows.length === 0) {
      toast.error("No leave requests to export");
      return;
    }

    const headers = Object.keys(rows[0]);
    const escapeCell = (value) => `"${String(value).replace(/"/g, '""')}"`;
    const csvLines = [
      headers.join(","),
      ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(",")),
    ];
    const csvContent = "\uFEFF" + csvLines.join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStamp = new Date().toISOString().split("T")[0];
    link.href = url;
    link.download = `leave-requests-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Exported to Excel/CSV");
  }

  // Row-level accent so pending/rejected items are scannable at a glance
  // without repeating the status text everywhere.
  function rowAccent(status) {
    switch (status) {
      case "approved":
        return "border-l-emerald-500";
      case "rejected":
        return "border-l-red-400";
      case "pending":
        return "border-l-amber-400";
      case "auto_leave":
        return "border-l-slate-300";
      default:
        return "border-l-slate-200";
    }
  }

  return (
    <AppShell>
      <div className="mb-7">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-[1.7rem]">Leave Management</h2>
        <p className="mt-1 text-sm text-slate-500">
          {isAdminView
            ? "Review and decide on leave, comp off, and auto-marked requests."
            : "Apply for leave and keep track of where each request stands."}
        </p>
      </div>

      {!isAdminView && (
        <Card className="mb-8 overflow-hidden border-slate-200">
          <CardContent className="grid grid-cols-1 p-0 lg:grid-cols-[1fr_1.4fr]">
            {/* Balance strip */}
            <div className="border-b border-slate-100 p-5 lg:border-b-0 lg:border-r">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Your Balance
              </h3>
              <div className="flex flex-col divide-y divide-slate-100">
                {LEAVE_TYPES.map((type) => {
                  const balance = user.leaveBalance?.[type] ?? 0;
                  return (
                    <div key={type} className="flex items-baseline justify-between py-2 first:pt-0 last:pb-0">
                      <span className="text-sm text-slate-600">{type}</span>
                      <span className={`text-lg font-semibold tabular-nums ${balance < 0 ? "text-red-600" : "text-slate-900"}`}>
                        {balance}
                        <span className="ml-1 text-xs font-normal text-slate-400">
                          day{balance !== 1 && "s"}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Apply form */}
            <div className="p-5">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Apply for Leave
              </h3>
              <form onSubmit={handleApply} className="flex flex-col gap-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-slate-500">Leave Type</Label>
                    <Select value={form.leaveType} onValueChange={(v) => updateForm("leaveType", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LEAVE_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="reason" className="text-xs font-medium text-slate-500">Reason</Label>
                    <Input
                      id="reason"
                      value={form.reason}
                      onChange={(e) => updateForm("reason", e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <p className={`-mt-1.5 text-xs ${insufficientBalance ? "font-medium text-red-600" : "text-slate-500"}`}>
                  Available: {selectedBalance} day{selectedBalance !== 1 && "s"}
                  {insufficientBalance && " — insufficient balance to apply"}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="startDate" className="text-xs font-medium text-slate-500">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={form.startDate}
                      onChange={(e) => updateForm("startDate", e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate" className="text-xs font-medium text-slate-500">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={form.endDate}
                      onChange={(e) => updateForm("endDate", e.target.value)}
                      required
                    />
                  </div>
                </div>
                <Button type="submit" disabled={submitting || insufficientBalance} className="mt-1 self-start">
                  {submitting ? "Submitting..." : "Apply Leave"}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900 sm:text-lg">
            {isAdminView ? "All Leave Requests" : "Your Leave History"}
          </h3>
          {isAdminView && (
            <Button size="sm" variant="secondary" onClick={exportToExcel}>
              <Download className="h-3.5 w-3.5" /> Export to Excel
            </Button>
          )}
        </div>
        {isAdminView && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search by employee, department, reason..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8"
              />
            </div>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Month" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {MONTH_NAMES.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-[110px]"><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === "auto_leave" ? "Auto-Marked" : status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : visibleRequests.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-200 py-10 text-center">
          <p className="text-sm text-slate-500">No leave requests found.</p>
        </div>
      ) : (
        <Card className="overflow-hidden border-slate-200 p-0">
          <div className="flex flex-col divide-y divide-slate-100">
            {visibleRequests.map((req) => (
              <div
                key={req.id}
                className={`flex flex-col gap-2.5 border-l-[3px] px-4 py-3 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${rowAccent(req.status)}`}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    {isAdminView && (
                      <span className="font-medium text-slate-900">{req.employeeName}</span>
                    )}
                    <span className="text-sm text-slate-700">
                      {req.leaveType} <span className="text-slate-300">·</span> {formatDateIST(req.startDate)} to {formatDateIST(req.endDate)}
                    </span>
                  </p>
                  {req.reason && <p className="mt-0.5 text-xs text-slate-500">{req.reason}</p>}
                  {req.status === "rejected" && req.rejectionReason && (
                    <p className="mt-0.5 text-xs font-medium text-red-600">Rejected: {req.rejectionReason}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                  <StatusBadge status={req.status} />
                  {isAdminView && req.status === "pending" && req.kind === "leave" && (
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => handleApprove(req)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" className="h-7 px-2.5 text-xs" onClick={() => openRejectDialog(req)}>
                        Reject
                      </Button>
                    </div>
                  )}
                  {isAdminView && req.status === "pending" && req.kind === "compoff" && (
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => handleCompOffDecision(req, "approved")}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" className="h-7 px-2.5 text-xs" onClick={() => handleCompOffDecision(req, "rejected")}>
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Leave Request</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Label htmlFor="rejectionReason" className="text-xs font-medium text-slate-500">Reason for rejection</Label>
            <Input
              id="rejectionReason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Insufficient staffing that week"
            />
            <Button onClick={submitRejection}>Submit Rejection</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export default function LeavePage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <LeaveContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}