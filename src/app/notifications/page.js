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
  getNotificationsForUser,
  markNotificationRead,
  markAllRead,
} from "@/lib/firebase/notifications";
import { toast } from "sonner";

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

  async function load() {
    setLoading(true);
    const list = await getNotificationsForUser(user.uid);
    setNotifications(list);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [user.uid]);

  async function handleMarkAllRead() {
    setMarking(true);
    try {
      await markAllRead(user.uid);
      toast.success("All notifications marked as read");
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setMarking(false);
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
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
      );
    }
  }

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">Notifications</h2>
        {hasUnread && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={marking}>
            {marking ? "Marking..." : "Mark all read"}
          </Button>
        )}
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
                <span className="shrink-0 text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
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