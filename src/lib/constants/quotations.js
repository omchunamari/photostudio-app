// Quote status lifecycle. Purely informational tracking of where the quote
// is in the client's hands — it no longer drives project creation (see
// "Convert to Project" on the lead itself, which is independent).
export const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined", "expired"];

export const QUOTE_STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

export const QUOTE_STATUS_STYLES = {
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-red-50 text-red-700 border-red-200",
  expired: "bg-amber-50 text-amber-800 border-amber-200",
};

export const DISCOUNT_TYPES = [
  { value: "flat", label: "₹" },
  { value: "percent", label: "%" },
];

export const SHIFT_OPTIONS = ["Full Day", "Half Day", "Custom"];

export const DEFAULT_GST_PERCENT = 0;

// Empty scaffolding for a brand new blank line item / event / installment.
export function blankLineItem() {
  return {
    id: `li_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    events: [blankEvent()],
    descriptionHtml: "",
    deliverables: [""],
    addonsHtml: "",
    qty: 1,
    unitPrice: 0,
  };
}

export function blankEvent() {
  return {
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    date: "",
    location: "",
    teamSize: "",
    shift: "Full Day",
  };
}

export function blankInstallment(label = "Installment") {
  return {
    id: `in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label,
    dueDate: "",
    amount: 0,
  };
}