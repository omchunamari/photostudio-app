"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  getEventsForEmployee,
  addTeamAssignmentNote,
  editTeamAssignmentNote,
  deleteTeamAssignmentNote,
  getEventStatusUpdate,
} from "@/lib/firebase/events";
import { getAllEmployees } from "@/lib/firebase/employees";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/ui/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle as AlertDialogTitleEl,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Users2,
  User,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";

function rangeOverlap(startA, endA, startB, endB) {
  if (!startA || !startB) return false;
  const rangeAEnd = endA || startA;
  const rangeBEnd = endB || startB;
  return new Date(startA) <= new Date(rangeBEnd) && new Date(startB) <= new Date(rangeAEnd);
}

// Shared inline editor used both in the collapsed "latest instruction"
// preview and in the expanded history list, so edit state renders
// consistently in both places (this is what the earlier version was
// missing in the collapsed view — that's why the pencil looked broken).
function EditableRow({
  text,
  editedAt,
  meta,
  isEditing,
  editText,
  setEditText,
  onSave,
  onCancel,
  onEdit,
  onDelete,
  saving,
}) {
  if (isEditing) {
    return (
      <div className="flex flex-col gap-1.5">
        <Textarea
          rows={2}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="text-xs"
          autoFocus
        />
        <div className="flex gap-1.5">
          <button
            onClick={onSave}
            disabled={saving || !editText.trim()}
            className="flex items-center gap-1 rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            <Check className="h-3 w-3" /> Save
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <span>{text}</span>
        {meta && <span className="ml-1 text-slate-400">{meta}</span>}
        {editedAt && <span className="ml-1 text-slate-400">(edited)</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button onClick={onEdit} title="Edit" className="p-1 -m-1">
          <Pencil className="h-3.5 w-3.5 opacity-60 hover:opacity-100" />
        </button>
        <button onClick={onDelete} title="Delete" className="p-1 -m-1">
          <Trash2 className="h-3.5 w-3.5 opacity-60 hover:text-red-600 hover:opacity-100" />
        </button>
      </div>
    </div>
  );
}

function TeamMemberDetailContent() {
  const { uid } = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const [employee, setEmployee] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);

  const [adding, setAdding] = useState(null); // { projectId, eventId, eventName, projectName }
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // { projectId, eventId, itemId }
  const [editingItem, setEditingItem] = useState(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingItem, setDeletingItem] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const [events, employees] = await Promise.all([getEventsForEmployee(uid), getAllEmployees()]);

    const emp = employees.find((e) => e.uid === uid);
    setEmployee(emp || null);

    const withUpdates = await Promise.all(
      events.map(async (ev) => {
        const member = (ev.team || []).find((m) => m.uid === uid);
        const statusDoc = await getEventStatusUpdate(ev.projectId, ev.id, uid);
        return {
          projectId: ev.projectId,
          eventId: ev.id,
          eventName: ev.eventName,
          projectName: ev.projectName,
          eventStartDate: ev.eventStartDate,
          eventEndDate: ev.eventEndDate,
          status: ev.status,
          teamNotes: [...(ev.teamNotes || [])]
            .filter((n) => (n.targetUids || []).includes(uid))
            .reverse(),
          assignments: [...(member?.assignments || [])].reverse(),
          statusUpdates: [...(statusDoc?.updates || [])].reverse(),
        };
      })
    );

    withUpdates.forEach((a) => {
      a.conflicts = withUpdates
        .filter(
          (b) =>
            b.eventId !== a.eventId &&
            rangeOverlap(a.eventStartDate, a.eventEndDate, b.eventStartDate, b.eventEndDate)
        )
        .map((b) => `${b.eventName} (${b.projectName})`);
    });

    setAssignments(withUpdates);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [uid]);

  function openAddAssignment(a) {
    setAdding({
      projectId: a.projectId,
      eventId: a.eventId,
      eventName: a.eventName,
      projectName: a.projectName,
    });
    setNewNote("");
  }

  async function handleAddAssignment() {
    if (!adding || !newNote.trim()) return;
    setSavingNote(true);
    try {
      await addTeamAssignmentNote(adding.projectId, adding.eventId, uid, newNote, user.name);
      toast.success("Assignment added");
      setAdding(null);
      setNewNote("");
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingNote(false);
    }
  }

  function startEdit(a, item) {
    if (!item.id) {
      toast.error("This entry predates edit support and can't be modified.");
      return;
    }
    setEditingItem({ projectId: a.projectId, eventId: a.eventId, itemId: item.id });
    setEditText(item.text);
  }

  function cancelEdit() {
    setEditingItem(null);
    setEditText("");
  }

  async function handleSaveEdit() {
    if (!editingItem || !editText.trim()) return;
    setSavingEdit(true);
    try {
      await editTeamAssignmentNote(
        editingItem.projectId,
        editingItem.eventId,
        uid,
        editingItem.itemId,
        editText
      );
      toast.success("Updated");
      cancelEdit();
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  function confirmDelete(a, item) {
    if (!item.id) {
      toast.error("This entry predates delete support and can't be removed.");
      return;
    }
    setDeletingItem({ projectId: a.projectId, eventId: a.eventId, itemId: item.id });
  }

  async function handleDelete() {
    if (!deletingItem) return;
    setDeleting(true);
    try {
      await deleteTeamAssignmentNote(
        deletingItem.projectId,
        deletingItem.eventId,
        uid,
        deletingItem.itemId
      );
      toast.success("Deleted");
      setDeletingItem(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Loading...</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <button
        onClick={() => router.push("/team")}
        className="mb-3 flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Team
      </button>

      <div className="mb-6">
        <h2 className="truncate text-xl font-semibold text-slate-900 sm:text-2xl">
          {employee?.name || "Employee"}
        </h2>
        <p className="text-sm text-slate-500">{employee?.role}</p>
      </div>

      {assignments.length === 0 ? (
        <p className="text-sm text-slate-500">Not currently assigned to any event.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {assignments.map((a) => {
            const dateLabel = a.eventStartDate
              ? a.eventStartDate === a.eventEndDate
                ? a.eventStartDate
                : `${a.eventStartDate} – ${a.eventEndDate}`
              : "No date set";
            const isExpanded = expandedKey === a.eventId;
            const latestTeamNote = a.teamNotes[0];
            const latestAssignment = a.assignments[0];
            const latestUpdate = a.statusUpdates[0];

            const latestIsEditing =
              latestAssignment &&
              editingItem?.itemId === latestAssignment.id &&
              editingItem?.eventId === a.eventId;

            return (
              <Card key={a.eventId}>
                <CardContent className="p-4">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{a.eventName}</p>
                      <p className="truncate text-xs text-slate-500">{a.projectName}</p>
                      <p className="text-xs text-slate-500">{dateLabel}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge status={a.status} />
                      <button
                        onClick={() => openAddAssignment(a)}
                        title="Add individual assignment"
                        className="p-1 -m-1"
                      >
                        <Plus className="h-4 w-4 text-slate-400 hover:text-slate-700" />
                      </button>
                    </div>
                  </div>

                  {latestTeamNote && (
                    <div className="mb-1.5 rounded-md border border-violet-100 bg-violet-50 p-2 text-xs text-violet-800">
                      <span className="mb-0.5 flex items-center gap-1 font-medium text-violet-600">
                        <Users2 className="h-3 w-3" /> Team note
                      </span>
                      {latestTeamNote.text}
                      <p className="mt-1 text-[10px] text-violet-400">
                        Manage team-wide notes from the Team Overview page.
                      </p>
                    </div>
                  )}

                  {latestAssignment && (
                    <div className="mb-1 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                      <span className="mb-0.5 flex items-center gap-1 font-medium text-slate-500">
                        <User className="h-3 w-3" /> Individual instruction
                      </span>
                      <EditableRow
                        text={latestAssignment.text}
                        editedAt={latestAssignment.editedAt}
                        isEditing={latestIsEditing}
                        editText={editText}
                        setEditText={setEditText}
                        onSave={handleSaveEdit}
                        onCancel={cancelEdit}
                        onEdit={() => startEdit(a, latestAssignment)}
                        onDelete={() => confirmDelete(a, latestAssignment)}
                        saving={savingEdit}
                      />
                    </div>
                  )}

                  {latestUpdate && (
                    <p className="mb-1 text-xs text-slate-600">
                      <span className="font-medium text-slate-500">Their latest update: </span>
                      {latestUpdate.text}
                    </p>
                  )}

                  {(a.teamNotes.length > 1 || a.assignments.length > 1 || a.statusUpdates.length > 1) && (
                    <button
                      onClick={() => setExpandedKey(isExpanded ? null : a.eventId)}
                      className="mt-1 flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-3 w-3" /> Hide history
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" /> Show full history
                        </>
                      )}
                    </button>
                  )}

                  {isExpanded && (
                    <div className="mt-2 grid gap-3 border-t border-slate-100 pt-2">
                      {a.teamNotes.length > 0 && (
                        <div>
                          <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-violet-600">
                            <Users2 className="h-3 w-3" /> Team notes (read-only here — edit from Team Overview)
                          </p>
                          <div className="grid gap-1.5">
                            {a.teamNotes.map((note) => (
                              <div key={note.id || note.addedAt} className="text-xs text-slate-600">
                                <span className="text-slate-800">{note.text}</span>
                                <span className="ml-1 text-slate-400">
                                  — {note.addedBy || "admin"}, {new Date(note.addedAt).toLocaleDateString()}
                                  {note.editedAt ? " (edited)" : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {a.assignments.length > 0 && (
                        <div>
                          <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-500">
                            <User className="h-3 w-3" /> Individual assignments
                          </p>
                          <div className="grid gap-1.5">
                            {a.assignments.map((note) => {
                              const isEditing =
                                editingItem?.itemId === note.id && editingItem?.eventId === a.eventId;
                              return (
                                <div key={note.id || note.addedAt} className="text-xs text-slate-600">
                                  <EditableRow
                                    text={note.text}
                                    editedAt={note.editedAt}
                                    meta={` — ${note.addedBy || "admin"}, ${new Date(
                                      note.addedAt
                                    ).toLocaleDateString()}`}
                                    isEditing={isEditing}
                                    editText={editText}
                                    setEditText={setEditText}
                                    onSave={handleSaveEdit}
                                    onCancel={cancelEdit}
                                    onEdit={() => startEdit(a, note)}
                                    onDelete={() => confirmDelete(a, note)}
                                    saving={savingEdit}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {a.statusUpdates.length > 0 && (
                        <div>
                          <p className="mb-1 text-[11px] font-medium text-slate-500">Their updates</p>
                          <div className="grid gap-1.5">
                            {a.statusUpdates.map((u, idx) => (
                              <div key={idx} className="text-xs text-slate-600">
                                <span className="text-slate-800">{u.text}</span>
                                <span className="ml-1 text-slate-400">
                                  — {new Date(u.updatedAt).toLocaleDateString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {a.conflicts.length > 0 && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>Overlaps with: {a.conflicts.join(", ")}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!adding} onOpenChange={(open) => !open && setAdding(null)}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>
              {adding?.eventName} <span className="text-slate-400">· {adding?.projectName}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-2 py-2">
            <Label htmlFor="newNote">New individual assignment</Label>
            <Textarea
              id="newNote"
              rows={3}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="e.g. Handle candid shots during the ceremony, hand raw files to editor by EOD"
            />
            <p className="text-xs text-slate-400">
              This is added on top of any earlier assignments for this event, and is only visible
              to {employee?.name || "this person"} — separate from the shared team note.
            </p>
          </div>

          <DialogFooter>
            <Button
              onClick={handleAddAssignment}
              disabled={savingNote || !newNote.trim()}
              className="w-full sm:w-auto"
            >
              {savingNote ? "Saving..." : "Add Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitleEl>Delete this instruction?</AlertDialogTitleEl>
            <AlertDialogDescription>
              This removes it permanently — {employee?.name || "this person"} will no longer see
              it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

export default function TeamMemberDetailPage() {
  return (
    <ProtectedRoute allowedRoles={["super_admin", "admin", "project_manager"]}>
      <DeviceGate>
        <TeamMemberDetailContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}