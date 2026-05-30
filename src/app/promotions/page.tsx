'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

// ─── Types ─────────────────────────────────────────────────────────────────────

type PromoType = 'discount' | 'bundle' | 'bogo';
type DiscountType = 'percent' | 'amount';

interface BundleProduct {
  product_id: string;
  name: string;
  sku: string;
  qty: number;
  unit_price: number;
}

interface Promotion {
  id: string;
  name: string;
  description: string | null;
  type: PromoType;
  discount_type: DiscountType | null;
  discount_value: number | null;
  products: BundleProduct[];
  bundle_price: number | null;
  min_qty: number | null;
  min_amount: number | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

interface ProductRow {
  id: string;
  name: string;
  ref: string;
  sell_price_ttc: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function promoTypeLabel(t: PromoType) {
  if (t === 'discount') return 'Remise';
  if (t === 'bundle') return 'Offre groupée';
  if (t === 'bogo') return '1+1 offert';
  return t;
}

function promoTypeBadge(t: PromoType) {
  if (t === 'discount') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (t === 'bundle')   return 'bg-blue-100 text-blue-800 border-blue-200';
  if (t === 'bogo')     return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  return 'bg-gray-100 text-gray-800 border-gray-200';
}

const EMPTY_FORM = {
  name: '',
  description: '',
  type: 'discount' as PromoType,
  discount_type: 'percent' as DiscountType,
  discount_value: '',
  bundle_price: '',
  min_qty: '',
  min_amount: '',
  is_active: true,
  starts_at: '',
  ends_at: '',
  products: [] as BundleProduct[],
};

// ─── PromoFormModal ─────────────────────────────────────────────────────────────

function PromoFormModal({
  promo,
  onClose,
  onSaved,
}: {
  promo?: Promotion | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!promo;
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<ProductRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (promo) {
      setForm({
        name: promo.name,
        description: promo.description ?? '',
        type: promo.type,
        discount_type: promo.discount_type ?? 'percent',
        discount_value: promo.discount_value != null ? String(promo.discount_value) : '',
        bundle_price: promo.bundle_price != null ? String(promo.bundle_price) : '',
        min_qty: promo.min_qty != null ? String(promo.min_qty) : '',
        min_amount: promo.min_amount != null ? String(promo.min_amount) : '',
        is_active: promo.is_active,
        starts_at: promo.starts_at ? promo.starts_at.slice(0, 10) : '',
        ends_at: promo.ends_at ? promo.ends_at.slice(0, 10) : '',
        products: promo.products ?? [],
      });
    }
  }, [promo]);

