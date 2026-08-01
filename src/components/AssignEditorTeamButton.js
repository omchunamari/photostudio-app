"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Users2 } from "lucide-react";
import { getAllEditorTeams } from "@/lib/firebase/editorTeams";
import {
  updateEventTeam,
  mergeEditorTeamIntoEventTeam,
  addSharedTeamNote,
  linkEditorTeamToEvent,
} from "@/lib/firebase/events";

/**
 * Drop this into an event's admin page next to the existing "add member"
 * control. It doesn't replace individual add/remove — it's a bulk shortcut
 * on top of it. People already on the event keep their existing per-person
 * assignments; only missing members from the picked team get added.
 *
 * Members added this way are tagged with sourceTeamId, and the team is
 * linked to the event (linkEditorTeamToEvent) so that future roster changes
 * on that team — adding or removing someone from Editor Teams — sync onto
 * this event automatically (see syncLinkedEventsForEditorTeam in events.js).
 *
 * The optional shared note is also tagged with sourceTeamId. That means if
 * someone new joins the editor team later and gets synced onto this event,
 * they're retroactively added to this note's audience too — they see the
 * team's full note history, not just notes posted after they joined.
 *
 * Props:
 *   projectId, eventId       - identify the event
 *   currentTeam               - event.team (current array, so we can merge not overwrite)
 *   currentStatus             - event.status (passed through so status auto-advance logic still works)
 *   addedByName                - current admin's name, stamped on the shared note
 *   onAssigned                 - callback to reload the event after a successful assign
 */
export default function AssignEditorTeamButton({
  projectId,
  eventId,
  currentTeam,
  currentStatus,
  addedByName,
  onAssigned,
}) {
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [sharedNote, setSharedNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingTeams(true);
    getAllEditorTeams()
      .then(setTeams)
      .finally(() => setLoadingTeams(false));
  }, [open]);

  async function handleAssign() {
    const team = teams.find((t) => t.id === selectedTeamId);
    if (!team) return;

    setSaving(true);
    try {
      const mergedTeam = mergeEditorTeamIntoEventTeam(
        currentTeam,
        team.members,
        "Editor",
        team.id
      );
      await updateEventTeam(projectId, eventId, mergedTeam, currentStatus);
      await linkEditorTeamToEvent(projectId, eventId, team.id);

      if (sharedNote.trim()) {
        const targetUids = team.members.map((m) => m.uid);
        await addSharedTeamNote(projectId, eventId, sharedNote, addedByName, targetUids, team.id);
      }

      toast.success(`${team.name} added to event`);
      setOpen(false);
      setSelectedTeamId(null);
      setSharedNote("");
      onAssigned?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
        <Users2 className="h-4 w-4" />
        Assign Team
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>Assign an editor team</DialogTitle>
        </DialogHeader>

        {loadingTeams ? (
          <p className="py-4 text-sm text-slate-500">Loading teams...</p>
        ) : teams.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">
            No reusable teams yet. Create one from the Editor Teams page first.
          </p>
        ) : (
          <div className="grid gap-3 py-2">
            <div>
              <Label className="mb-2 block">Pick a team</Label>
              <RadioGroup value={selectedTeamId || ""} onValueChange={setSelectedTeamId}>
                <div className="grid gap-2">
                  {teams.map((team) => (
                    <label
                      key={team.id}
                      className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 p-2.5 text-sm hover:border-slate-300"
                    >
                      <RadioGroupItem value={team.id} className="mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{team.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {(team.members || []).map((m) => m.name).join(", ") || "No members"}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </RadioGroup>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sharedNote">Shared note (optional)</Label>
              <Textarea
                id="sharedNote"
                rows={3}
                value={sharedNote}
                onChange={(e) => setSharedNote(e.target.value)}
                placeholder="Visible to everyone on this event's team, e.g. delivery deadline is Friday EOD"
              />
              <p className="text-xs text-slate-400">
                Anyone added to this team later will see this note too, not just future ones.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={handleAssign}
            disabled={saving || !selectedTeamId}
            className="w-full sm:w-auto"
          >
            {saving ? "Assigning..." : "Assign Team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}