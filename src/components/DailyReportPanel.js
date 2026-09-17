"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
    getTodayReport,
    submitDailyReport,
    getAllReportsForDate,
    getReportHistoryForEmployee,
} from "@/lib/firebase/dailyReports";
import { getAllEmployees } from "@/lib/firebase/employees";
import { getOrgHolidays } from "@/lib/firebase/holidays";
import { getHolidayForDate, formatMonthDay } from "@/lib/holidays";
import { getISTDateStr, getISTDayFromDateStr } from "@/lib/dateIST";
import { WEEKLY_OFF_DAY } from "@/lib/constants/attendance";
import {
    getDeliverablesForEmployee,
    addDeliverableStatusUpdate,
    DELIVERABLE_STATUSES,
} from "@/lib/firebase/deliverables";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatTime12 } from "@/lib/dateIST";

const ADMIN_ROLES = ["super_admin", "admin", "hr"];

/** Whether `dateStr` is a day reports aren't required for — the weekly off
 *  (Sunday) or one of the org's yearly fixed holidays — and why. */
function getOffInfo(dateStr, holidays) {
  const holiday = getHolidayForDate(dateStr, holidays);
  if (holiday) return { type: "holiday", label: holiday.name };
  if (getISTDayFromDateStr(dateStr) === WEEKLY_OFF_DAY) {
    return { type: "weekly_off", label: "Weekly Off (Sunday)" };
  }
  return null;
}

// Admin and HR submit their own daily report just like any other employee —
// only super_admin is exempt (mirrors the attendance module: super_admin
// doesn't check in or report, everyone else including admin/HR does).
// Admin/HR additionally get the org-wide admin view below their own form,
// same as HR already got before this change.
export default function DailyReportPanel() {
    const { user } = useAuth();
    const isManagerView = ADMIN_ROLES.includes(user.role);
    const mustSubmitOwnReport = user.role !== "super_admin";

    return (
        <div className="flex flex-col gap-6">
            {mustSubmitOwnReport && <EmployeeReportForm />}
            {isManagerView && <AdminReportsView />}
        </div>
    );
}

