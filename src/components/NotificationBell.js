"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  getNotificationsForUser,
  getUnreadCount,
  markNotificationRead,
} from "@/lib/firebase/notifications";

export default function NotificationBell({ uid }) {
  const router = useRouter();
  const { user } = useAuth();
  const canViewProjectDetail = ["super_admin", "admin", "project_manager"].includes(user?.role);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  async function loadUnreadCount() {
    if (!uid) return;
    const count = await getUnreadCount(uid);
    setUnreadCount(count);
  }

  async function loadRecent() {
    if (!uid) return;
    const all = await getNotificationsForUser(uid);
    setNotifications(all.slice(0, 6));
  }

  useEffect(() => {
    loadUnreadCount();
    // Light polling so the badge updates without a full page reload.
    const interval = setInterval(loadUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [uid]);

  async function handleOpenChange(isOpen) {
    setOpen(isOpen);
    if (isOpen) {
      await loadRecent();
    }
  }

  function handleClickNotification(n) {
    setOpen(false);
    if (n.projectId && n.eventId) {
      router.push(
        canViewProjectDetail
          ? `/projects/${n.projectId}/events/${n.eventId}`
          : `/my-projects/${n.projectId}/${n.eventId}`
      );
    }
    if (!n.read) {
      markNotificationRead(n.id).catch(() => {});
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
      );
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="px-2 py-1.5 text-sm font-semibold text-slate-900">Notifications</div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">No notifications yet.</p>
        ) : (
          notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              onClick={() => handleClickNotification(n)}
              className="flex flex-col items-start gap-0.5 whitespace-normal py-2"
            >
              <span className={`text-sm ${n.read ? "font-normal text-slate-700" : "font-semibold text-slate-900"}`}>
                {n.title}
              </span>
              <span className="text-xs text-slate-500">{n.message}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setOpen(false);
            router.push("/notifications");
          }}
          className="justify-center text-sm font-medium text-slate-900"
        >
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}