"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { updateLedgerEntryBasics, linkedKind } from "@/lib/firebase/financeEdits";
import { setLegacyAccount } from "@/lib/firebase/finance";
import { updateExpense } from "@/lib/firebase/expenses";
import { inr } from "@/lib/finance/calc";

// Where the amount of a flow-made row is changed, and how.
const AMOUNT_HINT = {
  salary: "The amount comes from Payroll. To change it, delete (reverse) this payment, recalculate the month in Payroll and pay again.",
  emi: "The principal / interest split is fixed when paid. To change it, delete this EMI and pay it again from Loans & EMI.",
  loan_in: "The amount follows the loan — edit the loan in Loans & EMI.",
  employee_advance: "Change the amount from Finance → Employees → History.",
  allowance_given: "Change the amount, employee or project from Allowances → Edit.",
  allowance_return: "To change the amount, delete this settlement (the allowance reopens) and settle again.",
  allowance_writeoff: "To change the amount, delete this settlement (the allowance reopens) and settle again.",
};

const SOURCE_LABEL = {
  salary: "Salary payment",
  emi: "Loan EMI",
  loan_in: "Loan received",
  employee_advance: "Staff advance / loan",
  allowance_given: "Allowance given",
  allowance_return: "Allowance returned",
  allowance_writeoff: "Allowance written off",
};

function initialForm(entry) {
  return {
    date: entry?.date || "",
    accountId: entry?.accountId || "",
    description: entry?.description || "",
    amount: entry?.amount != null ? String(entry.amount) : "",
    category: entry?.category || "",
  };
}

/**
 * Edit for ledger rows the full TransactionDialog can't own:
 *  - rows made by Payroll / Loans / Allowances / Advances (date, account, note)
 *  - older project-page expenses (date, amount, category, note, account)
 *  - older project-page invoices (account only — the rest lives on the invoice)
 * Mount with `key={entry?.id}` so the form starts from the row each time.
 */
export default function EntryEditDialog({ entry, onClose, data, onSaved }) {
  const [form, setForm] = useState(() => initialForm(entry));
  const [saving, setSaving] = useState(false);
  const set = (p) => setForm((f) => ({ ...f, ...p }));

  const isLegacyExp = entry?.legacy && entry.id.startsWith("legacy-exp-");
  const isLegacyInv = entry?.legacy && entry.id.startsWith("legacy-inv-");
  const kind = linkedKind(entry);
  const usesAccount = entry?.paidFrom !== "allowance";

  const accountOptions = data.accounts
    .filter((a) => a.active !== false || a.id === entry?.accountId)
    .map((a) => ({ value: a.id, label: a.name }));
  const categoryOptions = [...new Set([...data.cats.project, entry?.category].filter(Boolean))];

  async function save() {
    setSaving(true);
    try {
      if (isLegacyExp) {
        if (!(Number(form.amount) > 0)) throw new Error("Amount must be greater than zero");
        if (!form.date) throw new Error("Date is required");
        await updateExpense(entry.id.replace("legacy-exp-", ""), form);
        if ((form.accountId || null) !== (entry.accountId || null)) await setLegacyAccount(entry.id, form.accountId);
      } else if (isLegacyInv) {
        await setLegacyAccount(entry.id, form.accountId);
      } else {
        await updateLedgerEntryBasics(entry, form);
      }
      toast.success("Entry updated — balances and P&L updated");
      onClose();
      onSaved?.();
    } catch (err) {
      toast.error(err.message || "Could not update entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-md overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Edit entry</DialogTitle>
        </DialogHeader>
        {entry && (
          <div className="flex flex-col gap-3">
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="font-medium text-foreground">
                {isLegacyExp ? "Project-page expense" : isLegacyInv ? "Project invoice (paid)" : SOURCE_LABEL[kind] || "Transaction"}
              </p>
              <p className="text-xs text-muted-foreground">
                {[entry.personName, entry.projectName, entry.category].filter(Boolean).join(" · ")}
              </p>
              {!isLegacyExp && (
                <p className="mt-1 font-semibold">{inr(entry.amount)}</p>
              )}
            </div>

            {isLegacyInv ? (
              <p className="text-xs text-muted-foreground">
                The invoice’s amount and dates are edited on its project page. Here you can set which account the money landed in.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
                </div>
                {isLegacyExp && (
                  <div>
                    <Label>Amount (₹)</Label>
                    <Input type="number" min="0" step="0.01" inputMode="decimal" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
                  </div>
                )}
              </div>
            )}

            {isLegacyExp && (
              <div>
                <Label>Category</Label>
                <SearchableSelect value={form.category} onValueChange={(v) => set({ category: v })} options={categoryOptions} placeholder="Select category..." />
              </div>
            )}

            {usesAccount && (
              <div>
                <Label>{entry.kind === "income" || entry.kind === "loan_in" || entry.kind === "advance_return" ? "Received into account" : "Paid from account"}</Label>
                <SearchableSelect
                  value={form.accountId}
                  onValueChange={(v) => set({ accountId: v })}
                  options={entry.legacy ? [{ value: "", label: "No account" }, ...accountOptions] : accountOptions}
                  placeholder="Select account..."
                />
              </div>
            )}

            {!isLegacyInv && (
              <div>
                <Label>Note</Label>
                <Input value={form.description} onChange={(e) => set({ description: e.target.value })} />
              </div>
            )}

            {AMOUNT_HINT[kind] && <p className="text-xs text-muted-foreground">{AMOUNT_HINT[kind]}</p>}

            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
