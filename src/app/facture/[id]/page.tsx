import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';

const ROSE = '#e91e8c';
const ROSE_LIGHT = '#fce4ec';
const ROSE_PALE = '#fff0f7';

const TYPE_LABELS: Record<string, string> = {
  estimate: 'Devis',
  proforma: 'Facture Pro Forma',
  invoice: 'Facture',
  credit_note: 'Avoir',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Brouillon', color: '#888' },
  sent: { label: 'Envoyé', color: '#1976d2' },
  accepted: { label: 'Accepté', color: '#388e3c' },
  rejected: { label: 'Refusé', color: '#d32f2f' },
  paid: { label: 'Payé', color: '#388e3c' },
  overdue: { label: 'En retard', color: '#f57c00' },
  cancelled: { label: 'Annulé', color: '#757575' },
  completed: { label: 'Payé', color: '#388e3c' },
};

function fmt(n: number) {
  return n.toFixed(2).replace('.', ',') + ' €';
}

function fmtDate(s: string) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('fr-FR');
}

function esc(s: string) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderPage(doc: {
  number: string;
  typeLabel: string;
  statusLabel: string;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  clientSiret: string;
  clientTva: string;
  sellerName: string;
  sellerAddress: string;
  sellerSiret: string;
  sellerTva: string;
  issueDate: string;
  dueDate: string;
  notes: string;
  paymentTerms: string;
  totalHt: number;
  totalTva: number;
  totalTtc: number;
  isDevis: boolean;
  hasImages: boolean;
  linesHtml: string;
}) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(doc.typeLabel)} ${esc(doc.number)} — Le Monde de l'Esthétique</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #f5f5f5; color: #222; }
    .page { max-width: 800px; margin: 24px auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 32px rgba(0,0,0,.10); overflow: hidden; }
    .header { background: ${ROSE}; color: #fff; padding: 28px 32px 22px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-title { font-size: 26px; font-weight: 900; letter-spacing: .5px; }
    .header-sub { font-size: 12px; opacity: .85; margin-top: 4px; }
    .header-right { text-align: right; }
    .header-number { font-size: 20px; font-weight: 700; }
    .header-date { font-size: 12px; opacity: .85; margin-top: 4px; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; margin-top: 6px; background: rgba(255,255,255,.22); color: #fff; }
    .body { padding: 28px 32px; }
    .parties { display: flex; gap: 24px; margin-bottom: 24px; }
    .party { flex: 1; background: #fafafa; border-radius: 8px; padding: 14px 16px; border: 1px solid #eee; }
    .party-title { font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${ROSE}; letter-spacing: .8px; margin-bottom: 8px; }
    .party-name { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
    .party-detail { font-size: 11px; color: #555; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead { background: ${ROSE}; color: #fff; }
    th { padding: 8px 10px; font-size: 10px; text-align: left; font-weight: 700; }
    td { padding: 8px 10px; font-size: 12px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
    tr:nth-child(even) td { background: ${ROSE_PALE}; }
    .prod-img { width: 44px; height: 44px; object-fit: cover; border-radius: 6px; border: 1px solid #eee; display: block; }
    .prod-img-placeholder { width: 44px; height: 44px; border-radius: 6px; background: ${ROSE_LIGHT}; display: block; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 20px; }
    .totals-table { width: 280px; }
    .totals-table td { border-bottom: none; font-size: 12px; padding: 4px 8px; }
    .totals-row-final td { background: ${ROSE}; color: #fff; font-size: 14px; font-weight: 700; border-radius: 6px; }
    .notes { background: #f9f9f9; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 11px; color: #555; }
    .devis-notice { background: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; font-size: 11px; font-style: italic; }
    .footer { border-top: 2px solid ${ROSE_LIGHT}; padding-top: 14px; font-size: 10px; color: #aaa; line-height: 1.8; }
    .print-btn { display: flex; justify-content: center; gap: 12px; padding: 20px; background: #f9f9f9; border-top: 1px solid ${ROSE_LIGHT}; }
    @media print { .print-btn { display: none; } body { background: #fff; } .page { box-shadow: none; margin: 0; border-radius: 0; } }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="header-title">Le Monde de l'Esthétique</div>
      <div class="header-sub">${esc(doc.sellerAddress || '')}</div>
    </div>
    <div class="header-right">
      <div class="header-number">${esc(doc.typeLabel)} n° ${esc(doc.number)}</div>
      <div class="header-date">Date : ${fmtDate(doc.issueDate)}${doc.dueDate ? ' · Échéance : ' + fmtDate(doc.dueDate) : ''}</div>
      <div class="status-badge">${esc(doc.statusLabel)}</div>
    </div>
  </div>

  <div class="body">
    <div class="parties">
      <div class="party">
        <div class="party-title">Émetteur</div>
        <div class="party-name">${esc(doc.sellerName)}</div>
        <div class="party-detail">${esc(doc.sellerAddress || '')}${doc.sellerSiret ? '<br>SIRET : ' + esc(doc.sellerSiret) : ''}${doc.sellerTva ? '<br>TVA : ' + esc(doc.sellerTva) : ''}</div>
      </div>
      <div class="party">
        <div class="party-title">Client</div>
        <div class="party-name">${esc(doc.clientName)}</div>
        <div class="party-detail">${esc(doc.clientAddress || '')}${doc.clientEmail ? '<br>' + esc(doc.clientEmail) : ''}${doc.clientSiret ? '<br>SIRET : ' + esc(doc.clientSiret) : ''}${doc.clientTva ? '<br>TVA : ' + esc(doc.clientTva) : ''}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          ${doc.hasImages ? '<th style="width:52px"></th>' : ''}
          <th style="width:38%">Description</th>
          <th style="width:9%;text-align:center">Qté</th>
          <th style="width:14%;text-align:right">Prix unit.</th>
          <th style="width:9%;text-align:center">TVA</th>
          <th style="width:9%;text-align:center">Remise</th>
          <th style="width:14%;text-align:right">Total TTC</th>
        </tr>
      </thead>
      <tbody>${doc.linesHtml}</tbody>
    </table>

    <div class="totals">
      <table class="totals-table">
        <tr><td>Total HT</td><td style="text-align:right">${fmt(doc.totalHt)}</td></tr>
        <tr><td>Total TVA</td><td style="text-align:right">${fmt(doc.totalTva)}</td></tr>
        <tr class="totals-row-final"><td>TOTAL TTC</td><td style="text-align:right">${fmt(doc.totalTtc)}</td></tr>
      </table>
    </div>

    ${doc.paymentTerms ? `<div class="notes"><strong style="color:${ROSE}">Conditions de paiement :</strong> ${esc(doc.paymentTerms)}</div>` : ''}
    ${doc.notes ? `<div class="notes"><strong>Notes :</strong> ${esc(doc.notes)}</div>` : ''}
    ${doc.isDevis ? `<div class="devis-notice">Devis valable 30 jours à compter du ${fmtDate(doc.issueDate)}. Sans engagement de votre part.</div>` : ''}

    <div class="footer">
      ${doc.sellerSiret ? `SIRET : ${esc(doc.sellerSiret)} &nbsp;|&nbsp; ` : ''}
      ${doc.sellerTva ? `N° TVA : ${esc(doc.sellerTva)}` : ''}
      <br>Document généré par BeautyPOS — Le Monde de l'Esthétique
    </div>
  </div>

  <div class="print-btn">
    <button onclick="window.print()" style="padding:10px 24px;background:${ROSE};color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:Arial,sans-serif;">
      Imprimer / Télécharger PDF
    </button>
  </div>
</div>
</body>
</html>`;
}

export default async function FacturePublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  // ── 1. Try factures table first ─────────────────────────────────────────────
  const { data: factureData } = await supabase.from('factures').select('*').eq('id', id).maybeSingle();

  if (factureData) {
    const items = (factureData.items as Record<string, unknown>) || {};
    const lines: Array<Record<string, unknown>> = Array.isArray(items.lines) ? items.lines as Array<Record<string, unknown>> : [];
    const hasImages = lines.some((l) => l.imageUrl);
    const docType = (factureData.doc_type as string) || 'invoice';
    const typeLabel = TYPE_LABELS[docType] || docType;
    const status = (factureData.status as string) || 'draft';
    const statusCfg = STATUS_LABELS[status] || { label: status, color: '#888' };

    const linesHtml = lines.map(l => {
      const qty = Number(l.quantity) || 0;
      const pu = Number(l.unitPrice) || 0;
      const tva = Number(l.tvaRate) || 0;
      const disc = Number(l.discount) || 0;
      const lineHt = qty * pu * (1 - disc / 100);
      const lineTtc = lineHt * (1 + tva / 100);
      const imgCell = hasImages
        ? (l.imageUrl
            ? `<td style="padding:4px 6px;text-align:center"><img src="${esc(l.imageUrl as string)}" class="prod-img" onerror="this.style.display='none'" /></td>`
            : `<td style="padding:4px 6px;text-align:center"><div class="prod-img-placeholder"></div></td>`)
        : '';
      return `<tr>${imgCell}<td>${esc(l.description as string || '')}</td><td style="text-align:center">${qty}</td><td style="text-align:right">${pu.toFixed(2)} €</td><td style="text-align:center">${tva}%</td><td style="text-align:center">${disc > 0 ? disc + '%' : '—'}</td><td style="text-align:right;font-weight:600">${lineTtc.toFixed(2)} €</td></tr>`;
    }).join('');

    const html = renderPage({
      number: (factureData.numero as string) || (factureData.id as string),
      typeLabel,
      statusLabel: statusCfg.label,
      clientName: (factureData.client_name as string) || (items.clientId as string) || '',
      clientAddress: (items.clientAddress as string) || '',
      clientEmail: (factureData.client_email as string) || '',
      clientSiret: (items.clientSiret as string) || '',
      clientTva: (items.clientTva as string) || '',
      sellerName: (items.sellerName as string) || "Le Monde de l'Esthétique",
      sellerAddress: (items.sellerAddress as string) || '',
      sellerSiret: (items.sellerSiret as string) || '',
      sellerTva: (items.sellerTva as string) || '',
      issueDate: (items.issueDate as string) || (factureData.created_at as string) || '',
      dueDate: (items.dueDate as string) || '',
      notes: (items.notes as string) || '',
      paymentTerms: (items.paymentTerms as string) || '',
      totalHt: Number(factureData.total_ht) || 0,
      totalTva: Number(factureData.total_tva) || 0,
      totalTtc: Number(factureData.total_ttc) || 0,
      isDevis: docType === 'estimate' || docType === 'proforma',
      hasImages,
      linesHtml,
    });

    return (
      <html lang="fr" suppressHydrationWarning>
        <head />
        <body dangerouslySetInnerHTML={{ __html: html }} />
      </html>
    );
  }

  // ── 2. Fallback: try receipts table (used by devis-pro WhatsApp links) ───────
  const { data: receiptData } = await supabase.from('receipts').select('*').eq('id', id).maybeSingle();

  if (!receiptData) notFound();

  const receiptItems: Array<Record<string, unknown>> = Array.isArray(receiptData.items) ? receiptData.items : [];
  const hasImages = receiptItems.some((i) => i.image_url);

  // Compute totals from receipt
  const totalTtc = Number(receiptData.total_amount) || 0;
  const totalHt = Number(receiptData.subtotal_ht) || (totalTtc / 1.085);
  const totalTva = Number(receiptData.total_tva) || (totalTtc - totalHt);

  const linesHtml = receiptItems.map(l => {
    const qty = Number(l.qty ?? l.quantity) || 1;
    const price = Number(l.price) || 0;
    const tva = Number(l.tva) || 8.5;
    const disc = Number(l.discount) || 0;
    const discType = (l.discount_type as string) || 'percent';
    const discAmt = discType === 'percent' ? price * qty * (disc / 100) : disc;
    const lineTtc = Math.max(0, price * qty - discAmt);
    const imgCell = hasImages
      ? (l.image_url
          ? `<td style="padding:4px 6px;text-align:center"><img src="${esc(l.image_url as string)}" class="prod-img" onerror="this.style.display='none'" /></td>`
          : `<td style="padding:4px 6px;text-align:center"><div class="prod-img-placeholder"></div></td>`)
      : '';
    const discStr = disc > 0 ? (discType === 'percent' ? disc + '%' : fmt(disc)) : '—';
    return `<tr>${imgCell}<td>${esc(l.name as string || '')}</td><td style="text-align:center">${qty}</td><td style="text-align:right">${price.toFixed(2)} €</td><td style="text-align:center">${tva}%</td><td style="text-align:center">${discStr}</td><td style="text-align:right;font-weight:600">${lineTtc.toFixed(2)} €</td></tr>`;
  }).join('');

  const ticketNum = (receiptData.ticket_number as string) || id.slice(0, 8).toUpperCase();
  const status = (receiptData.status as string) || 'completed';
  const statusCfg = STATUS_LABELS[status] || { label: 'Payé', color: '#388e3c' };

  const html = renderPage({
    number: `FAC-${ticketNum}`,
    typeLabel: 'Facture',
    statusLabel: statusCfg.label,
    clientName: (receiptData.client_name as string) || '',
    clientAddress: '',
    clientEmail: '',
    clientSiret: '',
    clientTva: '',
    sellerName: "Le Monde de l'Esthétique",
    sellerAddress: '',
    sellerSiret: '',
    sellerTva: '',
    issueDate: (receiptData.created_at as string) || '',
    dueDate: '',
    notes: (receiptData.notes as string) || '',
    paymentTerms: '',
    totalHt,
    totalTva,
    totalTtc,
    isDevis: false,
    hasImages,
    linesHtml,
  });

  return (
    <html lang="fr" suppressHydrationWarning>
      <head />
      <body dangerouslySetInnerHTML={{ __html: html }} />
    </html>
  );
}
