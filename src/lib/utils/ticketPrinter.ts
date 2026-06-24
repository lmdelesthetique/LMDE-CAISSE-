export interface TicketPrintData {
  ticketNumber: string;
  dateStr: string;
  timeStr: string;
  cashierLabel: string;
  clientName?: string;
  items: Array<{
    name: string;
    qty: number;
    price: number;
    discount?: number;
    discountType?: 'percent' | 'amount';
    promoName?: string;
  }>;
  subtotalHT: number;
  totalTVA: number;
  totalTTC: number;
  tvaRate: number;
  paymentMethod: string;
  loyalty?: {
    pointsEarned: number;
    totalPoints: number;
    currentTierName?: string | null;
    nextTierName?: string | null;
    pointsToNext?: number;
  };
  companyName: string;
  companyLine1?: string;
  companyLine2?: string;
  companyCity?: string;
  companyTva?: string;
  companySiret?: string;
  companyPhone?: string;
  returnConditions?: string;
  receiptFooter?: string;
  isDuplicate?: boolean;
  isDemo?: boolean;
  globalDiscount?: number;
  rewardDiscountAmount?: number;
  rewardDescription?: string;
  referralCode?: string;
  // template settings from ticket_settings table
  showTVADetails?: boolean;
  showPoints?: boolean;
  showNextTier?: boolean;
  paperWidth?: string;
  fontSize?: 'small' | 'medium' | 'large';
}

const SEP = '================================';
const SEP_DASH = '--------------------------------';


