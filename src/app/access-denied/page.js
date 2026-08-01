import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function AccessDeniedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Access denied</CardTitle>
          <p className="text-sm text-slate-500">
            This app can only be accessed from an approved office network.
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            If you believe this is a mistake, please contact your admin.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
