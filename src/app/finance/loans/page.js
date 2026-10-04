"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Banknote, Landmark, CalendarClock, Building2, Pencil, Trash2, Undo2 } from "lucide-react";
import FinanceShell, { Stat, PageSkeleton, EmptyState } from "@/components/finance/FinanceShell";
import { useAuth } from "@/contexts/AuthContext";
import useFinanceData from "@/lib/finance/useFinanceData";
import { createLoan, payEmi } from "@/lib/firebase/loans";
import { updateLoan, deleteLoan, undoEmi } from "@/lib/firebase/financeEdits";
import { calcEmi, splitEmi, nextEmiDate } from "@/lib/finance/loanCalc";
import { daysUntil } from "@/lib/finance/payrollCalc";
import { EMI_REMINDER_DAYS } from "@/lib/finance/constants";
import { inr } from "@/lib/finance/calc";
import { getISTDateStr, formatDateIST } from "@/lib/dateIST";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const EMPTY = { name: "", lender: "", amount: "", interestRate: "", tenureMonths: "", emi: "", startDate: getISTDateStr(), disbursalAccountId: "" };

function Content() {
  const { user } = useAuth();
  const data = useFinanceData();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null); // loan being edited, null = adding
  const [form, setForm] = useState(EMPTY);
  const [pay, setPay] = useState(null);
  const [payForm, setPayForm] = useState({ accountId: "", date: getISTDateStr() });
  const [busy, setBusy] = useState(false);

  const accountOptions = data.accounts.filter((a) => a.active !== false).map((a) => ({ value: a.id, label: a.name, hint: inr(data.balances[a.id] || 0) }));
  const active = data.loans.filter((l) => l.status !== "closed");
  const totalOutstanding = active.reduce((s, l) => s + (l.outstanding || 0), 0);
  const monthlyEmi = active.reduce((s, l) => s + (l.emi || 0), 0);
  const by = { uid: user?.uid, name: user?.name };

  function patch(p) {
    setForm((f) => {
      const next = { ...f, ...p };
      // Suggest the EMI from amount / rate / tenure until the user types their own.
      if (("amount" in p || "interestRate" in p || "tenureMonths" in p) && !f._emiTouched) {
        next.emi = String(calcEmi(next.amount, next.interestRate, next.tenureMonths) || "");
      }
      return next;
    });
  }

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setAddOpen(true);
  }

  function openEdit(l) {
    const receipt = data.ledger.find((t) => t.loanId === l.id && t.kind === "loan_in");
    setEditing(l);
    setForm({
      name: l.name || "",
      lender: l.lender || "",
      amount: String(l.amount ?? ""),
      interestRate: String(l.interestRate ?? ""),
      tenureMonths: String(l.tenureMonths || ""),
      emi: String(l.emi ?? ""),
      startDate: l.startDate || getISTDateStr(),
      disbursalAccountId: receipt?.accountId || "",
      _emiTouched: true,
    });
    setAddOpen(true);
  }

  async function handleDelete(l) {
    const emiCount = data.ledger.filter((t) => t.loanId === l.id && t.source === "emi").length;
    const msg = `Delete ${l.name}?${emiCount ? ` Its ${emiCount} paid EMI${emiCount === 1 ? "" : "s"} are removed from the accounts and P&L too.` : ""} This can't be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await deleteLoan(l, data.ledger);
      toast.success("Loan deleted");
      data.reload();
    } catch (err) {
      toast.error(err.message || "Could not delete loan");
    }
  }

  async function handleUndoEmi(l, t) {
    if (!window.confirm(`Undo the EMI paid on ${formatDateIST(t.date)}? ${inr(t.amount)} goes back to the account and the outstanding rises by ${inr(t.principal)}.`)) return;
    try {
      await undoEmi(l, t);
      toast.success("EMI reversed");
      data.reload();
    } catch (err) {
      toast.error(err.message || "Could not undo EMI");
    }
  }

  async function handleCreate() {
    setBusy(true);
    try {
      if (editing) await updateLoan(editing, form, data.ledger, by);
      else await createLoan(form, by);
      toast.success(editing ? "Loan updated" : "Loan added");
      setAddOpen(false);
      setForm(EMPTY);
      data.reload();
    } catch (err) {
      toast.error(err.message || "Could not add loan");
    } finally {
      setBusy(false);
    }
  }

  async function handlePay() {
    setBusy(true);
    try {
      const r = await payEmi(pay, payForm, by);
      toast.success(`EMI paid — principal ${inr(r.principal)}, interest ${inr(r.interest)}`);
      setPay(null);
      data.reload();
    } catch (err) {
      toast.error(err.message || "Could not pay EMI");
    } finally {
      setBusy(false);
    }
  }

  const split = pay ? splitEmi(pay.outstanding, pay.emi, pay.interestRate) : null;

  return (
    <FinanceShell
      title="Loans & EMI"
      description="Company loans. Each EMI reduces the account you pay from and is split into principal and interest — only interest is a cost in P&L."
      actions={
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add loan
        </Button>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <div className="col-span-2 sm:col-span-1"><Stat icon={Landmark} label="Outstanding principal" value={inr(totalOutstanding)} tone={totalOutstanding ? "warning" : "neutral"} /></div>
        <Stat icon={CalendarClock} label="Monthly EMI" value={inr(monthlyEmi)} />
        <Stat icon={Building2} label="Active loans" value={String(active.length)} />
      </div>

      {data.loading ? (
        <PageSkeleton stats={0} rows={3} />
      ) : data.loans.length === 0 ? (
        <EmptyState icon={Building2} title="No loans added yet" hint="Add a company loan to track EMIs, principal and interest." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.loans.map((l) => {
            const due = nextEmiDate(l);
            const d = daysUntil(due);
            const pct = l.amount ? Math.min(100, Math.round(((l.amount - l.outstanding) / l.amount) * 100)) : 0;
            const emis = data.ledger.filter((t) => t.loanId === l.id && t.source === "emi").sort((a, b) => (b.date || "").localeCompare(a.date || ""));
            return (
              <Card key={l.id}>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-foreground">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{l.lender || "—"} · {l.interestRate}% p.a. · {l.tenureMonths || "—"} months</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${l.status === "closed" ? "bg-success/10 text-success" : "bg-warning/15 text-warning"}`}>
                        {l.status === "closed" ? "Closed" : "Active"}
                      </span>
                      <Button size="icon-sm" variant="ghost" title="Edit loan" aria-label="Edit loan" onClick={() => openEdit(l)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" title="Delete loan" aria-label="Delete loan" onClick={() => handleDelete(l)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-muted/50 p-2"><p className="text-[11px] uppercase text-muted-foreground">Loan</p><p className="font-semibold">{inr(l.amount)}</p></div>
                    <div className="rounded-md bg-muted/50 p-2"><p className="text-[11px] uppercase text-muted-foreground">EMI</p><p className="font-semibold">{inr(l.emi)}</p></div>
                    <div className="rounded-md bg-muted/50 p-2"><p className="text-[11px] uppercase text-muted-foreground">Outstanding</p><p className="font-semibold text-warning">{inr(l.outstanding)}</p></div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-success" style={{ width: `${pct}%` }} /></div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>Principal paid {inr(l.totalPrincipalPaid)} · Interest paid {inr(l.totalInterestPaid)} · {l.paidCount || 0} EMIs</span>
                    {due && (
                      <span className={d != null && d <= EMI_REMINDER_DAYS ? "font-medium text-warning" : ""}>
                        Next EMI {formatDateIST(due)}{d != null && d < 0 ? ` (${-d}d overdue)` : d != null && d <= EMI_REMINDER_DAYS ? ` (in ${d}d)` : ""}
                      </span>
                    )}
                  </div>
                  {emis.length > 0 && (
                    <ul className="max-h-28 divide-y divide-border overflow-y-auto text-xs">
                      {emis.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-2 py-1">
                          <span>{formatDateIST(t.date)}</span>
                          <span className="flex items-center gap-1">
                            <span>Principal {inr(t.principal)} + Interest {inr(t.interest)}</span>
                            <Button size="icon-sm" variant="ghost" title="Undo this EMI" aria-label="Undo this EMI" onClick={() => handleUndoEmi(l, t)}>
                              <Undo2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {l.status !== "closed" && (
                    <Button size="sm" variant="outline" onClick={() => { setPay(l); setPayForm({ accountId: "", date: getISTDateStr() }); }}>
                      <Banknote className="h-3.5 w-3.5" /> Pay EMI
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-md overflow-y-auto sm:w-full">
          <DialogHeader><DialogTitle>{editing ? `Edit loan — ${editing.name}` : "Add loan"}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Loan name</Label><Input value={form.name} onChange={(e) => patch({ name: e.target.value })} /></div>
              <div><Label>Lender</Label><Input value={form.lender} onChange={(e) => patch({ lender: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div><Label>Amount (₹)</Label><Input type="number" min="0" value={form.amount} onChange={(e) => patch({ amount: e.target.value })} /></div>
              <div><Label>Interest % p.a.</Label><Input type="number" min="0" step="0.01" value={form.interestRate} onChange={(e) => patch({ interestRate: e.target.value })} /></div>
              <div><Label>Tenure (months)</Label><Input type="number" min="0" value={form.tenureMonths} onChange={(e) => patch({ tenureMonths: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>EMI (₹)</Label>
                <Input type="number" min="0" value={form.emi} onChange={(e) => setForm((f) => ({ ...f, emi: e.target.value, _emiTouched: true }))} />
                <p className="mt-1 text-xs text-muted-foreground">Suggested from amount, rate and tenure — overwrite with the bank’s figure.</p>
              </div>
              <div><Label>First EMI date</Label><Input type="date" value={form.startDate} onChange={(e) => patch({ startDate: e.target.value })} /></div>
            </div>
            <div>
              <Label>Loan amount received into (optional)</Label>
              <SearchableSelect value={form.disbursalAccountId} onValueChange={(v) => patch({ disbursalAccountId: v })} options={[{ value: "", label: "Don't record receipt" }, ...accountOptions]} placeholder="Don't record receipt" />
              <p className="mt-1 text-xs text-muted-foreground">Raises that account’s balance. Not counted as income.</p>
            </div>
            {editing && (editing.paidCount || 0) > 0 && (
              <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                {editing.paidCount} EMI{editing.paidCount === 1 ? "" : "s"} already paid keep their principal/interest split. Outstanding becomes amount − principal repaid ({inr(editing.totalPrincipalPaid)}).
              </p>
            )}
            <Button onClick={handleCreate} disabled={busy}>{busy ? "Saving..." : editing ? "Save changes" : "Add loan"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pay} onOpenChange={(o) => !o && setPay(null)}>
        <DialogContent className="w-[95vw] max-w-sm sm:w-full">
          <DialogHeader><DialogTitle>Pay EMI — {pay?.name}</DialogTitle></DialogHeader>
          {pay && split && (
            <div className="flex flex-col gap-3">
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <div className="flex justify-between"><span>Principal</span><b>{inr(split.principal)}</b></div>
                <div className="flex justify-between"><span>Interest</span><b>{inr(split.interest)}</b></div>
                <div className="mt-1 flex justify-between border-t border-border pt-1"><span>Total from account</span><b>{inr(split.total)}</b></div>
              </div>
              <div><Label>Pay from account</Label><SearchableSelect value={payForm.accountId} onValueChange={(v) => setPayForm((f) => ({ ...f, accountId: v }))} options={accountOptions} placeholder="Select account..." /></div>
              <div><Label>Payment date</Label><Input type="date" value={payForm.date} onChange={(e) => setPayForm((f) => ({ ...f, date: e.target.value }))} /></div>
              <Button onClick={handlePay} disabled={busy}>{busy ? "Paying..." : "Pay EMI"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </FinanceShell>
  );
}

export default function LoansPage() {
  return <Content />;
}
