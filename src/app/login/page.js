"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { loginWithEmail, requestPasswordReset } from "@/lib/firebase/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const profile = await loginWithEmail(email, password);
      toast.success("Login successful");
      if (profile.forcePasswordChange) {
        router.push("/change-password");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      toast.error(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetRequest(e) {
    e.preventDefault();
    setResetLoading(true);
    try {
      await requestPasswordReset(resetEmail);
      toast.success("Reset link sent. Check your inbox (and spam folder).");
      setResetOpen(false);
      setResetEmail("");
    } catch (err) {
      // Firebase reveals whether an email exists via error codes; keep the
      // message generic so we don't leak which emails are registered.
      toast.error("Couldn't send reset link. Check the email and try again.");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Image src="/logo.png" alt="The Rolling Stories" width={56} height={56} className="mb-1 h-14 w-14 object-contain" />
          <CardTitle className="text-lg sm:text-xl">The Rolling Stories</CardTitle>
          <p className="text-sm text-slate-500">Sign in to your account</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email);
                    setResetOpen(true);
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  Forgot password?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="w-[95vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleResetRequest} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="resetEmail">Email</Label>
              <Input
                id="resetEmail"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@therollingstories.com"
                required
              />
            </div>
            <p className="text-xs text-slate-500">
              We&apos;ll email you a link to reset your password.
            </p>
            <Button type="submit" disabled={resetLoading} className="w-full">
              {resetLoading ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}