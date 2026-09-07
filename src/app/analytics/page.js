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
import {
  getAllExpenses,
  createExpense,
  deleteExpense,
  sumExpensesByProject,
  EXPENSE_TYPES,
  MANUAL_EXPENSE_CATEGORIES,
  getAllExpenseCategories,
} from "@/lib/firebase/expenses";
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
  { id: "expenses", label: "Expenses", icon: Wallet },
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
  const [expenseCategories, setExpenseCategories] = useState(MANUAL_EXPENSE_CATEGORIES);

  useEffect(() => {
    if (!isAllowed) {
      router.replace("/dashboard");
      return;
    }
    async function load() {
      setLoading(true);
      try {
        const [evts, projs, quotes, invs, exps, emps, frls, lds, cats] = await Promise.all([
          getAllEvents(),
          getAllProjects(),
          getAllQuotations(),
          getAllInvoices(),
          getAllExpenses(),
          getAllEmployees(),
          getAllFreelancers(),
          getAllLeads(),
          getAllExpenseCategories(),
        ]);
        // Deliverables are fetched per-project (see getAllDeliverables), so
        // it runs after projs is available rather than inside the Promise.all above.
        const tsks = await getAllDeliverables(projs);
        setEvents(evts);
        setProjects(projs);
        setQuotations(quotes);
        setInvoices(invs);
        setExpenses(exps);
        setEmployees(emps);
        setFreelancers(frls);
        setExpenseCategories(cats);
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

  async function refreshExpenses() {
    const exps = await getAllExpenses();
    setExpenses(exps);
  }

  if (!isAllowed) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Team load, sales, post-production, expenses, and project profitability.
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
      ) : tab === "expenses" ? (
        <ExpensesTab
          expenses={expenses}
          projects={projects}
          employees={employees}
          freelancers={freelancers}
          events={events}
          user={user}
          onChanged={refreshExpenses}
          expenseCategories={expenseCategories}
        />
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
// Tab 5: Expenses — freelancer payouts (auto-suggested from dayRate ×
// shoot days on their assignments, logged on demand rather than
// auto-created so admin controls exactly when a payout is recorded),
// manual costs, and advances/reimbursements to anyone on the team.
// ---------------------------------------------------------------------
function ExpensesTab({ expenses, projects, employees, freelancers, events, user, onChanged, expenseCategories = MANUAL_EXPENSE_CATEGORIES }) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    projectId: "",
    category: "Misc",
    amount: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [filterProject, setFilterProject] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");

  // Suggested freelancer payouts still outstanding: for every freelancer
  // team-member on an event, dayRate × shootDays, summed per (project,
  // person) — then netted against whatever's already been logged as
  // freelancer_payout expenses for that same pair. Only the remaining
  // balance is surfaced, so adding someone to a second event on the same
  // project after already logging their first payout just bumps the
  // suggestion by the new amount instead of requiring you to delete and
  // relog the whole thing. Uses the rate set at assignment time (m.dayRate
  // — can be a project-specific override), falling back to the
  // freelancer's profile dayRate for older assignments made before
  // per-assignment rates existed.
  const suggestedPayouts = useMemo(() => {
    const loggedByKey = {};
    expenses
      .filter((e) => e.type === "freelancer_payout")
      .forEach((e) => {
        const key = `${e.projectId}:${e.personUid}`;
        loggedByKey[key] = (loggedByKey[key] || 0) + (e.amount || 0);
      });

    const byKey = {};
    events.forEach((ev) => {
      (ev.team || []).forEach((m) => {
        if (m.type !== "freelancer") return;
        const fl = freelancers.find((f) => f.id === m.uid);
        const rate = m.dayRate || fl?.dayRate || 0;
        if (!rate) return;
        const key = `${ev.projectId}:${m.uid}`;
        if (!byKey[key]) {
          byKey[key] = {
            key,
            projectId: ev.projectId,
            projectName: ev.projectName,
            personUid: m.uid,
            personName: m.name,
            days: 0,
            totalAmount: 0,
            rates: new Set(),
          };
        }
        const evDays = ev.shootDays || 1;
        byKey[key].days += evDays;
        byKey[key].totalAmount += evDays * rate;
        byKey[key].rates.add(rate);
      });
    });

    // dayRate is shown as a single figure in the UI/description; if every
    // event used the same rate it's exact, otherwise it's a blended
    // average (totalAmount / days) since events can carry different rates.
    return Object.values(byKey)
      .map((r) => {
        const alreadyLogged = loggedByKey[r.key] || 0;
        const amount = r.totalAmount - alreadyLogged;
        return {
          ...r,
          alreadyLogged,
          amount,
          dayRate: r.rates.size === 1 ? [...r.rates][0] : Math.round(r.totalAmount / r.days),
        };
      })
      .filter((r) => r.amount > 0);
  }, [events, expenses, freelancers]);

  async function logSuggestedPayout(s) {
    try {
      await createExpense(
        {
          projectId: s.projectId,
          projectName: s.projectName,
          type: "freelancer_payout",
          category: "Freelancer Payout",
          amount: s.amount,
          description: s.alreadyLogged
            ? `Additional payout · ${s.days} total shoot days @ ~${formatINR(s.dayRate)}/day (${formatINR(s.alreadyLogged)} already logged)`
            : `${s.days} shoot day${s.days > 1 ? "s" : ""} @ ${formatINR(s.dayRate)}/day`,
          personUid: s.personUid,
          personName: s.personName,
          personType: "freelancer",
          date: new Date().toISOString().slice(0, 10),
        },
        user.uid,
        user.name
      );
      toast.success("Payout logged");
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.projectId || !form.amount) {
      toast.error("Project and amount are required");
      return;
    }
    setSaving(true);
    try {
      const project = projects.find((p) => p.id === form.projectId);
      await createExpense(
        {
          projectId: form.projectId,
          projectName: project?.projectName || "",
          type: "manual",
          category: form.category,
          amount: form.amount,
          description: form.description,
          date: form.date,
        },
        user.uid,
        user.name
      );
      toast.success("Expense logged");
      setForm({
        projectId: "",
        category: "Misc",
        amount: "",
        description: "",
        date: new Date().toISOString().slice(0, 10),
      });
      setFormOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this expense entry?")) return;
    try {
      await deleteExpense(id);
      toast.success("Deleted");
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const filteredExpenses = expenses.filter((e) => {
    if (filterProject !== "all" && e.projectId !== filterProject) return false;
    if (filterType !== "all" && e.type !== filterType) return false;
    const term = search.trim().toLowerCase();
    if (term) {
      const haystack = [e.projectName, e.personName, e.description, e.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
  const totalShown = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const byCategoryChart = useMemo(() => {
    const map = {};
    filteredExpenses.forEach((e) => {
      const label = e.type === "freelancer_payout" ? "Freelancer Payouts" : e.type === "advance" ? "Advances" : e.category || "Misc";
      map[label] = (map[label] || 0) + (e.amount || 0);
    });
    return Object.entries(map)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses]);

  return (
    <div>
      {suggestedPayouts.length > 0 && (
        <Card className="mb-4 border-accent/30 bg-accent/5">
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-medium text-foreground">
              Freelancer payouts due ({suggestedPayouts.length})
            </p>
            <div className="flex flex-col gap-2">
              {suggestedPayouts.map((s) => (
                <div key={s.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-2 text-sm">
                  <span>
                    <span className="font-medium text-foreground">{s.personName}</span>{" "}
                    <span className="text-muted-foreground">
                      · {s.projectName} · {s.days} total day{s.days > 1 ? "s" : ""} · {formatINR(s.amount)} due
                      {s.alreadyLogged > 0 && ` (${formatINR(s.alreadyLogged)} already logged)`}
                    </span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => logSuggestedPayout(s)}>
                    Log payout
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, person, project..."
            className="w-full sm:w-64"
          />
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Project">
                {(v) => (v === "all" ? "All Projects" : projects.find((p) => p.id === v)?.projectName || "Project")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.projectName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Type">
                {(v) =>
                  v === "all"
                    ? "All Types"
                    : v === "freelancer_payout"
                    ? "Freelancer Payout"
                    : v === "advance"
                    ? "Advance/Reimbursement"
                    : "Manual Expense"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="freelancer_payout">Freelancer Payout</SelectItem>
              <SelectItem value="advance">Advance/Reimbursement</SelectItem>
              <SelectItem value="manual">Manual Expense</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setFormOpen((v) => !v)}>
          <Plus className="h-4 w-4" /> Log Expense
        </Button>
      </div>

      {formOpen && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Project</Label>
                <Select value={form.projectId} onValueChange={(v) => setForm((f) => ({ ...f, projectId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project">
                      {(v) => projects.find((p) => p.id === v)?.projectName || "Select project"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.projectName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {expenseCategories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Expense"}</Button>
                <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="mb-3">
        <CardContent className="flex items-center justify-between p-3 text-sm">
          <span className="text-muted-foreground">{filteredExpenses.length} entries</span>
          <span className="font-semibold text-foreground">Total: {formatINR(totalShown)}</span>
        </CardContent>
      </Card>

      {byCategoryChart.length > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <p className="mb-2 text-sm font-medium text-foreground">By category</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={byCategoryChart} margin={{ left: 8, right: 16, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} height={55} />
                <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(v) => [formatINR(v), "Amount"]} contentStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="amount" name="Amount" stroke={LINE_COLORS[1]} strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {filteredExpenses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No expenses logged yet.</p>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Person</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground">{e.date}</TableCell>
                  <TableCell>{e.projectName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.type === "freelancer_payout" ? "Freelancer Payout" : e.type === "advance" ? "Advance" : e.category}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.personName || "—"}</TableCell>
                  <TableCell
                    className="max-w-[280px] whitespace-normal break-words text-muted-foreground"
                    title={e.description || undefined}
                  >
                    {e.description || "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatINR(e.amount)}</TableCell>
                  <TableCell>
                    <button onClick={() => handleDelete(e.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
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