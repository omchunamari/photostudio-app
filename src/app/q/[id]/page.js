"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getQuotationById, submitClientQuoteResponse } from "@/lib/firebase/quotations";
import { getOrgQuoteSettings } from "@/lib/firebase/quoteSettings";
import QuoteDocument from "@/components/quotes/QuoteDocument";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Download, Eye, Check, X, Loader2 } from "lucide-react";

export default function PublicQuotePage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const isPreview = searchParams.get("preview") === "1";

  const [quotation, setQuotation] = useState(null);
  const [orgSettings, setOrgSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Accept/reject flow
  const [choice, setChoice] = useState(null); // "accepted" | "declined" | null
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const [q, org] = await Promise.all([getQuotationById(id), getOrgQuoteSettings()]);
      if (!q) {
        setNotFound(true);
      } else {
        setQuotation(q);
        document.title = `${q.quoteNumber} · Quote`;
      }
      setOrgSettings(org);
      setLoading(false);
    })();
  }, [id]);

  const alreadyResponded = quotation?.status === "accepted" || quotation?.status === "declined";

  async function handleSubmitResponse() {
    if (!choice) return;
    setSubmitting(true);
    setError("");
    try {
      await submitClientQuoteResponse(id, choice, note.trim());
      setQuotation((q) => ({
        ...q,
        status: choice,
        clientResponseNote: note.trim(),
        respondedAt: new Date().toISOString(),
      }));
    } catch (e) {
      setError("Something went wrong submitting your response. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="p-10 text-center text-sm text-neutral-500">Loading...</div>;
  }

  if (notFound) {
    return (
      <div className="p-10 text-center text-sm text-neutral-500">
        This quote link is invalid or has been removed.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      {isPreview && (
        <div className="mx-auto mb-4 flex max-w-3xl items-center gap-2 rounded-md bg-blue-50 px-4 py-2 text-sm text-blue-700 print:hidden">
          <Eye className="h-4 w-4" />
          Preview — this is what your client sees. Opening it this way is not recorded as a client view.
        </div>
      )}
      <div className="mx-auto mb-4 flex max-w-3xl justify-end px-6 print:hidden">
        <Button onClick={() => window.print()}>
          <Download className="h-4 w-4" /> Download PDF
        </Button>
      </div>
      <QuoteDocument quotation={quotation} orgSettings={orgSettings} />

      {/* Accept / reject — hidden once the client has already responded, and
          hidden in staff preview mode so it can't be used to spoof a response. */}
      {!isPreview && !alreadyResponded && (
        <div className="mx-auto mt-6 max-w-3xl px-6 print:hidden">
          <div className="rounded-xl border border-neutral-200 bg-white p-6">
            <h3 className="mb-1 text-lg font-semibold">Your response</h3>
            <p className="mb-4 text-sm text-neutral-500">
              Let us know if you&rsquo;d like to go ahead with this quote. You can add a note below —
              it&rsquo;s optional either way.
            </p>

            <div className="mb-4 flex gap-2">
              <Button
                type="button"
                variant={choice === "accepted" ? "default" : "outline"}
                className={choice === "accepted" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                onClick={() => setChoice("accepted")}
              >
                <Check className="h-4 w-4" /> Accept
              </Button>
              <Button
                type="button"
                variant={choice === "declined" ? "default" : "outline"}
                className={choice === "declined" ? "bg-red-600 hover:bg-red-700" : ""}
                onClick={() => setChoice("declined")}
              >
                <X className="h-4 w-4" /> Reject
              </Button>
            </div>

            {choice && (
              <>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={
                    choice === "accepted"
                      ? "Anything you'd like us to know before we begin? (optional)"
                      : "Let us know why, so we can follow up if useful (optional)"
                  }
                  className="mb-3"
                  rows={4}
                />
                {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
                <Button onClick={handleSubmitResponse} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {submitting
                    ? "Submitting..."
                    : choice === "accepted"
                    ? "Confirm acceptance"
                    : "Confirm rejection"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {!isPreview && alreadyResponded && (
        <div className="mx-auto mt-6 max-w-3xl px-6 print:hidden">
          <div
            className={`rounded-xl border p-4 text-sm ${
              quotation.status === "accepted"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {quotation.status === "accepted"
              ? "You've already accepted this quote. Thanks!"
              : "You've already declined this quote."}
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body {
            background: white;
          }
        }
      `}</style>
    </div>
  );
}