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

    async function handleDelete(emp) {
        const confirmed = window.confirm(
            `Permanently delete ${emp.name}? This will remove their account, attendance history, leave records, and device records. This cannot be undone.`
        );
        if (!confirmed) return;

        try {
            await deleteEmployee(emp.uid);
            toast.success(`${emp.name} deleted permanently`);
            setEmployees((prev) => prev.filter((e) => e.uid !== emp.uid));
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

    return (
        <AppShell>
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">Employees</h2>
                <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => {
                        setBulkResults(null);
                        setBulkOpen(true);
                    }}
                >
                    Bulk Add
                </Button>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger className="inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:w-auto">
                        Add Employee
                    </DialogTrigger>
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
                            <div>
                                <Label htmlFor="password">Temporary Password</Label>
                                <Input id="password" type="text" value={form.password} onChange={(e) => updateForm("password", e.target.value)} required />
                            </div>
                            <div>
                                <Label htmlFor="phone">Phone</Label>
                                <Input id="phone" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} />
                            </div>
                            <div>
                                <Label>Role</Label>
                                <Select value={form.role} onValueChange={(v) => updateForm("role", v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {Object.values(ROLES).map((role) => (
                                            <SelectItem key={role} value={role}>{role.replace("_", " ")}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Department</Label>
                                <Select value={form.department} onValueChange={(v) => updateForm("department", v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {DEPARTMENTS.map((dept) => (
                                            <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" disabled={saving}>
                                {saving ? "Creating..." : "Create Employee"}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
                </div>
            </div>

            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <Input
                    placeholder="Search by name, email, or phone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full sm:w-64"
                />
                <div className="grid grid-cols-3 gap-2 sm:flex sm:w-auto">
                    <Select value={deptFilter} onValueChange={setDeptFilter}>
                        <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Department" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All departments</SelectItem>
                            {DEPARTMENTS.map((dept) => (
                                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                        <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Role" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All roles</SelectItem>
                            {Object.values(ROLES).map((role) => (
                                <SelectItem key={role} value={role}>{role.replace("_", " ")}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {(search || deptFilter !== "all" || roleFilter !== "all" || statusFilter !== "all") && (
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
            </div>

            {loading ? (
                <p className="text-sm text-slate-500">Loading employees...</p>
            ) : filteredEmployees.length === 0 ? (
                <p className="text-sm text-slate-500">No employees match your search/filters.</p>
            ) : (
                <div className="grid gap-3">
                    <p className="text-xs text-slate-400">
                        Showing {filteredEmployees.length} of {employees.length} employees
                    </p>
                    {filteredEmployees.map((emp) => (
                        <Card key={emp.uid}>
                            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3">
                                    <AvatarInitials name={emp.name} />
                                    <div className="min-w-0">
                                        <p className="truncate font-medium text-slate-900">{emp.name}</p>
                                        <p className="truncate text-xs text-slate-500">{emp.email} · {emp.department}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <StatusBadge status={emp.status} className="w-fit" />
                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                        <Button size="sm" variant="secondary" onClick={() => openEditor(emp)}>
                                            Edit
                                        </Button>
                                        <Button size="sm" variant="secondary" onClick={() => openBalanceEditor(emp)}>
                                            Leave Balance
                                        </Button>
                                        <Button size="sm" variant="secondary" onClick={() => handleToggleStatus(emp)}>
                                            {emp.status === "active" ? "Deactivate" : "Activate"}
                                        </Button>
                                        <Button size="sm" variant="secondary" onClick={() => handleDelete(emp)}>
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
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
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {Object.values(ROLES).map((role) => (
                                        <SelectItem key={role} value={role}>{role.replace("_", " ")}</SelectItem>
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
                        <p className="text-xs text-slate-500">
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
                <DialogContent className="max-h-[85vh] w-[95vw] max-w-3xl overflow-y-auto">
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
                                    <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 p-3 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-3">
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
                                <p className="break-words text-xs text-slate-500">
                                    CSV columns: <code className="break-all">{CSV_HEADER}</code>. Role and department must match the exact
                                    values used elsewhere in the app (e.g. <code>photographer</code>, <code>Photography</code>).
                                </p>
                                <a
                                    className="text-xs font-medium text-slate-700 underline w-fit"
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
                        <div className="mt-4 flex flex-col gap-1 rounded-md border border-slate-200 p-3">
                            <p className="text-xs font-medium text-slate-700">Results</p>
                            {bulkResults.map((r, i) => (
                                <p key={i} className={`text-xs ${r.success ? "text-emerald-600" : "text-rose-600"}`}>
                                    {r.email} — {r.success ? "created" : r.error}
                                </p>
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
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