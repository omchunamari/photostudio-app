import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./client";

/** Checks if a device is registered+approved for this employee. Auto-creates a pending record if none exists. */
export async function checkOrRegisterDevice(employeeUid, fingerprint, deviceName, department) {
  const deviceId = `${employeeUid}_${fingerprint}`;
  const deviceRef = doc(db, "devices", deviceId);
  const snap = await getDoc(deviceRef);

  if (snap.exists()) {
    return snap.data();
  }

  const newDevice = {
    id: deviceId,
    deviceName: deviceName || "Unnamed Device",
    deviceFingerprint: fingerprint,
    employeeUid,
    department,
    registeredBy: employeeUid,
    status: "pending",
    createdAt: new Date().toISOString(),
    approvedAt: null,
  };

  await setDoc(deviceRef, newDevice);
  return newDevice;
}

export async function getAllDevices() {
  const snap = await getDocs(collection(db, "devices"));
  return snap.docs.map((d) => ({ docId: d.id, ...d.data() }));
}

export async function getDevicesForEmployee(employeeUid) {
  const q = query(collection(db, "devices"), where("employeeUid", "==", employeeUid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ docId: d.id, ...d.data() }));
}

export async function approveDevice(deviceId) {
  await updateDoc(doc(db, "devices", deviceId), {
    status: "approved",
    approvedAt: new Date().toISOString(),
  });
}

export async function blockDevice(deviceId) {
  await updateDoc(doc(db, "devices", deviceId), { status: "blocked" });
}

export async function renameDevice(deviceId, newName) {
  await updateDoc(doc(db, "devices", deviceId), { deviceName: newName });
}

export async function deleteDevice(deviceId) {
  await deleteDoc(doc(db, "devices", deviceId));
}