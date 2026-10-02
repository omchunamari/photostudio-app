"use client";

import { inrPlain } from "./calc";
import { monthLabel } from "./payrollCalc";

/**
 * Payslip PDF. Built from the payroll snapshot (not live salary), so a
 * downloaded slip always matches what was actually processed and paid.
 * jsPDF's built-in fonts have no ₹ glyph, so amounts print as "Rs.".
 */
export async function downloadPayslipPdf(payroll, employee) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("The Rolling Stories", 40, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Payslip for ${monthLabel(payroll.month)}`, 40, 70);
  doc.setDrawColor(200);
  doc.line(40, 80, W - 40, 80);
  doc.setTextColor(20);

  const designation = employee?.designation || payroll.designation || (employee?.role || "").replace(/_/g, " ");
  autoTable(doc, {
    startY: 94,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 110 }, 2: { fontStyle: "bold", cellWidth: 110 } },
    body: [
      ["Employee name", payroll.employeeName, "Employee ID", payroll.employeeCode || employee?.employeeId || "—"],
      ["Designation", designation || "—", "Department", employee?.department || payroll.department || "—"],
      ["Salary month", monthLabel(payroll.month), "Days in month", String(payroll.daysInMonth)],
      ["Paid days", String(payroll.paidDays), "Leave / LOP", `${payroll.leaveDays} / ${payroll.lopDays}`],
    ],
  });

  const earnings = [["Monthly salary", inrPlain(payroll.salary)]];
  if (payroll.otherEarnings) earnings.push(["Other earnings", inrPlain(payroll.otherEarnings)]);
  const deductions = [];
  if (payroll.lopDeduction) deductions.push([`Loss of pay (${payroll.lopDays} day${payroll.lopDays === 1 ? "" : "s"})`, inrPlain(payroll.lopDeduction)]);
  if (payroll.notEmployedDeduction) deductions.push([`Before joining (${payroll.notEmployedDays} day${payroll.notEmployedDays === 1 ? "" : "s"})`, inrPlain(payroll.notEmployedDeduction)]);
  if (payroll.otherDeduction) deductions.push(["Other deduction", inrPlain(payroll.otherDeduction)]);
  if (payroll.advanceRecovery) deductions.push(["Advance / loan recovery", inrPlain(payroll.advanceRecovery)]);
  if (!deductions.length) deductions.push(["None", inrPlain(0)]);

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 14,
    head: [["Earnings", "Amount"]],
    body: earnings,
    foot: [["Gross earnings", inrPlain(payroll.grossEarnings)]],
    headStyles: { fillColor: [15, 118, 110] },
    footStyles: { fillColor: [241, 245, 249], textColor: 20 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: 40, right: 40 },
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 12,
    head: [["Deductions", "Amount"]],
    body: deductions,
    foot: [["Total deductions", inrPlain(payroll.totalDeductions)]],
    headStyles: { fillColor: [180, 83, 9] },
    footStyles: { fillColor: [241, 245, 249], textColor: 20 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: 40, right: 40 },
  });

  const y = doc.lastAutoTable.finalY + 26;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Net salary", 40, y);
  doc.text(inrPlain(payroll.netSalary), W - 40, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("This is a computer-generated payslip and does not require a signature.", 40, y + 30);

  doc.save(`Payslip_${(payroll.employeeName || "employee").replace(/\s+/g, "_")}_${payroll.month}.pdf`);
}
