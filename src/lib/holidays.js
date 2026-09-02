// Yearly fixed organisation holidays — pure helpers, no Firebase imports, so
// this can be used from client components, server routes, and the cron job
// alike. A holiday is stored as { id, name, monthDay: "MM-DD" } so it recurs
// automatically every year without the admin having to re-enter it annually.

/** Extracts "MM-DD" out of a "YYYY-MM-DD" date string. */
export function monthDayOf(dateStr) {
  return dateStr ? dateStr.slice(5, 10) : "";
}

/** Returns the matching holiday for a date string, or null if it's not one. */
export function getHolidayForDate(dateStr, holidays = []) {
  const md = monthDayOf(dateStr);
  return holidays.find((h) => h.monthDay === md) || null;
}

export function isHolidayDate(dateStr, holidays = []) {
  return !!getHolidayForDate(dateStr, holidays);
}

/** Formats "MM-DD" as e.g. "26 Jan" for display, independent of any year. */
export function formatMonthDay(monthDay) {
  if (!monthDay) return "";
  const [month, day] = monthDay.split("-").map(Number);
  const d = new Date(Date.UTC(2024, month - 1, day));
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Sorts holidays by their position in the calendar year (Jan → Dec). */
export function sortByMonthDay(holidays = []) {
  return [...holidays].sort((a, b) => (a.monthDay < b.monthDay ? -1 : a.monthDay > b.monthDay ? 1 : 0));
}