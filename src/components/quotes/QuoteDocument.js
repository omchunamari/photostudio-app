"use client";

import Image from "next/image";
import { formatDateIST, formatDateTime12 } from "@/lib/dateIST";

const fmtINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const fmtDate = (iso) => formatDateIST(iso, "");
// Was toLocaleDateString() with hour/minute options bolted on, which silently
// dropped the time in some engines and rendered 24-hour in others.
const fmtDateTime = (iso) => formatDateTime12(iso, "");

// Whole document renders in Times New Roman, per client request — set once
// at the root so every child inherits it (no per-element font-serif utility
// needed/used anymore).
const DOC_FONT = { fontFamily: '"Times New Roman", Times, serif' };

export default function QuoteDocument({ quotation, orgSettings }) {
  const q = quotation;
  const paymentDetails = {
    accountName: q.paymentDetails?.accountName || orgSettings?.paymentDetails?.accountName || "",
    bank: q.paymentDetails?.bank || orgSettings?.paymentDetails?.bank || "",
    accountNumber:
      q.paymentDetails?.accountNumber || orgSettings?.paymentDetails?.accountNumber || "",
    ifsc: q.paymentDetails?.ifsc || orgSettings?.paymentDetails?.ifsc || "",
    upi: q.paymentDetails?.upi || orgSettings?.paymentDetails?.upi || "",
  };
  const hasPaymentDetails = Object.values(paymentDetails).some(Boolean);
  const hasClientResponse = q.status === "accepted" || q.status === "declined";

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-neutral-900 print:p-0" style={DOC_FONT}>
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-900">
          <Image
            src="/logo-light.png"
            alt={orgSettings?.businessName || "Logo"}
            width={56}
            height={56}
            className="h-full w-full object-contain p-1.5"
          />
        </div>
        <div>
          <p className="text-lg font-semibold">{orgSettings?.businessName || "Your Studio"}</p>
          {orgSettings?.tagline && (
            <p className="text-sm text-neutral-500">{orgSettings.tagline}</p>
          )}
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-neutral-200 p-6">
        <div className="mb-4 grid grid-cols-2 items-start gap-4">
          <div className="text-left">
            <p className="text-sm text-neutral-500">
              {q.quoteNumber} · {fmtDate(q.issueDate).toUpperCase()}
            </p>
            <h1 className="text-3xl font-semibold">Quote</h1>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-neutral-400">For</p>
            <p className="font-medium">{q.clientName}</p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {(q.lineItems || []).map((li) => (
            <div key={li.id} className="rounded-lg border border-neutral-200 p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{li.name}</h3>
                <p className="text-lg font-semibold">
                  {fmtINR((Number(li.qty) || 0) * (Number(li.unitPrice) || 0))}
                </p>
              </div>

              {(li.events || []).length > 0 && (
                <>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
                    Events
                  </p>
                  <div className="mb-4 divide-y divide-neutral-100 border-y border-neutral-100">
                    {li.events.map((ev) => (
                      <div
                        key={ev.id}
                        className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 py-2 text-sm"
                      >
                        <span className="font-medium">{ev.name}</span>
                        <span className="text-left text-neutral-500">{fmtDate(ev.date)}</span>
                        <span className="text-left text-neutral-500">{ev.shift}</span>
                        <span className="text-right text-neutral-500">Team {ev.teamSize}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {li.descriptionHtml && (
                <>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
                    Description
                  </p>
                  <div
                    className="mb-4 text-left text-sm leading-relaxed [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: li.descriptionHtml }}
                  />
                </>
              )}

              {(li.deliverables || []).filter(Boolean).length > 0 && (
                <>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
                    Deliverables
                  </p>
                  <ul className="mb-4 list-disc pl-5 text-left text-sm">
                    {li.deliverables.filter(Boolean).map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </>
              )}

              {li.addonsHtml && (
                <>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
                    Add-ons / Bonuses
                  </p>
                  <div
                    className="text-left text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: li.addonsHtml }}
                  />
                </>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs">
            <div className="flex items-center justify-between border-t border-neutral-200 py-1.5 text-sm text-neutral-500">
              <span className="text-left">Subtotal</span>
              <span className="text-right">{fmtINR(q.subtotal)}</span>
            </div>
            {q.discountAmount > 0 && (
              <div className="flex items-center justify-between py-1.5 text-sm text-neutral-500">
                <span className="text-left">Discount{q.discountLabel ? ` (${q.discountLabel})` : ""}</span>
                <span className="text-right">-{fmtINR(q.discountAmount)}</span>
              </div>
            )}
            {q.gstAmount > 0 && (
              <div className="flex items-center justify-between py-1.5 text-sm text-neutral-500">
                <span className="text-left">GST</span>
                <span className="text-right">{fmtINR(q.gstAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-neutral-200 py-1.5 text-lg font-semibold">
              <span className="text-left">Total</span>
              <span className="text-right">{fmtINR(q.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {(q.installments || []).length > 0 && (
        <div className="mb-6 rounded-xl border border-neutral-200 p-6">
          <h3 className="mb-3 text-lg font-semibold">Payment Schedule</h3>
          <div className="divide-y divide-neutral-100">
            {q.installments.map((inst) => (
              <div
                key={inst.id}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 py-2 text-sm"
              >
                <span className="font-medium">{inst.label}</span>
                <span className="text-left text-neutral-500">{fmtDate(inst.dueDate)}</span>
                <span className="text-right font-medium">{fmtINR(inst.amount)}</span>
                <span
                  className={`justify-self-end rounded-full px-2 py-0.5 text-xs font-medium ${
                    inst.paid
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {inst.paid ? "Paid" : "Unpaid"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {q.contractHtml && (
        <div className="mb-6 rounded-xl border border-neutral-200 p-6">
          <h3 className="mb-3 text-lg font-semibold">
            Contract{q.contractTemplateName ? ` · ${q.contractTemplateName}` : ""}
          </h3>
          <div
            className="flex flex-col gap-3 text-left text-sm leading-relaxed [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: q.contractHtml }}
          />
        </div>
      )}

      {hasPaymentDetails && (
        <div className="mb-6 rounded-xl border border-neutral-200 p-6">
          <h3 className="mb-3 text-lg font-semibold">Payment Details</h3>
          <div className="grid grid-cols-2 gap-3 text-left text-sm">
            {paymentDetails.accountName && (
              <p>
                <span className="text-neutral-400">Account name: </span>
                {paymentDetails.accountName}
              </p>
            )}
            {paymentDetails.bank && (
              <p>
                <span className="text-neutral-400">Bank: </span>
                {paymentDetails.bank}
              </p>
            )}
            {paymentDetails.accountNumber && (
              <p>
                <span className="text-neutral-400">Account number: </span>
                {paymentDetails.accountNumber}
              </p>
            )}
            {paymentDetails.ifsc && (
              <p>
                <span className="text-neutral-400">IFSC: </span>
                {paymentDetails.ifsc}
              </p>
            )}
            {paymentDetails.upi && (
              <p>
                <span className="text-neutral-400">UPI ID: </span>
                {paymentDetails.upi}
              </p>
            )}
          </div>
        </div>
      )}

      {q.notesHtml && (
        <div className="mb-6">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Notes
          </h3>
          <div
            className="text-left text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: q.notesHtml }}
          />
        </div>
      )}

      {hasClientResponse && (
        <div
          className={`mb-6 rounded-xl border p-6 ${
            q.status === "accepted"
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <h3
            className={`mb-1 text-lg font-semibold ${
              q.status === "accepted" ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {q.status === "accepted" ? "Accepted by client" : "Declined by client"}
          </h3>
          {q.respondedAt && (
            <p className="mb-2 text-xs text-neutral-500">{fmtDateTime(q.respondedAt)}</p>
          )}
          {q.clientResponseNote && (
            <p className="text-left text-sm leading-relaxed whitespace-pre-wrap">
              {q.clientResponseNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}