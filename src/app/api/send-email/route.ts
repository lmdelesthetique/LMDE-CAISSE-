import { NextRequest, NextResponse } from 'next/server';

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'LMDE Caisse <noreply@lmdecaisse.com>';

// ─── French locale helpers ────────────────────────────────────────────────────

function formatCurrency(v: number): string {
  return v.toFixed(2).replace('.', ',') + '\u00a0€';
}

function formatDate(d: string): string {
  if (!d) return '—';
  const parts = d.substring(0, 10).split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ─── Base layout ──────────────────────────────────────────────────────────────

function baseLayout(content: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #18181b; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); padding: 32px 40px; }
    .header h1 { margin: 0; color: #fff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .header p { margin: 6px 0 0; color: rgba(255,255,255,0.8); font-size: 13px; }
    .badge { display: inline-block; background: rgba(255,255,255,0.2); color: #fff; border-radius: 20px; padding: 3px 12px; font-size: 12px; font-weight: 600; margin-top: 10px; }
    .body { padding: 32px 40px; }
    .greeting { font-size: 15px; color: #3f3f46; margin-bottom: 24px; }
    .info-box { background: #fafafa; border: 1px solid #e4e4e7; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; }
    .info-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #71717a; }
    .info-value { font-weight: 600; color: #18181b; }
    table.items { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
    table.items thead tr { background: #f4f4f5; }
    table.items th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; }
    table.items th.right, table.items td.right { text-align: right; }
    table.items td { padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #3f3f46; }
    table.items tr:last-child td { border-bottom: none; }
    .totals { margin-left: auto; width: 260px; }
    .total-row { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; color: #71717a; }
    .total-deposit { display: flex; justify-content: space-between; font-size: 14px; font-weight: 600; padding: 5px 0; color: #059669; }
    .total-balance { display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; padding: 8px 0 0; border-top: 2px solid #e4e4e7; color: #dc2626; margin-top: 4px; }
    .total-final { display: flex; justify-content: space-between; font-size: 16px; font-weight: 700; padding: 10px 0 0; border-top: 2px solid #18181b; color: #18181b; margin-top: 6px; }
    .total-final span:last-child { color: #7c3aed; }
    .cta-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px 20px; margin: 24px 0; }
    .cta-box p { margin: 0; font-size: 13px; color: #166534; }
    .footer { background: #fafafa; border-top: 1px solid #e4e4e7; padding: 20px 40px; text-align: center; font-size: 11px; color: #a1a1aa; }
    .divider { height: 1px; background: #e4e4e7; margin: 20px 0; }
    .highlight { color: #7c3aed; font-weight: 700; }
    .company-header { text-align: center; padding: 20px 0 16px; border-bottom: 2px dashed #e4e4e7; margin-bottom: 20px; }
    .company-name { font-size: 20px; font-weight: 700; color: #7c3aed; letter-spacing: 0.5px; }
    .company-details { font-size: 12px; color: #71717a; margin-top: 4px; line-height: 1.6; }
    .res-number-badge { display: inline-block; background: #f5f3ff; border: 2px solid #7c3aed; color: #7c3aed; border-radius: 8px; padding: 6px 18px; font-size: 18px; font-weight: 700; letter-spacing: 2px; margin: 12px 0; }
    .status-pill { display: inline-block; padding: 3px 14px; border-radius: 20px; font-size: 11px; font-weight: 600; background: #f5f3ff; color: #7c3aed; margin-top: 4px; }
    .product-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f4f4f5; }
    .product-img { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; border: 1px solid #e4e4e7; }
    .product-img-placeholder { width: 48px; height: 48px; border-radius: 8px; background: #f4f4f5; border: 1px solid #e4e4e7; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
    .product-info { flex: 1; }
    .product-name { font-size: 13px; font-weight: 600; color: #18181b; }
    .product-meta { font-size: 11px; color: #71717a; margin-top: 2px; }
    .product-price { text-align: right; font-size: 13px; font-weight: 700; color: #18181b; }
    .product-qty { font-size: 11px; color: #71717a; }
    .conditions-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px 18px; margin-top: 20px; font-size: 12px; color: #92400e; line-height: 1.6; }
    .conditions-title { font-weight: 700; margin-bottom: 6px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrapper">
    ${content}
    <div class="footer">
      <p>LMDE Caisse — Logiciel de caisse professionnel</p>
      <p style="margin-top:4px">Cet email a été envoyé automatiquement. Ne pas répondre directement.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Receipt template ─────────────────────────────────────────────────────────

interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
  discount?: number;
}

interface ReceiptData {
  ticketNumber: string;
  date: string;
  clientName?: string;
  items: ReceiptItem[];
  subtotalHT: number;
  totalTVA: number;
  totalTTC: number;
  paymentMethod: string;
  cashierName?: string;
  loyaltyPoints?: number;
}

function buildReceiptHTML(d: ReceiptData): string {
  const rows = d.items.map((i) => {
    const lineTotal = i.price * i.qty * (1 - (i.discount ?? 0) / 100);
    return `<tr>
      <td>${i.name}</td>
      <td class="right">${i.qty}</td>
      <td class="right">${formatCurrency(i.price)}</td>
      <td class="right">${formatCurrency(lineTotal)}</td>
    </tr>`;
  }).join('');

  const content = `
    <div class="header">
      <h1>🧾 Ticket de caisse</h1>
      <p>LMDE Caisse — ${d.date}</p>
      <span class="badge">N° ${d.ticketNumber}</span>
    </div>
    <div class="body">
      <p class="greeting">
        ${d.clientName ? `Bonjour <strong>${d.clientName}</strong>,` : 'Bonjour,'}
        <br/>Merci pour votre achat. Voici votre ticket de caisse.
      </p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Date</span><span class="info-value">${d.date}</span></div>
        <div class="info-row"><span class="info-label">Ticket N°</span><span class="info-value">${d.ticketNumber}</span></div>
        <div class="info-row"><span class="info-label">Mode de paiement</span><span class="info-value">${d.paymentMethod}</span></div>
        ${d.cashierName ? `<div class="info-row"><span class="info-label">Caissier</span><span class="info-value">${d.cashierName}</span></div>` : ''}
      </div>
      <table class="items">
        <thead><tr><th>Article</th><th class="right">Qté</th><th class="right">P.U. TTC</th><th class="right">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        <div class="total-row"><span>Sous-total HT</span><span>${formatCurrency(d.subtotalHT)}</span></div>
        <div class="total-row"><span>TVA</span><span>${formatCurrency(d.totalTVA)}</span></div>
        <div class="total-final"><span>TOTAL TTC</span><span>${formatCurrency(d.totalTTC)}</span></div>
      </div>
      ${d.loyaltyPoints ? `<div class="cta-box" style="background:#faf5ff;border-color:#e9d5ff;margin-top:20px"><p style="color:#6b21a8">⭐ <strong>+${d.loyaltyPoints} points fidélité</strong> crédités sur votre compte !</p></div>` : ''}
      <div class="divider"></div>
      <p style="font-size:13px;color:#71717a;text-align:center">Merci de votre confiance et à bientôt 💜</p>
    </div>`;

  return baseLayout(content, `Ticket de caisse N° ${d.ticketNumber}`);
}

// ─── Invoice template ─────────────────────────────────────────────────────────

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  tvaRate: number;
  discount: number;
}

interface InvoiceData {
  type: 'invoice' | 'proforma' | 'credit_note' | 'estimate';
  number: string;
  issueDate: string;
  dueDate: string;
  clientName: string;
  clientEmail: string;
  clientAddress?: string;
  clientSiret?: string;
  clientTva?: string;
  lines: LineItem[];
  totalHt: number;
  totalTva: number;
  totalTtc: number;
  paymentTerms: string;
  notes?: string;
  sellerName?: string;
}

const DOC_LABELS: Record<string, string> = {
  invoice: 'Facture',
  proforma: 'Facture Proforma',
  credit_note: 'Avoir',
  estimate: 'Devis',
};

const DOC_COLORS: Record<string, string> = {
  invoice: '#059669',
  proforma: '#7c3aed',
  credit_note: '#ea580c',
  estimate: '#2563eb',
};

function buildInvoiceHTML(d: InvoiceData): string {
  const label = DOC_LABELS[d.type] ?? 'Document';
  const color = DOC_COLORS[d.type] ?? '#7c3aed';
  const isEstimate = d.type === 'estimate';

  const rows = d.lines.map((l) => {
    const base = l.quantity * l.unitPrice;
    const afterDiscount = base * (1 - l.discount / 100);
    const tva = afterDiscount * (l.tvaRate / 100);
    return `<tr>
      <td>${l.description}</td>
      <td class="right">${l.quantity}</td>
      <td class="right">${formatCurrency(l.unitPrice)}</td>
      <td class="right">${l.tvaRate}%</td>
      <td class="right">${l.discount > 0 ? l.discount + '%' : '—'}</td>
      <td class="right">${formatCurrency(afterDiscount)}</td>
      <td class="right">${formatCurrency(afterDiscount + tva)}</td>
    </tr>`;
  }).join('');

  const content = `
    <div class="header" style="background: linear-gradient(135deg, ${color} 0%, ${color}cc 100%)">
      <h1>📄 ${label}</h1>
      <p>${d.sellerName ?? 'LMDE Caisse'} — Émis le ${formatDate(d.issueDate)}</p>
      <span class="badge">N° ${d.number}</span>
    </div>
    <div class="body">
      <p class="greeting">Bonjour <strong>${d.clientName}</strong>,<br/>
        ${isEstimate ? `Veuillez trouver ci-dessous votre devis n° <span class="highlight">${d.number}</span>, valable 30 jours.` : `Veuillez trouver ci-dessous votre ${label.toLowerCase()} n° <span class="highlight">${d.number}</span>.`}
      </p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Numéro</span><span class="info-value">${d.number}</span></div>
        <div class="info-row"><span class="info-label">Date d'émission</span><span class="info-value">${formatDate(d.issueDate)}</span></div>
        ${d.dueDate ? `<div class="info-row"><span class="info-label">Date d'échéance</span><span class="info-value">${formatDate(d.dueDate)}</span></div>` : ''}
        <div class="info-row"><span class="info-label">Conditions de paiement</span><span class="info-value">${d.paymentTerms}</span></div>
        ${d.clientAddress ? `<div class="info-row"><span class="info-label">Adresse</span><span class="info-value">${d.clientAddress}</span></div>` : ''}
        ${d.clientSiret ? `<div class="info-row"><span class="info-label">SIRET</span><span class="info-value">${d.clientSiret}</span></div>` : ''}
        ${d.clientTva ? `<div class="info-row"><span class="info-label">N° TVA</span><span class="info-value">${d.clientTva}</span></div>` : ''}
      </div>
      <table class="items">
        <thead><tr><th>Description</th><th class="right">Qté</th><th class="right">P.U. HT</th><th class="right">TVA</th><th class="right">Remise</th><th class="right">Total HT</th><th class="right">Total TTC</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        <div class="total-row"><span>Total HT</span><span>${formatCurrency(d.totalHt)}</span></div>
        <div class="total-row"><span>Total TVA</span><span>${formatCurrency(d.totalTva)}</span></div>
        <div class="total-final"><span>Total TTC</span><span>${formatCurrency(d.totalTtc)}</span></div>
      </div>
      ${isEstimate ? `<div class="cta-box" style="background:#eff6ff;border-color:#bfdbfe;margin-top:20px"><p style="color:#1e40af">ℹ️ Ce devis est valable <strong>30 jours</strong> à compter de sa date d'émission.</p></div>` : `<div class="cta-box" style="margin-top:20px"><p>✅ Règlement à effectuer selon les conditions : <strong>${d.paymentTerms}</strong></p></div>`}
      ${d.notes ? `<div class="divider"></div><p style="font-size:13px;color:#71717a"><strong>Notes :</strong> ${d.notes}</p>` : ''}
      <div class="divider"></div>
      <p style="font-size:12px;color:#a1a1aa;text-align:center">En cas de retard de paiement, des pénalités de retard au taux de 3 fois le taux légal seront appliquées.</p>
    </div>`;

  return baseLayout(content, `${label} N° ${d.number}`);
}

// ─── Reservation template ─────────────────────────────────────────────────────

interface ReservationItem {
  name: string;
  qty: number;
  price: number;
  sku?: string;
  imageUrl?: string;
  variant?: string;
  color?: string;
  size?: string;
  model?: string;
}

interface CompanyInfo {
  name: string;
  address?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  siret?: string;
  tvaNumber?: string;
  logo?: string;
}

interface ReservationData {
  reservationNumber: string;
  reservationDate: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  items: ReservationItem[];
  totalAmount: number;
  depositPaid: number;
  balanceDue: number;
  recoveryMode: string;
  pickupDate?: string;
  status: string;
  cashierName?: string;
  notes?: string;
  company?: CompanyInfo;
}

const STATUS_LABELS_FR: Record<string, string> = {
  pending: 'En attente',
  deposit_paid: 'Acompte versé',
  ready: 'Prêt à retirer',
  completed: 'Complété',
  cancelled: 'Annulé',
};

const RECOVERY_LABELS_FR: Record<string, string> = {
  sur_place: 'À récupérer sur place',
  a_livrer: 'À livrer',
  livraison_en_cours: 'Livraison en cours',
  expedie: 'Expédié',
  recupere: 'Récupéré',
};

function buildReservationHTML(d: ReservationData): string {
  const company = d.company ?? {} as CompanyInfo;
  const companyName = company.name ?? 'LE MONDE DE L\'ESTHETIQUE';
  const statusLabel = STATUS_LABELS_FR[d.status] ?? d.status;
  const recoveryLabel = RECOVERY_LABELS_FR[d.recoveryMode] ?? d.recoveryMode;

  const itemRows = d.items.map((item) => {
    const variantParts: string[] = [];
    if (item.color) variantParts.push(item.color);
    if (item.size) variantParts.push(item.size);
    if (item.model) variantParts.push(item.model);
    if (item.variant) variantParts.push(item.variant);
    const variantLabel = variantParts.join(' · ');
    const lineTotal = item.qty * item.price;
    return `
    <div class="product-row">
      ${item.imageUrl ? `<img src="${item.imageUrl}" class="product-img" alt="${item.name}" />` : `<div class="product-img-placeholder">🛍</div>`}
      <div class="product-info">
        <div class="product-name">${item.name}</div>
        <div class="product-meta">${item.sku ? `Réf: ${item.sku}` : ''}${variantLabel ? ` · ${variantLabel}` : ''}</div>
      </div>
      <div class="product-price">
        <div>${formatCurrency(lineTotal)}</div>
        <div class="product-qty">× ${item.qty} · ${formatCurrency(item.price)}/u</div>
      </div>
    </div>`;
  }).join('');

  const content = `
    <div class="header">
      <h1>🎫 Ticket de Réservation</h1>
      <p>${companyName} — ${formatDate(d.reservationDate)}</p>
      <span class="badge">N° ${d.reservationNumber}</span>
    </div>
    <div class="body">
      <div class="company-header">
        ${company.logo ? `<img src="${company.logo}" alt="${companyName}" style="height:48px;margin-bottom:8px;" />` : ''}
        <div class="company-name">${companyName}</div>
        <div class="company-details">
          ${company.address ? `${company.address}<br/>` : ''}
          ${(company.postalCode || company.city) ? `${company.postalCode ?? ''} ${company.city ?? ''}<br/>` : ''}
          ${company.phone ? `📞 ${company.phone}` : ''}${company.email ? ` · ✉️ ${company.email}` : ''}
        </div>
        <div class="res-number-badge">${d.reservationNumber}</div><br/>
        <span class="status-pill">${statusLabel}</span>
      </div>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Nom</span><span class="info-value">${d.clientName}</span></div>
        ${d.clientPhone ? `<div class="info-row"><span class="info-label">Téléphone</span><span class="info-value">${d.clientPhone}</span></div>` : ''}
        ${d.clientEmail ? `<div class="info-row"><span class="info-label">Email</span><span class="info-value">${d.clientEmail}</span></div>` : ''}
        <div class="info-row"><span class="info-label">Date réservation</span><span class="info-value">${formatDate(d.reservationDate)}</span></div>
        <div class="info-row"><span class="info-label">Mode de récupération</span><span class="info-value">${recoveryLabel}</span></div>
        ${d.pickupDate ? `<div class="info-row"><span class="info-label">Date prévue de retrait</span><span class="info-value">${formatDate(d.pickupDate)}</span></div>` : ''}
        ${d.cashierName ? `<div class="info-row"><span class="info-label">Conseiller(e)</span><span class="info-value">${d.cashierName}</span></div>` : ''}
      </div>
      <div style="margin-bottom:20px">${itemRows}</div>
      <div class="totals" style="width:100%;max-width:300px;margin-left:auto">
        <div class="total-row"><span>Total commande</span><span style="font-weight:700;color:#18181b">${formatCurrency(d.totalAmount)}</span></div>
        <div class="total-deposit"><span>✅ Acompte versé</span><span>- ${formatCurrency(d.depositPaid)}</span></div>
        <div class="total-balance"><span>💳 Solde à régler</span><span>${formatCurrency(d.balanceDue)}</span></div>
      </div>
      ${d.notes ? `<div class="divider"></div><div style="background:#fafafa;border-left:3px solid #7c3aed;padding:10px 14px;border-radius:0 8px 8px 0;font-size:12px;color:#3f3f46">📝 <strong>Note :</strong> ${d.notes}</div>` : ''}
      <div class="conditions-box">
        <div class="conditions-title">📋 Conditions de réservation</div>
        <ul style="margin:0;padding-left:16px">
          <li>L'acompte versé est non remboursable sauf accord préalable.</li>
          <li>Veuillez vous présenter avec ce ticket lors du retrait.</li>
          <li>Le solde restant doit être réglé lors de la récupération.</li>
        </ul>
      </div>
      <div class="divider"></div>
      <p style="font-size:13px;color:#71717a;text-align:center">Merci de votre confiance et à bientôt ! 💜</p>
    </div>`;

  return baseLayout(content, `Ticket de réservation N° ${d.reservationNumber}`);
}

// ─── Supplier credentials template ───────────────────────────────────────────

interface SupplierCredentialsData {
  supplierName: string;
  email: string;
  password: string;
  portalUrl: string;
}

function buildSupplierCredentialsHTML(d: SupplierCredentialsData): string {
  const content = `
    <div class="header" style="background: linear-gradient(135deg, #be185d 0%, #db2777 100%)">
      <h1>🔑 Accès Portail Fournisseur</h1>
      <p>LMDE Caisse — Vos identifiants de connexion</p>
      <span class="badge">Portail Partenaire</span>
    </div>
    <div class="body">
      <p class="greeting">Bonjour <strong>${d.supplierName}</strong>,</p>
      <p style="font-size:14px;color:#3f3f46;margin-bottom:20px">Votre accès au portail fournisseur a été créé.</p>
      <div class="info-box" style="background:#fdf2f8;border-color:#fbcfe8">
        <div class="info-row"><span class="info-label">🌐 URL du portail</span><span class="info-value" style="color:#be185d">${d.portalUrl}</span></div>
        <div class="info-row"><span class="info-label">📧 Email</span><span class="info-value">${d.email}</span></div>
        <div class="info-row"><span class="info-label">🔒 Mot de passe temporaire</span><span class="info-value" style="letter-spacing:2px">${d.password}</span></div>
      </div>
      <div class="cta-box" style="background:#fff7ed;border-color:#fed7aa">
        <p style="color:#9a3412">⚠️ <strong>Important :</strong> Changez votre mot de passe dès votre première connexion.</p>
      </div>
      <div class="divider"></div>
      <p style="font-size:13px;color:#71717a;text-align:center">Bienvenue dans l'espace partenaire 💜</p>
    </div>`;
  return baseLayout(content, 'Vos identifiants Portail Fournisseur');
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    if (!RESEND_API_KEY) {
      return NextResponse.json(
        { error: 'RESEND_API_KEY non configurée' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { type, to, subject, data } = body as {
      type: string;
      to: string;
      subject?: string;
      data: ReceiptData | InvoiceData | ReservationData | SupplierCredentialsData;
    };

    if (!to || !type || !data) {
      return NextResponse.json(
        { error: 'Paramètres manquants : to, type, data requis' },
        { status: 400 }
      );
    }

    let html = '';
    let emailSubject = subject ?? '';

    if (type === 'receipt') {
      const d = data as ReceiptData;
      html = buildReceiptHTML(d);
      if (!emailSubject) emailSubject = `Votre ticket de caisse N° ${d.ticketNumber} — LMDE Caisse`;
    } else if (type === 'reservation') {
      const d = data as ReservationData;
      html = buildReservationHTML(d);
      if (!emailSubject) emailSubject = `Votre ticket de réservation N° ${d.reservationNumber}`;
    } else if (type === 'supplier_credentials') {
      const d = data as SupplierCredentialsData;
      html = buildSupplierCredentialsHTML(d);
      if (!emailSubject) emailSubject = 'Vos identifiants Portail Fournisseur — LMDE Caisse';
    } else {
      const d = data as InvoiceData;
      html = buildInvoiceHTML({ ...d, type: type as InvoiceData['type'] });
      const label = DOC_LABELS[type] ?? 'Document';
      if (!emailSubject) emailSubject = `${label} N° ${d.number} — LMDE Caisse`;
    }

    const resendPayload = {
      from: RESEND_FROM_EMAIL,
      to: [to],
      subject: emailSubject,
      html,
    };

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(resendPayload),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error('[send-email API] Resend error:', resendData);
      return NextResponse.json(
        { error: resendData?.message ?? 'Erreur Resend', details: resendData },
        { status: resendRes.status }
      );
    }

    return NextResponse.json({ success: true, id: resendData.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('[send-email API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
