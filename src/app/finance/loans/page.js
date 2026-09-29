"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Banknote } from "lucide-react";
import FinanceShell, { Stat } from "@/components/finance/FinanceShell";
import { useAuth } from "@/contexts/AuthContext";
import useFinanceData from "@/lib/finance/useFinanceData";
import { createLoan, payEmi } from "@/lib/firebase/loans";
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

  async function handleCreate() {
    setBusy(true);
    try {
      await createLoan(form, by);
      toast.success("Loan added");
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
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add loan
        </Button>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Outstanding principal" value={inr(totalOutstanding)} tone={totalOutstanding ? "warning" : "neutral"} />
        <Stat label="Monthly EMI" value={inr(monthlyEmi)} />
        <Stat label="Active loans" value={String(active.length)} />
      </div>

      {data.loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : data.loans.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-slate-500">No loans added yet.</CardContent></Card>
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
                      <p className="font-medium text-slate-900">{l.name}</p>
                      <p className="text-xs text-slate-500">{l.lender || "—"} · {l.interestRate}% p.a. · {l.tenureMonths || "—"} months</p>
                    </div>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${l.status === "closed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {l.status === "closed" ? "Closed" : "Active"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-slate-50 p-2"><p className="text-[11px] uppercase text-slate-500">Loan</p><p className="font-semibold">{inr(l.amount)}</p></div>
                    <div className="rounded-md bg-slate-50 p-2"><p className="text-[11px] uppercase text-slate-500">EMI</p><p className="font-semibold">{inr(l.emi)}</p></div>
                    <div className="rounded-md bg-slate-50 p-2"><p className="text-[11px] uppercase text-slate-500">Outstanding</p><p className="font-semibold text-amber-600">{inr(l.outstanding)}</p></div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <span>Principal paid {inr(l.totalPrincipalPaid)} · Interest paid {inr(l.totalInterestPaid)} · {l.paidCount || 0} EMIs</span>
                    {due && (
                      <span className={d != null && d <= EMI_REMINDER_DAYS ? "font-medium text-amber-700" : ""}>
                        Next EMI {formatDateIST(due)}{d != null && d < 0 ? ` (${-d}d overdue)` : d != null && d <= EMI_REMINDER_DAYS ? ` (in ${d}d)` : ""}
                      </span>
                    )}
                  </div>
                  {emis.length > 0 && (
                    <ul className="max-h-24 divide-y divide-slate-100 overflow-y-auto text-xs">
                      {emis.map((t) => (
                        <li key={t.id} className="flex justify-between py-1">
                          <span>{formatDateIST(t.date)}</span>
                          <span>Principal {inr(t.principal)} + Interest {inr(t.interest)}</span>
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
          <DialogHeader><DialogTitle>Add loan</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Loan name</Label><Input value={form.name} onChange={(e) => patch({ name: e.target.value })} /></div>
              <div><Label>Lender</Label><Input value={form.lender} onChange={(e) => patch({ lender: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Amount (₹)</Label><Input type="number" min="0" value={form.amount} onChange={(e) => patch({ amount: e.target.value })} /></div>
              <div><Label>Interest % p.a.</Label><Input type="number" min="0" step="0.01" value={form.interestRate} onChange={(e) => patch({ interestRate: e.target.value })} /></div>
              <div><Label>Tenure (months)</Label><Input type="number" min="0" value={form.tenureMonths} onChange={(e) => patch({ tenureMonths: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>EMI (₹)</Label>
                <Input type="number" min="0" value={form.emi} onChange={(e) => setForm((f) => ({ ...f, emi: e.target.value, _emiTouched: true }))} />
                <p className="mt-1 text-xs text-slate-500">Suggested from amount, rate and tenure — overwrite with the bank’s figure.</p>
              </div>
              <div><Label>First EMI date</Label><Input type="date" value={form.startDate} onChange={(e) => patch({ startDate: e.target.value })} /></div>
            </div>
            <div>
              <Label>Loan amount received into (optional)</Label>
              <SearchableSelect value={form.disbursalAccountId} onValueChange={(v) => patch({ disbursalAccountId: v })} options={[{ value: "", label: "Don't record receipt" }, ...accountOptions]} placeholder="Don't record receipt" />
              <p className="mt-1 text-xs text-slate-500">Raises that account’s balance. Not counted as income.</p>
            </div>
            <Button onClick={handleCreate} disabled={busy}>{busy ? "Saving..." : "Add loan"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pay} onOpenChange={(o) => !o && setPay(null)}>
        <DialogContent className="w-[95vw] max-w-sm sm:w-full">
          <DialogHeader><DialogTitle>Pay EMI — {pay?.name}</DialogTitle></DialogHeader>
          {pay && split && (
            <div className="flex flex-col gap-3">
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="flex justify-between"><span>Principal</span><b>{inr(split.principal)}</b></div>
                <div className="flex justify-between"><span>Interest</span><b>{inr(split.interest)}</b></div>
                <div className="mt-1 flex justify-between border-t border-slate-200 pt-1"><span>Total from account</span><b>{inr(split.total)}</b></div>
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
