'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { POSClient, CartItem } from './POSTerminal';
import {
  reservationService,
  type ReservationType,
  type RecoveryMode,
  RESERVATION_TYPE_CONFIG,
  RECOVERY_MODE_CONFIG,
} from '@/lib/services/reservationService';
import { toast } from 'sonner';

type PaymentMode = 'immediate' | 'acompte' | 'installment';
type PaymentMethod = 'SumUp (CB)' | 'Espèces' | 'Virement' | 'Mixte' | 'Alma (3x/4x)';

interface PaymentModalProps {
  mode: PaymentMode;
  totalTTC: number;
  client: POSClient | null;
  cartItems: CartItem[];
  onClose: () => void;
  onConfirm: (method: string) => void;
}

const DEPOSIT_PRESETS = [
  { label: '30%', value: 30 },
  { label: '50%', value: 50 },
  { label: '70%', value: 70 },
];

const RESERVATION_TYPES = Object.entries(RESERVATION_TYPE_CONFIG) as [ReservationType, any][];
const RECOVERY_MODES = Object.entries(RECOVERY_MODE_CONFIG) as [RecoveryMode, any][];

export default function PaymentModal({ mode, totalTTC, client, cartItems, onClose, onConfirm }: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('SumUp (CB)');
  const [cashGiven, setCashGiven] = useState('');
  const [depositPercent, setDepositPercent] = useState<number | null>(null);
  const [depositCustom, setDepositCustom] = useState('');
  const [almaInstallments, setAlmaInstallments] = useState<2 | 3 | 4>(3);
  const [cbAmount, setCbAmount] = useState('');
  const [dossierFee, setDossierFee] = useState('');
  const [cashMixGiven, setCashMixGiven] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendReceipt, setSendReceipt] = useState<'none' | 'email' | 'whatsapp'>('none');
  const [reservationType, setReservationType] = useState<ReservationType | null>(null);
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode>('sur_place');

  const cashGivenNum = parseFloat(cashGiven) || 0;
  const changeAmount = Math.max(0, cashGivenNum - totalTTC);
  const cbAmountNum = parseFloat(cbAmount) || 0;
  const cashRemainder = totalTTC - cbAmountNum;
  const cashMixGivenNum = parseFloat(cashMixGiven) || 0;
  const mixChange = cashMixGivenNum - Math.max(0, cashRemainder);

  // Deposit calculation
  const depositNum = depositPercent !== null
    ? Math.round((totalTTC * depositPercent) / 100 * 100) / 100
    : parseFloat(depositCustom) || 0;
  const remaining = Math.max(0, totalTTC - depositNum);
  const depositPct = totalTTC > 0 ? Math.round((depositNum / totalTTC) * 100) : 0;

  const handleConfirm = async () => {
    setLoading(true);

    // If acompte mode — auto-create reservation
    if (mode === 'acompte' && depositNum > 0) {
      try {
        const items = cartItems.map((ci) => ({
          name: ci.name,
          qty: ci.qty,
          price: ci.price,
          sku: ci.sku || undefined,
          productId: ci.productId,
          imageUrl: (ci as any).imageUrl || undefined,
        }));

        const methodMap: Record<PaymentMethod, 'cash' | 'card' | 'transfer'> = {
          'SumUp (CB)': 'card',
          'Espèces': 'cash',
          'Virement': 'transfer',
          'Mixte': 'card',
          'Alma (3x/4x)': 'card',
        };

        const reservation = await reservationService.createFromPOS({
          clientName: client?.name || 'Client anonyme',
          clientPhone: client?.phone || undefined,
          items,
          totalAmount: totalTTC,
          depositPaid: depositNum,
          depositPercent: depositPercent ?? undefined,
          depositPaymentMethod: methodMap[method] ?? 'card',
          reservationType: reservationType ?? undefined,
          recoveryMode,
          cashierName: 'Sophie Fontaine',
        });

        if (reservation) {
          toast.success(`Réservation ${reservation.reservationNumber} créée automatiquement`);
        }
      } catch (e) {
        console.log('Auto-reservation error:', e);
      }
    }

    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
    const confirmMethod = (mode === 'installment')
      ? 'Alma ' + almaInstallments + 'x' + (parseFloat(dossierFee) > 0 ? ' (+' + parseFloat(dossierFee).toFixed(2) + '€ frais)' : '')
      : method === 'Alma (3x/4x)' ? 'Alma ' + almaInstallments + 'x'
      : method;
    onConfirm(confirmMethod);
  };

  const modeLabels: Record<PaymentMode, string> = {
    immediate: 'Encaissement',
    acompte: 'Acompte / Réservation',
    installment: 'Paiement Alma (plusieurs fois)',
  };

  const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: string; desc?: string }[] = [
    { id: 'SumUp (CB)', label: 'SumUp (CB)', icon: '💳', desc: 'Terminal carte bancaire' },
    { id: 'Espèces', label: 'Espèces', icon: '💵', desc: 'Paiement en liquide' },
    { id: 'Virement', label: 'Virement', icon: '🏦', desc: 'Virement bancaire' },
    { id: 'Mixte', label: 'Mixte', icon: '🔀', desc: 'CB + Espèces' },
    { id: 'Alma (3x/4x)', label: 'Alma', icon: '🌸', desc: 'Paiement en plusieurs fois' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md mx-4 animate-slide-up max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-[16px] font-700 text-foreground">{modeLabels[mode]}</h2>
            {client && <p className="text-xs text-muted-foreground mt-0.5">Client : {client.name}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto scrollbar-thin flex-1">
          {/* Total */}
          <div className="bg-muted/40 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-500 text-muted-foreground">Total TTC</span>
            <span className="text-2xl font-700 tabular-nums text-foreground">{totalTTC.toFixed(2)} €</span>
          </div>

          {/* Immediate payment */}
          {mode === 'immediate' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-2">Mode de paiement</label>
                <div className="grid grid-cols-1 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={`method-${m.id}`}
                      onClick={() => setMethod(m.id)}
                      className={`flex items-center gap-3 py-2.5 px-3 rounded-lg border text-sm font-600 transition-all duration-150 ${
                        method === m.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}
                    >
                      <span className="text-base">{m.icon}</span>
                      <span className="flex-1 text-left">{m.label}</span>
                      {m.desc && <span className="text-[10px] text-muted-foreground font-400">{m.desc}</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alma info box */}
              {method === 'Alma (3x/4x)' && (
                <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🌸</span>
                    <div>
                      <p className="text-sm font-700 text-pink-800">Paiement Alma</p>
                      <p className="text-xs text-pink-600">Vous recevez la totalité immédiatement par virement Alma</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-600 text-pink-700 uppercase tracking-wide block mb-2">Nombre d'échéances</label>
                    <div className="flex gap-2">
                      {([2, 3, 4] as const).map((n) => (
                        <button
                          key={`alma-${n}`}
                          onClick={() => setAlmaInstallments(n)}
                          className={`flex-1 py-2 rounded-lg border text-sm font-700 transition-all ${
                            almaInstallments === n ? 'border-pink-500 bg-pink-100 text-pink-700' : 'border-pink-200 text-pink-500 hover:border-pink-400'
                          }`}
                        >
                          {n}×
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg px-3 py-2.5 border border-pink-200">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-pink-700 font-500">Montant total encaissé par vous</span>
                      <span className="font-700 text-pink-800 tabular-nums">{totalTTC.toFixed(2)} €</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-pink-600">Échéance client ({almaInstallments}×)</span>
                      <span className="text-pink-700 tabular-nums">{(totalTTC / almaInstallments).toFixed(2)} €/fois</span>
                    </div>
                    <p className="text-[10px] text-pink-500 mt-1.5">Les échéances sont gérées par Alma directement avec le client. Le CA est comptabilisé en totalité.</p>
                  </div>
                </div>
              )}

              {method === 'Espèces' && (
                <div>
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Montant remis</label>
                  <input
                    type="number" value={cashGiven} onChange={(e) => setCashGiven(e.target.value)}
                    placeholder={`Minimum ${totalTTC.toFixed(2)} €`}
                    className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  {cashGivenNum >= totalTTC && (
                    <div className="mt-2 flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <span className="text-sm text-emerald-700 font-500">Monnaie à rendre</span>
                      <span className="text-lg font-700 tabular-nums text-emerald-700">{changeAmount.toFixed(2)} €</span>
                    </div>
                  )}
                  {cashGivenNum > 0 && cashGivenNum < totalTTC && (
                    <div className="mt-2 flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <span className="text-sm text-red-700 font-500">Montant insuffisant</span>
                      <span className="text-base font-700 tabular-nums text-red-700">−{(totalTTC - cashGivenNum).toFixed(2)} €</span>
                    </div>
                  )}
                </div>
              )}

              {method === 'Mixte' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Partie SumUp (CB)</label>
                    <input
                      type="number" value={cbAmount} onChange={(e) => setCbAmount(e.target.value)} placeholder="0.00"
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                  {cbAmountNum > 0 && (
                    <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                      <span className="text-sm text-blue-700 font-500">Reste en espèces</span>
                      <span className="text-base font-700 tabular-nums text-blue-700">{Math.max(0, cashRemainder).toFixed(2)} €</span>
                    </div>
                  )}
                  {cbAmountNum > 0 && cashRemainder > 0 && (
                    <div>
                      <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Espèces remises par le client</label>
                      <input
                        type="number" value={cashMixGiven} onChange={(e) => setCashMixGiven(e.target.value)}
                        placeholder={`Minimum ${Math.max(0, cashRemainder).toFixed(2)} €`}
                        className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                      {cashMixGivenNum >= cashRemainder && cashMixGivenNum > 0 && (
                        <div className="mt-2 flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                          <span className="text-sm text-emerald-700 font-500">Monnaie à rendre</span>
                          <span className="text-lg font-700 tabular-nums text-emerald-700">{mixChange.toFixed(2)} €</span>
                        </div>
                      )}
                      {cashMixGivenNum > 0 && cashMixGivenNum < cashRemainder && (
                        <div className="mt-2 flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          <span className="text-sm text-red-700 font-500">Montant insuffisant</span>
                          <span className="text-base font-700 tabular-nums text-red-700">−{(cashRemainder - cashMixGivenNum).toFixed(2)} €</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Acompte */}
          {mode === 'acompte' && (
            <div className="space-y-4">
              {/* Payment method */}
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-2">Mode de paiement</label>
                <div className="grid grid-cols-1 gap-2">
                  {PAYMENT_METHODS.filter(m => m.id !== 'Alma (3x/4x)').map((m) => (
                    <button
                      key={`dep-method-${m.id}`}
                      onClick={() => setMethod(m.id)}
                      className={`flex items-center gap-3 py-2 px-3 rounded-lg border text-sm font-600 transition-all duration-150 ${
                        method === m.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}
                    >
                      <span>{m.icon}</span>
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Deposit % presets */}
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-2">Montant de l'acompte</label>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {DEPOSIT_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => { setDepositPercent(depositPercent === preset.value ? null : preset.value); setDepositCustom(''); }}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-600 transition-all ${
                        depositPercent === preset.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <input
                    type="number"
                    value={depositPercent !== null ? '' : depositCustom}
                    onChange={(e) => { setDepositPercent(null); setDepositCustom(e.target.value); }}
                    placeholder="Montant libre €"
                    className="flex-1 min-w-[100px] px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>

              {/* Deposit summary */}
              {depositNum > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <p className="text-[10px] text-amber-600 uppercase font-600">Total</p>
                    <p className="text-sm font-700 tabular-nums text-amber-800">{totalTTC.toFixed(2)} €</p>
                  </div>
                  <div className="text-center border-x border-amber-200">
                    <p className="text-[10px] text-amber-600 uppercase font-600">Acompte ({depositPct}%)</p>
                    <p className="text-sm font-700 tabular-nums text-amber-800">{depositNum.toFixed(2)} €</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-amber-600 uppercase font-600">Reste dû</p>
                    <p className="text-sm font-700 tabular-nums text-amber-800">{remaining.toFixed(2)} €</p>
                  </div>
                </div>
              )}

              {/* Reservation type */}
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-2">Type de réservation</label>
                <div className="flex flex-wrap gap-1.5">
                  {RESERVATION_TYPES.map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setReservationType(reservationType === key ? null : key)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-600 border transition-all ${
                        reservationType === key ? cfg.color : 'border-border text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      <Icon name={cfg.icon as any} size={11} />
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recovery mode */}
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-2">Mode de récupération</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {RECOVERY_MODES.map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setRecoveryMode(key)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-500 transition-all ${
                        recoveryMode === key ? cfg.color : 'border-border text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      <Icon name={cfg.icon as any} size={12} />
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {depositNum > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                  <Icon name="InformationCircleIcon" size={15} className="text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-700">
                    Une <span className="font-700">réservation sera créée automatiquement</span> avec le statut "Acompte versé".
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Alma installment mode */}
          {mode === 'installment' && (
            <div className="space-y-4">
              <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🌸</span>
                  <div>
                    <p className="text-base font-700 text-pink-800">Paiement Alma</p>
                    <p className="text-xs text-pink-600 mt-0.5">Paiement en plusieurs fois sans frais pour le client</p>
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-pink-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-pink-700 font-500">Montant total</span>
                    <span className="text-lg font-700 text-pink-800 tabular-nums">{totalTTC.toFixed(2)} €</span>
                  </div>
                  <div className="border-t border-pink-100 pt-2">
                    <p className="text-xs font-600 text-pink-700 mb-2">Nombre d'échéances client</p>
                    <div className="flex gap-2">
                      {([2, 3, 4] as const).map((n) => (
                        <button
                          key={`alma-inst-${n}`}
                          onClick={() => setAlmaInstallments(n)}
                          className={`flex-1 py-2.5 rounded-lg border text-sm font-700 transition-all ${
                            almaInstallments === n ? 'border-pink-500 bg-pink-100 text-pink-700' : 'border-pink-200 text-pink-400 hover:border-pink-400'
                          }`}
                        >
                          {n}×
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-pink-600 mt-2 text-center">
                      {almaInstallments}× {(totalTTC / almaInstallments).toFixed(2)} € pour le client
                    </p>
                  </div>
                  <div className="mt-3">
                    <label className="text-xs font-600 text-pink-700 uppercase tracking-wide block mb-1.5">Frais de dossier (€)</label>
                    <input
                      type="number" value={dossierFee} onChange={(e) => setDossierFee(e.target.value)}
                      placeholder="0.00 (optionnel)"
                      className="w-full px-3 py-2 border border-pink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-400 bg-white"
                    />
                    <div className="mt-2 bg-pink-50 border border-pink-100 rounded-lg px-3 py-2 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-pink-700">Base total</span>
                        <span className="font-600 text-pink-800 tabular-nums">{totalTTC.toFixed(2)} €</span>
                      </div>
                      {parseFloat(dossierFee) > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-pink-700">Frais de dossier</span>
                          <span className="font-600 text-pink-800 tabular-nums">{parseFloat(dossierFee).toFixed(2)} €</span>
                        </div>
                      )}
                      <div className="border-t border-pink-200 pt-1 flex items-center justify-between text-xs">
                        <span className="text-pink-700 font-700">Total à payer</span>
                        <span className="font-700 text-pink-900 tabular-nums">{(totalTTC + (parseFloat(dossierFee) || 0)).toFixed(2)} €</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-pink-600">Soit {almaInstallments}×</span>
                        <span className="text-pink-700 tabular-nums">{((totalTTC + (parseFloat(dossierFee) || 0)) / almaInstallments).toFixed(2)} €/fois</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Icon name="CheckCircleIcon" size={15} className="text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-xs font-700 text-emerald-800">Vous recevez {totalTTC.toFixed(2)} € immédiatement</p>
                      <p className="text-[10px] text-emerald-600 mt-0.5">Alma vous vire la totalité. Les échéances sont gérées par Alma avec le client.</p>
                    </div>
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-blue-700">
                    <span className="font-700">CA comptabilisé :</span> {totalTTC.toFixed(2)} € — Le montant total rentre dans votre chiffre d'affaires du jour.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Send receipt */}
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-2">Envoyer le ticket</label>
            <div className="flex gap-2">
              {[
                { id: 'recv-none', val: 'none' as const, label: 'Imprimer seulement' },
                { id: 'recv-email', val: 'email' as const, label: '📧 Email' },
                { id: 'recv-wa', val: 'whatsapp' as const, label: '💬 WhatsApp' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSendReceipt(opt.val)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-600 transition-all ${
                    sendReceipt === opt.val ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6 shrink-0">
          <button onClick={onClose} className="flex-1 py-3 border border-border rounded-xl text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={
              loading ||
              (mode === 'acompte' && depositNum <= 0) ||
              (mode === 'immediate' && method === 'Espèces' && cashGivenNum < totalTTC)
            }
            className={`flex-1 py-3 rounded-xl text-sm font-700 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 flex items-center justify-center gap-2 ${
              mode === 'installment' || method === 'Alma (3x/4x)'
                ? 'bg-pink-600 text-white' :'bg-primary text-primary-foreground'
            }`}
          >
            {loading ? (
              <>
                <Icon name="ArrowPathIcon" size={15} className="animate-spin" />
                Traitement…
              </>
            ) : mode === 'installment' ? (
              <>
                <span>🌸</span>
                Valider paiement Alma
              </>
            ) : (
              <>
                <Icon name="CheckIcon" size={15} />
                {mode === 'acompte' ? "Valider l'acompte" : 'Valider le paiement'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}