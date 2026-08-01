"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { getAllEvents, addSharedTeamNote, editSharedTeamNote, deleteSharedTeamNote } from "@/lib/firebase/events";
import { getAllEmployees } from "@/lib/firebase/employees";
import { getAllEditorTeams } from "@/lib/firebase/editorTeams";
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
import { toast } from "sonner";
import { Users2, User, MessageSquarePlus, Pencil, Trash2, Check, X } from "lucide-react";

function TeamNoteList({ notes, onEdit, onDelete, editingId, editText, setEditText, onSaveEdit, onCancelEdit, savingEdit }) {
  if (!notes.length) return null;
  return (
    <div className="mt-2 grid gap-1.5 border-t border-slate-100 pt-2">
      {notes.map((note) => {
        const isEditing = editingId === note.id;
        return (
          <div key={note.id || note.addedAt} className="text-xs">
            {isEditing ? (
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
                    onClick={onSaveEdit}
                    disabled={savingEdit || !editText.trim()}
                    className="flex items-center gap-1 rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" /> Save
                  </button>
                  <button
                    onClick={onCancelEdit}
                    className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600"
                  >
                    <X className="h-3 w-3" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-violet-50 p-2 text-violet-800">
                <div className="min-w-0 flex-1">
                  <span>{note.text}</span>
                  <span className="ml-1 text-violet-400">
                    — {note.addedBy || "admin"}, {new Date(note.addedAt).toLocaleDateString()}
                    {note.editedAt ? " (edited)" : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => onEdit(note)} title="Edit" className="p-1 -m-1">
                    <Pencil className="h-3.5 w-3.5 text-violet-400 hover:text-violet-700" />
                  </button>
                  <button onClick={() => onDelete(note)} title="Delete" className="p-1 -m-1">
                    <Trash2 className="h-3.5 w-3.5 text-violet-400 hover:text-red-600" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TeamOverviewContent() {
  const { user } = useAuth();
  const [editorTeamCards, setEditorTeamCards] = useState([]);
  const [individualEventCards, setIndividualEventCards] = useState([]); // events w/ no linked editor team
  const [individualRows, setIndividualRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [addingNoteFor, setAddingNoteFor] = useState(null); // { projectId, eventId, eventName, assignedUids }
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [editingNote, setEditingNote] = useState(null); // { projectId, eventId, noteId }
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingNote, setDeletingNote] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const [events, employees, editorTeams] = await Promise.all([
      getAllEvents(),
      getAllEmployees(),
      getAllEditorTeams(),
    ]);

    const teamCards = editorTeams
      .map((t) => {
        const linkedEvents = events
          .filter((ev) => (ev.linkedEditorTeamIds || []).includes(t.id))
          .map((ev) => ({
            eventId: ev.id,
            projectId: ev.projectId,
            eventName: ev.eventName,
            projectName: ev.projectName,
            status: ev.status,
            members: (ev.team || []).filter((m) => m.sourceTeamId === t.id),
            assignedUids: ev.assignedUids || [],
            teamNotes: ev.teamNotes || [],
          }));
        return { ...t, linkedEvents };
      })
      .filter((t) => t.linkedEvents.length > 0);

    const linkedEventIds = new Set(
      teamCards.flatMap((t) => t.linkedEvents.map((ev) => ev.eventId))
    );

    // Events with an active roster but no linked editor team — grouped by
    // event so a note can still target everyone actually on that event.
    const individualEvents = events
      .filter((ev) => !linkedEventIds.has(ev.id) && (ev.assignedUids || []).length > 0)
      .map((ev) => ({
        eventId: ev.id,
        projectId: ev.projectId,
        eventName: ev.eventName,
        projectName: ev.projectName,
        status: ev.status,
        members: ev.team || [],
        assignedUids: ev.assignedUids || [],
        teamNotes: ev.teamNotes || [],
      }));

    const byUid = {};
    employees.forEach((e) => {
      byUid[e.uid] = { uid: e.uid, name: e.name, role: e.role, events: [], assignmentCount: 0 };
    });
    events.forEach((ev) => {
      (ev.team || []).forEach((m) => {
        if (m.sourceTeamId) return;
        if (!byUid[m.uid]) {
          byUid[m.uid] = { uid: m.uid, name: m.name, role: m.role, events: [], assignmentCount: 0 };
        }
        byUid[m.uid].assignmentCount += 1;
        byUid[m.uid].events.push({ eventName: ev.eventName, projectName: ev.projectName });
      });
    });

    setEditorTeamCards(teamCards);
    setIndividualEventCards(individualEvents);
    setIndividualRows(
      Object.values(byUid).filter((r) => r.assignmentCount > 0).sort((a, b) => a.name.localeCompare(b.name))
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openAddNote(ev) {
    setAddingNoteFor(ev);
    setNoteText("");
  }

  async function handleAddNote() {
    if (!addingNoteFor || !noteText.trim()) return;
    if (!addingNoteFor.assignedUids?.length) {
      toast.error("No one is currently assigned to this event");
      return;
    }
    setSavingNote(true);
    try {
      await addSharedTeamNote(
        addingNoteFor.projectId,
        addingNoteFor.eventId,
        noteText,
        user.name,
        addingNoteFor.assignedUids,
        null
      );
      toast.success("Note added for the whole team");
      setAddingNoteFor(null);
      setNoteText("");
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingNote(false);
    }
  }

  function startEditNote(ev, note) {
    if (!note.id) {
      toast.error("This note predates edit support and can't be modified.");
      return;
    }
    setEditingNote({ projectId: ev.projectId, eventId: ev.eventId, noteId: note.id });
    setEditText(note.text);
  }

  function cancelEditNote() {
    setEditingNote(null);
    setEditText("");
  }

  async function handleSaveEditNote() {
    if (!editingNote || !editText.trim()) return;
    setSavingEdit(true);
    try {
      await editSharedTeamNote(editingNote.projectId, editingNote.eventId, editingNote.noteId, editText);
      toast.success("Note updated");
      cancelEditNote();
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  function confirmDeleteNote(ev, note) {
    if (!note.id) {
      toast.error("This note predates delete support and can't be removed.");
      return;
    }
    setDeletingNote({ projectId: ev.projectId, eventId: ev.eventId, noteId: note.id });
  }

  async function handleDeleteNote() {
    if (!deletingNote) return;
    setDeleting(true);
    try {
      await deleteSharedTeamNote(deletingNote.projectId, deletingNote.eventId, deletingNote.noteId);
      toast.success("Note deleted");
      setDeletingNote(null);
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

  const nothingToShow =
    editorTeamCards.length === 0 && individualEventCards.length === 0 && individualRows.length === 0;

  return (
    <AppShell>
      <h2 className="mb-4 text-xl font-semibold text-slate-900 sm:text-2xl">Team Assignments</h2>

      {nothingToShow && (
        <p className="text-sm text-slate-500">No one is currently assigned to any event.</p>
      )}

      {editorTeamCards.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-500">
            <Users2 className="h-4 w-4" /> Assigned as a Team
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {editorTeamCards.map((t) => (
              <Card key={t.id} className="h-full">
                <CardContent className="flex h-full flex-col gap-3 p-4">
                  <div>
                    <p className="font-medium text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">
                      {(t.members || []).length} member{(t.members || []).length !== 1 && "s"}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {t.linkedEvents.map((ev) => (
                      <div key={ev.eventId} className="rounded-md border border-slate-200 p-2.5">
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                          <Link
                            href={`/projects/${ev.projectId}/events/${ev.eventId}`}
                            className="min-w-0 truncate text-sm font-medium text-slate-900 hover:underline"
                          >
                            {ev.eventName}
                          </Link>
                          <div className="flex shrink-0 items-center gap-2">
                            <StatusBadge status={ev.status} />
                            <button
                              onClick={() => openAddNote(ev)}
                              title="Add note for whole team"
                              className="p-1 -m-1"
                            >
                              <MessageSquarePlus className="h-4 w-4 text-slate-400 hover:text-violet-600" />
                            </button>
                          </div>
                        </div>
                        <p className="mb-1.5 truncate text-xs text-slate-400">{ev.projectName}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {ev.members.length === 0 ? (
                            <span className="text-xs text-slate-400">No current members on this event</span>
                          ) : (
                            ev.members.map((m) => (
                              <Link key={m.uid} href={`/team/${m.uid}`}>
                                <span className="inline-block rounded-md bg-violet-50 px-2 py-1 text-xs text-violet-700 hover:bg-violet-100">
                                  {m.name}
                                </span>
                              </Link>
                            ))
                          )}
                        </div>

                        <TeamNoteList
                          notes={ev.teamNotes}
                          editingId={editingNote?.eventId === ev.eventId ? editingNote.noteId : null}
                          editText={editText}
                          setEditText={setEditText}
                          onEdit={(note) => startEditNote(ev, note)}
                          onDelete={(note) => confirmDeleteNote(ev, note)}
                          onSaveEdit={handleSaveEditNote}
                          onCancelEdit={cancelEditNote}
                          savingEdit={savingEdit}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {individualEventCards.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-500">
            <Users2 className="h-4 w-4" /> Other Events (no linked team)
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {individualEventCards.map((ev) => (
              <Card key={ev.eventId} className="h-full">
                <CardContent className="flex h-full flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/projects/${ev.projectId}/events/${ev.eventId}`}
                      className="min-w-0 truncate text-sm font-medium text-slate-900 hover:underline"
                    >
                      {ev.eventName}
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={ev.status} />
                      <button
                        onClick={() => openAddNote(ev)}
                        title="Add note for whole team"
                        className="p-1 -m-1"
                      >
                        <MessageSquarePlus className="h-4 w-4 text-slate-400 hover:text-violet-600" />
                      </button>
                    </div>
                  </div>
                  <p className="truncate text-xs text-slate-400">{ev.projectName}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ev.members.length === 0 ? (
                      <span className="text-xs text-slate-400">No current members on this event</span>
                    ) : (
                      ev.members.map((m) => (
                        <Link key={m.uid} href={`/team/${m.uid}`}>
                          <span className="inline-block rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200">
                            {m.name}
                          </span>
                        </Link>
                      ))
                    )}
                  </div>

                  <TeamNoteList
                    notes={ev.teamNotes}
                    editingId={editingNote?.eventId === ev.eventId ? editingNote.noteId : null}
                    editText={editText}
                    setEditText={setEditText}
                    onEdit={(note) => startEditNote(ev, note)}
                    onDelete={(note) => confirmDeleteNote(ev, note)}
                    onSaveEdit={handleSaveEditNote}
                    onCancelEdit={cancelEditNote}
                    savingEdit={savingEdit}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {individualRows.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-500">
            <User className="h-4 w-4" /> Individually Assigned
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {individualRows.map((r) => (
              <Link key={r.uid} href={`/team/${r.uid}`}>
                <Card className="h-full transition hover:border-slate-300 hover:shadow-sm">
                  <CardContent className="flex h-full flex-col justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{r.name}</p>
                      <p className="text-xs text-slate-500">{r.role}</p>
                    </div>
                    <div>
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {(r.events || []).map((e, i) => (
                          <span
                            key={i}
                            className="inline-block max-w-[180px] truncate rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700"
                            title={`${e.eventName} · ${e.projectName}`}
                          >
                            {e.eventName} <span className="text-slate-400">· {e.projectName}</span>
                          </span>
                        ))}
                      </div>
                      <span className="text-xs text-slate-500">
                        {r.assignmentCount} assignment{r.assignmentCount !== 1 && "s"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!addingNoteFor} onOpenChange={(open) => !open && setAddingNoteFor(null)}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{addingNoteFor?.eventName}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Textarea
              rows={3}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="e.g. Delivery deadline is Friday EOD"
            />
            <p className="text-xs text-slate-400">
              Visible to everyone currently assigned to this event — not just one person.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={handleAddNote}
              disabled={savingNote || !noteText.trim()}
              className="w-full sm:w-auto"
            >
              {savingNote ? "Saving..." : "Add Team Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingNote} onOpenChange={(open) => !open && setDeletingNote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitleEl>Delete this note?</AlertDialogTitleEl>
            <AlertDialogDescription>
              Removes it for everyone on the team. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNote}
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

export default function TeamOverviewPage() {
  return (
    <ProtectedRoute allowedRoles={["super_admin", "admin", "project_manager"]}>
      <DeviceGate>
        <TeamOverviewContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}