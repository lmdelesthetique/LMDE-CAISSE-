'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ColissimoInfoModal, openColiship, type ColissimoData } from '@/components/ColissimoInfoModal';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { fetchReceiptById, modifyTicket, fetchTicketModifications, type ReceiptRecord, type TicketModification } from '@/lib/services/posService';
import { sendReceiptEmail, type ReceiptEmailData } from '@/lib/services/emailService';
import { toast } from 'sonner';
import { generateTicketHTML, generateFactureHTML, loadSettingsFromCache, openAndPrint } from '@/lib/utils/ticketPrinter';

// ── Colissimo helpers ─────────────────────────────────────────────────────────

function shopifyOrderToColissimoData(order: any): ColissimoData {
  const addr = order.shipping_address || {};
  const customer = order.customer || {};
  return {
    nom: (addr.last_name || customer.last_name || '').toUpperCase(),
    prenom: addr.first_name || customer.first_name || '',
    adresse: addr.address1 || '',
    complement: addr.address2 || '',
    cp: addr.zip || '',
    ville: (addr.city || '').toUpperCase(),
    pays: addr.country || 'Martinique',
    tel: addr.phone || customer.phone || '',
    email: customer.email || '',
  };
}

function exportShopifyToColishipCSV(orders: any[]) {
  const headers = ['Nom', 'Prenom', 'Adresse1', 'Adresse2', 'CP', 'Ville', 'Pays', 'Telephone', 'Poids', 'Reference', 'Valeur'];
  const rows = orders.map((order) => {
    const addr = order.shipping_address || {};
    const customer = order.customer || {};
    return [
      (addr.last_name || customer.last_name || '').toUpperCase(),
      addr.first_name || customer.first_name || '',
      addr.address1 || '',
      addr.address2 || '',
      addr.zip || '',
      addr.city || '',
      addr.country_code || 'FR',
      addr.phone || customer.phone || '',
      '0.5',
      '#' + order.order_number,
      order.total_price || '0',
    ];
  });
  const csv = [headers, ...rows].map((row) => row.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'coliship_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

interface TicketRow {
  id: string;
  ticket_number: string;
  created_at: string;
  total_amount: number;
  payment_method: string;
  client_name: string | null;
  items_count: number;
  status: string;
  cashier_name: string | null;
  discount_amount: number | null;
  is_demo?: boolean;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Espèces',
  card: 'SumUp (CB)',
  CB: 'SumUp (CB)',
  'SumUp (CB)': 'SumUp (CB)',
  Espèces: 'Espèces',
  Virement: 'Virement',
  Mixte: 'Mixte',
  mixed: 'Mixte',
  'Alma (3x/4x)': 'Alma',
  alma: 'Alma',
  check: 'Chèque',
  transfer: 'Virement',
  store_credit: 'Avoir',
  acompte: 'Acompte',
};

const METHOD_COLORS: Record<string, string> = {
  'SumUp (CB)': 'text-blue-700 bg-blue-50 border-blue-200',
  'Espèces': 'text-emerald-700 bg-emerald-50 border-emerald-200',
  'Virement': 'text-cyan-700 bg-cyan-50 border-cyan-200',
  'Mixte': 'text-purple-700 bg-purple-50 border-purple-200',
  'Alma': 'text-pink-700 bg-pink-50 border-pink-200',
  'Chèque': 'text-amber-700 bg-amber-50 border-amber-200',
  'Avoir': 'text-rose-700 bg-rose-50 border-rose-200',
  'Acompte': 'text-orange-700 bg-orange-50 border-orange-200',
};

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMethod(raw: string): { label: string; color: string; detail?: string } {
  // Mixte|cbAmount|cashAmount — stored when Mixte payment amounts are known
  if (raw.startsWith('Mixte|')) {
    const [, cb, cash] = raw.split('|');
    const cbNum = parseFloat(cb ?? '0');
    const cashNum = parseFloat(cash ?? '0');
    return {
      label: 'Mixte',
      color: METHOD_COLORS['Mixte'],
      detail: `CB: ${fmt(cbNum)} € + Espèces: ${fmt(cashNum)} €`,
    };
  }
  const label = METHOD_LABELS[raw] ?? raw;
  return { label, color: METHOD_COLORS[label] ?? 'text-slate-700 bg-slate-50 border-slate-200' };
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

type PeriodFilter = 'today' | 'week' | 'month' | 'year' | 'custom';

function getPeriodDates(period: PeriodFilter, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const toISO = (d: Date) => d.toISOString();

  if (period === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from: toISO(start), to: toISO(now) };
  }
  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return { from: toISO(start), to: toISO(now) };
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toISO(start), to: toISO(now) };
  }
  if (period === 'year') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { from: toISO(start), to: toISO(now) };
  }
  return {
    from: customFrom ? new Date(customFrom).toISOString() : toISO(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: customTo ? new Date(customTo + 'T23:59:59').toISOString() : toISO(now),
  };
}

// ─── PIN Cancel Modal ─────────────────────────────────────────────────────────
const PIN_LOCK_DURATION = 60; // seconds

