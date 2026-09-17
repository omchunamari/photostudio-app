// India is always UTC+5:30, no DST — safe to hardcode the offset.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Returns "YYYY-MM-DD" for the given date (defaults to now), in IST,
 * regardless of the server/browser's local timezone.
 */
export function getISTDateStr(date = new Date()) {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  return istDate.toISOString().split("T")[0];
}

/**
 * Returns "YYYY-MM-DD" for the day before the given date (defaults to now), in IST.
 */
export function getISTYesterdayStr(date = new Date()) {
  const yesterday = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return getISTDateStr(yesterday);
}

/**
 * Returns the day-of-week (0 = Sunday ... 6 = Saturday) for the given date, in IST.
 */
export function getISTDay(date = new Date()) {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  return istDate.getUTCDay();
}

/**
 * Returns the day-of-week (0 = Sunday ... 6 = Saturday) for a "YYYY-MM-DD"
 * date string, anchored at IST noon so it's immune to the browser/server's
 * local timezone shifting it to the previous or next day.
 */
export function getISTDayFromDateStr(dateStr) {
  return getISTDay(new Date(`${dateStr}T12:00:00+05:30`));
}

// ---------------------------------------------------------------------------
// Display formatters — single source of truth for how dates/times are shown
// anywhere in the app. Two rules, applied everywhere:
//   1. 12-hour clock with AM/PM (hour12: true, explicit — never left to the
//      browser locale, which renders 24-hour on en-GB/en-DE machines).
//   2. Anchored to Asia/Kolkata, so a check-in stamp reads the same whether
//      it's opened in Thane or on a laptop still set to another timezone.
// Prefer these over calling toLocaleTimeString/toLocaleString directly.
// ---------------------------------------------------------------------------

const IST_TZ = "Asia/Kolkata";

/** "9:04 AM" — time only. Returns `fallback` for empty/invalid input. */
export function formatTime12(value, fallback = "—") {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: IST_TZ,
  });
}

/** "13 Sep 2026" — date only. */
export function formatDateIST(value, fallback = "—") {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: IST_TZ,
  });
}

/** "13 Sep" — compact date, for tight widgets. */
export function formatShortDateIST(value, fallback = "—") {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: IST_TZ,
  });
}

/** "13 Sep 2026, 9:04 AM" — date + 12-hour time. */
export function formatDateTime12(value, fallback = "—") {
  const d = toDate(value);
  if (!d) return fallback;
  return `${formatDateIST(d)}, ${formatTime12(d)}`;
}

/** "13 Sep, 9:04 AM" — compact date + 12-hour time. */
export function formatShortDateTime12(value, fallback = "—") {
  const d = toDate(value);
  if (!d) return fallback;
  return `${formatShortDateIST(d)}, ${formatTime12(d)}`;
}

/**
 * Accepts an ISO string, a Date, a millisecond number, or a Firestore
 * Timestamp ({ toDate() }). Returns null for anything unparseable so the
 * formatters can fall back instead of rendering "Invalid Date".
 */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") return toDate(value.toDate());
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}