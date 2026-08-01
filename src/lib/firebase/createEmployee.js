import { auth } from "./client";

export async function createEmployee(data) {
  if (!auth.currentUser) throw new Error("Not authenticated.");
  const idToken = await auth.currentUser.getIdToken();

  const res = await fetch("/api/employees/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to create employee");
  return result;
}

export async function bulkCreateEmployees(employees) {
  if (!auth.currentUser) throw new Error("Not authenticated.");
  const idToken = await auth.currentUser.getIdToken();

  const res = await fetch("/api/employees/bulk-create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ employees }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to bulk create employees");
  return result;
}