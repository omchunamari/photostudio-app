"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import SearchableSelect from "@/components/ui/searchable-select";
import { createTransaction, updateTransaction, uploadAttachment } from "@/lib/firebase/finance";
import { buildPersonOptions, resolvePerson, personKeyOf } from "@/lib/finance/people";
import { getISTDateStr } from "@/lib/dateIST";
import { CAT_PROJECT_PAYMENT } from "@/lib/finance/constants";
import { inr } from "@/lib/finance/calc";

const KINDS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

const blank = (kind = "expense") => ({
  kind,
  date: getISTDateStr(),
  accountId: "",
  toAccountId: "",
  amount: "",
  scope: "project",
  category: "",
  projectId: "",
  personKey: "",
  description: "",
  payee: "",
  pending: false,
});

/**
 * The single "enter it once" form for income, expenses and transfers.
 *
 * `initial` may be an existing transaction (edit) or a preset such as
 * { kind:"expense", projectId, allowanceId, paidFrom:"allowance" } (add).
 */
export default function TransactionDialog({ open, onOpenChange, data, initial, user, onSaved }) {
  const editing = !!initial?.id;
  const [form, setForm] = useState(blank());
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFile(null);
    if (initial) {
      setForm({
        ...blank(initial.kind || "expense"),
        kind: initial.kind || "expense",
        date: initial.date || getISTDateStr(),
        accountId: initial.accountId || "",
        toAccountId: initial.toAccountId || "",
        amount: initial.amount != null ? String(initial.amount) : "",
        scope: initial.projectId ? "project" : initial.id ? "company" : "project",
        category: initial.category || "",
        projectId: initial.projectId || "",
        personKey: personKeyOf(initial),
        description: initial.description || "",
        payee: initial.payee || "",
        pending: initial.status === "pending",
      });
    } else {
      setForm(blank());
    }
    // Reset only when the dialog opens or a different row is targeted — callers
    // pass a fresh `initial` object every render, which must not wipe the form mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id, initial?.allowanceId]);

  const fromAllowance = initial?.paidFrom === "allowance";
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const activeAccounts = data.accounts.filter((a) => a.active !== false);
  const accountOptions = activeAccounts.map((a) => ({
    value: a.id,
    label: a.name,
    hint: inr(data.balances[a.id] || 0),
  }));
  const projectOptions = data.projects.map((p) => ({ value: p.id, label: p.projectName, hint: p.eventType || "" }));
  const personOptions = useMemo(
    () => buildPersonOptions(data.employees, data.freelancers),
    [data.employees, data.freelancers]
  );

  const categoryList =
    form.kind === "income" ? data.cats.income : form.scope === "project" ? data.cats.project : data.cats.company;

  async function handleSave() {
    const amount = Number(form.amount);
    if (!(amount > 0)) return toast.error("Enter an amount greater than zero");
    if (form.kind === "expense" && form.scope === "project" && !form.projectId)
      return toast.error("Select the project for this expense");
    if (form.kind === "income" && form.scope === "project" && !form.projectId)
      return toast.error("Select the project this payment is for");
    if (form.kind !== "transfer" && !form.category && !(form.kind === "income" && form.projectId))
      return toast.error("Select a category");

    setSaving(true);
    try {
      let attachment = null;
      if (file) attachment = await uploadAttachment(file, "transactions");
      const project = data.projects.find((p) => p.id === form.projectId);
      const usesProject = form.kind !== "transfer" && (form.scope === "project" || fromAllowance) && form.projectId;
      const payload = {
        kind: form.kind,
        date: form.date,
        amount,
        accountId: fromAllowance ? null : form.accountId || null,
        toAccountId: form.toAccountId || null,
        category:
          form.kind === "transfer"
            ? "Transfer"
            : form.kind === "income" && form.projectId && !form.category
              ? CAT_PROJECT_PAYMENT
              : form.category,
        projectId: usesProject ? form.projectId : null,
        projectName: usesProject ? project?.projectName || "" : "",
        ...(form.kind === "transfer" ? { personKey: "" } : resolvePerson(form.personKey, data.employees, data.freelancers)),
        description: form.description,
        payee: form.payee || null,
        status: form.kind === "expense" && form.pending ? "pending" : "paid",
        paidFrom: fromAllowance ? "allowance" : "account",
        allowanceId: initial?.allowanceId || null,
        attachmentUrl: attachment?.url || initial?.attachmentUrl || null,
        attachmentName: attachment?.name || initial?.attachmentName || null,
        source: initial?.source || "manual",
      };
      if (editing) await updateTransaction(initial.id, payload, user);
      else await createTransaction(payload, { uid: user.uid, name: user.name });
      toast.success(editing ? "Transaction updated" : "Transaction saved — all balances and P&L updated");
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err.message || "Could not save transaction");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit transaction" : fromAllowance ? "Log spend from allowance" : "Add transaction"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {!editing && !fromAllowance && (
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => set({ kind: k.value, category: "" })}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    form.kind === k.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
            </div>
            <div>
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>

          {form.kind === "transfer" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>From account</Label>
                <SearchableSelect value={form.accountId} onValueChange={(v) => set({ accountId: v })} options={accountOptions} placeholder="Select..." />
              </div>
              <div>
                <Label>To account</Label>
                <SearchableSelect value={form.toAccountId} onValueChange={(v) => set({ toAccountId: v })} options={accountOptions} placeholder="Select..." />
              </div>
              <p className="col-span-2 text-xs text-slate-500">
                A transfer only moves money between accounts. It is never counted as an expense or income.
              </p>
            </div>
          ) : (
            <>
              {!fromAllowance && (
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                  {[
                    { v: "project", l: form.kind === "income" ? "Project payment" : "Project expense" },
                    { v: "company", l: form.kind === "income" ? "Other income" : "Company expense" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => set({ scope: o.v, category: "", projectId: o.v === "company" ? "" : form.projectId })}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        form.scope === o.v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              )}

              {(form.scope === "project" || fromAllowance) && (
                <div>
                  <Label>Project</Label>
                  <SearchableSelect
                    value={form.projectId}
                    onValueChange={(v) => set({ projectId: v })}
                    options={projectOptions}
                    placeholder="Select project..."
                    alwaysSearch
                    disabled={fromAllowance}
                  />
                </div>
              )}

              <div>
                <Label>Category{form.kind === "income" && form.projectId ? " (optional)" : ""}</Label>
                <SearchableSelect
                  value={form.category}
                  onValueChange={(v) => set({ category: v })}
                  options={categoryList}
                  placeholder="Select category..."
                />
              </div>

              {!fromAllowance && !(form.kind === "expense" && form.pending) && (
                <div>
                  <Label>{form.kind === "income" ? "Received into account" : "Paid from account"}</Label>
                  <SearchableSelect value={form.accountId} onValueChange={(v) => set({ accountId: v })} options={accountOptions} placeholder="Select account..." />
                </div>
              )}

              <div>
                <Label>Person / employee (optional)</Label>
                <SearchableSelect
                  value={form.personKey}
                  onValueChange={(v) => set({ personKey: v })}
                  options={personOptions}
                  placeholder={form.kind === "income" ? "Client / payer (optional)" : "Who was this for?"}
                  alwaysSearch
                  disabled={fromAllowance}
                />
              </div>

              {form.kind === "expense" && !fromAllowance && (
                <label className="flex items-start gap-2 rounded-md border border-slate-200 p-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={form.pending}
                    onChange={(e) => set({ pending: e.target.checked, accountId: e.target.checked ? "" : form.accountId })}
                  />
                  <span>
                    <span className="font-medium text-slate-800">Not paid yet (vendor / other payable)</span>
                    <span className="block text-xs text-slate-500">
                      Counts as an expense now; the account is reduced only when you mark it paid.
                    </span>
                  </span>
                </label>
              )}
              {form.kind === "expense" && form.pending && (
                <div>
                  <Label>Vendor / payee</Label>
                  <Input value={form.payee} onChange={(e) => set({ payee: e.target.value })} placeholder="Who is owed?" />
                </div>
              )}
            </>
          )}

          <div>
            <Label>Description</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </div>

          <div>
            <Label>Bill / attachment (optional)</Label>
            <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
              <Paperclip className="h-4 w-4" />
              <span className="truncate">{file?.name || initial?.attachmentName || "Choose file (image or PDF, max 10 MB)"}</span>
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : editing ? "Save changes" : "Save transaction"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
