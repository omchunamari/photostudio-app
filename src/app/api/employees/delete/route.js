export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { adminAuth, adminDb } = await import("@/lib/firebase/admin");

    // --- Verify the caller is signed in and is an admin/super_admin ---
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let callerUid;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      callerUid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const callerSnap = await adminDb.collection("users").doc(callerUid).get();
    const callerRole = callerSnap.exists ? callerSnap.data().role : null;
    if (callerRole !== "super_admin" && callerRole !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { uid } = await request.json();

    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const targetUser = await adminDb.collection("users").doc(uid).get();
    if (!targetUser.exists) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    if (targetUser.data().role === "super_admin") {
      const superAdminsSnap = await adminDb.collection("users").where("role", "==", "super_admin").get();
      if (superAdminsSnap.size <= 1) {
        return NextResponse.json({ error: "Cannot delete the last Super Admin account" }, { status: 400 });
      }
    }

    await adminAuth.deleteUser(uid);
    await adminDb.collection("users").doc(uid).delete();

    async function deleteCollectionDocsByField(collectionName, field, value) {
      const snap = await adminDb.collection(collectionName).where(field, "==", value).get();
      const batch = adminDb.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      if (!snap.empty) await batch.commit();
      return snap.size;
    }

    const deletedCounts = {
      attendance: await deleteCollectionDocsByField("attendance", "employeeUid", uid),
      leaveRequests: await deleteCollectionDocsByField("leaveRequests", "employeeUid", uid),
      devices: await deleteCollectionDocsByField("devices", "employeeUid", uid),
      attendanceRegularizations: await deleteCollectionDocsByField("attendanceRegularizations", "employeeUid", uid),
    };

    return NextResponse.json({ success: true, deletedCounts });
  } catch (error) {
    console.error("Delete employee error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete employee" }, { status: 500 });
  }
}