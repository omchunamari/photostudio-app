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
import { Phone, Mail, Pencil, Trash2, LayoutGrid, List, Plus, Search, Users, UserCheck, IndianRupee, Camera } from "lucide-react";

const EMPTY_FORM = { name: "", phone: "", email: "", skill: "photographer", halfDayRate: "", fullDayRate: "", notes: "" };

function FreelancersContent() {
    const { user } = useAuth();
    const [freelancers, setFreelancers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [skillFilter, setSkillFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [view, setView] = useState("grid"); // grid | list

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
            halfDayRate: fl.halfDayRate || "",
            fullDayRate: fl.fullDayRate || fl.dayRate || "",
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
                prev.map((f) => (f.id === editFl.id
                    ? {
                        ...f,
                        ...editForm,
                        halfDayRate: Number(editForm.halfDayRate) || 0,
                        fullDayRate: Number(editForm.fullDayRate) || 0,
                        dayRate: Number(editForm.fullDayRate) || 0,
                    }
                    : f))
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

    const activeCount = freelancers.filter((f) => f.status === "active").length;
    const rates = freelancers.map((f) => Number(f.fullDayRate || f.dayRate) || 0).filter(Boolean);
    const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
    const skillCounts = FREELANCER_SKILLS.map((sk) => [sk, freelancers.filter((f) => f.skill === sk).length]).filter(([, n]) => n > 0);
    const hasFilters = search || skillFilter !== "all" || statusFilter !== "all";

    return (
        <AppShell>
            <div className="mx-auto w-full max-w-6xl">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="font-heading text-xl font-semibold text-foreground sm:text-2xl">Freelancers</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        External crew, kept separate from payroll employees. Used when assigning project teams.
                    </p>
                </div>
                <Button className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
                    <Plus className="h-4 w-4" /> Add freelancer
                </Button>
                <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setForm(EMPTY_FORM); }}>
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
                                    <SelectTrigger className="w-full"><SelectValue>{(v) => FREELANCER_SKILL_LABELS[v] || v}</SelectValue></SelectTrigger>
                                    <SelectContent>
                                        {FREELANCER_SKILLS.map((s) => (
                                            <SelectItem key={s} value={s}>{FREELANCER_SKILL_LABELS[s]}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="halfDayRate">Half Day Rate (₹)</Label>
                                    <Input id="halfDayRate" type="number" min="0" value={form.halfDayRate} onChange={(e) => updateForm("halfDayRate", e.target.value)} placeholder="e.g. 1500" />
                                </div>
                                <div>
                                    <Label htmlFor="fullDayRate">Full Day Rate (₹)</Label>
                                    <Input id="fullDayRate" type="number" min="0" value={form.fullDayRate} onChange={(e) => updateForm("fullDayRate", e.target.value)} placeholder="e.g. 3000" />
                                </div>
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

            <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
                {[
                    ["Total", freelancers.length, Users],
                    ["Active", activeCount, UserCheck],
                    ["Avg full-day rate", avgRate ? `₹${avgRate.toLocaleString("en-IN")}` : "—", IndianRupee],
                    ["Top skill", skillCounts.length ? `${FREELANCER_SKILL_LABELS[[...skillCounts].sort((a, b) => b[1] - a[1])[0][0]]}` : "—", Camera],
                ].map(([label, value, Icon]) => (
                    <Card key={label} className="h-full">
                        <CardContent className="p-3 sm:p-4">
                            <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">{label}</p>
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-3.5 w-3.5" /></div>
                            </div>
                            <p className="mt-2 truncate font-heading text-xl font-semibold tabular-nums text-foreground sm:text-2xl">{loading ? "–" : value}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="mb-4">
                <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="relative w-full sm:max-w-xs">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search name, phone or email"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                    <Select value={skillFilter} onValueChange={setSkillFilter}>
                        <SelectTrigger className="w-full sm:w-44"><SelectValue>{(v) => (v === "all" ? "All skills" : FREELANCER_SKILL_LABELS[v] || v)}</SelectValue></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Skills</SelectItem>
                            {FREELANCER_SKILLS.map((s) => (
                                <SelectItem key={s} value={s}>{FREELANCER_SKILL_LABELS[s]}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full sm:w-40"><SelectValue>{(v) => (v === "all" ? "All statuses" : v === "active" ? "Active" : "Inactive")}</SelectValue></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                    </Select>
                    {hasFilters && (
                        <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setSkillFilter("all"); setStatusFilter("all"); }}>
                            Clear filters
                        </Button>
                    )}
                    <div className="flex items-center gap-1 self-end rounded-md border border-border p-0.5 sm:ml-auto sm:self-auto">
                        <Button
                            type="button"
                            variant={view === "grid" ? "default" : "ghost"}
                            size="icon-sm"
                            onClick={() => setView("grid")}
                            aria-label="Grid view"
                        >
                            <LayoutGrid className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            type="button"
                            variant={view === "list" ? "default" : "ghost"}
                            size="icon-sm"
                            onClick={() => setView("list")}
                            aria-label="List view"
                        >
                            <List className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {loading ? (
                <div className="grid animate-pulse gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 rounded-xl bg-muted/70" />)}
                </div>
            ) : filteredFreelancers.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">
                        {freelancers.length === 0
                            ? "No freelancers added yet. Click \"Add Freelancer\" to get started."
                            : "No freelancers match your filters."}
                    </CardContent>
                </Card>
            ) : (
                <div className={view === "grid" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-2"}>
                    {filteredFreelancers.map((fl) => (
                        <Card key={fl.id}>
                            <CardContent className={view === "grid" ? "flex flex-col gap-3 p-4" : "flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"}>
                                <div className={view === "grid" ? "flex items-start justify-between gap-2" : "flex min-w-0 flex-1 items-center gap-4"}>
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <AvatarInitials name={fl.name} size="md" />
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-foreground">{fl.name}</p>
                                            <p className="text-xs text-muted-foreground">{FREELANCER_SKILL_LABELS[fl.skill] || fl.skill}</p>
                                        </div>
                                    </div>
                                    {view === "grid" ? (
                                        <StatusBadge status={fl.status} />
                                    ) : (
                                        <div className="hidden shrink-0 items-center gap-1.5 text-sm text-muted-foreground sm:flex">
                                            <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" /> {fl.phone ? <a href={`tel:${fl.phone}`} className="hover:text-foreground hover:underline">{fl.phone}</a> : "—"}
                                        </div>
                                    )}
                                    {view === "list" && (fl.halfDayRate > 0 || fl.fullDayRate > 0) && (
                                        <div className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                                            {fl.halfDayRate > 0 && <>₹{fl.halfDayRate.toLocaleString("en-IN")} / half-day</>}
                                            {fl.halfDayRate > 0 && fl.fullDayRate > 0 && " · "}
                                            {fl.fullDayRate > 0 && <>₹{fl.fullDayRate.toLocaleString("en-IN")} / full-day</>}
                                        </div>
                                    )}
                                    {view === "list" && <StatusBadge status={fl.status} />}
                                </div>

                                {view === "grid" && (
                                    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                                        <span className="flex items-center gap-1.5">
                                            <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                                            {fl.phone ? <a href={`tel:${fl.phone}`} className="hover:text-foreground hover:underline">{fl.phone}</a> : "—"}
                                        </span>
                                        {fl.email && (
                                            <span className="flex items-center gap-1.5 truncate">
                                                <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" /> <a href={`mailto:${fl.email}`} className="truncate hover:text-foreground hover:underline">{fl.email}</a>
                                            </span>
                                        )}
                                        {(fl.halfDayRate > 0 || fl.fullDayRate > 0) && (
                                            <span className="text-xs text-muted-foreground">
                                                {fl.halfDayRate > 0 && <>₹{fl.halfDayRate.toLocaleString("en-IN")} / half-day</>}
                                                {fl.halfDayRate > 0 && fl.fullDayRate > 0 && " · "}
                                                {fl.fullDayRate > 0 && <>₹{fl.fullDayRate.toLocaleString("en-IN")} / full-day</>}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {view === "grid" && fl.notes && (
                                    <p className="line-clamp-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">{fl.notes}</p>
                                )}

                                <div className={view === "grid" ? "mt-1 flex items-center gap-2" : "flex shrink-0 items-center gap-2"}>
                                    <Button variant="outline" size="sm" className={view === "grid" ? "flex-1" : ""} onClick={() => openEditor(fl)}>
                                        <Pencil className="h-3.5 w-3.5" /> Edit
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className={view === "grid" ? "flex-1" : ""}
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
                                                    className="bg-destructive text-white hover:bg-destructive/90"
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
                                <SelectTrigger className="w-full"><SelectValue>{(v) => FREELANCER_SKILL_LABELS[v] || v}</SelectValue></SelectTrigger>
                                <SelectContent>
                                    {FREELANCER_SKILLS.map((s) => (
                                        <SelectItem key={s} value={s}>{FREELANCER_SKILL_LABELS[s]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label htmlFor="edit-halfDayRate">Half Day Rate (₹)</Label>
                                <Input id="edit-halfDayRate" type="number" min="0" value={editForm.halfDayRate} onChange={(e) => setEditForm((p) => ({ ...p, halfDayRate: e.target.value }))} />
                            </div>
                            <div>
                                <Label htmlFor="edit-fullDayRate">Full Day Rate (₹)</Label>
                                <Input id="edit-fullDayRate" type="number" min="0" value={editForm.fullDayRate} onChange={(e) => setEditForm((p) => ({ ...p, fullDayRate: e.target.value }))} />
                            </div>
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
            </div>
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