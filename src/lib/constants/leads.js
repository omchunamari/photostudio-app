export const LEAD_STATUSES = [
  "New",
  "Contacted",
  "Meeting Scheduled",
  "Quoted",
  "Won",
  "Lost",
];

export const PROJECT_TYPES = ["Wedding", "Commercial"];

export const LEAD_SOURCES = [
  "Referral",
  "Instagram",
  "Website",
  "Walk-in",
  "WhatsApp",
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