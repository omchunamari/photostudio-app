// "use client";

// import { useEffect, useMemo, useState } from "react";
// import Link from "next/link";
// import ProtectedRoute from "@/components/ProtectedRoute";
// import DeviceGate from "@/components/DeviceGate";
// import AppShell from "@/components/AppShell";
// import { useAuth } from "@/contexts/AuthContext";
// import { getAllEvents, getEventsForEmployee, sumEventTeamCost } from "@/lib/firebase/events";
// import { getAllEmployees } from "@/lib/firebase/employees";
// import { getAllFreelancers } from "@/lib/firebase/freelancers";
// import { Card, CardContent } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// import StatusBadge from "@/components/ui/status-badge";
// import AvatarInitials from "@/components/ui/avatar-initials";
// import { toast } from "sonner";
// import { Search, CalendarClock, Users2, Download, Sun, SunMedium, Banknote } from "lucide-react";
// import jsPDF from "jspdf";
// import autoTable from "jspdf-autotable";

// const ADMIN_ROLES = ["super_admin", "admin", "project_manager"];

// function inr(n) {
//   return `₹${(Number(n) || 0).toLocaleString("en-IN")}`;
// }

// /** Indian financial year (Apr–Mar) label list, current year first, going back 4 years. */
// function getFinancialYearOptions() {
//   const now = new Date();
//   const currentFyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
//   const options = [];
//   for (let i = 0; i < 5; i++) {
//     const startYear = currentFyStart - i;
//     options.push({
//       value: `${startYear}`,
//       label: `FY ${startYear}-${String(startYear + 1).slice(2)}`,
//       startDate: `${startYear}-04-01`,
//       endDate: `${startYear + 1}-03-31`,
//     });
//   }
//   return options;
// }

// function isPastEvent(ev) {
//   const ref = ev.eventEndDate || ev.eventStartDate;
//   if (!ref) return false;
//   return new Date(ref) < new Date(new Date().toDateString());
// }

// function toCsvRow(fields) {
//   return fields
//     .map((f) => {
//       const s = String(f ?? "");
//       return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
//     })
//     .join(",");
// }

// function EventsContent() {
//   const { user } = useAuth();
//   const isAdminOrPM = ADMIN_ROLES.includes(user.role);

//   const [events, setEvents] = useState([]);
//   const [employees, setEmployees] = useState([]);
//   const [freelancers, setFreelancers] = useState([]);
//   const [loading, setLoading] = useState(true);

//   const [search, setSearch] = useState("");
//   const [tab, setTab] = useState("upcoming"); // upcoming | past | all
//   const fyOptions = useMemo(() => getFinancialYearOptions(), []);
//   const [fy, setFy] = useState(fyOptions[0].value);

//   const [scheduleOpen, setScheduleOpen] = useState(false);
//   const [scheduleKey, setScheduleKey] = useState("");
//   const [scheduleEvents, setScheduleEvents] = useState([]);
//   const [scheduleLoading, setScheduleLoading] = useState(false);

//   async function loadData() {
//     setLoading(true);
//     try {
//       const [evts, emps, freelancerList] = await Promise.all([
//         getAllEvents(),
//         getAllEmployees(),
//         getAllFreelancers(),
//       ]);
//       setEvents(evts);
//       setEmployees(emps.filter((e) => e.status === "active"));
//       setFreelancers(freelancerList.filter((f) => f.status !== "inactive"));
//     } catch (err) {
//       toast.error(`Failed loading events: ${err.message}`);
//     }
//     setLoading(false);
//   }

//   useEffect(() => {
//     if (isAdminOrPM) loadData();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   const fyRange = fyOptions.find((f) => f.value === fy);

