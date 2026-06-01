'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';

const MAX_ATTEMPTS = 3;
const LOCK_SECONDS = 60;

interface PriceEditModalProps {
  itemId: string;
  productId: string;
  productName: string;
  currentPrice: number;
  onClose: () => void;
  onConfirm: (itemId: string, newPrice: number) => void;
  cashierName?: string;
}

type Step = 'pin' | 'edit';

export default function PriceEditModal({
  itemId,
  productId,
  productName,
  currentPrice,
  onClose,
  onConfirm,
  cashierName = 'Caisse',
}: PriceEditModalProps) {
  const [step, setStep] = useState<Step>('pin');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lockCountdown, setLockCountdown] = useState(0);
  const [newPrice, setNewPrice] = useState(currentPrice.toFixed(2));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!locked) return;
    setLockCountdown(LOCK_SECONDS);
    const interval = setInterval(() => {
      setLockCountdown((c) => {
        if (c <= 1) { clearInterval(interval); setLocked(false); setAttempts(0); setPinError(''); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [locked]);

  const handlePinSubmit = async () => {
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
        setStep('edit');
        setPinError('');
      } else {
        const next = attempts + 1;
        setAttempts(next);
        setPin('');
        if (next >= MAX_ATTEMPTS) {
          setLocked(true);
          setPinError(`3 tentatives incorrectes — bloqué ${LOCK_SECONDS}s`);
        } else {
          setPinError(`Code incorrect. ${MAX_ATTEMPTS - next} tentative(s) restante(s).`);
        }
      }
    } catch {
      setPinError('Erreur réseau — réessayez');
    } finally {
      setChecking(false);
    }
  };

  const handlePriceConfirm = async () => {
    const p = parseFloat(newPrice);
    if (!p || p <= 0) return;
    setSaving(true);
    try {
      const supabase = createClient();
      await supabase.from('price_change_log').insert({
        product_id: productId,
        product_name: productName,
        old_price: currentPrice,
        new_price: p,
        reason: reason.trim() || null,
        cashier_name: cashierName,
        changed_at: new Date().toISOString(),
      });
    } catch (e) {
      // Non-blocking — log silently
      console.log('price_change_log insert error:', e);
    }
    setSaving(false);
    onConfirm(itemId, p);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-sm mx-4 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Icon name="PencilSquareIcon" size={16} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-700 text-foreground">Modifier le prix</h2>
              <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{productName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {step === 'pin' ? (
          <div className="px-5 py-5 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <Icon name="ShieldCheckIcon" size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                La modification de prix nécessite une <span className="font-700">autorisation manager</span>. Entrez le PIN.
              </p>
            </div>
            {locked ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-sm font-700 text-red-700">Accès bloqué</p>
                <p className="text-3xl font-700 text-red-600 tabular-nums mt-1">{lockCountdown}s</p>
                <p className="text-xs text-red-500 mt-1">{pinError}</p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">
                  PIN Manager
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => { setPin(e.target.value); setPinError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
                  placeholder="••••"
                  maxLength={6}
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-sm text-center tracking-widest font-700 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  autoFocus
                />
                {pinError && (
                  <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                    <Icon name="ExclamationCircleIcon" size={13} />
                    {pinError}
                  </p>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
                Annuler
              </button>
              {!locked && (
                <button
                  onClick={handlePinSubmit}
                  disabled={pin.length < 4 || checking}
                  className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-700 hover:bg-amber-600 transition-colors disabled:opacity-40 active:scale-95 flex items-center justify-center gap-2"
                >
                  {checking ? <><Icon name="ArrowPathIcon" size={13} className="animate-spin" />Vérification…</> : 'Valider le PIN'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="px-5 py-5 space-y-4">
            <div className="bg-muted/40 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Prix actuel</span>
              <span className="text-lg font-700 tabular-nums text-foreground line-through text-muted-foreground">
                {currentPrice.toFixed(2)} €
              </span>
            </div>
            <div>
              <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">
                Nouveau prix TTC (€) <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                min="0.01"
                step="0.01"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm font-700 text-center text-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">
                Raison (optionnel)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Remise fidélité, erreur de prix..."
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
                Annuler
              </button>
              <button
                onClick={handlePriceConfirm}
                disabled={saving || !newPrice || parseFloat(newPrice) <= 0}
                className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 transition-opacity disabled:opacity-40 active:scale-95 flex items-center justify-center gap-2"
              >
                {saving ? <Icon name="ArrowPathIcon" size={14} className="animate-spin" /> : <Icon name="CheckIcon" size={14} />}
                Appliquer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
