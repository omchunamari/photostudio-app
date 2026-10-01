"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Paperclip, Tags, CheckCircle2 } from "lucide-react";
import FinanceShell from "@/components/finance/FinanceShell";
import TransactionDialog from "@/components/finance/TransactionDialog";
import CategoryManager from "@/components/finance/CategoryManager";
import { useAuth } from "@/contexts/AuthContext";
import useFinanceData from "@/lib/finance/useFinanceData";
import { deleteTransaction, markPayablePaid } from "@/lib/firebase/finance";
import { deleteExpense } from "@/lib/firebase/expenses";
import { suggestedFreelancerPayouts } from "@/lib/finance/payouts";
import { filterTransactions, inr } from "@/lib/finance/calc";
import { KIND_LABELS } from "@/lib/finance/constants";
import { formatDateIST } from "@/lib/dateIST";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const KIND_FILTER = [
  { value: "all", label: "All types" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "transfer", label: "Transfer" },
  { value: "advance", label: "Advances" },
  { value: "pending", label: "Unpaid payables" },
];

const KIND_TONE = {
  income: "text-emerald-600",
  expense: "text-red-600",
  transfer: "text-slate-600",
  advance: "text-amber-600",
  advance_return: "text-emerald-600",
  loan_in: "text-emerald-600",
};