//   const filteredEvents = useMemo(() => {
//     const q = search.trim().toLowerCase();
//     return events
//       .filter((ev) => {
//         if (tab === "upcoming" && isPastEvent(ev)) return false;
//         if (tab === "past" && !isPastEvent(ev)) return false;
//         if (fyRange && ev.eventStartDate) {
//           if (ev.eventStartDate < fyRange.startDate || ev.eventStartDate > fyRange.endDate) return false;
//         }
//         if (!q) return true;
//         return (
//           ev.eventName?.toLowerCase().includes(q) ||
//           ev.clientName?.toLowerCase().includes(q) ||
//           ev.projectName?.toLowerCase().includes(q)
//         );
//       })
//       .sort((a, b) => (a.eventStartDate || "").localeCompare(b.eventStartDate || ""));
//   }, [events, search, tab, fyRange]);

//   async function openTeamSchedule() {
//     setScheduleOpen(true);
//     if (!scheduleKey && (employees.length > 0 || freelancers.length > 0)) {
//       const first = employees[0]
//         ? `employee:${employees[0].uid}`
//         : freelancers[0]
//         ? `freelancer:${freelancers[0].id}`
//         : "";
//       setScheduleKey(first);
//     }
//   }

//   useEffect(() => {
//     async function loadSchedule() {
//       if (!scheduleKey) {
//         setScheduleEvents([]);
//         return;
//       }
//       const [kind, id] = scheduleKey.split(":");
//       setScheduleLoading(true);
//       try {
//         const evts =
//           kind === "employee"
//             ? await getEventsForEmployee(id)
//             : events.filter((ev) => (ev.assignedUids || []).includes(id));
//         setScheduleEvents(evts.filter((ev) => !isPastEvent(ev)).sort((a, b) => (a.eventStartDate || "").localeCompare(b.eventStartDate || "")));
//       } catch (err) {
//         toast.error(`Failed loading schedule: ${err.message}`);
//       }
//       setScheduleLoading(false);
//     }
//     if (scheduleOpen) loadSchedule();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [scheduleKey, scheduleOpen]);

//   function handleDownloadPdf() {
//     const [kind, uid] = scheduleKey.split(":");
//     const doc = new jsPDF();
//     const marginX = 14;

//     doc.setFontSize(16);
//     doc.text("Team Schedule", marginX, 18);
//     doc.setFontSize(11);
//     doc.setTextColor(90);
//     doc.text(scheduleLabel || "", marginX, 26);
//     doc.setFontSize(9);
//     doc.text(`Generated ${new Date().toLocaleDateString("en-IN")}`, marginX, 32);
//     doc.setTextColor(0);

//     autoTable(doc, {
//       startY: 38,
//       head: [["Event", "Client", "Date", "Slot", "Cost"]],
//       body: scheduleEvents.map((ev) => {
//         const m = (ev.team || []).find((t) => t.uid === uid);
//         return [
//           ev.eventName || "",
//           ev.clientName || "",
//           ev.eventStartDate || "—",
//           m?.costLabel || "Full Day",
//           m?.cost > 0 ? inr(m.cost) : "—",
//         ];
//       }),
//       headStyles: { fillColor: [30, 41, 59] },
//       styles: { fontSize: 9, cellPadding: 3 },
//       margin: { left: marginX, right: marginX },
//     });

//     const safeName = (scheduleLabel || "schedule").split(" · ")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase();
//     doc.save(`${safeName}-upcoming-schedule.pdf`);
//   }

//   function handleExport() {
//     const rows = [
//       ["Event", "Client", "Project", "Date", "Status", "Assigned", "Team Cost"],
//       ...filteredEvents.map((ev) => [
//         ev.eventName,
//         ev.clientName,
//         ev.projectName,
//         ev.eventStartDate || "",
//         ev.status,
//         ev.team?.length || 0,
//         sumEventTeamCost(ev.team),
//       ]),
//     ];
//     const csv = rows.map(toCsvRow).join("\n");
//     const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
//     const url = URL.createObjectURL(blob);
//     const a = document.createElement("a");
//     a.href = url;
//     a.download = `events-${fy ? `FY${fy}` : "all"}.csv`;
//     a.click();
//     URL.revokeObjectURL(url);
//   }

