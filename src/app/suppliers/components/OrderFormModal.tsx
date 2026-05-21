'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import { supplierService } from '@/lib/services/supplierService';

interface OrderItem {
  productId?: string;
  name: string;
  qty: number;
  unit_price: number;
  total: number;
}

interface ProductVariant {
  id: string;
  colorName: string;
  colorHex: string;
}

interface Product {
  id: string;
  name: string;
  reference?: string;
  image_url?: string;
  buy_price?: number;
  has_color_variants?: boolean;
}

interface Props {
  supplierId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function OrderFormModal({ supplierId, onClose, onSaved }: Props) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OrderItem[]>([{ name: '', qty: 1, unit_price: 0, total: 0 }]);
  const [suggestions, setSuggestions] = useState<Record<number, Product[]>>({});
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [searching, setSearching] = useState<number | null>(null);
  const [itemVariants, setItemVariants] = useState<Record<number, ProductVariant[]>>({});
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

  const searchProducts = async (index: number, query: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], name: query, productId: undefined };
      return next;
    });
    if (query.trim().length < 2) {
      setSuggestions((p) => ({ ...p, [index]: [] }));
      setOpenDropdown(null);
      return;
    }
    setSearching(index);
    const { data } = await supabase
      .from('products')
      .select('id, name, reference, image_url, buy_price, has_color_variants')
      .ilike('name', `%${query.trim()}%`)
      .eq('is_active', true)
      .limit(8);
    setSuggestions((p) => ({ ...p, [index]: data || [] }));
    setOpenDropdown(index);
    setSearching(null);
  };

  const selectProduct = async (index: number, product: Product) => {
    const buyPrice = Number(product.buy_price) || 0;
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        productId: product.id,
        name: product.name,
        unit_price: buyPrice || next[index].unit_price,
        total: Number(next[index].qty) * (buyPrice || next[index].unit_price),
      };
      return next;
    });
    setSuggestions((p) => ({ ...p, [index]: [] }));
    setOpenDropdown(null);

    if (product.has_color_variants) {
      const { data } = await supabase
        .from('product_color_stock')
        .select('id, color_name, color_hex')
        .eq('product_id', product.id)
        .order('color_name');
      setItemVariants((p) => ({
        ...p,
        [index]: (data || []).map((v: any) => ({ id: v.id, colorName: v.color_name, colorHex: v.color_hex })),
      }));
    } else {
      setItemVariants((p) => { const next = { ...p }; delete next[index]; return next; });
    }
  };

  const addItem = () => setItems((p) => [...p, { name: '', qty: 1, unit_price: 0, total: 0 }]);

  const removeItem = (i: number) => {
    setItems((p) => p.filter((_, idx) => idx !== i));
    setSuggestions((p) => { const next = { ...p }; delete next[i]; return next; });
    setItemVariants((p) => { const next = { ...p }; delete next[i]; return next; });
  };

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
                <div key={i} className="space-y-1.5">
                <div className="grid grid-cols-12 gap-2 items-start">
                  {/* Product search */}
                  <div className="col-span-5 relative">
                    <div className="relative">
                      <input
                        value={item.name}
                        onChange={(e) => searchProducts(i, e.target.value)}
                        onFocus={() => { if ((suggestions[i] || []).length > 0) setOpenDropdown(i); }}
                        onBlur={() => setTimeout(() => setOpenDropdown(null), 150)}
                        placeholder="Nom ou référence produit"
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 pr-7"
                      />
                      {searching === i && (
                        <div className="absolute right-2 top-2.5">
                          <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      {item.productId && searching !== i && (
                        <div className="absolute right-2 top-2.5">
                          <Icon name="CheckIcon" size={14} className="text-emerald-500" />
                        </div>
                      )}
                    </div>
                    {openDropdown === i && (suggestions[i] || []).length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                        {(suggestions[i] || []).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => selectProduct(i, p)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted text-left transition-colors"
                          >
                            {p.image_url ? (
                              <img src={p.image_url} alt="" className="w-7 h-7 rounded object-cover border border-border shrink-0" />
                            ) : (
                              <div className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0">
                                <Icon name="PhotoIcon" size={12} className="text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground truncate">{p.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {p.reference && <span className="mr-2 font-mono">{p.reference}</span>}
                                {p.buy_price ? `${Number(p.buy_price).toFixed(2)} €` : ''}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
                {(itemVariants[i] || []).length > 0 && (
                  <div className="ml-1 flex flex-wrap gap-1.5 pb-1">
                    <span className="text-[11px] text-muted-foreground self-center">Couleur :</span>
                    {(itemVariants[i] || []).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          const baseName = item.name.split(' — ')[0];
                          updateItem(i, 'name', `${baseName} — ${v.colorName}`);
                        }}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-500 transition-all ${item.name.endsWith(`— ${v.colorName}`) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
                      >
                        <span className="w-3 h-3 rounded-full border border-border/50 shrink-0" style={{ backgroundColor: v.colorHex }} />
                        {v.colorName}
                      </button>
                    ))}
                  </div>
                )}
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
