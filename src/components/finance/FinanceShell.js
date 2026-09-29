"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { FINANCE_MODULE_ROLES } from "@/lib/finance/constants";

const TABS = [
  { label: "Overview", href: "/finance" },
  { label: "Transactions", href: "/finance/transactions" },
  { label: "Accounts", href: "/finance/accounts" },
  { label: "Allowances", href: "/finance/allowances" },
  { label: "Payroll", href: "/finance/payroll" },
  { label: "Employees", href: "/finance/employees" },
  { label: "Loans & EMI", href: "/finance/loans" },
  { label: "Reports", href: "/finance/reports" },
];

/** Shared frame for every /finance page: auth gate, app chrome, title and sub-navigation. */
export default function FinanceShell({ title, description, actions, children }) {
  const pathname = usePathname();
  return (
    <ProtectedRoute allowedRoles={FINANCE_MODULE_ROLES}>
      <DeviceGate>
        <AppShell>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-heading text-2xl font-semibold text-slate-900">{title}</h1>
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
            {TABS.map((t) => {
              const active = t.href === "/finance" ? pathname === "/finance" : pathname?.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "border-emerald-600 text-slate-900"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
          {children}
        </AppShell>
      </DeviceGate>
    </ProtectedRoute>
  );
}

/** Small labelled figure used across the finance screens. Colour follows FinanceOverview's TONES. */
const TONE = {
  neutral: "text-slate-900",
  positive: "text-emerald-600",
  warning: "text-amber-600",
  negative: "text-red-600",
};

export function Stat({ label, value, sub, tone = "neutral" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-heading text-2xl font-semibold ${TONE[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function signTone(n) {
  return n < 0 ? "negative" : n > 0 ? "positive" : "neutral";
}
