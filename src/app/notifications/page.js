"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  subscribeToNotifications,
  markNotificationRead,
  markAllRead,
  deleteNotification,
  clearAllNotifications,
} from "@/lib/firebase/notifications";
import { toast } from "sonner";
import { X, Trash2 } from "lucide-react";

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationsContent() {
  const { user } = useAuth();
  const canViewProjectDetail = ["super_admin", "admin", "project_manager"].includes(user?.role);
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    // Live, not a one-shot fetch: updates the instant a notification is
    // created, read, or deleted — from this tab, another tab, or anything
    // else in the app that fires one — so nothing here ever needs a
    // manual refetch or a page reload to catch up.
    const unsubscribe = subscribeToNotifications(user.uid, (list) => {
      setNotifications(list);
      setLoading(false);
    });
    return unsubscribe;
  }, [user.uid]);

  async function handleMarkAllRead() {
    setMarking(true);
    try {
      await markAllRead(user.uid);
      toast.success("All notifications marked as read");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setMarking(false);
    }
  }

  async function handleClearAll() {
    if (!confirm("Clear all notifications? This can't be undone.")) return;
    setClearing(true);
    try {
      await clearAllNotifications(user.uid);
      toast.success("Notifications cleared");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setClearing(false);
    }
  }

  async function handleDeleteOne(e, id) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteNotification(id);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  function handleClick(n) {
    if (n.projectId && n.eventId) {
      router.push(
        canViewProjectDetail
          ? `/projects/${n.projectId}/events/${n.eventId}`
          : `/my-projects/${n.projectId}/${n.eventId}`
      );
    }
    if (!n.read) {
      markNotificationRead(n.id).catch(() => {});
    }
  }

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">Notifications</h2>
        <div className="flex items-center gap-2">
          {hasUnread && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={marking}>
              {marking ? "Marking..." : "Mark all read"}
            </Button>
          )}
          {notifications.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              disabled={clearing}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> {clearing ? "Clearing..." : "Clear all"}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : notifications.length === 0 ? (
        <p className="text-sm text-slate-500">No notifications yet.</p>
      ) : (
        <div className="grid max-w-2xl gap-2">
          {notifications.map((n) => (
            <Card
              key={n.id}
              onClick={() => handleClick(n)}
              className={`cursor-pointer transition hover:border-slate-300 ${
                n.read ? "" : "border-slate-900 bg-slate-50"
              }`}
            >
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className={`text-sm ${n.read ? "font-normal text-slate-700" : "font-semibold text-slate-900"}`}>
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">{n.message}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteOne(e, n.id)}
                    disabled={deletingId === n.id}
                    title="Remove this notification"
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-destructive disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export default function NotificationsPage() {
  return (
    <ProtectedRoute>
      <DeviceGate>
        <NotificationsContent />
      </DeviceGate> 
    </ProtectedRoute>
  );
}