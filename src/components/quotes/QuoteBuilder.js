"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import RichTextEditor from "@/components/quotes/RichTextEditor";
import { Plus, Trash2, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  createQuotation,
  updateQuotation,
  computeTotals,
  computeLineTotal,
  lastEventDate,
  buildInstallmentsFromSplit,
  markInstallmentPaid,
  markInstallmentUnpaid,
} from "@/lib/firebase/quotations";
import {
  getPackageTemplates,
  getContractTemplates,
  getPaymentScheduleTemplates,
  getOrgQuoteSettings,
} from "@/lib/firebase/quoteSettings";
import {
  DISCOUNT_TYPES,
  SHIFT_OPTIONS,
  blankLineItem,
  blankEvent,
  blankInstallment,
} from "@/lib/constants/quotations";

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function QuoteBuilder({ lead, initialQuotation, currentUserUid }) {
  const router = useRouter();
  const isEditing = Boolean(initialQuotation);

  const [packageTemplates, setPackageTemplates] = useState([]);
  const [contractTemplates, setContractTemplates] = useState([]);
  const [scheduleTemplates, setScheduleTemplates] = useState([]);
  const [orgSettings, setOrgSettings] = useState({ paymentDetails: {} });
  const [saving, setSaving] = useState(false);

  const [issueDate, setIssueDate] = useState(initialQuotation?.issueDate || todayISO());
  const [lineItems, setLineItems] = useState(initialQuotation?.lineItems || []);
  const [discountType, setDiscountType] = useState(initialQuotation?.discountType || "flat");
  const [discountValue, setDiscountValue] = useState(initialQuotation?.discountValue || 0);
  const [discountLabel, setDiscountLabel] = useState(initialQuotation?.discountLabel || "");
  const [gstPercent, setGstPercent] = useState(initialQuotation?.gstPercent || 0);
  const [paymentScheduleLabel, setPaymentScheduleLabel] = useState(
    initialQuotation?.paymentScheduleLabel || ""
  );
  const [installments, setInstallments] = useState(initialQuotation?.installments || []);
  const [contractTemplateName, setContractTemplateName] = useState(
    initialQuotation?.contractTemplateName || ""
  );
  const [contractHtml, setContractHtml] = useState(initialQuotation?.contractHtml || "");
  const [paymentDetails, setPaymentDetails] = useState(initialQuotation?.paymentDetails || {});
  const [notesHtml, setNotesHtml] = useState(initialQuotation?.notesHtml || "");

  useEffect(() => {
    (async () => {
      const [pkgs, contracts, schedules, org] = await Promise.all([
        getPackageTemplates(),
        getContractTemplates(),
        getPaymentScheduleTemplates(),
        getOrgQuoteSettings(),
      ]);
      setPackageTemplates(pkgs);
      setContractTemplates(contracts);
      setScheduleTemplates(schedules);
      setOrgSettings(org);
    })();
  }, []);

  const totals = useMemo(
    () => computeTotals({ lineItems, discountType, discountValue, gstPercent }),
    [lineItems, discountType, discountValue, gstPercent]
  );
  const lastEvDate = useMemo(() => lastEventDate(lineItems), [lineItems]);
  const scheduledTotal = installments.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  // --- Line items ---
  function addBlankLineItem() {
    setLineItems((prev) => [...prev, blankLineItem()]);
  }

  function addLineItemFromTemplate(templateId) {
    const t = packageTemplates.find((p) => p.id === templateId);
    if (!t) return;
    setLineItems((prev) => [
      ...prev,
      {
        ...blankLineItem(),
        name: t.name,
        events: (t.events || []).map((e) => ({ ...blankEvent(), ...e, date: "", location: "" })),
        descriptionHtml: t.descriptionHtml || "",
        deliverables: t.deliverables?.length ? [...t.deliverables] : [""],
        addonsHtml: t.addonsHtml || "",
        unitPrice: t.unitPrice || 0,
      },
    ]);
  }

  function updateLineItem(id, patch) {
    setLineItems((prev) => prev.map((li) => (li.id === id ? { ...li, ...patch } : li)));
  }

  function removeLineItem(id) {
    setLineItems((prev) => prev.filter((li) => li.id !== id));
  }

  function addEvent(liId) {
    updateLineItem(liId, {
      events: [...(lineItems.find((li) => li.id === liId)?.events || []), blankEvent()],
    });
  }

  function updateEvent(liId, evId, patch) {
    const li = lineItems.find((l) => l.id === liId);
    updateLineItem(liId, {
      events: (li.events || []).map((ev) => (ev.id === evId ? { ...ev, ...patch } : ev)),
    });
  }

  function removeEvent(liId, evId) {
    const li = lineItems.find((l) => l.id === liId);
    updateLineItem(liId, { events: (li.events || []).filter((ev) => ev.id !== evId) });
  }

  function addDeliverable(liId) {
    const li = lineItems.find((l) => l.id === liId);
    updateLineItem(liId, { deliverables: [...(li.deliverables || []), ""] });
  }

  function updateDeliverable(liId, idx, value) {
    const li = lineItems.find((l) => l.id === liId);
    const next = [...(li.deliverables || [])];
    next[idx] = value;
    updateLineItem(liId, { deliverables: next });
  }

  function removeDeliverable(liId, idx) {
    const li = lineItems.find((l) => l.id === liId);
    updateLineItem(
      liId,
      { deliverables: (li.deliverables || []).filter((_, i) => i !== idx) }
    );
  }

  // --- Payment schedule ---
  function applyScheduleTemplate(templateId) {
    const t = scheduleTemplates.find((s) => s.id === templateId);
    if (!t) return;
    setPaymentScheduleLabel(t.name);
    setInstallments(buildInstallmentsFromSplit(t.splits, totals.total, issueDate, lastEvDate));
  }

  function addInstallment() {
    setInstallments((prev) => [...prev, blankInstallment(`Installment ${prev.length + 1}`)]);
  }

  function updateInstallment(id, patch) {
    setInstallments((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function removeInstallment(id) {
    setInstallments((prev) => prev.filter((i) => i.id !== id));
  }

  // Paid/Unpaid is tracked directly against the saved quotation in
  // Firestore (not just local state) so it's reflected immediately
  // everywhere else that reads it — the dashboard's Received on
  // Bookings/Cash Received/Payments chart, and the client-facing
  // QuoteDocument view. Only available once the quote has been saved
  // at least once (there's no installment doc to update before that).
  const [togglingInstallmentId, setTogglingInstallmentId] = useState(null);

  async function handleToggleInstallmentPaid(inst) {
    if (!isEditing) {
      toast.error("Save the quote first, then mark installments as paid");
      return;
    }
    setTogglingInstallmentId(inst.id);
    try {
      if (inst.paid) {
        await markInstallmentUnpaid(initialQuotation.id, inst.id);
        updateInstallment(inst.id, { paid: false, paidDate: null });
        toast.success(`${inst.label || "Installment"} marked unpaid`);
      } else {
        await markInstallmentPaid(initialQuotation.id, inst.id);
        updateInstallment(inst.id, { paid: true, paidDate: todayISO() });
        toast.success(`${inst.label || "Installment"} marked paid`);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTogglingInstallmentId(null);
    }
  }

  // --- Contract ---
  function applyContractTemplate(templateId) {
    const t = contractTemplates.find((c) => c.id === templateId);
    if (!t) return;
    setContractTemplateName(t.name);
    setContractHtml(t.bodyHtml || "");
  }

  async function handleSave() {
    setSaving(true);
    // Resolve payment details against the org defaults now, so the public
    // quote page never needs to read orgSettings just to fill in blanks —
    // what's saved on the quote is exactly what the client will see.
    const resolvedPaymentDetails = {
      accountName: paymentDetails.accountName || orgSettings.paymentDetails?.accountName || "",
      bank: paymentDetails.bank || orgSettings.paymentDetails?.bank || "",
      accountNumber:
        paymentDetails.accountNumber || orgSettings.paymentDetails?.accountNumber || "",
      ifsc: paymentDetails.ifsc || orgSettings.paymentDetails?.ifsc || "",
      upi: paymentDetails.upi || orgSettings.paymentDetails?.upi || "",
    };
    const payload = {
      leadId: lead.id,
      clientName: lead.clientName,
      clientEmail: lead.email || "",
      clientPhone: lead.phone || "",
      issueDate,
      lineItems,
      discountType,
      discountValue: Number(discountValue) || 0,
      discountLabel,
      gstPercent: Number(gstPercent) || 0,
      paymentScheduleLabel,
      installments,
      contractTemplateName,
      contractHtml,
      paymentDetails: resolvedPaymentDetails,
      notesHtml,
    };
    try {
      if (isEditing) {
        await updateQuotation(initialQuotation.id, payload);
        toast.success("Quote updated");
      } else {
        await createQuotation(payload, currentUserUid);
        toast.success("Quote created");
      }
      router.push(`/leads/${lead.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 -mx-4 mb-6 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-lg sm:border-x sm:border-t-0">
        <div>
          <h2 className="font-serif text-xl font-semibold text-foreground">
            {isEditing ? `Edit Quote ${initialQuotation.quoteNumber}` : "New Quote"}
          </h2>
          <p className="text-sm text-muted-foreground">{lead.clientName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push(`/leads/${lead.id}`)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Quote"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Quote ID / Issue date / Client */}
        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_1fr_1.2fr]">
            <div>
              <Label>Quote ID</Label>
              <Input value={initialQuotation?.quoteNumber || "Auto-generated if blank"} disabled />
            </div>
            <div>
              <Label>Issue Date</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Client</p>
              <p className="font-medium text-foreground">{lead.clientName}</p>
              {lead.email && <p className="text-sm text-muted-foreground">{lead.email}</p>}
              {lead.phone && <p className="text-sm text-muted-foreground">{lead.phone}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Products & Packages */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-medium text-foreground">Products &amp; Packages</h3>
              <div className="flex items-center gap-2">
                <Select onValueChange={addLineItemFromTemplate}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Choose a package..." />
                  </SelectTrigger>
                  <SelectContent>
                    {packageTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={addBlankLineItem}>
                  <Plus className="h-3.5 w-3.5" /> Create
                </Button>
              </div>
            </div>

            {lineItems.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Add a package or a blank line to start building this quote.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {lineItems.map((li) => (
                  <div key={li.id} className="rounded-lg border border-border p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <Input
                        value={li.name}
                        placeholder="Package name"
                        onChange={(e) => updateLineItem(li.id, { name: e.target.value })}
                        className="font-serif text-base font-medium"
                      />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => removeLineItem(li.id)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>

                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Events
                    </p>
                    <div className="mb-2 flex flex-col gap-2">
                      {(li.events || []).map((ev) => (
                        <div key={ev.id} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                          <Input
                            placeholder="Event"
                            value={ev.name}
                            onChange={(e) => updateEvent(li.id, ev.id, { name: e.target.value })}
                          />
                          <Input
                            type="date"
                            value={ev.date}
                            onChange={(e) => updateEvent(li.id, ev.id, { date: e.target.value })}
                          />
                          <Input
                            placeholder="Location"
                            value={ev.location}
                            onChange={(e) =>
                              updateEvent(li.id, ev.id, { location: e.target.value })
                            }
                          />
                          <Input
                            placeholder="Team size"
                            value={ev.teamSize}
                            onChange={(e) =>
                              updateEvent(li.id, ev.id, { teamSize: e.target.value })
                            }
                          />
                          <div className="flex items-center gap-1">
                            <Select
                              value={ev.shift}
                              onValueChange={(v) => updateEvent(li.id, ev.id, { shift: v })}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SHIFT_OPTIONS.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <button
                              type="button"
                              onClick={() => removeEvent(li.id, ev.id)}
                              className="text-red-500 hover:text-red-600"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => addEvent(li.id)}
                      className="mb-4 text-sm text-muted-foreground hover:text-foreground"
                    >
                      + Add event
                    </button>

                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Description
                    </p>
                    <div className="mb-4">
                      <RichTextEditor
                        value={li.descriptionHtml}
                        onChange={(html) => updateLineItem(li.id, { descriptionHtml: html })}
                        placeholder="What's included..."
                      />
                    </div>

                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Deliverables
                    </p>
                    <div className="mb-2 flex flex-col gap-2">
                      {(li.deliverables || []).map((d, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                          <Input
                            value={d}
                            onChange={(e) => updateDeliverable(li.id, idx, e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => removeDeliverable(li.id, idx)}
                            className="text-red-500 hover:text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => addDeliverable(li.id)}
                      className="mb-4 text-sm text-muted-foreground hover:text-foreground"
                    >
                      + Add deliverable
                    </button>

                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Add-ons / Bonuses
                    </p>
                    <div className="mb-4">
                      <RichTextEditor
                        value={li.addonsHtml}
                        onChange={(html) => updateLineItem(li.id, { addonsHtml: html })}
                        placeholder="Optional extras included with this package..."
                      />
                    </div>

                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="flex items-end gap-3">
                        <div>
                          <Label>Qty</Label>
                          <Input
                            type="number"
                            min="1"
                            className="w-20"
                            value={li.qty}
                            onChange={(e) => updateLineItem(li.id, { qty: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Unit ₹</Label>
                          <Input
                            type="number"
                            min="0"
                            className="w-32"
                            value={li.unitPrice}
                            onChange={(e) => updateLineItem(li.id, { unitPrice: e.target.value })}
                          />
                        </div>
                      </div>
                      <p className="text-lg font-semibold text-foreground">
                        {fmtINR(computeLineTotal(li))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Discount / GST / totals */}
        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
            <div>
              <Label>Discount</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="w-24"
                />
                <Select value={discountType} onValueChange={setDiscountType}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISCOUNT_TYPES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Reason (optional)"
                  value={discountLabel}
                  onChange={(e) => setDiscountLabel(e.target.value)}
                  className="flex-1"
                />
              </div>

              <div className="mt-4">
                <Label>GST %</Label>
                <Input
                  type="number"
                  min="0"
                  value={gstPercent}
                  onChange={(e) => setGstPercent(e.target.value)}
                  className="w-24"
                />
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>{fmtINR(totals.subtotal)}</span>
              </div>
              {totals.discountAmount > 0 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Discount</span>
                  <span>-{fmtINR(totals.discountAmount)}</span>
                </div>
              )}
              {totals.gstAmount > 0 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>GST</span>
                  <span>{fmtINR(totals.gstAmount)}</span>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-lg font-semibold text-foreground">
                <span>Total Due</span>
                <span>{fmtINR(totals.total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment schedule */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-medium text-foreground">Payment Schedule</h3>
              <Select onValueChange={applyScheduleTemplate}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Choose a payment schedule..." />
                </SelectTrigger>
                <SelectContent>
                  {scheduleTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="mb-3 text-sm text-muted-foreground">
              {lastEvDate
                ? `Due dates are calculated from the last event date (${lastEvDate}); the first installment is due on the issue date. Every date below stays editable.`
                : "Add an event date above to auto-calculate due dates, or fill installments in manually below."}
            </p>

            {installments.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                No split payments yet. Choose a payment schedule to auto-fill installments, then edit any amount or date.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="hidden grid-cols-[1fr_1fr_1fr_auto_auto] gap-2 px-1 text-xs uppercase tracking-wide text-muted-foreground sm:grid">
                  <span>Installment</span>
                  <span>Due Date</span>
                  <span>Amount</span>
                  <span>Status</span>
                  <span />
                </div>
                {installments.map((inst) => (
                  <div key={inst.id} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:items-center">
                    <Input
                      value={inst.label}
                      onChange={(e) => updateInstallment(inst.id, { label: e.target.value })}
                    />
                    <Input
                      type="date"
                      value={inst.dueDate}
                      onChange={(e) => updateInstallment(inst.id, { dueDate: e.target.value })}
                    />
                    <Input
                      type="number"
                      value={inst.amount}
                      onChange={(e) => updateInstallment(inst.id, { amount: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => handleToggleInstallmentPaid(inst)}
                      disabled={togglingInstallmentId === inst.id || !isEditing}
                      title={
                        !isEditing
                          ? "Save the quote first to mark installments as paid"
                          : inst.paid
                          ? "Mark unpaid"
                          : "Mark paid"
                      }
                      className={`inline-flex items-center justify-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                        inst.paid
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "border-border bg-muted text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {inst.paid && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {togglingInstallmentId === inst.id ? "..." : inst.paid ? "Paid" : "Unpaid"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeInstallment(inst.id)}
                      className="text-red-500 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={addInstallment}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                + Add installment
              </button>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-emerald-600">
                  Collected {fmtINR(installments.filter((i) => i.paid).reduce((s, i) => s + (Number(i.amount) || 0), 0))}
                </p>
                <p
                  className={`flex items-center gap-1 text-sm ${
                    scheduledTotal === totals.total ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  Scheduled {fmtINR(scheduledTotal)} of {fmtINR(totals.total)}
                  {scheduledTotal === totals.total && <CheckCircle2 className="h-3.5 w-3.5" />}
                </p>
              </div>
            </div>
            {!isEditing && installments.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Save the quote to enable marking installments as paid.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Contract */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-medium text-foreground">Contract</h3>
              <Select onValueChange={applyContractTemplate}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Choose a contract..." />
                </SelectTrigger>
                <SelectContent>
                  {contractTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <RichTextEditor
              value={contractHtml}
              onChange={setContractHtml}
              placeholder="Contract terms shown on the quote..."
              minHeight={160}
            />
            {contractTemplateName && (
              <p className="mt-2 text-xs text-muted-foreground">
                Based on template: {contractTemplateName}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Payment details */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-base font-medium text-foreground">Payment Details</h3>
            <p className="mb-3 text-sm text-muted-foreground">
              Shown to the client on the shared link. Leave blank to use your saved details from Settings.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Account name</Label>
                <Input
                  value={paymentDetails.accountName || ""}
                  placeholder={orgSettings.paymentDetails?.accountName || "Not set in Settings"}
                  onChange={(e) =>
                    setPaymentDetails((p) => ({ ...p, accountName: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Bank</Label>
                <Input
                  value={paymentDetails.bank || ""}
                  placeholder={orgSettings.paymentDetails?.bank || "Not set in Settings"}
                  onChange={(e) => setPaymentDetails((p) => ({ ...p, bank: e.target.value }))}
                />
              </div>
              <div>
                <Label>Account number</Label>
                <Input
                  value={paymentDetails.accountNumber || ""}
                  placeholder={orgSettings.paymentDetails?.accountNumber || "Not set in Settings"}
                  onChange={(e) =>
                    setPaymentDetails((p) => ({ ...p, accountNumber: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>IFSC</Label>
                <Input
                  value={paymentDetails.ifsc || ""}
                  placeholder={orgSettings.paymentDetails?.ifsc || "Not set in Settings"}
                  onChange={(e) => setPaymentDetails((p) => ({ ...p, ifsc: e.target.value }))}
                />
              </div>
              <div>
                <Label>UPI ID</Label>
                <Input
                  value={paymentDetails.upi || ""}
                  placeholder={orgSettings.paymentDetails?.upi || "Not set in Settings"}
                  onChange={(e) => setPaymentDetails((p) => ({ ...p, upi: e.target.value }))}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-base font-medium text-foreground">Notes for the whole document</h3>
            <p className="mb-3 text-sm text-muted-foreground">
              Shown once at the end, under everything. For something that belongs to one item, use &ldquo;Add-ons / Bonuses&rdquo; inside the item above.
            </p>
            <RichTextEditor value={notesHtml} onChange={setNotesHtml} placeholder="Notes shown on the document..." />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.push(`/leads/${lead.id}`)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Quote"}
          </Button>
        </div>
      </div>
    </div>
  );
}