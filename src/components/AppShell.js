"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import AvatarInitials from "@/components/ui/avatar-initials";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  Clock,
  Calendar,
  Monitor,
  LogOut,
  Menu,
  X,
} from "lucide-react";

// v1 scope: only these modules are active. Other pages/files (leads, projects,
// teams, editor-teams, notifications, my-projects) still exist in the codebase
// but are intentionally left out of navigation for the first client release.
const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: null },
  { label: "Leave", href: "/leave", icon: Calendar, roles: null },
  { label: "Attendance", href: "/attendance", icon: Clock, roles: ["super_admin", "admin", "hr"] },
  { label: "Employees", href: "/employees", icon: Users, roles: ["super_admin", "admin", "hr"] },
  { label: "Devices", href: "/devices", icon: Monitor, roles: ["super_admin", "admin"] },
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.roles) return item.roles.includes(user?.role);
    if (item.excludeRoles) return !item.excludeRoles.includes(user?.role);
    return true;
  });

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
        <Button variant="ghost" size="sm" onClick={() => setMobileOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="The Rolling Stories" width={20} height={20} className="h-5 w-5 object-contain" />
          <h1 className="text-sm font-bold text-slate-900">The Rolling Stories</h1>
        </div>
        <div className="w-8" />
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
        className={`fixed inset-y-0 left-0 z-50 w-60 shrink-0 border-r border-slate-200 bg-white p-4 flex flex-col transition-transform duration-200 md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between px-2">
          <div className="flex items-center gap-2 min-w-0">
            <Image src="/logo.png" alt="The Rolling Stories" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" />
            <h1 className="truncate text-base font-bold text-slate-900">The Rolling Stories</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
          <AvatarInitials name={user?.name} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{user?.name}</p>
            <p className="truncate text-xs text-slate-500 capitalize">{user?.role?.replace("_", " ")}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} title="Logout">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      <main className="flex-1 p-4 pt-20 md:p-6 md:pt-6">{children}</main>
    </div>
  );
}