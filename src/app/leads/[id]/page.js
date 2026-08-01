"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { getLeadById, updateLeadStatus } from "@/lib/firebase/leads";
import {
  createQuotation,
  getQuotationsForLead,
  markQuotationSent,
  decideQuotation,
  markAdvancePaid,
} from "@/lib/firebase/quotations";
import { createProject, getProjectByQuotationId } from "@/lib/firebase/projects";
import { LEAD_STATUSES } from "@/lib/constants/leads";
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
import StatusBadge from "@/components/ui/status-badge";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

function LeadDetailContent() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const [lead, setLead] = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projectMap, setProjectMap] = useState({});
  const [creatingProject, setCreatingProject] = useState(null);

  const [qForm, setQForm] = useState({
    amount: "",
    advanceAmount: "",
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
          .filter((qt) => qt.status === "Approved" && qt.advancePaid)
          .map(async (qt) => [qt.id, await getProjectByQuotationId(qt.id)])
      );
      setProjectMap(Object.fromEntries(projEntries));
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [id]);

  function updateQForm(field, value) {
    setQForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreateQuotation(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await createQuotation(
        {
          leadId: id,
          clientName: lead.clientName,
          amount: Number(qForm.amount),
          advanceAmount: Number(qForm.advanceAmount) || 0,
          deliverables: qForm.deliverables,
          paymentTerms: qForm.paymentTerms,
        },
        user.uid
      );
      toast.success("Quotation created");
      setDialogOpen(false);
      setQForm({ amount: "", advanceAmount: "", deliverables: "", paymentTerms: "" });
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(status) {
    try {
      await updateLeadStatus(id, status);
      setLead((prev) => ({ ...prev, status }));
      toast.success("Status updated");
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleMarkSent(qId) {
    try {
      await markQuotationSent(qId);
      toast.success("Marked as sent");
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDecision(qId, decision) {
    try {
      await decideQuotation(qId, decision, id);
      toast.success(`Quotation ${decision.toLowerCase()}`);
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleAdvancePaid(qId) {
    try {
      await markAdvancePaid(qId);
      toast.success("Advance marked as paid");
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleCreateProject(q) {
    setCreatingProject(q.id);
    try {
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
      toast.success("Project created");
      router.push(`/projects/${projectId}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingProject(null);
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
          <Select value={lead.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              <p className="text-xs text-slate-500">Meeting / Discussion Notes</p>
              <p className="text-sm text-slate-900">{lead.meetingNotes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-medium text-slate-900 sm:text-lg">Quotations</h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger className="inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:w-auto">
            New Quotation
          </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-md">
            <DialogHeader>
              <DialogTitle>Create Quotation</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateQuotation} className="flex flex-col gap-4">
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
                <Label htmlFor="advanceAmount">Advance Amount</Label>
                <Input
                  id="advanceAmount"
                  type="number"
                  min="0"
                  value={qForm.advanceAmount}
                  onChange={(e) => updateQForm("advanceAmount", e.target.value)}
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
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create Quotation"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {quotations.length === 0 ? (
        <p className="text-sm text-slate-500">No quotations yet.</p>
      ) : (
        <div className="grid gap-3">
          {quotations.map((q) => (
            <Card key={q.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-slate-900">₹{q.amount}</p>
                  <p className="text-xs text-slate-500">
                    Advance: ₹{q.advanceAmount} {q.advancePaid ? "(Paid)" : "(Pending)"}
                  </p>
                  {q.deliverables && (
                    <p className="text-xs text-slate-500">Deliverables: {q.deliverables}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={q.status} />
                  {q.status === "Draft" && (
                    <Button size="sm" onClick={() => handleMarkSent(q.id)}>
                      Mark Sent
                    </Button>
                  )}
                  {q.status === "Sent" && (
                    <>
                      <Button size="sm" onClick={() => handleDecision(q.id, "Approved")}>
                        Client Approved
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handleDecision(q.id, "Rejected")}>
                        Client Rejected
                      </Button>
                    </>
                  )}
                  {q.status === "Approved" && !q.advancePaid && (
                    <Button size="sm" variant="secondary" onClick={() => handleAdvancePaid(q.id)}>
                      Mark Advance Paid
                    </Button>
                  )}
                  {q.status === "Approved" && q.advancePaid && !projectMap[q.id] && (
                    <Button
                      size="sm"
                      onClick={() => handleCreateProject(q)}
                      disabled={creatingProject === q.id}
                    >
                      {creatingProject === q.id ? "Creating..." : "Create Project"}
                    </Button>
                  )}
                  {projectMap[q.id] && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => router.push(`/projects/${projectMap[q.id].id}`)}
                    >
                      View Project
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
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