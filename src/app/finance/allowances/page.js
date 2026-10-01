"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Receipt, HandCoins, Trash2 } from "lucide-react";
import FinanceShell, { Stat, PageSkeleton, EmptyState } from "@/components/finance/FinanceShell";
import TransactionDialog from "@/components/finance/TransactionDialog";
import { useAuth } from "@/contexts/AuthContext";
import useFinanceData from "@/lib/finance/useFinanceData";
import { createAllowance, settleAllowance, deleteAllowance, allowanceSummary } from "@/lib/firebase/finance";
import { inr } from "@/lib/finance/calc";
import { getISTDateStr, formatDateIST } from "@/lib/dateIST";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function Content() {
  const { user } = useAuth();
  const data = useFinanceData();
  const [giveOpen, setGiveOpen] = useState(false);
  const [form, setForm] = useState({ employeeUid: "", projectId: "", amount: "", accountId: "", date: getISTDateStr(), note: "" });
  const [saving, setSaving] = useState(false);
  const [spend, setSpend] = useState(null); // allowance being spent against
  const [settle, setSettle] = useState(null); // { allowance, balance }
  const [settleForm, setSettleForm] = useState({ mode: "return", accountId: "", date: getISTDateStr() });
  const [filter, setFilter] = useState("open");

  const accountOptions = data.accounts.filter((a) => a.active !== false).map((a) => ({ value: a.id, label: a.name }));
  const employeeOptions = data.employees
    .filter((e) => e.status !== "inactive" && e.status !== "resigned")
    .map((e) => ({ value: e.uid, label: e.name, hint: e.department }));

  const list = useMemo(
    () =>
      data.allowances
        .map((a) => ({ a, s: allowanceSummary(a, data.ledger) }))
        .filter(({ a }) => filter === "all" || a.status === filter),
    [data.allowances, data.ledger, filter]
  );

  const openTotals = list.reduce((acc, { a, s }) => (a.status === "open" ? { given: acc.given + s.given, used: acc.used + s.used, balance: acc.balance + s.balance } : acc), { given: 0, used: 0, balance: 0 });

  async function handleGive() {
    setSaving(true);
    try {
      const emp = data.employees.find((e) => e.uid === form.employeeUid);
      const proj = data.projects.find((p) => p.id === form.projectId);
      await createAllowance(
        { ...form, employeeName: emp?.name, projectName: proj?.projectName },
        { uid: user.uid, name: user.name }
      );
      toast.success("Allowance given — account balance updated");
      setGiveOpen(false);
      setForm({ employeeUid: "", projectId: "", amount: "", accountId: "", date: getISTDateStr(), note: "" });
      data.reload();
    } catch (err) {
      toast.error(err.message || "Could not save allowance");
    } finally {
      setSaving(false);
    }
  }

  async function handleSettle() {
    try {
      await settleAllowance({ ...settle.allowance }, settle.balance, settleForm, { uid: user.uid, name: user.name });
      toast.success("Allowance settled");
      setSettle(null);
      data.reload();
    } catch (err) {
      toast.error(err.message || "Could not settle");
    }
  }

  async function handleDelete(a) {
    if (!window.confirm("Delete this allowance and its cash-out entry?")) return;
    try {
      await deleteAllowance(a, data.ledger);
      toast.success("Allowance deleted");
      data.reload();
    } catch (err) {
      toast.error(err.message || "Could not delete");
    }
  }

  return (
    <FinanceShell
      title="Allowances & advances"
      description="Money handed to an employee for a project. Spends logged against it become project expenses; whatever is left is settled back."
      actions={
        <Button size="sm" onClick={() => setGiveOpen(true)}>
          <Plus className="h-4 w-4" /> Give allowance
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {["open", "settled", "all"].map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">
            {f}
          </Button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2.5 sm:gap-3">
        <Stat label="Open: given" value={inr(openTotals.given)} />
        <Stat label="Used" value={inr(openTotals.used)} />
        <Stat label="With employees" value={inr(openTotals.balance)} tone={openTotals.balance ? "warning" : "neutral"} />
      </div>

      {data.loading ? (
        <PageSkeleton stats={0} rows={3} />
      ) : list.length === 0 ? (
        <EmptyState icon={HandCoins} title="No allowances here yet" hint="Give an employee an advance for a project, then log their spends against it." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map(({ a, s }) => {
            const spends = data.ledger.filter((t) => t.allowanceId === a.id && t.kind === "expense");
            const pct = s.given ? Math.min(100, Math.round((s.used / s.given) * 100)) : 0;
            return (
              <Card key={a.id}>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">{a.employeeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.projectName} · {formatDateIST(a.date)}
                      </p>
                    </div>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${a.status === "open" ? "bg-warning/15 text-warning" : "bg-success/10 text-success"}`}>
                      {a.status === "open" ? "Open" : "Settled"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-[11px] uppercase text-muted-foreground">Advance given</p>
                      <p className="font-semibold">{inr(s.given)}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-[11px] uppercase text-muted-foreground">Used</p>
                      <p className="font-semibold">{inr(s.used)}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-[11px] uppercase text-muted-foreground">Balance</p>
                      <p className={`font-semibold ${s.balance < 0 ? "text-destructive" : "text-warning"}`}>{inr(s.balance)}</p>
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-success" style={{ width: `${pct}%` }} />
                  </div>
                  {spends.length > 0 && (
                    <ul className="max-h-32 divide-y divide-border overflow-y-auto text-xs">
                      {spends.map((t) => (
                        <li key={t.id} className="flex justify-between py-1">
                          <span>
                            {t.category}
                            {t.description ? ` — ${t.description}` : ""}
                          </span>
                          <span className="font-medium">{inr(t.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {a.status === "open" && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSpend(a)}>
                        <Receipt className="h-3.5 w-3.5" /> Log spend
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSettle({ allowance: a, balance: s.balance });
                          setSettleForm({ mode: "return", accountId: a.accountId || "", date: getISTDateStr() });
                        }}
                      >
                        <HandCoins className="h-3.5 w-3.5" /> Settle
                      </Button>
                      {spends.length === 0 && (
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(a)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={giveOpen} onOpenChange={setGiveOpen}>
        <DialogContent className="w-[95vw] max-w-md sm:w-full">
          <DialogHeader>
            <DialogTitle>Give allowance / advance</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label>Employee</Label>
              <SearchableSelect value={form.employeeUid} onValueChange={(v) => setForm((f) => ({ ...f, employeeUid: v }))} options={employeeOptions} placeholder="Select employee..." alwaysSearch />
            </div>
            <div>
              <Label>Project</Label>
              <SearchableSelect value={form.projectId} onValueChange={(v) => setForm((f) => ({ ...f, projectId: v }))} options={data.projects.map((p) => ({ value: p.id, label: p.projectName }))} placeholder="Select project..." alwaysSearch />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (₹)</Label>
                <Input type="number" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Paid from account</Label>
              <SearchableSelect value={form.accountId} onValueChange={(v) => setForm((f) => ({ ...f, accountId: v }))} options={accountOptions} placeholder="Select account..." />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
            <Button onClick={handleGive} disabled={saving}>{saving ? "Saving..." : "Give allowance"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!settle} onOpenChange={(o) => !o && setSettle(null)}>
        <DialogContent className="w-[95vw] max-w-sm sm:w-full">
          <DialogHeader>
            <DialogTitle>Settle allowance</DialogTitle>
          </DialogHeader>
          {settle && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Unspent balance: <b>{inr(settle.balance)}</b>
              </p>
              {settle.balance > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                    {[
                      { v: "return", l: "Returned" },
                      { v: "expense", l: "Book as expense" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => setSettleForm((f) => ({ ...f, mode: o.v }))}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${settleForm.mode === o.v ? "bg-card shadow-sm" : "text-muted-foreground"}`}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                  {settleForm.mode === "return" && (
                    <div>
                      <Label>Returned to account</Label>
                      <SearchableSelect value={settleForm.accountId} onValueChange={(v) => setSettleForm((f) => ({ ...f, accountId: v }))} options={accountOptions} placeholder="Select account..." />
                    </div>
                  )}
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={settleForm.date} onChange={(e) => setSettleForm((f) => ({ ...f, date: e.target.value }))} />
                  </div>
                </>
              )}
              {settle.balance < 0 && (
                <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                  The employee spent more than the advance. Reimburse the difference by adding an expense transaction for them.
                </p>
              )}
              <Button onClick={handleSettle}>Settle</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <TransactionDialog
        open={!!spend}
        onOpenChange={(o) => !o && setSpend(null)}
        data={data}
        initial={
          spend && {
            kind: "expense",
            projectId: spend.projectId,
            personUid: spend.employeeUid,
            personType: "employee",
            allowanceId: spend.id,
            paidFrom: "allowance",
          }
        }
        user={user}
        onSaved={data.reload}
      />
    </FinanceShell>
  );
}

export default function AllowancesPage() {
  return <Content />;
}
