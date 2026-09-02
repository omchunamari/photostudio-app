"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  getLeadById,
  updateLeadStatus,
  updateLeadPriority,
  updateLead,
  deleteLead,
  getLeadActivities,
  addLeadActivity,
  scheduleFollowUp,
} from "@/lib/firebase/leads";
import { getAllEmployees } from "@/lib/firebase/employees";
import {
  getQuotationsForLead,
  setQuotationStatus,
  duplicateQuotation,
  deleteQuotation,
} from "@/lib/firebase/quotations";
import { createProject, getProjectByLeadId } from "@/lib/firebase/projects";
import {
  LEAD_STATUSES,
  LEAD_PRIORITIES,
  PROJECT_TYPES,
  LEAD_SOURCES,
  ACTIVITY_TYPES,
} from "@/lib/constants/leads";
import {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_STYLES,
} from "@/lib/constants/quotations";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  X,
  Pencil,
  Trash2,
  Phone,
  Mail,
  MessageCircle,
  CalendarClock,
  StickyNote,
  Sparkles,
  CalendarDays,
  Eye,
  Copy,
  Link as LinkIcon,
  Globe,
} from "lucide-react";

const ACTIVITY_ICONS = {
  call: Phone,
  whatsapp: MessageCircle,
  message: MessageCircle,
  email: Mail,
  meeting: CalendarDays,
  note: StickyNote,
  system: Sparkles,
};

function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
}

