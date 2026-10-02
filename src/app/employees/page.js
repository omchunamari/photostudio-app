"use client";

import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import AvatarInitials from "@/components/ui/avatar-initials";
import {
    getAllEmployees,
    deactivateEmployee,
    activateEmployee,
    updateLeaveBalance,
    updateEmployee,
} from "@/lib/firebase/employees";
import { createEmployee, bulkCreateEmployees } from "@/lib/firebase/createEmployee";
import { deleteEmployee } from "@/lib/firebase/deleteEmployee";
import { ROLES } from "@/lib/constants/roles";
import { DEPARTMENTS } from "@/lib/constants/departments";
import { LEAVE_TYPES } from "@/lib/firebase/leave";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/ui/status-badge";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Plus, Upload, Search, Pencil, CalendarDays, UserMinus, UserCheck, Trash2, Users, Building2, Mail, Phone } from "lucide-react";

const EMPTY_ROW = () => ({ name: "", email: "", password: "", phone: "", role: "photographer", department: "Photography" });

const CSV_HEADER = "name,email,password,phone,role,department";
const CSV_TEMPLATE = `${CSV_HEADER}\nJohn Doe,john@therollingstories.com,TempPass123,9876543210,photographer,Photography`;

function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    return lines.slice(1).map((line) => {
        const cells = line.split(",").map((c) => c.trim());
        const row = {};
        headers.forEach((h, i) => {
            row[h] = cells[i] || "";
        });
        return row;
    });
}

const ROLE_LABELS = {
    super_admin: "Super Admin",
    admin: "Admin",
    hr: "HR",
    project_manager: "Project Manager",
    photographer: "Photographer",
    videographer: "Videographer",
    editor: "Editor",
    data_manager: "Data Manager",
    accountant: "Accountant",
};
function roleLabel(role) {
    return ROLE_LABELS[role] || (role || "").replace(/_/g, " ");
}