function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function line(label: string, value: string): string {
  return `<div class="tl"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
}

export function generateTicketHTML(d: TicketPrintData): string {
  const width = d.paperWidth ?? '80mm';
  const baseFontSize = d.fontSize === 'small' ? '9px' : d.fontSize === 'large' ? '11px' : '10px';
  const showTVA = d.showTVADetails !== false;
  const showPoints = d.showPoints !== false;
  const showNextTier = d.showNextTier !== false;

  // Items section
  const itemsHTML = d.items.map((i) => {
    const lineTotal = Math.max(
      0,
      i.price * i.qty -
        (i.discountType === 'percent'
          ? i.price * i.qty * ((i.discount ?? 0) / 100)
          : (i.discount ?? 0))
    );
    const discLabel = i.promoName
      ? `${i.promoName} : -${i.discountType === 'percent' ? `${i.discount}%` : `${(i.discount ?? 0).toFixed(2)}€`}`
      : `Remise : -${i.discountType === 'percent' ? `${i.discount}%` : `${(i.discount ?? 0).toFixed(2)}€`}`;
    const discHTML =
      (i.discount ?? 0) > 0
        ? `<div class="tl disc"><span>  ${discLabel}</span><span></span></div>`
        : '';
    return `<p class="item-name">${esc(i.name)}</p>
${line(`  ${i.qty} x ${i.price.toFixed(2)}€`, `${lineTotal.toFixed(2)}€`)}${discHTML}`;
  }).join(`<p>${SEP_DASH}</p>`);

  // Loyalty section
  let loyaltyHTML = '';
  if (showPoints && d.loyalty && d.loyalty.pointsEarned > 0) {
    const tierLine = d.loyalty.currentTierName
      ? line('Palier actuel :', d.loyalty.currentTierName)
      : '';
    const nextLine =
      showNextTier && d.loyalty.nextTierName && (d.loyalty.pointsToNext ?? 0) > 0
        ? `<p>Prochaine récompense :</p>
  <p>  ${esc(d.loyalty.nextTierName)} &mdash; ${d.loyalty.pointsToNext} pts</p>`
        : '';
    loyaltyHTML = `
<div class="fidelite">
  <p class="tc">*** PROGRAMME FIDÉLITÉ ***</p>
  ${line('Points gagnés ce jour :', `+ ${d.loyalty.pointsEarned} pts`)}
  ${line('Solde total :', `${d.loyalty.totalPoints} pts`)}
  ${tierLine}
  ${nextLine}
</div>`;
  }

  // Return conditions
  const retHTML = d.returnConditions
    ? `<p>${SEP}</p>
<p>CONDITIONS DE RETOUR</p>
${d.returnConditions
    .split(/[.]\s+/)
    .filter(Boolean)
    .map((s) => `<p>${esc(s.trim().replace(/\.$/, ''))}.${''}</p>`)
    .join('')}`
    : '';

  const css = `
    *{box-sizing:border-box;margin:0;padding:0;word-break:break-word;overflow-wrap:anywhere;}
    html,body{
      font-family:'Courier New',Courier,monospace!important;
      font-size:${baseFontSize};font-weight:700;
      width:${width};max-width:${width};margin:0 auto;
      padding:4px 4px 16px 4px;
      color:#000;background:#fff;
      -webkit-print-color-adjust:exact;print-color-adjust:exact;
    }
    p{margin:0;padding:0;line-height:1.35;color:#000!important;
      font-family:'Courier New',Courier,monospace!important;font-weight:700;
      word-break:break-word;overflow-wrap:anywhere;}
    .tc{text-align:center;}
    .tl{display:flex;justify-content:space-between;align-items:baseline;
      font-weight:700;line-height:1.35;gap:3px;width:100%;}
    .tl span{font-family:'Courier New',Courier,monospace!important;
      min-width:0;word-break:break-word;}
    .tl span:last-child{text-align:right;white-space:nowrap;flex-shrink:0;}
    .tl span:first-child{flex:1;overflow:hidden;}
    .item-name{font-weight:700;margin-top:3px;word-break:break-word;}
    .disc{font-size:${baseFontSize};font-style:italic;}
    .ttc{font-size:${d.fontSize === 'small' ? '11px' : d.fontSize === 'large' ? '13px' : '12px'};font-weight:900;
      border-top:2px solid #000;border-bottom:2px solid #000;padding:3px 0;margin:3px 0;}
    .fidelite{border:1px solid #000;padding:3px;margin:4px 0;font-weight:700;}
    .fidelite p{font-weight:700;}
    @media print{
      @page{size:${width} auto;margin:0mm 2mm;}
      *{color:#000000!important;background:#ffffff!important;
        background-color:#ffffff!important;background-image:none!important;
        -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;
        box-shadow:none!important;text-shadow:none!important;
        border-color:#000000!important;-webkit-text-fill-color:#000000!important;
        word-break:break-word!important;overflow-wrap:anywhere!important;}
      html,body{font-family:'Courier New',Courier,monospace!important;
        font-size:${baseFontSize}!important;font-weight:700!important;
        width:${width}!important;max-width:${width}!important;
        margin:0!important;padding:4px 4px 16px 4px!important;}
      p,span,div,td,th,strong{color:#000000!important;font-weight:700!important;
        font-family:'Courier New',Courier,monospace!important;}
      .tl{display:flex!important;justify-content:space-between!important;gap:3px!important;width:100%!important;}
      .tl span:last-child{white-space:nowrap!important;flex-shrink:0!important;}
      .tl span:first-child{flex:1!important;overflow:hidden!important;}
      .ttc{font-size:${d.fontSize === 'small' ? '11px' : d.fontSize === 'large' ? '13px' : '12px'}!important;
        font-weight:900!important;
        border-top:2px solid #000!important;border-bottom:2px solid #000!important;}
      .fidelite{border:1px solid #000!important;padding:3px!important;}
    }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Ticket ${esc(d.ticketNumber)}</title>
<style>${css}</style>
</head><body>

${d.isDemo ? `<p class="tc">${SEP}</p>
<p class="tc"><strong>*** FORMATION ***</strong></p>
<p class="tc">NE PAS CONSERVER CE TICKET</p>` : ''}
<p class="tc">${SEP}</p>
<p class="tc"><strong>${esc(d.companyName)}</strong></p>
<p class="tc">${SEP}</p>
${d.isDuplicate ? `<p class="tc"><strong>*** DUPLICATA ***</strong></p>
<p class="tc">${SEP}</p>` : ''}
${d.companyLine1 ? `<p class="tc">${esc(d.companyLine1)}</p>` : ''}
${d.companyLine2 ? `<p class="tc">${esc(d.companyLine2)}</p>` : ''}
${d.companyCity ? `<p class="tc">${esc(d.companyCity)}</p>` : ''}
${d.companyTva ? `<p class="tc">TVA : ${esc(d.companyTva)}</p>` : ''}
${d.companySiret ? `<p class="tc">SIRET : ${esc(d.companySiret)}</p>` : ''}
${d.companyPhone ? `<p class="tc">Tél : ${esc(d.companyPhone)}</p>` : ''}
<p class="tc">${SEP}</p>

${line('Ticket :', d.ticketNumber)}
${line('Date   :', `${d.dateStr}  ${d.timeStr}`)}
${line('Caisse :', d.cashierLabel)}
${d.clientName ? line('Client :', d.clientName.toUpperCase()) : ''}
<p>${SEP}</p>

<p>ARTICLES</p>
<p>${SEP_DASH}</p>
${itemsHTML}
<p>${SEP}</p>

${showTVA ? `${line('Sous-total HT :', `${d.subtotalHT.toFixed(2)}€`)}
${line(`TVA ${d.tvaRate}% :`, `${d.totalTVA.toFixed(2)}€`)}
<p>${SEP}</p>` : ''}
${(d.globalDiscount ?? 0) > 0 ? `${line('Remise :', `-${d.globalDiscount!.toFixed(2)}€`)}` : ''}
${(d.rewardDiscountAmount ?? 0) > 0 ? `${line('🎁 Récompense :', `-${d.rewardDiscountAmount!.toFixed(2)}€`)}` : ''}
<div class="tl ttc"><span>TOTAL TTC :</span><span>${d.totalTTC.toFixed(2)}€</span></div>
<p>${SEP}</p>

${line('Paiement :', d.paymentMethod)}
${line('Montant réglé :', `${d.totalTTC.toFixed(2)}€`)}
<p>${SEP}</p>

${loyaltyHTML}
${loyaltyHTML ? `<p>${SEP}</p>` : ''}

${retHTML}

${d.referralCode ? `<p class="tc">${SEP}</p>
<p class="tc">*** PARRAINEZ VOS PROCHES ***</p>
<p class="tc">Votre code parrainage :</p>
<p class="tc" style="font-size:15px;letter-spacing:4px"><strong>${esc(d.referralCode)}</strong></p>
<p class="tc">Offrez -10% a vos amies</p>
<p class="tc">et gagnez + 300 points a chaque client !</p>` : ''}

<p class="tc">${SEP}</p>
<p class="tc">${esc(d.receiptFooter ?? 'Merci de votre visite !')}</p>
<p class="tc">Conservez ce ticket pour</p>
<p class="tc">tout retour ou &#233;change.</p>
<p class="tc">${SEP}</p>
${d.companySiret ? `<p class="tc">RCS Fort-de-France ${esc(d.companySiret)}</p>` : ''}
<p class="tc">${SEP}</p>
${d.isDemo ? `<p class="tc">${SEP}</p>
<p class="tc"><strong>*** TICKET DE FORMATION ***</strong></p>
<p class="tc"><strong>*** NE COMPTE PAS EN CA  ***</strong></p>
<p class="tc">${SEP}</p>` : ''}

<script>window.onload=function(){window.print();}</script>
</body></html>`;
}

export function loadSettingsFromCache() {
  let companyName = "LE MONDE DE L'ESTHETIQUE";
  let companyLine1 = 'Baie des Flamands Appt 306';
  let companyLine2 = '9 avenue Loulou Boislaville';
  let companyCity = '97200 Fort-de-France';
  let companyPhone = '';
  let companySiret = '927 747 725';
  let companyTva = 'FR71 927747 725';
  let receiptFooter = 'Merci de votre visite !';
  let cashierLabel = 'Caisse principale';
  let returnConditions = 'Retour accepté sous 30 jours. Produit non utilisé, non ouvert, en bon état. Ticket obligatoire.';
  let tvaRate = 8.5;

  // Template settings (from ticket_settings DB, cached locally)
  let showTVADetails = true;
  let showPoints = true;
  let showNextTier = true;
  let paperWidth = '80mm';
  let fontSize: 'small' | 'medium' | 'large' = 'medium';

  try {
    const cached = localStorage.getItem('beautypos_settings');
    if (cached) {
      const s = JSON.parse(cached);
      if (s.company_name) companyName = s.company_name;
      if (s.address) companyLine2 = s.address;
      if (s.city || s.postal_code)
        companyCity = `${s.postal_code || '97200'} ${s.city || 'Fort-de-France'}`;
      if (s.phone) companyPhone = s.phone;
      if (s.siret) companySiret = s.siret;
      if (s.tva_number) companyTva = s.tva_number;
      if (s.receipt_footer) receiptFooter = s.receipt_footer;
      if (s.receipt_cashier_label) cashierLabel = s.receipt_cashier_label;
      if (s.return_conditions) returnConditions = s.return_conditions;
      if (s.tva_rate) tvaRate = parseFloat(s.tva_rate) || 8.5;
    }
  } catch { /* use defaults */ }

  try {
    const ticketCached = localStorage.getItem('beautypos_ticket_settings');
    if (ticketCached) {
      const ts = JSON.parse(ticketCached);
      if (ts.show_tva_detail !== undefined) showTVADetails = Boolean(ts.show_tva_detail);
      if (ts.show_loyalty_points !== undefined) showPoints = Boolean(ts.show_loyalty_points);
      if (ts.show_next_tier !== undefined) showNextTier = Boolean(ts.show_next_tier);
      if (ts.paper_width) paperWidth = ts.paper_width;
      if (ts.font_size) fontSize = ts.font_size as 'small' | 'medium' | 'large';
      if (ts.thank_you_message) receiptFooter = ts.thank_you_message;
    }
  } catch { /* use defaults */ }

  return { companyName, companyLine1, companyLine2, companyCity, companyPhone, companySiret, companyTva, receiptFooter, cashierLabel, returnConditions, tvaRate, showTVADetails, showPoints, showNextTier, paperWidth, fontSize };
}

export function openAndPrint(html: string): void {
  const win = window.open('', '_blank', 'width=450,height=750');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

// ─── Facture / Devis ─────────────────────────────────────────────────────────

export interface FacturePrintData {
  numero: string;
  docType: 'facture' | 'devis';
  dateStr: string;
  timeStr: string;
  clientName?: string;
  clientAddress?: string;
  clientEmail?: string;
  items: Array<{
    name: string;
    qty: number;
    price: number;
    discount?: number;
    discountType?: 'percent' | 'amount';
  }>;
  subtotalHT: number;
  totalTVA: number;
  totalTTC: number;
  tvaRate: number;
  globalDiscount?: number;
  paymentMethod?: string;
  companyName: string;
  companyLine1?: string;
  companyLine2?: string;
  companyCity?: string;
  companyTva?: string;
  companySiret?: string;
  companyPhone?: string;
  paperWidth?: string;
}

export function generateFactureHTML(d: FacturePrintData): string {
  const isFacture = d.docType === 'facture';
  const title = isFacture ? 'FACTURE' : 'DEVIS';
  const width = d.paperWidth ?? '80mm';
  const isThermal = width === '80mm' || width === '58mm';

  // Compute per-item totals
  const itemRows = d.items.map((i) => {
    const disc = i.discountType === 'percent'
      ? i.price * i.qty * ((i.discount ?? 0) / 100)
      : (i.discount ?? 0);
    const total = Math.max(0, i.price * i.qty - disc);
    return { ...i, lineTotal: total };
  });

  if (isThermal) {
    // ── Thermal format (same monospace as ticket) ────────────────────────────
    const css = `
      *{box-sizing:border-box;margin:0;padding:0;word-break:break-word;overflow-wrap:anywhere;}
      html,body{font-family:'Courier New',Courier,monospace!important;font-size:10px;font-weight:700;
        width:${width};max-width:${width};margin:0 auto;padding:4px 4px 16px 4px;color:#000;background:#fff;
        -webkit-print-color-adjust:exact;print-color-adjust:exact;}
      p{margin:0;padding:0;line-height:1.35;color:#000!important;font-family:'Courier New',Courier,monospace!important;font-weight:700;word-break:break-word;}
      .tc{text-align:center;}
      .tl{display:flex;justify-content:space-between;align-items:baseline;font-weight:700;line-height:1.35;gap:3px;width:100%;}
      .tl span{font-family:'Courier New',Courier,monospace!important;min-width:0;}
      .tl span:last-child{text-align:right;white-space:nowrap;flex-shrink:0;}
      .tl span:first-child{flex:1;overflow:hidden;}
      .item-name{font-weight:700;margin-top:3px;word-break:break-word;}
      .ttc{font-size:12px;font-weight:900;border-top:2px solid #000;border-bottom:2px solid #000;padding:3px 0;margin:3px 0;}
      @media print{@page{size:${width} auto;margin:0mm 2mm;}
        *{color:#000!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;
          word-break:break-word!important;overflow-wrap:anywhere!important;}
        html,body{font-size:10px!important;width:${width}!important;max-width:${width}!important;
          margin:0!important;padding:4px 4px 16px 4px!important;}
        .tl{display:flex!important;justify-content:space-between!important;gap:3px!important;width:100%!important;}
        .tl span:last-child{white-space:nowrap!important;flex-shrink:0!important;}
        .tl span:first-child{flex:1!important;overflow:hidden!important;}
        .ttc{font-size:12px!important;font-weight:900!important;border-top:2px solid #000!important;border-bottom:2px solid #000!important;}}
    `;
    const SEP2 = '================================';
    const SEP3 = '--------------------------------';
    const tl = (l: string, v: string) => `<div class="tl"><span>${esc(l)}</span><span>${esc(v)}</span></div>`;
    const itemsHTML = itemRows.map((i) => {
      const discHTML = (i.discount ?? 0) > 0
        ? `<div class="tl" style="font-size:11px;font-style:italic"><span>  Remise : -${i.discountType === 'percent' ? `${i.discount}%` : `${(i.discount ?? 0).toFixed(2)}€`}</span><span></span></div>`
        : '';
      return `<p class="item-name">${esc(i.name)}</p>${tl(`  ${i.qty} x ${i.price.toFixed(2)}€`, `${i.lineTotal.toFixed(2)}€`)}${discHTML}`;
    }).join(`<p>${SEP3}</p>`);

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} ${esc(d.numero)}</title><style>${css}</style></head><body>
<p class="tc">${SEP2}</p>
<p class="tc"><strong>${esc(d.companyName)}</strong></p>
<p class="tc">${SEP2}</p>
${d.companyLine1 ? `<p class="tc">${esc(d.companyLine1)}</p>` : ''}
${d.companyLine2 ? `<p class="tc">${esc(d.companyLine2)}</p>` : ''}
${d.companyCity ? `<p class="tc">${esc(d.companyCity)}</p>` : ''}
${d.companySiret ? `<p class="tc">SIRET : ${esc(d.companySiret)}</p>` : ''}
${d.companyTva ? `<p class="tc">TVA : ${esc(d.companyTva)}</p>` : ''}
<p class="tc">${SEP2}</p>
<p class="tc"><strong>*** ${title} ***</strong></p>
${tl('N° :', d.numero)}
${tl('Date :', `${d.dateStr}  ${d.timeStr}`)}
${isFacture ? `<p class="tc"><strong>*** PAYEE ***</strong></p>` : `<p class="tc">Valable 30 jours</p>`}
<p class="tc">${SEP2}</p>
${d.clientName ? `${tl('Client :', d.clientName.toUpperCase())}` : ''}
${d.clientAddress ? `<p>  ${esc(d.clientAddress)}</p>` : ''}
${d.clientEmail ? `<p>  ${esc(d.clientEmail)}</p>` : ''}
<p>${SEP2}</p>
<p>ARTICLES</p>
<p>${SEP3}</p>
${itemsHTML}
<p>${SEP2}</p>
${tl('Sous-total HT :', `${d.subtotalHT.toFixed(2)}€`)}
${tl(`TVA ${d.tvaRate}% :`, `${d.totalTVA.toFixed(2)}€`)}
${(d.globalDiscount ?? 0) > 0 ? tl('Remise :', `-${d.globalDiscount!.toFixed(2)}€`) : ''}
<p>${SEP2}</p>
<div class="tl ttc"><span>TOTAL TTC :</span><span>${d.totalTTC.toFixed(2)}€</span></div>
<p>${SEP2}</p>
${isFacture && d.paymentMethod ? `${tl('Paiement :', d.paymentMethod)}${tl('Acquittée le :', d.dateStr)}` : ''}
<p>${SEP2}</p>
${d.companySiret ? `<p class="tc">SIRET ${esc(d.companySiret)}</p>` : ''}
${d.companyTva ? `<p class="tc">TVA Intracommunautaire</p><p class="tc">${esc(d.companyTva)}</p>` : ''}
<p class="tc">${SEP2}</p>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  }

  // ── A4 format ──────────────────────────────────────────────────────────────
  const itemsTableRows = itemRows.map((i, idx) => {
    const priceHT = i.price / (1 + d.tvaRate / 100);
    return `<tr style="${idx % 2 === 1 ? 'background:#f9f9f9' : ''}">
      <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:10pt">${esc(i.name)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:10pt;text-align:center">${i.qty}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:10pt;text-align:right">${priceHT.toFixed(2)} €</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:10pt;text-align:right">${(i.lineTotal / (1 + d.tvaRate / 100)).toFixed(2)} €</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:10pt;font-weight:bold;text-align:right">${i.lineTotal.toFixed(2)} €</td>
    </tr>`;
  }).join('');

  const badgeStyle = isFacture
    ? 'background:#dcfce7;color:#15803d;padding:3px 10px;border-radius:4px;font-weight:bold;font-size:10pt;display:inline-block'
    : 'background:#fef9c3;color:#a16207;padding:3px 10px;border-radius:4px;font-weight:bold;font-size:10pt;display:inline-block';
  const badgeLabel = isFacture ? '✅ PAYÉE' : '⏳ EN ATTENTE';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title} ${esc(d.numero)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#000;background:#fff;}
.page{width:190mm;margin:0 auto;padding:12mm 0 15mm;}
@media print{@page{size:A4;margin:10mm;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.page{padding:0;}}
</style></head><body>
<div class="page">

  <!-- Header -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:8mm;border-bottom:2px solid #1a0a2e;padding-bottom:6mm">
    <tr>
      <td style="vertical-align:top;width:60%">
        <p style="font-size:15pt;font-weight:bold;color:#1a0a2e">${esc(d.companyName)}</p>
        ${d.companyLine1 ? `<p style="font-size:9pt;color:#555;margin-top:3px">${esc(d.companyLine1)}</p>` : ''}
        ${d.companyLine2 ? `<p style="font-size:9pt;color:#555">${esc(d.companyLine2)}</p>` : ''}
        ${d.companyCity ? `<p style="font-size:9pt;color:#555">${esc(d.companyCity)}</p>` : ''}
        ${d.companyPhone ? `<p style="font-size:9pt;color:#555">Tél : ${esc(d.companyPhone)}</p>` : ''}
        ${d.companySiret ? `<p style="font-size:9pt;color:#555">SIRET : ${esc(d.companySiret)}</p>` : ''}
        ${d.companyTva ? `<p style="font-size:9pt;color:#555">TVA : ${esc(d.companyTva)}</p>` : ''}
      </td>
      <td style="vertical-align:top;text-align:right">
        <p style="font-size:24pt;font-weight:bold;color:#1a0a2e">${title}</p>
        <p style="font-size:11pt;font-weight:bold;color:#333;margin-top:4px">${esc(d.numero)}</p>
        <p style="font-size:10pt;color:#555;margin-top:2px">Date : ${esc(d.dateStr)}</p>
        <div style="margin-top:6px"><span style="${badgeStyle}">${badgeLabel}</span></div>
      </td>
    </tr>
  </table>

  <!-- Client block -->
  ${d.clientName ? `
  <div style="background:#f9f9f9;border:1px solid #ddd;border-radius:4px;padding:4mm 5mm;margin-bottom:6mm;display:inline-block;min-width:80mm">
    <p style="font-size:8pt;font-weight:bold;text-transform:uppercase;color:#888;letter-spacing:0.5px;margin-bottom:3px">CLIENT</p>
    <p style="font-weight:bold;font-size:11pt">${esc(d.clientName.toUpperCase())}</p>
    ${d.clientAddress ? `<p style="font-size:9pt;color:#555;margin-top:1px">${esc(d.clientAddress)}</p>` : ''}
    ${d.clientEmail ? `<p style="font-size:9pt;color:#555">${esc(d.clientEmail)}</p>` : ''}
  </div>` : ''}

  <!-- Items table -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:4mm">
    <thead>
      <tr style="background:#1a0a2e;color:#fff">
        <th style="padding:5px 8px;font-size:9pt;text-align:left;font-weight:bold">Désignation</th>
        <th style="padding:5px 8px;font-size:9pt;text-align:center;font-weight:bold">Qté</th>
        <th style="padding:5px 8px;font-size:9pt;text-align:right;font-weight:bold">P.U. HT</th>
        <th style="padding:5px 8px;font-size:9pt;text-align:right;font-weight:bold">Total HT</th>
        <th style="padding:5px 8px;font-size:9pt;text-align:right;font-weight:bold">Total TTC</th>
      </tr>
    </thead>
    <tbody>${itemsTableRows}</tbody>
  </table>

  <!-- Totals -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:6mm">
    <table style="width:72mm;border-collapse:collapse">
      <tr>
        <td style="padding:3px 4px;font-size:10pt">Sous-total HT</td>
        <td style="padding:3px 4px;font-size:10pt;text-align:right">${d.subtotalHT.toFixed(2)} €</td>
      </tr>
      <tr>
        <td style="padding:3px 4px;font-size:10pt">TVA ${d.tvaRate}%</td>
        <td style="padding:3px 4px;font-size:10pt;text-align:right">${d.totalTVA.toFixed(2)} €</td>
      </tr>
      ${(d.globalDiscount ?? 0) > 0 ? `<tr>
        <td style="padding:3px 4px;font-size:10pt;color:#dc2626;font-weight:bold">Remise</td>
        <td style="padding:3px 4px;font-size:10pt;text-align:right;color:#dc2626;font-weight:bold">-${d.globalDiscount!.toFixed(2)} €</td>
      </tr>` : ''}
      <tr>
        <td style="padding:5px 4px;font-size:13pt;font-weight:bold;border-top:2px solid #000;border-bottom:2px solid #000">TOTAL TTC</td>
        <td style="padding:5px 4px;font-size:13pt;font-weight:bold;text-align:right;border-top:2px solid #000;border-bottom:2px solid #000">${d.totalTTC.toFixed(2)} €</td>
      </tr>
    </table>
  </div>

  <!-- Payment / validity -->
  ${isFacture && d.paymentMethod ? `
  <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:4px;padding:3mm 5mm;margin-bottom:8mm;font-size:10pt">
    <strong>Paiement reçu :</strong> ${esc(d.paymentMethod)} — le ${esc(d.dateStr)}<br>
    <strong>Montant acquitté :</strong> ${d.totalTTC.toFixed(2)} €
  </div>` : !isFacture ? `
  <div style="background:#fefce8;border:1px solid #fde047;border-radius:4px;padding:3mm 5mm;margin-bottom:8mm;font-size:10pt;font-style:italic">
    Devis valable 30 jours à compter du ${esc(d.dateStr)}. Sans engagement de votre part.
  </div>` : ''}

  <!-- Legal footer -->
  <div style="border-top:1px solid #ccc;padding-top:4mm;font-size:8pt;color:#666;line-height:1.6">
    ${d.companySiret ? `SIRET : ${esc(d.companySiret)} &nbsp;|&nbsp; ` : ''}
    ${d.companyTva ? `N° TVA Intracommunautaire : ${esc(d.companyTva)} &nbsp;|&nbsp; ` : ''}
    TVA applicable au taux de ${d.tvaRate}% (Art. 278 du CGI)
  </div>

</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
}
