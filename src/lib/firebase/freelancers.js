import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "./client";

/**
 * Freelancer doc shape (freelancers/{id}):
 * {
 *   name: string,
 *   phone: string,
 *   email: string | null,
 *   skill: string,        // one of FREELANCER_SKILLS — matches employee `role` values
 *   dayRate: number,       // per-day rate in INR, used later for expense tracking
 *   notes: string,
 *   status: "active" | "inactive",
 *   createdBy: uid,
 *   createdAt, updatedAt: ISO strings,
 * }
 *
 * Deliberately a separate top-level collection from `users` (employees):
 * freelancers have no Firebase Auth account and never log in, so there's no
 * need to route creation through an Admin SDK API route the way employees
 * do — plain client-SDK CRUD is enough, gated by firestore.rules (admin only).
 */

export async function getAllFreelancers() {
  const q = query(collection(db, "freelancers"), orderBy("name", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createFreelancer(data, createdByUid) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "freelancers"), {
    name: data.name.trim(),
    phone: data.phone?.trim() || "",
    email: data.email?.trim() || null,
    skill: data.skill,
    dayRate: Number(data.dayRate) || 0,
    notes: data.notes?.trim() || "",
    status: "active",
    createdBy: createdByUid,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateFreelancer(id, data) {
  await updateDoc(doc(db, "freelancers", id), {
    name: data.name.trim(),
    phone: data.phone?.trim() || "",
    email: data.email?.trim() || null,
    skill: data.skill,
    dayRate: Number(data.dayRate) || 0,
    notes: data.notes?.trim() || "",
    updatedAt: new Date().toISOString(),
  });
}

export async function setFreelancerStatus(id, status) {
  await updateDoc(doc(db, "freelancers", id), {
    status,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteFreelancer(id) {
  await deleteDoc(doc(db, "freelancers", id));
}