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

    const body = await request.json();
    const { email, password, name, phone, role, department, employeeId, joiningDate } = body;

    if (!email || !password || !name || !role || !department) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Only a super_admin can create another super_admin
    if (role === "super_admin" && callerRole !== "super_admin") {
      return NextResponse.json({ error: "Only a super admin can create a super admin" }, { status: 403 });
    }

    // 1. Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
    });

    // 2. Create Firestore profile
    const now = new Date().toISOString();
    await adminDb.collection("users").doc(userRecord.uid).set({
      employeeId: employeeId || `EMP-${Date.now()}`,
      name,
      email,
      phone: phone || "",
      photoUrl: null,
      role,
      department,
      joiningDate: joiningDate || now,
      bloodGroup: null,
      address: null,
      emergencyContact: null,
      status: "active",
      isMobileAllowed: role === "super_admin" || role === "admin",
      forcePasswordChange: true,
      leaveBalance: { Paid: 24, Sick: 0 },
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ uid: userRecord.uid, success: true });
  } catch (error) {
    console.error("Create employee error:", error);
    return NextResponse.json({ error: error.message || "Failed to create employee" }, { status: 500 });
  }
}