import {
  collection,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { db } from "./client";

export async function getAllEmployees() {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export async function updateEmployee(uid, updates) {
  await updateDoc(doc(db, "users", uid), {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function deactivateEmployee(uid) {
  await updateDoc(doc(db, "users", uid), {
    status: "inactive",
    updatedAt: new Date().toISOString(),
  });
}

export async function activateEmployee(uid) {
  await updateDoc(doc(db, "users", uid), {
    status: "active",
    updatedAt: new Date().toISOString(),
  });
}

export async function updateLeaveBalance(uid, leaveBalance) {
  await updateDoc(doc(db, "users", uid), {
    leaveBalance,
    updatedAt: new Date().toISOString(),
  });
}