function Content() {
  const { user } = useAuth();
  const data = useFinanceData();
  const [filters, setFilters] = useState({ kind: "all", accountId: "", projectId: "", category: "", from: "", to: "", q: "" });
  const [dialog, setDialog] = useState({ open: false, initial: null });
  const [catOpen, setCatOpen] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [payForm, setPayForm] = useState({ accountId: "", date: "" });

  const accountName = (id) => data.accounts.find((a) => a.id === id)?.name || "—";
  const set = (p) => setFilters((f) => ({ ...f, ...p }));

  const rows = useMemo(() => {
    let list = filterTransactions(data.all, filters);
    if (filters.kind === "pending") list = list.filter((t) => t.status === "pending");
    else if (filters.kind !== "all") list = list.filter((t) => t.kind === filters.kind);
    if (filters.q.trim()) {
      const q = filters.q.toLowerCase();
      list = list.filter((t) =>
        [t.description, t.category, t.projectName, t.personName, t.payee].some((v) => (v || "").toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [data.all, filters]);

  const payouts = useMemo(
    () => suggestedFreelancerPayouts(data.events, data.freelancers, data.all),
    [data.events, data.freelancers, data.all]
  );

  const totalIn = rows.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0);
  const totalOut = rows.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount, 0);

  const allCategories = useMemo(
    () => [...new Set([...data.cats.project, ...data.cats.company, ...data.cats.income, ...data.all.map((t) => t.category).filter(Boolean)])],
    [data.cats, data.all]
  );

  async function handleDelete(tx) {
    if (!window.confirm("Delete this transaction? Balances and P&L will update.")) return;
    try {
      if (tx.legacy) await deleteExpense(tx.id.replace("legacy-exp-", ""));
      else await deleteTransaction(tx.id);
      toast.success("Transaction deleted");
      data.reload();
    } catch (err) {
      toast.error(err.message || "Could not delete");
    }
  }

  async function handleMarkPaid() {
    try {
      await markPayablePaid(payTarget.id, payForm.accountId, payForm.date);
      toast.success("Marked as paid");
      setPayTarget(null);
      data.reload();
    } catch (err) {
      toast.error(err.message || "Could not mark paid");
    }
  }

  const accountOptions = data.accounts.filter((a) => a.active !== false).map((a) => ({ value: a.id, label: a.name }));

  return (
    <FinanceShell
      title="Transactions"
      description="Every income, expense and transfer — enter it once, it updates accounts, projects, people and P&L."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => setCatOpen(true)}>
            <Tags className="h-4 w-4" /> Categories
          </Button>
          <Button size="sm" onClick={() => setDialog({ open: true, initial: null })}>
            <Plus className="h-4 w-4" /> Add transaction
          </Button>
        </>
      }
    >
      {payouts.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-medium text-slate-900">Freelancer payouts due ({payouts.length})</p>
            <div className="flex flex-col gap-2">
              {payouts.map((s) => (
                <div key={s.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm">
                  <span>
                    <span className="font-medium">{s.personName}</span>{" "}
                    <span className="text-slate-500">
                      · {s.projectName} · {s.days} day{s.days > 1 ? "s" : ""} @ {inr(s.dayRate)} · <b>{inr(s.amount)}</b> due
                      {s.alreadyPaid > 0 && ` (${inr(s.alreadyPaid)} already paid)`}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDialog({
                        open: true,
                        initial: {
                          kind: "expense",
                          projectId: s.projectId,
                          personUid: s.personUid,
                          personType: "freelancer",
                          category: "Freelancer",
                          amount: s.amount,
                          description: s.alreadyPaid
                            ? `Additional payout · ${s.days} total days (${inr(s.alreadyPaid)} already paid)`
                            : `${s.days} shoot day${s.days > 1 ? "s" : ""} @ ${inr(s.dayRate)}/day`,
                        },
                      })
                    }
                  >
                    Pay
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Search</Label>
            <Input value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Description, person, project..." />
          </div>
          <div>
            <Label>Type</Label>
            <SearchableSelect value={filters.kind} onValueChange={(v) => set({ kind: v })} options={KIND_FILTER} />
          </div>
          <div>
            <Label>Account</Label>
            <SearchableSelect
              value={filters.accountId || "all"}
              onValueChange={(v) => set({ accountId: v === "all" ? "" : v })}
              options={[{ value: "all", label: "All accounts" }, ...accountOptions]}
            />
          </div>
          <div>
            <Label>Project</Label>
            <SearchableSelect
              value={filters.projectId || "all"}
              onValueChange={(v) => set({ projectId: v === "all" ? "" : v })}
              options={[{ value: "all", label: "All projects" }, ...data.projects.map((p) => ({ value: p.id, label: p.projectName }))]}
              alwaysSearch
            />
          </div>
          <div>
            <Label>Category</Label>
            <SearchableSelect
              value={filters.category || "all"}
              onValueChange={(v) => set({ category: v === "all" ? "" : v })}
              options={[{ value: "all", label: "All categories" }, ...allCategories]}
            />
          </div>
          <div>
            <Label>From</Label>
            <Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
          </div>
          <div className="flex items-end gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500">In</p>
              <p className="font-semibold text-emerald-600">{inr(totalIn)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Out</p>
              <p className="font-semibold text-red-600">{inr(totalOut)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {data.loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500">No transactions match.</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Project / person</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => {
                  // Rows made by salary / EMI / allowance flows are edited there. Older
                  // project-page expenses can be deleted here (not edited); their invoices can't.
                  const locked = t.legacy ? !t.id.startsWith("legacy-exp-") : t.source && t.source !== "manual";
                  const deleteOnly = t.legacy && t.id.startsWith("legacy-exp-");
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">{formatDateIST(t.date)}</TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium ${KIND_TONE[t.kind]}`}>{KIND_LABELS[t.kind]}</span>
                        {t.status === "pending" && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">UNPAID</span>}
                        {t.legacy && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">PROJECT PAGE</span>}
                      </TableCell>
                      <TableCell>
                        {t.category}
                        {t.description && <p className="max-w-56 truncate text-xs text-slate-500">{t.description}</p>}
                      </TableCell>
                      <TableCell>
                        {t.projectName || (t.kind === "transfer" ? "" : "Company")}
                        {t.personName && <p className="text-xs text-slate-500">{t.personName}</p>}
                        {t.payee && <p className="text-xs text-slate-500">Payee: {t.payee}</p>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {t.kind === "transfer"
                          ? `${accountName(t.accountId)} → ${accountName(t.toAccountId)}`
                          : t.paidFrom === "allowance"
                            ? "From allowance"
                            : t.accountId
                              ? accountName(t.accountId)
                              : "—"}
                      </TableCell>
                      <TableCell className={`whitespace-nowrap text-right font-medium ${KIND_TONE[t.kind]}`}>
                        {t.kind === "expense" || t.kind === "advance" ? "−" : t.kind === "transfer" ? "" : "+"}
                        {inr(t.amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {t.attachmentUrl && (
                            <a href={t.attachmentUrl} target="_blank" rel="noreferrer" title={t.attachmentName || "Attachment"}>
                              <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                            </a>
                          )}
                          {t.status === "pending" && !t.legacy && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Mark paid"
                              onClick={() => {
                                setPayTarget(t);
                                setPayForm({ accountId: "", date: new Date().toISOString().slice(0, 10) });
                              }}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            </Button>
                          )}
                          {!locked && (
                            <>
                              <Button variant="ghost" size="icon-sm" onClick={() => setDialog({ open: true, initial: t })}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(t)}>
                                <Trash2 className="h-3.5 w-3.5 text-red-600" />
                              </Button>
                            </>
                          )}
                          {deleteOnly && (
                            <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(t)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Salary, EMI, allowance and advance rows are created by their own screens and are edited there. Rows tagged
        “Project page” come from invoices / expenses entered on a project page; they count in every P&L but have no account.
      </p>

      <TransactionDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        data={data}
        initial={dialog.initial}
        user={user}
        onSaved={data.reload}
      />
      <CategoryManager open={catOpen} onOpenChange={setCatOpen} cats={data.cats} onSaved={data.reload} />

      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent className="w-[95vw] max-w-sm sm:w-full">
          <DialogHeader>
            <DialogTitle>Mark as paid — {payTarget ? inr(payTarget.amount) : ""}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label>Paid from</Label>
              <SearchableSelect value={payForm.accountId} onValueChange={(v) => setPayForm((f) => ({ ...f, accountId: v }))} options={accountOptions} placeholder="Select account..." />
            </div>
            <div>
              <Label>Payment date</Label>
              <Input type="date" value={payForm.date} onChange={(e) => setPayForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <Button onClick={handleMarkPaid}>Confirm payment</Button>
          </div>
        </DialogContent>
      </Dialog>
    </FinanceShell>
  );
}

export default function TransactionsPage() {
  return <Content />;
}
