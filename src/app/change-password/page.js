"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { changePassword } from "@/lib/firebase/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const PASSWORD_RULES = [
  { test: (pw) => pw.length >= 8, label: "At least 8 characters" },
  { test: (pw) => /[A-Z]/.test(pw), label: "One capital letter" },
  { test: (pw) => /[0-9]/.test(pw), label: "One number" },
  { test: (pw) => /[^A-Za-z0-9]/.test(pw), label: "One special character" },
];

function ChangePasswordContent() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const failedRules = PASSWORD_RULES.filter((rule) => !rule.test(password));
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  async function handleSubmit(e) {
    e.preventDefault();
    if (failedRules.length > 0) {
      toast.error("Password does not meet all requirements");
      return;
    }
    if (!passwordsMatch) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await changePassword(password);
      toast.success("Password updated successfully");
      router.push("/dashboard");
    } catch (err) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Set a New Password</CardTitle>
          <p className="text-sm text-slate-500">
            This is your first login. Please set a new password to continue.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
              )}
            </div>
            <ul className="flex flex-col gap-1 text-xs">
              {PASSWORD_RULES.map((rule) => {
                const passed = rule.test(password);
                return (
                  <li key={rule.label} className={passed ? "text-green-600" : "text-slate-400"}>
                    {passed ? "✓" : "○"} {rule.label}
                  </li>
                );
              })}
            </ul>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <ProtectedRoute>
      <ChangePasswordContent />
    </ProtectedRoute>
  );
}