  const searchProducts = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('products')
      .select('id, name, ref, sell_price_ttc')
      .ilike('name', `%${q}%`)
      .eq('is_active', true)
      .limit(10);
    setSearchResults((data ?? []) as ProductRow[]);
    setSearching(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchProducts(searchQ), 300);
    return () => clearTimeout(t);
  }, [searchQ, searchProducts]);

  const addProduct = (p: ProductRow) => {
    if (form.products.find((x) => x.product_id === p.id)) return;
    setForm((f) => ({
      ...f,
      products: [...f.products, { product_id: p.id, name: p.name, sku: p.ref, qty: 1, unit_price: Number(p.sell_price_ttc) || 0 }],
    }));
    setSearchQ('');
    setSearchResults([]);
  };

  const removeProduct = (id: string) =>
    setForm((f) => ({ ...f, products: f.products.filter((x) => x.product_id !== id) }));

  const updateBundleQty = (id: string, qty: number) =>
    setForm((f) => ({
      ...f,
      products: f.products.map((x) => x.product_id === id ? { ...x, qty: Math.max(1, qty) } : x),
    }));

  const bundleOriginalTotal = form.products.reduce((s, p) => s + p.unit_price * p.qty, 0);
  const bundlePrice = parseFloat(form.bundle_price) || 0;
  const bundleSaving = bundleOriginalTotal > 0 && bundlePrice > 0 ? bundleOriginalTotal - bundlePrice : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Le nom est requis.'); return; }
    if (form.type === 'discount' && !form.discount_value) { setError('La valeur de remise est requise.'); return; }
    if (form.type === 'bundle' && form.products.length < 2) { setError('Un bundle nécessite au moins 2 produits.'); return; }
    setError('');
    setSaving(true);

    const payload: any = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      type: form.type,
      discount_type: form.discount_type,
      discount_value: form.discount_value ? parseFloat(form.discount_value) : null,
      products: form.products,
      bundle_price: form.bundle_price ? parseFloat(form.bundle_price) : null,
      min_qty: form.min_qty ? parseInt(form.min_qty) : null,
      min_amount: form.min_amount ? parseFloat(form.min_amount) : null,
      is_active: form.is_active,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
    };

    const supabase = createClient();
    let err: any;
    if (isEdit) {
      ({ error: err } = await supabase.from('promotions').update(payload).eq('id', promo!.id));
    } else {
      ({ error: err } = await supabase.from('promotions').insert(payload));
    }

    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      toast.success(isEdit ? 'Promotion modifiée' : 'Promotion créée !');
      onSaved();
      onClose();
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const discountLabel = form.discount_type === 'percent'
    ? (form.discount_value ? `-${form.discount_value}%` : '')
    : (form.discount_value ? `-${parseFloat(form.discount_value).toFixed(2)} €` : '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon name="TagIcon" size={16} className="text-primary" />
            </div>
            <h2 className="text-base font-700 text-foreground">{isEdit ? 'Modifier la promotion' : 'Nouvelle promotion'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* ── Étape 1 : Infos générales ── */}
          <div>
            <p className="text-[11px] font-700 text-primary uppercase tracking-widest mb-3">1 — Informations générales</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Nom *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={set('name')}
                  placeholder="Ex: Soldes été -50%"
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as PromoType, products: [] }))}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="discount">🏷️ Remise sur produit(s)</option>
                  <option value="bundle">📦 Offre groupée (bundle)</option>
                  <option value="bogo">🎁 1 acheté = 1 offert</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Description (affichée dans le POS)</label>
              <textarea
                value={form.description}
                onChange={set('description')}
                rows={2}
                placeholder="Description courte…"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* ── Étape 2 : Valeur de la remise ── */}
          {(form.type === 'discount' || form.type === 'bogo') && (
            <div>
              <p className="text-[11px] font-700 text-primary uppercase tracking-widest mb-3">2 — Valeur de la remise</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Type de remise</label>
                  <div className="flex rounded-xl overflow-hidden border border-border text-sm">
                    <button type="button" onClick={() => setForm((f) => ({ ...f, discount_type: 'percent' }))}
                      className={`flex-1 py-2.5 font-600 transition-colors ${form.discount_type === 'percent' ? 'bg-primary text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}>
                      % Pourcentage
                    </button>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, discount_type: 'amount' }))}
                      className={`flex-1 py-2.5 font-600 transition-colors ${form.discount_type === 'amount' ? 'bg-primary text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}>
                      € Montant fixe
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">
                    Valeur ({form.discount_type === 'percent' ? '%' : '€'}) *
                  </label>
                  <div className="relative">
                    <input type="number" min="0" step="0.01" value={form.discount_value} onChange={set('discount_value')}
                      placeholder={form.discount_type === 'percent' ? '50' : '5.00'}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 pr-10" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-700 text-muted-foreground">
                      {form.discount_type === 'percent' ? '%' : '€'}
                    </span>
                  </div>
                  {discountLabel && (
                    <p className="text-xs text-emerald-600 mt-1 font-600">Remise appliquée : {discountLabel}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Étape 2/3 : Sélectionner produits ── */}
          <div>
            <p className="text-[11px] font-700 text-primary uppercase tracking-widest mb-3">
              {form.type === 'discount' ? '3' : '2'} — Produits concernés {form.type === 'bundle' ? '(min. 2 requis)' : '(optionnel — laisser vide = toute la boutique)'}
            </p>

            {/* Search */}
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <Icon name="MagnifyingGlassIcon" size={14} className="text-muted-foreground" />
              </div>
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Rechercher un produit à ajouter…"
                className="w-full border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {(searchResults.length > 0 || searching) && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                  {searching ? (
                    <div className="p-3 text-center text-sm text-muted-foreground">Recherche…</div>
                  ) : searchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 text-left text-sm"
                    >
                      <div>
                        <span className="font-500 text-foreground">{p.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground font-mono">{p.ref}</span>
                      </div>
                      <span className="text-sm font-600 text-muted-foreground shrink-0">{fmt(Number(p.sell_price_ttc))} €</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected products */}
            {form.products.length > 0 && (
              <div className="mt-3 border border-border rounded-xl overflow-hidden">
                {form.products.map((p) => {
                  const discVal = form.type === 'discount' && form.discount_value ? parseFloat(form.discount_value) : 0;
                  const promoPrice = form.discount_type === 'percent'
                    ? p.unit_price * (1 - discVal / 100)
                    : Math.max(0, p.unit_price - discVal);
                  return (
                    <div key={p.product_id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-500 text-foreground">{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground font-mono">{p.sku}</span>
                          {form.type === 'discount' && discVal > 0 && (
                            <>
                              <span className="text-xs line-through text-muted-foreground">{fmt(p.unit_price)} €</span>
                              <span className="text-xs font-700 text-emerald-600">{fmt(promoPrice)} €</span>
                            </>
                          )}
                        </div>
                      </div>
                      {form.type !== 'discount' && (
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => updateBundleQty(p.product_id, p.qty - 1)}
                            className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted text-muted-foreground text-xs">−</button>
                          <span className="w-8 text-center text-sm font-600 tabular-nums">{p.qty}</span>
                          <button type="button" onClick={() => updateBundleQty(p.product_id, p.qty + 1)}
                            className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted text-muted-foreground text-xs">+</button>
                        </div>
                      )}
                      <span className="text-sm font-600 text-muted-foreground tabular-nums w-20 text-right">
                        {fmt(p.unit_price * (form.type !== 'discount' ? p.qty : 1))} €
                      </span>
                      <button type="button" onClick={() => removeProduct(p.product_id)} className="text-muted-foreground hover:text-red-500">
                        <Icon name="XMarkIcon" size={14} />
                      </button>
                    </div>
                  );
                })}
                {bundleOriginalTotal > 0 && form.type !== 'discount' && (
                  <div className="px-4 py-2 bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Total catalogue</span>
                    <span className="font-600">{fmt(bundleOriginalTotal)} €</span>
                  </div>
                )}
              </div>
            )}

            {form.products.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2 pl-1">
                {form.type === 'discount'
                  ? 'Aucun produit sélectionné — la remise s\'appliquera à tous les produits dans le POS.'
                  : 'Recherchez et ajoutez les produits de ce bundle.'}
              </p>
            )}

            {/* Bundle price */}
            {form.type === 'bundle' && (
              <div className="mt-4">
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Prix spécial bundle (€)</label>
                <input type="number" min="0" step="0.01" value={form.bundle_price} onChange={set('bundle_price')}
                  placeholder="Prix du lot…"
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                {bundleSaving > 0 && (
                  <p className="text-xs text-emerald-600 mt-1 font-600">✓ Économie client : {fmt(bundleSaving)} €</p>
                )}
              </div>
            )}
          </div>

          {/* ── Étape finale : Dates + activation ── */}
          <div>
            <p className="text-[11px] font-700 text-primary uppercase tracking-widest mb-3">
              {form.type === 'discount' ? '4' : '3'} — Période & activation
            </p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Début</label>
                <input type="date" value={form.starts_at} onChange={set('starts_at')}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Fin</label>
                <input type="date" value={form.ends_at} onChange={set('ends_at')}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm font-500 text-foreground">
                {form.is_active ? '✅ Promotion active immédiatement' : '⏸ Promotion inactive'}
              </span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          )}
        </form>

        <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-xl text-sm font-500 hover:bg-muted transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground font-700 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
          >
            {saving
              ? <Icon name="ArrowPathIcon" size={15} className="animate-spin" />
              : <Icon name="CheckIcon" size={15} />}
            {isEdit ? 'Enregistrer' : 'Créer la promotion'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Promo Card ─────────────────────────────────────────────────────────────────

function PromoCard({
  p,
  onToggle,
  onEdit,
  onDelete,
  deleting,
}: {
  p: Promotion;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const expired = !!p.ends_at && new Date(p.ends_at) < new Date();
  const scheduled = !!p.starts_at && new Date(p.starts_at) > new Date();

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-all ${!p.is_active || expired ? 'opacity-70 border-border' : 'border-border shadow-sm hover:shadow-md'}`}>
      {/* Color stripe */}
      <div className={`h-1.5 ${p.type === 'discount' ? 'bg-amber-400' : p.type === 'bundle' ? 'bg-blue-500' : 'bg-emerald-500'}`} />

      <div className="p-5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-700 text-foreground">{p.name}</h3>
              <span className={`text-[10px] font-700 px-2 py-0.5 rounded-full border ${promoTypeBadge(p.type)}`}>
                {promoTypeLabel(p.type)}
              </span>
            </div>
            {p.description && <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>}
          </div>
          <button
            onClick={onToggle}
            title={p.is_active ? 'Désactiver' : 'Activer'}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${p.is_active ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${p.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {/* Value */}
        <div className="space-y-1">
          {p.type === 'discount' && p.discount_value != null && (
            <p className="text-lg font-700 text-amber-700">
              {p.discount_type === 'percent' ? `−${p.discount_value}%` : `−${fmt(p.discount_value)} €`}
              {(p.products ?? []).length > 0 && (
                <span className="text-xs font-500 text-muted-foreground ml-2">sur {p.products.length} produit{p.products.length > 1 ? 's' : ''}</span>
              )}
            </p>
          )}
          {p.type === 'bundle' && (
            <div>
              <p className="text-xs text-muted-foreground">{(p.products ?? []).length} produit{(p.products ?? []).length > 1 ? 's' : ''} dans le lot</p>
              {p.bundle_price != null && (
                <p className="text-lg font-700 text-blue-700">Prix lot : {fmt(p.bundle_price)} €</p>
              )}
            </div>
          )}
          {p.type === 'bogo' && (
            <p className="text-sm font-700 text-emerald-700">🎁 1 acheté = 1 offert</p>
          )}
          {(p.products ?? []).length > 0 && p.type !== 'discount' && (
            <div className="flex flex-wrap gap-1 mt-1">
              {p.products.slice(0, 3).map((bp) => (
                <span key={bp.product_id} className="text-[10px] bg-muted px-2 py-0.5 rounded-lg text-muted-foreground font-500">
                  {bp.qty}× {bp.name}
                </span>
              ))}
              {p.products.length > 3 && <span className="text-[10px] text-muted-foreground">+{p.products.length - 3}</span>}
            </div>
          )}
          {(p.starts_at || p.ends_at) && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Icon name="CalendarDaysIcon" size={11} />
              {p.starts_at && `Du ${new Date(p.starts_at).toLocaleDateString('fr-FR')}`}
              {p.starts_at && p.ends_at && ' '}
              {p.ends_at && `au ${new Date(p.ends_at).toLocaleDateString('fr-FR')}`}
            </p>
          )}
          {expired && <span className="text-[10px] font-700 text-red-600">⚠️ Expirée</span>}
          {scheduled && <span className="text-[10px] font-700 text-blue-600">⏰ Programmée</span>}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-[10px] font-600 px-2 py-0.5 rounded-full ${p.is_active && !expired ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${p.is_active && !expired ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            {p.is_active && !expired ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-500 border border-border rounded-lg hover:bg-muted transition-colors"
          >
            <Icon name="PencilSquareIcon" size={12} /> Modifier
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-500 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {deleting ? <Icon name="ArrowPathIcon" size={12} className="animate-spin" /> : <Icon name="TrashIcon" size={12} />}
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [tab, setTab] = useState<'promotions' | 'bundles'>('promotions');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadPromotions = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42P01') setTableError(true);
      else toast.error('Erreur de chargement : ' + error.message);
      setLoading(false);
      return;
    }
    setPromotions((data ?? []) as Promotion[]);
    setTableError(false);
    setLoading(false);
  }, []);

  useEffect(() => { loadPromotions(); }, [loadPromotions]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const supabase = createClient();
    const { error } = await supabase.from('promotions').delete().eq('id', id);
    if (error) toast.error('Erreur suppression : ' + error.message);
    else {
      toast.success('Promotion supprimée');
      setPromotions((p) => p.filter((x) => x.id !== id));
    }
    setDeleting(null);
  };

  const handleToggleActive = async (promo: Promotion) => {
    const supabase = createClient();
    const { error } = await supabase.from('promotions').update({ is_active: !promo.is_active }).eq('id', promo.id);
    if (error) toast.error('Erreur : ' + error.message);
    else {
      setPromotions((p) => p.map((x) => x.id === promo.id ? { ...x, is_active: !x.is_active } : x));
      toast.success(promo.is_active ? 'Promotion désactivée' : 'Promotion activée !');
    }
  };

  // Tab filtering
  const tabFiltered = useMemo(() => {
    const base = promotions.filter((p) => {
      if (search.trim() && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    if (tab === 'bundles') return base.filter((p) => p.type === 'bundle');
    return base.filter((p) => p.type !== 'bundle');
  }, [promotions, tab, search]);

  const stats = useMemo(() => ({
    total: promotions.length,
    active: promotions.filter((p) => p.is_active).length,
    discounts: promotions.filter((p) => p.type === 'discount' || p.type === 'bogo').length,
    bundles: promotions.filter((p) => p.type === 'bundle').length,
  }), [promotions]);

  const setupSQL = `-- Run in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'discount',
  discount_type TEXT,
  discount_value DECIMAL(10,2),
  products JSONB DEFAULT '[]',
  bundle_price DECIMAL(10,2),
  min_qty INTEGER,
  min_amount DECIMAL(10,2),
  is_active BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.promotions DISABLE ROW LEVEL SECURITY;`;

  if (tableError) {
    return (
      <AppLayout>
        <div className="p-6 max-w-3xl mx-auto">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Icon name="ExclamationTriangleIcon" size={24} className="text-amber-600" />
              <h2 className="text-base font-700 text-amber-800">Table promotions introuvable</h2>
            </div>
            <p className="text-sm text-amber-700">Exécutez ce SQL dans Supabase → SQL Editor :</p>
            <pre className="bg-white border border-amber-200 rounded-xl p-4 text-xs text-amber-900 overflow-x-auto whitespace-pre-wrap">{setupSQL}</pre>
            <button onClick={loadPromotions} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-600 hover:bg-amber-700 transition-colors">
              <Icon name="ArrowPathIcon" size={15} /> Réessayer
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-20 bg-white border-b border-border px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon name="TagIcon" size={20} className="text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-700 text-foreground">Promotions</h1>
                <p className="text-xs text-muted-foreground">{stats.active} active{stats.active > 1 ? 's' : ''} · {stats.total} au total</p>
              </div>
            </div>
            <button
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 transition-opacity shadow-sm"
            >
              <Icon name="PlusIcon" size={16} />
              + Créer une promotion
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total promos', value: stats.total, color: 'bg-gray-50 text-foreground', icon: 'TicketIcon' },
              { label: 'Actives', value: stats.active, color: 'bg-emerald-50 text-emerald-700', icon: 'CheckCircleIcon' },
              { label: 'Remises', value: stats.discounts, color: 'bg-amber-50 text-amber-700', icon: 'TagIcon' },
              { label: 'Offres groupées', value: stats.bundles, color: 'bg-blue-50 text-blue-700', icon: 'CubeIcon' },
            ].map((k) => (
              <div key={k.label} className={`rounded-2xl border border-border p-4 flex items-center gap-3 ${k.color}`}>
                <Icon name={k.icon as any} size={22} className="opacity-70" />
                <div>
                  <p className="text-2xl font-700 tabular-nums leading-tight">{k.value}</p>
                  <p className="text-xs opacity-80">{k.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Tabs + search ── */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex rounded-xl border border-border overflow-hidden text-sm">
              <button
                onClick={() => setTab('promotions')}
                className={`flex items-center gap-2 px-5 py-2.5 font-600 transition-colors ${tab === 'promotions' ? 'bg-primary text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}
              >
                <Icon name="TagIcon" size={15} />
                🏷️ Promotions
                {stats.discounts > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-700 ${tab === 'promotions' ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'}`}>
                    {stats.discounts}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTab('bundles')}
                className={`flex items-center gap-2 px-5 py-2.5 font-600 transition-colors ${tab === 'bundles' ? 'bg-primary text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}
              >
                <Icon name="CubeIcon" size={15} />
                📦 Offres groupées
                {stats.bundles > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-700 ${tab === 'bundles' ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'}`}>
                    {stats.bundles}
                  </span>
                )}
              </button>
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une promotion…"
              className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-56"
            />
          </div>

          {/* ── Content ── */}
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tabFiltered.length === 0 ? (
            <div className="bg-white border border-border rounded-2xl p-16 text-center">
              <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
                <Icon name="TagIcon" size={36} className="text-muted-foreground opacity-40" />
              </div>
              <p className="text-lg font-700 text-foreground mb-2">
                {promotions.length === 0 ? 'Aucune promotion créée' : 'Aucun résultat'}
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                {promotions.length === 0
                  ? 'Créez votre première promotion pour l\'afficher dans le POS et attirer vos clients !'
                  : 'Aucune promotion ne correspond à votre recherche.'}
              </p>
              {promotions.length === 0 && (
                <button
                  onClick={() => { setEditing(null); setShowForm(true); }}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 transition-opacity"
                >
                  <Icon name="PlusIcon" size={16} />
                  + Créer une promotion
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tabFiltered.map((p) => (
                <PromoCard
                  key={p.id}
                  p={p}
                  onToggle={() => handleToggleActive(p)}
                  onEdit={() => { setEditing(p); setShowForm(true); }}
                  onDelete={() => handleDelete(p.id)}
                  deleting={deleting === p.id}
                />
              ))}
            </div>
          )}

          {/* POS integration note */}
          {promotions.some((p) => p.is_active) && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <Icon name="InformationCircleIcon" size={16} className="text-blue-600 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-700">
                <span className="font-600">POS :</span> Les promotions actives s'affichent dans la caisse avec un badge rouge sur les produits concernés. Un onglet "Promos" permet d'y accéder rapidement.
              </p>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <PromoFormModal
          promo={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={loadPromotions}
        />
      )}
    </AppLayout>
  );
}
