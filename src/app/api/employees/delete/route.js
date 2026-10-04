export const runtime = "nodejs";

import { NextResponse } from "next/server";

async function financeFootprint(adminDb, uid) {
  const [payrolls, advances, allowances, txs, salary] = await Promise.all([
    adminDb.collection("payrolls").where("employeeUid", "==", uid).get(),
    adminDb.collection("employeeAdvances").where("employeeUid", "==", uid).get(),
    adminDb.collection("allowances").where("employeeUid", "==", uid).get(),
    adminDb.collection("financeTransactions").where("personUid", "==", uid).limit(1).get(),
    adminDb.collection("employeeFinance").doc(uid).get(),
  ]);
  const inr = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
  const blocking = [];
  const history = [];

  const unpaid = payrolls.docs.map((d) => d.data()).filter((p) => p.status === "processed");
  if (unpaid.length) {
    const total = unpaid.reduce((s, p) => s + (Number(p.netSalary) || 0), 0);
    blocking.push(`Unpaid salary: ${unpaid.length} processed month${unpaid.length === 1 ? "" : "s"} (${inr(total)})`);
  }
  const owed = advances.docs
    .map((d) => d.data())
    .reduce((s, a) => s + Math.max(0, (Number(a.amount) || 0) - (Number(a.recovered) || 0)), 0);
  if (owed > 0) blocking.push(`Outstanding salary advance / staff loan: ${inr(owed)}`);
  const openAllowances = allowances.docs.map((d) => d.data()).filter((a) => a.status === "open");
  if (openAllowances.length) blocking.push(`${openAllowances.length} allowance${openAllowances.length === 1 ? "" : "s"} not yet settled`);

  const paid = payrolls.docs.filter((d) => d.data().status === "paid").length;
  if (paid) history.push(`${paid} paid salary month${paid === 1 ? "" : "s"} (payslips)`);
  if (salary.exists) history.push("Salary structure and increment history");
  if (!txs.empty) history.push("Expenses / payments tagged to them in the ledger");
  if (advances.size && owed <= 0) history.push("Recovered advances / loans");
  if (allowances.size && !openAllowances.length) history.push("Settled allowances");
  return { blocking, history };
}

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

    const { uid, force } = await request.json();

    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const targetUser = await adminDb.collection("users").doc(uid).get();
    if (!targetUser.exists) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    if (targetUser.data().role === "super_admin" && callerRole !== "super_admin") {
      return NextResponse.json({ error: "Only a super admin can delete a super admin" }, { status: 403 });
    }
    if (uid === callerUid) {
      return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 });
    }

    if (targetUser.data().role === "super_admin") {
      const superAdminsSnap = await adminDb.collection("users").where("role", "==", "super_admin").get();
      if (superAdminsSnap.size <= 1) {
        return NextResponse.json({ error: "Cannot delete the last Super Admin account" }, { status: 400 });
      }
    }

    // --- Finance safety check ---
    // Deleting wipes attendance/leave and the login, but finance records stay
    // behind. Money still owed in either direction blocks the delete outright;
    // plain history needs an explicit "delete anyway" (force). Deactivating is
    // the recommended path for anyone who has left.
    const finance = await financeFootprint(adminDb, uid);
    if (finance.blocking.length) {
      return NextResponse.json(
        {
          error: "This employee still has money pending in Finance. Settle it first, or deactivate them instead.",
          code: "FINANCE_PENDING",
          blocking: finance.blocking,
          history: finance.history,
        },
        { status: 409 }
      );
    }
    if (finance.history.length && !force) {
      return NextResponse.json(
        {
          error: "This employee has finance history. Deactivating keeps it all reachable.",
          code: "FINANCE_HISTORY",
          blocking: [],
          history: finance.history,
        },
        { status: 409 }
      );
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