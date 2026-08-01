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
    const rows = Array.isArray(body.employees) ? body.employees : [];

    if (rows.length === 0) {
      return NextResponse.json({ error: "No employees provided" }, { status: 400 });
    }
    if (rows.length > 200) {
      return NextResponse.json({ error: "Max 200 employees per bulk upload" }, { status: 400 });
    }

    const results = [];

    for (const row of rows) {
      const { email, password, name, phone, role, department, employeeId, joiningDate } = row;

      if (!email || !password || !name || !role || !department) {
        results.push({ email: email || "(missing)", success: false, error: "Missing required fields" });
        continue;
      }

      if (role === "super_admin" && callerRole !== "super_admin") {
        results.push({ email, success: false, error: "Only a super admin can create a super admin" });
        continue;
      }

      try {
        const userRecord = await adminAuth.createUser({
          email,
          password,
          displayName: name,
        });

        const now = new Date().toISOString();
        await adminDb.collection("users").doc(userRecord.uid).set({
          employeeId: employeeId || `EMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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
          leaveBalance: { Paid: 0, Sick: 0 },
          createdAt: now,
          updatedAt: now,
        });

        results.push({ email, uid: userRecord.uid, success: true });
      } catch (error) {
        results.push({ email, success: false, error: error.message || "Failed to create" });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    return NextResponse.json({ results, succeeded, failed: results.length - succeeded });
  } catch (error) {
    console.error("Bulk create employees error:", error);
    return NextResponse.json({ error: error.message || "Failed to bulk create employees" }, { status: 500 });
  }
}
