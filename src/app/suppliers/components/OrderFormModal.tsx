'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { supplierService } from '@/lib/services/supplierService';

interface OrderItem {
  name: string;
  qty: number;
  unit_price: number;
  total: number;
}

interface Props {
  supplierId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function OrderFormModal({ supplierId, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OrderItem[]>([{ name: '', qty: 1, unit_price: 0, total: 0 }]);
  const [form, setForm] = useState({
    notes: '',
    shippingCost: 0,
    customsCost: 0,
    otherCosts: 0,
    currency: 'EUR',
    exchangeRate: 1,
    expectedDeliveryAt: '',
  });

  const set = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const updateItem = (index: number, key: keyof OrderItem, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      if (key === 'qty' || key === 'unit_price') {
        next[index].total = Number(next[index].qty) * Number(next[index].unit_price);
      }
      return next;
    });
  };

  const addItem = () => setItems((p) => [...p, { name: '', qty: 1, unit_price: 0, total: 0 }]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));

  const subtotal = items.reduce((s, i) => s + Number(i.total), 0);
  const total = subtotal + Number(form.shippingCost) + Number(form.customsCost) + Number(form.otherCosts);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.some((i) => !i.name.trim())) { setError('Tous les produits doivent avoir un nom'); return; }
    setSaving(true);
    setError(null);
    try {
      await supplierService.createOrder({
        supplierId,
        items,
        subtotal,
        shippingCost: Number(form.shippingCost),
        customsCost: Number(form.customsCost),
        otherCosts: Number(form.otherCosts),
        totalAmount: total,
        currency: form.currency,
        exchangeRate: Number(form.exchangeRate),
        notes: form.notes,
        expectedDeliveryAt: form.expectedDeliveryAt || undefined,
        orderStatus: 'draft',
      });
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="font-700 text-foreground text-lg">Nouvelle commande fournisseur</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><Icon name="XMarkIcon" size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground">Produits commandés</p>
              <button type="button" onClick={addItem} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                <Icon name="PlusIcon" size={13} />Ajouter un produit
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(i, 'name', e.target.value)}
                    placeholder="Nom du produit"
                    className="col-span-5 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    type="number" min="1" value={item.qty}
                    onChange={(e) => updateItem(i, 'qty', Number(e.target.value))}
                    placeholder="Qté"
                    className="col-span-2 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    type="number" min="0" step="0.01" value={item.unit_price}
                    onChange={(e) => updateItem(i, 'unit_price', Number(e.target.value))}
                    placeholder="P.U."
                    className="col-span-2 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="col-span-2 px-3 py-2 bg-muted rounded-lg text-sm text-muted-foreground text-right">
                    {item.total.toFixed(2)}
                  </div>
                  <button type="button" onClick={() => removeItem(i)} disabled={items.length === 1} className="col-span-1 p-2 text-muted-foreground hover:text-red-500 disabled:opacity-30 transition-colors">
                    <Icon name="TrashIcon" size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Costs */}
          <div>
            <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground mb-3">Frais supplémentaires</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Transport</label>
                <input type="number" min="0" step="0.01" value={form.shippingCost} onChange={(e) => set('shippingCost', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Douane</label>
                <input type="number" min="0" step="0.01" value={form.customsCost} onChange={(e) => set('customsCost', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Autres frais</label>
                <input type="number" min="0" step="0.01" value={form.otherCosts} onChange={(e) => set('otherCosts', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Devise</label>
                <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="EUR">EUR €</option>
                  <option value="USD">USD $</option>
                  <option value="CNY">CNY ¥</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Taux de change</label>
                <input type="number" min="0" step="0.0001" value={form.exchangeRate} onChange={(e) => set('exchangeRate', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Livraison prévue</label>
                <input type="date" value={form.expectedDeliveryAt} onChange={(e) => set('expectedDeliveryAt', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Notes / Instructions</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" placeholder="Couleur, taille, packaging, logo, modifications..." />
          </div>

          {/* Total */}
          <div className="bg-muted/50 rounded-xl p-4">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Sous-total produits</span><span>{subtotal.toFixed(2)} {form.currency}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Transport</span><span>{Number(form.shippingCost).toFixed(2)} {form.currency}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Douane</span><span>{Number(form.customsCost).toFixed(2)} {form.currency}</span></div>
              {Number(form.otherCosts) > 0 && <div className="flex justify-between text-muted-foreground"><span>Autres frais</span><span>{Number(form.otherCosts).toFixed(2)} {form.currency}</span></div>}
              <div className="flex justify-between font-700 text-foreground text-base pt-2 border-t border-border"><span>Total</span><span>{total.toFixed(2)} {form.currency}</span></div>
            </div>
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Annuler</button>
          <button onClick={handleSubmit as any} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60">
            {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Créer la commande
          </button>
        </div>
      </div>
    </div>
  );
}
