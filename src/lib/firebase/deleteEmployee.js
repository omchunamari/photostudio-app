import { auth } from "./client";

export async function deleteEmployee(uid) {
  if (!auth.currentUser) throw new Error("Not authenticated.");
  const idToken = await auth.currentUser.getIdToken();

  const res = await fetch("/api/employees/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ uid }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to delete employee");
  return result;
}