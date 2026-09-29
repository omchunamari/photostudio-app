"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, BellRing, CalendarClock } from "lucide-react";
import FinanceShell, { Stat, signTone } from "@/components/finance/FinanceShell";
import TransactionDialog from "@/components/finance/TransactionDialog";
import { useAuth } from "@/contexts/AuthContext";
import useFinanceData from "@/lib/finance/useFinanceData";
import { companyPnL, filterTransactions, inr, plExpense, plIncome, projectFinancials } from "@/lib/finance/calc";
import { nextEmiDate } from "@/lib/finance/loanCalc";
import { daysUntil, monthLabel } from "@/lib/finance/payrollCalc";
import { EMI_REMINDER_DAYS, INCREMENT_REMINDER_DAYS } from "@/lib/finance/constants";
import { fyLabel, fyStartYearForDate } from "@/lib/dashboardFinance";
import { getISTDateStr, formatDateIST } from "@/lib/dateIST";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const INACTIVE_PROJECT = ["Delivered", "Archived"];

function Section({ title, children }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function Content() {
  const { user } = useAuth();
  const data = useFinanceData();
  const [dialog, setDialog] = useState(false);
  const today = getISTDateStr();
  const ym = today.slice(0, 7);
  const fy = fyStartYearForDate(today);

  const m = useMemo(() => {
    const monthRows = data.all.filter((t) => (t.date || "").slice(0, 7) === ym);
    const revenue = monthRows.reduce((s, t) => s + plIncome(t), 0);
    const expense = monthRows.reduce((s, t) => s + plExpense(t), 0);

    const active = data.projects.filter((p) => !INACTIVE_PROJECT.includes(p.status));
    const projFin = active.map((p) => projectFinancials(p, data.all));
    const clientPending = data.projects
      .filter((p) => p.status !== "Archived")
      .reduce((s, p) => s + projectFinancials(p, data.all).pending, 0);

    const vendorPending = data.all.filter((t) => t.status === "pending" && t.kind === "expense").reduce((s, t) => s + t.amount, 0);
    const salaryPending = data.payrolls.filter((p) => p.status === "processed").reduce((s, p) => s + p.netSalary, 0);

    const pnl = companyPnL(filterTransactions(data.all, { from: `${fy}-04-01`, to: `${fy + 1}-03-31` }));

    const emis = data.loans
      .filter((l) => l.status !== "closed")
      .map((l) => ({ l, due: nextEmiDate(l) }))
      .filter((x) => x.due && daysUntil(x.due) <= 30)
      .sort((a, b) => a.due.localeCompare(b.due));
    const increments = data.employees
      .map((e) => ({ e, due: data.employeeFinance[e.uid]?.nextIncrementDate }))
      .filter((x) => x.due && daysUntil(x.due) <= INCREMENT_REMINDER_DAYS)
      .sort((a, b) => a.due.localeCompare(b.due));
    const monthlyPayroll = data.employees
      .filter((e) => e.status !== "inactive" && e.status !== "resigned")
      .reduce((s, e) => s + (data.employeeFinance[e.uid]?.monthlySalary || 0), 0);
    const monthProcessed = data.payrolls.filter((p) => p.month === ym);
    const salaryRunDone = monthProcessed.length > 0 && monthProcessed.every((p) => p.status === "paid");

    return {
      revenue,
      expense,
      active,
      projRevenue: projFin.reduce((s, f) => s + f.received, 0),
      projExpense: projFin.reduce((s, f) => s + f.expense, 0),
      clientPending,
      vendorPending,
      salaryPending,
      pnl,
      emis,
      increments,
      monthlyPayroll,
      salaryRunDone,
    };
  }, [data, ym, fy]);

  const activeAccounts = data.accounts.filter((a) => a.active !== false);
  const totalBalance = activeAccounts.reduce((s, a) => s + (data.balances[a.id] || 0), 0);
  const projProfit = m.projRevenue - m.projExpense;

  return (
    <FinanceShell
      title="Finance"
      description="One ledger behind every figure — accounts, projects, people, payroll, loans and P&L."
      actions={
        <Button size="sm" onClick={() => setDialog(true)} disabled={data.loading}>
          <Plus className="h-4 w-4" /> Add transaction
        </Button>
      }
    >
      {data.loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <>
          <Section title="Accounts">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {activeAccounts.map((a) => (
                <Stat key={a.id} label={a.name} value={inr(data.balances[a.id] || 0)} tone={(data.balances[a.id] || 0) < 0 ? "negative" : "neutral"} />
              ))}
              <Stat label="Total balance" value={inr(totalBalance)} tone={signTone(totalBalance)} />
            </div>
          </Section>

          <Section title={`Business — ${monthLabel(ym)}`}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="This month revenue" value={inr(m.revenue)} tone="positive" />
              <Stat label="This month expense" value={inr(m.expense)} />
              <Stat label="This month profit" value={inr(m.revenue - m.expense)} tone={signTone(m.revenue - m.expense)} />
            </div>
          </Section>

          <Section title="Projects">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Active projects" value={String(m.active.length)} />
              <Stat label="Project revenue" value={inr(m.projRevenue)} tone="positive" sub="Received, active projects" />
              <Stat label="Project expense" value={inr(m.projExpense)} />
              <Stat label="Project profit" value={inr(projProfit)} tone={signTone(projProfit)} />
            </div>
          </Section>

          <Section title="Payments">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Client pending" value={inr(m.clientPending)} tone={m.clientPending ? "warning" : "neutral"} sub="Project value − received" />
              <Stat label="Vendor / other pending" value={inr(m.vendorPending)} tone={m.vendorPending ? "warning" : "neutral"} sub="Unpaid expenses" />
              <Stat label="Salary pending" value={inr(m.salaryPending)} tone={m.salaryPending ? "warning" : "neutral"} sub="Processed, not yet paid" />
            </div>
          </Section>

          <Section title="Upcoming">
            <Card>
              <CardContent className="divide-y divide-slate-100 p-0 text-sm">
                <div className="flex items-center justify-between gap-3 p-3">
                  <span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-slate-400" /> Salary — {monthLabel(ym)}</span>
                  <span className="text-slate-600">
                    {m.salaryRunDone ? "Paid" : `${inr(m.monthlyPayroll)} gross · `}
                    {!m.salaryRunDone && <Link href="/finance/payroll" className="font-medium text-emerald-700 hover:underline">Run payroll</Link>}
                  </span>
                </div>
                {m.emis.length === 0 ? (
                  <div className="p-3 text-slate-500">No EMIs due in the next 30 days.</div>
                ) : (
                  m.emis.map(({ l, due }) => {
                    const d = daysUntil(due);
                    return (
                      <div key={l.id} className="flex items-center justify-between gap-3 p-3">
                        <span className="flex items-center gap-2"><BellRing className={`h-4 w-4 ${d <= EMI_REMINDER_DAYS ? "text-amber-500" : "text-slate-400"}`} /> EMI — {l.name}</span>
                        <span className={d < 0 ? "font-medium text-red-600" : "text-slate-600"}>{inr(l.emi)} · {formatDateIST(due)}{d < 0 ? ` (${-d}d overdue)` : ` (in ${d}d)`}</span>
                      </div>
                    );
                  })
                )}
                {m.increments.length === 0 ? (
                  <div className="p-3 text-slate-500">No increments due in the next {INCREMENT_REMINDER_DAYS} days.</div>
                ) : (
                  m.increments.map(({ e, due }) => {
                    const d = daysUntil(due);
                    return (
                      <div key={e.uid} className="flex items-center justify-between gap-3 p-3">
                        <span className="flex items-center gap-2"><BellRing className="h-4 w-4 text-amber-500" /> Increment — {e.name}</span>
                        <span className={d < 0 ? "font-medium text-red-600" : "text-slate-600"}>{formatDateIST(due)}{d < 0 ? ` (${-d}d overdue)` : d === 0 ? " (today)" : ` (in ${d}d)`}</span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </Section>

          <Section title={`Company P&L — ${fyLabel(fy)}`}>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Total revenue" value={inr(m.pnl.totalRevenue)} tone="positive" />
              <Stat label="Total expenses" value={inr(m.pnl.totalExpenses)} />
              <Stat label="Finance costs" value={inr(m.pnl.totalFinance)} sub="Loan interest" />
              <Stat label={m.pnl.profit >= 0 ? "Company profit" : "Company loss"} value={inr(m.pnl.profit)} tone={signTone(m.pnl.profit)} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Full breakdown in <Link href="/finance/reports" className="font-medium text-emerald-700 hover:underline">Reports → Company P&L</Link>.
            </p>
          </Section>
        </>
      )}

      <TransactionDialog open={dialog} onOpenChange={setDialog} data={data} initial={null} user={user} onSaved={data.reload} />
    </FinanceShell>
  );
}

export default function FinancePage() {
  return <Content />;
}