function EmployeeReportForm() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [existingReport, setExistingReport] = useState(null);
    const [text, setText] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [offInfo, setOffInfo] = useState(null);
    const [submitAnyway, setSubmitAnyway] = useState(false);

    // Assigned deliverables the employee can optionally post a status
    // update against alongside today's report. Keyed by id so edits are
    // easy to look up and only touched ones get submitted.
    const [myDeliverables, setMyDeliverables] = useState([]);
    const [deliverableEdits, setDeliverableEdits] = useState({}); // { [deliverableId]: { status, note } }

    useEffect(() => {
        Promise.all([
            getTodayReport(user.uid),
            getOrgHolidays(),
            getDeliverablesForEmployee(user.uid),
        ]).then(([r, holidays, deliverables]) => {
            setExistingReport(r);
            setOffInfo(getOffInfo(getISTDateStr(), holidays));
            // Once a deliverable is marked Done, it's off the daily report
            // for good — nothing left to update.
            setMyDeliverables(deliverables.filter((d) => d.status !== "Done"));
            setLoading(false);
        }).catch((err) => {
            // Assigned-work list is a nice-to-have on top of the report
            // itself — don't block report submission if it fails to load.
            console.error("Failed to load assigned deliverables:", err);
            setLoading(false);
        });
    }, [user.uid]);

    function updateDeliverableEdit(id, patch) {
        setDeliverableEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setSubmitting(true);
        try {
            // Only deliverables whose status was actually changed, or that
            // got a note, are treated as "touched" — everything else is
            // left alone.
            const touchedDeliverables = myDeliverables
                .map((d) => {
                    const edit = deliverableEdits[d.id];
                    if (!edit) return null;
                    const statusChanged = edit.status && edit.status !== d.status;
                    const hasNote = edit.note && edit.note.trim();
                    if (!statusChanged && !hasNote) return null;
                    return { deliverable: d, status: edit.status || d.status, note: hasNote ? edit.note.trim() : "" };
                })
                .filter(Boolean);

            // Write the actual updates first so the report never claims an
            // update happened that didn't actually land.
            await Promise.all(
                touchedDeliverables.map(({ deliverable, status, note }) =>
                    addDeliverableStatusUpdate(deliverable.projectId, deliverable.id, {
                        status,
                        note,
                        byUid: user.uid,
                        byName: user.name,
                    })
                )
            );

            await submitDailyReport({
                employeeUid: user.uid,
                employeeName: user.name,
                department: user.department,
                report: text,
                deliverableUpdates: touchedDeliverables.map(({ deliverable, status, note }) => ({
                    type: deliverable.type,
                    category: deliverable.category || "",
                    projectName: deliverable.projectName || "",
                    status,
                    note,
                })),
            });
            toast.success("Daily report submitted");
            const fresh = await getTodayReport(user.uid);
            setExistingReport(fresh);
            window.dispatchEvent(new Event("dailyReportSubmitted"));
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) return null;

    const showOffNotice = offInfo && !existingReport && !submitAnyway;

    return (
        <Card>
            <CardContent className="p-4 sm:p-5">
                <h3 className="mb-1 text-sm font-semibold text-slate-900 sm:text-base">
                    Today&apos;s Daily Report
                </h3>

                {existingReport ? (
                    <>
                        <p className="mb-2 text-xs text-slate-500">
                            Submitted at {formatTime12(existingReport.submittedAt)}
                        </p>
                        <div className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                            {existingReport.report}
                        </div>
                        <ReportUpdatesSummary report={existingReport} className="mt-3" />
                    </>
                ) : showOffNotice ? (
                    <div className="flex flex-col gap-2">
                        <p className="text-xs text-slate-500">
                            {offInfo.type === "holiday"
                                ? `Today is ${offInfo.label} — a holiday. No daily report is required.`
                                : "Today is the weekly off (Sunday). No daily report is required."}
                        </p>
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="w-fit"
                            onClick={() => setSubmitAnyway(true)}
                        >
                            I worked today — submit a report
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3">
                            <p className="text-xs text-slate-500">
                                {offInfo
                                    ? "Summarize what you worked on today."
                                    : "Summarize what you worked on today. You must submit this before you can check out, and skipping it may result in the day being auto-marked as leave."}
                            </p>
                            <Textarea
                                rows={5}
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder="What did you work on today?"
                                required
                            />
                        </div>

                        {myDeliverables.length > 0 && (
                            <div className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Your Assigned Deliverables (optional update)
                                </p>
                                <div className="flex flex-col gap-3">
                                    {myDeliverables.map((d) => {
                                        const edit = deliverableEdits[d.id] || {};
                                        return (
                                            <div key={d.id} className="flex flex-col gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-sm font-medium text-slate-900">
                                                        {d.type}
                                                        {d.projectName && <span className="ml-1 font-normal text-slate-500">— {d.projectName}</span>}
                                                    </p>
                                                    <Select
                                                        value={edit.status || d.status}
                                                        onValueChange={(v) => updateDeliverableEdit(d.id, { status: v })}
                                                    >
                                                        <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            {DELIVERABLE_STATUSES.map((s) => (
                                                                <SelectItem key={s} value={s}>{s}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <Input
                                                    value={edit.note || ""}
                                                    onChange={(e) => updateDeliverableEdit(d.id, { note: e.target.value })}
                                                    placeholder="Note on this deliverable (optional)"
                                                    className="h-8 text-xs"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <Button type="submit" disabled={submitting} className="w-full sm:w-fit">
                            {submitting ? "Submitting..." : "Submit Report"}
                        </Button>
                    </form>
                )}
            </CardContent>
        </Card>
    );
}

/** Compact read-only list of any deliverable updates attached to a
 *  submitted report — shown under the employee's own report, and reused in
 *  the admin view. */
function ReportUpdatesSummary({ report, className = "" }) {
    const deliverableUpdates = report.deliverableUpdates || [];
    if (deliverableUpdates.length === 0) return null;

    return (
        <div className={`flex flex-col gap-2 text-xs ${className}`}>
            {deliverableUpdates.map((u, i) => (
                <div key={`d${i}`} className="flex flex-wrap items-center gap-1.5 rounded-md bg-slate-50 px-2.5 py-1.5">
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-700">{u.status}</span>
                    <span className="font-medium text-slate-700">{u.type}</span>
                    {u.projectName && <span className="text-slate-500">— {u.projectName}</span>}
                    {u.note && <span className="text-slate-500">· {u.note}</span>}
                </div>
            ))}
        </div>
    );
}

function shiftDate(dateStr, deltaDays) {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + deltaDays);
    return getISTDateStr(d);
}

function AdminReportsView() {
    const todayStr = getISTDateStr();
    const [selectedDate, setSelectedDate] = useState(todayStr);
    const [loading, setLoading] = useState(true);
    const [reports, setReports] = useState([]);
    const [missing, setMissing] = useState([]);
    const [holidays, setHolidays] = useState([]);

    const [historyEmp, setHistoryEmp] = useState(null); // { uid, name }
    const [historyLoading, setHistoryLoading] = useState(false);
    const [history, setHistory] = useState([]);

    useEffect(() => {
        getOrgHolidays().then(setHolidays);
    }, []);

    useEffect(() => {
        load(selectedDate);
    }, [selectedDate]);

    async function load(date) {
        setLoading(true);
        const [dateReports, allEmployees] = await Promise.all([
            getAllReportsForDate(date),
            getAllEmployees(),
        ]);
        const submittedUids = new Set(dateReports.map((r) => r.employeeUid));
        const activeEmployees = allEmployees.filter(
            (e) => e.status === "active" && e.role !== "super_admin"
        );
        setReports(dateReports.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1)));
        setMissing(activeEmployees.filter((e) => !submittedUids.has(e.uid)));
        setLoading(false);
    }

    const offInfo = getOffInfo(selectedDate, holidays);

    async function openHistory(uid, name) {
        setHistoryEmp({ uid, name });
        setHistoryLoading(true);
        const data = await getReportHistoryForEmployee(uid);
        setHistory(data);
        setHistoryLoading(false);
    }

    return (
        <div className="flex flex-col gap-3">
            <Card>
                <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setSelectedDate((d) => shiftDate(d, -1))}>
                            ← Prev
                        </Button>
                        <Input
                            type="date"
                            value={selectedDate}
                            max={todayStr}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-auto"
                        />
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
                            disabled={selectedDate >= todayStr}
                        >
                            Next →
                        </Button>
                    </div>
                    {selectedDate !== todayStr && (
                        <Button size="sm" variant="ghost" onClick={() => setSelectedDate(todayStr)} className="w-fit">
                            Jump to Today
                        </Button>
                    )}
                </CardContent>
            </Card>

            {loading ? (
                <p className="text-sm text-slate-500">Loading...</p>
            ) : (
                <>
                    <Card>
                        <CardContent className="p-4 sm:p-5">
                            <h3 className="mb-3 text-sm font-semibold text-slate-900 sm:text-base">
                                Submitted — {selectedDate} ({reports.length})
                            </h3>
                            {reports.length === 0 ? (
                                <p className="text-sm text-slate-500">No reports submitted for this date.</p>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {reports.map((r) => (
                                        <button
                                            key={r.employeeUid}
                                            onClick={() => openHistory(r.employeeUid, r.employeeName)}
                                            className="rounded-md border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                                        >
                                            <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                                                <p className="text-sm font-medium text-slate-900">{r.employeeName}</p>
                                                <p className="text-xs text-slate-500">
                                                    {formatTime12(r.submittedAt)}
                                                </p>
                                            </div>
                                            <p className="whitespace-pre-wrap text-sm text-slate-700">{r.report}</p>
                                            <ReportUpdatesSummary report={r} className="mt-2" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4 sm:p-5">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold text-slate-900 sm:text-base">
                                    {offInfo ? "Not Submitted" : "Not Yet Submitted"} — {selectedDate} ({missing.length})
                                </h3>
                                {offInfo && (
                                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                                        {offInfo.type === "holiday" ? `Holiday · ${offInfo.label}` : offInfo.label}
                                    </span>
                                )}
                            </div>
                            {offInfo && (
                                <p className="mb-3 text-xs text-slate-500">
                                    Reports aren&apos;t required on this day, so no one below is flagged as missing.
                                </p>
                            )}
                            {missing.length === 0 ? (
                                <p className="text-sm text-slate-500">
                                    {offInfo
                                        ? "No one submitted a report for this date."
                                        : "Everyone active submitted a report for this date."}
                                </p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {missing.map((e) => (
                                        <button
                                            key={e.uid}
                                            onClick={() => openHistory(e.uid, e.name)}
                                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                                                offInfo
                                                    ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                                    : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                                            }`}
                                        >
                                            {e.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}

            <Dialog open={!!historyEmp} onOpenChange={(open) => !open && setHistoryEmp(null)}>
                <DialogContent className="max-h-[85vh] w-[95vw] max-w-lg overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{historyEmp?.name} — Report History</DialogTitle>
                    </DialogHeader>
                    {historyLoading ? (
                        <p className="text-sm text-slate-500">Loading...</p>
                    ) : history.length === 0 ? (
                        <p className="text-sm text-slate-500">No reports on record for this employee.</p>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {history.map((r) => (
                                <div key={r.date} className="rounded-md border border-slate-200 p-3">
                                    <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                                        <p className="text-sm font-medium text-slate-900">{r.date}</p>
                                        <p className="text-xs text-slate-500">
                                            {formatTime12(r.submittedAt)}
                                        </p>
                                    </div>
                                    <p className="whitespace-pre-wrap text-sm text-slate-700">{r.report}</p>
                                    <ReportUpdatesSummary report={r} className="mt-2" />
                                </div>
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}