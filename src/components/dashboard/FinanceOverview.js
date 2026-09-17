"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { IndianRupee, TrendingUp, AlertTriangle, Wallet } from "lucide-react";
import { formatINR } from "@/lib/dashboardFinance";

/**
 * Money colour language, applied consistently to every figure on this
 * dashboard so a number's colour alone tells you which way the cash moves:
 *
 *   neutral  — ink. Headline/reference totals. Not good or bad, just scale.
 *   positive — green. Money that has landed in the account.
 *   warning  — amber. Money owed TO us, or owed BY us. Recoverable, not lost.
 *   negative — red. Attention needed: an outstanding balance that's material,
 *              or a figure that doesn't reconcile.
 *
 * Colour is never the only signal — every card keeps its label, icon and
 * subtext, so this reads fine for anyone who can't distinguish the hues.
 */
const TONES = {
  neutral: { value: "text-foreground", chip: "bg-muted text-muted-foreground" },
  positive: { value: "text-success", chip: "bg-success/10 text-success" },
  warning: { value: "text-warning", chip: "bg-warning/10 text-warning" },
  negative: { value: "text-destructive", chip: "bg-destructive/10 text-destructive" },
};

export default function FinanceOverview({ finance, loading, fyLabelText }) {
  const {
    totalRevenue,
    projectsBooked,
    receivedOnBookings,
    outstanding,
    overCollected = 0,
    cashReceived,
    monthly,
  } = finance;

  const collectedPct = totalRevenue > 0 ? Math.round((receivedOnBookings / totalRevenue) * 100) : 0;
  const outstandingPct = totalRevenue > 0 ? Math.round((outstanding / totalRevenue) * 100) : 0;

  // Nothing outstanding is genuinely good news, so it shouldn't glare red.
  // Under a quarter of the book still to collect is normal for a season in
  // progress (amber); above that it's a collections problem worth flagging.
  const outstandingTone =
    outstanding === 0 ? "positive" : outstandingPct > 25 ? "negative" : "warning";

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <FinanceStatCard
          icon={IndianRupee}
          label="Total Revenue"
          value={formatINR(totalRevenue)}
          subtext={`${projectsBooked} project${projectsBooked !== 1 ? "s" : ""} booked in ${fyLabelText}`}
          tone="neutral"
          loading={loading}
        />
        <FinanceStatCard
          icon={TrendingUp}
          label="Received on Bookings"
          value={formatINR(receivedOnBookings)}
          subtext={
            totalRevenue > 0
              ? `${collectedPct}% of ${fyLabelText} bookings collected`
              : "no bookings yet"
          }
          tone={receivedOnBookings > 0 ? "positive" : "neutral"}
          loading={loading}
        />
        <FinanceStatCard
          icon={AlertTriangle}
          label="Outstanding"
          value={formatINR(outstanding)}
          subtext={
            outstanding === 0
              ? overCollected > 0
                ? `${formatINR(overCollected)} over — check invoice tagging`
                : "fully collected"
              : `${outstandingPct}% still to collect`
          }
          tone={overCollected > 0 ? "negative" : outstandingTone}
          loading={loading}
        />
        <FinanceStatCard
          icon={Wallet}
          label="Cash Received"
          value={formatINR(cashReceived)}
          subtext={`landed during ${fyLabelText}`}
          tone={cashReceived > 0 ? "positive" : "neutral"}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Payments Received
            </p>
            <p className="font-heading text-lg font-semibold text-foreground">{fyLabelText}</p>
            <div className="mt-3 h-56 w-full">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                      width={45}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                      formatter={(v) => [formatINR(v), "Received"]}
                      contentStyle={{ borderRadius: 8, borderColor: "var(--border)", fontSize: 12 }}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={38}>
                      {/* Months with no collection stay grey rather than
                          rendering as an invisible zero-height green bar. */}
                      {monthly.map((m) => (
                        <Cell
                          key={m.label}
                          fill={m.amount > 0 ? "var(--success)" : "var(--border)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FinanceStatCard({ icon: Icon, label, value, subtext, tone = "neutral", loading }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <Card className="h-full">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
            {label}
          </p>
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${t.chip}`}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </div>
        </div>
        <p className={`mt-2 font-heading text-xl font-semibold sm:text-2xl ${loading ? "text-foreground" : t.value}`}>
          {loading ? "—" : value}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">{subtext}</p>
      </CardContent>
    </Card>
  );
}