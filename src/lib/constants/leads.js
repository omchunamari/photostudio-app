// "Active stages" = every stage except the two terminal ones (Won/Lost) —
// used as the list-page filter's default (matches studioops' "Active
// stages (0)" default, which hides closed-out leads until you ask for them).
export const LEAD_STATUSES = [
  "New Inquiry",
  "Contacted",
  "Meeting Scheduled",
  "Quoted",
  "Won",
  "Lost",
];

export const ACTIVE_LEAD_STATUSES = LEAD_STATUSES.filter((s) => s !== "Won" && s !== "Lost");

export const PROJECT_TYPES = ["Wedding", "Pre-Wedding", "Engagement", "Commercial", "Portrait", "Event", "Other"];

export const LEAD_SOURCES = [
  "Referral",
  "Instagram",
  "Facebook",
  "Website",
  "Walk-in",
  "WhatsApp",
  "Google",
  "Other",
];

// Simplified: no more Sent / Approved / Rejected busywork steps.
// Draft -> Won (auto-creates the project) or Lost.
export const QUOTATION_STATUSES = ["Draft", "Won", "Lost"];

export const PAYMENT_MODES = [
  "Cash",
  "UPI",
  "Bank Transfer",
  "Cheque",
  "Card",
  "Other",
];

// Common milestone labels, offered as quick-picks in the payment form.
// Admin can still type a custom label.
export const PAYMENT_MILESTONE_PRESETS = ["Advance", "Milestone", "Balance"];

// Timeline activity types shown as tabs on the lead detail page, matching
// studioops' Call / WhatsApp / Message / Email / Meeting / Note log.
export const ACTIVITY_TYPES = [
  { value: "call", label: "Call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "message", label: "Message" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "note", label: "Note" },
];