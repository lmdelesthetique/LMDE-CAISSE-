'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { supplierService, SupplierOrder } from '@/lib/services/supplierService';

interface Props {
  supplierId: string;
  orders: SupplierOrder[];
  onClose: () => void;
  onSaved: () => void;
}

export default function PaymentFormModal({ supplierId, orders, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    orderId: '',
    amount: '',
    currency: 'EUR',
    exchangeRate: '1',
    paymentMethod: 'wire_transfer',
    paidAt: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const set = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) { setError('Montant invalide'); return; }
    setSaving(true);
    setError(null);
    try {
      await supplierService.createPayment({
        supplierId,
        orderId: form.orderId || undefined,
        amount: Number(form.amount),
        currency: form.currency,
        exchangeRate: Number(form.exchangeRate),
        paymentMethod: form.paymentMethod as any,
        paymentStatus: 'sent',
        paidAt: form.paidAt ? new Date(form.paidAt).toISOString() : undefined,
        notes: form.notes,
      });
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-700 text-foreground text-lg">Enregistrer un paiement</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><Icon name="XMarkIcon" size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Commande associée (optionnel)</label>
            <select value={form.orderId} onChange={(e) => set('orderId', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
              <option value="">— Aucune commande spécifique —</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber} — {o.totalAmount.toFixed(2)} {o.currency}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Montant *</label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Devise</label>
              <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="EUR">EUR €</option>
                <option value="USD">USD $</option>
                <option value="CNY">CNY ¥</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Méthode de paiement</label>
              <select value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="wire_transfer">Virement bancaire</option>
                <option value="wise">Wise</option>
                <option value="alibaba">Alibaba</option>
                <option value="paypal">PayPal</option>
                <option value="other">Autre</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Date du paiement</label>
              <input type="date" value={form.paidAt} onChange={(e) => set('paidAt', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" placeholder="Référence virement, notes..." />
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Annuler</button>
          <button onClick={handleSubmit as any} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60">
            {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
