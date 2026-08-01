"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";
import {
  getAllDevices,
  approveDevice,
  blockDevice,
  deleteDevice,
} from "@/lib/firebase/devices";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/ui/status-badge";
import { toast } from "sonner";

function DevicesContent() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadDevices() {
    setLoading(true);
    const list = await getAllDevices();
    setDevices(list);
    setLoading(false);
  }

  useEffect(() => {
    loadDevices();
  }, []);

  async function handleApprove(docId) {
    await approveDevice(docId);
    toast.success("Device approved");
    loadDevices();
  }

  async function handleBlock(docId) {
    await blockDevice(docId);
    toast.success("Device blocked");
    loadDevices();
  }

  async function handleDelete(docId) {
    await deleteDevice(docId);
    toast.success("Device removed");
    loadDevices();
  }

  return (
    <AppShell>
      <h2 className="mb-6 text-2xl font-semibold text-slate-900">Device Management</h2>
      {loading ? (
        <p className="text-sm text-slate-500">Loading devices...</p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-slate-500">No devices registered yet.</p>
      ) : (
        <div className="grid gap-3">
          {devices.map((device) => (
            <Card key={device.docId}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-slate-900">{device.deviceName}</p>
                  <p className="text-xs text-slate-500">{device.department}</p>
                  <StatusBadge status={device.status} className="mt-1" />
                </div>
                <div className="flex gap-2">
                  {device.status !== "approved" && (
                    <Button size="sm" onClick={() => handleApprove(device.docId)}>
                      Approve
                    </Button>
                  )}
                  {device.status !== "blocked" && (
                    <Button size="sm" variant="secondary" onClick={() => handleBlock(device.docId)}>
                      Block
                    </Button>
                  )}
                  <Button size="sm" variant="danger" onClick={() => handleDelete(device.docId)}>
                    Delete
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

export default function DevicesPage() {
  return (
    <ProtectedRoute allowedRoles={["super_admin", "admin"]}>
      <DevicesContent />
    </ProtectedRoute>
  );
}