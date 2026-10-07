"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Calculator, Download, Wallet, Undo2, SlidersHorizontal, Banknote, CheckCircle2, Clock, Trash2 } from "lucide-react";
import FinanceShell, { Stat, PageSkeleton, EmptyState, Segmented } from "@/components/finance/FinanceShell";
import { useAuth } from "@/contexts/AuthContext";
import useFinanceData from "@/lib/finance/useFinanceData";
import {
  getApprovedLeaveForYear,
  getAutoLeaveForYear,
  processPayroll,
  paySalary,
  undoSalaryPayment,
  advanceOutstanding,
  payrollId,
} from "@/lib/firebase/payroll";
import { deletePayroll } from "@/lib/firebase/financeEdits";
import { computeLeaveAndLop, computePayslip, leaveDateSet, monthLabel } from "@/lib/finance/payrollCalc";
import { downloadPayslipPdf } from "@/lib/finance/payslipPdf";
import { DEFAULT_ANNUAL_PAID_LEAVES } from "@/lib/finance/constants";
import { inr, round2 } from "@/lib/finance/calc";
import { getISTDateStr } from "@/lib/dateIST";
import { getOrgHolidays } from "@/lib/firebase/holidays";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function currentMonth() {
  return getISTDateStr().slice(0, 7);
}

