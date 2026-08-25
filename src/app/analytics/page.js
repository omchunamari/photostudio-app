"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { getAllEvents } from "@/lib/firebase/events";
import { isEventPast } from "@/lib/status";
import { getAllProjects } from "@/lib/firebase/projects";
import { getAllQuotations, getPaymentSummary } from "@/lib/firebase/quotations";
import {
  getAllExpenses,
  createExpense,
  deleteExpense,
  sumExpensesByProject,
  EXPENSE_TYPES,
  MANUAL_EXPENSE_CATEGORIES,
} from "@/lib/firebase/expenses";
import { getAllEmployees } from "@/lib/firebase/employees";
import { getAllFreelancers } from "@/lib/firebase/freelancers";
import { getAllTasks } from "@/lib/firebase/postProduction";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Users, Wallet, TrendingUp, IndianRupee, Trash2, Plus } from "lucide-react";

// Financial data — admin/PM only, mirrors the isProjectOps() boundary on
// leads/quotations/expenses in firestore.rules. Not shown to HR, leaders,
// or regular employees.
const ANALYTICS_ROLES = ["super_admin", "admin", "project_manager"];

const TABS = [
  { id: "team-load", label: "Team Load", icon: Users },
  { id: "value", label: "Employee Value", icon: IndianRupee },
  { id: "expenses", label: "Expenses", icon: Wallet },
  { id: "pnl", label: "Profit & Loss", icon: TrendingUp },
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

function AnalyticsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const isAllowed = ANALYTICS_ROLES.includes(user.role);

  const [tab, setTab] = useState("team-load");
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [freelancers, setFreelancers] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    if (!isAllowed) {
      router.replace("/dashboard");
      return;
    }
    async function load() {
      setLoading(true);
      try {
        const [evts, projs, quotes, exps, emps, frls, tsks] = await Promise.all([
          getAllEvents(),
          getAllProjects(),
          getAllQuotations(),
          getAllExpenses(),
          getAllEmployees(),
          getAllFreelancers(),
          getAllTasks(),
        ]);
        setEvents(evts);
        setProjects(projs);
        setQuotations(quotes);
        setExpenses(exps);
        setEmployees(emps);
        setFreelancers(frls);
        setTasks(tsks);
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
          Team load, expenses, and project profitability.
        </p>
      </div>

      <div className="mb-6 flex gap-1 border-b border-border">
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
      ) : tab === "expenses" ? (
        <ExpensesTab
          expenses={expenses}
          projects={projects}
          employees={employees}
          freelancers={freelancers}
          events={events}
          user={user}
          onChanged={refreshExpenses}
        />
      ) : (
        <PnlTab projects={projects} quotations={quotations} expenses={expenses} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Tab 1: Team Load — how many shoots/projects each person is on, for
// rate negotiation. Counts distinct events (not shoot-days) by default,
// since that's what "how many projects have they done" usually means in
// a negotiation — shoot-days is offered as a secondary metric per bar.
// ---------------------------------------------------------------------
function TeamLoadTab({ events, tasks, employees }) {
  const [metric, setMetric] = useState("all"); // "all" | "events" | "days" | "tasks"
  const [personType, setPersonType] = useState("all"); // "all" | "employee" | "freelancer"
  // Defaults to current workload (excludes Delivered/Archived events, and
  // for tasks excludes Completed) since that's what rate negotiation
  // usually needs — "how much is this person carrying right now".
  // Employee Value/P&L intentionally don't get this filter; those need
  // full lifetime history, not just active work.
  const [activeOnly, setActiveOnly] = useState(true);

  const data = useMemo(() => {
    const scopedEvents = activeOnly ? events.filter((ev) => !isEventPast(ev)) : events;
    const scopedTasks = activeOnly ? tasks.filter((t) => t.status !== "Completed") : tasks;

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

  // No cap — with a team in the 20-30 range, a top-N cutoff would quietly
  // drop people from the chart while they still showed in the table below,
  // which is more confusing than a taller chart. Height grows with the list.
  const chartData = data.map((r) => ({
    name: r.name,
    value: metric === "events" ? r.events : metric === "days" ? r.days : r.tasks,
    events: r.events,
    days: r.days,
    tasks: r.tasks,
  }));

  return (
    <div>
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
          Active only (exclude Delivered/Archived events and Completed tasks)
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
              <ResponsiveContainer width="100%" height={Math.max(260, chartData.length * 32)}>
                {metric === "all" ? (
                  <BarChart data={chartData} layout="vertical" margin={{ left: 24, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="events" name="Events" fill="oklch(0.55 0.13 60)" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="days" name="Shoot Days" fill="oklch(0.7 0.15 30)" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="tasks" name="Post-Prod Tasks" fill="oklch(0.55 0.1 150)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                ) : (
                  <BarChart data={chartData} layout="vertical" margin={{ left: 24, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(v) => [v, metric === "events" ? "Events" : metric === "days" ? "Shoot days" : "Tasks"]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill="oklch(0.55 0.13 60)" />
                      ))}
                    </Bar>
                  </BarChart>
                )}
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
// Employee Value — "how much of a project's revenue is this person's
// work worth". For each project, revenue (the quotation amount) is split
// evenly across everyone who's on that project's team across all its
// events — not per-event, since the same person is often on multiple
// events within one project and shouldn't get counted, or paid out,
// twice for the same project's revenue. Summed across every project a
// person touched, this gives a total "value generated" figure — useful
// context for rate negotiation, alongside the Team Load counts.
// ---------------------------------------------------------------------
function EmployeeValueTab({ events, projects, quotations }) {
  const [personType, setPersonType] = useState("all"); // "all" | "employee" | "freelancer"

  const rows = useMemo(() => {
    // Unique team members per project (deduped across that project's events).
    const membersByProject = {};
    events.forEach((ev) => {
      if (!membersByProject[ev.projectId]) membersByProject[ev.projectId] = new Map();
      const m = membersByProject[ev.projectId];
      (ev.team || []).forEach((member) => {
        if (!m.has(member.uid)) m.set(member.uid, member);
      });
    });

    const byPerson = {};
    projects.forEach((p) => {
      const members = membersByProject[p.id];
      if (!members || members.size === 0) return;
      const quote = quotations.find((q) => q.id === p.quotationId);
      const revenue = quote?.amount || 0;
      if (revenue === 0) return;
      const share = revenue / members.size;
      members.forEach((member) => {
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

  // Same no-cap reasoning as Team Load's chart above.
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
              <ResponsiveContainer width="100%" height={Math.max(260, chartData.length * 32)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 24, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => formatINR(v)} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => [formatINR(v), "Value generated"]} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill="oklch(0.55 0.13 60)" />
                    ))}
                  </Bar>
                </BarChart>
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
// Tab 2: Expenses — freelancer payouts (auto-suggested from dayRate ×
// shoot days on their assignments, logged on demand rather than
// auto-created so admin controls exactly when a payout is recorded),
// manual costs, and advances/reimbursements to anyone on the team.
// ---------------------------------------------------------------------
function ExpensesTab({ expenses, projects, employees, freelancers, events, user, onChanged }) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    projectId: "",
    type: "manual",
    category: "Misc",
    amount: "",
    description: "",
    personUid: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [filterProject, setFilterProject] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");

  const allPeople = useMemo(
    () => [
      ...employees.map((e) => ({ uid: e.uid, name: e.name, type: "employee" })),
      ...freelancers.map((f) => ({ uid: f.id, name: f.name, type: "freelancer" })),
    ],
    [employees, freelancers]
  );

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
    if (form.type === "advance" && !form.personUid) {
      toast.error("Select who the advance is for");
      return;
    }
    setSaving(true);
    try {
      const project = projects.find((p) => p.id === form.projectId);
      const person = allPeople.find((p) => p.uid === form.personUid);
      await createExpense(
        {
          projectId: form.projectId,
          projectName: project?.projectName || "",
          type: form.type,
          category: form.type === "manual" ? form.category : form.type === "advance" ? "Advance" : "",
          amount: form.amount,
          description: form.description,
          personUid: person?.uid || null,
          personName: person?.name || null,
          personType: person?.type || null,
          date: form.date,
        },
        user.uid,
        user.name
      );
      toast.success("Expense logged");
      setForm({
        projectId: "",
        type: "manual",
        category: "Misc",
        amount: "",
        description: "",
        personUid: "",
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
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger>
                    <SelectValue>
                      {(v) => (v === "manual" ? "Manual Expense" : "Advance/Reimbursement")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual Expense</SelectItem>
                    <SelectItem value="advance">Advance/Reimbursement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.type === "manual" && (
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MANUAL_EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.type === "advance" && (
                <div>
                  <Label>Paid to</Label>
                  <Select value={form.personUid} onValueChange={(v) => setForm((f) => ({ ...f, personUid: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select person">
                        {(v) => {
                          const p = allPeople.find((pp) => pp.uid === v);
                          return p ? `${p.name} (${p.type})` : "Select person";
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {allPeople.map((p) => (
                        <SelectItem key={p.uid} value={p.uid}>{p.name} ({p.type})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
// Tab 3: Project P&L — revenue is the quotation's contracted amount
// (not just what's been collected so far — that's shown separately as
// "Collected" for context), costs are every expense logged against the
// project. Projects with no linked quotation (shouldn't normally happen,
// since a project is created from a Won quotation) show revenue as ₹0.
// ---------------------------------------------------------------------
function PnlTab({ projects, quotations, expenses }) {
  const [range, setRange] = useState("6"); // months back: "6" | "12"
  const costByProject = useMemo(() => sumExpensesByProject(expenses), [expenses]);

  const rows = useMemo(() => {
    return projects.map((p) => {
      const quote = quotations.find((q) => q.id === p.quotationId);
      const revenue = quote?.amount || 0;
      const collected = quote ? getPaymentSummary(quote).totalPaid : 0;
      const cost = costByProject[p.id] || 0;
      const profit = revenue - cost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : null;
      return { id: p.id, name: p.projectName, revenue, collected, cost, profit, margin };
    }).sort((a, b) => b.profit - a.profit);
  }, [projects, quotations, costByProject]);

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      collected: acc.collected + r.collected,
      cost: acc.cost + r.cost,
      profit: acc.profit + r.profit,
    }),
    { revenue: 0, collected: 0, cost: 0, profit: 0 }
  );

  // Monthly trend: revenue is attributed to the month a project was
  // created (that's when its quotation was won, so it's the closest
  // thing to a "revenue booked" date we track), cost to the month each
  // expense was actually dated. Both roll up independently by month, then
  // profit is derived per month from the two totals.
  const monthlyData = useMemo(() => {
    const months = lastNMonthKeys(Number(range));
    const byMonth = Object.fromEntries(months.map((k) => [k, { revenue: 0, cost: 0 }]));

    projects.forEach((p) => {
      const key = monthKey(p.createdAt);
      if (key && byMonth[key]) {
        const quote = quotations.find((q) => q.id === p.quotationId);
        byMonth[key].revenue += quote?.amount || 0;
      }
    });

    expenses.forEach((e) => {
      const key = monthKey(e.date);
      if (key && byMonth[key]) {
        byMonth[key].cost += e.amount || 0;
      }
    });

    return months.map((key) => ({
      month: monthLabel(key),
      revenue: byMonth[key].revenue,
      cost: byMonth[key].cost,
      profit: byMonth[key].revenue - byMonth[key].cost,
    }));
  }, [projects, quotations, expenses, range]);

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
            <BarChart data={monthlyData} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fontSize: 11 }} width={70} />
              <Tooltip formatter={(v, name) => [formatINR(v), name]} contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenue" name="Revenue" fill="oklch(0.55 0.13 60)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="cost" name="Cost" fill="oklch(0.7 0.15 30)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="profit" name="Profit" fill="oklch(0.55 0.1 150)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                  <TableCell className="text-right">{formatINR(r.revenue)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatINR(r.collected)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatINR(r.cost)}</TableCell>
                  <TableCell className={`text-right font-medium ${r.profit >= 0 ? "text-foreground" : "text-destructive"}`}>
                    {formatINR(r.profit)}
                  </TableCell>
                  <TableCell className={`text-right ${r.margin === null ? "text-muted-foreground" : r.margin >= 0 ? "text-foreground" : "text-destructive"}`}>
                    {r.margin === null ? "—" : `${r.margin.toFixed(1)}%`}
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