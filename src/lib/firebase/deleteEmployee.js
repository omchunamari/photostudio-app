import { auth } from "./client";

/**
 * Deletes an employee via the admin API. The server refuses (409) when the
 * person has finance records: err.code is "FINANCE_PENDING" (money still owed —
 * can't be forced) or "FINANCE_HISTORY" (retry with { force: true } to delete
 * anyway); err.blocking / err.history list what was found.
 */
export async function deleteEmployee(uid, { force = false } = {}) {
  if (!auth.currentUser) throw new Error("Not authenticated.");
  const idToken = await auth.currentUser.getIdToken();

  const res = await fetch("/api/employees/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ uid, force }),
  });
  const result = await res.json();
  if (!res.ok) {
    const err = new Error(result.error || "Failed to delete employee");
    err.code = result.code || null;
    err.blocking = result.blocking || [];
    err.history = result.history || [];
    throw err;
  }
  return result;
}