//   const scheduleLabel = (() => {
//     if (!scheduleKey) return "";
//     const [kind, id] = scheduleKey.split(":");
//     if (kind === "employee") {
//       const e = employees.find((x) => x.uid === id);
//       return e ? `${e.name} · ${e.role}` : "";
//     }
//     const f = freelancers.find((x) => x.id === id);
//     return f ? `${f.name} · ${f.skill}` : "";
//   })();

//   const scheduleName = scheduleLabel.split(" · ")[0];

//   function slotIcon(label) {
//     if (label === "Half Day") return SunMedium;
//     if (label === "Fixed") return Banknote;
//     return Sun;
//   }

//   if (!isAdminOrPM) {
//     return (
//       <AppShell>
//         <p className="text-sm text-slate-500">You don&apos;t have access to this page.</p>
//       </AppShell>
//     );
//   }

//   return (
//     <AppShell>
//       <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
//         <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">
//           Events <span className="ml-1 text-base font-normal text-slate-400">{filteredEvents.length}</span>
//         </h2>
//         <div className="flex flex-wrap items-center gap-2">
//           <Button variant="secondary" size="sm" onClick={openTeamSchedule}>
//             <CalendarClock className="h-4 w-4" /> Team Schedule
//           </Button>
//           <Link href="/employees">
//             <Button variant="secondary" size="sm">
//               <Users2 className="h-4 w-4" /> Manage Team
//             </Button>
//           </Link>
//           <Button variant="secondary" size="sm" onClick={handleExport}>
//             <Download className="h-4 w-4" /> Export
//           </Button>
//           <Select value={fy} onValueChange={setFy}>
//             <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
//             <SelectContent>
//               {fyOptions.map((f) => (
//                 <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
//               ))}
//             </SelectContent>
//           </Select>
//         </div>
//       </div>

//       <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
//         <div className="relative w-full sm:max-w-sm">
//           <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
//           <Input
//             placeholder="Search events, clients..."
//             value={search}
//             onChange={(e) => setSearch(e.target.value)}
//             className="pl-8"
//           />
//         </div>
//         <div className="flex gap-1 rounded-md border border-slate-200 p-0.5">
//           {[
//             ["upcoming", "Upcoming"],
//             ["past", "Past"],
//             ["all", "All"],
//           ].map(([value, label]) => (
//             <button
//               key={value}
//               onClick={() => setTab(value)}
//               className={`rounded px-3 py-1 text-sm font-medium transition ${
//                 tab === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
//               }`}
//             >
//               {label}
//             </button>
//           ))}
//         </div>
//       </div>

//       {loading ? (
//         <p className="text-sm text-slate-500">Loading...</p>
//       ) : filteredEvents.length === 0 ? (
//         <p className="text-sm text-slate-500">No events found.</p>
//       ) : (
//         <div className="flex flex-col gap-2">
//           {filteredEvents.map((ev) => {
//             const cost = sumEventTeamCost(ev.team);
//             const assignedCount = ev.team?.length || 0;
//             return (
//               <Link key={`${ev.projectId}-${ev.id}`} href={`/projects/${ev.projectId}/events/${ev.id}`}>
//                 <Card className="transition hover:border-slate-300">
//                   <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
//                     <div className="min-w-0 flex-1">
//                       <p className="truncate font-medium text-slate-900">
//                         {ev.eventName}{" "}
//                         <span className="font-normal text-slate-400">— {ev.clientName}</span>
//                       </p>
//                       <p className="truncate text-xs text-slate-500">
//                         {ev.projectName} ·{" "}
//                         {ev.eventStartDate
//                           ? ev.eventStartDate === ev.eventEndDate
//                             ? ev.eventStartDate
//                             : `${ev.eventStartDate} – ${ev.eventEndDate}`
//                           : "No date set"}{" "}
//                         · {assignedCount} assigned
//                       </p>
//                     </div>
//                     <div className="flex shrink-0 items-center gap-2">
//                       {cost > 0 && <span className="text-sm font-medium text-amber-600">{inr(cost)}</span>}
//                       <StatusBadge status={ev.status} />
//                     </div>
//                   </CardContent>
//                 </Card>
//               </Link>
//             );
//           })}
//         </div>
//       )}

