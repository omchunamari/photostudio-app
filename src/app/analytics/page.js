"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { getAllEvents, sumEventTeamCost } from "@/lib/firebase/events";
import { isEventPast } from "@/lib/status";
import { getAllProjects } from "@/lib/firebase/projects";
import { getAllQuotations } from "@/lib/firebase/quotations";
import { getAllInvoices, sumReceived } from "@/lib/firebase/invoices";
import { getAllLeads } from "@/lib/firebase/leads";
import { LEAD_STATUSES, LEAD_SOURCES } from "@/lib/constants/leads";
import { QUOTE_STATUSES, QUOTE_STATUS_LABELS } from "@/lib/constants/quotations";
import { getAllExpenses, sumExpensesByProject } from "@/lib/firebase/expenses";
import { getTransactions } from "@/lib/firebase/finance";
import { plExpense, plIncome } from "@/lib/finance/calc";
import { getAllEmployees } from "@/lib/firebase/employees";
import { getAllFreelancers } from "@/lib/firebase/freelancers";
import { getAllDeliverables, DELIVERABLE_STATUSES, DELIVERABLE_TYPES } from "@/lib/firebase/deliverables";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Users,
  Wallet,
  TrendingUp,
  IndianRupee,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Target,
  Clapperboard,
} from "lucide-react";

// Financial data — admin/PM only, mirrors the isProjectOps() boundary on
// leads/quotations/expenses in firestore.rules. Not shown to HR, leaders,
// or regular employees.
const ANALYTICS_ROLES = ["super_admin", "admin", "project_manager"];

const TABS = [
  { id: "team-load", label: "Team Load", icon: Users },
  { id: "value", label: "Employee Value", icon: IndianRupee },
  { id: "funnel", label: "Sales Funnel", icon: Target },
  { id: "post-prod", label: "Post-Production", icon: Clapperboard },
  { id: "pnl", label: "Profit & Loss", icon: TrendingUp },
];

