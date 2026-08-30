"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { getLeadById } from "@/lib/firebase/leads";
import QuoteBuilder from "@/components/quotes/QuoteBuilder";

function NewQuoteContent() {
  const { id } = useParams();
  const { user } = useAuth();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeadById(id).then((l) => {
      setLead(l);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </AppShell>
    );
  }

  if (!lead) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Lead not found.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <QuoteBuilder lead={lead} initialQuotation={null} currentUserUid={user.uid} />
    </AppShell>
  );
}

export default function NewQuotePage() {
  return (
    <ProtectedRoute allowedRoles={["super_admin", "admin", "project_manager"]}>
      <DeviceGate>
        <NewQuoteContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}