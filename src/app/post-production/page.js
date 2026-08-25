"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  TASK_TYPES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  createTask,
  getAllTasks,
  getTasksForEmployee,
  updateTaskStatus,
  reassignTask,
  updateTask,
  addTaskComment,
  deleteTask,
  isOverdue,
} from "@/lib/firebase/postProduction";
import { getAllEmployees } from "@/lib/firebase/employees";
import { getAllProjects } from "@/lib/firebase/projects";
import { getEventsForProject } from "@/lib/firebase/events";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AvatarInitials from "@/components/ui/avatar-initials";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import StatusBadge from "@/components/ui/status-badge";
import { Plus, Link as LinkIcon, MessageSquare, Trash2, CalendarClock, ArrowRightLeft } from "lucide-react";

const ADMIN_ROLES = ["super_admin", "admin", "project_manager"];

const emptyForm = {
  title: "",
  description: "",
  taskType: TASK_TYPES[0],
  taskTypeOther: "",
  projectId: "",
  eventId: "",
  assignedUids: [],
  priority: "Medium",
  dueDate: "",
  deliverableLink: "",
};

function NewTaskDialog({ open, onOpenChange, employees, projects, onCreated, createdByUid, createdByName, initialProjectId }) {
  const [form, setForm] = useState(emptyForm);
  const [events, setEvents] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ ...emptyForm, projectId: initialProjectId || "" });
  }, [open, initialProjectId]);

  useEffect(() => {
    if (!form.projectId) {
      setEvents([]);
      return;
    }
    getEventsForProject(form.projectId)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [form.projectId]);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleAssignee(uid) {
    setForm((prev) => ({
      ...prev,
      assignedUids: prev.assignedUids.includes(uid)
        ? prev.assignedUids.filter((u) => u !== uid)
        : [...prev.assignedUids, uid],
    }));
  }

  const selectedProject = projects.find((p) => p.id === form.projectId);
  const selectedEvent = events.find((e) => e.id === form.eventId);
  const selectedEmployees = employees.filter((e) => form.assignedUids.includes(e.uid));

  async function handleSubmit() {
    if (!form.title.trim()) {
      toast.error("Give the task a title");
      return;
    }
    if (form.assignedUids.length === 0) {
      toast.error("Assign this task to at least one employee");
      return;
    }
    if (form.taskType === "Other" && !form.taskTypeOther.trim()) {
      toast.error("Describe the deliverable type");
      return;
    }
    setSaving(true);
    try {
      await createTask(
        {
          ...form,
          taskType: form.taskType === "Other" ? form.taskTypeOther.trim() : form.taskType,
          projectName: selectedProject?.projectName || "",
          clientName: selectedProject?.clientName || "",
          eventName: selectedEvent?.eventName || null,
          eventId: form.eventId || null,
          assignedNames: selectedEmployees.map((e) => e.name),
        },
        createdByUid,
        createdByName
      );
      toast.success(form.assignedUids.length > 1 ? "Task assigned to team" : "Task assigned");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg">
        <DialogHeader>
          <DialogTitle>New Post-Production Task</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. Culling — Sharma Wedding Day 1"
            />
          </div>
          <div>
            <Label htmlFor="description">Brief / Instructions</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="What needs to be done, style notes, folder paths, etc."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Task Type</Label>
              <Select value={form.taskType} onValueChange={(v) => update("taskType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.taskType === "Other" && (
                <Input
                  className="mt-2"
                  value={form.taskTypeOther}
                  onChange={(e) => update("taskTypeOther", e.target.value)}
                  placeholder="Describe the deliverable type"
                />
              )}
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => update("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Project (optional)</Label>
              <Select value={form.projectId || "none"} onValueChange={(v) => update("projectId", v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No project">
                    {(v) => (v === "none" || !v ? "No project" : projects.find((p) => p.id === v)?.projectName || "No project")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.projectName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Event (optional)</Label>
              <Select
                value={form.eventId || "none"}
                onValueChange={(v) => update("eventId", v === "none" ? "" : v)}
                disabled={!form.projectId || events.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Whole project">
                    {(v) => (v === "none" || !v ? "Whole project" : events.find((e) => e.id === v)?.eventName || "Whole project")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Whole project</SelectItem>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.eventName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Assign To</Label>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
              {employees.length === 0 && (
                <p className="text-xs text-muted-foreground">No employees found.</p>
              )}
              {employees.map((e) => (
                <label key={e.uid} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                  <Checkbox
                    checked={form.assignedUids.includes(e.uid)}
                    onCheckedChange={() => toggleAssignee(e.uid)}
                  />
                  <span className="text-foreground">
                    {e.name} {e.role ? <span className="text-muted-foreground">· {e.role.replace("_", " ")}</span> : null}
                  </span>
                </label>
              ))}
            </div>
            {form.assignedUids.length > 1 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Assigning to {form.assignedUids.length} people — it's one shared task, and any of them can update its status.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={form.dueDate}
                onChange={(e) => update("dueDate", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="deliverableLink">Data Path</Label>
              <Input
                id="deliverableLink"
                value={form.deliverableLink}
                onChange={(e) => update("deliverableLink", e.target.value)}
                placeholder="Storage Path"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Assigning..." : "Assign Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskDetailDialog({ task, open, onOpenChange, isAdminView, employees, currentUid, currentName, onChanged }) {
  const [comment, setComment] = useState("");
  const [deliverableLink, setDeliverableLink] = useState("");
  const [savingLink, setSavingLink] = useState(false);
  const [reassignUid, setReassignUid] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (task) {
      setDeliverableLink(task.deliverableLink || "");
      setReassignUid("");
      setComment("");
    }
  }, [task]);

  if (!task) return null;

  const canEdit = isAdminView || task.assignedUid === currentUid || (task.assignedUids || []).includes(currentUid);

  async function handleStatusChange(status) {
    try {
      await updateTaskStatus(task.id, status, task);
      toast.success(`Marked ${status}`);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleSaveLink() {
    setSavingLink(true);
    try {
      await updateTask(task.id, { deliverableLink });
      toast.success("Deliverable link saved");
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingLink(false);
    }
  }

  async function handleReassign() {
    const target = employees.find((e) => e.uid === reassignUid);
    if (!target) return;
    try {
      await reassignTask(task.id, target.uid, target.name, currentName);
      toast.success(`Reassigned to ${target.name}`);
      onOpenChange(false);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handlePostComment() {
    if (!comment.trim()) return;
    setPosting(true);
    try {
      await addTaskComment(task.id, comment.trim(), currentUid, currentName);
      setComment("");
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteTask(task.id);
      toast.success("Task deleted");
      onOpenChange(false);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />
            <StatusBadge status={task.priority} />
            <span className="text-xs text-muted-foreground">{task.taskType}</span>
          </div>

          {(task.projectName || task.eventName) && (
            <p className="text-sm text-muted-foreground">
              {task.projectName}
              {task.eventName ? ` · ${task.eventName}` : ""}
              {task.clientName ? ` · ${task.clientName}` : ""}
            </p>
          )}

          {task.description && (
            <p className="whitespace-pre-wrap text-sm text-foreground">{task.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              Assigned to{" "}
              <span className="font-medium text-foreground">
                {(task.assignedNames?.length ? task.assignedNames : [task.assignedName]).filter(Boolean).join(", ")}
              </span>
            </span>
            {task.dueDate && (
              <span className={isOverdue(task) ? "font-medium text-destructive" : ""}>
                Due {task.dueDate}
              </span>
            )}
          </div>

          {canEdit && (
            <div>
              <Label>Status</Label>
              <Select value={task.status} onValueChange={handleStatusChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {canEdit && (
            <div>
              <Label htmlFor="deliverableLink">Data Path</Label>
              <div className="flex gap-2">
                <Input
                  id="deliverableLink"
                  value={deliverableLink}
                  onChange={(e) => setDeliverableLink(e.target.value)}
                  placeholder="Storage Path"
                />
                <Button size="sm" variant="secondary" onClick={handleSaveLink} disabled={savingLink}>
                  Save
                </Button>
              </div>
              {task.deliverableLink && (
                <a
                  href={task.deliverableLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  <LinkIcon className="h-3 w-3" /> Open current link
                </a>
              )}
            </div>
          )}

          {isAdminView && (
            <div>
              <Label>Reassign To (replaces all current assignees)</Label>
              <div className="flex gap-2">
                <Select value={reassignUid} onValueChange={setReassignUid}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select employee">
                      {(v) => employees.find((e) => e.uid === v)?.name || "Select employee"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.uid} value={e.uid}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="secondary" onClick={handleReassign} disabled={!reassignUid}>
                  <ArrowRightLeft className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                This hands the task fully to one person. To add someone alongside the current assignee(s) instead of replacing them, create a new task for that person.
              </p>
            </div>
          )}

          <div>
            <Label className="mb-2 flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Comments
            </Label>
            <div className="flex flex-col gap-2">
              {(task.comments || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No comments yet.</p>
              ) : (
                task.comments.map((c) => (
                  <div key={c.id} className="rounded-md border border-border bg-muted/40 p-2 text-sm">
                    <p className="text-foreground">{c.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.addedBy} · {new Date(c.addedAt).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
            {canEdit && (
              <div className="mt-2 flex gap-2">
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add an update or note..."
                  onKeyDown={(e) => e.key === "Enter" && handlePostComment()}
                />
                <Button size="sm" onClick={handlePostComment} disabled={posting || !comment.trim()}>
                  Post
                </Button>
              </div>
            )}
          </div>
        </div>
        {isAdminView && (
          <DialogFooter>
            <Button variant="secondary" onClick={handleDelete} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" /> Delete Task
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PostProductionContent() {
  const { user } = useAuth();
  const isAdminView = ADMIN_ROLES.includes(user.role);
  const searchParams = useSearchParams();
  const linkedProjectId = searchParams.get("projectId") || "";

  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [activeTask, setActiveTask] = useState(null);

  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterProject, setFilterProject] = useState(linkedProjectId || "all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  // Completed tasks accumulate forever (nothing ever archives/deletes them),
  // so the admin table hides them by default once there's a backlog —
  // toggle back on, or filter status to "Completed" directly, to see them.
  const [showCompleted, setShowCompleted] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [taskList, emps, projs] = await Promise.all([
        isAdminView ? getAllTasks() : getTasksForEmployee(user.uid),
        isAdminView ? getAllEmployees() : Promise.resolve([]),
        isAdminView ? getAllProjects() : Promise.resolve([]),
      ]);
      setTasks(taskList);
      setEmployees((emps || []).filter((e) => e.status === "active"));
      setProjects(projs || []);
    } catch (err) {
      console.error("Failed to load post-production data:", err);
      toast.error(err.message || "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid, isAdminView]);

  function refreshActiveTask(updatedList) {
    if (activeTask) {
      const fresh = updatedList.find((t) => t.id === activeTask.id);
      setActiveTask(fresh || null);
    }
  }

  async function handleChanged() {
    await loadData();
  }

  useEffect(() => {
    if (activeTask) refreshActiveTask(tasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const assigneeUids = t.assignedUids?.length ? t.assignedUids : [t.assignedUid].filter(Boolean);
      if (isAdminView && filterAssignee !== "all" && !assigneeUids.includes(filterAssignee)) return false;
      if (isAdminView && filterProject !== "all" && t.projectId !== filterProject) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      // Only apply the hide-completed default when no explicit status filter
      // is set — picking "Completed" in the dropdown should still show them.
      if (isAdminView && !showCompleted && filterStatus === "all" && t.status === "Completed") return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const assigneeNames = (t.assignedNames?.length ? t.assignedNames : [t.assignedName]).filter(Boolean).join(" ");
        const haystack = `${t.title} ${t.description || ""} ${t.projectName || ""} ${assigneeNames}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [tasks, filterAssignee, filterProject, filterPriority, filterStatus, searchTerm, isAdminView, showCompleted]);

  const completedCount = tasks.filter((t) => t.status === "Completed").length;

  // Employee list view: unfinished work first (pipeline order), then most urgent due date.
  const sortedForList = useMemo(() => {
    const order = TASK_STATUSES.reduce((acc, s, i) => ({ ...acc, [s]: i }), {});
    return [...filteredTasks].sort((a, b) => {
      const statusDiff = (order[a.status] ?? 0) - (order[b.status] ?? 0);
      if (statusDiff !== 0) return statusDiff;
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [filteredTasks]);

  const columns = TASK_STATUSES.map((status) => ({
    status,
    items: filteredTasks.filter((t) => t.status === status),
  }));
  // Quick per-status counts for the admin summary strip (computed from the
  // full task list, not filteredTasks, so they stay stable while filtering/
  // searching — a dashboard-style overview rather than a filtered count).
  const statusCounts = TASK_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: tasks.filter((t) => t.status === s).length }),
    {}
  );

  const overdueCount = tasks.filter((t) => isOverdue(t)).length;

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">Post-Production</h2>
          <p className="text-sm text-muted-foreground">
            {isAdminView
              ? "Assign editing, culling, and delivery work across the team."
              : "Your assigned post-production tasks."}
          </p>
        </div>
        {isAdminView && (
          <Button onClick={() => setNewTaskOpen(true)}>
            <Plus className="h-4 w-4" /> New Task
          </Button>
        )}
      </div>

      {overdueCount > 0 && (
        <Card className="mb-4 border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-2 p-3 text-sm text-destructive">
            <CalendarClock className="h-4 w-4" />
            {overdueCount} task{overdueCount > 1 ? "s" : ""} past due date
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search tasks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-xs"
        />
        {isAdminView && (
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Assignee">
                {(v) => (v === "all" ? "All Employees" : employees.find((e) => e.uid === v)?.name || "Assignee")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.uid} value={e.uid}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {isAdminView && (
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-[160px]">
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
        )}
        {!isAdminView && (
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status">
                {(v) => (v === "all" ? "All Statuses" : v)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Priority">
              {(v) => (v === "all" ? "All Priorities" : v)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {TASK_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdminView && (
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status">
                {(v) => (v === "all" ? "All Statuses" : v)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {isAdminView && (
          <label className="flex items-center gap-2 pl-1 text-sm text-muted-foreground">
            <Checkbox checked={showCompleted} onCheckedChange={(v) => setShowCompleted(!!v)} />
            Show completed ({completedCount})
          </label>
        )}
      </div>

      {isAdminView && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {TASK_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
              className={`rounded-md border p-2.5 text-left transition-colors ${
                filterStatus === s ? "border-accent bg-accent/10" : "border-border hover:bg-muted"
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s}</p>
              <p className="text-lg font-semibold text-foreground">{statusCounts[s]}</p>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : filteredTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isAdminView && !showCompleted && filterStatus === "all" && completedCount > 0 && tasks.length === completedCount
            ? "All tasks are completed — check \"Show completed\" to see them."
            : "No post-production tasks found."}
        </p>
      ) : isAdminView ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Comments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedForList.map((task) => (
                <TableRow
                  key={task.id}
                  className="cursor-pointer"
                  onClick={() => setActiveTask(task)}
                >
                  <TableCell>
                    <p className="font-medium text-foreground">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.taskType}
                      {task.eventName ? ` · ${task.eventName}` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{task.projectName || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <AvatarInitials name={task.assignedName} size="sm" className="h-6 w-6 text-[10px]" />
                      <span className="text-sm">
                        {(task.assignedNames?.length ? task.assignedNames : [task.assignedName]).filter(Boolean).join(", ")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={task.priority} /></TableCell>
                  <TableCell><StatusBadge status={task.status} /></TableCell>
                  <TableCell>
                    {task.dueDate ? (
                      <span className={isOverdue(task) ? "font-medium text-destructive" : "text-muted-foreground"}>
                        {task.dueDate}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {(task.comments || []).length > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> {task.comments.length}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        // Employee view: a single stacked list rather than five mostly-empty
        // columns — most people only have a handful of tasks at once.
        <div className="flex flex-col gap-2">
          {sortedForList.map((task) => (
            <Card
              key={task.id}
              className="cursor-pointer transition-colors hover:border-accent/50"
              onClick={() => setActiveTask(task)}
            >
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{task.title}</p>
                    <StatusBadge status={task.status} />
                    <StatusBadge status={task.priority} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.taskType}
                    {task.projectName ? ` · ${task.projectName}` : ""}
                    {task.eventName ? ` · ${task.eventName}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {(task.comments || []).length > 0 && (
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> {task.comments.length}
                    </span>
                  )}
                  {task.dueDate && (
                    <span className={isOverdue(task) ? "font-medium text-destructive" : ""}>
                      Due {task.dueDate}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewTaskDialog
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
        employees={employees}
        projects={projects}
        onCreated={loadData}
        createdByUid={user.uid}
        createdByName={user.name}
        initialProjectId={linkedProjectId}
      />

      <TaskDetailDialog
        task={activeTask}
        open={!!activeTask}
        onOpenChange={(open) => !open && setActiveTask(null)}
        isAdminView={isAdminView}
        employees={employees}
        currentUid={user.uid}
        currentName={user.name}
        onChanged={handleChanged}
      />
    </AppShell>
  );
}

export default function PostProductionPage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <Suspense fallback={null}>
          <PostProductionContent />
        </Suspense>
      </DeviceGate>
    </ProtectedRoute>
  );
}