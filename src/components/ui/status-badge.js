import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  active: "bg-emerald-100 text-emerald-800",
  inactive: "bg-stone-100 text-stone-600",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  blocked: "bg-rose-100 text-rose-800",
  late: "bg-orange-100 text-orange-800",
  absent: "bg-rose-100 text-rose-800",
  present: "bg-emerald-100 text-emerald-800",
  on_leave: "bg-stone-200 text-stone-700",
  resigned: "bg-stone-100 text-stone-500",
  Paid: "bg-stone-200 text-stone-700",
  Sick: "bg-rose-100 text-rose-700",
  New: "bg-stone-100 text-stone-700",
  "New Inquiry": "bg-sky-100 text-sky-800",
  Contacted: "bg-stone-200 text-stone-700",
  "Meeting Scheduled": "bg-amber-100 text-amber-800",
  Quoted: "bg-amber-100 text-amber-800",
  Won: "bg-emerald-100 text-emerald-800",
  Lost: "bg-rose-100 text-rose-800",
  auto_leave: "bg-amber-100 text-amber-800",
  Draft: "bg-stone-100 text-stone-600",
  Sent: "bg-stone-200 text-stone-700",
  // Post-production task pipeline
  "Not Started": "bg-stone-100 text-stone-600",
  "In Progress": "bg-amber-100 text-amber-800",
  "In Review": "bg-stone-200 text-stone-700",
  "Revision Needed": "bg-rose-100 text-rose-800",
  Completed: "bg-emerald-100 text-emerald-800",
  // Task priority
  Low: "bg-stone-100 text-stone-600",
  Medium: "bg-amber-100 text-amber-800",
  High: "bg-orange-100 text-orange-800",
  Urgent: "bg-rose-100 text-rose-800"
};

const STATUS_LABELS = {
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  on_leave: "On Leave",
  Paid: "Paid Leave",
  Sick: "Sick Leave",
  auto_leave: "Auto-Marked Leave"
};

export default function StatusBadge({ status, children, className }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium capitalize whitespace-nowrap",
        STATUS_STYLES[status] || "bg-stone-100 text-stone-700",
        className
      )}
    >
      {children || STATUS_LABELS[status] || status}
    </span>
  );
}