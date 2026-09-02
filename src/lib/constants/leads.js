// Full sales pipeline, per the TRS panel spec. "Active stages" = every
// stage except the terminal ones (Converted/Lost/No Response) — used as
// the list-page filter's default, which hides closed-out leads until you
// ask for them.
//
// NOTE: this replaces the older 6-stage list (New Inquiry, Contacted,
// Meeting Scheduled, Quoted, Won, Lost). Any lead documents already
// sitting in Firestore under the old "Quoted" or "Won" values keep
// working — the status dropdown just won't have an old value
// highlighted until you pick a new stage for that lead. There's no
// automatic migration of existing data.
export const LEAD_STATUSES = [
  "New Inquiry",
  "Call Pending",
  "Contacted",
  "Meeting Scheduled",
  "Quotation Sent",
  "Follow Up",
  "Negotiation",
  "Booking Pending",
  "Converted",
  "Lost",
  "No Response",
];

const TERMINAL_LEAD_STATUSES = ["Converted", "Lost", "No Response"];
export const ACTIVE_LEAD_STATUSES = LEAD_STATUSES.filter((s) => !TERMINAL_LEAD_STATUSES.includes(s));

// Priority — three fixed options, shown as its own column on the leads list.
export const LEAD_PRIORITIES = ["Hot", "Warm", "Cold"];

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