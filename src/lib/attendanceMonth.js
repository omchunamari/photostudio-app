// Month-level attendance maths, shared by the Attendance page's team view and
// each employee's own "My month" view. Pure functions — no Firebase imports.

import { WEEKLY_OFF_DAY } from "@/lib/constants/attendance";
import { getISTDayFromDateStr } from "@/lib/dateIST";
import { getHolidayForDate } from "@/lib/holidays";

// "late" isn't produced by check-in today; kept here so any such record still counts as present.
export const PRESENT_STATUSES = ["present", "late"];
export const LEAVE_STATUSES = ["auto_leave", "on_leave"];

/** "YYYY-MM-DD" for every day of a month. month is 1-indexed. */
export function monthDates(year, month) {
  const total = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return Array.from({ length: total }, (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * Working days = every day of the month except the weekly off (Sunday) and the
 * org's fixed holidays from Settings → Holidays — the same days the daily
 * cron skips when it auto-marks absences.
 */
export function monthCalendar(year, month, holidays, today) {
  const days = monthDates(year, month).map((date) => {
    const holiday = getHolidayForDate(date, holidays);
    const weeklyOff = getISTDayFromDateStr(date) === WEEKLY_OFF_DAY;
    return { date, working: !weeklyOff && !holiday, holidayName: holiday?.name || null, weeklyOff };
  });
  const working = days.filter((d) => d.working);
  return {
    days,
    workingDays: working.length,
    // Working days that have already started (today included) — the fair
    // denominator for an attendance % while the month is still running.
    workingDaysSoFar: working.filter((d) => d.date <= today).length,
    offDays: days.length - working.length,
    holidays: days.filter((d) => d.holidayName).length,
  };
}

function leaveCovers(requests, date) {
  return requests.some((r) => r.status === "approved" && r.startDate <= date && date <= r.endDate);
}

/**
 * One employee's month. Each day gets a `kind`:
 *   present | leave | absent | today (not in yet) | off | holiday | future
 * `records` are that employee's attendance docs; `leaves` their leave requests.
 *
 * Approved leave matters here because the cron does NOT write an attendance
 * row for a day already covered by approved leave — counting only attendance
 * rows would show those days as absent.
 */
export function employeeMonth(calendar, records, leaves, today) {
  const byDate = new Map(records.map((r) => [r.date, r]));
  let present = 0;
  let leave = 0;
  let absent = 0;
  let extraDays = 0; // worked on a Sunday / holiday
  let workedMs = 0;
  let workedCount = 0;

  const days = calendar.days.map((d) => {
    const rec = byDate.get(d.date);
    let kind;
    if (rec && PRESENT_STATUSES.includes(rec.status)) {
      kind = "present";
      if (d.working) present++;
      else extraDays++;
      if (rec.totalWorkingMs > 0) {
        workedMs += rec.totalWorkingMs;
        workedCount++;
      }
    } else if (!d.working) {
      kind = d.holidayName ? "holiday" : "off";
    } else if ((rec && LEAVE_STATUSES.includes(rec.status)) || leaveCovers(leaves, d.date)) {
      kind = "leave";
      if (d.date <= today) leave++;
    } else if (d.date > today) {
      kind = "future";
    } else if (d.date === today) {
      kind = "today";
    } else {
      kind = "absent";
      absent++;
    }
    return { ...d, kind, record: rec || null };
  });

  // Today only counts toward the % once they've actually checked in.
  const todayPending = days.some((d) => d.kind === "today");
  const denominator = calendar.workingDaysSoFar - (todayPending ? 1 : 0);

  return {
    days,
    present,
    leave,
    absent,
    extraDays,
    avgWorkingMs: workedCount ? workedMs / workedCount : 0,
    attendancePct: denominator > 0 ? Math.round((present / denominator) * 100) : null,
  };
}

export const DAY_KIND_STYLES = {
  present: { cell: "bg-success/15 text-success ring-success/30", dot: "bg-success", label: "Present" },
  leave: { cell: "bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-300", dot: "bg-sky-500", label: "Leave" },
  absent: { cell: "bg-destructive/15 text-destructive ring-destructive/30", dot: "bg-destructive", label: "Absent" },
  today: { cell: "bg-card text-foreground ring-foreground/40", dot: "bg-foreground/40", label: "Today" },
  off: { cell: "bg-muted text-muted-foreground/70 ring-transparent", dot: "bg-muted-foreground/30", label: "Sunday" },
  holiday: { cell: "bg-muted text-muted-foreground ring-transparent", dot: "bg-muted-foreground/50", label: "Holiday" },
  future: { cell: "bg-transparent text-muted-foreground/60 ring-foreground/10", dot: "bg-transparent ring-1 ring-foreground/20", label: "Upcoming" },
};
