"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Users } from "lucide-react";
import AvatarInitials from "@/components/ui/avatar-initials";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { freelancerPayoutsByPerson } from "@/lib/finance/payouts";
import { inr } from "@/lib/finance/calc";
import { formatDateIST } from "@/lib/dateIST";

const STATUS = {
  paid: { label: "Paid", cls: "bg-success/10 text-success" },
  partial: { label: "Partly paid", cls: "bg-warning/15 text-warning" },
  pending: { label: "Pending", cls: "bg-destructive/10 text-destructive" },
};

function Pill({ status }) {
  const s = STATUS[status];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>;
}

/**
 * Freelancer payouts, one row per person. Opening a person lists every
 * project → event they worked, what's paid and what's still due, with a Pay
 * button per project (payments are recorded against a project).
 */
export default function FreelancerPayouts({ data, onPay }) {
  const people = useMemo(
    () => freelancerPayoutsByPerson(data.events, data.freelancers, data.all),
    [data.events, data.freelancers, data.all]
  );
  const [open, setOpen] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [q, setQ] = useState("");
  const [personId, setPersonId] = useState(null);
  const [openProject, setOpenProject] = useState(null);

  const withDue = people.filter((p) => p.due > 0);
  const totalDue = withDue.reduce((s, p) => s + p.due, 0);
  const list = (showSettled ? people : withDue).filter((p) => !q || p.personName.toLowerCase().includes(q.toLowerCase()));
  const person = people.find((p) => p.personUid === personId) || null;

  if (!people.length) return null;

  return (
    <div className="mb-4 rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
      {/* Summary bar — collapsed by default so it doesn't crowd the ledger */}
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 p-3 text-left sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <Users className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Freelancer payouts</p>
            <p className="truncate text-xs text-muted-foreground">
              {withDue.length ? `${withDue.length} ${withDue.length === 1 ? "person" : "people"} to pay` : "Everyone is paid up"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalDue > 0 && <span className="font-heading text-lg font-semibold tabular-nums text-warning">{inr(totalDue)}</span>}
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border p-3 sm:p-4">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input className="sm:max-w-xs" placeholder="Search freelancer..." value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={showSettled} onChange={(e) => setShowSettled(e.target.checked)} />
              Show fully paid ({people.length - withDue.length})
            </label>
          </div>
          <div className="flex max-h-[420px] flex-col divide-y divide-border overflow-y-auto">
            {list.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No one matches.</p>
            ) : (
              list.map((p) => (
                <button
                  key={p.personUid}
                  type="button"
                  onClick={() => {
                    setPersonId(p.personUid);
                    setOpenProject(null);
                  }}
                  className="flex items-center justify-between gap-3 py-2.5 text-left hover:bg-muted/40"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <AvatarInitials name={p.personName} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.personName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.projects.length} project{p.projects.length === 1 ? "" : "s"} · {p.eventCount} event{p.eventCount === 1 ? "" : "s"}
                        {p.pendingProjects ? ` · ${p.pendingProjects} pending` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-right">
                    <div>
                      <p className={`text-sm font-semibold tabular-nums ${p.due ? "text-warning" : "text-success"}`}>{p.due ? `${inr(p.due)} due` : "Paid"}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {inr(p.paid)} of {inr(p.earned)} paid
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Person detail: project → events */}
      <Dialog open={!!person} onOpenChange={(o) => !o && setPersonId(null)}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto sm:w-full sm:max-w-3xl">
          {person && (
            <>
              <DialogHeader>
                <DialogTitle>{person.personName}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Earned", inr(person.earned), "text-foreground"],
                  ["Paid", inr(person.paid), "text-success"],
                  ["Due", inr(person.due), person.due ? "text-warning" : "text-muted-foreground"],
                ].map(([k, v, cls]) => (
                  <div key={k} className="rounded-lg bg-muted/50 p-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k}</p>
                    <p className={`font-heading text-lg font-semibold tabular-nums ${cls}`}>{v}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                {person.projects.map((pr) => {
                  const expanded = openProject === pr.projectId || (openProject === null && pr.due > 0 && person.projects.filter((x) => x.due > 0).length === 1);
                  return (
                    <div key={pr.projectId} className="rounded-lg ring-1 ring-foreground/10">
                      <button
                        type="button"
                        onClick={() => setOpenProject(expanded ? "__none" : pr.projectId)}
                        className="flex w-full items-center justify-between gap-3 p-3 text-left"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{pr.projectName}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {pr.events.length} event{pr.events.length === 1 ? "" : "s"} · {inr(pr.paid)} of {inr(pr.earned)} paid
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Pill status={pr.status} />
                          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </button>

                      {expanded && (
                        <div className="border-t border-border p-3">
                          <ul className="grid gap-1.5 sm:grid-cols-2">
                            {pr.events.map((e) => (
                              <li key={e.eventId} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-2.5 py-2 text-sm">
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{e.eventName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDateIST(e.date)} · {e.days} day{e.days === 1 ? "" : "s"} × {inr(e.rate)}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <span className="text-right text-sm font-medium tabular-nums">
                                    {inr(e.amount)}
                                    {e.status === "partial" && <span className="block text-[11px] font-normal text-warning">{inr(e.due)} due</span>}
                                  </span>
                                  <Pill status={e.status} />
                                </div>
                              </li>
                            ))}
                          </ul>

                          {pr.payments.length > 0 && (
                            <div className="mt-3">
                              <p className="mb-1 text-xs font-medium text-muted-foreground">Payments made</p>
                              <ul className="text-xs text-muted-foreground">
                                {pr.payments.map((t) => (
                                  <li key={t.id} className="flex justify-between py-0.5">
                                    <span>{formatDateIST(t.date)}{t.description ? ` · ${t.description}` : ""}</span>
                                    <span className="tabular-nums text-foreground">{inr(t.amount)}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {pr.due > 0 && (
                            <div className="mt-3 flex justify-end">
                              <Button
                                size="sm"
                                onClick={() => {
                                  setPersonId(null);
                                  onPay({
                                    kind: "expense",
                                    projectId: pr.projectId,
                                    personUid: person.personUid,
                                    personType: "freelancer",
                                    category: "Freelancer",
                                    amount: pr.due,
                                    description: pr.events
                                      .filter((e) => e.due > 0)
                                      .map((e) => `${e.eventName} (${e.days}d)`)
                                      .join(", "),
                                  });
                                }}
                              >
                                Pay {inr(pr.due)}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
