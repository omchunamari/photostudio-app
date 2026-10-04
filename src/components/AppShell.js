"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import AvatarInitials from "@/components/ui/avatar-initials";
import { Button } from "@/components/ui/button";
import NotificationBell from "@/components/NotificationBell";
import {
  LayoutDashboard,
  Users,
  UserRound,
  Clock,
  Calendar,
  CalendarRange,
  CalendarDays,
  Monitor,
  BarChart3,
  FolderKanban,
  Target,
  Clapperboard,
  LogOut,
  Menu,
  X,
  Settings,
  Wallet,
  FileText,
} from "lucide-react";

// v1 scope: only these modules are active. Other pages/files (teams,
// editor-teams, notifications) still exist in the codebase but are
// intentionally left out of navigation for the first client release.
// Freelancers, Projects (incl. Project Leader assignment), and Leads
// (incl. Quotations) are the modules of the ongoing revamp turned back on.
// Notifications is reachable via the bell (top-right) and its "View all
// notifications" link — no separate sidebar entry needed.
const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: null },
  { label: "Leads", href: "/leads", icon: Target, roles: ["super_admin", "admin", "project_manager"] },
  // Visible to everyone: admins/PMs get the full project list, everyone
  // else only sees projects they've been assigned as Project Leader on.
  { label: "Projects", href: "/projects", icon: FolderKanban, roles: null },
  { label: "Assignments", href: "/my-projects", icon: FolderKanban, roles: null, excludeRoles: ["super_admin", "admin"] },
  // { label: "Events", href: "/events", icon: CalendarDays, roles: ["super_admin", "admin", "project_manager"] },
  { label: "Post-Production", href: "/post-production", icon: Clapperboard, roles: null },
  { label: "Calendar", href: "/calendar", icon: CalendarRange, roles: null },
  { label: "Leave", href: "/leave", icon: Calendar, roles: null },
  // Everyone: employees get their own check-in + "My attendance" month view;
  // HR / super_admin also see the team section on the same page.
  { label: "Attendance", href: "/attendance", icon: Clock, roles: null },
  { label: "Employees", href: "/employees", icon: Users, roles: ["super_admin", "admin", "hr"] },
  { label: "Freelancers", href: "/freelancers", icon: UserRound, roles: ["super_admin", "admin", "project_manager"] },
  { label: "Finance", href: "/finance", icon: Wallet, roles: ["super_admin", "admin", "accountant"] },
  // Every employee can download their own payslips once salary is paid.
  { label: "Payslips", href: "/payslips", icon: FileText, roles: null },
  { label: "Analytics", href: "/analytics", icon: BarChart3, roles: ["super_admin", "admin", "project_manager"] },
  { label: "Devices", href: "/devices", icon: Monitor, roles: ["super_admin", "admin"] },
  { label: "Settings", href: "/settings", icon: Settings, roles: ["super_admin", "admin", "project_manager"] },
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.roles) return item.roles.includes(user?.role);
    if (item.excludeRoles) return !item.excludeRoles.includes(user?.role);
    return true;
  });

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 md:hidden">
        <Button variant="ghost" size="sm" onClick={() => setMobileOpen(true)} className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="aperture-ring rounded-full">
            <Image src="/logo-light.png" alt="The Rolling Stories" width={20} height={20} className="h-5 w-5 object-contain" />
          </div>
          <h1 className="font-heading text-sm font-semibold text-sidebar-foreground">The Rolling Stories</h1>
        </div>
        <NotificationBell uid={user?.uid} />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — fixed drawer on mobile, static column on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 transition-transform duration-200 md:sticky md:top-0 md:h-screen md:self-start md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-5 flex shrink-0 items-center justify-between px-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="aperture-ring rounded-full shrink-0">
              <Image src="/logo-light.png" alt="The Rolling Stories" width={28} height={28} className="h-7 w-7 object-contain" />
            </div>
            <h1 className="truncate font-heading text-base font-semibold text-sidebar-foreground">The Rolling Stories</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <nav className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 [scrollbar-width:thin]">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`relative flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary" />
                )}
                <item.icon className={`h-4 w-4 ${isActive ? "text-sidebar-primary" : ""}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-3 flex shrink-0 items-center gap-2 border-t border-sidebar-border pt-3">
          <AvatarInitials name={user?.name} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{user?.name}</p>
            <p className="truncate text-xs text-sidebar-foreground/60 capitalize">{user?.role?.replace("_", " ")}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} title="Logout" className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      {/* Desktop bell lives in its own slim strip above page content, not
          floating over it — several pages already have their own controls
          (Export CSV, FY selector, etc.) sitting in that exact corner, so a
          fixed-position bell would sit on top of them. This pushes content
          down by a small, consistent amount instead. Mobile doesn't need
          this: its top bar above already has the one bell, top-right. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="hidden shrink-0 items-center justify-end border-b border-border bg-background px-6 py-2 md:flex">
          <NotificationBell uid={user?.uid} />
        </div>
        <main className="flex-1 p-4 pt-20 md:p-6 md:pt-6">{children}</main>
      </div>
    </div>
  );
}