"use client";

/**
 * Report export. A "report" is { title, subtitle, columns:[{header, key, align?, money?}], rows:[{...}], totals?:{...} }.
 * Both writers lazy-load their library so the finance pages stay light.
 */
import { inrPlain } from "./calc";

function cellText(col, row) {
  const v = row[col.key];
  if (v == null || v === "") return "";
  return col.money ? inrPlain(v) : String(v);
}

export async function downloadReportXlsx(report, fileName) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const head = report.columns.map((c) => ({ value: c.header, fontWeight: "bold", backgroundColor: "#e2e8f0" }));
  const body = report.rows.map((r) =>
    report.columns.map((c) => {
      const v = r[c.key];
      if (v == null || v === "") return { value: "" };
      if (c.money || typeof v === "number") return { value: Number(v), type: Number, format: c.money ? "#,##0.00" : undefined };
      return { value: String(v) };
    })
  );
  const sheet = [[{ value: report.title, fontWeight: "bold", fontSize: 14 }]];
  if (report.subtitle) sheet.push([{ value: report.subtitle }]);
  sheet.push([{ value: "" }], head, ...body);
  if (report.totals) {
    sheet.push(
      report.columns.map((c, i) => {
        const v = report.totals[c.key];
        if (v == null) return { value: i === 0 ? "Total" : "", fontWeight: "bold" };
        return typeof v === "number"
          ? { value: v, type: Number, fontWeight: "bold", format: c.money ? "#,##0.00" : undefined }
          : { value: String(v), fontWeight: "bold" };
      })
    );
  }
  await writeXlsxFile(sheet, { columns: report.columns.map((c) => ({ width: Math.max(14, c.header.length + 4) })) }).toFile(
    `${fileName}.xlsx`
  );
}

export async function downloadReportPdf(report, fileName) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: report.columns.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(15);
  doc.text(report.title, 40, 44);
  doc.setFontSize(9);
  doc.setTextColor(100);
  if (report.subtitle) doc.text(report.subtitle, 40, 60);
  const body = report.rows.map((r) => report.columns.map((c) => cellText(c, r)));
  const foot = report.totals
    ? [report.columns.map((c, i) => (report.totals[c.key] != null ? cellText(c, report.totals) : i === 0 ? "Total" : ""))]
    : undefined;
  autoTable(doc, {
    startY: 74,
    head: [report.columns.map((c) => c.header)],
    body,
    foot,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [15, 118, 110] },
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
    columnStyles: Object.fromEntries(
      report.columns.map((c, i) => [i, { halign: c.money || c.align === "right" ? "right" : "left" }])
    ),
  });
  doc.save(`${fileName}.pdf`);
}
