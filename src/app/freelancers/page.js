"use client";

import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import AvatarInitials from "@/components/ui/avatar-initials";
import { useAuth } from "@/contexts/AuthContext";
import {
    getAllFreelancers,
    createFreelancer,
    updateFreelancer,
    setFreelancerStatus,
    deleteFreelancer,
} from "@/lib/firebase/freelancers";
import { FREELANCER_SKILLS, FREELANCER_SKILL_LABELS } from "@/lib/constants/freelancers";
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
import { toast } from "sonner";
import { Phone, Mail, Pencil, Trash2 } from "lucide-react";

const EMPTY_FORM = { name: "", phone: "", email: "", skill: "photographer", dayRate: "", notes: "" };

function FreelancersContent() {
    const { user } = useAuth();
    const [freelancers, setFreelancers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [skillFilter, setSkillFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");

    const [dialogOpen, setDialogOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    const [editFl, setEditFl] = useState(null);
    const [editForm, setEditForm] = useState(EMPTY_FORM);
    const [savingEdit, setSavingEdit] = useState(false);

    const [deletingId, setDeletingId] = useState(null);

    async function loadFreelancers() {
        setLoading(true);
        try {
            const list = await getAllFreelancers();
            setFreelancers(list);
        } catch (err) {
            toast.error(`Failed loading freelancers: ${err.message}`);
        }
        setLoading(false);
    }

    useEffect(() => {
        loadFreelancers();
    }, []);

    function updateForm(field, value) {
        setForm((prev) => ({ ...prev, [field]: value }));
    }

    async function handleCreate(e) {
        e.preventDefault();
        if (!form.name.trim() || !form.phone.trim()) {
            toast.error("Name and phone are required");
            return;
        }
        setSaving(true);
        try {
            await createFreelancer(form, user.uid);
            toast.success("Freelancer added");
            setDialogOpen(false);
            setForm(EMPTY_FORM);
            loadFreelancers();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSaving(false);
        }
    }

    function openEditor(fl) {
        setEditFl(fl);
        setEditForm({
            name: fl.name || "",
            phone: fl.phone || "",
            email: fl.email || "",
            skill: fl.skill || "photographer",
            dayRate: fl.dayRate || "",
            notes: fl.notes || "",
        });
    }

    async function handleSaveEdit() {
        if (!editForm.name.trim() || !editForm.phone.trim()) {
            toast.error("Name and phone are required");
            return;
        }
        setSavingEdit(true);
        try {
            await updateFreelancer(editFl.id, editForm);
            toast.success("Freelancer updated");
            setFreelancers((prev) =>
                prev.map((f) => (f.id === editFl.id ? { ...f, ...editForm, dayRate: Number(editForm.dayRate) || 0 } : f))
            );
            setEditFl(null);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSavingEdit(false);
        }
    }

    async function handleToggleStatus(fl) {
        const newStatus = fl.status === "active" ? "inactive" : "active";
        try {
            await setFreelancerStatus(fl.id, newStatus);
            setFreelancers((prev) =>
                prev.map((f) => (f.id === fl.id ? { ...f, status: newStatus } : f))
            );
            toast.success(newStatus === "active" ? "Freelancer activated" : "Freelancer deactivated");
        } catch (err) {
            toast.error(err.message);
        }
    }

    async function handleDelete(fl) {
        setDeletingId(fl.id);
        try {
            await deleteFreelancer(fl.id);
            toast.success(`${fl.name} deleted`);
            setFreelancers((prev) => prev.filter((f) => f.id !== fl.id));
        } catch (err) {
            toast.error(err.message);
        } finally {
            setDeletingId(null);
        }
    }

    const filteredFreelancers = useMemo(() => {
        const q = search.trim().toLowerCase();
        return freelancers.filter((fl) => {
            if (skillFilter !== "all" && fl.skill !== skillFilter) return false;
            if (statusFilter !== "all" && fl.status !== statusFilter) return false;
            if (!q) return true;
            return (
                fl.name?.toLowerCase().includes(q) ||
                fl.phone?.toLowerCase().includes(q) ||
                fl.email?.toLowerCase().includes(q)
            );
        });
    }, [freelancers, search, skillFilter, statusFilter]);

    return (
        <AppShell>
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">Freelancers</h2>
                    <p className="text-sm text-slate-500">
                        External crew, kept separate from payroll employees. Used when assigning project teams.
                    </p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setForm(EMPTY_FORM); }}>
                    <DialogTrigger className="inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:w-auto">
                        Add Freelancer
                    </DialogTrigger>
                    <DialogContent className="max-h-[85vh] w-[95vw] max-w-md overflow-y-auto sm:w-full">
                        <DialogHeader>
                            <DialogTitle>Add New Freelancer</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleCreate} className="flex flex-col gap-4">
                            <div>
                                <Label htmlFor="name">Full Name</Label>
                                <Input id="name" value={form.name} onChange={(e) => updateForm("name", e.target.value)} required />
                            </div>
                            <div>
                                <Label htmlFor="phone">Phone</Label>
                                <Input id="phone" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} required />
                            </div>
                            <div>
                                <Label htmlFor="email">Email (optional)</Label>
                                <Input id="email" type="email" value={form.email} onChange={(e) => updateForm("email", e.target.value)} />
                            </div>
                            <div>
                                <Label>Skill</Label>
                                <Select value={form.skill} onValueChange={(v) => updateForm("skill", v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {FREELANCER_SKILLS.map((s) => (
                                            <SelectItem key={s} value={s}>{FREELANCER_SKILL_LABELS[s]}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="dayRate">Day Rate (₹)</Label>
                                <Input id="dayRate" type="number" min="0" value={form.dayRate} onChange={(e) => updateForm("dayRate", e.target.value)} placeholder="e.g. 3000" />
                            </div>
                            <div>
                                <Label htmlFor="notes">Notes (optional)</Label>
                                <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} placeholder="e.g. Preferred for outdoor shoots, based in Andheri" />
                            </div>
                            <Button type="submit" disabled={saving}>
                                {saving ? "Adding..." : "Add Freelancer"}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <Card className="mb-4">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <Input
                        placeholder="Search by name, phone, or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="sm:max-w-xs"
                    />
                    <Select value={skillFilter} onValueChange={setSkillFilter}>
                        <SelectTrigger className="sm:w-44"><SelectValue placeholder="Skill" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Skills</SelectItem>
                            {FREELANCER_SKILLS.map((s) => (
                                <SelectItem key={s} value={s}>{FREELANCER_SKILL_LABELS[s]}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {loading ? (
                <p className="text-sm text-slate-500">Loading...</p>
            ) : filteredFreelancers.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center text-sm text-slate-500">
                        {freelancers.length === 0
                            ? "No freelancers added yet. Click \"Add Freelancer\" to get started."
                            : "No freelancers match your filters."}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredFreelancers.map((fl) => (
                        <Card key={fl.id}>
                            <CardContent className="flex flex-col gap-3 p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <AvatarInitials name={fl.name} size="md" />
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-slate-900">{fl.name}</p>
                                            <p className="text-xs text-slate-500">{FREELANCER_SKILL_LABELS[fl.skill] || fl.skill}</p>
                                        </div>
                                    </div>
                                    <StatusBadge status={fl.status} />
                                </div>

                                <div className="flex flex-col gap-1 text-sm text-slate-600">
                                    <span className="flex items-center gap-1.5">
                                        <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" /> {fl.phone || "—"}
                                    </span>
                                    {fl.email && (
                                        <span className="flex items-center gap-1.5 truncate">
                                            <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" /> {fl.email}
                                        </span>
                                    )}
                                    {fl.dayRate > 0 && (
                                        <span className="text-xs text-slate-500">₹{fl.dayRate.toLocaleString("en-IN")} / day</span>
                                    )}
                                </div>

                                {fl.notes && (
                                    <p className="line-clamp-2 rounded-md bg-slate-50 p-2 text-xs text-slate-500">{fl.notes}</p>
                                )}

                                <div className="mt-1 flex items-center gap-2">
                                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openEditor(fl)}>
                                        <Pencil className="h-3.5 w-3.5" /> Edit
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex-1"
                                        onClick={() => handleToggleStatus(fl)}
                                    >
                                        {fl.status === "active" ? "Deactivate" : "Activate"}
                                    </Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" size="icon-sm">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitleEl>Delete {fl.name}?</AlertDialogTitleEl>
                                                <AlertDialogDescription>
                                                    This permanently removes this freelancer from your directory. This cannot be undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => handleDelete(fl)}
                                                    disabled={deletingId === fl.id}
                                                    className="bg-red-600 hover:bg-red-700"
                                                >
                                                    {deletingId === fl.id ? "Deleting..." : "Delete"}
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

            {/* Edit dialog */}
            <Dialog open={!!editFl} onOpenChange={(open) => !open && setEditFl(null)}>
                <DialogContent className="max-h-[85vh] w-[95vw] max-w-md overflow-y-auto sm:w-full">
                    <DialogHeader>
                        <DialogTitle>Edit Freelancer</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4">
                        <div>
                            <Label htmlFor="edit-name">Full Name</Label>
                            <Input id="edit-name" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} required />
                        </div>
                        <div>
                            <Label htmlFor="edit-phone">Phone</Label>
                            <Input id="edit-phone" value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} required />
                        </div>
                        <div>
                            <Label htmlFor="edit-email">Email (optional)</Label>
                            <Input id="edit-email" type="email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} />
                        </div>
                        <div>
                            <Label>Skill</Label>
                            <Select value={editForm.skill} onValueChange={(v) => setEditForm((p) => ({ ...p, skill: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {FREELANCER_SKILLS.map((s) => (
                                        <SelectItem key={s} value={s}>{FREELANCER_SKILL_LABELS[s]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="edit-dayRate">Day Rate (₹)</Label>
                            <Input id="edit-dayRate" type="number" min="0" value={editForm.dayRate} onChange={(e) => setEditForm((p) => ({ ...p, dayRate: e.target.value }))} />
                        </div>
                        <div>
                            <Label htmlFor="edit-notes">Notes (optional)</Label>
                            <Textarea id="edit-notes" rows={2} value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} />
                        </div>
                        <Button onClick={handleSaveEdit} disabled={savingEdit}>
                            {savingEdit ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </AppShell>
    );
}

export default function FreelancersPage() {
    return (
        <ProtectedRoute allowedRoles={["super_admin", "admin", "project_manager"]}>
            <DeviceGate>
                <FreelancersContent />
            </DeviceGate>
        </ProtectedRoute>
    );
}