// Shared line-chart palette, drawn from the theme's --chart-1..5 tokens so
// it stays consistent with the rest of the app (and adapts in dark mode).
const LINE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function formatINR(n) {
  return `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-08" -> "Aug 2026". Sorts correctly as a string too, since it's zero-padded.
function monthKey(isoDateOrTimestamp) {
  if (!isoDateOrTimestamp) return null;
  const d = new Date(isoDateOrTimestamp);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-");
  return `${MONTH_LABELS[Number(month) - 1]} ${year}`;
}

// Builds the last `count` calendar months (oldest first), even ones with
// no data, so the trend doesn't silently skip a quiet month.
function lastNMonthKeys(count) {
  const keys = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

// Small stat-card grid used across every tab so the numbers up top stay
// visually consistent no matter which tab you're on.
function StatGrid({ stats }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-lg font-semibold ${s.negative ? "text-destructive" : "text-foreground"}`}>
              {s.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AnalyticsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const isAllowed = ANALYTICS_ROLES.includes(user.role);

  const [tab, setTab] = useState("team-load");
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [freelancers, setFreelancers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    if (!isAllowed) {
      router.replace("/dashboard");
      return;
    }
    async function load() {
      setLoading(true);
      try {
        const [evts, projs, quotes, invs, exps, emps, frls, lds] = await Promise.all([
          getAllEvents(),
          getAllProjects(),
          getAllQuotations(),
          getAllInvoices(),
          getAllExpenses(),
          getAllEmployees(),
          getAllFreelancers(),
          getAllLeads(),
        ]);
        // Deliverables are fetched per-project (see getAllDeliverables), so
        // it runs after projs is available rather than inside the Promise.all above.
        const tsks = await getAllDeliverables(projs);
        setEvents(evts);
        setProjects(projs);
        setQuotations(quotes);
        // Money entered once in Finance (admin / super_admin only — the ledger's
        // rules) is folded into the same shapes this page already reads, so
        // Project P&L reflects it: ledger expenses become expense rows and
        // ledger income becomes paid "invoices".
        let ledger = [];
        if (["super_admin", "admin"].includes(user.role)) {
          try {
            ledger = await getTransactions();
          } catch (err) {
            console.error("Finance ledger unavailable:", err);
          }
        }
        const ledgerExpenses = ledger
          .filter((t) => t.projectId && plExpense(t) > 0)
          .map((t) => ({ projectId: t.projectId, amount: plExpense(t), date: t.date, category: t.category }));
        const ledgerIncome = ledger
          .filter((t) => t.projectId && plIncome(t) > 0)
          .map((t) => ({ projectId: t.projectId, status: "paid", amount: plIncome(t), paidAt: t.date, date: t.date }));
        setInvoices([...invs, ...ledgerIncome]);
        setExpenses([...exps, ...ledgerExpenses]);
        setEmployees(emps);
        setFreelancers(frls);
        setTasks(tsks);
        setLeads(lds);
      } catch (err) {
        toast.error(err.message || "Failed to load analytics data");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAllowed]);

  if (!isAllowed) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Team load, sales, post-production, and project profitability. Expenses now live under Finance.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : tab === "team-load" ? (
        <TeamLoadTab events={events} tasks={tasks} employees={employees} />
      ) : tab === "value" ? (
        <EmployeeValueTab events={events} projects={projects} quotations={quotations} />
      ) : tab === "funnel" ? (
        <SalesFunnelTab leads={leads} quotations={quotations} />
      ) : tab === "post-prod" ? (
        <PostProductionTab tasks={tasks} employees={employees} />
      ) : (
        <PnlTab projects={projects} quotations={quotations} invoices={invoices} expenses={expenses} events={events} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Tab 1: Team Load — how many shoots/projects each person is on, for
// rate negotiation. Counts distinct events (not shoot-days) by default,
// since that's what "how many projects have they done" usually means in
// a negotiation — shoot-days is offered as a secondary metric per bar.
// Rendered as a line chart connecting each person's ranked values (rather
// than a horizontal bar chart) per the team's chart-style preference.
// ---------------------------------------------------------------------
function TeamLoadTab({ events, tasks, employees }) {
  const [metric, setMetric] = useState("all"); // "all" | "events" | "days" | "tasks"
  const [personType, setPersonType] = useState("all"); // "all" | "employee" | "freelancer"
  // Defaults to current workload (excludes Delivered/Archived events, and
  // for tasks excludes Done) since that's what rate negotiation
  // usually needs — "how much is this person carrying right now".
  // Employee Value/P&L intentionally don't get this filter; those need
  // full lifetime history, not just active work.
  const [activeOnly, setActiveOnly] = useState(true);
  const [range, setRange] = useState("6"); // months shown in the trend chart below

  // Org-wide monthly trend — how load has moved over time, independent of
  // activeOnly/personType (those scope the per-person snapshot below, but a
  // historical trend should show the full picture for each month it covers).
  // Events are bucketed by shoot date (eventStartDate); deliverables by
  // createdAt, same as the Post-Production tab's monthly chart.
  const monthlyData = useMemo(() => {
    const months = lastNMonthKeys(Number(range));
    const byMonth = Object.fromEntries(months.map((k) => [k, { events: 0, days: 0, tasks: 0 }]));
    events.forEach((ev) => {
      const key = monthKey(ev.eventStartDate);
      if (key && byMonth[key]) {
        byMonth[key].events += 1;
        byMonth[key].days += ev.shootDays || 1;
      }
    });
    tasks.forEach((t) => {
      const key = monthKey(t.createdAt);
      if (key && byMonth[key]) byMonth[key].tasks += 1;
    });
    return months.map((key) => ({ month: monthLabel(key), ...byMonth[key] }));
  }, [events, tasks, range]);

  const data = useMemo(() => {
    const scopedEvents = activeOnly ? events.filter((ev) => !isEventPast(ev)) : events;
    const scopedTasks = activeOnly ? tasks.filter((t) => t.status !== "Delivered") : tasks;

    const byPerson = {};
    function ensure(uid, name, role, type) {
      if (!byPerson[uid]) {
        byPerson[uid] = { uid, name, role, type, events: 0, days: 0, tasks: 0 };
      } else if (!byPerson[uid].role && role) {
        // Fill in role if an earlier entry (e.g. from a task, which
        // doesn't carry role) didn't have one yet.
        byPerson[uid].role = role;
      }
      return byPerson[uid];
    }

    scopedEvents.forEach((ev) => {
      (ev.team || []).forEach((m) => {
        const row = ensure(m.uid, m.name, m.role, m.type);
        row.events += 1;
        row.days += ev.shootDays || 1;
      });
    });

    // Post-production tasks (editing, culling, color grading, etc.) —
    // employees only, since freelancers aren't assignable to tasks in the
    // post-production board today. A person can show up here even with
    // zero shoot events if all their work is post-production. Task docs
    // don't carry the assignee's role, so it's looked up from the
    // employee record instead. A task can now be shared across multiple
    // assignees (assignedUids), so each of them gets counted — a task
    // shared by 3 people adds 1 to each of their totals, not a split.
    scopedTasks.forEach((t) => {
      const uids = t.assignedUids?.length ? t.assignedUids : [t.assignedUid].filter(Boolean);
      const names = t.assignedNames?.length ? t.assignedNames : [t.assignedName].filter(Boolean);
      uids.forEach((uid, i) => {
        if (!uid) return;
        const emp = employees.find((e) => e.uid === uid);
        const row = ensure(uid, names[i] || emp?.name || "Unknown", emp?.role || null, "employee");
        row.tasks += 1;
      });
    });

    let rows = Object.values(byPerson);
    if (personType !== "all") rows = rows.filter((r) => r.type === personType);
    rows.sort((a, b) => {
      if (metric === "events") return b.events - a.events;
      if (metric === "days") return b.days - a.days;
      if (metric === "tasks") return b.tasks - a.tasks;
      // "all": sort by total workload across all three so the busiest
      // people (by any measure) float to the top.
      return (b.events + b.days + b.tasks) - (a.events + a.days + a.tasks);
    });
    return rows;
  }, [events, tasks, employees, personType, metric, activeOnly]);

  const chartData = data.map((r) => ({
    name: r.name,
    value: metric === "events" ? r.events : metric === "days" ? r.days : r.tasks,
    events: r.events,
    days: r.days,
    tasks: r.tasks,
  }));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Team load — monthly trend</h3>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue>{(v) => (v === "6" ? "Last 6 months" : "Last 12 months")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card className="mb-6">
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyData} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="events" name="Events" stroke={LINE_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="days" name="Shoot Days" stroke={LINE_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="tasks" name="Post-Prod Tasks" stroke={LINE_COLORS[2]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <h3 className="mb-4 text-sm font-medium text-foreground">By person — current snapshot</h3>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={metric} onValueChange={setMetric}>
          <SelectTrigger className="w-[200px]">
            <SelectValue>
              {(v) =>
                v === "all"
                  ? "All (events, days, tasks)"
                  : v === "events"
                  ? "No. of events/shoots"
                  : v === "days"
                  ? "Total shoot days"
                  : "No. of post-prod tasks"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All (events, days, tasks)</SelectItem>
            <SelectItem value="events">No. of events/shoots</SelectItem>
            <SelectItem value="days">Total shoot days</SelectItem>
            <SelectItem value="tasks">No. of post-prod tasks</SelectItem>
          </SelectContent>
        </Select>
        <Select value={personType} onValueChange={setPersonType}>
          <SelectTrigger className="w-[160px]">
            <SelectValue>
              {(v) => (v === "all" ? "Everyone" : v === "employee" ? "Employees only" : "Freelancers only")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="employee">Employees only</SelectItem>
            <SelectItem value="freelancer">Freelancers only</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border"
          />
          Active only (exclude Delivered/Archived events and Delivered deliverables)
        </label>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {activeOnly ? "No active assignments right now." : "No assignments recorded yet."}
        </p>
      ) : (
        <>
          <Card className="mb-6">
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ left: 8, right: 16, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                    height={70}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {metric === "all" ? (
                    <>
                      <Line type="monotone" dataKey="events" name="Events" stroke={LINE_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="days" name="Shoot Days" stroke={LINE_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="tasks" name="Post-Prod Tasks" stroke={LINE_COLORS[2]} strokeWidth={2} dot={{ r: 3 }} />
                    </>
                  ) : (
                    <Line
                      type="monotone"
                      dataKey="value"
                      name={metric === "events" ? "Events" : metric === "days" ? "Shoot days" : "Tasks"}
                      stroke={LINE_COLORS[0]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead className="text-right">Shoot Days</TableHead>
                  <TableHead className="text-right">Post-Prod Tasks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.uid}>
                    <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.role || "—"}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">{r.type || "—"}</TableCell>
                    <TableCell className="text-right">{r.events}</TableCell>
                    <TableCell className="text-right">{r.days}</TableCell>
                    <TableCell className="text-right">{r.tasks}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Tab 2: Employee Value — each project's revenue split evenly across its
// team, summed per person across every project they've worked on.
// ---------------------------------------------------------------------
function EmployeeValueTab({ events, projects, quotations }) {
  const [personType, setPersonType] = useState("all");

  const rows = useMemo(() => {
    const byPerson = {};
    projects.forEach((p) => {
      const quote = quotations.find((q) => q.id === p.quotationId);
      const revenue = p.quotationAmount ?? quote?.total ?? 0;
      if (!revenue) return;
      const projectEvents = events.filter((ev) => ev.projectId === p.id);
      const teamSet = new Map();
      projectEvents.forEach((ev) => {
        (ev.team || []).forEach((m) => {
          if (!teamSet.has(m.uid)) teamSet.set(m.uid, m);
        });
      });
      if (teamSet.size === 0) return;
      const share = revenue / teamSet.size;
      teamSet.forEach((member) => {
        if (!byPerson[member.uid]) {
          byPerson[member.uid] = {
            uid: member.uid,
            name: member.name,
            role: member.role,
            type: member.type,
            projects: 0,
            value: 0,
          };
        }
        byPerson[member.uid].projects += 1;
        byPerson[member.uid].value += share;
      });
    });

    let list = Object.values(byPerson);
    if (personType !== "all") list = list.filter((r) => r.type === personType);
    list.sort((a, b) => b.value - a.value);
    return list;
  }, [events, projects, quotations, personType]);

  const chartData = rows.map((r) => ({ name: r.name, value: Math.round(r.value) }));

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Each project&apos;s revenue is split evenly across everyone on its team, then summed
        per person across every project they&apos;ve worked on.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={personType} onValueChange={setPersonType}>
          <SelectTrigger className="w-[160px]">
            <SelectValue>
              {(v) => (v === "all" ? "Everyone" : v === "employee" ? "Employees only" : "Freelancers only")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="employee">Employees only</SelectItem>
            <SelectItem value="freelancer">Freelancers only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No revenue-linked project assignments yet — this needs both a Won quotation and a team assigned on its events.
        </p>
      ) : (
        <>
          <Card className="mb-6">
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ left: 8, right: 16, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                    height={70}
                  />
                  <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fontSize: 11 }} width={70} />
                  <Tooltip formatter={(v) => [formatINR(v), "Value generated"]} contentStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="value" name="Value generated" stroke={LINE_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Projects</TableHead>
                  <TableHead className="text-right">Value Generated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.uid}>
                    <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.role}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">{r.type || "—"}</TableCell>
                    <TableCell className="text-right">{r.projects}</TableCell>
                    <TableCell className="text-right font-medium">{formatINR(r.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Tab 3: Sales Funnel — new. Leads by stage/source, quotation status
// breakdown, win rate, and a monthly new-leads-vs-won trend. Uses
// LEAD_STATUSES as the funnel order (New Inquiry -> ... -> Converted/
// Lost/No Response) and QUOTE_STATUSES for the quotation breakdown.
// "Converted" is the current name for a won lead; "Won" is kept as a
// synonym so leads created before the pipeline rename still count
// correctly (see constants/leads.js).
// ---------------------------------------------------------------------
const isLeadWon = (l) => l.status === "Converted" || l.status === "Won";
const isLeadClosed = (l) => isLeadWon(l) || l.status === "Lost" || l.status === "No Response";

function SalesFunnelTab({ leads, quotations }) {
  const [range, setRange] = useState("6");

  const stageCounts = useMemo(() => {
    const counts = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0]));
    leads.forEach((l) => {
      // Fold the older "Won" value into the current "Converted" stage so
      // the funnel chart doesn't show a phantom bar outside the pipeline.
      const stage = l.status === "Won" ? "Converted" : l.status;
      if (counts[stage] !== undefined) counts[stage] += 1;
      else counts[stage] = (counts[stage] || 0) + 1;
    });
    return LEAD_STATUSES.map((s) => ({ stage: s, count: counts[s] || 0 }));
  }, [leads]);

  const sourceRows = useMemo(() => {
    const bySource = {};
    leads.forEach((l) => {
      const key = l.source || "Unspecified";
      if (!bySource[key]) bySource[key] = { source: key, count: 0, won: 0, lost: 0, budget: 0 };
      bySource[key].count += 1;
      bySource[key].budget += l.budget || 0;
      if (isLeadWon(l)) bySource[key].won += 1;
      if (l.status === "Lost") bySource[key].lost += 1;
    });
    return Object.values(bySource).sort((a, b) => b.count - a.count);
  }, [leads]);

  const quoteStatusRows = useMemo(() => {
    const byStatus = Object.fromEntries(QUOTE_STATUSES.map((s) => [s, { status: s, count: 0, value: 0 }]));
    quotations.forEach((q) => {
      const key = byStatus[q.status] ? q.status : "draft";
      byStatus[key].count += 1;
      byStatus[key].value += q.total || 0;
    });
    return QUOTE_STATUSES.map((s) => byStatus[s]);
  }, [quotations]);

  const monthlyTrend = useMemo(() => {
    const months = lastNMonthKeys(Number(range));
    const byMonth = Object.fromEntries(months.map((k) => [k, { newLeads: 0, won: 0 }]));
    leads.forEach((l) => {
      const key = monthKey(l.createdAt);
      if (key && byMonth[key]) byMonth[key].newLeads += 1;
    });
    leads.forEach((l) => {
      if (!isLeadWon(l)) return;
      const key = monthKey(l.updatedAt || l.createdAt);
      if (key && byMonth[key]) byMonth[key].won += 1;
    });
    return months.map((key) => ({ month: monthLabel(key), ...byMonth[key] }));
  }, [leads, range]);

  const totalLeads = leads.length;
  const won = leads.filter(isLeadWon).length;
  const lost = leads.filter((l) => l.status === "Lost").length;
  const closed = won + lost;
  const conversionRate = closed > 0 ? (won / closed) * 100 : null;
  const pipelineValue = leads
    .filter((l) => !isLeadClosed(l))
    .reduce((sum, l) => sum + (l.budget || 0), 0);
  const quotedValue = quotations.reduce((sum, q) => sum + (q.total || 0), 0);

  return (
    <div>
      <StatGrid
        stats={[
          { label: "Total Leads", value: totalLeads },
          { label: "Converted", value: won },
          { label: "Lost", value: lost, negative: lost > 0 },
          { label: "Win Rate", value: conversionRate === null ? "—" : `${conversionRate.toFixed(1)}%` },
          { label: "Open Pipeline Value", value: formatINR(pipelineValue) },
        ]}
      />

      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">New leads vs. won — monthly trend</h3>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue>{(v) => (v === "6" ? "Last 6 months" : "Last 12 months")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card className="mb-6">
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyTrend} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="newLeads" name="New Leads" stroke={LINE_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="won" name="Converted" stroke={LINE_COLORS[2]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <h3 className="mb-4 text-sm font-medium text-foreground">Funnel by stage</h3>
      <Card className="mb-6">
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={stageCounts} margin={{ left: 8, right: 16, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="count" name="Leads" stroke={LINE_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-4 text-sm font-medium text-foreground">Leads by source</h3>
          <Card className="mb-4">
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={sourceRows} margin={{ left: 8, right: 16, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="source" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} height={55} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="count" name="Leads" stroke={LINE_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Lost</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceRows.map((r) => (
                  <TableRow key={r.source}>
                    <TableCell className="font-medium text-foreground">{r.source}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right">{r.won}</TableCell>
                    <TableCell className="text-right">{r.lost}</TableCell>
                    <TableCell className="text-right">{formatINR(r.budget)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-medium text-foreground">Quotations by status</h3>
          <Card className="mb-4">
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={quoteStatusRows} margin={{ left: 8, right: 16, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="status" tickFormatter={(s) => QUOTE_STATUS_LABELS[s] || s} tick={{ fontSize: 11 }} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                  <Tooltip
                    formatter={(v, name) => [name === "Value" ? formatINR(v) : v, name]}
                    labelFormatter={(s) => QUOTE_STATUS_LABELS[s] || s}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="count" name="Count" stroke={LINE_COLORS[3]} strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quoteStatusRows.map((r) => (
                  <TableRow key={r.status}>
                    <TableCell className="font-medium text-foreground">{QUOTE_STATUS_LABELS[r.status] || r.status}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right">{formatINR(r.value)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium text-foreground">Total quoted value</TableCell>
                  <TableCell className="text-right">{quotations.length}</TableCell>
                  <TableCell className="text-right font-medium">{formatINR(quotedValue)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Tab 4: Post-Production — new. Task pipeline status, type mix,
// priority mix, overdue tasks, and a monthly completed-tasks trend.
// ---------------------------------------------------------------------
// Deliverables (projects/{id}/deliverables) don't carry a dueDate/priority
// field the way the old postProdTasks model did — only `deadline`. Mirrors
// the isOverdue() helper that used to live in postProduction.js.
function isDeliverableOverdue(d) {
  if (!d.deadline || d.status === "Delivered") return false;
  return d.deadline < new Date().toISOString().split("T")[0];
}

function PostProductionTab({ tasks, employees }) {
  const [range, setRange] = useState("6");

  const statusRows = useMemo(() => {
    const counts = Object.fromEntries(DELIVERABLE_STATUSES.map((s) => [s, 0]));
    tasks.forEach((t) => {
      if (counts[t.status] !== undefined) counts[t.status] += 1;
    });
    return DELIVERABLE_STATUSES.map((s) => ({ status: s, count: counts[s] || 0 }));
  }, [tasks]);

  const typeRows = useMemo(() => {
    const counts = {};
    tasks.forEach((t) => {
      const key = t.type || "Other";
      counts[key] = (counts[key] || 0) + 1;
    });
    return DELIVERABLE_TYPES.map((ty) => ({ type: ty, count: counts[ty] || 0 })).filter((r) => r.count > 0 || DELIVERABLE_TYPES.includes(r.type));
  }, [tasks]);

  const overdueTasks = useMemo(() => tasks.filter((t) => isDeliverableOverdue(t)), [tasks]);

  const byAssignee = useMemo(() => {
    const byPerson = {};
    tasks.forEach((t) => {
      const uids = t.assignedUids?.length ? t.assignedUids : [t.assignedUid].filter(Boolean);
      const names = t.assignedNames?.length ? t.assignedNames : [t.assignedName].filter(Boolean);
      uids.forEach((uid, i) => {
        if (!uid) return;
        if (!byPerson[uid]) {
          const emp = employees.find((e) => e.uid === uid);
          byPerson[uid] = { uid, name: names[i] || emp?.name || "Unknown", total: 0, completed: 0, overdue: 0 };
        }
        byPerson[uid].total += 1;
        if (t.status === "Delivered") byPerson[uid].completed += 1;
        if (isDeliverableOverdue(t)) byPerson[uid].overdue += 1;
      });
    });
    return Object.values(byPerson).sort((a, b) => b.total - a.total);
  }, [tasks, employees]);

  const monthlyCompleted = useMemo(() => {
    const months = lastNMonthKeys(Number(range));
    const byMonth = Object.fromEntries(months.map((k) => [k, { completed: 0, created: 0 }]));
    tasks.forEach((t) => {
      const createdKey = monthKey(t.createdAt);
      if (createdKey && byMonth[createdKey]) byMonth[createdKey].created += 1;
    });
    tasks.forEach((t) => {
      if (t.status !== "Delivered") return;
      const key = monthKey(t.updatedAt || t.createdAt);
      if (key && byMonth[key]) byMonth[key].completed += 1;
    });
    return months.map((key) => ({ month: monthLabel(key), ...byMonth[key] }));
  }, [tasks, range]);

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "Delivered").length;
  const inProgress = tasks.filter((t) => t.status === "In Progress").length;

  return (
    <div>
      <StatGrid
        stats={[
          { label: "Total Deliverables", value: total },
          { label: "Done", value: completed },
          { label: "In Progress", value: inProgress },
          { label: "Overdue", value: overdueTasks.length, negative: overdueTasks.length > 0 },
        ]}
      />

      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Created vs. completed — monthly trend</h3>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue>{(v) => (v === "6" ? "Last 6 months" : "Last 12 months")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card className="mb-6">
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyCompleted} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="created" name="Created" stroke={LINE_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="completed" name="Completed" stroke={LINE_COLORS[2]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <h3 className="mb-4 text-sm font-medium text-foreground">By pipeline stage</h3>
      <Card className="mb-6">
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={statusRows} margin={{ left: 8, right: 16, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="status" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" interval={0} height={55} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="count" name="Deliverables" stroke={LINE_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <h3 className="mb-4 text-sm font-medium text-foreground">By deliverable type</h3>
      <Card className="mb-6">
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={typeRows} margin={{ left: 8, right: 16, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="type" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} height={80} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="count" name="Deliverables" stroke={LINE_COLORS[1]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <h3 className="mb-4 text-sm font-medium text-foreground">By assignee</h3>
      {byAssignee.length === 0 ? (
        <p className="text-sm text-muted-foreground">No deliverables assigned yet.</p>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Completed</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byAssignee.map((r) => (
                <TableRow key={r.uid}>
                  <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                  <TableCell className="text-right">{r.total}</TableCell>
                  <TableCell className="text-right">{r.completed}</TableCell>
                  <TableCell className={`text-right ${r.overdue > 0 ? "text-destructive font-medium" : ""}`}>{r.overdue}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Tab 6: Project P&L — revenue is the quotation's contracted amount
// (not just what's been collected so far — that's shown separately as
// "Collected" for context), costs are every expense logged against the
// project. Projects with no linked quotation (shouldn't normally happen,
// since a project is created from a Won quotation) show revenue as ₹0.
// ---------------------------------------------------------------------
function PnlTab({ projects, quotations, invoices, expenses, events }) {
  const [range, setRange] = useState("6"); // months back: "6" | "12"
  const [expandedId, setExpandedId] = useState(null);
  const costByProject = useMemo(() => sumExpensesByProject(expenses), [expenses]);
  // In-house team cost (each event team member's per-assignment `cost`
  // field) — kept separate from logged `expenses` docs, same split the
  // project detail page uses (its `teamCost` vs `otherExpensesTotal`).
  // Omitting this here was the source of the Projects vs. Analytics
  // mismatch: this tab used to treat logged expenses as the *entire*
  // project cost, so P&L numbers ran lower than the per-project page,
  // which always adds team cost on top.
  const teamCostByProject = useMemo(() => {
    const byProject = {};
    events.forEach((ev) => {
      byProject[ev.projectId] = (byProject[ev.projectId] || 0) + sumEventTeamCost(ev.team);
    });
    return byProject;
  }, [events]);
  const receivedByProject = useMemo(() => {
    const byProject = {};
    invoices.forEach((inv) => {
      if (inv.status !== "paid") return;
      byProject[inv.projectId] = (byProject[inv.projectId] || 0) + (inv.amount || 0);
    });
    return byProject;
  }, [invoices]);
  const eventCountByProject = useMemo(() => {
    const byProject = {};
    events.forEach((ev) => {
      byProject[ev.projectId] = (byProject[ev.projectId] || 0) + 1;
    });
    return byProject;
  }, [events]);

  const rows = useMemo(() => {
    return projects.map((p) => {
      const quote = quotations.find((q) => q.id === p.quotationId);
      const revenue = p.quotationAmount ?? quote?.total ?? 0;
      const collected = receivedByProject[p.id] || 0;
      const outstanding = Math.max(0, revenue - collected);
      const loggedCost = costByProject[p.id] || 0;
      const teamCost = teamCostByProject[p.id] || 0;
      const cost = loggedCost + teamCost;
      const profit = revenue - cost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : null;
      return {
        id: p.id,
        name: p.projectName,
        revenue,
        collected,
        outstanding,
        loggedCost,
        teamCost,
        cost,
        profit,
        margin,
        eventCount: eventCountByProject[p.id] || 0,
      };
    }).sort((a, b) => b.profit - a.profit);
  }, [projects, quotations, costByProject, teamCostByProject, receivedByProject, eventCountByProject]);

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      collected: acc.collected + r.collected,
      outstanding: acc.outstanding + r.outstanding,
      cost: acc.cost + r.cost,
      profit: acc.profit + r.profit,
    }),
    { revenue: 0, collected: 0, outstanding: 0, cost: 0, profit: 0 }
  );

  // Monthly trend: revenue is attributed to the month a project was
  // created (that's when its quotation was won, so it's the closest
  // thing to a "revenue booked" date we track). Cost combines logged
  // expenses (dated to when each was actually incurred) with in-house
  // team cost, attributed to the month of the shoot (eventStartDate) it
  // came from — mirrors the same split used per-project above. Both
  // roll up independently by month, then profit is derived per month
  // from the two totals.
  const monthlyData = useMemo(() => {
    const months = lastNMonthKeys(Number(range));
    const byMonth = Object.fromEntries(months.map((k) => [k, { revenue: 0, cost: 0 }]));

    projects.forEach((p) => {
      const key = monthKey(p.createdAt);
      if (key && byMonth[key]) {
        const quote = quotations.find((q) => q.id === p.quotationId);
        byMonth[key].revenue += p.quotationAmount ?? quote?.total ?? 0;
      }
    });

    expenses.forEach((e) => {
      const key = monthKey(e.date);
      if (key && byMonth[key]) {
        byMonth[key].cost += e.amount || 0;
      }
    });

    events.forEach((ev) => {
      const key = monthKey(ev.eventStartDate);
      if (key && byMonth[key]) {
        byMonth[key].cost += sumEventTeamCost(ev.team);
      }
    });

    return months.map((key) => ({
      month: monthLabel(key),
      revenue: byMonth[key].revenue,
      cost: byMonth[key].cost,
      profit: byMonth[key].revenue - byMonth[key].cost,
    }));
  }, [projects, quotations, expenses, events, range]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Monthly trend</h3>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue>{(v) => (v === "6" ? "Last 6 months" : "Last 12 months")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyData} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fontSize: 11 }} width={70} />
              <Tooltip formatter={(v, name) => [formatINR(v), name]} contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke={LINE_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="cost" name="Cost" stroke={LINE_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="profit" name="Profit" stroke={LINE_COLORS[2]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="text-lg font-semibold text-foreground">{formatINR(totals.revenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Collected</p>
            <p className="text-lg font-semibold text-foreground">{formatINR(totals.collected)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="text-lg font-semibold text-foreground">{formatINR(totals.outstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Cost</p>
            <p className="text-lg font-semibold text-foreground">{formatINR(totals.cost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Net Profit</p>
            <p className={`text-lg font-semibold ${totals.profit >= 0 ? "text-foreground" : "text-destructive"}`}>
              {formatINR(totals.profit)}
            </p>
          </CardContent>
        </Card>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects found.</p>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6" />
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const isExpanded = expandedId === r.id;
                return (
                  <Fragment key={r.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    >
                      <TableCell className="text-muted-foreground">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                      <TableCell className="text-right">{formatINR(r.revenue)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatINR(r.collected)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatINR(r.outstanding)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatINR(r.cost)}</TableCell>
                      <TableCell className={`text-right font-medium ${r.profit >= 0 ? "text-foreground" : "text-destructive"}`}>
                        {formatINR(r.profit)}
                      </TableCell>
                      <TableCell className={`text-right ${r.margin === null ? "text-muted-foreground" : r.margin >= 0 ? "text-foreground" : "text-destructive"}`}>
                        {r.margin === null ? "—" : `${r.margin.toFixed(1)}%`}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/40 p-0">
                          <ProjectBreakdown project={r} expenses={expenses} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

/** Per-project cost breakdown shown inline when a P&L row is expanded. */
function ProjectBreakdown({ project, expenses }) {
  const projectExpenses = useMemo(
    () => expenses.filter((e) => e.projectId === project.id),
    [expenses, project.id]
  );

  // In-house team cost gets its own line (matching the "Team Cost" figure
  // on the project detail page) so this breakdown adds up to the same
  // total `cost` shown in the P&L row, not just the logged-expenses slice.
  const byCategory = useMemo(() => {
    const map = {};
    if (project.teamCost > 0) map["In-House Team Cost"] = project.teamCost;
    projectExpenses.forEach((e) => {
      const label = e.type === "freelancer_payout" ? "Freelancer Payouts" : e.type === "advance" ? "Advances" : e.category || "Misc";
      map[label] = (map[label] || 0) + (e.amount || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [projectExpenses, project.teamCost]);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {project.eventCount} event{project.eventCount !== 1 ? "s" : ""} · {projectExpenses.length} expense{projectExpenses.length !== 1 ? "s" : ""} logged
        </p>
        <Link
          href={`/projects/${project.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          View project <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      {byCategory.length === 0 ? (
        <p className="text-sm text-muted-foreground">No costs logged against this project yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {byCategory.map(([label, amount]) => (
            <div key={label} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-foreground">{formatINR(amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <AppShell>
          <AnalyticsContent />
        </AppShell>
      </DeviceGate>
    </ProtectedRoute>
  );
}