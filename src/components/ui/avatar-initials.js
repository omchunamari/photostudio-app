"use client";

import { cn } from "@/lib/utils";

const COLORS = [
  "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-green-500",
  "bg-teal-500", "bg-blue-500", "bg-indigo-500", "bg-purple-500", "bg-pink-500",
];

function getColorFromName(name = "") {
  const index = name.charCodeAt(0) % COLORS.length;
  return COLORS[index] || COLORS[0];
}

function getInitials(name = "") {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AvatarInitials({ name, size = "md", className }) {
  const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg" };
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-semibold text-white shrink-0",
        getColorFromName(name),
        sizes[size],
        className
      )}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}