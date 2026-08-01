"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
// import RegularizationGate from "@/components/RegularizationGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import AttendanceCard from "@/components/AttendanceCard";
import DailyReportPanel from "@/components/DailyReportPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getAttendanceForDate, formatDuration, getTodayAttendance } from "@/lib/firebase/attendance";
import { getAllEmployees } from "@/lib/firebase/employees";
import { getPendingLeaveRequests, getLeaveHistoryForEmployee } from "@/lib/firebase/leave";
import { getAllDevices } from "@/lib/firebase/devices";
import {
  Users,
  UserX,
  CalendarClock,
  Smartphone,
  Clock,
  Timer,
} from "lucide-react";

const ADMIN_ROLES = ["super_admin", "admin"];

function DashboardContent() {
  const { user } = useAuth();
  const isAdminView = ADMIN_ROLES.includes(user.role);

  const [adminStats, setAdminStats] = useState({
    presentToday: null,
    absentToday: null,
    pendingLeaves: null,
    pendingDevices: null,
  });

  const [employeeStats, setEmployeeStats] = useState({
    status: "Not Checked In",
    hours: "0h 0m",
    pendingLeaves: null,
  });

  useEffect(() => {
    if (isAdminView) {
      loadAdminStats();
    } else {
      loadEmployeeStats();
    }
  }, [isAdminView]);

  async function loadAdminStats() {
    const [todayAttendance, allEmployees, pendingLeaves, allDevices] = await Promise.all([
      getAttendanceForDate(),
      getAllEmployees(),
      getPendingLeaveRequests(),
      getAllDevices(),
    ]);

    const activeEmployees = allEmployees.filter((e) => e.status === "active");
    const presentToday = todayAttendance.filter((r) =>
      ["present", "late"].includes(r.status)
    ).length;
    const absentToday = activeEmployees.length - presentToday;
    const pendingDevices = allDevices.filter((d) => d.status === "pending").length;

    setAdminStats({
      presentToday,
      absentToday: absentToday < 0 ? 0 : absentToday,
      pendingLeaves: pendingLeaves.length,
      pendingDevices,
    });
  }

  async function loadEmployeeStats() {
    const [record, leaveHistory] = await Promise.all([
      getTodayAttendance(user.uid),
      getLeaveHistoryForEmployee(user.uid),
    ]);
    const pendingLeaves = leaveHistory.filter((l) => l.status === "pending").length;

    if (!record) {
      setEmployeeStats({ status: "Not Checked In", hours: "0h 0m", pendingLeaves });
    } else if (record.checkOutTime) {
      setEmployeeStats({
        status: "Checked Out",
        hours: formatDuration(record.totalWorkingMs),
        pendingLeaves,
      });
    } else {
      setEmployeeStats({
        status: "Checked In",
        hours: formatDuration(Date.now() - new Date(record.checkInTime)),
        pendingLeaves,
      });
    }
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col gap-3 sm:gap-4">
        <h2 className="text-lg font-semibold text-slate-900 sm:text-2xl">
          Welcome back, {user.name.split(" ")[0]}
        </h2>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="dailyReport">Daily Report</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="flex flex-col gap-3 sm:gap-4">
              {!isAdminView && <AttendanceCard />}

              <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
                {isAdminView ? (
                  <>
                    <StatCard icon={Users} label="Present Today" value={adminStats.presentToday} accent="emerald" />
                    <StatCard icon={UserX} label="Absent Today" value={adminStats.absentToday} accent="rose" />
                    <StatCard icon={CalendarClock} label="Pending Leaves" value={adminStats.pendingLeaves} accent="amber" href="/leave" />
                    <StatCard icon={Smartphone} label="Pending Devices" value={adminStats.pendingDevices} accent="sky" href="/devices" />
                  </>
                ) : (
                  <>
                    <StatCard icon={Clock} label="Today's Status" value={employeeStats.status} accent="emerald" />
                    <StatCard icon={Timer} label="Today's Hours" value={employeeStats.hours} accent="sky" />
                    <StatCard icon={CalendarClock} label="Pending Leaves" value={employeeStats.pendingLeaves} accent="amber" href="/leave" />
                  </>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="dailyReport">
            <DailyReportPanel />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

const ACCENTS = {
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
  violet: "bg-violet-50 text-violet-600",
};

function StatCard({ icon: Icon, label, value, accent = "sky", href }) {
  const content = (
    <Card className={href ? "h-full transition hover:border-slate-300 hover:shadow-sm" : "h-full"}>
      <CardContent className="flex items-center gap-3 p-3 sm:p-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 ${ACCENTS[accent]}`}>
          <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-slate-500 sm:text-xs">{label}</p>
          <p className="truncate text-base font-bold text-slate-900 sm:text-xl">{value ?? "—"}</p>
        </div>
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <DashboardContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}