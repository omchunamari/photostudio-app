"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Landmark, Wallet } from "lucide-react";
import FinanceShell, { Stat, signTone } from "@/components/finance/FinanceShell";
import useFinanceData from "@/lib/finance/useFinanceData";
import { createAccount, updateAccount } from "@/lib/firebase/finance";
import { accountLedger } from "@/lib/finance/ledger";
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

  const selected = data.accounts.find((a) => a.id === selectedId) || data.accounts[0];
  const ledger = useMemo(() => (selected ? accountLedger(selected, data.all) : []), [selected, data.all]);
  const total = data.accounts.filter((a) => a.active !== false).reduce((s, a) => s + (data.balances[a.id] || 0), 0);

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
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedId(a.id)}
                className={`rounded-lg border bg-white p-4 text-left transition-colors ${
                  selected?.id === a.id ? "border-emerald-500 ring-1 ring-emerald-500" : "border-slate-200 hover:border-slate-300"
                } ${a.active === false ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    {a.type === "cash" ? <Wallet className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />}
                    {a.name}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => (e.stopPropagation(), openEditor(a))}
                    onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), openEditor(a))}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </span>
                </div>
                <p className={`mt-1 font-heading text-2xl font-semibold ${(data.balances[a.id] || 0) < 0 ? "text-red-600" : "text-slate-900"}`}>
                  {inr(data.balances[a.id] || 0)}
                </p>
                {a.active === false && <p className="text-xs text-slate-500">Inactive</p>}
              </button>
            ))}
            <Stat label="Total balance" value={inr(total)} tone={signTone(total)} sub="Active accounts" />
          </div>

          {selected && (
            <>
              <h2 className="mb-2 font-heading text-lg font-semibold text-slate-900">{selected.name} — ledger</h2>
              <Card>
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
                        <TableCell colSpan={4} className="text-slate-500">Opening balance</TableCell>
                        <TableCell className="text-right">{inr(selected.openingBalance || 0)}</TableCell>
                      </TableRow>
                      {ledger.map(({ tx, delta, balance }, i) => (
                        <TableRow key={`${tx.id}-${i}`}>
                          <TableCell className="whitespace-nowrap">{formatDateIST(tx.date)}</TableCell>
                          <TableCell>
                            {KIND_LABELS[tx.kind]} · {tx.category}
                            <p className="text-xs text-slate-500">
                              {[tx.projectName, tx.personName, tx.description].filter(Boolean).join(" · ")}
                            </p>
                          </TableCell>
                          <TableCell className="text-right text-emerald-600">{delta > 0 ? inr(delta) : ""}</TableCell>
                          <TableCell className="text-right text-red-600">{delta < 0 ? inr(-delta) : ""}</TableCell>
                          <TableCell className="text-right font-medium">{inr(balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

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
              <p className="mt-1 text-xs text-slate-500">Balance before the first transaction recorded here.</p>
            </div>
            {editing !== "new" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                Active (inactive accounts can’t be picked for new entries)
              </label>
            )}
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </FinanceShell>
  );
}

export default function AccountsPage() {
  return <Content />;
}
