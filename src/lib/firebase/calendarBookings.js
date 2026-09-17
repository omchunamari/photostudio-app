import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./client";
import { notifyEmployee } from "./notifications";

/**
 * calendarBookings/{id} — internal scheduling, deliberately separate from
 * the `events` subcollection under projects (which represents client
 * shoots, with their own team/deliverables/post-production machinery).
 * A booking is a lightweight time slot: a meeting, a task, or a generic
 * internal event, bookable for yourself or for anyone else.
 *
 * {
 *   title: string,
 *   date: string,              // "YYYY-MM-DD"
 *   allDay: boolean,
 *   startTime: string | null,  // "HH:MM", 24h — null when allDay
 *   endTime: string | null,
 *   location: string,
 *   notes: string,
 *   attendeeUids: string[],
 *   attendeeNames: string[],   // denormalized, so the calendar can render
 *                               // names without a lookup per booking
 *   createdByUid: string,
 *   createdByName: string,
 *   createdAt, updatedAt: ISO strings,
 * }
 *
 * Anyone signed in can book a slot for anyone else — see firestore.rules.
 * Editing or deleting is limited to whoever created it, or an admin/PM.
 */

export async function getAllCalendarBookings() {
  const snap = await getDocs(collection(db, "calendarBookings"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createCalendarBooking(data, createdByUid, createdByName) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "calendarBookings"), {
    title: data.title,
    date: data.date,
    allDay: !!data.allDay,
    startTime: data.allDay ? null : data.startTime || null,
    endTime: data.allDay ? null : data.endTime || null,
    location: data.location || "",
    notes: data.notes || "",
    attendeeUids: data.attendeeUids || [],
    attendeeNames: data.attendeeNames || [],
    createdByUid,
    createdByName: createdByName || "",
    createdAt: now,
    updatedAt: now,
  });

  // Everyone booked gets notified except whoever did the booking — no
  // need to tell yourself you booked yourself.
  await Promise.all(
    (data.attendeeUids || [])
      .filter((uid) => uid !== createdByUid)
      .map((uid) =>
        notifyEmployee(uid, {
          type: "calendar_booking",
          title: "New booking",
          message: `${createdByName || "Someone"} booked you for "${data.title}" on ${data.date}${
            data.allDay ? "" : data.startTime ? ` at ${data.startTime}` : ""
          }.`,
        })
      )
  );

  return ref.id;
}

/**
 * `updatedByName` is optional — pass the current user's name so anyone
 * newly added as an attendee gets a notification naming who added them.
 * Only people who weren't already on the booking get notified; editing
 * the time or title for existing attendees doesn't re-notify them.
 */
export async function updateCalendarBooking(id, data, updatedByUid, updatedByName) {
  const ref = doc(db, "calendarBookings", id);
  const snap = await getDoc(ref);
  const prior = snap.exists() ? snap.data() : null;
  const priorUids = new Set(prior?.attendeeUids || []);

  await updateDoc(ref, {
    title: data.title,
    date: data.date,
    allDay: !!data.allDay,
    startTime: data.allDay ? null : data.startTime || null,
    endTime: data.allDay ? null : data.endTime || null,
    location: data.location || "",
    notes: data.notes || "",
    attendeeUids: data.attendeeUids || [],
    attendeeNames: data.attendeeNames || [],
    updatedAt: new Date().toISOString(),
  });

  const newlyAdded = (data.attendeeUids || []).filter(
    (uid) => !priorUids.has(uid) && uid !== updatedByUid
  );
  await Promise.all(
    newlyAdded.map((uid) =>
      notifyEmployee(uid, {
        type: "calendar_booking",
        title: "New booking",
        message: `${updatedByName || "Someone"} booked you for "${data.title}" on ${data.date}${
          data.allDay ? "" : data.startTime ? ` at ${data.startTime}` : ""
        }.`,
      })
    )
  );
}

export async function deleteCalendarBooking(id) {
  await deleteDoc(doc(db, "calendarBookings", id));
}