function LeadDetailContent() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const [lead, setLead] = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [activities, setActivities] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null); // this lead's project, if converted
  const [converting, setConverting] = useState(false);
  const [editingLead, setEditingLead] = useState(false);
  const [leadForm, setLeadForm] = useState({
    phone: "", email: "", projectType: "", eventDate: "", eventDetails: "",
    source: "", budget: "", handledByUid: "", priority: "",
  });
  const [savingLead, setSavingLead] = useState(false);
  const [deletingLead, setDeletingLead] = useState(false);

  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  const [activeTab, setActiveTab] = useState("call");
  const [activityText, setActivityText] = useState("");
  const [postingActivity, setPostingActivity] = useState(false);

  async function loadData() {
    setLoading(true);
    const l = await getLeadById(id);
    setLead(l);
    if (l) {
      const [q, acts, emps, proj] = await Promise.all([
        getQuotationsForLead(id),
        getLeadActivities(id),
        getAllEmployees(),
        getProjectByLeadId(id),
      ]);
      const sorted = q.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setQuotations(sorted);
      setActivities(acts);
      setEmployees(emps);
      setProject(proj);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleQuoteStatusChange(quoteId, status) {
    try {
      await setQuotationStatus(quoteId, status);
      setQuotations((prev) => prev.map((q) => (q.id === quoteId ? { ...q, status } : q)));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDuplicateQuote(quoteId) {
    try {
      await duplicateQuotation(quoteId, user.uid);
      toast.success("Quote duplicated");
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleCopyQuoteLink(quoteId) {
    const url = `${window.location.origin}/q/${quoteId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error(url);
    }
  }

  async function handleDeleteQuote(quoteId) {
    try {
      await deleteQuotation(quoteId);
      toast.success("Quote deleted");
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleLeadStatusChange(status) {
    try {
      await updateLeadStatus(id, status);
      setLead((prev) => ({ ...prev, status }));
      toast.success("Stage updated");
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleLeadPriorityChange(priority) {
    try {
      await updateLeadPriority(id, priority);
      setLead((prev) => ({ ...prev, priority }));
      toast.success("Priority updated");
    } catch (err) {
      toast.error(err.message);
    }
  }

  function openEditLead() {
    setLeadForm({
      phone: lead.phone || "",
      email: lead.email || "",
      projectType: lead.projectType || "",
      eventDate: lead.eventDate || "",
      eventDetails: lead.eventDetails || "",
      source: lead.source || "",
      budget: String(lead.budget ?? ""),
      handledByUid: lead.handledByUid || "",
      priority: lead.priority || "",
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
      const handledBy = employees.find((emp) => emp.uid === leadForm.handledByUid);
      const data = {
        ...leadForm,
        budget: Number(leadForm.budget) || 0,
        handledByName: handledBy?.name || "",
      };
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

  async function handleMarkLostDirect() {
    await handleLeadStatusChange("Lost");
  }

  function openFollowUp() {
    setFollowUpDate(lead.followUpDate || "");
    setFollowUpTime(lead.followUpTime || "");
    setFollowUpOpen(true);
  }

  async function handleSaveFollowUp() {
    setSavingFollowUp(true);
    try {
      await scheduleFollowUp(id, followUpDate, followUpTime, user.uid, user.name);
      setLead((prev) => ({ ...prev, followUpDate: followUpDate || null, followUpTime: followUpTime || null }));
      setFollowUpOpen(false);
      loadData();
      toast.success(followUpDate ? "Follow-up scheduled" : "Follow-up cleared");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingFollowUp(false);
    }
  }

  async function handlePostActivity() {
    if (!activityText.trim() && activeTab !== "meeting") {
      toast.error("Write something first");
      return;
    }
    setPostingActivity(true);
    try {
      await addLeadActivity(id, { type: activeTab, text: activityText.trim() }, user.uid, user.name);
      setActivityText("");
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPostingActivity(false);
    }
  }

  // "Convert to Project" is independent of any single quote's status now
  // (quotes just track draft/sent/accepted/declined/expired for the
  // client-facing side) — jump to the lead's project if one already
  // exists, otherwise spin one up directly from the lead.
  async function handleConvertToProject() {
    if (project) {
      router.push(`/projects/${project.id}`);
      return;
    }
    setConverting(true);
    try {
      // Prefer the accepted quote (if any) for the project's linked quotationId
      // and starting package amount; fall back to the most recently created
      // quote, then to the lead's budget if there are no quotes at all.
      const acceptedQuote = quotations.find((q) => q.status === "accepted");
      const sourceQuote = acceptedQuote || quotations[0] || null;

      const projectId = await createProject(
        {
          projectName: `${lead.clientName} - ${lead.projectType || "Project"}`,
          leadId: id,
          quotationId: sourceQuote?.id || null,
          clientName: lead.clientName,
          quotationAmount: sourceQuote?.amount ?? lead.budget ?? 0,
        },
        user.uid
      );
      toast.success("Converted to project");
      router.push(`/projects/${projectId}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConverting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </AppShell>
    );
  }

  if (!lead) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Lead not found.</p>
      </AppShell>
    );
  }

  const activityConfig = ACTIVITY_TYPES.find((a) => a.value === activeTab);

  return (
    <AppShell>
      <button
        onClick={() => router.push("/leads")}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Leads
      </button>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Lead</p>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-2xl font-semibold text-foreground">{lead.clientName}</h2>
            {lead.origin === "form" && (
              <Badge
                variant="outline"
                className="gap-1 border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]"
              >
                <Globe data-icon="inline-start" />
                Form
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleConvertToProject} disabled={converting}>
            {converting ? "Converting..." : "Convert to Project"}
          </Button>
          {!["Lost", "Converted", "No Response", "Won"].includes(lead.status) && (
            <Button variant="outline" className="text-red-600 hover:text-red-700" onClick={handleMarkLostDirect}>
              Mark Lost
            </Button>
          )}
          <Button variant="outline" onClick={openEditLead}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
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

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Select value={lead.status} onValueChange={handleLeadStatusChange}>
          <SelectTrigger className="h-8 w-auto border-none bg-transparent p-0 shadow-none [&>svg]:ml-1">
            <StatusBadge status={lead.status} className="h-7 px-3 text-sm" />
          </SelectTrigger>
          <SelectContent>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={lead.priority || ""} onValueChange={handleLeadPriorityChange}>
          <SelectTrigger className="h-8 w-auto border-none bg-transparent p-0 shadow-none [&>svg]:ml-1">
            {lead.priority ? (
              <StatusBadge status={lead.priority} className="h-7 px-3 text-sm" />
            ) : (
              <span className="flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground">
                Set priority
              </span>
            )}
          </SelectTrigger>
          <SelectContent>
            {LEAD_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
          <DialogTrigger asChild>
            <button onClick={openFollowUp}>
              <span
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                  lead.followUpDate ? "border-amber-300 bg-amber-50 text-amber-800" : "border-border bg-muted/50 text-muted-foreground"
                }`}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                {lead.followUpDate ? `Follow up ${lead.followUpDate}${lead.followUpTime ? `, ${lead.followUpTime}` : ""}` : "No Follow Up Scheduled"}
              </span>
            </button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-sm">
            <DialogHeader>
              <DialogTitle>Schedule Follow-up</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                </div>
                <div>
                  <Label>Time</Label>
                  <Input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {lead.followUpDate && (
                  <Button
                    variant="outline"
                    className="text-red-600"
                    onClick={() => { setFollowUpDate(""); setFollowUpTime(""); handleSaveFollowUp(); }}
                    disabled={savingFollowUp}
                  >
                    Clear
                  </Button>
                )}
                <Button onClick={handleSaveFollowUp} disabled={savingFollowUp || !followUpDate}>
                  {savingFollowUp ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-medium text-foreground">Quotes</h3>
            <Button size="sm" onClick={() => router.push(`/leads/${id}/quotes/new`)}>
              New Quote
            </Button>
          </div>

          {quotations.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No quotes yet. Create a quote, then share the link so your client can accept it online.
            </div>
          ) : (
            <div className="grid gap-2">
              {quotations.map((q) => (
                <div
                  key={q.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">
                        {q.quoteNumber} · {q.issueDate}
                      </p>
                      <Select value={q.status} onValueChange={(v) => handleQuoteStatusChange(q.id, v)}>
                        <SelectTrigger
                          className={`h-6 w-auto border px-2 py-0 text-[11px] font-medium capitalize shadow-none [&>svg]:ml-1 ${QUOTE_STATUS_STYLES[q.status] || ""}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {QUOTE_STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">
                              {QUOTE_STATUS_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-sm text-muted-foreground">₹{(q.total || 0).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => window.open(`/q/${q.id}?preview=1`, "_blank")}>
                      <Eye className="h-3.5 w-3.5" /> View
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDuplicateQuote(q.id)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleCopyQuoteLink(q.id)}>
                      <LinkIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => router.push(`/leads/${id}/quotes/${q.id}`)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost">
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitleEl>Delete {q.quoteNumber}?</AlertDialogTitleEl>
                          <AlertDialogDescription>
                            This permanently removes this quote. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteQuote(q.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Lead Info */}
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-base font-medium text-foreground">Lead Info</h3>
            {editingLead ? (
              <form onSubmit={handleSaveLead} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="leadPhone">Phone</Label>
                    <Input id="leadPhone" value={leadForm.phone} onChange={(e) => updateLeadForm("phone", e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="leadEmail">Email</Label>
                    <Input id="leadEmail" type="email" value={leadForm.email} onChange={(e) => updateLeadForm("email", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Event Type</Label>
                    <Select value={leadForm.projectType} onValueChange={(v) => updateLeadForm("projectType", v)}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {PROJECT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="leadEventDate">Tentative Event Date</Label>
                    <Input id="leadEventDate" type="date" value={leadForm.eventDate} onChange={(e) => updateLeadForm("eventDate", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="leadEventDetails">Event Details</Label>
                  <Textarea id="leadEventDetails" rows={3} value={leadForm.eventDetails} onChange={(e) => updateLeadForm("eventDetails", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Source</Label>
                    <Select value={leadForm.source} onValueChange={(v) => updateLeadForm("source", v)}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {LEAD_SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="leadBudget">Quoted Amount</Label>
                    <Input id="leadBudget" type="number" min="0" value={leadForm.budget} onChange={(e) => updateLeadForm("budget", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={leadForm.priority} onValueChange={(v) => updateLeadForm("priority", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {LEAD_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Handled By</Label>
                  <Select value={leadForm.handledByUid} onValueChange={(v) => updateLeadForm("handledByUid", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Assign to sales exec...">
                        {(v) => employees.find((e) => e.uid === v)?.name || "Assign to sales exec..."}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem key={e.uid} value={e.uid}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={savingLead}>
                    {savingLead ? "Saving..." : "Save"}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setEditingLead(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                <div className="py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Phone</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-foreground">{lead.phone || "—"}</p>
                    {lead.phone && (
                      <>
                        <a href={`tel:${lead.phone}`} className="text-muted-foreground hover:text-foreground"><Phone className="h-3.5 w-3.5" /></a>
                        <a href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-700"><MessageCircle className="h-3.5 w-3.5" /></a>
                      </>
                    )}
                  </div>
                </div>
                <div className="py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-foreground">{lead.email || "—"}</p>
                    {lead.email && (
                      <a href={`mailto:${lead.email}`} className="text-muted-foreground hover:text-foreground"><Mail className="h-3.5 w-3.5" /></a>
                    )}
                  </div>
                </div>
                <div className="py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Event Type</p>
                  <p className="text-sm text-foreground">{lead.projectType || "—"}</p>
                </div>
                <div className="py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tentative Event Date</p>
                  <p className="text-sm text-foreground">{lead.eventDate || "—"}</p>
                </div>
                <div className="py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Event Details</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{lead.eventDetails || "—"}</p>
                </div>
                <div className="py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Source</p>
                  <p className="text-sm text-foreground">{lead.source || "—"}</p>
                </div>
                <div className="py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Handled By</p>
                  {lead.handledByName ? (
                    <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                      {lead.handledByName}
                    </span>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </div>
                <div className="py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Quoted Amount</p>
                  <p className="text-sm text-foreground">₹{lead.budget || 0}</p>
                </div>
                <div className="py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Added</p>
                  <p className="text-sm text-foreground">{(lead.createdAt || "").slice(0, 10)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-base font-medium text-foreground">Timeline</h3>

            <div className="mb-2 flex flex-wrap gap-1 rounded-md bg-muted p-1">
              {ACTIVITY_TYPES.map((t) => {
                const Icon = ACTIVITY_ICONS[t.value];
                return (
                  <button
                    key={t.value}
                    onClick={() => setActiveTab(t.value)}
                    className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      activeTab === t.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>
            <Textarea
              value={activityText}
              onChange={(e) => setActivityText(e.target.value)}
              placeholder={activeTab === "note" ? "Write a note..." : `Details of the ${activityConfig?.label.toLowerCase()}...`}
              rows={3}
              className="mb-2"
            />
            <div className="mb-4 flex justify-end">
              <Button size="sm" onClick={handlePostActivity} disabled={postingActivity}>
                {postingActivity ? "Adding..." : "Add Activity"}
              </Button>
            </div>

            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity logged yet.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {activities.map((a) => {
                  const Icon = ACTIVITY_ICONS[a.type] || StickyNote;
                  return (
                    <div key={a.id} className="flex gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        {a.type !== "system" && (
                          <p className="text-sm font-medium capitalize text-foreground">{a.type}</p>
                        )}
                        {a.text && <p className="text-sm text-foreground">{a.text}</p>}
                        <p className="text-xs text-muted-foreground">
                          {timeAgo(a.addedAt)}{a.addedByName ? ` · ${a.addedByName}` : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
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