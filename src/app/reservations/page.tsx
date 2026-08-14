'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Image from 'next/image';
import {
  reservationService,
  type Reservation,
  type ReservationStatus,
  type ReservationType,
  type RecoveryMode,
  type ReservationStats,
  RESERVATION_TYPE_CONFIG,
  RECOVERY_MODE_CONFIG,
} from '@/lib/services/reservationService';
import ReservationFormModal from './components/ReservationFormModal';
import DepositModal from './components/DepositModal';
import ReservationTicket from './components/ReservationTicket';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('596') || digits.startsWith('590') || digits.startsWith('33')) return digits;
  if (digits.length === 10 && digits.startsWith('0')) return '596' + digits.slice(1);
  return digits;
}

function detectCountry(address: string): string {
  const lower = (address || '').toLowerCase();
  if (lower.includes('guadeloupe')) return 'Guadeloupe';
  if (lower.includes('martinique')) return 'Martinique';
  if (lower.includes('guyane')) return 'Guyane';
  if (lower.includes('réunion') || lower.includes('reunion')) return 'La Réunion';
  if (lower.includes('france')) return 'France';
  return 'votre région';
}

function getCountryInfo(address: string | null): { flag: string; label: string; bg: string; text: string; border: string } | null {
  const lower = (address || '').toLowerCase();
  if (lower.includes('guadeloupe'))    return { flag: '🇬🇵', label: 'Guadeloupe',  bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' };
  if (lower.includes('martinique'))   return { flag: '🇲🇶', label: 'Martinique',  bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
  if (lower.includes('guyane'))       return { flag: '🇬🇫', label: 'Guyane',      bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' };
  if (lower.includes('réunion') || lower.includes('reunion')) return { flag: '🇷🇪', label: 'La Réunion', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' };
  if (lower.includes('saint-martin') || lower.includes('st-martin')) return { flag: '🇲🇫', label: 'Saint-Martin', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
  if (lower.includes('saint-barth') || lower.includes('st-barth'))   return { flag: '🇧🇱', label: 'St-Barthélemy', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' };
  if (lower.includes('france'))       return { flag: '🇫🇷', label: 'France',      bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200' };
  if (lower.includes('belgique') || lower.includes('belgium')) return { flag: '🇧🇪', label: 'Belgique', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' };
  if (lower.includes('suisse') || lower.includes('switzerland'))     return { flag: '🇨🇭', label: 'Suisse',    bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' };
  if (lower.trim().length > 0) return { flag: '🌍', label: 'International', bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200' };
  return null;
}

function printBon(res: Reservation) {
  const win = window.open('', '_blank', 'width=820,height=1000,scrollbars=yes');
  if (!win) { alert('Autorisez les popups pour imprimer le bon.'); return; }
  const country = detectCountry(res.deliveryAddress ?? '');
  const date = new Date().toLocaleDateString('fr-FR', { timeZone: 'America/Martinique', day: '2-digit', month: 'long', year: 'numeric' });
  const itemsHtml = res.items.map((item: any) => `
    <div style="display:flex;align-items:flex-start;gap:20px;padding:16px 0;border-bottom:1px solid #e5e7eb;">
      ${item.imageUrl
        ? `<img src="${item.imageUrl}" alt="${item.name}" style="width:180px;height:180px;object-fit:cover;border-radius:12px;border:1px solid #e5e7eb;flex-shrink:0;" />`
        : `<div style="width:180px;height:180px;background:#f3f4f6;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:13px;flex-shrink:0;text-align:center;">Pas de photo</div>`}
      <div style="flex:1;min-width:0;">
        <div style="font-size:20px;font-weight:700;color:#111827;margin-bottom:6px;">${item.name}</div>
        ${[item.color, item.size, item.model, item.power, item.format, item.variant].filter(Boolean).length
          ? `<div style="font-size:14px;color:#7c3aed;margin-bottom:6px;">${[item.color, item.size, item.model, item.power, item.format, item.variant].filter(Boolean).join(' · ')}</div>`
          : ''}
        ${item.sku ? `<div style="font-size:12px;color:#6b7280;">Réf: ${item.sku}</div>` : ''}
        <div style="display:flex;gap:24px;margin-top:10px;">
          <div><div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Quantité</div><div style="font-weight:700;font-size:18px;">${item.qty}</div></div>
          <div><div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Prix unit.</div><div style="font-weight:700;font-size:18px;">${Number(item.price).toFixed(2)} €</div></div>
          <div><div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Sous-total</div><div style="font-weight:700;font-size:18px;color:#e11d48;">${(item.qty * item.price).toFixed(2)} €</div></div>
        </div>
      </div>
    </div>`).join('');
  win.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/><title>Bon — ${res.reservationNumber}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;background:#fff}.page{max-width:760px;margin:0 auto;padding:40px 32px}@media print{.no-print{display:none!important}}</style></head>
<body><div class="page">
  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #e11d48;padding-bottom:20px;margin-bottom:24px;">
    <div><div style="font-size:24px;font-weight:800;color:#e11d48;">Le Monde de l'Esthétique</div><div style="font-size:13px;color:#6b7280;margin-top:2px;">BON DE LIVRAISON</div></div>
    <div style="text-align:right;"><div style="font-size:17px;font-weight:700;">${res.reservationNumber}</div><div style="font-size:13px;color:#6b7280;">${date}</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px;">
    <div style="background:#f9fafb;border-radius:12px;padding:16px;">
      <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Cliente</div>
      <div style="font-size:18px;font-weight:700;">${res.clientName}</div>
      ${res.clientPhone ? `<div style="font-size:14px;color:#374151;margin-top:4px;">📞 ${res.clientPhone}</div>` : ''}
      ${res.clientEmail ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${res.clientEmail}</div>` : ''}
    </div>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;">
      <div style="font-size:10px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Livraison — ${country}</div>
      ${res.deliveryAddress ? `<div style="font-size:14px;color:#1e3a8a;font-weight:600;line-height:1.6;">${res.deliveryAddress}</div>` : '<div style="font-size:13px;color:#6b7280;">Non renseignée</div>'}
      ${res.deliveryPhone ? `<div style="font-size:14px;color:#1d4ed8;margin-top:6px;font-weight:600;">📞 ${res.deliveryPhone}</div>` : ''}
      ${res.deliveryContact ? `<div style="font-size:13px;color:#374151;margin-top:2px;">Contact : ${res.deliveryContact}</div>` : ''}
      ${res.deliveryNotes ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;font-style:italic;">${res.deliveryNotes}</div>` : ''}
    </div>
  </div>
  <div style="margin-bottom:24px;">
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Articles commandés</div>
    ${itemsHtml}
  </div>
  <div style="background:#f9fafb;border-radius:12px;padding:16px;display:flex;justify-content:flex-end;">
    <div style="text-align:right;"><div style="font-size:12px;color:#6b7280;">Total commande</div><div style="font-size:26px;font-weight:800;color:#111827;">${res.totalAmount.toFixed(2)} €</div></div>
  </div>
  ${res.notes ? `<div style="margin-top:14px;padding:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:13px;">${res.notes}</div>` : ''}
  <div class="no-print" style="margin-top:32px;text-align:center;">
    <button onclick="window.print()" style="background:#e11d48;color:#fff;border:none;padding:14px 40px;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;">🖨️ Imprimer ce bon</button>
  </div>
</div></body></html>`);
  win.document.close();
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<ReservationStatus, { label: string; color: string; dot: string; icon: string }> = {
  pending:      { label: 'En attente',     color: 'text-amber-700 bg-amber-50 border-amber-200',        dot: 'bg-amber-400',   icon: 'ClockIcon' },
  deposit_paid: { label: 'Acompte versé',  color: 'text-blue-700 bg-blue-50 border-blue-200',           dot: 'bg-blue-400',    icon: 'BanknotesIcon' },
  ready:        { label: 'Prêt à retirer', color: 'text-emerald-700 bg-emerald-50 border-emerald-200',  dot: 'bg-emerald-400', icon: 'CheckCircleIcon' },
  completed:    { label: 'Complété',       color: 'text-slate-600 bg-slate-50 border-slate-200',        dot: 'bg-slate-400',   icon: 'ArchiveBoxIcon' },
  cancelled:    { label: 'Annulé',         color: 'text-red-700 bg-red-50 border-red-200',              dot: 'bg-red-400',     icon: 'XCircleIcon' },
};

const STATUS_TABS: { id: ReservationStatus | 'all'; label: string }[] = [
  { id: 'all',          label: 'Toutes' },
  { id: 'pending',      label: 'En attente' },
  { id: 'deposit_paid', label: 'Acompte versé' },
  { id: 'ready',        label: 'Prêt à retirer' },
  { id: 'completed',    label: 'Complétées' },
  { id: 'cancelled',    label: 'Annulées' },
];

function getNextAction(status: ReservationStatus): { label: string; icon: string; action: string } | null {
  switch (status) {
    case 'pending':      return { label: 'Enregistrer acompte', icon: 'BanknotesIcon',     action: 'deposit' };
    case 'deposit_paid': return { label: 'Ajouter paiement',    icon: 'BanknotesIcon',     action: 'deposit' };
    case 'ready':        return { label: 'Ajouter paiement',    icon: 'CurrencyEuroIcon',  action: 'deposit' };
    default:             return null;
  }
}

function getFirstProductImage(items: Reservation['items']): { url: string; name: string } | null {
  for (const item of items) {
    if ((item as any).imageUrl) return { url: (item as any).imageUrl, name: item.name };
  }
  return null;
}

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

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ label, value, color, bg, icon, subtitle }: { label: string; value: string | number; color: string; bg: string; icon: string; subtitle?: string }) {
  return (
    <div className={`${bg} rounded-xl px-4 py-3 flex items-center gap-3`}>
      <div className={`w-9 h-9 rounded-lg ${bg} border border-current/10 flex items-center justify-center shrink-0`}>
        <Icon name={icon as any} size={18} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className={`text-xl font-700 ${color} tabular-nums mt-0.5`}>{value}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<ReservationType | 'all'>('all');
  const [filterRecovery, setFilterRecovery] = useState<RecoveryMode | 'all'>('all');
  const [stats, setStats] = useState<ReservationStats>({
    total: 0, pending: 0, depositPaid: 0, ready: 0, completed: 0, cancelled: 0,
    totalDepositsCollected: 0, totalAmountPending: 0, totalBalancesCollected: 0,
    totalRealRevenue: 0, pendingBalanceCount: 0, byType: {}, byRecovery: {},
  });

  const [sortKey, setSortKey] = useState<'balanceDue' | 'recoveryMode' | 'reservationType' | 'updatedAt' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Reservation | null>(null);
  const [depositTarget, setDepositTarget] = useState<Reservation | null>(null);
  const [ticketTarget, setTicketTarget] = useState<Reservation | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [whatsappTarget, setWhatsappTarget] = useState<Reservation | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState<string | null>(null);
  const [invoiceSuccess, setInvoiceSuccess] = useState<{ resId: string; factureNumero: string } | null>(null);
  const [pickupLoading, setPickupLoading] = useState<string | null>(null);

  // ── Delivery modal ──────────────────────────────────────────────────────────
  type DriverOption = { id: string; name: string; driverStatus: string };
  const [deliveryModalTarget, setDeliveryModalTarget] = useState<Reservation | null>(null);
  const [deliveryDrivers, setDeliveryDrivers] = useState<DriverOption[]>([]);
  const [deliveryDriverId, setDeliveryDriverId] = useState('');
  const [deliveryModalAddress, setDeliveryModalAddress] = useState('');
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [creatingDelivery, setCreatingDelivery] = useState(false);
  const [deliveryResult, setDeliveryResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    // Auto-repair any reservations fully paid but stuck in wrong status (fire-and-forget)
    fetch('/api/reservations/repair-status', { method: 'POST' }).catch(() => {});
    const [data, s] = await Promise.all([
      reservationService.getAll(filterStatus, filterType, filterRecovery),
      reservationService.getStats(),
    ]);
    setReservations(data);
    setStats(s);
    setLoading(false);
  }, [filterStatus, filterType, filterRecovery]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSearch = useCallback(async (val: string) => {
    setSearch(val);
    if (val.trim().length >= 2) {
      const results = await reservationService.search(val.trim());
      setReservations(results);
    } else if (val.trim().length === 0) {
      loadAll();
    }
  }, [loadAll]);

  const handleAction = async (reservation: Reservation, action: string) => {
    if (action === 'deposit') { setDepositTarget(reservation); return; }
    setActionLoading(reservation.id);
    let updated: Reservation | null = null;
    if (action === 'ready')    updated = await reservationService.markReady(reservation.id);
    if (action === 'complete') updated = await reservationService.markCompleted(reservation.id);
    if (action === 'cancel')   updated = await reservationService.cancel(reservation.id);
    setActionLoading(null);
    if (updated) {
      setReservations((prev) => prev.map((r) => r.id === updated!.id ? updated! : r));
      const s = await reservationService.getStats();
      setStats(s);
    }
  };

  const handleDepositSaved = async (updated: Reservation) => {
    setDepositTarget(null);
    setReservations((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    const s = await reservationService.getStats();
    setStats(s);
  };

  const handleReservationCreated = (saved: Reservation) => {
    setShowForm(false);
    setReservations((prev) => [saved, ...prev]);
    reservationService.getStats().then(setStats);
    setTicketTarget(saved);
  };

  const handleReservationUpdated = (updated: Reservation) => {
    setEditTarget(null);
    setReservations((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    reservationService.getStats().then(setStats);
  };

  const handleConvertToInvoice = async (res: Reservation) => {
    setInvoiceLoading(res.id);
    try {
      const TVA_RATE = 8.5;
      const totalTTC = res.totalAmount;
      const totalHT = Math.round((totalTTC / (1 + TVA_RATE / 100)) * 100) / 100;
      const totalTVA = Math.round((totalTTC - totalHT) * 100) / 100;

      // Payment method: prefer balance method (most recent), fallback to deposit method
      const paymentMethod = res.balancePaymentMethod || res.depositPaymentMethod || 'cash';

      const factureRes = await fetch('/api/factures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_type: 'invoice',
          client_name: res.clientName,
          client_email: res.clientEmail || null,
          items: res.items.map((item) => ({
            name: item.name,
            qty: item.qty,
            price: item.price,
            sku: item.sku || '',
          })),
          total_ht: totalHT,
          total_tva: totalTVA,
          total_ttc: totalTTC,
          tva_rate: TVA_RATE,
          payment_method: paymentMethod,
          status: 'payee',
          // Payments already counted via deposit/balance accounting dates — no double-count
          is_counted_in_ca: false,
          receipt_ref: res.reservationNumber,
        }),
      });

      if (!factureRes.ok) {
        const err = await factureRes.json().catch(() => ({}));
        throw new Error(err.error || 'Échec de création de la facture');
      }
      const { id: factureId, numero: factureNumero } = await factureRes.json();

      // Link the facture back to the reservation via pos_sale_id
      await fetch(`/api/reservations/${res.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pos_sale_id: factureId }),
      }).catch(() => null);

      setReservations((prev) =>
        prev.map((rv) => rv.id === res.id ? { ...rv, posSaleId: factureId } : rv)
      );
      setInvoiceSuccess({ resId: res.id, factureNumero });
      setTimeout(() => setInvoiceSuccess(null), 6000);
    } catch (err: any) {
      alert(`Erreur lors de la conversion : ${err.message}`);
    } finally {
      setInvoiceLoading(null);
    }
  };

  const handleOpenDeliveryModal = async (res: Reservation) => {
    setDeliveryModalTarget(res);
    setDeliveryDriverId('');
    setDeliveryModalAddress(res.deliveryAddress ?? '');
    setDeliveryResult(null);
    setLoadingDrivers(true);
    try {
      const r = await fetch('/api/livreurs');
      const json = await r.json();
      setDeliveryDrivers((json.drivers ?? []).map((dr: any) => ({
        id: dr.id,
        name: `${dr.first_name ?? ''} ${dr.last_name ?? ''}`.trim(),
        driverStatus: dr.driver_status ?? 'off',
      })));
    } catch {
      setDeliveryDrivers([]);
    }
    setLoadingDrivers(false);
  };

  const handleCreateDelivery = async () => {
    if (!deliveryModalTarget || !deliveryModalAddress.trim()) return;
    setCreatingDelivery(true);
    setDeliveryResult(null);
    try {
      const res = await fetch('/api/livraisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: deliveryModalTarget.clientName,
          client_phone: deliveryModalTarget.clientPhone ?? deliveryModalTarget.deliveryPhone ?? '',
          delivery_address: deliveryModalAddress.trim(),
          delivery_notes: deliveryModalTarget.deliveryNotes ?? '',
          total_amount: deliveryModalTarget.totalAmount,
          assigned_to_driver: deliveryDriverId || null,
          products: deliveryModalTarget.items.map((item) => ({
            name: item.name,
            qty: item.qty,
            price: item.price,
            sku: item.sku ?? undefined,
            imageUrl: (item as any).imageUrl ?? undefined,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.error) {
        setDeliveryResult({ ok: false, msg: json?.error ?? `Erreur HTTP ${res.status}` });
      } else {
        setDeliveryResult({ ok: true, msg: deliveryDriverId ? 'Livraison créée et livreur assigné !' : 'Livraison créée avec succès !' });
      }
    } catch (e: any) {
      setDeliveryResult({ ok: false, msg: e?.message ?? 'Erreur réseau' });
    }
    setCreatingDelivery(false);
  };

  const handlePickupConfirmed = async (res: Reservation) => {
    setPickupLoading(res.id);
    try {
      await fetch(`/api/reservations/${res.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recovery_mode: 'recupere' }),
      });
      setReservations((prev) =>
        prev.map((r) => r.id === res.id ? { ...r, recoveryMode: 'recupere' } : r)
      );
    } catch {}
    setPickupLoading(null);
  };

  const filtered = reservations.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.clientName.toLowerCase().includes(q) || r.reservationNumber.toLowerCase().includes(q) || (r.clientPhone ?? '').includes(q);
  });

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        let aVal: string | number = '';
        let bVal: string | number = '';
        if (sortKey === 'balanceDue') {
          aVal = a.balanceDue;
          bVal = b.balanceDue;
        } else if (sortKey === 'recoveryMode') {
          aVal = RECOVERY_MODE_CONFIG[a.recoveryMode]?.label ?? '';
          bVal = RECOVERY_MODE_CONFIG[b.recoveryMode]?.label ?? '';
        } else if (sortKey === 'reservationType') {
          aVal = a.reservationType ? (RESERVATION_TYPE_CONFIG[a.reservationType]?.label ?? '') : '';
          bVal = b.reservationType ? (RESERVATION_TYPE_CONFIG[b.reservationType]?.label ?? '') : '';
        } else if (sortKey === 'updatedAt') {
          aVal = a.updatedAt ?? '';
          bVal = b.updatedAt ?? '';
        }
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
        return 0;
      })
    : filtered;

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function SortIcon({ col }: { col: typeof sortKey }) {
    if (sortKey !== col) return <Icon name="ChevronUpDownIcon" size={12} className="ml-1 text-muted-foreground/50 inline" />;
    return sortDir === 'asc'
      ? <Icon name="ChevronUpIcon" size={12} className="ml-1 text-primary inline" />
      : <Icon name="ChevronDownIcon" size={12} className="ml-1 text-primary inline" />;
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Page header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-white">
          <div>
            <h1 className="text-xl font-700 text-foreground">Réservations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gestion avancée des mises de côté et acomptes</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-500 rounded-lg hover:bg-accent transition-colors"
          >
            <Icon name="PlusIcon" size={16} />
            Nouvelle réservation
          </button>
        </div>

        {/* Dashboard KPIs */}
        <div className="px-6 py-4 bg-white border-b border-border">
          <p className="text-xs font-600 text-muted-foreground uppercase tracking-widest mb-3">Tableau de bord réservations</p>
          {/* Row 1: Status counts */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-2">
            <KPICard label="Total"          value={stats.total}         color="text-foreground"    bg="bg-muted/40"     icon="CalendarDaysIcon" />
            <KPICard label="En attente"     value={stats.pending}       color="text-amber-600"     bg="bg-amber-50"     icon="ClockIcon" />
            <KPICard label="Acompte versé"  value={stats.depositPaid}   color="text-blue-600"      bg="bg-blue-50"      icon="BanknotesIcon" />
            <KPICard label="Prêt à retirer" value={stats.ready}         color="text-emerald-600"   bg="bg-emerald-50"   icon="CheckCircleIcon" />
            <KPICard label="Complétées"     value={stats.completed}     color="text-slate-600"     bg="bg-slate-50"     icon="ArchiveBoxIcon" />
            <KPICard label="Annulées"       value={stats.cancelled}     color="text-red-600"       bg="bg-red-50"       icon="XCircleIcon" />
          </div>
          {/* Row 2: Financial KPIs — no double counting */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KPICard
              label="Acomptes encaissés"
              value={`${stats.totalDepositsCollected.toFixed(2)} €`}
              color="text-emerald-700"
              bg="bg-emerald-50"
              icon="BanknotesIcon"
              subtitle="Comptabilisés jour J"
            />
            <KPICard
              label="Soldes encaissés"
              value={`${stats.totalBalancesCollected.toFixed(2)} €`}
              color="text-blue-700"
              bg="bg-blue-50"
              icon="CurrencyEuroIcon"
              subtitle="Comptabilisés jour paiement"
            />
            <KPICard
              label="CA réel encaissé"
              value={`${stats.totalRealRevenue.toFixed(2)} €`}
              color="text-primary"
              bg="bg-primary/5"
              icon="ArrowTrendingUpIcon"
              subtitle="Acomptes + soldes (sans double comptage)"
            />
            <KPICard
              label="Soldes en attente"
              value={`${stats.totalAmountPending.toFixed(2)} €`}
              color="text-orange-700"
              bg="bg-orange-50"
              icon="ClockIcon"
              subtitle={`${stats.pendingBalanceCount} réservation(s)`}
            />
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 bg-white border-b border-border space-y-2">
          {/* Status tabs */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin pb-0.5">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setFilterStatus(tab.id); setSearch(''); }}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-500 transition-colors ${filterStatus === tab.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Type + Recovery filters + search */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Type filter */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
              <span className="text-[10px] font-600 text-muted-foreground uppercase shrink-0">Type:</span>
              <button
                onClick={() => setFilterType('all')}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-500 transition-colors ${filterType === 'all' ? 'bg-slate-200 text-slate-700' : 'text-muted-foreground hover:bg-muted'}`}
              >
                Tous
              </button>
              {(Object.entries(RESERVATION_TYPE_CONFIG) as [ReservationType, any][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setFilterType(filterType === key ? 'all' : key)}
                  className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-500 border transition-colors ${
                    filterType === key ? cfg.color : 'border-transparent text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon name={cfg.icon as any} size={11} />
                  {cfg.label}
                  {stats.byType[key] ? <span className="ml-0.5 font-700">({stats.byType[key]})</span> : null}
                </button>
              ))}
            </div>

            {/* Recovery filter */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
              <span className="text-[10px] font-600 text-muted-foreground uppercase shrink-0">Mode:</span>
              <button
                onClick={() => setFilterRecovery('all')}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-500 transition-colors ${filterRecovery === 'all' ? 'bg-slate-200 text-slate-700' : 'text-muted-foreground hover:bg-muted'}`}
              >
                Tous
              </button>
              {(Object.entries(RECOVERY_MODE_CONFIG) as [RecoveryMode, any][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setFilterRecovery(filterRecovery === key ? 'all' : key)}
                  className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-500 border transition-colors ${
                    filterRecovery === key ? cfg.color : 'border-transparent text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon name={cfg.icon as any} size={11} />
                  {cfg.label}
                  {stats.byRecovery[key] ? <span className="ml-0.5 font-700">({stats.byRecovery[key]})</span> : null}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative ml-auto w-full sm:w-64">
              <Icon name="MagnifyingGlassIcon" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text" value={search} onChange={(e) => handleSearch(e.target.value)}
                placeholder="Nom, téléphone, numéro..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto scrollbar-thin px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              <Icon name="ArrowPathIcon" size={24} className="animate-spin mr-2" />
              Chargement...
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <Icon name="CalendarDaysIcon" size={36} className="text-border" />
              <p className="text-sm">Aucune réservation trouvée</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">
                      <button
                        onClick={() => handleSort('reservationType')}
                        className="inline-flex items-center hover:text-foreground transition-colors"
                        title="Trier par type de réservation"
                      >
                        N° / Type<SortIcon col="reservationType" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide hidden md:table-cell">Produit / Déclinaison</th>
                    <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Total</th>
                    <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Payé</th>
                    <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                      <button
                        onClick={() => handleSort('balanceDue')}
                        className="inline-flex items-center hover:text-foreground transition-colors ml-auto"
                        title="Trier par solde restant (€)"
                      >
                        Solde (€)<SortIcon col="balanceDue" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Statut</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                      <button
                        onClick={() => handleSort('recoveryMode')}
                        className="inline-flex items-center hover:text-foreground transition-colors"
                        title="Trier par mode de livraison"
                      >
                        Mode<SortIcon col="recoveryMode" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide hidden xl:table-cell">
                      <button
                        onClick={() => handleSort('updatedAt')}
                        className="inline-flex items-center hover:text-foreground transition-colors"
                        title="Trier par dernière modification de statut"
                      >
                        Modifié<SortIcon col="updatedAt" />
                      </button>
                    </th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((res) => {
                    const sc = STATUS_CONFIG[res.reservationStatus] ?? { label: res.reservationStatus, color: 'text-gray-600 bg-gray-50 border-gray-200', dot: 'bg-gray-400', icon: 'ClockIcon' };
                    const nextAction = getNextAction(res.reservationStatus);
                    const isActing = actionLoading === res.id;
                    const firstProduct = getFirstProductImage(res.items);
                    const typeCfg = res.reservationType ? (RESERVATION_TYPE_CONFIG[res.reservationType] ?? null) : null;
                    const recoveryCfg = RECOVERY_MODE_CONFIG[res.recoveryMode] ?? { label: res.recoveryMode ?? '—', color: 'text-gray-600 bg-gray-50 border-gray-200', icon: 'QuestionMarkCircleIcon' };
                    const firstItem = res.items[0];
                    const variantLabel = firstItem ? getVariantLabel(firstItem) : '';

                    return (
                      <tr key={res.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        {/* N° + type tag */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-600 text-foreground font-mono text-xs">{res.reservationNumber}</span>
                              {res.posSaleId && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-600 bg-amber-100 text-amber-700 border border-amber-200">POS</span>
                              )}
                            </div>
                            {typeCfg && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-600 border ${typeCfg.color}`}>
                                <Icon name={typeCfg.icon as any} size={10} />
                                {typeCfg.label}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Client */}
                        <td className="px-4 py-3">
                          <p className="font-500 text-foreground">{res.clientName}</p>
                          {res.clientPhone && <p className="text-xs text-muted-foreground">{res.clientPhone}</p>}
                          {(() => {
                            const ci = getCountryInfo(res.deliveryAddress);
                            if (!ci) return null;
                            return (
                              <span className={`inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-600 border ${ci.bg} ${ci.text} ${ci.border}`}>
                                <span>{ci.flag}</span>
                                {ci.label}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Product + variant */}
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted border border-border shrink-0">
                              {firstProduct ? (
                                <Image src={firstProduct.url} alt={firstProduct.name} width={40} height={40} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Icon name="PhotoIcon" size={16} className="text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-500 text-foreground truncate max-w-[140px]">
                                {res.items[0]?.name ?? '—'}
                              </p>
                              {variantLabel && (
                                <p className="text-[10px] text-violet-600 font-500 truncate max-w-[140px]">{variantLabel}</p>
                              )}
                              {res.items.length > 1 && (
                                <p className="text-[10px] text-muted-foreground">+{res.items.length - 1} autre{res.items.length > 2 ? 's' : ''}</p>
                              )}
                              <p className="text-[10px] text-muted-foreground">
                                {res.items.reduce((s, it) => s + it.qty, 0)} unité{res.items.reduce((s, it) => s + it.qty, 0) > 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Total */}
                        <td className="px-4 py-3 text-right">
                          <span className="font-600 text-foreground tabular-nums">{res.totalAmount.toFixed(2)} €</span>
                          {res.remiseMontant && res.remiseMontant > 0 && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-600 bg-violet-100 text-violet-700 border border-violet-200">
                              −{res.remiseMontant.toFixed(2)} €
                            </span>
                          )}
                        </td>

                        {/* Paid */}
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          <div>
                            <span className={`text-xs font-600 ${res.depositPaid > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                              {res.depositPaid.toFixed(2)} €
                            </span>
                            {res.depositPercent && (
                              <p className="text-[10px] text-muted-foreground">{res.depositPercent}%</p>
                            )}
                          </div>
                        </td>

                        {/* Balance */}
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          <span className={`text-xs font-700 ${res.balanceDue > 0 ? 'text-primary' : 'text-emerald-600'}`}>
                            {res.balanceDue.toFixed(2)} €
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-500 border ${sc.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                            {sc.label}
                          </span>
                        </td>

                        {/* Recovery mode */}
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-600 border ${recoveryCfg.color}`}>
                            <Icon name={recoveryCfg.icon as any} size={10} />
                            {recoveryCfg.label}
                          </span>
                        </td>

                        {/* Last status change date */}
                        <td className="px-4 py-3 hidden xl:table-cell">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {res.updatedAt
                              ? new Date(res.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                              : '—'}
                          </span>
                          {res.updatedAt && (
                            <p className="text-[10px] text-muted-foreground/70">
                              {new Date(res.updatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => setTicketTarget(res)} title="Imprimer le ticket"
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                              <Icon name="PrinterIcon" size={15} />
                            </button>

                            {/* Bon de livraison */}
                            <button
                              onClick={() => printBon(res)}
                              title="Bon de livraison imprimable"
                              className="p-1.5 rounded-lg hover:bg-blue-100 text-muted-foreground hover:text-blue-700 transition-colors"
                            >
                              <Icon name="DocumentArrowDownIcon" size={15} />
                            </button>

                            {/* WhatsApp */}
                            {res.clientPhone && (
                              <button
                                onClick={() => setWhatsappTarget(res)}
                                title="Envoyer un message WhatsApp"
                                className="p-1.5 rounded-lg hover:bg-green-100 text-muted-foreground hover:text-green-600 transition-colors"
                              >
                                <svg viewBox="0 0 24 24" fill="currentColor" width={15} height={15}>
                                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.22 8.22 0 012.41 5.83c0 4.54-3.7 8.23-8.24 8.23-1.48 0-2.93-.39-4.19-1.15l-.3-.17-3.12.82.83-3.04-.2-.32a8.19 8.19 0 01-1.11-4.17c.01-4.54 3.7-8.23 8.1-8.23zm-3.38 3.66c-.14 0-.37.05-.57.26-.19.21-.74.73-.74 1.77 0 1.04.76 2.05.87 2.19.11.14 1.5 2.29 3.64 3.12.51.22.9.35 1.21.44.5.16.97.14 1.33.08.41-.07 1.25-.51 1.43-1.01.18-.5.18-.92.12-1.01-.05-.1-.2-.14-.41-.24-.21-.1-1.25-.62-1.44-.68-.19-.07-.33-.1-.47.1-.14.21-.54.68-.66.82-.12.13-.24.15-.45.05-.21-.1-.88-.32-1.68-.99-.62-.54-1.04-1.2-1.16-1.41-.12-.21-.01-.32.09-.42.09-.09.21-.24.31-.36.1-.12.14-.21.21-.35.07-.14.04-.27-.02-.37-.06-.1-.47-1.13-.65-1.55-.17-.42-.34-.37-.47-.37z"/>
                                </svg>
                              </button>
                            )}

                            {res.reservationStatus !== 'completed' && res.reservationStatus !== 'cancelled' && (
                              <button onClick={() => setEditTarget(res)} title="Modifier la réservation"
                                className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                                <Icon name="PencilSquareIcon" size={15} />
                              </button>
                            )}

                            {/* Transformer en facture — shows for completed reservations not yet invoiced */}
                            {res.reservationStatus === 'completed' && !res.posSaleId && res.totalAmount > 0 && (
                              <button
                                onClick={() => handleConvertToInvoice(res)}
                                disabled={invoiceLoading === res.id}
                                title="Transformer en facture"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 text-xs font-500 transition-colors disabled:opacity-60"
                              >
                                {invoiceLoading === res.id
                                  ? <Icon name="ArrowPathIcon" size={13} className="animate-spin" />
                                  : <Icon name="DocumentTextIcon" size={13} />
                                }
                                <span className="hidden xl:inline">Facture</span>
                              </button>
                            )}

                            {/* Mettre en livraison — shows for all non-cancelled reservations */}
                            {res.reservationStatus !== 'cancelled' && (
                              <button
                                onClick={() => handleOpenDeliveryModal(res)}
                                title="Mettre en livraison"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 text-xs font-500 transition-colors"
                              >
                                <Icon name="TruckIcon" size={13} />
                                <span className="hidden xl:inline">Livraison</span>
                              </button>
                            )}

                            {/* Réceptionner — confirm client picked up */}
                            {res.reservationStatus !== 'cancelled' && res.recoveryMode !== 'recupere' && (
                              <button
                                onClick={() => handlePickupConfirmed(res)}
                                disabled={pickupLoading === res.id}
                                title="Confirmer la récupération par la cliente"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-500 transition-colors disabled:opacity-60"
                              >
                                {pickupLoading === res.id
                                  ? <Icon name="ArrowPathIcon" size={13} className="animate-spin" />
                                  : <Icon name="CheckCircleIcon" size={13} />
                                }
                                <span className="hidden xl:inline">Récept.</span>
                              </button>
                            )}
                            {res.recoveryMode === 'recupere' && (
                              <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-50 text-slate-500 border border-slate-200 text-xs font-500">
                                <Icon name="CheckCircleIcon" size={13} />
                                <span className="hidden xl:inline">Récupéré</span>
                              </span>
                            )}

                            {nextAction && (
                              <button
                                onClick={() => handleAction(res, nextAction.action)}
                                disabled={isActing}
                                title={nextAction.label}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-500 transition-colors disabled:opacity-60"
                              >
                                {isActing
                                  ? <Icon name="ArrowPathIcon" size={13} className="animate-spin" />
                                  : <Icon name={nextAction.icon as any} size={13} />
                                }
                                <span className="hidden xl:inline">{nextAction.label}</span>
                              </button>
                            )}

                            {res.reservationStatus !== 'completed' && res.reservationStatus !== 'cancelled' && (
                              <button onClick={() => handleAction(res, 'cancel')} disabled={isActing} title="Annuler la réservation"
                                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                <Icon name="XMarkIcon" size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Invoice success toast */}
      {invoiceSuccess && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-4 bg-white border border-emerald-300 rounded-xl shadow-xl animate-fade-in">
          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <Icon name="CheckCircleIcon" size={20} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-600 text-foreground">Facture créée</p>
            <p className="text-xs text-muted-foreground mt-0.5">{invoiceSuccess.factureNumero}</p>
          </div>
          <button onClick={() => setInvoiceSuccess(null)} className="ml-2 p-1 rounded hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={14} />
          </button>
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <ReservationFormModal onClose={() => setShowForm(false)} onSaved={handleReservationCreated} />
      )}
      {editTarget && (
        <ReservationFormModal
          reservation={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handleReservationUpdated}
        />
      )}
      {depositTarget && (
        <DepositModal reservation={depositTarget} onClose={() => setDepositTarget(null)} onSaved={handleDepositSaved} />
      )}
      {ticketTarget && (
        <ReservationTicket reservation={ticketTarget} onClose={() => setTicketTarget(null)} />
      )}

      {/* ── WhatsApp modal ─────────────────────────────────────────────────── */}
      {whatsappTarget && (() => {
        const res = whatsappTarget;
        const phone = formatPhoneForWhatsApp(res.clientPhone ?? '');
        const firstName = res.clientName.split(' ')[0];
        const country = detectCountry(res.deliveryAddress ?? '');
        const relayAddress = "Immeuble Kappa Voie Verte à Jarry, en face de Autour de Bébé Jarry, Chez les Tisanes d'Agatha";
        const relayPhone = "0590259970";
        const msgShipped = `Bonjour ${firstName},\n\nVotre colis est bien parti et sera disponible en ${country} à l'adresse suivante :\n${relayAddress}.\n\nPour récupérer votre colis, appelez le : ${relayPhone}\n\nMerci pour votre confiance ! 🌸\n— Le Monde de l'Esthétique`;
        const msgAvailable = `Bonjour ${firstName},\n\nVotre colis est arrivé et disponible en ${country} à l'adresse suivante :\n${relayAddress}.\n\nPour récupérer votre colis, appelez le : ${relayPhone}\n\nMerci pour votre confiance ! 🌸\n— Le Monde de l'Esthétique`;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="currentColor" width={22} height={22} className="text-green-600">
                    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.22 8.22 0 012.41 5.83c0 4.54-3.7 8.23-8.24 8.23-1.48 0-2.93-.39-4.19-1.15l-.3-.17-3.12.82.83-3.04-.2-.32a8.19 8.19 0 01-1.11-4.17c.01-4.54 3.7-8.23 8.1-8.23zm-3.38 3.66c-.14 0-.37.05-.57.26-.19.21-.74.73-.74 1.77 0 1.04.76 2.05.87 2.19.11.14 1.5 2.29 3.64 3.12.51.22.9.35 1.21.44.5.16.97.14 1.33.08.41-.07 1.25-.51 1.43-1.01.18-.5.18-.92.12-1.01-.05-.1-.2-.14-.41-.24-.21-.1-1.25-.62-1.44-.68-.19-.07-.33-.1-.47.1-.14.21-.54.68-.66.82-.12.13-.24.15-.45.05-.21-.1-.88-.32-1.68-.99-.62-.54-1.04-1.2-1.16-1.41-.12-.21-.01-.32.09-.42.09-.09.21-.24.31-.36.1-.12.14-.21.21-.35.07-.14.04-.27-.02-.37-.06-.1-.47-1.13-.65-1.55-.17-.42-.34-.37-.47-.37z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-700 text-foreground">Message WhatsApp</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{res.clientName} · {res.clientPhone}</p>
                </div>
                <button onClick={() => setWhatsappTarget(null)} className="ml-auto p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                  <Icon name="XMarkIcon" size={18} />
                </button>
              </div>

              <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-3">Choisir le message :</p>
              <div className="space-y-3">
                <a
                  href={`https://wa.me/${phone}?text=${encodeURIComponent(msgShipped)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 w-full p-4 bg-green-50 border-2 border-green-300 rounded-xl hover:bg-green-100 transition-colors text-left"
                >
                  <span className="text-2xl shrink-0">📦</span>
                  <div>
                    <p className="text-sm font-700 text-green-800 mb-1">Colis expédié</p>
                    <p className="text-xs text-green-700 leading-relaxed">Votre colis est bien parti et sera disponible en {country}…</p>
                  </div>
                </a>
                <a
                  href={`https://wa.me/${phone}?text=${encodeURIComponent(msgAvailable)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 w-full p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl hover:bg-emerald-100 transition-colors text-left"
                >
                  <span className="text-2xl shrink-0">✅</span>
                  <div>
                    <p className="text-sm font-700 text-emerald-800 mb-1">Colis disponible</p>
                    <p className="text-xs text-emerald-700 leading-relaxed">Votre colis est arrivé et disponible en {country}…</p>
                  </div>
                </a>
              </div>
              <button
                onClick={() => setWhatsappTarget(null)}
                className="mt-4 w-full px-4 py-2 border border-border text-sm font-500 text-muted-foreground rounded-lg hover:bg-muted transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Delivery modal ─────────────────────────────────────────────────── */}
      {deliveryModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                <Icon name="TruckIcon" size={20} className="text-orange-600" />
              </div>
              <div>
                <h3 className="text-base font-700 text-foreground">Mettre en livraison</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{deliveryModalTarget.clientName} · {deliveryModalTarget.reservationNumber}</p>
              </div>
              <button onClick={() => { setDeliveryModalTarget(null); setDeliveryResult(null); }} className="ml-auto p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <Icon name="XMarkIcon" size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Driver select */}
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5 block">Livreur (optionnel)</label>
                {loadingDrivers ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Icon name="ArrowPathIcon" size={14} className="animate-spin" /> Chargement…
                  </div>
                ) : (
                  <select
                    value={deliveryDriverId}
                    onChange={(e) => setDeliveryDriverId(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    <option value="">— Sans livreur assigné —</option>
                    {deliveryDrivers.map((dr) => (
                      <option key={dr.id} value={dr.id}>
                        {dr.name} {dr.driverStatus === 'available' ? '🟢' : dr.driverStatus === 'busy' ? '🟡' : '⚫'}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Address */}
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5 block">Adresse de livraison *</label>
                <textarea
                  value={deliveryModalAddress}
                  onChange={(e) => setDeliveryModalAddress(e.target.value)}
                  rows={3}
                  placeholder="Ex: 12 Rue des Flamboyants, 97200 Fort-de-France, Martinique"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>

              {deliveryResult && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${deliveryResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  <Icon name={deliveryResult.ok ? 'CheckCircleIcon' : 'ExclamationCircleIcon'} size={14} />
                  {deliveryResult.msg}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setDeliveryModalTarget(null); setDeliveryResult(null); }}
                  className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-500 text-muted-foreground hover:bg-muted transition-colors"
                >
                  Fermer
                </button>
                {!deliveryResult?.ok && (
                  <button
                    onClick={handleCreateDelivery}
                    disabled={creatingDelivery || !deliveryModalAddress.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-600 hover:bg-orange-600 transition-colors disabled:opacity-60"
                  >
                    {creatingDelivery ? <Icon name="ArrowPathIcon" size={14} className="animate-spin" /> : <Icon name="TruckIcon" size={14} />}
                    Créer la livraison
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
