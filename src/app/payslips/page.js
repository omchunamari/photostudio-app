"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { getPayrollsForEmployee } from "@/lib/firebase/payroll";
import { downloadPayslipPdf } from "@/lib/finance/payslipPdf";
import { monthLabel } from "@/lib/finance/payrollCalc";
import { inr } from "@/lib/finance/calc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function Content() {
  const { user } = useAuth();
  const [slips, setSlips] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    getPayrollsForEmployee(user.uid)
      // Employees only see slips once the salary is actually paid.
      .then((list) => setSlips(list.filter((p) => p.status === "paid")))
      .catch((err) => {
        console.error(err);
        toast.error("Could not load payslips");
        setSlips([]);
      });
  }, [user?.uid]);

  return (
    <AppShell>
      <h1 className="font-heading text-2xl font-semibold text-slate-900">My payslips</h1>
      <p className="mb-4 text-sm text-slate-500">Download your salary slips as PDF.</p>
      {slips === null ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : slips.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-slate-500">No payslips available yet.</CardContent></Card>
      ) : (
        <div className="flex max-w-2xl flex-col gap-2">
          {slips.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium text-slate-900">{monthLabel(p.month)}</p>
                  <p className="text-xs text-slate-500">Paid days {p.paidDays}/{p.daysInMonth} · LOP {p.lopDays}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{inr(p.netSalary)}</span>
                  <Button size="sm" variant="outline" onClick={() => downloadPayslipPdf(p, user)}>
                    <Download className="h-3.5 w-3.5" /> PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export default function PayslipsPage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <Content />
      </DeviceGate>
    </ProtectedRoute>
  );
}
