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
  getPendingCompOffRequests,
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

const ADMIN_ROLES = ["super_admin", "admin", "hr"];

function LeaveContent() {
  const { user } = useAuth();
  const isAdminView = ADMIN_ROLES.includes(user.role);

  const [history, setHistory] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [compOffRequests, setCompOffRequests] = useState([]);
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
    };
  }

  async function loadData() {
    setLoading(true);
    try {
      if (isAdminView) {
        const yearParam = filterYear === "all" ? undefined : filterYear;
        const all = await getAllLeaveRequests(yearParam);
        const autoLeaves = await getAllAutoLeaveRecords(yearParam);
        const merged = [...all, ...autoLeaves.map(toLeaveShape)].sort((a, b) =>
          (b.appliedAt || "").localeCompare(a.appliedAt || "")
        );
        setAllRequests(merged);
        const pendingCompOffs = await getPendingCompOffRequests();
        setCompOffRequests(pendingCompOffs);
      } else {
        const own = await getLeaveHistoryForEmployee(user.uid);
        const autoLeaves = await getAutoLeaveRecordsForEmployee(user.uid);
        const merged = [...own, ...autoLeaves.map(toLeaveShape)].sort((a, b) =>
          (b.appliedAt || "").localeCompare(a.appliedAt || "")
        );
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
      await decideLeaveRequest(req.id, "approved", user.uid, req);
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
      await decideLeaveRequest(rejectTarget.id, "rejected", user.uid, rejectTarget, rejectionReason);
      toast.success("Leave rejected");
      setRejectTarget(null);
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleCompOffDecision(req, decision) {
    try {
      await decideCompOffRequest(req.id, decision, user.uid, req);
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

  return (
    <AppShell>
      <h2 className="mb-6 text-xl font-semibold text-slate-900 sm:text-2xl">Leave Management</h2>

      {!isAdminView && (
        <Card className="mb-6 max-w-xl">
          <CardContent className="p-5">
            <h3 className="mb-3 font-medium text-slate-900">Your Leave Balance</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {LEAVE_TYPES.map((type) => {
                const balance = user.leaveBalance?.[type] ?? 0;
                return (
                  <div key={type} className="rounded-md border border-slate-200 p-2 text-center">
                    <p className="text-xs text-slate-500">{type}</p>
                    <p className={`text-lg font-bold ${balance < 0 ? "text-red-600" : "text-slate-900"}`}>
                      {balance}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!isAdminView && (
        <Card className="mb-8 max-w-xl">
          <CardContent className="p-5">
            <h3 className="mb-4 font-medium text-slate-900">Apply for Leave</h3>
            <form onSubmit={handleApply} className="flex flex-col gap-4">
              <div>
                <Label>Leave Type</Label>
                <Select value={form.leaveType} onValueChange={(v) => updateForm("leaveType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAVE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className={`mt-1 text-xs ${insufficientBalance ? "text-red-600" : "text-slate-500"}`}>
                  Available: {selectedBalance} day(s)
                  {insufficientBalance && " — insufficient balance to apply"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => updateForm("startDate", e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => updateForm("endDate", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="reason">Reason</Label>
                <Input
                  id="reason"
                  value={form.reason}
                  onChange={(e) => updateForm("reason", e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <Button type="submit" disabled={submitting || insufficientBalance}>
                {submitting ? "Submitting..." : "Apply Leave"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="mb-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-medium text-slate-900 sm:text-lg">
            {isAdminView ? "All Leave Requests" : "Your Leave History"}
          </h3>
          {isAdminView && (
            <Button size="sm" variant="secondary" onClick={exportToExcel}>
              Export to Excel
            </Button>
          )}
        </div>
        {isAdminView && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search by employee, department, reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full max-w-xs"
            />
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
      ) : (
        <div className="grid gap-3">
          {visibleRequests.length === 0 ? (
            <p className="text-sm text-slate-500">No leave requests found.</p>
          ) : (
            visibleRequests.map((req) => (
              <Card key={req.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    {isAdminView && (
                      <p className="font-medium text-slate-900">{req.employeeName}</p>
                    )}
                    <p className="text-sm text-slate-700">
                      {req.leaveType} · {req.startDate} to {req.endDate}
                    </p>
                    {req.reason && <p className="text-xs text-slate-500">{req.reason}</p>}
                    {req.status === "rejected" && req.rejectionReason && (
                      <p className="text-xs text-red-600">Rejected: {req.rejectionReason}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge status={req.status} />
                    {isAdminView && req.status === "pending" && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleApprove(req)}>
                          Approve
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openRejectDialog(req)}>
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {isAdminView && compOffRequests.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-base font-medium text-slate-900 sm:text-lg">
            Pending Comp Off Requests
          </h3>
          <div className="grid gap-3">
            {compOffRequests.map((req) => (
              <Card key={req.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{req.employeeName}</p>
                    <p className="text-sm text-slate-700">Worked on {req.date} (Sunday)</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleCompOffDecision(req, "approved")}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleCompOffDecision(req, "rejected")}>
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Leave Request</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Label htmlFor="rejectionReason">Reason for rejection</Label>
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