//       <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
//         <DialogContent className="w-[95vw] max-w-lg">
//           <DialogHeader>
//             <DialogTitle>Team Schedule</DialogTitle>
//           </DialogHeader>

//           <Select value={scheduleKey} onValueChange={setScheduleKey}>
//             <SelectTrigger className="mb-4 w-full">
//               {scheduleLabel || <span className="text-slate-400">Select employee or freelancer</span>}
//             </SelectTrigger>
//             <SelectContent>
//               {employees.length > 0 && (
//                 <>
//                   <p className="px-2 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
//                     Employees
//                   </p>
//                   {employees.map((e) => (
//                     <SelectItem key={`employee:${e.uid}`} value={`employee:${e.uid}`}>
//                       {e.name} · {e.role}
//                     </SelectItem>
//                   ))}
//                 </>
//               )}
//               {freelancers.length > 0 && (
//                 <>
//                   <p className="px-2 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
//                     Freelancers
//                   </p>
//                   {freelancers.map((f) => (
//                     <SelectItem key={`freelancer:${f.id}`} value={`freelancer:${f.id}`}>
//                       {f.name} · {f.skill}
//                     </SelectItem>
//                   ))}
//                 </>
//               )}
//             </SelectContent>
//           </Select>

//           {scheduleKey && (
//             <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
//               <div className="flex items-center gap-3">
//                 <AvatarInitials name={scheduleName} size="md" />
//                 <div>
//                   <p className="font-medium text-slate-900">{scheduleName}</p>
//                   <p className="text-xs text-slate-500">{scheduleLabel.split(" · ")[1]}</p>
//                 </div>
//               </div>
//               <Button
//                 variant="secondary"
//                 size="sm"
//                 onClick={handleDownloadPdf}
//                 disabled={scheduleEvents.length === 0}
//               >
//                 <Download className="h-4 w-4" /> PDF
//               </Button>
//             </div>
//           )}

//           <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
//             Upcoming Events ({scheduleEvents.length})
//           </p>

//           {scheduleLoading ? (
//             <p className="py-6 text-center text-sm text-slate-500">Loading...</p>
//           ) : scheduleEvents.length === 0 ? (
//             <p className="py-6 text-center text-sm text-slate-500">
//               No upcoming events for this person.
//             </p>
//           ) : (
//             <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
//               {scheduleEvents.map((ev) => {
//                 const [, uid] = scheduleKey.split(":");
//                 const m = (ev.team || []).find((t) => t.uid === uid);
//                 const label = m?.costLabel || "Full Day";
//                 const SlotIcon = slotIcon(label);
//                 return (
//                   <div
//                     key={`${ev.projectId}-${ev.id}`}
//                     className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
//                   >
//                     <div className="min-w-0">
//                       <p className="truncate font-medium text-slate-900">{ev.eventName}</p>
//                       <p className="truncate text-xs text-slate-500">
//                         {ev.clientName} · {ev.eventStartDate || "No date"}
//                       </p>
//                     </div>
//                     <div className="flex shrink-0 items-center gap-2">
//                       <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
//                         <SlotIcon className="h-3.5 w-3.5" /> {label}
//                       </span>
//                       {m?.cost > 0 && (
//                         <span className="text-xs font-medium text-amber-600">{inr(m.cost)}</span>
//                       )}
//                     </div>
//                   </div>
//                 );
//               })}
//             </div>
//           )}
//         </DialogContent>
//       </Dialog>
//     </AppShell>
//   );
// }

// export default function EventsPage() {
//   return (
//     <ProtectedRoute>
//       <DeviceGate>
//         <EventsContent />
//       </DeviceGate>
//     </ProtectedRoute>
//   );
// }