function StatTile({ icon: Icon, label, value, tone = "neutral" }) {
    const chip = tone === "positive" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground";
    return (
        <Card className="h-full">
            <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">{label}</p>
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${chip}`}><Icon className="h-3.5 w-3.5" /></div>
                </div>
                <p className="mt-2 font-heading text-xl font-semibold tabular-nums text-foreground sm:text-2xl">{value}</p>
            </CardContent>
        </Card>
    );
}

function EmployeesContent() {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState("");
    const [deptFilter, setDeptFilter] = useState("all");
    const [roleFilter, setRoleFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        phone: "",
        role: "photographer",
        department: "Photography",
    });

    const [balanceEmp, setBalanceEmp] = useState(null);
    const [balanceForm, setBalanceForm] = useState({});
    const [savingBalance, setSavingBalance] = useState(false);

    // --- Edit employee ---
    const [editEmp, setEditEmp] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [savingEdit, setSavingEdit] = useState(false);

    // --- Bulk add ---
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkRows, setBulkRows] = useState([EMPTY_ROW()]);
    const [csvText, setCsvText] = useState("");
    const [bulkSaving, setBulkSaving] = useState(false);
    const [bulkResults, setBulkResults] = useState(null);

    async function loadEmployees() {
        setLoading(true);
        const list = await getAllEmployees();
        setEmployees(list);
        setLoading(false);
    }

    useEffect(() => {
        loadEmployees();
    }, []);

    function updateForm(field, value) {
        setForm((prev) => ({ ...prev, [field]: value }));
    }

    async function handleCreate(e) {
        e.preventDefault();
        setSaving(true);
        try {
            await createEmployee(form);
            toast.success("Employee created successfully");
            setDialogOpen(false);
            setForm({ name: "", email: "", password: "", phone: "", role: "photographer", department: "Photography" });
            loadEmployees();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleToggleStatus(emp) {
        const newStatus = emp.status === "active" ? "inactive" : "active";
        if (emp.status === "active") {
            await deactivateEmployee(emp.uid);
            toast.success("Employee deactivated");
        } else {
            await activateEmployee(emp.uid);
            toast.success("Employee activated");
        }
        setEmployees((prev) =>
            prev.map((e) => (e.uid === emp.uid ? { ...e, status: newStatus } : e))
        );
    }

    // Delete is gated by the server's finance check — see /api/employees/delete.
    const [deleteCheck, setDeleteCheck] = useState(null); // { emp, code, blocking, history }
    const [deleting, setDeleting] = useState(false);

    async function handleDelete(emp) {
        const confirmed = window.confirm(
            `Permanently delete ${emp.name}? This will remove their account, attendance history, leave records, and device records. This cannot be undone.\n\nIf they have left the company, Deactivate is usually the better choice.`
        );
        if (!confirmed) return;
        await runDelete(emp, false);
    }

    async function runDelete(emp, force) {
        setDeleting(true);
        try {
            await deleteEmployee(emp.uid, { force });
            toast.success(`${emp.name} deleted permanently`);
            setEmployees((prev) => prev.filter((e) => e.uid !== emp.uid));
            setDeleteCheck(null);
        } catch (err) {
            if (err.code === "FINANCE_PENDING" || err.code === "FINANCE_HISTORY") {
                setDeleteCheck({ emp, code: err.code, blocking: err.blocking, history: err.history });
            } else {
                toast.error(err.message);
            }
        } finally {
            setDeleting(false);
        }
    }

    async function deactivateInstead(emp) {
        try {
            if (emp.status === "active") await deactivateEmployee(emp.uid);
            setEmployees((prev) => prev.map((e) => (e.uid === emp.uid ? { ...e, status: "inactive" } : e)));
            toast.success(`${emp.name} deactivated — their history stays in Finance under "Former staff"`);
            setDeleteCheck(null);
        } catch (err) {
            toast.error(err.message);
        }
    }

    function openEditor(emp) {
        setEditEmp(emp);
        setEditForm({
            name: emp.name || "",
            phone: emp.phone || "",
            role: emp.role,
            department: emp.department,
        });
    }

    async function handleSaveEdit() {
        setSavingEdit(true);
        try {
            await updateEmployee(editEmp.uid, editForm);
            toast.success("Employee updated");
            setEmployees((prev) =>
                prev.map((e) => (e.uid === editEmp.uid ? { ...e, ...editForm } : e))
            );
            setEditEmp(null);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSavingEdit(false);
        }
    }

    function updateBulkRow(index, field, value) {
        setBulkRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    }

    function addBulkRow() {
        setBulkRows((prev) => [...prev, EMPTY_ROW()]);
    }

    function removeBulkRow(index) {
        setBulkRows((prev) => prev.filter((_, i) => i !== index));
    }

    function handleCsvFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setCsvText(String(reader.result || ""));
        reader.readAsText(file);
    }

    async function handleBulkSubmit(rows) {
        const cleaned = rows
            .map((r) => ({ ...r, name: r.name?.trim(), email: r.email?.trim() }))
            .filter((r) => r.name && r.email);

        if (cleaned.length === 0) {
            toast.error("Add at least one employee with a name and email");
            return;
        }

        setBulkSaving(true);
        setBulkResults(null);
        try {
            const result = await bulkCreateEmployees(cleaned);
            setBulkResults(result.results);
            if (result.succeeded > 0) {
                toast.success(`${result.succeeded} employee(s) created`);
            }
            if (result.failed > 0) {
                toast.error(`${result.failed} row(s) failed — see details below`);
            }
            if (result.failed === 0) {
                setBulkRows([EMPTY_ROW()]);
                setCsvText("");
                loadEmployees();
            }
        } catch (err) {
            toast.error(err.message);
        } finally {
            setBulkSaving(false);
        }
    }

    function openBalanceEditor(emp) {
        setBalanceEmp(emp);
        setBalanceForm(emp.leaveBalance || {});
    }

    async function handleSaveBalance() {
        setSavingBalance(true);
        try {
            await updateLeaveBalance(balanceEmp.uid, balanceForm);
            toast.success("Leave balance updated");
            setEmployees((prev) =>
                prev.map((e) => (e.uid === balanceEmp.uid ? { ...e, leaveBalance: balanceForm } : e))
            );
            setBalanceEmp(null);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSavingBalance(false);
        }
    }

    const filteredEmployees = useMemo(() => {
        const q = search.trim().toLowerCase();
        return employees.filter((emp) => {
            if (deptFilter !== "all" && emp.department !== deptFilter) return false;
            if (roleFilter !== "all" && emp.role !== roleFilter) return false;
            if (statusFilter !== "all" && emp.status !== statusFilter) return false;
            if (!q) return true;
            return (
                emp.name?.toLowerCase().includes(q) ||
                emp.email?.toLowerCase().includes(q) ||
                emp.phone?.toLowerCase().includes(q)
            );
        });
    }, [employees, search, deptFilter, roleFilter, statusFilter]);

    const counts = {
        total: employees.length,
        active: employees.filter((e) => e.status === "active").length,
        inactive: employees.filter((e) => e.status !== "active").length,
        departments: new Set(employees.map((e) => e.department).filter(Boolean)).size,
    };
    const hasFilters = search || deptFilter !== "all" || roleFilter !== "all" || statusFilter !== "all";

    function rowActions(emp, withLabels = false) {
        const lbl = (t) => (withLabels ? <span className="text-xs">{t}</span> : null);
        return (
            <>
                <Button size={withLabels ? "sm" : "icon-sm"} variant="ghost" title="Edit" aria-label="Edit" onClick={() => openEditor(emp)}>
                    <Pencil className="h-3.5 w-3.5" />{lbl("Edit")}
                </Button>
                <Button size={withLabels ? "sm" : "icon-sm"} variant="ghost" title="Leave balance" aria-label="Leave balance" onClick={() => openBalanceEditor(emp)}>
                    <CalendarDays className="h-3.5 w-3.5" />{lbl("Leave")}
                </Button>
                <Button size={withLabels ? "sm" : "icon-sm"} variant="ghost" title={emp.status === "active" ? "Deactivate" : "Activate"} aria-label={emp.status === "active" ? "Deactivate" : "Activate"} onClick={() => handleToggleStatus(emp)}>
                    {emp.status === "active" ? <UserMinus className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                    {lbl(emp.status === "active" ? "Deactivate" : "Activate")}
                </Button>
                <Button size={withLabels ? "sm" : "icon-sm"} variant="ghost" title="Delete" aria-label="Delete" onClick={() => handleDelete(emp)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />{lbl("Delete")}
                </Button>
            </>
        );
    }

    return (
        <AppShell>
            <div className="mx-auto w-full max-w-6xl">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="font-heading text-xl font-semibold text-foreground sm:text-2xl">Employees</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">Team accounts, roles, departments and leave balances.</p>
                </div>
                <div className="flex gap-2">
                <Button
                    variant="outline"
                    className="flex-1 sm:flex-none"
                    onClick={() => {
                        setBulkResults(null);
                        setBulkOpen(true);
                    }}
                >
                    <Upload className="h-4 w-4" /> Bulk add
                </Button>
                <Button className="flex-1 sm:flex-none" onClick={() => setDialogOpen(true)}>
                    <Plus className="h-4 w-4" /> Add employee
                </Button>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="max-h-[85vh] w-[95vw] max-w-md overflow-y-auto sm:w-full">
                        <DialogHeader>
                            <DialogTitle>Add New Employee</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleCreate} className="flex flex-col gap-4">
                            <div>
                                <Label htmlFor="name">Full Name</Label>
                                <Input id="name" value={form.name} onChange={(e) => updateForm("name", e.target.value)} required />
                            </div>
                            <div>
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" value={form.email} onChange={(e) => updateForm("email", e.target.value)} required />
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <Label htmlFor="password">Temporary Password</Label>
                                    <Input id="password" type="text" value={form.password} onChange={(e) => updateForm("password", e.target.value)} required />
                                </div>
                                <div>
                                    <Label htmlFor="phone">Phone</Label>
                                    <Input id="phone" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <Label>Role</Label>
                                    <Select value={form.role} onValueChange={(v) => updateForm("role", v)}>
                                        <SelectTrigger className="w-full"><SelectValue>{(v) => roleLabel(v)}</SelectValue></SelectTrigger>
                                        <SelectContent>
                                            {Object.values(ROLES).map((role) => (
                                                <SelectItem key={role} value={role}>{roleLabel(role)}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Department</Label>
                                    <Select value={form.department} onValueChange={(v) => updateForm("department", v)}>
                                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {DEPARTMENTS.map((dept) => (
                                                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <Button type="submit" disabled={saving}>
                                {saving ? "Creating..." : "Create Employee"}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
                </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
                <StatTile icon={Users} label="Total" value={loading ? "–" : counts.total} />
                <StatTile icon={UserCheck} label="Active" value={loading ? "–" : counts.active} tone="positive" />
                <StatTile icon={UserMinus} label="Inactive" value={loading ? "–" : counts.inactive} />
                <StatTile icon={Building2} label="Departments" value={loading ? "–" : counts.departments} />
            </div>

            <Card className="mb-4">
                <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search name, email or phone"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8"
                    />
                </div>
                <div className="grid grid-cols-3 gap-2 sm:flex sm:w-auto">
                    <Select value={deptFilter} onValueChange={setDeptFilter}>
                        <SelectTrigger className="w-full sm:w-40"><SelectValue>{(v) => (v === "all" ? "All departments" : v)}</SelectValue></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All departments</SelectItem>
                            {DEPARTMENTS.map((dept) => (
                                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                        <SelectTrigger className="w-full sm:w-40"><SelectValue>{(v) => (v === "all" ? "All roles" : roleLabel(v))}</SelectValue></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All roles</SelectItem>
                            {Object.values(ROLES).map((role) => (
                                <SelectItem key={role} value={role}>{roleLabel(role)}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full sm:w-32"><SelectValue>{(v) => (v === "all" ? "All statuses" : v === "active" ? "Active" : "Inactive")}</SelectValue></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {hasFilters && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-fit"
                        onClick={() => {
                            setSearch("");
                            setDeptFilter("all");
                            setRoleFilter("all");
                            setStatusFilter("all");
                        }}
                    >
                        Clear filters
                    </Button>
                )}
                <span className="text-xs text-muted-foreground sm:ml-auto">
                    {loading ? "" : `${filteredEmployees.length} of ${employees.length}`}
                </span>
                </CardContent>
            </Card>

            {loading ? (
                <div className="flex animate-pulse flex-col gap-2">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted/70" />)}
                </div>
            ) : filteredEmployees.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">
                        {employees.length === 0 ? "No employees yet. Add your first one." : "No employees match your search or filters."}
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Phone */}
                    <div className="flex flex-col gap-2 md:hidden">
                        {filteredEmployees.map((emp) => (
                            <div key={emp.uid} className={`rounded-xl bg-card p-3 shadow-xs ring-1 ring-foreground/10 ${emp.status !== "active" ? "opacity-70" : ""}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <AvatarInitials name={emp.name} />
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-foreground">{emp.name}</p>
                                            <p className="truncate text-xs text-muted-foreground">{roleLabel(emp.role)} · {emp.department}</p>
                                        </div>
                                    </div>
                                    <StatusBadge status={emp.status} />
                                </div>
                                <div className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 shrink-0" /> {emp.email}</span>
                                    {emp.phone && <span className="flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0" /> {emp.phone}</span>}
                                    <span>Paid leave left: <b className="text-foreground">{emp.leaveBalance?.Paid ?? 0}</b></span>
                                </div>
                                <div className="mt-2 flex flex-wrap justify-end gap-1 border-t border-border pt-2">{rowActions(emp, true)}</div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop */}
                    <Card className="hidden md:flex">
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Employee</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Phone</TableHead>
                                        <TableHead className="text-right">Paid leave</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="w-36" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredEmployees.map((emp) => (
                                        <TableRow key={emp.uid} className={emp.status !== "active" ? "opacity-70" : ""}>
                                            <TableCell>
                                                <div className="flex items-center gap-2.5">
                                                    <AvatarInitials name={emp.name} size="sm" />
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium text-foreground">{emp.name}</p>
                                                        <p className="truncate text-xs text-muted-foreground">{emp.email}{emp.employeeId ? ` · ${emp.employeeId}` : ""}</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{roleLabel(emp.role)}</TableCell>
                                            <TableCell className="text-muted-foreground">{emp.department}</TableCell>
                                            <TableCell className="text-muted-foreground">{emp.phone || "—"}</TableCell>
                                            <TableCell className={`text-right tabular-nums ${(emp.leaveBalance?.Paid ?? 0) < 0 ? "text-destructive" : ""}`}>{emp.leaveBalance?.Paid ?? 0}</TableCell>
                                            <TableCell><StatusBadge status={emp.status} /></TableCell>
                                            <TableCell>
                                                <div className="flex justify-end gap-0.5">{rowActions(emp)}</div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </>
            )}

            <Dialog open={!!balanceEmp} onOpenChange={(open) => !open && setBalanceEmp(null)}>
                <DialogContent className="w-[95vw] max-w-md">
                    <DialogHeader>
                        <DialogTitle>Set Leave Balance — {balanceEmp?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-3">
                        {LEAVE_TYPES.map((type) => (
                            <div key={type} className="flex items-center justify-between gap-3">
                                <Label className="w-28 shrink-0">{type}</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={balanceForm[type] ?? ""}
                                    onChange={(e) =>
                                        setBalanceForm((prev) => ({ ...prev, [type]: Number(e.target.value) }))
                                    }
                                />
                            </div>
                        ))}
                        <Button onClick={handleSaveBalance} disabled={savingBalance}>
                            {savingBalance ? "Saving..." : "Save Balance"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit employee details */}
            <Dialog open={!!editEmp} onOpenChange={(open) => !open && setEditEmp(null)}>
                <DialogContent className="w-[95vw] max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit — {editEmp?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4">
                        <div>
                            <Label htmlFor="editName">Full Name</Label>
                            <Input
                                id="editName"
                                value={editForm.name || ""}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                            />
                        </div>
                        <div>
                            <Label htmlFor="editPhone">Phone</Label>
                            <Input
                                id="editPhone"
                                value={editForm.phone || ""}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                            />
                        </div>
                        <div>
                            <Label>Role</Label>
                            <Select value={editForm.role} onValueChange={(v) => setEditForm((prev) => ({ ...prev, role: v }))}>
                                <SelectTrigger className="w-full"><SelectValue>{(v) => roleLabel(v)}</SelectValue></SelectTrigger>
                                <SelectContent>
                                    {Object.values(ROLES).map((role) => (
                                        <SelectItem key={role} value={role}>{roleLabel(role)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Department</Label>
                            <Select value={editForm.department} onValueChange={(v) => setEditForm((prev) => ({ ...prev, department: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {DEPARTMENTS.map((dept) => (
                                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Email can&apos;t be changed here. To update it, delete and re-add the employee.
                        </p>
                        <Button onClick={handleSaveEdit} disabled={savingEdit}>
                            {savingEdit ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Bulk add employees */}
            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
                <DialogContent className="max-h-[85vh] w-[95vw] max-w-3xl overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Bulk Add Employees</DialogTitle>
                    </DialogHeader>
                    <Tabs defaultValue="manual" className="min-w-0">
                        <TabsList>
                            <TabsTrigger value="manual">Manual Rows</TabsTrigger>
                            <TabsTrigger value="csv">CSV Upload</TabsTrigger>
                        </TabsList>

                        <TabsContent value="manual">
                            <div className="flex flex-col gap-3 pt-2">
                                {bulkRows.map((row, i) => (
                                    <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-3">
                                        <Input placeholder="Full name" value={row.name} onChange={(e) => updateBulkRow(i, "name", e.target.value)} />
                                        <Input placeholder="Email" type="email" value={row.email} onChange={(e) => updateBulkRow(i, "email", e.target.value)} />
                                        <Input placeholder="Temp password" value={row.password} onChange={(e) => updateBulkRow(i, "password", e.target.value)} />
                                        <Input placeholder="Phone" value={row.phone} onChange={(e) => updateBulkRow(i, "phone", e.target.value)} />
                                        <Select value={row.role} onValueChange={(v) => updateBulkRow(i, "role", v)}>
                                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {Object.values(ROLES).map((role) => (
                                                    <SelectItem key={role} value={role}>{role.replace("_", " ")}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <div className="flex min-w-0 gap-2">
                                            <Select value={row.department} onValueChange={(v) => updateBulkRow(i, "department", v)}>
                                                <SelectTrigger className="w-full min-w-0"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {DEPARTMENTS.map((dept) => (
                                                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {bulkRows.length > 1 && (
                                                <Button type="button" variant="ghost" size="sm" onClick={() => removeBulkRow(i)}>
                                                    ✕
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" onClick={addBulkRow}>
                                    + Add Row
                                </Button>
                                <Button onClick={() => handleBulkSubmit(bulkRows)} disabled={bulkSaving}>
                                    {bulkSaving ? "Creating..." : `Create ${bulkRows.length} Employee(s)`}
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="csv" className="min-w-0">
                            <div className="flex min-w-0 flex-col gap-3 pt-2">
                                <p className="break-words text-xs text-muted-foreground">
                                    CSV columns: <code className="break-all">{CSV_HEADER}</code>. Role and department must match the exact
                                    values used elsewhere in the app (e.g. <code>photographer</code>, <code>Photography</code>).
                                </p>
                                <a
                                    className="text-xs font-medium text-foreground/80 underline w-fit"
                                    href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}
                                    download="employees-template.csv"
                                >
                                    Download template
                                </a>
                                <Input type="file" accept=".csv,text/csv" onChange={handleCsvFile} />
                                <Textarea
                                    rows={8}
                                    className="w-full break-all"
                                    placeholder={CSV_TEMPLATE}
                                    value={csvText}
                                    onChange={(e) => setCsvText(e.target.value)}
                                />
                                <Button
                                    onClick={() => handleBulkSubmit(parseCsv(csvText))}
                                    disabled={bulkSaving || !csvText.trim()}
                                >
                                    {bulkSaving ? "Creating..." : "Create from CSV"}
                                </Button>
                            </div>
                        </TabsContent>
                    </Tabs>

                    {bulkResults && (
                        <div className="mt-4 flex flex-col gap-1 rounded-md border border-border p-3">
                            <p className="text-xs font-medium text-foreground/80">Results</p>
                            {bulkResults.map((r, i) => (
                                <p key={i} className={`text-xs ${r.success ? "text-emerald-600" : "text-rose-600"}`}>
                                    {r.email} — {r.success ? "created" : r.error}
                                </p>
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            {/* Finance check: shown when the server refuses or questions a delete */}
            <Dialog open={!!deleteCheck} onOpenChange={(o) => !o && setDeleteCheck(null)}>
                <DialogContent className="w-[95vw] max-w-md sm:w-full">
                    <DialogHeader>
                        <DialogTitle>
                            {deleteCheck?.code === "FINANCE_PENDING"
                                ? `Can't delete ${deleteCheck?.emp.name} yet`
                                : `${deleteCheck?.emp.name} has finance history`}
                        </DialogTitle>
                    </DialogHeader>
                    {deleteCheck && (
                        <div className="flex flex-col gap-4 text-sm">
                            {deleteCheck.blocking.length > 0 && (
                                <div className="rounded-lg bg-destructive/10 p-3">
                                    <p className="mb-1 font-medium text-destructive">Still pending in Finance</p>
                                    <ul className="list-disc pl-5 text-foreground">
                                        {deleteCheck.blocking.map((b) => <li key={b}>{b}</li>)}
                                    </ul>
                                    <p className="mt-2 text-xs text-muted-foreground">Settle these in Finance before deleting.</p>
                                </div>
                            )}
                            {deleteCheck.history.length > 0 && (
                                <div className="rounded-lg bg-muted/60 p-3">
                                    <p className="mb-1 font-medium">Finance records that would be left without an employee</p>
                                    <ul className="list-disc pl-5 text-muted-foreground">
                                        {deleteCheck.history.map((h) => <li key={h}>{h}</li>)}
                                    </ul>
                                </div>
                            )}
                            <p className="text-muted-foreground">
                                <b className="text-foreground">Deactivate instead</b> to stop their login while keeping attendance,
                                payslips and finance history. They&apos;ll appear under &ldquo;Former staff&rdquo; in Finance.
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                <Button variant="outline" onClick={() => setDeleteCheck(null)}>Cancel</Button>
                                {deleteCheck.code === "FINANCE_HISTORY" && (
                                    <Button variant="destructive" disabled={deleting} onClick={() => runDelete(deleteCheck.emp, true)}>
                                        {deleting ? "Deleting..." : "Delete anyway"}
                                    </Button>
                                )}
                                <Button onClick={() => deactivateInstead(deleteCheck.emp)}>Deactivate instead</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            </div>
        </AppShell>
    );
}

export default function EmployeesPage() {
    return (
        <ProtectedRoute allowedRoles={["super_admin", "admin", "hr"]}>
            <DeviceGate>
                <EmployeesContent />
            </DeviceGate>
        </ProtectedRoute>
    );
}