'use client';

import { FoOrder, FoOrderLine } from '@/lib/services/supplierOrderService';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon', sent: 'Envoyée', awaiting_validation: 'Attente validation',
  validated: 'Validée', modification_requested: 'Modification demandée',
  payment_pending: 'Paiement en attente', payment_in_progress: 'Paiement en cours',
  paid: 'Payée', payment_received_by_supplier: 'Paiement reçu fournisseur',
  in_preparation: 'En préparation', in_production: 'En production',
  ready_to_ship: 'Prête à expédier', shipped: 'Expédiée',
  partially_received: 'Reçue partiellement', fully_received: 'Reçue totalement',
  costs_recorded: 'Frais enregistrés', stock_integrated: 'Stock intégré',
  closed: 'Clôturée', suspended: 'Suspendue', cancelled: 'Annulée',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'En attente', in_progress: 'En cours', paid: 'Payé',
  received_by_supplier: 'Reçu fournisseur', partial: 'Partiel',
  balance_due: 'Solde dû', partially_refunded: 'Remboursé partiellement',
  fully_refunded: 'Remboursé totalement',
};

function fmt(n: number, currency = 'EUR'): string {
  return `${n.toFixed(2)} ${currency}`;
}

function fmtDate(d?: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

export async function exportPurchaseOrderPDF(order: FoOrder, lines: FoOrderLine[]): Promise<void> {
  // Dynamic import to avoid SSR issues
  const jsPDFModule = await import('jspdf');
  const jsPDF = jsPDFModule.default || (jsPDFModule as any).jsPDF;
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;

  // ── Brand colors ──────────────────────────────────────────────────────────
  const PRIMARY = [139, 92, 246] as [number, number, number];   // violet-500
  const DARK    = [30, 27, 75]   as [number, number, number];   // indigo-950
  const LIGHT   = [245, 243, 255] as [number, number, number];  // violet-50
  const MUTED   = [107, 114, 128] as [number, number, number];  // gray-500
  const WHITE   = [255, 255, 255] as [number, number, number];

  // ── Header banner ─────────────────────────────────────────────────────────
  doc.setFillColor(...DARK);
  doc.rect(0, 0, pageW, 38, 'F');

  // Logo placeholder (circle with "B")
  doc.setFillColor(...PRIMARY);
  doc.circle(margin + 10, 19, 9, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('B', margin + 10, 23, { align: 'center' });

  // Try to embed the logo image
  try {
    const img = new Image();
    img.src = '/assets/images/app_logo.png';
    await new Promise<void>((resolve) => {
      img.onload = () => {
        try {
          doc.addImage(img, 'PNG', margin, 7, 18, 18);
        } catch (_) { /* fallback circle already drawn */ }
        resolve();
      };
      img.onerror = () => resolve();
      setTimeout(resolve, 1000);
    });
  } catch (_) { /* keep circle fallback */ }

  // App name
  doc.setTextColor(...WHITE);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('LE MONDE DE L\'ESTHETIQUE', margin + 22, 16);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 190, 255);
  doc.text('RCS Fort-de-France 927 747 725  |  TVA FR71 927747 725', margin + 22, 22);
  doc.text('aie des Flamands Appt 306, 97200 Fort-de-France', margin + 22, 27);

  // Order number (right side of header)
  doc.setTextColor(...WHITE);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(order.orderNumber, pageW - margin, 17, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 190, 255);
  doc.text('BON DE COMMANDE FOURNISSEUR', pageW - margin, 24, { align: 'right' });

  // Status badge
  const statusLabel = STATUS_LABELS[order.orderStatus] || order.orderStatus;
  doc.setFillColor(...PRIMARY);
  doc.roundedRect(pageW - margin - 40, 27, 40, 8, 2, 2, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(statusLabel.toUpperCase(), pageW - margin - 20, 32.5, { align: 'center' });

  let y = 46;

  // ── Info cards row ────────────────────────────────────────────────────────
  const cardW = (contentW - 6) / 3;

  // Card helper
  const drawCard = (x: number, title: string, lines2: string[]) => {
    doc.setFillColor(...LIGHT);
    doc.roundedRect(x, y, cardW, 28, 2, 2, 'F');
    doc.setDrawColor(...PRIMARY);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, y, cardW, 28, 2, 2, 'S');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRIMARY);
    doc.text(title.toUpperCase(), x + 4, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK);
    doc.setFontSize(8);
    lines2.forEach((l, i) => doc.text(l, x + 4, y + 12 + i * 5));
  };

  drawCard(margin, 'Fournisseur', [
    order.supplierName || '—',
    `Devise: ${order.currency}`,
    order.expectedDeliveryAt ? `Livraison: ${fmtDate(order.expectedDeliveryAt)}` : '',
  ]);

  drawCard(margin + cardW + 3, 'Commande', [
    `Créée le: ${fmtDate(order.createdAt)}`,
    order.shippedAt ? `Expédiée: ${fmtDate(order.shippedAt)}` : '',
    order.receivedAt ? `Reçue: ${fmtDate(order.receivedAt)}` : '',
  ]);

  drawCard(margin + (cardW + 3) * 2, 'Paiement', [
    PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus,
    order.paymentMethod ? `Mode: ${order.paymentMethod}` : '',
    order.balanceDue > 0 ? `Solde dû: ${fmt(order.balanceDue, order.currency)}` : 'Soldé',
  ]);

  y += 34;

  // ── Tracking info ─────────────────────────────────────────────────────────
  if (order.trackingNumber) {
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, y, contentW, 8, 1.5, 1.5, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 101, 52);
    doc.text(`Numéro de suivi: ${order.trackingNumber}`, margin + 4, y + 5.5);
    y += 12;
  }

  // ── Line items table ──────────────────────────────────────────────────────
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Articles commandés', margin, y + 5);
  y += 9;

  // Pre-load product images via fetch → data URL (avoids CORS canvas taint)
  const imageMap: Record<string, string> = {};
  await Promise.all(lines.map(async (l) => {
    if (!l.productImageUrl) return;
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(l.productImageUrl, { signal: controller.signal });
      clearTimeout(tid);
      if (!res.ok) return;
      const blob = await res.blob();
      await new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') imageMap[l.id] = reader.result;
          resolve();
        };
        reader.onerror = () => resolve();
        reader.readAsDataURL(blob);
      });
    } catch { /* skip */ }
  }));

  const hasConfirmedPrices = lines.some((l) => l.confirmedUnitPrice != null);
  const IMG_COL_W = 14;
  const ROW_H = 16;

  const tableHead = hasConfirmedPrices
    ? [['', 'Réf.', 'Désignation', 'Qté', 'Prix achat', 'Prix confirmé', 'Total ligne']]
    : [['', 'Réf.', 'Désignation', 'Qté cmd.', 'Qté reçue', 'Prix unit.', 'Total ligne']];

  const tableRows = lines.map((l) => hasConfirmedPrices
    ? [
        '',
        l.productRef || '—',
        l.productName + (l.variant ? `\n${l.variant}` : '') + (l.color ? ` / ${l.color}` : ''),
        String(l.qtyOrdered),
        fmt(l.unitPrice, order.currency),
        l.confirmedUnitPrice != null ? fmt(l.confirmedUnitPrice, order.currency) : '—',
        fmt((l.confirmedUnitPrice ?? l.unitPrice) * l.qtyOrdered, order.currency),
      ]
    : [
        '',
        l.productRef || '—',
        l.productName + (l.variant ? `\n${l.variant}` : '') + (l.color ? ` / ${l.color}` : ''),
        String(l.qtyOrdered),
        l.qtyReceived > 0 ? String(l.qtyReceived) : '—',
        fmt(l.unitPrice, order.currency),
        fmt(l.lineTotal, order.currency),
      ]
  );

  const colStyles = hasConfirmedPrices
    ? {
        0: { cellWidth: IMG_COL_W },
        1: { cellWidth: 18 },
        2: { cellWidth: 'auto' as const },
        3: { cellWidth: 14, halign: 'center' as const },
        4: { cellWidth: 24, halign: 'right' as const },
        5: { cellWidth: 26, halign: 'right' as const, fontStyle: 'bold' as const },
        6: { cellWidth: 26, halign: 'right' as const, fontStyle: 'bold' as const },
      }
    : {
        0: { cellWidth: IMG_COL_W },
        1: { cellWidth: 18 },
        2: { cellWidth: 'auto' as const },
        3: { cellWidth: 16, halign: 'center' as const },
        4: { cellWidth: 18, halign: 'center' as const },
        5: { cellWidth: 22, halign: 'right' as const },
        6: { cellWidth: 24, halign: 'right' as const, fontStyle: 'bold' as const },
      };

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 3, textColor: DARK, lineColor: [229, 231, 235], lineWidth: 0.3, minCellHeight: ROW_H },
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: colStyles,
    didDrawCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 0) {
        const lineIndex = data.row.index;
        const line = lines[lineIndex];
        if (line && imageMap[line.id]) {
          try {
            const dataUrl = imageMap[line.id];
            const fmt = dataUrl.startsWith('data:image/png') ? 'PNG'
              : dataUrl.startsWith('data:image/webp') ? 'WEBP'
              : 'JPEG';
            const padding = 1.5;
            const size = Math.min(data.cell.width, data.cell.height) - padding * 2;
            doc.addImage(
              dataUrl,
              fmt,
              data.cell.x + padding,
              data.cell.y + padding,
              size,
              size,
            );
          } catch { /* image embed failed, leave blank */ }
        }
      }
      // Highlight confirmed price cell
      if (hasConfirmedPrices && data.section === 'body' && data.column.index === 5) {
        const lineIndex = data.row.index;
        const line = lines[lineIndex];
        if (line?.confirmedUnitPrice != null) {
          doc.setFillColor(220, 252, 231); // emerald-100
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
          doc.setTextColor(4, 120, 87); // emerald-700
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text(
            fmt(line.confirmedUnitPrice, order.currency),
            data.cell.x + data.cell.width - 3,
            data.cell.y + data.cell.height / 2 + 2.5,
            { align: 'right' },
          );
        }
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Cost breakdown ────────────────────────────────────────────────────────
  const fees = order.transportCost + order.customsCost + order.vatImport +
    order.freightForwarderCost + order.bankFees + order.exchangeFees +
    order.localDelivery + order.otherCosts;

  // Check if we need a new page
  if (y + 70 > pageH - 20) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Récapitulatif des coûts', margin, y);
  y += 6;

  // Two-column layout: cost breakdown left, totals right
  const colW = (contentW - 6) / 2;

  // Left: cost breakdown
  doc.setFillColor(...LIGHT);
  doc.roundedRect(margin, y, colW, 58, 2, 2, 'F');

  const costRows: [string, number][] = [
    ['Sous-total produits', order.subtotal],
    ['Transport', order.transportCost],
    ['Douane', order.customsCost],
    ['TVA import', order.vatImport],
    ['Transitaire', order.freightForwarderCost],
    ['Frais bancaires', order.bankFees],
    ['Frais de change', order.exchangeFees],
    ['Livraison locale', order.localDelivery],
    ['Autres frais', order.otherCosts],
  ];

  let cy = y + 6;
  costRows.forEach(([label, val]) => {
    if (val === 0 && label !== 'Sous-total produits') return;
    doc.setFontSize(8);
    doc.setFont('helvetica', label === 'Sous-total produits' ? 'bold' : 'normal');
    doc.setTextColor(label === 'Sous-total produits' ? DARK[0] : MUTED[0], label === 'Sous-total produits' ? DARK[1] : MUTED[1], label === 'Sous-total produits' ? DARK[2] : MUTED[2]);
    doc.text(label, margin + 4, cy);
    doc.setFont('helvetica', label === 'Sous-total produits' ? 'bold' : 'normal');
    doc.setTextColor(...DARK);
    doc.text(fmt(val, order.currency), margin + colW - 4, cy, { align: 'right' });
    cy += 5.5;
  });

  // Divider
  doc.setDrawColor(...PRIMARY);
  doc.setLineWidth(0.4);
  doc.line(margin + 4, cy, margin + colW - 4, cy);
  cy += 4;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY);
  doc.text('Total frais', margin + 4, cy);
  doc.text(fmt(fees, order.currency), margin + colW - 4, cy, { align: 'right' });

  // Right: totals summary
  const rx = margin + colW + 6;
  doc.setFillColor(...DARK);
  doc.roundedRect(rx, y, colW, 58, 2, 2, 'F');

  const totalRows: [string, string, boolean][] = [
    ['Montant produits', fmt(order.subtotal, order.currency), false],
    ['Total frais', fees > 0 ? `+ ${fmt(fees, order.currency)}` : '—', false],
    ['Coût total réel', fmt(order.totalRealCost, order.currency), true],
    ['Statut paiement', PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus, false],
    ['Solde restant dû', fmt(order.balanceDue, order.currency), order.balanceDue > 0],
  ];

  let ty = y + 10;
  totalRows.forEach(([label, val, highlight]) => {
    doc.setFontSize(highlight ? 10 : 8);
    doc.setFont('helvetica', highlight ? 'bold' : 'normal');
    doc.setTextColor(highlight ? PRIMARY[0] : 200, highlight ? PRIMARY[1] : 190, highlight ? PRIMARY[2] : 255);
    doc.text(label, rx + 5, ty);
    doc.setTextColor(highlight ? PRIMARY[0] : WHITE[0], highlight ? PRIMARY[1] : WHITE[1], highlight ? PRIMARY[2] : WHITE[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(val, rx + colW - 5, ty, { align: 'right' });
    ty += highlight ? 9 : 7;
  });

  y += 64;

  // ── Notes & Terms ─────────────────────────────────────────────────────────
  if (order.notes || order.internalNotes) {
    if (y + 30 > pageH - 20) { doc.addPage(); y = 20; }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text('Notes & Conditions', margin, y);
    y += 6;

    if (order.notes) {
      doc.setFillColor(255, 251, 235);
      const noteLines = doc.splitTextToSize(order.notes, contentW - 8);
      const noteH = noteLines.length * 5 + 8;
      doc.roundedRect(margin, y, contentW, noteH, 2, 2, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(92, 71, 0);
      doc.text(noteLines, margin + 4, y + 6);
      y += noteH + 4;
    }

    if (order.internalNotes) {
      doc.setFillColor(239, 246, 255);
      const internalLines = doc.splitTextToSize(`Note interne: ${order.internalNotes}`, contentW - 8);
      const internalH = internalLines.length * 5 + 8;
      doc.roundedRect(margin, y, contentW, internalH, 2, 2, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(30, 64, 175);
      doc.text(internalLines, margin + 4, y + 6);
      y += internalH + 4;
    }
  }

  // ── Payment terms block ───────────────────────────────────────────────────
  if (y + 28 > pageH - 20) { doc.addPage(); y = 20; }

  doc.setFillColor(249, 250, 251);
  doc.roundedRect(margin, y, contentW, 24, 2, 2, 'F');
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentW, 24, 2, 2, 'S');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Conditions de paiement', margin + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.setFontSize(7.5);
  const termsText = order.paymentMethod
    ? `Mode de règlement: ${order.paymentMethod}  |  Statut: ${PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}  |  Devise: ${order.currency} (taux: ${order.exchangeRate})`
    : `Statut paiement: ${PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}  |  Devise: ${order.currency} (taux: ${order.exchangeRate})`;
  doc.text(termsText, margin + 4, y + 14);
  if (order.paymentDate) {
    doc.text(`Date de paiement: ${fmtDate(order.paymentDate)}`, margin + 4, y + 20);
  }

  y += 30;

  // ── Supplier validation block ─────────────────────────────────────────────
  if (order.supplierValidated && order.supplierComment) {
    if (y + 24 > pageH - 20) { doc.addPage(); y = 20; }
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, y, contentW, 20, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 101, 52);
    doc.text('Validation fournisseur', margin + 4, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const commentLines = doc.splitTextToSize(order.supplierComment, contentW - 8);
    doc.text(commentLines, margin + 4, y + 14);
    y += 26;
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...DARK);
    doc.rect(0, pageH - 12, pageW, 12, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 170, 220);
    doc.text('LE MONDE DE L\'ESTHETIQUE — SAS au capital de 100€ — RCS Fort-de-France 927 747 725 — TVA FR71 927747 725', margin, pageH - 5);
    doc.text(`Page ${i} / ${totalPages}`, pageW - margin, pageH - 5, { align: 'right' });
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, pageW / 2, pageH - 5, { align: 'center' });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  doc.save(`${order.orderNumber}_commande_fournisseur.pdf`);
}

export async function exportOrdersListPDF(orders: { id: string; orderNumber: string; supplierName?: string; orderStatus: string; subtotal: number; totalRealCost: number; currency: string; createdAt: string; transportCost: number; customsCost: number; vatImport: number; freightForwarderCost: number; bankFees: number; exchangeFees: number; localDelivery: number; otherCosts: number }[]): Promise<void> {
  const jsPDFModule = await import('jspdf');
  const jsPDF = jsPDFModule.default || (jsPDFModule as any).jsPDF;
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;

  const PRIMARY = [139, 92, 246] as [number, number, number];
  const DARK    = [30, 27, 75]   as [number, number, number];
  const LIGHT   = [245, 243, 255] as [number, number, number];
  const WHITE   = [255, 255, 255] as [number, number, number];

  // Header
  doc.setFillColor(...DARK);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setFillColor(...PRIMARY);
  doc.circle(margin + 8, 14, 7, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('B', margin + 8, 17.5, { align: 'center' });
  doc.setFontSize(12);
  doc.text("LE MONDE DE L'ESTHETIQUE", margin + 18, 12);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 190, 255);
  doc.text('RCS Fort-de-France 927 747 725  |  TVA FR71 927747 725', margin + 18, 18);
  doc.text('Historique des commandes fournisseurs', margin + 18, 23);
  doc.setTextColor(...WHITE);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`${orders.length} commande${orders.length !== 1 ? 's' : ''}`, pageW - margin, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(200, 190, 255);
  doc.text(`Exporté le ${new Date().toLocaleDateString('fr-FR')}`, pageW - margin, 20, { align: 'right' });

  const rows = orders.map((o) => {
    const fees = o.transportCost + o.customsCost + o.vatImport + o.freightForwarderCost + o.bankFees + o.exchangeFees + o.localDelivery + o.otherCosts;
    return [
      o.orderNumber,
      o.supplierName || '—',
      STATUS_LABELS[o.orderStatus] || o.orderStatus,
      `${o.subtotal.toFixed(2)} ${o.currency}`,
      fees > 0 ? `+${fees.toFixed(2)} ${o.currency}` : '—',
      `${o.totalRealCost.toFixed(2)} ${o.currency}`,
      new Date(o.createdAt).toLocaleDateString('fr-FR'),
    ];
  });

  autoTable(doc, {
    startY: 34,
    head: [['N° Commande', 'Fournisseur', 'Statut', 'Montant produits', 'Frais totaux', 'Coût réel total', 'Date création']],
    body: rows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8.5, cellPadding: 3.5, textColor: DARK, lineColor: [229, 231, 235], lineWidth: 0.3 },
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { fontStyle: 'bold' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'center' },
    },
  });

  // Footer
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...DARK);
    doc.rect(0, pageH - 10, pageW, 10, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 170, 220);
    doc.text("LE MONDE DE L'ESTHETIQUE — RCS Fort-de-France 927 747 725 — TVA FR71 927747 725", margin, pageH - 4);
    doc.text(`Page ${i} / ${totalPages}`, pageW - margin, pageH - 4, { align: 'right' });
  }

  doc.save(`historique_commandes_fournisseurs_${new Date().toISOString().slice(0, 10)}.pdf`);
}
