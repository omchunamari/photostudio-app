"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import SearchableSelect from "@/components/ui/searchable-select";
import { X, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createCalendarBooking,
  updateCalendarBooking,
  deleteCalendarBooking,
} from "@/lib/firebase/calendarBookings";
import { findBookingConflicts, formatBookingTimeRange } from "@/lib/calendarBookings";

/**
 * Create or edit a Meetings & Tasks booking. Same form either way —
 * `booking` is null for a new one, or the existing record for editing.
 *
 * Conflict checking is informational only (see lib/calendarBookings.js):
 * it never blocks Save, it just tells you who's already busy so you can
 * decide whether that's fine. Three sources are checked, since all three
 * are already loaded on the calendar page and a real conflict doesn't
 * care which collection it lives in:
 *   - other bookings on this layer (time-of-day aware)
 *   - shoot events that day (day-level — events don't carry a time range)
 *   - approved/pending leave that day (day-level)
 */
export default function BookingDialog({
  open,
  onOpenChange,
  booking,
  defaultDate,
  people,
  allBookings,
  events,
  leaveRequests,
  currentUser,
  canDelete,
  onSaved,
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate || "");
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [attendeeUids, setAttendeeUids] = useState([]);
  const [attendeeNames, setAttendeeNames] = useState([]);
  const [pickerValue, setPickerValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (booking) {
      setTitle(booking.title || "");
      setDate(booking.date || defaultDate || "");
      setAllDay(!!booking.allDay);
      setStartTime(booking.startTime || "10:00");
      setEndTime(booking.endTime || "11:00");
      setLocation(booking.location || "");
      setNotes(booking.notes || "");
      setAttendeeUids(booking.attendeeUids || []);
      setAttendeeNames(booking.attendeeNames || []);
    } else {
      setTitle("");
      setDate(defaultDate || "");
      setAllDay(false);
      setStartTime("10:00");
      setEndTime("11:00");
      setLocation("");
      setNotes("");
      // Booking for yourself is the common case — pre-fill, remove if
      // this one isn't actually for you.
      setAttendeeUids(currentUser ? [currentUser.uid] : []);
      setAttendeeNames(currentUser ? [currentUser.name] : []);
    }
    setPickerValue("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, booking]);

  const pickerOptions = useMemo(
    () =>
      people
        .filter((p) => !attendeeUids.includes(p.uid))
        .map((p) => ({
          value: p.uid,
          label: p.name,
          hint: p.isFreelancer ? `${p.role} · freelancer` : p.role,
          group: p.isFreelancer ? "Freelancers" : "Staff",
        })),
    [people, attendeeUids]
  );

  function addAttendee(uid) {
    const person = people.find((p) => p.uid === uid);
    if (!person) return;
    setAttendeeUids((prev) => [...prev, uid]);
    setAttendeeNames((prev) => [...prev, person.name]);
    setPickerValue("");
  }

  function removeAttendee(uid) {
    const idx = attendeeUids.indexOf(uid);
    if (idx === -1) return;
    setAttendeeUids((prev) => prev.filter((u) => u !== uid));
    setAttendeeNames((prev) => prev.filter((_, i) => i !== idx));
  }

  // Conflicts recomputed on every relevant change — cheap, since
  // allBookings/events/leaveRequests are already in memory on the
  // calendar page and this is just array filtering, not a fetch.
  const conflicts = useMemo(() => {
    if (!date || attendeeUids.length === 0) return [];
    const candidate = { date, allDay, startTime, endTime };
    const out = [];

    attendeeUids.forEach((uid, i) => {
      const name = attendeeNames[i];

      findBookingConflicts(candidate, uid, allBookings, booking?.id).forEach((b) => {
        out.push({
          uid,
          name,
          label: `${b.title} (${formatBookingTimeRange(b)})`,
        });
      });

      events
        .filter((ev) => (ev.team || []).some((m) => m.uid === uid))
        .filter((ev) => date >= ev.eventStartDate && date <= (ev.eventEndDate || ev.eventStartDate))
        .forEach((ev) => {
          out.push({ uid, name, label: `shooting "${ev.eventName}" that day` });
        });

      leaveRequests
        .filter((lv) => lv.employeeUid === uid)
        .filter((lv) => date >= lv.startDate && date <= (lv.endDate || lv.startDate))
        .forEach(() => {
          out.push({ uid, name, label: "on leave that day" });
        });
    });

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, allDay, startTime, endTime, attendeeUids, attendeeNames, allBookings, events, leaveRequests, booking]);

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Give it a title");
      return;
    }
    if (!date) {
      toast.error("Pick a date");
      return;
    }
    if (!allDay && (!startTime || !endTime)) {
      toast.error("Set a start and end time, or mark it all-day");
      return;
    }
    if (!allDay && startTime >= endTime) {
      toast.error("End time has to be after the start time");
      return;
    }
    if (attendeeUids.length === 0) {
      toast.error("Add at least one person");
      return;
    }

    const payload = { title: title.trim(), date, allDay, startTime, endTime, location, notes, attendeeUids, attendeeNames };

    setSaving(true);
    try {
      if (booking) {
        await updateCalendarBooking(booking.id, payload, currentUser.uid, currentUser.name);
        toast.success("Booking updated");
      } else {
        await createCalendarBooking(payload, currentUser.uid, currentUser.name);
        toast.success("Booking created");
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err.message || "Couldn't save that booking");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!booking) return;
    if (!confirm(`Remove "${booking.title}"?`)) return;
    setDeleting(true);
    try {
      await deleteCalendarBooking(booking.id);
      toast.success("Booking removed");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err.message || "Couldn't remove that booking");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{booking ? "Edit Booking" : "New Booking"}</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-2">
          <div>
            <Label>Title</Label>
            <Input
              autoFocus
              placeholder="e.g. Client briefing, Edit review, Team standup"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label>Start</Label>
                <Input
                  type="time"
                  value={startTime}
                  disabled={allDay}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <Label>End</Label>
                <Input
                  type="time"
                  value={endTime}
                  disabled={allDay}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
            <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border"
              />
              All day — no specific time
            </label>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <Label>Who&rsquo;s this for</Label>
            <div className="flex flex-wrap gap-1.5">
              {attendeeUids.length === 0 && (
                <p className="text-xs text-muted-foreground">Nobody added yet.</p>
              )}
              {attendeeUids.map((uid, i) => (
                <span
                  key={uid}
                  className="flex items-center gap-1 rounded-full bg-muted py-1 pr-1.5 pl-2.5 text-xs font-medium text-foreground"
                >
                  {attendeeNames[i]}
                  <button
                    type="button"
                    onClick={() => removeAttendee(uid)}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <SearchableSelect
              value={pickerValue}
              onValueChange={addAttendee}
              options={pickerOptions}
              placeholder="Add someone..."
              searchPlaceholder="Search staff..."
              emptyText="Everyone's already added"
              alwaysSearch
            />

            {conflicts.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Possible scheduling conflicts — you can still save
                </p>
                {conflicts.map((c, i) => (
                  <p key={i} className="text-xs text-amber-800">
                    {c.name} is already {c.label}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <div>
              <Label>Location — optional</Label>
              <Input
                placeholder="e.g. Office, Zoom, Meeting Room 1"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div>
              <Label>Notes — optional</Label>
              <Textarea
                rows={1}
                placeholder="Anything worth knowing ahead of time"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {booking && canDelete ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleDelete}
              disabled={deleting || saving}
            >
              <Trash2 className="h-3.5 w-3.5" /> {deleting ? "Removing..." : "Remove"}
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={handleSave} disabled={saving || deleting}>
            {saving ? "Saving..." : booking ? "Save Changes" : "Create Booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}