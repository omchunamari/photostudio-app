import {
  accountEffects,
  companyPnL,
  filterTransactions,
  inDateRange,
  plExpense,
  plIncome,
  projectFinancials,
  round2,
  monthKey,
} from "./calc";
import { accountLedger } from "./ledger";
import { allowanceSummary } from "@/lib/firebase/finance";
import { monthLabel } from "./payrollCalc";
import { KIND_LABELS } from "./constants";

export const REPORTS = [
  { id: "expense", label: "Expense Report" },
  { id: "projectPnl", label: "Project P&L" },
  { id: "companyPnl", label: "Company P&L" },
  { id: "accountLedger", label: "Account Ledger" },
  { id: "cashFlow", label: "Cash Flow" },
  { id: "employeeExpense", label: "Employee Expense" },
  { id: "allowance", label: "Allowance Report" },
  { id: "salary", label: "Salary Report" },
  { id: "loan", label: "Loan / EMI Report" },
  { id: "receivable", label: "Receivable Report" },
  { id: "payable", label: "Payable Report" },
];

const money = (header, key) => ({ header, key, money: true });
const text = (header, key) => ({ header, key });

function sum(rows, key) {
  return round2(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0));
}

function periodText(f) {
  if (f.from && f.to) return `${f.from} to ${f.to}`;
  if (f.from) return `From ${f.from}`;
  if (f.to) return `Up to ${f.to}`;
  return "All dates";
}