function PinCancelModal({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lockCountdown, setLockCountdown] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!locked) return;
    setLockCountdown(PIN_LOCK_DURATION);
    const interval = setInterval(() => {
      setLockCountdown((c) => {
        if (c <= 1) { clearInterval(interval); setLocked(false); setAttempts(0); setError(''); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [locked]);

  const [checking, setChecking] = useState(false);

  const handleSubmit = async () => {
    if (checking || locked || pin.length < 4) return;
    setChecking(true);
    try {
      const res = await fetch('/api/auth/verify-manager-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.valid) {
        onConfirm();
      } else {
        const next = attempts + 1;
        setAttempts(next);
        setPin('');
        if (next >= 3) {
          setLocked(true);
          setError('3 tentatives incorrectes — accès bloqué 60 secondes');
        } else {
          setError(`Code incorrect. ${3 - next} tentative(s) restante(s).`);
        }
      }
    } catch {
      setError('Erreur réseau — réessayez');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <Icon name="LockClosedIcon" size={20} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-700 text-foreground text-sm">Autorisation manager</h3>
            <p className="text-xs text-muted-foreground">Entrez le code PIN pour annuler ce ticket</p>
          </div>
        </div>
        {locked ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-sm font-700 text-red-700">Accès bloqué</p>
            <p className="text-3xl font-700 text-red-600 tabular-nums mt-1">{lockCountdown}s</p>
          </div>
        ) : (
          <>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && pin.length >= 4) handleSubmit(); }}
              placeholder="Code PIN manager"
              className="w-full border border-border rounded-lg px-4 py-3 text-lg text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
              autoFocus
            />
            {error && <p className="text-xs text-red-600 text-center">{error}</p>}
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                disabled={pin.length < 4 || checking}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-700 hover:bg-red-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {checking ? <><Icon name="ArrowPathIcon" size={13} className="animate-spin" />Vérif…</> : 'Confirmer'}
              </button>
            </div>
          </>
        )}
        {locked && (
          <button onClick={onClose} className="w-full py-2.5 border border-border rounded-xl text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
            Fermer
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Delivery From Ticket Modal ───────────────────────────────────────────────
interface DeliveryFromTicketModalProps {
  receipt: import('@/lib/services/posService').ReceiptRecord;
  onClose: () => void;
  onCreated: () => void;
}

function DeliveryFromTicketModal({ receipt, onClose, onCreated }: DeliveryFromTicketModalProps) {
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [driverId, setDriverId] = useState('');
  const [notes, setNotes] = useState('');
  const [drivers, setDrivers] = useState<{ id: string; name: string; driverStatus: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadingClient, setLoadingClient] = useState(false);

  useEffect(() => {
    fetch('/api/livreurs')
      .then((r) => r.json())
      .then((d) =>
        setDrivers(
          (d.drivers ?? []).map((dr: any) => ({
            id: dr.id,
            name: `${dr.first_name ?? ''} ${dr.last_name ?? ''}`.trim(),
            driverStatus: dr.driver_status ?? 'off',
          }))
        )
      )
      .catch(() => {});

    if (receipt.clientId) {
      setLoadingClient(true);
      fetch(`/api/clients/${receipt.clientId}`)
        .then((r) => r.json())
        .then((c) => {
          if (c?.telephone) setPhone(c.telephone);
          if (c?.adresse) {
            const parts = [c.adresse, c.ville, c.code_postal].filter(Boolean).join(', ');
            setAddress(parts);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingClient(false));
    }
  }, [receipt.clientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) { setError('Adresse de livraison requise'); return; }
    setSubmitting(true);
    setError('');
    try {
      const products = receipt.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        price: item.price,
      }));

      const res = await fetch('/api/livraisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: receipt.clientName || 'Client',
          client_phone: phone.trim() || null,
          delivery_address: address.trim(),
          delivery_notes: notes.trim() || null,
          products,
          total_amount: receipt.totalAmount,
          receipt_id: receipt.id,
          assigned_to_driver: driverId || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur création');
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-700 text-foreground text-base">🚚 Créer une livraison</h2>
            <p className="text-xs text-muted-foreground">Ticket {receipt.ticketNumber}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Client (read-only) */}
          <div className="bg-muted/20 rounded-xl px-4 py-3">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1">Client</p>
            <p className="text-sm font-700 text-foreground">{receipt.clientName || 'Anonyme'}</p>
          </div>

          {/* Phone */}
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Téléphone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+596 696 00 00 00"
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Address */}
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">
              Adresse de livraison <span className="text-red-500">*</span>
              {loadingClient && <span className="ml-1.5 text-xs font-400 text-primary">Chargement fiche client…</span>}
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rue, ville, code postal…"
              rows={2}
              required
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          {/* Products summary */}
          {receipt.items.length > 0 && (
            <div className="bg-muted/20 rounded-xl px-4 py-3">
              <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-2">
                Articles ({receipt.items.length})
              </p>
              <div className="space-y-0.5">
                {receipt.items.slice(0, 5).map((item, i) => (
                  <p key={i} className="text-xs text-foreground">
                    • {item.name} ×{item.qty} — {(item.price * item.qty).toFixed(2)} €
                  </p>
                ))}
                {receipt.items.length > 5 && (
                  <p className="text-xs text-muted-foreground">+{receipt.items.length - 5} autres articles</p>
                )}
              </div>
              <p className="text-sm font-700 text-foreground mt-2 pt-2 border-t border-border">
                Montant : {receipt.totalAmount.toFixed(2)} €
              </p>
            </div>
          )}

          {/* Driver */}
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Assigner un livreur</label>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            >
              <option value="">— Aucun (en attente) —</option>
              {drivers.map((dr) => (
                <option key={dr.id} value={dr.id}>
                  {dr.name} {dr.driverStatus === 'on' ? '🟢' : '⚫'}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Notes (optionnel)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Interphone, étage, instructions…"
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-border rounded-xl text-sm font-600 text-muted-foreground hover:bg-muted transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || !address.trim()}
              className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-700 hover:bg-orange-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {submitting
                ? <><Icon name="ArrowPathIcon" size={13} className="animate-spin" />Création…</>
                : '🚚 Créer la livraison'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Ticket Detail Modal ──────────────────────────────────────────────────────
interface TicketDetailModalProps {
  ticketId: string;
  fallbackTicket?: TicketRow;
  onClose: () => void;
  onModified: () => void;
}

function TicketDetailModal({ ticketId, fallbackTicket, onClose, onModified }: TicketDetailModalProps) {
  const [receipt, setReceipt] = useState<ReceiptRecord | null>(null);
  const [modifications, setModifications] = useState<TicketModification[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tab, setTab] = useState<'detail' | 'edit' | 'history'>('detail');
  const [editForm, setEditForm] = useState({ clientName: '', paymentMethod: '', notes: '', reason: '' });
  const [emailAddr, setEmailAddr] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPinCancel, setShowPinCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [hasDelivery, setHasDelivery] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setFetchError(null);
      const [rec, mods] = await Promise.all([
        fetchReceiptById(ticketId),
        fetchTicketModifications(ticketId),
      ]);
      setReceipt(rec);
      setModifications(mods);
      if (rec) {
        setEditForm({
          clientName: rec.clientName || '',
          paymentMethod: rec.paymentMethod || '',
          notes: rec.notes || '',
          reason: '',
        });
        setHasDelivery(rec.hasDelivery);
      } else {
        setFetchError('Impossible de charger les détails depuis le serveur');
      }
      setLoading(false);
    };
    load();
  }, [ticketId]);

  const handlePrint = () => {
    if (!receipt) return;
    const now = new Date(receipt.createdAt);
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const s = loadSettingsFromCache();
    const subtotalHT = receipt.subtotalHT || receipt.totalAmount / (1 + s.tvaRate / 100);
    const totalTVA = receipt.totalTVA || receipt.totalAmount - subtotalHT;
    openAndPrint(generateTicketHTML({
      ...s,
      ticketNumber: receipt.ticketNumber,
      dateStr,
      timeStr,
      cashierLabel: receipt.cashierName || s.cashierLabel,
      clientName: receipt.clientName ?? undefined,
      items: receipt.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, discount: i.discount, discountType: i.discountType })),
      subtotalHT,
      totalTVA,
      totalTTC: receipt.totalAmount,
      paymentMethod: parseMethod(receipt.paymentMethod ?? '').label,
      isDuplicate: true,
    }));
  };

  const handleCreateFacture = () => {
    if (!receipt) return;
    const now = new Date(receipt.createdAt);
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const s = loadSettingsFromCache();
    const subtotalHT = receipt.subtotalHT || receipt.totalAmount / (1 + s.tvaRate / 100);
    const totalTVA = receipt.totalTVA || receipt.totalAmount - subtotalHT;
    openAndPrint(generateFactureHTML({
      numero: `FAC-${receipt.ticketNumber}`,
      docType: 'facture',
      dateStr,
      timeStr,
      clientName: receipt.clientName ?? undefined,
      items: receipt.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, discount: i.discount, discountType: i.discountType })),
      subtotalHT,
      totalTVA,
      totalTTC: receipt.totalAmount,
      tvaRate: s.tvaRate,
      paymentMethod: parseMethod(receipt.paymentMethod ?? '').label,
      companyName: s.companyName,
      companyLine1: s.companyLine1,
      companyLine2: s.companyLine2,
      companyCity: s.companyCity,
      companyPhone: s.companyPhone,
      companySiret: s.companySiret,
      companyTva: s.companyTva,
    }));
  };

  const handleSendEmail = async () => {
    if (!receipt || !emailAddr.includes('@')) return;
    setSendingEmail(true);
    const receiptData: ReceiptEmailData = {
      ticketNumber: receipt.ticketNumber,
      date: new Date(receipt.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
      clientName: receipt.clientName || undefined,
      items: receipt.items.map((i) => ({
        name: i.name,
        qty: i.qty,
        price: i.price,
        discount: i.discount > 0 ? i.discount : undefined,
      })),
      subtotalHT: receipt.subtotalHT || receipt.totalAmount / 1.085,
      totalTVA: receipt.totalTVA || receipt.totalAmount * 0.085 / 1.085,
      totalTTC: receipt.totalAmount,
      paymentMethod: parseMethod(receipt.paymentMethod ?? '').label,
      cashierName: receipt.cashierName || undefined,
    };
    const result = await sendReceiptEmail(emailAddr, receiptData);
    setSendingEmail(false);
    if (result.success) {
      setEmailSent(true);
      toast.success(`Ticket envoyé à ${emailAddr}`);
    } else {
      toast.error(`Erreur d'envoi : ${(result as any).error}`);
    }
  };

  const handleCancelTicket = async () => {
    if (!receipt) return;
    setCancelling(true);
    setShowPinCancel(false);
    try {
      const res = await fetch(`/api/receipts/${receipt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changes: { status: 'cancelled' },
          modifiedBy: 'Manager',
          reason: 'Annulation ticket — autorisation manager',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success('Ticket annulé');
      setReceipt((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
      onModified();
    } catch (e: any) {
      toast.error(`Erreur annulation : ${e?.message}`);
    } finally {
      setCancelling(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!receipt || !editForm.reason.trim()) {
      toast.error('Veuillez indiquer une raison de modification');
      return;
    }
    setSaving(true);
    const ok = await modifyTicket(
      receipt.id,
      {
        clientName: editForm.clientName || null,
        paymentMethod: editForm.paymentMethod,
        notes: editForm.notes,
      },
      'Caissier',
      editForm.reason
    );
    setSaving(false);
    if (ok) {
      toast.success('Ticket modifié avec succès');
      setReceipt(prev => prev ? {
        ...prev,
        clientName: editForm.clientName || null,
        paymentMethod: editForm.paymentMethod,
        notes: editForm.notes,
      } : prev);
      const mods = await fetchTicketModifications(receipt.id);
      setModifications(mods);
      setTab('detail');
      onModified();
    } else {
      toast.error('Erreur lors de la modification');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon name="ReceiptRefundIcon" size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="font-700 text-foreground">{loading ? 'Chargement...' : receipt?.ticketNumber || 'Ticket'}</h2>
              {receipt && <p className="text-xs text-muted-foreground">{formatDateTime(receipt.createdAt)}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 shrink-0">
          {[
            { id: 'detail', label: 'Détail', icon: 'DocumentTextIcon' },
            { id: 'edit', label: 'Modifier', icon: 'PencilSquareIcon' },
            { id: 'history', label: `Historique (${modifications.length})`, icon: 'ClockIcon' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-500 transition-colors ${
                tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Icon name={t.icon as any} size={14} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Icon name="ArrowPathIcon" size={28} className="animate-spin text-primary" />
            </div>
          ) : !receipt ? (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <Icon name="ExclamationTriangleIcon" size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-600 text-amber-800">Détail non disponible depuis le serveur</p>
                  <p className="text-xs text-amber-700 mt-0.5">{fetchError ?? 'Ce ticket n\'a pas pu être chargé.'} Consultez <code className="bg-amber-100 px-1 rounded">/api/debug/ticket-check</code> pour diagnostiquer.</p>
                </div>
              </div>
              {fallbackTicket && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'N° Ticket', value: fallbackTicket.ticket_number },
                      { label: 'Date', value: formatDateTime(fallbackTicket.created_at) },
                      { label: 'Client', value: fallbackTicket.client_name || 'Anonyme' },
                      { label: 'Mode paiement', value: parseMethod(fallbackTicket.payment_method ?? '').label },
                    ].map((info) => (
                      <div key={info.label} className="bg-muted/30 rounded-xl px-4 py-3">
                        <p className="text-xs text-muted-foreground mb-0.5">{info.label}</p>
                        <p className="text-sm font-600 text-foreground">{info.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-muted/20 rounded-xl px-4 py-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">⚠️ Articles non disponibles — ticket antérieur à la mise à jour du système</p>
                    <p className="text-2xl font-900 tabular-nums text-foreground">{fmt(fallbackTicket.total_amount)} €</p>
                  </div>
                  <button
                    onClick={() => {
                      const s = loadSettingsFromCache();
                      const now = new Date(fallbackTicket.created_at);
                      openAndPrint(generateTicketHTML({
                        ...s,
                        ticketNumber: fallbackTicket.ticket_number,
                        dateStr: now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                        timeStr: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                        cashierLabel: fallbackTicket.cashier_name || s.cashierLabel,
                        clientName: fallbackTicket.client_name ?? undefined,
                        items: [{ name: '⚠️ Détail articles non disponible', qty: 1, price: fallbackTicket.total_amount, discount: 0, discountType: 'percent' as const }],
                        subtotalHT: fallbackTicket.total_amount / 1.085,
                        totalTVA: fallbackTicket.total_amount * 0.085 / 1.085,
                        totalTTC: fallbackTicket.total_amount,
                        paymentMethod: parseMethod(fallbackTicket.payment_method ?? '').label,
                        isDuplicate: true,
                      }));
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border border-border rounded-xl text-sm font-500 text-foreground hover:bg-muted transition-colors"
                  >
                    <Icon name="PrinterIcon" size={15} />
                    Réimprimer le reçu simplifié
                  </button>
                </>
              )}
            </div>
          ) : tab === 'detail' ? (
            <>
              {/* Info row */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Client', value: receipt.clientName || 'Anonyme', icon: 'UserIcon' },
                  { label: 'Caissier', value: receipt.cashierName || '—', icon: 'UserCircleIcon' },
                  { label: 'Mode paiement', value: parseMethod(receipt.paymentMethod ?? '').label, icon: 'CreditCardIcon' },
                  { label: 'Statut', value: receipt.status === 'completed' ? 'Validé' : receipt.status, icon: 'CheckCircleIcon' },
                ].map((info) => (
                  <div key={info.label} className="bg-muted/30 rounded-xl px-4 py-3">
                    <p className="text-xs text-muted-foreground mb-0.5">{info.label}</p>
                    <p className="text-sm font-600 text-foreground">{info.value}</p>
                  </div>
                ))}
              </div>

              {/* Items */}
              {receipt.items.length > 0 ? (
                <div>
                  <h3 className="text-sm font-700 text-foreground mb-2">Articles ({receipt.items.length})</h3>
                  <div className="border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="text-left px-3 py-2 text-xs font-600 text-muted-foreground">Article</th>
                          <th className="text-center px-3 py-2 text-xs font-600 text-muted-foreground">Qté</th>
                          <th className="text-right px-3 py-2 text-xs font-600 text-muted-foreground">PU</th>
                          <th className="text-right px-3 py-2 text-xs font-600 text-muted-foreground">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receipt.items.map((item, i) => {
                          const lineTotal = Math.max(0, item.price * item.qty - (item.discountType === 'percent' ? item.price * item.qty * (item.discount / 100) : item.discount));
                          return (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td className="px-3 py-2.5 text-foreground">{item.name}</td>
                              <td className="px-3 py-2.5 text-center text-muted-foreground">{item.qty}</td>
                              <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">{fmt(item.price)} €</td>
                              <td className="px-3 py-2.5 text-right font-600 tabular-nums">{fmt(lineTotal)} €</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-muted/20 rounded-xl p-4 text-center text-sm text-muted-foreground">
                  Détails des articles non disponibles pour ce ticket
                </div>
              )}

              {/* Totals */}
              <div className="bg-muted/20 rounded-xl px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Total HT</span>
                  <span className="tabular-nums">{fmt(receipt.subtotalHT || receipt.totalAmount / 1.085)} €</span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>TVA 8,5 %</span>
                  <span className="tabular-nums">{fmt(receipt.totalTVA || receipt.totalAmount * 0.085 / 1.085)} €</span>
                </div>
                {receipt.discountAmount > 0 && (
                  <div className="flex items-center justify-between text-sm text-amber-600">
                    <span>Remise</span>
                    <span className="tabular-nums">-{fmt(receipt.discountAmount)} €</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-base font-700 text-foreground border-t border-border pt-1.5">
                  <span>Total TTC</span>
                  <span className="tabular-nums">{fmt(receipt.totalAmount)} €</span>
                </div>
              </div>

              {receipt.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-600 text-amber-700 mb-1">Note interne</p>
                  <p className="text-sm text-amber-800">{receipt.notes}</p>
                </div>
              )}

              {/* Delivery status badge */}
              {hasDelivery && (
                <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5">
                  <span className="text-base">🚚</span>
                  <p className="text-sm font-600 text-orange-700">Ticket en livraison</p>
                </div>
              )}

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={handlePrint}
                  className="flex items-center justify-center gap-2 py-2.5 border border-border rounded-xl text-sm font-500 text-foreground hover:bg-muted transition-colors"
                >
                  <Icon name="PrinterIcon" size={15} />
                  Réimprimer
                </button>
                <button
                  onClick={handleCreateFacture}
                  className="flex items-center justify-center gap-2 py-2.5 border border-emerald-200 bg-emerald-50 rounded-xl text-sm font-500 text-emerald-700 hover:bg-emerald-100 transition-colors"
                >
                  <Icon name="DocumentCheckIcon" size={15} />
                  Créer facture
                </button>
              </div>

              {/* Delivery button */}
              {receipt.status !== 'cancelled' && !hasDelivery && (
                <button
                  onClick={() => setShowDeliveryModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-orange-200 bg-orange-50 rounded-xl text-sm font-600 text-orange-700 hover:bg-orange-100 transition-colors"
                >
                  🚚 Mettre en livraison
                </button>
              )}

              {receipt.status !== 'cancelled' && (
                <button
                  onClick={() => setShowPinCancel(true)}
                  disabled={cancelling}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-red-200 bg-red-50 rounded-xl text-sm font-600 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-40"
                >
                  {cancelling
                    ? <><Icon name="ArrowPathIcon" size={15} className="animate-spin" />Annulation…</>
                    : <><Icon name="XCircleIcon" size={15} />Annuler ce ticket</>
                  }
                </button>
              )}

              {/* Email send */}
              <div className="border border-border rounded-xl p-4">
                <p className="text-sm font-600 text-foreground mb-2 flex items-center gap-2">
                  <Icon name="EnvelopeIcon" size={15} className="text-purple-600" />
                  Envoyer par email
                </p>
                {emailSent ? (
                  <p className="text-sm text-emerald-600 font-500">✓ Ticket envoyé !</p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={emailAddr}
                      onChange={(e) => setEmailAddr(e.target.value)}
                      placeholder="email@client.fr"
                      className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      onClick={handleSendEmail}
                      disabled={!emailAddr.includes('@') || sendingEmail}
                      className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white text-sm font-500 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                      {sendingEmail ? <Icon name="ArrowPathIcon" size={13} className="animate-spin" /> : <Icon name="PaperAirplaneIcon" size={13} />}
                      Envoyer
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : tab === 'edit' ? (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <Icon name="InformationCircleIcon" size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  Seules les modifications limitées sont autorisées après encaissement : client, méthode de paiement et note interne. Toutes les modifications sont tracées.
                </p>
              </div>

              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Nom du client</label>
                <input
                  type="text"
                  value={editForm.clientName}
                  onChange={(e) => setEditForm(f => ({ ...f, clientName: e.target.value }))}
                  placeholder="Nom du client (laisser vide pour anonyme)"
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Méthode de paiement</label>
                <select
                  value={editForm.paymentMethod}
                  onChange={(e) => setEditForm(f => ({ ...f, paymentMethod: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                >
                  <option value="SumUp (CB)">SumUp (CB)</option>
                  <option value="Espèces">Espèces</option>
                  <option value="Virement">Virement</option>
                  <option value="Mixte">Mixte</option>
                  <option value="Alma (3x/4x)">Alma (3x/4x)</option>
                  <option value="acompte">Acompte</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Note interne</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Note interne visible uniquement par l'équipe..."
                  rows={3}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">
                  Raison de la modification <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.reason}
                  onChange={(e) => setEditForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Ex: Erreur de saisie client, correction méthode de paiement..."
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <button
                onClick={handleSaveEdit}
                disabled={saving || !editForm.reason.trim()}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
              >
                {saving ? <Icon name="ArrowPathIcon" size={15} className="animate-spin" /> : <Icon name="CheckIcon" size={15} />}
                Enregistrer les modifications
              </button>
            </div>
          ) : (
            /* History tab */
            <div>
              {modifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Icon name="ClockIcon" size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Aucune modification enregistrée</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {modifications.map((mod) => (
                    <div key={mod.id} className="border border-border rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-600 text-primary bg-primary/10 px-2 py-0.5 rounded-full">{mod.fieldChanged}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(mod.modifiedAt)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div className="bg-red-50 rounded-lg px-3 py-2">
                          <p className="text-red-500 font-600 mb-0.5">Ancienne valeur</p>
                          <p className="text-red-700">{mod.oldValue || '—'}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg px-3 py-2">
                          <p className="text-emerald-600 font-600 mb-0.5">Nouvelle valeur</p>
                          <p className="text-emerald-700">{mod.newValue || '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Par : <span className="font-500 text-foreground">{mod.modifiedBy}</span></span>
                        {mod.reason && <span className="italic">"{mod.reason}"</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {showPinCancel && (
        <PinCancelModal onConfirm={handleCancelTicket} onClose={() => setShowPinCancel(false)} />
      )}
      {showDeliveryModal && receipt && (
        <DeliveryFromTicketModal
          receipt={receipt}
          onClose={() => setShowDeliveryModal(false)}
          onCreated={() => {
            setShowDeliveryModal(false);
            setHasDelivery(true);
            toast.success('Livraison créée avec succès !');
          }}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CaisseHistoriquePage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filterMethod, setFilterMethod] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState<'all' | 'real' | 'demo'>('real');
  const [page, setPage] = useState(0);
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const PAGE_SIZE = 50;

  const [apiError, setApiError] = useState<string | null>(null);
  const [returnsTotal, setReturnsTotal] = useState(0);
  const [returnsCount, setReturnsCount] = useState(0);
  const [diagnosing, setDiagnosing] = useState(false);
  const [setupSql, setSetupSql] = useState<string | null>(null);

  const [pageTab, setPageTab] = useState<'caisse' | 'shopify'>('caisse');
  const [shopifyOrders, setShopifyOrders] = useState<any[]>([]);
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [shopifyConnected, setShopifyConnected] = useState<boolean | null>(null);
  const [shopifyCA, setShopifyCA] = useState(0);
  const [shopifyOrdersCount, setShopifyOrdersCount] = useState(0);
  const [colissimoModalData, setColissimoModalData] = useState<ColissimoData | null>(null);

  const runDiagnose = useCallback(async () => {
    setDiagnosing(true);
    try {
      const res = await fetch('/api/setup/diagnose');
      if (res.ok) {
        const d = await res.json();
        console.log('[caisse-historique] diagnose:', d);
        if (d.setup_sql) setSetupSql(d.setup_sql);
        if (d.errors?.length) {
          toast.error(`Diagnostic: ${d.errors[0]}`, { duration: 10000 });
        }
      }
    } catch {/* silent */} finally {
      setDiagnosing(false);
    }
  }, []);

  const loadShopifyOrders = useCallback(async () => {
    setShopifyLoading(true);
    const { from, to } = getPeriodDates(period, customFrom, customTo);
    try {
      const [ordersRes, statsRes] = await Promise.all([
        fetch('/api/shopify/orders'),
        fetch(`/api/shopify/stats?start=${encodeURIComponent(from)}&end=${encodeURIComponent(to)}`),
      ]);
      const ordersData = await ordersRes.json();
      setShopifyConnected(ordersData.connected ?? false);
      setShopifyOrders(ordersData.orders ?? []);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setShopifyCA(statsData.ca ?? 0);
        setShopifyOrdersCount(statsData.orders ?? 0);
      }
    } catch {
      setShopifyConnected(false);
    } finally {
      setShopifyLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => {
    if (pageTab === 'shopify') loadShopifyOrders();
  }, [pageTab, loadShopifyOrders]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    const { from, to } = getPeriodDates(period, customFrom, customTo);

    try {
      const params = new URLSearchParams({
        from, to,
        method: filterMethod,
        status: filterStatus,
        all: 'true',
      });
      const res = await fetch(`/api/receipts?${params}`);
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = (body as any).error || `Erreur HTTP ${res.status}`;
        const code = (body as any).code || '';
        console.error('[caisse-historique] API error:', res.status, code, body);
        const display = res.status === 401
          ? 'Session expirée — rechargez la page'
          : `${msg}${code ? ` (${code})` : ''}`;
        setApiError(display);
        toast.error(display, { duration: 8000 });
        setTickets([]);
        // Auto-diagnose on first failure
        runDiagnose();
        return;
      }

      const rawTickets: any[] = Array.isArray(body) ? body : [];

      const mapped: TicketRow[] = rawTickets.map((t) => ({
        id: t.id,
        ticket_number: t.ticket_number ?? t.id.substring(0, 8).toUpperCase(),
        created_at: t.created_at,
        total_amount: t.total_amount ?? 0,
        payment_method: t.payment_method ?? 'other',
        client_name: t.client_name ?? null,
        items_count: t.items_count ?? 0,
        status: t.status ?? 'completed',
        cashier_name: t.cashier_name ?? null,
        discount_amount: t.discount_amount ?? null,
        is_demo: t.is_demo ?? false,
      }));

      setTickets(mapped);

      // Also fetch returns/avoirs for the period to compute CA net
      try {
        const retParams = new URLSearchParams({ from, to });
        const retRes = await fetch(`/api/returns?${retParams}`);
        if (retRes.ok) {
          const retData: any[] = await retRes.json();
          const completed = retData.filter(r => r.return_status === 'completed');
          setReturnsTotal(completed.reduce((s, r) => s + parseFloat(r.total_amount ?? 0), 0));
          setReturnsCount(completed.length);
        }
      } catch { /* returns fetch is best-effort */ }

      // Shopify stats for same period (non-blocking — used in combined CA strip)
      fetch(`/api/shopify/stats?start=${encodeURIComponent(from)}&end=${encodeURIComponent(to)}`)
        .then(r => r.json())
        .then(d => { setShopifyCA(d.ca ?? 0); setShopifyOrdersCount(d.orders ?? 0); })
        .catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur réseau';
      console.error('[caisse-historique] fetch error:', e);
      setApiError(msg);
      toast.error(`Impossible de charger les transactions: ${msg}`, { duration: 8000 });
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo, filterMethod, filterStatus, runDiagnose]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const filtered = tickets.filter(t => {
    if (filterType === 'real' && t.is_demo) return false;
    if (filterType === 'demo' && !t.is_demo) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (t.ticket_number ?? '').toLowerCase().includes(q) ||
      (t.client_name ?? '').toLowerCase().includes(q) ||
      (t.cashier_name ?? '').toLowerCase().includes(q)
    );
  });

  // Client-side pagination — KPIs use all filtered, table uses current slice
  const displayTickets = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const realFiltered = filtered.filter(t => !t.is_demo);
  const totalCA = realFiltered.reduce((sum, t) => sum + (t.status !== 'cancelled' ? (t.total_amount ?? 0) : 0), 0);
  const totalTickets = realFiltered.filter(t => t.status !== 'cancelled').length;
  const avgBasket = totalTickets > 0 ? totalCA / totalTickets : 0;
  const cancelledCount = realFiltered.filter(t => t.status === 'cancelled').length;

  // Payment breakdown — for reconciliation with SumUp/bank
  // Use ALL non-cancelled tickets (including demo) to match terminal totals
  const allNonCancelled = tickets.filter(t => t.status !== 'cancelled');
  const isRealTicket = (t: TicketRow) => {
    if (t.is_demo === true) return false;
    const cn = (t.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    return cn !== 'CHRISTY LHOMME';
  };
  const realNonCancelled = allNonCancelled.filter(isRealTicket);
  const demoNonCancelled = allNonCancelled.filter(t => !isRealTicket(t));

  const payBreakdown: Record<string, number> = {};
  realNonCancelled.forEach(t => {
    const raw = t.payment_method ?? 'Autre';
    const key = raw.startsWith('Mixte') ? 'Mixte' : (parseMethod(raw).label);
    payBreakdown[key] = (payBreakdown[key] ?? 0) + (t.total_amount ?? 0);
  });

  // CB split: real customers vs formation (both went through SumUp terminal)
  const cbReal = realNonCancelled
    .filter(t => parseMethod(t.payment_method ?? '').label === 'SumUp (CB)')
    .reduce((s, t) => s + (t.total_amount ?? 0), 0);
  const cbFormation = demoNonCancelled
    .filter(t => parseMethod(t.payment_method ?? '').label === 'SumUp (CB)')
    .reduce((s, t) => s + (t.total_amount ?? 0), 0);
  const cbTotal = cbReal + cbFormation;
  const cashTotal = allNonCancelled
    .filter(t => parseMethod(t.payment_method ?? '').label === 'Espèces')
    .reduce((s, t) => s + (t.total_amount ?? 0), 0);
  const demoCount = demoNonCancelled.length;

  const PERIOD_OPTS: { id: PeriodFilter; label: string }[] = [
    { id: 'today', label: "Aujourd'hui" },
    { id: 'week', label: '7 jours' },
    { id: 'month', label: 'Ce mois' },
    { id: 'year', label: 'Cette année' },
    { id: 'custom', label: 'Personnalisé' },
  ];

  const uniqueMethods = [...new Set(tickets.map(t => t.payment_method).filter(Boolean))];

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Historique de caisse</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Journal complet de toutes les transactions</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/cloture-caisse"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-600 hover:opacity-90 transition-opacity"
            >
              <Icon name="DocumentChartBarIcon" size={16} />
              Synthèse journée
            </a>
            <button
              onClick={loadTickets}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-500 text-muted-foreground hover:bg-muted transition-colors"
            >
              <Icon name="ArrowPathIcon" size={16} />
              Actualiser
            </button>
          </div>
        </div>

        {/* Channel tab switcher */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl w-fit mb-5">
          <button
            onClick={() => setPageTab('caisse')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-600 transition-all ${pageTab === 'caisse' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Icon name="ComputerDesktopIcon" size={15} />
            Caisse
          </button>
          <button
            onClick={() => setPageTab('shopify')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-600 transition-all ${pageTab === 'shopify' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Icon name="GlobeAltIcon" size={15} />
            Shopify
          </button>
        </div>

        {/* Shopify orders view */}
        {pageTab === 'shopify' && (
          <div className="space-y-4">
            {/* Stats summary for selected period */}
            {!shopifyLoading && shopifyConnected !== false && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
                  <p className="text-xs text-teal-700 font-600 mb-1">🛍️ CA Shopify</p>
                  <p className="text-xl font-700 tabular-nums text-teal-900">{fmt(shopifyCA)} €</p>
                </div>
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
                  <p className="text-xs text-teal-700 font-600 mb-1">Commandes</p>
                  <p className="text-xl font-700 tabular-nums text-teal-900">{shopifyOrdersCount}</p>
                  <p className="text-[11px] text-teal-600 mt-0.5">payées sur la période</p>
                </div>
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
                  <p className="text-xs text-teal-700 font-600 mb-1">Panier moyen</p>
                  <p className="text-xl font-700 tabular-nums text-teal-900">
                    {shopifyOrdersCount > 0 ? fmt(shopifyCA / shopifyOrdersCount) : '0.00'} €
                  </p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <p className="text-xs text-emerald-700 font-600 mb-1">TOTAL (Caisse + Shopify)</p>
                  <p className="text-xl font-700 tabular-nums text-emerald-900">{fmt(totalCA + shopifyCA)} €</p>
                  <p className="text-[11px] text-emerald-600 mt-0.5">🏪 {fmt(totalCA)} € + 🛍️ {fmt(shopifyCA)} €</p>
                </div>
              </div>
            )}

            {shopifyLoading ? (
              <div className="flex items-center justify-center py-20">
                <Icon name="ArrowPathIcon" size={28} className="animate-spin text-primary" />
              </div>
            ) : shopifyConnected === false ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-8 text-center">
                <Icon name="LinkSlashIcon" size={32} className="text-amber-500 mx-auto mb-3" />
                <p className="font-600 text-amber-800">Shopify non connecté</p>
                <p className="text-sm text-amber-700 mt-1">Configurez l'intégration Shopify dans les paramètres pour afficher les commandes.</p>
              </div>
            ) : (
              <div className="bg-white border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Icon name="GlobeAltIcon" size={16} className="text-teal-600" />
                    <h3 className="text-sm font-600 text-foreground">Commandes Shopify récentes</h3>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{shopifyOrders.length} commandes</span>
                  </div>
                  <button
                    onClick={() => exportShopifyToColishipCSV(shopifyOrders)}
                    disabled={shopifyOrders.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded-lg disabled:opacity-40 transition-colors"
                  >
                    📥 Coliship CSV
                  </button>
                  <button onClick={loadShopifyOrders} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                    <Icon name="ArrowPathIcon" size={15} />
                  </button>
                </div>
                {shopifyOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Icon name="ShoppingBagIcon" size={32} className="mb-2 opacity-30" />
                    <p className="text-sm">Aucune commande Shopify récente</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-5 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Commande</th>
                          <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Client</th>
                          <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Statut</th>
                          <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Total</th>
                          <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Articles</th>
                          <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Date</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {shopifyOrders.map((order: any) => {
                          const customer = order.customer;
                          const clientName = customer
                            ? `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || customer.email
                            : order.shipping_address?.name || '—';
                          const finStatus = order.financial_status ?? '';
                          const fulStatus = order.fulfillment_status ?? 'unfulfilled';
                          const statusColor = finStatus === 'paid' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : finStatus === 'refunded' ? 'text-red-700 bg-red-50 border-red-200' : 'text-amber-700 bg-amber-50 border-amber-200';
                          const statusLabel = finStatus === 'paid' ? 'Payé' : finStatus === 'refunded' ? 'Remboursé' : finStatus === 'pending' ? 'En attente' : finStatus;
                          return (
                            <tr key={order.id} className="hover:bg-muted/20 transition-colors">
                              <td className="px-5 py-3">
                                <span className="font-600 text-foreground">{order.name}</span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">{clientName}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center text-xs font-500 px-2 py-0.5 rounded-full border ${statusColor}`}>
                                  {statusLabel}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-600 tabular-nums">
                                {parseFloat(order.total_price ?? '0').toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {(order.line_items ?? []).slice(0, 2).map((li: any) => li.title).join(', ')}{(order.line_items ?? []).length > 2 ? ` +${order.line_items.length - 2}` : ''}
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(order.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-4 py-3">
                                {order.shipping_address && (
                                  <button
                                    onClick={() => { openColiship(); setColissimoModalData(shopifyOrderToColissimoData(order)); }}
                                    className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 px-3 py-2 rounded-lg font-bold text-sm transition-colors whitespace-nowrap"
                                  >
                                    📦 Créer étiquette
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {pageTab === 'caisse' && <>

        {/* Period filter */}
        <div className="bg-white border border-border rounded-xl p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
              {PERIOD_OPTS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setPeriod(p.id); setPage(0); }}
                  className={`px-3 py-1.5 rounded-md text-sm font-500 transition-all ${
                    period === p.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {period === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-muted-foreground text-sm">→</span>
                <input
                  type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            )}
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            {
              label: returnsTotal > 0 ? 'CA brut encaissé' : 'CA encaissé',
              value: shopifyCA > 0 ? `${fmt(totalCA + shopifyCA)} €` : `${fmt(totalCA)} €`,
              sub: shopifyCA > 0 ? `dont Shopify : ${fmt(shopifyCA)} €` : undefined,
              icon: 'BanknotesIcon',
              color: 'text-emerald-600 bg-emerald-50',
            },
            { label: 'Tickets validés', value: String(totalTickets), icon: 'ReceiptRefundIcon', color: 'text-blue-600 bg-blue-50' },
            { label: 'Panier moyen', value: `${fmt(avgBasket)} €`, icon: 'CalculatorIcon', color: 'text-indigo-600 bg-indigo-50' },
            { label: 'Annulés', value: String(cancelledCount), icon: 'XCircleIcon', color: 'text-red-600 bg-red-50' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${kpi.color}`}>
                <Icon name={kpi.icon as any} size={20} />
              </div>
              <div>
                <p className="text-lg font-700 text-foreground">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                {'sub' in kpi && kpi.sub && <p className="text-[11px] text-teal-600 font-500 mt-0.5">{kpi.sub}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* Payment breakdown — reconciliation with SumUp/bank */}
        <div className="bg-white border border-border rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-700 text-muted-foreground uppercase tracking-wide">Bilan par mode de paiement — rapprochement bancaire</p>
            {demoCount > 0 && (
              <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-600">
                {demoCount} ticket(s) démo inclus (nécessaire pour rapprochement terminal)
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {/* CB block — split real vs formation */}
            <div className="flex-1 min-w-[200px] bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
              <p className="text-xs text-blue-700 font-600">💳 SumUp (CB) — total terminal : <span className="font-700">{fmt(cbTotal)} €</span></p>
              <div className="flex gap-2">
                <div className="flex-1 bg-blue-100 rounded-lg px-2 py-1.5">
                  <p className="text-[10px] text-blue-700 font-600">Clients réels</p>
                  <p className="text-base font-700 tabular-nums text-blue-900">{fmt(cbReal)} €</p>
                </div>
                {cbFormation > 0 && (
                  <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                    <p className="text-[10px] text-amber-700 font-600">🎓 Formation</p>
                    <p className="text-base font-700 tabular-nums text-amber-800">{fmt(cbFormation)} €</p>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-blue-600">Total = à comparer avec relevé SumUp</p>
            </div>
            <div className="flex-1 min-w-[140px] bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs text-emerald-700 font-600 mb-1">💵 Espèces</p>
              <p className="text-xl font-700 tabular-nums text-emerald-900">{fmt(cashTotal)} €</p>
            </div>
            {Object.entries(payBreakdown)
              .filter(([k]) => k !== 'SumUp (CB)' && k !== 'Espèces')
              .map(([method, total]) => (
                <div key={method} className="flex-1 min-w-[140px] bg-muted/40 border border-border rounded-xl p-3">
                  <p className="text-xs text-muted-foreground font-600 mb-1">{method}</p>
                  <p className="text-xl font-700 tabular-nums text-foreground">{fmt(total)} €</p>
                </div>
              ))
            }
          </div>
          {cbFormation > 0 && (
            <p className="text-[11px] text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              {demoCount} ticket(s) de formation encaissé(s) sur SumUp ({fmt(cbFormation)} € CB). Ces montants apparaissent sur votre relevé SumUp mais ne font pas partie du CA réel.
            </p>
          )}
        </div>

        {/* Returns/Avoirs deduction strip */}
        {returnsTotal > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Icon name="ArrowUturnLeftIcon" size={16} className="text-rose-600" />
              <span className="text-sm font-600 text-rose-700">
                {returnsCount} retour{returnsCount > 1 ? 's' : ''} / avoir{returnsCount > 1 ? 's' : ''} sur la période
              </span>
            </div>
            <div className="flex items-center gap-6 ml-auto text-sm">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">CA brut</p>
                <p className="font-700 text-foreground tabular-nums">{fmt(totalCA)} €</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-rose-600">Avoirs émis</p>
                <p className="font-700 text-rose-700 tabular-nums">-{fmt(returnsTotal)} €</p>
              </div>
              <div className="text-right border-l border-rose-200 pl-6">
                <p className="text-xs text-emerald-700 font-600">CA net</p>
                <p className="text-lg font-700 text-emerald-700 tabular-nums">{fmt(Math.max(0, totalCA - returnsTotal))} €</p>
              </div>
            </div>
          </div>
        )}

        {/* Filters row */}
        <div className="bg-white border border-border rounded-xl p-4 mb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="Rechercher ticket, client, caissier..."
              className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <select
            value={filterMethod}
            onChange={e => { setFilterMethod(e.target.value); setPage(0); }}
            className="border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          >
            <option value="all">Tous les modes</option>
            {uniqueMethods.map(m => (
              <option key={m} value={m}>{METHOD_LABELS[m] ?? m}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(0); }}
            className="border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          >
            <option value="all">Tous les statuts</option>
            <option value="completed">Validés</option>
            <option value="cancelled">Annulés</option>
          </select>
          <select
            value={filterType}
            onChange={e => { setFilterType(e.target.value as 'all' | 'real' | 'demo'); setPage(0); }}
            className="border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          >
            <option value="real">Réelles</option>
            <option value="all">Toutes</option>
            <option value="demo">🎓 Formation</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Icon name="ArrowPathIcon" size={28} className="animate-spin text-primary" />
            </div>
          ) : apiError ? (
            <div className="p-8">
              <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-xl p-6">
                <div className="flex items-start gap-3 mb-4">
                  <Icon name="ExclamationTriangleIcon" size={22} className="text-red-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-600 text-red-700 text-sm">Erreur de chargement des transactions</p>
                    <p className="text-red-600 text-sm mt-1 font-mono break-all">{apiError}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={loadTickets}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-600 hover:bg-red-700 transition-colors"
                  >
                    <Icon name="ArrowPathIcon" size={13} />
                    Réessayer
                  </button>
                  <button
                    onClick={runDiagnose}
                    disabled={diagnosing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-xs font-500 hover:bg-red-100 transition-colors disabled:opacity-60"
                  >
                    {diagnosing ? <Icon name="ArrowPathIcon" size={13} className="animate-spin" /> : <Icon name="WrenchScrewdriverIcon" size={13} />}
                    {diagnosing ? 'Diagnostic…' : 'Diagnostic'}
                  </button>
                  {setupSql && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(setupSql); toast.success('SQL copié — collez-le dans Supabase SQL Editor'); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 text-xs font-500 hover:bg-amber-50 transition-colors"
                    >
                      <Icon name="ClipboardDocumentIcon" size={13} />
                      Copier le SQL de réparation
                    </button>
                  )}
                </div>
                {setupSql && (
                  <details className="mt-4">
                    <summary className="text-xs text-red-600 cursor-pointer hover:text-red-800 font-500">Voir le SQL de réparation</summary>
                    <pre className="mt-2 p-3 bg-white border border-red-200 rounded-lg text-xs overflow-auto max-h-64 text-slate-700 whitespace-pre-wrap">{setupSql}</pre>
                  </details>
                )}
                <p className="text-xs text-red-500 mt-3">
                  Vérifiez le terminal Next.js pour les détails complets de l'erreur.
                  <br />
                  Si le SQL est affiché ci-dessus, collez-le dans <strong>Supabase Studio → SQL Editor</strong> et relancez.
                </p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Icon name="ReceiptRefundIcon" size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-base font-500">Aucune transaction trouvée</p>
              <p className="text-sm mt-1">Modifiez vos filtres ou la période</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">N° Ticket</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">Date & Heure</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">Caissier</th>
                    <th className="text-center px-4 py-3 text-xs font-600 text-muted-foreground">Articles</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">Mode paiement</th>
                    <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground">Remise</th>
                    <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground">Total TTC</th>
                    <th className="text-center px-4 py-3 text-xs font-600 text-muted-foreground">Statut</th>
                    <th className="text-center px-4 py-3 text-xs font-600 text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayTickets.map(ticket => {
                    const { label: methodLabel, color: methodColor, detail: methodDetail } = parseMethod(ticket.payment_method ?? '');
                    const isCancelled = ticket.status === 'cancelled';
                    return (
                      <tr
                        key={ticket.id}
                        className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer ${isCancelled ? 'opacity-60' : ''}`}
                        onClick={() => setSelectedTicket(ticket)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-primary font-600">
                          {ticket.ticket_number}
                          {ticket.is_demo && <span className="ml-1 text-[10px] font-700 text-amber-700 bg-amber-100 px-1 py-0.5 rounded">🎓</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(ticket.created_at)}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{ticket.client_name ?? <span className="text-muted-foreground italic">Anonyme</span>}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{ticket.cashier_name ?? '—'}</td>
                        <td className="px-4 py-3 text-center text-xs text-muted-foreground">{ticket.items_count ?? 0}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center text-xs font-500 px-2 py-0.5 rounded-full border ${methodColor}`}>
                            {methodLabel}
                          </span>
                          {methodDetail && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">{methodDetail}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-amber-600">
                          {ticket.discount_amount && ticket.discount_amount > 0 ? `-${fmt(ticket.discount_amount)} €` : '—'}
                        </td>
                        <td className={`px-4 py-3 text-right font-700 tabular-nums ${isCancelled ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {fmt(ticket.total_amount ?? 0)} €
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isCancelled ? (
                            <span className="inline-flex items-center gap-1 text-xs font-500 text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                              <Icon name="XCircleIcon" size={11} />Annulé
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-500 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <Icon name="CheckCircleIcon" size={11} />Validé
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedTicket(ticket)}
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
                            title="Voir le détail"
                          >
                            <Icon name="EyeIcon" size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
              <span className="text-xs text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min(filtered.length, (page + 1) * PAGE_SIZE)} sur {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Icon name="ChevronLeftIcon" size={14} />
                </button>
                <span className="text-xs text-muted-foreground px-2">Page {page + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Icon name="ChevronRightIcon" size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
        </> /* end pageTab === 'caisse' */}
      </div>

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <TicketDetailModal
          ticketId={selectedTicket.id}
          fallbackTicket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onModified={loadTickets}
        />
      )}

      {colissimoModalData && (
        <ColissimoInfoModal
          data={colissimoModalData}
          onClose={() => setColissimoModalData(null)}
        />
      )}
    </AppLayout>
  );
}