function Content() {
  const { user } = useAuth();
  const data = useFinanceData();
  const [month, setMonth] = useState(currentMonth());
  const [leaveSrc, setLeaveSrc] = useState({ approved: [], auto: [], loaded: false });
  const [adjust, setAdjust] = useState({}); // uid -> { lopAdjust, otherEarnings, otherDeduction, advanceRecovery }
  const [adjTarget, setAdjTarget] = useState(null);
  const [payTarget, setPayTarget] = useState(null); // a row, or "ALL"
  const [payForm, setPayForm] = useState({ accountId: "", date: getISTDateStr() });
  const [busy, setBusy] = useState(false);
  const [orgHolidays, setOrgHolidays] = useState([]);

  useEffect(() => {
    getOrgHolidays().then(setOrgHolidays).catch(() => {});
  }, []);

  const year = month.slice(0, 4);
  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeaveSrc((s) => ({ ...s, loaded: false }));
    Promise.all([getApprovedLeaveForYear(year), getAutoLeaveForYear(year)])
      .then(([approved, auto]) => live && setLeaveSrc({ approved, auto, loaded: true }))
      .catch((err) => {
        console.error(err);
        toast.error("Could not load leave / attendance");
      });
    return () => {
      live = false;
    };
  }, [year]);

  const accountOptions = data.accounts.filter((a) => a.active !== false).map((a) => ({
    value: a.id,
    label: a.name,
    hint: inr(data.balances[a.id] || 0),
  }));

  const rows = useMemo(() => {
    const saved = Object.fromEntries(data.payrolls.filter((p) => p.month === month).map((p) => [p.employeeUid, p]));
    return data.employees
      .filter((e) => e.status !== "inactive" && e.status !== "resigned")
      .map((e) => {
        const fin = data.employeeFinance[e.uid];
        const existing = saved[e.uid];
        // Paid payrolls are frozen snapshots; everything else recomputes live.
        if (existing?.status === "paid") return { emp: e, payroll: existing, locked: true };
        if (!fin?.monthlySalary) return { emp: e, payroll: null, noSalary: true };
        const dates = leaveDateSet(
          leaveSrc.approved.filter((r) => r.employeeUid === e.uid),
          leaveSrc.auto.filter((r) => r.employeeUid === e.uid),
          orgHolidays
        );
        const { leaveDays, lopDays } = computeLeaveAndLop(month, dates, fin.annualPaidLeaves ?? DEFAULT_ANNUAL_PAID_LEAVES);
        const adj = adjust[e.uid] || {};
        const openAdv = data.advances.filter((a) => a.employeeUid === e.uid && advanceOutstanding(a) > 0);
        const autoRecoveries = openAdv.map((a) => ({
          advanceId: a.id,
          amount: Math.min(Number(a.monthlyRecovery) || advanceOutstanding(a), advanceOutstanding(a)),
          clears: (Number(a.monthlyRecovery) || advanceOutstanding(a)) >= advanceOutstanding(a),
        }));
        const autoTotal = round2(autoRecoveries.reduce((s, r) => s + r.amount, 0));
        const recoveryTotal = adj.advanceRecovery !== undefined && adj.advanceRecovery !== "" ? Number(adj.advanceRecovery) : autoTotal;
        // Manual override scales the auto split down/up proportionally, capped at what's owed.
        const totalOwed = openAdv.reduce((s, a) => s + advanceOutstanding(a), 0);
        const capped = Math.min(recoveryTotal, totalOwed);
        let remaining = capped;
        const recoveries = openAdv
          .map((a) => {
            const take = Math.min(advanceOutstanding(a), remaining);
            remaining = round2(remaining - take);
            return { advanceId: a.id, amount: round2(take), clears: take >= advanceOutstanding(a) };
          })
          .filter((r) => r.amount > 0);
        const slip = computePayslip({
          ym: month,
          monthlySalary: fin.monthlySalary,
          leaveDays,
          lopDays,
          lopAdjust: adj.lopAdjust,
          otherEarnings: adj.otherEarnings,
          otherDeduction: adj.otherDeduction,
          advanceRecovery: capped,
          joinedOn: e.joiningDate || null,
        });
        const payroll = {
          id: payrollId(month, e.uid),
          month,
          employeeUid: e.uid,
          employeeName: e.name,
          employeeCode: e.employeeId || "",
          designation: e.designation || (e.role || "").replace(/_/g, " "),
          department: e.department || "",
          ...slip,
          recoveries,
          status: existing?.status || "draft",
          txId: existing?.txId || null,
        };
        return { emp: e, payroll, saved: !!existing };
      });
  }, [data.employees, data.employeeFinance, data.payrolls, data.advances, leaveSrc, month, adjust, orgHolidays]);

  // Former staff: deactivated / resigned / deleted people who have a saved
  // payroll for this month. Shown from the saved snapshot — never recomputed.
  const formerRows = useMemo(() => {
    const currentUids = new Set(
      data.employees.filter((e) => e.status !== "inactive" && e.status !== "resigned").map((e) => e.uid)
    );
    return data.payrolls
      .filter((p) => p.month === month && !currentUids.has(p.employeeUid))
      .map((p) => {
        const emp = data.employees.find((e) => e.uid === p.employeeUid) || {
          uid: p.employeeUid,
          name: p.employeeName,
          employeeId: p.employeeCode || "",
          department: p.department || "",
          status: "deleted",
        };
        return { emp, payroll: p, locked: p.status === "paid", saved: true, former: true };
      })
      .sort((a, b) => (a.emp.name || "").localeCompare(b.emp.name || ""));
  }, [data.employees, data.payrolls, month]);

  const [view, setView] = useState("current"); // current | former
  const shownRows = view === "former" ? formerRows : rows;
  const allRows = [...rows, ...formerRows];

  const payable = rows.filter((r) => r.payroll && !r.locked);
  const totals = allRows.reduce(
    (t, r) => {
      if (!r.payroll) return t;
      t.net += r.payroll.netSalary;
      if (r.payroll.status === "paid") t.paid += r.payroll.netSalary;
      else t.pending += r.payroll.netSalary;
      return t;
    },
    { net: 0, paid: 0, pending: 0 }
  );

  const by = { uid: user?.uid, name: user?.name };

  async function processAll() {
    setBusy(true);
    try {
      for (const r of payable) await processPayroll(r.payroll, by);
      toast.success(`Processed ${payable.length} salaries for ${monthLabel(month)}`);
      data.reload();
    } catch (err) {
      toast.error(err.message || "Could not process payroll");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPay() {
    setBusy(true);
    try {
      const targets = payTarget === "ALL" ? payable.filter((r) => r.saved) : [allRows.find((r) => r.payroll?.id === payTarget.payroll.id)];
      for (const r of targets) {
        // Re-process first so the payment always matches what's on screen.
        await processPayroll(r.payroll, by);
        await paySalary(r.payroll, payForm, by);
      }
      toast.success(`Paid ${targets.length} salar${targets.length === 1 ? "y" : "ies"} — account, expense and P&L updated`);
      setPayTarget(null);
      data.reload();
    } catch (err) {
      toast.error(err.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  async function undo(r) {
    if (!window.confirm(`Reverse ${r.emp.name}'s ${monthLabel(month)} salary payment?`)) return;
    try {
      await undoSalaryPayment(r.payroll);
      toast.success("Payment reversed");
      data.reload();
    } catch (err) {
      toast.error(err.message || "Could not reverse");
    }
  }

  async function discard(r) {
    if (!window.confirm(`Discard ${r.emp.name}'s processed ${monthLabel(month)} salary? Nothing has been paid; the month is simply recalculated from Leave and Attendance.`)) return;
    try {
      await deletePayroll(r.payroll);
      setAdjust((a) => {
        const next = { ...a };
        delete next[r.emp.uid];
        return next;
      });
      toast.success("Processed salary discarded");
      data.reload();
    } catch (err) {
      toast.error(err.message || "Could not discard");
    }
  }

  const allTotal = payTarget === "ALL" ? payable.filter((r) => r.saved).reduce((s, r) => s + r.payroll.netSalary, 0) : payTarget?.payroll?.netSalary || 0;

  return (
    <FinanceShell
      title="Payroll"
      description="Salary is worked out from Leave and Attendance, then paid from an account — which posts the salary expense to Company P&L."
      actions={
        <>
          <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-40" />
          <Button size="sm" variant="outline" onClick={processAll} disabled={busy || !payable.length || !leaveSrc.loaded}>
            <Calculator className="h-4 w-4" /> Process month
          </Button>
          <Button
            size="sm"
            disabled={busy || !payable.some((r) => r.saved)}
            onClick={() => {
              setPayTarget("ALL");
              setPayForm({ accountId: "", date: getISTDateStr() });
            }}
          >
            <Wallet className="h-4 w-4" /> Pay all processed
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <div className="col-span-2 sm:col-span-1"><Stat icon={Banknote} label={`Payable — ${monthLabel(month)}`} value={inr(totals.net)} /></div>
        <Stat icon={CheckCircle2} label="Paid" value={inr(totals.paid)} tone="positive" />
        <Stat icon={Clock} label="Salary pending" value={inr(totals.pending)} tone={totals.pending ? "warning" : "neutral"} />
      </div>

      <div className="mb-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "current", label: `Current staff (${rows.length})` },
            { value: "former", label: `Former staff (${formerRows.length})` },
          ]}
        />
      </div>
      {view === "former" && formerRows.length === 0 && !data.loading && (
        <EmptyState icon={Banknote} title={`No former staff payroll for ${monthLabel(month)}`} hint="Deactivated or deleted employees appear here for months they were paid or processed." />
      )}

      {data.loading || !leaveSrc.loaded ? (
        <PageSkeleton stats={0} rows={6} />
      ) : (
        <>
          {/* Phone: one card per employee */}
          <div className="flex flex-col gap-2 md:hidden">
            {shownRows.map((r) => {
              const p = r.payroll;
              if (!p)
                return (
                  <div key={r.emp.uid} className="rounded-xl bg-card p-3 text-sm shadow-xs ring-1 ring-foreground/10">
                    <p className="font-medium">{r.emp.name}</p>
                    <p className="text-xs text-muted-foreground">Salary not set — add it under Employees</p>
                  </div>
                );
              const status = p.status;
              return (
                <div key={r.emp.uid} className="rounded-xl bg-card p-3 shadow-xs ring-1 ring-foreground/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.emp.name}</p>
                      <p className="text-xs text-muted-foreground">{r.emp.employeeId}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold tabular-nums">{inr(p.netSalary)}</p>
                      <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${status === "paid" ? "bg-success/10 text-success" : status === "processed" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
                        {status === "paid" ? "Paid" : status === "processed" ? "Processed" : "Draft"}
                      </span>
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    {[
                      ["Salary", inr(p.salary)],
                      ["Paid days", `${p.paidDays}/${p.daysInMonth}`],
                      ["Leave", p.leaveDays],
                      ["LOP", p.lopDays, p.lopDays ? "text-destructive" : ""],
                      ["LOP ded.", p.lopDeduction ? inr(p.lopDeduction) : "—"],
                      ["Advance", p.advanceRecovery ? inr(p.advanceRecovery) : "—"],
                    ].map(([k, v, cls]) => (
                      <div key={k} className="rounded-lg bg-muted/50 p-2">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className={`font-medium tabular-nums ${cls || ""}`}>{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {p.otherDeduction ? <p className="mt-1.5 text-xs text-muted-foreground">Other deduction: {inr(p.otherDeduction)}</p> : null}
                  <div className="mt-2 flex items-center justify-end gap-1 border-t border-border pt-2">
                    {!r.locked && (
                      <>
                        {!r.former && (
                          <Button size="sm" variant="ghost" onClick={() => setAdjTarget(r)}>
                            <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust
                          </Button>
                        )}
                        {r.saved && (
                          <Button size="sm" variant="ghost" onClick={() => discard(r)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" /> Discard
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => {
                            setPayTarget(r);
                            setPayForm({ accountId: "", date: getISTDateStr() });
                          }}
                        >
                          Pay
                        </Button>
                      </>
                    )}
                    {r.locked && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => downloadPayslipPdf(p, r.emp)}>
                          <Download className="h-3.5 w-3.5" /> Payslip
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => undo(r)}>
                          <Undo2 className="h-3.5 w-3.5 text-destructive" /> Reverse
                        </Button>
                      </>
                    )}
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
                  <TableHead className="text-right">Salary</TableHead>
                  <TableHead className="text-right">Paid days</TableHead>
                  <TableHead className="text-right">Leave</TableHead>
                  <TableHead className="text-right">LOP</TableHead>
                  <TableHead className="text-right">LOP ded.</TableHead>
                  <TableHead className="text-right">Other ded.</TableHead>
                  <TableHead className="text-right">Advance</TableHead>
                  <TableHead className="text-right">Final salary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownRows.map((r) => {
                  const p = r.payroll;
                  if (!p)
                    return (
                      <TableRow key={r.emp.uid}>
                        <TableCell>{r.emp.name}</TableCell>
                        <TableCell colSpan={10} className="text-muted-foreground/60">Salary not set — add it under Employees</TableCell>
                      </TableRow>
                    );
                  const status = p.status;
                  return (
                    <TableRow key={r.emp.uid}>
                      <TableCell>
                        <p className="font-medium">{r.emp.name}</p>
                        <p className="text-xs text-muted-foreground">{r.emp.employeeId}</p>
                      </TableCell>
                      <TableCell className="text-right">{inr(p.salary)}</TableCell>
                      <TableCell className="text-right">{p.paidDays}/{p.daysInMonth}</TableCell>
                      <TableCell className="text-right">{p.leaveDays}</TableCell>
                      <TableCell className={`text-right ${p.lopDays ? "font-medium text-destructive" : ""}`}>{p.lopDays}</TableCell>
                      <TableCell className="text-right">{p.lopDeduction ? inr(p.lopDeduction) : "—"}</TableCell>
                      <TableCell className="text-right">{p.otherDeduction ? inr(p.otherDeduction) : "—"}</TableCell>
                      <TableCell className="text-right">{p.advanceRecovery ? inr(p.advanceRecovery) : "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{inr(p.netSalary)}</TableCell>
                      <TableCell>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${status === "paid" ? "bg-success/10 text-success" : status === "processed" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
                          {status === "paid" ? "Paid" : status === "processed" ? "Processed" : "Draft"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {!r.locked && !r.former && (
                            <Button size="icon-sm" variant="ghost" title="Adjust" onClick={() => setAdjTarget(r)}>
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {!r.locked && r.saved && (
                            <Button size="icon-sm" variant="ghost" title="Discard processed salary" aria-label="Discard processed salary" onClick={() => discard(r)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                          {!r.locked && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setPayTarget(r);
                                setPayForm({ accountId: "", date: getISTDateStr() });
                              }}
                            >
                              Pay
                            </Button>
                          )}
                          {r.locked && (
                            <>
                              <Button size="icon-sm" variant="ghost" title="Payslip PDF" onClick={() => downloadPayslipPdf(p, r.emp)}>
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon-sm" variant="ghost" title="Reverse payment" onClick={() => undo(r)}>
                                <Undo2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </>
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
        </>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        LOP = leave days beyond the employee’s yearly paid leaves (approved leave + auto-marked absences). LOP deduction =
        salary ÷ days in month × LOP days. “Process month” saves the figures; paying posts the Salary expense from the account you choose.
      </p>

      <Dialog open={!!adjTarget} onOpenChange={(o) => !o && setAdjTarget(null)}>
        <DialogContent className="w-[95vw] max-w-sm sm:w-full">
          <DialogHeader>
            <DialogTitle>Adjust — {adjTarget?.emp.name}</DialogTitle>
          </DialogHeader>
          {adjTarget && (
            <div className="flex flex-col gap-3">
              {[
                ["lopAdjust", "Extra LOP days (+/−)", "e.g. 1 or -0.5"],
                ["otherEarnings", "Other earnings (₹)", "Bonus, reimbursement..."],
                ["otherDeduction", "Other deduction (₹)", "Penalty, TDS..."],
                ["advanceRecovery", "Advance / loan recovery (₹)", "Blank = scheduled amount"],
              ].map(([key, label, ph]) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    step="0.5"
                    placeholder={ph}
                    value={adjust[adjTarget.emp.uid]?.[key] ?? ""}
                    onChange={(e) => setAdjust((a) => ({ ...a, [adjTarget.emp.uid]: { ...a[adjTarget.emp.uid], [key]: e.target.value } }))}
                  />
                </div>
              ))}
              <Button onClick={() => setAdjTarget(null)}>Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent className="w-[95vw] max-w-sm sm:w-full">
          <DialogHeader>
            <DialogTitle>Pay salary — {inr(allTotal)}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {payTarget === "ALL" ? `${payable.filter((r) => r.saved).length} processed salaries` : payTarget?.emp?.name} · {monthLabel(month)}
            </p>
            <div>
              <Label>Pay from account</Label>
              <SearchableSelect value={payForm.accountId} onValueChange={(v) => setPayForm((f) => ({ ...f, accountId: v }))} options={accountOptions} placeholder="Select account..." />
            </div>
            <div>
              <Label>Payment date</Label>
              <Input type="date" value={payForm.date} onChange={(e) => setPayForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <Button onClick={confirmPay} disabled={busy}>{busy ? "Paying..." : "Confirm payment"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </FinanceShell>
  );
}

export default function PayrollPage() {
  return <Content />;
}