/** Builds any report from the same in-memory data every screen uses. */
export function buildReport(id, ctx, f) {
  const { all, ledger, accounts, projects, allowances, payrolls, loans } = ctx;
  const acc = (aid) => accounts.find((a) => a.id === aid)?.name || "—";
  const scoped = filterTransactions(all, f);
  const sub = periodText(f);

  switch (id) {
    case "expense": {
      const rows = scoped
        .filter((t) => plExpense(t) > 0)
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .map((t) => ({
          date: t.date,
          type: t.projectId ? "Project" : "Company",
          project: t.projectName || "—",
          category: t.category,
          person: t.personName || "",
          account: t.accountId ? acc(t.accountId) : t.paidFrom === "allowance" ? "Allowance" : t.status === "pending" ? "Unpaid" : "—",
          description: t.description,
          amount: plExpense(t),
        }));
      return {
        title: "Expense Report",
        subtitle: sub,
        columns: [text("Date", "date"), text("Type", "type"), text("Project", "project"), text("Category", "category"), text("Person", "person"), text("Account", "account"), text("Description", "description"), money("Amount", "amount")],
        rows,
        totals: { amount: sum(rows, "amount") },
      };
    }

    case "projectPnl": {
      const list = f.projectId ? projects.filter((p) => p.id === f.projectId) : projects;
      const rows = list
        .map((p) => {
          const fin = projectFinancials(p, scoped);
          return { project: p.projectName, client: p.clientName || "", value: fin.value, revenue: fin.received, expense: fin.expense, profit: fin.profit };
        })
        .filter((r) => r.revenue || r.expense || f.projectId)
        .sort((a, b) => b.profit - a.profit);
      return {
        title: "Project P&L",
        subtitle: `${sub} — Revenue = payments received in period`,
        columns: [text("Project", "project"), text("Client", "client"), money("Project value", "value"), money("Revenue", "revenue"), money("Expenses", "expense"), money("Profit", "profit")],
        rows,
        totals: { value: sum(rows, "value"), revenue: sum(rows, "revenue"), expense: sum(rows, "expense"), profit: sum(rows, "profit") },
      };
    }

    case "companyPnl": {
      const p = companyPnL(scoped);
      const rows = [
        { particulars: "REVENUE", amount: null },
        ...Object.entries(p.revenue).map(([k, v]) => ({ particulars: `  ${k}`, amount: round2(v) })),
        { particulars: "Total revenue", amount: round2(p.totalRevenue) },
        { particulars: "EXPENSES", amount: null },
        ...Object.entries(p.expenses).map(([k, v]) => ({ particulars: `  ${k}`, amount: round2(v) })),
        { particulars: "Total expenses", amount: round2(p.totalExpenses) },
        { particulars: "FINANCE COSTS", amount: null },
        ...Object.entries(p.finance).map(([k, v]) => ({ particulars: `  ${k}`, amount: round2(v) })),
        { particulars: "Total finance costs", amount: round2(p.totalFinance) },
        { particulars: p.profit >= 0 ? "COMPANY PROFIT" : "COMPANY LOSS", amount: round2(p.profit) },
      ];
      return { title: "Company P&L", subtitle: sub, columns: [text("Particulars", "particulars"), money("Amount", "amount")], rows };
    }

    case "accountLedger": {
      const list = f.accountId ? accounts.filter((a) => a.id === f.accountId) : accounts;
      const rows = [];
      list.forEach((a) => {
        const full = accountLedger(a, all);
        const before = full.filter((r) => f.from && r.tx.date < f.from);
        const opening = before.length ? before[before.length - 1].balance : f.from ? Number(a.openingBalance) || 0 : Number(a.openingBalance) || 0;
        rows.push({ date: "", account: a.name, details: "Opening balance", in: null, out: null, balance: opening });
        full
          .filter((r) => inDateRange(r.tx.date, f.from, f.to))
          .forEach(({ tx, delta, balance }) =>
            rows.push({
              date: tx.date,
              account: a.name,
              details: [KIND_LABELS[tx.kind], tx.category, tx.projectName, tx.personName, tx.description].filter(Boolean).join(" · "),
              in: delta > 0 ? delta : null,
              out: delta < 0 ? -delta : null,
              balance,
            })
          );
      });
      return {
        title: "Account Ledger",
        subtitle: `${f.accountId ? acc(f.accountId) : "All accounts"} · ${sub}`,
        columns: [text("Date", "date"), text("Account", "account"), text("Details", "details"), money("In", "in"), money("Out", "out"), money("Balance", "balance")],
        rows,
      };
    }

    case "cashFlow": {
      const byMonth = {};
      scoped.forEach((t) => {
        let inflow = 0;
        let outflow = 0;
        if (t.legacy) {
          if (t.kind === "income") inflow = t.amount;
          else outflow = t.amount;
        } else if (t.kind !== "transfer") {
          accountEffects(t).forEach((e) => (e.delta > 0 ? (inflow += e.delta) : (outflow += -e.delta)));
        }
        if (!inflow && !outflow) return;
        const k = monthKey(t.date);
        byMonth[k] = byMonth[k] || { inflow: 0, outflow: 0 };
        byMonth[k].inflow += inflow;
        byMonth[k].outflow += outflow;
      });
      const rows = Object.keys(byMonth)
        .sort()
        .map((k) => ({ month: monthLabel(k), inflow: round2(byMonth[k].inflow), outflow: round2(byMonth[k].outflow), net: round2(byMonth[k].inflow - byMonth[k].outflow) }));
      return {
        title: "Cash Flow",
        subtitle: `${sub} — actual money in / out (transfers between accounts excluded)`,
        columns: [text("Month", "month"), money("Cash in", "inflow"), money("Cash out", "outflow"), money("Net", "net")],
        rows,
        totals: { inflow: sum(rows, "inflow"), outflow: sum(rows, "outflow"), net: sum(rows, "net") },
      };
    }

    case "employeeExpense": {
      const map = {};
      scoped
        .filter((t) => plExpense(t) > 0 && t.personUid && t.source !== "salary")
        .forEach((t) => {
          const key = `${t.personUid}|${t.category}`;
          map[key] = map[key] || { person: t.personName, type: t.personType, category: t.category, count: 0, amount: 0 };
          map[key].count += 1;
          map[key].amount = round2(map[key].amount + plExpense(t));
        });
      const rows = Object.values(map).sort((a, b) => (a.person || "").localeCompare(b.person || "") || b.amount - a.amount);
      return {
        title: "Employee Expense",
        subtitle: `${sub} — expenses tagged to a person (salary excluded)`,
        columns: [text("Person", "person"), text("Type", "type"), text("Category", "category"), text("Entries", "count"), money("Amount", "amount")],
        rows,
        totals: { count: rows.reduce((s, r) => s + r.count, 0), amount: sum(rows, "amount") },
      };
    }

    case "allowance": {
      const rows = allowances
        .filter((a) => (!f.projectId || a.projectId === f.projectId) && (!f.personUid || a.employeeUid === f.personUid) && inDateRange(a.date, f.from, f.to))
        .map((a) => {
          const s = allowanceSummary(a, ledger);
          return { date: a.date, employee: a.employeeName, project: a.projectName, given: s.given, used: s.used, settled: s.returned + s.writtenOff, balance: s.balance, status: a.status === "open" ? "Open" : "Settled" };
        });
      return {
        title: "Allowance Report",
        subtitle: sub,
        columns: [text("Date", "date"), text("Employee", "employee"), text("Project", "project"), money("Advance given", "given"), money("Used", "used"), money("Returned / written off", "settled"), money("Balance", "balance"), text("Status", "status")],
        rows,
        totals: { given: sum(rows, "given"), used: sum(rows, "used"), settled: sum(rows, "settled"), balance: sum(rows, "balance") },
      };
    }

    case "salary": {
      const fromM = f.from ? f.from.slice(0, 7) : "";
      const toM = f.to ? f.to.slice(0, 7) : "";
      const rows = payrolls
        .filter((p) => (!f.personUid || p.employeeUid === f.personUid) && (!fromM || p.month >= fromM) && (!toM || p.month <= toM))
        .sort((a, b) => a.month.localeCompare(b.month) || a.employeeName.localeCompare(b.employeeName))
        .map((p) => ({ month: monthLabel(p.month), employee: p.employeeName, salary: p.salary, paidDays: p.paidDays, leave: p.leaveDays, lop: p.lopDays, lopDed: p.lopDeduction, otherDed: p.otherDeduction, advance: p.advanceRecovery, net: p.netSalary, status: p.status === "paid" ? `Paid ${p.paidAt || ""}`.trim() : "Pending" }));
      return {
        title: "Salary Report",
        subtitle: sub,
        columns: [text("Month", "month"), text("Employee", "employee"), money("Salary", "salary"), text("Paid days", "paidDays"), text("Leave", "leave"), text("LOP", "lop"), money("LOP deduction", "lopDed"), money("Other deduction", "otherDed"), money("Advance", "advance"), money("Net salary", "net"), text("Status", "status")],
        rows,
        totals: { salary: sum(rows, "salary"), lopDed: sum(rows, "lopDed"), otherDed: sum(rows, "otherDed"), advance: sum(rows, "advance"), net: sum(rows, "net") },
      };
    }

    case "loan": {
      const rows = ledger
        .filter((t) => t.source === "emi" && inDateRange(t.date, f.from, f.to) && (!f.accountId || t.accountId === f.accountId))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((t) => ({ date: t.date, loan: loans.find((l) => l.id === t.loanId)?.name || "", lender: loans.find((l) => l.id === t.loanId)?.lender || "", account: acc(t.accountId), principal: t.principal, interest: t.interest, total: t.amount, outstanding: null }));
      loans.forEach((l) => rows.push({ date: "", loan: `${l.name} (outstanding)`, lender: l.lender, account: "", principal: null, interest: null, total: null, outstanding: l.outstanding }));
      return {
        title: "Loan / EMI Report",
        subtitle: sub,
        columns: [text("Date", "date"), text("Loan", "loan"), text("Lender", "lender"), text("Account", "account"), money("Principal", "principal"), money("Interest", "interest"), money("EMI paid", "total"), money("Outstanding", "outstanding")],
        rows,
        totals: { principal: sum(rows, "principal"), interest: sum(rows, "interest"), total: sum(rows, "total") },
      };
    }

    case "receivable": {
      const list = f.projectId ? projects.filter((p) => p.id === f.projectId) : projects;
      const rows = list
        .map((p) => {
          const fin = projectFinancials(p, all);
          const last = all.filter((t) => t.projectId === p.id && plIncome(t) > 0).map((t) => t.date).sort().pop() || "";
          return { project: p.projectName, client: p.clientName || "", value: fin.value, received: fin.received, pending: fin.pending, last };
        })
        .filter((r) => r.pending > 0)
        .sort((a, b) => b.pending - a.pending);
      return {
        title: "Receivable Report",
        subtitle: "Client payments still to be received (project value − received)",
        columns: [text("Project", "project"), text("Client", "client"), money("Project value", "value"), money("Received", "received"), money("Pending", "pending"), text("Last payment", "last")],
        rows,
        totals: { value: sum(rows, "value"), received: sum(rows, "received"), pending: sum(rows, "pending") },
      };
    }

    case "payable": {
      const rows = [
        ...all
          .filter((t) => t.status === "pending" && t.kind === "expense" && inDateRange(t.date, f.from, f.to) && (!f.projectId || t.projectId === f.projectId) && (!f.category || t.category === f.category))
          .map((t) => ({ kind: "Vendor / other", payee: t.payee || t.personName || "—", project: t.projectName || "Company", category: t.category, date: t.date, amount: t.amount })),
        ...payrolls
          .filter((p) => p.status === "processed" && (!f.personUid || p.employeeUid === f.personUid))
          .map((p) => ({ kind: "Salary", payee: p.employeeName, project: "Company", category: "Salary", date: `${p.month}-01`, amount: p.netSalary })),
      ];
      return {
        title: "Payable Report",
        subtitle: "Money the company still owes (unpaid vendor expenses and processed-but-unpaid salaries)",
        columns: [text("Type", "kind"), text("Payee", "payee"), text("Project", "project"), text("Category", "category"), text("Date", "date"), money("Amount", "amount")],
        rows,
        totals: { amount: sum(rows, "amount") },
      };
    }

    default:
      return { title: "Report", subtitle: "", columns: [], rows: [] };
  }
}
