"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DAY_KIND_STYLES } from "@/lib/attendanceMonth";
import { getISTDayFromDateStr, formatTime12 } from "@/lib/dateIST";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthName(month) {
  return MONTH_NAMES[month - 1];
}

/** ‹ September 2026 › — steps a month at a time; can't go past the current month. */
export function MonthNav({ year, month, onChange, maxYear, maxMonth }) {
  const atMax = year > maxYear || (year === maxYear && month >= maxMonth);
  const step = (delta) => {
    const d = new Date(year, month - 1 + delta, 1);
    onChange(d.getFullYear(), d.getMonth() + 1);
  };
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon-sm" onClick={() => step(-1)} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-36 text-center text-sm font-medium text-foreground">
        {monthName(month)} {year}
      </span>
      <Button variant="outline" size="icon-sm" onClick={() => step(1)} disabled={atMax} aria-label="Next month">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** A Monday-first month grid, each day coloured by what happened. */
export function MonthCalendar({ days, compact = false }) {
  if (!days?.length) return null;
  // Monday = 0 … Sunday = 6
  const lead = (getISTDayFromDateStr(days[0].date) + 6) % 7;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {compact ? w[0] : w}
          </div>
        ))}
        {Array.from({ length: lead }).map((_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {days.map((d) => {
          const s = DAY_KIND_STYLES[d.kind] || DAY_KIND_STYLES.future;
          const r = d.record;
          const title = [
            d.date,
            d.holidayName || s.label,
            r?.checkInTime ? `In ${formatTime12(r.checkInTime)}` : null,
            r?.checkOutTime ? `Out ${formatTime12(r.checkOutTime)}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div
              key={d.date}
              title={title}
              className={`flex aspect-square items-center justify-center rounded-md text-xs font-medium ring-1 ring-inset ${s.cell} ${compact ? "text-[11px]" : ""}`}
            >
              {Number(d.date.slice(8))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarLegend({ kinds = ["present", "late", "leave", "absent", "holiday", "off"] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {kinds.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${DAY_KIND_STYLES[k].dot}`} />
          {DAY_KIND_STYLES[k].label}
        </span>
      ))}
    </div>
  );
}
