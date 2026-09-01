import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  deposit_paid: 'Acompte versé',
  ready: 'Prêt à retirer',
  completed: 'Complété',
  cancelled: 'Annulé',
};

function fmtDate(s: string | null) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default async function ReservationPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = makeClient();
  const { data, error } = await supabase.from('reservations').select('*').eq('id', id).maybeSingle();
  if (error || !data) notFound();

  const items: Array<Record<string, unknown>> = Array.isArray(data.items) ? data.items : [];
  const totalAmount = Number(data.total_amount) || 0;
  const depositPaid = Number(data.deposit_paid) || 0;
  const balanceDue = Number(data.balance_due) || 0;
  const remiseMontant = Number(data.remise_montant) || 0;
  const clientName = (data.client_name as string) || '';
  const clientPhone = (data.client_phone as string) || '';
  const clientEmail = (data.client_email as string) || '';
  const resNumber = (data.reservation_number as string) || (data.id as string);
  const status = (data.reservation_status as string) || 'pending';
  const statusLabel = STATUS_LABELS[status] || status;
  const notes = (data.notes as string) || '';
  const pickupDate = (data.pickup_date as string) || null;
  const cashierName = (data.cashier_name as string) || '';
  const createdAt = (data.created_at as string) || '';

  const ROSE = '#e91e8c';
  const COMPANY = 'LE MONDE DE L\'ESTHÉTIQUE';
  const COMPANY_ADDRESS = 'Baie des Flamands Appt 306 9 avenue Loulou Boislaville';
  const COMPANY_CITY = 'Fort-de-France 97200';
  const COMPANY_SIRET = '927 747 725';

  const hasImages = items.some((item) => item.imageUrl);

  const itemsHTML = items.map(item => {
    const name = (item.name as string) || '';
    const qty = Number(item.qty) || 1;
    const price = Number(item.price) || 0;
    const lineTotal = qty * price;
    const sku = (item.sku as string) || '';
    const imageUrl = (item.imageUrl as string) || null;
    const isKit = Boolean(item.isKit);
    const kitComps = Array.isArray(item.kitComponents) ? item.kitComponents as Array<Record<string, unknown>> : [];
    const variant = [item.color, item.size, item.model, item.power, item.format, item.variant]
      .filter(Boolean).join(' · ');

    const kitBlock = isKit && kitComps.length > 0 ? `
      <div style="margin-top:8px;padding:8px 10px;background:#fdf4ff;border:1px solid #e9d5ff;border-radius:8px">
        <div style="font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">📦 Contenu du kit</div>
        ${kitComps.map(comp => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
            ${comp.imageUrl ? `<img src="${comp.imageUrl as string}" style="width:30px;height:30px;border-radius:5px;object-fit:cover;border:1px solid #e9d5ff;flex-shrink:0" onerror="this.style.display='none'" />` : '<div style="width:30px;height:30px;border-radius:5px;background:#f3e8ff;border:1px solid #e9d5ff;flex-shrink:0"></div>'}
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${comp.name as string || ''}</div>
              ${comp.ref ? `<div style="font-size:9px;color:#888">${comp.ref as string}</div>` : ''}
            </div>
            <span style="font-size:10px;font-weight:700;color:#7c3aed;flex-shrink:0">×${Number(comp.quantity) * qty}</span>
          </div>
        `).join('')}
      </div>
    ` : '';

    const imgCell = hasImages
      ? (imageUrl
          ? `<td style="padding:10px 6px;border-bottom:1px dashed #ddd;vertical-align:middle;text-align:center"><img src="${imageUrl}" style="width:48px;height:48px;border-radius:8px;object-fit:cover;border:1px solid #eee;display:block" onerror="this.style.display='none'" /></td>`
          : `<td style="padding:10px 6px;border-bottom:1px dashed #ddd;text-align:center"><div style="width:48px;height:48px;border-radius:8px;background:#fce4ec;border:1px solid #eee;display:inline-block"></div></td>`)
      : '';

    return `<tr>
      ${imgCell}
      <td style="padding:10px 8px;border-bottom:1px dashed #ddd;vertical-align:middle">
        <div style="font-weight:700;font-size:13px">${name}${isKit ? ' <span style="font-size:9px;background:#ede9fe;color:#7c3aed;padding:1px 5px;border-radius:4px;font-weight:700">KIT</span>' : ''}</div>
        ${sku ? `<div style="font-size:10px;color:#555">Réf: ${sku}</div>` : ''}
        ${variant ? `<div style="font-size:10px;color:${ROSE}">${variant}</div>` : ''}
        ${kitBlock}
      </td>
      <td style="padding:10px 8px;border-bottom:1px dashed #ddd;text-align:center;font-weight:700">×${qty}</td>
      <td style="padding:10px 8px;border-bottom:1px dashed #ddd;text-align:right;font-weight:700">${lineTotal.toFixed(2)} €</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Réservation ${resNumber} — Le Monde de l'Esthétique</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', monospace; background: #f5f5f5; color: #111; }
    .page { max-width: 480px; margin: 24px auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 32px rgba(0,0,0,.12); overflow: hidden; }
    .header { background: ${ROSE}; color: #fff; text-align: center; padding: 24px 20px 20px; }
    .company-name { font-size: 18px; font-weight: 900; letter-spacing: 1px; }
    .company-detail { font-size: 10px; opacity: .85; margin-top: 4px; line-height: 1.6; }
    .res-number { margin-top: 14px; display: inline-block; border: 2px solid rgba(255,255,255,.7); padding: 6px 20px; border-radius: 8px; font-size: 22px; font-weight: 900; letter-spacing: 3px; }
    .status-badge { display: inline-block; margin-top: 8px; padding: 3px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; background: rgba(255,255,255,.2); color: #fff; }
    .body { padding: 20px; }
    .section { margin-bottom: 18px; }
    .section-title { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: ${ROSE}; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 10px; }
    .info-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px; }
    .info-label { color: #666; font-weight: 600; }
    .info-value { font-weight: 700; text-align: right; max-width: 60%; }
    table { width: 100%; border-collapse: collapse; }
    thead th { padding: 6px 8px; font-size: 10px; font-weight: 900; text-transform: uppercase; color: #fff; background: ${ROSE}; text-align: left; }
    thead th:nth-child(2) { text-align: center; }
    thead th:nth-child(3) { text-align: right; }
    .totals { border-top: 2px dashed #ddd; padding-top: 14px; margin-top: 6px; }
    .total-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px; }
    .total-row.main { font-weight: 700; font-size: 14px; }
    .total-row.deposit { color: #16a34a; font-weight: 700; }
    .total-row.balance { font-size: 15px; font-weight: 900; color: ${ROSE}; border-top: 2px solid #eee; padding-top: 8px; margin-top: 4px; }
    .notes { background: #fff8e1; border-left: 3px solid #f59e0b; padding: 8px 12px; font-size: 11px; border-radius: 0 6px 6px 0; margin-top: 12px; }
    .conditions { background: #fdf6f9; border: 1px solid #fce4ec; border-radius: 8px; padding: 12px; font-size: 10px; color: #555; line-height: 1.8; margin-top: 14px; }
    .conditions strong { color: ${ROSE}; }
    .footer { text-align: center; border-top: 2px dashed #ddd; padding: 14px 20px; font-size: 10px; color: #888; line-height: 1.7; }
    .print-btn { display: flex; justify-content: center; padding: 16px; background: #fdf6f9; }
    @media print { .print-btn { display: none; } body { background: #fff; } .page { box-shadow: none; border-radius: 0; margin: 0; } }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="company-name">${COMPANY}</div>
    <div class="company-detail">${COMPANY_ADDRESS}<br>${COMPANY_CITY}<br>SIRET : ${COMPANY_SIRET}</div>
    <div><div class="res-number">${resNumber}</div></div>
    <div><span class="status-badge">${statusLabel}</span></div>
  </div>

  <div class="body">
    <div class="section">
      <div class="section-title">Informations client</div>
      <div class="info-row"><span class="info-label">Nom</span><span class="info-value">${clientName}</span></div>
      ${clientPhone ? `<div class="info-row"><span class="info-label">Téléphone</span><span class="info-value">${clientPhone}</span></div>` : ''}
      ${clientEmail ? `<div class="info-row"><span class="info-label">Email</span><span class="info-value">${clientEmail}</span></div>` : ''}
      <div class="info-row"><span class="info-label">Réservé le</span><span class="info-value">${fmtDate(createdAt)}</span></div>
      ${pickupDate ? `<div class="info-row"><span class="info-label">Date de retrait</span><span class="info-value">${fmtDate(pickupDate)}</span></div>` : ''}
      ${cashierName ? `<div class="info-row"><span class="info-label">Conseiller(e)</span><span class="info-value">${cashierName}</span></div>` : ''}
    </div>

    <div class="section">
      <div class="section-title">Articles réservés</div>
      <table>
        <thead><tr>${hasImages ? '<th style="width:60px"></th>' : ''}<th>Article</th><th>Qté</th><th>Total</th></tr></thead>
        <tbody>${itemsHTML}</tbody>
      </table>
    </div>

    <div class="totals">
      ${remiseMontant > 0 ? `
        <div class="total-row"><span>Sous-total</span><span>${(totalAmount + remiseMontant).toFixed(2)} €</span></div>
        <div class="total-row" style="color:#7c3aed"><span>✂️ Remise</span><span>− ${remiseMontant.toFixed(2)} €</span></div>
      ` : ''}
      <div class="total-row main"><span>Total commande</span><span>${totalAmount.toFixed(2)} €</span></div>
      <div class="total-row deposit"><span>✅ Acompte versé</span><span>− ${depositPaid.toFixed(2)} €</span></div>
      <div class="total-row balance"><span>💳 Solde à régler</span><span>${balanceDue.toFixed(2)} €</span></div>
    </div>

    ${notes ? `<div class="notes">📝 ${notes}</div>` : ''}

    <div class="conditions">
      <strong>Conditions de réservation :</strong><br>
      • L'acompte versé est non remboursable sauf accord préalable.<br>
      • Présentez ce ticket lors du retrait de votre commande.<br>
      • Le solde restant doit être réglé lors de la récupération.<br>
      • La réservation est valable jusqu'à la date de retrait indiquée.
    </div>
  </div>

  <div class="footer">
    Émis le ${fmtDate(createdAt)}${cashierName ? ' par ' + cashierName : ''}<br>
    Merci de votre confiance et à bientôt !<br>
    <strong style="color:${ROSE}">Le Monde de l'Esthétique</strong>
  </div>

  <div class="print-btn">
    <button onclick="window.print()" style="padding:10px 24px;background:${ROSE};color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:Arial,sans-serif;">
      Imprimer / Télécharger PDF
    </button>
  </div>
</div>
</body>
</html>`;

  return (
    <html lang="fr" suppressHydrationWarning>
      <head />
      <body dangerouslySetInnerHTML={{ __html: html }} />
    </html>
  );
}
