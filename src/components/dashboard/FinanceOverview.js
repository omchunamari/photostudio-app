"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { IndianRupee, TrendingUp, AlertTriangle, Wallet } from "lucide-react";
import { formatINR } from "@/lib/dashboardFinance";

export default function FinanceOverview({ finance, loading, fyLabelText }) {
  const {
    totalRevenue,
    projectsBooked,
    receivedOnBookings,
    outstanding,
    cashReceived,
    monthly,
  } = finance;

  const collectedPct = totalRevenue > 0 ? Math.round((receivedOnBookings / totalRevenue) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <FinanceStatCard
          icon={IndianRupee}
          label="Total Revenue"
          value={formatINR(totalRevenue)}
          subtext={projectsBooked > 0 ? `${projectsBooked} project${projectsBooked !== 1 ? "s" : ""} booked` : "0 projects booked"}
          loading={loading}
        />
        <FinanceStatCard
          icon={TrendingUp}
          label="Received on Bookings"
          value={formatINR(receivedOnBookings)}
          subtext={receivedOnBookings > 0 ? `${collectedPct}% of total revenue` : "no revenue yet"}
          loading={loading}
        />
        <FinanceStatCard
          icon={AlertTriangle}
          label="Outstanding"
          value={formatINR(outstanding)}
          subtext="still to collect"
          loading={loading}
        />
        <FinanceStatCard
          icon={Wallet}
          label="Cash Received"
          value={formatINR(cashReceived)}
          subtext={`paid during ${fyLabelText}`}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payments Received</p>
            <p className="font-heading text-lg font-semibold text-foreground">Last 6 months</p>
            <div className="mt-3 h-56 w-full">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthly} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="paymentsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                      width={45}
                    />
                    <Tooltip formatter={(v) => formatINR(v)} contentStyle={{ borderRadius: 8, borderColor: "var(--border)", fontSize: 12 }} />
                    <Area type="monotone" dataKey="amount" stroke="var(--accent)" strokeWidth={2} fill="url(#paymentsGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FinanceStatCard({ icon: Icon, label, value, subtext, loading }) {
  return (
    <Card className="h-full">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">{label}</p>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </div>
        </div>
        <p className="mt-2 font-heading text-xl font-semibold text-foreground sm:text-2xl">
          {loading ? "—" : value}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">{subtext}</p>
      </CardContent>
    </Card>
  );
}