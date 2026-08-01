"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";
import { checkOrRegisterDevice } from "@/lib/firebase/devices";

const ADMIN_ROLES = ["super_admin", "admin"];

export default function DeviceGate({ children }) {
  const { user } = useAuth();
  const [status, setStatus] = useState("checking"); // checking | approved | pending | blocked | skipped

  useEffect(() => {
    if (!user) return;

    if (ADMIN_ROLES.includes(user.role)) {
      setStatus("skipped"); // owners/admins bypass device check entirely
      return;
    }

    const fingerprint = getDeviceFingerprint();
    checkOrRegisterDevice(user.uid, fingerprint, `${user.name}'s PC`, user.department)
  .then((device) => setStatus(device.status))
  .catch((err) => {
    console.error("Device check failed:", err); // TEMP — remove after debugging
    setStatus("blocked");
  });
  }, [user]);

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Verifying device...</p>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <h2 className="text-lg font-semibold text-slate-900">Device Approval Pending</h2>
          <p className="mt-2 text-sm text-slate-500">
            Your admin needs to approve this device before you can access the system. Contact your admin.
          </p>
        </div>
      </div>
    );
  }

  if (status === "blocked") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <h2 className="text-lg font-semibold text-red-600">Access Denied</h2>
          <p className="mt-2 text-sm text-slate-500">
            This device has been blocked. Contact your admin if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return children; // approved or skipped (admin)
}