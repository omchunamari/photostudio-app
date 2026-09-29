"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, FileText } from "lucide-react";
import FinanceShell from "@/components/finance/FinanceShell";
import useFinanceData from "@/lib/finance/useFinanceData";
import { REPORTS, buildReport } from "@/lib/finance/reports";
import { downloadReportPdf, downloadReportXlsx } from "@/lib/finance/export";
import { inr } from "@/lib/finance/calc";
import { fyLabel, fyStartYearForDate } from "@/lib/dashboardFinance";
import { getISTDateStr } from "@/lib/dateIST";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function Content() {
  const data = useFinanceData();
  const today = getISTDateStr();
  const fyNow = fyStartYearForDate(today);
  const [reportId, setReportId] = useState("expense");
  const [mode, setMode] = useState("fy"); // range | month | fy
  const [range, setRange] = useState({ from: "", to: "" });
  const [month, setMonth] = useState(today.slice(0, 7));
  const [fy, setFy] = useState(String(fyNow));
  const [projectId, setProjectId] = useState("");
  const [personUid, setPersonUid] = useState("");
  const [category, setCategory] = useState("");
  const [accountId, setAccountId] = useState("");

  const period = useMemo(() => {
    if (mode === "range") return range;
    if (mode === "month") {
      const [y, m] = month.split("-").map(Number);
      const last = new Date(y, m, 0).getDate();
      return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
    }
    const y = Number(fy);
    return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
  }, [mode, range, month, fy]);

  const filters = { ...period, projectId, personUid, category, accountId };

  const report = useMemo(() => (data.loading ? null : buildReport(reportId, data, filters)), [data, reportId, period, projectId, personUid, category, accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(
    () => [...new Set([...data.cats.project, ...data.cats.company, ...data.cats.income, ...data.all.map((t) => t.category).filter(Boolean)])],
    [data.cats, data.all]
  );
  const people = useMemo(
    () => [
      ...data.employees.map((e) => ({ value: e.uid, label: e.name, group: "Employees" })),
      ...data.freelancers.map((f) => ({ value: f.id, label: f.name, group: "Freelancers" })),
    ],
    [data.employees, data.freelancers]
  );
  const fyOptions = Array.from({ length: 6 }, (_, i) => fyNow - i).map((y) => ({ value: String(y), label: fyLabel(y) }));
  const all = (label) => ({ value: "all", label });

  const fileBase = `${reportId}_${period.from || "all"}_${period.to || "all"}`;
  async function download(kind) {
    try {
      if (kind === "xlsx") await downloadReportXlsx(report, fileBase);
      else await downloadReportPdf(report, fileBase);
    } catch (err) {
      console.error(err);
      toast.error("Could not create the file");
    }
  }

  const fmt = (col, v) => (v == null || v === "" ? "" : col.money ? inr(v) : String(v));

  return (
    <FinanceShell
      title="Reports"
      description="Every report reads the same ledger as the rest of the module. Filter, preview, then download."
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => download("xlsx")} disabled={!report}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => download("pdf")} disabled={!report}>
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </>
      }
    >
      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Label>Report</Label>
            <SearchableSelect value={reportId} onValueChange={setReportId} options={REPORTS.map((r) => ({ value: r.id, label: r.label }))} />
          </div>
          <div>
            <Label>Period</Label>
            <SearchableSelect value={mode} onValueChange={setMode} options={[{ value: "fy", label: "Financial year" }, { value: "month", label: "Month" }, { value: "range", label: "Custom dates" }]} />
          </div>
          <div>
            {mode === "fy" && (<><Label>Financial year</Label><SearchableSelect value={fy} onValueChange={setFy} options={fyOptions} /></>)}
            {mode === "month" && (<><Label>Month</Label><Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></>)}
            {mode === "range" && (
              <div className="grid grid-cols-2 gap-2">
                <div><Label>From</Label><Input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></div>
                <div><Label>To</Label><Input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></div>
              </div>
            )}
          </div>
          <div>
            <Label>Project</Label>
            <SearchableSelect value={projectId || "all"} onValueChange={(v) => setProjectId(v === "all" ? "" : v)} options={[all("All projects"), ...data.projects.map((p) => ({ value: p.id, label: p.projectName }))]} alwaysSearch />
          </div>
          <div>
            <Label>Employee / person</Label>
            <SearchableSelect value={personUid || "all"} onValueChange={(v) => setPersonUid(v === "all" ? "" : v)} options={[all("Everyone"), ...people]} alwaysSearch />
          </div>
          <div>
            <Label>Category</Label>
            <SearchableSelect value={category || "all"} onValueChange={(v) => setCategory(v === "all" ? "" : v)} options={[all("All categories"), ...categories]} />
          </div>
          <div>
            <Label>Account</Label>
            <SearchableSelect value={accountId || "all"} onValueChange={(v) => setAccountId(v === "all" ? "" : v)} options={[all("All accounts"), ...data.accounts.map((a) => ({ value: a.id, label: a.name }))]} />
          </div>
        </CardContent>
      </Card>

      {!report ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <>
          <div className="mb-2">
            <h2 className="font-heading text-lg font-semibold text-slate-900">{report.title}</h2>
            <p className="text-xs text-slate-500">{report.subtitle}</p>
          </div>
          {report.rows.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-slate-500">No data for these filters.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {report.columns.map((c) => (
                        <TableHead key={c.key} className={c.money ? "text-right" : ""}>{c.header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.map((r, i) => (
                      <TableRow key={i} className={r.amount === null && r.particulars ? "bg-slate-50 font-semibold" : ""}>
                        {report.columns.map((c) => (
                          <TableCell key={c.key} className={c.money ? "whitespace-nowrap text-right" : ""}>{fmt(c, r[c.key])}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {report.totals && (
                      <TableRow className="bg-slate-50 font-semibold">
                        {report.columns.map((c, i) => (
                          <TableCell key={c.key} className={c.money ? "text-right" : ""}>
                            {report.totals[c.key] != null ? fmt(c, report.totals[c.key]) : i === 0 ? "Total" : ""}
                          </TableCell>
                        ))}
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </FinanceShell>
  );
}

export default function ReportsPage() {
  return <Content />;
}
