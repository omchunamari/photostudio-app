"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tags, CheckCircle2, ArrowLeftRight, SlidersHorizontal } from "lucide-react";
import FinanceShell, { Stat, PageSkeleton, EmptyState } from "@/components/finance/FinanceShell";
import TransactionDialog from "@/components/finance/TransactionDialog";
import CategoryManager from "@/components/finance/CategoryManager";
import { useAuth } from "@/contexts/AuthContext";
import useFinanceData from "@/lib/finance/useFinanceData";
import { deleteTransaction, markPayablePaid, setLegacyAccount } from "@/lib/firebase/finance";
import { deleteExpense } from "@/lib/firebase/expenses";
import FreelancerPayouts from "@/components/finance/FreelancerPayouts";
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
  { value: "noaccount", label: "Missing account" },
];

const KIND_TONE = {
  income: "text-success",
  expense: "text-destructive",
  transfer: "text-muted-foreground",
  advance: "text-warning",
  advance_return: "text-success",
  loan_in: "text-success",
};

// Older project-page invoices / expenses that were never tied to a Cash/Bank account.
const needsAccount = (t) => t.legacy && !t.accountId;

function Content() {
  const { user } = useAuth();
  const data = useFinanceData();
  const [filters, setFilters] = useState({ kind: "all", accountId: "", projectId: "", category: "", from: "", to: "", q: "" });
  const [dialog, setDialog] = useState({ open: false, initial: null });
  const [catOpen, setCatOpen] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [payForm, setPayForm] = useState({ accountId: "", date: "" });
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignAccount, setAssignAccount] = useState("");

  const accountName = (id) => data.accounts.find((a) => a.id === id)?.name || "—";
  const set = (p) => setFilters((f) => ({ ...f, ...p }));
  const [showFilters, setShowFilters] = useState(false);
  const EMPTY_FILTERS = { kind: "all", accountId: "", projectId: "", category: "", from: "", to: "", q: "" };
  const activeFilters = ["accountId", "projectId", "category", "from", "to"].filter((k) => filters[k]).length + (filters.kind !== "all" ? 1 : 0) + (filters.q ? 1 : 0);
  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const rows = useMemo(() => {
    let list = filterTransactions(data.all, filters);
    if (filters.kind === "pending") list = list.filter((t) => t.status === "pending");
    else if (filters.kind === "noaccount") list = list.filter(needsAccount);
    else if (filters.kind !== "all") list = list.filter((t) => t.kind === filters.kind);
    if (filters.q.trim()) {
      const q = filters.q.toLowerCase();
      list = list.filter((t) =>
        [t.description, t.category, t.projectName, t.personName, t.payee].some((v) => (v || "").toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [data.all, filters]);

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

  async function handleAssign() {
    try {
      await setLegacyAccount(assignTarget.id, assignAccount);
      toast.success("Account assigned — balance updated");
      setAssignTarget(null);
      data.reload();
    } catch (err) {
      toast.error(err.message || "Could not assign account");
    }
  }

  const missingAccount = data.all.filter(needsAccount).length;
  // --- shared row pieces, used by both the phone cards and the desktop table ---
  const amountText = (t) =>
    `${t.kind === "expense" || t.kind === "advance" ? "−" : t.kind === "transfer" ? "" : "+"}${inr(t.amount)}`;

  function badges(t) {
    return (
      <>
        {t.status === "pending" && <span className="ml-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">UNPAID</span>}
        {t.legacy && <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">PROJECT PAGE</span>}
      </>
    );
  }

  function accountCell(t) {
    if (needsAccount(t)) {
      return (
        <button
          type="button"
          className="rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning hover:bg-warning/25"
          onClick={() => {
            setAssignTarget(t);
            setAssignAccount("");
          }}
        >
          Assign account
        </button>
      );
    }
    if (t.kind === "transfer") return `${accountName(t.accountId)} → ${accountName(t.toAccountId)}`;
    if (t.paidFrom === "allowance") return "From allowance";
    return t.accountId ? accountName(t.accountId) : "—";
  }

  // Rows made by salary / EMI / allowance flows are edited there. Older
  // project-page expenses can be deleted here (not edited); their invoices can't.
  function actionsFor(t) {
    const locked = t.legacy ? !t.id.startsWith("legacy-exp-") : t.source && t.source !== "manual";
    const deleteOnly = t.legacy && t.id.startsWith("legacy-exp-");
    const out = [];
    if (t.status === "pending" && !t.legacy)
      out.push(
        <Button
          key="pay"
          variant="ghost"
          size="sm"
          title="Mark paid"
          onClick={() => {
            setPayTarget(t);
            setPayForm({ accountId: "", date: new Date().toISOString().slice(0, 10) });
          }}
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-success" /> <span className="md:hidden">Mark paid</span>
        </Button>
      );
    if (!locked && !deleteOnly)
      out.push(
        <Button key="edit" variant="ghost" size="sm" aria-label="Edit" onClick={() => setDialog({ open: true, initial: t })}>
          <Pencil className="h-3.5 w-3.5" /> <span className="md:hidden">Edit</span>
        </Button>
      );
    if (!locked || deleteOnly)
      out.push(
        <Button key="del" variant="ghost" size="sm" aria-label="Delete" onClick={() => handleDelete(t)}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" /> <span className="md:hidden">Delete</span>
        </Button>
      );
    return out.length ? out : null;
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
      <FreelancerPayouts data={data} onPay={(preset) => setDialog({ open: true, initial: preset })} />

      {/* Summary of what the current filters show */}
      <div className="mb-3 grid grid-cols-3 gap-2.5 sm:gap-3">
        <Stat label="Money in" value={inr(totalIn)} tone="positive" />
        <Stat label="Money out" value={inr(totalOut)} tone={totalOut ? "negative" : "neutral"} />
        <Stat label="Entries" value={String(rows.length)} />
      </div>

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <Input value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search description, person, project..." />
            <Button variant="outline" size="sm" className="md:hidden" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
              <SlidersHorizontal className="h-4 w-4" />
              Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
            </Button>
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
          <div className={`${showFilters ? "grid" : "hidden"} grid-cols-1 gap-3 sm:grid-cols-2 md:grid lg:grid-cols-3`}>
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
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" className="md:hidden" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {data.loading ? (
        <PageSkeleton stats={0} rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="No transactions match" hint="Try clearing a filter, or add a new transaction." />
      ) : (
        <>
          {/* Phone: one card per transaction */}
          <div className="flex flex-col gap-2 md:hidden">
            {rows.map((t) => (
              <div key={t.id} className="rounded-xl bg-card p-3 shadow-xs ring-1 ring-foreground/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{t.category || KIND_LABELS[t.kind]}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[t.projectName || (t.kind === "transfer" ? "" : "Company"), t.personName].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <p className={`shrink-0 text-base font-semibold tabular-nums ${KIND_TONE[t.kind]}`}>{amountText(t)}</p>
                </div>
                {t.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{formatDateIST(t.date)}</span>
                  <span>·</span>
                  <span className={KIND_TONE[t.kind]}>{KIND_LABELS[t.kind]}</span>
                  <span>·</span>
                  {accountCell(t)}
                  {badges(t)}
                </div>
                {actionsFor(t) && <div className="mt-2 flex items-center justify-end gap-1 border-t border-border pt-2">{actionsFor(t)}</div>}
              </div>
            ))}
          </div>

          {/* Tablet / desktop: table */}
          <Card className="hidden md:flex">
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
                  {rows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">{formatDateIST(t.date)}</TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium ${KIND_TONE[t.kind]}`}>{KIND_LABELS[t.kind]}</span>
                        {badges(t)}
                      </TableCell>
                      <TableCell>
                        {t.category}
                        {t.description && <p className="max-w-56 truncate text-xs text-muted-foreground">{t.description}</p>}
                      </TableCell>
                      <TableCell>
                        {t.projectName || (t.kind === "transfer" ? "" : "Company")}
                        {t.personName && <p className="text-xs text-muted-foreground">{t.personName}</p>}
                        {t.payee && <p className="text-xs text-muted-foreground">Payee: {t.payee}</p>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{accountCell(t)}</TableCell>
                      <TableCell className={`whitespace-nowrap text-right font-medium tabular-nums ${KIND_TONE[t.kind]}`}>{amountText(t)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">{actionsFor(t)}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
      {missingAccount > 0 && filters.kind !== "noaccount" && (
        <button type="button" onClick={() => set({ kind: "noaccount" })} className="mt-3 text-sm font-medium text-warning hover:underline">
          {missingAccount} older project-page entr{missingAccount === 1 ? "y has" : "ies have"} no Cash/Bank account — review them →
        </button>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Salary, EMI, allowance and advance rows are created by their own screens and are edited there. Rows tagged
        “Project page” come from invoices / expenses entered on a project page; they count in every P&L, and move a Cash/Bank balance once you assign an account.
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

      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent className="w-[95vw] max-w-sm sm:w-full">
          <DialogHeader>
            <DialogTitle>Assign account — {assignTarget ? inr(assignTarget.amount) : ""}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {assignTarget?.kind === "income" ? "Which account did this payment land in?" : "Which account was this paid from?"}{" "}
              The account balance updates immediately.
            </p>
            <SearchableSelect value={assignAccount} onValueChange={setAssignAccount} options={accountOptions} placeholder="Select account..." />
            <Button onClick={handleAssign} disabled={!assignAccount}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

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
