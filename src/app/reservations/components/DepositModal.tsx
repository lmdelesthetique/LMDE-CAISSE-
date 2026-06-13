'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { reservationService, type Reservation, type ReservationPaymentMethod, type RecordBalanceInput } from '@/lib/services/reservationService';

interface DepositModalProps {
  reservation: Reservation;
  onClose: () => void;
  onSaved: (updated: Reservation) => void;
}

const PAYMENT_METHODS: { id: ReservationPaymentMethod; label: string; sub?: string; color?: string }[] = [
  { id: 'cash',     label: 'Espèces' },
  { id: 'card',     label: 'Carte bancaire' },
  { id: 'transfer', label: 'Virement' },
  { id: 'cheque',   label: 'Chèque' },
  { id: 'alma',     label: 'Alma — Paiement 4x', sub: 'Sans frais', color: 'border-orange-400 bg-orange-50 text-orange-700' },
];

export default function DepositModal({ reservation, onClose, onSaved }: DepositModalProps) {
  const isBalancePayment = reservation.reservationStatus === 'deposit_paid' || reservation.reservationStatus === 'ready';
  const defaultAmount = isBalancePayment
    ? reservation.balanceDue.toFixed(2)
    : reservation.depositAmount.toFixed(2);

  const [amount, setAmount] = useState(defaultAmount);
  const [method, setMethod] = useState<ReservationPaymentMethod>('card');
  const [almaInstallments, setAlmaInstallments] = useState<3 | 4>(4);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paid = parseFloat(amount) || 0;
  const almaFirst = paid > 0 ? (paid / almaInstallments).toFixed(2) : '—';
  const almaFee = paid > 0 ? (paid * 0.0146 * almaInstallments).toFixed(2) : '—';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(paid) || paid <= 0) { setError('Montant invalide.'); return; }
    if (paid > reservation.totalAmount) { setError('Le montant dépasse le total de la réservation.'); return; }
    setSaving(true);
    setError(null);

    let updated: Reservation | null = null;
    if (isBalancePayment) {
      const input: RecordBalanceInput = { balancePaid: paid, balancePaymentMethod: method };
      updated = await reservationService.recordBalance(reservation.id, input);
    } else {
      updated = await reservationService.recordDeposit(reservation.id, { depositPaid: paid, depositPaymentMethod: method });
    }

    setSaving(false);
    if (!updated) { setError('Erreur lors de l\'enregistrement. Veuillez réessayer.'); return; }
    onSaved(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Icon name="BanknotesIcon" size={20} className="text-primary" />
            <h2 className="text-base font-600 text-foreground">
              {isBalancePayment ? 'Encaisser le solde' : 'Enregistrer un acompte'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Reservation summary */}
          <div className="bg-secondary rounded-lg px-4 py-3 text-sm space-y-1">
            <p className="text-muted-foreground">Réservation <span className="font-600 text-foreground">{reservation.reservationNumber}</span></p>
            <p className="text-muted-foreground">Client: <span className="font-500 text-foreground">{reservation.clientName}</span></p>
            <div className="border-t border-border mt-2 pt-2 space-y-0.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total commande</span>
                <span className="font-600 text-foreground">{reservation.totalAmount.toFixed(2)} €</span>
              </div>
              {reservation.depositPaid > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Acompte déjà encaissé</span>
                  <span className="font-600 text-emerald-600">- {reservation.depositPaid.toFixed(2)} €</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-600">
                <span className="text-muted-foreground">Solde restant</span>
                <span className="text-red-600">{reservation.balanceDue.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          {isBalancePayment && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
              <Icon name="InformationCircleIcon" size={14} className="shrink-0 mt-0.5" />
              <p>Seul le montant encaissé aujourd'hui sera comptabilisé dans le chiffre d'affaires du jour. L'acompte précédent ({reservation.depositPaid.toFixed(2)} €) a déjà été comptabilisé le jour de la réservation.</p>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-xs font-500 text-foreground mb-1">
              {isBalancePayment ? 'Montant du solde à encaisser (€)' : 'Montant de l\'acompte (€)'}
              <span className="text-destructive"> *</span>
            </label>
            <input
              type="number" min="0.01" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Payment methods */}
          <div>
            <label className="block text-xs font-500 text-foreground mb-2">Mode de paiement</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.filter(m => m.id !== 'alma').map((m) => (
                <button
                  key={m.id} type="button"
                  onClick={() => setMethod(m.id)}
                  className={`px-3 py-2 rounded-lg text-sm font-500 border transition-colors ${method === m.id ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Alma button — full width, distinct style */}
            <button
              type="button"
              onClick={() => setMethod('alma')}
              className={`mt-2 w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all font-600 text-sm ${
                method === 'alma'
                  ? 'border-orange-400 bg-orange-50 text-orange-700'
                  : 'border-dashed border-orange-300 text-orange-600 hover:bg-orange-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">💳</span>
                <div className="text-left">
                  <p className="font-700">Alma — Paiement en plusieurs fois</p>
                  <p className="text-xs font-400 opacity-70">3x ou 4x sans frais client</p>
                </div>
              </div>
              {method === 'alma' && <Icon name="CheckCircleIcon" size={18} className="text-orange-500 shrink-0" />}
            </button>
          </div>

          {/* Alma breakdown */}
          {method === 'alma' && paid > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-700 text-orange-800 uppercase tracking-wider">Détail Alma</p>

              <div className="flex gap-2">
                {([3, 4] as const).map((n) => (
                  <button
                    key={n} type="button"
                    onClick={() => setAlmaInstallments(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-700 border-2 transition-all ${almaInstallments === n ? 'border-orange-500 bg-orange-500 text-white' : 'border-orange-300 text-orange-700 hover:bg-orange-100'}`}
                  >
                    {n}x
                  </button>
                ))}
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-orange-700">1ère échéance aujourd'hui</span>
                  <span className="font-700 text-orange-900">{almaFirst} €</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-orange-700">Total {almaInstallments} fois</span>
                  <span className="font-600 text-orange-900">{paid.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-orange-600">Frais Alma (boutique ~{(1.46 * almaInstallments).toFixed(1)}%)</span>
                  <span className="text-orange-700">≈ {almaFee} €</span>
                </div>
              </div>

              <p className="text-[11px] text-orange-600">
                Votre client sera débité de <strong>{almaFirst} €</strong> maintenant, puis {almaInstallments - 1}x {almaFirst} € les prochains mois.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              <Icon name="ExclamationCircleIcon" size={16} />
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-500 text-muted-foreground hover:text-foreground transition-colors">
              Annuler
            </button>
            <button
              type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-500 rounded-lg hover:bg-accent transition-colors disabled:opacity-60"
            >
              {saving ? <Icon name="ArrowPathIcon" size={15} className="animate-spin" /> : <Icon name="CheckIcon" size={15} />}
              {saving ? 'Enregistrement...' : isBalancePayment ? 'Encaisser le solde' : 'Valider l\'acompte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
