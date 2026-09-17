"use client";

import * as React from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, CheckIcon, Search } from "lucide-react";

/**
 * A Select with a type-to-filter search box in the dropdown.
 *
 * Drop-in for the plain <Select> wherever the option list is long enough
 * that scrolling is a chore — sales execs, project leaders, stages, event
 * types, packages. Same controlled API (`value` / `onValueChange`), so
 * swapping one in is a one-line change at the call site.
 *
 * The search box appears automatically once there are more than
 * SEARCH_THRESHOLD options. A two-option dropdown doesn't need a search
 * bar and putting one there just adds a click; pass `alwaysSearch` to
 * force it, or `searchable={false}` to suppress it entirely.
 *
 * options: Array<string | { value, label, hint?, group?, disabled?, badge? }>
 *   Plain strings are treated as value === label, so existing constant
 *   arrays (LEAD_STATUSES, PROJECT_TYPES, ...) can be passed straight in.
 *   `group` splits the list under headings (e.g. Employees / Freelancers),
 *   preserving the order the groups first appear in. A heading is hidden
 *   automatically when the filter empties it. `disabled` greys an option
 *   out and blocks selection — for entries that are listed but not
 *   choosable, like someone already on the team. `badge` renders a short
 *   tag on the right (a conflict warning, say).
 */
const SEARCH_THRESHOLD = 7;

export default function SearchableSelect({
  value,
  onValueChange,
  options = [],
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No matches",
  className,
  contentClassName,
  disabled = false,
  alwaysSearch = false,
  searchable = true,
  renderValue,
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const normalized = React.useMemo(
    () =>
      options.map((o) =>
        typeof o === "string" ? { value: o, label: o } : { hint: undefined, ...o }
      ),
    [options]
  );

  const showSearch = searchable && (alwaysSearch || normalized.length > SEARCH_THRESHOLD);

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return normalized;
    // Matches label or hint, so you can find a person by name or by the
    // secondary line (role, phone, quote number) shown beside it.
    return normalized.filter(
      (o) =>
        o.label?.toLowerCase().includes(term) || o.hint?.toLowerCase().includes(term)
    );
  }, [normalized, query]);

  const selected = normalized.find((o) => o.value === value);

  // Group in first-appearance order. Ungrouped options collect under "",
  // which renders with no heading — so a flat list behaves exactly as before.
  const grouped = React.useMemo(() => {
    const out = [];
    const index = new Map();
    filtered.forEach((o) => {
      const key = o.group || "";
      if (!index.has(key)) {
        index.set(key, out.length);
        out.push({ group: key, items: [] });
      }
      out[index.get(key)].items.push(o);
    });
    return out;
  }, [filtered]);

  // Reset the filter each time it opens, so reopening never shows a list
  // still narrowed by whatever was typed last time.
  function handleOpenChange(next) {
    setOpen(next);
    if (next) setQuery("");
  }

  function choose(option) {
    if (option.disabled) return;
    onValueChange?.(option.value);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-1.5 rounded-md border border-input bg-transparent py-2 pr-2 pl-2.5 text-left text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <span
            className={cn(
              "line-clamp-1 flex-1",
              !selected && "text-muted-foreground"
            )}
          >
            {renderValue ? renderValue(selected, value) : selected?.label || placeholder}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className={cn("w-(--anchor-width) min-w-52 p-0", contentClassName)}
      >
        {showSearch && (
          <div className="relative border-b border-border p-1.5">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 border-none pl-7 shadow-none focus-visible:ring-0"
            />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyText}</p>
          ) : (
            grouped.map((section) => (
              <div key={section.group || "__ungrouped"}>
                {section.group && (
                  <p className="px-2 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.group}
                  </p>
                )}
                {section.items.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    disabled={o.disabled}
                    onClick={() => choose(o)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none",
                      o.disabled
                        ? "cursor-not-allowed opacity-45"
                        : "hover:bg-accent hover:text-accent-foreground",
                      o.value === value && !o.disabled && "bg-accent/60"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.label}</span>
                      {o.hint && (
                        <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>
                      )}
                    </span>
                    {o.badge && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        {o.badge}
                      </span>
                    )}
                    {o.value === value && !o.disabled && <CheckIcon className="size-4 shrink-0" />}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}