"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  subscribeToNotifications,
  markNotificationRead,
  clearAllNotifications,
} from "@/lib/firebase/notifications";

export default function NotificationBell({ uid }) {
  const router = useRouter();
  const { user } = useAuth();
  const canViewProjectDetail = ["super_admin", "admin", "project_manager"].includes(user?.role);
  // The full live list, not just what's currently shown — unreadCount has
  // to reflect everything, not only the 6 most recent, or the badge would
  // undercount once there's more than 6 unread.
  const [allNotifications, setAllNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!uid) return;
    // Live, not polled: fires immediately with the current list, then again
    // the instant anything changes — a new assignment lands, a teammate's
    // action creates one, you mark something read in another tab. No
    // reload, no fixed refresh interval to wait out.
    const unsubscribe = subscribeToNotifications(uid, setAllNotifications);
    return unsubscribe;
  }, [uid]);

  const unreadCount = allNotifications.filter((n) => !n.read).length;
  const notifications = allNotifications.slice(0, 6);

  function handleClickNotification(n) {
    setOpen(false);
    if (n.projectId && n.eventId) {
      router.push(
        canViewProjectDetail
          ? `/projects/${n.projectId}/events/${n.eventId}`
          : `/my-projects/${n.projectId}/${n.eventId}`
      );
    }
    // No optimistic local update needed — Firestore applies this write to
    // the listener's snapshot immediately (before the server round-trip
    // completes), so the live subscription above picks it up on its own.
    if (!n.read) {
      markNotificationRead(n.id).catch(() => {});
    }
  }

  async function handleClearAll(e) {
    e.stopPropagation();
    if (!uid || clearing || notifications.length === 0) return;
    if (!confirm("Clear all notifications? This can't be undone.")) return;
    setClearing(true);
    try {
      await clearAllNotifications(uid);
    } catch {
      // Bell dropdown is a lightweight surface — a failed clear just
      // leaves the list as-is; the full /notifications page is the
      // place to retry if this keeps happening.
    } finally {
      setClearing(false);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
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
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-semibold text-slate-900">Notifications</span>
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              disabled={clearing}
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" /> {clearing ? "Clearing..." : "Clear all"}
            </button>
          )}
        </div>
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