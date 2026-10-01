"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { TrendingUp, IndianRupee, HandCoins, History, BellRing } from "lucide-react";
import FinanceShell, { PageSkeleton } from "@/components/finance/FinanceShell";
import { useAuth } from "@/contexts/AuthContext";
import useFinanceData from "@/lib/finance/useFinanceData";
import { saveSalaryStructure, applyIncrement, createEmployeeAdvance, advanceOutstanding } from "@/lib/firebase/payroll";
import { inr } from "@/lib/finance/calc";
import { daysUntil } from "@/lib/finance/payrollCalc";
import { INCREMENT_REMINDER_DAYS } from "@/lib/finance/constants";
import { getISTDateStr, formatDateIST } from "@/lib/dateIST";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function Content() {
  const { user } = useAuth();
  const data = useFinanceData();
  const [dlg, setDlg] = useState(null); // { type: "salary"|"increment"|"advance"|"history", emp }
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  const staff = useMemo(
    () =>
      data.employees
        .filter((e) => e.status !== "inactive" && e.status !== "resigned")
        .filter((e) => !q || e.name?.toLowerCase().includes(q.toLowerCase()) || e.employeeId?.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [data.employees, q]
  );

  const accountOptions = data.accounts.filter((a) => a.active !== false).map((a) => ({ value: a.id, label: a.name }));
  const outstandingFor = (uid) => data.advances.filter((a) => a.employeeUid === uid).reduce((s, a) => s + advanceOutstanding(a), 0);

  const due = staff.filter((e) => {
    const d = daysUntil(data.employeeFinance[e.uid]?.nextIncrementDate);
    return d != null && d <= INCREMENT_REMINDER_DAYS;
  });

  function open(type, emp) {
    const f = data.employeeFinance[emp.uid] || {};
    setDlg({ type, emp });
    if (type === "salary")
      setForm({ monthlySalary: f.monthlySalary ?? "", annualPaidLeaves: f.annualPaidLeaves ?? 24, nextIncrementDate: f.nextIncrementDate || "" });
    if (type === "increment") setForm({ mode: "amount", value: "", effectiveDate: getISTDateStr(), note: "", nextIncrementDate: "" });
    if (type === "advance") setForm({ kind: "salary_advance", amount: "", monthlyRecovery: "", accountId: "", date: getISTDateStr(), note: "" });
  }

  async function run(fn, okMsg) {
    setSaving(true);
    try {
      await fn();
      toast.success(okMsg);
      setDlg(null);
      data.reload();
    } catch (err) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const by = { uid: user?.uid, name: user?.name };

  return (
    <FinanceShell title="Employees — salary & advances" description="Salary structure, increments and staff advances/loans. Leave and LOP come automatically from Leave and Attendance.">
      {due.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
          <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <b>Increments coming up:</b>{" "}
            {due
              .map((e) => {
                const d = daysUntil(data.employeeFinance[e.uid].nextIncrementDate);
                return `${e.name} (${d < 0 ? `${-d}d overdue` : d === 0 ? "today" : `in ${d}d`})`;
              })
              .join(", ")}
          </div>
        </div>
      )}

      <div className="mb-3 max-w-xs">
        <Input placeholder="Search employee..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {data.loading ? (
        <PageSkeleton stats={0} rows={6} />
      ) : (
        <>
          {/* Phone: one card per employee */}
          <div className="flex flex-col gap-2 md:hidden">
            {staff.map((e) => {
              const f = data.employeeFinance[e.uid];
              const d = daysUntil(f?.nextIncrementDate);
              const soon = d != null && d <= INCREMENT_REMINDER_DAYS;
              const owed = outstandingFor(e.uid);
              return (
                <div key={e.uid} className="rounded-xl bg-card p-3 shadow-xs ring-1 ring-foreground/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{e.employeeId} · {e.department}</p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">
                      {f?.monthlySalary != null ? inr(f.monthlySalary) : <span className="text-sm font-normal text-muted-foreground">No salary</span>}
                    </p>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-muted/50 p-2">
                      <p className="text-muted-foreground">Next increment</p>
                      <p className="font-medium">{formatDateIST(f?.nextIncrementDate)}</p>
                      {soon && <p className="font-medium text-warning">{d < 0 ? "Overdue" : d === 0 ? "Today" : `In ${d} days`}</p>}
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <p className="text-muted-foreground">Advance / loan due</p>
                      <p className={`font-medium ${owed ? "text-warning" : ""}`}>{owed ? inr(owed) : "—"}</p>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1 border-t border-border pt-2">
                    <Button size="sm" variant="ghost" className="flex-col gap-0.5 h-auto py-1.5 text-[11px]" onClick={() => open("salary", e)}><IndianRupee className="h-4 w-4" />Salary</Button>
                    <Button size="sm" variant="ghost" className="flex-col gap-0.5 h-auto py-1.5 text-[11px]" disabled={!f?.monthlySalary} onClick={() => open("increment", e)}><TrendingUp className="h-4 w-4" />Raise</Button>
                    <Button size="sm" variant="ghost" className="flex-col gap-0.5 h-auto py-1.5 text-[11px]" onClick={() => open("advance", e)}><HandCoins className="h-4 w-4" />Advance</Button>
                    <Button size="sm" variant="ghost" className="flex-col gap-0.5 h-auto py-1.5 text-[11px]" onClick={() => open("history", e)}><History className="h-4 w-4" />History</Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Card className="hidden md:flex">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Current salary</TableHead>
                  <TableHead>Last increment</TableHead>
                  <TableHead>Next increment</TableHead>
                  <TableHead className="text-right">Advance / loan due</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((e) => {
                  const f = data.employeeFinance[e.uid];
                  const d = daysUntil(f?.nextIncrementDate);
                  const soon = d != null && d <= INCREMENT_REMINDER_DAYS;
                  const owed = outstandingFor(e.uid);
                  return (
                    <TableRow key={e.uid}>
                      <TableCell>
                        <p className="font-medium">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.employeeId} · {e.department}</p>
                      </TableCell>
                      <TableCell className="text-right font-medium">{f?.monthlySalary != null ? inr(f.monthlySalary) : <span className="text-muted-foreground/60">Not set</span>}</TableCell>
                      <TableCell>{formatDateIST(f?.lastIncrementDate)}</TableCell>
                      <TableCell>
                        {formatDateIST(f?.nextIncrementDate)}
                        {soon && <span className="ml-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">{d < 0 ? "OVERDUE" : `IN ${d}D`}</span>}
                      </TableCell>
                      <TableCell className={`text-right ${owed ? "text-warning" : "text-muted-foreground/60"}`}>{owed ? inr(owed) : "—"}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="icon-sm" variant="ghost" title="Salary" onClick={() => open("salary", e)}><IndianRupee className="h-3.5 w-3.5" /></Button>
                          <Button size="icon-sm" variant="ghost" title="Increment" disabled={!f?.monthlySalary} onClick={() => open("increment", e)}><TrendingUp className="h-3.5 w-3.5" /></Button>
                          <Button size="icon-sm" variant="ghost" title="Advance / loan" onClick={() => open("advance", e)}><HandCoins className="h-3.5 w-3.5" /></Button>
                          <Button size="icon-sm" variant="ghost" title="History" onClick={() => open("history", e)}><History className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-md overflow-y-auto sm:w-full">
          {dlg?.type === "salary" && (
            <>
              <DialogHeader><DialogTitle>Salary — {dlg.emp.name}</DialogTitle></DialogHeader>
              <div className="flex flex-col gap-3">
                <div>
                  <Label>Monthly salary (₹)</Label>
                  <Input type="number" min="0" value={form.monthlySalary} onChange={(e) => setForm((f) => ({ ...f, monthlySalary: e.target.value }))} />
                  <p className="mt-1 text-xs text-muted-foreground">To raise an existing salary use “Increment” so the history is kept.</p>
                </div>
                <div>
                  <Label>Paid leaves per year</Label>
                  <Input type="number" min="0" value={form.annualPaidLeaves} onChange={(e) => setForm((f) => ({ ...f, annualPaidLeaves: e.target.value }))} />
                  <p className="mt-1 text-xs text-muted-foreground">Leave beyond this in a calendar year becomes LOP in payroll.</p>
                </div>
                <div>
                  <Label>Next increment date</Label>
                  <Input type="date" value={form.nextIncrementDate} onChange={(e) => setForm((f) => ({ ...f, nextIncrementDate: e.target.value }))} />
                </div>
                <Button disabled={saving} onClick={() => run(() => saveSalaryStructure(dlg.emp.uid, form), "Salary saved")}>Save</Button>
              </div>
            </>
          )}
          {dlg?.type === "increment" && (
            <>
              <DialogHeader><DialogTitle>Increment — {dlg.emp.name}</DialogTitle></DialogHeader>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">Current salary: <b>{inr(data.employeeFinance[dlg.emp.uid]?.monthlySalary)}</b></p>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                  {[{ v: "amount", l: "₹ Amount" }, { v: "percent", l: "% Percent" }].map((o) => (
                    <button key={o.v} type="button" onClick={() => setForm((f) => ({ ...f, mode: o.v }))} className={`rounded-md px-3 py-1.5 text-sm font-medium ${form.mode === o.v ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{o.l}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{form.mode === "percent" ? "Increment (%)" : "Increment (₹)"}</Label>
                    <Input type="number" min="0" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Effective from</Label>
                    <Input type="date" value={form.effectiveDate} onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Next increment date (default: +12 months)</Label>
                  <Input type="date" value={form.nextIncrementDate} onChange={(e) => setForm((f) => ({ ...f, nextIncrementDate: e.target.value }))} />
                </div>
                <div>
                  <Label>Note</Label>
                  <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
                </div>
                <Button disabled={saving} onClick={() => run(() => applyIncrement(dlg.emp.uid, data.employeeFinance[dlg.emp.uid], form, by), "Increment applied")}>Apply increment</Button>
              </div>
            </>
          )}
          {dlg?.type === "advance" && (
            <>
              <DialogHeader><DialogTitle>Advance / loan — {dlg.emp.name}</DialogTitle></DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                  {[{ v: "salary_advance", l: "Salary advance" }, { v: "loan", l: "Staff loan" }].map((o) => (
                    <button key={o.v} type="button" onClick={() => setForm((f) => ({ ...f, kind: o.v }))} className={`rounded-md px-3 py-1.5 text-sm font-medium ${form.kind === o.v ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{o.l}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Amount (₹)</Label>
                    <Input type="number" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Recover per month (₹)</Label>
                    <Input type="number" min="0" value={form.monthlyRecovery} placeholder="Full amount" onChange={(e) => setForm((f) => ({ ...f, monthlyRecovery: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Paid from</Label>
                    <SearchableSelect value={form.accountId} onValueChange={(v) => setForm((f) => ({ ...f, accountId: v }))} options={accountOptions} placeholder="Account..." />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                  </div>
                </div>
                <Input placeholder="Note (optional)" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
                <Button disabled={saving} onClick={() => run(() => createEmployeeAdvance({ ...form, employeeUid: dlg.emp.uid, employeeName: dlg.emp.name }, by), "Advance recorded — account balance updated")}>Give advance</Button>
              </div>
            </>
          )}
          {dlg?.type === "history" && (
            <>
              <DialogHeader><DialogTitle>History — {dlg.emp.name}</DialogTitle></DialogHeader>
              <div className="flex flex-col gap-4 text-sm">
                <div>
                  <p className="mb-1 font-medium">Increments</p>
                  {(data.employeeFinance[dlg.emp.uid]?.increments || []).length === 0 ? (
                    <p className="text-muted-foreground">None recorded.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {[...data.employeeFinance[dlg.emp.uid].increments].reverse().map((i, idx) => (
                        <li key={idx} className="py-1.5">
                          {formatDateIST(i.date)} · {inr(i.oldSalary)} → <b>{inr(i.newSalary)}</b> (+{inr(i.amount)}, {i.percent}%)
                          {i.note && <span className="text-muted-foreground"> — {i.note}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-1 font-medium">Advances & loans</p>
                  {data.advances.filter((a) => a.employeeUid === dlg.emp.uid).length === 0 ? (
                    <p className="text-muted-foreground">None.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {data.advances.filter((a) => a.employeeUid === dlg.emp.uid).map((a) => (
                        <li key={a.id} className="py-1.5">
                          {formatDateIST(a.date)} · {a.kind === "loan" ? "Loan" : "Advance"} {inr(a.amount)} · recovered {inr(a.recovered)} · <b>{inr(advanceOutstanding(a))} due</b>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </FinanceShell>
  );
}

export default function EmployeesFinancePage() {
  return <Content />;
}
