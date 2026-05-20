'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { reservationService, type Reservation, type ReservationPaymentMethod, type RecordBalanceInput } from '@/lib/services/reservationService';

interface DepositModalProps {
  reservation: Reservation;
  onClose: () => void;
  onSaved: (updated: Reservation) => void;
}

const PAYMENT_LABELS: Record<ReservationPaymentMethod, string> = {
  cash: 'Espèces',
  card: 'Carte bancaire',
  transfer: 'Virement',
  cheque: 'Chèque',
};

export default function DepositModal({ reservation, onClose, onSaved }: DepositModalProps) {
  // Determine if this is a balance payment (deposit already paid)
  const isBalancePayment = reservation.reservationStatus === 'deposit_paid' || reservation.reservationStatus === 'ready';
  const defaultAmount = isBalancePayment
    ? reservation.balanceDue.toFixed(2)
    : reservation.depositAmount.toFixed(2);

  const [amount, setAmount] = useState(defaultAmount);
  const [method, setMethod] = useState<ReservationPaymentMethod>('card');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const paid = parseFloat(amount);
    if (isNaN(paid) || paid <= 0) { setError('Montant invalide.'); return; }
    if (paid > reservation.totalAmount) { setError('Le montant dépasse le total de la réservation.'); return; }
    setSaving(true);
    setError(null);

    let updated: Reservation | null = null;

    if (isBalancePayment) {
      // Record balance payment — only this amount is added to today's revenue
      const input: RecordBalanceInput = { balancePaid: paid, balancePaymentMethod: method };
      updated = await reservationService.recordBalance(reservation.id, input);
    } else {
      // Record deposit payment — only this amount is added to today's revenue
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

          <div>
            <label className="block text-xs font-500 text-foreground mb-1">
              {isBalancePayment ? 'Montant du solde à encaisser (€)' : 'Montant de l\'acompte (€)'}
              <span className="text-destructive"> *</span>
            </label>
            <input
              type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="block text-xs font-500 text-foreground mb-1">Mode de paiement</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PAYMENT_LABELS) as ReservationPaymentMethod[]).map((m) => (
                <button
                  key={m} type="button"
                  onClick={() => setMethod(m)}
                  className={`px-3 py-2 rounded-lg text-sm font-500 border transition-colors ${method === m ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                >
                  {PAYMENT_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

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
