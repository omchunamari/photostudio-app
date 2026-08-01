"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { getAllEmployees } from "@/lib/firebase/employees";
import {
  getAllEditorTeams,
  createEditorTeam,
  updateEditorTeamMembers,
  renameEditorTeam,
  deleteEditorTeam,
} from "@/lib/firebase/editorTeams";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users2 } from "lucide-react";

function TeamEditorDialog({ open, onOpenChange, employees, initial, onSave, saving }) {
  const [name, setName] = useState(initial?.name || "");
  const [selectedUids, setSelectedUids] = useState(
    new Set((initial?.members || []).map((m) => m.uid))
  );

  useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setSelectedUids(new Set((initial?.members || []).map((m) => m.uid)));
    }
  }, [open, initial]);

  function toggle(uid) {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error("Team name is required");
      return;
    }
    const members = employees
      .filter((e) => selectedUids.has(e.uid))
      .map((e) => ({ uid: e.uid, name: e.name }));
    onSave({ name, members });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit team" : "New editor team"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="teamName">Team name</Label>
            <Input
              id="teamName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Editing Team A"
            />
          </div>

          <div className="grid gap-2">
            <Label>Members</Label>
            <div className="grid max-h-64 gap-1 overflow-y-auto rounded-md border border-slate-200 p-2">
              {employees.length === 0 ? (
                <p className="p-2 text-sm text-slate-500">No employees found.</p>
              ) : (
                employees.map((e) => (
                  <label
                    key={e.uid}
                    className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 text-sm hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={selectedUids.has(e.uid)}
                      onCheckedChange={() => toggle(e.uid)}
                    />
                    <span className="text-slate-900">{e.name}</span>
                    <span className="text-xs text-slate-400">{e.role}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? "Saving..." : "Save Team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditorTeamsContent() {
  const [teams, setTeams] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null); // null = creating new
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  async function load() {
    setLoading(true);
    const [allTeams, allEmployees] = await Promise.all([getAllEditorTeams(), getAllEmployees()]);
    setTeams(allTeams);
    setEmployees(allEmployees.filter((e) => e.status === "active"));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditingTeam(null);
    setDialogOpen(true);
  }

  function openEdit(team) {
    setEditingTeam(team);
    setDialogOpen(true);
  }

  async function handleSave({ name, members }) {
    setSaving(true);
    try {
      if (editingTeam) {
        await renameEditorTeam(editingTeam.id, name);
        await updateEditorTeamMembers(editingTeam.id, members);
        toast.success("Team updated");
      } else {
        await createEditorTeam(name, members);
        toast.success("Team created");
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(teamId) {
    setDeletingId(teamId);
    try {
      await deleteEditorTeam(teamId);
      toast.success("Team deleted");
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between sm:mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 sm:text-2xl">Editor Teams</h2>
          <p className="text-sm text-slate-500">
            Reusable groups you can assign to events in one step.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Team
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 py-10">
          <p className="text-sm text-slate-500">
            No teams yet. Create one to speed up assigning editors to events.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {teams.map((team) => (
            <Card key={team.id}>
              <CardContent className="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Users2 className="h-4 w-4 shrink-0 text-slate-400" />
                    <p className="truncate font-medium text-slate-900">{team.name}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => openEdit(team)} title="Edit team">
                      <Pencil className="h-3.5 w-3.5 text-slate-400 hover:text-slate-700" />
                    </button>
                    <button
                      onClick={() => handleDelete(team.id)}
                      disabled={deletingId === team.id}
                      title="Delete team"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-600" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  {(team.members || []).length === 0
                    ? "No members"
                    : team.members.map((m) => m.name).join(", ")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TeamEditorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employees={employees}
        initial={editingTeam}
        onSave={handleSave}
        saving={saving}
      />
    </AppShell>
  );
}

export default function EditorTeamsPage() {
  return (
    <ProtectedRoute allowedRoles={["super_admin", "admin", "project_manager"]}>
      <DeviceGate>
        <EditorTeamsContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}