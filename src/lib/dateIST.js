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