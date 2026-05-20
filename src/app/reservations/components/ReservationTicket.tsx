'use client';

import React, { useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Image from 'next/image';
import { type Reservation, RECOVERY_MODE_CONFIG } from '@/lib/services/reservationService';
import { createClient } from '@/lib/supabase/client';

interface ReservationTicketProps {
  reservation: Reservation;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  deposit_paid: 'Acompte versé',
  ready: 'Prêt à retirer',
  completed: 'Complété',
  cancelled: 'Annulé',
};

// Company info from admin-config defaults (same as used in receipts)
const DEFAULT_COMPANY = {
  name: "LE MONDE DE L\'ESTHETIQUE",
  address: "aie des Flamands Appt 306 9 avenue Loulou Boislaville",
  city: "Fort-de-France",
  postalCode: "97200",
  phone: "",
  email: "",
  siret: "927 747 725",
  tvaNumber: "FR71 927747 725",
  logo: "",
};

function getVariantLabel(item: Reservation['items'][0]): string {
  const parts: string[] = [];
  if (item.color) parts.push(item.color);
  if (item.size) parts.push(item.size);
  if (item.model) parts.push(item.model);
  if (item.power) parts.push(item.power);
  if (item.format) parts.push(item.format);
  if (item.variant) parts.push(item.variant);
  return parts.join(' · ');
}

export default function ReservationTicket({ reservation, onClose }: ReservationTicketProps) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [emailInput, setEmailInput] = useState(reservation.clientEmail ?? '');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailResult, setEmailResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);

  const company = DEFAULT_COMPANY;
  const recoveryLabel = RECOVERY_MODE_CONFIG[reservation.recoveryMode]?.label ?? reservation.recoveryMode;

  // ── Build print HTML ──────────────────────────────────────────────────────
  function buildPrintHTML(): string {
    const itemsHTML = reservation.items.map((item) => {
      const variantLabel = getVariantLabel(item);
      const lineTotal = item.qty * item.price;
      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px">
              ${(item as any).imageUrl
                ? `<img src="${(item as any).imageUrl}" style="width:40px;height:40px;border-radius:6px;object-fit:cover;border:1px solid #e0d5d0;" alt="${item.name}" />`
                : `<div style="width:40px;height:40px;border-radius:6px;background:#f5ede8;border:1px solid #e0d5d0;display:flex;align-items:center;justify-content:center;font-size:18px;">🛍</div>`
              }
              <div>
                <div style="font-weight:600;font-size:12px">${item.name}</div>
                ${item.sku ? `<div style="font-size:10px;color:#999">Réf: ${item.sku}</div>` : ''}
                ${variantLabel ? `<div style="font-size:10px;color:#b06060">${variantLabel}</div>` : ''}
              </div>
            </div>
          </td>
          <td style="text-align:center">${item.qty}</td>
          <td style="text-align:right;font-weight:600">${lineTotal.toFixed(2)} €</td>
        </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Ticket Réservation ${reservation.reservationNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', Arial, sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; }
    .ticket { width: 400px; margin: 0 auto; padding: 24px 20px; }
    .company-header { text-align: center; padding-bottom: 16px; border-bottom: 2px dashed #e0d5d0; margin-bottom: 16px; }
    .company-logo { max-height: 50px; margin-bottom: 8px; }
    .company-name { font-size: 18px; font-weight: 700; color: #7c3aed; letter-spacing: 0.5px; }
    .company-details { font-size: 10px; color: #888; margin-top: 4px; line-height: 1.6; }
    .res-number { font-size: 22px; font-weight: 700; color: #1a1a1a; margin-top: 12px; letter-spacing: 2px; border: 2px solid #7c3aed; display: inline-block; padding: 4px 16px; border-radius: 6px; }
    .status-badge { display: inline-block; margin-top: 6px; padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; background: #f5f3ff; color: #7c3aed; }
    .section { margin-bottom: 14px; }
    .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 6px; }
    .info-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px; }
    .info-label { color: #666; }
    .info-value { font-weight: 600; color: #1a1a1a; }
    .items-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .items-table th { text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #999; padding: 4px 0; border-bottom: 1px solid #e8e0dc; }
    .items-table th:nth-child(2) { text-align: center; }
    .items-table th:nth-child(3) { text-align: right; }
    .items-table td { padding: 8px 0; border-bottom: 1px solid #f0ebe8; vertical-align: middle; }
    .totals { border-top: 2px dashed #e0d5d0; padding-top: 12px; margin-top: 4px; }
    .total-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
    .total-row.main { font-size: 14px; font-weight: 700; color: #1a1a1a; }
    .total-row.deposit { color: #059669; font-weight: 600; }
    .total-row.balance { color: #dc2626; font-weight: 700; font-size: 15px; border-top: 1px solid #e0d5d0; padding-top: 6px; margin-top: 4px; }
    .conditions { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 8px 10px; font-size: 10px; color: #78350f; border-radius: 0 4px 4px 0; margin-top: 12px; line-height: 1.6; }
    .footer { text-align: center; margin-top: 16px; padding-top: 12px; border-top: 2px dashed #e0d5d0; font-size: 10px; color: #999; }
    .notes { background: #faf7f5; border-left: 3px solid #7c3aed; padding: 8px 10px; font-size: 11px; color: #555; border-radius: 0 4px 4px 0; margin-top: 8px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
<div class="ticket">
  <div class="company-header">
    ${company.logo ? `<img src="${company.logo}" class="company-logo" alt="${company.name}" />` : ''}
    <div class="company-name">${company.name}</div>
    <div class="company-details">
      ${company.address ? `${company.address}<br/>` : ''}
      ${company.postalCode} ${company.city}
      ${company.phone ? `<br/>📞 ${company.phone}` : ''}
      ${company.email ? ` · ✉️ ${company.email}` : ''}
      ${company.siret ? `<br/>SIRET : ${company.siret}` : ''}
      ${company.tvaNumber ? ` · TVA : ${company.tvaNumber}` : ''}
    </div>
    <div><div class="res-number">${reservation.reservationNumber}</div></div>
    <div><span class="status-badge">${STATUS_LABELS[reservation.reservationStatus] ?? reservation.reservationStatus}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Informations client</div>
    <div class="info-row"><span class="info-label">Nom</span><span class="info-value">${reservation.clientName}</span></div>
    ${reservation.clientPhone ? `<div class="info-row"><span class="info-label">Téléphone</span><span class="info-value">${reservation.clientPhone}</span></div>` : ''}
    ${reservation.clientEmail ? `<div class="info-row"><span class="info-label">Email</span><span class="info-value">${reservation.clientEmail}</span></div>` : ''}
    <div class="info-row"><span class="info-label">Date réservation</span><span class="info-value">${new Date(reservation.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</span></div>
    <div class="info-row"><span class="info-label">Mode de récupération</span><span class="info-value">${recoveryLabel}</span></div>
    ${reservation.pickupDate ? `<div class="info-row"><span class="info-label">Date prévue de retrait</span><span class="info-value">${new Date(reservation.pickupDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</span></div>` : ''}
    ${reservation.cashierName ? `<div class="info-row"><span class="info-label">Conseiller(e)</span><span class="info-value">${reservation.cashierName}</span></div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">Articles réservés</div>
    <table class="items-table">
      <thead>
        <tr>
          <th>Article</th>
          <th>Qté</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${itemsHTML}</tbody>
    </table>
  </div>

  <div class="totals">
    <div class="total-row main"><span>Total commande</span><span>${reservation.totalAmount.toFixed(2)} €</span></div>
    <div class="total-row deposit"><span>✅ Acompte versé</span><span>- ${reservation.depositPaid.toFixed(2)} €</span></div>
    <div class="total-row balance"><span>💳 Solde à régler</span><span>${reservation.balanceDue.toFixed(2)} €</span></div>
  </div>

  ${reservation.notes ? `<div class="notes">📝 ${reservation.notes}</div>` : ''}

  <div class="conditions">
    <strong>Conditions de réservation :</strong><br/>
    • L'acompte versé est non remboursable sauf accord préalable.<br/>
    • Présentez ce ticket lors du retrait de votre commande.<br/>
    • Le solde restant doit être réglé lors de la récupération.<br/>
    • La réservation est valable jusqu'à la date de retrait indiquée.
  </div>

  <div class="footer">
    <p>Émis le ${new Date(reservation.createdAt).toLocaleDateString('fr-FR')} par ${reservation.cashierName ?? company.name}</p>
    <p style="margin-top:4px">Merci de votre confiance et à bientôt !</p>
  </div>
</div>
</body>
</html>`;
  }

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=460,height=800');
    if (!printWindow) return;
    printWindow.document.write(buildPrintHTML());
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  // ── Download PDF (print-to-PDF via browser) ───────────────────────────────
  const handleDownloadPDF = () => {
    const printWindow = window.open('', '_blank', 'width=460,height=800');
    if (!printWindow) return;
    printWindow.document.write(buildPrintHTML());
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  // ── Send Email ────────────────────────────────────────────────────────────
  const handleSendEmail = async () => {
    if (!emailInput.trim()) return;
    setSendingEmail(true);
    setEmailResult(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          type: 'reservation',
          to: emailInput.trim(),
          data: {
            reservationNumber: reservation.reservationNumber,
            reservationDate: reservation.createdAt,
            clientName: reservation.clientName,
            clientPhone: reservation.clientPhone ?? undefined,
            clientEmail: reservation.clientEmail ?? undefined,
            items: reservation.items.map((item) => ({
              name: item.name,
              qty: item.qty,
              price: item.price,
              sku: item.sku,
              imageUrl: (item as any).imageUrl,
              variant: item.variant,
              color: item.color,
              size: item.size,
              model: item.model,
            })),
            totalAmount: reservation.totalAmount,
            depositPaid: reservation.depositPaid,
            balanceDue: reservation.balanceDue,
            recoveryMode: reservation.recoveryMode,
            pickupDate: reservation.pickupDate ?? undefined,
            status: reservation.reservationStatus,
            cashierName: reservation.cashierName ?? undefined,
            notes: reservation.notes ?? undefined,
            company: {
              name: company.name,
              address: company.address,
              city: company.city,
              postalCode: company.postalCode,
              phone: company.phone || undefined,
              email: company.email || undefined,
              siret: company.siret,
              tvaNumber: company.tvaNumber,
              logo: company.logo || undefined,
            },
          },
        },
      });
      if (error || data?.error) {
        setEmailResult({ ok: false, msg: error?.message ?? data?.error ?? 'Erreur lors de l\'envoi' });
      } else {
        setEmailResult({ ok: true, msg: 'Email envoyé avec succès !' });
        setShowEmailForm(false);
      }
    } catch (e: any) {
      setEmailResult({ ok: false, msg: e?.message ?? 'Erreur réseau' });
    }
    setSendingEmail(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Icon name="TicketIcon" size={20} className="text-primary" />
            <h2 className="text-base font-600 text-foreground">Ticket de réservation</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Ticket Preview */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
          <div ref={ticketRef} className="border-2 border-dashed border-border rounded-xl p-4 bg-[#fdfaf8] text-xs space-y-3">
            {/* Company Header */}
            <div className="text-center border-b border-dashed border-border pb-3">
              {company.logo && (
                <div className="flex justify-center mb-2">
                  <Image src={company.logo} alt={company.name} width={80} height={40} className="object-contain" />
                </div>
              )}
              <p className="text-sm font-700 text-primary tracking-wide">{company.name}</p>
              <p className="text-muted-foreground text-[10px] mt-0.5 leading-relaxed">
                {company.address && <span>{company.address}<br /></span>}
                {company.postalCode} {company.city}
                {company.phone && <span><br />📞 {company.phone}</span>}
                {company.email && <span> · ✉️ {company.email}</span>}
              </p>
              {(company.siret || company.tvaNumber) && (
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  SIRET : {company.siret} · TVA : {company.tvaNumber}
                </p>
              )}
              <div className="mt-2 inline-block border-2 border-primary rounded-lg px-4 py-1">
                <p className="text-lg font-700 text-foreground tracking-widest">{reservation.reservationNumber}</p>
              </div>
              <div className="mt-1.5">
                <span className="inline-block px-3 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-600">
                  {STATUS_LABELS[reservation.reservationStatus]}
                </span>
              </div>
            </div>

            {/* Client Info */}
            <div className="space-y-1">
              <p className="text-[9px] font-700 uppercase tracking-widest text-muted-foreground">Client</p>
              <div className="flex justify-between"><span className="text-muted-foreground">Nom</span><span className="font-600 text-foreground">{reservation.clientName}</span></div>
              {reservation.clientPhone && <div className="flex justify-between"><span className="text-muted-foreground">Tél.</span><span className="font-600 text-foreground">{reservation.clientPhone}</span></div>}
              {reservation.clientEmail && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-600 text-foreground text-right max-w-[60%] truncate">{reservation.clientEmail}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Réservé le</span><span className="font-600 text-foreground">{new Date(reservation.createdAt).toLocaleDateString('fr-FR')}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Récupération</span><span className="font-600 text-foreground text-right max-w-[55%] text-[10px]">{recoveryLabel}</span></div>
              {reservation.pickupDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date retrait</span>
                  <span className="font-600 text-foreground">{new Date(reservation.pickupDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                </div>
              )}
            </div>

            {/* Items */}
            <div className="space-y-2">
              <p className="text-[9px] font-700 uppercase tracking-widest text-muted-foreground">Articles réservés</p>
              {reservation.items.map((item, i) => {
                const imageUrl = (item as any).imageUrl;
                const variantLabel = getVariantLabel(item);
                return (
                  <div key={i} className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted border border-border shrink-0">
                      {imageUrl ? (
                        <Image src={imageUrl} alt={item.name} width={40} height={40} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Icon name="PhotoIcon" size={14} className="text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground font-500 truncate">{item.name}</p>
                      {item.sku && <p className="text-muted-foreground text-[9px]">Réf: {item.sku}</p>}
                      {variantLabel && <p className="text-primary text-[9px] font-500">{variantLabel}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-muted-foreground text-[10px]">×{item.qty}</p>
                      <p className="font-600 text-foreground">{(item.qty * item.price).toFixed(2)} €</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="border-t border-dashed border-border pt-3 space-y-1.5">
              <div className="flex justify-between font-600 text-foreground text-sm"><span>Total commande</span><span>{reservation.totalAmount.toFixed(2)} €</span></div>
              <div className="flex justify-between text-emerald-600 font-500"><span>✅ Acompte versé</span><span>- {reservation.depositPaid.toFixed(2)} €</span></div>
              <div className="flex justify-between font-700 text-red-600 text-sm border-t border-border pt-1.5"><span>💳 Solde à régler</span><span>{reservation.balanceDue.toFixed(2)} €</span></div>
            </div>

            {reservation.notes && (
              <div className="bg-primary/5 border-l-2 border-primary rounded-r-lg px-3 py-2 text-[10px] text-muted-foreground">
                📝 {reservation.notes}
              </div>
            )}

            {/* Conditions */}
            <div className="bg-amber-50 border-l-2 border-amber-400 rounded-r-lg px-3 py-2 text-[9px] text-amber-800 leading-relaxed">
              <p className="font-700 mb-1">Conditions de réservation :</p>
              <p>• L'acompte versé est non remboursable sauf accord préalable.</p>
              <p>• Présentez ce ticket lors du retrait de votre commande.</p>
              <p>• Le solde restant doit être réglé lors de la récupération.</p>
              <p>• La réservation est valable jusqu'à la date de retrait indiquée.</p>
            </div>

            {/* Footer */}
            <div className="text-center border-t border-dashed border-border pt-3 text-[9px] text-muted-foreground space-y-0.5">
              <p>Émis le {new Date(reservation.createdAt).toLocaleDateString('fr-FR')} par {reservation.cashierName ?? company.name}</p>
              <p>Merci de votre confiance et à bientôt !</p>
            </div>
          </div>

          {/* Email form */}
          {showEmailForm && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
              <p className="text-xs font-600 text-blue-800">Envoyer le ticket par email</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="email@client.com"
                  className="flex-1 px-3 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/30 bg-white"
                />
                <button
                  onClick={handleSendEmail}
                  disabled={sendingEmail || !emailInput.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-500 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {sendingEmail ? <Icon name="ArrowPathIcon" size={13} className="animate-spin" /> : <Icon name="PaperAirplaneIcon" size={13} />}
                  {sendingEmail ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
              {emailResult && (
                <div className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg ${emailResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  <Icon name={emailResult.ok ? 'CheckCircleIcon' : 'ExclamationCircleIcon'} size={13} />
                  {emailResult.msg}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-border space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground text-sm font-500 rounded-lg hover:bg-accent transition-colors"
            >
              <Icon name="PrinterIcon" size={15} />
              Imprimer
            </button>
            <button
              onClick={handleDownloadPDF}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-700 text-white text-sm font-500 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Icon name="ArrowDownTrayIcon" size={15} />
              PDF
            </button>
            <button
              onClick={() => { setShowEmailForm((v) => !v); setEmailResult(null); }}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-500 rounded-lg transition-colors ${showEmailForm ? 'bg-blue-100 text-blue-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            >
              <Icon name="EnvelopeIcon" size={15} />
              Email
            </button>
          </div>
          <button onClick={onClose} className="w-full py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
