"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeviceGate from "@/components/DeviceGate";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { getLeadById } from "@/lib/firebase/leads";
import { getQuotationById } from "@/lib/firebase/quotations";
import QuoteBuilder from "@/components/quotes/QuoteBuilder";

function EditQuoteContent() {
  const { id, quoteId } = useParams();
  const { user } = useAuth();
  const [lead, setLead] = useState(null);
  const [quotation, setQuotation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getLeadById(id), getQuotationById(quoteId)]).then(([l, q]) => {
      setLead(l);
      setQuotation(q);
      setLoading(false);
    });
  }, [id, quoteId]);

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </AppShell>
    );
  }

  if (!lead || !quotation) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Quote not found.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <QuoteBuilder lead={lead} initialQuotation={quotation} currentUserUid={user.uid} />
    </AppShell>
  );
}

export default function EditQuotePage() {
  return (
    <ProtectedRoute allowedRoles={["super_admin", "admin", "project_manager"]}>
      <DeviceGate>
        <EditQuoteContent />
      </DeviceGate>
    </ProtectedRoute>
  );
}