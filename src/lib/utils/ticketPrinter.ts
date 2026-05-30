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
  const baseFontSize = d.fontSize === 'small' ? '11px' : d.fontSize === 'large' ? '13px' : '12px';
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
    *{box-sizing:border-box;margin:0;padding:0;}
    html,body{
      font-family:'Courier New',Courier,monospace!important;
      font-size:${baseFontSize};font-weight:700;
      width:${width};margin:0 auto;padding:6px 2px 20px 2px;
      color:#000;background:#fff;
      -webkit-print-color-adjust:exact;print-color-adjust:exact;
    }
    p{margin:0;padding:0;line-height:1.4;color:#000!important;
      font-family:'Courier New',Courier,monospace!important;font-weight:700;}
    .tc{text-align:center;}
    .tl{display:flex;justify-content:space-between;font-weight:700;line-height:1.4;}
    .tl span{font-family:'Courier New',Courier,monospace!important;}
    .item-name{font-weight:700;margin-top:4px;}
    .disc{font-size:11px;font-style:italic;}
    .ttc{font-size:14px;font-weight:900;border-top:3px solid #000;border-bottom:3px solid #000;padding:4px 0;margin:4px 0;}
    .fidelite{border:2px solid #000;padding:4px;margin:6px 0;font-weight:700;}
    .fidelite p{font-weight:700;}
    @media print{
      @page{size:${width} auto;margin:2mm;}
      *{color:#000000!important;background:#ffffff!important;
        background-color:#ffffff!important;background-image:none!important;
        -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;
        box-shadow:none!important;text-shadow:none!important;
        border-color:#000000!important;-webkit-text-fill-color:#000000!important;}
      html,body{font-family:'Courier New',Courier,monospace!important;
        font-size:${baseFontSize}!important;font-weight:700!important;width:${width}!important;
        margin:0!important;padding:0!important;}
      p,span,div,td,th,strong{color:#000000!important;font-weight:700!important;
        font-family:'Courier New',Courier,monospace!important;}
      .tl{display:flex!important;justify-content:space-between!important;}
      .ttc{font-size:14px!important;font-weight:900!important;
        border-top:3px solid #000!important;border-bottom:3px solid #000!important;}
      .fidelite{border:2px solid #000!important;padding:4px!important;}
    }
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Ticket ${esc(d.ticketNumber)}</title>
<style>${css}</style>
</head><body>

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
<div class="tl ttc"><span>TOTAL TTC :</span><span>${d.totalTTC.toFixed(2)}€</span></div>
<p>${SEP}</p>

${line('Paiement :', d.paymentMethod)}
${line('Montant réglé :', `${d.totalTTC.toFixed(2)}€`)}
<p>${SEP}</p>

${loyaltyHTML}
${loyaltyHTML ? `<p>${SEP}</p>` : ''}

${retHTML}

<p class="tc">${SEP}</p>
<p class="tc">${esc(d.receiptFooter ?? 'Merci de votre visite !')}</p>
<p class="tc">Conservez ce ticket pour</p>
<p class="tc">tout retour ou échange.</p>
<p class="tc">${SEP}</p>
${d.companySiret ? `<p class="tc">RCS Fort-de-France ${esc(d.companySiret)}</p>` : ''}
<p class="tc">${SEP}</p>

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
