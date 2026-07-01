'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { type Reservation, type ReservationPaymentMethod, type DepositEntry } from '@/lib/services/reservationService';

interface DepositModalProps {
  reservation: Reservation;
  onClose: () => void;
  onSaved: (updated: Reservation) => void;
}

const PAYMENT_METHODS: { id: ReservationPaymentMethod; label: string }[] = [
  { id: 'cash',     label: 'Espèces' },
  { id: 'card',     label: 'Carte bancaire' },
  { id: 'transfer', label: 'Virement' },
  { id: 'cheque',   label: 'Chèque' },
];

const METHOD_LABELS: Record<string, string> = {
  cash: 'Espèces', card: 'Carte bancaire', transfer: 'Virement',
  cheque: 'Chèque', alma: 'Alma',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DepositModal({ reservation, onClose, onSaved }: DepositModalProps) {
  const balanceDue = reservation.balanceDue;
  const isFinalPayment = balanceDue <= 0.01;

  const [amount, setAmount] = useState(balanceDue > 0 ? balanceDue.toFixed(2) : '');
  const [method, setMethod] = useState<ReservationPaymentMethod>('card');
  const [almaInstallments, setAlmaInstallments] = useState<3 | 4>(4);
  const [almaMode, setAlmaMode] = useState(false);
  const [isBalance, setIsBalance] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paid = parseFloat(amount) || 0;
  const almaFirst = paid > 0 ? (paid / almaInstallments).toFixed(2) : '—';
  const almaFee = paid > 0 ? (paid * 0.0146 * almaInstallments).toFixed(2) : '—';

  const deposits: DepositEntry[] = reservation.deposits ?? [];
  const hasDeposits = deposits.length > 0;

  const effectiveMethod: ReservationPaymentMethod = almaMode ? 'alma' : method;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(paid) || paid <= 0) { setError('Montant invalide.'); return; }
    if (paid > reservation.totalAmount + 0.01) { setError('Le montant dépasse le total de la réservation.'); return; }

    setSaving(true);
    setError(null);

    try {
      const endpoint = isBalance
        ? `/api/reservations/${reservation.id}/record-balance`
        : `/api/reservations/${reservation.id}/add-deposit`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: paid, method: effectiveMethod }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de l\'enregistrement.');
        setSaving(false);
        return;
      }

      // Map raw DB row to Reservation shape via a lightweight mapper
      const mapped: Reservation = {
        id: data.id,
        reservationNumber: data.reservation_number,
        clientId: data.client_id,
        clientName: data.client_name,
        clientPhone: data.client_phone,
        clientEmail: data.client_email,
        items: Array.isArray(data.items) ? data.items : [],
        totalAmount: parseFloat(data.total_amount ?? 0),
        depositAmount: parseFloat(data.deposit_amount ?? 0),
        depositPaid: parseFloat(data.deposit_paid ?? 0),
        deposits: Array.isArray(data.deposits) ? data.deposits : [],
        balanceDue: Math.max(
          parseFloat(data.total_amount ?? 0) - parseFloat(data.deposit_paid ?? 0) - parseFloat(data.balance_paid ?? 0),
          0
        ),
        balancePaid: parseFloat(data.balance_paid ?? 0),
        balancePaidAt: data.balance_paid_at ?? null,
        balancePaymentMethod: data.balance_payment_method ?? null,
        depositAccountingDate: data.deposit_accounting_date ?? null,
        balanceAccountingDate: data.balance_accounting_date ?? null,
        depositPercent: data.deposit_percent ?? null,
        reservationStatus: data.reservation_status,
        reservationType: data.reservation_type ?? null,
        recoveryMode: data.recovery_mode ?? 'sur_place',
        depositPaymentMethod: data.deposit_payment_method,
        depositPaidAt: data.deposit_paid_at,
        readyAt: data.ready_at,
        completedAt: data.completed_at,
        cancelledAt: data.cancelled_at,
        cancellationReason: data.cancellation_reason,
        notes: data.notes,
        sellerComment: data.seller_comment ?? null,
        clientComment: data.client_comment ?? null,
        pickupDate: data.pickup_date,
        estimatedArrivalDate: data.estimated_arrival_date ?? null,
        deliveryAddress: data.delivery_address ?? null,
        deliveryPhone: data.delivery_phone ?? null,
        deliveryContact: data.delivery_contact ?? null,
        deliveryNotes: data.delivery_notes ?? null,
        cashierName: data.cashier_name,
        posSaleId: data.pos_sale_id ?? null,
        remiseType: data.remise_type ?? null,
        remiseValeur: data.remise_valeur != null ? parseFloat(data.remise_valeur) : null,
        remiseMontant: data.remise_montant != null ? parseFloat(data.remise_montant) : null,
        remiseMotif: data.remise_motif ?? null,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      onSaved(mapped);
    } catch {
      setError('Erreur réseau. Veuillez réessayer.');
      setSaving(false);
    }
  };

  if (isFinalPayment) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Icon name="CheckCircleIcon" size={20} className="text-emerald-600" />
              <h2 className="text-base font-600 text-foreground">Réservation soldée</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
              <Icon name="XMarkIcon" size={18} />
            </button>
          </div>
          <div className="px-6 py-8 text-center">
            <p className="text-2xl mb-2">✅</p>
            <p className="font-600 text-foreground">Cette réservation est entièrement payée.</p>
            <p className="text-sm text-muted-foreground mt-1">Solde restant: 0.00 €</p>
            <button onClick={onClose} className="mt-4 px-5 py-2 bg-primary text-primary-foreground text-sm font-500 rounded-lg">
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <Icon name="BanknotesIcon" size={20} className="text-primary" />
            <h2 className="text-base font-600 text-foreground">Paiements — {reservation.reservationNumber}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Summary */}
          <div className="bg-secondary rounded-lg px-4 py-3 text-sm space-y-1">
            <p className="text-muted-foreground">Client: <span className="font-600 text-foreground">{reservation.clientName}</span></p>
            <div className="border-t border-border mt-2 pt-2 space-y-0.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total commande</span>
                <span className="font-600 text-foreground">{reservation.totalAmount.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total versé</span>
                <span className="font-600 text-emerald-600">- {reservation.depositPaid.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-xs font-700">
                <span className="text-muted-foreground">Solde restant</span>
                <span className="text-red-600">{balanceDue.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          {/* Deposit history */}
          {hasDeposits && (
            <div className="space-y-2">
              <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Historique des paiements</p>
              <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                {deposits.map((d) => (
                  <div key={d.id} className={`flex items-center justify-between px-3 py-2 text-sm ${d.is_balance ? 'bg-emerald-50' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-base">{d.is_balance ? '🏁' : '💳'}</span>
                      <div>
                        <p className="font-500 text-foreground">
                          {d.is_balance ? 'Solde final' : 'Acompte'} — {METHOD_LABELS[d.method] ?? d.method}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDate(d.paid_at)}</p>
                      </div>
                    </div>
                    <span className="font-700 text-emerald-600">{Number(d.amount).toFixed(2)} €</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New payment form */}
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Ajouter un paiement</p>

            {/* Amount */}
            <div>
              <label className="block text-xs font-500 text-foreground mb-1">
                Montant (€) <span className="text-destructive">*</span>
              </label>
              <input
                type="number" min="0.01" step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() => setAmount(balanceDue.toFixed(2))}
                  className="text-xs text-primary hover:underline"
                >
                  Tout le solde ({balanceDue.toFixed(2)} €)
                </button>
              </div>
            </div>

            {/* Payment methods */}
            <div>
              <label className="block text-xs font-500 text-foreground mb-2">Mode de paiement</label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.id} type="button"
                    onClick={() => { setMethod(m.id); setAlmaMode(false); }}
                    className={`px-3 py-2 rounded-lg text-sm font-500 border transition-colors ${!almaMode && method === m.id ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setAlmaMode((v) => !v)}
                className={`mt-2 w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all font-600 text-sm ${
                  almaMode ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-dashed border-orange-300 text-orange-600 hover:bg-orange-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">💳</span>
                  <div className="text-left">
                    <p className="font-700">Alma — Paiement en plusieurs fois</p>
                    <p className="text-xs font-400 opacity-70">3x ou 4x sans frais client</p>
                  </div>
                </div>
                {almaMode && <Icon name="CheckCircleIcon" size={18} className="text-orange-500 shrink-0" />}
              </button>
            </div>

            {/* Alma breakdown */}
            {almaMode && paid > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-700 text-orange-800 uppercase tracking-wider">Détail Alma</p>
                <div className="flex gap-2">
                  {([3, 4] as const).map((n) => (
                    <button key={n} type="button" onClick={() => setAlmaInstallments(n)}
                      className={`flex-1 py-2 rounded-lg text-sm font-700 border-2 transition-all ${almaInstallments === n ? 'border-orange-500 bg-orange-500 text-white' : 'border-orange-300 text-orange-700 hover:bg-orange-100'}`}>
                      {n}x
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-orange-700">1ère échéance</span>
                    <span className="font-700 text-orange-900">{almaFirst} €</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-orange-600">Frais Alma (~{(1.46 * almaInstallments).toFixed(1)}%)</span>
                    <span className="text-orange-700">≈ {almaFee} €</span>
                  </div>
                </div>
              </div>
            )}

            {/* Balance toggle */}
            {paid > 0 && Math.abs(paid - balanceDue) < 0.01 && (
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isBalance}
                  onChange={(e) => setIsBalance(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-emerald-600 focus:ring-emerald-400"
                />
                <span className="text-sm text-foreground font-500">
                  Marquer comme solde final — clôturer la réservation ✅
                </span>
              </label>
            )}

            {isBalance && (
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
                <Icon name="InformationCircleIcon" size={14} className="shrink-0 mt-0.5" />
                <p>Le solde sera comptabilisé aujourd'hui dans le CA du jour. Les acomptes précédents ({reservation.depositPaid.toFixed(2)} €) ont déjà été comptabilisés à leurs dates respectives.</p>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                <Icon name="ExclamationCircleIcon" size={16} />
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-500 text-muted-foreground hover:text-foreground">
                Annuler
              </button>
              <button
                type="submit" disabled={saving || paid <= 0}
                className={`flex items-center gap-2 px-5 py-2 text-sm font-500 rounded-lg transition-colors disabled:opacity-60 ${
                  isBalance
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-primary text-primary-foreground hover:bg-accent'
                }`}
              >
                {saving ? <Icon name="ArrowPathIcon" size={15} className="animate-spin" /> : <Icon name="CheckIcon" size={15} />}
                {saving ? 'Enregistrement...' : isBalance ? 'Encaisser le solde final' : 'Enregistrer l\'acompte'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
