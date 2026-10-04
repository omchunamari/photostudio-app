"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  HandCoins,
  Banknote,
  Users,
  Building2,
  BarChart3,
} from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { FINANCE_MODULE_ROLES } from "@/lib/finance/constants";

const TABS = [
  { label: "Overview", href: "/finance", icon: LayoutDashboard },
  { label: "Transactions", href: "/finance/transactions", icon: ArrowLeftRight },
  { label: "Accounts", href: "/finance/accounts", icon: Landmark },
  { label: "Allowances", href: "/finance/allowances", icon: HandCoins },
  { label: "Payroll", href: "/finance/payroll", icon: Banknote },
  { label: "Employees", href: "/finance/employees", icon: Users },
  { label: "Loans & EMI", href: "/finance/loans", icon: Building2 },
  { label: "Reports", href: "/finance/reports", icon: BarChart3 },
];

/** Shared frame for every /finance page: auth gate, app chrome, title and sub-navigation. */
export default function FinanceShell({ title, description, actions, children }) {
  const pathname = usePathname();
  const activeRef = useRef(null);

  // On a phone the tab strip scrolls sideways; keep the current tab in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  return (
    <ProtectedRoute allowedRoles={FINANCE_MODULE_ROLES}>
      <DeviceGate>
        <AppShell>
          <div className="mx-auto w-full max-w-6xl">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="font-heading text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
                {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
              </div>
              {actions && <div className="flex flex-wrap items-center gap-2 [&>*]:shrink-0">{actions}</div>}
            </div>

            <nav
              aria-label="Finance sections"
              className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {TABS.map((t) => {
                const active = t.href === "/finance" ? pathname === "/finance" : pathname?.startsWith(t.href);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    ref={active ? activeRef : null}
                    aria-current={active ? "page" : undefined}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <t.icon className="h-3.5 w-3.5" />
                    {t.label}
                  </Link>
                );
              })}
            </nav>

            {children}
          </div>
        </AppShell>
      </DeviceGate>
    </ProtectedRoute>
  );
}

// Money colour language shared with the dashboard's FinanceOverview (see TONES there).
const TONES = {
  neutral: { value: "text-foreground", chip: "bg-muted text-muted-foreground" },
  positive: { value: "text-success", chip: "bg-success/10 text-success" },
  warning: { value: "text-warning", chip: "bg-warning/10 text-warning" },
  negative: { value: "text-destructive", chip: "bg-destructive/10 text-destructive" },
};

export function Stat({ label, value, sub, tone = "neutral", icon: Icon }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <div className="h-full rounded-xl bg-card p-3 shadow-xs ring-1 ring-foreground/10 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">{label}</p>
        {Icon && (
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${t.chip}`}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </div>
        )}
      </div>
      <p className={`mt-1.5 truncate font-heading text-lg font-semibold tabular-nums sm:text-2xl ${t.value}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">{sub}</p>}
    </div>
  );
}

export function signTone(n) {
  return n < 0 ? "negative" : n > 0 ? "positive" : "neutral";
}

/** Placeholder blocks while data loads — less jarring than a bare "Loading...". */
export function PageSkeleton({ stats = 4, rows = 5 }) {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: stats }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted sm:h-24" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-muted/70" />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10">
      {Icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Two-or-more option toggle used inside forms (Income/Expense, Project/Company, ...). */
export function Segmented({ value, onChange, options, className = "" }) {
  return (
    <div className={`grid gap-1 rounded-lg bg-muted p-1 ${className}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
