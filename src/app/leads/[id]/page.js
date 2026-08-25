"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { getLeadById, updateLeadStatus, updateLead, deleteLead } from "@/lib/firebase/leads";
import {
  createQuotation,
  updateQuotation,
  getQuotationsForLead,
  setQuotationStatus,
  addQuotationPayment,
  markPaymentPaid,
  markPaymentUnpaid,
  removeQuotationPayment,
  getPaymentSummary,
} from "@/lib/firebase/quotations";
import { createProject, getProjectByQuotationId } from "@/lib/firebase/projects";
import { LEAD_STATUSES, PAYMENT_MODES, PAYMENT_MILESTONE_PRESETS } from "@/lib/constants/leads";
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
import { ArrowLeft, Check, X, Pencil, Trash2 } from "lucide-react";

function LeadDetailContent() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const [lead, setLead] = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState(null); // quotation being edited, or null for "new"
  const [saving, setSaving] = useState(false);
  const [projectMap, setProjectMap] = useState({});
  const [busyId, setBusyId] = useState(null); // quotationId currently mid-action (Won/Lost/Create Project)
  const [paymentForms, setPaymentForms] = useState({}); // quotationId -> draft payment form
  const [editingLead, setEditingLead] = useState(false);
  const [leadForm, setLeadForm] = useState({
    budget: "",
    meetingDate: "",
    followUpDate: "",
    requirements: "",
    meetingNotes: "",
  });
  const [savingLead, setSavingLead] = useState(false);
  const [deletingLead, setDeletingLead] = useState(false);

  const [qForm, setQForm] = useState({
    amount: "",
    deliverables: "",
    paymentTerms: "",
  });

  async function loadData() {
    setLoading(true);
    const l = await getLeadById(id);
    setLead(l);
    if (l) {
      const q = await getQuotationsForLead(id);
      const sorted = q.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setQuotations(sorted);

      const projEntries = await Promise.all(
        sorted
          .filter((qt) => qt.status === "Won")
          .map(async (qt) => [qt.id, await getProjectByQuotationId(qt.id)])
      );
      setProjectMap(Object.fromEntries(projEntries.filter(([, p]) => p)));
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [id]);

  function updateQForm(field, value) {
    setQForm((prev) => ({ ...prev, [field]: value }));
  }

  function openNewQuotation() {
    setEditingQuotation(null);
    setQForm({ amount: "", deliverables: "", paymentTerms: "" });
    setDialogOpen(true);
  }

  function openEditQuotation(q) {
    setEditingQuotation(q);
    setQForm({
      amount: String(q.amount ?? ""),
      deliverables: q.deliverables || "",
      paymentTerms: q.paymentTerms || "",
    });
    setDialogOpen(true);
  }

  async function handleSaveQuotation(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingQuotation) {
        await updateQuotation(editingQuotation.id, qForm);
        toast.success("Quotation updated");
      } else {
        await createQuotation({ ...qForm, leadId: id, clientName: lead.clientName }, user.uid);
        toast.success("Quotation created");
      }
      setDialogOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLeadStatusChange(status) {
    try {
      await updateLeadStatus(id, status);
      setLead((prev) => ({ ...prev, status }));
      toast.success("Status updated");
    } catch (err) {
      toast.error(err.message);
    }
  }

  function openEditLead() {
    setLeadForm({
      budget: String(lead.budget ?? ""),
      meetingDate: lead.meetingDate || "",
      followUpDate: lead.followUpDate || "",
      requirements: lead.requirements || "",
      meetingNotes: lead.meetingNotes || "",
    });
    setEditingLead(true);
  }

  function updateLeadForm(field, value) {
    setLeadForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSaveLead(e) {
    e.preventDefault();
    setSavingLead(true);
    try {
      const data = { ...leadForm, budget: Number(leadForm.budget) || 0 };
      await updateLead(id, data);
      setLead((prev) => ({ ...prev, ...data }));
      setEditingLead(false);
      toast.success("Lead details updated");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingLead(false);
    }
  }

  async function handleDeleteLead() {
    setDeletingLead(true);
    try {
      await deleteLead(id);
      toast.success("Lead deleted");
      router.push("/leads");
    } catch (err) {
      toast.error(err.message);
      setDeletingLead(false);
    }
  }

  // Draft -> Won: flips lead + quotation status, then immediately spins up
  // the linked project (or jumps to it if one already exists) — no
  // "mark advance paid" gate in between anymore.
  async function handleMarkWon(q) {
    setBusyId(q.id);
    try {
      await setQuotationStatus(q.id, "Won", id);
      let project = await getProjectByQuotationId(q.id);
      if (!project) {
        const projectId = await createProject(
          {
            projectName: `${lead.clientName} - ${lead.projectType}`,
            leadId: id,
            quotationId: q.id,
            clientName: lead.clientName,
            deliverables: q.deliverables,
            paymentTerms: q.paymentTerms,
            quotationAmount: q.amount,
          },
          user.uid
        );
        project = { id: projectId };
      }
      toast.success("Quotation won — project created");
      router.push(`/projects/${project.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkLost(q) {
    setBusyId(q.id);
    try {
      await setQuotationStatus(q.id, "Lost", id);
      toast.success("Quotation marked lost");
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function updatePaymentForm(qId, field, value) {
    setPaymentForms((prev) => ({
      ...prev,
      [qId]: { ...(prev[qId] || { label: "Advance", amount: "", dueDate: "", mode: "" }), [field]: value },
    }));
  }

  async function handleAddPayment(qId) {
    const form = paymentForms[qId];
    if (!form?.amount) {
      toast.error("Enter an amount for this payment milestone");
      return;
    }
    try {
      await addQuotationPayment(qId, form);
      setPaymentForms((prev) => ({ ...prev, [qId]: { label: "Milestone", amount: "", dueDate: "", mode: "" } }));
      toast.success("Payment milestone added");
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleTogglePaid(qId, payment) {
    try {
      if (payment.paid) {
        await markPaymentUnpaid(qId, payment.id);
      } else {
        await markPaymentPaid(qId, payment.id);
      }
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleRemovePayment(qId, paymentId) {
    try {
      await removeQuotationPayment(qId, paymentId);
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Loading...</p>
      </AppShell>
    );
  }

  if (!lead) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Lead not found.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <button
        onClick={() => router.push("/leads")}
        className="mb-4 flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Leads
      </button>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">{lead.clientName}</h2>
          <p className="text-sm text-slate-500">{lead.contactDetails}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={lead.status} />
          <Select value={lead.status} onValueChange={handleLeadStatusChange}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon-sm">
                <Trash2 className="h-3.5 w-3.5" />
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
                  onClick={handleDeleteLead}
                  disabled={deletingLead}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {deletingLead ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">Project Type</p>
            <p className="text-sm text-slate-900">{lead.projectType}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Source</p>
            <p className="text-sm text-slate-900">{lead.source}</p>
          </div>

          {editingLead ? (
            <form onSubmit={handleSaveLead} className="col-span-full grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="leadBudget">Budget</Label>
                <Input
                  id="leadBudget"
                  type="number"
                  min="0"
                  value={leadForm.budget}
                  onChange={(e) => updateLeadForm("budget", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="leadMeetingDate">Meeting Date</Label>
                  <Input
                    id="leadMeetingDate"
                    type="date"
                    value={leadForm.meetingDate}
                    onChange={(e) => updateLeadForm("meetingDate", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="leadFollowUpDate">Follow-up Date</Label>
                  <Input
                    id="leadFollowUpDate"
                    type="date"
                    value={leadForm.followUpDate}
                    onChange={(e) => updateLeadForm("followUpDate", e.target.value)}
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="leadRequirements">Requirements</Label>
                <Textarea
                  id="leadRequirements"
                  value={leadForm.requirements}
                  onChange={(e) => updateLeadForm("requirements", e.target.value)}
                  rows={3}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="leadMeetingNotes">Notes</Label>
                <Textarea
                  id="leadMeetingNotes"
                  value={leadForm.meetingNotes}
                  onChange={(e) => updateLeadForm("meetingNotes", e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" size="sm" disabled={savingLead}>
                  {savingLead ? "Saving..." : "Save"}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setEditingLead(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div>
                <p className="text-xs text-slate-500">Budget</p>
                <p className="text-sm text-slate-900">₹{lead.budget || 0}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Meeting Date</p>
                <p className="text-sm text-slate-900">{lead.meetingDate || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Follow-up Date</p>
                <p className="text-sm text-slate-900">{lead.followUpDate || "—"}</p>
              </div>
              {lead.requirements && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-500">Requirements</p>
                  <p className="text-sm text-slate-900">{lead.requirements}</p>
                </div>
              )}
              {lead.meetingNotes && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-500">Notes</p>
                  <p className="text-sm text-slate-900">{lead.meetingNotes}</p>
                </div>
              )}
              <div className="sm:col-span-2">
                <Button size="sm" variant="outline" onClick={openEditLead}>
                  <Pencil className="h-3.5 w-3.5" /> Edit details
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-medium text-slate-900 sm:text-lg">Quotations</h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={openNewQuotation} className="w-full sm:w-auto">New Quotation</Button>
          <DialogContent className="w-[95vw] max-w-md">
            <DialogHeader>
              <DialogTitle>{editingQuotation ? "Edit Quotation" : "Create Quotation"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveQuotation} className="flex flex-col gap-4">
              <div>
                <Label htmlFor="amount">Quotation Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  value={qForm.amount}
                  onChange={(e) => updateQForm("amount", e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="deliverables">Deliverables</Label>
                <Textarea
                  id="deliverables"
                  value={qForm.deliverables}
                  onChange={(e) => updateQForm("deliverables", e.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="paymentTerms">Payment Terms</Label>
                <Textarea
                  id="paymentTerms"
                  value={qForm.paymentTerms}
                  onChange={(e) => updateQForm("paymentTerms", e.target.value)}
                  rows={2}
                  placeholder="e.g. 50% advance, balance on delivery"
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editingQuotation ? "Save Changes" : "Create Quotation"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {quotations.length === 0 ? (
        <p className="text-sm text-slate-500">No quotations yet.</p>
      ) : (
        <div className="grid gap-3">
          {quotations.map((q) => {
            const { totalPaid, balance } = getPaymentSummary(q);
            const form = paymentForms[q.id] || { label: "Advance", amount: "", dueDate: "", mode: "" };
            return (
              <Card key={q.id}>
                <CardContent className="flex flex-col gap-4 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900">₹{q.amount}</p>
                        <StatusBadge status={q.status} />
                      </div>
                      {q.deliverables && (
                        <p className="mt-1 text-xs text-slate-500">Deliverables: {q.deliverables}</p>
                      )}
                      {q.paymentTerms && (
                        <p className="text-xs text-slate-500">Terms: {q.paymentTerms}</p>
                      )}
                      <p className="mt-1 text-xs text-slate-500">
                        Paid: ₹{totalPaid} · Balance: ₹{balance}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {q.status === "Draft" && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => openEditQuotation(q)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" disabled={busyId === q.id} onClick={() => handleMarkWon(q)}>
                            {busyId === q.id ? "Working..." : "Mark Won"}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyId === q.id}
                            onClick={() => handleMarkLost(q)}
                          >
                            Mark Lost
                          </Button>
                        </>
                      )}
                      {q.status === "Won" && projectMap[q.id] && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => router.push(`/projects/${projectMap[q.id].id}`)}
                        >
                          View Project
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Payment tracking */}
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="mb-2 text-xs font-medium text-slate-700">Payment Schedule</p>
                    {(q.payments || []).length === 0 ? (
                      <p className="mb-2 text-xs text-slate-400">No payment milestones added yet.</p>
                    ) : (
                      <div className="mb-3 flex flex-col gap-2">
                        {q.payments.map((p) => (
                          <div
                            key={p.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1.5 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-medium text-slate-800">{p.label}</span>{" "}
                              <span className="text-slate-600">₹{p.amount}</span>
                              {p.mode && <span className="text-slate-400"> · {p.mode}</span>}
                              {p.dueDate && <span className="text-slate-400"> · Due {p.dueDate}</span>}
                              {p.paid && p.paidDate && (
                                <span className="text-green-600"> · Paid {p.paidDate}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant={p.paid ? "secondary" : "default"}
                                className="h-6 px-2 text-[11px]"
                                onClick={() => handleTogglePaid(q.id, p)}
                              >
                                {p.paid ? (
                                  <span className="flex items-center gap-1"><Check className="h-3 w-3" /> Paid</span>
                                ) : (
                                  "Mark Paid"
                                )}
                              </Button>
                              <button
                                onClick={() => handleRemovePayment(q.id, p.id)}
                                className="text-slate-400 hover:text-red-500"
                                title="Remove"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:items-end">
                      <div>
                        <Label className="text-[11px]">Label</Label>
                        <Select value={form.label} onValueChange={(v) => updatePaymentForm(q.id, "label", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PAYMENT_MILESTONE_PRESETS.map((l) => (
                              <SelectItem key={l} value={l}>{l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[11px]">Amount</Label>
                        <Input
                          type="number"
                          min="0"
                          className="h-8 text-xs"
                          value={form.amount}
                          onChange={(e) => updatePaymentForm(q.id, "amount", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-[11px]">Due Date</Label>
                        <Input
                          type="date"
                          className="h-8 text-xs"
                          value={form.dueDate}
                          onChange={(e) => updatePaymentForm(q.id, "dueDate", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-[11px]">Mode</Label>
                        <Select value={form.mode} onValueChange={(v) => updatePaymentForm(q.id, "mode", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Mode" /></SelectTrigger>
                          <SelectContent>
                            {PAYMENT_MODES.map((m) => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button size="sm" className="h-8" onClick={() => handleAddPayment(q.id)}>
                        Add
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

export default function LeadDetailPage() {
  return (
    <ProtectedRoute allowedRoles={["super_admin", "admin", "project_manager"]}>
      <DeviceGate>
        <LeadDetailContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}