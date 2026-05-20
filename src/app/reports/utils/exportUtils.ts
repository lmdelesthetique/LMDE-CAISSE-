'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const COMPANY = {
  name: "LE MONDE DE L\'ESTHETIQUE",
  rcs: 'RCS Fort-de-France 927 747 725',
  tva: 'TVA FR71 927747 725',
  address: 'aie des Flamands Appt 306 9 avenue Loulou Boislaville, 97200 Fort-de-France',
  legal: "SAS au capital de 100€",
};

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ExportOptions {
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: Record<string, string | number>[];
  filename: string;
}

export function exportToPDF(options: ExportOptions) {
  const { title, subtitle, columns, rows, filename } = options;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Company header banner
  doc.setFillColor(30, 27, 75);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(COMPANY.name, 14, 10);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 190, 255);
  doc.text(`${COMPANY.legal}  |  ${COMPANY.rcs}  |  ${COMPANY.tva}`, 14, 16);
  doc.text(COMPANY.address, 14, 20);

  // Report title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 27, 75);
  doc.text(title, 14, 32);

  let startY = 38;
  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(subtitle, 14, 38);
    doc.setTextColor(0);
    startY = 44;
  }

  const tableData = rows.map((row) => columns.map((col) => String(row[col.key] ?? '')));

  autoTable(doc, {
    head: [columns.map((c) => c.header)],
    body: tableData,
    startY,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 255] },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(30, 27, 75);
    doc.rect(0, pageH - 10, pageW, 10, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 170, 220);
    doc.text(`${COMPANY.name} — ${COMPANY.rcs} — ${COMPANY.tva}`, 14, pageH - 4);
    doc.text(`Page ${i} / ${totalPages}`, pageW - 14, pageH - 4, { align: 'right' });
  }

  doc.save(`${filename}.pdf`);
}

export function exportToExcel(options: ExportOptions) {
  const { title, columns, rows, filename } = options;

  const worksheetData = [
    [COMPANY.name],
    [`${COMPANY.legal} | ${COMPANY.rcs} | ${COMPANY.tva}`],
    [COMPANY.address],
    [],
    [title],
    [],
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((col) => row[col.key] ?? '')),
  ];

  const ws = XLSX.utils.aoa_to_sheet(worksheetData);

  // Column widths
  ws['!cols'] = columns.map((c) => ({ wch: c.width ?? 18 }));

  // Style header row (row index 6 = row 7 in 1-indexed, after company info rows)
  const headerRowIndex = 6;
  columns.forEach((_, colIndex) => {
    const cellRef = XLSX.utils.encode_cell({ r: headerRowIndex, c: colIndex });
    if (!ws[cellRef]) return;
    ws[cellRef].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '4F46E5' } },
    };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rapport');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
