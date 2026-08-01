import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-slate-100 text-slate-600",
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  blocked: "bg-red-100 text-red-700",
  late: "bg-orange-100 text-orange-700",
  absent: "bg-red-100 text-red-700",
  present: "bg-green-100 text-green-700",
  on_leave: "bg-blue-100 text-blue-700",
  resigned: "bg-slate-100 text-slate-500",
  Paid: "bg-blue-100 text-blue-700",
  Sick: "bg-pink-100 text-pink-700",
  New: "bg-slate-100 text-slate-700",
  Contacted: "bg-blue-100 text-blue-700",
  "Meeting Scheduled": "bg-purple-100 text-purple-700",
  Quoted: "bg-yellow-100 text-yellow-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-red-100 text-red-700",
  auto_leave: "bg-amber-100 text-amber-700",
  Draft: "bg-slate-100 text-slate-600",
  Sent: "bg-blue-100 text-blue-700"
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
        STATUS_STYLES[status] || "bg-slate-100 text-slate-700",
        className
      )}
    >
      {children || STATUS_LABELS[status] || status}
    </span>
  );
}