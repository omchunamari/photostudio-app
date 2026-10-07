"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Landmark, Wallet, PiggyBank, BookOpen, Trash2 } from "lucide-react";
import FinanceShell, { Stat, signTone, PageSkeleton, EmptyState } from "@/components/finance/FinanceShell";
import useFinanceData from "@/lib/finance/useFinanceData";
import { createAccount, updateAccount, setLegacyAccount } from "@/lib/firebase/finance";
import { accountLedger } from "@/lib/finance/ledger";
import { deleteAccount, accountUsage } from "@/lib/firebase/financeEdits";
import { inr } from "@/lib/finance/calc";
import { KIND_LABELS } from "@/lib/finance/constants";
import { formatDateIST } from "@/lib/dateIST";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const EMPTY = { name: "", type: "bank", openingBalance: "", active: true };

function Content() {
  const data = useFinanceData();
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | account
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignAccount, setAssignAccount] = useState("");

  // No selection = the full ledger (every entry, all accounts). Clicking an
  // account card narrows it to that account, with a running balance.
  const selected = data.accounts.find((a) => a.id === selectedId) || null;
  const ledger = useMemo(() => (selected ? accountLedger(selected, data.all) : []), [selected, data.all]);
  const accountName = (id) => data.accounts.find((a) => a.id === id)?.name || "";

  const allRows = useMemo(
    () => [...data.all].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || "")),
    [data.all]
  );
  const IN_KINDS = ["income", "advance_return", "loan_in"];
  const OUT_KINDS = ["expense", "advance"];
  const allIn = allRows.filter((t) => IN_KINDS.includes(t.kind)).reduce((s, t) => s + t.amount, 0);
  const allOut = allRows.filter((t) => OUT_KINDS.includes(t.kind)).reduce((s, t) => s + t.amount, 0);

  function accountLabel(t) {
    if (t.kind === "transfer") return `${accountName(t.accountId)} → ${accountName(t.toAccountId)}`;
    if (t.paidFrom === "allowance") return "From allowance";
    if (t.status === "pending") return "Unpaid";
    return t.accountId ? accountName(t.accountId) : "No account";
  }
  const total = data.accounts.filter((a) => a.active !== false).reduce((s, a) => s + (data.balances[a.id] || 0), 0);

  // Older project-page invoices / expenses have no account until one is assigned.
  const needsAccount = (t) => t.legacy && !t.accountId;

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

  function openEditor(acc) {
    setEditing(acc || "new");
    setForm(acc ? { name: acc.name, type: acc.type, openingBalance: String(acc.openingBalance ?? 0), active: acc.active !== false } : EMPTY);
  }

  async function save() {
    setSaving(true);
    try {
      if (editing === "new") await createAccount(form);
      else await updateAccount(editing.id, form);
      toast.success("Account saved");
      setEditing(null);
      data.reload();
    } catch (err) {
      toast.error(err.message || "Could not save account");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the account "${editing.name}"? This can't be undone.`)) return;
    setSaving(true);
    try {
      await deleteAccount(editing, data);
      toast.success("Account deleted");
      if (selectedId === editing.id) setSelectedId("");
      setEditing(null);
      data.reload();
    } catch (err) {
      toast.error(err.message || "Could not delete account");
    } finally {
      setSaving(false);
    }
  }

  const editingUsage = editing && editing !== "new" ? accountUsage(editing.id, data) : 0;

  return (
    <FinanceShell
      title="Accounts"
      description="Cash and bank accounts. Balances are calculated from the ledger, so they are always in step with every transaction."
      actions={
        <Button size="sm" onClick={() => openEditor(null)}>
          <Plus className="h-4 w-4" /> Add account
        </Button>
      }
    >
      {data.loading ? (
        <PageSkeleton stats={4} rows={5} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {data.accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedId(selected?.id === a.id ? "" : a.id)}
                className={`rounded-xl border bg-card p-3 text-left shadow-xs transition-colors sm:p-4 ${
                  selected?.id === a.id ? "border-accent ring-1 ring-accent" : "border-border hover:border-border"
                } ${a.active === false ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {a.type === "cash" ? <Wallet className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />}
                    {a.name}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => (e.stopPropagation(), openEditor(a))}
                    onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), openEditor(a))}
                    className="text-muted-foreground/60 hover:text-foreground/80"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </span>
                </div>
                <p className={`mt-1 truncate font-heading text-lg font-semibold tabular-nums sm:text-2xl ${(data.balances[a.id] || 0) < 0 ? "text-destructive" : "text-foreground"}`}>
                  {inr(data.balances[a.id] || 0)}
                </p>
                {a.active === false && <p className="text-xs text-muted-foreground">Inactive</p>}
              </button>
            ))}
            <Stat icon={PiggyBank} label="Total balance" value={inr(total)} tone={signTone(total)} sub="Active accounts" />
          </div>

          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              {selected ? `${selected.name} — ledger` : "All entries"}
            </h2>
            {selected ? (
              <Button size="sm" variant="outline" onClick={() => setSelectedId("")}>
                Show all accounts
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Click an account above to filter to just that account.</p>
            )}
          </div>

          {selected ? (
            <>
            <div className="flex flex-col gap-2 md:hidden">
              <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Opening balance</span>
                <span className="font-medium tabular-nums">{inr(selected.openingBalance || 0)}</span>
              </div>
              {ledger.map(({ tx, delta, balance }, i) => (
                <div key={`${tx.id}-${i}`} className="rounded-xl bg-card p-3 shadow-xs ring-1 ring-foreground/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{KIND_LABELS[tx.kind]} · {tx.category}</p>
                      <p className="truncate text-xs text-muted-foreground">{[tx.projectName, tx.personName, tx.description].filter(Boolean).join(" · ")}</p>
                    </div>
                    <p className={`shrink-0 font-semibold tabular-nums ${delta > 0 ? "text-success" : "text-destructive"}`}>
                      {delta > 0 ? "+" : "−"}{inr(Math.abs(delta))}
                    </p>
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                    <span>{formatDateIST(tx.date)}</span>
                    <span>Balance {inr(balance)}</span>
                  </div>
                </div>
              ))}
            </div>
            <Card className="hidden md:flex">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="text-right">In</TableHead>
                      <TableHead className="text-right">Out</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">Opening balance</TableCell>
                      <TableCell className="text-right">{inr(selected.openingBalance || 0)}</TableCell>
                    </TableRow>
                    {ledger.map(({ tx, delta, balance }, i) => (
                      <TableRow key={`${tx.id}-${i}`}>
                        <TableCell className="whitespace-nowrap">{formatDateIST(tx.date)}</TableCell>
                        <TableCell>
                          {KIND_LABELS[tx.kind]} · {tx.category}
                          <p className="text-xs text-muted-foreground">
                            {[tx.projectName, tx.personName, tx.description].filter(Boolean).join(" · ")}
                          </p>
                        </TableCell>
                        <TableCell className="text-right text-success">{delta > 0 ? inr(delta) : ""}</TableCell>
                        <TableCell className="text-right text-destructive">{delta < 0 ? inr(-delta) : ""}</TableCell>
                        <TableCell className="text-right font-medium">{inr(balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            </>
          ) : allRows.length === 0 ? (
            <EmptyState icon={BookOpen} title="No entries yet" hint="Add a transaction and it will appear here." />
          ) : (
            <>
            <div className="flex flex-col gap-2 md:hidden">
              {allRows.map((t) => (
                <div key={t.id} className="rounded-xl bg-card p-3 shadow-xs ring-1 ring-foreground/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{KIND_LABELS[t.kind]} · {t.category}</p>
                      <p className="truncate text-xs text-muted-foreground">{[t.projectName, t.personName, t.description].filter(Boolean).join(" · ")}</p>
                    </div>
                    <p className={`shrink-0 font-semibold tabular-nums ${IN_KINDS.includes(t.kind) ? "text-success" : OUT_KINDS.includes(t.kind) ? "text-destructive" : "text-muted-foreground"}`}>
                      {IN_KINDS.includes(t.kind) ? "+" : OUT_KINDS.includes(t.kind) ? "−" : ""}{inr(t.amount)}
                    </p>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{formatDateIST(t.date)}</span>
                    {needsAccount(t) ? (
                      <button
                        type="button"
                        className="rounded bg-warning/15 px-1.5 py-0.5 font-medium text-warning"
                        onClick={() => {
                          setAssignTarget(t);
                          setAssignAccount("");
                        }}
                      >
                        Assign account
                      </button>
                    ) : (
                      <span>{accountLabel(t)}</span>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm font-semibold">
                <span>{allRows.length} entries</span>
                <span className="tabular-nums"><span className="text-success">{inr(allIn)}</span> in · <span className="text-destructive">{inr(allOut)}</span> out</span>
              </div>
            </div>
            <Card className="hidden md:flex">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="text-right">In</TableHead>
                      <TableHead className="text-right">Out</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allRows.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap">{formatDateIST(t.date)}</TableCell>
                        <TableCell className={`whitespace-nowrap ${t.kind !== "transfer" && !t.accountId && t.paidFrom !== "allowance" ? "text-warning" : ""}`}>
                          {needsAccount(t) ? (
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
                          ) : (
                            accountLabel(t)
                          )}
                        </TableCell>
                        <TableCell>
                          {KIND_LABELS[t.kind]} · {t.category}
                          <p className="text-xs text-muted-foreground">
                            {[t.projectName, t.personName, t.description].filter(Boolean).join(" · ")}
                          </p>
                        </TableCell>
                        <TableCell className="text-right text-success">{IN_KINDS.includes(t.kind) ? inr(t.amount) : ""}</TableCell>
                        <TableCell className="text-right text-destructive">
                          {OUT_KINDS.includes(t.kind) ? inr(t.amount) : t.kind === "transfer" ? <span className="text-muted-foreground">{inr(t.amount)} moved</span> : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={3}>Total ({allRows.length} entries)</TableCell>
                      <TableCell className="text-right text-success">{inr(allIn)}</TableCell>
                      <TableCell className="text-right text-destructive">{inr(allOut)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            </>
          )}
        </>
      )}

      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent className="w-[95vw] max-w-sm sm:w-full">
          <DialogHeader>
            <DialogTitle>Assign account — {assignTarget ? inr(assignTarget.amount) : ""}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {assignTarget?.kind === "income" ? "Which account did this payment land in?" : "Which account was this paid from?"}{" "}
              The balance updates immediately.
            </p>
            <SearchableSelect
              value={assignAccount}
              onValueChange={setAssignAccount}
              options={data.accounts.filter((a) => a.active !== false).map((a) => ({ value: a.id, label: a.name, hint: inr(data.balances[a.id] || 0) }))}
              placeholder="Select account..."
            />
            <Button onClick={handleAssign} disabled={!assignAccount}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="w-[95vw] max-w-sm sm:w-full">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add account" : "Edit account"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. HDFC Current" />
            </div>
            {editing === "new" && (
              <div>
                <Label>Type</Label>
                <SearchableSelect value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))} options={[{ value: "bank", label: "Bank" }, { value: "cash", label: "Cash" }]} />
              </div>
            )}
            <div>
              <Label>Opening balance (₹)</Label>
              <Input type="number" value={form.openingBalance} onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))} />
              <p className="mt-1 text-xs text-muted-foreground">Balance before the first transaction recorded here.</p>
            </div>
            {editing !== "new" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                Active (inactive accounts can’t be picked for new entries)
              </label>
            )}
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            {editing && editing !== "new" && (
              <div className="border-t border-border pt-3">
                {editingUsage ? (
                  <p className="text-xs text-muted-foreground">
                    {editingUsage} entr{editingUsage === 1 ? "y uses" : "ies use"} this account, so it can’t be deleted — untick Active to hide it, or move those entries to another account first.
                  </p>
                ) : (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={remove} disabled={saving}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete account
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </FinanceShell>
  );
}

export default function AccountsPage() {
  return <Content />;
}
