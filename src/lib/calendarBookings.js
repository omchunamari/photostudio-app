// Pure helpers for the Meetings & Tasks booking layer — no Firebase
// imports, so these can be unit tested or reused from anywhere. All
// conflict checks are informational only: overlapping bookings are
// allowed to save, the UI just warns before you do.

/**
 * Whether two bookings on the same date overlap in time. An all-day
 * booking is treated as occupying the whole day, so it conflicts with
 * anything else on that date for the same person. Two timed bookings
 * conflict using standard half-open interval overlap.
 */
export function bookingsOverlap(a, b) {
  if (a.date !== b.date) return false;
  if (a.allDay || b.allDay) return true;
  if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) return false;
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

/**
 * Every existing booking that conflicts with the given candidate for one
 * specific attendee. Pass `excludeId` when editing an existing booking so
 * it doesn't flag a conflict against its own prior version.
 */
export function findBookingConflicts(candidate, attendeeUid, existingBookings, excludeId) {
  return existingBookings.filter(
    (b) =>
      b.id !== excludeId &&
      (b.attendeeUids || []).includes(attendeeUid) &&
      bookingsOverlap(candidate, b)
  );
}

/** "9:00 AM" from a 24h "HH:MM" string. Returns "" for null/empty input. */
export function formatBookingTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** "9:00 AM – 10:30 AM" for a timed booking, or "All day" for an all-day one. */
export function formatBookingTimeRange(booking) {
  if (booking.allDay) return "All day";
  if (!booking.startTime || !booking.endTime) return "";
  return `${formatBookingTime(booking.startTime)} – ${formatBookingTime(booking.endTime)}`;
}